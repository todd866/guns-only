using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Hyper-local canyon wind v2: a terrain-shaped synoptic mean plus a deterministic frozen-eddy
/// gust field advected by simulation time. Deterministic; not CFD. Epistemic: all channeling,
/// ridge/lee and gust parameters below are provisional until a sourced canyon-weather data pack
/// replaces them.
/// </summary>
public sealed class CobraCanyonWindField : IWindField
{
    /// <summary>Default westbound canyon breeze when the mission does not pass an explicit synoptic.</summary>
    public static readonly Vec3D DefaultSynopticMps = new(-4.0, 0.0, 0.5);

    // Wind-v2 tuning lives here rather than being scattered through Sample. TurbulenceField is
    // calibrated to unit per-component RMS; LocalGustRmsMps supplies the terrain/AGL envelope.
    // The absolute and local-sigma caps keep an intermittent tail from injecting an implausible
    // one-frame velocity, while ScaleToMagnitude is continuous at the cap.
    const ulong GustSeed = 0xC0B2_A11C_4EED_2026UL;
    const int GustOctaves = 7;
    const double GustOuterScaleM = 90.0;
    const double GustHurst = 1.0 / 3.0;
    const double GustIntermittency = 0.52;
    const double GustRmsSynopticFraction = 0.22;
    const double GustMaximumLocalRmsMps = 1.8;
    const double GustMaximumMagnitudeMps = 4.8;
    const double GustMaximumLocalSigma = 3.4;
    const double GustVerticalScale = 0.72;
    const double GustFullSlope = 0.35;
    const double GustFullReliefM = 35.0;
    const double GustSlopeGain = 0.50;
    const double GustReliefGain = 0.25;
    const double GustSurfaceIntensityFactor = 0.58;
    const double GustSurfaceBlendHeightM = 22.0;
    const double GustHighAltitudeStartM = 100.0;
    const double GustHighAltitudeBlendM = 220.0;
    const double GustHighAltitudeFactor = 0.68;

    readonly ITerrainSurface _terrain;
    readonly Vec3D _synopticMps;
    readonly double _sampleHalfStepM;
    readonly TurbulenceField _gustTexture;

    public CobraCanyonWindField(
        ITerrainSurface terrain,
        Vec3D? synopticWindMps = null,
        double sampleHalfStepM = 40.0)
    {
        _terrain = terrain ?? throw new ArgumentNullException(nameof(terrain));
        _synopticMps = synopticWindMps ?? DefaultSynopticMps;
        if (!_synopticMps.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(synopticWindMps));
        if (!double.IsFinite(sampleHalfStepM) || sampleHalfStepM < 5.0)
            throw new ArgumentOutOfRangeException(nameof(sampleHalfStepM));
        _sampleHalfStepM = sampleHalfStepM;
        _gustTexture = new TurbulenceField(
            octaves: GustOctaves,
            outerScaleM: GustOuterScaleM,
            hurst: GustHurst,
            intermittency: GustIntermittency,
            intensityMps: 1.0,
            seed: GustSeed);
    }

    public Vec3D SynopticMps => _synopticMps;

    /// <summary>
    /// The deterministic time-zero sample required by <see cref="IWindField"/>. Time-aware
    /// simulation owners should call <see cref="Sample(Vec3D,double)"/> with authority time.
    /// </summary>
    public Vec3D Sample(Vec3D worldPos) => Sample(worldPos, 0.0);

    /// <summary>
    /// Samples the canyon wind at explicit simulation time. The turbulence texture is a frozen
    /// world-space field translated with the synoptic velocity: v(x,t) = v0(x - U*t). No wall
    /// clock or mutable random state participates, so replaying a position/time pair is exact.
    /// </summary>
    public Vec3D Sample(Vec3D worldPos, double simulationTimeSeconds)
    {
        if (!worldPos.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(worldPos));
        if (!double.IsFinite(simulationTimeSeconds) || simulationTimeSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(simulationTimeSeconds));

        if (_synopticMps.Length < 1e-6)
            return Vec3D.Zero;

        Vec3D mean = SampleTerrainShapedMean(worldPos, out TerrainExposure exposure);
        double localRmsMps = LocalGustRmsMps(exposure);
        if (localRmsMps <= 1e-12)
            return mean;

        Vec3D advectedPosition = worldPos - (_synopticMps * simulationTimeSeconds);
        Vec3D unitTexture = _gustTexture.Sample(advectedPosition);
        Vec3D gust = new(
            unitTexture.X * localRmsMps,
            unitTexture.Y * localRmsMps * GustVerticalScale,
            unitTexture.Z * localRmsMps);
        double maximumMagnitudeMps = Math.Min(
            GustMaximumMagnitudeMps,
            localRmsMps * GustMaximumLocalSigma);
        gust = ScaleToMagnitude(gust, maximumMagnitudeMps);
        Vec3D result = mean + gust;
        return result.IsFinite ? result : mean;
    }

    Vec3D SampleTerrainShapedMean(Vec3D worldPos, out TerrainExposure exposure)
    {
        if (!_terrain.TrySample(worldPos.X, worldPos.Z, out TerrainSample here))
        {
            exposure = TerrainExposure.Unavailable;
            return _synopticMps;
        }

        double eastMinus = Math.Max(_terrain.Bounds.MinimumEastM, worldPos.X - _sampleHalfStepM);
        double eastPlus = Math.Min(_terrain.Bounds.MaximumEastM, worldPos.X + _sampleHalfStepM);
        double northMinus = Math.Max(_terrain.Bounds.MinimumNorthM, worldPos.Z - _sampleHalfStepM);
        double northPlus = Math.Min(_terrain.Bounds.MaximumNorthM, worldPos.Z + _sampleHalfStepM);

        double hE = HeightOr(here.HeightM, eastPlus, worldPos.Z);
        double hW = HeightOr(here.HeightM, eastMinus, worldPos.Z);
        double hN = HeightOr(here.HeightM, worldPos.X, northPlus);
        double hS = HeightOr(here.HeightM, worldPos.X, northMinus);

        // Slope of the ground (rise over run); wind climbs the windward face.
        double dHdx = (hE - hW) / Math.Max(1.0, eastPlus - eastMinus);
        double dHdz = (hN - hS) / Math.Max(1.0, northPlus - northMinus);

        double neighborMean = 0.25 * (hE + hW + hN + hS);
        double relativeHeightM = here.HeightM - neighborMean;
        // Ridge: faster flow; lee/basin: slower. Clamp so still-air tests stay quiet when synoptic≠0.
        double speedFactor = Math.Clamp(1.0 + 0.045 * relativeHeightM, 0.45, 1.85);

        // Channel along the local valley axis (perpendicular to the steepest upslope).
        double slopeLen = Math.Sqrt((dHdx * dHdx) + (dHdz * dHdz));
        Vec3D horizontal = new(_synopticMps.X, 0.0, _synopticMps.Z);
        double horizSpeed = horizontal.Length;
        if (horizSpeed > 1e-6 && slopeLen > 1e-4)
        {
            // Unit along-slope and across-slope (channel).
            double sx = dHdx / slopeLen;
            double sz = dHdz / slopeLen;
            // Channel direction: rotate slope 90° in horizontal plane.
            double cx = -sz;
            double cz = sx;
            double along = horizontal.X * sx + horizontal.Z * sz;
            double across = horizontal.X * cx + horizontal.Z * cz;
            // Prefer channeling in a cut (negative relative height).
            double channelBias = Math.Clamp(-relativeHeightM / 35.0, 0.0, 1.0);
            double mixedAcross = across * (1.0 + 0.55 * channelBias);
            double mixedAlong = along * (1.0 - 0.25 * channelBias);
            horizontal = new(
                mixedAlong * sx + mixedAcross * cx,
                0.0,
                mixedAlong * sz + mixedAcross * cz);
            horizSpeed = horizontal.Length;
        }

        if (horizSpeed > 1e-9)
            horizontal *= (speedFactor * _synopticMps.Length) / horizSpeed;
        else
            horizontal = new(_synopticMps.X * speedFactor, 0.0, _synopticMps.Z * speedFactor);

        // Orographic vertical: climb windward faces.
        double lift = 0.35 * (horizontal.X * dHdx + horizontal.Z * dHdz);
        lift = Math.Clamp(lift, -2.5, 3.5);

        // Mild AGL shear: slower near the surface.
        double aglM = Math.Max(0.0, worldPos.Y - here.HeightM);
        double shear = Math.Clamp(aglM / 80.0, 0.35, 1.0);

        exposure = new TerrainExposure(
            HasTerrain: true,
            SlopeMagnitude: slopeLen,
            RelativeHeightM: relativeHeightM,
            AboveGroundLevelM: aglM);

        return new Vec3D(
            horizontal.X * shear,
            (_synopticMps.Y + lift) * shear,
            horizontal.Z * shear);
    }

    double LocalGustRmsMps(TerrainExposure exposure)
    {
        double baseRmsMps = _synopticMps.Length * GustRmsSynopticFraction;
        if (!exposure.HasTerrain)
            return Math.Min(baseRmsMps, GustMaximumLocalRmsMps);

        double slope01 = Math.Clamp(exposure.SlopeMagnitude / GustFullSlope, 0.0, 1.0);
        double relief01 = Math.Clamp(
            Math.Abs(exposure.RelativeHeightM) / GustFullReliefM,
            0.0,
            1.0);
        double terrainFactor = 1.0
            + GustSlopeGain * slope01
            + GustReliefGain * relief01;

        // A smooth boundary-layer envelope: gusts are reduced at the actual surface, reach full
        // strength through rotor-height/nap-of-earth flight, then relax above canyon influence.
        double surfaceBlend01 = SmoothStep01(
            exposure.AboveGroundLevelM / GustSurfaceBlendHeightM);
        double aglFactor = Lerp(GustSurfaceIntensityFactor, 1.0, surfaceBlend01);
        double highBlend01 = SmoothStep01(
            (exposure.AboveGroundLevelM - GustHighAltitudeStartM)
            / GustHighAltitudeBlendM);
        aglFactor *= Lerp(1.0, GustHighAltitudeFactor, highBlend01);

        return Math.Clamp(
            baseRmsMps * terrainFactor * aglFactor,
            0.0,
            GustMaximumLocalRmsMps);
    }

    static Vec3D ScaleToMagnitude(Vec3D vector, double maximumMagnitude)
    {
        double length = vector.Length;
        return length > maximumMagnitude && length > 1e-12
            ? vector * (maximumMagnitude / length)
            : vector;
    }

    static double SmoothStep01(double value)
    {
        double t = Math.Clamp(value, 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    static double Lerp(double a, double b, double t) => a + (b - a) * t;

    double HeightOr(double fallback, double eastM, double northM) =>
        _terrain.TrySample(eastM, northM, out TerrainSample sample) ? sample.HeightM : fallback;

    readonly record struct TerrainExposure(
        bool HasTerrain,
        double SlopeMagnitude,
        double RelativeHeightM,
        double AboveGroundLevelM)
    {
        public static TerrainExposure Unavailable => new(false, 0.0, 0.0, 80.0);
    }
}
