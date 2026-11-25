using System.Runtime.InteropServices;
using GunsOnly.Sim;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Missiles;
using GunsOnly.Sim.Okanagan;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;
using GunsOnly.Sim.Vehicles;
using GunsOnly.Web;

namespace GunsOnly.Sim.Native;

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimFrame {
    public double sim_time_s;
    public long tick;
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double vel_east_mps;
    public double vel_up_mps;
    public double vel_north_mps;
    public double fwd_east;
    public double fwd_up;
    public double fwd_north;
    public double up_east;
    public double up_up;
    public double up_north;
    public double speed_mps;
    public double kcas;
    public double mach;
    public double alpha_deg;
    public double nz_g;
    public double throttle01;
    public double speedbrake01;
    public double gear_down01;
    public double flaps01;
    public double fuel_lb;
    public double player_health;
    public double guidance_next_alt_m;
    public double guidance_next_tas_mps;
    public double guidance_power01;
    public int lifecycle;
    public int outcome;
    public int player_alive;
    public int player_rtb_active;
    public int rtb_available;
    public int can_end_sortie;
    public int weight_on_wheels;
    public int runway_phase;
    public int buffet;
    public int ammo_remaining;
    public int rounds_fired;
    public int live_opponent_count;
    public int relief_kills;
    public int guidance_active;
    public int guidance_in_groove;
    public int guidance_pattern_leg;
    public int guidance_energy_state;
    public int guidance_gate_count;
    public int contact_count;
    public int tracer_count;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimContact {
    public double health;
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double vel_east_mps;
    public double vel_up_mps;
    public double vel_north_mps;
    public double fwd_east;
    public double fwd_up;
    public double fwd_north;
    public double up_east;
    public double up_up;
    public double up_north;
    public double speed_mps;
    public int role;
    public int alive;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimTracer {
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double vel_east_mps;
    public double vel_up_mps;
    public double vel_north_mps;
    public double age_s;
    public int id;
    public int friendly;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimApproachGate {
    public double east_m;
    public double north_m;
    public double up_m;
    public double half_m;
    public double target_alt_m;
    public double target_ktas;
    public double distance_to_go_m;
    public int pattern_leg;
    public int dirty_config;
    public int active;
    public int reserved0;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimRunway {
    public double threshold_east_m;
    public double threshold_up_m;
    public double threshold_north_m;
    public double heading_rad;
    public double length_m;
    public double width_m;
    public double touchdown_aim_along_m;
    public int present;
    public int reserved0;
}

[StructLayout(LayoutKind.Sequential)]
public unsafe struct GunsSimCourseState {
    public double carrot_east_m;
    public double carrot_up_m;
    public double carrot_north_m;
    public double carrot_target_kcas;
    public double predictor_east_m;
    public double predictor_up_m;
    public double predictor_north_m;
    public double next_gate_dist_nm;
    public double next_gate_alt_ft;
    public double next_gate_kcas;
    public double glideslope_deg;
    public double runway_dist_nm;
    public double cross_track_m;
    public int armed;
    public int complete;
    public int carrot_valid;
    public int next_gate_index;
    public int next_gate_needs_gear;
    public int autothrottle_active;
    public int total_gates;
    public int passed_gates;
    public fixed int gate_grades[7];
    public int touchdown_contact;
    public int touchdown_survivable;
    public int kills;
    public int sortie_hits;
    public int combat_complete;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimLeadCue {
    public double lead_east_m;
    public double lead_up_m;
    public double lead_north_m;
    public double lead_dir_east;
    public double lead_dir_up;
    public double lead_dir_north;
    public double lead_tof_s;
    public double range_m;
    public int has_lead_solution;
    public int gun_solution;
    public int in_gun_window;
    public int weapons_inhibited;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimCobraState {
    public double main_rotor_rpm;
    public double rotor_azimuth_rad;
    public double torque_fraction;
    public double agl_m;
    public double vertical_speed_mps;
    public double collective01;
    public double target_east_m;
    public double target_up_m;
    public double target_north_m;
    public double target_health01;
    public double fob_east_m;
    public double fob_up_m;
    public double fob_north_m;
    public double bridge_east_m;
    public double bridge_up_m;
    public double bridge_north_m;
    public int active;
    public int assisted_scas;
    public int gunner_state;
    public int gunner_fire_authorized;
    public int rockets_remaining;
    public int friendly_points;
    public int hostile_points;
    public int friendly_tickets;
    public int hostile_tickets;
    public int time_remaining_s;
    public int mission_status;
    public int has_target;
}

[StructLayout(LayoutKind.Sequential)]
public unsafe struct GunsSimGunFunnel {
    public fixed double east_m[9];
    public fixed double up_m[9];
    public fixed double north_m[9];
    public fixed double range_m[9];
    public double target_wingspan_m;
    public double muzzle_velocity_mps;
    public double closure_kts;
    public double corner_speed_kias;
    public double stall_speed_kias;
    public double sustained_g;
    public int sample_count;
    public int selected_target_slot;
    public int valid;
    public int reserved0;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimPilotState {
    public double peripheral_vision01;
    public double central_vision01;
    public double redout01;
    public double control_authority01;
    public double cognitive_capacity01;
    public double buffet_pitch_deg;
    public double buffet_roll_deg;
    public double buffet_yaw_deg;
    public double body_rate_p_rps;
    public double body_rate_q_rps;
    public double body_rate_r_rps;
    public double auto_gcas_time_avail_s;
    public double auto_gcas_clearance_m;
    public int pilot_state;
    public int high_alpha_recovery;
    public int padlock_roll_assist_active;
    public int auto_gcas_available;
    public int auto_gcas_warning;
    public int auto_gcas_active;
    public int auto_gcas_override_held;
    public int g_loc_count;
    public int control_interlocked;
    public int trigger_interlocked;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimCombatDirector {
    public double wave_score_multiplier;
    public double combat_score;
    public double sortie_peak_g;
    public double sortie_min_g;
    public double aim9_boresight_deg;
    public double aim9_track_rate_dps;
    public double wing_sweep_deg;
    public double hook_down01;
    public double rapier_target_mach;
    public double rapier_skin_temp_c;
    public double rapier_skin_limit_c;
    public double incoming_wave_bearing_deg;
    public int wave_number;
    public int engagements_won;
    public int engagement_cap;
    public int rtb_bounce_active;
    public int sortie_rung;
    public int earned_rung;
    public int director_hits;
    public int director_kills;
    public int splash_cue_active;
    public int selected_target_slot;
    public int missiles_remaining;
    public int missile_in_flight;
    public int aim9_seeker_state;
    public int rapier_phase;
    public int rapier_automation_active;
    public int time_compression_factor;
    public int time_compression_eligible;
    public int incoming_wave_active;
}

[StructLayout(LayoutKind.Sequential)]
public unsafe struct GunsSimWeatherState {
    public double local_cloud_fraction01;
    public double local_cloud_extinction_per_m;
    public double local_visibility_m;
    public double precipitation_mm_hr;
    public double turbulence_rms_mps;
    public fixed double layer_base_alt_m[4];
    public fixed double layer_top_alt_m[4];
    public fixed double layer_coverage01[4];
    public fixed double layer_scale_m[4];
    public fixed double layer_adv_east_mps[4];
    public fixed double layer_adv_north_mps[4];
    public int layer_count;
    public int reserved0;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimCarrierState {
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double heading_rad;
    public double landing_heading_rad;
    public double deck_length_m;
    public double deck_width_m;
    public double speed_mps;
    public double glideslope_err_deg;
    public double lineup_err_m;
    public double aoa_err_deg;
    public double wire_decel_mps2;
    public int present;
    public int lso_severity;
    public int arrestment_phase;
    public int caught_wire;
    public int catapult_active;
    public int angled_deck;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimOkanaganState {
    public double water_kg;
    public double water_capacity_kg;
    public double scoop_target_kg;
    public double fire_intensity;
    public double burned_area_ha;
    public double score;
    public double drop_aim_east_m;
    public double drop_aim_up_m;
    public double drop_aim_north_m;
    public double water_level_m;
    public double scoop_rate_kgps;
    public double water_released_this_tick_kg;
    public double agl_m;
    public double fuel_kg;
    public int active;
    public int phase;
    public int surface_mode;
    public int scoops_commanded;
    public int scoop_valid;
    public int dropping;
    public int effective_drops;
    public int completed_cycles;
    public int fire_cell_count;
    public int reserved0;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimFireCell {
    public double east_m;
    public double up_m;
    public double north_m;
    public double intensity01;
}

internal sealed class CobraSessionState {
    public const double FixedDeltaSeconds = 1.0 / PlayerVehicleContract.FixedStepHz;
    public const int InitialRockets = 38;
    const double RocketSpeedMps = 720.0;
    const double RocketSplashRadiusM = 18.0;
    const double RocketSplashDamageHp = 140.0;
    const int GunnerSightIntervalTicks = 12;

    public struct HydraRocket {
        public Vec3D Pos;
        public Vec3D Vel;
        public double AgeS;
        public int Id;
    }

    public struct TurretTracer {
        public Vec3D Pos;
        public Vec3D Vel;
        public double AgeS;
        public double MaxAgeS;
        public int Id;
    }

    public CobraCanyonDefinition Definition { get; private set; }
    public CobraCanyonTerrainSurface Terrain { get; private set; }
    public CobraMissionRuntime Runtime { get; private set; }
    public Vec3D BridgeWorldM { get; private set; }

    public SimulationSession.LifecycleState Lifecycle = SimulationSession.LifecycleState.Ready;
    public bool AssistedScas = true;
    public double PilotRightCyclic;
    public double PilotForwardCyclic;
    public double PilotYaw;
    public double PilotClimbCmd;
    public double RawCollective;
    public bool EngagementConsent;
    public double LastAppliedCollective;

    public double HoldAltitudeM;
    public double HoldYawRad;
    public string? SelectedTargetId;
    public int RocketsRemaining = InitialRockets;
    public int RocketKills;

    public readonly List<HydraRocket> Rockets = new();
    public readonly List<TurretTracer> TurretTracers = new();

    readonly CobraTurretServo _turretServo = new();
    CobraAiGunner _gunner = CreateGunner();
    CobraAiGunnerDecision _gunnerDecision;
    string? _gunnerSightTargetId;
    long _gunnerSightAuthorityTick = long.MinValue;
    bool _gunnerSightHasLineOfSight;
    bool _gunnerNeedsRebase;
    int _lastAirframeSwaps;
    int _lastRearmCount;
    int _turretTracerCooldownTicks;
    bool _rocketSideRight;
    int _nextTracerId = 1;
    double _accumulatorSeconds;
    public double ElapsedSeconds;

    bool _keyPullUp;
    bool _keyPushDown;
    bool _keyRollLeft;
    bool _keyRollRight;
    bool _keyRudderLeft;
    bool _keyRudderRight;
    bool _keyThrottleUp;
    bool _keyThrottleDown;

    public CobraAiGunnerDecision GunnerDecision => _gunnerDecision;
    public CobraTurretServo TurretServo => _turretServo;

    static CobraAiGunner CreateGunner() => new(new CobraAiGunnerDefinition(
        AcquisitionSeconds: 0.75,
        ReacquisitionSeconds: 0.45,
        SightCoincidenceToleranceRad: 0.06));

    public CobraSessionState() {
        Definition = CobraCanyonDefinition.Create();
        Terrain = Definition.CreateTerrainSurface();
        Runtime = CreateRuntime(Definition, Terrain, out Vec3D bridgePos);
        BridgeWorldM = bridgePos;
        ResetTransientState();
    }

    static CobraMissionRuntime CreateRuntime(
        CobraCanyonDefinition definition,
        CobraCanyonTerrainSurface terrain,
        out Vec3D bridgePos) {
        CobraCanyonLandmarkDefinition bridgeLandmark = definition.Landmarks.First(l =>
            string.Equals(l.Id, "landmark.cobra-canyon.iron-bell-bridge.v1", StringComparison.Ordinal));
        terrain.TrySample(bridgeLandmark.EastM, bridgeLandmark.NorthM, out TerrainSample bridgeSample);
        bridgePos = new Vec3D(bridgeLandmark.EastM, bridgeSample.HeightM, bridgeLandmark.NorthM);
        return new CobraMissionRuntime(
            definition,
            terrain,
            CobraCanyonRouteChoice.RiverGorge,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            enableTerrainWind: true,
            spawn: null,
            groundWarSeed: null,
            initialReadySpares: 2);
    }

    void ResetTransientState() {
        PlayerVehicleObservation obs = Runtime.Cobra.Observation;
        double hoverCol = Runtime.Cobra.EstimateHoverCollective(
            obs.GrossMassKg, CobraMissionRuntime.DefaultAirDensityKgM3);
        HoldAltitudeM = obs.PositionWorldM.Y;
        HoldYawRad = obs.YawRad;
        RawCollective = hoverCol;
        LastAppliedCollective = hoverCol;
        PilotRightCyclic = 0.0;
        PilotForwardCyclic = 0.0;
        PilotYaw = 0.0;
        PilotClimbCmd = 0.0;
        EngagementConsent = false;
        RocketsRemaining = InitialRockets;
        RocketKills = 0;
        Rockets.Clear();
        TurretTracers.Clear();
        _gunner = CreateGunner();
        _turretServo.Reset();
        _gunnerDecision = default;
        _gunnerSightTargetId = null;
        _gunnerSightAuthorityTick = long.MinValue;
        _gunnerSightHasLineOfSight = false;
        _gunnerNeedsRebase = false;
        _lastAirframeSwaps = Runtime.AirframeSwaps;
        _lastRearmCount = Runtime.GroundWar.Debrief.FobRearmCount;
        _turretTracerCooldownTicks = 0;
        _accumulatorSeconds = 0.0;
        ElapsedSeconds = 0.0;
        _keyPullUp = _keyPushDown = _keyRollLeft = _keyRollRight = false;
        _keyRudderLeft = _keyRudderRight = _keyThrottleUp = _keyThrottleDown = false;
        SelectDefaultTarget();
    }

    public void Restart() {
        Definition = CobraCanyonDefinition.Create();
        Terrain = Definition.CreateTerrainSurface();
        Runtime = CreateRuntime(Definition, Terrain, out Vec3D bridgePos);
        BridgeWorldM = bridgePos;
        Lifecycle = SimulationSession.LifecycleState.Ready;
        ResetTransientState();
    }

    public void SetAssistedScas(bool enabled) {
        if (AssistedScas == enabled) return;
        AssistedScas = enabled;
        PlayerVehicleObservation obs = Runtime.Cobra.Observation;
        if (!enabled) {
            RawCollective = LastAppliedCollective;
        } else {
            HoldAltitudeM = obs.PositionWorldM.Y;
            HoldYawRad = obs.YawRad;
            PilotClimbCmd = 0.0;
        }
    }

    public double SampleGroundHeightM(double eastM, double northM) {
        return Terrain.TryHeightM(eastM, northM, out double h) && double.IsFinite(h) ? h : 0.0;
    }

    public int CycleTarget() {
        Vec3D pos = Runtime.Cobra.Observation.PositionWorldM;
        List<GroundUnit> hostiles = new();
        foreach (GroundUnit unit in Runtime.GroundWar.Units) {
            if (unit.IsAlive && unit.Faction == GroundFaction.Hostile)
                hostiles.Add(unit);
        }
        if (hostiles.Count == 0) {
            SelectedTargetId = null;
            return 0;
        }
        hostiles.Sort((a, b) => {
            Vec3D va = a.PositionWorldM - pos;
            Vec3D vb = b.PositionWorldM - pos;
            double da = va.Dot(va);
            double db = vb.Dot(vb);
            return da.CompareTo(db);
        });
        int cur = string.IsNullOrWhiteSpace(SelectedTargetId)
            ? -1
            : hostiles.FindIndex(u => string.Equals(u.Id, SelectedTargetId, StringComparison.Ordinal));
        int next = cur >= 0 ? (cur + 1) % hostiles.Count : 0;
        SelectedTargetId = hostiles[next].Id;
        return 1;
    }

    void SelectDefaultTarget() {
        if (!string.IsNullOrWhiteSpace(SelectedTargetId)) {
            GroundUnit? cur = Runtime.GroundWar.FindUnit(SelectedTargetId);
            if (cur is { IsAlive: true }) return;
        }
        CycleTarget();
    }

    public int FireRocket() {
        if (Lifecycle != SimulationSession.LifecycleState.Active && Lifecycle != SimulationSession.LifecycleState.Ready)
            return 0;
        if (!Runtime.MissionFlyable || RocketsRemaining <= 0)
            return 0;
        PlayerVehicleObservation obs = Runtime.Cobra.Observation;
        if (!obs.Flyable) return 0;

        QuaternionD att = Runtime.Cobra.State.BodyAttitude.Normalized();
        Vec3D fwd = att.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D up = att.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D right = att.Rotate(new Vec3D(1.0, 0.0, 0.0));

        RocketsRemaining--;
        _rocketSideRight = !_rocketSideRight;
        double side = _rocketPodOffset(_rocketSideRight);
        Rockets.Add(new HydraRocket {
            Pos = obs.PositionWorldM + fwd * 2.2 - up * 0.45 + right * side,
            Vel = obs.GroundVelocityMps + fwd * RocketSpeedMps,
            AgeS = 0.0,
            Id = _nextTracerId++,
        });
        return 1;
    }

    static double _rocketPodOffset(bool rightPod) => rightPod ? 1.35 : -1.35;

    static double WrapPi(double angle) {
        double a = angle % (2.0 * Math.PI);
        if (a > Math.PI) a -= 2.0 * Math.PI;
        if (a < -Math.PI) a += 2.0 * Math.PI;
        return a;
    }

    VerticalLiftPilotCommand ComputePilotCommand() {
        PlayerVehicleObservation obs = Runtime.Cobra.Observation;
        BodyRates rates = Runtime.Cobra.State.BodyRates;
        double hoverCol = Runtime.Cobra.EstimateHoverCollective(
            obs.GrossMassKg, CobraMissionRuntime.DefaultAirDensityKgM3);

        if (!AssistedScas) {
            double rawCol = Math.Clamp(RawCollective, 0.0, 1.0);
            if (_keyThrottleUp) rawCol = Math.Clamp(rawCol + 0.35 * FixedDeltaSeconds, 0.0, 1.0);
            if (_keyThrottleDown) rawCol = Math.Clamp(rawCol - 0.35 * FixedDeltaSeconds, 0.0, 1.0);
            RawCollective = rawCol;
            LastAppliedCollective = rawCol;
            return new VerticalLiftPilotCommand(
                rawCol,
                Math.Clamp(PilotForwardCyclic, -1.0, 1.0),
                Math.Clamp(PilotRightCyclic, -1.0, 1.0),
                Math.Clamp(PilotYaw, -1.0, 1.0));
        }

        double groundH = SampleGroundHeightM(obs.PositionWorldM.X, obs.PositionWorldM.Z);
        double agl = obs.PositionWorldM.Y - groundH;
        double targetVz;
        if (Math.Abs(PilotClimbCmd) > 0.05) {
            HoldAltitudeM = obs.PositionWorldM.Y;
            targetVz = PilotClimbCmd * 11.0;
            if (PilotClimbCmd < 0.0 && agl < 6.0)
                targetVz = Math.Max(targetVz, -(agl + 0.4) * 0.65);
        } else {
            HoldAltitudeM = Math.Max(HoldAltitudeM, groundH + 22.0);
            targetVz = Math.Clamp((HoldAltitudeM - obs.PositionWorldM.Y) * 0.80, -5.0, 5.0);
        }

        double tiltComp = 1.0 / Math.Max(Math.Cos(obs.PitchRad) * Math.Cos(obs.RollRad), 0.55) - 1.0;
        double collective = Math.Clamp(
            hoverCol + (targetVz - obs.VerticalSpeedMps) * 0.055 + tiltComp * 0.25,
            0.08,
            0.98);
        LastAppliedCollective = collective;

        double sinY = Math.Sin(obs.YawRad);
        double cosY = Math.Cos(obs.YawRad);
        double vFwd = obs.GroundVelocityMps.X * sinY + obs.GroundVelocityMps.Z * cosY;
        double vRight = obs.GroundVelocityMps.X * cosY - obs.GroundVelocityMps.Z * sinY;

        double targetPitchRad = Math.Abs(PilotForwardCyclic) > 0.04
            ? -PilotForwardCyclic * (26.0 * Math.PI / 180.0)
            : Math.Clamp(vFwd * 0.008, -0.16, 0.16);
        double targetRollRad = Math.Abs(PilotRightCyclic) > 0.04
            ? PilotRightCyclic * (32.0 * Math.PI / 180.0)
            : Math.Clamp(-vRight * 0.016, -0.22, 0.22);

        double forwardCmd = Math.Clamp((obs.PitchRad - targetPitchRad) * 2.8 + rates.Q * 0.65, -1.0, 1.0);
        double rightCmd = Math.Clamp((targetRollRad - obs.RollRad) * 2.8 - rates.P * 0.65, -1.0, 1.0);

        double yawCmd;
        if (Math.Abs(PilotYaw) > 0.04) {
            HoldYawRad = obs.YawRad;
            yawCmd = Math.Clamp((PilotYaw * 1.15 - rates.R) * 1.4, -1.0, 1.0);
        } else {
            double yawErr = WrapPi(HoldYawRad - obs.YawRad);
            yawCmd = Math.Clamp(yawErr * 2.2 - rates.R * 1.6, -1.0, 1.0);
        }

        return new VerticalLiftPilotCommand(collective, forwardCmd, rightCmd, yawCmd);
    }

    public int Advance(double deltaSeconds, int maxCompression) {
        if (Lifecycle != SimulationSession.LifecycleState.Active)
            return 0;
        int maxSteps = Math.Clamp(maxCompression, 1, 16) * 12;
        _accumulatorSeconds += Math.Min(deltaSeconds, 0.25);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds
            && ticks < maxSteps
            && Runtime.MissionFlyable) {
            StepOnce();
            _accumulatorSeconds -= FixedDeltaSeconds;
            ticks++;
        }
        if (!Runtime.MissionFlyable || Runtime.Status != CobraMissionStatus.Active)
            Lifecycle = SimulationSession.LifecycleState.Finished;
        return ticks;
    }

    void StepOnce() {
        ElapsedSeconds += FixedDeltaSeconds;
        int swapsBefore = Runtime.AirframeSwaps;
        VerticalLiftPilotCommand cmd = ComputePilotCommand();
        Runtime.Advance(cmd, turnaroundActionHeld: false, EngagementConsent);

        if (Runtime.AirframeSwaps > swapsBefore || Runtime.AirframeSwaps != _lastAirframeSwaps) {
            _lastAirframeSwaps = Runtime.AirframeSwaps;
            _gunnerNeedsRebase = true;
            HoldAltitudeM = Runtime.Cobra.Observation.PositionWorldM.Y;
            HoldYawRad = Runtime.Cobra.Observation.YawRad;
            RawCollective = Runtime.Cobra.EstimateHoverCollective(
                Runtime.Cobra.Observation.GrossMassKg, CobraMissionRuntime.DefaultAirDensityKgM3);
        }

        int rearmNow = Runtime.GroundWar.Debrief.FobRearmCount;
        if (rearmNow > _lastRearmCount) {
            _lastRearmCount = rearmNow;
            RocketsRemaining = InitialRockets;
        }

        AdvanceGunner();
        if (_gunnerDecision.FireAuthorized && !string.IsNullOrWhiteSpace(SelectedTargetId)) {
            if (Runtime.ApplyAuthorizedGunfire(SelectedTargetId)) {
                if (_turretTracerCooldownTicks <= 0) {
                    _turretTracerCooldownTicks = 3;
                    SpawnTurretTracer(SelectedTargetId);
                }
            }
        }
        if (_turretTracerCooldownTicks > 0) _turretTracerCooldownTicks--;

        StepTracersAndRockets();
        SelectDefaultTarget();
    }

    void AdvanceGunner() {
        if (_gunnerNeedsRebase) {
            _gunner = CreateGunner();
            _gunner.RebaseAuthorityTick(Runtime.Cobra.State.Tick);
            _turretServo.Reset();
            _gunnerDecision = default;
            _gunnerSightTargetId = null;
            _gunnerSightAuthorityTick = long.MinValue;
            _gunnerSightHasLineOfSight = false;
            _gunnerNeedsRebase = false;
        }

        CobraGunnerTargetObservation? target = null;
        if (!string.IsNullOrWhiteSpace(SelectedTargetId)) {
            GroundUnit? unit = Runtime.GroundWar.FindUnit(SelectedTargetId);
            if (unit is { IsAlive: true }) {
                long authorityTick = Runtime.Cobra.State.Tick;
                if (!string.Equals(_gunnerSightTargetId, unit.Id, StringComparison.Ordinal)
                    || authorityTick - _gunnerSightAuthorityTick >= GunnerSightIntervalTicks) {
                    _gunnerSightTargetId = unit.Id;
                    _gunnerSightAuthorityTick = authorityTick;
                    _gunnerSightHasLineOfSight = CobraGunTargeting.EvaluateLineOfSight(
                        Terrain,
                        Runtime.ResolvedObstacles,
                        Runtime.Cobra.State.PositionWorldM,
                        CobraGunTargeting.AimPoint(unit.PositionWorldM));
                }
                target = CobraGunTargeting.AdvanceGunnerObservation(
                    Terrain,
                    Runtime.ResolvedObstacles,
                    Runtime.Cobra.State.PositionWorldM,
                    Runtime.Cobra.Observation.YawRad,
                    unit.Id,
                    friendly: unit.Faction == GroundFaction.Friendly,
                    unit.PositionWorldM,
                    _turretServo,
                    FixedDeltaSeconds,
                    _gunnerSightHasLineOfSight);
            }
        }

        _gunnerDecision = _gunner.Advance(new CobraAiGunnerInput(
            Runtime.Cobra.State.Tick,
            SelectedTargetId,
            EngagementConsent,
            WeaponsArmed: Runtime.Turnaround.WeaponsEnabled && !Runtime.GroundWar.Magazine.IsDry,
            TurretServiceable: true,
            target));
    }

    void SpawnTurretTracer(string targetId) {
        GroundUnit? unit = Runtime.GroundWar.FindUnit(targetId);
        if (unit is null) return;
        QuaternionD att = Runtime.Cobra.State.BodyAttitude.Normalized();
        Vec3D fwd = att.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D up = att.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D muzzle = Runtime.Cobra.Observation.PositionWorldM + fwd * 2.4 - up * 0.85;
        Vec3D aim = CobraGunTargeting.AimPoint(unit.PositionWorldM);
        Vec3D delta = aim - muzzle;
        double dist = Math.Max(delta.Length, 1.0);
        Vec3D dir = delta * (1.0 / dist);
        TurretTracers.Add(new TurretTracer {
            Pos = muzzle,
            Vel = dir * 680.0,
            AgeS = 0.0,
            MaxAgeS = Math.Clamp(dist / 680.0, 0.08, 2.5),
            Id = _nextTracerId++,
        });
    }

    void StepTracersAndRockets() {
        for (int i = TurretTracers.Count - 1; i >= 0; i--) {
            TurretTracer tr = TurretTracers[i];
            tr.Pos += tr.Vel * FixedDeltaSeconds;
            tr.AgeS += FixedDeltaSeconds;
            if (tr.AgeS >= tr.MaxAgeS)
                TurretTracers.RemoveAt(i);
            else
                TurretTracers[i] = tr;
        }

        for (int i = Rockets.Count - 1; i >= 0; i--) {
            HydraRocket rk = Rockets[i];
            rk.Pos += rk.Vel * FixedDeltaSeconds;
            rk.Vel = new Vec3D(rk.Vel.X, rk.Vel.Y - 9.81 * FixedDeltaSeconds, rk.Vel.Z);
            rk.AgeS += FixedDeltaSeconds;

            double gH = SampleGroundHeightM(rk.Pos.X, rk.Pos.Z);
            bool hit = rk.Pos.Y <= gH + 0.5 || rk.AgeS >= 4.0;
            if (!hit) {
                foreach (GroundUnit unit in Runtime.GroundWar.Units) {
                    if (!unit.IsAlive) continue;
                    Vec3D aim = unit.PositionWorldM + new Vec3D(0.0, 1.0, 0.0);
                    Vec3D rel = aim - rk.Pos;
                    if (rel.Dot(rel) <= 4.5 * 4.5) {
                        hit = true;
                        break;
                    }
                }
            }

            if (hit) {
                DetonateRocket(rk.Pos);
                Rockets.RemoveAt(i);
            } else {
                Rockets[i] = rk;
            }
        }
    }

    void DetonateRocket(in Vec3D impactPos) {
        foreach (GroundUnit unit in Runtime.GroundWar.Units) {
            if (!unit.IsAlive) continue;
            Vec3D aim = unit.PositionWorldM + new Vec3D(0.0, 1.0, 0.0);
            double dist = (aim - impactPos).Length;
            if (dist > RocketSplashRadiusM) continue;
            double dmg = RocketSplashDamageHp * (1.0 - dist / RocketSplashRadiusM);
            if (dmg <= 0.0) continue;
            bool wasAlive = unit.IsAlive;
            unit.ApplyDamage(dmg);
            if (wasAlive && !unit.IsAlive && unit.Faction == GroundFaction.Hostile)
                RocketKills++;
        }
    }

    public void FeedKey(int gkey, bool pressed) {
        switch ((GKey)gkey) {
            case GKey.PullUp: _keyPullUp = pressed; break;
            case GKey.PushDown: _keyPushDown = pressed; break;
            case GKey.RollLeft: _keyRollLeft = pressed; break;
            case GKey.RollRight: _keyRollRight = pressed; break;
            case GKey.RudderLeft: _keyRudderLeft = pressed; break;
            case GKey.RudderRight: _keyRudderRight = pressed; break;
            case GKey.ThrottleUp: _keyThrottleUp = pressed; break;
            case GKey.ThrottleDown: _keyThrottleDown = pressed; break;
            case GKey.Trigger: EngagementConsent = pressed; break;
            case GKey.Padlock:
                if (pressed) CycleTarget();
                break;
            case GKey.Restart:
                if (pressed) Restart();
                break;
        }
        PilotForwardCyclic = (_keyPushDown ? 1.0 : 0.0) - (_keyPullUp ? 1.0 : 0.0);
        PilotRightCyclic = (_keyRollRight ? 1.0 : 0.0) - (_keyRollLeft ? 1.0 : 0.0);
        PilotYaw = (_keyRudderRight ? 1.0 : 0.0) - (_keyRudderLeft ? 1.0 : 0.0);
        if (_keyThrottleUp || _keyThrottleDown)
            PilotClimbCmd = (_keyThrottleUp ? 1.0 : 0.0) - (_keyThrottleDown ? 1.0 : 0.0);
        else
            PilotClimbCmd = 0.0;
    }
}

internal sealed class OkanaganTerrainAdapter : ITerrainSurface {
    public TerrainBounds Bounds { get; } = new(-90_000.0, 90_000.0, -90_000.0, 90_000.0);
    public double HorizontalResolutionM => 25.0;

    public bool TryHeightM(double eastM, double northM, out double heightM) {
        heightM = OkanaganCdem.SampleSurfaceHeightM(new Vec3D(eastM, 0.0, northM));
        return double.IsFinite(heightM);
    }

    public bool TrySample(double eastM, double northM, out TerrainSample sample) {
        Vec3D pos = new(eastM, 0.0, northM);
        double h = OkanaganCdem.SampleSurfaceHeightM(pos);
        bool water = OkanaganGeo.IsOverCentralLake(pos);
        sample = new TerrainSample(h, new Vec3D(0.0, 1.0, 0.0),
            water ? TerrainSurfaceKind.Water : TerrainSurfaceKind.Land);
        return double.IsFinite(h);
    }
}

internal sealed class OkanaganSessionState {
    public OkanaganFireMission Mission { get; private set; }
    public FireBossPilotCommand PendingCmd;
    public FireBossPilotCommand AppliedCmd;
    public readonly FireBossControlTapBuffer Taps = new();
    public readonly FireBossAutoTrim AutoTrim = new(true);
    public SimulationSession.LifecycleState Lifecycle = SimulationSession.LifecycleState.Ready;
    double _accumulatorSeconds;
    long _tick;
    bool _keyPullUp, _keyPushDown, _keyRollLeft, _keyRollRight;
    bool _keyRudderLeft, _keyRudderRight, _keyThrottleUp, _keyThrottleDown;
    bool _analogOverride;

    public OkanaganSessionState() {
        OkanaganTruth.RequireLoaded();
        Mission = OkanaganFireMission.CreateForPlayer(OkanaganSortieType.FireAttack);
        PendingCmd = new FireBossPilotCommand(0.0, 0.0, 0.0,
            Mission.Aircraft.Telemetry.Throttle, false, false);
        AppliedCmd = PendingCmd;
        AutoTrim.Reset(true);
    }

    public long Tick => _tick;

    public void Restart() {
        Mission = OkanaganFireMission.CreateForPlayer(OkanaganSortieType.FireAttack);
        PendingCmd = new FireBossPilotCommand(0.0, 0.0, 0.0,
            Mission.Aircraft.Telemetry.Throttle, false, false);
        AppliedCmd = PendingCmd;
        AutoTrim.Reset(true);
        Taps.Reset();
        Lifecycle = SimulationSession.LifecycleState.Ready;
        _accumulatorSeconds = 0.0;
        _tick = 0;
        _keyPullUp = _keyPushDown = _keyRollLeft = _keyRollRight = false;
        _keyRudderLeft = _keyRudderRight = _keyThrottleUp = _keyThrottleDown = false;
        _analogOverride = false;
    }

    public void SetPaused(bool paused) {
        Mission.SetPaused(paused);
        AutoTrim.SetPaused(paused);
        if (paused) {
            Taps.Clear();
            PendingCmd = PendingCmd with { Pitch = 0.0, Roll = 0.0, Yaw = 0.0, DropRequested = false };
            Lifecycle = SimulationSession.LifecycleState.Paused;
        } else if (Lifecycle == SimulationSession.LifecycleState.Paused) {
            Lifecycle = SimulationSession.LifecycleState.Active;
        }
    }

    public void FeedKey(int gkey, bool pressed) {
        switch ((GKey)gkey) {
            case GKey.PullUp: _keyPullUp = pressed; break;
            case GKey.PushDown: _keyPushDown = pressed; break;
            case GKey.RollLeft: _keyRollLeft = pressed; break;
            case GKey.RollRight: _keyRollRight = pressed; break;
            case GKey.RudderLeft: _keyRudderLeft = pressed; break;
            case GKey.RudderRight: _keyRudderRight = pressed; break;
            case GKey.ThrottleUp: _keyThrottleUp = pressed; break;
            case GKey.ThrottleDown: _keyThrottleDown = pressed; break;
            case GKey.Trigger:
                PendingCmd = PendingCmd with { DropRequested = pressed };
                break;
            case GKey.GearToggle:
                if (pressed)
                    PendingCmd = PendingCmd with { ScoopsExtended = !PendingCmd.ScoopsExtended };
                break;
            case GKey.Restart:
                if (pressed) {
                    Restart();
                    return;
                }
                break;
        }
        _analogOverride = false;
        double pitch = (_keyPullUp ? 1.0 : 0.0) - (_keyPushDown ? 1.0 : 0.0);
        double roll = (_keyRollRight ? 1.0 : 0.0) - (_keyRollLeft ? 1.0 : 0.0);
        double yaw = (_keyRudderRight ? 1.0 : 0.0) - (_keyRudderLeft ? 1.0 : 0.0);
        PendingCmd = PendingCmd with { Pitch = pitch, Roll = roll, Yaw = yaw };
    }

    public void SetAnalogControls(double roll, double pitch, double yaw,
        double throttle01, bool throttleOverride, int triggerDown) {
        bool hasAxis = Math.Abs(roll) > 1e-4 || Math.Abs(pitch) > 1e-4 || Math.Abs(yaw) > 1e-4;
        if (hasAxis) {
            _analogOverride = true;
            PendingCmd = PendingCmd with {
                Pitch = Math.Clamp(pitch, -1.0, 1.0),
                Roll = Math.Clamp(roll, -1.0, 1.0),
                Yaw = Math.Clamp(yaw, -1.0, 1.0),
            };
        } else if (_analogOverride) {
            _analogOverride = false;
            PendingCmd = PendingCmd with { Pitch = 0.0, Roll = 0.0, Yaw = 0.0 };
        }
        if (throttleOverride && double.IsFinite(throttle01))
            PendingCmd = PendingCmd with { Throttle = Math.Clamp(throttle01, 0.0, 1.0) };
        if (triggerDown >= 0)
            PendingCmd = PendingCmd with { DropRequested = triggerDown != 0 };
    }

    public int Advance(double deltaSeconds, int maxCompression) {
        if (Lifecycle != SimulationSession.LifecycleState.Active) return 0;
        int maxSteps = Math.Clamp(maxCompression, 1, 16) * 12;
        _accumulatorSeconds += Math.Min(deltaSeconds, 0.25);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FireBossDynamics.FixedDeltaSeconds && ticks < maxSteps) {
            if (Mission.Phase is OkanaganMissionPhase.Complete or OkanaganMissionPhase.Failed) {
                _accumulatorSeconds = 0.0;
                Lifecycle = SimulationSession.LifecycleState.Finished;
                break;
            }
            if (_keyThrottleUp && !_keyThrottleDown) {
                PendingCmd = PendingCmd with {
                    Throttle = Math.Clamp(PendingCmd.Throttle + 0.45 * FireBossDynamics.FixedDeltaSeconds, 0.0, 1.0)
                };
            } else if (_keyThrottleDown && !_keyThrottleUp) {
                PendingCmd = PendingCmd with {
                    Throttle = Math.Clamp(PendingCmd.Throttle - 0.45 * FireBossDynamics.FixedDeltaSeconds, 0.0, 1.0)
                };
            }
            AppliedCmd = AutoTrim.Apply(Mission.Aircraft, Taps.Apply(PendingCmd), FireBossDynamics.FixedDeltaSeconds);
            Mission.Step(AppliedCmd);
            _accumulatorSeconds -= FireBossDynamics.FixedDeltaSeconds;
            ticks++;
            _tick++;
        }
        if (Mission.Phase is OkanaganMissionPhase.Complete or OkanaganMissionPhase.Failed)
            Lifecycle = SimulationSession.LifecycleState.Finished;
        return ticks;
    }
}

internal sealed class SessionSlot {
    public readonly int BeatIndex;
    public readonly SimulationSession? Session;
    public readonly CobraSessionState? Cobra;
    public readonly OkanaganSessionState? Okanagan;
    public readonly ITerrainSurface? Terrain;
    public bool LastTrigger;
    public bool AnalogStickWasActive;
    public bool AnalogThrottleWasActive;

    public SessionSlot(int beatIndex, SimulationSession session, ITerrainSurface? terrain) {
        BeatIndex = beatIndex;
        Session = session;
        Terrain = terrain;
    }

    public SessionSlot(CobraSessionState cobra) {
        BeatIndex = 100;
        Cobra = cobra;
        Terrain = cobra.Terrain;
    }

    public SessionSlot(OkanaganSessionState okanagan) {
        BeatIndex = 300;
        Okanagan = okanagan;
        Terrain = new OkanaganTerrainAdapter();
    }
}

public static unsafe class NativeBridge {
    const int AbiVersion = 4;
    const double RadToDeg = 180.0 / Math.PI;
    static readonly ITerrainSurface? UkraineTheatreTerrain =
        UkraineTerrainTruth.Load() is { } theatre
            ? new TrainingTerrainApronSurface(theatre,
                marginM: 400_000.0, flatHeightM: 78.0, transitionM: 8_000.0)
            : null;
    static readonly ITerrainSurface? DefaultBeat7Terrain =
        TerrainForEnv(Beats.BuiltIn(7, Carrier.DeckConfiguration.Angled).EnvironmentIdentity);
    static readonly object SessionsLock = new();
    static readonly Dictionary<long, SessionSlot> Sessions = new();
    static long _nextHandle = 1;

    static SessionSlot? FindSlot(long handle) {
        if (handle <= 0) return null;
        lock (SessionsLock)
            return Sessions.TryGetValue(handle, out SessionSlot? slot) ? slot : null;
    }

    static void ExtractBasis(in AircraftState state, out Vec3D fwd, out Vec3D up) {
        if (state.BodyAttitude.LengthSquared > 1e-9) {
            fwd = state.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            up = state.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        } else {
            fwd = state.ForwardDir();
            up = new Vec3D(0.0, 1.0, 0.0);
        }
    }

    static ITerrainSurface? TerrainForEnv(in MissionEnvironmentContract env) {
        if (!StringComparer.Ordinal.Equals(env.TerrainProfileId, Ukraine2030sTheatre.TerrainProfileId))
            return null;
        if (UkraineTheatreTerrain is not { } theatre)
            return null;
        return new TranslatedTerrainSurface(
            theatre,
            -env.TerrainSourceAnchorEastM,
            -env.TerrainSourceAnchorNorthM);
    }

    static int ContactRoleForOpponent(SimulationSession session) {
        string id = session.Beat.BanditAircraft.Id ?? "";
        if (id.Contains("mig-28", StringComparison.OrdinalIgnoreCase)) return 4;
        if (id.Contains("balloon", StringComparison.OrdinalIgnoreCase)
            || id.Contains("awacs", StringComparison.OrdinalIgnoreCase)
            || id.Contains("transport", StringComparison.OrdinalIgnoreCase))
            return 5;
        if (id.Contains("drone", StringComparison.OrdinalIgnoreCase)
            || id.Contains("ucav", StringComparison.OrdinalIgnoreCase))
            return 6;
        return 1;
    }

    static int CountContacts(SimulationSession session) {
        int count = session.OpponentPresent ? 1 + session.Wingmen.Count : 0;
        if (session.Relief is not null) count++;
        if (session.Aim9InFlight && session.Aim9Telemetry.State != Aim9FlightState.Safe) count++;
        return count;
    }

    static int CountTracers(SimulationSession session) {
        if (!session.OpponentPresent) return 0;
        int count = session.PlayerGun.RoundsInFlight.Count
            + session.FormationOpponentRoundsInFlight.Count;
        if (session.Relief?.Gun is { } reliefGun)
            count += reliefGun.RoundsInFlight.Count;
        return count;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_abi_version")]
    public static int AbiVersionExport() => AbiVersion;

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_create")]
    public static long Create(int beatIndex, int deckConfig) {
        try {
            SessionSlot slot;
            if (beatIndex == 100) {
                slot = new SessionSlot(new CobraSessionState());
            } else if (beatIndex == 300) {
                slot = new SessionSlot(new OkanaganSessionState());
            } else if (beatIndex == 200) {
                BeatSetup preview = Beats.TopGunAcm(TopGunSeat.F14A);
                ITerrainSurface? terrain = TerrainForEnv(preview.EnvironmentIdentity);
                var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled, TopGunEnvironment.Weather);
                session.StartBeatWithEnvironment(
                    () => Beats.TopGunAcm(TopGunSeat.F14A),
                    TopGunEnvironment.Weather,
                    terrain);
                slot = new SessionSlot(200, session, terrain);
            } else if (beatIndex == 105) {
                BeatSetup preview = Beats.ModernVisualMergeFirstRun();
                WeatherProfile weather = KoreaWeatherPresets.ForBeat(7);
                ITerrainSurface? terrain = TerrainForEnv(preview.EnvironmentIdentity);
                var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled, weather);
                session.StartBeatWithEnvironment(
                    Beats.ModernVisualMergeFirstRun,
                    weather,
                    terrain);
                slot = new SessionSlot(105, session, terrain);
            } else if (beatIndex is >= 101 and <= 104) {
                PracticeExercise ex = (PracticeExercise)(beatIndex - 100);
                BeatSetup preview = PracticeBeats.Create(ex);
                WeatherProfile weather = KoreaWeatherPresets.ForBeat(7);
                ITerrainSurface? terrain = TerrainForEnv(preview.EnvironmentIdentity);
                var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled, weather);
                session.StartBeatWithEnvironment(
                    () => PracticeBeats.Create(ex),
                    weather,
                    terrain);
                slot = new SessionSlot(beatIndex, session, terrain);
            } else {
                Carrier.DeckConfiguration deck = deckConfig == 1
                    ? Carrier.DeckConfiguration.Angled
                    : Carrier.DeckConfiguration.Axial;
                BeatSetup preview = Beats.BuiltIn(beatIndex, deck);
                WeatherProfile weather = KoreaWeatherPresets.ForBeat(beatIndex);
                ITerrainSurface? terrain = TerrainForEnv(preview.EnvironmentIdentity);
                var session = new SimulationSession(beatIndex, deck, weather);
                session.StartBeatWithEnvironment(beatIndex, weather, terrain, deck);
                slot = new SessionSlot(beatIndex, session, terrain);
            }
            lock (SessionsLock) {
                long handle = _nextHandle++;
                Sessions[handle] = slot;
                return handle;
            }
        } catch {
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_destroy")]
    public static void Destroy(long handle) {
        if (handle <= 0) return;
        lock (SessionsLock)
            Sessions.Remove(handle);
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_begin")]
    public static void Begin(long handle) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            if (slot.Cobra is { } cobra)
                cobra.Lifecycle = SimulationSession.LifecycleState.Active;
            else if (slot.Okanagan is { } ok)
                ok.Lifecycle = SimulationSession.LifecycleState.Active;
            else
                slot.Session?.Begin();
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_restart")]
    public static void Restart(long handle) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.LastTrigger = false;
            slot.AnalogStickWasActive = false;
            slot.AnalogThrottleWasActive = false;
            if (slot.Cobra is { } cobra)
                cobra.Restart();
            else if (slot.Okanagan is { } ok)
                ok.Restart();
            else
                slot.Session?.Restart();
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_paused")]
    public static void SetPaused(long handle, int paused) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            if (slot.Cobra is { } cobra) {
                if (cobra.Lifecycle != SimulationSession.LifecycleState.Finished)
                    cobra.Lifecycle = paused != 0
                        ? SimulationSession.LifecycleState.Paused
                        : SimulationSession.LifecycleState.Active;
            } else if (slot.Okanagan is { } ok) {
                ok.SetPaused(paused != 0);
            } else {
                slot.Session?.SetPaused(paused != 0);
            }
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_request_rtb")]
    public static int RequestRtb(long handle) {
        if (FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Cobra is not null) return 1;
            if (slot.Okanagan is not null) return 0;
            return slot.Session is { } session && session.TryRequestReturnToBase() ? 1 : 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_end_sortie")]
    public static int EndSortie(long handle) {
        if (FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Cobra is { } cobra) {
                cobra.Lifecycle = SimulationSession.LifecycleState.Finished;
                return 1;
            }
            if (slot.Okanagan is { } ok) {
                ok.Lifecycle = SimulationSession.LifecycleState.Finished;
                return 1;
            }
            return slot.Session is { } session && session.TryEndSortie() ? 1 : 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_controls")]
    public static void SetControls(
        long handle,
        double roll,
        double pitch,
        double yaw,
        double throttle01,
        int throttleOverride,
        int triggerDown) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            if (slot.Cobra is { } cobra) {
                if (double.IsFinite(roll)) cobra.PilotRightCyclic = Math.Clamp(roll, -1.0, 1.0);
                if (double.IsFinite(pitch)) cobra.PilotForwardCyclic = Math.Clamp(pitch, -1.0, 1.0);
                if (double.IsFinite(yaw)) cobra.PilotYaw = Math.Clamp(yaw, -1.0, 1.0);
                if (throttleOverride != 0 && double.IsFinite(throttle01)) {
                    double t = Math.Clamp(throttle01, 0.0, 1.0);
                    cobra.PilotClimbCmd = (t - 0.5) * 2.0;
                    cobra.RawCollective = t;
                }
                if (triggerDown >= 0) cobra.EngagementConsent = triggerDown != 0;
                return;
            }
            if (slot.Okanagan is { } ok) {
                ok.SetAnalogControls(roll, pitch, yaw, throttle01, throttleOverride != 0, triggerDown);
                return;
            }

            SimulationSession session = slot.Session!;
            double r = double.IsFinite(roll) ? Math.Clamp(roll, -1.0, 1.0) : 0.0;
            double p = double.IsFinite(pitch) ? Math.Clamp(pitch, -1.0, 1.0) : 0.0;
            double y = double.IsFinite(yaw) ? Math.Clamp(yaw, -1.0, 1.0) : 0.0;
            bool stickActive = Math.Abs(r) > 1e-4 || Math.Abs(p) > 1e-4 || Math.Abs(y) > 1e-4;
            if (stickActive) {
                slot.AnalogStickWasActive = true;
                session.SetAnalogRollControl(r);
                session.SetAnalogPitchControl(p);
                session.SetAnalogYawControl(y);
            } else if (slot.AnalogStickWasActive) {
                slot.AnalogStickWasActive = false;
                session.Controls.ClearAnalogRollControl();
                session.Controls.ClearAnalogPitchControl();
                session.Controls.ClearAnalogYawControl();
            }

            if (throttleOverride != 0 && double.IsFinite(throttle01)) {
                slot.AnalogThrottleWasActive = true;
                session.SetAnalogThrottleControl(Math.Clamp(throttle01, 0.0, 1.0));
            } else if (slot.AnalogThrottleWasActive) {
                slot.AnalogThrottleWasActive = false;
                session.Controls.ClearAnalogThrottleControl();
            }

            if (triggerDown >= 0) {
                bool wantTrigger = triggerDown != 0;
                if (wantTrigger != slot.LastTrigger) {
                    slot.LastTrigger = wantTrigger;
                    session.FeedKey(GKey.Trigger, wantTrigger);
                }
            }
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_feed_key")]
    public static void FeedKey(long handle, int gkey, int pressed) {
        if (FindSlot(handle) is not { } slot) return;
        if (gkey < (int)GKey.PullUp || gkey > (int)GKey.TimeCompressionToggle) return;
        lock (slot) {
            if (slot.Cobra is { } cobra) {
                cobra.FeedKey(gkey, pressed != 0);
                return;
            }
            if (slot.Okanagan is { } ok) {
                ok.FeedKey(gkey, pressed != 0);
                return;
            }
            GKey key = (GKey)gkey;
            if (key == GKey.Trigger) slot.LastTrigger = pressed != 0;
            slot.Session?.FeedKey(key, pressed != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_assisted_flight")]
    public static void SetAssistedFlight(long handle, int enabled) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            if (slot.Cobra is { } cobra)
                cobra.SetAssistedScas(enabled != 0);
            else if (slot.Okanagan is { } ok)
                ok.PendingCmd = ok.AutoTrim.SetEnabled(enabled != 0, ok.PendingCmd);
            else
                slot.Session?.SetAssistedFlight(enabled != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_auto_gcas")]
    public static void SetAutoGcas(long handle, int enabled) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.Session?.SetAutoGcasEnabled(enabled != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_padlock_roll_assist")]
    public static void SetPadlockRollAssist(long handle, int enabled) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.Session?.SetPlayerGunTargetPadlockRollAssist(enabled != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_advance")]
    public static int Advance(long handle, double deltaSeconds, int maxCompression) {
        if (FindSlot(handle) is not { } slot) return 0;
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0) return 0;
        lock (slot) {
            if (slot.Cobra is { } cobra)
                return cobra.Advance(deltaSeconds, maxCompression);
            if (slot.Okanagan is { } ok)
                return ok.Advance(deltaSeconds, maxCompression);
            return slot.Session!.Advance(deltaSeconds, Math.Clamp(maxCompression, 1, 16));
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_frame")]
    public static int ReadFrame(long handle, GunsSimFrame* outFrame) {
        if (outFrame is null || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Cobra is { } cobra) {
                *outFrame = default;
                CobraMissionRuntime runtime = cobra.Runtime;
                CobraGroundWarRuntime gw = runtime.GroundWar;
                PlayerVehicleObservation obs = runtime.Cobra.Observation;
                PlayerVehicleState vs = runtime.Cobra.State;
                Vec3D pos = obs.PositionWorldM;
                Vec3D vel = obs.GroundVelocityMps;
                QuaternionD q = vs.BodyAttitude.Normalized();
                Vec3D fwd = q.LengthSquared > 1e-9 ? q.Rotate(new Vec3D(0.0, 0.0, 1.0)) : new Vec3D(Math.Sin(obs.YawRad), 0.0, Math.Cos(obs.YawRad));
                Vec3D up = q.LengthSquared > 1e-9 ? q.Rotate(new Vec3D(0.0, 1.0, 0.0)) : new Vec3D(0.0, 1.0, 0.0);
                double tasMps = obs.TrueAirspeedMps;
                double kcas = tasMps * AirData.MpsToKnots;
                double groundH = cobra.SampleGroundHeightM(pos.X, pos.Z);
                CobraBattleDamageState bd = runtime.BattleDamage;
                double health = !obs.Flyable ? 0.0 : Math.Clamp(
                    1.0 - bd.DamagingHits * 0.25 - (bd.ScasDamaged ? 0.15 : 0.0) - (bd.EngineDamaged ? 0.25 : 0.0),
                    0.15,
                    1.0);
                int liveHostiles = 0;
                foreach (GroundUnit unit in gw.Units)
                    if (unit.IsAlive && unit.Faction == GroundFaction.Hostile) liveHostiles++;
                int tracers = cobra.TurretTracers.Count + cobra.Rockets.Count;
                foreach (CobraThreatBurstEvent burst in runtime.RecentThreatBursts) {
                    if (cobra.ElapsedSeconds >= burst.FiredAtSeconds && cobra.ElapsedSeconds <= burst.ImpactAtSeconds)
                        tracers++;
                }
                int outcome = (runtime.Status == CobraMissionStatus.Victory || gw.MissionOutcome == HoldTheBridgeOutcome.Victory)
                    ? (int)SortieOutcome.Victory
                    : (runtime.Status is CobraMissionStatus.Defeat
                        or CobraMissionStatus.ObstacleCollision
                        or CobraMissionStatus.TerrainUnavailable
                        or CobraMissionStatus.VehicleAuthorityLost
                        or CobraMissionStatus.FobCombatIneffective
                        || gw.MissionOutcome == HoldTheBridgeOutcome.Defeat)
                        ? (int)SortieOutcome.Defeat
                        : (int)SortieOutcome.None;

                outFrame->sim_time_s = cobra.ElapsedSeconds;
                outFrame->tick = Math.Max(0, vs.Tick);
                outFrame->pos_east_m = pos.X;
                outFrame->pos_up_m = pos.Y;
                outFrame->pos_north_m = pos.Z;
                outFrame->vel_east_mps = vel.X;
                outFrame->vel_up_mps = vel.Y;
                outFrame->vel_north_mps = vel.Z;
                outFrame->fwd_east = fwd.X;
                outFrame->fwd_up = fwd.Y;
                outFrame->fwd_north = fwd.Z;
                outFrame->up_east = up.X;
                outFrame->up_up = up.Y;
                outFrame->up_north = up.Z;
                outFrame->speed_mps = tasMps;
                outFrame->kcas = kcas;
                outFrame->mach = tasMps / 340.3;
                outFrame->alpha_deg = obs.PitchRad * RadToDeg;
                outFrame->nz_g = 1.0 + Math.Max(0.0, cobra.LastAppliedCollective * 1.15);
                outFrame->throttle01 = Math.Clamp(cobra.LastAppliedCollective, 0.0, 1.0);
                outFrame->fuel_lb = Math.Max(1, gw.Magazine.RoundsRemaining) * 0.25;
                outFrame->player_health = health;
                outFrame->lifecycle = (int)cobra.Lifecycle;
                outFrame->outcome = outcome;
                outFrame->player_alive = obs.Flyable ? 1 : 0;
                outFrame->weight_on_wheels = (obs.Contact.Kind != VehicleContactKind.Airborne || (pos.Y - groundH) < 2.2) ? 1 : 0;
                outFrame->ammo_remaining = gw.Magazine.RoundsRemaining;
                outFrame->rounds_fired = gw.Debrief.RoundsExpended;
                outFrame->live_opponent_count = liveHostiles;
                outFrame->relief_kills = gw.Debrief.HostileKillsByPlayer + cobra.RocketKills;
                outFrame->contact_count = gw.Units.Count;
                outFrame->tracer_count = tracers;
                return 1;
            }

            if (slot.Okanagan is { } ok) {
                *outFrame = default;
                OkanaganMissionSnapshot snap = ok.Mission.Snapshot();
                FireBossTelemetry t = snap.Aircraft;
                QuaternionD q = t.BodyAttitude.Normalized();
                Vec3D fwd = q.LengthSquared > 1e-9 ? q.Rotate(new Vec3D(0.0, 0.0, 1.0)) : new Vec3D(Math.Sin(t.HeadingRad), 0.0, Math.Cos(t.HeadingRad));
                Vec3D up = q.LengthSquared > 1e-9 ? q.Rotate(new Vec3D(0.0, 1.0, 0.0)) : new Vec3D(0.0, 1.0, 0.0);
                double speedMps = t.TrueAirspeedMps;
                outFrame->sim_time_s = snap.MissionSeconds;
                outFrame->tick = ok.Tick;
                outFrame->pos_east_m = t.PositionWorldM.X;
                outFrame->pos_up_m = t.PositionWorldM.Y;
                outFrame->pos_north_m = t.PositionWorldM.Z;
                outFrame->vel_east_mps = t.GroundVelocityMps.X;
                outFrame->vel_up_mps = t.GroundVelocityMps.Y;
                outFrame->vel_north_mps = t.GroundVelocityMps.Z;
                outFrame->fwd_east = fwd.X;
                outFrame->fwd_up = fwd.Y;
                outFrame->fwd_north = fwd.Z;
                outFrame->up_east = up.X;
                outFrame->up_up = up.Y;
                outFrame->up_north = up.Z;
                outFrame->speed_mps = speedMps;
                outFrame->kcas = speedMps * AirData.MpsToKnots;
                outFrame->mach = speedMps / 340.3;
                outFrame->alpha_deg = t.AngleOfAttackRad * RadToDeg;
                outFrame->nz_g = t.LoadFactor;
                outFrame->throttle01 = Math.Clamp(t.EnginePowerFraction, 0.0, 1.0);
                outFrame->gear_down01 = t.ScoopsCommanded ? 1.0 : 0.0;
                outFrame->fuel_lb = t.FuelKg * 2.20462;
                outFrame->player_health = t.Flyable ? 1.0 : 0.0;
                outFrame->lifecycle = (int)ok.Lifecycle;
                outFrame->outcome = snap.Phase == OkanaganMissionPhase.Complete
                    ? (int)SortieOutcome.Victory
                    : snap.Phase == OkanaganMissionPhase.Failed
                        ? (int)SortieOutcome.Defeat
                        : (int)SortieOutcome.None;
                outFrame->player_alive = t.Flyable ? 1 : 0;
                outFrame->weight_on_wheels = t.SurfaceMode != FireBossSurfaceMode.Airborne ? 1 : 0;
                outFrame->ammo_remaining = (int)Math.Round(t.WaterLoadKg);
                outFrame->relief_kills = snap.EffectiveDrops;
                if (snap.Route.Count > 0 && snap.ActiveGateIndex < snap.Route.Count) {
                    OkanaganRouteGate g = snap.Route[snap.ActiveGateIndex];
                    outFrame->guidance_active = 1;
                    outFrame->guidance_next_alt_m = g.PositionWorldM.Y;
                    outFrame->guidance_next_tas_mps = g.TargetSpeedMps;
                    outFrame->guidance_gate_count = snap.Route.Count;
                }
                return 1;
            }

            SimulationSession session = slot.Session!;
            AircraftSim player = session.Player;
            AircraftState s = session.Catapult.IsActive ? session.Catapult.State : player.State;
            Vec3D posA = session.Arrestment.IsActive && !session.Catapult.IsActive
                ? session.Arrestment.Position
                : s.Position;
            Vec3D velA = s.VelocityVector();
            ExtractBasis(s, out Vec3D fwdA, out Vec3D upA);

            double tasMpsA = player.AirspeedMps;
            IAtmosphereModel atmo = player.AtmosphereModel;
            double speedOfSound = Math.Max(atmo.Sample(posA.Y).SpeedOfSoundMps, 1e-6);
            double iasKts = player.IndicatedAirspeedMps * AirData.MpsToKnots;
            double machA = tasMpsA / speedOfSound;
            AirframeSystems systems = session.PlayerSystems;
            double flaps01 = systems.FullFlapDegrees > 1e-3
                ? Math.Clamp((systems.LeftFlapDegrees + systems.RightFlapDegrees)
                    / (2.0 * systems.FullFlapDegrees), 0.0, 1.0)
                : 0.0;
            ApproachGuidanceState guidance = session.ApproachGuidancePlan;

            outFrame->sim_time_s = session.TimeMilliseconds * 0.001;
            outFrame->tick = session.Tick;
            outFrame->pos_east_m = posA.X;
            outFrame->pos_up_m = posA.Y;
            outFrame->pos_north_m = posA.Z;
            outFrame->vel_east_mps = velA.X;
            outFrame->vel_up_mps = velA.Y;
            outFrame->vel_north_mps = velA.Z;
            outFrame->fwd_east = fwdA.X;
            outFrame->fwd_up = fwdA.Y;
            outFrame->fwd_north = fwdA.Z;
            outFrame->up_east = upA.X;
            outFrame->up_up = upA.Y;
            outFrame->up_north = upA.Z;
            outFrame->speed_mps = tasMpsA;
            outFrame->kcas = iasKts;
            outFrame->mach = machA;
            outFrame->alpha_deg = player.AngleOfAttackRad * RadToDeg;
            outFrame->nz_g = player.LastNz;
            outFrame->throttle01 = Math.Clamp(player.LastAppliedCommand.Throttle, 0.0, 1.5);
            outFrame->speedbrake01 = Math.Clamp(player.SpeedBrake, 0.0, 1.0);
            outFrame->gear_down01 = Math.Clamp(
                (systems.NoseGearPosition + systems.LeftMainGearPosition + systems.RightMainGearPosition) / 3.0,
                0.0,
                1.0);
            outFrame->flaps01 = flaps01;
            outFrame->fuel_lb = session.PlayerFuel.FuelLb;
            outFrame->player_health = session.PlayerHealth;
            outFrame->guidance_next_alt_m = guidance.NextAltitudeM;
            outFrame->guidance_next_tas_mps = guidance.NextTrueAirspeedMps;
            outFrame->guidance_power01 = guidance.Power01;
            outFrame->lifecycle = (int)session.Lifecycle;
            outFrame->outcome = (int)session.Outcome;
            outFrame->player_alive = session.PlayerAlive ? 1 : 0;
            outFrame->player_rtb_active = session.PlayerRtbActive ? 1 : 0;
            outFrame->rtb_available = session.ReturnToBaseAvailable ? 1 : 0;
            outFrame->can_end_sortie = session.CanEndSortie ? 1 : 0;
            outFrame->weight_on_wheels = session.RunwayWeightOnWheels ? 1 : 0;
            outFrame->runway_phase = (int)session.ConventionalRunwayPhase;
            outFrame->buffet = player.Buffet ? 1 : 0;
            outFrame->ammo_remaining = session.OpponentPresent ? session.PlayerGun.AmmoRemaining : 0;
            outFrame->rounds_fired = session.SortiePlayerRoundsFired;
            outFrame->live_opponent_count = session.LiveOpponentCount;
            outFrame->relief_kills = session.ReliefKills;
            outFrame->guidance_active = guidance.GuidanceActive ? 1 : 0;
            outFrame->guidance_in_groove = guidance.InGroove ? 1 : 0;
            outFrame->guidance_pattern_leg = (int)guidance.ActivePatternLeg;
            outFrame->guidance_energy_state = (int)guidance.EnergyState;
            outFrame->guidance_gate_count = guidance.Gates.Count;
            outFrame->contact_count = CountContacts(session);
            outFrame->tracer_count = CountTracers(session);
            return 1;
        }
    }

    static void WriteContact(
        GunsSimContact* dst,
        in AircraftState state,
        int role,
        bool alive,
        double health) {
        Vec3D vel = state.VelocityVector();
        ExtractBasis(state, out Vec3D fwd, out Vec3D up);
        dst->health = health;
        dst->pos_east_m = state.Position.X;
        dst->pos_up_m = state.Position.Y;
        dst->pos_north_m = state.Position.Z;
        dst->vel_east_mps = vel.X;
        dst->vel_up_mps = vel.Y;
        dst->vel_north_mps = vel.Z;
        dst->fwd_east = fwd.X;
        dst->fwd_up = fwd.Y;
        dst->fwd_north = fwd.Z;
        dst->up_east = up.X;
        dst->up_up = up.Y;
        dst->up_north = up.Z;
        dst->speed_mps = state.Speed;
        dst->role = role;
        dst->alive = alive ? 1 : 0;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_contacts")]
    public static int ReadContacts(long handle, GunsSimContact* outContacts, int maxCount) {
        if (outContacts is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Okanagan is not null) return 0;
            if (slot.Cobra is { } cobra) {
                IReadOnlyList<GroundUnit> units = cobra.Runtime.GroundWar.Units;
                int cnt = Math.Min(units.Count, maxCount);
                for (int i = 0; i < cnt; i++) {
                    GroundUnit u = units[i];
                    Vec3D toBridge = cobra.BridgeWorldM - u.PositionWorldM;
                    double hLen = Math.Sqrt(toBridge.X * toBridge.X + toBridge.Z * toBridge.Z);
                    Vec3D fwd = hLen > 2.0
                        ? new Vec3D(toBridge.X / hLen, 0.0, toBridge.Z / hLen)
                        : new Vec3D(0.0, 0.0, u.Faction == GroundFaction.Hostile ? -1.0 : 1.0);
                    int role = u.Faction == GroundFaction.Hostile
                        ? u.Role switch {
                            GroundUnitRole.SoftVehicle => 10,
                            GroundUnitRole.HardPoint => 11,
                            GroundUnitRole.DshkSite => 12,
                            _ => 13,
                        }
                        : (u.Role == GroundUnitRole.InfantryClump ? 14 : 15);
                    outContacts[i].health = u.Health / Math.Max(u.MaxHealth, 1.0);
                    outContacts[i].pos_east_m = u.PositionWorldM.X;
                    outContacts[i].pos_up_m = u.PositionWorldM.Y;
                    outContacts[i].pos_north_m = u.PositionWorldM.Z;
                    outContacts[i].vel_east_mps = 0.0;
                    outContacts[i].vel_up_mps = 0.0;
                    outContacts[i].vel_north_mps = 0.0;
                    outContacts[i].fwd_east = fwd.X;
                    outContacts[i].fwd_up = 0.0;
                    outContacts[i].fwd_north = fwd.Z;
                    outContacts[i].up_east = 0.0;
                    outContacts[i].up_up = 1.0;
                    outContacts[i].up_north = 0.0;
                    outContacts[i].speed_mps = u.MoveSpeedMps;
                    outContacts[i].role = role;
                    outContacts[i].alive = u.IsAlive ? 1 : 0;
                }
                return cnt;
            }

            SimulationSession session = slot.Session!;
            int written = 0;
            int oppRole = ContactRoleForOpponent(session);
            if (session.OpponentPresent && written < maxCount) {
                WriteContact(&outContacts[written++], session.Bandit.State, role: oppRole,
                    session.PrimaryOpponentAlive, session.PrimaryOpponentHealth);
                foreach (Wingman wingman in session.Wingmen) {
                    if (written >= maxCount) break;
                    WriteContact(&outContacts[written++], wingman.Bandit.State,
                        role: oppRole == 1 ? 2 : oppRole,
                        wingman.StillFighting,
                        session.PlayerGun.TargetHealthFor(wingman.PlayerGunTargetId));
                }
            }
            if (session.Relief is { } relief && written < maxCount) {
                WriteContact(&outContacts[written++], relief.State, role: 3,
                    relief.StillFighting, 1.0);
            }
            if (session.Aim9InFlight && written < maxCount) {
                Aim9Telemetry m = session.Aim9Telemetry;
                if (m.State != Aim9FlightState.Safe) {
                    Vec3D mv = m.Velocity;
                    double spd = mv.Length;
                    Vec3D fwd = spd > 1e-3 ? mv * (1.0 / spd) : new Vec3D(0.0, 0.0, 1.0);
                    outContacts[written].health = 1.0;
                    outContacts[written].pos_east_m = m.Position.X;
                    outContacts[written].pos_up_m = m.Position.Y;
                    outContacts[written].pos_north_m = m.Position.Z;
                    outContacts[written].vel_east_mps = mv.X;
                    outContacts[written].vel_up_mps = mv.Y;
                    outContacts[written].vel_north_mps = mv.Z;
                    outContacts[written].fwd_east = fwd.X;
                    outContacts[written].fwd_up = fwd.Y;
                    outContacts[written].fwd_north = fwd.Z;
                    outContacts[written].up_east = 0.0;
                    outContacts[written].up_up = 1.0;
                    outContacts[written].up_north = 0.0;
                    outContacts[written].speed_mps = spd;
                    outContacts[written].role = 7;
                    outContacts[written].alive = 1;
                    written++;
                }
            }
            return written;
        }
    }

    static void WriteTracer(GunsSimTracer* dst, in GunRound round, int friendly) {
        dst->pos_east_m = round.Position.X;
        dst->pos_up_m = round.Position.Y;
        dst->pos_north_m = round.Position.Z;
        dst->vel_east_mps = round.Velocity.X;
        dst->vel_up_mps = round.Velocity.Y;
        dst->vel_north_mps = round.Velocity.Z;
        dst->age_s = round.AgeSeconds;
        dst->id = round.Id;
        dst->friendly = friendly;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_tracers")]
    public static int ReadTracers(long handle, GunsSimTracer* outTracers, int maxCount) {
        if (outTracers is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Okanagan is not null) return 0;
            if (slot.Cobra is { } cobra) {
                int w = 0;
                foreach (CobraSessionState.HydraRocket rk in cobra.Rockets) {
                    if (w >= maxCount) return w;
                    outTracers[w].pos_east_m = rk.Pos.X;
                    outTracers[w].pos_up_m = rk.Pos.Y;
                    outTracers[w].pos_north_m = rk.Pos.Z;
                    outTracers[w].vel_east_mps = rk.Vel.X;
                    outTracers[w].vel_up_mps = rk.Vel.Y;
                    outTracers[w].vel_north_mps = rk.Vel.Z;
                    outTracers[w].age_s = rk.AgeS;
                    outTracers[w].id = rk.Id;
                    outTracers[w].friendly = 2;
                    w++;
                }
                foreach (CobraSessionState.TurretTracer tr in cobra.TurretTracers) {
                    if (w >= maxCount) return w;
                    outTracers[w].pos_east_m = tr.Pos.X;
                    outTracers[w].pos_up_m = tr.Pos.Y;
                    outTracers[w].pos_north_m = tr.Pos.Z;
                    outTracers[w].vel_east_mps = tr.Vel.X;
                    outTracers[w].vel_up_mps = tr.Vel.Y;
                    outTracers[w].vel_north_mps = tr.Vel.Z;
                    outTracers[w].age_s = tr.AgeS;
                    outTracers[w].id = tr.Id;
                    outTracers[w].friendly = 1;
                    w++;
                }
                foreach (CobraThreatBurstEvent burst in cobra.Runtime.RecentThreatBursts) {
                    if (w >= maxCount) return w;
                    if (cobra.ElapsedSeconds < burst.FiredAtSeconds || cobra.ElapsedSeconds > burst.ImpactAtSeconds)
                        continue;
                    double dur = Math.Max(burst.ImpactAtSeconds - burst.FiredAtSeconds, 0.05);
                    double t = Math.Clamp((cobra.ElapsedSeconds - burst.FiredAtSeconds) / dur, 0.0, 1.0);
                    Vec3D p = burst.SourceWorldM + (burst.ImpactWorldM - burst.SourceWorldM) * t;
                    Vec3D v = (burst.ImpactWorldM - burst.SourceWorldM) * (1.0 / dur);
                    outTracers[w].pos_east_m = p.X;
                    outTracers[w].pos_up_m = p.Y;
                    outTracers[w].pos_north_m = p.Z;
                    outTracers[w].vel_east_mps = v.X;
                    outTracers[w].vel_up_mps = v.Y;
                    outTracers[w].vel_north_mps = v.Z;
                    outTracers[w].age_s = t * dur;
                    outTracers[w].id = unchecked((int)(burst.Sequence & 0x7FFF_FFFF));
                    outTracers[w].friendly = 0;
                    w++;
                }
                return w;
            }

            SimulationSession session = slot.Session!;
            if (!session.OpponentPresent) return 0;
            int written = 0;
            foreach (GunRound round in session.PlayerGun.RoundsInFlight) {
                if (written >= maxCount) return written;
                WriteTracer(&outTracers[written++], round, friendly: 1);
            }
            if (session.Relief?.Gun is { } reliefGun) {
                foreach (GunRound round in reliefGun.RoundsInFlight) {
                    if (written >= maxCount) return written;
                    WriteTracer(&outTracers[written++], round, friendly: 1);
                }
            }
            foreach (GunRound round in session.FormationOpponentRoundsInFlight) {
                if (written >= maxCount) return written;
                WriteTracer(&outTracers[written++], round, friendly: 0);
            }
            return written;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_gates")]
    public static int ReadGates(long handle, GunsSimApproachGate* outGates, int maxCount) {
        if (outGates is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Okanagan is { } ok) {
                OkanaganMissionSnapshot snap = ok.Mission.Snapshot();
                int cnt = Math.Min(snap.Route.Count, maxCount);
                for (int i = 0; i < cnt; i++) {
                    OkanaganRouteGate g = snap.Route[i];
                    outGates[i].east_m = g.PositionWorldM.X;
                    outGates[i].north_m = g.PositionWorldM.Z;
                    outGates[i].up_m = g.PositionWorldM.Y;
                    outGates[i].half_m = g.RadiusM;
                    outGates[i].target_alt_m = g.PositionWorldM.Y;
                    outGates[i].target_ktas = g.TargetSpeedMps * AirData.MpsToKnots;
                    outGates[i].distance_to_go_m = (g.PositionWorldM - snap.Aircraft.PositionWorldM).Length;
                    outGates[i].pattern_leg = 0;
                    outGates[i].dirty_config = 0;
                    outGates[i].active = i == snap.ActiveGateIndex ? 1 : 0;
                    outGates[i].reserved0 = 0;
                }
                return cnt;
            }
            if (slot.Session is not { } session) return 0;
            IReadOnlyList<WorldApproachGate> gates = session.ApproachGuidancePlan.Gates;
            int written = Math.Min(gates.Count, maxCount);
            for (int i = 0; i < written; i++) {
                WorldApproachGate g = gates[i];
                outGates[i].east_m = g.EastM;
                outGates[i].north_m = g.NorthM;
                outGates[i].up_m = g.UpM;
                outGates[i].half_m = g.HalfM;
                outGates[i].target_alt_m = g.TargetAltitudeM;
                outGates[i].target_ktas = g.TargetKtas;
                outGates[i].distance_to_go_m = g.DistanceToGoM;
                outGates[i].pattern_leg = (int)g.PatternLeg;
                outGates[i].dirty_config = g.DirtyConfig ? 1 : 0;
                outGates[i].active = g.Active ? 1 : 0;
                outGates[i].reserved0 = 0;
            }
            return written;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_runway")]
    public static int ReadRunway(long handle, GunsSimRunway* outRunway) {
        if (outRunway is null || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Okanagan is not null) {
                Vec3D northTh = OkanaganGeo.ToWorld(49.9670, -119.3778, OkanaganGeo.KelownaRunwayElevationM);
                outRunway->threshold_east_m = northTh.X;
                outRunway->threshold_up_m = northTh.Y;
                outRunway->threshold_north_m = northTh.Z;
                outRunway->heading_rad = 160.0 * Math.PI / 180.0;
                outRunway->length_m = 2_710.0;
                outRunway->width_m = 60.0;
                outRunway->touchdown_aim_along_m = 300.0;
                outRunway->present = 1;
                outRunway->reserved0 = 0;
                return 1;
            }
            ConventionalRunway? runway = slot.Session?.ConventionalRunwayRecovery?.Runway;
            if (runway is null) {
                if (slot.Session?.Carrier is { IsMaritime: false } strip) {
                    double sinH = Math.Sin(strip.HeadingRad);
                    double cosH = Math.Cos(strip.HeadingRad);
                    double halfL = strip.DeckLengthM * 0.5;
                    outRunway->threshold_east_m = strip.Position.X - sinH * halfL;
                    outRunway->threshold_up_m = strip.Position.Y;
                    outRunway->threshold_north_m = strip.Position.Z - cosH * halfL;
                    outRunway->heading_rad = strip.HeadingRad;
                    outRunway->length_m = strip.DeckLengthM;
                    outRunway->width_m = strip.DeckHalfWidthM * 2.0;
                    outRunway->touchdown_aim_along_m = halfL;
                    outRunway->present = 1;
                    outRunway->reserved0 = 0;
                    return 1;
                }
                *outRunway = default;
                return 0;
            }
            outRunway->threshold_east_m = runway.Threshold.X;
            outRunway->threshold_up_m = runway.Threshold.Y;
            outRunway->threshold_north_m = runway.Threshold.Z;
            outRunway->heading_rad = runway.HeadingRad;
            outRunway->length_m = runway.LengthM;
            outRunway->width_m = runway.WidthM;
            outRunway->touchdown_aim_along_m = runway.TouchdownAimAlongM;
            outRunway->present = 1;
            outRunway->reserved0 = 0;
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_course")]
    public static int ReadCourse(long handle, GunsSimCourseState* outCourse) {
        if (outCourse is null || FindSlot(handle) is not { } slot) return 0;
        *outCourse = default;
        lock (slot) {
            if (slot.Cobra is { } cobra) {
                outCourse->kills = cobra.Runtime.GroundWar.Debrief.HostileKillsByPlayer + cobra.RocketKills;
                outCourse->sortie_hits = cobra.Runtime.GroundWar.Debrief.RoundsExpended;
                outCourse->combat_complete = cobra.Lifecycle == SimulationSession.LifecycleState.Finished ? 1 : 0;
                return 1;
            }
            if (slot.Okanagan is { } ok) {
                OkanaganMissionSnapshot snap = ok.Mission.Snapshot();
                outCourse->kills = snap.EffectiveDrops;
                outCourse->sortie_hits = snap.CompletedCycles;
                outCourse->combat_complete = snap.Phase == OkanaganMissionPhase.Complete ? 1 : 0;
                return 1;
            }

            SimulationSession session = slot.Session!;
            AircraftState playerState = session.Catapult.IsActive
                ? session.Catapult.State : session.Player.State;
            Vec3D playerPos = playerState.Position;
            ConventionalRunway? runway = session.ConventionalRunwayRecovery?.Runway;
            F22OverheadCourse course = session.F22Course;

            outCourse->armed = course.Armed ? 1 : 0;
            outCourse->complete = course.Complete ? 1 : 0;
            outCourse->next_gate_index = course.NextGateIndex;
            outCourse->next_gate_needs_gear = course.NextGateNeedsGear ? 1 : 0;
            outCourse->autothrottle_active = session.RecoveryAutothrottleEngaged ? 1 : 0;

            RunwayTouchdownResult touchdown = session.RunwayTouchdown;
            outCourse->touchdown_contact = touchdown.Contact ? 1 : 0;
            outCourse->touchdown_survivable = touchdown.Survivable ? 1 : 0;
            outCourse->kills = session.KillCount;
            outCourse->sortie_hits = session.SortiePlayerHits;
            outCourse->combat_complete = session.FiniteCombatComplete ? 1 : 0;

            if (runway is not null) {
                Vec3D aim = runway.TouchdownAimPoint;
                Vec3D rel = playerPos - aim;
                double horiz = Math.Sqrt(rel.X * rel.X + rel.Z * rel.Z);
                outCourse->glideslope_deg = horiz > 1.0
                    ? Math.Atan2(rel.Y, horiz) * RadToDeg : 0.0;
                outCourse->runway_dist_nm = rel.Length / 1852.0;
                outCourse->cross_track_m = runway.Frame(playerPos).cross;
            }

            IReadOnlyList<CourseGateRecord> records = course.Records;
            outCourse->total_gates = records.Count;
            int gradeSlots = Math.Min(records.Count, 7);
            int passed = 0;
            for (int i = 0; i < gradeSlots; i++) {
                int gradeVal = (int)records[i].Grade;
                outCourse->gate_grades[i] = gradeVal;
                if (records[i].Grade == CourseGateGrade.Pass) passed++;
            }
            outCourse->passed_gates = passed;

            if (course.Armed && !course.Complete) {
                CoursePoint carrot = course.Carrot;
                if (carrot.Position.Dot(carrot.Position) > 1e-6 && double.IsFinite(carrot.Position.X)) {
                    outCourse->carrot_valid = 1;
                    outCourse->carrot_east_m = carrot.Position.X;
                    outCourse->carrot_up_m = carrot.Position.Y;
                    outCourse->carrot_north_m = carrot.Position.Z;
                    outCourse->carrot_target_kcas = carrot.TargetCalibratedMps * AirData.MpsToKnots;
                    double leadS = Math.Max(course.CarrotLeadSeconds_, 1.0);
                    Vec3D pred = F22OverheadCourse.Predictor(playerState, leadS);
                    outCourse->predictor_east_m = pred.X;
                    outCourse->predictor_up_m = pred.Y;
                    outCourse->predictor_north_m = pred.Z;
                }

                CourseGate nextGate = course.NextGate;
                if (!string.IsNullOrEmpty(nextGate.Id)) {
                    outCourse->next_gate_dist_nm = (nextGate.Position - playerPos).Length / 1852.0;
                    outCourse->next_gate_alt_ft = nextGate.Position.Y / F22OverheadCourse.FeetToM;
                    outCourse->next_gate_kcas = nextGate.TargetCalibratedMps * AirData.MpsToKnots;
                } else if (runway is not null) {
                    outCourse->next_gate_dist_nm = outCourse->runway_dist_nm;
                    outCourse->next_gate_alt_ft = runway.Threshold.Y / F22OverheadCourse.FeetToM;
                    double autoMps = course.AutothrottleTargetCalibratedMps;
                    outCourse->next_gate_kcas = double.IsFinite(autoMps)
                        ? autoMps * AirData.MpsToKnots : 138.0;
                }
            }
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_lead_cue")]
    public static int ReadLeadCue(long handle, GunsSimLeadCue* outLead) {
        if (outLead is null || FindSlot(handle) is not { } slot) return 0;
        *outLead = default;
        lock (slot) {
            if (slot.Okanagan is not null) return 1;
            if (slot.Cobra is { } cobra) {
                if (string.IsNullOrWhiteSpace(cobra.SelectedTargetId)) return 1;
                GroundUnit? unit = cobra.Runtime.GroundWar.FindUnit(cobra.SelectedTargetId);
                if (unit is not { IsAlive: true }) return 1;
                PlayerVehicleObservation obs = cobra.Runtime.Cobra.Observation;
                Vec3D aim = CobraGunTargeting.AimPoint(unit.PositionWorldM);
                Vec3D delta = aim - obs.PositionWorldM;
                double dist = Math.Max(delta.Length, 1.0);
                Vec3D dir = delta * (1.0 / dist);
                CobraGunTargetAssessment assess = CobraGunTargeting.Assess(obs.PositionWorldM, obs.YawRad, aim);
                outLead->lead_east_m = aim.X;
                outLead->lead_up_m = aim.Y;
                outLead->lead_north_m = aim.Z;
                outLead->lead_dir_east = dir.X;
                outLead->lead_dir_up = dir.Y;
                outLead->lead_dir_north = dir.Z;
                outLead->lead_tof_s = dist / 680.0;
                outLead->range_m = dist;
                outLead->has_lead_solution = (assess.WithinTurretEnvelope && assess.HasBallisticSolution) ? 1 : 0;
                outLead->gun_solution = cobra.GunnerDecision.FireAuthorized ? 1 : 0;
                outLead->in_gun_window = assess.WithinTurretEnvelope ? 1 : 0;
                return 1;
            }

            SimulationSession session = slot.Session!;
            if (!session.OpponentPresent) return 1;
            AircraftState targetState = session.SelectedOpponentState;
            AircraftState playerState = session.Catapult.IsActive
                ? session.Catapult.State : session.Player.State;
            GunKill gun = session.PlayerGun;
            outLead->lead_east_m = gun.LeadPipper.X;
            outLead->lead_up_m = gun.LeadPipper.Y;
            outLead->lead_north_m = gun.LeadPipper.Z;
            outLead->lead_dir_east = gun.LeadDirection.X;
            outLead->lead_dir_up = gun.LeadDirection.Y;
            outLead->lead_dir_north = gun.LeadDirection.Z;
            outLead->lead_tof_s = gun.LeadTimeOfFlight;
            outLead->range_m = (targetState.Position - playerState.Position).Length;
            outLead->has_lead_solution = gun.HasLeadSolution ? 1 : 0;
            outLead->gun_solution = !session.WeaponsInhibited && gun.GunSolution ? 1 : 0;
            outLead->in_gun_window = !session.WeaponsInhibited
                && CameraSolver.GunWindow(playerState, targetState) ? 1 : 0;
            outLead->weapons_inhibited = session.WeaponsInhibited ? 1 : 0;
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_sample_terrain_m")]
    public static int SampleTerrainMeters(long handle, double eastM, double northM, double* outHeightM) {
        if (outHeightM is null) return 0;
        ITerrainSurface? terrain = FindSlot(handle)?.Terrain ?? DefaultBeat7Terrain;
        if (terrain is not null && terrain.TryHeightM(eastM, northM, out double h) && double.IsFinite(h)) {
            *outHeightM = h;
            return 1;
        }
        *outHeightM = 0.0;
        return 0;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_sample_terrain_grid")]
    public static int SampleTerrainGrid(
        long handle,
        double minEastM,
        double minNorthM,
        double stepM,
        int countEast,
        int countNorth,
        float* outHeightsM) {
        if (outHeightsM is null || countEast <= 0 || countNorth <= 0
            || !double.IsFinite(stepM) || stepM <= 0.0)
            return 0;
        ITerrainSurface? terrain = FindSlot(handle)?.Terrain ?? DefaultBeat7Terrain;
        int idx = 0;
        for (int inorth = 0; inorth < countNorth; inorth++) {
            double northM = minNorthM + inorth * stepM;
            for (int ieast = 0; ieast < countEast; ieast++) {
                double eastM = minEastM + ieast * stepM;
                double h = 0.0;
                if (terrain is not null && terrain.TryHeightM(eastM, northM, out double sampled)
                    && double.IsFinite(sampled))
                    h = sampled;
                outHeightsM[idx++] = (float)h;
            }
        }
        return idx;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_cobra_state")]
    public static int ReadCobraState(long handle, GunsSimCobraState* outCobra) {
        if (outCobra is null || FindSlot(handle) is not { } slot) return 0;
        *outCobra = default;
        lock (slot) {
            if (slot.Cobra is not { } cobra) {
                outCobra->active = 0;
                return 1;
            }
            CobraMissionRuntime runtime = cobra.Runtime;
            CobraGroundWarRuntime gw = runtime.GroundWar;
            PlayerVehicleObservation obs = runtime.Cobra.Observation;
            RotorcraftTelemetry tel = runtime.Cobra.Telemetry;
            double groundH = cobra.SampleGroundHeightM(obs.PositionWorldM.X, obs.PositionWorldM.Z);

            outCobra->main_rotor_rpm = tel.MainRotorRpm;
            outCobra->rotor_azimuth_rad = tel.RotorAzimuthRad;
            outCobra->torque_fraction = tel.TransmissionLimitFraction;
            outCobra->agl_m = obs.PositionWorldM.Y - groundH;
            outCobra->vertical_speed_mps = obs.VerticalSpeedMps;
            outCobra->collective01 = cobra.LastAppliedCollective;

            if (!string.IsNullOrWhiteSpace(cobra.SelectedTargetId)
                && gw.FindUnit(cobra.SelectedTargetId) is { IsAlive: true } target) {
                Vec3D aim = CobraGunTargeting.AimPoint(target.PositionWorldM);
                outCobra->has_target = 1;
                outCobra->target_east_m = aim.X;
                outCobra->target_up_m = aim.Y;
                outCobra->target_north_m = aim.Z;
                outCobra->target_health01 = target.Health / Math.Max(target.MaxHealth, 1.0);
            }

            Vec3D fob = gw.Fob.CentreWorldM;
            outCobra->fob_east_m = fob.X;
            outCobra->fob_up_m = fob.Y;
            outCobra->fob_north_m = fob.Z;
            outCobra->bridge_east_m = cobra.BridgeWorldM.X;
            outCobra->bridge_up_m = cobra.BridgeWorldM.Y;
            outCobra->bridge_north_m = cobra.BridgeWorldM.Z;
            outCobra->active = 1;
            outCobra->assisted_scas = cobra.AssistedScas ? 1 : 0;
            outCobra->gunner_state = (int)cobra.GunnerDecision.State;
            outCobra->gunner_fire_authorized = cobra.GunnerDecision.FireAuthorized ? 1 : 0;
            outCobra->rockets_remaining = cobra.RocketsRemaining;
            outCobra->friendly_points = gw.FriendlyPointsHeld;
            outCobra->hostile_points = gw.HostilePointsHeld;
            outCobra->friendly_tickets = (int)Math.Ceiling(gw.FriendlyTickets);
            outCobra->hostile_tickets = (int)Math.Ceiling(gw.HostileTickets);
            outCobra->time_remaining_s = (int)Math.Ceiling(gw.TimeRemainingSeconds);
            outCobra->mission_status = (int)runtime.Status;
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_cycle_target")]
    public static int CycleTarget(long handle) {
        if (FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Cobra is { } cobra)
                return cobra.CycleTarget();
            if (slot.Session is { } session && session.OpponentPresent) {
                List<int> liveSlots = new();
                if (session.PrimaryOpponentAlive) liveSlots.Add(0);
                for (int i = 0; i < session.Wingmen.Count; i++) {
                    if (session.Wingmen[i].StillFighting)
                        liveSlots.Add(i + 1);
                }
                if (liveSlots.Count == 0) return 0;
                int cur = session.SelectedPlayerGunTargetSlot;
                int idx = liveSlots.IndexOf(cur);
                int nextSlot = liveSlots[(idx + 1) % liveSlots.Count];
                return session.SetPlayerGunTargetSlot(nextSlot) ? 1 : 0;
            }
            return 0;
        }
    }

    static int FireSecondaryImpl(long handle) {
        if (FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Cobra is { } cobra)
                return cobra.FireRocket();
            if (slot.Okanagan is { } ok) {
                ok.PendingCmd = ok.PendingCmd with { DropRequested = !ok.PendingCmd.DropRequested };
                return 1;
            }
            if (slot.Session is { } session) {
                if (session.RapierMissionAvailable)
                    return session.LaunchRapierShortRangeMissile() ? 1 : 0;
                return session.LaunchFoxTwo() ? 1 : 0;
            }
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_fire_rocket")]
    public static int FireRocket(long handle) => FireSecondaryImpl(handle);

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_fire_secondary")]
    public static int FireSecondary(long handle) => FireSecondaryImpl(handle);

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_director_rung")]
    public static int SetDirectorRung(long handle, int rung) {
        if (FindSlot(handle) is not { } slot || slot.Session is not { } session) return 0;
        lock (slot) {
            int r = Math.Clamp(rung, 0, 3);
            int lessonIdx = r switch { 0 => 0, 1 => 2, 2 => 4, _ => 7 };
            string[] parts = session.ExportDirectorState().Split('|');
            if (parts.Length >= 21 && parts[0] == "v3") {
                parts[1] = r.ToString(System.Globalization.CultureInfo.InvariantCulture);
                parts[20] = lessonIdx.ToString(System.Globalization.CultureInfo.InvariantCulture);
                bool wasActive = session.Lifecycle == SimulationSession.LifecycleState.Active;
                if (!session.TryImportDirectorState(string.Join('|', parts))) return 0;
                session.Restart();
                if (wasActive) session.Begin();
                return 1;
            }
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_get_director_rung")]
    public static int GetDirectorRung(long handle) {
        if (FindSlot(handle) is not { } slot || slot.Session is null) return 0;
        lock (slot) return slot.Session.DifficultyRung;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_gun_funnel")]
    public static int ReadGunFunnel(long handle, GunsSimGunFunnel* outFunnel) {
        if (outFunnel is null || FindSlot(handle) is not { } slot) return 0;
        *outFunnel = default;
        lock (slot) {
            if (slot.Session is not { } session) return 0;
            AircraftSim player = session.Player;
            AircraftState ps = session.Catapult.IsActive ? session.Catapult.State : player.State;
            IAtmosphereModel atmo = player.AtmosphereModel;
            double tasMps = player.AirspeedMps;
            double clInc = session.PlayerAerodynamicConfiguration.LiftCoefficientIncrement;
            outFunnel->corner_speed_kias = AirData.PositiveCornerSpeedKiasAtAltitude(
                ps.Mass, session.Beat.PlayerAir, ps.Position.Y, clInc, atmo);
            outFunnel->stall_speed_kias = AirData.StallSpeedKiasAtAltitude(
                ps.Mass, session.Beat.PlayerAir, ps.Position.Y, 1.0, clInc, atmo);
            outFunnel->sustained_g = Protection.SustainedG(
                ps, session.Beat.PlayerAir, tasMps,
                player.LastEngineOperatingPoint.NetThrustN,
                session.PlayerAerodynamicConfiguration, atmo);
            outFunnel->closure_kts = session.ClosureKts;
            outFunnel->selected_target_slot = session.SelectedPlayerGunTargetSlot;

            if (!session.OpponentPresent || session.CasevacMission)
                return 1;

            GunProfile profile = session.Beat.CombatRules.PlayerGunProfile;
            double wingspanM = session.OpponentEffectiveWingSpanM;
            if (!double.IsFinite(wingspanM) || wingspanM <= 1.0)
                wingspanM = 14.7;
            outFunnel->target_wingspan_m = wingspanM;
            outFunnel->muzzle_velocity_mps = profile.MuzzleVelocityMps;

            ExtractBasis(ps, out Vec3D bodyFwd, out Vec3D bodyUp);
            Vec3D shooterPos = ps.Position;
            Vec3D shooterVel = ps.VelocityVector();
            Vec3D angularVel = GunKill.WorldAngularVelocity(bodyFwd, bodyUp, ps.BodyRates);
            double horizonS = Math.Min(profile.MaximumFlightSeconds, GunKill.EffectiveRangingFlightSeconds);

            const int SampleCount = 9;
            outFunnel->sample_count = SampleCount;
            outFunnel->valid = 1;
            for (int i = 0; i < SampleCount; i++) {
                double age = horizonS * i / (SampleCount - 1);
                Vec3D p = GunKill.BallisticFunnelPoint(
                    shooterPos, shooterVel, bodyFwd, angularVel, profile.MuzzleVelocityMps, age);
                outFunnel->east_m[i] = p.X;
                outFunnel->up_m[i] = p.Y;
                outFunnel->north_m[i] = p.Z;
                outFunnel->range_m[i] = (p - shooterPos).Length;
            }
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_pilot_state")]
    public static int ReadPilotState(long handle, GunsSimPilotState* outPilot) {
        if (outPilot is null || FindSlot(handle) is not { } slot) return 0;
        *outPilot = default;
        outPilot->peripheral_vision01 = 1.0;
        outPilot->central_vision01 = 1.0;
        outPilot->control_authority01 = 1.0;
        outPilot->cognitive_capacity01 = 1.0;
        lock (slot) {
            if (slot.Session is not { } session) return 1;
            PilotPhysiologyState phys = session.PilotPhysiologyState;
            AutoGcasState gcas = session.AutoGcas;
            AircraftSim p = session.Player;
            outPilot->peripheral_vision01 = phys.PeripheralVision01;
            outPilot->central_vision01 = phys.VisualAcuity01;
            outPilot->redout01 = phys.Redout01;
            outPilot->control_authority01 = phys.ControlAuthority01;
            outPilot->cognitive_capacity01 = phys.CognitiveCapacity01;
            outPilot->buffet_pitch_deg = p.PitchBuffetRad * RadToDeg;
            outPilot->buffet_roll_deg = p.RollBuffetRad * RadToDeg;
            outPilot->buffet_yaw_deg = p.YawBuffetRad * RadToDeg;
            outPilot->body_rate_p_rps = p.State.BodyRates.P;
            outPilot->body_rate_q_rps = p.State.BodyRates.Q;
            outPilot->body_rate_r_rps = p.State.BodyRates.R;
            outPilot->auto_gcas_time_avail_s = double.IsFinite(gcas.Prediction.TimeAvailableToAvoidGroundImpactSeconds)
                ? gcas.Prediction.TimeAvailableToAvoidGroundImpactSeconds : 99.0;
            outPilot->auto_gcas_clearance_m = double.IsFinite(gcas.Prediction.CurrentClearanceM)
                ? gcas.Prediction.CurrentClearanceM : 9999.0;
            outPilot->pilot_state = (int)session.PilotState;
            outPilot->high_alpha_recovery = session.Controls.HighAlphaRecoveryActive ? 1 : 0;
            outPilot->padlock_roll_assist_active = session.PlayerGunTargetPadlockRollAssist.Active ? 1 : 0;
            outPilot->auto_gcas_available = session.PlayerAutoGcasCapability.Available ? 1 : 0;
            outPilot->auto_gcas_warning = gcas.Warning ? 1 : 0;
            outPilot->auto_gcas_active = gcas.Active ? 1 : 0;
            outPilot->auto_gcas_override_held = session.AutoGcasOverrideHeld ? 1 : 0;
            outPilot->g_loc_count = session.PilotGLocCount;
            outPilot->control_interlocked = session.PilotControlInterlocked ? 1 : 0;
            outPilot->trigger_interlocked = session.PilotTriggerInterlocked ? 1 : 0;
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_combat_director")]
    public static int ReadCombatDirector(long handle, GunsSimCombatDirector* outDirector) {
        if (outDirector is null || FindSlot(handle) is not { } slot) return 0;
        *outDirector = default;
        lock (slot) {
            if (slot.Session is not { } session) return 1;
            outDirector->wave_score_multiplier = session.WaveScoreMultiplier;
            outDirector->combat_score = session.CombatScore;
            outDirector->sortie_peak_g = session.SortiePeakLoadFactorG;
            outDirector->sortie_min_g = session.SortieMinimumLoadFactorG;
            Aim9Telemetry aim9 = session.Aim9Telemetry;
            outDirector->aim9_boresight_deg = aim9.BoresightDeg;
            outDirector->aim9_track_rate_dps = aim9.TrackRateDegPerSec;
            outDirector->wing_sweep_deg = session.PlayerF14WingSweepDegrees ?? 20.0;
            outDirector->hook_down01 = session.PlayerSystems.HookDown ? 1.0 : 0.0;
            outDirector->rapier_target_mach = session.RapierTargetMach;
            outDirector->rapier_skin_temp_c = session.Player.SkinTemperatureK > 0.0
                ? session.Player.SkinTemperatureK - 273.15 : 15.0;
            outDirector->rapier_skin_limit_c = session.Beat.PlayerAir.SkinTemperatureLimitK > 0.0
                ? session.Beat.PlayerAir.SkinTemperatureLimitK - 273.15 : 1200.0;
            if (session.IncomingWaveBearingRad is { } bRad) {
                outDirector->incoming_wave_active = 1;
                outDirector->incoming_wave_bearing_deg = ((bRad * RadToDeg) % 360.0 + 360.0) % 360.0;
            }
            outDirector->wave_number = session.EngagementNumber;
            outDirector->engagements_won = session.EngagementsWon;
            outDirector->engagement_cap = session.FiniteEngagementCap;
            outDirector->rtb_bounce_active = session.RtbBounceActive ? 1 : 0;
            outDirector->sortie_rung = session.SortieContractRung;
            outDirector->earned_rung = session.DifficultyRung;
            outDirector->director_hits = session.DirectorHits;
            outDirector->director_kills = session.DirectorKills;
            outDirector->splash_cue_active = session.SplashCueActive ? 1 : 0;
            outDirector->selected_target_slot = session.SelectedPlayerGunTargetSlot;
            outDirector->missiles_remaining = session.RapierMissionAvailable
                ? session.RapierMissilesRemaining : session.Aim9Remaining;
            outDirector->missile_in_flight = (session.Aim9InFlight || session.RapierMissileInFlight) ? 1 : 0;
            outDirector->aim9_seeker_state = (int)aim9.State;
            outDirector->rapier_phase = (int)session.RapierPhase;
            outDirector->rapier_automation_active = session.RapierAutomationActive ? 1 : 0;
            outDirector->time_compression_factor = session.TimeCompressionFactor;
            outDirector->time_compression_eligible = session.TimeCompressionEligible ? 1 : 0;
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_weather")]
    public static int ReadWeather(long handle, GunsSimWeatherState* outWeather) {
        if (outWeather is null || FindSlot(handle) is not { } slot) return 0;
        *outWeather = default;
        outWeather->local_visibility_m = 100_000.0;
        lock (slot) {
            if (slot.Session is not { } session || session.Weather is not { } weather)
                return 1;
            Vec3D pos = session.Player.State.Position;
            double simS = session.TimeMilliseconds * 0.001;
            CloudSample sample = weather.Clouds.Sample(pos, simS);
            outWeather->local_cloud_fraction01 = sample.CloudFraction01;
            outWeather->local_cloud_extinction_per_m = sample.ExtinctionPerMetre;
            outWeather->local_visibility_m = sample.VisibilityM;
            outWeather->precipitation_mm_hr = sample.PrecipitationMmPerHour;
            outWeather->turbulence_rms_mps = sample.TurbulenceVelocityMps.Length;
            if (weather.Clouds is LayeredCloudField layered) {
                int count = Math.Min(4, layered.Layers.Count);
                outWeather->layer_count = count;
                for (int i = 0; i < count; i++) {
                    CloudLayerDefinition layer = layered.Layers[i];
                    outWeather->layer_base_alt_m[i] = layer.BaseAltitudeM;
                    outWeather->layer_top_alt_m[i] = layer.TopAltitudeM;
                    outWeather->layer_coverage01[i] = layer.MeanCloudFraction01;
                    outWeather->layer_scale_m[i] = layer.HorizontalStructureScaleM;
                    outWeather->layer_adv_east_mps[i] = layer.AdvectionVelocityMps.X;
                    outWeather->layer_adv_north_mps[i] = layer.AdvectionVelocityMps.Z;
                }
            }
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_carrier")]
    public static int ReadCarrier(long handle, GunsSimCarrierState* outCarrier) {
        if (outCarrier is null || FindSlot(handle) is not { } slot) return 0;
        *outCarrier = default;
        lock (slot) {
            if (slot.Session is not { } session || session.Carrier is not { } c)
                return 1;
            outCarrier->present = c.IsMaritime ? 1 : 0;
            outCarrier->pos_east_m = c.Position.X;
            outCarrier->pos_up_m = c.Position.Y;
            outCarrier->pos_north_m = c.Position.Z;
            outCarrier->heading_rad = c.HeadingRad;
            outCarrier->landing_heading_rad = c.LandingHeadingRad;
            outCarrier->deck_length_m = c.DeckLengthM;
            outCarrier->deck_width_m = c.DeckHalfWidthM * 2.0;
            outCarrier->speed_mps = c.SpeedMps;
            outCarrier->angled_deck = c.Configuration == Carrier.DeckConfiguration.Angled ? 1 : 0;
            outCarrier->catapult_active = session.Catapult.IsActive ? 1 : 0;
            outCarrier->arrestment_phase = (int)session.Arrestment.Phase;
            outCarrier->caught_wire = session.Arrestment.CaughtWire;
            outCarrier->wire_decel_mps2 = session.Arrestment.DecelerationMps2;

            AircraftState ps = session.Catapult.IsActive ? session.Catapult.State : session.Player.State;
            var (along, cross, height) = c.LandingFrame(ps.Position);
            double range = Math.Max(0.0, -c.DeckLengthM * 0.2 - along);
            outCarrier->glideslope_err_deg = range > 1.0
                ? (Math.Atan2(height, range) - Carrier.GlideslopeRad) * RadToDeg : 0.0;
            outCarrier->lineup_err_m = cross;
            outCarrier->aoa_err_deg = (session.Player.AngleOfAttackRad - c.ApproachDirectorPitchOffsetRad) * RadToDeg;

            LsoAdvice? lso = Lso.AdviseForMode(
                c, ps, session.Player.AngleOfAttackRad,
                c.ApproachDirectorPitchOffsetRad,
                session.Controls.ApproachMode, session.WaveOffActive);
            if (lso is { } advice) {
                outCarrier->lso_severity = advice.Severity switch {
                    LsoSeverity.OnBall => 1,
                    LsoSeverity.Correcting => 2,
                    LsoSeverity.WaveOff => 3,
                    _ => 0,
                };
            }
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_okanagan")]
    public static int ReadOkanagan(long handle, GunsSimOkanaganState* outOk) {
        if (outOk is null || FindSlot(handle) is not { } slot) return 0;
        *outOk = default;
        lock (slot) {
            if (slot.Okanagan is not { } ok) return 1;
            OkanaganMissionSnapshot snap = ok.Mission.Snapshot();
            FireBossTelemetry t = snap.Aircraft;
            double gH = OkanaganCdem.SampleSurfaceHeightM(t.PositionWorldM);
            outOk->water_kg = t.WaterLoadKg;
            outOk->water_capacity_kg = FireBossDynamics.MaximumWaterKg;
            outOk->scoop_target_kg = snap.ScoopTargetWaterKg;
            outOk->fire_intensity = snap.FireIntensity;
            outOk->burned_area_ha = snap.BurnedAreaHa;
            outOk->score = snap.Score;
            outOk->drop_aim_east_m = snap.DropAimWorldM.X;
            outOk->drop_aim_up_m = snap.DropAimWorldM.Y;
            outOk->drop_aim_north_m = snap.DropAimWorldM.Z;
            outOk->water_level_m = OkanaganGeo.LakeSurfaceElevationM;
            outOk->scoop_rate_kgps = t.ScoopRateKgPerSecond;
            outOk->water_released_this_tick_kg = t.WaterReleasedThisTickKg;
            outOk->agl_m = Math.Max(0.0, t.PositionWorldM.Y - gH);
            outOk->fuel_kg = t.FuelKg;
            outOk->active = 1;
            outOk->phase = (int)snap.Phase;
            outOk->surface_mode = (int)t.SurfaceMode;
            outOk->scoops_commanded = t.ScoopsCommanded ? 1 : 0;
            outOk->scoop_valid = t.ScoopValid ? 1 : 0;
            outOk->dropping = (ok.PendingCmd.DropRequested || t.WaterReleasedThisTickKg > 0.01) ? 1 : 0;
            outOk->effective_drops = snap.EffectiveDrops;
            outOk->completed_cycles = snap.CompletedCycles;
            outOk->fire_cell_count = snap.FireCells.Count;
            return 1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_fire_cells")]
    public static int ReadFireCells(long handle, GunsSimFireCell* outCells, int maxCount) {
        if (outCells is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            if (slot.Okanagan is not { } ok) return 0;
            IReadOnlyList<OkanaganFireCellSnapshot> cells = ok.Mission.Snapshot().FireCells;
            int cnt = Math.Min(cells.Count, maxCount);
            for (int i = 0; i < cnt; i++) {
                OkanaganFireCellSnapshot c = cells[i];
                outCells[i].east_m = c.X;
                outCells[i].up_m = c.Y;
                outCells[i].north_m = c.Z;
                outCells[i].intensity01 = Math.Clamp(c.Intensity, 0.0, 1.0);
            }
            return cnt;
        }
    }
}
