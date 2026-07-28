namespace GunsOnly.Sim.Medevac;

/// <summary>
/// Operational label for one pickup. Contested geography alone is not enough to make a mission
/// DUSTOFF; that label is reserved for an immediate, credible threat at the active pickup.
/// </summary>
public enum EvacuationMissionKind {
    Medevac,
    Dustoff
}

public enum ThreatTiming {
    None,
    Potential,
    Immediate
}

public enum ThreatCredibility {
    Unconfirmed,
    Credible
}

public readonly record struct ThreatAssessment(
    ThreatTiming Timing,
    ThreatCredibility Credibility) {

    public bool IsImmediateCredible =>
        Timing == ThreatTiming.Immediate
        && Credibility == ThreatCredibility.Credible;

    public EvacuationMissionKind MissionKind =>
        IsImmediateCredible
            ? EvacuationMissionKind.Dustoff
            : EvacuationMissionKind.Medevac;
}

public enum MedevacLocationKind {
    AmbulanceBase,
    SafeStaging,
    CasualtySite,
    TransportRelay,
    ClinicalFacility
}

public enum PickupMethod {
    DirectAircraftPickup,
    RemoteExtractionToSafeZone
}

public enum PatientPodPhase {
    AwaitingDispatch,
    UncrewedTransitToSite,
    GroundLoading,
    ReadyAtSite,
    OnExtractionDrone,
    OnboardAirAmbulance,
    TransferredToPatientTransport,
    DeliveredToClinicalFacility
}

public enum PodCourierPhase {
    AwaitingDispatch,
    CarryingEmptyPodToSite,
    ReturningEmptyToDepot,
    Recovered
}

public enum ExtractionDronePhase {
    NotRequired,
    WaitingForAirAmbulance,
    WaitingForPod,
    OutboundToSite,
    ReturningWithPod,
    AwaitingCommanderControlDecision,
    Complete
}

/// <summary>
/// Abstract control-authority states only. The kernel intentionally models no frequency, power,
/// antenna, detection-range, or other real-world electronic-warfare parameter.
/// </summary>
public enum ExtractionControlMode {
    None,
    Fibre,
    Autonomous,
    RfFallback,
    ShortRangeRepeater
}

public enum AirAmbulancePhase {
    Ready,
    EnrouteSafeStaging,
    HoldingAtSafeStaging,
    EnroutePickup,
    HoldingAtPickup,
    AwaitingRemoteExtraction,
    AwaitingCommanderDecision,
    EnrouteReceivingFacility,
    Complete
}

public enum MedevacMissionLifecycle {
    Ready,
    Active,
    Complete
}

public enum CommanderDecisionKind {
    None,
    CollectNextOrDeliver,
    ChooseReceivingFacility,
    ReconsiderCollectOrDeliver
}

public enum ReceivingFacilityKind {
    TransportRelay,
    ClinicalFacility
}

[Flags]
public enum ReceivingCapability {
    None = 0,
    Resuscitation = 1 << 0,
    BloodProducts = 1 << 1,
    DamageControlSurgery = 1 << 2,
    ThoracicCare = 1 << 3,
    DiagnosticImaging = 1 << 4,
    ActiveRewarming = 1 << 5,
    MonitoredHolding = 1 << 6,
    PatientTransportRelay = 1 << 7
}

public enum FacilitySuitability {
    Suitable,
    CapabilityMismatch,
    RelayNotAppropriate,
    MedicalAssessmentIncomplete,
    NoPatientsOnboard
}

public enum ObservedMedicalUrgency {
    Unassigned,
    Routine,
    Priority,
    Urgent,
    Immediate
}

public enum ObservedMedicalTrend {
    Unknown,
    Improving,
    Stable,
    Worsening
}

public enum ObservedSystemStatus {
    Unassessed,
    Acceptable,
    Concern,
    Critical
}

public enum ObservedTemperatureStatus {
    Unassessed,
    Warm,
    Cold,
    VeryCold
}

/// <summary>
/// The authority currently responsible for exactly one patient or pod. These are logistics roles,
/// not claims about clinical scope of practice.
/// </summary>
public enum EvacuationCustodian {
    PodDepot,
    AutonomousPodCourier,
    SiteGroundTeam,
    ExtractionDrone,
    AirAmbulance,
    PatientTransport,
    ClinicalFacility
}

/// <summary>
/// Coarse authoritative position for a patient or pod. Mobile entities identify their custodian
/// vehicle rather than inventing a precise point along an abstract route.
/// </summary>
public enum EvacuationPositionKind {
    AtLocation,
    InTransit,
    OnVehicle
}

/// <summary>
/// Everything a mission commander may know about a patient. These deliberately coarse,
/// time-stamped observations contain no diagnosis, precise vital sign, injury truth, survival
/// clock, or future trajectory.
/// </summary>
public readonly record struct ObservedMedicalStatus(
    ObservedMedicalUrgency Urgency,
    ObservedMedicalTrend Trend,
    ObservedSystemStatus Airway,
    ObservedSystemStatus Breathing,
    ObservedSystemStatus Circulation,
    ObservedTemperatureStatus Temperature,
    ReceivingCapability RequestedReceivingCapabilities,
    bool TransportRelayEligible);

public readonly record struct TimedMedicalReport(
    int SecondsAfterPodSealed,
    ObservedMedicalStatus Status);

/// <summary>
/// Scripted training-surrogate failures. Times are simulated scenario seconds and are not claims
/// about real equipment performance.
/// </summary>
public readonly record struct ExtractionFailurePlan(
    int FibreFailureAfterExtractionSeconds = -1,
    int AutonomyBlockedAfterExtractionSeconds = -1,
    int RepeaterControlSeconds = 20) {

    public ExtractionFailurePlan()
        : this(
            FibreFailureAfterExtractionSeconds: -1,
            AutonomyBlockedAfterExtractionSeconds: -1,
            RepeaterControlSeconds: 20) {
    }
}

public sealed record MedevacLocationDefinition(
    string Id,
    string Label,
    MedevacLocationKind Kind);

/// <summary>
/// Authored transit time between two abstract locations. Values are fictional training-surrogate
/// quantities; this logistics kernel does not pretend they are an aircraft performance model.
/// </summary>
public sealed record MedevacRouteDefinition(
    string FromLocationId,
    string ToLocationId,
    int TravelSeconds,
    bool Bidirectional = true);

public sealed record ReceivingFacilityDefinition(
    string Id,
    string Label,
    string LocationId,
    ReceivingFacilityKind Kind,
    ReceivingCapability AvailableCapabilities);

public sealed record EvacuationRequestDefinition(
    string Id,
    string PatientId,
    string PodId,
    string Label,
    string SiteLocationId,
    string StagingLocationId,
    int RequestTimeSeconds,
    int EmptyPodDeliverySeconds,
    int EmptyCourierReturnSeconds,
    int GroundLoadingSeconds,
    PickupMethod PickupMethod,
    int ExtractionOutboundSeconds,
    int ExtractionInboundSeconds,
    ThreatAssessment Threat,
    ExtractionFailurePlan ExtractionFailures,
    IReadOnlyList<TimedMedicalReport> MedicalReports);

public sealed record MedevacScenarioDefinition(
    string Id,
    string AmbulanceCallsign,
    string InitialLocationId,
    IReadOnlyList<MedevacLocationDefinition> Locations,
    IReadOnlyList<MedevacRouteDefinition> Routes,
    IReadOnlyList<ReceivingFacilityDefinition> ReceivingFacilities,
    IReadOnlyList<EvacuationRequestDefinition> Requests);

public sealed record MedicalObservationSnapshot(
    ObservedMedicalStatus Status,
    int RecordedAtSecond,
    int AgeSeconds);

public sealed record EvacuationEntityCustodySnapshot(
    string EntityId,
    EvacuationCustodian Custodian,
    EvacuationPositionKind Position,
    string? LocationId,
    string? DestinationLocationId,
    string? VehicleId,
    string? ContainerPodId);

public sealed record ExtractionDroneSnapshot(
    ExtractionDronePhase Phase,
    ExtractionControlMode ControlMode,
    int LegSecondsRemaining,
    int ExtractionSecondsElapsed,
    bool RfCommandRequired,
    bool RepeaterAvailable,
    bool RepeaterWasEjected);

public sealed record EvacuationRequestSnapshot(
    string Id,
    string PatientId,
    string PodId,
    string Label,
    string SiteLocationId,
    string StagingLocationId,
    int RequestAtSecond,
    EvacuationMissionKind MissionKind,
    ThreatAssessment Threat,
    PickupMethod PickupMethod,
    PatientPodPhase PodPhase,
    PodCourierPhase CourierPhase,
    int EstimatedPodReadyAtSecond,
    int? ActualPodReadyAtSecond,
    bool IsReadyForCollection,
    bool IsSelectableForCollection,
    MedicalObservationSnapshot? Medical,
    ExtractionDroneSnapshot Extraction,
    EvacuationEntityCustodySnapshot PatientCustody,
    EvacuationEntityCustodySnapshot PodCustody);

public sealed record AirAmbulanceSnapshot(
    string Callsign,
    AirAmbulancePhase Phase,
    string CurrentLocationId,
    string? TargetLocationId,
    string? AssignedRequestId,
    string? ReceivingFacilityId,
    int RouteSecondsRemaining,
    int PlannedLaunchAtSecond,
    int PlannedArrivalAtSecond,
    int PatientPodCapacity,
    IReadOnlyList<string> OnboardRequestIds,
    int ImmediateThreatHoldSeconds,
    IReadOnlyList<string> OnboardPatientIds,
    IReadOnlyList<string> OnboardPodIds,
    IReadOnlyList<string> DeliveryRequestIds);

public sealed record ReceivingFacilitySnapshot(
    string Id,
    string Label,
    string LocationId,
    ReceivingFacilityKind Kind,
    ReceivingCapability AvailableCapabilities,
    FacilitySuitability SuitabilityForCurrentLoad,
    ReceivingCapability MissingCapabilities,
    IReadOnlyList<string> IndividuallySuitableRequestIds);

public sealed record DeliveryCandidateSnapshot(
    string ReceivingFacilityId,
    IReadOnlyList<string> RequestIds,
    IReadOnlyList<string> PatientIds,
    IReadOnlyList<string> PodIds,
    FacilitySuitability Suitability,
    ReceivingCapability MissingCapabilities);

public sealed record CommanderDecisionSnapshot(
    CommanderDecisionKind Kind,
    IReadOnlyList<string> CollectableRequestIds,
    IReadOnlyList<string> ReceivingFacilityIds,
    bool MayDeliverCurrentLoad,
    string? CommittedCollectionRequestId,
    string? ReconsiderationRequestId);

public sealed record MedevacDeliveryDecisionAudit(
    string ReceivingFacilityId,
    FacilitySuitability Suitability,
    ReceivingCapability MissingCapabilities,
    bool MismatchAcknowledged,
    IReadOnlyList<string> SelectedRequestIds,
    IReadOnlyList<string> SelectedPatientIds,
    IReadOnlyList<string> SelectedPodIds,
    string? AbandonedCollectionRequestId);

public sealed record MedevacReconsiderationDecisionAudit(
    string TriggeringRequestId,
    string CommittedCollectionRequestId,
    bool WorseningAcknowledged);

public sealed record MedevacChainEvent(
    long Sequence,
    int ElapsedSeconds,
    string Code,
    string? RequestId = null,
    string? LocationId = null,
    MedevacDeliveryDecisionAudit? DeliveryDecision = null,
    MedevacReconsiderationDecisionAudit? ReconsiderationDecision = null);

public sealed record MedevacEvacuationSnapshot(
    int SchemaVersion,
    string ScenarioId,
    int ElapsedSeconds,
    MedevacMissionLifecycle Lifecycle,
    EvacuationMissionKind CurrentMissionKind,
    AirAmbulanceSnapshot AirAmbulance,
    IReadOnlyList<EvacuationRequestSnapshot> Requests,
    IReadOnlyList<ReceivingFacilitySnapshot> ReceivingFacilities,
    IReadOnlyList<DeliveryCandidateSnapshot> DeliveryCandidates,
    CommanderDecisionSnapshot CommanderDecision,
    int RfExposureTrainingUnits,
    IReadOnlyList<MedevacChainEvent> Events);
