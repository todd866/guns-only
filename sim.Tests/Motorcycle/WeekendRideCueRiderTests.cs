using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class WeekendRideCueRiderTests
{
    const int MaxTicks = 8 * 60 * 120;

    [Fact]
    public void CueRiderCompletesTheArcFromAColdStart()
    {
        RideResult result = Ride(seedSeconds: null);
        AssertPass(result);
        Assert.True(result.OpeningStraightFasterThanHairpin);
        Assert.True(result.FlyingLapsStayedOnTrack);
        Assert.Equal(0, result.TipCount);
        Assert.Equal(0.0, result.OffTrackSeconds);
        Assert.True(result.CleanFlyingLaps >= 2, $"clean flying laps {result.CleanFlyingLaps}");
        Assert.True(
            result.ApexSamples >= 2,
            $"apex samples {result.ApexSamples}");
        Assert.True(
            result.ApexSpeedWithinCue,
            $"apex speed missed the displayed cue by {result.WorstApexMissMps:F1} m/s");
    }

    [Fact]
    public void CueRiderBeatsASlowSeedAndStillStops()
    {
        RideResult result = Ride(seedSeconds: 600.0);
        AssertPass(result);
        Assert.NotNull(result.BestLapSeconds);
        Assert.True(result.BestLapSeconds < 600.0);
        Assert.False(result.CameInEarly);
        Assert.False(result.HadHotPitEntry);
        Assert.True(result.CleanFlyingLaps >= 1);
    }

    static void AssertPass(RideResult result)
    {
        Assert.True(result.Finished, result.Failure);
        Assert.True(result.LegalStop);
        Assert.True(result.LapCount >= 2);
        Assert.Equal(WeekendRideSessionLeg.Cooldown, result.SessionLeg);
        Assert.True(result.SawCooldown);
        Assert.True(result.SessionSeconds < 8 * 60.0, $"session {result.SessionSeconds:F0}s");
    }

    static RideResult Ride(double? seedSeconds)
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        if (seedSeconds is double seed)
        {
            var profile = new double[RideLapTiming.SplitSampleCount];
            for (int i = 0; i < profile.Length; i++)
                profile[i] = seed * i / (profile.Length - 1);
            Assert.True(runtime.SeedBestLap(seed, profile));
        }

        var rider = new WeekendRideCueRider();
        double hairpinMps = runtime.NextApex.SteadySpeedMps;
        double peakOpening = 0.0;
        bool flyingClean = true;
        bool sawCooldown = false;
        bool opened = false;
        int apexSamples = 0;
        double worstApexMissMps = 0.0;
        bool approaching = false;
        double approachCueMps = 0.0;
        double approachSpeedMps = 0.0;
        for (int tick = 0; tick < MaxTicks && runtime.Phase == WeekendRidePhase.Active; tick++)
        {
            if (runtime.SessionLeg == WeekendRideSessionLeg.Flying)
            {
                if (runtime.LapCount == 0 && runtime.ProgressM < 250.0)
                {
                    peakOpening = Math.Max(peakOpening, runtime.Bike.Telemetry.SpeedMps);
                    if (runtime.Bike.Telemetry.SpeedMps > 8.0)
                        opened = true;
                }
                if (opened && !runtime.IsOnTrack)
                    flyingClean = false;

                CircuitApexReference apex = runtime.NextApex;
                if (!apex.ReportingExit && apex.DistanceM < 20.0 && apex.SteadySpeedMps > 1.0)
                {
                    approaching = true;
                    approachCueMps = apex.SteadySpeedMps;
                    approachSpeedMps = runtime.Bike.Telemetry.SpeedMps;
                }
                else if (approaching)
                {
                    approaching = false;
                    apexSamples++;
                    worstApexMissMps = Math.Max(
                        worstApexMissMps,
                        Math.Abs(approachSpeedMps - approachCueMps));
                }
            }
            else
                sawCooldown = true;

            rider.Step(runtime);
        }

        return new RideResult(
            runtime.Phase == WeekendRidePhase.Finished,
            runtime.LegalStop,
            runtime.LapCount,
            runtime.SessionLeg,
            sawCooldown,
            runtime.SessionSeconds,
            peakOpening > hairpinMps,
            flyingClean,
            runtime.BestLapSeconds,
            runtime.CameInEarly,
            runtime.HadHotPitEntry,
            runtime.CleanFlyingLaps,
            runtime.TipCount,
            runtime.OffTrackSeconds,
            apexSamples,
            worstApexMissMps <= 4.0,
            worstApexMissMps,
            $"phase {runtime.Phase} laps {runtime.LapCount} leg {runtime.SessionLeg} "
            + $"t {runtime.SessionSeconds:F0}s progress {runtime.ProgressM:F0} "
            + $"inPit {runtime.InPit} legalStop {runtime.LegalStop} "
            + $"speed {runtime.Bike.Telemetry.SpeedMps:F1} tips {runtime.TipCount} "
            + $"off {runtime.OffTrackSeconds:F1}");
    }

    readonly record struct RideResult(
        bool Finished,
        bool LegalStop,
        int LapCount,
        WeekendRideSessionLeg SessionLeg,
        bool SawCooldown,
        double SessionSeconds,
        bool OpeningStraightFasterThanHairpin,
        bool FlyingLapsStayedOnTrack,
        double? BestLapSeconds,
        bool CameInEarly,
        bool HadHotPitEntry,
        int CleanFlyingLaps,
        int TipCount,
        double OffTrackSeconds,
        int ApexSamples,
        bool ApexSpeedWithinCue,
        double WorstApexMissMps,
        string Failure);
}
