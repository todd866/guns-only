using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class AircraftIcingModelTests {
    static AircraftIcingConditions CloudConditions(
        double exposureSeconds = 60.0,
        AircraftIcingProtectionState? protection = null) => new(
        ambientTemperatureC: -8.0,
        recoveryTemperatureC: -7.0,
        supercooledLiquidWaterKgPerM3: 0.0005,
        hydrometeors: HydrometeorRates.None,
        trueAirspeedMps: 50.0,
        exposureSeconds: exposureSeconds,
        protection: protection ?? AircraftIcingProtectionState.Off,
        cloudDropletMedianVolumeDiameterMicrometres: 20.0);

    [Fact]
    public void SupercooledCloudAccumulatesPhysicalMassAndAppliesBoundedPenalties() {
        var model = new AircraftIcingModel();

        AircraftIcingStepResult result =
            model.Step(AircraftIcingState.Clean, CloudConditions());

        Assert.True(result.AccretedMassPerAreaKgM2 > 0.0);
        Assert.Equal(
            result.AccretedMassPerAreaKgM2,
            result.State.TotalIceMassPerAreaKgM2,
            12);
        Assert.True(result.Effects.EquivalentIceThicknessM > 0.0);
        Assert.InRange(result.Effects.Severity01, 0.0, 1.0);
        Assert.InRange(result.Effects.MaximumLiftCoefficientMultiplier, 0.70, 1.0);
        Assert.InRange(result.Effects.ParasiteDragMultiplier, 1.0, 2.0);
        Assert.InRange(result.Effects.PropulsiveEfficiencyMultiplier, 0.65, 1.0);
        Assert.InRange(result.Effects.ControlAuthorityMultiplier, 0.85, 1.0);
        Assert.InRange(result.Effects.SensorReliabilityMultiplier, 0.50, 1.0);
    }

    [Fact]
    public void EqualRateFreezingDrizzleAccretesMoreThanWetSnow() {
        var model = new AircraftIcingModel();
        var drizzle = new AircraftIcingConditions(
            ambientTemperatureC: -3.0,
            recoveryTemperatureC: -2.0,
            supercooledLiquidWaterKgPerM3: 0.0,
            hydrometeors: new HydrometeorRates(
                freezingDrizzleMmWaterEquivalentPerHour: 2.0),
            trueAirspeedMps: 50.0,
            exposureSeconds: 60.0,
            protection: AircraftIcingProtectionState.Off);
        var wetSnow = new AircraftIcingConditions(
            ambientTemperatureC: -3.0,
            recoveryTemperatureC: -2.0,
            supercooledLiquidWaterKgPerM3: 0.0,
            hydrometeors: new HydrometeorRates(
                snowMmWaterEquivalentPerHour: 2.0),
            trueAirspeedMps: 50.0,
            exposureSeconds: 60.0,
            protection: AircraftIcingProtectionState.Off,
            snowBondingFraction01: 1.0);

        AircraftIcingStepResult drizzleResult =
            model.Step(AircraftIcingState.Clean, drizzle);
        AircraftIcingStepResult wetSnowResult =
            model.Step(AircraftIcingState.Clean, wetSnow);

        Assert.True(
            drizzleResult.State.TotalIceMassPerAreaKgM2
            > wetSnowResult.State.TotalIceMassPerAreaKgM2);
        Assert.True(drizzleResult.State.GlazeFraction01
            > wetSnowResult.State.GlazeFraction01);
    }

    [Fact]
    public void NonBondingHydrometeorsDoNotBecomeStructuralIceByDefault() {
        var model = new AircraftIcingModel();
        var solidPrecipitation = new AircraftIcingConditions(
            ambientTemperatureC: -10.0,
            recoveryTemperatureC: -9.0,
            supercooledLiquidWaterKgPerM3: 0.0,
            hydrometeors: new HydrometeorRates(
                rainMmWaterEquivalentPerHour: 50.0,
                snowMmWaterEquivalentPerHour: 50.0,
                icePelletsMmWaterEquivalentPerHour: 50.0,
                graupelMmWaterEquivalentPerHour: 50.0,
                hailMmWaterEquivalentPerHour: 50.0),
            trueAirspeedMps: 70.0,
            exposureSeconds: 600.0,
            protection: AircraftIcingProtectionState.Off);

        AircraftIcingStepResult result =
            model.Step(AircraftIcingState.Clean, solidPrecipitation);

        Assert.Equal(AircraftIcingState.Clean, result.State);
        Assert.Equal(IcingAerodynamicEffects.None, result.Effects);
        Assert.Equal(0.0, result.AccretedMassPerAreaKgM2);
    }

    [Fact]
    public void FullAntiIcePreventsAccretionAndPartialCoverageReducesIt() {
        var model = new AircraftIcingModel();
        AircraftIcingStepResult unprotected =
            model.Step(AircraftIcingState.Clean, CloudConditions());
        AircraftIcingStepResult partial = model.Step(
            AircraftIcingState.Clean,
            CloudConditions(protection: new AircraftIcingProtectionState(
                protectedSurfaceFraction01: 0.5,
                antiIceEffectiveness01: 0.8,
                deiceCommanded: false,
                deiceRemovalFraction01: 0.0)));
        AircraftIcingStepResult fullyProtected = model.Step(
            AircraftIcingState.Clean,
            CloudConditions(protection: new AircraftIcingProtectionState(
                protectedSurfaceFraction01: 1.0,
                antiIceEffectiveness01: 1.0,
                deiceCommanded: false,
                deiceRemovalFraction01: 0.0)));

        Assert.InRange(
            partial.AccretedMassPerAreaKgM2,
            0.0,
            unprotected.AccretedMassPerAreaKgM2);
        Assert.True(partial.AccretedMassPerAreaKgM2
            < unprotected.AccretedMassPerAreaKgM2);
        Assert.Equal(0.0, fullyProtected.AccretedMassPerAreaKgM2);
        Assert.Equal(AircraftIcingState.Clean, fullyProtected.State);
    }

    [Fact]
    public void PositiveRecoveryTemperatureMeltsExistingIceWithoutGoingNegative() {
        var model = new AircraftIcingModel();
        var initial = new AircraftIcingState(
            rimeIceMassPerAreaKgM2: 1.0,
            glazeIceMassPerAreaKgM2: 1.0);
        var thaw = new AircraftIcingConditions(
            ambientTemperatureC: 5.0,
            recoveryTemperatureC: 5.0,
            supercooledLiquidWaterKgPerM3: 0.0,
            hydrometeors: HydrometeorRates.None,
            trueAirspeedMps: 50.0,
            exposureSeconds: 600.0,
            protection: AircraftIcingProtectionState.Off);

        AircraftIcingStepResult result = model.Step(initial, thaw);

        Assert.True(result.MeltedMassPerAreaKgM2 > 0.0);
        Assert.True(result.State.TotalIceMassPerAreaKgM2
            < initial.TotalIceMassPerAreaKgM2);
        Assert.True(result.State.RimeIceMassPerAreaKgM2 >= 0.0);
        Assert.True(result.State.GlazeIceMassPerAreaKgM2 >= 0.0);

        var fullyMelted = model.Step(
            initial,
            new AircraftIcingConditions(
                thaw.AmbientTemperatureC,
                thaw.RecoveryTemperatureC,
                thaw.SupercooledLiquidWaterKgPerM3,
                thaw.Hydrometeors,
                thaw.TrueAirspeedMps,
                exposureSeconds: 100_000.0,
                thaw.Protection,
                thaw.CloudDropletMedianVolumeDiameterMicrometres));
        Assert.Equal(AircraftIcingState.Clean, fullyMelted.State);
    }

    [Fact]
    public void DeicePulseIsCoverageAwareAndCappedPerStep() {
        var model = new AircraftIcingModel();
        var initial = new AircraftIcingState(
            rimeIceMassPerAreaKgM2: 3.0,
            glazeIceMassPerAreaKgM2: 2.0);
        var deice = new AircraftIcingConditions(
            ambientTemperatureC: -10.0,
            recoveryTemperatureC: -9.0,
            supercooledLiquidWaterKgPerM3: 0.0,
            hydrometeors: HydrometeorRates.None,
            trueAirspeedMps: 0.0,
            exposureSeconds: 1.0,
            protection: new AircraftIcingProtectionState(
                protectedSurfaceFraction01: 1.0,
                antiIceEffectiveness01: 0.0,
                deiceCommanded: true,
                deiceRemovalFraction01: 1.0));

        AircraftIcingStepResult result = model.Step(initial, deice);

        Assert.Equal(4.0, result.ProtectionRemovedMassPerAreaKgM2, 12);
        Assert.Equal(1.0, result.State.TotalIceMassPerAreaKgM2, 12);
        Assert.Equal(initial.GlazeFraction01, result.State.GlazeFraction01, 12);
    }

    [Fact]
    public void NaturalSheddingIsDeterministicAndBounded() {
        var model = new AircraftIcingModel();
        var initial = new AircraftIcingState(
            rimeIceMassPerAreaKgM2: 10.0,
            glazeIceMassPerAreaKgM2: 0.0);
        var fastFlight = new AircraftIcingConditions(
            ambientTemperatureC: -15.0,
            recoveryTemperatureC: -12.0,
            supercooledLiquidWaterKgPerM3: 0.0,
            hydrometeors: HydrometeorRates.None,
            trueAirspeedMps: 120.0,
            exposureSeconds: 1_000.0,
            protection: AircraftIcingProtectionState.Off);

        AircraftIcingStepResult first = model.Step(initial, fastFlight);
        AircraftIcingStepResult second = model.Step(initial, fastFlight);

        Assert.Equal(first, second);
        Assert.True(first.NaturallyShedMassPerAreaKgM2 > 0.0);
        Assert.Equal(
            initial.TotalIceMassPerAreaKgM2
                * model.Calibration.MaximumNaturalSheddingFractionPerStep01,
            first.NaturallyShedMassPerAreaKgM2,
            12);
        Assert.True(first.State.TotalIceMassPerAreaKgM2 >= 0.0);
    }

    [Fact]
    public void LargeExposureStaysFiniteAndInsideRetentionEnvelope() {
        var model = new AircraftIcingModel();
        var severe = new AircraftIcingConditions(
            ambientTemperatureC: -2.0,
            recoveryTemperatureC: -1.0,
            supercooledLiquidWaterKgPerM3: 0.01,
            hydrometeors: new HydrometeorRates(
                rainMmWaterEquivalentPerHour: 20.0,
                snowMmWaterEquivalentPerHour: 20.0,
                freezingDrizzleMmWaterEquivalentPerHour: 20.0,
                freezingRainMmWaterEquivalentPerHour: 20.0,
                icePelletsMmWaterEquivalentPerHour: 20.0,
                graupelMmWaterEquivalentPerHour: 20.0,
                hailMmWaterEquivalentPerHour: 20.0),
            trueAirspeedMps: 100.0,
            exposureSeconds: 1_000_000.0,
            protection: AircraftIcingProtectionState.Off,
            cloudDropletMedianVolumeDiameterMicrometres: 200.0);

        AircraftIcingStepResult result =
            model.Step(AircraftIcingState.Clean, severe);

        Assert.True(double.IsFinite(result.State.TotalIceMassPerAreaKgM2));
        Assert.InRange(
            result.State.TotalIceMassPerAreaKgM2,
            0.0,
            model.Calibration.MaximumRetainedIceMassPerAreaKgM2);
        Assert.InRange(result.Effects.Severity01, 0.0, 1.0);
    }

    [Fact]
    public void AerodynamicEffectsIncreaseMonotonicallyAndRemainInsideEnvelope() {
        var model = new AircraftIcingModel();
        IcingAerodynamicEffects clean =
            model.GetAerodynamicEffects(AircraftIcingState.Clean);
        IcingAerodynamicEffects light =
            model.GetAerodynamicEffects(new AircraftIcingState(0.25, 0.25));
        IcingAerodynamicEffects heavy =
            model.GetAerodynamicEffects(new AircraftIcingState(5.0, 5.0));

        Assert.Equal(IcingAerodynamicEffects.None, clean);
        Assert.True(light.Severity01 < heavy.Severity01);
        Assert.True(light.MaximumLiftCoefficientMultiplier
            > heavy.MaximumLiftCoefficientMultiplier);
        Assert.True(light.ParasiteDragMultiplier < heavy.ParasiteDragMultiplier);
        Assert.True(light.PropulsiveEfficiencyMultiplier
            > heavy.PropulsiveEfficiencyMultiplier);
        Assert.InRange(heavy.MaximumLiftCoefficientMultiplier, 0.70, 1.0);
        Assert.InRange(heavy.ParasiteDragMultiplier, 1.0, 2.0);
        Assert.InRange(heavy.PropulsiveEfficiencyMultiplier, 0.65, 1.0);
        Assert.InRange(heavy.ControlAuthorityMultiplier, 0.85, 1.0);
        Assert.InRange(heavy.SensorReliabilityMultiplier, 0.50, 1.0);
    }

    [Fact]
    public void ZeroExposurePreservesStateExactly() {
        var model = new AircraftIcingModel();
        var initial = new AircraftIcingState(0.4, 0.6);

        AircraftIcingStepResult result =
            model.Step(initial, CloudConditions(exposureSeconds: 0.0));

        Assert.Equal(initial, result.State);
        Assert.Equal(0.0, result.AccretedMassPerAreaKgM2);
        Assert.Equal(0.0, result.MeltedMassPerAreaKgM2);
        Assert.Equal(0.0, result.ProtectionRemovedMassPerAreaKgM2);
        Assert.Equal(0.0, result.NaturallyShedMassPerAreaKgM2);
    }

    [Fact]
    public void InputsRejectNegativeNonFiniteAndOutOfRangeValues() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new AircraftIcingState(-0.1, 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new HydrometeorRates(
            snowMmWaterEquivalentPerHour: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => new AircraftIcingProtectionState(
            protectedSurfaceFraction01: 1.1,
            antiIceEffectiveness01: 0.0,
            deiceCommanded: false,
            deiceRemovalFraction01: 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new AircraftIcingConditions(
            ambientTemperatureC: -8.0,
            recoveryTemperatureC: -7.0,
            supercooledLiquidWaterKgPerM3: 0.0005,
            hydrometeors: HydrometeorRates.None,
            trueAirspeedMps: -1.0,
            exposureSeconds: 1.0,
            protection: AircraftIcingProtectionState.Off));
        Assert.Throws<ArgumentOutOfRangeException>(() => new AircraftIcingConditions(
            ambientTemperatureC: -8.0,
            recoveryTemperatureC: -7.0,
            supercooledLiquidWaterKgPerM3: 0.0005,
            hydrometeors: HydrometeorRates.None,
            trueAirspeedMps: 50.0,
            exposureSeconds: 1.0,
            protection: AircraftIcingProtectionState.Off,
            snowBondingFraction01: 1.1));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new AircraftIcingModel(new AircraftIcingCalibration {
                MaximumNaturalSheddingFractionPerStep01 = 1.1
            }));
    }
}
