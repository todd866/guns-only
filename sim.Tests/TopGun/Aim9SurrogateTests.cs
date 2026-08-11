using GunsOnly.Sim;
using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class Aim9SurrogateTests
{
    static Aim9Pose NorthboundShooter(double altM = 5000, double speedMps = 250) =>
        new(new Vec3D(0, altM, 0), new Vec3D(0, 0, speedMps));

    static Aim9Pose NorthboundTarget(double rangeM, double altM = 5000, double speedMps = 200) =>
        new(new Vec3D(0, altM, rangeM), new Vec3D(0, 0, speedMps));

    [Fact]
    public void DefaultMagazineIsTwoRounds()
    {
        var aim9 = new Aim9Surrogate();
        Assert.Equal(2, aim9.RoundsRemaining);
    }

    [Fact]
    public void LaunchConsumesOneRoundAndEntersSeeking()
    {
        var aim9 = new Aim9Surrogate(rounds: 2);
        var shooter = NorthboundShooter();
        var target = NorthboundTarget(rangeM: 3000);

        Assert.True(aim9.TryLaunch(shooter, target, nowMs: 0));
        Assert.Equal(1, aim9.RoundsRemaining);
        Assert.Equal(Aim9FlightState.Seeking, aim9.Live.State);
    }

    [Fact]
    public void LaunchFailsWithZeroRounds()
    {
        var aim9 = new Aim9Surrogate(rounds: 0);
        Assert.False(aim9.TryLaunch(NorthboundShooter(), NorthboundTarget(3000), nowMs: 0));
        Assert.Equal(Aim9FlightState.Safe, aim9.Live.State);
    }

    [Fact]
    public void LaunchFailsOutsideMaxRange()
    {
        var aim9 = new Aim9Surrogate();
        Assert.False(aim9.TryLaunch(
            NorthboundShooter(),
            NorthboundTarget(rangeM: Aim9Surrogate.MaxLaunchRangeM + 100),
            nowMs: 0));
        Assert.Equal(2, aim9.RoundsRemaining);
    }

    [Fact]
    public void LaunchFailsInsideMinRange()
    {
        var aim9 = new Aim9Surrogate();
        Assert.False(aim9.TryLaunch(
            NorthboundShooter(),
            NorthboundTarget(rangeM: Aim9Surrogate.MinLaunchRangeM - 50),
            nowMs: 0));
        Assert.Equal(2, aim9.RoundsRemaining);
    }

    [Fact]
    public void FirstSeekerStepTransitionsSeekingToTracking()
    {
        var aim9 = new Aim9Surrogate();
        var shooter = NorthboundShooter();
        var target = NorthboundTarget(rangeM: 3000);
        Assert.True(aim9.TryLaunch(shooter, target, nowMs: 0));
        Assert.Equal(Aim9FlightState.Seeking, aim9.Live.State);

        aim9.Step(dt: 1.0 / 60.0, target);
        Assert.Equal(Aim9FlightState.Tracking, aim9.Live.State);
        Assert.True(aim9.Live.BoresightDeg <= 50.0);
    }

    [Fact]
    public void SeekerCanLoseTargetOffBoresight()
    {
        var aim9 = Aim9Surrogate.TestFixture_OffBoresightLoss();
        aim9.Step(dt: 1.0 / 60.0, target: new Aim9Pose(new Vec3D(8000, 5000, 0), Vec3D.Zero));
        Assert.Equal(Aim9FlightState.Lost, aim9.Live.State);
    }

    [Fact]
    public void SeekerCanLoseTargetOnHighTrackRate()
    {
        var aim9 = Aim9Surrogate.TestFixture_HighTrackRateLoss();
        // Lateral jump stays inside boresight but rotates LOS far faster than 18°/s.
        var jinkingTarget = new Aim9Pose(new Vec3D(400, 5000, 2000), new Vec3D(600, 0, 0));
        aim9.Step(dt: 1.0 / 60.0, jinkingTarget);
        Assert.Equal(Aim9FlightState.Lost, aim9.Live.State);
        Assert.True(aim9.Live.BoresightDeg <= 50.0);
        Assert.True(aim9.Live.TrackRateDegPerSec > 18.0);
    }

    [Fact]
    public void FlightExpiresAtTimeCap()
    {
        var aim9 = new Aim9Surrogate();
        var target = NorthboundTarget(rangeM: 3000);
        Assert.True(aim9.TryLaunch(NorthboundShooter(), target, nowMs: 0));

        aim9.Step(dt: 30.0, target);
        Assert.Equal(Aim9FlightState.Expired, aim9.Live.State);
    }

    [Fact]
    public void TrackingMissileDetonatesOnProximity()
    {
        var aim9 = Aim9Surrogate.TestFixture_ProximityHit();
        aim9.Step(dt: 1.0 / 60.0, target: aim9.FixtureTarget);
        Assert.Equal(Aim9FlightState.Detonated, aim9.Live.State);
    }

    [Fact]
    public void SecondLaunchAllowedAfterTerminalState()
    {
        var aim9 = new Aim9Surrogate(rounds: 2);
        var shooter = NorthboundShooter();
        var target = NorthboundTarget(3000);
        Assert.True(aim9.TryLaunch(shooter, target, nowMs: 0));

        for (int i = 0; i < 2400 && aim9.Live.State is Aim9FlightState.Seeking or Aim9FlightState.Tracking; i++)
            aim9.Step(1.0 / 60.0, target);

        Assert.True(aim9.Live.State is Aim9FlightState.Detonated or Aim9FlightState.Expired or Aim9FlightState.Lost);
        Assert.True(aim9.TryLaunch(shooter, target, nowMs: 40_000));
        Assert.Equal(0, aim9.RoundsRemaining);
        Assert.Equal(Aim9FlightState.Seeking, aim9.Live.State);
    }
}
