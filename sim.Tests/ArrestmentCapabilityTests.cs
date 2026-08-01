using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Pins the fixed-strip recovery installation to the aircraft and approach it was sized for.
/// The gear is a ground-system capability; it must not acquire extra energy capacity from the
/// arriving aircraft at runtime.
/// </summary>
public sealed class ArrestmentCapabilityTests {
    const double RapierWireSpeedKtas = 168.0;
    const double MpsPerKnot = 1.0 / 1.94384;
    const double RecoveryReserveFuelLb = 1_200.0;
    const double KgPerLb = 0.45359237;

    [Fact]
    public void FixedStripAndArrestorAreTheAuthoredTenThousandFootMidpointSystem() {
        BeatSetup beat = Beats.BuiltIn(12);
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);

        Assert.Equal(Carrier.PlatformKind.FixedArrestingStrip, strip.Kind);
        Assert.Equal(RapierV2Design.RunwayLengthM, strip.DeckLengthM, precision: 9);
        Assert.Equal(3_048.0, strip.DeckLengthM, precision: 9);
        Assert.Equal(RapierV2Design.ArrestorStationM,
            strip.WireDatumAlongM + strip.DeckLengthM * 0.5, precision: 9);
        Assert.Equal(0.0, strip.WireAlongM(3), precision: 9);
    }

    [Fact]
    public void ProductionCardActuallySelectsTheRapierLandGearCurve() {
        var session = new SimulationSession(beatIndex: 12);

        Assert.Same(ArrestmentCapabilityProfile.ProvisionalRapierLandStrip,
            session.Arrestment.Capability);
        Assert.NotEqual(ArrestmentCapabilityProfile.ProvisionalKoreaJet.Id,
            session.Arrestment.Capability.Id);
    }

    [Fact]
    public void LandGearAbsorbsTheCanonicalReserveFuelWireEngagement() {
        ArrestmentCapabilityProfile gear =
            ArrestmentCapabilityProfile.ProvisionalRapierLandStrip;
        double landingMassKg = RapierV2Design.EmptyMassKg
            + RecoveryReserveFuelLb * KgPerLb;
        double wireSpeedMps = RapierWireSpeedKtas * MpsPerKnot;
        double engagementEnergyJ = 0.5 * landingMassKg * wireSpeedMps * wireSpeedMps;

        Assert.Equal(35_000_000.0, gear.RatedEnergyJ, precision: 6);
        Assert.True(gear.ForceCurveWorkJ >= gear.RatedEnergyJ,
            "the authored force curve must deliver the published rated energy");
        Assert.True(engagementEnergyJ < gear.EffectiveEnergyCapacityJ,
            $"reserve-fuel engagement is {engagementEnergyJ / 1e6:F2} MJ against "
            + $"{gear.EffectiveEnergyCapacityJ / 1e6:F2} MJ gear");
        Assert.True(gear.PeakForceN <= gear.MaximumLineLoadN);
    }

    [Fact]
    public void GearDoesNotPretendToAcceptAFullFuelMaximumSpeedArrival() {
        ArrestmentCapabilityProfile gear =
            ArrestmentCapabilityProfile.ProvisionalRapierLandStrip;
        double wireSpeedMps = RapierWireSpeedKtas * MpsPerKnot;
        double fullFuelEnergyJ = 0.5 * RapierV2Design.GrossMassKg
            * wireSpeedMps * wireSpeedMps;

        Assert.True(fullFuelEnergyJ > gear.EffectiveEnergyCapacityJ,
            "the fixed gear must retain an honest maximum-landing-mass constraint");
    }
}
