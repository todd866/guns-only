using System;
using System.Collections.Generic;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Fail-closed loader for the retained Web-authored Weekend circuit scene. The manifest contains
/// the actual Three leaf geometry/materials/transforms plus the exact sim route used to build it.
/// Unity may present those bytes; it may not reinterpret them as gameplay or route authority.
/// </summary>
public static class WeekendCircuitPresentationResource {
    public const string Schema = "guns-only.weekend-track-day-scene.v1";
    public const string ExpectedSemanticSha256 =
        "325fa88219e8f3929a684be8d7090519ac94d94f979d982d428793fe7d5a0ad4";
    public const string ResourcePath =
        "GunsOnly/WeekendRide/Circuit/weekend-track-day-presentation-v1";

    static WeekendCircuitPresentationFrame _cached;

    public static WeekendCircuitPresentationFrame Load() {
        if (_cached != null) return _cached;
        TextAsset asset = Resources.Load<TextAsset>(ResourcePath);
        if (asset == null)
            throw new InvalidOperationException("Weekend circuit presentation resource is missing.");
        WeekendCircuitPresentationFrame frame =
            JsonUtility.FromJson<WeekendCircuitPresentationFrame>(asset.text);
        ValidateOrThrow(frame);
        _cached = frame;
        return frame;
    }

    public static void ValidateRouteOrThrow(
        WeekendCircuitPresentationFrame frame,
        HostClient.WeekendRouteFrame route
    ) {
        if (frame == null || route == null || !route.Validate())
            throw new InvalidOperationException("Weekend runtime route is invalid.");
        HostClient.WeekendRouteFrame expected = frame.route_authority;
        Same(route.schema, expected.schema, "route.schema");
        Same(route.id, expected.id, "route.id");
        Same(route.mode, expected.mode, "route.mode");
        Same(route.route_kind, expected.route_kind, "route.route_kind");
        if (route.closed != expected.closed)
            throw new InvalidOperationException("Weekend route.closed differs from Web authority.");
        Near(route.track_width_m, expected.track_width_m, "route.track_width_m");
        Near(route.pavement_half_width_m, expected.pavement_half_width_m,
            "route.pavement_half_width_m");
        Near(route.surface_elevation_m, expected.surface_elevation_m,
            "route.surface_elevation_m");
        Near(route.circuit_length_m, expected.circuit_length_m, "route.circuit_length_m");
        SameRoutePose(route.start, expected.start, "route.start");
        SameRoutePose(route.paddock_access, expected.paddock_access, "route.paddock_access");
        if (route.sector_gate_progress.Length != expected.sector_gate_progress.Length)
            throw new InvalidOperationException("Weekend sector gate count differs from Web authority.");
        for (int index = 0; index < route.sector_gate_progress.Length; index++)
            Near(route.sector_gate_progress[index], expected.sector_gate_progress[index],
                "route.sector_gate_progress");
        if (route.centreline.Length != expected.centreline.Length)
            throw new InvalidOperationException("Weekend centreline count differs from Web authority.");
        for (int index = 0; index < route.centreline.Length; index++) {
            HostClient.WeekendRoutePoint actual = route.centreline[index];
            HostClient.WeekendRoutePoint reference = expected.centreline[index];
            Near(actual.x, reference.x, "route.centreline.x");
            Near(actual.y, reference.y, "route.centreline.y");
            Near(actual.z, reference.z, "route.centreline.z");
        }
    }

    public static Texture2D LoadTextureOrThrow(string id) {
        Texture2D texture = id switch {
            "TEX_WEEKEND_TRACK_ASPHALT_V1" =>
                WeekendRoadNetworkContractResource.LoadRoadTexture(),
            "TEX_WEEKEND_HINTERLAND_GROUND_V1" =>
                WeekendRoadNetworkContractResource.LoadGroundTexture(),
            "TEX_WEEKEND_FIELD_LANDCOVER_V1" =>
                Resources.Load<Texture2D>(
                    "GunsOnly/WeekendRide/OpenRoad/weekend-field-landcover-v1")
                ?? throw new InvalidOperationException(
                    "Weekend field landcover texture resource is missing."),
            "TEX_WEEKEND_ROADSIDE_ATLAS_V1" =>
                WeekendRoadNetworkContractResource.LoadRoadsideAtlas(),
            _ => throw new InvalidOperationException("Unknown Weekend circuit texture " + id),
        };
        texture.wrapMode = id == "TEX_WEEKEND_ROADSIDE_ATLAS_V1"
            ? TextureWrapMode.Clamp : TextureWrapMode.Mirror;
        texture.filterMode = FilterMode.Trilinear;
        texture.anisoLevel = Mathf.Max(8, texture.anisoLevel);
        return texture;
    }

    public static Color LinearSrgbHex(string hex) {
        Vector4 srgb = DisplaySrgbHexVector(hex);
        return new Color(
            srgb.x,
            srgb.y,
            srgb.z,
            1f).linear;
    }

    /// <summary>
    /// Raw output-sRGB values used by Three's unlit/fog uniforms after colorspace_fragment.
    /// Keep this a Vector4: Material.SetColor can apply project-space color conversion.
    /// </summary>
    public static Vector4 DisplaySrgbHexVector(string hex) {
        if (hex == null || hex.Length != 6
            || !int.TryParse(hex, System.Globalization.NumberStyles.HexNumber,
                System.Globalization.CultureInfo.InvariantCulture, out int value))
            throw new InvalidOperationException("Weekend presentation contains an invalid sRGB hex.");
        return new Vector4(
            ((value >> 16) & 0xff) / 255f,
            ((value >> 8) & 0xff) / 255f,
            (value & 0xff) / 255f,
            1f);
    }

    public static void ValidateOrThrow(WeekendCircuitPresentationFrame frame) {
        if (frame == null
            || frame.schema != Schema
            || frame.serialization != "canonical-json-v1"
            || frame.semantic_sha256 != ExpectedSemanticSha256
            || frame.source == null
            || frame.source.export_name != "createWeekendTrackDayPresentation"
            || frame.source.plan_schema != "guns-only.weekend-track-day-presentation.v1"
            || frame.route_authority == null
            || !frame.route_authority.Validate()
            || frame.coordinate_system == null
            || frame.coordinate_system.handedness != "right"
            || frame.coordinate_system.units != "metres"
            || frame.coordinate_system.forward != "-z/north"
            || frame.coordinate_system.matrix_layout != "three-column-major"
            || frame.render_profile == null
            || frame.render_profile.camera == null
            || frame.render_profile.fog == null
            || frame.render_profile.hemisphere == null
            || frame.render_profile.sun == null
            || frame.render_profile.sky == null
            || frame.render_profile.output_color_space != "srgb"
            || frame.render_profile.tone_mapping != "three-r160-aces-filmic"
            || frame.render_profile.tone_mapping_exposure != 1.04
            || frame.textures == null
            || frame.textures.Length != 4
            || frame.scene == null
            || frame.scene.root_name != "weekend-track-day"
            || frame.scene.leaves == null
            || frame.scene.leaf_count != frame.scene.leaves.Length
            || frame.scene.leaf_count != 110) {
            throw new InvalidOperationException("Weekend circuit presentation header is invalid.");
        }
        ValidateRenderProfile(frame.render_profile);
        ValidateTextures(frame.textures);
        var paths = new HashSet<string>(StringComparer.Ordinal);
        foreach (WeekendCircuitLeafFrame leaf in frame.scene.leaves) {
            if (leaf == null || string.IsNullOrEmpty(leaf.path) || !paths.Add(leaf.path)
                || leaf.world_matrix == null || leaf.world_matrix.Length != 16
                || leaf.geometry == null || leaf.material == null || leaf.render == null
                || leaf.instances == null) {
                throw new InvalidOperationException("Weekend circuit leaf header is invalid.");
            }
            FiniteArray(leaf.world_matrix, leaf.path + ".world_matrix");
            ValidateGeometry(leaf);
            ValidateMaterial(leaf.material, leaf.path);
        }
        string[] required = {
            "weekend-hinterland-ground", "weekend-circuit-verge",
            "weekend-field-patchwork-and-access-road", "weekend-field-hedgerows",
            "weekend-paddock-access-road", "weekend-paddock-access-delineator",
            "weekend-rolling-field-relief",
            "weekend-horizon-ridge", "weekend-horizon-silhouettes",
            "weekend-midfield-trees-roadside-atlas", "weekend-farm-buildings",
            "weekend-race-control", "weekend-pit-garage", "weekend-paved-shoulder",
            "weekend-track-surface", "weekend-track-curbs", "weekend-start-finish-gantry",
            "weekend-track-edge-lines", "weekend-runoff-edge-lines",
            "weekend-course-cones", "weekend-tyre-walls", "weekend-marshal-post",
            "weekend-paddock-canopy", "weekend-service-vehicle",
        };
        foreach (string token in required) {
            bool found = false;
            foreach (WeekendCircuitLeafFrame leaf in frame.scene.leaves) {
                if (leaf.path.Contains(token, StringComparison.Ordinal)) { found = true; break; }
            }
            if (!found) throw new InvalidOperationException(
                "Weekend circuit presentation is missing " + token + ".");
        }
    }

    static void ValidateRenderProfile(WeekendCircuitRenderProfileFrame profile) {
        Near(profile.camera.vertical_fov_deg, 68, "camera.vertical_fov_deg");
        Near(profile.camera.near_m, 0.25, "camera.near_m");
        Near(profile.camera.far_m, 24000, "camera.far_m");
        if (profile.background_srgb_hex != "96adb3"
            || profile.fog.model != "exp2" || profile.fog.srgb_hex != "a8b8b7"
            || profile.hemisphere.sky_srgb_hex != "f4f8f4"
            || profile.hemisphere.ground_srgb_hex != "67745f"
            || profile.sun.srgb_hex != "ffefd1"
            || profile.sun.position == null || profile.sun.position.Length != 3
            || profile.sky.top_srgb_hex != "5791ad"
            || profile.sky.horizon_srgb_hex != "c5d5d5"
            || profile.sky.lower_haze_srgb_hex != "8aa6aa"
            || profile.sky.width_segments != 24 || profile.sky.height_segments != 12
            || profile.sky.side != "back" || profile.sky.fog || profile.sky.depth_write) {
            throw new InvalidOperationException("Weekend circuit render profile differs from Web.");
        }
        Near(profile.fog.density, 0.00016, "fog.density");
        Near(profile.hemisphere.intensity, 1.65, "hemisphere.intensity");
        Near(profile.sun.intensity, 2.05, "sun.intensity");
        Near(profile.sky.radius_m, 8000, "sky.radius_m");
        FiniteArray(profile.sun.position, "sun.position");
    }

    static void ValidateTextures(WeekendCircuitTextureFrame[] textures) {
        var expected = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["TEX_WEEKEND_TRACK_ASPHALT_V1"] =
                "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713",
            ["TEX_WEEKEND_HINTERLAND_GROUND_V1"] =
                "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1",
            ["TEX_WEEKEND_FIELD_LANDCOVER_V1"] =
                "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d",
            ["TEX_WEEKEND_ROADSIDE_ATLAS_V1"] =
                "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf",
        };
        foreach (WeekendCircuitTextureFrame texture in textures) {
            if (texture == null || !expected.Remove(texture.id, out string sha)
                || texture.sha256 != sha || texture.color_space != "srgb"
                || texture.wrap != (texture.id == "TEX_WEEKEND_ROADSIDE_ATLAS_V1"
                    ? "clamp" : "mirrored-repeat")
                || texture.anisotropy_max != 8
                || string.IsNullOrEmpty(texture.unity_resource)) {
                throw new InvalidOperationException("Weekend circuit texture identity is invalid.");
            }
        }
        if (expected.Count != 0)
            throw new InvalidOperationException("Weekend circuit texture identity is incomplete.");
    }

    static void ValidateGeometry(WeekendCircuitLeafFrame leaf) {
        WeekendCircuitGeometryFrame geometry = leaf.geometry;
        if (geometry.vertex_count < 3 || geometry.vertex_count > 1_000_000)
            throw new InvalidOperationException("Weekend vertex count is invalid at " + leaf.path);
        if (!Attribute(geometry.position, geometry.vertex_count, 3))
            throw new InvalidOperationException("Weekend positions are invalid at " + leaf.path);
        if (geometry.normal?.values != null
            && !Attribute(geometry.normal, geometry.vertex_count, 3))
            throw new InvalidOperationException("Weekend normals are invalid at " + leaf.path);
        if (geometry.uv?.values != null
            && !Attribute(geometry.uv, geometry.vertex_count, 2))
            throw new InvalidOperationException("Weekend UVs are invalid at " + leaf.path);
        if (geometry.color?.values != null
            && !Attribute(geometry.color, geometry.vertex_count, 3))
            throw new InvalidOperationException("Weekend colors are invalid at " + leaf.path);
        if (geometry.indices == null
            || (geometry.indices.Length != 0 && geometry.indices.Length % 3 != 0))
            throw new InvalidOperationException("Weekend indices are invalid at " + leaf.path);
        foreach (int index in geometry.indices)
            if (index < 0 || index >= geometry.vertex_count)
                throw new InvalidOperationException("Weekend geometry index is out of range.");
        bool instanced = leaf.kind == "instanced-mesh";
        if (instanced) {
            if (leaf.instances.count < 1 || leaf.instances.count > 4096
                || leaf.instances.matrices == null
                || leaf.instances.matrices.Length != leaf.instances.count * 16
                || leaf.instances.colors_linear == null
                || (leaf.instances.colors_linear.Length != 0
                    && leaf.instances.colors_linear.Length != leaf.instances.count * 3)) {
                throw new InvalidOperationException("Weekend instance data is invalid.");
            }
            FiniteArray(leaf.instances.matrices, leaf.path + ".instances.matrices");
            FiniteArray(leaf.instances.colors_linear, leaf.path + ".instances.colors");
        } else if (leaf.kind != "mesh" || leaf.instances.count != 0
            || leaf.instances.matrices == null || leaf.instances.matrices.Length != 0
            || leaf.instances.colors_linear == null || leaf.instances.colors_linear.Length != 0) {
            throw new InvalidOperationException("Weekend non-instance leaf carries instances.");
        }
    }

    static bool Attribute(WeekendCircuitAttributeFrame value, int count, int size) {
        if (value == null || value.item_size != size || value.values == null
            || value.values.Length != count * size) return false;
        FiniteArray(value.values, "geometry.attribute");
        return true;
    }

    static void ValidateMaterial(WeekendCircuitMaterialFrame material, string path) {
        if (material.model != "mesh-basic" && material.model != "mesh-standard")
            throw new InvalidOperationException("Weekend material model is invalid at " + path);
        if (material.color_linear == null || material.color_linear.Length != 3)
            throw new InvalidOperationException("Weekend material color is invalid at " + path);
        if (!double.IsFinite(material.alpha_test)
            || material.alpha_test < 0 || material.alpha_test > 1)
            throw new InvalidOperationException("Weekend alpha test is invalid at " + path);
        if (!material.fog)
            throw new InvalidOperationException("Weekend material fog is disabled at " + path);
        FiniteArray(material.color_linear, path + ".material.color");
        if (material.side != "front" && material.side != "back" && material.side != "double")
            throw new InvalidOperationException("Weekend material side is invalid at " + path);
        // JsonUtility can materialize `map:null` as an empty object, so presence is
        // defined by the exported stable texture id rather than DTO allocation.
        if (material.map != null && !string.IsNullOrEmpty(material.map.id)) {
            if (material.map.id != "TEX_WEEKEND_TRACK_ASPHALT_V1"
                && material.map.id != "TEX_WEEKEND_HINTERLAND_GROUND_V1"
                && material.map.id != "TEX_WEEKEND_FIELD_LANDCOVER_V1"
                && material.map.id != "TEX_WEEKEND_ROADSIDE_ATLAS_V1")
                throw new InvalidOperationException("Weekend material map is unknown at " + path);
            if (material.map.color_space != "srgb" || material.map.repeat == null
                || material.map.repeat.Length != 2)
                throw new InvalidOperationException("Weekend material map state is invalid.");
            FiniteArray(material.map.repeat, path + ".material.map.repeat");
        }
    }

    static void SameRoutePose(
        HostClient.WeekendRouteStart actual,
        HostClient.WeekendRouteStart expected,
        string label
    ) {
        if (actual == null || expected == null)
            throw new InvalidOperationException(label + " is missing.");
        Near(actual.x, expected.x, label + ".x");
        Near(actual.y, expected.y, label + ".y");
        Near(actual.z, expected.z, label + ".z");
        Near(actual.heading_rad, expected.heading_rad, label + ".heading_rad");
    }

    static void Same(string actual, string expected, string label) {
        if (!string.Equals(actual, expected, StringComparison.Ordinal))
            throw new InvalidOperationException(label + " differs from Web authority.");
    }

    static void Near(double actual, double expected, string label) {
        if (!double.IsFinite(actual) || !double.IsFinite(expected)
            || Math.Abs(actual - expected) > 1e-9)
            throw new InvalidOperationException(label + " differs from Web authority.");
    }

    static void FiniteArray(double[] values, string label) {
        foreach (double value in values)
            if (!double.IsFinite(value))
                throw new InvalidOperationException(label + " contains a non-finite value.");
    }
}

[Serializable]
public sealed class WeekendCircuitPresentationFrame {
    public string schema;
    public string serialization;
    public string semantic_sha256;
    public string authority_route_sha256;
    public WeekendCircuitSourceFrame source;
    public HostClient.WeekendRouteFrame route_authority;
    public WeekendCircuitCoordinateFrame coordinate_system;
    public WeekendCircuitRenderProfileFrame render_profile;
    public WeekendCircuitTextureFrame[] textures;
    public WeekendCircuitSceneFrame scene;
}

[Serializable] public sealed class WeekendCircuitSourceFrame {
    public string module; public string export_name; public string source_sha256; public string plan_schema;
}
[Serializable] public sealed class WeekendCircuitCoordinateFrame {
    public string handedness; public string units; public string right; public string up;
    public string forward; public string unity_conversion; public string matrix_layout;
}
[Serializable] public sealed class WeekendCircuitRenderProfileFrame {
    public string output_color_space; public string tone_mapping; public double tone_mapping_exposure;
    public WeekendCircuitCameraFrame camera; public string background_srgb_hex;
    public WeekendCircuitFogFrame fog; public WeekendCircuitHemisphereFrame hemisphere;
    public WeekendCircuitSunFrame sun; public WeekendCircuitSkyFrame sky;
}
[Serializable] public sealed class WeekendCircuitCameraFrame {
    public double vertical_fov_deg; public double near_m; public double far_m;
}
[Serializable] public sealed class WeekendCircuitFogFrame {
    public string model; public string srgb_hex; public double density;
}
[Serializable] public sealed class WeekendCircuitHemisphereFrame {
    public string sky_srgb_hex; public string ground_srgb_hex; public double intensity;
}
[Serializable] public sealed class WeekendCircuitSunFrame {
    public string srgb_hex; public double intensity; public double[] position; public bool casts_shadow;
}
[Serializable] public sealed class WeekendCircuitSkyFrame {
    public double radius_m; public int width_segments; public int height_segments;
    public string top_srgb_hex; public string horizon_srgb_hex; public string lower_haze_srgb_hex;
    public bool depth_write; public bool fog; public string side;
}
[Serializable] public sealed class WeekendCircuitTextureFrame {
    public string id; public string source; public string unity_resource; public string sha256;
    public string color_space; public string wrap; public string min_filter; public string mag_filter;
    public int anisotropy_max;
}
[Serializable] public sealed class WeekendCircuitSceneFrame {
    public string root_name; public int leaf_count; public WeekendCircuitLeafFrame[] leaves;
}
[Serializable] public sealed class WeekendCircuitLeafFrame {
    public string path; public string name; public string kind; public double[] world_matrix;
    public WeekendCircuitGeometryFrame geometry; public WeekendCircuitInstancesFrame instances;
    public WeekendCircuitMaterialFrame material; public WeekendCircuitRenderFrame render;
}
[Serializable] public sealed class WeekendCircuitGeometryFrame {
    public string type; public int vertex_count; public WeekendCircuitAttributeFrame position;
    public WeekendCircuitAttributeFrame normal; public WeekendCircuitAttributeFrame uv;
    public WeekendCircuitAttributeFrame color; public int[] indices;
}
[Serializable] public sealed class WeekendCircuitAttributeFrame {
    public int item_size; public bool normalized; public double[] values;
}
[Serializable] public sealed class WeekendCircuitInstancesFrame {
    public int count; public double[] matrices; public double[] colors_linear;
}
[Serializable] public sealed class WeekendCircuitMaterialFrame {
    public string model; public double[] color_linear; public double roughness; public double metalness;
    public bool vertex_colors; public string side; public bool transparent; public double opacity;
    public double alpha_test; public bool depth_write; public bool fog; public bool polygon_offset;
    public double polygon_offset_factor; public double polygon_offset_units;
    public WeekendCircuitMapFrame map;
}
[Serializable] public sealed class WeekendCircuitMapFrame {
    public string id; public string color_space; public int wrap_s; public int wrap_t;
    public double[] repeat; public bool flip_y;
}
[Serializable] public sealed class WeekendCircuitRenderFrame {
    public bool visible; public bool frustum_culled; public int render_order;
    public bool cast_shadow; public bool receive_shadow;
}

}
