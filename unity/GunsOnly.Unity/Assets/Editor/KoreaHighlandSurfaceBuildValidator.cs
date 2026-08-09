using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using GunsOnly.UnityBridge;
using GunsOnly.UnityClient;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace GunsOnly.UnityEditorTools {

/// <summary>
/// Fail-closed byte, import and shader gate for the retained Web Korea surface and the F-22-only
/// Ukraine presentation. Rapier does not consume this renderer branch.
/// </summary>
public sealed class KoreaHighlandSurfaceBuildValidator : IPreprocessBuildWithReport {
    const string ResourceRoot = "Assets/Resources/GunsOnly/Korea1950s/";
    const string CanonicalBytesPath =
        ResourceRoot + "source/korea-highland-ground-v1.webp.bytes";
    const string TexturePath =
        ResourceRoot + "environment/textures/korea-highland-ground-v1.png";
    const string ShaderPath = ResourceRoot + "KoreaHighlandTerrain.shader";
    const string SurfaceBindingPath = "Assets/Scripts/KoreaHighlandSurface.cs";
    const string StandInPath = "Assets/Scripts/KoreaTerrainStandIn.cs";
    const string CanonicalSha256 =
        "d8f31ec00b96f70eba87ad85eaba70820e730d4d4f9de20178a3c976a5af84f3";
    const string RuntimePngSha256 =
        "a96478f89d203d674633434a0c715b65ab843eee0fbdd70da4ad17657f9ef401";
    const string UkraineResourceRoot = "Assets/Resources/GunsOnly/UkraineModern/";
    const string UkraineCanonicalBytesPath =
        UkraineResourceRoot + "source/ukraine-temperate-ground-v2.webp.bytes";
    const string UkraineTexturePath =
        UkraineResourceRoot + "environment/textures/ukraine-temperate-ground-v2.png";
    const string UkraineManifestPath =
        UkraineResourceRoot + "environment/textures/rapier-art-manifest.v1.json";
    const string UkraineSkyShaderPath =
        UkraineResourceRoot + "F22UkraineCombatSky.shader";
    const string UkraineContractPath = "Assets/Scripts/F22UkraineVisualContract.cs";
    const string UkraineSkyBindingPath = "Assets/Scripts/BrowserParitySky.cs";
    const string FirstMergePath = "Assets/Scripts/FirstMergeBootstrap.cs";
    const string OutputTransformPath = "Assets/Scripts/F22OutputTransform.cs";
    const string UkraineCanonicalSha256 =
        "4c062b6923becc4492f78ae1588a394f941aeddb0a9b27f47d176b285c379c4d";
    const string UkraineManifestSha256 =
        "69bf29de2dde5970bb2fce142d7a4f645a0b8780701539882fdd95e7e9a8ee40";
    const string UkraineRuntimePngSha256 =
        "8e04ddcbc6bc5d5489b0f3537aa3299b1fc1002582d41b1f4b2fd4b6d3bfe45c";

    public int callbackOrder => -990;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate Korea + F-22 Ukraine Web Surface Parity")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] Korea + F-22 Ukraine Web surface parity validation PASS");
    }

    public static void ValidateBatch() {
        try {
            ValidateOrThrow();
            Debug.Log("[GunsOnly] Korea + F-22 Ukraine Web surface parity validation PASS");
            EditorApplication.Exit(0);
        }
        catch (Exception ex) {
            Debug.LogException(ex);
            EditorApplication.Exit(1);
        }
    }

    public static void ValidateOrThrow() {
        var errors = new List<string>();
        ValidateHash(errors, CanonicalBytesPath, CanonicalSha256);
        ValidateHash(errors, TexturePath, RuntimePngSha256);
        ValidateHash(errors, UkraineCanonicalBytesPath, UkraineCanonicalSha256);
        ValidateHash(errors, UkraineTexturePath, UkraineRuntimePngSha256);
        ValidateHash(errors, UkraineManifestPath, UkraineManifestSha256);
        ValidateRepositoryCopies(errors);
        ValidateImports(errors);
        ValidateShaderContract(errors);
        ValidateWiring(errors);

        if (errors.Count > 0) {
            throw new BuildFailedException(
                "Korea + F-22 Ukraine Web surface parity validation failed:\n - "
                + string.Join("\n - ", errors));
        }
        Debug.Log(
            "[GunsOnly] Korea surface canonical=" + CanonicalSha256.Substring(0, 12)
            + " runtimePng=" + RuntimePngSha256.Substring(0, 12)
            + " scaleM=7200 projection=triplanar-mirrored-repeat"
            + " F22Ukraine canonical=" + UkraineCanonicalSha256.Substring(0, 12)
            + " manifest=" + UkraineManifestSha256.Substring(0, 12)
            + " heroScaleM=9200 detailBlend=0.72 exposure=1.10");
    }

    static void ValidateRepositoryCopies(List<string> errors) {
        string repositoryRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
        string[] paths = {
            Path.Combine(repositoryRoot,
                "content/packs/korea-1950s/environment/textures/korea-highland-ground-v1.webp"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/korea-1950s/environment/textures/"
                + "korea-highland-ground-v1.webp"),
        };
        foreach (string path in paths) ValidateHash(errors, path, CanonicalSha256);

        string[] ukraineAssetPaths = {
            Path.Combine(repositoryRoot,
                "content/packs/ukraine-modern/environment/textures/"
                + "ukraine-temperate-ground-v2.webp"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/ukraine-modern/environment/textures/"
                + "ukraine-temperate-ground-v2.webp"),
        };
        foreach (string path in ukraineAssetPaths)
            ValidateHash(errors, path, UkraineCanonicalSha256);

        string[] ukraineManifestPaths = {
            Path.Combine(repositoryRoot,
                "content/packs/ukraine-modern/environment/textures/"
                + "rapier-art-manifest.v1.json"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/ukraine-modern/environment/textures/"
                + "rapier-art-manifest.v1.json"),
        };
        foreach (string path in ukraineManifestPaths)
            ValidateHash(errors, path, UkraineManifestSha256);
    }

    static void ValidateImports(List<string> errors) {
        TextAsset bytes = AssetDatabase.LoadAssetAtPath<TextAsset>(CanonicalBytesPath);
        if (bytes == null) {
            errors.Add("Canonical WebP bytes did not import as TextAsset: " + CanonicalBytesPath);
        } else if (!string.Equals(
                Sha256Hex(bytes.bytes), CanonicalSha256, StringComparison.Ordinal)) {
            errors.Add("Imported canonical WebP TextAsset bytes changed");
        }

        ValidateUkraineImports(errors);

        TextureImporter importer = AssetImporter.GetAtPath(TexturePath) as TextureImporter;
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(TexturePath);
        if (importer == null || texture == null) {
            errors.Add("Runtime Korean surface did not import as Texture2D: " + TexturePath);
            return;
        }
        if (texture.width != 1024 || texture.height != 1024) {
            errors.Add($"{TexturePath} must be 1024x1024, got {texture.width}x{texture.height}");
        }
        if (!importer.sRGBTexture) errors.Add(TexturePath + " must import as sRGB");
        if (!importer.mipmapEnabled) errors.Add(TexturePath + " must generate mipmaps");
        if (importer.mipMapsPreserveCoverage)
            errors.Add(TexturePath + " must not use alpha coverage mipmaps");
        if (importer.wrapMode != TextureWrapMode.Mirror)
            errors.Add(TexturePath + " must use mirrored repeat");
        if (importer.filterMode != FilterMode.Trilinear)
            errors.Add(TexturePath + " must use trilinear filtering");
        if (importer.anisoLevel < 8)
            errors.Add(TexturePath + " must use anisotropy >= 8");
        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
            errors.Add(TexturePath + " must remain uncompressed after the canonical WebP decode");
        if (importer.alphaIsTransparency)
            errors.Add(TexturePath + " must not import synthetic transparency");

        Texture2D retainedTexture = Resources.Load<Texture2D>(
            KoreaHighlandSurface.TextureResourcePath);
        if (retainedTexture == null) {
            errors.Add("Runtime Resources path did not resolve the Korean surface texture");
        }

        Material material = null;
        try {
            material = KoreaHighlandSurface.CreateMaterial();
            if (material.shader == null
                || material.shader.name != "GunsOnly/KoreaHighlandTerrain") {
                errors.Add("Runtime Korean surface material did not resolve the retained shader");
            }
            if (material.GetTexture("_KoreaSurfaceMap") != retainedTexture)
                errors.Add("Runtime Korean surface material did not bind the retained texture");
            if (Mathf.Abs(material.GetFloat("_KoreaSurfaceScaleM") - 7200f) > 0.001f)
                errors.Add("Runtime Korean surface material lost the 7200 m Web mapping scale");
        }
        catch (Exception ex) {
            errors.Add("Runtime Korean surface material failed to construct: " + ex.Message);
        }
        finally {
            if (material != null) UnityEngine.Object.DestroyImmediate(material);
        }
    }

    static void ValidateUkraineImports(List<string> errors) {
        TextAsset sourceBytes = AssetDatabase.LoadAssetAtPath<TextAsset>(
            UkraineCanonicalBytesPath);
        if (sourceBytes == null) {
            errors.Add(
                "Canonical Ukraine WebP bytes did not import as TextAsset: "
                + UkraineCanonicalBytesPath);
        } else if (!string.Equals(
                Sha256Hex(sourceBytes.bytes),
                UkraineCanonicalSha256,
                StringComparison.Ordinal)) {
            errors.Add("Imported canonical Ukraine WebP TextAsset bytes changed");
        }

        TextAsset manifest = AssetDatabase.LoadAssetAtPath<TextAsset>(UkraineManifestPath);
        if (manifest == null) {
            errors.Add("Ukraine art manifest did not import as TextAsset: " + UkraineManifestPath);
        } else if (!string.Equals(
                Sha256Hex(manifest.bytes),
                UkraineManifestSha256,
                StringComparison.Ordinal)) {
            errors.Add("Imported Ukraine art manifest bytes changed");
        }

        TextureImporter importer = AssetImporter.GetAtPath(UkraineTexturePath) as TextureImporter;
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(UkraineTexturePath);
        if (importer == null || texture == null) {
            errors.Add("Runtime Ukraine surface did not import as Texture2D: " + UkraineTexturePath);
            return;
        }
        if (texture.width != 1024 || texture.height != 1024) {
            errors.Add(
                $"{UkraineTexturePath} must be 1024x1024, got "
                + $"{texture.width}x{texture.height}");
        }
        if (!importer.sRGBTexture) errors.Add(UkraineTexturePath + " must import as sRGB");
        if (!importer.mipmapEnabled) errors.Add(UkraineTexturePath + " must generate mipmaps");
        if (importer.mipMapsPreserveCoverage)
            errors.Add(UkraineTexturePath + " must not use alpha coverage mipmaps");
        if (importer.wrapMode != TextureWrapMode.Mirror)
            errors.Add(UkraineTexturePath + " must use mirrored repeat");
        if (importer.filterMode != FilterMode.Trilinear)
            errors.Add(UkraineTexturePath + " must use trilinear filtering");
        if (importer.anisoLevel < 8)
            errors.Add(UkraineTexturePath + " must use anisotropy >= 8");
        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
            errors.Add(UkraineTexturePath + " must remain uncompressed after canonical decode");
        if (importer.alphaIsTransparency)
            errors.Add(UkraineTexturePath + " must not import synthetic transparency");

        Texture2D retainedTexture = Resources.Load<Texture2D>(
            KoreaHighlandSurface.UkraineTextureResourcePath);
        if (retainedTexture != texture) {
            errors.Add("Runtime Resources path did not resolve the Ukraine terrain texture");
        }
        TextAsset retainedManifest = Resources.Load<TextAsset>(
            KoreaHighlandSurface.UkraineManifestResourcePath);
        if (retainedManifest == null
            || !string.Equals(
                Sha256Hex(retainedManifest.bytes),
                UkraineManifestSha256,
                StringComparison.Ordinal)) {
            errors.Add("Runtime Resources path did not resolve the exact Ukraine art manifest");
        }

        Material material = null;
        try {
            material = KoreaHighlandSurface.CreateMaterial(
                KoreaHighlandSurface.Presentation.F22UkraineCombat);
            if (material.shader == null
                || material.shader.name != "GunsOnly/KoreaHighlandTerrain") {
                errors.Add("Runtime F-22 Ukraine material did not resolve the retained shader");
            }
            if (material.GetTexture("_UkraineSurfaceMap") != retainedTexture)
                errors.Add("Runtime F-22 Ukraine material did not bind the retained texture");
            if (Mathf.Abs(material.GetFloat("_UkraineCombatPresentation") - 1f) > 0.001f)
                errors.Add("Runtime F-22 Ukraine material lost its route-specific branch");
            KoreaHighlandSurface.ApplyF22UkraineAltitude(material, 5000f);
            if (Mathf.Abs(material.GetFloat("_TerrainDetail01") - 0.5f) > 0.0001f)
                errors.Add("F-22 Ukraine altitude handoff is not 0.5 at 5000 m AGL");
            LinearRgb fog = F22UkraineVisualContract.FogForAltitude(5000f);
            Vector4 boundFog = material.GetVector("_FogColor");
            if (Mathf.Abs(boundFog.x - fog.R) > 0.0001f
                || Mathf.Abs(boundFog.y - fog.G) > 0.0001f
                || Mathf.Abs(boundFog.z - fog.B) > 0.0001f) {
                errors.Add("F-22 Ukraine material lost the altitude-keyed Web fog colour");
            }
        }
        catch (Exception ex) {
            errors.Add("Runtime F-22 Ukraine material failed to construct: " + ex.Message);
        }
        finally {
            if (material != null) UnityEngine.Object.DestroyImmediate(material);
        }
    }

    static void ValidateShaderContract(List<string> errors) {
        Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath);
        if (shader == null) {
            errors.Add("Korean terrain shader did not import: " + ShaderPath);
            return;
        }
        if (ShaderUtil.ShaderHasError(shader)) {
            errors.Add("Korean terrain shader has compiler errors: " + ShaderPath);
        }
        Shader retained = Resources.Load<Shader>(KoreaHighlandSurface.ShaderResourcePath);
        if (retained != shader)
            errors.Add("Runtime Resources path did not resolve the imported Korean terrain shader");

        string source = File.ReadAllText(Path.GetFullPath(ShaderPath));
        string[] tokens = {
            "pow(abs(normal), 4.0)",
            "input.worldPosition.xz / _KoreaSurfaceScaleM",
            "input.worldPosition.zy / _KoreaSurfaceScaleM",
            "input.worldPosition.xy / _KoreaSurfaceScaleM",
            "authoredSurface / max(authoredLuma, 0.025)",
            "authoredLuma / 0.045",
            "lerp(1.0, authoredValue, 0.68)",
            "clamp(lumaMatched, sAlbedo * 0.64, sAlbedo * 1.38)",
            "lerp(sAlbedo, lumaMatched, 0.54)",
            "UnityTextureUv",
        };
        foreach (string token in tokens) {
            if (!source.Contains(token, StringComparison.Ordinal))
                errors.Add("Korean terrain shader lost Web mapping token: " + token);
        }

        string[] ukraineTokens = {
            "input.worldPosition.xz * (1.0 / 9200.0)",
            "+ float2(-0.27, 0.18)",
            "clamp(dot(rewildCover, LUMA), 0.075, 0.34)",
            "authoredHeroLuma / 0.089, 0.58, 1.42",
            "lerp(1.0, authoredHeroValue, 0.58)",
            "float3(0.018, 0.018, 0.018)",
            "float3(0.58, 0.58, 0.58)",
            "rewildFloor * _TerrainDetail01 * 0.72",
            "input.worldPosition.xz * (1.0 / 160000.0)",
            "+ float2(0.19, -0.37)",
            "sAlbedo *= 0.72",
            "_FogDensity * lerp(",
            "_TerrainWorldEdgeM * 0.36",
            "_TerrainWorldEdgeM * 0.72",
        };
        foreach (string token in ukraineTokens) {
            if (!source.Contains(token, StringComparison.Ordinal))
                errors.Add("F-22 Ukraine terrain shader lost Web mapping token: " + token);
        }

        Shader skyShader = AssetDatabase.LoadAssetAtPath<Shader>(UkraineSkyShaderPath);
        if (skyShader == null) {
            errors.Add("F-22 Ukraine combat sky shader did not import: " + UkraineSkyShaderPath);
            return;
        }
        if (ShaderUtil.ShaderHasError(skyShader))
            errors.Add("F-22 Ukraine combat sky shader has compiler errors");
        Shader retainedSky = Resources.Load<Shader>(BrowserParitySky.ShaderResourcePath);
        if (retainedSky != skyShader)
            errors.Add("Runtime Resources path did not resolve the F-22 Ukraine combat sky");
        string skySource = File.ReadAllText(Path.GetFullPath(UkraineSkyShaderPath));
        string[] skyTokens = {
            "Smooth(2500.0, 18000.0",
            "float3(0.34, 0.38, 0.32)",
            "float3(0.18, 0.26, 0.34)",
            "float3(0.035, 0.105, 0.34)",
            "float3(0.018, 0.052, 0.16)",
            "lerp(0.18, 0.13, altitudeMix)",
            "exp(-abs(direction.y) * 48.0)",
            "horizonWarmCombat * 1.14",
            "horizonShoulder * 0.48",
            "pow(sunDot, 1800.0)",
            "pow(sunDot, 42.0)",
            "pow(sunDot, 8.0)",
            "float sunPresentation = 0.62",
            "exp(direction.y * 34.0)",
        };
        foreach (string token in skyTokens) {
            if (!skySource.Contains(token, StringComparison.Ordinal))
                errors.Add("F-22 Ukraine sky lost frozen Web token: " + token);
        }
    }

    static void ValidateWiring(List<string> errors) {
        string binding = File.ReadAllText(Path.GetFullPath(SurfaceBindingPath));
        string standIn = File.ReadAllText(Path.GetFullPath(StandInPath));
        string[] bindingTokens = {
            "SurfaceScaleM = 7200f",
            "new(0.17f, -0.31f)",
            "new(-0.23f, 0.41f)",
            "new(0.37f, 0.11f)",
            "TextureWrapMode.Mirror",
            "TextureResourcePath",
        };
        foreach (string token in bindingTokens) {
            if (!binding.Contains(token, StringComparison.Ordinal))
                errors.Add("Korean surface binding lost contract token: " + token);
        }
        if (!standIn.Contains(
                "KoreaHighlandSurface.CreateMaterial()", StringComparison.Ordinal)) {
            errors.Add("KoreaTerrainStandIn no longer uses the Web-authored surface material");
        }
        if (standIn.Contains("KoreaAlbedoDetail", StringComparison.Ordinal)) {
            errors.Add("KoreaTerrainStandIn reinstated the discarded procedural albedo texture");
        }

        string contract = File.ReadAllText(Path.GetFullPath(UkraineContractPath));
        string firstMerge = File.ReadAllText(Path.GetFullPath(FirstMergePath));
        string skyBinding = File.ReadAllText(Path.GetFullPath(UkraineSkyBindingPath));
        string output = File.ReadAllText(Path.GetFullPath(OutputTransformPath));
        string[] contractTokens = {
            UkraineCanonicalSha256,
            UkraineManifestSha256,
            UkraineRuntimePngSha256,
            "TerrainHeroScaleM = 9200f",
            "TerrainHeroMeanLuma = 0.089f",
            "TerrainHeroBlend = 0.72f",
            "TerrainAlbedoScalar = 0.72f",
            "SkySunPresentation = 0.62f",
            "ToneMappingExposure = 1.10f",
        };
        foreach (string token in contractTokens) {
            if (!contract.Contains(token, StringComparison.Ordinal))
                errors.Add("F-22 Ukraine renderer contract lost token: " + token);
        }
        string[] firstMergeTokens = {
            "KoreaHighlandSurface.Presentation.F22UkraineCombat",
            "F22UkraineVisualContract.SunIntensity",
            "F22UkraineVisualContract.HemisphereIntensity",
            "F22UkraineVisualContract.AtmosphereDensityScale",
            "KoreaHighlandSurface.ApplyF22UkraineAltitude",
        };
        foreach (string token in firstMergeTokens) {
            if (!firstMerge.Contains(token, StringComparison.Ordinal))
                errors.Add("First Merge lost F-22-only Ukraine presentation token: " + token);
        }
        string[] skyBindingTokens = {
            "F22UkraineVisualContract.FogForAltitude",
            "F22UkraineVisualContract.AtmosphereHaze",
            "F22PresentationContract.SunDirectionUnity",
            "GunsOnly/UkraineModern/F22UkraineCombatSky",
        };
        foreach (string token in skyBindingTokens) {
            if (!skyBinding.Contains(token, StringComparison.Ordinal))
                errors.Add("F-22 Ukraine sky binding lost contract token: " + token);
        }
        if (!output.Contains(
                "F22UkraineVisualContract.ToneMappingExposure", StringComparison.Ordinal)) {
            errors.Add("F-22 output transform lost the accepted Ukraine exposure");
        }
    }

    static void ValidateHash(List<string> errors, string path, string expected) {
        string absolute = Path.IsPathRooted(path) ? path : Path.GetFullPath(path);
        if (!File.Exists(absolute)) {
            errors.Add("Missing terrain parity asset " + path);
            return;
        }
        string actual = Sha256Hex(File.ReadAllBytes(absolute));
        if (!string.Equals(actual, expected, StringComparison.Ordinal))
            errors.Add($"SHA-256 mismatch for {path}: {actual} != {expected}");
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
