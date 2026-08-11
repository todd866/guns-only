namespace GunsOnly.Sim.Vehicles;

/// <summary>
/// Source-facing main-rotor geometry and operating limits. Angles are blade-root
/// geometric pitch unless a field explicitly says otherwise.
/// </summary>
public sealed record MainRotorDefinition(
    int BladeCount,
    double RadiusM,
    double ChordM,
    double Solidity,
    double LinearTwistRad,
    double LiftCurveSlopePerRad,
    double ProfileDragCoefficient,
    double FlapInertiaPerBladeKgM2,
    double PreconeRad,
    double NominalRpm,
    double MinimumContinuousRpm,
    double MaximumContinuousRpm,
    double MaximumAutorotationRpm,
    double MinimumEffectiveRootPitchRad,
    double MaximumEffectiveRootPitchRad,
    double InducedPowerFactor,
    double DynamicInflowTimeConstantSeconds)
{

    public double DiskAreaM2 => Math.PI * RadiusM * RadiusM;
    public double NominalAngularSpeedRadPerSecond => NominalRpm * 2.0 * Math.PI / 60.0;
    public double TotalFlapInertiaKgM2 => BladeCount * FlapInertiaPerBladeKgM2;
}

public sealed record TailRotorDefinition(
    int BladeCount,
    double RadiusM,
    double ChordM,
    double MainToTailGearRatio,
    double MaximumYawRateRadPerSecond);

public sealed record RotorcraftPowerplantDefinition(
    double MilitaryRatedPowerW,
    double NormalRatedPowerW,
    double TransmissionLimitW,
    double EngineRiseTimeConstantSeconds,
    double EngineFallTimeConstantSeconds,
    double GovernorProportionalGainWPerRpm,
    double GovernorIntegralGainWPerRpmSecond,
    double AccessoryPowerW,
    double TailRotorPowerFraction,
    double SeaLevelDensityKgM3,
    double DensityLapseExponent);

public sealed record RotorcraftAirframeDefinition(
    double EmptyMassKg,
    double MaximumGrossMassKg,
    double MaximumAdditivePayloadMassKg,
    double InertiaReferenceMassKg,
    double RollInertiaKgM2,
    double PitchInertiaKgM2,
    double YawInertiaKgM2,
    double ProductInertiaXzMagnitudeKgM2,
    double FrontalDragAreaM2,
    double SideDragAreaM2,
    double VerticalDragAreaM2,
    double StubWingAreaM2,
    double StubWingIncidenceRad,
    double StubWingLiftCurveSlopePerRad,
    double StubWingMaximumLiftCoefficient,
    double StubWingOswaldEfficiency,
    double StubWingAspectRatio);

public sealed record RotorcraftHandlingDefinition(
    double MaximumDiskTiltRad,
    double DiskResponseTimeConstantSeconds,
    double MaximumRollRateRadPerSecond,
    double MaximumPitchRateRadPerSecond,
    double RollResponseTimeConstantSeconds,
    double PitchResponseTimeConstantSeconds,
    double YawResponseTimeConstantSeconds,
    double StabilityAugmentationCyclicLagSeconds,
    double StabilityAugmentationYawLagSeconds,
    double StabilityAugmentationAuthorityFraction,
    double NumericalMainRotorLoadFactorGuard,
    double RetreatingBladeStallOnsetAdvanceRatio,
    double RetreatingBladeStallFullAdvanceRatio);

public sealed record RotorcraftContactDefinition(
    double CenterOfMassToSkidM,
    double SkidHalfTrackM,
    double ForwardSkidStationM,
    double AftSkidStationM,
    Vec3D MainRotorHubOffsetBodyM,
    Vec3D TailRotorHubOffsetBodyM,
    double HardImpactNormalSpeedMps,
    double StableContactHorizontalSpeedMps,
    double MaximumLandingRollRad,
    double MaximumLandingPitchRad,
    double GearDamageNormalSpeedMps,
    double RolloverLateralSpeedMps,
    double SpinContactYawRateRadPerSecond);

/// <summary>
/// Immutable, variant-locked definition used by a rotorcraft dynamics provider.
/// Source confidence and derivations live beside the definition in docs/airframes.
/// </summary>
public sealed record RotorcraftDefinition(
    string DefinitionVersion,
    string VehicleId,
    string Variant,
    MainRotorDefinition MainRotor,
    TailRotorDefinition TailRotor,
    RotorcraftPowerplantDefinition Powerplant,
    RotorcraftAirframeDefinition Airframe,
    RotorcraftHandlingDefinition Handling,
    RotorcraftContactDefinition Contact)
{

    public void Validate()
    {
        PlayerVehicleValidation.Required(DefinitionVersion, nameof(DefinitionVersion));
        PlayerVehicleValidation.Required(VehicleId, nameof(VehicleId));
        PlayerVehicleValidation.Required(Variant, nameof(Variant));
        ArgumentNullException.ThrowIfNull(MainRotor);
        ArgumentNullException.ThrowIfNull(TailRotor);
        ArgumentNullException.ThrowIfNull(Powerplant);
        ArgumentNullException.ThrowIfNull(Airframe);
        ArgumentNullException.ThrowIfNull(Handling);
        ArgumentNullException.ThrowIfNull(Contact);

        Positive(MainRotor.BladeCount, nameof(MainRotor.BladeCount));
        Positive(MainRotor.RadiusM, nameof(MainRotor.RadiusM));
        Positive(MainRotor.ChordM, nameof(MainRotor.ChordM));
        Positive(MainRotor.Solidity, nameof(MainRotor.Solidity));
        Finite(MainRotor.LinearTwistRad, nameof(MainRotor.LinearTwistRad));
        Positive(MainRotor.LiftCurveSlopePerRad, nameof(MainRotor.LiftCurveSlopePerRad));
        Positive(MainRotor.ProfileDragCoefficient, nameof(MainRotor.ProfileDragCoefficient));
        Positive(MainRotor.FlapInertiaPerBladeKgM2, nameof(MainRotor.FlapInertiaPerBladeKgM2));
        NonNegative(MainRotor.PreconeRad, nameof(MainRotor.PreconeRad));
        Positive(MainRotor.NominalRpm, nameof(MainRotor.NominalRpm));
        Positive(MainRotor.MinimumContinuousRpm, nameof(MainRotor.MinimumContinuousRpm));
        Positive(MainRotor.MaximumContinuousRpm, nameof(MainRotor.MaximumContinuousRpm));
        Positive(MainRotor.MaximumAutorotationRpm, nameof(MainRotor.MaximumAutorotationRpm));
        if (MainRotor.MinimumContinuousRpm > MainRotor.NominalRpm
            || MainRotor.NominalRpm > MainRotor.MaximumContinuousRpm
            || MainRotor.MaximumContinuousRpm > MainRotor.MaximumAutorotationRpm)
            throw new ArgumentException("Main-rotor RPM limits are not ordered.", nameof(MainRotor));
        Finite(MainRotor.MinimumEffectiveRootPitchRad,
            nameof(MainRotor.MinimumEffectiveRootPitchRad));
        Finite(MainRotor.MaximumEffectiveRootPitchRad,
            nameof(MainRotor.MaximumEffectiveRootPitchRad));
        if (MainRotor.MinimumEffectiveRootPitchRad >= MainRotor.MaximumEffectiveRootPitchRad)
            throw new ArgumentException("Main-rotor blade-pitch limits are not ordered.", nameof(MainRotor));
        Positive(MainRotor.InducedPowerFactor, nameof(MainRotor.InducedPowerFactor));
        Positive(MainRotor.DynamicInflowTimeConstantSeconds,
            nameof(MainRotor.DynamicInflowTimeConstantSeconds));

        Positive(TailRotor.BladeCount, nameof(TailRotor.BladeCount));
        Positive(TailRotor.RadiusM, nameof(TailRotor.RadiusM));
        Positive(TailRotor.ChordM, nameof(TailRotor.ChordM));
        Positive(TailRotor.MainToTailGearRatio, nameof(TailRotor.MainToTailGearRatio));
        Positive(TailRotor.MaximumYawRateRadPerSecond,
            nameof(TailRotor.MaximumYawRateRadPerSecond));

        Positive(Powerplant.MilitaryRatedPowerW, nameof(Powerplant.MilitaryRatedPowerW));
        Positive(Powerplant.NormalRatedPowerW, nameof(Powerplant.NormalRatedPowerW));
        Positive(Powerplant.TransmissionLimitW, nameof(Powerplant.TransmissionLimitW));
        if (Powerplant.NormalRatedPowerW > Powerplant.MilitaryRatedPowerW)
            throw new ArgumentException("Normal engine rating cannot exceed military rating.",
                nameof(Powerplant));
        if (Powerplant.TransmissionLimitW > Powerplant.MilitaryRatedPowerW)
            throw new ArgumentException("Transmission power cannot exceed military engine rating.",
                nameof(Powerplant));
        Positive(Powerplant.EngineRiseTimeConstantSeconds,
            nameof(Powerplant.EngineRiseTimeConstantSeconds));
        Positive(Powerplant.EngineFallTimeConstantSeconds,
            nameof(Powerplant.EngineFallTimeConstantSeconds));
        Positive(Powerplant.GovernorProportionalGainWPerRpm,
            nameof(Powerplant.GovernorProportionalGainWPerRpm));
        // Zero is legal and means a proportional-only governor, which droops under load.
        NonNegative(Powerplant.GovernorIntegralGainWPerRpmSecond,
            nameof(Powerplant.GovernorIntegralGainWPerRpmSecond));
        NonNegative(Powerplant.AccessoryPowerW, nameof(Powerplant.AccessoryPowerW));
        Unit(Powerplant.TailRotorPowerFraction, nameof(Powerplant.TailRotorPowerFraction));
        Positive(Powerplant.SeaLevelDensityKgM3, nameof(Powerplant.SeaLevelDensityKgM3));
        Positive(Powerplant.DensityLapseExponent, nameof(Powerplant.DensityLapseExponent));

        Positive(Airframe.EmptyMassKg, nameof(Airframe.EmptyMassKg));
        Positive(Airframe.MaximumGrossMassKg, nameof(Airframe.MaximumGrossMassKg));
        NonNegative(Airframe.MaximumAdditivePayloadMassKg,
            nameof(Airframe.MaximumAdditivePayloadMassKg));
        if (Airframe.EmptyMassKg >= Airframe.MaximumGrossMassKg)
            throw new ArgumentException("Empty mass must be below maximum gross mass.", nameof(Airframe));
        Positive(Airframe.InertiaReferenceMassKg, nameof(Airframe.InertiaReferenceMassKg));
        Positive(Airframe.RollInertiaKgM2, nameof(Airframe.RollInertiaKgM2));
        Positive(Airframe.PitchInertiaKgM2, nameof(Airframe.PitchInertiaKgM2));
        Positive(Airframe.YawInertiaKgM2, nameof(Airframe.YawInertiaKgM2));
        Positive(Airframe.ProductInertiaXzMagnitudeKgM2,
            nameof(Airframe.ProductInertiaXzMagnitudeKgM2));
        Positive(Airframe.FrontalDragAreaM2, nameof(Airframe.FrontalDragAreaM2));
        Positive(Airframe.SideDragAreaM2, nameof(Airframe.SideDragAreaM2));
        Positive(Airframe.VerticalDragAreaM2, nameof(Airframe.VerticalDragAreaM2));
        Positive(Airframe.StubWingAreaM2, nameof(Airframe.StubWingAreaM2));
        Finite(Airframe.StubWingIncidenceRad, nameof(Airframe.StubWingIncidenceRad));
        Positive(Airframe.StubWingLiftCurveSlopePerRad,
            nameof(Airframe.StubWingLiftCurveSlopePerRad));
        Positive(Airframe.StubWingMaximumLiftCoefficient,
            nameof(Airframe.StubWingMaximumLiftCoefficient));
        Unit(Airframe.StubWingOswaldEfficiency, nameof(Airframe.StubWingOswaldEfficiency));
        Positive(Airframe.StubWingAspectRatio, nameof(Airframe.StubWingAspectRatio));

        Positive(Handling.MaximumDiskTiltRad, nameof(Handling.MaximumDiskTiltRad));
        Positive(Handling.DiskResponseTimeConstantSeconds,
            nameof(Handling.DiskResponseTimeConstantSeconds));
        Positive(Handling.MaximumRollRateRadPerSecond,
            nameof(Handling.MaximumRollRateRadPerSecond));
        Positive(Handling.MaximumPitchRateRadPerSecond,
            nameof(Handling.MaximumPitchRateRadPerSecond));
        Positive(Handling.RollResponseTimeConstantSeconds,
            nameof(Handling.RollResponseTimeConstantSeconds));
        Positive(Handling.PitchResponseTimeConstantSeconds,
            nameof(Handling.PitchResponseTimeConstantSeconds));
        Positive(Handling.YawResponseTimeConstantSeconds,
            nameof(Handling.YawResponseTimeConstantSeconds));
        Positive(Handling.StabilityAugmentationCyclicLagSeconds,
            nameof(Handling.StabilityAugmentationCyclicLagSeconds));
        Positive(Handling.StabilityAugmentationYawLagSeconds,
            nameof(Handling.StabilityAugmentationYawLagSeconds));
        Unit(Handling.StabilityAugmentationAuthorityFraction,
            nameof(Handling.StabilityAugmentationAuthorityFraction));
        if (!double.IsFinite(Handling.NumericalMainRotorLoadFactorGuard)
            || Handling.NumericalMainRotorLoadFactorGuard <= 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(Handling.NumericalMainRotorLoadFactorGuard));
        Positive(Handling.RetreatingBladeStallOnsetAdvanceRatio,
            nameof(Handling.RetreatingBladeStallOnsetAdvanceRatio));
        Positive(Handling.RetreatingBladeStallFullAdvanceRatio,
            nameof(Handling.RetreatingBladeStallFullAdvanceRatio));
        if (Handling.RetreatingBladeStallFullAdvanceRatio
            <= Handling.RetreatingBladeStallOnsetAdvanceRatio)
            throw new ArgumentException("Retreating-blade-stall thresholds are not ordered.",
                nameof(Handling));

        Positive(Contact.CenterOfMassToSkidM, nameof(Contact.CenterOfMassToSkidM));
        Positive(Contact.SkidHalfTrackM, nameof(Contact.SkidHalfTrackM));
        Positive(Contact.ForwardSkidStationM, nameof(Contact.ForwardSkidStationM));
        Finite(Contact.AftSkidStationM, nameof(Contact.AftSkidStationM));
        if (Contact.AftSkidStationM >= 0.0)
            throw new ArgumentOutOfRangeException(nameof(Contact.AftSkidStationM));
        PlayerVehicleValidation.Finite(Contact.MainRotorHubOffsetBodyM,
            nameof(Contact.MainRotorHubOffsetBodyM));
        PlayerVehicleValidation.Finite(Contact.TailRotorHubOffsetBodyM,
            nameof(Contact.TailRotorHubOffsetBodyM));
        Positive(Contact.MainRotorHubOffsetBodyM.Y,
            nameof(Contact.MainRotorHubOffsetBodyM));
        Positive(Contact.HardImpactNormalSpeedMps,
            nameof(Contact.HardImpactNormalSpeedMps));
        NonNegative(Contact.StableContactHorizontalSpeedMps,
            nameof(Contact.StableContactHorizontalSpeedMps));
        Positive(Contact.MaximumLandingRollRad, nameof(Contact.MaximumLandingRollRad));
        Positive(Contact.MaximumLandingPitchRad, nameof(Contact.MaximumLandingPitchRad));
        Positive(Contact.GearDamageNormalSpeedMps,
            nameof(Contact.GearDamageNormalSpeedMps));
        if (Contact.GearDamageNormalSpeedMps >= Contact.HardImpactNormalSpeedMps)
            throw new ArgumentOutOfRangeException(
                nameof(Contact.GearDamageNormalSpeedMps),
                "Gear damage must trip below the hard-impact sink limit.");
        Positive(Contact.RolloverLateralSpeedMps,
            nameof(Contact.RolloverLateralSpeedMps));
        Positive(Contact.SpinContactYawRateRadPerSecond,
            nameof(Contact.SpinContactYawRateRadPerSecond));
    }

    static void Positive(int value, string name)
    {
        if (value <= 0) throw new ArgumentOutOfRangeException(name);
    }

    static void Positive(double value, string name) =>
        PlayerVehicleValidation.Positive(value, name);

    static void NonNegative(double value, string name) =>
        PlayerVehicleValidation.NonNegative(value, name);

    static void Finite(double value, string name) =>
        PlayerVehicleValidation.Finite(value, name);

    static void Unit(double value, string name)
    {
        if (!double.IsFinite(value) || value < 0.0 || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }
}
