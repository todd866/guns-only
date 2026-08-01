namespace GunsOnly.Sim.FlightTest.Programs;

public static class InterceptorTbccV1 {
    public const double FamilyAugmentedTwCap = 1.20;

    // This compatibility-named programme is pinned to the v2 shape-first engineering artifact,
    // not to FlightModel.RapierPublicDataSurrogate. The independent anchor still catches runtime
    // buff creep while avoiding a second hand-authored set of dimensions and mass properties.
    // The only engine literals below are the reviewed sea-level-static turbine-core rating and
    // its turbine-only augmentor ratio: the canonical artifact instead closes installed thrust
    // at the M4.2 / 24 km ram-mode design point.
    const double RapierDryThrustN = 84_000.0;
    const double RapierTurbineAugmentorRatio = 1.35;

    static double RapierDryTw =>
        RapierDryThrustN / (RapierV2Design.GrossMassKg * 9.80665);

    public static AirframeIdentity RapierAspirationalIdentity { get; } = new(
        Role: "catapult-launched M4.2 balloon interceptor",
        FuelFreeMassKg: RapierV2Design.EmptyMassKg,
        GrossMassKg: RapierV2Design.GrossMassKg,
        WingLoadingKgM2: RapierV2Design.GrossMassKg / RapierV2Design.ReferenceAreaM2,
        DryThrustToWeight: RapierDryTw,
        // Travel above MIL augments the turbine core only. It never scales inlet-owned ram thrust.
        AugmentedThrustToWeight: RapierDryTw * RapierTurbineAugmentorRatio,
        // Binding insulated panel. The 1,473.15 K SiC/SiC limit applies only to local hot edges.
        SkinTemperatureLimitK: RapierV2Design.BindingThermalLimitK,
        ComparisonFamily: "TBCC teaching aircraft: shape-closed M4.2 dash; augmented T/W≤1.20",
        MaxClimbGammaDegWhileAcceleratingThroughMach1: 40.0,
        MinSustainedVsAeroGGap: 3.0,
        SourceDoc: "airframes/rapier.v2.json + generated engineering artifact");

    public static FlightTestProgram Program { get; } = new(
        Id: "interceptor-tbcc-v2",
        Version: "2",
        Gates: new FlightTestGate[] {
            new("identity-mass", true, "Gross mass within 2% of Identity"),
            new("identity-ws", true, "Wing loading within 2% of Identity"),
            new("identity-tw-dry", true, "Dry T/W within 5% of Identity"),
            new("identity-tw-augmented", true, "Augmented T/W within 5% of Identity"),
            new("identity-skin", true, "Binding-panel temperature limit matches Identity exactly"),
            new("tw-augmented-gross", true, "Measured augmented T/W at gross ≤ 1.20"),
            new("energy-game-gap", true, "AeroMaxG − SustainedG ≥ Identity gap at 10k ft corner band"),
            new("ram-light-band", true, "At M1.5 / FL400, ram share of available thrust < 0.1"),
            new("ab-climb-through-m1", true, "Max γ while accelerating through M∈[0.9,1.3] ≤ Identity cap"),
        },
        Points: new FlightTestPoint[] {
            new("ab-climb-through-m1", "Full-AB climb hold through Mach 1"),
        });
}
