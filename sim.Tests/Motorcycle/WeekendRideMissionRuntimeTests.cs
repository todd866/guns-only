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
    public void ValidSectorSequenceIncrementsLapCountAndResetsLapTimer()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();

        ScoreOneLap(runtime);

        Assert.Equal(1, runtime.LapCount);
        Assert.Equal(0.0, runtime.LapTimeSeconds);
    }

    [Fact]
    public void ResetToGridClearsCircuitQueryStateWithoutSpuriousLap()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();

        ScoreOneLap(runtime);
        Assert.Equal(1, runtime.LapCount);

        runtime.ResetToGrid();
        Assert.Equal(0, runtime.LapCount);
        Assert.Equal(0.0, runtime.LapTimeSeconds);

        runtime.StepFixed(SteadyThrottle);
        Assert.Equal(0, runtime.LapCount);
    }

    [Fact]
    public void LapTimerWaitsForActualMotion()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        var idle = SteadyThrottle with { Throttle = 0.0 };

        for (int i = 0; i < 120; i++)
            runtime.StepFixed(idle);
        Assert.Equal(0.0, runtime.LapTimeSeconds);

        for (int i = 0; i < 120; i++)
            runtime.StepFixed(SteadyThrottle);
        Assert.InRange(runtime.LapTimeSeconds, 0.2, 1.0);
    }

    [Fact]
    public void StepFixedAccumulatesOffTrackTimeWhenOffCircuit()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        // Ride off the painted circuit without demanding a tip-over: sourced launch torque
        // means a full-lock full-throttle launch now low-sides before leaving the paint.
        var steerOff = SteadyThrottle with {
            Throttle = 0.5,
            Steer = 0.5,
            RiderLateral = 0.5
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
    public void OffPavementContactStaysFiniteAndCanReturnToTheGrid()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        runtime.Bike.ResetTo(
            new Vec3D(
                0.0,
                RapierLaunchSite.OperatingSurfaceElevationM,
                PaintedCircuit.RapierRunwayWidthM),
            runtime.GridHeadingRad);

        for (int i = 0; i < 120 * 2; i++)
            runtime.StepFixed(SteadyThrottle);

        Assert.Equal("rapier-strip.grass", runtime.Bike.State.Contact.SurfaceId);
        Assert.False(runtime.IsOnTrack);
        Assert.True(runtime.Bike.State.PositionWorldM.IsFinite);
        Assert.True(runtime.Bike.State.GroundVelocityMps.IsFinite);
        Assert.True(double.IsFinite(runtime.Bike.Telemetry.SpeedMps));

        runtime.ResetToGrid();
        runtime.StepFixed(SteadyThrottle);

        Assert.Equal("rapier-strip.runway", runtime.Bike.State.Contact.SurfaceId);
        Assert.True(runtime.IsOnTrack);
        Assert.True(runtime.Bike.State.Flyable);
    }

    [Fact]
    public void GrassMeasurablyCutsDriveAuthorityComparedToPavement()
    {
        var paved = WeekendRideMissionRuntime.CreateDefault();
        var grass = WeekendRideMissionRuntime.CreateDefault();
        paved.Begin();
        grass.Begin();
        grass.Bike.ResetTo(
            new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 120.0),
            grass.GridHeadingRad);
        var fullThrottle = SteadyThrottle with { Throttle = 1.0 };

        for (int i = 0; i < 120 * 4; i++)
        {
            paved.StepFixed(fullThrottle);
            grass.StepFixed(fullThrottle);
        }

        Assert.Equal("rapier-strip.runway", paved.Bike.State.Contact.SurfaceId);
        Assert.Equal("rapier-strip.grass", grass.Bike.State.Contact.SurfaceId);
        Assert.False(grass.Bike.Telemetry.IsTippedOver);
        Assert.True(
            grass.Bike.Telemetry.SpeedMps < paved.Bike.Telemetry.SpeedMps * 0.6,
            $"grass {grass.Bike.Telemetry.SpeedMps:F1} m/s vs "
            + $"pavement {paved.Bike.Telemetry.SpeedMps:F1} m/s");
    }

    [Fact]
    public void HairpinApronsBeyondTheRunwayEdgeStayPaved()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        Vec3D apronPoint = runtime.Circuit.Centreline.First(point =>
            Math.Abs(point.Z) > PaintedCircuit.RapierRunwayWidthM * 0.5 + 5.0);
        runtime.Bike.ResetTo(apronPoint, runtime.GridHeadingRad);

        runtime.StepFixed(SteadyThrottle);

        Assert.Equal("rapier-strip.runway", runtime.Bike.State.Contact.SurfaceId);
        Assert.True(runtime.IsOnTrack);
    }

    [Fact]
    public void AssistedRiderCanCompleteAValidPaintedCircuitLap()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        IReadOnlyList<Vec3D> centreline = runtime.Circuit.Centreline;
        int uniquePointCount = centreline.Count - 1;
        int waypointIndex = 1;
        const int maximumTicks = 120 * 900;
        string? firstOffTrack = null;

        for (int tick = 0; tick < maximumTicks && runtime.LapCount == 0; tick++)
        {
            Vec3D position = runtime.Bike.State.PositionWorldM;
            int nearestForwardIndex = waypointIndex;
            double nearestForwardDistanceM = double.PositiveInfinity;
            for (int offset = 0; offset <= 40; offset++)
            {
                int candidate = (waypointIndex + offset) % uniquePointCount;
                double distanceM = HorizontalDistance(position, centreline[candidate]);
                if (distanceM < nearestForwardDistanceM)
                {
                    nearestForwardDistanceM = distanceM;
                    nearestForwardIndex = candidate;
                }
            }
            waypointIndex = nearestForwardIndex;
            while (HorizontalDistance(position, centreline[waypointIndex]) < 10.0)
                waypointIndex = (waypointIndex + 1) % uniquePointCount;
            Vec3D target = centreline[(waypointIndex + 10) % uniquePointCount];
            double desiredHeadingRad = Math.Atan2(
                target.X - position.X,
                target.Z - position.Z);
            double headingErrorRad = WrapPi(
                desiredHeadingRad - runtime.Bike.Observation.YawRad);
            double turn = Math.Clamp(headingErrorRad * 1.8, -1.0, 1.0);
            double previewHeadingA = SegmentHeading(
                centreline,
                (waypointIndex + 12) % uniquePointCount,
                uniquePointCount);
            double previewHeadingB = SegmentHeading(
                centreline,
                (waypointIndex + 40) % uniquePointCount,
                uniquePointCount);
            double previewTurnRad = Math.Abs(WrapPi(previewHeadingB - previewHeadingA));
            double targetSpeedMps = Math.Clamp(
                13.0
                    - Math.Abs(headingErrorRad) * 6.0
                    - previewTurnRad * 8.0,
                4.0,
                13.0);
            double speedMps = runtime.Bike.Telemetry.SpeedMps;
            double throttle = speedMps < targetSpeedMps ? 0.70 : 0.0;
            double brake = speedMps > targetSpeedMps + 1.0
                ? Math.Clamp((speedMps - targetSpeedMps) / 8.0, 0.0, 1.0)
                : 0.0;
            var intent = new MotorcycleRiderIntent(
                throttle,
                brake,
                turn,
                BodyLateralBias: 0.0,
                BodyForeAftBias: 0.0,
                GearShiftRequest: 0,
                Clutch: 1.0,
                MotorcycleClutchMode.Auto);
            double offTrackBefore = runtime.OffTrackSeconds;
            runtime.StepFixed(intent, MotorcycleControlMode.Assisted);
            if (firstOffTrack is null && runtime.OffTrackSeconds > offTrackBefore)
            {
                firstOffTrack = $"waypoint={waypointIndex}, position={position}, "
                    + $"speed={speedMps:F1}, headingError={headingErrorRad:F2}, "
                    + $"previewTurn={previewTurnRad:F2}";
            }
        }

        Assert.True(
            runtime.LapCount == 1,
            $"lap={runtime.LapCount}, waypoint={waypointIndex}/{uniquePointCount}, "
            + $"offTrack={runtime.OffTrackSeconds:F1}s, "
            + $"position={runtime.Bike.State.PositionWorldM}, "
            + $"target={centreline[waypointIndex]}, "
            + $"targetDistance={HorizontalDistance(runtime.Bike.State.PositionWorldM, centreline[waypointIndex]):F1}m, "
            + $"speed={runtime.Bike.Telemetry.SpeedMps:F1}m/s, "
            + $"tipped={runtime.Bike.Telemetry.IsTippedOver}, "
            + $"firstOffTrack={firstOffTrack}");
        Assert.True(runtime.Bike.State.Flyable);
        Assert.False(runtime.Bike.Telemetry.IsTippedOver);
        Assert.Null(firstOffTrack);
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

    static void ScoreOneLap(WeekendRideMissionRuntime runtime)
    {
        foreach (Vec3D point in runtime.Circuit.Centreline)
        {
            runtime.Bike.ResetTo(point, runtime.GridHeadingRad);
            runtime.StepFixed(SteadyThrottle);
        }
    }

    static double HorizontalDistance(Vec3D a, Vec3D b)
    {
        double dx = a.X - b.X;
        double dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    static double WrapPi(double angleRad) =>
        Math.Atan2(Math.Sin(angleRad), Math.Cos(angleRad));

    static double SegmentHeading(
        IReadOnlyList<Vec3D> centreline,
        int index,
        int uniquePointCount)
    {
        Vec3D start = centreline[index];
        Vec3D end = centreline[(index + 1) % uniquePointCount];
        return Math.Atan2(end.X - start.X, end.Z - start.Z);
    }
}
