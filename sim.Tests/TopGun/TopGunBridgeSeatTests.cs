using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.TopGun;

/// <summary>The player-facing Top Gun contract is Tomcat versus MiG-28 aggressors.</summary>
[Collection("snapshot-projection-statics")]
public sealed class TopGunBridgeSeatTests
{
    static JsonElement ProjectBeat(SimulationSession session)
    {
        session.Begin();
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        return document.RootElement.Clone();
    }

    [Fact]
    public void PlayerFacingBeatIsTomcatVersusMig28()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        JsonElement root = ProjectBeat(session);

        Assert.Equal("F-14A", root.GetProperty("top_gun_seat").GetString());
        Assert.Equal("MiG-28", root.GetProperty("opponent_callsign").GetString());
        Assert.Equal("top-gun-anime-1986", root.GetProperty("presentation_theme").GetString());
    }
}
