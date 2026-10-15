using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public sealed class PathfinderQaTests {
    static SimulationSession Session() =>
        new(beatIndex: Beats.PathfinderBeatIndex);

    static int FirstGunWindowTick(SimulationSession session) {
        session.Begin();
        double previousRange = double.PositiveInfinity;
        for (int tick = 1; tick <= 120 * 120; tick++) {
            session.StepFixed();
            double range = Range(session);
            if (range <= 1500.0) {
                Assert.True(previousRange > 1500.0,
                    $"crossing was not the first fixed tick: previous {previousRange:F3} m");
                return tick;
            }
            previousRange = range;
        }
        throw new Xunit.Sdk.XunitException("Pathfinder gun window was not reached");
    }

    static double Range(SimulationSession session) {
        var mission = Assert.IsType<PathfinderMission>(session.Pathfinder);
        return (mission.Balloons[0].GondolaPosition - session.Player.State.Position).Length;
    }

    static void AssertSameTickState(SimulationSession actual, SimulationSession expected) {
        Assert.Equal(expected.Tick, actual.Tick);
        Assert.Equal(expected.TimeSeconds, actual.TimeSeconds, precision: 12);
        Assert.Equal(expected.Player.State, actual.Player.State);
        Assert.Equal(expected.Pathfinder!.Balloons[0].Position,
            actual.Pathfinder!.Balloons[0].Position);
    }

    [Fact]
    public void QaCapturesFirstFixedTickAtOrInsideGunWindow() {
        var reference = Session();
        int crossingTick = FirstGunWindowTick(reference);

        var qa = Session();
        qa.Begin();
        qa.ConfigurePathfinderQaGunWindow(true);
        qa.StepFixed(crossingTick + 20);

        Assert.Equal(crossingTick, qa.Tick);
        Assert.True(qa.PathfinderQaGunWindowReached);
        Assert.Equal(SimulationSession.LifecycleState.Paused, qa.Lifecycle);
        Assert.InRange(Range(qa), 0, 1500);
        AssertSameTickState(qa, reference);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void QaAdvanceAndStepFixedBatchesStopAtTheSameDeterministicTick(int mode) {
        var calibration = Session();
        int crossingTick = FirstGunWindowTick(calibration);
        var qa = Session();
        qa.Begin();
        qa.ConfigurePathfinderQaGunWindow(true);

        if (mode == 1) {
            for (int frame = 0; frame < 60 * 30 && !qa.PathfinderQaGunWindowReached; frame++)
                qa.Advance(1.0 / 60.0);
        } else if (mode == 2) {
            for (int frame = 0; frame < 4 * 30 && !qa.PathfinderQaGunWindowReached; frame++)
                qa.Advance(0.25);
        } else {
            qa.StepFixed(crossingTick + 20);
        }

        var expected = Session();
        expected.Begin();
        expected.StepFixed(crossingTick);
        AssertSameTickState(qa, expected);
        Assert.True(qa.PathfinderQaGunWindowReached);
        Assert.Equal(SimulationSession.LifecycleState.Paused, qa.Lifecycle);
    }

    [Fact]
    public void QaPauseIsStableAndResumeAdvancesOnceWithoutRepausing() {
        var qa = Session();
        int crossingTick = FirstGunWindowTick(Session());
        qa.Begin();
        qa.ConfigurePathfinderQaGunWindow(true);
        qa.StepFixed(crossingTick + 20);
        long pausedTick = qa.Tick;
        double pausedTime = qa.TimeSeconds;
        qa.StepFixed(20);
        qa.Advance(0.25);
        Assert.Equal(pausedTick, qa.Tick);
        Assert.Equal(pausedTime, qa.TimeSeconds, precision: 12);

        qa.SetPaused(false);
        qa.StepFixed();
        Assert.Equal(pausedTick + 1, qa.Tick);
        Assert.Equal(SimulationSession.LifecycleState.Active, qa.Lifecycle);
        Assert.True(qa.PathfinderQaGunWindowReached);
    }

    [Fact]
    public void QaRestartClearsCaptureAndExplicitRearmCapturesAgain() {
        int crossingTick = FirstGunWindowTick(Session());
        var qa = Session();
        qa.Begin();
        qa.ConfigurePathfinderQaGunWindow(true);
        qa.StepFixed(crossingTick + 20);
        Assert.True(qa.PathfinderQaGunWindowReached);

        qa.Restart();
        Assert.False(qa.PathfinderQaGunWindowReached);
        Assert.Equal(SimulationSession.LifecycleState.Ready, qa.Lifecycle);
        qa.Begin();
        qa.ConfigurePathfinderQaGunWindow(true);
        qa.StepFixed(crossingTick + 20);
        Assert.True(qa.PathfinderQaGunWindowReached);
    }

    [Fact]
    public void QaFlagStaysUntouchedForNormalMissionsAndOtherBeats() {
        var pathfinder = Session();
        pathfinder.Begin();
        pathfinder.StepFixed(120 * 20);
        Assert.False(pathfinder.PathfinderQaGunWindowReached);
        Assert.Equal(SimulationSession.LifecycleState.Active, pathfinder.Lifecycle);

        var normal = new SimulationSession(beatIndex: 1);
        normal.ConfigurePathfinderQaGunWindow(true);
        normal.Begin();
        normal.StepFixed(20);
        Assert.False(normal.PathfinderQaGunWindowReached);

        var other = new SimulationSession(beatIndex: 11);
        other.ConfigurePathfinderQaGunWindow(true);
        other.Begin();
        other.StepFixed(20);
        Assert.False(other.PathfinderQaGunWindowReached);
    }

    [Fact]
    public void QaDoesNotSwitchToSecondRelayWhenFirstIsDenied() {
        var qa = Session();
        var mission = Assert.IsType<PathfinderMission>(qa.Pathfinder);
        mission.Engage(mission.Balloons[0].Id, PathfinderBalloonComponent.Gondola);
        qa.Begin();
        qa.ConfigurePathfinderQaGunWindow(true);
        qa.StepFixed(120 * 30);
        qa.Player.AdoptExternalKinematics(qa.Player.State with {
            Position = mission.Balloons[1].GondolaPosition + new Vec3D(1000, 0, 0)
        });
        qa.StepFixed();
        Assert.InRange((mission.Balloons[1].GondolaPosition - qa.Player.State.Position).Length, 0, 1500);
        Assert.False(qa.PathfinderQaGunWindowReached);
        Assert.False(mission.Balloons[0].RelayActive);
        Assert.True(mission.Balloons[1].RelayActive);
    }
}
