using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Builds the camera-local R1 near-field silhouette exclusively from the exported Web contract.
/// AttachTo is the only API a future WeekendRide bootstrap/session needs to call.
/// </summary>
public sealed class WeekendR1FirstPersonRig : MonoBehaviour {
    public const string RootName = "r1-first-person";
    const string ShaderResourcePath = "GunsOnly/WeekendRide/WeekendR1NearField";
    const float NonCulledBoundsM = 100f;

    static readonly int ColorProperty = Shader.PropertyToID("_Color");
    static readonly int EmissionProperty = Shader.PropertyToID("_Emission");
    static readonly int MetallicProperty = Shader.PropertyToID("_Metallic");
    static readonly int SmoothnessProperty = Shader.PropertyToID("_Smoothness");
    static readonly int UnlitProperty = Shader.PropertyToID("_Unlit");
    static readonly int CullProperty = Shader.PropertyToID("_Cull");
    static readonly int SourceBlendProperty = Shader.PropertyToID("_SrcBlend");
    static readonly int DestinationBlendProperty = Shader.PropertyToID("_DstBlend");
    static readonly int DepthWriteProperty = Shader.PropertyToID("_ZWrite");

    readonly List<Mesh> _ownedMeshes = new();
    readonly List<Material> _ownedMaterials = new();
    readonly Material[] _tachMaterials = new Material[7];

    WeekendR1FirstPersonContract _contract;
    Shader _shader;
    bool _built;

    public bool IsBuilt => _built;
    public string SemanticSha256 => _contract?.SemanticSha256 ?? string.Empty;
    public int ContractPartCount => _contract?.Parts.Count ?? 0;

    public static WeekendR1FirstPersonRig AttachTo(Transform helmetCamera) {
        return AttachTo(helmetCamera, WeekendR1FirstPersonContract.LoadOrThrow());
    }

    public static WeekendR1FirstPersonRig AttachTo(
        Transform helmetCamera,
        WeekendR1FirstPersonContract contract
    ) {
        if (helmetCamera == null) throw new ArgumentNullException(nameof(helmetCamera));
        if (contract == null) throw new ArgumentNullException(nameof(contract));

        Transform existingRoot = helmetCamera.Find(RootName);
        if (existingRoot != null) {
            WeekendR1FirstPersonRig existing = existingRoot.GetComponent<WeekendR1FirstPersonRig>();
            if (existing == null || !existing.IsBuilt
                || existing.SemanticSha256 != WeekendR1FirstPersonContract.ExpectedSemanticSha256) {
                throw new InvalidOperationException(
                    "Helmet camera already contains a non-contract R1 first-person root.");
            }
            return existing;
        }

        var root = new GameObject(RootName);
        root.layer = helmetCamera.gameObject.layer;
        root.transform.SetParent(helmetCamera, false);
        root.transform.localPosition = Vector3.zero;
        root.transform.localRotation = Quaternion.identity;
        root.transform.localScale = Vector3.one;
        WeekendR1FirstPersonRig rig = root.AddComponent<WeekendR1FirstPersonRig>();
        try {
            rig.Build(contract);
            return rig;
        } catch {
            DestroyOwnedObject(root);
            throw;
        }
    }

    /// <summary>Updates only the seven authored tach emissive segments from authoritative RPM.</summary>
    public void SetEngineRpm(float rpm) {
        if (!_built) return;
        WeekendR1FirstPersonContract.TachometerSpec tachometer = _contract.Tachometer;
        float finiteRpm = float.IsNaN(rpm) || float.IsInfinity(rpm) ? 0f : rpm;
        float fraction = Mathf.Clamp01(
            (finiteRpm - tachometer.IdleRpm) / (tachometer.RedlineRpm - tachometer.IdleRpm));
        // JavaScript Math.round is floor(x + 0.5) for this non-negative range.
        int lit = Mathf.FloorToInt(fraction * _tachMaterials.Length + 0.5f);
        for (int index = 0; index < _tachMaterials.Length; index++) {
            float intensity = index < lit
                ? tachometer.ActiveEmissiveIntensity
                : tachometer.InactiveEmissiveIntensity;
            SetEmission(_tachMaterials[index], TachColor(index), intensity);
        }
    }

    void Build(WeekendR1FirstPersonContract contract) {
        if (_built) throw new InvalidOperationException("R1 first-person rig was already built.");
        _shader = Resources.Load<Shader>(ShaderResourcePath);
        if (_shader == null) {
            throw new InvalidOperationException(
                "Missing pinned R1 near-field shader at Resources/" + ShaderResourcePath + ".");
        }
        _contract = contract;

        foreach (WeekendR1FirstPersonContract.PartSpec part in contract.Parts) {
            GameObject partObject = CreatePartObject(part);
            partObject.name = part.Name;
            partObject.layer = gameObject.layer;
            partObject.transform.SetParent(transform, false);
            partObject.transform.localPosition = FromThreePosition(part.PositionValues);
            partObject.transform.localRotation = FromThreeXyzEuler(part.RotationValues);

            Material material = CreateMaterial(contract.MaterialOrThrow(part.MaterialName));
            MeshRenderer renderer = partObject.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            renderer.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            renderer.allowOcclusionWhenDynamic = contract.Render.FrustumCulled;
            renderer.sortingOrder = contract.Render.RenderOrder;

            if (part.Telemetry.Kind == "rpm-segment") {
                _tachMaterials[part.Telemetry.Index] = material;
            }
        }

        for (int index = 0; index < _tachMaterials.Length; index++) {
            if (_tachMaterials[index] == null)
                throw new InvalidOperationException("Missing R1 tach material at index " + index + ".");
        }
        _built = true;
        SetEngineRpm(0f);
    }

    GameObject CreatePartObject(WeekendR1FirstPersonContract.PartSpec part) {
        GameObject result;
        Mesh mesh;
        switch (part.Primitive) {
            case "box":
                result = CreateBuiltinPrimitive(PrimitiveType.Cube, part.Name, out mesh);
                result.transform.localScale = new Vector3(
                    part.DimensionValues[0], part.DimensionValues[1], part.DimensionValues[2]);
                break;
            case "plane":
                // Unity's built-in Quad faces local -Z, the reflected equivalent of Three's +Z plane.
                result = CreateBuiltinPrimitive(PrimitiveType.Quad, part.Name, out mesh);
                result.transform.localScale = new Vector3(
                    part.DimensionValues[0], part.DimensionValues[1], 1f);
                break;
            case "ellipsoid":
                result = CreateMeshObject(part.Name);
                mesh = BuildEllipsoid(part);
                result.GetComponent<MeshFilter>().sharedMesh = mesh;
                _ownedMeshes.Add(mesh);
                break;
            case "cylinder":
                result = CreateMeshObject(part.Name);
                mesh = BuildCylinder(part);
                result.GetComponent<MeshFilter>().sharedMesh = mesh;
                _ownedMeshes.Add(mesh);
                break;
            case "panel":
                result = CreateMeshObject(part.Name);
                mesh = BuildPanel(part);
                result.GetComponent<MeshFilter>().sharedMesh = mesh;
                _ownedMeshes.Add(mesh);
                break;
            case "line-segments":
                result = CreateMeshObject(part.Name);
                mesh = BuildLineSegments(part);
                result.GetComponent<MeshFilter>().sharedMesh = mesh;
                _ownedMeshes.Add(mesh);
                break;
            default:
                throw new InvalidOperationException("Unsupported R1 primitive " + part.Primitive + ".");
        }

        if (!_contract.Render.FrustumCulled) {
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * NonCulledBoundsM);
        }
        return result;
    }

    GameObject CreateBuiltinPrimitive(PrimitiveType primitive, string name, out Mesh ownedMesh) {
        GameObject result = GameObject.CreatePrimitive(primitive);
        result.name = name;
        Collider collider = result.GetComponent<Collider>();
        if (collider != null) DestroyOwnedObject(collider);
        MeshFilter filter = result.GetComponent<MeshFilter>();
        ownedMesh = Instantiate(filter.sharedMesh);
        ownedMesh.name = name + "-contract-mesh";
        filter.sharedMesh = ownedMesh;
        _ownedMeshes.Add(ownedMesh);
        return result;
    }

    static GameObject CreateMeshObject(string name) {
        var result = new GameObject(name);
        result.AddComponent<MeshFilter>();
        result.AddComponent<MeshRenderer>();
        return result;
    }

    Material CreateMaterial(WeekendR1FirstPersonContract.MaterialSpec spec) {
        var material = new Material(_shader) { name = "r1-contract-" + spec.Name };
        _ownedMaterials.Add(material);
        Color baseColor = _contract.LinearColorOrThrow(spec.ColorName);
        baseColor.a = spec.Opacity;
        material.SetColor(ColorProperty, baseColor);
        material.SetFloat(MetallicProperty, spec.Metalness);
        material.SetFloat(SmoothnessProperty, 1f - spec.Roughness);
        material.SetFloat(UnlitProperty, spec.Model == "unlit" ? 1f : 0f);
        material.SetInt(CullProperty, spec.Side == "double" ? (int)CullMode.Off : (int)CullMode.Back);
        material.SetInt(SourceBlendProperty,
            spec.Transparent ? (int)BlendMode.SrcAlpha : (int)BlendMode.One);
        material.SetInt(DestinationBlendProperty,
            spec.Transparent ? (int)BlendMode.OneMinusSrcAlpha : (int)BlendMode.Zero);
        material.SetInt(DepthWriteProperty, spec.DepthWrite ? 1 : 0);
        material.renderQueue = spec.Transparent
            ? (int)RenderQueue.Transparent
            : (int)RenderQueue.Geometry;
        material.SetOverrideTag("RenderType", spec.Transparent ? "Transparent" : "Opaque");
        Color emission = string.IsNullOrEmpty(spec.EmissiveColorName)
            ? Color.black
            : _contract.LinearColorOrThrow(spec.EmissiveColorName);
        SetEmission(material, emission, spec.EmissiveIntensity);
        return material;
    }

    Color TachColor(int index) {
        WeekendR1FirstPersonContract.PartSpec part = _contract.Parts[10 + index];
        WeekendR1FirstPersonContract.MaterialSpec material =
            _contract.MaterialOrThrow(part.MaterialName);
        return _contract.LinearColorOrThrow(material.EmissiveColorName);
    }

    static void SetEmission(Material material, Color linearColor, float intensity) {
        material.SetColor(EmissionProperty, new Color(
            linearColor.r * intensity,
            linearColor.g * intensity,
            linearColor.b * intensity,
            1f));
    }

    static Mesh BuildPanel(WeekendR1FirstPersonContract.PartSpec part) {
        float[] source = part.VertexValues;
        var vertices = new Vector3[source.Length / 3];
        for (int index = 0; index < vertices.Length; index++) {
            int offset = index * 3;
            vertices[index] = new Vector3(
                source[offset], source[offset + 1], -source[offset + 2]);
        }
        int[] sourceTriangles = part.TriangleValues;
        var triangles = new int[sourceTriangles.Length];
        for (int index = 0; index < triangles.Length; index += 3) {
            // Z reflection changes handedness, so reverse the Web triangle winding.
            triangles[index] = sourceTriangles[index];
            triangles[index + 1] = sourceTriangles[index + 2];
            triangles[index + 2] = sourceTriangles[index + 1];
        }
        var mesh = new Mesh { name = part.Name + "-contract-mesh" };
        mesh.vertices = vertices;
        mesh.triangles = triangles;
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    static Mesh BuildLineSegments(WeekendR1FirstPersonContract.PartSpec part) {
        float[] source = part.LineSegmentValues;
        var vertices = new Vector3[source.Length / 3];
        var indices = new int[vertices.Length];
        for (int index = 0; index < vertices.Length; index++) {
            int offset = index * 3;
            vertices[index] = new Vector3(
                source[offset], source[offset + 1], -source[offset + 2]);
            indices[index] = index;
        }
        var mesh = new Mesh { name = part.Name + "-contract-mesh" };
        mesh.vertices = vertices;
        mesh.SetIndices(indices, MeshTopology.Lines, 0);
        mesh.RecalculateBounds();
        return mesh;
    }

    static Mesh BuildEllipsoid(WeekendR1FirstPersonContract.PartSpec part) {
        int widthSegments = part.SegmentValues[0];
        int heightSegments = part.SegmentValues[1];
        Vector3 dimensions = new(
            part.DimensionValues[0], part.DimensionValues[1], part.DimensionValues[2]);
        var vertices = new List<Vector3>((widthSegments + 1) * (heightSegments + 1));
        var normals = new List<Vector3>((widthSegments + 1) * (heightSegments + 1));
        var triangles = new List<int>(widthSegments * (heightSegments - 1) * 6);

        for (int y = 0; y <= heightSegments; y++) {
            float v = y / (float)heightSegments;
            float theta = v * Mathf.PI;
            float sinTheta = Mathf.Sin(theta);
            float cosTheta = Mathf.Cos(theta);
            for (int x = 0; x <= widthSegments; x++) {
                float u = x / (float)widthSegments;
                float phi = u * Mathf.PI * 2f;
                // Exact Z-reflected Three SphereGeometry convention, radius 0.5.
                var unit = new Vector3(
                    -Mathf.Cos(phi) * sinTheta,
                    cosTheta,
                    -Mathf.Sin(phi) * sinTheta);
                vertices.Add(new Vector3(
                    unit.x * dimensions.x * 0.5f,
                    unit.y * dimensions.y * 0.5f,
                    unit.z * dimensions.z * 0.5f));
                normals.Add(new Vector3(
                    unit.x / dimensions.x,
                    unit.y / dimensions.y,
                    unit.z / dimensions.z).normalized);
            }
        }

        for (int y = 0; y < heightSegments; y++) {
            for (int x = 0; x < widthSegments; x++) {
                int a = y * (widthSegments + 1) + x + 1;
                int b = y * (widthSegments + 1) + x;
                int c = (y + 1) * (widthSegments + 1) + x;
                int d = (y + 1) * (widthSegments + 1) + x + 1;
                if (y != 0) AddOutwardTriangle(vertices, normals, triangles, a, b, d);
                if (y != heightSegments - 1) AddOutwardTriangle(vertices, normals, triangles, b, c, d);
            }
        }

        var mesh = new Mesh { name = part.Name + "-contract-mesh" };
        mesh.SetVertices(vertices);
        mesh.SetNormals(normals);
        mesh.SetTriangles(triangles, 0);
        mesh.RecalculateBounds();
        return mesh;
    }

    static Mesh BuildCylinder(WeekendR1FirstPersonContract.PartSpec part) {
        int segments = part.RadialSegments;
        float radius = part.RadiusM;
        float halfLength = part.LengthM * 0.5f;
        var vertices = new List<Vector3>((segments + 1) * 4 + 2);
        var normals = new List<Vector3>((segments + 1) * 4 + 2);
        var triangles = new List<int>(segments * 12);

        int sideStart = vertices.Count;
        for (int index = 0; index <= segments; index++) {
            float angle = index / (float)segments * Mathf.PI * 2f;
            var normal = new Vector3(Mathf.Sin(angle), 0f, -Mathf.Cos(angle));
            vertices.Add(new Vector3(normal.x * radius, halfLength, normal.z * radius));
            normals.Add(normal);
            vertices.Add(new Vector3(normal.x * radius, -halfLength, normal.z * radius));
            normals.Add(normal);
        }
        for (int index = 0; index < segments; index++) {
            int top = sideStart + index * 2;
            int bottom = top + 1;
            int nextTop = top + 2;
            int nextBottom = top + 3;
            AddOutwardTriangle(vertices, normals, triangles, top, bottom, nextTop);
            AddOutwardTriangle(vertices, normals, triangles, bottom, nextBottom, nextTop);
        }

        AddCylinderCap(vertices, normals, triangles, segments, radius, halfLength, true);
        AddCylinderCap(vertices, normals, triangles, segments, radius, halfLength, false);

        var mesh = new Mesh { name = part.Name + "-contract-mesh" };
        mesh.SetVertices(vertices);
        mesh.SetNormals(normals);
        mesh.SetTriangles(triangles, 0);
        mesh.RecalculateBounds();
        return mesh;
    }

    static void AddCylinderCap(
        List<Vector3> vertices,
        List<Vector3> normals,
        List<int> triangles,
        int segments,
        float radius,
        float halfLength,
        bool top
    ) {
        Vector3 normal = top ? Vector3.up : Vector3.down;
        int center = vertices.Count;
        vertices.Add(new Vector3(0f, top ? halfLength : -halfLength, 0f));
        normals.Add(normal);
        int ringStart = vertices.Count;
        for (int index = 0; index <= segments; index++) {
            float angle = index / (float)segments * Mathf.PI * 2f;
            vertices.Add(new Vector3(
                Mathf.Sin(angle) * radius,
                top ? halfLength : -halfLength,
                -Mathf.Cos(angle) * radius));
            normals.Add(normal);
        }
        for (int index = 0; index < segments; index++) {
            AddOutwardTriangle(
                vertices, normals, triangles, center, ringStart + index, ringStart + index + 1);
        }
    }

    static void AddOutwardTriangle(
        List<Vector3> vertices,
        List<Vector3> normals,
        List<int> triangles,
        int a,
        int b,
        int c
    ) {
        Vector3 geometricNormal = Vector3.Cross(vertices[b] - vertices[a], vertices[c] - vertices[a]);
        Vector3 expectedNormal = normals[a] + normals[b] + normals[c];
        if (Vector3.Dot(geometricNormal, expectedNormal) < 0f) {
            (b, c) = (c, b);
        }
        triangles.Add(a);
        triangles.Add(b);
        triangles.Add(c);
    }

    static Vector3 FromThreePosition(float[] position) {
        return new Vector3(position[0], position[1], -position[2]);
    }

    static Quaternion FromThreeXyzEuler(float[] rotation) {
        float sx = Mathf.Sin(rotation[0] * 0.5f);
        float cx = Mathf.Cos(rotation[0] * 0.5f);
        float sy = Mathf.Sin(rotation[1] * 0.5f);
        float cy = Mathf.Cos(rotation[1] * 0.5f);
        float sz = Mathf.Sin(rotation[2] * 0.5f);
        float cz = Mathf.Cos(rotation[2] * 0.5f);
        var three = new Quaternion(
            sx * cy * cz + cx * sy * sz,
            cx * sy * cz - sx * cy * sz,
            cx * cy * sz + sx * sy * cz,
            cx * cy * cz - sx * sy * sz);
        // Reflection F=diag(1,1,-1): R_unity = F * R_three * F.
        return new Quaternion(-three.x, -three.y, three.z, three.w).normalized;
    }

    void OnDestroy() {
        foreach (Material material in _ownedMaterials) {
            if (material != null) DestroyOwnedObject(material);
        }
        foreach (Mesh mesh in _ownedMeshes) {
            if (mesh != null) DestroyOwnedObject(mesh);
        }
        _ownedMaterials.Clear();
        _ownedMeshes.Clear();
        _built = false;
    }

    static void DestroyOwnedObject(UnityEngine.Object value) {
        if (value == null) return;
        if (Application.isPlaying) UnityEngine.Object.Destroy(value);
        else UnityEngine.Object.DestroyImmediate(value);
    }
}

}
