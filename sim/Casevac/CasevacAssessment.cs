using System.Globalization;

namespace GunsOnly.Sim.Casevac;

public static class CasevacAssessmentContract {
    public const int SchemaVersion = 1;
}

/// <summary>The four independent, learner-visible CASEVAC assessment dimensions.</summary>
public enum CasevacAssessmentDimensionKind {
    Safe,
    Controlled,
    Masked,
    Timely
}

/// <summary>
/// A dimension is either unavailable, neutrally assessed, passed, or still developing. Masking and
/// timing use <see cref="Assessed"/> because the authored route trade has no hidden pass threshold.
/// </summary>
public enum CasevacAssessmentStatus {
    NotAssessed,
    Assessed,
    Pass,
    Developing
}

/// <summary>One independent CASEVAC dimension and the facts supporting its status.</summary>
public sealed record CasevacAssessmentDimension(
    CasevacAssessmentDimensionKind Kind,
    CasevacAssessmentStatus Status,
    string EvidenceText) {
    public bool IsAssessed => Status != CasevacAssessmentStatus.NotAssessed;
}

public enum CasevacPrimaryCorrectionKind {
    None,
    PreserveAircraftMargin,
    StabilizePickupContact,
    StabilizeHandoffContact,
    ReviewRecordedRouteSegment
}

/// <summary>
/// One deterministic, observer-safe correction. A present correction always names an exact
/// retained sample range or sparse-event tick; arbitrary recorder reason text is never rendered.
/// </summary>
public sealed record CasevacPrimaryCorrection(
    CasevacPrimaryCorrectionKind Kind,
    string CorrectionText,
    long? StartSourceTick,
    long? EndSourceTick,
    CasevacEvidenceStream? Stream) {
    public static CasevacPrimaryCorrection None { get; } = new(
        CasevacPrimaryCorrectionKind.None,
        "",
        StartSourceTick: null,
        EndSourceTick: null,
        Stream: null);

    public bool IsAvailable => Kind != CasevacPrimaryCorrectionKind.None;
}

/// <summary>
/// Observer-safe CASEVAC debrief assessment. The four dimensions deliberately have no aggregate
/// score or overall grade.
/// </summary>
public sealed record CasevacAssessment(
    int SchemaVersion,
    string ScenarioId,
    long MissionEpochSequence,
    int AuthorityTickHz,
    CasevacDisposition Disposition,
    CasevacAssessmentDimension Safe,
    CasevacAssessmentDimension Controlled,
    CasevacAssessmentDimension Masked,
    CasevacAssessmentDimension Timely,
    CasevacPrimaryCorrection PrimaryCorrection) {
    public IReadOnlyList<CasevacAssessmentDimension> Dimensions =>
        new[] { Safe, Controlled, Masked, Timely };

    public CasevacAssessmentDimension this[CasevacAssessmentDimensionKind kind] =>
        kind switch {
            CasevacAssessmentDimensionKind.Safe => Safe,
            CasevacAssessmentDimensionKind.Controlled => Controlled,
            CasevacAssessmentDimensionKind.Masked => Masked,
            CasevacAssessmentDimensionKind.Timely => Timely,
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
}

/// <summary>
/// Pure, deterministic assessment over one mission epoch's observer-safe aggregates and final
/// snapshot. It does not mutate the recorder or fill gaps in recorded evidence.
/// </summary>
public static class CasevacAssessmentEngine {
    readonly record struct SampleMoment(
        CasevacEvidenceStream Stream,
        CasevacEvidenceSample Sample);

    readonly record struct CorrectionCandidate(
        int CategoryPriority,
        int WithinCategoryPriority,
        CasevacPrimaryCorrectionKind Kind,
        string CorrectionText,
        long StartSourceTick,
        long EndSourceTick,
        CasevacEvidenceStream? Stream);

    public static CasevacAssessment Assess(
        CasevacEvidenceRecorder evidence,
        CasevacMissionSnapshot finalSnapshot) {
        ArgumentNullException.ThrowIfNull(evidence);
        ArgumentNullException.ThrowIfNull(finalSnapshot);
        Validate(finalSnapshot, evidence);

        return new CasevacAssessment(
            CasevacAssessmentContract.SchemaVersion,
            finalSnapshot.ScenarioId,
            finalSnapshot.MissionEpochSequence,
            evidence.AuthorityTickHz,
            finalSnapshot.Disposition,
            AssessSafe(evidence, finalSnapshot),
            AssessControlled(evidence, finalSnapshot),
            AssessMasked(evidence),
            AssessTimely(evidence.AuthorityTickHz, finalSnapshot),
            SelectPrimaryCorrection(evidence, finalSnapshot));
    }

    public static CasevacAssessment Evaluate(
        CasevacEvidenceRecorder evidence,
        CasevacMissionSnapshot finalSnapshot) =>
        Assess(evidence, finalSnapshot);

    static CasevacAssessmentDimension AssessSafe(
        CasevacEvidenceRecorder evidence,
        CasevacMissionSnapshot snapshot) {
        bool aircraftLost = IsAircraftLoss(snapshot.Disposition);
        bool developing = aircraftLost
            || evidence.VehicleUnflyableTicks > 0L
            || evidence.ProtectionInterventionActiveTicks > 0L;
        bool completeEvidence = evidence.ObservedTickCount > 0L
            && double.IsFinite(evidence.MinimumClearanceM)
            && snapshot.Disposition != CasevacDisposition.Pending;
        CasevacAssessmentStatus status = developing
            ? CasevacAssessmentStatus.Developing
            : completeEvidence
                ? CasevacAssessmentStatus.Pass
                : CasevacAssessmentStatus.NotAssessed;

        string clearance = double.IsFinite(evidence.MinimumClearanceM)
            ? evidence.MinimumClearanceM.ToString("0.0##", CultureInfo.InvariantCulture)
                + " m"
            : "not recorded";
        string text =
            $"Observed ticks: {evidence.ObservedTickCount}; minimum recorded clearance: "
            + $"{clearance}; protection-intervention activations/ticks: "
            + $"{evidence.ProtectionInterventionEdges}/"
            + $"{evidence.ProtectionInterventionActiveTicks}; recorded unflyable ticks: "
            + $"{evidence.VehicleUnflyableTicks}; disposition: "
            + $"{DispositionText(snapshot.Disposition)}.";
        return new CasevacAssessmentDimension(
            CasevacAssessmentDimensionKind.Safe,
            status,
            text);
    }

    static CasevacAssessmentDimension AssessControlled(
        CasevacEvidenceRecorder evidence,
        CasevacMissionSnapshot snapshot) {
        CasevacLandingZoneEvidence pickup =
            evidence.GetLandingZoneEvidence(CasevacTerminalLeg.Pickup);
        CasevacLandingZoneEvidence receiver =
            evidence.GetLandingZoneEvidence(CasevacTerminalLeg.Receiver);
        long loadingPauses = evidence.LoadingPauseCount;
        long loadingResets = evidence.LoadingResetCount;
        long handoffPauses = evidence.HandoffPauseCount;
        long handoffResets = evidence.HandoffResetCount;
        // HOLD is inside the loose exit gate and preserves operation progress. It remains visible
        // evidence, but only a BREAK/reset establishes a control breach.
        bool developing = loadingResets > 0L || handoffResets > 0L;
        bool bothOperationsRecorded = IsTransferred(snapshot.Disposition)
            && snapshot.CapsuleSecuredCallAgeTicks.HasValue
            && snapshot.HandoffCallAgeTicks.HasValue
            && pickup.ObservedTicks > 0L
            && receiver.ObservedTicks > 0L
            && pickup.AdvanceTicks > 0L
            && receiver.AdvanceTicks > 0L;
        CasevacAssessmentStatus status = developing
            ? CasevacAssessmentStatus.Developing
            : bothOperationsRecorded
                ? CasevacAssessmentStatus.Pass
                : CasevacAssessmentStatus.NotAssessed;

        string text =
            $"Pickup gate advance/hold/break ticks: {pickup.AdvanceTicks}/"
            + $"{pickup.HoldTicks}/{pickup.BreakTicks}; receiver gate "
            + $"advance/hold/break ticks: {receiver.AdvanceTicks}/"
            + $"{receiver.HoldTicks}/{receiver.BreakTicks}; loading "
            + $"pauses/resets: {loadingPauses}/{loadingResets}; handoff "
            + $"pauses/resets: {handoffPauses}/{handoffResets}; approaches "
            + $"discontinued: "
            + $"{evidence.GetEventCount(CasevacEventKind.ApproachDiscontinued)}; "
            + $"capsule secured/handoff recorded: "
            + $"{YesNo(snapshot.CapsuleSecuredCallAgeTicks.HasValue)}/"
            + $"{YesNo(snapshot.HandoffCallAgeTicks.HasValue)}.";
        return new CasevacAssessmentDimension(
            CasevacAssessmentDimensionKind.Controlled,
            status,
            text);
    }

    static CasevacAssessmentDimension AssessMasked(
        CasevacEvidenceRecorder evidence) {
        long assessedTicks = checked(
            evidence.RouteMaskedTicks + evidence.RouteExposedTicks);
        bool completeAuthority = evidence.RouteObservedTicks > 0L
            && assessedTicks == evidence.RouteObservedTicks
            && evidence.RouteMaskingNotAssessedTicks == 0L;
        CasevacAssessmentStatus status = completeAuthority
            ? CasevacAssessmentStatus.Assessed
            : CasevacAssessmentStatus.NotAssessed;
        string text =
            $"Route MASKED/EXPOSED/NOT ASSESSED ticks: "
            + $"{evidence.RouteMaskedTicks}/{evidence.RouteExposedTicks}/"
            + $"{evidence.RouteMaskingNotAssessedTicks}; route ticks inside the "
            + $"declared safe masking band: "
            + $"{evidence.RouteWithinSafeMaskingBandTicks}; route-phase ticks: "
            + $"{evidence.RouteObservedTicks}. Mission-wide diagnostic ticks: "
            + $"{evidence.MaskedTicks}/{evidence.ExposedTicks}/"
            + $"{evidence.MaskingNotAssessedTicks}.";
        return new CasevacAssessmentDimension(
            CasevacAssessmentDimensionKind.Masked,
            status,
            text);
    }

    static CasevacAssessmentDimension AssessTimely(
        int authorityTickHz,
        CasevacMissionSnapshot snapshot) {
        long? callToPickup = snapshot.CapsuleSecuredCallAgeTicks;
        long? callToHandoff = snapshot.HandoffCallAgeTicks;
        long? pickupToHandoff = callToPickup.HasValue && callToHandoff.HasValue
            && callToHandoff.Value >= callToPickup.Value
                ? callToHandoff.Value - callToPickup.Value
                : null;
        bool coherentTransfer = IsTransferred(snapshot.Disposition)
            && callToPickup.HasValue
            && callToHandoff.HasValue
            && pickupToHandoff.HasValue
            && HandoffMarkerMatchesDisposition(snapshot);
        CasevacAssessmentStatus status = coherentTransfer
            ? CasevacAssessmentStatus.Assessed
            : CasevacAssessmentStatus.NotAssessed;

        string marker = callToHandoff.HasValue
            ? MarkerDeltaText(
                callToHandoff.Value, snapshot.RequestedHandoffAgeTicks)
            : "no recorded handoff";
        string text =
            $"Call-to-pickup: {TickText(callToPickup)}; pickup-to-handoff: "
            + $"{TickText(pickupToHandoff)}; call-to-handoff: "
            + $"{TickText(callToHandoff)}; requested handoff: "
            + $"{snapshot.RequestedHandoffAgeTicks} ticks; {marker}; "
            + $"authority rate: {authorityTickHz} Hz.";
        return new CasevacAssessmentDimension(
            CasevacAssessmentDimensionKind.Timely,
            status,
            text);
    }

    static CasevacPrimaryCorrection SelectPrimaryCorrection(
        CasevacEvidenceRecorder evidence,
        CasevacMissionSnapshot snapshot) {
        var candidates = new List<CorrectionCandidate>();
        AddAircraftLossCorrection(candidates, evidence, snapshot);
        AddProtectionCorrection(candidates, evidence);
        AddOperationCorrection(
            candidates,
            evidence,
            CasevacEventKind.LoadingReset,
            CasevacPrimaryCorrectionKind.StabilizePickupContact,
            CasevacEvidenceStream.PickupTerminal,
            categoryPriority: 10,
            "loading reset",
            "Re-establish the declared pickup gate and hold stable contact until loading completes.");
        AddOperationCorrection(
            candidates,
            evidence,
            CasevacEventKind.HandoffReset,
            CasevacPrimaryCorrectionKind.StabilizeHandoffContact,
            CasevacEvidenceStream.ReceiverTerminal,
            categoryPriority: 10,
            "handoff reset",
            "Re-establish the declared receiver gate and hold stable contact until handoff completes.");
        AddOperationCorrection(
            candidates,
            evidence,
            CasevacEventKind.LoadingPaused,
            CasevacPrimaryCorrectionKind.StabilizePickupContact,
            CasevacEvidenceStream.PickupTerminal,
            categoryPriority: 20,
            "loading paused",
            "Hold the declared pickup stable-contact gate until loading completes.");
        AddOperationCorrection(
            candidates,
            evidence,
            CasevacEventKind.HandoffPaused,
            CasevacPrimaryCorrectionKind.StabilizeHandoffContact,
            CasevacEvidenceStream.ReceiverTerminal,
            categoryPriority: 20,
            "handoff paused",
            "Hold the declared receiver stable-contact gate until handoff completes.");
        AddMarkedCorrections(candidates, evidence);

        if (candidates.Count == 0) return CasevacPrimaryCorrection.None;
        candidates.Sort(CompareCandidates);
        CorrectionCandidate selected = candidates[0];
        return new CasevacPrimaryCorrection(
            selected.Kind,
            selected.CorrectionText,
            selected.StartSourceTick,
            selected.EndSourceTick,
            selected.Stream);
    }

    static void AddAircraftLossCorrection(
        List<CorrectionCandidate> candidates,
        CasevacEvidenceRecorder evidence,
        CasevacMissionSnapshot snapshot) {
        if (!IsAircraftLoss(snapshot.Disposition)) return;
        long? tick = evidence.GetFirstEventSourceTick(
                CasevacEventKind.CasevacAircraftLost)
            ?? evidence.TerminalDispositionSourceTick;
        if (!tick.HasValue) return;
        candidates.Add(new CorrectionCandidate(
            CategoryPriority: 0,
            WithinCategoryPriority: 0,
            CasevacPrimaryCorrectionKind.PreserveAircraftMargin,
            $"At source tick {tick.Value}, the aircraft-loss disposition latched. "
                + "Preserve collision and obstacle clearance before continuing.",
            tick.Value,
            tick.Value,
            Stream: null));
    }

    static void AddProtectionCorrection(
        List<CorrectionCandidate> candidates,
        CasevacEvidenceRecorder evidence) {
        if (evidence.ProtectionInterventionActiveTicks <= 0L) return;
        SampleMoment? moment = FindFirstSample(
            evidence,
            static sample => sample.ProtectionInterventionActive);
        if (!moment.HasValue) return;
        candidates.Add(new CorrectionCandidate(
            CategoryPriority: 1,
            WithinCategoryPriority: 0,
            CasevacPrimaryCorrectionKind.PreserveAircraftMargin,
            $"At source tick {moment.Value.Sample.SourceTick}, a generic protection "
                + "intervention was recorded. Re-establish flight margin before continuing.",
            moment.Value.Sample.SourceTick,
            moment.Value.Sample.SourceTick,
            moment.Value.Stream));
    }

    static void AddOperationCorrection(
        List<CorrectionCandidate> candidates,
        CasevacEvidenceRecorder evidence,
        CasevacEventKind eventKind,
        CasevacPrimaryCorrectionKind correctionKind,
        CasevacEvidenceStream stream,
        int categoryPriority,
        string fact,
        string instruction) {
        long? tick = evidence.GetFirstEventSourceTick(eventKind);
        if (!tick.HasValue) return;
        candidates.Add(new CorrectionCandidate(
            categoryPriority,
            WithinCategoryPriority: 0,
            correctionKind,
            FormattableString.Invariant(
                $"At source tick {tick.Value}, {fact}. {instruction}"),
            tick.Value,
            tick.Value,
            stream));
    }

    static void AddMarkedCorrections(
        List<CorrectionCandidate> candidates,
        CasevacEvidenceRecorder evidence) {
        foreach (CasevacCorrectionRange range in evidence.CorrectionRanges.Span) {
            CasevacPrimaryCorrectionKind kind;
            string instruction;
            switch (range.Stream) {
                case CasevacEvidenceStream.Route:
                    kind = CasevacPrimaryCorrectionKind.ReviewRecordedRouteSegment;
                    instruction =
                        "Preserve the declared route margin through this recorded segment.";
                    break;
                case CasevacEvidenceStream.PickupTerminal:
                    kind = CasevacPrimaryCorrectionKind.StabilizePickupContact;
                    instruction =
                        "Establish the declared pickup gate before stable contact.";
                    break;
                case CasevacEvidenceStream.ReceiverTerminal:
                    kind = CasevacPrimaryCorrectionKind.StabilizeHandoffContact;
                    instruction =
                        "Establish the declared receiver gate before stable contact.";
                    break;
                default:
                    continue;
            }
            candidates.Add(new CorrectionCandidate(
                CategoryPriority: 100,
                WithinCategoryPriority: range.Priority,
                kind,
                $"Review source ticks {range.StartSourceTick}–{range.EndSourceTick}. "
                    + instruction,
                range.StartSourceTick,
                range.EndSourceTick,
                range.Stream));
        }
    }

    static SampleMoment? FindFirstSample(
        CasevacEvidenceRecorder evidence,
        Func<CasevacEvidenceSample, bool> predicate) {
        SampleMoment? earliest = null;
        ConsiderSamples(
            evidence.RouteSamples.Span,
            CasevacEvidenceStream.Route,
            predicate,
            ref earliest);
        ConsiderSamples(
            evidence.PickupTerminalSamples.Span,
            CasevacEvidenceStream.PickupTerminal,
            predicate,
            ref earliest);
        ConsiderSamples(
            evidence.ReceiverTerminalSamples.Span,
            CasevacEvidenceStream.ReceiverTerminal,
            predicate,
            ref earliest);
        return earliest;
    }

    static void ConsiderSamples(
        ReadOnlySpan<CasevacEvidenceSample> samples,
        CasevacEvidenceStream stream,
        Func<CasevacEvidenceSample, bool> predicate,
        ref SampleMoment? earliest) {
        foreach (CasevacEvidenceSample sample in samples) {
            if (!predicate(sample)) continue;
            if (!earliest.HasValue
                || sample.SourceTick < earliest.Value.Sample.SourceTick
                || (sample.SourceTick == earliest.Value.Sample.SourceTick
                    && stream < earliest.Value.Stream))
                earliest = new SampleMoment(stream, sample);
            break;
        }
    }

    static int CompareCandidates(
        CorrectionCandidate left,
        CorrectionCandidate right) {
        int comparison = left.CategoryPriority.CompareTo(right.CategoryPriority);
        if (comparison != 0) return comparison;
        comparison = left.WithinCategoryPriority.CompareTo(
            right.WithinCategoryPriority);
        if (comparison != 0) return comparison;
        comparison = left.StartSourceTick.CompareTo(right.StartSourceTick);
        if (comparison != 0) return comparison;
        comparison = left.Kind.CompareTo(right.Kind);
        if (comparison != 0) return comparison;
        comparison = Nullable.Compare(left.Stream, right.Stream);
        if (comparison != 0) return comparison;
        return left.EndSourceTick.CompareTo(right.EndSourceTick);
    }

    static void Validate(
        CasevacMissionSnapshot snapshot,
        CasevacEvidenceRecorder evidence) {
        if (snapshot.SchemaVersion != CasevacContract.SchemaVersion)
            throw new ArgumentOutOfRangeException(
                nameof(snapshot), "Unsupported CASEVAC snapshot schema.");
        if (string.IsNullOrWhiteSpace(snapshot.ScenarioId)
            || snapshot.MissionEpochSequence <= 0L
            || snapshot.MissionBeginSourceTick < 0L
            || snapshot.LastSourceTick < 0L
            || snapshot.LastSourceTick < snapshot.MissionBeginSourceTick
            || snapshot.ActiveMissionTicks < 0L
            || snapshot.CallAgeTicks < 0L
            || snapshot.RequestedHandoffAgeTicks <= 0L
            || (snapshot.CapsuleSecuredCallAgeTicks.HasValue
                && (snapshot.CapsuleSecuredCallAgeTicks.Value < 0L
                    || snapshot.CapsuleSecuredCallAgeTicks.Value
                        > snapshot.CallAgeTicks))
            || (snapshot.HandoffCallAgeTicks.HasValue
                && (snapshot.HandoffCallAgeTicks.Value < 0L
                    || snapshot.HandoffCallAgeTicks.Value
                        > snapshot.CallAgeTicks))
            || !Enum.IsDefined(snapshot.Phase)
            || !Enum.IsDefined(snapshot.Custody)
            || !Enum.IsDefined(snapshot.Disposition))
            throw new ArgumentOutOfRangeException(nameof(snapshot));
        if (evidence.ScenarioId is not null
            && (!StringComparer.Ordinal.Equals(
                    evidence.ScenarioId, snapshot.ScenarioId)
                || evidence.MissionEpochSequence
                    != snapshot.MissionEpochSequence))
            throw new InvalidOperationException(
                "CASEVAC assessment evidence and snapshot must share one mission epoch.");
        if (evidence.LastObservedSourceTick > snapshot.LastSourceTick
            || evidence.HighestActiveMissionTicks > snapshot.ActiveMissionTicks)
            throw new InvalidOperationException(
                "The final CASEVAC snapshot cannot precede recorded evidence.");
        if (evidence.FinalDisposition != CasevacDisposition.Pending
            && evidence.FinalDisposition != snapshot.Disposition)
            throw new InvalidOperationException(
                "The final CASEVAC disposition contradicts recorded evidence.");
    }

    static bool HandoffMarkerMatchesDisposition(
        CasevacMissionSnapshot snapshot) =>
        snapshot.HandoffCallAgeTicks.HasValue
        && (snapshot.Disposition switch {
            CasevacDisposition.TransferredOnTime =>
                snapshot.HandoffCallAgeTicks.Value
                    <= snapshot.RequestedHandoffAgeTicks,
            CasevacDisposition.TransferredAfterRequestedTime =>
                snapshot.HandoffCallAgeTicks.Value
                    > snapshot.RequestedHandoffAgeTicks,
            _ => false
        });

    static string MarkerDeltaText(long handoffTicks, long requestedTicks) {
        long difference = handoffTicks - requestedTicks;
        if (difference == 0L) return "handoff at the requested marker";
        if (difference < 0L)
            return FormattableString.Invariant(
                $"handoff {-difference} ticks before the requested marker");
        return FormattableString.Invariant(
            $"handoff {difference} ticks after the requested marker");
    }

    static string TickText(long? ticks) =>
        ticks.HasValue
            ? FormattableString.Invariant($"{ticks.Value} ticks")
            : "not recorded";

    static string YesNo(bool value) => value ? "yes" : "no";

    static bool IsTransferred(CasevacDisposition disposition) =>
        disposition is CasevacDisposition.TransferredOnTime
            or CasevacDisposition.TransferredAfterRequestedTime;

    static bool IsAircraftLoss(CasevacDisposition disposition) =>
        disposition is CasevacDisposition.AircraftLostEmpty
            or CasevacDisposition.AircraftLostOccupied;

    static string DispositionText(CasevacDisposition disposition) =>
        disposition switch {
            CasevacDisposition.Pending => "PENDING",
            CasevacDisposition.TransferredOnTime => "HANDOFF",
            CasevacDisposition.TransferredAfterRequestedTime =>
                "HANDOFF AFTER REQUESTED TIME",
            CasevacDisposition.ControlledAbort => "CONTROLLED ABORT",
            CasevacDisposition.AircraftLostEmpty => "AIRCRAFT LOST",
            CasevacDisposition.AircraftLostOccupied =>
                "AIRCRAFT LOST · OCCUPIED",
            _ => throw new ArgumentOutOfRangeException(nameof(disposition))
        };
}
