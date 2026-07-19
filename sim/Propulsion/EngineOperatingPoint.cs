namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// A deterministic, unit-explicit snapshot of a turbojet operating point.
/// </summary>
public readonly record struct EngineOperatingPoint(
    double Rpm,
    double RpmPercent,
    double NetThrustN,
    double NetThrustLbf,
    double FuelFlowLbPerMinute,
    bool Running)
{
    // Conventional all-caps aliases make the units easy to discover from either C# naming style.
    public double RPM => Rpm;
    public double RPMPercent => RpmPercent;

    public static EngineOperatingPoint Stopped => new(
        Rpm: 0.0,
        RpmPercent: 0.0,
        NetThrustN: 0.0,
        NetThrustLbf: 0.0,
        FuelFlowLbPerMinute: 0.0,
        Running: false);
}
