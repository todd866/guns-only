namespace GunsOnly.Sim.Environment;

/// <summary>
/// Renderer-independent state of the material immediately above the geographic terrain surface.
/// Dimensional values use SI units; normalized values describe condition severity and do not
/// certify runway, road, or landing-zone suitability for a particular vehicle.
/// </summary>
public readonly record struct SurfaceConditionSample {
    public const double MaximumFrictionCoefficient = 2.0;
    public const double MaximumSnowDensityKgPerM3 = 1_000.0;
    public const double LiquidWaterDensityKgPerM3 = 1_000.0;

    public double SurfaceTemperatureK { get; }
    public double SnowWaterEquivalentM { get; }
    public double SnowDepthM { get; }
    public double SnowDensityKgPerM3 { get; }
    public double SnowAgeSeconds { get; }
    public double SnowLiquidWaterFraction01 { get; }
    public double SnowCrust01 { get; }
    public double SurfaceWetness01 { get; }
    public double StandingWaterDepthM { get; }
    public double SlushDepthM { get; }
    public double GlazeIceThicknessM { get; }
    public double MudDepthM { get; }
    public double FrictionCoefficient { get; }
    public double BrakingFactor01 { get; }

    /// <summary>
    /// Generic clear, dry reference condition. The friction coefficient is a bounded reference for
    /// later tyre/skid models, not a claim about every dry soil or paved material.
    /// </summary>
    public static SurfaceConditionSample ClearDry { get; } = new(
        surfaceTemperatureK: 288.15,
        snowWaterEquivalentM: 0.0,
        snowDepthM: 0.0,
        snowDensityKgPerM3: 0.0,
        snowAgeSeconds: 0.0,
        snowLiquidWaterFraction01: 0.0,
        snowCrust01: 0.0,
        surfaceWetness01: 0.0,
        standingWaterDepthM: 0.0,
        slushDepthM: 0.0,
        glazeIceThicknessM: 0.0,
        mudDepthM: 0.0,
        frictionCoefficient: 0.8,
        brakingFactor01: 1.0);

    public SurfaceConditionSample(
        double surfaceTemperatureK,
        double snowWaterEquivalentM,
        double snowDepthM,
        double snowDensityKgPerM3,
        double snowAgeSeconds,
        double snowLiquidWaterFraction01,
        double snowCrust01,
        double surfaceWetness01,
        double standingWaterDepthM,
        double slushDepthM,
        double glazeIceThicknessM,
        double mudDepthM,
        double frictionCoefficient,
        double brakingFactor01)
    {
        ValidatePositive(surfaceTemperatureK, nameof(surfaceTemperatureK));
        ValidateNonNegative(snowWaterEquivalentM, nameof(snowWaterEquivalentM));
        ValidateNonNegative(snowDepthM, nameof(snowDepthM));
        ValidateRange(snowDensityKgPerM3, 0.0, MaximumSnowDensityKgPerM3,
            nameof(snowDensityKgPerM3));
        ValidateNonNegative(snowAgeSeconds, nameof(snowAgeSeconds));
        ValidateRange01(snowLiquidWaterFraction01, nameof(snowLiquidWaterFraction01));
        ValidateRange01(snowCrust01, nameof(snowCrust01));
        ValidateRange01(surfaceWetness01, nameof(surfaceWetness01));
        ValidateNonNegative(standingWaterDepthM, nameof(standingWaterDepthM));
        ValidateNonNegative(slushDepthM, nameof(slushDepthM));
        ValidateNonNegative(glazeIceThicknessM, nameof(glazeIceThicknessM));
        ValidateNonNegative(mudDepthM, nameof(mudDepthM));
        ValidateRange(frictionCoefficient, 0.0, MaximumFrictionCoefficient,
            nameof(frictionCoefficient));
        ValidateRange01(brakingFactor01, nameof(brakingFactor01));
        ValidateSnowPack(snowWaterEquivalentM, snowDepthM, snowDensityKgPerM3,
            snowAgeSeconds, snowLiquidWaterFraction01, snowCrust01);

        SurfaceTemperatureK = surfaceTemperatureK;
        SnowWaterEquivalentM = snowWaterEquivalentM;
        SnowDepthM = snowDepthM;
        SnowDensityKgPerM3 = snowDensityKgPerM3;
        SnowAgeSeconds = snowAgeSeconds;
        SnowLiquidWaterFraction01 = snowLiquidWaterFraction01;
        SnowCrust01 = snowCrust01;
        SurfaceWetness01 = surfaceWetness01;
        StandingWaterDepthM = standingWaterDepthM;
        SlushDepthM = slushDepthM;
        GlazeIceThicknessM = glazeIceThicknessM;
        MudDepthM = mudDepthM;
        FrictionCoefficient = frictionCoefficient;
        BrakingFactor01 = brakingFactor01;
    }

    public bool IsPhysical =>
        double.IsFinite(SurfaceTemperatureK) && SurfaceTemperatureK > 0.0
        && IsNonNegative(SnowWaterEquivalentM)
        && IsNonNegative(SnowDepthM)
        && IsInRange(SnowDensityKgPerM3, 0.0, MaximumSnowDensityKgPerM3)
        && IsNonNegative(SnowAgeSeconds)
        && IsInRange01(SnowLiquidWaterFraction01)
        && IsInRange01(SnowCrust01)
        && IsInRange01(SurfaceWetness01)
        && IsNonNegative(StandingWaterDepthM)
        && IsNonNegative(SlushDepthM)
        && IsNonNegative(GlazeIceThicknessM)
        && IsNonNegative(MudDepthM)
        && IsInRange(FrictionCoefficient, 0.0, MaximumFrictionCoefficient)
        && IsInRange01(BrakingFactor01);

    static bool IsNonNegative(double value) => double.IsFinite(value) && value >= 0.0;
    static bool IsInRange01(double value) => IsInRange(value, 0.0, 1.0);
    static bool IsInRange(double value, double minimum, double maximum) =>
        double.IsFinite(value) && value >= minimum && value <= maximum;

    static void ValidatePositive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateNonNegative(double value, string name) {
        if (!IsNonNegative(value)) throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateRange01(double value, string name) =>
        ValidateRange(value, 0.0, 1.0, name);

    static void ValidateRange(double value, double minimum, double maximum, string name) {
        if (!IsInRange(value, minimum, maximum))
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateSnowPack(double waterEquivalentM, double depthM, double densityKgPerM3,
        double ageSeconds, double liquidWaterFraction01, double crust01)
    {
        bool hasSnowMass = waterEquivalentM > 0.0 || depthM > 0.0;
        if (!hasSnowMass) {
            if (densityKgPerM3 != 0.0 || ageSeconds != 0.0
                || liquidWaterFraction01 != 0.0 || crust01 != 0.0)
                throw new ArgumentException(
                    "snow density, age, liquid fraction, and crust require a non-zero snowpack",
                    nameof(waterEquivalentM));
            return;
        }
        if (!(waterEquivalentM > 0.0) || !(depthM > 0.0) || !(densityKgPerM3 > 0.0))
            throw new ArgumentException(
                "snow water equivalent, depth, and density must all be positive together",
                nameof(waterEquivalentM));

        double derivedWaterEquivalentM =
            depthM * densityKgPerM3 / LiquidWaterDensityKgPerM3;
        double toleranceM = Math.Max(1e-9, derivedWaterEquivalentM * 1e-6);
        if (!double.IsFinite(derivedWaterEquivalentM)
            || Math.Abs(waterEquivalentM - derivedWaterEquivalentM) > toleranceM)
            throw new ArgumentException(
                "snow water equivalent must agree with snow depth and density",
                nameof(waterEquivalentM));
    }
}

/// <summary>
/// Samples surface-state truth at local X=east/Z=north coordinates and deterministic simulation
/// time. Geography remains owned independently by <see cref="ITerrainSurface"/>.
/// </summary>
public interface ISurfaceConditionField {
    SurfaceConditionSample Sample(double eastM, double northM, double simulationTimeSeconds);
}

/// <summary>
/// A spatially uniform, time-invariant condition field for deterministic fixtures and authored
/// scenarios which do not yet need a gridded or evolving surface-state product.
/// </summary>
public sealed class UniformSurfaceConditionField : ISurfaceConditionField {
    public static UniformSurfaceConditionField ClearDry { get; } =
        new(SurfaceConditionSample.ClearDry);

    public SurfaceConditionSample Condition { get; }

    public UniformSurfaceConditionField(SurfaceConditionSample condition) {
        if (!condition.IsPhysical)
            throw new ArgumentOutOfRangeException(nameof(condition),
                "surface condition sample must be physical");
        Condition = condition;
    }

    public SurfaceConditionSample Sample(double eastM, double northM,
        double simulationTimeSeconds)
    {
        if (!double.IsFinite(eastM)) throw new ArgumentOutOfRangeException(nameof(eastM));
        if (!double.IsFinite(northM)) throw new ArgumentOutOfRangeException(nameof(northM));
        if (!double.IsFinite(simulationTimeSeconds) || simulationTimeSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(simulationTimeSeconds));
        return Condition;
    }
}
