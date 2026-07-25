using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// 1v2. The pilot's design: "first fight is 1v2 and if I win that it stays that way", with numbers
/// easing back to a single opponent on a loss — the harshest axis, so the first one returned.
public class FormationCombatTests {
    readonly ITestOutputHelper _out;
    public FormationCombatTests(ITestOutputHelper output) => _out = output;

    [Fact]
    public void TheOpeningWaveIsAPairAndBothFlyAndShoot() {
        var session = new SimulationSession(7);
        session.Begin();

        Assert.Single(session.Wingmen);
        Assert.Equal(2, session.LiveOpponentCount);
        Wingman wingman = session.Wingmen[0];
        Assert.NotSame(session.Bandit, wingman.Bandit);

        var startPrimary = session.Bandit.State.Position;
        var startWingman = wingman.Bandit.State.Position;
        // They must not be stacked on top of each other — a formation the pilot has to split.
        double separationM = (startPrimary - startWingman).Length;
        Assert.InRange(separationM, 150.0, 12_000.0);

        for (int tick = 0; tick < 8 * AircraftSim.TickHz; tick++) session.StepFixed();

        // Both are genuinely being flown, not parked.
        Assert.True((session.Bandit.State.Position - startPrimary).Length > 500.0,
            "the primary never moved");
        Assert.True((wingman.Bandit.State.Position - startWingman).Length > 500.0,
            "the wingman never moved");
        _out.WriteLine(
            $"opening separation {separationM:F0} m; after 8 s primary moved "
            + $"{(session.Bandit.State.Position - startPrimary).Length:F0} m, wingman "
            + $"{(wingman.Bandit.State.Position - startWingman).Length:F0} m");
    }

    [Fact]
    public void BothOpponentsShareOneDamagePoolOnThePlayer() {
        var session = new SimulationSession(7);
        session.Begin();
        Assert.Equal(0, session.PlayerHitsTaken);

        // Two shooters must KILL the player together rather than each needing a full magazine's
        // worth of hits of their own.
        Assert.Equal(
            session.OpponentGun.HitCount + session.Wingmen[0].Gun.HitCount,
            session.PlayerHitsTaken);
    }

    /// One death is the expected cost of a fight pitched near a 4:1 win rate, and the pilot noticed
    /// the moment it was over-rewarded: "when I restart after dying it's back to 1v1". The pair is
    /// the most interesting shape the ladder can serve, so it is the LAST thing surrendered — the
    /// tier steps down on every loss while the wingman survives the first one.
    [Fact]
    public void NumbersSurviveOneLossAndEaseOnTheSecond() {
        var director = new FightDirector();
        SpawnSpec opening = director.NextSpawn(1);
        Assert.Equal(2, opening.FormationSize);
        Assert.Equal(PilotSkill.Ace, opening.Skill);

        static EngagementReport Loss(int engagement, PilotSkill skill) => new(
            engagement, skill, OpponentWasBoss: false, SortieOutcome.Defeat,
            DurationSeconds: 40.0, SolutionSecondsConceded: 12.0, HitsTaken: 3,
            ShotsTotal: 8, ShotsInWindow: 1, Overshoots: 2,
            MinimumEnergyKias: 180.0, GcasActivations: 0);

        EngagementReport first = Loss(1, opening.Skill);
        director.Observe(in first);
        SpawnSpec afterOne = director.NextSpawn(2);
        Assert.Equal(2, afterOne.FormationSize);
        // The first death buys relief on the tier, not on the shape of the fight.
        Assert.True(afterOne.Skill < opening.Skill,
            "a defeat must ease something; the tier is what moves first");
        Assert.True(afterOne.Skill >= PilotSkill.Veteran,
            $"one loss stepped the tier too far: {afterOne.Skill}");

        EngagementReport second = Loss(2, afterOne.Skill);
        director.Observe(in second);
        SpawnSpec afterTwo = director.NextSpawn(3);
        Assert.Equal(1, afterTwo.FormationSize);
        // Two losses is genuine trouble and the ladder is allowed to give real ground, but it must
        // still be a ladder: never a free-fall straight back to the warm-up rung.
        Assert.True(afterTwo.Skill >= PilotSkill.Competent,
            $"two losses collapsed the ladder instead of stepping it: {afterTwo.Skill}");
    }

    [Fact]
    public void TheBossAndTheMachineSpikeArriveAlone() {
        var director = new FightDirector();
        Assert.Equal(1, director.FormationSizeFor(PilotSkill.Ace, boss: true));
        Assert.Equal(1, director.FormationSizeFor(PilotSkill.Machine, boss: false));
    }

    [Fact]
    public void KillingTheLeaderPromotesTheWingmanWithinTheSameEngagement() {
        var session = new SimulationSession(7);
        session.Begin();
        Assert.Equal(1, session.EngagementNumber);
        IBandit leader = session.Bandit;
        IBandit wingman = session.Wingmen[0].Bandit;

        // Take the leader out of the fight the way a gun result does.
        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && ReferenceEquals(session.Bandit, leader); tick++)
            session.StepFixed();

        Assert.Same(wingman, session.Bandit);
        Assert.Empty(session.Wingmen);
        // Still ONE fight: a 1v2 is a single engagement and a single entry in the record.
        Assert.Equal(1, session.EngagementNumber);
        Assert.Equal(1, session.LiveOpponentCount);
    }
}
