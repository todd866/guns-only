using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim.FlightTest;

public readonly record struct EngineDeckSample(
    double AltitudeM,
    double Mach,
    double Lever,
    EngineOperatingPoint Point,
    CombinedCycleThrustFractions Fractions);

public static class EngineDeck {
    public static EngineDeckSample SampleTurboRamjet(
        AircraftParams air, double lever, double altitudeM, double mach) {
        AtmosphericState atm = StandardAtmosphere1976.Instance.Sample(altitudeM);
        EngineOperatingPoint point = TurboRamjetPerformanceMap.Evaluate(
            lever, air.ThrustMaxN, mach,
            atm.TemperatureK, atm.DensityKgM3,
            air.GenericIdleFuelFlowLbPerMinute,
            air.GenericMilitaryFuelFlowLbPerMinute,
            air.GenericAfterburnerFuelFlowLbPerMinute,
            air.MaxThrustFraction);
        CombinedCycleThrustFractions fractions = TurboRamjetPerformanceMap.ThrustComponents(
            mach, atm.TemperatureK, atm.DensityKgM3);
        return new EngineDeckSample(altitudeM, mach, lever, point, fractions);
    }
}
