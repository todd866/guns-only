using System.Text.Json;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Golden agreement between the per-frame hot buffer and the authoritative JSON snapshot. The hot
/// path intentionally duplicates BuildState's derivation prologue, and these tests are the drift
/// guard: for real sessions across beats (including the carrier block and live tracer rounds),
/// every layout slot must carry exactly the value the parsed JSON field carries — booleans as 1/0,
/// JSON null as NaN, conditional blocks matching key presence, tracer regions element-wise equal.
/// Runs in the same collection as SnapshotProjectionTests because both drive SnapshotProjection's
/// latched statics.
/// </summary>
[Collection("snapshot-projection-statics")]
public class SnapshotHotFrameTests {
    sealed class FlatTerrain : ITerrainSurface {
        public TerrainBounds Bounds =>
            new(-1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            sample = new TerrainSample(0.0, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static SimulationSession StartSession(int beatIndex, ITerrainSurface? terrain) {
        var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(beatIndex));
        session.Begin();
        if (terrain is not null) session.SetTerrainSurface(terrain);
        return session;
    }

    static (JsonElement Root, double[] Buffer, JsonDocument Document) Project(
        SimulationSession session) {
        string json = SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            0.0, 0.0, false, null);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        JsonDocument document = JsonDocument.Parse(json);
        return (document.RootElement, buffer, document);
    }

    static void AssertNumberEqual(string name, double expected, double actual) =>
        Assert.True(expected.Equals(actual),
            $"{name}: JSON {expected:R} != slot {actual:R}");

    static void AssertHotFrameMatchesJson(JsonElement root, double[] buffer) {
        using JsonDocument layoutDocument = JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        JsonElement layout = layoutDocument.RootElement;
        Assert.Equal(SnapshotHotFrame.SlotCount, layout.GetProperty("slot_count").GetInt32());

        foreach (JsonElement block in layout.GetProperty("blocks").EnumerateArray()) {
            int presenceIndex = block.GetProperty("presence_index").GetInt32();
            bool present = presenceIndex < 0 || buffer[presenceIndex] != 0.0;
            string blockName = block.GetProperty("name").GetString()!;

            foreach (JsonElement slot in block.GetProperty("slots").EnumerateArray()) {
                string name = slot.GetProperty("name").GetString()!;
                int index = slot.GetProperty("index").GetInt32();
                string kind = slot.GetProperty("kind").GetString()!;
                bool hasField = root.TryGetProperty(name, out JsonElement field);

                if (!present) {
                    Assert.False(hasField,
                        $"{blockName}.{name}: absent block but JSON key exists");
                    continue;
                }
                Assert.True(hasField, $"{blockName}.{name}: JSON key missing");

                switch (kind) {
                    case "boolean":
                        Assert.True(buffer[index] is 0.0 or 1.0,
                            $"{name}: boolean slot holds {buffer[index]}");
                        Assert.Equal(field.GetBoolean(), buffer[index] != 0.0);
                        break;
                    case "nullable":
                        if (field.ValueKind == JsonValueKind.Null)
                            Assert.True(double.IsNaN(buffer[index]),
                                $"{name}: JSON null but slot holds {buffer[index]}");
                        else
                            AssertNumberEqual(name, field.GetDouble(), buffer[index]);
                        break;
                    default:
                        AssertNumberEqual(name, field.GetDouble(), buffer[index]);
                        break;
                }
            }
        }

        foreach (JsonElement tracer in layout.GetProperty("tracers").EnumerateArray()) {
            string fieldName = tracer.GetProperty("field").GetString()!;
            int countIndex = tracer.GetProperty("count_index").GetInt32();
            int start = tracer.GetProperty("start").GetInt32();
            JsonElement rounds = root.GetProperty(fieldName);
            int count = (int)buffer[countIndex];
            Assert.Equal(rounds.GetArrayLength(), count);
            for (int r = 0; r < count; r++) {
                JsonElement round = rounds[r];
                Assert.Equal(6, round.GetArrayLength());
                for (int c = 0; c < 6; c++)
                    Assert.Equal(round[c].GetDouble(), buffer[start + r * 6 + c]);
            }
        }

        foreach (JsonElement sampleArray in layout.GetProperty("sample_arrays").EnumerateArray()) {
            string fieldName = sampleArray.GetProperty("field").GetString()!;
            int start = sampleArray.GetProperty("start").GetInt32();
            string[] keys = sampleArray.GetProperty("keys").EnumerateArray()
                .Select(k => k.GetString()!).ToArray();
            JsonElement samples = root.GetProperty(fieldName);
            Assert.Equal(sampleArray.GetProperty("samples").GetInt32(),
                samples.GetArrayLength());
            for (int i = 0; i < samples.GetArrayLength(); i++)
                for (int k = 0; k < keys.Length; k++)
                    AssertNumberEqual($"{fieldName}[{i}].{keys[k]}",
                        samples[i].GetProperty(keys[k]).GetDouble(),
                        buffer[start + i * keys.Length + k]);
        }
    }

    [Theory]
    [InlineData(7, false)]  // F-22 modern visual-merge beat: merge block present, no carrier
    [InlineData(5, false)]  // carrier recovery beat: full carrier block
    [InlineData(1, false)]  // grammar/physics slice beat
    [InlineData(4, false)]  // balloon-glider prototype: no engine, alternate pack identity
    [InlineData(6, false)]  // emergency-gear maintenance beat: maintenance block present
    [InlineData(8, false)]  // drone-raid defense: drone_detail block present
    [InlineData(9, false)]  // modern ace duel capstone
    [InlineData(7, true)]   // terrain surface drives radar_alt/below_ground paths
    public void HotFrameAgreesWithJsonAcrossBeatsAndSteps(int beatIndex, bool withTerrain) {
        SimulationSession session = StartSession(beatIndex,
            withTerrain ? new FlatTerrain() : null);
        foreach (int steps in new[] { 1, 7, 30, 120, 600 }) {
            for (int tick = 0; tick < steps; tick++) session.StepFixed();
            var (root, buffer, document) = Project(session);
            using (document) AssertHotFrameMatchesJson(root, buffer);
        }
    }

    [Fact]
    public void HotFrameAgreesWithJsonWhileFiring() {
        // Beat 1 has no visual-merge interlock, so a held trigger puts rounds in the air at once
        // and the tracer regions get live (non-empty) golden coverage.
        SimulationSession session = StartSession(1, null);
        session.FeedKey(GKey.Trigger, true);
        bool sawRoundsInFlight = false;
        for (int burst = 0; burst < 40; burst++) {
            for (int tick = 0; tick < 30; tick++) session.StepFixed();
            sawRoundsInFlight |= session.PlayerGun.RoundsInFlight.Count > 0
                || session.OpponentGun.RoundsInFlight.Count > 0;
            var (root, buffer, document) = Project(session);
            using (document) AssertHotFrameMatchesJson(root, buffer);
            if (sawRoundsInFlight && burst > 2) break;
        }
        Assert.True(sawRoundsInFlight, "no rounds in flight during 10 s of held trigger");
    }

    // Build 64 reconciliation: the HUD projects the FPV from vx/vy/vz and the gunsight funnel
    // from gun_trajectory every frame, so both must ride the hot buffer — a 250 ms-stale funnel
    // is a wrong gunsight. Pin them against the JSON while the jet is rolling and pulling, which
    // exercises BallisticFunnelPoint's own-ship rotation integral with non-trivial body rates.
    [Fact]
    public void FunnelTrajectoryAndGroundVelocityRideTheHotPathWhileManeuvering() {
        SimulationSession session = StartSession(7, null);
        session.FeedKey(GKey.RollLeft, true);
        session.FeedKey(GKey.PullUp, true);
        for (int burst = 0; burst < 6; burst++) {
            for (int tick = 0; tick < 45; tick++) session.StepFixed();
            var (root, buffer, document) = Project(session);
            using (document) {
                AssertHotFrameMatchesJson(root, buffer);

                using JsonDocument layoutDocument =
                    JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
                JsonElement layout = layoutDocument.RootElement;
                JsonElement trajectory = layout.GetProperty("sample_arrays")
                    .EnumerateArray()
                    .Single(t => t.GetProperty("field").GetString() == "gun_trajectory");
                int start = trajectory.GetProperty("start").GetInt32();
                Assert.Equal(9, trajectory.GetProperty("samples").GetInt32());

                JsonElement jsonTrajectory = root.GetProperty("gun_trajectory");
                Assert.Equal(9, jsonTrajectory.GetArrayLength());
                for (int i = 0; i < 9; i++) {
                    AssertNumberEqual($"gun_trajectory[{i}].x",
                        jsonTrajectory[i].GetProperty("x").GetDouble(), buffer[start + i * 4]);
                    AssertNumberEqual($"gun_trajectory[{i}].y",
                        jsonTrajectory[i].GetProperty("y").GetDouble(), buffer[start + i * 4 + 1]);
                    AssertNumberEqual($"gun_trajectory[{i}].z",
                        jsonTrajectory[i].GetProperty("z").GetDouble(), buffer[start + i * 4 + 2]);
                    AssertNumberEqual($"gun_trajectory[{i}].r",
                        jsonTrajectory[i].GetProperty("r").GetDouble(), buffer[start + i * 4 + 3]);
                }

                int SlotIndex(string name) => layout.GetProperty("blocks").EnumerateArray()
                    .SelectMany(b => b.GetProperty("slots").EnumerateArray())
                    .Single(slot => slot.GetProperty("name").GetString() == name)
                    .GetProperty("index").GetInt32();
                AssertNumberEqual("vx", root.GetProperty("vx").GetDouble(),
                    buffer[SlotIndex("vx")]);
                AssertNumberEqual("vy", root.GetProperty("vy").GetDouble(),
                    buffer[SlotIndex("vy")]);
                AssertNumberEqual("vz", root.GetProperty("vz").GetDouble(),
                    buffer[SlotIndex("vz")]);
            }
        }
    }

    [Fact]
    public void ColdVersionIsStableAcrossFillsAndBumpsOnLifecycleEdges() {
        SimulationSession session = StartSession(7, null);
        for (int tick = 0; tick < 30; tick++) session.StepFixed();
        var buffer = new double[SnapshotHotFrame.SlotCount];

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double afterFirst = buffer[SnapshotHotFrame.ColdVersionIndex];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.Equal(afterFirst, buffer[SnapshotHotFrame.ColdVersionIndex]);

        session.SetPaused(true);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double afterPause = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(afterPause > afterFirst, "pause edge did not bump cold_version");

        session.SetPaused(false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > afterPause,
            "unpause edge did not bump cold_version");

        SnapshotHotFrame.Fill(buffer, session, 100.0, 0.0, true);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > afterPause + 1,
            "world-origin change did not bump cold_version");
    }

    // The mode string and LSO advisory travel only in the cold JSON but are frame-cadence
    // presentation in carrier beats: an edge between two fallback polls must re-fetch the
    // JSON that same fill, not up to 250 ms later.
    [Fact]
    public void ColdVersionBumpsOnApproachModeEdgesInACarrierBeat() {
        SimulationSession session = StartSession(5, null);
        for (int tick = 0; tick < 30; tick++) session.StepFixed();
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double settled = buffer[SnapshotHotFrame.ColdVersionIndex];

        session.Controls.ApproachMode = !session.Controls.ApproachMode;
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > settled,
            "mode FREE<->APPROACH edge did not bump cold_version");

        session.Controls.ApproachMode = !session.Controls.ApproachMode;
        double toggledBack = buffer[SnapshotHotFrame.ColdVersionIndex];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > toggledBack,
            "mode APPROACH<->FREE exit edge did not bump cold_version");
    }
}
