using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace GunsOnly.UnityBridge.Tests;

public sealed class WeekendCircuitPresentationParityTests {
    const string ManifestSha256 =
        "0b906b2e24616c3648d39626bb63f9391f2e423e44beef8a03f945609b952461";
    const string SemanticSha256 =
        "325fa88219e8f3929a684be8d7090519ac94d94f979d982d428793fe7d5a0ad4";
    static readonly JsonSerializerOptions CanonicalOptions = new() {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    [Fact]
    public void ActualWebSceneBytesStayExactAcrossCanonicalWebAndUnity() {
        string root = FindRepositoryRoot();
        string[] paths = {
            "content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json",
            "web/wwwroot/content/packs/weekend-ride/presentation/"
                + "weekend-track-day-presentation.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/"
                + "weekend-track-day-presentation-v1.json",
        };
        byte[]? first = null;
        foreach (string relative in paths) {
            byte[] bytes = File.ReadAllBytes(Path.Combine(root, relative));
            Assert.Equal(ManifestSha256, Sha256Hex(bytes));
            if (first == null) first = bytes;
            else Assert.Equal(first, bytes);
        }
    }

    [Fact]
    public void SemanticHashCoversRouteRenderProfileAndEveryLeaf() {
        string root = FindRepositoryRoot();
        string path = Path.Combine(root,
            "content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(path));
        JsonElement manifest = document.RootElement;
        Assert.Equal("guns-only.weekend-track-day-scene.v1",
            manifest.GetProperty("schema").GetString());
        Assert.Equal(SemanticSha256, manifest.GetProperty("semantic_sha256").GetString());
        string canonicalPayload = Canonical(manifest, omitSemanticAtRoot: true);
        Assert.Equal(SemanticSha256, Sha256Hex(Encoding.UTF8.GetBytes(canonicalPayload)));
        Assert.Equal(577, manifest.GetProperty("route_authority")
            .GetProperty("centreline").GetArrayLength());
        JsonElement scene = manifest.GetProperty("scene");
        Assert.Equal(110, scene.GetProperty("leaf_count").GetInt32());
        Assert.Equal(110, scene.GetProperty("leaves").GetArrayLength());
        Assert.Equal(699, scene.GetProperty("leaves").EnumerateArray().Sum(
            leaf => leaf.GetProperty("instances").GetProperty("count").GetInt32()));

        string source = File.ReadAllText(Path.Combine(root,
            "web/wwwroot/render/motorcycle/track_day_presentation.js"));
        Assert.Equal(Sha256Hex(Encoding.UTF8.GetBytes(source)),
            manifest.GetProperty("source").GetProperty("source_sha256").GetString());
    }

    [Fact]
    public void ManifestContainsEveryClosedCircuitVisualRoleAndExactGeneratedMaps() {
        string root = FindRepositoryRoot();
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(root,
            "content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json")));
        JsonElement manifest = document.RootElement;
        string paths = string.Join('\n', manifest.GetProperty("scene").GetProperty("leaves")
            .EnumerateArray().Select(leaf => leaf.GetProperty("path").GetString()));
        foreach (string token in new[] {
            "weekend-hinterland-ground", "weekend-circuit-verge", "weekend-field-patchwork",
            "weekend-rolling-field-relief", "weekend-field-hedgerows",
            "weekend-paddock-access-road", "weekend-paddock-access-delineator",
            "weekend-horizon-ridge", "weekend-horizon-silhouettes",
            "weekend-midfield-trees-roadside-atlas", "weekend-farm-buildings", "weekend-race-control",
            "weekend-pit-garage", "weekend-paved-shoulder", "weekend-track-surface",
            "weekend-track-curbs", "weekend-track-edge-lines", "weekend-runoff-edge-lines",
            "weekend-start-finish-gantry", "weekend-course-cones",
            "weekend-tyre-walls", "weekend-marshal-post", "weekend-paddock-canopy",
            "weekend-service-vehicle",
        }) Assert.Contains(token, paths);

        var textureHashes = manifest.GetProperty("textures").EnumerateArray().ToDictionary(
            texture => texture.GetProperty("id").GetString()!,
            texture => texture.GetProperty("sha256").GetString());
        Assert.Equal(
            "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713",
            textureHashes["TEX_WEEKEND_TRACK_ASPHALT_V1"]);
        Assert.Equal(
            "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1",
            textureHashes["TEX_WEEKEND_HINTERLAND_GROUND_V1"]);
        Assert.Equal(
            "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d",
            textureHashes["TEX_WEEKEND_FIELD_LANDCOVER_V1"]);
        Assert.Equal(
            "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf",
            textureHashes["TEX_WEEKEND_ROADSIDE_ATLAS_V1"]);

        JsonElement ecology = manifest.GetProperty("scene").GetProperty("leaves")
            .EnumerateArray().Single(leaf => leaf.GetProperty("name").GetString()
                == "weekend-midfield-trees-roadside-atlas");
        Assert.Equal("mesh-basic", ecology.GetProperty("material").GetProperty("model").GetString());
        Assert.True(ecology.GetProperty("material").GetProperty("vertex_colors").GetBoolean());
        Assert.Equal(0.28, ecology.GetProperty("material").GetProperty("alpha_test").GetDouble(), 9);
        Assert.False(ecology.GetProperty("material").GetProperty("map")
            .GetProperty("flip_y").GetBoolean());

        JsonElement profile = manifest.GetProperty("render_profile");
        Assert.Equal("three-r160-aces-filmic", profile.GetProperty("tone_mapping").GetString());
        Assert.Equal(1.04, profile.GetProperty("tone_mapping_exposure").GetDouble(), 9);
        Assert.Equal(68, profile.GetProperty("camera").GetProperty("vertical_fov_deg").GetInt32());
        Assert.Equal(24000, profile.GetProperty("camera").GetProperty("far_m").GetInt32());
        Assert.Equal(24, profile.GetProperty("sky").GetProperty("width_segments").GetInt32());
        Assert.Equal(12, profile.GetProperty("sky").GetProperty("height_segments").GetInt32());
    }

    [Fact]
    public void CircuitAndOpenRoadUseTheSameNorthReflectionAtPaddockJunction() {
        string root = FindRepositoryRoot();
        using JsonDocument sceneDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(root,
            "content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json")));
        using JsonDocument roadDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(root,
            "content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json")));
        JsonElement paddock = sceneDocument.RootElement.GetProperty("route_authority")
            .GetProperty("paddock_access");
        JsonElement access = roadDocument.RootElement.GetProperty("roads").EnumerateArray()
            .Single(road => road.GetProperty("id").GetString() == "paddock-access")
            .GetProperty("centreline")[0];
        Assert.Equal(paddock.GetProperty("x").GetDouble(), access.GetProperty("x").GetDouble(), 9);
        Assert.Equal(paddock.GetProperty("y").GetDouble(), access.GetProperty("y").GetDouble(), 9);
        Assert.Equal(paddock.GetProperty("z").GetDouble(), access.GetProperty("z").GetDouble(), 9);
        Assert.Equal(345, -paddock.GetProperty("z").GetDouble(), 9);

        string webCircuit = File.ReadAllText(Path.Combine(root,
            "web/wwwroot/render/motorcycle/track_day_presentation.js"));
        string webRoad = File.ReadAllText(Path.Combine(root,
            "web/wwwroot/render/motorcycle/weekend_open_road_presentation.js"));
        string unityRoad = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendHinterlandRoadRenderer.cs"));
        Assert.Contains("-(point.z + normal.z * halfWidthM * side)", webCircuit);
        Assert.Contains("-(point.z + normal.z * road.pavedWidthM * 0.5 * side)", webRoad);
        Assert.Contains("(float)-northM", unityRoad);
        Assert.Contains("Reverse triangle winding once at the engine boundary", unityRoad);
        Assert.Contains("(triangles[triangle + 1], triangles[triangle + 2])", unityRoad);
        Assert.Contains("GunsOnly/WeekendRide/Circuit/WeekendCircuitParity", unityRoad);
        Assert.Contains("BuildRoadMaterial(profile)", unityRoad);
        Assert.Contains("BuildRoadsideMaterial(profile", unityRoad);
        Assert.DoesNotContain("Shader.Find(\"GunsOnly/WeekendOpenRoad\")", unityRoad);
    }

    [Fact]
    public void UnityConsumerIsFailClosedAndUsesRetainedWebGeometryInsteadOfRibbons() {
        string root = FindRepositoryRoot();
        string resource = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendCircuitPresentationResource.cs"));
        string renderer = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideCircuitRenderer.cs"));
        string bootstrap = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideBootstrap.cs"));
        string camera = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendParityCamera.cs"));
        Assert.Contains("ExpectedSemanticSha256", resource);
        Assert.Contains("ValidateRouteOrThrow", resource);
        Assert.Contains("route.centreline.Length != expected.centreline.Length", resource);
        Assert.Contains("foreach (WeekendCircuitLeafFrame leaf", renderer);
        Assert.Contains("MatrixFromThree", renderer);
        Assert.Contains("reverse triangle winding once", renderer);
        Assert.DoesNotContain("BuildRibbon", renderer);
        Assert.DoesNotContain("MakeStandard", renderer);
        Assert.Contains("WeekendOutputTransform", bootstrap);
        Assert.Contains("_camera.allowHDR = true", bootstrap);
        Assert.Contains("WeekendParityCamera.Attach(_camera)", bootstrap);
        Assert.Contains("UnityProjectionXSign = -1f", camera);
        Assert.Contains("GL.invertCulling = true", camera);
        Assert.Contains("WeekendRideGoldenPathHud.Attach(gameObject, _host)", bootstrap);
    }

    static string Canonical(JsonElement element, bool omitSemanticAtRoot = false) {
        return element.ValueKind switch {
            JsonValueKind.Object => "{" + string.Join(",", element.EnumerateObject()
                .Where(property => !omitSemanticAtRoot || property.Name != "semantic_sha256")
                .OrderBy(property => property.Name, StringComparer.Ordinal)
                .Select(property => JsonSerializer.Serialize(property.Name, CanonicalOptions) + ":"
                    + Canonical(property.Value))) + "}",
            JsonValueKind.Array => "[" + string.Join(",",
                element.EnumerateArray().Select(value => Canonical(value))) + "]",
            JsonValueKind.String => JsonSerializer.Serialize(element.GetString(), CanonicalOptions),
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "null",
            _ => throw new InvalidOperationException("Unsupported canonical JSON token"),
        };
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
