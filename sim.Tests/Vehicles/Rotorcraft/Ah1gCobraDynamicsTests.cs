using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles.Rotorcraft;

public sealed class Ah1gCobraDynamicsTests
{
    const double BasicMissionMassKg = 4_051.0;

    static Ah1gCobraDynamics Create(
        string id,
        Vec3D? position = null,
        Vec3D? velocity = null) =>
        new(
            id,
            position ?? new Vec3D(0.0, 500.0, 0.0),
            velocity ?? Vec3D.Zero,
            initialYawRad: 0.0,
            initialRecurringBaseMassKg: BasicMissionMassKg);

    static PlayerVehicleAdvanceInput Input(
        long tick,
        in VerticalLiftPilotCommand command,
        PlayerVehicleEnvironmentSample? environment = null) =>
        new(
            tick,
            PlayerVehicleCommand.FromVerticalLift(command),
            BasicMissionMassKg,
            0.0,
            environment ?? PlayerVehicleEnvironmentSample.StandardStillAir,
            VehicleContactState.Unknown,
            VehicleProtectionInterventionEvidence.None);

    [Fact]
    public void ProviderExposesDirectCollectiveRotorcraftAuthority()
    {
        var cobra = Create("cobra");

        Assert.Equal(PlayerVehicleKind.VerticalLift, cobra.Capability.VehicleKind);
        Assert.Equal(VehicleCommandFamily.VerticalLiftPilot,
            cobra.Capability.CommandFamily);
        Assert.Equal(VehicleContactAuthority.IntegratedSkidContact,
            cobra.Capability.ContactAuthority);
        Assert.Contains("finite-state BEMT", cobra.Capability.FidelityDisclosure);
        Assert.DoesNotContain("climb-rate command", cobra.Capability.FidelityDisclosure);
        Assert.InRange(cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225),
            0.35,
            0.75);
        Assert.Equal(-1.0, cobra.Telemetry.MainRotorClearanceM);
    }

    [Fact]
    public void HoverTrimHoldsWithoutAnAltitudeController()
    {
        var cobra = Create("hover");
        double initialAltitudeM = cobra.State.PositionWorldM.Y;
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);

        for (long tick = 0; tick < 1_200; tick++)
            cobra.Advance(Input(tick, command));

        Assert.InRange(cobra.State.PositionWorldM.Y - initialAltitudeM, -20.0, 20.0);
        Assert.InRange(cobra.State.GroundVelocityMps.Y, -4.0, 4.0);
        Assert.InRange(cobra.Telemetry.MainRotorRpm, 294.0, 326.0);
        Assert.Equal(VehiclePowerAssessment.Assessed,
            cobra.Observation.Power.Assessment);
    }

    [Fact]
    public void CollectiveStepLoadsTheRotorBeforeTheGovernorCatchesUp()
    {
        var cobra = Create("governor");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 240; tick++) cobra.Advance(Input(tick, hover));

        double beforePowerW = cobra.Telemetry.EngineShaftPowerW;
        double minimumRpm = cobra.Telemetry.MainRotorRpm;
        var pull = new VerticalLiftPilotCommand(Math.Min(1.0, trim + 0.30), 0.0, 0.0, 0.0);
        for (long tick = 240; tick < 720; tick++)
        {
            cobra.Advance(Input(tick, pull));
            minimumRpm = Math.Min(minimumRpm, cobra.Telemetry.MainRotorRpm);
        }

        Assert.True(minimumRpm < 322.5,
            $"Expected transient rotor droop, minimum was {minimumRpm:F2} rpm.");
        Assert.True(cobra.Telemetry.EngineShaftPowerW > beforePowerW + 25_000.0);
        Assert.True(cobra.State.GroundVelocityMps.Y > 0.5);
    }

    [Fact]
    public void GroundEffectReducesInflowInsteadOfMultiplyingPilotAcceleration()
    {
        var ige = Create("ige", new Vec3D(0.0, 2.0, 0.0));
        var oge = Create("oge", new Vec3D(0.0, 30.0, 0.0));
        double trim = oge.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        var surfaceEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("pad", 0.0));

        for (long tick = 0; tick < 180; tick++)
        {
            ige.Advance(Input(tick, command, surfaceEnvironment));
            oge.Advance(Input(tick, command));
        }

        Assert.True(ige.Telemetry.GroundEffectFactor > 1.02);
        Assert.True(ige.Telemetry.InducedVelocityMps < oge.Telemetry.InducedVelocityMps);
        Assert.True(ige.Telemetry.RotorPowerRequiredW
            < oge.Telemetry.RotorPowerRequiredW);
        Assert.True(ige.Observation.Power.HoverPowerRequiredW
            < oge.Observation.Power.HoverPowerRequiredW);
    }

    [Fact]
    public void CyclicAndPedalsFollowTheSemanticAxisSigns()
    {
        var forward = Create("forward");
        var right = Create("right");
        var yaw = Create("yaw");
        double trim = forward.EstimateHoverCollective(BasicMissionMassKg, 1.225);

        for (long tick = 0; tick < 240; tick++)
        {
            forward.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.35, 0.0, 0.0)));
            right.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, 0.35, 0.0)));
            yaw.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.35)));
        }

        Assert.True(forward.State.GroundVelocityMps.Z > 0.5,
            $"Forward cyclic produced {forward.State.GroundVelocityMps.Z:F2} m/s north.");
        Assert.True(forward.Observation.PitchRad < -0.05,
            $"Forward cyclic produced {forward.Observation.PitchRad:F3} rad pitch.");
        Assert.True(right.State.GroundVelocityMps.X > 0.5,
            $"Right cyclic produced {right.State.GroundVelocityMps.X:F2} m/s east.");
        Assert.True(right.Observation.RollRad > 0.05,
            $"Right cyclic produced {right.Observation.RollRad:F3} rad roll.");
        Assert.True(yaw.Observation.YawRad > 0.05,
            $"Right pedal produced {yaw.Observation.YawRad:F3} rad yaw.");
    }

    [Fact]
    public void MaximumCollectiveIsNotCappedAtTheOldOnePointFiveFiveGCeiling()
    {
        var cobra = Create("maneuver");

        cobra.Advance(Input(0,
            new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0)));

        double oldCeilingN = cobra.Definition.Airframe.MaximumGrossMassKg
            * FlightModel.G0
            * 1.55;
        Assert.True(cobra.Telemetry.MainRotorThrustN > oldCeilingN,
            $"Maximum collective remained at {cobra.Telemetry.MainRotorThrustN:F0} N; "
            + $"old ceiling was {oldCeilingN:F0} N.");
    }

    [Fact]
    public void ForwardVelocityEscapesTheVortexRingEnvelope()
    {
        var settling = Create("settling", velocity: new Vec3D(0.0, -11.0, 0.0));
        var escaping = Create("escaping", velocity: new Vec3D(0.0, -11.0, 18.0));
        double trim = settling.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim + 0.10, 0.0, 0.0, 0.0);

        settling.Advance(Input(0, command));
        escaping.Advance(Input(0, command));

        Assert.True(settling.Telemetry.VortexRingSeverity > 0.50,
            $"Expected developed VRS, got {settling.Telemetry.VortexRingSeverity:F3}.");
        Assert.True(escaping.Telemetry.VortexRingSeverity < 0.05,
            $"Forward escape remained in VRS at {escaping.Telemetry.VortexRingSeverity:F3}.");
        Assert.Equal(RotorcraftFlightRegime.VortexRingState,
            settling.Telemetry.Regime);
    }

    [Fact]
    public void SoftRetreatingBladeEnvelopeBleedsADiveBeforeFullStallParks()
    {
        // Owner 2026-08-08: constant BLADE STALL is not a playable cruise state. Start above
        // authored onset and confirm the soft drag wall bleeds speed so severity cannot sit
        // near 1.0 under trim collective.
        var diving = Create("rbs-envelope", velocity: new Vec3D(0.0, 0.0, 100.0));
        double trim = diving.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.15, 0.0, 0.0);

        diving.Advance(Input(0, command));
        double entrySeverity = diving.Telemetry.RetreatingBladeStallSeverity;
        Assert.True(entrySeverity > 0.35,
            $"expected entry into RBS, got {entrySeverity:F3}");

        for (long tick = 1; tick < 480; tick++)
            diving.Advance(Input(tick, command));

        double settledSpeed = diving.State.GroundVelocityMps.Length;
        double settledSeverity = diving.Telemetry.RetreatingBladeStallSeverity;
        Assert.True(settledSpeed < 85.0,
            $"soft envelope should bleed the dive below ~165 KT; settled {settledSpeed:F1} m/s");
        Assert.True(settledSeverity < entrySeverity - 0.10,
            $"severity should fall as speed bleeds: entry {entrySeverity:F3} settled {settledSeverity:F3}");
    }

    [Fact]
    public void FeetOffHoverCollectiveIsMostlyHeldByLimitedScas()
    {
        // Mild / hover: ±12.5% SCAS should nearly cancel steady torque — autotrim, not magic-off.
        var cobra = Create("scas-hover");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 360; tick++)
            cobra.Advance(Input(tick, hover));

        double yaw0 = cobra.Observation.YawRad;
        for (long tick = 360; tick < 720; tick++)
            cobra.Advance(Input(tick, hover));

        double driftRad = Math.Abs(cobra.Observation.YawRad - yaw0);
        Assert.True(driftRad < 0.15,
            $"Hover feet-off yaw drift {driftRad:F3} rad in 3 s — SCAS should mostly hold trim TQ.");
    }

    [Fact]
    public void FeetOffHardCollectiveLeavesResidualYawScasCannotCancel()
    {
        // Owner 2026-08-10: perfect steady-torque trim made full collective a pure elevator.
        // SCAS is ±12.5% authority — a hard pull must still need pedal.
        var cobra = Create("scas-hard");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 240; tick++)
            cobra.Advance(Input(tick, hover));

        double yaw0 = cobra.Observation.YawRad;
        var pull = new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0);
        for (long tick = 240; tick < 600; tick++)
            cobra.Advance(Input(tick, pull));

        double yawDeltaRad = cobra.Observation.YawRad - yaw0;
        Assert.True(cobra.State.GroundVelocityMps.Y > 0.5, "hard collective should climb");
        Assert.True(Math.Abs(yawDeltaRad) > 0.20,
            $"Expected residual yaw under feet-off full collective; Δyaw={yawDeltaRad:F3} rad.");
        // Right-yaw reaction for CCW main rotor (positive Observation.YawRad).
        Assert.True(yawDeltaRad > 0.0,
            $"Torque reaction should yaw right without pedal; got Δyaw={yawDeltaRad:F3} rad.");
    }

    [Fact]
    public void HighAdvanceRatioProducesProgressiveRetreatingBladeWarning()
    {
        var moderate = Create("moderate", velocity: new Vec3D(0.0, 0.0, 55.0));
        var fast = Create("fast", velocity: new Vec3D(0.0, 0.0, 100.0));
        double trim = moderate.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);

        moderate.Advance(Input(0, command));
        fast.Advance(Input(0, command));

        Assert.True(fast.Telemetry.RetreatingBladeStallSeverity
            > moderate.Telemetry.RetreatingBladeStallSeverity + 0.25);
        Assert.True(fast.Telemetry.RetreatingBladeStallSeverity > 0.35);
    }

    [Fact]
    public void LoweringCollectivePreservesMoreRotorEnergyAfterEngineFailure()
    {
        var lowered = Create("lowered", velocity: new Vec3D(0.0, 0.0, 32.0));
        var held = Create("held", velocity: new Vec3D(0.0, 0.0, 32.0));
        double trim = lowered.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        lowered.FailEngine();
        held.FailEngine();

        for (long tick = 0; tick < 720; tick++)
        {
            lowered.Advance(Input(tick,
                new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.18)));
            held.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.18)));
        }

        Assert.Equal(RotorcraftFlightRegime.Autorotation, lowered.Telemetry.Regime);
        Assert.True(lowered.Telemetry.MainRotorRpm > held.Telemetry.MainRotorRpm + 8.0,
            $"Expected lowered collective to retain rotor energy: low="
            + $"{lowered.Telemetry.MainRotorRpm:F1}, held={held.Telemetry.MainRotorRpm:F1}.");
        Assert.True(lowered.State.GroundVelocityMps.Y < -1.0);
    }

    [Fact]
    public void FreewheelRemovesTransmittedEngineTorqueImmediately()
    {
        var cobra = Create("freewheel", velocity: new Vec3D(0.0, 0.0, 32.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        cobra.FailEngine();

        cobra.Advance(Input(0,
            new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.18)));

        Assert.False(cobra.Telemetry.EngineOperating);
        Assert.True(cobra.Telemetry.EngineShaftPowerW > 0.0,
            "The turbine spool state should decay instead of disappearing.");
        Assert.Equal(0.0, cobra.Telemetry.TransmissionTorqueNm, 9);
        Assert.Equal(0.0, cobra.Observation.Power.AppliedPowerW, 9);
        Assert.Equal(RotorcraftFlightRegime.Autorotation, cobra.Telemetry.Regime);
    }

    [Fact]
    public void FailedRotorRunsAllTheWayDownOnTheGround()
    {
        var cobra = Create("shutdown", new Vec3D(0.0, 0.315, 0.0));
        var environment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("pad", 0.0));
        var down = new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0);
        cobra.FailEngine();

        for (long tick = 0; tick < 14_400; tick++)
            cobra.Advance(Input(tick, down, environment));

        double stoppedAzimuth = cobra.Telemetry.RotorAzimuthRad;
        for (long tick = 14_400; tick < 14_640; tick++)
            cobra.Advance(Input(tick, down, environment));

        Assert.InRange(cobra.Telemetry.MainRotorRpm, 0.0, 0.01);
        Assert.Equal(stoppedAzimuth, cobra.Telemetry.RotorAzimuthRad, 12);
        Assert.Equal(0.0, cobra.State.BodyRates.P, 6);
        Assert.Equal(0.0, cobra.State.BodyRates.Q, 6);
        Assert.Equal(0.0, cobra.State.BodyRates.R, 6);
    }

    [Fact]
    public void ProductionEmptyMassIsTheMinimumAcceptedBaseMass()
    {
        double belowEmptyKg = Ah1gCobraDefinition.LateProduction.Airframe.EmptyMassKg - 0.1;

        Assert.Throws<ArgumentOutOfRangeException>(() => new Ah1gCobraDynamics(
            "too-light",
            new Vec3D(0.0, 100.0, 0.0),
            Vec3D.Zero,
            initialYawRad: 0.0,
            initialRecurringBaseMassKg: belowEmptyKg));
    }

    [Fact]
    public void FourPointSkidKernelDistinguishesStableAndHardContact()
    {
        var stable = Create("stable", new Vec3D(0.0, 0.315, 0.0),
            new Vec3D(0.0, -0.25, 0.0));
        var hard = Create("hard", new Vec3D(0.0, 0.335, 0.0),
            new Vec3D(0.0, -8.0, 0.0));
        var environment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("pad", 0.0));
        var down = new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0);

        stable.Advance(Input(0, down, environment));
        hard.Advance(Input(0, down, environment));

        Assert.Equal(VehicleContactKind.StableSurfaceContact, stable.State.Contact.Kind);
        Assert.InRange(stable.Telemetry.SkidContactCount, 1, 4);
        Assert.True(stable.State.Flyable);
        Assert.Equal(VehicleContactKind.HardImpact, hard.State.Contact.Kind);
        Assert.False(hard.State.Flyable);
    }

    [Fact]
    public void AuthorityStepIsBitDeterministic()
    {
        var first = Create("same-id");
        var second = Create("same-id");

        for (long tick = 0; tick < 600; tick++)
        {
            var command = new VerticalLiftPilotCommand(
                0.52 + 0.08 * Math.Sin(tick * 0.011),
                0.25 * Math.Sin(tick * 0.017),
                0.20 * Math.Cos(tick * 0.013),
                0.12 * Math.Sin(tick * 0.019));
            first.Advance(Input(tick, command));
            second.Advance(Input(tick, command));
        }

        Assert.Equal(first.State, second.State);
        Assert.Equal(first.Observation, second.Observation);
        Assert.Equal(first.Telemetry, second.Telemetry);
        Assert.True(double.IsFinite(first.Telemetry.MainRotorClearanceM));
    }
}
