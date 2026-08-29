using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Casevac;

public class CasevacSimulationSessionTests {
    [Fact]
    public void BuiltInMedevacStagesNoOpponentAndUsesTheSingleSessionClock() {
        var session = new SimulationSession(
            13,
            Carrier.DeckConfiguration.Axial,
            KoreaWeatherPresets.ForBeat(13));

        Assert.True(session.CasevacMission);
        Assert.NotNull(session.CasevacFlight);
        Assert.False(session.OpponentPresent);
        Assert.Equal(
            BuiltInCasevacDefinitions.MissionId,
            session.Beat.MissionIdentity.Id);
        Assert.Equal(
            OpponentPresence.None,
            session.Beat.OpponentPresence);
        Assert.Throws<InvalidOperationException>(
            () => _ = session.Bandit);
        Assert.Throws<InvalidOperationException>(
            () => _ = session.Player);
        Assert.Equal(
            SimulationSession.LifecycleState.Ready,
            session.Lifecycle);

        session.Begin();
        session.StepFixed();

        Assert.Equal(1, session.Tick);
        Assert.Equal(
            session.Tick,
            session.CasevacFlight!.Snapshot.LastSourceTick);
        Assert.Equal(
            0,
            session.CasevacFlight.VehicleState.Tick);
        Assert.Equal(
            CasevacPhase.Ingress,
            session.CasevacFlight.Snapshot.Phase);
        Assert.Equal(
            SimulationSession.FixedDeltaSeconds,
            session.TimeSeconds,
            12);
    }

    [Fact]
    public void PauseFreezesVehicleMissionAndUrgencyTogether() {
        var session = new SimulationSession(13);
        session.Begin();
        session.FeedKey(GKey.PullUp, true);
        session.StepFixed(240);
        PlayerVehicleState before =
            session.CasevacFlight!.VehicleState;
        CasevacMissionSnapshot beforeMission =
            session.CasevacFlight.Snapshot;
        long beforeTick = session.Tick;

        session.SetPaused(true);
        session.StepFixed(600);

        Assert.Equal(beforeTick, session.Tick);
        Assert.Equal(before, session.CasevacFlight.VehicleState);
        Assert.Equal(beforeMission, session.CasevacFlight.Snapshot);

        session.SetPaused(false);
        session.StepFixed();

        Assert.Equal(beforeTick + 1, session.Tick);
        Assert.Equal(
            beforeMission.ActiveMissionTicks + 1,
            session.CasevacFlight.Snapshot.ActiveMissionTicks);
    }

    [Fact]
    public void DrivingStyleUpArrowMovesTowardTheInitialPickup() {
        var session = new SimulationSession(13);
        session.Begin();
        PlayerVehicleState initial =
            session.CasevacFlight!.VehicleState;
        CasevacResolvedLocation pickup =
            session.CasevacFlight.PickupLocation;
        double initialRange = HorizontalRange(initial, pickup);

        // ArrowUp is the existing browser binding for PushDown. In the automated
        // air-ambulance driving profile it means forward, not aircraft nose-down.
        session.FeedKey(GKey.PushDown, true);
        session.StepFixed(360);
        session.FeedKey(GKey.PushDown, false);

        PlayerVehicleState advanced =
            session.CasevacFlight.VehicleState;
        Assert.True(
            HorizontalRange(advanced, pickup) < initialRange - 5.0);
    }

    [Fact]
    public void StandardGamepadPitchAxisProvidesContinuousForwardAndReverseAuthority() {
        var forward = new SimulationSession(13);
        forward.Begin();
        CasevacResolvedLocation pickup = forward.CasevacFlight!.PickupLocation;
        double initialRange = HorizontalRange(
            forward.CasevacFlight.VehicleState,
            pickup);

        // Browser standard mapping reports stick-forward as negative Y. The CASEVAC boundary
        // translates that physical pitch convention into its positive driving-style forward axis.
        forward.SetAnalogPitchControl(-1.0);
        forward.StepFixed(360);
        forward.SetAnalogPitchControl(0.0);

        var reverse = new SimulationSession(13);
        reverse.Begin();
        reverse.SetAnalogPitchControl(1.0);
        reverse.StepFixed(360);
        reverse.SetAnalogPitchControl(0.0);

        Assert.True(
            HorizontalRange(forward.CasevacFlight.VehicleState, pickup)
                < initialRange - 5.0);
        Assert.True(
            HorizontalRange(reverse.CasevacFlight!.VehicleState, pickup)
                > initialRange + 5.0);
    }

    [Fact]
    public void StandardGamepadPitchAxisSustainsProductionMissionCruise() {
        var session = new SimulationSession(13);
        session.Begin();

        session.SetAnalogPitchControl(-1.0);
        session.StepFixed((int)(30 * AircraftSim.TickHz));
        session.SetAnalogPitchControl(0.0);

        Vec3D velocity = session.CasevacFlight!.VehicleObservation.GroundVelocityMps;
        double horizontalSpeedMps = Math.Sqrt(
            velocity.X * velocity.X + velocity.Z * velocity.Z);
        Assert.InRange(horizontalSpeedMps, 30.0, 32.1);
        Assert.True(session.CasevacFlight.VehicleFlyable);
    }

    [Fact]
    public void QuietSkipFinishesOnlyTheBuiltInMedevacAndIsIdempotent() {
        var combat = new SimulationSession(1);
        Assert.False(combat.RequestCasevacQuietSkip());
        Assert.Equal(
            SimulationSession.LifecycleState.Ready,
            combat.Lifecycle);

        var session = new SimulationSession(13);
        Assert.False(session.RequestCasevacQuietSkip());
        session.Begin();
        Assert.False(session.RequestCasevacQuietSkip());
        Assert.Equal(
            SimulationSession.LifecycleState.Active,
            session.Lifecycle);

        CasevacFlightRuntime runtime = session.CasevacFlight!;
        AdvanceControllerToQuiet(runtime.Controller);
        CasevacMissionSnapshot before = runtime.Controller.Snapshot;
        int eventCountBefore = runtime.Evidence.MissionEventCount;
        session.SetPaused(true);

        Assert.True(session.RequestCasevacQuietSkip());

        CasevacMissionSnapshot complete = runtime.Snapshot;
        Assert.Equal(
            SimulationSession.LifecycleState.Finished,
            session.Lifecycle);
        Assert.Equal(CasevacPhase.Complete, complete.Phase);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Equal(before.LastSourceTick, complete.LastSourceTick);
        Assert.Equal(before.ActiveMissionTicks, complete.ActiveMissionTicks);
        Assert.Equal(before.CallAgeTicks, complete.CallAgeTicks);
        Assert.Equal(before.QuietProgressTicks, complete.QuietProgressTicks);
        Assert.Equal(before.Custody, complete.Custody);
        Assert.Equal(before.Disposition, complete.Disposition);
        Assert.Equal(
            eventCountBefore,
            runtime.Evidence.MissionEventCount);

        Assert.False(session.RequestCasevacQuietSkip());
        Assert.Equal(complete, runtime.Snapshot);
        Assert.Equal(
            SimulationSession.LifecycleState.Finished,
            session.Lifecycle);
    }

    [Fact]
    public void SemanticAbortReturnsToTheAuthoredSafeExitWithoutVictory() {
        var session = new SimulationSession(13);
        session.Begin();
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        session.StepFixed();

        Assert.Equal(
            CasevacPhase.AbortReturn,
            session.CasevacFlight!.Snapshot.Phase);

        session.FeedKey(GKey.PullUp, true);
        session.StepFixed(10_000);

        Assert.Equal(
            SimulationSession.LifecycleState.Finished,
            session.Lifecycle);
        Assert.Equal(
            CasevacPhase.Aborted,
            session.CasevacFlight.Snapshot.Phase);
        Assert.Equal(
            CasevacDisposition.ControlledAbort,
            session.CasevacFlight.Snapshot.Disposition);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.False(session.OpponentPresent);
    }

    static double HorizontalRange(
        in PlayerVehicleState vehicle,
        in CasevacResolvedLocation location) {
        double east = location.EastM - vehicle.PositionWorldM.X;
        double north = location.NorthM - vehicle.PositionWorldM.Z;
        return Math.Sqrt(east * east + north * north);
    }

    [Fact]
    public void RestartCreatesAFreshVehicleAndMissionEpochWithoutASecondLifecycle() {
        var session = new SimulationSession(13);
        session.Begin();
        session.FeedKey(GKey.PullUp, true);
        session.StepFixed(120);
        CasevacFlightRuntime first = session.CasevacFlight!;
        long firstEpoch = first.Snapshot.MissionEpochSequence;
        long sessionTick = session.Tick;

        session.Restart();

        Assert.NotSame(first, session.CasevacFlight);
        Assert.Equal(
            SimulationSession.LifecycleState.Ready,
            session.Lifecycle);
        Assert.Equal(sessionTick, session.Tick);
        Assert.Equal(CasevacPhase.Ready, session.CasevacFlight!.Snapshot.Phase);
        Assert.Equal(CapsuleCustody.AtPickup, session.CasevacFlight.Snapshot.Custody);
        Assert.Equal(0.0, session.CasevacFlight.Snapshot.PayloadMassKg, 12);

        session.Begin();

        Assert.True(
            session.CasevacFlight.Snapshot.MissionEpochSequence
                > firstEpoch);
    }

    static void AdvanceControllerToQuiet(
        CasevacMissionController controller) {
        long sourceTick = controller.Snapshot.LastSourceTick;
        string pickup = controller.Definition.PickupSiteId;
        string receiver = controller.Definition.ReceiverSiteId;

        Step(pickup);
        for (int tick = 0;
            tick < controller.Definition.StabilizationDwellTicks;
            tick++)
            Step(pickup);
        for (int tick = 0;
            tick < controller.Definition.LoadingDwellTicks;
            tick++)
            Step(pickup);
        Step(receiver);
        for (int tick = 0;
            tick < controller.Definition.StabilizationDwellTicks;
            tick++)
            Step(receiver);
        for (int tick = 0;
            tick < controller.Definition.HandoffDwellTicks;
            tick++)
            Step(receiver);

        Assert.Equal(CasevacPhase.Quiet, controller.Phase);

        void Step(string siteId) {
            sourceTick = checked(sourceTick + 1L);
            controller.Advance(new CasevacTickObservation(
                sourceTick,
                vehicleFlyable: true,
                insideSafeExitVolume: false,
                Vec3D.Zero,
                clearanceM: 0.0,
                CasevacMaskingState.NotAssessed,
                withinSafeMaskingBand: false,
                protectionInterventionActive: false,
                new LandingZoneObservation(
                    siteId,
                    insideTerminalVolume: true,
                    insideEnterFootprint: true,
                    insideExitFootprint: true,
                    surfaceContact: true,
                    lateralGroundSpeedMps: 0.0,
                    verticalSpeedMps: 0.0,
                    pitchRad: 0.0,
                    bankRad: 0.0,
                    LandingZoneGateViolation.None,
                    LandingZoneGateViolation.None,
                    LandingZoneGateClass.Advance)));
        }
    }
}
