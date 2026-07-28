namespace GunsOnly.Sim.Casevac;

/// <summary>
/// Deterministic, flight-model-independent authority for the first CASEVAC pickup/drop-off loop.
/// One call to <see cref="Advance"/> represents one unpaused authority tick, regardless of the
/// numerical distance between source ticks.
/// </summary>
public sealed class CasevacMissionController {
    const int MaximumEventsPerTick = 8;

    readonly CasevacScenarioDefinition _definition;
    readonly Func<long> _allocateEventSequence;
    readonly Action<CasevacMissionEventRecord>? _eventSink;
    readonly CasevacMissionEventRecord[] _pendingEvents =
        new CasevacMissionEventRecord[MaximumEventsPerTick];

    int _pendingEventCount;
    bool _mutationInProgress;
    CasevacPhase _phase = CasevacPhase.Ready;
    CapsuleCustody _custody = CapsuleCustody.AtPickup;
    CasevacDisposition _disposition = CasevacDisposition.Pending;
    long _missionEpochSequence;
    long _missionBeginSourceTick = -1;
    long _lastSourceTick = -1;
    long _activeMissionTicks;
    long _lastEventSequence;
    long _latestApproachAttemptId;
    long _currentApproachAttemptId;
    bool _requestedHandoffWindowPassed;
    bool _stableContact;
    bool _operationPaused;
    bool _approachMadeContact;
    bool _approachAwaitingTerminalExit;
    bool _abortSawOutsideSafeExit;
    int _stabilizationProgressTicks;
    int _operationProgressTicks;
    int _quietProgressTicks;
    long? _capsuleSecuredCallAgeTicks;
    long? _handoffCallAgeTicks;

    readonly record struct ControllerState(
        CasevacPhase Phase,
        CapsuleCustody Custody,
        CasevacDisposition Disposition,
        long MissionEpochSequence,
        long MissionBeginSourceTick,
        long LastSourceTick,
        long ActiveMissionTicks,
        long LastEventSequence,
        long LatestApproachAttemptId,
        long CurrentApproachAttemptId,
        bool RequestedHandoffWindowPassed,
        bool StableContact,
        bool OperationPaused,
        bool ApproachMadeContact,
        bool ApproachAwaitingTerminalExit,
        bool AbortSawOutsideSafeExit,
        int StabilizationProgressTicks,
        int OperationProgressTicks,
        int QuietProgressTicks,
        long? CapsuleSecuredCallAgeTicks,
        long? HandoffCallAgeTicks);

    /// <param name="eventSink">
    /// Optional post-commit observer. It receives the tick's records in sequence order after the
    /// controller reaches its settled snapshot and must be non-throwing; observer failure is a
    /// fail-stop integration error and does not roll back already-authoritative mission state.
    /// </param>
    public CasevacMissionController(
        CasevacScenarioDefinition definition,
        Func<long> allocateEventSequence,
        Action<CasevacMissionEventRecord>? eventSink = null) {
        _definition = definition
            ?? throw new ArgumentNullException(nameof(definition));
        _allocateEventSequence = allocateEventSequence
            ?? throw new ArgumentNullException(nameof(allocateEventSequence));
        _eventSink = eventSink;
    }

    public CasevacScenarioDefinition Definition => _definition;
    public CasevacPhase Phase => _phase;
    public CapsuleCustody Custody => _custody;
    public CasevacDisposition Disposition => _disposition;
    public long MissionEpochSequence => _missionEpochSequence;
    public long ActiveMissionTicks => _activeMissionTicks;
    public long CallAgeTicks =>
        checked(_definition.InitialCallAgeTicks + _activeMissionTicks);
    public double PayloadMassKg =>
        _custody == CapsuleCustody.InAircraft ? _definition.CapsuleMassKg : 0.0;
    public long LatestEventSequence => _lastEventSequence;
    public bool IsTerminal => _phase is CasevacPhase.Complete
        or CasevacPhase.Aborted
        or CasevacPhase.AircraftLost;

    public CasevacMissionSnapshot Snapshot => new(
        SchemaVersion: CasevacContract.SchemaVersion,
        ScenarioId: _definition.Id,
        MissionEpochSequence: _missionEpochSequence,
        Phase: _phase,
        Custody: _custody,
        Disposition: _disposition,
        MissionBeginSourceTick: _missionBeginSourceTick,
        LastSourceTick: _lastSourceTick,
        ActiveMissionTicks: _activeMissionTicks,
        CallAgeTicks: CallAgeTicks,
        RequestedHandoffAgeTicks: _definition.RequestedHandoffAgeTicks,
        RequestedHandoffWindowPassed: _requestedHandoffWindowPassed,
        ClockRunning: IsClockRunning,
        TargetSiteId: TargetSiteId,
        CurrentApproachAttemptId: _currentApproachAttemptId,
        LatestApproachAttemptId: _latestApproachAttemptId,
        StableContact: _stableContact,
        StabilizationProgressTicks: _stabilizationProgressTicks,
        OperationProgressTicks: _operationProgressTicks,
        OperationRequiredTicks: OperationRequiredTicks,
        QuietProgressTicks: _quietProgressTicks,
        PayloadMassKg: PayloadMassKg,
        CapsuleSecuredCallAgeTicks: _capsuleSecuredCallAgeTicks,
        HandoffCallAgeTicks: _handoffCallAgeTicks);

    bool IsClockRunning => _phase is CasevacPhase.Ingress
        or CasevacPhase.PickupApproach
        or CasevacPhase.Loading
        or CasevacPhase.Outbound
        or CasevacPhase.DropoffApproach
        or CasevacPhase.Handoff
        or CasevacPhase.AbortReturn;

    string? TargetSiteId => _phase switch {
        CasevacPhase.Ingress or CasevacPhase.PickupApproach
            or CasevacPhase.Loading => _definition.PickupSiteId,
        CasevacPhase.Outbound or CasevacPhase.DropoffApproach
            or CasevacPhase.Handoff => _definition.ReceiverSiteId,
        CasevacPhase.AbortReturn => _definition.SafeExitVolumeId,
        _ => null
    };

    int OperationRequiredTicks => _phase switch {
        CasevacPhase.Loading => _definition.LoadingDwellTicks,
        CasevacPhase.Handoff => _definition.HandoffDwellTicks,
        _ => 0
    };

    /// <summary>
    /// Starts a fresh mission epoch. Restarts construct a fresh controller while retaining the
    /// session-owned event allocator, so the first event sequence is also the epoch identity.
    /// </summary>
    public CasevacMissionSnapshot Begin(long sourceTick) {
        if (sourceTick < 0)
            throw new ArgumentOutOfRangeException(nameof(sourceTick));
        if (_phase != CasevacPhase.Ready)
            throw new InvalidOperationException(
                "A CASEVAC controller can begin only once.");
        BeginMutation();
        ControllerState before = CaptureState();
        try {
            CasevacMissionSnapshot snapshot;
            try {
                long sequence = AllocateSequence();
                _missionEpochSequence = sequence;
                _missionBeginSourceTick = sourceTick;
                _lastSourceTick = sourceTick;
                _phase = CasevacPhase.Ingress;
                QueueEvent(new CasevacMissionEventRecord(
                    CasevacContract.SchemaVersion,
                    sequence,
                    sourceTick,
                    ActiveMissionTicks: 0,
                    MissionEpochSequence: sequence,
                    CasevacEventKind.CasevacTaskStarted,
                    _definition.Id,
                    _definition.AircraftId,
                    _definition.CapsuleId,
                    SiteId: null,
                    ApproachAttemptId: 0));
                snapshot = Snapshot;
            } catch {
                RestoreState(before);
                throw;
            }
            FlushPendingEvents();
            return snapshot;
        } finally {
            EndMutation();
        }
    }

    /// <summary>
    /// Advances one active authority tick. A paused session does not call this method. Normal
    /// processing allows at most one primary phase transition per call.
    /// </summary>
    public CasevacMissionSnapshot Advance(
        in CasevacTickObservation observation,
        CasevacSemanticCommand command = CasevacSemanticCommand.None) {
        if (!Enum.IsDefined(command))
            throw new ArgumentOutOfRangeException(nameof(command));
        if (_phase == CasevacPhase.Ready)
            throw new InvalidOperationException(
                "Begin the CASEVAC mission before advancing it.");
        if (IsTerminal) return Snapshot;
        if (observation.SourceTick <= _lastSourceTick)
            throw new ArgumentOutOfRangeException(nameof(observation),
                "CASEVAC observations must have strictly increasing source ticks.");

        BeginMutation();
        ControllerState before = CaptureState();
        try {
            CasevacMissionSnapshot snapshot;
            try {
                AdvanceCore(observation, command);
                snapshot = Snapshot;
            } catch {
                RestoreState(before);
                throw;
            }
            FlushPendingEvents();
            return snapshot;
        } finally {
            EndMutation();
        }
    }

    void AdvanceCore(
        in CasevacTickObservation observation,
        CasevacSemanticCommand command) {
        _lastSourceTick = observation.SourceTick;
        if (_phase == CasevacPhase.Quiet) {
            AdvanceQuiet();
            return;
        }

        long previousCallAgeTicks = CallAgeTicks;
        _activeMissionTicks = checked(_activeMissionTicks + 1L);
        long currentCallAgeTicks = CallAgeTicks;
        if (!_requestedHandoffWindowPassed
            && previousCallAgeTicks < _definition.RequestedHandoffAgeTicks
            && currentCallAgeTicks >= _definition.RequestedHandoffAgeTicks) {
            _requestedHandoffWindowPassed = true;
            Emit(CasevacEventKind.RequestedHandoffWindowPassed,
                siteId: null, approachAttemptId: 0);
        }

        // Same-tick authority is loss, then an eligible explicit abort, then one normal phase
        // transition. The tick and any exact window crossing remain part of the latched clock.
        if (!observation.VehicleFlyable) {
            LatchAircraftLoss(observation.LandingZone);
            return;
        }
        if (command == CasevacSemanticCommand.RequestAbort
            && IsAbortEligible) {
            StartAbortReturn(
                observation.LandingZone,
                observation.InsideSafeExitVolume);
            return;
        }

        switch (_phase) {
            case CasevacPhase.Ingress:
                if (IsInsideSite(observation.LandingZone,
                    _definition.PickupSiteId))
                    EnterApproach(
                        CasevacPhase.PickupApproach,
                        CasevacEventKind.PickupApproachEntered,
                        _definition.PickupSiteId,
                        observation.LandingZone.SurfaceContact);
                break;

            case CasevacPhase.PickupApproach:
                AdvanceApproach(
                    observation.LandingZone,
                    _definition.PickupSiteId,
                    CasevacPhase.Loading,
                    CasevacEventKind.LoadingStarted);
                break;

            case CasevacPhase.Loading:
                AdvanceOperation(
                    observation.LandingZone,
                    _definition.PickupSiteId,
                    _definition.LoadingDwellTicks,
                    isLoading: true);
                break;

            case CasevacPhase.Outbound:
                if (IsInsideSite(observation.LandingZone,
                    _definition.ReceiverSiteId))
                    EnterApproach(
                        CasevacPhase.DropoffApproach,
                        CasevacEventKind.DropoffApproachEntered,
                        _definition.ReceiverSiteId,
                        observation.LandingZone.SurfaceContact);
                break;

            case CasevacPhase.DropoffApproach:
                AdvanceApproach(
                    observation.LandingZone,
                    _definition.ReceiverSiteId,
                    CasevacPhase.Handoff,
                    CasevacEventKind.HandoffStarted);
                break;

            case CasevacPhase.Handoff:
                AdvanceOperation(
                    observation.LandingZone,
                    _definition.ReceiverSiteId,
                    _definition.HandoffDwellTicks,
                    isLoading: false);
                break;

            case CasevacPhase.AbortReturn:
                AdvanceAbortReturn(observation.InsideSafeExitVolume);
                break;
        }
    }

    bool IsAbortEligible => _custody == CapsuleCustody.AtPickup
        && _phase is CasevacPhase.Ingress
            or CasevacPhase.PickupApproach
            or CasevacPhase.Loading;

    void AdvanceQuiet() {
        _quietProgressTicks = checked(_quietProgressTicks + 1);
        if (_quietProgressTicks >= _definition.QuietAftermathTicks)
            _phase = CasevacPhase.Complete;
    }

    void EnterApproach(
        CasevacPhase phase,
        CasevacEventKind enteredKind,
        string siteId,
        bool surfaceContactOnEntry) {
        _phase = phase;
        _approachAwaitingTerminalExit = false;
        _stabilizationProgressTicks = 0;
        _operationProgressTicks = 0;
        _operationPaused = false;
        _approachMadeContact = false;
        _stableContact = false;
        Emit(enteredKind, siteId, approachAttemptId: 0);
        StartApproachAttempt(siteId);
        _approachMadeContact = surfaceContactOnEntry;
    }

    void StartApproachAttempt(string siteId) {
        _latestApproachAttemptId = checked(_latestApproachAttemptId + 1L);
        _currentApproachAttemptId = _latestApproachAttemptId;
        _approachMadeContact = false;
        Emit(CasevacEventKind.ApproachAttemptStarted, siteId);
    }

    void AdvanceApproach(
        in LandingZoneObservation landingZone,
        string targetSiteId,
        CasevacPhase operationPhase,
        CasevacEventKind operationStartedKind) {
        bool insideTarget = IsInsideSite(landingZone, targetSiteId);
        if (_currentApproachAttemptId == 0) {
            if (_approachAwaitingTerminalExit) {
                if (!insideTarget) _approachAwaitingTerminalExit = false;
                return;
            }
            if (!insideTarget) return;
            StartApproachAttempt(targetSiteId);
        }

        _approachMadeContact |= landingZone.SurfaceContact;
        switch (GateForTarget(landingZone, targetSiteId)) {
            case LandingZoneGateClass.Advance:
                if (!_stableContact) {
                    _stableContact = true;
                    Emit(CasevacEventKind.StableContactEntered, targetSiteId);
                }
                _stabilizationProgressTicks =
                    checked(_stabilizationProgressTicks + 1);
                if (_stabilizationProgressTicks
                    >= _definition.StabilizationDwellTicks) {
                    _phase = operationPhase;
                    _stabilizationProgressTicks = 0;
                    _operationProgressTicks = 0;
                    _operationPaused = false;
                    Emit(operationStartedKind, targetSiteId);
                }
                break;

            case LandingZoneGateClass.Hold:
                ExitStableContactIfNeeded(targetSiteId);
                _stabilizationProgressTicks = 0;
                break;

            case LandingZoneGateClass.Break:
                ExitStableContactIfNeeded(targetSiteId);
                _stabilizationProgressTicks = 0;
                // No contact is ordinary while descending through the terminal volume. It
                // resets stabilization without turning every airborne tick into a go-around.
                // Once contact has occurred, a loose-gate break is a real discontinuation.
                if (!insideTarget || _approachMadeContact)
                    DiscontinueApproach(targetSiteId, insideTarget);
                break;
        }
    }

    void AdvanceOperation(
        in LandingZoneObservation landingZone,
        string targetSiteId,
        int requiredTicks,
        bool isLoading) {
        bool insideTarget = IsInsideSite(landingZone, targetSiteId);
        switch (GateForTarget(landingZone, targetSiteId)) {
            case LandingZoneGateClass.Advance:
                if (!_stableContact) {
                    _stableContact = true;
                    Emit(CasevacEventKind.StableContactEntered, targetSiteId);
                }
                if (_operationPaused) {
                    _operationPaused = false;
                    Emit(isLoading
                        ? CasevacEventKind.LoadingResumed
                        : CasevacEventKind.HandoffResumed,
                        targetSiteId);
                }
                _operationProgressTicks = checked(_operationProgressTicks + 1);
                if (_operationProgressTicks >= requiredTicks) {
                    if (isLoading) CompleteLoading(targetSiteId);
                    else CompleteHandoff(targetSiteId);
                }
                break;

            case LandingZoneGateClass.Hold:
                ExitStableContactIfNeeded(targetSiteId);
                if (!_operationPaused) {
                    _operationPaused = true;
                    Emit(isLoading
                        ? CasevacEventKind.LoadingPaused
                        : CasevacEventKind.HandoffPaused,
                        targetSiteId);
                }
                break;

            case LandingZoneGateClass.Break:
                ExitStableContactIfNeeded(targetSiteId);
                Emit(isLoading
                    ? CasevacEventKind.LoadingReset
                    : CasevacEventKind.HandoffReset,
                    targetSiteId);
                _operationProgressTicks = 0;
                _operationPaused = false;
                _phase = isLoading
                    ? CasevacPhase.PickupApproach
                    : CasevacPhase.DropoffApproach;
                DiscontinueApproach(targetSiteId, insideTarget);
                break;
        }
    }

    void CompleteLoading(string siteId) {
        long completedAttemptId = _currentApproachAttemptId;
        _custody = CapsuleCustody.InAircraft;
        _capsuleSecuredCallAgeTicks = CallAgeTicks;
        _phase = CasevacPhase.Outbound;
        ClearApproachState();
        Emit(CasevacEventKind.CapsuleSecured, siteId, completedAttemptId);
    }

    void CompleteHandoff(string siteId) {
        long completedAttemptId = _currentApproachAttemptId;
        _custody = CapsuleCustody.AtReceiver;
        _handoffCallAgeTicks = CallAgeTicks;
        _disposition = CallAgeTicks <= _definition.RequestedHandoffAgeTicks
            ? CasevacDisposition.TransferredOnTime
            : CasevacDisposition.TransferredAfterRequestedTime;
        _phase = CasevacPhase.Quiet;
        _quietProgressTicks = 0;
        ClearApproachState();
        Emit(CasevacEventKind.HandoffCompleted, siteId, completedAttemptId);
    }

    void StartAbortReturn(
        in LandingZoneObservation landingZone,
        bool insideSafeExitVolume) {
        if (_currentApproachAttemptId != 0) {
            string siteId = _phase == CasevacPhase.Loading
                || _phase == CasevacPhase.PickupApproach
                ? _definition.PickupSiteId
                : _definition.ReceiverSiteId;
            if (GateForTarget(landingZone, siteId)
                != LandingZoneGateClass.Advance)
                ExitStableContactIfNeeded(siteId);
            Emit(CasevacEventKind.ApproachDiscontinued, siteId);
        }
        _phase = CasevacPhase.AbortReturn;
        _abortSawOutsideSafeExit = !insideSafeExitVolume;
        ClearApproachState();
        Emit(CasevacEventKind.AbortReturnStarted,
            _definition.SafeExitVolumeId, approachAttemptId: 0);
    }

    void AdvanceAbortReturn(bool insideSafeExitVolume) {
        if (!insideSafeExitVolume) {
            _abortSawOutsideSafeExit = true;
            return;
        }
        if (!_abortSawOutsideSafeExit) return;

        _disposition = CasevacDisposition.ControlledAbort;
        _phase = CasevacPhase.Aborted;
        Emit(CasevacEventKind.CasevacAborted,
            _definition.SafeExitVolumeId, approachAttemptId: 0);
    }

    void LatchAircraftLoss(in LandingZoneObservation landingZone) {
        long attemptId = _currentApproachAttemptId;
        _disposition = _custody == CapsuleCustody.InAircraft
            ? CasevacDisposition.AircraftLostOccupied
            : CasevacDisposition.AircraftLostEmpty;
        _phase = CasevacPhase.AircraftLost;
        ClearApproachState();
        Emit(CasevacEventKind.CasevacAircraftLost,
            landingZone.InsideTerminalVolume ? landingZone.SiteId : null,
            attemptId);
    }

    void DiscontinueApproach(string siteId, bool insideTarget) {
        if (_currentApproachAttemptId == 0) return;
        Emit(CasevacEventKind.ApproachDiscontinued, siteId);
        _currentApproachAttemptId = 0;
        _approachAwaitingTerminalExit = insideTarget;
    }

    void ExitStableContactIfNeeded(string siteId) {
        if (!_stableContact) return;
        _stableContact = false;
        Emit(CasevacEventKind.StableContactExited, siteId);
    }

    void ClearApproachState() {
        _currentApproachAttemptId = 0;
        _approachAwaitingTerminalExit = false;
        _stableContact = false;
        _operationPaused = false;
        _approachMadeContact = false;
        _stabilizationProgressTicks = 0;
        _operationProgressTicks = 0;
    }

    static bool IsInsideSite(
        in LandingZoneObservation landingZone,
        string siteId) =>
        landingZone.InsideTerminalVolume
        && StringComparer.Ordinal.Equals(landingZone.SiteId, siteId);

    static LandingZoneGateClass GateForTarget(
        in LandingZoneObservation landingZone,
        string siteId) =>
        IsInsideSite(landingZone, siteId)
            ? landingZone.GateClass
            : LandingZoneGateClass.Break;

    void Emit(
        CasevacEventKind kind,
        string? siteId,
        long? approachAttemptId = null) {
        if (_pendingEventCount >= MaximumEventsPerTick)
            throw new InvalidOperationException(
                "A CASEVAC authority tick exceeded its sparse-event bound.");
        long sequence = AllocateSequence();
        QueueEvent(new CasevacMissionEventRecord(
            CasevacContract.SchemaVersion,
            sequence,
            _lastSourceTick,
            _activeMissionTicks,
            _missionEpochSequence,
            kind,
            _definition.Id,
            _definition.AircraftId,
            _definition.CapsuleId,
            siteId,
            approachAttemptId ?? _currentApproachAttemptId));
    }

    long AllocateSequence() {
        long sequence = _allocateEventSequence();
        if (sequence <= 0 || sequence <= _lastEventSequence)
            throw new InvalidOperationException(
                "The session event allocator must return strictly increasing positive sequences.");
        _lastEventSequence = sequence;
        return sequence;
    }

    void QueueEvent(in CasevacMissionEventRecord missionEvent) {
        if (_pendingEventCount >= MaximumEventsPerTick)
            throw new InvalidOperationException(
                "A CASEVAC authority tick exceeded its sparse-event bound.");
        _pendingEvents[_pendingEventCount++] = missionEvent;
    }

    void FlushPendingEvents() {
        if (_eventSink is null) return;
        for (int index = 0; index < _pendingEventCount; index++)
            _eventSink(_pendingEvents[index]);
    }

    void BeginMutation() {
        if (_mutationInProgress)
            throw new InvalidOperationException(
                "CASEVAC controller mutation cannot be re-entered from an event observer.");
        _mutationInProgress = true;
        _pendingEventCount = 0;
    }

    void EndMutation() {
        _pendingEventCount = 0;
        _mutationInProgress = false;
    }

    ControllerState CaptureState() => new(
        _phase,
        _custody,
        _disposition,
        _missionEpochSequence,
        _missionBeginSourceTick,
        _lastSourceTick,
        _activeMissionTicks,
        _lastEventSequence,
        _latestApproachAttemptId,
        _currentApproachAttemptId,
        _requestedHandoffWindowPassed,
        _stableContact,
        _operationPaused,
        _approachMadeContact,
        _approachAwaitingTerminalExit,
        _abortSawOutsideSafeExit,
        _stabilizationProgressTicks,
        _operationProgressTicks,
        _quietProgressTicks,
        _capsuleSecuredCallAgeTicks,
        _handoffCallAgeTicks);

    void RestoreState(in ControllerState state) {
        _phase = state.Phase;
        _custody = state.Custody;
        _disposition = state.Disposition;
        _missionEpochSequence = state.MissionEpochSequence;
        _missionBeginSourceTick = state.MissionBeginSourceTick;
        _lastSourceTick = state.LastSourceTick;
        _activeMissionTicks = state.ActiveMissionTicks;
        _lastEventSequence = state.LastEventSequence;
        _latestApproachAttemptId = state.LatestApproachAttemptId;
        _currentApproachAttemptId = state.CurrentApproachAttemptId;
        _requestedHandoffWindowPassed = state.RequestedHandoffWindowPassed;
        _stableContact = state.StableContact;
        _operationPaused = state.OperationPaused;
        _approachMadeContact = state.ApproachMadeContact;
        _approachAwaitingTerminalExit = state.ApproachAwaitingTerminalExit;
        _abortSawOutsideSafeExit = state.AbortSawOutsideSafeExit;
        _stabilizationProgressTicks = state.StabilizationProgressTicks;
        _operationProgressTicks = state.OperationProgressTicks;
        _quietProgressTicks = state.QuietProgressTicks;
        _capsuleSecuredCallAgeTicks = state.CapsuleSecuredCallAgeTicks;
        _handoffCallAgeTicks = state.HandoffCallAgeTicks;
    }
}
