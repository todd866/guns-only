using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public sealed class AirframeSystemsTests {
    const double Dt = 1.0 / 120.0;

    static void StepFor(AirframeSystems systems, double seconds,
        double rpm = 80.0, double ias = 150.0, bool weightOnWheels = false) {
        var input = new AirframeSystemsInput(rpm, ias, weightOnWheels);
        int ticks = (int)Math.Ceiling(seconds / Dt);
        for (int i = 0; i < ticks; i++) systems.Step(Dt, input);
    }

    [Fact]
    public void NormalGearHasCommandActualTransitAndThreeLocks() {
        var systems = new AirframeSystems();
        systems.CommandGear(LandingGearHandle.Down);

        StepFor(systems, 4.0);
        Assert.Equal(LandingGearHandle.Down, systems.GearHandle);
        Assert.InRange(systems.NoseGearPosition, 0.05, 0.75);
        Assert.True(systems.AnyGearUnsafe);
        Assert.Equal(LandingGearIndication.Striped, systems.NoseGearIndication);
        Assert.True(systems.GearUnsafeLight);

        StepFor(systems, 7.5);
        Assert.True(systems.AllGearDownAndLocked);
        Assert.Equal(LandingGearIndication.DownLocked, systems.NoseGearIndication);
        Assert.Equal(LandingGearIndication.DownLocked, systems.LeftMainGearIndication);
        Assert.Equal(LandingGearIndication.DownLocked, systems.RightMainGearIndication);
    }

    [Fact]
    public void NormalPoweredF86PublishesNominalUtilityHydraulicPressure() {
        var systems = new AirframeSystems(
            profile: AirframeSystemsProfile.F86FResearchBasis);

        Assert.True(systems.ElectricalSystemAvailable);
        Assert.True(systems.UtilityHydraulicSystemAvailable);
        Assert.Equal(3000.0, systems.Profile.UtilityHydraulicNominalPsi);

        StepFor(systems, 4.0, rpm: 80.0);

        Assert.True(systems.PrimaryBusPowered);
        Assert.InRange(systems.UtilityHydraulicPressurePsi, 2999.0, 3000.0);
    }

    [Fact]
    public void GroundSafetySwitchBlocksLegsButHandleUpOpensDoors() {
        var systems = new AirframeSystems(initialGear: LandingGearHandle.Down);
        systems.CommandGear(LandingGearHandle.Up);

        StepFor(systems, 3.0, weightOnWheels: true);

        Assert.True(systems.GroundRetractionInterlockActive);
        Assert.True(systems.AllGearDownAndLocked);
        Assert.True(systems.GearDoorPosition > 0.9);
        Assert.True(systems.GearUnsafeLight);
    }

    [Fact]
    public void EmergencyExtensionRequiresLowAirspeedAndWorksWithoutBusOrUtilityPressure() {
        var systems = new AirframeSystems();
        systems.SetFailure(AirframeSystemFailure.PrimaryBus);
        systems.SetFailure(AirframeSystemFailure.UtilityHydraulicPump);
        systems.CommandGear(LandingGearHandle.Down);
        systems.SetEmergencyGearRelease(true);

        StepFor(systems, 3.0, rpm: 0.0, ias: 190.0);
        Assert.True(systems.EmergencyExtensionAirloadBlocked);
        Assert.True(systems.AllGearUpAndLocked);

        StepFor(systems, 13.0, rpm: 0.0, ias: 170.0);
        Assert.True(systems.AllGearDownAndLocked);
        Assert.False(systems.EmergencyAccumulatorAvailable);
        Assert.True(systems.EmergencyNoseGearLatched);
        // The indicators depend on the failed primary bus even though the mechanical legs are safe.
        Assert.Equal(LandingGearIndication.Striped, systems.NoseGearIndication);
    }

    [Fact]
    public void EmergencyLoweredNoseGearCannotRetractUntilGroundReset() {
        var systems = new AirframeSystems();
        systems.CommandGear(LandingGearHandle.Down);
        systems.SetEmergencyGearRelease(true);
        StepFor(systems, 13.0, ias: 160.0);
        systems.SetEmergencyGearRelease(false);
        systems.CommandGear(LandingGearHandle.Up);

        StepFor(systems, 12.0, ias: 160.0);
        Assert.True(systems.NoseGearPosition > 0.99);
        Assert.True(systems.LeftMainGearPosition < 0.01);
        Assert.False(systems.ResetEmergencyGearExtensionOnGround());

        StepFor(systems, 0.1, ias: 0.0, weightOnWheels: true);
        Assert.True(systems.ResetEmergencyGearExtensionOnGround());
        Assert.False(systems.EmergencyNoseGearLatched);
    }

    [Fact]
    public void GearHornCanBeCutOutAndPowerAdvanceResetsIt() {
        var systems = new AirframeSystems();

        StepFor(systems, 1.0, rpm: 65.0);
        Assert.True(systems.GearWarningHorn);
        systems.SilenceGearWarningHorn();
        StepFor(systems, 0.1, rpm: 65.0);
        Assert.False(systems.GearWarningHorn);

        StepFor(systems, 0.1, rpm: 80.0);
        StepFor(systems, 0.1, rpm: 65.0);
        Assert.True(systems.GearWarningHorn);
    }

    [Fact]
    public void RapierRamOnlyKeepsUtilityHydraulicsAndDoesNotCallUpLockedGearUnsafe() {
        var systems = new AirframeSystems(AirframeSystemsProfile.RapierSurrogate,
            initialUtilityHydraulicPressureFraction: 1.0);

        StepFor(systems, 2.0, rpm: 0.0, ias: 550.0);

        Assert.True(systems.AllGearUpAndLocked);
        Assert.True(systems.PrimaryBusPowered);
        Assert.InRange(systems.UtilityHydraulicPressurePsi, 3990.0, 4000.0);
        Assert.False(systems.GearUnsafeLight);
        Assert.False(systems.GearWarningHorn);
    }

    [Fact]
    public void RapierGearWarningFollowsRecoveryConfigurationInsteadOfTurbineRpm() {
        var systems = new AirframeSystems(AirframeSystemsProfile.RapierSurrogate,
            initialUtilityHydraulicPressureFraction: 1.0);

        var recovery = new AirframeSystemsInput(
            EngineRpmPercent: 0.0,
            IndicatedAirspeedKnots: 180.0,
            WeightOnWheels: false,
            LandingConfigurationExpected: true);
        systems.Step(Dt, recovery);

        Assert.True(systems.AllGearUpAndLocked);
        Assert.True(systems.GearWarningHorn);
        Assert.False(systems.GearUnsafeLight);

        systems.CommandGear(LandingGearHandle.Down);
        for (int i = 0; i < (int)Math.Ceiling(8.0 / Dt); i++) systems.Step(Dt, recovery);
        Assert.True(systems.AllGearDownAndLocked);
        Assert.False(systems.GearWarningHorn);
        Assert.False(systems.GearUnsafeLight);
    }

    [Fact]
    public void OneSurvivingFlapMotorDrivesBothThroughInterconnectAtReducedRate() {
        var systems = new AirframeSystems();
        systems.SetFailure(AirframeSystemFailure.RightFlapMotor);
        systems.SetFlapLever(WingFlapLever.Down);

        StepFor(systems, 8.0);

        Assert.Equal(systems.LeftFlapDegrees, systems.RightFlapDegrees, 9);
        Assert.InRange(systems.LeftFlapDegrees, 18.5, 19.5);
        Assert.False(systems.FlapSplit);
    }

    [Fact]
    public void BrokenInterconnectAllowsSplitFlapAndExposesLateralAeroState() {
        var systems = new AirframeSystems();
        systems.SetFailure(AirframeSystemFailure.FlapMechanicalInterconnect);
        systems.SetFailure(AirframeSystemFailure.RightFlapMotor);
        systems.SetFlapLever(WingFlapLever.Down);

        StepFor(systems, 8.5);

        Assert.InRange(systems.LeftFlapDegrees, 37.9, 38.0);
        Assert.Equal(0.0, systems.RightFlapDegrees, 9);
        Assert.True(systems.FlapSplit);
        Assert.True(systems.AerodynamicState.LateralLiftCoefficientDifference > 0.25);
        Assert.True(systems.AerodynamicState.DragCoefficientIncrement > 0.0);
    }

    [Fact]
    public void RapierLandingDroopConsumesElevonTravelAndAddsNoseDownTrim() {
        var systems = new AirframeSystems(AirframeSystemsProfile.RapierSurrogate);
        systems.SetFlapLever(WingFlapLever.Down);

        StepFor(systems, 4.2);

        AirframeAerodynamicState configuration = systems.AerodynamicState;
        Assert.InRange(systems.LeftFlapDegrees, 29.9, 30.0);
        Assert.Equal(systems.LeftFlapDegrees, systems.RightFlapDegrees, 9);
        Assert.InRange(configuration.LiftCoefficientIncrement, 0.259, 0.261);
        Assert.InRange(configuration.PitchMomentCoefficientIncrement, -0.056, -0.054);
        Assert.InRange(configuration.RollControlAuthorityFraction, 0.549, 0.551);
        Assert.InRange(configuration.PitchControlAuthorityFraction, 0.679, 0.681);
        Assert.Equal(1.0, configuration.YawControlAuthorityFraction, 9);
    }

    [Fact]
    public void RapierIndependentElevonActuatorFailureCreatesSplitWithoutInventedCrossShaft() {
        var systems = new AirframeSystems(AirframeSystemsProfile.RapierSurrogate);
        systems.SetFailure(AirframeSystemFailure.RightFlapMotor);
        systems.SetFlapLever(WingFlapLever.Down);

        StepFor(systems, 4.2);

        Assert.InRange(systems.LeftFlapDegrees, 29.9, 30.0);
        Assert.Equal(0.0, systems.RightFlapDegrees, 9);
        Assert.True(systems.FlapSplit);
        Assert.True(systems.AerodynamicState.LateralLiftCoefficientDifference > 0.25);
    }

    [Fact]
    public void LimitExposureUsesIndicatedAirspeedAndActualConfiguration() {
        var systems = new AirframeSystems(initialGear: LandingGearHandle.Down,
            initialFlapDegrees: 38.0);

        StepFor(systems, 2.0, ias: 200.0);

        Assert.True(systems.GearLimitExceeded);
        Assert.True(systems.FlapLimitExceeded);
        Assert.InRange(systems.GearOverspeedExposureSeconds, 1.99, 2.02);
        Assert.InRange(systems.FlapOverspeedExposureSeconds, 1.99, 2.02);
    }

    [Fact]
    public void ModernConventionalSurrogateIsGearOnlyAndDoesNotInheritF86Procedures() {
        var systems = new AirframeSystems(
            profile: AirframeSystemsProfile.ModernConventionalGearSurrogate);

        Assert.Equal("modern-conventional-gear-public-data-surrogate-v1",
            systems.Profile.Id);
        Assert.False(systems.PilotOperatedFlapsAvailable);
        Assert.False(systems.ThrottleTriggeredGearWarningAvailable);
        Assert.False(systems.EmergencyGearExtensionAvailable);
        Assert.False(systems.EmergencyAccumulatorAvailable);
        Assert.False(systems.UtilityHydraulicSystemAvailable);
        Assert.False(systems.ElectricalSystemAvailable);
        Assert.Equal(0.0, systems.Profile.UtilityHydraulicNominalPsi);

        systems.SetFlapLever(WingFlapLever.Down);
        systems.SetEmergencyGearRelease(true);
        StepFor(systems, 1.0, rpm: 20.0, ias: 140.0);

        Assert.Equal(WingFlapLever.Hold, systems.FlapLever);
        Assert.Equal(0.0, systems.LeftFlapDegrees, 12);
        Assert.Equal(0.0, systems.RightFlapDegrees, 12);
        Assert.Equal(0.0, systems.EffectiveFlapFraction, 12);
        Assert.False(systems.EmergencyGearReleaseHeld);
        Assert.False(systems.GearWarningHorn);
        Assert.Equal(0.0, systems.UtilityHydraulicPressurePsi, 12);
        Assert.Equal(AirframeAerodynamicState.Clean, systems.AerodynamicState);

        systems.CommandGear(LandingGearHandle.Down);
        StepFor(systems, 7.0, rpm: 80.0, ias: 200.0);

        Assert.True(systems.AllGearDownAndLocked);
        Assert.True(systems.AerodynamicState.DragCoefficientIncrement > 0.0);
        Assert.Equal(0.0, systems.AerodynamicState.LiftCoefficientIncrement, 12);
        Assert.False(systems.GearLimitExceeded);
        Assert.False(systems.FlapLimitExceeded);
    }
}
