using System;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Adversarial-review follow-up (Codex, 2026-07-24): the single last-instant boundary fires only
/// when TimeAvailable() returns 0 (its 8-bisection resolution, 8s/256 ≈ 0.031s, exceeds the 0.03s
/// threshold), and the predictor evaluates every 6 ticks (0.05s) — so a fast passive descent could
/// commit up to one evaluation interval late. The corridor tests exercise ASSISTED (auto-pull,
/// gentle) trajectories only. This closes that gap with the uncovered case: a hands-off pilot in a
/// steep dive, run closed-loop at the real cadence, must still be caught without ground contact.
/// </summary>
public class AutoGcasPassiveSteepDiveSaveTests {
    readonly ITestOutputHelper _output;
    public AutoGcasPassiveSteepDiveSaveTests(ITestOutputHelper output) => _output = output;

    static ITerrainSurface FlatTerrain(double h = 0.0) =>
        new BilinearHeightGrid(-200_000.0, -200_000.0, 400_000.0, 400_000.0,
            new double[,] { { h, h }, { h, h } });

    [Theory]
    [InlineData(-40.0, 260.0)]
    [InlineData(-55.0, 300.0)]
    [InlineData(-70.0, 320.0)]
    [InlineData(-80.0, 340.0)]
    public void HandsOffSteepDiveIsCaughtWithoutGroundContact(
        double gammaDeg, double speedMps) {
        // A passive pilot: not assisted, holding a neutral 1 G with no roll/rudder — the exact
        // profile the corridor tests do not cover. Start high enough that the fly-up must do the
        // work (well above any commit altitude for these dives).
        var session = new SimulationSession();
        session.StartBeat(() => new BeatSetup(
            "passive steep dive",
            Player: new AircraftState(new Vec3D(0.0, 3_000.0, 0.0), speedMps,
                gammaDeg * Math.PI / 180.0, 0.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit: new AircraftState(new Vec3D(30_000.0, 3_000.0, 30_000.0),
                220.0, 0.0, Math.PI, 0.0, FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) },
            PlayerParams: FlightModel.F22APublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference));
        session.SetTerrainSurface(FlatTerrain());
        session.Begin();

        double minimumAgl = double.PositiveInfinity;
        bool activated = false;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            activated |= session.AutoGcas.ActivationCount > 0;
            minimumAgl = Math.Min(minimumAgl, session.Player.State.Position.Y);
            // Stop once safely climbed back through the commit band.
            if (activated && session.Player.State.VelocityVector().Y >= 0.0
                && session.Player.State.Position.Y > 400.0) break;
        }

        _output.WriteLine($"gamma={gammaDeg} spd={speedMps} activated={activated} " +
            $"minAgl={minimumAgl:F1} m ({minimumAgl * 3.28084:F0} ft) " +
            $"terminal={session.PlayerTerminalState}");

        Assert.True(activated, "the hands-off steep dive must trigger the fly-up");
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.True(minimumAgl > 0.0,
            $"the passive save contacted the ground (bottomed at {minimumAgl:F1} m)");
    }
}
