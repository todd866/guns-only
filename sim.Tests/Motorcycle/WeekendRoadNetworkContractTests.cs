using System.Text.Json;
using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class WeekendRoadNetworkContractTests
{
    [Fact]
    public void ContractExportsEveryAuthoritativeRoadPointWidthClassAndJunction()
    {
        PaintedCircuit circuit = PaintedCircuit.WeekendTrackDay();
        WeekendHinterlandRoadNetwork network = WeekendHinterlandRoadNetwork.CreateDefault(
            circuit.PaddockAccessPointWorldM);
        WeekendRoadNetworkContract contract = WeekendRoadNetworkContract.FromNetwork(network);

        Assert.Equal(WeekendRoadNetworkContract.CurrentSchema, contract.Schema);
        Assert.Equal(network.Id, contract.Id);
        Assert.Equal("weekend-ride", contract.Mode);
        Assert.Equal("connected-road-network", contract.RouteKind);
        Assert.Equal(network.PrimaryRouteLengthM, contract.PrimaryRouteLengthM, 9);
        Assert.Equal(network.PrimaryRouteRoadIds, contract.PrimaryRouteRoadIds);
        Assert.Equal(circuit.PaddockAccessPointWorldM.X, contract.CircuitAccessPoint.X, 9);
        Assert.Equal(circuit.PaddockAccessPointWorldM.Z, contract.CircuitAccessPoint.Z, 9);
        Assert.Equal("left-handed-east-up-north-metres", contract.Geometry.CoordinateSystem);
        Assert.Equal("sRGB", contract.RoadSurface.ColorSpace);
        Assert.Equal("mirrored-repeat", contract.RoadSurface.WrapMode);
        Assert.Equal(12.0, contract.RoadSurface.MetresPerTile, 9);
        Assert.Equal(160.0, contract.WorldGroundSurface.MetresPerTile, 9);
        Assert.Equal(WeekendRoadNetworkContract.RoadsideAtlasSha256,
            contract.RoadsideAtlas.Sha256);
        Assert.True(contract.RoadsideAtlas.PresentationOnly);
        Assert.Equal(0.42, contract.RoadsideAtlas.AlphaCutoff, 9);
        Assert.Equal(
            new[] { "eucalyptus", "dry-grass", "sandstone", "scrub" },
            contract.RoadsideAtlas.Regions.Select(region => region.Id));
        Assert.Equal(144, contract.RoadsideInstances.Count);
        Assert.Equal(contract.RoadsideInstances.Count,
            contract.RoadsideInstances.Select(instance => instance.Id).Distinct().Count());
        Assert.All(contract.RoadsideInstances, instance =>
        {
            Assert.True(double.IsFinite(instance.HeadingRad));
            Assert.Equal(WeekendHinterlandRoadNetwork.SurfaceElevationM,
                instance.Position.Y, 9);
            Assert.InRange(instance.WidthM, 2.0, 30.0);
            Assert.InRange(instance.HeightM, 2.0, 25.0);
        });
        Assert.Equal(network.Roads.Count, contract.Roads.Count);
        Assert.Equal(7, contract.Junctions.Count);

        for (int roadIndex = 0; roadIndex < network.Roads.Count; roadIndex++)
        {
            WeekendRoad authority = network.Roads[roadIndex];
            WeekendRoadContract exported = contract.Roads[roadIndex];
            Assert.Equal(authority.Id, exported.Id);
            Assert.Equal(authority.PavedWidthM, exported.PavedWidthM, 9);
            Assert.Equal(authority.LengthM, exported.LengthM, 9);
            Assert.Equal(authority.Centreline.Count, exported.Centreline.Count);
            for (int pointIndex = 0; pointIndex < authority.Centreline.Count; pointIndex++)
            {
                Vec3D expected = authority.Centreline[pointIndex];
                WeekendRoadNetworkPointContract actual = exported.Centreline[pointIndex];
                Assert.Equal(expected.X, actual.X, 9);
                Assert.Equal(expected.Y, actual.Y, 9);
                Assert.Equal(expected.Z, actual.Z, 9);
            }
        }

        WeekendRoadJunctionContract south = Assert.Single(
            contract.Junctions,
            junction => junction.RoadIds.Count == 4);
        Assert.Contains("paddock-access", south.RoadIds);
        Assert.Contains("south-farm-road", south.RoadIds);
        Assert.Contains("east-orchard-road", south.RoadIds);
        Assert.Contains("village-cut-through", south.RoadIds);
        Assert.Equal(WeekendHinterlandRoadNetwork.AccessRoadWidthM * 0.5,
            south.PavedRadiusM, 9);
    }

    [Fact]
    public void ContractJsonHasStableRendererNeutralNamesAndNoDuplicateRoutePointList()
    {
        WeekendRoadNetworkContract contract =
            WeekendRoadNetworkContract.FromDefaultWeekendWorld();
        string json = contract.ToJson();
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.Equal("guns-only.weekend-road-network.v1",
            root.GetProperty("schema").GetString());
        Assert.Equal(8, root.GetProperty("roads").GetArrayLength());
        Assert.Equal(7, root.GetProperty("junctions").GetArrayLength());
        Assert.True(root.TryGetProperty("primary_route_road_ids", out _));
        Assert.Equal("left-handed-east-up-north-metres",
            root.GetProperty("geometry").GetProperty("coordinate_system").GetString());
        Assert.Equal(WeekendRoadNetworkContract.RoadSurfaceSha256,
            root.GetProperty("road_surface").GetProperty("sha256").GetString());
        Assert.False(root.TryGetProperty("primary_route_centreline", out _));
        Assert.False(root.TryGetProperty("renderer", out _));
        Assert.DoesNotContain("runway", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("airfield_surface", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"presentation_only\":true", json, StringComparison.Ordinal);
    }

    [Fact]
    public void DefaultExportUsesTheSamePaddockConnectedGraphAsTheLiveMission()
    {
        WeekendRideMissionRuntime runtime = WeekendRideMissionRuntime.CreateDefault();
        WeekendRoadNetworkContract contract =
            WeekendRoadNetworkContract.FromDefaultWeekendWorld();

        Assert.Equal(runtime.Hinterland.CircuitAccessPointWorldM.X,
            contract.CircuitAccessPoint.X, 9);
        Assert.Equal(runtime.Hinterland.CircuitAccessPointWorldM.Y,
            contract.CircuitAccessPoint.Y, 9);
        Assert.Equal(runtime.Hinterland.CircuitAccessPointWorldM.Z,
            contract.CircuitAccessPoint.Z, 9);
        WeekendRoadContract access = Assert.Single(
            contract.Roads, road => road.Id == "paddock-access");
        Assert.Equal(contract.CircuitAccessPoint, access.Centreline[0]);
    }

    [Fact]
    public void GeneratedCopiesMatchTheLiveAuthorityExporterExactly()
    {
        string repositoryRoot = FindRepositoryRoot();
        string expected = WeekendRoadNetworkContract.FromDefaultWeekendWorld()
            .ToJson(indented: true) + "\n";
        string[] copies = {
            Path.Combine(repositoryRoot,
                "content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json"),
            Path.Combine(repositoryRoot,
                "web/wwwroot/content/packs/weekend-ride/environment/roads/"
                + "weekend-hinterland-road-network.v1.json"),
            Path.Combine(repositoryRoot,
                "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
                + "weekend-hinterland-road-network-v1.json"),
        };
        foreach (string path in copies)
        {
            Assert.True(File.Exists(path), "missing generated road contract " + path);
            Assert.Equal(expected, File.ReadAllText(path));
        }
    }

    static string FindRepositoryRoot()
    {
        string? directory = AppContext.BaseDirectory;
        for (int depth = 0; depth < 12 && directory != null; depth++)
        {
            if (File.Exists(Path.Combine(directory, "global.json"))
                && Directory.Exists(Path.Combine(directory, "content/packs/weekend-ride")))
            {
                return directory;
            }
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("guns-only repository root not found");
    }
}
