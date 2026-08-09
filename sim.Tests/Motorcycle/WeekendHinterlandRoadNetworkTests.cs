using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class WeekendHinterlandRoadNetworkTests
{
    [Fact]
    public void DefaultNetworkIsConnectedOpenWorldWithClosedScenicRoute()
    {
        WeekendHinterlandRoadNetwork network = WeekendHinterlandRoadNetwork.CreateDefault();

        Assert.Equal("weekend-hinterland.open-road.v1", network.Id);
        Assert.Equal(8, network.Roads.Count);
        Assert.Equal(4, network.PrimaryRouteRoadIds.Count);
        Assert.True(network.PrimaryRouteLengthM > 12_000.0);
        Assert.Equal(network.PrimaryRouteCentreline[0], network.PrimaryRouteCentreline[^1]);
        Assert.True(network.BoundsMaxWorldM.X - network.BoundsMinWorldM.X > 6_000.0);
        Assert.True(network.BoundsMaxWorldM.Z - network.BoundsMinWorldM.Z > 4_000.0);

        foreach (WeekendRoad road in network.Roads)
        {
            Assert.True(road.LengthM > 500.0);
            Assert.All(road.Centreline, point =>
            {
                Assert.True(point.IsFinite);
                Assert.Equal(WeekendHinterlandRoadNetwork.SurfaceElevationM, point.Y, 9);
            });
            for (int index = 0; index < road.Centreline.Count - 1; index++)
            {
                double spacingM = WeekendRoad.HorizontalDistance(
                    road.Centreline[index],
                    road.Centreline[index + 1]);
                Assert.InRange(spacingM, 0.001, 10.25);
            }
        }
    }

    [Fact]
    public void PaddockAccessAndAllRoadCentrelinesOwnPavement()
    {
        WeekendHinterlandRoadNetwork network = WeekendHinterlandRoadNetwork.CreateDefault();

        WeekendRoadQueryResult access = network.Query(network.CircuitAccessPointWorldM);
        Assert.True(access.OnPavement);
        Assert.Equal("paddock-access", access.RoadId);
        Assert.Equal(WeekendRoadClass.CircuitAccess, access.RoadClass);

        foreach (WeekendRoad road in network.Roads)
        {
            WeekendRoadQueryResult query = network.Query(road.Centreline[road.Centreline.Count / 2]);
            Assert.True(query.OnPavement);
            Assert.InRange(query.LateralDistanceM, 0.0, 1e-8);
            Assert.True(query.ForwardWorld.IsFinite);
            Assert.InRange(query.ForwardWorld.Length, 0.999999, 1.000001);
        }

        Assert.False(network.IsOnPavement(new Vec3D(9_000.0, 68.0, 9_000.0)));
    }

    [Fact]
    public void ScenicLoopProgressIsContinuousAndRendererNeutral()
    {
        WeekendHinterlandRoadNetwork network = WeekendHinterlandRoadNetwork.CreateDefault();
        IReadOnlyList<Vec3D> route = network.PrimaryRouteCentreline;

        double lastProgressM = -1.0;
        for (int index = 0; index < route.Count - 1; index += 17)
        {
            WeekendRoadQueryResult query = network.QueryPrimaryRoute(route[index]);
            Assert.True(query.OnPavement);
            Assert.Equal(WeekendHinterlandRoadNetwork.PrimaryRouteId, query.RoadId);
            Assert.True(query.ProgressM >= lastProgressM);
            lastProgressM = query.ProgressM;
        }

        WeekendRoadQueryResult finish = network.QueryPrimaryRoute(route[^1]);
        Assert.InRange(finish.ProgressM, 0.0, 1e-8);
        Assert.InRange(network.PrimaryRouteLengthM, 12_000.0, 20_000.0);
    }

    [Fact]
    public void NetworkShapeIsDeterministicAndContainsBranches()
    {
        WeekendHinterlandRoadNetwork first = WeekendHinterlandRoadNetwork.CreateDefault();
        WeekendHinterlandRoadNetwork second = WeekendHinterlandRoadNetwork.CreateDefault();

        Assert.Equal(
            first.Roads.Select(road => (road.Id, road.RoadClass, road.PavedWidthM, road.LengthM)),
            second.Roads.Select(road => (road.Id, road.RoadClass, road.PavedWidthM, road.LengthM)));
        Assert.Equal(first.PrimaryRouteCentreline, second.PrimaryRouteCentreline);
        Assert.Contains(first.Roads, road => road.Id == "reservoir-overlook-spur");
        Assert.Contains(first.Roads, road => road.Id == "village-cut-through");
        Assert.Contains(first.Roads, road => road.Id == "airfield-service-link");
        Assert.DoesNotContain(first.Roads, road => road.Id.Contains("runway", StringComparison.OrdinalIgnoreCase));
    }
}
