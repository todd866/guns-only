using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Web;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class MeshNavSnapshotTests {
    [Fact]
    public void ColdSnapshotIncludesMeshActiveDestAfterSelect() {
        var session = new SimulationSession(12, Carrier.DeckConfiguration.Angled);
        Assert.True(session.TrySelectMeshPlace("place.ukraine.crimea-coast-survey.v1"));

        string json = SnapshotProjection.BuildState(
            session,
            Carrier.DeckConfiguration.Angled,
            worldOriginEastM: 0.0,
            worldOriginNorthM: 0.0,
            worldOriginConfigured: false,
            terrain: null);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.Equal("open_segment", root.GetProperty("mesh_transit_mode").GetString());
        Assert.Equal(
            "place.ukraine.crimea-coast-survey.v1",
            root.GetProperty("mesh_active_place_id").GetString());
        Assert.Equal(
            "Crimea coast survey",
            root.GetProperty("mesh_active_display_name").GetString());
        Assert.True(root.GetProperty("mesh_active_known").GetBoolean());
        Assert.True(root.TryGetProperty("mesh_place_catalog_json", out JsonElement catalog));
        Assert.False(string.IsNullOrWhiteSpace(catalog.GetString()));
    }

    [Fact]
    public void HotFrameLayoutIncludesMeshSlotsAtVersion19() {
        string layoutJson = SnapshotHotFrame.LayoutJson();
        using JsonDocument document = JsonDocument.Parse(layoutJson);
        Assert.Equal(19, document.RootElement.GetProperty("layout_version").GetInt32());
        Assert.Contains(
            "mesh_fuel_to_dest_lb",
            layoutJson,
            StringComparison.Ordinal);
        Assert.Contains("recovery_procedure_kind", layoutJson, StringComparison.Ordinal);
    }
}
