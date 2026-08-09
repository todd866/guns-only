using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using GunsOnly.UnityClient;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityEditorTools {

/// <summary>
/// Fail-closed import and byte-parity gate for the Web Build 299 Cobra visual surface.
/// The canonical copies live in the Web/content tree; Unity embeds byte-identical resources.
/// </summary>
public sealed class CobraVisualContractBuildValidator : IPreprocessBuildWithReport {
    const string Root = "Assets/Resources/GunsOnly/CobraVietnam/environment/";
    const string ContractPath = Root + "cobra-canyon-visual-contract-v1.json";
    const string WorldPath = Root + "cobra-canyon.world.json";
    const string ManifestPath = Root + "cobra-canyon-asset-kit-desktop-v1.json";
    const string CoreManifestPath = Root + "cobra-canyon-core-kit-desktop-v1.json";
    const string RiverManifestPath = Root + "cobra-canyon-river-mesh-desktop-v1.json";
    const string GroundPath = Root + "textures/cobra-ground-macro-painted-v1.png";
    const string FoliagePath = Root + "foliage/foliage-atlas-painted-v2.png";
    const string GunsOnlyMatsPath = "Assets/Scripts/GunsOnlyMats.cs";
    const string AtmosphereExtrasPath = "Assets/Scripts/AtmosphereExtras.cs";

    static readonly IReadOnlyDictionary<string, string[]> ContractLinearVectorProperties =
        new Dictionary<string, string[]>(StringComparer.Ordinal) {
            ["Assets/Shaders/BasinLit.shader"] = new[] {
                "_FogColor", "_SkyFill", "_SunKey", "_ValleyFloor", "_CultivationGold",
                "_JungleMid", "_LateriteSlope", "_RidgeSage", "_RimRock",
            },
            ["Assets/Shaders/RiverWater.shader"] = new[] {
                "_FogColor", "_DeepWater", "_ShallowWater", "_BankGravel", "_BankLight",
            },
            ["Assets/Shaders/SkyDome.shader"] = new[] {
                "_Zenith", "_Horizon", "_BelowHorizon", "_CloudColor",
            },
            ["Assets/Shaders/CobraAsset.shader"] = new[] {
                "_BaseColor", "_EmissiveColor", "_SunColor", "_SkyColor", "_GroundColor",
                "_FogColor",
            },
            ["Assets/Shaders/CobraTransparentAsset.shader"] = new[] {
                "_BaseColor", "_EmissiveColor", "_SunColor", "_SkyColor", "_GroundColor",
                "_FogColor",
            },
            ["Assets/Shaders/CobraFoliage.shader"] = new[] { "_FogColor" },
            ["Assets/Shaders/CobraMist.shader"] = new[] { "_BaseColor", "_FogColor" },
        };

    static readonly IReadOnlyDictionary<string, string> ExpectedSha256 =
        new Dictionary<string, string>(StringComparer.Ordinal) {
            [ContractPath] = "40274ddad51d782df3d1b93e7600ef173e9588cd4942963db7cfb350e6dc6d29",
            [WorldPath] = "0aa2b0fc0232aec5e5bc45778f7afc49faf7394f659852672769606acaf41a81",
            [ManifestPath] = "1c18ba2b889da5204b9869826adefadb5cbb3eb77f9a197d45ec450a56373517",
            [CoreManifestPath] = "a04e521f759d7c57a5d0b61a72a9a762ab0eb47bc781514c454696943db21a2a",
            [RiverManifestPath] = CobraRiverMeshManifest.ExpectedManifestSha256,
            [GroundPath] = "0e67010fe9cdbd553e0c02807e712df703cba2acb7104ff10b06b40009a37e82",
            [FoliagePath] = "6078593d606c52154eb97711a5af82af35103e59c16ac7757f505a21d7692e7b",
        };

    public int callbackOrder => -1000;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate Cobra Web 299 Visual Parity")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] Cobra Web 299 visual parity validation PASS");
    }

    /// <summary>Entry point for a lightweight batch validation without building a player.</summary>
    public static void ValidateBatch() {
        try {
            ValidateOrThrow();
            Debug.Log("[GunsOnly] Cobra Web 299 visual parity validation PASS");
            EditorApplication.Exit(0);
        }
        catch (Exception ex) {
            Debug.LogException(ex);
            EditorApplication.Exit(1);
        }
    }

    public static void ValidateOrThrow() {
        var errors = new List<string>();
        if (PlayerSettings.colorSpace != ColorSpace.Linear) {
            errors.Add($"Player color space is {PlayerSettings.colorSpace}; expected Linear");
        }
        if (!GraphicsSettings.lightsUseLinearIntensity) {
            errors.Add("GraphicsSettings.lightsUseLinearIntensity must be true");
        }

        foreach (KeyValuePair<string, string> expected in ExpectedSha256) {
            string absolute = Path.GetFullPath(expected.Key);
            if (!File.Exists(absolute)) {
                errors.Add("Missing parity asset " + expected.Key);
                continue;
            }
            string actual = Sha256Hex(File.ReadAllBytes(absolute));
            if (!string.Equals(actual, expected.Value, StringComparison.Ordinal)) {
                errors.Add($"SHA-256 mismatch for {expected.Key}: {actual} != {expected.Value}");
            }
        }

        TextAsset contractAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(ContractPath);
        if (contractAsset == null) {
            errors.Add("Contract did not import as TextAsset: " + ContractPath);
        } else {
            try {
                CobraVisualContract contract = CobraVisualContract.ParseOrThrow(
                    contractAsset.text, ContractPath);
                if (contract.Parity.ReferenceRenderer != "web-build-299"
                    || contract.Parity.QualityTier != "desktop") {
                    errors.Add("Contract parity identity is not Web Build 299 desktop");
                }
                ValidateCameraAdapter(errors, contract);
                ValidateTransparentReferenceAdapter(errors, contract);
            }
            catch (Exception ex) {
                errors.Add(ex.Message);
            }
        }

        TextAsset riverAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(RiverManifestPath);
        if (riverAsset == null) {
            errors.Add("River manifest did not import as TextAsset: " + RiverManifestPath);
        } else {
            try {
                CobraRiverMeshManifest.ValidateJsonOrThrow(riverAsset.text);
            }
            catch (Exception ex) {
                errors.Add(ex.Message);
            }
        }

        ValidateTexture(
            errors, GroundPath, TextureWrapMode.Mirror, alphaIsTransparency: false);
        ValidateTexture(
            errors, FoliagePath, TextureWrapMode.Clamp, alphaIsTransparency: false);
        ValidateContractLinearBindings(errors);

        if (errors.Count > 0) {
            throw new BuildFailedException(
                "Cobra Web 299 visual parity validation failed:\n - "
                + string.Join("\n - ", errors));
        }

        Debug.Log(
            "[GunsOnly] Cobra visual parity contract="
            + ExpectedSha256[ContractPath].Substring(0, 12)
            + " world=" + ExpectedSha256[WorldPath].Substring(0, 12)
            + " assetKit=" + ExpectedSha256[ManifestPath].Substring(0, 12)
            + " coreKit=" + ExpectedSha256[CoreManifestPath].Substring(0, 12)
            + " river=" + ExpectedSha256[RiverManifestPath].Substring(0, 12));
    }

    static void ValidateTexture(
        List<string> errors,
        string path,
        TextureWrapMode expectedWrap,
        bool alphaIsTransparency) {
        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        if (importer == null || texture == null) {
            errors.Add("Texture did not import correctly: " + path);
            return;
        }
        if (texture.width != 1024 || texture.height != 1024) {
            errors.Add($"{path} must be 1024x1024, got {texture.width}x{texture.height}");
        }
        if (!importer.sRGBTexture) errors.Add(path + " must import as sRGB");
        if (!importer.mipmapEnabled) errors.Add(path + " must generate mipmaps");
        if (importer.mipMapsPreserveCoverage)
            errors.Add(path + " must use raw Web-style mip generation without alpha coverage preservation");
        if (importer.wrapMode != expectedWrap) {
            errors.Add($"{path} wrap is {importer.wrapMode}; expected {expectedWrap}");
        }
        if (importer.filterMode != FilterMode.Trilinear) {
            errors.Add($"{path} filter is {importer.filterMode}; expected Trilinear");
        }
        if (importer.anisoLevel < 4) errors.Add(path + " must use anisotropy >= 4");
        if (importer.textureCompression != TextureImporterCompression.Uncompressed) {
            errors.Add(path + " must be uncompressed for Web/Unity texel parity");
        }
        if (importer.alphaIsTransparency != alphaIsTransparency) {
            errors.Add($"{path} alphaIsTransparency must be {alphaIsTransparency}");
        }
    }

    static void ValidateContractLinearBindings(List<string> errors) {
        var propertyNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (KeyValuePair<string, string[]> entry in ContractLinearVectorProperties) {
            Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(entry.Key);
            if (shader == null) {
                errors.Add("Contract shader did not import: " + entry.Key);
                continue;
            }

            var imported = new Dictionary<string, ShaderUtil.ShaderPropertyType>(
                StringComparer.Ordinal);
            int count = ShaderUtil.GetPropertyCount(shader);
            for (int i = 0; i < count; i++) {
                imported[ShaderUtil.GetPropertyName(shader, i)] =
                    ShaderUtil.GetPropertyType(shader, i);
            }
            foreach (string name in entry.Value) {
                propertyNames.Add(name);
                if (!imported.TryGetValue(name, out ShaderUtil.ShaderPropertyType type)) {
                    errors.Add($"{entry.Key} is missing contract-linear property {name}");
                } else if (type != ShaderUtil.ShaderPropertyType.Vector) {
                    errors.Add($"{entry.Key} {name} is {type}; expected Vector to prevent "
                        + "Unity from gamma-decoding already-linear Web values");
                }
            }
        }

        string[] bindingPaths = { GunsOnlyMatsPath, AtmosphereExtrasPath };
        foreach (string path in bindingPaths) {
            string absolute = Path.GetFullPath(path);
            if (!File.Exists(absolute)) {
                errors.Add("Missing contract material binding source " + path);
                continue;
            }
            string source = File.ReadAllText(absolute);
            foreach (string name in propertyNames) {
                if (source.Contains("SetColor(mat, \"" + name + "\"", StringComparison.Ordinal)
                    || source.Contains("mat.SetColor(\"" + name + "\"", StringComparison.Ordinal)
                    || source.Contains("material.SetColor(\"" + name + "\"", StringComparison.Ordinal)) {
                    errors.Add($"{path} binds already-linear {name} through SetColor; "
                        + "use SetVector so Linear projects do not decode it twice");
                }
            }
        }
    }

    static void ValidateTransparentReferenceAdapter(
        List<string> errors,
        CobraVisualContract contract) {
        CobraVisualContract.TransparentReferenceCompositingSpec spec =
            contract.ColourEncoding.TransparentReferenceCompositing;
        if (spec == null) {
            errors.Add("Transparent reference compositing contract is unavailable");
            return;
        }
        string[] paths = {
            "Assets/Shaders/CobraMist.shader",
            "Assets/Shaders/CobraTransparentAsset.shader",
        };
        foreach (string path in paths) {
            string absolute = Path.GetFullPath(path);
            if (!File.Exists(absolute)) {
                errors.Add("Missing transparent reference adapter " + path);
                continue;
            }
            string source = File.ReadAllText(absolute);
            if (!source.Contains("GrabPass { }", StringComparison.Ordinal)
                || !source.Contains("compensatedSource", StringComparison.Ordinal)
                || !source.Contains(
                    "Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha",
                    StringComparison.Ordinal)) {
                errors.Add(path + " no longer reconstructs Web output-sRGB source-over");
            }
        }
        string mist = File.ReadAllText(Path.GetFullPath(paths[0]));
        if (!mist.Contains("_HasMask < 0.5 || alpha <= 0.006", StringComparison.Ordinal)) {
            errors.Add("CobraMist.shader no longer enforces the contracted 0.006/sub-byte exception");
        }
        string transparentCore = File.ReadAllText(Path.GetFullPath(paths[1]));
        if (!transparentCore.Contains(
                "if (alpha <= 0.006) return float4(SrgbToLinear(display), alpha);",
                StringComparison.Ordinal)) {
            errors.Add(
                "CobraTransparentAsset.shader no longer enforces the contracted 0.006 floor");
        }
    }

    static void ValidateCameraAdapter(List<string> errors, CobraVisualContract contract) {
        foreach (CobraVisualContract.AcceptanceViewSpec view in contract.AcceptanceViews) {
            float yaw = view.YawRad;
            float pitch = view.PitchRad;
            Vector3 webForward = new(
                -Mathf.Sin(yaw) * Mathf.Cos(pitch),
                Mathf.Sin(pitch),
                -Mathf.Cos(pitch) * Mathf.Cos(yaw));
            Vector3 webUp = new(
                Mathf.Sin(yaw) * Mathf.Sin(pitch),
                Mathf.Cos(pitch),
                Mathf.Cos(yaw) * Mathf.Sin(pitch));
            Vector3 webRight = new(
                Mathf.Cos(yaw),
                0f,
                -Mathf.Sin(yaw));
            if (Vector3.Dot(view.UnityForward, webForward.normalized) < 0.999999f
                || Vector3.Dot(view.UnityUp, webUp.normalized) < 0.999999f) {
                errors.Add("Acceptance camera basis does not reproduce Three.js YXZ Euler at "
                    + view.Id);
                continue;
            }
            Quaternion unityRotation = Quaternion.LookRotation(view.UnityForward, view.UnityUp);
            Vector3 reflectedScreenRight = -(unityRotation * Vector3.right);
            if (Vector3.Dot(reflectedScreenRight.normalized, webRight.normalized) < 0.999999f) {
                errors.Add("Unity X-reflected screen basis does not match Web at " + view.Id);
            }
        }
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
