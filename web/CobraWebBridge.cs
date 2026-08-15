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
    static CobraAirframeSwapControlLatch _controlLatch = new();
    static CobraAiGunner _gunner = CreateGunner();
    static readonly CobraTurretServo _turretServo = new();
    static CobraAiGunnerDecision _gunnerDecision;
    static string? _selectedTargetId;
    static bool _engagementConsent;
    static bool _turnaroundActionHeld;
    static bool _gunnerNeedsAuthorityRebase;
    static double _accumulatorSeconds;

    [JSExport]
    public static void StartRoute(int routeChoice, bool visualLab = false)
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
            _routeChoice,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            // Guided scenery review must not abandon an unpiloted helicopter to drift into a
            // rollover while the camera is on rails. Play keeps the authored terrain wind.
            enableTerrainWind: !visualLab);
        _controlLatch.Reset();
        _selectedTargetId = null;
        _engagementConsent = false;
        _turnaroundActionHeld = false;
        _gunnerNeedsAuthorityRebase = false;
        _gunner = CreateGunner();
        _turretServo.Reset();
        _gunnerDecision = default;
        // The cached sight verdict belongs to the previous sortie's world and tick line.
        _gunnerSightTargetId = null;
        _gunnerSightAuthorityTick = long.MinValue;
        _gunnerSightHasLineOfSight = false;
        _accumulatorSeconds = 0.0;
        // A restart must show the fresh spawn pose immediately, not one stale frame of the
        // previous sortie.
        FillHotPose(_runtime);
        // Prefer the standing seam so Tab/F from spawn hits a shootable mark (owner flights
        // spent ~87% of the sortie on OutOfLimits infantry).
        _selectedTargetId = CobraGroundWarRuntime.GunnerySeamUnitId;
    }

    static CobraAiGunner CreateGunner() => new(new CobraAiGunnerDefinition(
        AcquisitionSeconds: 0.75,
        ReacquisitionSeconds: 0.45,
        SightCoincidenceToleranceRad: 0.06));

    /// <summary>
    /// Lab-only staging aid. Play deliberately leaves the lever at zero; the continuously-running
    /// visual lab may explicitly request the provider's current hover estimate.
    /// </summary>
    [JSExport]
    public static double GetHoverCollective()
    {
        CobraMissionRuntime runtime = RequireRuntime();
        return runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
    }

    [JSExport]
    public static void SetControls(
        double collective,
        double forwardCyclic,
        double rightCyclic,
        double yaw)
    {
        _controlLatch.TrySetControls(new VerticalLiftPilotCommand(
            ClampFinite(collective, 0.0, 1.0, nameof(collective)),
            ClampFinite(forwardCyclic, -1.0, 1.0, nameof(forwardCyclic)),
            ClampFinite(rightCyclic, -1.0, 1.0, nameof(rightCyclic)),
            ClampFinite(yaw, -1.0, 1.0, nameof(yaw))));
    }

    [JSExport]
    public static bool AcknowledgeAirframeSwap(int swapGeneration) =>
        _controlLatch.AcknowledgeAuthoritySwap(swapGeneration);

    [JSExport]
    public static void SetTurnaroundAction(bool held) => _turnaroundActionHeld = held;

    [JSExport]
    public static void SetGunnerTarget(string? targetId) =>
        _selectedTargetId = string.IsNullOrWhiteSpace(targetId) ? null : targetId;

    /// <summary>
    /// Atomically acquires a visual lock and assigns that exact living, visible hostile to the
    /// AI gunner. The browser may cycle candidate IDs, but cannot manufacture LOS with a render
    /// raycast or briefly padlock an occluded unit before authority catches up.
    /// </summary>
    [JSExport]
    public static bool TrySetVisualLockTarget(string? targetId)
    {
        CobraMissionRuntime runtime = RequireRuntime();
        if (!runtime.CanAcquireVisualLockTarget(targetId)) return false;
        _selectedTargetId = targetId;
        // The gate just measured the same authority sight used by AdvanceGunner. Publish/cache
        // that fresh verdict immediately so the next snapshot cannot inherit this target's old
        // masked value before the ordinary 10 Hz sight cadence resumes.
        _gunnerSightTargetId = targetId;
        _gunnerSightAuthorityTick = runtime.Cobra.State.Tick;
        _gunnerSightHasLineOfSight = true;
        return true;
    }

    [JSExport]
    public static void SetEngagementConsent(bool consent) => _engagementConsent = consent;

    [JSExport]
    public static int Advance(double deltaSeconds)
    {
        CobraMissionRuntime runtime = RequireRuntime();
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));

        // Do not even accumulate paused wall time. The browser must first observe the fresh spare,
        // reset Ready/neutral-edge state, and acknowledge its exact authority generation.
        if (_controlLatch.AwaitingAcknowledgement) {
            FillHotPose(runtime);
            return checked((int)runtime.Cobra.State.Tick);
        }

        _accumulatorSeconds += Math.Min(deltaSeconds, MaximumFrameDeltaSeconds);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds
            && ticks++ < 12
            && runtime.MissionFlyable) {
            int airframeSwapsBeforeTick = runtime.AirframeSwaps;
            runtime.Advance(_controlLatch.Command, _turnaroundActionHeld);
            _accumulatorSeconds -= FixedDeltaSeconds;
            if (runtime.AirframeSwaps > airframeSwapsBeforeTick) {
                _controlLatch.ObserveAuthoritySwap(runtime.AirframeSwaps);
                // Mission time does not reset when the crew transfers to a cold spare. Rebase the
                // newly-created crew track on the first tick of that airframe rather than feeding
                // it a discontinuous mission tick and faulting every later frame.
                _gunnerNeedsAuthorityRebase = true;
                // Discard the rest of the old bird's render-frame budget. Otherwise it becomes an
                // implicit catch-up impulse after the player deliberately starts the spare.
                _accumulatorSeconds = 0.0;
                break;
            }
            AdvanceGunner(runtime);
            if (_gunnerDecision.FireAuthorized)
                runtime.ApplyAuthorizedGunfire(_selectedTargetId);
        }
        FillHotPose(runtime);
        return checked((int)runtime.Cobra.State.Tick);
    }

    [JSExport]
    public static string GetState() => JsonSerializer.Serialize(BuildState(RequireRuntime()));

    static string AirframeStateToken(CobraAirframeState state) => state switch
    {
        CobraAirframeState.Ready => "ready",
        CobraAirframeState.PlayerFlying => "player-flying",
        CobraAirframeState.Crippled => "crippled",
        CobraAirframeState.Destroyed => "destroyed",
        _ => throw new ArgumentOutOfRangeException(nameof(state)),
    };

    static string ContactFailureCauseSlug(VehicleContactFailureCause cause) => cause switch
    {
        VehicleContactFailureCause.HardImpact => "hard-impact",
        VehicleContactFailureCause.Rollover => "rollover",
        VehicleContactFailureCause.SpinContact => "spin-contact",
        VehicleContactFailureCause.RotorStrike => "rotor-strike",
        VehicleContactFailureCause.WaterContact => "water-contact",
        _ => "none",
    };

    static string TurnaroundPhaseToken(CobraTurnaroundPhase phase) => phase switch
    {
        CobraTurnaroundPhase.Operational => "operational",
        CobraTurnaroundPhase.ShutdownRequired => "shutdown-required",
        CobraTurnaroundPhase.RotorCoast => "rotor-coast",
        CobraTurnaroundPhase.AwaitStartRelease => "await-start-release",
        CobraTurnaroundPhase.ColdAndDark => "cold-and-dark",
        CobraTurnaroundPhase.Starting => "starting",
        CobraTurnaroundPhase.Secured => "secured",
        _ => throw new ArgumentOutOfRangeException(nameof(phase)),
    };

    static string TurnaroundActionToken(CobraTurnaroundAction action) => action switch
    {
        CobraTurnaroundAction.None => "none",
        CobraTurnaroundAction.LowerCollective => "lower-collective",
        CobraTurnaroundAction.Release => "release",
        CobraTurnaroundAction.HoldShutdown => "hold-shutdown",
        CobraTurnaroundAction.Coast => "coast",
        CobraTurnaroundAction.HoldStart => "hold-start",
        CobraTurnaroundAction.Starting => "starting",
        _ => throw new ArgumentOutOfRangeException(nameof(action)),
    };

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
        CobraBattleDamageState battleDamage = diagnostics.BattleDamage;
        PlayerVehicleObservation observation = runtime.Cobra.Observation;
        RotorcraftTelemetry rotorcraft = runtime.Cobra.Telemetry;
        Vec3D gustMomentBodyNm = runtime.Cobra.LastGustMomentBodyNm;
        BodyRates cyclicScas = runtime.Cobra.LastCyclicScasRateCommand;
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
        GroundUnit? selectedGunnerTarget = string.IsNullOrWhiteSpace(_selectedTargetId)
            ? null
            : groundWar.FindUnit(_selectedTargetId);
        CobraGunTargetAssessment? gunnerAssessment = selectedGunnerTarget is { IsAlive: true }
            ? CobraGunTargeting.Assess(
                position,
                observation.YawRad,
                selectedGunnerTarget.PositionWorldM)
            : null;
        double? gunnerTargetRangeM = gunnerAssessment?.RangeM;
        bool? gunnerTargetWithinRange = gunnerTargetRangeM.HasValue
            ? gunnerTargetRangeM.Value is >= CobraGunTargeting.MinimumSolutionRangeM
                and <= CobraGunTargeting.MaximumSolutionRangeM
            : null;
        bool? gunnerTargetHasLineOfSight = selectedGunnerTarget is not null
            && string.Equals(
                selectedGunnerTarget.Id,
                _gunnerSightTargetId,
                StringComparison.Ordinal)
            ? _gunnerSightHasLineOfSight
            : null;
        return new {
            world_id = diagnostics.WorldId,
            route = RouteToken(runtime.SelectedRoute.Choice),
            route_id = diagnostics.SelectedRouteId,
            status = StatusToken(diagnostics.Status),
            authority_tick = diagnostics.AuthorityTicksAdvanced,
            mission_act = ActToken(runtime.Act),
            path_gates = runtime.PathGates.Select(gate => new {
                east_m = gate.EastM,
                up_m = gate.UpM,
                north_m = gate.NorthM,
                half_m = gate.RadiusM,
                active = gate.Active,
            }).ToArray(),
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
            battle_damage = new {
                active_observer_id = battleDamage.ActiveObserverId,
                continuous_exposure_seconds = battleDamage.ContinuousExposureSeconds,
                acquisition_progress = battleDamage.AcquisitionProgress,
                tracking_observers = battleDamage.TrackingObservers,
                threat_tracking = battleDamage.ThreatTracking,
                receiving_fire = battleDamage.ReceivingFire,
                bursts_fired = battleDamage.BurstsFired,
                pending_bursts = battleDamage.PendingBursts,
                damaging_hits = battleDamage.DamagingHits,
                seconds_to_next_impact = battleDamage.SecondsToNextImpact,
                scas_damaged = battleDamage.ScasDamaged,
                engine_damaged = battleDamage.EngineDamaged,
                recent_bursts = runtime.RecentThreatBursts.Select(burst => new {
                    sequence = burst.Sequence,
                    observer_id = burst.ObserverId,
                    source_x_m = burst.SourceWorldM.X,
                    source_y_m = burst.SourceWorldM.Y,
                    source_z_m = burst.SourceWorldM.Z,
                    target_x_m = burst.TargetWorldM.X,
                    target_y_m = burst.TargetWorldM.Y,
                    target_z_m = burst.TargetWorldM.Z,
                    impact_x_m = burst.ImpactWorldM.X,
                    impact_y_m = burst.ImpactWorldM.Y,
                    impact_z_m = burst.ImpactWorldM.Z,
                    fired_at_s = burst.FiredAtSeconds,
                    impact_at_s = burst.ImpactAtSeconds,
                    will_hit = burst.WillHit,
                    subsystem = burst.Subsystem.ToString().ToLowerInvariant(),
                    has_impacted = burst.HasImpacted,
                }).ToArray(),
            },
            turnaround = new {
                phase = TurnaroundPhaseToken(runtime.Turnaround.Phase),
                sequence = runtime.Turnaround.Sequence,
                action = TurnaroundActionToken(runtime.Turnaround.Action),
                hold_progress = runtime.Turnaround.HoldProgress,
                flight_controls_enabled = runtime.Turnaround.FlightControlsEnabled,
                weapons_enabled = runtime.Turnaround.WeaponsEnabled,
                main_rotor_rpm = rotorcraft.MainRotorRpm,
                main_rotor_fraction = rotorcraft.MainRotorRpm
                    / Ah1gCobraDefinition.LateProduction.MainRotor.NominalRpm,
                engine_power_fraction = rotorcraft.AvailableShaftPowerW > 1.0
                    ? rotorcraft.EngineShaftPowerW / rotorcraft.AvailableShaftPowerW
                    : 0.0,
            },
            gunner = new {
                selected_target_id = _selectedTargetId,
                state = _gunnerDecision.State.ToString().ToLowerInvariant(),
                reason = _gunnerDecision.Reason.ToString(),
                track_requested = _gunnerDecision.TrackRequested,
                fire_authorized = _gunnerDecision.FireAuthorized
                    && runtime.Turnaround.WeaponsEnabled,
                qualified_track_seconds = _gunnerDecision.QualifiedTrackSeconds,
                turret_azimuth_rad = _turretServo.AzimuthRad,
                turret_elevation_rad = _turretServo.ElevationRad,
                target_range_m = gunnerTargetRangeM,
                target_within_range = gunnerTargetWithinRange,
                target_has_line_of_sight = gunnerTargetHasLineOfSight,
                target_within_turret_envelope = gunnerAssessment?.WithinTurretEnvelope,
                target_has_ballistic_solution = gunnerAssessment?.HasBallisticSolution,
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
                    owner = site.Owner.ToString().ToLowerInvariant(),
                    capture_progress = site.CaptureProgress,
                    contested = site.IsContested,
                    x_m = site.PositionWorldM.X,
                    y_m = site.PositionWorldM.Y,
                    z_m = site.PositionWorldM.Z,
                    capture_radius_m = site.CaptureRadiusM,
                }).ToArray(),
                tickets = new {
                    friendly = groundWar.FriendlyTickets,
                    hostile = groundWar.HostileTickets,
                },
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
                    target_x_m = evt.TargetPositionWorldM?.X,
                    target_y_m = evt.TargetPositionWorldM?.Y,
                    target_z_m = evt.TargetPositionWorldM?.Z,
                }).ToArray(),
                mission = "hold-the-bridge",
                combat_live = runtime.GroundWarCombatLive,
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
            airframe_pool = runtime.AirframePool.Select(slot => new {
                id = slot.Id,
                state = AirframeStateToken(slot.State),
                east_m = slot.ParkedPositionWorldM.X,
                up_m = slot.ParkedPositionWorldM.Y,
                north_m = slot.ParkedPositionWorldM.Z,
                yaw_rad = slot.ParkedYawRad,
            }).ToArray(),
            airframe_swaps = runtime.AirframeSwaps,
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
                yaw_rate_rad_s = rotorcraft.BodyYawRateRadPerSecond,
                collective = _controlLatch.Command.Collective,
                forward_cyclic = _controlLatch.Command.ForwardCyclic,
                right_cyclic = _controlLatch.Command.RightCyclic,
                yaw = _controlLatch.Command.Yaw,
                pedal = _controlLatch.Command.Yaw,
                wind_e_mps = observation.WindVelocityMps.X,
                wind_u_mps = observation.WindVelocityMps.Y,
                wind_n_mps = observation.WindVelocityMps.Z,
                velocity_x_mps = velocity.X,
                velocity_y_mps = velocity.Y,
                velocity_z_mps = velocity.Z,
                flyable = observation.Flyable,
                contact_failure_cause = ContactFailureCauseSlug(
                    runtime.Cobra.LastContactFailureCause),
                gear_damaged = runtime.Cobra.GearDamaged,
                touchdown_sink_mps = runtime.Cobra.LastTouchdown.SinkMps,
                touchdown_lateral_mps = runtime.Cobra.LastTouchdown.LateralMps,
                touchdown_yaw_rate_rad_s = runtime.Cobra.LastTouchdown.YawRateRadPerSecond,
                power_assessment = power.Assessment.ToString().ToLowerInvariant(),
                hover_power_margin = power.HoverPowerMarginFraction,
                // Live headroom that follows the collective — hover_power_margin is a capability
                // constant in cruise and serialized as telemetry it read as a dead column.
                power_margin = power.AppliedPowerMarginFraction,
                rotorcraft = new {
                    regime = rotorcraft.Regime.ToString(),
                    main_rotor_rpm = rotorcraft.MainRotorRpm,
                    tail_rotor_rpm = rotorcraft.TailRotorRpm,
                    main_rotor_fraction = rotorcraft.MainRotorRpm
                        / Ah1gCobraDefinition.LateProduction.MainRotor.NominalRpm,
                    collective_root_pitch_rad = rotorcraft.CollectiveRootPitchRad,
                    engine_shaft_power_w = rotorcraft.EngineShaftPowerW,
                    available_shaft_power_w = rotorcraft.AvailableShaftPowerW,
                    engine_shaft_power_fraction = rotorcraft.AvailableShaftPowerW > 1.0
                        ? rotorcraft.EngineShaftPowerW / rotorcraft.AvailableShaftPowerW
                        : 0.0,
                    transmission_torque_nm = rotorcraft.TransmissionTorqueNm,
                    transmission_limit_fraction = rotorcraft.TransmissionLimitFraction,
                    governor_saturated = rotorcraft.GovernorSaturated,
                    vortex_ring_severity = rotorcraft.VortexRingSeverity,
                    retreating_blade_stall_severity = rotorcraft.RetreatingBladeStallSeverity,
                    mast_bump_risk = rotorcraft.MastBumpRisk,
                    main_rotor_clearance_m = rotorcraft.MainRotorClearanceM,
                    ground_effect_factor = rotorcraft.GroundEffectFactor,
                    engine_operating = rotorcraft.EngineOperating,
                    advance_ratio = rotorcraft.AdvanceRatio,
                    body_roll_rate_rad_s = runtime.Cobra.State.BodyRates.P,
                    body_pitch_rate_rad_s = runtime.Cobra.State.BodyRates.Q,
                    body_yaw_rate_rad_s = rotorcraft.BodyYawRateRadPerSecond,
                    torque_yaw_demand_rad_s = rotorcraft.TorqueYawDemandRadPerSecond,
                    scas_roll_rad_s = cyclicScas.P,
                    scas_pitch_rad_s = cyclicScas.Q,
                    scas_yaw_rad_s = rotorcraft.ScasYawRadPerSecond,
                    weathervane_yaw_rad_s = rotorcraft.WeathervaneYawRadPerSecond,
                    yaw_residual_rad_s = rotorcraft.YawResidualRadPerSecond,
                    // Physical body axes: X pitch/right, Y yaw/up, Z roll/forward.
                    gust_pitch_moment_nm = gustMomentBodyNm.X,
                    gust_yaw_moment_nm = gustMomentBodyNm.Y,
                    gust_roll_moment_nm = gustMomentBodyNm.Z,
                    collective_hub_pitch_moment_nm =
                        runtime.Cobra.LastCollectiveHubMomentBodyNm.X,
                },
            },
            collision_obstacle_id = diagnostics.CollisionObstacleId,
            terrain_sample_known = diagnostics.TerrainSampleKnown,
            fidelity_disclosure = diagnostics.FidelityDisclosure,
        };
    }

    static CobraMissionRuntime RequireRuntime() =>
        _runtime ?? throw new InvalidOperationException("Cobra route has not been started.");

    // Sight cadence. The gunner's line of sight is a terrain march, and re-marching it on every
    // 120 Hz authority tick was measured at 41.6 ms per tick in flight — the whole of the Build 265
    // "very laggy" report, and the reason the page felt fine until you cued a target and climbed
    // out of terrain masking. Twelve ticks is the same 10 Hz cadence CobraMissionRuntime already
    // uses for threat masking, so a masking transition reaches the crew inside 100 ms — an order
    // of magnitude under the gunner's own acquisition time. The turret servo still slews, and the
    // envelope and ballistic solution are still assessed, every tick: those are pure trigonometry.
    const int GunnerSightIntervalTicks = 12;
    static long _gunnerSightAuthorityTick = long.MinValue;
    static string? _gunnerSightTargetId;
    static bool _gunnerSightHasLineOfSight;

    static void AdvanceGunner(CobraMissionRuntime runtime)
    {
        if (_gunnerNeedsAuthorityRebase) {
            _gunner = CreateGunner();
            _gunner.RebaseAuthorityTick(runtime.Cobra.State.Tick);
            _turretServo.Reset();
            _gunnerDecision = default;
            _gunnerSightTargetId = null;
            _gunnerSightAuthorityTick = long.MinValue;
            _gunnerSightHasLineOfSight = false;
            _gunnerNeedsAuthorityRebase = false;
        }
        CobraGunnerTargetObservation? target = null;
        if (_selectedTargetId is not null) {
            GroundUnit? unit = runtime.GroundWar.FindUnit(_selectedTargetId);
            if (unit is { IsAlive: true }) {
                long authorityTick = runtime.Cobra.State.Tick;
                // A new mark is re-sighted immediately; nobody should inherit the last target's
                // verdict, and a stale "masked" would silently withhold fire authority.
                if (!string.Equals(_gunnerSightTargetId, unit.Id, StringComparison.Ordinal)
                    || authorityTick - _gunnerSightAuthorityTick >= GunnerSightIntervalTicks) {
                    _gunnerSightTargetId = unit.Id;
                    _gunnerSightAuthorityTick = authorityTick;
                    _gunnerSightHasLineOfSight = CobraGunTargeting.EvaluateLineOfSight(
                        runtime.Terrain,
                        runtime.ResolvedObstacles,
                        runtime.Cobra.State.PositionWorldM,
                        unit.PositionWorldM);
                }
                // Sight and turret reachability are independent signals: HasLineOfSight means
                // sight alone, WithinTurretEnvelope means the mount can reach it, and the servo
                // slews only when both hold. Composition (and the reason-chain honesty it buys)
                // is pinned by CobraGunnerObservationTests.
                target = CobraGunTargeting.AdvanceGunnerObservation(
                    runtime.Terrain,
                    runtime.ResolvedObstacles,
                    runtime.Cobra.State.PositionWorldM,
                    runtime.Cobra.Observation.YawRad,
                    unit.Id,
                    friendly: unit.Faction == GroundFaction.Friendly,
                    unit.PositionWorldM,
                    _turretServo,
                    FixedDeltaSeconds,
                    _gunnerSightHasLineOfSight);
            }
        }
        _gunnerDecision = _gunner.Advance(new CobraAiGunnerInput(
            runtime.Cobra.State.Tick,
            _selectedTargetId,
            _engagementConsent,
            WeaponsArmed: runtime.Turnaround.WeaponsEnabled
                && !runtime.GroundWar.Magazine.IsDry,
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
        GroundUnitRole.DshkSite => "dshk-site",
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
        CobraMissionStatus.FobCombatIneffective => "fob-combat-ineffective",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };

    static string ActToken(CobraMissionAct act) => act switch {
        CobraMissionAct.Depart => "depart",
        CobraMissionAct.Ingress => "ingress",
        CobraMissionAct.Engage => "engage",
        CobraMissionAct.Hold => "hold",
        CobraMissionAct.Rtb => "rtb",
        CobraMissionAct.Complete => "complete",
        _ => throw new ArgumentOutOfRangeException(nameof(act))
    };
}
