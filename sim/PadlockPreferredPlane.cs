namespace GunsOnly.Sim;

public readonly record struct PadlockPreferredPlaneResult(
    bool Valid,
    double GateRadFromLift,
    bool AnyPlaneFallback);

/// <summary>
/// Selects a cue-only lift plane for the otherwise singular near-six geometry.
/// </summary>
public static class PadlockPreferredPlane {
    public const double TerrainFloorM = 2000.0 * 0.3048;
    public const double EnergyCornerFraction = 0.85;
    public const double HysteresisSeconds = 0.25;
    public const double HysteresisHoldRad = 25.0 * Math.PI / 180.0;
    public const double VerticalHalfWidthRad = 35.0 * Math.PI / 180.0;

    public static PadlockPreferredPlaneResult Select(
        in QuaternionD bodyAttitude,
        double trueAirspeedMps,
        double cornerSpeedMps,
        double radarAltitudeM,
        bool gcasWarningOrActive,
        double planeMagnitude,
        double targetForward,
        double previousGateRad,
        bool hadPrevious,
        double deltaSeconds,
        double accumulatedDwellSeconds = 0.0) {
        if (!bodyAttitude.IsFinite || bodyAttitude.LengthSquared < 1e-12
            || !double.IsFinite(trueAirspeedMps) || !double.IsFinite(cornerSpeedMps)
            || !double.IsFinite(radarAltitudeM) || !double.IsFinite(planeMagnitude)
            || !double.IsFinite(targetForward)) {
            return new PadlockPreferredPlaneResult(false, 0.0, true);
        }

        QuaternionD attitude = bodyAttitude.Normalized();
        Vec3D bodyRight = attitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        Vec3D bodyUp = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D worldUp = new(0.0, 1.0, 0.0);
        double skywardGate = WrapAngle(Math.Atan2(
            worldUp.Dot(bodyRight), worldUp.Dot(bodyUp)));
        double flatGate = Math.PI / 2.0;
        bool terrainBlocksDown = radarAltitudeM < TerrainFloorM || gcasWarningOrActive;
        bool energyBlocksVertical = cornerSpeedMps > 1.0
            && trueAirspeedMps < EnergyCornerFraction * cornerSpeedMps;

        double skywardPull = PullUpness(bodyUp, bodyRight, skywardGate);
        double currentPull = PullUpness(bodyUp, bodyRight, 0.0);
        double flatPull = PullUpness(bodyUp, bodyRight, flatGate);
        bool canLiftAwayFromTerrain(double pullUpness) =>
            !terrainBlocksDown || pullUpness > 1e-9;

        bool currentIsVertical = Math.Abs(WrapAngle(-skywardGate)) < VerticalHalfWidthRad;
        bool flatIsVertical = Math.Abs(WrapAngle(flatGate - skywardGate))
            < VerticalHalfWidthRad;
        bool allowCurrent = !(terrainBlocksDown && currentPull < skywardPull - 1e-12)
            && !(energyBlocksVertical && currentIsVertical && !flatIsVertical)
            && canLiftAwayFromTerrain(currentPull);
        bool allowSkyward = terrainBlocksDown && canLiftAwayFromTerrain(skywardPull);
        bool allowFlat = energyBlocksVertical && canLiftAwayFromTerrain(flatPull);

        if (!allowCurrent && !allowSkyward && !allowFlat)
            return new PadlockPreferredPlaneResult(false, 0.0, true);

        double gate = allowSkyward ? skywardGate
            : allowFlat ? flatGate
            : 0.0;
        bool smallChange = hadPrevious
            && Math.Abs(WrapAngle(gate - previousGateRad)) <= HysteresisHoldRad;
        if (smallChange && accumulatedDwellSeconds < HysteresisSeconds)
            gate = previousGateRad;

        return new PadlockPreferredPlaneResult(true, WrapAngle(gate), false);
    }

    static double PullUpness(in Vec3D bodyUp, in Vec3D bodyRight, double gate) =>
        bodyUp.Y * Math.Cos(gate) + bodyRight.Y * Math.Sin(gate);

    static double WrapAngle(double angle) => Math.Atan2(Math.Sin(angle), Math.Cos(angle));
}
