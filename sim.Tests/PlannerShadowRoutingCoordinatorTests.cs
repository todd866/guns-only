using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

[Collection(PlannerAllocationSensitiveCollection.Name)]
public class PlannerShadowRoutingCoordinatorTests {
    [Fact]
    public void CurrentExactAnswerCannotBootstrapItsOwnAdmissionHistory() {
        PlannerTeacherSample sample = Sample();
        PlannerShadowRoutingCoordinator coordinator = Coordinator(
            minimumHistory: 1);

        PlannerShadowRoutingResult first = Evaluate(
            coordinator,
            sample);
        PlannerShadowRoutingResult second = Evaluate(
            coordinator,
            sample);

        Assert.Equal(0, first.PriorQuality.EvaluatedSamples);
        Assert.Equal(1, first.UpdatedQuality.EvaluatedSamples);
        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            first.Routing.Route);
        Assert.True((first.Routing.Reasons
            & AdaptivePlannerRouteReason.HistoryInsufficient) != 0);

        Assert.Equal(1, second.PriorQuality.EvaluatedSamples);
        Assert.Equal(
            AdaptivePlannerRoute.StudentCandidate,
            second.Routing.Route);
        Assert.Equal(2UL, coordinator.Telemetry.TotalEvaluations);
    }

    [Fact]
    public void OodEvidenceImmediatelyRevokesTheLatchAndDoesNotEnterAuditHistory() {
        PlannerTeacherSample sample = Sample();
        PlannerShadowRoutingCoordinator coordinator = Coordinator(
            minimumHistory: 1);
        Evaluate(coordinator, sample);
        PlannerShadowRoutingResult admitted = Evaluate(
            coordinator,
            sample);
        Assert.True(admitted.Routing.NextState.StudentLatched);
        int auditCount = coordinator.RecentQuality.EvaluatedSamples;

        PlannerShadowRoutingResult ood = coordinator.Evaluate(
            sample.PlanningObservation,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            sample.DecisionTrace,
            sample.EnginePowerFraction,
            PlannerShadowRuntimeContext.FlatCalmDoctrineZero with {
                CalmWind = false
            },
            AdaptivePlannerComputeTier.Balanced);

        Assert.Equal(AdaptivePlannerRoute.ExactRequired, ood.Routing.Route);
        Assert.False(ood.Routing.NextState.StudentLatched);
        Assert.Equal(auditCount, ood.UpdatedQuality.EvaluatedSamples);
        Assert.Equal(
            1UL,
            coordinator.Telemetry.OodCounts.WindNotCalm);
    }

    [Fact]
    public void ResetClearsAllThreeStateDomains() {
        PlannerTeacherSample sample = Sample();
        PlannerShadowRoutingCoordinator coordinator = Coordinator(
            minimumHistory: 1);
        Evaluate(coordinator, sample);
        Evaluate(coordinator, sample);

        PlannerShadowTelemetrySnapshot previous = coordinator.Reset();

        Assert.Equal(2UL, previous.TotalEvaluations);
        Assert.Equal(default, coordinator.Telemetry);
        Assert.Equal(default, coordinator.RecentQuality);
        Assert.Equal(
            AdaptivePlannerRoutingState.Initial,
            coordinator.RoutingState);
    }

    [Fact]
    public void CoordinatedShadowEvaluationAllocatesNothingAfterWarmup() {
        PlannerTeacherSample sample = Sample();
        PlannerShadowRoutingCoordinator coordinator = Coordinator(
            minimumHistory: 1);
        long checksum = 0;

        for (int index = 0; index < 2048; index++) {
            PlannerShadowRoutingResult result = Evaluate(
                coordinator,
                sample);
            checksum += result.Shadow.StudentBestLogit;
        }
        _ = GC.GetAllocatedBytesForCurrentThread();
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int index = 0; index < 10_000; index++) {
            PlannerShadowRoutingResult result = Evaluate(
                coordinator,
                sample);
            checksum += result.Shadow.StudentBestLogit
                + (int)result.Routing.Route;
        }
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

        GC.KeepAlive(checksum);
        Assert.Equal(0, allocated);
    }

    [Fact]
    public void CoordinatorContractsCannotCarryAFlightCommand() {
        Assert.DoesNotContain(
            typeof(PlannerShadowRoutingResult).GetProperties(),
            property => property.PropertyType == typeof(PilotCommand));
    }

    static PlannerShadowRoutingResult Evaluate(
        PlannerShadowRoutingCoordinator coordinator,
        in PlannerTeacherSample sample) =>
        coordinator.Evaluate(
            sample.PlanningObservation,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            sample.DecisionTrace,
            sample.EnginePowerFraction,
            PlannerShadowRuntimeContext.FlatCalmDoctrineZero,
            AdaptivePlannerComputeTier.Balanced);

    static PlannerShadowRoutingCoordinator Coordinator(
        int minimumHistory) {
        int[] outputOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        var outputBiases = new int[
            PlannerIntegerRanker.CandidateCount];
        for (int rank = 0; rank < outputOrder.Length; rank++)
            outputBiases[outputOrder[rank]] =
                PlannerIntegerRanker.CandidateCount - rank;
        var ranker = new PlannerIntegerRanker(
            PlannerDistillationFeatures.FeatureCount,
            new sbyte[
                PlannerIntegerRanker.HiddenUnitCount
                * PlannerDistillationFeatures.FeatureCount],
            new int[PlannerIntegerRanker.HiddenUnitCount],
            hiddenScaleShift: 0,
            new sbyte[
                PlannerIntegerRanker.CandidateCount
                * PlannerIntegerRanker.HiddenUnitCount],
            outputBiases,
            outputScaleShift: 0);
        var evaluator = new PlannerShadowEvaluator(
            ranker,
            PlannerDistillationFeatures.Schema,
            PlannerDistillationFeatures.NormalizationSchema,
            PlannerDistillationFeatures.FeatureCount,
            PlannerShadowEvaluator.MinimumInputScale,
            PlannerShadowSkillMask.Ace,
            PlannerShadowTacticMask.All);
        var audit = new AdaptivePlannerAuditWindow(
            new AdaptivePlannerAuditWindowConfig(
                Capacity: 8,
                MaximumPositiveRelativeRegret: 1.0));
        AdaptivePlannerTierPolicy tier = new(
            EntryMinimumMargin: 0,
            HoldMinimumMargin: 0,
            ExactAuditInterval: 100);
        var config = new AdaptivePlannerRoutingConfig(
            MinimumHistorySamples: minimumHistory,
            EntryMinimumAgreementPermille: 0,
            HoldMinimumAgreementPermille: 0,
            EntryMinimumQualityPermille: 0,
            HoldMinimumQualityPermille: 0,
            MaximumConsecutiveDisagreements: 8,
            EntryDebounceDecisions: 1,
            ExitDebounceDecisions: 1,
            Ample: tier,
            Balanced: tier,
            Constrained: tier,
            Critical: tier);
        return new PlannerShadowRoutingCoordinator(
            evaluator,
            new PlannerShadowTelemetry(),
            audit,
            config);
    }

    static PlannerTeacherSample Sample() =>
        SeededCombatBatchRunner
            .RunWithPlannerTeacherSamples(new CombatTrainingBatchConfig(
                FirstSeed: 0x5A4D_0001UL,
                EpisodeCount: 1,
                MaximumSecondsPerEpisode: 0.05,
                BehaviorSkill: PilotSkill.Ace))
            .Episodes[0]
            .Samples[0];
}
