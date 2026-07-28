namespace GunsOnly.Sim.Casevac;

/// <summary>
/// One self-consistent mission/world bundle. The mission kernel and scenery resolver receive the
/// same immutable site and exposure objects, preventing an ID-only staging path from drifting away
/// from the geometry used for gates and evidence.
/// </summary>
public sealed class CasevacCourseDefinition {
    public CasevacCourseDefinition(
        CasevacScenarioDefinition mission,
        CasevacWorldDefinition world) {
        Mission = mission ?? throw new ArgumentNullException(nameof(mission));
        World = world ?? throw new ArgumentNullException(nameof(world));
        if (!ReferenceEquals(Mission.Pickup, World.Pickup)
            || !ReferenceEquals(Mission.Receiver, World.Receiver)
            || !ReferenceEquals(Mission.ExposureField, World.ExposureField)
            || !StringComparer.Ordinal.Equals(
                Mission.SafeExitVolumeId, World.SafeExit.Id))
            throw new ArgumentException(
                "A CASEVAC course must share exact mission and world authority definitions.");
    }

    public CasevacScenarioDefinition Mission { get; }
    public CasevacWorldDefinition World { get; }
}

/// <summary>
/// Stable headless content for the first flight-first CASEVAC prototype. Coordinates use the
/// scenario's local east/up/north frame; local surface datum zero is translated to authoritative
/// terrain height once when the world is staged.
/// </summary>
public static class BuiltInCasevacDefinitions {
    public const string MissionId =
        "mission.ukraine-2030s.casevac-low-level.prototype.v1";
    public const string WorldId =
        "world.ukraine-2030s.casevac-low-level.prototype.v1";
    public const string AircraftId =
        "aircraft.casevac-air-ambulance.prototype.v1";
    public const string CapsuleId =
        "payload.evacuation-capsule.prototype.v1";
    public const string StartLocationId =
        "location.ukraine.casevac-start-a.v1";
    public const string PickupLocationId =
        "location.ukraine.casevac-pickup-a.v1";
    public const string ReceiverLocationId =
        "location.ukraine.casevac-handoff-a.v1";
    public const string SafeExitVolumeId =
        "volume.ukraine.casevac-safe-exit-a.v1";
    public const string ExposureFieldId =
        "exposure.ukraine.casevac-corridor.prototype.v1";
    public const string LandingGateProfileId =
        "gate.vertical-lift.casevac.prototype.v1";
    public const string CollisionAuthorityId =
        "collision.ukraine.casevac-corridor.prototype.v1";
    public const string PickupSurfaceAuthoritySignature =
        "sha256:c1d29251e948a4d7f9196bf46ddf847c8e6a0bab4379c3eb622b7ccf67bfdbc0";
    public const string PickupObstacleAuthoritySignature =
        CorridorObstacleAuthoritySignature;
    public const string ReceiverSurfaceAuthoritySignature =
        "sha256:ada55a85ae99ea933f0f79e86d2b9e46b76a1a6fcebd5d020b57809977c30fdd";
    public const string ReceiverObstacleAuthoritySignature =
        CorridorObstacleAuthoritySignature;
    public const string CorridorTerrainAuthoritySignature =
        "sha256:8752db7ee132076366b05553246681df9aa4849ad93ee9cfdb4f37dad321869d";
    public const string CorridorObstacleAuthoritySignature =
        "sha256:ecfb4ee415ef462540c0a2d24e8180d83b4f50d2d947fc1c7745b37eef372c00";

    public const int AuthorityTickHz = (int)AircraftSim.TickHz;

    public static CasevacCourseDefinition Prototype { get; } =
        CreatePrototype();

    public static CasevacCourseDefinition CreatePrototype() {
        LandingZoneGateProfileDefinition gateProfile = CreateGateProfile();
        LandingZoneDefinition pickup = CreateLandingZone(
            PickupLocationId,
            new CasevacHorizontalPoint(0.0, 0.0),
            gateProfile);
        LandingZoneDefinition receiver = CreateLandingZone(
            ReceiverLocationId,
            new CasevacHorizontalPoint(3_200.0, -2_400.0),
            gateProfile);
        var start = new CasevacHorizontalPoint(-2_500.0, 1_800.0);
        var safeExit = new CasevacSafeExitVolumeDefinition(
            SafeExitVolumeId,
            centre: new CasevacHorizontalPoint(-2_850.0, 2_050.0),
            surfaceDatumM: 0.0,
            radiusM: 350.0,
            heightM: 240.0);
        ExposureFieldDefinition exposureField = CreateExposureField();
        CasevacCollisionAuthorityDefinition collisionAuthority =
            CreateCollisionAuthority();
        CasevacRouteDefinition[] routes = CreateRoutes(
            start, pickup.Centre, receiver.Centre);
        var world = new CasevacWorldDefinition(
            WorldId,
            StartLocationId,
            start,
            startSurfaceDatumM: 0.0,
            startAglM: 34.0,
            pickup,
            receiver,
            safeExit,
            exposureField,
            collisionAuthority,
            routes);
        var mission = new CasevacScenarioDefinition(
            MissionId,
            AircraftId,
            CapsuleId,
            pickup,
            receiver,
            safeExit.Id,
            exposureField,
            initialCallAgeTicks: 2 * 60 * AuthorityTickHz,
            requestedHandoffAgeTicks: 8 * 60 * AuthorityTickHz,
            stabilizationDwellTicks: 2 * AuthorityTickHz,
            loadingDwellTicks: 9 * AuthorityTickHz,
            handoffDwellTicks: 9 * AuthorityTickHz,
            quietAftermathTicks: 4 * AuthorityTickHz,
            capsuleMassKg: 285.0);
        return new CasevacCourseDefinition(mission, world);
    }

    static LandingZoneGateProfileDefinition CreateGateProfile() => new(
        LandingGateProfileId,
        version: 1,
        maximumEnterLateralGroundSpeedMps: 0.45,
        maximumExitLateralGroundSpeedMps: 0.9,
        maximumEnterAbsoluteVerticalSpeedMps: 0.25,
        maximumExitAbsoluteVerticalSpeedMps: 0.55,
        maximumEnterAbsolutePitchRad: DegreesToRadians(5.0),
        maximumExitAbsolutePitchRad: DegreesToRadians(9.0),
        maximumEnterAbsoluteBankRad: DegreesToRadians(5.0),
        maximumExitAbsoluteBankRad: DegreesToRadians(9.0));

    static LandingZoneDefinition CreateLandingZone(
        string id,
        in CasevacHorizontalPoint centre,
        LandingZoneGateProfileDefinition gateProfile) {
        bool isPickup = StringComparer.Ordinal.Equals(id, PickupLocationId);
        string surfaceSignature = isPickup
            ? PickupSurfaceAuthoritySignature
            : ReceiverSurfaceAuthoritySignature;
        string obstacleSignature = isPickup
            ? PickupObstacleAuthoritySignature
            : ReceiverObstacleAuthoritySignature;
        return new LandingZoneDefinition(
        id,
        surfaceTruthId: $"{id}.surface.v1",
        surfaceAuthorityHash: surfaceSignature,
        obstacleAuthorityHash: obstacleSignature,
        approachPathId: $"{id}.approach.v1",
        escapePathId: $"{id}.escape.v1",
        gateProfile,
        centre,
        surfaceDatumM: 0.0,
        enterFootprintRadiusM: 6.0,
        exitFootprintRadiusM: 8.5,
        terminalRadiusM: 180.0,
        terminalHeightM: 120.0);
    }

    static ExposureFieldDefinition CreateExposureField() => new(
        ExposureFieldId,
        version: 1,
        terrainAuthorityHash: CorridorTerrainAuthoritySignature,
        obstacleAuthorityHash: CorridorObstacleAuthoritySignature,
        safeBandMinimumAglM: 12.0,
        safeBandMaximumAglM: 42.0,
        ExposureSamplingRule.SectorTerrainRaycastV1,
        sectors: [
            new ExposureObservationSectorDefinition(
                "sector.casevac.observer-northeast.v1",
                observerOrigin: new CasevacHorizontalPoint(1_800.0, 1_200.0),
                centreAzimuthRad: DegreesToRadians(-135.0),
                halfWidthRad: DegreesToRadians(32.0),
                maximumRangeM: 7_000.0,
                raySampleCount: 64),
            new ExposureObservationSectorDefinition(
                "sector.casevac.observer-south.v1",
                observerOrigin: new CasevacHorizontalPoint(900.0, -3_600.0),
                centreAzimuthRad: DegreesToRadians(25.0),
                halfWidthRad: DegreesToRadians(38.0),
                maximumRangeM: 7_500.0,
                raySampleCount: 72)
        ]);

    static CasevacCollisionAuthorityDefinition CreateCollisionAuthority() =>
        new(
            CollisionAuthorityId,
            CorridorObstacleAuthoritySignature,
            [
                CasevacCollisionObstacleDefinition.CapsuleSegment(
                    "obstacle.casevac.power-pole-west.v1",
                    new Vec3D(-1_250.0, 0.0, 760.0),
                    new Vec3D(-1_250.0, 22.0, 760.0),
                    radiusM: 0.35),
                CasevacCollisionObstacleDefinition.CapsuleSegment(
                    "obstacle.casevac.power-pole-east.v1",
                    new Vec3D(-1_110.0, 0.0, 620.0),
                    new Vec3D(-1_110.0, 20.0, 620.0),
                    radiusM: 0.35),
                CasevacCollisionObstacleDefinition.CapsuleSegment(
                    "obstacle.casevac.wire-crossing.v1",
                    new Vec3D(-1_250.0, 22.0, 760.0),
                    new Vec3D(-1_110.0, 20.0, 620.0),
                    radiusM: 0.08),
                CasevacCollisionObstacleDefinition.AxisAlignedBox(
                    "obstacle.casevac.orchard-exclusion.v1",
                    new Vec3D(-650.0, 0.0, -50.0),
                    new Vec3D(-250.0, 28.0, 350.0)),
                CasevacCollisionObstacleDefinition.AxisAlignedBox(
                    "obstacle.casevac.clinic-exclusion.v1",
                    new Vec3D(3_300.0, 0.0, -2_520.0),
                    new Vec3D(3_460.0, 34.0, -2_280.0))
            ]);

    static CasevacRouteDefinition[] CreateRoutes(
        in CasevacHorizontalPoint start,
        in CasevacHorizontalPoint pickup,
        in CasevacHorizontalPoint receiver) => [
        Route(
            "route.casevac.ingress-direct.v1",
            CasevacRouteLeg.Ingress,
            StartLocationId,
            PickupLocationId,
            [
                Point("ingress-direct.start", start, 34.0, 140.0),
                Point("ingress-direct.orchard-gap",
                    new(-1_350.0, 900.0), 30.0, 110.0),
                Point("ingress-direct.pickup", pickup, 20.0, 85.0)
            ]),
        Route(
            "route.casevac.ingress-masked.v1",
            CasevacRouteLeg.Ingress,
            StartLocationId,
            PickupLocationId,
            [
                Point("ingress-masked.start", start, 34.0, 140.0),
                Point("ingress-masked.shelterbelt-west",
                    new(-2_250.0, 1_200.0), 25.0, 95.0),
                Point("ingress-masked.rail-cut",
                    new(-1_600.0, 420.0), 22.0, 85.0),
                Point("ingress-masked.orchard-south",
                    new(-700.0, -180.0), 20.0, 80.0),
                Point("ingress-masked.pickup", pickup, 20.0, 85.0)
            ]),
        Route(
            "route.casevac.outbound-direct.v1",
            CasevacRouteLeg.Outbound,
            PickupLocationId,
            ReceiverLocationId,
            [
                Point("outbound-direct.pickup", pickup, 22.0, 85.0),
                Point("outbound-direct.canal-crossing",
                    new(1_600.0, -1_200.0), 34.0, 125.0),
                Point("outbound-direct.receiver", receiver, 20.0, 90.0)
            ]),
        Route(
            "route.casevac.outbound-masked.v1",
            CasevacRouteLeg.Outbound,
            PickupLocationId,
            ReceiverLocationId,
            [
                Point("outbound-masked.pickup", pickup, 22.0, 85.0),
                Point("outbound-masked.willow-drain",
                    new(650.0, -350.0), 24.0, 90.0),
                Point("outbound-masked.sunken-road",
                    new(900.0, -1_300.0), 22.0, 85.0),
                Point("outbound-masked.factory-wall",
                    new(1_600.0, -2_500.0), 25.0, 95.0),
                Point("outbound-masked.quarry-lip",
                    new(2_400.0, -3_000.0), 23.0, 90.0),
                Point("outbound-masked.clinic-west",
                    new(3_000.0, -2_900.0), 22.0, 85.0),
                Point("outbound-masked.receiver", receiver, 20.0, 90.0)
            ])
    ];

    static CasevacRouteDefinition Route(
        string id,
        CasevacRouteLeg leg,
        string startLocationId,
        string endLocationId,
        IEnumerable<CasevacRouteControlPointDefinition> points) => new(
        id, leg, startLocationId, endLocationId, points);

    static CasevacRouteControlPointDefinition Point(
        string localId,
        in CasevacHorizontalPoint position,
        double targetAglM,
        double corridorRadiusM) => new(
        $"route-point.casevac.{localId}.v1",
        position,
        targetAglM,
        corridorRadiusM);

    static double DegreesToRadians(double degrees) =>
        degrees * System.Math.PI / 180.0;
}
