using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra.GroundWar;

public sealed class CobraTurretMagazineTests
{
    const double FixedDelta = 1.0 / 120.0;

    [Fact]
    public void FixedStepFireConsumesTheAuthoredRateNotOneRoundPerTick()
    {
        // Regression: Math.Max(1, ...) in TryConsumeWhileFiring forced >=1 round per 120 Hz tick,
        // so a 45 rps magazine actually fired 120 rps and drained in 7.5 s instead of 20 s.
        var magazine = new CobraTurretMagazine(
            capacityRounds: 900,
            fireRateRoundsPerSecond: 45.0);

        int expended = 0;
        for (int tick = 0; tick < 120; tick++)
            expended += magazine.TryConsumeWhileFiring(FixedDelta);

        Assert.Equal(45, expended);
        Assert.Equal(900 - 45, magazine.RoundsRemaining);
    }

    [Fact]
    public void MagazineEnduresTheAuthoredTwentySecondsOfContinuousFire()
    {
        var magazine = new CobraTurretMagazine(
            capacityRounds: 900,
            fireRateRoundsPerSecond: 45.0);

        for (int tick = 0; tick < 120 * 10; tick++)
            magazine.TryConsumeWhileFiring(FixedDelta);
        Assert.Equal(450, magazine.RoundsRemaining);
        Assert.False(magazine.IsDry);

        for (int tick = 0; tick < 120 * 10; tick++)
            magazine.TryConsumeWhileFiring(FixedDelta);
        Assert.True(magazine.IsDry);
    }

    [Fact]
    public void OneFullSecondCallStillConsumesTheWholeAuthoredRate()
    {
        var magazine = new CobraTurretMagazine(
            capacityRounds: 900,
            fireRateRoundsPerSecond: 45.0);

        int expended = magazine.TryConsumeWhileFiring(1.0);

        Assert.Equal(45, expended);
    }

    [Fact]
    public void SubRateWindowDoesNotInventRoundsButTheResidueIsNotLost()
    {
        var magazine = new CobraTurretMagazine(
            capacityRounds: 900,
            fireRateRoundsPerSecond: 45.0);

        // 45 rps at 240 Hz is 0.1875 rounds per window: no whole round may be consumed yet.
        Assert.Equal(0, magazine.TryConsumeWhileFiring(1.0 / 240.0));

        int expended = 0;
        for (int tick = 0; tick < 240; tick++)
            expended += magazine.TryConsumeWhileFiring(1.0 / 240.0);
        Assert.Equal(45, expended);
    }

    [Fact]
    public void DryMagazineStopsConsumptionExactlyAtCapacity()
    {
        var magazine = new CobraTurretMagazine(
            capacityRounds: 10,
            fireRateRoundsPerSecond: 45.0);

        int expended = 0;
        for (int tick = 0; tick < 120 * 5 && !magazine.IsDry; tick++)
            expended += magazine.TryConsumeWhileFiring(FixedDelta);

        Assert.Equal(10, expended);
        Assert.Equal(0, magazine.TryConsumeWhileFiring(FixedDelta));
    }
}
