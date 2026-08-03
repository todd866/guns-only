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
        Assert.True(bike.State.BodyRates.R > 0.1,
            $"right steer yaw rate={bike.State.BodyRates.R:F3} rad/s");
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
