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

/// <summary>
/// Fail-closed byte/import/wiring gate for the F-22-only exact low-altitude presentation. The
/// Rapier, Cobra, Weekend, and Korea routes do not consume these Resources or this validator.
/// </summary>
public sealed class F22UkraineLowAltitudeWorldBuildValidator : IPreprocessBuildWithReport {
    const string UkraineRoot = "Assets/Resources/GunsOnly/UkraineModern/";
    const string TerrainPath =
        UkraineRoot + "environment/terrain/rapier-site.kernel.truth.bytes";
    const string FoliagePath =
        UkraineRoot + "environment/foliage/ukraine-temperate-foliage-v1.png";
    const string FoliageManifestPath =
        UkraineRoot + "environment/foliage/ukraine-foliage-art-manifest.v1.json";
    const string PresentationPath =
        UkraineRoot + "presentation/f22-low-altitude-world.web-build-299.v1.json";
    const string ShaderPath = UkraineRoot + "F22UkraineFoliage.shader";
    const string WorldBindingPath = "Assets/Scripts/F22UkraineLowAltitudeWorld.cs";
    const string FirstMergePath = "Assets/Scripts/FirstMergeBootstrap.cs";

    public int callbackOrder => -988;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate F-22 Ukraine Low-Altitude Web Parity")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] F-22 Ukraine low-altitude Web parity validation PASS");
    }

    public static void ValidateBatch() {
        try {
            ValidateOrThrow();
            Debug.Log("[GunsOnly] F-22 Ukraine low-altitude Web parity validation PASS");
            EditorApplication.Exit(0);
        }
        catch (Exception ex) {
            Debug.LogException(ex);
            EditorApplication.Exit(1);
        }
    }

    public static void ValidateOrThrow() {
        var errors = new List<string>();
        ValidateHash(errors, TerrainPath, F22UkraineLowAltitudeWorld.TerrainTruthSha256);
        ValidateHash(errors, FoliagePath, F22UkraineLowAltitudeWorld.FoliageSha256);
        ValidateHash(errors, FoliageManifestPath,
            F22UkraineLowAltitudeWorld.FoliageManifestSha256);
        ValidateHash(errors, PresentationPath,
            F22UkraineLowAltitudeWorld.PresentationSha256);
        ValidateRepositoryCopies(errors);
        ValidateImports(errors);
        ValidateContract(errors);
        ValidateShader(errors);
        ValidateWiring(errors);
        if (errors.Count > 0) {
            throw new BuildFailedException(
                "F-22 Ukraine low-altitude Web parity validation failed:\n - "
                + string.Join("\n - ", errors));
        }
        Debug.Log(
            "[GunsOnly] F-22 low-altitude terrain="
            + F22UkraineLowAltitudeWorld.TerrainTruthSha256.Substring(0, 12)
            + " foliage=" + F22UkraineLowAltitudeWorld.FoliageSha256.Substring(0, 12)
            + " contract=" + F22UkraineLowAltitudeWorld.PresentationSha256.Substring(0, 12)
            + " detail=513x513@32m bounds=+/-8192m"
            + " placements=2448-tree/224-building/510-road");
    }

    static void ValidateRepositoryCopies(List<string> errors) {
        string root = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
        string[] terrainCopies = {
            Path.Combine(root,
                "content/packs/ukraine-modern/environment/terrain-atlas/"
                + "rapier-site.kernel.truth"),
            Path.Combine(root,
                "web/wwwroot/content/packs/ukraine-modern/environment/terrain-atlas/"
                + "rapier-site.kernel.truth"),
        };
        foreach (string path in terrainCopies) {
            ValidateHash(errors, path, F22UkraineLowAltitudeWorld.TerrainTruthSha256);
        }
        string[] foliageCopies = {
            Path.Combine(root,
                "content/packs/ukraine-modern/environment/foliage/"
                + "ukraine-temperate-foliage-v1.png"),
            Path.Combine(root,
                "web/wwwroot/content/packs/ukraine-modern/environment/foliage/"
                + "ukraine-temperate-foliage-v1.png"),
        };
        foreach (string path in foliageCopies) {
            ValidateHash(errors, path, F22UkraineLowAltitudeWorld.FoliageSha256);
        }
        string[] manifestCopies = {
            Path.Combine(root,
                "content/packs/ukraine-modern/environment/foliage/"
                + "ukraine-foliage-art-manifest.v1.json"),
            Path.Combine(root,
                "web/wwwroot/content/packs/ukraine-modern/environment/foliage/"
                + "ukraine-foliage-art-manifest.v1.json"),
        };
        foreach (string path in manifestCopies) {
            ValidateHash(errors, path, F22UkraineLowAltitudeWorld.FoliageManifestSha256);
        }
        string[] presentationCopies = {
            Path.Combine(root,
                "content/packs/ukraine-modern/presentation/"
                + "f22-low-altitude-world.web-build-299.v1.json"),
            Path.Combine(root,
                "web/wwwroot/content/packs/ukraine-modern/presentation/"
                + "f22-low-altitude-world.web-build-299.v1.json"),
        };
        foreach (string path in presentationCopies) {
            ValidateHash(errors, path, F22UkraineLowAltitudeWorld.PresentationSha256);
        }
    }

    static void ValidateImports(List<string> errors) {
        TextAsset terrain = AssetDatabase.LoadAssetAtPath<TextAsset>(TerrainPath);
        TextAsset foliageManifest = AssetDatabase.LoadAssetAtPath<TextAsset>(FoliageManifestPath);
        TextAsset presentation = AssetDatabase.LoadAssetAtPath<TextAsset>(PresentationPath);
        if (terrain == null || !HashMatches(
                terrain.bytes, F22UkraineLowAltitudeWorld.TerrainTruthSha256)) {
            errors.Add("Exact 32 m terrain truth did not import as the locked TextAsset");
        }
        if (foliageManifest == null || !HashMatches(
                foliageManifest.bytes, F22UkraineLowAltitudeWorld.FoliageManifestSha256)) {
            errors.Add("Foliage provenance manifest did not import as exact bytes");
        }
        if (presentation == null || !HashMatches(
                presentation.bytes, F22UkraineLowAltitudeWorld.PresentationSha256)) {
            errors.Add("Web-derived placement contract did not import as exact bytes");
        }
        if (Resources.Load<TextAsset>(F22UkraineLowAltitudeWorld.TerrainTruthResourcePath)
            != terrain) {
            errors.Add("Terrain truth Resources path does not resolve its retained TextAsset");
        }
        if (Resources.Load<TextAsset>(F22UkraineLowAltitudeWorld.PresentationResourcePath)
            != presentation) {
            errors.Add("Placement contract Resources path does not resolve its retained TextAsset");
        }
        if (Resources.Load<TextAsset>(F22UkraineLowAltitudeWorld.FoliageManifestResourcePath)
            != foliageManifest) {
            errors.Add("Foliage manifest Resources path does not resolve its retained TextAsset");
        }

        TextureImporter importer = AssetImporter.GetAtPath(FoliagePath) as TextureImporter;
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(FoliagePath);
        if (importer == null || texture == null) {
            errors.Add("Generated Ukraine foliage atlas did not import as Texture2D");
            return;
        }
        if (texture.width != 1024 || texture.height != 1024) {
            errors.Add($"Foliage atlas must be 1024x1024, got {texture.width}x{texture.height}");
        }
        if (!importer.sRGBTexture) errors.Add("Foliage atlas must import as sRGB");
        if (!importer.mipmapEnabled) errors.Add("Foliage atlas must retain ordinary mipmaps");
        if (importer.mipMapsPreserveCoverage) {
            errors.Add("Foliage atlas must match Web ordinary mipmaps, not coverage remapping");
        }
        if (Mathf.Abs(importer.alphaTestReferenceValue
            - F22UkraineLowAltitudeWorld.FoliageAlphaCutoff) > 0.0001f) {
            errors.Add("Foliage importer alpha reference must stay at Web cutoff 0.38");
        }
        if (importer.wrapMode != TextureWrapMode.Clamp) {
            errors.Add("Foliage atlas must clamp to its authored region edges");
        }
        if (importer.filterMode != FilterMode.Trilinear) {
            errors.Add("Foliage atlas must use trilinear filtering");
        }
        if (importer.anisoLevel < 4) errors.Add("Foliage atlas anisotropy must be >= 4");
        if (importer.textureCompression != TextureImporterCompression.Uncompressed) {
            errors.Add("Foliage runtime PNG must remain uncompressed");
        }
        if (importer.alphaIsTransparency) {
            errors.Add("Straight-alpha foliage must not receive Unity colour dilation");
        }
        if (Resources.Load<Texture2D>(F22UkraineLowAltitudeWorld.FoliageTextureResourcePath)
            != texture) {
            errors.Add("Foliage Resources path does not resolve the retained texture");
        }
    }

    static void ValidateContract(List<string> errors) {
        TextAsset asset = AssetDatabase.LoadAssetAtPath<TextAsset>(PresentationPath);
        if (asset == null) return;
        ContractProbe contract;
        try {
            contract = JsonUtility.FromJson<ContractProbe>(asset.text);
        }
        catch (Exception ex) {
            errors.Add("Placement contract JSON failed to decode: " + ex.Message);
            return;
        }
        if (contract == null
            || contract.presentationId != F22UkraineLowAltitudeWorld.PresentationId
            || contract.terrain?.sha256 != F22UkraineLowAltitudeWorld.TerrainTruthSha256
            || contract.foliageAtlas?.sha256 != F22UkraineLowAltitudeWorld.FoliageSha256
            || Mathf.Abs((contract.foliageAtlas?.alphaCutoff ?? 0f) - 0.38f) > 0.0001f
            || contract.counts?.chunks != 4
            || contract.counts?.trees != 2448
            || contract.counts?.buildings != 224
            || contract.counts?.roadSegments != 510
            || contract.chunks?.Length != 4) {
            errors.Add("Placement contract identity/counts no longer match frozen Build 299 Web");
        }
        if (contract?.chunks != null) {
            foreach (ChunkProbe chunk in contract.chunks) {
                if (chunk?.sourceRecord == null
                    || chunk.sourceRecord.level != 0
                    || chunk.sourceRecord.sampleCount != 257
                    || Mathf.Abs(chunk.sourceRecord.spacingM - 32f) > 0.0001f) {
                    errors.Add("Placement chunk is not sourced from exact Web 257x257 LOD0");
                    break;
                }
            }
        }
    }

    static void ValidateShader(List<string> errors) {
        Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath);
        if (shader == null) {
            errors.Add("Retained F-22 foliage/scenery shader did not import");
            return;
        }
        if (ShaderUtil.ShaderHasError(shader)) {
            errors.Add("Retained F-22 foliage/scenery shader has compile errors");
        }
        if (Resources.Load<Shader>(F22UkraineLowAltitudeWorld.FoliageShaderResourcePath)
            != shader) {
            errors.Add("F-22 foliage shader Resources path does not resolve retained shader");
        }
        string source = File.ReadAllText(ShaderPath);
        string[] tokens = {
            "clip(atlas.a - _Cutoff)",
            "1.0 - input.authoredUv.y",
            "SHADOW_ATTENUATION(input)",
            "distanceToCamera * distanceToCamera",
            "_AtmosphereHazeMix",
            "Tags { \"LightMode\"=\"ShadowCaster\" }",
        };
        foreach (string token in tokens) {
            if (!source.Contains(token, StringComparison.Ordinal)) {
                errors.Add("F-22 foliage shader lost retained token: " + token);
            }
        }
    }

    static void ValidateWiring(List<string> errors) {
        if (!File.Exists(WorldBindingPath) || !File.Exists(FirstMergePath)) {
            errors.Add("F-22 low-altitude runtime wiring files are missing");
            return;
        }
        string world = File.ReadAllText(WorldBindingPath);
        string firstMerge = File.ReadAllText(FirstMergePath);
        string[] worldTokens = {
            "TerrainTruth.Decode",
            "CreateExactTerrainTile",
            "SmoothedWebNormals",
            "WebLandcoverColor",
            "BuildFoliage",
            "BuildStructuresAndRoutes",
            "DetailHalfSpanM",
            "FarFallbackHalfSpanM",
        };
        foreach (string token in worldTokens) {
            if (!world.Contains(token, StringComparison.Ordinal)) {
                errors.Add("F-22 low-altitude consumer lost token: " + token);
            }
        }
        if (!firstMerge.Contains(
                "F22UkraineLowAltitudeWorld.Build(transform)",
                StringComparison.Ordinal)
            || !firstMerge.Contains(
                "_lowAltitudeWorld.ApplyAltitude(altM)",
                StringComparison.Ordinal)
            || !firstMerge.Contains(
                "ConfigureFixedQaCamera(_cam)",
                StringComparison.Ordinal)) {
            errors.Add("FirstMergeBootstrap no longer owns the exact low-altitude world/capture");
        }
        if (firstMerge.Contains(
                "KoreaTerrainStandIn.Build(", StringComparison.Ordinal)) {
            errors.Add("FirstMergeBootstrap fell back to invented KoreaTerrainStandIn geometry");
        }
    }

    static void ValidateHash(List<string> errors, string path, string expected) {
        if (!File.Exists(path)) {
            errors.Add("Missing locked asset: " + path);
            return;
        }
        string actual = Sha256Hex(File.ReadAllBytes(path));
        if (!string.Equals(actual, expected, StringComparison.Ordinal)) {
            errors.Add($"SHA-256 mismatch for {path}: {actual} != {expected}");
        }
    }

    static bool HashMatches(byte[] bytes, string expected) =>
        string.Equals(Sha256Hex(bytes), expected, StringComparison.Ordinal);

    static string Sha256Hex(byte[] bytes) {
        using SHA256 hash = SHA256.Create();
        return BitConverter.ToString(hash.ComputeHash(bytes))
            .Replace("-", "")
            .ToLowerInvariant();
    }

    [Serializable]
    sealed class ContractProbe {
        public string presentationId;
        public HashProbe terrain;
        public FoliageProbe foliageAtlas;
        public CountsProbe counts;
        public ChunkProbe[] chunks;
    }

    [Serializable]
    sealed class HashProbe { public string sha256; }

    [Serializable]
    sealed class FoliageProbe {
        public string sha256;
        public float alphaCutoff;
    }

    [Serializable]
    sealed class CountsProbe {
        public int chunks;
        public int trees;
        public int buildings;
        public int roadSegments;
    }

    [Serializable]
    sealed class ChunkProbe { public SourceRecordProbe sourceRecord; }

    [Serializable]
    sealed class SourceRecordProbe {
        public int level;
        public int sampleCount;
        public float spacingM;
    }
}

}
