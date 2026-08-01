using System.Text.Json;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraCanyonDefinitionTests
{
    [Fact]
    public void BuiltInWorldHasStableExtentRoutesAndAuthoredTradeoffs()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();

        Assert.Equal("world.cobra-canyon.v1", CobraCanyonDefinition.WorldId);
        Assert.Equal(-8_000.0, world.Bounds.MinimumEastM);
        Assert.Equal(8_000.0, world.Bounds.MaximumEastM);
        Assert.Equal(-8_000.0, world.Bounds.MinimumNorthM);
        Assert.Equal(8_000.0, world.Bounds.MaximumNorthM);
        Assert.Equal(16_000.0, CobraCanyonDefinition.WorldExtentM);
        Assert.Equal(3, world.Routes.Count);
        Assert.Equal(
            new[] {
                CobraCanyonDefinition.RiverGorgeRouteId,
                CobraCanyonDefinition.RidgeShadowRouteId,
                CobraCanyonDefinition.RoadPlantationRouteId
            },
            world.Routes.Select(route => route.Id));
        Assert.Equal(
            new[] {
                CobraCanyonRouteExposure.Low,
                CobraCanyonRouteExposure.Medium,
                CobraCanyonRouteExposure.High
            },
            world.Routes.Select(route => route.Exposure));
        Assert.All(world.Routes, route => {
            Assert.True(route.HorizontalLengthM > 15_000.0);
            Assert.NotEmpty(route.TacticalIntent);
            Assert.NotEmpty(route.PrimaryHazard);
        });
        Assert.Equal(11, world.Landmarks.Count);
        Assert.Equal(14, world.Obstacles.Count);
        Assert.All(world.Landmarks, landmark =>
            Assert.True(world.Bounds.Contains(landmark.EastM, landmark.NorthM)));
    }

    [Fact]
    public void FreshDefinitionsHaveBitStableGeometryAndIdentifiers()
    {
        CobraCanyonDefinition first = CobraCanyonDefinition.Create();
        CobraCanyonDefinition second = CobraCanyonDefinition.Create();

        Assert.Equal(
            RouteGeometry(first),
            RouteGeometry(second));
        Assert.Equal(
            first.Landmarks.Select(landmark =>
                (landmark.Id, landmark.PositionLocalM)).ToArray(),
            second.Landmarks.Select(landmark =>
                (landmark.Id, landmark.PositionLocalM)).ToArray());
        Assert.Equal(
            first.Obstacles.Select(obstacle => (
                obstacle.Id,
                obstacle.Primitive,
                obstacle.FirstLocalM,
                obstacle.SecondLocalM,
                obstacle.RadiusM)).ToArray(),
            second.Obstacles.Select(obstacle => (
                obstacle.Id,
                obstacle.Primitive,
                obstacle.FirstLocalM,
                obstacle.SecondLocalM,
                obstacle.RadiusM)).ToArray());
    }

    [Theory]
    [InlineData(-8_000.0, -8_000.0, 809.280430927485)]
    [InlineData(-6_500.0, -6_200.0, 170.0)]
    [InlineData(-2_750.0, -550.0, 118.932118704283)]
    [InlineData(0.0, 0.0, 248.0)]
    [InlineData(-4_380.0, 1_500.0, 476.021709282522)]
    [InlineData(-3_500.0, 3_050.0, 494.218883043357)]
    [InlineData(300.0, -3_920.0, 226.055006367471)]
    [InlineData(2_720.0, -1_740.0, 244.520905709348)]
    [InlineData(6_500.0, 5_600.0, 232.0)]
    [InlineData(8_000.0, 8_000.0, 906.719569072515)]
    public void TerrainHeightMatchesBrowserPlannerGoldenSamples(
        double eastM,
        double northM,
        double expectedHeightM)
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonTerrainSurface terrain = world.CreateTerrainSurface();

        Assert.True(terrain.TrySample(eastM, northM, out TerrainSample sample));
        Assert.InRange(Math.Abs(sample.HeightM - expectedHeightM), 0.0, 1e-9);
        Assert.InRange(sample.UpNormal.Length, 0.999_999, 1.000_001);
    }

    [Fact]
    public void TerrainSurfaceClassifiesRiverAndRejectsOutOfBoundsSamples()
    {
        CobraCanyonTerrainSurface terrain =
            CobraCanyonDefinition.Create().CreateTerrainSurface();

        Assert.True(terrain.TrySample(-2_750.0, -550.0, out TerrainSample river));
        Assert.True(terrain.TrySample(0.0, 0.0, out TerrainSample land));
        Assert.Equal(TerrainSurfaceKind.Water, river.Kind);
        Assert.Equal(TerrainSurfaceKind.Land, land.Kind);
        Assert.False(terrain.TrySample(8_001.0, 0.0, out _));
    }

    [Fact]
    public void CSharpNavigationAndCollisionAuthorityMatchesBrowserWorldJson()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        string jsonPath = FindRepositoryFile(
            "web", "wwwroot", "content", "packs", "cobra-vietnam",
            "environment", "cobra-canyon.world.json");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(jsonPath));
        JsonElement root = document.RootElement;

        Assert.Equal(CobraCanyonDefinition.WorldId,
            root.GetProperty("worldId").GetString());

        Dictionary<string, JsonElement> routeJson = root
            .GetProperty("routeLanes")
            .EnumerateArray()
            .ToDictionary(route => route.GetProperty("id").GetString()!, route => route);
        Assert.Equal(world.Routes.Count, routeJson.Count);
        foreach (CobraCanyonRouteDefinition route in world.Routes) {
            Assert.True(routeJson.TryGetValue(route.Id, out JsonElement jsonRoute),
                $"Browser world is missing route authority '{route.Id}'.");
            JsonElement.ArrayEnumerator jsonPoints =
                jsonRoute.GetProperty("pathLocalM").EnumerateArray();
            Assert.Equal(route.Points.Count, jsonPoints.Count());
            int index = 0;
            foreach (JsonElement jsonPoint in jsonPoints) {
                CobraCanyonRoutePoint point = route.Points[index++];
                AssertVector(jsonPoint, point.PathLocalM);
            }
        }

        Dictionary<string, JsonElement> patchJson = root
            .GetProperty("heroCells")
            .EnumerateArray()
            .ToDictionary(cell => cell.GetProperty("id").GetString()!, cell => cell);
        Assert.Equal(world.TerrainPatches.Count, patchJson.Count);
        foreach (CobraCanyonTerrainPatchDefinition patch in world.TerrainPatches) {
            Assert.True(patchJson.TryGetValue(patch.Id, out JsonElement jsonCell));
            JsonElement jsonPatch = jsonCell.GetProperty("terrainPatch");
            AssertVector(jsonPatch.GetProperty("centerLocalM"), patch.CentreLocalM);
            Assert.Equal(patch.RadiusM, jsonPatch.GetProperty("radiusM").GetDouble(), 12);
            Assert.Equal(patch.BlendWidthM,
                jsonPatch.GetProperty("blendWidthM").GetDouble(), 12);
            Assert.Equal(patch.UndulationM,
                jsonPatch.GetProperty("undulationM").GetDouble(), 12);
        }

        Dictionary<string, JsonElement> landmarkJson = root
            .GetProperty("landmarks")
            .EnumerateArray()
            .ToDictionary(item => item.GetProperty("id").GetString()!, item => item);
        Assert.Equal(world.Landmarks.Count, landmarkJson.Count);
        foreach (CobraCanyonLandmarkDefinition landmark in world.Landmarks) {
            Assert.True(landmarkJson.TryGetValue(landmark.Id, out JsonElement jsonLandmark));
            AssertVector(jsonLandmark.GetProperty("positionLocalM"), landmark.PositionLocalM);
            Assert.False(jsonLandmark.GetProperty("presentationOnly").GetBoolean());
            Assert.False(jsonLandmark.GetProperty("targetable").GetBoolean());
        }

        Dictionary<string, JsonElement> hazardJson = root
            .GetProperty("hazards")
            .EnumerateArray()
            .ToDictionary(item => item.GetProperty("id").GetString()!, item => item);
        Assert.Equal(world.Obstacles.Count, hazardJson.Count);
        foreach (CobraCanyonObstacleDefinition obstacle in world.Obstacles) {
            Assert.True(hazardJson.TryGetValue(obstacle.Id, out JsonElement jsonHazard),
                $"Browser world is missing collision authority '{obstacle.Id}'.");
            JsonElement collision = jsonHazard.GetProperty("collision");
            if (obstacle.Primitive == CobraCanyonCollisionPrimitive.AxisAlignedBox) {
                Assert.Equal("aabb", collision.GetProperty("shape").GetString());
                AssertVector(collision.GetProperty("minimumLocalM"), obstacle.FirstLocalM);
                AssertVector(collision.GetProperty("maximumLocalM"), obstacle.SecondLocalM);
            } else {
                Assert.Equal("capsuleSegment", collision.GetProperty("shape").GetString());
                AssertVector(collision.GetProperty("fromLocalM"), obstacle.FirstLocalM);
                AssertVector(collision.GetProperty("toLocalM"), obstacle.SecondLocalM);
                Assert.Equal(obstacle.RadiusM,
                    collision.GetProperty("radiusM").GetDouble(), 12);
            }
            Assert.False(jsonHazard.GetProperty("presentationOnly").GetBoolean());
            Assert.False(jsonHazard.GetProperty("targetable").GetBoolean());
        }
    }

    static (string RouteId, string PointId, Vec3D Position)[] RouteGeometry(
        CobraCanyonDefinition world) => world.Routes
        .SelectMany(route => route.Points.Select(point =>
            (route.Id, point.Id, point.PathLocalM)))
        .ToArray();

    static void AssertVector(JsonElement json, in Vec3D expected)
    {
        double[] coordinates = json.EnumerateArray()
            .Select(value => value.GetDouble())
            .ToArray();
        Assert.Equal(3, coordinates.Length);
        Assert.Equal(expected.X, coordinates[0], 12);
        Assert.Equal(expected.Y, coordinates[1], 12);
        Assert.Equal(expected.Z, coordinates[2], 12);
    }

    static string FindRepositoryFile(params string[] relativeSegments)
    {
        // The release gate deliberately builds under an external scratch --artifacts-path, so
        // AppContext.BaseDirectory cannot be walked back to the checkout. TestRepository owns the
        // one canonical repository-root contract (including GUNS_REPO_ROOT from bin/check).
        string candidate = Path.Combine(
            new[] { TestRepository.Root }.Concat(relativeSegments).ToArray());
        if (File.Exists(candidate)) return candidate;
        throw new FileNotFoundException(
            $"Could not locate the Cobra Canyon browser authority JSON at '{candidate}'.",
            candidate);
    }
}
