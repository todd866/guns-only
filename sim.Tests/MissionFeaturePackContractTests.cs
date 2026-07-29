using System.Security.Cryptography;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class MissionFeaturePackContractTests {
    [Fact]
    public void HeroCellSelectsTheByteStableUnassessedClinicPack() {
        string repositoryRoot = TestRepository.Root;
        string relativePack = Path.Combine(
            "packs", "ukraine-modern", "environment", "hero-cells",
            "soniachne-clinic-a.feature-pack.json");
        string canonicalPath = Path.Combine(repositoryRoot, "content", relativePack);
        string webPath = Path.Combine(repositoryRoot, "web", "wwwroot", "content", relativePack);
        byte[] canonical = File.ReadAllBytes(canonicalPath);
        byte[] web = File.ReadAllBytes(webPath);

        Assert.Equal(canonical, web);
        string digest = Convert.ToHexString(SHA256.HashData(canonical)).ToLowerInvariant();
        Assert.Equal(Ukraine2030sTheatre.HeroFeaturePackSha256, digest);

        using JsonDocument document = JsonDocument.Parse(canonical);
        JsonElement root = document.RootElement;
        Assert.Equal(Ukraine2030sTheatre.HeroFeaturePackId,
            root.GetProperty("featurePackId").GetString());
        Assert.Equal(Ukraine2030sTheatre.TheatreId,
            root.GetProperty("theatre").GetProperty("theatreId").GetString());
        Assert.Equal(Ukraine2030sTheatre.TerrainProfileId,
            root.GetProperty("theatre").GetProperty("terrainId").GetString());
        Assert.Equal("presentation_only",
            root.GetProperty("authority").GetProperty("mode").GetString());
        Assert.Equal("none",
            root.GetProperty("authority").GetProperty("landingZoneAuthority").GetString());

        JsonElement landingZone = Assert.Single(
            root.GetProperty("landingZones").EnumerateArray());
        Assert.Equal("unassessed", landingZone.GetProperty("status").GetString());
        Assert.False(landingZone.GetProperty("safeApproachClaimed").GetBoolean());
        Assert.False(landingZone.GetProperty("medicalCapabilityClaimed").GetBoolean());
        Assert.False(landingZone.GetProperty("operationalUseAuthorized").GetBoolean());
        foreach (JsonElement feature in root.GetProperty("features").EnumerateArray()) {
            Assert.False(feature.GetProperty("targetable").GetBoolean());
            Assert.True(feature.GetProperty("presentationOnly").GetBoolean());
        }
    }

    [Fact]
    public void BrowserPublishesTheSameMissionFeatureSchema() {
        string repositoryRoot = TestRepository.Root;
        string canonicalPath = Path.Combine(
            repositoryRoot, "content", "schemas", "mission-feature-pack.schema.json");
        string webPath = Path.Combine(
            repositoryRoot, "web", "wwwroot", "content", "schemas",
            "mission-feature-pack.schema.json");

        Assert.Equal(File.ReadAllBytes(canonicalPath), File.ReadAllBytes(webPath));
    }

    [Fact]
    public void RapierCorridorSelectsTheByteStableStripExclusionPack() {
        string repositoryRoot = TestRepository.Root;
        string relativePack = Path.Combine(
            "packs", "ukraine-modern", "environment", "hero-cells",
            "rapier-eastern-strip.feature-pack.json");
        string canonicalPath = Path.Combine(repositoryRoot, "content", relativePack);
        string webPath = Path.Combine(repositoryRoot, "web", "wwwroot", "content", relativePack);
        byte[] canonical = File.ReadAllBytes(canonicalPath);
        byte[] web = File.ReadAllBytes(webPath);

        Assert.Equal(canonical, web);
        string digest = Convert.ToHexString(SHA256.HashData(canonical)).ToLowerInvariant();
        Assert.Equal(Ukraine2030sTheatre.RapierStripFeaturePackSha256, digest);
        Assert.Equal(Ukraine2030sTheatre.RapierStripFeaturePackId,
            Ukraine2030sTheatre.RapierCorridor.MissionFeaturePackId);
        Assert.True(Ukraine2030sTheatre.RapierCorridor.MissionFeaturePackRequired);

        using JsonDocument document = JsonDocument.Parse(canonical);
        JsonElement root = document.RootElement;
        Assert.Equal(Ukraine2030sTheatre.RapierStripFeaturePackId,
            root.GetProperty("featurePackId").GetString());
        Assert.Equal("presentation_only",
            root.GetProperty("authority").GetProperty("mode").GetString());
        Assert.NotEmpty(root.GetProperty("ambientExclusionZones").EnumerateArray());
        foreach (JsonElement feature in root.GetProperty("features").EnumerateArray()) {
            Assert.False(feature.GetProperty("targetable").GetBoolean());
            Assert.True(feature.GetProperty("presentationOnly").GetBoolean());
        }
    }

    [Fact]
    public void SoniachneHeroPackIncludesVillageEdgeSilhouettes() {
        string repositoryRoot = TestRepository.Root;
        string path = Path.Combine(
            repositoryRoot, "content", "packs", "ukraine-modern", "environment",
            "hero-cells", "soniachne-clinic-a.feature-pack.json");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(path));
        int villageEdge = document.RootElement.GetProperty("features").EnumerateArray()
            .Count(feature => feature.GetProperty("role").GetString()
                ?.StartsWith("village_edge", StringComparison.Ordinal) == true);
        Assert.True(villageEdge >= 4,
            "Ship follow-on: clinic meadow must include village-edge cottages along the east road");
        Assert.Equal("1.1.0", document.RootElement.GetProperty("packVersion").GetString());
    }
}
