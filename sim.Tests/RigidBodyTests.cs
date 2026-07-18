using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class RigidBodyTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static AircraftState Level() =>
        new(new Vec3D(0, 3000, 0), 180, 0, 0, 0, FlightModel.Sabre.MassKg);

    [Fact]
    public void PitchStepSlewsInsteadOfSnapping() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        double pitch0 = sim.BodyPitchRad;
        double target = pitch0 + 0.20;
        var step = new PilotCommand(1.0, 0.0, 0.85, 0.0, target);

        sim.Step(step, Dt);

        Assert.True(sim.BodyPitchRad > pitch0, "the pitch moment must start moving the nose");
        Assert.True(sim.BodyPitchRad < pitch0 + 0.01, "one tick must not reach a 0.20 rad attitude step");
        Assert.True(sim.State.BodyRates.Q > 0, "pitch rate must build from the applied moment");
        for (int i = 0; i < 240; i++) sim.Step(step, Dt);
        Assert.InRange(sim.BodyPitchRad, target - 0.025, target + 0.025);
    }

    [Fact]
    public void RollRateBuildsAndTakesTimeToArrest() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var roll = new PilotCommand(1.0, 1.0, 0.85, 0.0);
        sim.Step(roll, Dt);
        double pFirst = sim.State.BodyRates.P;
        for (int i = 0; i < 29; i++) sim.Step(roll, Dt);
        double pBuilt = sim.State.BodyRates.P;
        double bankAtRelease = sim.BodyRollRad;

        var level = new PilotCommand(1.0, 0.0, 0.85, 0.0);
        sim.Step(level, Dt);

        Assert.True(pFirst > 0, "roll moment must build positive p");
        Assert.True(pBuilt > pFirst, "roll rate must build over time, not appear fully formed");
        Assert.True(sim.State.BodyRates.P > 0, "angular inertia must keep p nonzero one tick after reversal");
        Assert.True(sim.BodyRollRad > bankAtRelease, "the wings must keep rolling briefly while p arrests");
        for (int i = 0; i < 240; i++) sim.Step(level, Dt);
        Assert.True(System.Math.Abs(sim.State.BodyRates.P) < 0.05, "roll damping must arrest the rate");
        Assert.True(System.Math.Abs(sim.BodyRollRad) < 0.05, "the attitude controller must recover wings level");
    }
}
