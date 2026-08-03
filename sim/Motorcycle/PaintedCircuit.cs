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
    public int LastSectorIndex;
    public bool HasSample;
}

/// <summary>
/// Painted centreline circuit on the Rapier fixed strip. Track paint is visual/scoring only;
/// it does not alter runway surface friction in v1.
/// </summary>
public sealed class PaintedCircuit
{
    const double RunwayLengthM = 3_048.0;
    const double RunwayWidthM = 48.0;
    const double StartFinishCrossingWindowM = 12.0;

    readonly Vec3D[] _centreline;
    readonly double[] _segmentLengthM;
    readonly double[] _cumulativeLengthM;
    readonly double[] _sectorGateProgressM;

    PaintedCircuit(
        Vec3D[] centreline,
        double trackWidthM,
        double boundingLengthM,
        double boundingWidthM,
        Vec3D startFinishCentre,
        int startFinishSegmentIndex,
        double[] sectorGateProgressM)
    {
        _centreline = centreline;
        TrackWidthM = trackWidthM;
        BoundingLengthM = boundingLengthM;
        BoundingWidthM = boundingWidthM;
        StartFinishCentre = startFinishCentre;
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

    public IReadOnlyList<Vec3D> Centreline => _centreline;
    public double TrackWidthM { get; }
    public double CircuitLengthM { get; }
    public double BoundingLengthM { get; }
    public double BoundingWidthM { get; }
    public Vec3D StartFinishCentre { get; }
    public int StartFinishSegmentIndex { get; }
    public IReadOnlyList<double> SectorGateProgressM { get; }

    public static PaintedCircuit RapierStripWeekend()
    {
        const double headingRad = -Math.PI / 2.0;
        const double trackWidthM = 8.0;
        const double elevM = RapierLaunchSite.OperatingSurfaceElevationM;
        Vec3D forward = RunwayForward(headingRad);
        Vec3D right = RunwayRight(headingRad);
        Vec3D origin = new(0.0, elevM, 0.0);

        // Closed loop on the 3,048 m x 48 m strip: long straights, esses, west hairpin, chicanes.
        // alongM is positive toward the western threshold; crossM is positive toward runway right.
        Vec3D At(double alongM, double crossM) =>
            origin + forward * alongM + right * crossM;

        Vec3D[] centreline =
        [
            At(-1_380.0, 0.0),
            At(-1_050.0, 12.0),
            At(-650.0, -12.0),
            At(-250.0, 14.0),
            At(150.0, -14.0),
            At(550.0, 14.0),
            At(950.0, -12.0),
            At(1_250.0, 10.0),
            At(1_480.0, 18.0),
            At(1_480.0, -18.0),
            At(1_220.0, -16.0),
            At(850.0, 16.0),
            At(450.0, -16.0),
            At(50.0, 14.0),
            At(-350.0, -14.0),
            At(-750.0, 12.0),
            At(-1_150.0, -10.0),
            At(-1_380.0, 0.0),
        ];

        double minAlongM = double.PositiveInfinity;
        double maxAlongM = double.NegativeInfinity;
        double minCrossM = double.PositiveInfinity;
        double maxCrossM = double.NegativeInfinity;
        foreach (Vec3D point in centreline)
        {
            double alongM = ProjectAlongRunway(origin, forward, point);
            double crossM = ProjectCrossRunway(origin, right, point);
            minAlongM = Math.Min(minAlongM, alongM);
            maxAlongM = Math.Max(maxAlongM, alongM);
            minCrossM = Math.Min(minCrossM, crossM);
            maxCrossM = Math.Max(maxCrossM, crossM);
        }

        double boundingLengthM = maxAlongM - minAlongM;
        double boundingWidthM = maxCrossM - minCrossM;
        int startFinishSegmentIndex = centreline.Length - 2;
        Vec3D startFinishCentre = At(-1_380.0, 0.0);
        double[] sectorGateProgressM = [0.25, 0.50, 0.75];

        return new PaintedCircuit(
            centreline,
            trackWidthM,
            boundingLengthM,
            boundingWidthM,
            startFinishCentre,
            startFinishSegmentIndex,
            sectorGateProgressM);
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

        if (state.HasSample)
        {
            crossedStartFinish = CrossedStartFinish(
                state.LastProgressM,
                progressM,
                out int lapDelta);
            lapIndex += lapDelta;

            if (crossedStartFinish)
                state.LastSectorIndex = -1;

            sectorCrossed = DetectSectorCrossing(
                state.LastProgressM,
                progressM,
                state.LastSectorIndex);
        }

        state.LastProgressM = progressM;
        state.LapIndex = lapIndex;
        if (sectorCrossed >= 0)
            state.LastSectorIndex = sectorCrossed;
        state.HasSample = true;

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

    bool CrossedStartFinish(double previousProgressM, double progressM, out int lapDelta)
    {
        lapDelta = 0;
        if (previousProgressM <= progressM)
            return false;

        double deltaM = previousProgressM - progressM;
        bool wrappedForward = deltaM >= CircuitLengthM - StartFinishCrossingWindowM;
        bool crossedHalfway = previousProgressM > CircuitLengthM * 0.5
            && progressM < CircuitLengthM * 0.5;
        if (!wrappedForward && !crossedHalfway)
            return false;

        lapDelta = 1;
        return true;
    }

    int DetectSectorCrossing(
        double previousProgressM,
        double progressM,
        int lastSectorIndex)
    {
        for (int sectorIndex = lastSectorIndex + 1;
            sectorIndex < _sectorGateProgressM.Length;
            sectorIndex++)
        {
            double gateProgressM = _sectorGateProgressM[sectorIndex] * CircuitLengthM;
            if (CrossedForward(previousProgressM, progressM, gateProgressM))
                return sectorIndex;
        }

        return -1;
    }

    static bool CrossedForward(double previousProgressM, double progressM, double gateProgressM) =>
        previousProgressM < gateProgressM && progressM >= gateProgressM;

    readonly record struct ClosestSegmentSample(double LateralDistanceM, double ProgressM);

    static Vec3D RunwayForward(double headingRad) =>
        new(Math.Sin(headingRad), 0.0, Math.Cos(headingRad));

    static Vec3D RunwayRight(double headingRad) =>
        new(Math.Cos(headingRad), 0.0, -Math.Sin(headingRad));

    static double ProjectAlongRunway(Vec3D origin, Vec3D forward, Vec3D point)
    {
        Vec3D offset = point - origin;
        return offset.X * forward.X + offset.Z * forward.Z;
    }

    static double ProjectCrossRunway(Vec3D origin, Vec3D right, Vec3D point)
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
