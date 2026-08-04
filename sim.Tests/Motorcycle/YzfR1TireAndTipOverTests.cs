using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1TireAndTipOverTests
{
    [Fact]
    public void ExcessiveLeanAtLowSpeedTipsOverAndRemainsLatched()
    {
        var bike = AtRest("tip-over");
        PlayerVehicleEnvironmentSample slipperyRunway = new(
            AirDensityKgM3: 1.225,
            WindVelocityMps: Vec3D.Zero,
            Surface: VehicleSurfaceSample.Horizontal(
                surfaceId: "slippery-runway",
                heightM: RapierLaunchSite.OperatingSurfaceElevationM,
                frictionPerSecond: 0.375));
        var accelerate = Command(throttle: 1.0);
        var turn = Command(throttle: 0.0) with { Steer = 1.0, RiderLateral = 1.0 };

        Advance(bike, accelerate, slipperyRunway, startTick: 0, tickCount: 120 * 6);
        Assert.InRange(bike.Telemetry.SpeedMps, 5.0, 6.0);
        Advance(bike, turn, slipperyRunway, startTick: 120 * 6, tickCount: 1);

        Assert.True(bike.Telemetry.IsTippedOver);
        Assert.False(bike.State.Flyable);

        bike.Advance(YzfR1TestInput.Of(120 * 6 + 1, Command(throttle: 1.0)));

        Assert.True(bike.Telemetry.IsTippedOver);
        Assert.False(bike.State.Flyable);
    }

    [Fact]
    public void CombinedSlipReducesAvailableLateralForce()
    {
        var coast = AtRest("coast");
        var brake = AtRest("brake");
        var accelerate = Command(throttle: 1.0);
        var turn = Command(throttle: 0.0) with { Steer = 0.5, RiderLateral = 1.0 };
        var turnAndBrake = turn with { Brake = 0.9 };

        Advance(coast, accelerate, startTick: 0, tickCount: 120 * 5);
        Advance(brake, accelerate, startTick: 0, tickCount: 120 * 5);
        Advance(coast, turn, startTick: 120 * 5, tickCount: 1);
        Advance(brake, turnAndBrake, startTick: 120 * 5, tickCount: 1);

        double latCoastN = coast.Telemetry.LateralForceN;
        double latWithBrakeN = brake.Telemetry.LateralForceN;

        Assert.True(latWithBrakeN < latCoastN * 0.85,
            $"coast={latCoastN:F0} N, braking={latWithBrakeN:F0} N");
    }

    [Fact]
    public void ResolvedLateralTireForceBoundsYawRateAtSpeed()
    {
        var bike = AtRest("force-authority");
        var accelerate = Command(throttle: 1.0);
        Advance(bike, accelerate, startTick: 0, tickCount: 120 * 8);
        Assert.True(bike.Telemetry.SpeedMps > 25.0);

        PlayerVehicleEnvironmentSample lowGrip = new(
            AirDensityKgM3: 1.225,
            WindVelocityMps: Vec3D.Zero,
            Surface: VehicleSurfaceSample.Horizontal(
                surfaceId: "low-grip",
                heightM: RapierLaunchSite.OperatingSurfaceElevationM,
                frictionPerSecond: 0.5));
        var hardTurn = Command(throttle: 0.0) with { Steer = 1.0 };
        Advance(bike, hardTurn, lowGrip, startTick: 120 * 8, tickCount: 1);

        double forceRequiredByYawN = bike.State.GrossMassKg
            * bike.Telemetry.SpeedMps
            * Math.Abs(bike.State.BodyRates.R);
        Assert.True(
            forceRequiredByYawN <= Math.Abs(bike.Telemetry.LateralForceN) + 1.0,
            $"yaw requires {forceRequiredByYawN:F0} N but contact resolved "
            + $"{bike.Telemetry.LateralForceN:F0} N");
    }

    static YzfR1Dynamics AtRest(string id) =>
        YzfR1Dynamics.AtRestOnRunway(
            id,
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);

    static MotorcyclePilotCommand Command(double throttle) =>
        new(throttle, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

    static void Advance(
        YzfR1Dynamics bike,
        in MotorcyclePilotCommand command,
        in PlayerVehicleEnvironmentSample environment,
        long startTick,
        long tickCount)
    {
        for (long tick = startTick; tick < startTick + tickCount; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, command, environment));
    }

    static void Advance(
        YzfR1Dynamics bike,
        in MotorcyclePilotCommand command,
        long startTick,
        long tickCount) =>
        Advance(bike, command, PlayerVehicleEnvironmentSample.StandardStillAir, startTick, tickCount);

}
