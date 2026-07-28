using System.Text.Json;
using GunsOnly.Sim.Medevac;

namespace GunsOnly.Sim.Tests.Medevac;

public class MedevacEvacuationSessionTests {
    static readonly ObservedMedicalStatus SimpleStable = new(
        ObservedMedicalUrgency.Priority,
        ObservedMedicalTrend.Stable,
        ObservedSystemStatus.Acceptable,
        ObservedSystemStatus.Acceptable,
        ObservedSystemStatus.Acceptable,
        ObservedTemperatureStatus.Warm,
        ReceivingCapability.Resuscitation,
        TransportRelayEligible: true);

    static readonly ObservedMedicalStatus SurgicalNeed = new(
        ObservedMedicalUrgency.Urgent,
        ObservedMedicalTrend.Worsening,
        ObservedSystemStatus.Acceptable,
        ObservedSystemStatus.Concern,
        ObservedSystemStatus.Critical,
        ObservedTemperatureStatus.Cold,
        ReceivingCapability.Resuscitation
            | ReceivingCapability.BloodProducts
            | ReceivingCapability.DamageControlSurgery,
        TransportRelayEligible: false);

    static EvacuationRequestDefinition DirectRequest(
        string id = "A",
        string label = "CALL A",
        string site = "SITE-A",
        string staging = "BASE",
        ThreatAssessment? threat = null,
        IReadOnlyList<TimedMedicalReport>? reports = null) =>
        new(
            id,
            $"PATIENT-{id}",
            $"POD-{id}",
            label,
            site,
            staging,
            RequestTimeSeconds: 0,
            EmptyPodDeliverySeconds: 4,
            EmptyCourierReturnSeconds: 3,
            GroundLoadingSeconds: 6,
            PickupMethod.DirectAircraftPickup,
            ExtractionOutboundSeconds: 0,
            ExtractionInboundSeconds: 0,
            threat ?? new ThreatAssessment(
                ThreatTiming.Immediate, ThreatCredibility.Credible),
            new ExtractionFailurePlan(),
            reports ?? new[] { new TimedMedicalReport(0, SimpleStable) });

    static EvacuationRequestDefinition SecondDirectRequest() =>
        new(
            "C",
            "PATIENT-C",
            "POD-C",
            "CALL C",
            "SITE-B",
            "SAFE-W",
            RequestTimeSeconds: 0,
            EmptyPodDeliverySeconds: 4,
            EmptyCourierReturnSeconds: 3,
            GroundLoadingSeconds: 5,
            PickupMethod.DirectAircraftPickup,
            ExtractionOutboundSeconds: 0,
            ExtractionInboundSeconds: 0,
            new ThreatAssessment(
                ThreatTiming.Potential, ThreatCredibility.Credible),
            new ExtractionFailurePlan(),
            new[] { new TimedMedicalReport(0, SurgicalNeed) });

    static EvacuationRequestDefinition RemoteRequest() =>
        new(
            "B",
            "PATIENT-B",
            "POD-B",
            "CALL B",
            "SITE-B",
            "SAFE-W",
            RequestTimeSeconds: 0,
            EmptyPodDeliverySeconds: 5,
            EmptyCourierReturnSeconds: 3,
            GroundLoadingSeconds: 5,
            PickupMethod.RemoteExtractionToSafeZone,
            ExtractionOutboundSeconds: 4,
            ExtractionInboundSeconds: 4,
            new ThreatAssessment(
                ThreatTiming.Potential, ThreatCredibility.Credible),
            new ExtractionFailurePlan(
                FibreFailureAfterExtractionSeconds: 2,
                AutonomyBlockedAfterExtractionSeconds: 3,
                RepeaterControlSeconds: 10),
            new[] { new TimedMedicalReport(0, SurgicalNeed) });

    static MedevacScenarioDefinition Scenario(
        params EvacuationRequestDefinition[] requests) {
        MedevacLocationDefinition[] locations = {
            new("BASE", "DISPERSED AMBULANCE BASE", MedevacLocationKind.AmbulanceBase),
            new("SAFE-W", "SAFE ZONE WEST", MedevacLocationKind.SafeStaging),
            new("SITE-A", "CASUALTY SITE A", MedevacLocationKind.CasualtySite),
            new("SITE-B", "CASUALTY SITE B", MedevacLocationKind.CasualtySite),
            new("RELAY", "PATIENT TRANSPORT RELAY", MedevacLocationKind.TransportRelay),
            new("CLINIC", "LOCAL CLINICAL RECEIVER", MedevacLocationKind.ClinicalFacility),
            new("SURG", "LOCAL SURGICAL RECEIVER", MedevacLocationKind.ClinicalFacility)
        };
        MedevacRouteDefinition[] routes = {
            new("BASE", "SITE-A", 3),
            new("BASE", "SAFE-W", 2),
            new("SITE-A", "SAFE-W", 3),
            new("SAFE-W", "SITE-B", 4),
            new("SITE-A", "RELAY", 5),
            new("SITE-A", "CLINIC", 5),
            new("SITE-A", "SURG", 6),
            new("SAFE-W", "RELAY", 4),
            new("SAFE-W", "CLINIC", 4),
            new("SAFE-W", "SURG", 5)
        };
        ReceivingFacilityDefinition[] facilities = {
            new(
                "RELAY",
                "PATIENT TRANSPORT RELAY",
                "RELAY",
                ReceivingFacilityKind.TransportRelay,
                ReceivingCapability.PatientTransportRelay),
            new(
                "CLINIC",
                "LOCAL CLINICAL RECEIVER",
                "CLINIC",
                ReceivingFacilityKind.ClinicalFacility,
                ReceivingCapability.Resuscitation
                    | ReceivingCapability.BloodProducts
                    | ReceivingCapability.ActiveRewarming
                    | ReceivingCapability.MonitoredHolding),
            new(
                "SURG",
                "LOCAL SURGICAL RECEIVER",
                "SURG",
                ReceivingFacilityKind.ClinicalFacility,
                ReceivingCapability.Resuscitation
                    | ReceivingCapability.BloodProducts
                    | ReceivingCapability.DamageControlSurgery
                    | ReceivingCapability.ThoracicCare
                    | ReceivingCapability.DiagnosticImaging
                    | ReceivingCapability.ActiveRewarming
                    | ReceivingCapability.MonitoredHolding)
        };
        return new MedevacScenarioDefinition(
            "evac-chain-training-surrogate",
            "AMBULANCE 2",
            "BASE",
            locations,
            routes,
            facilities,
            requests);
    }

    static EvacuationRequestSnapshot Request(
        MedevacEvacuationSession session, string id) =>
        Assert.Single(session.Snapshot.Requests, request => request.Id == id);

    static ReceivingFacilitySnapshot Facility(
        MedevacEvacuationSession session, string id) =>
        Assert.Single(
            session.Snapshot.ReceivingFacilities,
            facility => facility.Id == id);

    static void AssertConserved(MedevacEvacuationSnapshot snapshot) {
        Assert.Equal(
            snapshot.Requests.Count,
            snapshot.Requests.Select(request => request.PatientId)
                .Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(
            snapshot.Requests.Count,
            snapshot.Requests.Select(request => request.PodId)
                .Distinct(StringComparer.Ordinal).Count());

        foreach (EvacuationRequestSnapshot request in snapshot.Requests) {
            Assert.Equal(request.PatientId, request.PatientCustody.EntityId);
            Assert.Equal(request.PodId, request.PodCustody.EntityId);
            AssertCustodyHasOnePlace(request.PatientCustody);
            AssertCustodyHasOnePlace(request.PodCustody);
            if (request.PodPhase is PatientPodPhase.ReadyAtSite
                or PatientPodPhase.OnExtractionDrone
                or PatientPodPhase.OnboardAirAmbulance
                or PatientPodPhase.TransferredToPatientTransport
                or PatientPodPhase.DeliveredToClinicalFacility)
                Assert.Equal(request.PodId, request.PatientCustody.ContainerPodId);
        }

        string[] onboardRequestIds = snapshot.Requests
            .Where(request =>
                request.PodPhase == PatientPodPhase.OnboardAirAmbulance)
            .Select(request => request.Id)
            .ToArray();
        Assert.Equal(onboardRequestIds, snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Equal(
            snapshot.AirAmbulance.OnboardRequestIds.Select(requestId =>
                Assert.Single(snapshot.Requests, request => request.Id == requestId)
                    .PatientId),
            snapshot.AirAmbulance.OnboardPatientIds);
        Assert.Equal(
            snapshot.AirAmbulance.OnboardRequestIds.Select(requestId =>
                Assert.Single(snapshot.Requests, request => request.Id == requestId)
                    .PodId),
            snapshot.AirAmbulance.OnboardPodIds);
    }

    static void AssertCustodyHasOnePlace(
        EvacuationEntityCustodySnapshot custody) {
        Assert.False(string.IsNullOrWhiteSpace(custody.EntityId));
        switch (custody.Position) {
            case EvacuationPositionKind.AtLocation:
                Assert.False(string.IsNullOrWhiteSpace(custody.LocationId));
                Assert.Null(custody.DestinationLocationId);
                Assert.Null(custody.VehicleId);
                break;
            case EvacuationPositionKind.InTransit:
                Assert.False(string.IsNullOrWhiteSpace(custody.LocationId));
                Assert.False(string.IsNullOrWhiteSpace(
                    custody.DestinationLocationId));
                Assert.False(string.IsNullOrWhiteSpace(custody.VehicleId));
                break;
            case EvacuationPositionKind.OnVehicle:
                Assert.False(string.IsNullOrWhiteSpace(custody.VehicleId));
                break;
            default:
                Assert.Fail("Unknown custody position.");
                break;
        }
    }

    static void AdvanceUntil(MedevacEvacuationSession session,
        Func<MedevacEvacuationSnapshot, bool> predicate,
        int maximumSeconds = 300) {
        for (int elapsed = 0; elapsed <= maximumSeconds; elapsed++) {
            if (predicate(session.Snapshot)) return;
            session.Advance();
        }
        Assert.Fail($"Condition was not reached in {maximumSeconds} simulated seconds.");
    }

    [Fact]
    public void BeginRejectsARequestThatHasNotActivated() {
        EvacuationRequestDefinition delayed = DirectRequest() with {
            RequestTimeSeconds = 8
        };
        var session = new MedevacEvacuationSession(Scenario(delayed));

        InvalidOperationException error = Assert.Throws<InvalidOperationException>(
            () => session.Begin(delayed.Id));

        Assert.Contains("not active", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(MedevacMissionLifecycle.Ready, session.Snapshot.Lifecycle);
        Assert.Equal(PatientPodPhase.AwaitingDispatch,
            Request(session, delayed.Id).PodPhase);
    }

    [Fact]
    public void EmptyPodDispatchAndAirAmbulanceArrivalAreJustInTime() {
        var session = new MedevacEvacuationSession(Scenario(DirectRequest()));

        session.Begin("A");
        MedevacEvacuationSnapshot launch = session.Snapshot;

        Assert.Equal(PatientPodPhase.UncrewedTransitToSite,
            Request(session, "A").PodPhase);
        Assert.Equal(PodCourierPhase.CarryingEmptyPodToSite,
            Request(session, "A").CourierPhase);
        Assert.Empty(launch.AirAmbulance.OnboardRequestIds);
        Assert.Equal(AirAmbulancePhase.HoldingAtSafeStaging,
            launch.AirAmbulance.Phase);
        Assert.Equal(7, launch.AirAmbulance.PlannedLaunchAtSecond);
        Assert.Equal(10, launch.AirAmbulance.PlannedArrivalAtSecond);

        session.Advance(4);
        Assert.Equal(PatientPodPhase.GroundLoading, Request(session, "A").PodPhase);
        Assert.Equal(PodCourierPhase.ReturningEmptyToDepot,
            Request(session, "A").CourierPhase);
        Assert.Empty(session.Snapshot.AirAmbulance.OnboardRequestIds);

        session.Advance(3);
        Assert.Equal(PodCourierPhase.Recovered, Request(session, "A").CourierPhase);
        Assert.Equal(AirAmbulancePhase.EnroutePickup,
            session.Snapshot.AirAmbulance.Phase);
        Assert.Equal(3, session.Snapshot.AirAmbulance.RouteSecondsRemaining);

        session.Advance(3);
        MedevacEvacuationSnapshot pickup = session.Snapshot;
        Assert.Equal(10, pickup.ElapsedSeconds);
        Assert.Equal(10, Request(session, "A").ActualPodReadyAtSecond);
        Assert.Equal(PatientPodPhase.OnboardAirAmbulance,
            Request(session, "A").PodPhase);
        Assert.Equal(new[] { "A" }, pickup.AirAmbulance.OnboardRequestIds);
        Assert.Equal(0, pickup.AirAmbulance.ImmediateThreatHoldSeconds);
        Assert.Equal(EvacuationMissionKind.Dustoff, pickup.CurrentMissionKind);
        Assert.Contains(pickup.Events,
            item => item.Code == "pod-courier.recovered-empty");
    }

    [Theory]
    [InlineData(ThreatTiming.None, ThreatCredibility.Unconfirmed,
        EvacuationMissionKind.Medevac)]
    [InlineData(ThreatTiming.Potential, ThreatCredibility.Credible,
        EvacuationMissionKind.Medevac)]
    [InlineData(ThreatTiming.Immediate, ThreatCredibility.Unconfirmed,
        EvacuationMissionKind.Medevac)]
    [InlineData(ThreatTiming.Immediate, ThreatCredibility.Credible,
        EvacuationMissionKind.Dustoff)]
    public void DustoffRequiresBothImmediateTimingAndCredibleThreat(
        ThreatTiming timing,
        ThreatCredibility credibility,
        EvacuationMissionKind expected) {
        var assessment = new ThreatAssessment(timing, credibility);

        Assert.Equal(expected, assessment.MissionKind);
    }

    [Fact]
    public void RemoteExtractionFallsBackWithoutSilentlyStartingRf() {
        var session = new MedevacEvacuationSession(Scenario(RemoteRequest()));
        session.Begin("B");

        session.Advance(2);
        Assert.Equal("SAFE-W", session.Snapshot.AirAmbulance.CurrentLocationId);
        Assert.Equal(AirAmbulancePhase.HoldingAtSafeStaging,
            session.Snapshot.AirAmbulance.Phase);
        Assert.Equal(6, session.Snapshot.AirAmbulance.PlannedLaunchAtSecond);

        session.Advance(4);
        Assert.Equal(ExtractionDronePhase.OutboundToSite,
            Request(session, "B").Extraction.Phase);
        Assert.Equal(ExtractionControlMode.Fibre,
            Request(session, "B").Extraction.ControlMode);

        session.Advance(2);
        Assert.Equal(ExtractionControlMode.Autonomous,
            Request(session, "B").Extraction.ControlMode);
        Assert.Equal(0, session.Snapshot.RfExposureTrainingUnits);

        session.Advance(1);
        ExtractionDroneSnapshot blocked = Request(session, "B").Extraction;
        Assert.Equal(ExtractionDronePhase.AwaitingCommanderControlDecision,
            blocked.Phase);
        Assert.Equal(ExtractionControlMode.Autonomous, blocked.ControlMode);
        Assert.True(blocked.RfCommandRequired);
        Assert.Equal(0, session.Snapshot.RfExposureTrainingUnits);
        Assert.Equal(EvacuationMissionKind.Medevac,
            session.Snapshot.CurrentMissionKind);

        session.Advance(5);
        Assert.Equal(0, session.Snapshot.RfExposureTrainingUnits);
        Assert.Throws<InvalidOperationException>(
            () => session.EjectShortRangeRepeater("B"));

        session.CommandRfFallback("B");
        session.Advance();
        Assert.Equal(ExtractionControlMode.RfFallback,
            Request(session, "B").Extraction.ControlMode);
        Assert.Equal(
            MedevacTrainingSurrogate.DirectRfExposureUnitsPerSecond,
            session.Snapshot.RfExposureTrainingUnits);

        session.EjectShortRangeRepeater("B");
        session.Advance();
        Assert.Equal(ExtractionControlMode.ShortRangeRepeater,
            Request(session, "B").Extraction.ControlMode);
        Assert.Equal(
            MedevacTrainingSurrogate.DirectRfExposureUnitsPerSecond
                + MedevacTrainingSurrogate.RepeaterRfExposureUnitsPerSecond,
            session.Snapshot.RfExposureTrainingUnits);
        Assert.Equal(PatientPodPhase.OnExtractionDrone,
            Request(session, "B").PodPhase);

        session.Advance(4);
        Assert.Equal(PatientPodPhase.OnboardAirAmbulance,
            Request(session, "B").PodPhase);
        Assert.Equal(new[] { "B" },
            session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Equal(9, session.Snapshot.RfExposureTrainingUnits);
    }

    [Fact]
    public void CommanderMayCollectASecondPodButCapacityThenForcesDelivery() {
        var session = new MedevacEvacuationSession(
            Scenario(DirectRequest(), SecondDirectRequest()));
        session.Begin("A");
        session.Advance(10);

        Assert.Equal(CommanderDecisionKind.CollectNextOrDeliver,
            session.Snapshot.CommanderDecision.Kind);
        Assert.Contains("C", session.Snapshot.CommanderDecision.CollectableRequestIds);

        session.ChooseCollectNext("C");
        session.Advance(7);

        Assert.Equal(new[] { "A", "C" },
            session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Equal(2, session.Snapshot.AirAmbulance.PatientPodCapacity);
        Assert.Equal(CommanderDecisionKind.ChooseReceivingFacility,
            session.Snapshot.CommanderDecision.Kind);
        Assert.Throws<InvalidOperationException>(
            () => session.ChooseCollectNext("A"));
    }

    [Fact]
    public void LocalCapabilitiesDistinguishTransportRelayFromClinicalCare() {
        var session = new MedevacEvacuationSession(
            Scenario(DirectRequest(), SecondDirectRequest()));
        session.Begin("A");
        session.Advance(10);
        session.ChooseCollectNext("C");
        session.Advance(7);

        Assert.Equal(FacilitySuitability.RelayNotAppropriate,
            Facility(session, "RELAY").SuitabilityForCurrentLoad);
        Assert.Equal(FacilitySuitability.CapabilityMismatch,
            Facility(session, "CLINIC").SuitabilityForCurrentLoad);
        Assert.Equal(ReceivingCapability.DamageControlSurgery,
            Facility(session, "CLINIC").MissingCapabilities);
        Assert.Equal(FacilitySuitability.Suitable,
            Facility(session, "SURG").SuitabilityForCurrentLoad);
        Assert.Throws<InvalidOperationException>(
            () => session.ChooseDelivery("CLINIC"));

        session.ChooseDelivery("SURG");
        session.Advance(9);

        Assert.Equal(MedevacMissionLifecycle.Complete, session.Lifecycle);
        Assert.All(session.Snapshot.Requests,
            request => Assert.Equal(
                PatientPodPhase.DeliveredToClinicalFacility, request.PodPhase));
    }

    [Fact]
    public void SimplePatientCanTransferAtRelayAndReleaseAirAmbulance() {
        var session = new MedevacEvacuationSession(Scenario(DirectRequest()));
        session.Begin("A");
        session.Advance(10);

        Assert.Equal(FacilitySuitability.Suitable,
            Facility(session, "RELAY").SuitabilityForCurrentLoad);
        session.ChooseDelivery("RELAY");
        Assert.Equal(EvacuationMissionKind.Medevac,
            session.Snapshot.CurrentMissionKind);
        session.Advance(5);

        Assert.Equal(MedevacMissionLifecycle.Complete, session.Lifecycle);
        Assert.Equal(PatientPodPhase.TransferredToPatientTransport,
            Request(session, "A").PodPhase);
        Assert.Empty(session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Contains(session.Snapshot.Events,
            item => item.Code == "pod.transferred-patient-transport");
    }

    [Fact]
    public void MedicalProjectionCarriesOnlyReportsAlreadyObserved() {
        ObservedMedicalStatus later = SimpleStable with {
            Trend = ObservedMedicalTrend.Worsening,
            Circulation = ObservedSystemStatus.Concern,
            RequestedReceivingCapabilities =
                ReceivingCapability.Resuscitation
                | ReceivingCapability.BloodProducts,
            TransportRelayEligible = false
        };
        EvacuationRequestDefinition request = DirectRequest(
            reports: new[] {
                new TimedMedicalReport(0, SimpleStable),
                new TimedMedicalReport(5, later)
            });
        var session = new MedevacEvacuationSession(Scenario(request));
        session.Begin("A");

        session.Advance(9);
        Assert.Null(Request(session, "A").Medical);

        session.Advance();
        MedicalObservationSnapshot initial =
            Assert.IsType<MedicalObservationSnapshot>(Request(session, "A").Medical);
        Assert.Equal(ObservedMedicalTrend.Stable, initial.Status.Trend);
        Assert.Equal(0, initial.AgeSeconds);

        session.Advance(4);
        Assert.Equal(ObservedMedicalTrend.Stable,
            Request(session, "A").Medical!.Status.Trend);
        Assert.Equal(4, Request(session, "A").Medical!.AgeSeconds);

        session.Advance();
        MedicalObservationSnapshot updated =
            Assert.IsType<MedicalObservationSnapshot>(Request(session, "A").Medical);
        Assert.Equal(ObservedMedicalTrend.Worsening, updated.Status.Trend);
        Assert.Equal(ObservedSystemStatus.Concern, updated.Status.Circulation);
        Assert.Equal(0, updated.AgeSeconds);

        string json = JsonSerializer.Serialize(session.Snapshot);
        Assert.DoesNotContain("HeartRate", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("BloodPressure", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Diagnosis", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Survival", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("MedicalReports", json, StringComparison.Ordinal);
    }

    [Fact]
    public void IdenticalCommandsProduceIdenticalSnapshotsAndEventOrder() {
        MedevacScenarioDefinition definition = Scenario(RemoteRequest());
        var a = new MedevacEvacuationSession(definition);
        var b = new MedevacEvacuationSession(definition);

        a.Begin("B");
        b.Begin("B");
        a.Advance(9);
        b.Advance(9);
        a.CommandRfFallback("B");
        b.CommandRfFallback("B");
        a.Advance();
        b.Advance();
        a.EjectShortRangeRepeater("B");
        b.EjectShortRangeRepeater("B");
        a.Advance(5);
        b.Advance(5);

        Assert.Equal(
            JsonSerializer.Serialize(a.Snapshot),
            JsonSerializer.Serialize(b.Snapshot));
    }

    [Fact]
    public void MismatchedReceiverRequiresAnExplicitCommanderOverride() {
        var session = new MedevacEvacuationSession(Scenario(SecondDirectRequest()));
        session.Begin("C");
        session.Advance(9);

        Assert.Equal(FacilitySuitability.CapabilityMismatch,
            Facility(session, "CLINIC").SuitabilityForCurrentLoad);
        Assert.Throws<InvalidOperationException>(
            () => session.ChooseDelivery("CLINIC"));

        session.ChooseDelivery("CLINIC", acknowledgeMismatch: true);
        Assert.Equal(AirAmbulancePhase.EnrouteReceivingFacility,
            session.Snapshot.AirAmbulance.Phase);
        Assert.Contains(session.Snapshot.Events,
            item => item.Code == "commander.deliver-override");
    }

    [Fact]
    public void BuiltInCommanderMissionRunsFirstPickupSecondPickupAndDelivery() {
        var session = new MedevacEvacuationSession(
            BuiltInMedevacScenarios.CommanderTraining);
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);

        AdvanceUntil(session, snapshot =>
            Request(session, BuiltInMedevacScenarios.FirstRequestId)
                .Extraction.RfCommandRequired);
        Assert.Equal(0, session.Snapshot.RfExposureTrainingUnits);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);

        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.CollectNextOrDeliver);
        Assert.Equal(
            new[] { BuiltInMedevacScenarios.FirstRequestId },
            session.Snapshot.AirAmbulance.OnboardRequestIds);

        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);
        Assert.Equal(
            BuiltInMedevacScenarios.FirstRequestId,
            session.Snapshot.CommanderDecision.ReconsiderationRequestId);
        session.ContinueCommittedCollection(acknowledgeReconsideration: true);
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ChooseReceivingFacility);
        Assert.Equal(
            new[] {
                BuiltInMedevacScenarios.FirstRequestId,
                BuiltInMedevacScenarios.SecondRequestId
            },
            session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Equal(
            FacilitySuitability.CapabilityMismatch,
            Facility(session, BuiltInMedevacScenarios.LocalHospitalId)
                .SuitabilityForCurrentLoad);
        Assert.Equal(
            FacilitySuitability.Suitable,
            Facility(session, BuiltInMedevacScenarios.SurgicalReceiverId)
                .SuitabilityForCurrentLoad);
        DeliveryCandidateSnapshot firstAtRelay = Assert.Single(
            session.Snapshot.DeliveryCandidates,
            candidate =>
                candidate.ReceivingFacilityId
                    == BuiltInMedevacScenarios.TransportRelayId
                && candidate.RequestIds.SequenceEqual(new[] {
                    BuiltInMedevacScenarios.FirstRequestId
                }));
        Assert.Equal(FacilitySuitability.Suitable, firstAtRelay.Suitability);
        DeliveryCandidateSnapshot secondAtRelay = Assert.Single(
            session.Snapshot.DeliveryCandidates,
            candidate =>
                candidate.ReceivingFacilityId
                    == BuiltInMedevacScenarios.TransportRelayId
                && candidate.RequestIds.SequenceEqual(new[] {
                    BuiltInMedevacScenarios.SecondRequestId
                }));
        Assert.Equal(
            FacilitySuitability.RelayNotAppropriate,
            secondAtRelay.Suitability);
        DeliveryCandidateSnapshot bothAtRelay = Assert.Single(
            session.Snapshot.DeliveryCandidates,
            candidate =>
                candidate.ReceivingFacilityId
                    == BuiltInMedevacScenarios.TransportRelayId
                && candidate.RequestIds.Count == 2);
        Assert.Equal(
            FacilitySuitability.RelayNotAppropriate,
            bothAtRelay.Suitability);

        session.ChooseDelivery(BuiltInMedevacScenarios.SurgicalReceiverId);
        AdvanceUntil(session,
            snapshot => snapshot.Lifecycle == MedevacMissionLifecycle.Complete);

        Assert.All(session.Snapshot.Requests, request =>
            Assert.Equal(
                PatientPodPhase.DeliveredToClinicalFacility, request.PodPhase));
        Assert.Equal(0, session.Snapshot.AirAmbulance.ImmediateThreatHoldSeconds);
    }

    [Fact]
    public void CommanderCanRelaySimplePatientThenReturnForUrgentPickup() {
        var session = new MedevacEvacuationSession(
            BuiltInMedevacScenarios.CommanderTraining);
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, snapshot =>
            Request(session, BuiltInMedevacScenarios.FirstRequestId)
                .Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.CollectNextOrDeliver);

        Assert.Equal(
            FacilitySuitability.Suitable,
            Facility(session, BuiltInMedevacScenarios.TransportRelayId)
                .SuitabilityForCurrentLoad);
        session.ChooseDelivery(BuiltInMedevacScenarios.TransportRelayId);
        AdvanceUntil(session, snapshot =>
            Request(session, BuiltInMedevacScenarios.FirstRequestId).PodPhase
                == PatientPodPhase.TransferredToPatientTransport);

        Assert.Empty(session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Contains(
            BuiltInMedevacScenarios.SecondRequestId,
            session.Snapshot.CommanderDecision.CollectableRequestIds);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, snapshot =>
            snapshot.AirAmbulance.OnboardRequestIds.Contains(
                BuiltInMedevacScenarios.SecondRequestId,
                StringComparer.Ordinal));
        session.ChooseDelivery(BuiltInMedevacScenarios.SurgicalReceiverId);
        AdvanceUntil(session,
            snapshot => snapshot.Lifecycle == MedevacMissionLifecycle.Complete);

        Assert.Equal(
            PatientPodPhase.TransferredToPatientTransport,
            Request(session, BuiltInMedevacScenarios.FirstRequestId).PodPhase);
        Assert.Equal(
            PatientPodPhase.DeliveredToClinicalFacility,
            Request(session, BuiltInMedevacScenarios.SecondRequestId).PodPhase);
    }

    [Fact]
    public void BuiltInWorseningReportCanDivertBeforeSecondPickupAndResumeItLater() {
        var session = new MedevacEvacuationSession(
            BuiltInMedevacScenarios.CommanderTraining);
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, snapshot =>
            Request(session, BuiltInMedevacScenarios.FirstRequestId)
                .Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.CollectNextOrDeliver);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);

        session.ChooseDelivery(
            BuiltInMedevacScenarios.SurgicalReceiverId,
            new[] { BuiltInMedevacScenarios.FirstRequestId });
        AdvanceUntil(session, snapshot =>
            Request(session, BuiltInMedevacScenarios.FirstRequestId).PodPhase
                == PatientPodPhase.DeliveredToClinicalFacility);

        Assert.Contains(
            BuiltInMedevacScenarios.SecondRequestId,
            session.Snapshot.CommanderDecision.CollectableRequestIds);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, snapshot =>
            snapshot.AirAmbulance.OnboardRequestIds.Contains(
                BuiltInMedevacScenarios.SecondRequestId,
                StringComparer.Ordinal));
        session.ChooseDelivery(BuiltInMedevacScenarios.SurgicalReceiverId);
        AdvanceUntil(session,
            snapshot => snapshot.Lifecycle == MedevacMissionLifecycle.Complete);

        Assert.Contains(session.Snapshot.Events, item =>
            item.Code == "commander.divert-delivery"
            && item.DeliveryDecision?.AbandonedCollectionRequestId
                == BuiltInMedevacScenarios.SecondRequestId);
    }

    [Fact]
    public void AuthoredPatientAndPodIdentityRemainConservedAcrossEveryCustodyChange() {
        EvacuationRequestDefinition request = DirectRequest(id: "IDENTITY");
        var session = new MedevacEvacuationSession(Scenario(request));

        Assert.Equal("PATIENT-IDENTITY", Request(session, request.Id).PatientId);
        Assert.Equal("POD-IDENTITY", Request(session, request.Id).PodId);
        AssertConserved(session.Snapshot);

        session.Begin(request.Id);
        for (int second = 0; second < 10; second++) {
            session.Advance();
            AssertConserved(session.Snapshot);
        }

        session.ChooseDelivery("RELAY");
        for (int second = 0; second < 5; second++) {
            session.Advance();
            AssertConserved(session.Snapshot);
        }

        EvacuationRequestSnapshot transferred = Request(session, request.Id);
        Assert.Equal(
            EvacuationCustodian.PatientTransport,
            transferred.PatientCustody.Custodian);
        Assert.Equal("RELAY", transferred.PatientCustody.LocationId);
        Assert.Equal("POD-IDENTITY",
            transferred.PatientCustody.ContainerPodId);
    }

    [Fact]
    public void DuplicatePatientOrPodIdentityIsRejectedAtScenarioLoad() {
        EvacuationRequestDefinition first = DirectRequest(id: "ONE");
        EvacuationRequestDefinition duplicatePatient = SecondDirectRequest() with {
            PatientId = first.PatientId
        };
        EvacuationRequestDefinition duplicatePod = SecondDirectRequest() with {
            PodId = first.PodId
        };

        Assert.Throws<ArgumentException>(() =>
            new MedevacEvacuationSession(
                Scenario(first, duplicatePatient)));
        Assert.Throws<ArgumentException>(() =>
            new MedevacEvacuationSession(
                Scenario(first, duplicatePod)));
    }

    [Fact]
    public void ZeroTimeStagingRouteCompletesArrivalAndDisconnectedGraphIsRejected() {
        MedevacScenarioDefinition zeroRoute =
            Scenario(SecondDirectRequest()) with {
                Routes = Scenario(SecondDirectRequest()).Routes
                    .Select(route =>
                        route.FromLocationId == "BASE"
                            && route.ToLocationId == "SAFE-W"
                                ? route with { TravelSeconds = 0 }
                                : route)
                    .ToArray()
            };
        var session = new MedevacEvacuationSession(zeroRoute);

        session.Begin("C");

        Assert.Equal("SAFE-W", session.Snapshot.AirAmbulance.CurrentLocationId);
        Assert.Equal(
            AirAmbulancePhase.HoldingAtSafeStaging,
            session.Snapshot.AirAmbulance.Phase);
        Assert.Contains(session.Snapshot.Events, item =>
            item.Code == "air-ambulance.staged"
            && item.LocationId == "SAFE-W");

        MedevacScenarioDefinition disconnected = Scenario(DirectRequest()) with {
            Routes = Array.Empty<MedevacRouteDefinition>()
        };
        ArgumentException error = Assert.Throws<ArgumentException>(() =>
            new MedevacEvacuationSession(disconnected));
        Assert.Contains("No authored route", error.Message,
            StringComparison.Ordinal);
    }

    [Fact]
    public void PresentButUnassessedObservationCannotSatisfyAReceiver() {
        var unassessed = SimpleStable with {
            Urgency = ObservedMedicalUrgency.Unassigned,
            Airway = ObservedSystemStatus.Unassessed,
            Breathing = ObservedSystemStatus.Unassessed,
            Circulation = ObservedSystemStatus.Unassessed,
            Temperature = ObservedTemperatureStatus.Unassessed,
            RequestedReceivingCapabilities = ReceivingCapability.None,
            TransportRelayEligible = true
        };
        EvacuationRequestDefinition request = DirectRequest(
            reports: new[] { new TimedMedicalReport(0, unassessed) });
        var session = new MedevacEvacuationSession(Scenario(request));
        session.Begin(request.Id);
        session.Advance(10);

        Assert.All(session.Snapshot.ReceivingFacilities, facility =>
            Assert.Equal(
                FacilitySuitability.MedicalAssessmentIncomplete,
                facility.SuitabilityForCurrentLoad));
        Assert.All(session.Snapshot.DeliveryCandidates, candidate =>
            Assert.Equal(
                FacilitySuitability.MedicalAssessmentIncomplete,
                candidate.Suitability));
        Assert.Throws<InvalidOperationException>(
            () => session.ChooseDelivery("CLINIC"));
    }

    [Fact]
    public void DustoffIgnoresFutureAndDisposedThreatRequests() {
        EvacuationRequestDefinition routine = DirectRequest(
            id: "ROUTINE",
            threat: new ThreatAssessment(
                ThreatTiming.None, ThreatCredibility.Unconfirmed));
        EvacuationRequestDefinition futureThreat = DirectRequest(
            id: "FUTURE",
            site: "SITE-A",
            threat: new ThreatAssessment(
                ThreatTiming.Immediate, ThreatCredibility.Credible)) with {
            RequestTimeSeconds = 100
        };
        var futureSession = new MedevacEvacuationSession(
            Scenario(routine, futureThreat));
        futureSession.Begin(routine.Id);
        futureSession.Advance(10);
        Assert.Equal(
            EvacuationMissionKind.Medevac,
            futureSession.Snapshot.CurrentMissionKind);

        EvacuationRequestDefinition immediate = DirectRequest(id: "PAST");
        MedevacScenarioDefinition disposedDefinition =
            Scenario(immediate, SecondDirectRequest()) with {
                ReceivingFacilities =
                    Scenario(immediate, SecondDirectRequest())
                        .ReceivingFacilities
                        .Select(facility => facility.Id == "RELAY"
                            ? facility with { LocationId = "SITE-A" }
                            : facility)
                        .ToArray()
            };
        var disposedSession =
            new MedevacEvacuationSession(disposedDefinition);
        disposedSession.Begin(immediate.Id);
        disposedSession.Advance(10);
        disposedSession.ChooseDelivery("RELAY");

        Assert.Equal(
            PatientPodPhase.TransferredToPatientTransport,
            Request(disposedSession, immediate.Id).PodPhase);
        Assert.Equal(
            EvacuationMissionKind.Medevac,
            disposedSession.Snapshot.CurrentMissionKind);
    }

    [Fact]
    public void DeliveryOverrideEventAuditsReceiverGapAcknowledgementAndEntityIds() {
        var session =
            new MedevacEvacuationSession(Scenario(SecondDirectRequest()));
        session.Begin("C");
        session.Advance(9);

        session.ChooseDelivery("CLINIC", acknowledgeMismatch: true);

        MedevacChainEvent command = Assert.Single(
            session.Snapshot.Events,
            item => item.Code == "commander.deliver-override");
        MedevacDeliveryDecisionAudit audit =
            Assert.IsType<MedevacDeliveryDecisionAudit>(
                command.DeliveryDecision);
        Assert.Equal("CLINIC", audit.ReceivingFacilityId);
        Assert.Equal(FacilitySuitability.CapabilityMismatch, audit.Suitability);
        Assert.Equal(
            ReceivingCapability.DamageControlSurgery,
            audit.MissingCapabilities);
        Assert.True(audit.MismatchAcknowledged);
        Assert.Equal(new[] { "C" }, audit.SelectedRequestIds);
        Assert.Equal(new[] { "PATIENT-C" }, audit.SelectedPatientIds);
        Assert.Equal(new[] { "POD-C" }, audit.SelectedPodIds);
    }

    [Fact]
    public void CommanderCanSelectivelyRelayOnePodAndRetainTheUrgentPod() {
        var session = new MedevacEvacuationSession(
            Scenario(DirectRequest(), SecondDirectRequest()));
        session.Begin("A");
        session.Advance(10);
        session.ChooseCollectNext("C");
        session.Advance(7);

        DeliveryCandidateSnapshot simpleRelay = Assert.Single(
            session.Snapshot.DeliveryCandidates,
            candidate => candidate.ReceivingFacilityId == "RELAY"
                && candidate.RequestIds.SequenceEqual(new[] { "A" }));
        Assert.Equal(FacilitySuitability.Suitable, simpleRelay.Suitability);
        DeliveryCandidateSnapshot urgentRelay = Assert.Single(
            session.Snapshot.DeliveryCandidates,
            candidate => candidate.ReceivingFacilityId == "RELAY"
                && candidate.RequestIds.SequenceEqual(new[] { "C" }));
        Assert.Equal(
            FacilitySuitability.RelayNotAppropriate,
            urgentRelay.Suitability);
        Assert.Equal(
            ReceivingCapability.None,
            urgentRelay.MissingCapabilities);

        session.ChooseDelivery("RELAY", new[] { "A" });
        session.Advance(8);

        Assert.Equal(
            PatientPodPhase.TransferredToPatientTransport,
            Request(session, "A").PodPhase);
        Assert.Equal(
            PatientPodPhase.OnboardAirAmbulance,
            Request(session, "C").PodPhase);
        Assert.Equal(new[] { "C" },
            session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Equal(new[] { "PATIENT-C" },
            session.Snapshot.AirAmbulance.OnboardPatientIds);
        Assert.Equal(new[] { "POD-C" },
            session.Snapshot.AirAmbulance.OnboardPodIds);
        AssertConserved(session.Snapshot);

        session.ChooseDelivery("SURG");
        session.Advance(9);
        Assert.Equal(MedevacMissionLifecycle.Complete, session.Lifecycle);
    }

    [Fact]
    public void MaterialObservedWorseningCreatesABlockingReconsiderationGate() {
        var worsening = SimpleStable with {
            Urgency = ObservedMedicalUrgency.Urgent,
            Trend = ObservedMedicalTrend.Worsening,
            Circulation = ObservedSystemStatus.Critical,
            RequestedReceivingCapabilities =
                ReceivingCapability.Resuscitation
                | ReceivingCapability.BloodProducts,
            TransportRelayEligible = false
        };
        EvacuationRequestDefinition first = DirectRequest(
            reports: new[] {
                new TimedMedicalReport(0, SimpleStable),
                new TimedMedicalReport(4, worsening)
            });
        var session = new MedevacEvacuationSession(
            Scenario(first, SecondDirectRequest()));
        session.Begin("A");
        session.Advance(10);
        session.ChooseCollectNext("C");

        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);
        Assert.Equal("C",
            session.Snapshot.CommanderDecision.CommittedCollectionRequestId);
        Assert.Equal("A",
            session.Snapshot.CommanderDecision.ReconsiderationRequestId);
        int heldRouteSeconds =
            session.Snapshot.AirAmbulance.RouteSecondsRemaining;
        session.Advance(3);
        Assert.Equal(
            heldRouteSeconds,
            session.Snapshot.AirAmbulance.RouteSecondsRemaining);

        Assert.Throws<InvalidOperationException>(() =>
            session.ContinueCommittedCollection(
                acknowledgeReconsideration: false));
        Assert.Equal(
            CommanderDecisionKind.ReconsiderCollectOrDeliver,
            session.Snapshot.CommanderDecision.Kind);
        session.ContinueCommittedCollection(acknowledgeReconsideration: true);
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ChooseReceivingFacility);
        Assert.Equal(new[] { "A", "C" },
            session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Contains(session.Snapshot.Events, item =>
            item.Code == "medical.reconsideration-required"
            && item.RequestId == "A");
        Assert.Contains(session.Snapshot.Events, item =>
            item.Code == "commander.continue-collection"
            && item.RequestId == "C"
            && item.ReconsiderationDecision?.WorseningAcknowledged == true
            && item.ReconsiderationDecision.TriggeringRequestId == "A");
    }

    [Fact]
    public void ReconsiderationGateCanDivertCurrentPatientAndLeavePickupRecoverable() {
        var worsening = SimpleStable with {
            Urgency = ObservedMedicalUrgency.Urgent,
            Trend = ObservedMedicalTrend.Worsening,
            Circulation = ObservedSystemStatus.Critical,
            RequestedReceivingCapabilities =
                ReceivingCapability.Resuscitation
                | ReceivingCapability.BloodProducts,
            TransportRelayEligible = false
        };
        EvacuationRequestDefinition first = DirectRequest(
            reports: new[] {
                new TimedMedicalReport(0, SimpleStable),
                new TimedMedicalReport(4, worsening)
            });
        var session = new MedevacEvacuationSession(
            Scenario(first, SecondDirectRequest()));
        session.Begin("A");
        session.Advance(10);
        session.ChooseCollectNext("C");
        AdvanceUntil(session, snapshot =>
            snapshot.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);

        session.ChooseDelivery("SURG", new[] { "A" });
        MedevacChainEvent diversion = Assert.Single(
            session.Snapshot.Events,
            item => item.Code == "commander.divert-delivery");
        Assert.Equal("C",
            diversion.DeliveryDecision?.AbandonedCollectionRequestId);
        session.Advance(5);

        Assert.Equal(
            PatientPodPhase.DeliveredToClinicalFacility,
            Request(session, "A").PodPhase);
        Assert.Equal(
            PatientPodPhase.ReadyAtSite,
            Request(session, "C").PodPhase);
        Assert.Contains("C",
            session.Snapshot.CommanderDecision.CollectableRequestIds);
        Assert.Empty(session.Snapshot.AirAmbulance.OnboardRequestIds);
        AssertConserved(session.Snapshot);
    }
}
