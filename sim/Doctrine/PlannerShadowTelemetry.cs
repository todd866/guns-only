using System.Numerics;

namespace GunsOnly.Sim.Doctrine;

/// <summary>Per-reason occurrence counts for shadow evaluations.</summary>
public readonly record struct PlannerShadowOodCounts(
    ulong ObservationInvalid,
    ulong TraceNotFull,
    ulong CandidateTableInvalid,
    ulong NoAvailableCandidate,
    ulong AvailableScoreMissing,
    ulong AvailableScoreNonFinite,
    ulong SelectedCandidateInvalid,
    ulong ExactSelectionMismatch,
    ulong SkillUnsupported,
    ulong TacticUnsupported,
    ulong TerrainNotFlat,
    ulong WindNotCalm,
    ulong FormationNotIndependent,
    ulong DoctrineUnsupported,
    ulong BossProfile,
    ulong ContactTimingInvalid,
    ulong ContactStale,
    ulong ContactLowConfidence,
    ulong FeatureSourceNonFinite,
    ulong FeatureClipped,
    ulong QuantizationOutOfRange,
    ulong AirframeUnsupported,
    ulong ProfileUnsupported,
    ulong AtmosphereUnsupported,
    ulong EnginePowerInvalid,
    ulong UnknownReason);

/// <summary>
/// Candidate-mask and feature-clip telemetry. Slot totals count set bits, while observed masks
/// are the union of all bits seen since the last reset. Available-score non-finite counts use the
/// evaluator's inclusive definition: an available slot without a finite score includes a missing
/// score, so missing slots appear in both relevant diagnostics.
/// </summary>
public readonly record struct PlannerShadowMaskCounts(
    ulong PartialAvailabilityEvaluations,
    ulong AvailableScoreMissingEvaluations,
    ulong AvailableScoreNonFiniteEvaluations,
    ulong FeatureClippedEvaluations,
    ulong AvailableCandidateSlots,
    ulong ScorePresentCandidateSlots,
    ulong FiniteScoreCandidateSlots,
    ulong ClippedFeatureSlots,
    ushort ObservedAvailabilityMask,
    ushort ObservedScorePresenceMask,
    ushort ObservedFiniteScoreMask,
    ushort ObservedAvailableScoreMissingMask,
    ushort ObservedAvailableScoreNonFiniteMask,
    ulong ObservedFeatureClipBitsLow,
    ulong ObservedFeatureClipBitsHigh);

/// <summary>
/// Integer student-margin histogram. Margins are student logit differences, not planner regret.
/// </summary>
public readonly record struct PlannerShadowMarginCounts(
    ulong NonPositive,
    ulong OneToSeven,
    ulong EightToThirtyOne,
    ulong ThirtyTwoToOneHundredTwentySeven,
    ulong OneHundredTwentyEightToFiveHundredEleven,
    ulong FiveHundredTwelveOrMore);

/// <summary>
/// Immutable, allocation-free value snapshot of one shadow telemetry accumulator.
/// </summary>
public readonly record struct PlannerShadowTelemetrySnapshot(
    ulong TotalEvaluations,
    ulong EligibleEvaluations,
    ulong IneligibleEvaluations,
    ulong Agreements,
    ulong Disagreements,
    ulong ExactInStudentTopTwoEvaluations,
    PlannerShadowOodReason ObservedOodReasons,
    PlannerShadowOodCounts OodCounts,
    PlannerShadowMaskCounts MaskCounts,
    PlannerShadowMarginCounts MarginCounts,
    ulong ExactInStudentTopThreeEvaluations = 0,
    ulong PositiveRelativeRegretBillionths = 0) {

    public double MeanPositiveRelativeRegret =>
        EligibleEvaluations == 0
            ? 0.0
            : EligibleEvaluations == ulong.MaxValue
                || PositiveRelativeRegretBillionths == ulong.MaxValue
            ? double.NaN
            : PositiveRelativeRegretBillionths
                / (double)PlannerShadowTelemetry.RelativeRegretScale
                / EligibleEvaluations;

    /// <summary>
    /// Returns the occurrence count for one known OOD bit.
    /// </summary>
    public ulong GetOodReasonCount(PlannerShadowOodReason reason) =>
        reason switch {
            PlannerShadowOodReason.None => 0,
            PlannerShadowOodReason.ObservationInvalid =>
                OodCounts.ObservationInvalid,
            PlannerShadowOodReason.TraceNotFull => OodCounts.TraceNotFull,
            PlannerShadowOodReason.CandidateTableInvalid =>
                OodCounts.CandidateTableInvalid,
            PlannerShadowOodReason.NoAvailableCandidate =>
                OodCounts.NoAvailableCandidate,
            PlannerShadowOodReason.AvailableScoreMissing =>
                OodCounts.AvailableScoreMissing,
            PlannerShadowOodReason.AvailableScoreNonFinite =>
                OodCounts.AvailableScoreNonFinite,
            PlannerShadowOodReason.SelectedCandidateInvalid =>
                OodCounts.SelectedCandidateInvalid,
            PlannerShadowOodReason.ExactSelectionMismatch =>
                OodCounts.ExactSelectionMismatch,
            PlannerShadowOodReason.SkillUnsupported =>
                OodCounts.SkillUnsupported,
            PlannerShadowOodReason.TacticUnsupported =>
                OodCounts.TacticUnsupported,
            PlannerShadowOodReason.TerrainNotFlat =>
                OodCounts.TerrainNotFlat,
            PlannerShadowOodReason.WindNotCalm => OodCounts.WindNotCalm,
            PlannerShadowOodReason.FormationNotIndependent =>
                OodCounts.FormationNotIndependent,
            PlannerShadowOodReason.DoctrineUnsupported =>
                OodCounts.DoctrineUnsupported,
            PlannerShadowOodReason.BossProfile => OodCounts.BossProfile,
            PlannerShadowOodReason.ContactTimingInvalid =>
                OodCounts.ContactTimingInvalid,
            PlannerShadowOodReason.ContactStale => OodCounts.ContactStale,
            PlannerShadowOodReason.ContactLowConfidence =>
                OodCounts.ContactLowConfidence,
            PlannerShadowOodReason.FeatureSourceNonFinite =>
                OodCounts.FeatureSourceNonFinite,
            PlannerShadowOodReason.FeatureClipped =>
                OodCounts.FeatureClipped,
            PlannerShadowOodReason.QuantizationOutOfRange =>
                OodCounts.QuantizationOutOfRange,
            PlannerShadowOodReason.AirframeUnsupported =>
                OodCounts.AirframeUnsupported,
            PlannerShadowOodReason.ProfileUnsupported =>
                OodCounts.ProfileUnsupported,
            PlannerShadowOodReason.AtmosphereUnsupported =>
                OodCounts.AtmosphereUnsupported,
            PlannerShadowOodReason.EnginePowerInvalid =>
                OodCounts.EnginePowerInvalid,
            _ => throw new ArgumentOutOfRangeException(
                nameof(reason),
                reason,
                "Specify exactly one known OOD reason bit.")
        };
}

/// <summary>
/// Mutable, deterministic telemetry for one AI's shadow evaluator. Recording and snapshotting
/// allocate no memory. Counters saturate at <see cref="ulong.MaxValue"/> instead of wrapping.
/// This type is intentionally single-owner; callers should keep one instance per AI.
/// </summary>
public sealed class PlannerShadowTelemetry {
    public const ulong RelativeRegretScale = 1_000_000_000UL;

    const PlannerShadowOodReason KnownOodReasons =
        PlannerShadowOodReason.ObservationInvalid
        | PlannerShadowOodReason.TraceNotFull
        | PlannerShadowOodReason.CandidateTableInvalid
        | PlannerShadowOodReason.NoAvailableCandidate
        | PlannerShadowOodReason.AvailableScoreMissing
        | PlannerShadowOodReason.AvailableScoreNonFinite
        | PlannerShadowOodReason.SelectedCandidateInvalid
        | PlannerShadowOodReason.ExactSelectionMismatch
        | PlannerShadowOodReason.SkillUnsupported
        | PlannerShadowOodReason.TacticUnsupported
        | PlannerShadowOodReason.TerrainNotFlat
        | PlannerShadowOodReason.WindNotCalm
        | PlannerShadowOodReason.FormationNotIndependent
        | PlannerShadowOodReason.DoctrineUnsupported
        | PlannerShadowOodReason.BossProfile
        | PlannerShadowOodReason.ContactTimingInvalid
        | PlannerShadowOodReason.ContactStale
        | PlannerShadowOodReason.ContactLowConfidence
        | PlannerShadowOodReason.FeatureSourceNonFinite
        | PlannerShadowOodReason.FeatureClipped
        | PlannerShadowOodReason.QuantizationOutOfRange
        | PlannerShadowOodReason.AirframeUnsupported
        | PlannerShadowOodReason.ProfileUnsupported
        | PlannerShadowOodReason.AtmosphereUnsupported
        | PlannerShadowOodReason.EnginePowerInvalid;

    State _state;

    /// <summary>Records one immutable evaluator result without allocating.</summary>
    public void Record(in PlannerShadowResult result) {
        Add(ref _state.TotalEvaluations, 1);
        RecordMasks(result);
        RecordOodReasons(result.OodReasons);

        if (!result.Evaluated) {
            Add(ref _state.IneligibleEvaluations, 1);
            return;
        }

        Add(ref _state.EligibleEvaluations, 1);
        if (result.Agreement)
            Add(ref _state.Agreements, 1);
        else
            Add(ref _state.Disagreements, 1);

        if (result.ExactCandidateIndex is >= 0
                and < PlannerIntegerRanker.CandidateCount
            && (result.ExactCandidateIndex == result.StudentCandidateIndex
                || result.ExactCandidateIndex
                    == result.StudentRunnerUpCandidateIndex))
            Add(ref _state.ExactInStudentTopTwoEvaluations, 1);
        if (result.ExactInStudentTopThree)
            Add(ref _state.ExactInStudentTopThreeEvaluations, 1);
        if (double.IsFinite(result.PositiveRelativeRegret)
            && result.PositiveRelativeRegret >= 0.0) {
            double boundedRegret = System.Math.Min(
                result.PositiveRelativeRegret,
                1.0);
            ulong regretBillionths = (ulong)System.Math.Round(
                boundedRegret * RelativeRegretScale,
                MidpointRounding.ToEven);
            Add(
                ref _state.PositiveRelativeRegretBillionths,
                regretBillionths);
        }

        RecordMargin(result.IntegerMargin);
    }

    /// <summary>
    /// Merges a value snapshot, allowing per-AI snapshots to be combined without wrapping.
    /// </summary>
    public void Merge(in PlannerShadowTelemetrySnapshot snapshot) {
        Add(ref _state.TotalEvaluations, snapshot.TotalEvaluations);
        Add(ref _state.EligibleEvaluations, snapshot.EligibleEvaluations);
        Add(ref _state.IneligibleEvaluations, snapshot.IneligibleEvaluations);
        Add(ref _state.Agreements, snapshot.Agreements);
        Add(ref _state.Disagreements, snapshot.Disagreements);
        Add(
            ref _state.ExactInStudentTopTwoEvaluations,
            snapshot.ExactInStudentTopTwoEvaluations);
        Add(
            ref _state.ExactInStudentTopThreeEvaluations,
            snapshot.ExactInStudentTopThreeEvaluations);
        Add(
            ref _state.PositiveRelativeRegretBillionths,
            snapshot.PositiveRelativeRegretBillionths);
        _state.ObservedOodReasons |= snapshot.ObservedOodReasons;

        MergeOodCounts(snapshot.OodCounts);
        MergeMaskCounts(snapshot.MaskCounts);
        MergeMarginCounts(snapshot.MarginCounts);
    }

    /// <summary>Returns an immutable point-in-time value without changing the accumulator.</summary>
    public PlannerShadowTelemetrySnapshot GetSnapshot() =>
        new(
            _state.TotalEvaluations,
            _state.EligibleEvaluations,
            _state.IneligibleEvaluations,
            _state.Agreements,
            _state.Disagreements,
            _state.ExactInStudentTopTwoEvaluations,
            _state.ObservedOodReasons,
            new PlannerShadowOodCounts(
                _state.ObservationInvalid,
                _state.TraceNotFull,
                _state.CandidateTableInvalid,
                _state.NoAvailableCandidate,
                _state.AvailableScoreMissing,
                _state.AvailableScoreNonFinite,
                _state.SelectedCandidateInvalid,
                _state.ExactSelectionMismatch,
                _state.SkillUnsupported,
                _state.TacticUnsupported,
                _state.TerrainNotFlat,
                _state.WindNotCalm,
                _state.FormationNotIndependent,
                _state.DoctrineUnsupported,
                _state.BossProfile,
                _state.ContactTimingInvalid,
                _state.ContactStale,
                _state.ContactLowConfidence,
                _state.FeatureSourceNonFinite,
                _state.FeatureClipped,
                _state.QuantizationOutOfRange,
                _state.AirframeUnsupported,
                _state.ProfileUnsupported,
                _state.AtmosphereUnsupported,
                _state.EnginePowerInvalid,
                _state.UnknownReason),
            new PlannerShadowMaskCounts(
                _state.PartialAvailabilityEvaluations,
                _state.AvailableScoreMissingEvaluations,
                _state.AvailableScoreNonFiniteEvaluations,
                _state.FeatureClippedEvaluations,
                _state.AvailableCandidateSlots,
                _state.ScorePresentCandidateSlots,
                _state.FiniteScoreCandidateSlots,
                _state.ClippedFeatureSlots,
                _state.ObservedAvailabilityMask,
                _state.ObservedScorePresenceMask,
                _state.ObservedFiniteScoreMask,
                _state.ObservedAvailableScoreMissingMask,
                _state.ObservedAvailableScoreNonFiniteMask,
                _state.ObservedFeatureClipBitsLow,
                _state.ObservedFeatureClipBitsHigh),
            new PlannerShadowMarginCounts(
                _state.MarginNonPositive,
                _state.MarginOneToSeven,
                _state.MarginEightToThirtyOne,
                _state.MarginThirtyTwoToOneHundredTwentySeven,
                _state.MarginOneHundredTwentyEightToFiveHundredEleven,
                _state.MarginFiveHundredTwelveOrMore),
            _state.ExactInStudentTopThreeEvaluations,
            _state.PositiveRelativeRegretBillionths);

    /// <summary>Returns the current immutable snapshot and clears all accumulated state.</summary>
    public PlannerShadowTelemetrySnapshot Reset() {
        PlannerShadowTelemetrySnapshot snapshot = GetSnapshot();
        _state = default;
        return snapshot;
    }

    void RecordMasks(in PlannerShadowResult result) {
        const ushort allCandidates = PlannerIntegerRanker.AllCandidatesMask;
        ushort availability =
            (ushort)(result.AvailabilityMask & allCandidates);
        ushort scorePresence =
            (ushort)(result.ScorePresenceMask & allCandidates);
        ushort finiteScores =
            (ushort)(result.FiniteScoreMask & allCandidates);
        ushort missingScores =
            (ushort)(availability & ~scorePresence & allCandidates);
        ushort nonFiniteScores =
            (ushort)(availability
                & scorePresence
                & ~finiteScores
                & allCandidates);

        _state.ObservedAvailabilityMask |= availability;
        _state.ObservedScorePresenceMask |= scorePresence;
        _state.ObservedFiniteScoreMask |= finiteScores;
        _state.ObservedAvailableScoreMissingMask |= missingScores;
        _state.ObservedAvailableScoreNonFiniteMask |= nonFiniteScores;
        _state.ObservedFeatureClipBitsLow |= result.FeatureClipBitsLow;
        _state.ObservedFeatureClipBitsHigh |= result.FeatureClipBitsHigh;

        if (availability != allCandidates)
            Add(ref _state.PartialAvailabilityEvaluations, 1);
        if (missingScores != 0)
            Add(ref _state.AvailableScoreMissingEvaluations, 1);
        if (nonFiniteScores != 0)
            Add(ref _state.AvailableScoreNonFiniteEvaluations, 1);
        if ((result.FeatureClipBitsLow | result.FeatureClipBitsHigh) != 0)
            Add(ref _state.FeatureClippedEvaluations, 1);

        Add(
            ref _state.AvailableCandidateSlots,
            (ulong)BitOperations.PopCount((uint)availability));
        Add(
            ref _state.ScorePresentCandidateSlots,
            (ulong)BitOperations.PopCount((uint)scorePresence));
        Add(
            ref _state.FiniteScoreCandidateSlots,
            (ulong)BitOperations.PopCount((uint)finiteScores));
        Add(
            ref _state.ClippedFeatureSlots,
            (ulong)BitOperations.PopCount(result.FeatureClipBitsLow)
                + (ulong)BitOperations.PopCount(
                    result.FeatureClipBitsHigh));
    }

    void RecordOodReasons(PlannerShadowOodReason reasons) {
        _state.ObservedOodReasons |= reasons;
        if ((reasons & PlannerShadowOodReason.ObservationInvalid) != 0)
            Add(ref _state.ObservationInvalid, 1);
        if ((reasons & PlannerShadowOodReason.TraceNotFull) != 0)
            Add(ref _state.TraceNotFull, 1);
        if ((reasons & PlannerShadowOodReason.CandidateTableInvalid) != 0)
            Add(ref _state.CandidateTableInvalid, 1);
        if ((reasons & PlannerShadowOodReason.NoAvailableCandidate) != 0)
            Add(ref _state.NoAvailableCandidate, 1);
        if ((reasons & PlannerShadowOodReason.AvailableScoreMissing) != 0)
            Add(ref _state.AvailableScoreMissing, 1);
        if ((reasons & PlannerShadowOodReason.AvailableScoreNonFinite) != 0)
            Add(ref _state.AvailableScoreNonFinite, 1);
        if ((reasons & PlannerShadowOodReason.SelectedCandidateInvalid) != 0)
            Add(ref _state.SelectedCandidateInvalid, 1);
        if ((reasons & PlannerShadowOodReason.ExactSelectionMismatch) != 0)
            Add(ref _state.ExactSelectionMismatch, 1);
        if ((reasons & PlannerShadowOodReason.SkillUnsupported) != 0)
            Add(ref _state.SkillUnsupported, 1);
        if ((reasons & PlannerShadowOodReason.TacticUnsupported) != 0)
            Add(ref _state.TacticUnsupported, 1);
        if ((reasons & PlannerShadowOodReason.TerrainNotFlat) != 0)
            Add(ref _state.TerrainNotFlat, 1);
        if ((reasons & PlannerShadowOodReason.WindNotCalm) != 0)
            Add(ref _state.WindNotCalm, 1);
        if ((reasons & PlannerShadowOodReason.FormationNotIndependent) != 0)
            Add(ref _state.FormationNotIndependent, 1);
        if ((reasons & PlannerShadowOodReason.DoctrineUnsupported) != 0)
            Add(ref _state.DoctrineUnsupported, 1);
        if ((reasons & PlannerShadowOodReason.BossProfile) != 0)
            Add(ref _state.BossProfile, 1);
        if ((reasons & PlannerShadowOodReason.ContactTimingInvalid) != 0)
            Add(ref _state.ContactTimingInvalid, 1);
        if ((reasons & PlannerShadowOodReason.ContactStale) != 0)
            Add(ref _state.ContactStale, 1);
        if ((reasons & PlannerShadowOodReason.ContactLowConfidence) != 0)
            Add(ref _state.ContactLowConfidence, 1);
        if ((reasons & PlannerShadowOodReason.FeatureSourceNonFinite) != 0)
            Add(ref _state.FeatureSourceNonFinite, 1);
        if ((reasons & PlannerShadowOodReason.FeatureClipped) != 0)
            Add(ref _state.FeatureClipped, 1);
        if ((reasons & PlannerShadowOodReason.QuantizationOutOfRange) != 0)
            Add(ref _state.QuantizationOutOfRange, 1);
        if ((reasons & PlannerShadowOodReason.AirframeUnsupported) != 0)
            Add(ref _state.AirframeUnsupported, 1);
        if ((reasons & PlannerShadowOodReason.ProfileUnsupported) != 0)
            Add(ref _state.ProfileUnsupported, 1);
        if ((reasons & PlannerShadowOodReason.AtmosphereUnsupported) != 0)
            Add(ref _state.AtmosphereUnsupported, 1);
        if ((reasons & PlannerShadowOodReason.EnginePowerInvalid) != 0)
            Add(ref _state.EnginePowerInvalid, 1);
        if ((reasons & ~KnownOodReasons) != 0)
            Add(ref _state.UnknownReason, 1);
    }

    void RecordMargin(long margin) {
        if (margin <= 0)
            Add(ref _state.MarginNonPositive, 1);
        else if (margin <= 7)
            Add(ref _state.MarginOneToSeven, 1);
        else if (margin <= 31)
            Add(ref _state.MarginEightToThirtyOne, 1);
        else if (margin <= 127)
            Add(ref _state.MarginThirtyTwoToOneHundredTwentySeven, 1);
        else if (margin <= 511)
            Add(
                ref _state.MarginOneHundredTwentyEightToFiveHundredEleven,
                1);
        else
            Add(ref _state.MarginFiveHundredTwelveOrMore, 1);
    }

    void MergeOodCounts(in PlannerShadowOodCounts counts) {
        Add(ref _state.ObservationInvalid, counts.ObservationInvalid);
        Add(ref _state.TraceNotFull, counts.TraceNotFull);
        Add(
            ref _state.CandidateTableInvalid,
            counts.CandidateTableInvalid);
        Add(
            ref _state.NoAvailableCandidate,
            counts.NoAvailableCandidate);
        Add(
            ref _state.AvailableScoreMissing,
            counts.AvailableScoreMissing);
        Add(
            ref _state.AvailableScoreNonFinite,
            counts.AvailableScoreNonFinite);
        Add(
            ref _state.SelectedCandidateInvalid,
            counts.SelectedCandidateInvalid);
        Add(
            ref _state.ExactSelectionMismatch,
            counts.ExactSelectionMismatch);
        Add(ref _state.SkillUnsupported, counts.SkillUnsupported);
        Add(ref _state.TacticUnsupported, counts.TacticUnsupported);
        Add(ref _state.TerrainNotFlat, counts.TerrainNotFlat);
        Add(ref _state.WindNotCalm, counts.WindNotCalm);
        Add(
            ref _state.FormationNotIndependent,
            counts.FormationNotIndependent);
        Add(
            ref _state.DoctrineUnsupported,
            counts.DoctrineUnsupported);
        Add(ref _state.BossProfile, counts.BossProfile);
        Add(
            ref _state.ContactTimingInvalid,
            counts.ContactTimingInvalid);
        Add(ref _state.ContactStale, counts.ContactStale);
        Add(
            ref _state.ContactLowConfidence,
            counts.ContactLowConfidence);
        Add(
            ref _state.FeatureSourceNonFinite,
            counts.FeatureSourceNonFinite);
        Add(ref _state.FeatureClipped, counts.FeatureClipped);
        Add(
            ref _state.QuantizationOutOfRange,
            counts.QuantizationOutOfRange);
        Add(
            ref _state.AirframeUnsupported,
            counts.AirframeUnsupported);
        Add(
            ref _state.ProfileUnsupported,
            counts.ProfileUnsupported);
        Add(
            ref _state.AtmosphereUnsupported,
            counts.AtmosphereUnsupported);
        Add(
            ref _state.EnginePowerInvalid,
            counts.EnginePowerInvalid);
        Add(ref _state.UnknownReason, counts.UnknownReason);
    }

    void MergeMaskCounts(in PlannerShadowMaskCounts counts) {
        Add(
            ref _state.PartialAvailabilityEvaluations,
            counts.PartialAvailabilityEvaluations);
        Add(
            ref _state.AvailableScoreMissingEvaluations,
            counts.AvailableScoreMissingEvaluations);
        Add(
            ref _state.AvailableScoreNonFiniteEvaluations,
            counts.AvailableScoreNonFiniteEvaluations);
        Add(
            ref _state.FeatureClippedEvaluations,
            counts.FeatureClippedEvaluations);
        Add(
            ref _state.AvailableCandidateSlots,
            counts.AvailableCandidateSlots);
        Add(
            ref _state.ScorePresentCandidateSlots,
            counts.ScorePresentCandidateSlots);
        Add(
            ref _state.FiniteScoreCandidateSlots,
            counts.FiniteScoreCandidateSlots);
        Add(
            ref _state.ClippedFeatureSlots,
            counts.ClippedFeatureSlots);
        _state.ObservedAvailabilityMask |= counts.ObservedAvailabilityMask;
        _state.ObservedScorePresenceMask |=
            counts.ObservedScorePresenceMask;
        _state.ObservedFiniteScoreMask |= counts.ObservedFiniteScoreMask;
        _state.ObservedAvailableScoreMissingMask |=
            counts.ObservedAvailableScoreMissingMask;
        _state.ObservedAvailableScoreNonFiniteMask |=
            counts.ObservedAvailableScoreNonFiniteMask;
        _state.ObservedFeatureClipBitsLow |=
            counts.ObservedFeatureClipBitsLow;
        _state.ObservedFeatureClipBitsHigh |=
            counts.ObservedFeatureClipBitsHigh;
    }

    void MergeMarginCounts(in PlannerShadowMarginCounts counts) {
        Add(ref _state.MarginNonPositive, counts.NonPositive);
        Add(ref _state.MarginOneToSeven, counts.OneToSeven);
        Add(
            ref _state.MarginEightToThirtyOne,
            counts.EightToThirtyOne);
        Add(
            ref _state.MarginThirtyTwoToOneHundredTwentySeven,
            counts.ThirtyTwoToOneHundredTwentySeven);
        Add(
            ref _state.MarginOneHundredTwentyEightToFiveHundredEleven,
            counts.OneHundredTwentyEightToFiveHundredEleven);
        Add(
            ref _state.MarginFiveHundredTwelveOrMore,
            counts.FiveHundredTwelveOrMore);
    }

    static void Add(ref ulong counter, ulong amount) {
        if (ulong.MaxValue - counter < amount)
            counter = ulong.MaxValue;
        else
            counter += amount;
    }

    struct State {
        public ulong TotalEvaluations;
        public ulong EligibleEvaluations;
        public ulong IneligibleEvaluations;
        public ulong Agreements;
        public ulong Disagreements;
        public ulong ExactInStudentTopTwoEvaluations;
        public ulong ExactInStudentTopThreeEvaluations;
        public ulong PositiveRelativeRegretBillionths;
        public PlannerShadowOodReason ObservedOodReasons;

        public ulong ObservationInvalid;
        public ulong TraceNotFull;
        public ulong CandidateTableInvalid;
        public ulong NoAvailableCandidate;
        public ulong AvailableScoreMissing;
        public ulong AvailableScoreNonFinite;
        public ulong SelectedCandidateInvalid;
        public ulong ExactSelectionMismatch;
        public ulong SkillUnsupported;
        public ulong TacticUnsupported;
        public ulong TerrainNotFlat;
        public ulong WindNotCalm;
        public ulong FormationNotIndependent;
        public ulong DoctrineUnsupported;
        public ulong BossProfile;
        public ulong ContactTimingInvalid;
        public ulong ContactStale;
        public ulong ContactLowConfidence;
        public ulong FeatureSourceNonFinite;
        public ulong FeatureClipped;
        public ulong QuantizationOutOfRange;
        public ulong AirframeUnsupported;
        public ulong ProfileUnsupported;
        public ulong AtmosphereUnsupported;
        public ulong EnginePowerInvalid;
        public ulong UnknownReason;

        public ulong PartialAvailabilityEvaluations;
        public ulong AvailableScoreMissingEvaluations;
        public ulong AvailableScoreNonFiniteEvaluations;
        public ulong FeatureClippedEvaluations;
        public ulong AvailableCandidateSlots;
        public ulong ScorePresentCandidateSlots;
        public ulong FiniteScoreCandidateSlots;
        public ulong ClippedFeatureSlots;
        public ushort ObservedAvailabilityMask;
        public ushort ObservedScorePresenceMask;
        public ushort ObservedFiniteScoreMask;
        public ushort ObservedAvailableScoreMissingMask;
        public ushort ObservedAvailableScoreNonFiniteMask;
        public ulong ObservedFeatureClipBitsLow;
        public ulong ObservedFeatureClipBitsHigh;

        public ulong MarginNonPositive;
        public ulong MarginOneToSeven;
        public ulong MarginEightToThirtyOne;
        public ulong MarginThirtyTwoToOneHundredTwentySeven;
        public ulong MarginOneHundredTwentyEightToFiveHundredEleven;
        public ulong MarginFiveHundredTwelveOrMore;
    }
}
