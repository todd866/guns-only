using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class F14WingSweepTests
{
    [Fact]
    public void SweepIncreasesWithMach()
    {
        double slow = F14WingSweep.DegreesFor(mach: 0.5, casKts: 300);
        double fast = F14WingSweep.DegreesFor(mach: 1.2, casKts: 500);
        Assert.True(fast > slow);
    }

    [Fact]
    public void SweepClampsToPublishedEnvelope()
    {
        double min = F14WingSweep.DegreesFor(mach: 0.2, casKts: 150);
        double max = F14WingSweep.DegreesFor(mach: 1.4, casKts: 600);
        Assert.InRange(min, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        Assert.InRange(max, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        Assert.Equal(F14WingSweep.MinSweepDeg, min);
        Assert.Equal(F14WingSweep.MaxSweepDeg, max);
    }
}
