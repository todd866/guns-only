using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class EngagementReportTests {
    static AircraftState State(double z, double speed = 170.0) => new(
        new Vec3D(0.0, 3000.0, z), speed, 0.0, 0.0, 0.0,
        FlightModel.Sabre.MassKg);

    static BeatSetup OpponentTailAttack() => new(
        "Engagement report opponent-tail fixture",
        State(0.0),
        State(-160.0),
        new PurePursuitLaw(),
        new() { (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0)) },
        Combat: new CombatConfig(
            PlayerAmmo: 0,
            OpponentAmmo: 60,
            PlayerHitsToDefeat: 1,
            OpponentHitsToDefeat: 4),
        BanditSkill: PilotSkill.Competent);

    /// From-scratch continuous fixture (deliberately NOT derived from ModernVisualMerge, whose
    /// assisted-flight corner-speed hold keeps the player too fast for any successor to catch).
    /// Engagement 1: the player guns the scripted bogey 160 m ahead. Engagement 2: the fast-injected
    /// Competent successor merges, reverses, and runs down the throttled-back player — with the
    /// trigger released, an honest Defeat is the only way the engagement can end.
    internal static BeatSetup ContinuousDuel() => new(
        "Engagement report continuous fixture",
        State(0.0),
        State(160.0),
        new PurePursuitLaw(),
        new() { (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0)) },
        Combat: new CombatConfig(
            PlayerAmmo: 60,
            OpponentAmmo: 60,
            PlayerHitsToDefeat: 1,
            OpponentHitsToDefeat: 1,
            // Test-fixture liberty: the successor must defeat the player on its head-on pass
            // burst, deterministically, without depending on the AI's stern-chase competence.
            // The ballistics stay honest; only the effective hit radius is widened.
            OpponentGun: GunProfiles.GSh301PublicDataSurrogate with {
                Id = "test-wide-lethality", EffectiveHitRadiusM = 90.0,
                PublicDataSurrogate = false, PublicSourceUrl = "" }),
        ContinuousCombat: new ContinuousCombatConfig(0.05, 400.0),
        InitialThrottle: 0.30);

    [Fact]
    public void OpponentSolutionTicksAreReportedAtTheDefeatBoundary() {
        var session = new SimulationSession();
        session.StartBeat(OpponentTailAttack);
        session.Begin();

        int solutionTicks = 0;
        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.LastEngagementReport is null; tick++) {
            session.StepFixed();
            if (session.OpponentGun.GunSolution) solutionTicks++;
        }

        EngagementReport report = Assert.IsType<EngagementReport>(
            session.LastEngagementReport);
        Assert.Equal(SortieOutcome.Defeat, report.Outcome);
        Assert.Equal(1, report.EngagementNumber);
        Assert.Equal(PilotSkill.Competent, report.OpponentSkill);
        Assert.False(report.OpponentWasBoss);
        Assert.Equal(solutionTicks * SimulationSession.FixedDeltaSeconds,
            report.SolutionSecondsConceded, 10);
        Assert.Equal(session.OpponentGun.HitCount, report.HitsTaken);
        Assert.True(report.DurationSeconds >= report.SolutionSecondsConceded);
        Assert.Equal(report, Assert.Single(session.EngagementReports));
    }

    [Fact]
    public void SuccessorEngagementsGetIncrementingNumbersAndIndependentCounters() {
        var session = new SimulationSession();
        session.StartBeat(ContinuousDuel);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.EngagementReports.Count < 1; tick++)
            session.StepFixed();

        EngagementReport first = Assert.Single(session.EngagementReports);
        Assert.Equal(SortieOutcome.Victory, first.Outcome);
        Assert.Equal(1, first.EngagementNumber);
        Assert.Equal(1, first.ShotsTotal);
        session.FeedKey(GKey.Trigger, false);

        long firstSpawn = session.BanditSpawnSequence;
        for (int tick = 0; tick < AircraftSim.TickHz
            && session.BanditSpawnSequence == firstSpawn; tick++)
            session.StepFixed();
        Assert.Equal(2, session.EngagementNumber);

        // The armed Competent successor merges head-on from ~2.2 km (SpawnForMerge geometry)
        // and its pass burst defeats the player (wide-lethality test gun): engagement 2 ends as
        // an honest Defeat, so the second report must carry fresh per-engagement counters — no
        // bleed-through from engagement 1's shot/solution/hit accounting.
        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.EngagementReports.Count < 2; tick++)
            session.StepFixed();

        Assert.Equal(2, session.EngagementReports.Count);
        EngagementReport second = session.EngagementReports[1];
        Assert.Equal(SortieOutcome.Defeat, second.Outcome);
        Assert.Equal(2, second.EngagementNumber);
        // The FightDirector stages successors from observed performance: a fast clean first kill
        // reads as Sharp, so the follow-up steps one tier past the Competent fixture opponent.
        Assert.Equal(PilotSkill.Veteran, second.OpponentSkill);
        Assert.Equal(0, second.ShotsTotal);
        Assert.True(second.HitsTaken >= 1,
            $"successor defeat must be earned by hits, saw {second.HitsTaken}");
        Assert.True(second.DurationSeconds > 0.0);
        Assert.Equal(second, session.LastEngagementReport);
    }

    [Fact]
    public void RestagingClearsSessionLifetimeReports() {
        var session = new SimulationSession();
        session.StartBeat(OpponentTailAttack);
        session.Begin();
        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.LastEngagementReport is null; tick++)
            session.StepFixed();
        Assert.NotEmpty(session.EngagementReports);

        session.Restart();

        Assert.Null(session.LastEngagementReport);
        Assert.Empty(session.EngagementReports);
    }
}
