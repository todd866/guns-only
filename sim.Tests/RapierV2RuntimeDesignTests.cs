using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Proves that the flown reduced-order aircraft is bound to the canonical v2 shape-derived
/// engineering artifact, rather than merely displaying the same name.
/// </summary>
public sealed class RapierV2RuntimeDesignTests {
    static AircraftParams Rapier => FlightModel.RapierPublicDataSurrogate;

    [Fact]
    public void ShapeMassAndRecoverySiteComeFromTheCanonicalV2Artifact() {
        Assert.Equal("rapier.shape-first-engineering.v2", RapierV2Design.Id);
        Assert.Equal("2.0.0", RapierV2Design.Revision);
        Assert.Equal(64, RapierV2Design.CanonicalSha256.Length);

        Assert.Equal(13.0, RapierV2Design.LengthM, 6);
        Assert.Equal(7.35, RapierV2Design.SpanM, 6);
        Assert.Equal(2.228801, RapierV2Design.HeightM, 6);
        Assert.Equal(24.316845, RapierV2Design.ReferenceAreaM2, 6);
        Assert.Equal(2.221608, RapierV2Design.AspectRatio, 6);
        Assert.Equal(1.427791, RapierV2Design.InletCaptureAreaM2, 6);

        Assert.Equal(8_068.259074, RapierV2Design.EmptyMassKg, 6);
        Assert.Equal(3_755.447606, RapierV2Design.FuelCapacityKg, 6);
        Assert.Equal(11_823.706680, RapierV2Design.GrossMassKg, 6);
        Assert.Equal(RapierV2Design.GrossMassKg, Rapier.MassKg, 9);
        Assert.Equal(RapierV2Design.EmptyMassKg, Rapier.FuelFreeMassKg, 9);
        Assert.Equal(RapierV2Design.ReferenceAreaM2, Rapier.WingAreaM2, 9);
        Assert.Equal(RapierV2Design.SpanM, Rapier.WingSpanM, 9);
        Assert.Equal(0, FlightModel.RapierDesignGunDroneCount);

        Assert.Equal(84_000.0, RapierV2Design.SeaLevelStaticDryThrustN, 9);
        Assert.Equal(1.35, RapierV2Design.MaximumAugmentedThrustRatio, 9);
        Assert.Equal(113_400.0,
            RapierV2Design.SeaLevelStaticDryThrustN
                * RapierV2Design.MaximumAugmentedThrustRatio,
            9);
        Assert.Equal(10.08, RapierV2Design.IdleFuelFlowLbPerMinute, 9);
        Assert.Equal(144.48, RapierV2Design.MilitaryFuelFlowLbPerMinute, 9);
        Assert.Equal(453.6, RapierV2Design.AugmentedFuelFlowLbPerMinute, 9);
        Assert.Equal(RapierV2Design.SeaLevelStaticDryThrustN, Rapier.ThrustMaxN, 9);
        Assert.Equal(RapierV2Design.IdleFuelFlowLbPerMinute,
            Rapier.GenericIdleFuelFlowLbPerMinute, 9);
        Assert.Equal(RapierV2Design.MilitaryFuelFlowLbPerMinute,
            Rapier.GenericMilitaryFuelFlowLbPerMinute, 9);
        Assert.Equal(RapierV2Design.AugmentedFuelFlowLbPerMinute,
            Rapier.GenericAfterburnerFuelFlowLbPerMinute, 9);

        Assert.Equal(3_048.0, RapierV2Design.RunwayLengthM, 6);
        Assert.Equal(1_524.0, RapierV2Design.ArrestorStationM, 6);
    }

    [Fact]
    public void RuntimeExposesTheReviewedCoannularPropulsionPackage() {
        Assert.Equal("single-inlet-coannular-variable-cycle-shared-nozzle",
            RapierV2Design.FlowpathArchitectureKind);
        Assert.Equal(1.22, RapierV2Design.TurbineCoreDiameterM, 6);
        Assert.Equal(4.88, RapierV2Design.TurbineCoreLengthM, 6);
        Assert.Equal(1.34, RapierV2Design.PropulsionEnvelopeDiameterM, 6);
        Assert.Equal(5.48, RapierV2Design.PropulsionEnvelopeLengthM, 6);
        Assert.Equal(1_893.416341, RapierV2Design.PropulsionPackageMassKg, 6);
        Assert.Equal(0.03, RapierV2Design.PropulsionStructuralRadialClearanceM, 6);
        Assert.Equal(0.03, RapierV2Design.PropulsionThermalRadialClearanceM, 6);
        Assert.Equal(0.073, RapierV2Design.PropulsionTunnelMinimumRadialClearanceM, 6);
        Assert.Equal(0.324052, RapierV2Design.PropulsionClearCoannularAreaM2, 6);
        Assert.Equal(0.305092, RapierV2Design.PropulsionRequiredChokedAreaM2, 6);
        Assert.Equal(0.3, RapierV2Design.PropulsionPressureRecoveryFloorFraction, 6);
        Assert.Equal(0.282447, RapierV2Design.PropulsionMinimumRecoveryRequiredFraction, 6);
        Assert.Equal(0.636173, RapierV2Design.PropulsionNozzleAreaM2, 6);
        Assert.Equal(0.15, RapierV2Design.PropulsionFireBulkheadGapM, 6);
        Assert.True(RapierV2Design.PropulsionPackageCollisionPass);
        Assert.True(RapierV2Design.PropulsionFlowAreaPass);
    }

    [Fact]
    public void RuntimeInertiasUseTheShapeDerivedPhysicalAxisMapping() {
        // Runtime P/Q/R are roll/pitch/yaw; the canonical source frame is x-starboard,
        // y-up, z-aft, so this intentionally maps physical zz/xx/yy.
        Assert.Equal(7_855.515175, RapierV2Design.RollInertiaKgM2, 6);
        Assert.Equal(94_669.263526, RapierV2Design.PitchInertiaKgM2, 6);
        Assert.Equal(100_219.891522, RapierV2Design.YawInertiaKgM2, 6);
        Assert.Equal(RapierV2Design.RollInertiaKgM2, Rapier.IxxKgM2, 9);
        Assert.Equal(RapierV2Design.PitchInertiaKgM2, Rapier.IyyKgM2, 9);
        Assert.Equal(RapierV2Design.YawInertiaKgM2, Rapier.IzzKgM2, 9);
    }

    [Fact]
    public void CanonicalInletAndRuntimePolarCloseTheMach42DesignPoint() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(
            RapierV2Design.DesignAltitudeM);
        double mach = RapierV2Design.DesignMach;
        double speed = mach * air.SpeedOfSoundMps;
        double q = 0.5 * air.DensityKgM3 * speed * speed;

        Assert.Equal(4.2, mach, 9);
        Assert.Equal(24_000.0, RapierV2Design.DesignAltitudeM, 9);
        Assert.Equal(RapierV2Design.DesignPointDynamicPressurePa, q, precision: 3);

        EngineOperatingPoint fullLever = TurboRamjetPerformanceMap.Evaluate(
            Rapier.MaxThrustFraction,
            Rapier.ThrustMaxN,
            mach,
            air.TemperatureK,
            air.DensityKgM3,
            Rapier.GenericIdleFuelFlowLbPerMinute,
            Rapier.GenericMilitaryFuelFlowLbPerMinute,
            Rapier.GenericAfterburnerFuelFlowLbPerMinute,
            Rapier.MaxThrustFraction);
        double trimCl = Rapier.MassKg * FlightModel.G0 / (q * Rapier.WingAreaM2);
        double trimAlpha = trimCl / FlightModel.EffectiveClAlpha(Rapier, mach);
        double inletOffDesignAngle = RapierAerodynamics.InletFlowAngleRad(trimAlpha, 0.0);
        double inletRecovery = RapierAerodynamics.InletFlowRecovery(mach, trimAlpha, 0.0);
        double availableThrust = fullLever.NetThrustN * inletRecovery;
        // The artifact is rounded to six decimals; the runtime interpolates from those rounded
        // inputs, so a few millinewtons are serialization noise rather than an atmosphere mismatch.
        Assert.InRange(fullLever.NetThrustN,
            RapierV2Design.DesignPointRawRamThrustN - 0.02,
            RapierV2Design.DesignPointRawRamThrustN + 0.02);
        Assert.InRange(availableThrust,
            RapierV2Design.DesignPointNetThrustN - 0.02,
            RapierV2Design.DesignPointNetThrustN + 0.02);
        Assert.Equal(0.0, fullLever.TurbineThrustN, precision: 9);
        Assert.Equal(fullLever.NetThrustN, fullLever.RamjetThrustN, precision: 9);
        Assert.Equal(7.5 * System.Math.PI / 180.0,
            RapierV2Design.InletDesignFlowIncidenceRad, 12);
        Assert.Equal(RapierV2Design.DesignPointTrimAlphaRad, trimAlpha, 5);
        Assert.Equal(RapierV2Design.DesignPointInletOffDesignAngleRad,
            inletOffDesignAngle, 5);
        Assert.Equal(RapierV2Design.DesignPointInletRecovery, inletRecovery, 5);
        Assert.False(RapierAerodynamics.NextInletUnstartState(
            mach, trimAlpha, 0.0, previouslyUnstarted: false));

        double runtimeDrag = q * Rapier.WingAreaM2
            * FlightModel.ProfileDragCoefficient(trimAlpha, mach, Rapier);
        Assert.InRange(runtimeDrag,
            RapierV2Design.DesignPointDragN * 0.995,
            RapierV2Design.DesignPointDragN * 1.005);
        Assert.True(availableThrust > runtimeDrag,
            "M4.2 must have positive, finite excess thrust without an extra gameplay augmentor");
        Assert.Equal(1.35, Rapier.MaxThrustFraction, 9);
        Assert.Equal(1.0, RapierV2Design.RamStreamAugmentationRatio, 9);
        Assert.Equal(57_515.494188, RapierV2Design.DesignPointRawRamThrustN, 6);
        Assert.Equal(57_511.139568, RapierV2Design.DesignPointNetThrustN, 6);
    }

    [Fact]
    public void OrdinaryWarmPanelBindsTheThermalEnvelopeWhileCmcProtectsHotEdges() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(
            RapierV2Design.DesignAltitudeM);
        double recovery = AirData.AdiabaticWallTemperatureK(
            RapierV2Design.DesignMach, air.TemperatureK);
        double effective = AirData.EffectiveAerothermalZoneTemperatureK(
            air.TemperatureK, recovery, RapierV2Design.BindingThermalRiseFraction);
        double margin = RapierV2Design.BindingThermalLimitK - effective;

        Assert.Equal("insulated-warm-panel", RapierV2Design.BindingThermalZoneId);
        Assert.Equal(AerothermalLimitReferenceKind.RecoveryTemperature,
            RapierV2Design.BindingThermalReference);
        Assert.Equal(623.15, Rapier.SkinTemperatureLimitK, 6);
        Assert.Equal(1_473.15, RapierV2Design.CmcHotEdgeLimitK, 6);
        Assert.Equal(604.024520, effective, precision: 3);
        Assert.Equal(RapierV2Design.DesignPointThermalMarginK, margin, precision: 3);

        double limitMach = AirData.MachLimitForEffectiveZoneTemperature(
            Rapier.SkinTemperatureLimitK,
            air.TemperatureK,
            Rapier.AerothermalLimitReference,
            Rapier.AerothermalAdiabaticRiseFraction);
        Assert.InRange(limitMach, 4.30, 4.31);
        Assert.Equal(4.30, RapierV2Design.MaximumScreenedMach, 2);
        Assert.Equal(55_000.0, RapierV2Design.MaximumDynamicPressurePa, 6);
    }
}
