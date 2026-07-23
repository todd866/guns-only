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

    // Attentive/assisted combat flight (the deferred boundary). Pilot spec sharpened
    // 2026-07-23: "if autogcas goes off and I don't bottom out at 100 ft MSD on a 12 G pull
    // then that was too early." Bottom-out band: above the 30 m (100 ft) maneuvering MSD
    // floor, below ~215 ft — the fly-up is a genuine last-instance 12 G save, not an early
    // bounce. Tuned via ControlResponseDelaySeconds 0.06 + ResponseAuthorityMargin 0.90
    // (the predictor credits the recovery it actually delivers); measured bottoms 124-188 ft.
    [Theory]
    [InlineData(250.0, -20.0, 0.0, 65.0)]
    [InlineData(300.0, -35.0, 0.0, 65.0)]
    [InlineData(220.0, -45.0, 0.0, 65.0)]
    // Banked entry pays the roll-to-upright phase before the pull; measured 38 m — the
    // ceiling still allows the roll phase headroom.
    [InlineData(260.0, -25.0, 60.0, 75.0)]
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
            if (!activated && session.AutoGcas.ActivationCount > 0) {
                activated = true;
                // Release the commanded dive at activation: under the sustained-input paddle
                // rule, input held longer than 0.2 s through a fly-up cancels it — a pilot who
                // keeps pushing past the fly-up is choosing the ground, which is a different
                // (and legal) story than the one this corridor measures.
                session.FeedKey(GKey.PushDown, false);
            }
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
