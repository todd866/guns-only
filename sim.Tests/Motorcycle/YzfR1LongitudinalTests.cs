using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1LongitudinalTests
{
    /// <summary>
    /// Adjusted with the wheel-lift dynamics: raw WOT in 1st lofts the front and, held,
    /// loops the bike, so the sprint rides the test-rider ladder (short-shifting, on the
    /// tank). The 20 m/s in 5 s pin stands — acceleration is now wheelie-limited, not
    /// grip-limited, exactly like the real machine.
    /// </summary>
    [Fact]
    public void FullThrottleFromRestExceedsTwentyMpsWithinFiveSeconds()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);

        YzfR1TestRider.ShortShiftAccelerateTicks(bike, 0, 120 * 5);

        Assert.True(bike.State.GroundVelocityMps.Length > 20.0,
            $"speed={bike.State.GroundVelocityMps.Length:F2}");
        Assert.Equal(VehicleContactKind.StableSurfaceContact, bike.State.Contact.Kind);
    }

    [Fact]
    public void BrakingFromRunwaySpeedReducesGroundSpeed()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var brake = new MotorcyclePilotCommand(0.0, 1.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);

        long tick = YzfR1TestRider.ShortShiftAccelerateTicks(bike, 0, 120 * 5);
        double speedBeforeBrakeMps = bike.State.GroundVelocityMps.Length;

        for (; tick < 120 * 7; tick++)
            bike.Advance(YzfR1TestInput.Of(tick, brake));

        Assert.True(bike.State.GroundVelocityMps.Length < speedBeforeBrakeMps - 5.0,
            $"before={speedBeforeBrakeMps:F2}, after={bike.State.GroundVelocityMps.Length:F2}");
        Assert.Equal(VehicleContactKind.StableSurfaceContact, bike.State.Contact.Kind);
    }

    [Fact]
    public void FullThrottleWheelPowerDoesNotExceedSourcedPeakCrankPower()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        var throttle = new MotorcyclePilotCommand(1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);

        YzfR1TestRider.ShortShiftAccelerateTicks(bike, 0, 120 * 15);
        double speedBeforeMps = bike.State.GroundVelocityMps.Length;

        bike.Advance(YzfR1TestInput.Of(120 * 15, throttle));

        double speedAfterMps = bike.State.GroundVelocityMps.Length;
        double wheelForceN = YzfR1Definition.CombinedMassKg
            * (speedAfterMps - speedBeforeMps)
            / PlayerVehicleContract.FixedDeltaSeconds;
        double wheelPowerW = wheelForceN * (speedBeforeMps + speedAfterMps) * 0.5;

        // The auto shift schedule keeps sustained WOT inside the surrogate powerband.
        Assert.True(bike.Telemetry.Rpm >= YzfR1Definition.AutoDownshiftRpm * 2.0,
            $"expected powerband rpm, got {bike.Telemetry.Rpm:F0}");
        Assert.True(wheelPowerW <= YzfR1Definition.PeakCrankPowerW,
            $"wheelPower={wheelPowerW:F0} W, sourced peak={YzfR1Definition.PeakCrankPowerW:F0} W");
    }

    [Fact]
    public void NonHorizontalKnownSurfaceIsRejectedBeforeStateMutation()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);
        PlayerVehicleState initial = bike.State;
        var idle = new MotorcyclePilotCommand(0.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0,
            MotorcycleClutchMode.Auto);
        var slope = new PlayerVehicleEnvironmentSample(
            AirDensityKgM3: 1.225,
            WindVelocityMps: Vec3D.Zero,
            Surface: new VehicleSurfaceSample(
                IsKnown: true,
                SurfaceId: "sloped-road",
                HeightM: RapierLaunchSite.OperatingSurfaceElevationM,
                UpNormal: new Vec3D(0.0, 0.99, 0.1).Normalized(),
                FrictionPerSecond: 2.5));

        Assert.Throws<ArgumentException>(() =>
            bike.Advance(YzfR1TestInput.Of(0, idle, slope)));
        Assert.Equal(initial, bike.State);
    }

    [Fact]
    public void CapabilityDisclosesSingleTrackModelWithoutClaimingLeanDynamics()
    {
        var bike = YzfR1Dynamics.AtRestOnRunway(
            id: "r1",
            position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
            headingRad: -Math.PI / 2.0);

        Assert.Equal(PlayerVehicleKind.Motorcycle, bike.Capability.VehicleKind);
        Assert.Equal(VehicleCommandFamily.MotorcyclePilot, bike.Capability.CommandFamily);
        Assert.Equal(VehicleContactAuthority.IntegratedSkidContact,
            bike.Capability.ContactAuthority);
        Assert.Equal(PlayerVehicleContract.FixedStepHz, bike.Capability.FixedStepHz);
        Assert.Contains("single-track", bike.Capability.FidelityDisclosure,
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains("sourced", bike.Capability.FidelityDisclosure,
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains("not yet", bike.Capability.FidelityDisclosure,
            StringComparison.OrdinalIgnoreCase);
    }
}

internal static class YzfR1TestInput
{
    public static PlayerVehicleAdvanceInput Of(
        long tick,
        in MotorcyclePilotCommand command,
        PlayerVehicleEnvironmentSample? environment = null) =>
        new(
            tick,
            PlayerVehicleCommand.FromMotorcycle(command),
            YzfR1Definition.CombinedMassKg,
            0.0,
            environment ?? PlayerVehicleEnvironmentSample.StandardStillAir,
            VehicleContactState.Unknown,
            VehicleProtectionInterventionEvidence.None);
}
