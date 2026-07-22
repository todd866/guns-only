namespace GunsOnly.Sim.Doctrine;

/// <summary>One already-computed maneuver candidate; telemetry never re-scores policy choices.</summary>
public readonly record struct BanditDecisionCandidate(
    int Id,
    PilotCommand Command,
    double Score,
    bool HasScore,
    bool Available);

/// <summary>Actor-visible recurrent state needed to interpret a maneuver selection.</summary>
public readonly record struct BanditPolicyMemory(
    BanditTactic Tactic,
    double EngagementSeconds,
    double DefendSecondsRemaining,
    double DefendCooldownSecondsRemaining,
    int JinkIndex,
    int BreakSign,
    int LookaheadTicksUntilSelection);

/// <summary>
/// Immutable trace emitted at the exact point a ReactiveBandit selects a new maneuver. Candidate
/// fields are fixed-size to keep capture allocation-free in the simulation kernel.
/// </summary>
public readonly record struct BanditDecisionTrace(
    long SelectionSequence,
    PilotSkill Skill,
    PilotCommand SelectedCommand,
    int SelectedCandidateIndex,
    int CandidateCount,
    BanditDecisionCandidate Candidate0,
    BanditDecisionCandidate Candidate1,
    BanditDecisionCandidate Candidate2,
    BanditDecisionCandidate Candidate3,
    BanditDecisionCandidate Candidate4,
    BanditDecisionCandidate Candidate5) {

    public const string SelectionMode = "deterministic";
    public const string TieBreakRule = "first-maximum-in-declared-order";

    public BanditDecisionCandidate CandidateAt(int index) => index switch {
        0 => Candidate0,
        1 => Candidate1,
        2 => Candidate2,
        3 => Candidate3,
        4 => Candidate4,
        5 => Candidate5,
        _ => throw new ArgumentOutOfRangeException(nameof(index))
    };
}

/// <summary>Optional trace surface for trainable policy-backed bandits.</summary>
public interface IBanditDecisionTraceSource {
    BanditDecisionTrace DecisionTrace { get; }
    BanditPolicyMemory PolicyMemory { get; }
    PilotCommand AppliedCommand { get; }
}
