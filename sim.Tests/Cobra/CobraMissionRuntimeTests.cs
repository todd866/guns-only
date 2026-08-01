using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraMissionRuntimeTests
{
    sealed class FlatTerrain : ITerrainSurface
    {
        readonly double _heightM;

        public FlatTerrain(double heightM = 0.0) => _heightM = heightM;

        public TerrainBounds Bounds => new(-8_000.0, 8_000.0, -8_000.0, 8_000.0);
        public double HorizontalResolutionM => 50.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample)
        {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(_heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    sealed class MaskingRingTerrain : ITerrainSurface
    {
        public TerrainBounds Bounds => new(-8_000.0, 8_000.0, -8_000.0, 8_000.0);
        public double HorizontalResolutionM => 20.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample)
        {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            double radiusM = Math.Sqrt(eastM * eastM + northM * northM);
            double heightM = radiusM is >= 100.0 and <= 280.0 ? 220.0 : 0.0;
            sample = new TerrainSample(heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    [Fact]
    public void RouteChoiceIsExplicitAndChangesTheSelectedGuidanceContract()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        var river = new CobraMissionRuntime(
            world, new FlatTerrain(), CobraCanyonRouteChoice.RiverGorge);
        var ridge = new CobraMissionRuntime(
            world, new FlatTerrain(), CobraCanyonRouteChoice.RidgeShadow);
        var road = new CobraMissionRuntime(
            world, new FlatTerrain(), CobraCanyonRouteChoice.RoadPlantation);

        Assert.Equal(CobraCanyonDefinition.RiverGorgeRouteId, river.SelectedRoute.Id);
        Assert.Equal(CobraCanyonDefinition.RidgeShadowRouteId, ridge.SelectedRoute.Id);
        Assert.Equal(CobraCanyonDefinition.RoadPlantationRouteId, road.SelectedRoute.Id);
        Assert.Equal(30.0, river.Cobra.State.PositionWorldM.Y);
        Assert.Equal(40.0, ridge.Cobra.State.PositionWorldM.Y);
        Assert.Equal(27.0, road.Cobra.State.PositionWorldM.Y);
        Assert.Equal(river.SelectedRoute.Id, river.Diagnostics.RouteGuidance.RouteId);
        Assert.Equal(ridge.SelectedRoute.Id, ridge.Diagnostics.RouteGuidance.RouteId);
        Assert.Equal(road.SelectedRoute.Id, road.Diagnostics.RouteGuidance.RouteId);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CobraMissionRuntime(
            world, new FlatTerrain(), (CobraCanyonRouteChoice)999));
    }

    [Fact]
    public void DirectVerticalLiftCommandsAdvanceTheExistingAh1gAuthorityAt120Hz()
    {
        var runtime = new CobraMissionRuntime(
            CobraCanyonDefinition.Create(),
            new FlatTerrain(80.0),
            CobraCanyonRouteChoice.RiverGorge);
        Vec3D initialPosition = runtime.Cobra.State.PositionWorldM;
        double trimCollective = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);

        CobraMissionAdvanceResult result = default;
        for (int tick = 0; tick < 120; tick++) {
            result = runtime.Advance(new VerticalLiftPilotCommand(
                trimCollective,
                ForwardCyclic: 0.24,
                RightCyclic: 0.0,
                Yaw: 0.0));
        }

        Assert.Same(runtime.Cobra, runtime.Vehicle);
        Assert.Equal(Ah1gCobraDynamics.ProviderId,
            runtime.Vehicle.Capability.DynamicsProviderId);
        Assert.Equal(VehicleCommandFamily.VerticalLiftPilot,
            runtime.Vehicle.Capability.CommandFamily);
        Assert.Equal(119, runtime.Cobra.State.Tick);
        Assert.Equal(120, result.Diagnostics.AuthorityTicksAdvanced);
        Assert.Equal(CobraMissionStatus.Active, result.Diagnostics.Status);
        Assert.True(result.Diagnostics.TerrainSampleKnown);
        Assert.NotEqual(initialPosition, result.Vehicle.State.PositionWorldM);
        Assert.True(result.Vehicle.State.GroundVelocityMps.Length > 0.01);
        Assert.Equal(runtime.Cobra.State, result.Vehicle.State);
    }

    [Fact]
    public void ExpensiveMaskingTruthRunsAtAStableTenHertzCadence()
    {
        var runtime = new CobraMissionRuntime(
            CobraCanyonDefinition.Create(),
            new FlatTerrain(),
            CobraCanyonRouteChoice.RiverGorge);
        CobraMaskingAssessment initialAssessment = runtime.Diagnostics.Masking;
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);

        for (int tick = 0; tick < CobraMissionRuntime.MaskingAssessmentIntervalTicks - 1; tick++)
            runtime.Advance(new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0));

        Assert.Same(initialAssessment, runtime.Diagnostics.Masking);
        Assert.Equal(0, runtime.Diagnostics.MaskingAssessmentAuthorityTicks);

        runtime.Advance(new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0));

        Assert.NotSame(initialAssessment, runtime.Diagnostics.Masking);
        Assert.Equal(CobraMissionRuntime.MaskingAssessmentIntervalTicks,
            runtime.Diagnostics.MaskingAssessmentAuthorityTicks);
    }

    [Fact]
    public void AuthoredObstacleCollisionLatchesMissionLossWithoutFakingProviderDamage()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        var probe = new CobraMissionRuntime(
            world, new FlatTerrain(), CobraCanyonRouteChoice.RiverGorge);
        CobraResolvedObstacle deck = Assert.Single(probe.ResolvedObstacles,
            obstacle => obstacle.Id == "hazard.cobra-canyon.iron-bell-deck.v1");
        Assert.True(deck.IntersectsSphere(deck.CentreWorldM, 0.0));
        Assert.True(probe.TryFindObstacleContact(
            deck.CentreWorldM, 0.0, out CobraResolvedObstacle contact));
        Assert.Equal(deck.Id, contact.Id);

        var collisionRuntime = new CobraMissionRuntime(
            world,
            new FlatTerrain(),
            CobraCanyonRouteChoice.RiverGorge,
            spawn: new CobraMissionSpawn(deck.CentreWorldM, Vec3D.Zero, 0.0));
        double trimCollective = collisionRuntime.Cobra.EstimateHoverCollective(
            collisionRuntime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);

        CobraMissionAdvanceResult result = collisionRuntime.Advance(
            new VerticalLiftPilotCommand(trimCollective, 0.0, 0.0, 0.0));

        Assert.Equal(CobraMissionStatus.ObstacleCollision, result.Diagnostics.Status);
        Assert.Equal(deck.Id, result.Diagnostics.CollisionObstacleId);
        Assert.True(result.Diagnostics.ProviderFlyable);
        Assert.False(result.Diagnostics.MissionFlyable);
        Assert.False(collisionRuntime.MissionFlyable);
        Assert.Throws<InvalidOperationException>(() => collisionRuntime.Advance(
            new VerticalLiftPilotCommand(trimCollective, 0.0, 0.0, 0.0)));
    }

    [Fact]
    public void MaskingReportsTerrainAndObstacleOcclusionSeparately()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        var flatRuntime = new CobraMissionRuntime(
            world, new FlatTerrain(), CobraCanyonRouteChoice.RiverGorge);

        Vec3D behindBridge = new(-2_000.0, 270.0, -1_400.0);
        CobraThreatLineOfSight obstacleBlocked = flatRuntime.AssessThreatAt(
            "observer.quarry-overwatch.v1", behindBridge);
        Assert.True(obstacleBlocked.InAssessmentRange);
        Assert.True(obstacleBlocked.TerrainKnown);
        Assert.False(obstacleBlocked.TerrainOccluded);
        Assert.True(obstacleBlocked.ObstacleOccluded);
        Assert.False(obstacleBlocked.HasLineOfSight);

        CobraMaskingAssessment exposed = flatRuntime.AssessMaskingAt(
            new Vec3D(0.0, 800.0, 0.0));
        Assert.Equal(CobraMaskingState.Exposed, exposed.State);
        Assert.True(exposed.ObserversWithLineOfSight > 0);

        var ringRuntime = new CobraMissionRuntime(
            world, new MaskingRingTerrain(), CobraCanyonRouteChoice.RiverGorge);
        CobraMaskingAssessment terrainMasked = ringRuntime.AssessMaskingAt(
            new Vec3D(0.0, 50.0, 0.0));
        Assert.Equal(3, terrainMasked.ObserversInRange);
        Assert.Equal(0, terrainMasked.ObserversWithLineOfSight);
        Assert.Equal(CobraMaskingState.Masked, terrainMasked.State);
        Assert.All(terrainMasked.Observers.Where(observer => observer.InAssessmentRange),
            observer => Assert.True(observer.TerrainOccluded));
    }

    [Fact]
    public void SameRouteTerrainAndCommandsReplayBitIdentically()
    {
        CobraCanyonDefinition firstWorld = CobraCanyonDefinition.Create();
        CobraCanyonDefinition secondWorld = CobraCanyonDefinition.Create();
        var first = new CobraMissionRuntime(
            firstWorld, new FlatTerrain(30.0), CobraCanyonRouteChoice.RoadPlantation);
        var second = new CobraMissionRuntime(
            secondWorld, new FlatTerrain(30.0), CobraCanyonRouteChoice.RoadPlantation);
        double trim = first.Cobra.EstimateHoverCollective(
            first.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);

        for (int tick = 0; tick < 180; tick++) {
            var command = new VerticalLiftPilotCommand(
                trim + (tick < 90 ? 0.015 : -0.01),
                tick < 60 ? 0.12 : -0.04,
                tick is >= 60 and < 120 ? 0.08 : 0.0,
                tick >= 120 ? -0.1 : 0.0);
            first.Advance(command);
            second.Advance(command);
        }

        Assert.Equal(first.Cobra.State, second.Cobra.State);
        Assert.Equal(first.Cobra.Observation, second.Cobra.Observation);
        Assert.Equal(first.Cobra.Telemetry, second.Cobra.Telemetry);
        Assert.Equal(first.Diagnostics.Status, second.Diagnostics.Status);
        Assert.Equal(first.Diagnostics.RouteGuidance, second.Diagnostics.RouteGuidance);
        Assert.Equal(first.Diagnostics.Masking.State, second.Diagnostics.Masking.State);
        Assert.Equal(
            first.Diagnostics.Masking.Observers.ToArray(),
            second.Diagnostics.Masking.Observers.ToArray());
        Assert.Contains("does not model surveyed geography",
            first.Diagnostics.FidelityDisclosure, StringComparison.Ordinal);
    }
}
