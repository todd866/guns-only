using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Retained Unity consumer for the immutable Weekend open-road contract. It creates one road draw
/// and one alpha-tested roadside draw; it owns no route, grip, collision or motorcycle authority.
/// </summary>
public sealed class WeekendHinterlandRoadRenderer : MonoBehaviour {
    const string ParityShaderResourcePath =
        "GunsOnly/WeekendRide/Circuit/WeekendCircuitParity";

    readonly List<Mesh> _meshes = new();
    readonly List<Material> _materials = new();

    public string NetworkId { get; private set; }
    public int RoadsideInstanceCount { get; private set; }

    public static WeekendHinterlandRoadRenderer Attach(Transform parent) {
        if (parent == null) throw new ArgumentNullException(nameof(parent));
        WeekendRoadNetworkFrame contract = WeekendRoadNetworkContractResource.Load();
        WeekendCircuitRenderProfileFrame profile =
            WeekendCircuitPresentationResource.Load().render_profile;
        var root = new GameObject("weekend-open-road-network");
        root.transform.SetParent(parent, false);
        WeekendHinterlandRoadRenderer renderer =
            root.AddComponent<WeekendHinterlandRoadRenderer>();
        try {
            renderer.Build(contract, profile);
            return renderer;
        }
        catch {
            Destroy(root);
            throw;
        }
    }

    public static Material CreateGroundMaterial(float groundSizeM = 22_000f) {
        Texture2D ground = WeekendRoadNetworkContractResource.LoadGroundTexture();
        ConfigureMirroredSurface(ground);
        Shader shader = Shader.Find("Standard");
        if (shader == null) throw new InvalidOperationException("Unity Standard shader unavailable.");
        var material = new Material(shader) { name = "weekend-hinterland-ground-v1" };
        // Standard's _Color is a ShaderLab Color property; pass the authored sRGB triplet and let
        // Unity perform its one project-space conversion. Pre-linearising here double-decodes it.
        material.SetColor("_Color", SrgbColor(0xb0b6a3));
        material.SetTexture("_MainTex", ground);
        float repeat = groundSizeM / 160f;
        material.SetTextureScale("_MainTex", new Vector2(repeat, repeat));
        material.SetFloat("_Metallic", 0f);
        material.SetFloat("_Glossiness", 0f);
        return material;
    }

    void Build(
        WeekendRoadNetworkFrame contract,
        WeekendCircuitRenderProfileFrame profile
    ) {
        NetworkId = contract.id;
        AddSurface(
            "weekend-open-road-asphalt",
            BuildRoadMesh(contract),
            BuildRoadMaterial(profile));
        AddSurface(
            "weekend-open-road-roadside",
            BuildRoadsideMesh(contract),
            BuildRoadsideMaterial(profile, contract.roadside_atlas.alpha_cutoff));
        RoadsideInstanceCount = contract.roadside_instances.Length;
    }

    void AddSurface(string objectName, Mesh mesh, Material material) {
        var surface = new GameObject(objectName);
        surface.transform.SetParent(transform, false);
        surface.AddComponent<MeshFilter>().sharedMesh = mesh;
        MeshRenderer meshRenderer = surface.AddComponent<MeshRenderer>();
        meshRenderer.sharedMaterial = material;
        // The Weekend camera derives exact Three fog from its depth texture, which Unity builds
        // from ShadowCaster passes. The parity sun has shadows disabled, so enabling participation
        // here contributes depth without introducing visible road/roadside shadows.
        meshRenderer.shadowCastingMode = ShadowCastingMode.On;
        meshRenderer.receiveShadows = true;
        meshRenderer.lightProbeUsage = LightProbeUsage.Off;
        meshRenderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
        _meshes.Add(mesh);
        _materials.Add(material);
    }

    static Mesh BuildRoadMesh(WeekendRoadNetworkFrame contract) {
        var vertices = new List<Vector3>();
        var normals = new List<Vector3>();
        var uv = new List<Vector2>();
        var triangles = new List<int>();
        double liftM = contract.geometry.road_lift_m;
        double metresPerTile = contract.road_surface.metres_per_tile;

        foreach (WeekendRoadFrame road in contract.roads) {
            int roadVertex = vertices.Count;
            double distanceAlongM = 0.0;
            for (int index = 0; index < road.centreline.Length; index++) {
                if (index > 0) distanceAlongM += HorizontalDistance(
                    road.centreline[index - 1], road.centreline[index]);
                WeekendRoadPoint point = road.centreline[index];
                (double tangentEast, double tangentNorth) = TangentAt(
                    road.centreline, index);
                double normalEast = -tangentNorth;
                double normalNorth = tangentEast;
                foreach (double side in new[] { -1.0, 1.0 }) {
                    double eastM = point.x
                        + normalEast * road.paved_width_m * 0.5 * side;
                    double northM = point.z
                        + normalNorth * road.paved_width_m * 0.5 * side;
                    vertices.Add(new Vector3(
                        (float)eastM,
                        (float)(point.y + liftM),
                        (float)-northM));
                    normals.Add(Vector3.up);
                    uv.Add(new Vector2(
                        (float)(distanceAlongM / metresPerTile),
                        (float)(side * road.paved_width_m * 0.5 / metresPerTile)));
                }
                if (index < road.centreline.Length - 1) {
                    int vertex = roadVertex + index * 2;
                    triangles.Add(vertex);
                    triangles.Add(vertex + 2);
                    triangles.Add(vertex + 1);
                    triangles.Add(vertex + 1);
                    triangles.Add(vertex + 2);
                    triangles.Add(vertex + 3);
                }
            }
        }

        int segments = contract.geometry.junction_radial_segments;
        foreach (WeekendRoadJunctionFrame junction in contract.junctions) {
            int centerVertex = vertices.Count;
            vertices.Add(new Vector3(
                (float)junction.center.x,
                (float)(junction.center.y + liftM),
                (float)-junction.center.z));
            normals.Add(Vector3.up);
            uv.Add(new Vector2(
                (float)(junction.center.x / metresPerTile),
                (float)(junction.center.z / metresPerTile)));
            for (int segment = 0; segment < segments; segment++) {
                double angle = segment / (double)segments * Math.PI * 2.0;
                double eastM = junction.center.x + Math.Cos(angle) * junction.paved_radius_m;
                double northM = junction.center.z + Math.Sin(angle) * junction.paved_radius_m;
                vertices.Add(new Vector3(
                    (float)eastM,
                    (float)(junction.center.y + liftM),
                    (float)-northM));
                normals.Add(Vector3.up);
                uv.Add(new Vector2(
                    (float)(eastM / metresPerTile),
                    (float)(northM / metresPerTile)));
            }
            int firstRingVertex = centerVertex + 1;
            for (int segment = 0; segment < segments; segment++) {
                int current = firstRingVertex + segment;
                int next = firstRingVertex + (segment + 1) % segments;
                triangles.Add(centerVertex);
                triangles.Add(current);
                triangles.Add(next);
            }
        }
        // Web and Unity use opposite front-face conventions for these same-numeric world
        // coordinates. Reverse triangle winding once at the engine boundary; without this the
        // retained Standard road is back-face culled, including the paddock access connection.
        for (int triangle = 0; triangle < triangles.Count; triangle += 3) {
            (triangles[triangle + 1], triangles[triangle + 2]) =
                (triangles[triangle + 2], triangles[triangle + 1]);
        }
        return BuildMesh(
            "weekend-open-road-asphalt",
            vertices,
            normals,
            uv,
            triangles);
    }

    static Mesh BuildRoadsideMesh(WeekendRoadNetworkFrame contract) {
        var vertices = new List<Vector3>(contract.roadside_instances.Length * 4);
        var normals = new List<Vector3>(contract.roadside_instances.Length * 4);
        var uv = new List<Vector2>(contract.roadside_instances.Length * 4);
        var triangles = new List<int>(contract.roadside_instances.Length * 6);
        var regions = new Dictionary<string, WeekendRoadsideRegionFrame>(StringComparer.Ordinal);
        foreach (WeekendRoadsideRegionFrame region in contract.roadside_atlas.regions)
            regions.Add(region.id, region);

        foreach (WeekendRoadsideInstanceFrame instance in contract.roadside_instances) {
            WeekendRoadsideRegionFrame region = regions[instance.region_id];
            double rightEast = Math.Cos(instance.heading_rad);
            double rightNorth = -Math.Sin(instance.heading_rad);
            double normalEast = Math.Sin(instance.heading_rad);
            double normalNorth = Math.Cos(instance.heading_rad);
            double halfWidthM = instance.width_m * 0.5;
            double leftEastM = instance.position.x - rightEast * halfWidthM;
            double leftNorthM = instance.position.z - rightNorth * halfWidthM;
            double rightEastM = instance.position.x + rightEast * halfWidthM;
            double rightNorthM = instance.position.z + rightNorth * halfWidthM;
            float bottomY = (float)(instance.position.y + 0.035);
            float topY = (float)(instance.position.y + instance.height_m);
            int first = vertices.Count;
            vertices.Add(new Vector3((float)leftEastM, bottomY, (float)-leftNorthM));
            vertices.Add(new Vector3((float)rightEastM, bottomY, (float)-rightNorthM));
            vertices.Add(new Vector3((float)rightEastM, topY, (float)-rightNorthM));
            vertices.Add(new Vector3((float)leftEastM, topY, (float)-leftNorthM));
            Vector3 normal = new((float)normalEast, 0f, (float)-normalNorth);
            normals.Add(normal);
            normals.Add(normal);
            normals.Add(normal);
            normals.Add(normal);
            float u0 = (float)region.u_min;
            float u1 = (float)(region.u_min + region.u_size);
            // Contract regions are top-left/v-down: physical card bottom=vMax, top=vMin.
            // The retained shader performs Unity PNG's sample-space V conversion once.
            float vBottom = (float)(region.v_min_from_top + region.v_size);
            float vTop = (float)region.v_min_from_top;
            uv.Add(new Vector2(u0, vBottom));
            uv.Add(new Vector2(u1, vBottom));
            uv.Add(new Vector2(u1, vTop));
            uv.Add(new Vector2(u0, vTop));
            triangles.Add(first);
            triangles.Add(first + 2);
            triangles.Add(first + 1);
            triangles.Add(first);
            triangles.Add(first + 3);
            triangles.Add(first + 2);
        }
        return BuildMesh(
            "weekend-open-road-roadside",
            vertices,
            normals,
            uv,
            triangles);
    }

    static Material BuildRoadMaterial(WeekendCircuitRenderProfileFrame profile) {
        Texture2D texture = WeekendRoadNetworkContractResource.LoadRoadTexture();
        ConfigureMirroredSurface(texture);
        Material material = BuildParityMaterial(
            "weekend-open-road-asphalt-v1",
            profile,
            roughness: 0.93f,
            metalness: 0.01f,
            alphaTest: 0f,
            cullMode: CullMode.Back,
            flipTextureY: false);
        material.SetTexture("_MainTex", texture);
        material.SetFloat("_OffsetFactor", -2f);
        material.SetFloat("_OffsetUnits", -1f);
        return material;
    }

    static Material BuildRoadsideMaterial(
        WeekendCircuitRenderProfileFrame profile,
        double cutoff
    ) {
        Texture2D atlas = WeekendRoadNetworkContractResource.LoadRoadsideAtlas();
        atlas.wrapMode = TextureWrapMode.Clamp;
        atlas.filterMode = FilterMode.Trilinear;
        atlas.anisoLevel = Mathf.Max(8, atlas.anisoLevel);
        Material material = BuildParityMaterial(
            "weekend-roadside-atlas-v1",
            profile,
            roughness: 0.95f,
            metalness: 0f,
            alphaTest: (float)cutoff,
            cullMode: CullMode.Off,
            flipTextureY: true);
        material.SetTexture("_MainTex", atlas);
        material.renderQueue = (int)RenderQueue.AlphaTest;
        return material;
    }

    static Material BuildParityMaterial(
        string name,
        WeekendCircuitRenderProfileFrame profile,
        float roughness,
        float metalness,
        float alphaTest,
        CullMode cullMode,
        bool flipTextureY
    ) {
        if (profile == null || profile.fog == null
            || profile.hemisphere == null || profile.sun == null)
            throw new InvalidOperationException("Weekend parity render profile is unavailable.");
        Shader shader = Resources.Load<Shader>(ParityShaderResourcePath)
            ?? Shader.Find("GunsOnly/WeekendCircuitParity");
        if (shader == null)
            throw new InvalidOperationException("Weekend shared physical parity shader unavailable.");
        var material = new Material(shader) { name = name };
        material.SetVector("_BaseColor", new Vector4(1f, 1f, 1f, 1f));
        material.SetTextureScale("_MainTex", Vector2.one);
        material.SetFloat("_UseTexture", 1f);
        material.SetFloat("_UseVertexColor", 0f);
        material.SetFloat("_AlphaTest", alphaTest);
        material.SetFloat("_FlipTextureY", flipTextureY ? 1f : 0f);
        material.SetFloat("_Unlit", 0f);
        material.SetFloat("_Roughness", roughness);
        material.SetFloat("_Metalness", metalness);
        material.SetFloat("_Cull", (float)cullMode);
        material.SetFloat("_ZWrite", 1f);
        material.SetVector("_SkyColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(
                profile.hemisphere.sky_srgb_hex));
        material.SetVector("_GroundColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(
                profile.hemisphere.ground_srgb_hex));
        material.SetFloat("_HemisphereIntensity", (float)profile.hemisphere.intensity);
        material.SetVector("_SunPosition", new Vector4(
            (float)profile.sun.position[0],
            (float)profile.sun.position[1],
            (float)profile.sun.position[2],
            0f));
        material.SetVector("_SunColor",
            WeekendCircuitPresentationResource.LinearSrgbHex(profile.sun.srgb_hex));
        material.SetFloat("_SunIntensity", (float)profile.sun.intensity);
        material.SetFloat("_FogDensity", (float)profile.fog.density);
        return material;
    }

    static void ConfigureMirroredSurface(Texture2D texture) {
        texture.wrapMode = TextureWrapMode.Mirror;
        texture.filterMode = FilterMode.Trilinear;
        texture.anisoLevel = Mathf.Max(8, texture.anisoLevel);
    }

    static Mesh BuildMesh(
        string name,
        List<Vector3> vertices,
        List<Vector3> normals,
        List<Vector2> uv,
        List<int> triangles
    ) {
        var mesh = new Mesh { name = name };
        if (vertices.Count > ushort.MaxValue) mesh.indexFormat = IndexFormat.UInt32;
        mesh.SetVertices(vertices);
        mesh.SetNormals(normals);
        mesh.SetUVs(0, uv);
        mesh.SetTriangles(triangles, 0, true);
        mesh.RecalculateBounds();
        return mesh;
    }

    static (double East, double North) TangentAt(
        WeekendRoadPoint[] points,
        int index
    ) {
        WeekendRoadPoint previous = points[Math.Max(0, index - 1)];
        WeekendRoadPoint next = points[Math.Min(points.Length - 1, index + 1)];
        double east = next.x - previous.x;
        double north = next.z - previous.z;
        double length = Math.Sqrt(east * east + north * north);
        if (!(length > 1e-6)) {
            throw new InvalidOperationException("Weekend road contains a degenerate tangent.");
        }
        return (east / length, north / length);
    }

    static double HorizontalDistance(WeekendRoadPoint a, WeekendRoadPoint b) {
        double eastM = b.x - a.x;
        double northM = b.z - a.z;
        return Math.Sqrt(eastM * eastM + northM * northM);
    }

    static Color SrgbColor(int hex) {
        float r = ((hex >> 16) & 0xff) / 255f;
        float g = ((hex >> 8) & 0xff) / 255f;
        float b = (hex & 0xff) / 255f;
        return new Color(r, g, b, 1f);
    }

    void OnDestroy() {
        foreach (Mesh mesh in _meshes) if (mesh != null) Destroy(mesh);
        foreach (Material material in _materials) if (material != null) Destroy(material);
        _meshes.Clear();
        _materials.Clear();
    }
}

}
