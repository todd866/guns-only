using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Production Build-87 telemetry (web-1784791710853): twelve fly-ups from FL290 down through
/// FL180 during supersonic diving fight manoeuvres, every one with time-available exactly 0 and
/// the immediate-recovery minimum clearance pinned at exactly the 30.48 m buffer — the
/// "recovery never established" clamp. Root cause: the modeled recovery had no climb-capture
/// phase, so over the 20 s completion horizon the predicted jet pulled a full loop and was
/// descending again at the window end. These tests pin the predictor's honesty at altitude:
/// a steep dive with miles of air below it is NOT a zero-time-available emergency.
/// </summary>
public class AutoGcasHighAltitudeTests {
    readonly ITestOutputHelper _output;
    public AutoGcasHighAltitudeTests(ITestOutputHelper output) => _output = output;

    static ITerrainSurface FlatTerrain() =>
        new BilinearHeightGrid(-200_000.0, -200_000.0, 400_000.0, 400_000.0,
            new double[,] { { 0.0, 0.0 }, { 0.0, 0.0 } });

    [Fact]
    public void SteepSupersonicDiveAtFl270KeepsHonestTimeAvailable() {
        // FL270-class entry matching the production trace: ~8,300 m over flat terrain,
        // 360 m/s, 70 degrees nose-low. A 12 G recovery needs roughly 1.5-2 km of the
        // 8 km available; time-available must reflect that margin, not clamp to zero.
        var aircraft = new AircraftState(
            new Vec3D(0.0, 8_300.0, 0.0), 360.0,
            -70.0 * System.Math.PI / 180.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var input = new AutoGcasInput(
            Aircraft: aircraft,
            AircraftParameters: FlightModel.F22APublicDataSurrogate,
            EffectivePilotCommand: new PilotCommand(1.0, 0.0, 0.8, 0.0),
            Terrain: FlatTerrain(),
            IndicatedAirspeedMps: 250.0,
            PilotActivelyFlying: false);
        AutoGcasStepResult result = AutoGcasController.Step(1.0 / 120.0,
            AutoGcasState.Initial(true), input,
            AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);

        AutoGcasPrediction prediction = result.State.Prediction;
        _output.WriteLine($"phase={result.State.Phase} tavail=" +
            $"{prediction.TimeAvailableToAvoidGroundImpactSeconds:F2} recoveryMin=" +
            $"{prediction.ImmediateRecoveryMinimumClearanceM:F0} m");
        Assert.True(prediction.Valid);
        Assert.True(prediction.TimeAvailableToAvoidGroundImpactSeconds > 3.0,
            "a steep dive with 8 km of air below it must not read as a " +
            $"zero-time emergency (got {prediction.TimeAvailableToAvoidGroundImpactSeconds:F2} s)");
        Assert.NotEqual(AutoGcasPhase.FlyUp, result.State.Phase);
    }

    [Fact]
    public void HighAltitudeDivingFightDrawsNoFlyUp() {
        // Session-level: hands-off steep dive from FL270 (the conservative boundary, the
        // worst case). The system must hold its fire with tens of thousands of feet of air
        // underneath — the production failure fired within one prediction tick up there.
        var session = new SimulationSession();
        session.StartBeat(() => new BeatSetup(
            "High-altitude dive honesty",
            Player: new AircraftState(new Vec3D(0.0, 8_300.0, 0.0), 360.0,
                -70.0 * System.Math.PI / 180.0, 0.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit: new AircraftState(new Vec3D(20_000.0, 3_000.0, 20_000.0),
                220.0, 0.0, System.Math.PI, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) },
            PlayerParams: FlightModel.F22APublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference));
        session.SetTerrainSurface(FlatTerrain());
        session.Begin();

        for (int tick = 0; tick < 10 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying
            && session.Player.State.Position.Y > 3_000.0; tick++) {
            session.StepFixed();
            Assert.True(session.AutoGcas.ActivationCount == 0,
                "no fly-up may fire in a dive with more than 3,000 m of clearance " +
                $"(fired at {session.Player.State.Position.Y:F0} m)");
        }
    }
}
