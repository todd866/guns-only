using System.Reflection;
using System.Security.Cryptography;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public class UkraineTerrainTruthTests {
    [Fact]
    public void NestedTheatreIsDeterministicAndContainsEveryAuthoredRaidTrack() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        ITerrainSurface replay = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());

        Assert.Equal(new TerrainBounds(-131_072.0, 131_072.0, -131_072.0, 131_072.0),
            terrain.Bounds);
        Assert.Equal(32.0, terrain.HorizontalResolutionM);

        BeatSetup beat = Beats.DroneRaidDefense();
        Assert.True(terrain.TrySample(beat.Player.Position.X, beat.Player.Position.Z,
            out TerrainSample playerGround));
        Assert.True(beat.Player.Position.Y - playerGround.HeightM > 250.0);

        foreach (AircraftState target in beat.DroneRaid!.Targets) {
            Assert.True(terrain.TrySample(target.Position.X, target.Position.Z,
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

        Assert.True(terrain.TrySample(2_375.0, -1_690.0, out TerrainSample first));
        Assert.True(replay.TrySample(2_375.0, -1_690.0, out TerrainSample second));
        Assert.Equal(first, second);
    }

    [Fact]
    public void RegionalTruthContainsTheCompleteRapierRouteAndFictionalCoast() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        BeatSetup beat = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);

        Assert.True(terrain.TrySample(beat.Player.Position.X, beat.Player.Position.Z,
            out TerrainSample launchGround));
        Assert.Equal(TerrainSurfaceKind.Land, launchGround.Kind);
        Assert.Equal(2.5, strip.Position.Y - launchGround.HeightM, precision: 6);

        Vec3D launcherStart = strip.ShipPoint(
            CatapultLaunchModel.StartAlongM, CatapultLaunchModel.CatapultCrossM);
        Vec3D launcherEnd = strip.ShipPoint(
            CatapultLaunchModel.StartAlongM + 520.0,
            CatapultLaunchModel.CatapultCrossM);
        Assert.True(terrain.TrySample(launcherStart.X, launcherStart.Z,
            out TerrainSample launcherStartGround));
        Assert.True(terrain.TrySample(launcherEnd.X, launcherEnd.Z,
            out TerrainSample launcherEndGround));
        Assert.Equal(TerrainSurfaceKind.Land, launcherStartGround.Kind);
        Assert.Equal(TerrainSurfaceKind.Land, launcherEndGround.Kind);
        Assert.True(strip.Position.Y > launcherStartGround.HeightM);
        Assert.True(strip.Position.Y > launcherEndGround.HeightM);

        // The route now deliberately runs BEYOND the authored regional cell: a realistic deep
        // intercept was judged to matter more than staying inside the map. Walk the portion the
        // cell is responsible for along the strip outbound axis (west for eastern home plate).
        Vec3D outbound = strip.Fwd;
        double contactAlongM = (beat.Bandit.Position - strip.Position).Dot(outbound);
        double authoredRouteM = System.Math.Min(System.Math.Max(0.0, contactAlongM), 120_000.0);
        for (double alongM = 0.0; alongM <= authoredRouteM; alongM += 5_000.0) {
            double eastM = strip.Position.X + outbound.X * alongM;
            double northM = strip.Position.Z + outbound.Z * alongM;
            Assert.True(terrain.TrySample(eastM, northM, out TerrainSample routeGround));
            Assert.Equal(TerrainSurfaceKind.Land, routeGround.Kind);
            Assert.True(beat.Bandit.Position.Y - routeGround.HeightM > 11_000.0);
        }
        // The merge itself is now past the authored cell by design. This file owns the regional
        // truth, and the truth's own edge is the honest thing to assert: beyond it the runtime
        // wraps the surface in TrainingTerrainApronSurface, and the apron - a flat dirt playing
        // field at the 78 m datum - is what carries the rest of the route.
        Assert.False(terrain.TrySample(beat.Bandit.Position.X, beat.Bandit.Position.Z, out _));

        Assert.True(terrain.TrySample(20_000.0, 0.0, out TerrainSample regionalGround));
        Assert.NotEqual(78.0, regionalGround.HeightM);
        Assert.True(terrain.TrySample(-100_000.0, -100_000.0,
            out TerrainSample coastalWater));
        Assert.Equal(TerrainSurfaceKind.Water, coastalWater.Kind);
        Assert.Equal(0.0, coastalWater.HeightM);
        Assert.False(terrain.TrySample(150_000.0, 0.0, out _));
    }

    [Fact]
    public void F22RecoveryRunwayFollowsTheEmbeddedRegionalTerrainDatum() {
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
        Assert.Equal(thresholdGround.HeightM, runway.ElevationM, precision: 8);
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
            Assert.True(terrain.TrySample(pavement.X, pavement.Z,
                out TerrainSample ground));
            Assert.Equal(TerrainSurfaceKind.Land, ground.Kind);
            Assert.InRange(Math.Abs(runway.ElevationM - ground.HeightM), 0.0, 0.5);
        }
    }

    [Fact]
    public void DetailCellRemainsByteStableAndMeetsRegionalTruthWithoutASeam() {
        const string DetailResource = "GunsOnly.Web.Data.UkraineSoniachne.truth";
        const string RegionalResource = "GunsOnly.Web.Data.UkraineSoniachneRegion.truth";
        ITerrainSurface detail = Assert.IsAssignableFrom<ITerrainSurface>(
            PackedTerrainTruth.Load(DetailResource, "Soniachne detail"));
        ITerrainSurface regional = Assert.IsAssignableFrom<ITerrainSurface>(
            PackedTerrainTruth.Load(RegionalResource, "Soniachne regional"));

        using Stream stream = Assert.IsAssignableFrom<Stream>(
            Assembly.GetExecutingAssembly().GetManifestResourceStream(DetailResource));
        string digest = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
        Assert.Equal(
            "705e782609d4e1bac280ee0631ced57c5cda0556d8f0ad419e97f5221fa64a8b",
            digest);

        foreach (double edgeM in new[] { -8_192.0, 8_192.0 })
        foreach (double alongM in Enumerable.Range(0, 65)
            .Select(index => -8_192.0 + index * 256.0)) {
            AssertTerrainSeam(detail, regional, edgeM, alongM);
            AssertTerrainSeam(detail, regional, alongM, edgeM);
        }
    }

    static void AssertTerrainSeam(ITerrainSurface detail, ITerrainSurface regional,
        double eastM, double northM) {
        Assert.True(detail.TrySample(eastM, northM, out TerrainSample detailSample));
        Assert.True(regional.TrySample(eastM, northM, out TerrainSample regionalSample));
        Assert.Equal(detailSample.HeightM, regionalSample.HeightM, precision: 8);
        Assert.True(detailSample.UpNormal.Dot(regionalSample.UpNormal) > 0.9999,
            $"normal seam at ({eastM:F0}, {northM:F0}) was "
            + $"{detailSample.UpNormal.Dot(regionalSample.UpNormal):F6}");
    }
}
