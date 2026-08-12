using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
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
        // Default spawn is skids-on-pad (CG → skid), not route TargetAglM hover.
        double padClearanceM = Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM;
        Assert.Equal(padClearanceM, river.Cobra.State.PositionWorldM.Y);
        Assert.Equal(padClearanceM, ridge.Cobra.State.PositionWorldM.Y);
        Assert.Equal(padClearanceM, road.Cobra.State.PositionWorldM.Y);
        Assert.Equal(CobraMissionAct.Depart, river.Act);
        Assert.DoesNotContain(
            river.GroundWar.Units,
            unit => unit.Id == CobraGroundWarRuntime.GunnerySeamUnitId);
        Assert.Equal(river.SelectedRoute.Id, river.Diagnostics.RouteGuidance.RouteId);
        Assert.Equal(ridge.SelectedRoute.Id, ridge.Diagnostics.RouteGuidance.RouteId);
        Assert.Equal(road.SelectedRoute.Id, road.Diagnostics.RouteGuidance.RouteId);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CobraMissionRuntime(
            world, new FlatTerrain(), (CobraCanyonRouteChoice)999));
    }

    [Fact]
    public void DefaultRiverGorgeSpawnIsSkidsOnLandCampEmber()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonTerrainSurface terrain = world.CreateTerrainSurface();
        var runtime = new CobraMissionRuntime(
            world, terrain, CobraCanyonRouteChoice.RiverGorge);
        Vec3D position = runtime.Cobra.State.PositionWorldM;

        Assert.True(terrain.TrySample(position.X, position.Z, out TerrainSample surface));
        Assert.Equal(TerrainSurfaceKind.Land, surface.Kind);
        Assert.Equal(
            surface.HeightM + Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM,
            position.Y,
            3);
        Assert.Equal(CobraMissionAct.Depart, runtime.Act);
        Assert.Equal(0.0, runtime.Cobra.State.GroundVelocityMps.Length, 3);
    }

    [Fact]
    public void LeavingThePadSeedsTheGunnerySeamOnIngress()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonRouteDefinition route = world.Routes.First(candidate =>
            string.Equals(candidate.Id, CobraCanyonDefinition.RiverGorgeRouteId, StringComparison.Ordinal));
        CobraCanyonRoutePoint start = route.Points[0];
        CobraCanyonRoutePoint next = route.Points[1];
        double yawRad = Math.Atan2(next.EastM - start.EastM, next.NorthM - start.NorthM);
        double eastDeltaM = next.EastM - start.EastM;
        double northDeltaM = next.NorthM - start.NorthM;
        double lengthM = Math.Sqrt(eastDeltaM * eastDeltaM + northDeltaM * northDeltaM);
        // Just past DepartPadRadiusM along the gorge heading — cold open stays on the pad;
        // this fixture proves Ingress plants the seam without needing a crash-prone takeoff.
        double offsetM = CobraMissionActProgress.DepartPadRadiusM + 40.0;
        var pastPad = new Vec3D(
            start.EastM + eastDeltaM / lengthM * offsetM,
            120.0,
            start.NorthM + northDeltaM / lengthM * offsetM);
        var runtime = new CobraMissionRuntime(
            world,
            new FlatTerrain(80.0),
            CobraCanyonRouteChoice.RiverGorge,
            spawn: new CobraMissionSpawn(pastPad, Vec3D.Zero, yawRad));

        Assert.Equal(CobraMissionAct.Ingress, runtime.Act);
        Assert.Contains(
            runtime.GroundWar.Units,
            unit => unit.Id == CobraGroundWarRuntime.GunnerySeamUnitId && unit.IsAlive);
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
    public void TerrainWindPublishesDeterministicSpatialRotorAndTailAirflow()
    {
        CobraCanyonDefinition firstWorld = CobraCanyonDefinition.Create();
        CobraCanyonDefinition replayWorld = CobraCanyonDefinition.Create();
        var first = new CobraMissionRuntime(
            firstWorld,
            firstWorld.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            enableTerrainWind: true);
        var replay = new CobraMissionRuntime(
            replayWorld,
            replayWorld.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            enableTerrainWind: true);
        double trim = first.Cobra.EstimateHoverCollective(
            first.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var neutral = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);

        first.Advance(neutral);
        replay.Advance(neutral);

        RotorcraftAirflowSample firstFlow = Assert.IsType<RotorcraftAirflowSample>(
            first.LastRotorcraftAirflow);
        RotorcraftAirflowSample replayFlow = Assert.IsType<RotorcraftAirflowSample>(
            replay.LastRotorcraftAirflow);
        Assert.Equal(firstFlow, replayFlow);
        Assert.True(firstFlow.MainRotorForwardWindVelocityMps.IsFinite);
        Assert.True(firstFlow.MainRotorAftWindVelocityMps.IsFinite);
        Assert.True(firstFlow.MainRotorLeftWindVelocityMps.IsFinite);
        Assert.True(firstFlow.MainRotorRightWindVelocityMps.IsFinite);
        Assert.True(firstFlow.TailRotorWindVelocityMps.IsFinite);
        double resolvedGradient =
            (firstFlow.MainRotorForwardWindVelocityMps
                - firstFlow.MainRotorAftWindVelocityMps).Length
            + (firstFlow.MainRotorLeftWindVelocityMps
                - firstFlow.MainRotorRightWindVelocityMps).Length
            + (firstFlow.TailRotorWindVelocityMps - first.LastWindVelocityMps).Length;
        Assert.True(resolvedGradient > 1e-6,
            "terrain gust truth must not collapse every rotor station to the CG sample");
    }

    [Fact]
    public void DisabledTerrainWindKeepsExplicitUniformFlowWithoutInventedGradients()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        var runtime = new CobraMissionRuntime(
            world,
            world.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            enableTerrainWind: false);
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);

        runtime.Advance(new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0));

        Assert.Null(runtime.LastRotorcraftAirflow);
        Assert.Equal(CobraCanyonWindField.DefaultSynopticMps, runtime.LastWindVelocityMps);
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

    static CobraMissionRuntime CreateRealTerrainRuntime(out double padSurfaceHeightM)
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonTerrainSurface terrain = world.CreateTerrainSurface();
        Assert.True(terrain.TrySample(-6_775.0, -6_200.0, out TerrainSample pad));
        padSurfaceHeightM = pad.HeightM;
        return new CobraMissionRuntime(world, terrain, CobraCanyonRouteChoice.RiverGorge);
    }

    /// <summary>
    /// Climb straight up off the pad, chop the collective, arrive above the gear's design
    /// sink: a deterministic gear-damaging (never hard-impact) cycle flown purely through
    /// runtime controls. Returns once the aircraft reads stable surface contact again.
    /// </summary>
    static void FlyGearDamagingPadCycle(CobraMissionRuntime runtime)
    {
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        // Climb only ~1.3 m before the chop: a free drop from there arrives in the gear-damage
        // band (3.0-6.5 m/s), never at the hard-impact kill.
        double startAltitudeM = runtime.Cobra.State.PositionWorldM.Y;
        for (int tick = 0;
            tick < 1800
                && runtime.Cobra.State.PositionWorldM.Y < startAltitudeM + 1.35
                && runtime.Status == CobraMissionStatus.Active;
            tick++)
            runtime.Advance(new VerticalLiftPilotCommand(
                Math.Min(1.0, trim + 0.10), 0.0, 0.0, 0.0));
        for (int tick = 0; tick < 900 && runtime.Status == CobraMissionStatus.Active; tick++)
        {
            bool grounded = runtime.Cobra.Observation.Contact.Kind
                is VehicleContactKind.SurfaceContact
                or VehicleContactKind.StableSurfaceContact;
            if (grounded && runtime.Cobra.GearDamaged) break;
            runtime.Advance(new VerticalLiftPilotCommand(0.05, 0.0, 0.0, 0.0));
        }
        for (int tick = 0; tick < 360 && runtime.Status == CobraMissionStatus.Active; tick++)
        {
            if (runtime.Cobra.Observation.Contact.Kind
                == VehicleContactKind.StableSurfaceContact) break;
            runtime.Advance(new VerticalLiftPilotCommand(0.05, 0.0, 0.0, 0.0));
        }
        if (runtime.Status == CobraMissionStatus.Active)
            runtime.Advance(new VerticalLiftPilotCommand(0.05, 0.0, 0.0, 0.0));
    }

    [Fact]
    public void AirframePoolStartsWithThreeBirdsInsideTheFob()
    {
        CobraMissionRuntime runtime = CreateRealTerrainRuntime(out _);

        Assert.Equal(3, runtime.AirframePool.Count);
        Assert.Equal(1, runtime.AirframePool.Count(
            slot => slot.State == CobraAirframeState.PlayerFlying));
        Assert.Equal(2, runtime.AirframePool.Count(
            slot => slot.State == CobraAirframeState.Ready));
        foreach (CobraAirframeSlot slot in runtime.AirframePool)
        {
            if (slot.State != CobraAirframeState.Ready) continue;
            double eastDeltaM = slot.ParkedPositionWorldM.X - (-6_775.0);
            double northDeltaM = slot.ParkedPositionWorldM.Z - (-6_200.0);
            double distanceM = Math.Sqrt(
                eastDeltaM * eastDeltaM + northDeltaM * northDeltaM);
            // Inside the level apron, clear of the spawn pad's safety footprint.
            Assert.InRange(distanceM, 15.0, 58.0);
        }
    }

    [Fact]
    public void CrippledBirdOnThePadSwapsIntoAReadySpare()
    {
        CobraMissionRuntime runtime = CreateRealTerrainRuntime(out _);
        Vec3D originalSpawn = runtime.Cobra.State.PositionWorldM;

        FlyGearDamagingPadCycle(runtime);

        Assert.Equal(CobraMissionStatus.Active, runtime.Status);
        Assert.Equal(1, runtime.AirframeSwaps);
        Assert.False(runtime.Cobra.GearDamaged,
            "After the swap the player must be flying a healthy airframe.");
        CobraAirframeSlot flying = Assert.Single(
            runtime.AirframePool, slot => slot.State == CobraAirframeState.PlayerFlying);
        CobraAirframeSlot crippled = Assert.Single(
            runtime.AirframePool, slot => slot.State == CobraAirframeState.Crippled);
        Assert.Equal(flying.ParkedPositionWorldM.X, runtime.Cobra.State.PositionWorldM.X, 3);
        Assert.Equal(flying.ParkedPositionWorldM.Z, runtime.Cobra.State.PositionWorldM.Z, 3);
        double crippledDriftM = Math.Sqrt(
            Math.Pow(crippled.ParkedPositionWorldM.X - originalSpawn.X, 2.0)
            + Math.Pow(crippled.ParkedPositionWorldM.Z - originalSpawn.Z, 2.0));
        Assert.True(crippledDriftM < 60.0,
            $"The crippled bird should rest where it landed, {crippledDriftM:F0} m off.");
    }

    [Fact]
    public void WreckingOnThePadTakesASpareInsteadOfEndingTheSortie()
    {
        CobraMissionRuntime runtime = CreateRealTerrainRuntime(out _);
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        double startAltitudeM = runtime.Cobra.State.PositionWorldM.Y;

        // Climb high enough that a dead-collective drop arrives ABOVE the hard-impact limit,
        // then ride it into the pad: a genuine wreck, inside the FOB.
        for (int tick = 0;
            tick < 3600
                && runtime.Cobra.State.PositionWorldM.Y < startAltitudeM + 12.0
                && runtime.Status == CobraMissionStatus.Active;
            tick++)
            runtime.Advance(new VerticalLiftPilotCommand(
                Math.Min(1.0, trim + 0.25), 0.0, 0.0, 0.0));
        for (int tick = 0; tick < 1800 && runtime.Status == CobraMissionStatus.Active; tick++)
        {
            runtime.Advance(new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0));
            if (runtime.AirframeSwaps > 0) break;
        }

        Assert.Equal(CobraMissionStatus.Active, runtime.Status);
        Assert.Equal(1, runtime.AirframeSwaps);
        Assert.True(runtime.Cobra.State.Flyable, "The spare must be a healthy airframe.");
        CobraAirframeSlot wreck = Assert.Single(
            runtime.AirframePool,
            slot => slot.State is CobraAirframeState.Destroyed or CobraAirframeState.Crippled);
        CobraAirframeSlot flying = Assert.Single(
            runtime.AirframePool, slot => slot.State == CobraAirframeState.PlayerFlying);
        double gapM = Math.Sqrt(
            Math.Pow(wreck.ParkedPositionWorldM.X - flying.ParkedPositionWorldM.X, 2.0)
            + Math.Pow(wreck.ParkedPositionWorldM.Z - flying.ParkedPositionWorldM.Z, 2.0));
        Assert.True(gapM >= CobraAirframePool.WreckClearanceFromStationM - 0.01,
            $"The wreck must rest clear of the spare's station: {gapM:F1} m.");
    }

    [Fact]
    public void ExhaustingTheAirframePoolEndsTheMission()
    {
        CobraMissionRuntime runtime = CreateRealTerrainRuntime(out _);

        FlyGearDamagingPadCycle(runtime);
        Assert.Equal(1, runtime.AirframeSwaps);
        FlyGearDamagingPadCycle(runtime);
        Assert.Equal(2, runtime.AirframeSwaps);
        FlyGearDamagingPadCycle(runtime);

        Assert.Equal(2, runtime.AirframeSwaps);
        Assert.Equal(CobraMissionStatus.FobCombatIneffective, runtime.Status);
        Assert.DoesNotContain(
            runtime.AirframePool, slot => slot.State == CobraAirframeState.Ready);
    }
}
