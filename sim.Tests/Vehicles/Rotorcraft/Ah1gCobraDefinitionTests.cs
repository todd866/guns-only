using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles.Rotorcraft;

public sealed class Ah1gCobraDefinitionTests
{
    [Fact]
    public void LateProductionVariantPinsTheSourceBackedGeometryAndLimits()
    {
        RotorcraftDefinition cobra = Ah1gCobraDefinition.LateProduction;

        Assert.Equal(Ah1gCobraDefinition.Version, cobra.DefinitionVersion);
        Assert.Contains("T53-L-13B", cobra.Variant);
        Assert.Contains("tractor tail rotor", cobra.Variant);
        Assert.Equal(2, cobra.MainRotor.BladeCount);
        Assert.Equal(6.706, cobra.MainRotor.RadiusM, 3);
        Assert.Equal(0.686, cobra.MainRotor.ChordM, 3);
        Assert.Equal(0.0651, cobra.MainRotor.Solidity, 4);
        Assert.Equal(1_878.0, cobra.MainRotor.FlapInertiaPerBladeKgM2);
        Assert.Equal(2.75, cobra.MainRotor.PreconeRad * 180.0 / Math.PI, 2);
        Assert.Equal(324.0, cobra.MainRotor.NominalRpm);
        Assert.Equal(294.0, cobra.MainRotor.MinimumContinuousRpm);
        Assert.Equal(339.0, cobra.MainRotor.MaximumAutorotationRpm);
        Assert.Equal(5.123, cobra.TailRotor.MainToTailGearRatio, 3);
        Assert.Equal(1.295, cobra.TailRotor.RadiusM, 3);
        Assert.Equal(0.214, cobra.TailRotor.ChordM, 3);
    }

    [Fact]
    public void ProductionMassAndDrivetrainDoNotUseNasaInstrumentedTestWeight()
    {
        RotorcraftDefinition cobra = Ah1gCobraDefinition.LateProduction;

        Assert.Equal(2_612.7, cobra.Airframe.EmptyMassKg, 1);
        Assert.Equal(4_309.1, cobra.Airframe.MaximumGrossMassKg, 1);
        Assert.Equal(820_270.0, cobra.Powerplant.TransmissionLimitW, 0);
        Assert.Equal(1_043_980.0, cobra.Powerplant.MilitaryRatedPowerW, 0);
        Assert.Equal(141.279, cobra.MainRotor.DiskAreaM2, 3);
        Assert.Equal(1_660.0,
            cobra.MainRotor.NominalRpm * cobra.TailRotor.MainToTailGearRatio,
            0);
        Assert.Equal(4_051.0, cobra.Airframe.InertiaReferenceMassKg, 0);
        Assert.Equal(3_948.0, cobra.Airframe.RollInertiaKgM2);
        Assert.Equal(18_038.0, cobra.Airframe.PitchInertiaKgM2);
        Assert.Equal(15_527.0, cobra.Airframe.YawInertiaKgM2);
        Assert.Equal(-0.155, cobra.Contact.MainRotorHubOffsetBodyM.Z, 3);
        Assert.Equal(2.073, cobra.Contact.MainRotorHubOffsetBodyM.Y, 3);
        Assert.Equal(-8.300, cobra.Contact.TailRotorHubOffsetBodyM.Z, 3);
        Assert.Equal(0.08, cobra.Handling.StabilityAugmentationCyclicLagSeconds, 2);
        Assert.Equal(0.05, cobra.Handling.StabilityAugmentationYawLagSeconds, 2);
        Assert.Equal(0.125, cobra.Handling.StabilityAugmentationAuthorityFraction, 3);
        Assert.Equal(0.12, cobra.Handling.DiskResponseTimeConstantSeconds, 2);
        Assert.Equal(3.7, cobra.Handling.NumericalMainRotorLoadFactorGuard, 1);
    }

    [Fact]
    public void DefinitionRejectsCrossedRotorLimits()
    {
        RotorcraftDefinition valid = Ah1gCobraDefinition.LateProduction;
        RotorcraftDefinition invalid = valid with
        {
            MainRotor = valid.MainRotor with
            {
                MinimumContinuousRpm = 330.0
            }
        };

        Assert.Throws<ArgumentException>(invalid.Validate);
    }

    [Fact]
    public void DefinitionRejectsNonFiniteEnvelopeValues()
    {
        RotorcraftDefinition valid = Ah1gCobraDefinition.LateProduction;
        RotorcraftDefinition invalid = valid with
        {
            Handling = valid.Handling with
            {
                RetreatingBladeStallFullAdvanceRatio = double.NaN
            }
        };

        Assert.Throws<ArgumentOutOfRangeException>(invalid.Validate);
    }
}
