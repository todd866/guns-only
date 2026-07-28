namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Why an engagement report closed. Only an ordinary combat result is valid adaptive-learning
/// evidence; a player-requested handoff is retained for debrief/history but is deliberately
/// quarantined from the learner and fight director.
/// </summary>
public enum EngagementEndReason : byte {
    CombatResult = 0,
    PlayerHandoff = 1,
}

public readonly record struct EngagementReport(
    int EngagementNumber,
    PilotSkill OpponentSkill,
    bool OpponentWasBoss,
    SortieOutcome Outcome,
    double DurationSeconds,
    double SolutionSecondsConceded,
    int HitsTaken,
    int ShotsTotal,
    int ShotsInWindow,
    int Overshoots,
    double MinimumEnergyKias,
    int GcasActivations,
    EngagementEndReason EndReason = EngagementEndReason.CombatResult) {
    public bool EligibleForLearning =>
        EndReason == EngagementEndReason.CombatResult;
}
