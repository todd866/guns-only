using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// Scope and safety contracts for the optional long-range attack re-engagement path.
///
/// Pressure trajectories are measured separately; these contracts pin authority, safety and scope.
public sealed class BanditReengagementTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly AircraftParams BanditAir = FlightModel.Su27SPublicDataSurrogate;
    static readonly AircraftParams PlayerAir = FlightModel.F22APublicDataSurrogate;

    static AircraftState State(double x, double y, double z, double speed,
        double chi = 0.0, double gamma = 0.0, AircraftParams? air = null) =>
        new(new Vec3D(x, y, z), speed, gamma, chi, 0.0,
            (air ?? BanditAir).MassKg);

    static bool IsFinite(PilotCommand command) =>
        double.IsFinite(command.GDemand)
        && double.IsFinite(command.BankTarget)
        && double.IsFinite(command.Throttle)
        && double.IsFinite(command.SasRollControl);

    sealed class RidgeAhead : ITerrainSurface {
        public TerrainBounds Bounds => new(-100_000.0, 100_000.0, -100_000.0, 100_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            double heightM = eastM is > 500.0 and < 1_300.0 ? 2_500.0 : 0.0;
            sample = new TerrainSample(heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    [Fact]
    public void LongRangeReengagementKeepsThePathFloorClearanceGate() {
        // The ridge is in the 900 m look-ahead slice. A re-engage command must resolve its floor
        // before choosing the bank, so the old 115-degree Split-S cannot arm on a stale low aim.
        var bandit = new ReactiveBandit(
            State(0.0, 4200.0, 0.0, BeatSetup.CornerTrueAirspeedMps(BanditAir, 4200.0),
                chi: Math.PI / 2.0),
            BanditAir, PilotSkill.Ace, new RidgeAhead()) {
            AttackReengagementEnabled = true,
        };
        var player = State(4500.0, 1000.0, 0.0, 300.0, chi: Math.PI / 2.0,
            air: PlayerAir);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.True(IsFinite(bandit.LastCommand));
        Assert.InRange(Math.Abs(bandit.LastCommand.BankTarget), 0.0, 1.30);
    }

    [Fact]
    public void LongRangeReengagementNearVerticalPublishesFiniteCommand() {
        var bandit = new ReactiveBandit(
            State(0.0, 3800.0, 0.0, 250.0, chi: Math.PI, gamma: Math.PI / 2.0),
            BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true,
        };
        var player = State(0.0, 4000.0, 5000.0, 310.0, chi: 0.0,
            air: PlayerAir);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.True(IsFinite(bandit.LastCommand));
        Assert.InRange(bandit.LastCommand.BankTarget, -2.0, 2.0);
    }

    [Fact]
    public void ReengagementCommandNeverRequestsBeyondSkillGCap() {
        var bandit = new ReactiveBandit(
            State(0.0, 3000.0, 0.0, 230.0, chi: Math.PI),
            BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true,
        };
        var player = State(0.0, 3000.0, 6000.0, 320.0, chi: 0.0,
            air: PlayerAir);
        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        BanditSkillProfile profile = BanditSkillProfile.For(PilotSkill.Competent);
        Assert.True(IsFinite(bandit.LastCommand));
        Assert.InRange(bandit.LastCommand.GDemand, -0.20, profile.MaxAcquireG + 1e-9);
    }

    [Fact]
    public void IncrementalPlannerContinuesInBoundedLanesDuringReengagement() {
        var bandit = new ReactiveBandit(
            State(0.0, 4000.0, 0.0, 250.0), BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true,
        };
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);
        var player = State(0.0, 4000.0, 5000.0, 310.0, air: PlayerAir);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);
        AiWorkloadCounters previous = bandit.AiWorkload;
        Assert.True(previous.PlansStarted > 0);
        Assert.Equal("intercept", bandit.AttackStatus);
        Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);

        bool sawPlannerProgress = false;
        for (long tick = 1; tick < ReactiveBandit.LookaheadDecisionCadenceTicks - 1; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            AiWorkloadCounters current = bandit.AiWorkload;
            long evaluations = current.CandidateEvaluations - previous.CandidateEvaluations;
            Assert.InRange(evaluations, 0, 1);
            sawPlannerProgress |= evaluations > 0;
            Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);
            previous = current;
        }

        Assert.True(sawPlannerProgress,
            "re-engagement overrode the command but starved the incremental planner");
        Assert.True(bandit.AiWorkload.PlansCompleted > 0);

        // Exiting off cadence uses the hold refreshed during intercept, without starting an
        // unscheduled plan. The normal next cadence will plan from the settled geometry.
        player = player with { Position = bandit.State.Position + bandit.State.ForwardDir() * 3000 };
        bandit.Step(ActorObservation.Capture(player, ReactiveBandit.LookaheadDecisionCadenceTicks - 1), Dt);
        Assert.Equal("track", bandit.AttackStatus);
        Assert.Equal(previous.PlansStarted, bandit.AiWorkload.PlansStarted);
        Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void ContactChangeDuringPendingInterceptDoesNotRetainTheOldTask() {
        var bandit = new ReactiveBandit(State(0, 4000, 0, 250), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);
        bandit.Step(ActorObservation.Capture(State(0, 4000, 5000, 310), 0)
            with { ContactIdentity = 1 }, Dt);
        Assert.Equal("intercept", bandit.AttackStatus);
        Assert.Equal(0, bandit.AiWorkload.PlansCompleted);

        // A replacement contact inside the settle range must not inherit the old intercept.
        bandit.Step(ActorObservation.Capture(State(0, 4000, 2000, 250), 1)
            with { ContactIdentity = 2 }, Dt);
        Assert.Equal("track", bandit.AttackStatus);
        Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);
    }

    [Theory]
    [InlineData(false, 0)]
    [InlineData(false, 1)]
    [InlineData(false, 2)]
    [InlineData(false, 3)]
    [InlineData(true, 0)]
    [InlineData(true, 1)]
    [InlineData(true, 2)]
    [InlineData(true, 3)]
    public void RungZeroNoLongerLeavesWholeSeedTrajectoriesUncontested(bool cohort, int seed) {
        // This pins the measured improvement, not the still-unmet 60-second attack-gap goal.
        var result = BanditPressureReport.Fly(0,
            cohort ? PilotProfile.Cohort : PilotProfile.Competent, 240, durable: false, seed);
        Assert.True(result.OpponentRounds > 0 && double.IsFinite(result.FirstCredibleS),
            $"{result.Label} seed {seed}: {result.OpponentRounds} rounds, first credible {result.FirstCredibleS}");
    }

    [Fact]
    public void PursuitFromTheSixConvertsIntoRealRoundsWithoutClimbingAway() {
        var target = new AircraftSim(State(0, 3000, 1800, 235, air: PlayerAir), PlayerAir);
        var bandit = new ReactiveBandit(State(0, 3000, 0, 260), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        var combat = CombatConfig.ModernVisualMerge;
        var gun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
            combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);
        double peak = bandit.State.Position.Y;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz && gun.RoundsFired == 0; tick++) {
            target.Step(new PilotCommand(1.0, 0.0, 0.50, 0.0), Dt);
            var observed = ActorObservation.Capture(target.State, tick);
            bandit.Step(observed, Dt);
            gun.Step(bandit.WantsToFire(observed), bandit.State, target.State, Dt);
            peak = Math.Max(peak, bandit.State.Position.Y);
        }
        Assert.True(gun.RoundsFired > 0, "the bandit never followed its stern pursuit into a shot");
        Assert.True(peak < 3500, $"level pursuit climbed away to {peak:F0} m");
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(1, true)]
    [InlineData(2, true)]
    [InlineData(3, false)]
    [InlineData(-1, false)]
    public void SessionOptInIsLimitedToSingleF22Ramp(int rung, bool expected) {
        var session = new SimulationSession();
        if (rung > 0) session.ArmDirectorStateForNextStage(BanditPressureReport.RungState(rung)!);
        session.StartBeat(rung == -1 ? Beats.ModernAceDuel : Beats.ModernVisualMerge);
        session.Begin();
        session.StepFixed();
        Assert.Equal(expected, Assert.IsType<NeutralMergeBandit>(session.Bandit).AttackReengagementEnabled);
    }

    [Fact]
    public void LowClearanceReversalCannotCommandAnInvertedSlice() {
        var bandit = new ReactiveBandit(State(0, 1200, 0, 250, chi: -Math.PI / 2),
            BanditAir, PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.Step(ActorObservation.Capture(State(4500, 500, 0, 300, chi: Math.PI / 2), 0), Dt);
        Assert.InRange(Math.Abs(bandit.LastCommand.BankTarget), 0, 1.30);
        Assert.InRange(bandit.LastCommand.Throttle, 0, BanditAir.MaxThrustFraction);
    }

    [Fact]
    public void LowEnergyStillPreemptsReengagement() {
        var bandit = new ReactiveBandit(State(0, 3000, 0, 100), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.Step(ActorObservation.Capture(State(0, 3000, 6000, 300), 0), Dt);
        Assert.Equal(BanditTactic.Energy, bandit.Tactic);
    }

    [Fact]
    public void RearGunThreatInterruptsAnActiveIntercept() {
        var bandit = new ReactiveBandit(State(0, 3000, 0, 250), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.Step(ActorObservation.Capture(State(0, 3000, 6000, 310), 0), Dt);
        var attacker = bandit.State with {
            Position = bandit.State.Position - bandit.State.ForwardDir() * 600,
            Speed = bandit.State.Speed + 50
        };
        bandit.Step(ActorObservation.Capture(attacker, 1), Dt);
        Assert.Equal(BanditTactic.Defend, bandit.Tactic);
    }

    [Fact]
    public void FrozenCarrierBeatDoesNotArmAttackReengagementOrFormation() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.CarrierApproach());
        Assert.False(session.Beat.UsesReactiveBandit);
        Assert.Empty(session.Wingmen);

        session.Begin();
        session.StepFixed();

        Assert.True(session.OpponentPresent);
        Assert.IsNotType<ReactiveBandit>(session.Bandit);
    }
}
