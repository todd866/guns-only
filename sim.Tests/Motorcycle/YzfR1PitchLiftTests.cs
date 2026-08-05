using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Wheel-lift pitch dynamics pins: power wheelies about the rear contact patch, brake stoppies
/// about the front, balance points from the sourced geometry (wheelbase 1.405 m, combined CoG
/// height 0.68 m surrogate), raw loop-over/endo crash latches, and the assisted rider's pitch
/// management (allows deliberate lifts, prevents the crash).
/// </summary>
public sealed class YzfR1PitchLiftTests
{
    const double HundredKmhMps = 100.0 / 3.6;
    const double G = 9.80665;
    readonly Xunit.Abstractions.ITestOutputHelper _output;

    public YzfR1PitchLiftTests(Xunit.Abstractions.ITestOutputHelper output) => _output = output;

    static YzfR1Dynamics AtRest(string id) =>
        YzfR1Dynamics.AtRestOnRunway(
            id,
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);

    static MotorcyclePilotCommand Raw(
        double throttle = 0.0,
        double brake = 0.0,
        double foreAft = 0.0,
        int shift = 0) =>
        new(throttle, brake, 0.0, 0.0, foreAft, shift, 1.0, MotorcycleClutchMode.Auto);

    /// <summary>Rolls to ~30 km/h gently (below the lift threshold), still in 1st gear.</summary>
    static long RollToStreetSpeed(YzfR1Dynamics bike)
    {
        long tick = 0;
        var gentle = Raw(throttle: 0.30);
        while (bike.Telemetry.SpeedMps < 30.0 / 3.6 && tick < 120 * 20)
            bike.Advance(YzfR1TestInput.Of(tick++, gentle));
        Assert.True(bike.Telemetry.SpeedMps >= 30.0 / 3.6);
        Assert.Equal(1, bike.Telemetry.Gear);
        return tick;
    }

    [Fact]
    public void RawWotInFirstGearLiftsTheFrontWithinTwoSecondsAtStreetSpeed()
    {
        var bike = AtRest("wheelie-first");
        long tick = RollToStreetSpeed(bike);

        var wot = Raw(throttle: 1.0);
        double peakPitchRad = 0.0;
        double frontNormalAtPeakN = double.MaxValue;
        for (long i = 0; i < 120 * 2 && !bike.Telemetry.IsTippedOver; i++)
        {
            bike.Advance(YzfR1TestInput.Of(tick++, wot));
            if (bike.Telemetry.PitchRad > peakPitchRad)
            {
                peakPitchRad = bike.Telemetry.PitchRad;
                frontNormalAtPeakN = bike.Telemetry.FrontNormalForceN;
            }
        }

        Assert.True(peakPitchRad >= 0.10,
            $"WOT in 1st must loft the front within 2 s: peak pitch="
            + $"{peakPitchRad * 180.0 / Math.PI:F1} deg");
        Assert.True(frontNormalAtPeakN <= 1.0,
            $"a lifted front wheel carries no load: {frontNormalAtPeakN:F1} N");
    }

    [Fact]
    public void RawWotInSecondGearDoesNotPowerWheelie()
    {
        var bike = AtRest("wheelie-second");
        long tick = YzfR1TestRider.ShortShiftAccelerateTo(bike, 50.0 / 3.6, 0);
        // Settle into 2nd gear at light throttle before the attempt (the ladder may hand
        // over in 1st or 3rd depending on where the skim shift landed).
        while (bike.Telemetry.Gear != 2 && tick < 120 * 30)
            bike.Advance(YzfR1TestInput.Of(
                tick++,
                Raw(throttle: 0.2, shift: bike.Telemetry.Gear < 2 ? 1 : -1)));
        for (int i = 0; i < 30; i++)
            bike.Advance(YzfR1TestInput.Of(tick++, Raw(throttle: 0.2)));
        Assert.Equal(2, bike.Telemetry.Gear);

        var wot = Raw(throttle: 1.0);
        double peakPitchRad = 0.0;
        for (long i = 0; i < 120 * 3; i++)
        {
            bike.Advance(YzfR1TestInput.Of(tick++, wot));
            peakPitchRad = Math.Max(peakPitchRad, bike.Telemetry.PitchRad);
        }

        Assert.False(bike.Telemetry.IsTippedOver);
        Assert.True(peakPitchRad < 0.05,
            "2nd-gear power wheelies are marginal/absent on the sourced gearing: "
            + $"peak pitch={peakPitchRad * 180.0 / Math.PI:F1} deg");
    }

    [Fact]
    public void RawWheelieHeldPastBalancePointLoopsOverAndLatches()
    {
        var bike = AtRest("wheelie-loop");
        long tick = RollToStreetSpeed(bike);

        var wot = Raw(throttle: 1.0);
        long guard = 0;
        while (!bike.Telemetry.IsTippedOver && guard++ < 120 * 6)
            bike.Advance(YzfR1TestInput.Of(tick++, wot));

        Assert.True(bike.Telemetry.IsTippedOver,
            "holding WOT past the wheelie balance point in raw mode must loop the bike");
        Assert.False(bike.State.Flyable);

        // The latch holds even with the throttle released.
        bike.Advance(YzfR1TestInput.Of(tick, Raw()));
        Assert.True(bike.Telemetry.IsTippedOver);
    }

    [Fact]
    public void RawCommittedFrontBrakeFromHundredLiftsTheRearIntoAStoppie()
    {
        var bike = AtRest("stoppie");
        long tick = YzfR1TestRider.ShortShiftAccelerateTo(bike, HundredKmhMps, 0);

        var brake = Raw(brake: 1.0);
        double minPitchRad = 0.0;
        double rearNormalAtMinN = double.MaxValue;
        for (long i = 0; i < 120 * 2 && !bike.Telemetry.IsTippedOver; i++)
        {
            bike.Advance(YzfR1TestInput.Of(tick++, brake));
            if (bike.Telemetry.PitchRad < minPitchRad)
            {
                minPitchRad = bike.Telemetry.PitchRad;
                rearNormalAtMinN = bike.Telemetry.RearNormalForceN;
            }
        }

        Assert.True(minPitchRad <= -0.08,
            $"committed front brake from 100 km/h must lift the rear: min pitch="
            + $"{minPitchRad * 180.0 / Math.PI:F1} deg");
        Assert.True(rearNormalAtMinN <= 1.0,
            $"a lifted rear wheel carries no load: {rearNormalAtMinN:F1} N");
    }

    [Fact]
    public void RawFullBrakeHeldToTheEndEndosPastTheCriticalAngle()
    {
        var bike = AtRest("endo");
        long tick = YzfR1TestRider.ShortShiftAccelerateTo(bike, HundredKmhMps, 0);

        var brake = Raw(brake: 1.0);
        long guard = 0;
        while (!bike.Telemetry.IsTippedOver && guard++ < 120 * 5)
            bike.Advance(YzfR1TestInput.Of(tick++, brake));

        Assert.True(bike.Telemetry.IsTippedOver,
            "full front brake held to the end in raw mode must endo");
        Assert.False(bike.State.Flyable);
    }

    [Fact]
    public void RawBrakingPeakDecelerationIsStoppieLimitedNearOneG()
    {
        var bike = AtRest("stoppie-decel");
        long tick = YzfR1TestRider.ShortShiftAccelerateTo(bike, HundredKmhMps, 0);

        // The post-dive 0.25 s window rejects the suspension damper spike; the pin reads the
        // sustained stoppie/grip-limited phase: the ~1.08 g front grip cap plus aero drag.
        (double windowedPeakDecelMps2, _) = YzfR1TestRider.HoldBrakeAndMeasure(
            bike, Raw(brake: 1.0), tick, maxTicks: 120 * 3);

        Assert.InRange(windowedPeakDecelMps2, 0.98 * G, 1.15 * G);
    }

    [Fact]
    public void AssistedWotFromRestAcceleratesHardWithoutLoopingOver()
    {
        var bike = AtRest("assist-wot");
        var controller = new MotorcycleRiderController();
        double peakPitchRad = 0.0;
        for (long tick = 0; tick < 120 * 8; tick++)
        {
            StepAssisted(bike, controller, tick, throttle: 1.0, brake: 0.0, foreAft: 0.0);
            peakPitchRad = Math.Max(peakPitchRad, bike.Telemetry.PitchRad);
            Assert.False(bike.Telemetry.IsTippedOver,
                $"assisted WOT must never loop the bike (tick {tick}, pitch "
                + $"{bike.Telemetry.PitchRad * 180.0 / Math.PI:F1} deg)");
        }

        Assert.True(bike.Telemetry.SpeedMps >= 22.0,
            $"the assist manages lift, it does not kill drive: {bike.Telemetry.SpeedMps:F1} m/s");
        Assert.True(peakPitchRad < 0.45,
            $"assisted pitch stays far from loop-over: {peakPitchRad * 180.0 / Math.PI:F1} deg");
    }

    [Fact]
    public void AssistedDeliberateWheelieLoftsThenRecovers()
    {
        var bike = AtRest("assist-wheelie");
        var controller = new MotorcycleRiderController();
        long tick = 0;
        while (bike.Telemetry.SpeedMps < 40.0 / 3.6 && tick < 120 * 20)
            StepAssisted(bike, controller, tick++, throttle: 0.5, brake: 0.0, foreAft: 0.0);

        double peakPitchRad = 0.0;
        for (long i = 0; i < 120 * 4; i++)
        {
            StepAssisted(bike, controller, tick++, throttle: 1.0, brake: 0.0, foreAft: -1.0);
            peakPitchRad = Math.Max(peakPitchRad, bike.Telemetry.PitchRad);
            Assert.False(bike.Telemetry.IsTippedOver);
        }
        Assert.True(peakPitchRad >= 0.12,
            "arrow-back + WOT must loft a deliberate assisted wheelie: peak="
            + $"{peakPitchRad * 180.0 / Math.PI:F1} deg");
        Assert.True(peakPitchRad < 0.45,
            $"the assist caps pitch before loop-over: {peakPitchRad * 180.0 / Math.PI:F1} deg");

        for (long i = 0; i < 120 * 2; i++)
            StepAssisted(bike, controller, tick++, throttle: 0.0, brake: 0.0, foreAft: 0.0);
        Assert.True(bike.Telemetry.PitchRad < 0.05,
            $"released wheelie must touch down: {bike.Telemetry.PitchRad * 180.0 / Math.PI:F1} deg");
        Assert.False(bike.Telemetry.IsTippedOver);
    }

    [Fact]
    public void AssistedFullBrakeReleasesBeforeTheEndo()
    {
        var bike = AtRest("assist-brake");
        var controller = new MotorcycleRiderController();
        long tick = 0;
        while (bike.Telemetry.SpeedMps < HundredKmhMps && tick < 120 * 30)
            StepAssisted(bike, controller, tick++, throttle: 1.0, brake: 0.0, foreAft: 0.0);

        double minPitchRad = 0.0;
        long guard = 0;
        while (bike.Telemetry.SpeedMps > 0.5 && guard++ < 120 * 10)
        {
            StepAssisted(bike, controller, tick++, throttle: 0.0, brake: 1.0, foreAft: 0.0);
            minPitchRad = Math.Min(minPitchRad, bike.Telemetry.PitchRad);
            Assert.False(bike.Telemetry.IsTippedOver,
                $"assisted braking must never endo (pitch "
                + $"{bike.Telemetry.PitchRad * 180.0 / Math.PI:F1} deg)");
        }

        Assert.True(bike.Telemetry.SpeedMps <= 0.5, "assisted full brake must stop the bike");
        Assert.True(minPitchRad > -0.35,
            $"assist releases the brake before the endo develops: min pitch="
            + $"{minPitchRad * 180.0 / Math.PI:F1} deg");
    }

    [Fact]
    public void ReflexBalanceChannelsTrackLiftedPitchNotJustContactLoads()
    {
        double grossNormalN = YzfR1Definition.CombinedMassKg * G;
        var liftedWheelie = RiderReflexAssists.Evaluate(
            frontNormalN: 0.0,
            rearNormalN: grossNormalN,
            pitchRad: 0.30,
            pitchRateRadps: 0.5,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: false);
        var liftedStoppie = RiderReflexAssists.Evaluate(
            frontNormalN: grossNormalN,
            rearNormalN: 0.0,
            pitchRad: -0.30,
            pitchRateRadps: -0.5,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: false);

        Assert.Equal(1.0, liftedWheelie.WheelieBalance, 3);
        Assert.Equal(1.0, liftedWheelie.PitchReflexAuthority, 3);
        Assert.Equal(1.0, liftedStoppie.StoppieBalance, 3);
        Assert.Equal(1.0, liftedStoppie.PitchReflexAuthority, 3);
    }

    /// <summary>Prints the headline lift numbers; the ranges mirror the pins above.</summary>
    [Fact]
    public void PitchLiftProbeReport()
    {
        var wheelie = AtRest("report-wheelie");
        long tick = RollToStreetSpeed(wheelie);
        var wot = Raw(throttle: 1.0);
        double startSpeedMps = wheelie.Telemetry.SpeedMps;
        long liftTicks = -1;
        long loopTicks = -1;
        double pitchAtLoopRad = 0.0;
        for (long i = 0; i < 120 * 6; i++)
        {
            wheelie.Advance(YzfR1TestInput.Of(tick++, wot));
            if (liftTicks < 0 && wheelie.Telemetry.PitchRad >= 0.10)
                liftTicks = i + 1;
            if (wheelie.Telemetry.IsTippedOver)
            {
                loopTicks = i + 1;
                pitchAtLoopRad = wheelie.Telemetry.PitchRad;
                break;
            }
        }
        _output.WriteLine(
            $"raw 1st WOT from {startSpeedMps * 3.6:F0} km/h: pitch 0.10 rad at "
            + $"{liftTicks / 120.0:F2} s, loop-over latch at {loopTicks / 120.0:F2} s "
            + $"(pitch {pitchAtLoopRad * 180.0 / Math.PI:F1} deg)");
        Assert.InRange(liftTicks / 120.0, 0.05, 2.0);
        Assert.InRange(loopTicks / 120.0, 0.5, 6.0);

        var stoppie = AtRest("report-stoppie");
        tick = YzfR1TestRider.ShortShiftAccelerateTo(stoppie, HundredKmhMps, 0);
        (double windowedDecelMps2, long endTick) = YzfR1TestRider.HoldBrakeAndMeasure(
            stoppie, Raw(brake: 1.0), tick, maxTicks: 120 * 5);
        _output.WriteLine(
            $"raw full brake from 100 km/h: windowed decel {windowedDecelMps2:F2} m/s^2 "
            + $"({windowedDecelMps2 / G:F3} g), endo latched={stoppie.Telemetry.IsTippedOver} "
            + $"after {(endTick - tick) / 120.0:F2} s");
        Assert.InRange(windowedDecelMps2, 0.98 * G, 1.15 * G);
    }

    [Fact]
    public void WheelLiftPitchSeriesIsDeterministic()
    {
        double[] RunSeries(string id)
        {
            var bike = AtRest(id);
            long tick = RollToStreetSpeed(bike);
            var wot = Raw(throttle: 1.0);
            double[] series = new double[120 * 3];
            for (int i = 0; i < series.Length; i++)
            {
                bike.Advance(YzfR1TestInput.Of(tick++, wot));
                series[i] = bike.Telemetry.PitchRad;
            }
            return series;
        }

        Assert.Equal(RunSeries("determinism-a"), RunSeries("determinism-b"));
    }

    static void StepAssisted(
        YzfR1Dynamics bike,
        MotorcycleRiderController controller,
        long tick,
        double throttle,
        double brake,
        double foreAft)
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
            throttle, brake, 0.0, 0.0, foreAft, 0, 1.0, MotorcycleClutchMode.Auto);
        MotorcyclePilotCommand command = controller.Step(
            intent, feedback, MotorcycleControlMode.Assisted);
        bike.Advance(YzfR1TestInput.Of(tick, command));
    }
}
