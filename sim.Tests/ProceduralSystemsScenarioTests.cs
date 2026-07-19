using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Exercises the systems model through the same session-owned state and key-command seams used by
/// a future failure/RTB scenario. These intentionally complement the component-level state-machine
/// tests: a scenario must be able to inject a fault, observe its symptoms, and apply the procedure
/// without reaching around SimulationSession for a replacement systems instance.
/// </summary>
public sealed class ProceduralSystemsScenarioTests {
    static BeatSetup ProcedureBeat(double playerSpeedMps) {
        var player = new AircraftState(
            new Vec3D(0.0, 4000.0, 0.0),
            playerSpeedMps,
            0.0,
            0.0,
            0.0,
            FlightModel.Sabre.MassKg);
        var observationTarget = new AircraftState(
            new Vec3D(30000.0, 4000.0, 30000.0),
            120.0,
            0.0,
            0.0,
            0.0,
            FlightModel.Sabre.MassKg);

        return new BeatSetup(
            "Systems procedure test",
            player,
            observationTarget,
            new PurePursuitLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.75, 0.0)) },
            Combat: new CombatConfig(
                PlayerAmmo: 0,
                OpponentAmmo: 0,
                PlayerHitsToDefeat: 1,
                OpponentHitsToDefeat: 1));
    }

    static void StepFor(SimulationSession session, double seconds) {
        int ticks = (int)Math.Ceiling(seconds / SimulationSession.FixedDeltaSeconds);
        for (int i = 0; i < ticks; i++) session.StepFixed();
    }

    [Fact]
    public void FailedNormalGearRequiresSlowEmergencyExtensionAndLeavesUnpoweredIndications() {
        var session = new SimulationSession();
        session.StartBeat(() => ProcedureBeat(playerSpeedMps: 135.0));
        session.SetVariant(ValleyVariant.PhysicsOnly);
        AirframeSystems systems = session.PlayerSystems;
        systems.SetFailure(AirframeSystemFailure.PrimaryBus);
        systems.SetFailure(AirframeSystemFailure.UtilityHydraulicPump);
        session.Begin();

        // A normal DOWN selection changes the commanded state but cannot move any leg without
        // either the primary-bus selector circuit or utility hydraulic pressure.
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        StepFor(session, 2.0);

        Assert.Same(systems, session.PlayerSystems);
        Assert.Equal(LandingGearHandle.Down, systems.GearHandle);
        Assert.False(systems.PrimaryBusPowered);
        Assert.InRange(systems.UtilityHydraulicPressurePsi, 0.0, 1.0);
        Assert.True(systems.AllGearUpAndLocked);

        // Holding the mechanical emergency release at excessive IAS is an action with a visible
        // but ineffective result: air loads keep the doors and legs up.
        session.FeedKey(GKey.EmergencyGearRelease, true);
        StepFor(session, 1.0);

        Assert.True(systems.IndicatedAirspeedKnots
            > systems.Profile.EmergencyGearExtensionMaxKias);
        Assert.True(systems.EmergencyExtensionAirloadBlocked);
        Assert.True(systems.AllGearUpAndLocked);

        // Retard to idle and keep holding the release. Once below the emergency limit, the same
        // continuously held pilot action opens the doors, free-falls both mains, and expends the
        // accumulator to drive and latch the nose leg.
        session.FeedKey(GKey.ThrottleDown, true);
        session.FeedKey(GKey.PullUp, true);
        int slowingTicks = 0;
        int maxSlowingTicks = (int)(45.0 / SimulationSession.FixedDeltaSeconds);
        while (systems.IndicatedAirspeedKnots > 170.0 && slowingTicks < maxSlowingTicks) {
            session.StepFixed();
            slowingTicks++;
        }
        session.FeedKey(GKey.ThrottleDown, false);
        session.FeedKey(GKey.PullUp, false);

        Assert.True(slowingTicks < maxSlowingTicks,
            $"aircraft did not slow for emergency extension; IAS={systems.IndicatedAirspeedKnots:F1}");
        Assert.True(systems.IndicatedAirspeedKnots
            <= systems.Profile.EmergencyGearExtensionMaxKias);

        int extensionTicks = 0;
        int maxExtensionTicks = (int)(20.0 / SimulationSession.FixedDeltaSeconds);
        while (!systems.AllGearDownAndLocked && extensionTicks < maxExtensionTicks) {
            session.StepFixed();
            extensionTicks++;
        }
        session.FeedKey(GKey.EmergencyGearRelease, false);

        Assert.True(systems.AllGearDownAndLocked);
        Assert.InRange(systems.NoseGearPosition, 0.9998, 1.0);
        Assert.InRange(systems.LeftMainGearPosition, 0.9998, 1.0);
        Assert.InRange(systems.RightMainGearPosition, 0.9998, 1.0);
        Assert.False(systems.EmergencyAccumulatorAvailable);
        Assert.True(systems.EmergencyNoseGearLatched);
        Assert.Equal(LandingGearIndication.Striped, systems.NoseGearIndication);
        Assert.Equal(LandingGearIndication.Striped, systems.LeftMainGearIndication);
        Assert.Equal(LandingGearIndication.Striped, systems.RightMainGearIndication);
    }

    [Fact]
    public void FailedFlapMotorAndInterconnectProduceARealSplitThroughSessionCommands() {
        var session = new SimulationSession();
        session.StartBeat(() => ProcedureBeat(playerSpeedMps: 85.0));
        AirframeSystems systems = session.PlayerSystems;
        systems.SetFailure(AirframeSystemFailure.RightFlapMotor);
        systems.SetFailure(AirframeSystemFailure.FlapMechanicalInterconnect);
        session.Begin();

        session.FeedKey(GKey.FlapDown, true);
        StepFor(session, systems.Profile.FullFlapTravelSeconds + 0.5);
        session.FeedKey(GKey.FlapDown, false);
        StepFor(session, SimulationSession.FixedDeltaSeconds);

        Assert.Equal(WingFlapLever.Hold, systems.FlapLever);
        Assert.InRange(systems.LeftFlapDegrees,
            systems.Profile.FullFlapDegrees - 0.01,
            systems.Profile.FullFlapDegrees);
        Assert.Equal(0.0, systems.RightFlapDegrees, precision: 9);
        Assert.True(systems.FlapSplit);
        Assert.True(systems.AerodynamicState.LateralLiftCoefficientDifference > 0.25);
        Assert.Equal(systems.AerodynamicState, session.Player.AerodynamicConfiguration);
    }
}
