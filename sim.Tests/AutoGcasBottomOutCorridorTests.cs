using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The pilot-stated acceptance corridor for Auto-GCAS timing: "if it triggers and I'm not
/// bottoming out at ~200 ft RADALT then it triggered too soon." A fly-up that bottoms far above
/// the terrain buffer means the trigger fired earlier than the airframe needed; below the buffer
/// means it fired too late. The corridor measures the REAL 6DOF recovery, so the fast-time
/// predictor is calibrated against physical truth rather than its own assumptions.
/// </summary>
public class AutoGcasBottomOutCorridorTests {
    readonly ITestOutputHelper _output;
    public AutoGcasBottomOutCorridorTests(ITestOutputHelper output) => _output = output;

    static ITerrainSurface FlatTerrain() =>
        new BilinearHeightGrid(-60_000.0, -60_000.0, 120_000.0, 120_000.0,
            new double[,] { { 0.0, 0.0 }, { 0.0, 0.0 } });

    static AircraftState Diving(double altitudeM, double speedMps, double gammaDegrees,
        double bankDegrees = 0.0) => new(
        new Vec3D(0.0, altitudeM, 0.0), speedMps,
        gammaDegrees * System.Math.PI / 180.0, 0.0,
        bankDegrees * System.Math.PI / 180.0,
        FlightModel.F22APublicDataSurrogate.MassKg);

    static BeatSetup Beat(AircraftState player) => new(
        "Auto-GCAS bottom-out corridor",
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

    // Attentive/assisted combat flight (the deferred boundary). Bottom-out band: above the
    // 13.7 m terrain buffer, below ~90 m (~300 ft) — centred on the pilot's 200 ft spec.
    // Final semantics (pilot spec, 2026-07-23): a 100 ft MSD floor while maneuvering (20 ft on
    // stable paths), with the fly-up bottoming within ~250 ft of margin above that floor in hard
    // dives. Floors and ceilings below encode exactly that.
    [Theory]
    [InlineData(250.0, -20.0, 0.0, 120.0)]
    [InlineData(300.0, -35.0, 0.0, 120.0)]
    [InlineData(220.0, -45.0, 0.0, 120.0)]
    // Banked entry pays the roll-to-upright phase before the pull; the ceiling allows for it.
    [InlineData(260.0, -25.0, 60.0, 155.0)]
    public void AttentiveFlyUpBottomsNearTwoHundredFeet(double speedMps, double gammaDeg,
        double bankDeg, double maxBottomM) {
        var session = new SimulationSession();
        session.StartBeat(() => Beat(Diving(3000.0, speedMps, gammaDeg, bankDeg)));
        session.SetTerrainSurface(FlatTerrain());
        session.SetAssistedFlight(true);
        session.Begin();
        // A neutral assisted pilot never reaches the ground: the about-right auto-pull flattens
        // the dive on its own (the corridor's first run proved it). The hazard is the pilot
        // HOLDING the push bias into terrain — commanded descent, attentive by definition.
        session.FeedKey(GKey.PushDown, true);

        double minimumAgl = double.PositiveInfinity;
        bool activated = false;
        for (int tick = 0; tick < 40 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (session.AutoGcas.ActivationCount > 0) activated = true;
            if (activated)
                minimumAgl = System.Math.Min(minimumAgl, session.Player.State.Position.Y);
            if (activated && session.Player.State.VelocityVector().Y > 5.0
                && session.Player.State.Position.Y > minimumAgl + 150.0) break;
        }

        _output.WriteLine($"v={speedMps} gamma={gammaDeg}: activated={activated} " +
            $"bottom={minimumAgl:F0} m AGL ({minimumAgl * 3.28084:F0} ft)");
        Assert.True(activated, "the descent must eventually trigger the fly-up");
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.True(minimumAgl >= 30.0,
            $"fly-up violated the 100 ft maneuvering MSD floor: {minimumAgl:F1} m");
        Assert.True(minimumAgl <= maxBottomM,
            $"fly-up bottomed at {minimumAgl:F0} m ({minimumAgl * 3.28084:F0} ft) — " +
            "triggered too soon for an attentive combat pilot (spec: ~200 ft)");
    }
}
