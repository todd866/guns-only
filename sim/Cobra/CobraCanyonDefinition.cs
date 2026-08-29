using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Cobra;

/// <summary>The three deliberately different low-level approaches through Cobra Canyon.</summary>
public enum CobraCanyonRouteChoice
{
    RiverGorge,
    RidgeShadow,
    RoadPlantation
}

public enum CobraCanyonRouteExposure
{
    Low,
    Medium,
    High
}

public enum CobraCanyonLandmarkKind
{
    ForwardOperatingBase,
    Waterfall,
    Bridge,
    RockSpires,
    RidgeGate,
    Pagoda,
    RadioMast,
    WaterTower,
    OpenQuarry,
    MillStack,
    SignalSmoke
}

public enum CobraCanyonCollisionPrimitive
{
    CapsuleSegment,
    AxisAlignedBox
}

/// <summary>
/// One authored route control point. Coordinates use the simulation's X=east/Z=north local
/// frame. TargetAglM is guidance, not an altitude-hold command.
/// </summary>
public readonly record struct CobraCanyonRoutePoint(
    string Id,
    double EastM,
    double PathAltitudeM,
    double NorthM,
    double TargetAglM,
    double CorridorRadiusM,
    string? LandmarkId = null)
{
    public Vec3D PathLocalM => new(EastM, PathAltitudeM, NorthM);
}

/// <summary>A stable, non-target-designating navigation feature.</summary>
public sealed record CobraCanyonLandmarkDefinition(
    string Id,
    string Label,
    CobraCanyonLandmarkKind Kind,
    Vec3D PositionLocalM)
{
    public double EastM => PositionLocalM.X;
    public double AltitudeM => PositionLocalM.Y;
    public double NorthM => PositionLocalM.Z;
}

/// <summary>
/// A renderer-neutral collision primitive in absolute mission-local coordinates. These values
/// intentionally match the browser world's collision-authority JSON byte-for-number.
/// </summary>
public sealed class CobraCanyonObstacleDefinition
{
    CobraCanyonObstacleDefinition(
        string id,
        CobraCanyonCollisionPrimitive primitive,
        Vec3D firstLocalM,
        Vec3D secondLocalM,
        double radiusM)
    {
        Id = RequireStableId(id, nameof(id));
        if (!firstLocalM.IsFinite || !secondLocalM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(firstLocalM));
        if (!double.IsFinite(radiusM) || radiusM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (primitive == CobraCanyonCollisionPrimitive.CapsuleSegment && radiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (primitive == CobraCanyonCollisionPrimitive.AxisAlignedBox
            && (secondLocalM.X <= firstLocalM.X
                || secondLocalM.Y <= firstLocalM.Y
                || secondLocalM.Z <= firstLocalM.Z))
            throw new ArgumentException("Axis-aligned box bounds must be strictly increasing.");

        Primitive = primitive;
        FirstLocalM = firstLocalM;
        SecondLocalM = secondLocalM;
        RadiusM = radiusM;
    }

    public string Id { get; }
    public CobraCanyonCollisionPrimitive Primitive { get; }
    public Vec3D FirstLocalM { get; }
    public Vec3D SecondLocalM { get; }
    public double RadiusM { get; }

    public static CobraCanyonObstacleDefinition CapsuleSegment(
        string id,
        Vec3D firstLocalM,
        Vec3D secondLocalM,
        double radiusM) =>
        new(id, CobraCanyonCollisionPrimitive.CapsuleSegment,
            firstLocalM, secondLocalM, radiusM);

    public static CobraCanyonObstacleDefinition AxisAlignedBox(
        string id,
        Vec3D minimumLocalM,
        Vec3D maximumLocalM) =>
        new(id, CobraCanyonCollisionPrimitive.AxisAlignedBox,
            minimumLocalM, maximumLocalM, 0.0);

    internal static string RequireStableId(string? value, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("A stable non-empty identifier is required.", parameterName);
        foreach (char character in value) {
            if (!(character is >= 'a' and <= 'z'
                || character is >= '0' and <= '9'
                || character is '.' or '-' or '_'))
                throw new ArgumentException(
                    "Stable identifiers may contain only lowercase ASCII letters, digits, '.', '-' and '_'.",
                    parameterName);
        }
        return value;
    }
}

/// <summary>A deterministic observer used only for exposure and masking assessment.</summary>
public sealed record CobraCanyonThreatObserverDefinition(
    string Id,
    double EastM,
    double NorthM,
    double ObserverHeightAglM,
    double MaximumAssessmentRangeM);

public sealed record CobraCanyonTerrainPatchDefinition(
    string Id,
    Vec3D CentreLocalM,
    double RadiusM,
    double BlendWidthM,
    double UndulationM);

public sealed class CobraCanyonRouteDefinition
{
    readonly IReadOnlyList<CobraCanyonRoutePoint> _points;

    internal CobraCanyonRouteDefinition(
        string id,
        string label,
        CobraCanyonRouteChoice choice,
        CobraCanyonRouteExposure exposure,
        string tacticalIntent,
        string primaryHazard,
        params CobraCanyonRoutePoint[] points)
    {
        Id = CobraCanyonObstacleDefinition.RequireStableId(id, nameof(id));
        Label = RequireText(label, nameof(label));
        Choice = choice;
        Exposure = exposure;
        TacticalIntent = RequireText(tacticalIntent, nameof(tacticalIntent));
        PrimaryHazard = RequireText(primaryHazard, nameof(primaryHazard));
        ArgumentNullException.ThrowIfNull(points);
        if (points.Length < 2)
            throw new ArgumentException("A route requires at least two control points.", nameof(points));
        _points = Array.AsReadOnly(points.ToArray());

        double lengthM = 0.0;
        for (int index = 1; index < points.Length; index++) {
            double eastDeltaM = points[index].EastM - points[index - 1].EastM;
            double northDeltaM = points[index].NorthM - points[index - 1].NorthM;
            lengthM += Math.Sqrt(eastDeltaM * eastDeltaM + northDeltaM * northDeltaM);
        }
        HorizontalLengthM = lengthM;
    }

    public string Id { get; }
    public string Label { get; }
    public CobraCanyonRouteChoice Choice { get; }
    public CobraCanyonRouteExposure Exposure { get; }
    public string TacticalIntent { get; }
    public string PrimaryHazard { get; }
    public IReadOnlyList<CobraCanyonRoutePoint> Points => _points;
    public double HorizontalLengthM { get; }

    static string RequireText(string? value, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("A non-empty value is required.", parameterName);
        return value;
    }
}

/// <summary>
/// Immutable authored content for a 16 km by 16 km late-AH-1G low-level playground. It is a
/// gameplay-space local frame, not a claim of surveyed Vietnam geography.
/// </summary>
public sealed class CobraCanyonDefinition
{
    public const int SchemaVersion = 1;
    public const string WorldId = "world.cobra-canyon.v1";
    public const string RiverGorgeRouteId = "route.cobra-canyon.river-gorge.v1";
    public const string RidgeShadowRouteId = "route.cobra-canyon.ridge-shadow.v1";
    public const string RoadPlantationRouteId = "route.cobra-canyon.road-plantation.v1";
    public const double WorldExtentM = 16_000.0;
    public const double HalfWorldExtentM = WorldExtentM / 2.0;
    public const double DefaultStartAglM = 42.0;
    public const string FidelityDisclosure =
        "Authored renderer-neutral low-level navigation world with deterministic analytic terrain, "
        + "collision volumes and observer masking. Legacy observers are provisionally treated as "
        + "DShK emplacements with deterministic warned bursts, travel, SCAS-out and engine-out "
        + "effects. It does not model surveyed geography, sourced weapon ballistics, sourced AH-1G "
        + "vulnerability, broader threat AI, cockpit presentation or visual asset quality.";

    readonly IReadOnlyList<CobraCanyonRouteDefinition> _routes;
    readonly IReadOnlyList<CobraCanyonLandmarkDefinition> _landmarks;
    readonly IReadOnlyList<CobraCanyonObstacleDefinition> _obstacles;
    readonly IReadOnlyList<CobraCanyonThreatObserverDefinition> _threatObservers;
    readonly IReadOnlyList<CobraCanyonTerrainPatchDefinition> _terrainPatches;

    CobraCanyonDefinition(
        CobraCanyonRouteDefinition[] routes,
        CobraCanyonLandmarkDefinition[] landmarks,
        CobraCanyonObstacleDefinition[] obstacles,
        CobraCanyonThreatObserverDefinition[] threatObservers,
        CobraCanyonTerrainPatchDefinition[] terrainPatches)
    {
        Bounds = new TerrainBounds(
            -HalfWorldExtentM, HalfWorldExtentM,
            -HalfWorldExtentM, HalfWorldExtentM);
        _routes = Array.AsReadOnly(routes.ToArray());
        _landmarks = Array.AsReadOnly(landmarks.ToArray());
        _obstacles = Array.AsReadOnly(obstacles.ToArray());
        _threatObservers = Array.AsReadOnly(threatObservers.ToArray());
        _terrainPatches = Array.AsReadOnly(terrainPatches.ToArray());
        Validate();
    }

    public TerrainBounds Bounds { get; }
    public IReadOnlyList<CobraCanyonRouteDefinition> Routes => _routes;
    public IReadOnlyList<CobraCanyonLandmarkDefinition> Landmarks => _landmarks;
    public IReadOnlyList<CobraCanyonObstacleDefinition> Obstacles => _obstacles;
    public IReadOnlyList<CobraCanyonThreatObserverDefinition> ThreatObservers => _threatObservers;
    public IReadOnlyList<CobraCanyonTerrainPatchDefinition> TerrainPatches => _terrainPatches;

    public static CobraCanyonDefinition Create() => new(
        CreateRoutes(),
        CreateLandmarks(),
        CreateObstacles(),
        CreateThreatObservers(),
        CreateTerrainPatches());

    public static CobraCanyonDefinition BuiltIn { get; } = Create();

    public CobraCanyonRouteDefinition Route(CobraCanyonRouteChoice choice)
    {
        foreach (CobraCanyonRouteDefinition route in _routes) {
            if (route.Choice == choice) return route;
        }
        throw new ArgumentOutOfRangeException(nameof(choice), choice,
            "The route choice is not part of this world definition.");
    }

    public CobraCanyonTerrainSurface CreateTerrainSurface() => new(this);

    void Validate()
    {
        if (_routes.Count != 3)
            throw new InvalidOperationException("Cobra Canyon requires exactly three authored routes.");
        EnsureUnique(_routes.Select(route => route.Id), "route");
        EnsureUnique(_routes.Select(route => route.Choice.ToString()), "route choice");
        EnsureUnique(_landmarks.Select(landmark => landmark.Id), "landmark");
        EnsureUnique(_obstacles.Select(obstacle => obstacle.Id), "obstacle");
        EnsureUnique(_threatObservers.Select(observer => observer.Id), "threat observer");
        EnsureUnique(_terrainPatches.Select(patch => patch.Id), "terrain patch");

        var landmarkIds = _landmarks.Select(landmark => landmark.Id).ToHashSet(StringComparer.Ordinal);
        CobraCanyonRoutePoint sharedStart = _routes[0].Points[0];
        CobraCanyonRoutePoint sharedFinish = _routes[0].Points[^1];
        foreach (CobraCanyonRouteDefinition route in _routes) {
            foreach (CobraCanyonRoutePoint point in route.Points) {
                CobraCanyonObstacleDefinition.RequireStableId(point.Id, nameof(point.Id));
                RequireInside(point.EastM, point.NorthM, point.Id);
                if (!double.IsFinite(point.PathAltitudeM))
                    throw new ArgumentOutOfRangeException(nameof(point.PathAltitudeM));
                RequirePositive(point.TargetAglM, nameof(point.TargetAglM));
                RequirePositive(point.CorridorRadiusM, nameof(point.CorridorRadiusM));
                if (point.LandmarkId is not null && !landmarkIds.Contains(point.LandmarkId))
                    throw new InvalidOperationException(
                        $"Route point '{point.Id}' refers to an unknown landmark.");
            }
            CobraCanyonRoutePoint start = route.Points[0];
            CobraCanyonRoutePoint finish = route.Points[^1];
            if (start.EastM != sharedStart.EastM || start.NorthM != sharedStart.NorthM)
                throw new InvalidOperationException("All route choices must share an explicit departure point.");
            if (finish.EastM != sharedFinish.EastM || finish.NorthM != sharedFinish.NorthM)
                throw new InvalidOperationException("All route choices must share an explicit objective point.");
        }

        foreach (CobraCanyonLandmarkDefinition landmark in _landmarks) {
            CobraCanyonObstacleDefinition.RequireStableId(landmark.Id, nameof(landmark.Id));
            if (string.IsNullOrWhiteSpace(landmark.Label))
                throw new InvalidOperationException("Landmarks require display labels.");
            if (!landmark.PositionLocalM.IsFinite)
                throw new InvalidOperationException($"Landmark '{landmark.Id}' is not finite.");
            RequireInside(landmark.EastM, landmark.NorthM, landmark.Id);
        }
        foreach (CobraCanyonObstacleDefinition obstacle in _obstacles) {
            RequireInside(obstacle.FirstLocalM.X,
                obstacle.FirstLocalM.Z, obstacle.Id);
            RequireInside(obstacle.SecondLocalM.X,
                obstacle.SecondLocalM.Z, obstacle.Id);
        }
        foreach (CobraCanyonThreatObserverDefinition observer in _threatObservers) {
            CobraCanyonObstacleDefinition.RequireStableId(observer.Id, nameof(observer.Id));
            RequireInside(observer.EastM, observer.NorthM, observer.Id);
            RequirePositive(observer.ObserverHeightAglM, nameof(observer.ObserverHeightAglM));
            RequirePositive(observer.MaximumAssessmentRangeM,
                nameof(observer.MaximumAssessmentRangeM));
        }
        if (_terrainPatches.Count != 3)
            throw new InvalidOperationException("Cobra Canyon requires exactly three hero-cell terrain patches.");
        foreach (CobraCanyonTerrainPatchDefinition patch in _terrainPatches) {
            CobraCanyonObstacleDefinition.RequireStableId(patch.Id, nameof(patch.Id));
            if (!patch.CentreLocalM.IsFinite)
                throw new InvalidOperationException($"Terrain patch '{patch.Id}' is not finite.");
            RequireInside(patch.CentreLocalM.X, patch.CentreLocalM.Z, patch.Id);
            RequirePositive(patch.RadiusM, nameof(patch.RadiusM));
            RequirePositive(patch.BlendWidthM, nameof(patch.BlendWidthM));
            if (!double.IsFinite(patch.UndulationM))
                throw new ArgumentOutOfRangeException(nameof(patch.UndulationM));
        }
    }

    void RequireInside(double eastM, double northM, string id)
    {
        if (!Bounds.Contains(eastM, northM))
            throw new InvalidOperationException($"'{id}' lies outside the authored world bounds.");
    }

    static void RequirePositive(double value, string parameterName)
    {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }

    static void EnsureUnique(IEnumerable<string> values, string kind)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (string value in values) {
            if (!seen.Add(value))
                throw new InvalidOperationException($"Duplicate {kind} identifier '{value}'.");
        }
    }

    static CobraCanyonRouteDefinition[] CreateRoutes()
    {
        return new[] {
            new CobraCanyonRouteDefinition(
                RiverGorgeRouteId,
                "River Gorge",
                CobraCanyonRouteChoice.RiverGorge,
                CobraCanyonRouteExposure.Low,
                "Nap-of-earth river following and bridge underpass with continuous terrain masking.",
                "Bridge deck and piers, paired gorge wires and narrowing canyon walls",
                new("point.river-gorge.00", -6_775.0, 202.0, -6_200.0, 28.0, 90.0,
                    "landmark.cobra-canyon.camp-ember.v1"),
                new("point.river-gorge.01", -6_500.0, 162.0, -6_200.0, 30.0, 120.0),
                new("point.river-gorge.02", -5_400.0, 147.0, -5_050.0, 30.0, 155.0),
                new("point.river-gorge.03", -4_550.0, 126.0, -3_650.0, 30.0, 155.0,
                    "landmark.cobra-canyon.long-fang-falls.v1"),
                new("point.river-gorge.04", -3_800.0, 108.0, -2_100.0, 30.0, 155.0),
                new("point.river-gorge.05", -2_750.0, 92.0, -550.0, 30.0, 155.0,
                    "landmark.cobra-canyon.iron-bell-bridge.v1"),
                new("point.river-gorge.06", -1_450.0, 102.0, 1_050.0, 30.0, 155.0),
                new("point.river-gorge.07", 0.0, 126.0, 2_700.0, 30.0, 155.0,
                    "landmark.cobra-canyon.karst-needles.v1"),
                new("point.river-gorge.08", 1_550.0, 151.0, 4_100.0, 30.0, 155.0),
                new("point.river-gorge.09", 3_350.0, 178.0, 5_200.0, 30.0, 155.0),
                new("point.river-gorge.10", 5_150.0, 210.0, 6_020.0, 30.0, 155.0),
                new("point.river-gorge.11", 6_500.0, 232.0, 5_600.0, 30.0, 155.0,
                    "landmark.cobra-canyon.north-rally-smoke.v1")),
            new CobraCanyonRouteDefinition(
                RidgeShadowRouteId,
                "Ridge Shadow",
                CobraCanyonRouteChoice.RidgeShadow,
                CobraCanyonRouteExposure.Medium,
                "Terrain masking, saddle crossing and ridge pop-up along the lee bench.",
                "Ridge crossings, radio mast guy wires and paired saddle wires",
                new("point.ridge-shadow.00", -6_775.0, 202.0, -6_200.0, 40.0, 120.0,
                    "landmark.cobra-canyon.camp-ember.v1"),
                new("point.ridge-shadow.01", -6_200.0, 258.0, -4_500.0, 40.0, 205.0),
                new("point.ridge-shadow.02", -5_700.0, 348.0, -2_550.0, 40.0, 205.0),
                new("point.ridge-shadow.03", -5_100.0, 423.0, -550.0, 40.0, 205.0),
                new("point.ridge-shadow.04", -4_380.0, 472.0, 1_500.0, 40.0, 205.0,
                    "landmark.cobra-canyon.split-tooth-ridge.v1"),
                new("point.ridge-shadow.05", -3_300.0, 505.0, 3_380.0, 40.0, 205.0,
                    "landmark.cobra-canyon.white-pagoda.v1"),
                new("point.ridge-shadow.06", -1_750.0, 526.0, 5_000.0, 40.0, 205.0,
                    "landmark.cobra-canyon.ridge-radio-mast.v1"),
                new("point.ridge-shadow.07", 250.0, 488.0, 6_200.0, 40.0, 205.0),
                new("point.ridge-shadow.08", 2_450.0, 421.0, 6_480.0, 40.0, 205.0),
                new("point.ridge-shadow.09", 4_400.0, 348.0, 6_200.0, 40.0, 205.0),
                new("point.ridge-shadow.10", 6_500.0, 258.0, 5_600.0, 40.0, 205.0,
                    "landmark.cobra-canyon.north-rally-smoke.v1")),
            new CobraCanyonRouteDefinition(
                RoadPlantationRouteId,
                "Road and Plantation",
                CobraCanyonRouteChoice.RoadPlantation,
                CobraCanyonRouteExposure.High,
                "Road following, plantation masking and a quarry break through the open basin.",
                "Long sight lines, three utility-wire levels and a water tower",
                new("point.road-plantation.00", -6_775.0, 202.0, -6_200.0, 27.0, 120.0,
                    "landmark.cobra-canyon.camp-ember.v1"),
                new("point.road-plantation.01", -4_450.0, 188.0, -5_900.0, 27.0, 235.0),
                new("point.road-plantation.02", -2_650.0, 203.0, -5_220.0, 27.0, 235.0),
                new("point.road-plantation.03", -900.0, 214.0, -4_350.0, 27.0, 235.0),
                new("point.road-plantation.04", 950.0, 226.0, -3_300.0, 27.0, 235.0,
                    "landmark.cobra-canyon.plantation-water-tower.v1"),
                new("point.road-plantation.05", 2_750.0, 242.0, -1_820.0, 27.0, 235.0,
                    "landmark.cobra-canyon.red-earth-quarry.v1"),
                new("point.road-plantation.06", 4_100.0, 254.0, -50.0, 27.0, 235.0,
                    "landmark.cobra-canyon.plantation-mill-stack.v1"),
                new("point.road-plantation.07", 5_200.0, 250.0, 1_970.0, 27.0, 235.0),
                new("point.road-plantation.08", 5_850.0, 241.0, 3_920.0, 27.0, 235.0),
                new("point.road-plantation.09", 6_500.0, 232.0, 5_600.0, 27.0, 235.0,
                    "landmark.cobra-canyon.north-rally-smoke.v1"))
        };
    }

    static CobraCanyonLandmarkDefinition[] CreateLandmarks() => new[] {
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.camp-ember.v1", "FSB Ember",
            CobraCanyonLandmarkKind.ForwardOperatingBase,
            // Broad upland bench surveyed for a protected 2.4 km final and reciprocal go-around.
            // The old gorge-edge pad had only one usable escape heading and put the base against
            // a cliff; Camp Ember now sits on the operationally viable bench south-west of Iron
            // Bell, clear of the terrain-authority river ribbon.
            new Vec3D(
                CampEmberOperations.CentreEastM,
                CampEmberOperations.PadElevationM,
                CampEmberOperations.CentreNorthM)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.long-fang-falls.v1", "Thac Nam Ngoi",
            CobraCanyonLandmarkKind.Waterfall,
            new Vec3D(-4_450.0, 236.0, -3_380.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.iron-bell-bridge.v1", "Cau Song Ma",
            CobraCanyonLandmarkKind.Bridge,
            new Vec3D(-2_710.0, 146.0, -500.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.karst-needles.v1", "Nui Da Voi",
            CobraCanyonLandmarkKind.RockSpires,
            new Vec3D(180.0, 440.0, 2_880.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.split-tooth-ridge.v1", "Deo Hai Rang",
            CobraCanyonLandmarkKind.RidgeGate,
            new Vec3D(-4_380.0, 626.0, 1_530.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.white-pagoda.v1", "Chua Trang",
            CobraCanyonLandmarkKind.Pagoda,
            new Vec3D(-3_500.0, 552.0, 3_050.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.ridge-radio-mast.v1", "Hill 610 Relay",
            CobraCanyonLandmarkKind.RadioMast,
            new Vec3D(-1_760.0, 610.0, 4_980.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.plantation-water-tower.v1", "Phu Rieng Plantation",
            CobraCanyonLandmarkKind.WaterTower,
            new Vec3D(300.0, 271.0, -3_920.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.red-earth-quarry.v1", "Dat Do Quarry",
            CobraCanyonLandmarkKind.OpenQuarry,
            new Vec3D(2_720.0, 270.0, -1_740.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.plantation-mill-stack.v1", "Phu Rieng Mill",
            CobraCanyonLandmarkKind.MillStack,
            new Vec3D(4_120.0, 312.0, -120.0)),
        new CobraCanyonLandmarkDefinition(
            "landmark.cobra-canyon.north-rally-smoke.v1", "Rally Point North",
            CobraCanyonLandmarkKind.SignalSmoke,
            new Vec3D(6_500.0, 246.0, 5_600.0))
    };

    static CobraCanyonObstacleDefinition[] CreateObstacles() => new[] {
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-deck.v1",
            new Vec3D(-2_775.0, 142.0, -516.0),
            new Vec3D(-2_645.0, 160.0, -484.0)),
        // The truss is one span in a complete crossing, not a disconnected obstacle floating
        // over the gorge. These two raised approaches join the roadway to the high banks. Their
        // conservative AABBs include the guardrails; the presentation draws the actual sloping
        // road inside those envelopes.
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-west-approach.v1",
            new Vec3D(-2_960.0, 136.0, -516.0),
            new Vec3D(-2_775.0, 148.0, -484.0)),
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-east-approach.v1",
            new Vec3D(-2_645.0, 136.0, -516.0),
            new Vec3D(-2_460.0, 148.0, -484.0)),
        // The river cell stays low beneath both long approaches. These intermediate piers are
        // collision authority as well as presentation anchors, so the joined roadway has an
        // honest ground-to-deck load path instead of floating on cosmetic legs.
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-west-approach-pier.v1",
            new Vec3D(-2_874.0, 92.0, -515.0),
            new Vec3D(-2_860.0, 142.0, -485.0)),
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-east-approach-pier.v1",
            new Vec3D(-2_560.0, 92.0, -515.0),
            new Vec3D(-2_546.0, 142.0, -485.0)),
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-west-pier.v1",
            new Vec3D(-2_771.0, 92.0, -515.0),
            new Vec3D(-2_757.0, 144.0, -485.0)),
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.iron-bell-east-pier.v1",
            new Vec3D(-2_663.0, 92.0, -515.0),
            new Vec3D(-2_649.0, 144.0, -485.0)),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.gorge-wire-low.v1",
            new Vec3D(-1_660.0, 139.0, 795.0),
            new Vec3D(-1_260.0, 139.0, 1_115.0), 0.22),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.gorge-wire-high.v1",
            new Vec3D(-1_658.0, 145.0, 792.0),
            new Vec3D(-1_258.0, 145.0, 1_112.0), 0.22),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.ridge-radio-mast.v1",
            new Vec3D(-1_760.0, 548.0, 4_980.0),
            new Vec3D(-1_760.0, 616.0, 4_980.0), 0.65),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.ridge-guy-west.v1",
            new Vec3D(-1_760.0, 606.0, 4_980.0),
            new Vec3D(-1_818.0, 548.0, 4_938.0), 0.16),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.ridge-guy-east.v1",
            new Vec3D(-1_760.0, 606.0, 4_980.0),
            new Vec3D(-1_701.0, 548.0, 5_021.0), 0.16),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.saddle-wire-low.v1",
            new Vec3D(-3_600.0, 552.0, 3_010.0),
            new Vec3D(-3_235.0, 552.0, 3_290.0), 0.20),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.saddle-wire-high.v1",
            new Vec3D(-3_598.0, 559.0, 3_007.0),
            new Vec3D(-3_233.0, 559.0, 3_287.0), 0.20),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.plantation-wire-one.v1",
            new Vec3D(565.0, 246.0, -3_620.0),
            new Vec3D(850.0, 246.0, -3_270.0), 0.18),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.plantation-wire-two.v1",
            new Vec3D(570.0, 251.0, -3_624.0),
            new Vec3D(855.0, 251.0, -3_274.0), 0.18),
        CobraCanyonObstacleDefinition.CapsuleSegment(
            "hazard.cobra-canyon.plantation-wire-three.v1",
            new Vec3D(575.0, 256.0, -3_628.0),
            new Vec3D(860.0, 256.0, -3_278.0), 0.18),
        CobraCanyonObstacleDefinition.AxisAlignedBox(
            "hazard.cobra-canyon.plantation-water-tower.v1",
            new Vec3D(291.0, 224.0, -3_929.0),
            new Vec3D(309.0, 272.0, -3_911.0))
    };

    static CobraCanyonThreatObserverDefinition[] CreateThreatObservers() => new[] {
        new CobraCanyonThreatObserverDefinition(
            "observer.quarry-overwatch.v1", -3_500.0, 500.0, 3.0, 4_800.0),
        new CobraCanyonThreatObserverDefinition(
            "observer.ridge-east.v1", 1_500.0, 2_800.0, 3.0, 5_500.0),
        new CobraCanyonThreatObserverDefinition(
            "observer.plantation-tower.v1", 2_300.0, -1_200.0, 48.0, 5_000.0)
    };

    static CobraCanyonTerrainPatchDefinition[] CreateTerrainPatches() => new[] {
        new CobraCanyonTerrainPatchDefinition(
            "cell.cobra-canyon.lower-gorge.v1",
            new Vec3D(-3_150.0, 112.0, -650.0),
            340.0, 250.0, 8.0),
        new CobraCanyonTerrainPatchDefinition(
            "cell.cobra-canyon.split-tooth-ridge.v1",
            new Vec3D(-3_850.0, 482.0, 2_050.0),
            560.0, 300.0, 11.0),
        new CobraCanyonTerrainPatchDefinition(
            "cell.cobra-canyon.red-earth-plantation.v1",
            new Vec3D(350.0, 224.0, -3_850.0),
            780.0, 380.0, 6.0)
    };
}

/// <summary>
/// Deterministic analytic terrain for the built-in world. Broad ridges, a carved river corridor,
/// rolling plantation ground and finite-difference normals provide real terrain samples without
/// binding simulation truth to a renderer or height-map import pipeline.
/// </summary>
public sealed class CobraCanyonTerrainSurface : ITerrainSurface
{
    const double NormalDerivativeHalfStepM = 2.0;
    const double CampEmberEastM = CampEmberOperations.CentreEastM;
    const double CampEmberNorthM = CampEmberOperations.CentreNorthM;
    const double CampEmberLevelRadiusM = CampEmberOperations.LevelApronRadiusM;
    const double CampEmberBlendRadiusM = CampEmberOperations.ApronBlendRadiusM;
    readonly CobraCanyonDefinition _definition;
    readonly CobraCanyonRouteDefinition _riverRoute;
    readonly IReadOnlyList<CobraCanyonRouteDefinition> _routes;
    readonly IReadOnlyList<CobraCanyonTerrainPatchDefinition> _terrainPatches;

    internal CobraCanyonTerrainSurface(CobraCanyonDefinition definition)
    {
        _definition = definition ?? throw new ArgumentNullException(nameof(definition));
        _riverRoute = definition.Route(CobraCanyonRouteChoice.RiverGorge);
        _routes = definition.Routes;
        _terrainPatches = definition.TerrainPatches;
    }

    public TerrainBounds Bounds => _definition.Bounds;
    public double HorizontalResolutionM => 25.0;

    public bool TrySample(double eastM, double northM, out TerrainSample sample)
    {
        if (!Bounds.Contains(eastM, northM)) {
            sample = default;
            return false;
        }

        double heightM = HeightM(eastM, northM);
        double eastMinusM = Math.Max(Bounds.MinimumEastM, eastM - NormalDerivativeHalfStepM);
        double eastPlusM = Math.Min(Bounds.MaximumEastM, eastM + NormalDerivativeHalfStepM);
        double northMinusM = Math.Max(Bounds.MinimumNorthM, northM - NormalDerivativeHalfStepM);
        double northPlusM = Math.Min(Bounds.MaximumNorthM, northM + NormalDerivativeHalfStepM);
        double eastSlope = (HeightM(eastPlusM, northM) - HeightM(eastMinusM, northM))
            / Math.Max(1e-9, eastPlusM - eastMinusM);
        double northSlope = (HeightM(eastM, northPlusM) - HeightM(eastM, northMinusM))
            / Math.Max(1e-9, northPlusM - northMinusM);
        Vec3D normal = new Vec3D(-eastSlope, 1.0, -northSlope).Normalized();
        double riverDistanceM = DistanceToRiverM(eastM, northM);
        TerrainSurfaceKind kind = riverDistanceM <= 38.0
            ? TerrainSurfaceKind.Water
            : TerrainSurfaceKind.Land;
        // The complete Camp Ember cut-and-fill apron is an authority-owned land surface.
        if (kind == TerrainSurfaceKind.Water && InsideCampEmberPad(eastM, northM))
            kind = TerrainSurfaceKind.Land;
        sample = new TerrainSample(heightM, normal, kind);
        return true;
    }

    /// <summary>Height without the four extra evaluations TrySample spends on its normal.</summary>
    public bool TryHeightM(double eastM, double northM, out double heightM)
    {
        if (!Bounds.Contains(eastM, northM)) {
            heightM = 0.0;
            return false;
        }
        heightM = HeightM(eastM, northM);
        return true;
    }

    double HeightM(double eastM, double northM)
    {
        double radiusM = Math.Sqrt(eastM * eastM + northM * northM);
        double rim = SmoothStep(5_100.0, 10_600.0, radiusM);
        RouteSample river = NearestRouteSample(_riverRoute, eastM, northM);
        double heightM = 248.0
            + 610.0 * rim * rim
            + 52.0
                * Math.Sin((eastM + northM * 0.37) / 1_430.0)
                * Math.Cos((northM - eastM * 0.21) / 1_170.0)
            + 26.0
                * Math.Sin((eastM - northM) / 510.0)
                * Math.Cos((eastM + northM) / 690.0)
            + RidgeReliefM * (RidgeFold(eastM, northM, RidgeBearingRad, RidgeWavelengthM) - 0.5)
            + CrossRidgeReliefM
                * (RidgeFold(eastM, northM, CrossRidgeBearingRad, CrossRidgeWavelengthM) - 0.5)
            + GorgeRimRiseM(river.DistanceM, river.SignedOffsetM);

        // CARVE ORDER — mirrors cobra_canyon_plan.js: land corridors, then hero-cell shaping, then
        // the river LAST. Water is a landscape's base level, so no road bench and no hero patch may
        // lift the channel; where the ridge bench converges on the river near the objective,
        // authored order used to let the bench win and the channel climbed 178 m uphill.
        foreach (CobraCanyonRouteDefinition route in _routes) {
            if (ReferenceEquals(route, _riverRoute)) continue;
            heightM = CarveCorridor(route, eastM, northM, heightM);
        }

        foreach (CobraCanyonTerrainPatchDefinition patch in _terrainPatches) {
            double eastOffsetM = eastM - patch.CentreLocalM.X;
            double northOffsetM = northM - patch.CentreLocalM.Z;
            double distanceM = Math.Sqrt(
                eastOffsetM * eastOffsetM + northOffsetM * northOffsetM);
            double blend = 1.0 - SmoothStep(
                patch.RadiusM * 0.72,
                patch.RadiusM + patch.BlendWidthM,
                distanceM);
            if (blend <= 0.0) continue;
            double localReliefM = patch.UndulationM * 0.5
                * (Math.Sin(eastOffsetM / 185.0)
                    + Math.Cos(northOffsetM / 225.0));
            double targetElevationM = patch.CentreLocalM.Y + localReliefM;
            heightM += (targetElevationM - heightM) * blend;
        }

        heightM = CarveCorridor(_riverRoute, eastM, northM, heightM);

        // Level the complete medium FOB last, then blend its cut-and-fill bench back into the
        // authored terrain. The browser planner mirrors this operation exactly.
        // A square construction bench aligns with the terrain grid and keeps every triangle under
        // the operational compound exactly level; the irregular laterite scar hides its geometry.
        double campDistanceM = Math.Max(
            Math.Abs(eastM - CampEmberEastM),
            Math.Abs(northM - CampEmberNorthM));
        double campBlend = 1.0 - SmoothStep(
            CampEmberLevelRadiusM,
            CampEmberBlendRadiusM,
            campDistanceM);
        if (campBlend > 0.0) {
            double campElevationM = CampEmberOperations.PadElevationM;
            heightM += (campElevationM - heightM) * campBlend;
        }

        if (!double.IsFinite(heightM))
            throw new InvalidOperationException("Cobra Canyon terrain sample was not finite.");
        return heightM;
    }

    double CarveCorridor(
        CobraCanyonRouteDefinition route,
        double eastM,
        double northM,
        double heightM)
    {
        RouteSample sample = NearestRouteSample(route, eastM, northM);
        (double halfWidthM, double blendWidthM, double bankRiseM, double floorFraction) =
            RibbonParameters(route.Choice);
        // Flat floor first, then the bank: the climb is measured from the OUTER edge of the floor,
        // not from the centreline, so the inner fraction of the corridor is level ground.
        double floorEdgeM = halfWidthM * floorFraction;
        double normalizedCrossing = halfWidthM > floorEdgeM
            ? Math.Clamp((sample.DistanceM - floorEdgeM) / (halfWidthM - floorEdgeM), 0.0, 1.0)
            : 1.0;
        double targetElevationM = sample.PathAltitudeM
            + bankRiseM * normalizedCrossing * normalizedCrossing;
        double blend = 1.0 - SmoothStep(
            halfWidthM, halfWidthM + blendWidthM, sample.DistanceM);
        return heightM + (targetElevationM - heightM) * blend;
    }

    // Ridged relief: `1 - |sin|` cusps at its crest and rounds at its hollow, which is the shape a
    // drainage-carved upland has. The macro/meso sine products can only make a smooth egg-carton,
    // and an egg-carton is the "rolling farmland" read this world is not supposed to have. The
    // wavelengths stay well clear of the browser's 100 m render grid so crests do not alias.
    const double RidgeReliefM = 152.0;
    const double RidgeWavelengthM = 2_350.0;
    const double RidgeBearingRad = 0.66;
    const double CrossRidgeReliefM = 82.0;
    const double CrossRidgeWavelengthM = 1_450.0;
    const double CrossRidgeBearingRad = -0.82;

    // Gorge rim: a raised lip flanking the river, peaking at GorgeCrestM and decaying back toward
    // the plain. A lip, not a plateau step — a step would lift the far half of the world and drown
    // the road and ridge routes, whose authored altitudes are gameplay authority. Asymmetric,
    // because a river undercuts one bank and terraces the other, and because this world wants a
    // masking ridge on the north-west bank and an exposed plantation basin on the south-east.
    const double GorgeInnerM = 180.0;
    const double GorgeCrestM = 660.0;
    const double GorgeFalloffM = 2_300.0;
    const double GorgeFalloffRetain = 0.24;
    const double GorgeLeftRiseM = 218.0;
    const double GorgeRightRiseM = 92.0;
    const double GorgeSideBlendM = 380.0;

    static double RidgeFold(
        double eastM, double northM, double bearingRad, double wavelengthM)
    {
        double along = (eastM * Math.Cos(bearingRad) + northM * Math.Sin(bearingRad))
            / wavelengthM;
        return 1.0 - Math.Abs(Math.Sin(along * Math.PI));
    }

    static double GorgeRimRiseM(double distanceM, double signedOffsetM)
    {
        double side = Math.Clamp(signedOffsetM / GorgeSideBlendM, -1.0, 1.0);
        double riseM = GorgeRightRiseM
            + (GorgeLeftRiseM - GorgeRightRiseM) * (side * 0.5 + 0.5);
        double lip = SmoothStep(GorgeInnerM, GorgeCrestM, distanceM)
            * (1.0 - SmoothStep(GorgeCrestM * 1.4, GorgeFalloffM, distanceM)
                * (1.0 - GorgeFalloffRetain));
        return riseM * lip;
    }

    double DistanceToRiverM(double eastM, double northM)
    {
        return NearestRouteSample(_riverRoute, eastM, northM).DistanceM;
    }

    /// <summary>
    /// Pad ring around Camp Ember landmark — forced Land so the shared route departure on the
    /// river polyline cannot classify the FOB as water.
    /// </summary>
    static bool InsideCampEmberPad(double eastM, double northM)
    {
        double east = eastM - CampEmberEastM;
        double north = northM - CampEmberNorthM;
        return Math.Max(Math.Abs(east), Math.Abs(north)) <= CampEmberBlendRadiusM;
    }

    readonly record struct RouteSample(
        double DistanceM, double PathAltitudeM, double SignedOffsetM);

    /// <summary>
    /// Nearest point on a route centreline, with the signed lateral offset. Positive is the left
    /// bank looking downstream — the polylines run south-west to north-east, so left is north-west.
    /// </summary>
    static RouteSample NearestRouteSample(
        CobraCanyonRouteDefinition route,
        double eastM,
        double northM)
    {
        double minimumSquaredM = double.MaxValue;
        double nearestAltitudeM = route.Points[0].PathAltitudeM;
        double signedOffsetM = 0.0;
        IReadOnlyList<CobraCanyonRoutePoint> points = route.Points;
        for (int index = 1; index < points.Count; index++) {
            CobraCanyonRoutePoint first = points[index - 1];
            CobraCanyonRoutePoint second = points[index];
            double deltaEastM = second.EastM - first.EastM;
            double deltaNorthM = second.NorthM - first.NorthM;
            double lengthSquaredM = deltaEastM * deltaEastM + deltaNorthM * deltaNorthM;
            double fraction = lengthSquaredM <= 1e-12
                ? 0.0
                : Math.Clamp(((eastM - first.EastM) * deltaEastM
                    + (northM - first.NorthM) * deltaNorthM) / lengthSquaredM, 0.0, 1.0);
            double nearestEastM = first.EastM + deltaEastM * fraction;
            double nearestNorthM = first.NorthM + deltaNorthM * fraction;
            double offsetEastM = eastM - nearestEastM;
            double offsetNorthM = northM - nearestNorthM;
            double squaredM = offsetEastM * offsetEastM + offsetNorthM * offsetNorthM;
            if (squaredM >= minimumSquaredM) continue;
            minimumSquaredM = squaredM;
            nearestAltitudeM = Lerp(
                first.PathAltitudeM, second.PathAltitudeM, fraction);
            double lengthM = Math.Max(1e-9, Math.Sqrt(lengthSquaredM));
            signedOffsetM = (offsetEastM * -deltaNorthM + offsetNorthM * deltaEastM) / lengthM;
        }
        return new RouteSample(Math.Sqrt(minimumSquaredM), nearestAltitudeM, signedOffsetM);
    }

    static (double HalfWidthM, double BlendWidthM, double BankRiseM, double FloorFraction)
        RibbonParameters(CobraCanyonRouteChoice choice) => choice switch {
            CobraCanyonRouteChoice.RiverGorge => (185.0, 190.0, 46.0, 0.66),
            CobraCanyonRouteChoice.RidgeShadow => (205.0, 430.0, 54.0, 0.0),
            CobraCanyonRouteChoice.RoadPlantation => (235.0, 470.0, 24.0, 0.34),
            _ => throw new ArgumentOutOfRangeException(nameof(choice))
        };

    static double SmoothStep(double minimum, double maximum, double value)
    {
        if (maximum <= minimum) return value >= maximum ? 1.0 : 0.0;
        double fraction = Math.Clamp((value - minimum) / (maximum - minimum), 0.0, 1.0);
        return fraction * fraction * (3.0 - 2.0 * fraction);
    }

    static double Lerp(double first, double second, double fraction) =>
        first + (second - first) * fraction;
}
