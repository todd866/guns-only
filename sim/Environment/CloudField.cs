namespace GunsOnly.Sim.Environment;

/// <summary>
/// Local renderer-independent cloud truth. Every dimensional property carries its SI or
/// aviation-weather unit in the name; normalized hazards are deterministic severity fields, not
/// random event outcomes.
/// </summary>
public readonly record struct CloudSample {
    public double CloudFraction01 { get; }
    public double ExtinctionPerMetre { get; }
    public double LiquidWaterKgPerM3 { get; }
    public double IceWaterKgPerM3 { get; }
    public double VisibilityM { get; }
    public double PrecipitationMmPerHour { get; }
    public Vec3D TurbulenceVelocityMps { get; }
    public double VerticalAirVelocityMps { get; }
    public double IcingHazard01 { get; }
    public double LightningHazard01 { get; }

    public CloudSample(
        double cloudFraction01,
        double extinctionPerMetre,
        double liquidWaterKgPerM3,
        double iceWaterKgPerM3,
        double visibilityM,
        double precipitationMmPerHour,
        Vec3D turbulenceVelocityMps,
        double verticalAirVelocityMps,
        double icingHazard01,
        double lightningHazard01)
    {
        ValidateRange(cloudFraction01, 0.0, 1.0, nameof(cloudFraction01));
        ValidateNonNegative(extinctionPerMetre, nameof(extinctionPerMetre));
        ValidateNonNegative(liquidWaterKgPerM3, nameof(liquidWaterKgPerM3));
        ValidateNonNegative(iceWaterKgPerM3, nameof(iceWaterKgPerM3));
        ValidatePositive(visibilityM, nameof(visibilityM));
        ValidateNonNegative(precipitationMmPerHour, nameof(precipitationMmPerHour));
        if (!IsFinite(turbulenceVelocityMps))
            throw new ArgumentOutOfRangeException(nameof(turbulenceVelocityMps));
        if (!double.IsFinite(verticalAirVelocityMps))
            throw new ArgumentOutOfRangeException(nameof(verticalAirVelocityMps));
        ValidateRange(icingHazard01, 0.0, 1.0, nameof(icingHazard01));
        ValidateRange(lightningHazard01, 0.0, 1.0, nameof(lightningHazard01));

        CloudFraction01 = cloudFraction01;
        ExtinctionPerMetre = extinctionPerMetre;
        LiquidWaterKgPerM3 = liquidWaterKgPerM3;
        IceWaterKgPerM3 = iceWaterKgPerM3;
        VisibilityM = visibilityM;
        PrecipitationMmPerHour = precipitationMmPerHour;
        TurbulenceVelocityMps = turbulenceVelocityMps;
        VerticalAirVelocityMps = verticalAirVelocityMps;
        IcingHazard01 = icingHazard01;
        LightningHazard01 = lightningHazard01;
    }

    public bool IsPhysical =>
        IsInRange(CloudFraction01, 0.0, 1.0)
        && IsNonNegative(ExtinctionPerMetre)
        && IsNonNegative(LiquidWaterKgPerM3)
        && IsNonNegative(IceWaterKgPerM3)
        && double.IsFinite(VisibilityM) && VisibilityM > 0.0
        && IsNonNegative(PrecipitationMmPerHour)
        && IsFinite(TurbulenceVelocityMps)
        && double.IsFinite(VerticalAirVelocityMps)
        && IsInRange(IcingHazard01, 0.0, 1.0)
        && IsInRange(LightningHazard01, 0.0, 1.0);

    internal static bool IsFinite(in Vec3D value) =>
        double.IsFinite(value.X) && double.IsFinite(value.Y) && double.IsFinite(value.Z);

    static bool IsNonNegative(double value) => double.IsFinite(value) && value >= 0.0;
    static bool IsInRange(double value, double minimum, double maximum) =>
        double.IsFinite(value) && value >= minimum && value <= maximum;
    static void ValidatePositive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
    static void ValidateNonNegative(double value, string name) {
        if (!IsNonNegative(value)) throw new ArgumentOutOfRangeException(name);
    }
    static void ValidateRange(double value, double minimum, double maximum, string name) {
        if (!IsInRange(value, minimum, maximum))
            throw new ArgumentOutOfRangeException(name);
    }
}

/// <summary>
/// Samples cloud and convective truth at world X=east, Y=geometric altitude, Z=north (metres) and
/// deterministic simulation time. Implementations must not consult wall clock or global state.
/// </summary>
public interface ICloudField {
    CloudSample Sample(in Vec3D worldPositionM, double simulationTimeSeconds);
}

/// <summary>Explicit clear-air field used by weather profiles which omit cloud definitions.</summary>
public sealed class ClearCloudField : ICloudField {
    public const double DefaultClearAirVisibilityM = 100_000.0;
    public static ClearCloudField Instance { get; } = new();
    readonly CloudSample _sample;

    public ClearCloudField(double visibilityM = DefaultClearAirVisibilityM) {
        _sample = new CloudSample(0.0, 0.0, 0.0, 0.0, visibilityM, 0.0,
            Vec3D.Zero, 0.0, 0.0, 0.0);
    }

    public CloudSample Sample(in Vec3D worldPositionM, double simulationTimeSeconds) {
        ValidateSampleCoordinates(worldPositionM, simulationTimeSeconds);
        return _sample;
    }

    internal static void ValidateSampleCoordinates(in Vec3D positionM,
        double simulationTimeSeconds) {
        if (!CloudSample.IsFinite(positionM))
            throw new ArgumentOutOfRangeException(nameof(positionM));
        if (!double.IsFinite(simulationTimeSeconds) || simulationTimeSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(simulationTimeSeconds));
    }
}

public readonly record struct OpticalPathResult(
    double OpticalDepth,
    double Transmission01,
    double MinimumVisibilityM);

/// <summary>Beer-Lambert integration shared by visual and EO sensor models.</summary>
public static class CloudOptics {
    /// <param name="extinctionScale">
    /// Sensor-band multiplier. One consumes the field's broadband visual/EO coefficient; a future
    /// sensor profile may supply a sourced wavelength-specific multiplier without changing weather.
    /// </param>
    public static OpticalPathResult LineSegmentTransmission(
        ICloudField field,
        in Vec3D startWorldM,
        in Vec3D endWorldM,
        double simulationTimeSeconds,
        double maximumStepM = 25.0,
        double extinctionScale = 1.0)
    {
        ArgumentNullException.ThrowIfNull(field);
        ClearCloudField.ValidateSampleCoordinates(startWorldM, simulationTimeSeconds);
        ClearCloudField.ValidateSampleCoordinates(endWorldM, simulationTimeSeconds);
        ValidatePositiveFinite(maximumStepM, nameof(maximumStepM));
        ValidateNonNegativeFinite(extinctionScale, nameof(extinctionScale));

        Vec3D segment = endWorldM - startWorldM;
        double lengthM = segment.Length;
        if (lengthM == 0.0) {
            CloudSample local = field.Sample(startWorldM, simulationTimeSeconds);
            ValidateFieldSample(local);
            return new OpticalPathResult(0.0, 1.0, local.VisibilityM);
        }

        double rawSteps = Math.Ceiling(lengthM / maximumStepM);
        if (!double.IsFinite(rawSteps) || rawSteps > int.MaxValue)
            throw new ArgumentOutOfRangeException(nameof(maximumStepM),
                "optical path requires more integration steps than can be represented");
        int steps = Math.Max(1, (int)rawSteps);
        double ds = lengthM / steps;
        double opticalDepth = 0.0;
        double compensation = 0.0; // Kahan sum keeps long low-extinction paths reproducible.
        double minimumVisibilityM = double.MaxValue;

        for (int i = 0; i < steps; i++) {
            double fraction = (i + 0.5) / steps;
            Vec3D position = startWorldM + segment * fraction;
            CloudSample sample = field.Sample(position, simulationTimeSeconds);
            ValidateFieldSample(sample);
            double increment = sample.ExtinctionPerMetre * extinctionScale * ds;
            double corrected = increment - compensation;
            double next = opticalDepth + corrected;
            compensation = (next - opticalDepth) - corrected;
            opticalDepth = next;
            minimumVisibilityM = Math.Min(minimumVisibilityM, sample.VisibilityM);
        }

        double transmission = Math.Exp(-Math.Min(opticalDepth, 745.0));
        return new OpticalPathResult(opticalDepth, Math.Clamp(transmission, 0.0, 1.0),
            minimumVisibilityM);
    }

    static void ValidateFieldSample(in CloudSample sample) {
        if (!sample.IsPhysical)
            throw new InvalidOperationException("cloud field returned a non-physical sample");
    }
    static void ValidatePositiveFinite(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
    static void ValidateNonNegativeFinite(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
}
