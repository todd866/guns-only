namespace GunsOnly.Sim.Vehicles;

public enum RotorcraftFlightRegime
{
    Normal,
    EffectiveTranslationalLift,
    VortexRingState,
    Autorotation,
    RetreatingBladeStall,
    SurfaceContact,
    RotorStrike
}

/// <summary>
/// Rotorcraft-specific authority output. Generic consumers continue to use
/// <see cref="PlayerVehicleObservation"/>; rotorcraft instruments and validation cards consume
/// this block without pretending rotor RPM or transmission torque are fixed-wing concepts.
/// </summary>
public readonly record struct RotorcraftTelemetry(
    long Tick,
    RotorcraftFlightRegime Regime,
    double MainRotorRpm,
    double TailRotorRpm,
    double RotorAzimuthRad,
    double CollectiveRootPitchRad,
    double MainRotorThrustN,
    double InducedVelocityMps,
    double EngineShaftPowerW,
    double RotorPowerRequiredW,
    double AvailableShaftPowerW,
    double TransmissionTorqueNm,
    double TransmissionLimitFraction,
    double EffectiveTranslationalLiftFactor,
    double GroundEffectFactor,
    double VortexRingSeverity,
    double RetreatingBladeStallSeverity,
    double MastBumpRisk,
    double MainRotorClearanceM,
    int SkidContactCount,
    bool EngineOperating,
    bool GovernorSaturated,
    bool RotorStrike,
    /// <summary>Main-rotor advance ratio µ = V_inplane / (ΩR).</summary>
    double AdvanceRatio,
    /// <summary>Relative-air speed in the fuselage X/Z plane used by directional stability.</summary>
    double DirectionalAirSpeedMps,
    /// <summary>Body-frame sideslip used by directional stability (rad), positive flow from right.</summary>
    double SideslipRad,
    /// <summary>Body yaw rate R (rad/s), positive right.</summary>
    double BodyYawRateRadPerSecond,
    /// <summary>Provisional torque→yaw demand before SCAS (rad/s).</summary>
    double TorqueYawDemandRadPerSecond,
    /// <summary>Limited-authority SCAS yaw rate command (rad/s), opposing torque.</summary>
    double ScasYawRadPerSecond,
    /// <summary>Speed-scheduled fin alignment and yaw-damping contribution (rad/s).</summary>
    double WeathervaneYawRadPerSecond,
    /// <summary>Torque + SCAS residual before weathervane (rad/s). Pedal work when this is nonzero.</summary>
    double YawResidualRadPerSecond);
