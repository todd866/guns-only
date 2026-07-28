namespace GunsOnly.Sim.FlightTest.Programs;

public static class InterceptorTbccV1 {
    public const double FamilyAugmentedTwCap = 1.20;

    static double RapierDesignGrossKg => FlightModel.RapierPublicDataSurrogate.MassKg;
    static double RapierDesignFuelFreeKg => FlightModel.RapierPublicDataSurrogate.FuelFreeMassKg;
    static double RapierDryTw =>
        FlightModel.RapierPublicDataSurrogate.ThrustMaxN
            / (RapierDesignGrossKg * 9.80665);
    static double RapierAugTw =>
        RapierDryTw * FlightModel.RapierPublicDataSurrogate.MaxThrustFraction;

    public static AirframeIdentity RapierAspirationalIdentity { get; } = new(
        Role: "dispersed TBCC interceptor",
        FuelFreeMassKg: RapierDesignFuelFreeKg,
        GrossMassKg: RapierDesignGrossKg,
        WingLoadingKgM2: RapierDesignGrossKg / 18.0,
        DryThrustToWeight: RapierDryTw,
        AugmentedThrustToWeight: RapierAugTw,
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
            new("energy-game-gap", true, "AeroMaxG − SustainedG ≥ Identity gap at 10k ft corner band"),
            new("ram-light-band", true, "At M1.5 / FL400, ram share of available thrust < 0.1"),
            new("ab-climb-through-m1", true, "Max γ while accelerating through M∈[0.9,1.3] ≤ Identity cap"),
        },
        Points: new FlightTestPoint[] {
            new("ab-climb-through-m1", "Full-AB climb hold through Mach 1"),
        });
}
