using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests.Okanagan;

/// <summary>
/// Manufacturer comparison points: https://firebossllc.com/specifications-and-performance/
/// (retrieved 2026-09-10): 150 KIAS max cruise and 892 ft/min climb at 7257 kg.
/// That summary gives no atmosphere/power/rigging conditions. Standard sea level, full published
/// shaft power, clean configuration and the existing propeller efficiency are explicit surrogate
/// assumptions. These broad calibration bounds are not flight-manual or OEM validation.
/// </summary>
public sealed class FireBossPerformanceEnvelopeTests(ITestOutputHelper output)
{
    const double Mass = 7257;
    const double KnotsToMps = 0.514444444444444;
    const double FeetPerMinutePerMps = 196.850393700787;
    static readonly AircraftParams Parameters = FlightModel.At802fFireBossPublicDataSurrogate;

    [Fact]
    public void FullPowerLevelEquilibriumMatchesThePublishedCruiseNeighborhood()
    {
        Assert.Equal(1_193_000, Parameters.MaximumShaftPowerW);
        Assert.Equal(0.82, Parameters.PropellerEfficiency);
        double lower = 65, upper = 100;
        for (int iteration = 0; iteration < 48; iteration++)
        {
            double speed = (lower + upper) * 0.5;
            if (SteadyAtSpeed(speed).State.Gamma > 0) lower = speed; else upper = speed;
        }
        SteadyStart start = SteadyAtSpeed((lower + upper) * 0.5);
        double knots = start.State.Speed / KnotsToMps;
        output.WriteLine($"full-power level equilibrium={knots:F3} sea-level EAS kt, alpha={start.Alpha:F5} rad");
        Assert.InRange(knots, 145, 155);
        AircraftSim flown = FlyWithoutFeedback(start);
        Assert.InRange(Math.Abs(flown.State.Speed - start.State.Speed), 0, 0.1);
        Assert.InRange(Math.Abs(flown.State.Position.Y), 0, 0.1);
    }

    [Fact]
    public void BestAttachedFullPowerClimbMatchesThePublishedLoadedClimbNeighborhood()
    {
        // 42.4 m/s is about 1.1 times the published 75 KCAS reference stall speed. It only bounds
        // this comparison sweep away from the stall; this test does not claim a 10-degree flap model.
        SteadyStart? best = null;
        for (double speed = 42.4; speed <= 80; speed += 0.5)
        {
            SteadyStart candidate = SteadyAtSpeed(speed);
            if (best is null || candidate.State.VelocityVector().Y > best.State.VelocityVector().Y)
                best = candidate;
        }
        Assert.NotNull(best);
        double climb = best.State.VelocityVector().Y;
        output.WriteLine($"best attached climb={climb * FeetPerMinutePerMps:F3} ft/min at "
            + $"{best.State.Speed / KnotsToMps:F3} EAS kt, alpha={best.Alpha:F5} rad");
        Assert.InRange(climb * FeetPerMinutePerMps, 800, 1000);
        AircraftSim flown = FlyWithoutFeedback(best);
        // Density changes during the climb. Holding controls must still sustain the predicted
        // climb neighborhood; no state injection, energy correction, or autopilot may hold it up.
        Assert.InRange(flown.State.VelocityVector().Y / climb, 0.85, 1.05);
        Assert.InRange(flown.State.Position.Y, climb * 30 * 0.85, climb * 30 * 1.05);
    }

    static SteadyStart SteadyAtSpeed(double speed)
    {
        var engine = new AircraftSim(new AircraftState(new Vec3D(0, 0, 0), speed, 0, 0, 0, Mass,
            Attitude(0)), Parameters);
        engine.SeedEnginePowerFraction(1);
        double thrust = engine.LastEngineOperatingPoint.NetThrustN;
        double lower = -0.18, upper = 0.28;
        for (int iteration = 0; iteration < 48; iteration++)
        {
            double alpha = (lower + upper) * 0.5;
            AeroResult force = Forces(alpha, 0);
            double gamma = Math.Asin(Math.Clamp(force.Accel.Z / FlightModel.G0, -0.99, 0.99));
            // Resolve weight perpendicular to the flight path. The along-path balance supplies
            // gamma; the bisection supplies alpha. This creates a starting equilibrium only.
            double normalResidual = force.Accel.Y + FlightModel.G0 * (1 - Math.Cos(gamma));
            if (normalResidual > 0) upper = alpha; else lower = alpha;
        }
        double incidence = (lower + upper) * 0.5;
        AeroResult level = Forces(incidence, 0);
        double path = Math.Asin(Math.Clamp(level.Accel.Z / FlightModel.G0, -0.99, 0.99));
        AeroResult equilibrium = Forces(incidence, path);
        Assert.InRange(equilibrium.Accel.Length, 0, 1e-7);
        var state = new AircraftState(new Vec3D(0, 0, 0), speed, path, 0, 0, Mass,
            Attitude(incidence + path));
        ConventionalTailParameters tail = Parameters.ConventionalTail;
        double elevator = -tail.CmAlpha * incidence / (tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad);
        Assert.InRange(Math.Abs(elevator), 0, 1);
        return new(state, incidence, elevator);

        AeroResult Forces(double alpha, double gamma)
        {
            var state = new AircraftState(new Vec3D(0, 0, 0), speed, gamma, 0, 0, Mass,
                Attitude(alpha + gamma));
            var raw = new RawState(state.Position, state.VelocityVector(), 0, Mass, state.BodyAttitude, default);
            return FlightModel.Aerodynamics(raw, new PilotCommand(1, 0, 1, 0, ElevatorControl: 0),
                Parameters, default, thrust, AirframeAerodynamicState.Clean);
        }
    }

    static AircraftSim FlyWithoutFeedback(SteadyStart start)
    {
        var aircraft = new AircraftSim(start.State, Parameters);
        aircraft.SeedEnginePowerFraction(1);
        var command = new PilotCommand(1, 0, 1, 0, DirectLateralControl: true,
            ElevatorControl: start.Elevator);
        for (int tick = 0; tick < 30 * AircraftSim.TickHz; tick++)
            aircraft.Step(command, 1.0 / AircraftSim.TickHz);
        Assert.True(double.IsFinite(aircraft.State.Speed) && aircraft.State.BodyRates.IsFinite
            && aircraft.State.BodyAttitude.IsFinite);
        return aircraft;
    }

    static QuaternionD Attitude(double pitch) => new(Math.Cos(pitch / 2), -Math.Sin(pitch / 2), 0, 0);
    sealed record SteadyStart(AircraftState State, double Alpha, double Elevator);
}
