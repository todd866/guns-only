using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public sealed class BfmContactOrderingTests {
    [Fact]
    public void TerrainContactOnDefensiveCompletionTickFailsAndRepeatsLesson() {
        // Fly the real break once to locate its first qualifying tick, then replay identical
        // controls with a ridge crossing on that tick. No observer/progression fields are set.
        var control = BfmFlightAcceptanceTests.Start(1);
        int tick = 0;
        AircraftState before = control.Player.State;
        while (control.BfmLessonOutcome != "passed" && tick < 20 * AircraftSim.TickHz) {
            before = control.Player.State;
            BfmFlightAcceptanceTests.Break(control, tick / (double)AircraftSim.TickHz, 0);
            control.StepFixed();
            tick++;
        }
        Assert.Equal("passed", control.BfmLessonOutcome);
        Assert.Equal(2, control.BfmNextLessonIndex);
        var after = control.Player.State;
        var replay = BfmFlightAcceptanceTests.Start(1);
        for (int i = 0; i < tick - 1; i++) {
            BfmFlightAcceptanceTests.Break(replay, i / (double)AircraftSim.TickHz, 0);
            replay.StepFixed();
        }
        Assert.Equal(before.Position, replay.Player.State.Position);
        Assert.Equal("open", replay.BfmLessonOutcome);
        var ridge = new CompletionRidge(before.Position, after.Position);
        replay.SetTerrainSurface(ridge);
        Assert.True(ridge.TrySample(before.Position.X, before.Position.Z, out var oldGround));
        Assert.True(before.Position.Y > oldGround.HeightM);
        BfmFlightAcceptanceTests.Break(replay, (tick - 1) / (double)AircraftSim.TickHz, 0);
        replay.StepFixed();
        Assert.NotEqual(AircraftTerminalState.Flying, replay.PlayerTerminalState);
        Assert.Equal("failed", replay.BfmLessonOutcome);
        Assert.Equal(1, replay.BfmNextLessonIndex);
        Assert.False(replay.FiniteCombatComplete);
        Assert.DoesNotContain(replay.EngagementReports,
            r => r.EndReason == Doctrine.EngagementEndReason.DefensiveSuccess);
        Assert.Equal(SortieOutcome.Defeat, Assert.Single(replay.EngagementReports).Outcome);
        replay.Restart();
        Assert.Equal("D1", replay.BfmLessonId);
    }

    sealed class CompletionRidge(Vec3D before, Vec3D after) : ITerrainSurface {
        public TerrainBounds Bounds => new(-1e7, 1e7, -1e7, 1e7);
        public double HorizontalResolutionM => 0.1;
        public double MaximumHeightM => after.Y + 20;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            double crossed = (eastM - (before.X + after.X) / 2) * (after.X - before.X)
                + (northM - (before.Z + after.Z) / 2) * (after.Z - before.Z);
            sample = new(crossed >= 0 ? MaximumHeightM : 0, new Vec3D(0, 1, 0));
            return true;
        }
    }
}
