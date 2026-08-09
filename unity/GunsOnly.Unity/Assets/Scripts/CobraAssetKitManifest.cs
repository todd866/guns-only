using System;
using System.Collections.Generic;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Loads geometry and deterministic transforms exported by the Web Build 299 asset planner.
/// Unity does not own a second foliage or prop placement algorithm.
/// </summary>
public static class CobraAssetKitManifest {
    const string ResourcePath =
        "GunsOnly/CobraVietnam/environment/cobra-canyon-asset-kit-desktop-v1";
    const string ExpectedSchema = "guns-only.cobra-canyon.unity-asset-kit.v1";
    static readonly string[] ExpectedRoles = {
        "jungle", "mist", "paddy", "plantation", "rock", "village", "waterAccent",
    };

    [Serializable]
    sealed class Manifest {
        public string schema;
        public string sourceWorldId;
        public string sourceContentVersion;
        public string sourceVisualContractId;
        public int sourceWebBuild;
        public string qualityTier;
        public int maximumInstances;
        public RoleRecord[] roles;
    }

    [Serializable]
    sealed class RoleRecord {
        public string role;
        public int count;
        public GeometryRecord geometry;
        public InstanceRecord[] instances;
    }

    [Serializable]
    sealed class GeometryRecord {
        public float[] positions;
        public float[] normals;
        public float[] colors;
        public float[] uv;
        public int[] indices;
    }

    [Serializable]
    sealed class InstanceRecord {
        public string id;
        public string batchId;
        public string setPieceId;
        public string archetypeId;
        public float px, py, pz;
        public float qx, qy, qz, qw;
        public float sx, sy, sz;
        public float cr, cg, cb;
    }

    public static void Build(Transform parent) {
        TextAsset source = Resources.Load<TextAsset>(ResourcePath);
        if (source == null) {
            throw new InvalidOperationException($"Missing Web asset-kit manifest at {ResourcePath}.");
        }
        Manifest manifest = JsonUtility.FromJson<Manifest>(source.text);
        Validate(manifest);

        var root = new GameObject("COBRA_CANYON_ASSET_KIT_PRESENTATION_ONLY").transform;
        root.SetParent(parent, false);
        Texture2D foliageAtlas = Resources.Load<Texture2D>(
            "GunsOnly/CobraVietnam/environment/foliage/foliage-atlas-painted-v2");
        if (foliageAtlas == null) {
            throw new InvalidOperationException("Missing Build 299 Cobra foliage atlas.");
        }

        int builtInstances = 0;
        foreach (RoleRecord role in manifest.roles) {
            Mesh mesh = BuildRoleMesh(role);
            var go = new GameObject($"COBRA_CANYON_ASSET_{role.role.ToUpperInvariant()}");
            go.transform.SetParent(root, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = GunsOnlyMats.CobraAsset(role.role, foliageAtlas);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            builtInstances += role.count;
        }
        Debug.Log(
            $"[GunsOnly] Web asset kit parity build={manifest.sourceWebBuild} "
            + $"roles={manifest.roles.Length} instances={builtInstances}");
    }

    static void Validate(Manifest manifest) {
        if (manifest == null) throw new InvalidOperationException("Asset-kit manifest is empty.");
        if (!string.Equals(manifest.schema, ExpectedSchema, StringComparison.Ordinal)) {
            throw new InvalidOperationException($"Asset-kit schema {manifest.schema} != {ExpectedSchema}.");
        }
        if (!string.Equals(manifest.sourceWorldId, "world.cobra-canyon.v1", StringComparison.Ordinal)
            || !string.Equals(
                manifest.sourceVisualContractId,
                "visual-contract.cobra-vietnam.cobra-canyon.v1",
                StringComparison.Ordinal)
            || !string.Equals(manifest.sourceContentVersion, "1.0.0", StringComparison.Ordinal)
            || manifest.sourceWebBuild != 299
            || !string.Equals(manifest.qualityTier, "desktop", StringComparison.Ordinal)) {
            throw new InvalidOperationException("Asset-kit source identity is not Web Build 299 desktop.");
        }
        if (manifest.roles == null || manifest.roles.Length != 7) {
            throw new InvalidOperationException("Asset-kit must contain all seven Web render roles.");
        }
        int instances = 0;
        var roles = new HashSet<string>(StringComparer.Ordinal);
        foreach (RoleRecord role in manifest.roles) {
            if (string.IsNullOrEmpty(role.role) || role.geometry?.positions == null
                || role.geometry.positions.Length == 0
                || role.geometry.positions.Length % 3 != 0
                || role.instances == null || role.instances.Length != role.count) {
                throw new InvalidOperationException($"Invalid asset-kit role {role?.role ?? "<null>"}.");
            }
            if (!roles.Add(role.role)) {
                throw new InvalidOperationException("Duplicate asset-kit role " + role.role + ".");
            }
            ValidateGeometry(role);
            ValidateInstances(role);
            instances += role.count;
        }
        foreach (string expectedRole in ExpectedRoles) {
            if (!roles.Contains(expectedRole)) {
                throw new InvalidOperationException("Missing asset-kit role " + expectedRole + ".");
            }
        }
        if (instances != manifest.maximumInstances || instances != 1330) {
            throw new InvalidOperationException(
                $"Asset-kit instance count {instances} does not match Web desktop budget 1330.");
        }
    }

    static void ValidateGeometry(RoleRecord role) {
        GeometryRecord geometry = role.geometry;
        int vertexCount = geometry.positions.Length / 3;
        if (geometry.normals == null || geometry.normals.Length != geometry.positions.Length
            || geometry.colors == null || geometry.colors.Length != geometry.positions.Length
            || geometry.positions.Length > 0 && !Finite(geometry.positions)
            || !Finite(geometry.normals) || !Finite(geometry.colors)) {
            throw new InvalidOperationException("Malformed geometry arrays for role " + role.role + ".");
        }
        bool requiresUv = role.role == "jungle" || role.role == "mist";
        int uvLength = geometry.uv?.Length ?? 0;
        if ((requiresUv && uvLength != vertexCount * 2)
            || (!requiresUv && uvLength != 0)
            || (uvLength > 0 && !Finite(geometry.uv))) {
            throw new InvalidOperationException("Malformed UV array for role " + role.role + ".");
        }
        if (geometry.indices == null) {
            throw new InvalidOperationException("Missing index array for role " + role.role + ".");
        }
        if (geometry.indices.Length > 0 && geometry.indices.Length % 3 != 0) {
            throw new InvalidOperationException("Non-triangle index array for role " + role.role + ".");
        }
        foreach (int index in geometry.indices) {
            if (index < 0 || index >= vertexCount) {
                throw new InvalidOperationException("Out-of-range index for role " + role.role + ".");
            }
        }
    }

    static void ValidateInstances(RoleRecord role) {
        foreach (InstanceRecord instance in role.instances) {
            if (instance == null || string.IsNullOrEmpty(instance.id)
                || !Finite(instance.px, instance.py, instance.pz)
                || !Finite(instance.qx, instance.qy, instance.qz, instance.qw)
                || !Finite(instance.sx, instance.sy, instance.sz)
                || !Finite(instance.cr, instance.cg, instance.cb)
                || instance.sx <= 0f || instance.sy <= 0f || instance.sz <= 0f) {
                throw new InvalidOperationException("Malformed instance in role " + role.role + ".");
            }
            float quaternionLengthSquared = instance.qx * instance.qx + instance.qy * instance.qy
                + instance.qz * instance.qz + instance.qw * instance.qw;
            if (Mathf.Abs(quaternionLengthSquared - 1f) > 0.001f) {
                throw new InvalidOperationException(
                    $"Non-unit quaternion on {role.role} instance {instance.id}.");
            }
        }
    }

    static bool Finite(params float[] values) {
        foreach (float value in values) {
            if (float.IsNaN(value) || float.IsInfinity(value)) return false;
        }
        return true;
    }

    static Mesh BuildRoleMesh(RoleRecord role) {
        GeometryRecord source = role.geometry;
        int baseVertexCount = source.positions.Length / 3;
        bool indexed = source.indices != null && source.indices.Length > 0;
        int baseIndexCount = indexed ? source.indices.Length : baseVertexCount;
        int vertexCount = checked(baseVertexCount * role.count);
        int indexCount = checked(baseIndexCount * role.count);
        var vertices = new Vector3[vertexCount];
        var normals = new Vector3[vertexCount];
        var colors = new Color[vertexCount];
        var uv = source.uv != null && source.uv.Length == baseVertexCount * 2
            ? new Vector2[vertexCount]
            : Array.Empty<Vector2>();
        var triangles = new int[indexCount];

        for (int instanceIndex = 0; instanceIndex < role.count; instanceIndex++) {
            InstanceRecord instance = role.instances[instanceIndex];
            var position = new Vector3(instance.px, instance.py, instance.pz);
            var rotation = new Quaternion(instance.qx, instance.qy, instance.qz, instance.qw);
            var scale = new Vector3(instance.sx, instance.sy, instance.sz);
            Matrix4x4 transform = Matrix4x4.TRS(position, rotation, scale);
            Matrix4x4 normalTransform = transform.inverse.transpose;
            int vertexOffset = instanceIndex * baseVertexCount;
            for (int baseVertex = 0; baseVertex < baseVertexCount; baseVertex++) {
                int source3 = baseVertex * 3;
                int outputVertex = vertexOffset + baseVertex;
                vertices[outputVertex] = transform.MultiplyPoint3x4(new Vector3(
                    source.positions[source3],
                    source.positions[source3 + 1],
                    source.positions[source3 + 2]));
                Vector3 baseNormal = source.normals != null
                    && source.normals.Length == source.positions.Length
                    ? new Vector3(
                        source.normals[source3],
                        source.normals[source3 + 1],
                        source.normals[source3 + 2])
                    : Vector3.up;
                normals[outputVertex] = normalTransform.MultiplyVector(baseNormal).normalized;
                Color baseColor = source.colors != null
                    && source.colors.Length == source.positions.Length
                    ? new Color(
                        source.colors[source3],
                        source.colors[source3 + 1],
                        source.colors[source3 + 2],
                        1f)
                    : Color.white;
                colors[outputVertex] = new Color(
                    baseColor.r * instance.cr,
                    baseColor.g * instance.cg,
                    baseColor.b * instance.cb,
                    1f);
                if (uv.Length > 0) {
                    int source2 = baseVertex * 2;
                    // PNG foliage uses the contract's authored top-left/v-down convention. The
                    // procedural Web mist DataTexture already uses native sampler coordinates,
                    // so its exported UVs transfer directly to Unity's generated Texture2D.
                    uv[outputVertex] = role.role == "jungle"
                        ? new Vector2(source.uv[source2], 1f - source.uv[source2 + 1])
                        : new Vector2(source.uv[source2], source.uv[source2 + 1]);
                }
            }
            int outputIndex = instanceIndex * baseIndexCount;
            for (int index = 0; index < baseIndexCount; index++) {
                triangles[outputIndex + index] = vertexOffset
                    + (indexed ? source.indices[index] : index);
            }
        }

        var mesh = new Mesh {
            name = $"COBRA_CANYON_ASSET_{role.role.ToUpperInvariant()}_GEOMETRY",
            indexFormat = UnityEngine.Rendering.IndexFormat.UInt32,
            vertices = vertices,
            normals = normals,
            colors = colors,
            triangles = triangles,
        };
        if (uv.Length > 0) mesh.uv = uv;
        mesh.RecalculateBounds();
        return mesh;
    }
}

}
