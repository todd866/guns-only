using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

public enum DecisionRecordKind {
    Transition,
    EpisodeBoundary
}

public enum DecisionBoundaryReason {
    None,
    ActorRestaged
}

public enum DecisionTerminationReason {
    None,
    OpponentDestroyed,
    ActorDestroyed,
    MutualDestruction,
    ActorReplaced,
    SortieFinished
}

/// <summary>
/// One kernel-authored micro-transition. Trigger intent is an every-tick action. ManeuverSelected
/// is true only at a real policy selection boundary; held lookahead commands remain visible as
/// ManeuverApplied without being mislabeled as new decisions.
/// </summary>
public readonly record struct BanditDecisionRecord(
    long Sequence,
    DecisionRecordKind Kind,
    long BoundaryTick,
    DecisionBoundaryReason BoundaryReason,
    long PlayerSpawnSequence,
    long ActorSpawnSequence,
    PilotSkill PolicySkill,
    bool MemoryReset,
    long PreviousActorSpawnSequence,
    bool PreviousActorEpisodeTruncated,
    CombatPolicyObservation Observation,
    CombatPolicyObservation NextObservation,
    bool ManeuverSelected,
    BanditDecisionTrace ManeuverTrace,
    BanditPolicyMemory PolicyMemoryBefore,
    BanditPolicyMemory PolicyMemoryAfter,
    PilotCommand ManeuverApplied,
    bool FireIntentEvaluated,
    bool FireIntentConsumed,
    bool FireAuthorized,
    CombatRewardComponents OutcomeComponents,
    long EventSequenceFirst,
    long EventSequenceLast,
    bool Terminated,
    bool Truncated,
    DecisionTerminationReason TerminationReason);

public readonly record struct DecisionGap(
    long DroppedSequenceFirst,
    long DroppedSequenceLast,
    long GlobalDroppedTickFirst,
    long GlobalDroppedTickLast,
    bool TickRangeCoversAllRecorderDrops);

public sealed record DecisionReadBatch(
    long RequestedAfterSequence,
    long OldestSequence,
    long LatestSequence,
    DecisionGap? Gap,
    IReadOnlyList<BanditDecisionRecord> Records) {

    public bool HasGap => Gap.HasValue;
}

/// <summary>
/// Preallocated circular decision stream. Appends allocate nothing; cursor reads are idempotent and
/// explicitly report when a slow consumer has fallen behind the oldest retained sequence.
/// </summary>
public sealed class DecisionRecorder {
    public const int DefaultCapacity = 8192;
    public const int MaximumReadCount = 4096;

    readonly BanditDecisionRecord[] _records;
    int _count;
    long _latestSequence;
    long _firstDroppedTick = long.MaxValue;
    long _lastDroppedTick = long.MinValue;

    public DecisionRecorder(int capacity = DefaultCapacity) {
        if (capacity < 1) throw new ArgumentOutOfRangeException(nameof(capacity));
        Capacity = capacity;
        _records = new BanditDecisionRecord[capacity];
    }

    public int Capacity { get; }
    public int Count => _count;
    public long LatestSequence => _latestSequence;
    public long OldestSequence => _count == 0 ? 0 : _latestSequence - _count + 1;
    public long DroppedCount => System.Math.Max(0L, _latestSequence - _count);

    public BanditDecisionRecord Append(in BanditDecisionRecord draft) {
        Validate(draft);
        long sequence = checked(_latestSequence + 1L);
        int index = (int)((sequence - 1L) % Capacity);
        if (_count == Capacity) {
            BanditDecisionRecord dropped = _records[index];
            long droppedTick = dropped.Kind == DecisionRecordKind.EpisodeBoundary
                ? dropped.BoundaryTick : dropped.Observation.Tick;
            _firstDroppedTick = System.Math.Min(
                _firstDroppedTick, droppedTick);
            _lastDroppedTick = System.Math.Max(
                _lastDroppedTick, droppedTick);
        } else {
            _count++;
        }

        BanditDecisionRecord stored = draft with { Sequence = sequence };
        _records[index] = stored;
        _latestSequence = sequence;
        return stored;
    }

    public BanditDecisionRecord AppendEpisodeBoundary(
        long playerSpawnSequence,
        long actorSpawnSequence,
        long tick,
        DecisionBoundaryReason reason) {
        if (playerSpawnSequence <= 0 || actorSpawnSequence <= 0 || tick < 0
            || reason == DecisionBoundaryReason.None)
            throw new ArgumentOutOfRangeException(nameof(actorSpawnSequence));
        var boundary = new BanditDecisionRecord(
            Sequence: 0L,
            Kind: DecisionRecordKind.EpisodeBoundary,
            BoundaryTick: tick,
            BoundaryReason: reason,
            PlayerSpawnSequence: playerSpawnSequence,
            ActorSpawnSequence: actorSpawnSequence,
            PolicySkill: default,
            MemoryReset: false,
            PreviousActorSpawnSequence: 0L,
            PreviousActorEpisodeTruncated: false,
            Observation: default,
            NextObservation: default,
            ManeuverSelected: false,
            ManeuverTrace: default,
            PolicyMemoryBefore: default,
            PolicyMemoryAfter: default,
            ManeuverApplied: default,
            FireIntentEvaluated: false,
            FireIntentConsumed: false,
            FireAuthorized: false,
            OutcomeComponents: default,
            EventSequenceFirst: 0L,
            EventSequenceLast: 0L,
            Terminated: false,
            Truncated: true,
            TerminationReason: DecisionTerminationReason.SortieFinished);
        return Append(boundary);
    }

    public DecisionReadBatch ReadDecisionsAfter(long sequence, int maximumCount) {
        if (sequence < 0) throw new ArgumentOutOfRangeException(nameof(sequence));
        if (maximumCount is < 1 or > MaximumReadCount)
            throw new ArgumentOutOfRangeException(nameof(maximumCount));
        if (_count == 0)
            return new DecisionReadBatch(sequence, 0, 0, null,
                Array.Empty<BanditDecisionRecord>());

        long oldest = OldestSequence;
        if (sequence >= _latestSequence)
            return new DecisionReadBatch(sequence, oldest, _latestSequence, null,
                Array.Empty<BanditDecisionRecord>());
        bool hasGap = sequence < oldest - 1L;
        long first = System.Math.Max(sequence + 1L, oldest);
        if (first > _latestSequence)
            return new DecisionReadBatch(sequence, oldest, _latestSequence,
                GapFor(hasGap, sequence, oldest),
                Array.Empty<BanditDecisionRecord>());

        int available = checked((int)(_latestSequence - first + 1L));
        int take = System.Math.Min(available, maximumCount);
        var selected = new BanditDecisionRecord[take];
        for (int offset = 0; offset < take; offset++) {
            long currentSequence = first + offset;
            int index = (int)((currentSequence - 1L) % Capacity);
            selected[offset] = _records[index];
        }
        return new DecisionReadBatch(sequence, oldest, _latestSequence,
            GapFor(hasGap, sequence, oldest), selected);
    }

    DecisionGap? GapFor(bool hasGap, long requestedAfter, long oldest) {
        if (!hasGap) return null;
        long tickFirst = _firstDroppedTick == long.MaxValue ? 0L : _firstDroppedTick;
        long tickLast = _lastDroppedTick == long.MinValue ? tickFirst : _lastDroppedTick;
        return new DecisionGap(
            requestedAfter + 1L,
            oldest - 1L,
            tickFirst,
            tickLast,
            TickRangeCoversAllRecorderDrops: true);
    }

    static void Validate(in BanditDecisionRecord record) {
        if (record.Sequence != 0L)
            throw new ArgumentOutOfRangeException(nameof(record),
                "The recorder assigns globally monotonic sequence numbers.");
        if (record.PlayerSpawnSequence <= 0 || record.ActorSpawnSequence <= 0)
            throw new ArgumentOutOfRangeException(nameof(record));
        if (record.Kind == DecisionRecordKind.EpisodeBoundary) {
            if (record.BoundaryTick < 0
                || record.BoundaryReason == DecisionBoundaryReason.None
                || record.Terminated
                || !record.Truncated
                || record.TerminationReason == DecisionTerminationReason.None)
                throw new ArgumentOutOfRangeException(nameof(record));
            return;
        }
        if (record.Kind != DecisionRecordKind.Transition
            || record.BoundaryTick != 0L
            || record.BoundaryReason != DecisionBoundaryReason.None
            || record.PolicySkill is < PilotSkill.Novice or > PilotSkill.Ace)
            throw new ArgumentOutOfRangeException(nameof(record));
        if (record.PreviousActorSpawnSequence < 0
            || (record.PreviousActorEpisodeTruncated
                && (!record.MemoryReset || record.PreviousActorSpawnSequence <= 0)))
            throw new ArgumentOutOfRangeException(nameof(record));
        if (!record.Observation.IsFinite || !record.NextObservation.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(record));
        if (record.NextObservation.Tick <= record.Observation.Tick
            || record.NextObservation.ElapsedSeconds <= record.Observation.ElapsedSeconds)
            throw new ArgumentOutOfRangeException(nameof(record));
        if (!record.OutcomeComponents.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(record));
        if (record.EventSequenceFirst < 0
            || record.EventSequenceLast < record.EventSequenceFirst)
            throw new ArgumentOutOfRangeException(nameof(record));
        if ((record.Terminated || record.Truncated)
            != (record.TerminationReason != DecisionTerminationReason.None))
            throw new ArgumentOutOfRangeException(nameof(record));
        if (record.Terminated && record.Truncated)
            throw new ArgumentOutOfRangeException(nameof(record));
    }
}
