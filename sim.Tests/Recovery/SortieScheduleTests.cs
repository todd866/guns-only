using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Tests;

public sealed class SortieScheduleTests {
    [Fact]
    public void RecoveryDragComesFromEachAirframesPhysicalLandingConfiguration() {
        double f22 = SortieSchedule.RecoveryDragToWeight(
            FlightModel.F22APublicDataSurrogate.MassKg,
            FlightModel.F22APublicDataSurrogate,
            AirframeSystemsProfile.ModernConventionalGearSurrogate);
        double rapier = SortieSchedule.RecoveryDragToWeight(
            FlightModel.RapierPublicDataSurrogate.MassKg,
            FlightModel.RapierPublicDataSurrogate,
            AirframeSystemsProfile.RapierSurrogate);

        Assert.InRange(f22, 0.085, 0.115);
        Assert.InRange(rapier, 0.240, 0.300);
        Assert.True(rapier > f22 + 0.10,
            $"Rapier landing D/W {rapier:F3} should materially exceed F-22 {f22:F3}");
        Assert.NotEqual(0.12, f22, precision: 3);
        Assert.NotEqual(0.12, rapier, precision: 3);
        Assert.True(AirframeSystemsProfile.ModernConventionalGearSurrogate
            .RecoveryProfileFitted);
        Assert.True(AirframeSystemsProfile.RapierSurrogate.RecoveryProfileFitted);
        Assert.False(AirframeSystemsProfile.F86FResearchBasis.RecoveryProfileFitted);
        Assert.Equal(SortieSchedule.LegacyUnfittedRecoveryDragToWeight,
            SortieSchedule.RecoveryDragToWeight(
                FlightModel.F9F2Panther.MassKg,
                FlightModel.F9F2Panther,
                AirframeSystemsProfile.F86FResearchBasis));
    }

    [Fact]
    public void CleanIngressPolarDoesNotPretendLandingGearDragIsAvailable() {
        AircraftParams air = FlightModel.F22APublicDataSurrogate;
        AirframeSystemsProfile systems =
            AirframeSystemsProfile.ModernConventionalGearSurrogate;
        double approachCalibratedMps = SortieSchedule.ApproachCalibratedAirspeedMps(
            air.MassKg, air, systems);
        const double entryAltitudeM = 1_200.0 * 0.3048;
        double entryTrueAirspeedMps = AirData.TrueAirspeedForCalibratedAirspeedMps(
            Math.Min(250.0 / AirData.MpsToKnots, approachCalibratedMps * 1.30),
            entryAltitudeM);

        double clean = SortieSchedule.CleanLevelDragToWeight(
            air.MassKg, air, entryTrueAirspeedMps, entryAltitudeM);
        double landing = SortieSchedule.RecoveryDragToWeight(
            air.MassKg, air, systems, entryAltitudeM);

        Assert.True(clean > 0.0);
        Assert.True(clean < landing,
            $"clean ingress D/W {clean:F3} must stay below landing D/W {landing:F3}");
    }

    [Fact]
    public void ApproachReferenceUsesTheSameFlapLiftAsTheForceModel() {
        AircraftParams rapier = FlightModel.RapierPublicDataSurrogate;
        AirframeSystemsProfile systems = AirframeSystemsProfile.RapierSurrogate;

        Assert.Equal(systems.FullFlapLiftCoefficientIncrement,
            rapier.ApproachFlapCLIncrement, precision: 10);
        Assert.Equal(systems.FullFlapLiftCoefficientIncrement,
            systems.FullLandingAerodynamicState.LiftCoefficientIncrement, precision: 10);
        Assert.Equal(systems.FullGearDragCoefficientIncrement
                + systems.FullFlapDragCoefficientIncrement,
            systems.FullLandingAerodynamicState.DragCoefficientIncrement, precision: 10);

    }

    [Fact]
    public void CalibratedApproachReferenceIsConvertedToLocalTrueAirspeed() {
        AircraftParams air = FlightModel.F22APublicDataSurrogate;
        AirframeSystemsProfile systems =
            AirframeSystemsProfile.ModernConventionalGearSurrogate;
        double kcasMps = SortieSchedule.ApproachCalibratedAirspeedMps(
            air.MassKg, air, systems);
        double tasMps = SortieSchedule.ApproachTrueAirspeedMps(
            air.MassKg, air, systems, altitudeM: 4_500.0);

        Assert.True(tasMps > kcasMps + 10.0);
        Assert.Equal(kcasMps,
            AirData.CalibratedAirspeedMps(tasMps, 4_500.0), precision: 8);
    }

    [Fact]
    public void FittedApproachSpeedsStayInsideFastJetLandingBands() {
        double f22Kias = SortieSchedule.ApproachCalibratedAirspeedMps(
            FlightModel.F22APublicDataSurrogate.MassKg,
            FlightModel.F22APublicDataSurrogate,
            AirframeSystemsProfile.ModernConventionalGearSurrogate) * AirData.MpsToKnots;
        double rapierKias = SortieSchedule.ApproachCalibratedAirspeedMps(
            FlightModel.RapierPublicDataSurrogate.MassKg,
            FlightModel.RapierPublicDataSurrogate,
            AirframeSystemsProfile.RapierSurrogate) * AirData.MpsToKnots;

        Assert.InRange(f22Kias, 130.0, 155.0);
        Assert.InRange(rapierKias, 155.0, 205.0);
    }

    [Fact]
    public void DecelerationTrackIsDerivedFromEnergyNotAUniversalTwoKilometres() {
        static SortieReference Reference(AircraftParams air, AirframeSystemsProfile systems) {
            double approach = SortieSchedule.ApproachTrueAirspeedMps(
                air.MassKg, air, systems, altitudeM: 100.0);
            return new SortieReference(
                approach,
                2.2 * approach,
                2.7 * approach,
                4_500.0,
                80.0,
                3.0 * Math.PI / 180.0,
                SortieSchedule.RecoveryDragToWeight(
                    air.MassKg, air, systems, altitudeM: 100.0),
                air.SpoolUpTau,
                AirData.TrueAirspeedForCalibratedAirspeedMps(
                    systems.GearAndFlapLimitKias / AirData.MpsToKnots,
                    altitudeM: 100.0),
                RecoveryProfileFitted: true);
        }

        double f22 = SortieSchedule.RecoveryDecelerationTrackM(Reference(
            FlightModel.F22APublicDataSurrogate,
            AirframeSystemsProfile.ModernConventionalGearSurrogate));
        double rapier = SortieSchedule.RecoveryDecelerationTrackM(Reference(
            FlightModel.RapierPublicDataSurrogate,
            AirframeSystemsProfile.RapierSurrogate));

        Assert.InRange(f22, 14_000.0, 20_000.0);
        Assert.InRange(rapier, 2_500.0, 5_000.0);
        Assert.True(f22 > rapier + 10_000.0);
    }
}
