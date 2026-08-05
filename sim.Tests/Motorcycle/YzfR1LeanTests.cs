using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1LeanTests
{
    [Fact]
    public void SustainedRightSteerAndWeightShiftProducesNegativeRollInBodyFrame()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "lean",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);
        // Wheel-lift dynamics: raw WOT ramps loop the bike, so ride the test-rider ladder.
        var rightTurn = new MotorcyclePilotCommand(1.0, 0.0, 0.5, 1.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);

        long tick = YzfR1TestRider.ShortShiftAccelerateTicks(bike, 0, 120 * 8);
        Assert.True(bike.Telemetry.SpeedMps > 25.0);

        for (; tick < 120 * 11; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, rightTurn));

        double leanRad = Assert.IsType<double>(
            typeof(MotorcycleTelemetry).GetProperty("LeanRad")?.GetValue(bike.Telemetry));
        QuaternionD viewAttitude = Assert.IsType<QuaternionD>(
            typeof(MotorcycleTelemetry).GetProperty("ViewAttitude")?.GetValue(bike.Telemetry));

        Assert.True(leanRad < -0.15, $"right turn lean={leanRad:F3} rad");
        Assert.True(bike.State.BodyRates.R > 0.05,
            $"right steer should retain a positive force-limited yaw rate, got "
            + $"{bike.State.BodyRates.R:F3} rad/s");
        Assert.Equal(Math.Abs(leanRad) * 0.75, TiltFromWorldUp(viewAttitude), precision: 3);
    }

    [Fact]
    public void LowerRollInertiaProducesFasterLeanTransient()
    {
        var lowInertia = AtRestWithRollInertia("low-inertia", 47.5);
        var highInertia = AtRestWithRollInertia("high-inertia", 190.0);
        var rightTurn = new MotorcyclePilotCommand(1.0, 0.0, 0.5, 1.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);

        // Ladder ramps stay identical across the pair: roll inertia does not touch the
        // longitudinal path, so the telemetry-driven shift points match tick for tick.
        YzfR1TestRider.ShortShiftAccelerateTicks(lowInertia, 0, 120 * 8);
        YzfR1TestRider.ShortShiftAccelerateTicks(highInertia, 0, 120 * 8);
        Advance(lowInertia, rightTurn, startTick: 120 * 8, tickCount: 24);
        Advance(highInertia, rightTurn, startTick: 120 * 8, tickCount: 24);

        Assert.True(
            Math.Abs(lowInertia.Telemetry.LeanRad)
                > Math.Abs(highInertia.Telemetry.LeanRad) + 0.03,
            $"low={lowInertia.Telemetry.LeanRad:F3}, high={highInertia.Telemetry.LeanRad:F3}");
    }

    [Fact]
    public void InsideRiderShiftHasBoundedEffectOnTurnRate()
    {
        var neutral = AtRestWithRollInertia("neutral-rider", YzfR1Definition.RollInertiaKgM2);
        var shifted = AtRestWithRollInertia("shifted-rider", YzfR1Definition.RollInertiaKgM2);
        // Sourced gearing accelerates harder than the v2 box; stop early so the mild turn
        // stays comfortably inside the friction circle where the body-shift delta is visible.
        // The ladder ramp replaces raw WOT, which the wheel-lift dynamics would loop.
        YzfR1TestRider.ShortShiftAccelerateTicks(neutral, 0, 120 * 5);
        YzfR1TestRider.ShortShiftAccelerateTicks(shifted, 0, 120 * 5);

        var mildRightTurn = new MotorcyclePilotCommand(0.25, 0.0, 0.05, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);
        Advance(neutral, mildRightTurn, startTick: 120 * 5, tickCount: 120);
        Advance(
            shifted,
            mildRightTurn with { RiderLateral = 1.0 },
            startTick: 120 * 5,
            tickCount: 120);

        double neutralRate = neutral.State.BodyRates.R;
        double shiftedRate = shifted.State.BodyRates.R;
        Assert.True(
            shiftedRate > neutralRate + 0.005,
            $"inside rider shift should tighten the turn: neutral={neutralRate:F4}, "
            + $"shifted={shiftedRate:F4} rad/s");
        Assert.True(
            shiftedRate < neutralRate + 0.05,
            "body shift is a bounded contribution, not hidden steering authority");
    }

    static YzfR1Dynamics AtRestWithRollInertia(string id, double rollInertiaKgM2)
    {
        return YzfR1Dynamics.AtRestOnRunway(
            id,
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0,
            rollInertiaKgM2: rollInertiaKgM2);
    }

    static void Advance(
        YzfR1Dynamics bike,
        in MotorcyclePilotCommand command,
        long startTick,
        long tickCount)
    {
        for (long tick = startTick; tick < startTick + tickCount; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, command));
    }

    static double TiltFromWorldUp(in QuaternionD attitude) =>
        Math.Acos(Math.Clamp(
            attitude.Rotate(new Vec3D(0.0, 1.0, 0.0)).Dot(new Vec3D(0.0, 1.0, 0.0)),
            -1.0,
            1.0));
}
