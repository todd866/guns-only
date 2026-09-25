namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Braking reference read off the centreline. Steady speed is the level-turn
/// limit sqrt(μ g r), not a painted board the bike ignores.
/// </summary>
public readonly record struct CircuitApexReference(
    double DistanceM,
    double RadiusM,
    double SteadySpeedMps,
    bool ReportingExit);

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
/// Painted centreline circuit on the Rapier fixed strip. Track paint is visual/scoring only;
/// it does not alter runway surface friction in v1.
/// </summary>
public sealed class PaintedCircuit
{
    public const double RapierRunwayLengthM = 3_048.0;
    public const double RapierRunwayWidthM = 48.0;
    /// <summary>Paved shoulder either side of the centreline: 10 m of track plus 6 m apron.</summary>
    public const double PavedApronHalfWidthM = 16.0;
    const double HairpinRadiusM = 44.0;
    const double CornerBlendDistanceM = 30.0;
    const double MaximumSampleSpacingM = 10.0;
    const double MaximumContinuousAdvanceM = 20.0;

    readonly Vec3D[] _centreline;
    readonly double[] _segmentLengthM;
    readonly double[] _cumulativeLengthM;
    double[] _sectorGateProgressM;
    readonly ApexMarker[] _apexes;
    readonly Vec3D _runwayOrigin;
    readonly Vec3D _runwayForward;
    readonly Vec3D _runwayRight;

    PaintedCircuit(
        Vec3D[] centreline,
        double trackWidthM,
        double boundingLengthM,
        double boundingWidthM,
        Vec3D startFinishCentre,
        int startFinishSegmentIndex,
        double[] sectorGateProgressM,
        Vec3D runwayOrigin,
        Vec3D runwayForward,
        Vec3D runwayRight)
    {
        _centreline = centreline;
        _runwayOrigin = runwayOrigin;
        _runwayForward = runwayForward;
        _runwayRight = runwayRight;
        TrackWidthM = trackWidthM;
        BoundingLengthM = boundingLengthM;
        BoundingWidthM = boundingWidthM;
        StartFinishCentre = startFinishCentre;
        StartFinishSegmentIndex = startFinishSegmentIndex;
        _sectorGateProgressM = sectorGateProgressM;

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
        _apexes = FindHairpinApexes();
        ApplyHairpinSectorGates();
    }

    /// <summary>
    /// Opening straight, first hairpin, return straight, second hairpin. Nearby radius
    /// wiggles are one corner. The exit gate stays between the two apexes so a rider
    /// can close the sectors in order.
    /// </summary>
    void ApplyHairpinSectorGates()
    {
        if (_apexes.Length < 2 || CircuitLengthM <= 1.0)
            return;

        var merged = new List<ApexMarker>();
        foreach (ApexMarker apex in _apexes.OrderBy(marker => marker.ProgressM))
        {
            if (merged.Count > 0 && apex.ProgressM - merged[^1].ProgressM < 80.0)
            {
                if (apex.RadiusM < merged[^1].RadiusM)
                    merged[^1] = apex;
                continue;
            }

            merged.Add(apex);
        }

        if (merged.Count < 2)
            return;

        ApexMarker first = merged[0];
        ApexMarker second = merged[1];
        double exitM = first.ExitProgressM;
        if (exitM <= first.ProgressM || exitM >= second.ProgressM)
            exitM = (first.ProgressM + second.ProgressM) * 0.5;
        _sectorGateProgressM =
        [
            first.ProgressM / CircuitLengthM,
            exitM / CircuitLengthM,
            second.ProgressM / CircuitLengthM,
        ];
    }

    /// <summary>
    /// Centreline point <paramref name="distanceM"/> ahead of <paramref name="progressM"/>,
    /// wrapping the lap. Used for the signed look-ahead tick.
    /// </summary>
    public Vec3D PointAhead(double progressM, double distanceM)
    {
        double target = WrapProgress(progressM + Math.Max(0.0, distanceM));
        int unique = _centreline.Length - 1;
        for (int index = 0; index < unique; index++)
        {
            if (_cumulativeLengthM[index + 1] + 1e-6 < target)
                continue;
            double span = _segmentLengthM[index];
            double t = span > 1e-6
                ? (target - _cumulativeLengthM[index]) / span
                : 0.0;
            t = Math.Clamp(t, 0.0, 1.0);
            return _centreline[index] + (_centreline[index + 1] - _centreline[index]) * t;
        }

        return _centreline[0];
    }

    readonly record struct ApexMarker(double ProgressM, double RadiusM, double ExitProgressM);

    public IReadOnlyList<Vec3D> Centreline => _centreline;
    public double TrackWidthM { get; }
    public double CircuitLengthM { get; }
    public double BoundingLengthM { get; }
    public double BoundingWidthM { get; }
    public Vec3D StartFinishCentre { get; }
    public int StartFinishSegmentIndex { get; }
    public IReadOnlyList<double> SectorGateProgressM => _sectorGateProgressM;

    public static PaintedCircuit RapierStripWeekend(
        double headingRad = -Math.PI / 2.0,
        Vec3D? originOverride = null)
    {
        const double trackWidthM = 20.0;
        const double elevM = RapierLaunchSite.OperatingSurfaceElevationM;
        Vec3D forward = RunwayForward(headingRad);
        Vec3D right = RunwayRight(headingRad);
        Vec3D origin = originOverride ?? new Vec3D(0.0, elevM, 0.0);

        // Club loop on the same strip, not a 6 km runway oval. The first hairpin is a few
        // hundred metres from the grid so a pinned throttle meets a real heading change
        // inside 15 s. alongM is positive toward the western threshold; crossM is positive
        // toward runway right. Hairpin centres stay on opposite sides of the origin so
        // Math.Sign(centreAlongM) still bulges each 180° turn outward.
        Vec3D At(double alongM, double crossM) =>
            origin + forward * alongM + right * crossM;

        // 180-degree hairpin around (centreAlongM, 0). The 0.35 corner-rounding blend tightens
        // the apex of this 15-degree polygon below the authored radius: r=44 measures ~39 m
        // minimum over a 6 m arc window (EveryCornerIsRideableAtHairpinEntrySpeeds guards >=28).
        IEnumerable<Vec3D> Hairpin(double centreAlongM, double directionSign)
        {
            for (int step = 0; step <= 12; step++)
            {
                double angleRad = Math.PI * step / 12.0;
                yield return At(
                    centreAlongM + Math.Sign(centreAlongM) * HairpinRadiusM * Math.Sin(angleRad),
                    -directionSign * HairpinRadiusM * Math.Cos(angleRad));
            }
        }

        Vec3D[] controlPoints =
        [
            At(-280.0, -14.0),
            At(-40.0, -14.0),
            At(40.0, -30.0),
            At(100.0, -42.0),
            .. Hairpin(170.0, 1.0),
            At(100.0, 42.0),
            At(40.0, 30.0),
            At(-40.0, 14.0),
            At(-280.0, 14.0),
            At(-380.0, 28.0),
            At(-440.0, 42.0),
            .. Hairpin(-520.0, -1.0),
            At(-470.0, -40.0),
            At(-400.0, -28.0),
            At(-280.0, -14.0),
        ];
        Vec3D[] centreline = BuildRoundedCentreline(controlPoints);

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
        Vec3D startFinishCentre = centreline[0];
        double[] sectorGateProgressM = [0.25, 0.50, 0.75];

        return new PaintedCircuit(
            centreline,
            trackWidthM,
            boundingLengthM,
            boundingWidthM,
            startFinishCentre,
            startFinishSegmentIndex,
            sectorGateProgressM,
            origin,
            forward,
            right);
    }

    /// <summary>
    /// Authoritative paved-surface test: the runway rectangle plus the apron corridor that
    /// follows the painted circuit, both expressed in the circuit's own runway frame so a
    /// heading or origin change cannot desynchronise pavement from paint.
    /// </summary>
    public bool IsOnPavement(Vec3D positionWorld)
    {
        double alongM = ProjectAlongRunway(_runwayOrigin, _runwayForward, positionWorld);
        double crossM = ProjectCrossRunway(_runwayOrigin, _runwayRight, positionWorld);
        bool onRunway = Math.Abs(alongM) <= RapierRunwayLengthM * 0.5
            && Math.Abs(crossM) <= RapierRunwayWidthM * 0.5;
        if (onRunway)
            return true;
        return FindClosestSegment(positionWorld).LateralDistanceM <= PavedApronHalfWidthM;
    }

    /// <summary>
    /// Distance to the next hairpin apex, and the steady speed sqrt(μ g r) that radius
    /// can hold. μ is <see cref="YzfR1Definition.TirePeakFrictionCoefficient"/> (surrogate
    /// 1.20, docs/vehicles/yamaha-yzf-r1/00-sources.md). g is standard gravity 9.80665.
    /// Once progress has passed the apex and not yet the exit, the distance is the exit
    /// of this corner rather than the apex already under the bike.
    /// </summary>
    public CircuitApexReference NextApex(double progressM)
    {
        const double gravityMps2 = 9.80665;
        double mu = YzfR1Definition.TirePeakFrictionCoefficient;
        if (_apexes.Length == 0 || CircuitLengthM <= 1.0)
        {
            return new CircuitApexReference(0.0, HairpinRadiusM,
                Math.Sqrt(mu * gravityMps2 * HairpinRadiusM), false);
        }

        double progress = WrapProgress(progressM);
        foreach (ApexMarker apex in _apexes)
        {
            double intoCornerM = ForwardDistance(apex.ProgressM, progress);
            double cornerLengthM = ForwardDistance(apex.ProgressM, apex.ExitProgressM);
            if (intoCornerM > 2.0 && intoCornerM <= cornerLengthM)
            {
                return new CircuitApexReference(
                    ForwardDistance(progress, apex.ExitProgressM),
                    apex.RadiusM,
                    Math.Sqrt(mu * gravityMps2 * Math.Max(apex.RadiusM, 1.0)),
                    ReportingExit: true);
            }
        }

        ApexMarker next = _apexes[0];
        double bestDistanceM = double.PositiveInfinity;
        foreach (ApexMarker apex in _apexes)
        {
            double distanceM = ForwardDistance(progress, apex.ProgressM);
            if (distanceM < 2.0)
                distanceM = CircuitLengthM;
            if (distanceM < bestDistanceM)
            {
                bestDistanceM = distanceM;
                next = apex;
            }
        }

        return new CircuitApexReference(
            bestDistanceM,
            next.RadiusM,
            Math.Sqrt(mu * gravityMps2 * Math.Max(next.RadiusM, 1.0)),
            ReportingExit: false);
    }

    ApexMarker[] FindHairpinApexes()
    {
        int unique = _centreline.Length - 1;
        if (unique < 8)
            return [];

        var radiusM = new double[unique];
        for (int index = 0; index < unique; index++)
            radiusM[index] = CornerRadiusAt(index, unique);

        var markers = new List<ApexMarker>();
        for (int index = 1; index < unique - 1; index++)
        {
            if (radiusM[index] > 55.0)
                continue;
            if (radiusM[index] > radiusM[index - 1] + 0.25)
                continue;
            if (radiusM[index] > radiusM[index + 1] + 0.25)
                continue;
            double progressM = _cumulativeLengthM[index];
            if (markers.Count > 0
                && ForwardDistance(markers[^1].ProgressM, progressM) < 40.0
                && ForwardDistance(markers[^1].ProgressM, progressM) > 0.0)
            {
                if (radiusM[index] < markers[^1].RadiusM)
                    markers[^1] = new ApexMarker(progressM, radiusM[index], progressM);
                continue;
            }

            markers.Add(new ApexMarker(progressM, radiusM[index], progressM));
        }

        for (int markerIndex = 0; markerIndex < markers.Count; markerIndex++)
        {
            ApexMarker marker = markers[markerIndex];
            double exitProgressM = marker.ProgressM;
            double travelledM = 0.0;
            int index = IndexNearProgress(marker.ProgressM);
            for (int step = 0; step < unique && travelledM < 140.0; step++)
            {
                int next = (index + 1) % unique;
                travelledM += _segmentLengthM[index];
                index = next;
                exitProgressM = _cumulativeLengthM[index];
                if (CornerRadiusAt(index, unique) > 80.0 && travelledM > 12.0)
                    break;
            }

            markers[markerIndex] = marker with { ExitProgressM = exitProgressM };
        }

        return markers.ToArray();
    }

    int IndexNearProgress(double progressM)
    {
        int best = 0;
        double bestDeltaM = double.PositiveInfinity;
        int unique = _centreline.Length - 1;
        for (int index = 0; index < unique; index++)
        {
            double deltaM = Math.Abs(_cumulativeLengthM[index] - progressM);
            if (deltaM < bestDeltaM)
            {
                bestDeltaM = deltaM;
                best = index;
            }
        }

        return best;
    }

    double CornerRadiusAt(int index, int unique)
    {
        const double windowM = 6.0;
        Vec3D b = _centreline[index];
        Vec3D a = WalkCentreline(index, -windowM, unique);
        Vec3D c = WalkCentreline(index, windowM, unique);
        double ab = HorizontalDistance(a, b);
        double bc = HorizontalDistance(b, c);
        double ca = HorizontalDistance(c, a);
        double cross = (b.X - a.X) * (c.Z - a.Z) - (b.Z - a.Z) * (c.X - a.X);
        double areaTwice = Math.Abs(cross);
        if (areaTwice < 1e-6 || ab < 1e-3 || bc < 1e-3 || ca < 1e-3)
            return double.PositiveInfinity;
        return ab * bc * ca / (2.0 * areaTwice);
    }

    Vec3D WalkCentreline(int index, double signedDistanceM, int unique)
    {
        int direction = signedDistanceM >= 0.0 ? 1 : -1;
        double remainingM = Math.Abs(signedDistanceM);
        int cursor = index;
        while (remainingM > 0.0)
        {
            int next = direction > 0
                ? (cursor + 1) % unique
                : (cursor - 1 + unique) % unique;
            double segmentM = HorizontalDistance(_centreline[cursor], _centreline[next]);
            if (segmentM >= remainingM || segmentM < 1e-6)
                return _centreline[next];
            remainingM -= segmentM;
            cursor = next;
        }

        return _centreline[index];
    }

    double ForwardDistance(double fromM, double toM)
    {
        double distanceM = toM - fromM;
        if (distanceM < 0.0)
            distanceM += CircuitLengthM;
        return distanceM;
    }

    double WrapProgress(double progressM)
    {
        if (!double.IsFinite(progressM) || CircuitLengthM <= 0.0)
            return 0.0;
        double wrapped = progressM % CircuitLengthM;
        return wrapped < 0.0 ? wrapped + CircuitLengthM : wrapped;
    }

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
