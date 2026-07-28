namespace GunsOnly.Sim.Tests;

/// <summary>
/// Allocation counters are thread-local but runtime/diagnostic bookkeeping can be charged to a
/// measured test during a heavily parallel full-suite GC. Keep the planner allocation contracts
/// isolated from unrelated high-allocation simulation tests.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class PlannerAllocationSensitiveCollection {
    public const string Name = "planner-allocation-sensitive";
}
