using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public sealed class PracticeSessionTests {
    [Fact]
    public void RecoveryExerciseRequiresSurvivableTouchdownThenThePhysicalWheelStop() {
        var session = new SimulationSession();
        session.StartBeat(() => PracticeBeats.Create(PracticeExercise.Recovery));
        session.Begin();
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        session.StepFixed(8 * (int)AircraftSim.TickHz);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        var recovery = Assert.IsType<ConventionalRunwayRecoveryModel>(session.ConventionalRunwayRecovery);
        var runway = recovery.Runway;
        // Place the fixture just above the wheels' contact plane, then let the ordinary
        // swept-contact and braking models own every subsequent state transition.
        Vec3D velocity = runway.Forward * 74 + new Vec3D(0, -2.2, 0);
        session.Player.AdoptExternalKinematics(new AircraftState(
            runway.SurfacePoint(430) + new Vec3D(0, 1.85, 0), velocity.Length,
            Math.Asin(velocity.Y / velocity.Length), runway.HeadingRad, 0,
            session.Player.State.Mass,
            BodyAttitude: QuaternionD.FromFrame(runway.Right, new Vec3D(0, 1, 0), runway.Forward)));
        session.Controls.SetAnalogThrottleControl(0);
        session.StepFixed();
        Assert.Equal(RunwayRecoveryPhase.Rollout, recovery.Phase);
        Assert.Equal(PracticeStatus.Active, session.Practice!.Status);
        for (int i = 0; i < 10_000 && session.Lifecycle == SimulationSession.LifecycleState.Active; i++)
            session.StepFixed();
        Assert.Equal(RunwayRecoveryPhase.Recovered, recovery.Phase);
        Assert.Equal(PracticeStatus.Completed, session.Practice.Status);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
        Assert.True(recovery.Touchdown.Contact && recovery.Touchdown.Survivable);
    }

    [Fact]
    public void GunneryTargetHoldsItsAuthoredCourseThroughTheOpeningPass() {
        var beat = PracticeBeats.Create(PracticeExercise.Gunnery);
        var target = Assert.IsType<RailBandit>(beat.CreateBandit());
        for (int i = 0; i < 1200; i++) target.Step(1.0 / AircraftSim.TickHz);
        Assert.InRange(Math.Abs(target.State.Bank), 0, 0.02);
        Assert.InRange(Math.Abs(target.State.Position.X - beat.Bandit.Position.X), 0, 5);
        Assert.InRange(Math.Abs(target.State.Position.Y - beat.Bandit.Position.Y), 0, 50);
        Assert.True(target.State.Position.Z > beat.Bandit.Position.Z + 1000);
    }

    [Fact]
    public void ValleyGateEndsOnlyTheExerciseAndRestartResetsItsAuthority() {
        var beat = PracticeBeats.Create(PracticeExercise.Valley);
        beat = beat with { Player = beat.Player with {
            Position = beat.Player.Position with { Z = FirstRunValleyRuntime.PopOutNorthM + 10 }
        }};
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        Assert.Equal(PracticeStatus.Ready, session.Practice!.Status);
        session.Begin();
        session.StepFixed();
        Assert.Equal(PracticeStatus.Completed, session.Practice.Status);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
        Assert.Equal(0, session.KillCount);
        session.StartBeat(() => PracticeBeats.Create(PracticeExercise.Valley));
        Assert.Equal(PracticeStatus.Ready, session.Practice!.Status);
        session.StartBeat(7);
        Assert.Null(session.Practice);
    }

    [Fact]
    public void RecoveryStartsWithoutCombatAndCannotCompleteInTheAir() {
        var session = new SimulationSession();
        session.StartBeat(() => PracticeBeats.Create(PracticeExercise.Recovery));
        Assert.False(session.OpponentPresent);
        session.Begin();
        for (int i = 0; i < 120; i++) session.StepFixed();
        Assert.Equal(PracticeStatus.Active, session.Practice!.Status);
        Assert.Equal(CombatHandoffPhase.PlayerRtb, session.CombatHandoffPhase);
        Assert.Equal(SortieOutcome.None, session.Outcome);
    }

    [Fact]
    public void GunneryUsesAnUnarmedPhysicalTargetAndDoesNotScoreAimingOrTriggering() {
        var beat = PracticeBeats.Create(PracticeExercise.Gunnery);
        Assert.IsType<RailBandit>(beat.CreateBandit());
        Assert.Equal(0, beat.CombatRules.OpponentAmmo);
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.Begin();
        for (int i = 0; i < 120; i++) session.StepFixed();
        Assert.Equal(0, session.SortiePlayerHits);
        Assert.Equal(PracticeStatus.Active, session.Practice!.Status);
        Assert.Equal(0, session.SortieOpponentRoundsFired);
    }

    [Fact]
    public void FatalTickBeatsSuccessAndTimeoutCannotLaterBecomeSuccess() {
        var lost = new PracticeRuntime(PracticeExercise.Gunnery);
        lost.Begin();
        lost.Observe(10, true, false, 2, false, true);
        Assert.Equal(PracticeStatus.Lost, lost.Status);
        var timedOut = new PracticeRuntime(PracticeExercise.Gunnery);
        timedOut.Begin();
        timedOut.Observe(180, false, false, 0, false, false);
        timedOut.Observe(181, false, false, 2, false, false);
        Assert.Equal(PracticeStatus.TimeLimit, timedOut.Status);
    }

    [Fact]
    public void HotFrameInvalidatesColdPracticeStatusAtBeginAndRemovesItOnNormalRestage() {
        var session = new SimulationSession();
        session.StartBeat(() => PracticeBeats.Create(PracticeExercise.Gunnery));
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0, 0, false);
        var ready = buffer.ToArray();
        session.Begin();
        SnapshotHotFrame.Fill(buffer, session, 0, 0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > ready[SnapshotHotFrame.ColdVersionIndex]);
        using var active = JsonDocument.Parse(SnapshotProjection.BuildState(session,
            Carrier.DeckConfiguration.Angled, 0, 0, false, null));
        Assert.Equal("gunnery", active.RootElement.GetProperty("practice_exercise").GetString());
        Assert.Equal("active", active.RootElement.GetProperty("practice_status").GetString());
        session.StartBeat(7);
        using var normal = JsonDocument.Parse(SnapshotProjection.BuildState(session,
            Carrier.DeckConfiguration.Angled, 0, 0, false, null));
        Assert.Equal("none", normal.RootElement.GetProperty("practice_exercise").GetString());
        Assert.False(normal.RootElement.GetProperty("practice_completed").GetBoolean());
    }
}
