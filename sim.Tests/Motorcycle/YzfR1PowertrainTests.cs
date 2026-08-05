using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1PowertrainTests
{
    [Fact]
    public void AutoClutchUpshiftRaisesGearAndDropsRpm()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var throttle = new MotorcyclePilotCommand(
            1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

        double rpmBeforeShift = double.NaN;
        int gearBeforeShift = 1;
        for (long tick = 0; tick < 120 * 12 && bike.Telemetry.Gear == 1; tick++)
        {
            rpmBeforeShift = bike.Telemetry.Rpm;
            gearBeforeShift = bike.Telemetry.Gear;
            bike.Advance(YzfR1TestInput.Of(tick, throttle));
        }

        Assert.Equal(1, gearBeforeShift);
        Assert.Equal(2, bike.Telemetry.Gear);
        Assert.True(rpmBeforeShift >= YzfR1Definition.AutoUpshiftRpm - 500.0,
            $"expected upshift-ready rpm, got {rpmBeforeShift:F0}");
        Assert.True(bike.Telemetry.Rpm < rpmBeforeShift - 500.0,
            $"rpm before={rpmBeforeShift:F0}, after={bike.Telemetry.Rpm:F0}");
    }

    [Fact]
    public void ManualClutchBlocksDriveWhenDisengaged()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var cmd = new MotorcyclePilotCommand(
            1.0, 0.0, 0.0, 0.0, 0.0, 0, Clutch: 0.0, MotorcycleClutchMode.Manual);

        for (long tick = 0; tick < 120 * 2; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, cmd));

        Assert.True(bike.State.GroundVelocityMps.Length < 2.0,
            $"speed={bike.State.GroundVelocityMps.Length:F2}");
    }

    [Fact]
    public void RevLimiterNeverReportsAboveRedline()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var throttle = new MotorcyclePilotCommand(
            1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

        for (long tick = 0; tick < 120 * 20; tick++)
        {
            bike.Advance(YzfR1TestInput.Of(tick, throttle));
            Assert.True(bike.Telemetry.Rpm <= YzfR1Definition.RedlineRpm + 1.0,
                $"tick={tick}, rpm={bike.Telemetry.Rpm:F0}");
        }
    }

    [Fact]
    public void SequentialShiftRequestStepsThroughSixGears()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var throttle = new MotorcyclePilotCommand(
            1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

        for (long tick = 0; tick < 120 * 30; tick++)
        {
            int targetGear = (int)(tick / (120 * 4)) + 1;
            targetGear = Math.Min(targetGear, YzfR1Definition.GearCount);
            int shiftRequest = bike.Telemetry.Gear < targetGear ? 1 : 0;
            bike.Advance(YzfR1TestInput.Of(
                tick,
                throttle with { GearShiftRequest = shiftRequest }));
        }

        Assert.Equal(YzfR1Definition.GearCount, bike.Telemetry.Gear);
    }

    [Fact]
    public void ManualClutchDumpAtLowRpmStallsEngine()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var disengaged = new MotorcyclePilotCommand(
            0.0, 0.0, 0.0, 0.0, 0.0, 0, 0.0, MotorcycleClutchMode.Manual);
        var dumped = disengaged with { Clutch = 1.0 };

        for (long tick = 0; tick < 60; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, disengaged));
        Assert.InRange(
            bike.Telemetry.Rpm,
            YzfR1Definition.IdleRpm - 50.0,
            YzfR1Definition.IdleRpm + 50.0);
        Assert.True(bike.Telemetry.Rpm > YzfR1Definition.StallRpm);

        bike.Advance(YzfR1TestInput.Of(60, dumped));

        Assert.True(bike.Telemetry.Rpm >= YzfR1Definition.StallRpm,
            $"idle dump must not stall above {YzfR1Definition.StallRpm:F0} rpm, rpm={bike.Telemetry.Rpm:F0}");
    }
}
