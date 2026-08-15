namespace GunsOnly.Sim.Vehicles;

/// <summary>
/// A late-production Vietnam-era AH-1G baseline: T53-L-13B, 540 rotor and the
/// starboard tractor tail-rotor arrangement. It is intentionally not an AH-1S/F.
/// </summary>
public static class Ah1gCobraDefinition
{
    public const string Version = "ah-1g.late-production.flight-foundation.v1";

    public static RotorcraftDefinition LateProduction { get; } = CreateLateProduction();

    static RotorcraftDefinition CreateLateProduction()
    {
        var definition = new RotorcraftDefinition(
            DefinitionVersion: Version,
            VehicleId: "ah-1g-cobra",
            Variant: "late-production AH-1G, T53-L-13B, 540 rotor, tractor tail rotor",
            MainRotor: new MainRotorDefinition(
                BladeCount: 2,
                RadiusM: 6.706,
                ChordM: 0.686,
                Solidity: 0.0651,
                LinearTwistRad: Degrees(-10.0),
                LiftCurveSlopePerRad: 5.73,
                ProfileDragCoefficient: 0.0088,
                FlapInertiaPerBladeKgM2: 1_878.0,
                PreconeRad: Degrees(2.75),
                NominalRpm: 324.0,
                MinimumContinuousRpm: 294.0,
                MaximumContinuousRpm: 324.0,
                MaximumAutorotationRpm: 339.0,
                MinimumEffectiveRootPitchRad: Degrees(8.5),
                MaximumEffectiveRootPitchRad: Degrees(20.5),
                // Hover figure of merit was ~0.62 with kappa 1.15 / Cd0 0.012 (93% TQ at basic
                // mission weight). A real AH-1G rotor sits near 0.70–0.72; bring kappa and profile
                // drag down so OGE hover draws ~80% of the 1,100 shp transmission — do NOT raise
                // engine rating to paper over a starved rotor.
                InducedPowerFactor: 1.10,
                DynamicInflowTimeConstantSeconds: 0.18),
            TailRotor: new TailRotorDefinition(
                BladeCount: 2,
                RadiusM: 1.295,
                ChordM: 0.214,
                MainToTailGearRatio: 5.123,
                MaximumYawRateRadPerSecond: Degrees(45.0)),
            Powerplant: new RotorcraftPowerplantDefinition(
                MilitaryRatedPowerW: Horsepower(1_400.0),
                NormalRatedPowerW: Horsepower(1_250.0),
                TransmissionLimitW: Horsepower(1_100.0),
                // The T53 governor has to catch a normal collective pull before the low-inertia
                // two-blade system advertises a false engine stumble. A 0.12 s first-order rise
                // reaches 95% in about 0.36 s: still a finite turbine response, but quick enough
                // that the playable 0.40/s lever produces only a sub-one-percent Nr transient.
                EngineRiseTimeConstantSeconds: 0.12,
                EngineFallTimeConstantSeconds: 0.40,
                GovernorProportionalGainWPerRpm: 24_000.0,
                // Proportional-only control needs a standing rpm error to hold a standing power
                // correction, so the rotor sat near 85% Nr for whole sorties with LOW ROTOR RPM
                // lit. Ki = Kp / 1.5 s closes a cruise-with-margin residual that Ki=Kp/2 left at
                // ~96% Nr with torque still in hand (Build 266 gap).
                GovernorIntegralGainWPerRpmSecond: 14_000.0,
                AccessoryPowerW: 18_000.0,
                TailRotorPowerFraction: 0.085,
                SeaLevelDensityKgM3: 1.225,
                DensityLapseExponent: 0.85),
            Airframe: new RotorcraftAirframeDefinition(
                EmptyMassKg: Pounds(5_760.0),
                MaximumGrossMassKg: Pounds(9_500.0),
                MaximumAdditivePayloadMassKg: Pounds(9_500.0 - 5_760.0),
                InertiaReferenceMassKg: Pounds(8_930.77),
                RollInertiaKgM2: 3_948.0,
                PitchInertiaKgM2: 18_038.0,
                YawInertiaKgM2: 15_527.0,
                ProductInertiaXzMagnitudeKgM2: 1_288.0,
                FrontalDragAreaM2: 1.70,
                SideDragAreaM2: 4.20,
                VerticalDragAreaM2: 5.80,
                StubWingAreaM2: 1.63,
                StubWingIncidenceRad: Degrees(14.0),
                StubWingLiftCurveSlopePerRad: 4.25,
                StubWingMaximumLiftCoefficient: 1.15,
                StubWingOswaldEfficiency: 0.72,
                StubWingAspectRatio: 3.4),
            Handling: new RotorcraftHandlingDefinition(
                MaximumDiskTiltRad: Degrees(10.0),
                // Whole-disk response is provisional and deliberately distinct from SCAS lag.
                DiskResponseTimeConstantSeconds: 0.12,
                MaximumRollRateRadPerSecond: Degrees(60.0),
                MaximumPitchRateRadPerSecond: Degrees(42.0),
                RollResponseTimeConstantSeconds: 0.34,
                PitchResponseTimeConstantSeconds: 0.38,
                YawResponseTimeConstantSeconds: 0.24,
                StabilityAugmentationCyclicLagSeconds: 0.08,
                StabilityAugmentationYawLagSeconds: 0.05,
                StabilityAugmentationAuthorityFraction: 0.125,
                // Highest cited clean-configuration structural factor; this is only a
                // divergence guard until weight/store-specific envelopes are integrated.
                NumericalMainRotorLoadFactorGuard: 3.7,
                RetreatingBladeStallOnsetAdvanceRatio: 0.34,
                RetreatingBladeStallFullAdvanceRatio: 0.50),
            Contact: new RotorcraftContactDefinition(
                CenterOfMassToSkidM: 0.315,
                SkidHalfTrackM: 0.91,
                ForwardSkidStationM: 1.85,
                AftSkidStationM: -1.65,
                MainRotorHubOffsetBodyM: new Vec3D(0.0, 2.073, -0.155),
                TailRotorHubOffsetBodyM: new Vec3D(0.386, 1.190, -8.300),
                // Owner landings flared at ~15–20° and ~400–600 fpm and always crashed: the old
                // 10° pitch / 3.05 m/s (~600 fpm) box treated every flare as a hard impact.
                HardImpactNormalSpeedMps: 6.5,
                StableContactHorizontalSpeedMps: 0.45,
                MaximumLandingRollRad: Degrees(22.0),
                MaximumLandingPitchRad: Degrees(25.0),
                // Skid design-sink territory: firm arrivals above this bend the gear without
                // ending the sortie; the 6.5 m/s hard-impact limit above stays the kill.
                GearDamageNormalSpeedMps: 3.0,
                RolloverLateralSpeedMps: 1.5,
                SpinContactYawRateRadPerSecond: 0.52));
        definition.Validate();
        return definition;
    }

    static double Degrees(double value) => value * Math.PI / 180.0;
    static double Pounds(double value) => value * 0.45359237;
    static double Horsepower(double value) => value * 745.699872;
}
