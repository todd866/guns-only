using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Cobra;

public readonly record struct CobraGunTargetAssessment(
    double RangeM,
    double SignedAzimuthRad,
    double AzimuthErrorRad,
    double ElevationRad,
    bool WithinTurretEnvelope,
    bool HasBallisticSolution);

/// <summary>
/// M28A1 flexible-turret gun geometry for the AH-1G mission path. The flexible envelope limits are
/// provisional FM 1-40-derived values (docs/airframes/ah-1g-cobra/00-sources.md). This replaces
/// the earlier 0.06 rad whole-aircraft nose coincidence, which made the gun nearly unreachable in
/// play and ignored terrain masking entirely.
/// </summary>
public static class CobraGunTargeting
{
    public const double TurretAzimuthLimitRad = 110.0 * Math.PI / 180.0;
    public const double TurretMaxElevationRad = 20.0 * Math.PI / 180.0;
    public const double TurretMinElevationRad = -50.0 * Math.PI / 180.0;
    public const double MinimumSolutionRangeM = 80.0;
    public const double MaximumSolutionRangeM = 2_000.0;

    public static CobraGunTargetAssessment Assess(
        in Vec3D aircraftPositionWorldM,
        double aircraftYawRad,
        in Vec3D targetPositionWorldM)
    {
        if (!aircraftPositionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(aircraftPositionWorldM));
        if (!double.IsFinite(aircraftYawRad))
            throw new ArgumentOutOfRangeException(nameof(aircraftYawRad));
        if (!targetPositionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(targetPositionWorldM));

        Vec3D line = targetPositionWorldM - aircraftPositionWorldM;
        double rangeM = line.Length;
        double horizontalM = Math.Sqrt(line.X * line.X + line.Z * line.Z);
        double signedAzimuthRad = horizontalM > 1e-9
            ? WrapAngleRad(Math.Atan2(line.X, line.Z) - aircraftYawRad)
            : 0.0;
        double azimuthErrorRad = Math.Abs(signedAzimuthRad);
        double elevationRad = rangeM > 1e-6
            ? Math.Atan2(line.Y, Math.Max(horizontalM, 1e-9))
            : 0.0;
        bool withinEnvelope = azimuthErrorRad <= TurretAzimuthLimitRad
            && elevationRad is >= TurretMinElevationRad and <= TurretMaxElevationRad;
        bool hasSolution = rangeM is >= MinimumSolutionRangeM and <= MaximumSolutionRangeM;
        return new CobraGunTargetAssessment(
            rangeM,
            signedAzimuthRad,
            azimuthErrorRad,
            elevationRad,
            withinEnvelope,
            hasSolution);
    }

    /// <summary>
    /// Terrain- and obstacle-aware line of sight with the same sampling semantics as
    /// CobraMissionRuntime's threat masking: unknown terrain fails closed, and a volume that
    /// contains either endpoint is not cover.
    /// </summary>
    public static bool EvaluateLineOfSight(
        ITerrainSurface terrain,
        IReadOnlyList<CobraResolvedObstacle> obstacles,
        in Vec3D fromWorldM,
        in Vec3D toWorldM)
    {
        ArgumentNullException.ThrowIfNull(terrain);
        ArgumentNullException.ThrowIfNull(obstacles);
        if (!fromWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(fromWorldM));
        if (!toWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(toWorldM));

        if (!terrain.TrySample(fromWorldM.X, fromWorldM.Z, out _)
            || !terrain.TrySample(toWorldM.X, toWorldM.Z, out _))
            return false;

        Vec3D delta = toWorldM - fromWorldM;
        double horizontalRangeM = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        double sampleStepM = Math.Clamp(terrain.HorizontalResolutionM, 10.0, 50.0);
        int steps = Math.Max(1, (int)Math.Ceiling(horizontalRangeM / sampleStepM));
        for (int index = 1; index < steps; index++) {
            double fraction = (double)index / steps;
            Vec3D point = fromWorldM + delta * fraction;
            if (!terrain.TrySample(point.X, point.Z, out TerrainSample sample))
                return false;
            if (sample.HeightM + CobraMissionRuntime.LineOfSightTerrainClearanceM >= point.Y)
                return false;
        }

        foreach (CobraResolvedObstacle obstacle in obstacles) {
            if (obstacle.IntersectsSphere(fromWorldM, 0.01)
                || obstacle.IntersectsSphere(toWorldM, 0.01))
                continue;
            if (obstacle.IntersectsSegment(fromWorldM, toWorldM))
                return false;
        }
        return true;
    }

    static double WrapAngleRad(double angleRad) =>
        Math.Atan2(Math.Sin(angleRad), Math.Cos(angleRad));
}
