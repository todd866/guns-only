using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles.Rotorcraft;

public sealed class Ah1gCobraDynamicsTests
{
    const double BasicMissionMassKg = 4_051.0;

    static Ah1gCobraDynamics Create(
        string id,
        Vec3D? position = null,
        Vec3D? velocity = null,
        double initialYawRad = 0.0) =>
        new(
            id,
            position ?? new Vec3D(0.0, 500.0, 0.0),
            velocity ?? Vec3D.Zero,
            initialYawRad,
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

    static double LoadFactor(Ah1gCobraDynamics cobra) =>
        cobra.Telemetry.MainRotorThrustN / (BasicMissionMassKg * FlightModel.G0);

    static double WrapPi(double angle)
    {
        while (angle > Math.PI) angle -= 2.0 * Math.PI;
        while (angle < -Math.PI) angle += 2.0 * Math.PI;
        return angle;
    }

    readonly record struct CollectivePullSample(
        double MainRotorRpm,
        double TorqueFraction,
        double LoadFactor,
        BodyRates ExcessRates);

    sealed record CollectiveWorkloadReport(
        double MinimumMainRotorRpm,
        double MaximumTorqueFraction,
        double MaximumLoadFactor,
        double MaximumAbsRollRate,
        double MaximumAbsPitchRate,
        double MaximumAbsYawRate,
        double OpenPeakPitchErrorRad,
        double CorrectedPeakPitchErrorRad,
        double OpenPeakYawErrorRad,
        double CorrectedPeakYawErrorRad,
        double MeanAbsCyclicCorrection,
        double PeakAbsCyclicCorrection,
        double MeanAbsPedalCorrection,
        double PeakAbsPedalCorrection);

    static CollectiveWorkloadReport FlyCollectiveWorkload(
        in Vec3D initialVelocity,
        double baselineForwardCyclic)
    {
        var reference = Create("collective-workload-reference", velocity: initialVelocity);
        var open = Create("collective-workload-open", velocity: initialVelocity);
        var corrected = Create("collective-workload-corrected", velocity: initialVelocity);
        double trim = reference.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var trimCommand = new VerticalLiftPilotCommand(
            trim,
            baselineForwardCyclic,
            0.0,
            0.0);
        for (long tick = 0; tick < 480; tick++)
        {
            reference.Advance(Input(tick, trimCommand));
            open.Advance(Input(tick, trimCommand));
            corrected.Advance(Input(tick, trimCommand));
        }

        double minimumRpm = double.PositiveInfinity;
        double maximumTorque = 0.0;
        double maximumLoad = 0.0;
        double maximumAbsP = 0.0;
        double maximumAbsQ = 0.0;
        double maximumAbsR = 0.0;
        double openPeakPitchError = 0.0;
        double correctedPeakPitchError = 0.0;
        double openPeakYawError = 0.0;
        double correctedPeakYawError = 0.0;
        double cyclicWork = 0.0;
        double pedalWork = 0.0;
        double peakCyclic = 0.0;
        double peakPedal = 0.0;
        const int PullTicks = 780;
        for (int step = 0; step < PullTicks; step++)
        {
            long tick = 480 + step;
            double elapsedSeconds = step * PlayerVehicleContract.FixedDeltaSeconds;
            double collective = Math.Min(1.0, trim + 0.40 * elapsedSeconds);
            double pitchError = corrected.Observation.PitchRad
                - reference.Observation.PitchRad;
            double pitchRateError = corrected.State.BodyRates.Q
                - reference.State.BodyRates.Q;
            double yawError = WrapPi(corrected.Observation.YawRad
                - reference.Observation.YawRad);
            double yawRateError = corrected.State.BodyRates.R
                - reference.State.BodyRates.R;
            // This is an instrumented test pilot, not product assistance. Its required input is
            // the workload metric, and the open-loop aircraft remains beside it as the authority.
            double correctingCyclic = Math.Clamp(
                baselineForwardCyclic + 4.0 * pitchError + 1.2 * pitchRateError,
                -0.65,
                0.65);
            double correctingPedal = Math.Clamp(
                -1.5 * yawError - 0.55 * yawRateError,
                -0.65,
                0.65);

            reference.Advance(Input(tick, trimCommand));
            open.Advance(Input(tick,
                new VerticalLiftPilotCommand(
                    collective,
                    baselineForwardCyclic,
                    0.0,
                    0.0)));
            corrected.Advance(Input(tick,
                new VerticalLiftPilotCommand(
                    collective,
                    correctingCyclic,
                    0.0,
                    correctingPedal)));

            BodyRates excessRates = new(
                open.State.BodyRates.P - reference.State.BodyRates.P,
                open.State.BodyRates.Q - reference.State.BodyRates.Q,
                open.State.BodyRates.R - reference.State.BodyRates.R);
            minimumRpm = Math.Min(minimumRpm, open.Telemetry.MainRotorRpm);
            maximumTorque = Math.Max(maximumTorque,
                open.Telemetry.TransmissionLimitFraction);
            maximumLoad = Math.Max(maximumLoad, LoadFactor(open));
            maximumAbsP = Math.Max(maximumAbsP, Math.Abs(excessRates.P));
            maximumAbsQ = Math.Max(maximumAbsQ, Math.Abs(excessRates.Q));
            maximumAbsR = Math.Max(maximumAbsR, Math.Abs(excessRates.R));
            openPeakPitchError = Math.Max(openPeakPitchError,
                Math.Abs(open.Observation.PitchRad - reference.Observation.PitchRad));
            correctedPeakPitchError = Math.Max(correctedPeakPitchError,
                Math.Abs(corrected.Observation.PitchRad - reference.Observation.PitchRad));
            openPeakYawError = Math.Max(openPeakYawError,
                Math.Abs(WrapPi(open.Observation.YawRad - reference.Observation.YawRad)));
            correctedPeakYawError = Math.Max(correctedPeakYawError,
                Math.Abs(WrapPi(corrected.Observation.YawRad - reference.Observation.YawRad)));
            double cyclicCorrection = Math.Abs(correctingCyclic - baselineForwardCyclic);
            double pedalCorrection = Math.Abs(correctingPedal);
            cyclicWork += cyclicCorrection;
            pedalWork += pedalCorrection;
            peakCyclic = Math.Max(peakCyclic, cyclicCorrection);
            peakPedal = Math.Max(peakPedal, pedalCorrection);
        }

        return new CollectiveWorkloadReport(
            minimumRpm,
            maximumTorque,
            maximumLoad,
            maximumAbsP,
            maximumAbsQ,
            maximumAbsR,
            openPeakPitchError,
            correctedPeakPitchError,
            openPeakYawError,
            correctedPeakYawError,
            cyclicWork / PullTicks,
            peakCyclic,
            pedalWork / PullTicks,
            peakPedal);
    }

    static PlayerVehicleEnvironmentSample BodyGradientEnvironment(
        in QuaternionD attitude)
    {
        Vec3D upTwoWorld = attitude.Rotate(new Vec3D(0.0, 2.0, 0.0));
        return new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Unknown,
            new RotorcraftAirflowSample(
                MainRotorForwardWindVelocityMps: upTwoWorld,
                MainRotorAftWindVelocityMps: upTwoWorld * -1.0,
                MainRotorLeftWindVelocityMps: Vec3D.Zero,
                MainRotorRightWindVelocityMps: Vec3D.Zero,
                TailRotorWindVelocityMps: Vec3D.Zero));
    }

    static double Degrees(double value) => value * Math.PI / 180.0;
    static double DegreesFromRadians(double value) => value * 180.0 / Math.PI;

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

        Assert.InRange(minimumRpm, 240.0, 322.5);
        Assert.True(cobra.Telemetry.EngineShaftPowerW > beforePowerW + 25_000.0);
        Assert.InRange(cobra.Telemetry.TransmissionLimitFraction, 0.80, 1.001);
        Assert.InRange(cobra.State.GroundVelocityMps.Y, 0.5, 20.0);
    }

    [Fact]
    public void DeliberateTakeoffPullDoesNotCreateAVisibleRotorRpmSag()
    {
        var cobra = Create("takeoff-governor");
        var flatPitch = new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0);
        // The playable Cobra sits at governed flight idle until the pilot deliberately raises
        // the lever. This is the exact cold-open sequence, without relying on browser cadence.
        for (long tick = 0; tick < 240; tick++) cobra.Advance(Input(tick, flatPitch));

        double minimumRpm = cobra.Telemetry.MainRotorRpm;
        double powerBeforePullW = cobra.Telemetry.EngineShaftPowerW;
        const int PullTicks = 300;
        for (int step = 0; step < PullTicks; step++)
        {
            double elapsedSeconds = step * PlayerVehicleContract.FixedDeltaSeconds;
            double collective = Math.Min(0.72, 0.40 * elapsedSeconds);
            cobra.Advance(Input(240 + step,
                new VerticalLiftPilotCommand(collective, 0.0, 0.0, 0.0)));
            minimumRpm = Math.Min(minimumRpm, cobra.Telemetry.MainRotorRpm);
        }

        Assert.True(minimumRpm >= 322.4,
            $"a normal 0.40/s takeoff pull sagged Nr to {minimumRpm:F1} rpm");
        Assert.True(cobra.Telemetry.EngineShaftPowerW > powerBeforePullW + 100_000.0,
            "shaft power must lead the takeoff load instead of waiting for a visible Nr error");
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
    public void UniformRotorcraftAirflowPreservesTheThreeArgumentEnvironmentPathExactly()
    {
        var legacy = Create("uniform-airflow");
        var sampled = Create("uniform-airflow");
        double trim = legacy.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.18, -0.12, 0.05);
        var uniformWind = new Vec3D(-4.0, 0.6, 1.2);
        var legacyEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            uniformWind,
            VehicleSurfaceSample.Unknown);
        var sampledEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            uniformWind,
            VehicleSurfaceSample.Unknown,
            new RotorcraftAirflowSample(
                uniformWind,
                uniformWind,
                uniformWind,
                uniformWind,
                uniformWind));

        Assert.Null(legacyEnvironment.RotorcraftAirflow);
        for (long tick = 0; tick < 240; tick++)
        {
            legacy.Advance(Input(tick, command, legacyEnvironment));
            sampled.Advance(Input(tick, command, sampledEnvironment));
        }

        Assert.Equal(Vec3D.Zero, sampled.LastGustMomentBodyNm);
        Assert.Equal(legacy.State, sampled.State);
        Assert.Equal(legacy.Observation, sampled.Observation);
        Assert.Equal(legacy.Telemetry, sampled.Telemetry);
    }

    [Fact]
    public void RotorcraftAirflowRejectsANonFiniteStation()
    {
        var cobra = Create("bad-airflow");
        var invalidEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Unknown,
            new RotorcraftAirflowSample(
                Vec3D.Zero,
                Vec3D.Zero,
                Vec3D.Zero,
                new Vec3D(double.NaN, 0.0, 0.0),
                Vec3D.Zero));

        Assert.Throws<ArgumentOutOfRangeException>(() => cobra.Advance(Input(
            0,
            new VerticalLiftPilotCommand(0.5, 0.0, 0.0, 0.0),
            invalidEnvironment)));
    }

    [Fact]
    public void RotorAndTailWindGradientsCreateAllThreeBodyRates()
    {
        var calm = Create("gradient-calm");
        var gusting = Create("gradient-gusting");
        double trim = calm.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        var gradientEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Unknown,
            new RotorcraftAirflowSample(
                MainRotorForwardWindVelocityMps: new Vec3D(0.0, 2.0, 0.0),
                MainRotorAftWindVelocityMps: new Vec3D(0.0, -2.0, 0.0),
                MainRotorLeftWindVelocityMps: new Vec3D(0.0, -2.0, 0.0),
                MainRotorRightWindVelocityMps: new Vec3D(0.0, 2.0, 0.0),
                TailRotorWindVelocityMps: new Vec3D(5.0, 0.0, 0.0)));

        calm.Advance(Input(0, command));
        gusting.Advance(Input(0, command, gradientEnvironment));

        Assert.True(Math.Abs(gusting.LastGustMomentBodyNm.X) > 1.0,
            $"Pitch gust moment was {gusting.LastGustMomentBodyNm.X:F3} Nm.");
        Assert.True(Math.Abs(gusting.LastGustMomentBodyNm.Y) > 1.0,
            $"Yaw gust moment was {gusting.LastGustMomentBodyNm.Y:F3} Nm.");
        Assert.True(Math.Abs(gusting.LastGustMomentBodyNm.Z) > 1.0,
            $"Roll gust moment was {gusting.LastGustMomentBodyNm.Z:F3} Nm.");
        Assert.True(gusting.LastGustMomentBodyNm.X < 0.0,
            "Up-flow over the forward disk must pitch the nose up.");
        Assert.True(gusting.LastGustMomentBodyNm.Y < 0.0,
            "Rightward tail flow must yaw the tail right / nose left.");
        Assert.True(gusting.LastGustMomentBodyNm.Z > 0.0,
            "Up-flow over the right disk must roll the rotorcraft left.");
        Assert.True(gusting.State.BodyRates.P < calm.State.BodyRates.P);
        Assert.True(gusting.State.BodyRates.Q > calm.State.BodyRates.Q);
        Assert.True(gusting.State.BodyRates.R < calm.State.BodyRates.R);
    }

    [Fact]
    public void RotorcraftGustMomentsAreCappedThroughMassScaledPublishedInertias()
    {
        var cobra = Create("bounded-gradient");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var extremeEnvironment = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Unknown,
            new RotorcraftAirflowSample(
                MainRotorForwardWindVelocityMps: new Vec3D(0.0, 10_000.0, 0.0),
                MainRotorAftWindVelocityMps: new Vec3D(0.0, -10_000.0, 0.0),
                MainRotorLeftWindVelocityMps: new Vec3D(0.0, -10_000.0, 0.0),
                MainRotorRightWindVelocityMps: new Vec3D(0.0, 10_000.0, 0.0),
                TailRotorWindVelocityMps: new Vec3D(10_000.0, 0.0, 0.0)));

        cobra.Advance(Input(0,
            new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0),
            extremeEnvironment));

        RotorcraftAirframeDefinition airframe = cobra.Definition.Airframe;
        double inertiaScale = BasicMissionMassKg / airframe.InertiaReferenceMassKg;
        double maximumPitchMomentNm = airframe.PitchInertiaKgM2 * inertiaScale
            * Math.PI / 15.0;
        double maximumYawMomentNm = airframe.YawInertiaKgM2 * inertiaScale
            * 2.0 * Math.PI / 45.0;
        double maximumRollMomentNm = airframe.RollInertiaKgM2 * inertiaScale
            * Math.PI / 10.0;

        Assert.Equal(maximumPitchMomentNm,
            Math.Abs(cobra.LastGustMomentBodyNm.X), 8);
        Assert.Equal(maximumYawMomentNm,
            Math.Abs(cobra.LastGustMomentBodyNm.Y), 8);
        Assert.Equal(maximumRollMomentNm,
            Math.Abs(cobra.LastGustMomentBodyNm.Z), 8);
        Assert.InRange(Math.Abs(cobra.State.BodyRates.P),
            0.0, cobra.Definition.Handling.MaximumRollRateRadPerSecond);
        Assert.InRange(Math.Abs(cobra.State.BodyRates.Q),
            0.0, cobra.Definition.Handling.MaximumPitchRateRadPerSecond);
        Assert.InRange(Math.Abs(cobra.State.BodyRates.R),
            0.0, cobra.Definition.TailRotor.MaximumYawRateRadPerSecond);
    }

    [Fact]
    public void HandsOffCyclicRatesDecayWithoutAOneSecondFreeze()
    {
        var roll = Create("rate-decay-roll");
        var pitch = Create("rate-decay-pitch");
        var pilotCounteredRoll = Create("rate-decay-pilot-counter");
        double trim = roll.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        for (long tick = 0; tick < 90; tick++)
        {
            roll.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, 0.60, 0.0)));
            pitch.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.60, 0.0, 0.0)));
            pilotCounteredRoll.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, 0.60, 0.0)));
        }

        double rollRateAtRelease = roll.State.BodyRates.P;
        double pitchRateAtRelease = pitch.State.BodyRates.Q;
        var handsOff = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 90; tick < 210; tick++)
        {
            roll.Advance(Input(tick, handsOff));
            pitch.Advance(Input(tick, handsOff));
            pilotCounteredRoll.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, -0.60, 0.0)));
        }

        Assert.True(rollRateAtRelease > 0.10,
            $"Right cyclic produced only {rollRateAtRelease:F3} rad/s P.");
        Assert.True(pitchRateAtRelease < -0.10,
            $"Forward cyclic produced only {pitchRateAtRelease:F3} rad/s Q.");
        Assert.InRange(roll.State.BodyRates.P,
            0.25 * rollRateAtRelease,
            0.90 * rollRateAtRelease);
        Assert.InRange(-pitch.State.BodyRates.Q,
            0.25 * -pitchRateAtRelease,
            0.90 * -pitchRateAtRelease);
        Assert.True(pilotCounteredRoll.State.BodyRates.P
            < roll.State.BodyRates.P - 0.20,
            "Opposite pilot cyclic should answer much faster than natural hands-off damping.");

        double maximumRollScasRadPerSecond = 0.125
            * roll.Definition.Handling.MaximumRollRateRadPerSecond;
        double maximumPitchScasRadPerSecond = 0.125
            * pitch.Definition.Handling.MaximumPitchRateRadPerSecond;
        Assert.InRange(Math.Abs(roll.LastCyclicScasRateCommand.P),
            0.0, maximumRollScasRadPerSecond + 1e-12);
        Assert.InRange(Math.Abs(pitch.LastCyclicScasRateCommand.Q),
            0.0, maximumPitchScasRadPerSecond + 1e-12);
        Assert.True(roll.LastCyclicScasRateCommand.P < 0.0,
            "Roll-rate SCAS must oppose positive P without holding bank attitude.");
        Assert.True(pitch.LastCyclicScasRateCommand.Q > 0.0,
            "Pitch-rate SCAS must oppose negative Q without holding pitch attitude.");
    }

    [Fact]
    public void FailedScasRemovesAllAugmentationWithoutRemovingPilotControls()
    {
        var cobra = Create("scas-failed");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var maneuver = new VerticalLiftPilotCommand(trim, 0.45, 0.50, -0.35);

        for (long tick = 0; tick < 90; tick++)
            cobra.Advance(Input(tick, maneuver));

        Assert.True(cobra.ScasOperating);
        Assert.True(Math.Abs(cobra.LastCyclicScasRateCommand.P) > 1e-6
            || Math.Abs(cobra.LastCyclicScasRateCommand.Q) > 1e-6);

        cobra.FailScas();
        cobra.Advance(Input(90, maneuver));

        Assert.False(cobra.ScasOperating);
        Assert.Equal(default, cobra.LastCyclicScasRateCommand);
        Assert.Equal(0.0, cobra.Telemetry.ScasYawRadPerSecond);
        Assert.True(Math.Abs(cobra.State.BodyRates.P) > 0.05,
            "Right cyclic must remain authoritative with SCAS out.");
        Assert.True(Math.Abs(cobra.State.BodyRates.Q) > 0.05,
            "Forward cyclic must remain authoritative with SCAS out.");
        Assert.True(Math.Abs(cobra.State.BodyRates.R) > 0.01,
            "Pedal must remain authoritative with SCAS out.");
    }

    [Fact]
    public void MaximumCollectiveInitialLoadStaysInsideTheNumericalFlightEnvelope()
    {
        var cobra = Create("maneuver");

        cobra.Advance(Input(0,
            new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0)));

        double oldCeilingN = cobra.Definition.Airframe.MaximumGrossMassKg
            * FlightModel.G0
            * 1.55;
        double numericalCeilingN = cobra.Definition.Airframe.MaximumGrossMassKg
            * FlightModel.G0
            * cobra.Definition.Handling.NumericalMainRotorLoadFactorGuard;
        Assert.InRange(cobra.Telemetry.MainRotorThrustN, oldCeilingN, numericalCeilingN);
        Assert.InRange(LoadFactor(cobra), 1.80, 2.60);
    }

    [Fact]
    public void ProductionRateCollectivePullHasImmediateBoundedPitchAndYawResponse()
    {
        var reference = Create("collective-transient-reference");
        var pulling = Create("collective-transient-pulling");
        double trim = reference.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 480; tick++)
        {
            reference.Advance(Input(tick, hover));
            pulling.Advance(Input(tick, hover));
        }

        var samples = new Dictionary<int, CollectivePullSample>();
        for (int step = 0; step < 120; step++)
        {
            long tick = 480 + step;
            double elapsedSeconds = step * PlayerVehicleContract.FixedDeltaSeconds;
            double collective = Math.Min(1.0, trim + 0.40 * elapsedSeconds);
            reference.Advance(Input(tick, hover));
            pulling.Advance(Input(tick,
                new VerticalLiftPilotCommand(collective, 0.0, 0.0, 0.0)));
            if (step + 1 is 30 or 60 or 120)
            {
                samples[step + 1] = new CollectivePullSample(
                    pulling.Telemetry.MainRotorRpm,
                    pulling.Telemetry.TransmissionLimitFraction,
                    LoadFactor(pulling),
                    new BodyRates(
                        pulling.State.BodyRates.P - reference.State.BodyRates.P,
                        pulling.State.BodyRates.Q - reference.State.BodyRates.Q,
                        pulling.State.BodyRates.R - reference.State.BodyRates.R));
            }
        }

        CollectivePullSample quarterSecond = samples[30];
        CollectivePullSample halfSecond = samples[60];
        CollectivePullSample oneSecond = samples[120];

        Assert.InRange(quarterSecond.MainRotorRpm, 315.0, 326.0);
        Assert.InRange(halfSecond.MainRotorRpm, 305.0, 326.0);
        Assert.InRange(oneSecond.MainRotorRpm, 285.0, 318.0);
        Assert.InRange(quarterSecond.TorqueFraction, 0.75, 0.96);
        Assert.InRange(halfSecond.TorqueFraction, 0.78, 1.001);
        Assert.InRange(oneSecond.TorqueFraction, 0.82, 1.001);
        Assert.InRange(quarterSecond.LoadFactor, 1.05, 1.45);
        Assert.InRange(halfSecond.LoadFactor, 1.15, 1.65);
        Assert.InRange(oneSecond.LoadFactor, 1.25, 1.85);

        Assert.InRange(quarterSecond.ExcessRates.P, Degrees(-0.25), Degrees(0.25));
        Assert.InRange(halfSecond.ExcessRates.P, Degrees(-0.25), Degrees(0.25));
        Assert.InRange(oneSecond.ExcessRates.P, Degrees(-0.25), Degrees(0.25));
        Assert.InRange(quarterSecond.ExcessRates.Q, Degrees(-1.5), Degrees(-0.10));
        Assert.InRange(halfSecond.ExcessRates.Q, Degrees(-4.0), Degrees(-0.50));
        Assert.InRange(oneSecond.ExcessRates.Q, Degrees(-10.0), Degrees(-2.0));
        Assert.InRange(quarterSecond.ExcessRates.R, Degrees(0.20), Degrees(2.5));
        Assert.InRange(halfSecond.ExcessRates.R, Degrees(1.0), Degrees(5.0));
        Assert.InRange(oneSecond.ExcessRates.R, Degrees(3.0), Degrees(9.0));
        Assert.True(pulling.LastCollectiveHubMomentBodyNm.X > 1.0);
    }

    [Fact]
    public void SustainedHoverFullPullIsBoundedAndRequiresCyclicAndPedalWork()
    {
        CollectiveWorkloadReport report = FlyCollectiveWorkload(
            Vec3D.Zero,
            baselineForwardCyclic: 0.0);

        Assert.InRange(report.MinimumMainRotorRpm, 235.0, 310.0);
        Assert.InRange(report.MaximumTorqueFraction, 0.90, 1.001);
        Assert.InRange(report.MaximumLoadFactor, 1.15, 2.00);
        Assert.InRange(report.MaximumAbsRollRate, 0.0, Degrees(2.0));
        Assert.InRange(report.MaximumAbsPitchRate, Degrees(1.0), Degrees(20.0));
        Assert.InRange(report.MaximumAbsYawRate, Degrees(2.0), Degrees(15.0));

        Assert.InRange(report.MeanAbsCyclicCorrection, 0.015, 0.20);
        Assert.InRange(report.PeakAbsCyclicCorrection, 0.025, 0.35);
        Assert.InRange(report.MeanAbsPedalCorrection, 0.015, 0.20);
        Assert.InRange(report.PeakAbsPedalCorrection, 0.025, 0.35);
        Assert.True(report.CorrectedPeakPitchErrorRad
            < 0.60 * report.OpenPeakPitchErrorRad,
            $"Cyclic correction did not reduce peak pitch error: open "
            + $"{DegreesFromRadians(report.OpenPeakPitchErrorRad):F2}°, corrected "
            + $"{DegreesFromRadians(report.CorrectedPeakPitchErrorRad):F2}°.");
        Assert.True(report.CorrectedPeakYawErrorRad
            < 0.65 * report.OpenPeakYawErrorRad,
            $"Pedal correction did not reduce peak yaw error: open "
            + $"{DegreesFromRadians(report.OpenPeakYawErrorRad):F2}°, corrected "
            + $"{DegreesFromRadians(report.CorrectedPeakYawErrorRad):F2}°.");
    }

    [Fact]
    public void TrimAndStoppedRotorDoNotManufactureACollectiveHubMoment()
    {
        var trimmed = Create("collective-hub-trim");
        double trim = trimmed.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        trimmed.Advance(Input(0,
            new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0)));

        var stopped = Create("collective-hub-stopped");
        for (long tick = 0; tick < 900; tick++)
            stopped.Advance(Input(tick,
                new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0)));

        Assert.Equal(Vec3D.Zero, trimmed.LastCollectiveHubMomentBodyNm);
        Assert.Equal(Vec3D.Zero, stopped.LastCollectiveHubMomentBodyNm);
    }

    [Fact]
    public void LoadedRotorGustResponseDoesNotCollapseWithRpmCubedAtFullCollective()
    {
        var trimRotor = Create("loaded-gust-trim");
        var fullRotor = Create("loaded-gust-full");
        double trim = trimRotor.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        for (long tick = 0; tick < 600; tick++)
        {
            trimRotor.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0)));
            fullRotor.Advance(Input(tick,
                new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0)));
        }

        double trimRpm = trimRotor.Telemetry.MainRotorRpm;
        double fullRpm = fullRotor.Telemetry.MainRotorRpm;
        PlayerVehicleEnvironmentSample trimGradient = BodyGradientEnvironment(
            trimRotor.State.BodyAttitude);
        PlayerVehicleEnvironmentSample fullGradient = BodyGradientEnvironment(
            fullRotor.State.BodyAttitude);

        trimRotor.Advance(Input(600,
            new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0),
            trimGradient));
        fullRotor.Advance(Input(600,
            new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0),
            fullGradient));

        double responseRatio = Math.Abs(fullRotor.LastGustMomentBodyNm.X)
            / Math.Abs(trimRotor.LastGustMomentBodyNm.X);
        double oldRpmCubedRatio = Math.Pow(fullRpm / trimRpm, 3.0);
        Assert.True(double.IsFinite(responseRatio));
        Assert.InRange(responseRatio, 0.70, 1.35);
        Assert.True(responseRatio > oldRpmCubedRatio + 0.10,
            $"Loaded response {responseRatio:F3} still collapsed with Nr³ "
            + $"({oldRpmCubedRatio:F3}).");
    }

    [Fact]
    public void ContactEnvelopeThresholdsAreOrderedAndPositive()
    {
        RotorcraftContactDefinition contact = Create("contact-thresholds").Definition.Contact;
        Assert.InRange(contact.GearDamageNormalSpeedMps, 2.0, 4.0);
        Assert.True(contact.GearDamageNormalSpeedMps < contact.HardImpactNormalSpeedMps,
            "Gear damage must trip before the hard-impact kill.");
        // Rollover reuses the already-authored (previously unenforced) landing roll limit.
        Assert.InRange(contact.MaximumLandingRollRad, 0.25, 0.50);
        Assert.InRange(contact.RolloverLateralSpeedMps, 1.0, 2.5);
        Assert.InRange(contact.SpinContactYawRateRadPerSecond, 0.35, 0.80);
    }

    static readonly PlayerVehicleEnvironmentSample PadEnvironment = new(
        1.225,
        Vec3D.Zero,
        VehicleSurfaceSample.Horizontal("pad", 0.0));

    static bool Grounded(Ah1gCobraDynamics cobra) =>
        cobra.Observation.Contact.Kind is VehicleContactKind.SurfaceContact
            or VehicleContactKind.StableSurfaceContact
            or VehicleContactKind.HardImpact;

    [Fact]
    public void FlaredTouchdownAtDesignSinkStaysCleanAndFlyable()
    {
        var cobra = Create("flare-clean",
            new Vec3D(0.0, 6.315, 0.0),
            new Vec3D(0.0, -2.0, 8.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        double contactPitchRad = 0.0;
        long tick = 0;
        for (; tick < 900 && !Grounded(cobra); tick++)
        {
            // Ground effect would float a trimmed descent, so carry a deficit through the
            // cushion; a one-pulse aft-cyclic flare brings the nose up, wings level, no drift.
            double aftCyclic = tick is >= 120 and < 200 ? -0.5 : 0.0;
            cobra.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim - 0.05, aftCyclic, 0.0, 0.0),
                PadEnvironment));
            contactPitchRad = cobra.Observation.PitchRad;
        }

        Assert.True(Grounded(cobra), "Flared descent never reached the pad.");
        Assert.True(contactPitchRad > 0.15,
            $"The flare never developed: pitch {contactPitchRad:F3} rad at contact.");
        Assert.NotEqual(VehicleContactKind.HardImpact, cobra.Observation.Contact.Kind);
        Assert.Equal(VehicleContactFailureCause.None, cobra.LastContactFailureCause);
        Assert.False(cobra.GearDamaged);
        Assert.True(cobra.Observation.Flyable,
            "A nose-up flare at design sink must never read as a crash (attitude-blind rule).");
    }

    [Fact]
    public void FirmTouchdownAboveDesignSinkDamagesGearWithoutKillingAuthority()
    {
        var cobra = Create("gear-damage",
            new Vec3D(0.0, 0.365, 0.0),
            new Vec3D(0.0, -4.0, 0.0));
        var lowCollective = new VerticalLiftPilotCommand(0.2, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 60 && !Grounded(cobra); tick++)
            cobra.Advance(Input(tick, lowCollective, PadEnvironment));

        Assert.True(Grounded(cobra), "The firm arrival never contacted the pad.");
        Assert.True(cobra.GearDamaged,
            $"A {cobra.LastTouchdown.SinkMps:F2} m/s arrival should bend the gear.");
        Assert.NotEqual(VehicleContactKind.HardImpact, cobra.Observation.Contact.Kind);
        Assert.Equal(VehicleContactFailureCause.None, cobra.LastContactFailureCause);
        Assert.True(cobra.Observation.Flyable,
            "Gear damage is a consequence tier, not a kill.");
        Assert.InRange(cobra.LastTouchdown.SinkMps, 3.8, 4.4);
        Assert.InRange(cobra.LastTouchdown.LateralMps, 0.0, 0.5);
        Assert.InRange(cobra.LastTouchdown.YawRateRadPerSecond, 0.0, 0.1);
    }

    [Fact]
    public void BankedDriftingContactLatchesRollover()
    {
        var cobra = Create("rollover",
            new Vec3D(0.0, 4.315, 0.0),
            new Vec3D(0.0, -1.0, 0.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        double contactRollRad = 0.0;
        double contactLateralMps = 0.0;
        long tick = 0;
        for (; tick < 900 && !Grounded(cobra); tick++)
        {
            // Held right cyclic: the banked disk both rolls the aircraft past the landing
            // limit and accelerates it sideways — the classic dynamic-rollover arrival.
            cobra.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim - 0.04, 0.0, 0.6, 0.0),
                PadEnvironment));
            contactRollRad = cobra.Observation.RollRad;
            contactLateralMps = Math.Abs(
                cobra.State.BodyAttitude.Conjugate().Rotate(cobra.State.GroundVelocityMps).X);
        }

        Assert.True(Grounded(cobra), "The banked descent never contacted the pad.");
        Assert.Equal(VehicleContactFailureCause.Rollover, cobra.LastContactFailureCause);
        Assert.False(cobra.Observation.Flyable,
            $"Banked drifting contact (roll {contactRollRad:F3} rad, lateral "
            + $"{contactLateralMps:F2} m/s) must end the sortie.");
    }

    [Fact]
    public void SpinningContactLatchesSpinContact()
    {
        var cobra = Create("spin-contact",
            new Vec3D(0.0, 2.315, 0.0),
            new Vec3D(0.0, -1.0, 0.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        double contactYawRateRadPerSecond = 0.0;
        long tick = 0;
        for (; tick < 600 && !Grounded(cobra); tick++)
        {
            cobra.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim - 0.10, 0.0, 0.0, 1.0),
                PadEnvironment));
            contactYawRateRadPerSecond = Math.Abs(cobra.State.BodyRates.R);
        }

        Assert.True(Grounded(cobra), "The spinning descent never contacted the pad.");
        Assert.Equal(VehicleContactFailureCause.SpinContact, cobra.LastContactFailureCause);
        Assert.False(cobra.Observation.Flyable,
            $"Touching down at {contactYawRateRadPerSecond:F2} rad/s of yaw must end the "
            + "sortie.");
    }

    [Fact]
    public void BankedDescentRecordsGroundTrackNotSinkAsLateral()
    {
        var cobra = Create("banked-settle",
            new Vec3D(0.0, 1.815, 0.0),
            new Vec3D(0.0, -3.0, 0.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        double contactRollRad = 0.0;
        long tick = 0;
        for (; tick < 240 && !Grounded(cobra); tick++)
        {
            // A late right-cyclic pulse banks the disk in the final half-second of a mostly
            // vertical settle. The rollover predicate's lateral input must be GROUND TRACK:
            // rotating the full velocity into the banked body frame leaks sink into "lateral"
            // (here ~0.6 m/s of leak on top of ~0.6 m/s of true drift) and, at steeper banks
            // and harder sinks, kills a driftless settle below the gear-damage limit.
            cobra.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim - 0.15, 0.0, 1.0, 0.0),
                PadEnvironment));
            contactRollRad = cobra.Observation.RollRad;
        }

        Assert.True(Grounded(cobra), "The banked settle never contacted the pad.");
        Assert.True(Math.Abs(contactRollRad) > 0.15,
            $"The bank never developed: roll {contactRollRad:F3} rad at contact.");
        Assert.InRange(cobra.LastTouchdown.SinkMps, 3.0, 5.0);
        Assert.True(cobra.LastTouchdown.LateralMps < 0.8,
            $"Touchdown lateral must be ground track, not sink leakage: recorded "
            + $"{cobra.LastTouchdown.LateralMps:F2} m/s at roll {contactRollRad:F3} rad, "
            + $"sink {cobra.LastTouchdown.SinkMps:F2} m/s.");
        Assert.NotEqual(VehicleContactFailureCause.Rollover, cobra.LastContactFailureCause);
    }

    [Fact]
    public void LevelHighSinkContactLatchesHardImpactSpecifically()
    {
        var cobra = Create("hard-drop",
            new Vec3D(0.0, 0.365, 0.0),
            new Vec3D(0.0, -7.5, 0.0));
        var lowCollective = new VerticalLiftPilotCommand(0.2, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 60 && !Grounded(cobra); tick++)
            cobra.Advance(Input(tick, lowCollective, PadEnvironment));

        Assert.True(Grounded(cobra), "The vertical drop never contacted the pad.");
        Assert.Equal(VehicleContactFailureCause.HardImpact, cobra.LastContactFailureCause);
        Assert.False(cobra.Observation.Flyable);
        Assert.InRange(cobra.LastTouchdown.SinkMps, 7.2, 7.9);
    }

    [Fact]
    public void GentleWaterTouchdownStillEndsTheSortie()
    {
        var cobra = Create("water-contact",
            new Vec3D(0.0, 1.315, 0.0),
            new Vec3D(0.0, -1.5, 0.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var river = new PlayerVehicleEnvironmentSample(
            1.225,
            Vec3D.Zero,
            new VehicleSurfaceSample(
                IsKnown: true,
                SurfaceId: "cobra-canyon.water",
                HeightM: 0.0,
                UpNormal: new Vec3D(0.0, 1.0, 0.0),
                FrictionPerSecond: 4.0,
                SubmergesSkids: true));
        for (long tick = 0; tick < 240 && !Grounded(cobra); tick++)
            cobra.Advance(Input(tick,
                new VerticalLiftPilotCommand(trim - 0.10, 0.0, 0.0, 0.0), river));

        Assert.True(Grounded(cobra), "The water descent never reached the surface.");
        Assert.Equal(VehicleContactFailureCause.WaterContact, cobra.LastContactFailureCause);
        Assert.False(cobra.Observation.Flyable,
            "A perfectly gentle river touchdown is still the end of a skid helicopter.");
    }

    [Fact]
    public void NoFlareAutorotationEndsInAHardImpact()
    {
        var cobra = Create("auto-no-flare",
            new Vec3D(0.0, 150.315, 0.0),
            new Vec3D(0.0, 0.0, 20.0));
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        cobra.FailEngine();
        // The frozen pilot: collective stays at trim, no flare, no cushion.
        var frozen = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.18);
        long tick = 0;
        for (; tick < 4800 && !Grounded(cobra); tick++)
            cobra.Advance(Input(tick, frozen, PadEnvironment));

        Assert.True(Grounded(cobra), "The no-flare descent never reached the ground.");
        Assert.True(cobra.LastContactFailureCause
                is VehicleContactFailureCause.HardImpact
                or VehicleContactFailureCause.RotorStrike,
            $"A no-flare auto must be a crash: cause {cobra.LastContactFailureCause}, "
            + $"touchdown sink {cobra.LastTouchdown.SinkMps:F1} m/s.");
        Assert.False(cobra.Observation.Flyable,
            "Riding a dead engine into the ground without a flare must end the sortie.");
    }

    [Fact]
    public void FlownAutorotationTouchesDownSurvivably()
    {
        var cobra = Create("auto-flown",
            new Vec3D(0.0, 150.315, 0.0),
            new Vec3D(0.0, 0.0, 20.0));
        cobra.FailEngine();
        double minimumRpm = double.MaxValue;
        long tick = 0;
        for (; tick < 4800 && !Grounded(cobra); tick++)
        {
            double heightAglM = cobra.State.PositionWorldM.Y - 0.315;
            // Entry: dump collective to preserve Nr; glide. Flare: aft cyclic from 20 m to
            // trade speed for lift. Cushion: pop the stored rotor energy from 8 m.
            double collective = heightAglM > 8.0 ? 0.10 : 0.90;
            double aftCyclic = heightAglM is < 20.0 and > 6.0 ? -0.45 : 0.0;
            cobra.Advance(Input(tick,
                new VerticalLiftPilotCommand(collective, aftCyclic, 0.0, 0.18),
                PadEnvironment));
            minimumRpm = Math.Min(minimumRpm, cobra.Telemetry.MainRotorRpm);
        }

        Assert.True(Grounded(cobra), "The flown auto never reached the ground.");
        Assert.True(cobra.Observation.Flyable,
            $"A flown autorotation must be survivable: cause "
            + $"{cobra.LastContactFailureCause}, touchdown sink "
            + $"{cobra.LastTouchdown.SinkMps:F2} m/s, lateral "
            + $"{cobra.LastTouchdown.LateralMps:F2} m/s, yaw rate "
            + $"{cobra.LastTouchdown.YawRateRadPerSecond:F2} rad/s, minimum Nr "
            + $"{minimumRpm:F0} rpm.");
        Assert.True(cobra.LastTouchdown.SinkMps
                < cobra.Definition.Contact.HardImpactNormalSpeedMps,
            $"Touchdown sink {cobra.LastTouchdown.SinkMps:F2} m/s exceeded the hard-impact "
            + "limit despite the flare.");
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
    public void FeetOffHoverCollectiveNeedsPedalPastLimitedScas()
    {
        // Build 307: hover must leave clearer residual than Build 306's "mostly held".
        var cobra = Create("scas-hover");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 480; tick++)
            cobra.Advance(Input(tick, hover));

        Assert.True(Math.Abs(cobra.Telemetry.YawResidualRadPerSecond) > 0.02,
            $"Hover residual too small: {cobra.Telemetry.YawResidualRadPerSecond:F4} rad/s");
        Assert.InRange(Math.Abs(cobra.Telemetry.ScasYawRadPerSecond),
            0.0,
            0.125 * cobra.Definition.TailRotor.MaximumYawRateRadPerSecond + 1e-12);

        double yaw0 = cobra.Observation.YawRad;
        for (long tick = 480; tick < 840; tick++)
            cobra.Advance(Input(tick, hover));

        double driftRad = cobra.Observation.YawRad - yaw0;
        Assert.True(driftRad > 0.12,
            $"Hover feet-off should yaw right past SCAS; Δyaw={driftRad:F3} rad in 3 s.");
    }

    [Fact]
    public void FeetOffCruiseWeathervaneHoldsHeadingBetterThanHoverResidualAlone()
    {
        // Forward flight: weathervane damping should arrest continuous right crawl.
        var cruise = Create("scas-cruise", velocity: new Vec3D(0.0, 0.0, 45.0));
        double trim = cruise.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        // Slight forward cyclic to hold speed; feet off.
        var command = new VerticalLiftPilotCommand(trim, 0.12, 0.0, 0.0);
        for (long tick = 0; tick < 480; tick++)
            cruise.Advance(Input(tick, command));

        Assert.True(cruise.Telemetry.AdvanceRatio > 0.10,
            $"expected cruise µ, got {cruise.Telemetry.AdvanceRatio:F3}");
        Assert.True(Math.Abs(cruise.Telemetry.WeathervaneYawRadPerSecond) > 1e-4
            || Math.Abs(cruise.State.BodyRates.R) < 0.02,
            "weathervane should engage or yaw rate already small in cruise");

        double yaw0 = cruise.Observation.YawRad;
        for (long tick = 480; tick < 840; tick++)
            cruise.Advance(Input(tick, command));

        double driftRad = Math.Abs(cruise.Observation.YawRad - yaw0);
        Assert.True(driftRad < 0.18,
            $"Cruise feet-off heading drift {driftRad:F3} rad in 3 s — weathervane should help.");
    }

    [Fact]
    public void TranslationalFlowWeathervanesTheNoseTowardTheAirTrack()
    {
        const double InitialYawRad = Math.PI / 4.0;
        var cobra = Create(
            "weathervane-sideslip",
            velocity: new Vec3D(0.0, 0.0, 45.0),
            initialYawRad: InitialYawRad);
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var command = new VerticalLiftPilotCommand(trim, 0.10, 0.0, 0.0);
        cobra.Advance(Input(0, command));
        double initialSideslipRad = cobra.Telemetry.SideslipRad;
        Assert.True(cobra.Telemetry.WeathervaneYawRadPerSecond < -Degrees(20.0),
            $"initial left sideslip should command a strong left weathercock rate, got "
            + $"{cobra.Telemetry.WeathervaneYawRadPerSecond * 180.0 / Math.PI:F1}°/s");

        for (long tick = 1; tick < 360; tick++)
            cobra.Advance(Input(tick, command));

        double finalSideslipRad = cobra.Telemetry.SideslipRad;
        Assert.True(Math.Abs(finalSideslipRad) < Math.Abs(initialSideslipRad) - Degrees(12.0),
            $"fin should reduce sideslip: {initialSideslipRad * 180.0 / Math.PI:F1}° -> "
            + $"{finalSideslipRad * 180.0 / Math.PI:F1}°");
        Assert.True(cobra.Observation.YawRad < InitialYawRad - Degrees(10.0),
            $"nose barely weathercocked: yaw "
            + $"{cobra.Observation.YawRad * 180.0 / Math.PI:F1}°");
    }

    [Fact]
    public void TailRotorCanPivotDecisivelyAtLowAirspeed()
    {
        var cobra = Create("stall-turn-pedal-authority");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 240; tick++)
            cobra.Advance(Input(tick, hover));

        Assert.True(cobra.Telemetry.DirectionalAirSpeedMps < 2.0,
            $"fixture did not settle at low airspeed: "
            + $"{cobra.Telemetry.DirectionalAirSpeedMps:F2} m/s");
        double yawAtPedalApplication = cobra.Observation.YawRad;
        var fullRightPedal = hover with { Yaw = 1.0 };
        for (long tick = 240; tick < 390; tick++)
            cobra.Advance(Input(tick, fullRightPedal));

        double yawChangeRad = WrapPi(cobra.Observation.YawRad - yawAtPedalApplication);
        Assert.True(yawChangeRad > Degrees(30.0),
            $"full pedal produced only {yawChangeRad * 180.0 / Math.PI:F1}° in 1.25 s");
        Assert.True(cobra.State.BodyRates.R > Degrees(35.0),
            $"tail rotor reached only "
            + $"{cobra.State.BodyRates.R * 180.0 / Math.PI:F1}°/s");
    }

    [Fact]
    public void WeathervaneDampingWashesOffAtTheApexEvenIfRotorAdvanceRatioStaysHigh()
    {
        const double HighDiscAdvanceRatio = 0.30;
        Assert.Equal(0.0, Ah1gCobraDynamics.WeathervaneDampingSchedule(
            HighDiscAdvanceRatio,
            directionalAirSpeedMps: 0.5));
        Assert.True(Ah1gCobraDynamics.WeathervaneDampingSchedule(
            HighDiscAdvanceRatio,
            directionalAirSpeedMps: 8.0) > 1.0,
            "rate damping should remain available through a normal translational approach");
    }

    [Fact]
    public void CruiseWeathervaneDampsButDoesNotEraseYawRateInOneSecond()
    {
        var reference = Create("yaw-decay-reference", velocity: new Vec3D(0.0, 0.0, 45.0));
        var disturbed = Create("yaw-decay-disturbed", velocity: new Vec3D(0.0, 0.0, 45.0));
        double trim = reference.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var cruise = new VerticalLiftPilotCommand(trim, 0.12, 0.0, 0.0);
        for (long tick = 0; tick < 480; tick++)
        {
            reference.Advance(Input(tick, cruise));
            disturbed.Advance(Input(tick, cruise));
        }

        var yawPulse = cruise with { Yaw = 0.60 };
        for (long tick = 480; tick < 504; tick++)
        {
            reference.Advance(Input(tick, cruise));
            disturbed.Advance(Input(tick, yawPulse));
        }

        double excessYawRateAtRelease = Math.Abs(
            disturbed.State.BodyRates.R - reference.State.BodyRates.R);
        for (long tick = 504; tick < 624; tick++)
        {
            reference.Advance(Input(tick, cruise));
            disturbed.Advance(Input(tick, cruise));
        }

        double excessYawRateAfterOneSecond = Math.Abs(
            disturbed.State.BodyRates.R - reference.State.BodyRates.R);
        double retainedFraction = excessYawRateAfterOneSecond
            / excessYawRateAtRelease;
        Console.WriteLine(
            $"Cruise excess yaw-rate retention after 1 s: {retainedFraction:P1} "
            + $"({excessYawRateAtRelease:F4} -> {excessYawRateAfterOneSecond:F4} rad/s)");
        Assert.True(excessYawRateAtRelease > 0.08,
            $"Yaw pulse produced only {excessYawRateAtRelease:F4} rad/s excess R.");
        Assert.InRange(retainedFraction, 0.05, 0.35);
    }

    [Fact]
    public void FeetOffHardCollectiveLeavesPedalWorkAfterLimitedScas()
    {
        // Owner 2026-08-10 Build 305 flight: slow autotrim zeroed high-TQ heading bias and
        // felt too easy. SCAS-only must leave residual yaw at high collective.
        var cobra = Create("scas-hard");
        double trim = cobra.EstimateHoverCollective(BasicMissionMassKg, 1.225);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (long tick = 0; tick < 480; tick++)
            cobra.Advance(Input(tick, hover));

        double yaw0 = cobra.Observation.YawRad;
        const double CollectiveSlewPerSecond = 0.40;
        for (long tick = 480; tick < 660; tick++)
        {
            double elapsed = (tick - 480) / 120.0;
            double collective = Math.Min(1.0, trim + CollectiveSlewPerSecond * elapsed);
            cobra.Advance(Input(tick, new VerticalLiftPilotCommand(collective, 0.0, 0.0, 0.0)));
        }

        double yawDuringPull = cobra.Observation.YawRad - yaw0;
        Assert.True(cobra.State.GroundVelocityMps.Y > 0.5, "hard collective should climb");
        Assert.True(yawDuringPull > 0.08,
            $"Expected right yaw during feet-off collective pull; Δyaw={yawDuringPull:F3} rad.");

        double yawAtHold = cobra.Observation.YawRad;
        var hold = new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0);
        for (long tick = 660; tick < 1260; tick++)
            cobra.Advance(Input(tick, hold));

        double holdDriftRad = cobra.Observation.YawRad - yawAtHold;
        Assert.True(holdDriftRad > 0.12,
            $"Full-collective feet-off should keep yawing past SCAS; Δyaw={holdDriftRad:F3} rad in 5 s.");
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
    public void ColdInitialConditionStartsFromZeroAndSpoolsThroughLiveDynamics()
    {
        var cobra = new Ah1gCobraDynamics(
            "cold-spare",
            new Vec3D(0.0, 0.315, 0.0),
            Vec3D.Zero,
            initialYawRad: 0.0,
            initialRecurringBaseMassKg: BasicMissionMassKg,
            initialPowerplantState: Ah1gCobraInitialPowerplantState.Cold);
        var down = new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0);

        Assert.False(cobra.EngineOperating);
        Assert.Equal(0.0, cobra.Telemetry.MainRotorRpm);
        Assert.Equal(0.0, cobra.Telemetry.EngineShaftPowerW);

        cobra.StartEngine();
        for (long tick = 0;
            tick < 12 * PlayerVehicleContract.FixedStepHz
                && cobra.Telemetry.MainRotorRpm
                    < Ah1gCobraDefinition.LateProduction.MainRotor.MinimumContinuousRpm;
            tick++)
            cobra.Advance(Input(tick, down, PadEnvironment));

        Assert.True(cobra.EngineOperating);
        Assert.True(cobra.Telemetry.EngineShaftPowerW > 0.0);
        Assert.True(cobra.Telemetry.MainRotorRpm
            >= Ah1gCobraDefinition.LateProduction.MainRotor.MinimumContinuousRpm,
            $"Cold start stalled at {cobra.Telemetry.MainRotorRpm:F1} rpm.");
        Assert.Equal(VehicleContactKind.StableSurfaceContact, cobra.State.Contact.Kind);
    }

    [Fact]
    public void CockpitShutdownRunsTheGroundedRotorBelowTransferSpeed()
    {
        var cobra = Create("cockpit-shutdown", new Vec3D(0.0, 0.315, 0.0));
        var down = new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0);

        cobra.ShutdownEngine();
        for (long tick = 0; tick < 8 * PlayerVehicleContract.FixedStepHz; tick++)
            cobra.Advance(Input(tick, down, PadEnvironment));

        Assert.False(cobra.EngineOperating);
        Assert.True(cobra.Telemetry.EngineShaftPowerW
            <= cobra.Telemetry.AvailableShaftPowerW * 0.05);
        Assert.InRange(cobra.Telemetry.MainRotorRpm, 0.0, 50.0);
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
            var wind = new Vec3D(
                -3.0 + 0.7 * Math.Sin(tick * 0.007),
                0.4 * Math.Cos(tick * 0.009),
                0.8 * Math.Sin(tick * 0.005));
            var environment = new PlayerVehicleEnvironmentSample(
                1.225,
                wind,
                VehicleSurfaceSample.Unknown,
                new RotorcraftAirflowSample(
                    wind + new Vec3D(0.0, 0.9, 0.0),
                    wind + new Vec3D(0.0, -0.7, 0.0),
                    wind + new Vec3D(0.0, -0.5, 0.0),
                    wind + new Vec3D(0.0, 0.8, 0.0),
                    wind + new Vec3D(1.2, 0.0, 0.0)));
            first.Advance(Input(tick, command, environment));
            second.Advance(Input(tick, command, environment));
        }

        Assert.Equal(first.State, second.State);
        Assert.Equal(first.Observation, second.Observation);
        Assert.Equal(first.Telemetry, second.Telemetry);
        Assert.Equal(first.LastGustMomentBodyNm, second.LastGustMomentBodyNm);
        Assert.Equal(first.LastCollectiveHubMomentBodyNm,
            second.LastCollectiveHubMomentBodyNm);
        Assert.Equal(first.LastCyclicScasRateCommand,
            second.LastCyclicScasRateCommand);
        Assert.True(double.IsFinite(first.Telemetry.MainRotorClearanceM));
    }
}
