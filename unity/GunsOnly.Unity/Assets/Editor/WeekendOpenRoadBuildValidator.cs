using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using GunsOnly.UnityClient;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace GunsOnly.UnityEditorTools {

/// <summary>Fail-closed byte, import, schema, mesh and shader gate for Weekend open-road art.</summary>
public sealed class WeekendOpenRoadBuildValidator : IPreprocessBuildWithReport {
    const string Root = "Assets/Resources/GunsOnly/WeekendRide/OpenRoad/";
    const string NetworkPath = Root + "weekend-hinterland-road-network-v1.json";
    const string RoadSourcePath = Root + "source/track-asphalt-v1.webp.bytes";
    const string GroundSourcePath = Root + "source/weekend-hinterland-ground-v1.webp.bytes";
    const string RoadTexturePath = Root + "track-asphalt-v1.png";
    const string GroundTexturePath = Root + "weekend-hinterland-ground-v1.png";
    const string RoadsideAtlasPath = Root + "weekend-roadside-atlas-v1.png";
    const string SurfaceManifestPath = Root + "track-surface-art-manifest-v1.json";
    const string RoadsideManifestPath = Root + "weekend-roadside-art-manifest-v1.json";
    const string RoadShaderPath = Root + "WeekendOpenRoad.shader";
    const string RoadsideShaderPath = Root + "WeekendRoadsideCutout.shader";
    const string RoadPngSha256 =
        "aad02149d421dec00aead62d27feb0570eb71c104482b1f24c0cd14826470db7";
    const string GroundPngSha256 =
        "e2bc63c25d019392ca7d3bd3e9e9f01afdc4d7f13481e33f19c515336244f3d2";
    const string SurfaceManifestSha256 =
        "61ab0abebe96a573d14d22371ad8bae969b8ce633fa19d75b31005974c11e55a";
    const string RoadsideManifestSha256 =
        "d5e4e3a54bf86805fe85abfefab28426336bbf20f648cd2733942aa0f4065e22";

    public int callbackOrder => -985;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate Weekend Open Road Web + Unity Parity")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] Weekend open-road Web + Unity parity validation PASS");
    }

    public static void ValidateBatch() {
        try {
            ValidateOrThrow();
            Debug.Log("[GunsOnly] Weekend open-road Web + Unity parity validation PASS");
            EditorApplication.Exit(0);
        }
        catch (Exception ex) {
            Debug.LogException(ex);
            EditorApplication.Exit(1);
        }
    }

    public static void ValidateOrThrow() {
        var errors = new List<string>();
        ValidateHash(errors, NetworkPath,
            WeekendRoadNetworkContractResource.RoadContractSha256);
        ValidateHash(errors, RoadSourcePath,
            WeekendRoadNetworkContractResource.RoadTextureSourceSha256);
        ValidateHash(errors, GroundSourcePath,
            WeekendRoadNetworkContractResource.GroundTextureSourceSha256);
        ValidateHash(errors, RoadTexturePath, RoadPngSha256);
        ValidateHash(errors, GroundTexturePath, GroundPngSha256);
        ValidateHash(errors, RoadsideAtlasPath,
            WeekendRoadNetworkContractResource.RoadsideAtlasSha256);
        ValidateHash(errors, SurfaceManifestPath, SurfaceManifestSha256);
        ValidateHash(errors, RoadsideManifestPath, RoadsideManifestSha256);
        ValidateRepositoryCopies(errors);
        ValidateImports(errors);
        ValidateShaders(errors);
        ValidateRuntimeConsumer(errors);
        if (errors.Count > 0) {
            throw new BuildFailedException(
                "Weekend open-road Web + Unity parity validation failed:\n - "
                + string.Join("\n - ", errors));
        }
        Debug.Log(
            "[GunsOnly] Weekend open road contract="
            + WeekendRoadNetworkContractResource.RoadContractSha256.Substring(0, 12)
            + " road="
            + WeekendRoadNetworkContractResource.RoadTextureSourceSha256.Substring(0, 12)
            + " atlas="
            + WeekendRoadNetworkContractResource.RoadsideAtlasSha256.Substring(0, 12)
            + " loop>=12km roadside=144 draws=2");
    }

    static void ValidateRepositoryCopies(List<string> errors) {
        string repositoryRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
        string[] roadContracts = {
            Path.Combine(repositoryRoot,
                "content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json"),
        };
        foreach (string path in roadContracts) ValidateHash(
            errors, path, WeekendRoadNetworkContractResource.RoadContractSha256);

        string[] roadSources = {
            Path.Combine(repositoryRoot,
                "content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/weekend-ride/environment/textures/"
                + "track-asphalt-v1.webp"),
        };
        foreach (string path in roadSources) ValidateHash(
            errors, path, WeekendRoadNetworkContractResource.RoadTextureSourceSha256);

        string[] groundSources = {
            Path.Combine(repositoryRoot,
                "content/packs/weekend-ride/environment/textures/"
                + "weekend-hinterland-ground-v1.webp"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/weekend-ride/environment/textures/"
                + "weekend-hinterland-ground-v1.webp"),
        };
        foreach (string path in groundSources) ValidateHash(
            errors, path, WeekendRoadNetworkContractResource.GroundTextureSourceSha256);

        string[] atlases = {
            Path.Combine(repositoryRoot,
                "content/packs/weekend-ride/environment/foliage/"
                + "weekend-roadside-atlas-v1.png"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/weekend-ride/environment/foliage/"
                + "weekend-roadside-atlas-v1.png"),
        };
        foreach (string path in atlases) ValidateHash(
            errors, path, WeekendRoadNetworkContractResource.RoadsideAtlasSha256);

        ValidateHash(errors, Path.Combine(repositoryRoot,
            "content/packs/weekend-ride/environment/textures/"
            + "track-surface-art-manifest.v1.json"), SurfaceManifestSha256);
        ValidateHash(errors, Path.Combine(repositoryRoot,
            "web/wwwroot/content/packs/weekend-ride/environment/textures/"
            + "track-surface-art-manifest.v1.json"), SurfaceManifestSha256);
        ValidateHash(errors, Path.Combine(repositoryRoot,
            "content/packs/weekend-ride/environment/foliage/"
            + "weekend-roadside-art-manifest.v1.json"), RoadsideManifestSha256);
        ValidateHash(errors, Path.Combine(repositoryRoot,
            "web/wwwroot/content/packs/weekend-ride/environment/foliage/"
            + "weekend-roadside-art-manifest.v1.json"), RoadsideManifestSha256);
    }

    static void ValidateImports(List<string> errors) {
        ValidateTextAsset(errors, NetworkPath,
            WeekendRoadNetworkContractResource.RoadContractSha256);
        ValidateTextAsset(errors, RoadSourcePath,
            WeekendRoadNetworkContractResource.RoadTextureSourceSha256);
        ValidateTextAsset(errors, GroundSourcePath,
            WeekendRoadNetworkContractResource.GroundTextureSourceSha256);
        ValidateTextAsset(errors, SurfaceManifestPath, SurfaceManifestSha256);
        ValidateTextAsset(errors, RoadsideManifestPath, RoadsideManifestSha256);
        ValidateTexture(errors, RoadTexturePath, TextureWrapMode.Mirror, requireAlpha: false);
        ValidateTexture(errors, GroundTexturePath, TextureWrapMode.Mirror, requireAlpha: false);
        ValidateTexture(errors, RoadsideAtlasPath, TextureWrapMode.Clamp, requireAlpha: true);

        if (Resources.Load<TextAsset>(WeekendRoadNetworkContractResource.ResourcePath) == null)
            errors.Add("Weekend road graph Resources path did not resolve");
        if (Resources.Load<Texture2D>(
                WeekendRoadNetworkContractResource.RoadTextureResourcePath) == null)
            errors.Add("Weekend road texture Resources path did not resolve");
        if (Resources.Load<Texture2D>(
                WeekendRoadNetworkContractResource.GroundTextureResourcePath) == null)
            errors.Add("Weekend ground texture Resources path did not resolve");
        if (Resources.Load<Texture2D>(
                WeekendRoadNetworkContractResource.RoadsideAtlasResourcePath) == null)
            errors.Add("Weekend roadside atlas Resources path did not resolve");
    }

    static void ValidateTexture(
        List<string> errors,
        string path,
        TextureWrapMode wrapMode,
        bool requireAlpha
    ) {
        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        if (importer == null || texture == null) {
            errors.Add("Weekend texture did not import: " + path);
            return;
        }
        if (texture.width != 1024 || texture.height != 1024)
            errors.Add(path + " must remain 1024x1024");
        if (!importer.sRGBTexture) errors.Add(path + " must import as sRGB");
        if (!importer.mipmapEnabled) errors.Add(path + " must generate mipmaps");
        if (importer.mipMapsPreserveCoverage)
            errors.Add(path + " must match Web ordinary mip generation");
        if (importer.wrapMode != wrapMode)
            errors.Add(path + " wrap mode changed");
        if (importer.filterMode != FilterMode.Trilinear)
            errors.Add(path + " must use trilinear filtering");
        if (importer.anisoLevel < 8)
            errors.Add(path + " must use anisotropy >= 8");
        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
            errors.Add(path + " must remain uncompressed");
        if (importer.alphaIsTransparency)
            errors.Add(path + " must not mutate transparent RGB edge texels");
        if (requireAlpha && !texture.alphaIsTransparency
            && !importer.DoesSourceTextureHaveAlpha()) {
            errors.Add(path + " lost its cutout alpha channel");
        }
    }

    static void ValidateShaders(List<string> errors) {
        ValidateShader(errors, RoadShaderPath, "GunsOnly/WeekendOpenRoad");
        ValidateShader(errors, RoadsideShaderPath, "GunsOnly/WeekendRoadsideCutout");
        string roadSource = File.ReadAllText(Path.GetFullPath(RoadShaderPath));
        if (!roadSource.Contains("Offset -2, -1", StringComparison.Ordinal)
            || !roadSource.Contains("#pragma surface Surface Standard", StringComparison.Ordinal))
            errors.Add("Weekend road shader lost MeshStandard/polygon-offset intent");
        string roadsideSource = File.ReadAllText(Path.GetFullPath(RoadsideShaderPath));
        if (!roadsideSource.Contains("alphatest:_Cutoff", StringComparison.Ordinal)
            || !roadsideSource.Contains("Cull Off", StringComparison.Ordinal)
            || !roadsideSource.Contains(
                "1.0 - input.uv_MainTex.y", StringComparison.Ordinal))
            errors.Add("Weekend roadside shader lost alpha-test/double-side intent");

        string rendererSource = File.ReadAllText(Path.GetFullPath(
            "Assets/Scripts/WeekendHinterlandRoadRenderer.cs"));
        if (!rendererSource.Contains(
                "region.v_min_from_top + region.v_size", StringComparison.Ordinal)
            || !rendererSource.Contains(
                "float vTop = (float)region.v_min_from_top", StringComparison.Ordinal))
            errors.Add("Unity roadside mesh lost top-left bottom=vMax/top=vMin semantics");
        if (rendererSource.Contains(
                "SetColor(\"_Color\", LinearSrgb", StringComparison.Ordinal)
            || rendererSource.Contains("return new Color(r, g, b, 1f).linear",
                StringComparison.Ordinal))
            errors.Add("Weekend Standard material must not double-decode an sRGB Color property");
    }

    static void ValidateShader(List<string> errors, string path, string expectedName) {
        Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
        if (shader == null) {
            errors.Add("Weekend retained shader did not import: " + path);
            return;
        }
        if (shader.name != expectedName) errors.Add(path + " shader name changed");
        if (ShaderUtil.ShaderHasError(shader)) errors.Add(path + " has compiler errors");
    }

    static void ValidateRuntimeConsumer(List<string> errors) {
        WeekendRoadNetworkFrame frame = null;
        WeekendHinterlandRoadRenderer renderer = null;
        Material ground = null;
        var parent = new GameObject("weekend-open-road-validator-parent");
        try {
            frame = WeekendRoadNetworkContractResource.Load();
            renderer = WeekendHinterlandRoadRenderer.Attach(parent.transform);
            if (renderer.NetworkId != WeekendRoadNetworkContractResource.NetworkId)
                errors.Add("Runtime open-road renderer built the wrong network");
            if (renderer.RoadsideInstanceCount != 144)
                errors.Add("Runtime open-road renderer lost roadside instances");
            MeshFilter[] filters = renderer.GetComponentsInChildren<MeshFilter>();
            if (filters.Length != 2)
                errors.Add("Runtime open-road renderer must remain exactly two retained draws");
            else {
                int pointCount = 0;
                foreach (WeekendRoadFrame roadFrame in frame.roads)
                    pointCount += roadFrame.centreline.Length;
                int expectedRoadVertices = pointCount * 2
                    + frame.junctions.Length
                        * (frame.geometry.junction_radial_segments + 1);
                MeshFilter road = Array.Find(filters,
                    candidate => candidate.name == "weekend-open-road-asphalt");
                MeshFilter roadside = Array.Find(filters,
                    candidate => candidate.name == "weekend-open-road-roadside");
                if (road == null || road.sharedMesh.vertexCount != expectedRoadVertices)
                    errors.Add("Runtime open-road mesh does not use every contract point");
                if (roadside == null
                    || roadside.sharedMesh.vertexCount != frame.roadside_instances.Length * 4)
                    errors.Add("Runtime roadside mesh does not use every contract instance");
            }
            ground = WeekendHinterlandRoadRenderer.CreateGroundMaterial();
            if (ground.GetTexture("_MainTex")
                != WeekendRoadNetworkContractResource.LoadGroundTexture())
                errors.Add("Weekend ground material did not bind the exact staged texture");
            Vector2 repeat = ground.GetTextureScale("_MainTex");
            if (Mathf.Abs(repeat.x - 137.5f) > 0.001f
                || Mathf.Abs(repeat.y - 137.5f) > 0.001f)
                errors.Add("Weekend ground material lost its 160 m world tile scale");
        }
        catch (Exception ex) {
            errors.Add("Runtime Weekend open-road consumer failed: " + ex.Message);
        }
        finally {
            if (ground != null) UnityEngine.Object.DestroyImmediate(ground);
            if (parent != null) UnityEngine.Object.DestroyImmediate(parent);
        }
    }

    static void ValidateTextAsset(List<string> errors, string path, string sha256) {
        TextAsset asset = AssetDatabase.LoadAssetAtPath<TextAsset>(path);
        if (asset == null) {
            errors.Add("Weekend TextAsset did not import: " + path);
        }
        else if (!string.Equals(Sha256Hex(asset.bytes), sha256, StringComparison.Ordinal)) {
            errors.Add("Weekend imported TextAsset bytes changed: " + path);
        }
    }

    static void ValidateHash(List<string> errors, string path, string sha256) {
        if (!File.Exists(path)) {
            errors.Add("Missing Weekend parity asset: " + path);
            return;
        }
        string actual = Sha256Hex(File.ReadAllBytes(path));
        if (!string.Equals(actual, sha256, StringComparison.Ordinal))
            errors.Add(path + " sha256=" + actual + " expected=" + sha256);
    }

    static string Sha256Hex(byte[] bytes) =>
        BitConverter.ToString(SHA256.Create().ComputeHash(bytes))
            .Replace("-", string.Empty).ToLowerInvariant();
}

}
