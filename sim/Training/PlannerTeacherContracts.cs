using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>
/// Versioned causal context shared by every planner-teacher sample emitted by the seeded headless
/// runner. The current runner has no terrain or wind input and invokes the ReactiveBandit planner
/// synchronously inside the authoritative fixed simulation tick.
/// </summary>
public readonly record struct PlannerTeacherCaptureContext(
    string Schema,
    string ScenarioSchema,
    string SeedGeneratorSchema,
    string ObservationSchema,
    string EnvironmentSchema,
    string PlannerExecutionSchema,
    double FixedDeltaSeconds,
    bool TerrainEnabled,
    bool WindEnabled) {

    public const string SchemaV1 = "guns-only.planner-teacher-capture-context.v1";
    public const string FlatCalmEnvironmentV1 = "guns-only.environment.flat-calm.v1";
    public const string SynchronousPlannerExecutionV1 =
        "guns-only.planner-execution.synchronous-selection-boundary.v1";

    /// <summary>The exact environment and timing contract used by SeededCombatBatchRunner.</summary>
    public static PlannerTeacherCaptureContext SeededFlatCalmV1 { get; } = new(
        SchemaV1,
        CombatDatasetJsonLines.ScenarioSchema,
        CombatDatasetJsonLines.SeedGeneratorSchema,
        CombatDatasetJsonLines.ObservationSchema,
        FlatCalmEnvironmentV1,
        SynchronousPlannerExecutionV1,
        SimulationSession.FixedDeltaSeconds,
        TerrainEnabled: false,
        WindEnabled: false);
}

/// <summary>
/// One immutable planner selection at the observation which causally produced it. Count-nine
/// lookahead traces are eligible teacher labels. Count-one tactical/preemption traces remain in the
/// stream for audit and sequence continuity, but are explicitly excluded from teacher training.
/// </summary>
public readonly record struct PlannerTeacherSample {
    internal PlannerTeacherSample(
        long decisionIndex,
        in CombatPolicyObservation planningObservation,
        in BanditPolicyMemory policyMemoryBefore,
        in BanditPolicyMemory policyMemoryAfter,
        in BanditDecisionTrace decisionTrace,
        PilotSkill behaviorSkill,
        double enginePowerFraction) {
        if (decisionIndex < 0L)
            throw new ArgumentOutOfRangeException(nameof(decisionIndex));
        if (!planningObservation.IsFinite
            || planningObservation.Tick != decisionIndex)
            throw new ArgumentException(
                "The planning observation must be the beginning-of-transition observation.",
                nameof(planningObservation));
        if (decisionTrace.SelectionSequence <= 0L)
            throw new ArgumentOutOfRangeException(nameof(decisionTrace));
        if (decisionTrace.Skill != behaviorSkill)
            throw new ArgumentException(
                "The trace skill must match the behavior policy which produced it.",
                nameof(decisionTrace));
        if (decisionTrace.CandidateCount is < 1
            or > BanditDecisionTrace.CandidateCapacity)
            throw new ArgumentOutOfRangeException(nameof(decisionTrace));
        if (decisionTrace.SelectedCandidateIndex < 0
            || decisionTrace.SelectedCandidateIndex >= decisionTrace.CandidateCount)
            throw new ArgumentOutOfRangeException(nameof(decisionTrace));
        if (!double.IsFinite(enginePowerFraction)
            || enginePowerFraction is < 0.0 or > 1.65)
            throw new ArgumentOutOfRangeException(nameof(enginePowerFraction));

        for (int index = 0; index < decisionTrace.CandidateCount; index++) {
            BanditDecisionCandidate candidate = decisionTrace.CandidateAt(index);
            if (candidate.Id != index)
                throw new ArgumentException(
                    "Planner candidates must retain their declared deterministic order.",
                    nameof(decisionTrace));
            if (candidate.HasScore && !double.IsFinite(candidate.Score))
                throw new ArgumentException(
                    "Present planner scores must be finite.",
                    nameof(decisionTrace));
            if (decisionTrace.CandidateCount == BanditDecisionTrace.CandidateCapacity
                && candidate.Available
                && !candidate.HasScore)
                throw new ArgumentException(
                    "Every available lookahead candidate must retain its computed score.",
                    nameof(decisionTrace));
        }

        BanditDecisionCandidate selected =
            decisionTrace.CandidateAt(decisionTrace.SelectedCandidateIndex);
        if (!selected.Available || selected.Command != decisionTrace.SelectedCommand)
            throw new ArgumentException(
                "The selected trace slot must be available and match the applied selection.",
                nameof(decisionTrace));

        DecisionIndex = decisionIndex;
        PlanningObservation = planningObservation;
        PolicyMemoryBefore = policyMemoryBefore;
        PolicyMemoryAfter = policyMemoryAfter;
        DecisionTrace = decisionTrace;
        BehaviorSkill = behaviorSkill;
        EnginePowerFraction = enginePowerFraction;
        IsTeacherEligible =
            decisionTrace.CandidateCount == BanditDecisionTrace.CandidateCapacity;
    }

    /// <summary>The decision index of the transition whose observation produced this selection.</summary>
    public long DecisionIndex { get; }

    /// <summary>The beginning-of-tick, belief-limited observation read by the behavior policy.</summary>
    public CombatPolicyObservation PlanningObservation { get; }

    /// <summary>Actor-visible recurrent state immediately before the synchronous policy step.</summary>
    public BanditPolicyMemory PolicyMemoryBefore { get; }

    /// <summary>Actor-visible recurrent state immediately after the synchronous policy step.</summary>
    public BanditPolicyMemory PolicyMemoryAfter { get; }

    /// <summary>The complete fixed-slot trace emitted by the selection.</summary>
    public BanditDecisionTrace DecisionTrace { get; }

    /// <summary>The configured behavior tier, repeated here so an extracted sample is self-describing.</summary>
    public PilotSkill BehaviorSkill { get; }

    /// <summary>
    /// Actor-local engine state at the planning boundary. Exact rollouts seed their throwaway
    /// aircraft from this value, so omitting it would leave a causal teacher input hidden.
    /// </summary>
    public double EnginePowerFraction { get; }

    /// <summary>
    /// True only for the complete nine-candidate lookahead selection used as a teacher label.
    /// Count-one tactical/preemption selections deliberately remain false.
    /// </summary>
    public bool IsTeacherEligible { get; }
}

/// <summary>
/// One frozen combat episode and its causally aligned planner selections. Construction is internal
/// so only the authenticated seeded runner can claim this provenance.
/// </summary>
public sealed class PlannerTeacherEpisode {
    internal PlannerTeacherEpisode(
        CombatEpisode combatEpisode,
        PilotSkill referenceSkill,
        PilotSkill behaviorSkill,
        in PlannerTeacherCaptureContext context,
        IReadOnlyList<PlannerTeacherSample> samples) {
        ArgumentNullException.ThrowIfNull(combatEpisode);
        ArgumentNullException.ThrowIfNull(samples);
        if (context != PlannerTeacherCaptureContext.SeededFlatCalmV1)
            throw new ArgumentException(
                "The seeded runner currently supports only its v1 flat/calm context.",
                nameof(context));

        PlannerTeacherSample[] frozenSamples = samples.ToArray();
        int selectedTransitionCount = combatEpisode.Transitions.Count(
            transition => transition.Action.ManeuverSelected);
        if (frozenSamples.Length != selectedTransitionCount)
            throw new ArgumentException(
                "Every selected combat transition must have exactly one teacher trace.",
                nameof(samples));

        long previousDecisionIndex = -1L;
        long previousSelectionSequence = 0L;
        for (int index = 0; index < frozenSamples.Length; index++) {
            PlannerTeacherSample sample = frozenSamples[index];
            if (sample.BehaviorSkill != behaviorSkill
                || sample.DecisionTrace.Skill != behaviorSkill)
                throw new ArgumentException(
                    "Every sample must come from the episode's behavior policy.",
                    nameof(samples));
            if (sample.DecisionIndex <= previousDecisionIndex
                || sample.DecisionTrace.SelectionSequence
                    <= previousSelectionSequence)
                throw new ArgumentException(
                    "Decision indices and selection sequences must be strictly monotonic.",
                    nameof(samples));
            if (sample.DecisionIndex >= combatEpisode.Transitions.Count)
                throw new ArgumentOutOfRangeException(nameof(samples));

            CombatTransition transition =
                combatEpisode.Transitions[(int)sample.DecisionIndex];
            PilotCommand selectedCommand = sample.DecisionTrace.SelectedCommand;
            if (transition.DecisionIndex != sample.DecisionIndex
                || transition.Observation != sample.PlanningObservation
                || !transition.Action.ManeuverSelected
                || transition.Action.GDemand != selectedCommand.GDemand
                || transition.Action.BankTargetRad != selectedCommand.BankTarget
                || transition.Action.Throttle != selectedCommand.Throttle
                || transition.Action.Rudder != selectedCommand.Rudder)
                throw new ArgumentException(
                    "A teacher sample must align with the selected transition it labels.",
                    nameof(samples));

            double beforeTolerance = System.Math.Max(
                1e-12,
                System.Math.Abs(sample.PlanningObservation.ElapsedSeconds) * 1e-12);
            double afterTolerance = System.Math.Max(
                1e-12,
                System.Math.Abs(transition.NextObservation.ElapsedSeconds) * 1e-12);
            if (!double.IsFinite(sample.PolicyMemoryBefore.EngagementSeconds)
                || !double.IsFinite(sample.PolicyMemoryAfter.EngagementSeconds)
                || System.Math.Abs(
                    sample.PolicyMemoryBefore.EngagementSeconds
                    - sample.PlanningObservation.ElapsedSeconds) > beforeTolerance
                || System.Math.Abs(
                    sample.PolicyMemoryAfter.EngagementSeconds
                    - transition.NextObservation.ElapsedSeconds) > afterTolerance)
                throw new ArgumentException(
                    "Policy memory must straddle the same authoritative transition.",
                    nameof(samples));

            previousDecisionIndex = sample.DecisionIndex;
            previousSelectionSequence =
                sample.DecisionTrace.SelectionSequence;
        }

        CombatEpisode = combatEpisode;
        ReferenceSkill = referenceSkill;
        BehaviorSkill = behaviorSkill;
        Context = context;
        Samples = Array.AsReadOnly(frozenSamples);
    }

    public CombatEpisode CombatEpisode { get; }
    public int EpisodeIndex => CombatEpisode.EpisodeIndex;
    public string ScenarioId => CombatEpisode.ScenarioId;
    public ulong Seed => CombatEpisode.Seed;
    public PilotSkill ReferenceSkill { get; }
    public PilotSkill BehaviorSkill { get; }
    public PlannerTeacherCaptureContext Context { get; }
    public IReadOnlyList<PlannerTeacherSample> Samples { get; }
    public int EligibleSampleCount => Samples.Count(sample => sample.IsTeacherEligible);
}

/// <summary>
/// A deterministic seeded batch with the original transition artifact and a parallel immutable
/// planner-teacher view captured from the same physics run.
/// </summary>
public sealed class PlannerTeacherBatch {
    internal PlannerTeacherBatch(
        CombatTrainingBatchConfig config,
        in PlannerTeacherCaptureContext context,
        IReadOnlyList<PlannerTeacherEpisode> episodes) {
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(episodes);
        if (context != PlannerTeacherCaptureContext.SeededFlatCalmV1)
            throw new ArgumentException(
                "The seeded runner currently supports only its v1 flat/calm context.",
                nameof(context));

        PlannerTeacherEpisode[] frozenEpisodes = episodes.ToArray();
        if (frozenEpisodes.Length != config.EpisodeCount)
            throw new ArgumentException(
                "The captured episode count must match the validated batch config.",
                nameof(episodes));
        for (int index = 0; index < frozenEpisodes.Length; index++) {
            PlannerTeacherEpisode episode = frozenEpisodes[index];
            if (episode.EpisodeIndex != index
                || episode.ReferenceSkill != config.ReferenceSkill
                || episode.BehaviorSkill != config.BehaviorSkill
                || episode.Context != context)
                throw new ArgumentException(
                    "Captured episode provenance must match the batch config and order.",
                    nameof(episodes));
        }

        Config = config;
        Context = context;
        Episodes = Array.AsReadOnly(frozenEpisodes);
        CombatBatch = new CombatTrainingBatch(
            config,
            frozenEpisodes.Select(episode => episode.CombatEpisode).ToArray());
    }

    public CombatTrainingBatchConfig Config { get; }
    public PlannerTeacherCaptureContext Context { get; }
    public CombatTrainingBatch CombatBatch { get; }
    public IReadOnlyList<PlannerTeacherEpisode> Episodes { get; }
    public int SampleCount => Episodes.Sum(episode => episode.Samples.Count);
    public int EligibleSampleCount =>
        Episodes.Sum(episode => episode.EligibleSampleCount);
}
