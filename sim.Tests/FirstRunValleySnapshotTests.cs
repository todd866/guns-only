using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public sealed class FirstRunValleySnapshotTests {
    static ITerrainSurface FlatTerrain() => new BilinearHeightGrid(
        -20_000.0, -20_000.0, 40_000.0, 40_000.0,
        new[,] { { 100.0, 100.0 }, { 100.0, 100.0 } });

    static JsonElement Project(SimulationSession session) {
        session.Begin();
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        return document.RootElement.Clone();
    }

    [Fact]
    public void FirstRunValleyPublishesTwoHeaters() {
        var session = new SimulationSession();
        session.StartBeatWithEnvironment(Beats.ModernVisualMergeFirstRun, null, FlatTerrain());
        JsonElement root = Project(session);
        Assert.Equal(FirstRunValleyRuntime.MissionId,
            root.GetProperty("mission_definition_id").GetString());
        Assert.Equal(2, root.GetProperty("aim9_remaining").GetInt32());
        Assert.True(root.GetProperty("first_run_weapons_cold").GetBoolean());
        Assert.True(root.GetProperty("first_run_valley_available").GetBoolean());
        Assert.Equal(FirstRunValleyTerrainSurface.GeometryVersion,
            root.GetProperty("first_run_valley_geometry_version").GetInt32());
        Assert.Equal(FirstRunValleyRuntime.ValleyEastM,
            root.GetProperty("first_run_valley_center_east_m").GetDouble(), 1);
        Assert.Equal(FirstRunValleyRuntime.PopOutNorthM,
            root.GetProperty("first_run_valley_popout_north_m").GetDouble(), 1);
        Assert.Equal(FirstRunValleyTerrainSurface.WestRidgeRiseM,
            root.GetProperty("first_run_valley_west_ridge_rise_m").GetDouble(), 1);
        Assert.Equal(FirstRunValleyTerrainSurface.EastRidgeRiseM,
            root.GetProperty("first_run_valley_east_ridge_rise_m").GetDouble(), 1);
        Assert.Equal(FirstRunValleyTerrainSurface.CentrelineComponentCount,
            root.GetProperty("first_run_valley_centerline_component_count").GetInt32());
        Assert.Equal(FirstRunValleyTerrainSurface.SideCutCount,
            root.GetProperty("first_run_valley_side_cut_count").GetInt32());
        Assert.Equal(FirstRunValleyTerrainSurface.ButteCount,
            root.GetProperty("first_run_valley_butte_count").GetInt32());
        Assert.Equal(FirstRunValleyTerrainSurface.StrataStepHeightM,
            root.GetProperty("first_run_valley_strata_step_height_m").GetDouble(), 1);
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
        Assert.Equal("SAFE", root.GetProperty("aim9_seeker_state").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("top_gun_seat").ValueKind);
    }

    [Fact]
    public void FirstRunValleyPublishesTheDurablePopOutInterlock() {
        BeatSetup armed = Beats.ModernVisualMergeFirstRun();
        armed = armed with {
            Player = armed.Player with {
                Position = armed.Player.Position with {
                    Z = FirstRunValleyRuntime.PopOutNorthM + 10.0
                }
            }
        };
        var session = new SimulationSession();
        session.StartBeatWithEnvironment(() => armed, null, FlatTerrain());
        session.Begin();
        session.StepFixed();

        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        JsonElement root = document.RootElement;
        Assert.False(root.GetProperty("first_run_weapons_cold").GetBoolean());
        Assert.True(root.GetProperty("first_run_valley_available").GetBoolean());
        Assert.Equal(2, root.GetProperty("aim9_remaining").GetInt32());
    }

    [Fact]
    public void FirstRunValleyFailsVisualGeometryQuietWhenTerrainAuthorityIsUnavailable() {
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMergeFirstRun);
        JsonElement root = Project(session);
        Assert.True(root.GetProperty("first_run_weapons_cold").GetBoolean());
        Assert.False(root.GetProperty("first_run_valley_available").GetBoolean());
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("first_run_valley_geometry_version").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("first_run_valley_center_east_m").ValueKind);
    }

    [Fact]
    public void BuiltInFirstMergeStillOmitsHeaters() {
        var session = new SimulationSession();
        session.StartBeat(7);
        JsonElement root = Project(session);
        Assert.False(root.GetProperty("first_run_weapons_cold").GetBoolean());
        Assert.False(root.GetProperty("first_run_valley_available").GetBoolean());
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("first_run_valley_popout_north_m").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("aim9_remaining").ValueKind);
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
    }
}
