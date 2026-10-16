using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public sealed class PathfinderPhaseOneTests {
    [Fact]
    public void ThreePearlsAreForwardAndTurnByOnlyAShallowAngle() {
        var beat = Beats.RapierPathfinders();
        var spawns = beat.Pathfinder!.Spawns;
        Assert.Equal(3, spawns.Count);
        var previous = beat.Player.Position;
        var direction = beat.Player.VelocityVector().Normalized();
        for (int i = 0; i < spawns.Count; i++) {
            var leg = spawns[i].Position - previous;
            Assert.True(leg.Dot(direction) > 0);
            if (i > 0) Assert.InRange(leg.Length, 25_000, 35_000);
            Assert.InRange(Math.Acos(leg.Normalized().Dot(direction)), 0, .04);
            direction = leg.Normalized(); previous = spawns[i].Position;
        }
        double turnRadius = beat.Player.Speed * beat.Player.Speed / (FlightModel.G0 * Math.Sqrt(6.5 * 6.5 - 1));
        Assert.InRange(turnRadius, 17_000, 20_000);
    }

    [Theory]
    [InlineData(0u)] [InlineData(15u)] [InlineData(29u)]
    public void SecondRelayCrossesTownAtArrivalThenBrieflyClears(uint seed) {
        var mission = new PathfinderMission(PathfinderMissionDefinition.FirstLight(seed));
        var relay = mission.Balloons[1];
        relay.Step(41);
        Assert.Equal(PathfinderFootprintClass.Populated, mission.ClassifyKill(relay));
        relay.Step(55);
        Assert.Equal(PathfinderFootprintClass.Clear, mission.ClassifyKill(relay));
        relay.Step(40);
        Assert.Equal(PathfinderFootprintClass.Populated, mission.ClassifyKill(relay));
    }

    [Fact]
    public void DefaultFlightActuallyArrivesDuringTheTownCrossing() {
        var s = new SimulationSession(Beats.PathfinderBeatIndex);
        s.Begin(); s.SetPlayerGunTargetSlot(1);
        for (int i = 0; i < 50 * AircraftSim.TickHz; i++) {
            s.Advance(1.0 / AircraftSim.TickHz);
            if ((s.Pathfinder!.SelectedBalloon.GondolaPosition - s.Player.State.Position).Length < 900) break;
        }
        Assert.InRange((s.Pathfinder!.SelectedBalloon.GondolaPosition - s.Player.State.Position).Length, 0, 900);
        Assert.InRange(s.TimeSeconds, 35, 45);
        Assert.Equal(PathfinderFootprintClass.Populated, s.Pathfinder.ClassifyKill(s.Pathfinder.SelectedBalloon));
    }

    [Fact]
    public void LaneAdvancesAfterDenialButDeliberateReattackSelectionStaysPinned() {
        var s = new SimulationSession(Beats.PathfinderBeatIndex);
        var m = s.Pathfinder!;
        m.Engage(1, PathfinderBalloonComponent.Gondola);
        m.Step(s.Player.State, false, 1.0 / 120);
        Assert.Equal(2, m.SelectedBalloonId);
        var beyondSecond = s.Player.State with { Position = new(-90_000, 20600, 100) };
        m.SelectBalloon(2);
        m.Step(beyondSecond, false, 1.0 / 120);
        Assert.Equal(2, m.SelectedBalloonId);
        Assert.True(m.SelectedBalloon.RelayActive);
    }

    [Fact]
    public void PlayerReleaseConsumesOneStoreAndFDoesNotAlsoFireTheGun() {
        var s = new SimulationSession(Beats.PathfinderBeatIndex);
        Assert.False(s.TryReleasePathfinderDrone());
        s.Begin();
        double mass = s.Player.State.Mass;
        s.FeedKey(GKey.WeaponSelect, true); s.FeedKey(GKey.WeaponSelect, false);
        Assert.True(s.PathfinderDroneSelected);
        s.FeedKey(GKey.Trigger, true); s.FeedKey(GKey.Trigger, true);
        s.FeedKey(GKey.Trigger, false);
        Assert.Equal(1, s.Pathfinder!.DroneReleases);
        Assert.Equal(3, s.RapierDogfightingDronesRemaining);
        Assert.Equal(mass - FlightModel.RapierGunDroneSurrogate.MassKg, s.Player.State.Mass, 5);
        Assert.False(s.TryReleasePathfinderDrone());
        s.Advance(1.0 / 120);
        Assert.Equal(0, s.Pathfinder.Gun.RoundsFired);
        Assert.False(s.PlayerRtbActive);
        Assert.False(s.RapierGunDroneEgress);
    }

    [Fact]
    public void AllDeniedEndsDirectlyWithoutRecoveryAndDeadlineCountsEscapeSeparately() {
        var s = new SimulationSession(Beats.PathfinderBeatIndex);
        s.Begin();
        foreach (var relay in s.Pathfinder!.Balloons)
            s.Pathfinder.Engage(relay.Id, PathfinderBalloonComponent.Gondola);
        s.Advance(1.0 / 120);
        Assert.Equal(SimulationSession.LifecycleState.Finished, s.Lifecycle);
        Assert.False(s.PlayerRtbActive);
        Assert.Equal(3, s.Pathfinder.RelaySectorsDenied);
        Assert.Equal(0, s.Pathfinder.RelaysEscaped);

        var deadline = new SimulationSession(Beats.PathfinderBeatIndex);
        deadline.Begin();
        // Test the mission deadline independently of a 300-second unguided aircraft.
        deadline.Pathfinder!.Step(deadline.Player.State, false, 300);
        deadline.Advance(1.0 / 120);
        Assert.Equal(SimulationSession.LifecycleState.Finished, deadline.Lifecycle);
        Assert.Equal("deadline", deadline.Pathfinder.EndReason);
        Assert.Equal(0, deadline.Pathfinder.RelaySectorsDenied);
        Assert.Equal(3, deadline.Pathfinder.RelaysEscaped);
        Assert.False(deadline.Pathfinder.ContractEarned);
    }

    [Fact]
    public void ReleaseDroneMustHitAGondolaWithItsOwnSweptGunRounds() {
        var s = new SimulationSession(Beats.PathfinderBeatIndex);
        s.Begin();
        // Gliding drone needs a near release: its existing wave-drag card spends inherited
        // energy quickly. Fly the production aircraft forward until inside four kilometres.
        while ((s.Pathfinder!.SelectedBalloon.GondolaPosition - s.Player.State.Position).Length > 4000)
            s.Advance(1.0 / AircraftSim.TickHz);
        Assert.True(s.TryReleasePathfinderDrone());
        for (int i = 0; i < 25 * AircraftSim.TickHz && s.Lifecycle == SimulationSession.LifecycleState.Active; i++)
            s.Advance(1.0 / AircraftSim.TickHz);
        Assert.Equal(0, s.Pathfinder!.Gun.RoundsFired);
        Assert.True(s.ActiveRapierGunDrone!.Gun.RoundsFired > 0);
        Assert.Equal(1, s.Pathfinder.DroneKills);
        Assert.Contains(s.Pathfinder.KillRecords, k => k.Source == "drone" && k.BalloonId == 1);
    }
}
