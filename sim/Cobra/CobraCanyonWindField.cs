using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Hyper-local canyon wind v1: synoptic mean modulated by terrain height and slope.
/// Deterministic; not CFD. Epistemic: provisional channeling/ridge/lee factors.
/// </summary>
public sealed class CobraCanyonWindField : IWindField
{
    /// <summary>Default westbound canyon breeze when the mission does not pass an explicit synoptic.</summary>
    public static readonly Vec3D DefaultSynopticMps = new(-4.0, 0.0, 0.5);

    readonly ITerrainSurface _terrain;
    readonly Vec3D _synopticMps;
    readonly double _sampleHalfStepM;

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
    }

    public Vec3D SynopticMps => _synopticMps;

    public Vec3D Sample(Vec3D worldPos)
    {
        if (!worldPos.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(worldPos));

        if (_synopticMps.Length < 1e-6)
            return Vec3D.Zero;

        if (!_terrain.TrySample(worldPos.X, worldPos.Z, out TerrainSample here))
            return _synopticMps;

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

        return new Vec3D(
            horizontal.X * shear,
            (_synopticMps.Y + lift) * shear,
            horizontal.Z * shear);
    }

    double HeightOr(double fallback, double eastM, double northM) =>
        _terrain.TrySample(eastM, northM, out TerrainSample sample) ? sample.HeightM : fallback;
}
