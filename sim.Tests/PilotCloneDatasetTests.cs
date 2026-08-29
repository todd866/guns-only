using System.Globalization;
using System.Text;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// TURN RECORDED FLYING INTO TRAINING ROWS — THROUGH THE ONE FEATURE DEFINITION.
///
/// The features are computed by <see cref="HumanPilotFeatures"/>, the same code the flying clone
/// evaluates. Computing them here separately, or in the Python trainer, would let the clone learn
/// one function and fly another with nothing in the pipeline reporting it.
public class PilotCloneDatasetTests {
    const string FramesPath = "../../../../analysis/owner-pilot-frames.jsonl";
    const string RowsPath = "../../../../analysis/owner-pilot-rows.jsonl";
    readonly ITestOutputHelper _out;
    public PilotCloneDatasetTests(ITestOutputHelper o) { _out = o; }

    internal static CombatPolicyObservation ObservationFrom(JsonElement frame) {
        JsonElement player = frame.GetProperty("player");
        JsonElement bandit = frame.GetProperty("bandit");
        var ownPosition = new Vec3D(
            player.GetProperty("x").GetDouble(),
            player.GetProperty("y").GetDouble(),
            player.GetProperty("z").GetDouble());
        double speed = player.GetProperty("true_airspeed_kts").GetDouble() * 0.514444;
        double chi = player.GetProperty("heading_deg").GetDouble() * System.Math.PI / 180.0;
        double gamma = player.GetProperty("gamma_deg").GetDouble() * System.Math.PI / 180.0;
        double bank = player.GetProperty("bank_deg").GetDouble() * System.Math.PI / 180.0;
        var own = new AircraftState(ownPosition, speed, gamma, chi, bank, 27_700.0);

        JsonElement velocity = bandit.GetProperty("velocity_mps");
        double vx = velocity[0].GetDouble(), vy = velocity[1].GetDouble(), vz = velocity[2].GetDouble();
        double contactSpeed = System.Math.Sqrt(vx * vx + vy * vy + vz * vz);
        double contactChi = System.Math.Atan2(vx, vz);
        double contactGamma = contactSpeed > 1e-6
            ? System.Math.Asin(System.Math.Clamp(vy / contactSpeed, -1.0, 1.0)) : 0.0;
        var contact = new AircraftState(
            new Vec3D(bandit.GetProperty("x").GetDouble(),
                bandit.GetProperty("y").GetDouble(),
                bandit.GetProperty("z").GetDouble()),
            contactSpeed, contactGamma, contactChi, 0.0, 22_500.0);

        return CombatPolicyObservation.Capture(
            tick: 0, elapsedSeconds: frame.GetProperty("t").GetDouble(),
            ownship: own, contact: ActorObservation.Capture(contact, 0),
            ownshipAmmoRemaining: 400, weaponsAuthorized: true);
    }

    [Fact(Skip = "Tool. Un-skip to regenerate analysis/owner-pilot-rows.jsonl from "
        + "the frames. 2026-08-29: 93,016 rows, none skipped.")]
    public void ExportTrainingRows() {
        int rows = 0, skipped = 0;
        var text = new StringBuilder();
        foreach (string line in System.IO.File.ReadLines(FramesPath)) {
            if (string.IsNullOrWhiteSpace(line)) continue;
            using JsonDocument document = JsonDocument.Parse(line);
            JsonElement frame = document.RootElement;
            double[] features;
            try {
                features = HumanPilotFeatures.Extract(ObservationFrom(frame));
            } catch (System.Exception) {
                skipped++;
                continue;
            }
            JsonElement action = frame.GetProperty("action");
            text.Append("{\"sortie\":")
                .Append(JsonSerializer.Serialize(frame.GetProperty("sortie").GetString()))
                .Append(",\"v\":").Append(HumanPilotFeatures.Version)
                .Append(",\"x\":[");
            for (int i = 0; i < features.Length; i++) {
                if (i > 0) text.Append(',');
                text.Append(features[i].ToString("R", CultureInfo.InvariantCulture));
            }
            text.Append("],\"g\":")
                .Append(action.GetProperty("g_cmd").GetDouble().ToString("R", CultureInfo.InvariantCulture))
                .Append(",\"bank\":")
                .Append((action.GetProperty("bank_target_deg").GetDouble() * System.Math.PI / 180.0)
                    .ToString("R", CultureInfo.InvariantCulture))
                .Append(",\"throttle\":")
                .Append(action.GetProperty("throttle").GetDouble().ToString("R", CultureInfo.InvariantCulture))
                .Append(",\"firing\":")
                .Append(action.GetProperty("firing").GetBoolean() ? "true" : "false")
                .Append("}\n");
            rows++;
        }
        System.IO.File.WriteAllText(RowsPath, text.ToString());
        _out.WriteLine($"rows written  {rows}  (skipped {skipped})  -> {RowsPath}");
        Assert.True(rows > 1000, "the pilot dataset is too small to clone from");
    }
}
