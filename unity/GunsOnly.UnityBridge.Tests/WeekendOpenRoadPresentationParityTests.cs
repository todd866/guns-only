using System.Security.Cryptography;
using System.Text.Json;

namespace GunsOnly.UnityBridge.Tests;

public sealed class WeekendOpenRoadPresentationParityTests {
    const string RoadContractSha256 =
        "1f4bb6f5c3f1cd6ecf56e112a3821a0b7375207ae1481e55d0ce9ddcb8b253bc";
    const string RoadSourceSha256 =
        "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713";
    const string GroundSourceSha256 =
        "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1";
    const string RoadsideAtlasSha256 =
        "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf";

    [Fact]
    public void ContractAndGeneratedArtStayByteExactAcrossCanonicalWebAndUnity() {
        string root = FindRepositoryRoot();
        AssertCopies(root, RoadContractSha256,
            "content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json",
            "web/wwwroot/content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
                + "weekend-hinterland-road-network-v1.json");
        AssertCopies(root, RoadSourceSha256,
            "content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp",
            "web/wwwroot/content/packs/weekend-ride/environment/textures/"
                + "track-asphalt-v1.webp",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/source/"
                + "track-asphalt-v1.webp.bytes");
        AssertCopies(root, GroundSourceSha256,
            "content/packs/weekend-ride/environment/textures/"
                + "weekend-hinterland-ground-v1.webp",
            "web/wwwroot/content/packs/weekend-ride/environment/textures/"
                + "weekend-hinterland-ground-v1.webp",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/source/"
                + "weekend-hinterland-ground-v1.webp.bytes");
        AssertCopies(root, RoadsideAtlasSha256,
            "content/packs/weekend-ride/environment/foliage/"
                + "weekend-roadside-atlas-v1.png",
            "web/wwwroot/content/packs/weekend-ride/environment/foliage/"
                + "weekend-roadside-atlas-v1.png",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
                + "weekend-roadside-atlas-v1.png");

        byte[] roadPng = File.ReadAllBytes(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
            + "track-asphalt-v1.png"));
        byte[] groundPng = File.ReadAllBytes(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
            + "weekend-hinterland-ground-v1.png"));
        Assert.Equal(
            "aad02149d421dec00aead62d27feb0570eb71c104482b1f24c0cd14826470db7",
            Sha256Hex(roadPng));
        Assert.Equal(
            "e2bc63c25d019392ca7d3bd3e9e9f01afdc4d7f13481e33f19c515336244f3d2",
            Sha256Hex(groundPng));
        Assert.Equal(1024, ReadBigEndianInt32(roadPng, 16));
        Assert.Equal(1024, ReadBigEndianInt32(roadPng, 20));
        Assert.Equal(1024, ReadBigEndianInt32(groundPng, 16));
        Assert.Equal(1024, ReadBigEndianInt32(groundPng, 20));
    }

    [Fact]
    public void ContractDeclaresLeftHandedAuthorityAndExplicitPortableSurfaceSemantics() {
        string root = FindRepositoryRoot();
        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root,
            "content/packs/weekend-ride/environment/roads/"
            + "weekend-hinterland-road-network.v1.json")));
        JsonElement contract = document.RootElement;
        Assert.Equal("left-handed-east-up-north-metres",
            contract.GetProperty("geometry").GetProperty("coordinate_system").GetString());
        Assert.Equal(0.065,
            contract.GetProperty("geometry").GetProperty("road_lift_m").GetDouble(), 9);
        Assert.Equal(24,
            contract.GetProperty("geometry").GetProperty("junction_radial_segments").GetInt32());
        Assert.Equal(12,
            contract.GetProperty("road_surface").GetProperty("metres_per_tile").GetDouble());
        Assert.Equal(160,
            contract.GetProperty("world_ground_surface")
                .GetProperty("metres_per_tile").GetDouble());
        Assert.Equal(144, contract.GetProperty("roadside_instances").GetArrayLength());
        Assert.True(contract.GetProperty("roadside_atlas")
            .GetProperty("presentation_only").GetBoolean());
        Assert.Equal(0.42, contract.GetProperty("roadside_atlas")
            .GetProperty("alpha_cutoff").GetDouble(), 9);
        Assert.Equal(new[] { "eucalyptus", "dry-grass", "sandstone", "scrub" },
            contract.GetProperty("roadside_atlas").GetProperty("regions")
                .EnumerateArray().Select(region => region.GetProperty("id").GetString()));
    }

    [Fact]
    public void WebAndUnityMapTheTopLeftAtlasContractWithoutSwappingRows() {
        string root = FindRepositoryRoot();
        string web = File.ReadAllText(Path.Combine(root,
            "web/wwwroot/render/motorcycle/weekend_open_road_presentation.js"));
        string unity = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendHinterlandRoadRenderer.cs"));

        Assert.Contains("roadsideAtlas.flipY = false", web);
        Assert.Contains("vBottom = region.vMinFromTop + region.vSize", web);
        Assert.Contains("vTop = region.vMinFromTop", web);
        Assert.Contains("region.v_min_from_top + region.v_size", unity);
        Assert.Contains("float vTop = (float)region.v_min_from_top", unity);
        Assert.Contains("(float)-northM", unity);
        Assert.Contains("(float)-leftNorthM", unity);

        string shader = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
            + "WeekendRoadsideCutout.shader"));
        Assert.Contains("1.0 - input.uv_MainTex.y", shader);

        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root,
            "content/packs/weekend-ride/environment/roads/"
            + "weekend-hinterland-road-network.v1.json")));
        string[,] fixture = {
            { "eucalyptus", "dry-grass" },
            { "scrub", "sandstone" },
        };
        foreach (JsonElement region in document.RootElement.GetProperty("roadside_atlas")
                     .GetProperty("regions").EnumerateArray()) {
            double centerU = region.GetProperty("u_min").GetDouble()
                + region.GetProperty("u_size").GetDouble() * 0.5;
            double logicalCenterV = region.GetProperty("v_min_from_top").GetDouble()
                + region.GetProperty("v_size").GetDouble() * 0.5;
            // Mesh bottom=vMax/top=vMin; the shader flips once at Unity's PNG sampler boundary.
            double unitySampleV = 1.0 - logicalCenterV;
            int topOriginRow = unitySampleV >= 0.5 ? 0 : 1;
            int column = centerU < 0.5 ? 0 : 1;
            Assert.Equal(region.GetProperty("id").GetString(),
                fixture[topOriginRow, column]);
        }
    }

    [Fact]
    public void UnityImportsMatchWebFilteringAndCutoutWithoutAlphaCoverageMutation() {
        string root = FindRepositoryRoot();
        foreach (string name in new[] {
            "track-asphalt-v1.png.meta",
            "weekend-hinterland-ground-v1.png.meta",
        }) {
            string meta = File.ReadAllText(Path.Combine(root,
                "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/", name));
            Assert.Contains("sRGBTexture: 1", meta);
            Assert.Contains("enableMipMap: 1", meta);
            Assert.Contains("mipMapsPreserveCoverage: 0", meta);
            Assert.Contains("filterMode: 2", meta);
            Assert.Contains("aniso: 8", meta);
            Assert.Contains("wrapU: 2", meta);
            Assert.Contains("wrapV: 2", meta);
            Assert.Contains("textureCompression: 0", meta);
            Assert.Contains("alphaIsTransparency: 0", meta);
        }
        string atlasMeta = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
            + "weekend-roadside-atlas-v1.png.meta"));
        Assert.Contains("sRGBTexture: 1", atlasMeta);
        Assert.Contains("enableMipMap: 1", atlasMeta);
        Assert.Contains("mipMapsPreserveCoverage: 0", atlasMeta);
        Assert.Contains("filterMode: 2", atlasMeta);
        Assert.Contains("wrapU: 1", atlasMeta);
        Assert.Contains("wrapV: 1", atlasMeta);
        Assert.Contains("alphaIsTransparency: 0", atlasMeta);

        string shader = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
            + "WeekendRoadsideCutout.shader"));
        Assert.Contains("alphatest:_Cutoff", shader);
        Assert.Contains("Cull Off", shader);
    }

    static void AssertCopies(string root, string expectedSha256, params string[] paths) {
        byte[]? first = null;
        foreach (string relative in paths) {
            string path = Path.Combine(root, relative);
            Assert.True(File.Exists(path), "missing Weekend parity asset " + path);
            byte[] bytes = File.ReadAllBytes(path);
            Assert.Equal(expectedSha256, Sha256Hex(bytes));
            if (first == null) first = bytes;
            else Assert.Equal(first, bytes);
        }
    }

    static int ReadBigEndianInt32(byte[] bytes, int offset) =>
        (bytes[offset] << 24)
        | (bytes[offset + 1] << 16)
        | (bytes[offset + 2] << 8)
        | bytes[offset + 3];

    static string Sha256Hex(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    static string FindRepositoryRoot() {
        string? directory = AppContext.BaseDirectory;
        for (int depth = 0; depth < 12 && directory != null; depth++) {
            if (File.Exists(Path.Combine(directory, "GunsOnly.sln"))) return directory;
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("Guns Only repository root not found");
    }
}
