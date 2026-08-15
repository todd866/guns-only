using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra;

public enum CobraMissionStatus
{
    Active,
    RouteComplete,
    ObstacleCollision,
    TerrainUnavailable,
    VehicleAuthorityLost,
    Victory,
    Defeat,
    FobCombatIneffective
}

public enum CobraMaskingState
{
    NotAssessed,
    OutsideThreatCoverage,
    Masked,
    Exposed
}

/// <summary>An explicit scenario spawn override, useful for deterministic cards and tests.</summary>
public readonly record struct CobraMissionSpawn(
    Vec3D PositionWorldM,
    Vec3D GroundVelocityMps,
    double YawRad);

public readonly record struct CobraResolvedObstacle(
    string Id,
    CobraCanyonCollisionPrimitive Primitive,
    Vec3D FirstWorldM,
    Vec3D SecondWorldM,
    double RadiusM)
{
    public Vec3D CentreWorldM => (FirstWorldM + SecondWorldM) * 0.5;

    public bool IntersectsSphere(in Vec3D centreWorldM, double sphereRadiusM)
    {
        if (!centreWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(centreWorldM));
        if (!double.IsFinite(sphereRadiusM) || sphereRadiusM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(sphereRadiusM));

        return Primitive switch {
            CobraCanyonCollisionPrimitive.CapsuleSegment =>
                DistanceSquaredPointToSegment(centreWorldM, FirstWorldM, SecondWorldM)
                    <= Square(RadiusM + sphereRadiusM),
            CobraCanyonCollisionPrimitive.AxisAlignedBox =>
                DistanceSquaredPointToBox(centreWorldM, FirstWorldM, SecondWorldM)
                    <= Square(sphereRadiusM),
            _ => throw new InvalidOperationException("Unsupported obstacle primitive.")
        };
    }

    internal bool IntersectsSweptSphere(
        in Vec3D startWorldM,
        in Vec3D endWorldM,
        double sphereRadiusM)
    {
        return Primitive switch {
            CobraCanyonCollisionPrimitive.CapsuleSegment =>
                SegmentSegmentDistanceSquared(
                    startWorldM, endWorldM, FirstWorldM, SecondWorldM)
                    <= Square(RadiusM + sphereRadiusM),
            CobraCanyonCollisionPrimitive.AxisAlignedBox =>
                SegmentIntersectsExpandedBox(
                    startWorldM, endWorldM,
                    FirstWorldM, SecondWorldM, sphereRadiusM),
            _ => throw new InvalidOperationException("Unsupported obstacle primitive.")
        };
    }

    public bool IntersectsSegment(in Vec3D startWorldM, in Vec3D endWorldM)
    {
        return Primitive switch {
            CobraCanyonCollisionPrimitive.CapsuleSegment =>
                SegmentSegmentDistanceSquared(
                    startWorldM, endWorldM, FirstWorldM, SecondWorldM)
                    <= Square(RadiusM),
            CobraCanyonCollisionPrimitive.AxisAlignedBox =>
                SegmentIntersectsExpandedBox(
                    startWorldM, endWorldM, FirstWorldM, SecondWorldM, 0.0),
            _ => throw new InvalidOperationException("Unsupported obstacle primitive.")
        };
    }

    static double DistanceSquaredPointToSegment(
        in Vec3D point,
        in Vec3D first,
        in Vec3D second)
    {
        Vec3D delta = second - first;
        double lengthSquared = delta.Dot(delta);
        double fraction = lengthSquared <= 1e-12
            ? 0.0
            : Math.Clamp((point - first).Dot(delta) / lengthSquared, 0.0, 1.0);
        Vec3D offset = point - (first + delta * fraction);
        return offset.Dot(offset);
    }

    static double DistanceSquaredPointToBox(
        in Vec3D point,
        in Vec3D minimum,
        in Vec3D maximum)
    {
        double east = Math.Max(minimum.X - point.X, Math.Max(0.0, point.X - maximum.X));
        double up = Math.Max(minimum.Y - point.Y, Math.Max(0.0, point.Y - maximum.Y));
        double north = Math.Max(minimum.Z - point.Z, Math.Max(0.0, point.Z - maximum.Z));
        return east * east + up * up + north * north;
    }

    // Closest points on two finite segments, from the standard clamped two-segment solution.
    static double SegmentSegmentDistanceSquared(
        in Vec3D firstStart,
        in Vec3D firstEnd,
        in Vec3D secondStart,
        in Vec3D secondEnd)
    {
        const double epsilon = 1e-12;
        Vec3D firstDelta = firstEnd - firstStart;
        Vec3D secondDelta = secondEnd - secondStart;
        Vec3D originDelta = firstStart - secondStart;
        double firstLengthSquared = firstDelta.Dot(firstDelta);
        double secondLengthSquared = secondDelta.Dot(secondDelta);
        double secondProjection = secondDelta.Dot(originDelta);
        double firstFraction;
        double secondFraction;

        if (firstLengthSquared <= epsilon && secondLengthSquared <= epsilon)
            return originDelta.Dot(originDelta);
        if (firstLengthSquared <= epsilon) {
            firstFraction = 0.0;
            secondFraction = Math.Clamp(secondProjection / secondLengthSquared, 0.0, 1.0);
        } else {
            double firstProjection = firstDelta.Dot(originDelta);
            if (secondLengthSquared <= epsilon) {
                secondFraction = 0.0;
                firstFraction = Math.Clamp(-firstProjection / firstLengthSquared, 0.0, 1.0);
            } else {
                double crossProjection = firstDelta.Dot(secondDelta);
                double denominator = firstLengthSquared * secondLengthSquared
                    - crossProjection * crossProjection;
                firstFraction = denominator <= epsilon
                    ? 0.0
                    : Math.Clamp(
                        (crossProjection * secondProjection
                            - firstProjection * secondLengthSquared) / denominator,
                        0.0, 1.0);
                secondFraction = (crossProjection * firstFraction + secondProjection)
                    / secondLengthSquared;
                if (secondFraction < 0.0) {
                    secondFraction = 0.0;
                    firstFraction = Math.Clamp(-firstProjection / firstLengthSquared, 0.0, 1.0);
                } else if (secondFraction > 1.0) {
                    secondFraction = 1.0;
                    firstFraction = Math.Clamp(
                        (crossProjection - firstProjection) / firstLengthSquared,
                        0.0, 1.0);
                }
            }
        }

        Vec3D separation = originDelta
            + firstDelta * firstFraction
            - secondDelta * secondFraction;
        return separation.Dot(separation);
    }

    static bool SegmentIntersectsExpandedBox(
        in Vec3D start,
        in Vec3D end,
        in Vec3D minimum,
        in Vec3D maximum,
        double expansionM)
    {
        Vec3D expandedMinimum = new(
            minimum.X - expansionM,
            minimum.Y - expansionM,
            minimum.Z - expansionM);
        Vec3D expandedMaximum = new(
            maximum.X + expansionM,
            maximum.Y + expansionM,
            maximum.Z + expansionM);
        Vec3D delta = end - start;
        double minimumFraction = 0.0;
        double maximumFraction = 1.0;

        return ClipAxis(start.X, delta.X, expandedMinimum.X, expandedMaximum.X,
                ref minimumFraction, ref maximumFraction)
            && ClipAxis(start.Y, delta.Y, expandedMinimum.Y, expandedMaximum.Y,
                ref minimumFraction, ref maximumFraction)
            && ClipAxis(start.Z, delta.Z, expandedMinimum.Z, expandedMaximum.Z,
                ref minimumFraction, ref maximumFraction);
    }

    static bool ClipAxis(
        double origin,
        double delta,
        double minimum,
        double maximum,
        ref double minimumFraction,
        ref double maximumFraction)
    {
        const double epsilon = 1e-12;
        if (Math.Abs(delta) <= epsilon)
            return origin >= minimum && origin <= maximum;

        double inverse = 1.0 / delta;
        double entry = (minimum - origin) * inverse;
        double exit = (maximum - origin) * inverse;
        if (entry > exit) (entry, exit) = (exit, entry);
        minimumFraction = Math.Max(minimumFraction, entry);
        maximumFraction = Math.Min(maximumFraction, exit);
        return minimumFraction <= maximumFraction;
    }

    static double Square(double value) => value * value;
}

public readonly record struct CobraResolvedThreatObserver(
    string Id,
    Vec3D PositionWorldM,
    double MaximumAssessmentRangeM);

public readonly record struct CobraThreatLineOfSight(
    string ObserverId,
    double RangeM,
    bool InAssessmentRange,
    bool TerrainKnown,
    bool TerrainOccluded,
    bool ObstacleOccluded,
    bool HasLineOfSight);

public sealed record CobraMaskingAssessment(
    CobraMaskingState State,
    int ObserversInRange,
    int ObserversWithLineOfSight,
    IReadOnlyList<CobraThreatLineOfSight> Observers);

public readonly record struct CobraRouteGuidance(
    string RouteId,
    string NextPointId,
    int SegmentIndex,
    double CrossTrackDistanceM,
    double CorridorRadiusM,
    bool InsideCorridor,
    double RemainingHorizontalDistanceM,
    double TargetAglM,
    double? CurrentClearanceM,
    double? AglErrorM);

public sealed record CobraMissionDiagnostics(
    CobraMissionStatus Status,
    long AuthorityTicksAdvanced,
    string WorldId,
    string SelectedRouteId,
    bool ProviderFlyable,
    bool MissionFlyable,
    bool TerrainSampleKnown,
    double? ClearanceM,
    string? CollisionObstacleId,
    CobraRouteGuidance RouteGuidance,
    CobraMaskingAssessment Masking,
    CobraBattleDamageState BattleDamage,
    long MaskingAssessmentAuthorityTicks,
    string FidelityDisclosure);

public readonly record struct CobraMissionAdvanceResult(
    PlayerVehicleAdvanceResult Vehicle,
    CobraMissionDiagnostics Diagnostics);

/// <summary>
/// Headless mission authority for the Cobra Canyon slice. Pilot commands go directly to the
/// existing AH-1G provider; this class adds terrain sampling, authored obstacle collision, route
/// guidance, terrain/obstacle masking and mission-owned hostile-fire damage. Named SCAS and engine
/// hits invoke explicit provider failure seams; every resulting force, moment and contact remains
/// owned by the flight dynamics provider, and raw pilot commands are never rewritten here.
/// </summary>
public sealed class CobraMissionRuntime
{
    public const double DefaultRecurringBaseMassKg = 4_051.0;
    public const double DefaultAirDensityKgM3 = 1.225;
    public const double LandSurfaceFrictionPerSecond = 3.4;
    public const double WaterSurfaceFrictionPerSecond = 0.7;
    public const double LineOfSightTerrainClearanceM = 0.5;
    public const int MaskingAssessmentIntervalTicks = 12;
    /// <summary>
    /// Hard ceiling on the number of terrain lookups a single line-of-sight ray may take.
    ///
    /// The march step is the terrain's own resolution (clamped to 10-50 m), so without a ceiling
    /// the cost of a sight line scales with its length: the gun's 2 km envelope took 80 lookups
    /// and the threat observers' rays more. 64 samples puts a full-envelope gun ray at ~31 m
    /// spacing — inside the 10-50 m band the march already treats as honest — and makes the worst
    /// ray cost the same as the average one.
    /// </summary>
    public const int MaximumLineOfSightSamples = 64;
    /// <summary>
    /// Cadence of the basin ground war, in hertz. Same doctrine as
    /// <see cref="MaskingAssessmentIntervalTicks"/>: only the airframe needs the airframe's rate.
    ///
    /// Build 265 shipped the ground war stepped once per 120 Hz authority tick. Measured in the
    /// browser with a phase-skip build, that single call was 3.5 ms of a 4.2 ms authority tick —
    /// roughly 85% of the whole simulation, and at two ticks per rendered frame it ate 7 ms of a
    /// 16.7 ms budget before the renderer drew anything. Worse, it was self-amplifying: a long
    /// frame asks for more catch-up ticks, which lengthens the next frame. That was the owner's
    /// "very laggy".
    ///
    /// Nothing in the basin fight needs 120 Hz. Units move at ~10 m/s, so a 50 ms step displaces
    /// one by half a metre; damage, control drift and reinforcement cadence are all dt-scaled and
    /// therefore rate-invariant by construction. What changes is combat granularity — mutual
    /// damage now resolves in 50 ms slices rather than 8.3 ms ones, so a unit that dies mid-slice
    /// still returns that slice's fire. The balance here is explicitly provisional (see
    /// CobraGroundWarRuntime's header), and this is well inside its tolerance.
    /// </summary>
    public const double GroundWarStepHz = 20.0;
    // Provisional gameplay collision proxy for the fortified garrison body rendered at each
    // hostile objective. Ambient foliage remains presentation-only by doctrine; this is the
    // targetable, authority-owned hardpoint itself. See ah-1g-cobra/00-sources.md.
    public const double GarrisonCollisionRadiusM = 2.4;
    public const double GarrisonCollisionHeightM = 2.6;
    const double GroundWarStepSeconds = 1.0 / GroundWarStepHz;
    static readonly VerticalLiftPilotCommand GroundedCommand = new(0.0, 0.0, 0.0, 0.0);

    readonly CobraCanyonDefinition _definition;
    readonly ITerrainSurface _terrain;
    readonly CobraCanyonRouteDefinition _selectedRoute;
    Ah1gCobraDynamics _cobra;
    readonly List<CobraAirframeSlot> _airframePool = new();
    int _airframeSwaps;
    readonly double _recurringBaseMassKg;
    readonly double _additivePayloadMassKg;
    readonly double _airDensityKgM3;
    readonly Vec3D _synopticWindMps;
    readonly CobraCanyonWindField? _windField;
    Vec3D _lastWindVelocityMps;
    RotorcraftAirflowSample? _lastRotorcraftAirflow;
    readonly IReadOnlyList<CobraResolvedObstacle> _resolvedObstacles;
    readonly IReadOnlyList<CobraResolvedThreatObserver> _resolvedThreatObservers;
    readonly CobraGroundWarRuntime _groundWar;
    readonly CobraThreatFireRuntime _threatFire = new();
    readonly CobraTurnaroundRuntime _turnaround = new();
    readonly Vec3D _bridgeCentreWorldM;
    CobraMaskingAssessment _cachedMaskingAssessment = null!;
    long _maskingAssessmentAuthorityTicks;
    long _nextAuthorityTick;
    string? _collisionObstacleId;
    double _groundWarAccumulatorSeconds;
    CobraMissionAct _act = CobraMissionAct.Depart;
    // Diagnostics are read once per GetState (30 Hz), never once per tick. Building them eagerly
    // walked the route polyline and resampled terrain 120 times a second to throw 119 away.
    CobraMissionDiagnostics? _diagnostics;

    public CobraMissionRuntime(
        CobraCanyonDefinition definition,
        ITerrainSurface terrain,
        CobraCanyonRouteChoice routeChoice,
        double recurringBaseMassKg = DefaultRecurringBaseMassKg,
        double additivePayloadMassKg = 0.0,
        double airDensityKgM3 = DefaultAirDensityKgM3,
        Vec3D? windVelocityMps = null,
        bool enableTerrainWind = true,
        CobraMissionSpawn? spawn = null,
        int? groundWarSeed = null)
    {
        _definition = definition ?? throw new ArgumentNullException(nameof(definition));
        _terrain = terrain ?? throw new ArgumentNullException(nameof(terrain));
        _selectedRoute = definition.Route(routeChoice);
        RequirePositive(recurringBaseMassKg, nameof(recurringBaseMassKg));
        RequireNonNegative(additivePayloadMassKg, nameof(additivePayloadMassKg));
        RequirePositive(airDensityKgM3, nameof(airDensityKgM3));
        if (!terrain.Bounds.Contains(definition.Bounds.MinimumEastM, definition.Bounds.MinimumNorthM)
            || !terrain.Bounds.Contains(definition.Bounds.MaximumEastM, definition.Bounds.MaximumNorthM))
            throw new ArgumentException(
                "The terrain surface must cover the complete authored Cobra Canyon world.",
                nameof(terrain));
        RequirePositive(terrain.HorizontalResolutionM, nameof(terrain.HorizontalResolutionM));

        _recurringBaseMassKg = recurringBaseMassKg;
        _additivePayloadMassKg = additivePayloadMassKg;
        _airDensityKgM3 = airDensityKgM3;
        // Explicit Zero → still air (most unit tests). Production bridge passes DefaultSynoptic.
        _synopticWindMps = windVelocityMps ?? Vec3D.Zero;
        if (!_synopticWindMps.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(windVelocityMps));
        _windField = enableTerrainWind && _synopticWindMps.Length > 1e-9
            ? new CobraCanyonWindField(_terrain, _synopticWindMps)
            : null;
        _lastWindVelocityMps = _synopticWindMps;
        _lastRotorcraftAirflow = null;

        _resolvedObstacles = Array.AsReadOnly(
            definition.Obstacles.Select(ResolveObstacle).ToArray());
        _resolvedThreatObservers = Array.AsReadOnly(
            definition.ThreatObservers.Select(ResolveThreatObserver).ToArray());

        CobraCanyonLandmarkDefinition campLandmark = definition.Landmarks.First(landmark =>
            string.Equals(
                landmark.Id,
                "landmark.cobra-canyon.camp-ember.v1",
                StringComparison.Ordinal));
        if (!terrain.TrySample(campLandmark.EastM, campLandmark.NorthM, out TerrainSample padSurface))
            throw new InvalidOperationException("Camp Ember has no terrain truth.");
        // The cold open faces the surveyed north-west departure/go-around lane. Route selection
        // changes after departure; it must never turn the parked aircraft toward a berm or cliff.
        double defaultYawRad = CampEmberOperations.FinalHeadingRad;
        double padClearanceM = Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM;
        CobraMissionSpawn resolvedSpawn = spawn ?? new CobraMissionSpawn(
            new Vec3D(
                campLandmark.EastM,
                padSurface.HeightM + padClearanceM,
                campLandmark.NorthM),
            Vec3D.Zero,
            defaultYawRad);
        if (!resolvedSpawn.PositionWorldM.IsFinite
            || !resolvedSpawn.GroundVelocityMps.IsFinite
            || !double.IsFinite(resolvedSpawn.YawRad))
            throw new ArgumentOutOfRangeException(nameof(spawn));
        if (!terrain.TrySample(
            resolvedSpawn.PositionWorldM.X,
            resolvedSpawn.PositionWorldM.Z,
            out _))
            throw new ArgumentException("The explicit spawn must lie over available terrain.", nameof(spawn));

        _cobra = new Ah1gCobraDynamics(
            vehicleId: "cobra-canyon.player",
            resolvedSpawn.PositionWorldM,
            resolvedSpawn.GroundVelocityMps,
            resolvedSpawn.YawRad,
            recurringBaseMassKg,
            additivePayloadMassKg,
            Ah1gCobraDefinition.LateProduction);
        double stationSkidM = Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM;
        _airframePool.Add(new CobraAirframeSlot(
            "cobra-canyon.airframe-1",
            CobraAirframeState.PlayerFlying,
            resolvedSpawn.PositionWorldM,
            resolvedSpawn.YawRad));
        foreach ((string slotId, double northOffsetM) in new[]
        {
            ("cobra-canyon.airframe-2", CobraAirframePool.SpareStationOffsetNorthM),
            ("cobra-canyon.airframe-3", -CobraAirframePool.SpareStationOffsetNorthM),
        })
        {
            double stationEastM =
                campLandmark.EastM + CobraAirframePool.SpareStationOffsetEastM;
            if (!terrain.TrySample(
                stationEastM,
                campLandmark.NorthM + northOffsetM,
                out TerrainSample stationSurface))
                throw new InvalidOperationException(
                    "A spare airframe station has no terrain datum.");
            _airframePool.Add(new CobraAirframeSlot(
                slotId,
                CobraAirframeState.Ready,
                new Vec3D(
                    stationEastM,
                    stationSurface.HeightM + stationSkidM,
                    campLandmark.NorthM + northOffsetM),
                CobraAirframePool.SpareStationYawRad));
        }
        _groundWar = new CobraGroundWarRuntime(definition, terrain, groundWarSeed);
        CobraCanyonLandmarkDefinition bridgeLandmark = definition.Landmarks.First(landmark =>
            string.Equals(
                landmark.Id,
                "landmark.cobra-canyon.iron-bell-bridge.v1",
                StringComparison.Ordinal));
        if (!terrain.TrySample(bridgeLandmark.EastM, bridgeLandmark.NorthM, out TerrainSample bridgeSurface))
            throw new InvalidOperationException("Iron Bell Bridge has no terrain datum.");
        _bridgeCentreWorldM = new Vec3D(
            bridgeLandmark.EastM,
            bridgeSurface.HeightM,
            bridgeLandmark.NorthM);
        // Depart is a friendly pad open — no nose hostile until Ingress clears the pad ring.
        // Crew-chain coverage seeds then (see EnsureGunnerySeamForIngress).
        Status = CobraMissionStatus.Active;
        _cachedMaskingAssessment = AssessMaskingAt(_cobra.State.PositionWorldM);
        _maskingAssessmentAuthorityTicks = 0;
        RefreshAct(resolvedSpawn.PositionWorldM, clearanceM: resolvedSpawn.PositionWorldM.Y - (
            terrain.TrySample(
                resolvedSpawn.PositionWorldM.X,
                resolvedSpawn.PositionWorldM.Z,
                out TerrainSample spawnSurface)
                ? spawnSurface.HeightM
                : resolvedSpawn.PositionWorldM.Y));
    }

    public CobraCanyonDefinition Definition => _definition;
    public ITerrainSurface Terrain => _terrain;
    public CobraCanyonRouteDefinition SelectedRoute => _selectedRoute;
    public Ah1gCobraDynamics Cobra => _cobra;

    /// <summary>Camp Ember's ramp: the player's bird plus the spares. The pool is the resource.</summary>
    public IReadOnlyList<CobraAirframeSlot> AirframePool => _airframePool;

    /// <summary>How many times the player has swapped into a spare this mission.</summary>
    public int AirframeSwaps => _airframeSwaps;
    /// <summary>Most recent wind sample applied to the vehicle environment (m/s, E/U/N).</summary>
    public Vec3D LastWindVelocityMps => _lastWindVelocityMps;
    /// <summary>
    /// Most recent spatial airflow truth across the main-rotor disc and tail. Null means the
    /// runtime intentionally supplied uniform flow rather than silently inventing a gradient.
    /// </summary>
    public RotorcraftAirflowSample? LastRotorcraftAirflow => _lastRotorcraftAirflow;
    public Vec3D SynopticWindMps => _synopticWindMps;
    public IPlayerVehicleDynamics Vehicle => _cobra;
    public CobraGroundWarRuntime GroundWar => _groundWar;
    public CobraBattleDamageState BattleDamage => _threatFire.State;
    public CobraTurnaroundRuntime Turnaround => _turnaround;
    public IReadOnlyList<CobraThreatBurstEvent> RecentThreatBursts => _threatFire.RecentBursts;
    public CobraMissionAct Act => _act;
    /// <summary>
    /// The basin clock starts when the aircraft reaches the bridge attack area. The authored
    /// River Gorge ingress is longer than the original 300-ticket pool at the opening 1-3 split;
    /// spending tickets on the ramp and route could leave less than a minute for the mission the
    /// player was briefed to fly. Engage/Hold stays live through a later FOB turnaround.
    /// </summary>
    public bool GroundWarCombatLive => _act is CobraMissionAct.Engage or CobraMissionAct.Hold;
    public IReadOnlyList<CobraPathGate> PathGates => CobraMissionActProgress.BuildPathGates(
        _act,
        _selectedRoute,
        _groundWar.Fob.CentreWorldM,
        fobPathAltitudeM: _groundWar.Fob.CentreWorldM.Y + 30.0,
        aircraftWorldM: _cobra.State.PositionWorldM);
    public IReadOnlyList<CobraResolvedObstacle> ResolvedObstacles => _resolvedObstacles;
    public IReadOnlyList<CobraResolvedThreatObserver> ResolvedThreatObservers =>
        _resolvedThreatObservers;
    public double CollisionEnvelopeRadiusM => _cobra.Definition.MainRotor.RadiusM;
    public CobraMissionStatus Status { get; private set; }
    public bool MissionFlyable => Status == CobraMissionStatus.Active
        && (_cobra.State.Flyable || CanServiceCurrentAirframeAtFob());
    /// <summary>
    /// Authority diagnostics for the current tick, built on first read and cached until the next
    /// Advance. Consumers sample this at snapshot rate, not tick rate.
    /// </summary>
    public CobraMissionDiagnostics Diagnostics => _diagnostics ??= BuildDiagnostics();

    /// <summary>
    /// Authority gate for the pilot's visual lock. A renderer raycast cannot establish target
    /// visibility because the rendered foliage/LOD scene is presentation-only; visual lock and
    /// the AI gunner therefore share the same living-hostile and terrain/obstacle LOS facts.
    /// </summary>
    public bool CanAcquireVisualLockTarget(string? targetUnitId)
    {
        if (string.IsNullOrWhiteSpace(targetUnitId)) return false;
        GroundUnit? target = _groundWar.FindUnit(targetUnitId);
        return target is { IsAlive: true, Faction: GroundFaction.Hostile }
            && CobraGunTargeting.EvaluateLineOfSight(
                _terrain,
                _resolvedObstacles,
                _cobra.State.PositionWorldM,
                target.PositionWorldM);
    }

    public CobraMissionAdvanceResult Advance(
        in VerticalLiftPilotCommand command,
        bool turnaroundActionHeld = false)
    {
        if (Status != CobraMissionStatus.Active)
            throw new InvalidOperationException(
                $"Cobra Canyon authority is terminal in state {Status}.");

        Vec3D previousPositionWorldM = _cobra.State.PositionWorldM;
        VehicleSurfaceSample surface = SampleVehicleSurface(previousPositionWorldM);
        double simulationTimeSeconds = _nextAuthorityTick
            * PlayerVehicleContract.FixedDeltaSeconds;
        Vec3D windVelocityMps = _windField is null
            ? _synopticWindMps
            : _windField.Sample(previousPositionWorldM, simulationTimeSeconds);
        RotorcraftAirflowSample? rotorcraftAirflow = _windField is null
            ? null
            : SampleRotorcraftAirflow(simulationTimeSeconds);
        _lastWindVelocityMps = windVelocityMps;
        _lastRotorcraftAirflow = rotorcraftAirflow;
        VerticalLiftPilotCommand authorityCommand = _turnaround.FlightControlsEnabled
            ? command
            : GroundedCommand;
        PlayerVehicleAdvanceResult vehicleResult = _cobra.Advance(new PlayerVehicleAdvanceInput(
            Tick: _nextAuthorityTick,
            Command: PlayerVehicleCommand.FromVerticalLift(authorityCommand),
            RecurringBaseMassKg: _recurringBaseMassKg,
            AdditivePayloadMassKg: _additivePayloadMassKg,
            Environment: new PlayerVehicleEnvironmentSample(
                _airDensityKgM3,
                windVelocityMps,
                surface,
                RotorcraftAirflow: rotorcraftAirflow),
            ExternalContact: VehicleContactState.Unknown,
            ProtectionIntervention: VehicleProtectionInterventionEvidence.None));
        _nextAuthorityTick++;

        Vec3D currentPositionWorldM = vehicleResult.State.PositionWorldM;
        if (!_terrain.TrySample(
            currentPositionWorldM.X,
            currentPositionWorldM.Z,
            out _)) {
            Status = CobraMissionStatus.TerrainUnavailable;
        } else if (TryFindSweptObstacleContact(
            previousPositionWorldM,
            currentPositionWorldM,
            CollisionEnvelopeRadiusM,
            out CobraResolvedObstacle collision)) {
            _collisionObstacleId = collision.Id;
            Status = CobraMissionStatus.ObstacleCollision;
        } else if (TryFindSweptGarrisonContact(
            previousPositionWorldM,
            currentPositionWorldM,
            CollisionEnvelopeRadiusM,
            out string? garrisonId)) {
            _collisionObstacleId = garrisonId;
            Status = CobraMissionStatus.ObstacleCollision;
        } else if (!vehicleResult.State.Flyable
            && !CanServiceCurrentAirframeAtFob()) {
            // A pad wreck remains authority-owned long enough to secure it and cold-start a
            // replacement. The same wreck anywhere else is still immediately terminal.
            Status = CobraMissionStatus.VehicleAuthorityLost;
        }
        // Route end is guidance-only: ground war / FOB resupply needs an open sandbox, not a
        // terminal RouteComplete. Remaining distance stays on RouteGuidance.

        if (Status != CobraMissionStatus.Active
            || _nextAuthorityTick - _maskingAssessmentAuthorityTicks
                >= MaskingAssessmentIntervalTicks) {
            _cachedMaskingAssessment = AssessMaskingAt(currentPositionWorldM);
            _maskingAssessmentAuthorityTicks = _nextAuthorityTick;
        }

        if (Status == CobraMissionStatus.Active)
        {
            bool scasWasDamaged = _threatFire.State.ScasDamaged;
            bool engineWasDamaged = _threatFire.State.EngineDamaged;
            _threatFire.Advance(
                PlayerVehicleContract.FixedDeltaSeconds,
                _cachedMaskingAssessment,
                _resolvedThreatObservers,
                _groundWar.Units,
                new CobraThreatAirframeGeometry(
                    currentPositionWorldM,
                    _cobra.State.BodyAttitude));
            if (!scasWasDamaged && _threatFire.State.ScasDamaged)
                _cobra.FailScas();
            if (!engineWasDamaged && _threatFire.State.EngineDamaged)
                _cobra.FailEngine();
        }

        // Strategic cadence (see GroundWarStepHz): batch the airframe's fixed steps until a
        // ground-war step is due, then advance the basin fight by exactly the time that elapsed.
        // Rearm stays at authority rate — it is one terrain sample and the pilot must feel it
        // the instant the skids settle on the Camp Ember pad.
        if (GroundWarCombatLive) {
            _groundWarAccumulatorSeconds += PlayerVehicleContract.FixedDeltaSeconds;
            if (_groundWarAccumulatorSeconds + 1e-12 >= GroundWarStepSeconds) {
                double groundWarDeltaSeconds = _groundWarAccumulatorSeconds;
                _groundWarAccumulatorSeconds = 0.0;
                _groundWar.Advance(groundWarDeltaSeconds);
            }
        } else {
            // Never bank ramp/ingress time into a catch-up burst on the first combat frame.
            _groundWarAccumulatorSeconds = 0.0;
        }
        if (Status == CobraMissionStatus.Active)
            _groundWar.TryResupplyAtFob(currentPositionWorldM);
        if (Status == CobraMissionStatus.Active)
        {
            CobraTurnaroundDirective turnaround = _turnaround.Advance(
                PlayerVehicleContract.FixedDeltaSeconds,
                BuildTurnaroundObservation(command.Collective, turnaroundActionHeld));
            if (turnaround.ShutdownEngine)
                _cobra.ShutdownEngine();
            if (turnaround.TransferAirframe)
            {
                TransferAirframeAtFob(currentPositionWorldM);
                currentPositionWorldM = _cobra.State.PositionWorldM;
                vehicleResult = new PlayerVehicleAdvanceResult(_cobra.State, _cobra.Observation);
                _cachedMaskingAssessment = AssessMaskingAt(currentPositionWorldM);
                _maskingAssessmentAuthorityTicks = _nextAuthorityTick;
            }
            if (turnaround.StartEngine)
                _cobra.StartEngine();
            if (turnaround.EndMissionNoSpare)
            {
                SecureCurrentAirframe(currentPositionWorldM, spareIndex: -1);
                Status = CobraMissionStatus.FobCombatIneffective;
            }
        }
        if (Status == CobraMissionStatus.Active) {
            Status = _groundWar.MissionOutcome switch {
                HoldTheBridgeOutcome.Victory => CobraMissionStatus.Victory,
                HoldTheBridgeOutcome.Defeat => CobraMissionStatus.Defeat,
                _ => Status
            };
        }

        double? clearanceM = null;
        if (_terrain.TrySample(
            currentPositionWorldM.X,
            currentPositionWorldM.Z,
            out TerrainSample currentSurface)) {
            clearanceM = currentPositionWorldM.Y - currentSurface.HeightM;
        }
        RefreshAct(currentPositionWorldM, clearanceM);

        _diagnostics = null;
        return new CobraMissionAdvanceResult(vehicleResult, Diagnostics);
    }

    RotorcraftAirflowSample SampleRotorcraftAirflow(double simulationTimeSeconds)
    {
        if (_windField is null)
            throw new InvalidOperationException(
                "Spatial rotorcraft airflow requires the terrain wind field.");

        PlayerVehicleState state = _cobra.State;
        QuaternionD attitude = state.BodyAttitude.Normalized();
        RotorcraftDefinition definition = _cobra.Definition;
        Vec3D mainHubWorldM = state.PositionWorldM
            + attitude.Rotate(definition.Contact.MainRotorHubOffsetBodyM);
        Vec3D bodyForwardWorld = attitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D bodyRightWorld = attitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        // Seventy-percent radius captures the disc's lifting span without letting a single
        // exact edge/cell crossing dominate the finite-difference gust moment.
        double sampleRadiusM = RotorcraftAirflowSample.MainRotorSampleRadiusFraction
            * definition.MainRotor.RadiusM;
        Vec3D tailHubWorldM = state.PositionWorldM
            + attitude.Rotate(definition.Contact.TailRotorHubOffsetBodyM);

        return new RotorcraftAirflowSample(
            MainRotorForwardWindVelocityMps: _windField.Sample(
                mainHubWorldM + bodyForwardWorld * sampleRadiusM,
                simulationTimeSeconds),
            MainRotorAftWindVelocityMps: _windField.Sample(
                mainHubWorldM - bodyForwardWorld * sampleRadiusM,
                simulationTimeSeconds),
            MainRotorLeftWindVelocityMps: _windField.Sample(
                mainHubWorldM - bodyRightWorld * sampleRadiusM,
                simulationTimeSeconds),
            MainRotorRightWindVelocityMps: _windField.Sample(
                mainHubWorldM + bodyRightWorld * sampleRadiusM,
                simulationTimeSeconds),
            TailRotorWindVelocityMps: _windField.Sample(
                tailHubWorldM,
                simulationTimeSeconds));
    }

    void RefreshAct(in Vec3D positionWorldM, double? clearanceM)
    {
        CobraMissionAct previous = _act;
        _act = CobraMissionActProgress.Next(
            _act,
            positionWorldM,
            _groundWar.Fob.CentreWorldM,
            _bridgeCentreWorldM,
            _groundWar.VictoryHoldProgress,
            _groundWar.MissionOutcome,
            Status,
            clearanceM);
        if (previous == CobraMissionAct.Depart && _act == CobraMissionAct.Ingress)
            EnsureGunnerySeamForIngress(positionWorldM);
    }

    /// <summary>
    /// Plant the standing Tab→F seam once the aircraft has left the pad. Idempotent.
    /// </summary>
    void EnsureGunnerySeamForIngress(in Vec3D positionWorldM)
    {
        double yawRad = PlayerVehicleValidation.AttitudeAngles(_cobra.State.BodyAttitude).Yaw;
        _groundWar.SeedStandingGunneryTarget(positionWorldM, yawRad);
    }

    /// <summary>
    /// Applies fire-authorized M134 damage to a ground-war unit and drains the magazine.
    /// </summary>
    public bool ApplyAuthorizedGunfire(string? targetUnitId)
    {
        if (!_turnaround.WeaponsEnabled) return false;
        return _groundWar.ApplyAuthorizedFire(
            targetUnitId,
            PlayerVehicleContract.FixedDeltaSeconds);
    }

    public bool TryFindObstacleContact(
        in Vec3D centreWorldM,
        double sphereRadiusM,
        out CobraResolvedObstacle collision)
    {
        foreach (CobraResolvedObstacle obstacle in _resolvedObstacles) {
            if (!obstacle.IntersectsSphere(centreWorldM, sphereRadiusM)) continue;
            collision = obstacle;
            return true;
        }
        collision = default;
        return false;
    }

    public CobraThreatLineOfSight AssessThreatAt(
        string observerId,
        in Vec3D targetWorldM)
    {
        if (string.IsNullOrWhiteSpace(observerId))
            throw new ArgumentException("An observer identifier is required.", nameof(observerId));
        if (!targetWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(targetWorldM));
        foreach (CobraResolvedThreatObserver observer in _resolvedThreatObservers) {
            if (string.Equals(observer.Id, observerId, StringComparison.Ordinal))
                return AssessThreat(observer, targetWorldM);
        }
        throw new KeyNotFoundException($"Unknown Cobra Canyon observer '{observerId}'.");
    }

    public CobraMaskingAssessment AssessMaskingAt(in Vec3D targetWorldM)
    {
        if (!targetWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(targetWorldM));
        var assessments = new CobraThreatLineOfSight[_resolvedThreatObservers.Count];
        int observersInRange = 0;
        int observersWithLineOfSight = 0;
        bool anyUnknown = false;
        for (int index = 0; index < _resolvedThreatObservers.Count; index++) {
            CobraThreatLineOfSight assessment = AssessThreat(
                _resolvedThreatObservers[index], targetWorldM);
            // A destroyed emplacement is no longer exposure authority. Keep its geometric
            // sample in the per-observer array for diagnostics, but remove it from the aggregate
            // coverage/LOS counts and from acquisition.
            if (!IsOperationalThreatObserver(assessment.ObserverId)) {
                assessments[index] = assessment with {
                    InAssessmentRange = false,
                    HasLineOfSight = false,
                };
                continue;
            }
            assessments[index] = assessment;
            if (!assessment.InAssessmentRange) continue;
            observersInRange++;
            if (!assessment.TerrainKnown) anyUnknown = true;
            if (assessment.HasLineOfSight) observersWithLineOfSight++;
        }

        CobraMaskingState state = observersInRange == 0
            ? CobraMaskingState.OutsideThreatCoverage
            : observersWithLineOfSight > 0
                ? CobraMaskingState.Exposed
                : anyUnknown
                    ? CobraMaskingState.NotAssessed
                    : CobraMaskingState.Masked;
        return new CobraMaskingAssessment(
            state,
            observersInRange,
            observersWithLineOfSight,
            Array.AsReadOnly(assessments));
    }

    bool IsOperationalThreatObserver(string observerId)
    {
        GroundUnit? unit = _groundWar.FindUnit(observerId);
        return unit is {
            IsAlive: true,
            Faction: GroundFaction.Hostile,
            Role: GroundUnitRole.DshkSite,
        };
    }

    public CobraRouteGuidance RouteGuidanceAt(in Vec3D positionWorldM)
    {
        if (!positionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(positionWorldM));

        IReadOnlyList<CobraCanyonRoutePoint> points = _selectedRoute.Points;
        int nearestSegment = 0;
        double nearestFraction = 0.0;
        double nearestSquaredM = double.MaxValue;
        for (int index = 1; index < points.Count; index++) {
            CobraCanyonRoutePoint first = points[index - 1];
            CobraCanyonRoutePoint second = points[index];
            double eastDeltaM = second.EastM - first.EastM;
            double northDeltaM = second.NorthM - first.NorthM;
            double lengthSquaredM = eastDeltaM * eastDeltaM + northDeltaM * northDeltaM;
            double fraction = lengthSquaredM <= 1e-12
                ? 0.0
                : Math.Clamp(
                    ((positionWorldM.X - first.EastM) * eastDeltaM
                        + (positionWorldM.Z - first.NorthM) * northDeltaM)
                        / lengthSquaredM,
                    0.0, 1.0);
            double nearestEastM = first.EastM + eastDeltaM * fraction;
            double nearestNorthM = first.NorthM + northDeltaM * fraction;
            double offsetEastM = positionWorldM.X - nearestEastM;
            double offsetNorthM = positionWorldM.Z - nearestNorthM;
            double squaredM = offsetEastM * offsetEastM + offsetNorthM * offsetNorthM;
            if (squaredM >= nearestSquaredM) continue;
            nearestSquaredM = squaredM;
            nearestSegment = index - 1;
            nearestFraction = fraction;
        }

        CobraCanyonRoutePoint segmentStart = points[nearestSegment];
        CobraCanyonRoutePoint segmentEnd = points[nearestSegment + 1];
        double corridorRadiusM = Lerp(
            segmentStart.CorridorRadiusM, segmentEnd.CorridorRadiusM, nearestFraction);
        double targetAglM = Lerp(
            segmentStart.TargetAglM, segmentEnd.TargetAglM, nearestFraction);
        double remainingM = SegmentHorizontalLength(segmentStart, segmentEnd)
            * (1.0 - nearestFraction);
        for (int index = nearestSegment + 2; index < points.Count; index++)
            remainingM += SegmentHorizontalLength(points[index - 1], points[index]);

        double? clearanceM = null;
        double? aglErrorM = null;
        if (_terrain.TrySample(positionWorldM.X, positionWorldM.Z, out TerrainSample sample)) {
            clearanceM = positionWorldM.Y - sample.HeightM;
            aglErrorM = clearanceM - targetAglM;
        }
        double crossTrackDistanceM = Math.Sqrt(nearestSquaredM);
        return new CobraRouteGuidance(
            _selectedRoute.Id,
            segmentEnd.Id,
            nearestSegment,
            crossTrackDistanceM,
            corridorRadiusM,
            crossTrackDistanceM <= corridorRadiusM,
            remainingM,
            targetAglM,
            clearanceM,
            aglErrorM);
    }

    CobraResolvedObstacle ResolveObstacle(CobraCanyonObstacleDefinition obstacle)
    {
        return new CobraResolvedObstacle(
            obstacle.Id,
            obstacle.Primitive,
            obstacle.FirstLocalM,
            obstacle.SecondLocalM,
            obstacle.RadiusM);
    }

    CobraResolvedThreatObserver ResolveThreatObserver(
        CobraCanyonThreatObserverDefinition observer)
    {
        if (!_terrain.TrySample(observer.EastM, observer.NorthM, out TerrainSample datum))
            throw new InvalidOperationException(
                $"Threat observer '{observer.Id}' has no terrain datum.");
        return new CobraResolvedThreatObserver(
            observer.Id,
            new Vec3D(observer.EastM,
                datum.HeightM + observer.ObserverHeightAglM,
                observer.NorthM),
            observer.MaximumAssessmentRangeM);
    }

    bool TryFindSweptObstacleContact(
        in Vec3D startWorldM,
        in Vec3D endWorldM,
        double sphereRadiusM,
        out CobraResolvedObstacle collision)
    {
        foreach (CobraResolvedObstacle obstacle in _resolvedObstacles) {
            if (!obstacle.IntersectsSweptSphere(startWorldM, endWorldM, sphereRadiusM)) continue;
            collision = obstacle;
            return true;
        }
        collision = default;
        return false;
    }

    bool TryFindSweptGarrisonContact(
        in Vec3D startWorldM,
        in Vec3D endWorldM,
        double sphereRadiusM,
        out string? collisionId)
    {
        foreach (GroundUnit unit in _groundWar.Units) {
            if (!unit.IsAlive
                || unit.Faction != GroundFaction.Hostile
                || !unit.IsFortified)
                continue;
            Vec3D baseWorldM = unit.PositionWorldM;
            var proxy = new CobraResolvedObstacle(
                unit.Id,
                CobraCanyonCollisionPrimitive.CapsuleSegment,
                baseWorldM,
                baseWorldM + new Vec3D(0.0, GarrisonCollisionHeightM, 0.0),
                GarrisonCollisionRadiusM);
            if (!proxy.IntersectsSweptSphere(startWorldM, endWorldM, sphereRadiusM)) continue;
            collisionId = unit.Id;
            return true;
        }
        collisionId = null;
        return false;
    }

    CobraThreatLineOfSight AssessThreat(
        in CobraResolvedThreatObserver observer,
        in Vec3D targetWorldM)
    {
        Vec3D line = targetWorldM - observer.PositionWorldM;
        double rangeM = line.Length;
        bool inRange = rangeM <= observer.MaximumAssessmentRangeM;
        if (!inRange) {
            return new CobraThreatLineOfSight(
                observer.Id, rangeM, false,
                TerrainKnown: true,
                TerrainOccluded: false,
                ObstacleOccluded: false,
                HasLineOfSight: false);
        }

        (bool terrainKnown, bool terrainOccluded) = TerrainLineOcclusion(
            observer.PositionWorldM, targetWorldM);
        bool obstacleOccluded = terrainKnown && !terrainOccluded
            && ObstacleLineOccluded(observer.PositionWorldM, targetWorldM);
        bool hasLineOfSight = terrainKnown && !terrainOccluded && !obstacleOccluded;
        return new CobraThreatLineOfSight(
            observer.Id, rangeM, true,
            terrainKnown, terrainOccluded, obstacleOccluded, hasLineOfSight);
    }

    (bool Known, bool Occluded) TerrainLineOcclusion(
        in Vec3D observerWorldM,
        in Vec3D targetWorldM)
    {
        if (!_terrain.TrySample(observerWorldM.X, observerWorldM.Z, out _)
            || !_terrain.TrySample(targetWorldM.X, targetWorldM.Z, out _))
            return (false, false);
        Vec3D delta = targetWorldM - observerWorldM;
        double horizontalRangeM = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        double sampleStepM = Math.Clamp(_terrain.HorizontalResolutionM, 10.0, 50.0);
        int steps = Math.Clamp(
            (int)Math.Ceiling(horizontalRangeM / sampleStepM),
            1,
            MaximumLineOfSightSamples);
        for (int index = 1; index < steps; index++) {
            double fraction = (double)index / steps;
            Vec3D point = observerWorldM + delta * fraction;
            // Height only: the normal and surface kind cost four extra evaluations each and this
            // march reads neither. See ITerrainSurface.TryHeightM.
            if (!_terrain.TryHeightM(point.X, point.Z, out double heightM))
                return (false, false);
            if (heightM + LineOfSightTerrainClearanceM >= point.Y)
                return (true, true);
        }
        return (true, false);
    }

    bool ObstacleLineOccluded(in Vec3D observerWorldM, in Vec3D targetWorldM)
    {
        foreach (CobraResolvedObstacle obstacle in _resolvedObstacles) {
            // An observer's own tower, or a target already within a volume, is not masking cover.
            if (obstacle.IntersectsSphere(observerWorldM, 0.01)
                || obstacle.IntersectsSphere(targetWorldM, 0.01))
                continue;
            if (obstacle.IntersectsSegment(observerWorldM, targetWorldM)) return true;
        }
        return false;
    }

    bool RecoveryRequired() => _cobra.IsCrippled
        || _threatFire.State.ScasDamaged
        || _threatFire.State.EngineDamaged
        || !_cobra.EngineOperating
        || !_cobra.State.Flyable;

    bool CanServiceCurrentAirframeAtFob() => RecoveryRequired()
        && _cobra.Observation.Contact.Kind is VehicleContactKind.StableSurfaceContact
            or VehicleContactKind.SurfaceContact
            or VehicleContactKind.HardImpact
        && _groundWar.IsInsideFob(_cobra.State.PositionWorldM);

    CobraTurnaroundObservation BuildTurnaroundObservation(
        double requestedCollective,
        bool actionHeld)
    {
        RotorcraftTelemetry telemetry = _cobra.Telemetry;
        double enginePowerFraction = telemetry.AvailableShaftPowerW > 1.0
            ? Math.Max(0.0, telemetry.EngineShaftPowerW / telemetry.AvailableShaftPowerW)
            : 0.0;
        return new CobraTurnaroundObservation(
            RecoveryRequired(),
            _groundWar.IsInsideFob(_cobra.State.PositionWorldM),
            _cobra.Observation.Contact.Kind,
            requestedCollective,
            _cobra.EngineOperating,
            enginePowerFraction,
            telemetry.MainRotorRpm,
            _airframePool.Any(slot => slot.State == CobraAirframeState.Ready),
            actionHeld);
    }

    /// <summary>
    /// Secures the old aircraft where it came to rest. The spare index is used only to keep that
    /// rest pose clear of the station the player is about to occupy.
    /// </summary>
    void SecureCurrentAirframe(in Vec3D positionWorldM, int spareIndex)
    {
        int flyingIndex = _airframePool.FindIndex(
            slot => slot.State == CobraAirframeState.PlayerFlying);
        if (flyingIndex >= 0)
        {
            // Rest the wreck ON the surface at its own XZ, not at the live CG: off the flat
            // apron a stored centre-of-mass height floats or sinks the parked silhouette, and
            // the presentation list angle exaggerates it. Nudge clear of the spare's station
            // so the fresh bird does not spawn inside the wreck.
            Vec3D restWorldM = positionWorldM;
            if (spareIndex >= 0)
            {
                Vec3D station = _airframePool[spareIndex].ParkedPositionWorldM;
                double eastGapM = restWorldM.X - station.X;
                double northGapM = restWorldM.Z - station.Z;
                double gapM = Math.Sqrt(eastGapM * eastGapM + northGapM * northGapM);
                if (gapM < CobraAirframePool.WreckClearanceFromStationM)
                {
                    double bearing = gapM > 1e-6 ? Math.Atan2(eastGapM, northGapM) : 0.0;
                    restWorldM = new Vec3D(
                        station.X + Math.Sin(bearing) * CobraAirframePool.WreckClearanceFromStationM,
                        restWorldM.Y,
                        station.Z + Math.Cos(bearing) * CobraAirframePool.WreckClearanceFromStationM);
                }
            }
            double restHeightM = restWorldM.Y;
            if (_terrain.TrySample(restWorldM.X, restWorldM.Z, out TerrainSample restSurface))
                restHeightM = restSurface.HeightM
                    + Ah1gCobraDefinition.LateProduction.Contact.CenterOfMassToSkidM;
            _airframePool[flyingIndex] = _airframePool[flyingIndex] with
            {
                State = _cobra.State.Flyable
                    ? CobraAirframeState.Crippled
                    : CobraAirframeState.Destroyed,
                ParkedPositionWorldM = new Vec3D(restWorldM.X, restHeightM, restWorldM.Z),
                ParkedYawRad = _cobra.Observation.YawRad,
            };
        }
    }

    /// <summary>
    /// Consumes the first available ramp spare after the old bird is secured. The replacement is
    /// genuinely cold; starting it remains a later turnaround-authority transition.
    /// </summary>
    void TransferAirframeAtFob(in Vec3D positionWorldM)
    {
        int spareIndex = _airframePool.FindIndex(
            slot => slot.State == CobraAirframeState.Ready);
        if (spareIndex < 0)
            throw new InvalidOperationException("Turnaround requested a missing spare airframe.");

        SecureCurrentAirframe(positionWorldM, spareIndex);
        CobraAirframeSlot spare = _airframePool[spareIndex];
        _cobra = new Ah1gCobraDynamics(
            vehicleId: "cobra-canyon.player",
            spare.ParkedPositionWorldM,
            Vec3D.Zero,
            spare.ParkedYawRad,
            _recurringBaseMassKg,
            _additivePayloadMassKg,
            Ah1gCobraDefinition.LateProduction,
            Ah1gCobraInitialPowerplantState.Cold);
        _threatFire.ResetForFreshAirframe();
        _airframePool[spareIndex] = spare with { State = CobraAirframeState.PlayerFlying };
        _airframeSwaps++;
    }

    VehicleSurfaceSample SampleVehicleSurface(in Vec3D positionWorldM)
    {
        if (!_terrain.TrySample(positionWorldM.X, positionWorldM.Z, out TerrainSample sample))
            return VehicleSurfaceSample.Unknown;
        bool water = sample.Kind == TerrainSurfaceKind.Water;
        return new VehicleSurfaceSample(
            IsKnown: true,
            SurfaceId: water ? "cobra-canyon.water" : "cobra-canyon.land",
            HeightM: sample.HeightM,
            UpNormal: sample.UpNormal,
            FrictionPerSecond: water
                ? WaterSurfaceFrictionPerSecond
                : LandSurfaceFrictionPerSecond,
            SubmergesSkids: water);
    }

    CobraMissionDiagnostics BuildDiagnostics()
    {
        Vec3D positionWorldM = _cobra.State.PositionWorldM;
        bool terrainKnown = _terrain.TrySample(
            positionWorldM.X, positionWorldM.Z, out TerrainSample terrainSample);
        double? clearanceM = terrainKnown
            ? positionWorldM.Y - terrainSample.HeightM
            : null;
        CobraRouteGuidance guidance = RouteGuidanceAt(positionWorldM);
        return new CobraMissionDiagnostics(
            Status,
            _nextAuthorityTick,
            CobraCanyonDefinition.WorldId,
            _selectedRoute.Id,
            _cobra.State.Flyable,
            MissionFlyable,
            terrainKnown,
            clearanceM,
            _collisionObstacleId,
            guidance,
            _cachedMaskingAssessment,
            _threatFire.State,
            _maskingAssessmentAuthorityTicks,
            CobraCanyonDefinition.FidelityDisclosure);
    }

    static double SegmentHorizontalLength(
        in CobraCanyonRoutePoint first,
        in CobraCanyonRoutePoint second)
    {
        double eastDeltaM = second.EastM - first.EastM;
        double northDeltaM = second.NorthM - first.NorthM;
        return Math.Sqrt(eastDeltaM * eastDeltaM + northDeltaM * northDeltaM);
    }

    static double Lerp(double first, double second, double fraction) =>
        first + (second - first) * fraction;

    static void RequirePositive(double value, string parameterName)
    {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }

    static void RequireNonNegative(double value, string parameterName)
    {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }
}
