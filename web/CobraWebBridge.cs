using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Web;

/// <summary>
/// Browser facade for the focused Cobra Canyon mission. Unlike the world lab, this bridge advances
/// the authoritative 120 Hz AH-1G runtime and serializes only its current mission-owned state.
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class CobraWebBridge
{
    const double FixedDeltaSeconds = 1.0 / PlayerVehicleContract.FixedStepHz;
    const double MaximumFrameDeltaSeconds = 0.1;
    static CobraMissionRuntime? _runtime;
    static CobraCanyonRouteChoice _routeChoice;
    static VerticalLiftPilotCommand _command = new(0.5, 0.0, 0.0, 0.0);
    static readonly CobraAiGunner Gunner = new(new CobraAiGunnerDefinition(
        AcquisitionSeconds: 0.75,
        ReacquisitionSeconds: 0.45,
        SightCoincidenceToleranceRad: 0.06));
    static CobraAiGunnerDecision _gunnerDecision;
    static string? _selectedTargetId;
    static bool _engagementConsent;
    static double _accumulatorSeconds;

    [JSExport]
    public static void StartRoute(int routeChoice)
    {
        _routeChoice = routeChoice switch {
            0 => CobraCanyonRouteChoice.RiverGorge,
            1 => CobraCanyonRouteChoice.RidgeShadow,
            2 => CobraCanyonRouteChoice.RoadPlantation,
            _ => throw new ArgumentOutOfRangeException(nameof(routeChoice))
        };
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        _runtime = new CobraMissionRuntime(
            definition,
            definition.CreateTerrainSurface(),
            _routeChoice);
        _command = new VerticalLiftPilotCommand(
            _runtime.Cobra.EstimateHoverCollective(
                _runtime.Cobra.State.GrossMassKg,
                CobraMissionRuntime.DefaultAirDensityKgM3),
            0.0,
            0.0,
            0.0);
        _selectedTargetId = null;
        _engagementConsent = false;
        _gunnerDecision = default;
        _accumulatorSeconds = 0.0;
    }

    [JSExport]
    public static void SetControls(
        double collective,
        double forwardCyclic,
        double rightCyclic,
        double yaw)
    {
        _command = new VerticalLiftPilotCommand(
            ClampFinite(collective, 0.0, 1.0, nameof(collective)),
            ClampFinite(forwardCyclic, -1.0, 1.0, nameof(forwardCyclic)),
            ClampFinite(rightCyclic, -1.0, 1.0, nameof(rightCyclic)),
            ClampFinite(yaw, -1.0, 1.0, nameof(yaw)));
    }

    [JSExport]
    public static void SetGunnerTarget(string? targetId) =>
        _selectedTargetId = string.IsNullOrWhiteSpace(targetId) ? null : targetId;

    [JSExport]
    public static void SetEngagementConsent(bool consent) => _engagementConsent = consent;

    [JSExport]
    public static int Advance(double deltaSeconds)
    {
        CobraMissionRuntime runtime = RequireRuntime();
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));

        _accumulatorSeconds += Math.Min(deltaSeconds, MaximumFrameDeltaSeconds);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds
            && ticks++ < 12
            && runtime.MissionFlyable) {
            runtime.Advance(_command);
            AdvanceGunner(runtime);
            _accumulatorSeconds -= FixedDeltaSeconds;
        }
        return checked((int)runtime.Cobra.State.Tick);
    }

    [JSExport]
    public static string GetState() => JsonSerializer.Serialize(BuildState(RequireRuntime()));

    static object BuildState(CobraMissionRuntime runtime)
    {
        CobraMissionDiagnostics diagnostics = runtime.Diagnostics;
        CobraRouteGuidance guidance = diagnostics.RouteGuidance;
        PlayerVehicleObservation observation = runtime.Cobra.Observation;
        VehiclePowerObservation power = observation.Power;
        Vec3D position = observation.PositionWorldM;
        Vec3D velocity = observation.GroundVelocityMps;
        return new {
            world_id = diagnostics.WorldId,
            route = RouteToken(runtime.SelectedRoute.Choice),
            route_id = diagnostics.SelectedRouteId,
            status = StatusToken(diagnostics.Status),
            authority_tick = diagnostics.AuthorityTicksAdvanced,
            route_guidance = new {
                next_point_id = guidance.NextPointId,
                segment_index = guidance.SegmentIndex,
                cross_track_m = guidance.CrossTrackDistanceM,
                corridor_radius_m = guidance.CorridorRadiusM,
                inside_corridor = guidance.InsideCorridor,
                remaining_m = guidance.RemainingHorizontalDistanceM,
                target_agl_m = guidance.TargetAglM,
                current_clearance_m = guidance.CurrentClearanceM,
                agl_error_m = guidance.AglErrorM,
            },
            masking = new {
                state = diagnostics.Masking.State.ToString().ToLowerInvariant(),
                observers_in_range = diagnostics.Masking.ObserversInRange,
                observers_with_line_of_sight = diagnostics.Masking.ObserversWithLineOfSight,
            },
            gunner = new {
                selected_target_id = _selectedTargetId,
                state = _gunnerDecision.State.ToString().ToLowerInvariant(),
                reason = _gunnerDecision.Reason.ToString(),
                track_requested = _gunnerDecision.TrackRequested,
                fire_authorized = _gunnerDecision.FireAuthorized,
                qualified_track_seconds = _gunnerDecision.QualifiedTrackSeconds,
            },
            vehicle = new {
                tick = observation.Tick,
                x_m = position.X,
                y_m = position.Y,
                z_m = position.Z,
                ground_speed_mps = observation.GroundSpeedMps,
                vertical_speed_mps = observation.VerticalSpeedMps,
                pitch_rad = observation.PitchRad,
                roll_rad = observation.RollRad,
                yaw_rad = observation.YawRad,
                collective = _command.Collective,
                forward_cyclic = _command.ForwardCyclic,
                right_cyclic = _command.RightCyclic,
                yaw = _command.Yaw,
                velocity_x_mps = velocity.X,
                velocity_y_mps = velocity.Y,
                velocity_z_mps = velocity.Z,
                flyable = observation.Flyable,
                power_assessment = power.Assessment.ToString().ToLowerInvariant(),
                hover_power_margin = power.HoverPowerMarginFraction,
            },
            collision_obstacle_id = diagnostics.CollisionObstacleId,
            terrain_sample_known = diagnostics.TerrainSampleKnown,
            fidelity_disclosure = diagnostics.FidelityDisclosure,
        };
    }

    static CobraMissionRuntime RequireRuntime() =>
        _runtime ?? throw new InvalidOperationException("Cobra route has not been started.");

    static void AdvanceGunner(CobraMissionRuntime runtime)
    {
        CobraGunnerTargetObservation? target = null;
        if (_selectedTargetId is not null) {
            CobraResolvedThreatObserver? observer = runtime.ResolvedThreatObservers
                .FirstOrDefault(candidate => candidate.Id == _selectedTargetId);
            if (observer is { } selected) {
                CobraThreatLineOfSight sight = runtime.AssessThreatAt(
                    selected.Id, runtime.Cobra.State.PositionWorldM);
                Vec3D line = selected.PositionWorldM - runtime.Cobra.State.PositionWorldM;
                double rangeM = line.Length;
                double horizontalNoseError = rangeM > 1e-6
                    ? Math.Abs(Math.Atan2(
                        line.X * Math.Cos(runtime.Cobra.Observation.YawRad)
                            - line.Z * Math.Sin(runtime.Cobra.Observation.YawRad),
                        line.X * Math.Sin(runtime.Cobra.Observation.YawRad)
                            + line.Z * Math.Cos(runtime.Cobra.Observation.YawRad)))
                    : 0.0;
                target = new CobraGunnerTargetObservation(
                    selected.Id,
                    Present: true,
                    Friendly: false,
                    sight.HasLineOfSight,
                    WithinTurretEnvelope: horizontalNoseError <= 1.05
                        && rangeM <= 2_000.0,
                    HasBallisticSolution: rangeM is >= 150.0 and <= 2_000.0,
                    SightErrorRad: horizontalNoseError);
            }
        }
        _gunnerDecision = Gunner.Advance(new CobraAiGunnerInput(
            runtime.Cobra.State.Tick,
            _selectedTargetId,
            _engagementConsent,
            WeaponsArmed: true,
            TurretServiceable: true,
            target));
    }

    static double ClampFinite(double value, double minimum, double maximum, string name)
    {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }

    static string RouteToken(CobraCanyonRouteChoice choice) => choice switch {
        CobraCanyonRouteChoice.RiverGorge => "river-gorge",
        CobraCanyonRouteChoice.RidgeShadow => "ridge-shadow",
        CobraCanyonRouteChoice.RoadPlantation => "road-plantation",
        _ => throw new ArgumentOutOfRangeException(nameof(choice))
    };

    static string StatusToken(CobraMissionStatus status) => status switch {
        CobraMissionStatus.Active => "active",
        CobraMissionStatus.RouteComplete => "route-complete",
        CobraMissionStatus.ObstacleCollision => "obstacle-collision",
        CobraMissionStatus.TerrainUnavailable => "terrain-unavailable",
        CobraMissionStatus.VehicleAuthorityLost => "vehicle-authority-lost",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };
}
