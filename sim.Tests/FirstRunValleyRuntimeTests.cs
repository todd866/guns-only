using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Tests;

public sealed class FirstRunValleyRuntimeTests {
    [Fact]
    public void StaysColdUntilThePopOutNorthing() {
        var runtime = new FirstRunValleyRuntime(new FirstRunValleyConfig(
            FirstRunValleyRuntime.PopOutNorthM));
        var stillInDraw = new AircraftState(
            new Vec3D(FirstRunValleyRuntime.ValleyEastM,
                FirstRunValleyRuntime.SpawnAltitudeM,
                FirstRunValleyRuntime.PopOutNorthM - 500.0),
            200.0, 0.0, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);
        Assert.False(runtime.ObservePlayer(stillInDraw));
        Assert.True(runtime.WeaponsCold);
        Assert.Equal(2, runtime.Aim9Remaining);

        var shooter = new Aim9Pose(stillInDraw.Position, new Vec3D(0, 0, 200));
        var target = new Aim9Pose(
            new Vec3D(FirstRunValleyRuntime.ValleyEastM,
                FirstRunValleyRuntime.SpawnAltitudeM,
                FirstRunValleyRuntime.BanditNorthM),
            new Vec3D(0, 0, 180));
        Assert.False(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 0));
    }

    [Fact]
    public void ArmsAtThePopOutGateAndAllowsTwoHeaters() {
        var runtime = new FirstRunValleyRuntime(new FirstRunValleyConfig(
            FirstRunValleyRuntime.PopOutNorthM));
        var popped = new AircraftState(
            new Vec3D(FirstRunValleyRuntime.ValleyEastM,
                FirstRunValleyRuntime.SpawnAltitudeM,
                FirstRunValleyRuntime.PopOutNorthM + 10.0),
            200.0, 0.0, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);
        Assert.True(runtime.ObservePlayer(popped));
        Assert.False(runtime.WeaponsCold);
        Assert.True(runtime.ConsumePopOutAnnouncement());
        Assert.False(runtime.ConsumePopOutAnnouncement());

        var shooter = new Aim9Pose(popped.Position, new Vec3D(0, 0, 200));
        var target = new Aim9Pose(
            new Vec3D(FirstRunValleyRuntime.ValleyEastM,
                FirstRunValleyRuntime.SpawnAltitudeM,
                FirstRunValleyRuntime.BanditNorthM),
            new Vec3D(0, 0, 180));
        Assert.True(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 0));
        Assert.Equal(1, runtime.Aim9Remaining);
        Assert.True(runtime.Aim9InFlight);
        for (int i = 0; i < 2400 && runtime.Aim9InFlight; i++)
            runtime.Step(1.0 / 60.0, target);
        Assert.True(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 100_000));
        Assert.Equal(0, runtime.Aim9Remaining);
        Assert.False(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 200_000));
    }
}

public sealed class FirstRunValleySessionTests {
    static SimulationSession Stage(BeatSetup beat) {
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.Begin();
        return session;
    }

    [Fact]
    public void ValleyTeachesTheDrawAndParksACoAltitudeMouthPair() {
        var session = Stage(Beats.ModernVisualMergeFirstRun());
        Assert.Contains("FOLLOW THE VALLEY", session.TransitionCue);
        Assert.Single(session.Wingmen);
        AircraftState lead = session.Bandit.State;
        AircraftState dash2 = session.Wingmen[0].Bandit.State;
        Assert.Equal(FirstRunValleyRuntime.SpawnAltitudeM, lead.Position.Y, 1);
        Assert.Equal(lead.Position.Y, dash2.Position.Y, 5);
        double pairRangeM = (lead.Position - dash2.Position).Length;
        Assert.InRange(pairRangeM, 800.0, 1_600.0);
        Assert.Equal(lead.Chi, dash2.Chi, 3);
    }

    [Fact]
    public void ValleyHoldsFireAndParksTheOpeningPair() {
        var session = Stage(Beats.ModernVisualMergeFirstRun());
        Vec3D banditAtStart = session.Bandit.State.Position;
        Assert.Equal(2, session.Aim9Remaining);
        Assert.False(session.PlayerWeaponsAuthorized);
        Assert.False(session.LaunchFoxTwo());

        session.FeedKey(GKey.Trigger, true);
        session.StepFixed(60);
        session.FeedKey(GKey.Trigger, false);

        Assert.Equal(2, session.Aim9Remaining);
        Assert.Equal(0, session.PlayerGun.RoundsFired);
        Assert.Equal(banditAtStart.Z, session.Bandit.State.Position.Z, 1);
    }

    [Fact]
    public void FireShootsHeatersUntilEmptyThenGuns() {
        BeatSetup armed = Beats.ModernVisualMergeFirstRun();
        armed = armed with {
            Player = armed.Player with {
                Position = armed.Player.Position with {
                    Z = FirstRunValleyRuntime.PopOutNorthM + 10.0
                }
            }
        };
        var session = Stage(armed);
        session.StepFixed();
        Assert.True(session.PlayerWeaponsAuthorized);
        Assert.Equal(2, session.Aim9Remaining);

        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        Assert.Equal(1, session.Aim9Remaining);
        Assert.Equal(0, session.PlayerGun.RoundsFired);

        for (int i = 0; i < 3600 && session.Aim9InFlight; i++)
            session.StepFixed();

        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        Assert.Equal(0, session.Aim9Remaining);

        int roundsBeforeGuns = session.PlayerGun.RoundsFired;
        session.FeedKey(GKey.Trigger, true);
        session.StepFixed(12);
        session.FeedKey(GKey.Trigger, false);
        Assert.True(session.PlayerGun.RoundsFired > roundsBeforeGuns);
    }

    [Fact]
    public void HighMergeStillHasNoHeatersOnTrigger() {
        var session = Stage(Beats.ModernVisualMerge());
        Assert.Equal(0, session.Aim9Remaining);
        Assert.False(session.LaunchFoxTwo());
        session.FeedKey(GKey.Trigger, true);
        session.StepFixed(12);
        Assert.True(session.PlayerGun.RoundsFired > 0);
        Assert.Equal(0, session.Aim9Remaining);
    }
}
