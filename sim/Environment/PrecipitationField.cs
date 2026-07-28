using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Environment;

/// <summary>
/// Mutually exclusive hydrometeor classes used at the weather/aircraft/surface boundary.
/// Rates are stored separately rather than as fractions so overlapping fields add without
/// renormalising away precipitation mass.
/// </summary>
public enum HydrometeorPhase {
    Rain,
    Snow,
    FreezingDrizzle,
    FreezingRain,
    IcePellets,
    Graupel,
    Hail
}

/// <summary>
/// Additive precipitation rates in millimetres of liquid-water equivalent per hour. Snow is not
/// stored as geometric snow depth: density and compaction belong to a future surface-condition
/// model, while this contract preserves water mass through phase changes.
/// </summary>
public readonly record struct HydrometeorRates {
    public double RainMmWaterEquivalentPerHour { get; }
    public double SnowMmWaterEquivalentPerHour { get; }
    public double FreezingDrizzleMmWaterEquivalentPerHour { get; }
    public double FreezingRainMmWaterEquivalentPerHour { get; }
    public double IcePelletsMmWaterEquivalentPerHour { get; }
    public double GraupelMmWaterEquivalentPerHour { get; }
    public double HailMmWaterEquivalentPerHour { get; }

    public HydrometeorRates(
        double rainMmWaterEquivalentPerHour = 0.0,
        double snowMmWaterEquivalentPerHour = 0.0,
        double freezingDrizzleMmWaterEquivalentPerHour = 0.0,
        double freezingRainMmWaterEquivalentPerHour = 0.0,
        double icePelletsMmWaterEquivalentPerHour = 0.0,
        double graupelMmWaterEquivalentPerHour = 0.0,
        double hailMmWaterEquivalentPerHour = 0.0) {
        DefinitionValidation.NonNegative(rainMmWaterEquivalentPerHour,
            nameof(rainMmWaterEquivalentPerHour));
        DefinitionValidation.NonNegative(snowMmWaterEquivalentPerHour,
            nameof(snowMmWaterEquivalentPerHour));
        DefinitionValidation.NonNegative(freezingDrizzleMmWaterEquivalentPerHour,
            nameof(freezingDrizzleMmWaterEquivalentPerHour));
        DefinitionValidation.NonNegative(freezingRainMmWaterEquivalentPerHour,
            nameof(freezingRainMmWaterEquivalentPerHour));
        DefinitionValidation.NonNegative(icePelletsMmWaterEquivalentPerHour,
            nameof(icePelletsMmWaterEquivalentPerHour));
        DefinitionValidation.NonNegative(graupelMmWaterEquivalentPerHour,
            nameof(graupelMmWaterEquivalentPerHour));
        DefinitionValidation.NonNegative(hailMmWaterEquivalentPerHour,
            nameof(hailMmWaterEquivalentPerHour));

        RainMmWaterEquivalentPerHour = rainMmWaterEquivalentPerHour;
        SnowMmWaterEquivalentPerHour = snowMmWaterEquivalentPerHour;
        FreezingDrizzleMmWaterEquivalentPerHour =
            freezingDrizzleMmWaterEquivalentPerHour;
        FreezingRainMmWaterEquivalentPerHour =
            freezingRainMmWaterEquivalentPerHour;
        IcePelletsMmWaterEquivalentPerHour = icePelletsMmWaterEquivalentPerHour;
        GraupelMmWaterEquivalentPerHour = graupelMmWaterEquivalentPerHour;
        HailMmWaterEquivalentPerHour = hailMmWaterEquivalentPerHour;
    }

    public static HydrometeorRates None => default;

    public double TotalMmWaterEquivalentPerHour =>
        RainMmWaterEquivalentPerHour
        + SnowMmWaterEquivalentPerHour
        + FreezingDrizzleMmWaterEquivalentPerHour
        + FreezingRainMmWaterEquivalentPerHour
        + IcePelletsMmWaterEquivalentPerHour
        + GraupelMmWaterEquivalentPerHour
        + HailMmWaterEquivalentPerHour;

    public bool IsPhysical =>
        IsNonNegative(RainMmWaterEquivalentPerHour)
        && IsNonNegative(SnowMmWaterEquivalentPerHour)
        && IsNonNegative(FreezingDrizzleMmWaterEquivalentPerHour)
        && IsNonNegative(FreezingRainMmWaterEquivalentPerHour)
        && IsNonNegative(IcePelletsMmWaterEquivalentPerHour)
        && IsNonNegative(GraupelMmWaterEquivalentPerHour)
        && IsNonNegative(HailMmWaterEquivalentPerHour)
        && double.IsFinite(TotalMmWaterEquivalentPerHour);

    public bool IsNone => TotalMmWaterEquivalentPerHour == 0.0;

    public double RateFor(HydrometeorPhase phase) => phase switch {
        HydrometeorPhase.Rain => RainMmWaterEquivalentPerHour,
        HydrometeorPhase.Snow => SnowMmWaterEquivalentPerHour,
        HydrometeorPhase.FreezingDrizzle => FreezingDrizzleMmWaterEquivalentPerHour,
        HydrometeorPhase.FreezingRain => FreezingRainMmWaterEquivalentPerHour,
        HydrometeorPhase.IcePellets => IcePelletsMmWaterEquivalentPerHour,
        HydrometeorPhase.Graupel => GraupelMmWaterEquivalentPerHour,
        HydrometeorPhase.Hail => HailMmWaterEquivalentPerHour,
        _ => throw new ArgumentOutOfRangeException(nameof(phase))
    };

    public HydrometeorPhase? DominantPhase {
        get {
            if (IsNone) return null;
            HydrometeorPhase phase = HydrometeorPhase.Rain;
            double maximum = RainMmWaterEquivalentPerHour;
            Consider(HydrometeorPhase.Snow, SnowMmWaterEquivalentPerHour,
                ref phase, ref maximum);
            Consider(HydrometeorPhase.FreezingDrizzle,
                FreezingDrizzleMmWaterEquivalentPerHour, ref phase, ref maximum);
            Consider(HydrometeorPhase.FreezingRain,
                FreezingRainMmWaterEquivalentPerHour, ref phase, ref maximum);
            Consider(HydrometeorPhase.IcePellets,
                IcePelletsMmWaterEquivalentPerHour, ref phase, ref maximum);
            Consider(HydrometeorPhase.Graupel, GraupelMmWaterEquivalentPerHour,
                ref phase, ref maximum);
            Consider(HydrometeorPhase.Hail, HailMmWaterEquivalentPerHour,
                ref phase, ref maximum);
            return phase;
        }
    }

    internal HydrometeorRates AddScaled(in HydrometeorRates source, double scale) {
        DefinitionValidation.NonNegative(scale, nameof(scale));
        return new HydrometeorRates(
            RainMmWaterEquivalentPerHour
                + source.RainMmWaterEquivalentPerHour * scale,
            SnowMmWaterEquivalentPerHour
                + source.SnowMmWaterEquivalentPerHour * scale,
            FreezingDrizzleMmWaterEquivalentPerHour
                + source.FreezingDrizzleMmWaterEquivalentPerHour * scale,
            FreezingRainMmWaterEquivalentPerHour
                + source.FreezingRainMmWaterEquivalentPerHour * scale,
            IcePelletsMmWaterEquivalentPerHour
                + source.IcePelletsMmWaterEquivalentPerHour * scale,
            GraupelMmWaterEquivalentPerHour
                + source.GraupelMmWaterEquivalentPerHour * scale,
            HailMmWaterEquivalentPerHour
                + source.HailMmWaterEquivalentPerHour * scale);
    }

    static bool IsNonNegative(double value) => double.IsFinite(value) && value >= 0.0;

    static void Consider(HydrometeorPhase candidate, double rate,
        ref HydrometeorPhase phase, ref double maximum) {
        if (rate <= maximum) return;
        phase = candidate;
        maximum = rate;
    }
}

/// <summary>
/// Local falling-hydrometeor truth. Extinction is independent of cloud extinction so rain or snow
/// below cloud base can reduce visibility without inventing condensate around the observer.
/// </summary>
public readonly record struct PrecipitationSample {
    public HydrometeorRates Rates { get; }
    public double ExtinctionPerMetre { get; }
    public double VisibilityM { get; }

    public PrecipitationSample(in HydrometeorRates rates,
        double extinctionPerMetre, double visibilityM) {
        if (!rates.IsPhysical) throw new ArgumentOutOfRangeException(nameof(rates));
        DefinitionValidation.NonNegative(extinctionPerMetre, nameof(extinctionPerMetre));
        DefinitionValidation.Positive(visibilityM, nameof(visibilityM));
        Rates = rates;
        ExtinctionPerMetre = extinctionPerMetre;
        VisibilityM = visibilityM;
    }

    public double TotalMmWaterEquivalentPerHour =>
        Rates.TotalMmWaterEquivalentPerHour;
    public bool IsPhysical => Rates.IsPhysical
        && double.IsFinite(ExtinctionPerMetre) && ExtinctionPerMetre >= 0.0
        && double.IsFinite(VisibilityM) && VisibilityM > 0.0;
}

/// <summary>
/// Samples falling precipitation at world X=east, Y=geometric altitude, Z=north (metres) and
/// deterministic simulation time. Implementations must not consult wall clock or global state.
/// </summary>
public interface IPrecipitationField {
    PrecipitationSample Sample(in Vec3D worldPositionM, double simulationTimeSeconds);
}

/// <summary>Explicit no-precipitation field used by backwards-compatible weather profiles.</summary>
public sealed class ClearPrecipitationField : IPrecipitationField {
    public static ClearPrecipitationField Instance { get; } = new();
    readonly PrecipitationSample _sample;

    public ClearPrecipitationField(
        double visibilityM = ClearCloudField.DefaultClearAirVisibilityM) {
        _sample = new PrecipitationSample(HydrometeorRates.None, 0.0, visibilityM);
    }

    public PrecipitationSample Sample(in Vec3D worldPositionM,
        double simulationTimeSeconds) {
        ClearCloudField.ValidateSampleCoordinates(worldPositionM, simulationTimeSeconds);
        return _sample;
    }
}

/// <summary>
/// Broad, vertically bounded precipitation with deterministic advected holes. Set coverage to one
/// for a uniform snow shield or freezing-drizzle deck; lower coverage produces coherent bands.
/// </summary>
public sealed class StratiformPrecipitationDefinition {
    public double BottomAltitudeM { get; }
    public double TopAltitudeM { get; }
    public double MeanCoverage01 { get; }
    public double HorizontalStructureScaleM { get; }
    public double VerticalEdgeTransitionM { get; }
    public HydrometeorRates RatesAtFullIntensity { get; }
    public double ExtinctionPerMetreAtFullIntensity { get; }
    public Vec3D AdvectionVelocityMps { get; }

    public StratiformPrecipitationDefinition(
        double bottomAltitudeM,
        double topAltitudeM,
        double meanCoverage01,
        double horizontalStructureScaleM,
        HydrometeorRates ratesAtFullIntensity,
        double extinctionPerMetreAtFullIntensity,
        Vec3D advectionVelocityMps = default,
        double verticalEdgeTransitionM = 50.0) {
        DefinitionValidation.Finite(bottomAltitudeM, nameof(bottomAltitudeM));
        DefinitionValidation.Finite(topAltitudeM, nameof(topAltitudeM));
        if (topAltitudeM <= bottomAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(topAltitudeM));
        DefinitionValidation.Range01(meanCoverage01, nameof(meanCoverage01));
        DefinitionValidation.Positive(horizontalStructureScaleM,
            nameof(horizontalStructureScaleM));
        DefinitionValidation.Positive(verticalEdgeTransitionM,
            nameof(verticalEdgeTransitionM));
        if (verticalEdgeTransitionM > 0.5 * (topAltitudeM - bottomAltitudeM))
            throw new ArgumentOutOfRangeException(nameof(verticalEdgeTransitionM),
                "edge transition cannot exceed half the precipitation depth");
        if (!ratesAtFullIntensity.IsPhysical)
            throw new ArgumentOutOfRangeException(nameof(ratesAtFullIntensity));
        DefinitionValidation.NonNegative(extinctionPerMetreAtFullIntensity,
            nameof(extinctionPerMetreAtFullIntensity));
        DefinitionValidation.HorizontalVector(advectionVelocityMps,
            nameof(advectionVelocityMps));

        BottomAltitudeM = bottomAltitudeM;
        TopAltitudeM = topAltitudeM;
        MeanCoverage01 = meanCoverage01;
        HorizontalStructureScaleM = horizontalStructureScaleM;
        VerticalEdgeTransitionM = verticalEdgeTransitionM;
        RatesAtFullIntensity = ratesAtFullIntensity;
        ExtinctionPerMetreAtFullIntensity = extinctionPerMetreAtFullIntensity;
        AdvectionVelocityMps = advectionVelocityMps;
    }
}

/// <summary>
/// Finite, moving precipitation shaft. Unlike a cloud ellipsoid, its horizontal footprint remains
/// vertically aligned between authored bottom and top altitudes so hydrometeors can reach terrain.
/// </summary>
public sealed class PrecipitationShaftDefinition {
    public double InitialCentreEastM { get; }
    public double InitialCentreNorthM { get; }
    public double HorizontalRadiusEastM { get; }
    public double HorizontalRadiusNorthM { get; }
    public double BottomAltitudeM { get; }
    public double TopAltitudeM { get; }
    public double StartTimeSeconds { get; }
    public double LifetimeSeconds { get; }
    public double LifecycleTransitionSeconds { get; }
    public double VerticalEdgeTransitionM { get; }
    public Vec3D AdvectionVelocityMps { get; }
    public HydrometeorRates PeakRates { get; }
    public double PeakExtinctionPerMetre { get; }

    public PrecipitationShaftDefinition(
        double initialCentreEastM,
        double initialCentreNorthM,
        double horizontalRadiusEastM,
        double horizontalRadiusNorthM,
        double bottomAltitudeM,
        double topAltitudeM,
        double startTimeSeconds,
        double lifetimeSeconds,
        Vec3D advectionVelocityMps,
        HydrometeorRates peakRates,
        double peakExtinctionPerMetre,
        double lifecycleTransitionSeconds = 30.0,
        double verticalEdgeTransitionM = 25.0) {
        DefinitionValidation.Finite(initialCentreEastM, nameof(initialCentreEastM));
        DefinitionValidation.Finite(initialCentreNorthM, nameof(initialCentreNorthM));
        DefinitionValidation.Positive(horizontalRadiusEastM,
            nameof(horizontalRadiusEastM));
        DefinitionValidation.Positive(horizontalRadiusNorthM,
            nameof(horizontalRadiusNorthM));
        DefinitionValidation.Finite(bottomAltitudeM, nameof(bottomAltitudeM));
        DefinitionValidation.Finite(topAltitudeM, nameof(topAltitudeM));
        if (topAltitudeM <= bottomAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(topAltitudeM));
        DefinitionValidation.NonNegative(startTimeSeconds, nameof(startTimeSeconds));
        DefinitionValidation.Positive(lifetimeSeconds, nameof(lifetimeSeconds));
        DefinitionValidation.NonNegative(lifecycleTransitionSeconds,
            nameof(lifecycleTransitionSeconds));
        if (lifecycleTransitionSeconds > 0.5 * lifetimeSeconds)
            throw new ArgumentOutOfRangeException(nameof(lifecycleTransitionSeconds),
                "lifecycle transition cannot exceed half the shaft lifetime");
        DefinitionValidation.Positive(verticalEdgeTransitionM,
            nameof(verticalEdgeTransitionM));
        if (verticalEdgeTransitionM > 0.5 * (topAltitudeM - bottomAltitudeM))
            throw new ArgumentOutOfRangeException(nameof(verticalEdgeTransitionM),
                "edge transition cannot exceed half the precipitation depth");
        DefinitionValidation.HorizontalVector(advectionVelocityMps,
            nameof(advectionVelocityMps));
        if (!peakRates.IsPhysical)
            throw new ArgumentOutOfRangeException(nameof(peakRates));
        DefinitionValidation.NonNegative(peakExtinctionPerMetre,
            nameof(peakExtinctionPerMetre));

        InitialCentreEastM = initialCentreEastM;
        InitialCentreNorthM = initialCentreNorthM;
        HorizontalRadiusEastM = horizontalRadiusEastM;
        HorizontalRadiusNorthM = horizontalRadiusNorthM;
        BottomAltitudeM = bottomAltitudeM;
        TopAltitudeM = topAltitudeM;
        StartTimeSeconds = startTimeSeconds;
        LifetimeSeconds = lifetimeSeconds;
        LifecycleTransitionSeconds = lifecycleTransitionSeconds;
        VerticalEdgeTransitionM = verticalEdgeTransitionM;
        AdvectionVelocityMps = advectionVelocityMps;
        PeakRates = peakRates;
        PeakExtinctionPerMetre = peakExtinctionPerMetre;
    }
}

/// <summary>
/// Deterministic additive superposition of broad stratiform precipitation and bounded shafts.
/// This field deliberately owns falling hydrometeors only; cloud condensate remains in ICloudField.
/// </summary>
public sealed class LayeredPrecipitationField : IPrecipitationField {
    readonly StratiformPrecipitationDefinition[] _stratiform;
    readonly PrecipitationShaftDefinition[] _shafts;
    readonly ulong _seed;
    readonly double _clearAirVisibilityM;

    public IReadOnlyList<StratiformPrecipitationDefinition> StratiformBands { get; }
    public IReadOnlyList<PrecipitationShaftDefinition> Shafts { get; }
    public ulong Seed => _seed;
    public double ClearAirVisibilityM => _clearAirVisibilityM;

    public LayeredPrecipitationField(
        IEnumerable<StratiformPrecipitationDefinition>? stratiformBands = null,
        IEnumerable<PrecipitationShaftDefinition>? shafts = null,
        ulong seed = 1,
        double clearAirVisibilityM = ClearCloudField.DefaultClearAirVisibilityM) {
        _stratiform = stratiformBands?.ToArray() ?? [];
        _shafts = shafts?.ToArray() ?? [];
        if (_stratiform.Any(definition => definition is null))
            throw new ArgumentException("stratiform bands cannot contain null",
                nameof(stratiformBands));
        if (_shafts.Any(definition => definition is null))
            throw new ArgumentException("precipitation shafts cannot contain null",
                nameof(shafts));
        DefinitionValidation.Positive(clearAirVisibilityM,
            nameof(clearAirVisibilityM));

        _seed = seed;
        _clearAirVisibilityM = clearAirVisibilityM;
        StratiformBands = Array.AsReadOnly(_stratiform);
        Shafts = Array.AsReadOnly(_shafts);
    }

    public PrecipitationSample Sample(in Vec3D worldPositionM,
        double simulationTimeSeconds) {
        ClearCloudField.ValidateSampleCoordinates(worldPositionM, simulationTimeSeconds);

        HydrometeorRates rates = HydrometeorRates.None;
        double extinction = 0.0;
        for (int i = 0; i < _stratiform.Length; i++) {
            StratiformPrecipitationDefinition definition = _stratiform[i];
            double vertical = VerticalEnvelope(worldPositionM.Y,
                definition.BottomAltitudeM, definition.TopAltitudeM,
                definition.VerticalEdgeTransitionM);
            if (vertical <= 0.0 || definition.MeanCoverage01 <= 0.0) continue;

            double advectedEast = worldPositionM.X
                - definition.AdvectionVelocityMps.X * simulationTimeSeconds;
            double advectedNorth = worldPositionM.Z
                - definition.AdvectionVelocityMps.Z * simulationTimeSeconds;
            double horizontal = HorizontalCoverage(advectedEast, advectedNorth,
                definition.HorizontalStructureScaleM, definition.MeanCoverage01,
                Salt(i, 0xc5b2_8a61_39d4_07efUL));
            Accumulate(vertical * horizontal, definition.RatesAtFullIntensity,
                definition.ExtinctionPerMetreAtFullIntensity,
                ref rates, ref extinction);
        }

        for (int i = 0; i < _shafts.Length; i++) {
            PrecipitationShaftDefinition definition = _shafts[i];
            double age = simulationTimeSeconds - definition.StartTimeSeconds;
            if (age < 0.0 || age > definition.LifetimeSeconds) continue;
            double life = LifecycleEnvelope(age, definition.LifetimeSeconds,
                definition.LifecycleTransitionSeconds);
            double vertical = VerticalEnvelope(worldPositionM.Y,
                definition.BottomAltitudeM, definition.TopAltitudeM,
                definition.VerticalEdgeTransitionM);
            if (life <= 0.0 || vertical <= 0.0) continue;

            double centreEast = definition.InitialCentreEastM
                + definition.AdvectionVelocityMps.X * age;
            double centreNorth = definition.InitialCentreNorthM
                + definition.AdvectionVelocityMps.Z * age;
            double east = (worldPositionM.X - centreEast)
                / definition.HorizontalRadiusEastM;
            double north = (worldPositionM.Z - centreNorth)
                / definition.HorizontalRadiusNorthM;
            double radiusSquared = east * east + north * north;
            if (radiusSquared >= 1.0) continue;
            double horizontal = SmoothStep(1.0 - radiusSquared);
            Accumulate(life * vertical * horizontal, definition.PeakRates,
                definition.PeakExtinctionPerMetre, ref rates, ref extinction);
        }

        if (!rates.IsPhysical || !double.IsFinite(extinction))
            throw new InvalidOperationException(
                "precipitation definitions overflowed finite sample range");
        double visibilityM = extinction > 0.0
            ? Math.Min(_clearAirVisibilityM, Math.Max(1e-6, 3.912 / extinction))
            : _clearAirVisibilityM;
        return new PrecipitationSample(rates, Math.Max(0.0, extinction), visibilityM);
    }

    static void Accumulate(double intensity, in HydrometeorRates sourceRates,
        double sourceExtinction, ref HydrometeorRates rates, ref double extinction) {
        if (intensity <= 0.0) return;
        rates = rates.AddScaled(sourceRates, intensity);
        extinction += sourceExtinction * intensity;
    }

    static double HorizontalCoverage(double eastM, double northM, double scaleM,
        double meanCoverage01, ulong salt) {
        if (meanCoverage01 <= 0.0) return 0.0;
        if (meanCoverage01 >= 1.0) return 1.0;
        double x = eastM / scaleM;
        double z = northM / scaleM;
        double noise = 0.68 * Hashing.Value(x, 0.0, z, salt)
            + 0.22 * Hashing.Value(x * 2.07, 11.0, z * 2.07, salt + 0x9e37UL)
            + 0.10 * Hashing.Value(x * 4.13, -7.0, z * 4.13, salt + 0x51edUL);
        double normalized = Math.Clamp(0.5 + 0.5 * noise, 0.0, 1.0);
        const double transition = 0.14;
        double threshold = 1.0 - meanCoverage01;
        return SmoothStep((normalized - threshold + transition)
            / (2.0 * transition));
    }

    static double VerticalEnvelope(double altitudeM, double bottomM, double topM,
        double edgeM) {
        if (altitudeM <= bottomM || altitudeM >= topM) return 0.0;
        return SmoothStep((altitudeM - bottomM) / edgeM)
            * SmoothStep((topM - altitudeM) / edgeM);
    }

    static double LifecycleEnvelope(double ageSeconds, double lifetimeSeconds,
        double transitionSeconds) {
        if (ageSeconds < 0.0 || ageSeconds > lifetimeSeconds) return 0.0;
        if (transitionSeconds <= 0.0) return 1.0;
        return SmoothStep(ageSeconds / transitionSeconds)
            * SmoothStep((lifetimeSeconds - ageSeconds) / transitionSeconds);
    }

    static double SmoothStep(double value) {
        double t = Math.Clamp(value, 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    ulong Salt(int index, ulong family) {
        unchecked {
            return _seed ^ family ^ ((ulong)(index + 1) * 0x9e37_79b9_7f4a_7c15UL);
        }
    }
}
