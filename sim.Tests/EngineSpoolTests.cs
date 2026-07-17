using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// Thrust is not instantaneous. Before this, FlightModel read the throttle lever directly, so
/// slamming the lever gave you full thrust in the same tick. On the back side of the power
/// curve -- where a carrier approach lives -- the engine's lag IS the difficulty.
public class EngineSpoolTests {
    static AircraftSim LevelAt(double kts, AircraftParams p, double altM = 300) =>
        new(new AircraftState(new Vec3D(0, altM, 0), kts / 1.94384, 0, 0, 0, p.MassKg), p);

    [Fact]
    public void EngineStartsTrimmedNotSpoolingFromIdle() {
        // Starting every aircraft at zero thrust would silently re-tune every beat.
        var p = FlightModel.Sabre;
        var sim = LevelAt(400, p);
        sim.Step(new PilotCommand(1.0, 0, 0.8, 0), 1.0 / AircraftSim.TickHz);
        Assert.Equal(0.8, sim.ThrustFraction, 3);
    }

    [Fact]
    public void ThrustLagsTheLeverByRoughlyTheTimeConstant() {
        var p = FlightModel.Sabre with { SpoolUpTau = 2.0, SpoolDownTau = 1.0 };
        var sim = LevelAt(400, p);
        double dt = 1.0 / AircraftSim.TickHz;
        sim.Step(new PilotCommand(1.0, 0, 0.0, 0), dt);      // trimmed at idle
        Assert.Equal(0.0, sim.ThrustFraction, 3);

        // Slam to full. A first-order lag reaches ~63% in one tau.
        for (int i = 0; i < (int)(2.0 * AircraftSim.TickHz); i++)
            sim.Step(new PilotCommand(1.0, 0, 1.0, 0), dt);
        Assert.InRange(sim.ThrustFraction, 0.60, 0.66);

        // ...and ~95% by three tau. NOT 100% in one tick.
        for (int i = 0; i < (int)(4.0 * AircraftSim.TickHz); i++)
            sim.Step(new PilotCommand(1.0, 0, 1.0, 0), dt);
        Assert.InRange(sim.ThrustFraction, 0.94, 0.99);
    }

    [Fact]
    public void SpoolDownIsFasterThanSpoolUp() {
        var p = FlightModel.Sabre;
        Assert.True(p.SpoolDownTau < p.SpoolUpTau, "a compressor sheds RPM more readily than it gains it");
    }

    [Fact]
    public void ThrustNeverOvershootsTheLeverEvenAtCoarseDt() {
        var p = FlightModel.Sabre with { SpoolUpTau = 0.05 };
        var sim = LevelAt(400, p);
        sim.Step(new PilotCommand(1.0, 0, 0.0, 0), 1.0 / AircraftSim.TickHz);
        sim.Step(new PilotCommand(1.0, 0, 1.0, 0), 0.25);   // dt >> tau: an Euler step would blow past 1.0
        Assert.InRange(sim.ThrustFraction, 0.0, 1.0);
    }

    [Fact]
    public void WaveoffCostsRealDistance() {
        // The handling consequence, and the reason this matters. Two identical aircraft slam the
        // throttle open at the same instant; one has an instant engine, one a real one. The gap
        // between them is how far down the groove you go before the engine answers.
        var instant = FlightModel.Sabre with { SpoolUpTau = 0.0, SpoolDownTau = 0.0 };
        var real = FlightModel.Sabre with { SpoolUpTau = 3.5, SpoolDownTau = 1.8 };
        var a = LevelAt(140, instant);
        var b = LevelAt(140, real);
        double dt = 1.0 / AircraftSim.TickHz;
        a.Step(new PilotCommand(1.0, 0, 0.15, 0), dt);   // both trimmed at approach power
        b.Step(new PilotCommand(1.0, 0, 0.15, 0), dt);
        for (int i = 0; i < (int)(4.0 * AircraftSim.TickHz); i++) {
            a.Step(new PilotCommand(1.0, 0, 1.0, 0), dt);  // WAVEOFF: firewall it
            b.Step(new PilotCommand(1.0, 0, 1.0, 0), dt);
        }
        Assert.True(a.State.Speed > b.State.Speed,
            "the instant engine must be faster after 4s — otherwise the lag does nothing");
        Assert.True(b.ThrustFraction < 0.95, "a 3.5s-tau engine is still spooling 4s into a waveoff");
    }
}
