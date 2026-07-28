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
    public void SemanticAbortReturnsToTheAuthoredSafeExitWithoutVictory() {
        var session = new SimulationSession(13);
        session.Begin();
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        session.StepFixed();

        Assert.Equal(
            CasevacPhase.AbortReturn,
            session.CasevacFlight!.Snapshot.Phase);

        session.FeedKey(GKey.PushDown, true);
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
}
