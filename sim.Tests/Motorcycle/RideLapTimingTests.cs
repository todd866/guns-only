using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Lap timing is driven by synthetic circuit samples, exactly as PaintedCircuitTests drives
/// the circuit itself. That keeps the timing contract testable without riding a 3 km lap or
/// teleporting the bike, and it means no debug hooks leak into the production runtime.
/// </summary>
public sealed class RideLapTimingTests
{
    const double Dt = 1.0 / 120.0;

    static PaintedCircuitQueryResult Sample(
        bool onTrack = true,
        bool crossedStartFinish = false,
        double progressM = 0.0,
        int sectorCrossed = -1) =>
        new(onTrack, progressM, 0, crossedStartFinish, sectorCrossed);

    /// <summary>Runs one lap of the given duration, optionally putting a wheel in the dirt.</summary>
    static void RideLap(RideLapTiming timing, double seconds, bool offTrack)
    {
        int steps = (int)Math.Round(seconds / Dt);
        for (int step = 0; step < steps; step++)
        {
            bool onTrack = !(offTrack && step == steps / 2);
            timing.Advance(Sample(onTrack: onTrack), timingActive: true, tippedOver: false, Dt);
        }
        timing.Advance(Sample(crossedStartFinish: true), true, false, Dt);
    }

    [Fact]
    public void CrossingTheLineKeepsTheLapInsteadOfThrowingItAway()
    {
        var timing = new RideLapTiming();

        RideLap(timing, 90.0, offTrack: false);

        Assert.Equal(90.0, timing.LastLapSeconds, 1);
        Assert.NotNull(timing.BestLapSeconds);
        Assert.Equal(90.0, timing.BestLapSeconds!.Value, 1);
        Assert.Single(timing.CompletedLapSeconds);
        Assert.Equal(0.0, timing.CurrentLapSeconds, 6);
        Assert.True(timing.CurrentLapValid, "A fresh lap starts clean.");
    }

    [Fact]
    public void AnOffTrackLapNeverBecomesTheBestHoweverFastItWas()
    {
        var timing = new RideLapTiming();

        RideLap(timing, 90.0, offTrack: false);
        double? cleanBest = timing.BestLapSeconds;
        RideLap(timing, 60.0, offTrack: true);

        Assert.Equal(cleanBest!.Value, timing.BestLapSeconds!.Value, 6);
        Assert.Equal(60.0, timing.LastLapSeconds, 1);
        Assert.Equal(2, timing.CompletedLapSeconds.Count);
    }

    [Fact]
    public void AFasterCleanLapTakesTheBest()
    {
        var timing = new RideLapTiming();

        RideLap(timing, 90.0, offTrack: false);
        RideLap(timing, 75.0, offTrack: false);

        Assert.Equal(75.0, timing.BestLapSeconds!.Value, 1);
    }

    [Fact]
    public void TippingOverInvalidatesTheLapInProgress()
    {
        var timing = new RideLapTiming();

        timing.Advance(Sample(), timingActive: true, tippedOver: false, Dt);
        Assert.True(timing.CurrentLapValid);
        timing.Advance(Sample(), timingActive: true, tippedOver: true, Dt);

        Assert.False(timing.CurrentLapValid);
    }

    [Fact]
    public void TimeOnlyAccumulatesWhileTimingIsActive()
    {
        var timing = new RideLapTiming();

        for (int step = 0; step < 120; step++)
            timing.Advance(Sample(), timingActive: false, tippedOver: false, Dt);

        Assert.Equal(0.0, timing.CurrentLapSeconds, 6);
    }
}
