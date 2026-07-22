using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

public class DecisionRecorderSimulationTests {
    static AircraftState State(double z, double speed, double chi = 0.0) => new(
        new Vec3D(0.0, 3000.0, z),
        speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    static BeatSetup ReactiveFight(PilotSkill skill,
        CombatConfig? combat = null,
        double playerZ = 1200.0,
        double banditZ = 0.0) => new(
        "Decision recorder test",
        Player: State(playerZ, 170.0),
        Bandit: State(banditZ, 170.0),
        Law: new PurePursuitLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0))
        },
        UsesReactiveBandit: true,
        Combat: combat ?? new CombatConfig(PlayerAmmo: 0, OpponentAmmo: 0),
        BanditSkill: skill);

    [Fact]
    public void CaptureOnAndOffAreBitIdentical() {
        var captured = new SimulationSession();
        captured.StartBeat(() => ReactiveFight(PilotSkill.Competent));
        var uncaptured = new SimulationSession();
        uncaptured.StartBeat(() => ReactiveFight(PilotSkill.Competent));
        uncaptured.DecisionCaptureEnabled = false;
        captured.Begin();
        uncaptured.Begin();

        for (int tick = 0; tick < 240; tick++) {
            captured.StepFixed();
            uncaptured.StepFixed();
            Assert.Equal(uncaptured.Player.State, captured.Player.State);
            Assert.Equal(uncaptured.Bandit.State, captured.Bandit.State);
            Assert.Equal(uncaptured.PlayerGun.RoundsFired, captured.PlayerGun.RoundsFired);
            Assert.Equal(uncaptured.OpponentGun.RoundsFired, captured.OpponentGun.RoundsFired);
            Assert.Equal(uncaptured.RecentEvents, captured.RecentEvents);
        }

        Assert.Equal(240, captured.Decisions.Count);
        Assert.Equal(0, uncaptured.Decisions.Count);
        DecisionReadBatch records = captured.Decisions.ReadDecisionsAfter(
            0, DecisionRecorder.MaximumReadCount);
        Assert.All(records.Records, record => Assert.True(record.ManeuverSelected));
        Assert.All(records.Records,
            record => Assert.Equal(1, record.ManeuverTrace.CandidateCount));
    }

    [Fact]
    public void CaptureSettingCannotCreateAnUnmarkedMidEpisodeHole() {
        var session = new SimulationSession();
        session.StartBeat(() => ReactiveFight(PilotSkill.Competent));
        session.Begin();

        Assert.Throws<InvalidOperationException>(() =>
            session.DecisionCaptureEnabled = false);
        session.StepFixed();

        Assert.True(session.DecisionCaptureEnabled);
        Assert.Single(session.Decisions.ReadDecisionsAfter(0, 10).Records);
    }

    [Fact]
    public void AceSelectionCadenceAndTickRateFireIntentStaySeparate() {
        var session = new SimulationSession();
        session.StartBeat(() => ReactiveFight(PilotSkill.Ace));
        session.Begin();
        for (int tick = 0; tick < 36; tick++) session.StepFixed();

        DecisionReadBatch batch = session.Decisions.ReadDecisionsAfter(
            0, DecisionRecorder.MaximumReadCount);
        Assert.Equal(36, batch.Records.Count);
        Assert.Equal(new long[] { 0, 12, 24 }, batch.Records
            .Where(record => record.ManeuverSelected)
            .Select(record => record.Observation.Tick));
        Assert.All(batch.Records,
            record => Assert.False(record.FireIntentEvaluated));
        Assert.All(batch.Records,
            record => Assert.Equal(PilotSkill.Ace, record.PolicySkill));
        Assert.All(batch.Records.Where(record => record.ManeuverSelected),
            record => Assert.Equal(6, record.ManeuverTrace.CandidateCount));
        Assert.All(batch.Records.Where(record => !record.ManeuverSelected),
            record => Assert.Equal(0, record.ManeuverTrace.CandidateCount));
    }

    [Fact]
    public void FireIntentIsRecordedBeforeSameTickManeuverSelection() {
        var session = new SimulationSession();
        session.StartBeat(() => ReactiveFight(
            PilotSkill.Competent,
            new CombatConfig(PlayerAmmo: 0, OpponentAmmo: 20),
            playerZ: 600.0,
            banditZ: 0.0));
        session.Begin();
        session.StepFixed();

        BanditDecisionRecord record = Assert.Single(
            session.Decisions.ReadDecisionsAfter(0, 10).Records);
        Assert.True(record.FireIntentEvaluated);
        Assert.True(record.FireIntentConsumed);
        Assert.True(record.FireAuthorized);
        Assert.True(record.ManeuverSelected);
        Assert.Equal(1, record.OutcomeComponents.RoundsFired);
    }

    [Fact]
    public void LiveTransitionsChainExactWeaponAuthorityAcrossAmmoExhaustion() {
        var session = new SimulationSession();
        session.StartBeat(() => ReactiveFight(
            PilotSkill.Competent,
            new CombatConfig(
                PlayerAmmo: 0,
                OpponentAmmo: 3,
                PlayerHitsToDefeat: 999,
                OpponentHitsToDefeat: 2),
            playerZ: 600.0,
            banditZ: 0.0));
        session.Begin();
        for (int tick = 0; tick < 40; tick++) session.StepFixed();

        BanditDecisionRecord[] records = session.Decisions
            .ReadDecisionsAfter(0, 100).Records
            .Where(record => record.Kind == DecisionRecordKind.Transition)
            .ToArray();

        Assert.Contains(records, record => record.Observation.WeaponsAuthorized
            && !record.NextObservation.WeaponsAuthorized);
        Assert.All(records.Where(record => !record.Observation.WeaponsAuthorized),
            record => Assert.Equal(0.0,
                record.OutcomeComponents.FiringEnvelopeSeconds));
        for (int index = 1; index < records.Length; index++)
            Assert.Equal(records[index - 1].NextObservation,
                records[index].Observation);
    }

    [Fact]
    public void DestroyedOpponentPerspectiveEndsWithOneTerminalRecord() {
        var session = new SimulationSession();
        session.StartBeat(() => ReactiveFight(
            PilotSkill.Competent,
            new CombatConfig(
                PlayerAmmo: 0,
                OpponentAmmo: 20,
                PlayerHitsToDefeat: 1,
                OpponentHitsToDefeat: 2),
            playerZ: 180.0,
            banditZ: 0.0));
        session.Begin();
        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++)
            session.StepFixed();

        Assert.NotEqual(AircraftTerminalState.Flying, session.PlayerTerminalState);
        DecisionReadBatch terminalBatch = session.Decisions.ReadDecisionsAfter(
            0, DecisionRecorder.MaximumReadCount);
        BanditDecisionRecord terminal = terminalBatch.Records[^1];
        Assert.True(terminal.Terminated);
        Assert.False(terminal.Truncated);
        Assert.Equal(DecisionTerminationReason.OpponentDestroyed,
            terminal.TerminationReason);
        Assert.True(terminal.OutcomeComponents.OpponentDestroyed);
        int countAtTerminal = session.Decisions.Count;
        for (int tick = 0; tick < 10; tick++) session.StepFixed();
        Assert.Equal(countAtTerminal, session.Decisions.Count);
    }

    [Fact]
    public void RestartKeepsGlobalDecisionSequenceAndStartsANewActorEpisode() {
        var session = new SimulationSession();
        session.StartBeat(() => ReactiveFight(PilotSkill.Competent));
        session.Begin();
        session.StepFixed();
        session.StepFixed();
        BanditDecisionRecord before = session.Decisions
            .ReadDecisionsAfter(0, 10).Records[^1];

        session.Restart();
        DecisionReadBatch boundaryBatch = session.Decisions.ReadDecisionsAfter(
            before.Sequence, 10);
        BanditDecisionRecord boundary = Assert.Single(boundaryBatch.Records);
        Assert.Equal(before.Sequence + 1L, boundary.Sequence);
        Assert.Equal(DecisionRecordKind.EpisodeBoundary, boundary.Kind);
        Assert.Equal(before.ActorSpawnSequence, boundary.ActorSpawnSequence);
        Assert.Equal(DecisionBoundaryReason.ActorRestaged, boundary.BoundaryReason);
        Assert.True(boundary.Truncated);

        session.Begin();
        session.StepFixed();
        DecisionReadBatch afterBatch = session.Decisions.ReadDecisionsAfter(
            boundary.Sequence, 10);
        BanditDecisionRecord after = Assert.Single(afterBatch.Records);

        Assert.Equal(boundary.Sequence + 1L, after.Sequence);
        Assert.Equal(DecisionRecordKind.Transition, after.Kind);
        Assert.NotEqual(before.ActorSpawnSequence, after.ActorSpawnSequence);
        Assert.Equal(before.NextObservation.Tick, after.Observation.Tick);
        Assert.True(after.MemoryReset);
        Assert.True(after.PreviousActorEpisodeTruncated);
        Assert.Equal(before.ActorSpawnSequence, after.PreviousActorSpawnSequence);
    }

    [Fact]
    public void DelayedMutualKillAmendsTheTerminalRecordBeforeItFreezes() {
        // Reciprocal head-on guns pass: the player needs one hit to splash the bandit, while the
        // bandit needs two hits to splash the player. Both streams connect; the bandit dies first
        // and its already-airborne second round then destroys the player several ticks later.
        // The terminal decision record must not freeze at the first destruction: it settles the
        // in-flight rounds and reports the authoritative mutual destruction.
        var session = new SimulationSession();
        session.StartBeat(() => new BeatSetup(
            "Delayed mutual kill",
            Player: new AircraftState(
                new Vec3D(0.0, 3000.0, 0.0), 200.0, 0.0, 0.0, 0.0,
                FlightModel.Sabre.MassKg),
            Bandit: new AircraftState(
                new Vec3D(0.0, 3000.0, 240.0), 200.0, 0.0, System.Math.PI, 0.0,
                FlightModel.Sabre.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0))
            },
            UsesReactiveBandit: true,
            Combat: new CombatConfig(
                PlayerAmmo: 60,
                OpponentAmmo: 60,
                PlayerHitsToDefeat: 2,
                OpponentHitsToDefeat: 1),
            BanditSkill: PilotSkill.Competent));
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        long banditDestroyedTick = -1;
        long playerDestroyedTick = -1;
        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) {
            session.StepFixed();
            if (banditDestroyedTick < 0 && session.Bandit.CatastrophicallyDamaged)
                banditDestroyedTick = tick;
            if (playerDestroyedTick < 0
                && session.PlayerTerminalState != AircraftTerminalState.Flying)
                playerDestroyedTick = tick;
            if (banditDestroyedTick >= 0 && playerDestroyedTick >= 0 && tick
                >= playerDestroyedTick + 4) break;
        }

        Assert.True(banditDestroyedTick >= 0, "the player's rounds must splash the bandit");
        Assert.True(playerDestroyedTick > banditDestroyedTick,
            $"the mutual kill must be DELAYED (bandit tick {banditDestroyedTick}, "
            + $"player tick {playerDestroyedTick})");

        BanditDecisionRecord[] records = session.Decisions
            .ReadDecisionsAfter(0, DecisionRecorder.MaximumReadCount).Records
            .Where(record => record.Kind == DecisionRecordKind.Transition)
            .ToArray();
        BanditDecisionRecord terminal = Assert.Single(
            records, record => record.Terminated);
        Assert.Equal(records[^1], terminal);
        Assert.Equal(DecisionTerminationReason.MutualDestruction,
            terminal.TerminationReason);
        Assert.True(terminal.OutcomeComponents.OpponentDestroyed);
        Assert.True(terminal.OutcomeComponents.OwnshipDestroyed);
        Assert.Equal(2, terminal.OutcomeComponents.HitsScored);
        // Capture stays closed once the amended terminal record has been appended.
        int countAtTerminal = session.Decisions.Count;
        for (int tick = 0; tick < 10; tick++) session.StepFixed();
        Assert.Equal(countAtTerminal, session.Decisions.Count);
    }
}
