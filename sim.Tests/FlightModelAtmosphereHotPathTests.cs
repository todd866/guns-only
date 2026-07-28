using GunsOnly.Sim;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class FlightModelAtmosphereHotPathTests {
    sealed class CountingAtmosphere : IAtmosphereModel {
        public int SampleCount { get; private set; }

        public AtmosphericState Sample(double altitudeM) {
            SampleCount++;
            return StandardAtmosphere1976.Instance.Sample(altitudeM);
        }
    }

    sealed class SmoothWind : IWindField {
        public Vec3D Sample(Vec3D position) => new(
            5.0 + 0.0002 * position.Z,
            0.8 * System.Math.Sin(position.X * 0.0007),
            -2.0 + 0.0001 * position.Y);
    }

    static RawState CombatState() {
        var state = new AircraftState(
            new Vec3D(1700.0, 4200.0, -850.0),
            235.0,
            0.18,
            -0.42,
            0.73,
            FlightModel.Sabre.MassKg);
        return new RawState(
            state.Position,
            state.VelocityVector(),
            state.Bank,
            state.Mass,
            state.BodyAttitude,
            state.BodyRates);
    }

    [Fact]
    public void DerivativeStageSamplesAtmosphereExactlyOnce() {
        var atmosphere = new CountingAtmosphere();
        RawState raw = CombatState();

        _ = FlightModel.Derivatives(
            raw,
            new PilotCommand(6.5, 0.7, 0.95, 0.15),
            FlightModel.Sabre,
            new Vec3D(0.0, 1.0, 0.0),
            new Vec3D(5.0, -1.0, 3.0),
            netThrustN: 20_000.0,
            AirframeAerodynamicState.Clean,
            atmosphere);

        Assert.Equal(1, atmosphere.SampleCount);
    }

    [Fact]
    public void CachedStageAtmosphereMatchesTheStandardAtmosphereTrajectoryExactly() {
        var direct = new AircraftSim(
            new AircraftState(
                new Vec3D(1700.0, 4200.0, -850.0),
                235.0,
                0.18,
                -0.42,
                0.73,
                FlightModel.Sabre.MassKg),
            FlightModel.Sabre);
        var counted = new AircraftSim(direct.State, FlightModel.Sabre) {
            AtmosphereModel = new CountingAtmosphere()
        };

        for (int tick = 0; tick < 1200; tick++) {
            double phase = tick * 0.013;
            var command = new PilotCommand(
                4.0 + 2.5 * System.Math.Sin(phase),
                0.9 * System.Math.Sin(phase * 0.37),
                0.85 + 0.1 * System.Math.Cos(phase * 0.23),
                0.2 * System.Math.Sin(phase * 0.61));
            direct.Step(command, 1.0 / AircraftSim.TickHz);
            counted.Step(command, 1.0 / AircraftSim.TickHz);
        }

        Assert.Equal(direct.State, counted.State);
        Assert.Equal(direct.AirVelocity, counted.AirVelocity);
        Assert.Equal(direct.LastNz, counted.LastNz);
        Assert.Equal(direct.LastRollMomentNm, counted.LastRollMomentNm);
        Assert.Equal(direct.LastEngineOperatingPoint, counted.LastEngineOperatingPoint);
    }

    [Fact]
    public void PredictionStepPreservesTheExactPhysicalTrajectory() {
        AircraftParams airframe = FlightModel.F22APublicDataSurrogate with {
            ColdGasRcsMaxMomentNm = 220_000.0,
            ColdGasRcsGasCapacityKg = 8.0,
            ColdGasRcsBurnKgPerFullSecond = 0.35
        };
        var initial = new AircraftState(
            new Vec3D(-900.0, 6100.0, 1400.0),
            260.0,
            -0.12,
            0.34,
            -0.65,
            airframe.MassKg);
        var wind = new SmoothWind();
        var full = new AircraftSim(initial, airframe) { Wind = wind };
        var prediction = new AircraftSim(initial, airframe) { Wind = wind };

        for (int tick = 0; tick < 1200; tick++) {
            double phase = tick * 0.017;
            var command = new PilotCommand(
                8.0 + 4.0 * System.Math.Sin(phase * 0.43),
                1.2 * System.Math.Sin(phase * 0.31),
                0.7 + 0.6 * System.Math.Cos(phase * 0.19),
                0.35 * System.Math.Sin(phase * 0.71),
                RollControl: 0.7 * System.Math.Sin(phase * 0.53),
                SasRollControl: 0.1 * System.Math.Cos(phase * 0.29),
                DirectLateralControl: true);

            full.Step(command, 1.0 / AircraftSim.TickHz);
            prediction.StepPrediction(command, 1.0 / AircraftSim.TickHz);

            Assert.Equal(full.State, prediction.State);
            Assert.Equal(full.AirVelocity, prediction.AirVelocity);
            Assert.Equal(full.ThrustFraction, prediction.ThrustFraction);
            Assert.Equal(full.LastEngineOperatingPoint, prediction.LastEngineOperatingPoint);
            Assert.Equal(full.EffectiveAerodynamicConfiguration,
                prediction.EffectiveAerodynamicConfiguration);
            Assert.Equal(full.SpeedBrake, prediction.SpeedBrake);
            Assert.Equal(full.LeadingEdgeFlaps, prediction.LeadingEdgeFlaps);
            Assert.Equal(full.ColdGasRcsGasKg, prediction.ColdGasRcsGasKg);
        }
    }
}
