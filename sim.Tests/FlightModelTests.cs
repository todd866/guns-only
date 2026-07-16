using GunsOnly.Sim;
using Xunit;

public class FlightModelTests {
    static AircraftState Level(double speed = 180, double alt = 3000) =>
        new(new Vec3D(0, alt, 0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    static PilotCommand Cruise => new(1.0, 0.0, 0.85, 0.0);

    [Fact] public void LevelOneGFlightHoldsAltitudeApproximately() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        for (int i = 0; i < 1200; i++) sim.Step(Cruise, 1.0/AircraftSim.TickHz); // 10 s
        Assert.InRange(sim.State.Position.Y, 2900, 3100);
    }
    [Fact] public void SustainedMaxGBleedsSpeed() { // energy honesty: induced drag beats thrust at high G
        var sim = new AircraftSim(Level(220), FlightModel.Sabre);
        var pull = new PilotCommand(6.0, 1.2, 1.0, 0.0);
        double v0 = sim.State.Speed;
        for (int i = 0; i < 960; i++) sim.Step(pull, 1.0/AircraftSim.TickHz); // 8 s
        Assert.True(sim.State.Speed < v0 - 25, $"speed only fell {v0 - sim.State.Speed:F1} m/s");
    }
    [Fact] public void UnloadedDiveGainsSpeed() {
        var start = Level(160) with { Gamma = -0.20 };
        var sim = new AircraftSim(start, FlightModel.Sabre);
        var unload = new PilotCommand(0.2, 0.0, 1.0, 0.0);
        double v0 = sim.State.Speed;
        for (int i = 0; i < 600; i++) sim.Step(unload, 1.0/AircraftSim.TickHz); // 5 s
        Assert.True(sim.State.Speed > v0 + 15);
    }
    [Fact] public void GAvailableIsLowWhenSlowHighWhenFast() {
        Assert.True(FlightModel.NzAeroMax(Level(90), FlightModel.Sabre) < 2.5);
        Assert.True(FlightModel.NzAeroMax(Level(260), FlightModel.Sabre) > 6.0);
    }
    [Fact] public void BuffetFlagsNearAeroLimit() {
        var sim = new AircraftSim(Level(140), FlightModel.Sabre);
        var hard = new PilotCommand(9.0, 0.0, 1.0, 0.0); // demands far beyond available
        for (int i = 0; i < 120; i++) sim.Step(hard, 1.0/AircraftSim.TickHz);
        Assert.True(sim.Buffet);
    }
    [Fact] public void BankApproachesTargetAtFiniteRate() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var roll = new PilotCommand(1.0, 1.5708, 0.85, 0.0);
        sim.Step(roll, 1.0/AircraftSim.TickHz);
        Assert.True(sim.State.Bank < 0.10); // one tick cannot snap to 90 deg
        for (int i = 0; i < 240; i++) sim.Step(roll, 1.0/AircraftSim.TickHz); // 2 s
        Assert.InRange(sim.State.Bank, 1.35, 1.60);
    }
    [Fact] public void DeterministicGivenSameInputs() {
        var a = new AircraftSim(Level(), FlightModel.Sabre);
        var b = new AircraftSim(Level(), FlightModel.Sabre);
        var cmd = new PilotCommand(4.0, 0.9, 1.0, 0.0);
        for (int i = 0; i < 1000; i++) { a.Step(cmd, 1.0/AircraftSim.TickHz); b.Step(cmd, 1.0/AircraftSim.TickHz); }
        Assert.Equal(a.State, b.State);
    }
    [Fact] public void NearVerticalFlightDoesNotHangOrDiverge() {
        var vertical = new AircraftState(new Vec3D(0, 2000, 0), 150, 1.55, 0, 0.8, FlightModel.Sabre.MassKg);
        var sim = new AircraftSim(vertical, FlightModel.Sabre);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        for (int i = 0; i < 600; i++) sim.Step(new PilotCommand(1.0, 0.8, 1.0, 0.0), 1.0/AircraftSim.TickHz);
        sw.Stop();
        Assert.True(double.IsFinite(sim.State.Chi) && double.IsFinite(sim.State.Speed));
        Assert.True(sw.ElapsedMilliseconds < 2000, $"5 s of near-vertical sim took {sw.ElapsedMilliseconds} ms");
    }
    [Fact] public void HardPullClimbsPastFiftyDegreesWithoutSingularity() {
        var sim = new AircraftSim(Level(220, 2000), FlightModel.Sabre);
        double maxGamma = 0;
        for (int i = 0; i < 1440; i++) {
            sim.Step(new PilotCommand(6.5, 0.0, 1.0, 0.0), 1.0/AircraftSim.TickHz);
            maxGamma = System.Math.Max(maxGamma, sim.State.Gamma);
        }
        Assert.True(maxGamma > 0.9, $"max gamma {maxGamma:F2} rad");
        Assert.True(double.IsFinite(sim.State.Chi));
    }
    [Fact] public void OneStepBankResponseMatchesRk4Oracle() {
        // Linear ODE dphi/dt = (0.3 - phi)/tau from 0, one step h = tau (x=1):
        // RK4 one-step factor = 4th-order Taylor of e^-1 = 1 - 1 + 1/2 - 1/6 + 1/24 = 0.375  (VERIFY this arithmetic)
        // so phi = 0.3 * (1 - 0.375) = 0.1875. Euler gives 0.3, RK2 gives 0.15 — this pins RK4.
        var sim = new AircraftSim(Level(180, 3000), FlightModel.Sabre);
        sim.Step(new PilotCommand(1.0, 0.3, 0.85, 0.0), 0.18);
        Assert.Equal(0.1875, sim.State.Bank, 6);
    }
    [Fact] public void NegativeGRespectsAeroLimitWhenSlow() {
        var slow = Level(60, 3000);
        var sim = new AircraftSim(slow, FlightModel.Sabre);
        sim.Step(new PilotCommand(-1.0, 0.0, 0.5, 0.0), 1.0/AircraftSim.TickHz);
        Assert.True(sim.LastNz > -1.0, $"nz {sim.LastNz:F3} should be aero-limited above -1G at 60 m/s");
        Assert.True(sim.LastNz >= FlightModel.NzAeroMin(slow, FlightModel.Sabre) - 1e-9);
    }
}
