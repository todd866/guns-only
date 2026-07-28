using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Casevac;

public class CasevacFlightRuntimeTests {
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
            if (runtime.Snapshot.Phase == CasevacPhase.Complete)
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
