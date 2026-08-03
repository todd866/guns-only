using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.TopGun;

[Collection("snapshot-projection-statics")]
public sealed class TopGunSnapshotTests
{
    static JsonElement ProjectSession(SimulationSession session, int ticks = 0)
    {
        for (int i = 0; i < ticks; i++)
            session.StepFixed();
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        return document.RootElement.Clone();
    }

    static JsonElement ProjectBeat(SimulationSession session, int ticks = 0)
    {
        session.Begin();
        return ProjectSession(session, ticks);
    }

    [Fact]
    public void TopGunTomcatSnapshotProjectsExperienceFields()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        JsonElement root = ProjectBeat(session);

        Assert.Equal("F-14A", root.GetProperty("top_gun_seat").GetString());
        Assert.Equal("MiG-28", root.GetProperty("opponent_callsign").GetString());
        Assert.Equal("top-gun-anime-1986", root.GetProperty("presentation_theme").GetString());
        Assert.Equal(2, root.GetProperty("aim9_remaining").GetInt32());
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
        Assert.Equal("SAFE", root.GetProperty("aim9_seeker_state").GetString());
        double sweep = root.GetProperty("wing_sweep_deg").GetDouble();
        Assert.InRange(sweep, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
    }

    [Fact]
    public void TopGunMigSnapshotOmitsWingSweep()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.Mig28));
        JsonElement root = ProjectBeat(session);

        Assert.Equal("MiG-28", root.GetProperty("top_gun_seat").GetString());
        Assert.Equal("F-14A", root.GetProperty("opponent_callsign").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("wing_sweep_deg").ValueKind);
    }

    [Fact]
    public void TopGunTomcatFoxTwoUpdatesAim9Projection()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();
        Assert.True(session.LaunchFoxTwo());

        JsonElement root = ProjectSession(session, ticks: 1);
        Assert.Equal(1, root.GetProperty("aim9_remaining").GetInt32());
        Assert.True(root.GetProperty("aim9_in_flight").GetBoolean());
        string seeker = root.GetProperty("aim9_seeker_state").GetString()!;
        Assert.True(seeker is "SEEKING" or "TRACKING", seeker);
    }

    [Fact]
    public void ModernVisualMergeOmitsTopGunFields()
    {
        var session = new SimulationSession();
        session.StartBeat(7);
        JsonElement root = ProjectBeat(session);

        Assert.Equal(JsonValueKind.Null, root.GetProperty("top_gun_seat").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("wing_sweep_deg").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("aim9_remaining").ValueKind);
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("aim9_seeker_state").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("opponent_callsign").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("presentation_theme").ValueKind);
    }
}
