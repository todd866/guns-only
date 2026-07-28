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
/// One deterministic flight-first CASEVAC runtime. SimulationSession remains the only lifecycle
/// and fixed-step authority; this object advances exactly once for each unpaused source tick.
/// </summary>
public sealed class CasevacFlightRuntime {
    public const int RecentEventCapacity = 64;
    public const double RecurringBaseMassKg = 5_850.0;
    public const double VehicleCollisionRadiusM = 2.6;
    public const double MaximumForwardSpeedMps = 20.0;
    public const double MaximumReverseSpeedMps = 8.0;
    public const double MaximumLateralSpeedMps = 11.0;
    public const double MaximumVerticalSpeedMps = 2.0;

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

    CasevacMissionSnapshot _snapshot;
    LandingZoneObservation _lastLandingZone = LandingZoneObservation.None;
    CasevacExposureObservation _lastExposure =
        new(CasevacMaskingState.NotAssessed, false);
    CasevacTickObservation? _lastTickObservation;
    long? _lastSourceTick;
    long _vehicleAuthorityTick;
    bool _begun;
    bool _obstacleCollisionLatched;

    public CasevacFlightRuntime(
        CasevacCourseDefinition course,
        ITerrainSurface? terrain,
        WeatherProfile? weather,
        Func<long> allocateEventSequence) {
        _course = course ?? throw new ArgumentNullException(nameof(course));
        _terrain = terrain;
        _weather = weather;
        ArgumentNullException.ThrowIfNull(allocateEventSequence);

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
        for (int index = 0;
            index < _obstacleSurfaceM.Length;
            index++) {
            _obstacleSurfaceM[index] = ResolveSurfaceElevation(
                ObstacleAnchor(
                    course.World.CollisionAuthority.Obstacles[index]),
                authoredFallbackM: 0.0);
        }

        CasevacHorizontalPoint start = course.World.StartPosition;
        CasevacHorizontalPoint pickup = course.World.Pickup.Centre;
        double initialYawRad = Math.Atan2(
            pickup.XM - start.XM,
            pickup.ZM - start.ZM);
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
        _vehicle.State.Flyable && !_obstacleCollisionLatched;
    public bool ObstacleCollisionLatched => _obstacleCollisionLatched;
    public CasevacMissionController Controller => _controller;
    public CasevacMissionSnapshot Snapshot => _snapshot;
    public CasevacEvidenceRecorder Evidence => _evidence;
    public LandingZoneObservation LastLandingZone => _lastLandingZone;
    public CasevacExposureObservation LastExposure => _lastExposure;
    public CasevacTickObservation? LastTickObservation => _lastTickObservation;
    public IReadOnlyList<CasevacMissionEventRecord> RecentEvents =>
        _recentEvents;
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

    public CasevacMissionSnapshot Begin(long sourceTick) {
        if (_begun)
            throw new InvalidOperationException(
                "The CASEVAC flight runtime can begin only once.");
        _snapshot = _controller.Begin(sourceTick);
        _begun = true;
        _lastSourceTick = sourceTick;
        return _snapshot;
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
        _evidence.ObserveTick(tickObservation, _snapshot);
        _lastTickObservation = tickObservation;
        _lastSourceTick = sourceTick;
        return _snapshot;
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
        double dx = target.EastM
            - observation.PositionWorldM.X;
        double dz = target.NorthM
            - observation.PositionWorldM.Z;
        double rangeM = Math.Sqrt(dx * dx + dz * dz);
        double bearing = rangeM > 1e-9
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
            new Vec3D(
                target.EastM,
                target.SurfaceElevationM,
                target.NorthM),
            rangeM,
            bearing,
            relative,
            rangeM / planningSpeedMps);
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
