namespace GunsOnly.Sim.Korea;

/// <summary>
/// Deterministic authority for the first Armstrong reconstruction slice. It consumes physical
/// observations; it never steers an aircraft, manufactures a cable hit, applies damage, positions
/// Carpenter, or infers an unseen component state.
/// </summary>
public sealed class ArmstrongCableStrikeController {
    const int MaximumEventsPerTick = 5;

    readonly ArmstrongCableStrikeScenarioDefinition _definition;
    readonly Func<long> _allocateEventSequence;
    readonly Action<ArmstrongCableStrikeEventRecord>? _eventSink;
    readonly ArmstrongCableStrikeEventRecord[] _pendingEvents =
        new ArmstrongCableStrikeEventRecord[MaximumEventsPerTick];

    ArmstrongCableStrikePhase _phase = ArmstrongCableStrikePhase.Ready;
    int _pendingEventCount;
    bool _mutationInProgress;
    bool _transitionedThisTick;
    long _epochSequence;
    int _retryCount;
    long _epochBeginSourceTick = -1;
    long _lastSourceTick = -1;
    long _simulationTick = -1;
    long _activeEpochTicks;
    long _latestEventSequence;
    long _phaseTicks;
    CableContactRecord? _contact;
    string? _damageProfileId;
    VisibleAirframeDamage _visibleDamage;
    int _stabilizationProgressTicks;
    bool _damagedFlightStabilized;
    int _lateralDemandTicks;
    bool _persistentLateralDemandObserved;
    ArmstrongRollMarginBand _rollMarginBand;
    DamageInspectionState _inspectionState;
    CarpenterInspectionObservation _latestCarpenterObservation;
    bool _noLandingDecisionCommitted;
    bool _southboundCheckpointReached;

    readonly record struct ControllerState(
        ArmstrongCableStrikePhase Phase,
        long EpochSequence,
        int RetryCount,
        long EpochBeginSourceTick,
        long LastSourceTick,
        long SimulationTick,
        long ActiveEpochTicks,
        long LatestEventSequence,
        long PhaseTicks,
        CableContactRecord? Contact,
        string? DamageProfileId,
        VisibleAirframeDamage VisibleDamage,
        int StabilizationProgressTicks,
        bool DamagedFlightStabilized,
        int LateralDemandTicks,
        bool PersistentLateralDemandObserved,
        ArmstrongRollMarginBand RollMarginBand,
        DamageInspectionState InspectionState,
        CarpenterInspectionObservation LatestCarpenterObservation,
        bool NoLandingDecisionCommitted,
        bool SouthboundCheckpointReached);

    /// <param name="eventSink">
    /// Optional post-commit observer. It must be non-throwing. Observer failure is a fail-stop
    /// integration error: authoritative state remains committed and delivered event prefixes are
    /// not replayed, preventing duplicate one-shot presentation after recovery.
    /// </param>
    public ArmstrongCableStrikeController(
        ArmstrongCableStrikeScenarioDefinition definition,
        Func<long> allocateEventSequence,
        Action<ArmstrongCableStrikeEventRecord>? eventSink = null) {
        _definition = definition
            ?? throw new ArgumentNullException(nameof(definition));
        _allocateEventSequence = allocateEventSequence
            ?? throw new ArgumentNullException(nameof(allocateEventSequence));
        _eventSink = eventSink;
    }

    public ArmstrongCableStrikeScenarioDefinition Definition => _definition;
    public ArmstrongCableStrikePhase Phase => _phase;
    public long ReconstructionEpochSequence => _epochSequence;
    public long LatestEventSequence => _latestEventSequence;
    public bool IsSliceComplete => _southboundCheckpointReached;

    public ArmstrongCableStrikeSnapshot Snapshot => new(
        ArmstrongCableStrikeContract.SchemaVersion,
        _definition.Id,
        _phase,
        ObjectiveTextId,
        CurrentCheckpointId,
        _epochSequence,
        _retryCount,
        _epochBeginSourceTick,
        _lastSourceTick,
        _simulationTick,
        _activeEpochTicks,
        _latestEventSequence,
        _contact.HasValue,
        _visibleDamage,
        _damagedFlightStabilized,
        _persistentLateralDemandObserved,
        _rollMarginBand,
        DamageInspectionFlight.Project(
            _inspectionState,
            _latestCarpenterObservation,
            _definition.Inspection),
        _noLandingDecisionCommitted,
        _southboundCheckpointReached);

    string ObjectiveTextId => _phase switch {
        ArmstrongCableStrikePhase.Ready => "objective.armstrong.ready.v1",
        ArmstrongCableStrikePhase.AttackRun => "objective.armstrong.attack-run.v1",
        ArmstrongCableStrikePhase.CableCorridor =>
            "objective.armstrong.cable-corridor.v1",
        ArmstrongCableStrikePhase.DamagedUnstable =>
            "objective.armstrong.arrest-roll.v1",
        ArmstrongCableStrikePhase.DamagedStabilized =>
            "objective.armstrong.hold-damaged-flight.v1",
        ArmstrongCableStrikePhase.Inspection when _inspectionState.Complete =>
            "objective.armstrong.demonstrate-control-margin.v1",
        ArmstrongCableStrikePhase.Inspection =>
            "objective.armstrong.carpenter-inspection.v1",
        ArmstrongCableStrikePhase.Southbound =>
            "objective.armstrong.fly-south.v1",
        _ => throw new InvalidOperationException("Unknown Armstrong phase.")
    };

    string CurrentCheckpointId => _southboundCheckpointReached
        ? ArmstrongCableStrikeContract.SouthboundCheckpointId
        : ArmstrongCableStrikeContract.AttackRunCheckpointId;

    public ArmstrongCableStrikeSnapshot Begin(long sourceTick) {
        if (sourceTick < 0)
            throw new ArgumentOutOfRangeException(nameof(sourceTick));
        if (_phase != ArmstrongCableStrikePhase.Ready)
            throw new InvalidOperationException(
                "An Armstrong reconstruction controller can begin only once.");
        BeginMutation();
        ControllerState before = CaptureState();
        try {
            ArmstrongCableStrikeSnapshot snapshot;
            try {
                long sequence = AllocateSequence();
                _epochSequence = sequence;
                _epochBeginSourceTick = sourceTick;
                _lastSourceTick = sourceTick;
                _simulationTick = _definition.AttackRunCheckpoint.SimulationTick;
                _phase = ArmstrongCableStrikePhase.AttackRun;
                QueueEvent(new ArmstrongCableStrikeEventRecord(
                    ArmstrongCableStrikeContract.SchemaVersion,
                    sequence,
                    sourceTick,
                    _simulationTick,
                    sequence,
                    ArmstrongCableStrikeEventKind.ReconstructionEpochStarted,
                    _phase,
                    _definition.Id,
                    ArmstrongCableStrikeContract.AttackRunCheckpointId));
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
    /// Advances exactly one unpaused authority tick. SourceTick must increase globally, while the
    /// supplied simulation clock is scoped to an epoch and may restart at the checkpoint value.
    /// </summary>
    public ArmstrongCableStrikeSnapshot Advance(
        in ArmstrongCableStrikeObservation observation) {
        if (_phase == ArmstrongCableStrikePhase.Ready)
            throw new InvalidOperationException(
                "Begin the Armstrong reconstruction before advancing it.");
        if (IsSliceComplete) return Snapshot;
        ValidateObservation(observation);

        BeginMutation();
        ControllerState before = CaptureState();
        try {
            ArmstrongCableStrikeSnapshot snapshot;
            try {
                AdvanceCore(observation);
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

    void AdvanceCore(in ArmstrongCableStrikeObservation observation) {
        _lastSourceTick = observation.SourceTick;
        _simulationTick = observation.SimulationTick;
        _activeEpochTicks = checked(_activeEpochTicks + 1);
        _phaseTicks = checked(_phaseTicks + 1);
        _latestCarpenterObservation = observation.Carpenter;

        if (_damageProfileId is not null)
            ObserveControlMargin(observation);

        switch (_phase) {
            case ArmstrongCableStrikePhase.AttackRun:
                if (HasUnexpectedPhysicalState(observation))
                    throw new InvalidOperationException(
                        "Cable contact and damage are valid only inside the cable corridor.");
                if (observation.ExitedCableCorridorWithoutContact) {
                    RestartEpoch(ArmstrongRetryReason.CableCorridorBypassed);
                    return;
                }
                if (observation.EnteredCableCorridor) {
                    TransitionTo(ArmstrongCableStrikePhase.CableCorridor);
                    Emit(ArmstrongCableStrikeEventKind.CableCorridorEntered);
                }
                return;

            case ArmstrongCableStrikePhase.CableCorridor:
                AdvanceCableCorridor(observation);
                return;

            case ArmstrongCableStrikePhase.DamagedUnstable:
                if (!observation.AircraftFlyable) {
                    RestartEpoch(ArmstrongRetryReason.DamagedAircraftLost);
                    return;
                }
                if (IsStabilized(observation))
                    _stabilizationProgressTicks = checked(
                        _stabilizationProgressTicks + 1);
                else
                    _stabilizationProgressTicks = 0;
                if (_stabilizationProgressTicks
                    >= _definition.StabilizationDwellTicks) {
                    _damagedFlightStabilized = true;
                    TransitionTo(ArmstrongCableStrikePhase.DamagedStabilized);
                    Emit(ArmstrongCableStrikeEventKind.DamagedFlightStabilized);
                }
                return;

            case ArmstrongCableStrikePhase.DamagedStabilized:
                if (!observation.AircraftFlyable) {
                    RestartEpoch(ArmstrongRetryReason.DamagedAircraftLost);
                    return;
                }
                ValidateCarpenterDamageTruth(observation.Carpenter);
                if (DamageInspectionFlight.Qualifies(
                    observation.Carpenter, _definition.Inspection)) {
                    TransitionTo(ArmstrongCableStrikePhase.Inspection);
                    Emit(ArmstrongCableStrikeEventKind.InspectionStarted);
                }
                return;

            case ArmstrongCableStrikePhase.Inspection:
                if (!observation.AircraftFlyable) {
                    RestartEpoch(ArmstrongRetryReason.DamagedAircraftLost);
                    return;
                }
                ValidateCarpenterDamageTruth(observation.Carpenter);
                bool wasComplete = _inspectionState.Complete;
                _inspectionState = DamageInspectionFlight.Advance(
                    _inspectionState,
                    observation.Carpenter,
                    _definition.Inspection);
                if (!wasComplete && _inspectionState.Complete)
                    Emit(
                        ArmstrongCableStrikeEventKind.InspectionCompleted,
                        visibleDamage: _inspectionState.Report);
                if (NoLandingEvidenceSatisfied) {
                    _noLandingDecisionCommitted = true;
                    TransitionTo(ArmstrongCableStrikePhase.Southbound);
                    Emit(
                        ArmstrongCableStrikeEventKind.NoLandingDecisionCommitted,
                        visibleDamage: _inspectionState.Report);
                }
                return;

            case ArmstrongCableStrikePhase.Southbound:
                if (observation.SouthboundGateReached) {
                    _southboundCheckpointReached = true;
                    Emit(ArmstrongCableStrikeEventKind.SouthboundCheckpointReached);
                }
                return;

            default:
                throw new InvalidOperationException(
                    "The Armstrong controller entered an unsupported phase.");
        }
    }

    void AdvanceCableCorridor(
        in ArmstrongCableStrikeObservation observation) {
        if (observation.CableContact is CableContactRecord contact) {
            ValidateContact(contact);
            if (_contact.HasValue)
                throw new InvalidOperationException(
                    "A reconstruction epoch accepts only its first physical cable contact.");
            _contact = contact;
            Emit(ArmstrongCableStrikeEventKind.CableContact, contact: contact);

            bool authoritative = StringComparer.Ordinal.Equals(
                    contact.AircraftComponentId,
                    ArmstrongCableStrikeScenarios.RightOuterWingComponentId)
                && StringComparer.Ordinal.Equals(
                    contact.ResultingDamageProfileId,
                    _definition.RightWingDamageProfile.Id)
                && StringComparer.Ordinal.Equals(
                    contact.ContactResponseProfileId,
                    _definition.RightOuterWingCollisionVolume.ResponseProfile.Id)
                && ContactResponseMatchesScenario(contact)
                && ContactBelongsToScenario(contact);
            if (!authoritative) {
                RestartEpoch(ArmstrongRetryReason.NonAuthoritativeContact);
                return;
            }
        }

        if (observation.DamageCommit is ArmstrongDamageCommitObservation damage) {
            if (!_contact.HasValue)
                throw new InvalidOperationException(
                    "Damage cannot commit before physical cable contact.");
            if (_damageProfileId is not null)
                throw new InvalidOperationException(
                    "Damage may commit only once in a reconstruction epoch.");
            if (!StringComparer.Ordinal.Equals(
                    damage.ProfileId, _definition.RightWingDamageProfile.Id)
                || !StringComparer.Ordinal.Equals(
                    damage.ProfileId, _contact.Value.ResultingDamageProfileId)
                || damage.VisibleDamage
                    != _definition.RightWingDamageProfile.VisibleDamage)
                throw new InvalidOperationException(
                    "The physical contact and composed damage profile identities disagree.");
            _damageProfileId = damage.ProfileId;
            _visibleDamage = damage.VisibleDamage;
            TransitionTo(ArmstrongCableStrikePhase.DamagedUnstable);
            Emit(
                ArmstrongCableStrikeEventKind.DamageCommitted,
                contact: _contact,
                visibleDamage: _visibleDamage);
            return;
        }

        if (observation.ExitedCableCorridorWithoutContact) {
            if (_contact.HasValue)
                throw new InvalidOperationException(
                    "A contacted cable must resolve to damage or an explicit integration error.");
            RestartEpoch(ArmstrongRetryReason.CableAvoided);
        }
    }

    bool HasUnexpectedPhysicalState(
        in ArmstrongCableStrikeObservation observation) =>
        observation.CableContact.HasValue || observation.DamageCommit.HasValue;

    bool ContactBelongsToScenario(in CableContactRecord contact) {
        string cableId = contact.CableId;
        CableDefinition? cable = _definition.CableField.Cables.FirstOrDefault(
            candidate => StringComparer.Ordinal.Equals(candidate.Id, cableId));
        return cable is not null
            && contact.SegmentIndex + 1 < cable.SupportPoints.Count;
    }

    bool ContactResponseMatchesScenario(in CableContactRecord contact) {
        CableContactResponseProfile response =
            _definition.RightOuterWingCollisionVolume.ResponseProfile;
        double expectedMagnitude = System.Math.Min(
            response.MaximumImpulseNs,
            contact.RelativeVelocityMps.Length * response.EquivalentSnagMassKg);
        Vec3D expectedImpulse = contact.RelativeVelocityMps.Length <= 1e-9
            ? Vec3D.Zero
            : contact.RelativeVelocityMps.Normalized() * -expectedMagnitude;
        return (contact.AppliedImpulseNs - expectedImpulse).Length <= 1e-6;
    }

    void ValidateCarpenterDamageTruth(
        in CarpenterInspectionObservation observation) {
        if (observation.IsPresent
            && observation.VisibleDamage != _visibleDamage)
            throw new InvalidOperationException(
                "Carpenter may report only the currently rendered damage projection.");
    }

    bool IsStabilized(in ArmstrongCableStrikeObservation observation) =>
        observation.AircraftFlyable
        && observation.StabilizationEnvelopeSatisfied
        && System.Math.Abs(observation.RollRateRadS)
            <= _definition.MaximumStabilizedAbsoluteRollRateRadS
        && observation.TerrainClearanceM
            >= _definition.MinimumStabilizationTerrainClearanceM;

    void ObserveControlMargin(
        in ArmstrongCableStrikeObservation observation) {
        if (System.Math.Abs(observation.PilotLateralInput)
            >= _definition.LateralDemandThreshold) {
            _lateralDemandTicks = checked(_lateralDemandTicks + 1);
            if (_lateralDemandTicks >= _definition.SustainedLateralDemandTicks)
                _persistentLateralDemandObserved = true;
        } else if (!_persistentLateralDemandObserved) {
            _lateralDemandTicks = 0;
        }

        if (!observation.SlowFlightProbeComplete) return;
        double margin = observation.RemainingRollAuthorityFraction;
        _rollMarginBand = margin
            <= _definition.MaximumLandingEnvelopeRollAuthorityFraction
                ? ArmstrongRollMarginBand.LandingEnvelopeUnsafe
                : margin <= _definition.MaximumLimitedRollAuthorityFraction
                    ? ArmstrongRollMarginBand.Limited
                    : ArmstrongRollMarginBand.Adequate;
    }

    bool NoLandingEvidenceSatisfied =>
        _inspectionState.Complete
        && _inspectionState.Report.RightOuterWingAbsent
        && _persistentLateralDemandObserved
        && _rollMarginBand == ArmstrongRollMarginBand.LandingEnvelopeUnsafe;

    void RestartEpoch(ArmstrongRetryReason reason) {
        if (!Enum.IsDefined(reason))
            throw new ArgumentOutOfRangeException(nameof(reason));
        if (_transitionedThisTick)
            throw new InvalidOperationException(
                "Only one primary Armstrong phase transition may occur per authority tick.");
        _transitionedThisTick = true;
        Emit(
            ArmstrongCableStrikeEventKind.CheckpointRestoreRequested,
            retryReason: reason);
        _retryCount = checked(_retryCount + 1);
        _phase = ArmstrongCableStrikePhase.AttackRun;
        _phaseTicks = 0;
        _contact = null;
        _damageProfileId = null;
        _visibleDamage = VisibleAirframeDamage.None;
        _stabilizationProgressTicks = 0;
        _damagedFlightStabilized = false;
        _lateralDemandTicks = 0;
        _persistentLateralDemandObserved = false;
        _rollMarginBand = ArmstrongRollMarginBand.NotAssessed;
        _inspectionState = DamageInspectionState.None;
        _latestCarpenterObservation = CarpenterInspectionObservation.None;
        _noLandingDecisionCommitted = false;
        _southboundCheckpointReached = false;
        _simulationTick = _definition.AttackRunCheckpoint.SimulationTick;
        _activeEpochTicks = 0;
        _epochBeginSourceTick = _lastSourceTick;

        long sequence = AllocateSequence();
        _epochSequence = sequence;
        QueueEvent(new ArmstrongCableStrikeEventRecord(
            ArmstrongCableStrikeContract.SchemaVersion,
            sequence,
            _lastSourceTick,
            _simulationTick,
            sequence,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted,
            _phase,
            _definition.Id,
            ArmstrongCableStrikeContract.AttackRunCheckpointId,
            RetryReason: reason));
    }

    void TransitionTo(ArmstrongCableStrikePhase next) {
        if (_phase == next) return;
        if (_transitionedThisTick)
            throw new InvalidOperationException(
                "Only one primary Armstrong phase transition may occur per authority tick.");
        _transitionedThisTick = true;
        _phase = next;
        _phaseTicks = 0;
    }

    void Emit(
        ArmstrongCableStrikeEventKind kind,
        CableContactRecord? contact = null,
        VisibleAirframeDamage visibleDamage = default,
        ArmstrongRetryReason? retryReason = null) {
        long sequence = AllocateSequence();
        QueueEvent(new ArmstrongCableStrikeEventRecord(
            ArmstrongCableStrikeContract.SchemaVersion,
            sequence,
            _lastSourceTick,
            _simulationTick,
            _epochSequence,
            kind,
            _phase,
            _definition.Id,
            CurrentCheckpointId,
            contact,
            visibleDamage,
            retryReason));
    }

    long AllocateSequence() {
        long sequence = _allocateEventSequence();
        if (sequence <= 0 || sequence <= _latestEventSequence)
            throw new InvalidOperationException(
                "The event allocator must return strictly increasing positive sequences.");
        _latestEventSequence = sequence;
        return sequence;
    }

    void QueueEvent(in ArmstrongCableStrikeEventRecord missionEvent) {
        if (_pendingEventCount >= MaximumEventsPerTick)
            throw new InvalidOperationException(
                "An Armstrong authority tick exceeded its sparse-event bound.");
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
                "Armstrong controller mutation cannot be re-entered from an observer.");
        _mutationInProgress = true;
        _transitionedThisTick = false;
        _pendingEventCount = 0;
    }

    void EndMutation() {
        _pendingEventCount = 0;
        _transitionedThisTick = false;
        _mutationInProgress = false;
    }

    void ValidateObservation(in ArmstrongCableStrikeObservation observation) {
        if (observation.SourceTick <= _lastSourceTick)
            throw new ArgumentOutOfRangeException(nameof(observation),
                "Armstrong observations require strictly increasing authority ticks.");
        if (observation.SimulationTick < 0)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (observation.SimulationTick <= _simulationTick)
            throw new ArgumentOutOfRangeException(nameof(observation),
                "Simulation ticks must increase within a reconstruction epoch.");
        ArmstrongContractValidation.Finite(
            observation.TerrainClearanceM, nameof(observation));
        ArmstrongContractValidation.Finite(
            observation.RollRateRadS, nameof(observation));
        ArmstrongContractValidation.Finite(
            observation.PilotLateralInput, nameof(observation));
        ArmstrongContractValidation.Finite(
            observation.RemainingRollAuthorityFraction, nameof(observation));
        ArmstrongContractValidation.Finite(
            observation.PlayerPosition, nameof(observation));
        ArmstrongContractValidation.Finite(
            observation.PlayerVelocity, nameof(observation));
        if (observation.PilotLateralInput is < -1.0 or > 1.0)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (observation.RemainingRollAuthorityFraction is < 0.0 or > 1.0)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (observation.CableContact is CableContactRecord contact)
            ValidateContact(contact);
        if (observation.DamageCommit is ArmstrongDamageCommitObservation damage
            && !damage.IsPresent)
            throw new ArgumentException(
                "A nullable damage commit must contain an applied profile.",
                nameof(observation));
    }

    static void ValidateContact(in CableContactRecord contact) {
        ArmstrongContractValidation.StableId(contact.CableId, nameof(contact));
        ArmstrongContractValidation.StableId(
            contact.AircraftComponentId, nameof(contact));
        ArmstrongContractValidation.StableId(
            contact.ContactResponseProfileId, nameof(contact));
        ArmstrongContractValidation.StableId(
            contact.ResultingDamageProfileId, nameof(contact));
        if (contact.SegmentIndex < 0)
            throw new ArgumentOutOfRangeException(nameof(contact));
        ArmstrongContractValidation.Finite(contact.WorldContactPoint, nameof(contact));
        ArmstrongContractValidation.Finite(contact.CableTangent, nameof(contact));
        ArmstrongContractValidation.Finite(contact.RelativeVelocityMps, nameof(contact));
        ArmstrongContractValidation.Finite(contact.AppliedImpulseNs, nameof(contact));
        ArmstrongContractValidation.Finite(
            contact.PreContactState.AircraftPosition, nameof(contact));
        ArmstrongContractValidation.Finite(
            contact.PreContactState.AircraftVelocity, nameof(contact));
        if (!contact.PreContactState.BodyAttitude.IsFinite
            || contact.CableTangent.Length <= 1e-9)
            throw new ArgumentOutOfRangeException(nameof(contact));
        if (!double.IsFinite(contact.ParametricTimeWithinTick)
            || contact.ParametricTimeWithinTick is < 0.0 or > 1.0
            || !double.IsFinite(contact.TimeWithinTickS)
            || contact.TimeWithinTickS < 0.0)
            throw new ArgumentOutOfRangeException(nameof(contact));
    }

    ControllerState CaptureState() => new(
        _phase,
        _epochSequence,
        _retryCount,
        _epochBeginSourceTick,
        _lastSourceTick,
        _simulationTick,
        _activeEpochTicks,
        _latestEventSequence,
        _phaseTicks,
        _contact,
        _damageProfileId,
        _visibleDamage,
        _stabilizationProgressTicks,
        _damagedFlightStabilized,
        _lateralDemandTicks,
        _persistentLateralDemandObserved,
        _rollMarginBand,
        _inspectionState,
        _latestCarpenterObservation,
        _noLandingDecisionCommitted,
        _southboundCheckpointReached);

    void RestoreState(in ControllerState state) {
        _phase = state.Phase;
        _epochSequence = state.EpochSequence;
        _retryCount = state.RetryCount;
        _epochBeginSourceTick = state.EpochBeginSourceTick;
        _lastSourceTick = state.LastSourceTick;
        _simulationTick = state.SimulationTick;
        _activeEpochTicks = state.ActiveEpochTicks;
        _latestEventSequence = state.LatestEventSequence;
        _phaseTicks = state.PhaseTicks;
        _contact = state.Contact;
        _damageProfileId = state.DamageProfileId;
        _visibleDamage = state.VisibleDamage;
        _stabilizationProgressTicks = state.StabilizationProgressTicks;
        _damagedFlightStabilized = state.DamagedFlightStabilized;
        _lateralDemandTicks = state.LateralDemandTicks;
        _persistentLateralDemandObserved = state.PersistentLateralDemandObserved;
        _rollMarginBand = state.RollMarginBand;
        _inspectionState = state.InspectionState;
        _latestCarpenterObservation = state.LatestCarpenterObservation;
        _noLandingDecisionCommitted = state.NoLandingDecisionCommitted;
        _southboundCheckpointReached = state.SouthboundCheckpointReached;
    }
}
