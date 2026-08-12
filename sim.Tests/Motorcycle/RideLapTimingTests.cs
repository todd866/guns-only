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

    /// <summary>Rides a lap of `seconds`, crossing all four authored sector gates evenly.</summary>
    static void RideSectoredLap(RideLapTiming timing, double seconds, double lapLengthM)
    {
        int steps = (int)Math.Round(seconds / Dt);
        int nextGate = 0;
        for (int step = 0; step < steps; step++)
        {
            double fraction = (double)step / steps;
            double progressM = fraction * lapLengthM;
            int sectorCrossed = -1;
            if (nextGate < 3 && fraction >= 0.25 * (nextGate + 1))
                sectorCrossed = nextGate++;
            timing.Advance(
                Sample(progressM: progressM, sectorCrossed: sectorCrossed),
                true, false, Dt, lapLengthM);
        }
        timing.Advance(
            Sample(crossedStartFinish: true, progressM: lapLengthM),
            true, false, Dt, lapLengthM);
    }

    [Fact]
    public void TheFourSectorTimesAccountForTheWholeLap()
    {
        const double lapLengthM = 4_000.0;
        var timing = new RideLapTiming();

        RideSectoredLap(timing, 80.0, lapLengthM);

        Assert.Equal(RideLapTiming.SectorCount, timing.LastLapSectorSeconds.Count);
        double summed = 0.0;
        foreach (double sector in timing.LastLapSectorSeconds) summed += sector;
        Assert.Equal(timing.LastLapSeconds, summed, 2);
        foreach (double? best in timing.BestSectorSeconds) Assert.NotNull(best);
    }

    [Fact]
    public void TheDeltaIsNegativeWhenAheadOfTheBestPaceAndNullWithoutOne()
    {
        const double lapLengthM = 4_000.0;
        var timing = new RideLapTiming();
        Assert.Null(timing.DeltaToBestSeconds(0.5 * lapLengthM, lapLengthM));

        RideSectoredLap(timing, 80.0, lapLengthM);   // the benchmark: 80 s, even pace

        // Half way round having spent only 30 s: comfortably ahead of a 40 s half-lap.
        for (int step = 0; step < (int)Math.Round(30.0 / Dt); step++)
            timing.Advance(Sample(progressM: 0.5 * lapLengthM), true, false, Dt, lapLengthM);
        double? ahead = timing.DeltaToBestSeconds(0.5 * lapLengthM, lapLengthM);
        Assert.NotNull(ahead);
        Assert.True(ahead!.Value < 0.0, $"expected ahead, got {ahead.Value:F2} s");

        // Same point, but 50 s spent: behind.
        for (int step = 0; step < (int)Math.Round(20.0 / Dt); step++)
            timing.Advance(Sample(progressM: 0.5 * lapLengthM), true, false, Dt, lapLengthM);
        double? behind = timing.DeltaToBestSeconds(0.5 * lapLengthM, lapLengthM);
        Assert.True(behind!.Value > 0.0, $"expected behind, got {behind!.Value:F2} s");
    }

    /// <summary>
    /// The REAL circuit wraps ProgressM to ~0 on the tick it reports CrossedStartFinish
    /// (PaintedCircuit only crosses on wrappedForward). An earlier version of this fixture
    /// passed progressM = lapLength at the line, which hid a profile-flattening bug: the
    /// fill loop wrote the whole lap time into every slot, so the delta compared against
    /// full lap time everywhere. Cross at ~0, like the circuit actually does.
    /// </summary>
    static void RideWrappingLap(RideLapTiming timing, double seconds, double lapLengthM)
    {
        int steps = (int)Math.Round(seconds / Dt);
        int nextGate = 0;
        for (int step = 0; step < steps; step++)
        {
            double fraction = (double)step / steps;
            int sectorCrossed = -1;
            if (nextGate < 3 && fraction >= 0.25 * (nextGate + 1))
                sectorCrossed = nextGate++;
            timing.Advance(
                Sample(progressM: fraction * lapLengthM, sectorCrossed: sectorCrossed),
                true, false, Dt, lapLengthM);
        }
        timing.Advance(
            Sample(crossedStartFinish: true, progressM: 0.0), true, false, Dt, lapLengthM);
    }

    [Fact]
    public void TheBestProfileSurvivesTheProgressWrapAtTheLine()
    {
        const double lapLengthM = 4_000.0;
        var timing = new RideLapTiming();

        RideWrappingLap(timing, 80.0, lapLengthM);

        // Half a lap into the benchmark should read about half its time. A flattened profile
        // reads the FULL lap time at every point, which makes every delta nonsense.
        for (int step = 0; step < (int)Math.Round(40.0 / Dt); step++)
            timing.Advance(Sample(progressM: 0.5 * lapLengthM), true, false, Dt, lapLengthM);
        double? delta = timing.DeltaToBestSeconds(0.5 * lapLengthM, lapLengthM);

        Assert.NotNull(delta);
        Assert.True(Math.Abs(delta!.Value) < 3.0,
            $"Even pace at half distance should be near the best pace; delta {delta.Value:F1} s "
            + "means the best profile was flattened by the wrap at the line.");
    }

    [Fact]
    public void AMissedOrRepeatedSectorGateDoesNotShiftTheOtherSectors()
    {
        const double lapLengthM = 4_000.0;
        var timing = new RideLapTiming();
        int steps = (int)Math.Round(80.0 / Dt);

        for (int step = 0; step < steps; step++)
        {
            double fraction = (double)step / steps;
            // Gate 0 fires twice, gate 1 is missed entirely, gate 2 fires normally.
            int sectorCrossed = -1;
            if (fraction >= 0.25 && fraction < 0.25 + Dt) sectorCrossed = 0;
            else if (fraction >= 0.30 && fraction < 0.30 + Dt) sectorCrossed = 0;
            else if (fraction >= 0.75 && fraction < 0.75 + Dt) sectorCrossed = 2;
            timing.Advance(
                Sample(progressM: fraction * lapLengthM, sectorCrossed: sectorCrossed),
                true, false, Dt, lapLengthM);
        }
        timing.Advance(
            Sample(crossedStartFinish: true, progressM: 0.0), true, false, Dt, lapLengthM);

        // Sector 0 closes at 25%. The repeated gate 0 must be ignored rather than advance
        // the index, and gate 2 arriving while we still await gate 1 must also be ignored —
        // so the unclosed sector 1 absorbs the rest of the lap and sectors 2-3 stay empty.
        Assert.Equal(20.0, timing.LastLapSectorSeconds[0], 0);
        Assert.Equal(60.0, timing.LastLapSectorSeconds[1], 0);
        Assert.Equal(0.0, timing.LastLapSectorSeconds[2], 6);
        Assert.Equal(0.0, timing.LastLapSectorSeconds[3], 6);
        double summed = 0.0;
        foreach (double sector in timing.LastLapSectorSeconds) summed += sector;
        Assert.Equal(timing.LastLapSeconds, summed, 2);
        // A merged sector is not a sector time and must never be recorded as a best.
        foreach (double? best in timing.BestSectorSeconds) Assert.Null(best);
        Assert.NotNull(timing.BestLapSeconds);
    }

    [Fact]
    public void TheSplitProfileSizeMatchesTheStoredRecordContract()
    {
        // web/wwwroot/render/ride/ride_timing_readout.js exports RIDE_SPLIT_SAMPLE_COUNT and
        // ride_best_lap_store.js REJECTS any persisted profile of a different length. If this
        // constant moves without that one, every saved best silently stops loading.
        Assert.Equal(32, RideLapTiming.SplitSampleCount);
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
