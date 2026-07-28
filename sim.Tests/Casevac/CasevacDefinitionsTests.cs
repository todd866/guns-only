using System.Collections.ObjectModel;
using GunsOnly.Sim.Casevac;

namespace GunsOnly.Sim.Tests.Casevac;

public class CasevacDefinitionsTests {
    [Fact]
    public void HorizontalPointRequiresFiniteCoordinatesAndMeasuresInXZ() {
        var first = new CasevacHorizontalPoint(-3.0, 4.0);
        var second = new CasevacHorizontalPoint(1.0, 1.0);

        Assert.Equal(-3.0, first.XM);
        Assert.Equal(4.0, first.ZM);
        Assert.Equal(25.0, first.HorizontalDistanceSquared(second));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new CasevacHorizontalPoint(double.NaN, 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new CasevacHorizontalPoint(0.0, double.PositiveInfinity));
    }

    [Fact]
    public void GateProfilePreservesVersionedVisibleEnterAndExitLimits() {
        LandingZoneGateProfileDefinition profile = GateProfile();

        Assert.Equal("vertical-lift-gate.v1", profile.Id);
        Assert.Equal(1, profile.Version);
        Assert.Equal(0.5, profile.MaximumEnterLateralGroundSpeedMps);
        Assert.Equal(1.0, profile.MaximumExitLateralGroundSpeedMps);
        Assert.Equal(0.3, profile.MaximumEnterAbsoluteVerticalSpeedMps);
        Assert.Equal(0.6, profile.MaximumExitAbsoluteVerticalSpeedMps);
        Assert.Equal(0.1, profile.MaximumEnterAbsolutePitchRad);
        Assert.Equal(0.2, profile.MaximumExitAbsolutePitchRad);
        Assert.Equal(0.12, profile.MaximumEnterAbsoluteBankRad);
        Assert.Equal(0.24, profile.MaximumExitAbsoluteBankRad);
    }

    [Theory]
    [InlineData(0.0, 1.0)]
    [InlineData(-0.1, 1.0)]
    [InlineData(double.NaN, 1.0)]
    [InlineData(double.PositiveInfinity, 1.0)]
    [InlineData(1.0, 1.0)]
    [InlineData(1.0, 0.9)]
    [InlineData(1.0, double.NaN)]
    [InlineData(1.0, double.PositiveInfinity)]
    public void GateProfileRequiresFinitePositiveStrictHysteresis(
        double enter,
        double exit) {
        Assert.Throws<ArgumentOutOfRangeException>(() => GateProfile(
            maximumEnterLateralGroundSpeedMps: enter,
            maximumExitLateralGroundSpeedMps: exit));
    }

    [Fact]
    public void GateProfileRejectsInvalidIdentityVersionAndEveryLimitPair() {
        Assert.Throws<ArgumentException>(
            () => GateProfile(id: " "));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => GateProfile(version: 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => GateProfile(
            maximumEnterAbsoluteVerticalSpeedMps: 0.6,
            maximumExitAbsoluteVerticalSpeedMps: 0.6));
        Assert.Throws<ArgumentOutOfRangeException>(() => GateProfile(
            maximumEnterAbsolutePitchRad: 0.2,
            maximumExitAbsolutePitchRad: 0.1));
        Assert.Throws<ArgumentOutOfRangeException>(() => GateProfile(
            maximumEnterAbsoluteBankRad: double.NaN));
    }

    [Fact]
    public void LandingZonePreservesOnlyAuthorityReferencesAndGateProfile() {
        LandingZoneGateProfileDefinition profile = GateProfile();
        LandingZoneDefinition site = Site("pickup-a", profile);

        Assert.Equal("pickup-a", site.Id);
        Assert.Equal("pickup-a.surface.v1", site.SurfaceTruthId);
        Assert.Equal("sha256:pickup-a-surface", site.SurfaceAuthorityHash);
        Assert.Equal("sha256:pickup-a-obstacles", site.ObstacleAuthorityHash);
        Assert.Equal("pickup-a.approach.v1", site.ApproachPathId);
        Assert.Equal("pickup-a.escape.v1", site.EscapePathId);
        Assert.Same(profile, site.GateProfile);
    }

    [Theory]
    [InlineData("id")]
    [InlineData("surfaceTruthId")]
    [InlineData("surfaceAuthorityHash")]
    [InlineData("obstacleAuthorityHash")]
    [InlineData("approachPathId")]
    [InlineData("escapePathId")]
    public void LandingZoneRequiresEveryStableAuthorityIdentity(string field) {
        foreach (string? invalid in new string?[] { null, "", " \t" }) {
            ArgumentException error = Assert.Throws<ArgumentException>(() =>
                SiteWithInvalidIdentity(field, invalid));
            Assert.Equal(field, error.ParamName);
        }
        Assert.Throws<ArgumentNullException>(() => new LandingZoneDefinition(
            "pickup-a",
            "pickup-a.surface.v1",
            "surface-hash",
            "obstacle-hash",
            "pickup-a.approach.v1",
            "pickup-a.escape.v1",
            gateProfile: null!));
    }

    [Fact]
    public void LandingZoneResolvesAdvanceHoldAndBreakFromOneGateProfile() {
        LandingZoneDefinition site = Site("pickup-a");

        LandingZoneObservation advance = site.Observe(
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps: 0.5,
            verticalSpeedMps: -0.3,
            pitchRad: 0.1,
            bankRad: -0.12,
            approachAttemptId: 7);
        LandingZoneObservation hold = site.Observe(
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps: 0.75,
            verticalSpeedMps: -0.3,
            pitchRad: 0.1,
            bankRad: -0.12,
            approachAttemptId: 7);
        LandingZoneObservation @break = site.Observe(
            insideTerminalVolume: true,
            insideEnterFootprint: false,
            insideExitFootprint: false,
            surfaceContact: false,
            lateralGroundSpeedMps: 1.01,
            verticalSpeedMps: -0.61,
            pitchRad: 0.21,
            bankRad: -0.25,
            approachAttemptId: 7);

        Assert.Equal(LandingZoneGateClass.Advance, advance.GateClass);
        Assert.Equal(LandingZoneGateViolation.None, advance.EnterViolations);
        Assert.Equal(7, advance.ApproachAttemptId);

        Assert.Equal(LandingZoneGateClass.Hold, hold.GateClass);
        Assert.Equal(
            LandingZoneGateViolation.LateralGroundSpeed,
            hold.EnterViolations);
        Assert.Equal(LandingZoneGateViolation.None, hold.ExitViolations);

        Assert.Equal(LandingZoneGateClass.Break, @break.GateClass);
        Assert.Equal(
            LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact
                | LandingZoneGateViolation.LateralGroundSpeed
                | LandingZoneGateViolation.VerticalSpeed
                | LandingZoneGateViolation.Pitch
                | LandingZoneGateViolation.Bank,
            @break.ExitViolations);
        Assert.Equal(
            @break.ExitViolations,
            @break.EnterViolations
                & ~LandingZoneGateViolation.OutsideEnterFootprint);
    }

    [Fact]
    public void LandingZoneOwnsNestedWorldGeometryAndResolvesFromVehiclePosition() {
        LandingZoneDefinition site = GeometricSite();

        Assert.Equal(new CasevacHorizontalPoint(100.0, -50.0), site.Centre);
        Assert.Equal(12.0, site.SurfaceDatumM);
        Assert.Equal(5.0, site.EnterFootprintRadiusM);
        Assert.Equal(8.0, site.ExitFootprintRadiusM);
        Assert.Equal(150.0, site.TerminalRadiusM);
        Assert.Equal(100.0, site.TerminalHeightM);
        Assert.True(site.IsInsideTerminal(new Vec3D(110.0, 32.0, -45.0)));
        Assert.False(site.IsInsideTerminal(new Vec3D(110.0, 112.01, -45.0)));
        Assert.True(site.IsInsideEnterFootprint(
            new Vec3D(103.0, 12.0, -46.0)));
        Assert.True(site.IsInsideExitFootprint(
            new Vec3D(108.0, 12.0, -50.0)));

        LandingZoneObservation stable = site.Observe(
            new Vec3D(103.0, 12.0, -46.0),
            surfaceContact: true,
            lateralGroundSpeedMps: 0.2,
            verticalSpeedMps: -0.1,
            pitchRad: 0.01,
            bankRad: -0.01,
            approachAttemptId: 4);
        LandingZoneObservation outside = site.Observe(
            new Vec3D(100.0, 150.0, -50.0),
            surfaceContact: true,
            lateralGroundSpeedMps: 0.0,
            verticalSpeedMps: 0.0,
            pitchRad: 0.0,
            bankRad: 0.0);

        Assert.Equal(LandingZoneGateClass.Advance, stable.GateClass);
        Assert.Equal(4, stable.ApproachAttemptId);
        Assert.Equal(LandingZoneGateClass.Break, outside.GateClass);
        Assert.Null(outside.SiteId);
        Assert.False(outside.SurfaceContact);
    }

    [Fact]
    public void LandingZoneGeometryRequiresStrictlyNestedPositiveVolumes() {
        Assert.Throws<ArgumentOutOfRangeException>(() => GeometricSite(
            enterFootprintRadiusM: 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => GeometricSite(
            enterFootprintRadiusM: 8.0,
            exitFootprintRadiusM: 8.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => GeometricSite(
            exitFootprintRadiusM: 150.0,
            terminalRadiusM: 150.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => GeometricSite(
            terminalHeightM: double.PositiveInfinity));
        Assert.Throws<ArgumentOutOfRangeException>(() => GeometricSite(
            surfaceDatumM: double.NaN));
    }

    [Fact]
    public void LandingZoneResolutionRejectsImpossibleGeometryAndAttemptIdentity() {
        LandingZoneDefinition site = Site("pickup-a");

        Assert.Throws<ArgumentException>(() => site.Observe(
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: false,
            surfaceContact: true,
            0.0, 0.0, 0.0, 0.0));
        Assert.Throws<ArgumentException>(() => site.Observe(
            insideTerminalVolume: false,
            insideEnterFootprint: false,
            insideExitFootprint: false,
            surfaceContact: true,
            0.0, 0.0, 0.0, 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => site.Observe(
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            0.0, 0.0, 0.0, 0.0,
            approachAttemptId: -1));
    }

    [Fact]
    public void ExposureDefinitionDefensivelyCopiesOrderedSectors() {
        var sectors = new List<ExposureObservationSectorDefinition> {
            Sector("north", 0.0),
            Sector("east", System.Math.PI / 2.0)
        };
        ExposureFieldDefinition field = Exposure(sectors: sectors);
        sectors.Clear();

        Assert.Equal("exposure.soniachne.v1", field.Id);
        Assert.Equal(1, field.Version);
        Assert.Equal("sha256:terrain", field.TerrainAuthorityHash);
        Assert.Equal("sha256:obstacles", field.ObstacleAuthorityHash);
        Assert.Equal(8.0, field.SafeBandMinimumAglM);
        Assert.Equal(35.0, field.SafeBandMaximumAglM);
        Assert.Equal(
            ExposureSamplingRule.SectorTerrainRaycastV1,
            field.SamplingRule);
        Assert.Equal(new[] { "north", "east" },
            field.Sectors.Select(sector => sector.Id));
        Assert.IsType<ReadOnlyCollection<ExposureObservationSectorDefinition>>(
            field.Sectors);
        Assert.Equal(
            CasevacHorizontalPoint.Zero,
            field.Sectors[0].ObserverOrigin);
    }

    [Fact]
    public void ExposureDefinitionRejectsInvalidProvenanceBandRuleAndSectors() {
        Assert.Throws<ArgumentException>(
            () => Exposure(id: " "));
        Assert.Throws<ArgumentException>(
            () => Exposure(terrainAuthorityHash: ""));
        Assert.Throws<ArgumentException>(
            () => Exposure(obstacleAuthorityHash: " "));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Exposure(version: 0));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Exposure(safeBandMinimumAglM: -0.01));
        Assert.Throws<ArgumentOutOfRangeException>(() => Exposure(
            safeBandMinimumAglM: 8.0,
            safeBandMaximumAglM: 8.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => Exposure(
            samplingRule: (ExposureSamplingRule)99));
        Assert.Throws<ArgumentNullException>(
            () => new ExposureFieldDefinition(
                "exposure",
                1,
                "terrain",
                "obstacles",
                8.0,
                35.0,
                ExposureSamplingRule.SectorTerrainRaycastV1,
                sectors: null!));
        Assert.Throws<ArgumentException>(
            () => Exposure(sectors: []));
        Assert.Throws<ArgumentException>(() => Exposure(
            sectors: [Sector("north", 0.0), Sector("north", 1.0)]));
        Assert.Throws<ArgumentException>(() => Exposure(
            sectors: [Sector("north", 0.0), null!]));
    }

    [Fact]
    public void ExposureSectorRejectsInvalidAngularRangeAndSamplingInputs() {
        Assert.Throws<ArgumentException>(
            () => Sector(" ", 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Sector("north", System.Math.PI + 0.01));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Sector("north", 0.0, halfWidthRad: 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Sector("north", 0.0, maximumRangeM: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Sector("north", 0.0, raySampleCount: 0));
    }

    [Fact]
    public void ExposureObservationFailsClosedOnAuthorityMismatch() {
        ExposureFieldDefinition field = Exposure();

        CasevacExposureObservation terrainMismatch = field.Observe(
            aglM: 20.0,
            terrainAuthorityHash: "sha256:wrong",
            obstacleAuthorityHash: field.ObstacleAuthorityHash,
            sectorOccluded: [true, true]);
        CasevacExposureObservation obstacleMismatch = field.Observe(
            aglM: 20.0,
            terrainAuthorityHash: field.TerrainAuthorityHash,
            obstacleAuthorityHash: "sha256:wrong",
            sectorOccluded: [true, true]);

        Assert.Equal(
            CasevacMaskingState.NotAssessed,
            terrainMismatch.MaskingState);
        Assert.True(terrainMismatch.WithinSafeMaskingBand);
        Assert.Equal(
            CasevacMaskingState.NotAssessed,
            obstacleMismatch.MaskingState);
    }

    [Theory]
    [InlineData(8.0, true, true, CasevacMaskingState.Masked)]
    [InlineData(35.0, true, true, CasevacMaskingState.Masked)]
    [InlineData(20.0, false, true, CasevacMaskingState.Exposed)]
    [InlineData(7.99, true, true, CasevacMaskingState.Exposed)]
    [InlineData(35.01, true, true, CasevacMaskingState.Exposed)]
    public void ExposureObservationUsesDeclaredBandAndEverySector(
        double aglM,
        bool firstOccluded,
        bool secondOccluded,
        CasevacMaskingState expected) {
        ExposureFieldDefinition field = Exposure();

        CasevacExposureObservation observation = field.Observe(
            aglM,
            field.TerrainAuthorityHash,
            field.ObstacleAuthorityHash,
            [firstOccluded, secondOccluded]);

        Assert.Equal(expected, observation.MaskingState);
        Assert.Equal(
            aglM >= 8.0 && aglM <= 35.0,
            observation.WithinSafeMaskingBand);
    }

    [Fact]
    public void ExposureObservationRejectsInvalidSampleShape() {
        ExposureFieldDefinition field = Exposure();

        Assert.Throws<ArgumentOutOfRangeException>(() => field.Observe(
            double.NaN,
            field.TerrainAuthorityHash,
            field.ObstacleAuthorityHash,
            [true, true]));
        Assert.Throws<ArgumentException>(() => field.Observe(
            20.0,
            "",
            field.ObstacleAuthorityHash,
            [true, true]));
        Assert.Throws<ArgumentNullException>(() => field.Observe(
            20.0,
            field.TerrainAuthorityHash,
            field.ObstacleAuthorityHash,
            null!));
        Assert.Throws<ArgumentException>(() => field.Observe(
            20.0,
            field.TerrainAuthorityHash,
            field.ObstacleAuthorityHash,
            [true]));
    }

    [Fact]
    public void ScenarioOwnsTheExactImmutableSiteAndExposureDefinitions() {
        LandingZoneDefinition pickup = Site("pickup-a");
        LandingZoneDefinition receiver = Site("receiver-a");
        ExposureFieldDefinition exposure = Exposure();
        CasevacScenarioDefinition scenario = Scenario(
            pickup, receiver, exposure);

        Assert.Same(pickup, scenario.Pickup);
        Assert.Same(receiver, scenario.Receiver);
        Assert.Same(exposure, scenario.ExposureField);
        Assert.Equal(pickup.Id, scenario.PickupSiteId);
        Assert.Equal(receiver.Id, scenario.ReceiverSiteId);
    }

    [Fact]
    public void ScenarioRequiresBothSitesAndExposureDefinition() {
        LandingZoneDefinition pickup = Site("pickup-a");
        LandingZoneDefinition receiver = Site("receiver-a");
        ExposureFieldDefinition exposure = Exposure();

        Assert.Throws<ArgumentNullException>(
            () => Scenario(null!, receiver, exposure));
        Assert.Throws<ArgumentNullException>(
            () => Scenario(pickup, null!, exposure));
        Assert.Throws<ArgumentNullException>(
            () => Scenario(pickup, receiver, null!));
    }

    [Fact]
    public void SafeExitVolumeUsesAuthoredHorizontalAndVerticalBounds() {
        var volume = new CasevacSafeExitVolumeDefinition(
            "safe-exit",
            new CasevacHorizontalPoint(-200.0, 100.0),
            surfaceDatumM: 20.0,
            radiusM: 50.0,
            heightM: 100.0);

        Assert.True(volume.Contains(new Vec3D(-150.0, 120.0, 100.0)));
        Assert.False(volume.Contains(new Vec3D(-149.99, 120.0, 100.0)));
        Assert.False(volume.Contains(new Vec3D(-200.0, 120.01, 100.0)));
        Assert.False(volume.Contains(new Vec3D(-200.0, 19.99, 100.0)));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => volume.Contains(new Vec3D(double.NaN, 20.0, 100.0)));
        Assert.Throws<ArgumentException>(() =>
            new CasevacSafeExitVolumeDefinition(
                " ", CasevacHorizontalPoint.Zero, 0.0, 50.0, 100.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new CasevacSafeExitVolumeDefinition(
                "safe", CasevacHorizontalPoint.Zero, 0.0, 0.0, 100.0));
    }

    [Fact]
    public void RouteDefensivelyCopiesResolverFriendlyControlPoints() {
        var points = new List<CasevacRouteControlPointDefinition> {
            RoutePoint("start", -100.0, 50.0),
            RoutePoint("end", 0.0, 0.0)
        };
        var route = new CasevacRouteDefinition(
            "route.ingress.direct",
            CasevacRouteLeg.Ingress,
            "start",
            "pickup",
            points);
        points.Clear();

        Assert.Equal(CasevacRouteLeg.Ingress, route.Leg);
        Assert.Equal("start", route.StartLocationId);
        Assert.Equal("pickup", route.EndLocationId);
        Assert.Equal(2, route.Points.Count);
        Assert.IsType<ReadOnlyCollection<CasevacRouteControlPointDefinition>>(
            route.Points);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new CasevacRouteDefinition(
                "route", (CasevacRouteLeg)99, "start", "pickup",
                [RoutePoint("a", 0.0, 0.0), RoutePoint("b", 1.0, 0.0)]));
        Assert.Throws<ArgumentException>(() =>
            new CasevacRouteDefinition(
                "route", CasevacRouteLeg.Ingress, "same", "same",
                [RoutePoint("a", 0.0, 0.0), RoutePoint("b", 1.0, 0.0)]));
        Assert.Throws<ArgumentException>(() =>
            new CasevacRouteDefinition(
                "route", CasevacRouteLeg.Ingress, "start", "pickup",
                [RoutePoint("only", 0.0, 0.0)]));
    }

    [Fact]
    public void WorldRequiresRoutesForBothLegsWithMatchingEndpointGeometry() {
        const string obstacleHash = "sha256:world-obstacles";
        CasevacHorizontalPoint start = new(-100.0, 50.0);
        LandingZoneDefinition pickup = GeometricSite(
            id: "pickup",
            centre: CasevacHorizontalPoint.Zero,
            obstacleAuthorityHash: obstacleHash);
        LandingZoneDefinition receiver = GeometricSite(
            id: "receiver",
            centre: new CasevacHorizontalPoint(200.0, -100.0),
            obstacleAuthorityHash: obstacleHash);
        CasevacSafeExitVolumeDefinition safeExit = SafeExit();
        ExposureFieldDefinition exposure = Exposure(
            obstacleAuthorityHash: obstacleHash);
        CasevacCollisionAuthorityDefinition collision =
            CollisionAuthority(obstacleHash);
        CasevacRouteDefinition ingress = Route(
            "ingress",
            CasevacRouteLeg.Ingress,
            "start",
            pickup.Id,
            start,
            pickup.Centre);
        CasevacRouteDefinition outbound = Route(
            "outbound",
            CasevacRouteLeg.Outbound,
            pickup.Id,
            receiver.Id,
            pickup.Centre,
            receiver.Centre);
        var source = new List<CasevacRouteDefinition> { ingress, outbound };
        var world = new CasevacWorldDefinition(
            "world",
            "start",
            start,
            10.0,
            30.0,
            pickup,
            receiver,
            safeExit,
            exposure,
            collision,
            source);
        source.Clear();

        Assert.Equal(2, world.Routes.Count);
        Assert.Same(pickup, world.Pickup);
        Assert.Same(receiver, world.Receiver);
        Assert.Same(exposure, world.ExposureField);
        Assert.Throws<ArgumentException>(() => new CasevacWorldDefinition(
            "world",
            "start",
            start,
            10.0,
            30.0,
            pickup,
            receiver,
            safeExit,
            exposure,
            collision,
            [ingress]));
        CasevacRouteDefinition displaced = Route(
            "displaced",
            CasevacRouteLeg.Outbound,
            pickup.Id,
            receiver.Id,
            new CasevacHorizontalPoint(1.0, 0.0),
            receiver.Centre);
        Assert.Throws<ArgumentException>(() => new CasevacWorldDefinition(
            "world",
            "start",
            start,
            10.0,
            30.0,
            pickup,
            receiver,
            safeExit,
            exposure,
            collision,
            [ingress, displaced]));
    }

    [Fact]
    public void CollisionPrimitivesResolvePoleWireAndExclusionGeometry() {
        CasevacCollisionObstacleDefinition pole =
            CasevacCollisionObstacleDefinition.CapsuleSegment(
                "pole",
                new Vec3D(0.0, 0.0, 0.0),
                new Vec3D(0.0, 20.0, 0.0),
                radiusM: 0.3);
        CasevacCollisionObstacleDefinition wire =
            CasevacCollisionObstacleDefinition.CapsuleSegment(
                "wire",
                new Vec3D(0.0, 20.0, 0.0),
                new Vec3D(20.0, 18.0, 0.0),
                radiusM: 0.08);
        CasevacCollisionObstacleDefinition exclusion =
            CasevacCollisionObstacleDefinition.AxisAlignedBox(
                "orchard",
                new Vec3D(30.0, 0.0, -10.0),
                new Vec3D(50.0, 25.0, 10.0));

        Assert.True(pole.IntersectsSphere(
            new Vec3D(0.5, 10.0, 0.0), sphereRadiusM: 0.2));
        Assert.False(pole.IntersectsSphere(
            new Vec3D(0.51, 10.0, 0.0), sphereRadiusM: 0.2));
        Assert.True(wire.IntersectsSphere(
            new Vec3D(10.0, 19.0, 0.1), sphereRadiusM: 0.02));
        Assert.True(exclusion.IntersectsSphere(
            new Vec3D(40.0, 10.0, 0.0), sphereRadiusM: 0.0));
        Assert.True(exclusion.IntersectsSphere(
            new Vec3D(51.0, 10.0, 0.0), sphereRadiusM: 1.0));
        Assert.False(exclusion.IntersectsSphere(
            new Vec3D(51.01, 10.0, 0.0), sphereRadiusM: 1.0));
    }

    [Fact]
    public void CollisionAuthorityDefensivelyCopiesUniqueVersionedObstacles() {
        var source = new List<CasevacCollisionObstacleDefinition> {
            CasevacCollisionObstacleDefinition.CapsuleSegment(
                "pole",
                new Vec3D(0.0, 0.0, 0.0),
                new Vec3D(0.0, 20.0, 0.0),
                0.3),
            CasevacCollisionObstacleDefinition.AxisAlignedBox(
                "clinic",
                new Vec3D(10.0, 0.0, 10.0),
                new Vec3D(20.0, 20.0, 20.0))
        };
        var authority = new CasevacCollisionAuthorityDefinition(
            "collision.v1", "sha256:collision", source);
        source.Clear();

        Assert.Equal(2, authority.Obstacles.Count);
        Assert.IsType<ReadOnlyCollection<CasevacCollisionObstacleDefinition>>(
            authority.Obstacles);
        Assert.True(authority.IntersectsAnySphere(
            new Vec3D(15.0, 10.0, 15.0), radiusM: 0.0));
        Assert.Throws<ArgumentException>(() =>
            new CasevacCollisionAuthorityDefinition(
                "collision.v1",
                "sha256:collision",
                [
                    CasevacCollisionObstacleDefinition.CapsuleSegment(
                        "same", Vec3D.Zero, new Vec3D(0.0, 1.0, 0.0), 0.1),
                    CasevacCollisionObstacleDefinition.CapsuleSegment(
                        "same", Vec3D.Zero, new Vec3D(1.0, 0.0, 0.0), 0.1)
                ]));
    }

    [Fact]
    public void BuiltInPrototypeBindsStableMissionWorldGeometryAndTiming() {
        CasevacCourseDefinition course =
            BuiltInCasevacDefinitions.CreatePrototype();
        CasevacScenarioDefinition mission = course.Mission;
        CasevacWorldDefinition world = course.World;

        Assert.Equal(BuiltInCasevacDefinitions.MissionId, mission.Id);
        Assert.Equal(BuiltInCasevacDefinitions.WorldId, world.Id);
        Assert.Equal(
            new CasevacHorizontalPoint(-2_500.0, 1_800.0),
            world.StartPosition);
        Assert.Equal(CasevacHorizontalPoint.Zero, world.Pickup.Centre);
        Assert.Equal(
            new CasevacHorizontalPoint(3_200.0, -2_400.0),
            world.Receiver.Centre);
        Assert.Equal(4, world.Routes.Count);
        Assert.Equal(2,
            world.Routes.Count(route => route.Leg == CasevacRouteLeg.Ingress));
        Assert.Equal(2,
            world.Routes.Count(route => route.Leg == CasevacRouteLeg.Outbound));
        string[] pointIds = world.Routes
            .SelectMany(route => route.Points)
            .Select(point => point.Id)
            .ToArray();
        Assert.Equal(pointIds.Length,
            pointIds.Distinct(StringComparer.Ordinal).Count());
        CasevacRouteDefinition directOutbound = Assert.Single(
            world.Routes,
            route => route.Id == "route.casevac.outbound-direct.v1");
        CasevacRouteDefinition maskedOutbound = Assert.Single(
            world.Routes,
            route => route.Id == "route.casevac.outbound-masked.v1");
        Assert.True(maskedOutbound.HorizontalLengthM
            > directOutbound.HorizontalLengthM * 1.2);
        CasevacRouteDefinition directIngress = Assert.Single(
            world.Routes,
            route => route.Id == "route.casevac.ingress-direct.v1");
        for (int segmentIndex = 1;
            segmentIndex < directIngress.Points.Count;
            segmentIndex++) {
            CasevacRouteControlPointDefinition from =
                directIngress.Points[segmentIndex - 1];
            CasevacRouteControlPointDefinition to =
                directIngress.Points[segmentIndex];
            for (int sampleIndex = 0; sampleIndex <= 128; sampleIndex++) {
                double fraction = sampleIndex / 128.0;
                var centre = new Vec3D(
                    from.Position.XM
                        + (to.Position.XM - from.Position.XM) * fraction,
                    from.TargetAglM
                        + (to.TargetAglM - from.TargetAglM) * fraction,
                    from.Position.ZM
                        + (to.Position.ZM - from.Position.ZM) * fraction);
                Assert.False(world.CollisionAuthority.IntersectsAnySphere(
                    centre,
                    CasevacFlightRuntime.VehicleCollisionRadiusM));
            }
        }
        Assert.All(world.Routes, route => {
            Assert.True(route.Points.Count >= 3);
            Assert.All(route.Points,
                point => Assert.InRange(point.TargetAglM, 20.0, 34.0));
        });
        Assert.Equal(2 * 60 * BuiltInCasevacDefinitions.AuthorityTickHz,
            mission.InitialCallAgeTicks);
        Assert.Equal(8 * 60 * BuiltInCasevacDefinitions.AuthorityTickHz,
            mission.RequestedHandoffAgeTicks);
        Assert.Equal(285.0, mission.CapsuleMassKg);
        Assert.Same(mission.Pickup, world.Pickup);
        Assert.Same(mission.Receiver, world.Receiver);
        Assert.Same(mission.ExposureField, world.ExposureField);
        Assert.Equal(mission.SafeExitVolumeId, world.SafeExit.Id);
        Assert.Equal(5, world.CollisionAuthority.Obstacles.Count);
        Assert.Contains(world.CollisionAuthority.Obstacles,
            obstacle => obstacle.Id.Contains(
                "wire-crossing", StringComparison.Ordinal));
        Assert.Contains(world.CollisionAuthority.Obstacles,
            obstacle => obstacle.Id.Contains(
                "orchard-exclusion", StringComparison.Ordinal));
        Assert.Contains(world.CollisionAuthority.Obstacles,
            obstacle => obstacle.Id.Contains(
                "clinic-exclusion", StringComparison.Ordinal));
        Assert.Equal(
            BuiltInCasevacDefinitions.CorridorObstacleAuthoritySignature,
            world.CollisionAuthority.AuthorityHash);
        Assert.Equal(world.CollisionAuthority.AuthorityHash,
            world.Pickup.ObstacleAuthorityHash);
        Assert.Equal(world.CollisionAuthority.AuthorityHash,
            world.Receiver.ObstacleAuthorityHash);
        Assert.Equal(world.CollisionAuthority.AuthorityHash,
            world.ExposureField.ObstacleAuthorityHash);
        Assert.StartsWith("sha256:",
            world.ExposureField.TerrainAuthorityHash);
        Assert.DoesNotContain("UNFROZEN",
            world.ExposureField.TerrainAuthorityHash,
            StringComparison.Ordinal);
    }

    static LandingZoneGateProfileDefinition GateProfile(
        string id = "vertical-lift-gate.v1",
        int version = 1,
        double maximumEnterLateralGroundSpeedMps = 0.5,
        double maximumExitLateralGroundSpeedMps = 1.0,
        double maximumEnterAbsoluteVerticalSpeedMps = 0.3,
        double maximumExitAbsoluteVerticalSpeedMps = 0.6,
        double maximumEnterAbsolutePitchRad = 0.1,
        double maximumExitAbsolutePitchRad = 0.2,
        double maximumEnterAbsoluteBankRad = 0.12,
        double maximumExitAbsoluteBankRad = 0.24) => new(
        id,
        version,
        maximumEnterLateralGroundSpeedMps,
        maximumExitLateralGroundSpeedMps,
        maximumEnterAbsoluteVerticalSpeedMps,
        maximumExitAbsoluteVerticalSpeedMps,
        maximumEnterAbsolutePitchRad,
        maximumExitAbsolutePitchRad,
        maximumEnterAbsoluteBankRad,
        maximumExitAbsoluteBankRad);

    static LandingZoneDefinition Site(
        string id,
        LandingZoneGateProfileDefinition? gateProfile = null) => new(
        id,
        $"{id}.surface.v1",
        $"sha256:{id}-surface",
        $"sha256:{id}-obstacles",
        $"{id}.approach.v1",
        $"{id}.escape.v1",
        gateProfile ?? GateProfile());

    static LandingZoneDefinition GeometricSite(
        string id = "pickup-a",
        CasevacHorizontalPoint? centre = null,
        double surfaceDatumM = 12.0,
        double enterFootprintRadiusM = 5.0,
        double exitFootprintRadiusM = 8.0,
        double terminalRadiusM = 150.0,
        double terminalHeightM = 100.0,
        string? obstacleAuthorityHash = null) => new(
        id,
        $"{id}.surface.v1",
        $"sha256:{id}-surface",
        obstacleAuthorityHash ?? $"sha256:{id}-obstacles",
        $"{id}.approach.v1",
        $"{id}.escape.v1",
        GateProfile(),
        centre ?? new CasevacHorizontalPoint(100.0, -50.0),
        surfaceDatumM,
        enterFootprintRadiusM,
        exitFootprintRadiusM,
        terminalRadiusM,
        terminalHeightM);

    static LandingZoneDefinition SiteWithInvalidIdentity(
        string field,
        string? invalid) {
        string id = "pickup-a";
        string surfaceTruthId = "pickup-a.surface.v1";
        string surfaceAuthorityHash = "surface-hash";
        string obstacleAuthorityHash = "obstacle-hash";
        string approachPathId = "pickup-a.approach.v1";
        string escapePathId = "pickup-a.escape.v1";

        switch (field) {
            case "id": id = invalid!; break;
            case "surfaceTruthId": surfaceTruthId = invalid!; break;
            case "surfaceAuthorityHash": surfaceAuthorityHash = invalid!; break;
            case "obstacleAuthorityHash": obstacleAuthorityHash = invalid!; break;
            case "approachPathId": approachPathId = invalid!; break;
            case "escapePathId": escapePathId = invalid!; break;
            default: throw new ArgumentOutOfRangeException(nameof(field));
        }

        return new LandingZoneDefinition(
            id,
            surfaceTruthId,
            surfaceAuthorityHash,
            obstacleAuthorityHash,
            approachPathId,
            escapePathId,
            GateProfile());
    }

    static ExposureObservationSectorDefinition Sector(
        string id,
        double centreAzimuthRad,
        double halfWidthRad = 0.4,
        double maximumRangeM = 4_000.0,
        int raySampleCount = 16) => new(
        id,
        centreAzimuthRad,
        halfWidthRad,
        maximumRangeM,
        raySampleCount);

    static CasevacRouteControlPointDefinition RoutePoint(
        string id,
        double xM,
        double zM) => new(
        id,
        new CasevacHorizontalPoint(xM, zM),
        targetAglM: 25.0,
        corridorRadiusM: 80.0);

    static CasevacRouteDefinition Route(
        string id,
        CasevacRouteLeg leg,
        string startId,
        string endId,
        in CasevacHorizontalPoint start,
        in CasevacHorizontalPoint end) => new(
        id,
        leg,
        startId,
        endId,
        [
            new CasevacRouteControlPointDefinition(
                $"{id}.start", start, 25.0, 80.0),
            new CasevacRouteControlPointDefinition(
                $"{id}.end", end, 25.0, 80.0)
        ]);

    static CasevacSafeExitVolumeDefinition SafeExit() => new(
        "safe-exit",
        new CasevacHorizontalPoint(-200.0, 100.0),
        surfaceDatumM: 10.0,
        radiusM: 50.0,
        heightM: 100.0);

    static CasevacCollisionAuthorityDefinition CollisionAuthority(
        string authorityHash) => new(
        "collision",
        authorityHash,
        [
            CasevacCollisionObstacleDefinition.CapsuleSegment(
                "pole",
                new Vec3D(-20.0, 0.0, 20.0),
                new Vec3D(-20.0, 20.0, 20.0),
                0.3)
        ]);

    static ExposureFieldDefinition Exposure(
        string id = "exposure.soniachne.v1",
        int version = 1,
        string terrainAuthorityHash = "sha256:terrain",
        string obstacleAuthorityHash = "sha256:obstacles",
        double safeBandMinimumAglM = 8.0,
        double safeBandMaximumAglM = 35.0,
        ExposureSamplingRule samplingRule =
            ExposureSamplingRule.SectorTerrainRaycastV1,
        IEnumerable<ExposureObservationSectorDefinition>? sectors = null) =>
        new(
            id,
            version,
            terrainAuthorityHash,
            obstacleAuthorityHash,
            safeBandMinimumAglM,
            safeBandMaximumAglM,
            samplingRule,
            sectors ?? [Sector("north", 0.0), Sector("east", 1.0)]);

    static CasevacScenarioDefinition Scenario(
        LandingZoneDefinition pickup,
        LandingZoneDefinition receiver,
        ExposureFieldDefinition exposure) => new(
        id: "casevac-course",
        aircraftId: "aircraft-1",
        capsuleId: "capsule-1",
        pickup,
        receiver,
        safeExitVolumeId: "safe-exit-1",
        exposure,
        initialCallAgeTicks: 120,
        requestedHandoffAgeTicks: 1_200,
        stabilizationDwellTicks: 3,
        loadingDwellTicks: 5,
        handoffDwellTicks: 7,
        quietAftermathTicks: 11,
        capsuleMassKg: 82.5);
}
