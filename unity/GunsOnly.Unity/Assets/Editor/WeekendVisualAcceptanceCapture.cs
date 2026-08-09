using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using GunsOnly.UnityClient;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;

namespace GunsOnly.UnityEditorTools {

/// <summary>
/// Fail-closed, offscreen Weekend Web↔Unity acceptance capture. The production scene resources
/// are consumed directly; only the QA camera and output files are editor-only.
/// </summary>
public sealed class WeekendVisualAcceptanceCapture : IPreprocessBuildWithReport {
    public const string Schema = "guns-only.weekend-visual-acceptance.v1";
    public const string CaptureSchema = "guns-only.weekend-visual-capture.v1";
    public const string ResourcePath =
        "GunsOnly/WeekendRide/QA/weekend-visual-acceptance-v1";
    public const string ContractSha256 =
        "661d9a11b7663e16a61deaedff6fdef2f10b9f1e1f318d87624f8c13ebecb63a";
    const string ContractAssetPath =
        "Assets/Resources/GunsOnly/WeekendRide/QA/weekend-visual-acceptance-v1.json";
    const int Width = 1600;
    const int Height = 1000;

    public int callbackOrder => -982;

    public void OnPreprocessBuild(BuildReport report) => ValidateOrThrow();

    [MenuItem("Guns Only/Validate Weekend Visual Acceptance")]
    public static void ValidateMenu() {
        ValidateOrThrow();
        Debug.Log("[GunsOnly] Weekend visual acceptance contract PASS");
    }

    [MenuItem("Guns Only/Capture Weekend Visual Acceptance")]
    public static void CaptureMenu() {
        string output = ResolveOutputDirectory();
        CaptureOrThrow(output);
        EditorUtility.RevealInFinder(output);
    }

    /// <summary>CLI entry point. Invoke without -nographics so Metal can render the plates.</summary>
    public static void CaptureBatch() {
        try {
            string output = ResolveOutputDirectory();
            CaptureOrThrow(output);
            Debug.Log("[GunsOnly] Weekend visual capture PASS -> " + output);
            EditorApplication.Exit(0);
        }
        catch (Exception ex) {
            Debug.LogException(ex);
            EditorApplication.Exit(1);
        }
    }

    public static void ValidateOrThrow() {
        if (PlayerSettings.colorSpace != ColorSpace.Linear)
            throw new BuildFailedException(
                "Weekend visual acceptance requires Unity Linear color space.");
        WeekendVisualAcceptanceFrame frame = LoadAndValidateContract();
        WeekendCircuitPresentationFrame circuit = WeekendCircuitPresentationResource.Load();
        WeekendRoadNetworkFrame road = WeekendRoadNetworkContractResource.Load();
        Same(circuit.semantic_sha256, frame.scenes.circuit.semantic_sha256,
            "circuit semantic SHA-256");
        Same(WeekendCircuitPresentationResource.ExpectedSemanticSha256,
            frame.scenes.circuit.semantic_sha256, "Unity circuit semantic SHA-256");
        Same(WeekendRoadNetworkContractResource.RoadContractSha256,
            frame.scenes.open_road.file_sha256, "Unity road file SHA-256");
        if (circuit.scene.leaf_count != frame.scenes.circuit.leaf_count)
            throw new BuildFailedException("Weekend circuit acceptance leaf count changed.");
        if (road.roads.Length != frame.scenes.open_road.road_count
            || road.roadside_instances.Length != frame.scenes.open_road.roadside_instance_count)
            throw new BuildFailedException("Weekend open-road acceptance counts changed.");
        ValidatePinnedRepositoryBytes(frame);
    }

    public static void CaptureOrThrow(string outputDirectory) {
        ValidateOrThrow();
        WeekendVisualAcceptanceFrame acceptance = LoadAndValidateContract();
        WeekendCircuitPresentationFrame presentation = WeekendCircuitPresentationResource.Load();
        Directory.CreateDirectory(outputDirectory);

        var world = new GameObject("weekend-visual-acceptance-world");
        GameObject cameraObject = null;
        GameObject outputObject = null;
        GameObject sunObject = null;
        RenderTexture sceneMsaa = null;
        RenderTexture sceneResolved = null;
        RenderTexture outputTarget = null;
        Texture2D readback = null;
        RenderTexture previousActive = RenderTexture.active;
        bool previousFog = RenderSettings.fog;
        FogMode previousFogMode = RenderSettings.fogMode;
        Color previousFogColor = RenderSettings.fogColor;
        float previousFogDensity = RenderSettings.fogDensity;
        AmbientMode previousAmbientMode = RenderSettings.ambientMode;
        Color previousAmbientSky = RenderSettings.ambientSkyColor;
        Color previousAmbientGround = RenderSettings.ambientGroundColor;
        Color previousAmbientEquator = RenderSettings.ambientEquatorColor;
        try {
            WeekendRideCircuitRenderer circuit = WeekendRideCircuitRenderer.Build(
                world.transform,
                presentation.route_authority,
                presentation);
            WeekendHinterlandRoadRenderer road = WeekendHinterlandRoadRenderer.Attach(world.transform);
            if (circuit.LeafCount != acceptance.scenes.circuit.leaf_count
                || road.RoadsideInstanceCount != acceptance.scenes.open_road.roadside_instance_count)
                throw new InvalidOperationException("Weekend capture did not build the full world.");

            ConfigureWorldLight(presentation.render_profile, out sunObject);
            cameraObject = new GameObject("WeekendVisualAcceptanceCamera");
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.enabled = false;
            camera.orthographic = false;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = WeekendCircuitPresentationResource.LinearSrgbHex(
                presentation.render_profile.background_srgb_hex);
            camera.allowHDR = true;
            camera.allowMSAA = true;
            camera.fieldOfView = (float)acceptance.capture.vertical_fov_deg;
            camera.aspect = (float)acceptance.capture.aspect;
            camera.nearClipPlane = (float)acceptance.capture.near_m;
            camera.farClipPlane = (float)acceptance.capture.far_m;
            camera.depthTextureMode |= DepthTextureMode.Depth;
            WeekendParityCamera.Attach(camera);

            // Camera.Render on a disabled off-screen camera does not reliably invoke
            // OnRenderImage. Keep the production output component on a separate disabled helper
            // and call its exact material explicitly after the 4x-MSAA scene resolve.
            outputObject = new GameObject("WeekendVisualAcceptanceOutput");
            Camera outputCamera = outputObject.AddComponent<Camera>();
            outputCamera.enabled = false;
            WeekendOutputTransform output = outputObject.AddComponent<WeekendOutputTransform>();
            output.Configure(presentation.render_profile);

            sceneMsaa = new RenderTexture(
                Width,
                Height,
                24,
                RenderTextureFormat.ARGBHalf,
                RenderTextureReadWrite.Linear) {
                name = "WeekendVisualAcceptanceScene4xMsaa",
                antiAliasing = acceptance.capture.anti_aliasing_samples,
                useMipMap = false,
                autoGenerateMips = false,
            };
            sceneResolved = new RenderTexture(
                Width,
                Height,
                0,
                RenderTextureFormat.ARGBHalf,
                RenderTextureReadWrite.Linear) {
                name = "WeekendVisualAcceptanceSceneResolved",
                antiAliasing = 1,
                useMipMap = false,
                autoGenerateMips = false,
            };
            outputTarget = new RenderTexture(
                Width,
                Height,
                0,
                RenderTextureFormat.ARGBHalf,
                RenderTextureReadWrite.Linear) {
                name = "WeekendVisualAcceptanceOutputLinear",
                antiAliasing = 1,
                useMipMap = false,
                autoGenerateMips = false,
            };
            sceneMsaa.Create();
            sceneResolved.Create();
            outputTarget.Create();
            if (!sceneMsaa.IsCreated() || sceneMsaa.sRGB
                || !sceneResolved.IsCreated() || sceneResolved.sRGB
                || !outputTarget.IsCreated() || outputTarget.sRGB)
                throw new InvalidOperationException(
                    "Weekend capture requires created linear HDR scene/resolve/output targets.");
            readback = new Texture2D(Width, Height, TextureFormat.RGBAHalf, false, true);
            if (readback.isDataSRGB)
                throw new InvalidOperationException("Weekend capture readback must remain linear.");

            var manifestViews = new WeekendVisualCaptureViewFrame[acceptance.views.Length];
            for (int index = 0; index < acceptance.views.Length; index++) {
                WeekendVisualAcceptanceViewFrame view = acceptance.views[index];
                camera.transform.position = Vector(view.position_m);
                camera.transform.LookAt(Vector(view.target_m), Vector(view.up));
                ValidateLiveCameraPose(camera, view);
                string path = Path.Combine(outputDirectory, view.unity_file);
                WriteFrame(
                    camera,
                    output,
                    sceneMsaa,
                    sceneResolved,
                    outputTarget,
                    readback,
                    path);
                manifestViews[index] = new WeekendVisualCaptureViewFrame {
                    id = view.id,
                    file = view.unity_file,
                    position_m = (double[])view.position_m.Clone(),
                    target_m = (double[])view.target_m.Clone(),
                };
                Debug.Log("[GunsOnly] Weekend visual plate " + view.id + " -> " + path);
            }

            var manifest = new WeekendVisualCaptureManifestFrame {
                schema = CaptureSchema,
                renderer = "unity",
                acceptance_contract_sha256 = ContractSha256,
                width_px = Width,
                height_px = Height,
                opaque = true,
                vertical_fov_deg = acceptance.capture.vertical_fov_deg,
                aspect = acceptance.capture.aspect,
                scenes = new WeekendVisualCaptureScenesFrame {
                    circuit_semantic_sha256 = acceptance.scenes.circuit.semantic_sha256,
                    circuit_file_sha256 = acceptance.scenes.circuit.file_sha256,
                    open_road_file_sha256 = acceptance.scenes.open_road.file_sha256,
                },
                views = manifestViews,
            };
            File.WriteAllText(
                Path.Combine(outputDirectory, "weekend_visual_capture.json"),
                JsonUtility.ToJson(manifest, true) + "\n");
        }
        finally {
            RenderTexture.active = previousActive;
            RenderSettings.fog = previousFog;
            RenderSettings.fogMode = previousFogMode;
            RenderSettings.fogColor = previousFogColor;
            RenderSettings.fogDensity = previousFogDensity;
            RenderSettings.ambientMode = previousAmbientMode;
            RenderSettings.ambientSkyColor = previousAmbientSky;
            RenderSettings.ambientGroundColor = previousAmbientGround;
            RenderSettings.ambientEquatorColor = previousAmbientEquator;
            if (readback != null) UnityEngine.Object.DestroyImmediate(readback);
            ReleaseTarget(outputTarget);
            ReleaseTarget(sceneResolved);
            ReleaseTarget(sceneMsaa);
            if (outputObject != null) UnityEngine.Object.DestroyImmediate(outputObject);
            if (cameraObject != null) UnityEngine.Object.DestroyImmediate(cameraObject);
            if (sunObject != null) UnityEngine.Object.DestroyImmediate(sunObject);
            if (world != null) UnityEngine.Object.DestroyImmediate(world);
        }
    }

    static WeekendVisualAcceptanceFrame LoadAndValidateContract() {
        TextAsset asset = Resources.Load<TextAsset>(ResourcePath);
        if (asset == null)
            throw new BuildFailedException("Weekend visual acceptance resource is missing.");
        string sha = Sha256(asset.bytes);
        Same(sha, ContractSha256, "acceptance contract SHA-256");
        WeekendVisualAcceptanceFrame frame =
            JsonUtility.FromJson<WeekendVisualAcceptanceFrame>(asset.text);
        ValidateFrame(frame);
        return frame;
    }

    static void ValidateFrame(WeekendVisualAcceptanceFrame frame) {
        if (frame == null || frame.capture == null || frame.coordinate_system == null
            || frame.scenes == null || frame.scenes.circuit == null
            || frame.scenes.open_road == null || frame.assets == null || frame.views == null)
            throw new BuildFailedException("Weekend visual acceptance header is incomplete.");
        Same(frame.schema, Schema, "acceptance schema");
        Same(frame.serialization, "canonical-json-v1", "acceptance serialization");
        if (frame.capture.width_px != Width || frame.capture.height_px != Height
            || !frame.capture.opaque || frame.capture.vertical_fov_deg != 68
            || frame.capture.aspect != 1.6 || frame.capture.near_m != 0.25
            || frame.capture.far_m != 24000 || frame.capture.anti_aliasing_samples != 4
            || frame.capture.output_color_space != "srgb"
            || frame.capture.tone_mapping != "three-r160-aces-filmic"
            || frame.capture.tone_mapping_exposure != 1.04)
            throw new BuildFailedException("Weekend visual capture projection/output changed.");
        if (frame.coordinate_system.handedness != "right"
            || frame.coordinate_system.right != "+x/east"
            || frame.coordinate_system.up != "+y/up"
            || frame.coordinate_system.forward != "-z/north"
            || frame.coordinate_system.units != "metres"
            || frame.coordinate_system.unity_conversion != "same-numeric-rendered-scene-xyz"
            || frame.coordinate_system.unity_projection_x_sign
                != WeekendParityCamera.UnityProjectionXSign
            || frame.coordinate_system.unity_invert_culling
                != WeekendParityCamera.UnityInvertCulling)
            throw new BuildFailedException("Weekend visual coordinate contract changed.");
        if (frame.scenes.circuit.schema != WeekendCircuitPresentationResource.Schema
            || frame.scenes.circuit.root_name != "weekend-track-day"
            || frame.scenes.circuit.leaf_count != 110
            || frame.scenes.circuit.semantic_sha256
                != WeekendCircuitPresentationResource.ExpectedSemanticSha256
            || frame.scenes.circuit.file_sha256
                != "0b906b2e24616c3648d39626bb63f9391f2e423e44beef8a03f945609b952461"
            || frame.scenes.open_road.schema != WeekendRoadNetworkContractResource.Schema
            || frame.scenes.open_road.id != WeekendRoadNetworkContractResource.NetworkId
            || frame.scenes.open_road.root_name != "weekend-open-road-network"
            || frame.scenes.open_road.road_count != 8
            || frame.scenes.open_road.roadside_instance_count != 144
            || frame.scenes.open_road.file_sha256
                != WeekendRoadNetworkContractResource.RoadContractSha256)
            throw new BuildFailedException("Weekend visual scene identity changed.");
        ValidateAssets(frame.assets);
        ValidateViews(frame.views);
    }

    static void ValidateAssets(WeekendVisualAcceptanceAssetFrame[] assets) {
        var expected = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["environment.texture.weekend-track-asphalt.v1"] =
                WeekendRoadNetworkContractResource.RoadTextureSourceSha256,
            ["environment.texture.weekend-hinterland-ground.v1"] =
                WeekendRoadNetworkContractResource.GroundTextureSourceSha256,
            ["environment.texture.weekend-field-landcover.v1"] =
                "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d",
            ["environment.foliage.weekend-roadside-atlas.v1"] =
                WeekendRoadNetworkContractResource.RoadsideAtlasSha256,
        };
        if (assets.Length != expected.Count)
            throw new BuildFailedException("Weekend acceptance must pin four world assets.");
        foreach (WeekendVisualAcceptanceAssetFrame asset in assets) {
            string sha;
            if (asset == null || !expected.TryGetValue(asset.id, out sha)
                || asset.sha256 != sha)
                throw new BuildFailedException("Weekend visual asset identity changed.");
            expected.Remove(asset.id);
        }
        if (expected.Count != 0)
            throw new BuildFailedException("Weekend visual asset identity is incomplete.");
    }

    static void ValidateViews(WeekendVisualAcceptanceViewFrame[] views) {
        string[] ids = { "grid-straight", "corner-context", "paddock-road-junction" };
        if (views.Length != ids.Length)
            throw new BuildFailedException("Weekend acceptance requires exactly three views.");
        for (int index = 0; index < ids.Length; index++) {
            WeekendVisualAcceptanceViewFrame view = views[index];
            if (view == null || view.id != ids[index]
                || view.web_file != ids[index] + ".png"
                || view.unity_file != "weekend_world_" + index.ToString("00")
                    + "_" + ids[index] + ".png"
                || !FiniteVector(view.position_m) || !FiniteVector(view.target_m)
                || !ExactVector(view.up, 0, 1, 0))
                throw new BuildFailedException("Weekend acceptance view " + index + " changed.");
            Vector3 direction = Vector(view.target_m) - Vector(view.position_m);
            if (direction.sqrMagnitude <= 1f
                || Mathf.Abs(Vector3.Dot(direction.normalized, Vector3.up)) > 0.999f)
                throw new BuildFailedException("Weekend acceptance camera pose is degenerate.");
        }
    }

    static void ValidatePinnedRepositoryBytes(WeekendVisualAcceptanceFrame frame) {
        string root = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
        ValidateCopies(root, ContractSha256,
            "content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json",
            "web/wwwroot/content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/QA/"
                + "weekend-visual-acceptance-v1.json");
        ValidateCopies(root, frame.scenes.circuit.file_sha256,
            "content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json",
            "web/wwwroot/content/packs/weekend-ride/presentation/"
                + "weekend-track-day-presentation.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/"
                + "weekend-track-day-presentation-v1.json");
        ValidateCopies(root, frame.scenes.open_road.file_sha256,
            "content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json",
            "web/wwwroot/content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
                + "weekend-hinterland-road-network-v1.json");
        string[] sourceAssets = {
            "content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp",
            "content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp",
            "content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp",
            "content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png",
        };
        for (int index = 0; index < sourceAssets.Length; index++) {
            string path = Path.Combine(root, sourceAssets[index]);
            if (!File.Exists(path) || Sha256(File.ReadAllBytes(path)) != frame.assets[index].sha256)
                throw new BuildFailedException("Weekend acceptance source asset changed: " + path);
        }
        TextAsset imported = AssetDatabase.LoadAssetAtPath<TextAsset>(ContractAssetPath);
        if (imported == null || Sha256(imported.bytes) != ContractSha256)
            throw new BuildFailedException("Weekend acceptance JSON did not import byte-exactly.");
    }

    static void ValidateCopies(string root, string expectedSha, params string[] relativePaths) {
        byte[] first = null;
        foreach (string relative in relativePaths) {
            string path = Path.Combine(root, relative);
            if (!File.Exists(path))
                throw new BuildFailedException("Missing Weekend acceptance input " + path);
            byte[] bytes = File.ReadAllBytes(path);
            if (Sha256(bytes) != expectedSha)
                throw new BuildFailedException("Weekend acceptance hash changed: " + path);
            if (first == null) first = bytes;
            else if (!SameBytes(first, bytes))
                throw new BuildFailedException("Weekend acceptance copies differ: " + path);
        }
    }

    static bool SameBytes(byte[] left, byte[] right) {
        if (left == null || right == null || left.Length != right.Length) return false;
        for (int index = 0; index < left.Length; index++) {
            if (left[index] != right[index]) return false;
        }
        return true;
    }

    static void ConfigureWorldLight(
        WeekendCircuitRenderProfileFrame profile,
        out GameObject sunObject
    ) {
        // WeekendOutputTransform applies Three's post-tone-map Exp2 fog from camera depth.
        // Built-in fog would pre-fog Unity surface shaders and double-fog the open-road layer.
        RenderSettings.fog = false;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            profile.fog.srgb_hex);
        RenderSettings.fogDensity = (float)profile.fog.density;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            profile.hemisphere.sky_srgb_hex) * (float)profile.hemisphere.intensity;
        RenderSettings.ambientGroundColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            profile.hemisphere.ground_srgb_hex) * (float)profile.hemisphere.intensity;
        RenderSettings.ambientEquatorColor = Color.Lerp(
            RenderSettings.ambientGroundColor,
            RenderSettings.ambientSkyColor,
            0.5f);
        sunObject = new GameObject("WeekendVisualAcceptanceSun");
        Light sun = sunObject.AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = WeekendCircuitPresentationResource.LinearSrgbHex(profile.sun.srgb_hex);
        sun.intensity = (float)profile.sun.intensity;
        sun.shadows = LightShadows.None;
        Vector3 webLightPosition = new(
            (float)profile.sun.position[0],
            (float)profile.sun.position[1],
            (float)profile.sun.position[2]);
        sun.transform.rotation = Quaternion.LookRotation(-webLightPosition.normalized, Vector3.up);
    }

    static void WriteFrame(
        Camera camera,
        WeekendOutputTransform output,
        RenderTexture sceneMsaa,
        RenderTexture sceneResolved,
        RenderTexture outputTarget,
        Texture2D readback,
        string path
    ) {
        RenderTexture previousTarget = camera.targetTexture;
        RenderTexture previousActive = RenderTexture.active;
        try {
            camera.targetTexture = sceneMsaa;
            camera.Render();
            sceneMsaa.ResolveAntiAliasedSurface(sceneResolved);
            output.Apply(sceneResolved, outputTarget);
            RenderTexture.active = outputTarget;
            readback.ReadPixels(new Rect(0, 0, Width, Height), 0, 0, false);
            readback.Apply(false, false);
            File.WriteAllBytes(path, EncodeLinearToSrgbPng(readback));
        }
        finally {
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;
        }
    }

    static void ReleaseTarget(RenderTexture target) {
        if (target == null) return;
        target.Release();
        UnityEngine.Object.DestroyImmediate(target);
    }

    static void ValidateLiveCameraPose(
        Camera camera,
        WeekendVisualAcceptanceViewFrame view
    ) {
        Vector3 expectedPosition = Vector(view.position_m);
        Vector3 expectedForward = (Vector(view.target_m) - expectedPosition).normalized;
        Quaternion expectedRotation = Quaternion.LookRotation(expectedForward, Vector(view.up));
        if ((camera.transform.position - expectedPosition).sqrMagnitude > 1e-10f
            || Vector3.Dot(camera.transform.forward, expectedForward) < 0.999999f
            || Vector3.Dot(camera.transform.up, expectedRotation * Vector3.up) < 0.999999f)
            throw new InvalidOperationException(
                "Weekend capture camera did not retain the fixed acceptance pose for "
                    + view.id + ".");
    }

    static byte[] EncodeLinearToSrgbPng(Texture2D linearReadback) {
        Color[] pixels = linearReadback.GetPixels();
        var encoded = new byte[pixels.Length * 3];
        for (int index = 0; index < pixels.Length; index++) {
            int offset = index * 3;
            encoded[offset] = LinearToSrgbByte(pixels[index].r);
            encoded[offset + 1] = LinearToSrgbByte(pixels[index].g);
            encoded[offset + 2] = LinearToSrgbByte(pixels[index].b);
        }
        return ImageConversion.EncodeArrayToPNG(
            encoded,
            GraphicsFormat.R8G8B8_UNorm,
            (uint)Width,
            (uint)Height,
            (uint)(Width * 3));
    }

    static byte LinearToSrgbByte(float linear) {
        linear = Mathf.Clamp01(linear);
        float srgb = linear <= 0.0031308f
            ? linear * 12.92f
            : 1.055f * Mathf.Pow(linear, 1f / 2.4f) - 0.055f;
        return (byte)Mathf.Clamp(Mathf.RoundToInt(srgb * 255f), 0, 255);
    }

    static string ResolveOutputDirectory() {
        string value = Environment.GetEnvironmentVariable("WEEKEND_UNITY_VISUAL_SHOT_DIR");
        return Path.GetFullPath(string.IsNullOrWhiteSpace(value)
            ? "/tmp/guns-only-weekend-unity"
            : value);
    }

    static Vector3 Vector(double[] values) =>
        new((float)values[0], (float)values[1], (float)values[2]);

    static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);

    static bool FiniteVector(double[] values) => values != null && values.Length == 3
        && Finite(values[0]) && Finite(values[1]) && Finite(values[2]);

    static bool ExactVector(double[] values, double x, double y, double z) =>
        FiniteVector(values) && values[0] == x && values[1] == y && values[2] == z;

    static string Sha256(byte[] bytes) {
        using (SHA256 sha = SHA256.Create()) {
            return BitConverter.ToString(sha.ComputeHash(bytes))
                .Replace("-", "")
                .ToLowerInvariant();
        }
    }

    static void Same(string actual, string expected, string label) {
        if (actual != expected)
            throw new BuildFailedException(label + " changed (expected " + expected
                + ", got " + actual + ").");
    }
}

[Serializable]
public sealed class WeekendVisualAcceptanceFrame {
    public string schema;
    public string serialization;
    public WeekendVisualAcceptanceCaptureFrame capture;
    public WeekendVisualAcceptanceCoordinateFrame coordinate_system;
    public WeekendVisualAcceptanceScenesFrame scenes;
    public WeekendVisualAcceptanceAssetFrame[] assets;
    public WeekendVisualAcceptanceViewFrame[] views;
}

[Serializable]
public sealed class WeekendVisualAcceptanceCaptureFrame {
    public int width_px;
    public int height_px;
    public bool opaque;
    public double vertical_fov_deg;
    public double aspect;
    public double near_m;
    public double far_m;
    public int anti_aliasing_samples;
    public string output_color_space;
    public string tone_mapping;
    public double tone_mapping_exposure;
}

[Serializable]
public sealed class WeekendVisualAcceptanceCoordinateFrame {
    public string handedness;
    public string right;
    public string up;
    public string forward;
    public string units;
    public string unity_conversion;
    public double unity_projection_x_sign;
    public bool unity_invert_culling;
}

[Serializable]
public sealed class WeekendVisualAcceptanceScenesFrame {
    public WeekendVisualAcceptanceCircuitFrame circuit;
    public WeekendVisualAcceptanceRoadFrame open_road;
}

[Serializable]
public sealed class WeekendVisualAcceptanceCircuitFrame {
    public string schema;
    public string root_name;
    public int leaf_count;
    public string semantic_sha256;
    public string file_sha256;
}

[Serializable]
public sealed class WeekendVisualAcceptanceRoadFrame {
    public string schema;
    public string id;
    public string root_name;
    public int road_count;
    public int roadside_instance_count;
    public string file_sha256;
}

[Serializable]
public sealed class WeekendVisualAcceptanceAssetFrame {
    public string id;
    public string sha256;
}

[Serializable]
public sealed class WeekendVisualAcceptanceViewFrame {
    public string id;
    public string web_file;
    public string unity_file;
    public double[] position_m;
    public double[] target_m;
    public double[] up;
}

[Serializable]
public sealed class WeekendVisualCaptureManifestFrame {
    public string schema;
    public string renderer;
    public string acceptance_contract_sha256;
    public int width_px;
    public int height_px;
    public bool opaque;
    public double vertical_fov_deg;
    public double aspect;
    public WeekendVisualCaptureScenesFrame scenes;
    public WeekendVisualCaptureViewFrame[] views;
}

[Serializable]
public sealed class WeekendVisualCaptureScenesFrame {
    public string circuit_semantic_sha256;
    public string circuit_file_sha256;
    public string open_road_file_sha256;
}

[Serializable]
public sealed class WeekendVisualCaptureViewFrame {
    public string id;
    public string file;
    public double[] position_m;
    public double[] target_m;
}

}
