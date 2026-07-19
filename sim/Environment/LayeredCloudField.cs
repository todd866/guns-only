using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Environment;

/// <summary>
/// Immutable stratiform/cloud-deck definition. Microphysics, hazards, and gust amplitudes are
/// deliberately explicit phenomenological inputs until an aircraft/weather data pack supplies a
/// sourced model; none are inferred from a Korea-specific climatology.
/// </summary>
public sealed class CloudLayerDefinition {
    public double BaseAltitudeM { get; }
    public double TopAltitudeM { get; }
    public double MeanCloudFraction01 { get; }
    public double HorizontalStructureScaleM { get; }
    public double VerticalEdgeTransitionM { get; }
    public double ExtinctionPerMetreAtFullCloud { get; }
    public double LiquidWaterKgPerM3AtFullCloud { get; }
    public double IceWaterKgPerM3AtFullCloud { get; }
    public double PrecipitationMmPerHourAtFullCloud { get; }
    public double TurbulenceRmsMpsAtFullCloud { get; }
    public double VerticalAirVelocityMpsAtFullCloud { get; }
    public double IcingHazard01AtFullCloud { get; }
    public double LightningHazard01AtFullCloud { get; }
    public Vec3D AdvectionVelocityMps { get; }

    public CloudLayerDefinition(
        double baseAltitudeM,
        double topAltitudeM,
        double meanCloudFraction01,
        double horizontalStructureScaleM,
        double extinctionPerMetreAtFullCloud,
        double liquidWaterKgPerM3AtFullCloud = 0.0,
        double iceWaterKgPerM3AtFullCloud = 0.0,
        double precipitationMmPerHourAtFullCloud = 0.0,
        double turbulenceRmsMpsAtFullCloud = 0.0,
        double verticalAirVelocityMpsAtFullCloud = 0.0,
        double icingHazard01AtFullCloud = 0.0,
        double lightningHazard01AtFullCloud = 0.0,
        Vec3D advectionVelocityMps = default,
        double verticalEdgeTransitionM = 100.0)
    {
        DefinitionValidation.Finite(baseAltitudeM, nameof(baseAltitudeM));
        DefinitionValidation.Finite(topAltitudeM, nameof(topAltitudeM));
        if (topAltitudeM <= baseAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(topAltitudeM));
        DefinitionValidation.Range01(meanCloudFraction01, nameof(meanCloudFraction01));
        DefinitionValidation.Positive(horizontalStructureScaleM,
            nameof(horizontalStructureScaleM));
        DefinitionValidation.Positive(verticalEdgeTransitionM,
            nameof(verticalEdgeTransitionM));
        if (verticalEdgeTransitionM > 0.5 * (topAltitudeM - baseAltitudeM))
            throw new ArgumentOutOfRangeException(nameof(verticalEdgeTransitionM),
                "edge transition cannot exceed half the layer depth");
        DefinitionValidation.NonNegative(extinctionPerMetreAtFullCloud,
            nameof(extinctionPerMetreAtFullCloud));
        DefinitionValidation.NonNegative(liquidWaterKgPerM3AtFullCloud,
            nameof(liquidWaterKgPerM3AtFullCloud));
        DefinitionValidation.NonNegative(iceWaterKgPerM3AtFullCloud,
            nameof(iceWaterKgPerM3AtFullCloud));
        DefinitionValidation.NonNegative(precipitationMmPerHourAtFullCloud,
            nameof(precipitationMmPerHourAtFullCloud));
        DefinitionValidation.NonNegative(turbulenceRmsMpsAtFullCloud,
            nameof(turbulenceRmsMpsAtFullCloud));
        DefinitionValidation.Finite(verticalAirVelocityMpsAtFullCloud,
            nameof(verticalAirVelocityMpsAtFullCloud));
        DefinitionValidation.Range01(icingHazard01AtFullCloud,
            nameof(icingHazard01AtFullCloud));
        DefinitionValidation.Range01(lightningHazard01AtFullCloud,
            nameof(lightningHazard01AtFullCloud));
        DefinitionValidation.HorizontalVector(advectionVelocityMps,
            nameof(advectionVelocityMps));

        BaseAltitudeM = baseAltitudeM;
        TopAltitudeM = topAltitudeM;
        MeanCloudFraction01 = meanCloudFraction01;
        HorizontalStructureScaleM = horizontalStructureScaleM;
        VerticalEdgeTransitionM = verticalEdgeTransitionM;
        ExtinctionPerMetreAtFullCloud = extinctionPerMetreAtFullCloud;
        LiquidWaterKgPerM3AtFullCloud = liquidWaterKgPerM3AtFullCloud;
        IceWaterKgPerM3AtFullCloud = iceWaterKgPerM3AtFullCloud;
        PrecipitationMmPerHourAtFullCloud = precipitationMmPerHourAtFullCloud;
        TurbulenceRmsMpsAtFullCloud = turbulenceRmsMpsAtFullCloud;
        VerticalAirVelocityMpsAtFullCloud = verticalAirVelocityMpsAtFullCloud;
        IcingHazard01AtFullCloud = icingHazard01AtFullCloud;
        LightningHazard01AtFullCloud = lightningHazard01AtFullCloud;
        AdvectionVelocityMps = advectionVelocityMps;
    }
}

/// <summary>
/// Finite-life, finite-volume convective cell. Its centre moves linearly with deterministic
/// simulation time; the ellipsoidal support remains strictly bounded and vanishes outside the
/// authored lifetime.
/// </summary>
public sealed class ConvectiveCellDefinition {
    public Vec3D InitialCentreWorldM { get; }
    public double HorizontalRadiusEastM { get; }
    public double HorizontalRadiusNorthM { get; }
    public double BaseAltitudeM { get; }
    public double TopAltitudeM { get; }
    public double StartTimeSeconds { get; }
    public double LifetimeSeconds { get; }
    public double LifecycleTransitionSeconds { get; }
    public Vec3D AdvectionVelocityMps { get; }
    public double PeakCloudFraction01 { get; }
    public double PeakExtinctionPerMetre { get; }
    public double PeakLiquidWaterKgPerM3 { get; }
    public double PeakIceWaterKgPerM3 { get; }
    public double PeakPrecipitationMmPerHour { get; }
    public double PeakTurbulenceRmsMps { get; }
    public double PeakVerticalAirVelocityMps { get; }
    public double PeakIcingHazard01 { get; }
    public double PeakLightningHazard01 { get; }

    public ConvectiveCellDefinition(
        Vec3D initialCentreWorldM,
        double horizontalRadiusEastM,
        double horizontalRadiusNorthM,
        double baseAltitudeM,
        double topAltitudeM,
        double startTimeSeconds,
        double lifetimeSeconds,
        Vec3D advectionVelocityMps,
        double peakExtinctionPerMetre,
        double peakCloudFraction01 = 1.0,
        double peakLiquidWaterKgPerM3 = 0.0,
        double peakIceWaterKgPerM3 = 0.0,
        double peakPrecipitationMmPerHour = 0.0,
        double peakTurbulenceRmsMps = 0.0,
        double peakVerticalAirVelocityMps = 0.0,
        double peakIcingHazard01 = 0.0,
        double peakLightningHazard01 = 0.0,
        double lifecycleTransitionSeconds = 30.0)
    {
        if (!CloudSample.IsFinite(initialCentreWorldM))
            throw new ArgumentOutOfRangeException(nameof(initialCentreWorldM));
        DefinitionValidation.Positive(horizontalRadiusEastM, nameof(horizontalRadiusEastM));
        DefinitionValidation.Positive(horizontalRadiusNorthM, nameof(horizontalRadiusNorthM));
        DefinitionValidation.Finite(baseAltitudeM, nameof(baseAltitudeM));
        DefinitionValidation.Finite(topAltitudeM, nameof(topAltitudeM));
        if (topAltitudeM <= baseAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(topAltitudeM));
        double expectedCentreAltitudeM = 0.5 * (baseAltitudeM + topAltitudeM);
        double centreToleranceM = 1e-9 * Math.Max(1.0, Math.Abs(expectedCentreAltitudeM));
        if (Math.Abs(initialCentreWorldM.Y - expectedCentreAltitudeM) > centreToleranceM)
            throw new ArgumentOutOfRangeException(nameof(initialCentreWorldM),
                "cell centre altitude must be midway between base and top");
        DefinitionValidation.NonNegative(startTimeSeconds, nameof(startTimeSeconds));
        DefinitionValidation.Positive(lifetimeSeconds, nameof(lifetimeSeconds));
        DefinitionValidation.NonNegative(lifecycleTransitionSeconds,
            nameof(lifecycleTransitionSeconds));
        if (lifecycleTransitionSeconds > 0.5 * lifetimeSeconds)
            throw new ArgumentOutOfRangeException(nameof(lifecycleTransitionSeconds),
                "lifecycle transition cannot exceed half the cell lifetime");
        DefinitionValidation.HorizontalVector(advectionVelocityMps,
            nameof(advectionVelocityMps));
        DefinitionValidation.Range01(peakCloudFraction01, nameof(peakCloudFraction01));
        DefinitionValidation.NonNegative(peakExtinctionPerMetre,
            nameof(peakExtinctionPerMetre));
        DefinitionValidation.NonNegative(peakLiquidWaterKgPerM3,
            nameof(peakLiquidWaterKgPerM3));
        DefinitionValidation.NonNegative(peakIceWaterKgPerM3,
            nameof(peakIceWaterKgPerM3));
        DefinitionValidation.NonNegative(peakPrecipitationMmPerHour,
            nameof(peakPrecipitationMmPerHour));
        DefinitionValidation.NonNegative(peakTurbulenceRmsMps,
            nameof(peakTurbulenceRmsMps));
        DefinitionValidation.Finite(peakVerticalAirVelocityMps,
            nameof(peakVerticalAirVelocityMps));
        DefinitionValidation.Range01(peakIcingHazard01, nameof(peakIcingHazard01));
        DefinitionValidation.Range01(peakLightningHazard01, nameof(peakLightningHazard01));

        InitialCentreWorldM = initialCentreWorldM;
        HorizontalRadiusEastM = horizontalRadiusEastM;
        HorizontalRadiusNorthM = horizontalRadiusNorthM;
        BaseAltitudeM = baseAltitudeM;
        TopAltitudeM = topAltitudeM;
        StartTimeSeconds = startTimeSeconds;
        LifetimeSeconds = lifetimeSeconds;
        LifecycleTransitionSeconds = lifecycleTransitionSeconds;
        AdvectionVelocityMps = advectionVelocityMps;
        PeakCloudFraction01 = peakCloudFraction01;
        PeakExtinctionPerMetre = peakExtinctionPerMetre;
        PeakLiquidWaterKgPerM3 = peakLiquidWaterKgPerM3;
        PeakIceWaterKgPerM3 = peakIceWaterKgPerM3;
        PeakPrecipitationMmPerHour = peakPrecipitationMmPerHour;
        PeakTurbulenceRmsMps = peakTurbulenceRmsMps;
        PeakVerticalAirVelocityMps = peakVerticalAirVelocityMps;
        PeakIcingHazard01 = peakIcingHazard01;
        PeakLightningHazard01 = peakLightningHazard01;
    }
}

/// <summary>Deterministic superposition of cloud decks and bounded convective cells.</summary>
public sealed class LayeredCloudField : ICloudField {
    readonly CloudLayerDefinition[] _layers;
    readonly ConvectiveCellDefinition[] _cells;
    readonly ulong _seed;
    readonly double _clearAirVisibilityM;

    public IReadOnlyList<CloudLayerDefinition> Layers { get; }
    public IReadOnlyList<ConvectiveCellDefinition> ConvectiveCells { get; }
    public ulong Seed => _seed;
    public double ClearAirVisibilityM => _clearAirVisibilityM;

    public LayeredCloudField(
        IEnumerable<CloudLayerDefinition>? layers = null,
        IEnumerable<ConvectiveCellDefinition>? convectiveCells = null,
        ulong seed = 1,
        double clearAirVisibilityM = ClearCloudField.DefaultClearAirVisibilityM)
    {
        _layers = layers?.ToArray() ?? [];
        _cells = convectiveCells?.ToArray() ?? [];
        if (_layers.Any(layer => layer is null))
            throw new ArgumentException("cloud layers cannot contain null", nameof(layers));
        if (_cells.Any(cell => cell is null))
            throw new ArgumentException("convective cells cannot contain null", nameof(convectiveCells));
        DefinitionValidation.Positive(clearAirVisibilityM, nameof(clearAirVisibilityM));
        _seed = seed;
        _clearAirVisibilityM = clearAirVisibilityM;
        Layers = Array.AsReadOnly(_layers);
        ConvectiveCells = Array.AsReadOnly(_cells);
    }

    public CloudSample Sample(in Vec3D worldPositionM, double simulationTimeSeconds) {
        ClearCloudField.ValidateSampleCoordinates(worldPositionM, simulationTimeSeconds);

        double cloudFraction = 0.0;
        double extinction = 0.0;
        double liquid = 0.0;
        double ice = 0.0;
        double precipitation = 0.0;
        Vec3D turbulence = Vec3D.Zero;
        double verticalAir = 0.0;
        double icing = 0.0;
        double lightning = 0.0;

        for (int i = 0; i < _layers.Length; i++) {
            CloudLayerDefinition layer = _layers[i];
            double vertical = VerticalEnvelope(worldPositionM.Y, layer.BaseAltitudeM,
                layer.TopAltitudeM, layer.VerticalEdgeTransitionM);
            if (vertical <= 0.0 || layer.MeanCloudFraction01 <= 0.0) continue;

            double advectedEast = worldPositionM.X
                - layer.AdvectionVelocityMps.X * simulationTimeSeconds;
            double advectedNorth = worldPositionM.Z
                - layer.AdvectionVelocityMps.Z * simulationTimeSeconds;
            ulong salt = Salt(i, 0x46c8_9d31_78a4_25e7UL);
            double structure = HorizontalCoverage(advectedEast, advectedNorth,
                layer.HorizontalStructureScaleM, layer.MeanCloudFraction01, salt);
            double intensity = vertical * structure;
            if (intensity <= 0.0) continue;

            Vec3D localTurbulence = NoiseVector(advectedEast, worldPositionM.Y,
                advectedNorth, layer.HorizontalStructureScaleM * 0.35, salt);
            Accumulate(intensity, layer.MeanCloudFraction01,
                layer.ExtinctionPerMetreAtFullCloud,
                layer.LiquidWaterKgPerM3AtFullCloud,
                layer.IceWaterKgPerM3AtFullCloud,
                layer.PrecipitationMmPerHourAtFullCloud,
                localTurbulence * layer.TurbulenceRmsMpsAtFullCloud,
                layer.VerticalAirVelocityMpsAtFullCloud,
                layer.IcingHazard01AtFullCloud,
                layer.LightningHazard01AtFullCloud,
                ref cloudFraction, ref extinction, ref liquid, ref ice,
                ref precipitation, ref turbulence, ref verticalAir,
                ref icing, ref lightning);
        }

        for (int i = 0; i < _cells.Length; i++) {
            ConvectiveCellDefinition cell = _cells[i];
            double age = simulationTimeSeconds - cell.StartTimeSeconds;
            if (age < 0.0 || age > cell.LifetimeSeconds) continue;
            double life = LifecycleEnvelope(age, cell.LifetimeSeconds,
                cell.LifecycleTransitionSeconds);
            if (life <= 0.0) continue;

            Vec3D centre = cell.InitialCentreWorldM + cell.AdvectionVelocityMps * age;
            double verticalCentre = centre.Y;
            double verticalRadius = 0.5 * (cell.TopAltitudeM - cell.BaseAltitudeM);
            double east = (worldPositionM.X - centre.X) / cell.HorizontalRadiusEastM;
            double north = (worldPositionM.Z - centre.Z) / cell.HorizontalRadiusNorthM;
            double up = (worldPositionM.Y - verticalCentre) / verticalRadius;
            double radiusSquared = east * east + north * north + up * up;
            if (radiusSquared >= 1.0) continue;

            double boundedCore = SmoothStep(1.0 - radiusSquared);
            ulong salt = Salt(i, 0xd18b_713c_4a6f_9e25UL);
            double texture = 0.90 + 0.10 * (0.5 + 0.5
                * Hashing.Value(east * 2.0, up * 2.0, north * 2.0, salt));
            double intensity = life * boundedCore * texture;
            Vec3D localTurbulence = NoiseVector(east + age * 0.01, up,
                north - age * 0.008, 0.45, salt);
            Accumulate(intensity, cell.PeakCloudFraction01,
                cell.PeakExtinctionPerMetre,
                cell.PeakLiquidWaterKgPerM3,
                cell.PeakIceWaterKgPerM3,
                cell.PeakPrecipitationMmPerHour,
                localTurbulence * cell.PeakTurbulenceRmsMps,
                cell.PeakVerticalAirVelocityMps,
                cell.PeakIcingHazard01,
                cell.PeakLightningHazard01,
                ref cloudFraction, ref extinction, ref liquid, ref ice,
                ref precipitation, ref turbulence, ref verticalAir,
                ref icing, ref lightning);
        }

        EnsureFinite(cloudFraction, extinction, liquid, ice, precipitation, turbulence,
            verticalAir, icing, lightning);
        double visibility = extinction > 0.0
            ? Math.Min(_clearAirVisibilityM, Math.Max(1e-6, 3.912 / extinction))
            : _clearAirVisibilityM;
        return new CloudSample(
            Math.Clamp(cloudFraction, 0.0, 1.0),
            Math.Max(0.0, extinction),
            Math.Max(0.0, liquid),
            Math.Max(0.0, ice),
            visibility,
            Math.Max(0.0, precipitation),
            turbulence,
            verticalAir,
            Math.Clamp(icing, 0.0, 1.0),
            Math.Clamp(lightning, 0.0, 1.0));
    }

    static void Accumulate(double intensity, double sourceCloudFraction,
        double sourceExtinction, double sourceLiquid, double sourceIce,
        double sourcePrecipitation, in Vec3D sourceTurbulence,
        double sourceVerticalAir, double sourceIcing, double sourceLightning,
        ref double cloudFraction, ref double extinction, ref double liquid,
        ref double ice, ref double precipitation, ref Vec3D turbulence,
        ref double verticalAir, ref double icing, ref double lightning)
    {
        double localFraction = Math.Clamp(sourceCloudFraction * intensity, 0.0, 1.0);
        cloudFraction = 1.0 - (1.0 - cloudFraction) * (1.0 - localFraction);
        extinction += sourceExtinction * intensity;
        liquid += sourceLiquid * intensity;
        ice += sourceIce * intensity;
        precipitation += sourcePrecipitation * intensity;
        turbulence += sourceTurbulence * intensity;
        verticalAir += sourceVerticalAir * intensity;
        icing = Math.Max(icing, sourceIcing * intensity);
        lightning = Math.Max(lightning, sourceLightning * intensity);
    }

    static double HorizontalCoverage(double eastM, double northM, double scaleM,
        double meanFraction, ulong salt) {
        if (meanFraction <= 0.0) return 0.0;
        if (meanFraction >= 1.0) return 1.0;
        double x = eastM / scaleM;
        double z = northM / scaleM;
        double noise = 0.68 * Hashing.Value(x, 0.0, z, salt)
            + 0.22 * Hashing.Value(x * 2.07, 11.0, z * 2.07, salt + 0x9e37UL)
            + 0.10 * Hashing.Value(x * 4.13, -7.0, z * 4.13, salt + 0x51edUL);
        double normalized = Math.Clamp(0.5 + 0.5 * noise, 0.0, 1.0);
        const double transition = 0.14; // phenomenological soft cloud-edge width in noise space.
        double threshold = 1.0 - meanFraction;
        return SmoothStep((normalized - threshold + transition) / (2.0 * transition));
    }

    static Vec3D NoiseVector(double east, double up, double north, double scale,
        ulong salt) {
        double inverseScale = 1.0 / Math.Max(scale, 1e-6);
        double x = east * inverseScale, y = up * inverseScale, z = north * inverseScale;
        return new Vec3D(
            Hashing.Value(x, y, z, salt + 0x243f_6a88UL),
            Hashing.Value(x, y, z, salt + 0x85a3_08d3UL),
            Hashing.Value(x, y, z, salt + 0x1319_8a2eUL));
    }

    static double VerticalEnvelope(double altitudeM, double baseM, double topM,
        double edgeM) {
        if (altitudeM <= baseM || altitudeM >= topM) return 0.0;
        return SmoothStep((altitudeM - baseM) / edgeM)
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

    static void EnsureFinite(double cloudFraction, double extinction, double liquid,
        double ice, double precipitation, in Vec3D turbulence, double verticalAir,
        double icing, double lightning) {
        if (!double.IsFinite(cloudFraction) || !double.IsFinite(extinction)
            || !double.IsFinite(liquid) || !double.IsFinite(ice)
            || !double.IsFinite(precipitation) || !CloudSample.IsFinite(turbulence)
            || !double.IsFinite(verticalAir) || !double.IsFinite(icing)
            || !double.IsFinite(lightning))
            throw new InvalidOperationException("cloud definitions overflowed finite sample range");
    }
}

static class DefinitionValidation {
    public static void Finite(double value, string name) {
        if (!double.IsFinite(value)) throw new ArgumentOutOfRangeException(name);
    }
    public static void Positive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
    public static void NonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
    public static void Range01(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0 || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }
    public static void HorizontalVector(in Vec3D value, string name) {
        if (!CloudSample.IsFinite(value) || value.Y != 0.0)
            throw new ArgumentOutOfRangeException(name,
                "advection must be a finite horizontal east/north vector");
    }
}
