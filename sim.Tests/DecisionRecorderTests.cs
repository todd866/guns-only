using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

public class DecisionRecorderTests {
    static CombatPolicyObservation Observation(long tick) {
        var own = new AircraftState(
            new Vec3D(0.0, 3000.0, tick),
            230.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg,
            QuaternionD.Identity,
            default);
        var target = new AircraftState(
            new Vec3D(0.0, 3000.0, tick + 600.0),
            225.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity,
            default);
        return CombatPolicyObservation.Capture(
            tick,
            tick * SimulationSession.FixedDeltaSeconds,
            own,
            ActorObservation.Capture(target, tick),
            ownshipAmmoRemaining: 20,
            weaponsAuthorized: true);
    }

    static BanditDecisionRecord Record(long tick,
        bool terminal = false) {
        var command = new PilotCommand(3.0, 0.4, 1.0, 0.0);
        var candidate = new BanditDecisionCandidate(
            0, command, 1.25, HasScore: true, Available: true);
        var trace = new BanditDecisionTrace(
            tick + 1L,
            PilotSkill.Competent,
            command,
            0,
            1,
            candidate,
            default,
            default,
            default,
            default,
            default);
        return new BanditDecisionRecord(
            Sequence: 0,
            Kind: DecisionRecordKind.Transition,
            BoundaryTick: 0,
            BoundaryReason: DecisionBoundaryReason.None,
            PlayerSpawnSequence: 1,
            ActorSpawnSequence: 2,
            PolicySkill: PilotSkill.Competent,
            MemoryReset: tick == 0,
            PreviousActorSpawnSequence: 0,
            PreviousActorEpisodeTruncated: false,
            Observation: Observation(tick),
            NextObservation: Observation(tick + 1L),
            ManeuverSelected: true,
            ManeuverTrace: trace,
            PolicyMemoryBefore: default,
            PolicyMemoryAfter: default,
            ManeuverApplied: command,
            FireIntentEvaluated: true,
            FireIntentConsumed: false,
            FireAuthorized: false,
            OutcomeComponents: new CombatRewardComponents(
                SimulationSession.FixedDeltaSeconds,
                0.0, 0.0, 0, 0, 0, false, false),
            EventSequenceFirst: 0,
            EventSequenceLast: 0,
            Terminated: terminal,
            Truncated: false,
            TerminationReason: terminal
                ? DecisionTerminationReason.ActorDestroyed
                : DecisionTerminationReason.None);
    }

    [Fact]
    public void CursorReadsAreIdempotentBoundedAndOrdered() {
        var recorder = new DecisionRecorder(capacity: 8);
        for (long tick = 0; tick < 6; tick++) recorder.Append(Record(tick));

        DecisionReadBatch first = recorder.ReadDecisionsAfter(2, maximumCount: 2);
        DecisionReadBatch replay = recorder.ReadDecisionsAfter(2, maximumCount: 2);

        Assert.False(first.HasGap);
        Assert.Equal(1, first.OldestSequence);
        Assert.Equal(6, first.LatestSequence);
        Assert.Equal(new long[] { 3, 4 },
            first.Records.Select(record => record.Sequence));
        Assert.Equal(first.RequestedAfterSequence, replay.RequestedAfterSequence);
        Assert.Equal(first.OldestSequence, replay.OldestSequence);
        Assert.Equal(first.LatestSequence, replay.LatestSequence);
        Assert.Equal(first.Gap, replay.Gap);
        Assert.Equal(first.Records, replay.Records);
        Assert.Equal(6, recorder.Count);
    }

    [Fact]
    public void OverflowReportsTheMissingSequenceAndTickRange() {
        var recorder = new DecisionRecorder(capacity: 4);
        for (long tick = 0; tick < 6; tick++) recorder.Append(Record(tick));

        DecisionReadBatch batch = recorder.ReadDecisionsAfter(0, maximumCount: 4);

        Assert.True(batch.HasGap);
        Assert.Equal(3, batch.OldestSequence);
        Assert.Equal(6, batch.LatestSequence);
        Assert.Equal(new long[] { 3, 4, 5, 6 },
            batch.Records.Select(record => record.Sequence));
        DecisionGap gap = batch.Gap!.Value;
        Assert.Equal(1, gap.DroppedSequenceFirst);
        Assert.Equal(2, gap.DroppedSequenceLast);
        Assert.Equal(0, gap.GlobalDroppedTickFirst);
        Assert.Equal(1, gap.GlobalDroppedTickLast);
        Assert.True(gap.TickRangeCoversAllRecorderDrops);
        Assert.Equal(2, recorder.DroppedCount);
    }

    [Fact]
    public void NonzeroCursorGapLabelsGlobalTickRangeHonestly() {
        var recorder = new DecisionRecorder(capacity: 4);
        for (long tick = 0; tick < 8; tick++) recorder.Append(Record(tick));

        DecisionReadBatch batch = recorder.ReadDecisionsAfter(2, maximumCount: 4);

        DecisionGap gap = Assert.IsType<DecisionGap>(batch.Gap);
        Assert.Equal(3, gap.DroppedSequenceFirst);
        Assert.Equal(4, gap.DroppedSequenceLast);
        Assert.Equal(0, gap.GlobalDroppedTickFirst);
        Assert.Equal(3, gap.GlobalDroppedTickLast);
        Assert.True(gap.TickRangeCoversAllRecorderDrops);
        Assert.Equal(new long[] { 5, 6, 7, 8 },
            batch.Records.Select(record => record.Sequence));
    }

    [Fact]
    public void ExplicitEpisodeBoundaryIsRetainedAsASequencedTruncation() {
        var recorder = new DecisionRecorder(capacity: 4);
        BanditDecisionRecord transition = recorder.Append(Record(0));

        BanditDecisionRecord boundary = recorder.AppendEpisodeBoundary(
            playerSpawnSequence: 1,
            actorSpawnSequence: 2,
            tick: 1,
            DecisionBoundaryReason.ActorRestaged);

        Assert.Equal(transition.Sequence + 1L, boundary.Sequence);
        Assert.Equal(DecisionRecordKind.EpisodeBoundary, boundary.Kind);
        Assert.Equal(1, boundary.BoundaryTick);
        Assert.Equal(DecisionBoundaryReason.ActorRestaged, boundary.BoundaryReason);
        Assert.True(boundary.Truncated);
        Assert.False(boundary.Terminated);
        Assert.Equal(DecisionTerminationReason.SortieFinished,
            boundary.TerminationReason);
    }

    [Fact]
    public void RecorderOwnsSequenceAndRejectsInvalidTerminalLabels() {
        var recorder = new DecisionRecorder();
        BanditDecisionRecord suppliedSequence = Record(0) with { Sequence = 99 };
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            recorder.Append(suppliedSequence));
        BanditDecisionRecord mismatched = Record(0) with {
            Terminated = true,
            TerminationReason = DecisionTerminationReason.None
        };
        Assert.Throws<ArgumentOutOfRangeException>(() => recorder.Append(mismatched));
    }

    [Fact]
    public void CursorAtLongMaxReturnsAnEmptyBatchWithoutOverflow() {
        var recorder = new DecisionRecorder();
        recorder.Append(Record(0));

        DecisionReadBatch batch = recorder.ReadDecisionsAfter(
            long.MaxValue, maximumCount: 1);

        Assert.False(batch.HasGap);
        Assert.Empty(batch.Records);
        Assert.Equal(1, batch.LatestSequence);
    }
}
