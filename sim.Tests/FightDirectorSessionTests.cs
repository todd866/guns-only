using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// Integration: the session feeds every EngagementReport to its FightDirector and stages each
/// continuous-combat successor from the director's SpawnSpec. The strongest wiring check is
/// replay equivalence — a reference director fed the session's own report list must reproduce
/// the session's spawn decisions exactly.
public class FightDirectorSessionTests {
    [Fact]
    public void SuccessorSpawnsComeFromTheDirectorAndMatchAReplayedReference() {
        var session = new SimulationSession();
        session.StartBeat(EngagementReportTests.ContinuousDuel);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.EngagementReports.Count < 1; tick++)
            session.StepFixed();
        Assert.Single(session.EngagementReports);
        session.FeedKey(GKey.Trigger, false);

        long firstSpawn = session.BanditSpawnSequence;
        for (int tick = 0; tick < AircraftSim.TickHz
            && session.BanditSpawnSequence == firstSpawn; tick++)
            session.StepFixed();
        Assert.Equal(2, session.EngagementNumber);

        var reference = new FightDirector();
        reference.Observe(session.EngagementReports[0]);
        SpawnSpec expected = reference.NextSpawn(2);

        SpawnSpec actual = Assert.IsType<SpawnSpec>(session.LastDirectorSpawn);
        Assert.Equal(expected, actual);
        var successor = Assert.IsType<ReactiveBandit>(session.Bandit);
        Assert.Equal(expected.Skill, successor.Skill);
        // A clean fast first kill reads as Sharp gunnery/defence: the director must already be
        // adapting (one step up from the Competent fixture opponent), not replaying the ladder.
        Assert.Equal(PilotSkill.Veteran, successor.Skill);
        Assert.False(string.IsNullOrWhiteSpace(actual.Reason));
        Assert.Equal(reference.Phase, session.DirectorPhase);

        // Engagement 2 ends as a pass-burst Defeat; the report must reach the director too.
        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.EngagementReports.Count < 2; tick++)
            session.StepFixed();
        Assert.Equal(2, session.EngagementReports.Count);
        reference.Observe(session.EngagementReports[1]);
        Assert.Equal(reference.Phase, session.DirectorPhase);
        Assert.Equal(reference.Bands, session.LearnerBands);
    }

    [Fact]
    public void RestartResetsTheDirectorToColdStart() {
        var session = new SimulationSession();
        session.StartBeat(EngagementReportTests.ContinuousDuel);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.EngagementReports.Count < 1; tick++)
            session.StepFixed();
        Assert.NotEmpty(session.EngagementReports);

        session.Restart();

        Assert.Equal(DirectorPhase.Calm, session.DirectorPhase);
        Assert.Null(session.LastDirectorSpawn);
    }
}
