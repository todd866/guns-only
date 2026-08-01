namespace GunsOnly.Sim.Korea;

/// <summary>
/// Versioned identities for the first executable Armstrong reconstruction slice. The JSON
/// narrative bundle remains an authoring artifact; these contracts are the typed runtime truth.
/// </summary>
public static class ArmstrongCableStrikeContract {
    public const int SchemaVersion = 1;
    public const string ScenarioId =
        "scenario.korea-1951.armstrong-cable-to-decision.greybox.v1";
    public const string AttackRunCheckpointId =
        "checkpoint.armstrong.attack-run.v1";
    public const string SouthboundCheckpointId =
        "checkpoint.armstrong.southbound.v1";
}

/// <summary>
/// The first risk slice deliberately begins at AttackRun and stops at the southbound checkpoint.
/// Later phases are not smuggled into this controller as timers or presentation state.
/// </summary>
public enum ArmstrongCableStrikePhase {
    Ready,
    AttackRun,
    CableCorridor,
    DamagedUnstable,
    DamagedStabilized,
    Inspection,
    Southbound
}

public enum ArmstrongCableStrikeEventKind {
    ReconstructionEpochStarted,
    CableCorridorEntered,
    CableContact,
    DamageCommitted,
    DamagedFlightStabilized,
    InspectionStarted,
    InspectionCompleted,
    NoLandingDecisionCommitted,
    SouthboundCheckpointReached,
    CheckpointRestoreRequested
}

public enum ArmstrongRetryReason {
    CableCorridorBypassed,
    CableAvoided,
    NonAuthoritativeContact,
    DamagedAircraftLost,
    ExternalReconstructionReset
}

public enum PantherAileronVisibleState {
    Intact,
    Partial,
    Absent
}

/// <summary>
/// A presentation-safe damage report. It contains only geometry and emissions that a player or
/// another aircraft could see. Aerodynamic coefficients and structural-health scalars are absent
/// by construction.
/// </summary>
public readonly record struct VisibleAirframeDamage {
    public VisibleAirframeDamage(
        string profileId,
        bool rightOuterWingAbsent,
        bool rightTipTankAbsent,
        PantherAileronVisibleState rightAileron,
        bool visibleFuelLeak,
        bool visibleSmoke,
        bool looseStructureVisible) {
        ArmstrongContractValidation.StableId(profileId, nameof(profileId));
        if (!Enum.IsDefined(rightAileron))
            throw new ArgumentOutOfRangeException(nameof(rightAileron));
        ProfileId = profileId;
        RightOuterWingAbsent = rightOuterWingAbsent;
        RightTipTankAbsent = rightTipTankAbsent;
        RightAileron = rightAileron;
        VisibleFuelLeak = visibleFuelLeak;
        VisibleSmoke = visibleSmoke;
        LooseStructureVisible = looseStructureVisible;
    }

    public string? ProfileId { get; }
    public bool RightOuterWingAbsent { get; }
    public bool RightTipTankAbsent { get; }
    public PantherAileronVisibleState RightAileron { get; }
    public bool VisibleFuelLeak { get; }
    public bool VisibleSmoke { get; }
    public bool LooseStructureVisible { get; }
    public bool IsPresent => ProfileId is not null;

    public static VisibleAirframeDamage None => default;
}

/// <summary>
/// Confirmation from the physical damage owner. A cable hit alone cannot advance history: the
/// independently composed damage state must report the same versioned profile identity.
/// </summary>
public readonly record struct ArmstrongDamageCommitObservation {
    public ArmstrongDamageCommitObservation(
        string profileId,
        in VisibleAirframeDamage visibleDamage) {
        ArmstrongContractValidation.StableId(profileId, nameof(profileId));
        if (!visibleDamage.IsPresent
            || !StringComparer.Ordinal.Equals(profileId, visibleDamage.ProfileId))
            throw new ArgumentException(
                "Visible and aerodynamic damage must share one profile identity.",
                nameof(visibleDamage));
        ProfileId = profileId;
        VisibleDamage = visibleDamage;
    }

    public string? ProfileId { get; }
    public VisibleAirframeDamage VisibleDamage { get; }
    public bool IsPresent => ProfileId is not null;
}

public enum ArmstrongRollMarginBand {
    NotAssessed,
    Adequate,
    Limited,
    LandingEnvelopeUnsafe
}

/// <summary>
/// One authority-tick observation. SourceTick is globally monotonic; SimulationTick may rewind
/// when a checkpoint starts a new reconstruction epoch.
/// </summary>
public readonly record struct ArmstrongCableStrikeObservation(
    long SourceTick,
    long SimulationTick,
    bool EnteredCableCorridor = false,
    bool ExitedCableCorridorWithoutContact = false,
    CableContactRecord? CableContact = null,
    ArmstrongDamageCommitObservation? DamageCommit = null,
    bool AircraftFlyable = true,
    double TerrainClearanceM = 1_000.0,
    double RollRateRadS = 0.0,
    double PilotLateralInput = 0.0,
    bool StabilizationEnvelopeSatisfied = false,
    bool SlowFlightProbeComplete = false,
    double RemainingRollAuthorityFraction = 1.0,
    CarpenterInspectionObservation Carpenter = default,
    Vec3D PlayerPosition = default,
    Vec3D PlayerVelocity = default,
    bool SouthboundGateReached = false);

/// <summary>
/// Sparse immutable event record delivered only after controller state commits. Optional physical
/// contact data appears after contact; it never forecasts collision timing.
/// </summary>
public readonly record struct ArmstrongCableStrikeEventRecord(
    int SchemaVersion,
    long Sequence,
    long SourceTick,
    long SimulationTick,
    long ReconstructionEpochSequence,
    ArmstrongCableStrikeEventKind Kind,
    ArmstrongCableStrikePhase Phase,
    string ScenarioId,
    string CheckpointId,
    CableContactRecord? Contact = null,
    VisibleAirframeDamage VisibleDamage = default,
    ArmstrongRetryReason? RetryReason = null);

/// <summary>
/// Observer-safe mission projection. It exposes what has happened and what is visibly true, not
/// undiscovered coefficients, future phase predicates, collision times, or required controls.
/// </summary>
public sealed record ArmstrongCableStrikeSnapshot(
    int SchemaVersion,
    string ScenarioId,
    ArmstrongCableStrikePhase Phase,
    string ObjectiveTextId,
    string CheckpointId,
    long ReconstructionEpochSequence,
    int RetryCount,
    long EpochBeginSourceTick,
    long LastSourceTick,
    long SimulationTick,
    long ActiveEpochTicks,
    long LatestEventSequence,
    bool CableContactObserved,
    VisibleAirframeDamage VisibleDamage,
    bool DamagedFlightStabilized,
    bool PersistentLateralDemandObserved,
    ArmstrongRollMarginBand RollMarginBand,
    DamageInspectionSnapshot Inspection,
    bool NoLandingDecisionCommitted,
    bool SouthboundCheckpointReached) {
    public bool IsSliceComplete => SouthboundCheckpointReached;
}

internal static class ArmstrongContractValidation {
    public static void StableId(string? value, string parameterName) {
        if (string.IsNullOrWhiteSpace(value)
            || value.Any(char.IsWhiteSpace)
            || value.Length > 160)
            throw new ArgumentException(
                "A non-empty, whitespace-free stable ID is required.", parameterName);
    }

    public static void Finite(double value, string parameterName) {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(parameterName);
    }

    public static void Finite(in Vec3D value, string parameterName) {
        if (!value.IsFinite)
            throw new ArgumentOutOfRangeException(parameterName);
    }
}
