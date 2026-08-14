using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;
using Xunit;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public sealed class MeshNavSnapshotTests {
    [Fact]
    public void ColdSnapshotIncludesMeshActiveDestAfterSelect() {
        // Card 11 is an unopposed open-segment laboratory. Projection must not manufacture a
        // hidden actor merely to keep the legacy flat snapshot shape alive.
        BeatSetup circuits = Beats.RapierCircuits(
            Carrier.DeckConfiguration.Angled) with {
            OpponentPresence = OpponentPresence.None
        };
        var session = new SimulationSession();
        session.StartBeat(() => circuits);
        session.Begin();
        Assert.False(session.OpponentPresent);
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
        Assert.False(root.GetProperty("opponent_present").GetBoolean());
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("bandit_entity_id").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("bandit_aircraft_id").ValueKind);
        Assert.Equal(0.0, root.GetProperty("bx").GetDouble());
        Assert.Equal(0.0, root.GetProperty("by").GetDouble());
        Assert.Equal(0.0, root.GetProperty("bz").GetDouble());
        Assert.Equal(0.0, root.GetProperty("range_m").GetDouble());
        Assert.False(root.GetProperty("gun_solution").GetBoolean());
        Assert.False(root.GetProperty("opponent_gun_firing").GetBoolean());
    }

    [Fact]
    public void HotFrameLayoutIncludesMeshCarrierApproachAndAim9SlotsAtVersion25() {
        string layoutJson = SnapshotHotFrame.LayoutJson();
        using JsonDocument document = JsonDocument.Parse(layoutJson);
        JsonElement root = document.RootElement;
        Assert.Equal(25, root.GetProperty("layout_version").GetInt32());
        Assert.Contains(
            "mesh_fuel_to_dest_lb",
            layoutJson,
            StringComparison.Ordinal);
        Assert.Contains("recovery_procedure_kind", layoutJson, StringComparison.Ordinal);
        Assert.Contains("carrier_sortie_route_active", layoutJson,
            StringComparison.Ordinal);
        Assert.Contains("approach_guidance_active", layoutJson, StringComparison.Ordinal);
        Assert.Contains("opponent_present", layoutJson, StringComparison.Ordinal);

        JsonElement core = root.GetProperty("blocks")
            .EnumerateArray()
            .Single(block => block.GetProperty("name").GetString() == "core");
        JsonElement[] aim9Slots = core.GetProperty("slots")
            .EnumerateArray()
            .Where(slot => slot.GetProperty("name").GetString()!
                .StartsWith("aim9_", StringComparison.Ordinal))
            .ToArray();
        Assert.Equal(new[] {
            "aim9_remaining",
            "aim9_in_flight",
            "aim9_pose_valid",
            "aim9_state_code",
            "aim9_x",
            "aim9_y",
            "aim9_z",
            "aim9_vx",
            "aim9_vy",
            "aim9_vz"
        }, aim9Slots.Select(slot =>
            slot.GetProperty("name").GetString()).ToArray());
        Assert.Equal(new[] {
            "nullable", "boolean", "boolean", "number", "nullable",
            "nullable", "nullable", "nullable", "nullable", "nullable"
        }, aim9Slots.Select(slot =>
            slot.GetProperty("kind").GetString()).ToArray());
        int firstAim9Index = aim9Slots[0].GetProperty("index").GetInt32();
        Assert.Equal(
            Enumerable.Range(firstAim9Index, aim9Slots.Length),
            aim9Slots.Select(slot => slot.GetProperty("index").GetInt32()));
    }
}
