using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class TopGunMissileWireTests
{
    [Fact]
    public void TopGunRuntimeStartsWithTwoHeaters()
    {
        var runtime = new TopGunFightRuntime();
        Assert.Equal(2, runtime.Aim9Remaining);
        Assert.False(runtime.Aim9InFlight);
    }

    [Fact]
    public void TopGunRuntimeLaunchesExactlyTwoHeaters()
    {
        var runtime = new TopGunFightRuntime();
        var shooter = new Aim9Pose(new Vec3D(0, 5000, 0), new Vec3D(0, 0, 250));
        var target = new Aim9Pose(new Vec3D(0, 5000, 3000), new Vec3D(0, 0, 200));

        Assert.True(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 0));
        Assert.Equal(1, runtime.Aim9Remaining);
        Assert.True(runtime.Aim9InFlight);

        for (int i = 0; i < 2400 && runtime.Aim9InFlight; i++)
            runtime.Step(1.0 / 60.0, target);

        Assert.True(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 100_000));
        Assert.Equal(0, runtime.Aim9Remaining);
        Assert.False(runtime.TryLaunchFoxTwo(shooter, target, nowMs: 200_000));
    }

    [Fact]
    public void TopGunSessionExposesTwoHeaters()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();

        Assert.Equal(2, session.Aim9Remaining);
    }

    [Fact]
    public void ModernVisualMergeSessionHasZeroHeaters()
    {
        var session = new SimulationSession();
        session.StartBeat(7);
        session.Begin();

        Assert.Equal(0, session.Aim9Remaining);
        Assert.False(session.LaunchFoxTwo());
    }

    [Fact]
    public void TopGunSessionCanLaunchFoxTwo()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();

        Assert.True(session.LaunchFoxTwo());
        Assert.Equal(1, session.Aim9Remaining);
    }

    [Fact]
    public void EffectiveTomcatWingSpanShrinksWithSweepSchedule()
    {
        double slow = TopGunFightRuntime.EffectiveTomcatWingSpanM(mach: 0.4, casKts: 200);
        double fast = TopGunFightRuntime.EffectiveTomcatWingSpanM(mach: 1.2, casKts: 500);
        Assert.True(fast < slow);
        // Published 64 ft 1 in forward / 38 ft 2 in fully swept endpoints. The chosen schedule
        // is slightly off each stop at these sample points (21.3° and 62° respectively).
        Assert.InRange(slow, 19.0, 19.53);
        Assert.InRange(fast, 12.0, 13.0);
    }
}
