using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class RecoveryProcedureTests {
    [Fact]
    public void OverheadScheduleHasSevenGatesWithSheddingSpeed() {
        var gates = RecoveryProcedureDirector.BuildSchedule(
            RecoveryProcedureKind.Overhead, new Vec3D(0, 20, 0), 0.0);
        Assert.Equal(7, gates.Count);
        Assert.Equal("INITIAL", gates[1].Label);
        Assert.True(gates[^1].TargetKtas < gates[1].TargetKtas);
        Assert.True(gates[^1].DirtyConfig);
    }

    [Fact]
    public void StraightInRejectsWithoutFiniteHome_AndAdvancesOnGateOpen() {
        var director = new RecoveryProcedureDirector();
        Assert.False(director.TrySet(RecoveryProcedureKind.StraightIn, new Vec3D(double.NaN, 0, 0), 0.0));
        Assert.True(director.TrySet(RecoveryProcedureKind.StraightIn, new Vec3D(0, 20, 0), 0.0));
        RecoveryGate first = director.Gates[0];
        director.Step(new Vec3D(first.EastM, first.UpM, first.NorthM), first.TargetKtas, false, false);
        Assert.True(director.InVolume);
        Assert.True(director.EnergyOk);
        Assert.True(director.ConfigOk);
        Assert.Equal(1, director.ActiveIndex);
    }

    [Fact]
    public void NoneClearsGates() {
        var director = new RecoveryProcedureDirector();
        Assert.True(director.TrySet(RecoveryProcedureKind.DownwindRejoin, new Vec3D(0, 20, 0), 0.0));
        Assert.True(director.TrySet(RecoveryProcedureKind.None, new Vec3D(0, 20, 0), 0.0));
        Assert.Empty(director.Gates);
    }
}
