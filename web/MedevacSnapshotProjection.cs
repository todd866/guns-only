using System.Text.Json;
using GunsOnly.Sim.Medevac;

namespace GunsOnly.Web;

/// <summary>
/// Observer-safe, presentation-oriented projection of the deterministic evacuation authority.
/// This type carries no browser interop attributes, owns no simulation state, and is linked into
/// sim.Tests so its JSON boundary can be exercised as ordinary .NET.
/// </summary>
internal static class MedevacSnapshotProjection {
    public const string Schema = "medevac.commander.v2";
    const int MaximumProjectedEvents = 18;

    static readonly IReadOnlyDictionary<string, MapPoint> MapPoints =
        new Dictionary<string, MapPoint>(StringComparer.Ordinal) {
            ["AMB-BASE"] = new(178, 493),
            ["SAFE-WEST"] = new(411, 214),
            ["SITE-01"] = new(473, 284),
            ["SITE-02"] = new(637, 430),
            ["LOC-RELAY-WEST"] = new(411, 214),
            ["LOC-HOSPITAL-LOCAL"] = new(783, 511),
            ["LOC-SURGICAL"] = new(845, 167)
        };

    public static string BuildState(
        MedevacScenarioDefinition definition,
        MedevacEvacuationSnapshot snapshot,
        int revision,
        bool paused) =>
        JsonSerializer.Serialize(
            BuildModel(definition, snapshot, revision, paused),
            MedevacWebJsonContext.Default.MedevacCommanderState);

    internal static MedevacCommanderState BuildModel(
        MedevacScenarioDefinition definition,
        MedevacEvacuationSnapshot snapshot,
        int revision,
        bool paused) {
        ArgumentNullException.ThrowIfNull(definition);
        ArgumentNullException.ThrowIfNull(snapshot);

        Dictionary<string, MedevacLocationDefinition> locations =
            definition.Locations.ToDictionary(location => location.Id, StringComparer.Ordinal);
        Dictionary<string, EvacuationRequestDefinition> requestDefinitions =
            definition.Requests.ToDictionary(request => request.Id, StringComparer.Ordinal);

        var visibleRequests = snapshot.Requests
            .Select((request, index) => (Request: request, Index: index))
            .Where(item => item.Request.RequestAtSecond <= snapshot.ElapsedSeconds)
            .ToArray();
        MedevacRequestState[] requests = visibleRequests
            .Select(item => BuildRequest(
                item.Request,
                snapshot.ElapsedSeconds))
            .ToArray();
        MedevacPatientState[] patients = visibleRequests
            .Select(item => BuildPatient(item.Request))
            .ToArray();
        MedevacPodDispatchState[] podDispatches = visibleRequests
            .Select(item => BuildPodDispatch(
                item.Request,
                snapshot.ElapsedSeconds))
            .ToArray();
        MedevacReceiverState[] receivers = snapshot.ReceivingFacilities
            .Select(facility => BuildReceiver(
                facility,
                snapshot.AirAmbulance.CurrentLocationId,
                definition,
                snapshot))
            .ToArray();

        EvacuationRequestSnapshot? activeRequest = snapshot.AirAmbulance.AssignedRequestId is
            string assignedRequestId
                ? snapshot.Requests.FirstOrDefault(request =>
                    StringComparer.Ordinal.Equals(request.Id, assignedRequestId))
                : snapshot.Requests.FirstOrDefault(request =>
                    request.Extraction.Phase is not (
                        ExtractionDronePhase.NotRequired or ExtractionDronePhase.Complete));
        EvacuationRequestDefinition? activeDefinition = activeRequest is null
            ? null
            : requestDefinitions[activeRequest.Id];

        MedevacExtractionState extraction = BuildExtraction(
            activeRequest,
            activeDefinition,
            snapshot);
        MedevacRendezvousState rendezvous = BuildRendezvous(
            activeRequest,
            activeDefinition,
            snapshot);
        DecisionBuild decisionBuild = BuildDecision(
            definition,
            snapshot,
            requests,
            receivers,
            extraction);
        MedevacPrimaryAction primary = decisionBuild.Options
            .FirstOrDefault(option => option.Recommended && option.Enabled)
            is { } recommended
                ? ActionFor(recommended)
                : decisionBuild.Options.FirstOrDefault(option => option.Enabled) is { } first
                    ? ActionFor(first)
                    : new("", "AUTOMATION IN PROGRESS",
                        "NO COMMAND REQUIRED", false, false);

        MedevacRearCrewState rearCrew = BuildRearCrew(
            snapshot,
            requests,
            receivers,
            decisionBuild.Options);
        MedevacAircraftState aircraft = BuildAircraft(
            definition,
            snapshot,
            locations);
        MedevacConditionsState conditions = BuildConditions(
            snapshot,
            activeRequest,
            extraction);
        MedevacEventState[] events = snapshot.Events
            .TakeLast(MaximumProjectedEvents)
            .Select(item => BuildEvent(item, requestDefinitions))
            .ToArray();
        MedevacEventState[] decisionAudit = snapshot.Events
            .Where(item => item.DeliveryDecision is not null
                || item.ReconsiderationDecision is not null)
            .Select(item => BuildEvent(item, requestDefinitions))
            .ToArray();

        string phase = DecisionPhase(snapshot, extraction);
        return new MedevacCommanderState(
            Schema,
            revision,
            snapshot.ScenarioId,
            "TRAINING SERIAL M-01",
            snapshot.ElapsedSeconds,
            Upper(snapshot.Lifecycle),
            phase,
            Upper(snapshot.CurrentMissionKind),
            paused,
            new("MISSION_COMMANDER", "PLAYER"),
            aircraft,
            conditions,
            requests,
            podDispatches,
            rendezvous,
            extraction,
            patients,
            rearCrew,
            receivers,
            new(
                decisionBuild.Id,
                decisionBuild.Kind,
                decisionBuild.Title,
                decisionBuild.Prompt,
                null,
                decisionBuild.Options),
            primary,
            snapshot.RfExposureTrainingUnits,
            events.LastOrDefault()?.Sequence ?? 0,
            events,
            snapshot.Lifecycle == MedevacMissionLifecycle.Complete
                ? new MedevacDebriefState(
                    "All patient pods left air-ambulance custody with identity and record continuity.",
                    decisionAudit)
                : null,
            null);
    }

    static MedevacRequestState BuildRequest(
        EvacuationRequestSnapshot request,
        int elapsedSeconds) =>
        new(
            request.Id,
            request.PatientId,
            request.Label,
            request.PodId,
            Upper(request.MissionKind),
            Upper(request.PickupMethod),
            Upper(request.PodPhase),
            Upper(request.CourierPhase),
            request.EstimatedPodReadyAtSecond,
            Math.Max(0, request.EstimatedPodReadyAtSecond - elapsedSeconds),
            request.ActualPodReadyAtSecond,
            request.IsReadyForCollection,
            request.IsSelectableForCollection,
            BuildMedical(request.Medical),
            BuildCustody(request.PatientCustody),
            BuildCustody(request.PodCustody));

    static MedevacPatientState BuildPatient(
        EvacuationRequestSnapshot request) =>
        new(
            request.PatientId,
            request.Id,
            request.Label,
            request.PodId,
            request.Medical is null
                ? "NO OBSERVATION"
                : "OBSERVED MEDICAL STATUS",
            BuildMedical(request.Medical),
            BuildCustody(request.PatientCustody),
            BuildCustody(request.PodCustody));

    static MedevacPodDispatchState BuildPodDispatch(
        EvacuationRequestSnapshot request,
        int elapsedSeconds) =>
        new(
            request.PodId,
            request.Id,
            request.PatientId,
            "AUTONOMOUS_COURIER",
            Upper(request.PodPhase),
            request.EstimatedPodReadyAtSecond,
            Math.Max(0, request.EstimatedPodReadyAtSecond - elapsedSeconds),
            null,
            null,
            "NOT_PROVIDED",
            Upper(request.CourierPhase),
            BuildCustody(request.PodCustody));

    static MedevacCustodyState BuildCustody(
        EvacuationEntityCustodySnapshot custody) =>
        new(
            custody.EntityId,
            Upper(custody.Custodian),
            Upper(custody.Position),
            custody.LocationId,
            custody.DestinationLocationId,
            custody.VehicleId,
            custody.ContainerPodId);

    static MedevacMedicalState? BuildMedical(MedicalObservationSnapshot? observation) {
        if (observation is not { } medical) return null;
        return new MedevacMedicalState(
            Upper(medical.Status.Urgency),
            Upper(medical.Status.Trend),
            Upper(medical.Status.Airway),
            Upper(medical.Status.Breathing),
            Upper(medical.Status.Circulation),
            Upper(medical.Status.Temperature),
            CapabilityNames(medical.Status.RequestedReceivingCapabilities),
            medical.Status.TransportRelayEligible,
            medical.RecordedAtSecond,
            medical.AgeSeconds,
            "AUTHORISED_MEDICAL_REPORT",
            "NOT_PROVIDED");
    }

    static MedevacAircraftState BuildAircraft(
        MedevacScenarioDefinition definition,
        MedevacEvacuationSnapshot snapshot,
        IReadOnlyDictionary<string, MedevacLocationDefinition> locations) {
        AirAmbulanceSnapshot aircraft = snapshot.AirAmbulance;
        int totalRouteSeconds = Math.Max(
            0,
            aircraft.PlannedArrivalAtSecond - aircraft.PlannedLaunchAtSecond);
        double routeProgress = totalRouteSeconds == 0
            ? 0
            : Math.Clamp(
                1.0 - aircraft.RouteSecondsRemaining / (double)totalRouteSeconds,
                0,
                1);
        MapPoint start = Point(aircraft.CurrentLocationId);
        MapPoint? target = aircraft.TargetLocationId is null
            ? null
            : Point(aircraft.TargetLocationId);
        MapPoint position = target is null
            ? start
            : new(
                start.X + (target.X - start.X) * routeProgress,
                start.Y + (target.Y - start.Y) * routeProgress);

        return new MedevacAircraftState(
            aircraft.Callsign,
            Upper(aircraft.Phase),
            aircraft.CurrentLocationId,
            locations.GetValueOrDefault(aircraft.CurrentLocationId)?.Label
                ?? aircraft.CurrentLocationId,
            aircraft.TargetLocationId,
            aircraft.TargetLocationId is null
                ? null
                : locations.GetValueOrDefault(aircraft.TargetLocationId)?.Label
                    ?? aircraft.TargetLocationId,
            aircraft.AssignedRequestId,
            aircraft.ReceivingFacilityId,
            aircraft.RouteSecondsRemaining,
            routeProgress,
            position,
            target,
            aircraft.PatientPodCapacity,
            aircraft.OnboardRequestIds.ToArray(),
            aircraft.OnboardPatientIds.ToArray(),
            aircraft.OnboardPodIds.ToArray(),
            aircraft.DeliveryRequestIds.ToArray(),
            aircraft.ImmediateThreatHoldSeconds,
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver
                    ? "ROUTE HOLD / MEDICAL RECONSIDERATION"
                    : AircraftStatus(aircraft.Phase),
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver
                    ? "Flight automation is holding the committed pickup route until the commander resolves the new observed report."
                    : AircraftDetail(aircraft, locations));
    }

    static MedevacRendezvousState BuildRendezvous(
        EvacuationRequestSnapshot? request,
        EvacuationRequestDefinition? definition,
        MedevacEvacuationSnapshot snapshot) {
        if (request is null || definition is null)
            return new(false, null, null, null, null, null,
                "NONE", 0, 0, "No pickup is currently assigned.",
                "Empty pods continue independently.");

        int readyAt = request.ActualPodReadyAtSecond
            ?? request.EstimatedPodReadyAtSecond;
        int siteLegSeconds = definition.PickupMethod == PickupMethod.RemoteExtractionToSafeZone
            ? definition.ExtractionOutboundSeconds
            : Math.Max(0,
                snapshot.AirAmbulance.PlannedArrivalAtSecond
                    - snapshot.AirAmbulance.PlannedLaunchAtSecond);
        int meetAt = PickupMeetAt(
            request,
            definition,
            snapshot,
            readyAt,
            siteLegSeconds);
        int delta = meetAt - readyAt;
        string status = delta < -2 ? "EARLY" : delta > 2 ? "LATE" : "SYNCHRONIZED";
        int exposure = definition.PickupMethod == PickupMethod.DirectAircraftPickup
            ? Math.Max(0, -delta)
            : 0;

        return new(
            true,
            request.Id,
            request.PodId,
            Math.Max(0, meetAt - snapshot.ElapsedSeconds),
            Math.Max(0, readyAt - snapshot.ElapsedSeconds),
            delta,
            status,
            exposure,
            Math.Max(0, delta),
            definition.PickupMethod == PickupMethod.RemoteExtractionToSafeZone
                ? "Remote extractor rendezvous"
                : "Aircraft-to-pod rendezvous",
            $"Latest plan meets {request.Label} at the site; preparation confidence is not provided.");
    }

    static int PickupMeetAt(
        EvacuationRequestSnapshot request,
        EvacuationRequestDefinition definition,
        MedevacEvacuationSnapshot snapshot,
        int readyAt,
        int siteLegSeconds) {
        MedevacChainEvent? completedMeet = definition.PickupMethod
            == PickupMethod.RemoteExtractionToSafeZone
                ? snapshot.Events.LastOrDefault(item =>
                    item.Code == "extraction.pod-attached"
                    && StringComparer.Ordinal.Equals(item.RequestId, request.Id))
                : snapshot.Events.LastOrDefault(item =>
                    item.Code == "air-ambulance.arrived-pickup"
                    && StringComparer.Ordinal.Equals(item.RequestId, request.Id));
        if (completedMeet is not null) return completedMeet.ElapsedSeconds;

        if (definition.PickupMethod == PickupMethod.RemoteExtractionToSafeZone) {
            ExtractionDroneSnapshot extraction = request.Extraction;
            if (extraction.Phase == ExtractionDronePhase.WaitingForPod) {
                MedevacChainEvent? arrived = snapshot.Events.LastOrDefault(item =>
                    item.Code == "extraction.waiting-for-pod"
                    && StringComparer.Ordinal.Equals(item.RequestId, request.Id));
                if (arrived is not null) return arrived.ElapsedSeconds;
            }
            if (extraction.Phase is ExtractionDronePhase.OutboundToSite
                or ExtractionDronePhase.AwaitingCommanderControlDecision)
                return checked(snapshot.ElapsedSeconds
                    + extraction.LegSecondsRemaining);
            if (extraction.Phase == ExtractionDronePhase.ReturningWithPod)
                return readyAt;
        }
        else if (snapshot.AirAmbulance.Phase
            == AirAmbulancePhase.EnroutePickup) {
            return checked(snapshot.ElapsedSeconds
                + snapshot.AirAmbulance.RouteSecondsRemaining);
        }

        if (snapshot.AirAmbulance.Phase == AirAmbulancePhase.EnrouteSafeStaging) {
            int stageAvailableAt = checked(snapshot.ElapsedSeconds
                + snapshot.AirAmbulance.RouteSecondsRemaining);
            return checked(
                Math.Max(stageAvailableAt, readyAt - siteLegSeconds)
                + siteLegSeconds);
        }

        if (snapshot.AirAmbulance.PlannedLaunchAtSecond > 0
            || snapshot.AirAmbulance.Phase
                == AirAmbulancePhase.HoldingAtSafeStaging) {
            return definition.PickupMethod == PickupMethod.RemoteExtractionToSafeZone
                ? checked(snapshot.AirAmbulance.PlannedLaunchAtSecond
                    + definition.ExtractionOutboundSeconds)
                : snapshot.AirAmbulance.PlannedArrivalAtSecond;
        }

        return checked(
            Math.Max(snapshot.ElapsedSeconds, readyAt - siteLegSeconds)
            + siteLegSeconds);
    }

    static MedevacExtractionState BuildExtraction(
        EvacuationRequestSnapshot? request,
        EvacuationRequestDefinition? definition,
        MedevacEvacuationSnapshot snapshot) {
        if (request is null || definition is null
            || request.PickupMethod != PickupMethod.RemoteExtractionToSafeZone) {
            return MedevacExtractionState.Standby;
        }

        ExtractionDroneSnapshot drone = request.Extraction;
        string mode = Upper(drone.ControlMode);
        bool rfActive = drone.ControlMode is
            ExtractionControlMode.RfFallback or ExtractionControlMode.ShortRangeRepeater;
        string risk = drone.ControlMode switch {
            ExtractionControlMode.RfFallback => "ELEVATED_ABSTRACT",
            ExtractionControlMode.ShortRangeRepeater => "REDUCED_BUT_PRESENT",
            ExtractionControlMode.Fibre or ExtractionControlMode.Autonomous
                => "NO_COMMAND_RF",
            _ => "UNKNOWN"
        };
        string autonomyStatus = drone.Phase ==
            ExtractionDronePhase.AwaitingCommanderControlDecision
                ? "BLOCKED"
                : drone.ControlMode == ExtractionControlMode.Autonomous
                    ? "ACTIVE"
                    : "AVAILABLE";
        MapPoint stage = Point(definition.StagingLocationId);
        MapPoint site = Point(definition.SiteLocationId);
        double legTotal = drone.Phase == ExtractionDronePhase.ReturningWithPod
            ? definition.ExtractionInboundSeconds
            : definition.ExtractionOutboundSeconds;
        double legProgress = legTotal <= 0
            ? 0
            : Math.Clamp(1 - drone.LegSecondsRemaining / legTotal, 0, 1);
        MapPoint mapPosition = drone.Phase == ExtractionDronePhase.ReturningWithPod
            ? Lerp(site, stage, legProgress)
            : Lerp(stage, site, legProgress);

        return new(
            true,
            $"EXTRACT-{request.Id}",
            request.Id,
            Upper(drone.Phase),
            mode,
            mapPosition,
            new(
                mode,
                drone.ControlMode == ExtractionControlMode.Fibre ? "INTACT" : "NOT_IN_USE",
                null,
                rfActive ? "ACTIVE" : "DARK",
                risk),
            new(
                true,
                autonomyStatus,
                "NOT_PROVIDED",
                drone.RfCommandRequired ? "ROUTE_OBSTRUCTION" : null),
            new(
                drone.RepeaterAvailable,
                drone.RepeaterWasEjected,
                null),
            new(false, "DUSTOFF"),
            drone.RfCommandRequired,
            risk);
    }

    static MedevacReceiverState BuildReceiver(
        ReceivingFacilitySnapshot facility,
        string currentLocationId,
        MedevacScenarioDefinition definition,
        MedevacEvacuationSnapshot snapshot) {
        DeliveryCandidateSnapshot? dominant = DominantCandidate(
            snapshot.DeliveryCandidates,
            facility.Id);
        FacilitySuitability suitability = dominant?.Suitability
            ?? facility.SuitabilityForCurrentLoad;
        ReceivingCapability missing = dominant?.MissingCapabilities
            ?? facility.MissingCapabilities;
        string[] missingCapabilities =
            suitability == FacilitySuitability.RelayNotAppropriate
                ? Array.Empty<string>()
                : CapabilityNames(missing);
        return new(
            facility.Id,
            facility.Label,
            facility.LocationId,
            Upper(facility.Kind),
            CapabilityNames(facility.AvailableCapabilities),
            Upper(suitability),
            missingCapabilities,
            TryTravelSeconds(currentLocationId, facility.LocationId, definition),
            ReceiverStatus(suitability),
            Point(facility.LocationId),
            dominant is null ? null : BuildDeliveryCandidate(dominant, snapshot));
    }

    static DeliveryCandidateSnapshot? DominantCandidate(
        IReadOnlyList<DeliveryCandidateSnapshot> candidates,
        string receiverId) {
        DeliveryCandidateSnapshot[] receiverCandidates = candidates
            .Where(candidate => StringComparer.Ordinal.Equals(
                candidate.ReceivingFacilityId,
                receiverId))
            .ToArray();
        DeliveryCandidateSnapshot[] suitable = receiverCandidates
            .Where(candidate => candidate.Suitability
                == FacilitySuitability.Suitable)
            .ToArray();
        IReadOnlyList<DeliveryCandidateSnapshot> pool =
            suitable.Length > 0 ? suitable : receiverCandidates;
        return pool
            .OrderByDescending(candidate => candidate.RequestIds.Count)
            .ThenBy(candidate => string.Join(",", candidate.RequestIds),
                StringComparer.Ordinal)
            .FirstOrDefault();
    }

    static MedevacDeliveryCandidateState BuildDeliveryCandidate(
        DeliveryCandidateSnapshot candidate,
        MedevacEvacuationSnapshot snapshot) {
        var selected = candidate.RequestIds.ToHashSet(StringComparer.Ordinal);
        string[] remainingRequestIds = snapshot.AirAmbulance.OnboardRequestIds
            .Where(requestId => !selected.Contains(requestId))
            .ToArray();
        string[] remainingPatientIds = PatientIds(snapshot, remainingRequestIds);
        string[] remainingPodIds = PodIds(snapshot, remainingRequestIds);
        return new(
            candidate.ReceivingFacilityId,
            candidate.RequestIds.ToArray(),
            candidate.PatientIds.ToArray(),
            candidate.PodIds.ToArray(),
            remainingRequestIds,
            remainingPatientIds,
            remainingPodIds,
            Upper(candidate.Suitability),
            candidate.Suitability == FacilitySuitability.RelayNotAppropriate
                ? Array.Empty<string>()
                : CapabilityNames(candidate.MissingCapabilities),
            TransferCopy(
                candidate.PodIds,
                candidate.PatientIds,
                remainingPodIds,
                remainingPatientIds));
    }

    static DecisionBuild BuildDecision(
        MedevacScenarioDefinition definition,
        MedevacEvacuationSnapshot snapshot,
        IReadOnlyList<MedevacRequestState> requests,
        IReadOnlyList<MedevacReceiverState> receivers,
        MedevacExtractionState extraction) {
        var options = new List<MedevacDecisionOption>();
        string kind;
        string title;
        string prompt;

        if (snapshot.Lifecycle == MedevacMissionLifecycle.Ready) {
            kind = "MISSION_START";
            title = requests.Count == 1
                ? "Task the active pickup"
                : "Choose the first active pickup";
            prompt = requests.Count == 1
                ? "The active call's empty pod will dispatch autonomously. Stage the air ambulance to meet it."
                : "Active calls dispatch empty pods autonomously. Select where the air ambulance stages first.";
            for (int index = 0; index < requests.Count; index++) {
                MedevacRequestState request = requests[index];
                options.Add(BuildOption(
                    snapshot,
                    $"begin:{request.Id}",
                    request.Label,
                    $"{Words(request.PickupMethod)} · pod estimate T+{Clock(request.EstimatedPodReadyAtS)}",
                    "mission.begin",
                    $"TASK {request.Label}",
                    "DISPATCH PODS / STAGE AIR AMBULANCE",
                    recommended: index == 0,
                    observedRiskBand: request.MissionType,
                    requestIds: new[] { request.Id }));
            }
        }
        else if (extraction.RfCommandRequired) {
            kind = "EXTRACTION_CONTROL";
            title = "Extraction control is blocked";
            prompt = "Fibre is gone and bounded autonomy cannot continue. Deliberate radio control is available.";
            options.Add(BuildOption(
                snapshot,
                $"rf:{extraction.ActiveRequestId}",
                "Authorise radio fallback",
                "Restores control while adding abstract electromagnetic exposure.",
                "extraction.authorize-rf",
                "ACKNOWLEDGE AND TRANSMIT",
                "DELIBERATE RF CONTROL",
                recommended: true,
                requiresAcknowledgement: true,
                challenge: new(
                    true,
                    "Commander, radio changes the threat picture.",
                    "Autonomy is blocked. Radio can recover the pod, but it creates observable exposure.",
                    "The simulation tracks only abstract exposure; it does not predict detection."),
                observedRiskBand: "ELEVATED_ABSTRACT",
                requestIds: extraction.ActiveRequestId is null
                    ? Array.Empty<string>()
                    : new[] { extraction.ActiveRequestId }));
        }
        else if (extraction.Repeater.Available
            && extraction.Link.Mode == "RF_FALLBACK") {
            kind = "EXTRACTION_CONTROL";
            title = "Radio control is active";
            prompt = "A one-shot short-range repeater can reduce—but not erase—the abstract exposure rate.";
            options.Add(BuildOption(
                snapshot,
                $"repeater:{extraction.ActiveRequestId}",
                "Eject short-range repeater",
                "Consumes the available repeater and changes the control path.",
                "extraction.deploy-repeater",
                "EJECT REPEATER",
                "ONE CONSUMABLE / LOCAL CONTROL",
                recommended: true,
                observedRiskBand: "REDUCED_BUT_PRESENT",
                requestIds: extraction.ActiveRequestId is null
                    ? Array.Empty<string>()
                    : new[] { extraction.ActiveRequestId }));
        }
        else if (snapshot.CommanderDecision.Kind
            == CommanderDecisionKind.ReconsiderCollectOrDeliver) {
            kind = "COLLECTION_REVIEW";
            title = "New report — collect or divert";
            prompt = "The committed pickup route is paused. Decide whether to continue for the second pod or divert the onboard pod now.";

            string committedRequestId =
                snapshot.CommanderDecision.CommittedCollectionRequestId
                ?? throw new InvalidOperationException(
                    "Collection review is missing its committed request.");
            string reconsiderationRequestId =
                snapshot.CommanderDecision.ReconsiderationRequestId
                ?? throw new InvalidOperationException(
                    "Collection review is missing its triggering request.");
            MedevacRequestState committed = requests.Single(request =>
                StringComparer.Ordinal.Equals(request.Id, committedRequestId));
            MedevacRequestState trigger = requests.Single(request =>
                StringComparer.Ordinal.Equals(request.Id, reconsiderationRequestId));
            options.Add(BuildOption(
                snapshot,
                $"continue:{committedRequestId}:{reconsiderationRequestId}",
                $"Continue to {committed.Label}",
                $"{committed.PodId} remains the committed pickup; acknowledge the new report for {trigger.PatientId}.",
                "decision.continue-collection",
                "ACKNOWLEDGE AND CONTINUE",
                $"RESUME ROUTE TO {committed.PodId}",
                requiresAcknowledgement: true,
                challenge: new(
                    true,
                    "Commander, the onboard report changed before the next pickup.",
                    $"{trigger.PatientId} in {trigger.PodId} is now reported {Words(trigger.Medical?.Trend ?? "UNKNOWN")}. The route is holding.",
                    $"Continuing adds {committed.PodId}; diverting leaves {committedRequestId} uncollected for now."),
                observedRiskBand: "MEDICAL_RECONSIDERATION",
                requestIds: new[] { committedRequestId },
                committedCollectionRequestId: committedRequestId,
                reconsiderationRequestId: reconsiderationRequestId));

            MedevacReceiverState? recommendedDiversion =
                RecommendedDelivery(receivers);
            foreach (MedevacReceiverState receiver in receivers) {
                if (receiver.DominantCandidate is not { } candidate) continue;
                bool suitable = candidate.Suitability == "SUITABLE";
                bool challenge = !suitable;
                string gap = ReceiverGap(candidate);
                options.Add(BuildOption(
                    snapshot,
                    $"divert:{receiver.Id}:{string.Join("+", candidate.RequestIds)}",
                    $"Divert to {receiver.Label}",
                    $"{Clock(receiver.EtaS)} · {gap} · {candidate.TransferSummary}",
                    "decision.deliver",
                    challenge
                        ? "ACKNOWLEDGE GAP AND DIVERT"
                        : $"DIVERT TO {receiver.Label}",
                    $"{candidate.TransferSummary} {committed.PodId} remains uncollected.",
                    recommended: ReferenceEquals(receiver, recommendedDiversion),
                    requiresAcknowledgement: challenge,
                    challenge: challenge
                        ? DeliveryChallenge(gap)
                        : null,
                    observedRiskBand: suitable
                        ? "CAPABILITY_MATCH"
                        : "CAPABILITY_GAP",
                    receiverId: receiver.Id,
                    requestIds: candidate.RequestIds,
                    remainingRequestIds: candidate.RemainingRequestIds,
                    committedCollectionRequestId: committedRequestId,
                    reconsiderationRequestId: reconsiderationRequestId));
            }
        }
        else if (snapshot.CommanderDecision.Kind is
            CommanderDecisionKind.CollectNextOrDeliver
            or CommanderDecisionKind.ChooseReceivingFacility) {
            bool hasLoad = snapshot.AirAmbulance.OnboardRequestIds.Count > 0;
            bool collectAllowed = snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.CollectNextOrDeliver;
            kind = hasLoad ? "COLLECT_OR_DELIVER" : "PICKUP_ASSIGNMENT";
            title = hasLoad ? "Collect again or deliver" : "Task the remaining call";
            prompt = hasLoad
                ? "Compare the onboard assessment with the next ready pod, receiver capability, route time, and transfer option."
                : "The aircraft is clear of patient custody and available for another pickup.";

            foreach (string requestId in snapshot.CommanderDecision.CollectableRequestIds) {
                MedevacRequestState request = requests.Single(item => item.Id == requestId);
                bool urgent = request.Medical?.Urgency is "URGENT" or "IMMEDIATE";
                options.Add(BuildOption(
                    snapshot,
                    $"collect:{request.Id}",
                    $"Collect {request.Label}",
                    $"{Words(request.PodPhase)} · {Words(request.MissionType)} pickup",
                    "decision.collect",
                    $"TASK {request.Label}",
                    "USE NEXT PATIENT COUPLING",
                    enabled: collectAllowed,
                    disabledReason: collectAllowed
                        ? null
                        : "AIRCRAFT POD CAPACITY REACHED",
                    recommended: urgent || !hasLoad,
                    observedRiskBand: request.MissionType,
                    requestIds: new[] { request.Id }));
            }

            if (hasLoad) {
                MedevacReceiverState? recommendedDelivery =
                    options.Any(option => option.Recommended)
                        ? null
                        : RecommendedDelivery(receivers);
                foreach (MedevacReceiverState receiver in receivers) {
                    if (receiver.DominantCandidate is not { } candidate) continue;
                    bool suitable = candidate.Suitability == "SUITABLE";
                    bool challenge = !suitable;
                    string gap = ReceiverGap(candidate);
                    options.Add(BuildOption(
                        snapshot,
                        $"deliver:{receiver.Id}:{string.Join("+", candidate.RequestIds)}",
                        receiver.Label,
                        $"{Clock(receiver.EtaS)} · {gap} · {candidate.TransferSummary}",
                        "decision.deliver",
                        challenge
                            ? "ACKNOWLEDGE GAP AND DELIVER"
                            : $"DELIVER TO {receiver.Label}",
                        candidate.TransferSummary,
                        recommended: ReferenceEquals(
                            receiver,
                            recommendedDelivery),
                        requiresAcknowledgement: challenge,
                        challenge: challenge ? DeliveryChallenge(gap) : null,
                        observedRiskBand: suitable
                            ? "CAPABILITY_MATCH"
                            : "CAPABILITY_GAP",
                        receiverId: receiver.Id,
                        requestIds: candidate.RequestIds,
                        remainingRequestIds: candidate.RemainingRequestIds));
                }
            }
        }
        else if (snapshot.Lifecycle == MedevacMissionLifecycle.Complete) {
            kind = "COMPLETE";
            title = "Mission complete";
            prompt = "All patient pods have left air-ambulance custody.";
        }
        else {
            kind = "AUTOMATION";
            title = "Automation in progress";
            prompt = AutomationPrompt(snapshot.AirAmbulance.Phase);
        }

        string id = BuildDecisionId(snapshot, kind, options);
        return new(id, kind, title, prompt, options.ToArray());
    }

    static MedevacDecisionOption BuildOption(
        MedevacEvacuationSnapshot snapshot,
        string id,
        string label,
        string detail,
        string commandId,
        string commitLabel,
        string commitDetail,
        bool enabled = true,
        string? disabledReason = null,
        bool recommended = false,
        bool requiresAcknowledgement = false,
        MedevacCrmChallenge? challenge = null,
        string observedRiskBand = "NONE",
        string? receiverId = null,
        IReadOnlyList<string>? requestIds = null,
        IReadOnlyList<string>? remainingRequestIds = null,
        string? committedCollectionRequestId = null,
        string? reconsiderationRequestId = null) {
        string[] selected = requestIds?.ToArray() ?? Array.Empty<string>();
        string[] remaining =
            remainingRequestIds?.ToArray() ?? Array.Empty<string>();
        return new(
            id,
            label,
            detail,
            commandId,
            commitLabel,
            commitDetail,
            enabled,
            disabledReason,
            recommended,
            requiresAcknowledgement,
            challenge,
            observedRiskBand,
            receiverId,
            selected,
            PatientIds(snapshot, selected),
            PodIds(snapshot, selected),
            remaining,
            PatientIds(snapshot, remaining),
            PodIds(snapshot, remaining),
            committedCollectionRequestId,
            reconsiderationRequestId);
    }

    static MedevacReceiverState? RecommendedDelivery(
        IReadOnlyList<MedevacReceiverState> receivers) =>
        receivers
            .Where(receiver => receiver.DominantCandidate?.Suitability
                == "SUITABLE")
            .OrderByDescending(receiver =>
                receiver.DominantCandidate!.RequestIds.Length)
            .ThenByDescending(receiver =>
                receiver.Kind == "CLINICAL_FACILITY")
            .ThenByDescending(receiver => receiver.AvailableCapabilities.Length)
            .ThenBy(receiver => receiver.EtaS)
            .ThenBy(receiver => receiver.Id, StringComparer.Ordinal)
            .FirstOrDefault();

    static MedevacCrmChallenge DeliveryChallenge(string gap) =>
        new(
            true,
            "Commander, this receiver does not match the selected patient load.",
            $"Current advertisement: {gap}.",
            "A capability gap may still be accepted explicitly when delay or route risk makes it the least-bad option.");

    static string ReceiverGap(MedevacDeliveryCandidateState candidate) =>
        candidate.Suitability switch {
            "SUITABLE" => "capability match",
            "RELAY_NOT_APPROPRIATE" =>
                "selected patient load not relay eligible",
            _ when candidate.MissingCapabilities.Length > 0 =>
                $"missing {string.Join(", ", candidate.MissingCapabilities.Select(Words))}",
            _ => Words(candidate.Suitability).ToLowerInvariant()
        };

    static MedevacRearCrewState BuildRearCrew(
        MedevacEvacuationSnapshot snapshot,
        IReadOnlyList<MedevacRequestState> requests,
        IReadOnlyList<MedevacReceiverState> receivers,
        IReadOnlyList<MedevacDecisionOption> options) {
        MedevacDecisionOption? recommended = options.FirstOrDefault(option =>
            option.Recommended && option.Enabled);
        if (snapshot.Lifecycle == MedevacMissionLifecycle.Ready) {
            string activeCallText = requests.Count == 1
                ? "The active call is incomplete."
                : $"{requests.Count} active calls are incomplete.";
            return new(
                "ADVISORY",
                "REPORT",
                activeCallText,
                "I will work the patient once a loaded pod reaches us. Pick the first staging task from readiness, route, and exposure.",
                recommended?.Id,
                "The empty pods travel independently; neither aircraft coupling is occupied outbound.",
                "MONITOR POD PREPARATION",
                null);
        }
        if (snapshot.CommanderDecision.Kind
            == CommanderDecisionKind.ReconsiderCollectOrDeliver) {
            string reconsiderationRequestId =
                snapshot.CommanderDecision.ReconsiderationRequestId ?? "";
            string committedRequestId =
                snapshot.CommanderDecision.CommittedCollectionRequestId ?? "";
            MedevacRequestState? trigger = requests.FirstOrDefault(request =>
                StringComparer.Ordinal.Equals(
                    request.Id,
                    reconsiderationRequestId));
            MedevacRequestState? committed = requests.FirstOrDefault(request =>
                StringComparer.Ordinal.Equals(request.Id, committedRequestId));
            MedevacDecisionOption? diversion = options.FirstOrDefault(option =>
                option.Recommended
                && option.CommandId == "decision.deliver");
            string recommendation = diversion?.ReceiverId is string receiverId
                ? receivers.First(receiver =>
                    StringComparer.Ordinal.Equals(receiver.Id, receiverId)).Label
                : "the best matching receiver";
            var challenge = new MedevacCrmChallenge(
                true,
                "Commander, route hold — the onboard report changed.",
                $"{trigger?.PatientId ?? reconsiderationRequestId} in {trigger?.PodId ?? "the onboard pod"} has a new observed worsening report.",
                $"{committed?.PodId ?? committedRequestId} is still the committed pickup. Continuing requires explicit acknowledgement; diverting abandons that collection for now.");
            return new(
                "ADVISORY",
                "CHALLENGE",
                "Reconsider the committed pickup.",
                $"I recommend diversion to {recommendation}; flight automation is holding until you decide.",
                diversion?.Id,
                challenge.Rationale,
                "MAINTAIN ONBOARD SUPPORT / PREPARE EITHER HANDOFF OR SECOND COUPLING",
                challenge);
        }
        if (recommended is { CommandId: "extraction.authorize-rf" }) {
            return new(
                "ADVISORY",
                "CHALLENGE",
                "Control path blocked.",
                "Fibre failed and autonomy stopped at an obstruction. Radio can restore control, with abstract exposure.",
                recommended.Id,
                "No radio transmission starts until you explicitly authorise it.",
                "HOLD PATIENT SUPPORT AT RENDEZVOUS",
                recommended.Challenge);
        }
        if (recommended is { CommandId: "decision.collect" }) {
            string requestId = recommended.RequestIds.Single();
            MedevacRequestState request = requests.Single(item =>
                item.Id == requestId);
            return new(
                "ADVISORY",
                "RECOMMEND",
                $"I recommend collecting {request.Label}.",
                request.Medical is null
                    ? "The pod is available, but the current medical report remains incomplete."
                    : $"Latest observed status is {Words(request.Medical.Urgency)}, {Words(request.Medical.Trend)}.",
                recommended.Id,
                "One patient coupling remains available. Receiver choices remain yours.",
                "CONTINUE ONBOARD CARE",
                null);
        }
        if (recommended is { CommandId: "decision.deliver" }) {
            string receiverId = recommended.ReceiverId
                ?? throw new InvalidOperationException(
                    "A projected delivery option must own a receiver.");
            MedevacReceiverState receiver = receivers.Single(item =>
                item.Id == receiverId);
            return new(
                "ADVISORY",
                "RECOMMEND",
                $"I recommend {receiver.Label}.",
                recommended.CommitDetail,
                recommended.Id,
                "This recommendation uses the selected observed load and advertised receiver, not a hidden diagnosis.",
                "PREPARE RECEIVER HANDOFF",
                null);
        }
        if (snapshot.AirAmbulance.OnboardRequestIds.Count > 0) {
            return new(
                "ADVISORY",
                "REPORT",
                "Patient support is continuous.",
                "I am monitoring the loaded pod and will report an observed trend change.",
                recommended?.Id,
                "You retain destination and exposure authority.",
                "MONITOR AND REASSESS",
                null);
        }
        return new(
            "ADVISORY",
            "REPORT",
            "Rear crew standing by.",
            "Flight and pod automation are executing the last command.",
            recommended?.Id,
            "I will challenge a receiver gap or material extraction risk when it becomes visible.",
            "MONITOR MISSION PICTURE",
            null);
    }

    static MedevacConditionsState BuildConditions(
        MedevacEvacuationSnapshot snapshot,
        EvacuationRequestSnapshot? activeRequest,
        MedevacExtractionState extraction) {
        string threatLabel = snapshot.CurrentMissionKind == EvacuationMissionKind.Dustoff
            ? "IMMEDIATE"
            : activeRequest?.Threat.Timing == ThreatTiming.Potential
                ? "POTENTIAL"
                : "WATCH";
        string threatDetail = activeRequest is null
            ? "NO ACTIVE PICKUP THREAT"
            : $"{Upper(activeRequest.Threat.Timing)} / {Upper(activeRequest.Threat.Credibility)}";
        bool transmitting = extraction.Link.EmissionBand == "ACTIVE";
        return new(
            "NOT MODELLED",
            "FIRST SLICE / ROUTE WEATHER PENDING",
            "NOT MODELLED",
            "FLIGHT-PHYSICS INTEGRATION PENDING",
            threatLabel,
            threatDetail,
            transmitting ? "ACTIVE" : "DARK",
            transmitting
                ? $"{snapshot.RfExposureTrainingUnits} ABSTRACT EXPOSURE UNITS"
                : "NO COMMAND RF ACTIVE");
    }

    static string DecisionPhase(
        MedevacEvacuationSnapshot snapshot,
        MedevacExtractionState extraction) {
        if (snapshot.Lifecycle == MedevacMissionLifecycle.Complete) return "COMPLETE";
        if (snapshot.Lifecycle == MedevacMissionLifecycle.Ready) return "AWAITING_TASKING";
        if (extraction.RfCommandRequired) return "AWAITING_EXTRACTION_COMMAND";
        if (snapshot.CommanderDecision.Kind != CommanderDecisionKind.None)
            return "AWAITING_COMMANDER_DECISION";
        return Upper(snapshot.AirAmbulance.Phase);
    }

    static string BuildDecisionId(
        MedevacEvacuationSnapshot snapshot,
        string kind,
        IReadOnlyList<MedevacDecisionOption> options) =>
        string.Join(":", new[] {
            "M2",
            kind,
            Upper(snapshot.Lifecycle),
            Upper(snapshot.AirAmbulance.Phase),
            snapshot.AirAmbulance.AssignedRequestId ?? "NONE",
            string.Join(",", snapshot.AirAmbulance.OnboardRequestIds),
            string.Join(",", snapshot.AirAmbulance.OnboardPatientIds),
            string.Join(",", snapshot.AirAmbulance.OnboardPodIds),
            string.Join(",", snapshot.AirAmbulance.DeliveryRequestIds),
            Upper(snapshot.CommanderDecision.Kind),
            snapshot.CommanderDecision.CommittedCollectionRequestId ?? "NONE",
            snapshot.CommanderDecision.ReconsiderationRequestId ?? "NONE",
            (snapshot.Events.LastOrDefault()?.Sequence ?? 0)
                .ToString(System.Globalization.CultureInfo.InvariantCulture),
            string.Join(",", snapshot.Requests.Select(request =>
                $"{request.Id}-{request.PatientId}-{request.PodId}"
                + $"-{Upper(request.PodPhase)}"
                + $"-{Upper(request.Extraction.Phase)}"
                + $"-{Upper(request.Extraction.ControlMode)}"
                + $"-{Upper(request.PatientCustody.Custodian)}"
                + $"-{Upper(request.PatientCustody.Position)}"
                + $"-{request.PatientCustody.LocationId}"
                + $"-{Upper(request.PodCustody.Custodian)}"
                + $"-{Upper(request.PodCustody.Position)}"
                + $"-{request.PodCustody.LocationId}"
                + $"-{request.Medical?.RecordedAtSecond ?? -1}")),
            string.Join(",", snapshot.ReceivingFacilities.Select(facility =>
                $"{facility.Id}-{Upper(facility.SuitabilityForCurrentLoad)}"
                + $"-{(int)facility.MissingCapabilities}")),
            string.Join(",", snapshot.DeliveryCandidates.Select(candidate =>
                $"{candidate.ReceivingFacilityId}"
                + $"-{string.Join("+", candidate.RequestIds)}"
                + $"-{Upper(candidate.Suitability)}"
                + $"-{(int)candidate.MissingCapabilities}")),
            string.Join(",", options.Select(option =>
                $"{option.Id}-{option.Enabled}-{option.RequiresAcknowledgement}"
                + $"-{option.ReceiverId}"
                + $"-{string.Join("+", option.RequestIds)}"
                + $"-{string.Join("+", option.PatientIds)}"
                + $"-{string.Join("+", option.PodIds)}"))
        });

    static MedevacPrimaryAction ActionFor(MedevacDecisionOption option) =>
        new(
            option.Id,
            option.CommitLabel,
            option.CommitDetail,
            option.Enabled,
            option.RequiresAcknowledgement);

    static string[] PatientIds(
        MedevacEvacuationSnapshot snapshot,
        IReadOnlyList<string> requestIds) {
        Dictionary<string, EvacuationRequestSnapshot> lookup = snapshot.Requests
            .ToDictionary(request => request.Id, StringComparer.Ordinal);
        return requestIds
            .Select(requestId => lookup.TryGetValue(
                requestId,
                out EvacuationRequestSnapshot? request)
                    ? request.PatientId
                    : throw new InvalidOperationException(
                        $"Unknown request '{requestId}' in projected option."))
            .ToArray();
    }

    static string[] PodIds(
        MedevacEvacuationSnapshot snapshot,
        IReadOnlyList<string> requestIds) {
        Dictionary<string, EvacuationRequestSnapshot> lookup = snapshot.Requests
            .ToDictionary(request => request.Id, StringComparer.Ordinal);
        return requestIds
            .Select(requestId => lookup.TryGetValue(
                requestId,
                out EvacuationRequestSnapshot? request)
                    ? request.PodId
                    : throw new InvalidOperationException(
                        $"Unknown request '{requestId}' in projected option."))
            .ToArray();
    }

    static string TransferCopy(
        IReadOnlyList<string> transferPodIds,
        IReadOnlyList<string> transferPatientIds,
        IReadOnlyList<string> remainingPodIds,
        IReadOnlyList<string> remainingPatientIds) {
        string transfer = PairCopy(transferPodIds, transferPatientIds);
        string remaining = PairCopy(remainingPodIds, remainingPatientIds);
        return remainingPodIds.Count == 0
            ? $"Transfer {transfer}. No patient pod remains aboard."
            : $"Transfer {transfer}. {remaining} remains aboard.";
    }

    static string PairCopy(
        IReadOnlyList<string> podIds,
        IReadOnlyList<string> patientIds) =>
        string.Join(", ", podIds.Select((podId, index) =>
            $"{podId} / {patientIds[index]}"));

    static string[] CapabilityNames(ReceivingCapability capabilities) {
        if (capabilities == ReceivingCapability.None) return Array.Empty<string>();
        return Enum.GetValues<ReceivingCapability>()
            .Where(capability => capability != ReceivingCapability.None
                && capabilities.HasFlag(capability))
            .Select(Upper)
            .ToArray();
    }

    static string ReceiverStatus(FacilitySuitability suitability) =>
        suitability switch {
            FacilitySuitability.Suitable => "SELECTED LOAD CAPABILITY MATCH",
            FacilitySuitability.CapabilityMismatch => "OBSERVED CAPABILITY GAP",
            FacilitySuitability.RelayNotAppropriate => "SELECTED LOAD NOT RELAY ELIGIBLE",
            FacilitySuitability.MedicalAssessmentIncomplete =>
                "MEDICAL ASSESSMENT INCOMPLETE",
            FacilitySuitability.NoPatientsOnboard => "NO PATIENTS ONBOARD",
            _ => "SUITABILITY UNKNOWN"
        };

    static MedevacEventState BuildEvent(
        MedevacChainEvent item,
        IReadOnlyDictionary<string, EvacuationRequestDefinition> requests) {
        string? requestLabel = item.RequestId is string requestId
            && requests.TryGetValue(
                requestId,
                out EvacuationRequestDefinition? request)
                ? request.Label
                : null;
        MedevacDeliveryAuditState? delivery = item.DeliveryDecision is { } audit
            ? new(
                audit.ReceivingFacilityId,
                Upper(audit.Suitability),
                audit.Suitability == FacilitySuitability.RelayNotAppropriate
                    ? Array.Empty<string>()
                    : CapabilityNames(audit.MissingCapabilities),
                audit.MismatchAcknowledged,
                audit.SelectedRequestIds.ToArray(),
                audit.SelectedPatientIds.ToArray(),
                audit.SelectedPodIds.ToArray(),
                audit.AbandonedCollectionRequestId)
            : null;
        MedevacReconsiderationAuditState? reconsideration =
            item.ReconsiderationDecision is { } reconsiderationAudit
                ? new(
                    reconsiderationAudit.TriggeringRequestId,
                    reconsiderationAudit.CommittedCollectionRequestId,
                    reconsiderationAudit.WorseningAcknowledged)
                : null;
        string? message = delivery is not null
            ? DeliveryAuditMessage(item.Code, delivery)
            : reconsideration is not null
                ? $"Continued collection of {reconsideration.CommittedCollectionRequestId} after acknowledging the changed report for {reconsideration.TriggeringRequestId}."
                : null;
        return new(
            item.Sequence,
            item.ElapsedSeconds,
            item.Code,
            item.RequestId,
            requestLabel,
            item.LocationId,
            EventCategory(item.Code),
            message,
            delivery,
            reconsideration);
    }

    static string DeliveryAuditMessage(
        string code,
        MedevacDeliveryAuditState audit) {
        string selected = PairCopy(
            audit.SelectedPodIds,
            audit.SelectedPatientIds);
        string diversion = audit.AbandonedCollectionRequestId is null
            ? ""
            : $" Collection of {audit.AbandonedCollectionRequestId} was abandoned.";
        string acknowledgement = audit.MismatchAcknowledged
            ? " The capability gap was explicitly acknowledged."
            : "";
        return $"{(code.StartsWith("commander.divert", StringComparison.Ordinal) ? "Diverted" : "Delivered")} {selected} to {audit.ReceiverId}.{diversion}{acknowledgement}";
    }

    static string EventCategory(string code) {
        if (code.StartsWith("commander.", StringComparison.Ordinal)) return "COMMAND";
        if (code.StartsWith("medical.", StringComparison.Ordinal)) return "REAR CREW";
        if (code.StartsWith("pod.", StringComparison.Ordinal)
            || code.StartsWith("pod-", StringComparison.Ordinal))
            return "POD NETWORK";
        if (code.StartsWith("extraction.", StringComparison.Ordinal)) return "EXTRACTOR";
        if (code.StartsWith("air-ambulance.", StringComparison.Ordinal)) return "FLIGHT AUTO";
        return "DISPATCH";
    }

    static string AircraftStatus(AirAmbulancePhase phase) => phase switch {
        AirAmbulancePhase.Ready => "HOLDING / READY",
        AirAmbulancePhase.EnrouteSafeStaging => "EN ROUTE SAFE STAGING",
        AirAmbulancePhase.HoldingAtSafeStaging => "HOLDING OUTSIDE PICKUP THREAT",
        AirAmbulancePhase.EnroutePickup => "DIRECT PICKUP IN PROGRESS",
        AirAmbulancePhase.HoldingAtPickup => "HOLDING AT PICKUP",
        AirAmbulancePhase.AwaitingRemoteExtraction => "REMOTE EXTRACTION IN PROGRESS",
        AirAmbulancePhase.AwaitingCommanderDecision => "AWAITING COMMANDER INTENT",
        AirAmbulancePhase.EnrouteReceivingFacility => "EN ROUTE RECEIVER",
        AirAmbulancePhase.Complete => "MISSION COMPLETE",
        _ => Words(Upper(phase))
    };

    static string AircraftDetail(
        AirAmbulanceSnapshot aircraft,
        IReadOnlyDictionary<string, MedevacLocationDefinition> locations) =>
        aircraft.TargetLocationId is null
            ? $"Current: {locations.GetValueOrDefault(aircraft.CurrentLocationId)?.Label
                ?? aircraft.CurrentLocationId}"
            : $"Commanded: {locations.GetValueOrDefault(aircraft.TargetLocationId)?.Label
                ?? aircraft.TargetLocationId}";

    static string AutomationPrompt(AirAmbulancePhase phase) => phase switch {
        AirAmbulancePhase.EnrouteSafeStaging =>
            "Flight automation is moving the aircraft to the declared staging point.",
        AirAmbulancePhase.HoldingAtSafeStaging =>
            "Automation is holding outside the pickup while it synchronizes with pod readiness.",
        AirAmbulancePhase.AwaitingRemoteExtraction =>
            "The small extraction asset is working the last dangerous leg.",
        AirAmbulancePhase.EnroutePickup =>
            "Flight automation is executing the direct pickup route.",
        AirAmbulancePhase.EnrouteReceivingFacility =>
            "Flight automation is executing the receiver route while rear crew care continues.",
        _ => "The aircraft and pod network are executing the last commander intent."
    };

    static int TryTravelSeconds(
        string from,
        string to,
        MedevacScenarioDefinition definition) {
        try {
            return TravelSeconds(from, to, definition, null);
        }
        catch (InvalidOperationException) {
            return -1;
        }
    }

    static int TravelSeconds(
        string from,
        string to,
        MedevacScenarioDefinition? snapshotScenario,
        MedevacScenarioDefinition? fallbackDefinition) {
        MedevacScenarioDefinition definition = snapshotScenario
            ?? fallbackDefinition
            ?? throw new InvalidOperationException("A route definition is required.");
        if (StringComparer.Ordinal.Equals(from, to)) return 0;
        var best = definition.Locations.ToDictionary(
            location => location.Id,
            _ => int.MaxValue,
            StringComparer.Ordinal);
        best[from] = 0;
        var frontier = new PriorityQueue<string, int>();
        frontier.Enqueue(from, 0);
        while (frontier.TryDequeue(out string? current, out int distance)) {
            if (distance != best[current]) continue;
            if (StringComparer.Ordinal.Equals(current, to)) return distance;
            foreach (MedevacRouteDefinition route in definition.Routes) {
                string? next = null;
                if (StringComparer.Ordinal.Equals(route.FromLocationId, current))
                    next = route.ToLocationId;
                else if (route.Bidirectional
                    && StringComparer.Ordinal.Equals(route.ToLocationId, current))
                    next = route.FromLocationId;
                if (next is null) continue;
                int candidate = checked(distance + route.TravelSeconds);
                if (candidate >= best[next]) continue;
                best[next] = candidate;
                frontier.Enqueue(next, candidate);
            }
        }
        throw new InvalidOperationException($"No route from '{from}' to '{to}'.");
    }

    static MapPoint Lerp(MapPoint from, MapPoint to, double amount) =>
        new(
            from.X + (to.X - from.X) * amount,
            from.Y + (to.Y - from.Y) * amount);

    static MapPoint Point(string id) =>
        MapPoints.GetValueOrDefault(id) ?? MapPoints["AMB-BASE"];

    static string Clock(int seconds) =>
        seconds < 0 ? "ROUTE UNKNOWN" : $"{seconds / 60}:{seconds % 60:00}";
    static string Words(string value) => value.Replace('_', ' ');
    static string Upper<T>(T value) where T : struct, Enum =>
        ToUpperSnake(value.ToString());
    static string ToUpperSnake(string value) {
        if (string.IsNullOrEmpty(value)) return "";
        var output = new System.Text.StringBuilder(value.Length + 8);
        for (int index = 0; index < value.Length; index++) {
            char character = value[index];
            if (index > 0 && char.IsUpper(character)
                && (char.IsLower(value[index - 1])
                    || (index + 1 < value.Length && char.IsLower(value[index + 1]))))
                output.Append('_');
            output.Append(char.ToUpperInvariant(character));
        }
        return output.ToString();
    }

    sealed record DecisionBuild(
        string Id,
        string Kind,
        string Title,
        string Prompt,
        MedevacDecisionOption[] Options);
}

internal sealed record MedevacCommanderState(
    string SnapshotSchemaVersion,
    int Revision,
    string ScenarioId,
    string MissionLabel,
    int SimTimeS,
    string Lifecycle,
    string Phase,
    string MissionType,
    bool Paused,
    MedevacCommanderAuthority Commander,
    MedevacAircraftState Aircraft,
    MedevacConditionsState Conditions,
    MedevacRequestState[] Requests,
    MedevacPodDispatchState[] PodDispatches,
    MedevacRendezvousState Rendezvous,
    MedevacExtractionState Extraction,
    MedevacPatientState[] Patients,
    MedevacRearCrewState RearCrew,
    MedevacReceiverState[] Receivers,
    MedevacDecisionState Decision,
    MedevacPrimaryAction PrimaryAction,
    int RfExposureTrainingUnits,
    long EventCursor,
    MedevacEventState[] Events,
    MedevacDebriefState? Debrief,
    int? ReceiversUpdatedAgeS);

internal sealed record MedevacCommanderAuthority(string Role, string DecisionAuthority);
internal sealed record MapPoint(double X, double Y);

internal sealed record MedevacAircraftState(
    string Callsign,
    string Phase,
    string CurrentLocationId,
    string CurrentLocationLabel,
    string? TargetLocationId,
    string? TargetLocationLabel,
    string? AssignedRequestId,
    string? ReceivingFacilityId,
    int RouteSecondsRemaining,
    double RouteProgress,
    MapPoint MapPosition,
    MapPoint? TargetMapPosition,
    int PatientPodCapacity,
    string[] OnboardRequestIds,
    string[] OnboardPatientIds,
    string[] OnboardPodIds,
    string[] DeliveryRequestIds,
    int ImmediateThreatHoldS,
    string AutomationStatus,
    string AutomationDetail);

internal sealed record MedevacConditionsState(
    string WeatherLabel,
    string WeatherDetail,
    string WindLabel,
    string WindDetail,
    string ThreatLabel,
    string ThreatDetail,
    string EmissionLabel,
    string EmissionDetail);

internal sealed record MedevacRequestState(
    string Id,
    string PatientId,
    string Label,
    string PodId,
    string MissionType,
    string PickupMethod,
    string PodPhase,
    string CourierPhase,
    int EstimatedPodReadyAtS,
    int PodReadyInS,
    int? ActualPodReadyAtS,
    bool ReadyForCollection,
    bool SelectableForCollection,
    MedevacMedicalState? Medical,
    MedevacCustodyState PatientCustody,
    MedevacCustodyState PodCustody);

internal sealed record MedevacPodDispatchState(
    string PodId,
    string RequestId,
    string PatientId,
    string DeliveryMode,
    string DeliveryState,
    int ReadyEstimateS,
    int ReadyInS,
    int? ReadyWindowEarliestS,
    int? ReadyWindowLatestS,
    string ReadinessConfidence,
    string TelemetryState,
    MedevacCustodyState Custody);

internal sealed record MedevacCustodyState(
    string EntityId,
    string Custodian,
    string Position,
    string? LocationId,
    string? DestinationLocationId,
    string? VehicleId,
    string? ContainerPodId);

internal sealed record MedevacRendezvousState(
    bool Active,
    string? ActiveRequestId,
    string? ActivePodId,
    int? SystemEtaS,
    int? PodReadyInS,
    int? TimingDeltaS,
    string Status,
    int AircraftExposureSIfHold,
    int PodWaitSIfLate,
    string Title,
    string Detail);

internal sealed record MedevacExtractionState(
    bool Active,
    string AssetId,
    string? ActiveRequestId,
    string Stage,
    string ControlMode,
    MapPoint? MapPosition,
    MedevacExtractionLinkState Link,
    MedevacExtractionAutonomyState Autonomy,
    MedevacExtractionRepeaterState Repeater,
    MedevacDirectBusState BusDirect,
    bool RfCommandRequired,
    string ObservedRiskBand) {

    public static MedevacExtractionState Standby { get; } = new(
        false,
        "EXTRACT-STANDBY",
        null,
        "STANDBY",
        "NONE",
        null,
        new("NONE", "NOT_IN_USE", null, "DARK", "UNKNOWN"),
        new(true, "STANDBY", "NOT_PROVIDED", null),
        new(false, false, null),
        new(false, "DUSTOFF"),
        false,
        "UNKNOWN");
}

internal sealed record MedevacExtractionLinkState(
    string Mode,
    string Integrity,
    int? FibreRemainingM,
    string EmissionBand,
    string DetectionRiskBand);
internal sealed record MedevacExtractionAutonomyState(
    bool Available,
    string Status,
    string RouteConfidence,
    string? BlockedReason);
internal sealed record MedevacExtractionRepeaterState(
    bool Available,
    bool Deployed,
    int? LocalRangeM);
internal sealed record MedevacDirectBusState(bool Available, string MissionTypeIfCommitted);

internal sealed record MedevacPatientState(
    string Id,
    string RequestId,
    string CallLabel,
    string PodId,
    string EvidenceLabel,
    MedevacMedicalState? Medical,
    MedevacCustodyState Custody,
    MedevacCustodyState PodCustody);

internal sealed record MedevacMedicalState(
    string Urgency,
    string Trend,
    string Airway,
    string Breathing,
    string Circulation,
    string Temperature,
    string[] RequestedCapabilities,
    bool TransportRelayEligible,
    int RecordedAtS,
    int AgeS,
    string Source,
    string Confidence);

internal sealed record MedevacRearCrewState(
    string Authority,
    string Priority,
    string Title,
    string Report,
    string? RecommendationOptionId,
    string Rationale,
    string Task,
    MedevacCrmChallenge? Challenge);

internal sealed record MedevacCrmChallenge(
    bool Active,
    string Title,
    string Report,
    string Rationale);

internal sealed record MedevacReceiverState(
    string Id,
    string Label,
    string LocationId,
    string Kind,
    string[] AvailableCapabilities,
    string Suitability,
    string[] MissingCapabilities,
    int EtaS,
    string StatusDetail,
    MapPoint MapPosition,
    MedevacDeliveryCandidateState? DominantCandidate);

internal sealed record MedevacDeliveryCandidateState(
    string ReceiverId,
    string[] RequestIds,
    string[] PatientIds,
    string[] PodIds,
    string[] RemainingRequestIds,
    string[] RemainingPatientIds,
    string[] RemainingPodIds,
    string Suitability,
    string[] MissingCapabilities,
    string TransferSummary);

internal sealed record MedevacDecisionState(
    string Id,
    string Kind,
    string Title,
    string Prompt,
    string? SelectedOptionId,
    MedevacDecisionOption[] Options);

internal sealed record MedevacDecisionOption(
    string Id,
    string Label,
    string Detail,
    string CommandId,
    string CommitLabel,
    string CommitDetail,
    bool Enabled,
    string? DisabledReason,
    bool Recommended,
    bool RequiresAcknowledgement,
    MedevacCrmChallenge? Challenge,
    string ObservedRiskBand,
    string? ReceiverId,
    string[] RequestIds,
    string[] PatientIds,
    string[] PodIds,
    string[] RemainingRequestIds,
    string[] RemainingPatientIds,
    string[] RemainingPodIds,
    string? CommittedCollectionRequestId,
    string? ReconsiderationRequestId);

internal sealed record MedevacPrimaryAction(
    string OptionId,
    string Label,
    string Detail,
    bool Enabled,
    bool RequiresAcknowledgement);

internal sealed record MedevacEventState(
    long Sequence,
    int ElapsedSeconds,
    string Code,
    string? RequestId,
    string? RequestLabel,
    string? LocationId,
    string Category,
    string? Message,
    MedevacDeliveryAuditState? DeliveryDecision,
    MedevacReconsiderationAuditState? ReconsiderationDecision);

internal sealed record MedevacDeliveryAuditState(
    string ReceiverId,
    string Suitability,
    string[] MissingCapabilities,
    bool MismatchAcknowledged,
    string[] SelectedRequestIds,
    string[] SelectedPatientIds,
    string[] SelectedPodIds,
    string? AbandonedCollectionRequestId);

internal sealed record MedevacReconsiderationAuditState(
    string TriggeringRequestId,
    string CommittedCollectionRequestId,
    bool WorseningAcknowledged);

internal sealed record MedevacDebriefState(
    string Summary,
    MedevacEventState[] Decisions);

internal sealed record MedevacDispatchResult(
    bool Accepted,
    string Code,
    string Message,
    int SnapshotRevision);
