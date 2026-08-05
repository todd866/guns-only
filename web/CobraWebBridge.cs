using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;
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
    static CobraAiGunner _gunner = CreateGunner();
    static readonly CobraTurretServo _turretServo = new();
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
        _gunner = CreateGunner();
        _turretServo.Reset();
        _gunnerDecision = default;
        _accumulatorSeconds = 0.0;
        // A restart must show the fresh spawn pose immediately, not one stale frame of the
        // previous sortie.
        FillHotPose(_runtime);
    }

    static CobraAiGunner CreateGunner() => new(new CobraAiGunnerDefinition(
        AcquisitionSeconds: 0.75,
        ReacquisitionSeconds: 0.45,
        SightCoincidenceToleranceRad: 0.06));

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
            if (_gunnerDecision.FireAuthorized)
                runtime.ApplyAuthorizedGunfire(_selectedTargetId);
            _accumulatorSeconds -= FixedDeltaSeconds;
        }
        FillHotPose(runtime);
        return checked((int)runtime.Cobra.State.Tick);
    }

    [JSExport]
    public static string GetState() => JsonSerializer.Serialize(BuildState(RequireRuntime()));

    // Per-frame numeric pose projection — the Cobra-scale analogue of the F-22 SnapshotHotFrame.
    // The browser fetches the view once, then reads it via copyTo every rendered frame so the
    // camera and airframe presence stay at render rate while the full JSON snapshot is sampled
    // at HUD rate. Slot order is the contract; keep in lockstep with cobra-lab/main.js
    // readVehiclePose():
    // [0] x_m, [1] y_m, [2] z_m, [3] pitch_rad, [4] roll_rad, [5] yaw_rad, [6] main_rotor_rpm.
    static readonly double[] HotPoseBuffer = new double[7];

    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<double> GetHotPose()
    {
        FillHotPose(RequireRuntime());
        return new ArraySegment<double>(HotPoseBuffer);
    }

    static void FillHotPose(CobraMissionRuntime runtime)
    {
        PlayerVehicleObservation observation = runtime.Cobra.Observation;
        Vec3D position = observation.PositionWorldM;
        HotPoseBuffer[0] = position.X;
        HotPoseBuffer[1] = position.Y;
        HotPoseBuffer[2] = position.Z;
        HotPoseBuffer[3] = observation.PitchRad;
        HotPoseBuffer[4] = observation.RollRad;
        HotPoseBuffer[5] = observation.YawRad;
        HotPoseBuffer[6] = runtime.Cobra.Telemetry.MainRotorRpm;
    }

    static object BuildState(CobraMissionRuntime runtime)
    {
        CobraMissionDiagnostics diagnostics = runtime.Diagnostics;
        CobraRouteGuidance guidance = diagnostics.RouteGuidance;
        PlayerVehicleObservation observation = runtime.Cobra.Observation;
        RotorcraftTelemetry rotorcraft = runtime.Cobra.Telemetry;
        VehiclePowerObservation power = observation.Power;
        Vec3D position = observation.PositionWorldM;
        Vec3D velocity = observation.GroundVelocityMps;
        CobraGroundWarRuntime groundWar = runtime.GroundWar;
        GroundWarDebrief debrief = groundWar.Debrief;
        bool overFob = groundWar.Fob.Contains(
            position,
            runtime.Terrain.TrySample(position.X, position.Z, out TerrainSample pad)
                ? pad.HeightM
                : double.NegativeInfinity);
        Vec3D fob = groundWar.Fob.CentreWorldM;
        double fobEast = fob.X - position.X;
        double fobNorth = fob.Z - position.Z;
        double fobRangeM = Math.Sqrt(fobEast * fobEast + fobNorth * fobNorth);
        double fobBearingRad = Math.Atan2(fobEast, fobNorth);
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
                turret_azimuth_rad = _turretServo.AzimuthRad,
                turret_elevation_rad = _turretServo.ElevationRad,
            },
            ground_war = new {
                control = groundWar.Balance.Control,
                trend = groundWar.Balance.Trend,
                ammo_remaining = groundWar.Magazine.RoundsRemaining,
                ammo_capacity = groundWar.Magazine.CapacityRounds,
                ammo_bingo = groundWar.Magazine.IsBingo,
                ammo_dry = groundWar.Magazine.IsDry,
                over_fob = overFob,
                fob_range_m = fobRangeM,
                fob_bearing_rad = fobBearingRad,
                fob = new {
                    x_m = fob.X,
                    y_m = fob.Y,
                    z_m = fob.Z,
                    radius_m = groundWar.Fob.RadiusM,
                },
                sites = groundWar.Sites.Select(site => new {
                    id = site.Id,
                    landmark_id = site.LandmarkId,
                    label = site.Label,
                    local_control = site.LocalControl,
                    x_m = site.PositionWorldM.X,
                    y_m = site.PositionWorldM.Y,
                    z_m = site.PositionWorldM.Z,
                    capture_radius_m = site.CaptureRadiusM,
                }).ToArray(),
                units = groundWar.Units.Select(unit => new {
                    id = unit.Id,
                    faction = unit.Faction.ToString().ToLowerInvariant(),
                    role = RoleToken(unit.Role),
                    alive = unit.IsAlive,
                    health = unit.Health,
                    max_health = unit.MaxHealth,
                    x_m = unit.PositionWorldM.X,
                    y_m = unit.PositionWorldM.Y,
                    z_m = unit.PositionWorldM.Z,
                    home_site_id = unit.HomeSiteId,
                }).ToArray(),
                events = groundWar.RecentEvents.Select(evt => new {
                    tick = evt.AuthorityTick,
                    kind = evt.Kind,
                    unit_id = evt.UnitId,
                    site_id = evt.SiteId,
                    faction = evt.Faction?.ToString().ToLowerInvariant(),
                    x_m = evt.PositionWorldM.X,
                    y_m = evt.PositionWorldM.Y,
                    z_m = evt.PositionWorldM.Z,
                }).ToArray(),
                mission = "hold-the-bridge",
                outcome = groundWar.MissionOutcome.ToString().ToLowerInvariant(),
                outcome_reason = groundWar.MissionOutcomeReason,
                victory_hold_progress = groundWar.VictoryHoldProgress,
                defeat_hold_progress = groundWar.DefeatHoldProgress,
                victory_control_threshold = CobraGroundWarRuntime.VictoryControlThreshold,
                defeat_control_threshold = CobraGroundWarRuntime.DefeatControlThreshold,
                debrief = new {
                    hostile_kills = debrief.HostileKillsByPlayer,
                    friendly_kills = debrief.FriendlyKillsByPlayer,
                    fob_rearms = debrief.FobRearmCount,
                    peak_friendly_control = debrief.PeakFriendlyControl,
                    peak_hostile_control = debrief.PeakHostileControl,
                    elapsed_s = debrief.ElapsedSeconds,
                    rounds_expended = debrief.RoundsExpended,
                    outcome = debrief.MissionOutcome.ToString().ToLowerInvariant(),
                    outcome_reason = debrief.MissionOutcomeReason,
                    victory_hold_progress = debrief.VictoryHoldProgress,
                },
            },
            vehicle = new {
                tick = observation.Tick,
                x_m = position.X,
                y_m = position.Y,
                z_m = position.Z,
                ground_speed_mps = observation.GroundSpeedMps,
                true_airspeed_mps = observation.TrueAirspeedMps,
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
                // Live headroom that follows the collective — hover_power_margin is a capability
                // constant in cruise and serialized as telemetry it read as a dead column.
                power_margin = power.AppliedPowerMarginFraction,
                rotorcraft = new {
                    regime = rotorcraft.Regime.ToString(),
                    main_rotor_rpm = rotorcraft.MainRotorRpm,
                    tail_rotor_rpm = rotorcraft.TailRotorRpm,
                    collective_root_pitch_rad = rotorcraft.CollectiveRootPitchRad,
                    transmission_torque_nm = rotorcraft.TransmissionTorqueNm,
                    transmission_limit_fraction = rotorcraft.TransmissionLimitFraction,
                    governor_saturated = rotorcraft.GovernorSaturated,
                    vortex_ring_severity = rotorcraft.VortexRingSeverity,
                    retreating_blade_stall_severity = rotorcraft.RetreatingBladeStallSeverity,
                    mast_bump_risk = rotorcraft.MastBumpRisk,
                    main_rotor_clearance_m = rotorcraft.MainRotorClearanceM,
                    ground_effect_factor = rotorcraft.GroundEffectFactor,
                    engine_operating = rotorcraft.EngineOperating,
                },
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
            GroundUnit? unit = runtime.GroundWar.FindUnit(_selectedTargetId);
            if (unit is { IsAlive: true }) {
                CobraGunTargetAssessment assessment = CobraGunTargeting.Assess(
                    runtime.Cobra.State.PositionWorldM,
                    runtime.Cobra.Observation.YawRad,
                    unit.PositionWorldM);
                bool hasLos = assessment.WithinTurretEnvelope
                    && CobraGunTargeting.EvaluateLineOfSight(
                        runtime.Terrain,
                        runtime.ResolvedObstacles,
                        runtime.Cobra.State.PositionWorldM,
                        unit.PositionWorldM);
                // The mount slews toward the aim point whenever the target is physically
                // engageable; the crew contract still gates firing through acquisition,
                // consent and sight coincidence.
                if (hasLos)
                    _turretServo.Advance(
                        FixedDeltaSeconds,
                        assessment.SignedAzimuthRad,
                        assessment.ElevationRad);
                target = new CobraGunnerTargetObservation(
                    unit.Id,
                    Present: true,
                    Friendly: unit.Faction == GroundFaction.Friendly,
                    HasLineOfSight: hasLos,
                    WithinTurretEnvelope: assessment.WithinTurretEnvelope,
                    HasBallisticSolution: assessment.HasBallisticSolution,
                    SightErrorRad: _turretServo.ErrorRad(
                        assessment.SignedAzimuthRad,
                        assessment.ElevationRad));
            }
        }
        _gunnerDecision = _gunner.Advance(new CobraAiGunnerInput(
            runtime.Cobra.State.Tick,
            _selectedTargetId,
            _engagementConsent,
            WeaponsArmed: !runtime.GroundWar.Magazine.IsDry,
            TurretServiceable: true,
            target));
    }

    static double ClampFinite(double value, double minimum, double maximum, string name)
    {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }

    static string RoleToken(GroundUnitRole role) => role switch {
        GroundUnitRole.InfantryClump => "infantry",
        GroundUnitRole.SoftVehicle => "soft-vehicle",
        GroundUnitRole.HardPoint => "hard-point",
        _ => throw new ArgumentOutOfRangeException(nameof(role))
    };

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
        CobraMissionStatus.Victory => "victory",
        CobraMissionStatus.Defeat => "defeat",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };
}
