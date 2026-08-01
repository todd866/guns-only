using GunsOnly.Sim.Korea;

namespace GunsOnly.Sim.Tests.Korea;

public sealed class PartialAirframeDamageTests {
    [Fact]
    public void CompositionAddsCoefficientsMultipliesAuthorityAndKeepsSystemsMetadata() {
        var systems = new AirframeAerodynamicState(
            LiftCoefficientIncrement: 0.40,
            DragCoefficientIncrement: 0.08,
            PitchMomentCoefficientIncrement: -0.01,
            LateralLiftCoefficientDifference: 0.03,
            PersistentLateralLiftCoefficientDifference: -0.02,
            LandingGearFraction: 0.73,
            LiftLimitCoefficientIncrement: 0.12,
            RollControlAuthorityFraction: 0.80,
            PitchControlAuthorityFraction: 0.75,
            YawControlAuthorityFraction: 0.90);
        PartialAirframeDamageProfile profile =
            PantherRightOuterWingLossFamily.ForExtent(
                PantherRightOuterWingLossExtent.SevenFeet);

        AirframeAerodynamicState effective = PartialAirframeDamageComposer.Compose(
            systems,
            PartialAirframeDamageState.Apply(profile));

        Assert.Equal(0.40 + profile.LiftCoefficientIncrement,
            effective.LiftCoefficientIncrement, 12);
        Assert.Equal(0.08 + profile.DragCoefficientIncrement,
            effective.DragCoefficientIncrement, 12);
        Assert.Equal(-0.01 + profile.PitchMomentCoefficientIncrement,
            effective.PitchMomentCoefficientIncrement, 12);
        Assert.Equal(0.03 + profile.LateralLiftCoefficientDifference,
            effective.LateralLiftCoefficientDifference, 12);
        Assert.Equal(-0.02 + profile.PersistentLateralLiftCoefficientDifference,
            effective.PersistentLateralLiftCoefficientDifference, 12);
        Assert.Equal(0.12 + profile.LiftLimitCoefficientIncrement,
            effective.LiftLimitCoefficientIncrement, 12);
        Assert.Equal(0.80 * profile.RollControlAuthorityFraction,
            effective.RollControlAuthorityFraction, 12);
        Assert.Equal(0.75 * profile.PitchControlAuthorityFraction,
            effective.PitchControlAuthorityFraction, 12);
        Assert.Equal(0.90 * profile.YawControlAuthorityFraction,
            effective.YawControlAuthorityFraction, 12);
        Assert.Equal(0.73, effective.LandingGearFraction, 12);
    }

    [Fact]
    public void IntactStateIsIdentityAndDamageNeverClaimsTerminalAuthority() {
        AirframeAerodynamicState systems = AirframeAerodynamicState.Clean with {
            LandingGearFraction = 0.4,
            DragCoefficientIncrement = 0.1
        };

        AirframeAerodynamicState composed = PartialAirframeDamageComposer.Compose(
            systems, PartialAirframeDamageState.Intact);

        Assert.Equal(systems, composed);
        Assert.False(PartialAirframeDamageState.Intact.IsTerminal);
        Assert.False(PartialAirframeDamageState.Intact.IsApplied);
        Assert.False(PartialAirframeDamageState.Apply(
            PantherRightOuterWingLossFamily.ForExtent(
                PantherRightOuterWingLossExtent.SevenFeet)).IsTerminal);
    }

    [Fact]
    public void SixToEightFootFamilyIsBoundedMonotonicAndExplicitlyReconstructed() {
        PartialAirframeDamageProfile six =
            PantherRightOuterWingLossFamily.ForExtent(
                PantherRightOuterWingLossExtent.SixFeet);
        PartialAirframeDamageProfile seven =
            PantherRightOuterWingLossFamily.ForExtent(
                PantherRightOuterWingLossExtent.SevenFeet);
        PartialAirframeDamageProfile eight =
            PantherRightOuterWingLossFamily.ForExtent(
                PantherRightOuterWingLossExtent.EightFeet);

        Assert.Equal(6.0 * 0.3048, six.RemovedSpanM, 12);
        Assert.Equal(8.0 * 0.3048, eight.RemovedSpanM, 12);
        Assert.True(six.RemovedAreaM2 < seven.RemovedAreaM2);
        Assert.True(seven.RemovedAreaM2 < eight.RemovedAreaM2);
        Assert.True(six.DragCoefficientIncrement < seven.DragCoefficientIncrement);
        Assert.True(seven.DragCoefficientIncrement < eight.DragCoefficientIncrement);
        Assert.True(six.RollControlAuthorityFraction
            > seven.RollControlAuthorityFraction);
        Assert.True(seven.RollControlAuthorityFraction
            > eight.RollControlAuthorityFraction);
        Assert.All(new[] { six, seven, eight }, profile => {
            Assert.Equal(AirframeDamageEpistemic.Reconstruction, profile.Epistemic);
            Assert.Equal(0.0, profile.ModeledRemovedMassKg);
            Assert.Equal(
                TipTankFuelTreatment.RetainedUntilFuelSystemIntegration,
                profile.TipTankFuelTreatment);
        });
    }

    [Fact]
    public void AerodynamicAndVisibleDetachTruthShareOneStableProfileId() {
        PartialAirframeDamageProfile profile =
            PantherRightOuterWingLossFamily.ForExtent(
                PantherRightOuterWingLossExtent.SevenFeet);
        PartialAirframeDamageState state = PartialAirframeDamageState.Apply(profile);

        Assert.Equal(profile.Id, state.ProfileId);
        Assert.Equal(profile.Id, state.VisibleDamage.ProfileId);
        Assert.Equal(profile.Id, profile.VisibleDamage.ProfileId);
        Assert.True(state.VisibleDamage.RightOuterWingAbsent);
        Assert.True(state.VisibleDamage.RightTipTankAbsent);
        Assert.Equal(PantherAileronVisibleState.Partial,
            state.VisibleDamage.RightAileron);
    }
}
