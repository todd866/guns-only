using System.Text.Json;
using GunsOnly.ArenaServer;

namespace GunsOnly.ArenaServer.Tests;

public class ArenaEloTests {
    [Fact]
    public void HighEloMachineLosingToWeakerHumanTakesLargeHit() {
        var (humanAfter, machineAfter, _) = Elo.Apply(1000, 1800, scoreA: 1, kA: 40, kB: 20);
        Assert.True(humanAfter > 1000);
        Assert.True(1800 - machineAfter > 15);
    }

    [Fact]
    public void HandicapNerfsOverEloMachineTowardWeakerBlend() {
        double blend = SkillTables.HandicappedBlend("MACHINE", 1800, 1000);
        Assert.True(blend < 4);
        Assert.True(blend > 0);
        HandicapProfile profile = SkillTables.ProfileAtBlend(blend);
        Assert.True(profile.MaxAcquireG < 15);
        Assert.True(profile.MaxAcquireG > 2.4);
    }

    [Fact]
    public void CreateAndCompleteRatedMatchMovesElo() {
        var store = new ArenaStore(now: () => 1_700_000_000_000L, random: () => 0.0);
        string createdJson = JsonSerializer.Serialize(store.CreateMatch("browser-testkey-001", scaffolded: false));
        using JsonDocument created = JsonDocument.Parse(createdJson);
        Assert.True(created.RootElement.GetProperty("ok").GetBoolean());
        string matchId = created.RootElement.GetProperty("matchId").GetString()!;
        double botBefore = created.RootElement.GetProperty("bot").GetProperty("elo").GetDouble();

        string completedJson = JsonSerializer.Serialize(store.CompleteMatch(
            matchId,
            "browser-testkey-001",
            "win",
            completed: true,
            earlyAbandon: false,
            rematch: false,
            againVote: 1,
            new MatchSanity(90, 40, true)));
        using JsonDocument completed = JsonDocument.Parse(completedJson);
        Assert.True(completed.RootElement.GetProperty("ok").GetBoolean());
        Assert.True(completed.RootElement.GetProperty("rated").GetBoolean());
        Assert.True(completed.RootElement.GetProperty("human").GetProperty("elo").GetDouble()
            > ArenaConstants.StartingElo);
        Assert.True(completed.RootElement.GetProperty("bot").GetProperty("elo").GetDouble() < botBefore);
    }

    [Fact]
    public void EarlyAbandonDoesNotMoveElo() {
        var store = new ArenaStore(now: () => 1L, random: () => 0.0);
        string createdJson = JsonSerializer.Serialize(store.CreateMatch("browser-testkey-002", false));
        using JsonDocument created = JsonDocument.Parse(createdJson);
        string matchId = created.RootElement.GetProperty("matchId").GetString()!;
        double botBefore = created.RootElement.GetProperty("bot").GetProperty("elo").GetDouble();

        string completedJson = JsonSerializer.Serialize(store.CompleteMatch(
            matchId,
            "browser-testkey-002",
            "loss",
            completed: false,
            earlyAbandon: true,
            rematch: false,
            againVote: 0,
            new MatchSanity(5, 0, false)));
        using JsonDocument completed = JsonDocument.Parse(completedJson);
        Assert.False(completed.RootElement.GetProperty("rated").GetBoolean());
        Assert.Equal(ArenaConstants.StartingElo,
            completed.RootElement.GetProperty("human").GetProperty("elo").GetDouble());
        Assert.Equal(botBefore, completed.RootElement.GetProperty("bot").GetProperty("elo").GetDouble());
    }
}
