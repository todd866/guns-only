using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Tests.TopGun;

/// <summary>
/// Deterministic Top Gun dogfight automation for preview promotion: AIM-9 seeker path,
/// magazine accounting, seat boot, and gun firing must not throw.
/// </summary>
public sealed class TopGunDogfightAutomationTests
{
    const int MaxFoxTwoTicks = 60 * (int)AircraftSim.TickHz;

    static readonly Aim9FlightState[] TerminalFoxTwoOutcomes =
    [
        Aim9FlightState.Detonated,
        Aim9FlightState.Expired,
        Aim9FlightState.Lost,
    ];

    static SimulationSession StartTomcatSession()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();
        return session;
    }

    static SimulationSession StartMigSession()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.Mig28));
        session.Begin();
        return session;
    }

    static void StepUntilFoxTwoTerminal(SimulationSession session)
    {
        for (int tick = 0; tick < MaxFoxTwoTicks && session.Aim9InFlight; tick++)
            session.StepFixed();
    }

    [Fact]
    public void TomcatSeatFoxTwoExercisesSeekerAndAccountsMagazine()
    {
        var session = StartTomcatSession();
        Assert.Equal(2, session.Aim9Remaining);

        int magazineBeforeLaunch = session.Aim9Remaining;
        Assert.True(session.LaunchFoxTwo());
        Assert.True(session.Aim9Remaining < magazineBeforeLaunch);
        Assert.Equal(1, session.Aim9Remaining);
        Assert.True(session.Aim9InFlight);

        StepUntilFoxTwoTerminal(session);

        Assert.False(session.Aim9InFlight);
        Assert.Equal(1, session.Aim9Remaining);
        Assert.Contains(session.Aim9SeekerState, TerminalFoxTwoOutcomes);
    }

    [Fact]
    public void Aim9OffBoresightFixtureDocumentsSeekerLoss()
    {
        var aim9 = Aim9Surrogate.TestFixture_OffBoresightLoss();
        Assert.Equal(0, aim9.RoundsRemaining);

        aim9.Step(1.0 / 60.0, new Aim9Pose(new Vec3D(8000, 5000, 0), Vec3D.Zero));

        Assert.Equal(Aim9FlightState.Lost, aim9.Live.State);
        Assert.Contains(aim9.Live.State, TerminalFoxTwoOutcomes);
    }

    [Fact]
    public void TomcatSeatProximityGeometryDetonatesSeeker()
    {
        var aim9 = Aim9Surrogate.TestFixture_ProximityHit();
        aim9.Step(1.0 / 60.0, aim9.FixtureTarget);
        Assert.Equal(Aim9FlightState.Detonated, aim9.Live.State);
        Assert.Equal(0, aim9.RoundsRemaining);
    }

    [Fact]
    public void ProximityDetonationOwnsOneDeterministicGameplayKillEdge()
    {
        var session = StartTomcatSession();
        int gunHitsBefore = session.PlayerGun.TotalHitCount;
        int opponentRoundsBefore = session.OpponentGun.RoundsFired;
        long targetSequence = session.BanditSpawnSequence;

        Assert.True(session.LaunchFoxTwo());
        session.SeedActiveAim9ForProximityHitForTest();
        session.StepFixed();

        Assert.Equal(Aim9FlightState.Detonated, session.Aim9SeekerState);
        Assert.False(session.Aim9InFlight);
        Assert.False(session.PrimaryOpponentAlive);
        Assert.Equal(0.0, session.PrimaryOpponentHealth);
        Assert.Equal(AircraftTerminalState.DestroyedAirborne, session.OpponentTerminalState);
        Assert.Equal(1, session.KillCount);
        Assert.Equal(gunHitsBefore, session.PlayerGun.TotalHitCount);
        Assert.Equal(opponentRoundsBefore, session.OpponentGun.RoundsFired);

        SessionEvent[] combatEvents = session.RecentEvents
            .Where(item => item.Type is SessionEventType.Hit or SessionEventType.Destroyed)
            .ToArray();
        Assert.Equal([SessionEventType.Hit, SessionEventType.Destroyed],
            combatEvents.Select(item => item.Type).ToArray());
        Assert.All(combatEvents, item =>
        {
            Assert.Equal(targetSequence, item.EntitySequence);
            Assert.True(item.HasKinematics);
            Assert.Equal(CombatRole.Player, item.Source);
            Assert.Equal(CombatRole.Opponent, item.Target);
        });
        Assert.Equal(combatEvents[0].Tick, combatEvents[1].Tick);
        Assert.Equal(combatEvents[0].Position, combatEvents[1].Position);
        Assert.Equal(combatEvents[0].Velocity, combatEvents[1].Velocity);

        long eventSequence = combatEvents[^1].Sequence;
        session.StepFixed();
        Assert.Equal(1, session.KillCount);
        Assert.DoesNotContain(session.RecentEvents,
            item => item.Sequence > eventSequence
                && item.Type is SessionEventType.Hit or SessionEventType.Destroyed);

        session.Restart();
        Assert.Equal(Aim9FlightState.Safe, session.Aim9SeekerState);
        Assert.False(session.Aim9InFlight);
        Assert.Equal(TopGunFightRuntime.DefaultMagazine, session.Aim9Remaining);
        Assert.Equal(0, session.KillCount);
        Assert.True(session.PrimaryOpponentAlive);
    }

    [Fact]
    public void Mig28SeatBootsAndStepsWithoutThrow()
    {
        var session = StartMigSession();
        Exception? failure = Record.Exception(() =>
        {
            for (int tick = 0; tick < 2 * (int)AircraftSim.TickHz; tick++)
                session.StepFixed();
        });

        Assert.Null(failure);
        Assert.Equal(TopGunFightRuntime.DefaultMagazine, session.Aim9Remaining);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }

    [Fact]
    public void TomcatGunPathDoesNotThrow()
    {
        var session = StartTomcatSession();
        Assert.True(session.PlayerWeaponsAuthorized);

        Exception? failure = Record.Exception(() =>
        {
            session.FeedKey(GKey.Trigger, true);
            for (int tick = 0; tick < 30; tick++)
                session.StepFixed();
            session.FeedKey(GKey.Trigger, false);
            session.StepFixed();
        });

        Assert.Null(failure);
    }
}
