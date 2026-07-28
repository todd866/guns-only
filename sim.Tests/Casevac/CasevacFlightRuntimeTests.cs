using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Casevac;

public class CasevacFlightRuntimeTests {
    sealed class FlatTerrain : ITerrainSurface {
        readonly double _heightM;

        public FlatTerrain(double heightM) => _heightM = heightM;

        public TerrainBounds Bounds =>
            new(-20_000.0, 20_000.0, -20_000.0, 20_000.0);

        public double HorizontalResolutionM => 4.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            sample = new TerrainSample(
                _heightM,
                new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    sealed class CoordinateTerrain : ITerrainSurface {
        public TerrainBounds Bounds =>
            new(-20_000.0, 20_000.0, -20_000.0, 20_000.0);

        public double HorizontalResolutionM => 4.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            sample = new TerrainSample(
                HeightAt(eastM, northM),
                new Vec3D(0.0, 1.0, 0.0));
            return true;
        }

        public static double HeightAt(
            double eastM,
            double northM) =>
            50.0 + eastM * 0.001 + northM * 0.002;
    }

    [Fact]
    public void ReplaysBitIdenticallyThroughTheProductionVehicleAndMissionPath() {
        CasevacFlightRuntime first = CreateRuntime(out _);
        CasevacFlightRuntime second = CreateRuntime(out _);
        first.Begin(40);
        second.Begin(40);

        for (long sourceTick = 41; sourceTick <= 8_040; sourceTick++) {
            CasevacFlightControlIntent intent = sourceTick switch {
                < 2_400 => new(0.72, -0.18, -0.05, 0.12),
                < 4_000 => new(0.25, 0.30, 0.15, -0.20),
                < 6_400 => new(0.0, 0.0, -0.20, 0.0),
                _ => CasevacFlightControlIntent.Neutral
            };
            first.Advance(sourceTick, intent);
            second.Advance(sourceTick, intent);
        }

        Assert.Equal(first.VehicleState, second.VehicleState);
        Assert.Equal(first.VehicleObservation, second.VehicleObservation);
        Assert.Equal(first.Snapshot, second.Snapshot);
        Assert.Equal(first.LastLandingZone, second.LastLandingZone);
        Assert.Equal(first.LastExposure, second.LastExposure);
        Assert.Equal(first.RecentEvents, second.RecentEvents);
        Assert.Equal(first.ConsumedEnergyJ, second.ConsumedEnergyJ);
        Assert.Equal(
            first.RemainingUsableEnergyJ,
            second.RemainingUsableEnergyJ);
        Assert.Equal(
            first.DestinationEnergyPlan,
            second.DestinationEnergyPlan);
    }

    [Fact]
    public void IntegratesAppliedPowerAtTheAuthorityRateAndPlansCurrentDestination() {
        CasevacFlightRuntime runtime = CreateRuntime(out _);

        Assert.Equal(
            CasevacFlightRuntime.DefaultInitialUsableEnergyJ,
            runtime.InitialUsableEnergyJ);
        Assert.Equal(
            runtime.InitialUsableEnergyJ,
            runtime.RemainingUsableEnergyJ);
        Assert.Equal(0.0, runtime.ConsumedEnergyJ);
        runtime.Begin(20);

        CasevacTargetGuidance guidance = runtime.TargetGuidance;
        CasevacDestinationEnergyPlan initialPlan =
            runtime.DestinationEnergyPlan;
        double expectedTransitSeconds =
            guidance.HorizontalRangeM
                / CasevacFlightRuntime.PlanningGroundSpeedMps
            + CasevacFlightRuntime.PlanningArrivalAllowanceSeconds;
        Assert.Equal(guidance.TargetId, initialPlan.TargetId);
        Assert.Equal(
            expectedTransitSeconds,
            initialPlan.PlannedTransitSeconds,
            10);
        Assert.Equal(
            runtime.RemainingUsableEnergyJ
                - expectedTransitSeconds
                    * CasevacFlightRuntime.PlanningPowerW,
            initialPlan.ProjectedReserveEnergyJ,
            6);

        double beforeEnergyJ = runtime.RemainingUsableEnergyJ;
        runtime.Advance(
            21,
            new CasevacFlightControlIntent(
                0.0,
                0.0,
                0.8,
                0.0));
        double appliedPowerW =
            runtime.VehicleObservation.Power.AppliedPowerW;
        double expectedTickEnergyJ =
            appliedPowerW / AircraftSim.TickHz;

        Assert.True(appliedPowerW > 0.0);
        Assert.Equal(
            expectedTickEnergyJ,
            runtime.ConsumedEnergyJ,
            8);
        Assert.Equal(
            beforeEnergyJ - expectedTickEnergyJ,
            runtime.RemainingUsableEnergyJ,
            8);
        Assert.Equal(
            runtime.RemainingUsableEnergyJ
                / runtime.InitialUsableEnergyJ,
            runtime.RemainingEnergyFraction,
            12);
        Assert.Equal(
            runtime.RemainingUsableEnergyJ
                / CasevacFlightRuntime.PlanningPowerW,
            runtime.PlanningEnduranceSeconds,
            10);
    }

    [Fact]
    public void EnergyDepletionMakesTheVehicleUnflyableForMissionAuthority() {
        long sequence = 0;
        var runtime = new CasevacFlightRuntime(
            BuiltInCasevacDefinitions.CreatePrototype(),
            terrain: null,
            weather: null,
            () => ++sequence,
            initialUsableEnergyJ: 1.0);
        runtime.Begin(0);

        runtime.Advance(
            1,
            new CasevacFlightControlIntent(
                0.0,
                0.0,
                1.0,
                0.0));

        Assert.True(runtime.ConsumedEnergyJ > 1.0);
        Assert.Equal(0.0, runtime.RemainingUsableEnergyJ);
        Assert.Equal(0.0, runtime.RemainingEnergyFraction);
        Assert.True(runtime.EnergyDepleted);
        Assert.False(runtime.VehicleFlyable);
        Assert.Equal(CasevacPhase.AircraftLost, runtime.Snapshot.Phase);
        Assert.Equal(
            CasevacDisposition.AircraftLostEmpty,
            runtime.Snapshot.Disposition);
        Assert.Equal(
            CasevacAircraftLossCause.UsableEnergyDepleted,
            runtime.Evidence.AircraftLossCause);
        Assert.Equal(1, runtime.Evidence.AircraftLossSourceTick);
        CasevacPrimaryCorrection correction =
            CasevacAssessmentEngine.Assess(
                runtime.Evidence,
                runtime.Snapshot)
            .PrimaryCorrection;
        Assert.Equal(
            CasevacPrimaryCorrectionKind.PreserveUsableEnergyReserve,
            correction.Kind);
        Assert.DoesNotContain(
            "obstacle",
            correction.CorrectionText,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FreshRuntimeRestoresAndReplaysEnergyAcrossSourceTickEpochs() {
        CasevacFlightRuntime first = CreateRuntime(out _);
        CasevacFlightRuntime restarted = CreateRuntime(out _);
        first.Begin(0);
        restarted.Begin(10_000);

        for (long offset = 1; offset <= 480; offset++) {
            var intent = new CasevacFlightControlIntent(
                Forward: 0.65,
                Right: -0.12,
                Vertical: offset < 180 ? 0.45 : -0.10,
                Yaw: 0.08);
            first.Advance(offset, intent);
            restarted.Advance(10_000 + offset, intent);
        }

        Assert.Equal(first.ConsumedEnergyJ, restarted.ConsumedEnergyJ);
        Assert.Equal(
            first.RemainingUsableEnergyJ,
            restarted.RemainingUsableEnergyJ);
        Assert.Equal(
            first.RemainingEnergyFraction,
            restarted.RemainingEnergyFraction);
        Assert.Equal(
            first.PlanningEnduranceSeconds,
            restarted.PlanningEnduranceSeconds);
    }

    [Fact]
    public void ActualFlightContactLoadsAndOffloadsPayloadExactlyOnce() {
        CasevacFlightRuntime runtime = CreateRuntime(out _);
        runtime.Begin(0);

        long terminalTick = FlyCompleteMission(runtime, maximumTicks: 100_000);

        Assert.True(
            terminalTick > 0,
            Describe(runtime));
        Assert.Equal(CasevacPhase.Complete, runtime.Snapshot.Phase);
        Assert.Equal(
            CapsuleCustody.AtReceiver,
            runtime.Snapshot.Custody);
        Assert.Contains(
            runtime.Snapshot.Disposition,
            new[] {
                CasevacDisposition.TransferredOnTime,
                CasevacDisposition.TransferredAfterRequestedTime
            });
        Assert.Equal(0.0, runtime.Snapshot.PayloadMassKg, 12);
        Assert.Equal(
            CasevacFlightRuntime.RecurringBaseMassKg,
            runtime.VehicleState.GrossMassKg,
            12);
        Assert.Equal(
            1,
            runtime.Evidence.GetEventCount(
                CasevacEventKind.CapsuleSecured));
        Assert.Equal(
            1,
            runtime.Evidence.GetEventCount(
                CasevacEventKind.HandoffCompleted));
        Assert.InRange(
            runtime.Snapshot.ActiveMissionTicks
                / (AircraftSim.TickHz * 60.0),
            6.5,
            12.0);
    }

    [Fact]
    public void QuietSkipDoesNotAdvanceVehicleClockEnergyOrEvidence() {
        CasevacFlightRuntime runtime = CreateRuntime(out _);

        Assert.False(runtime.RequestQuietSkip());
        runtime.Begin(0);
        Assert.False(runtime.RequestQuietSkip());
        long quietTick = FlyMissionUntilPhase(
            runtime,
            CasevacPhase.Quiet,
            maximumTicks: 100_000);

        Assert.True(quietTick > 0, Describe(runtime));
        CasevacMissionSnapshot before = runtime.Snapshot;
        PlayerVehicleState vehicleBefore = runtime.VehicleState;
        PlayerVehicleObservation observationBefore =
            runtime.VehicleObservation;
        double consumedEnergyBefore = runtime.ConsumedEnergyJ;
        long highestActiveTicksBefore =
            runtime.Evidence.HighestActiveMissionTicks;
        long routeObservedTicksBefore =
            runtime.Evidence.RouteObservedTicks;
        int missionEventCountBefore =
            runtime.Evidence.MissionEventCount;
        CasevacLandingZoneEvidence receiverEvidenceBefore =
            runtime.Evidence.GetLandingZoneEvidence(
                CasevacTerminalLeg.Receiver);

        Assert.True(runtime.RequestQuietSkip());

        CasevacMissionSnapshot complete = runtime.Snapshot;
        Assert.Equal(CasevacPhase.Complete, complete.Phase);
        Assert.True(runtime.IsTerminal);
        Assert.Equal(before.LastSourceTick, complete.LastSourceTick);
        Assert.Equal(before.ActiveMissionTicks, complete.ActiveMissionTicks);
        Assert.Equal(before.CallAgeTicks, complete.CallAgeTicks);
        Assert.Equal(before.QuietProgressTicks, complete.QuietProgressTicks);
        Assert.Equal(before.Custody, complete.Custody);
        Assert.Equal(before.Disposition, complete.Disposition);
        Assert.Equal(vehicleBefore, runtime.VehicleState);
        Assert.Equal(observationBefore, runtime.VehicleObservation);
        Assert.Equal(consumedEnergyBefore, runtime.ConsumedEnergyJ);
        Assert.Equal(
            highestActiveTicksBefore,
            runtime.Evidence.HighestActiveMissionTicks);
        Assert.Equal(
            routeObservedTicksBefore,
            runtime.Evidence.RouteObservedTicks);
        Assert.Equal(
            missionEventCountBefore,
            runtime.Evidence.MissionEventCount);
        Assert.Equal(
            receiverEvidenceBefore,
            runtime.Evidence.GetLandingZoneEvidence(
                CasevacTerminalLeg.Receiver));

        Assert.False(runtime.RequestQuietSkip());
        Assert.Equal(complete, runtime.Snapshot);
    }

    [Fact]
    public void SafeCompletedExposedFlightRecordsReplayBoundedRouteCorrection() {
        long sequence = 0;
        var runtime = new CasevacFlightRuntime(
            BuiltInCasevacDefinitions.CreatePrototype(),
            new FlatTerrain(0.0),
            weather: null,
            () => ++sequence);
        runtime.Begin(0);

        long terminalTick = FlyCompleteMission(runtime, maximumTicks: 100_000);
        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(runtime.Evidence, runtime.Snapshot);

        Assert.True(terminalTick > 0, Describe(runtime));
        Assert.Equal(CasevacAssessmentStatus.Pass, assessment.Safe.Status);
        Assert.Equal(
            CasevacAssessmentStatus.Pass,
            assessment.Controlled.Status);
        Assert.True(
            runtime.Evidence.RouteExposedTicks
                > runtime.Evidence.RouteMaskedTicks,
            $"masked={runtime.Evidence.RouteMaskedTicks} "
                + $"exposed={runtime.Evidence.RouteExposedTicks}");
        CasevacCorrectionRange routeCorrection = Assert.Single(
            runtime.Evidence.CorrectionRanges.ToArray(),
            range => range.Stream == CasevacEvidenceStream.Route);
        Assert.Equal(
            CasevacPrimaryCorrectionKind.ReviewRouteExposureWithinSafeBand,
            assessment.PrimaryCorrection.Kind);
        Assert.Equal(
            CasevacEvidenceStream.Route,
            assessment.PrimaryCorrection.Stream);
        Assert.Equal(
            routeCorrection.StartSourceTick,
            assessment.PrimaryCorrection.StartSourceTick);
        Assert.Equal(
            routeCorrection.EndSourceTick,
            assessment.PrimaryCorrection.EndSourceTick);

        CasevacEvidenceSample[] reviewedSamples =
            runtime.Evidence.RouteSamples.Span
                .ToArray()
                .Where(sample =>
                    sample.SourceTick >= routeCorrection.StartSourceTick
                    && sample.SourceTick <= routeCorrection.EndSourceTick)
                .ToArray();
        Assert.NotEmpty(reviewedSamples);
        Assert.All(reviewedSamples, sample => {
            Assert.False(sample.InsideTerminalVolume);
            Assert.True(
                sample.MaskingState == CasevacMaskingState.Exposed
                || !sample.WithinSafeMaskingBand);
        });
    }

    [Fact]
    public void LandingUsesExactPadSurfaceAndControllerHysteresis() {
        CasevacFlightRuntime runtime = CreateRuntime(out _);
        runtime.Begin(0);

        for (long tick = 1; tick <= 60_000; tick++) {
            CasevacPhase phase = runtime.Snapshot.Phase;
            CasevacFlightControlIntent intent = phase switch {
                CasevacPhase.Ingress
                    or CasevacPhase.PickupApproach
                    => AutopilotTo(
                        runtime,
                        runtime.PickupLocation,
                        land: true),
                CasevacPhase.Loading
                    => CasevacFlightControlIntent.Neutral,
                _ => CasevacFlightControlIntent.Neutral
            };
            runtime.Advance(tick, intent);
            if (runtime.Snapshot.Custody
                == CapsuleCustody.InAircraft)
                break;
        }

        Assert.True(
            runtime.Snapshot.Custody == CapsuleCustody.InAircraft,
            Describe(runtime));
        Assert.Equal(
            runtime.Course.World.Pickup.SurfaceTruthId,
            runtime.VehicleObservation.Contact.SurfaceId);
        Assert.True(
            runtime.VehicleObservation.Contact.IsStable);
        Assert.True(
            runtime.Evidence.GetEventCount(
                CasevacEventKind.StableContactEntered) >= 1);
        Assert.Equal(
            1,
            runtime.Evidence.GetEventCount(
                CasevacEventKind.CapsuleSecured));
        Assert.Equal(
            runtime.Course.Mission.CapsuleMassKg,
            runtime.Snapshot.PayloadMassKg,
            12);

        double beforeEnergyJ = runtime.RemainingUsableEnergyJ;
        long nextSourceTick =
            runtime.LastTickObservation!.Value.SourceTick + 1L;
        runtime.Advance(
            nextSourceTick,
            new CasevacFlightControlIntent(
                0.0,
                0.0,
                1.0,
                0.0));
        Assert.Equal(
            CasevacFlightRuntime.RecurringBaseMassKg
                + runtime.Course.Mission.CapsuleMassKg,
            runtime.VehicleObservation.GrossMassKg,
            12);
        Assert.True(
            runtime.VehicleObservation.Power.HoverPowerRequiredW
                > runtime.VehicleObservation.Power.AppliedPowerW);
        Assert.Equal(
            beforeEnergyJ
                - runtime.VehicleObservation.Power.AppliedPowerW
                    / AircraftSim.TickHz,
            runtime.RemainingUsableEnergyJ,
            7);
    }

    [Fact]
    public void CollisionAuthorityLatchesAnOccupiedOrEmptyAircraftLoss() {
        CasevacFlightRuntime runtime = CreateRuntime(out _);
        runtime.Begin(0);
        var pole = new CasevacResolvedLocation(
            "test-pole",
            -1_250.0,
            0.0,
            760.0,
            0.0,
            0.0);

        for (long tick = 1; tick <= 40_000; tick++) {
            CasevacFlightControlIntent intent =
                AutopilotTo(runtime, pole, land: false, targetAglM: 12.0);
            runtime.Advance(tick, intent);
            if (runtime.IsTerminal) break;
        }

        Assert.True(runtime.ObstacleCollisionLatched);
        Assert.False(runtime.VehicleFlyable);
        Assert.Equal(
            CasevacPhase.AircraftLost,
            runtime.Snapshot.Phase);
        Assert.Equal(
            CasevacDisposition.AircraftLostEmpty,
            runtime.Snapshot.Disposition);
        Assert.Equal(
            1,
            runtime.Evidence.GetEventCount(
                CasevacEventKind.CasevacAircraftLost));
        Assert.Equal(
            CasevacAircraftLossCause.CollisionAuthorityContact,
            runtime.Evidence.AircraftLossCause);
        Assert.Equal(
            runtime.Evidence.GetFirstEventSourceTick(
                CasevacEventKind.CasevacAircraftLost),
            runtime.Evidence.AircraftLossSourceTick);
    }

    [Fact]
    public void RotorWashVisualIsBoundedDeterministicAndDerivedFromTheFictionalProfile() {
        CasevacFlightRuntime first = CreateRuntime(out _);
        CasevacFlightRuntime replay = CreateRuntime(out _);
        double expectedRotorRadiusM = Math.Sqrt(
            ReducedOrderVerticalLiftProfile
                .FictionalAirAmbulancePrototype
                .RotorDiskAreaM2
            / Math.PI);
        Assert.Equal(0.0, first.RotorWashVisual.Intensity01);
        Assert.Equal(
            Math.Clamp(
                expectedRotorRadiusM
                    + 0.65 * first.Course.World.StartAglM,
                expectedRotorRadiusM,
                expectedRotorRadiusM * 3.0),
            first.RotorWashVisual.RadiusM,
            12);
        first.Begin(0);
        replay.Begin(10_000);

        long tick = 1;
        while ((first.LastTickObservation?.ClearanceM
                ?? first.Course.World.StartAglM)
                > expectedRotorRadiusM * 2.0
            && tick <= 8_000) {
            var intent = new CasevacFlightControlIntent(
                Forward: 0.0,
                Right: 0.0,
                Vertical: -0.5,
                Yaw: 0.0);
            first.Advance(tick, intent);
            replay.Advance(10_000 + tick, intent);
            tick++;
        }
        Assert.False(first.IsTerminal);
        var lift = new CasevacFlightControlIntent(
            Forward: 0.0,
            Right: 0.0,
            Vertical: 1.0,
            Yaw: 0.0);
        first.Advance(tick, lift);
        replay.Advance(10_000 + tick, lift);

        CasevacRotorWashVisual wash = first.RotorWashVisual;
        Assert.Equal(wash, replay.RotorWashVisual);
        Assert.InRange(wash.Intensity01, double.Epsilon, 1.0);
        Assert.InRange(
            wash.RadiusM,
            expectedRotorRadiusM,
            expectedRotorRadiusM * 3.0);
    }

    [Fact]
    public void PublishesImmutableCollisionPrimitivesInTheResolvedWorldFrame() {
        CasevacCourseDefinition course =
            BuiltInCasevacDefinitions.CreatePrototype();
        long sequence = 0;
        var runtime = new CasevacFlightRuntime(
            course,
            new FlatTerrain(40.0),
            weather: null,
            () => ++sequence);

        IReadOnlyList<CasevacResolvedCollisionObstacle> resolved =
            runtime.ResolvedCollisionObstacles;
        Assert.Equal(
            course.World.CollisionAuthority.Obstacles.Count,
            resolved.Count);
        var list = Assert.IsAssignableFrom<
            IList<CasevacResolvedCollisionObstacle>>(resolved);
        Assert.True(list.IsReadOnly);
        Assert.Throws<NotSupportedException>(() =>
            list.Add(resolved[0]));

        for (int index = 0; index < resolved.Count; index++) {
            CasevacCollisionObstacleDefinition authored =
                course.World.CollisionAuthority.Obstacles[index];
            CasevacResolvedCollisionObstacle obstacle =
                resolved[index];
            Assert.Equal(authored.Id, obstacle.Id);
            Assert.Equal(authored.Primitive, obstacle.Primitive);
            Assert.Equal(authored.RadiusM, obstacle.RadiusM, 12);
            Assert.Equal(
                authored.First + new Vec3D(0.0, 40.0, 0.0),
                obstacle.FirstWorldM);
            Assert.Equal(
                authored.Second + new Vec3D(0.0, 40.0, 0.0),
                obstacle.SecondWorldM);
        }
    }

    [Fact]
    public void PublishesImmutableRoutesWithPerControlPointTerrainElevations() {
        CasevacCourseDefinition course =
            BuiltInCasevacDefinitions.CreatePrototype();
        long sequence = 0;
        var runtime = new CasevacFlightRuntime(
            course,
            new CoordinateTerrain(),
            weather: null,
            () => ++sequence);

        IReadOnlyList<CasevacResolvedRoute> resolved =
            runtime.ResolvedRoutes;
        Assert.Equal(course.World.Routes.Count, resolved.Count);
        var routes = Assert.IsAssignableFrom<
            IList<CasevacResolvedRoute>>(resolved);
        Assert.True(routes.IsReadOnly);
        Assert.Throws<NotSupportedException>(() =>
            routes.Add(resolved[0]));

        var elevations = new List<double>();
        for (int routeIndex = 0;
            routeIndex < resolved.Count;
            routeIndex++) {
            CasevacRouteDefinition authored =
                course.World.Routes[routeIndex];
            CasevacResolvedRoute route = resolved[routeIndex];
            Assert.Equal(authored.Id, route.Id);
            Assert.Equal(authored.Leg, route.Leg);
            Assert.Equal(authored.StartLocationId, route.StartLocationId);
            Assert.Equal(authored.EndLocationId, route.EndLocationId);
            Assert.Equal(
                authored.HorizontalLengthM,
                route.HorizontalLengthM,
                12);
            Assert.Equal(authored.Points.Count, route.Points.Count);
            var points = Assert.IsAssignableFrom<
                IList<CasevacResolvedRouteControlPoint>>(route.Points);
            Assert.True(points.IsReadOnly);
            Assert.Throws<NotSupportedException>(() =>
                points.Add(route.Points[0]));

            for (int pointIndex = 0;
                pointIndex < route.Points.Count;
                pointIndex++) {
                CasevacRouteControlPointDefinition authoredPoint =
                    authored.Points[pointIndex];
                CasevacResolvedRouteControlPoint point =
                    route.Points[pointIndex];
                Assert.Equal(authoredPoint.Id, point.Id);
                Assert.Equal(authoredPoint.Position.XM, point.EastM);
                Assert.Equal(authoredPoint.Position.ZM, point.NorthM);
                Assert.Equal(
                    CoordinateTerrain.HeightAt(
                        point.EastM,
                        point.NorthM),
                    point.SurfaceElevationM,
                    12);
                Assert.Equal(
                    authoredPoint.TargetAglM,
                    point.TargetAglM);
                Assert.Equal(
                    authoredPoint.CorridorRadiusM,
                    point.CorridorRadiusM);
                elevations.Add(point.SurfaceElevationM);
            }
        }
        Assert.True(elevations.Distinct().Count() > 1);
    }

    [Fact]
    public void MissingTerrainFailsMaskingClosedWithoutClinicalOrOpponentState() {
        CasevacFlightRuntime runtime = CreateRuntime(out _);
        runtime.Begin(0);
        runtime.Advance(1, CasevacFlightControlIntent.Neutral);

        Assert.Equal(
            CasevacMaskingState.NotAssessed,
            runtime.LastExposure.MaskingState);
        string publicSurface = string.Join(
            "|",
            typeof(CasevacFlightRuntime)
                .GetProperties()
                .Select(property => property.Name))
            .ToLowerInvariant();
        Assert.DoesNotContain("patient", publicSurface);
        Assert.DoesNotContain("clinical", publicSurface);
        Assert.DoesNotContain("diagnos", publicSurface);
        Assert.DoesNotContain("treatment", publicSurface);
        Assert.DoesNotContain("opponent", publicSurface);
    }

    static CasevacFlightRuntime CreateRuntime(
        out Func<long> allocator) {
        long sequence = 0;
        allocator = () => ++sequence;
        return new CasevacFlightRuntime(
            BuiltInCasevacDefinitions.CreatePrototype(),
            terrain: null,
            weather: null,
            allocator);
    }

    static long FlyCompleteMission(
        CasevacFlightRuntime runtime,
        int maximumTicks) =>
        FlyMissionUntilPhase(
            runtime,
            CasevacPhase.Complete,
            maximumTicks);

    static long FlyMissionUntilPhase(
        CasevacFlightRuntime runtime,
        CasevacPhase targetPhase,
        int maximumTicks) {
        for (long tick = 1; tick <= maximumTicks; tick++) {
            CasevacFlightControlIntent intent =
                runtime.Snapshot.Phase switch {
                    CasevacPhase.Ingress
                        or CasevacPhase.PickupApproach
                        => AutopilotTo(
                            runtime,
                            runtime.PickupLocation,
                            land: true),
                    CasevacPhase.Loading
                        => CasevacFlightControlIntent.Neutral,
                    CasevacPhase.Outbound
                        or CasevacPhase.DropoffApproach
                        => AutopilotTo(
                            runtime,
                            runtime.ReceiverLocation,
                            land: true),
                    CasevacPhase.Handoff
                        or CasevacPhase.Quiet
                        => CasevacFlightControlIntent.Neutral,
                    _ => CasevacFlightControlIntent.Neutral
                };
            runtime.Advance(tick, intent);
            if (runtime.Snapshot.Phase == targetPhase)
                return tick;
        }
        return -1;
    }

    static CasevacFlightControlIntent AutopilotTo(
        CasevacFlightRuntime runtime,
        in CasevacResolvedLocation target,
        bool land,
        double targetAglM = 34.0) {
        PlayerVehicleObservation observation =
            runtime.VehicleObservation;
        double dx = target.EastM
            - observation.PositionWorldM.X;
        double dz = target.NorthM
            - observation.PositionWorldM.Z;
        double distanceM = Math.Sqrt(dx * dx + dz * dz);
        double desiredSpeedMps = Math.Min(
            CasevacFlightRuntime.MaximumForwardSpeedMps,
            distanceM * (land ? 0.12 : 0.20));
        if (land && distanceM < 3.0)
            desiredSpeedMps = 0.0;
        double inverseDistance =
            distanceM > 1e-9 ? 1.0 / distanceM : 0.0;
        double desiredEastMps =
            dx * inverseDistance * desiredSpeedMps;
        double desiredNorthMps =
            dz * inverseDistance * desiredSpeedMps;
        double yaw = observation.YawRad;
        double forwardEast = Math.Sin(yaw);
        double forwardNorth = Math.Cos(yaw);
        double rightEast = Math.Cos(yaw);
        double rightNorth = -Math.Sin(yaw);
        double desiredForwardMps =
            desiredEastMps * forwardEast
            + desiredNorthMps * forwardNorth;
        double desiredRightMps =
            desiredEastMps * rightEast
            + desiredNorthMps * rightNorth;
        double forwardIntent = desiredForwardMps >= 0.0
            ? desiredForwardMps
                / CasevacFlightRuntime.MaximumForwardSpeedMps
            : desiredForwardMps
                / CasevacFlightRuntime.MaximumReverseSpeedMps;
        double rightIntent = desiredRightMps
            / CasevacFlightRuntime.MaximumLateralSpeedMps;

        double targetHeightM = target.SurfaceElevationM
            + (land && distanceM < 12.0 ? 1.5 : targetAglM);
        double heightErrorM =
            targetHeightM - observation.PositionWorldM.Y;
        double desiredVerticalSpeedMps = Math.Clamp(
            heightErrorM * 0.20,
            -1.4,
            1.6);
        if (land && distanceM < 3.0
            && observation.Contact.IsInContact)
            desiredVerticalSpeedMps = 0.0;

        double desiredBearing = distanceM > 1e-9
            ? Math.Atan2(dx, dz)
            : yaw;
        double yawError = WrapPi(desiredBearing - yaw);
        return new CasevacFlightControlIntent(
            Math.Clamp(forwardIntent, -1.0, 1.0),
            Math.Clamp(rightIntent, -1.0, 1.0),
            Math.Clamp(
                desiredVerticalSpeedMps
                    / CasevacFlightRuntime.MaximumVerticalSpeedMps,
                -1.0,
                1.0),
            Math.Clamp(yawError * 1.8, -1.0, 1.0));
    }

    static double WrapPi(double value) {
        while (value > Math.PI) value -= 2.0 * Math.PI;
        while (value < -Math.PI) value += 2.0 * Math.PI;
        return value;
    }

    static string Describe(CasevacFlightRuntime runtime) {
        PlayerVehicleObservation observation =
            runtime.VehicleObservation;
        return $"phase={runtime.Snapshot.Phase} "
            + $"custody={runtime.Snapshot.Custody} "
            + $"pos=({observation.PositionWorldM.X:F1},"
            + $"{observation.PositionWorldM.Y:F1},"
            + $"{observation.PositionWorldM.Z:F1}) "
            + $"vel=({observation.GroundVelocityMps.X:F1},"
            + $"{observation.GroundVelocityMps.Y:F1},"
            + $"{observation.GroundVelocityMps.Z:F1}) "
            + $"contact={observation.Contact.Kind}/"
            + $"{observation.Contact.SurfaceId ?? "none"} "
            + $"lz={runtime.LastLandingZone.SiteId ?? "none"}/"
            + $"{runtime.LastLandingZone.GateClass} "
            + $"stable={runtime.Snapshot.StableContact} "
            + $"stabilize={runtime.Snapshot.StabilizationProgressTicks} "
            + $"operation={runtime.Snapshot.OperationProgressTicks}/"
            + $"{runtime.Snapshot.OperationRequiredTicks}";
    }
}
