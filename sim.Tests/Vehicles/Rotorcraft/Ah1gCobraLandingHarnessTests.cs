using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles.Rotorcraft;

/// <summary>
/// Flies the AH-1G onto a pad the way an owner does — decelerate, flare, settle — and asserts
/// the aircraft remains flyable. Unit contact tests only checked -0.25 m/s vs -5 m/s sinks; they
/// never flared, so a 10° pitch limit and rigid tip-path RotorStrike crashed every real landing.
/// </summary>
public sealed class Ah1gCobraLandingHarnessTests
{
    const double BasicMissionMassKg = 4_051.0;
    const double PadHeightM = 0.0;

    static Ah1gCobraDynamics Create(Vec3D position, Vec3D velocity) =>
        new(
            "landing",
            position,
            velocity,
            initialYawRad: 0.0,
            initialRecurringBaseMassKg: BasicMissionMassKg);

    static PlayerVehicleEnvironmentSample PadEnvironment() =>
        new(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("camp-ember-pad", PadHeightM));

    static PlayerVehicleAdvanceInput Input(
        long tick,
        in VerticalLiftPilotCommand command) =>
        new(
            tick,
            PlayerVehicleCommand.FromVerticalLift(command),
            BasicMissionMassKg,
            0.0,
            PadEnvironment(),
            VehicleContactState.Unknown,
            VehicleProtectionInterventionEvidence.None);

    /// <summary>
    /// Closed-loop short final: hold a gentle sink with collective, flare with modest aft
    /// cyclic, settle. Owner flights crashed on RotorStrike / HardImpact before the skids bit.
    /// </summary>
    [Fact]
    public void FlaredApproachSettlesOnThePadWithoutCrashing()
    {
        double skid = Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM;
        var cobra = Create(
            new Vec3D(0.0, skid + 20.0, 0.0),
            new Vec3D(0.0, -1.0, 8.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        long tick = 0;
        double collective = trim - 0.05;

        for (; tick < 2_400; tick++) {
            double agl = cobra.State.PositionWorldM.Y - skid;
            double vs = cobra.Observation.VerticalSpeedMps;
            double targetVs = agl > 6.0 ? -1.2 : agl > 2.0 ? -0.4 : -0.05;
            collective = Math.Clamp(collective + 0.045 * (targetVs - vs), 0.25, 0.95);
            double aftCyclic = agl < 8.0 ? -0.15 : -0.04;
            cobra.Advance(Input(tick, new VerticalLiftPilotCommand(
                collective, aftCyclic, 0.0, 0.0)));
            Assert.True(
                cobra.State.Flyable,
                $"Became unflyable at tick {tick} "
                + $"(contact={cobra.State.Contact.Kind}, agl={agl:F1}, "
                + $"vs={vs:F2} m/s, pitch={cobra.Observation.PitchRad * 180.0 / Math.PI:F1}°, "
                + $"rotorStrike={cobra.Telemetry.RotorStrike}).");
            if (cobra.State.Contact.Kind is VehicleContactKind.StableSurfaceContact
                or VehicleContactKind.SurfaceContact) {
                tick++;
                break;
            }
        }

        Assert.True(
            cobra.State.Contact.Kind is VehicleContactKind.StableSurfaceContact
                or VehicleContactKind.SurfaceContact,
            $"Expected skid contact after the approach, got {cobra.State.Contact.Kind} "
            + $"agl={cobra.State.PositionWorldM.Y - skid:F1}.");
        Assert.False(cobra.Telemetry.RotorStrike);
        Assert.True(cobra.State.Flyable);

        for (int hold = 0; hold < 240; hold++, tick++) {
            cobra.Advance(Input(tick, new VerticalLiftPilotCommand(trim, -0.05, 0.0, 0.0)));
            Assert.True(cobra.State.Flyable, $"Lost flyable while sitting at tick {tick}.");
        }
    }

    /// <summary>
    /// Contact with a flared attitude and a playable sink rate must not latch HardImpact.
    /// The old 10° pitch / 3.05 m/s caps made any real flare a crash.
    /// </summary>
    [Fact]
    public void TouchdownAtFlareAttitudeSurvivesPlayableSinkRate()
    {
        double skid = Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM;
        var cobra = Create(
            new Vec3D(0.0, skid + 5.0, 0.0),
            new Vec3D(0.0, -1.0, 4.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        double maxPitchDeg = 0.0;

        for (long tick = 0; tick < 720; tick++) {
            double agl = cobra.State.PositionWorldM.Y - skid;
            double vs = cobra.Observation.VerticalSpeedMps;
            double collective = Math.Clamp(
                trim + 0.03 * (-0.4 - vs) + (agl < 1.0 ? 0.04 : 0.0),
                0.25,
                0.90);
            cobra.Advance(Input(tick, new VerticalLiftPilotCommand(collective, -0.28, 0.0, 0.0)));
            maxPitchDeg = Math.Max(
                maxPitchDeg,
                Math.Abs(cobra.Observation.PitchRad) * 180.0 / Math.PI);
            Assert.True(
                cobra.State.Flyable,
                $"Flared touchdown crashed at tick {tick}: contact={cobra.State.Contact.Kind}, "
                + $"pitch={cobra.Observation.PitchRad * 180.0 / Math.PI:F1}°, "
                + $"vs={cobra.Observation.VerticalSpeedMps:F2}, rotorStrike={cobra.Telemetry.RotorStrike}.");
            if (cobra.State.Contact.Kind is VehicleContactKind.StableSurfaceContact
                or VehicleContactKind.SurfaceContact)
                break;
        }

        Assert.True(cobra.State.Flyable);
        Assert.NotEqual(VehicleContactKind.HardImpact, cobra.State.Contact.Kind);
        Assert.False(cobra.Telemetry.RotorStrike);
        Assert.True(
            cobra.State.Contact.Kind is VehicleContactKind.StableSurfaceContact
                or VehicleContactKind.SurfaceContact,
            $"Expected contact, got {cobra.State.Contact.Kind}.");
        Assert.True(
            maxPitchDeg > 10.0,
            $"Harness must flare past the old 10° kill pitch (saw {maxPitchDeg:F1}°).");
    }
}
