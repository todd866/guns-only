namespace GunsOnly.Sim.Tests;

public sealed class AutomaticSurfaceTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Kcas350Mps = 350.0 / AirData.MpsToKnots;

    static AircraftState Level(double speedMps, AircraftParams parameters) => new(
        new Vec3D(0.0, 0.0, 0.0), speedMps, 0.0, 0.0, 0.0, parameters.MassKg);

    static PilotCommand Command(double throttle) => new(
        GDemand: 1.0, BankTarget: 0.0, Throttle: throttle, Rudder: 0.0);

    static AircraftSim AtAlpha(double alphaDegrees, double casKnots,
        AircraftParams? parameters = null) {
        AircraftParams p = parameters ?? FlightModel.F22APublicDataSurrogate;
        double alpha = alphaDegrees * Math.PI / 180.0;
        var bodyRight = new Vec3D(1.0, 0.0, 0.0);
        var bodyUp = new Vec3D(0.0, Math.Cos(alpha), -Math.Sin(alpha));
        var bodyForward = bodyRight.Cross(bodyUp).Normalized();
        var attitude = QuaternionD.FromFrame(bodyRight, bodyUp, bodyForward);
        double tas = AirData.TrueAirspeedForCalibratedAirspeedMps(
            casKnots / AirData.MpsToKnots, 1000.0);
        var state = new AircraftState(new Vec3D(0.0, 1000.0, 0.0), tas,
            0.0, 0.0, 0.0, p.MassKg, attitude, default);
        return new AircraftSim(state, p);
    }

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
            Assert.Equal(0.0, clean.LeadingEdgeFlaps);
            Assert.Equal(0.0, metadataOnly.LeadingEdgeFlaps);
        }
    }

    [Fact]
    public void F22LeadingEdgeFlapsUseSmoothCasAndAlphaSchedule() {
        Assert.Equal(1.0,
            AircraftSim.AutomaticLeadingEdgeFlapSchedule(
                calibratedAirspeedKts: 240.0, alphaRad: 14.0 * Math.PI / 180.0),
            12);
        Assert.Equal(0.25,
            AircraftSim.AutomaticLeadingEdgeFlapSchedule(
                calibratedAirspeedKts: 275.0, alphaRad: 8.0 * Math.PI / 180.0),
            12);
        Assert.Equal(0.0,
            AircraftSim.AutomaticLeadingEdgeFlapSchedule(
                calibratedAirspeedKts: 300.0, alphaRad: 14.0 * Math.PI / 180.0),
            12);
        Assert.Equal(0.0,
            AircraftSim.AutomaticLeadingEdgeFlapSchedule(
                calibratedAirspeedKts: 240.0, alphaRad: 4.0 * Math.PI / 180.0),
            12);

        AircraftSim full = AtAlpha(alphaDegrees: 14.0, casKnots: 240.0);
        full.Step(Command(0.5), Dt);

        Assert.Equal(1.0, full.LeadingEdgeFlaps, 12);
        Assert.Equal(AircraftSim.AutomaticLeadingEdgeFlapLiftLimitIncrement,
            full.EffectiveAerodynamicConfiguration.LiftLimitCoefficientIncrement, 12);
    }

    [Fact]
    public void F22LeadingEdgeFlapsRaiseClMaxAndInstantaneousTurnRateBelowSchedule() {
        AircraftParams p = FlightModel.F22APublicDataSurrogate;
        AircraftSim sim = AtAlpha(alphaDegrees: 14.0, casKnots: 240.0, p);
        sim.Step(Command(0.5), Dt);
        AirframeAerodynamicState deployed = sim.EffectiveAerodynamicConfiguration;
        double configuredClMax = p.CLMax
            + deployed.LiftLimitCoefficientIncrement;
        double configuredBreakAlpha = configuredClMax / p.CLAlpha;

        Assert.Equal(p.CLMax + 0.25, configuredClMax, 12);
        Assert.Equal(configuredClMax,
            FlightModel.LiftCoefficient(configuredBreakAlpha, p, deployed), 12);

        var hardPull = new PilotCommand(
            GDemand: 20.0, BankTarget: Math.PI / 2.0, Throttle: 0.5, Rudder: 0.0);
        var (_, cleanMax, _) = FlightModel.ClampNz(sim.State, hardPull, p,
            sim.AirspeedMps, AirframeAerodynamicState.Clean, sim.AtmosphereModel);
        var (_, deployedMax, _) = FlightModel.ClampNz(sim.State, hardPull, p,
            sim.AirspeedMps, deployed, sim.AtmosphereModel);
        double cleanTurnRate = FlightModel.G0 * Math.Sqrt(cleanMax * cleanMax - 1.0)
            / sim.AirspeedMps;
        double deployedTurnRate = FlightModel.G0
            * Math.Sqrt(deployedMax * deployedMax - 1.0) / sim.AirspeedMps;

        Assert.True(deployedMax > cleanMax + 0.5);
        Assert.True(deployedTurnRate > cleanTurnRate);
    }

    [Fact]
    public void F22LeadingEdgeFlapsAreBitInactiveAboveSchedule() {
        AircraftSim first = AtAlpha(alphaDegrees: 14.0, casKnots: 340.0);
        AircraftSim second = AtAlpha(alphaDegrees: 14.0, casKnots: 340.0);
        PilotCommand command = Command(1.0);

        for (int tick = 0; tick < AircraftSim.TickHz; tick++) {
            first.Step(command, Dt);
            second.Step(command, Dt);
            Assert.Equal(first.State, second.State);
            Assert.Equal(0.0, first.LeadingEdgeFlaps);
            Assert.Equal(first.AerodynamicConfiguration,
                first.EffectiveAerodynamicConfiguration);
        }
    }
}
