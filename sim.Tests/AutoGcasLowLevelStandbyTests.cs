using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Low-level standby v2 (pilot doctrine, 2026-07-23): Auto-GCAS is a failsafe for "I got
/// disoriented while dogfighting", not a low-flying governor. The continuous rule:
/// conscious + unassisted + hands-on + below 1000 ft AO means the low block belongs to the
/// pilot — no warning, no fly-up. Hands leave the controls (or G-LOC drops authority) and
/// full protection returns within a prediction tick. Above ~1100 ft the system is always
/// armed. These tests pin that contract end-to-end through the production session.
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
    public void HandsOnBelowGateStandsDownAndHoldsFire() {
        // A hands-on descent — ANY descent, not a blessed "careful" one — owns the low block
        // the moment it is below the gate. The pilot rides the push all the way down; the
        // system never fires. Stop above the surface: the point is the held fire.
        var session = Start(Entry(450.0, 200.0, -8.0));
        session.FeedKey(GKey.PushDown, true);
        bool sawStandby = false;
        for (int tick = 0; tick < 40 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying
            && session.Player.State.Position.Y > 60.0; tick++) {
            session.StepFixed();
            if (!sawStandby && session.AutoGcasLowLevelStandby) {
                sawStandby = true;
                _output.WriteLine(
                    $"standby at {session.Player.State.Position.Y:F0} m AGL");
                Assert.True(session.Player.State.Position.Y < 304.8 + 30.0,
                    "standby must not engage above the 1000 ft gate");
            }
        }
        _output.WriteLine($"end: y={session.Player.State.Position.Y:F0} m " +
            $"activations={session.AutoGcas.ActivationCount}");
        Assert.True(sawStandby, "a hands-on pilot below 1000 ft AO must stand the system down");
        Assert.True(session.AutoGcasLowLevelStandby, "standby must hold while hands-on and low");
        Assert.Equal(0, session.AutoGcas.ActivationCount);
    }

    [Fact]
    public void HandsOffPlungeStaysArmedAndStillFires() {
        // A hands-off, banked plunge through the gate is the disoriented case the failsafe
        // exists for: no standby, and the fly-up still fires and saves the jet.
        var session = Start(Entry(800.0, 250.0, -30.0, bankDegrees: 60.0));
        bool activated = false;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            Assert.False(session.AutoGcasLowLevelStandby,
                "a hands-off descent must never stand the failsafe down");
            if (session.AutoGcas.ActivationCount > 0) { activated = true; break; }
        }
        Assert.True(activated, "the armed system must still fire on the hands-off plunge");
    }

    [Fact]
    public void ClimbingAboveTheGateReArmsPromptly() {
        var session = Start(Entry(250.0, 200.0, 0.0));
        session.FeedKey(GKey.PushDown, true);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) session.StepFixed();
        session.FeedKey(GKey.PushDown, false);
        Assert.True(session.AutoGcasLowLevelStandby);

        // Climb out. As soon as clearance passes the 1100 ft re-arm gate the failsafe is
        // armed again — no long dwell for a ridge to exploit, no dwell for the pilot either:
        // above the gate is simply armed country.
        session.FeedKey(GKey.PullUp, true);
        bool rearmed = false;
        for (int tick = 0; tick < 40 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (session.Player.State.Position.Y > 400.0
                && !session.AutoGcasLowLevelStandby) { rearmed = true; break; }
        }
        _output.WriteLine($"rearmed={rearmed} y={session.Player.State.Position.Y:F0} m");
        Assert.True(rearmed, "climbing above the re-arm gate must re-arm the failsafe");
    }

    [Fact]
    public void LongHandsOffBelowGateEventuallyReArms() {
        // The pilot flies low hands-on, then releases everything. Brief neutral stretches
        // stay theirs (telemetry showed deliberate valley runs on a literally neutral stick),
        // but a long fully-idle stretch lets the machine quietly take the watch back —
        // indistinguishable from a pilot who faded out, which is the point. G-LOC hands it
        // back immediately through the authority gate regardless of this window.
        // Terrain sits 300 m below the jet: clearance stays under the 1000 ft gate while the
        // untrimmed 1 G drift of a 25-second fully-idle stretch has room to wander without
        // going terminal (a 1 G stick holds load, not altitude).
        var session = new SimulationSession();
        session.StartBeat(() => Beat(Entry(0.0, 220.0, 0.0)));
        session.SetTerrainSurface(new BilinearHeightGrid(-60_000.0, -60_000.0,
            120_000.0, 120_000.0, new double[,] { { -300.0, -300.0 }, { -300.0, -300.0 } }));
        session.Begin();
        session.FeedKey(GKey.PushDown, true);
        for (int tick = 0; tick < AircraftSim.TickHz / 2; tick++) session.StepFixed();
        session.FeedKey(GKey.PushDown, false);
        Assert.True(session.AutoGcasLowLevelStandby);
        for (int tick = 0; tick < 10 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++)
            session.StepFixed();
        Assert.True(session.AutoGcasLowLevelStandby,
            "brief quiet stretches must NOT re-arm — the pilot still owns the low block");
        // The push left a residual sink the idle 1 G stick never arrests. Past the 20 s
        // input memory the watch returns — and the returned watch must then SAVE the
        // sinking jet before the deck: that save is the whole point of the re-arm.
        bool rearmed = false;
        for (int tick = 0; tick < 40 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (!rearmed && !session.AutoGcasLowLevelStandby) rearmed = true;
        }
        _output.WriteLine($"rearmed={rearmed} terminal={session.PlayerTerminalState} " +
            $"activations={session.AutoGcas.ActivationCount}");
        Assert.True(rearmed,
            "a long fully-idle stretch below the gate must restore protection");
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }

    [Fact]
    public void AssistedFlightNeverStandsDown() {
        // Rung-1 assisted flight keeps full protection: the portrait autopilot has no
        // terrain logic, so the failsafe must not stand down under it — hands-on or not.
        var session = Start(Entry(450.0, 200.0, -8.0), assisted: true);
        session.FeedKey(GKey.PushDown, true);
        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying
            && session.Player.State.Position.Y > 120.0; tick++) {
            session.StepFixed();
            Assert.False(session.AutoGcasLowLevelStandby,
                "assisted flight must never stand the failsafe down");
        }
    }
}
