using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class PaintedCircuitTests
{
    [Fact]
    public void RapierStripCircuitStaysOnPavedSurfaceAtStripElevation()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.BoundingLengthM + circuit.TrackWidthM
            <= PaintedCircuit.RapierRunwayLengthM);
        foreach (var p in circuit.Centreline)
            Assert.InRange(p.Y, RapierLaunchSite.OperatingSurfaceElevationM - 0.01,
                RapierLaunchSite.OperatingSurfaceElevationM + 0.01);
        AssertCorridorIsPaved(circuit);
    }

    [Fact]
    public void PavementFollowsTheCircuitUnderHeadingAndOriginChange()
    {
        var circuit = PaintedCircuit.RapierStripWeekend(
            headingRad: 0.7,
            originOverride: new Vec3D(350.0, RapierLaunchSite.OperatingSurfaceElevationM, -900.0));

        AssertCorridorIsPaved(circuit);
    }

    static void AssertCorridorIsPaved(PaintedCircuit circuit)
    {
        IReadOnlyList<Vec3D> points = circuit.Centreline;
        int wrap = points.Count - 1;
        double corridorHalfWidthM = circuit.TrackWidthM * 0.5 + 2.0;
        for (int i = 0; i < wrap; i++)
        {
            Vec3D previous = points[(i - 1 + wrap) % wrap];
            Vec3D next = points[(i + 1) % wrap];
            double dx = next.X - previous.X;
            double dz = next.Z - previous.Z;
            double length = Math.Sqrt(dx * dx + dz * dz);
            if (length < 1e-9)
                continue;
            Vec3D normal = new(-dz / length, 0.0, dx / length);
            foreach (double side in (double[])[-1.0, 0.0, 1.0])
            {
                Vec3D sample = points[i] + normal * (side * corridorHalfWidthM);
                Assert.True(
                    circuit.IsOnPavement(sample),
                    $"corridor sample {sample} (index {i}, side {side}) left the pavement");
            }
        }

        // Far off the corridor and outside the runway rectangle must NOT read as paved.
        Vec3D apex = points[0];
        foreach (Vec3D point in points)
            if (Horizontal(point, points[0]) > Horizontal(apex, points[0]))
                apex = point;
        Vec3D away = apex + (apex - points[0]) * (120.0 / Math.Max(1.0, Horizontal(apex, points[0])));
        Assert.False(circuit.IsOnPavement(away), $"expected grass at {away}");
    }

    [Fact]
    public void EveryCornerIsRideableAtHairpinEntrySpeeds()
    {
        // A competent rider braking to ~55-60 km/h at ~0.6 g lateral needs r >= 28 m.
        var circuit = PaintedCircuit.RapierStripWeekend();
        (double minimumRadiusM, Vec3D tightestPoint) = MinimumCornerRadius(circuit);

        Assert.True(
            minimumRadiusM >= 28.0,
            $"tightest corner radius {minimumRadiusM:F1} m at {tightestPoint}");
    }

    static (double RadiusM, Vec3D At) MinimumCornerRadius(PaintedCircuit circuit)
    {
        // Discrete curvature over a fixed arc-length window so sample density
        // cannot hide a tight corner behind near-collinear neighbours.
        const double windowM = 6.0;
        IReadOnlyList<Vec3D> points = circuit.Centreline;
        double minimumRadiusM = double.PositiveInfinity;
        Vec3D tightestPoint = points[0];
        for (int i = 0; i < points.Count - 1; i++)
        {
            Vec3D b = points[i];
            Vec3D a = WalkBack(points, i, windowM);
            Vec3D c = WalkForward(points, i, windowM);
            double ab = Horizontal(a, b);
            double bc = Horizontal(b, c);
            double ca = Horizontal(c, a);
            double cross = (b.X - a.X) * (c.Z - a.Z) - (b.Z - a.Z) * (c.X - a.X);
            double areaTwice = Math.Abs(cross);
            if (areaTwice < 1e-9)
                continue;
            double radiusM = ab * bc * ca / (2.0 * areaTwice);
            if (radiusM < minimumRadiusM)
            {
                minimumRadiusM = radiusM;
                tightestPoint = b;
            }
        }
        return (minimumRadiusM, tightestPoint);
    }

    static Vec3D WalkBack(IReadOnlyList<Vec3D> points, int index, double distanceM)
    {
        int wrap = points.Count - 1;
        double travelled = 0.0;
        int i = index;
        while (travelled < distanceM)
        {
            int previous = (i - 1 + wrap) % wrap;
            travelled += Horizontal(points[i], points[previous]);
            i = previous;
        }
        return points[i];
    }

    static Vec3D WalkForward(IReadOnlyList<Vec3D> points, int index, double distanceM)
    {
        int wrap = points.Count - 1;
        double travelled = 0.0;
        int i = index;
        while (travelled < distanceM)
        {
            int next = (i + 1) % wrap;
            travelled += Horizontal(points[i], points[next]);
            i = next;
        }
        return points[i];
    }

    static double Horizontal(Vec3D a, Vec3D b)
    {
        double dx = a.X - b.X;
        double dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    [Fact]
    public void ClosedCircuitHasPositiveLengthAndTrackWidth()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.CircuitLengthM > 1500.0);
        Assert.InRange(circuit.TrackWidthM, 8.0, 20.0);
        Assert.Equal(circuit.Centreline[0], circuit.Centreline[^1]);
        Assert.True(circuit.SectorGateProgressM.Count >= 3);
    }

    [Fact]
    public void CentrelineIsSampledWithContinuousFiniteCurvature()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.Centreline.Count > 200);

        double maximumHeadingChangeRad = 0.0;
        for (int i = 1; i < circuit.Centreline.Count - 1; i++)
        {
            Vec3D before = circuit.Centreline[i] - circuit.Centreline[i - 1];
            Vec3D after = circuit.Centreline[i + 1] - circuit.Centreline[i];
            double beforeLength = Math.Sqrt(before.X * before.X + before.Z * before.Z);
            double afterLength = Math.Sqrt(after.X * after.X + after.Z * after.Z);
            Assert.InRange(beforeLength, 0.05, 15.0);
            Assert.InRange(afterLength, 0.05, 15.0);
            double dot = (before.X * after.X + before.Z * after.Z)
                / (beforeLength * afterLength);
            maximumHeadingChangeRad = Math.Max(
                maximumHeadingChangeRad,
                Math.Acos(Math.Clamp(dot, -1.0, 1.0)));
        }

        Assert.True(
            maximumHeadingChangeRad < 0.35,
            $"sample-to-sample heading changed {maximumHeadingChangeRad:F3} rad");
    }

    [Fact]
    public void QueryReportsOnTrackNearCentrelineAndOffTrackFarAway()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Vec3D onCentre = circuit.Centreline[circuit.Centreline.Count / 2];
        var onTrack = circuit.Query(onCentre);
        Assert.True(onTrack.OnTrack);
        Assert.InRange(onTrack.ProgressM, 0.0, circuit.CircuitLengthM);

        var offTrack = circuit.Query(onCentre + new Vec3D(0.0, 0.0, 80.0));
        Assert.False(offTrack.OnTrack);
    }

    [Fact]
    public void ForwardOnTrackSamplesThroughEverySectorIncrementLapIndex()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();

        PaintedCircuitQueryResult lapCross = default;
        foreach (Vec3D point in circuit.Centreline)
            lapCross = circuit.Query(point, ref state);

        Assert.True(lapCross.CrossedStartFinish);
        Assert.Equal(1, lapCross.LapIndex);
        Assert.Equal(1, state.LapIndex);
    }

    [Fact]
    public void JumpingAcrossStartFinishWithoutSectorsDoesNotCountALap()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();
        int closingSegment = circuit.Centreline.Count - 2;

        circuit.Query(circuit.Centreline[closingSegment], ref state);
        PaintedCircuitQueryResult jump = circuit.Query(circuit.Centreline[1], ref state);

        Assert.False(jump.CrossedStartFinish);
        Assert.Equal(0, jump.LapIndex);
    }

    [Fact]
    public void LeavingThePaintedCourseInvalidatesTheCurrentLap()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();
        PaintedCircuitQueryResult result = default;

        for (int index = 0; index < circuit.Centreline.Count; index++)
        {
            Vec3D point = circuit.Centreline[index];
            if (index == circuit.Centreline.Count / 2)
                point += new Vec3D(0.0, 0.0, 60.0);
            result = circuit.Query(point, ref state);
        }

        Assert.False(result.CrossedStartFinish);
        Assert.Equal(0, result.LapIndex);
    }

    [Fact]
    public void ReverseTraversalCannotArmSectorsOrCountALap()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();
        PaintedCircuitQueryResult result = circuit.Query(circuit.Centreline[0], ref state);

        for (int index = circuit.Centreline.Count - 2; index >= 0; index--)
            result = circuit.Query(circuit.Centreline[index], ref state);

        Assert.False(result.CrossedStartFinish);
        Assert.Equal(0, result.LapIndex);
        Assert.Equal(0, state.NextSectorIndex);
    }
}
