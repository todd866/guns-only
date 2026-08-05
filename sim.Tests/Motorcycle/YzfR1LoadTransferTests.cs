using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1LoadTransferTests
{
    [Fact]
    public void HardBrakingTransfersLoadToFrontContact()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "braking-load",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);
        var cruise = new MotorcyclePilotCommand(0.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);
        var brake = cruise with { Brake = 1.0 };

        // Ladder ramp: raw WOT would wheelie-loop under the wheel-lift dynamics.
        YzfR1TestRider.ShortShiftAccelerateTicks(bike, 0, 120 * 5);
        Advance(bike, cruise, startTick: 120 * 5, tickCount: 120);
        double cruiseFrontN = bike.Telemetry.FrontNormalForceN;
        double cruiseRearN = bike.Telemetry.RearNormalForceN;

        Advance(bike, brake, startTick: 120 * 6, tickCount: 60);

        Assert.True(bike.Telemetry.FrontNormalForceN > cruiseFrontN + 200.0,
            $"cruise={cruiseFrontN:F0} N, brake={bike.Telemetry.FrontNormalForceN:F0} N");
        Assert.True(bike.Telemetry.RearNormalForceN < cruiseRearN,
            $"cruise={cruiseRearN:F0} N, brake={bike.Telemetry.RearNormalForceN:F0} N");
    }

    [Fact]
    public void ForeAftRiderShiftMovesStaticNormalLoad()
    {
        YzfR1Dynamics forward = AtRest("rider-forward");
        YzfR1Dynamics rearward = AtRest("rider-rearward");
        var neutral = new MotorcyclePilotCommand(0.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);

        Advance(forward, neutral with { RiderForeAft = 1.0 }, startTick: 0, tickCount: 120);
        Advance(rearward, neutral with { RiderForeAft = -1.0 }, startTick: 0, tickCount: 120);

        Assert.True(forward.Telemetry.FrontNormalForceN
            > rearward.Telemetry.FrontNormalForceN + 50.0);
        Assert.True(forward.Telemetry.RearNormalForceN
            < rearward.Telemetry.RearNormalForceN - 50.0);
    }

    static YzfR1Dynamics AtRest(string id) =>
        YzfR1Dynamics.AtRestOnRunway(
            id,
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);

    static void Advance(
        YzfR1Dynamics bike,
        in MotorcyclePilotCommand command,
        long startTick,
        long tickCount)
    {
        for (long tick = startTick; tick < startTick + tickCount; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, command));
    }
}
