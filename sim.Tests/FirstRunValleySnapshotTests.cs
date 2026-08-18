using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public sealed class FirstRunValleySnapshotTests {
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
        session.StartBeat(Beats.ModernVisualMergeFirstRun);
        JsonElement root = Project(session);
        Assert.Equal(FirstRunValleyRuntime.MissionId,
            root.GetProperty("mission_definition_id").GetString());
        Assert.Equal(2, root.GetProperty("aim9_remaining").GetInt32());
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
        Assert.Equal("SAFE", root.GetProperty("aim9_seeker_state").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("top_gun_seat").ValueKind);
    }

    [Fact]
    public void BuiltInFirstMergeStillOmitsHeaters() {
        var session = new SimulationSession();
        session.StartBeat(7);
        JsonElement root = Project(session);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("aim9_remaining").ValueKind);
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
    }
}
