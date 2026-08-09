using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Retained consumer for the exact Web-authored Weekend circuit scene manifest. Meshes are baked
/// into Web world coordinates; Unity reverses triangle winding exactly once for the engine
/// handedness convention. Nothing here owns route, grip, collision, scoring, or motorcycle state.
/// </summary>
public sealed class WeekendRideCircuitRenderer : MonoBehaviour {
    const string SurfaceShaderPath =
        "GunsOnly/WeekendRide/Circuit/WeekendCircuitParity";
    const string SkyShaderPath =
        "GunsOnly/WeekendRide/Circuit/WeekendCircuitSky";

    readonly List<Mesh> _meshes = new();
    readonly List<Material> _materials = new();
    readonly Dictionary<string, Texture2D> _textures =
        new(StringComparer.Ordinal);
    bool _built;

    public string RouteId { get; private set; }
    public string SemanticSha256 { get; private set; }
    public int LeafCount { get; private set; }

    public static WeekendRideCircuitRenderer Build(
        Transform parent,
        HostClient.WeekendRouteFrame route
    ) => Build(parent, route, WeekendCircuitPresentationResource.Load());

    public static WeekendRideCircuitRenderer Build(
        Transform parent,
        HostClient.WeekendRouteFrame route,
        WeekendCircuitPresentationFrame presentation
    ) {
        if (parent == null) throw new ArgumentNullException(nameof(parent));
        WeekendCircuitPresentationResource.ValidateOrThrow(presentation);
        WeekendCircuitPresentationResource.ValidateRouteOrThrow(presentation, route);

        var root = new GameObject(presentation.scene.root_name);
        root.transform.SetParent(parent, false);
        WeekendRideCircuitRenderer renderer = root.AddComponent<WeekendRideCircuitRenderer>();
        try {
            renderer.BuildPresentation(presentation);
            return renderer;
        } catch {
            Destroy(root);
            throw;
        }
    }

    void BuildPresentation(WeekendCircuitPresentationFrame presentation) {
        if (_built) throw new InvalidOperationException("Weekend circuit was already built.");
        RouteId = presentation.route_authority.id;
        SemanticSha256 = presentation.semantic_sha256;
        AddSky(presentation.render_profile);
        foreach (WeekendCircuitLeafFrame leaf in presentation.scene.leaves)
            AddLeaf(leaf, presentation.render_profile);
        LeafCount = presentation.scene.leaves.Length;
        _built = true;
    }

    void AddLeaf(
        WeekendCircuitLeafFrame leaf,
        WeekendCircuitRenderProfileFrame profile
    ) {
        Mesh mesh = BuildLeafMesh(leaf);
        Material material = BuildMaterial(
            leaf.material,
            profile,
            leaf.instances.colors_linear.Length != 0);
        var surface = new GameObject(LeafObjectName(leaf));
        surface.transform.SetParent(transform, false);
        surface.AddComponent<MeshFilter>().sharedMesh = mesh;
        MeshRenderer renderer = surface.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = material;
        renderer.enabled = leaf.render.visible;
        // Camera DepthTextureMode.Depth renders ShadowCaster passes. Keep every opaque retained
        // leaf eligible for that pass so the post-transform can reproduce Three's fog depth.
        // The authored Web sun and Unity parity sun both have shadows disabled, so this cannot
        // introduce a scene shadow when leaf.render.cast_shadow is false.
        renderer.shadowCastingMode = ShadowCastingMode.On;
        renderer.receiveShadows = leaf.render.receive_shadow;
        renderer.lightProbeUsage = LightProbeUsage.Off;
        renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
        int baseQueue = leaf.material.alpha_test > 0
            ? (int)RenderQueue.AlphaTest : (int)RenderQueue.Geometry;
        material.renderQueue = checked(baseQueue + leaf.render.render_order);
        if (!leaf.render.frustum_culled)
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 100_000f);
        _meshes.Add(mesh);
        _materials.Add(material);
    }

    Mesh BuildLeafMesh(WeekendCircuitLeafFrame leaf) {
        WeekendCircuitGeometryFrame geometry = leaf.geometry;
        int copies = leaf.kind == "instanced-mesh" ? leaf.instances.count : 1;
        int vertexCount = checked(geometry.vertex_count * copies);
        int sourceIndexCount = geometry.indices.Length != 0
            ? geometry.indices.Length : geometry.vertex_count;
        int indexCount = checked(sourceIndexCount * copies);
        var vertices = new Vector3[vertexCount];
        var normals = new Vector3[vertexCount];
        var uv = new Vector2[vertexCount];
        bool hasGeometryColors = geometry.color?.values != null
            && geometry.color.values.Length != 0;
        bool hasNormals = geometry.normal?.values != null
            && geometry.normal.values.Length != 0;
        bool hasUv = geometry.uv?.values != null && geometry.uv.values.Length != 0;
        bool hasInstanceColors = leaf.instances.colors_linear.Length != 0;
        var colors = hasGeometryColors || hasInstanceColors ? new Color[vertexCount] : null;
        var indices = new int[indexCount];
        Matrix4x4 world = MatrixFromThree(leaf.world_matrix, 0);

        for (int copy = 0; copy < copies; copy++) {
            Matrix4x4 instance = leaf.kind == "instanced-mesh"
                ? MatrixFromThree(leaf.instances.matrices, copy * 16)
                : Matrix4x4.identity;
            Matrix4x4 transform = world * instance;
            Matrix4x4 normalTransform = transform.inverse.transpose;
            Color instanceColor = hasInstanceColors
                ? new Color(
                    (float)leaf.instances.colors_linear[copy * 3],
                    (float)leaf.instances.colors_linear[copy * 3 + 1],
                    (float)leaf.instances.colors_linear[copy * 3 + 2],
                    1f)
                : Color.white;
            int vertexOffset = copy * geometry.vertex_count;
            for (int vertex = 0; vertex < geometry.vertex_count; vertex++) {
                int source3 = vertex * 3;
                Vector3 sourcePosition = new(
                    (float)geometry.position.values[source3],
                    (float)geometry.position.values[source3 + 1],
                    (float)geometry.position.values[source3 + 2]);
                vertices[vertexOffset + vertex] = transform.MultiplyPoint3x4(sourcePosition);
                if (hasNormals) {
                    Vector3 sourceNormal = new(
                        (float)geometry.normal.values[source3],
                        (float)geometry.normal.values[source3 + 1],
                        (float)geometry.normal.values[source3 + 2]);
                    normals[vertexOffset + vertex] =
                        normalTransform.MultiplyVector(sourceNormal).normalized;
                } else {
                    normals[vertexOffset + vertex] = Vector3.up;
                }
                if (hasUv) {
                    int source2 = vertex * 2;
                    uv[vertexOffset + vertex] = new Vector2(
                        (float)geometry.uv.values[source2],
                        (float)geometry.uv.values[source2 + 1]);
                }
                if (colors != null) {
                    Color geometryColor = hasGeometryColors
                        ? new Color(
                            (float)geometry.color.values[source3],
                            (float)geometry.color.values[source3 + 1],
                            (float)geometry.color.values[source3 + 2],
                            1f)
                        : Color.white;
                    colors[vertexOffset + vertex] = geometryColor * instanceColor;
                }
            }

            int indexOffset = copy * sourceIndexCount;
            for (int source = 0; source < sourceIndexCount; source++) {
                int sourceIndex = geometry.indices.Length != 0
                    ? geometry.indices[source] : source;
                indices[indexOffset + source] = vertexOffset + sourceIndex;
            }
            // Web world coordinates and Unity world coordinates are numerically identical here.
            // Their engine handedness conventions differ, so reverse triangle winding once.
            for (int triangle = 0; triangle < sourceIndexCount; triangle += 3) {
                int left = indexOffset + triangle + 1;
                int right = indexOffset + triangle + 2;
                (indices[left], indices[right]) = (indices[right], indices[left]);
            }
        }

        var mesh = new Mesh {
            name = LeafObjectName(leaf) + "-web-geometry",
            indexFormat = vertexCount > ushort.MaxValue ? IndexFormat.UInt32 : IndexFormat.UInt16,
            vertices = vertices,
            normals = normals,
            uv = uv,
        };
        if (colors != null) mesh.colors = colors;
        mesh.SetIndices(indices, MeshTopology.Triangles, 0, true);
        return mesh;
    }

    Material BuildMaterial(
        WeekendCircuitMaterialFrame web,
        WeekendCircuitRenderProfileFrame profile,
        bool hasInstanceColors
    ) {
        Shader shader = Resources.Load<Shader>(SurfaceShaderPath)
            ?? Shader.Find("GunsOnly/WeekendCircuitParity");
        if (shader == null)
            throw new InvalidOperationException("Weekend circuit retained shader is missing.");
        var material = new Material(shader) {
            name = "weekend-web-" + web.model,
            hideFlags = HideFlags.DontSave,
        };
        material.SetVector("_BaseColor", new Vector4(
            (float)web.color_linear[0], (float)web.color_linear[1],
            (float)web.color_linear[2], (float)web.opacity));
        material.SetFloat("_Roughness", (float)web.roughness);
        material.SetFloat("_Metalness", (float)web.metalness);
        material.SetFloat("_Unlit", web.model == "mesh-basic" ? 1f : 0f);
        material.SetFloat("_UseVertexColor", web.vertex_colors || hasInstanceColors ? 1f : 0f);
        material.SetFloat("_AlphaTest", (float)web.alpha_test);
        material.SetFloat("_Cull", web.side == "double" ? 0f : web.side == "back" ? 1f : 2f);
        material.SetFloat("_ZWrite", web.depth_write ? 1f : 0f);
        material.SetFloat("_OffsetFactor",
            web.polygon_offset ? (float)web.polygon_offset_factor : 0f);
        material.SetFloat("_OffsetUnits",
            web.polygon_offset ? (float)web.polygon_offset_units : 0f);
        material.SetVector("_SkyColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(
                profile.hemisphere.sky_srgb_hex));
        material.SetVector("_GroundColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(
                profile.hemisphere.ground_srgb_hex));
        material.SetFloat("_HemisphereIntensity", (float)profile.hemisphere.intensity);
        material.SetVector("_SunPosition", new Vector4(
            (float)profile.sun.position[0], (float)profile.sun.position[1],
            (float)profile.sun.position[2], 0f));
        material.SetVector("_SunColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(profile.sun.srgb_hex));
        material.SetFloat("_SunIntensity", (float)profile.sun.intensity);
        material.SetFloat("_FogDensity", (float)profile.fog.density);
        // Unity's JsonUtility materializes an empty DTO for a JSON `map:null` value.
        // Treat only a stable Web texture identity as a mapped material.
        if (web.map != null && !string.IsNullOrEmpty(web.map.id)) {
            if (!_textures.TryGetValue(web.map.id, out Texture2D texture)) {
                texture = WeekendCircuitPresentationResource.LoadTextureOrThrow(web.map.id);
                _textures.Add(web.map.id, texture);
            }
            material.SetTexture("_MainTex", texture);
            material.SetTextureScale("_MainTex", new Vector2(
                (float)web.map.repeat[0], (float)web.map.repeat[1]));
            material.SetFloat("_FlipTextureY", web.map.flip_y ? 0f : 1f);
            material.SetFloat("_UseTexture", 1f);
        } else {
            material.SetFloat("_FlipTextureY", 0f);
            material.SetFloat("_UseTexture", 0f);
        }
        return material;
    }

    void AddSky(WeekendCircuitRenderProfileFrame profile) {
        Shader shader = Resources.Load<Shader>(SkyShaderPath)
            ?? Shader.Find("GunsOnly/WeekendCircuitSky");
        if (shader == null)
            throw new InvalidOperationException("Weekend circuit sky shader is missing.");
        Mesh mesh = BuildSphere(
            (float)profile.sky.radius_m,
            profile.sky.width_segments,
            profile.sky.height_segments);
        var material = new Material(shader) {
            name = "weekend-web-sky-gradient",
            hideFlags = HideFlags.DontSave,
            renderQueue = (int)RenderQueue.Background,
        };
        material.SetVector("_TopColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(profile.sky.top_srgb_hex));
        material.SetVector("_HorizonColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(profile.sky.horizon_srgb_hex));
        material.SetVector("_LowerHazeColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(profile.sky.lower_haze_srgb_hex));
        var sky = new GameObject("weekend-web-sky");
        sky.transform.SetParent(transform, false);
        sky.AddComponent<MeshFilter>().sharedMesh = mesh;
        MeshRenderer renderer = sky.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = material;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;
        renderer.lightProbeUsage = LightProbeUsage.Off;
        renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
        mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 100_000f);
        _meshes.Add(mesh);
        _materials.Add(material);
    }

    static Mesh BuildSphere(float radius, int widthSegments, int heightSegments) {
        int row = widthSegments + 1;
        var vertices = new Vector3[row * (heightSegments + 1)];
        var normals = new Vector3[vertices.Length];
        var uv = new Vector2[vertices.Length];
        var indices = new List<int>(widthSegments * (heightSegments - 1) * 6);
        int cursor = 0;
        for (int iy = 0; iy <= heightSegments; iy++) {
            float v = iy / (float)heightSegments;
            float uOffset = iy == 0 ? 0.5f / widthSegments
                : iy == heightSegments ? -0.5f / widthSegments : 0f;
            float theta = v * Mathf.PI;
            for (int ix = 0; ix <= widthSegments; ix++) {
                float u = ix / (float)widthSegments;
                float phi = u * Mathf.PI * 2f;
                Vector3 vertex = new(
                    -radius * Mathf.Cos(phi) * Mathf.Sin(theta),
                    radius * Mathf.Cos(theta),
                    radius * Mathf.Sin(phi) * Mathf.Sin(theta));
                vertices[cursor] = vertex;
                normals[cursor] = vertex.normalized;
                uv[cursor] = new Vector2(u + uOffset, 1f - v);
                cursor++;
            }
        }
        for (int iy = 0; iy < heightSegments; iy++) {
            for (int ix = 0; ix < widthSegments; ix++) {
                int a = row * iy + ix + 1;
                int b = row * iy + ix;
                int c = row * (iy + 1) + ix;
                int d = row * (iy + 1) + ix + 1;
                // Three's sphere winding reversed once for Unity engine handedness.
                if (iy != 0) { indices.Add(a); indices.Add(d); indices.Add(b); }
                if (iy != heightSegments - 1) {
                    indices.Add(b); indices.Add(d); indices.Add(c);
                }
            }
        }
        var mesh = new Mesh {
            name = "weekend-web-sky-sphere-24x12",
            vertices = vertices,
            normals = normals,
            uv = uv,
        };
        mesh.SetTriangles(indices, 0, true);
        return mesh;
    }

    static Matrix4x4 MatrixFromThree(double[] values, int offset) {
        var matrix = new Matrix4x4();
        for (int column = 0; column < 4; column++)
            for (int row = 0; row < 4; row++)
                matrix[row, column] = (float)values[offset + column * 4 + row];
        return matrix;
    }

    static string LeafObjectName(WeekendCircuitLeafFrame leaf) {
        string source = string.IsNullOrEmpty(leaf.name) ? leaf.path : leaf.name;
        return source.Replace('/', '_').Replace(' ', '-');
    }

    void OnDestroy() {
        foreach (Mesh mesh in _meshes) if (mesh != null) Destroy(mesh);
        foreach (Material material in _materials) if (material != null) Destroy(material);
        _meshes.Clear();
        _materials.Clear();
        _textures.Clear(); // Textures are shared Resources and must not be destroyed here.
    }
}

}
