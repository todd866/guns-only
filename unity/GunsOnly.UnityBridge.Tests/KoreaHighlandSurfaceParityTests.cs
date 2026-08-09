using System.Security.Cryptography;

namespace GunsOnly.UnityBridge.Tests;

public sealed class KoreaHighlandSurfaceParityTests {
    const string CanonicalSha256 =
        "d8f31ec00b96f70eba87ad85eaba70820e730d4d4f9de20178a3c976a5af84f3";
    const string RuntimePngSha256 =
        "a96478f89d203d674633434a0c715b65ab843eee0fbdd70da4ad17657f9ef401";

    [Fact]
    public void UnityEmbedsTheExactWebAssetBytes_AndDeterministicDecodedTexture() {
        string root = FindRepositoryRoot();
        string[] canonicalCopies = {
            Path.Combine(root,
                "content/packs/korea-1950s/environment/textures/korea-highland-ground-v1.webp"),
            Path.Combine(root,
                "web/wwwroot/content/packs/korea-1950s/environment/textures/"
                + "korea-highland-ground-v1.webp"),
            Path.Combine(root,
                "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/Korea1950s/source/"
                + "korea-highland-ground-v1.webp.bytes"),
        };
        foreach (string path in canonicalCopies) {
            Assert.True(File.Exists(path), "missing canonical surface " + path);
            Assert.Equal(CanonicalSha256, Sha256Hex(File.ReadAllBytes(path)));
        }

        string png = Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/Korea1950s/environment/textures/"
            + "korea-highland-ground-v1.png");
        byte[] bytes = File.ReadAllBytes(png);
        Assert.Equal(RuntimePngSha256, Sha256Hex(bytes));
        Assert.Equal(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, bytes[..8]);
        Assert.Equal(1024, ReadBigEndianInt32(bytes, 16));
        Assert.Equal(1024, ReadBigEndianInt32(bytes, 20));
    }

    [Fact]
    public void UnityShaderPreservesWebTriplanarAndPigmentSemantics() {
        string root = FindRepositoryRoot();
        string shader = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/Korea1950s/"
            + "KoreaHighlandTerrain.shader"));
        string binding = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/KoreaHighlandSurface.cs"));

        Assert.Contains("pow(abs(normal), 4.0)", shader);
        Assert.Contains("input.worldPosition.xz / _KoreaSurfaceScaleM", shader);
        Assert.Contains("input.worldPosition.zy / _KoreaSurfaceScaleM", shader);
        Assert.Contains("input.worldPosition.xy / _KoreaSurfaceScaleM", shader);
        Assert.Contains("authoredSurface / max(authoredLuma, 0.025)", shader);
        Assert.Contains("authoredLuma / 0.045", shader);
        Assert.Contains("lerp(1.0, authoredValue, 0.68)", shader);
        Assert.Contains("clamp(lumaMatched, sAlbedo * 0.64, sAlbedo * 1.38)", shader);
        Assert.Contains("lerp(sAlbedo, lumaMatched, 0.54)", shader);
        Assert.Contains("UnityTextureUv", shader);

        Assert.Contains("SurfaceScaleM = 7200f", binding);
        Assert.Contains("new(0.17f, -0.31f)", binding);
        Assert.Contains("new(-0.23f, 0.41f)", binding);
        Assert.Contains("new(0.37f, 0.11f)", binding);
        Assert.Contains("TextureWrapMode.Mirror", binding);
    }

    [Fact]
    public void KoreaStandInUsesTheAuthoredMaterialInsteadOfRuntimeAlbedoNoise() {
        string root = FindRepositoryRoot();
        string source = File.ReadAllText(Path.Combine(root,
            "unity/GunsOnly.Unity/Assets/Scripts/KoreaTerrainStandIn.cs"));
        Assert.Contains("KoreaHighlandSurface.CreateMaterial()", source);
        Assert.DoesNotContain("KoreaAlbedoDetail", source);
        Assert.DoesNotContain("new Texture2D", source);
        Assert.DoesNotContain("Shader.Find(\"Standard\")", source);
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
