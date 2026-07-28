using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public sealed class ReactiveBanditIncrementalPlannerTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    sealed class FlatTerrain : ITerrainSurface {
        public TerrainBounds Bounds { get; } =
            new(-100_000.0, 100_000.0, -100_000.0, 100_000.0);
        public double HorizontalResolutionM => 240.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(0.0, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static AircraftState State(
        double x,
        double y,
        double z,
        double speed,
        double chi = 0.0) =>
        new(
            new Vec3D(x, y, z),
            speed,
            0.0,
            chi,
            0.0,
            FlightModel.Su35SPublicDataSurrogate.MassKg);

    static (AircraftState Own, AircraftState Player) FightGeometry() => (
        State(0.0, 3_000.0, 0.0, 300.0, chi: 0.15),
        State(650.0, 3_120.0, 1_550.0, 285.0, chi: Math.PI - 0.25));

    [Fact]
    public void DirectControllerRetainsHistoricalSynchronousFullSelection() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());

        bandit.Step(ActorObservation.Capture(player, sourceTick: 0), Dt);

        Assert.Equal(1, bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(BanditDecisionTrace.CandidateCapacity,
            bandit.DecisionTrace.CandidateCount);
        Assert.Equal(AiComputeLevel.Full, bandit.ComputeLevel);
        Assert.Equal(new AiWorkloadCounters(
            PlansStarted: 1,
            PlansCompleted: 1,
            CandidateEvaluations: 9,
            ForecastSteps: 9 * 38,
            TerrainSweeps: 9 * 38), bandit.AiWorkload);
    }

    [Fact]
    public void DisablingIncrementalModeKeepsHistoricalSynchronousForecastFidelity() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureAiPlanning(
            AiComputeLevel.Emergency,
            incremental: false);

        bandit.Step(ActorObservation.Capture(player, sourceTick: 0), Dt);

        Assert.Equal(1, bandit.AiWorkload.PlansCompleted);
        Assert.Equal(9, bandit.AiWorkload.CandidateEvaluations);
        Assert.Equal(9 * 38, bandit.AiWorkload.ForecastSteps);
    }

    [Fact]
    public void FullIncrementalPlanMatchesSynchronousScoresForItsFrozenSnapshot() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var terrain = new FlatTerrain();
        var synchronous = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            terrain);
        var incremental = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            terrain);
        incremental.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);

        synchronous.Step(ActorObservation.Capture(player, sourceTick: 0), Dt);
        PilotCommand held = incremental.LastCommand;
        for (int tick = 0; tick < 4; tick++) {
            incremental.Step(
                ActorObservation.Capture(player, sourceTick: tick),
                Dt);
            Assert.Equal(0, incremental.DecisionTrace.SelectionSequence);
            Assert.Equal(held, incremental.LastCommand);
            Assert.Equal((tick + 1) * 2,
                incremental.AiWorkload.CandidateEvaluations);
        }

        incremental.Step(
            ActorObservation.Capture(player, sourceTick: 4),
            Dt);

        Assert.Equal(synchronous.DecisionTrace, incremental.DecisionTrace);
        Assert.Equal(synchronous.AiWorkload, incremental.AiWorkload);
        Assert.Equal(1, incremental.AiWorkload.PlansCompleted);
    }

    [Theory]
    [InlineData(AiComputeLevel.Full, 2, 4, 38)]
    [InlineData(AiComputeLevel.Balanced, 1, 6, 25)]
    [InlineData(AiComputeLevel.Constrained, 1, 8, 19)]
    [InlineData(AiComputeLevel.Emergency, 1, 12, 13)]
    public void PressureLevelBoundsOneTicksDeterministicForecastWork(
        AiComputeLevel level,
        int candidateEvaluations,
        int predictionSubstepTicks,
        int forecastStepsPerCandidate) {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureAiPlanning(level, incremental: true);

        bandit.Step(ActorObservation.Capture(player, sourceTick: 0), Dt);

        Assert.Equal(level, bandit.ComputeLevel);
        Assert.Equal(1, bandit.AiWorkload.PlansStarted);
        Assert.Equal(0, bandit.AiWorkload.PlansCompleted);
        Assert.Equal(candidateEvaluations,
            bandit.AiWorkload.CandidateEvaluations);
        Assert.Equal(candidateEvaluations * forecastStepsPerCandidate,
            bandit.AiWorkload.ForecastSteps);
        Assert.Equal(bandit.AiWorkload.ForecastSteps,
            bandit.AiWorkload.TerrainSweeps);
        Assert.Equal(
            (int)Math.Ceiling(150.0 / predictionSubstepTicks),
            forecastStepsPerCandidate);

        for (long tick = 1;
            tick < ReactiveBandit.LookaheadDecisionCadenceTicks
                && bandit.AiWorkload.PlansCompleted == 0;
            tick++) {
            bandit.Step(
                ActorObservation.Capture(player, sourceTick: tick),
                Dt);
        }

        Assert.Equal(1, bandit.AiWorkload.PlansCompleted);
        Assert.Equal(BanditDecisionTrace.CandidateCapacity,
            bandit.DecisionTrace.CandidateCount);
        Assert.Equal(9, bandit.AiWorkload.CandidateEvaluations);
        Assert.Equal(9 * forecastStepsPerCandidate,
            bandit.AiWorkload.ForecastSteps);
        Assert.Equal(bandit.AiWorkload.ForecastSteps,
            bandit.AiWorkload.TerrainSweeps);
    }

    [Fact]
    public void LowAttackContextCancelsPendingGenericPlanUntilNextAbsoluteLane() {
        AircraftState own = State(0.0, 1_050.0, -800.0, 280.0);
        AircraftState lowPlayer =
            State(0.0, 300.0, 2_600.0, 220.0);
        AircraftState ordinaryPlayer = lowPlayer with {
            Position = lowPlayer.Position with { Y = 800.0 }
        };
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);

        bandit.Step(
            ActorObservation.Capture(ordinaryPlayer, sourceTick: 0),
            Dt);
        AiWorkloadCounters genericWork = bandit.AiWorkload;
        long selectionBeforeLowAttack =
            bandit.DecisionTrace.SelectionSequence;
        Assert.Equal(1, genericWork.PlansStarted);
        Assert.Equal(0, genericWork.PlansCompleted);
        Assert.Equal(1, genericWork.CandidateEvaluations);

        bandit.Step(
            ActorObservation.Capture(lowPlayer, sourceTick: 1),
            Dt);

        Assert.Equal(genericWork, bandit.AiWorkload);
        Assert.Equal(selectionBeforeLowAttack + 1,
            bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
        Assert.Equal(BanditTactic.Acquire, bandit.PolicyMemory.Tactic);

        long holdSelection =
            bandit.DecisionTrace.SelectionSequence;
        for (long tick = 2;
            tick < ReactiveBandit.LookaheadDecisionCadenceTicks;
            tick++) {
            bandit.Step(
                ActorObservation.Capture(lowPlayer, sourceTick: tick),
                Dt);
            Assert.Equal(genericWork, bandit.AiWorkload);
            Assert.Equal(holdSelection,
                bandit.DecisionTrace.SelectionSequence);
        }

        bandit.Step(
            ActorObservation.Capture(
                lowPlayer,
                sourceTick: ReactiveBandit.LookaheadDecisionCadenceTicks),
            Dt);
        Assert.Equal(genericWork.PlansStarted + 1,
            bandit.AiWorkload.PlansStarted);
        Assert.Equal(genericWork.CandidateEvaluations + 1,
            bandit.AiWorkload.CandidateEvaluations);
    }

    [Fact]
    public void LowAttackContextReplacesCompletedGenericCommandOffLane() {
        AircraftState own = State(0.0, 1_050.0, -800.0, 280.0);
        AircraftState lowPlayer =
            State(0.0, 300.0, 2_600.0, 220.0);
        AircraftState ordinaryPlayer = lowPlayer with {
            Position = lowPlayer.Position with { Y = 800.0 }
        };
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);

        for (long tick = 0; tick <= 4; tick++)
            bandit.Step(
                ActorObservation.Capture(ordinaryPlayer, sourceTick: tick),
                Dt);

        AiWorkloadCounters completedGenericWork =
            bandit.AiWorkload;
        long genericSelection =
            bandit.DecisionTrace.SelectionSequence;
        Assert.Equal(1, completedGenericWork.PlansCompleted);
        Assert.Equal(BanditDecisionTrace.CandidateCapacity,
            bandit.DecisionTrace.CandidateCount);

        bandit.Step(
            ActorObservation.Capture(lowPlayer, sourceTick: 5),
            Dt);

        Assert.Equal(completedGenericWork, bandit.AiWorkload);
        Assert.Equal(genericSelection + 1,
            bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
        Assert.Equal(BanditTactic.Acquire, bandit.PolicyMemory.Tactic);
    }

    [Fact]
    public void LowAttackContextReplacesGenericCommandAfterPressureCancellation() {
        AircraftState own = State(0.0, 1_050.0, -800.0, 280.0);
        AircraftState lowPlayer =
            State(0.0, 300.0, 2_600.0, 220.0);
        AircraftState ordinaryPlayer = lowPlayer with {
            Position = lowPlayer.Position with { Y = 800.0 }
        };
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);

        bandit.Step(
            ActorObservation.Capture(ordinaryPlayer, sourceTick: 0),
            Dt);
        AiWorkloadCounters partialGenericWork =
            bandit.AiWorkload;
        bandit.ConfigureAiPlanning(
            AiComputeLevel.Balanced,
            incremental: true);

        bandit.Step(
            ActorObservation.Capture(lowPlayer, sourceTick: 1),
            Dt);

        Assert.Equal(partialGenericWork, bandit.AiWorkload);
        Assert.Equal(1, bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
        Assert.Equal(BanditTactic.Acquire, bandit.PolicyMemory.Tactic);
    }

    [Fact]
    public void ComputeLevelChangeReplacesCompletedHoldOffLane() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);

        for (long tick = 0; tick <= 4; tick++)
            bandit.Step(
                ActorObservation.Capture(player, sourceTick: tick),
                Dt);

        AiWorkloadCounters completedFullWork = bandit.AiWorkload;
        long fullSelection = bandit.DecisionTrace.SelectionSequence;
        Assert.Equal(1, completedFullWork.PlansCompleted);
        Assert.Equal(BanditDecisionTrace.CandidateCapacity,
            bandit.DecisionTrace.CandidateCount);

        bandit.ConfigureAiPlanning(
            AiComputeLevel.Balanced,
            incremental: true);
        bandit.Step(
            ActorObservation.Capture(player, sourceTick: 5),
            Dt);

        Assert.Equal(completedFullWork, bandit.AiWorkload);
        Assert.Equal(fullSelection + 1,
            bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);

        long safeHoldSelection =
            bandit.DecisionTrace.SelectionSequence;
        for (long tick = 6;
            tick < ReactiveBandit.LookaheadDecisionCadenceTicks;
            tick++) {
            bandit.Step(
                ActorObservation.Capture(player, sourceTick: tick),
                Dt);
            Assert.Equal(completedFullWork, bandit.AiWorkload);
            Assert.Equal(safeHoldSelection,
                bandit.DecisionTrace.SelectionSequence);
        }

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: ReactiveBandit.LookaheadDecisionCadenceTicks),
            Dt);
        Assert.Equal(completedFullWork.PlansStarted + 1,
            bandit.AiWorkload.PlansStarted);
        Assert.Equal(completedFullWork.CandidateEvaluations + 1,
            bandit.AiWorkload.CandidateEvaluations);
    }

    [Fact]
    public void ContactChangeCancelsPendingPlanUntilNextAbsoluteLane() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: 0,
                contactIdentity: 101),
            Dt);
        AiWorkloadCounters firstContactWork = bandit.AiWorkload;
        Assert.Equal(1, firstContactWork.PlansStarted);
        Assert.Equal(0, firstContactWork.PlansCompleted);
        Assert.Equal(1, firstContactWork.CandidateEvaluations);

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: 1,
                contactIdentity: 202),
            Dt);

        Assert.Equal(firstContactWork, bandit.AiWorkload);
        Assert.Equal(1, bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);

        long safeHoldSelection =
            bandit.DecisionTrace.SelectionSequence;
        for (long tick = 2;
            tick < ReactiveBandit.LookaheadDecisionCadenceTicks;
            tick++) {
            bandit.Step(
                ActorObservation.Capture(
                    player,
                    sourceTick: tick,
                    contactIdentity: 202),
                Dt);
            Assert.Equal(firstContactWork, bandit.AiWorkload);
            Assert.Equal(safeHoldSelection,
                bandit.DecisionTrace.SelectionSequence);
        }

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: ReactiveBandit.LookaheadDecisionCadenceTicks,
                contactIdentity: 202),
            Dt);
        Assert.Equal(firstContactWork.PlansStarted + 1,
            bandit.AiWorkload.PlansStarted);
        Assert.Equal(firstContactWork.CandidateEvaluations + 1,
            bandit.AiWorkload.CandidateEvaluations);
    }

    [Fact]
    public void ZeroIdentityFirstObservationBindsContextOffLane() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: 1,
                contactIdentity: 0),
            Dt);

        Assert.Equal(default, bandit.AiWorkload);
        Assert.Equal(0, bandit.DecisionTrace.SelectionSequence);

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: 2,
                contactIdentity: 101),
            Dt);

        Assert.Equal(default, bandit.AiWorkload);
        Assert.Equal(1, bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void ContactChangeReplacesCompletedHoldOffLane() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);

        for (long tick = 0; tick <= 4; tick++)
            bandit.Step(
                ActorObservation.Capture(
                    player,
                    sourceTick: tick,
                    contactIdentity: 101),
                Dt);

        AiWorkloadCounters completedFirstContactWork =
            bandit.AiWorkload;
        long firstContactSelection =
            bandit.DecisionTrace.SelectionSequence;
        Assert.Equal(1, completedFirstContactWork.PlansCompleted);

        bandit.Step(
            ActorObservation.Capture(
                player,
                sourceTick: 5,
                contactIdentity: 202),
            Dt);

        Assert.Equal(completedFirstContactWork, bandit.AiWorkload);
        Assert.Equal(firstContactSelection + 1,
            bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void TacticalPreemptionCancelsRatherThanResumingAStalePlan() {
        AircraftState own = State(0.0, 1_500.0, 0.0, 240.0);
        AircraftState ordinaryPlayer =
            State(400.0, 1_600.0, 1_400.0, 220.0, chi: Math.PI);
        AircraftState lowPlayer =
            ordinaryPlayer with { Position = ordinaryPlayer.Position with { Y = 300.0 } };
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Competent,
            new FlatTerrain());
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);

        bandit.Step(
            ActorObservation.Capture(ordinaryPlayer, sourceTick: 0),
            Dt);
        Assert.Equal(1, bandit.AiWorkload.PlansStarted);
        Assert.Equal(1, bandit.AiWorkload.CandidateEvaluations);

        bandit.Step(ActorObservation.Capture(lowPlayer, sourceTick: 1), Dt);
        long lowBlockSelection =
            bandit.DecisionTrace.SelectionSequence;
        bandit.Step(
            ActorObservation.Capture(ordinaryPlayer, sourceTick: 2),
            Dt);

        Assert.Equal(1, bandit.AiWorkload.PlansStarted);
        Assert.Equal(0, bandit.AiWorkload.PlansCompleted);
        Assert.Equal(1, bandit.AiWorkload.CandidateEvaluations);
        Assert.Equal(lowBlockSelection + 1,
            bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void TerrainReplacementInvalidatesCompletedLowAttackHoldOffLane() {
        AircraftState own = State(0.0, 1_050.0, -800.0, 280.0);
        AircraftState lowPlayer =
            State(0.0, 300.0, 2_600.0, 220.0);
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            new FlatTerrain());
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);

        for (long tick = 0; tick <= 4; tick++)
            bandit.Step(
                ActorObservation.Capture(lowPlayer, sourceTick: tick),
                Dt);

        AiWorkloadCounters completedLowAttackWork =
            bandit.AiWorkload;
        long lowAttackSelection =
            bandit.DecisionTrace.SelectionSequence;
        Assert.Equal(1, completedLowAttackWork.PlansCompleted);
        Assert.Equal(BanditDecisionTrace.CandidateCapacity,
            bandit.DecisionTrace.CandidateCount);

        bandit.UpdateTerrain(new FlatTerrain());
        bandit.Step(
            ActorObservation.Capture(lowPlayer, sourceTick: 5),
            Dt);

        Assert.Equal(completedLowAttackWork, bandit.AiWorkload);
        Assert.Equal(lowAttackSelection + 1,
            bandit.DecisionTrace.SelectionSequence);
        Assert.Equal(1, bandit.DecisionTrace.CandidateCount);
        Assert.Equal(bandit.LastCommand,
            bandit.DecisionTrace.SelectedCommand);
        Assert.Equal(BanditTactic.Acquire, bandit.PolicyMemory.Tactic);
    }

    [Fact]
    public void SameTerrainInstancePreservesPendingPlan() {
        (AircraftState own, AircraftState player) = FightGeometry();
        var terrain = new FlatTerrain();
        var bandit = new ReactiveBandit(
            own,
            FlightModel.Su35SPublicDataSurrogate,
            PilotSkill.Ace,
            terrain);
        bandit.ConfigureLookaheadCadencePhase(0);
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);

        bandit.Step(
            ActorObservation.Capture(player, sourceTick: 0),
            Dt);
        AiWorkloadCounters firstTickWork = bandit.AiWorkload;
        Assert.Equal(1, firstTickWork.PlansStarted);
        Assert.Equal(1, firstTickWork.CandidateEvaluations);

        bandit.UpdateTerrain(terrain);
        bandit.Step(
            ActorObservation.Capture(player, sourceTick: 1),
            Dt);

        Assert.Equal(firstTickWork.PlansStarted,
            bandit.AiWorkload.PlansStarted);
        Assert.Equal(firstTickWork.CandidateEvaluations + 1,
            bandit.AiWorkload.CandidateEvaluations);
        Assert.Equal(0, bandit.DecisionTrace.SelectionSequence);
    }

    [Fact]
    public void NeutralMergeForwardsIncrementalPressureConfigurationAtHandoff() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var merge = Assert.IsType<NeutralMergeBandit>(beat.CreateBandit());
        merge.ConfigureAiPlanning(AiComputeLevel.Balanced, incremental: true);
        var player = new AircraftSim(beat.Player, beat.PlayerAir);
        var straight = new PilotCommand(1.0, 0.0, 1.0, 0.0);
        PilotCommand reciprocalHold = merge.AppliedCommand;
        long tick = 0;

        while (tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete) {
            reciprocalHold = new PilotCommand(
                GDemand: 1.0,
                BankTarget: merge.State.Bank,
                Throttle: Math.Min(
                    1.0,
                    merge.BriefedAircraftParameters.MaxThrustFraction),
                Rudder: 0.0);
            merge.Step(
                ActorObservation.Capture(
                    player.State,
                    sourceTick: tick,
                    contactIdentity: 42),
                Dt);
            player.Step(straight, Dt);
            tick++;
        }

        Assert.True(merge.FirstPassComplete);
        Assert.Equal(AiComputeLevel.Balanced, merge.ComputeLevel);
        Assert.Equal(default, merge.AiWorkload);
        Assert.Equal(reciprocalHold, merge.AppliedCommand);

        merge.Step(
            ActorObservation.Capture(
                player.State,
                sourceTick: tick,
                contactIdentity: 42),
            Dt);

        Assert.Equal(reciprocalHold, merge.AppliedCommand);
        Assert.Equal(1, merge.AiWorkload.PlansStarted);
        Assert.Equal(0, merge.AiWorkload.PlansCompleted);
        Assert.Equal(1, merge.AiWorkload.CandidateEvaluations);
        Assert.Equal(25, merge.AiWorkload.ForecastSteps);
    }
}
