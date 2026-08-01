using System.Collections.ObjectModel;

namespace GunsOnly.Sim.Korea;

/// <summary>
/// One deterministic evidence frame. Raw aerodynamic state belongs in evidence/replay, not in the
/// observer-safe mission snapshot exposed to presentation.
/// </summary>
public readonly record struct ArmstrongNarrativeEvidenceSample(
    string ScenarioId,
    long ReconstructionEpochSequence,
    long SourceTick,
    long SimulationTick,
    ArmstrongCableStrikePhase Phase,
    Vec3D PlayerPosition,
    Vec3D PlayerVelocity,
    Vec3D CarpenterPosition,
    double RollRateRadS,
    double PilotLateralInput,
    string? DamageProfileId,
    AirframeDamageEpistemic? DamageEpistemic,
    AirframeAerodynamicState EffectiveAerodynamicConfiguration);

/// <summary>
/// Immutable export. Consumers replay these records directly and never re-run collision or damage
/// physics to reconstruct what happened.
/// </summary>
public sealed class ArmstrongNarrativeEvidenceBundle {
    internal ArmstrongNarrativeEvidenceBundle(
        string scenarioId,
        long completedEpochSequence,
        int retryCount,
        AirframeDamageEpistemic? damageEpistemic,
        bool evidenceIncomplete,
        bool retrySummaryIncomplete,
        long droppedRetrySummaryCount,
        ArmstrongNarrativeEvidenceSample[] generalSamples,
        ArmstrongNarrativeEvidenceSample[] preContactHighRateSamples,
        ArmstrongNarrativeEvidenceSample[] postContactHighRateSamples,
        ArmstrongCableStrikeEventRecord[] allEvents,
        ArmstrongCableStrikeEventRecord[] completedEpochEvents,
        ArmstrongCableStrikeEventRecord[] retrySummaryEvents) {
        ScenarioId = scenarioId;
        CompletedEpochSequence = completedEpochSequence;
        RetryCount = retryCount;
        DamageEpistemic = damageEpistemic;
        EvidenceIncomplete = evidenceIncomplete;
        RetrySummaryIncomplete = retrySummaryIncomplete;
        DroppedRetrySummaryCount = droppedRetrySummaryCount;
        GeneralSamples = Array.AsReadOnly(generalSamples);
        PreContactHighRateSamples = Array.AsReadOnly(preContactHighRateSamples);
        PostContactHighRateSamples = Array.AsReadOnly(postContactHighRateSamples);
        AllEvents = Array.AsReadOnly(allEvents);
        CompletedEpochEvents = Array.AsReadOnly(completedEpochEvents);
        RetrySummaryEvents = Array.AsReadOnly(retrySummaryEvents);
    }

    public string ScenarioId { get; }
    public long CompletedEpochSequence { get; }
    public int RetryCount { get; }
    /// <summary>
    /// Epistemic status of the damage profile in the completed reconstruction epoch. Null means
    /// that no physical damage profile was present in the supplied debug/test completion.
    /// </summary>
    public AirframeDamageEpistemic? DamageEpistemic { get; }
    /// <summary>True only when evidence from the completing epoch was lost.</summary>
    public bool EvidenceIncomplete { get; }
    /// <summary>True when old retry summaries exceeded their bounded history.</summary>
    public bool RetrySummaryIncomplete { get; }
    public long DroppedRetrySummaryCount { get; }
    public ReadOnlyCollection<ArmstrongNarrativeEvidenceSample> GeneralSamples { get; }
    public ReadOnlyCollection<ArmstrongNarrativeEvidenceSample> PreContactHighRateSamples { get; }
    public ReadOnlyCollection<ArmstrongNarrativeEvidenceSample> PostContactHighRateSamples { get; }
    public ReadOnlyCollection<ArmstrongCableStrikeEventRecord> AllEvents { get; }
    public ReadOnlyCollection<ArmstrongCableStrikeEventRecord> CompletedEpochEvents { get; }
    public ReadOnlyCollection<ArmstrongCableStrikeEventRecord> RetrySummaryEvents { get; }
}

/// <summary>
/// Bounded evidence capture for the cable-to-decision slice. It retains 10 seconds at 120 Hz
/// before contact, two seconds at 120 Hz after contact, a 12 Hz general trace, every event from
/// the active epoch, and a bounded checkpoint-restore summary for abandoned epochs. A new retry
/// epoch clears active evidence so abandoned attempts cannot evict or taint the completing epoch.
/// </summary>
public sealed class NarrativeEvidenceRecorder {
    public const int AuthorityTickHz = 120;
    public const int GeneralSampleHz = 12;
    public const int GeneralSampleIntervalTicks = AuthorityTickHz / GeneralSampleHz;
    public const int PreContactHighRateCapacity = 10 * AuthorityTickHz;
    public const int PostContactHighRateCapacity = 2 * AuthorityTickHz;
    public const int GeneralSampleCapacity = 12 * 60 * 10;
    public const int RetrySummaryCapacity = 1024;
    public const int EventCapacity = RetrySummaryCapacity;

    readonly string _scenarioId;
    readonly ArmstrongNarrativeEvidenceSample[] _preContact =
        new ArmstrongNarrativeEvidenceSample[PreContactHighRateCapacity];
    readonly List<ArmstrongNarrativeEvidenceSample> _postContact = new();
    readonly List<ArmstrongNarrativeEvidenceSample> _general = new();
    readonly List<ArmstrongCableStrikeEventRecord> _currentEpochEvents = new();
    readonly List<ArmstrongCableStrikeEventRecord> _retrySummaryEvents = new();

    int _preContactWriteIndex;
    int _preContactCount;
    long _currentEpochSequence;
    long _lastEventSequence;
    long _lastObservedSourceTick = -1;
    bool _contactSeen;
    bool _frozen;
    bool _currentEpochEvidenceIncomplete;
    bool _retrySummaryIncomplete;
    long _droppedRetrySummaryCount;
    ArmstrongCableStrikeEventRecord? _pendingRetrySummary;
    ArmstrongNarrativeEvidenceBundle? _frozenBundle;

    public NarrativeEvidenceRecorder(string scenarioId) {
        ArmstrongContractValidation.StableId(scenarioId, nameof(scenarioId));
        _scenarioId = scenarioId;
    }

    public bool IsFrozen => _frozen;
    public bool EvidenceIncomplete => _currentEpochEvidenceIncomplete;
    public bool RetrySummaryIncomplete => _retrySummaryIncomplete;
    public long DroppedRetrySummaryCount => _droppedRetrySummaryCount;
    public long CurrentEpochSequence => _currentEpochSequence;
    public int EventCount => _retrySummaryEvents.Count + _currentEpochEvents.Count;

    public void ObserveEvent(in ArmstrongCableStrikeEventRecord missionEvent) {
        EnsureMutable();
        ValidateEvent(missionEvent);
        _lastEventSequence = missionEvent.Sequence;

        if (missionEvent.Kind
            == ArmstrongCableStrikeEventKind.ReconstructionEpochStarted) {
            if (_pendingRetrySummary is ArmstrongCableStrikeEventRecord retry)
                AddRetrySummary(retry);
            _pendingRetrySummary = null;
            _currentEpochSequence = missionEvent.ReconstructionEpochSequence;
            _preContactWriteIndex = 0;
            _preContactCount = 0;
            _postContact.Clear();
            _general.Clear();
            _currentEpochEvents.Clear();
            _currentEpochEvidenceIncomplete = false;
            _contactSeen = false;
            _currentEpochEvents.Add(missionEvent);
            return;
        }

        _currentEpochEvents.Add(missionEvent);
        if (missionEvent.Kind
            == ArmstrongCableStrikeEventKind.CheckpointRestoreRequested)
            _pendingRetrySummary = missionEvent;
        else if (missionEvent.Kind
            == ArmstrongCableStrikeEventKind.CableContact)
            _contactSeen = true;
    }

    public void ObserveTick(
        ArmstrongCableStrikeSnapshot snapshot,
        in ArmstrongCableStrikeObservation observation,
        in AirframeAerodynamicState effectiveAerodynamicConfiguration) {
        EnsureMutable();
        ArgumentNullException.ThrowIfNull(snapshot);
        ValidateSnapshotAndObservation(snapshot, observation);
        if (snapshot.ActiveEpochTicks == 0
            && snapshot.SimulationTick != observation.SimulationTick) {
            // The observation belongs to the failed epoch whose restore event was just recorded.
            // The settled snapshot is already the restored checkpoint; do not mix the failed pose
            // with the fresh epoch's identity.
            _lastObservedSourceTick = snapshot.LastSourceTick;
            return;
        }
        var sample = new ArmstrongNarrativeEvidenceSample(
            snapshot.ScenarioId,
            snapshot.ReconstructionEpochSequence,
            snapshot.LastSourceTick,
            snapshot.SimulationTick,
            snapshot.Phase,
            observation.PlayerPosition,
            observation.PlayerVelocity,
            observation.Carpenter.IsPresent
                ? observation.Carpenter.WorldPosition
                : Vec3D.Zero,
            observation.RollRateRadS,
            observation.PilotLateralInput,
            snapshot.VisibleDamage.ProfileId,
            snapshot.DamageEpistemic,
            effectiveAerodynamicConfiguration);
        _lastObservedSourceTick = snapshot.LastSourceTick;

        if (snapshot.ActiveEpochTicks % GeneralSampleIntervalTicks == 0) {
            if (_general.Count == GeneralSampleCapacity) {
                _general.RemoveAt(0);
                _currentEpochEvidenceIncomplete = true;
            }
            _general.Add(sample);
        }

        if (!_contactSeen) {
            _preContact[_preContactWriteIndex] = sample;
            _preContactWriteIndex =
                (_preContactWriteIndex + 1) % PreContactHighRateCapacity;
            _preContactCount = System.Math.Min(
                _preContactCount + 1, PreContactHighRateCapacity);
        } else if (_postContact.Count < PostContactHighRateCapacity) {
            _postContact.Add(sample);
        }
    }

    public ArmstrongNarrativeEvidenceSample[] ReadPreContactHighRateSamples() {
        var result = new ArmstrongNarrativeEvidenceSample[_preContactCount];
        int oldest = _preContactCount == PreContactHighRateCapacity
            ? _preContactWriteIndex
            : 0;
        for (int index = 0; index < _preContactCount; index++)
            result[index] = _preContact[
                (oldest + index) % PreContactHighRateCapacity];
        return result;
    }

    public ArmstrongCableStrikeEventRecord[] ReadEvents() => BuildAllEvents();

    public ArmstrongNarrativeEvidenceBundle Freeze(
        ArmstrongCableStrikeSnapshot completedSnapshot) {
        ArgumentNullException.ThrowIfNull(completedSnapshot);
        if (_frozen) return _frozenBundle!;
        if (!completedSnapshot.IsSliceComplete)
            throw new InvalidOperationException(
                "Narrative evidence freezes only at the completed southbound checkpoint.");
        if (!StringComparer.Ordinal.Equals(
                completedSnapshot.ScenarioId, _scenarioId)
            || completedSnapshot.ReconstructionEpochSequence
                != _currentEpochSequence)
            throw new InvalidOperationException(
                "The completed snapshot does not belong to this evidence epoch.");

        ArmstrongCableStrikeEventRecord[] completedEpochEvents =
            _currentEpochEvents.ToArray();
        ArmstrongCableStrikeEventRecord[] retrySummaryEvents =
            _retrySummaryEvents.ToArray();
        _frozenBundle = new ArmstrongNarrativeEvidenceBundle(
            _scenarioId,
            completedSnapshot.ReconstructionEpochSequence,
            completedSnapshot.RetryCount,
            completedSnapshot.DamageEpistemic,
            _currentEpochEvidenceIncomplete,
            _retrySummaryIncomplete,
            _droppedRetrySummaryCount,
            _general.Where(sample =>
                sample.ReconstructionEpochSequence
                    == completedSnapshot.ReconstructionEpochSequence).ToArray(),
            ReadPreContactHighRateSamples(),
            _postContact.ToArray(),
            BuildAllEvents(),
            completedEpochEvents,
            retrySummaryEvents);
        _frozen = true;
        return _frozenBundle;
    }

    void AddRetrySummary(in ArmstrongCableStrikeEventRecord retry) {
        if (_retrySummaryEvents.Count == RetrySummaryCapacity) {
            _retrySummaryEvents.RemoveAt(0);
            _retrySummaryIncomplete = true;
            _droppedRetrySummaryCount = checked(_droppedRetrySummaryCount + 1);
        }
        _retrySummaryEvents.Add(retry);
    }

    ArmstrongCableStrikeEventRecord[] BuildAllEvents() {
        var result = new ArmstrongCableStrikeEventRecord[
            _retrySummaryEvents.Count + _currentEpochEvents.Count];
        _retrySummaryEvents.CopyTo(result, 0);
        _currentEpochEvents.CopyTo(result, _retrySummaryEvents.Count);
        return result;
    }

    void ValidateEvent(in ArmstrongCableStrikeEventRecord missionEvent) {
        if (missionEvent.SchemaVersion != ArmstrongCableStrikeContract.SchemaVersion
            || !StringComparer.Ordinal.Equals(
                missionEvent.ScenarioId, _scenarioId))
            throw new InvalidOperationException(
                "Evidence event schema or scenario identity does not match the recorder.");
        if (missionEvent.Sequence <= 0
            || missionEvent.Sequence <= _lastEventSequence)
            throw new InvalidOperationException(
                "Evidence events must have globally monotonic positive identity.");
        if (missionEvent.ReconstructionEpochSequence <= 0
            || missionEvent.SourceTick < 0
            || missionEvent.SimulationTick < 0)
            throw new ArgumentOutOfRangeException(nameof(missionEvent));
        if (missionEvent.Kind
            == ArmstrongCableStrikeEventKind.ReconstructionEpochStarted) {
            if (missionEvent.Sequence != missionEvent.ReconstructionEpochSequence)
                throw new InvalidOperationException(
                    "A reconstruction epoch begins with its own event identity.");
        } else {
            ValidateCurrentEpoch(missionEvent.ReconstructionEpochSequence);
        }
    }

    void ValidateSnapshotAndObservation(
        ArmstrongCableStrikeSnapshot snapshot,
        in ArmstrongCableStrikeObservation observation) {
        if (!StringComparer.Ordinal.Equals(snapshot.ScenarioId, _scenarioId))
            throw new InvalidOperationException(
                "Evidence snapshot scenario identity does not match the recorder.");
        if (snapshot.VisibleDamage.IsPresent != snapshot.DamageEpistemic.HasValue)
            throw new InvalidOperationException(
                "Visible damage and its epistemic status must become public together.");
        ValidateCurrentEpoch(snapshot.ReconstructionEpochSequence);
        bool restoredThisTick = snapshot.ActiveEpochTicks == 0
            && snapshot.SimulationTick != observation.SimulationTick;
        if (snapshot.LastSourceTick != observation.SourceTick
            || (!restoredThisTick
                && snapshot.SimulationTick != observation.SimulationTick)
            || snapshot.LastSourceTick <= _lastObservedSourceTick)
            throw new InvalidOperationException(
                "Evidence observations must match a newly committed controller snapshot.");
    }

    void ValidateCurrentEpoch(long epochSequence) {
        if (_currentEpochSequence <= 0
            || epochSequence != _currentEpochSequence)
            throw new InvalidOperationException(
                "Evidence belongs to a stale or unknown reconstruction epoch.");
    }

    void EnsureMutable() {
        if (_frozen)
            throw new InvalidOperationException(
                "Frozen narrative evidence is immutable.");
    }
}
