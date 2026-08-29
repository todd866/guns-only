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
    const double StagedFightCeilingM = MergeAltitudeM + 60.0 + 2500.0;
    const double MetresPerNm = 1852.0;
    const double ReengageRangeMForTests = 3500.0;
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

    static double Rad(double degrees) => degrees * System.Math.PI / 180.0;

    [Fact]
    public void NeutralMergeHandoffKeepsTheAuthoredEnergyReferenceAfterRunInAcceleration() {
        // Tape 488: the neutral Flanker accelerated throughout the powered 17-second run-in.
        // ReactiveBandit was then constructed from that fast handoff state and mistook an
        // otherwise healthy 316-knot post-break fighter for an energy emergency. It flew cold for
        // 12.5 seconds, opened beyond 3.6 km, and returned as another head-on pass. Energy doctrine
        // is authored against the staged corner speed, so that reference must cross the handoff
        // independently of the same physical aircraft's instantaneous speed.
        BeatSetup beat = Beats.ModernVisualMerge();
        var merge = Assert.IsType<NeutralMergeBandit>(beat.CreateBandit());
        double stagedSpeedMps = merge.State.Speed;
        var player = new AircraftSim(beat.Player, beat.PlayerAir);
        var straight = new PilotCommand(1.0, 0.0, 1.0, 0.0);

        for (int tick = 0;
            tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete;
            tick++) {
            merge.Step(ActorObservation.Capture(player.State, tick), Dt);
            player.Step(straight, Dt);
        }

        Assert.True(merge.FirstPassComplete,
            "production reciprocal geometry never reached the reactive-pilot handoff");
        double handoffSpeedMps = merge.State.Speed;
        Assert.True(handoffSpeedMps > stagedSpeedMps * 1.20,
            $"fixture did not reproduce material run-in acceleration: staged "
            + $"{stagedSpeedMps:F1} m/s, handoff {handoffSpeedMps:F1} m/s");
        Assert.Equal(System.Math.Max(180.0, stagedSpeedMps),
            merge.FightEnergyReferenceSpeedMpsForTest!.Value, precision: 10);
        Assert.NotEqual(handoffSpeedMps,
            merge.FightEnergyReferenceSpeedMpsForTest.Value, precision: 3);
    }

    [Fact]
    public void AuthoredMergeReferenceDoesNotCallAHealthyPostBreakSpeedAnEmergency() {
        double stagedSpeedMps = BeatSetup.CornerTrueAirspeedMps(
            BanditAir, MergeAltitudeM);
        double acceleratedHandoffSpeedMps = stagedSpeedMps * 1.40;
        double postBreakSpeedMps = stagedSpeedMps * 0.78;
        Assert.True(postBreakSpeedMps > stagedSpeedMps * (112.0 / 180.0));
        Assert.True(postBreakSpeedMps
            < acceleratedHandoffSpeedMps * (112.0 / 180.0));

        var postBreak = new AircraftState(
            new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
            postBreakSpeedMps, 0.0, 0.0, 0.0, BanditAir.MassKg);
        var player = new AircraftState(
            new Vec3D(0.0, MergeAltitudeM + 60.0, 2_000.0),
            220.0, 0.0, 0.0, 0.0, PlayerAir.MassKg);
        var authored = new ReactiveBandit(postBreak, BanditAir, PilotSkill.Ace,
            energyReferenceSpeedMps: stagedSpeedMps);
        var inflated = new ReactiveBandit(postBreak, BanditAir, PilotSkill.Ace,
            energyReferenceSpeedMps: acceleratedHandoffSpeedMps);

        ActorObservation observation = ActorObservation.Capture(player, 1);
        authored.Step(observation, Dt);
        inflated.Step(observation, Dt);

        Assert.Equal(BanditTactic.Acquire, authored.Tactic);
        Assert.Equal(BanditTactic.Energy, inflated.Tactic);
    }

    [Fact]
    public void LookaheadVerticalPenaltyIsQuietInBandAndProportionalAboveIt() {
        Assert.Equal(0.0, ReactiveBandit.LookaheadVerticalExcursionPenalty(
            Rad(20.0), Rad(44.0), Rad(20.0), Rad(43.0)), precision: 10);
        Assert.Equal(0.0, ReactiveBandit.LookaheadVerticalExcursionPenalty(
            Rad(20.0), Rad(54.0), Rad(20.0), Rad(54.0)), precision: 10);
        Assert.Equal(0.0, ReactiveBandit.LookaheadVerticalExcursionPenalty(
            Rad(70.0), Rad(70.0), Rad(40.0), Rad(40.0)), precision: 10);

        double fiveDegreeExcursion =
            ReactiveBandit.LookaheadVerticalExcursionPenalty(
                Rad(50.0), Rad(60.0), Rad(50.0), Rad(60.0));
        Assert.Equal((30.0 + 40.0) * Rad(5.0),
            fiveDegreeExcursion, precision: 10);
    }

    [Fact]
    public void LookaheadVerticalPenaltyStaysSmoothAcrossTheFixedCap() {
        double newCrossing = ReactiveBandit.LookaheadVerticalExcursionPenalty(
            Rad(55.0), Rad(61.0), Rad(55.0), Rad(58.0));
        Assert.Equal(
            30.0 * Rad(3.0) + 40.0 * Rad(6.0),
            newCrossing, precision: 10);

        double alreadySteepButFlattening =
            ReactiveBandit.LookaheadVerticalExcursionPenalty(
                Rad(65.0), Rad(67.0), Rad(55.0), Rad(55.0));
        Assert.Equal(40.0 * Rad(2.0),
            alreadySteepButFlattening, precision: 10);
        Assert.True(alreadySteepButFlattening < newCrossing,
            "an already-steep aircraft must be free to choose the rollout that flattens it");
    }

    [Fact]
    public void LookaheadVerticalPenaltyCapsButDoesNotFightARequiredSteepPursuit() {
        // Catching a genuinely steep contact may use the relaxed lane up to the fixed 60-degree
        // hard boundary. A new crossing beyond it remains decisive even when the contact is
        // steeper; otherwise a human dive silently waives the same limit hardware acceptance
        // enforces on the bandit.
        Assert.Equal(0.0, ReactiveBandit.LookaheadVerticalExcursionPenalty(
            Rad(20.0), Rad(59.0), Rad(20.0), Rad(59.0), Rad(70.0)),
            precision: 10);
        Assert.Equal((30.0 + 40.0) * Rad(1.0),
            ReactiveBandit.LookaheadVerticalExcursionPenalty(
                Rad(20.0), Rad(61.0), Rad(20.0), Rad(61.0), Rad(70.0)),
            precision: 10);

        // The allowance is directional, not a blanket waiver: an ordinary contact or a loop in
        // the opposite direction still pays the hard/new-excursion terms.
        Assert.Equal((30.0 + 40.0) * Rad(17.0),
            ReactiveBandit.LookaheadVerticalExcursionPenalty(
                Rad(42.0), Rad(72.0), Rad(42.0), Rad(72.0), Rad(34.0)),
            precision: 10);
        Assert.True(ReactiveBandit.LookaheadVerticalExcursionPenalty(
            0.0, 0.0, Rad(-61.0), Rad(-61.0), Rad(70.0)) > 0.0);

        // Tape 418's closest steep-direction match still differed by about 35 degrees, so it
        // remains outside the bounded 25-degree lead margin.
        Assert.True(ReactiveBandit.LookaheadVerticalExcursionPenalty(
            Rad(-40.0), Rad(-40.0), Rad(-72.0), Rad(-72.0), Rad(-37.0)) > 10.0);
    }

    [Fact]
    public void ClosedLoopFightDoesNotBecomeRepeatedVerticalLoops() {
        // Tape 418: after the neutral merge handed off to this controller, the target spent
        // 25.3 seconds beyond 45 degrees of flight path and 10.4 seconds beyond 60, alternating
        // between +77 and -73 degrees. Fly the same F-22/Su-27 staging against a reacting pilot;
        // useful vertical manoeuvring remains allowed, but repeated ballistic loops do not.
        double playerCornerMps = BeatSetup.CornerTrueAirspeedMps(PlayerAir, MergeAltitudeM);
        var player = new SyntheticPilot(
            new AircraftState(new Vec3D(1280.0, MergeAltitudeM, -4500.0),
                playerCornerMps, 0.0, 0.0, 0.0, PlayerAir.MassKg),
            PlayerAir, PilotProfile.Competent);
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(1520.0, MergeAltitudeM + 60.0, 4500.0),
                BeatSetup.CornerTrueAirspeedMps(BanditAir, MergeAltitudeM),
                0.0, System.Math.PI, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);

        bool merged = false;
        double maximumAbsGammaDeg = 0.0;
        int steepTicks = 0, currentSteepTicks = 0, longestSteepTicks = 0;
        for (int tick = 0; tick < 180 * AircraftSim.TickHz; tick++) {
            AircraftState playerState = player.State;
            AircraftState banditState = bandit.State;
            bandit.Step(ActorObservation.Capture(playerState, tick), Dt);
            player.Step(banditState, Dt);

            double rangeM = Geometry.Range(bandit.State, player.State);
            if (!merged && rangeM < 2000.0) merged = true;
            if (!merged) continue;

            double absGammaDeg = System.Math.Abs(
                bandit.State.Gamma * 180.0 / System.Math.PI);
            maximumAbsGammaDeg = System.Math.Max(maximumAbsGammaDeg, absGammaDeg);
            if (absGammaDeg > 60.0) {
                steepTicks++;
                currentSteepTicks++;
                longestSteepTicks = System.Math.Max(longestSteepTicks, currentSteepTicks);
            } else {
                currentSteepTicks = 0;
            }
        }

        Assert.True(merged, "closed-loop fixture never reached the merge");
        Assert.True(maximumAbsGammaDeg < 65.0
                && steepTicks * Dt < 2.0
                && longestSteepTicks * Dt < 1.0,
            $"post-merge bandit reached {maximumAbsGammaDeg:F1} deg, spent "
            + $"{steepTicks * Dt:F1} s beyond 60 deg, and held the longest steep leg for "
            + $"{longestSteepTicks * Dt:F1} s");
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
    public void ClosePlayerCannotDragTheLookaheadBanditIntoTheStratosphere() {
        // Browser-player regression: the fight stayed inside 3.5 km, so the lookahead path treated
        // it as an engagement and discarded SelectTactic's ceiling Return. Both aircraft spiralled
        // from the 10,000-ft merge to 50,000 ft while remaining close, which evaded every range-
        // based runaway assertion. Keep a climbing contact close and ahead; the opponent must hold
        // the authored fight band even when following would improve short-horizon nose geometry.
        var bandit = StagedBandit();
        double maximumAltitudeM = bandit.State.Position.Y;
        double gammaAtMaximumDeg = 0.0, speedAtMaximumMps = bandit.State.Speed;
        PilotCommand commandAtMaximum = default;
        bool recoveryWasActive = false;
        int recoveryEntries = 0, recoveryBankReversals = 0;
        double previousRecoveryBank = 0.0;
        for (int tick = 0; tick <= 180 * AircraftSim.TickHz; tick++) {
            AircraftState own = bandit.State;
            var player = new AircraftState(
                own.Position + new Vec3D(0.0, 260.0, 900.0),
                250.0, 0.0, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            bool recoveryActive = bandit.CloseCeilingRecoveryActiveForTest;
            if (recoveryActive && !recoveryWasActive) {
                recoveryEntries++;
            }
            double recoveryBank = bandit.LastCommand.BankTarget;
            if (recoveryActive && recoveryWasActive
                && System.Math.Abs(recoveryBank) > 0.8
                && System.Math.Abs(previousRecoveryBank) > 0.8
                && System.Math.Sign(recoveryBank) != System.Math.Sign(previousRecoveryBank)) {
                recoveryBankReversals++;
            }
            if (recoveryActive) previousRecoveryBank = recoveryBank;
            recoveryWasActive = recoveryActive;
            if (bandit.State.Position.Y > maximumAltitudeM) {
                maximumAltitudeM = bandit.State.Position.Y;
                gammaAtMaximumDeg = bandit.State.Gamma * 180.0 / System.Math.PI;
                speedAtMaximumMps = bandit.State.Speed;
                commandAtMaximum = bandit.LastCommand;
            }
        }

        Assert.True(maximumAltitudeM < 6_200.0,
            $"close pursuit climbed to {maximumAltitudeM:F0} m instead of holding the "
            + $"10,000-ft visual-merge fight band; peak gamma={gammaAtMaximumDeg:F1} deg, "
            + $"speed={speedAtMaximumMps:F0} m/s, command={commandAtMaximum}");
        Assert.InRange(recoveryEntries, 1, 5);
        Assert.True(recoveryBankReversals == 0,
            $"close ceiling recovery reversed its deep bank {recoveryBankReversals} times — "
            + "the supposedly latched slice is chattering");
    }

    [Fact]
    public void CloseZoomArmsOnProjectedApexBelowTheLatchResetAltitude() {
        // Tape 473 reached 4,393 m at 62.3 degrees while its ballistic apex was already near
        // 7,000 m. The predictive gate was true, but the earlier "below ceiling - 1,200 m" reset
        // branch suppressed it until the aircraft crossed 4,408 m. A close vertical contact
        // recreates that contradiction: projected breach must arm recovery even while the
        // aircraft is still below the ordinary latch-retention band.
        var bandit = StagedBandit();
        double entryAltitudeM = double.NaN;
        double entryProjectedApexM = double.NaN;

        for (int tick = 0; tick <= 90 * AircraftSim.TickHz; tick++) {
            AircraftState own = bandit.State;
            var verticalContact = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                250.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(verticalContact, tick), Dt);
            if (bandit.CloseCeilingRecoveryActiveForTest) {
                double climbMps = System.Math.Max(0.0, own.VelocityVector().Y);
                entryAltitudeM = own.Position.Y;
                entryProjectedApexM = own.Position.Y
                    + climbMps * climbMps / (2.0 * FlightModel.G0);
                break;
            }
        }

        Assert.False(double.IsNaN(entryAltitudeM),
            "close vertical fixture never armed ceiling recovery");
        Assert.True(entryAltitudeM < StagedFightCeilingM - 1200.0,
            $"recovery waited until {entryAltitudeM:F0} m and let the latch reset suppress "
            + "the projected breach");
        Assert.True(entryProjectedApexM > StagedFightCeilingM,
            $"fixture projected only {entryProjectedApexM:F0} m and did not prove predictive entry");
    }

    [Fact]
    public void CloseCeilingRecoveryPreventsBreachOrHandsOffUntilAltitudeIsSafe() {
        // The second browser pass entered a steep zoom at close range, crossed through 1 km, then
        // opened beyond 3.5 km. Range used to clear the close latch at that exact crossing. The
        // opponent consequently levelled at 6,760 m and flew away instead of finishing its slice.
        // First create the close predictive entry, then move the observed contact outside the
        // close gate while both aircraft are above the authored line. The close latch must hand
        // its fixed slice side to the far/high recovery instead of dropping back into pursuit.
        // The production trace entered around 314 m/s. A 300 m/s fixture remains representative:
        // stronger predictive recovery may prevent the breach altogether, while any future
        // carry-through still has to satisfy the handoff assertions below.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        int tick = 0;
        for (; tick <= 180 * AircraftSim.TickHz
            && !bandit.CloseCeilingRecoveryActiveForTest; tick++) {
            AircraftState own = bandit.State;
            var closePlayer = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                250.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(closePlayer, tick), Dt);
        }

        Assert.True(bandit.CloseCeilingRecoveryActiveForTest,
            "fixture never entered close ceiling recovery");
        int recoverySide = System.Math.Sign(bandit.LastCommand.BankTarget);
        double maximumAltitudeM = bandit.State.Position.Y;

        // The range handoff is only dangerous once vertical momentum has actually carried the
        // aircraft through the line. Below it, opening is allowed to return to ordinary rejoin.
        int openingDeadlineTick = tick + (int)(30 * AircraftSim.TickHz);
        for (; tick <= openingDeadlineTick
            && bandit.State.Position.Y <= StagedFightCeilingM; tick++) {
            AircraftState own = bandit.State;
            var closePlayer = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                250.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(closePlayer, tick), Dt);
            maximumAltitudeM = System.Math.Max(maximumAltitudeM, bandit.State.Position.Y);
        }
        if (bandit.State.Position.Y <= StagedFightCeilingM) {
            // Earlier projected-apex entry can now prevent the breach altogether. That is
            // stronger than the fallback handoff this fixture originally needed; retain the
            // remainder for any future airframe which still carries through the line.
            Assert.True(maximumAltitudeM < StagedFightCeilingM,
                $"predictive recovery touched {maximumAltitudeM:F0} m instead of staying "
                + "inside the authored fight volume");
            return;
        }

        AircraftState atOpening = bandit.State;
        var openingPlayer = new AircraftState(
            new Vec3D(atOpening.Position.X, 6200.0, atOpening.Position.Z + 3800.0),
            250.0, 0.0, atOpening.Chi, 0.0, PlayerAir.MassKg);
        bandit.Step(ActorObservation.Capture(openingPlayer, tick++), Dt);

        Assert.True(bandit.HardCeilingRecoveryActiveForTest,
            "opening through 3.5 km cleared recovery instead of handing it to the far latch");
        Assert.Equal(recoverySide, System.Math.Sign(bandit.LastCommand.BankTarget));

        bool recoveredIntoBand = false;
        for (int recoveryTick = 0; recoveryTick < 60 * AircraftSim.TickHz; recoveryTick++) {
            AircraftState own = bandit.State;
            var highPlayer = new AircraftState(
                new Vec3D(own.Position.X, 6200.0, own.Position.Z + 3800.0),
                250.0, 0.0, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(highPlayer, tick++), Dt);
            maximumAltitudeM = System.Math.Max(maximumAltitudeM, bandit.State.Position.Y);
            if (!bandit.CloseCeilingRecoveryActiveForTest
                && !bandit.HardCeilingRecoveryActiveForTest
                && bandit.State.Position.Y < StagedFightCeilingM - 250.0) {
                recoveredIntoBand = true;
                break;
            }
        }

        Assert.True(maximumAltitudeM < 6_200.0,
            $"range handoff carried close recovery to {maximumAltitudeM:F0} m");
        Assert.True(recoveredIntoBand,
            $"close recovery remained at {bandit.State.Position.Y:F0} m instead of returning "
            + "inside the authored fight band");
    }

    [Fact]
    public void CloseCeilingRecoveryDoesNotDropAboveTheLineWhenAnInBandContactOpens() {
        // A high contact transfers the close latch to hard recovery. An in-band contact cannot
        // make that transfer, but range must not erase recovery while the bandit itself is still
        // above the authored ceiling. That left the opponent high and soft-rejoining in browser
        // play even though the player had already come back down into the fight volume.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        int tick = 0;
        for (; tick <= 180 * AircraftSim.TickHz
            && !bandit.CloseCeilingRecoveryActiveForTest; tick++) {
            AircraftState own = bandit.State;
            var closePlayer = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                250.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(closePlayer, tick), Dt);
        }
        Assert.True(bandit.CloseCeilingRecoveryActiveForTest,
            "fixture never entered close ceiling recovery");

        int crossingDeadlineTick = tick + (int)(30 * AircraftSim.TickHz);
        for (; tick <= crossingDeadlineTick
            && bandit.State.Position.Y <= StagedFightCeilingM; tick++) {
            AircraftState own = bandit.State;
            var closePlayer = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                250.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(closePlayer, tick), Dt);
        }
        if (bandit.State.Position.Y <= StagedFightCeilingM) {
            // Preventing the breach makes an above-line latch handoff unnecessary and satisfies
            // the stronger form of this containment contract.
            Assert.False(bandit.HardCeilingRecoveryActiveForTest);
            return;
        }

        AircraftState atOpening = bandit.State;
        var openingPlayer = new AircraftState(
            new Vec3D(atOpening.Position.X, StagedFightCeilingM - 200.0,
                atOpening.Position.Z + 3800.0),
            250.0, 0.0, atOpening.Chi, 0.0, PlayerAir.MassKg);
        bandit.Step(ActorObservation.Capture(openingPlayer, tick++), Dt);

        Assert.True(bandit.CloseCeilingRecoveryActiveForTest,
            "in-band contact erased recovery while the bandit remained above the ceiling");
        Assert.False(bandit.HardCeilingRecoveryActiveForTest,
            "in-band contact incorrectly armed the far/high recovery latch");

        bool recoveredIntoBand = false;
        for (int recoveryTick = 0; recoveryTick < 60 * AircraftSim.TickHz; recoveryTick++) {
            AircraftState own = bandit.State;
            var inBandPlayer = new AircraftState(
                new Vec3D(own.Position.X, StagedFightCeilingM - 200.0,
                    own.Position.Z + 3800.0),
                250.0, 0.0, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(inBandPlayer, tick++), Dt);
            if (!bandit.CloseCeilingRecoveryActiveForTest
                && bandit.State.Position.Y < StagedFightCeilingM) {
                recoveredIntoBand = true;
                break;
            }
        }

        Assert.True(recoveredIntoBand,
            $"bandit stayed at {bandit.State.Position.Y:F0} m instead of finishing its recovery "
            + "into the authored fight band");
    }

    [Fact]
    public void CeilingRecoveryPreventsBreachOrRecommitsBeforeAHighSpeedSternChase() {
        // Browser regression, 2026-08-28: containment worked, but the recovery then held 0.70 G,
        // 43 degrees of bank and 85% power while descending through the release band. The Su-27
        // accelerated from roughly 329 to 352 m/s and made the 500-knot player chase it for 25.6 s
        // as range opened 5.7 -> 8.4 km. Recreate the handoff, then put a constant-257 m/s player
        // 5.7 km abeam, matching the recorded roughly 90-degree post-crossing aspect. Recovery is
        // allowed one quick reversal; it is not allowed an extension.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        int tick = 0;

        // Predictive close entry, followed by the same close-to-far handoff as the browser pass.
        for (; tick < 90 * AircraftSim.TickHz
            && !bandit.CloseCeilingRecoveryActiveForTest; tick++) {
            AircraftState own = bandit.State;
            var closePlayer = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                257.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(closePlayer, tick), Dt);
        }
        Assert.True(bandit.CloseCeilingRecoveryActiveForTest,
            "fixture never entered predictive close recovery");

        for (int deadline = tick + (int)(30 * AircraftSim.TickHz);
            tick < deadline && bandit.State.Position.Y <= StagedFightCeilingM; tick++) {
            AircraftState own = bandit.State;
            var closePlayer = new AircraftState(
                own.Position + new Vec3D(0.0, 1900.0, 900.0),
                257.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(closePlayer, tick), Dt);
        }
        if (bandit.State.Position.Y <= StagedFightCeilingM) {
            // Predictive containment now arrests this 300 m/s fixture before the historical
            // close-to-far handoff. No stern chase can be created by a recovery that never leaves
            // the authored volume; the remainder still guards a future carry-through case.
            Assert.False(bandit.HardCeilingRecoveryActiveForTest);
            return;
        }

        Vec3D horizontalForward = new Vec3D(
            System.Math.Sin(bandit.State.Chi), 0.0,
            System.Math.Cos(bandit.State.Chi));
        Vec3D horizontalRight = new Vec3D(
            horizontalForward.Z, 0.0, -horizontalForward.X);
        var player = new AircraftState(
            bandit.State.Position + horizontalRight * 5700.0 + new Vec3D(0.0, 650.0, 0.0),
            257.0, 0.0, bandit.State.Chi, 0.0, PlayerAir.MassKg);
        bandit.Step(ActorObservation.Capture(player, tick++), Dt);
        Assert.True(bandit.HardCeilingRecoveryActiveForTest,
            "opening contact cleared recovery instead of entering the far/high handoff");

        double initialBanditSpeedMps = bandit.State.Speed;
        double initialRangeM = Geometry.Range(bandit.State, player);
        double previousRangeM = initialRangeM;
        double maximumRangeM = initialRangeM;
        double maximumBanditSpeedMps = bandit.State.Speed;
        double minimumBanditSpeedMps = bandit.State.Speed;
        double maximumRecoverySpeedMps = bandit.State.Speed;
        double minimumRecoverySpeedMps = bandit.State.Speed;
        double maximumFightCentreRadiusM = 0.0;
        int openingTicks = 0, longestOpeningTicks = 0;
        int hardRecoveryTicks = 0;
        bool reclosed = false;
        for (int chaseTick = 0; chaseTick < 45 * AircraftSim.TickHz; chaseTick++) {
            player = player with {
                Position = player.Position + player.ForwardDir() * (player.Speed * Dt)
            };
            bandit.Step(ActorObservation.Capture(player, tick++), Dt);
            double rangeM = Geometry.Range(bandit.State, player);
            bool opening = rangeM > previousRangeM + 0.02;
            openingTicks = opening ? openingTicks + 1 : 0;
            longestOpeningTicks = System.Math.Max(longestOpeningTicks, openingTicks);
            maximumRangeM = System.Math.Max(maximumRangeM, rangeM);
            maximumFightCentreRadiusM = System.Math.Max(maximumFightCentreRadiusM,
                System.Math.Sqrt(
                    bandit.State.Position.X * bandit.State.Position.X
                    + bandit.State.Position.Z * bandit.State.Position.Z));
            maximumBanditSpeedMps = System.Math.Max(maximumBanditSpeedMps,
                bandit.State.Speed);
            maximumFightCentreRadiusM = System.Math.Max(maximumFightCentreRadiusM,
                System.Math.Sqrt(
                    bandit.State.Position.X * bandit.State.Position.X
                    + bandit.State.Position.Z * bandit.State.Position.Z));
            minimumBanditSpeedMps = System.Math.Min(minimumBanditSpeedMps,
                bandit.State.Speed);
            if (bandit.HardCeilingRecoveryActiveForTest) {
                hardRecoveryTicks++;
                maximumRecoverySpeedMps = System.Math.Max(maximumRecoverySpeedMps,
                    bandit.State.Speed);
                minimumRecoverySpeedMps = System.Math.Min(minimumRecoverySpeedMps,
                    bandit.State.Speed);
            }
            if (rangeM < maximumRangeM - 250.0) reclosed = true;
            previousRangeM = rangeM;
        }

        double longestOpeningS = longestOpeningTicks * Dt;
        Assert.True(longestOpeningS < 12.0,
            $"ceiling recovery forced {longestOpeningS:F1} s of continuous stern chase "
            + $"({initialRangeM:F0} -> {maximumRangeM:F0} m); speed "
            + $"{minimumBanditSpeedMps:F0}-{maximumBanditSpeedMps:F0} m/s, hard recovery "
            + $"{hardRecoveryTicks * Dt:F1} s, last command {bandit.LastCommand}");
        Assert.True(reclosed,
            $"bandit never recommitted after recovery; range peaked at {maximumRangeM:F0} m");
        // This adversarial fixture keeps translating the player for the full 45 seconds after a
        // 5.7 km abeam handoff, so some fight-centre drift is expected. It must still remain well
        // inside the 15 km abandon boundary while the player-relative range is being reclaimed.
        Assert.True(maximumFightCentreRadiusM < 12_000.0,
            $"post-ceiling recommit drifted {maximumFightCentreRadiusM:F0} m from the fight "
            + "centre while solving the chase");
        Assert.True(maximumRecoverySpeedMps < player.Speed + 25.0,
            $"ceiling recovery accelerated the training opponent from "
            + $"{initialBanditSpeedMps:F0} to {maximumRecoverySpeedMps:F0} m/s against a "
            + "257 m/s player");
        Assert.True(minimumRecoverySpeedMps < player.Speed + 15.0,
            $"recovery never scrubbed its {initialBanditSpeedMps:F0} m/s entry speed into the "
            + $"player's fighting band; minimum was {minimumRecoverySpeedMps:F0} m/s");
    }

    [Fact]
    public void OpeningReengageAtBrowserSpeedTurnsBackWithMarginForAGunPresentation() {
        // The ceiling fix shortened the recorded chase from 25.6 to 15.2 seconds, but the next
        // hardware pass exposed the ordinary re-engage cycle underneath it: after every close pass
        // the opponent accelerated through 350 m/s, opened to 5.5-6.2 km, then spent the rest of
        // the sortie drawing another oval. There was never a gun presentation. Stage the same
        // 160-degree, 300-vs-257 m/s opening just outside the live 3.5 km latch. A training opponent
        // must trade its excess speed for a prompt turn, not merely arrive at the 15-second gate.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        var player = new AircraftState(
            new Vec3D(1200.0, MergeAltitudeM + 60.0, -3500.0),
            257.0, 0.0, 0.0, 0.0, PlayerAir.MassKg);

        double initialRangeM = Geometry.Range(bandit.State, player);
        double previousRangeM = initialRangeM;
        double maximumRangeM = initialRangeM;
        double minimumRangeM = initialRangeM;
        double speedAtMaximumRangeMps = bandit.State.Speed;
        int openingTicks = 0, longestOpeningTicks = 0;
        bool sawReengage = false, reclosed = false;
        for (int tick = 0; tick < 35 * AircraftSim.TickHz; tick++) {
            player = player with {
                Position = player.Position + player.ForwardDir() * (player.Speed * Dt)
            };
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            sawReengage |= bandit.Tactic == BanditTactic.Return;
            double rangeM = Geometry.Range(bandit.State, player);
            minimumRangeM = System.Math.Min(minimumRangeM, rangeM);
            openingTicks = rangeM > previousRangeM + 0.02
                ? openingTicks + 1
                : 0;
            longestOpeningTicks = System.Math.Max(longestOpeningTicks, openingTicks);
            if (rangeM > maximumRangeM) {
                maximumRangeM = rangeM;
                speedAtMaximumRangeMps = bandit.State.Speed;
            }
            if (rangeM < maximumRangeM - 250.0) reclosed = true;
            previousRangeM = rangeM;
        }

        double longestOpeningS = longestOpeningTicks * Dt;
        Assert.True(sawReengage,
            "fixture never entered the opening Return/Reengage dispatch");
        Assert.True(longestOpeningS < 10.0,
            $"ordinary re-engage opened for {longestOpeningS:F1} s instead of leaving a gun-"
            + $"presentation margin; range {initialRangeM:F0} -> {maximumRangeM:F0} m");
        Assert.True(speedAtMaximumRangeMps < 300.0,
            $"bandit still carried {speedAtMaximumRangeMps:F0} m/s at maximum opening range "
            + $"against a {player.Speed:F0} m/s player");
        Assert.True(reclosed,
            $"bandit never took back 250 m after peaking at {maximumRangeM:F0} m");
        Assert.True(minimumRangeM < BanditFireControl.MaximumRangeM,
            $"re-engage bottomed out at {minimumRangeM:F0} m and never entered gun range");
    }

    [Fact]
    public void HighEnergyPostPassRecommitsBeforeTheOrdinaryLeashRange() {
        // Tape 438, 145.10 s: after a close crossing the Su-27 was already 1.9 km away and
        // opening at roughly 240 kt, with 351 m/s against a 265 kt player. Because the bandit was
        // still inside the ordinary 3.5 km leash, SelectTactic's Return intent was discarded and
        // the lookahead was allowed to fly another high-energy oval. The gap opened for 19.8 s to
        // 6.25 km. This is already a separation, not useful close BFM: scrub the excess speed and
        // begin the player-relative reversal before it turns into a stern chase.
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        var capturedBanditState = new AircraftSim(
            new AircraftState(new Vec3D(5053.5, 1621.5, -3038.5),
                351.0, Rad(-40.0), Rad(133.0), 0.0, BanditAir.MassKg),
            BanditAir).State;
        bandit.AdoptExternalKinematicsForTest(capturedBanditState);
        // Production hands the reactive pilot an already-running engine. Without this seed the
        // fixture's first idle command snaps thrust to zero and overstates the available braking.
        bandit.SeedEnginePowerFraction(1.05);
        var player = new AircraftState(
            new Vec3D(5675.8, 2549.1, -1508.8),
            265.0 / AirData.MpsToKnots, Rad(-32.88), Rad(270.95),
            Rad(-100.94), PlayerAir.MassKg);

        double initialRangeM = Geometry.Range(bandit.State, player);
        double initialFightCentreRadiusM = System.Math.Sqrt(
            bandit.State.Position.X * bandit.State.Position.X
            + bandit.State.Position.Z * bandit.State.Position.Z);
        double previousRangeM = initialRangeM;
        double maximumRangeM = initialRangeM;
        double maximumFightCentreRadiusM = initialFightCentreRadiusM;
        int openingTicks = 0, longestOpeningTicks = 0;
        bool earlyRecommit = false;
        PilotCommand firstCommand = default;
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            double rangeM = Geometry.Range(bandit.State, player);
            if (tick == 0) {
                firstCommand = bandit.LastCommand;
                earlyRecommit = bandit.Tactic == BanditTactic.Return
                    && bandit.LastCommand.Throttle == 0.0;
            }
            openingTicks = rangeM > previousRangeM + 0.02
                ? openingTicks + 1
                : 0;
            longestOpeningTicks = System.Math.Max(longestOpeningTicks, openingTicks);
            maximumRangeM = System.Math.Max(maximumRangeM, rangeM);
            maximumFightCentreRadiusM = System.Math.Max(maximumFightCentreRadiusM,
                System.Math.Sqrt(
                    bandit.State.Position.X * bandit.State.Position.X
                    + bandit.State.Position.Z * bandit.State.Position.Z));
            previousRangeM = rangeM;
            player = player with {
                Position = player.Position + player.ForwardDir() * (player.Speed * Dt)
            };
        }

        Assert.True(earlyRecommit,
            $"high-energy post-pass stayed in {bandit.Tactic} instead of immediately scrubbing "
            + $"and recommitting; first command was {firstCommand}");
        Assert.True(longestOpeningTicks * Dt < 12.0,
            $"post-pass opened continuously for {longestOpeningTicks * Dt:F1} s "
            + $"({initialRangeM:F0} -> {maximumRangeM:F0} m)");
        Assert.True(maximumRangeM < ReengageRangeMForTests,
            $"post-pass reached {maximumRangeM:F0} m before turning back");
        double finalFightCentreRadiusM = System.Math.Sqrt(
            bandit.State.Position.X * bandit.State.Position.X
            + bandit.State.Position.Z * bandit.State.Position.Z);
        Assert.True(maximumFightCentreRadiusM < 8_000.0
                && finalFightCentreRadiusM < ReturnRadiusMForTests,
            $"player-relative reversal failed to converge on the fight volume: radius "
            + $"{initialFightCentreRadiusM:F0} -> max {maximumFightCentreRadiusM:F0} -> final "
            + $"{finalFightCentreRadiusM:F0} m");
    }

    [Fact]
    public void HighEnergyPostPassInsideArenaAlsoRecommitsEarly() {
        // Tape 439, 133.68 s: the same extension began inside the 5.2 km arena, so SelectTactic
        // correctly remained Acquire. At 1.59 km the bandit was opening at 772 kt, yet the planner
        // commanded 9 G, 94 degrees of bank and full power until range reached 5.85 km.
        var terrain = GunsOnly.Web.UkraineTerrainTruth.Load()
            ?? throw new InvalidOperationException("Top Gun terrain truth was not embedded");
        var fightCentre = new Vec3D(1495.679, 3149.008, 9.513);
        var bandit = new ReactiveBandit(
            new AircraftState(fightCentre,
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace, terrain);
        // The evidence stream did not expose opponent bank, but adjacent 20 Hz positions put the
        // non-gravitational acceleration about 86 degrees around the flight path; that is also
        // consistent with the recorded 93.861-degree bank command. Starting wings-level adds an
        // artificial roll delay to a captured state which was already pulling through the pass.
        var capturedBanditState = new AircraftSim(
            new AircraftState(new Vec3D(-518.155, 1894.291, -3672.103),
                337.19, Rad(-46.64), Rad(-28.00), Rad(86.0), BanditAir.MassKg),
            BanditAir).State;
        bandit.AdoptExternalKinematicsForTest(capturedBanditState);
        bandit.SeedEnginePowerFraction(1.05);
        var player = new AircraftState(
            new Vec3D(763.311, 2840.086, -3738.634),
            402.77 / AirData.MpsToKnots, Rad(-3.29), Rad(133.43),
            Rad(111.97), PlayerAir.MassKg);

        double initialRadiusM = System.Math.Sqrt(
            (bandit.State.Position.X - fightCentre.X)
                * (bandit.State.Position.X - fightCentre.X)
            + (bandit.State.Position.Z - fightCentre.Z)
                * (bandit.State.Position.Z - fightCentre.Z));
        Assert.True(initialRadiusM < ReturnRadiusMForTests,
            $"fixture began outside the arena at {initialRadiusM:F0} m");
        Assert.Equal(BanditTactic.Acquire, bandit.Tactic);

        double initialRangeM = Geometry.Range(bandit.State, player);
        double previousRangeM = initialRangeM;
        double maximumRangeM = initialRangeM;
        double minimumTerrainClearanceM = double.PositiveInfinity;
        int openingTicks = 0, longestOpeningTicks = 0;
        PilotCommand firstCommand = default;
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            if (tick == 0) firstCommand = bandit.LastCommand;
            double rangeM = Geometry.Range(bandit.State, player);
            openingTicks = rangeM > previousRangeM + 0.02
                ? openingTicks + 1
                : 0;
            longestOpeningTicks = System.Math.Max(longestOpeningTicks, openingTicks);
            maximumRangeM = System.Math.Max(maximumRangeM, rangeM);
            previousRangeM = rangeM;
            Assert.True(terrain.TryHeightM(
                bandit.State.Position.X, bandit.State.Position.Z, out double floorM));
            minimumTerrainClearanceM = System.Math.Min(minimumTerrainClearanceM,
                bandit.State.Position.Y - floorM);
            player = player with {
                Position = player.Position + player.ForwardDir() * (player.Speed * Dt)
            };
        }

        Assert.True(firstCommand.Throttle == 0.0
                && firstCommand.GDemand >= 8.5,
            $"inside-arena post-pass did not immediately pull and scrub: {firstCommand}");
        Assert.True(longestOpeningTicks * Dt < 12.0,
            $"inside-arena post-pass opened for {longestOpeningTicks * Dt:F1} s "
            + $"({initialRangeM:F0} -> {maximumRangeM:F0} m)");
        // At this late captured sample the range is already opening at 397 m/s. Even an immediate
        // aerodynamically limited 9 G reversal carries roughly 250 m through the nominal 3.5 km
        // handoff; pin the absence of the old 5.85 km oval without asking the Su-27 to teleport.
        Assert.True(maximumRangeM < ReengageRangeMForTests + 500.0,
            $"inside-arena post-pass reached {maximumRangeM:F0} m before turning back");
        Assert.True(minimumTerrainClearanceM > 60.0,
            $"post-pass reversal bottomed out at {minimumTerrainClearanceM:F0} m AGL");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NoseHighPostPassRollsBeforePullingWithoutLosingTheRecommit(
        bool pressureRole) {
        // Tape 440, 20.3167 s: the 1.4 km handoff fixed the chase, but the new hard reversal
        // inherited Tape 438's nose-low max-G law while already climbing through 25.9 degrees.
        // At only eight degrees of actual bank that was almost pure pitch-up: the bandit reached
        // 86.73 degrees and stayed beyond 60 for 4.32 seconds. Preserve the same fight centre,
        // terrain, running engine and captured geometry. Pressure is the formation primary's
        // independent pursuit law, so it must produce the same anti-runaway response.
        var terrain = GunsOnly.Web.UkraineTerrainTruth.Load()
            ?? throw new InvalidOperationException("Top Gun terrain truth was not embedded");
        var fightCentre = new Vec3D(1495.786, 3148.868, 19.120);
        var bandit = new ReactiveBandit(
            new AircraftState(fightCentre,
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace, terrain);
        var capturedBanditState = new AircraftSim(
            new AircraftState(new Vec3D(1401.909, 3267.386, -624.444),
                285.55, Rad(25.873), Rad(-163.920), Rad(8.0), BanditAir.MassKg),
            BanditAir).State;
        bandit.AdoptExternalKinematicsForTest(capturedBanditState);
        bandit.SeedEnginePowerFraction(1.05);
        var player = new AircraftState(
            new Vec3D(1585.525, 3196.085, 768.381),
            472.53 / AirData.MpsToKnots, Rad(8.80), Rad(48.57),
            Rad(76.81), PlayerAir.MassKg);
        if (pressureRole) {
            bandit.AcceptFormationDirective(new FormationDirective(
                FormationTacticalRole.Pressure,
                LateralSign: 0,
                PartnerId: 2,
                AssignmentSequence: 1,
                SharedContact: ActorObservation.Capture(player, sourceTick: 0)));
        }

        double initialRangeM = Geometry.Range(bandit.State, player);
        double maximumRangeM = initialRangeM;
        double maximumAbsGammaDeg = 0.0;
        double minimumTerrainClearanceM = double.PositiveInfinity;
        int currentSteepTicks = 0, longestSteepTicks = 0;
        bool reclosed = false;
        PilotCommand firstCommand = default;
        var trace = new System.Collections.Generic.List<string>();
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            if (tick == 0) firstCommand = bandit.LastCommand;
            double rangeM = Geometry.Range(bandit.State, player);
            maximumRangeM = System.Math.Max(maximumRangeM, rangeM);
            if (rangeM < maximumRangeM - 250.0) reclosed = true;
            double absGammaDeg = System.Math.Abs(
                bandit.State.Gamma * 180.0 / System.Math.PI);
            maximumAbsGammaDeg = System.Math.Max(maximumAbsGammaDeg, absGammaDeg);
            currentSteepTicks = absGammaDeg > 60.0 ? currentSteepTicks + 1 : 0;
            longestSteepTicks = System.Math.Max(longestSteepTicks, currentSteepTicks);
            Assert.True(terrain.TryHeightM(
                bandit.State.Position.X, bandit.State.Position.Z, out double floorM));
            minimumTerrainClearanceM = System.Math.Min(minimumTerrainClearanceM,
                bandit.State.Position.Y - floorM);
            if (tick % AircraftSim.TickHz == 0) {
                Vec3D lineToPlayer = (player.Position - bandit.State.Position).Normalized();
                double noseErrorDeg = System.Math.Acos(System.Math.Clamp(
                    bandit.State.ForwardDir().Dot(lineToPlayer), -1.0, 1.0))
                    * 180.0 / System.Math.PI;
                trace.Add($"t={tick * Dt:F0} r={rangeM:F0} gamma="
                    + $"{absGammaDeg:F0} bank={bandit.State.Bank * 180.0 / System.Math.PI:F0} "
                    + $"nose={noseErrorDeg:F0} cmd={bandit.LastCommand}");
            }
            player = player with {
                Position = player.Position + player.ForwardDir() * (player.Speed * Dt)
            };
        }

        Assert.True(firstCommand.Throttle == 0.0
                && System.Math.Abs(firstCommand.BankTarget) > 1.3
                && firstCommand.GDemand <= 1.1,
            $"nose-high post-pass loaded before establishing its recovery plane: {firstCommand}");
        Assert.True(maximumAbsGammaDeg < 30.0
                && longestSteepTicks * Dt < 0.5,
            $"nose-high post-pass reached {maximumAbsGammaDeg:F1} deg and held beyond 60 for "
            + $"{longestSteepTicks * Dt:F2} s; " + string.Join(" | ", trace));
        // The captured frame is already opening at 924 kt. Allow the finite turn to peak beyond
        // the ordinary 3.5 km handoff, but keep a meaningful margin inside the 5.2 km arena and
        // prove it has taken back real range before the fixture ends.
        Assert.True(maximumRangeM < ReengageRangeMForTests + 1_000.0 && reclosed,
            $"vertical guard lost the recommit: range {initialRangeM:F0} -> "
            + $"{maximumRangeM:F0} m, final {Geometry.Range(bandit.State, player):F0} m, "
            + $"reclosed={reclosed}, gamma={bandit.State.Gamma * 180.0 / System.Math.PI:F1}, "
            + $"max gamma={maximumAbsGammaDeg:F1}, speed={bandit.State.Speed:F0}, "
            + $"tactic={bandit.Tactic}, command={bandit.LastCommand}; "
            + string.Join(" | ", trace));
        Assert.True(minimumTerrainClearanceM > 120.0,
            $"nose-high recovery bottomed out at {minimumTerrainClearanceM:F0} m AGL");
    }

    [Fact]
    public void DescendingPostPassHandsOffAfterArrestInsteadOfPullingThroughVertical() {
        // Tape 442 entered the close post-pass latch while descending at -38 degrees, so the
        // entry-only vertical flag was false. The ordinary 9-G re-engage arrested the opening and
        // put the player inside the forward cone, but the latch was allowed to persist because its
        // completion test incorrectly depended on that stale entry flag. It then pulled through
        // 77.5 degrees and remained beyond 60 for 3.29 seconds. Start from the final 20 Hz frame
        // before that production handoff and preserve the observed player-relative geometry.
        var terrain = GunsOnly.Web.UkraineTerrainTruth.Load()
            ?? throw new InvalidOperationException("Top Gun terrain truth was not embedded");
        var fightCentre = new Vec3D(1495.786, 3148.868, 19.120);
        var bandit = new ReactiveBandit(
            new AircraftState(fightCentre,
                300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace, terrain);
        var capturedBanditState = new AircraftSim(
            new AircraftState(new Vec3D(1681.590, 2540.816, 1169.535),
                268.99, Rad(-38.405), Rad(-38.929), Rad(-73.55),
                BanditAir.MassKg), BanditAir).State;
        bandit.AdoptExternalKinematicsForTest(capturedBanditState);
        bandit.SeedEnginePowerFraction(1.05);
        var player = new AircraftState(
            new Vec3D(957.897, 3347.821, 282.278),
            360.13 / AirData.MpsToKnots, Rad(-10.40), Rad(186.92),
            Rad(-109.68), PlayerAir.MassKg);

        double initialRangeM = Geometry.Range(bandit.State, player);
        double maximumRangeM = initialRangeM;
        double maximumAbsGammaDeg = 0.0;
        double minimumTerrainClearanceM = double.PositiveInfinity;
        int currentSteepTicks = 0, longestSteepTicks = 0;
        bool reclosed = false;
        bool handedBackToBfm = false;
        PilotCommand firstCommand = default;
        var trace = new System.Collections.Generic.List<string>();
        for (int tick = 0; tick < 22 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            if (tick == 0) firstCommand = bandit.LastCommand;
            double rangeM = Geometry.Range(bandit.State, player);
            maximumRangeM = System.Math.Max(maximumRangeM, rangeM);
            if (rangeM < maximumRangeM - 250.0) reclosed = true;
            handedBackToBfm |= bandit.Tactic == BanditTactic.Acquire;
            double absGammaDeg = System.Math.Abs(
                bandit.State.Gamma * 180.0 / System.Math.PI);
            maximumAbsGammaDeg = System.Math.Max(maximumAbsGammaDeg, absGammaDeg);
            currentSteepTicks = absGammaDeg > 60.0 ? currentSteepTicks + 1 : 0;
            longestSteepTicks = System.Math.Max(longestSteepTicks, currentSteepTicks);
            Assert.True(terrain.TryHeightM(
                bandit.State.Position.X, bandit.State.Position.Z, out double floorM));
            minimumTerrainClearanceM = System.Math.Min(minimumTerrainClearanceM,
                bandit.State.Position.Y - floorM);
            if (tick % AircraftSim.TickHz == 0) {
                trace.Add($"t={tick * Dt:F0} r={rangeM:F0} gamma="
                    + $"{bandit.State.Gamma * 180.0 / System.Math.PI:F0} "
                    + $"bank={bandit.State.Bank * 180.0 / System.Math.PI:F0} "
                    + $"tactic={bandit.Tactic} cmd={bandit.LastCommand}");
            }
            player = player with {
                Position = player.Position + player.ForwardDir() * (player.Speed * Dt)
            };
        }

        Assert.True(firstCommand.Throttle == 0.0 && firstCommand.GDemand >= 8.5,
            $"captured post-pass did not enter the high-energy recommit: {firstCommand}");
        Assert.True(handedBackToBfm,
            "nose-hot arrested post-pass never handed back to ordinary BFM; "
            + string.Join(" | ", trace));
        Assert.True(maximumAbsGammaDeg < 60.0 && longestSteepTicks == 0,
            $"descending-entry recommit looped through {maximumAbsGammaDeg:F1} degrees "
            + $"and stayed beyond 60 for {longestSteepTicks * Dt:F2} s; "
            + string.Join(" | ", trace));
        Assert.True(maximumRangeM < ReengageRangeMForTests + 1_000.0 && reclosed,
            $"descending-entry recommit lost the fight: range {initialRangeM:F0} -> "
            + $"{maximumRangeM:F0} m, final {Geometry.Range(bandit.State, player):F0} m; "
            + string.Join(" | ", trace));
        Assert.True(minimumTerrainClearanceM > 120.0,
            $"descending-entry recovery bottomed out at {minimumTerrainClearanceM:F0} m AGL");
    }

    [Fact]
    public void DescendingEntryReevaluatesPostPassModeAsGeometryChanges() {
        // Pin the two state-machine seams directly. Tape 442's production trajectory eventually
        // escaped the stale mode even before the fix, so a long end-state assertion alone cannot
        // prove ownership changed at the correct instant.
        var terrain = GunsOnly.Web.UkraineTerrainTruth.Load()
            ?? throw new InvalidOperationException("Top Gun terrain truth was not embedded");
        var fightCentre = new Vec3D(1495.786, 3148.868, 19.120);

        (ReactiveBandit Bandit, AircraftState Player) ArmDescendingLatch() {
            var staged = new ReactiveBandit(
                new AircraftState(fightCentre,
                    300.0, 0.0, 0.0, 0.0, BanditAir.MassKg),
                BanditAir, PilotSkill.Ace, terrain);
            var captured = new AircraftSim(
                new AircraftState(new Vec3D(1681.590, 2540.816, 1169.535),
                    268.99, Rad(-38.405), Rad(-38.929), Rad(-73.55),
                    BanditAir.MassKg), BanditAir).State;
            staged.AdoptExternalKinematicsForTest(captured);
            staged.SeedEnginePowerFraction(1.05);
            var observedPlayer = new AircraftState(
                new Vec3D(957.897, 3347.821, 282.278),
                360.13 / AirData.MpsToKnots, Rad(-10.40), Rad(186.92),
                Rad(-109.68), PlayerAir.MassKg);
            staged.Step(ActorObservation.Capture(observedPlayer, sourceTick: 0), Dt);
            Assert.True(staged.Tactic == BanditTactic.Return
                    && staged.LastCommand.Throttle == 0.0
                    && staged.LastCommand.GDemand >= 8.5,
                $"fixture did not arm the descending post-pass latch: {staged.Tactic}, "
                + staged.LastCommand);
            return (staged, observedPlayer);
        }

        // Once range rate is arrested and the player is nose-hot, the latch's work is done even
        // though this instance entered while descending and therefore never owned vertical mode.
        var arrested = ArmDescendingLatch().Bandit;
        AircraftState arrestedOwn = arrested.State;
        var noseHotPlayer = new AircraftState(
            arrestedOwn.Position + arrestedOwn.ForwardDir() * 2_000.0,
            arrestedOwn.Speed, arrestedOwn.Gamma, arrestedOwn.Chi, 0.0,
            PlayerAir.MassKg);
        arrested.Step(ActorObservation.Capture(noseHotPlayer, sourceTick: 1), Dt);
        Assert.True(arrested.Tactic == BanditTactic.Acquire
                && !(arrested.LastCommand.Throttle == 0.0
                    && arrested.LastCommand.GDemand >= 8.5),
            $"nose-hot arrested latch retained forced re-engage: {arrested.Tactic}, "
            + arrested.LastCommand);

        // If it remains nose-cold and opening but climbs after entry, ownership must promote to
        // the 85-degree roll-before-pull plane. At zero actual bank its first command is one G;
        // the stale generic owner instead asks for 9 G at the 75-degree bank cap.
        var climbing = ArmDescendingLatch().Bandit;
        AircraftState latchedOwn = climbing.State;
        var climbingState = new AircraftSim(new AircraftState(
            latchedOwn.Position, 268.99, Rad(15.0), latchedOwn.Chi, 0.0,
            BanditAir.MassKg), BanditAir).State;
        climbing.AdoptExternalKinematicsForTest(climbingState);
        var openingPlayer = new AircraftState(
            climbingState.Position - climbingState.ForwardDir() * 2_000.0,
            150.0, climbingState.Gamma, climbingState.Chi, 0.0,
            PlayerAir.MassKg);
        climbing.Step(ActorObservation.Capture(openingPlayer, sourceTick: 1), Dt);
        Assert.True(climbing.Tactic == BanditTactic.Return
                && System.Math.Abs(climbing.LastCommand.BankTarget) > 1.45
                && climbing.LastCommand.GDemand <= 1.1,
            $"narrow climbing latch did not promote to roll-before-pull: {climbing.Tactic}, "
            + climbing.LastCommand);

        // A near-zero range-rate sample is not permission to give that nose-high jet back to the
        // loaded generic plane while it is still nose-cold. This used to make vertical ownership
        // alternate on either side of the 5 m/s deadband.
        climbing.AdoptExternalKinematicsForTest(climbingState);
        var arrestedBehindPlayer = openingPlayer with { Speed = climbingState.Speed };
        climbing.Step(ActorObservation.Capture(arrestedBehindPlayer, sourceTick: 2), Dt);
        Assert.True(climbing.Tactic == BanditTactic.Return
                && System.Math.Abs(climbing.LastCommand.BankTarget) > 1.45
                && climbing.LastCommand.GDemand <= 1.1,
            $"nose-high recovery dropped ownership at range-rate arrest: {climbing.Tactic}, "
            + climbing.LastCommand);

        // Tape 469 filled the missing quadrant: the descending-entry latch had already arrested
        // the opening before the still-nose-cold jet pitched above the recovery threshold. The old
        // promotion predicate required opening > 5 m/s, so it kept 9 G on the generic 75-degree
        // plane until range rate reversed again and carried the bandit through 74.7 degrees of
        // flight path. Start a fresh latch so this assertion proves closing geometry can enter the
        // roll-before-pull owner rather than inheriting it from the opening case above.
        var closingClimb = ArmDescendingLatch().Bandit;
        AircraftState closingLatchedOwn = closingClimb.State;
        var closingClimbState = new AircraftSim(new AircraftState(
            closingLatchedOwn.Position, 268.99, Rad(15.0), closingLatchedOwn.Chi, 0.0,
            BanditAir.MassKg), BanditAir).State;
        closingClimb.AdoptExternalKinematicsForTest(closingClimbState);
        var closingBehindPlayer = new AircraftState(
            closingClimbState.Position - closingClimbState.ForwardDir() * 2_000.0,
            350.0, closingClimbState.Gamma, closingClimbState.Chi, 0.0,
            PlayerAir.MassKg);
        closingClimb.Step(ActorObservation.Capture(closingBehindPlayer, sourceTick: 1), Dt);
        Assert.True(closingClimb.Tactic == BanditTactic.Return
                && System.Math.Abs(closingClimb.LastCommand.BankTarget) > 1.45
                && closingClimb.LastCommand.GDemand <= 1.1,
            $"closing nose-high recommit stayed on the loaded generic plane: "
            + $"{closingClimb.Tactic}, {closingClimb.LastCommand}");

        // Tape 462's range had already peaked, but taking back 250 m at 3.9 km and 60 degrees
        // nose-off was not a BFM handoff. Both aircraft were far from the original merge centre;
        // releasing here made ordinary Reengage clamp the real player to a spawn-side phantom and
        // pull the bandit through 86 degrees of gamma. Reproduce the latch's peak and recapture as
        // two deterministic authority frames, then prove it releases only into close, nose-hot BFM.
        var downrange = ArmDescendingLatch().Bandit;
        var peakState = new AircraftSim(new AircraftState(
            new Vec3D(15_000.0, 2_500.0, 0.0), 300.0, 0.0, 0.0,
            Rad(74.0), BanditAir.MassKg), BanditAir).State;
        downrange.AdoptExternalKinematicsForTest(peakState);
        var openingFarPlayer = new AircraftState(
            peakState.Position + new Vec3D(0.0, 0.0, -4_150.0),
            150.0, 0.0, 0.0, 0.0, PlayerAir.MassKg);
        downrange.Step(ActorObservation.Capture(openingFarPlayer, sourceTick: 1), Dt);
        Assert.True(downrange.HighEnergyPostPassRecommitActiveForTest,
            "the far opening frame did not preserve the player-relative post-pass owner");

        var recapturedState = new AircraftSim(new AircraftState(
            peakState.Position, 300.0, Rad(6.0), Rad(120.0),
            Rad(74.0), BanditAir.MassKg), BanditAir).State;
        downrange.AdoptExternalKinematicsForTest(recapturedState);
        var recapturedFarPlayer = new AircraftState(
            recapturedState.Position + new Vec3D(0.0, 0.0, -3_850.0),
            150.0, 0.0, 0.0, 0.0, PlayerAir.MassKg);
        downrange.Step(ActorObservation.Capture(recapturedFarPlayer, sourceTick: 2), Dt);
        Assert.True(downrange.HighEnergyPostPassRecommitActiveForTest,
            "a 250 m recapture outside 3.5 km dropped the raw-player owner onto the spawn phantom");
        Assert.Equal(BanditTactic.Return, downrange.Tactic);

        AircraftState closeOwn = downrange.State;
        var closeNoseHotPlayer = new AircraftState(
            closeOwn.Position + closeOwn.ForwardDir() * 3_300.0,
            closeOwn.Speed, closeOwn.Gamma, closeOwn.Chi, 0.0,
            PlayerAir.MassKg);
        downrange.Step(ActorObservation.Capture(closeNoseHotPlayer, sourceTick: 3), Dt);
        Assert.False(downrange.HighEnergyPostPassRecommitActiveForTest,
            "inside 3.5 km with arrested separation and a nose-hot player must hand to BFM");
        Assert.Equal(BanditTactic.Acquire, downrange.Tactic);
    }

    [Fact]
    public void HighRejoinCannotCarryTheLookaheadBanditThroughItsCeiling() {
        // Real browser regression, 2026-08-27: after an ordinary opening/rejoin phase the F-22
        // player was still above the Su-27. At 3,823 m range the bandit was already at 7,367 m,
        // 1,759 m beyond its 5,608 m fight ceiling, yet the lookahead path chose ReengageCommand
        // and climbed to 9,481 m before the close-only recovery could take control. Reproduce the
        // same boundary: hold a contact above and just OUTSIDE the 3.5 km close gate, then let it
        // rejoin inside. Vertical momentum accumulated during the far phase must not carry the
        // opponent kilometres through the authored fight band.
        var bandit = StagedBandit();
        const int FarRejoinSeconds = 90;
        double maximumAltitudeM = bandit.State.Position.Y;
        double altitudeAtCloseRejoinM = double.NaN;
        double gammaAtCloseRejoinDeg = double.NaN;
        double gammaAtMaximumDeg = double.NaN;
        double maximumAtSeconds = double.NaN;
        PilotCommand commandAtMaximum = default;
        bool sawReturnToRejoinBeforeHardRecovery = false;
        bool hardRecoveryWasActive = false;
        double hardRecoveryEntryAltitudeM = double.NaN;
        double hardRecoveryEntryGammaDeg = double.NaN;
        double hardRecoveryEntrySpeedMps = double.NaN;
        double firstReturnAltitudeM = double.NaN;
        double firstReturnGammaDeg = double.NaN;

        for (int tick = 0; tick <= 150 * AircraftSim.TickHz; tick++) {
            AircraftState own = bandit.State;
            bool farRejoin = tick < FarRejoinSeconds * AircraftSim.TickHz;
            var player = new AircraftState(
                own.Position + (farRejoin
                    ? new Vec3D(0.0, 1_900.0, 3_800.0)
                    : new Vec3D(0.0, 260.0, 900.0)),
                250.0, own.Gamma, own.Chi, 0.0, PlayerAir.MassKg);
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            if (bandit.HardCeilingRecoveryActiveForTest && !hardRecoveryWasActive) {
                hardRecoveryEntryAltitudeM = bandit.State.Position.Y;
                hardRecoveryEntryGammaDeg = bandit.State.Gamma * 180.0 / System.Math.PI;
                hardRecoveryEntrySpeedMps = bandit.State.Speed;
            }
            hardRecoveryWasActive = bandit.HardCeilingRecoveryActiveForTest;
            if (farRejoin && bandit.Tactic == BanditTactic.Return
                && !bandit.HardCeilingRecoveryActiveForTest)
                sawReturnToRejoinBeforeHardRecovery = true;
            if (farRejoin && bandit.Tactic == BanditTactic.Return
                && double.IsNaN(firstReturnAltitudeM)) {
                firstReturnAltitudeM = bandit.State.Position.Y;
                firstReturnGammaDeg = bandit.State.Gamma * 180.0 / System.Math.PI;
            }
            if (tick == FarRejoinSeconds * AircraftSim.TickHz) {
                altitudeAtCloseRejoinM = bandit.State.Position.Y;
                gammaAtCloseRejoinDeg = bandit.State.Gamma * 180.0 / System.Math.PI;
            }
            if (bandit.State.Position.Y > maximumAltitudeM) {
                maximumAltitudeM = bandit.State.Position.Y;
                gammaAtMaximumDeg = bandit.State.Gamma * 180.0 / System.Math.PI;
                maximumAtSeconds = tick * Dt;
                commandAtMaximum = bandit.LastCommand;
            }
        }

        Assert.True(sawReturnToRejoinBeforeHardRecovery,
            "the far phase never selected Return before hard recovery — this scenario does not "
            + "exercise the broken Return-to-Reengage dispatch");
        Assert.False(double.IsNaN(hardRecoveryEntryAltitudeM),
            "hard recovery never armed — a passing altitude bound would not prove the new path");
        Assert.True(maximumAltitudeM < 6_400.0,
            $"high rejoin carried the bandit to {maximumAltitudeM:F0} m (entered the close phase "
            + $"at {altitudeAtCloseRejoinM:F0} m / gamma {gammaAtCloseRejoinDeg:F1} deg) instead "
            + $"of arresting the hard ceiling breach; peak at {maximumAtSeconds:F1} s / gamma "
            + $"{gammaAtMaximumDeg:F1} deg / command {commandAtMaximum}; hard recovery entered "
            + $"at {hardRecoveryEntryAltitudeM:F0} m / gamma {hardRecoveryEntryGammaDeg:F1} deg / "
            + $"{hardRecoveryEntrySpeedMps:F0} m/s; Return first selected at "
            + $"{firstReturnAltitudeM:F0} m / gamma {firstReturnGammaDeg:F1} deg");
        Assert.True(bandit.State.Position.Y < 5_900.0,
            $"bandit ended at {bandit.State.Position.Y:F0} m instead of converging back into its "
            + "5,608 m fight band after the rejoin");
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

    /// A RIDGE INSIDE THE PATH-FLOOR LOOKAHEAD IS PART OF THE RE-ENGAGE GEOMETRY, NOT A DETAIL
    /// APPLIED AFTER THE DECISION.
    ///
    /// ReengageCommand resolves an aim point, gates the past-vertical dive slice on how far BELOW
    /// that aim the bandit sits, and then flies a command built from the aim. The floor sampled
    /// 900 m along the flight path re-raises the aim — so a gate computed before that raise can
    /// arm a 115-degree slice for a depression the flown command has already clamped away, and
    /// roll the jet past vertical at a ridge with the aim sitting 300 m above it. Predicate and
    /// command must read the same aim vector.
    [Fact]
    public void ReengageDoesNotSliceAtADepressionThePathFloorHasAlreadyClamped() {
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, 4200.0, 0.0),
                BeatSetup.CornerTrueAirspeedMps(BanditAir, 4200.0),
                0.0, System.Math.PI / 2.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace, new RidgeAhead());
        // 5.5 km out — beyond the 3.5 km re-engage latch, opening, still inside the fight volume
        // (so the aim is the player and not KeepAimInFightVolume's phantom), and 1,000 m over LOW
        // ground of its own, so it is a legitimate re-engage target and not a low-block hunt.
        var player = new AircraftState(new Vec3D(4500.0, 1000.0, 0.0), 300.0,
            0.0, System.Math.PI / 2.0, 0.0, PlayerAir.MassKg);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.Equal(BanditTactic.Return, bandit.Tactic);
        // The ridge puts the path floor at 2,500 m, so the FLOWN aim is clamped to 2,800 m —
        // 1,400 m under the bandit across 4.5 km, which is the shallow step-down the slice's own
        // gate says must keep the ordinary pursuit. Read against the unclamped 1,000 m aim it is
        // 3,200 m of depression and the gate armed: measured on the unfixed tree the command rolls
        // to 2.000 rad (115 deg, past vertical, at a ridge) instead of the ordinary 1.30 cap.
        Assert.True(System.Math.Abs(bandit.LastCommand.BankTarget) <= 1.30,
            $"re-engage rolled to {bandit.LastCommand.BankTarget:F2} rad — past the ordinary "
            + "1.30 cap, so the dive slice armed on a depression the path floor had removed");
    }

    /// THE DIVE SLICE IS A SPLIT-S, AND A SPLIT-S NEEDS AIR BELOW IT.
    ///
    /// The nose-high recovery slice gates its identical 2.0 rad (115 deg) roll behind real
    /// clearance and real speed, for the reason it documents: rolling the lift vector past
    /// vertical points the nose at the ground. The re-engage dive slice rolls exactly as far,
    /// deliberately downhill, and had no such gate — it leant on the terrain-recovery reflex to
    /// catch it afterwards, which is a reflex that documents itself as being wrong about a
    /// Split-S with air below. A reversal flown 1,200 m over the deck keeps the ordinary pursuit.
    [Fact]
    public void ReengageWillNotSliceInvertedWithoutTheClearanceToCompleteIt() {
        var bandit = new ReactiveBandit(
            new AircraftState(new Vec3D(0.0, 1200.0, 0.0),
                BeatSetup.CornerTrueAirspeedMps(BanditAir, 1200.0),
                0.0, -System.Math.PI / 2.0, 0.0, BanditAir.MassKg),
            BanditAir, PilotSkill.Ace);
        // Nose cold — a past-90-degree reversal, which is the geometry the slice owns — with the
        // player 4.5 km away, below, and still 500 m over the deck so this is no low-block hunt.
        var player = new AircraftState(new Vec3D(4500.0, 500.0, 0.0), 300.0,
            0.0, System.Math.PI / 2.0, 0.0, PlayerAir.MassKg);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.Equal(BanditTactic.Return, bandit.Tactic);
        Assert.True(System.Math.Abs(bandit.LastCommand.BankTarget) <= 1.30,
            $"re-engage rolled to {bandit.LastCommand.BankTarget:F2} rad with only 1,200 m of "
            + "air beneath it — that is a Split-S into the ground");
    }

    /// Flat ground everywhere except a ridge squarely inside the 900 m path-floor lookahead.
    sealed class RidgeAhead : GunsOnly.Sim.Environment.ITerrainSurface {
        public GunsOnly.Sim.Environment.TerrainBounds Bounds =>
            new(-1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM,
            out GunsOnly.Sim.Environment.TerrainSample sample) {
            double heightM = eastM is > 500.0 and < 1_300.0 ? 2_500.0 : 0.0;
            sample = new GunsOnly.Sim.Environment.TerrainSample(heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }
}
