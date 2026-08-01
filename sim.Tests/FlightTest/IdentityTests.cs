using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;
using GunsOnly.Sim.FlightTest.Programs;

namespace GunsOnly.Sim.Tests.FlightTest;

public class IdentityTests {
    [Fact]
    public void RapierParamsMatchTeachingIdentityWithinTolerance() {
        AirframeIdentity claim = InterceptorTbccV1.RapierAspirationalIdentity;
        AirframeIdentity measured = IdentityMeasurement.FromParams(
            FlightModel.RapierPublicDataSurrogate, inferred: false);

        Assert.InRange(measured.GrossMassKg,
            claim.GrossMassKg * 0.98, claim.GrossMassKg * 1.02);
        Assert.InRange(measured.AugmentedThrustToWeight,
            claim.AugmentedThrustToWeight * 0.95, claim.AugmentedThrustToWeight * 1.05);
        Assert.True(measured.AugmentedThrustToWeight
            <= InterceptorTbccV1.FamilyAugmentedTwCap + 1e-9);
    }

    [Fact]
    public void RapierV2ShapeFirstArtifactPinsReviewedPhysicalIdentity() {
        AircraftParams runtime = FlightModel.RapierPublicDataSurrogate;

        Assert.Equal("rapier.shape-first-engineering.v2", RapierV2Design.Id);
        Assert.Equal("2.0.0", RapierV2Design.Revision);
        Assert.Equal(13.0, RapierV2Design.LengthM, 6);
        Assert.Equal(7.35, RapierV2Design.SpanM, 6);
        Assert.Equal(2.228801, RapierV2Design.HeightM, 6);
        Assert.Equal(24.316845, RapierV2Design.ReferenceAreaM2, 6);
        Assert.Equal(8_068.259074, RapierV2Design.EmptyMassKg, 6);
        Assert.Equal(3_755.447606, RapierV2Design.FuelCapacityKg, 6);
        Assert.Equal(11_823.706680, RapierV2Design.GrossMassKg, 6);

        // FlightModel names inertias by P/Q/R semantic axis; the artifact loader performs the
        // explicit mapping from the canonical +z-aft physical body frame.
        Assert.Equal(7_855.515175, RapierV2Design.RollInertiaKgM2, 6);
        Assert.Equal(94_669.263526, RapierV2Design.PitchInertiaKgM2, 6);
        Assert.Equal(100_219.891522, RapierV2Design.YawInertiaKgM2, 6);
        Assert.Equal(RapierV2Design.RollInertiaKgM2, runtime.IxxKgM2, 6);
        Assert.Equal(RapierV2Design.PitchInertiaKgM2, runtime.IyyKgM2, 6);
        Assert.Equal(RapierV2Design.YawInertiaKgM2, runtime.IzzKgM2, 6);

        Assert.Equal(RapierV2Design.ReferenceAreaM2, runtime.WingAreaM2, 6);
        Assert.Equal(RapierV2Design.SpanM, runtime.WingSpanM, 6);
        Assert.Equal(RapierV2Design.EmptyMassKg, runtime.FuelFreeMassKg, 6);
        Assert.Equal(RapierV2Design.GrossMassKg, runtime.MassKg, 6);
        Assert.Equal(0, FlightModel.RapierDesignGunDroneCount);
        Assert.Equal(0.0, FlightModel.RapierDesignStowedGunDroneMassKg, 9);
    }

    [Fact]
    public void RapierV2PinsDashThermalAndFixedSiteRequirements() {
        AircraftParams runtime = FlightModel.RapierPublicDataSurrogate;

        Assert.Equal(4.2, RapierV2Design.DesignMach, 6);
        Assert.True(RapierV2Design.MinimumDashMach >= 4.0);
        Assert.Equal(24_000.0, RapierV2Design.DesignAltitudeM, 6);
        Assert.Equal(55_000.0, RapierV2Design.MaximumDynamicPressurePa, 6);
        Assert.Equal(3_048.0, RapierV2Design.RunwayLengthM, 6);
        Assert.Equal(1_524.0, RapierV2Design.ArrestorStationM, 6);

        Assert.Equal("insulated-warm-panel", RapierV2Design.BindingThermalZoneId);
        Assert.Equal(623.15, RapierV2Design.BindingThermalLimitK, 6);
        Assert.Equal(1_473.15, RapierV2Design.CmcHotEdgeLimitK, 6);
        Assert.Equal(RapierV2Design.BindingThermalLimitK,
            runtime.SkinTemperatureLimitK, 6);
        Assert.Equal(RapierV2Design.BindingThermalReference,
            runtime.AerothermalLimitReference);
        Assert.Equal(RapierV2Design.BindingThermalRiseFraction,
            runtime.AerothermalAdiabaticRiseFraction, 6);
        Assert.True(RapierV2Design.CmcHotEdgeLimitK
            > RapierV2Design.BindingThermalLimitK + 800.0,
            "local CMC capability must not be misreported as the whole-aircraft thermal limit");
    }

    [Fact]
    public void EvaluateFailsWhenIdentityDriftsFromParams() {
        AirframeIdentity claim = InterceptorTbccV1.RapierAspirationalIdentity;
        AirframeIdentity drifted = InterceptorTbccV1.RapierAspirationalIdentity with {
            AugmentedThrustToWeight = claim.AugmentedThrustToWeight * 1.25
        };
        var subject = new AirframeUnderTest(
            "rapier",
            FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: drifted);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.False(report.Passed);
        Assert.Contains(report.Findings, f => f.GateId == "identity-tw-augmented" && f.Blocking);
    }
}
