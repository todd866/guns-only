using System.Reflection;
using GunsOnly.Sim.Casevac;

namespace GunsOnly.Sim.Tests.Casevac;

public class CasevacContractsTests {
    [Fact]
    public void ScenarioDefinitionPreservesValidatedIdentityTimingAndMass() {
        CasevacScenarioDefinition scenario = Scenario();

        Assert.Equal("casevac-course", scenario.Id);
        Assert.Equal("aircraft-1", scenario.AircraftId);
        Assert.Equal("capsule-1", scenario.CapsuleId);
        Assert.Equal("pickup-1", scenario.PickupSiteId);
        Assert.Equal("receiver-1", scenario.ReceiverSiteId);
        Assert.Equal("safe-exit-1", scenario.SafeExitVolumeId);
        Assert.Equal("exposure-1", scenario.ExposureField.Id);
        Assert.Equal(120, scenario.InitialCallAgeTicks);
        Assert.Equal(1_200, scenario.RequestedHandoffAgeTicks);
        Assert.Equal(3, scenario.StabilizationDwellTicks);
        Assert.Equal(5, scenario.LoadingDwellTicks);
        Assert.Equal(7, scenario.HandoffDwellTicks);
        Assert.Equal(11, scenario.QuietAftermathTicks);
        Assert.Equal(82.5, scenario.CapsuleMassKg);
    }

    [Theory]
    [InlineData("id")]
    [InlineData("aircraftId")]
    [InlineData("capsuleId")]
    [InlineData("safeExitVolumeId")]
    public void ScenarioDefinitionRejectsMissingOrBlankStableIdentities(string field) {
        foreach (string? invalid in new string?[] { null, "", " \t" }) {
            ArgumentException error = Assert.Throws<ArgumentException>(
                () => ScenarioWithIdentity(field, invalid));
            Assert.Equal(field, error.ParamName);
        }
    }

    [Theory]
    [InlineData("pickup-1", "pickup-1", "safe-exit-1")]
    [InlineData("pickup-1", "receiver-1", "pickup-1")]
    [InlineData("pickup-1", "receiver-1", "receiver-1")]
    public void ScenarioDefinitionRequiresDistinctSiteAndSafeExitIdentities(
        string pickupSiteId,
        string receiverSiteId,
        string safeExitVolumeId) {
        Assert.Throws<ArgumentException>(() => Scenario(
            pickupSiteId: pickupSiteId,
            receiverSiteId: receiverSiteId,
            safeExitVolumeId: safeExitVolumeId));
    }

    [Fact]
    public void ScenarioDefinitionRejectsInvalidClockEpochs() {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Scenario(initialCallAgeTicks: -1));
        Assert.Throws<ArgumentOutOfRangeException>(() => Scenario(
            initialCallAgeTicks: 120,
            requestedHandoffAgeTicks: 120));
        Assert.Throws<ArgumentOutOfRangeException>(() => Scenario(
            initialCallAgeTicks: 120,
            requestedHandoffAgeTicks: 119));
    }

    [Theory]
    [InlineData(0, 5, 7, 11)]
    [InlineData(-1, 5, 7, 11)]
    [InlineData(3, 0, 7, 11)]
    [InlineData(3, -1, 7, 11)]
    [InlineData(3, 5, 0, 11)]
    [InlineData(3, 5, -1, 11)]
    [InlineData(3, 5, 7, 0)]
    [InlineData(3, 5, 7, -1)]
    public void ScenarioDefinitionRequiresPositiveDwellAndAftermathTicks(
        int stabilizationDwellTicks,
        int loadingDwellTicks,
        int handoffDwellTicks,
        int quietAftermathTicks) {
        Assert.Throws<ArgumentOutOfRangeException>(() => Scenario(
            stabilizationDwellTicks: stabilizationDwellTicks,
            loadingDwellTicks: loadingDwellTicks,
            handoffDwellTicks: handoffDwellTicks,
            quietAftermathTicks: quietAftermathTicks));
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(-0.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    public void ScenarioDefinitionRequiresPositiveFiniteCapsuleMass(double massKg) {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Scenario(capsuleMassKg: massKg));
    }

    [Fact]
    public void LandingZoneObservationAcceptsAdvanceHoldAndBreakEvidence() {
        LandingZoneObservation advance = LandingZone();
        LandingZoneObservation hold = LandingZone(
            insideEnterFootprint: false,
            enterViolations: LandingZoneGateViolation.OutsideEnterFootprint,
            gateClass: LandingZoneGateClass.Hold);
        LandingZoneObservation @break = LandingZoneObservation.None;

        Assert.Equal("pickup-1", advance.SiteId);
        Assert.True(advance.InsideTerminalVolume);
        Assert.True(advance.InsideEnterFootprint);
        Assert.True(advance.InsideExitFootprint);
        Assert.True(advance.SurfaceContact);
        Assert.Equal(LandingZoneGateViolation.None, advance.EnterViolations);
        Assert.Equal(LandingZoneGateViolation.None, advance.ExitViolations);
        Assert.Equal(LandingZoneGateClass.Advance, advance.GateClass);

        Assert.False(hold.InsideEnterFootprint);
        Assert.True(hold.InsideExitFootprint);
        Assert.Equal(
            LandingZoneGateViolation.OutsideEnterFootprint,
            hold.EnterViolations);
        Assert.Equal(LandingZoneGateViolation.None, hold.ExitViolations);
        Assert.Equal(LandingZoneGateClass.Hold, hold.GateClass);

        Assert.Null(@break.SiteId);
        Assert.False(@break.InsideTerminalVolume);
        Assert.False(@break.SurfaceContact);
        Assert.Equal(LandingZoneGateClass.Break, @break.GateClass);
    }

    [Theory]
    [InlineData(double.NaN, 0.0, 0.0, 0.0)]
    [InlineData(double.PositiveInfinity, 0.0, 0.0, 0.0)]
    [InlineData(-0.01, 0.0, 0.0, 0.0)]
    [InlineData(0.0, double.NaN, 0.0, 0.0)]
    [InlineData(0.0, double.PositiveInfinity, 0.0, 0.0)]
    [InlineData(0.0, double.NegativeInfinity, 0.0, 0.0)]
    [InlineData(0.0, 0.0, double.NaN, 0.0)]
    [InlineData(0.0, 0.0, double.PositiveInfinity, 0.0)]
    [InlineData(0.0, 0.0, double.NegativeInfinity, 0.0)]
    [InlineData(0.0, 0.0, 0.0, double.NaN)]
    [InlineData(0.0, 0.0, 0.0, double.PositiveInfinity)]
    [InlineData(0.0, 0.0, 0.0, double.NegativeInfinity)]
    public void LandingZoneObservationRejectsNonfiniteOrNegativeKinematics(
        double lateralGroundSpeedMps,
        double verticalSpeedMps,
        double pitchRad,
        double bankRad) {
        Assert.Throws<ArgumentOutOfRangeException>(() => LandingZone(
            lateralGroundSpeedMps: lateralGroundSpeedMps,
            verticalSpeedMps: verticalSpeedMps,
            pitchRad: pitchRad,
            bankRad: bankRad));
    }

    [Fact]
    public void LandingZoneObservationRejectsInvalidSiteClaimsAndGeometryNesting() {
        Assert.Throws<ArgumentException>(() => LandingZone(siteId: " "));
        Assert.Throws<ArgumentException>(
            () => LandingZone(siteId: null));
        Assert.Throws<ArgumentException>(() => LandingZone(
            insideTerminalVolume: false,
            insideEnterFootprint: false,
            insideExitFootprint: false,
            surfaceContact: false));
        Assert.Throws<ArgumentException>(() => LandingZone(
            insideEnterFootprint: true,
            insideExitFootprint: false));
        Assert.Throws<ArgumentException>(() => LandingZone(
            siteId: null,
            insideTerminalVolume: false,
            insideEnterFootprint: false,
            insideExitFootprint: true,
            surfaceContact: false));
        Assert.Throws<ArgumentException>(() => LandingZone(
            siteId: null,
            insideTerminalVolume: false,
            insideEnterFootprint: false,
            insideExitFootprint: false,
            surfaceContact: true));
    }

    [Fact]
    public void LandingZoneObservationRejectsUnknownOrContradictoryViolations() {
        LandingZoneGateViolation unknown = (LandingZoneGateViolation)(1 << 20);

        Assert.Throws<ArgumentOutOfRangeException>(
            () => LandingZone(enterViolations: unknown));
        Assert.Throws<ArgumentOutOfRangeException>(() => LandingZone(
            enterViolations: unknown,
            exitViolations: unknown,
            gateClass: LandingZoneGateClass.Break));
        Assert.Throws<ArgumentException>(() => LandingZone(
            enterViolations: LandingZoneGateViolation.None,
            exitViolations: LandingZoneGateViolation.VerticalSpeed,
            gateClass: LandingZoneGateClass.Break));
        Assert.Throws<ArgumentException>(() => LandingZone(
            enterViolations: LandingZoneGateViolation.LateralGroundSpeed,
            exitViolations: LandingZoneGateViolation.None,
            gateClass: LandingZoneGateClass.Advance));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => LandingZone(gateClass: (LandingZoneGateClass)99));
    }

    [Fact]
    public void LandingZoneObservationRejectsGateClassPhysicalContradictions() {
        Assert.Throws<ArgumentException>(() => LandingZone(
            insideEnterFootprint: false,
            enterViolations: LandingZoneGateViolation.None,
            gateClass: LandingZoneGateClass.Advance));
        Assert.Throws<ArgumentException>(() => LandingZone(
            surfaceContact: false,
            enterViolations: LandingZoneGateViolation.None,
            gateClass: LandingZoneGateClass.Advance));
        Assert.Throws<ArgumentException>(() => LandingZone(
            insideEnterFootprint: false,
            insideExitFootprint: false,
            enterViolations: LandingZoneGateViolation.OutsideEnterFootprint,
            gateClass: LandingZoneGateClass.Hold));
        Assert.Throws<ArgumentException>(() => LandingZone(
            insideEnterFootprint: false,
            surfaceContact: false,
            enterViolations:
                LandingZoneGateViolation.OutsideEnterFootprint
                | LandingZoneGateViolation.NoSurfaceContact,
            gateClass: LandingZoneGateClass.Hold));
    }

    [Fact]
    public void TickObservationPreservesObserverSafeFlightAndLandingZoneFacts() {
        LandingZoneObservation landingZone = LandingZone();
        var position = new Vec3D(120.0, 31.5, -42.0);
        var observation = new CasevacTickObservation(
            sourceTick: 42,
            vehicleFlyable: true,
            insideSafeExitVolume: false,
            position,
            clearanceM: 9.5,
            CasevacMaskingState.Masked,
            withinSafeMaskingBand: true,
            protectionInterventionActive: false,
            landingZone);

        Assert.Equal(42, observation.SourceTick);
        Assert.True(observation.VehicleFlyable);
        Assert.False(observation.InsideSafeExitVolume);
        Assert.Equal(position, observation.Position);
        Assert.Equal(9.5, observation.ClearanceM);
        Assert.Equal(CasevacMaskingState.Masked, observation.MaskingState);
        Assert.True(observation.WithinSafeMaskingBand);
        Assert.False(observation.ProtectionInterventionActive);
        Assert.Equal(landingZone, observation.LandingZone);
    }

    [Fact]
    public void TickObservationRejectsInvalidTickPositionClearanceAndMaskingState() {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(sourceTick: -1));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(position: new Vec3D(double.NaN, 0.0, 0.0)));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(position: new Vec3D(0.0, double.PositiveInfinity, 0.0)));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(position: new Vec3D(0.0, 0.0, double.NegativeInfinity)));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(clearanceM: -0.01));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(clearanceM: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(clearanceM: double.PositiveInfinity));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => Tick(maskingState: (CasevacMaskingState)99));
        Assert.Throws<ArgumentException>(() => new CasevacTickObservation(
            sourceTick: 1,
            vehicleFlyable: true,
            insideSafeExitVolume: false,
            Vec3D.Zero,
            clearanceM: 10.0,
            CasevacMaskingState.Masked,
            withinSafeMaskingBand: false,
            protectionInterventionActive: false,
            LandingZoneObservation.None));
    }

    [Fact]
    public void PublicContractSurfaceContainsNoPatientOrClinicalState() {
        Type[] observerSafeTypes = [
            typeof(CasevacScenarioDefinition),
            typeof(LandingZoneDefinition),
            typeof(LandingZoneGateProfileDefinition),
            typeof(ExposureFieldDefinition),
            typeof(ExposureObservationSectorDefinition),
            typeof(LandingZoneObservation),
            typeof(CasevacTickObservation),
            typeof(CasevacMissionEventRecord),
            typeof(CasevacMissionSnapshot)
        ];
        string[] forbiddenFragments = [
            "patient",
            "casualty",
            "evacuee",
            "injury",
            "wound",
            "diagnosis",
            "triage",
            "treatment",
            "clinical",
            "vital",
            "blood",
            "prognosis",
            "mortality",
            "survival"
        ];

        IEnumerable<string> exposedNames = observerSafeTypes.SelectMany(type =>
            type.GetProperties(BindingFlags.Instance | BindingFlags.Public)
                .SelectMany(property => new[] {
                    property.Name,
                    property.PropertyType.FullName ?? property.PropertyType.Name
                })
                .Concat(type.GetConstructors(BindingFlags.Instance | BindingFlags.Public)
                    .SelectMany(constructor => constructor.GetParameters())
                    .SelectMany(parameter => new[] {
                        parameter.Name ?? "",
                        parameter.ParameterType.FullName ?? parameter.ParameterType.Name
                    })));

        foreach (string exposedName in exposedNames)
            Assert.DoesNotContain(forbiddenFragments, fragment =>
                exposedName.Contains(fragment, StringComparison.OrdinalIgnoreCase));
    }

    static CasevacScenarioDefinition Scenario(
        string id = "casevac-course",
        string aircraftId = "aircraft-1",
        string capsuleId = "capsule-1",
        string pickupSiteId = "pickup-1",
        string receiverSiteId = "receiver-1",
        string safeExitVolumeId = "safe-exit-1",
        long initialCallAgeTicks = 120,
        long requestedHandoffAgeTicks = 1_200,
        int stabilizationDwellTicks = 3,
        int loadingDwellTicks = 5,
        int handoffDwellTicks = 7,
        int quietAftermathTicks = 11,
        double capsuleMassKg = 82.5) => new(
        id,
        aircraftId,
        capsuleId,
        SiteDefinition(pickupSiteId),
        SiteDefinition(receiverSiteId),
        safeExitVolumeId,
        ExposureDefinition(),
        initialCallAgeTicks,
        requestedHandoffAgeTicks,
        stabilizationDwellTicks,
        loadingDwellTicks,
        handoffDwellTicks,
        quietAftermathTicks,
        capsuleMassKg);

    static CasevacScenarioDefinition ScenarioWithIdentity(
        string field,
        string? invalid) {
        string id = "casevac-course";
        string aircraftId = "aircraft-1";
        string capsuleId = "capsule-1";
        string safeExitVolumeId = "safe-exit-1";

        switch (field) {
            case "id":
                id = invalid!;
                break;
            case "aircraftId":
                aircraftId = invalid!;
                break;
            case "capsuleId":
                capsuleId = invalid!;
                break;
            case "safeExitVolumeId":
                safeExitVolumeId = invalid!;
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(field));
        }

        return Scenario(
            id,
            aircraftId,
            capsuleId,
            pickupSiteId: "pickup-1",
            receiverSiteId: "receiver-1",
            safeExitVolumeId: safeExitVolumeId);
    }

    static LandingZoneDefinition SiteDefinition(string id) => new(
        id,
        surfaceTruthId: $"{id}.surface",
        surfaceAuthorityHash: $"{id}.surface.hash",
        obstacleAuthorityHash: $"{id}.obstacles.hash",
        approachPathId: $"{id}.approach",
        escapePathId: $"{id}.escape",
        gateProfile: GateProfile());

    static LandingZoneGateProfileDefinition GateProfile() => new(
        id: "gate-profile-1",
        version: 1,
        maximumEnterLateralGroundSpeedMps: 0.5,
        maximumExitLateralGroundSpeedMps: 1.0,
        maximumEnterAbsoluteVerticalSpeedMps: 0.3,
        maximumExitAbsoluteVerticalSpeedMps: 0.6,
        maximumEnterAbsolutePitchRad: 0.1,
        maximumExitAbsolutePitchRad: 0.2,
        maximumEnterAbsoluteBankRad: 0.1,
        maximumExitAbsoluteBankRad: 0.2);

    static ExposureFieldDefinition ExposureDefinition() => new(
        id: "exposure-1",
        version: 1,
        terrainAuthorityHash: "terrain-hash",
        obstacleAuthorityHash: "obstacle-hash",
        safeBandMinimumAglM: 8.0,
        safeBandMaximumAglM: 35.0,
        samplingRule: ExposureSamplingRule.SectorTerrainRaycastV1,
        sectors: [new ExposureObservationSectorDefinition(
            "sector-east", 0.0, 0.5, 4_000.0, 16)]);

    static LandingZoneObservation LandingZone(
        string? siteId = "pickup-1",
        bool insideTerminalVolume = true,
        bool insideEnterFootprint = true,
        bool insideExitFootprint = true,
        bool surfaceContact = true,
        double lateralGroundSpeedMps = 0.2,
        double verticalSpeedMps = -0.1,
        double pitchRad = 0.01,
        double bankRad = -0.02,
        LandingZoneGateViolation enterViolations = LandingZoneGateViolation.None,
        LandingZoneGateViolation exitViolations = LandingZoneGateViolation.None,
        LandingZoneGateClass gateClass = LandingZoneGateClass.Advance) => new(
        siteId,
        insideTerminalVolume,
        insideEnterFootprint,
        insideExitFootprint,
        surfaceContact,
        lateralGroundSpeedMps,
        verticalSpeedMps,
        pitchRad,
        bankRad,
        enterViolations,
        exitViolations,
        gateClass);

    static CasevacTickObservation Tick(
        long sourceTick = 1,
        Vec3D? position = null,
        double clearanceM = 10.0,
        CasevacMaskingState maskingState = CasevacMaskingState.NotAssessed) {
        Vec3D resolvedPosition = position ?? Vec3D.Zero;
        LandingZoneObservation landingZone = LandingZoneObservation.None;
        return new CasevacTickObservation(
            sourceTick,
            vehicleFlyable: true,
            insideSafeExitVolume: false,
            resolvedPosition,
            clearanceM,
            maskingState,
            withinSafeMaskingBand: false,
            protectionInterventionActive: false,
            landingZone);
    }
}
