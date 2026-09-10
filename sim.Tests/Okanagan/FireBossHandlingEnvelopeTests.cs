using GunsOnly.Sim.Okanagan;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests.Okanagan;

/// <summary>
/// Open-loop human-control checks. The 15 degree/second, 15 degree, and settling limits are
/// provisional handling guardrails, not AT-802 certification data. No test pilot, G tracker,
/// or continuously adjusted trim supplies the expected trajectory. Static force/moment balance
/// is used only to prepare matched starting states; the controls then stay fixed or follow a pulse.
/// </summary>
public sealed class FireBossHandlingEnvelopeTests(ITestOutputHelper output)
{
    const double Dt = FireBossDynamics.FixedDeltaSeconds;
    const double Deg = Math.PI / 180.0;
    const double Gravity = 9.80665;
    static readonly AircraftParams Parameters = FlightModel.At802fFireBossPublicDataSurrogate;

    [Theory]
    [InlineData(5030.0)]
    [InlineData(7257.0)]
    public void SmallPitchPulseHasCorrectSignAndDampsAfterReleaseAtBothPayloads(double mass)
    {
        TrimmedStart start = LevelStart(mass);
        AircraftSim neutral = start.Create(), pull = start.Create(), push = start.Create();
        double peakRate = 0, peakPitchExcursion = 0;
        for (int tick = 0; tick < Ticks(0.5); tick++)
        {
            Advance(neutral, start, 0);
            Advance(pull, start, 0.2);
            Advance(push, start, -0.2);
            Measure();
        }
        double pullRate = pull.State.BodyRates.Q - neutral.State.BodyRates.Q;
        double pushRate = push.State.BodyRates.Q - neutral.State.BodyRates.Q;
        output.WriteLine($"mass={mass}: pulse q={pullRate / Deg:F3}/{pushRate / Deg:F3} deg/s, "
            + $"Nz={pull.LastNz:F3}/{neutral.LastNz:F3}/{push.LastNz:F3}");
        Assert.True(pullRate > 1 * Deg && pushRate < -1 * Deg);
        Assert.True(pull.AngleOfAttackRad > neutral.AngleOfAttackRad + 0.5 * Deg);
        Assert.True(push.AngleOfAttackRad < neutral.AngleOfAttackRad - 0.5 * Deg);
        Assert.True(pull.LastNz > neutral.LastNz + 0.08);
        Assert.True(push.LastNz < neutral.LastNz - 0.08);

        for (int tick = 0; tick < Ticks(4); tick++)
        {
            Advance(neutral, start, 0);
            Advance(pull, start, 0);
            Advance(push, start, 0);
            Measure();
        }
        output.WriteLine($"released q={pull.State.BodyRates.Q / Deg:F3}/{push.State.BodyRates.Q / Deg:F3}, "
            + $"peak rate={peakRate / Deg:F3}, excursion={peakPitchExcursion / Deg:F3} deg");
        Assert.InRange(Math.Abs(pull.State.BodyRates.Q - neutral.State.BodyRates.Q), 0, Math.Abs(pullRate) * 0.5);
        Assert.InRange(Math.Abs(push.State.BodyRates.Q - neutral.State.BodyRates.Q), 0, Math.Abs(pushRate) * 0.5);
        Assert.InRange(peakRate, 0, 15 * Deg);
        Assert.InRange(peakPitchExcursion, 0, 15 * Deg);

        void Measure()
        {
            foreach (AircraftSim aircraft in new[] { neutral, pull, push })
            {
                AssertFinite(aircraft.State);
                peakRate = Math.Max(peakRate, Math.Abs(aircraft.State.BodyRates.Q));
                peakPitchExcursion = Math.Max(peakPitchExcursion,
                    Math.Abs(aircraft.BodyPitchRad - start.Alpha));
            }
        }
    }

    [Fact]
    public void ElevatorAuthorityFollowsDynamicPressureAndCannotRotateAStoppedAircraft()
    {
        double slow = ElevatorResponse(35), fast = ElevatorResponse(70), stopped = ElevatorResponse(0.1);
        output.WriteLine($"elevator angular acceleration: 35={slow:F9}, 70={fast:F9}, 0.1={stopped:F9} rad/s2");
        Assert.True(slow > 0);
        Assert.InRange(fast / slow, 3.95, 4.05);
        Assert.InRange(Math.Abs(stopped), 0, fast * 0.00001);

        // A separated wing must not revive a fixed-Nm pitch-break controller as q tends to zero.
        double separatedFast = PitchAcceleration(40, 0.7, 0);
        double separatedStopped = PitchAcceleration(0.1, 0.7, 0);
        Assert.True(separatedFast < 0, "static stability supplies nose-down recovery");
        Assert.InRange(Math.Abs(separatedStopped), 0, Math.Abs(separatedFast) * 0.00001);

        static double ElevatorResponse(double speed) =>
            PitchAcceleration(speed, 0.05, 0.2) - PitchAcceleration(speed, 0.05, 0);
    }

    [Theory]
    [InlineData(5030.0)]
    [InlineData(7257.0)]
    public void PowerChangeProducesClimbOrDescentThroughEnergyAtFixedTrim(double mass)
    {
        TrimmedStart start = LevelStart(mass);
        AircraftSim high = start.Create(), low = start.Create(), level = start.Create();
        double initialEnergy = Energy(high.State);
        for (int tick = 0; tick < Ticks(12); tick++)
        {
            Advance(high, start, 0, throttle: Math.Min(1, start.Throttle + 0.25));
            Advance(low, start, 0, throttle: Math.Max(0, start.Throttle - 0.25));
            Advance(level, start, 0);
            AssertFinite(high.State);
            AssertFinite(low.State);
        }
        double highGain = Energy(high.State) - initialEnergy;
        double lowGain = Energy(low.State) - initialEnergy;
        output.WriteLine($"mass={mass}: trim={start.Elevator:F4}, throttle={start.Throttle:F4}, "
            + $"energy={highGain:F1}/{lowGain:F1} J/kg, climb={high.State.VelocityVector().Y:F3}/"
            + $"{low.State.VelocityVector().Y:F3} m/s, neutral dH={level.State.Position.Y - start.State.Position.Y:F3}m");
        Assert.True(highGain > 150 && lowGain < -150);
        Assert.True(high.State.VelocityVector().Y > 0.5);
        Assert.True(low.State.VelocityVector().Y < -0.5);
        Assert.True(high.State.Position.Y > start.State.Position.Y + 3);
        Assert.True(low.State.Position.Y < start.State.Position.Y - 3);
        Assert.InRange(Math.Abs(level.State.Position.Y - start.State.Position.Y), 0, 1);
    }

    [Theory]
    [InlineData(5030.0)]
    [InlineData(7257.0)]
    public void BankTiltsLiftAndStartsADescendingTurnWithoutAutomaticAltitudeHold(double mass)
    {
        TrimmedStart start = LevelStart(mass);
        AircraftState banked = start.State with { Bank = 30 * Deg,
            BodyAttitude = Attitude(start.Alpha, 30 * Deg) };
        AircraftSim aircraft = start.Create(banked);
        for (int tick = 0; tick < Ticks(2); tick++) Advance(aircraft, start, 0);
        output.WriteLine($"mass={mass}: bank={aircraft.BodyRollRad / Deg:F3} deg, "
            + $"heading={aircraft.State.Chi / Deg:F3}, vertical={aircraft.State.VelocityVector().Y:F3} m/s");
        AssertFinite(aircraft.State);
        Assert.True(aircraft.State.Chi > 2 * Deg, "right bank must turn the velocity toward the right");
        Assert.True(aircraft.State.VelocityVector().Y < -0.5, "uncompensated bank loses vertical lift");
        Assert.True(aircraft.BodyRollRad > 15 * Deg, "neutral aileron must not command wings level");
    }

    [Fact]
    public void FireBossCommandUsesActualBodyBankEvenWhenCompatibilityBankIsStale()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopApproach();
        AircraftState state = aircraft.SharedAircraft.State with {
            Position = new Vec3D(0, 1500, 0), Speed = 60, Gamma = 0, Chi = 0,
            Bank = -0.4, BodyAttitude = Attitude(0.05, 30 * Deg), BodyRates = default
        };
        aircraft.SharedAircraft.AdoptExternalKinematics(state);
        double actualBank = aircraft.SharedAircraft.BodyRollRad;
        Assert.True(Math.Abs(actualBank - state.Bank) > 0.5);
        aircraft.Step(new FireBossPilotCommand(0, 0, 0, 0.65, false, false));
        Assert.Equal(actualBank, aircraft.SharedAircraft.LastAppliedCommand.BankTarget, 10);
        Assert.Equal(aircraft.InitialElevatorTrim,
            aircraft.SharedAircraft.LastAppliedCommand.ElevatorControl, 10);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void LiftoffPreservesPositionVelocityAndPitchRateWithoutATrajectoryKick(bool loadedWaterRun)
    {
        FireBossDynamics aircraft = loadedWaterRun
            ? FireBossDynamics.OnScoopLane() : FireBossDynamics.AtKelownaDeparture();
        if (loadedWaterRun)
        {
            // Obtain a real load through the mission's scoop path, not a private-field injection.
            for (int scoopTick = 0; scoopTick < Ticks(5); scoopTick++)
                aircraft.Step(new FireBossPilotCommand(0, 0, 0, 0.78, true, false));
            Assert.True(aircraft.Telemetry.WaterLoadKg > 500);
            Assert.Equal(FireBossSurfaceMode.Water, aircraft.Telemetry.SurfaceMode);
        }
        FireBossSurfaceMode initialMode = aircraft.Telemetry.SurfaceMode;
        var command = new FireBossPilotCommand(0.35, 0, 0, 1, false, false);
        FireBossTelemetry before = aircraft.Telemetry;
        int tick = 0;
        while (aircraft.Telemetry.SurfaceMode == initialMode && tick++ < Ticks(60))
        {
            before = aircraft.Telemetry;
            aircraft.Step(command);
        }
        FireBossTelemetry after = aircraft.Telemetry;
        output.WriteLine($"{initialMode} liftoff t={tick * Dt:F3}s, v={after.TrueAirspeedMps:F3}, "
            + $"dH={after.PositionWorldM.Y - before.PositionWorldM.Y:F6}, "
            + $"dVy={after.VerticalSpeedMps - before.VerticalSpeedMps:F6}, "
            + $"q={before.PitchRateRadPerSecond / Deg:F3}->{after.PitchRateRadPerSecond / Deg:F3} deg/s");
        Assert.Equal(FireBossSurfaceMode.Airborne, after.SurfaceMode);
        Assert.True(after.Flyable);
        Assert.InRange(Math.Abs(after.PositionWorldM.Y - before.PositionWorldM.Y), 0, 0.01);
        Assert.InRange(Math.Abs(after.VerticalSpeedMps - before.VerticalSpeedMps), 0, 30 * Dt);
        Assert.InRange(Math.Abs(after.PitchRateRadPerSecond - before.PitchRateRadPerSecond), 0, 1 * Deg);
        Assert.InRange(Math.Abs(after.PitchRad - before.PitchRad), 0, 15 * Deg * Dt);
        // The next tick must advance free flight instead of snapping an upward-moving aircraft
        // straight back to contact because it still lies at the exact surface height.
        aircraft.Step(command);
        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
        Assert.True(aircraft.Telemetry.VerticalSpeedMps > 0);
        Assert.True(aircraft.Telemetry.PositionWorldM.Y > after.PositionWorldM.Y);
    }

    static double PitchAcceleration(double speed, double alpha, double pitch)
    {
        var raw = new RawState(new Vec3D(0, 1000, 0), new Vec3D(0, 0, speed), 0, 7257,
            Attitude(alpha, 0), default);
        PilotCommand command = FireBossDynamics.ToSharedPilotCommand(
            new FireBossPilotCommand(pitch, 0, 0, 0, false, false));
        return FlightModel.Derivatives(raw, command, Parameters, new Vec3D(0, 1, 0),
            default, 0, AirframeAerodynamicState.Clean).DBodyRates.Q;
    }

    [Fact]
    public void RightRudderPushesTheTailLeftAndYawsRightWithDynamicPressureScaling()
    {
        var slow = Response(30);
        var fast = Response(60);
        var stopped = Response(0.1);
        output.WriteLine($"right rudder: side acceleration={fast.side:F6} m/s2, yaw acceleration={fast.yaw:F6} rad/s2");
        Assert.True(fast.side < 0, "right yaw requires an initial leftward force on the tail");
        Assert.True(fast.yaw > 0, "positive pilot rudder must initially yaw the nose right");
        Assert.InRange(fast.side / slow.side, 3.95, 4.05);
        Assert.InRange(fast.yaw / slow.yaw, 3.95, 4.05);
        Assert.InRange(Math.Abs(stopped.side), 0, Math.Abs(fast.side) * 0.00001);
        Assert.InRange(Math.Abs(stopped.yaw), 0, Math.Abs(fast.yaw) * 0.00001);

        static (double side, double yaw) Response(double speed)
        {
            var raw = new RawState(new Vec3D(0, 1000, 0), new Vec3D(0, 0, speed), 0, 7257,
                Attitude(0.05, 0), default);
            var positive = FireBossDynamics.ToSharedPilotCommand(new FireBossPilotCommand(0, 0, 0.25, 0, false, false));
            var negative = FireBossDynamics.ToSharedPilotCommand(new FireBossPilotCommand(0, 0, -0.25, 0, false, false));
            StateDeriv right = FlightModel.Derivatives(raw, positive, Parameters, new Vec3D(0, 1, 0),
                default, 0, AirframeAerodynamicState.Clean);
            StateDeriv left = FlightModel.Derivatives(raw, negative, Parameters, new Vec3D(0, 1, 0),
                default, 0, AirframeAerodynamicState.Clean);
            Assert.True(right.DVel.X < 0 && left.DVel.X > 0);
            Assert.True(right.DBodyRates.R > 0 && left.DBodyRates.R < 0);
            Assert.Equal(-right.DVel.X, left.DVel.X, 10);
            Assert.Equal(-right.DBodyRates.R, left.DBodyRates.R, 10);
            return (right.DVel.X, right.DBodyRates.R);
        }
    }

    static TrimmedStart LevelStart(double mass)
    {
        // Solve a static lift/weight and thrust/drag balance once. No feedback occurs in flight.
        const double speed = 60;
        double lower = -0.15, upper = 0.25;
        for (int iteration = 0; iteration < 60; iteration++)
        {
            double alpha = (lower + upper) * 0.5;
            var (force, _) = Forces(alpha);
            if (force.Accel.Y > 0) upper = alpha; else lower = alpha;
        }
        double trimmedAlpha = (lower + upper) * 0.5;
        var (balanced, thrust) = Forces(trimmedAlpha);
        Assert.InRange(balanced.Accel.Length, 0, 0.000001);
        var state = new AircraftState(new Vec3D(0, 1000, 0), speed, 0, 0, 0, mass,
            Attitude(trimmedAlpha, 0));
        var engine = new AircraftSim(state, Parameters);
        engine.SeedEnginePowerFraction(1);
        double throttle = thrust / engine.LastEngineOperatingPoint.NetThrustN;
        // Independent static moment balance, rather than calling the production trim helper.
        ConventionalTailParameters tail = Parameters.ConventionalTail;
        double elevator = -tail.CmAlpha * trimmedAlpha
            / (tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad);
        Assert.InRange(throttle, 0.1, 0.9);
        Assert.InRange(Math.Abs(elevator), 0, 0.5);
        return new(state, trimmedAlpha, elevator, throttle);

        (AeroResult, double) Forces(double alpha)
        {
            var raw = new RawState(new Vec3D(0, 1000, 0), new Vec3D(0, 0, speed), 0, mass,
                Attitude(alpha, 0), default);
            var command = FireBossDynamics.ToSharedPilotCommand(default);
            AeroResult unpowered = FlightModel.Aerodynamics(raw, command, Parameters,
                default, 0, AirframeAerodynamicState.Clean);
            double requiredThrust = unpowered.DragForceN / Math.Cos(alpha);
            return (FlightModel.Aerodynamics(raw, command, Parameters,
                default, requiredThrust, AirframeAerodynamicState.Clean), requiredThrust);
        }
    }

    static QuaternionD Attitude(double pitch, double roll)
    {
        var forward = new Vec3D(0, Math.Sin(pitch), Math.Cos(pitch));
        var levelRight = new Vec3D(1, 0, 0);
        Vec3D levelUp = forward.Cross(levelRight).Normalized();
        Vec3D right = levelRight * Math.Cos(roll) - levelUp * Math.Sin(roll);
        return QuaternionD.FromFrame(right, forward.Cross(right), forward);
    }

    static void Advance(AircraftSim aircraft, TrimmedStart start, double pitch, double? throttle = null)
    {
        var command = new FireBossPilotCommand(pitch, 0, 0, throttle ?? start.Throttle, false, false);
        aircraft.Step(FireBossDynamics.ToSharedPilotCommand(command, aircraft.BodyRollRad,
            start.Elevator), Dt);
    }

    static int Ticks(double seconds) => (int)Math.Round(seconds / Dt);
    static double Energy(AircraftState state) => 0.5 * state.Speed * state.Speed + Gravity * state.Position.Y;
    static void AssertFinite(AircraftState state)
    {
        Assert.True(double.IsFinite(state.Position.X) && double.IsFinite(state.Position.Y)
            && double.IsFinite(state.Position.Z) && double.IsFinite(state.Speed)
            && double.IsFinite(state.Gamma) && double.IsFinite(state.Chi)
            && state.BodyAttitude.IsFinite && state.BodyRates.IsFinite);
        Assert.InRange(Math.Abs(state.BodyAttitude.LengthSquared - 1), 0, 1e-9);
    }

    sealed record TrimmedStart(AircraftState State, double Alpha, double Elevator, double Throttle)
    {
        public AircraftSim Create(AircraftState? replacement = null)
        {
            var result = new AircraftSim(replacement ?? State, Parameters);
            result.SeedEnginePowerFraction(Throttle);
            return result;
        }
    }
}
