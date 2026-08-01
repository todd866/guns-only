using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// The ladder must sequence. Recorded telemetry held 129,501 state rows in which
/// recovery_gate_active_index was 0 every single time and runway_recovery_phase_name never left
/// AIRBORNE -- a recovery nobody could complete because it never started.
public class RecoveryProcedureAdvanceTests {
    static RecoveryProcedureDirector StraightIn() {
        var procedure = new RecoveryProcedureDirector();
        Assert.True(procedure.TrySet(
            RecoveryProcedureKind.StraightIn, new Vec3D(0.0, 0.0, 0.0), 0.0));
        return procedure;
    }

    [Fact]
    public void PassingAGateBadlyStillSequencesAndIsReportedMissed() {
        RecoveryProcedureDirector procedure = StraightIn();
        RecoveryGate first = procedure.Gates[0];
        // Over the gate laterally, far too fast, wrong configuration. The old conjunction stalled
        // here permanently.
        var overhead = new Vec3D(first.EastM, first.UpM, first.NorthM);
        procedure.Step(overhead, first.TargetKtas + 250.0, false, false);

        Assert.True(procedure.ActiveIndex > 0, "a missed gate must not stall the ladder");
        Assert.True(procedure.LastGateMissed, "a sloppy pass must still be reported as missed");
    }

    [Fact]
    public void FlyingAGateWellSequencesWithoutBeingReportedMissed() {
        RecoveryProcedureDirector procedure = StraightIn();
        RecoveryGate first = procedure.Gates[0];
        var onProfile = new Vec3D(first.EastM, first.UpM, first.NorthM);
        procedure.Step(onProfile, first.TargetKtas, first.DirtyConfig, first.DirtyConfig);

        Assert.True(procedure.ActiveIndex > 0);
        Assert.False(procedure.LastGateMissed);
    }

    [Fact]
    public void TheLadderReachesItsFinalGate() {
        RecoveryProcedureDirector procedure = StraightIn();
        for (int guard = 0; guard < 200 && procedure.ActiveIndex < procedure.Gates.Count - 1; guard++) {
            RecoveryGate gate = procedure.Gates[procedure.ActiveIndex];
            procedure.Step(
                new Vec3D(gate.EastM, gate.UpM, gate.NorthM),
                gate.TargetKtas, gate.DirtyConfig, gate.DirtyConfig);
        }
        Assert.Equal(procedure.Gates.Count - 1, procedure.ActiveIndex);
    }

    [Fact]
    public void ArrivingHighDoesNotPreventSequencing() {
        RecoveryProcedureDirector procedure = StraightIn();
        RecoveryGate first = procedure.Gates[0];
        // 3 km above the gate: exactly the arrival an intercept produces.
        var high = new Vec3D(first.EastM, first.UpM + 3_000.0, first.NorthM);
        procedure.Step(high, first.TargetKtas, false, false);
        Assert.True(procedure.ActiveIndex > 0, "vertical error must be graded, not gating");
    }
}
