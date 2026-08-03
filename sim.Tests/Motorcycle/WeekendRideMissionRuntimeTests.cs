using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class WeekendRideMissionRuntimeTests
{
    static MotorcyclePilotCommand SteadyThrottle =>
        new(0.35, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

    [Fact]
    public void CreateDefaultSpawnsOnGridNearEasternThreshold()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();

        Assert.Equal(WeekendRidePhase.Ready, runtime.Phase);
        Assert.Equal(runtime.Circuit.StartFinishCentre, runtime.GridPosition);
        Assert.Equal(runtime.GridPosition, runtime.Bike.State.PositionWorldM);
        Assert.True(runtime.GridPosition.X > 1_000.0,
            "StartFinishCentre sits at alongM=-1380, i.e. the eastern threshold.");
        Assert.InRange(
            runtime.GridPosition.Y,
            RapierLaunchSite.OperatingSurfaceElevationM - 0.01,
            RapierLaunchSite.OperatingSurfaceElevationM + 0.01);
        Assert.Equal(-Math.PI / 2.0, runtime.GridHeadingRad, precision: 6);
    }

    [Fact]
    public void BeginThenStepIsDeterministic()
    {
        var a = WeekendRideMissionRuntime.CreateDefault();
        var b = WeekendRideMissionRuntime.CreateDefault();
        a.Begin();
        b.Begin();
        var cmd = SteadyThrottle;
        for (int i = 0; i < 600; i++)
        {
            a.StepFixed(cmd);
            b.StepFixed(cmd);
        }

        Assert.Equal(a.Bike.State, b.Bike.State);
        Assert.Equal(a.Bike.Telemetry, b.Bike.Telemetry);
        Assert.Equal(a.LapCount, b.LapCount);
        Assert.Equal(a.OffTrackSeconds, b.OffTrackSeconds);
    }

    [Fact]
    public void TipOverResetReturnsToGrid()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        runtime.DebugForceTipOver();
        runtime.ResetToGrid();

        Assert.False(runtime.Bike.Telemetry.IsTippedOver);
        Assert.Equal(runtime.GridPosition, runtime.Bike.State.PositionWorldM);
        Assert.True(runtime.Bike.State.Flyable);
    }

    [Fact]
    public void TipOverAutoResetsOnNextStepFixed()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        runtime.DebugForceTipOver();
        Assert.True(runtime.Bike.Telemetry.IsTippedOver);

        runtime.StepFixed(SteadyThrottle);

        Assert.False(runtime.Bike.Telemetry.IsTippedOver);
        Assert.Equal(runtime.GridPosition, runtime.Bike.State.PositionWorldM);
        Assert.True(runtime.Bike.State.Flyable);
    }

    [Fact]
    public void CrossedStartFinishIncrementsLapCountAndResetsLapTimer()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        PaintedCircuit circuit = runtime.Circuit;
        (Vec3D beforeLine, Vec3D afterLine) = StartFinishCrossingProbePoints(circuit);
        runtime.Begin();

        for (int i = 0; i < 120; i++)
            runtime.StepFixed(SteadyThrottle);
        Assert.Equal(0, runtime.LapCount);
        Assert.InRange(runtime.LapTimeSeconds, 0.9, 1.1);

        runtime.Bike.ResetTo(beforeLine, runtime.GridHeadingRad);
        runtime.StepFixed(SteadyThrottle);
        runtime.Bike.ResetTo(afterLine, runtime.GridHeadingRad);
        runtime.StepFixed(SteadyThrottle);

        Assert.Equal(1, runtime.LapCount);
        Assert.Equal(0.0, runtime.LapTimeSeconds);
    }

    [Fact]
    public void ResetToGridClearsCircuitQueryStateWithoutSpuriousLap()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        (Vec3D beforeLine, Vec3D afterLine) = StartFinishCrossingProbePoints(runtime.Circuit);
        runtime.Begin();

        runtime.Bike.ResetTo(beforeLine, runtime.GridHeadingRad);
        runtime.StepFixed(SteadyThrottle);
        runtime.Bike.ResetTo(afterLine, runtime.GridHeadingRad);
        runtime.StepFixed(SteadyThrottle);
        Assert.Equal(1, runtime.LapCount);

        runtime.ResetToGrid();
        Assert.Equal(0, runtime.LapCount);
        Assert.Equal(0.0, runtime.LapTimeSeconds);

        runtime.StepFixed(SteadyThrottle);
        Assert.Equal(0, runtime.LapCount);
    }

    [Fact]
    public void StepFixedAccumulatesOffTrackTimeWhenOffCircuit()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        var steerOff = SteadyThrottle with {
            Throttle = 1.0,
            Steer = 1.0,
            RiderLateral = 1.0
        };

        for (int i = 0; i < 120 * 12; i++)
            runtime.StepFixed(steerOff);

        Assert.True(runtime.OffTrackSeconds > 0.0);
    }

    [Fact]
    public void PauseStopsSimulationUntilResume()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        runtime.StepFixed(SteadyThrottle);
        double speedAfterOneStep = runtime.Bike.Telemetry.SpeedMps;

        runtime.Pause();
        Assert.Equal(WeekendRidePhase.Paused, runtime.Phase);
        runtime.StepFixed(SteadyThrottle);
        Assert.Equal(speedAfterOneStep, runtime.Bike.Telemetry.SpeedMps);

        runtime.Resume();
        runtime.StepFixed(SteadyThrottle);
        Assert.NotEqual(speedAfterOneStep, runtime.Bike.Telemetry.SpeedMps);
    }

    [Fact]
    public void SnapshotIncludesLeanViewAndReflexFields()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        var turn = SteadyThrottle with { Steer = 0.8, RiderLateral = 0.6 };
        for (int i = 0; i < 120 * 8; i++)
            runtime.StepFixed(turn);

        WeekendRideSnapshot snap = runtime.Snapshot();

        Assert.Equal(runtime.Phase, snap.Phase);
        Assert.Equal(runtime.LapCount, snap.LapCount);
        Assert.Equal(runtime.OffTrackSeconds, snap.OffTrackSeconds);
        Assert.NotEqual(0.0, snap.LeanRad);
        Assert.True(Math.Abs(snap.ViewRollRad) < Math.Abs(snap.LeanRad));
        Assert.True(snap.ViewAttitude.IsFinite);
        Assert.InRange(snap.PitchReflexAuthority, 0.0, 1.0);
        Assert.InRange(snap.LeanHoldAuthority, 0.0, 1.0);
    }

    static (Vec3D BeforeLine, Vec3D AfterLine) StartFinishCrossingProbePoints(
        PaintedCircuit circuit)
    {
        int closingSegment = circuit.Centreline.Count - 2;
        return (
            Lerp(
                circuit.Centreline[closingSegment],
                circuit.Centreline[closingSegment + 1],
                0.92),
            Lerp(
                circuit.Centreline[0],
                circuit.Centreline[1],
                0.08));
    }

    static Vec3D Lerp(Vec3D a, Vec3D b, double t) =>
        new(
            a.X + (b.X - a.X) * t,
            a.Y + (b.Y - a.Y) * t,
            a.Z + (b.Z - a.Z) * t);
}
