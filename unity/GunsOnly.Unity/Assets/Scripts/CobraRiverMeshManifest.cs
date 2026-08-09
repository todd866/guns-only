using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Loads the exact non-indexed river triangle soup exported from the Web Build 299 presentation.
/// Geometry, normals and the custom riverFrame shader attribute remain byte-authoritative.
/// </summary>
public static class CobraRiverMeshManifest {
    const string ResourcePath =
        "GunsOnly/CobraVietnam/environment/cobra-canyon-river-mesh-desktop-v1";
    const string ExpectedSchema = "guns-only.cobra-canyon.unity-river-mesh.v1";
    public const string ExpectedManifestSha256 =
        "6cdcb2854c5ddaed8ba0261225a68077ecbfcf2992373a635688e1623224b5b2";

    const int ExpectedVertexCount = 7752;
    const int ExpectedTriangleCount = 2584;

    [Serializable]
    sealed class Manifest {
        public string schema;
        public string sourceWorldId;
        public string sourceContentVersion;
        public string sourceVisualContractId;
        public int sourceWebBuild;
        public string qualityTier;
        public SourcePresentationRecord sourcePresentation;
        public CoordinateSystemRecord coordinateSystem;
        public TopologyRecord topology;
        public AttributesRecord attributes;
    }

    [Serializable]
    sealed class SourcePresentationRecord {
        public string group;
        public string mesh;
        public string geometry;
        public string role;
    }

    [Serializable]
    sealed class CoordinateSystemRecord {
        public string units;
        public string x;
        public string y;
        public string z;
    }

    [Serializable]
    sealed class TopologyRecord {
        public string primitive;
        public bool indexed;
        public int vertexCount;
        public int elementCount;
        public int triangleCount;
    }

    [Serializable]
    sealed class AttributesRecord {
        public AttributeRecord normal;
        public AttributeRecord position;
        public AttributeRecord riverFrame;
    }

    [Serializable]
    sealed class AttributeRecord {
        public string componentType;
        public int itemSize;
        public int count;
        public bool normalized;
        public string encoding;
        public int byteLength;
        public string sha256;
        public string data;
    }

    sealed class DecodedManifest {
        public Manifest Source;
        public float[] Positions;
        public float[] Normals;
        public float[] RiverFrames;
    }

    public static void Build(Transform parent) {
        TextAsset source = Resources.Load<TextAsset>(ResourcePath);
        if (source == null) {
            throw new InvalidOperationException(
                "Missing exact Web river manifest at " + ResourcePath + ".");
        }
        string manifestHash = Sha256Hex(source.bytes);
        if (!string.Equals(manifestHash, ExpectedManifestSha256, StringComparison.Ordinal)) {
            throw new InvalidOperationException(
                "Web river manifest SHA-256 mismatch: " + manifestHash + ".");
        }
        DecodedManifest decoded = ParseAndDecodeOrThrow(source.text);

        int vertexCount = decoded.Source.topology.vertexCount;
        var vertices = new Vector3[vertexCount];
        var normals = new Vector3[vertexCount];
        var riverFrames = new List<Vector4>(vertexCount);
        var triangles = new int[vertexCount];
        for (int vertex = 0; vertex < vertexCount; vertex++) {
            int vector3Offset = vertex * 3;
            int vector4Offset = vertex * 4;
            vertices[vertex] = new Vector3(
                decoded.Positions[vector3Offset],
                decoded.Positions[vector3Offset + 1],
                decoded.Positions[vector3Offset + 2]);
            normals[vertex] = new Vector3(
                decoded.Normals[vector3Offset],
                decoded.Normals[vector3Offset + 1],
                decoded.Normals[vector3Offset + 2]);
            riverFrames.Add(new Vector4(
                decoded.RiverFrames[vector4Offset],
                decoded.RiverFrames[vector4Offset + 1],
                decoded.RiverFrames[vector4Offset + 2],
                decoded.RiverFrames[vector4Offset + 3]));
            // Unity requires an index buffer; identity indices preserve the Web non-indexed
            // triangle soup exactly without merging or reordering any vertices.
            triangles[vertex] = vertex;
        }

        var mesh = new Mesh {
            name = decoded.Source.sourcePresentation.geometry,
            indexFormat = IndexFormat.UInt16,
            vertices = vertices,
            normals = normals,
            triangles = triangles,
        };
        mesh.SetUVs(1, riverFrames);
        mesh.RecalculateBounds();

        Texture2D groundTexture = Resources.Load<Texture2D>(
            "GunsOnly/CobraVietnam/environment/textures/cobra-ground-macro-painted-v1");
        if (groundTexture == null) {
            throw new InvalidOperationException("Missing Cobra Canyon ground macro texture.");
        }
        var body = new GameObject("River");
        body.transform.SetParent(parent, false);
        body.AddComponent<MeshFilter>().sharedMesh = mesh;
        var renderer = body.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = GunsOnlyMats.River(groundTexture);
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = true;

        Debug.Log(
            $"[GunsOnly] exact Web river build={decoded.Source.sourceWebBuild} "
            + $"vertices={vertexCount} triangles={decoded.Source.topology.triangleCount}");
    }

    /// <summary>Editor/build validation entry point; verifies every embedded attribute byte.</summary>
    public static void ValidateJsonOrThrow(string json) {
        _ = ParseAndDecodeOrThrow(json);
    }

    static DecodedManifest ParseAndDecodeOrThrow(string json) {
        if (string.IsNullOrWhiteSpace(json)) {
            throw new InvalidOperationException("River manifest JSON is empty.");
        }
        Manifest manifest;
        try {
            manifest = JsonUtility.FromJson<Manifest>(json);
        }
        catch (Exception ex) {
            throw new InvalidOperationException("River manifest JSON is malformed.", ex);
        }
        // JsonUtility materializes a default nested reference for an explicit JSON null. Enforce
        // the non-indexed contract against the source token instead of trusting that lossy DTO.
        if (!Regex.IsMatch(json, "\\\"index\\\"\\s*:\\s*null\\s*[,}]")) {
            throw new InvalidOperationException("River topology index must be explicit JSON null.");
        }
        ValidateIdentityAndTopology(manifest);

        float[] normals = DecodeAttribute(
            manifest.attributes.normal,
            "normal",
            itemSize: 3,
            expectedSha256: "47d77b461e1ce1309ead05b7ecbc040f89ad132807798c2674d511eb8a58b97a");
        float[] positions = DecodeAttribute(
            manifest.attributes.position,
            "position",
            itemSize: 3,
            expectedSha256: "3f8817edf5280451239e0abd32f683e71379c19dd952e906ebd848eef08bfca0");
        float[] riverFrames = DecodeAttribute(
            manifest.attributes.riverFrame,
            "riverFrame",
            itemSize: 4,
            expectedSha256: "7d874b4e5fa47718cc0339a67dbddc8fd33ea14aeda69b84c02ca811df2775e7");
        return new DecodedManifest {
            Source = manifest,
            Positions = positions,
            Normals = normals,
            RiverFrames = riverFrames,
        };
    }

    static void ValidateIdentityAndTopology(Manifest manifest) {
        if (manifest == null
            || manifest.schema != ExpectedSchema
            || manifest.sourceWorldId != "world.cobra-canyon.v1"
            || manifest.sourceContentVersion != "1.0.0"
            || manifest.sourceVisualContractId != CobraVisualContract.ExpectedContractId
            || manifest.sourceWebBuild != 299
            || manifest.qualityTier != "desktop") {
            throw new InvalidOperationException(
                "River mesh source identity is not Web Build 299 desktop.");
        }
        SourcePresentationRecord presentation = manifest.sourcePresentation;
        if (presentation == null
            || presentation.group != "COBRA_CANYON_PRESENTATION_ONLY"
            || presentation.mesh != "COBRA_CANYON_RIVER"
            || presentation.geometry != "COBRA_CANYON_RIVER_GEOMETRY"
            || presentation.role != "river") {
            throw new InvalidOperationException("River source presentation identity is invalid.");
        }
        CoordinateSystemRecord coordinates = manifest.coordinateSystem;
        if (coordinates == null
            || coordinates.units != "metres"
            || coordinates.x != "east"
            || coordinates.y != "up"
            || coordinates.z != "negative-north") {
            throw new InvalidOperationException("River coordinate convention is invalid.");
        }
        TopologyRecord topology = manifest.topology;
        if (topology == null
            || topology.primitive != "triangles"
            || topology.indexed
            || topology.vertexCount != ExpectedVertexCount
            || topology.elementCount != ExpectedVertexCount
            || topology.triangleCount != ExpectedTriangleCount
            || topology.elementCount % 3 != 0
            || topology.triangleCount != topology.elementCount / 3) {
            throw new InvalidOperationException(
                "River topology is not the exact non-indexed Web triangle soup.");
        }
        if (manifest.attributes == null
            || manifest.attributes.normal == null
            || manifest.attributes.position == null
            || manifest.attributes.riverFrame == null) {
            throw new InvalidOperationException("River attribute records are incomplete.");
        }
    }

    static float[] DecodeAttribute(
        AttributeRecord attribute,
        string name,
        int itemSize,
        string expectedSha256) {
        int expectedFloatCount = checked(ExpectedVertexCount * itemSize);
        int expectedByteLength = checked(expectedFloatCount * sizeof(float));
        if (attribute.componentType != "float32"
            || attribute.itemSize != itemSize
            || attribute.count != ExpectedVertexCount
            || attribute.normalized
            || attribute.encoding != "base64-f32le"
            || attribute.byteLength != expectedByteLength
            || attribute.sha256 != expectedSha256
            || string.IsNullOrEmpty(attribute.data)) {
            throw new InvalidOperationException("River " + name + " metadata is invalid.");
        }
        byte[] bytes;
        try {
            bytes = Convert.FromBase64String(attribute.data);
        }
        catch (FormatException ex) {
            throw new InvalidOperationException("River " + name + " base64 is malformed.", ex);
        }
        if (bytes.Length != expectedByteLength
            || !string.Equals(Convert.ToBase64String(bytes), attribute.data, StringComparison.Ordinal)) {
            throw new InvalidOperationException("River " + name + " byte length/encoding drifted.");
        }
        string actualSha256 = Sha256Hex(bytes);
        if (!string.Equals(actualSha256, expectedSha256, StringComparison.Ordinal)) {
            throw new InvalidOperationException(
                "River " + name + " SHA-256 mismatch: " + actualSha256 + ".");
        }

        var values = new float[expectedFloatCount];
        for (int index = 0; index < values.Length; index++) {
            int offset = index * sizeof(float);
            int bits = bytes[offset]
                | bytes[offset + 1] << 8
                | bytes[offset + 2] << 16
                | bytes[offset + 3] << 24;
            float value = BitConverter.Int32BitsToSingle(bits);
            if (float.IsNaN(value) || float.IsInfinity(value)) {
                throw new InvalidOperationException(
                    "River " + name + " contains a non-finite float at " + index + ".");
            }
            values[index] = value;
        }
        return values;
    }

    static string Sha256Hex(byte[] bytes) {
        using SHA256 sha = SHA256.Create();
        byte[] digest = sha.ComputeHash(bytes);
        var result = new StringBuilder(digest.Length * 2);
        foreach (byte value in digest) result.Append(value.ToString("x2"));
        return result.ToString();
    }
}

}
