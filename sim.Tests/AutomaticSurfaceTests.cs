namespace GunsOnly.Sim.Tests;

public sealed class AutomaticSurfaceTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Kcas350Mps = 350.0 / AirData.MpsToKnots;

    static AircraftState Level(double speedMps, AircraftParams parameters) => new(
        new Vec3D(0.0, 0.0, 0.0), speedMps, 0.0, 0.0, 0.0, parameters.MassKg);

    static PilotCommand Command(double throttle) => new(
        GDemand: 1.0, BankTarget: 0.0, Throttle: throttle, Rudder: 0.0);

    [Fact]
    public void F22IdleSpeedBrakeUsesAsymmetricFirstOrderRampAndGearInhibit() {
        var sim = new AircraftSim(Level(Kcas350Mps,
            FlightModel.F22APublicDataSurrogate),
            FlightModel.F22APublicDataSurrogate);
        sim.EngineCombustionAvailable = false;

        for (int tick = 0; tick < 0.5 * AircraftSim.TickHz; tick++)
            sim.Step(Command(0.0), Dt);

        Assert.Equal(1.0 - Math.Exp(-1.0), sim.SpeedBrake, 12);
        Assert.Equal(AircraftSim.AutomaticSpeedBrakeDragCoefficientIncrement
                * sim.SpeedBrake,
            sim.EffectiveAerodynamicConfiguration.DragCoefficientIncrement, 12);

        for (int tick = 0; tick < 2.0 * AircraftSim.TickHz; tick++)
            sim.Step(Command(0.0), Dt);
        double extended = sim.SpeedBrake;
        for (int tick = 0; tick < 0.3 * AircraftSim.TickHz; tick++)
            sim.Step(Command(0.25), Dt);

        Assert.Equal(extended * Math.Exp(-1.0), sim.SpeedBrake, 12);

        var gearDown = new AircraftSim(Level(Kcas350Mps,
            FlightModel.F22APublicDataSurrogate),
            FlightModel.F22APublicDataSurrogate) {
            EngineCombustionAvailable = false,
            AerodynamicConfiguration = AirframeAerodynamicState.Clean with {
                LandingGearFraction = 1.0
            }
        };
        for (int tick = 0; tick < AircraftSim.TickHz; tick++)
            gearDown.Step(Command(0.0), Dt);

        Assert.Equal(0.0, gearDown.SpeedBrake);
        Assert.Equal(0.0,
            gearDown.EffectiveAerodynamicConfiguration.DragCoefficientIncrement);
    }

    [Fact]
    public void F22IdleSpeedBrakeRoughlyDoublesDecelerationAt350Kcas() {
        var automatic = new AircraftSim(Level(Kcas350Mps,
            FlightModel.F22APublicDataSurrogate),
            FlightModel.F22APublicDataSurrogate) {
            EngineCombustionAvailable = false
        };
        var inhibited = new AircraftSim(Level(Kcas350Mps,
            FlightModel.F22APublicDataSurrogate),
            FlightModel.F22APublicDataSurrogate) {
            EngineCombustionAvailable = false,
            AerodynamicConfiguration = AirframeAerodynamicState.Clean with {
                LandingGearFraction = 1.0
            }
        };
        double startSpeed = automatic.State.Speed;
        const double sampleSeconds = 4.0;
        for (int tick = 0; tick < sampleSeconds * AircraftSim.TickHz; tick++) {
            automatic.Step(Command(0.0), Dt);
            inhibited.Step(Command(0.0), Dt);
        }

        double automaticDeceleration = (startSpeed - automatic.State.Speed) / sampleSeconds;
        double cleanDeceleration = (startSpeed - inhibited.State.Speed) / sampleSeconds;
        double ratio = automaticDeceleration / cleanDeceleration;

        Assert.InRange(ratio, 1.8, 2.2);
        Assert.True(automatic.SpeedBrake > 0.999);
    }

    [Fact]
    public void AutomaticSpeedBrakeLeavesNonF22AirframesBitIdentical() {
        var clean = new AircraftSim(Level(180.0, FlightModel.Sabre), FlightModel.Sabre);
        var metadataOnly = new AircraftSim(Level(180.0, FlightModel.Sabre),
            FlightModel.Sabre) {
            AerodynamicConfiguration = AirframeAerodynamicState.Clean with {
                LandingGearFraction = 1.0
            }
        };

        for (int tick = 0; tick < 5 * AircraftSim.TickHz; tick++) {
            clean.Step(Command(0.0), Dt);
            metadataOnly.Step(Command(0.0), Dt);
            Assert.Equal(clean.State, metadataOnly.State);
            Assert.Equal(0.0, clean.SpeedBrake);
            Assert.Equal(0.0, metadataOnly.SpeedBrake);
        }
    }
}
