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

/// <summary>Fail-closed bytes, schema, import, shader and runtime gate for Weekend circuit parity.</summary>
public sealed class WeekendCircuitPresentationBuildValidator : IPreprocessBuildWithReport {
    const string CircuitRoot = "Assets/Resources/GunsOnly/WeekendRide/Circuit/";
    const string ManifestAssetPath = CircuitRoot + "weekend-track-day-presentation-v1.json";
    const string SurfaceShaderPath = CircuitRoot + "WeekendCircuitParity.shader";
    const string SkyShaderPath = CircuitRoot + "WeekendCircuitSky.shader";
    const string OutputShaderPath = CircuitRoot + "WeekendCircuitOutput.shader";
    const string TextureRoot = "Assets/Resources/GunsOnly/WeekendRide/OpenRoad/";
    const string ManifestSha256 =
        "0b906b2e24616c3648d39626bb63f9391f2e423e44beef8a03f945609b952461";

    public int callbackOrder => -984;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate Weekend Circuit Web + Unity Parity")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] Weekend circuit Web + Unity parity validation PASS");
    }

    public static void ValidateBatch() {
        try {
            ValidateOrThrow();
            Debug.Log("[GunsOnly] Weekend circuit Web + Unity parity validation PASS");
            EditorApplication.Exit(0);
        }
        catch (Exception ex) {
            Debug.LogException(ex);
            EditorApplication.Exit(1);
        }
    }

    public static void ValidateOrThrow() {
        var errors = new List<string>();
        ValidateManifestCopies(errors);
        ValidateManifestImport(errors);
        ValidateTextureImport(errors, TextureRoot + "track-asphalt-v1.png", false);
        ValidateTextureImport(errors, TextureRoot + "weekend-hinterland-ground-v1.png", false);
        ValidateTextureImport(errors, TextureRoot + "weekend-field-landcover-v1.png", false);
        ValidateTextureImport(errors, TextureRoot + "weekend-roadside-atlas-v1.png", true);
        ValidateShader(errors, SurfaceShaderPath, "GunsOnly/WeekendCircuitParity");
        ValidateShader(errors, SkyShaderPath, "GunsOnly/WeekendCircuitSky");
        ValidateShader(errors, OutputShaderPath, "GunsOnly/WeekendCircuitOutput");
        ValidateRuntimeConsumer(errors);
        ValidateSourceGuards(errors);
        if (PlayerSettings.colorSpace != ColorSpace.Linear)
            errors.Add("Weekend circuit Web parity requires Unity Linear color space");
        if (errors.Count != 0) {
            throw new BuildFailedException(
                "Weekend circuit Web + Unity parity validation failed:\n - "
                + string.Join("\n - ", errors));
        }
        Debug.Log("[GunsOnly] Weekend circuit manifest="
            + ManifestSha256.Substring(0, 12)
            + " semantic="
            + WeekendCircuitPresentationResource.ExpectedSemanticSha256.Substring(0, 12)
            + " route-points=577 leaves=110 instances=699 exact-geometry=true");
    }

    static void ValidateManifestCopies(List<string> errors) {
        string repositoryRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
        string[] paths = {
            Path.Combine(repositoryRoot,
                "content/packs/weekend-ride/presentation/"
                    + "weekend-track-day-presentation.v1.json"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/weekend-ride/presentation/"
                    + "weekend-track-day-presentation.v1.json"),
            Path.GetFullPath(ManifestAssetPath),
        };
        byte[] first = null;
        foreach (string path in paths) {
            if (!File.Exists(path)) { errors.Add("missing Weekend circuit manifest " + path); continue; }
            byte[] bytes = File.ReadAllBytes(path);
            string sha;
            using (SHA256 algorithm = SHA256.Create()) {
                sha = BitConverter.ToString(algorithm.ComputeHash(bytes))
                    .Replace("-", string.Empty).ToLowerInvariant();
            }
            if (sha != ManifestSha256)
                errors.Add(path + " hash changed: " + sha);
            if (first == null) first = bytes;
            else if (!first.AsSpan().SequenceEqual(bytes))
                errors.Add(path + " differs byte-for-byte from canonical Weekend manifest");
        }
    }

    static void ValidateManifestImport(List<string> errors) {
        TextAsset asset = AssetDatabase.LoadAssetAtPath<TextAsset>(ManifestAssetPath);
        if (asset == null) {
            errors.Add("Weekend circuit manifest did not import as TextAsset");
            return;
        }
        try {
            WeekendCircuitPresentationFrame frame =
                JsonUtility.FromJson<WeekendCircuitPresentationFrame>(asset.text);
            WeekendCircuitPresentationResource.ValidateOrThrow(frame);
            if (Resources.Load<TextAsset>(WeekendCircuitPresentationResource.ResourcePath) == null)
                errors.Add("Weekend circuit Resources path did not resolve");
        }
        catch (Exception ex) {
            errors.Add("Weekend circuit manifest schema failed: " + ex.Message);
        }
    }

    static void ValidateTextureImport(List<string> errors, string path, bool clamp) {
        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        if (importer == null || texture == null) {
            errors.Add("Weekend circuit texture did not import: " + path);
            return;
        }
        if (texture.width != 1024 || texture.height != 1024)
            errors.Add(path + " must remain 1024x1024");
        if (!importer.sRGBTexture) errors.Add(path + " must import as sRGB");
        if (!importer.mipmapEnabled) errors.Add(path + " must generate mipmaps");
        TextureWrapMode expectedWrap = clamp ? TextureWrapMode.Clamp : TextureWrapMode.Mirror;
        if (importer.wrapMode != expectedWrap)
            errors.Add(path + " wrap mode differs from Web");
        if (importer.filterMode != FilterMode.Trilinear)
            errors.Add(path + " must use Web-equivalent trilinear filtering");
        if (importer.anisoLevel < 8) errors.Add(path + " must keep anisotropy >= 8");
        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
            errors.Add(path + " must remain uncompressed for raster parity");
    }

    static void ValidateShader(List<string> errors, string path, string expectedName) {
        Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
        if (shader == null) { errors.Add("Weekend shader did not import: " + path); return; }
        if (shader.name != expectedName) errors.Add(path + " shader name changed");
        if (ShaderUtil.ShaderHasError(shader)) {
            errors.Add(path + " has compiler errors");
            foreach (var message in ShaderUtil.GetShaderMessages(shader))
                errors.Add(path + ":" + message.line + " " + message.message);
        }
    }

    static void ValidateRuntimeConsumer(List<string> errors) {
        var parent = new GameObject("weekend-circuit-validator-parent");
        WeekendRideCircuitRenderer renderer = null;
        try {
            WeekendCircuitPresentationFrame frame = WeekendCircuitPresentationResource.Load();
            renderer = WeekendRideCircuitRenderer.Build(
                parent.transform,
                frame.route_authority,
                frame);
            if (renderer.RouteId != "weekend-track-day.closed-circuit.v1")
                errors.Add("Weekend circuit renderer built the wrong route");
            if (renderer.SemanticSha256
                != WeekendCircuitPresentationResource.ExpectedSemanticSha256)
                errors.Add("Weekend circuit renderer lost semantic identity");
            if (renderer.LeafCount != 110)
                errors.Add("Weekend circuit renderer did not consume all Web leaves");
            MeshFilter[] filters = renderer.GetComponentsInChildren<MeshFilter>();
            if (filters.Length != 111)
                errors.Add("Weekend circuit must render 110 Web leaves plus exact-plan sky");
            int instances = 0;
            foreach (WeekendCircuitLeafFrame leaf in frame.scene.leaves)
                instances += leaf.instances.count;
            if (instances != 699) errors.Add("Weekend circuit instance count changed");
            MeshRenderer track = Array.Find(renderer.GetComponentsInChildren<MeshRenderer>(),
                candidate => candidate.name == "weekend-track-surface");
            MeshRenderer ground = Array.Find(renderer.GetComponentsInChildren<MeshRenderer>(),
                candidate => candidate.name == "weekend-hinterland-ground");
            MeshRenderer ecology = Array.Find(renderer.GetComponentsInChildren<MeshRenderer>(),
                candidate => candidate.name == "weekend-midfield-trees-roadside-atlas");
            MeshRenderer access = Array.Find(renderer.GetComponentsInChildren<MeshRenderer>(),
                candidate => candidate.name == "weekend-paddock-access-road");
            if (track == null || track.sharedMaterial.GetTexture("_MainTex")
                != WeekendRoadNetworkContractResource.LoadRoadTexture())
                errors.Add("Weekend circuit track lost exact generated asphalt");
            Texture2D field = Resources.Load<Texture2D>(
                "GunsOnly/WeekendRide/OpenRoad/weekend-field-landcover-v1");
            if (ground == null || ground.sharedMaterial.GetTexture("_MainTex") != field)
                errors.Add("Weekend circuit ground lost exact generated field landcover");
            if (ground != null) {
                Vector2 repeat = ground.sharedMaterial.GetTextureScale("_MainTex");
                if (Mathf.Abs(repeat.x - 15.172414f) > 0.001f
                    || Mathf.Abs(repeat.y - 15.172414f) > 0.001f)
                    errors.Add("Weekend ground lost exact 1450 m field texture scale");
                if (Mathf.Abs(ground.sharedMaterial.GetFloat("_FogDensity") - 0.00016f)
                    > 1e-8f)
                    errors.Add("Weekend retained world lost manifest-authored Exp2 fog density");
            }
            if (ecology == null
                || ecology.sharedMaterial.GetTexture("_MainTex")
                    != WeekendRoadNetworkContractResource.LoadRoadsideAtlas()
                || Mathf.Abs(ecology.sharedMaterial.GetFloat("_AlphaTest") - 0.28f) > 1e-6f
                || ecology.sharedMaterial.GetFloat("_Unlit") != 1f
                || ecology.sharedMaterial.GetFloat("_UseVertexColor") != 1f
                || ecology.sharedMaterial.GetFloat("_FlipTextureY") != 1f
                || ecology.sharedMaterial.renderQueue < (int)UnityEngine.Rendering.RenderQueue.AlphaTest)
                errors.Add("Weekend ecology lost exact Web atlas cutout state");
            if (access == null
                || access.sharedMaterial.GetFloat("_UseTexture") != 0f
                || access.sharedMaterial.GetFloat("_UseVertexColor") != 1f)
                errors.Add("Weekend paddock access lost its separate gravel hierarchy");
        }
        catch (Exception ex) {
            errors.Add("Weekend circuit runtime consumer failed: " + ex.Message);
        }
        finally {
            if (parent != null) UnityEngine.Object.DestroyImmediate(parent);
        }
    }

    static void ValidateSourceGuards(List<string> errors) {
        string renderer = File.ReadAllText(Path.GetFullPath(
            "Assets/Scripts/WeekendRideCircuitRenderer.cs"));
        if (renderer.Contains("BuildRibbon", StringComparison.Ordinal)
            || renderer.Contains("MakeStandard", StringComparison.Ordinal))
            errors.Add("Weekend circuit renderer regressed to approximate ribbons/materials");
        if (!renderer.Contains("foreach (WeekendCircuitLeafFrame leaf",
                StringComparison.Ordinal)
            || !renderer.Contains("MatrixFromThree", StringComparison.Ordinal)
            || !renderer.Contains("reverse triangle winding once", StringComparison.Ordinal))
            errors.Add("Weekend circuit renderer lost retained Web leaf consumption");
        string openRoadRenderer = File.ReadAllText(Path.GetFullPath(
            "Assets/Scripts/WeekendHinterlandRoadRenderer.cs"));
        if (!openRoadRenderer.Contains(
                "Reverse triangle winding once at the engine boundary", StringComparison.Ordinal)
            || !openRoadRenderer.Contains(
                "(triangles[triangle + 1], triangles[triangle + 2])", StringComparison.Ordinal)
            || !openRoadRenderer.Contains(
                "GunsOnly/WeekendRide/Circuit/WeekendCircuitParity", StringComparison.Ordinal)
            || !openRoadRenderer.Contains("BuildRoadMaterial(profile)", StringComparison.Ordinal)
            || !openRoadRenderer.Contains("BuildRoadsideMaterial(profile", StringComparison.Ordinal)
            || openRoadRenderer.Contains(
                "Shader.Find(\"GunsOnly/WeekendOpenRoad\")", StringComparison.Ordinal))
            errors.Add("Weekend open-road surface lost its shared Web parity path");
        string surfaceShader = File.ReadAllText(Path.GetFullPath(SurfaceShaderPath));
        if (!surfaceShader.Contains("RECIPROCAL_PI = 0.3183098861837907",
                StringComparison.Ordinal)
            || !surfaceShader.Contains("F_Schlick", StringComparison.Ordinal)
            || !surfaceShader.Contains("V_GGX_SmithCorrelated", StringComparison.Ordinal)
            || !surfaceShader.Contains("D_GGX", StringComparison.Ordinal)
            || !surfaceShader.Contains("BRDF_GGX", StringComparison.Ordinal)
            || !surfaceShader.Contains("clip(sampledAlpha - _AlphaTest)",
                StringComparison.Ordinal)
            || !surfaceShader.Contains("1.0 - input.uv.y", StringComparison.Ordinal)
            || !surfaceShader.Contains("\"LightMode\"=\"ShadowCaster\"",
                StringComparison.Ordinal)
            || !surfaceShader.Contains(
                "_FogDensity * _FogDensity * eyeDepth * eyeDepth", StringComparison.Ordinal)
            || !surfaceShader.Contains("-saturate(fogFactor)", StringComparison.Ordinal)
            || surfaceShader.Contains("lerp(196.0, 2.0", StringComparison.Ordinal))
            errors.Add("Weekend circuit shader lost Three r160 Lambert/GGX parity");
        string outputShader = File.ReadAllText(Path.GetFullPath(OutputShaderPath));
        if (!outputShader.Contains("LinearTosRGB(AcesFilmic", StringComparison.Ordinal)
            || !outputShader.Contains("display = lerp(display, _FogColor.rgb",
                StringComparison.Ordinal)
            || !outputShader.Contains(
                "float fogFactor = saturate(-source.a)", StringComparison.Ordinal)
            || outputShader.Contains("_CameraDepthTexture", StringComparison.Ordinal))
            errors.Add("Weekend output lost Three ACES -> sRGB -> fog order");
        string outputComponent = File.ReadAllText(Path.GetFullPath(
            "Assets/Scripts/WeekendOutputTransform.cs"));
        if (!outputComponent.Contains(
                "public void Apply(RenderTexture source, RenderTexture destination)",
                StringComparison.Ordinal)
            || !outputComponent.Contains("Apply(source, destination)", StringComparison.Ordinal)
            || !outputComponent.Contains("void EnsureMaterial()", StringComparison.Ordinal)
            || outputComponent.Contains(
                "else Graphics.Blit(source, destination)", StringComparison.Ordinal))
            errors.Add("Weekend output lost its shared production/off-screen transform seam");
        string skyShader = File.ReadAllText(Path.GetFullPath(SkyShaderPath));
        if (!skyShader.Contains("float height = input.direction.y", StringComparison.Ordinal)
            || skyShader.Contains(
                "float height = normalize(input.direction).y", StringComparison.Ordinal)
            || !skyShader.Contains("return float4(color, 0.0)", StringComparison.Ordinal))
            errors.Add("Weekend sky lost Web's perspective-interpolated gradient varying");
        string webMain = File.ReadAllText(Path.GetFullPath(Path.Combine(
            Application.dataPath, "../../../web/wwwroot/weekend-ride/main.js")));
        int webSkyToneMap = webMain.IndexOf("#include <tonemapping_fragment>",
            StringComparison.Ordinal);
        int webSkyColorSpace = webMain.IndexOf("#include <colorspace_fragment>",
            StringComparison.Ordinal);
        if (webSkyToneMap < 0 || webSkyColorSpace <= webSkyToneMap)
            errors.Add("Weekend Web sky lost Three ACES -> sRGB output chunks");
        if (!renderer.Contains("renderer.shadowCastingMode = ShadowCastingMode.On",
                StringComparison.Ordinal))
            errors.Add("Weekend retained leaves lost fail-closed depth/shadow participation");
        string bootstrap = File.ReadAllText(Path.GetFullPath(
            "Assets/Scripts/WeekendRideBootstrap.cs"));
        if (!bootstrap.Contains("WeekendOutputTransform", StringComparison.Ordinal)
            || !bootstrap.Contains("output.Configure(_presentation.render_profile)",
                StringComparison.Ordinal)
            || !bootstrap.Contains("WeekendParityCamera.Attach(_camera)",
                StringComparison.Ordinal)
            || !bootstrap.Contains("RenderSettings.fog = false", StringComparison.Ordinal)
            || !bootstrap.Contains("WeekendRideGoldenPathHud.Attach(gameObject, _host)",
                StringComparison.Ordinal))
            errors.Add("Weekend bootstrap lost Web ACES or symbol-only golden-path hook");
        string parityCamera = File.ReadAllText(Path.GetFullPath(
            "Assets/Scripts/WeekendParityCamera.cs"));
        if (!parityCamera.Contains("UnityProjectionXSign = -1f", StringComparison.Ordinal)
            || !parityCamera.Contains("GL.invertCulling = true", StringComparison.Ordinal)
            || !parityCamera.Contains("GL.invertCulling = _previousInvertCulling",
                StringComparison.Ordinal))
            errors.Add("Weekend camera lost Three screen-chirality parity");
    }
}

}
