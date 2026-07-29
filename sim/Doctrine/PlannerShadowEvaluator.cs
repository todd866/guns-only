using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Pilot tiers represented by one planner-ranker artifact. The mask is model provenance, not a
/// request to broaden inference beyond the data used to train that artifact.
/// </summary>
[Flags]
public enum PlannerShadowSkillMask : byte {
    None = 0,
    Novice = 1 << (int)PilotSkill.Novice,
    Competent = 1 << (int)PilotSkill.Competent,
    Veteran = 1 << (int)PilotSkill.Veteran,
    Ace = 1 << (int)PilotSkill.Ace,
    Machine = 1 << (int)PilotSkill.Machine,
    All = Novice | Competent | Veteran | Ace | Machine
}

/// <summary>Tactical states represented by one planner-ranker artifact.</summary>
[Flags]
public enum PlannerShadowTacticMask : byte {
    None = 0,
    Acquire = 1 << (int)BanditTactic.Acquire,
    Defend = 1 << (int)BanditTactic.Defend,
    Energy = 1 << (int)BanditTactic.Energy,
    Return = 1 << (int)BanditTactic.Return,
    All = Acquire | Defend | Energy | Return
}

/// <summary>
/// Why a shadow result was withheld. These are deliberately independent bits so telemetry can
/// distinguish unsupported operating conditions from malformed planner evidence.
/// </summary>
[Flags]
public enum PlannerShadowOodReason : uint {
    None = 0,
    ObservationInvalid = 1 << 0,
    TraceNotFull = 1 << 1,
    CandidateTableInvalid = 1 << 2,
    NoAvailableCandidate = 1 << 3,
    AvailableScoreMissing = 1 << 4,
    AvailableScoreNonFinite = 1 << 5,
    SelectedCandidateInvalid = 1 << 6,
    ExactSelectionMismatch = 1 << 7,
    SkillUnsupported = 1 << 8,
    TacticUnsupported = 1 << 9,
    TerrainNotFlat = 1 << 10,
    WindNotCalm = 1 << 11,
    FormationNotIndependent = 1 << 12,
    DoctrineUnsupported = 1 << 13,
    BossProfile = 1 << 14,
    ContactTimingInvalid = 1 << 15,
    ContactStale = 1 << 16,
    ContactLowConfidence = 1 << 17,
    FeatureSourceNonFinite = 1 << 18,
    FeatureClipped = 1 << 19,
    QuantizationOutOfRange = 1 << 20,
    AirframeUnsupported = 1 << 21,
    ProfileUnsupported = 1 << 22,
    AtmosphereUnsupported = 1 << 23,
    EnginePowerInvalid = 1 << 24
}

/// <summary>
/// Runtime facts which are intentionally absent from the body-relative feature vector. The first
/// artifact is trained only on the seeded runner's flat, calm, doctrine-zero, non-boss envelope.
/// </summary>
public readonly record struct PlannerShadowRuntimeContext(
    bool FlatTerrain,
    bool CalmWind,
    int DoctrineIndex,
    bool IsBoss,
    bool AirframeMatchesArtifact,
    bool ProfileMatchesArtifact,
    bool AtmosphereMatchesArtifact) {

    public static PlannerShadowRuntimeContext FlatCalmDoctrineZero { get; } =
        new(
            FlatTerrain: true,
            CalmWind: true,
            DoctrineIndex: 0,
            IsBoss: false,
            AirframeMatchesArtifact: true,
            ProfileMatchesArtifact: true,
            AtmosphereMatchesArtifact: true);
}

/// <summary>
/// Immutable diagnostic from one exact-planner/student comparison. It contains no
/// <see cref="PilotCommand"/>, so a shadow evaluation cannot become flight-control authority.
/// </summary>
public readonly record struct PlannerShadowResult(
    bool Evaluated,
    int ExactCandidateIndex,
    int StudentCandidateIndex,
    int StudentRunnerUpCandidateIndex,
    bool Agreement,
    int StudentBestLogit,
    int StudentRunnerUpLogit,
    long IntegerMargin,
    ushort AvailabilityMask,
    ushort ScorePresenceMask,
    ushort FiniteScoreMask,
    ulong FeatureClipBitsLow,
    ulong FeatureClipBitsHigh,
    PlannerShadowOodReason OodReasons,
    int StudentThirdCandidateIndex = -1,
    bool ExactInStudentTopThree = false,
    double PositiveRelativeRegret = double.NaN) {

    public bool IsOutOfDistribution => OodReasons != PlannerShadowOodReason.None;
}

/// <summary>
/// Allocation-free shadow inference around <see cref="PlannerIntegerRanker"/>. Candidate
/// generation, exact scores, selection, and command application remain authoritative C#. This
/// class only reports whether an integer student would have ranked the same already-legal slot.
/// </summary>
public sealed class PlannerShadowEvaluator {
    public const string QuantizationRounding = "nearest-even";
    public const int DefaultMaximumContactAgeTicks = 120;
    public const double DefaultMinimumContactConfidence = 0.5;
    public const double MinimumInputScale = 1.0 / short.MaxValue;

    readonly PlannerIntegerRanker _ranker;
    readonly PlannerShadowSkillMask _supportedSkills;
    readonly PlannerShadowTacticMask _supportedTactics;

    public string FeatureSchema { get; }
    public string NormalizationSchema { get; }
    public int FeatureCount { get; }
    public double InputScale { get; }
    public int MaximumContactAgeTicks { get; }
    public double MinimumContactConfidence { get; }
    public PlannerShadowSkillMask SupportedSkills => _supportedSkills;
    public PlannerShadowTacticMask SupportedTactics => _supportedTactics;

    /// <param name="ranker">Validated integer inference kernel.</param>
    /// <param name="featureSchema">Pinned feature schema copied from model provenance.</param>
    /// <param name="normalizationSchema">
    /// Pinned normalization schema copied from model provenance.
    /// </param>
    /// <param name="featureCount">Pinned feature count copied from the model artifact.</param>
    /// <param name="inputScale">
    /// Real value represented by one int16 input step. Quantization is
    /// <c>Round(normalized / inputScale, ToEven)</c>, matching the trainer manifest.
    /// </param>
    /// <param name="supportedSkills">Only tiers represented by the training artifact.</param>
    /// <param name="supportedTactics">
    /// Only tactical states represented by the training artifact.
    /// </param>
    public PlannerShadowEvaluator(
        PlannerIntegerRanker ranker,
        string featureSchema,
        string normalizationSchema,
        int featureCount,
        double inputScale,
        PlannerShadowSkillMask supportedSkills,
        PlannerShadowTacticMask supportedTactics,
        int maximumContactAgeTicks = DefaultMaximumContactAgeTicks,
        double minimumContactConfidence = DefaultMinimumContactConfidence) {
        ArgumentNullException.ThrowIfNull(ranker);
        if (!string.Equals(
                featureSchema,
                PlannerDistillationFeatures.Schema,
                StringComparison.Ordinal))
            throw new ArgumentException(
                "The model feature schema does not match the runtime projector.",
                nameof(featureSchema));
        if (!string.Equals(
                normalizationSchema,
                PlannerDistillationFeatures.NormalizationSchema,
                StringComparison.Ordinal))
            throw new ArgumentException(
                "The model normalization schema does not match the runtime projector.",
                nameof(normalizationSchema));
        if (featureCount != PlannerDistillationFeatures.FeatureCount
            || ranker.InputCount != featureCount)
            throw new ArgumentException(
                "The model input count does not match the runtime feature contract.",
                nameof(featureCount));
        if (!double.IsFinite(inputScale)
            || inputScale < MinimumInputScale
            || inputScale > 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(inputScale),
                $"Input scale must be finite and in [{MinimumInputScale:R}, 1].");
        if (supportedSkills == PlannerShadowSkillMask.None
            || (supportedSkills & ~PlannerShadowSkillMask.All) != 0)
            throw new ArgumentOutOfRangeException(nameof(supportedSkills));
        if (supportedTactics == PlannerShadowTacticMask.None
            || (supportedTactics & ~PlannerShadowTacticMask.All) != 0)
            throw new ArgumentOutOfRangeException(nameof(supportedTactics));
        if (maximumContactAgeTicks < 0)
            throw new ArgumentOutOfRangeException(nameof(maximumContactAgeTicks));
        if (!double.IsFinite(minimumContactConfidence)
            || minimumContactConfidence is < 0.0 or > 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(minimumContactConfidence));

        _ranker = ranker;
        _supportedSkills = supportedSkills;
        _supportedTactics = supportedTactics;
        FeatureSchema = PlannerDistillationFeatures.Schema;
        NormalizationSchema =
            PlannerDistillationFeatures.NormalizationSchema;
        FeatureCount = featureCount;
        InputScale = inputScale;
        MaximumContactAgeTicks = maximumContactAgeTicks;
        MinimumContactConfidence = minimumContactConfidence;
    }

    /// <summary>
    /// Compares the integer student with a completed exact trace. A skipped result still reports
    /// every mask and any safely recoverable exact index for OOD telemetry. No command is returned
    /// or modified.
    /// </summary>
    public PlannerShadowResult Evaluate(
        in CombatPolicyObservation observation,
        in BanditPolicyMemory memory,
        PilotSkill skill,
        in BanditDecisionTrace trace,
        double enginePowerFraction,
        in PlannerShadowRuntimeContext runtimeContext) {
        PlannerShadowOodReason reasons = PlannerShadowOodReason.None;
        ushort availabilityMask = 0;
        ushort scorePresenceMask = 0;
        ushort finiteScoreMask = 0;
        int exactCandidateIndex = -1;
        double exactScore = double.NaN;
        double worstAvailableScore = double.PositiveInfinity;

        if (!observation.IsFinite)
            reasons |= PlannerShadowOodReason.ObservationInvalid;
        if (trace.CandidateCount != BanditDecisionTrace.CandidateCapacity)
            reasons |= PlannerShadowOodReason.TraceNotFull;
        if (!TrySkillMask(skill, out PlannerShadowSkillMask skillMask)
            || (_supportedSkills & skillMask) == 0)
            reasons |= PlannerShadowOodReason.SkillUnsupported;
        if (!TryTacticMask(
                memory.Tactic,
                out PlannerShadowTacticMask tacticMask)
            || (_supportedTactics & tacticMask) == 0)
            reasons |= PlannerShadowOodReason.TacticUnsupported;
        if (!runtimeContext.FlatTerrain)
            reasons |= PlannerShadowOodReason.TerrainNotFlat;
        if (!runtimeContext.CalmWind)
            reasons |= PlannerShadowOodReason.WindNotCalm;
        if (memory.FormationRole != FormationTacticalRole.Independent
            || memory.FormationLateralSign != 0)
            reasons |= PlannerShadowOodReason.FormationNotIndependent;
        if (runtimeContext.DoctrineIndex != 0)
            reasons |= PlannerShadowOodReason.DoctrineUnsupported;
        if (runtimeContext.IsBoss)
            reasons |= PlannerShadowOodReason.BossProfile;
        if (!double.IsFinite(enginePowerFraction)
            || enginePowerFraction is < 0.0 or > 1.65)
            reasons |= PlannerShadowOodReason.EnginePowerInvalid;
        if (!runtimeContext.AirframeMatchesArtifact)
            reasons |= PlannerShadowOodReason.AirframeUnsupported;
        if (!runtimeContext.ProfileMatchesArtifact)
            reasons |= PlannerShadowOodReason.ProfileUnsupported;
        if (!runtimeContext.AtmosphereMatchesArtifact)
            reasons |= PlannerShadowOodReason.AtmosphereUnsupported;

        if (observation.IsFinite) {
            ActorObservation contact = observation.Contact;
            long sourceAgeTicks = observation.Tick - contact.SourceTick;
            if (contact.SourceTick > observation.Tick
                || sourceAgeTicks != contact.ObservationAgeTicks)
                reasons |= PlannerShadowOodReason.ContactTimingInvalid;
            if (contact.ObservationAgeTicks > MaximumContactAgeTicks)
                reasons |= PlannerShadowOodReason.ContactStale;
            if (contact.Confidence < MinimumContactConfidence)
                reasons |= PlannerShadowOodReason.ContactLowConfidence;
        }

        if (trace.CandidateCount == BanditDecisionTrace.CandidateCapacity) {
            exactScore = double.NegativeInfinity;
            for (int candidateIndex = 0;
                candidateIndex < BanditDecisionTrace.CandidateCapacity;
                candidateIndex++) {
                BanditDecisionCandidate candidate =
                    trace.CandidateAt(candidateIndex);
                ushort bit = (ushort)(1 << candidateIndex);
                if (candidate.Id != candidateIndex)
                    reasons |= PlannerShadowOodReason.CandidateTableInvalid;
                if (candidate.Available)
                    availabilityMask |= bit;
                if (candidate.HasScore)
                    scorePresenceMask |= bit;
                if (candidate.HasScore && double.IsFinite(candidate.Score))
                    finiteScoreMask |= bit;

                if (!candidate.Available)
                    continue;
                if (!candidate.HasScore) {
                    reasons |= PlannerShadowOodReason.AvailableScoreMissing;
                    continue;
                }
                if (!double.IsFinite(candidate.Score)) {
                    reasons |= PlannerShadowOodReason.AvailableScoreNonFinite;
                    continue;
                }
                worstAvailableScore = System.Math.Min(
                    worstAvailableScore,
                    candidate.Score);
                if (exactCandidateIndex < 0 || candidate.Score > exactScore) {
                    exactCandidateIndex = candidateIndex;
                    exactScore = candidate.Score;
                }
            }

            if (availabilityMask == 0)
                reasons |= PlannerShadowOodReason.NoAvailableCandidate;
            if ((availabilityMask & scorePresenceMask) != availabilityMask)
                reasons |= PlannerShadowOodReason.AvailableScoreMissing;
            ushort presentAvailableMask =
                (ushort)(availabilityMask & scorePresenceMask);
            if ((presentAvailableMask & finiteScoreMask)
                != presentAvailableMask)
                reasons |= PlannerShadowOodReason.AvailableScoreNonFinite;

            bool selectedIndexValid =
                trace.SelectedCandidateIndex is >= 0
                    and < BanditDecisionTrace.CandidateCapacity;
            if (!selectedIndexValid
                || (availabilityMask
                    & (1 << trace.SelectedCandidateIndex)) == 0
                || (finiteScoreMask
                    & (1 << trace.SelectedCandidateIndex)) == 0)
                reasons |= PlannerShadowOodReason.SelectedCandidateInvalid;
            else if (trace.CandidateAt(trace.SelectedCandidateIndex).Command
                != trace.SelectedCommand)
                reasons |= PlannerShadowOodReason.SelectedCandidateInvalid;

            if (exactCandidateIndex >= 0
                && exactCandidateIndex != trace.SelectedCandidateIndex)
                reasons |= PlannerShadowOodReason.ExactSelectionMismatch;
            if ((reasons
                & (PlannerShadowOodReason.AvailableScoreMissing
                    | PlannerShadowOodReason.AvailableScoreNonFinite)) != 0)
                exactCandidateIndex = -1;
        }

        if (reasons != PlannerShadowOodReason.None)
            return Skipped(
                exactCandidateIndex,
                availabilityMask,
                scorePresenceMask,
                finiteScoreMask,
                reasons);

        Span<double> normalized =
            stackalloc double[PlannerDistillationFeatures.FeatureCount];
        PlannerDistillationFeatures.Write(
            observation,
            memory,
            skill,
            trace,
            enginePowerFraction,
            normalized,
            out PlannerFeatureQuality quality);
        if (!quality.AllFinite)
            reasons |= PlannerShadowOodReason.FeatureSourceNonFinite;
        if (quality.AnyClipped)
            reasons |= PlannerShadowOodReason.FeatureClipped;
        if (reasons != PlannerShadowOodReason.None)
            return Skipped(
                exactCandidateIndex,
                availabilityMask,
                scorePresenceMask,
                finiteScoreMask,
                reasons,
                quality.ClipBitsLow,
                quality.ClipBitsHigh);

        Span<short> quantized =
            stackalloc short[PlannerDistillationFeatures.FeatureCount];
        for (int featureIndex = 0;
            featureIndex < PlannerDistillationFeatures.FeatureCount;
            featureIndex++) {
            double integerValue = System.Math.Round(
                normalized[featureIndex] / InputScale,
                MidpointRounding.ToEven);
            if (!double.IsFinite(integerValue)
                || integerValue < short.MinValue
                || integerValue > short.MaxValue) {
                reasons |= PlannerShadowOodReason.QuantizationOutOfRange;
                return Skipped(
                    exactCandidateIndex,
                    availabilityMask,
                    scorePresenceMask,
                    finiteScoreMask,
                    reasons,
                    quality.ClipBitsLow,
                    quality.ClipBitsHigh);
            }
            quantized[featureIndex] = (short)integerValue;
        }

        Span<int> logits =
            stackalloc int[PlannerIntegerRanker.CandidateCount];
        PlannerIntegerRankerResult student =
            _ranker.Evaluate(quantized, availabilityMask, logits);
        int studentThirdCandidateIndex = FindThirdCandidateIndex(
            logits,
            availabilityMask,
            student.SelectedCandidateIndex,
            student.RunnerUpCandidateIndex);
        bool exactInStudentTopThree =
            exactCandidateIndex == student.SelectedCandidateIndex
            || exactCandidateIndex == student.RunnerUpCandidateIndex
            || exactCandidateIndex == studentThirdCandidateIndex;
        double studentScore =
            trace.CandidateAt(student.SelectedCandidateIndex).Score;
        double scoreRange = System.Math.Max(
            exactScore - worstAvailableScore,
            1e-9);
        double positiveRelativeRegret = System.Math.Max(
            0.0,
            exactScore - studentScore) / scoreRange;
        return new PlannerShadowResult(
            Evaluated: true,
            ExactCandidateIndex: exactCandidateIndex,
            StudentCandidateIndex: student.SelectedCandidateIndex,
            StudentRunnerUpCandidateIndex: student.RunnerUpCandidateIndex,
            Agreement:
                student.SelectedCandidateIndex == exactCandidateIndex,
            StudentBestLogit: student.BestLogit,
            StudentRunnerUpLogit: student.RunnerUpLogit,
            IntegerMargin: student.Margin,
            AvailabilityMask: availabilityMask,
            ScorePresenceMask: scorePresenceMask,
            FiniteScoreMask: finiteScoreMask,
            FeatureClipBitsLow: quality.ClipBitsLow,
            FeatureClipBitsHigh: quality.ClipBitsHigh,
            OodReasons: PlannerShadowOodReason.None,
            StudentThirdCandidateIndex: studentThirdCandidateIndex,
            ExactInStudentTopThree: exactInStudentTopThree,
            PositiveRelativeRegret: positiveRelativeRegret);
    }

    static PlannerShadowResult Skipped(
        int exactCandidateIndex,
        ushort availabilityMask,
        ushort scorePresenceMask,
        ushort finiteScoreMask,
        PlannerShadowOodReason reasons,
        ulong featureClipBitsLow = 0,
        ulong featureClipBitsHigh = 0) =>
        new(
            Evaluated: false,
            ExactCandidateIndex: exactCandidateIndex,
            StudentCandidateIndex: -1,
            StudentRunnerUpCandidateIndex: -1,
            Agreement: false,
            StudentBestLogit: 0,
            StudentRunnerUpLogit: 0,
            IntegerMargin: 0,
            AvailabilityMask: availabilityMask,
            ScorePresenceMask: scorePresenceMask,
            FiniteScoreMask: finiteScoreMask,
            FeatureClipBitsLow: featureClipBitsLow,
            FeatureClipBitsHigh: featureClipBitsHigh,
            OodReasons: reasons);

    static int FindThirdCandidateIndex(
        ReadOnlySpan<int> logits,
        ushort availabilityMask,
        int bestCandidateIndex,
        int runnerUpCandidateIndex) {
        int thirdCandidateIndex = -1;
        int thirdLogit = 0;
        for (int candidateIndex = 0;
            candidateIndex < PlannerIntegerRanker.CandidateCount;
            candidateIndex++) {
            if ((availabilityMask & (1 << candidateIndex)) == 0
                || candidateIndex == bestCandidateIndex
                || candidateIndex == runnerUpCandidateIndex)
                continue;
            int logit = logits[candidateIndex];
            if (thirdCandidateIndex < 0 || logit > thirdLogit) {
                thirdCandidateIndex = candidateIndex;
                thirdLogit = logit;
            }
        }
        return thirdCandidateIndex;
    }

    static bool TrySkillMask(
        PilotSkill skill,
        out PlannerShadowSkillMask skillMask) {
        skillMask = skill switch {
            PilotSkill.Novice => PlannerShadowSkillMask.Novice,
            PilotSkill.Competent => PlannerShadowSkillMask.Competent,
            PilotSkill.Veteran => PlannerShadowSkillMask.Veteran,
            PilotSkill.Ace => PlannerShadowSkillMask.Ace,
            PilotSkill.Machine => PlannerShadowSkillMask.Machine,
            _ => PlannerShadowSkillMask.None
        };
        return skillMask != PlannerShadowSkillMask.None;
    }

    static bool TryTacticMask(
        BanditTactic tactic,
        out PlannerShadowTacticMask tacticMask) {
        tacticMask = tactic switch {
            BanditTactic.Acquire => PlannerShadowTacticMask.Acquire,
            BanditTactic.Defend => PlannerShadowTacticMask.Defend,
            BanditTactic.Energy => PlannerShadowTacticMask.Energy,
            BanditTactic.Return => PlannerShadowTacticMask.Return,
            _ => PlannerShadowTacticMask.None
        };
        return tacticMask != PlannerShadowTacticMask.None;
    }
}
