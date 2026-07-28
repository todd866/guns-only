using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public sealed class CombatHandoffTests {
    const long TargetA = 101;
    const long TargetB = 202;

    sealed class FlatTerrain(double heightM = 0.0) : ITerrainSurface {
        public TerrainBounds Bounds { get; } =
            new(-100_000.0, 100_000.0, -100_000.0, 100_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(
                heightM,
                new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static AircraftState State(Vec3D position, double speed, double heading,
        double mass) => new(
            position, speed, 0.0, heading, 0.0, mass, QuaternionD.Identity);

    static BeatSetup HandoffFight(int opponentAmmo = 0,
        int opponentHitsToDefeat = 2,
        bool usesReactiveBandit = false,
        int maximumFormationSize = 1,
        int playerAmmo = 40) => new(
        "Combat handoff fixture",
        State(new Vec3D(0.0, 5000.0, 0.0), 220.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg),
        State(new Vec3D(0.0, 5000.0, 3000.0), 210.0, Math.PI,
            FlightModel.Su27SPublicDataSurrogate.MassKg),
        new PurePursuitLaw(),
        new() { (0.0, new PilotCommand(1.0, 0.0, 0.75, 0.0)) },
        PlayerParams: FlightModel.F22APublicDataSurrogate,
        BanditParams: FlightModel.Su27SPublicDataSurrogate,
        UsesReactiveBandit: usesReactiveBandit,
        Combat: new CombatConfig(
            PlayerAmmo: playerAmmo,
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
            MaximumFormationSize: maximumFormationSize),
        BanditSkill: PilotSkill.Ace);

    static SimulationSession StartHandoffFight(int opponentAmmo = 0,
        int opponentHitsToDefeat = 2,
        bool usesReactiveBandit = false,
        int maximumFormationSize = 1,
        int playerAmmo = 40) {
        var session = new SimulationSession();
        session.StartBeat(() => HandoffFight(
            opponentAmmo,
            opponentHitsToDefeat,
            usesReactiveBandit,
            maximumFormationSize,
            playerAmmo));
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

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ActualHandoffContactSwitchInvalidatesPlannerWorkOffLane(
        bool completedPlan) {
        SimulationSession session = StartHandoffFight(
            usesReactiveBandit: true);
        session.SetAiComputeLevel(AiComputeLevel.Full);
        var planner = Assert.IsType<ReactiveBandit>(session.Bandit);

        bool reachedRequestedPlannerState = false;
        for (int tick = 0;
            tick < 2 * ReactiveBandit.LookaheadDecisionCadenceTicks;
            tick++) {
            AiWorkloadCounters before = planner.AiWorkload;
            session.StepFixed();
            AiWorkloadCounters delta = planner.AiWorkload - before;
            Assert.InRange(delta.CandidateEvaluations, 0, 2);

            reachedRequestedPlannerState = completedPlan
                ? planner.AiWorkload.PlansCompleted > 0
                : planner.AiWorkload.PlansStarted > 0
                    && planner.AiWorkload.PlansCompleted == 0;
            if (reachedRequestedPlannerState) break;
        }
        Assert.True(reachedRequestedPlannerState);

        AiWorkloadCounters workBeforeSwitch = planner.AiWorkload;
        long selectionBeforeSwitch =
            planner.DecisionTrace.SelectionSequence;
        session.FeedKey(GKey.KnockItOff, true);
        session.StepFixed();

        Assert.Equal(CombatHandoffPhase.Drain, session.CombatHandoffPhase);
        Assert.NotNull(session.Relief);
        // Player and relief can both be their class's first spawn. A safe hold here proves the
        // selected-contact identity includes its class rather than accidentally reusing "1".
        Assert.Equal(workBeforeSwitch, planner.AiWorkload);
        Assert.Equal(
            selectionBeforeSwitch + 1,
            planner.DecisionTrace.SelectionSequence);
        Assert.Equal(1, planner.DecisionTrace.CandidateCount);
        Assert.Equal(
            planner.LastCommand,
            planner.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void LiveReliefSharesComputeBudgetWorkloadAndTerrainInvalidation() {
        SimulationSession session = StartHandoffFight(
            usesReactiveBandit: true,
            maximumFormationSize: 2,
            playerAmmo: 0);
        session.SetAiComputeLevel(AiComputeLevel.Emergency);
        session.FeedKey(GKey.KnockItOff, true);
        session.StepFixed();

        var primary = Assert.IsType<ReactiveBandit>(session.Bandit);
        var support = Assert.IsType<ReactiveBandit>(
            Assert.Single(session.Wingmen).Bandit);
        var relief = Assert.IsType<ReactiveBandit>(
            Assert.IsType<ReliefFighter>(session.Relief).Actor);
        Assert.Equal(AiComputeLevel.Emergency, primary.ComputeLevel);
        Assert.Equal(AiComputeLevel.Emergency, support.ComputeLevel);
        Assert.Equal(AiComputeLevel.Emergency, relief.ComputeLevel);

        bool reliefCompletedPlan = false;
        for (int tick = 0;
            tick < 3 * ReactiveBandit.LookaheadDecisionCadenceTicks;
            tick++) {
            AiWorkloadCounters primaryBefore = primary.AiWorkload;
            AiWorkloadCounters supportBefore = support.AiWorkload;
            AiWorkloadCounters reliefBefore = relief.AiWorkload;
            session.StepFixed();

            Assert.InRange(
                (primary.AiWorkload - primaryBefore).CandidateEvaluations,
                0, 1);
            Assert.InRange(
                (support.AiWorkload - supportBefore).CandidateEvaluations,
                0, 1);
            Assert.InRange(
                (relief.AiWorkload - reliefBefore).CandidateEvaluations,
                0, 1);
            Assert.Equal(
                primary.AiWorkload + support.AiWorkload + relief.AiWorkload,
                session.AiWorkload);
            if (relief.AiWorkload.PlansCompleted > 0) {
                reliefCompletedPlan = true;
                break;
            }
        }
        Assert.True(reliefCompletedPlan);

        AiWorkloadCounters workBeforeReanchor = relief.AiWorkload;
        long selectionBeforeReanchor =
            relief.DecisionTrace.SelectionSequence;
        session.SetTerrainSurface(new FlatTerrain(heightM: 25.0));
        session.StepFixed();

        Assert.Equal(workBeforeReanchor, relief.AiWorkload);
        Assert.Equal(
            selectionBeforeReanchor + 1,
            relief.DecisionTrace.SelectionSequence);
        Assert.Equal(1, relief.DecisionTrace.CandidateCount);
        Assert.Equal(
            relief.LastCommand,
            relief.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void ReliefTargetPromotionInvalidatesItsCompletedHoldOffLane() {
        SimulationSession session = StartHandoffFight(
            opponentHitsToDefeat: 1,
            usesReactiveBandit: true,
            maximumFormationSize: 2);
        session.SetAiComputeLevel(AiComputeLevel.Full);
        AdvanceToReliefEngaged(session);

        var relief = Assert.IsType<ReactiveBandit>(session.Relief!.Actor);
        int phase = Assert.IsType<int>(relief.LookaheadCadencePhase);
        for (int tick = 0;
            tick < 3 * ReactiveBandit.LookaheadDecisionCadenceTicks
                && (relief.AiWorkload.PlansCompleted == 0
                    || (session.Tick + 1)
                        % ReactiveBandit.LookaheadDecisionCadenceTicks
                        == phase);
            tick++)
            session.StepFixed();
        Assert.True(relief.AiWorkload.PlansCompleted > 0);
        Assert.NotEqual(
            phase,
            (int)((session.Tick + 1)
                % ReactiveBandit.LookaheadDecisionCadenceTicks));

        IBandit promotedActor = Assert.Single(session.Wingmen).Bandit;
        GunKill reliefGun = Assert.IsType<GunKill>(session.Relief.Gun);
        ScoreOneHit(reliefGun, reliefGun.SelectedTargetId);
        session.StepFixed();

        Assert.Same(promotedActor, session.Bandit);
        Assert.Empty(session.Wingmen);
        AiWorkloadCounters workBeforeSwitch = relief.AiWorkload;
        long selectionBeforeSwitch =
            relief.DecisionTrace.SelectionSequence;
        session.StepFixed();

        Assert.Equal(workBeforeSwitch, relief.AiWorkload);
        Assert.Equal(
            selectionBeforeSwitch + 1,
            relief.DecisionTrace.SelectionSequence);
        Assert.Equal(1, relief.DecisionTrace.CandidateCount);
        Assert.Equal(
            relief.LastCommand,
            relief.DecisionTrace.SelectedCommand);
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
