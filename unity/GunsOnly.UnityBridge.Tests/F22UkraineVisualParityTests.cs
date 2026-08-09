using System.Security.Cryptography;

namespace GunsOnly.UnityBridge.Tests;

public sealed class F22UkraineVisualParityTests {
    [Fact]
    public void CanonicalWebAndUnityCopiesStayByteExact() {
        string root = FindRepositoryRoot();
        string[] paintCopies = {
            Path.Combine(root,
                "content/packs/ukraine-modern/environment/textures/"
                + "ukraine-temperate-ground-v2.webp"),
            Path.Combine(root,
                "web/wwwroot/content/packs/ukraine-modern/environment/textures/"
                + "ukraine-temperate-ground-v2.webp"),
            Path.Combine(root,
                "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/source/"
                + "ukraine-temperate-ground-v2.webp.bytes"),
        };
        foreach (string path in paintCopies) {
            Assert.True(File.Exists(path), "missing canonical Ukraine paint " + path);
            Assert.Equal(
                F22UkraineVisualContract.RegionalPaintSha256,
                Sha256Hex(File.ReadAllBytes(path)));
        }

        string[] manifestCopies = {
            Path.Combine(root,
                "content/packs/ukraine-modern/environment/textures/"
                + "rapier-art-manifest.v1.json"),
            Path.Combine(root,
                "web/wwwroot/content/packs/ukraine-modern/environment/textures/"
                + "rapier-art-manifest.v1.json"),
            Path.Combine(root,
                "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/"
                + "environment/textures/rapier-art-manifest.v1.json"),
        };
        foreach (string path in manifestCopies) {
            Assert.True(File.Exists(path), "missing Ukraine art manifest " + path);
            Assert.Equal(
                F22UkraineVisualContract.ArtManifestSha256,
                Sha256Hex(File.ReadAllBytes(path)));
        }

        string runtimePng = Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/"
            + "environment/textures/ukraine-temperate-ground-v2.png");
        byte[] png = File.ReadAllBytes(runtimePng);
        Assert.Equal(F22UkraineVisualContract.RuntimePngSha256, Sha256Hex(png));
        Assert.Equal(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, png[..8]);
        Assert.Equal(1024, ReadBigEndianInt32(png, 16));
        Assert.Equal(1024, ReadBigEndianInt32(png, 20));
    }

    [Fact]
    public void UnityImportAndBindingKeepTheWebTextureSemantics() {
        string root = FindRepositoryRoot();
        string meta = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/"
            + "environment/textures/ukraine-temperate-ground-v2.png.meta"));
        Assert.Contains("sRGBTexture: 1", meta);
        Assert.Contains("enableMipMap: 1", meta);
        Assert.Contains("mipMapsPreserveCoverage: 0", meta);
        Assert.Contains("filterMode: 2", meta);
        Assert.Contains("aniso: 8", meta);
        Assert.Contains("wrapU: 2", meta);
        Assert.Contains("wrapV: 2", meta);
        Assert.Contains("textureCompression: 0", meta);
        Assert.Contains("alphaIsTransparency: 0", meta);

        string binding = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/KoreaHighlandSurface.cs"));
        Assert.Contains("Presentation.F22UkraineCombat", binding);
        Assert.Contains("UkraineTextureResourcePath", binding);
        Assert.Contains("TextureWrapMode.Mirror", binding);
        Assert.Contains("_UkraineCombatPresentation", binding);
        Assert.Contains("ApplyF22UkraineAltitude", binding);
    }

    [Fact]
    public void FrozenHeroPigmentMathMatchesTheAcceptedWebOracle() {
        var rewild = new LinearRgb(0.23f, 0.45f, 0.12f);
        var authored = new LinearRgb(0.08f, 0.12f, 0.05f);
        LinearRgb result = F22UkraineVisualContract.BlendAuthoredHero(
            rewild, authored, 0.8f, 0.5f);

        Assert.InRange(result.R, 0.2457193f, 0.2457213f);
        Assert.InRange(result.G, 0.4433395f, 0.4433415f);
        Assert.InRange(result.B, 0.1366642f, 0.1366662f);
        Assert.Equal(1f, F22UkraineVisualContract.TerrainDetail01(2500f), 6);
        Assert.Equal(0.5f, F22UkraineVisualContract.TerrainDetail01(5000f), 6);
        Assert.Equal(0f, F22UkraineVisualContract.TerrainDetail01(7500f), 6);
        Assert.Equal(0.5f, F22UkraineVisualContract.SkyAltitudeMix(10250f), 6);
        Assert.Equal(0.72f, F22UkraineVisualContract.TerrainHeroBlend);
        Assert.Equal(0.72f, F22UkraineVisualContract.TerrainAlbedoScalar);
        Assert.Equal(0.62f, F22UkraineVisualContract.SkySunPresentation);
    }

    [Fact]
    public void RetainedShadersContainTheFrozenWebTerrainAndSkyConstants() {
        string root = FindRepositoryRoot();
        string terrain = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/Korea1950s/"
            + "KoreaHighlandTerrain.shader"));
        string[] terrainTokens = {
            "input.worldPosition.xz * (1.0 / 9200.0)",
            "+ float2(-0.27, 0.18)",
            "clamp(dot(rewildCover, LUMA), 0.075, 0.34)",
            "authoredHeroLuma / 0.089, 0.58, 1.42",
            "lerp(1.0, authoredHeroValue, 0.58)",
            "rewildFloor * _TerrainDetail01 * 0.72",
            "input.worldPosition.xz * (1.0 / 160000.0)",
            "+ float2(0.19, -0.37)",
            "sAlbedo *= 0.72",
        };
        foreach (string token in terrainTokens) Assert.Contains(token, terrain);

        string sky = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/"
            + "F22UkraineCombatSky.shader"));
        string[] skyTokens = {
            "float3(0.34, 0.38, 0.32)",
            "float3(0.18, 0.26, 0.34)",
            "float3(0.035, 0.105, 0.34)",
            "float3(0.018, 0.052, 0.16)",
            "lerp(0.18, 0.13, altitudeMix)",
            "horizonWarmCombat * 1.14",
            "float sunPresentation = 0.62",
            "exp(direction.y * 34.0)",
        };
        foreach (string token in skyTokens) Assert.Contains(token, sky);
    }

    [Fact]
    public void FirstMergeAloneSelectsTheUkraineCombatPresentation() {
        string root = FindRepositoryRoot();
        string firstMerge = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/FirstMergeBootstrap.cs"));
        string lowAltitudeWorld = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/F22UkraineLowAltitudeWorld.cs"));
        Assert.Contains("F22UkraineLowAltitudeWorld.Build(transform)", firstMerge);
        Assert.Contains("KoreaHighlandSurface.Presentation.F22UkraineCombat", lowAltitudeWorld);
        Assert.Contains("F22UkraineVisualContract.SunIntensity", firstMerge);
        Assert.Contains("F22UkraineVisualContract.HemisphereIntensity", firstMerge);
        Assert.Contains("F22UkraineVisualContract.ToneMappingExposure", firstMerge);

        string output = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/F22OutputTransform.cs"));
        Assert.Contains("F22UkraineVisualContract.ToneMappingExposure", output);

        string cobra = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/CobraCanyonBootstrap.cs"));
        Assert.DoesNotContain("F22UkraineVisualContract", cobra);
        string rapier = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/RapierBeat12Bootstrap.cs"));
        Assert.DoesNotContain("F22UkraineVisualContract", rapier);
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
            if (File.Exists(Path.Combine(directory, "global.json"))
                && Directory.Exists(Path.Combine(directory, "unity/GunsOnly.Unity"))) {
                return directory;
            }
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("guns-only repository root not found");
    }
}
