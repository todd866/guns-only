namespace GunsOnly.Sim.Motorcycle;

public enum WeekendRoadClass
{
    CircuitAccess,
    CountryLane,
    ScenicRoad,
    VillageStreet
}

public readonly record struct WeekendRoadQueryResult(
    bool OnPavement,
    string RoadId,
    WeekendRoadClass RoadClass,
    double LateralDistanceM,
    double ProgressM,
    Vec3D ClosestPointWorldM,
    Vec3D ForwardWorld);

/// <summary>
/// Renderer-neutral sampled road ribbon. The same centreline owns grip, route progress,
/// Web geometry, and Unity geometry; renderers may add shoulders and scenery but may not
/// move the paved surface.
/// </summary>
public sealed class WeekendRoad
{
    internal WeekendRoad(
        string id,
        WeekendRoadClass roadClass,
        double pavedWidthM,
        Vec3D[] centreline)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("A road id is required.", nameof(id));
        if (!double.IsFinite(pavedWidthM) || pavedWidthM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(pavedWidthM));
        if (centreline.Length < 2 || centreline.Any(point => !point.IsFinite))
            throw new ArgumentException("A finite road centreline requires at least two points.");

        Id = id;
        RoadClass = roadClass;
        PavedWidthM = pavedWidthM;
        Centreline = centreline;
        LengthM = PolylineLength(centreline);
    }

    public string Id { get; }
    public WeekendRoadClass RoadClass { get; }
    public double PavedWidthM { get; }
    public IReadOnlyList<Vec3D> Centreline { get; }
    public double LengthM { get; }

    static double PolylineLength(IReadOnlyList<Vec3D> points)
    {
        double lengthM = 0.0;
        for (int index = 0; index < points.Count - 1; index++)
            lengthM += HorizontalDistance(points[index], points[index + 1]);
        return lengthM;
    }

    internal static double HorizontalDistance(in Vec3D a, in Vec3D b)
    {
        double eastM = b.X - a.X;
        double northM = b.Z - a.Z;
        return Math.Sqrt(eastM * eastM + northM * northM);
    }
}

/// <summary>
/// A connected, free-roam road graph surrounding Weekend Track Day. It deliberately contains
/// a primary scenic loop plus two branches, so the experience is an open riding area rather than
/// a disguised point-to-point corridor. All pavement remains horizontal until the motorcycle
/// authority supports non-horizontal surface normals.
/// </summary>
public sealed class WeekendHinterlandRoadNetwork
{
    public const string NetworkId = "weekend-hinterland.open-road.v1";
    public const string PrimaryRouteId = "weekend-hinterland.scenic-loop.v1";
    public const double SurfaceElevationM = PaintedCircuit.WeekendTrackSurfaceElevationM;
    public const double MaximumSampleSpacingM = 10.0;
    public const double CountryLaneWidthM = 8.5;
    public const double AccessRoadWidthM = 10.0;
    public const double VillageStreetWidthM = 9.5;

    readonly WeekendRoad[] _roads;
    readonly Vec3D[] _primaryRouteCentreline;
    readonly double[] _primaryRouteCumulativeLengthM;

    WeekendHinterlandRoadNetwork(
        WeekendRoad[] roads,
        string[] primaryRouteRoadIds,
        Vec3D circuitAccessPointWorldM)
    {
        _roads = roads;
        Roads = roads;
        PrimaryRouteRoadIds = primaryRouteRoadIds;
        CircuitAccessPointWorldM = circuitAccessPointWorldM;
        _primaryRouteCentreline = BuildRouteCentreline(roads, primaryRouteRoadIds);
        PrimaryRouteCentreline = _primaryRouteCentreline;
        _primaryRouteCumulativeLengthM = CumulativeLengths(_primaryRouteCentreline);
        PrimaryRouteLengthM = _primaryRouteCumulativeLengthM[^1];

        double minEastM = double.PositiveInfinity;
        double maxEastM = double.NegativeInfinity;
        double minNorthM = double.PositiveInfinity;
        double maxNorthM = double.NegativeInfinity;
        foreach (WeekendRoad road in roads)
        {
            foreach (Vec3D point in road.Centreline)
            {
                minEastM = Math.Min(minEastM, point.X);
                maxEastM = Math.Max(maxEastM, point.X);
                minNorthM = Math.Min(minNorthM, point.Z);
                maxNorthM = Math.Max(maxNorthM, point.Z);
            }
        }
        BoundsMinWorldM = new Vec3D(minEastM, SurfaceElevationM, minNorthM);
        BoundsMaxWorldM = new Vec3D(maxEastM, SurfaceElevationM, maxNorthM);
    }

    public string Id => NetworkId;
    public IReadOnlyList<WeekendRoad> Roads { get; }
    public IReadOnlyList<string> PrimaryRouteRoadIds { get; }
    public IReadOnlyList<Vec3D> PrimaryRouteCentreline { get; }
    public double PrimaryRouteLengthM { get; }
    public Vec3D CircuitAccessPointWorldM { get; }
    public Vec3D BoundsMinWorldM { get; }
    public Vec3D BoundsMaxWorldM { get; }

    public static WeekendHinterlandRoadNetwork CreateDefault(
        Vec3D? circuitAccessPointOverride = null)
    {
        Vec3D circuitAccess = circuitAccessPointOverride
            ?? new Vec3D(0.0, SurfaceElevationM, -320.0);

        static Vec3D P(double eastM, double northM) =>
            new(eastM, SurfaceElevationM, northM);

        Vec3D southJunction = P(120.0, -920.0);
        Vec3D westJunction = P(-2_720.0, -680.0);
        Vec3D northJunction = P(-180.0, 2_620.0);
        Vec3D eastJunction = P(2_030.0, 1_080.0);

        WeekendRoad[] roads =
        [
            Road(
                "paddock-access",
                WeekendRoadClass.CircuitAccess,
                AccessRoadWidthM,
                circuitAccess,
                P(20.0, -520.0),
                P(55.0, -720.0),
                southJunction),
            Road(
                "south-farm-road",
                WeekendRoadClass.CountryLane,
                CountryLaneWidthM,
                southJunction,
                P(-520.0, -1_270.0),
                P(-1_330.0, -1_520.0),
                P(-2_120.0, -1_270.0),
                westJunction),
            Road(
                "western-ridge-road",
                WeekendRoadClass.ScenicRoad,
                CountryLaneWidthM,
                westJunction,
                P(-3_170.0, 180.0),
                P(-3_020.0, 1_070.0),
                P(-2_250.0, 1_900.0),
                P(-1_180.0, 2_390.0),
                northJunction),
            Road(
                "north-valley-road",
                WeekendRoadClass.ScenicRoad,
                CountryLaneWidthM,
                northJunction,
                P(760.0, 2_480.0),
                P(1_480.0, 2_020.0),
                eastJunction),
            Road(
                "east-orchard-road",
                WeekendRoadClass.CountryLane,
                CountryLaneWidthM,
                eastJunction,
                P(2_520.0, 230.0),
                P(2_300.0, -690.0),
                P(1_620.0, -1_210.0),
                P(810.0, -1_120.0),
                southJunction),
            Road(
                "village-cut-through",
                WeekendRoadClass.VillageStreet,
                VillageStreetWidthM,
                northJunction,
                P(520.0, 1_830.0),
                P(570.0, 820.0),
                P(310.0, -40.0),
                southJunction),
            Road(
                "reservoir-overlook-spur",
                WeekendRoadClass.ScenicRoad,
                CountryLaneWidthM,
                westJunction,
                P(-3_560.0, -410.0),
                P(-4_190.0, 40.0),
                P(-4_520.0, 610.0)),
            Road(
                "airfield-service-link",
                WeekendRoadClass.CountryLane,
                CountryLaneWidthM,
                eastJunction,
                P(1_560.0, 580.0),
                P(930.0, 40.0),
                P(690.0, -520.0)),
        ];

        string[] primaryRouteRoadIds =
        [
            "south-farm-road",
            "western-ridge-road",
            "north-valley-road",
            "east-orchard-road"
        ];
        return new WeekendHinterlandRoadNetwork(
            roads,
            primaryRouteRoadIds,
            circuitAccess);
    }

    public bool IsOnPavement(in Vec3D positionWorldM) => Query(positionWorldM).OnPavement;

    public WeekendRoadQueryResult Query(in Vec3D positionWorldM)
    {
        ClosestSample? best = null;
        WeekendRoad? bestRoad = null;
        foreach (WeekendRoad road in _roads)
        {
            ClosestSample candidate = ClosestOnPolyline(positionWorldM, road.Centreline);
            if (best is null || candidate.LateralDistanceM < best.Value.LateralDistanceM)
            {
                best = candidate;
                bestRoad = road;
            }
        }

        if (best is null || bestRoad is null)
            throw new InvalidOperationException("The Weekend road network has no roads.");
        ClosestSample sample = best.Value;
        return new WeekendRoadQueryResult(
            sample.LateralDistanceM <= bestRoad.PavedWidthM * 0.5,
            bestRoad.Id,
            bestRoad.RoadClass,
            sample.LateralDistanceM,
            sample.ProgressM,
            sample.ClosestPointWorldM,
            sample.ForwardWorld);
    }

    public WeekendRoadQueryResult QueryPrimaryRoute(in Vec3D positionWorldM)
    {
        ClosestSample sample = ClosestOnPolyline(
            positionWorldM,
            _primaryRouteCentreline,
            _primaryRouteCumulativeLengthM);
        return new WeekendRoadQueryResult(
            sample.LateralDistanceM <= CountryLaneWidthM * 0.5,
            PrimaryRouteId,
            WeekendRoadClass.ScenicRoad,
            sample.LateralDistanceM,
            sample.ProgressM,
            sample.ClosestPointWorldM,
            sample.ForwardWorld);
    }

    static WeekendRoad Road(
        string id,
        WeekendRoadClass roadClass,
        double widthM,
        params Vec3D[] controlPoints) =>
        new(id, roadClass, widthM, SampleCatmullRom(controlPoints));

    static Vec3D[] SampleCatmullRom(IReadOnlyList<Vec3D> controlPoints)
    {
        if (controlPoints.Count < 2)
            throw new ArgumentException("A road requires at least two control points.");

        var sampled = new List<Vec3D> { controlPoints[0] };
        for (int segment = 0; segment < controlPoints.Count - 1; segment++)
        {
            Vec3D p0 = segment == 0 ? controlPoints[segment] : controlPoints[segment - 1];
            Vec3D p1 = controlPoints[segment];
            Vec3D p2 = controlPoints[segment + 1];
            Vec3D p3 = segment + 2 < controlPoints.Count
                ? controlPoints[segment + 2]
                : controlPoints[segment + 1];
            double chordM = WeekendRoad.HorizontalDistance(p1, p2);
            // Catmull-Rom can bow beyond the endpoint chord. Sample against a conservative
            // fraction of the public spacing limit so curved portions stay below it too.
            int steps = Math.Max(
                8,
                (int)Math.Ceiling(chordM / (MaximumSampleSpacingM * 0.8)));
            for (int step = 1; step <= steps; step++)
            {
                double t = (double)step / steps;
                double t2 = t * t;
                double t3 = t2 * t;
                Vec3D point = (p1 * 2.0
                    + (p2 - p0) * t
                    + (p0 * 2.0 - p1 * 5.0 + p2 * 4.0 - p3) * t2
                    + (p3 - p0 + (p1 - p2) * 3.0) * t3) * 0.5;
                sampled.Add(new Vec3D(point.X, SurfaceElevationM, point.Z));
            }
        }
        return sampled.ToArray();
    }

    static Vec3D[] BuildRouteCentreline(
        IReadOnlyList<WeekendRoad> roads,
        IReadOnlyList<string> routeRoadIds)
    {
        var route = new List<Vec3D>();
        foreach (string roadId in routeRoadIds)
        {
            WeekendRoad road = roads.Single(candidate => candidate.Id == roadId);
            if (route.Count > 0
                && WeekendRoad.HorizontalDistance(route[^1], road.Centreline[0]) > 1e-6)
                throw new InvalidOperationException($"Primary route road '{roadId}' is disconnected.");
            int firstIndex = route.Count == 0 ? 0 : 1;
            for (int index = firstIndex; index < road.Centreline.Count; index++)
                route.Add(road.Centreline[index]);
        }

        if (route.Count < 3
            || WeekendRoad.HorizontalDistance(route[0], route[^1]) > 1e-6)
            throw new InvalidOperationException("The primary scenic route must be a closed loop.");
        return route.ToArray();
    }

    static double[] CumulativeLengths(IReadOnlyList<Vec3D> points)
    {
        var cumulative = new double[points.Count];
        for (int index = 1; index < points.Count; index++)
            cumulative[index] = cumulative[index - 1]
                + WeekendRoad.HorizontalDistance(points[index - 1], points[index]);
        return cumulative;
    }

    static ClosestSample ClosestOnPolyline(
        in Vec3D positionWorldM,
        IReadOnlyList<Vec3D> points,
        IReadOnlyList<double>? cumulativeLengthM = null)
    {
        double bestDistanceSquaredM2 = double.PositiveInfinity;
        double bestProgressM = 0.0;
        Vec3D bestPoint = points[0];
        Vec3D bestForward = new(0.0, 0.0, 1.0);
        double runningLengthM = 0.0;

        for (int index = 0; index < points.Count - 1; index++)
        {
            Vec3D start = points[index];
            Vec3D end = points[index + 1];
            double eastM = end.X - start.X;
            double northM = end.Z - start.Z;
            double lengthSquaredM2 = eastM * eastM + northM * northM;
            if (lengthSquaredM2 <= 1e-12)
                continue;

            double along = ((positionWorldM.X - start.X) * eastM
                + (positionWorldM.Z - start.Z) * northM) / lengthSquaredM2;
            along = Math.Clamp(along, 0.0, 1.0);
            Vec3D closest = new(
                start.X + eastM * along,
                SurfaceElevationM,
                start.Z + northM * along);
            double queryEastM = positionWorldM.X - closest.X;
            double queryNorthM = positionWorldM.Z - closest.Z;
            double distanceSquaredM2 = queryEastM * queryEastM + queryNorthM * queryNorthM;
            double segmentLengthM = Math.Sqrt(lengthSquaredM2);
            if (distanceSquaredM2 < bestDistanceSquaredM2)
            {
                bestDistanceSquaredM2 = distanceSquaredM2;
                double segmentStartM = cumulativeLengthM is null
                    ? runningLengthM
                    : cumulativeLengthM[index];
                bestProgressM = segmentStartM + segmentLengthM * along;
                bestPoint = closest;
                bestForward = new Vec3D(eastM / segmentLengthM, 0.0, northM / segmentLengthM);
            }
            runningLengthM += segmentLengthM;
        }

        return new ClosestSample(
            Math.Sqrt(bestDistanceSquaredM2),
            bestProgressM,
            bestPoint,
            bestForward);
    }

    readonly record struct ClosestSample(
        double LateralDistanceM,
        double ProgressM,
        Vec3D ClosestPointWorldM,
        Vec3D ForwardWorld);
}
