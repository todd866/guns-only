namespace GunsOnly.Sim.FlightTest;

public readonly record struct AirframeIdentity(
    string Role,
    double FuelFreeMassKg,
    double GrossMassKg,
    double WingLoadingKgM2,
    double DryThrustToWeight,
    double AugmentedThrustToWeight,
    double SkinTemperatureLimitK,
    string ComparisonFamily,
    double MaxClimbGammaDegWhileAcceleratingThroughMach1,
    double MinSustainedVsAeroGGap,
    string SourceDoc);

public static class IdentityMeasurement {
    const double GravityMps2 = 9.80665;

    public static AirframeIdentity FromParams(AircraftParams air, bool inferred) {
        double grossKg = air.MassKg;
        double fuelFreeKg = air.FuelFreeMassKg > 0.0 ? air.FuelFreeMassKg : air.MassKg;
        double wingLoading = air.WingAreaM2 > 0.0 ? grossKg / air.WingAreaM2 : 0.0;
        double weightN = grossKg * GravityMps2;
        double dryTw = weightN > 0.0 ? air.ThrustMaxN / weightN : 0.0;
        double augTw = dryTw * air.MaxThrustFraction;
        return new AirframeIdentity(
            Role: inferred ? "(inferred)" : "",
            FuelFreeMassKg: fuelFreeKg,
            GrossMassKg: grossKg,
            WingLoadingKgM2: wingLoading,
            DryThrustToWeight: dryTw,
            AugmentedThrustToWeight: augTw,
            SkinTemperatureLimitK: air.SkinTemperatureLimitK,
            ComparisonFamily: "",
            MaxClimbGammaDegWhileAcceleratingThroughMach1: 0.0,
            MinSustainedVsAeroGGap: 0.0,
            SourceDoc: inferred ? "(inferred)" : "");
    }
}
