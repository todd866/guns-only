using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Deterministic raw-mode straight-line test rider. With real wheel-lift dynamics a raw WOT
/// launch in 1st loops the bike over (the real machine relies on lift-control electronics and
/// rider throttle discipline), so ramps that only need to reach a speed ride like a drag-strip
/// test rider: chest on the tank, short-shifting before the front wheel carries. All decisions
/// read only bike telemetry, so identical runs produce identical command streams.
/// </summary>
internal static class YzfR1TestRider
{
    // Above the largest grounded suspension squat (~0.045 rad) so only genuine wheel lift
    // triggers the shift, and far below the ~0.79 rad balance point.
    const double LiftImminentPitchRad = 0.055;
    const double ShortShiftRpm = 10_500.0;

    public static MotorcyclePilotCommand NextStraightLineCommand(
        YzfR1Dynamics bike,
        double throttle = 1.0)
    {
        MotorcycleTelemetry telemetry = bike.Telemetry;
        // Shift the moment the front actually carries (pitch clears the suspension band):
        // holding the gear to that point keeps the sprint honest — front skimming, exactly
        // like a real launch — while the upshift lands long before the balance point.
        bool liftImminent = telemetry.PitchRad > LiftImminentPitchRad;
        bool revCeiling = telemetry.Rpm > ShortShiftRpm;
        int gearShiftRequest = (liftImminent || revCeiling)
            && telemetry.Gear < YzfR1Definition.GearCount ? 1 : 0;
        return new MotorcyclePilotCommand(
            throttle,
            0.0,
            0.0,
            0.0,
            RiderForeAft: 1.0,
            gearShiftRequest,
            1.0,
            MotorcycleClutchMode.Auto);
    }

    public static long ShortShiftAccelerateTo(
        YzfR1Dynamics bike,
        double targetSpeedMps,
        long startTick,
        PlayerVehicleEnvironmentSample? environment = null,
        double throttle = 1.0)
    {
        long tick = startTick;
        long guard = startTick + 120 * 90;
        while (bike.Telemetry.SpeedMps < targetSpeedMps
            && tick < guard
            && !bike.Telemetry.IsTippedOver)
            bike.Advance(YzfR1TestInput.Of(
                tick++,
                NextStraightLineCommand(bike, throttle),
                environment));
        Assert.False(bike.Telemetry.IsTippedOver,
            "managed ramp must not crash the bike");
        Assert.True(bike.Telemetry.SpeedMps >= targetSpeedMps,
            $"ramp never reached {targetSpeedMps:F1} m/s, got {bike.Telemetry.SpeedMps:F1}");
        return tick;
    }

    /// <summary>
    /// Holds a command until the bike stops, tips, or the guard expires; returns the peak
    /// 0.25 s windowed deceleration measured after the first half second. The settle delay
    /// and window reject the suspension-dive damper spike so the pin reads the sustained
    /// stoppie/grip-limited phase (front grip cap plus aero drag on top).
    /// </summary>
    public static (double PeakWindowedDecelMps2, long EndTick) HoldBrakeAndMeasure(
        YzfR1Dynamics bike,
        MotorcyclePilotCommand brakeCommand,
        long startTick,
        long maxTicks)
    {
        const int windowTicks = 30;
        const int settleTicks = 36;
        var speeds = new List<double> { bike.Telemetry.SpeedMps };
        long tick = startTick;
        double peakWindowedDecelMps2 = 0.0;
        for (long i = 0; i < maxTicks; i++)
        {
            if (bike.Telemetry.IsTippedOver || bike.Telemetry.SpeedMps <= 0.1)
                break;
            bike.Advance(YzfR1TestInput.Of(tick++, brakeCommand));
            speeds.Add(bike.Telemetry.SpeedMps);
            if (speeds.Count > settleTicks + windowTicks && !bike.Telemetry.IsTippedOver)
            {
                double windowedDecelMps2 =
                    (speeds[^(windowTicks + 1)] - speeds[^1])
                    * PlayerVehicleContract.FixedStepHz / windowTicks;
                peakWindowedDecelMps2 = Math.Max(peakWindowedDecelMps2, windowedDecelMps2);
            }
        }
        return (peakWindowedDecelMps2, tick);
    }

    public static long ShortShiftAccelerateTicks(
        YzfR1Dynamics bike,
        long startTick,
        long tickCount,
        PlayerVehicleEnvironmentSample? environment = null,
        double throttle = 1.0)
    {
        long tick = startTick;
        for (; tick < startTick + tickCount; tick++)
            bike.Advance(YzfR1TestInput.Of(
                tick,
                NextStraightLineCommand(bike, throttle),
                environment));
        return tick;
    }
}
