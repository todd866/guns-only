namespace GunsOnly.Sim.Medevac;

/// <summary>
/// Fictional, dimensionless tuning values used to make RF fallback a deterministic gameplay
/// tradeoff. They are deliberately not derived from, or convertible into, real EW performance.
/// </summary>
public static class MedevacTrainingSurrogate {
    public const int DirectRfExposureUnitsPerSecond = 4;
    public const int RepeaterRfExposureUnitsPerSecond = 1;
    public const int PatientPodCapacity = 2;
    public const int SnapshotSchemaVersion = 2;
}

/// <summary>
/// Deterministic, presentation-independent evacuation-chain authority. It owns pod logistics,
/// the staged air ambulance, remote extraction control authority, capacity, transfers, and
/// commander decision gates. It does not model physiology or expose hidden patient truth.
/// </summary>
public sealed class MedevacEvacuationSession {
    sealed class RequestRuntime {
        public RequestRuntime(EvacuationRequestDefinition definition) {
            Definition = definition;
        }

        public EvacuationRequestDefinition Definition { get; }
        public PatientPodPhase PodPhase { get; set; } = PatientPodPhase.AwaitingDispatch;
        public PodCourierPhase CourierPhase { get; set; } = PodCourierPhase.AwaitingDispatch;
        public int PodPhaseStartedAt { get; set; }
        public int CourierPhaseStartedAt { get; set; }
        public int? ActualPodReadyAt { get; set; }
        public int? PodSealedAt { get; set; }
        public int AppliedMedicalReportIndex { get; set; } = -1;
        public ObservedMedicalStatus? Medical { get; set; }
        public int MedicalRecordedAt { get; set; }
        public ExtractionDronePhase ExtractionPhase { get; set; } =
            ExtractionDronePhase.NotRequired;
        public ExtractionDronePhase BlockedExtractionPhase { get; set; } =
            ExtractionDronePhase.NotRequired;
        public ExtractionControlMode ControlMode { get; set; } =
            ExtractionControlMode.None;
        public int ExtractionLegSecondsRemaining { get; set; }
        public int ExtractionSecondsElapsed { get; set; }
        public bool RepeaterWasEjected { get; set; }
        public int RepeaterSecondsRemaining { get; set; }
        public string? DispositionLocationId { get; set; }

        public int EstimatedPodReadyAt =>
            checked(Definition.RequestTimeSeconds
                + Definition.EmptyPodDeliverySeconds
                + Definition.GroundLoadingSeconds);

        public bool Disposed => PodPhase is
            PatientPodPhase.TransferredToPatientTransport
            or PatientPodPhase.DeliveredToClinicalFacility;

        public bool Onboard => PodPhase == PatientPodPhase.OnboardAirAmbulance;
    }

    readonly MedevacScenarioDefinition _definition;
    readonly Dictionary<string, MedevacLocationDefinition> _locations;
    readonly Dictionary<string, ReceivingFacilityDefinition> _facilities;
    readonly Dictionary<string, RequestRuntime> _requests;
    readonly Dictionary<(string From, string To), int> _travelSeconds;
    readonly List<MedevacChainEvent> _events = new();
    readonly List<string> _onboard = new(MedevacTrainingSurrogate.PatientPodCapacity);
    readonly List<string> _deliveryRequestIds =
        new(MedevacTrainingSurrogate.PatientPodCapacity);
    MedevacMissionLifecycle _lifecycle = MedevacMissionLifecycle.Ready;
    AirAmbulancePhase _aircraftPhase = AirAmbulancePhase.Ready;
    CommanderDecisionKind _decision = CommanderDecisionKind.None;
    string _currentLocationId;
    string? _targetLocationId;
    string? _assignedRequestId;
    string? _receivingFacilityId;
    int _routeSecondsRemaining;
    int _plannedLaunchAt;
    int _plannedArrivalAt;
    int _elapsedSeconds;
    int _immediateThreatHoldSeconds;
    int _rfExposureTrainingUnits;
    long _nextEventSequence = 1;
    string? _committedCollectionRequestId;
    string? _reconsiderationRequestId;

    public MedevacEvacuationSession(MedevacScenarioDefinition definition) {
        ArgumentNullException.ThrowIfNull(definition);
        Validate(definition);
        _definition = Freeze(definition);
        _locations = _definition.Locations.ToDictionary(location => location.Id,
            StringComparer.Ordinal);
        _travelSeconds = BuildTravelTable(_definition);
        ValidateOperationalReachability(_definition, _travelSeconds);
        _facilities = _definition.ReceivingFacilities.ToDictionary(
            facility => facility.Id, StringComparer.Ordinal);
        _requests = _definition.Requests.ToDictionary(
            request => request.Id,
            request => new RequestRuntime(request),
            StringComparer.Ordinal);
        _currentLocationId = _definition.InitialLocationId;
    }

    public int ElapsedSeconds => _elapsedSeconds;
    public MedevacMissionLifecycle Lifecycle => _lifecycle;

    public MedevacEvacuationSnapshot Snapshot => BuildSnapshot();

    public void Begin(string firstRequestId) {
        if (_lifecycle != MedevacMissionLifecycle.Ready)
            throw new InvalidOperationException("The evacuation session has already begun.");
        RequestRuntime first = GetRequest(firstRequestId);
        if (_elapsedSeconds < first.Definition.RequestTimeSeconds)
            throw new InvalidOperationException(
                "That evacuation request is not active yet.");
        _lifecycle = MedevacMissionLifecycle.Active;
        Emit("mission.began", first.Definition.Id, _currentLocationId);
        UpdateAutomaticPodLogistics();
        PlanPickup(first);
    }

    public void Advance(int seconds = 1) {
        if (_lifecycle == MedevacMissionLifecycle.Ready)
            throw new InvalidOperationException("Begin the evacuation session before advancing it.");
        if (seconds < 0)
            throw new ArgumentOutOfRangeException(nameof(seconds));
        for (int second = 0;
            second < seconds && _lifecycle == MedevacMissionLifecycle.Active;
            second++) {
            _elapsedSeconds++;
            UpdateAutomaticPodLogistics();
            UpdateMedicalReports();
            UpdateAirAmbulance();
            RefreshWaitingDecision();
        }
    }

    public void ChooseCollectNext(string requestId) {
        RequireActive();
        if (_decision != CommanderDecisionKind.CollectNextOrDeliver)
            throw new InvalidOperationException("There is no collect-next decision at this time.");
        if (_onboard.Count >= MedevacTrainingSurrogate.PatientPodCapacity)
            throw new InvalidOperationException("The air ambulance already carries two pods.");
        RequestRuntime request = GetRequest(requestId);
        if (!IsSelectableForCollection(request))
            throw new InvalidOperationException("That request is not selectable for collection.");

        Emit("commander.collect-next", requestId, request.Definition.StagingLocationId);
        _decision = CommanderDecisionKind.None;
        _committedCollectionRequestId = requestId;
        _reconsiderationRequestId = null;
        PlanPickup(request);
    }

    public void ChooseDelivery(string facilityId, bool acknowledgeMismatch = false) {
        ChooseDelivery(facilityId, _onboard.ToArray(), acknowledgeMismatch);
    }

    public void ChooseDelivery(
        string facilityId,
        IReadOnlyList<string> requestIds,
        bool acknowledgeMismatch = false) {
        RequireActive();
        if (_decision is not (CommanderDecisionKind.CollectNextOrDeliver
            or CommanderDecisionKind.ChooseReceivingFacility
            or CommanderDecisionKind.ReconsiderCollectOrDeliver))
            throw new InvalidOperationException("There is no delivery decision at this time.");
        if (_onboard.Count == 0)
            throw new InvalidOperationException("There are no patient pods onboard.");
        if (!_facilities.TryGetValue(facilityId, out ReceivingFacilityDefinition? facility))
            throw new ArgumentException("Unknown receiving facility.", nameof(facilityId));
        string[] selected = ValidateSelectedOnboardRequests(requestIds);

        (FacilitySuitability suitability, ReceivingCapability missing) =
            AssessFacility(facility, selected);
        if (suitability != FacilitySuitability.Suitable && !acknowledgeMismatch)
            throw new InvalidOperationException(
                "The local receiver does not match the observed need; an explicit commander "
                + "acknowledgement is required to continue.");

        int routeSeconds = TravelSeconds(_currentLocationId, facility.LocationId);
        bool isDiversion =
            _decision == CommanderDecisionKind.ReconsiderCollectOrDeliver;
        string? abandonedCollectionRequestId = isDiversion
            ? _committedCollectionRequestId
            : null;
        if (isDiversion) CancelCommittedCollectionForDiversion();

        _decision = CommanderDecisionKind.None;
        _assignedRequestId = null;
        _committedCollectionRequestId = null;
        _reconsiderationRequestId = null;
        _receivingFacilityId = facilityId;
        _deliveryRequestIds.Clear();
        _deliveryRequestIds.AddRange(selected);
        _targetLocationId = facility.LocationId;
        _routeSecondsRemaining = routeSeconds;
        _plannedLaunchAt = _elapsedSeconds;
        _plannedArrivalAt = checked(_elapsedSeconds + _routeSecondsRemaining);
        _aircraftPhase = AirAmbulancePhase.EnrouteReceivingFacility;
        string eventCode = (isDiversion, suitability == FacilitySuitability.Suitable) switch {
            (true, true) => "commander.divert-delivery",
            (true, false) => "commander.divert-delivery-override",
            (false, true) => "commander.deliver",
            _ => "commander.deliver-override"
        };
        var audit = new MedevacDeliveryDecisionAudit(
            facility.Id,
            suitability,
            missing,
            suitability != FacilitySuitability.Suitable && acknowledgeMismatch,
            selected,
            selected.Select(requestId => _requests[requestId].Definition.PatientId)
                .ToArray(),
            selected.Select(requestId => _requests[requestId].Definition.PodId)
                .ToArray(),
            abandonedCollectionRequestId);
        Emit(eventCode, locationId: facility.LocationId, deliveryDecision: audit);
        if (_routeSecondsRemaining == 0) ArriveAtReceivingFacility();
    }

    public void ContinueCommittedCollection(bool acknowledgeReconsideration) {
        RequireActive();
        if (_decision != CommanderDecisionKind.ReconsiderCollectOrDeliver
            || _committedCollectionRequestId is null)
            throw new InvalidOperationException(
                "There is no collection reconsideration awaiting a command.");
        if (!acknowledgeReconsideration)
            throw new InvalidOperationException(
                "Continuing the collection requires explicit acknowledgement "
                + "of the new observed medical report.");

        string triggeringRequestId = _reconsiderationRequestId
            ?? throw new InvalidOperationException(
                "The reconsideration trigger is unavailable.");
        var audit = new MedevacReconsiderationDecisionAudit(
            triggeringRequestId,
            _committedCollectionRequestId,
            WorseningAcknowledged: true);
        Emit("commander.continue-collection", _committedCollectionRequestId,
            _currentLocationId, reconsiderationDecision: audit);
        _decision = CommanderDecisionKind.None;
        _reconsiderationRequestId = null;
    }

    /// <summary>
    /// Explicitly authorizes the abstract RF fallback after autonomous extraction has blocked.
    /// Merely losing fibre never starts an RF transmission.
    /// </summary>
    public void CommandRfFallback(string requestId) {
        RequireActive();
        RequestRuntime request = GetRequest(requestId);
        if (request.ExtractionPhase !=
                ExtractionDronePhase.AwaitingCommanderControlDecision
            || request.ControlMode != ExtractionControlMode.Autonomous)
            throw new InvalidOperationException(
                "RF fallback is available only after autonomous extraction has blocked.");

        request.ControlMode = ExtractionControlMode.RfFallback;
        request.ExtractionPhase = request.BlockedExtractionPhase;
        Emit("commander.rf-fallback", requestId, request.Definition.StagingLocationId);
    }

    /// <summary>
    /// Ejects the one-shot fictional short-range repeater after RF fallback is already active.
    /// The repeater changes only abstract exposure units and control duration.
    /// </summary>
    public void EjectShortRangeRepeater(string requestId) {
        RequireActive();
        RequestRuntime request = GetRequest(requestId);
        if (request.ControlMode != ExtractionControlMode.RfFallback)
            throw new InvalidOperationException(
                "The repeater is a fallback from explicitly commanded RF control.");
        if (request.RepeaterWasEjected)
            throw new InvalidOperationException("The extraction repeater is already spent.");

        request.RepeaterWasEjected = true;
        request.RepeaterSecondsRemaining =
            request.Definition.ExtractionFailures.RepeaterControlSeconds;
        request.ControlMode = ExtractionControlMode.ShortRangeRepeater;
        Emit("commander.repeater-ejected", requestId,
            request.Definition.StagingLocationId);
    }

    public void RecordMedicalObservation(string requestId,
        in ObservedMedicalStatus observation) {
        RequireActive();
        RequestRuntime request = GetRequest(requestId);
        if (request.PodSealedAt is null)
            throw new InvalidOperationException(
                "The patient must be sealed in a pod before an observation can be recorded.");
        ApplyMedicalObservation(
            request,
            observation,
            _elapsedSeconds,
            "medical.observation-recorded");
    }

    void UpdateAutomaticPodLogistics() {
        foreach (RequestRuntime request in OrderedRequests()) {
            EvacuationRequestDefinition definition = request.Definition;
            if (request.PodPhase == PatientPodPhase.AwaitingDispatch
                && _elapsedSeconds >= definition.RequestTimeSeconds) {
                request.PodPhase = PatientPodPhase.UncrewedTransitToSite;
                request.CourierPhase = PodCourierPhase.CarryingEmptyPodToSite;
                request.PodPhaseStartedAt = _elapsedSeconds;
                request.CourierPhaseStartedAt = _elapsedSeconds;
                Emit("pod.dispatched-autonomously", definition.Id,
                    definition.SiteLocationId);
            }

            if (request.PodPhase == PatientPodPhase.UncrewedTransitToSite
                && _elapsedSeconds - request.PodPhaseStartedAt
                    >= definition.EmptyPodDeliverySeconds) {
                request.PodPhase = PatientPodPhase.GroundLoading;
                request.PodPhaseStartedAt = _elapsedSeconds;
                request.CourierPhase = PodCourierPhase.ReturningEmptyToDepot;
                request.CourierPhaseStartedAt = _elapsedSeconds;
                Emit("pod.delivered-ground-team-loading", definition.Id,
                    definition.SiteLocationId);
            }

            if (request.CourierPhase == PodCourierPhase.ReturningEmptyToDepot
                && _elapsedSeconds - request.CourierPhaseStartedAt
                    >= definition.EmptyCourierReturnSeconds) {
                request.CourierPhase = PodCourierPhase.Recovered;
                Emit("pod-courier.recovered-empty", definition.Id,
                    _definition.InitialLocationId);
            }

            if (request.PodPhase == PatientPodPhase.GroundLoading
                && _elapsedSeconds - request.PodPhaseStartedAt
                    >= definition.GroundLoadingSeconds) {
                request.PodPhase = PatientPodPhase.ReadyAtSite;
                request.PodPhaseStartedAt = _elapsedSeconds;
                request.ActualPodReadyAt = _elapsedSeconds;
                request.PodSealedAt = _elapsedSeconds;
                Emit("pod.patient-ready", definition.Id, definition.SiteLocationId);
            }
        }
    }

    void UpdateMedicalReports() {
        foreach (RequestRuntime request in OrderedRequests()) {
            if (request.PodSealedAt is not int sealedAt) continue;
            int secondsSinceSealed = _elapsedSeconds - sealedAt;
            IReadOnlyList<TimedMedicalReport> reports = request.Definition.MedicalReports;
            while (request.AppliedMedicalReportIndex + 1 < reports.Count) {
                int nextIndex = request.AppliedMedicalReportIndex + 1;
                TimedMedicalReport next = reports[nextIndex];
                if (next.SecondsAfterPodSealed > secondsSinceSealed) break;
                request.AppliedMedicalReportIndex = nextIndex;
                ApplyMedicalObservation(
                    request,
                    next.Status,
                    checked(sealedAt + next.SecondsAfterPodSealed),
                    "medical.observation-received");
            }
        }
    }

    void ApplyMedicalObservation(
        RequestRuntime request,
        in ObservedMedicalStatus status,
        int recordedAtSecond,
        string eventCode) {
        ObservedMedicalStatus? previous = request.Medical;
        request.Medical = status;
        request.MedicalRecordedAt = recordedAtSecond;
        Emit(eventCode, request.Definition.Id);

        if (previous is not ObservedMedicalStatus prior
            || !request.Onboard
            || _committedCollectionRequestId is null
            || !StringComparer.Ordinal.Equals(
                _assignedRequestId, _committedCollectionRequestId)
            || _decision != CommanderDecisionKind.None
            || !IsSafeToReconsiderCommittedCollection()
            || !IsMaterialObservedWorsening(prior, status))
            return;

        _decision = CommanderDecisionKind.ReconsiderCollectOrDeliver;
        _reconsiderationRequestId = request.Definition.Id;
        Emit("medical.reconsideration-required", request.Definition.Id,
            _currentLocationId);
    }

    bool IsSafeToReconsiderCommittedCollection() {
        if (_committedCollectionRequestId is null) return false;
        RequestRuntime collection = _requests[_committedCollectionRequestId];
        return collection.PodPhase != PatientPodPhase.OnExtractionDrone;
    }

    static bool IsMaterialObservedWorsening(
        in ObservedMedicalStatus previous,
        in ObservedMedicalStatus current) =>
        IsAssessmentComplete(previous)
        && IsAssessmentComplete(current)
        && ((int)current.Urgency > (int)previous.Urgency
        || (current.Trend == ObservedMedicalTrend.Worsening
            && previous.Trend != ObservedMedicalTrend.Worsening)
        || (int)current.Airway > (int)previous.Airway
        || (int)current.Breathing > (int)previous.Breathing
        || (int)current.Circulation > (int)previous.Circulation
        || TemperatureSeverity(current.Temperature)
            > TemperatureSeverity(previous.Temperature)
        || (current.RequestedReceivingCapabilities
            & ~previous.RequestedReceivingCapabilities) != ReceivingCapability.None
        || (previous.TransportRelayEligible && !current.TransportRelayEligible));

    static int TemperatureSeverity(ObservedTemperatureStatus status) =>
        status switch {
            ObservedTemperatureStatus.Warm => 0,
            ObservedTemperatureStatus.Cold => 1,
            ObservedTemperatureStatus.VeryCold => 2,
            _ => -1
        };

    void UpdateAirAmbulance() {
        if (_decision == CommanderDecisionKind.ReconsiderCollectOrDeliver)
            return;

        if (_aircraftPhase == AirAmbulancePhase.HoldingAtPickup
            && _assignedRequestId is not null) {
            RequestRuntime heldFor = _requests[_assignedRequestId];
            if (heldFor.Definition.Threat.IsImmediateCredible)
                _immediateThreatHoldSeconds++;
            if (heldFor.PodPhase == PatientPodPhase.ReadyAtSite)
                BoardPod(heldFor);
            return;
        }

        if (_aircraftPhase == AirAmbulancePhase.HoldingAtSafeStaging
            && _assignedRequestId is not null
            && _elapsedSeconds >= _plannedLaunchAt) {
            StartPickupFromStaging(_requests[_assignedRequestId]);
            return;
        }

        if (_aircraftPhase == AirAmbulancePhase.AwaitingRemoteExtraction
            && _assignedRequestId is not null) {
            UpdateRemoteExtraction(_requests[_assignedRequestId]);
            return;
        }

        if (_routeSecondsRemaining <= 0) return;
        _routeSecondsRemaining--;
        if (_routeSecondsRemaining > 0) return;

        if (_targetLocationId is not null) _currentLocationId = _targetLocationId;
        switch (_aircraftPhase) {
            case AirAmbulancePhase.EnrouteSafeStaging:
                Emit("air-ambulance.staged", _assignedRequestId, _currentLocationId);
                StageForAssignedRequest();
                break;
            case AirAmbulancePhase.EnroutePickup:
                ArriveAtDirectPickup();
                break;
            case AirAmbulancePhase.EnrouteReceivingFacility:
                ArriveAtReceivingFacility();
                break;
        }
    }

    void UpdateRemoteExtraction(RequestRuntime request) {
        if (request.ExtractionPhase == ExtractionDronePhase.WaitingForPod) {
            if (request.PodPhase == PatientPodPhase.ReadyAtSite)
                AttachPodAndReturn(request);
            return;
        }
        if (request.ExtractionPhase ==
            ExtractionDronePhase.AwaitingCommanderControlDecision)
            return;
        if (request.ExtractionPhase is not (ExtractionDronePhase.OutboundToSite
            or ExtractionDronePhase.ReturningWithPod))
            return;

        request.ExtractionSecondsElapsed++;
        ApplyRfExposure(request);
        ApplyScriptedControlChanges(request);
        if (request.ExtractionPhase ==
            ExtractionDronePhase.AwaitingCommanderControlDecision)
            return;

        request.ExtractionLegSecondsRemaining--;
        if (request.ExtractionLegSecondsRemaining > 0) return;

        if (request.ExtractionPhase == ExtractionDronePhase.OutboundToSite) {
            if (request.PodPhase == PatientPodPhase.ReadyAtSite)
                AttachPodAndReturn(request);
            else {
                request.ExtractionPhase = ExtractionDronePhase.WaitingForPod;
                Emit("extraction.waiting-for-pod", request.Definition.Id,
                    request.Definition.SiteLocationId);
            }
            return;
        }

        request.ExtractionPhase = ExtractionDronePhase.Complete;
        request.ControlMode = ExtractionControlMode.None;
        Emit("extraction.rendezvous-complete", request.Definition.Id,
            request.Definition.StagingLocationId);
        BoardPod(request);
    }

    void ApplyRfExposure(RequestRuntime request) {
        if (request.ControlMode == ExtractionControlMode.RfFallback)
            _rfExposureTrainingUnits = checked(_rfExposureTrainingUnits
                + MedevacTrainingSurrogate.DirectRfExposureUnitsPerSecond);
        else if (request.ControlMode == ExtractionControlMode.ShortRangeRepeater) {
            _rfExposureTrainingUnits = checked(_rfExposureTrainingUnits
                + MedevacTrainingSurrogate.RepeaterRfExposureUnitsPerSecond);
            request.RepeaterSecondsRemaining--;
            if (request.RepeaterSecondsRemaining <= 0) {
                request.ControlMode = ExtractionControlMode.Autonomous;
                Emit("extraction.repeater-expired", request.Definition.Id);
            }
        }
    }

    void ApplyScriptedControlChanges(RequestRuntime request) {
        ExtractionFailurePlan plan = request.Definition.ExtractionFailures;
        if (request.ControlMode == ExtractionControlMode.Fibre
            && plan.FibreFailureAfterExtractionSeconds >= 0
            && request.ExtractionSecondsElapsed
                >= plan.FibreFailureAfterExtractionSeconds) {
            request.ControlMode = ExtractionControlMode.Autonomous;
            Emit("extraction.fibre-lost-autonomy", request.Definition.Id);
        }

        if (request.ControlMode == ExtractionControlMode.Autonomous
            && plan.AutonomyBlockedAfterExtractionSeconds >= 0
            && request.ExtractionSecondsElapsed
                >= plan.AutonomyBlockedAfterExtractionSeconds) {
            request.BlockedExtractionPhase = request.ExtractionPhase;
            request.ExtractionPhase =
                ExtractionDronePhase.AwaitingCommanderControlDecision;
            Emit("extraction.autonomy-blocked", request.Definition.Id);
        }
    }

    void AttachPodAndReturn(RequestRuntime request) {
        request.PodPhase = PatientPodPhase.OnExtractionDrone;
        request.PodPhaseStartedAt = _elapsedSeconds;
        request.ExtractionPhase = ExtractionDronePhase.ReturningWithPod;
        request.ExtractionLegSecondsRemaining =
            request.Definition.ExtractionInboundSeconds;
        Emit("extraction.pod-attached", request.Definition.Id,
            request.Definition.SiteLocationId);
    }

    void PlanPickup(RequestRuntime request) {
        if (_onboard.Count >= MedevacTrainingSurrogate.PatientPodCapacity)
            throw new InvalidOperationException("The air ambulance already carries two pods.");
        _assignedRequestId = request.Definition.Id;
        _receivingFacilityId = null;
        string stagingLocationId = request.Definition.StagingLocationId;
        if (!StringComparer.Ordinal.Equals(_currentLocationId, stagingLocationId)) {
            int routeSeconds = TravelSeconds(_currentLocationId, stagingLocationId);
            _targetLocationId = stagingLocationId;
            _routeSecondsRemaining = routeSeconds;
            _plannedLaunchAt = _elapsedSeconds;
            _plannedArrivalAt = checked(_elapsedSeconds + _routeSecondsRemaining);
            _aircraftPhase = AirAmbulancePhase.EnrouteSafeStaging;
            Emit("air-ambulance.enroute-staging", request.Definition.Id,
                stagingLocationId);
            if (_routeSecondsRemaining == 0) {
                _currentLocationId = stagingLocationId;
                _targetLocationId = null;
                Emit("air-ambulance.staged", request.Definition.Id,
                    _currentLocationId);
                StageForAssignedRequest();
            }
            return;
        }

        StageForAssignedRequest();
    }

    void StageForAssignedRequest() {
        if (_assignedRequestId is null)
            throw new InvalidOperationException("No pickup is assigned.");
        RequestRuntime request = _requests[_assignedRequestId];
        _targetLocationId = request.Definition.StagingLocationId;
        _aircraftPhase = AirAmbulancePhase.HoldingAtSafeStaging;
        if (request.Definition.PickupMethod == PickupMethod.DirectAircraftPickup) {
            int travel = TravelSeconds(
                request.Definition.StagingLocationId,
                request.Definition.SiteLocationId);
            _plannedLaunchAt = Math.Max(
                _elapsedSeconds,
                request.EstimatedPodReadyAt - travel);
            _plannedArrivalAt = checked(_plannedLaunchAt + travel);
        }
        else {
            _plannedLaunchAt = Math.Max(
                _elapsedSeconds,
                request.EstimatedPodReadyAt
                    - request.Definition.ExtractionOutboundSeconds);
            _plannedArrivalAt = checked(_plannedLaunchAt
                + request.Definition.ExtractionOutboundSeconds
                + request.Definition.ExtractionInboundSeconds);
            request.ExtractionPhase =
                ExtractionDronePhase.WaitingForAirAmbulance;
        }

        Emit("air-ambulance.holding-safe", request.Definition.Id,
            request.Definition.StagingLocationId);
        if (_elapsedSeconds >= _plannedLaunchAt)
            StartPickupFromStaging(request);
    }

    void StartPickupFromStaging(RequestRuntime request) {
        if (request.Definition.PickupMethod == PickupMethod.DirectAircraftPickup) {
            _targetLocationId = request.Definition.SiteLocationId;
            _routeSecondsRemaining = TravelSeconds(
                _currentLocationId, request.Definition.SiteLocationId);
            _aircraftPhase = AirAmbulancePhase.EnroutePickup;
            Emit("air-ambulance.enroute-pickup", request.Definition.Id,
                request.Definition.SiteLocationId);
            if (_routeSecondsRemaining == 0) {
                _currentLocationId = request.Definition.SiteLocationId;
                ArriveAtDirectPickup();
            }
            return;
        }

        request.ExtractionPhase = ExtractionDronePhase.OutboundToSite;
        request.BlockedExtractionPhase = ExtractionDronePhase.NotRequired;
        request.ControlMode = ExtractionControlMode.Fibre;
        request.ExtractionLegSecondsRemaining =
            request.Definition.ExtractionOutboundSeconds;
        request.ExtractionSecondsElapsed = 0;
        _aircraftPhase = AirAmbulancePhase.AwaitingRemoteExtraction;
        Emit("extraction.launched-fibre", request.Definition.Id,
            request.Definition.StagingLocationId);
    }

    void ArriveAtDirectPickup() {
        if (_assignedRequestId is null)
            throw new InvalidOperationException("No direct pickup is assigned.");
        RequestRuntime request = _requests[_assignedRequestId];
        Emit("air-ambulance.arrived-pickup", request.Definition.Id,
            request.Definition.SiteLocationId);
        if (request.PodPhase == PatientPodPhase.ReadyAtSite)
            BoardPod(request);
        else
            _aircraftPhase = AirAmbulancePhase.HoldingAtPickup;
    }

    void BoardPod(RequestRuntime request) {
        if (_onboard.Count >= MedevacTrainingSurrogate.PatientPodCapacity)
            throw new InvalidOperationException("The air ambulance already carries two pods.");
        if (request.PodPhase is not (PatientPodPhase.ReadyAtSite
            or PatientPodPhase.OnExtractionDrone))
            throw new InvalidOperationException("The patient pod is not ready to board.");

        request.PodPhase = PatientPodPhase.OnboardAirAmbulance;
        request.PodPhaseStartedAt = _elapsedSeconds;
        if (!_onboard.Contains(request.Definition.Id, StringComparer.Ordinal))
            _onboard.Add(request.Definition.Id);
        _currentLocationId = request.Definition.PickupMethod
            == PickupMethod.DirectAircraftPickup
                ? request.Definition.SiteLocationId
                : request.Definition.StagingLocationId;
        _targetLocationId = null;
        _routeSecondsRemaining = 0;
        _assignedRequestId = null;
        _committedCollectionRequestId = null;
        _reconsiderationRequestId = null;
        _aircraftPhase = AirAmbulancePhase.AwaitingCommanderDecision;
        _decision = _onboard.Count >= MedevacTrainingSurrogate.PatientPodCapacity
            ? CommanderDecisionKind.ChooseReceivingFacility
            : CommanderDecisionKind.CollectNextOrDeliver;
        Emit("pod.boarded-air-ambulance", request.Definition.Id,
            _currentLocationId);
    }

    void ArriveAtReceivingFacility() {
        if (_receivingFacilityId is null)
            throw new InvalidOperationException("No receiving facility is assigned.");
        ReceivingFacilityDefinition facility = _facilities[_receivingFacilityId];
        _currentLocationId = facility.LocationId;
        _targetLocationId = null;
        _routeSecondsRemaining = 0;

        foreach (string requestId in _deliveryRequestIds) {
            RequestRuntime request = _requests[requestId];
            request.PodPhase = facility.Kind == ReceivingFacilityKind.TransportRelay
                ? PatientPodPhase.TransferredToPatientTransport
                : PatientPodPhase.DeliveredToClinicalFacility;
            request.PodPhaseStartedAt = _elapsedSeconds;
            request.DispositionLocationId = facility.LocationId;
            Emit(facility.Kind == ReceivingFacilityKind.TransportRelay
                    ? "pod.transferred-patient-transport"
                    : "pod.delivered-clinical-facility",
                requestId, facility.LocationId);
        }
        var delivered = _deliveryRequestIds.ToHashSet(StringComparer.Ordinal);
        _onboard.RemoveAll(delivered.Contains);
        _deliveryRequestIds.Clear();
        _receivingFacilityId = null;
        _aircraftPhase = AirAmbulancePhase.AwaitingCommanderDecision;

        if (_onboard.Count == 0
            && _requests.Values.All(request => request.Disposed)) {
            _lifecycle = MedevacMissionLifecycle.Complete;
            _aircraftPhase = AirAmbulancePhase.Complete;
            _decision = CommanderDecisionKind.None;
            Emit("mission.complete", locationId: _currentLocationId);
        }
        else {
            _decision = _onboard.Count >= MedevacTrainingSurrogate.PatientPodCapacity
                ? CommanderDecisionKind.ChooseReceivingFacility
                : CommanderDecisionKind.CollectNextOrDeliver;
            Emit("air-ambulance.available", locationId: _currentLocationId);
        }
    }

    void RefreshWaitingDecision() {
        if (_aircraftPhase != AirAmbulancePhase.AwaitingCommanderDecision
            || _decision != CommanderDecisionKind.CollectNextOrDeliver)
            return;
        if (_onboard.Count >= MedevacTrainingSurrogate.PatientPodCapacity)
            _decision = CommanderDecisionKind.ChooseReceivingFacility;
    }

    MedevacEvacuationSnapshot BuildSnapshot() {
        EvacuationMissionKind missionKind = CurrentMissionKind();
        EvacuationRequestSnapshot[] requests = OrderedRequests()
            .Select(BuildRequestSnapshot)
            .ToArray();
        ReceivingFacilitySnapshot[] facilities = _definition.ReceivingFacilities
            .Select(facility => {
                (FacilitySuitability suitability,
                    ReceivingCapability missing) =
                    AssessFacility(facility, _onboard);
                string[] individuallySuitable = _onboard
                    .Where(requestId =>
                        AssessFacility(facility, new[] { requestId }).Suitability
                            == FacilitySuitability.Suitable)
                    .ToArray();
                return new ReceivingFacilitySnapshot(
                    facility.Id,
                    facility.Label,
                    facility.LocationId,
                    facility.Kind,
                    facility.AvailableCapabilities,
                    suitability,
                    missing,
                    individuallySuitable);
            })
            .ToArray();
        DeliveryCandidateSnapshot[] deliveryCandidates =
            _definition.ReceivingFacilities
                .SelectMany(facility => DeliverySelections().Select(selection => {
                    (FacilitySuitability suitability,
                        ReceivingCapability missing) =
                        AssessFacility(facility, selection);
                    return new DeliveryCandidateSnapshot(
                        facility.Id,
                        selection,
                        selection.Select(requestId =>
                            _requests[requestId].Definition.PatientId).ToArray(),
                        selection.Select(requestId =>
                            _requests[requestId].Definition.PodId).ToArray(),
                        suitability,
                        missing);
                }))
                .ToArray();
        string[] collectable = OrderedRequests()
            .Where(IsSelectableForCollection)
            .Select(request => request.Definition.Id)
            .ToArray();
        string[] receivingIds = _definition.ReceivingFacilities
            .Select(facility => facility.Id)
            .ToArray();

        var aircraft = new AirAmbulanceSnapshot(
            _definition.AmbulanceCallsign,
            _aircraftPhase,
            _currentLocationId,
            _targetLocationId,
            _assignedRequestId,
            _receivingFacilityId,
            _routeSecondsRemaining,
            _plannedLaunchAt,
            _plannedArrivalAt,
            MedevacTrainingSurrogate.PatientPodCapacity,
            _onboard.ToArray(),
            _immediateThreatHoldSeconds,
            _onboard.Select(requestId =>
                _requests[requestId].Definition.PatientId).ToArray(),
            _onboard.Select(requestId =>
                _requests[requestId].Definition.PodId).ToArray(),
            _deliveryRequestIds.ToArray());
        var decision = new CommanderDecisionSnapshot(
            _decision,
            collectable,
            receivingIds,
            _onboard.Count > 0,
            _committedCollectionRequestId,
            _reconsiderationRequestId);

        return new MedevacEvacuationSnapshot(
            MedevacTrainingSurrogate.SnapshotSchemaVersion,
            _definition.Id,
            _elapsedSeconds,
            _lifecycle,
            missionKind,
            aircraft,
            requests,
            facilities,
            deliveryCandidates,
            decision,
            _rfExposureTrainingUnits,
            _events.ToArray());
    }

    EvacuationRequestSnapshot BuildRequestSnapshot(RequestRuntime request) {
        MedicalObservationSnapshot? medical = request.Medical is
            ObservedMedicalStatus status
                ? new MedicalObservationSnapshot(
                    status,
                    request.MedicalRecordedAt,
                    _elapsedSeconds - request.MedicalRecordedAt)
                : null;
        bool ready = request.PodPhase == PatientPodPhase.ReadyAtSite;
        var extraction = new ExtractionDroneSnapshot(
            request.ExtractionPhase,
            request.ControlMode,
            request.ExtractionLegSecondsRemaining,
            request.ExtractionSecondsElapsed,
            request.ExtractionPhase ==
                ExtractionDronePhase.AwaitingCommanderControlDecision,
            request.ControlMode == ExtractionControlMode.RfFallback
                && !request.RepeaterWasEjected,
            request.RepeaterWasEjected);
        return new EvacuationRequestSnapshot(
            request.Definition.Id,
            request.Definition.PatientId,
            request.Definition.PodId,
            request.Definition.Label,
            request.Definition.SiteLocationId,
            request.Definition.StagingLocationId,
            request.Definition.RequestTimeSeconds,
            request.Definition.Threat.MissionKind,
            request.Definition.Threat,
            request.Definition.PickupMethod,
            request.PodPhase,
            request.CourierPhase,
            request.EstimatedPodReadyAt,
            request.ActualPodReadyAt,
            ready,
            IsSelectableForCollection(request),
            medical,
            extraction,
            BuildPatientCustody(request),
            BuildPodCustody(request));
    }

    (FacilitySuitability Suitability, ReceivingCapability Missing)
        AssessFacility(
            ReceivingFacilityDefinition facility,
            IReadOnlyCollection<string> requestIds) {
        if (requestIds.Count == 0)
            return (FacilitySuitability.NoPatientsOnboard, ReceivingCapability.None);

        if (requestIds.Any(requestId =>
            _requests[requestId].Medical is not ObservedMedicalStatus status
            || !IsAssessmentComplete(status)))
            return (FacilitySuitability.MedicalAssessmentIncomplete,
                ReceivingCapability.None);

        if (facility.Kind == ReceivingFacilityKind.TransportRelay) {
            bool relayAvailable = facility.AvailableCapabilities.HasFlag(
                ReceivingCapability.PatientTransportRelay);
            if (!relayAvailable)
                return (FacilitySuitability.RelayNotAppropriate,
                    ReceivingCapability.PatientTransportRelay);
            bool everyPatientEligible = requestIds.All(requestId =>
                _requests[requestId].Medical?.TransportRelayEligible == true);
            return everyPatientEligible
                ? (FacilitySuitability.Suitable, ReceivingCapability.None)
                : (FacilitySuitability.RelayNotAppropriate, ReceivingCapability.None);
        }

        ReceivingCapability required = ReceivingCapability.None;
        foreach (string requestId in requestIds)
            required |= _requests[requestId].Medical?
                .RequestedReceivingCapabilities ?? ReceivingCapability.None;
        ReceivingCapability missing = required & ~facility.AvailableCapabilities;
        return missing == ReceivingCapability.None
            ? (FacilitySuitability.Suitable, ReceivingCapability.None)
            : (FacilitySuitability.CapabilityMismatch, missing);
    }

    IEnumerable<string[]> DeliverySelections() {
        foreach (string requestId in _onboard)
            yield return new[] { requestId };
        if (_onboard.Count > 1) yield return _onboard.ToArray();
    }

    EvacuationEntityCustodySnapshot BuildPatientCustody(RequestRuntime request) {
        string patientId = request.Definition.PatientId;
        string podId = request.Definition.PodId;
        return request.PodPhase switch {
            PatientPodPhase.AwaitingDispatch
                or PatientPodPhase.UncrewedTransitToSite
                or PatientPodPhase.GroundLoading =>
                AtLocation(patientId, EvacuationCustodian.SiteGroundTeam,
                    request.Definition.SiteLocationId),
            PatientPodPhase.ReadyAtSite =>
                AtLocation(patientId, EvacuationCustodian.SiteGroundTeam,
                    request.Definition.SiteLocationId, podId),
            PatientPodPhase.OnExtractionDrone =>
                OnVehicle(patientId, EvacuationCustodian.ExtractionDrone,
                    request.Definition.SiteLocationId,
                    request.Definition.StagingLocationId,
                    ExtractionVehicleId(request), podId),
            PatientPodPhase.OnboardAirAmbulance =>
                OnVehicle(patientId, EvacuationCustodian.AirAmbulance,
                    _currentLocationId, _targetLocationId,
                    _definition.AmbulanceCallsign, podId),
            PatientPodPhase.TransferredToPatientTransport =>
                AtLocation(patientId, EvacuationCustodian.PatientTransport,
                    RequireDispositionLocation(request), podId),
            PatientPodPhase.DeliveredToClinicalFacility =>
                AtLocation(patientId, EvacuationCustodian.ClinicalFacility,
                    RequireDispositionLocation(request), podId),
            _ => throw new InvalidOperationException(
                "Unknown patient custody phase.")
        };
    }

    EvacuationEntityCustodySnapshot BuildPodCustody(RequestRuntime request) =>
        request.PodPhase switch {
            PatientPodPhase.AwaitingDispatch =>
                AtLocation(request.Definition.PodId, EvacuationCustodian.PodDepot,
                    _definition.InitialLocationId),
            PatientPodPhase.UncrewedTransitToSite =>
                InTransit(
                    request.Definition.PodId,
                    EvacuationCustodian.AutonomousPodCourier,
                    _definition.InitialLocationId,
                    request.Definition.SiteLocationId,
                    CourierVehicleId(request)),
            PatientPodPhase.GroundLoading
                or PatientPodPhase.ReadyAtSite =>
                AtLocation(request.Definition.PodId,
                    EvacuationCustodian.SiteGroundTeam,
                    request.Definition.SiteLocationId),
            PatientPodPhase.OnExtractionDrone =>
                OnVehicle(request.Definition.PodId,
                    EvacuationCustodian.ExtractionDrone,
                    request.Definition.SiteLocationId,
                    request.Definition.StagingLocationId,
                    ExtractionVehicleId(request)),
            PatientPodPhase.OnboardAirAmbulance =>
                OnVehicle(request.Definition.PodId,
                    EvacuationCustodian.AirAmbulance,
                    _currentLocationId, _targetLocationId,
                    _definition.AmbulanceCallsign),
            PatientPodPhase.TransferredToPatientTransport =>
                AtLocation(request.Definition.PodId,
                    EvacuationCustodian.PatientTransport,
                    RequireDispositionLocation(request)),
            PatientPodPhase.DeliveredToClinicalFacility =>
                AtLocation(request.Definition.PodId,
                    EvacuationCustodian.ClinicalFacility,
                    RequireDispositionLocation(request)),
            _ => throw new InvalidOperationException("Unknown pod custody phase.")
        };

    static EvacuationEntityCustodySnapshot AtLocation(
        string entityId,
        EvacuationCustodian custodian,
        string locationId,
        string? containerPodId = null) =>
        new(
            entityId,
            custodian,
            EvacuationPositionKind.AtLocation,
            locationId,
            null,
            null,
            containerPodId);

    static EvacuationEntityCustodySnapshot InTransit(
        string entityId,
        EvacuationCustodian custodian,
        string fromLocationId,
        string destinationLocationId,
        string vehicleId) =>
        new(
            entityId,
            custodian,
            EvacuationPositionKind.InTransit,
            fromLocationId,
            destinationLocationId,
            vehicleId,
            null);

    static EvacuationEntityCustodySnapshot OnVehicle(
        string entityId,
        EvacuationCustodian custodian,
        string? locationId,
        string? destinationLocationId,
        string vehicleId,
        string? containerPodId = null) =>
        new(
            entityId,
            custodian,
            EvacuationPositionKind.OnVehicle,
            locationId,
            destinationLocationId,
            vehicleId,
            containerPodId);

    static string CourierVehicleId(RequestRuntime request) =>
        $"POD-COURIER:{request.Definition.PodId}";

    static string ExtractionVehicleId(RequestRuntime request) =>
        $"EXTRACTOR:{request.Definition.Id}";

    static string RequireDispositionLocation(RequestRuntime request) =>
        request.DispositionLocationId
        ?? throw new InvalidOperationException(
            "A disposed patient pod must retain its handoff location.");

    EvacuationMissionKind CurrentMissionKind() {
        if (_assignedRequestId is not null)
            return _requests[_assignedRequestId].Definition.Threat.MissionKind;
        if (_aircraftPhase == AirAmbulancePhase.AwaitingCommanderDecision) {
            RequestRuntime? localThreat = OrderedRequests().FirstOrDefault(request =>
                _elapsedSeconds >= request.Definition.RequestTimeSeconds
                && !request.Disposed
                && request.Definition.Threat.IsImmediateCredible
                && StringComparer.Ordinal.Equals(
                    request.Definition.SiteLocationId, _currentLocationId));
            if (localThreat is not null) return EvacuationMissionKind.Dustoff;
        }
        return EvacuationMissionKind.Medevac;
    }

    bool IsSelectableForCollection(RequestRuntime request) =>
        _elapsedSeconds >= request.Definition.RequestTimeSeconds
        && !request.Disposed
        && !request.Onboard
        && !StringComparer.Ordinal.Equals(
            _assignedRequestId, request.Definition.Id);

    IEnumerable<RequestRuntime> OrderedRequests() =>
        _definition.Requests.Select(definition => _requests[definition.Id]);

    RequestRuntime GetRequest(string requestId) {
        if (string.IsNullOrWhiteSpace(requestId)
            || !_requests.TryGetValue(requestId, out RequestRuntime? request))
            throw new ArgumentException("Unknown evacuation request.", nameof(requestId));
        return request;
    }

    string[] ValidateSelectedOnboardRequests(IReadOnlyList<string> requestIds) {
        ArgumentNullException.ThrowIfNull(requestIds);
        if (requestIds.Count == 0)
            throw new ArgumentException(
                "At least one onboard patient pod must be selected.",
                nameof(requestIds));

        var selected = requestIds.ToHashSet(StringComparer.Ordinal);
        if (selected.Count != requestIds.Count)
            throw new ArgumentException(
                "A patient pod may be selected only once.", nameof(requestIds));
        if (selected.Any(requestId =>
            !_onboard.Contains(requestId, StringComparer.Ordinal)))
            throw new InvalidOperationException(
                "Every selected patient pod must be onboard.");

        return _onboard.Where(selected.Contains).ToArray();
    }

    void CancelCommittedCollectionForDiversion() {
        if (_committedCollectionRequestId is null
            || _assignedRequestId is null
            || !StringComparer.Ordinal.Equals(
                _committedCollectionRequestId, _assignedRequestId))
            throw new InvalidOperationException(
                "No committed collection can be diverted.");

        RequestRuntime request = _requests[_committedCollectionRequestId];
        if (request.PodPhase == PatientPodPhase.OnExtractionDrone)
            throw new InvalidOperationException(
                "A loaded extraction drone must complete its declared rendezvous.");

        if (request.Definition.PickupMethod
            == PickupMethod.RemoteExtractionToSafeZone) {
            request.ExtractionPhase =
                ExtractionDronePhase.WaitingForAirAmbulance;
            request.BlockedExtractionPhase =
                ExtractionDronePhase.NotRequired;
            request.ControlMode = ExtractionControlMode.None;
            request.ExtractionLegSecondsRemaining = 0;
            request.ExtractionSecondsElapsed = 0;
        }

        _assignedRequestId = null;
    }

    static bool IsAssessmentComplete(in ObservedMedicalStatus status) =>
        status.Urgency != ObservedMedicalUrgency.Unassigned
        && status.Airway != ObservedSystemStatus.Unassessed
        && status.Breathing != ObservedSystemStatus.Unassessed
        && status.Circulation != ObservedSystemStatus.Unassessed
        && status.Temperature != ObservedTemperatureStatus.Unassessed;

    int TravelSeconds(string fromLocationId, string toLocationId) {
        if (_travelSeconds.TryGetValue((fromLocationId, toLocationId), out int seconds))
            return seconds;
        throw new InvalidOperationException(
            "Operational route reachability was not validated at construction.");
    }

    static IEnumerable<(string Next, int Cost)> Neighbours(
        MedevacScenarioDefinition definition,
        string locationId) {
        foreach (MedevacRouteDefinition route in definition.Routes) {
            if (StringComparer.Ordinal.Equals(route.FromLocationId, locationId))
                yield return (route.ToLocationId, route.TravelSeconds);
            if (route.Bidirectional
                && StringComparer.Ordinal.Equals(route.ToLocationId, locationId))
                yield return (route.FromLocationId, route.TravelSeconds);
        }
    }

    static Dictionary<(string From, string To), int> BuildTravelTable(
        MedevacScenarioDefinition definition) {
        var result = new Dictionary<(string From, string To), int>();
        string[] locationIds = definition.Locations
            .Select(location => location.Id)
            .ToArray();

        foreach (string origin in locationIds) {
            var best = locationIds.ToDictionary(
                id => id,
                _ => int.MaxValue,
                StringComparer.Ordinal);
            best[origin] = 0;
            var frontier = new PriorityQueue<string, (int Distance, string Id)>();
            frontier.Enqueue(origin, (0, origin));

            while (frontier.TryDequeue(
                out string? current,
                out (int Distance, string Id) priority)) {
                if (priority.Distance != best[current]) continue;
                result[(origin, current)] = priority.Distance;
                foreach ((string next, int cost) in Neighbours(definition, current)) {
                    int candidate = checked(priority.Distance + cost);
                    if (candidate >= best[next]) continue;
                    best[next] = candidate;
                    frontier.Enqueue(next, (candidate, next));
                }
            }
        }

        return result;
    }

    static void ValidateOperationalReachability(
        MedevacScenarioDefinition definition,
        IReadOnlyDictionary<(string From, string To), int> travelSeconds) {
        var operationalLocations = new HashSet<string>(StringComparer.Ordinal) {
            definition.InitialLocationId
        };
        foreach (ReceivingFacilityDefinition facility
            in definition.ReceivingFacilities)
            operationalLocations.Add(facility.LocationId);
        foreach (EvacuationRequestDefinition request in definition.Requests) {
            operationalLocations.Add(request.StagingLocationId);
            if (request.PickupMethod == PickupMethod.DirectAircraftPickup)
                operationalLocations.Add(request.SiteLocationId);
        }

        foreach (string from in operationalLocations) {
            foreach (string to in operationalLocations) {
                if (travelSeconds.ContainsKey((from, to))) continue;
                throw new ArgumentException(
                    $"No authored route connects operational locations '{from}' and '{to}'.",
                    nameof(definition));
            }
        }
    }

    void Emit(
        string code,
        string? requestId = null,
        string? locationId = null,
        MedevacDeliveryDecisionAudit? deliveryDecision = null,
        MedevacReconsiderationDecisionAudit? reconsiderationDecision = null) {
        _events.Add(new MedevacChainEvent(
            _nextEventSequence++,
            _elapsedSeconds,
            code,
            requestId,
            locationId,
            deliveryDecision,
            reconsiderationDecision));
    }

    void RequireActive() {
        if (_lifecycle != MedevacMissionLifecycle.Active)
            throw new InvalidOperationException("The evacuation session is not active.");
    }

    static void Validate(MedevacScenarioDefinition definition) {
        if (string.IsNullOrWhiteSpace(definition.Id))
            throw new ArgumentException("A scenario id is required.", nameof(definition));
        if (string.IsNullOrWhiteSpace(definition.AmbulanceCallsign))
            throw new ArgumentException("An ambulance callsign is required.", nameof(definition));
        if (definition.Locations is null || definition.Locations.Count == 0)
            throw new ArgumentException("At least one location is required.", nameof(definition));
        if (definition.Routes is null)
            throw new ArgumentException("Routes are required.", nameof(definition));
        if (definition.ReceivingFacilities is null
            || definition.ReceivingFacilities.Count == 0)
            throw new ArgumentException(
                "At least one receiving facility is required.", nameof(definition));
        if (definition.Requests is null || definition.Requests.Count == 0)
            throw new ArgumentException(
                "At least one evacuation request is required.", nameof(definition));

        ValidateUniqueIds(definition.Locations.Select(location => location.Id),
            "location", definition);
        ValidateUniqueIds(definition.ReceivingFacilities.Select(facility => facility.Id),
            "facility", definition);
        ValidateUniqueIds(definition.Requests.Select(request => request.Id),
            "request", definition);
        ValidateUniqueIds(definition.Requests.Select(request => request.PatientId),
            "patient", definition);
        ValidateUniqueIds(definition.Requests.Select(request => request.PodId),
            "patient pod", definition);
        var locations = definition.Locations.Select(location => location.Id)
            .ToHashSet(StringComparer.Ordinal);
        if (!locations.Contains(definition.InitialLocationId))
            throw new ArgumentException(
                "The initial ambulance location is unknown.", nameof(definition));

        foreach (MedevacRouteDefinition route in definition.Routes) {
            if (!locations.Contains(route.FromLocationId)
                || !locations.Contains(route.ToLocationId)
                || route.TravelSeconds < 0)
                throw new ArgumentException(
                    "Every route needs known endpoints and a non-negative travel time.",
                    nameof(definition));
        }

        foreach (ReceivingFacilityDefinition facility
            in definition.ReceivingFacilities) {
            if (!locations.Contains(facility.LocationId))
                throw new ArgumentException(
                    "Every receiving facility needs a known location.",
                    nameof(definition));
            if (facility.Kind == ReceivingFacilityKind.TransportRelay
                && !facility.AvailableCapabilities.HasFlag(
                    ReceivingCapability.PatientTransportRelay))
                throw new ArgumentException(
                    "A transport relay must advertise patient-transport relay capability.",
                    nameof(definition));
        }

        foreach (EvacuationRequestDefinition request in definition.Requests) {
            if (!locations.Contains(request.SiteLocationId)
                || !locations.Contains(request.StagingLocationId))
                throw new ArgumentException(
                    "Every request needs known site and staging locations.",
                    nameof(definition));
            if (request.RequestTimeSeconds < 0
                || request.EmptyPodDeliverySeconds <= 0
                || request.EmptyCourierReturnSeconds <= 0
                || request.GroundLoadingSeconds <= 0)
                throw new ArgumentException(
                    "Pod logistics use positive fictional training-surrogate durations.",
                    nameof(definition));
            if (request.PickupMethod == PickupMethod.RemoteExtractionToSafeZone
                && (request.ExtractionOutboundSeconds <= 0
                    || request.ExtractionInboundSeconds <= 0))
                throw new ArgumentException(
                    "Remote extraction needs positive outbound and inbound durations.",
                    nameof(definition));
            if (request.PickupMethod == PickupMethod.RemoteExtractionToSafeZone
                && request.ExtractionFailures.RepeaterControlSeconds <= 0)
                throw new ArgumentException(
                    "Repeater control time must be positive.", nameof(definition));
            if (request.MedicalReports is null || request.MedicalReports.Count == 0)
                throw new ArgumentException(
                    "Each request needs at least one observer-safe medical report.",
                    nameof(definition));
            int previous = -1;
            foreach (TimedMedicalReport report in request.MedicalReports) {
                if (report.SecondsAfterPodSealed < 0
                    || report.SecondsAfterPodSealed < previous)
                    throw new ArgumentException(
                        "Medical reports must have ordered, non-negative times.",
                        nameof(definition));
                previous = report.SecondsAfterPodSealed;
            }
        }
    }

    static MedevacScenarioDefinition Freeze(MedevacScenarioDefinition definition) =>
        definition with {
            Locations = definition.Locations.ToArray(),
            Routes = definition.Routes.ToArray(),
            ReceivingFacilities = definition.ReceivingFacilities.ToArray(),
            Requests = definition.Requests
                .Select(request => request with {
                    MedicalReports = request.MedicalReports.ToArray()
                })
                .ToArray()
        };

    static void ValidateUniqueIds(IEnumerable<string> ids, string kind,
        MedevacScenarioDefinition definition) {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (string id in ids) {
            if (string.IsNullOrWhiteSpace(id) || !seen.Add(id))
                throw new ArgumentException(
                    $"Every {kind} needs a unique non-empty id.", nameof(definition));
        }
    }
}
