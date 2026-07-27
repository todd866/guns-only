namespace GunsOnly.Sim.FlightTest.Programs;

public static class InterceptorTbccV1 {
    public const double FamilyAugmentedTwCap = 1.20;

    public static AirframeIdentity RapierAspirationalIdentity { get; } = new(
        Role: "dispersed TBCC interceptor",
        FuelFreeMassKg: 5150.0,
        GrossMassKg: 9650.0,
        WingLoadingKgM2: 9650.0 / 18.0,
        DryThrustToWeight: 85_000.0 / (9650.0 * 9.80665),
        AugmentedThrustToWeight: 1.15,
        SkinTemperatureLimitK: 1473.15,
        ComparisonFamily: "turbine: F-15-class climb (aug T/W≤1.20); ram: SR-71-class dash claims",
        MaxClimbGammaDegWhileAcceleratingThroughMach1: 40.0,
        MinSustainedVsAeroGGap: 3.0,
        SourceDoc: "docs/superpowers/specs/2026-07-27-flight-test-harness-design.md");

    public static FlightTestProgram Program { get; } = new(
        Id: "interceptor-tbcc-v1",
        Version: "1",
        Gates: new FlightTestGate[] {
            new("identity-mass", true, "Gross mass within 2% of Identity"),
            new("identity-ws", true, "Wing loading within 2% of Identity"),
            new("identity-tw-dry", true, "Dry T/W within 5% of Identity"),
            new("identity-tw-augmented", true, "Augmented T/W within 5% of Identity"),
            new("identity-skin", true, "Skin temperature limit matches Identity exactly"),
            new("tw-augmented-gross", true, "Measured augmented T/W at gross ≤ 1.20"),
        },
        Points: Array.Empty<FlightTestPoint>());
}
