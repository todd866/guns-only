using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class WeatherSimulationIntegrationTests {
    static HydrostaticAtmosphereColumn Column(double seaLevelTemperatureK,
        double upperTemperatureK, double seaLevelPressurePa = Atmosphere.SeaLevelPressurePa) => new(
        [
            new TemperatureSoundingPoint(-1_000.0,
                seaLevelTemperatureK + 6.5),
            new TemperatureSoundingPoint(0.0, seaLevelTemperatureK),
            new TemperatureSoundingPoint(10_000.0, upperTemperatureK)
        ],
        anchorPressurePa: seaLevelPressurePa,
        anchorGeometricAltitudeM: 0.0);

    static LayeredWindField CalmWind() => new(
        [
            new WindVectorLevel(-1_000.0, Vec3D.Zero),
            new WindVectorLevel(10_000.0, Vec3D.Zero)
        ]);

    static AircraftState State(double altitudeM, double speedMps, double alphaRad = 0.0) {
        var flightForward = new Vec3D(0.0, 0.0, 1.0);
        var liftUp = new Vec3D(0.0, 1.0, 0.0);
        var bodyForward = (flightForward * Math.Cos(alphaRad)
            + liftUp * Math.Sin(alphaRad)).Normalized();
        var bodyUp = (liftUp * Math.Cos(alphaRad)
            - flightForward * Math.Sin(alphaRad)).Normalized();
        var attitude = QuaternionD.FromFrame(bodyUp.Cross(bodyForward).Normalized(),
            bodyUp, bodyForward);
        return new AircraftState(new Vec3D(0.0, altitudeM, 0.0), speedMps,
            0.0, 0.0, 0.0, FlightModel.Sabre.MassKg, attitude);
    }

    static BeatSetup TestBeat(double playerAltitudeM = 500.0,
        double banditAltitudeM = 1_500.0, double speedMps = 160.0) => new(
        "weather integration",
        State(playerAltitudeM, speedMps),
        State(banditAltitudeM, speedMps),
        new PurePursuitLaw(),
        new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) });

    [Fact]
    public void ExplicitStandardAtmosphereIsBitExactWithTheDefaultAircraft() {
        AircraftState initial = State(3_000.0, 190.0);
        var implicitStandard = new AircraftSim(initial, FlightModel.Sabre);
        var explicitStandard = new AircraftSim(initial, FlightModel.Sabre,
            StandardAtmosphere1976.Instance);
        var command = new PilotCommand(3.5, 0.72, 0.93, -0.08);

        for (int i = 0; i < 360; i++) {
            implicitStandard.Step(command, 1.0 / AircraftSim.TickHz);
            explicitStandard.Step(command, 1.0 / AircraftSim.TickHz);
        }

        Assert.Same(StandardAtmosphere1976.Instance, implicitStandard.AtmosphereModel);
        Assert.Equal(implicitStandard.State, explicitStandard.State);
        Assert.Equal(implicitStandard.AirVelocity, explicitStandard.AirVelocity);
        Assert.Equal(implicitStandard.LastNz, explicitStandard.LastNz);
        Assert.Equal(implicitStandard.LastEngineOperatingPoint,
            explicitStandard.LastEngineOperatingPoint);
    }

    [Fact]
    public void HotAndColdProfilesChangeLocalAirDataAndAerodynamicForce() {
        var hot = Column(310.0, 245.0);
        var cold = Column(260.0, 195.0);
        AircraftState initial = State(0.0, 150.0, alphaRad: 7.0 * Math.PI / 180.0);
        var hotAircraft = new AircraftSim(initial, FlightModel.Sabre, hot);
        var coldAircraft = new AircraftSim(initial, FlightModel.Sabre, cold);
        var hold = new PilotCommand(1.0, 0.0, 0.0, 0.0,
            CommandedPitchRad: 7.0 * Math.PI / 180.0);

        hotAircraft.Step(hold, 1.0 / AircraftSim.TickHz);
        coldAircraft.Step(hold, 1.0 / AircraftSim.TickHz);

        Assert.True(hotAircraft.AtmosphericState.DensityKgM3
            < coldAircraft.AtmosphericState.DensityKgM3);
        Assert.True(hotAircraft.AtmosphericState.SpeedOfSoundMps
            > coldAircraft.AtmosphericState.SpeedOfSoundMps);
        Assert.True(coldAircraft.LastNz > hotAircraft.LastNz);

        double hotIas = AirData.IndicatedAirspeedMps(150.0, 0.0, hot);
        double coldIas = AirData.IndicatedAirspeedMps(150.0, 0.0, cold);
        Assert.True(coldIas > hotIas);
    }

    [Fact]
    public void AircraftSamplesLayeredWindAtItsOwnGeometricAltitude() {
        var wind = new LayeredWindField(
        [
            new WindVectorLevel(0.0, new Vec3D(0.0, 0.0, 12.0)),
            new WindVectorLevel(2_000.0, new Vec3D(24.0, 0.0, -4.0))
        ]);
        var low = new AircraftSim(State(0.0, 160.0), FlightModel.Sabre) { Wind = wind };
        var high = new AircraftSim(State(2_000.0, 160.0), FlightModel.Sabre) { Wind = wind };

        Assert.Equal(low.State.VelocityVector() - wind.Sample(low.State.Position),
            low.AirVelocity);
        Assert.Equal(high.State.VelocityVector() - wind.Sample(high.State.Position),
            high.AirVelocity);
        Assert.NotEqual(low.AirVelocity, high.AirVelocity);
    }

    [Fact]
    public void SessionAppliesOneWeatherProfileToPlayerAndBandit() {
        var profile = new WeatherProfile(
            Column(301.0, 236.0),
            new LayeredWindField(
            [
                new WindVectorLevel(-1_000.0, new Vec3D(2.0, 0.0, 4.0)),
                new WindVectorLevel(10_000.0, new Vec3D(22.0, 0.0, -3.0))
            ]));
        var session = new SimulationSession();

        session.StartBeat(() => TestBeat(), profile);

        Assert.Same(profile, session.Weather);
        Assert.Same(profile.Atmosphere, session.Player.AtmosphereModel);
        Assert.Same(profile.Atmosphere, session.Bandit.Atmosphere);
        Assert.Same(profile.Atmosphere, session.Controls.AtmosphereModel);
        Assert.Same(profile.Wind, session.Player.Wind);
        Assert.Same(profile.Wind, session.Bandit.Wind);
        Assert.Equal(session.Player.State.VelocityVector()
            - profile.Wind.Sample(session.Player.State.Position), session.Player.AirVelocity);

        session.Begin();
        session.StepFixed();

        Assert.Same(profile.Atmosphere, session.Player.AtmosphereModel);
        Assert.Same(profile.Atmosphere, session.Bandit.Atmosphere);
        Assert.Same(profile.Atmosphere, session.Controls.AtmosphereModel);
    }

    [Fact]
    public void ProtectionBoundaryUsesTheSelectedAtmosphericDensity() {
        var hot = Column(315.0, 250.0);
        var cold = Column(255.0, 190.0);
        AircraftState state = State(0.0, 115.0);

        double hotLimit = Protection.MaxPerformG(state, FlightModel.Sabre, 115.0, hot);
        double coldLimit = Protection.MaxPerformG(state, FlightModel.Sabre, 115.0, cold);

        Assert.True(coldLimit > hotLimit,
            $"denser cold air should raise the same-TAS lift boundary: hot={hotLimit}, cold={coldLimit}");
    }

    [Fact]
    public void AirframeSystemsReceiveCasFromTheSelectedAtmosphere() {
        var standardWeather = new WeatherProfile(StandardAtmosphere1976.Instance, CalmWind());
        var lowPressureWeather = new WeatherProfile(
            Column(288.15, 223.15, seaLevelPressurePa: 30_000.0), CalmWind());
        var standard = new SimulationSession();
        var lowPressure = new SimulationSession();
        standard.StartBeat(() => TestBeat(playerAltitudeM: 500.0, speedMps: 100.0),
            standardWeather);
        lowPressure.StartBeat(() => TestBeat(playerAltitudeM: 500.0, speedMps: 100.0),
            lowPressureWeather);
        standard.Begin();
        lowPressure.Begin();
        standard.FeedKey(GKey.EmergencyGearRelease, true);
        lowPressure.FeedKey(GKey.EmergencyGearRelease, true);

        standard.StepFixed();
        lowPressure.StepFixed();

        Assert.True(standard.PlayerSystems.IndicatedAirspeedKnots
            > standard.PlayerSystems.Profile.EmergencyGearExtensionMaxKias);
        Assert.True(lowPressure.PlayerSystems.IndicatedAirspeedKnots
            < lowPressure.PlayerSystems.Profile.EmergencyGearExtensionMaxKias);
        Assert.Equal(0.0, standard.PlayerSystems.GearDoorPosition);
        Assert.True(lowPressure.PlayerSystems.GearDoorPosition > 0.0);
    }
}
