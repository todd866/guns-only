using System.Security.Cryptography;
using System.Text.Json;

namespace GunsOnly.UnityBridge.Tests;

public sealed class F22UkraineLowAltitudeWorldParityTests {
    const string TerrainSha =
        "ae3f377f360a81e3fc4482d6bc8410190968da69749c5333f038e1d99aa07908";
    const string FoliageSha =
        "9172d362a64332cb87535359b2ed9553db28fb01628de909196446ff34ccfec4";
    const string FoliageManifestSha =
        "d9a2ff59a5c9d2e54c6696c121befe7f8f7b4fa68599e975a14e747c8ce61e77";
    const string ContractSha =
        "7a5abfaaca1ab1ab91752ac669dfb0da236726d9e5586b811c48366b533b26be";

    [Fact]
    public void ExactTerrainFoliageAndPlacementCopiesRemainByteLocked() {
        string root = FindRepositoryRoot();
        string[] terrainCopies = {
            "content/packs/ukraine-modern/environment/terrain-atlas/rapier-site.kernel.truth",
            "web/wwwroot/content/packs/ukraine-modern/environment/terrain-atlas/"
                + "rapier-site.kernel.truth",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/environment/terrain/"
                + "rapier-site.kernel.truth.bytes",
        };
        Assert.All(terrainCopies, relative =>
            Assert.Equal(TerrainSha, Sha256Hex(File.ReadAllBytes(Path.Combine(root, relative)))));

        string[] foliageCopies = {
            "content/packs/ukraine-modern/environment/foliage/ukraine-temperate-foliage-v1.png",
            "web/wwwroot/content/packs/ukraine-modern/environment/foliage/"
                + "ukraine-temperate-foliage-v1.png",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/environment/foliage/"
                + "ukraine-temperate-foliage-v1.png",
        };
        Assert.All(foliageCopies, relative =>
            Assert.Equal(FoliageSha, Sha256Hex(File.ReadAllBytes(Path.Combine(root, relative)))));

        string[] foliageManifestCopies = {
            "content/packs/ukraine-modern/environment/foliage/ukraine-foliage-art-manifest.v1.json",
            "web/wwwroot/content/packs/ukraine-modern/environment/foliage/"
                + "ukraine-foliage-art-manifest.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/environment/foliage/"
                + "ukraine-foliage-art-manifest.v1.json",
        };
        Assert.All(foliageManifestCopies, relative => Assert.Equal(
            FoliageManifestSha,
            Sha256Hex(File.ReadAllBytes(Path.Combine(root, relative)))));

        string[] contractCopies = {
            "content/packs/ukraine-modern/presentation/"
                + "f22-low-altitude-world.web-build-299.v1.json",
            "web/wwwroot/content/packs/ukraine-modern/presentation/"
                + "f22-low-altitude-world.web-build-299.v1.json",
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/presentation/"
                + "f22-low-altitude-world.web-build-299.v1.json",
        };
        Assert.All(contractCopies, relative => Assert.Equal(
            ContractSha,
            Sha256Hex(File.ReadAllBytes(Path.Combine(root, relative)))));
    }

    [Fact]
    public void ContractFreezesTheWebStartCellAndExactSourceCoordinateMapping() {
        string root = FindRepositoryRoot();
        string contractPath = Path.Combine(root,
            "content/packs/ukraine-modern/presentation/"
            + "f22-low-altitude-world.web-build-299.v1.json");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(contractPath));
        JsonElement value = document.RootElement;
        Assert.Equal(
            "presentation.ukraine-modern.f22-low-altitude.web-build-299.v1",
            value.GetProperty("presentationId").GetString());
        Assert.Equal(TerrainSha,
            value.GetProperty("terrain").GetProperty("sha256").GetString());
        Assert.Equal(FoliageSha,
            value.GetProperty("foliageAtlas").GetProperty("sha256").GetString());
        Assert.Equal(0.38, value.GetProperty("foliageAtlas")
            .GetProperty("alphaCutoff").GetDouble(), 6);
        Assert.Equal(new[] { "east", "up", "-north" }, value
            .GetProperty("coordinateFrame")
            .GetProperty("unityMapping")
            .EnumerateArray()
            .Select(item => item.GetString())
            .ToArray());
        JsonElement counts = value.GetProperty("counts");
        Assert.Equal(4, counts.GetProperty("chunks").GetInt32());
        Assert.Equal(2448, counts.GetProperty("trees").GetInt32());
        Assert.Equal(224, counts.GetProperty("buildings").GetInt32());
        Assert.Equal(510, counts.GetProperty("roadSegments").GetInt32());
        Assert.All(value.GetProperty("chunks").EnumerateArray(), chunk => {
            JsonElement source = chunk.GetProperty("sourceRecord");
            Assert.Equal(0, source.GetProperty("level").GetInt32());
            Assert.Equal(257, source.GetProperty("sampleCount").GetInt32());
            Assert.Equal(32, source.GetProperty("spacingM").GetDouble(), 6);
        });
    }

    [Fact]
    public void UnityConsumerUsesExactTerrainMathAndOnlyFirstMergeAttachesIt() {
        string root = FindRepositoryRoot();
        string world = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/F22UkraineLowAltitudeWorld.cs"));
        string firstMerge = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/FirstMergeBootstrap.cs"));
        string cobra = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/CobraCanyonBootstrap.cs"));
        string rapier = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/RapierBeat12Bootstrap.cs"));
        string weekend = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideBootstrap.cs"));

        string[] exactTokens = {
            "TerrainTruth.Decode",
            "CreateExactTerrainTile",
            "SmoothedWebNormals",
            "WebLandcoverColor",
            "sourceEastM",
            "-sourceNorthM",
            "BuildFoliage",
            "BuildStructuresAndRoutes",
            "FarFallbackHalfSpanM = 64000f",
        };
        Assert.All(exactTokens, token => Assert.Contains(token, world));
        Assert.Contains("F22UkraineLowAltitudeWorld.Build(transform)", firstMerge);
        Assert.DoesNotContain("KoreaTerrainStandIn.Build(", firstMerge);
        Assert.DoesNotContain("F22UkraineLowAltitudeWorld", cobra);
        Assert.DoesNotContain("F22UkraineLowAltitudeWorld", rapier);
        Assert.DoesNotContain("F22UkraineLowAltitudeWorld", weekend);
    }

    [Fact]
    public void FoliageImportAndShaderRetainWebAlphaUvFogAndLightSemantics() {
        string root = FindRepositoryRoot();
        string meta = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/environment/foliage/"
            + "ukraine-temperate-foliage-v1.png.meta"));
        string[] importTokens = {
            "enableMipMap: 1",
            "sRGBTexture: 1",
            "mipMapsPreserveCoverage: 0",
            "alphaTestReferenceValue: 0.38",
            "filterMode: 2",
            "wrapU: 1",
            "wrapV: 1",
            "textureCompression: 0",
            "alphaIsTransparency: 0",
        };
        Assert.All(importTokens, token => Assert.Contains(token, meta));

        string shader = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/"
            + "F22UkraineFoliage.shader"));
        string[] shaderTokens = {
            "1.0 - input.authoredUv.y",
            "clip(atlas.a - _Cutoff)",
            "SHADOW_ATTENUATION(input)",
            "_AtmosphereHazeMix",
            "distanceToCamera * distanceToCamera",
            "\"LightMode\"=\"ShadowCaster\"",
        };
        Assert.All(shaderTokens, token => Assert.Contains(token, shader));
    }

    [Fact]
    public void NativeNinetyMetreCaptureIsExplicitAndCannotChangeNormalGoldenPath() {
        string root = FindRepositoryRoot();
        string world = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/F22UkraineLowAltitudeWorld.cs"));
        string bootstrap = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/FirstMergeBootstrap.cs"));
        Assert.Contains("--f22-low-altitude-qa", world);
        Assert.Contains("surfaceM + 90f", world);
        Assert.Contains("NativeQaCaptureEnabled", bootstrap);
        Assert.Contains("/tmp/guns-only-f22-low-altitude-90m.png", bootstrap);
        Assert.Contains("FirstMergeGoldenPath.Resolve", bootstrap);
    }

    static string Sha256Hex(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    static string FindRepositoryRoot() {
        string? directory = AppContext.BaseDirectory;
        for (int depth = 0; depth < 12 && directory != null; depth++) {
            if (File.Exists(Path.Combine(directory, "global.json"))
                && Directory.Exists(Path.Combine(directory, "unity/GunsOnly.Unity"))) {
                return directory;
            }
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("guns-only repository root not found");
    }
}
