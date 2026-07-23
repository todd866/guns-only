using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Pilot doctrine (2026-07-23): "if you carefully descend through 1000 ft AO then GCAS turns
/// itself off. It's really just supposed to be a failsafe for 'I got disoriented while
/// dogfighting', not 'I fucked up while low flying'." These tests pin the latch semantics: a
/// careful, in-control crossing of the 1000 ft above-obstacles gate stands the system down and
/// it HOLDS ITS FIRE below the gate; a tumbled, loaded crossing keeps it armed; sustained
/// flight back above the gate re-arms it; assisted (rung-1) flight never latches standby.
/// </summary>
public class AutoGcasLowLevelStandbyTests {
    readonly ITestOutputHelper _output;
    public AutoGcasLowLevelStandbyTests(ITestOutputHelper output) => _output = output;

    static ITerrainSurface FlatTerrain() =>
        new BilinearHeightGrid(-60_000.0, -60_000.0, 120_000.0, 120_000.0,
            new double[,] { { 0.0, 0.0 }, { 0.0, 0.0 } });

    static AircraftState Entry(double altitudeM, double speedMps, double gammaDegrees,
        double bankDegrees = 0.0) => new(
        new Vec3D(0.0, altitudeM, 0.0), speedMps,
        gammaDegrees * System.Math.PI / 180.0, 0.0,
        bankDegrees * System.Math.PI / 180.0,
        FlightModel.F22APublicDataSurrogate.MassKg);

    static BeatSetup Beat(AircraftState player) => new(
        "Auto-GCAS low-level standby",
        Player: player,
        Bandit: new AircraftState(new Vec3D(20000.0, 3000.0, 20000.0),
            220.0, 0.0, System.Math.PI, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg),
        Law: new PurePursuitLaw(),
        BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) },
        PlayerParams: FlightModel.F22APublicDataSurrogate,
        BanditParams: FlightModel.Su27SPublicDataSurrogate,
        PlayerCapability: AircraftCapability.F22ASurrogate,
        BanditCapability: AircraftCapability.Su27SSurrogate,
        PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference);

    static SimulationSession Start(AircraftState player, bool assisted = false) {
        var session = new SimulationSession();
        session.StartBeat(() => Beat(player));
        session.SetTerrainSurface(FlatTerrain());
        if (assisted) session.SetAssistedFlight(true);
        session.Begin();
        return session;
    }

    [Fact]
    public void CarefulDescentThroughGateLatchesStandbyAndHoldsFire() {
        // A gentle 8-degree, wings-level, unloaded descent from above the gate: the careful
        // history is established well before the 1000 ft crossing, so standby latches at the
        // crossing itself.
        var session = Start(Entry(450.0, 200.0, -8.0));
        bool latched = false;
        double latchAltitudeM = double.NaN;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (!latched && session.AutoGcasLowLevelStandby) {
                latched = true;
                latchAltitudeM = session.Player.State.Position.Y;
                break;
            }
        }
        _output.WriteLine($"latched={latched} at {latchAltitudeM:F0} m AGL");
        Assert.True(latched, "a careful descent through 1000 ft AO must latch standby");
        Assert.True(latchAltitudeM < 304.8 + 30.0,
            $"standby latched at {latchAltitudeM:F0} m — well above the 1000 ft gate");
        Assert.Equal(0, session.AutoGcas.ActivationCount);

        // Below the gate the pilot owns the jet: a commanded dive at the ground draws NO
        // fly-up. Stop the run above the surface — the point is the held fire, not the crater.
        session.FeedKey(GKey.PushDown, true);
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying
            && session.Player.State.Position.Y > 60.0; tick++) {
            session.StepFixed();
        }
        _output.WriteLine($"post-dive: y={session.Player.State.Position.Y:F0} m " +
            $"activations={session.AutoGcas.ActivationCount}");
        Assert.True(session.AutoGcasLowLevelStandby, "standby must hold below the gate");
        Assert.Equal(0, session.AutoGcas.ActivationCount);
    }

    [Fact]
    public void TumbledCrossingStaysArmedAndStillFires() {
        // A steep, banked, hands-off plunge through the gate is the disoriented case the
        // failsafe exists for: no latch, and the fly-up still fires and saves the jet.
        var session = Start(Entry(800.0, 250.0, -30.0, bankDegrees: 60.0));
        bool activated = false;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (session.AutoGcas.ActivationCount > 0) { activated = true; break; }
        }
        Assert.False(session.AutoGcasLowLevelStandby,
            "a tumbled crossing must never latch low-level standby");
        Assert.True(activated, "the armed system must still fire on the disoriented plunge");
    }

    [Fact]
    public void SustainedClimbAboveGateReArms() {
        var session = Start(Entry(450.0, 200.0, -8.0));
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && !session.AutoGcasLowLevelStandby
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++)
            session.StepFixed();
        Assert.True(session.AutoGcasLowLevelStandby);

        // Climb back out and hold the high block: after the sustained-above dwell the
        // failsafe re-arms on its own.
        session.FeedKey(GKey.PullUp, true);
        bool rearmed = false;
        for (int tick = 0; tick < 40 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (session.Player.State.Position.Y > 1200.0)
                session.FeedKey(GKey.PullUp, false);
            if (!session.AutoGcasLowLevelStandby) { rearmed = true; break; }
        }
        _output.WriteLine($"rearmed={rearmed} y={session.Player.State.Position.Y:F0} m");
        Assert.True(rearmed, "sustained flight above 1000 ft AO must re-arm the failsafe");
    }

    [Fact]
    public void AssistedFlightNeverLatchesStandby() {
        // Rung-1 assisted flight keeps full protection: the portrait autopilot has no terrain
        // logic, so the failsafe must not stand down under it.
        var session = Start(Entry(450.0, 200.0, -8.0), assisted: true);
        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying
            && session.Player.State.Position.Y > 120.0; tick++) {
            session.StepFixed();
            Assert.False(session.AutoGcasLowLevelStandby,
                "assisted flight must never latch low-level standby");
        }
    }
}
