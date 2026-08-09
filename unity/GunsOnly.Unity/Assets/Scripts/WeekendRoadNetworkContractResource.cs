using System;
using System.Collections.Generic;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Unity's fail-closed reader for the renderer-neutral Weekend road graph. The JSON owns every
/// point, width, atlas region and roadside transform; this class only maps east/up/north into
/// Unity's east/up/negative-north scene axes.
/// </summary>
public static class WeekendRoadNetworkContractResource {
    public const string Schema = "guns-only.weekend-road-network.v1";
    public const string NetworkId = "weekend-hinterland.open-road.v1";
    public const string ResourcePath =
        "GunsOnly/WeekendRide/OpenRoad/weekend-hinterland-road-network-v1";
    public const string RoadTextureResourcePath =
        "GunsOnly/WeekendRide/OpenRoad/track-asphalt-v1";
    public const string GroundTextureResourcePath =
        "GunsOnly/WeekendRide/OpenRoad/weekend-hinterland-ground-v1";
    public const string RoadsideAtlasResourcePath =
        "GunsOnly/WeekendRide/OpenRoad/weekend-roadside-atlas-v1";
    public const string RoadContractSha256 =
        "1f4bb6f5c3f1cd6ecf56e112a3821a0b7375207ae1481e55d0ce9ddcb8b253bc";
    public const string RoadTextureSourceSha256 =
        "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713";
    public const string GroundTextureSourceSha256 =
        "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1";
    public const string RoadsideAtlasSha256 =
        "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf";

    public static WeekendRoadNetworkFrame Load() {
        TextAsset asset = Resources.Load<TextAsset>(ResourcePath);
        if (asset == null) {
            throw new InvalidOperationException(
                "Missing Weekend road graph at Resources/" + ResourcePath);
        }
        WeekendRoadNetworkFrame frame = JsonUtility.FromJson<WeekendRoadNetworkFrame>(asset.text);
        Validate(frame);
        return frame;
    }

    public static Texture2D LoadRoadTexture() => LoadTexture(RoadTextureResourcePath);
    public static Texture2D LoadGroundTexture() => LoadTexture(GroundTextureResourcePath);
    public static Texture2D LoadRoadsideAtlas() => LoadTexture(RoadsideAtlasResourcePath);

    public static Vector3 ToUnity(WeekendRoadPoint point) =>
        new((float)point.x, (float)point.y, (float)-point.z);

    public static void Validate(WeekendRoadNetworkFrame frame) {
        if (frame == null
            || frame.schema != Schema
            || frame.id != NetworkId
            || frame.mode != "weekend-ride"
            || frame.route_kind != "connected-road-network") {
            throw new InvalidOperationException("Weekend road graph identity changed.");
        }
        if (!Finite(frame.surface_elevation_m)
            || !(frame.maximum_sample_spacing_m > 0.0
                && frame.maximum_sample_spacing_m <= 25.0)
            || !Finite(frame.circuit_access_point)
            || !Finite(frame.bounds_min)
            || !Finite(frame.bounds_max)
            || !(frame.bounds_min.x < frame.bounds_max.x)
            || !(frame.bounds_min.z < frame.bounds_max.z)) {
            throw new InvalidOperationException("Weekend road world bounds are invalid.");
        }
        ValidateGeometry(frame.geometry);
        ValidateSurface(
            frame.road_surface,
            "environment.texture.weekend-track-asphalt.v1",
            RoadTextureSourceSha256,
            12.0);
        ValidateSurface(
            frame.world_ground_surface,
            "environment.texture.weekend-hinterland-ground.v1",
            GroundTextureSourceSha256,
            160.0);

        if (frame.roads == null || frame.roads.Length != 8) {
            throw new InvalidOperationException("Weekend road graph must contain eight roads.");
        }
        var roadIds = new HashSet<string>(StringComparer.Ordinal);
        double primaryLengthM = 0.0;
        foreach (WeekendRoadFrame road in frame.roads) {
            if (road == null || string.IsNullOrWhiteSpace(road.id) || !roadIds.Add(road.id)
                || !KnownRoadClass(road.road_class)
                || !(road.paved_width_m >= 3.0 && road.paved_width_m <= 20.0)
                || road.centreline == null
                || road.centreline.Length < 2
                || road.centreline.Length > 8_192) {
                throw new InvalidOperationException("Weekend road definition is malformed.");
            }
            double sampledLengthM = 0.0;
            for (int index = 0; index < road.centreline.Length; index++) {
                WeekendRoadPoint point = road.centreline[index];
                if (!Finite(point)
                    || Math.Abs(point.y - frame.surface_elevation_m) > 0.01) {
                    throw new InvalidOperationException(
                        "Weekend road left its authoritative surface elevation.");
                }
                if (index == 0) continue;
                double spacingM = HorizontalDistance(road.centreline[index - 1], point);
                if (!(spacingM > 0.001)
                    || spacingM > frame.maximum_sample_spacing_m * 1.025) {
                    throw new InvalidOperationException(
                        "Weekend road sampling contract changed.");
                }
                sampledLengthM += spacingM;
            }
            double toleranceM = Math.Max(0.01, road.length_m * 1e-6);
            if (!(road.length_m > 0.0)
                || Math.Abs(sampledLengthM - road.length_m) > toleranceM) {
                throw new InvalidOperationException(
                    "Weekend road length does not match its centreline.");
            }
        }
        if (frame.primary_route_road_ids == null
            || frame.primary_route_road_ids.Length != 4
            || frame.primary_route_id != "weekend-hinterland.scenic-loop.v1") {
            throw new InvalidOperationException("Weekend primary scenic route changed.");
        }
        foreach (string id in frame.primary_route_road_ids) {
            if (!roadIds.Contains(id)) {
                throw new InvalidOperationException(
                    "Weekend primary route references an unknown road.");
            }
            foreach (WeekendRoadFrame road in frame.roads) {
                if (road.id == id) primaryLengthM += road.length_m;
            }
        }
        if (frame.primary_route_length_m < 12_000.0
            || Math.Abs(primaryLengthM - frame.primary_route_length_m) > 0.02) {
            throw new InvalidOperationException("Weekend scenic loop lost its 12 km contract.");
        }
        if (frame.junctions == null || frame.junctions.Length != 7) {
            throw new InvalidOperationException("Weekend road junction graph changed.");
        }
        foreach (WeekendRoadJunctionFrame junction in frame.junctions) {
            if (junction == null || !Finite(junction.center)
                || !(junction.paved_radius_m > 0.0 && junction.paved_radius_m <= 12.0)
                || junction.road_ids == null || junction.road_ids.Length < 1) {
                throw new InvalidOperationException("Weekend road junction is malformed.");
            }
        }
        ValidateRoadside(frame, roadIds);
    }

    static void ValidateRoadside(
        WeekendRoadNetworkFrame frame,
        HashSet<string> roadIds
    ) {
        WeekendRoadsideAtlasFrame atlas = frame.roadside_atlas;
        if (atlas == null
            || atlas.asset_id != "environment.foliage.weekend-roadside-atlas.v1"
            || atlas.pack_relative_uri
                != "environment/foliage/weekend-roadside-atlas-v1.png"
            || atlas.sha256 != RoadsideAtlasSha256
            || atlas.color_space != "sRGB"
            || atlas.alpha_mode != "cutout"
            || Math.Abs(atlas.alpha_cutoff - 0.42) > 1e-9
            || !atlas.mipmaps
            || atlas.region_origin != "top-left"
            || !atlas.presentation_only
            || atlas.regions == null
            || atlas.regions.Length != 4) {
            throw new InvalidOperationException("Weekend roadside atlas contract changed.");
        }
        string[] expectedRegionIds = { "eucalyptus", "dry-grass", "sandstone", "scrub" };
        var regionIds = new HashSet<string>(StringComparer.Ordinal);
        for (int index = 0; index < atlas.regions.Length; index++) {
            WeekendRoadsideRegionFrame region = atlas.regions[index];
            if (region == null || region.id != expectedRegionIds[index]
                || !regionIds.Add(region.id)
                || !(region.u_size > 0.0 && region.v_size > 0.0)
                || !(region.base_width_m > 0.0 && region.base_height_m > 0.0)) {
                throw new InvalidOperationException("Weekend roadside atlas region changed.");
            }
        }
        if (frame.roadside_instances == null
            || frame.roadside_instances.Length != 144) {
            throw new InvalidOperationException("Weekend roadside population changed.");
        }
        var instanceIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (WeekendRoadsideInstanceFrame instance in frame.roadside_instances) {
            if (instance == null
                || string.IsNullOrWhiteSpace(instance.id)
                || !instanceIds.Add(instance.id)
                || !regionIds.Contains(instance.region_id)
                || !Finite(instance.position)
                || Math.Abs(instance.position.y - frame.surface_elevation_m) > 0.01
                || !Finite(instance.heading_rad)
                || !(instance.width_m >= 2.0 && instance.width_m <= 30.0)
                || !(instance.height_m >= 2.0 && instance.height_m <= 25.0)) {
                throw new InvalidOperationException(
                    "Weekend roadside instance is malformed.");
            }
            int separator = instance.id.IndexOf(".roadside.", StringComparison.Ordinal);
            if (separator <= 0 || !roadIds.Contains(instance.id.Substring(0, separator))) {
                throw new InvalidOperationException(
                    "Weekend roadside instance is not attached to an authority road id.");
            }
        }
    }

    static void ValidateGeometry(WeekendRoadGeometryFrame geometry) {
        if (geometry == null
            || geometry.coordinate_system != "left-handed-east-up-north-metres"
            || geometry.road_footprint
                != "sampled-centreline-ribbon-with-junction-discs"
            || Math.Abs(geometry.road_lift_m - 0.065) > 1e-9
            || geometry.junction_radial_segments != 24
            || geometry.road_u_axis != "distance-along-centreline-metres"
            || geometry.road_v_axis != "right-to-left-across-road-metres"
            || geometry.junction_uv_axes != "world-east-north-metres") {
            throw new InvalidOperationException("Weekend portable road geometry contract changed.");
        }
    }

    static void ValidateSurface(
        WeekendRoadSurfaceFrame surface,
        string assetId,
        string sha256,
        double metresPerTile
    ) {
        if (surface == null
            || surface.asset_id != assetId
            || surface.sha256 != sha256
            || surface.color_space != "sRGB"
            || surface.wrap_mode != "mirrored-repeat"
            || surface.min_filter != "linear-mipmap-linear"
            || surface.mag_filter != "linear"
            || Math.Abs(surface.metres_per_tile - metresPerTile) > 1e-9) {
            throw new InvalidOperationException(
                "Weekend surface import/UV contract changed for " + assetId);
        }
    }

    static Texture2D LoadTexture(string resourcePath) {
        Texture2D texture = Resources.Load<Texture2D>(resourcePath);
        if (texture == null) {
            throw new InvalidOperationException(
                "Missing Weekend presentation texture at Resources/" + resourcePath);
        }
        return texture;
    }

    static bool KnownRoadClass(string value) => value == "circuit-access"
        || value == "country-lane"
        || value == "scenic-road"
        || value == "village-street";

    static bool Finite(WeekendRoadPoint point) => point != null
        && Finite(point.x) && Finite(point.y) && Finite(point.z);

    static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);

    static double HorizontalDistance(WeekendRoadPoint a, WeekendRoadPoint b) {
        double eastM = b.x - a.x;
        double northM = b.z - a.z;
        return Math.Sqrt(eastM * eastM + northM * northM);
    }
}

[Serializable]
public sealed class WeekendRoadNetworkFrame {
    public string schema;
    public string id;
    public string mode;
    public string route_kind;
    public double surface_elevation_m;
    public double maximum_sample_spacing_m;
    public WeekendRoadPoint circuit_access_point;
    public WeekendRoadPoint bounds_min;
    public WeekendRoadPoint bounds_max;
    public string primary_route_id;
    public double primary_route_length_m;
    public string[] primary_route_road_ids;
    public WeekendRoadGeometryFrame geometry;
    public WeekendRoadSurfaceFrame road_surface;
    public WeekendRoadSurfaceFrame world_ground_surface;
    public WeekendRoadsideAtlasFrame roadside_atlas;
    public WeekendRoadsideInstanceFrame[] roadside_instances;
    public WeekendRoadFrame[] roads;
    public WeekendRoadJunctionFrame[] junctions;
}

[Serializable]
public sealed class WeekendRoadPoint {
    public double x;
    public double y;
    public double z;
}

[Serializable]
public sealed class WeekendRoadFrame {
    public string id;
    public string road_class;
    public double paved_width_m;
    public double length_m;
    public WeekendRoadPoint[] centreline;
}

[Serializable]
public sealed class WeekendRoadJunctionFrame {
    public string id;
    public WeekendRoadPoint center;
    public double paved_radius_m;
    public string[] road_ids;
}

[Serializable]
public sealed class WeekendRoadGeometryFrame {
    public string coordinate_system;
    public string road_footprint;
    public double road_lift_m;
    public int junction_radial_segments;
    public string road_u_axis;
    public string road_v_axis;
    public string junction_uv_axes;
}

[Serializable]
public sealed class WeekendRoadSurfaceFrame {
    public string asset_id;
    public string pack_relative_uri;
    public string sha256;
    public string color_space;
    public string wrap_mode;
    public string min_filter;
    public string mag_filter;
    public double metres_per_tile;
}

[Serializable]
public sealed class WeekendRoadsideAtlasFrame {
    public string asset_id;
    public string pack_relative_uri;
    public string sha256;
    public string color_space;
    public string alpha_mode;
    public double alpha_cutoff;
    public bool mipmaps;
    public string region_origin;
    public bool presentation_only;
    public WeekendRoadsideRegionFrame[] regions;
}

[Serializable]
public sealed class WeekendRoadsideRegionFrame {
    public string id;
    public double u_min;
    public double v_min_from_top;
    public double u_size;
    public double v_size;
    public double base_width_m;
    public double base_height_m;
}

[Serializable]
public sealed class WeekendRoadsideInstanceFrame {
    public string id;
    public string region_id;
    public WeekendRoadPoint position;
    public double heading_rad;
    public double width_m;
    public double height_m;
}

}
