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
        var accelerate = new MotorcyclePilotCommand(1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);
        var rightTurn = accelerate with { Steer = 0.5, RiderLateral = 1.0 };

        for (long tick = 0; tick < 120 * 8; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, accelerate));
        Assert.True(bike.Telemetry.SpeedMps > 25.0);

        for (long tick = 120 * 8; tick < 120 * 11; tick++)
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
        var accelerate = new MotorcyclePilotCommand(1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);
        var rightTurn = accelerate with { Steer = 0.5, RiderLateral = 1.0 };

        Advance(lowInertia, accelerate, startTick: 0, tickCount: 120 * 8);
        Advance(highInertia, accelerate, startTick: 0, tickCount: 120 * 8);
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
        var accelerate = new MotorcyclePilotCommand(1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);
        Advance(neutral, accelerate, startTick: 0, tickCount: 120 * 8);
        Advance(shifted, accelerate, startTick: 0, tickCount: 120 * 8);

        var mildRightTurn = accelerate with { Throttle = 0.25, Steer = 0.05 };
        Advance(neutral, mildRightTurn, startTick: 120 * 8, tickCount: 120);
        Advance(
            shifted,
            mildRightTurn with { RiderLateral = 1.0 },
            startTick: 120 * 8,
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
