using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Reproduces the pilot-reported false fly-up from the 2026-07-24 screen recordings: a supersonic
/// diving BFM merge at ~14,600 ft MSL over ~1,500 ft terrain (≈4,000 m AGL) draws AUTO GCAS · FLYUP
/// while the aircraft has miles of air beneath it. HUD read at the trigger frame: ALT 14,599 ft,
/// V/S −68.8K FPM, 629 KCAS / M1.20.
///
/// The existing AutoGcasHighAltitudeTests cover FL270 over FLAT terrain and pass. This pins the
/// lower, terrain-proximate diving-fight regime the player actually flies.
/// </summary>
public class AutoGcasDivingFightReproTests {
    readonly ITestOutputHelper _output;
    public AutoGcasDivingFightReproTests(ITestOutputHelper output) => _output = output;

    // Flat terrain at 460 m (~1,500 ft), the valley-floor height under the recorded fight.
    static ITerrainSurface Terrain(double heightM) =>
        new BilinearHeightGrid(-200_000.0, -200_000.0, 400_000.0, 400_000.0,
            new double[,] { { heightM, heightM }, { heightM, heightM } });

    [Fact]
    public void SupersonicDiveWithFourKilometresOfAirDrawsNoFlyUp() {
        const double terrainM = 460.0;
        const double altitudeM = 4_450.0;          // 14,600 ft MSL
        const double aglM = altitudeM - terrainM;  // ≈ 3,990 m of air below
        const double speedMps = 380.0;             // ≈ M1.20 TAS at this altitude
        const double gammaDeg = -65.0;             // steep nose-low, matching V/S −68.8K FPM

        double gamma = gammaDeg * System.Math.PI / 180.0;
        var aircraft = new AircraftState(
            new Vec3D(0.0, altitudeM, 0.0), speedMps,
            gamma, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var input = new AutoGcasInput(
            Aircraft: aircraft,
            AircraftParameters: FlightModel.F22APublicDataSurrogate,
            EffectivePilotCommand: new PilotCommand(1.0, 0.0, 0.85, 0.0),
            Terrain: Terrain(terrainM),
            IndicatedAirspeedMps: 323.0,            // ≈ 629 KCAS
            PilotActivelyFlying: true);

        AutoGcasStepResult result = AutoGcasController.Step(1.0 / 120.0,
            AutoGcasState.Initial(true), input,
            AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
        AutoGcasPrediction p = result.State.Prediction;

        _output.WriteLine($"AGL={aglM:F0} m  phase={result.State.Phase}  " +
            $"tAvail={p.TimeAvailableToAvoidGroundImpactSeconds:F2} s  " +
            $"immRecoveryMin={p.ImmediateRecoveryMinimumClearanceM:F0} m  " +
            $"pilotMin={p.PilotMinimumClearanceM:F0} m");

        Assert.True(p.Valid);
        // The pilot's actual question: "if I pull 12 G now, how close to the ground do I get?"
        // The answer here is thousands of feet of margin, not an emergency.
        Assert.True(p.ImmediateRecoveryMinimumClearanceM > 1_000.0,
            $"a 12 G pull from {aglM:F0} m AGL must clear by far more than 1 km " +
            $"(predictor says {p.ImmediateRecoveryMinimumClearanceM:F0} m)");
        Assert.NotEqual(AutoGcasPhase.FlyUp, result.State.Phase);
    }
}
