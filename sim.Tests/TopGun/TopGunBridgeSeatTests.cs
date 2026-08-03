using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.TopGun;

/// <summary>
/// Seat index contract for WebBridge.StartTopGun — mirrored in app.js TOP_GUN_SEAT.
/// </summary>
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

    static TopGunSeat SeatFromBridgeIndex(int seatIndex) =>
        seatIndex == 1 ? TopGunSeat.Mig28 : TopGunSeat.F14A;

    [Theory]
    [InlineData(0, "F-14A", "MiG-28")]
    [InlineData(1, "MiG-28", "F-14A")]
    public void BridgeSeatIndexStagesMatchingTopGunBeat(
        int seatIndex, string expectedOwnship, string expectedOpponent)
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(SeatFromBridgeIndex(seatIndex)));
        JsonElement root = ProjectBeat(session);

        Assert.Equal(expectedOwnship, root.GetProperty("top_gun_seat").GetString());
        Assert.Equal(expectedOpponent, root.GetProperty("opponent_callsign").GetString());
        Assert.Equal("top-gun-anime-1986", root.GetProperty("presentation_theme").GetString());
    }
}
