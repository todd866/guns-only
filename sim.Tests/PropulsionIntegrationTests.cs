using GunsOnly.Sim;
using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim.Tests;

public sealed class PropulsionIntegrationTests {
    [Fact]
    public void ProductionSessionUsesJ47FlowAndFuelMassInOneConservationChain() {
        var session = new SimulationSession(1);
        double stagedFuel = session.PlayerFuel.FuelLb;
        double stagedMass = session.Player.State.Mass;

        Assert.Equal(FlightModel.Sabre.FuelFreeMassKg
            + stagedFuel * 0.45359237, stagedMass, 8);

        session.Begin();
        session.StepFixed();

        EngineOperatingPoint engine = session.Player.LastEngineOperatingPoint;
        Assert.True(engine.Running);
        Assert.True(engine.RpmPercent > 34.0);
        Assert.InRange(engine.FuelFlowLbPerMinute, 1.0,
            J47PerformanceMap.RatedFuelFlowLbPerMinute + 0.01);
        Assert.Equal(engine.FuelFlowLbPerMinute,
            session.PlayerFuel.BurnLbPerMinute, 6);
        Assert.Equal(FlightModel.Sabre.FuelFreeMassKg
            + session.PlayerFuel.FuelLb * 0.45359237,
            session.Player.State.Mass, 8);
        Assert.True(session.Player.State.Mass < stagedMass);
    }

    [Fact]
    public void FuelStarvationRemovesCombustionThrustWithoutMovingTheLever() {
        var state = new AircraftState(new Vec3D(0.0, 1500.0, 0.0), 180.0,
            0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        var sim = new AircraftSim(state, FlightModel.Sabre);
        var military = new PilotCommand(1.0, 0.0, 1.0, 0.0);

        sim.Step(military, 1.0 / AircraftSim.TickHz);
        Assert.True(sim.LastEngineOperatingPoint.Running);
        Assert.True(sim.LastEngineOperatingPoint.NetThrustN > 0.0);

        sim.EngineFuelAvailable = false;
        sim.Step(military, 1.0 / AircraftSim.TickHz);

        Assert.False(sim.LastEngineOperatingPoint.Running);
        Assert.Equal(0.0, sim.LastEngineOperatingPoint.NetThrustN);
        Assert.Equal(0.0, sim.LastEngineOperatingPoint.FuelFlowLbPerMinute);
        Assert.True(sim.ThrustFraction < 1.0); // the spool target is decaying, not lever state.
    }

    [Fact]
    public void ConfiguredStallAndCornerCuesMoveWithActualFlaps() {
        var systems = new AirframeSystems(initialFlapDegrees:
            AirframeSystemsProfile.F86FResearchBasis.FullFlapDegrees);
        double liftIncrement = systems.AerodynamicState.LiftCoefficientIncrement;

        double cleanStall = AirData.StallSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre);
        double configuredStall = AirData.StallSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre, 1.0, liftIncrement);
        double cleanCorner = AirData.PositiveCornerSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre);
        double configuredCorner = AirData.PositiveCornerSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre, liftIncrement);

        Assert.True(configuredStall < cleanStall);
        Assert.True(configuredCorner < cleanCorner);
        Assert.Equal(configuredStall * Math.Sqrt(FlightModel.Sabre.PositiveStructuralLimitG),
            configuredCorner, 9);
    }
}
