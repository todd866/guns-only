using System.Text.Json;
using GunsOnly.Sim.Okanagan;
using GunsOnly.Web;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests.Okanagan;

// These test an explicitly optional assistance controller, not raw aircraft handling or OEM
// autopilot performance. Static equilibrium is fixture setup; all subsequent pilot inputs are
// fixed pulses/steps. No test pilot steers the response back inside the assertions.
public sealed class FireBossAutoTrimTests(ITestOutputHelper output)
{
    const double Dt = FireBossDynamics.FixedDeltaSeconds;
    const double Deg = Math.PI / 180;
    static readonly AircraftParams Parameters = FlightModel.At802fFireBossPublicDataSurrogate;

    [Fact]
    public void ManualModeReplaysRawDynamicsExactly()
    {
        var (raw, command) = LevelStart();
        var (assisted, _) = LevelStart();
        var trim = new FireBossAutoTrim(false);
        for (int tick = 0; tick < Ticks(3); tick++)
        {
            var input = command with { Pitch = tick < 60 ? 0.15 : 0,
                Roll = 0.03, Yaw = -0.01 };
            Assert.Equal(input, trim.Apply(assisted, input, Dt));
            raw.Step(input);
            assisted.Step(input);
        }
        Assert.Equal(raw.Telemetry, assisted.Telemetry);
        Assert.Equal("manual", trim.State.Status);
    }

    [Fact]
    public void ApplyingAssistanceCannotMutateAircraftOrOtherControls()
    {
        var (aircraft, command) = LevelStart();
        var trim = new FireBossAutoTrim();
        command = command with { Roll = .31, Yaw = -.27, Throttle = .81,
            ScoopsExtended = true, DropRequested = true };
        AircraftState before = aircraft.SharedAircraft.State;
        FireBossTelemetry telemetry = aircraft.Telemetry;
        FireBossPilotCommand actual = trim.Apply(aircraft, command, Dt);
        Assert.Equal(command, actual with { ElevatorTrim = command.ElevatorTrim });
        Assert.Equal(before, aircraft.SharedAircraft.State);
        Assert.Equal(telemetry, aircraft.Telemetry);
        Assert.InRange(Math.Abs(actual.ElevatorTrim - command.ElevatorTrim), 0,
            FireBossAutoTrim.MaximumTrimRatePerSecond * Dt + 1e-12);
    }

    [Fact]
    public void ShortPullReleaseKeepsSelectedNoseAndClimbInsteadOfLaggingFlightPath()
    {
        var (aircraft, command) = LevelStart();
        var (manual, _) = LevelStart();
        var trim = new FireBossAutoTrim();
        trim.Apply(aircraft, command, Dt);
        double initial = aircraft.Telemetry.PitchRad;
        for (int tick = 0; tick < Ticks(.8); tick++)
        {
            var input = command with { Pitch = .25 };
            double correction = trim.State.Correction;
            aircraft.Step(trim.Apply(aircraft, input, Dt));
            manual.Step(input);
            Assert.Equal(correction, trim.State.Correction);
            Assert.Equal("pilot", trim.State.Status);
        }
        double released = aircraft.Telemetry.PitchRad;
        double releaseGamma = aircraft.SharedAircraft.State.Gamma;
        output.WriteLine($"pulse capture: initial={initial / Deg:F3}, pitch={released / Deg:F3}, gamma={releaseGamma / Deg:F3}");
        aircraft.Step(trim.Apply(aircraft, command, Dt));
        Assert.Equal(released, trim.State.TargetPitchRad);
        Assert.True(released > initial + Deg);
        // This positively cambered surrogate can fly at negative incidence. The important
        // distinction is chosen nose attitude versus instantaneous velocity, not AoA sign.
        Assert.True(Math.Abs(released - releaseGamma) > .5 * Deg);
        Step(aircraft, trim, command, 12);
        for (int tick = 0; tick < Ticks(12); tick++) manual.Step(command);
        double error = Math.Abs(aircraft.Telemetry.PitchRad - released);
        output.WriteLine($"pull release: initial={initial / Deg:F2}, target={released / Deg:F2}, "
            + $"gamma at release={releaseGamma / Deg:F2}, final={aircraft.Telemetry.PitchRad / Deg:F2}, "
            + $"manual={manual.Telemetry.PitchRad / Deg:F2}, climb={aircraft.Telemetry.VerticalSpeedMps:F2}");
        Assert.InRange(error, 0, 1.5 * Deg);
        Assert.True(error < Math.Abs(manual.Telemetry.PitchRad - released) * .5);
        Assert.True(aircraft.Telemetry.VerticalSpeedMps > .5);
    }

    [Theory]
    [InlineData(.75)]
    [InlineData(1.5)]
    public void RunwayRotationReleaseRetainsUsefulClimb(double pullSeconds)
    {
        FireBossDynamics aircraft = FireBossDynamics.AtKelownaDeparture();
        var trim = new FireBossAutoTrim();
        var command = new FireBossPilotCommand(0, 0, 0, 1, false, false);
        int ticks = 0;
        while (aircraft.Telemetry.TrueAirspeedMps < 55 && ticks++ < Ticks(45))
            aircraft.Step(trim.Apply(aircraft, command, Dt));
        Assert.True(ticks < Ticks(45));
        Step(aircraft, trim, command with { Pitch = .55 }, pullSeconds);
        double released = aircraft.Telemetry.PitchRad;
        double altitude = aircraft.Telemetry.PositionWorldM.Y;
        Step(aircraft, trim, command, 12);
        output.WriteLine($"rotation release: target={released / Deg:F2}, final={aircraft.Telemetry.PitchRad / Deg:F2}, "
            + $"height gain={aircraft.Telemetry.PositionWorldM.Y - altitude:F2}, speed={aircraft.Telemetry.TrueAirspeedMps:F2}");
        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
        Assert.True(aircraft.Telemetry.Flyable);
        Assert.True(aircraft.Telemetry.PositionWorldM.Y > altitude + 10);
        Assert.InRange(Math.Abs(aircraft.Telemetry.PitchRad - released), 0, 2 * Deg);
    }

    [Fact]
    public void PowerStillChangesEnergyWhileTrimHoldsTheSelectedNose()
    {
        var (high, command) = LevelStart();
        var (low, _) = LevelStart();
        var highTrim = new FireBossAutoTrim();
        var lowTrim = new FireBossAutoTrim();
        double pitch = high.Telemetry.PitchRad;
        Step(high, highTrim, command with { Throttle = command.Throttle + .2 }, 15);
        Step(low, lowTrim, command with { Throttle = command.Throttle - .2 }, 15);
        output.WriteLine($"power: high/low speeds={high.Telemetry.TrueAirspeedMps:F2}/{low.Telemetry.TrueAirspeedMps:F2}, "
            + $"pitch={high.Telemetry.PitchRad / Deg:F3}/{low.Telemetry.PitchRad / Deg:F3}, "
            + $"trim={highTrim.State.AppliedTrim:F3}/{lowTrim.State.AppliedTrim:F3}");
        Assert.True(high.Telemetry.TrueAirspeedMps > low.Telemetry.TrueAirspeedMps + 2);
        Assert.True(Energy(high) > Energy(low) + 150);
        Assert.InRange(Math.Abs(high.Telemetry.PitchRad - pitch), 0, 1.5 * Deg);
        Assert.InRange(Math.Abs(low.Telemetry.PitchRad - pitch), 0, 1.5 * Deg);
        Assert.True(Math.Abs(highTrim.State.AppliedTrim - lowTrim.State.AppliedTrim) > .01);
    }

    [Fact]
    public void BankedTurnRetainsPilotBankAndHeadingFreedom()
    {
        var (aircraft, command) = LevelStart(bank: 30 * Deg);
        var trim = new FireBossAutoTrim();
        double pitch = aircraft.Telemetry.PitchRad;
        double heading = aircraft.Telemetry.HeadingRad;
        Step(aircraft, trim, command, 10);
        output.WriteLine($"turn: pitch error={(aircraft.Telemetry.PitchRad - pitch) / Deg:F3}, "
            + $"bank={aircraft.Telemetry.RollRad / Deg:F2}, heading change={(aircraft.Telemetry.HeadingRad - heading) / Deg:F2}");
        Assert.InRange(Math.Abs(aircraft.Telemetry.PitchRad - pitch), 0, 2 * Deg);
        Assert.True(aircraft.Telemetry.RollRad > 15 * Deg);
        Assert.True(aircraft.Telemetry.HeadingRad > heading + 10 * Deg);
    }

    [Fact]
    public void RealWaterReleaseChangesMassAndTrimWithoutAnAttitudeJump()
    {
        var (aircraft, command) = LevelStart(loaded: true);
        var trim = new FireBossAutoTrim();
        double mass = aircraft.Telemetry.GrossMassKg;
        double pitch = aircraft.Telemetry.PitchRad;
        Step(aircraft, trim, command, 2);
        double loadedTrim = trim.State.AppliedTrim;
        Step(aircraft, trim, command with { DropRequested = true }, 2);
        Step(aircraft, trim, command, 12);
        output.WriteLine($"drop: mass={mass:F1}->{aircraft.Telemetry.GrossMassKg:F1}, "
            + $"pitch error={(aircraft.Telemetry.PitchRad - pitch) / Deg:F3}, "
            + $"trim={loadedTrim:F3}->{trim.State.AppliedTrim:F3}");
        Assert.True(mass - aircraft.Telemetry.GrossMassKg > 1000);
        Assert.InRange(Math.Abs(aircraft.Telemetry.PitchRad - pitch), 0, 2 * Deg);
        Assert.True(trim.State.AppliedTrim < loadedTrim - .02);
    }

    [Fact]
    public void SaturationIsBoundedObservableAndPilotInputOverridesImmediately()
    {
        var (aircraft, command) = LevelStart();
        var trim = new FireBossAutoTrim();
        SetAttitude(aircraft, command, 25 * Deg);
        trim.Apply(aircraft, command, Dt);
        SetAttitude(aircraft, command, -20 * Deg);
        // Isolate the actuator against a fixed disturbance, not a claim of flyable recovery.
        for (int tick = 0; tick < Ticks(6); tick++)
        {
            double previous = trim.State.Correction;
            trim.Apply(aircraft, command, Dt);
            Assert.InRange(Math.Abs(trim.State.Correction - previous), 0,
                FireBossAutoTrim.MaximumTrimRatePerSecond * Dt + 1e-12);
        }
        Assert.True(trim.State.Saturated);
        Assert.InRange(Math.Abs(trim.State.Correction), 0, FireBossAutoTrim.MaximumCorrection);
        Assert.InRange(Math.Abs(trim.State.AppliedTrim), 0, .5);
        double correction = trim.State.Correction;
        var pushed = command with { Pitch = -1 };
        Assert.Equal(-1, trim.Apply(aircraft, pushed, Dt).Pitch);
        Assert.Equal(correction, trim.State.Correction);
        Assert.Null(trim.State.TargetPitchRad);
        Assert.Equal("pilot", trim.State.Status);
    }

    [Fact]
    public void SurfaceAndLowSpeedCannotCaptureOrContinuePitchHold()
    {
        var trim = new FireBossAutoTrim();
        var command = new FireBossPilotCommand(0, 0, 0, .65, false, false);
        trim.Apply(FireBossDynamics.AtKelownaDeparture(), command, Dt);
        Assert.Equal("surface", trim.State.Status);
        Assert.Null(trim.State.TargetPitchRad);
        var (aircraft, balanced) = LevelStart();
        trim.Apply(aircraft, balanced, Dt);
        AircraftState state = aircraft.SharedAircraft.State with { Speed = 27 };
        aircraft.SharedAircraft.AdoptExternalKinematics(state);
        aircraft.Step(balanced);
        trim.Apply(aircraft, balanced, Dt);
        Assert.Equal("low-speed", trim.State.Status);
        Assert.Null(trim.State.TargetPitchRad);
    }

    [Fact]
    public void LowSpeedHysteresisRequiresARealRecoveryMarginBeforeRecapturing()
    {
        var (aircraft, command) = LevelStart();
        var trim = new FireBossAutoTrim();
        trim.Apply(aircraft, command, Dt);
        AtSpeed(38); // Between this fixture's approximately36/39m/s exit/entry thresholds.
        Assert.Equal("active", trim.State.Status);
        AtSpeed(27);
        Assert.Equal("low-speed", trim.State.Status);
        AtSpeed(38);
        Assert.Equal("low-speed", trim.State.Status);
        AtSpeed(43);
        Assert.Equal("active", trim.State.Status);
        Assert.Equal(aircraft.Telemetry.PitchRad, trim.State.TargetPitchRad);

        void AtSpeed(double speed)
        {
            aircraft.SharedAircraft.AdoptExternalKinematics(aircraft.SharedAircraft.State with { Speed = speed });
            aircraft.Step(command);
            trim.Apply(aircraft, command, Dt);
        }
    }

    [Theory]
    [InlineData(70, 0)]
    [InlineData(-70, 0)]
    [InlineData(0, 40)]
    [InlineData(0, -40)]
    public void SteepAttitudesInhibitWithoutRollYawOrPowerIntervention(double bankDeg, double pitchDeg)
    {
        var (aircraft, command) = LevelStart();
        aircraft.SharedAircraft.AdoptExternalKinematics(aircraft.SharedAircraft.State with {
            BodyAttitude = Attitude(pitchDeg * Deg, bankDeg * Deg), BodyRates = default });
        aircraft.Step(command);
        var trim = new FireBossAutoTrim();
        FireBossPilotCommand actual = trim.Apply(aircraft, command, Dt);
        Assert.Equal("attitude", trim.State.Status);
        Assert.Null(trim.State.TargetPitchRad);
        Assert.Equal(command, actual);
    }

    [Fact]
    public void InsufficientPowerRunsOutOfAirspeedAndInhibitsInsteadOfAddingEnergy()
    {
        var (aircraft, command) = LevelStart();
        var trim = new FireBossAutoTrim();
        Step(aircraft, trim, command with { Pitch = .25 }, .8);
        command = command with { Throttle = 0 };
        double initialEnergy = Energy(aircraft);
        int ticks = 0;
        while (ticks++ < Ticks(90))
        {
            FireBossPilotCommand actual = trim.Apply(aircraft, command, Dt);
            Assert.Equal(0, actual.Throttle);
            if (trim.State.Status == "low-speed") break;
            aircraft.Step(actual);
            Assert.True(aircraft.Telemetry.Flyable);
        }
        output.WriteLine($"idle slow-flight inhibit: t={ticks * Dt:F2}s, "
            + $"speed={aircraft.Telemetry.TrueAirspeedMps:F2}, energy change={Energy(aircraft) - initialEnergy:F1}J/kg");
        Assert.True(ticks < Ticks(90));
        Assert.Equal("low-speed", trim.State.Status);
        Assert.Null(trim.State.TargetPitchRad);
        Assert.True(Energy(aircraft) < initialEnergy - 100);
    }

    [Fact]
    public void PauseRestartAndManualHandoverHaveExplicitState()
    {
        var (aircraft, command) = LevelStart();
        var trim = new FireBossAutoTrim();
        Step(aircraft, trim, command with { Throttle = 1 }, 4);
        FireBossAutoTrimState held = trim.State;
        trim.SetPaused(true);
        for (int tick = 0; tick < 100; tick++) trim.Apply(aircraft, command, Dt);
        Assert.Equal(held, trim.State);
        FireBossPilotCommand manual = trim.SetEnabled(false, command);
        Assert.Equal(held.AppliedTrim, manual.ElevatorTrim, 12);
        Assert.Equal(manual, trim.Apply(aircraft, manual, Dt));
        command = trim.SetEnabled(true, manual);
        FireBossAutoTrimState pausedOn = trim.State;
        trim.Apply(aircraft, command, Dt);
        Assert.Equal(pausedOn, trim.State);
        trim.SetPaused(false);
        Assert.InRange(Math.Abs(trim.Apply(aircraft, command, Dt).ElevatorTrim - manual.ElevatorTrim),
            0, FireBossAutoTrim.MaximumTrimRatePerSecond * Dt + 1e-12);
        trim.SetPaused(true);
        command = trim.SetManualTrim(-.2, command);
        Assert.False(trim.State.Enabled);
        FireBossAutoTrimState pausedManual = trim.State;
        Assert.Equal(-.2, trim.Apply(aircraft, command, Dt).ElevatorTrim);
        Assert.Equal(pausedManual, trim.State);
        trim.Reset(trim.State.Enabled);
        Assert.False(trim.State.Enabled);
        Assert.Equal(0, trim.State.Correction);
        Assert.Null(trim.State.TargetPitchRad);
        trim.Reset(true);
        Assert.True(trim.State.Enabled);
        Assert.Equal("waiting", trim.State.Status);
    }

    [Fact]
    public void ProjectionReportsAssistanceSeparatelyFromActualAndPendingControls()
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.WaterCircuits);
        var pending = new FireBossPilotCommand(0, 0, 0, .65, false, false, .1);
        var applied = pending with { ElevatorTrim = .23 };
        var state = new FireBossAutoTrimState(true, "active", .12, .13, .1, .23, true);
        using var document = JsonDocument.Parse(OkanaganSnapshotProjection.BuildStateJson(
            mission, applied, null, pending, state));
        JsonElement json = document.RootElement;
        Assert.Equal(.1, json.GetProperty("pending_controls").GetProperty("elevator_trim").GetDouble());
        Assert.Equal(.23, json.GetProperty("applied_controls").GetProperty("elevator_trim").GetDouble());
        Assert.True(json.GetProperty("auto_trim").GetProperty("saturated").GetBoolean());
        Assert.Equal(.12, json.GetProperty("auto_trim").GetProperty("target_pitch_rad").GetDouble());
        Assert.Equal(mission.Aircraft.Telemetry.ElevatorTrim, json.GetProperty("elevator_trim").GetDouble());
    }

    static (FireBossDynamics, FireBossPilotCommand) LevelStart(bool loaded = false, double bank = 0)
    {
        FireBossDynamics aircraft = loaded ? FireBossDynamics.OnScoopLane() : FireBossDynamics.OnScoopApproach();
        if (loaded)
        {
            for (int tick = 0; tick < Ticks(7); tick++)
                aircraft.Step(new(0, 0, 0, .76, true, false));
            int ticks = 0;
            while (aircraft.Telemetry.SurfaceMode == FireBossSurfaceMode.Water && ticks++ < Ticks(40))
                aircraft.Step(new(1, 0, 0, 1, false, false));
            Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
            Assert.True(aircraft.Telemetry.WaterLoadKg > 1000);
        }
        const double speed = 60;
        double mass = aircraft.Telemetry.GrossMassKg;
        double lower = -.15, upper = .25;
        for (int iteration = 0; iteration < 60; iteration++)
        {
            double candidate = (lower + upper) * .5;
            if (Forces(candidate).Result.Accel.Y > 0) upper = candidate; else lower = candidate;
        }
        double alpha = (lower + upper) * .5;
        var (_, thrust) = Forces(alpha);
        var state = new AircraftState(new Vec3D(0, 1200, 0), speed, 0, 0, bank,
            mass, Attitude(alpha, bank));
        aircraft.SharedAircraft.AdoptExternalKinematics(state);
        aircraft.SharedAircraft.SeedEnginePowerFraction(1);
        double throttle = thrust / aircraft.SharedAircraft.LastEngineOperatingPoint.NetThrustN;
        aircraft.SharedAircraft.SeedEnginePowerFraction(throttle);
        ConventionalTailParameters tail = Parameters.ConventionalTail;
        double trim = -tail.CmAlpha * alpha / (tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad)
            - aircraft.InitialElevatorTrim;
        var command = new FireBossPilotCommand(0, 0, 0, throttle, false, false, trim);
        aircraft.Step(command); // Synchronize telemetry once after static fixture preparation.
        return (aircraft, command);

        (AeroResult Result, double Thrust) Forces(double alpha)
        {
            var raw = new RawState(new Vec3D(0, 1200, 0), new Vec3D(0, 0, speed), 0,
                mass, Attitude(alpha, 0), default);
            PilotCommand controls = FireBossDynamics.ToSharedPilotCommand(default);
            AeroResult unpowered = FlightModel.Aerodynamics(raw, controls, Parameters,
                default, 0, AirframeAerodynamicState.Clean);
            double thrust = unpowered.DragForceN / Math.Cos(alpha);
            return (FlightModel.Aerodynamics(raw, controls, Parameters, default, thrust,
                AirframeAerodynamicState.Clean), thrust);
        }
    }

    static void SetAttitude(FireBossDynamics aircraft, FireBossPilotCommand command, double pitch)
    {
        aircraft.SharedAircraft.AdoptExternalKinematics(aircraft.SharedAircraft.State with {
            Gamma = pitch - aircraft.Telemetry.AngleOfAttackRad,
            BodyAttitude = Attitude(pitch, 0), BodyRates = default });
        aircraft.Step(command);
    }

    static QuaternionD Attitude(double pitch, double roll)
    {
        var forward = new Vec3D(0, Math.Sin(pitch), Math.Cos(pitch));
        var levelRight = new Vec3D(1, 0, 0);
        Vec3D levelUp = forward.Cross(levelRight).Normalized();
        Vec3D right = levelRight * Math.Cos(roll) - levelUp * Math.Sin(roll);
        return QuaternionD.FromFrame(right, forward.Cross(right), forward);
    }

    static void Step(FireBossDynamics aircraft, FireBossAutoTrim trim, FireBossPilotCommand command, double seconds)
    {
        for (int tick = 0; tick < Ticks(seconds); tick++)
        {
            double previousPitch = aircraft.Telemetry.PitchRad;
            aircraft.Step(trim.Apply(aircraft, command, Dt));
            Assert.True(aircraft.Telemetry.Flyable);
            Assert.True(double.IsFinite(aircraft.Telemetry.PitchRad));
            Assert.InRange(Math.Abs(aircraft.Telemetry.PitchRad - previousPitch), 0, .5 * Deg);
        }
    }

    static double Energy(FireBossDynamics aircraft) => .5 * Math.Pow(aircraft.Telemetry.TrueAirspeedMps, 2)
        + 9.80665 * aircraft.Telemetry.PositionWorldM.Y;
    static int Ticks(double seconds) => (int)Math.Round(seconds / Dt);
}
