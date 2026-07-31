namespace GunsOnly.Sim.FlightTest.Programs;

public static class InterceptorTbccV1 {
    public const double FamilyAugmentedTwCap = 1.20;

    // Deliberately NOT derived from FlightModel.RapierPublicDataSurrogate: the Identity gates
    // exist to catch the flight model drifting off the reviewed design point (buff creep), which
    // a self-referential anchor can never do. Pinned 2026-07-29 to the reviewed design numbers:
    // 5,150 kg airframe + 4 x 360 kg stowed gun-drones, 4,500 kg internal fuel, 84 kN dry core,
    // 1.55 augmentor lever stop. A real design revision must re-pin these in the same commit
    // that changes FlightModel, and say so in the design doc.
    const double RapierDesignFuelFreeKg = 6_590.0;
    const double RapierDesignGrossKg = 11_090.0;
    // Claimed dry thrust-to-weight at gross. Deliberately a literal and not a reference to
    // FlightModel: this is the SPEC the aircraft is checked against, so deriving it from the
    // aircraft would make identity-tw-dry vacuous. Update it when the aeroplane is meant to
    // change, which is what happened here.
    const double RapierDryTw = 50_000.0 / (RapierDesignGrossKg * 9.80665);
    const double RapierAugTw = RapierDryTw * 1.55;

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
