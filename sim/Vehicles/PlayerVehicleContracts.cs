using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Vehicles;

/// <summary>
/// Versioned boundary between the production session and one player-vehicle dynamics provider.
/// This is deliberately smaller than a general entity/component framework.
/// </summary>
public static class PlayerVehicleContract {
    public const int SchemaVersion = 1;
    public const double FixedStepHz = AircraftSim.TickHz;
    public const double FixedDeltaSeconds = 1.0 / FixedStepHz;
}

public enum PlayerVehicleKind {
    FixedWing,
    VerticalLift,
    Motorcycle
}

public enum VehicleCommandFamily {
    None,
    FixedWingPilot,
    VerticalLiftPilot,
    MotorcyclePilot
}

public enum VehicleContactAuthority {
    ExternalResolver,
    IntegratedSkidContact
}

public enum VehicleContactKind {
    Unknown,
    Airborne,
    SurfaceContact,
    StableSurfaceContact,
    HardImpact
}

public enum VehiclePowerAssessment {
    NotAssessed,
    Assessed
}

public enum VehicleProtectionInterventionKind {
    None,
    ExternalSafetySystem,
    GroundCollisionAvoidance,
    FlightEnvelopeProtection,
    Other
}

/// <summary>
/// Semantic vertical-lift controls. Collective is 0..1. Positive forward cyclic tilts lift
/// toward the current heading; positive right cyclic tilts it to the aircraft's right. Yaw is
/// normalized left/right pedal demand.
/// </summary>
public readonly record struct VerticalLiftPilotCommand(
    double Collective,
    double ForwardCyclic,
    double RightCyclic,
    double Yaw);

/// <summary>
/// Closed semantic command union. A provider rejects commands from the wrong family instead of
/// silently interpreting fixed-wing fields as rotorcraft controls.
/// </summary>
public readonly record struct PlayerVehicleCommand(
    VehicleCommandFamily Family,
    PilotCommand FixedWing,
    VerticalLiftPilotCommand VerticalLift,
    MotorcyclePilotCommand Motorcycle = default) {

    public static PlayerVehicleCommand FromFixedWing(in PilotCommand command) =>
        new(VehicleCommandFamily.FixedWingPilot, command, default, default);

    public static PlayerVehicleCommand FromVerticalLift(
        in VerticalLiftPilotCommand command) =>
        new(VehicleCommandFamily.VerticalLiftPilot, default, command, default);

    public static PlayerVehicleCommand FromMotorcycle(
        in MotorcyclePilotCommand command) =>
        new(VehicleCommandFamily.MotorcyclePilot, default, default, command);
}

public sealed record PlayerVehicleCapability(
    int SchemaVersion,
    string CapabilityVersion,
    string VehicleId,
    string DynamicsProviderId,
    PlayerVehicleKind VehicleKind,
    VehicleCommandFamily CommandFamily,
    VehicleContactAuthority ContactAuthority,
    double FixedStepHz,
    double MaximumGrossMassKg,
    double MaximumAdditivePayloadMassKg,
    bool ReportsPowerMargin,
    bool ReportsWindResponse,
    bool ReportsProtectionInterventionEvidence,
    string FidelityDisclosure);

public readonly record struct VehicleSurfaceSample(
    bool IsKnown,
    string? SurfaceId,
    double HeightM,
    Vec3D UpNormal,
    double FrictionPerSecond) {

    public static VehicleSurfaceSample Unknown => new(
        false,
        null,
        0.0,
        new Vec3D(0.0, 1.0, 0.0),
        0.0);

    public static VehicleSurfaceSample Horizontal(
        string surfaceId,
        double heightM,
        double frictionPerSecond = 2.5) =>
        new(
            true,
            surfaceId,
            heightM,
            new Vec3D(0.0, 1.0, 0.0),
            frictionPerSecond);
}

/// <summary>
/// Environment truth sampled for this authority tick. Fixed-wing AircraftSim continues to consume
/// its own already-attached atmosphere/wind providers; the adapter derives its observation from
/// that simulation so this sample cannot perturb legacy behavior.
/// </summary>
public readonly record struct PlayerVehicleEnvironmentSample(
    double AirDensityKgM3,
    Vec3D WindVelocityMps,
    VehicleSurfaceSample Surface) {

    public static PlayerVehicleEnvironmentSample StandardStillAir => new(
        1.225,
        Vec3D.Zero,
        VehicleSurfaceSample.Unknown);
}

public readonly record struct VehicleContactState(
    VehicleContactKind Kind,
    string? SurfaceId,
    Vec3D SurfaceNormal,
    double NormalImpactSpeedMps) {

    public bool IsInContact => Kind is
        VehicleContactKind.SurfaceContact
        or VehicleContactKind.StableSurfaceContact
        or VehicleContactKind.HardImpact;

    public bool IsStable => Kind == VehicleContactKind.StableSurfaceContact;

    public static VehicleContactState Unknown => new(
        VehicleContactKind.Unknown,
        null,
        new Vec3D(0.0, 1.0, 0.0),
        0.0);

    public static VehicleContactState Airborne => new(
        VehicleContactKind.Airborne,
        null,
        new Vec3D(0.0, 1.0, 0.0),
        0.0);
}

/// <summary>
/// Generic evidence that another authoritative protection layer changed or held the command.
/// It intentionally does not encode an Auto-GCAS-specific state machine.
/// </summary>
public readonly record struct VehicleProtectionInterventionEvidence(
    bool Active,
    VehicleProtectionInterventionKind Kind,
    string Cue,
    long Sequence) {

    public static VehicleProtectionInterventionEvidence None => new(
        false,
        VehicleProtectionInterventionKind.None,
        "",
        0);
}

public readonly record struct VehiclePowerObservation(
    VehiclePowerAssessment Assessment,
    double AvailablePowerW,
    double AppliedPowerW,
    double HoverPowerRequiredW,
    double HoverPowerMarginFraction) {

    public static VehiclePowerObservation NotAssessed => new(
        VehiclePowerAssessment.NotAssessed,
        0.0,
        0.0,
        0.0,
        0.0);
}

public readonly record struct PlayerVehicleState(
    int SchemaVersion,
    long Tick,
    string VehicleId,
    Vec3D PositionWorldM,
    Vec3D GroundVelocityMps,
    QuaternionD BodyAttitude,
    BodyRates BodyRates,
    double RecurringBaseMassKg,
    double AdditivePayloadMassKg,
    double GrossMassKg,
    VehicleContactState Contact,
    bool Flyable);

public readonly record struct PlayerVehicleObservation(
    int SchemaVersion,
    long Tick,
    string VehicleId,
    Vec3D PositionWorldM,
    Vec3D GroundVelocityMps,
    Vec3D AirVelocityMps,
    Vec3D WindVelocityMps,
    double GroundSpeedMps,
    double TrueAirspeedMps,
    double VerticalSpeedMps,
    double PitchRad,
    double RollRad,
    double YawRad,
    double GrossMassKg,
    VehiclePowerObservation Power,
    VehicleContactState Contact,
    VehicleProtectionInterventionEvidence ProtectionIntervention,
    bool Flyable);

/// <summary>
/// One recurring authority input. RecurringBaseMassKg must exclude the CASEVAC payload; the
/// provider derives gross mass as base + payload on every tick, so custody changes are idempotent
/// and cannot accumulate mass.
/// </summary>
public readonly record struct PlayerVehicleAdvanceInput(
    long Tick,
    PlayerVehicleCommand Command,
    double RecurringBaseMassKg,
    double AdditivePayloadMassKg,
    PlayerVehicleEnvironmentSample Environment,
    VehicleContactState ExternalContact,
    VehicleProtectionInterventionEvidence ProtectionIntervention);

public readonly record struct PlayerVehicleAdvanceResult(
    PlayerVehicleState State,
    PlayerVehicleObservation Observation);

public interface IPlayerVehicleDynamics {
    PlayerVehicleCapability Capability { get; }
    PlayerVehicleState State { get; }
    PlayerVehicleObservation Observation { get; }

    PlayerVehicleAdvanceResult Advance(in PlayerVehicleAdvanceInput input);
}

internal static class PlayerVehicleValidation {
    public static void Capability(PlayerVehicleCapability capability) {
        ArgumentNullException.ThrowIfNull(capability);
        if (capability.SchemaVersion != PlayerVehicleContract.SchemaVersion)
            throw new ArgumentException(
                "Unsupported player-vehicle capability schema.",
                nameof(capability));
        Required(capability.CapabilityVersion, nameof(capability.CapabilityVersion));
        Required(capability.VehicleId, nameof(capability.VehicleId));
        Required(capability.DynamicsProviderId, nameof(capability.DynamicsProviderId));
        Required(capability.FidelityDisclosure, nameof(capability.FidelityDisclosure));
        Positive(capability.FixedStepHz, nameof(capability.FixedStepHz));
        if (Math.Abs(capability.FixedStepHz - PlayerVehicleContract.FixedStepHz)
            > 1e-12)
            throw new ArgumentException(
                "The first player-vehicle seam advances only at the production 120 Hz step.",
                nameof(capability));
        Positive(capability.MaximumGrossMassKg,
            nameof(capability.MaximumGrossMassKg));
        NonNegative(capability.MaximumAdditivePayloadMassKg,
            nameof(capability.MaximumAdditivePayloadMassKg));
        if (capability.CommandFamily == VehicleCommandFamily.None)
            throw new ArgumentException(
                "A vehicle capability needs a semantic command family.",
                nameof(capability));
    }

    public static void AdvanceInput(
        in PlayerVehicleAdvanceInput input,
        VehicleCommandFamily requiredFamily,
        long? previousTick) {
        if (input.Tick < 0)
            throw new ArgumentOutOfRangeException(nameof(input.Tick));
        if (previousTick.HasValue && input.Tick != previousTick.Value + 1)
            throw new InvalidOperationException(
                "Player-vehicle authority ticks must be contiguous.");
        if (input.Command.Family != requiredFamily)
            throw new InvalidOperationException(
                "The semantic command family does not match this vehicle provider.");
        Positive(input.RecurringBaseMassKg,
            nameof(input.RecurringBaseMassKg));
        NonNegative(input.AdditivePayloadMassKg,
            nameof(input.AdditivePayloadMassKg));
        Environment(input.Environment);
        Contact(input.ExternalContact);
        Intervention(input.ProtectionIntervention);
    }

    public static void Environment(in PlayerVehicleEnvironmentSample environment) {
        Positive(environment.AirDensityKgM3,
            nameof(environment.AirDensityKgM3));
        Finite(environment.WindVelocityMps,
            nameof(environment.WindVelocityMps));
        VehicleSurfaceSample surface = environment.Surface;
        if (!surface.UpNormal.IsFinite || surface.UpNormal.Length < 1e-9)
            throw new ArgumentOutOfRangeException(nameof(environment),
                "Surface normal must be finite and non-zero.");
        if (!surface.IsKnown) return;
        Required(surface.SurfaceId, nameof(surface.SurfaceId));
        Finite(surface.HeightM, nameof(surface.HeightM));
        NonNegative(surface.FrictionPerSecond,
            nameof(surface.FrictionPerSecond));
    }

    public static void Contact(in VehicleContactState contact) {
        if (!contact.SurfaceNormal.IsFinite || contact.SurfaceNormal.Length < 1e-9)
            throw new ArgumentOutOfRangeException(nameof(contact),
                "Contact normal must be finite and non-zero.");
        NonNegative(contact.NormalImpactSpeedMps,
            nameof(contact.NormalImpactSpeedMps));
        if (contact.IsInContact) Required(contact.SurfaceId, nameof(contact.SurfaceId));
    }

    public static void Intervention(
        in VehicleProtectionInterventionEvidence intervention) {
        if (intervention.Sequence < 0)
            throw new ArgumentOutOfRangeException(nameof(intervention.Sequence));
        if (!intervention.Active) {
            if (intervention.Kind != VehicleProtectionInterventionKind.None)
                throw new ArgumentException(
                    "Inactive protection evidence must use the None kind.",
                    nameof(intervention));
            return;
        }
        if (intervention.Kind == VehicleProtectionInterventionKind.None)
            throw new ArgumentException(
                "Active protection evidence needs a generic kind.",
                nameof(intervention));
        Required(intervention.Cue, nameof(intervention.Cue));
    }

    public static void Required(string? value, string name) {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("A stable non-empty value is required.", name);
    }

    public static void Positive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    public static void NonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    public static void Finite(double value, string name) {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(name);
    }

    public static void Finite(in Vec3D value, string name) {
        if (!value.IsFinite) throw new ArgumentOutOfRangeException(name);
    }

    public static double WrapPi(double angle) {
        while (angle > Math.PI) angle -= 2.0 * Math.PI;
        while (angle < -Math.PI) angle += 2.0 * Math.PI;
        return angle;
    }

    public static (double Pitch, double Roll, double Yaw) AttitudeAngles(
        in QuaternionD attitude) {
        Vec3D forward = attitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D bodyUp = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        double pitch = Math.Asin(Math.Clamp(forward.Y, -1.0, 1.0));
        double yaw = Math.Atan2(forward.X, forward.Z);
        Vec3D horizonUp = new Vec3D(0.0, 1.0, 0.0)
            - forward * forward.Y;
        if (horizonUp.Length < 1e-9) return (pitch, 0.0, yaw);
        horizonUp = horizonUp.Normalized();
        Vec3D horizonRight = horizonUp.Cross(forward).Normalized();
        double roll = Math.Atan2(
            bodyUp.Dot(horizonRight),
            bodyUp.Dot(horizonUp));
        return (pitch, roll, yaw);
    }
}
