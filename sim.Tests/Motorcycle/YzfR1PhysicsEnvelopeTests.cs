using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Live-drive envelope pins from the Build 263 physics audit: braking distance, lean-vs-speed,
/// longitudinal resistance, transmission behaviour, grass grip, and low-side reachability.
/// </summary>
public sealed class YzfR1PhysicsEnvelopeTests
{
    const double HundredKmhMps = 100.0 / 3.6;

    static readonly PlayerVehicleEnvironmentSample GrassVerge = new(
        AirDensityKgM3: 1.225,
        WindVelocityMps: Vec3D.Zero,
        // Mirrors WeekendRideMissionRuntime.GrassFrictionPerSecond (0.75 vs 2.5 runway).
        Surface: VehicleSurfaceSample.Horizontal(
            surfaceId: "rapier-strip.grass",
            heightM: RapierLaunchSite.OperatingSurfaceElevationM,
            frictionPerSecond: 0.75));

    static MotorcyclePilotCommand Command(double throttle = 0.0) =>
        new(throttle, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

    static YzfR1Dynamics AtRest(string id) =>
        YzfR1Dynamics.AtRestOnRunway(
            id,
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: 0.0);

    static long AccelerateTo(
        YzfR1Dynamics bike,
        double targetSpeedMps,
        long startTick,
        PlayerVehicleEnvironmentSample? environment = null)
    {
        long tick = startTick;
        var wot = Command(throttle: 1.0);
        while (bike.Telemetry.SpeedMps < targetSpeedMps && tick < startTick + 120 * 60)
            bike.Advance(YzfR1TestInput.Of(tick++, wot, environment));
        Assert.True(bike.Telemetry.SpeedMps >= targetSpeedMps,
            $"never reached {targetSpeedMps:F1} m/s, got {bike.Telemetry.SpeedMps:F1}");
        return tick;
    }

    /// <summary>Speed-holding full-lean turn; returns peak |lean| over the settled window.</summary>
    static double SustainedFullTurnLeanRad(
        double targetSpeedMps,
        PlayerVehicleEnvironmentSample? environment = null)
    {
        var bike = AtRest($"lean-{targetSpeedMps:F0}");
        double sustainedLeanRad = 0.0;
        for (long tick = 0; tick < 120 * 25; tick++)
        {
            double speed = bike.Telemetry.SpeedMps;
            double throttle = speed < targetSpeedMps
                ? Math.Min(1.0, (targetSpeedMps - speed) * 0.5)
                : 0.0;
            bool turning = tick > 120 * 2 && speed > targetSpeedMps * 0.9;
            var command = Command(throttle) with {
                Steer = turning ? 1.0 : 0.0,
                RiderLateral = turning ? 1.0 : 0.0,
            };
            bike.Advance(YzfR1TestInput.Of(tick, command, environment));
            if (tick > 120 * 20)
                sustainedLeanRad = Math.Max(
                    sustainedLeanRad,
                    Math.Abs(bike.Telemetry.LeanRad));
        }
        return sustainedLeanRad;
    }

    [Fact]
    public void FullBrakeFromHundredKmhIsTireLimitedOnPavement()
    {
        var bike = AtRest("brake-raw");
        long tick = AccelerateTo(bike, HundredKmhMps, 0);
        Vec3D start = bike.State.PositionWorldM;
        var brake = Command() with { Brake = 1.0 };
        double peakDecelMps2 = 0.0;
        double previousSpeedMps = bike.Telemetry.SpeedMps;
        long brakeTicks = 0;
        while (bike.Telemetry.SpeedMps > 0.1 && brakeTicks++ < 120 * 15)
        {
            bike.Advance(YzfR1TestInput.Of(tick++, brake));
            peakDecelMps2 = Math.Max(
                peakDecelMps2,
                (previousSpeedMps - bike.Telemetry.SpeedMps) * PlayerVehicleContract.FixedStepHz);
            previousSpeedMps = bike.Telemetry.SpeedMps;
        }
        double distanceM = (bike.State.PositionWorldM - start).Length;

        Assert.InRange(distanceM, 35.0, 55.0);
        Assert.True(peakDecelMps2 >= 8.6,
            $"tire-limited capability should approach 0.9 g+, peak={peakDecelMps2:F2} m/s^2");
    }

    [Fact]
    public void AssistedFullBrakeFromHundredKmhStopsInSaneDistanceOnLiveLoop()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        var wot = new MotorcycleRiderIntent(
            1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);
        var braking = new MotorcycleRiderIntent(
            0.0, 1.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);
        long guard = 0;
        while (runtime.Bike.Telemetry.SpeedMps < HundredKmhMps && guard++ < 120 * 60)
            runtime.StepFixed(wot);
        Assert.True(runtime.Bike.Telemetry.SpeedMps >= HundredKmhMps);
        Vec3D start = runtime.Bike.State.PositionWorldM;
        double peakDecelMps2 = 0.0;
        double previousSpeedMps = runtime.Bike.Telemetry.SpeedMps;
        long brakeTicks = 0;
        while (runtime.Bike.Telemetry.SpeedMps > 0.1 && brakeTicks++ < 120 * 15)
        {
            runtime.StepFixed(braking);
            peakDecelMps2 = Math.Max(
                peakDecelMps2,
                (previousSpeedMps - runtime.Bike.Telemetry.SpeedMps)
                    * PlayerVehicleContract.FixedStepHz);
            previousSpeedMps = runtime.Bike.Telemetry.SpeedMps;
        }
        double distanceM = (runtime.Bike.State.PositionWorldM - start).Length;

        Assert.InRange(distanceM, 40.0, 60.0);
        Assert.True(peakDecelMps2 >= 0.75 * 9.80665,
            $"assisted braking must reach at least 0.75 g, peak={peakDecelMps2:F2} m/s^2");
    }

    [Fact]
    public void LeanAuthorityRisesTowardTireLimitWithSpeedOnPavement()
    {
        double leanAt60KmhRad = SustainedFullTurnLeanRad(60.0 / 3.6);
        double leanAt110KmhRad = SustainedFullTurnLeanRad(110.0 / 3.6);

        Assert.True(leanAt60KmhRad >= 30.0 * Math.PI / 180.0,
            $"60 km/h sustained lean={leanAt60KmhRad * 180.0 / Math.PI:F1} deg");
        Assert.True(leanAt110KmhRad >= 40.0 * Math.PI / 180.0,
            $"110 km/h sustained lean={leanAt110KmhRad * 180.0 / Math.PI:F1} deg");
        Assert.True(leanAt110KmhRad >= leanAt60KmhRad - 3.0 * Math.PI / 180.0,
            "lean authority must not collapse with speed: "
            + $"60 km/h={leanAt60KmhRad * 180.0 / Math.PI:F1} deg, "
            + $"110 km/h={leanAt110KmhRad * 180.0 / Math.PI:F1} deg");
    }

    [Fact]
    public void ClosedThrottleCoastFromHundredKmhDecaysVisibly()
    {
        var bike = AtRest("coast");
        long tick = AccelerateTo(bike, HundredKmhMps, 0);
        double speedAtCoastMps = bike.Telemetry.SpeedMps;
        var coast = Command(throttle: 0.0);
        for (long i = 0; i < 120 * 3; i++)
            bike.Advance(YzfR1TestInput.Of(tick++, coast));
        double dropMps = speedAtCoastMps - bike.Telemetry.SpeedMps;

        Assert.True(dropMps >= 2.5,
            $"aero drag + rolling resistance + engine braking must decay a 100 km/h coast, "
            + $"3 s drop={dropMps:F2} m/s");
        Assert.True(dropMps <= 12.0,
            $"coasting is not braking, 3 s drop={dropMps:F2} m/s");
    }

    [Fact]
    public void AutoUpshiftFiresClimbingThroughTheBox()
    {
        var bike = AtRest("auto-upshift");
        var wot = Command(throttle: 1.0);
        int highestGear = 1;
        double rpmAtFirstUpshift = double.NaN;
        int previousGear = 1;
        for (long tick = 0; tick < 120 * 25; tick++)
        {
            double rpmBefore = bike.Telemetry.Rpm;
            bike.Advance(YzfR1TestInput.Of(tick, wot));
            if (bike.Telemetry.Gear > previousGear && previousGear == 1)
                rpmAtFirstUpshift = rpmBefore;
            previousGear = bike.Telemetry.Gear;
            highestGear = Math.Max(highestGear, bike.Telemetry.Gear);
        }

        Assert.True(highestGear >= 4,
            $"auto-upshift never fired: highest gear={highestGear}, rpm={bike.Telemetry.Rpm:F0}");
        Assert.True(double.IsFinite(rpmAtFirstUpshift)
            && rpmAtFirstUpshift >= YzfR1Definition.AutoUpshiftRpm - 700.0
            && rpmAtFirstUpshift <= YzfR1Definition.RedlineRpm,
            $"first upshift should fire near the schedule, rpm={rpmAtFirstUpshift:F0}");
    }

    [Fact]
    public void TopSpeedEmergesFromDragAgainstPowerNotTheFirstGearLimiter()
    {
        var bike = AtRest("top-speed");
        var wot = Command(throttle: 1.0);
        long tick = 0;
        for (; tick < 120 * 55; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, wot));
        double speedBeforeMps = bike.Telemetry.SpeedMps;
        for (; tick < 120 * 60; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, wot));
        double terminalSpeedMps = bike.Telemetry.SpeedMps;

        Assert.Equal(YzfR1Definition.GearCount, bike.Telemetry.Gear);
        Assert.InRange(terminalSpeedMps, 70.0, 95.0);
        Assert.True(terminalSpeedMps - speedBeforeMps < 0.5,
            $"terminal speed should be drag-stable, still gaining "
            + $"{terminalSpeedMps - speedBeforeMps:F2} m/s over 5 s");
        Assert.True(bike.Telemetry.Rpm <= YzfR1Definition.RedlineRpm - 300.0,
            $"top speed must be drag-limited, not rev-limited: rpm={bike.Telemetry.Rpm:F0}");
    }

    [Fact]
    public void ManualUpshiftIsAcceptedAtMidRpm()
    {
        var bike = AtRest("manual-upshift");
        var wot = Command(throttle: 1.0);
        long tick = 0;
        for (; tick < 120 * 3; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, wot));
        Assert.Equal(1, bike.Telemetry.Gear);
        double rpmBefore = bike.Telemetry.Rpm;
        Assert.InRange(rpmBefore, YzfR1Definition.IdleRpm, YzfR1Definition.AutoUpshiftRpm - 500.0);

        bike.Advance(YzfR1TestInput.Of(tick++, wot with { GearShiftRequest = 1 }));
        bike.Advance(YzfR1TestInput.Of(tick++, wot));

        Assert.Equal(2, bike.Telemetry.Gear);
        Assert.True(bike.Telemetry.Rpm < rpmBefore,
            $"upshift should drop rpm: before={rpmBefore:F0}, after={bike.Telemetry.Rpm:F0}");
    }

    [Fact]
    public void ManualDownshiftIsAcceptedAtMidRpmButRefusedWhenItWouldOverRev()
    {
        var bike = AtRest("manual-downshift");
        var wot = Command(throttle: 1.0);
        long tick = 0;
        for (; tick < 120 * 3; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, wot));
        bike.Advance(YzfR1TestInput.Of(tick++, wot with { GearShiftRequest = 1 }));
        for (; tick < 120 * 4; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, wot));
        Assert.Equal(2, bike.Telemetry.Gear);
        double coupledRpm = bike.Telemetry.Rpm;
        double projectedFirstGearRpm = coupledRpm
            * YzfR1Definition.TotalRatio(1) / YzfR1Definition.TotalRatio(2);

        bike.Advance(YzfR1TestInput.Of(tick++, wot with { GearShiftRequest = -1 }));

        if (projectedFirstGearRpm > YzfR1Definition.RedlineRpm)
            Assert.Equal(2, bike.Telemetry.Gear);
        else
        {
            Assert.Equal(1, bike.Telemetry.Gear);
            Assert.True(bike.Telemetry.Rpm > coupledRpm,
                $"downshift should raise rpm: before={coupledRpm:F0}, after={bike.Telemetry.Rpm:F0}");
        }
    }

    [Fact]
    public void GrassMateriallyReducesGripAndDrive()
    {
        double pavementLeanRad = SustainedFullTurnLeanRad(60.0 / 3.6);
        double grassLeanRad = SustainedFullTurnLeanRad(60.0 / 3.6, GrassVerge);
        Assert.True(grassLeanRad < pavementLeanRad * 0.60,
            $"grass lateral grip: pavement={pavementLeanRad * 180.0 / Math.PI:F1} deg, "
            + $"grass={grassLeanRad * 180.0 / Math.PI:F1} deg");

        var pavementBike = AtRest("drive-pavement");
        var grassBike = AtRest("drive-grass");
        var wot = Command(throttle: 1.0);
        for (long tick = 0; tick < 120 * 3; tick++)
        {
            pavementBike.Advance(YzfR1TestInput.Of(tick, wot));
            grassBike.Advance(YzfR1TestInput.Of(tick, wot, GrassVerge));
        }
        Assert.True(
            grassBike.Telemetry.SpeedMps < pavementBike.Telemetry.SpeedMps * 0.75,
            $"grass drive: pavement={pavementBike.Telemetry.SpeedMps:F1} m/s, "
            + $"grass={grassBike.Telemetry.SpeedMps:F1} m/s");
    }

    [Fact]
    public void FullLeanCarriedOntoGrassLowSidesAtSpeed()
    {
        var bike = AtRest("low-side");
        long tick = 0;
        var turning = Command() with { Steer = 1.0, RiderLateral = 1.0 };
        for (; tick < 120 * 8; tick++)
        {
            double speed = bike.Telemetry.SpeedMps;
            double throttle = speed < 60.0 / 3.6 ? Math.Min(1.0, (60.0 / 3.6 - speed) * 0.5) : 0.0;
            var command = tick > 120 * 4
                ? turning with { Throttle = throttle }
                : Command(throttle);
            bike.Advance(YzfR1TestInput.Of(tick, command));
        }
        Assert.True(Math.Abs(bike.Telemetry.LeanRad) >= 35.0 * Math.PI / 180.0,
            $"setup lean={bike.Telemetry.LeanRad * 180.0 / Math.PI:F1} deg");
        Assert.False(bike.Telemetry.IsTippedOver,
            "steady full lean on pavement must not low-side");

        for (long grassTick = 0; grassTick < 120 * 2 && !bike.Telemetry.IsTippedOver; grassTick++)
            bike.Advance(YzfR1TestInput.Of(tick++, turning, GrassVerge));

        Assert.True(bike.Telemetry.IsTippedOver,
            "carrying pavement-limit lean onto the grass verge at ~60 km/h must low-side");
        Assert.False(bike.State.Flyable);
    }

    [Fact]
    public void CapabilityVersionDisclosesTheV3LongitudinalContract()
    {
        var bike = AtRest("capability");

        Assert.Equal("player-vehicle.yzf-r1-runway-plane.v3", YzfR1Dynamics.CapabilityVersion);
        Assert.Equal(YzfR1Dynamics.CapabilityVersion, bike.Capability.CapabilityVersion);
        Assert.Contains("drag", bike.Capability.FidelityDisclosure,
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains("engine braking", bike.Capability.FidelityDisclosure,
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains("primary", bike.Capability.FidelityDisclosure,
            StringComparison.OrdinalIgnoreCase);
    }
}
