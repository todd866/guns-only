using System.Collections.ObjectModel;

namespace GunsOnly.Sim;

/// <summary>
/// How a pilot action changes a maintained control. Momentary actions use <see cref="Perform"/>;
/// controls which must remain actuated use Begin and End records. The distinction is important for
/// procedures such as the F-86 emergency gear release, which must be pulled and held.
/// </summary>
public enum MaintenanceActionTransition { Perform, Begin, End }

/// <summary>A timestamped item in a presentation-independent maintenance test-flight trace.</summary>
public abstract record MaintenanceTestFlightRecord<TAction, TObservation>(
    long Sequence,
    double TimestampSeconds);

/// <summary>A pilot action, recorded independently of whether it produced the desired result.</summary>
public sealed record MaintenancePilotActionRecord<TAction, TObservation>(
    long Sequence,
    double TimestampSeconds,
    TAction Action,
    MaintenanceActionTransition Transition)
    : MaintenanceTestFlightRecord<TAction, TObservation>(Sequence, TimestampSeconds);

/// <summary>
/// A state observation available to the pilot or an explicitly requested external inspection.
/// Hidden scenario faults never belong in this type.
/// </summary>
public sealed record MaintenanceStateObservationRecord<TAction, TObservation>(
    long Sequence,
    double TimestampSeconds,
    TObservation Observation)
    : MaintenanceTestFlightRecord<TAction, TObservation>(Sequence, TimestampSeconds);

/// <summary>
/// Append-only trace for a maintenance test flight. Equal timestamps are allowed and insertion
/// order remains authoritative, so an observation immediately followed by a pilot action is fully
/// deterministic at a fixed simulation tick.
/// </summary>
public sealed class MaintenanceTestFlightLog<TAction, TObservation> {
    readonly List<MaintenanceTestFlightRecord<TAction, TObservation>> _records = new();
    readonly ReadOnlyCollection<MaintenanceTestFlightRecord<TAction, TObservation>> _view;
    double _lastTimestampSeconds;

    public MaintenanceTestFlightLog() => _view = _records.AsReadOnly();

    public IReadOnlyList<MaintenanceTestFlightRecord<TAction, TObservation>> Records => _view;

    public MaintenancePilotActionRecord<TAction, TObservation> RecordAction(
        double timestampSeconds,
        TAction action,
        MaintenanceActionTransition transition = MaintenanceActionTransition.Perform) {
        ValidateTimestamp(timestampSeconds);
        var record = new MaintenancePilotActionRecord<TAction, TObservation>(
            _records.Count, timestampSeconds, action, transition);
        _records.Add(record);
        _lastTimestampSeconds = timestampSeconds;
        return record;
    }

    public MaintenanceStateObservationRecord<TAction, TObservation> RecordObservation(
        double timestampSeconds,
        TObservation observation) {
        ValidateTimestamp(timestampSeconds);
        ArgumentNullException.ThrowIfNull(observation);
        var record = new MaintenanceStateObservationRecord<TAction, TObservation>(
            _records.Count, timestampSeconds, observation);
        _records.Add(record);
        _lastTimestampSeconds = timestampSeconds;
        return record;
    }

    void ValidateTimestamp(double timestampSeconds) {
        if (!double.IsFinite(timestampSeconds) || timestampSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(timestampSeconds));
        if (_records.Count > 0 && timestampSeconds < _lastTimestampSeconds)
            throw new ArgumentException("Maintenance trace timestamps must be monotonic.",
                nameof(timestampSeconds));
    }
}

/// <summary>
/// A deterministic, one-shot fault owned by scenario setup. The injected state is intentionally
/// write-only: procedure graders receive an observation trace, never this object or a system's
/// hidden failure collection.
/// </summary>
public sealed class HiddenMaintenanceFaultInjection<TSystem> where TSystem : class {
    readonly Action<TSystem> _inject;

    public string ScenarioKey { get; }
    public double TriggerTimeSeconds { get; }
    public bool HasTriggered { get; private set; }

    public HiddenMaintenanceFaultInjection(
        string scenarioKey,
        double triggerTimeSeconds,
        Action<TSystem> inject) {
        if (string.IsNullOrWhiteSpace(scenarioKey))
            throw new ArgumentException("A stable scenario key is required.", nameof(scenarioKey));
        if (!double.IsFinite(triggerTimeSeconds) || triggerTimeSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(triggerTimeSeconds));

        ScenarioKey = scenarioKey;
        TriggerTimeSeconds = triggerTimeSeconds;
        _inject = inject ?? throw new ArgumentNullException(nameof(inject));
    }

    /// <summary>Applies the hidden fault exactly once when simulation time reaches its trigger.</summary>
    public bool InjectIfDue(double simulationTimeSeconds, TSystem system) {
        if (!double.IsFinite(simulationTimeSeconds) || simulationTimeSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(simulationTimeSeconds));
        ArgumentNullException.ThrowIfNull(system);
        if (HasTriggered || simulationTimeSeconds < TriggerTimeSeconds) return false;

        _inject(system);
        HasTriggered = true;
        return true;
    }
}

/// <summary>A primary source carried with a procedure definition and exposed to debrief UIs.</summary>
public sealed record MaintenanceProcedureSource(
    string Title,
    string Section,
    string Uri);

/// <summary>A scored, observable condition in a procedure.</summary>
public sealed record MaintenanceProcedureGateDefinition(
    string Id,
    string PhaseId,
    string Label,
    int Points,
    IReadOnlyList<string> PrerequisiteGateIds);

/// <summary>An ordered group of gates suitable for a compact action-card presentation.</summary>
public sealed record MaintenanceProcedurePhaseDefinition(
    string Id,
    string Label,
    string PilotIntent);

/// <summary>Immutable, source-linked definition used by a deterministic procedure evaluator.</summary>
public sealed class MaintenanceProcedureDefinition {
    public string Id { get; }
    public string Title { get; }
    public IReadOnlyList<MaintenanceProcedureSource> Sources { get; }
    public IReadOnlyList<MaintenanceProcedurePhaseDefinition> Phases { get; }
    public IReadOnlyList<MaintenanceProcedureGateDefinition> Gates { get; }

    public MaintenanceProcedureDefinition(
        string id,
        string title,
        IEnumerable<MaintenanceProcedureSource> sources,
        IEnumerable<MaintenanceProcedurePhaseDefinition> phases,
        IEnumerable<MaintenanceProcedureGateDefinition> gates) {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("A stable procedure id is required.", nameof(id));
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("A procedure title is required.", nameof(title));

        Id = id;
        Title = title;
        Sources = Array.AsReadOnly(sources?.ToArray()
            ?? throw new ArgumentNullException(nameof(sources)));
        Phases = Array.AsReadOnly(phases?.ToArray()
            ?? throw new ArgumentNullException(nameof(phases)));
        Gates = Array.AsReadOnly(gates?.ToArray()
            ?? throw new ArgumentNullException(nameof(gates)));
        Validate();
    }

    void Validate() {
        if (Phases.Count == 0) throw new ArgumentException("At least one phase is required.");
        if (Gates.Count == 0) throw new ArgumentException("At least one gate is required.");

        var phaseIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var phase in Phases) {
            if (string.IsNullOrWhiteSpace(phase.Id) || !phaseIds.Add(phase.Id))
                throw new ArgumentException($"Duplicate or empty procedure phase '{phase.Id}'.");
        }

        var gateIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var gate in Gates) {
            if (string.IsNullOrWhiteSpace(gate.Id) || !gateIds.Add(gate.Id))
                throw new ArgumentException($"Duplicate or empty procedure gate '{gate.Id}'.");
            if (!phaseIds.Contains(gate.PhaseId))
                throw new ArgumentException($"Gate '{gate.Id}' names an unknown phase.");
            if (gate.Points < 0)
                throw new ArgumentOutOfRangeException(nameof(Gates), "Gate points cannot be negative.");
        }

        foreach (var gate in Gates)
            foreach (string prerequisite in gate.PrerequisiteGateIds)
                if (!gateIds.Contains(prerequisite))
                    throw new ArgumentException(
                        $"Gate '{gate.Id}' names unknown prerequisite '{prerequisite}'.");
    }
}

public enum MaintenanceGateStatus { Pending, Satisfied }
public enum MaintenancePhaseStatus { Locked, Available, InProgress, Complete }

public sealed record MaintenanceProcedureGateResult(
    MaintenanceProcedureGateDefinition Definition,
    MaintenanceGateStatus Status,
    double? SatisfiedAtSeconds);

public sealed record MaintenanceProcedurePhaseResult(
    MaintenanceProcedurePhaseDefinition Definition,
    MaintenancePhaseStatus Status);

/// <summary>A deduction caused by an observed pilot action and the evidence available at the time.</summary>
public sealed record MaintenanceProcedureDemerit(
    string Code,
    string Explanation,
    int Points,
    double TimestampSeconds);

/// <summary>Evidence-derived grade; completion and score are never selected by the scenario fault.</summary>
public sealed record MaintenanceProcedureEvaluation(
    MaintenanceProcedureDefinition Definition,
    IReadOnlyList<MaintenanceProcedurePhaseResult> Phases,
    IReadOnlyList<MaintenanceProcedureGateResult> Gates,
    IReadOnlyList<MaintenanceProcedureDemerit> Demerits,
    int Score,
    int MaximumScore,
    bool Complete) {
    public string? CurrentPhaseId => Phases
        .FirstOrDefault(phase => phase.Status is MaintenancePhaseStatus.Available
            or MaintenancePhaseStatus.InProgress)?.Definition.Id;
}

/// <summary>
/// Shared deterministic gate/score accumulator. Aircraft-specific evaluators decide whether a
/// trace satisfies a gate; this type enforces declared prerequisites and derives phase state.
/// </summary>
public sealed class MaintenanceProcedureGradeBuilder {
    readonly MaintenanceProcedureDefinition _definition;
    readonly Dictionary<string, double> _satisfiedAt = new(StringComparer.Ordinal);
    readonly List<MaintenanceProcedureDemerit> _demerits = new();

    public MaintenanceProcedureGradeBuilder(MaintenanceProcedureDefinition definition) =>
        _definition = definition ?? throw new ArgumentNullException(nameof(definition));

    public bool IsSatisfied(string gateId) => _satisfiedAt.ContainsKey(gateId);

    public bool TrySatisfy(string gateId, double timestampSeconds) {
        if (!double.IsFinite(timestampSeconds) || timestampSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(timestampSeconds));
        MaintenanceProcedureGateDefinition gate = FindGate(gateId);
        if (_satisfiedAt.ContainsKey(gateId)) return true;
        if (gate.PrerequisiteGateIds.Any(id => !_satisfiedAt.ContainsKey(id))) return false;
        _satisfiedAt.Add(gateId, timestampSeconds);
        return true;
    }

    public void AddDemerit(string code, string explanation, int points, double timestampSeconds) {
        if (string.IsNullOrWhiteSpace(code))
            throw new ArgumentException("A stable demerit code is required.", nameof(code));
        if (string.IsNullOrWhiteSpace(explanation))
            throw new ArgumentException("A demerit explanation is required.", nameof(explanation));
        if (points <= 0) throw new ArgumentOutOfRangeException(nameof(points));
        if (!double.IsFinite(timestampSeconds) || timestampSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(timestampSeconds));
        _demerits.Add(new MaintenanceProcedureDemerit(
            code, explanation, points, timestampSeconds));
    }

    public MaintenanceProcedureEvaluation Build() {
        var gateResults = _definition.Gates.Select(gate =>
            new MaintenanceProcedureGateResult(
                gate,
                _satisfiedAt.ContainsKey(gate.Id)
                    ? MaintenanceGateStatus.Satisfied
                    : MaintenanceGateStatus.Pending,
                _satisfiedAt.TryGetValue(gate.Id, out double timestamp)
                    ? timestamp
                    : null)).ToArray();

        bool priorPhasesComplete = true;
        var phaseResults = new List<MaintenanceProcedurePhaseResult>(_definition.Phases.Count);
        foreach (var phase in _definition.Phases) {
            MaintenanceProcedureGateResult[] phaseGates = gateResults
                .Where(gate => gate.Definition.PhaseId == phase.Id)
                .ToArray();
            bool complete = phaseGates.Length > 0
                && phaseGates.All(gate => gate.Status == MaintenanceGateStatus.Satisfied);
            bool started = phaseGates.Any(gate => gate.Status == MaintenanceGateStatus.Satisfied);
            MaintenancePhaseStatus status = complete
                ? MaintenancePhaseStatus.Complete
                : !priorPhasesComplete
                    ? MaintenancePhaseStatus.Locked
                    : started
                        ? MaintenancePhaseStatus.InProgress
                        : MaintenancePhaseStatus.Available;
            phaseResults.Add(new MaintenanceProcedurePhaseResult(phase, status));
            priorPhasesComplete &= complete;
        }

        int maximumScore = _definition.Gates.Sum(gate => gate.Points);
        int earned = gateResults
            .Where(gate => gate.Status == MaintenanceGateStatus.Satisfied)
            .Sum(gate => gate.Definition.Points);
        int score = Math.Clamp(earned - _demerits.Sum(demerit => demerit.Points),
            0, maximumScore);
        bool completeProcedure = gateResults.All(gate =>
            gate.Status == MaintenanceGateStatus.Satisfied);

        return new MaintenanceProcedureEvaluation(
            _definition,
            Array.AsReadOnly(phaseResults.ToArray()),
            Array.AsReadOnly(gateResults),
            Array.AsReadOnly(_demerits.ToArray()),
            score,
            maximumScore,
            completeProcedure);
    }

    MaintenanceProcedureGateDefinition FindGate(string gateId) =>
        _definition.Gates.FirstOrDefault(gate => gate.Id == gateId)
        ?? throw new ArgumentException($"Unknown procedure gate '{gateId}'.", nameof(gateId));
}
