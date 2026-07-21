using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class PilotNormalAccelerationTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState Level(double speed = 180.0, double altitude = 3000.0,
        double? massKg = null) => new(
            new Vec3D(0.0, altitude, 0.0), speed, 0.0, 0.0, 0.0,
            massKg ?? FlightModel.Sabre.MassKg);

    [Fact]
    public void TrimmedLevelFlightReportsApproximatelyOnePilotNormalG() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        Assert.False(sim.HasValidPilotNormalAcceleration);

        var cruise = new PilotCommand(1.0, 0.0, 0.85, 0.0);
        for (int tick = 0; tick < 5 * AircraftSim.TickHz; tick++)
            sim.Step(cruise, Dt);

        Assert.True(sim.HasValidPilotNormalAcceleration);
        Assert.InRange(sim.LastPilotNormalAccelerationG, 0.90, 1.10);
    }

    [Fact]
    public void UnpoweredBallisticReleaseReportsApproximatelyZeroSpecificForce() {
        var sim = new AircraftSim(Level(speed: 0.0,
            massKg: FlightModel.GliderStrike.MassKg), FlightModel.GliderStrike);

        sim.Step(new PilotCommand(0.0, 0.0, 0.0, 0.0), Dt);

        Assert.True(sim.HasValidPilotNormalAcceleration);
        Assert.InRange(sim.LastPilotNormalAccelerationG, -0.001, 0.001);
        Assert.True(sim.State.Gamma < -1.4,
            "the fixture must actually be entering ballistic fall");
    }

    [Fact]
    public void HighAlphaNormalGComesFromFinalForcesNotThePilotDemand() {
        const double alphaRad = 55.0 * System.Math.PI / 180.0;
        var parameters = FlightModel.F22APublicDataSurrogate;
        var trimmed = new AircraftSim(Level(speed: 105.0,
            massKg: parameters.MassKg), parameters).State;
        // Northbound aircraft: a negative world-X rotation raises the body nose while velocity
        // stays level, creating positive angle of attack without inventing a command response.
        var pitchUp = new QuaternionD(System.Math.Cos(alphaRad / 2.0),
            -System.Math.Sin(alphaRad / 2.0), 0.0, 0.0);
        var highAlpha = trimmed with {
            BodyAttitude = (pitchUp * trimmed.BodyAttitude).Normalized()
        };
        var sim = new AircraftSim(highAlpha, parameters);
        var demand = new PilotCommand(11.0, 0.0, 0.0, 0.0,
            CommandedAlphaRad: alphaRad, EnvelopeOverride: true);

        sim.Step(demand, Dt);

        var final = sim.State;
        var finalRaw = new RawState(final.Position, final.VelocityVector(), final.Bank,
            final.Mass, final.BodyAttitude, final.BodyRates);
        var spooled = demand with { Throttle = sim.ThrustFraction };
        var aero = FlightModel.Aerodynamics(finalRaw, spooled, parameters, Vec3D.Zero,
            sim.LastEngineOperatingPoint.NetThrustN, AirframeAerodynamicState.Clean,
            sim.AtmosphereModel);
        double expectedFromForces = (aero.Accel + new Vec3D(0.0, FlightModel.G0, 0.0))
            .Dot(sim.BodyUp) / FlightModel.G0;

        Assert.True(sim.AngleOfAttackRad > 40.0 * System.Math.PI / 180.0,
            "the fixture must remain in genuinely high-alpha flow after one integration tick");
        Assert.Equal(expectedFromForces, sim.LastPilotNormalAccelerationG, 10);
        Assert.True(System.Math.Abs(sim.LastPilotNormalAccelerationG - demand.GDemand) > 5.0,
            $"reported {sim.LastPilotNormalAccelerationG:F2} G followed the 11 G request, not force truth");
    }

    [Fact]
    public void ExternalKinematicsRequireAnExplicitOccupantForceToBecomeValid() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        sim.Step(new PilotCommand(1.0, 0.0, 0.85, 0.0), Dt);
        Assert.True(sim.HasValidPilotNormalAcceleration);

        sim.AdoptExternalKinematics(sim.State with { BodyRates = default });

        Assert.False(sim.HasValidPilotNormalAcceleration);
        Assert.Equal(1.0, sim.LastPilotNormalAccelerationG);
        Assert.Equal(0.0, sim.LastNz); // retain the existing external-phase compatibility contract

        sim.AdoptExternalKinematics(sim.State, pilotNormalAccelerationG: 0.0);
        Assert.True(sim.HasValidPilotNormalAcceleration);
        Assert.Equal(0.0, sim.LastPilotNormalAccelerationG);
    }
}
