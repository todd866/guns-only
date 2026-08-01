using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// THE BANDIT MAY NOT DECLINE THE FIGHT BY RUNNING.
///
/// Pilot report, production: a bandit opened to 7.0 NM at 81 kt closure and had to be run down in
/// a stern chase — in a guns-only sim, where there is nothing to shoot him with at that range.
/// Root cause: the anti-camp ceiling guard in <see cref="ReactiveBandit"/>.SelectTactic returned
/// early, so the 5.2 km arena leash was not merely loose while the player was high — it never ran
/// at all. These are the corridor tests for the leash and for the guard's hysteresis.
public class BanditArenaLeashTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double MergeAltitudeM = 3048.0;      // ModernVisualMerge staging: 10,000 ft
    const double MetresPerNm = 1852.0;
    /// Mirrors ReactiveBandit.ReturnRadiusM, which is private. If that constant moves, this test
    /// starts lying rather than failing, so keep them together.
    const double ReturnRadiusMForTests = 5200.0;

    static readonly AircraftParams BanditAir = FlightModel.Su27SPublicDataSurrogate;
    static readonly AircraftParams PlayerAir = FlightModel.F22APublicDataSurrogate;

    static ReactiveBandit StagedBandit() => new(
        new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
            BeatSetup.CornerTrueAirspeedMps(BanditAir, MergeAltitudeM),
            0.0, 0.0, 0.0, BanditAir.MassKg),
        BanditAir, PilotSkill.Ace);

    /// A player that holds altitude and chases in azimuth only — the lazy high stern chase from
    /// the report, not a pure-pursuit dive into the ground.
    static PilotCommand LevelChase(AircraftState player, in Vec3D banditPos, double holdAltM) {
        double bearing = System.Math.Atan2(banditPos.X - player.Position.X,
            banditPos.Z - player.Position.Z);
        double error = System.Math.Atan2(System.Math.Sin(bearing - player.Chi),
            System.Math.Cos(bearing - player.Chi));
        double bank = System.Math.Clamp(error * 2.0, -1.0, 1.0);
        double altError = holdAltM - player.Position.Y;
        double g = System.Math.Clamp(1.0 / System.Math.Cos(bank) + altError * 0.002, 0.5, 6.0);
        return new PilotCommand(g, bank, 1.0, 0.0);
    }

    [Fact]
    public void PlayerAboveTheFightCeilingCannotBeMadeToRunTheBanditDown() {
        // The reported geometry: the player sits at 15,067 ft — 441 ft over the old anti-camp
        // trigger — and chases at full power. The bandit must stay inside the arena.
        const double PlayerHoldM = 4592.0;
        var bandit = StagedBandit();
        var player = new AircraftSim(
            new AircraftState(new Vec3D(0.0, PlayerHoldM, -2000.0), 300.0, 0.0, 0.0, 0.0,
                PlayerAir.MassKg),
            PlayerAir);

        // MEASURE WHAT THE AI CONTROLS. Range to the player is a joint product of both aircraft: a
        // synthetic player holding 15,000 ft at full afterburner outruns a Flanker regardless of
        // what the bandit decides, so asserting on range would grade the probe, not the opponent.
        // Containment is the bandit's own radius from its fight centre — that is the leash.
        double maxRadiusM = 0.0;
        int outboundTicks = 0, longestOutboundTicks = 0;
        for (int tick = 0; tick <= 180 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player.State, tick), Dt);
            player.Step(LevelChase(player.State, bandit.State.Position, PlayerHoldM), Dt);
            var bp = bandit.State.Position;
            double radius = System.Math.Sqrt(bp.X * bp.X + bp.Z * bp.Z);
            maxRadiusM = System.Math.Max(maxRadiusM, radius);
            // The reported failure mode: nose pointed away from the player and opening. A bandit
            // reversing at long range points away for a few seconds by necessity — that is a turn,
            // not a run. Only a SUSTAINED outbound leg is the defect.
            var toPlayer = player.State.Position - bp;
            bool outbound = toPlayer.Length > 4.0 * MetresPerNm
                && bandit.State.ForwardDir().Dot(toPlayer.Normalized()) < -0.5;
            outboundTicks = outbound ? outboundTicks + 1 : 0;
            longestOutboundTicks = System.Math.Max(longestOutboundTicks, outboundTicks);
        }

        // DOCTRINE UPDATE 2026-08-01 (owner: "fleeing from the fight should never be an option ...
        // never abandon; always reengage"). The old cap of 6,200 m encoded "hold a fixed spawn
        // arena". The bandit now REENGAGES TOWARD THE PLAYER instead of returning to a spawn point,
        // so as the fight drifts it follows -- which is the point. The meaningful guard is no
        // longer a tight radius from a fixed centre; it is the nose-away assertion below (the
        // bandit must never point AWAY and open the range -- the actual "fleeing"). This bound is
        // now only a sanity limit against absurd wander (the reported 16 NM abandon), not a leash:
        // the bandit reengaging nose-on stays inside it while a stern-chase runner would not.
        Assert.True(maxRadiusM < 9_000.0,
            $"bandit wandered {maxRadiusM:F0} m from its fight centre — absurd wander, not a reengage");
        double longestOutboundS = longestOutboundTicks / (double)AircraftSim.TickHz;
        Assert.True(longestOutboundS < 15.0,
            $"bandit spent {longestOutboundS:F0} s continuously beyond 4 NM with its nose pointed "
            + "away from the player — that is the stern chase this corridor exists to prevent");
    }

    [Fact]
    public void ArenaLeashIsLiveWhileTheCeilingGuardIsExtending() {
        // The specific defect: the ceiling guard `return`ed before the radius check, so while the
        // player was high the leash never ran and the extension was unbounded.
        //
        // The fight centre is the bandit's own spawn, so it cannot start outside its arena — it
        // has to fly out. Arm the guard at t=0 (only possible where CombatCeilingM binds: the
        // guard needs own.Y > _ceilingM - 900), let the extension run, and require that crossing
        // 5,200 m from the fight centre selects Return rather than an open-ended run.
        var high = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, 11_000.0, 0.0), 300.0, 0.0, 0.0, 0.0,
                BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        var camper = new AircraftState(new Vec3D(0.0, 12_200.0, 500.0), 250.0, 0.0, 0.0, 0.0,
            PlayerAir.MassKg);

        bool armed = false, sawReturn = false;
        double maxRadiusM = 0.0, finalRadiusM = 0.0;
        for (int tick = 0; tick < 180 * AircraftSim.TickHz; tick++) {
            high.Step(ActorObservation.Capture(camper, tick), Dt);
            armed |= high.Tactic == BanditTactic.Energy;
            sawReturn |= high.Tactic == BanditTactic.Return;
            double dx = high.State.Position.X, dz = high.State.Position.Z;
            finalRadiusM = System.Math.Sqrt(dx * dx + dz * dz);
            maxRadiusM = System.Math.Max(maxRadiusM, finalRadiusM);
        }

        Assert.True(armed, "the ceiling guard never armed — this scenario proves nothing");
        Assert.True(sawReturn,
            $"extended to {maxRadiusM:F0} m from the fight centre without ever selecting Return");
        // CONVERGENCE, not a peak bound. The low-energy gate deliberately outranks the leash (a
        // slow bandit dragged into a nose-high return used to stall), so a genuinely slow extension
        // WILL overshoot 5,200 m before it recovers — and this scenario is staged at 11 km, the only
        // band where the ceiling guard can arm on the first tick, where thin air makes the recovery
        // slowest. Asserting a peak here would either be vacuous or would forbid the documented
        // behaviour. What containment actually means is that it comes home, so that is the assertion.
        Assert.True(finalRadiusM < ReturnRadiusMForTests,
            $"bandit ended {finalRadiusM:F0} m from its fight centre (peaked at {maxRadiusM:F0} m) "
            + "— the extension never converged back inside the leash");
    }

    [Fact]
    public void CeilingDenialDoesNotChatterAgainstItsOwnThreshold() {
        // Entry and exit shared one threshold on own.Y, so the bandit flipped Energy<->Acquire
        // every few seconds pinned to _ceilingM - 900 and never committed to the fight.
        //
        // THE GEOMETRY HAS TO ARM THE GUARD OR THIS TEST PROVES NOTHING. An earlier version of it
        // staged the player at 4,592 m against a bandit spawned at 3,108 m — but _ceilingM is
        // min(11500, max(3200, spawnY + 2500)) = 5,608 m, so the guard arms only above 5,958 m and
        // the player sat 1.4 km BELOW that. It passed with the single-threshold bug still in place.
        // The only band where the guard can arm at t=0 is where CombatCeilingM binds, because
        // arming also needs own.Y > _ceilingM - 900 and that is spawn + 1,600 m otherwise.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, 11_000.0, 0.0), 300.0, 0.0, 0.0, 0.0,
                BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        const double PlayerHoldM = 12_200.0;   // above _ceilingM (11,500) + 350
        var player = new AircraftSim(
            new AircraftState(new Vec3D(0.0, PlayerHoldM, -2000.0), 300.0, 0.0, 0.0, 0.0,
                PlayerAir.MassKg),
            PlayerAir);

        var last = bandit.Tactic;
        int transitions = 0;
        bool armed = false;
        for (int tick = 0; tick <= 180 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player.State, tick), Dt);
            player.Step(LevelChase(player.State, bandit.State.Position, PlayerHoldM), Dt);
            armed |= bandit.Tactic == BanditTactic.Energy;
            if (bandit.Tactic != last) { transitions++; last = bandit.Tactic; }
        }
        Assert.True(armed,
            "the ceiling guard never armed — the geometry does not exercise the hysteresis");
        // Pre-fix this scenario logged 12 flips in 180 s, most of them Energy<->Acquire inside a
        // few seconds of each other. Tactic changes are legitimate; oscillation is not.
        Assert.True(transitions <= 8,
            $"{transitions} tactic changes in 180 s — the ceiling guard is oscillating again");
    }

    [Fact]
    public void EnergyExtensionFromANoseHighAttitudeLosesAltitudeAndKeepsSpeed() {
        // The extension is supposed to trade height for speed. Entered nose-high it used to do the
        // exact opposite: -0.10 G at 40% power climbed 2,600 ft while bleeding 28 m/s.
        // AircraftState is (Position, Speed, Gamma, Chi, Bank, Mass) — a 0.5 rad CLIMB.
        // Staged below the low-energy gate (_energyEntryMps = 180 * 112/180 = 112 m/s when the
        // reference speed floors at 180) so Energy is selected on the first tick.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, MergeAltitudeM, 0.0),
                110.0, /* gamma */ 0.50, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);

        var camper = new AircraftState(new Vec3D(0.0, MergeAltitudeM + 600.0, 1500.0),
            250.0, 0.0, 0.0, 0.0, PlayerAir.MassKg);

        double startGamma = bandit.State.Gamma;
        double startSpeed = bandit.State.Speed;
        double lastBankCmd = 0.0;
        int rollReversals = 0, energyTicks = 0;
        double gammaAtExit = startGamma, speedAtExit = startSpeed;

        for (int tick = 0; tick < 12 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(camper, tick), Dt);
            if (bandit.Tactic != BanditTactic.Energy) break;
            energyTicks++;
            double bankCmd = bandit.LastCommand.BankTarget;
            if (tick > 0 && System.Math.Abs(bankCmd) > 0.2 && System.Math.Abs(lastBankCmd) > 0.2
                && System.Math.Sign(bankCmd) != System.Math.Sign(lastBankCmd)) rollReversals++;
            lastBankCmd = bankCmd;
            gammaAtExit = bandit.State.Gamma;
            speedAtExit = bandit.State.Speed;
        }

        Assert.True(energyTicks > AircraftSim.TickHz,
            "the extension never ran — this scenario proves nothing");
        // The singularity guard. Aiming the recovery roll at a point in the vertical plane below
        // the flight path made this alternate +1.35/-1.35 rad every tick: 359 reversals in 6 s, and
        // a jet that pitched to 79 degrees nose-up instead of recovering.
        Assert.True(rollReversals <= 2,
            $"recovery roll reversed direction {rollReversals} times — the bank solution is "
            + "singular again");
        Assert.True(gammaAtExit < startGamma,
            $"nose never came down: gamma {startGamma:F2} -> {gammaAtExit:F2} rad");
        Assert.True(speedAtExit > startSpeed,
            $"extension ended slower ({speedAtExit:F0} < {startSpeed:F0} m/s) — "
            + "it traded speed for height, which is backwards");
    }
}
