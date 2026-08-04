using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra;

public enum CobraAiGunnerState
{
    AwaitingTarget,
    Acquiring,
    Tracking,
    Masked,
    OutOfLimits,
    Inhibited
}

public enum CobraAiGunnerReason
{
    None,
    NoTarget,
    TargetUnavailable,
    FriendlyTarget,
    TurretUnserviceable,
    Masked,
    OutOfLimits,
    Acquiring,
    ConsentReleased,
    WeaponsSafe,
    NoBallisticSolution,
    SightNotCoincident
}

/// <summary>
/// Explicit crew-behaviour values. Acquisition timing is a product/crew model, not an airframe
/// constant, so callers must supply it rather than inheriting an invented global default.
/// </summary>
public sealed record CobraAiGunnerDefinition(
    double AcquisitionSeconds,
    double ReacquisitionSeconds,
    double SightCoincidenceToleranceRad)
{
    public CobraAiGunnerDefinition Validate()
    {
        if (!double.IsFinite(AcquisitionSeconds) || AcquisitionSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(AcquisitionSeconds));
        if (!double.IsFinite(ReacquisitionSeconds) || ReacquisitionSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(ReacquisitionSeconds));
        if (!double.IsFinite(SightCoincidenceToleranceRad)
            || SightCoincidenceToleranceRad <= 0.0
            || SightCoincidenceToleranceRad >= Math.PI)
            throw new ArgumentOutOfRangeException(nameof(SightCoincidenceToleranceRad));
        return this;
    }
}

/// <summary>
/// Authoritative facts about the selected target as seen by the simulation. Camera padlock is
/// intentionally absent: V changes the pilot's view, not what the AI gunner can perceive or shoot.
/// </summary>
public readonly record struct CobraGunnerTargetObservation(
    string TargetId,
    bool Present,
    bool Friendly,
    bool HasLineOfSight,
    bool WithinTurretEnvelope,
    bool HasBallisticSolution,
    double SightErrorRad)
{
    internal void Validate()
    {
        if (string.IsNullOrWhiteSpace(TargetId))
            throw new ArgumentException("Target ID must be non-empty.", nameof(TargetId));
        if (!double.IsFinite(SightErrorRad) || SightErrorRad < 0.0)
            throw new ArgumentOutOfRangeException(nameof(SightErrorRad));
    }
}

public readonly record struct CobraAiGunnerInput(
    long AuthorityTick,
    string? SelectedTargetId,
    bool EngagementConsent,
    bool WeaponsArmed,
    bool TurretServiceable,
    CobraGunnerTargetObservation? SelectedTarget);

/// <summary>
/// A target-level directive. It contains no turret angles and no raw weapon trigger: the physical
/// mount and weapon authorities must independently consume this decision and remain authoritative.
/// </summary>
public readonly record struct CobraAiGunnerDecision(
    long AuthorityTick,
    CobraAiGunnerState State,
    CobraAiGunnerReason Reason,
    string? AssignedTargetId,
    bool TrackRequested,
    bool FireAuthorized,
    double QualifiedTrackSeconds);

/// <summary>
/// Deterministic front-seat copilot/gunner authority. Tab supplies the selected target; holding F
/// supplies engagement consent. This controller qualifies the selected authoritative observation
/// but never sees pointer input, camera padlock state, rendered scenery or wall-clock time. It is
/// an isolated quarantined contract and is not constructed by CobraMissionRuntime or the production
/// SimulationSession.
/// </summary>
public sealed class CobraAiGunner
{
    readonly CobraAiGunnerDefinition _definition;
    long _nextAuthorityTick;
    string? _assignedTargetId;
    double _qualifiedTrackSeconds;
    bool _requiresReacquisition;
    bool _trackEverQualified;

    public CobraAiGunner(CobraAiGunnerDefinition definition)
    {
        _definition = (definition
            ?? throw new ArgumentNullException(nameof(definition))).Validate();
    }

    public CobraAiGunnerDecision Advance(in CobraAiGunnerInput input)
    {
        Validate(input);

        string? selectedTargetId = Normalized(input.SelectedTargetId);
        if (!string.Equals(selectedTargetId, _assignedTargetId, StringComparison.Ordinal)) {
            _assignedTargetId = selectedTargetId;
            _qualifiedTrackSeconds = 0.0;
            _requiresReacquisition = false;
            _trackEverQualified = false;
        }

        CobraAiGunnerDecision decision = Decide(input, selectedTargetId);
        _nextAuthorityTick++;
        return decision;
    }

    CobraAiGunnerDecision Decide(in CobraAiGunnerInput input, string? selectedTargetId)
    {
        if (selectedTargetId is null) {
            ResetTrack(false);
            return Decision(input.AuthorityTick, CobraAiGunnerState.AwaitingTarget,
                CobraAiGunnerReason.NoTarget, false, false);
        }

        if (input.SelectedTarget is not { } target
            || !target.Present
            || !string.Equals(target.TargetId, selectedTargetId, StringComparison.Ordinal)) {
            ResetTrack(true);
            return Decision(input.AuthorityTick, CobraAiGunnerState.AwaitingTarget,
                CobraAiGunnerReason.TargetUnavailable, false, false);
        }

        if (target.Friendly) {
            ResetTrack(true);
            return Decision(input.AuthorityTick, CobraAiGunnerState.Inhibited,
                CobraAiGunnerReason.FriendlyTarget, false, false);
        }
        if (!input.TurretServiceable) {
            ResetTrack(true);
            return Decision(input.AuthorityTick, CobraAiGunnerState.Inhibited,
                CobraAiGunnerReason.TurretUnserviceable, false, false);
        }
        if (!target.HasLineOfSight) {
            ResetTrack(true);
            return Decision(input.AuthorityTick, CobraAiGunnerState.Masked,
                CobraAiGunnerReason.Masked, false, false);
        }
        if (!target.WithinTurretEnvelope) {
            ResetTrack(true);
            return Decision(input.AuthorityTick, CobraAiGunnerState.OutOfLimits,
                CobraAiGunnerReason.OutOfLimits, false, false);
        }

        double requiredSeconds = _requiresReacquisition
            ? _definition.ReacquisitionSeconds
            : _definition.AcquisitionSeconds;
        _qualifiedTrackSeconds += PlayerVehicleContract.FixedDeltaSeconds;
        if (_qualifiedTrackSeconds + 1e-12 < requiredSeconds) {
            return Decision(input.AuthorityTick, CobraAiGunnerState.Acquiring,
                CobraAiGunnerReason.Acquiring, true, false);
        }
        _requiresReacquisition = false;
        _trackEverQualified = true;

        CobraAiGunnerReason inhibit = FireInhibit(input, target);
        return Decision(input.AuthorityTick, CobraAiGunnerState.Tracking,
            inhibit, true, inhibit == CobraAiGunnerReason.None);
    }

    /// <summary>
    /// Physical and armament gates surface before consent: with the trigger untouched the crew must
    /// report why fire is impossible (no solution, safe weapons, sight still slewing) rather than a
    /// reassuring "awaiting consent" that a later gate would silently override.
    /// </summary>
    CobraAiGunnerReason FireInhibit(
        in CobraAiGunnerInput input,
        in CobraGunnerTargetObservation target)
    {
        if (!target.HasBallisticSolution) return CobraAiGunnerReason.NoBallisticSolution;
        if (!input.WeaponsArmed) return CobraAiGunnerReason.WeaponsSafe;
        if (target.SightErrorRad > _definition.SightCoincidenceToleranceRad)
            return CobraAiGunnerReason.SightNotCoincident;
        if (!input.EngagementConsent) return CobraAiGunnerReason.ConsentReleased;
        return CobraAiGunnerReason.None;
    }

    CobraAiGunnerDecision Decision(
        long authorityTick,
        CobraAiGunnerState state,
        CobraAiGunnerReason reason,
        bool trackRequested,
        bool fireAuthorized) => new(
            authorityTick,
            state,
            reason,
            _assignedTargetId,
            trackRequested,
            fireAuthorized,
            _qualifiedTrackSeconds);

    void ResetTrack(bool reacquire)
    {
        _qualifiedTrackSeconds = 0.0;
        _requiresReacquisition |= reacquire && _trackEverQualified;
    }

    void Validate(in CobraAiGunnerInput input)
    {
        if (input.AuthorityTick != _nextAuthorityTick)
            throw new InvalidOperationException(
                $"Expected Cobra gunner authority tick {_nextAuthorityTick}, "
                + $"received {input.AuthorityTick}.");
        if (input.AuthorityTick < 0)
            throw new ArgumentOutOfRangeException(nameof(input.AuthorityTick));
        if (input.SelectedTargetId is not null
            && string.IsNullOrWhiteSpace(input.SelectedTargetId))
            throw new ArgumentException(
                "Selected target ID must be null or non-empty.",
                nameof(input.SelectedTargetId));
        input.SelectedTarget?.Validate();
    }

    static string? Normalized(string? targetId) =>
        string.IsNullOrWhiteSpace(targetId) ? null : targetId;
}
