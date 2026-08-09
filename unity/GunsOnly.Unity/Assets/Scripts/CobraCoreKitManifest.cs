using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Builds the six non-terrain core draw submissions exported from the Web Build 299 scene.
/// Roads, hero scars, landmarks, hazards and Iron Bell geometry are data, not Unity stand-ins.
/// </summary>
public static class CobraCoreKitManifest {
    const string ResourcePath =
        "GunsOnly/CobraVietnam/environment/cobra-canyon-core-kit-desktop-v1";
    const string ExpectedSchema = "guns-only.cobra-canyon.unity-core-kit.v1";
    static readonly string[] ExpectedRoles = {
        "bridge-deck", "bridge-pier", "hazards", "heroCells", "landmarks", "roads",
    };

    [Serializable]
    sealed class Manifest {
        public string schema;
        public string sourceWorldId;
        public string sourceContentVersion;
        public string sourceVisualContractId;
        public int sourceWebBuild;
        public string qualityTier;
        public CoordinateSystemRecord coordinateSystem;
        public string[] excludedPresentationRoles;
        public int drawCalls;
        public int instanceCount;
        public int renderedTriangles;
        public RoleRecord[] roles;
    }

    [Serializable]
    sealed class CoordinateSystemRecord {
        public string units;
        public string x;
        public string y;
        public string z;
        public string transforms;
    }

    [Serializable]
    sealed class RoleRecord {
        public string role;
        public string meshKind;
        public int count;
        public GeometryRecord geometry;
        public TransformRecord objectTransform;
        public MaterialRecord material;
        public RenderingRecord rendering;
        public InstanceRecord[] instances;
        public int renderedTriangles;
    }

    [Serializable]
    sealed class GeometryRecord {
        public string name;
        public string topology;
        public float[] positions;
        public float[] normals;
        public float[] colors;
        public float[] uv;
        public int[] indices;
        public int triangles;
    }

    [Serializable]
    sealed class TransformRecord {
        public float px, py, pz;
        public float qx, qy, qz, qw;
        public float sx, sy, sz;

        public Matrix4x4 Matrix => Matrix4x4.TRS(
            new Vector3(px, py, pz),
            new Quaternion(qx, qy, qz, qw),
            new Vector3(sx, sy, sz));
    }

    [Serializable]
    sealed class MaterialRecord {
        public string shader;
        public string name;
        public string colorSpace;
        public string colorSrgbHex;
        public float[] colorLinearRgb;
        public string emissiveSrgbHex;
        public float[] emissiveLinearRgb;
        public float emissiveIntensity;
        public bool flatShading;
        public string side;
        public bool transparent;
        public float opacity;
        public float alphaTest;
        public bool depthTest;
        public bool depthWrite;
        public bool colorWrite;
        public bool fog;
        public bool vertexColors;
        public string blending;
        public bool premultipliedAlpha;
        public bool toneMapped;
        public bool polygonOffset;
        public float polygonOffsetFactor;
        public float polygonOffsetUnits;
    }

    [Serializable]
    sealed class RenderingRecord {
        public bool visible;
        public bool castShadow;
        public bool receiveShadow;
        public int renderOrder;
        public bool frustumCulled;
        public bool hazardCue;
        public bool visualExtendsCollisionY;
        public bool hasInstanceColors;
    }

    [Serializable]
    sealed class InstanceRecord {
        public string id;
        public string sourceId;
        public string kind;
        public bool authoredHazard;
        public bool routeEnvelopeAdjusted;
        public float routeEnvelopeClearanceM;
        public float px, py, pz;
        public float qx, qy, qz, qw;
        public float sx, sy, sz;
        public float cr, cg, cb;

        public Matrix4x4 Matrix => Matrix4x4.TRS(
            new Vector3(px, py, pz),
            new Quaternion(qx, qy, qz, qw),
            new Vector3(sx, sy, sz));
    }

    public static void Build(Transform parent) {
        TextAsset source = Resources.Load<TextAsset>(ResourcePath);
        if (source == null) {
            throw new InvalidOperationException(
                "Missing exact Web core-kit manifest at " + ResourcePath + ".");
        }
        Manifest manifest = JsonUtility.FromJson<Manifest>(source.text);
        Validate(manifest);

        var root = new GameObject("COBRA_CANYON_CORE_KIT_WEB_BUILD_299").transform;
        root.SetParent(parent, false);
        foreach (RoleRecord role in manifest.roles) {
            Mesh mesh = BuildRoleMesh(role);
            var go = new GameObject("COBRA_CANYON_" + role.role.ToUpperInvariant());
            go.transform.SetParent(root, false);
            go.SetActive(role.rendering.visible);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = GunsOnlyMats.CobraCore(
                role.role,
                Rgb(role.material.colorLinearRgb),
                Rgb(role.material.emissiveLinearRgb) * role.material.emissiveIntensity,
                role.material.opacity,
                role.material.transparent,
                role.material.side == "double",
                role.material.depthWrite,
                role.material.polygonOffset,
                role.material.polygonOffsetFactor,
                role.material.polygonOffsetUnits,
                role.rendering.renderOrder);
            renderer.shadowCastingMode = role.rendering.castShadow
                ? ShadowCastingMode.On : ShadowCastingMode.Off;
            renderer.receiveShadows = role.rendering.receiveShadow;
            renderer.allowOcclusionWhenDynamic = role.rendering.frustumCulled;
        }
        Debug.Log(
            $"[GunsOnly] exact Web core kit build={manifest.sourceWebBuild} "
            + $"draws={manifest.drawCalls} instances={manifest.instanceCount} "
            + $"triangles={manifest.renderedTriangles}");
    }

    static void Validate(Manifest manifest) {
        if (manifest == null) throw new InvalidOperationException("Core-kit manifest is empty.");
        if (manifest.schema != ExpectedSchema
            || manifest.sourceWorldId != "world.cobra-canyon.v1"
            || manifest.sourceContentVersion != "1.0.0"
            || manifest.sourceVisualContractId != CobraVisualContract.ExpectedContractId
            || manifest.sourceWebBuild != 299
            || manifest.qualityTier != "desktop") {
            throw new InvalidOperationException("Core-kit source identity is not Web Build 299 desktop.");
        }
        if (manifest.coordinateSystem == null
            || manifest.coordinateSystem.units != "metres"
            || manifest.coordinateSystem.x != "east"
            || manifest.coordinateSystem.y != "up"
            || manifest.coordinateSystem.z != "negative-north"
            || manifest.coordinateSystem.transforms != "three-js-trs") {
            throw new InvalidOperationException("Core-kit coordinate convention is invalid.");
        }
        if (manifest.excludedPresentationRoles == null
            || manifest.excludedPresentationRoles.Length != 3
            || manifest.excludedPresentationRoles[0] != "basin"
            || manifest.excludedPresentationRoles[1] != "river"
            || manifest.excludedPresentationRoles[2] != "assetKit") {
            throw new InvalidOperationException("Core-kit role boundary is invalid.");
        }
        if (manifest.roles == null || manifest.roles.Length != ExpectedRoles.Length
            || manifest.drawCalls != 6 || manifest.instanceCount != 43
            || manifest.renderedTriangles != 1836) {
            throw new InvalidOperationException("Core-kit totals do not match the Web scene.");
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        int instances = 0;
        int triangles = 0;
        foreach (RoleRecord role in manifest.roles) {
            ValidateRole(role);
            if (!seen.Add(role.role))
                throw new InvalidOperationException("Duplicate core-kit role " + role.role + ".");
            instances += role.instances?.Length ?? 0;
            triangles += role.renderedTriangles;
        }
        foreach (string expected in ExpectedRoles) {
            if (!seen.Contains(expected))
                throw new InvalidOperationException("Missing core-kit role " + expected + ".");
        }
        if (instances != manifest.instanceCount || triangles != manifest.renderedTriangles) {
            throw new InvalidOperationException("Core-kit aggregate counts drifted from Web.");
        }
    }

    static void ValidateRole(RoleRecord role) {
        if (role == null || string.IsNullOrEmpty(role.role)
            || role.meshKind is not ("static" or "instanced")
            || role.count <= 0 || role.geometry == null || role.objectTransform == null
            || role.material == null || role.rendering == null || role.instances == null) {
            throw new InvalidOperationException("Malformed core-kit role record.");
        }
        int expectedInstances = role.meshKind == "instanced" ? role.count : 0;
        if (role.instances.Length != expectedInstances || (role.meshKind == "static" && role.count != 1)) {
            throw new InvalidOperationException("Core-kit instance count mismatch for " + role.role + ".");
        }
        ValidateTransform(role.objectTransform, role.role + " object");
        foreach (InstanceRecord instance in role.instances) ValidateInstance(role.role, instance);

        GeometryRecord geometry = role.geometry;
        if (geometry.topology != "triangles" || geometry.positions == null
            || geometry.positions.Length == 0 || geometry.positions.Length % 3 != 0
            || geometry.normals == null || geometry.normals.Length != geometry.positions.Length
            || geometry.colors == null || geometry.uv == null || geometry.indices == null
            || !Finite(geometry.positions) || !Finite(geometry.normals)
            || !Finite(geometry.colors) || !Finite(geometry.uv)) {
            throw new InvalidOperationException("Malformed core geometry for " + role.role + ".");
        }
        int vertexCount = geometry.positions.Length / 3;
        if (geometry.colors.Length != 0 && geometry.colors.Length != geometry.positions.Length)
            throw new InvalidOperationException("Core color array mismatch for " + role.role + ".");
        if (geometry.uv.Length != 0 && geometry.uv.Length != vertexCount * 2)
            throw new InvalidOperationException("Core UV array mismatch for " + role.role + ".");
        int baseIndexCount = geometry.indices.Length > 0 ? geometry.indices.Length : vertexCount;
        if (baseIndexCount % 3 != 0 || geometry.triangles != baseIndexCount / 3
            || role.renderedTriangles != geometry.triangles * role.count) {
            throw new InvalidOperationException("Core triangle count mismatch for " + role.role + ".");
        }
        foreach (int index in geometry.indices) {
            if (index < 0 || index >= vertexCount)
                throw new InvalidOperationException("Out-of-range core index for " + role.role + ".");
        }
        ValidateMaterial(role);
    }

    static void ValidateMaterial(RoleRecord role) {
        MaterialRecord material = role.material;
        if (material.shader != "lambert" || material.colorSpace != "linear-srgb"
            || !ValidRgb(material.colorLinearRgb) || !ValidRgb(material.emissiveLinearRgb)
            || material.emissiveIntensity != 1f
            || material.side is not ("front" or "double")
            || !Finite(material.opacity) || material.opacity < 0f || material.opacity > 1f
            || material.alphaTest != 0f || !material.depthTest || !material.colorWrite
            || !material.fog || material.vertexColors || material.blending != "normal"
            || material.premultipliedAlpha || !material.toneMapped) {
            throw new InvalidOperationException("Unsupported Web material semantics for " + role.role + ".");
        }
        bool hero = role.role == "heroCells";
        if (material.transparent != hero || material.depthWrite == hero
            || (hero && Mathf.Abs(material.opacity - 0.16f) > 0.0001f)) {
            throw new InvalidOperationException("Core transparency contract drift for " + role.role + ".");
        }
    }

    static void ValidateInstance(string role, InstanceRecord instance) {
        if (instance == null || string.IsNullOrEmpty(instance.id)
            || !Finite(instance.px, instance.py, instance.pz)
            || !Finite(instance.qx, instance.qy, instance.qz, instance.qw)
            || !Finite(instance.sx, instance.sy, instance.sz)
            || !Finite(instance.cr, instance.cg, instance.cb)
            || instance.sx <= 0f || instance.sy <= 0f || instance.sz <= 0f) {
            throw new InvalidOperationException("Malformed core instance for " + role + ".");
        }
        float qLength = instance.qx * instance.qx + instance.qy * instance.qy
            + instance.qz * instance.qz + instance.qw * instance.qw;
        if (Mathf.Abs(qLength - 1f) > 0.001f)
            throw new InvalidOperationException("Non-unit core quaternion for " + instance.id + ".");
    }

    static void ValidateTransform(TransformRecord value, string label) {
        if (!Finite(value.px, value.py, value.pz, value.qx, value.qy, value.qz, value.qw,
                value.sx, value.sy, value.sz)
            || value.sx <= 0f || value.sy <= 0f || value.sz <= 0f) {
            throw new InvalidOperationException("Malformed " + label + " transform.");
        }
        float qLength = value.qx * value.qx + value.qy * value.qy
            + value.qz * value.qz + value.qw * value.qw;
        if (Mathf.Abs(qLength - 1f) > 0.001f)
            throw new InvalidOperationException("Non-unit " + label + " quaternion.");
    }

    static Mesh BuildRoleMesh(RoleRecord role) {
        GeometryRecord source = role.geometry;
        int baseVertexCount = source.positions.Length / 3;
        int baseIndexCount = source.indices.Length > 0 ? source.indices.Length : baseVertexCount;
        int copies = role.meshKind == "instanced" ? role.instances.Length : 1;
        var vertices = new Vector3[checked(baseVertexCount * copies)];
        var normals = new Vector3[vertices.Length];
        var colors = new Color[vertices.Length];
        var uv = source.uv.Length == baseVertexCount * 2
            ? new Vector2[vertices.Length] : Array.Empty<Vector2>();
        var triangles = new int[checked(baseIndexCount * copies)];

        Matrix4x4 objectMatrix = role.objectTransform.Matrix;
        for (int copy = 0; copy < copies; copy++) {
            InstanceRecord instance = role.meshKind == "instanced" ? role.instances[copy] : null;
            Matrix4x4 transform = objectMatrix * (instance?.Matrix ?? Matrix4x4.identity);
            Matrix4x4 normalTransform = transform.inverse.transpose;
            Color instanceColor = instance == null
                ? Color.white : new Color(instance.cr, instance.cg, instance.cb, 1f);
            int vertexOffset = copy * baseVertexCount;
            for (int vertex = 0; vertex < baseVertexCount; vertex++) {
                int source3 = vertex * 3;
                int output = vertexOffset + vertex;
                vertices[output] = transform.MultiplyPoint3x4(new Vector3(
                    source.positions[source3], source.positions[source3 + 1], source.positions[source3 + 2]));
                normals[output] = normalTransform.MultiplyVector(new Vector3(
                    source.normals[source3], source.normals[source3 + 1], source.normals[source3 + 2]))
                    .normalized;
                Color geometryColor = source.colors.Length == source.positions.Length
                    ? new Color(source.colors[source3], source.colors[source3 + 1], source.colors[source3 + 2], 1f)
                    : Color.white;
                colors[output] = geometryColor * instanceColor;
                if (uv.Length > 0) {
                    int source2 = vertex * 2;
                    uv[output] = new Vector2(source.uv[source2], source.uv[source2 + 1]);
                }
            }
            int indexOffset = copy * baseIndexCount;
            for (int index = 0; index < baseIndexCount; index++) {
                triangles[indexOffset + index] = vertexOffset
                    + (source.indices.Length > 0 ? source.indices[index] : index);
            }
        }

        var mesh = new Mesh {
            name = role.geometry.name,
            indexFormat = vertices.Length > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16,
            vertices = vertices,
            normals = normals,
            colors = colors,
            triangles = triangles,
        };
        if (uv.Length > 0) mesh.uv = uv;
        mesh.RecalculateBounds();
        return mesh;
    }

    static Color Rgb(float[] rgb) => new(rgb[0], rgb[1], rgb[2], 1f);

    static bool ValidRgb(float[] values) {
        if (values == null || values.Length != 3 || !Finite(values)) return false;
        foreach (float value in values) if (value < 0f || value > 1f) return false;
        return true;
    }

    static bool Finite(params float[] values) {
        if (values == null) return false;
        foreach (float value in values) {
            if (float.IsNaN(value) || float.IsInfinity(value)) return false;
        }
        return true;
    }
}

}
