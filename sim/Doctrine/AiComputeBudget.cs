namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Host-selected compute pressure for expensive opponent forecasts. Every level keeps the same
/// candidate manoeuvres, physical horizon, gun authority, terrain recovery and authoritative
/// 120 Hz flight step. Higher levels only bound how much forecast work may land in one tick and
/// integrate the throwaway forecast more coarsely.
/// </summary>
public enum AiComputeLevel {
    Full = 0,
    Balanced = 1,
    Constrained = 2,
    Emergency = 3
}

/// <summary>
/// Deterministic cumulative work counters. These describe performed work rather than elapsed
/// wall time, so regression tests remain stable across developer machines and CI runners.
/// TerrainSweeps counts speculative lookahead segment-clearance queries; it does not count the
/// terrain samples inside each query or the always-on tactical/recovery safety checks.
/// </summary>
public readonly record struct AiWorkloadCounters(
    long PlansStarted,
    long PlansCompleted,
    long CandidateEvaluations,
    long ForecastSteps,
    long TerrainSweeps) {
    public static AiWorkloadCounters operator +(
        AiWorkloadCounters left,
        AiWorkloadCounters right) =>
        new(
            left.PlansStarted + right.PlansStarted,
            left.PlansCompleted + right.PlansCompleted,
            left.CandidateEvaluations + right.CandidateEvaluations,
            left.ForecastSteps + right.ForecastSteps,
            left.TerrainSweeps + right.TerrainSweeps);

    public static AiWorkloadCounters operator -(
        AiWorkloadCounters left,
        AiWorkloadCounters right) =>
        new(
            left.PlansStarted - right.PlansStarted,
            left.PlansCompleted - right.PlansCompleted,
            left.CandidateEvaluations - right.CandidateEvaluations,
            left.ForecastSteps - right.ForecastSteps,
            left.TerrainSweeps - right.TerrainSweeps);
}

internal interface IAdaptiveAiPlanner {
    AiComputeLevel ComputeLevel { get; }
    AiWorkloadCounters AiWorkload { get; }
    void ConfigureAiPlanning(AiComputeLevel level, bool incremental);
}
