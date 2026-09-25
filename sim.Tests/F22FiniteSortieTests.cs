using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class F22FiniteSortieTests {
    static AircraftState Close(double z, double speed, double chi, double mass) => new(
        new Vec3D(0.0, 5486.4, z), speed, 0.0, chi, 0.0, mass);

    static BeatSetup CappedFight() {
        BeatSetup source = Beats.ModernVisualMerge();
        return source with {
            Player = Close(0.0, 300.0, 0.0, source.PlayerAir.MassKg),
            Bandit = Close(160.0, 285.0, 0.0, source.BanditAir.MassKg),
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            VisualMergeEvaluation = null,
            Combat = source.CombatRules with { OpponentHitsToDefeat = 1 },
            ContinuousCombat = source.ContinuousCombat! with {
                ReplacementDelaySeconds = 0.2,
                MaximumFormationSize = 1,
            },
        };
    }

    static void FullStop(SimulationSession session) {
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        for (int i = 0; i < 8 * AircraftSim.TickHz
            && !session.PlayerSystems.AllGearDownAndLocked; i++)
            session.StepFixed();
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        var recovery = Assert.IsType<ConventionalRunwayRecoveryModel>(
            session.ConventionalRunwayRecovery);
        var runway = recovery.Runway;
        Vec3D velocity = runway.Forward * 74 + new Vec3D(0, -2.2, 0);
        session.Player.AdoptExternalKinematics(new AircraftState(
            runway.SurfacePoint(430) + new Vec3D(0, 1.85, 0), velocity.Length,
            Math.Asin(velocity.Y / velocity.Length), runway.HeadingRad, 0,
            session.Player.State.Mass,
            BodyAttitude: QuaternionD.FromFrame(
                runway.Right, new Vec3D(0, 1, 0), runway.Forward)));
        session.Controls.SetAnalogThrottleControl(0);
        for (int i = 0; i < 12_000
            && session.Lifecycle == SimulationSession.LifecycleState.Active; i++)
            session.StepFixed();
        Assert.Equal(RunwayRecoveryPhase.Recovered, recovery.Phase);
    }

    [Fact]
    public void NorthRunwayIsInsideTheStreamingRadius() {
        BeatSetup beat = Beats.ModernVisualMerge();
        ConventionalRunwayGeometry runway = Assert.IsType<ConventionalRunwayGeometry>(
            Assert.IsType<RecoveryPlan>(beat.RecoveryPlan).ConventionalRunway);
        double fromMergeM = Math.Sqrt(
            Math.Pow(runway.ThresholdPosition.X - beat.Player.Position.X, 2)
            + Math.Pow(runway.ThresholdPosition.Z - beat.Player.Position.Z, 2));
        Assert.InRange(fromMergeM, 8_000.0, 30_000.0);
        Assert.True(Math.Sqrt(
            runway.ThresholdPosition.X * runway.ThresholdPosition.X
            + runway.ThresholdPosition.Z * runway.ThresholdPosition.Z) < 48_000.0);
        Assert.True(Math.Sqrt(
            runway.FarEndPosition.X * runway.FarEndPosition.X
            + runway.FarEndPosition.Z * runway.FarEndPosition.Z) < 48_000.0);
        Assert.Equal(2, beat.ContinuousCombat!.MaximumEngagements);
        Assert.False(beat.CombatRules.PlayerInfiniteAmmo);
        Assert.Equal(480, beat.CombatRules.PlayerAmmo);
    }

    [Fact]
    public void RecoveredStopAfterTheCapIsVictory() {
        var session = new SimulationSession();
        session.StartBeat(CappedFight);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 40 * AircraftSim.TickHz && session.KillCount < 2; i++) {
            if (session.OpponentPresent && session.Bandit.State.Position.Z
                - session.Player.State.Position.Z > 400.0) {
                AircraftState bandit = session.Bandit.State;
                session.Player.AdoptExternalKinematics(bandit with {
                    Position = bandit.Position + new Vec3D(0, 0, -140),
                    Speed = bandit.Speed + 20,
                    Chi = 0,
                });
            }
            session.StepFixed();
        }
        Assert.Equal(2, session.KillCount);
        session.FeedKey(GKey.Trigger, false);
        for (int i = 0; i < 4 * AircraftSim.TickHz && !session.PlayerRtbActive; i++)
            session.StepFixed();
        Assert.True(session.PlayerRtbActive);
        FullStop(session);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
    }

    [Fact]
    public void BingoBeforeTheCapRecoversAsDiscontinued() {
        var session = new SimulationSession();
        session.StartBeat(CappedFight);
        session.Begin();
        Assert.Equal(0, session.KillCount);
        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.BingoFuel));
        FullStop(session);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
    }

    [Fact]
    public void MagazineStopsAtFourHundredEightyRounds() {
        var profile = GunProfiles.M61A2PublicDataSurrogate;
        var gun = new GunKill(480, hitsToKill: 100_000,
            profile.EffectiveHitRadiusM, profile);
        var own = new AircraftState(Vec3D.Zero, 200.0, 0.0, 0.0, 0.0, 1.0);
        var target = new GunTarget(1, new AircraftState(
            new Vec3D(0, 0, 800), 200.0, 0.0, 0.0, 0.0, 1.0));
        GunTarget[] targets = [target];
        double dt = 1.0 / AircraftSim.TickHz;
        gun.Step(true, own, 1, targets, dt);
        int burst = gun.RoundsFired;
        Assert.InRange(burst, 1, 5);
        Assert.Equal(480 - burst, gun.AmmoRemaining);

        for (int i = 0; i < 8 * AircraftSim.TickHz; i++)
            gun.Step(true, own, 1, targets, dt);
        Assert.Equal(480, gun.RoundsFired);
        Assert.Equal(0, gun.AmmoRemaining);
        gun.Step(true, own, 1, targets, dt);
        Assert.Equal(480, gun.RoundsFired);
    }

    [Fact]
    public void OverheadSpeaksOnlyApprovedClipsInTheRealExchange() {
        // Pilot "initial", tower "left break approved", pilot "base, three greens" once locked.
        // The break and final legs are silent: every spoken line is an owner-approved recording.
        var director = new MissionRadioDirector();
        double clock = 0;
        director.Step(Overhead(clock, ""));
        var heard = new List<string>();
        foreach (string gate in new[] { "initial", "break", "perch", "final" }) {
            for (int i = 0; i < 10; i++) {
                clock += 1;
                MissionRadioTransmission tx = director.Step(Overhead(clock, gate, gearDown: gate is "perch" or "final"));
                if (!string.IsNullOrEmpty(tx.Id) && (heard.Count == 0 || heard[^1] != tx.Id))
                    heard.Add(tx.Id);
            }
        }
        Assert.Equal(["pilot-initial", "tower-break-approved", "pilot-base"], heard);
    }

    [Fact]
    public void OverheadDoesNotReportThreeGreensWhileTheGearIsUp() {
        var director = new MissionRadioDirector();
        director.Step(Overhead(0, ""));
        for (int i = 0; i < 6; i++) {
            MissionRadioTransmission tx = director.Step(Overhead(3 + i, "perch", gearDown: false));
            Assert.NotEqual("pilot-base", tx.Id);
            Assert.DoesNotContain("three greens", tx.Text ?? "", StringComparison.OrdinalIgnoreCase);
        }
        MissionRadioTransmission locked = director.Step(Overhead(12, "perch", gearDown: true));
        for (int i = 0; i < 8 && locked.Id != "pilot-base"; i++)
            locked = director.Step(Overhead(13 + i, "perch", gearDown: true));
        Assert.Equal("pilot-base", locked.Id);
    }

    static MissionRadioState Overhead(double time, string gate, bool? gearDown = null) => new(
        TimeSeconds: time,
        MissionActive: true,
        RapierMissionAvailable: false,
        PatternOnly: false,
        RapierPhase: RapierMissionPhase.Unavailable,
        CatapultActive: false,
        PlayerLeg: "",
        Traffic: [],
        GearDownAndLocked: gearDown ?? gate is "perch" or "final",
        PlayerLandingIntent: CircuitLandingIntent.FullStop,
        LandingAuthorityAvailable: false,
        PilotGoingAround: false,
        RecoveryApproach: false,
        MaritimeRecovery: false,
        Recovery: Carrier.Recovery.Flying,
        ArrestmentPhase: ArrestmentModel.ArrestmentPhase.None,
        CaughtWire: 0,
        LsoCall: "",
        LsoSeverity: null,
        GunRoundsFired: 0,
        GunAmmoRemaining: 400,
        MissilesRemaining: 0,
        MissileInFlight: false,
        DronesRemaining: 0,
        Joker: false,
        Bingo: false,
        Events: [],
        ConventionalOverheadGate: gate);
}
