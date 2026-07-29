using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

public class PlannerTeacherCaptureTests {
    [Fact]
    public void CaptureIsDeterministicAndLeavesCombatTransitionV1Unchanged() {
        var config = new CombatTrainingBatchConfig(
            FirstSeed: 0xD157_1110UL,
            EpisodeCount: 2,
            MaximumSecondsPerEpisode: 0.15,
            ReferenceSkill: PilotSkill.Veteran,
            BehaviorSkill: PilotSkill.Ace);

        PlannerTeacherBatch first =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config);
        PlannerTeacherBatch second =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config);
        CombatTrainingBatch ordinary = SeededCombatBatchRunner.Run(config);

        Assert.Equal(config, first.Config);
        Assert.Equal(first.Context, second.Context);
        Assert.Equal(first.SampleCount, second.SampleCount);
        Assert.Equal(first.EligibleSampleCount, second.EligibleSampleCount);
        Assert.NotEqual(0, first.SampleCount);
        Assert.Equal(
            CombatDatasetJsonLines.Serialize(ordinary),
            CombatDatasetJsonLines.Serialize(first.CombatBatch));
        Assert.Equal(
            CombatDatasetJsonLines.Serialize(first.CombatBatch),
            CombatDatasetJsonLines.Serialize(second.CombatBatch));

        for (int episodeIndex = 0;
            episodeIndex < first.Episodes.Count;
            episodeIndex++) {
            PlannerTeacherEpisode firstEpisode = first.Episodes[episodeIndex];
            PlannerTeacherEpisode secondEpisode = second.Episodes[episodeIndex];
            Assert.Equal(
                firstEpisode.CombatEpisode.Transitions,
                secondEpisode.CombatEpisode.Transitions);
            Assert.Equal(
                firstEpisode.Samples.ToArray(),
                secondEpisode.Samples.ToArray());
        }
    }

    [Fact]
    public void SamplesAlignPlanningObservationMemoryAndTraceWithSelectedTransition() {
        var config = new CombatTrainingBatchConfig(
            FirstSeed: 0xA11C_0001UL,
            EpisodeCount: 1,
            MaximumSecondsPerEpisode: 0.25,
            ReferenceSkill: PilotSkill.Competent,
            BehaviorSkill: PilotSkill.Ace);
        PlannerTeacherEpisode episode =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config).Episodes[0];
        CombatTransition[] selectedTransitions = episode.CombatEpisode.Transitions
            .Where(transition => transition.Action.ManeuverSelected)
            .ToArray();

        Assert.Equal(selectedTransitions.Length, episode.Samples.Count);
        long previousDecisionIndex = -1L;
        long previousSelectionSequence = 0L;
        for (int index = 0; index < episode.Samples.Count; index++) {
            PlannerTeacherSample sample = episode.Samples[index];
            CombatTransition transition = selectedTransitions[index];

            Assert.Equal(transition.DecisionIndex, sample.DecisionIndex);
            Assert.Equal(sample.DecisionIndex, sample.PlanningObservation.Tick);
            Assert.Equal(transition.Observation, sample.PlanningObservation);
            Assert.Equal(config.BehaviorSkill, sample.BehaviorSkill);
            Assert.Equal(config.BehaviorSkill, sample.DecisionTrace.Skill);
            Assert.True(double.IsFinite(sample.EnginePowerFraction));
            Assert.InRange(sample.EnginePowerFraction, 0.0, 1.65);
            Assert.True(sample.DecisionIndex > previousDecisionIndex);
            Assert.True(
                sample.DecisionTrace.SelectionSequence
                    > previousSelectionSequence);
            Assert.Equal(
                sample.PlanningObservation.ElapsedSeconds,
                sample.PolicyMemoryBefore.EngagementSeconds,
                precision: 10);
            Assert.Equal(
                transition.NextObservation.ElapsedSeconds,
                sample.PolicyMemoryAfter.EngagementSeconds,
                precision: 10);
            Assert.Equal(
                transition.Action.GDemand,
                sample.DecisionTrace.SelectedCommand.GDemand);
            Assert.Equal(
                transition.Action.BankTargetRad,
                sample.DecisionTrace.SelectedCommand.BankTarget);
            Assert.Equal(
                transition.Action.Throttle,
                sample.DecisionTrace.SelectedCommand.Throttle);
            Assert.Equal(
                transition.Action.Rudder,
                sample.DecisionTrace.SelectedCommand.Rudder);

            previousDecisionIndex = sample.DecisionIndex;
            previousSelectionSequence =
                sample.DecisionTrace.SelectionSequence;
        }
    }

    [Fact]
    public void FullLookaheadIsEligibleAndSingleCandidatePreemptionIsRetained() {
        var lookaheadConfig = new CombatTrainingBatchConfig(
            FirstSeed: 0xE11C_1B1EUL,
            EpisodeCount: 1,
            MaximumSecondsPerEpisode: 0.15,
            ReferenceSkill: PilotSkill.Competent,
            BehaviorSkill: PilotSkill.Ace);
        PlannerTeacherEpisode lookaheadEpisode =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(
                lookaheadConfig).Episodes[0];

        Assert.NotEmpty(lookaheadEpisode.Samples);
        Assert.All(lookaheadEpisode.Samples, sample => {
            Assert.True(sample.IsTeacherEligible);
            Assert.Equal(
                BanditDecisionTrace.CandidateCapacity,
                sample.DecisionTrace.CandidateCount);
            for (int candidateIndex = 0;
                candidateIndex < sample.DecisionTrace.CandidateCount;
                candidateIndex++) {
                BanditDecisionCandidate candidate =
                    sample.DecisionTrace.CandidateAt(candidateIndex);
                Assert.Equal(candidateIndex, candidate.Id);
                if (candidate.Available) {
                    Assert.True(candidate.HasScore);
                    Assert.True(double.IsFinite(candidate.Score));
                }
            }
        });
        Assert.Equal(
            lookaheadEpisode.Samples.Count,
            lookaheadEpisode.EligibleSampleCount);

        CombatTrainingScenario lowTargetScenario = LowTargetScenario();
        PlannerTeacherEpisode preemptionEpisode =
            SeededCombatBatchRunner.RunEpisodeWithPlannerTeacherSamples(
                episodeIndex: 0,
                lowTargetScenario,
                referenceSkill: PilotSkill.Competent,
                behaviorSkill: PilotSkill.Competent,
                maximumSeconds: 0.05);

        Assert.NotEmpty(preemptionEpisode.Samples);
        Assert.Equal(0, preemptionEpisode.EligibleSampleCount);
        Assert.All(preemptionEpisode.Samples, sample => {
            Assert.False(sample.IsTeacherEligible);
            Assert.Equal(1, sample.DecisionTrace.CandidateCount);
            Assert.True(sample.DecisionTrace.Candidate0.Available);
            Assert.False(sample.DecisionTrace.Candidate0.HasScore);
        });
        Assert.Equal(
            preemptionEpisode.CombatEpisode.Transitions.Count,
            preemptionEpisode.Samples.Count);
    }

    [Fact]
    public void CaptureAggregatesAreDefensivelyFrozenAndCarryRunnerContext() {
        var config = new CombatTrainingBatchConfig(
            FirstSeed: 0xC017_EC70UL,
            EpisodeCount: 1,
            MaximumSecondsPerEpisode: 0.05,
            BehaviorSkill: PilotSkill.Ace);
        PlannerTeacherBatch batch =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config);
        PlannerTeacherEpisode episode = batch.Episodes[0];

        Assert.Empty(typeof(PlannerTeacherBatch).GetConstructors());
        Assert.Empty(typeof(PlannerTeacherEpisode).GetConstructors());
        Assert.Equal(
            PlannerTeacherCaptureContext.SeededFlatCalmV1,
            batch.Context);
        Assert.Equal(batch.Context, episode.Context);
        Assert.Equal(
            PlannerTeacherCaptureContext.SchemaV1,
            batch.Context.Schema);
        Assert.Equal(
            PlannerTeacherCaptureContext.FlatCalmEnvironmentV1,
            batch.Context.EnvironmentSchema);
        Assert.Equal(
            PlannerTeacherCaptureContext.SynchronousPlannerExecutionV1,
            batch.Context.PlannerExecutionSchema);
        Assert.Equal(
            SimulationSession.FixedDeltaSeconds,
            batch.Context.FixedDeltaSeconds);
        Assert.False(batch.Context.TerrainEnabled);
        Assert.False(batch.Context.WindEnabled);

        Assert.Null(batch.Episodes as PlannerTeacherEpisode[]);
        Assert.Null(episode.Samples as PlannerTeacherSample[]);
        Assert.Throws<NotSupportedException>(() =>
            ((IList<PlannerTeacherEpisode>)batch.Episodes).Add(episode));
        Assert.Throws<NotSupportedException>(() =>
            ((IList<PlannerTeacherSample>)episode.Samples)[0] =
                episode.Samples[0]);
    }

    static CombatTrainingScenario LowTargetScenario() {
        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams learningAir = FlightModel.Su27SPublicDataSurrogate;
        return new CombatTrainingScenario(
            "low-target-single-candidate-preemption",
            Seed: 0x10UL,
            ReferenceStart: new AircraftState(
                new Vec3D(0.0, 300.0, -2800.0),
                285.0,
                0.0,
                0.0,
                0.0,
                referenceAir.MassKg),
            LearningFighterStart: new AircraftState(
                new Vec3D(200.0, 650.0, 2800.0),
                285.0,
                0.0,
                System.Math.PI,
                0.0,
                learningAir.MassKg),
            FirstPassSafe: true);
    }
}
