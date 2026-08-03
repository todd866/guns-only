namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Per-tick telemetry from the YZF-R1 single-track runway-plane dynamics.
/// <para>
/// <see cref="LeanRad"/> is a body-forward-axis roll in radians: positive lean moves the
/// body-up vector left, while negative lean moves it right. Consequently a positive
/// (right) steer or rider lateral command produces negative lean.
/// </para>
/// </summary>
public readonly record struct MotorcycleTelemetry(
    long Tick,
    double SpeedMps,
    double Rpm,
    int Gear,
    double Throttle,
    double Brake,
    double LeanRad,
    QuaternionD ViewAttitude,
    double FrontNormalForceN,
    double RearNormalForceN,
    double LongitudinalForceN,
    double LateralForceN,
    double AvailableLateralForceN,
    bool IsSliding,
    bool IsTippedOver,
    double WheelieBalance,
    double StoppieBalance,
    double PitchReflexAuthority,
    bool KneeDown,
    double KneeProximity,
    double LeanHoldAuthority,
    double PitchRad,
    double RiderLateral,
    double RiderForeAft,
    MotorcycleClutchMode ClutchMode,
    double ClutchEngagement,
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
    double CerebellarAssistScale = 1.0);
