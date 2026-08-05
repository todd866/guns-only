using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles.Rotorcraft;

/// <summary>
/// Pins the observation semantics the Cobra bridge serializes: ground speed is horizontal-only
/// (a pure vertical climb has zero ground speed), and the live applied-power margin moves with
/// the collective while the hover-capability margin stays a near-constant of mass and density.
/// </summary>
public sealed class Ah1gCobraObservationTests
{
    const double BasicMissionMassKg = 4_051.0;

    static Ah1gCobraDynamics Create(Vec3D velocity) => new(
        "cobra-observation",
        new Vec3D(0.0, 500.0, 0.0),
        velocity,
        initialYawRad: 0.0,
        initialRecurringBaseMassKg: BasicMissionMassKg);

    static PlayerVehicleAdvanceInput Input(long tick, in VerticalLiftPilotCommand command) => new(
        tick,
        PlayerVehicleCommand.FromVerticalLift(command),
        BasicMissionMassKg,
        0.0,
        PlayerVehicleEnvironmentSample.StandardStillAir,
        VehicleContactState.Unknown,
        VehicleProtectionInterventionEvidence.None);

    [Fact]
    public void GroundSpeedIsZeroInPureVerticalClimb()
    {
        var cobra = Create(new Vec3D(0.0, 9.0, 0.0));

        Assert.Equal(0.0, cobra.Observation.GroundSpeedMps, 9);
        Assert.Equal(9.0, cobra.Observation.VerticalSpeedMps, 9);
        // True airspeed legitimately remains the full 3D air-relative magnitude.
        Assert.Equal(9.0, cobra.Observation.TrueAirspeedMps, 9);

        PlayerVehicleAdvanceResult result = cobra.Advance(
            Input(0, new VerticalLiftPilotCommand(0.6, 0.0, 0.0, 0.0)));
        Vec3D velocity = result.Observation.GroundVelocityMps;
        double horizontal = Math.Sqrt(velocity.X * velocity.X + velocity.Z * velocity.Z);
        Assert.Equal(horizontal, result.Observation.GroundSpeedMps, 9);
    }

    [Fact]
    public void GroundSpeedMatchesHorizontalMagnitudeInTranslation()
    {
        var cobra = Create(new Vec3D(3.0, 4.0, 0.0));

        Assert.Equal(3.0, cobra.Observation.GroundSpeedMps, 9);
        Assert.Equal(5.0, cobra.Observation.TrueAirspeedMps, 9);
    }

    [Fact]
    public void AppliedPowerMarginFollowsCollectiveWhileHoverMarginStaysStatic()
    {
        var lowCollective = Create(Vec3D.Zero);
        var highCollective = Create(Vec3D.Zero);
        for (long tick = 0; tick < 240; tick++)
        {
            lowCollective.Advance(Input(tick, new VerticalLiftPilotCommand(0.25, 0.0, 0.0, 0.0)));
            highCollective.Advance(Input(tick, new VerticalLiftPilotCommand(0.95, 0.0, 0.0, 0.0)));
        }

        double lowMargin = lowCollective.Observation.Power.AppliedPowerMarginFraction;
        double highMargin = highCollective.Observation.Power.AppliedPowerMarginFraction;
        Assert.True(lowMargin > highMargin + 0.05,
            $"applied margin must move with collective: low {lowMargin}, high {highMargin}");
        // The hover-capability figure is the same constant in both flights — which is exactly
        // why serializing it as "power margin" produced a dead telemetry column.
        Assert.Equal(
            lowCollective.Observation.Power.HoverPowerMarginFraction,
            highCollective.Observation.Power.HoverPowerMarginFraction,
            6);
    }

    [Fact]
    public void AppliedPowerMarginIsAvailableMinusAppliedOverAvailable()
    {
        var power = new VehiclePowerObservation(
            VehiclePowerAssessment.Assessed,
            AvailablePowerW: 1_000.0,
            AppliedPowerW: 400.0,
            HoverPowerRequiredW: 800.0,
            HoverPowerMarginFraction: 0.2);

        Assert.Equal(0.6, power.AppliedPowerMarginFraction, 12);
        Assert.Equal(0.0, VehiclePowerObservation.NotAssessed.AppliedPowerMarginFraction, 12);
    }
}
