using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

[Collection(PlannerAllocationSensitiveCollection.Name)]
public class PlannerShadowEvaluatorTests {
    static readonly PlannerShadowRuntimeContext InDistribution =
        PlannerShadowRuntimeContext.FlatCalmDoctrineZero;

    [Fact]
    public void ReportsAgreementAndDisagreementWithoutReturningACommand() {
        PlannerTeacherSample sample = Sample();
        BanditDecisionTrace trace = CompleteTrace(
            sample.DecisionTrace,
            exactIndex: 2,
            PlannerIntegerRanker.AllCandidatesMask);
        PlannerShadowEvaluator agreeing = Evaluator(
            outputOrder: [2, 1, 0, 3, 4, 5, 6, 7, 8]);
        PlannerShadowEvaluator disagreeing = Evaluator(
            outputOrder: [4, 2, 1, 0, 3, 5, 6, 7, 8]);

        PlannerShadowResult agreement = agreeing.Evaluate(
            sample.PlanningObservation,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            trace,
            sample.EnginePowerFraction,
            InDistribution);
        PlannerShadowResult disagreement = disagreeing.Evaluate(
            sample.PlanningObservation,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            trace,
            sample.EnginePowerFraction,
            InDistribution);

        Assert.True(agreement.Evaluated);
        Assert.True(agreement.Agreement);
        Assert.Equal(2, agreement.ExactCandidateIndex);
        Assert.Equal(2, agreement.StudentCandidateIndex);
        Assert.Equal(0, agreement.StudentThirdCandidateIndex);
        Assert.True(agreement.ExactInStudentTopThree);
        Assert.Equal(0.0, agreement.PositiveRelativeRegret);
        Assert.Equal(PlannerShadowOodReason.None, agreement.OodReasons);

        Assert.True(disagreement.Evaluated);
        Assert.False(disagreement.Agreement);
        Assert.Equal(2, disagreement.ExactCandidateIndex);
        Assert.Equal(4, disagreement.StudentCandidateIndex);
        Assert.True(disagreement.ExactInStudentTopThree);
        Assert.Equal(
            14.0 / 18.0,
            disagreement.PositiveRelativeRegret,
            precision: 12);
        Assert.True(disagreement.IntegerMargin > 0);
        Assert.DoesNotContain(
            typeof(PlannerShadowResult).GetProperties(),
            property => property.PropertyType == typeof(PilotCommand));
    }

    [Fact]
    public void HardGatesUnsupportedRuntimeEnvelope() {
        PlannerTeacherSample sample = Sample();
        BanditPolicyMemory formationMemory = sample.PolicyMemoryBefore with {
            FormationRole = FormationTacticalRole.Independent,
            FormationLateralSign = 1
        };
        PlannerShadowRuntimeContext context = InDistribution with {
            FlatTerrain = false,
            CalmWind = false,
            DoctrineIndex = 1,
            IsBoss = true,
            AirframeMatchesArtifact = false,
            ProfileMatchesArtifact = false,
            AtmosphereMatchesArtifact = false
        };
        PlannerShadowEvaluator evaluator = Evaluator(
            [0, 1, 2, 3, 4, 5, 6, 7, 8],
            supportedSkills: PlannerShadowSkillMask.Veteran,
            supportedTactics: PlannerShadowTacticMask.Defend);

        PlannerShadowResult result = evaluator.Evaluate(
            sample.PlanningObservation,
            formationMemory,
            sample.BehaviorSkill,
            sample.DecisionTrace,
            enginePowerFraction: -0.1,
            context);

        Assert.False(result.Evaluated);
        Assert.Equal(-1, result.StudentCandidateIndex);
        Assert.True(result.IsOutOfDistribution);
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.SkillUnsupported));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.TacticUnsupported));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.TerrainNotFlat));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.WindNotCalm));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.FormationNotIndependent));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.DoctrineUnsupported));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.BossProfile));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.AirframeUnsupported));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.ProfileUnsupported));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.AtmosphereUnsupported));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.EnginePowerInvalid));
    }

    [Fact]
    public void AvailabilityMaskExcludesStudentsGlobalMaximum() {
        PlannerTeacherSample sample = Sample();
        ushort availabilityMask =
            (ushort)(PlannerIntegerRanker.AllCandidatesMask & ~(1 << 4));
        BanditDecisionTrace trace = CompleteTrace(
            sample.DecisionTrace,
            exactIndex: 2,
            availabilityMask);
        PlannerShadowEvaluator evaluator = Evaluator(
            outputOrder: [4, 2, 1, 0, 3, 5, 6, 7, 8]);

        PlannerShadowResult result = evaluator.Evaluate(
            sample.PlanningObservation,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            trace,
            sample.EnginePowerFraction,
            InDistribution);

        Assert.True(result.Evaluated);
        Assert.True(result.Agreement);
        Assert.Equal(2, result.StudentCandidateIndex);
        Assert.Equal(0, result.AvailabilityMask & (1 << 4));
        Assert.NotEqual(0, result.ScorePresenceMask & (1 << 4));
        Assert.NotEqual(0, result.FiniteScoreMask & (1 << 4));
    }

    [Fact]
    public void MissingAndPresentNonFiniteScoresHaveDistinctDiagnostics() {
        PlannerTeacherSample sample = Sample();
        BanditDecisionTrace complete = CompleteTrace(
            sample.DecisionTrace,
            exactIndex: 0,
            PlannerIntegerRanker.AllCandidatesMask);
        var candidates = new BanditDecisionCandidate[
            BanditDecisionTrace.CandidateCapacity];
        for (int index = 0; index < candidates.Length; index++)
            candidates[index] = complete.CandidateAt(index);
        candidates[1] = candidates[1] with {
            HasScore = false,
            Score = 0.0
        };
        candidates[2] = candidates[2] with {
            HasScore = true,
            Score = double.NaN
        };
        var trace = new BanditDecisionTrace(
            SelectionSequence: complete.SelectionSequence,
            Skill: complete.Skill,
            SelectedCommand: candidates[0].Command,
            SelectedCandidateIndex: 0,
            CandidateCount: BanditDecisionTrace.CandidateCapacity,
            candidates[0],
            candidates[1],
            candidates[2],
            candidates[3],
            candidates[4],
            candidates[5],
            candidates[6],
            candidates[7],
            candidates[8]);

        PlannerShadowResult result = Evaluator(
            [0, 1, 2, 3, 4, 5, 6, 7, 8]).Evaluate(
                sample.PlanningObservation,
                sample.PolicyMemoryBefore,
                sample.BehaviorSkill,
                trace,
                sample.EnginePowerFraction,
                InDistribution);

        Assert.False(result.Evaluated);
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.AvailableScoreMissing));
        Assert.True(result.OodReasons.HasFlag(
            PlannerShadowOodReason.AvailableScoreNonFinite));
        Assert.Equal(0, result.ScorePresenceMask & (1 << 1));
        Assert.NotEqual(0, result.ScorePresenceMask & (1 << 2));
        Assert.Equal(0, result.FiniteScoreMask & (1 << 1));
        Assert.Equal(0, result.FiniteScoreMask & (1 << 2));
    }

    [Fact]
    public void EvaluationIsDeterministicAndAllocationFreeAfterWarmup() {
        PlannerTeacherSample sample = Sample();
        BanditDecisionTrace trace = CompleteTrace(
            sample.DecisionTrace,
            exactIndex: 3,
            PlannerIntegerRanker.AllCandidatesMask);
        PlannerShadowEvaluator evaluator = Evaluator(
            outputOrder: [3, 2, 1, 0, 4, 5, 6, 7, 8]);
        const int WarmupIterations = 20_000;
        const int MeasuredIterations = 10_000;
        long checksum = 0;

        // Let tiered JIT/PGO finish before measuring. In a full-suite process the shorter warmup
        // could catch a one-time 248-byte runtime transition despite a zero-allocation hot path.
        for (int warmup = 0; warmup < WarmupIterations; warmup++) {
            PlannerShadowResult result = evaluator.Evaluate(
                sample.PlanningObservation,
                sample.PolicyMemoryBefore,
                sample.BehaviorSkill,
                trace,
                sample.EnginePowerFraction,
                InDistribution);
            checksum += result.StudentBestLogit;
        }

        // The first allocation-counter query in a fresh full-suite process can initialize
        // runtime bookkeeping after returning its baseline. Prime that API outside the window.
        _ = GC.GetAllocatedBytesForCurrentThread();
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int iteration = 0;
            iteration < MeasuredIterations;
            iteration++) {
            PlannerShadowResult result = evaluator.Evaluate(
                sample.PlanningObservation,
                sample.PolicyMemoryBefore,
                sample.BehaviorSkill,
                trace,
                sample.EnginePowerFraction,
                InDistribution);
            checksum += result.StudentBestLogit
                + result.StudentCandidateIndex
                + result.ExactCandidateIndex;
        }
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

        GC.KeepAlive(checksum);
        Assert.Equal(0, allocated);
        Assert.Equal(
            (WarmupIterations + MeasuredIterations) * 9L
                + MeasuredIterations * (3 + 3),
            checksum);
    }

    [Fact]
    public void ConstructorRejectsMismatchedContractsAndUnsafeInputScale() {
        PlannerIntegerRanker correctRanker = Ranker(
            PlannerDistillationFeatures.FeatureCount,
            [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        PlannerIntegerRanker wrongRanker = Ranker(
            PlannerDistillationFeatures.FeatureCount - 1,
            [0, 1, 2, 3, 4, 5, 6, 7, 8]);

        Assert.Throws<ArgumentException>(() => new PlannerShadowEvaluator(
            correctRanker,
            "wrong-feature-schema",
            PlannerDistillationFeatures.NormalizationSchema,
            PlannerDistillationFeatures.FeatureCount,
            PlannerShadowEvaluator.MinimumInputScale,
            PlannerShadowSkillMask.Ace,
            PlannerShadowTacticMask.Acquire));
        Assert.Throws<ArgumentException>(() => new PlannerShadowEvaluator(
            correctRanker,
            PlannerDistillationFeatures.Schema,
            "wrong-normalization-schema",
            PlannerDistillationFeatures.FeatureCount,
            PlannerShadowEvaluator.MinimumInputScale,
            PlannerShadowSkillMask.Ace,
            PlannerShadowTacticMask.Acquire));
        Assert.Throws<ArgumentException>(() => new PlannerShadowEvaluator(
            wrongRanker,
            PlannerDistillationFeatures.Schema,
            PlannerDistillationFeatures.NormalizationSchema,
            PlannerDistillationFeatures.FeatureCount,
            PlannerShadowEvaluator.MinimumInputScale,
            PlannerShadowSkillMask.Ace,
            PlannerShadowTacticMask.Acquire));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new PlannerShadowEvaluator(
                correctRanker,
                PlannerDistillationFeatures.Schema,
                PlannerDistillationFeatures.NormalizationSchema,
                PlannerDistillationFeatures.FeatureCount,
                PlannerShadowEvaluator.MinimumInputScale * 0.5,
                PlannerShadowSkillMask.Ace,
                PlannerShadowTacticMask.Acquire));
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

    static PlannerShadowEvaluator Evaluator(
        int[] outputOrder,
        PlannerShadowSkillMask supportedSkills =
            PlannerShadowSkillMask.Ace,
        PlannerShadowTacticMask supportedTactics =
            PlannerShadowTacticMask.Acquire) =>
        new(
            Ranker(PlannerDistillationFeatures.FeatureCount, outputOrder),
            PlannerDistillationFeatures.Schema,
            PlannerDistillationFeatures.NormalizationSchema,
            PlannerDistillationFeatures.FeatureCount,
            PlannerShadowEvaluator.MinimumInputScale,
            supportedSkills,
            supportedTactics);

    static PlannerIntegerRanker Ranker(
        int inputCount,
        int[] outputOrder) {
        var biases = new int[PlannerIntegerRanker.CandidateCount];
        for (int rank = 0; rank < outputOrder.Length; rank++)
            biases[outputOrder[rank]] =
                PlannerIntegerRanker.CandidateCount - rank;
        return new PlannerIntegerRanker(
            inputCount,
            new sbyte[
                PlannerIntegerRanker.HiddenUnitCount * inputCount],
            new int[PlannerIntegerRanker.HiddenUnitCount],
            hiddenScaleShift: 0,
            new sbyte[
                PlannerIntegerRanker.CandidateCount
                * PlannerIntegerRanker.HiddenUnitCount],
            biases,
            outputScaleShift: 0);
    }

    static BanditDecisionTrace CompleteTrace(
        in BanditDecisionTrace source,
        int exactIndex,
        ushort availabilityMask) {
        var candidates = new BanditDecisionCandidate[
            BanditDecisionTrace.CandidateCapacity];
        for (int index = 0; index < candidates.Length; index++) {
            BanditDecisionCandidate candidate = source.CandidateAt(index);
            candidates[index] = candidate with {
                Id = index,
                Score = index == exactIndex ? 100.0 : 90.0 - index,
                HasScore = true,
                Available = (availabilityMask & (1 << index)) != 0
            };
        }
        if (!candidates[exactIndex].Available)
            throw new ArgumentOutOfRangeException(nameof(exactIndex));

        return new BanditDecisionTrace(
            SelectionSequence: source.SelectionSequence,
            Skill: source.Skill,
            SelectedCommand: candidates[exactIndex].Command,
            SelectedCandidateIndex: exactIndex,
            CandidateCount: BanditDecisionTrace.CandidateCapacity,
            candidates[0],
            candidates[1],
            candidates[2],
            candidates[3],
            candidates[4],
            candidates[5],
            candidates[6],
            candidates[7],
            candidates[8]);
    }
}
