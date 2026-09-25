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

        SpawnSpec actual = Assert.IsType<SpawnSpec>(session.LastDirectorSpawn);
        // This fixture is not the front door. The ramp must not retune it: the successor stays
        // the authored Competent ship, while the director still records the kill.
        Assert.Equal("authored successor", actual.Reason);
        Assert.Equal(PilotSkill.Competent, actual.Skill);
        var probe = new FightDirector();
        Assert.True(probe.TryImportState(reference.ExportState()));
        Assert.NotEqual(probe.NextSpawn(2), actual);
        var successor = Assert.IsType<ReactiveBandit>(session.Bandit);
        Assert.Equal(actual.Skill, successor.Skill);
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
    public void RestartPreservesDirectorMemoryButStartBeatResetsIt() {
        // Pacing memory must survive the pilot: dying is precisely the moment the director's
        // next decision matters, so Restart (fly again) keeps the learner state and consults
        // the director for the OPENING spawn of the new life. Staging a new beat is a new
        // learner context and resets it.
        var session = new SimulationSession();
        session.StartBeat(EngagementReportTests.ContinuousDuel);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.EngagementReports.Count < 1; tick++)
            session.StepFixed();
        EngagementReport firstLifeReport = Assert.Single(session.EngagementReports);

        session.Restart();

        Assert.Empty(session.EngagementReports);   // per-sortie evidence clears
        var reference = new FightDirector();
        reference.Observe(in firstLifeReport);
        SpawnSpec expectedOpening = reference.NextSpawn(1);
        SpawnSpec actualOpening = Assert.IsType<SpawnSpec>(session.LastDirectorSpawn);
        Assert.Equal(expectedOpening, actualOpening);
        Assert.Equal(reference.Phase, session.DirectorPhase);
        Assert.NotEqual(DirectorPhase.Calm, session.DirectorPhase);
        session.Begin();
        var openingBandit = Assert.IsType<ReactiveBandit>(session.Bandit);
        Assert.Equal(expectedOpening.Skill, openingBandit.Skill);

        session.StartBeat(EngagementReportTests.ContinuousDuel);

        Assert.Equal(DirectorPhase.Calm, session.DirectorPhase);
        Assert.Null(session.LastDirectorSpawn);
    }
}
