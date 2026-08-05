using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;
using GunsOnly.Web;
using System.Text.Json;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachGuidanceSessionTests {
    [Fact]
    public void RapierCircuitsPublishesGatesWithoutAProcSelection() {
        var session = new SimulationSession(beatIndex: 11);
        session.Begin();
        for (int i = 0; i < 30; i++) session.StepFixed();

        Assert.Equal(RecoveryProcedureKind.None, session.RecoveryProcedure.Kind);
        Assert.True(session.ApproachGuidancePlan.GuidanceActive,
            "circuits are recovery intent for the whole Active sortie");
        Assert.True(session.ApproachGuidancePlan.Valid);
        Assert.NotEmpty(session.ApproachGuidancePlan.Gates);

        using JsonDocument snapshot = JsonDocument.Parse(SnapshotProjection.BuildState(
            session, Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, null));
        JsonElement root = snapshot.RootElement;
        Assert.True(root.GetProperty("approach_guidance_active").GetBoolean());
        Assert.True(root.GetProperty("approach_valid").GetBoolean());
        Assert.False(string.IsNullOrWhiteSpace(
            root.GetProperty("approach_gates_json").GetString()));
        Assert.True(root.GetProperty("approach_next_alt_m").GetDouble() > 0.0);
    }

    [Fact]
    public void CombatDefaultDoesNotArmApproachGuidanceWithoutRecoveryIntent() {
        var session = new SimulationSession(beatIndex: 0);
        session.Begin();
        for (int i = 0; i < 30; i++) session.StepFixed();

        // No PROC, no RTB, no bingo pressure at the start of first-merge.
        if (session.PlayerRtbActive
            || session.PlayerFuel.IsBingo
            || session.PlayerFuel.IsMinimumFuel
            || session.PlayerFuel.IsEmergencyFuel) {
            return;
        }

        Assert.False(session.ApproachGuidancePlan.GuidanceActive);
        Assert.Empty(session.ApproachGuidancePlan.Gates);
    }

    [Fact]
    public async System.Threading.Tasks.Task ConcurrentColdSnapshotsKeepApproachStateBoundToTheirOwnSession() {
        var active = new SimulationSession(beatIndex: 11);
        active.Begin();
        active.StepFixed(30);
        Assert.True(active.ApproachGuidancePlan.GuidanceActive);

        var inactive = new SimulationSession(beatIndex: 0);
        inactive.Begin();
        inactive.StepFixed(30);
        Assert.False(inactive.ApproachGuidancePlan.GuidanceActive);

        var mismatches = new System.Collections.Concurrent.ConcurrentQueue<string>();
        using var start = new System.Threading.ManualResetEventSlim(false);

        System.Threading.Tasks.Task Project(
            SimulationSession session,
            bool expected,
            string label) => System.Threading.Tasks.Task.Run(() => {
                start.Wait();
                for (int iteration = 0; iteration < 40; iteration++) {
                    using JsonDocument snapshot = JsonDocument.Parse(
                        SnapshotProjection.BuildState(
                            session, Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, null));
                    bool actual = snapshot.RootElement
                        .GetProperty("approach_guidance_active")
                        .GetBoolean();
                    if (actual != expected)
                        mismatches.Enqueue($"{label}[{iteration}] expected {expected}, got {actual}");
                }
            });

        System.Threading.Tasks.Task activeProjection =
            Project(active, expected: true, "active");
        System.Threading.Tasks.Task inactiveProjection =
            Project(inactive, expected: false, "inactive");
        start.Set();
        await System.Threading.Tasks.Task.WhenAll(activeProjection, inactiveProjection);

        Assert.Empty(mismatches);
    }

    [Fact]
    public void ApproachSolvesAreDecimatedAndTheStateIsReusedBetweenSolves() {
        var session = new SimulationSession(beatIndex: 11);
        session.Begin();
        session.StepFixed(30);
        Assert.True(session.ApproachGuidancePlan.GuidanceActive);

        long solvesBefore = session.ApproachSolveCount;
        var gates = session.ApproachGuidancePlan.Gates;
        int gateListChanges = 0;
        for (int i = 0; i < 120; i++) {
            session.StepFixed();
            if (!ReferenceEquals(gates, session.ApproachGuidancePlan.Gates)) {
                gateListChanges++;
                gates = session.ApproachGuidancePlan.Gates;
            }
        }

        long solves = session.ApproachSolveCount - solvesBefore;
        Assert.InRange(solves, 1, 9);
        Assert.True(gateListChanges <= solves,
            $"published state must be reused between solves: {gateListChanges} changes"
            + $" for {solves} solves");
    }

    [Fact]
    public void RestagingClearsPriorApproachGuidanceBeforeTheFirstNewTick() {
        var session = new SimulationSession(beatIndex: 11);
        session.Begin();
        session.StepFixed(30);
        Assert.True(session.ApproachGuidancePlan.GuidanceActive);

        session.StartBeat(0);

        Assert.False(session.ApproachGuidancePlan.GuidanceActive);
        Assert.False(session.ApproachGuidancePlan.Valid);
        Assert.Empty(session.ApproachGuidancePlan.Gates);
    }
}
