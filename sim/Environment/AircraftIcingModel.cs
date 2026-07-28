namespace GunsOnly.Sim.Environment;

/// <summary>
/// Generic protection state for the exposed reference area represented by the icing state.
/// Anti-ice prevents collection while a de-ice command removes already accreted ice.
/// </summary>
public readonly record struct AircraftIcingProtectionState {
    public double ProtectedSurfaceFraction01 { get; }
    public double AntiIceEffectiveness01 { get; }
    public bool DeiceCommanded { get; }
    public double DeiceRemovalFraction01 { get; }

    public static AircraftIcingProtectionState Off => new(0.0, 0.0, false, 0.0);

    public AircraftIcingProtectionState(
        double protectedSurfaceFraction01,
        double antiIceEffectiveness01,
        bool deiceCommanded,
        double deiceRemovalFraction01)
    {
        ValidateFraction(protectedSurfaceFraction01, nameof(protectedSurfaceFraction01));
        ValidateFraction(antiIceEffectiveness01, nameof(antiIceEffectiveness01));
        ValidateFraction(deiceRemovalFraction01, nameof(deiceRemovalFraction01));

        ProtectedSurfaceFraction01 = protectedSurfaceFraction01;
        AntiIceEffectiveness01 = antiIceEffectiveness01;
        DeiceCommanded = deiceCommanded;
        DeiceRemovalFraction01 = deiceRemovalFraction01;
    }

    internal void Validate() {
        ValidateFraction(ProtectedSurfaceFraction01, nameof(ProtectedSurfaceFraction01));
        ValidateFraction(AntiIceEffectiveness01, nameof(AntiIceEffectiveness01));
        ValidateFraction(DeiceRemovalFraction01, nameof(DeiceRemovalFraction01));
    }

    static void ValidateFraction(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0 || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }
}

/// <summary>
/// Conditions integrated over one deterministic simulation interval. Recovery temperature is the
/// local airframe temperature after aerodynamic heating, not merely outside-air temperature.
/// Snow bonding is an icing-specific wetness/stickiness fraction applied to the shared
/// <see cref="HydrometeorRates.SnowMmWaterEquivalentPerHour"/> rate: zero is dry, non-adhering
/// snow and one is fully available for wet-snow adhesion.
/// </summary>
public readonly record struct AircraftIcingConditions {
    public double AmbientTemperatureC { get; }
    public double RecoveryTemperatureC { get; }
    public double SupercooledLiquidWaterKgPerM3 { get; }
    public HydrometeorRates Hydrometeors { get; }
    public double TrueAirspeedMps { get; }
    public double ExposureSeconds { get; }
    public AircraftIcingProtectionState Protection { get; }
    public double CloudDropletMedianVolumeDiameterMicrometres { get; }
    public double SnowBondingFraction01 { get; }

    public AircraftIcingConditions(
        double ambientTemperatureC,
        double recoveryTemperatureC,
        double supercooledLiquidWaterKgPerM3,
        HydrometeorRates hydrometeors,
        double trueAirspeedMps,
        double exposureSeconds,
        AircraftIcingProtectionState protection,
        double cloudDropletMedianVolumeDiameterMicrometres = 20.0,
        double snowBondingFraction01 = 0.0)
    {
        ValidateTemperature(ambientTemperatureC, nameof(ambientTemperatureC));
        ValidateTemperature(recoveryTemperatureC, nameof(recoveryTemperatureC));
        ValidateNonNegative(supercooledLiquidWaterKgPerM3,
            nameof(supercooledLiquidWaterKgPerM3));
        ValidateHydrometeors(hydrometeors, nameof(hydrometeors));
        ValidateNonNegative(trueAirspeedMps, nameof(trueAirspeedMps));
        ValidateNonNegative(exposureSeconds, nameof(exposureSeconds));
        ValidatePositive(cloudDropletMedianVolumeDiameterMicrometres,
            nameof(cloudDropletMedianVolumeDiameterMicrometres));
        ValidateFraction(snowBondingFraction01, nameof(snowBondingFraction01));
        protection.Validate();

        AmbientTemperatureC = ambientTemperatureC;
        RecoveryTemperatureC = recoveryTemperatureC;
        SupercooledLiquidWaterKgPerM3 = supercooledLiquidWaterKgPerM3;
        Hydrometeors = hydrometeors;
        TrueAirspeedMps = trueAirspeedMps;
        ExposureSeconds = exposureSeconds;
        Protection = protection;
        CloudDropletMedianVolumeDiameterMicrometres =
            cloudDropletMedianVolumeDiameterMicrometres;
        SnowBondingFraction01 = snowBondingFraction01;
    }

    internal void Validate() {
        ValidateTemperature(AmbientTemperatureC, nameof(AmbientTemperatureC));
        ValidateTemperature(RecoveryTemperatureC, nameof(RecoveryTemperatureC));
        ValidateNonNegative(SupercooledLiquidWaterKgPerM3,
            nameof(SupercooledLiquidWaterKgPerM3));
        ValidateHydrometeors(Hydrometeors, nameof(Hydrometeors));
        ValidateNonNegative(TrueAirspeedMps, nameof(TrueAirspeedMps));
        ValidateNonNegative(ExposureSeconds, nameof(ExposureSeconds));
        ValidatePositive(CloudDropletMedianVolumeDiameterMicrometres,
            nameof(CloudDropletMedianVolumeDiameterMicrometres));
        ValidateFraction(SnowBondingFraction01, nameof(SnowBondingFraction01));
        Protection.Validate();
    }

    static void ValidateTemperature(double value, string name) {
        if (!double.IsFinite(value) || value < -100.0 || value > 100.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidatePositive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateNonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateFraction(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0 || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateHydrometeors(in HydrometeorRates rates, string name) {
        if (!rates.IsPhysical)
            throw new ArgumentOutOfRangeException(name);
    }
}

/// <summary>
/// Persistent physical state. Mass per exposed reference area is authoritative; equivalent
/// thickness is derived with the calibrated rime and glaze bulk densities.
/// </summary>
public readonly record struct AircraftIcingState {
    public double RimeIceMassPerAreaKgM2 { get; }
    public double GlazeIceMassPerAreaKgM2 { get; }

    public double TotalIceMassPerAreaKgM2 =>
        RimeIceMassPerAreaKgM2 + GlazeIceMassPerAreaKgM2;

    public double GlazeFraction01 => TotalIceMassPerAreaKgM2 > 0.0
        ? GlazeIceMassPerAreaKgM2 / TotalIceMassPerAreaKgM2
        : 0.0;

    public static AircraftIcingState Clean => new(0.0, 0.0);

    public AircraftIcingState(
        double rimeIceMassPerAreaKgM2,
        double glazeIceMassPerAreaKgM2)
    {
        ValidateNonNegative(rimeIceMassPerAreaKgM2,
            nameof(rimeIceMassPerAreaKgM2));
        ValidateNonNegative(glazeIceMassPerAreaKgM2,
            nameof(glazeIceMassPerAreaKgM2));
        if (!double.IsFinite(rimeIceMassPerAreaKgM2 + glazeIceMassPerAreaKgM2))
            throw new ArgumentOutOfRangeException(nameof(glazeIceMassPerAreaKgM2));

        RimeIceMassPerAreaKgM2 = rimeIceMassPerAreaKgM2;
        GlazeIceMassPerAreaKgM2 = glazeIceMassPerAreaKgM2;
    }

    internal void Validate() {
        ValidateNonNegative(RimeIceMassPerAreaKgM2, nameof(RimeIceMassPerAreaKgM2));
        ValidateNonNegative(GlazeIceMassPerAreaKgM2, nameof(GlazeIceMassPerAreaKgM2));
        if (!double.IsFinite(TotalIceMassPerAreaKgM2))
            throw new ArgumentOutOfRangeException(nameof(TotalIceMassPerAreaKgM2));
    }

    static void ValidateNonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
}

/// <summary>
/// Airframe-neutral consequences. Airframe integration should apply these multipliers to its own
/// clean coefficients rather than pretending one generic ice thickness implies a universal
/// coefficient increment.
/// </summary>
public readonly record struct IcingAerodynamicEffects(
    double Severity01,
    double MaximumLiftCoefficientMultiplier,
    double ParasiteDragMultiplier,
    double PropulsiveEfficiencyMultiplier,
    double ControlAuthorityMultiplier,
    double SensorReliabilityMultiplier,
    double EquivalentIceThicknessM)
{
    public static IcingAerodynamicEffects None => new(
        Severity01: 0.0,
        MaximumLiftCoefficientMultiplier: 1.0,
        ParasiteDragMultiplier: 1.0,
        PropulsiveEfficiencyMultiplier: 1.0,
        ControlAuthorityMultiplier: 1.0,
        SensorReliabilityMultiplier: 1.0,
        EquivalentIceThicknessM: 0.0);
}

public readonly record struct AircraftIcingStepResult(
    AircraftIcingState State,
    IcingAerodynamicEffects Effects,
    double AccretedMassPerAreaKgM2,
    double MeltedMassPerAreaKgM2,
    double ProtectionRemovedMassPerAreaKgM2,
    double NaturallyShedMassPerAreaKgM2);

/// <summary>
/// Explicit calibration envelope for the generic collector.
///
/// The governing collection relation is dimensional: cloud mass flux is liquid-water content
/// (kg/m3) times airspeed (m/s) times an impingement efficiency. A precipitation rate of 1 mm/h
/// water equivalent is 1 kg/m2/h; fall speed converts that vertical flux into an airborne
/// concentration before swept collection is added.
///
/// FAA AC 91-74B identifies supercooled liquid-water content, droplet size, temperature, and
/// exposure as the principal accretion variables, and reports that even relatively small
/// accretions can reduce maximum lift by roughly 30 percent while drag increases of 100 percent
/// are not unusual. Those figures are used only as conservative asymptotic effect bounds here,
/// not as claims about a particular wing or rotor:
/// https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_91-74B.pdf
///
/// Rime/glaze density, impingement, shedding, and protection values below are deliberately
/// isolated calibration assumptions. They must be replaced by component or test-specific data
/// before certification-grade use.
/// </summary>
public sealed record AircraftIcingCalibration {
    public double RimeIceDensityKgPerM3 { get; init; } = 500.0;
    public double GlazeIceDensityKgPerM3 { get; init; } = 900.0;

    public double MaximumCloudCollectionEfficiency01 { get; init; } = 0.80;
    public double CloudDropletDiameterScaleMicrometres { get; init; } = 30.0;
    public double CloudAirspeedScaleMps { get; init; } = 25.0;

    public double RainAdhesionEfficiency01 { get; init; } = 0.0;
    public double FreezingDrizzleAdhesionEfficiency01 { get; init; } = 0.65;
    public double FreezingRainAdhesionEfficiency01 { get; init; } = 0.75;
    public double BondedSnowAdhesionEfficiency01 { get; init; } = 0.20;
    public double IcePelletAdhesionEfficiency01 { get; init; } = 0.0;
    public double GraupelAdhesionEfficiency01 { get; init; } = 0.0;
    public double HailAdhesionEfficiency01 { get; init; } = 0.0;

    public double RainFallSpeedMps { get; init; } = 6.0;
    public double FreezingDrizzleFallSpeedMps { get; init; } = 1.5;
    public double FreezingRainFallSpeedMps { get; init; } = 6.0;
    public double SnowFallSpeedMps { get; init; } = 1.5;
    public double IcePelletFallSpeedMps { get; init; } = 5.0;
    public double GraupelFallSpeedMps { get; init; } = 3.0;
    public double HailFallSpeedMps { get; init; } = 12.0;
    public double MaximumSweptPrecipitationEnhancement { get; init; } = 20.0;
    public double MaximumIncomingIceFluxKgM2PerSecond { get; init; } = 0.015;

    public double StillAirHeatTransferCoefficientWPerM2K { get; init; } = 15.0;
    public double HeatTransferCoefficientPerAirspeedWSecondPerM3K { get; init; } = 0.80;
    public double MaximumHeatTransferCoefficientWPerM2K { get; init; } = 150.0;
    public double LatentHeatOfFusionJPerKg { get; init; } = 334_000.0;

    public double NaturalSheddingOnsetThicknessM { get; init; } = 0.010;
    public double NaturalSheddingMinimumAirspeedMps { get; init; } = 40.0;
    public double NaturalSheddingFullAirspeedMps { get; init; } = 120.0;
    public double MaximumNaturalSheddingRatePerSecond { get; init; } = 0.005;
    public double MaximumNaturalSheddingFractionPerStep01 { get; init; } = 0.15;
    public double MaximumDeiceRemovalFractionPerStep01 { get; init; } = 0.80;
    public double MaximumRetainedIceMassPerAreaKgM2 { get; init; } = 25.0;

    public double CharacteristicEffectsThicknessM { get; init; } = 0.004;
    public double MaximumLiftCoefficientLossFraction01 { get; init; } = 0.30;
    public double MaximumParasiteDragIncreaseFraction { get; init; } = 1.00;
    public double MaximumPropulsiveEfficiencyLossFraction01 { get; init; } = 0.35;
    public double MaximumControlAuthorityLossFraction01 { get; init; } = 0.15;
    public double MaximumSensorReliabilityLossFraction01 { get; init; } = 0.50;

    public static AircraftIcingCalibration Default { get; } = new();

    internal void Validate() {
        ValidatePositive(RimeIceDensityKgPerM3, nameof(RimeIceDensityKgPerM3));
        ValidatePositive(GlazeIceDensityKgPerM3, nameof(GlazeIceDensityKgPerM3));
        ValidateFraction(MaximumCloudCollectionEfficiency01,
            nameof(MaximumCloudCollectionEfficiency01));
        ValidatePositive(CloudDropletDiameterScaleMicrometres,
            nameof(CloudDropletDiameterScaleMicrometres));
        ValidatePositive(CloudAirspeedScaleMps, nameof(CloudAirspeedScaleMps));

        ValidateFraction(RainAdhesionEfficiency01,
            nameof(RainAdhesionEfficiency01));
        ValidateFraction(FreezingDrizzleAdhesionEfficiency01,
            nameof(FreezingDrizzleAdhesionEfficiency01));
        ValidateFraction(FreezingRainAdhesionEfficiency01,
            nameof(FreezingRainAdhesionEfficiency01));
        ValidateFraction(BondedSnowAdhesionEfficiency01,
            nameof(BondedSnowAdhesionEfficiency01));
        ValidateFraction(IcePelletAdhesionEfficiency01,
            nameof(IcePelletAdhesionEfficiency01));
        ValidateFraction(GraupelAdhesionEfficiency01,
            nameof(GraupelAdhesionEfficiency01));
        ValidateFraction(HailAdhesionEfficiency01,
            nameof(HailAdhesionEfficiency01));

        ValidatePositive(RainFallSpeedMps, nameof(RainFallSpeedMps));
        ValidatePositive(FreezingDrizzleFallSpeedMps,
            nameof(FreezingDrizzleFallSpeedMps));
        ValidatePositive(FreezingRainFallSpeedMps, nameof(FreezingRainFallSpeedMps));
        ValidatePositive(SnowFallSpeedMps, nameof(SnowFallSpeedMps));
        ValidatePositive(IcePelletFallSpeedMps, nameof(IcePelletFallSpeedMps));
        ValidatePositive(GraupelFallSpeedMps, nameof(GraupelFallSpeedMps));
        ValidatePositive(HailFallSpeedMps, nameof(HailFallSpeedMps));
        ValidateNonNegative(MaximumSweptPrecipitationEnhancement,
            nameof(MaximumSweptPrecipitationEnhancement));
        ValidatePositive(MaximumIncomingIceFluxKgM2PerSecond,
            nameof(MaximumIncomingIceFluxKgM2PerSecond));

        ValidateNonNegative(StillAirHeatTransferCoefficientWPerM2K,
            nameof(StillAirHeatTransferCoefficientWPerM2K));
        ValidateNonNegative(HeatTransferCoefficientPerAirspeedWSecondPerM3K,
            nameof(HeatTransferCoefficientPerAirspeedWSecondPerM3K));
        ValidatePositive(MaximumHeatTransferCoefficientWPerM2K,
            nameof(MaximumHeatTransferCoefficientWPerM2K));
        ValidatePositive(LatentHeatOfFusionJPerKg, nameof(LatentHeatOfFusionJPerKg));

        ValidatePositive(NaturalSheddingOnsetThicknessM,
            nameof(NaturalSheddingOnsetThicknessM));
        ValidateNonNegative(NaturalSheddingMinimumAirspeedMps,
            nameof(NaturalSheddingMinimumAirspeedMps));
        ValidatePositive(NaturalSheddingFullAirspeedMps,
            nameof(NaturalSheddingFullAirspeedMps));
        if (NaturalSheddingFullAirspeedMps <= NaturalSheddingMinimumAirspeedMps)
            throw new ArgumentOutOfRangeException(nameof(NaturalSheddingFullAirspeedMps));
        ValidateNonNegative(MaximumNaturalSheddingRatePerSecond,
            nameof(MaximumNaturalSheddingRatePerSecond));
        ValidateFraction(MaximumNaturalSheddingFractionPerStep01,
            nameof(MaximumNaturalSheddingFractionPerStep01));
        ValidateFraction(MaximumDeiceRemovalFractionPerStep01,
            nameof(MaximumDeiceRemovalFractionPerStep01));
        ValidatePositive(MaximumRetainedIceMassPerAreaKgM2,
            nameof(MaximumRetainedIceMassPerAreaKgM2));

        ValidatePositive(CharacteristicEffectsThicknessM,
            nameof(CharacteristicEffectsThicknessM));
        ValidateFraction(MaximumLiftCoefficientLossFraction01,
            nameof(MaximumLiftCoefficientLossFraction01));
        ValidateNonNegative(MaximumParasiteDragIncreaseFraction,
            nameof(MaximumParasiteDragIncreaseFraction));
        ValidateFraction(MaximumPropulsiveEfficiencyLossFraction01,
            nameof(MaximumPropulsiveEfficiencyLossFraction01));
        ValidateFraction(MaximumControlAuthorityLossFraction01,
            nameof(MaximumControlAuthorityLossFraction01));
        ValidateFraction(MaximumSensorReliabilityLossFraction01,
            nameof(MaximumSensorReliabilityLossFraction01));
    }

    static void ValidatePositive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateNonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void ValidateFraction(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0 || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }
}

/// <summary>
/// Deterministic, renderer-independent airframe icing integrator. It contains no random shedding
/// or hidden clock; identical state and conditions always produce an identical result.
/// </summary>
public sealed class AircraftIcingModel {
    readonly AircraftIcingCalibration _calibration;

    public AircraftIcingModel(AircraftIcingCalibration? calibration = null) {
        _calibration = calibration ?? AircraftIcingCalibration.Default;
        _calibration.Validate();
    }

    public AircraftIcingCalibration Calibration => _calibration;

    public AircraftIcingStepResult Step(
        in AircraftIcingState previousState,
        in AircraftIcingConditions conditions)
    {
        previousState.Validate();
        conditions.Validate();

        double rimeKgM2 = previousState.RimeIceMassPerAreaKgM2;
        double glazeKgM2 = previousState.GlazeIceMassPerAreaKgM2;
        double exposureSeconds = conditions.ExposureSeconds;

        if (exposureSeconds <= 0.0) {
            return new AircraftIcingStepResult(
                previousState,
                GetAerodynamicEffects(previousState),
                0.0,
                0.0,
                0.0,
                0.0);
        }

        (double rimeFluxKgM2S, double glazeFluxKgM2S) =
            CalculateIncomingIceFlux(conditions);
        double collectionProtectionMultiplier = Math.Clamp(
            1.0
                - conditions.Protection.ProtectedSurfaceFraction01
                * conditions.Protection.AntiIceEffectiveness01,
            0.0,
            1.0);
        double freezingFraction = CalculateFreezingFraction(conditions);
        double accretionMultiplier = collectionProtectionMultiplier * freezingFraction;

        double accretionFluxKgM2S = rimeFluxKgM2S + glazeFluxKgM2S;
        double maximumAccretedKgM2 = _calibration.MaximumRetainedIceMassPerAreaKgM2;
        double accretedKgM2 = SaturatingProduct(
            Math.Min(accretionFluxKgM2S,
                _calibration.MaximumIncomingIceFluxKgM2PerSecond)
                * accretionMultiplier,
            exposureSeconds,
            maximumAccretedKgM2);

        if (accretionFluxKgM2S > 0.0 && accretedKgM2 > 0.0) {
            double rimeFraction = rimeFluxKgM2S / accretionFluxKgM2S;
            rimeKgM2 += accretedKgM2 * rimeFraction;
            glazeKgM2 += accretedKgM2 * (1.0 - rimeFraction);
        }

        double meltedKgM2 = CalculateMeltedMass(
            rimeKgM2 + glazeKgM2,
            conditions);
        RemoveProportionally(ref rimeKgM2, ref glazeKgM2, meltedKgM2);

        double protectionRemovedKgM2 = 0.0;
        if (conditions.Protection.DeiceCommanded) {
            double removalFraction = Math.Min(
                conditions.Protection.DeiceRemovalFraction01,
                _calibration.MaximumDeiceRemovalFractionPerStep01)
                * conditions.Protection.ProtectedSurfaceFraction01;
            protectionRemovedKgM2 = (rimeKgM2 + glazeKgM2) * removalFraction;
            RemoveProportionally(
                ref rimeKgM2,
                ref glazeKgM2,
                protectionRemovedKgM2);
        }

        double naturallyShedKgM2 = CalculateNaturalShedding(
            rimeKgM2,
            glazeKgM2,
            conditions.TrueAirspeedMps,
            exposureSeconds);
        RemoveProportionally(ref rimeKgM2, ref glazeKgM2, naturallyShedKgM2);

        double retainedKgM2 = rimeKgM2 + glazeKgM2;
        if (retainedKgM2 > _calibration.MaximumRetainedIceMassPerAreaKgM2) {
            double overflowKgM2 =
                retainedKgM2 - _calibration.MaximumRetainedIceMassPerAreaKgM2;
            RemoveProportionally(ref rimeKgM2, ref glazeKgM2, overflowKgM2);
            naturallyShedKgM2 += overflowKgM2;
        }

        var nextState = new AircraftIcingState(rimeKgM2, glazeKgM2);
        return new AircraftIcingStepResult(
            nextState,
            GetAerodynamicEffects(nextState),
            accretedKgM2,
            meltedKgM2,
            protectionRemovedKgM2,
            naturallyShedKgM2);
    }

    public double GetEquivalentIceThicknessM(in AircraftIcingState state) {
        state.Validate();
        return state.RimeIceMassPerAreaKgM2 / _calibration.RimeIceDensityKgPerM3
            + state.GlazeIceMassPerAreaKgM2 / _calibration.GlazeIceDensityKgPerM3;
    }

    public IcingAerodynamicEffects GetAerodynamicEffects(
        in AircraftIcingState state)
    {
        double thicknessM = GetEquivalentIceThicknessM(state);
        if (thicknessM <= 0.0)
            return IcingAerodynamicEffects.None;

        // Glaze and SLD accretions tend to form more aerodynamically disruptive shapes than an
        // equal equivalent thickness of rime. This small bounded morphology factor preserves that
        // ordering without claiming to reproduce an airfoil-specific horn geometry.
        double morphologyMultiplier =
            0.85 + 0.30 * state.GlazeFraction01;
        double severity01 = Math.Clamp(
            1.0 - Math.Exp(
                -thicknessM * morphologyMultiplier
                / _calibration.CharacteristicEffectsThicknessM),
            0.0,
            1.0);

        return new IcingAerodynamicEffects(
            Severity01: severity01,
            MaximumLiftCoefficientMultiplier:
                1.0 - _calibration.MaximumLiftCoefficientLossFraction01 * severity01,
            ParasiteDragMultiplier:
                1.0 + _calibration.MaximumParasiteDragIncreaseFraction * severity01,
            PropulsiveEfficiencyMultiplier:
                1.0 - _calibration.MaximumPropulsiveEfficiencyLossFraction01 * severity01,
            ControlAuthorityMultiplier:
                1.0 - _calibration.MaximumControlAuthorityLossFraction01 * severity01,
            SensorReliabilityMultiplier:
                1.0 - _calibration.MaximumSensorReliabilityLossFraction01 * severity01,
            EquivalentIceThicknessM: thicknessM);
    }

    (double RimeFluxKgM2S, double GlazeFluxKgM2S) CalculateIncomingIceFlux(
        in AircraftIcingConditions conditions)
    {
        double cloudCollectionEfficiency =
            _calibration.MaximumCloudCollectionEfficiency01
            * conditions.CloudDropletMedianVolumeDiameterMicrometres
            / (conditions.CloudDropletMedianVolumeDiameterMicrometres
                + _calibration.CloudDropletDiameterScaleMicrometres)
            * conditions.TrueAirspeedMps
            / (conditions.TrueAirspeedMps + _calibration.CloudAirspeedScaleMps);
        double cloudFluxKgM2S =
            conditions.SupercooledLiquidWaterKgPerM3
            * conditions.TrueAirspeedMps
            * cloudCollectionEfficiency;

        double rainFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.RainMmWaterEquivalentPerHour,
            _calibration.RainFallSpeedMps,
            _calibration.RainAdhesionEfficiency01,
            conditions.TrueAirspeedMps);
        double freezingDrizzleFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.FreezingDrizzleMmWaterEquivalentPerHour,
            _calibration.FreezingDrizzleFallSpeedMps,
            _calibration.FreezingDrizzleAdhesionEfficiency01,
            conditions.TrueAirspeedMps);
        double freezingRainFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.FreezingRainMmWaterEquivalentPerHour,
            _calibration.FreezingRainFallSpeedMps,
            _calibration.FreezingRainAdhesionEfficiency01,
            conditions.TrueAirspeedMps);
        double bondedSnowFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.SnowMmWaterEquivalentPerHour,
            _calibration.SnowFallSpeedMps,
            _calibration.BondedSnowAdhesionEfficiency01
                * conditions.SnowBondingFraction01,
            conditions.TrueAirspeedMps);
        double icePelletFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.IcePelletsMmWaterEquivalentPerHour,
            _calibration.IcePelletFallSpeedMps,
            _calibration.IcePelletAdhesionEfficiency01,
            conditions.TrueAirspeedMps);
        double graupelFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.GraupelMmWaterEquivalentPerHour,
            _calibration.GraupelFallSpeedMps,
            _calibration.GraupelAdhesionEfficiency01,
            conditions.TrueAirspeedMps);
        double hailFluxKgM2S = PrecipitationCollectionFlux(
            conditions.Hydrometeors.HailMmWaterEquivalentPerHour,
            _calibration.HailFallSpeedMps,
            _calibration.HailAdhesionEfficiency01,
            conditions.TrueAirspeedMps);

        double warmth01 = Math.Clamp(
            (conditions.AmbientTemperatureC + 15.0) / 15.0,
            0.0,
            1.0);
        double largeDroplet01 = Math.Clamp(
            (conditions.CloudDropletMedianVolumeDiameterMicrometres - 20.0) / 80.0,
            0.0,
            1.0);

        double cloudGlazeFraction01 =
            Math.Clamp(0.05 + 0.60 * warmth01 + 0.30 * largeDroplet01, 0.0, 1.0);
        double freezingDrizzleGlazeFraction01 =
            Math.Clamp(0.70 + 0.25 * warmth01, 0.0, 1.0);
        double freezingRainGlazeFraction01 =
            Math.Clamp(0.90 + 0.10 * warmth01, 0.0, 1.0);
        double bondedSnowGlazeFraction01 =
            Math.Clamp(0.30 + 0.40 * warmth01, 0.0, 1.0);

        // Rain, dry snow, ice pellets, graupel, and hail default to zero adhesion because the
        // canonical phase alone does not imply bonded structural ice. Snow contributes only
        // through the explicit wet-snow bonding fraction. The other efficiencies remain explicit
        // calibration inputs so specialised surface or impact models can opt in.
        double rimeFluxKgM2S =
            cloudFluxKgM2S * (1.0 - cloudGlazeFraction01)
            + freezingDrizzleFluxKgM2S * (1.0 - freezingDrizzleGlazeFraction01)
            + freezingRainFluxKgM2S * (1.0 - freezingRainGlazeFraction01)
            + bondedSnowFluxKgM2S * (1.0 - bondedSnowGlazeFraction01)
            + icePelletFluxKgM2S
            + graupelFluxKgM2S
            + hailFluxKgM2S;
        double glazeFluxKgM2S =
            cloudFluxKgM2S * cloudGlazeFraction01
            + rainFluxKgM2S
            + freezingDrizzleFluxKgM2S * freezingDrizzleGlazeFraction01
            + freezingRainFluxKgM2S * freezingRainGlazeFraction01
            + bondedSnowFluxKgM2S * bondedSnowGlazeFraction01;

        return (rimeFluxKgM2S, glazeFluxKgM2S);
    }

    double PrecipitationCollectionFlux(
        double waterEquivalentMmPerHour,
        double fallSpeedMps,
        double adhesionEfficiency01,
        double trueAirspeedMps)
    {
        // One millimetre of liquid water over one square metre has one kilogram of mass.
        double verticalWaterFluxKgM2S = waterEquivalentMmPerHour / 3_600.0;
        double sweptEnhancement = Math.Min(
            trueAirspeedMps / fallSpeedMps,
            _calibration.MaximumSweptPrecipitationEnhancement);
        return verticalWaterFluxKgM2S
            * adhesionEfficiency01
            * (1.0 + sweptEnhancement);
    }

    static double CalculateFreezingFraction(in AircraftIcingConditions conditions) {
        // At and below a 0 C recovered surface the collected liquid is allowed to freeze. Above
        // freezing, runback potential fades over a narrow two-degree band before melting dominates.
        double recoveryFraction01 = conditions.RecoveryTemperatureC <= 0.0
            ? 1.0
            : Math.Clamp(1.0 - conditions.RecoveryTemperatureC / 2.0, 0.0, 1.0);
        double ambientSupercoolingFraction01 = conditions.AmbientTemperatureC <= 0.0
            ? 1.0
            : Math.Clamp(1.0 - conditions.AmbientTemperatureC / 2.0, 0.0, 1.0);
        return Math.Min(recoveryFraction01, ambientSupercoolingFraction01);
    }

    double CalculateMeltedMass(
        double availableMassKgM2,
        in AircraftIcingConditions conditions)
    {
        if (availableMassKgM2 <= 0.0 || conditions.RecoveryTemperatureC <= 0.0)
            return 0.0;

        // Convective sensible heat divided by latent heat of fusion gives a mass flux. Recovery
        // temperature supplies the surface-to-melting-point temperature difference.
        double heatTransferCoefficientWPerM2K = Math.Min(
            _calibration.MaximumHeatTransferCoefficientWPerM2K,
            _calibration.StillAirHeatTransferCoefficientWPerM2K
                + _calibration.HeatTransferCoefficientPerAirspeedWSecondPerM3K
                * conditions.TrueAirspeedMps);
        double meltFluxKgM2S =
            heatTransferCoefficientWPerM2K
            * conditions.RecoveryTemperatureC
            / _calibration.LatentHeatOfFusionJPerKg;
        return Math.Min(
            availableMassKgM2,
            SaturatingProduct(
                meltFluxKgM2S,
                conditions.ExposureSeconds,
                availableMassKgM2));
    }

    double CalculateNaturalShedding(
        double rimeKgM2,
        double glazeKgM2,
        double trueAirspeedMps,
        double exposureSeconds)
    {
        double totalKgM2 = rimeKgM2 + glazeKgM2;
        if (totalKgM2 <= 0.0
            || trueAirspeedMps <= _calibration.NaturalSheddingMinimumAirspeedMps)
            return 0.0;

        double thicknessM =
            rimeKgM2 / _calibration.RimeIceDensityKgPerM3
            + glazeKgM2 / _calibration.GlazeIceDensityKgPerM3;
        if (thicknessM <= _calibration.NaturalSheddingOnsetThicknessM)
            return 0.0;

        double thicknessExcess01 = Math.Clamp(
            thicknessM / _calibration.NaturalSheddingOnsetThicknessM - 1.0,
            0.0,
            1.0);
        double airspeed01 = Math.Clamp(
            (trueAirspeedMps - _calibration.NaturalSheddingMinimumAirspeedMps)
            / (_calibration.NaturalSheddingFullAirspeedMps
                - _calibration.NaturalSheddingMinimumAirspeedMps),
            0.0,
            1.0);
        double sheddingRatePerSecond =
            _calibration.MaximumNaturalSheddingRatePerSecond
            * thicknessExcess01
            * airspeed01;
        double removalFraction01 = Math.Min(
            1.0 - Math.Exp(-sheddingRatePerSecond * exposureSeconds),
            _calibration.MaximumNaturalSheddingFractionPerStep01);
        return totalKgM2 * removalFraction01;
    }

    static void RemoveProportionally(
        ref double rimeKgM2,
        ref double glazeKgM2,
        double removalKgM2)
    {
        double totalKgM2 = rimeKgM2 + glazeKgM2;
        if (removalKgM2 <= 0.0 || totalKgM2 <= 0.0)
            return;

        double retainedFraction01 =
            Math.Clamp(1.0 - removalKgM2 / totalKgM2, 0.0, 1.0);
        rimeKgM2 *= retainedFraction01;
        glazeKgM2 *= retainedFraction01;
    }

    static double SaturatingProduct(double first, double second, double maximum) {
        if (first <= 0.0 || second <= 0.0)
            return 0.0;
        if (first >= maximum / second)
            return maximum;
        return first * second;
    }
}
