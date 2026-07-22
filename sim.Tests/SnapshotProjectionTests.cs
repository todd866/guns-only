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

        // (d) spot-check stable contract fields.
        Assert.Equal("1.4.0",
            root.GetProperty("snapshot_schema_version").GetString());
        Assert.False(string.IsNullOrEmpty(root.GetProperty("beat").GetString()));
    }

    [Fact]
    public void BuildStateWithFlatTerrainStaysParseableAndFinite() {
        string json = ProjectAfterSteps(7, 12, new FlatTerrain(0.0));

        using JsonDocument document = JsonDocument.Parse(json);
        Assert.DoesNotContain("NaN", json);
        Assert.DoesNotContain("Infinity", json);
        Assert.True(document.RootElement.TryGetProperty("world_frame_id", out _));
    }
}
