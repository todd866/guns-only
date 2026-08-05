using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Deterministic straight-line weave probe: run to a target speed, settle, kick the bars with a
/// short steer pulse, and classify whether the lean oscillation damps, sustains, or grows.
/// Assisted mode mirrors <see cref="WeekendRideMissionRuntime"/>'s controller wiring exactly
/// (lean rate from BodyRates.P, pitch rate fed as zero) so the probe measures the live loop.
/// </summary>
public sealed class YzfR1StabilityProbeTests
{
    readonly ITestOutputHelper _output;

    public YzfR1StabilityProbeTests(ITestOutputHelper output) => _output = output;

    static readonly double[] ProbeSpeedsKmh = [60.0, 100.0, 150.0, 200.0, 250.0];

    const double FixedDeltaSeconds = PlayerVehicleContract.FixedDeltaSeconds;
    const int SettleTicks = 300;
    const int PulseTicks = 10;
    const double PulseMagnitude = 0.05;
    const int RecordTicks = 960;
    // Extrema below this floor are numeric noise, not weave (0.011 deg of lean).
    const double AmplitudeFloorRad = 2.0e-4;

    internal readonly record struct WeaveSummary(
        double SpeedKmh,
        bool Assisted,
        double AchievedSpeedMps,
        double FirstPeakRad,
        double WorstPerCycleRatio,
        int ExtremaCount,
        bool TippedOver);

    [Fact]
    public void AssistedWeavePulseDampsAtAllProbedSpeeds()
    {
        var summaries = new List<WeaveSummary>();
        foreach (double speedKmh in ProbeSpeedsKmh)
        {
            WeaveSummary summary = RunWeaveProbe(speedKmh, assisted: true);
            _output.WriteLine(Describe(summary));
            summaries.Add(summary);
        }
        foreach (WeaveSummary summary in summaries)
        {
            Assert.False(summary.TippedOver,
                $"assisted {summary.SpeedKmh:F0} km/h probe crashed before classification");
            Assert.True(summary.WorstPerCycleRatio < 0.5,
                $"assisted {summary.SpeedKmh:F0} km/h weave must damp (per-cycle amplitude "
                + $"ratio < 0.5): ratio={summary.WorstPerCycleRatio:F3}, "
                + $"firstPeak={summary.FirstPeakRad * 180.0 / Math.PI:F2} deg, "
                + $"extrema={summary.ExtremaCount}");
        }
    }

    [Fact]
    public void RawWeavePulseNeverGrowsAtAnyProbedSpeed()
    {
        var summaries = new List<WeaveSummary>();
        foreach (double speedKmh in ProbeSpeedsKmh)
        {
            WeaveSummary summary = RunWeaveProbe(speedKmh, assisted: false);
            _output.WriteLine(Describe(summary));
            summaries.Add(summary);
        }
        foreach (WeaveSummary summary in summaries)
        {
            Assert.False(summary.TippedOver,
                $"raw {summary.SpeedKmh:F0} km/h probe crashed before classification");
            Assert.True(summary.WorstPerCycleRatio <= 1.0,
                $"raw {summary.SpeedKmh:F0} km/h weave must never grow: "
                + $"ratio={summary.WorstPerCycleRatio:F3}, "
                + $"firstPeak={summary.FirstPeakRad * 180.0 / Math.PI:F2} deg");
            Assert.True(summary.FirstPeakRad < 0.12,
                $"raw {summary.SpeedKmh:F0} km/h pulse response should stay mild: "
                + $"firstPeak={summary.FirstPeakRad * 180.0 / Math.PI:F2} deg");
        }
    }

    static string Describe(in WeaveSummary s) =>
        $"{(s.Assisted ? "assisted" : "raw     ")} {s.SpeedKmh,5:F0} km/h "
        + $"(achieved {s.AchievedSpeedMps * 3.6,5:F1}): firstPeak="
        + $"{s.FirstPeakRad * 180.0 / Math.PI,6:F2} deg, perCycleRatio="
        + $"{s.WorstPerCycleRatio:F3}, extrema={s.ExtremaCount}, tipped={s.TippedOver}";

    internal static WeaveSummary RunWeaveProbe(double speedKmh, bool assisted)
    {
        double targetMps = speedKmh / 3.6;
        var bike = YzfR1Dynamics.AtRestOnRunway(
            $"weave-{(assisted ? "assist" : "raw")}-{speedKmh:F0}",
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);
        var controller = new MotorcycleRiderController();
        long tick = 0;

        // Ramp: capped throttle with the rider on the tank so a lift-capable dynamics build
        // (pitch states landed with the wheelie work) cannot loop the probe rig.
        long rampGuard = 120 * 90;
        while (bike.Telemetry.SpeedMps < targetMps - 0.25 && tick < rampGuard)
        {
            double error = targetMps - bike.Telemetry.SpeedMps;
            double throttle = bike.Telemetry.SpeedMps < targetMps * 0.9
                ? Math.Min(0.65, error)
                : Math.Clamp(error, 0.0, 0.85);
            Step(bike, controller, assisted, tick++, throttle, steerOrTurn: 0.0,
                foreAft: 1.0);
            if (bike.Telemetry.IsTippedOver)
                return new WeaveSummary(speedKmh, assisted, bike.Telemetry.SpeedMps,
                    0.0, double.PositiveInfinity, 0, true);
        }
        Assert.True(bike.Telemetry.SpeedMps >= targetMps - 1.0,
            $"probe never reached {targetMps:F1} m/s, got {bike.Telemetry.SpeedMps:F1}");

        // Settle straight and neutral, then pulse, then record.
        for (int i = 0; i < SettleTicks; i++)
            Step(bike, controller, assisted, tick++, HoldThrottle(bike, targetMps), 0.0, 0.0);
        for (int i = 0; i < PulseTicks; i++)
            Step(bike, controller, assisted, tick++, HoldThrottle(bike, targetMps),
                PulseMagnitude, 0.0);

        double[] leanSeries = new double[RecordTicks];
        bool tipped = false;
        for (int i = 0; i < RecordTicks; i++)
        {
            Step(bike, controller, assisted, tick++, HoldThrottle(bike, targetMps), 0.0, 0.0);
            leanSeries[i] = bike.Telemetry.LeanRad;
            if (bike.Telemetry.IsTippedOver)
            {
                tipped = true;
                break;
            }
        }

        (double firstPeak, double worstRatio, int extremaCount) = ClassifyWeave(leanSeries);
        return new WeaveSummary(
            speedKmh, assisted, bike.Telemetry.SpeedMps, firstPeak, worstRatio,
            extremaCount, tipped);
    }

    static double HoldThrottle(YzfR1Dynamics bike, double targetMps) =>
        Math.Clamp(targetMps - bike.Telemetry.SpeedMps, 0.0, 0.85);

    static void Step(
        YzfR1Dynamics bike,
        MotorcycleRiderController controller,
        bool assisted,
        long tick,
        double throttle,
        double steerOrTurn,
        double foreAft)
    {
        MotorcyclePilotCommand command;
        if (assisted)
        {
            MotorcycleTelemetry telemetry = bike.Telemetry;
            // Mirrors WeekendRideMissionRuntime.StepFixed(intent) feedback wiring exactly.
            var feedback = new MotorcycleRiderFeedback(
                telemetry.SpeedMps,
                telemetry.LeanRad,
                bike.State.BodyRates.P,
                telemetry.PitchRad,
                PitchRateRadPerSec: 0.0,
                telemetry.FrontGripUse,
                telemetry.RearGripUse,
                telemetry.WheelieBalance,
                telemetry.StoppieBalance,
                telemetry.IsSliding);
            var intent = new MotorcycleRiderIntent(
                throttle, 0.0, steerOrTurn, 0.0, foreAft, 0, 1.0, MotorcycleClutchMode.Auto);
            command = controller.Step(intent, feedback, MotorcycleControlMode.Assisted);
        }
        else
        {
            command = new MotorcyclePilotCommand(
                throttle, 0.0, steerOrTurn, 0.0, foreAft, 0, 1.0, MotorcycleClutchMode.Auto);
        }
        bike.Advance(YzfR1TestInput.Of(tick, command));
    }

    /// <summary>
    /// Finds post-pulse lean extrema about the terminal mean and returns the first peak, the
    /// worst per-cycle (same-sign extremum to next same-sign extremum) amplitude ratio, and
    /// the extrema count. Fewer than three extrema means the response is monotone-damped.
    /// </summary>
    internal static (double FirstPeakRad, double WorstPerCycleRatio, int ExtremaCount)
        ClassifyWeave(double[] leanSeries)
    {
        int tail = Math.Max(1, leanSeries.Length / 8);
        double mean = 0.0;
        for (int i = leanSeries.Length - tail; i < leanSeries.Length; i++)
            mean += leanSeries[i];
        mean /= tail;

        List<double> extrema = [];
        double candidate = 0.0;
        int direction = 0;
        double previous = leanSeries[0] - mean;
        for (int i = 1; i < leanSeries.Length; i++)
        {
            double value = leanSeries[i] - mean;
            int step = Math.Sign(value - previous);
            if (step != 0 && direction != 0 && step != direction
                && Math.Abs(candidate) >= AmplitudeFloorRad)
                extrema.Add(candidate);
            if (step != 0)
                direction = step;
            candidate = value;
            previous = value;
        }

        double firstPeak = extrema.Count > 0 ? Math.Abs(extrema[0]) : 0.0;
        double worstRatio = 0.0;
        for (int i = 0; i + 2 < extrema.Count && i < 8; i++)
        {
            double from = Math.Abs(extrema[i]);
            double to = Math.Abs(extrema[i + 2]);
            if (from >= AmplitudeFloorRad * 4.0)
                worstRatio = Math.Max(worstRatio, to / from);
        }
        return (firstPeak, worstRatio, extrema.Count);
    }
}
