namespace GunsOnly.Sim.Medevac;

/// <summary>
/// Authored training-surrogate missions shared by every presentation. Keeping the scenario beside
/// the authority prevents a browser, test harness, or future native shell from independently
/// inventing patient state, receiver capability, timing, or threat classification.
/// </summary>
public static class BuiltInMedevacScenarios {
    public const string FirstRequestId = "PICKUP-01";
    public const string SecondRequestId = "PICKUP-02";
    public const string FirstPatientId = "PATIENT-01";
    public const string SecondPatientId = "PATIENT-02";
    public const string FirstPodId = "POD-01";
    public const string SecondPodId = "POD-02";
    public const string TransportRelayId = "RELAY-WEST";
    public const string LocalHospitalId = "HOSPITAL-LOCAL";
    public const string SurgicalReceiverId = "SURGICAL-RECEIVER";

    public static MedevacScenarioDefinition CommanderTraining =>
        CreateCommanderTraining();

    static MedevacScenarioDefinition CreateCommanderTraining() {
        var stableForRelay = new ObservedMedicalStatus(
            ObservedMedicalUrgency.Priority,
            ObservedMedicalTrend.Stable,
            ObservedSystemStatus.Acceptable,
            ObservedSystemStatus.Acceptable,
            ObservedSystemStatus.Acceptable,
            ObservedTemperatureStatus.Warm,
            ReceivingCapability.Resuscitation,
            TransportRelayEligible: true);
        var stableRecheck = stableForRelay with {
            Urgency = ObservedMedicalUrgency.Urgent,
            Trend = ObservedMedicalTrend.Worsening,
            Circulation = ObservedSystemStatus.Concern,
            Temperature = ObservedTemperatureStatus.Cold,
            RequestedReceivingCapabilities =
                ReceivingCapability.Resuscitation
                | ReceivingCapability.BloodProducts,
            TransportRelayEligible = true
        };
        var urgentSurgical = new ObservedMedicalStatus(
            ObservedMedicalUrgency.Urgent,
            ObservedMedicalTrend.Worsening,
            ObservedSystemStatus.Acceptable,
            ObservedSystemStatus.Concern,
            ObservedSystemStatus.Critical,
            ObservedTemperatureStatus.Cold,
            ReceivingCapability.Resuscitation
                | ReceivingCapability.BloodProducts
                | ReceivingCapability.DamageControlSurgery
                | ReceivingCapability.ActiveRewarming,
            TransportRelayEligible: false);
        var urgentSurgicalRecheck = urgentSurgical with {
            Trend = ObservedMedicalTrend.Stable,
            Circulation = ObservedSystemStatus.Concern
        };

        MedevacLocationDefinition[] locations = {
            new("AMB-BASE", "DISPERSED AMBULANCE BASE",
                MedevacLocationKind.AmbulanceBase),
            new("SAFE-WEST", "SAFE-ZONE RENDEZVOUS WEST",
                MedevacLocationKind.SafeStaging),
            new("SITE-01", "PICKUP SITE 01",
                MedevacLocationKind.CasualtySite),
            new("SITE-02", "PICKUP SITE 02",
                MedevacLocationKind.CasualtySite),
            new("LOC-RELAY-WEST", "PATIENT TRANSPORT RELAY WEST",
                MedevacLocationKind.TransportRelay),
            new("LOC-HOSPITAL-LOCAL", "LOCAL HOSPITAL",
                MedevacLocationKind.ClinicalFacility),
            new("LOC-SURGICAL", "SURGICAL RECEIVER",
                MedevacLocationKind.ClinicalFacility)
        };
        MedevacRouteDefinition[] routes = {
            new("AMB-BASE", "SAFE-WEST", 11),
            new("AMB-BASE", "SITE-01", 15),
            new("SAFE-WEST", "SITE-01", 8),
            new("SAFE-WEST", "SITE-02", 9),
            new("SITE-01", "SAFE-WEST", 8),
            new("SITE-02", "LOC-RELAY-WEST", 9),
            new("SITE-02", "LOC-HOSPITAL-LOCAL", 11),
            new("SITE-02", "LOC-SURGICAL", 14),
            new("SAFE-WEST", "LOC-RELAY-WEST", 7),
            new("SAFE-WEST", "LOC-HOSPITAL-LOCAL", 10),
            new("SAFE-WEST", "LOC-SURGICAL", 13)
        };
        ReceivingFacilityDefinition[] facilities = {
            new(
                TransportRelayId,
                "PATIENT TRANSPORT RELAY WEST",
                "LOC-RELAY-WEST",
                ReceivingFacilityKind.TransportRelay,
                ReceivingCapability.PatientTransportRelay),
            new(
                LocalHospitalId,
                "LOCAL HOSPITAL",
                "LOC-HOSPITAL-LOCAL",
                ReceivingFacilityKind.ClinicalFacility,
                ReceivingCapability.Resuscitation
                    | ReceivingCapability.ActiveRewarming
                    | ReceivingCapability.MonitoredHolding),
            new(
                SurgicalReceiverId,
                "SURGICAL RECEIVER",
                "LOC-SURGICAL",
                ReceivingFacilityKind.ClinicalFacility,
                ReceivingCapability.Resuscitation
                    | ReceivingCapability.BloodProducts
                    | ReceivingCapability.DamageControlSurgery
                    | ReceivingCapability.ThoracicCare
                    | ReceivingCapability.DiagnosticImaging
                    | ReceivingCapability.ActiveRewarming
                    | ReceivingCapability.MonitoredHolding)
        };
        EvacuationRequestDefinition[] requests = {
            new(
                FirstRequestId,
                FirstPatientId,
                FirstPodId,
                "PICKUP 01",
                "SITE-01",
                "SAFE-WEST",
                RequestTimeSeconds: 0,
                EmptyPodDeliverySeconds: 18,
                EmptyCourierReturnSeconds: 12,
                GroundLoadingSeconds: 22,
                PickupMethod.RemoteExtractionToSafeZone,
                ExtractionOutboundSeconds: 14,
                ExtractionInboundSeconds: 12,
                new ThreatAssessment(
                    ThreatTiming.Immediate, ThreatCredibility.Credible),
                new ExtractionFailurePlan(
                    FibreFailureAfterExtractionSeconds: 5,
                    AutonomyBlockedAfterExtractionSeconds: 8,
                    RepeaterControlSeconds: 24),
                new[] {
                    new TimedMedicalReport(0, stableForRelay),
                    new TimedMedicalReport(21, stableRecheck)
                }),
            new(
                SecondRequestId,
                SecondPatientId,
                SecondPodId,
                "PICKUP 02",
                "SITE-02",
                "SAFE-WEST",
                RequestTimeSeconds: 8,
                EmptyPodDeliverySeconds: 16,
                EmptyCourierReturnSeconds: 12,
                GroundLoadingSeconds: 18,
                PickupMethod.DirectAircraftPickup,
                ExtractionOutboundSeconds: 0,
                ExtractionInboundSeconds: 0,
                new ThreatAssessment(
                    ThreatTiming.Potential, ThreatCredibility.Credible),
                new ExtractionFailurePlan(),
                new[] {
                    new TimedMedicalReport(0, urgentSurgical),
                    new TimedMedicalReport(35, urgentSurgicalRecheck)
                })
        };

        return new MedevacScenarioDefinition(
            "commander-training-01",
            "AMBULANCE 2",
            "AMB-BASE",
            locations,
            routes,
            facilities,
            requests);
    }
}
