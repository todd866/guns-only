namespace GunsOnly.Sim.Motorcycle;

public readonly record struct PaintedCircuitQueryResult(
    bool OnTrack,
    double ProgressM,
    int LapIndex,
    bool CrossedStartFinish,
    int SectorCrossed);

public struct PaintedCircuitQueryState
{
    public double LastProgressM;
    public int LapIndex;
    public int NextSectorIndex;
    public bool HasSample;
    public bool LastOnTrack;
    public bool LapValid;
}

/// <summary>
/// Renderer-neutral closed-circuit authority. The sampled centreline owns lap/sector progress,
/// while track width and paved-runoff width independently own scoring and surface grip.
/// </summary>
public sealed class PaintedCircuit
{
    public const string WeekendTrackDayCircuitId = "weekend-track-day.closed-circuit.v1";
    public const double WeekendTrackSurfaceElevationM = 68.0;
    public const double WeekendTrackWidthM = 18.0;
    /// <summary>Nine-metre road half-width plus thirteen metres of paved runoff.</summary>
    public const double WeekendPavementHalfWidthM = 22.0;
    const double CornerBlendDistanceM = 52.0;
    const double MaximumSampleSpacingM = 10.0;
    const double MaximumContinuousAdvanceM = 20.0;

    readonly Vec3D[] _centreline;
    readonly double[] _segmentLengthM;
    readonly double[] _cumulativeLengthM;
    readonly double[] _sectorGateProgressM;

    PaintedCircuit(
        string id,
        Vec3D[] centreline,
        double trackWidthM,
        double pavementHalfWidthM,
        double surfaceElevationM,
        double boundingLengthM,
        double boundingWidthM,
        Vec3D startFinishCentre,
        double startHeadingRad,
        Vec3D paddockAccessPointWorldM,
        double paddockAccessHeadingRad,
        int startFinishSegmentIndex,
        double[] sectorGateProgressM)
    {
        Id = id;
        _centreline = centreline;
        TrackWidthM = trackWidthM;
        PavementHalfWidthM = pavementHalfWidthM;
        SurfaceElevationM = surfaceElevationM;
        BoundingLengthM = boundingLengthM;
        BoundingWidthM = boundingWidthM;
        StartFinishCentre = startFinishCentre;
        StartHeadingRad = startHeadingRad;
        PaddockAccessPointWorldM = paddockAccessPointWorldM;
        PaddockAccessHeadingRad = paddockAccessHeadingRad;
        StartFinishSegmentIndex = startFinishSegmentIndex;
        _sectorGateProgressM = sectorGateProgressM;
        SectorGateProgressM = sectorGateProgressM;

        _segmentLengthM = new double[centreline.Length - 1];
        _cumulativeLengthM = new double[centreline.Length];
        double totalLengthM = 0.0;
        for (int i = 0; i < _segmentLengthM.Length; i++)
        {
            double segmentLengthM = HorizontalDistance(centreline[i], centreline[i + 1]);
            _segmentLengthM[i] = segmentLengthM;
            totalLengthM += segmentLengthM;
            _cumulativeLengthM[i + 1] = totalLengthM;
        }

        CircuitLengthM = totalLengthM;
    }

    public string Id { get; }
    public IReadOnlyList<Vec3D> Centreline => _centreline;
    public double TrackWidthM { get; }
    public double PavementHalfWidthM { get; }
    public double SurfaceElevationM { get; }
    public double CircuitLengthM { get; }
    public double BoundingLengthM { get; }
    public double BoundingWidthM { get; }
    public Vec3D StartFinishCentre { get; }
    public double StartHeadingRad { get; }
    public Vec3D PaddockAccessPointWorldM { get; }
    public double PaddockAccessHeadingRad { get; }
    public int StartFinishSegmentIndex { get; }
    public IReadOnlyList<double> SectorGateProgressM { get; }

    /// <summary>
    /// Purpose-built club circuit for Weekend Track Day: a long start straight, a broad first
    /// complex, a direction-changing infield, and a separate return loop. It shares no runway,
    /// launch-site, carrier, or renderer geometry.
    /// </summary>
    public static PaintedCircuit WeekendTrackDay(
        double headingRad = 0.0,
        Vec3D? originOverride = null)
    {
        Vec3D forward = TrackForward(headingRad);
        Vec3D right = TrackRight(headingRad);
        Vec3D origin = originOverride
            ?? new Vec3D(0.0, WeekendTrackSurfaceElevationM, 0.0);

        // Local east/north coordinates keep the authored shape readable. headingRad rotates the
        // entire facility around its own origin without changing length, curvature, or pavement.
        Vec3D At(double eastM, double northM) =>
            origin + right * eastM + forward * northM;

        Vec3D[] controlPoints =
        [
            // Start/finish lies in the middle of a 700 m straight, not at a corner seam.
            At(0.0, -320.0),
            At(350.0, -320.0),
            At(590.0, -220.0),
            At(720.0, -40.0),
            At(680.0, 160.0),
            At(520.0, 310.0),
            At(300.0, 390.0),
            // Direction-changing infield: two broad, visibly distinct bends.
            At(80.0, 310.0),
            At(-140.0, 430.0),
            At(-400.0, 400.0),
            At(-620.0, 280.0),
            At(-730.0, 80.0),
            At(-680.0, -120.0),
            At(-500.0, -250.0),
            At(-300.0, -320.0),
            At(0.0, -320.0),
        ];
        Vec3D[] centreline = BuildRoundedCentreline(controlPoints);

        double minAlongM = double.PositiveInfinity;
        double maxAlongM = double.NegativeInfinity;
        double minCrossM = double.PositiveInfinity;
        double maxCrossM = double.NegativeInfinity;
        foreach (Vec3D point in centreline)
        {
            double alongM = ProjectAlongTrack(origin, forward, point);
            double crossM = ProjectCrossTrack(origin, right, point);
            minAlongM = Math.Min(minAlongM, alongM);
            maxAlongM = Math.Max(maxAlongM, alongM);
            minCrossM = Math.Min(minCrossM, crossM);
            maxCrossM = Math.Max(maxCrossM, crossM);
        }

        double boundingLengthM = maxAlongM - minAlongM;
        double boundingWidthM = maxCrossM - minCrossM;
        int startFinishSegmentIndex = centreline.Length - 2;
        Vec3D startFinishCentre = centreline[0];
        Vec3D startDirection = HorizontalDirection(centreline[1] - centreline[0]);
        double startHeadingRad = Math.Atan2(startDirection.X, startDirection.Z);
        // The access-road centre starts just outside the circuit pavement, but its five-metre
        // road half-width overlaps the 22 m runoff ribbon so grip has no grass seam. It is offset
        // from start/finish along the straight and cannot be mistaken for the timing line.
        Vec3D paddockOutward = new(startDirection.Z, 0.0, -startDirection.X);
        Vec3D paddockAccessPoint = startFinishCentre
            - startDirection * 80.0
            + paddockOutward * (WeekendPavementHalfWidthM + 3.0);
        double paddockAccessHeadingRad = Math.Atan2(paddockOutward.X, paddockOutward.Z);
        double[] sectorGateProgressM = [0.25, 0.50, 0.75];

        return new PaintedCircuit(
            WeekendTrackDayCircuitId,
            centreline,
            WeekendTrackWidthM,
            WeekendPavementHalfWidthM,
            origin.Y,
            boundingLengthM,
            boundingWidthM,
            startFinishCentre,
            startHeadingRad,
            paddockAccessPoint,
            paddockAccessHeadingRad,
            startFinishSegmentIndex,
            sectorGateProgressM);
    }

    /// <summary>
    /// Authoritative paved-surface test. Only the purpose-built track and its paved runoff carry
    /// asphalt grip; the infield and land outside the ribbon remain off-pavement.
    /// </summary>
    public bool IsOnPavement(Vec3D positionWorld) =>
        FindClosestSegment(positionWorld).LateralDistanceM <= PavementHalfWidthM;

    static Vec3D[] BuildRoundedCentreline(IReadOnlyList<Vec3D> closedControlPoints)
    {
        int uniqueCount = closedControlPoints.Count - 1;
        if (uniqueCount < 3 || closedControlPoints[0] != closedControlPoints[^1])
            throw new ArgumentException("Circuit control points must form a closed loop.");

        var entries = new Vec3D[uniqueCount];
        var exits = new Vec3D[uniqueCount];
        for (int index = 0; index < uniqueCount; index++)
        {
            Vec3D previous = closedControlPoints[(index - 1 + uniqueCount) % uniqueCount];
            Vec3D current = closedControlPoints[index];
            Vec3D next = closedControlPoints[(index + 1) % uniqueCount];
            Vec3D incoming = current - previous;
            Vec3D outgoing = next - current;
            double incomingLengthM = HorizontalLength(incoming);
            double outgoingLengthM = HorizontalLength(outgoing);
            double blendM = Math.Min(
                CornerBlendDistanceM,
                Math.Min(incomingLengthM, outgoingLengthM) * 0.35);
            Vec3D incomingDirection = HorizontalDirection(incoming);
            Vec3D outgoingDirection = HorizontalDirection(outgoing);
            entries[index] = current - incomingDirection * blendM;
            exits[index] = current + outgoingDirection * blendM;
        }

        var sampled = new List<Vec3D> { exits[0] };
        for (int index = 1; index < uniqueCount; index++)
        {
            AppendLineSamples(sampled, sampled[^1], entries[index]);
            AppendQuadraticCorner(
                sampled,
                entries[index],
                closedControlPoints[index],
                exits[index]);
        }
        AppendLineSamples(sampled, sampled[^1], entries[0]);
        AppendQuadraticCorner(sampled, entries[0], closedControlPoints[0], exits[0]);
        return sampled.ToArray();
    }

    static void AppendLineSamples(List<Vec3D> sampled, Vec3D start, Vec3D end)
    {
        double lengthM = HorizontalDistance(start, end);
        int segmentCount = Math.Max(1, (int)Math.Ceiling(lengthM / MaximumSampleSpacingM));
        for (int segment = 1; segment <= segmentCount; segment++)
            sampled.Add(Lerp(start, end, (double)segment / segmentCount));
    }

    static void AppendQuadraticCorner(
        List<Vec3D> sampled,
        Vec3D entry,
        Vec3D corner,
        Vec3D exit)
    {
        double controlLengthM = HorizontalDistance(entry, corner)
            + HorizontalDistance(corner, exit);
        int segmentCount = Math.Max(
            24,
            (int)Math.Ceiling(controlLengthM / MaximumSampleSpacingM));
        for (int segment = 1; segment <= segmentCount; segment++)
        {
            double t = (double)segment / segmentCount;
            double oneMinusT = 1.0 - t;
            sampled.Add(
                entry * (oneMinusT * oneMinusT)
                + corner * (2.0 * oneMinusT * t)
                + exit * (t * t));
        }
    }

    public PaintedCircuitQueryResult Query(Vec3D positionWorld)
    {
        ClosestSegmentSample closest = FindClosestSegment(positionWorld);
        return new PaintedCircuitQueryResult(
            closest.LateralDistanceM <= TrackWidthM * 0.5,
            closest.ProgressM,
            LapIndex: 0,
            CrossedStartFinish: false,
            SectorCrossed: -1);
    }

    public PaintedCircuitQueryResult Query(
        Vec3D positionWorld,
        ref PaintedCircuitQueryState state)
    {
        ClosestSegmentSample closest = FindClosestSegment(positionWorld);
        bool onTrack = closest.LateralDistanceM <= TrackWidthM * 0.5;
        double progressM = closest.ProgressM;

        bool crossedStartFinish = false;
        int sectorCrossed = -1;
        int lapIndex = state.LapIndex;

        if (!state.HasSample)
        {
            state.LastProgressM = progressM;
            state.LastOnTrack = onTrack;
            state.LapValid = onTrack;
            state.HasSample = true;
            return new PaintedCircuitQueryResult(
                onTrack,
                progressM,
                lapIndex,
                CrossedStartFinish: false,
                SectorCrossed: -1);
        }

        double rawProgressDeltaM = progressM - state.LastProgressM;
        bool wrappedForward = state.LastProgressM > CircuitLengthM * 0.5
            && progressM < CircuitLengthM * 0.5;
        double forwardAdvanceM = wrappedForward
            ? rawProgressDeltaM + CircuitLengthM
            : rawProgressDeltaM;
        bool stationary = Math.Abs(rawProgressDeltaM) <= 1e-6;
        bool continuousForward = forwardAdvanceM > 1e-6
            && forwardAdvanceM <= MaximumContinuousAdvanceM;
        if (!onTrack || !state.LastOnTrack || (!stationary && !continuousForward))
            state.LapValid = false;

        if (continuousForward && onTrack && state.LastOnTrack)
        {
            if (wrappedForward)
            {
                crossedStartFinish = state.LapValid
                    && state.NextSectorIndex >= _sectorGateProgressM.Length;
                if (crossedStartFinish)
                    lapIndex++;
                state.NextSectorIndex = 0;
                state.LapValid = true;
            }
            else if (state.LapValid
                && state.NextSectorIndex < _sectorGateProgressM.Length)
            {
                double gateProgressM =
                    _sectorGateProgressM[state.NextSectorIndex] * CircuitLengthM;
                if (CrossedForward(state.LastProgressM, progressM, gateProgressM))
                {
                    sectorCrossed = state.NextSectorIndex;
                    state.NextSectorIndex++;
                }
            }
        }

        state.LastProgressM = progressM;
        state.LapIndex = lapIndex;
        state.LastOnTrack = onTrack;

        return new PaintedCircuitQueryResult(
            onTrack,
            progressM,
            lapIndex,
            crossedStartFinish,
            sectorCrossed);
    }

    ClosestSegmentSample FindClosestSegment(Vec3D positionWorld)
    {
        double bestLateralDistanceM = double.PositiveInfinity;
        double bestProgressM = 0.0;

        for (int segmentIndex = 0; segmentIndex < _segmentLengthM.Length; segmentIndex++)
        {
            Vec3D start = _centreline[segmentIndex];
            Vec3D end = _centreline[segmentIndex + 1];
            Vec3D segment = end - start;
            double segmentLengthSquared = segment.X * segment.X + segment.Z * segment.Z;
            if (segmentLengthSquared < 1e-8)
                continue;

            double parameter = Math.Clamp(
                ((positionWorld.X - start.X) * segment.X
                    + (positionWorld.Z - start.Z) * segment.Z) / segmentLengthSquared,
                0.0,
                1.0);
            Vec3D closestPoint = start + segment * parameter;
            double lateralDistanceM = HorizontalDistance(positionWorld, closestPoint);
            if (lateralDistanceM >= bestLateralDistanceM)
                continue;

            bestLateralDistanceM = lateralDistanceM;
            bestProgressM = _cumulativeLengthM[segmentIndex]
                + _segmentLengthM[segmentIndex] * parameter;
        }

        return new ClosestSegmentSample(bestLateralDistanceM, bestProgressM);
    }

    static bool CrossedForward(double previousProgressM, double progressM, double gateProgressM) =>
        previousProgressM < gateProgressM && progressM >= gateProgressM;

    readonly record struct ClosestSegmentSample(double LateralDistanceM, double ProgressM);

    static Vec3D HorizontalDirection(Vec3D vector)
    {
        double length = HorizontalLength(vector);
        if (length <= 1e-9)
            throw new ArgumentException("Circuit control points must be distinct.");
        return new Vec3D(vector.X / length, 0.0, vector.Z / length);
    }

    static double HorizontalLength(Vec3D vector) =>
        Math.Sqrt(vector.X * vector.X + vector.Z * vector.Z);

    static Vec3D Lerp(Vec3D start, Vec3D end, double t) =>
        start + (end - start) * t;

    static Vec3D TrackForward(double headingRad) =>
        new(Math.Sin(headingRad), 0.0, Math.Cos(headingRad));

    static Vec3D TrackRight(double headingRad) =>
        new(Math.Cos(headingRad), 0.0, -Math.Sin(headingRad));

    static double ProjectAlongTrack(Vec3D origin, Vec3D forward, Vec3D point)
    {
        Vec3D offset = point - origin;
        return offset.X * forward.X + offset.Z * forward.Z;
    }

    static double ProjectCrossTrack(Vec3D origin, Vec3D right, Vec3D point)
    {
        Vec3D offset = point - origin;
        return offset.X * right.X + offset.Z * right.Z;
    }

    static double HorizontalDistance(Vec3D a, Vec3D b)
    {
        double dx = a.X - b.X;
        double dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }
}
