using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public class UkraineTerrainTruthTests {
    const string DetailResource = "GunsOnly.Web.Data.UkraineRapierSite.truth";
    const string RegionalResource = "GunsOnly.Web.Data.UkraineRapierRange.truth";
    const string ManifestResource = "GunsOnly.Web.Data.UkraineRapierRange.manifest.json";
    const string ProvenanceResource = "GunsOnly.Web.Data.UkraineRapierRange.provenance.json";

    [Fact]
    public void KernelLoadsTheRealAtlasBoundsAndIsReplayDeterministic() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        ITerrainSurface replay = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());

        Assert.Equal(new TerrainBounds(
            -376_832.0, 40_960.0, -212_992.0, 196_608.0), terrain.Bounds);
        Assert.Equal(32.0, terrain.HorizontalResolutionM);
        Assert.True(terrain.TrySample(2_375.0, -1_690.0, out TerrainSample first));
        Assert.True(replay.TrySample(2_375.0, -1_690.0, out TerrainSample second));
        Assert.Equal(first, second);
        Assert.False(terrain.TrySample(41_216.0, 0.0, out _));
    }

    [Fact]
    public void AtlasContainsEveryAuthoredRaidTrackWithTerrainClearance() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        BeatSetup beat = Beats.DroneRaidDefense();

        Assert.True(terrain.TrySample(
            beat.Player.Position.X,
            beat.Player.Position.Z,
            out TerrainSample playerGround));
        Assert.True(beat.Player.Position.Y - playerGround.HeightM > 250.0);

        foreach (AircraftState target in beat.DroneRaid!.Targets) {
            Assert.True(terrain.TrySample(
                target.Position.X,
                target.Position.Z,
                out TerrainSample ground));
            Assert.True(target.Position.Y - ground.HeightM > 100.0);
            double trackClearanceM = TerrainQueries.MinimumClearanceM(
                terrain,
                target.Position,
                new Vec3D(0.0, target.Position.Y, 0.0),
                maximumHorizontalStepM: 25.0);
            Assert.True(trackClearanceM > 100.0,
                $"raid track clearance was only {trackClearanceM:F1} m");
        }
    }

    [Fact]
    public void RegionalAtlasCoversTheRapierInterceptRouteWithoutTheProductionApron() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        BeatSetup beat = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);
        Vec3D outbound = strip.Fwd;
        double contactAlongM = (beat.Bandit.Position - strip.Position).Dot(outbound);
        double authoredRouteM = Math.Min(
            contactAlongM,
            strip.Position.X - terrain.Bounds.MinimumEastM);

        Assert.True(contactAlongM > 0.0);
        for (double alongM = 0.0; alongM <= authoredRouteM; alongM += 5_000.0) {
            Vec3D point = strip.Position + outbound * alongM;
            Assert.True(terrain.TrySample(point.X, point.Z, out TerrainSample ground),
                $"missing atlas terrain at {alongM / 1000.0:F0} km outbound");
            Assert.True(beat.Bandit.Position.Y - ground.HeightM > 11_000.0);
        }
        Assert.True(terrain.TrySample(
            beat.Bandit.Position.X,
            beat.Bandit.Position.Z,
            out TerrainSample authoredContactGround));

        var productionTerrain = new TrainingTerrainApronSurface(
            terrain,
            marginM: 400_000.0,
            flatHeightM: 78.0,
            transitionM: 8_000.0);
        Assert.True(productionTerrain.TrySample(
            beat.Bandit.Position.X,
            beat.Bandit.Position.Z,
            out TerrainSample contactGround));
        Assert.Equal(authoredContactGround, contactGround);
    }

    [Fact]
    public void F22RecoveryRunwayStillFollowsTheAtlasTerrainDatum() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        RecoveryPlan plan = Assert.IsType<RecoveryPlan>(
            Beats.ModernVisualMerge().RecoveryPlan);
        ConventionalRunwayGeometry runway =
            Assert.IsType<ConventionalRunwayGeometry>(plan.ConventionalRunway);

        Assert.True(terrain.TrySample(
            runway.ThresholdPosition.X,
            runway.ThresholdPosition.Z,
            out TerrainSample thresholdGround));
        Assert.Equal(TerrainSurfaceKind.Land, thresholdGround.Kind);
        Assert.Equal(runway.ElevationM, plan.Position.Y, precision: 8);

        Vec3D forward = runway.RolloutDirection;
        Vec3D right = new(forward.Z, 0.0, -forward.X);
        for (double alongM = 0.0; alongM <= runway.LengthM; alongM += 25.0)
        foreach (double crossM in new[] {
            -runway.WidthM * 0.5,
            0.0,
            runway.WidthM * 0.5,
        }) {
            Vec3D pavement = runway.ThresholdPosition
                + forward * alongM
                + right * crossM;
            Assert.True(terrain.TrySample(
                pavement.X,
                pavement.Z,
                out TerrainSample ground));
            Assert.Equal(TerrainSurfaceKind.Land, ground.Kind);
            Assert.InRange(
                runway.ElevationM - ground.HeightM,
                0.2,
                1.9);
        }
    }

    [Fact]
    public void RapierUsesActualMinus70MetreLaneAndClearsRailSpanAndReleasePath() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        BeatSetup beat = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);
        var launcher = new CatapultLaunchModel(
            beat.CatapultStrokeM!.Value,
            beat.CatapultEndSpeedMps!.Value,
            beat.CatapultRampAngleRad!.Value,
            beat.CatapultCrossOffsetM!.Value);

        Assert.Equal(-70.0, launcher.CrossOffsetM);
        Assert.Equal(RapierLaunchSite.OperatingSurfaceElevationM, strip.Position.Y);
        Assert.Equal(RapierLaunchSite.AircraftSupportReferenceHeightM,
            strip.AircraftSupportReferenceHeightM);
        Assert.Equal(417.487, launcher.RampFlatLengthM, precision: 3);
        Assert.Equal(102.513, launcher.RampArcLengthM, precision: 3);
        Assert.Equal(489.464, launcher.RampArcRadiusM, precision: 3);
        Assert.Equal(10.696, launcher.RampRiseM, precision: 3);

        Vec3D start = strip.ShipPoint(
            CatapultLaunchModel.StartAlongM, launcher.CrossOffsetM);
        Assert.True(terrain.TrySample(start.X, start.Z, out TerrainSample startGround));
        Assert.Equal(188.1921875, startGround.HeightM, precision: 7);

        LaunchTerrainClearanceAssessment assessment = launcher.AssessTerrainClearance(
            strip, terrain, RapierLaunchSite.AircraftHalfSpanM);
        Assert.True(assessment.TerrainAvailable);
        Assert.True(assessment.Safe, assessment.Reason);
        Assert.Equal(261, assessment.Samples);
        Assert.True(assessment.MinimumRailClearanceM
            >= RapierLaunchSite.MinimumConstructionSeparationM);
        Assert.True(assessment.MinimumReleaseClearanceM
            > assessment.MinimumRailClearanceM);
    }

    [Fact]
    public void EmbeddedTruthHashesAndManifestDeclareOneAtlasAuthority() {
        Assert.Equal(
            "88c3ceb178400c7a59c8960ff55a5f888e180651dd79b28119870aed5419715f",
            ResourceSha256(RegionalResource));
        Assert.Equal(
            "ae3f377f360a81e3fc4482d6bc8410190968da69749c5333f038e1d99aa07908",
            ResourceSha256(DetailResource));

        using JsonDocument manifest = ReadJsonResource(ManifestResource);
        JsonElement truth = manifest.RootElement.GetProperty("simulationTruth");
        Assert.Equal("derived-from-the-same-quantized-atlas-records",
            truth.GetProperty("authority").GetString());
        Assert.Equal(ResourceSha256(RegionalResource),
            truth.GetProperty("regional").GetProperty("sha256").GetString());
        Assert.Equal(ResourceSha256(DetailResource),
            truth.GetProperty("detail").GetProperty("sha256").GetString());

        using JsonDocument provenance = ReadJsonResource(ProvenanceResource);
        Assert.Equal(manifest.RootElement.GetProperty("terrainId").GetString(),
            provenance.RootElement.GetProperty("sourceAtlasManifest")
                .GetProperty("terrainId").GetString());
        Assert.Equal(2_390,
            provenance.RootElement.GetProperty("outputs").GetProperty("regional")
                .GetProperty("sourceRecordCount").GetInt32());
    }

    [Fact]
    public void FinestAtlasRecordsMeetTheirCoarsestLodWithoutAHeightSeam() {
        ITerrainSurface detail = Assert.IsAssignableFrom<ITerrainSurface>(
            PackedTerrainTruth.Load(DetailResource, "Rapier atlas detail"));
        ITerrainSurface regional = Assert.IsAssignableFrom<ITerrainSurface>(
            PackedTerrainTruth.Load(RegionalResource, "Rapier atlas regional"));

        foreach (double edgeM in new[] { -8_192.0, 8_192.0 })
        foreach (double alongM in Enumerable.Range(0, 65)
            .Select(index => -8_192.0 + index * 256.0)) {
            AssertTerrainSeam(detail, regional, edgeM, alongM);
            AssertTerrainSeam(detail, regional, alongM, edgeM);
        }
    }

    static string ResourceSha256(string resourceName) {
        using Stream stream = Assert.IsAssignableFrom<Stream>(
            Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName));
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    static JsonDocument ReadJsonResource(string resourceName) {
        using Stream stream = Assert.IsAssignableFrom<Stream>(
            Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName));
        return JsonDocument.Parse(stream);
    }

    static void AssertTerrainSeam(ITerrainSurface detail, ITerrainSurface regional,
        double eastM, double northM) {
        Assert.True(detail.TrySample(eastM, northM, out TerrainSample detailSample));
        Assert.True(regional.TrySample(eastM, northM, out TerrainSample regionalSample));
        Assert.Equal(detailSample.HeightM, regionalSample.HeightM, precision: 8);
    }
}
