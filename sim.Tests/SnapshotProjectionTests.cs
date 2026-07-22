using System.Text.Json;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Execution coverage for the flat browser state projection. SnapshotProjection is linked out of the
/// browser-only WebBridge so the ~1100-line snapshot boundary can be driven as ordinary .NET: a real
/// session is stepped a handful of ticks and its projection is parsed and structurally checked. This
/// guards the whole hand-built JSON contract against a stray NaN/Infinity token or a malformed field.
/// </summary>
public class SnapshotProjectionTests {
    sealed class FlatTerrain : ITerrainSurface {
        readonly double _heightM;

        public FlatTerrain(double heightM) => _heightM = heightM;

        public TerrainBounds Bounds =>
            new(-1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            sample = new TerrainSample(_heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static string ProjectAfterSteps(int beatIndex, int ticks, ITerrainSurface? terrain) {
        var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(beatIndex));
        session.Begin();
        for (int tick = 0; tick < ticks; tick++)
            session.StepFixed();
        // Terrain reaches the projection through the session (Session.Terrain), not the dead BuildState
        // terrain parameter, so drive it here to exercise the terrain_present / sea-level paths.
        if (terrain is not null) session.SetTerrainSurface(terrain);
        return SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            0.0, 0.0, false, terrain);
    }

    [Theory]
    [InlineData(7, 12)]   // F-22 modern visual-merge beat
    [InlineData(5, 30)]   // carrier recovery beat
    [InlineData(1, 8)]    // grammar/physics slice beat
    public void BuildStateEmitsParseableFiniteJson(int beatIndex, int ticks) {
        string json = ProjectAfterSteps(beatIndex, ticks, null);

        // (a) the hand-built blob is valid JSON.
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        // (b) no invalid numeric token slipped through a finite guard.
        Assert.DoesNotContain("NaN", json);
        Assert.DoesNotContain("Infinity", json);

        // (c) terrain-frame fields the multiplayer substrate depends on are present.
        Assert.True(root.TryGetProperty("terrain_placement_east_m", out _));
        Assert.True(root.TryGetProperty("terrain_placement_north_m", out _));
        Assert.True(root.TryGetProperty("world_frame_id", out JsonElement worldFrameId));
        Assert.False(string.IsNullOrEmpty(worldFrameId.GetString()));

        // (e) the F-22 arcade opener flies over sea level: no terrain surface, so the browser can
        // skip the multi-megabyte visual-terrain fetch.
        Assert.False(root.GetProperty("terrain_present").GetBoolean());

        // (d) spot-check stable contract fields.
        Assert.Equal("1.5.0",
            root.GetProperty("snapshot_schema_version").GetString());
        Assert.False(string.IsNullOrEmpty(root.GetProperty("beat").GetString()));

        // (f) the ballistic gun trajectory the HUD funnel projects: nine finite samples whose
        // range from the shooter increases monotonically away from the muzzle station.
        JsonElement trajectory = root.GetProperty("gun_trajectory");
        Assert.Equal(JsonValueKind.Array, trajectory.ValueKind);
        Assert.Equal(9, trajectory.GetArrayLength());
        double previousRange = double.NegativeInfinity;
        foreach (JsonElement sample in trajectory.EnumerateArray()) {
            Assert.True(double.IsFinite(sample.GetProperty("x").GetDouble()));
            Assert.True(double.IsFinite(sample.GetProperty("y").GetDouble()));
            Assert.True(double.IsFinite(sample.GetProperty("z").GetDouble()));
            double range = sample.GetProperty("r").GetDouble();
            Assert.True(double.IsFinite(range) && range > previousRange);
            previousRange = range;
        }
        // The far sample must reach the effective ranging envelope while staying inside the
        // physical maximum: muzzle velocity times the 0.9 s effective flight time, give or take
        // the shooter's own motion.
        Assert.InRange(previousRange, 300.0, 1400.0);

        // (g) world ground velocity is emitted for the projected flight-path marker.
        Assert.True(double.IsFinite(root.GetProperty("vx").GetDouble()));
        Assert.True(double.IsFinite(root.GetProperty("vy").GetDouble()));
        Assert.True(double.IsFinite(root.GetProperty("vz").GetDouble()));
    }

    [Fact]
    public void BuildStateReportsTerrainPresentWhenTheSessionHasATerrainSurface() {
        string json = ProjectAfterSteps(7, 12, new FlatTerrain(0.0));

        using JsonDocument document = JsonDocument.Parse(json);
        Assert.DoesNotContain("NaN", json);
        Assert.DoesNotContain("Infinity", json);
        Assert.True(document.RootElement.GetProperty("terrain_present").GetBoolean());
    }
}
