using GunsOnly.Sim.Turbulence;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles;

public sealed class PlayerVehicleAuthorityTests {
    sealed class ConstantWind(Vec3D velocity) : IWindField {
        public Vec3D Sample(Vec3D _) => velocity;
    }

    static PlayerVehicleAdvanceInput FixedWingInput(
        long tick,
        in PilotCommand command,
        double baseMassKg = 6_900.0,
        double payloadMassKg = 0.0,
        VehicleContactState? contact = null,
        VehicleProtectionInterventionEvidence? intervention = null) =>
        new(
            tick,
            PlayerVehicleCommand.FromFixedWing(command),
            baseMassKg,
            payloadMassKg,
            PlayerVehicleEnvironmentSample.StandardStillAir,
            contact ?? VehicleContactState.Airborne,
            intervention ?? VehicleProtectionInterventionEvidence.None);

    static PlayerVehicleAdvanceInput VerticalInput(
        long tick,
        in VerticalLiftPilotCommand command,
        double baseMassKg = 5_800.0,
        double payloadMassKg = 0.0,
        PlayerVehicleEnvironmentSample? environment = null,
        VehicleProtectionInterventionEvidence? intervention = null) =>
        new(
            tick,
            PlayerVehicleCommand.FromVerticalLift(command),
            baseMassKg,
            payloadMassKg,
            environment ?? PlayerVehicleEnvironmentSample.StandardStillAir,
            VehicleContactState.Unknown,
            intervention ?? VehicleProtectionInterventionEvidence.None);

    static AircraftState FixedWingInitialState() => new(
        new Vec3D(125.0, 2_200.0, -80.0),
        205.0,
        0.035,
        0.18,
        -0.08,
        FlightModel.Sabre.MassKg);

    [Fact]
    public void FixedWingAdapterPreservesAircraftSimStepsExactly() {
        Vec3D windVelocity = new(12.0, -1.5, -4.0);
        var direct = new AircraftSim(FixedWingInitialState(), FlightModel.Sabre) {
            Wind = new ConstantWind(windVelocity)
        };
        var wrapped = new AircraftSim(FixedWingInitialState(), FlightModel.Sabre) {
            Wind = new ConstantWind(windVelocity)
        };
        var adapter = new FixedWingAircraftVehicleAdapter(
            "player",
            wrapped,
            maximumGrossMassKg: 8_000.0,
            maximumAdditivePayloadMassKg: 900.0);
        PlayerVehicleAdvanceResult result = default;
        for (long tick = 0; tick < 240; tick++) {
            var command = new PilotCommand(
                GDemand: 1.8 + 0.6 * Math.Sin(tick * 0.013),
                BankTarget: 0.31 * Math.Sin(tick * 0.009),
                Throttle: 0.84,
                Rudder: -0.12 * Math.Cos(tick * 0.017));

            direct.SetMassKg(7_120.0);
            direct.Step(command, 1.0 / AircraftSim.TickHz);
            result = adapter.Advance(
                FixedWingInput(
                    tick,
                    command,
                    baseMassKg: 6_900.0,
                    payloadMassKg: 220.0));

            Assert.Equal(direct.State, adapter.Aircraft.State);
            Assert.Equal(direct.State.Position, result.State.PositionWorldM);
            Assert.Equal(direct.State.VelocityVector(),
                result.State.GroundVelocityMps);
            Assert.Equal(direct.State.BodyAttitude, result.State.BodyAttitude);
            Assert.Equal(direct.State.BodyRates, result.State.BodyRates);
            Assert.Equal(direct.AirVelocity, result.Observation.AirVelocityMps);
            Assert.Equal(direct.AirspeedMps,
                result.Observation.TrueAirspeedMps);
        }

        Assert.Equal(windVelocity.X, result.Observation.WindVelocityMps.X, 12);
        Assert.Equal(windVelocity.Y, result.Observation.WindVelocityMps.Y, 12);
        Assert.Equal(windVelocity.Z, result.Observation.WindVelocityMps.Z, 12);
        Assert.Equal(direct.LastAppliedCommand, wrapped.LastAppliedCommand);
        Assert.Equal(direct.LastNz, wrapped.LastNz);
        Assert.Equal(direct.LastPilotNormalAccelerationG,
            wrapped.LastPilotNormalAccelerationG);
        Assert.Equal(direct.LastRollMomentNm, wrapped.LastRollMomentNm);
        Assert.Equal(direct.ThrustFraction, wrapped.ThrustFraction);
        Assert.Equal(VehiclePowerAssessment.NotAssessed,
            result.Observation.Power.Assessment);
    }

    [Fact]
    public void FixedWingPayloadMassIsRecurringAndDoesNotAccumulate() {
        var adapter = new FixedWingAircraftVehicleAdapter(
            "player",
            new AircraftSim(FixedWingInitialState(), FlightModel.Sabre),
            maximumGrossMassKg: 8_000.0,
            maximumAdditivePayloadMassKg: 900.0);
        var command = new PilotCommand(1.0, 0.0, 0.7, 0.0);

        PlayerVehicleState first = adapter.Advance(
            FixedWingInput(10, command, payloadMassKg: 300.0)).State;
        PlayerVehicleState second = adapter.Advance(
            FixedWingInput(11, command, payloadMassKg: 300.0)).State;
        PlayerVehicleState offloaded = adapter.Advance(
            FixedWingInput(12, command, payloadMassKg: 0.0)).State;

        Assert.Equal(7_200.0, first.GrossMassKg);
        Assert.Equal(7_200.0, second.GrossMassKg);
        Assert.Equal(6_900.0, offloaded.GrossMassKg);
        Assert.Equal(0.0, offloaded.AdditivePayloadMassKg);
        Assert.Equal(6_900.0, adapter.Aircraft.State.Mass);
    }

    [Fact]
    public void SemanticFamilyAndContiguousTicksAreValidatedBeforeMutation() {
        var vehicle = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(0.0, 80.0, 0.0),
            Vec3D.Zero,
            0.0,
            initialRecurringBaseMassKg: 5_800.0);
        PlayerVehicleState initial = vehicle.State;
        var wrongFamily = FixedWingInput(
            0,
            new PilotCommand(1.0, 0.0, 0.5, 0.0),
            baseMassKg: 5_800.0);

        Assert.Throws<InvalidOperationException>(
            () => vehicle.Advance(wrongFamily));
        Assert.Equal(initial, vehicle.State);

        var hover = new VerticalLiftPilotCommand(0.81, 0.0, 0.0, 0.0);
        vehicle.Advance(VerticalInput(0, hover));
        PlayerVehicleState afterValid = vehicle.State;

        Assert.Throws<InvalidOperationException>(
            () => vehicle.Advance(VerticalInput(2, hover)));
        Assert.Equal(afterValid, vehicle.State);
        Assert.Throws<ArgumentOutOfRangeException>(
            () => vehicle.Advance(VerticalInput(
                1,
                hover,
                payloadMassKg: 1_001.0)));
        Assert.Equal(afterValid, vehicle.State);
    }

    [Fact]
    public void PayloadMassReducesClimbResponseAndHoverPowerMargin() {
        var light = new ReducedOrderVerticalLiftAirAmbulance(
            "light",
            new Vec3D(0.0, 100.0, 0.0),
            Vec3D.Zero,
            0.0,
            initialRecurringBaseMassKg: 5_800.0,
            initialRotorThrustN: 0.0);
        var loaded = new ReducedOrderVerticalLiftAirAmbulance(
            "loaded",
            new Vec3D(0.0, 100.0, 0.0),
            Vec3D.Zero,
            0.0,
            initialRecurringBaseMassKg: 5_800.0,
            initialAdditivePayloadMassKg: 900.0,
            initialRotorThrustN: 0.0);
        var fullPower = new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0);

        for (long tick = 0; tick < 480; tick++) {
            light.Advance(VerticalInput(tick, fullPower));
            loaded.Advance(VerticalInput(
                tick,
                fullPower,
                payloadMassKg: 900.0));
        }

        Assert.True(
            light.State.PositionWorldM.Y > loaded.State.PositionWorldM.Y + 8.0,
            $"Expected lighter aircraft to climb more: light={light.State.PositionWorldM.Y}, "
            + $"loaded={loaded.State.PositionWorldM.Y}.");
        Assert.True(
            light.Observation.Power.HoverPowerMarginFraction
                > loaded.Observation.Power.HoverPowerMarginFraction);
        Assert.Equal(6_700.0, loaded.State.GrossMassKg);
        Assert.Equal(VehiclePowerAssessment.Assessed,
            loaded.Observation.Power.Assessment);
    }

    [Fact]
    public void AirRelativeDragProducesDeterministicCrosswindDrift() {
        const double baseMassKg = 5_800.0;
        double trimThrustN = baseMassKg * FlightModel.G0;
        var calm = new ReducedOrderVerticalLiftAirAmbulance(
            "calm",
            new Vec3D(0.0, 70.0, 0.0),
            Vec3D.Zero,
            0.0,
            baseMassKg,
            initialRotorThrustN: trimThrustN);
        var windy = new ReducedOrderVerticalLiftAirAmbulance(
            "windy",
            new Vec3D(0.0, 70.0, 0.0),
            Vec3D.Zero,
            0.0,
            baseMassKg,
            initialRotorThrustN: trimThrustN);
        var nearHover = new VerticalLiftPilotCommand(0.81, 0.0, 0.0, 0.0);
        var calmEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Unknown);
        var windyEnvironment = calmEnvironment with {
            WindVelocityMps = new Vec3D(15.0, 0.0, 0.0)
        };

        for (long tick = 0; tick < 480; tick++) {
            calm.Advance(VerticalInput(
                tick,
                nearHover,
                environment: calmEnvironment));
            windy.Advance(VerticalInput(
                tick,
                nearHover,
                environment: windyEnvironment));
        }

        Assert.Equal(0.0, calm.State.PositionWorldM.X);
        Assert.True(windy.State.PositionWorldM.X > 0.5);
        Assert.Equal(new Vec3D(15.0, 0.0, 0.0),
            windy.Observation.WindVelocityMps);
        Assert.NotEqual(
            windy.Observation.GroundVelocityMps,
            windy.Observation.AirVelocityMps);
    }

    [Fact]
    public void IntegratedSkidsHoldContactThenPermitPoweredLiftOff() {
        const double skidHeightM = 1.5;
        var vehicle = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(0.0, skidHeightM, 0.0),
            Vec3D.Zero,
            0.0,
            initialRecurringBaseMassKg: 5_600.0,
            initialRotorThrustN: 0.0);
        var ground = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("pickup-lz", 0.0));

        PlayerVehicleAdvanceResult settled = vehicle.Advance(
            VerticalInput(
                0,
                new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0),
                baseMassKg: 5_600.0,
                environment: ground));

        Assert.Equal(VehicleContactKind.StableSurfaceContact,
            settled.State.Contact.Kind);
        Assert.Equal(skidHeightM, settled.State.PositionWorldM.Y);
        Assert.Equal(0.0, settled.State.GroundVelocityMps.Y);

        for (long tick = 1; tick <= 240; tick++)
            vehicle.Advance(VerticalInput(
                tick,
                new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0),
                baseMassKg: 5_600.0,
                environment: ground));

        Assert.Equal(VehicleContactKind.Airborne, vehicle.State.Contact.Kind);
        Assert.True(vehicle.State.PositionWorldM.Y > skidHeightM);
        Assert.True(vehicle.State.Flyable);
    }

    [Fact]
    public void PowerCeilingAndSurfacePlaneRemainAuthoritativeAtCoarseBoundaries() {
        const double skidHeightM = 1.5;
        var vehicle = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(0.0, 1.0, 0.0),
            new Vec3D(0.0, 2.0, 0.0),
            0.0,
            initialRecurringBaseMassKg: 5_800.0);
        var thinAirOverGround = new PlayerVehicleEnvironmentSample(
            0.5,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("pickup-lz", 0.0));

        PlayerVehicleAdvanceResult result = vehicle.Advance(
            VerticalInput(
                0,
                new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0),
                environment: thinAirOverGround));

        Assert.True(result.State.PositionWorldM.Y >= skidHeightM);
        Assert.True(
            result.Observation.Power.AppliedPowerW
                <= result.Observation.Power.AvailablePowerW + 1e-9);
    }

    [Fact]
    public void HardVerticalImpactClampsPenetrationAndLatchesUnflyable() {
        const double skidHeightM = 1.5;
        var vehicle = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(0.0, 2.0, 0.0),
            new Vec3D(1.0, -8.0, 0.0),
            0.0,
            initialRecurringBaseMassKg: 5_800.0,
            initialRotorThrustN: 0.0);
        var ground = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal("receiver-pad", 0.0));
        var idle = new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0);

        long tick = 0;
        while (vehicle.State.Contact.Kind != VehicleContactKind.HardImpact
            && tick < 30) {
            vehicle.Advance(VerticalInput(
                tick,
                idle,
                environment: ground));
            tick++;
        }

        Assert.Equal(VehicleContactKind.HardImpact, vehicle.State.Contact.Kind);
        Assert.Equal(skidHeightM, vehicle.State.PositionWorldM.Y);
        Assert.Equal(0.0, vehicle.State.GroundVelocityMps.Y);
        Assert.False(vehicle.State.Flyable);
        Assert.True(
            vehicle.State.Contact.NormalImpactSpeedMps
                > vehicle.Profile.HardImpactNormalSpeedMps);

        vehicle.Advance(VerticalInput(
            tick,
            new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0),
            environment: ground));

        Assert.Equal(VehicleContactKind.HardImpact, vehicle.State.Contact.Kind);
        Assert.Equal(skidHeightM, vehicle.State.PositionWorldM.Y);
        Assert.False(vehicle.State.Flyable);
        Assert.Equal(0.0, vehicle.Observation.Power.AppliedPowerW);
    }

    [Fact]
    public void ProtectionInterventionEvidencePassesThroughWithoutClinicalCoupling() {
        var vehicle = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(0.0, 40.0, 0.0),
            Vec3D.Zero,
            0.0,
            initialRecurringBaseMassKg: 5_800.0);
        var evidence = new VehicleProtectionInterventionEvidence(
            Active: true,
            VehicleProtectionInterventionKind.GroundCollisionAvoidance,
            Cue: "terrain-pull",
            Sequence: 17);

        PlayerVehicleAdvanceResult result = vehicle.Advance(
            VerticalInput(
                0,
                new VerticalLiftPilotCommand(0.9, 0.0, 0.0, 0.0),
                intervention: evidence));

        Assert.Equal(evidence, result.Observation.ProtectionIntervention);
    }

    [Fact]
    public void VerticalLiftProviderIsBitDeterministicAtProductionRate() {
        var first = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(20.0, 65.0, -15.0),
            new Vec3D(2.0, -0.2, 4.0),
            initialYawRad: 0.35,
            initialRecurringBaseMassKg: 5_750.0,
            initialAdditivePayloadMassKg: 420.0);
        var second = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(20.0, 65.0, -15.0),
            new Vec3D(2.0, -0.2, 4.0),
            initialYawRad: 0.35,
            initialRecurringBaseMassKg: 5_750.0,
            initialAdditivePayloadMassKg: 420.0);

        for (long tick = 0; tick < 720; tick++) {
            var command = new VerticalLiftPilotCommand(
                Collective: 0.84 + 0.04 * Math.Sin(tick * 0.017),
                ForwardCyclic: 0.32 * Math.Sin(tick * 0.011),
                RightCyclic: 0.25 * Math.Cos(tick * 0.013),
                Yaw: 0.18 * Math.Sin(tick * 0.007));
            var environment = new PlayerVehicleEnvironmentSample(
                1.18 + 0.02 * Math.Sin(tick * 0.003),
                new Vec3D(
                    7.0 + Math.Sin(tick * 0.005),
                    0.4 * Math.Cos(tick * 0.009),
                    -3.0),
                VehicleSurfaceSample.Horizontal("steppe", 0.0));
            PlayerVehicleAdvanceInput input = VerticalInput(
                tick,
                command,
                baseMassKg: 5_750.0,
                payloadMassKg: 420.0,
                environment: environment);

            Assert.Equal(first.Advance(input), second.Advance(input));
        }

        Assert.Equal(120.0, first.Capability.FixedStepHz);
        Assert.Equal(PlayerVehicleContract.FixedDeltaSeconds,
            1.0 / first.Capability.FixedStepHz);
    }

    [Fact]
    public void CapabilitiesDiscloseAuthorityAndModelLimits() {
        var fixedWing = new FixedWingAircraftVehicleAdapter(
            "fighter",
            new AircraftSim(FixedWingInitialState(), FlightModel.Sabre),
            maximumGrossMassKg: 8_000.0,
            maximumAdditivePayloadMassKg: 900.0);
        var vertical = new ReducedOrderVerticalLiftAirAmbulance(
            "ambulance",
            new Vec3D(0.0, 50.0, 0.0),
            Vec3D.Zero,
            0.0,
            initialRecurringBaseMassKg: 5_800.0);

        Assert.Equal(PlayerVehicleContract.SchemaVersion,
            fixedWing.Capability.SchemaVersion);
        Assert.Equal(VehicleCommandFamily.FixedWingPilot,
            fixedWing.Capability.CommandFamily);
        Assert.Equal(VehicleContactAuthority.ExternalResolver,
            fixedWing.Capability.ContactAuthority);
        Assert.False(fixedWing.Capability.ReportsPowerMargin);

        Assert.Equal(PlayerVehicleContract.SchemaVersion,
            vertical.Capability.SchemaVersion);
        Assert.Equal(VehicleCommandFamily.VerticalLiftPilot,
            vertical.Capability.CommandFamily);
        Assert.Equal(VehicleContactAuthority.IntegratedSkidContact,
            vertical.Capability.ContactAuthority);
        Assert.True(vertical.Capability.ReportsPowerMargin);
        Assert.Contains("momentum-theory",
            vertical.Capability.FidelityDisclosure,
            StringComparison.Ordinal);
        Assert.Contains("not a performance claim",
            vertical.Capability.FidelityDisclosure,
            StringComparison.Ordinal);
    }
}
