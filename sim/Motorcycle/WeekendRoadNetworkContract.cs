using System.Text.Json;
using System.Text.Json.Serialization;

namespace GunsOnly.Sim.Motorcycle;

public readonly record struct WeekendRoadNetworkPointContract(
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y,
    [property: JsonPropertyName("z")] double Z);

public sealed record WeekendRoadContract(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("road_class")] string RoadClass,
    [property: JsonPropertyName("paved_width_m")] double PavedWidthM,
    [property: JsonPropertyName("length_m")] double LengthM,
    [property: JsonPropertyName("centreline")]
        IReadOnlyList<WeekendRoadNetworkPointContract> Centreline);

public sealed record WeekendRoadJunctionContract(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("center")] WeekendRoadNetworkPointContract Center,
    [property: JsonPropertyName("paved_radius_m")] double PavedRadiusM,
    [property: JsonPropertyName("road_ids")] IReadOnlyList<string> RoadIds);

public sealed record WeekendRoadSurfaceContract(
    [property: JsonPropertyName("asset_id")] string AssetId,
    [property: JsonPropertyName("pack_relative_uri")] string PackRelativeUri,
    [property: JsonPropertyName("sha256")] string Sha256,
    [property: JsonPropertyName("color_space")] string ColorSpace,
    [property: JsonPropertyName("wrap_mode")] string WrapMode,
    [property: JsonPropertyName("min_filter")] string MinFilter,
    [property: JsonPropertyName("mag_filter")] string MagFilter,
    [property: JsonPropertyName("metres_per_tile")] double MetresPerTile);

public sealed record WeekendRoadGeometryContract(
    [property: JsonPropertyName("coordinate_system")] string CoordinateSystem,
    [property: JsonPropertyName("road_footprint")] string RoadFootprint,
    [property: JsonPropertyName("road_lift_m")] double RoadLiftM,
    [property: JsonPropertyName("junction_radial_segments")] int JunctionRadialSegments,
    [property: JsonPropertyName("road_u_axis")] string RoadUAxis,
    [property: JsonPropertyName("road_v_axis")] string RoadVAxis,
    [property: JsonPropertyName("junction_uv_axes")] string JunctionUvAxes);

public sealed record WeekendRoadsideRegionContract(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("u_min")] double UMin,
    [property: JsonPropertyName("v_min_from_top")] double VMinFromTop,
    [property: JsonPropertyName("u_size")] double USize,
    [property: JsonPropertyName("v_size")] double VSize,
    [property: JsonPropertyName("base_width_m")] double BaseWidthM,
    [property: JsonPropertyName("base_height_m")] double BaseHeightM);

public sealed record WeekendRoadsideAtlasContract(
    [property: JsonPropertyName("asset_id")] string AssetId,
    [property: JsonPropertyName("pack_relative_uri")] string PackRelativeUri,
    [property: JsonPropertyName("sha256")] string Sha256,
    [property: JsonPropertyName("color_space")] string ColorSpace,
    [property: JsonPropertyName("alpha_mode")] string AlphaMode,
    [property: JsonPropertyName("alpha_cutoff")] double AlphaCutoff,
    [property: JsonPropertyName("mipmaps")] bool Mipmaps,
    [property: JsonPropertyName("region_origin")] string RegionOrigin,
    [property: JsonPropertyName("presentation_only")] bool PresentationOnly,
    [property: JsonPropertyName("regions")] IReadOnlyList<WeekendRoadsideRegionContract> Regions);

public sealed record WeekendRoadsideInstanceContract(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("region_id")] string RegionId,
    [property: JsonPropertyName("position")] WeekendRoadNetworkPointContract Position,
    [property: JsonPropertyName("heading_rad")] double HeadingRad,
    [property: JsonPropertyName("width_m")] double WidthM,
    [property: JsonPropertyName("height_m")] double HeightM);

/// <summary>
/// Versioned renderer-neutral graph export. It is generated from the authority centreline once;
/// Web and Unity consume these points and widths instead of carrying renderer-owned road layouts.
/// </summary>
public sealed record WeekendRoadNetworkContract(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("mode")] string Mode,
    [property: JsonPropertyName("route_kind")] string RouteKind,
    [property: JsonPropertyName("surface_elevation_m")] double SurfaceElevationM,
    [property: JsonPropertyName("maximum_sample_spacing_m")] double MaximumSampleSpacingM,
    [property: JsonPropertyName("circuit_access_point")]
        WeekendRoadNetworkPointContract CircuitAccessPoint,
    [property: JsonPropertyName("bounds_min")]
        WeekendRoadNetworkPointContract BoundsMin,
    [property: JsonPropertyName("bounds_max")]
        WeekendRoadNetworkPointContract BoundsMax,
    [property: JsonPropertyName("primary_route_id")] string PrimaryRouteId,
    [property: JsonPropertyName("primary_route_length_m")] double PrimaryRouteLengthM,
    [property: JsonPropertyName("primary_route_road_ids")] IReadOnlyList<string> PrimaryRouteRoadIds,
    [property: JsonPropertyName("geometry")] WeekendRoadGeometryContract Geometry,
    [property: JsonPropertyName("road_surface")] WeekendRoadSurfaceContract RoadSurface,
    [property: JsonPropertyName("world_ground_surface")]
        WeekendRoadSurfaceContract WorldGroundSurface,
    [property: JsonPropertyName("roadside_atlas")]
        WeekendRoadsideAtlasContract RoadsideAtlas,
    [property: JsonPropertyName("roadside_instances")]
        IReadOnlyList<WeekendRoadsideInstanceContract> RoadsideInstances,
    [property: JsonPropertyName("roads")] IReadOnlyList<WeekendRoadContract> Roads,
    [property: JsonPropertyName("junctions")] IReadOnlyList<WeekendRoadJunctionContract> Junctions)
{
    public const string CurrentSchema = "guns-only.weekend-road-network.v1";
    public const string WeekendRideMode = "weekend-ride";
    public const string RoadNetworkRouteKind = "connected-road-network";
    public const string CoordinateSystem = "left-handed-east-up-north-metres";
    public const double RoadLiftM = 0.065;
    public const int JunctionRadialSegments = 24;
    public const double RoadTextureMetresPerTile = 12.0;
    public const double GroundTextureMetresPerTile = 160.0;
    public const string RoadSurfaceSha256 =
        "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713";
    public const string GroundSurfaceSha256 =
        "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1";
    public const string RoadsideAtlasSha256 =
        "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf";
    public const double RoadsideAlphaCutoff = 0.42;

    static readonly JsonSerializerOptions CompactJson = new() {
        WriteIndented = false,
    };
    static readonly JsonSerializerOptions IndentedJson = new() {
        WriteIndented = true,
    };

    public static WeekendRoadNetworkContract FromNetwork(
        WeekendHinterlandRoadNetwork network)
    {
        ArgumentNullException.ThrowIfNull(network);
        WeekendRoadContract[] roads = network.Roads
            .Select(road => new WeekendRoadContract(
                road.Id,
                ClassToken(road.RoadClass),
                road.PavedWidthM,
                road.LengthM,
                Array.AsReadOnly(road.Centreline.Select(Point).ToArray())))
            .ToArray();
        WeekendRoadJunctionContract[] junctions = BuildJunctions(network.Roads);
        return new WeekendRoadNetworkContract(
            CurrentSchema,
            network.Id,
            WeekendRideMode,
            RoadNetworkRouteKind,
            WeekendHinterlandRoadNetwork.SurfaceElevationM,
            WeekendHinterlandRoadNetwork.MaximumSampleSpacingM,
            Point(network.CircuitAccessPointWorldM),
            Point(network.BoundsMinWorldM),
            Point(network.BoundsMaxWorldM),
            WeekendHinterlandRoadNetwork.PrimaryRouteId,
            network.PrimaryRouteLengthM,
            Array.AsReadOnly(network.PrimaryRouteRoadIds.ToArray()),
            new WeekendRoadGeometryContract(
                CoordinateSystem,
                "sampled-centreline-ribbon-with-junction-discs",
                RoadLiftM,
                JunctionRadialSegments,
                "distance-along-centreline-metres",
                "right-to-left-across-road-metres",
                "world-east-north-metres"),
            new WeekendRoadSurfaceContract(
                "environment.texture.weekend-track-asphalt.v1",
                "environment/textures/track-asphalt-v1.webp",
                RoadSurfaceSha256,
                "sRGB",
                "mirrored-repeat",
                "linear-mipmap-linear",
                "linear",
                RoadTextureMetresPerTile),
            new WeekendRoadSurfaceContract(
                "environment.texture.weekend-hinterland-ground.v1",
                "environment/textures/weekend-hinterland-ground-v1.webp",
                GroundSurfaceSha256,
                "sRGB",
                "mirrored-repeat",
                "linear-mipmap-linear",
                "linear",
                GroundTextureMetresPerTile),
            BuildRoadsideAtlas(),
            Array.AsReadOnly(BuildRoadsideInstances(network.Roads)),
            Array.AsReadOnly(roads),
            Array.AsReadOnly(junctions));
    }

    /// <summary>
    /// Builds the same paddock-connected graph as the live Weekend mission. Static exports and
    /// one-time renderer bridges must not silently fall back to the circuit start/finish point.
    /// </summary>
    public static WeekendRoadNetworkContract FromDefaultWeekendWorld()
    {
        PaintedCircuit circuit = PaintedCircuit.WeekendTrackDay();
        return FromNetwork(WeekendHinterlandRoadNetwork.CreateDefault(
            circuit.PaddockAccessPointWorldM));
    }

    public string ToJson(bool indented = false) =>
        JsonSerializer.Serialize(this, indented ? IndentedJson : CompactJson);

    static WeekendRoadJunctionContract[] BuildJunctions(IReadOnlyList<WeekendRoad> roads)
    {
        var endpoints = new List<Endpoint>();
        foreach (WeekendRoad road in roads)
        {
            endpoints.Add(new Endpoint(road, road.Centreline[0]));
            endpoints.Add(new Endpoint(road, road.Centreline[^1]));
        }

        var consumed = new bool[endpoints.Count];
        var junctions = new List<WeekendRoadJunctionContract>();
        for (int index = 0; index < endpoints.Count; index++)
        {
            if (consumed[index]) continue;
            Endpoint seed = endpoints[index];
            var roadIds = new List<string>();
            double pavedRadiusM = 0.0;
            for (int candidate = index; candidate < endpoints.Count; candidate++)
            {
                if (consumed[candidate]
                    || WeekendRoad.HorizontalDistance(seed.Point, endpoints[candidate].Point) > 1e-6)
                {
                    continue;
                }
                consumed[candidate] = true;
                roadIds.Add(endpoints[candidate].Road.Id);
                pavedRadiusM = Math.Max(
                    pavedRadiusM,
                    endpoints[candidate].Road.PavedWidthM * 0.5);
            }
            roadIds.Sort(StringComparer.Ordinal);
            string id = roadIds.Count > 1
                ? "junction." + string.Join("+", roadIds)
                : "terminal." + roadIds[0];
            junctions.Add(new WeekendRoadJunctionContract(
                id,
                Point(seed.Point),
                pavedRadiusM,
                Array.AsReadOnly(roadIds.ToArray())));
        }
        return junctions.ToArray();
    }

    static WeekendRoadsideAtlasContract BuildRoadsideAtlas()
    {
        WeekendRoadsideRegionContract[] regions =
        [
            new("eucalyptus", 0.0, 0.0, 0.5, 0.5, 18.0, 15.0),
            new("dry-grass", 0.5, 0.0, 0.5, 0.5, 5.5, 3.6),
            new("sandstone", 0.5, 0.5, 0.5, 0.5, 7.5, 3.8),
            new("scrub", 0.0, 0.5, 0.5, 0.5, 7.0, 4.6),
        ];
        return new WeekendRoadsideAtlasContract(
            "environment.foliage.weekend-roadside-atlas.v1",
            "environment/foliage/weekend-roadside-atlas-v1.png",
            RoadsideAtlasSha256,
            "sRGB",
            "cutout",
            RoadsideAlphaCutoff,
            Mipmaps: true,
            "top-left",
            PresentationOnly: true,
            Array.AsReadOnly(regions));
    }

    static WeekendRoadsideInstanceContract[] BuildRoadsideInstances(
        IReadOnlyList<WeekendRoad> roads)
    {
        string[] regionIds = ["eucalyptus", "dry-grass", "scrub", "sandstone"];
        var instances = new List<WeekendRoadsideInstanceContract>();
        for (int roadIndex = 0; roadIndex < roads.Count; roadIndex++)
        {
            WeekendRoad road = roads[roadIndex];
            int ordinal = 0;
            double targetM = 105.0 + roadIndex * 7.0;
            while (targetM < road.LengthM - 65.0)
            {
                (Vec3D center, Vec3D forward) = SampleAtDistance(road, targetM);
                int selector = roadIndex * 131 + ordinal * 47;
                double side = ((selector >> 1) & 1) == 0 ? -1.0 : 1.0;
                double setbackM = road.PavedWidthM * 0.5 + 8.0 + selector % 53 * 0.1;
                Vec3D right = new(forward.Z, 0.0, -forward.X);
                Vec3D position = center + right * (side * setbackM);
                Vec3D towardRoad = right * -side;
                string regionId = regionIds[(roadIndex + ordinal * 3) % regionIds.Length];
                WeekendRoadsideRegionContract region = RoadsideRegion(regionId);
                double scale = 0.86 + selector % 29 * 0.01;
                instances.Add(new WeekendRoadsideInstanceContract(
                    road.Id + ".roadside." + ordinal.ToString("D3"),
                    regionId,
                    Point(position),
                    Math.Atan2(towardRoad.X, towardRoad.Z),
                    region.BaseWidthM * scale,
                    region.BaseHeightM * scale));
                ordinal++;
                targetM += 145.0 + selector % 41;
            }
        }
        return instances.ToArray();
    }

    static WeekendRoadsideRegionContract RoadsideRegion(string id) => id switch {
        "eucalyptus" => new(id, 0.0, 0.0, 0.5, 0.5, 18.0, 15.0),
        "dry-grass" => new(id, 0.5, 0.0, 0.5, 0.5, 5.5, 3.6),
        "sandstone" => new(id, 0.5, 0.5, 0.5, 0.5, 7.5, 3.8),
        "scrub" => new(id, 0.0, 0.5, 0.5, 0.5, 7.0, 4.6),
        _ => throw new ArgumentOutOfRangeException(nameof(id), id, null),
    };

    static (Vec3D Point, Vec3D Forward) SampleAtDistance(
        WeekendRoad road,
        double targetM)
    {
        double travelledM = 0.0;
        for (int index = 0; index < road.Centreline.Count - 1; index++)
        {
            Vec3D start = road.Centreline[index];
            Vec3D end = road.Centreline[index + 1];
            double segmentM = WeekendRoad.HorizontalDistance(start, end);
            if (travelledM + segmentM < targetM)
            {
                travelledM += segmentM;
                continue;
            }
            double along = segmentM > 1e-9
                ? Math.Clamp((targetM - travelledM) / segmentM, 0.0, 1.0)
                : 0.0;
            Vec3D point = start + (end - start) * along;
            Vec3D forward = new(
                (end.X - start.X) / segmentM,
                0.0,
                (end.Z - start.Z) / segmentM);
            return (point, forward);
        }
        Vec3D fallbackStart = road.Centreline[^2];
        Vec3D fallbackEnd = road.Centreline[^1];
        double fallbackLengthM = WeekendRoad.HorizontalDistance(fallbackStart, fallbackEnd);
        return (fallbackEnd, new Vec3D(
            (fallbackEnd.X - fallbackStart.X) / fallbackLengthM,
            0.0,
            (fallbackEnd.Z - fallbackStart.Z) / fallbackLengthM));
    }

    static WeekendRoadNetworkPointContract Point(Vec3D point) =>
        new(point.X, point.Y, point.Z);

    static string ClassToken(WeekendRoadClass roadClass) => roadClass switch {
        WeekendRoadClass.CircuitAccess => "circuit-access",
        WeekendRoadClass.CountryLane => "country-lane",
        WeekendRoadClass.ScenicRoad => "scenic-road",
        WeekendRoadClass.VillageStreet => "village-street",
        _ => throw new ArgumentOutOfRangeException(nameof(roadClass), roadClass, null),
    };

    readonly record struct Endpoint(WeekendRoad Road, Vec3D Point);
}
