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
        Assert.False(root.GetProperty("aim9_pose_valid").GetBoolean());
        Assert.Equal((int)GunsOnly.Sim.Missiles.Aim9FlightState.Safe,
            root.GetProperty("aim9_state_code").GetInt32());
        double sweep = root.GetProperty("wing_sweep_deg").GetDouble();
        Assert.InRange(sweep, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        Assert.Equal(sweep, root.GetProperty("wing_sweep_command_deg").GetDouble());
        Assert.Equal("AUTO", root.GetProperty("wing_sweep_mode").GetString());
        Assert.Equal((int)F14WingSweepMode.Auto,
            root.GetProperty("wing_sweep_mode_code").GetInt32());
        Assert.Equal(7.5, root.GetProperty("f14_g_limit_g").GetDouble());
        Assert.Equal(11.0, root.GetProperty("f14_override_limit_g").GetDouble());
        Assert.False(root.GetProperty("f14_over_g").GetBoolean());
        Assert.Equal(0.0, root.GetProperty("f14_over_g_seconds").GetDouble());
        Assert.Equal(0.0, root.GetProperty("f14_structural_fatigue_01").GetDouble());
        Assert.False(root.GetProperty("f14_structural_failed").GetBoolean());
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("opponent_wing_sweep_deg").ValueKind);
    }

    [Fact]
    public void TopGunMigSnapshotProjectsOpponentTomcatSweep()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.Mig28));
        JsonElement root = ProjectBeat(session);

        Assert.Equal("MiG-28", root.GetProperty("top_gun_seat").GetString());
        Assert.Equal("F-14A", root.GetProperty("opponent_callsign").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("wing_sweep_deg").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("wing_sweep_command_deg").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("wing_sweep_mode").ValueKind);
        Assert.Equal(0, root.GetProperty("wing_sweep_mode_code").GetInt32());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("f14_g_limit_g").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("f14_override_limit_g").ValueKind);
        Assert.InRange(root.GetProperty("opponent_wing_sweep_deg").GetDouble(),
            F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
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
        Assert.True(root.GetProperty("aim9_pose_valid").GetBoolean());
        Assert.True(root.GetProperty("aim9_state_code").GetInt32() is 1 or 2);
        foreach (string field in new[] {
            "aim9_x", "aim9_y", "aim9_z", "aim9_vx", "aim9_vy", "aim9_vz"
        }) {
            Assert.Equal(JsonValueKind.Number, root.GetProperty(field).ValueKind);
        }
        string seeker = root.GetProperty("aim9_seeker_state").GetString()!;
        Assert.True(seeker is "SEEKING" or "TRACKING", seeker);
    }

    [Fact]
    public void Aim9DetonationProjectsDamageKillAndOrderedPhysicalEvents()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();
        long targetSequence = session.BanditSpawnSequence;
        Assert.True(session.LaunchFoxTwo());
        session.SeedActiveAim9ForProximityHitForTest();
        session.StepFixed();

        JsonElement root = ProjectSession(session);
        Assert.Equal(0.0, root.GetProperty("opponent_health").GetDouble());
        Assert.Equal(0.0, root.GetProperty("bandit_health").GetDouble());
        Assert.False(root.GetProperty("opponent_alive").GetBoolean());
        Assert.Equal("DESTROYED_AIRBORNE",
            root.GetProperty("opponent_terminal_state").GetString());
        Assert.Equal(1, root.GetProperty("kill_count").GetInt32());
        Assert.Equal("DETONATED", root.GetProperty("aim9_seeker_state").GetString());

        JsonElement[] combatEvents = root.GetProperty("recent_events")
            .EnumerateArray()
            .Where(item => item.GetProperty("type").GetString() is "HIT" or "DESTROYED")
            .ToArray();
        Assert.Equal(new[] { "HIT", "DESTROYED" },
            combatEvents.Select(item => item.GetProperty("type").GetString()).ToArray());
        Assert.All(combatEvents, item =>
        {
            Assert.Equal($"entity.bandit.{targetSequence}",
                item.GetProperty("entity_id").GetString());
            Assert.Equal(3, item.GetProperty("position").GetArrayLength());
            Assert.Equal(3, item.GetProperty("velocity").GetArrayLength());
        });
        Assert.Equal(combatEvents[0].GetProperty("tick").GetInt64(),
            combatEvents[1].GetProperty("tick").GetInt64());
        Assert.Equal(combatEvents[0].GetProperty("position").GetRawText(),
            combatEvents[1].GetProperty("position").GetRawText());
        Assert.Equal(combatEvents[0].GetProperty("velocity").GetRawText(),
            combatEvents[1].GetProperty("velocity").GetRawText());
    }

    [Fact]
    public void ModernVisualMergeOmitsTopGunFields()
    {
        var session = new SimulationSession();
        session.StartBeat(7);
        JsonElement root = ProjectBeat(session);

        Assert.Equal(JsonValueKind.Null, root.GetProperty("top_gun_seat").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("wing_sweep_deg").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("opponent_wing_sweep_deg").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("aim9_remaining").ValueKind);
        Assert.False(root.GetProperty("aim9_in_flight").GetBoolean());
        Assert.False(root.GetProperty("aim9_pose_valid").GetBoolean());
        Assert.Equal(0, root.GetProperty("aim9_state_code").GetInt32());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("aim9_seeker_state").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("opponent_callsign").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("presentation_theme").ValueKind);
    }
}
