namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Sim-authored weekend-ride state for web bridge JSON. Task 11 serializes these fields.
/// </summary>
public readonly record struct WeekendRideSnapshot(
    WeekendRidePhase Phase,
    Vec3D PositionWorldM,
    Vec3D GroundVelocityMps,
    double LeanRad,
    double ViewRollRad,
    QuaternionD ViewAttitude,
    double FrontNormalForceN,
    double RearNormalForceN,
    double SlipFront,
    double SlipRear,
    double WheelieBalance,
    double StoppieBalance,
    double PitchReflexAuthority,
    double LeanHoldAuthority,
    bool KneeDown,
    double KneeProximity,
    double PitchRad,
    int LapCount,
    double LapTimeSeconds,
    double OffTrackSeconds,
    bool IsTippedOver,
    double SpeedMps,
    double Rpm,
    int Gear,
    double Throttle,
    double Brake,
    double RiderLateral,
    double RiderForeAft,
    MotorcycleClutchMode ClutchMode,
    double ClutchEngagement,
    double TipRecoveryFlashSeconds,
    double FrontLongitudinalForceN = 0.0,
    double RearLongitudinalForceN = 0.0,
    double FrontLateralForceN = 0.0,
    double RearLateralForceN = 0.0,
    double FrontGripUse = 0.0,
    double RearGripUse = 0.0,
    double CogAlongFromRearM = 0.0,
    double CogLateralM = 0.0,
    double RiderSkillAuthority = 0.0,
    double CogEnvelopeCenterAlongM = 0.0,
    double CogEnvelopeHalfAlongM = 0.0,
    double CogEnvelopeHalfLateralM = 0.0,
    bool CogInsideEnvelope = false,
    double CerebellarAssistScale = 1.0)
{
    /// <summary>
    /// Roll about the forward axis extracted from the head-stabilized view attitude.
    /// </summary>
    public static double RollFromViewAttitude(in QuaternionD viewAttitude, double headingRad)
    {
        Vec3D forward = new Vec3D(Math.Sin(headingRad), 0.0, Math.Cos(headingRad));
        Vec3D levelRight = new Vec3D(forward.Z, 0.0, -forward.X).Normalized();
        Vec3D bodyRight = viewAttitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        double lateral = bodyRight.X * levelRight.X + bodyRight.Z * levelRight.Z;
        return Math.Atan2(bodyRight.Y, lateral);
    }

    internal static (double SlipFront, double SlipRear) SurrogateWheelSlip(
        in MotorcycleTelemetry telemetry)
    {
        if (!telemetry.IsSliding || telemetry.AvailableLateralForceN <= 1e-9)
            return (0.0, 0.0);

        double combinedSlip = Math.Clamp(
            Math.Abs(telemetry.LateralForceN) / telemetry.AvailableLateralForceN,
            0.0,
            1.0);
        double totalNormalN = telemetry.FrontNormalForceN + telemetry.RearNormalForceN;
        if (totalNormalN <= 1e-9)
            return (combinedSlip * 0.5, combinedSlip * 0.5);

        double frontShare = telemetry.FrontNormalForceN / totalNormalN;
        return (combinedSlip * frontShare, combinedSlip * (1.0 - frontShare));
    }
}
