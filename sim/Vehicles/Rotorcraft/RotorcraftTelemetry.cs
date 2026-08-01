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
    bool RotorStrike);
