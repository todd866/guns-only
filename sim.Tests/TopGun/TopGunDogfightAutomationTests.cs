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
