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
    bool Running,
    /// <summary>Fuel attributable to the turbine/core stream. Equals total for single-stream maps.</summary>
    double TurbineFuelFlowLbPerMinute = 0.0,
    /// <summary>Fuel attributable to the ram combustor. Zero for single-stream maps.</summary>
    double RamjetFuelFlowLbPerMinute = 0.0)
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
        Running: false,
        TurbineFuelFlowLbPerMinute: 0.0,
        RamjetFuelFlowLbPerMinute: 0.0);
}
