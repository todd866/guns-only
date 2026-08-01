using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Casevac;

/// <summary>
/// Driving-style command intent for the automated air ambulance. Axes are normalized and
/// semantic: forward/right select horizontal velocity, vertical selects climb/descent rate, and
/// yaw selects turn rate. The mission command remains a separate discrete authority.
/// </summary>
public readonly record struct CasevacFlightControlIntent(
    double Forward,
    double Right,
    double Vertical,
    double Yaw,
    CasevacSemanticCommand MissionCommand = CasevacSemanticCommand.None) {

    public static CasevacFlightControlIntent Neutral { get; } =
        new(0.0, 0.0, 0.0, 0.0);
}

/// <summary>Terrain-resolved geometry for one authored CASEVAC location.</summary>
public readonly record struct CasevacResolvedLocation(
    string Id,
    double EastM,
    double SurfaceElevationM,
    double NorthM,
    double RadiusM,
    double HeightM) {

    public Vec3D SurfaceCentre =>
        new(EastM, SurfaceElevationM, NorthM);
}

/// <summary>Observer-safe navigation facts for the mission commander's current destination.</summary>
public readonly record struct CasevacTargetGuidance(
    string? TargetId,
    Vec3D TargetWorldM,
    double HorizontalRangeM,
    double AbsoluteBearingRad,
    double RelativeBearingRad,
    double EstimatedTimeToTargetSeconds) {

    public static CasevacTargetGuidance None { get; } =
        new(null, Vec3D.Zero, 0.0, 0.0, 0.0, 0.0);
}

/// <summary>
/// Deterministic planning result for the current mission destination. This is a fictional
/// usable-energy budget, not a performance claim for a real aircraft.
/// </summary>
public readonly record struct CasevacDestinationEnergyPlan(
    string? TargetId,
    double PlannedTransitSeconds,
    double ProjectedReserveEnergyJ,
    double ProjectedReserveFraction,
    double ProjectedReserveEnduranceSeconds) {

    public static CasevacDestinationEnergyPlan None { get; } =
        new(null, 0.0, 0.0, 0.0, 0.0);
}

/// <summary>
/// One collision-authoritative primitive translated into the runtime's terrain-resolved world
/// frame. Browser projections may mirror these immutable facts for presentation, but collision
/// remains owned by the simulation.
/// </summary>
public sealed class CasevacResolvedCollisionObstacle {
    internal CasevacResolvedCollisionObstacle(
        string id,
        CasevacCollisionPrimitive primitive,
        in Vec3D firstWorldM,
        in Vec3D secondWorldM,
        double radiusM) {
        Id = id;
        Primitive = primitive;
        FirstWorldM = firstWorldM;
        SecondWorldM = secondWorldM;
        RadiusM = radiusM;
    }

    public string Id { get; }
    public CasevacCollisionPrimitive Primitive { get; }
    public Vec3D FirstWorldM { get; }
    public Vec3D SecondWorldM { get; }
    public double RadiusM { get; }
}

/// <summary>
/// One authored route control point with its terrain-resolved surface in the runtime world frame.
/// </summary>
public readonly record struct CasevacResolvedRouteControlPoint(
    string Id,
    double EastM,
    double SurfaceElevationM,
    double NorthM,
    double TargetAglM,
    double CorridorRadiusM);

/// <summary>
/// One immutable reference route whose control points have been resolved against mission terrain.
/// </summary>
public sealed class CasevacResolvedRoute {
    readonly IReadOnlyList<CasevacResolvedRouteControlPoint> _points;

    internal CasevacResolvedRoute(
        CasevacRouteDefinition authored,
        CasevacResolvedRouteControlPoint[] points) {
        Id = authored.Id;
        Leg = authored.Leg;
        StartLocationId = authored.StartLocationId;
        EndLocationId = authored.EndLocationId;
        HorizontalLengthM = authored.HorizontalLengthM;
        _points = Array.AsReadOnly(points);
    }

    public string Id { get; }
    public CasevacRouteLeg Leg { get; }
    public string StartLocationId { get; }
    public string EndLocationId { get; }
    public double HorizontalLengthM { get; }
    public IReadOnlyList<CasevacResolvedRouteControlPoint> Points =>
        _points;
}

/// <summary>
/// Presentation-only rotor-wash surrogate derived from the fictional vehicle profile and current
/// authoritative observation. It is bounded visual guidance, not a real-aircraft downwash model
/// and never feeds collision, contact, exposure, or mission progression.
/// </summary>
public readonly record struct CasevacRotorWashVisual(
    double Intensity01,
    double RadiusM);

/// <summary>
/// One deterministic flight-first CASEVAC runtime. SimulationSession remains the only lifecycle
/// and fixed-step authority; this object advances exactly once for each unpaused source tick.
/// </summary>
public sealed class CasevacFlightRuntime {
    public const string EnergyModelId =
        "energy.casevac.fictional-usable-ledger.v1";
    public const int RecentEventCapacity = 64;
    public const double RecurringBaseMassKg = 5_850.0;
    public const double VehicleCollisionRadiusM = 2.6;
    public const double MaximumForwardSpeedMps = 28.0;
    public const double MaximumReverseSpeedMps = 8.0;
    public const double MaximumLateralSpeedMps = 11.0;
    public const double MaximumVerticalSpeedMps = 2.0;
    // Fictional, declared planning assumptions for this reduced-order vehicle. The ledger alone
    // is authoritative: it integrates the vehicle provider's applied shaft power at 120 Hz.
    public const double DefaultInitialUsableEnergyJ =
        450.0 * 3_600_000.0;
    public const double PlanningPowerW = 1_150_000.0;
    public const double PlanningGroundSpeedMps = 22.0;
    public const double PlanningArrivalAllowanceSeconds = 30.0;

    const double HorizontalVelocityGain = 0.075;
    const double VerticalVelocityGain = 0.075;
    const double GroundIdleCollective = 0.52;
    const double SurfaceFrictionPerSecond = 3.4;
    const double ObserverHeightM = 3.0;
    const double ExposureTerrainClearanceM = 0.5;
    const double ExposureObstacleProbeRadiusM = 0.45;

    readonly CasevacCourseDefinition _course;
    readonly ITerrainSurface? _terrain;
    readonly WeatherProfile? _weather;
    readonly ReducedOrderVerticalLiftAirAmbulance _vehicle;
    readonly CasevacMissionController _controller;
    readonly CasevacEvidenceRecorder _evidence;
    readonly List<CasevacMissionEventRecord> _recentEvents =
        new(RecentEventCapacity);
    readonly double _startSurfaceM;
    readonly double _pickupSurfaceM;
    readonly double _receiverSurfaceM;
    readonly double _safeExitSurfaceM;
    readonly double[] _obstacleSurfaceM;
    readonly IReadOnlyList<CasevacResolvedCollisionObstacle>
        _resolvedCollisionObstacles;
    readonly IReadOnlyList<CasevacResolvedRoute> _resolvedRoutes;
    readonly double _initialUsableEnergyJ;

    CasevacMissionSnapshot _snapshot;
    LandingZoneObservation _lastLandingZone = LandingZoneObservation.None;
    CasevacExposureObservation _lastExposure =
        new(CasevacMaskingState.NotAssessed, false);
    CasevacTickObservation? _lastTickObservation;
    long? _lastSourceTick;
    long _vehicleAuthorityTick;
    bool _begun;
    bool _obstacleCollisionLatched;
    bool _retainedCorrectionsRecorded;
    double _consumedEnergyJ;

    public CasevacFlightRuntime(
        CasevacCourseDefinition course,
        ITerrainSurface? terrain,
        WeatherProfile? weather,
        Func<long> allocateEventSequence)
        : this(
            course,
            terrain,
            weather,
            allocateEventSequence,
            DefaultInitialUsableEnergyJ) {
    }

    internal CasevacFlightRuntime(
        CasevacCourseDefinition course,
        ITerrainSurface? terrain,
        WeatherProfile? weather,
        Func<long> allocateEventSequence,
        double initialUsableEnergyJ) {
        _course = course ?? throw new ArgumentNullException(nameof(course));
        _terrain = terrain;
        _weather = weather;
        ArgumentNullException.ThrowIfNull(allocateEventSequence);
        if (!double.IsFinite(initialUsableEnergyJ)
            || initialUsableEnergyJ <= 0.0)
            throw new ArgumentOutOfRangeException(
                nameof(initialUsableEnergyJ));
        _initialUsableEnergyJ = initialUsableEnergyJ;

        _startSurfaceM = ResolveSurfaceElevation(
            course.World.StartPosition,
            course.World.StartSurfaceDatumM);
        _pickupSurfaceM = ResolveSurfaceElevation(
            course.World.Pickup.Centre,
            course.World.Pickup.SurfaceDatumM);
        _receiverSurfaceM = ResolveSurfaceElevation(
            course.World.Receiver.Centre,
            course.World.Receiver.SurfaceDatumM);
        _safeExitSurfaceM = ResolveSurfaceElevation(
            course.World.SafeExit.Centre,
            course.World.SafeExit.SurfaceDatumM);
        _obstacleSurfaceM =
            new double[course.World.CollisionAuthority.Obstacles.Count];
        var resolvedObstacles =
            new CasevacResolvedCollisionObstacle[_obstacleSurfaceM.Length];
        for (int index = 0;
            index < _obstacleSurfaceM.Length;
            index++) {
            CasevacCollisionObstacleDefinition obstacle =
                course.World.CollisionAuthority.Obstacles[index];
            _obstacleSurfaceM[index] = ResolveSurfaceElevation(
                ObstacleAnchor(obstacle),
                authoredFallbackM: 0.0);
            var surfaceOffset =
                new Vec3D(0.0, _obstacleSurfaceM[index], 0.0);
            resolvedObstacles[index] =
                new CasevacResolvedCollisionObstacle(
                    obstacle.Id,
                    obstacle.Primitive,
                    obstacle.First + surfaceOffset,
                    obstacle.Second + surfaceOffset,
                    obstacle.RadiusM);
        }
        _resolvedCollisionObstacles =
            Array.AsReadOnly(resolvedObstacles);

        var resolvedRoutes =
            new CasevacResolvedRoute[course.World.Routes.Count];
        for (int routeIndex = 0;
            routeIndex < resolvedRoutes.Length;
            routeIndex++) {
            CasevacRouteDefinition authoredRoute =
                course.World.Routes[routeIndex];
            var resolvedPoints =
                new CasevacResolvedRouteControlPoint[
                    authoredRoute.Points.Count];
            for (int pointIndex = 0;
                pointIndex < resolvedPoints.Length;
                pointIndex++) {
                CasevacRouteControlPointDefinition authoredPoint =
                    authoredRoute.Points[pointIndex];
                resolvedPoints[pointIndex] =
                    new CasevacResolvedRouteControlPoint(
                        authoredPoint.Id,
                        authoredPoint.Position.XM,
                        ResolveSurfaceElevation(
                            authoredPoint.Position,
                            authoredFallbackM: 0.0),
                        authoredPoint.Position.ZM,
                        authoredPoint.TargetAglM,
                        authoredPoint.CorridorRadiusM);
            }
            resolvedRoutes[routeIndex] =
                new CasevacResolvedRoute(
                    authoredRoute,
                    resolvedPoints);
        }
        _resolvedRoutes = Array.AsReadOnly(resolvedRoutes);

        CasevacHorizontalPoint start = course.World.StartPosition;
        CasevacResolvedRoute? ingressRoute = GuidanceRouteForTarget(
            course.World.Pickup.Id,
            _resolvedRoutes);
        CasevacResolvedRouteControlPoint? firstIngressPoint =
            ingressRoute is not null && ingressRoute.Points.Count > 1
                ? ingressRoute.Points[1]
                : null;
        double initialTargetEastM = firstIngressPoint?.EastM
            ?? course.World.Pickup.Centre.XM;
        double initialTargetNorthM = firstIngressPoint?.NorthM
            ?? course.World.Pickup.Centre.ZM;
        double initialYawRad = Math.Atan2(
            initialTargetEastM - start.XM,
            initialTargetNorthM - start.ZM);
        _vehicle = new ReducedOrderVerticalLiftAirAmbulance(
            course.Mission.AircraftId,
            new Vec3D(
                start.XM,
                _startSurfaceM + course.World.StartAglM,
                start.ZM),
            Vec3D.Zero,
            initialYawRad,
            RecurringBaseMassKg);
        _evidence = new CasevacEvidenceRecorder();
        _controller = new CasevacMissionController(
            course.Mission,
            allocateEventSequence,
            ObserveMissionEvent);
        _snapshot = _controller.Snapshot;
    }

    public CasevacCourseDefinition Course => _course;
    public IPlayerVehicleDynamics Vehicle => _vehicle;
    public PlayerVehicleState VehicleState => _vehicle.State;
    public PlayerVehicleObservation VehicleObservation => _vehicle.Observation;
    public bool VehicleFlyable =>
        _vehicle.State.Flyable
        && !_obstacleCollisionLatched
        && !EnergyDepleted;
    public bool ObstacleCollisionLatched => _obstacleCollisionLatched;
    public double InitialUsableEnergyJ => _initialUsableEnergyJ;
    public double ConsumedEnergyJ => _consumedEnergyJ;
    public double RemainingUsableEnergyJ => Math.Max(
        0.0,
        _initialUsableEnergyJ - _consumedEnergyJ);
    public double RemainingEnergyFraction => Math.Clamp(
        RemainingUsableEnergyJ / _initialUsableEnergyJ,
        0.0,
        1.0);
    public double PlanningEnduranceSeconds =>
        RemainingUsableEnergyJ / PlanningPowerW;
    public bool EnergyDepleted => RemainingUsableEnergyJ <= 0.0;
    public CasevacMissionController Controller => _controller;
    public CasevacMissionSnapshot Snapshot => _snapshot;
    public CasevacEvidenceRecorder Evidence => _evidence;
    public LandingZoneObservation LastLandingZone => _lastLandingZone;
    public CasevacExposureObservation LastExposure => _lastExposure;
    public CasevacTickObservation? LastTickObservation => _lastTickObservation;
    public IReadOnlyList<CasevacMissionEventRecord> RecentEvents =>
        _recentEvents;
    public IReadOnlyList<CasevacResolvedCollisionObstacle>
        ResolvedCollisionObstacles => _resolvedCollisionObstacles;
    public IReadOnlyList<CasevacResolvedRoute> ResolvedRoutes =>
        _resolvedRoutes;
    public bool Begun => _begun;
    public bool IsTerminal => _controller.IsTerminal;

    public CasevacResolvedLocation StartLocation => new(
        _course.World.StartLocationId,
        _course.World.StartPosition.XM,
        _startSurfaceM,
        _course.World.StartPosition.ZM,
        0.0,
        0.0);

    public CasevacResolvedLocation PickupLocation => new(
        _course.World.Pickup.Id,
        _course.World.Pickup.Centre.XM,
        _pickupSurfaceM,
        _course.World.Pickup.Centre.ZM,
        _course.World.Pickup.TerminalRadiusM,
        _course.World.Pickup.TerminalHeightM);

    public CasevacResolvedLocation ReceiverLocation => new(
        _course.World.Receiver.Id,
        _course.World.Receiver.Centre.XM,
        _receiverSurfaceM,
        _course.World.Receiver.Centre.ZM,
        _course.World.Receiver.TerminalRadiusM,
        _course.World.Receiver.TerminalHeightM);

    public CasevacResolvedLocation SafeExitLocation => new(
        _course.World.SafeExit.Id,
        _course.World.SafeExit.Centre.XM,
        _safeExitSurfaceM,
        _course.World.SafeExit.Centre.ZM,
        _course.World.SafeExit.RadiusM,
        _course.World.SafeExit.HeightM);

    public CasevacTargetGuidance TargetGuidance =>
        BuildTargetGuidance(_snapshot.TargetSiteId);

    public CasevacDestinationEnergyPlan DestinationEnergyPlan =>
        BuildDestinationEnergyPlan(TargetGuidance);

    public CasevacRotorWashVisual RotorWashVisual =>
        BuildRotorWashVisual();

    public CasevacMissionSnapshot Begin(long sourceTick) {
        if (_begun)
            throw new InvalidOperationException(
                "The CASEVAC flight runtime can begin only once.");
        _snapshot = _controller.Begin(sourceTick);
        _begun = true;
        _lastSourceTick = sourceTick;
        return _snapshot;
    }

    /// <summary>
    /// Acknowledges the already-entered quiet aftermath without simulating another vehicle or
    /// mission tick. Calls before Quiet and repeated calls after completion fail closed.
    /// </summary>
    public bool RequestQuietSkip() {
        if (!_begun || _controller.Phase != CasevacPhase.Quiet)
            return false;
        if (!_controller.RequestQuietSkip())
            return false;
        _snapshot = _controller.Snapshot;
        return true;
    }

    public CasevacMissionSnapshot Advance(
        long sourceTick,
        in CasevacFlightControlIntent intent) {
        if (!_begun)
            throw new InvalidOperationException(
                "Begin the CASEVAC flight runtime before advancing it.");
        if (_controller.IsTerminal) return _snapshot;
        if (_lastSourceTick.HasValue
            && sourceTick != _lastSourceTick.Value + 1L)
            throw new InvalidOperationException(
                "CASEVAC source ticks must be contiguous while the session is active.");
        ValidateIntent(intent);

        PlayerVehicleObservation before = _vehicle.Observation;
        PlayerVehicleEnvironmentSample environment =
            ResolveEnvironment(before.PositionWorldM);
        VerticalLiftPilotCommand command = ResolveVehicleCommand(
            intent,
            before,
            _controller.PayloadMassKg,
            environment);
        PlayerVehicleAdvanceResult result = _vehicle.Advance(
            new PlayerVehicleAdvanceInput(
                Tick: _vehicleAuthorityTick,
                Command: PlayerVehicleCommand.FromVerticalLift(command),
                RecurringBaseMassKg: RecurringBaseMassKg,
                AdditivePayloadMassKg: _controller.PayloadMassKg,
                Environment: environment,
                ExternalContact: VehicleContactState.Unknown,
                ProtectionIntervention:
                    VehicleProtectionInterventionEvidence.None));
        _vehicleAuthorityTick++;
        IntegrateAppliedEnergy(result.Observation.Power);

        Vec3D position = result.Observation.PositionWorldM;
        if (!_obstacleCollisionLatched
            && IntersectsCollisionAuthority(
                position,
                VehicleCollisionRadiusM))
            _obstacleCollisionLatched = true;

        double surfaceElevationM = ResolveTerrainAt(
            position.X,
            position.Z,
            fallbackM: 0.0,
            out _);
        double clearanceM = Math.Max(
            0.0,
            position.Y - surfaceElevationM);
        _lastLandingZone = ResolveLandingZone(result.Observation);
        _lastExposure = ResolveExposure(position, clearanceM);
        bool insideSafeExit = IsInsideSafeExit(position);
        var tickObservation = new CasevacTickObservation(
            sourceTick,
            VehicleFlyable,
            insideSafeExit,
            position,
            clearanceM,
            _lastExposure.MaskingState,
            _lastExposure.WithinSafeMaskingBand,
            result.Observation.ProtectionIntervention.Active,
            _lastLandingZone);
        _snapshot = _controller.Advance(
            tickObservation,
            intent.MissionCommand);
        CasevacAircraftLossCause aircraftLossCause =
            _snapshot.Phase == CasevacPhase.AircraftLost
                ? ResolveAircraftLossCause(result.State)
                : CasevacAircraftLossCause.None;
        _evidence.ObserveTick(
            tickObservation,
            _snapshot,
            aircraftLossCause);
        if (!_retainedCorrectionsRecorded
            && _snapshot.Disposition != CasevacDisposition.Pending) {
            CasevacRetainedCorrectionMarker.Record(_evidence);
            _retainedCorrectionsRecorded = true;
        }
        _lastTickObservation = tickObservation;
        _lastSourceTick = sourceTick;
        return _snapshot;
    }

    void IntegrateAppliedEnergy(
        in VehiclePowerObservation power) {
        if (power.Assessment != VehiclePowerAssessment.Assessed
            || !double.IsFinite(power.AppliedPowerW)
            || power.AppliedPowerW < 0.0)
            throw new InvalidOperationException(
                "The CASEVAC energy ledger requires finite, assessed, non-negative applied power.");
        _consumedEnergyJ +=
            power.AppliedPowerW / AircraftSim.TickHz;
    }

    CasevacAircraftLossCause ResolveAircraftLossCause(
        in PlayerVehicleState state) {
        int causeCount = 0;
        if (_obstacleCollisionLatched) causeCount++;
        if (EnergyDepleted) causeCount++;
        if (!state.Flyable) causeCount++;
        if (causeCount > 1)
            return CasevacAircraftLossCause.ConcurrentAuthoritativeCauses;
        if (_obstacleCollisionLatched)
            return CasevacAircraftLossCause.CollisionAuthorityContact;
        if (EnergyDepleted)
            return CasevacAircraftLossCause.UsableEnergyDepleted;
        return CasevacAircraftLossCause.VehicleAuthorityUnflyable;
    }

    CasevacRotorWashVisual BuildRotorWashVisual() {
        ReducedOrderVerticalLiftProfile profile = _vehicle.Profile;
        PlayerVehicleObservation observation = _vehicle.Observation;
        double rotorRadiusM = Math.Sqrt(
            profile.RotorDiskAreaM2 / Math.PI);
        double aglM = _lastTickObservation?.ClearanceM
            ?? Math.Max(
                0.0,
                observation.PositionWorldM.Y - _startSurfaceM);
        double radiusM = Math.Clamp(
            rotorRadiusM + 0.65 * aglM,
            rotorRadiusM,
            rotorRadiusM * 3.0);
        if (observation.Power.Assessment
            != VehiclePowerAssessment.Assessed)
            return new CasevacRotorWashVisual(0.0, radiusM);

        // Fictional visual surrogate: normalize applied power above the profile-power floor, then
        // attenuate its square root to zero over four rotor radii of AGL. Both terms are bounded,
        // deterministic, and intentionally do not claim dimensional downwash velocity.
        double usablePowerRangeW = Math.Max(
            1.0,
            profile.SeaLevelMaximumShaftPowerW
                - profile.ProfilePowerW);
        double powerFraction = Math.Clamp(
            (observation.Power.AppliedPowerW - profile.ProfilePowerW)
                / usablePowerRangeW,
            0.0,
            1.0);
        double groundCoupling = 1.0 - Math.Clamp(
            aglM / (4.0 * rotorRadiusM),
            0.0,
            1.0);
        double intensity01 = Math.Clamp(
            Math.Sqrt(powerFraction) * groundCoupling,
            0.0,
            1.0);
        return new CasevacRotorWashVisual(
            intensity01,
            radiusM);
    }

    PlayerVehicleEnvironmentSample ResolveEnvironment(in Vec3D position) {
        VehicleSurfaceSample surface = ResolveVehicleSurface(position);
        double density = (_weather?.Atmosphere
            ?? StandardAtmosphere1976.Instance)
            .Sample(position.Y)
            .DensityKgM3;
        Vec3D wind = _weather?.Wind.Sample(position) ?? Vec3D.Zero;
        return new PlayerVehicleEnvironmentSample(
            density,
            wind,
            surface);
    }

    VehicleSurfaceSample ResolveVehicleSurface(in Vec3D position) {
        if (InsideHorizontalFootprint(
            position,
            _course.World.Pickup,
            _course.World.Pickup.ExitFootprintRadiusM + 1.0))
            return VehicleSurfaceSample.Horizontal(
                _course.World.Pickup.SurfaceTruthId,
                _pickupSurfaceM,
                SurfaceFrictionPerSecond);
        if (InsideHorizontalFootprint(
            position,
            _course.World.Receiver,
            _course.World.Receiver.ExitFootprintRadiusM + 1.0))
            return VehicleSurfaceSample.Horizontal(
                _course.World.Receiver.SurfaceTruthId,
                _receiverSurfaceM,
                SurfaceFrictionPerSecond);

        if (_terrain is not null
            && _terrain.TrySample(
                position.X,
                position.Z,
                out TerrainSample terrainSample))
            return new VehicleSurfaceSample(
                IsKnown: true,
                SurfaceId: terrainSample.Kind == TerrainSurfaceKind.Water
                    ? "surface.casevac.water.v1"
                    : "surface.casevac.terrain.v1",
                HeightM: terrainSample.HeightM,
                UpNormal: terrainSample.UpNormal,
                FrictionPerSecond: SurfaceFrictionPerSecond);

        return VehicleSurfaceSample.Horizontal(
            "surface.casevac.authored-fallback.v1",
            0.0,
            SurfaceFrictionPerSecond);
    }

    VerticalLiftPilotCommand ResolveVehicleCommand(
        in CasevacFlightControlIntent intent,
        in PlayerVehicleObservation observation,
        double additivePayloadMassKg,
        in PlayerVehicleEnvironmentSample environment) {
        double yaw = observation.YawRad;
        var forward = new Vec3D(Math.Sin(yaw), 0.0, Math.Cos(yaw));
        var right = new Vec3D(Math.Cos(yaw), 0.0, -Math.Sin(yaw));
        double desiredForwardSpeed = intent.Forward >= 0.0
            ? intent.Forward * MaximumForwardSpeedMps
            : intent.Forward * MaximumReverseSpeedMps;
        double desiredRightSpeed =
            intent.Right * MaximumLateralSpeedMps;
        Vec3D horizontalVelocity = new(
            observation.GroundVelocityMps.X,
            0.0,
            observation.GroundVelocityMps.Z);
        double currentForwardSpeed = horizontalVelocity.Dot(forward);
        double currentRightSpeed = horizontalVelocity.Dot(right);
        double forwardCyclic = Math.Clamp(
            (desiredForwardSpeed - currentForwardSpeed)
                * HorizontalVelocityGain,
            -1.0,
            1.0);
        double rightCyclic = Math.Clamp(
            (desiredRightSpeed - currentRightSpeed)
                * HorizontalVelocityGain,
            -1.0,
            1.0);

        double grossMassKg = RecurringBaseMassKg + additivePayloadMassKg;
        double maximumRotorThrustN = AvailableMaximumRotorThrust(
            observation.PositionWorldM,
            environment);
        double hoverCollective = grossMassKg * FlightModel.G0
            / maximumRotorThrustN;
        double desiredVerticalSpeed =
            intent.Vertical * MaximumVerticalSpeedMps;
        double collective = hoverCollective
            + (desiredVerticalSpeed - observation.VerticalSpeedMps)
                * VerticalVelocityGain;
        bool grounded = observation.Contact.IsInContact
            && environment.Surface.IsKnown;
        if (grounded && intent.Vertical <= 0.02)
            collective = Math.Min(collective, GroundIdleCollective);

        return new VerticalLiftPilotCommand(
            Collective: Math.Clamp(collective, 0.0, 1.0),
            ForwardCyclic: forwardCyclic,
            RightCyclic: rightCyclic,
            Yaw: intent.Yaw);
    }

    double AvailableMaximumRotorThrust(
        in Vec3D position,
        in PlayerVehicleEnvironmentSample environment) {
        ReducedOrderVerticalLiftProfile profile = _vehicle.Profile;
        double densityRatio = Math.Clamp(
            environment.AirDensityKgM3 / 1.225,
            0.35,
            1.15);
        double availablePowerW =
            profile.SeaLevelMaximumShaftPowerW
            * Math.Pow(densityRatio, 0.70);
        double inducedPowerBudgetW = Math.Max(
            0.0,
            availablePowerW - profile.ProfilePowerW);
        double groundEffectFactor = 1.0;
        if (environment.Surface.IsKnown) {
            double clearanceM = Math.Max(
                0.0,
                position.Y - environment.Surface.HeightM);
            if (clearanceM < profile.GroundEffectHeightM) {
                double proximity =
                    1.0 - clearanceM / profile.GroundEffectHeightM;
                groundEffectFactor = 1.0
                    + (profile.MaximumGroundEffectFactor - 1.0)
                        * proximity * proximity;
            }
        }
        double momentumTerm = Math.Sqrt(
            2.0
            * environment.AirDensityKgM3
            * profile.RotorDiskAreaM2);
        double powerLimitedThrustN = Math.Pow(
            inducedPowerBudgetW
                * profile.InducedPowerEfficiency
                * groundEffectFactor
                * momentumTerm,
            2.0 / 3.0);
        return Math.Max(
            1.0,
            Math.Min(
                profile.MaximumRotorThrustN,
                powerLimitedThrustN));
    }

    LandingZoneObservation ResolveLandingZone(
        in PlayerVehicleObservation observation) {
        Vec3D position = observation.PositionWorldM;
        LandingZoneDefinition? site = null;
        double siteSurfaceM = 0.0;
        if (InsideTerminal(
            position,
            _course.World.Pickup,
            _pickupSurfaceM)) {
            site = _course.World.Pickup;
            siteSurfaceM = _pickupSurfaceM;
        } else if (InsideTerminal(
            position,
            _course.World.Receiver,
            _receiverSurfaceM)) {
            site = _course.World.Receiver;
            siteSurfaceM = _receiverSurfaceM;
        }
        if (site is null) return LandingZoneObservation.None;

        bool insideEnter = InsideHorizontalFootprint(
            position,
            site,
            site.EnterFootprintRadiusM);
        bool insideExit = InsideHorizontalFootprint(
            position,
            site,
            site.ExitFootprintRadiusM);
        bool surfaceContact =
            observation.Contact.IsInContact
            && StringComparer.Ordinal.Equals(
                observation.Contact.SurfaceId,
                site.SurfaceTruthId)
            && position.Y >= siteSurfaceM;
        double lateralGroundSpeedMps = Math.Sqrt(
            observation.GroundVelocityMps.X
                * observation.GroundVelocityMps.X
            + observation.GroundVelocityMps.Z
                * observation.GroundVelocityMps.Z);
        return site.Observe(
            insideTerminalVolume: true,
            insideEnterFootprint: insideEnter,
            insideExitFootprint: insideExit,
            surfaceContact,
            lateralGroundSpeedMps,
            observation.VerticalSpeedMps,
            observation.PitchRad,
            observation.RollRad,
            _snapshot.CurrentApproachAttemptId);
    }

    CasevacExposureObservation ResolveExposure(
        in Vec3D position,
        double aglM) {
        ExposureFieldDefinition field = _course.World.ExposureField;
        bool[] sectorOccluded = new bool[field.Sectors.Count];
        for (int index = 0; index < field.Sectors.Count; index++) {
            sectorOccluded[index] = IsSectorOccluded(
                field.Sectors[index],
                position);
        }

        string terrainHash = _terrain is null
            ? "authority.casevac.terrain-unavailable.v1"
            : field.TerrainAuthorityHash;
        string obstacleHash =
            _course.World.CollisionAuthority.AuthorityHash;
        return field.Observe(
            aglM,
            terrainHash,
            obstacleHash,
            sectorOccluded);
    }

    bool IsSectorOccluded(
        ExposureObservationSectorDefinition sector,
        in Vec3D target) {
        double observerSurfaceM = ResolveTerrainAt(
            sector.ObserverOrigin.XM,
            sector.ObserverOrigin.ZM,
            fallbackM: 0.0,
            out bool observerTerrainKnown);
        Vec3D observer = new(
            sector.ObserverOrigin.XM,
            observerSurfaceM + ObserverHeightM,
            sector.ObserverOrigin.ZM);
        Vec3D delta = target - observer;
        double horizontalRangeM = Math.Sqrt(
            delta.X * delta.X + delta.Z * delta.Z);
        if (horizontalRangeM > sector.MaximumRangeM
            || horizontalRangeM < 1e-6)
            return true;
        double azimuth = Math.Atan2(delta.X, delta.Z);
        double sectorOffset = WrapPi(
            azimuth - sector.CentreAzimuthRad);
        if (Math.Abs(sectorOffset) > sector.HalfWidthRad)
            return true;
        if (_terrain is null || !observerTerrainKnown)
            return false;

        for (int step = 1; step < sector.RaySampleCount; step++) {
            double fraction =
                (double)step / sector.RaySampleCount;
            Vec3D point = observer + delta * fraction;
            if (_terrain.TrySample(
                    point.X,
                    point.Z,
                    out TerrainSample terrainSample)
                && point.Y <= terrainSample.HeightM
                    + ExposureTerrainClearanceM)
                return true;
            if (IntersectsCollisionAuthority(
                    point,
                    ExposureObstacleProbeRadiusM))
                return true;
        }
        return false;
    }

    bool IntersectsCollisionAuthority(
        in Vec3D worldCentre,
        double sphereRadiusM) {
        IReadOnlyList<CasevacCollisionObstacleDefinition> obstacles =
            _course.World.CollisionAuthority.Obstacles;
        for (int index = 0; index < obstacles.Count; index++) {
            CasevacCollisionObstacleDefinition obstacle =
                obstacles[index];
            Vec3D authoredCentre = new(
                worldCentre.X,
                worldCentre.Y - _obstacleSurfaceM[index],
                worldCentre.Z);
            if (obstacle.IntersectsSphere(
                    authoredCentre,
                    sphereRadiusM))
                return true;
        }
        return false;
    }

    static CasevacHorizontalPoint ObstacleAnchor(
        CasevacCollisionObstacleDefinition obstacle) =>
        new(
            0.5 * (obstacle.First.X + obstacle.Second.X),
            0.5 * (obstacle.First.Z + obstacle.Second.Z));

    bool IsInsideSafeExit(in Vec3D position) {
        CasevacSafeExitVolumeDefinition safeExit =
            _course.World.SafeExit;
        double height = position.Y - _safeExitSurfaceM;
        double dx = position.X - safeExit.Centre.XM;
        double dz = position.Z - safeExit.Centre.ZM;
        return height >= 0.0
            && height <= safeExit.HeightM
            && dx * dx + dz * dz
                <= safeExit.RadiusM * safeExit.RadiusM;
    }

    static bool InsideTerminal(
        in Vec3D position,
        LandingZoneDefinition site,
        double surfaceM) {
        double height = position.Y - surfaceM;
        return height >= 0.0
            && height <= site.TerminalHeightM
            && InsideHorizontalFootprint(
                position,
                site,
                site.TerminalRadiusM);
    }

    static bool InsideHorizontalFootprint(
        in Vec3D position,
        LandingZoneDefinition site,
        double radiusM) {
        double dx = position.X - site.Centre.XM;
        double dz = position.Z - site.Centre.ZM;
        return dx * dx + dz * dz <= radiusM * radiusM;
    }

    double ResolveSurfaceElevation(
        in CasevacHorizontalPoint point,
        double authoredFallbackM) =>
        ResolveTerrainAt(
            point.XM,
            point.ZM,
            authoredFallbackM,
            out _);

    double ResolveTerrainAt(
        double eastM,
        double northM,
        double fallbackM,
        out bool known) {
        if (_terrain is not null
            && _terrain.TrySample(
                eastM,
                northM,
                out TerrainSample sample)) {
            known = true;
            return sample.HeightM;
        }
        known = false;
        return fallbackM;
    }

    CasevacTargetGuidance BuildTargetGuidance(string? targetId) {
        if (targetId is null) return CasevacTargetGuidance.None;
        CasevacResolvedLocation target =
            StringComparer.Ordinal.Equals(
                targetId,
                _course.World.Pickup.Id)
                ? PickupLocation
                : StringComparer.Ordinal.Equals(
                    targetId,
                    _course.World.Receiver.Id)
                    ? ReceiverLocation
                    : StringComparer.Ordinal.Equals(
                        targetId,
                        _course.World.SafeExit.Id)
                        ? SafeExitLocation
                        : default;
        if (string.IsNullOrWhiteSpace(target.Id))
            return CasevacTargetGuidance.None;

        PlayerVehicleObservation observation =
            _vehicle.Observation;
        Vec3D guidancePoint = new(
            target.EastM,
            target.SurfaceElevationM,
            target.NorthM);
        double rangeM;
        CasevacResolvedRoute? route = GuidanceRouteForTarget(
            target.Id,
            _resolvedRoutes);
        if (route is not null
            && TryBuildRouteGuidance(
                route,
                observation.PositionWorldM,
                out Vec3D routePoint,
                out double routeRemainingM)) {
            guidancePoint = routePoint;
            rangeM = routeRemainingM;
        } else {
            double targetDx = target.EastM
                - observation.PositionWorldM.X;
            double targetDz = target.NorthM
                - observation.PositionWorldM.Z;
            rangeM = Math.Sqrt(
                targetDx * targetDx + targetDz * targetDz);
        }
        double dx = guidancePoint.X
            - observation.PositionWorldM.X;
        double dz = guidancePoint.Z
            - observation.PositionWorldM.Z;
        double bearing = dx * dx + dz * dz > 1e-9
            ? Math.Atan2(dx, dz)
            : observation.YawRad;
        double relative = WrapPi(
            bearing - observation.YawRad);
        double horizontalSpeed = Math.Sqrt(
            observation.GroundVelocityMps.X
                * observation.GroundVelocityMps.X
            + observation.GroundVelocityMps.Z
                * observation.GroundVelocityMps.Z);
        double planningSpeedMps = Math.Clamp(
            horizontalSpeed,
            8.0,
            MaximumForwardSpeedMps);
        return new CasevacTargetGuidance(
            target.Id,
            guidancePoint,
            rangeM,
            bearing,
            relative,
            rangeM / planningSpeedMps);
    }

    static CasevacResolvedRoute? GuidanceRouteForTarget(
        string targetId,
        IReadOnlyList<CasevacResolvedRoute> routes) {
        CasevacResolvedRoute? fallback = null;
        for (int index = 0; index < routes.Count; index++) {
            CasevacResolvedRoute route = routes[index];
            if (!StringComparer.Ordinal.Equals(
                route.EndLocationId,
                targetId)) continue;
            fallback ??= route;
            if (route.Id.Contains(
                "-direct.",
                StringComparison.Ordinal)) return route;
        }
        return fallback;
    }

    static bool TryBuildRouteGuidance(
        CasevacResolvedRoute route,
        in Vec3D position,
        out Vec3D guidancePoint,
        out double remainingRangeM) {
        guidancePoint = Vec3D.Zero;
        remainingRangeM = 0.0;
        if (route.Points.Count < 2) return false;

        int nearestSegment = 0;
        double nearestDistanceSquared = double.PositiveInfinity;
        for (int index = 0; index < route.Points.Count - 1; index++) {
            CasevacResolvedRouteControlPoint first = route.Points[index];
            CasevacResolvedRouteControlPoint second = route.Points[index + 1];
            double segmentEast = second.EastM - first.EastM;
            double segmentNorth = second.NorthM - first.NorthM;
            double lengthSquared = segmentEast * segmentEast
                + segmentNorth * segmentNorth;
            double along = lengthSquared > 1e-9
                ? Math.Clamp(
                    ((position.X - first.EastM) * segmentEast
                        + (position.Z - first.NorthM) * segmentNorth)
                        / lengthSquared,
                    0.0,
                    1.0)
                : 0.0;
            double nearestEast = first.EastM + segmentEast * along;
            double nearestNorth = first.NorthM + segmentNorth * along;
            double errorEast = position.X - nearestEast;
            double errorNorth = position.Z - nearestNorth;
            double distanceSquared = errorEast * errorEast
                + errorNorth * errorNorth;
            // Prefer the later segment on an exact control-point tie so guidance advances rather
            // than pointing back at a waypoint the aircraft has already reached.
            if (distanceSquared <= nearestDistanceSquared) {
                nearestDistanceSquared = distanceSquared;
                nearestSegment = index;
            }
        }

        int nextPointIndex = nearestSegment + 1;
        CasevacResolvedRouteControlPoint next = route.Points[nextPointIndex];
        guidancePoint = new Vec3D(
            next.EastM,
            next.SurfaceElevationM + next.TargetAglM,
            next.NorthM);
        double firstEast = next.EastM - position.X;
        double firstNorth = next.NorthM - position.Z;
        remainingRangeM = Math.Sqrt(
            firstEast * firstEast + firstNorth * firstNorth);
        for (int index = nextPointIndex;
            index < route.Points.Count - 1;
            index++) {
            CasevacResolvedRouteControlPoint first = route.Points[index];
            CasevacResolvedRouteControlPoint second = route.Points[index + 1];
            double east = second.EastM - first.EastM;
            double north = second.NorthM - first.NorthM;
            remainingRangeM += Math.Sqrt(east * east + north * north);
        }
        return true;
    }

    CasevacDestinationEnergyPlan BuildDestinationEnergyPlan(
        in CasevacTargetGuidance guidance) {
        if (guidance.TargetId is null)
            return CasevacDestinationEnergyPlan.None;

        double transitSeconds =
            guidance.HorizontalRangeM / PlanningGroundSpeedMps
            + PlanningArrivalAllowanceSeconds;
        double projectedReserveEnergyJ =
            RemainingUsableEnergyJ
            - transitSeconds * PlanningPowerW;
        return new CasevacDestinationEnergyPlan(
            guidance.TargetId,
            transitSeconds,
            projectedReserveEnergyJ,
            projectedReserveEnergyJ / _initialUsableEnergyJ,
            projectedReserveEnergyJ / PlanningPowerW);
    }

    void ObserveMissionEvent(
        CasevacMissionEventRecord missionEvent) {
        _evidence.ObserveEvent(missionEvent);
        if (_recentEvents.Count == RecentEventCapacity)
            _recentEvents.RemoveAt(0);
        _recentEvents.Add(missionEvent);
    }

    static void ValidateIntent(
        in CasevacFlightControlIntent intent) {
        ValidateAxis(intent.Forward, nameof(intent.Forward));
        ValidateAxis(intent.Right, nameof(intent.Right));
        ValidateAxis(intent.Vertical, nameof(intent.Vertical));
        ValidateAxis(intent.Yaw, nameof(intent.Yaw));
        if (!Enum.IsDefined(intent.MissionCommand))
            throw new ArgumentOutOfRangeException(
                nameof(intent.MissionCommand));
    }

    static void ValidateAxis(double value, string parameterName) {
        if (!double.IsFinite(value)
            || value < -1.0
            || value > 1.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }

    static double WrapPi(double angle) {
        while (angle > Math.PI) angle -= 2.0 * Math.PI;
        while (angle < -Math.PI) angle += 2.0 * Math.PI;
        return angle;
    }
}
