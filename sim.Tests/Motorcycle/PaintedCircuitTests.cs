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

        // Beyond the paint, and eventually beyond the runway rectangle, must read as grass.
        // The old 120 m extrapolation assumed a hairpin on the threshold; a club loop infield
        // of that threshold is still inside the 3,048 m rectangle at 120 m.
        Vec3D centroid = default;
        foreach (Vec3D point in points)
            centroid += point;
        centroid = new Vec3D(
            centroid.X / points.Count,
            centroid.Y / points.Count,
            centroid.Z / points.Count);
        Vec3D apex = points[0];
        foreach (Vec3D point in points)
            if (Horizontal(point, centroid) > Horizontal(apex, centroid))
                apex = point;
        Vec3D outward = apex - centroid;
        double outwardLength = Math.Max(1.0, Horizontal(apex, centroid));
        bool foundGrass = false;
        Vec3D grass = apex;
        for (double extraM = 40.0; extraM <= 4_000.0; extraM += 40.0)
        {
            grass = apex + outward * (extraM / outwardLength);
            if (!circuit.IsOnPavement(grass))
            {
                foundGrass = true;
                break;
            }
        }

        Assert.True(foundGrass, $"pavement never ended beyond {apex}");
        Assert.False(circuit.IsOnPavement(grass), $"expected grass at {grass}");
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
        // Club-circuit band. The old `> 1500` pin still accepted the 6 km runway oval.
        Assert.InRange(circuit.CircuitLengthM, 1_200.0, 2_600.0);
        Assert.InRange(circuit.TrackWidthM, 8.0, 20.0);
        Assert.Equal(circuit.Centreline[0], circuit.Centreline[^1]);
        Assert.True(circuit.SectorGateProgressM.Count >= 3);
    }

    [Fact]
    public void SectorGatesSitOnTheHairpinsNotOnEqualLengths()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        IReadOnlyList<double> gates = circuit.SectorGateProgressM;
        Assert.Equal(3, gates.Count);
        Assert.True(gates[0] > 0.05 && gates[0] < 0.45, $"first apex fraction {gates[0]:F3}");
        Assert.True(gates[1] > gates[0], "first-hairpin exit follows its apex");
        Assert.True(gates[2] > gates[1] && gates[2] < 0.98,
            $"gates {gates[0]:F3} {gates[1]:F3} {gates[2]:F3}");
        Assert.NotEqual(0.25, gates[0], 3);
        Assert.NotEqual(0.50, gates[1], 3);
        Assert.NotEqual(0.75, gates[2], 3);

        var state = new PaintedCircuitQueryState();
        var closed = new List<int>();
        foreach (Vec3D point in circuit.Centreline)
        {
            PaintedCircuitQueryResult sample = circuit.Query(point, ref state);
            if (sample.SectorCrossed >= 0)
                closed.Add(sample.SectorCrossed);
        }

        Assert.Equal(new[] { 0, 1, 2 }, closed);
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

    [Fact]
    public void FirstRealHeadingChangeIsAFewHundredMetresFromTheGrid()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        double distanceM = DistanceToHeadingChange(circuit, 0.4);

        Assert.InRange(distanceM, 120.0, 450.0);
        CircuitApexReference atGrid = circuit.NextApex(0.0);
        Assert.False(atGrid.ReportingExit);
        Assert.InRange(atGrid.DistanceM, 120.0, 500.0);
        Assert.InRange(atGrid.SteadySpeedMps, 12.0, 28.0);
        double slideLimitMps = Math.Sqrt(
            YzfR1Definition.TirePeakFrictionCoefficient * 9.80665 * atGrid.RadiusM);
        Assert.Equal(
            slideLimitMps * Math.Sqrt(PaintedCircuit.ApexFrictionUse),
            atGrid.SteadySpeedMps,
            precision: 6);
        Assert.True(
            atGrid.SteadySpeedMps < 40.0,
            "hairpin steady speed must sit well below a straight's terminal speed");
    }

    [Fact]
    public void InsideTheHairpinTheReferenceIsTheExitNotTheApexUnderTheBike()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        (int apexIndex, double radiusM) = TightestSample(circuit);
        Assert.True(radiusM < 50.0, $"expected a hairpin, tightest radius was {radiusM:F1} m");

        int unique = circuit.Centreline.Count - 1;
        int inside = (apexIndex + 8) % unique;
        PaintedCircuitQueryResult sample = circuit.Query(circuit.Centreline[inside]);
        CircuitApexReference atApex = circuit.NextApex(
            circuit.Query(circuit.Centreline[apexIndex]).ProgressM);
        CircuitApexReference insideCorner = circuit.NextApex(sample.ProgressM);

        Assert.True(insideCorner.ReportingExit);
        Assert.InRange(insideCorner.DistanceM, 5.0, 120.0);
        Assert.True(insideCorner.DistanceM < atApex.DistanceM);
    }

    static (int Index, double RadiusM) TightestSample(PaintedCircuit circuit)
    {
        IReadOnlyList<Vec3D> points = circuit.Centreline;
        int unique = points.Count - 1;
        double best = double.PositiveInfinity;
        int bestIndex = 0;
        for (int index = 0; index < unique; index++)
        {
            Vec3D b = points[index];
            Vec3D a = points[(index - 6 + unique) % unique];
            Vec3D c = points[(index + 6) % unique];
            double ab = Horizontal(a, b);
            double bc = Horizontal(b, c);
            double ca = Horizontal(c, a);
            double cross = (b.X - a.X) * (c.Z - a.Z) - (b.Z - a.Z) * (c.X - a.X);
            double areaTwice = Math.Abs(cross);
            if (areaTwice < 1e-6)
                continue;
            double radiusM = ab * bc * ca / (2.0 * areaTwice);
            if (radiusM < best)
            {
                best = radiusM;
                bestIndex = index;
            }
        }

        return (bestIndex, best);
    }

    static double DistanceToHeadingChange(PaintedCircuit circuit, double changeRad)
    {
        IReadOnlyList<Vec3D> points = circuit.Centreline;
        Vec3D initial = points[1] - points[0];
        double initialLength = Math.Sqrt(initial.X * initial.X + initial.Z * initial.Z);
        double travelledM = 0.0;
        for (int index = 1; index < points.Count - 1; index++)
        {
            Vec3D step = points[index] - points[index - 1];
            double stepLength = Math.Sqrt(step.X * step.X + step.Z * step.Z);
            travelledM += stepLength;
            Vec3D tangent = points[index + 1] - points[index];
            double tangentLength = Math.Sqrt(tangent.X * tangent.X + tangent.Z * tangent.Z);
            if (stepLength < 1e-6 || tangentLength < 1e-6 || initialLength < 1e-6)
                continue;
            double dot = (initial.X * tangent.X + initial.Z * tangent.Z)
                / (initialLength * tangentLength);
            if (Math.Acos(Math.Clamp(dot, -1.0, 1.0)) > changeRad)
                return travelledM;
        }

        return double.PositiveInfinity;
    }
}
