namespace GunsOnly.Sim;

/// <summary>Where an exchange may obtain facts that were not spoken in that exchange.</summary>
public enum MissionRadioContextSource {
    None = 0,
    SharedChannel = 1,
    MissionDatalink = 2,
}

/// <summary>The observable aircraft action that closes an exchange without another transmission.</summary>
public enum MissionRadioImplicitAcknowledgment {
    None = 0,
    PatternBreakFlown = 1,
    RecoveryContinued = 2,
    ReturnInitiated = 3,
}

public enum MissionRadioExchangeStatus {
    Queued = 0,
    InProgress = 1,
    AwaitingAcknowledgment = 2,
    Complete = 3,
    Expired = 4,
    Preempted = 5,
    Suppressed = 6,
}

public enum MissionRadioDecisionKind {
    Queued = 0,
    Transmitted = 1,
    SuppressedDuplicate = 2,
    SuppressedMissingContext = 3,
    Expired = 4,
    Preempted = 5,
    QueueFull = 6,
    ImplicitAcknowledgment = 7,
    ExchangeCompleted = 8,
}

/// <summary>
/// Bounded diagnostic evidence for why the deterministic radio director spoke or stayed silent.
/// This is simulation truth for tests and telemetry; it is never another source of dialogue.
/// </summary>
public readonly record struct MissionRadioDecision(
    double TimeSeconds,
    MissionRadioDecisionKind Kind,
    string TransmissionId,
    string ExchangeId,
    string Reason);

/// <summary>
/// Runtime state for one exchange instance. Knowledge changes only when its corresponding
/// transmission actually keys, and explicit authority remains unconfirmed until its readback.
/// </summary>
public readonly record struct MissionRadioExchangeSnapshot(
    long Instance,
    string ContractId,
    MissionRadioChannel Channel,
    MissionRadioKnowledge Knowledge,
    MissionRadioKnowledge RequiredByClose,
    bool AuthorityAcknowledged,
    MissionRadioExchangeStatus Status,
    double UpdatedAtSeconds,
    string TerminalReason) {
    public string Id => $"{ContractId}#{Instance}";

    public bool KnowledgeClosed =>
        (RequiredByClose & ~Knowledge) == MissionRadioKnowledge.None;
}
