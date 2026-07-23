namespace GunsOnly.Sim.Doctrine;

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
    int GcasActivations);
