namespace GunsOnly.Sim.Casevac;

public static class CasevacContract {
    public const int SchemaVersion = 1;
}

public enum CasevacPhase {
    Ready,
    Ingress,
    PickupApproach,
    Loading,
    Outbound,
    DropoffApproach,
    Handoff,
    Quiet,
    Complete,
    AbortReturn,
    Aborted,
    AircraftLost
}

public enum CapsuleCustody {
    AtPickup,
    InAircraft,
    AtReceiver
}

public enum CasevacDisposition {
    Pending,
    TransferredOnTime,
    TransferredAfterRequestedTime,
    ControlledAbort,
    AircraftLostEmpty,
    AircraftLostOccupied
}

public enum CasevacSemanticCommand {
    None,
    RequestAbort
}

public enum CasevacMaskingState {
    NotAssessed,
    Masked,
    Exposed
}

public enum LandingZoneGateClass {
    Advance,
    Hold,
    Break
}

[Flags]
public enum LandingZoneGateViolation {
    None = 0,
    OutsideTerminalVolume = 1 << 0,
    OutsideEnterFootprint = 1 << 1,
    OutsideExitFootprint = 1 << 2,
    NoSurfaceContact = 1 << 3,
    LateralGroundSpeed = 1 << 4,
    VerticalSpeed = 1 << 5,
    Pitch = 1 << 6,
    Bank = 1 << 7
}

public enum CasevacEventKind {
    CasevacTaskStarted,
    PickupApproachEntered,
    DropoffApproachEntered,
    ApproachAttemptStarted,
    ApproachDiscontinued,
    StableContactEntered,
    StableContactExited,
    LoadingStarted,
    LoadingPaused,
    LoadingResumed,
    LoadingReset,
    CapsuleSecured,
    RequestedHandoffWindowPassed,
    HandoffStarted,
    HandoffPaused,
    HandoffResumed,
    HandoffReset,
    HandoffCompleted,
    AbortReturnStarted,
    CasevacAborted,
    CasevacAircraftLost
}

/// <summary>
/// Immutable authored timing and identity for the first one-pickup/one-receiver CASEVAC course.
/// It deliberately contains no patient identity, clinical state, treatment, or outcome model.
/// </summary>
public sealed class CasevacScenarioDefinition {
    public CasevacScenarioDefinition(
        string id,
        string aircraftId,
        string capsuleId,
        LandingZoneDefinition pickup,
        LandingZoneDefinition receiver,
        string safeExitVolumeId,
        ExposureFieldDefinition exposureField,
        long initialCallAgeTicks,
        long requestedHandoffAgeTicks,
        int stabilizationDwellTicks,
        int loadingDwellTicks,
        int handoffDwellTicks,
        int quietAftermathTicks,
        double capsuleMassKg) {
        ValidateId(id, nameof(id));
        ValidateId(aircraftId, nameof(aircraftId));
        ValidateId(capsuleId, nameof(capsuleId));
        Pickup = pickup ?? throw new ArgumentNullException(nameof(pickup));
        Receiver = receiver ?? throw new ArgumentNullException(nameof(receiver));
        ValidateId(safeExitVolumeId, nameof(safeExitVolumeId));
        ExposureField = exposureField
            ?? throw new ArgumentNullException(nameof(exposureField));
        if (StringComparer.Ordinal.Equals(pickup.Id, receiver.Id)
            || StringComparer.Ordinal.Equals(pickup.Id, safeExitVolumeId)
            || StringComparer.Ordinal.Equals(receiver.Id, safeExitVolumeId))
            throw new ArgumentException(
                "Pickup, receiver, and safe-exit identities must be distinct.");
        if (initialCallAgeTicks < 0)
            throw new ArgumentOutOfRangeException(nameof(initialCallAgeTicks));
        if (requestedHandoffAgeTicks <= initialCallAgeTicks)
            throw new ArgumentOutOfRangeException(nameof(requestedHandoffAgeTicks),
                "The requested handoff age must be later than the initial call age.");
        ValidatePositive(stabilizationDwellTicks, nameof(stabilizationDwellTicks));
        ValidatePositive(loadingDwellTicks, nameof(loadingDwellTicks));
        ValidatePositive(handoffDwellTicks, nameof(handoffDwellTicks));
        ValidatePositive(quietAftermathTicks, nameof(quietAftermathTicks));
        if (!double.IsFinite(capsuleMassKg) || capsuleMassKg <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(capsuleMassKg));

        Id = id;
        AircraftId = aircraftId;
        CapsuleId = capsuleId;
        SafeExitVolumeId = safeExitVolumeId;
        InitialCallAgeTicks = initialCallAgeTicks;
        RequestedHandoffAgeTicks = requestedHandoffAgeTicks;
        StabilizationDwellTicks = stabilizationDwellTicks;
        LoadingDwellTicks = loadingDwellTicks;
        HandoffDwellTicks = handoffDwellTicks;
        QuietAftermathTicks = quietAftermathTicks;
        CapsuleMassKg = capsuleMassKg;
    }

    public string Id { get; }
    public string AircraftId { get; }
    public string CapsuleId { get; }
    public LandingZoneDefinition Pickup { get; }
    public LandingZoneDefinition Receiver { get; }
    public string PickupSiteId => Pickup.Id;
    public string ReceiverSiteId => Receiver.Id;
    public string SafeExitVolumeId { get; }
    public ExposureFieldDefinition ExposureField { get; }
    public long InitialCallAgeTicks { get; }
    public long RequestedHandoffAgeTicks { get; }
    public int StabilizationDwellTicks { get; }
    public int LoadingDwellTicks { get; }
    public int HandoffDwellTicks { get; }
    public int QuietAftermathTicks { get; }
    public double CapsuleMassKg { get; }

    static void ValidateId(string id, string parameterName) {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("A stable identity is required.", parameterName);
    }

    static void ValidatePositive(int value, string parameterName) {
        if (value <= 0) throw new ArgumentOutOfRangeException(parameterName);
    }
}

/// <summary>
/// Resolved landing-zone evidence from authoritative geometry and a versioned gate profile.
/// Raw values remain available for debrief; the controller consumes only the resolved gate class.
/// </summary>
public readonly record struct LandingZoneObservation {
    public LandingZoneObservation(
        string? siteId,
        bool insideTerminalVolume,
        bool insideEnterFootprint,
        bool insideExitFootprint,
        bool surfaceContact,
        double lateralGroundSpeedMps,
        double verticalSpeedMps,
        double pitchRad,
        double bankRad,
        LandingZoneGateViolation enterViolations,
        LandingZoneGateViolation exitViolations,
        LandingZoneGateClass gateClass,
        long approachAttemptId = 0) {
        if (siteId is not null && string.IsNullOrWhiteSpace(siteId))
            throw new ArgumentException(
                "A landing-zone site ID must be null or non-blank.", nameof(siteId));
        if (!double.IsFinite(lateralGroundSpeedMps) || lateralGroundSpeedMps < 0.0)
            throw new ArgumentOutOfRangeException(nameof(lateralGroundSpeedMps));
        if (!double.IsFinite(verticalSpeedMps))
            throw new ArgumentOutOfRangeException(nameof(verticalSpeedMps));
        if (!double.IsFinite(pitchRad))
            throw new ArgumentOutOfRangeException(nameof(pitchRad));
        if (!double.IsFinite(bankRad))
            throw new ArgumentOutOfRangeException(nameof(bankRad));
        if (!Enum.IsDefined(gateClass))
            throw new ArgumentOutOfRangeException(nameof(gateClass));
        if (approachAttemptId < 0)
            throw new ArgumentOutOfRangeException(nameof(approachAttemptId));
        ValidateViolationFlags(enterViolations, nameof(enterViolations));
        ValidateViolationFlags(exitViolations, nameof(exitViolations));
        if (insideEnterFootprint && !insideExitFootprint)
            throw new ArgumentException(
                "The tight enter footprint must be inside the loose exit footprint.");
        if (insideExitFootprint && !insideTerminalVolume)
            throw new ArgumentException(
                "A landing-zone footprint must be inside its terminal volume.");
        if (insideTerminalVolume && siteId is null)
            throw new ArgumentException(
                "An observation inside a terminal volume requires a site ID.");
        if (!insideTerminalVolume
            && (siteId is not null || insideEnterFootprint || insideExitFootprint
                || surfaceContact))
            throw new ArgumentException(
                "An observation outside terminal geometry cannot claim a site or contact.");
        if ((exitViolations & ~enterViolations) != LandingZoneGateViolation.None)
            throw new ArgumentException(
                "Every loose-gate violation must also violate the tighter enter gate.");

        LandingZoneGateClass derived = exitViolations != LandingZoneGateViolation.None
            ? LandingZoneGateClass.Break
            : enterViolations == LandingZoneGateViolation.None
                ? LandingZoneGateClass.Advance
                : LandingZoneGateClass.Hold;
        if (gateClass != derived)
            throw new ArgumentException(
                "The resolved gate class does not match its violation sets.");
        if (gateClass == LandingZoneGateClass.Advance
            && (!insideEnterFootprint || !surfaceContact))
            throw new ArgumentException(
                "Advance requires enter-footprint contact.");
        if (gateClass == LandingZoneGateClass.Hold
            && (!insideExitFootprint || !surfaceContact))
            throw new ArgumentException(
                "Hold requires exit-footprint contact.");

        SiteId = siteId;
        InsideTerminalVolume = insideTerminalVolume;
        InsideEnterFootprint = insideEnterFootprint;
        InsideExitFootprint = insideExitFootprint;
        SurfaceContact = surfaceContact;
        LateralGroundSpeedMps = lateralGroundSpeedMps;
        VerticalSpeedMps = verticalSpeedMps;
        PitchRad = pitchRad;
        BankRad = bankRad;
        EnterViolations = enterViolations;
        ExitViolations = exitViolations;
        GateClass = gateClass;
        ApproachAttemptId = approachAttemptId;
    }

    public string? SiteId { get; }
    public bool InsideTerminalVolume { get; }
    public bool InsideEnterFootprint { get; }
    public bool InsideExitFootprint { get; }
    public bool SurfaceContact { get; }
    public double LateralGroundSpeedMps { get; }
    public double VerticalSpeedMps { get; }
    public double PitchRad { get; }
    public double BankRad { get; }
    public LandingZoneGateViolation EnterViolations { get; }
    public LandingZoneGateViolation ExitViolations { get; }
    public LandingZoneGateClass GateClass { get; }
    public long ApproachAttemptId { get; }

    public static LandingZoneObservation None { get; } = new(
        siteId: null,
        insideTerminalVolume: false,
        insideEnterFootprint: false,
        insideExitFootprint: false,
        surfaceContact: false,
        lateralGroundSpeedMps: 0.0,
        verticalSpeedMps: 0.0,
        pitchRad: 0.0,
        bankRad: 0.0,
        enterViolations:
            LandingZoneGateViolation.OutsideTerminalVolume
            | LandingZoneGateViolation.OutsideEnterFootprint
            | LandingZoneGateViolation.OutsideExitFootprint
            | LandingZoneGateViolation.NoSurfaceContact,
        exitViolations:
            LandingZoneGateViolation.OutsideTerminalVolume
            | LandingZoneGateViolation.OutsideExitFootprint
            | LandingZoneGateViolation.NoSurfaceContact,
        LandingZoneGateClass.Break);

    public static LandingZoneObservation Resolve(
        string siteId,
        bool insideTerminalVolume,
        bool insideEnterFootprint,
        bool insideExitFootprint,
        bool surfaceContact,
        double lateralGroundSpeedMps,
        double verticalSpeedMps,
        double pitchRad,
        double bankRad,
        LandingZoneGateProfileDefinition gateProfile,
        long approachAttemptId = 0) {
        CasevacDefinitionValidation.StableId(siteId, nameof(siteId));
        if (gateProfile is null)
            throw new ArgumentNullException(nameof(gateProfile));

        LandingZoneGateViolation enterViolations = GeometryViolations(
            insideTerminalVolume,
            insideEnterFootprint,
            insideExitFootprint,
            surfaceContact,
            useEnterFootprint: true);
        LandingZoneGateViolation exitViolations = GeometryViolations(
            insideTerminalVolume,
            insideEnterFootprint,
            insideExitFootprint,
            surfaceContact,
            useEnterFootprint: false);

        if (lateralGroundSpeedMps
            > gateProfile.MaximumEnterLateralGroundSpeedMps)
            enterViolations |= LandingZoneGateViolation.LateralGroundSpeed;
        if (lateralGroundSpeedMps
            > gateProfile.MaximumExitLateralGroundSpeedMps)
            exitViolations |= LandingZoneGateViolation.LateralGroundSpeed;
        if (System.Math.Abs(verticalSpeedMps)
            > gateProfile.MaximumEnterAbsoluteVerticalSpeedMps)
            enterViolations |= LandingZoneGateViolation.VerticalSpeed;
        if (System.Math.Abs(verticalSpeedMps)
            > gateProfile.MaximumExitAbsoluteVerticalSpeedMps)
            exitViolations |= LandingZoneGateViolation.VerticalSpeed;
        if (System.Math.Abs(pitchRad)
            > gateProfile.MaximumEnterAbsolutePitchRad)
            enterViolations |= LandingZoneGateViolation.Pitch;
        if (System.Math.Abs(pitchRad)
            > gateProfile.MaximumExitAbsolutePitchRad)
            exitViolations |= LandingZoneGateViolation.Pitch;
        if (System.Math.Abs(bankRad)
            > gateProfile.MaximumEnterAbsoluteBankRad)
            enterViolations |= LandingZoneGateViolation.Bank;
        if (System.Math.Abs(bankRad)
            > gateProfile.MaximumExitAbsoluteBankRad)
            exitViolations |= LandingZoneGateViolation.Bank;

        LandingZoneGateClass gateClass =
            exitViolations != LandingZoneGateViolation.None
                ? LandingZoneGateClass.Break
                : enterViolations == LandingZoneGateViolation.None
                    ? LandingZoneGateClass.Advance
                    : LandingZoneGateClass.Hold;
        return new LandingZoneObservation(
            insideTerminalVolume ? siteId : null,
            insideTerminalVolume,
            insideEnterFootprint,
            insideExitFootprint,
            surfaceContact,
            lateralGroundSpeedMps,
            verticalSpeedMps,
            pitchRad,
            bankRad,
            enterViolations,
            exitViolations,
            gateClass,
            approachAttemptId);
    }

    static LandingZoneGateViolation GeometryViolations(
        bool insideTerminalVolume,
        bool insideEnterFootprint,
        bool insideExitFootprint,
        bool surfaceContact,
        bool useEnterFootprint) {
        LandingZoneGateViolation result = LandingZoneGateViolation.None;
        if (!insideTerminalVolume)
            result |= LandingZoneGateViolation.OutsideTerminalVolume;
        if (useEnterFootprint && !insideEnterFootprint)
            result |= LandingZoneGateViolation.OutsideEnterFootprint;
        if (!insideExitFootprint)
            result |= LandingZoneGateViolation.OutsideExitFootprint;
        if (!surfaceContact)
            result |= LandingZoneGateViolation.NoSurfaceContact;
        return result;
    }

    static void ValidateViolationFlags(
        LandingZoneGateViolation value, string parameterName) {
        const LandingZoneGateViolation all =
            LandingZoneGateViolation.OutsideTerminalVolume
            | LandingZoneGateViolation.OutsideEnterFootprint
            | LandingZoneGateViolation.OutsideExitFootprint
            | LandingZoneGateViolation.NoSurfaceContact
            | LandingZoneGateViolation.LateralGroundSpeed
            | LandingZoneGateViolation.VerticalSpeed
            | LandingZoneGateViolation.Pitch
            | LandingZoneGateViolation.Bank;
        if ((value & ~all) != LandingZoneGateViolation.None)
            throw new ArgumentOutOfRangeException(parameterName);
    }
}

/// <summary>
/// One active authority tick of observer-safe CASEVAC input. It contains flight and LZ facts only;
/// skipped calls are pauses and therefore consume neither urgency time nor evidence capacity.
/// </summary>
public readonly record struct CasevacTickObservation {
    public CasevacTickObservation(
        long sourceTick,
        bool vehicleFlyable,
        bool insideSafeExitVolume,
        in Vec3D position,
        double clearanceM,
        CasevacMaskingState maskingState,
        bool withinSafeMaskingBand,
        bool protectionInterventionActive,
        in LandingZoneObservation landingZone) {
        if (sourceTick < 0)
            throw new ArgumentOutOfRangeException(nameof(sourceTick));
        if (!double.IsFinite(position.X)
            || !double.IsFinite(position.Y)
            || !double.IsFinite(position.Z))
            throw new ArgumentOutOfRangeException(nameof(position));
        if (!double.IsFinite(clearanceM) || clearanceM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(clearanceM));
        if (!Enum.IsDefined(maskingState))
            throw new ArgumentOutOfRangeException(nameof(maskingState));
        if (maskingState == CasevacMaskingState.Masked
            && !withinSafeMaskingBand)
            throw new ArgumentException(
                "Masked evidence must lie inside the authored safe masking band.",
                nameof(withinSafeMaskingBand));

        SourceTick = sourceTick;
        VehicleFlyable = vehicleFlyable;
        InsideSafeExitVolume = insideSafeExitVolume;
        Position = position;
        ClearanceM = clearanceM;
        MaskingState = maskingState;
        WithinSafeMaskingBand = withinSafeMaskingBand;
        ProtectionInterventionActive = protectionInterventionActive;
        LandingZone = landingZone;
    }

    public long SourceTick { get; }
    public bool VehicleFlyable { get; }
    public bool InsideSafeExitVolume { get; }
    public Vec3D Position { get; }
    public double ClearanceM { get; }
    public CasevacMaskingState MaskingState { get; }
    public bool WithinSafeMaskingBand { get; }
    public bool ProtectionInterventionActive { get; }
    public LandingZoneObservation LandingZone { get; }
}

public readonly record struct CasevacMissionEventRecord(
    int SchemaVersion,
    long Sequence,
    long SourceTick,
    long ActiveMissionTicks,
    long MissionEpochSequence,
    CasevacEventKind Kind,
    string ScenarioId,
    string AircraftId,
    string CapsuleId,
    string? SiteId,
    long ApproachAttemptId);

public sealed record CasevacMissionSnapshot(
    int SchemaVersion,
    string ScenarioId,
    long MissionEpochSequence,
    CasevacPhase Phase,
    CapsuleCustody Custody,
    CasevacDisposition Disposition,
    long MissionBeginSourceTick,
    long LastSourceTick,
    long ActiveMissionTicks,
    long CallAgeTicks,
    long RequestedHandoffAgeTicks,
    bool RequestedHandoffWindowPassed,
    bool ClockRunning,
    string? TargetSiteId,
    long CurrentApproachAttemptId,
    long LatestApproachAttemptId,
    bool StableContact,
    int StabilizationProgressTicks,
    int OperationProgressTicks,
    int OperationRequiredTicks,
    int QuietProgressTicks,
    double PayloadMassKg,
    long? CapsuleSecuredCallAgeTicks,
    long? HandoffCallAgeTicks);
