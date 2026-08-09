using System.Security.Cryptography;
using System.Text.Json;

namespace GunsOnly.UnityBridge.Tests;

public sealed class WeekendVisualAcceptanceTests {
    const string AcceptanceSha256 =
        "661d9a11b7663e16a61deaedff6fdef2f10b9f1e1f318d87624f8c13ebecb63a";
    const string CircuitFileSha256 =
        "0b906b2e24616c3648d39626bb63f9391f2e423e44beef8a03f945609b952461";
    const string CircuitSemanticSha256 =
        "325fa88219e8f3929a684be8d7090519ac94d94f979d982d428793fe7d5a0ad4";
    const string RoadFileSha256 =
        "1f4bb6f5c3f1cd6ecf56e112a3821a0b7375207ae1481e55d0ce9ddcb8b253bc";

    [Fact]
    public void ContractBytesStayExactAcrossCanonicalWebAndUnity() {
        string root = FindRepositoryRoot();
        AssertCopies(root, AcceptanceSha256,
            "content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json",
            "web/wwwroot/content/packs/weekend-ride/qa/"
                + "weekend-visual-acceptance.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/QA/"
                + "weekend-visual-acceptance-v1.json");
    }

    [Fact]
    public void ContractPinsNativeDimensionsAxesScenesAssetsAndThreeViews() {
        string root = FindRepositoryRoot();
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(root,
            "content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json")));
        JsonElement contract = document.RootElement;
        Assert.Equal("guns-only.weekend-visual-acceptance.v1",
            contract.GetProperty("schema").GetString());
        JsonElement capture = contract.GetProperty("capture");
        Assert.Equal(1600, capture.GetProperty("width_px").GetInt32());
        Assert.Equal(1000, capture.GetProperty("height_px").GetInt32());
        Assert.True(capture.GetProperty("opaque").GetBoolean());
        Assert.Equal(68, capture.GetProperty("vertical_fov_deg").GetDouble(), 9);
        Assert.Equal(1.6, capture.GetProperty("aspect").GetDouble(), 9);
        Assert.Equal(4, capture.GetProperty("anti_aliasing_samples").GetInt32());
        Assert.Equal("three-r160-aces-filmic",
            capture.GetProperty("tone_mapping").GetString());
        Assert.Equal(1.04, capture.GetProperty("tone_mapping_exposure").GetDouble(), 9);

        JsonElement axes = contract.GetProperty("coordinate_system");
        Assert.Equal("right", axes.GetProperty("handedness").GetString());
        Assert.Equal("+x/east", axes.GetProperty("right").GetString());
        Assert.Equal("+y/up", axes.GetProperty("up").GetString());
        Assert.Equal("-z/north", axes.GetProperty("forward").GetString());
        Assert.Equal("same-numeric-rendered-scene-xyz",
            axes.GetProperty("unity_conversion").GetString());
        Assert.Equal(-1, axes.GetProperty("unity_projection_x_sign").GetDouble(), 9);
        Assert.True(axes.GetProperty("unity_invert_culling").GetBoolean());

        JsonElement scenes = contract.GetProperty("scenes");
        Assert.Equal(CircuitFileSha256,
            scenes.GetProperty("circuit").GetProperty("file_sha256").GetString());
        Assert.Equal(CircuitSemanticSha256,
            scenes.GetProperty("circuit").GetProperty("semantic_sha256").GetString());
        Assert.Equal(110,
            scenes.GetProperty("circuit").GetProperty("leaf_count").GetInt32());
        Assert.Equal(RoadFileSha256,
            scenes.GetProperty("open_road").GetProperty("file_sha256").GetString());
        Assert.Equal(8,
            scenes.GetProperty("open_road").GetProperty("road_count").GetInt32());
        Assert.Equal(144, scenes.GetProperty("open_road")
            .GetProperty("roadside_instance_count").GetInt32());
        Assert.Equal(4, contract.GetProperty("assets").GetArrayLength());

        JsonElement views = contract.GetProperty("views");
        Assert.Equal(3, views.GetArrayLength());
        Assert.Equal(new[] { "grid-straight", "corner-context", "paddock-road-junction" },
            views.EnumerateArray().Select(view => view.GetProperty("id").GetString()));
        for (int index = 0; index < views.GetArrayLength(); index++) {
            JsonElement view = views[index];
            Assert.Equal(3, view.GetProperty("position_m").GetArrayLength());
            Assert.Equal(3, view.GetProperty("target_m").GetArrayLength());
            Assert.Equal(new[] { 0d, 1d, 0d },
                view.GetProperty("up").EnumerateArray().Select(value => value.GetDouble()));
            Assert.Equal(view.GetProperty("id").GetString() + ".png",
                view.GetProperty("web_file").GetString());
            Assert.Equal("weekend_world_" + index.ToString("00") + "_"
                + view.GetProperty("id").GetString() + ".png",
                view.GetProperty("unity_file").GetString());
        }
    }

    [Fact]
    public void FixedViewsUseTheRenderedNorthReflectionAndSeeBothWorldBranches() {
        string root = FindRepositoryRoot();
        using JsonDocument acceptanceDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(
            root, "content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json")));
        using JsonDocument circuitDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(
            root, "content/packs/weekend-ride/presentation/"
                + "weekend-track-day-presentation.v1.json")));
        using JsonDocument roadDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(
            root, "content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json")));
        JsonElement views = acceptanceDocument.RootElement.GetProperty("views");
        JsonElement circuitStart = circuitDocument.RootElement.GetProperty("route_authority")
            .GetProperty("start");
        Assert.InRange(Math.Abs(
            views[0].GetProperty("target_m")[2].GetDouble()
                + circuitStart.GetProperty("z").GetDouble()), 0, 3);
        Assert.True(views[0].GetProperty("target_m")[0].GetDouble()
            > views[0].GetProperty("position_m")[0].GetDouble());

        JsonElement access = roadDocument.RootElement.GetProperty("circuit_access_point");
        double[] camera = Vector(views[2].GetProperty("position_m"));
        double[] target = Vector(views[2].GetProperty("target_m"));
        double[] accessScene = {
            access.GetProperty("x").GetDouble(),
            access.GetProperty("y").GetDouble(),
            -access.GetProperty("z").GetDouble(),
        };
        double dot = Enumerable.Range(0, 3).Sum(index =>
            (target[index] - camera[index]) * (accessScene[index] - camera[index]));
        Assert.True(dot > 0, "paddock/open-road access must remain in front of its QA camera");
        Assert.Equal(345, accessScene[2], 9);
    }

    [Fact]
    public void WebAndUnityCaptureProductionWorldResourcesWithoutMenuMutation() {
        string root = FindRepositoryRoot();
        string webQa = File.ReadAllText(Path.Combine(root,
            "web/wwwroot/render/motorcycle/weekend_visual_qa.js"));
        string webMain = File.ReadAllText(Path.Combine(root,
            "web/wwwroot/weekend-ride/main.js"));
        string unityCapture = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Editor/WeekendVisualAcceptanceCapture.cs"));
        string parityCamera = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendParityCamera.cs"));
        string bootstrap = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideBootstrap.cs"));
        string unityRunner = File.ReadAllText(Path.Combine(root,
            "tools/weekend-visual-gate/capture-unity.mjs"));

        Assert.Contains("visualQa", webQa);
        Assert.Contains("r1Object.visible = false", webQa);
        Assert.DoesNotContain("querySelector", webQa);
        Assert.DoesNotContain("innerHTML", webQa);
        Assert.Contains("if (weekendVisualQa?.active)", webMain);
        Assert.Contains("weekendVisualQa.render()", webMain);

        Assert.Contains("WeekendRideCircuitRenderer.Build", unityCapture);
        Assert.Contains("WeekendHinterlandRoadRenderer.Attach", unityCapture);
        Assert.Contains("WeekendOutputTransform", unityCapture);
        Assert.Contains("WeekendParityCamera.Attach(camera)", unityCapture);
        Assert.Contains("ValidateLiveCameraPose(camera, view)", unityCapture);
        Assert.Contains("RenderTextureFormat.ARGBHalf", unityCapture);
        Assert.Contains("RenderTextureReadWrite.Linear", unityCapture);
        Assert.Contains("ResolveAntiAliasedSurface(sceneResolved)", unityCapture);
        Assert.Contains("output.Apply(sceneResolved, outputTarget)", unityCapture);
        Assert.DoesNotContain(
            "cameraObject.AddComponent<WeekendOutputTransform>()",
            unityCapture);
        Assert.Contains("EncodeLinearToSrgbPng", unityCapture);
        Assert.Contains("RenderSettings.fog = false", unityCapture);
        Assert.DoesNotContain("ScreenCapture", unityCapture);
        Assert.DoesNotContain("OnGUI", unityCapture);
        Assert.Contains("UnityProjectionXSign = -1f", parityCamera);
        Assert.Contains("UnityInvertCulling = true", parityCamera);
        Assert.Contains("_previousInvertCulling = GL.invertCulling", parityCamera);
        Assert.Contains("GL.invertCulling = _previousInvertCulling", parityCamera);
        Assert.Contains("WeekendParityCamera.Attach(_camera)", bootstrap);
        Assert.Contains("without -nographics", unityRunner);
        Assert.DoesNotContain("args.push(\"-nographics\")", unityRunner);
    }

    static double[] Vector(JsonElement value) =>
        value.EnumerateArray().Select(channel => channel.GetDouble()).ToArray();

    static void AssertCopies(string root, string expectedSha256, params string[] paths) {
        byte[]? first = null;
        foreach (string relative in paths) {
            string path = Path.Combine(root, relative);
            Assert.True(File.Exists(path), "missing Weekend acceptance file " + path);
            byte[] bytes = File.ReadAllBytes(path);
            Assert.Equal(expectedSha256, Sha256Hex(bytes));
            if (first == null) first = bytes;
            else Assert.Equal(first, bytes);
        }
    }

    static string Sha256Hex(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    static string FindRepositoryRoot() {
        string? directory = Environment.GetEnvironmentVariable("GUNS_REPO_ROOT")
            ?? AppContext.BaseDirectory;
        for (int depth = 0; depth < 14 && directory != null; depth++) {
            if (File.Exists(Path.Combine(directory, "GunsOnly.sln"))) return directory;
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("Guns Only repository root not found");
    }
}
