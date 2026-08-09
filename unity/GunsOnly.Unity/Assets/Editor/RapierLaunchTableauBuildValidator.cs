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
/// Independent prebuild gate for the byte-staged Rapier Web tableau. It is intentionally separate
/// from the Cobra validator and shared player builder so the beat-12 wiring can land later.
/// </summary>
public sealed class RapierLaunchTableauBuildValidator : IPreprocessBuildWithReport {
    const string Root = "Assets/Resources/GunsOnly/Rapier/";
    const string ManifestPath = Root
        + "presentation/rapier-launch-tableau.web-build-299.v1.json";
    const string BuilderPath = "Assets/Scripts/RapierLaunchTableauBuilder.cs";

    static readonly IReadOnlyDictionary<string, string[]> LinearVectorProperties =
        new Dictionary<string, string[]>(StringComparer.Ordinal) {
            [Root + "RapierTableauLit.shader"] = new[] {
                "_BaseColor", "_EmissiveColor", "_SpecularColor", "_SunDirection",
                "_SunColor", "_SkyColor", "_GroundColor", "_FogColor", "_HazeColor",
            },
            [Root + "RapierSoftWorldSky.shader"] = new[] {
                "_HorizonLow", "_HorizonHigh", "_ZenithLow", "_ZenithHigh",
                "_FogColor", "_HazeColor", "_SunDirection",
            },
            [Root + "RapierLaunchFx.shader"] = new[] {
                "_BaseColor", "_FogColor", "_HazeColor",
            },
        };

    public int callbackOrder => -950;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate Rapier Web 299 Tableau")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] Rapier Web 299 tableau validation PASS");
    }

    /// <summary>Batchmode entry point that validates resources and imported shaders without a build.</summary>
    public static void ValidateBatch() {
        try {
            ValidateOrThrow();
            Debug.Log("[GunsOnly] Rapier Web 299 tableau validation PASS");
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
            errors.Add("Rapier Web parity requires Unity Linear color space");
        }
        if (!GraphicsSettings.lightsUseLinearIntensity) {
            errors.Add("Rapier Web parity requires linear light intensity");
        }

        string absoluteManifest = Path.GetFullPath(ManifestPath);
        if (!File.Exists(absoluteManifest)) {
            errors.Add("Missing Rapier tableau manifest " + ManifestPath);
        } else {
            string hash = Sha256Hex(File.ReadAllBytes(absoluteManifest));
            if (!string.Equals(hash, RapierLaunchTableauManifest.ExpectedManifestSha256,
                StringComparison.Ordinal)) {
                errors.Add("Rapier tableau SHA-256 mismatch: " + hash);
            }
        }
        TextAsset manifest = AssetDatabase.LoadAssetAtPath<TextAsset>(ManifestPath);
        if (manifest == null) {
            errors.Add("Rapier tableau did not import as TextAsset: " + ManifestPath);
        } else {
            try {
                RapierLaunchTableauManifest.ValidateJsonOrThrow(manifest.text);
            }
            catch (Exception ex) {
                errors.Add(ex.Message);
            }
        }

        ValidateShaders(errors);
        ValidateLinearBindings(errors);
        if (errors.Count > 0) {
            throw new BuildFailedException(
                "Rapier Web 299 tableau validation failed:\n - "
                + string.Join("\n - ", errors));
        }
        Debug.Log("[GunsOnly] Rapier tableau manifest="
            + RapierLaunchTableauManifest.ExpectedManifestSha256.Substring(0, 12)
            + " semantic="
            + RapierLaunchTableauManifest.ExpectedSemanticSha256.Substring(0, 12));
    }

    static void ValidateShaders(List<string> errors) {
        foreach (string path in LinearVectorProperties.Keys) {
            Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
            if (shader == null) {
                errors.Add("Rapier shader did not import: " + path);
                continue;
            }
            if (ShaderUtil.ShaderHasError(shader)) {
                var messages = new List<string>();
                foreach (var message in ShaderUtil.GetShaderMessages(shader)) {
                    messages.Add(message.severity + " " + message.platform + " " + message.message
                        + " (line " + message.line + ")");
                }
                errors.Add("Rapier shader has compiler errors: " + path
                    + (messages.Count == 0 ? "" : "\n   " + string.Join("\n   ", messages)));
            }
        }
    }

    static void ValidateLinearBindings(List<string> errors) {
        var expectedNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (KeyValuePair<string, string[]> entry in LinearVectorProperties) {
            Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(entry.Key);
            if (shader == null) continue;
            var properties = new Dictionary<string, ShaderUtil.ShaderPropertyType>(
                StringComparer.Ordinal);
            int propertyCount = ShaderUtil.GetPropertyCount(shader);
            for (int index = 0; index < propertyCount; index++) {
                properties[ShaderUtil.GetPropertyName(shader, index)] =
                    ShaderUtil.GetPropertyType(shader, index);
            }
            foreach (string name in entry.Value) {
                expectedNames.Add(name);
                if (!properties.TryGetValue(name, out ShaderUtil.ShaderPropertyType type)) {
                    errors.Add(entry.Key + " is missing linear property " + name);
                } else if (type != ShaderUtil.ShaderPropertyType.Vector) {
                    errors.Add(entry.Key + " " + name
                        + " must be Vector to avoid Unity gamma decoding staged linear RGB");
                }
            }
        }

        string builder = File.Exists(Path.GetFullPath(BuilderPath))
            ? File.ReadAllText(Path.GetFullPath(BuilderPath)) : "";
        if (string.IsNullOrEmpty(builder)) {
            errors.Add("Missing Rapier material binding source " + BuilderPath);
            return;
        }
        foreach (string name in expectedNames) {
            if (builder.Contains("SetColor(\"" + name + "\"", StringComparison.Ordinal)) {
                errors.Add(BuilderPath + " binds staged linear " + name
                    + " with SetColor; use SetVector");
            }
        }
        if (!builder.Contains("new Quaternion(-value[0], -value[1], value[2], value[3])",
                StringComparison.Ordinal)
            || !builder.Contains("new Vector3(value[0], value[1], -value[2])",
                StringComparison.Ordinal)) {
            errors.Add("Rapier builder no longer performs the explicit Three.js→Unity Z reflection");
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
