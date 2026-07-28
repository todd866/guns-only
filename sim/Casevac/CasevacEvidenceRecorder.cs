using GunsOnly.Sim;

namespace GunsOnly.Sim.Casevac;

public enum CasevacEvidenceStream {
    Route,
    PickupTerminal,
    ReceiverTerminal
}

public enum CasevacTerminalLeg {
    Pickup,
    Receiver
}

/// <summary>
/// One bounded, observer-safe CASEVAC replay sample. It retains authoritative facts only; it does
/// not infer intent, hidden state, or an outcome that the mission kernel did not emit.
/// </summary>
public readonly record struct CasevacEvidenceSample(
    int SchemaVersion,
    long SourceTick,
    long ActiveMissionTicks,
    long MissionEpochSequence,
    CasevacPhase Phase,
    CapsuleCustody Custody,
    CasevacDisposition Disposition,
    Vec3D Position,
    double ClearanceM,
    CasevacMaskingState MaskingState,
    bool WithinSafeMaskingBand,
    bool ProtectionInterventionActive,
    string? LandingZoneSiteId,
    bool InsideTerminalVolume,
    bool InsideEnterFootprint,
    bool InsideExitFootprint,
    bool SurfaceContact,
    LandingZoneGateClass GateClass,
    LandingZoneGateViolation EnterViolations,
    LandingZoneGateViolation ExitViolations,
    double LateralGroundSpeedMps,
    double VerticalSpeedMps,
    double PitchRad,
    double BankRad,
    long LandingZoneApproachAttemptId,
    long ApproachAttemptId,
    bool StableContact,
    int StabilizationProgressTicks,
    int OperationProgressTicks);

/// <summary>
/// Non-dropping aggregate landing-zone evidence for one leg. Detailed samples may reach their
/// declared cap, but these totals and maxima continue for the complete observed mission.
/// </summary>
public readonly record struct CasevacLandingZoneEvidence(
    long ObservedTicks,
    long AdvanceTicks,
    long HoldTicks,
    long BreakTicks,
    long EnterViolationTicks,
    long ExitViolationTicks,
    LandingZoneGateViolation ObservedEnterViolations,
    LandingZoneGateViolation ObservedExitViolations,
    double MaximumLateralGroundSpeedMps,
    double MaximumAbsoluteVerticalSpeedMps,
    double MaximumAbsolutePitchRad,
    double MaximumAbsoluteBankRad);

/// <summary>Exact loss metadata for the bounded mission-event ring.</summary>
public readonly record struct CasevacMissionEventOverflow(
    long DroppedCount,
    long FirstDroppedSequence,
    long LastDroppedSequence,
    long FirstDroppedSourceTick,
    long LastDroppedSourceTick);

/// <summary>
/// A caller-selected replay range. Priority zero is highest; ties are ordered deterministically by
/// source tick, reason key, end tick, and stream. The recorder retains at most three best ranges.
/// </summary>
public readonly record struct CasevacCorrectionRange(
    CasevacEvidenceStream Stream,
    long StartSourceTick,
    long EndSourceTick,
    int Priority,
    string Reason);

/// <summary>
/// Passive bounded evidence for one CASEVAC mission epoch. The controller remains authoritative:
/// this recorder observes immutable ticks, snapshots, and sparse events without feeding state back
/// into mission progression or allocating event sequence numbers.
/// </summary>
public sealed class CasevacEvidenceRecorder {
    public const int DefaultAuthorityTickHz = (int)AircraftSim.TickHz;
    public const int RouteSampleRateHz = 2;
    public const int TerminalSampleRateHz = 12;
    public const int RouteSampleCapacity = 1800;
    public const int PickupTerminalSampleCapacity = 5400;
    public const int ReceiverTerminalSampleCapacity = 5400;
    public const int MissionEventCapacity = 4096;
    public const int CorrectionRangeCapacity = 3;

    const int TerminalLegCount = 2;
    const int GateClassCount = 3;
    const int ViolationBitCount = 8;

    readonly CasevacEvidenceSample[] _routeSamples =
        new CasevacEvidenceSample[RouteSampleCapacity];
    readonly CasevacEvidenceSample[] _pickupTerminalSamples =
        new CasevacEvidenceSample[PickupTerminalSampleCapacity];
    readonly CasevacEvidenceSample[] _receiverTerminalSamples =
        new CasevacEvidenceSample[ReceiverTerminalSampleCapacity];
    readonly CasevacMissionEventRecord[] _missionEvents =
        new CasevacMissionEventRecord[MissionEventCapacity];
    readonly CasevacCorrectionRange[] _correctionRanges =
        new CasevacCorrectionRange[CorrectionRangeCapacity];
    readonly long[] _phaseTicks =
        new long[Enum.GetValues<CasevacPhase>().Length];
    readonly long[] _maskingTicks =
        new long[Enum.GetValues<CasevacMaskingState>().Length];
    readonly long[] _gateTicks = new long[TerminalLegCount * GateClassCount];
    readonly long[] _enterViolationTicks =
        new long[TerminalLegCount * ViolationBitCount];
    readonly long[] _exitViolationTicks =
        new long[TerminalLegCount * ViolationBitCount];
    readonly LandingZoneGateViolation[] _observedEnterViolations =
        new LandingZoneGateViolation[TerminalLegCount];
    readonly LandingZoneGateViolation[] _observedExitViolations =
        new LandingZoneGateViolation[TerminalLegCount];
    readonly long[] _terminalObservedTicks = new long[TerminalLegCount];
    readonly long[] _enterViolationAnyTicks = new long[TerminalLegCount];
    readonly long[] _exitViolationAnyTicks = new long[TerminalLegCount];
    readonly double[] _maximumLateralGroundSpeedMps = new double[TerminalLegCount];
    readonly double[] _maximumAbsoluteVerticalSpeedMps = new double[TerminalLegCount];
    readonly double[] _maximumAbsolutePitchRad = new double[TerminalLegCount];
    readonly double[] _maximumAbsoluteBankRad = new double[TerminalLegCount];
    readonly long[] _eventCounts =
        new long[Enum.GetValues<CasevacEventKind>().Length];
    readonly long?[] _firstEventSourceTicks =
        new long?[Enum.GetValues<CasevacEventKind>().Length];
    readonly long?[] _firstEventActiveMissionTicks =
        new long?[Enum.GetValues<CasevacEventKind>().Length];

    readonly int _routeStrideTicks;
    readonly int _terminalStrideTicks;
    readonly bool _captureSamples;

    string? _scenarioId;
    string? _aircraftId;
    string? _capsuleId;
    string? _pickupSiteId;
    string? _receiverSiteId;
    long _mappedApproachAttemptId;
    CasevacTerminalLeg _mappedApproachLeg;
    string? _mappedApproachSiteId;
    long _missionEpochSequence;
    long _lastObservedSourceTick = -1L;
    long _lastObservedActiveMissionTicks;
    long _lastEventSequence;
    long _lastEventSourceTick = -1L;
    long _lastEventActiveMissionTicks;
    long _routeEligibleTicks;
    long _pickupTerminalEligibleTicks;
    long _receiverTerminalEligibleTicks;
    int _routeSampleCount;
    int _pickupTerminalSampleCount;
    int _receiverTerminalSampleCount;
    long _routeSamplesSkipped;
    long _pickupTerminalSamplesSkipped;
    long _receiverTerminalSamplesSkipped;
    int _missionEventCount;
    int _missionEventWriteIndex;
    long _droppedMissionEventCount;
    long _firstDroppedMissionEventSequence;
    long _lastDroppedMissionEventSequence;
    long _firstDroppedMissionEventSourceTick;
    long _lastDroppedMissionEventSourceTick;
    int _correctionRangeCount;
    bool _lastProtectionInterventionActive;
    double _minimumClearanceM = double.PositiveInfinity;

    public CasevacEvidenceRecorder(
        int authorityTickHz = DefaultAuthorityTickHz,
        bool captureSamples = true) {
        if (authorityTickHz <= 0
            || authorityTickHz % RouteSampleRateHz != 0
            || authorityTickHz % TerminalSampleRateHz != 0)
            throw new ArgumentOutOfRangeException(nameof(authorityTickHz),
                "Authority rate must be a positive whole multiple of 2 Hz and 12 Hz.");
        AuthorityTickHz = authorityTickHz;
        _routeStrideTicks = authorityTickHz / RouteSampleRateHz;
        _terminalStrideTicks = authorityTickHz / TerminalSampleRateHz;
        _captureSamples = captureSamples;
    }

    public int AuthorityTickHz { get; }
    public int RouteStrideTicks => _routeStrideTicks;
    public int TerminalStrideTicks => _terminalStrideTicks;
    public bool CaptureSamples => _captureSamples;
    public string? ScenarioId => _scenarioId;
    public string? PickupSiteId => _pickupSiteId;
    public string? ReceiverSiteId => _receiverSiteId;
    public long MissionEpochSequence => _missionEpochSequence;
    public long ObservedTickCount { get; private set; }
    public long ClockRunningTickCount { get; private set; }
    public long HighestActiveMissionTicks { get; private set; }
    public long LastObservedSourceTick => _lastObservedSourceTick;
    public CasevacPhase LastPhase { get; private set; } = CasevacPhase.Ready;
    public CasevacDisposition FinalDisposition { get; private set; } =
        CasevacDisposition.Pending;
    public long? TerminalDispositionSourceTick { get; private set; }
    public long MaskedTicks => GetMaskingTicks(CasevacMaskingState.Masked);
    public long ExposedTicks => GetMaskingTicks(CasevacMaskingState.Exposed);
    public long MaskingNotAssessedTicks =>
        GetMaskingTicks(CasevacMaskingState.NotAssessed);
    public long WithinSafeMaskingBandTicks { get; private set; }
    public long VehicleUnflyableTicks { get; private set; }
    public long ProtectionInterventionActiveTicks { get; private set; }
    public long ProtectionInterventionEdges { get; private set; }
    public double MinimumClearanceM =>
        double.IsPositiveInfinity(_minimumClearanceM) ? double.NaN : _minimumClearanceM;
    public long HighestApproachAttemptId { get; private set; }
    public long ApproachAttemptCount =>
        GetEventCount(CasevacEventKind.ApproachAttemptStarted);
    public long LoadingPauseCount =>
        GetEventCount(CasevacEventKind.LoadingPaused);
    public long LoadingResumeCount =>
        GetEventCount(CasevacEventKind.LoadingResumed);
    public long LoadingResetCount =>
        GetEventCount(CasevacEventKind.LoadingReset);
    public long HandoffPauseCount =>
        GetEventCount(CasevacEventKind.HandoffPaused);
    public long HandoffResumeCount =>
        GetEventCount(CasevacEventKind.HandoffResumed);
    public long HandoffResetCount =>
        GetEventCount(CasevacEventKind.HandoffReset);

    public int RouteSampleCount => _routeSampleCount;
    public int PickupTerminalSampleCount => _pickupTerminalSampleCount;
    public int ReceiverTerminalSampleCount => _receiverTerminalSampleCount;
    public long RouteSamplesSkippedDueToCapacity => _routeSamplesSkipped;
    public long PickupTerminalSamplesSkippedDueToCapacity =>
        _pickupTerminalSamplesSkipped;
    public long ReceiverTerminalSamplesSkippedDueToCapacity =>
        _receiverTerminalSamplesSkipped;
    public bool SampleDetailTruncated =>
        _routeSamplesSkipped > 0L
        || _pickupTerminalSamplesSkipped > 0L
        || _receiverTerminalSamplesSkipped > 0L;
    public ReadOnlyMemory<CasevacEvidenceSample> RouteSamples =>
        _routeSamples.AsMemory(0, _routeSampleCount);
    public ReadOnlyMemory<CasevacEvidenceSample> PickupTerminalSamples =>
        _pickupTerminalSamples.AsMemory(0, _pickupTerminalSampleCount);
    public ReadOnlyMemory<CasevacEvidenceSample> ReceiverTerminalSamples =>
        _receiverTerminalSamples.AsMemory(0, _receiverTerminalSampleCount);

    public int MissionEventCount => _missionEventCount;
    public long LastMissionEventSequence => _lastEventSequence;
    public long DroppedMissionEventCount => _droppedMissionEventCount;
    public bool MissionEventOverflowed => _droppedMissionEventCount > 0L;
    public bool EvidenceIncomplete => MissionEventOverflowed || SampleDetailTruncated;
    public CasevacMissionEventOverflow? MissionEventOverflow =>
        !MissionEventOverflowed
            ? null
            : new CasevacMissionEventOverflow(
                _droppedMissionEventCount,
                _firstDroppedMissionEventSequence,
                _lastDroppedMissionEventSequence,
                _firstDroppedMissionEventSourceTick,
                _lastDroppedMissionEventSourceTick);

    public int CorrectionRangeCount => _correctionRangeCount;
    public ReadOnlyMemory<CasevacCorrectionRange> CorrectionRanges =>
        _correctionRanges.AsMemory(0, _correctionRangeCount);

    /// <summary>
    /// Observe one post-controller authority tick. Skipping this call is a pause: no counter,
    /// sampling cadence, or aggregate advances.
    /// </summary>
    public void ObserveTick(
        in CasevacTickObservation observation,
        CasevacMissionSnapshot snapshot) {
        ValidateTick(observation, snapshot);
        var sample = BuildSample(observation, snapshot);
        bool captureRoute =
            _captureSamples && _routeEligibleTicks % _routeStrideTicks == 0L;
        bool insideTerminal = TryClassifyTerminal(
            observation, snapshot, out CasevacTerminalLeg terminalLeg);
        bool pickupTerminal =
            insideTerminal && terminalLeg == CasevacTerminalLeg.Pickup;
        bool receiverTerminal =
            insideTerminal && terminalLeg == CasevacTerminalLeg.Receiver;
        bool capturePickup = _captureSamples
            && pickupTerminal
            && _pickupTerminalEligibleTicks % _terminalStrideTicks == 0L;
        bool captureReceiver = _captureSamples
            && receiverTerminal
            && _receiverTerminalEligibleTicks % _terminalStrideTicks == 0L;

        BindMissionIdentity(snapshot.ScenarioId, snapshot.MissionEpochSequence);
        if (insideTerminal
            && CanEstablishTerminalSite(
                terminalLeg, observation.LandingZone.SiteId!, snapshot))
            BindTerminalSite(terminalLeg, observation.LandingZone.SiteId!);
        long activeTickDelta =
            snapshot.ActiveMissionTicks - _lastObservedActiveMissionTicks;
        _lastObservedSourceTick = observation.SourceTick;
        _lastObservedActiveMissionTicks = snapshot.ActiveMissionTicks;
        ObservedTickCount++;
        _routeEligibleTicks++;
        ClockRunningTickCount =
            checked(ClockRunningTickCount + activeTickDelta);
        HighestActiveMissionTicks =
            System.Math.Max(HighestActiveMissionTicks, snapshot.ActiveMissionTicks);
        LastPhase = snapshot.Phase;
        _phaseTicks[(int)snapshot.Phase]++;
        FinalDisposition = snapshot.Disposition;
        if (snapshot.Disposition != CasevacDisposition.Pending
            && !TerminalDispositionSourceTick.HasValue)
            TerminalDispositionSourceTick = observation.SourceTick;

        _maskingTicks[(int)observation.MaskingState]++;
        if (observation.WithinSafeMaskingBand) WithinSafeMaskingBandTicks++;
        if (!observation.VehicleFlyable) VehicleUnflyableTicks++;
        _minimumClearanceM =
            System.Math.Min(_minimumClearanceM, observation.ClearanceM);
        if (observation.ProtectionInterventionActive) {
            ProtectionInterventionActiveTicks++;
            if (!_lastProtectionInterventionActive)
                ProtectionInterventionEdges++;
        }
        _lastProtectionInterventionActive =
            observation.ProtectionInterventionActive;
        HighestApproachAttemptId = System.Math.Max(
            HighestApproachAttemptId, snapshot.LatestApproachAttemptId);

        if (TryClassifyGate(
                observation,
                snapshot,
                insideTerminal,
                terminalLeg,
                out CasevacTerminalLeg gateLeg, out string? expectedSiteId))
            UpdateGateAggregates(
                gateLeg, observation.LandingZone, expectedSiteId);

        if (captureRoute)
            AppendSample(_routeSamples, ref _routeSampleCount,
                ref _routeSamplesSkipped, sample);
        if (pickupTerminal) {
            if (capturePickup)
                AppendSample(_pickupTerminalSamples,
                    ref _pickupTerminalSampleCount,
                    ref _pickupTerminalSamplesSkipped, sample);
            _pickupTerminalEligibleTicks++;
        } else if (receiverTerminal) {
            if (captureReceiver)
                AppendSample(_receiverTerminalSamples,
                    ref _receiverTerminalSampleCount,
                    ref _receiverTerminalSamplesSkipped, sample);
            _receiverTerminalEligibleTicks++;
        }
    }

    /// <summary>
    /// Observe one controller-authored sparse event. Sequences are supplied by the session-wide
    /// allocator, so gaps are valid; duplicates and regressions are rejected.
    /// </summary>
    public void ObserveEvent(in CasevacMissionEventRecord missionEvent) {
        ValidateEvent(missionEvent);

        BindMissionIdentity(missionEvent.ScenarioId, missionEvent.MissionEpochSequence);
        if (_aircraftId is null) {
            _aircraftId = missionEvent.AircraftId;
            _capsuleId = missionEvent.CapsuleId;
        }
        if (missionEvent.Kind == CasevacEventKind.PickupApproachEntered
            && missionEvent.SiteId is not null)
            BindTerminalSite(CasevacTerminalLeg.Pickup, missionEvent.SiteId);
        if (missionEvent.Kind == CasevacEventKind.DropoffApproachEntered
            && missionEvent.SiteId is not null)
            BindTerminalSite(CasevacTerminalLeg.Receiver, missionEvent.SiteId);
        if (missionEvent.Kind == CasevacEventKind.ApproachAttemptStarted
            && missionEvent.ApproachAttemptId > 0L
            && missionEvent.SiteId is not null) {
            if (StringComparer.Ordinal.Equals(
                    _pickupSiteId, missionEvent.SiteId))
                RememberApproachAttempt(
                    missionEvent.ApproachAttemptId,
                    CasevacTerminalLeg.Pickup,
                    missionEvent.SiteId);
            else if (StringComparer.Ordinal.Equals(
                    _receiverSiteId, missionEvent.SiteId))
                RememberApproachAttempt(
                    missionEvent.ApproachAttemptId,
                    CasevacTerminalLeg.Receiver,
                    missionEvent.SiteId);
        }
        _lastEventSequence = missionEvent.Sequence;
        _lastEventSourceTick = missionEvent.SourceTick;
        _lastEventActiveMissionTicks = missionEvent.ActiveMissionTicks;
        _eventCounts[(int)missionEvent.Kind]++;
        _firstEventSourceTicks[(int)missionEvent.Kind] ??= missionEvent.SourceTick;
        _firstEventActiveMissionTicks[(int)missionEvent.Kind] ??=
            missionEvent.ActiveMissionTicks;
        HighestApproachAttemptId = System.Math.Max(
            HighestApproachAttemptId, missionEvent.ApproachAttemptId);

        if (_missionEventCount == MissionEventCapacity) {
            CasevacMissionEventRecord dropped =
                _missionEvents[_missionEventWriteIndex];
            if (_droppedMissionEventCount == 0L) {
                _firstDroppedMissionEventSequence = dropped.Sequence;
                _firstDroppedMissionEventSourceTick = dropped.SourceTick;
            }
            _lastDroppedMissionEventSequence = dropped.Sequence;
            _lastDroppedMissionEventSourceTick = dropped.SourceTick;
            _droppedMissionEventCount++;
        } else {
            _missionEventCount++;
        }

        _missionEvents[_missionEventWriteIndex] = missionEvent;
        _missionEventWriteIndex =
            (_missionEventWriteIndex + 1) % MissionEventCapacity;
    }

    /// <summary>Return retained sparse events in global sequence order.</summary>
    public CasevacMissionEventRecord[] ReadMissionEvents() {
        if (_missionEventCount == 0)
            return Array.Empty<CasevacMissionEventRecord>();
        var result = new CasevacMissionEventRecord[_missionEventCount];
        int oldest = _missionEventCount == MissionEventCapacity
            ? _missionEventWriteIndex
            : 0;
        for (int index = 0; index < result.Length; index++)
            result[index] =
                _missionEvents[(oldest + index) % MissionEventCapacity];
        return result;
    }

    public long GetPhaseTicks(CasevacPhase phase) {
        if (!Enum.IsDefined(phase))
            throw new ArgumentOutOfRangeException(nameof(phase));
        return _phaseTicks[(int)phase];
    }

    public long GetMaskingTicks(CasevacMaskingState state) {
        if (!Enum.IsDefined(state))
            throw new ArgumentOutOfRangeException(nameof(state));
        return _maskingTicks[(int)state];
    }

    public long GetEventCount(CasevacEventKind kind) {
        if (!Enum.IsDefined(kind))
            throw new ArgumentOutOfRangeException(nameof(kind));
        return _eventCounts[(int)kind];
    }

    public long? GetFirstEventSourceTick(CasevacEventKind kind) {
        if (!Enum.IsDefined(kind))
            throw new ArgumentOutOfRangeException(nameof(kind));
        return _firstEventSourceTicks[(int)kind];
    }

    public long? GetFirstEventActiveMissionTick(CasevacEventKind kind) {
        if (!Enum.IsDefined(kind))
            throw new ArgumentOutOfRangeException(nameof(kind));
        return _firstEventActiveMissionTicks[(int)kind];
    }

    public CasevacLandingZoneEvidence GetLandingZoneEvidence(
        CasevacTerminalLeg leg) {
        int legIndex = ValidateLeg(leg);
        return new CasevacLandingZoneEvidence(
            _terminalObservedTicks[legIndex],
            _gateTicks[GateIndex(legIndex, LandingZoneGateClass.Advance)],
            _gateTicks[GateIndex(legIndex, LandingZoneGateClass.Hold)],
            _gateTicks[GateIndex(legIndex, LandingZoneGateClass.Break)],
            _enterViolationAnyTicks[legIndex],
            _exitViolationAnyTicks[legIndex],
            _observedEnterViolations[legIndex],
            _observedExitViolations[legIndex],
            _maximumLateralGroundSpeedMps[legIndex],
            _maximumAbsoluteVerticalSpeedMps[legIndex],
            _maximumAbsolutePitchRad[legIndex],
            _maximumAbsoluteBankRad[legIndex]);
    }

    public long GetEnterViolationTicks(
        CasevacTerminalLeg leg,
        LandingZoneGateViolation violation) =>
        GetViolationTicks(_enterViolationTicks, leg, violation);

    public long GetExitViolationTicks(
        CasevacTerminalLeg leg,
        LandingZoneGateViolation violation) =>
        GetViolationTicks(_exitViolationTicks, leg, violation);

    /// <summary>
    /// Consider one externally selected correction. Selection authority remains outside this
    /// passive recorder; the bounded store applies only the documented deterministic ordering.
    /// </summary>
    public void ConsiderCorrection(in CasevacCorrectionRange correction) {
        ValidateCorrection(correction);
        for (int index = 0; index < _correctionRangeCount; index++) {
            if (_correctionRanges[index].Equals(correction))
                return;
        }

        int insertionIndex = 0;
        while (insertionIndex < _correctionRangeCount
            && CompareCorrections(_correctionRanges[insertionIndex], correction) <= 0)
            insertionIndex++;
        if (insertionIndex >= CorrectionRangeCapacity)
            return;

        int newCount =
            System.Math.Min(_correctionRangeCount + 1, CorrectionRangeCapacity);
        for (int index = newCount - 1; index > insertionIndex; index--)
            _correctionRanges[index] = _correctionRanges[index - 1];
        _correctionRanges[insertionIndex] = correction;
        _correctionRangeCount = newCount;
    }

    void ValidateTick(
        in CasevacTickObservation observation,
        CasevacMissionSnapshot snapshot) {
        if (snapshot is null)
            throw new ArgumentNullException(nameof(snapshot));
        if (observation.SourceTick <= _lastObservedSourceTick)
            throw new InvalidOperationException(
                "CASEVAC evidence ticks must be strictly increasing.");
        if (snapshot.SchemaVersion != CasevacContract.SchemaVersion)
            throw new ArgumentOutOfRangeException(nameof(snapshot),
                "Unsupported CASEVAC snapshot schema.");
        ValidateStableId(snapshot.ScenarioId, nameof(snapshot));
        if (snapshot.MissionEpochSequence <= 0L
            || snapshot.MissionBeginSourceTick < 0L
            || snapshot.LastSourceTick != observation.SourceTick
            || snapshot.LastSourceTick < snapshot.MissionBeginSourceTick
            || snapshot.ActiveMissionTicks < 0L
            || snapshot.CallAgeTicks < 0L
            || snapshot.RequestedHandoffAgeTicks <= 0L
            || snapshot.CurrentApproachAttemptId < 0L
            || snapshot.LatestApproachAttemptId < snapshot.CurrentApproachAttemptId
            || snapshot.StabilizationProgressTicks < 0
            || snapshot.OperationProgressTicks < 0
            || snapshot.OperationRequiredTicks < 0
            || snapshot.QuietProgressTicks < 0
            || !double.IsFinite(snapshot.PayloadMassKg)
            || snapshot.PayloadMassKg < 0.0)
            throw new ArgumentOutOfRangeException(nameof(snapshot));
        if (!Enum.IsDefined(snapshot.Phase)
            || !Enum.IsDefined(snapshot.Custody)
            || !Enum.IsDefined(snapshot.Disposition))
            throw new ArgumentOutOfRangeException(nameof(snapshot));
        if (snapshot.TargetSiteId is not null
            && string.IsNullOrWhiteSpace(snapshot.TargetSiteId))
            throw new ArgumentException(
                "A target site ID must be null or non-blank.", nameof(snapshot));
        if (snapshot.ActiveMissionTicks < _lastObservedActiveMissionTicks)
            throw new InvalidOperationException(
                "CASEVAC active mission time cannot regress.");
        if (FinalDisposition != CasevacDisposition.Pending
            && snapshot.Disposition != FinalDisposition)
            throw new InvalidOperationException(
                "A terminal CASEVAC disposition cannot regress or change.");
        ValidateIdentity(snapshot.ScenarioId, snapshot.MissionEpochSequence);
        ValidateObservation(observation);
        if (observation.LandingZone.ApproachAttemptId
            > snapshot.LatestApproachAttemptId)
            throw new InvalidOperationException(
                "Landing-zone evidence cannot reference an unknown approach attempt.");
        if (TryClassifyTerminal(
                observation, snapshot, out CasevacTerminalLeg terminalLeg)
            && CanEstablishTerminalSite(
                terminalLeg, observation.LandingZone.SiteId!, snapshot))
            ValidateTerminalSite(
                terminalLeg, observation.LandingZone.SiteId!);
    }

    void ValidateEvent(in CasevacMissionEventRecord missionEvent) {
        if (missionEvent.SchemaVersion != CasevacContract.SchemaVersion)
            throw new ArgumentOutOfRangeException(nameof(missionEvent),
                "Unsupported CASEVAC mission-event schema.");
        ValidateStableId(missionEvent.ScenarioId, nameof(missionEvent));
        ValidateStableId(missionEvent.AircraftId, nameof(missionEvent));
        ValidateStableId(missionEvent.CapsuleId, nameof(missionEvent));
        if (missionEvent.SiteId is not null
            && string.IsNullOrWhiteSpace(missionEvent.SiteId))
            throw new ArgumentException(
                "An event site ID must be null or non-blank.", nameof(missionEvent));
        if (missionEvent.Sequence <= 0L
            || missionEvent.SourceTick < 0L
            || missionEvent.ActiveMissionTicks < 0L
            || missionEvent.MissionEpochSequence <= 0L
            || missionEvent.ApproachAttemptId < 0L
            || !Enum.IsDefined(missionEvent.Kind))
            throw new ArgumentOutOfRangeException(nameof(missionEvent));
        if (missionEvent.Sequence <= _lastEventSequence)
            throw new InvalidOperationException(
                "CASEVAC mission-event sequences must increase; gaps are allowed.");
        if (_lastEventSequence > 0L
            && missionEvent.SourceTick < _lastEventSourceTick)
            throw new InvalidOperationException(
                "CASEVAC mission-event source ticks cannot regress.");
        if (_lastEventSequence > 0L
            && missionEvent.ActiveMissionTicks < _lastEventActiveMissionTicks)
            throw new InvalidOperationException(
                "CASEVAC mission-event active time cannot regress.");
        if (_lastEventSequence == 0L) {
            if (missionEvent.Kind != CasevacEventKind.CasevacTaskStarted
                || missionEvent.Sequence != missionEvent.MissionEpochSequence)
                throw new InvalidOperationException(
                    "The first CASEVAC evidence event must establish the mission epoch.");
        } else if (missionEvent.Kind == CasevacEventKind.CasevacTaskStarted) {
            throw new InvalidOperationException(
                "A recorder represents exactly one CASEVAC mission epoch.");
        }
        ValidateIdentity(
            missionEvent.ScenarioId, missionEvent.MissionEpochSequence);
        if (missionEvent.Kind == CasevacEventKind.PickupApproachEntered
            && missionEvent.SiteId is not null)
            ValidateTerminalSite(
                CasevacTerminalLeg.Pickup, missionEvent.SiteId);
        if (missionEvent.Kind == CasevacEventKind.DropoffApproachEntered
            && missionEvent.SiteId is not null)
            ValidateTerminalSite(
                CasevacTerminalLeg.Receiver, missionEvent.SiteId);
        if (_aircraftId is not null
            && (!StringComparer.Ordinal.Equals(
                    _aircraftId, missionEvent.AircraftId)
                || !StringComparer.Ordinal.Equals(
                    _capsuleId, missionEvent.CapsuleId)))
            throw new InvalidOperationException(
                "CASEVAC evidence identity cannot change within a mission epoch.");
    }

    void ValidateIdentity(string scenarioId, long missionEpochSequence) {
        if (_scenarioId is not null
            && (!StringComparer.Ordinal.Equals(_scenarioId, scenarioId)
                || _missionEpochSequence != missionEpochSequence))
            throw new InvalidOperationException(
                "CASEVAC evidence cannot combine mission epochs.");
    }

    void BindMissionIdentity(string scenarioId, long missionEpochSequence) {
        if (_scenarioId is not null) return;
        _scenarioId = scenarioId;
        _missionEpochSequence = missionEpochSequence;
    }

    void ValidateTerminalSite(CasevacTerminalLeg leg, string siteId) {
        string? established = leg == CasevacTerminalLeg.Pickup
            ? _pickupSiteId
            : _receiverSiteId;
        string? other = leg == CasevacTerminalLeg.Pickup
            ? _receiverSiteId
            : _pickupSiteId;
        if (established is not null
            && !StringComparer.Ordinal.Equals(established, siteId))
            throw new InvalidOperationException(
                "A CASEVAC terminal identity cannot change within a mission epoch.");
        if (other is not null && StringComparer.Ordinal.Equals(other, siteId))
            throw new InvalidOperationException(
                "Pickup and receiver evidence require distinct site identities.");
    }

    void BindTerminalSite(CasevacTerminalLeg leg, string siteId) {
        if (leg == CasevacTerminalLeg.Pickup)
            _pickupSiteId ??= siteId;
        else
            _receiverSiteId ??= siteId;
    }

    bool CanEstablishTerminalSite(
        CasevacTerminalLeg leg,
        string siteId,
        CasevacMissionSnapshot snapshot) {
        string? established = leg == CasevacTerminalLeg.Pickup
            ? _pickupSiteId
            : _receiverSiteId;
        if (established is not null)
            return StringComparer.Ordinal.Equals(established, siteId);
        return snapshot.TargetSiteId is not null
            && StringComparer.Ordinal.Equals(snapshot.TargetSiteId, siteId);
    }

    static void ValidateObservation(in CasevacTickObservation observation) {
        if (observation.SourceTick < 0L
            || !double.IsFinite(observation.Position.X)
            || !double.IsFinite(observation.Position.Y)
            || !double.IsFinite(observation.Position.Z)
            || !double.IsFinite(observation.ClearanceM)
            || observation.ClearanceM < 0.0
            || !Enum.IsDefined(observation.MaskingState))
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (observation.MaskingState == CasevacMaskingState.Masked
            && !observation.WithinSafeMaskingBand)
            throw new ArgumentException(
                "Masked evidence must lie inside the authored safe masking band.",
                nameof(observation));

        LandingZoneObservation landingZone = observation.LandingZone;
        if (landingZone.SiteId is not null
            && string.IsNullOrWhiteSpace(landingZone.SiteId))
            throw new ArgumentException(
                "A landing-zone site ID must be null or non-blank.",
                nameof(observation));
        if (!double.IsFinite(landingZone.LateralGroundSpeedMps)
            || landingZone.LateralGroundSpeedMps < 0.0
            || !double.IsFinite(landingZone.VerticalSpeedMps)
            || !double.IsFinite(landingZone.PitchRad)
            || !double.IsFinite(landingZone.BankRad)
            || landingZone.ApproachAttemptId < 0L
            || !Enum.IsDefined(landingZone.GateClass))
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (landingZone.InsideEnterFootprint
            && !landingZone.InsideExitFootprint)
            throw new ArgumentException(
                "Landing-zone footprint nesting is invalid.", nameof(observation));
        if (landingZone.InsideExitFootprint
            && !landingZone.InsideTerminalVolume)
            throw new ArgumentException(
                "Landing-zone footprint lies outside its terminal.",
                nameof(observation));
        if (landingZone.InsideTerminalVolume != (landingZone.SiteId is not null)
            || (!landingZone.InsideTerminalVolume
                && (landingZone.InsideEnterFootprint
                    || landingZone.InsideExitFootprint
                    || landingZone.SurfaceContact)))
            throw new ArgumentException(
                "Landing-zone identity and geometry are inconsistent.",
                nameof(observation));
        if ((landingZone.ExitViolations & ~landingZone.EnterViolations)
            != LandingZoneGateViolation.None)
            throw new ArgumentException(
                "Loose-gate violations must be a subset of tight-gate violations.",
                nameof(observation));
        ValidateViolationFlags(landingZone.EnterViolations, nameof(observation));
        ValidateViolationFlags(landingZone.ExitViolations, nameof(observation));

        LandingZoneGateClass expected =
            landingZone.ExitViolations != LandingZoneGateViolation.None
                ? LandingZoneGateClass.Break
                : landingZone.EnterViolations == LandingZoneGateViolation.None
                    ? LandingZoneGateClass.Advance
                    : LandingZoneGateClass.Hold;
        if (landingZone.GateClass != expected
            || (expected == LandingZoneGateClass.Advance
                && (!landingZone.InsideEnterFootprint
                    || !landingZone.SurfaceContact))
            || (expected == LandingZoneGateClass.Hold
                && (!landingZone.InsideExitFootprint
                    || !landingZone.SurfaceContact)))
            throw new ArgumentException(
                "Landing-zone gate classification is inconsistent.",
                nameof(observation));
    }

    static void ValidateViolationFlags(
        LandingZoneGateViolation violations,
        string parameterName) {
        const LandingZoneGateViolation all =
            LandingZoneGateViolation.OutsideTerminalVolume
            | LandingZoneGateViolation.OutsideEnterFootprint
            | LandingZoneGateViolation.OutsideExitFootprint
            | LandingZoneGateViolation.NoSurfaceContact
            | LandingZoneGateViolation.LateralGroundSpeed
            | LandingZoneGateViolation.VerticalSpeed
            | LandingZoneGateViolation.Pitch
            | LandingZoneGateViolation.Bank;
        if ((violations & ~all) != LandingZoneGateViolation.None)
            throw new ArgumentOutOfRangeException(parameterName);
    }

    static CasevacEvidenceSample BuildSample(
        in CasevacTickObservation observation,
        CasevacMissionSnapshot snapshot) {
        LandingZoneObservation landingZone = observation.LandingZone;
        return new CasevacEvidenceSample(
            CasevacContract.SchemaVersion,
            observation.SourceTick,
            snapshot.ActiveMissionTicks,
            snapshot.MissionEpochSequence,
            snapshot.Phase,
            snapshot.Custody,
            snapshot.Disposition,
            observation.Position,
            observation.ClearanceM,
            observation.MaskingState,
            observation.WithinSafeMaskingBand,
            observation.ProtectionInterventionActive,
            landingZone.SiteId,
            landingZone.InsideTerminalVolume,
            landingZone.InsideEnterFootprint,
            landingZone.InsideExitFootprint,
            landingZone.SurfaceContact,
            landingZone.GateClass,
            landingZone.EnterViolations,
            landingZone.ExitViolations,
            landingZone.LateralGroundSpeedMps,
            landingZone.VerticalSpeedMps,
            landingZone.PitchRad,
            landingZone.BankRad,
            landingZone.ApproachAttemptId,
            snapshot.CurrentApproachAttemptId,
            snapshot.StableContact,
            snapshot.StabilizationProgressTicks,
            snapshot.OperationProgressTicks);
    }

    static void AppendSample(
        CasevacEvidenceSample[] destination,
        ref int count,
        ref long skipped,
        in CasevacEvidenceSample sample) {
        if (count < destination.Length) {
            destination[count++] = sample;
        } else {
            skipped++;
        }
    }

    bool TryClassifyTerminal(
        in CasevacTickObservation observation,
        CasevacMissionSnapshot snapshot,
        out CasevacTerminalLeg leg) {
        if (!observation.LandingZone.InsideTerminalVolume) {
            leg = default;
            return false;
        }

        string siteId = observation.LandingZone.SiteId!;
        if (_pickupSiteId is not null
            && StringComparer.Ordinal.Equals(_pickupSiteId, siteId)) {
            leg = CasevacTerminalLeg.Pickup;
            return true;
        }
        if (_receiverSiteId is not null
            && StringComparer.Ordinal.Equals(_receiverSiteId, siteId)) {
            leg = CasevacTerminalLeg.Receiver;
            return true;
        }

        if (snapshot.TargetSiteId is null
            || !StringComparer.Ordinal.Equals(snapshot.TargetSiteId, siteId)) {
            leg = default;
            return false;
        }
        switch (snapshot.Phase) {
            case CasevacPhase.Ingress:
            case CasevacPhase.PickupApproach:
            case CasevacPhase.Loading:
                leg = CasevacTerminalLeg.Pickup;
                return true;
            case CasevacPhase.Outbound:
            case CasevacPhase.DropoffApproach:
            case CasevacPhase.Handoff:
                leg = CasevacTerminalLeg.Receiver;
                return true;
            default:
                leg = default;
                return false;
        }
    }

    bool TryClassifyGate(
        in CasevacTickObservation observation,
        CasevacMissionSnapshot snapshot,
        bool terminalWasClassified,
        CasevacTerminalLeg classifiedTerminalLeg,
        out CasevacTerminalLeg leg,
        out string? expectedSiteId) {
        long attemptId = observation.LandingZone.ApproachAttemptId;
        if (attemptId <= 0L) {
            leg = default;
            expectedSiteId = null;
            return false;
        }

        if (_mappedApproachAttemptId == attemptId) {
            leg = _mappedApproachLeg;
            expectedSiteId = _mappedApproachSiteId;
            return true;
        }
        if (terminalWasClassified) {
            leg = classifiedTerminalLeg;
            expectedSiteId = observation.LandingZone.SiteId;
            RememberApproachAttempt(attemptId, leg, expectedSiteId);
            return true;
        }

        switch (snapshot.Phase) {
            case CasevacPhase.PickupApproach:
            case CasevacPhase.Loading:
                leg = CasevacTerminalLeg.Pickup;
                break;
            case CasevacPhase.DropoffApproach:
            case CasevacPhase.Handoff:
                leg = CasevacTerminalLeg.Receiver;
                break;
            // These are post-transition snapshots. The observation still carries the attempt
            // that owned this tick even though the controller has cleared its current ID.
            case CasevacPhase.Outbound
                when snapshot.Custody == CapsuleCustody.InAircraft:
                leg = CasevacTerminalLeg.Pickup;
                break;
            case CasevacPhase.Quiet
                when snapshot.Custody == CapsuleCustody.AtReceiver:
                leg = CasevacTerminalLeg.Receiver;
                break;
            case CasevacPhase.AbortReturn:
            case CasevacPhase.Aborted:
            case CasevacPhase.AircraftLost:
                leg = snapshot.Custody == CapsuleCustody.AtPickup
                    ? CasevacTerminalLeg.Pickup
                    : CasevacTerminalLeg.Receiver;
                break;
            default:
                leg = default;
                expectedSiteId = null;
                return false;
        }

        expectedSiteId = leg == CasevacTerminalLeg.Pickup
            ? _pickupSiteId
            : _receiverSiteId;
        expectedSiteId ??= observation.LandingZone.SiteId;
        RememberApproachAttempt(attemptId, leg, expectedSiteId);
        return true;
    }

    void RememberApproachAttempt(
        long attemptId,
        CasevacTerminalLeg leg,
        string? siteId) {
        if (attemptId <= _mappedApproachAttemptId) return;
        _mappedApproachAttemptId = attemptId;
        _mappedApproachLeg = leg;
        _mappedApproachSiteId = siteId;
    }

    void UpdateGateAggregates(
        CasevacTerminalLeg leg,
        in LandingZoneObservation landingZone,
        string? expectedSiteId) {
        int legIndex = (int)leg;
        bool atExpectedSite = expectedSiteId is null
            || (landingZone.InsideTerminalVolume
                && StringComparer.Ordinal.Equals(
                    landingZone.SiteId, expectedSiteId));
        LandingZoneGateClass gateClass = atExpectedSite
            ? landingZone.GateClass
            : LandingZoneGateClass.Break;
        LandingZoneGateViolation enterViolations = atExpectedSite
            ? landingZone.EnterViolations
            : LandingZoneGateViolation.OutsideTerminalVolume
                | LandingZoneGateViolation.OutsideEnterFootprint
                | LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact;
        LandingZoneGateViolation exitViolations = atExpectedSite
            ? landingZone.ExitViolations
            : LandingZoneGateViolation.OutsideTerminalVolume
                | LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact;
        _terminalObservedTicks[legIndex]++;
        _gateTicks[GateIndex(legIndex, gateClass)]++;
        _observedEnterViolations[legIndex] |= enterViolations;
        _observedExitViolations[legIndex] |= exitViolations;
        if (enterViolations != LandingZoneGateViolation.None)
            _enterViolationAnyTicks[legIndex]++;
        if (exitViolations != LandingZoneGateViolation.None)
            _exitViolationAnyTicks[legIndex]++;
        AddViolationTicks(
            _enterViolationTicks, legIndex, enterViolations);
        AddViolationTicks(
            _exitViolationTicks, legIndex, exitViolations);
        _maximumLateralGroundSpeedMps[legIndex] = System.Math.Max(
            _maximumLateralGroundSpeedMps[legIndex],
            landingZone.LateralGroundSpeedMps);
        _maximumAbsoluteVerticalSpeedMps[legIndex] = System.Math.Max(
            _maximumAbsoluteVerticalSpeedMps[legIndex],
            System.Math.Abs(landingZone.VerticalSpeedMps));
        _maximumAbsolutePitchRad[legIndex] = System.Math.Max(
            _maximumAbsolutePitchRad[legIndex],
            System.Math.Abs(landingZone.PitchRad));
        _maximumAbsoluteBankRad[legIndex] = System.Math.Max(
            _maximumAbsoluteBankRad[legIndex],
            System.Math.Abs(landingZone.BankRad));
    }

    static void AddViolationTicks(
        long[] destination,
        int legIndex,
        LandingZoneGateViolation violations) {
        for (int bit = 0; bit < ViolationBitCount; bit++) {
            var flag = (LandingZoneGateViolation)(1 << bit);
            if ((violations & flag) != LandingZoneGateViolation.None)
                destination[ViolationIndex(legIndex, bit)]++;
        }
    }

    static long GetViolationTicks(
        long[] source,
        CasevacTerminalLeg leg,
        LandingZoneGateViolation violation) {
        int legIndex = ValidateLeg(leg);
        if (violation == LandingZoneGateViolation.None
            || !IsSingleViolationFlag(violation))
            throw new ArgumentOutOfRangeException(nameof(violation),
                "Query exactly one landing-zone violation flag.");
        int bit = 0;
        int value = (int)violation;
        while ((value >>= 1) != 0) bit++;
        return source[ViolationIndex(legIndex, bit)];
    }

    static int ValidateLeg(CasevacTerminalLeg leg) {
        if (!Enum.IsDefined(leg))
            throw new ArgumentOutOfRangeException(nameof(leg));
        return (int)leg;
    }

    static bool IsSingleViolationFlag(LandingZoneGateViolation violation) {
        int value = (int)violation;
        return value > 0 && (value & (value - 1)) == 0
            && value <= (int)LandingZoneGateViolation.Bank;
    }

    static int GateIndex(int legIndex, LandingZoneGateClass gateClass) =>
        legIndex * GateClassCount + (int)gateClass;

    static int ViolationIndex(int legIndex, int bit) =>
        legIndex * ViolationBitCount + bit;

    void ValidateCorrection(in CasevacCorrectionRange correction) {
        if (!Enum.IsDefined(correction.Stream)
            || correction.StartSourceTick < 0L
            || correction.EndSourceTick < correction.StartSourceTick
            || correction.Priority < 0)
            throw new ArgumentOutOfRangeException(nameof(correction));
        ValidateStableId(correction.Reason, nameof(correction));

        CasevacEvidenceSample[] samples;
        int count;
        switch (correction.Stream) {
            case CasevacEvidenceStream.Route:
                samples = _routeSamples;
                count = _routeSampleCount;
                break;
            case CasevacEvidenceStream.PickupTerminal:
                samples = _pickupTerminalSamples;
                count = _pickupTerminalSampleCount;
                break;
            case CasevacEvidenceStream.ReceiverTerminal:
                samples = _receiverTerminalSamples;
                count = _receiverTerminalSampleCount;
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(correction));
        }
        if (count == 0
            || correction.StartSourceTick < samples[0].SourceTick
            || correction.EndSourceTick > samples[count - 1].SourceTick)
            throw new InvalidOperationException(
                "A correction range must be bounded by retained replay evidence.");

        bool intersectsRetainedSample = false;
        for (int index = 0; index < count; index++) {
            long tick = samples[index].SourceTick;
            if (tick < correction.StartSourceTick) continue;
            if (tick > correction.EndSourceTick) break;
            intersectsRetainedSample = true;
            break;
        }
        if (!intersectsRetainedSample)
            throw new InvalidOperationException(
                "A correction range must contain retained replay evidence.");
    }

    static int CompareCorrections(
        in CasevacCorrectionRange left,
        in CasevacCorrectionRange right) {
        int comparison = left.Priority.CompareTo(right.Priority);
        if (comparison != 0) return comparison;
        comparison = left.StartSourceTick.CompareTo(right.StartSourceTick);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(left.Reason, right.Reason);
        if (comparison != 0) return comparison;
        comparison = left.EndSourceTick.CompareTo(right.EndSourceTick);
        if (comparison != 0) return comparison;
        return left.Stream.CompareTo(right.Stream);
    }

    static void ValidateStableId(string value, string parameterName) {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException(
                "A stable non-blank identity is required.", parameterName);
    }
}
