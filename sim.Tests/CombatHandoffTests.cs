using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public sealed class CombatHandoffTests {
    const long TargetA = 101;
    const long TargetB = 202;

    static AircraftState State(Vec3D position, double speed, double heading,
        double mass) => new(
            position, speed, 0.0, heading, 0.0, mass, QuaternionD.Identity);

    static BeatSetup HandoffFight(int opponentAmmo = 0,
        int opponentHitsToDefeat = 2) => new(
        "Combat handoff fixture",
        State(new Vec3D(0.0, 5000.0, 0.0), 220.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg),
        State(new Vec3D(0.0, 5000.0, 3000.0), 210.0, Math.PI,
            FlightModel.Su27SPublicDataSurrogate.MassKg),
        new PurePursuitLaw(),
        new() { (0.0, new PilotCommand(1.0, 0.0, 0.75, 0.0)) },
        PlayerParams: FlightModel.F22APublicDataSurrogate,
        BanditParams: FlightModel.Su27SPublicDataSurrogate,
        Combat: new CombatConfig(
            PlayerAmmo: 40,
            OpponentAmmo: opponentAmmo,
            PlayerHitsToDefeat: 3,
            OpponentHitsToDefeat: opponentHitsToDefeat,
            PlayerGun: GunProfiles.M61A2PublicDataSurrogate,
            OpponentGun: GunProfiles.GSh301PublicDataSurrogate),
        Fuel: new FuelConfig(
            CapacityLb: 12_000.0,
            InitialFuelLb: 8_000.0,
            BingoThresholdLb: 3_000.0,
            ConsumesFuel: false),
        PlayerCapability: AircraftCapability.F22ASurrogate,
        BanditCapability: AircraftCapability.Su27SSurrogate,
        ContinuousCombat: new ContinuousCombatConfig(
            ReplacementDelaySeconds: 0.1,
            MaximumFormationSize: 1));

    static SimulationSession StartHandoffFight(int opponentAmmo = 0,
        int opponentHitsToDefeat = 2) {
        var session = new SimulationSession();
        session.StartBeat(() => HandoffFight(opponentAmmo, opponentHitsToDefeat));
        session.Begin();
        return session;
    }

    static AircraftState SyntheticShooter() => State(
        Vec3D.Zero, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);

    static void ScoreOneHit(GunKill gun, long targetId) {
        int hitsBefore = gun.DamageFor(targetId).HitCount;
        AircraftState shooter = SyntheticShooter();
        AircraftState target = shooter with {
            Position = new Vec3D(0.0, -0.1, 100.0)
        };
        var targets = new[] { new GunTarget(targetId, target) };
        gun.Step(false, shooter, targetId, targets,
            gun.Profile.MaximumFlightSeconds + 0.1);
        gun.Step(true, shooter, targetId, targets, 0.0);
        for (int tick = 0; tick < AircraftSim.TickHz
            && gun.DamageFor(targetId).HitCount == hitsBefore; tick++)
            gun.Step(false, shooter, targetId, targets,
                SimulationSession.FixedDeltaSeconds);
        Assert.Equal(
            hitsBefore + 1, gun.DamageFor(targetId).HitCount);
    }

    static GunRound LaunchMiss(GunKill gun, long targetId) {
        AircraftState shooter = SyntheticShooter();
        AircraftState target = shooter with {
            Position = new Vec3D(1000.0, 0.0, 2500.0)
        };
        var targets = new[] { new GunTarget(targetId, target) };
        gun.Step(false, shooter, targetId, targets, 0.0);
        gun.Step(true, shooter, targetId, targets, 0.0);
        return Assert.Single(gun.RoundsInFlight);
    }

    static void AdvanceToReliefEngaged(SimulationSession session) {
        session.FeedKey(GKey.KnockItOff, true);
        Assert.Equal(CombatHandoffPhase.Requested, session.CombatHandoffPhase);
        for (int tick = 0; tick < 4
            && session.CombatHandoffPhase < CombatHandoffPhase.ReliefEngaged; tick++)
            session.StepFixed();
        Assert.Equal(
            CombatHandoffPhase.ReliefEngaged, session.CombatHandoffPhase);
        Assert.NotNull(session.Relief?.Gun);
    }

    [Fact]
    public void OnlyContinuousF22AcceptsRisingEdgeAndQuarantinesReport() {
        var unsupported = new SimulationSession(1);
        unsupported.Begin();
        unsupported.FeedKey(GKey.KnockItOff, true);
        Assert.Equal(
            CombatHandoffPhase.Unavailable, unsupported.CombatHandoffPhase);
        Assert.False(unsupported.CombatHandoffRequested);

        SimulationSession session = StartHandoffFight();
        string learnerBefore = session.ExportDirectorState();
        session.FeedKey(GKey.Trigger, true);
        int shotsAtHandoff = session.ShotsTotal;
        session.FeedKey(GKey.KnockItOff, true);

        Assert.Equal(CombatHandoffPhase.Requested, session.CombatHandoffPhase);
        Assert.True(session.CombatHandoffRequested);
        Assert.False(session.TriggerDown);
        Assert.False(session.PlayerWeaponsAuthorized);
        EngagementReport report = Assert.Single(session.EngagementReports);
        Assert.Equal(EngagementEndReason.PlayerHandoff, report.EndReason);
        Assert.Equal(SortieOutcome.None, report.Outcome);
        Assert.False(report.EligibleForLearning);
        Assert.Equal(learnerBefore, session.ExportDirectorState());

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.Trigger, true);
        Assert.Single(session.EngagementReports);
        Assert.Equal(shotsAtHandoff, session.ShotsTotal);
        Assert.False(session.TriggerDown);
    }

    [Fact]
    public void DrainPreservesOldRoundsThenAtomicallyTransfersPartialDamage() {
        SimulationSession session = StartHandoffFight(opponentAmmo: 10);
        GunKill playerGun = session.PlayerGun;
        long targetId = playerGun.SelectedTargetId;
        ScoreOneHit(playerGun, targetId);
        int playerAmmo = playerGun.AmmoRemaining;
        GunKill oldOpponentGun = session.OpponentGun;
        GunRound oldRound = LaunchMiss(oldOpponentGun, targetId: 0);

        session.FeedKey(GKey.KnockItOff, true);
        session.StepFixed();

        Assert.Equal(CombatHandoffPhase.Drain, session.CombatHandoffPhase);
        Assert.NotNull(session.Relief);
        Assert.Null(session.Relief!.Gun);
        Assert.Same(playerGun, session.PlayerGun);
        Assert.Equal(playerAmmo, session.PlayerGun.AmmoRemaining);
        GunRound advanced = Assert.Single(oldOpponentGun.RoundsInFlight);
        Assert.Equal(oldRound.Id, advanced.Id);
        Assert.True(advanced.AgeSeconds > oldRound.AgeSeconds);
        Assert.NotSame(
            oldOpponentGun,
            session.ReliefTargetingOpponentGunForTest(targetId));

        session.StepFixed();

        GunKill reliefGun = Assert.IsType<GunKill>(session.Relief.Gun);
        Assert.Equal(
            playerGun.DamageFor(targetId).HitCount,
            reliefGun.DamageFor(targetId).HitCount);
        Assert.Equal(0, reliefGun.RoundsFired);
        Assert.Same(playerGun, session.PlayerGun);
        Assert.Equal(playerAmmo, session.PlayerGun.AmmoRemaining);
    }

    [Fact]
    public void AirbornePlayerRoundHoldsDrainUntilItActuallyAgesOut() {
        SimulationSession session = StartHandoffFight();
        GunKill playerGun = session.PlayerGun;
        GunRound launched = LaunchMiss(playerGun, playerGun.SelectedTargetId);
        int ammoAfterLaunch = playerGun.AmmoRemaining;

        session.FeedKey(GKey.KnockItOff, true);
        session.StepFixed();

        Assert.Equal(CombatHandoffPhase.Drain, session.CombatHandoffPhase);
        Assert.Null(session.Relief!.Gun);
        Assert.True(playerGun.RoundsInFlight[0].AgeSeconds > launched.AgeSeconds);
        for (int tick = 0; tick < 4 * AircraftSim.TickHz
            && session.CombatHandoffPhase == CombatHandoffPhase.Drain; tick++)
            session.StepFixed();

        Assert.Equal(
            CombatHandoffPhase.ReliefEngaged, session.CombatHandoffPhase);
        Assert.Empty(playerGun.RoundsInFlight);
        Assert.Equal(ammoAfterLaunch, playerGun.AmmoRemaining);
        Assert.NotNull(session.Relief.Gun);
    }

    [Fact]
    public void ReliefKillIsSeparateAndPlayerStaysAliveThroughRecovery() {
        SimulationSession session = StartHandoffFight(
            opponentHitsToDefeat: 2);
        AdvanceToReliefEngaged(session);
        GunKill reliefGun = session.Relief!.Gun!;
        long targetId = session.PlayerGun.SelectedTargetId;
        ScoreOneHit(reliefGun, targetId);
        ScoreOneHit(reliefGun, targetId);

        session.StepFixed();
        Assert.Equal(1, session.ReliefKills);
        Assert.Equal(0, session.KillCount);
        Assert.Contains(session.RecentEvents, e =>
            e.Type == SessionEventType.Destroyed
            && e.Source == CombatRole.Relief
            && e.Target == CombatRole.Opponent);
        for (int tick = 0; tick < 4
            && session.CombatHandoffPhase != CombatHandoffPhase.ReliefComplete; tick++)
            session.StepFixed();

        Assert.Equal(
            CombatHandoffPhase.ReliefComplete, session.CombatHandoffPhase);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.True(session.PlayerRtbActive);
        Assert.True(session.CompletePlayerRecovery());
        Assert.True(session.CompletePlayerRecovery());
        Assert.Equal(CombatHandoffPhase.Recovered, session.CombatHandoffPhase);
        Assert.False(session.PlayerRtbActive);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }

    [Fact]
    public void ReliefLossNeverMutatesPlayerDamageAndRestartIsClean() {
        SimulationSession session = StartHandoffFight();
        AdvanceToReliefEngaged(session);
        session.StepFixed();
        Assert.Equal(CombatHandoffPhase.PlayerRtb, session.CombatHandoffPhase);
        int playerHits = session.PlayerHitsTaken;

        session.RecordReliefHitsForTest(
            session.Beat.CombatRules.PlayerHitsToDefeat);
        session.StepFixed();

        Assert.Equal(CombatHandoffPhase.ReliefLost, session.CombatHandoffPhase);
        Assert.Equal(playerHits, session.PlayerHitsTaken);
        Assert.Equal(0, session.KillCount);
        Assert.True(session.PlayerRtbActive);
        session.Restart();
        Assert.Equal(CombatHandoffPhase.Available, session.CombatHandoffPhase);
        Assert.False(session.CombatHandoffRequested);
        Assert.False(session.PlayerRtbActive);
        Assert.Null(session.Relief);
        Assert.Equal(0, session.ReliefKills);
        Assert.Empty(session.EngagementReports);
    }

    [Fact]
    public void MultiTargetFreshShooterTransferIsAtomicAndRejectsAirborneRounds() {
        var gun = new GunKill(
            ammo: 12,
            hitsToKill: 3,
            hitRadiusM: GunProfiles.M61A2PublicDataSurrogate.EffectiveHitRadiusM,
            profile: GunProfiles.M61A2PublicDataSurrogate);
        gun.RegisterTarget(TargetA);
        gun.RegisterTarget(TargetB);
        ScoreOneHit(gun, TargetA);
        ScoreOneHit(gun, TargetB);

        GunKill transfer = gun.CreateForFreshShooterAgainstTargets(
            new[] { TargetA, TargetB },
            TargetB,
            ammo: 30,
            hitRadiusM: GunProfiles.GSh301PublicDataSurrogate.EffectiveHitRadiusM,
            profile: GunProfiles.GSh301PublicDataSurrogate);

        Assert.Equal(1, transfer.DamageFor(TargetA).HitCount);
        Assert.Equal(1, transfer.DamageFor(TargetB).HitCount);
        Assert.Equal(TargetB, transfer.SelectedTargetId);
        Assert.Equal(30, transfer.AmmoRemaining);
        Assert.Equal(0, transfer.RoundsFired);
        Assert.Empty(transfer.RoundsInFlight);

        LaunchMiss(gun, TargetA);
        Assert.Throws<InvalidOperationException>(() =>
            gun.CreateForFreshShooterAgainstTargets(
                new[] { TargetA, TargetB },
                TargetA,
                30,
                GunProfiles.GSh301PublicDataSurrogate.EffectiveHitRadiusM,
                GunProfiles.GSh301PublicDataSurrogate));
    }
}
