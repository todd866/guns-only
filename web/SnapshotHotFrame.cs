using System.Diagnostics;
using System.Globalization;
using System.Text;
using GunsOnly.Sim;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Missiles;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Turbulence;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Web;

/// <summary>
/// Per-frame numeric projection of a <see cref="SimulationSession"/> into a flat double buffer,
/// paired with a monotonic cold-version counter that tells the browser when the full JSON snapshot
/// (<see cref="SnapshotProjection.BuildState"/>) must be re-fetched. Together they replace the
/// per-frame JSON round trip: the browser reads this buffer every frame and re-parses the JSON only
/// when the cold version bumps (or on its own fallback interval).
///
/// Contract rules, enforced by sim.Tests golden tests against BuildState's actual JSON:
/// - Every slot carries exactly the value the JSON field would parse to: numbers are rounded to the
///   same fixed-decimal precision the JSON format string uses, booleans are 1/0, and null-able
///   numbers use NaN as the wire sentinel for JSON null.
/// - Conditionally emitted field groups (the recovery-platform block, merge/drone detail) are
///   guarded by presence slots so the browser can preserve key-absence semantics exactly.
/// - The value derivations intentionally duplicate BuildState's prologue (position/airspeed/attitude
///   source switching, carrier latching) rather than restructuring the shipped JSON path; the golden
///   tests are the drift guard. Keep the two in lockstep when either changes.
///
/// This type deliberately carries no browser or JS-interop attributes so sim.Tests can link and
/// exercise it as ordinary .NET, mirroring SnapshotProjection and SnapshotJson.
/// </summary>
internal static class SnapshotHotFrame {
    internal enum SlotKind { Number, Boolean, NullableNumber }

    internal readonly record struct SlotDef(string Name, SlotKind Kind, int Decimals);

    internal sealed record BlockDef(string Name, int PresenceIndex, int Start, int Count);

    internal sealed record TracerDef(string Field, int CountIndex, int Start, int MaxRounds);

    internal sealed record SampleArrayDef(string Field, int Start, int Samples, string[] Keys);

    public const int LayoutVersion = 34;
    public const int ColdVersionIndex = 0;
    // Mirrors SnapshotProjection.TracerJson's MaxRenderedTracers window (last N rounds in flight).
    const int MaxTracerRounds = 48;
    // Mirrors SnapshotProjection.GunTrajectoryJson's SampleCount: the HUD funnel's 9 samples of
    // the bullets-in-the-air locus. Slot order per sample is x,y,z,r (r = range from shooter).
    const int TrajectorySampleCount = 9;
    static readonly string[] TrajectoryKeys = { "x", "y", "z", "r" };
    // The conventional pattern publishes eight short ingress look-ahead gates, while the fixed
    // pattern itself has nine authored gates through the physical touchdown aim. Keep spare room
    // so the terminal aim never falls off the hot transport as the route transitions.
    const int ApproachGateSampleCount = 12;
    static readonly string[] ApproachGateKeys = {
        "east_m", "north_m", "up_m", "half_m",
        "target_alt_m", "target_ktas", "speed_tolerance_ktas", "pattern_leg_code",
        "dirty", "active",
    };
    static readonly int[] ApproachGateDecimals = { 1, 1, 1, 1, 1, 0, 0, 0, 0, 0 };
    static readonly int[] TrajectoryDecimals = { 2, 2, 2, 1 };
    const int RawInteger = -1;
    const double RadiansToDegrees = 180.0 / Math.PI;
    const double JoulesPerKilowattHour = 3_600_000.0;
    const double SecondsPerMinute = 60.0;
    const double PresentationRainFullScaleMmPerHour = 4.0;

    static readonly List<SlotDef> Slots = new();
    static readonly List<BlockDef> Blocks = new();
    static readonly List<TracerDef> TracerRegions = new();
    static readonly List<SampleArrayDef> SampleArrays = new();
    static readonly BlockDef CasevacBlock;
    public static readonly int SlotCount;

    static long _coldVersion = 1;
    static ColdFingerprint? _lastFingerprint;
    static CasevacColdFingerprint? _lastCasevacFingerprint;
    static string? _layoutJson;

    static SnapshotHotFrame() {
        int i = 0;
        int blockStart = 0;
        string blockName = "core";
        int blockPresence = -1;
        var slots = Slots;

        void Num(string name, int decimals) => slots.Add(new SlotDef(name, SlotKind.Number, decimals));
        void Bool(string name) => slots.Add(new SlotDef(name, SlotKind.Boolean, 0));
        void Nul(string name, int decimals) => slots.Add(new SlotDef(name, SlotKind.NullableNumber, decimals));
        void CloseBlock() {
            Blocks.Add(new BlockDef(blockName, blockPresence, blockStart, slots.Count - blockStart));
        }
        void OpenBlock(string name, int presenceIndex) {
            CloseBlock();
            blockName = name;
            blockPresence = presenceIndex;
            blockStart = slots.Count;
        }
        void Tracers(string field) {
            TracerRegions.Add(new TracerDef(field, slots.Count, slots.Count + 1, MaxTracerRounds));
            Num(field + "_count", RawInteger);
            for (int r = 0; r < MaxTracerRounds; r++)
                for (int c = 0; c < 6; c++)
                    Num($"{field}[{r}][{c}]", 3);
        }
        void TrajectorySamples(string field) {
            SampleArrays.Add(new SampleArrayDef(field, slots.Count, TrajectorySampleCount,
                TrajectoryKeys));
            for (int r = 0; r < TrajectorySampleCount; r++)
                for (int c = 0; c < TrajectoryKeys.Length; c++)
                    Num($"{field}[{r}].{TrajectoryKeys[c]}", TrajectoryDecimals[c]);
        }
        void ApproachGateSamples(string field) {
            SampleArrays.Add(new SampleArrayDef(field, slots.Count, ApproachGateSampleCount,
                ApproachGateKeys));
            for (int r = 0; r < ApproachGateSampleCount; r++)
                for (int c = 0; c < ApproachGateKeys.Length; c++)
                    Num($"{field}[{r}].{ApproachGateKeys[c]}", ApproachGateDecimals[c]);
        }

        Num("cold_version", RawInteger);
        Debug.Assert(slots.Count - 1 == ColdVersionIndex);

        Num("t", 4);
        Num("simulation_time_s", 3);
        Num("tick", RawInteger);
        Bool("time_compression_available");
        Bool("time_compression_enabled");
        Bool("time_compression_eligible");
        Num("time_compression_requested_factor", RawInteger);
        Num("time_compression_safety_factor_cap", RawInteger);
        Num("time_compression_factor", RawInteger);
        Bool("rapier_mission_available");
        Bool("service_life_record_available");
        Num("service_life_record_sequence", RawInteger);
        Bool("service_life_capture_active");
        Bool("service_life_exceedance_review_required");
        Num("service_life_over_structural_limit_s", 3);
        Num("service_life_over_dynamic_pressure_s", 3);
        Num("service_life_max_g", 3);
        Num("service_life_max_dynamic_pressure_kpa", 2);
        Num("service_life_min_thermal_margin_c", 1);
        Bool("rapier_pattern_only");
        Bool("rapier_automation_enabled");
        Bool("rapier_automation_active");
        Num("rapier_computer_failure_plan_code", RawInteger);
        Num("rapier_computer_failure_active_code", RawInteger);
        Bool("rapier_mission_computer_available");
        Bool("rapier_flight_control_computers_available");
        Bool("rapier_uncontrolled_reentry");
        Num("rapier_mission_phase", RawInteger);
        Num("rapier_target_mach", 2);
        Num("rapier_target_altitude_ft", 0);
        Num("rapier_missiles_remaining", RawInteger);
        Num("rapier_gun_drones_remaining", RawInteger);
        Bool("rapier_missile_in_flight");
        Num("rapier_missile_tti_s", 2);
        Bool("rapier_pursuit_active");
        Num("rapier_pursuer_count", RawInteger);
        Num("rapier_pursuit_range_m", 1);
        Bool("rapier_balloon_reaction_active");
        Num("rapier_balloon_reaction_seconds", 2);
        Bool("rapier_balloon_payload_deployed");
        Num("rapier_balloon_carriers_remaining", RawInteger);
        Num("rapier_guidance_x", 3);
        Num("rapier_guidance_y", 3);
        Num("rapier_guidance_z", 3);
        Num("rapier_recovery_gate", RawInteger);
        Num("rapier_circuit_leg_code", RawInteger);
        Bool("radio_active");
        Num("radio_sequence", RawInteger);
        Num("radio_priority", RawInteger);
        Num("radio_started_s", 3);
        Num("radio_ends_s", 3);
        Bool("rapier_radio_active");
        Num("rapier_radio_sequence", RawInteger);
        Num("rapier_radio_priority", RawInteger);
        Num("rapier_radio_started_s", 3);
        Num("rapier_radio_ends_s", 3);
        Bool("checklist_active");
        Num("checklist_id", RawInteger);
        Num("checklist_done", RawInteger);
        Num("checklist_total", RawInteger);
        Num("rapier_fd_bank_deg", 1);
        Num("rapier_fd_target_ktas", 0);
        Num("rapier_gate_half_m", 1);
        Num("rapier_gate_face_x", 4);
        Num("rapier_gate_face_y", 4);
        Num("rapier_gate_face_z", 4);
        Bool("rapier_gate_in_volume");
        Bool("rapier_gate_energy_ok");
        Num("rapier_nose_on_v_err_deg", 1);
        Num("rapier_target_gamma_deg", 2);
        Num("rapier_lob_skip", RawInteger);
        Num("rapier_lob_skip_max", RawInteger);
        Num("rapier_rcs_gas_frac", 3);
        Num("rapier_rcs_authority", 3);
        Num("rapier_rcs_moment_nm", 1);
        Num("rapier_rcs_firing_frac", 3);
        Num("rapier_inlet_recovery", 3);
        Bool("rapier_inlet_distorted");
        Bool("rapier_inlet_unstart");
        Num("rapier_normal_alpha_limit_deg", 2);
        Bool("rapier_zoom_lob");
        Num("rapier_commanded_mach", 2);
        Num("rapier_skin_mach_limit", 2);
        Nul("rapier_material_mach_ceiling", 2);
        Num("rapier_authored_target_mach", 2);
        Num("rapier_turbine_thrust_lbf", 0);
        Num("rapier_ramjet_thrust_lbf", 0);
        Num("rapier_turbine_thrust_kn", 2);
        Num("rapier_ramjet_thrust_kn", 2);
        Num("rapier_drag_lbf", 1);
        Num("rapier_dynamic_pressure_limit_kpa", 2);
        Num("rapier_relight_dynamic_pressure_kpa", 2);
        Num("rapier_turbine_fuel_ppm", 2);
        Num("rapier_ramjet_fuel_ppm", 2);
        Num("rapier_skin_temp_c", 0);
        Num("rapier_recovery_temp_c", 0);
        Num("rapier_stagnation_temp_c", 0);
        Num("rapier_thermal_effective_temp_c", 0);
        Nul("rapier_thermal_capability_c", 0);
        Nul("rapier_cmc_capability_c", 0);
        Nul("rapier_cmc_margin_c", 0);
        Nul("rapier_thermal_margin_c", 0);
        Num("player_gross_lb", 0);
        Num("rapier_intercept_eti_min", 1);
        Num("px", 3); Num("py", 3); Num("pz", 3);
        // World-frame ground velocity: the HUD projects the flight-path marker (FPV) from this
        // exact vector every frame, so it must ride the hot path (Build 64 reconciliation).
        Num("vx", 3); Num("vy", 3); Num("vz", 3);
        Num("pfx", 5); Num("pfy", 5); Num("pfz", 5);
        Num("plx", 5); Num("ply", 5); Num("plz", 5);
        Bool("opponent_present");
        Num("bx", 3); Num("by", 3); Num("bz", 3);
        Num("bfx", 5); Num("bfy", 5); Num("bfz", 5);
        Num("blx", 5); Num("bly", 5); Num("blz", 5);
        Nul("selected_opponent_tactic_code", RawInteger);
        Nul("selected_opponent_last_command_load_factor_g", 3);
        Nul("selected_opponent_last_command_bank_target_deg", 3);
        Nul("selected_opponent_last_command_throttle", 3);
        Nul("selected_opponent_last_command_rudder", 3);
        // Top Gun's missile pose is fixed-tick authority and therefore belongs on the hot path;
        // leaving it in the five-second JSON fallback made a launched round appear stationary.
        Nul("wing_sweep_deg", 1);
        Nul("opponent_wing_sweep_deg", 1);
        Nul("wing_sweep_command_deg", 1);
        Num("wing_sweep_mode_code", RawInteger);
        Nul("f14_g_limit_g", 1);
        Nul("f14_override_limit_g", 1);
        Bool("f14_over_g");
        Num("f14_over_g_seconds", 3);
        Num("f14_structural_fatigue_01", 4);
        Bool("f14_structural_failed");
        Bool("first_run_weapons_cold");
        // The gorge mesh and conformal ingress line consume hot state. If these fields live only
        // in cold JSON, the first hot frame erases the landscape while the jet is already moving.
        Bool("first_run_valley_available");
        Nul("first_run_valley_geometry_version", RawInteger);
        Nul("first_run_valley_center_east_m", 1);
        Nul("first_run_valley_entry_north_m", 1);
        Nul("first_run_valley_popout_north_m", 1);
        Nul("first_run_valley_route_alt_m", 1);
        Nul("first_run_valley_floor_height_m", 1);
        Nul("first_run_valley_floor_blend_drop_m", 1);
        Nul("first_run_valley_floor_half_width_m", 1);
        Nul("first_run_valley_crest_offset_m", 1);
        Nul("first_run_valley_outer_offset_m", 1);
        Nul("first_run_valley_west_ridge_rise_m", 1);
        Nul("first_run_valley_east_ridge_rise_m", 1);
        Nul("first_run_valley_curve_amplitude_m", 1);
        Nul("first_run_valley_curve_wavelength_m", 1);
        Nul("first_run_valley_centerline_component_count", RawInteger);
        Nul("first_run_valley_side_cut_count", RawInteger);
        Nul("first_run_valley_butte_count", RawInteger);
        Nul("first_run_valley_side_cut_depth_01", 3);
        Nul("first_run_valley_strata_step_height_m", 1);
        Nul("first_run_valley_strata_bench_fraction", 3);
        Nul("first_run_valley_south_extent_north_m", 1);
        Nul("first_run_valley_south_full_north_m", 1);
        Nul("first_run_valley_popout_fade_start_north_m", 1);
        Nul("first_run_valley_north_extent_north_m", 1);
        Nul("aim9_remaining", RawInteger);
        Bool("aim9_in_flight");
        Bool("aim9_pose_valid");
        Num("aim9_state_code", RawInteger);
        Nul("aim9_x", 3); Nul("aim9_y", 3); Nul("aim9_z", 3);
        Nul("aim9_vx", 3); Nul("aim9_vy", 3); Nul("aim9_vz", 3);
        // Three fixed additional-aircraft blocks keep the hot path allocation-free while exposing
        // the complete four-ship formation authored for Rapier.
        foreach (string prefix in new[] { "w1", "w2", "w3" }) {
            Num($"{prefix}_present", RawInteger);
            Num($"{prefix}x", 3); Num($"{prefix}y", 3); Num($"{prefix}z", 3);
            Num($"{prefix}fx", 5); Num($"{prefix}fy", 5); Num($"{prefix}fz", 5);
            Num($"{prefix}lx", 5); Num($"{prefix}ly", 5); Num($"{prefix}lz", 5);
            Num($"{prefix}_alive", RawInteger);
            // Per-contact gunnery. Without these, only the PRIMARY opponent's fire was observable
            // and "the bandit never shoots" could not be told apart from "the wingman shot and we
            // never measured it". Encoded as raw integers to match this block's 1/0 flag style.
            Num($"{prefix}_ammo", RawInteger);
            Num($"{prefix}_rounds_fired", RawInteger);
            Num($"{prefix}_hits", RawInteger);
            Num($"{prefix}_trigger_down", RawInteger);
            Num($"{prefix}_gun_firing", RawInteger);
        }
        Nul("formation_coordination_age_s", 3);
        // Two distinct signals, deliberately two distinct fields. `_stale` is the BEHAVIOURAL
        // window and keeps its Build-264 meaning so the two builds stay comparable; `_health_stale`
        // is the fault watchdog and is the one to alarm on.
        Bool("formation_coordination_stale");
        Bool("formation_coordination_health_stale");
        // One released Rapier reusable gun-drone rides the hot path while it is still active.
        Num("rd1_present", RawInteger);
        Num("rd1x", 3); Num("rd1y", 3); Num("rd1z", 3);
        Num("rd1fx", 5); Num("rd1fy", 5); Num("rd1fz", 5);
        Num("rd1lx", 5); Num("rd1ly", 5); Num("rd1lz", 5);
        Num("rd1_alive", RawInteger);
        Num("rd1_phase", RawInteger);
        Bool("rd1_turbine_armed");
        Num("buffet_pitch_deg", 3); Num("buffet_roll_deg", 3); Num("buffet_yaw_deg", 3);
        Num("indicated_airspeed_kts", 2);
        Num("calibrated_airspeed_kts", 2);
        Num("equivalent_airspeed_kts", 2);
        Num("true_airspeed_kts", 2);
        Num("ground_speed_kts", 2);
        Num("mach", 4);
        Num("static_temperature_c", 2);
        Num("static_pressure_hpa", 2);
        Num("air_density_kg_m3", 6);
        Num("wind_x_mps", 3); Num("wind_y_mps", 3); Num("wind_z_mps", 3);
        Num("visibility_m", 1); Num("cloud_fraction_01", 4);
        Num("cloud_extinction_per_m", 8); Num("precipitation_mm_hr", 3);
        Num("precipitation_total_mm_water_equivalent_hr", 3);
        Num("precipitation_rain_mm_water_equivalent_hr", 3);
        Num("precipitation_snow_mm_water_equivalent_hr", 3);
        Num("precipitation_freezing_drizzle_mm_water_equivalent_hr", 3);
        Num("precipitation_freezing_rain_mm_water_equivalent_hr", 3);
        Num("precipitation_ice_pellets_mm_water_equivalent_hr", 3);
        Num("precipitation_graupel_mm_water_equivalent_hr", 3);
        Num("precipitation_hail_mm_water_equivalent_hr", 3);
        Num("precipitation_extinction_per_m", 8);
        Num("precipitation_visibility_m", 1);
        Num("surface_temperature_k", 2);
        Num("snow_water_equivalent_m", 4);
        Num("snow_depth_m", 4);
        Num("snow_liquid_water_fraction_01", 4);
        Num("snow_crust_01", 4);
        Num("surface_wetness_01", 4);
        Num("standing_water_depth_m", 4);
        Num("slush_depth_m", 4);
        Num("glaze_ice_thickness_m", 4);
        Num("mud_depth_m", 4);
        Num("surface_friction_coefficient", 4);
        Num("surface_braking_factor_01", 4);
        Num("cloud_turbulence_x_mps", 3); Num("cloud_turbulence_y_mps", 3);
        Num("cloud_turbulence_z_mps", 3); Num("cloud_vertical_air_mps", 3);
        Num("icing_hazard_01", 4); Num("lightning_hazard_01", 4);
        Num("speed_kts", 2);
        Num("stall_speed_kias", 2);
        Num("accelerated_stall_speed_kias", 2);
        Num("corner_speed_kias", 2);
        Num("stall_speed_kcas", 2);
        Num("accelerated_stall_speed_kcas", 2);
        Num("corner_speed_kcas", 2);
        Num("effective_on_speed_aoa_deg", 3);
        Num("stall_load_factor", 3);
        Num("sortie_peak_g", 3);
        Num("sortie_min_g", 3);
        Num("alt_ft", 1);
        Num("radar_alt_ft", 1);
        Num("vertical_speed_fpm", 1);
        Num("g_actual", 3); Num("g_cmd", 3);
        Num("pilot_gz", 4);
        Bool("pilot_gz_valid");
        Num("pilot_positive_onset_rate_g_per_second", 4);
        Num("pilot_negative_onset_rate_g_per_second", 4);
        Num("pilot_positive_exposure_g_seconds", 4);
        Num("pilot_negative_exposure_g_seconds", 4);
        Num("pilot_effective_retinal_reserve_01", 5);
        Num("pilot_effective_cerebral_reserve_01", 5);
        Num("pilot_peripheral_vision_01", 5);
        Num("pilot_central_vision_01", 5);
        Num("pilot_redout_01", 5);
        Num("pilot_consciousness_01", 5);
        Bool("pilot_conscious");
        Num("pilot_cognitive_capacity_01", 5);
        Num("pilot_control_authority_01", 5);
        Num("pilot_additional_control_delay_seconds", 4);
        Num("pilot_incapacitation_remaining_seconds", 4);
        Num("pilot_agsm_engagement_01", 5);
        Num("pilot_push_pull_penalty_g", 4);
        Num("pilot_effective_peripheral_loss_g", 4);
        Num("pilot_effective_blackout_g", 4);
        Num("pilot_effective_loc_g", 4);
        Num("pilot_effective_negative_redout_magnitude_g", 4);
        Num("pilot_effective_negative_loc_magnitude_g", 4);
        Bool("pilot_control_interlocked");
        Bool("pilot_trigger_interlocked");
        Num("pilot_g_loc_count", RawInteger);
        Num("pilot_peak_positive_g", 4);
        Num("pilot_peak_negative_g", 4);
        Bool("auto_gcas_active");
        Bool("auto_gcas_warning");
        Bool("auto_gcas_override_held");
        Num("auto_gcas_activation_count", RawInteger);
        Num("auto_gcas_override_count", RawInteger);
        Num("auto_gcas_release_count", RawInteger);
        Num("auto_gcas_active_seconds", 4);
        Bool("auto_gcas_prediction_valid");
        Bool("auto_gcas_used_fallback_terrain");
        Nul("auto_gcas_current_clearance_m", 4);
        Nul("auto_gcas_pilot_minimum_clearance_m", 4);
        Nul("auto_gcas_recovery_minimum_clearance_m", 4);
        Nul("auto_gcas_pilot_violation_time_seconds", 4);
        Nul("auto_gcas_time_available_seconds", 4);
        Bool("auto_gcas_pilot_recovery_credited");
        Num("bank_target_deg", 3);
        Num("roll_control", 3);
        Num("applied_rudder", 4);
        Num("f22_ari_gain", 4);
        Num("f22_ari_rudder", 4);
        Num("effective_rudder_command", 4);
        Num("stability_yaw_rate_dps", 3);
        Num("pilot_aileron", 3);
        Num("sas_aileron", 3);
        Num("aileron_command_deg", 3);
        Num("sas_aileron_deg", 3);
        Num("total_aileron_command_deg", 3);
        Bool("lateral_control_applied");
        Bool("direct_lateral_control");
        Num("requested_g_cmd", 3);
        Num("requested_bank_target_deg", 3);
        Num("requested_rudder", 3);
        Num("requested_roll_control", 3);
        Num("requested_sas_aileron", 3);
        Bool("requested_envelope_override");
        Nul("requested_alpha_deg", 3);
        Bool("requested_direct_lateral_control");
        Num("roll_moment_nm", 1);
        Num("pitch_thrust_vector_deg", 3);
        Num("pitch_thrust_vector_moment_nm", 1);
        Bool("gunnery_pitch_assist");
        Num("gunnery_assist_status_code", RawInteger);
        Num("gunnery_pitch_error_deg", 3);
        Num("gunnery_lateral_error_deg", 3);
        Num("gunnery_total_lead_error_deg", 3);
        Num("gunnery_pitch_rate_cmd_dps", 3);
        Num("gunnery_pitch_rate_measured_dps", 3);
        Num("gunnery_pitch_rate_error_dps", 3);
        Num("gunnery_pitch_assist_g", 3);
        Num("gunnery_pitch_assist_delta_g", 3);
        Num("gunnery_assist_authority_01", 3);
        Num("gunnery_roll_assist", 4);
        Num("gunnery_yaw_assist", 4);
        Nul("gunnery_time_to_pass_s", 3);
        Bool("padlock_roll_assist_selected");
        Bool("padlock_roll_assist_geometry_valid");
        Bool("padlock_roll_assist_captured");
        Bool("padlock_roll_assist_active");
        Bool("padlock_roll_assist_any_plane");
        Num("padlock_roll_assist_target_sequence", RawInteger);
        Num("padlock_roll_plane_magnitude", 6);
        Num("padlock_roll_error_deg", 3);
        Num("padlock_roll_rate_cmd_dps", 3);
        Num("padlock_roll_rate_measured_dps", 3);
        Num("padlock_target_plane_rate_dps", 3);
        Num("padlock_roll_assist_aileron", 4);
        Bool("padlock_preferred_plane_valid");
        Num("padlock_preferred_plane_deg", 3);
        Bool("high_alpha_recovery");
        Num("g_valley", 3);
        Num("g_maxperform", 3);
        Num("g_hardmax", 3);
        Num("g_override_max", 3);
        Num("dynamic_pressure_kpa", 2);
        Num("sustained", 3);
        Num("sticky", 2);
        Num("tier", RawInteger);
        Num("variant", RawInteger);
        Num("prompt", RawInteger);
        Bool("buffet");
        Num("pitch_deg", 2); Num("bank_deg", 2);
        Num("aoa_deg", 2); Num("beta_deg", 2); Num("gamma_deg", 2);
        Num("heading_deg", 2);
        Num("roll_rate_dps", 2); Num("pitch_rate_dps", 2); Num("yaw_rate_dps", 2);
        Num("angle_off_deg", 2);
        Num("range_m", 1); Num("closure_kts", 1);
        Num("selected_player_gun_target_slot", RawInteger);
        Bool("gun_window");
        Bool("gun_solution_raw");
        Bool("gun_solution");
        Bool("lead_valid");
        Bool("lead_solution_valid");
        Num("lead_x", 3); Num("lead_y", 3); Num("lead_z", 3);
        Num("lead_tof", 4);
        Num("ammo", RawInteger);
        // The HUD gunsight funnel projects these 9 samples every frame; a 250 ms-stale funnel is
        // a wrong gunsight, so the trajectory rides the hot path (Build 64 reconciliation).
        TrajectorySamples("gun_trajectory");
        Num("rounds_fired", RawInteger);
        Num("hits", RawInteger);
        Num("selected_target_hits", RawInteger);
        Bool("hit");
        Bool("gun_firing");
        Tracers("tracers");
        Num("kill_progress", 3);
        Num("opponent_health", 3);
        Bool("opponent_alive");
        Num("bandit_health", 3);
        Bool("bandit_alive");
        Num("player_health", 3);
        Bool("player_alive");
        Num("opponent_ammo", RawInteger);
        Num("opponent_rounds_fired", RawInteger);
        Num("opponent_hits", RawInteger);
        Bool("opponent_trigger_down");
        Bool("opponent_gun_firing");
        Bool("formation_gun_firing");
        Num("sortie_rounds_fired", RawInteger);
        Num("sortie_hits", RawInteger);
        Num("sortie_opponent_rounds_fired", RawInteger);
        Tracers("opponent_tracers");
        Num("kill_count", RawInteger);
        Num("engagement_number", RawInteger);
        Bool("opponent_replacement_pending");
        Num("opponent_replacement_s", 3);
        Bool("splash_cue");
        Bool("below_ground");
        Num("shots_total", RawInteger);
        Num("shots_in_window", RawInteger);
        Num("combat_handoff_phase", RawInteger);
        Bool("combat_handoff_requested");
        Bool("combat_handoff_active");
        Num("relief_kills", RawInteger);
        Num("throttle", 3);
        Num("requested_throttle", 3);
        Num("applied_throttle", 3);
        Num("engine", 3);
        Num("engine_spool_fraction", 4);
        // Continuous actuator travel: the automatic speed brake's asymmetric ramp (tau 0.50 s out,
        // 0.30 s in) would render as ~6 visible steps on the 4 Hz cold path, so it rides the hot
        // frame. The per-beat has_speed_brake capability flag stays cold.
        Num("speed_brake", 4);
        Num("engine_rpm_pct", 2);
        Num("engine_thrust_lbf", 1);
        Num("engine_net_thrust_lbf", 1);
        Bool("engine_running");
        Num("fuel_lb", 2);
        Num("fuel_flow_lb_min", 2);
        Num("fuel_flow_pph", 1);
        Num("fuel_trend_lb_min", 2);
        Nul("fuel_minutes_to_joker", 2);
        Nul("fuel_minutes_to_bingo", 2);
        Nul("fuel_endurance_minutes", 2);
        Bool("fuel_joker");
        Bool("fuel_bingo");
        Bool("fuel_minimum");
        Bool("fuel_emergency");
        Bool("rtb");
        Bool("rtb_available");
        Bool("rtb_steer");
        Num("rtb_bearing_deg", 2);
        Num("rtb_turn_deg", 2);
        Num("rtb_range_nm", 2);
        Bool("recovery_point_known");
        Bool("carrier_sortie_route_active");
        Num("carrier_sortie_route_phase_code", RawInteger);
        Num("carrier_sortie_route_fix_code", RawInteger);
        Num("carrier_sortie_route_target_x", 2);
        Num("carrier_sortie_route_target_y", 2);
        Num("carrier_sortie_route_target_z", 2);
        Num("carrier_sortie_route_target_bearing_deg", 2);
        Num("carrier_sortie_route_target_turn_deg", 2);
        Num("carrier_sortie_route_distance_m", 1);
        Num("carrier_sortie_route_target_tas_mps", 1);
        Num("carrier_sortie_route_capture_radius_m", 1);
        Bool("carrier_sortie_route_rtb_available");
        Bool("carrier_sortie_route_rtb_requested");
        Bool("straight_deck_barrier_armed");
        Bool("straight_deck_barrier_engaged");
        Bool("sortie_valid");
        Num("sortie_leg_code", RawInteger);
        Num("sortie_target_height_m", 1);
        Num("sortie_target_tas_mps", 1);
        Num("sortie_power_01", 3);
        Num("sortie_limit_code", RawInteger);
        Num("sortie_distance_to_go_m", 0);
        Num("sortie_waveoff_s", 1);
        Bool("approach_guidance_active");
        Bool("approach_valid");
        Num("approach_excess_energy_m", 0);
        Num("approach_track_required_m", 0);
        Num("approach_track_available_m", 0);
        Num("approach_extension_code", RawInteger);
        Bool("approach_in_groove");
        Bool("conventional_rtb_pattern_active");
        Num("approach_pattern_leg_code", RawInteger);
        Num("approach_energy_state_code", RawInteger);
        Num("approach_energy_target_ktas", 1);
        Num("approach_energy_tolerance_ktas", 1);
        Num("approach_next_alt_m", 1);
        Num("approach_next_tas_mps", 1);
        Num("approach_alt_error_m", 1);
        Num("approach_tas_error_mps", 1);
        Num("approach_power_01", 3);
        Num("approach_gate_count", RawInteger);
        ApproachGateSamples("approach_gates");
        Bool("runway_available");
        Nul("runway_threshold_x", 2);
        Nul("runway_threshold_y", 2);
        Nul("runway_threshold_z", 2);
        Nul("runway_heading_deg", 2);
        Nul("runway_length_m", 2);
        Nul("runway_width_m", 2);
        Nul("runway_touchdown_x", 2);
        Nul("runway_touchdown_y", 2);
        Nul("runway_touchdown_z", 2);
        Num("runway_recovery_phase", RawInteger);
        Bool("runway_weight_on_wheels");
        Bool("runway_recovery_complete");
        Bool("runway_touchdown_contact");
        Bool("runway_touchdown_survivable");
        Num("runway_touchdown_deviations", RawInteger);
        Bool("player_rtb_active");
        Nul("rtb_closure_kts", 2);
        Nul("rtb_eta_min", 2);
        Nul("fuel_to_home_estimate_lb", 2);
        Nul("fuel_on_arrival_estimate_lb", 2);
        Nul("fuel_reserve_target_lb", 2);
        Nul("fuel_reserve_margin_lb", 2);
        Num("mesh_transit_mode_code", RawInteger);
        Bool("mesh_active_known");
        Bool("mesh_active_is_place");
        Nul("mesh_active_east_m", 2);
        Nul("mesh_active_north_m", 2);
        Nul("mesh_home_east_m", 2);
        Nul("mesh_home_north_m", 2);
        Nul("mesh_dest_bearing_deg", 2);
        Nul("mesh_dest_turn_deg", 2);
        Nul("mesh_dest_range_nm", 2);
        Nul("mesh_dest_closure_kts", 2);
        Nul("mesh_dest_eta_min", 2);
        Nul("mesh_fuel_to_dest_lb", 2);
        Nul("mesh_fuel_on_arrival_dest_lb", 2);
        Nul("mesh_fuel_dest_to_home_lb", 2);
        Nul("mesh_fuel_on_arrival_home_via_dest_lb", 2);
        Nul("mesh_reserve_margin_via_dest_lb", 2);
        Num("mesh_tour_count", RawInteger);
        Num("guidance_sortie_sequence", RawInteger);
        Num("recovery_procedure_kind", RawInteger);
        Num("recovery_gate_active_index", RawInteger);
        Nul("recovery_gate_x", 2);
        Nul("recovery_gate_y", 2);
        Nul("recovery_gate_z", 2);
        Num("recovery_gate_half_m", 1);
        Num("recovery_gate_face_x", 4);
        Num("recovery_gate_face_y", 4);
        Num("recovery_gate_face_z", 4);
        Bool("recovery_gate_in_volume");
        Bool("recovery_gate_energy_ok");
        Bool("recovery_gate_config_ok");
        Nul("recovery_gate_target_ktas", 1);
        Bool("recovery_gate_dirty");
        Num("gear_nose", 4); Num("gear_left", 4); Num("gear_right", 4);
        Bool("gear_unsafe");
        Bool("gear_warning_horn");
        Bool("gear_limit_exceeded");
        Num("flap_left_deg", 2); Num("flap_right_deg", 2);
        Bool("flap_split");
        Bool("flap_limit_exceeded");
        Bool("primary_bus_powered");
        Num("utility_hydraulic_pressure_psi", 1);
        Bool("visual_merge_evaluation");
        Bool("weapons_inhibited");
        Bool("player_trigger_interlocked");
        Bool("weapons_hot_cue");
        int mergePresence = slots.Count;
        // The merge/drone presence slots are the always-emitted evaluation flags written just
        // before each block opens; pointing PresenceIndex at them avoids duplicate slots.
        OpenBlock("merge_detail", mergePresence - 4);
        Bool("first_pass_complete");
        Num("visual_merge_score", RawInteger);
        Num("minimum_merge_range_m", 1);
        Num("minimum_energy_kias", 1);
        Num("peak_closure_kts", 1);
        Num("closure_decision_score", 1);
        Bool("rear_quarter_valid");
        Num("rear_quarter_dwell_s", 2);
        Num("head_on_trigger_violations", RawInteger);
        Num("high_aspect_trigger_violations", RawInteger);
        Num("overshoot_count", RawInteger);
        Num("evaluated_projectile_rounds", RawInteger);
        Num("evaluated_projectile_hits", RawInteger);
        OpenBlock("drone_gate", -1);
        Bool("drone_raid_evaluation");
        OpenBlock("drone_detail", slots.Count - 1);
        Num("drone_raid_score", RawInteger);
        Num("drone_raid_max_score", RawInteger);
        Num("drone_raid_containment_score", RawInteger);
        Num("drone_raid_time_score", RawInteger);
        Num("drone_raid_fire_discipline_score", RawInteger);
        Num("drone_raid_targets_total", RawInteger);
        Num("drone_raid_targets_resolved", RawInteger);
        Num("drone_raid_active_target", RawInteger);
        Num("drone_raid_kills", RawInteger);
        Num("drone_raid_leakers", RawInteger);
        Bool("drone_raid_zero_leakers");
        Bool("drone_raid_finished");
        Bool("drone_raid_ownship_lost");
        Num("drone_raid_target_elapsed_s", 2);
        Nul("drone_raid_time_to_leak_s", 2);
        Num("drone_raid_average_ttn_s", 2);
        Num("drone_raid_rounds_per_kill", 2);
        Bool("drone_raid_tail_chase");
        OpenBlock("approach_mode", -1);
        Bool("approach");
        Bool("wave_off");
        // Recovery-platform presence is distinct from the maritime-only carrier flag. Rapier's
        // fixed arresting strip emits the full recovery group with carrier=false.
        OpenBlock("recovery_platform", slots.Count);
        Bool("recovery_platform");
        Bool("carrier");
        Num("cx", 2); Num("cy", 2); Num("cz", 2);
        Num("cheading", 5);
        Num("tx", 2); Num("ty", 2); Num("tz", 2);
        Num("ax", 2); Num("ay", 2); Num("az", 2);
        Num("approach_director_pitch_deg", 3);
        Num("deck_vx", 3); Num("deck_vy", 3); Num("deck_vz", 3);
        Num("deck_along", 1); Num("deck_cross", 1); Num("deck_height", 1);
        Num("difficulty_level", RawInteger);
        Num("difficulty_baseline", RawInteger);
        Num("difficulty_floor", RawInteger);
        Num("difficulty_attempt", RawInteger);
        Num("difficulty_variation", RawInteger);
        Bool("difficulty_eased");
        Bool("difficulty_spike");
        Num("clean_traps", RawInteger);
        Num("deck_pitch_deg", 3);
        Num("deck_heave_m", 3);
        Num("approach_airspeed_kts", 2);
        Num("deck_closure_kts", 2);
        Num("sink_rate_mps", 3);
        Num("sink_rate_fpm", 1);
        Num("in_close_burble", 3);
        Bool("in_close");
        Bool("bolter");
        Num("wire", RawInteger);
        Bool("carrier_pass_waveoff_required");
        Bool("carrier_pass_waveoff_complied");
        Bool("soft_trap");
        Bool("hard_trap");
        Num("arrest_speed_kts", 2);
        Num("arrest_time_s", 3);
        Num("arrest_distance_m", 2);
        Num("wire_stretch_m", 3);
        Num("wire_tension_kn", 2);
        Num("arrest_decel_g", 3);
        Num("arrest_peak_decel_g", 3);
        Num("arrest_initial_energy_mj", 4);
        Num("arrest_absorbed_energy_mj", 4);
        Num("arrest_remaining_energy_mj", 4);
        Num("arrest_peak_load_kn", 2);
        Num("arrest_residual_speed_kts", 2);
        Num("arrest_initial_closure_kts", 2);
        Bool("catapult_active");
        Num("catapult_progress", 4);
        Num("catapult_speed_kts", 2);
        Num("catapult_end_speed_kts", 2);
        CloseBlock();

        // CASEVAC has a deliberately separate block. It is not part of Blocks: legacy decoding must
        // never overlay these duplicate field names, and CASEVAC decoding must never walk the
        // always-present combat core. The browser selects exactly one projection family from the
        // cold snapshot's casevac_mission discriminator.
        int casevacStart = slots.Count;
        Bool("__casevac_hot_present");
        Num("t", 4);
        Num("tick", RawInteger);
        Num("px", 3); Num("py", 3); Num("pz", 3);
        Num("vx", 3); Num("vy", 3); Num("vz", 3);
        Num("pfx", 5); Num("pfy", 5); Num("pfz", 5);
        Num("plx", 5); Num("ply", 5); Num("plz", 5);
        Num("pux", 5); Num("puy", 5); Num("puz", 5);
        Num("casevac_pitch_deg", 3);
        Num("casevac_bank_deg", 3);
        Num("casevac_heading_deg", 3);
        Num("casevac_active_mission_ticks", RawInteger);
        Bool("casevac_clock_running");
        Bool("casevac_quiet");
        Num("casevac_quiet_progress_01", 4);
        Nul("casevac_target_x", 3);
        Nul("casevac_target_y", 3);
        Nul("casevac_target_z", 3);
        Nul("casevac_target_range_m", 1);
        Nul("casevac_target_bearing_deg", 2);
        Nul("casevac_target_relative_bearing_deg", 2);
        Nul("casevac_target_eta_s", 1);
        Num("casevac_call_age_s", 3);
        Bool("casevac_requested_window_passed");
        Nul("casevac_capsule_secured_call_age_s", 3);
        Nul("casevac_handoff_call_age_s", 3);
        Bool("casevac_stable_contact");
        Bool("casevac_surface_contact");
        Num("casevac_approach_attempt_id", RawInteger);
        Num("casevac_stabilization_progress_ticks", RawInteger);
        Num("casevac_stabilization_required_ticks", RawInteger);
        Num("casevac_dwell_progress_01", 4);
        Num("casevac_operation_progress_ticks", RawInteger);
        Num("casevac_operation_required_ticks", RawInteger);
        Bool("casevac_vehicle_flyable");
        Bool("casevac_contact_stable");
        Num("casevac_agl_m", 3);
        Num("casevac_gross_mass_kg", 2);
        Num("casevac_payload_mass_kg", 2);
        Nul("casevac_power_margin_fraction", 4);
        Nul("casevac_power_margin_01", 4);
        Nul("casevac_available_power_w", 1);
        Nul("casevac_applied_power_w", 1);
        Num("casevac_energy_remaining_kwh", 4);
        Num("casevac_energy_remaining_fraction", 6);
        Num("casevac_energy_planning_endurance_s", 3);
        Num("casevac_energy_planning_endurance_min", 3);
        Bool("casevac_energy_depleted");
        Nul("casevac_destination_energy_transit_s", 3);
        Nul("casevac_destination_reserve_kwh", 4);
        Nul("casevac_destination_reserve_fraction", 6);
        Nul("casevac_destination_reserve_endurance_s", 3);
        Nul("casevac_destination_reserve_min", 3);
        Bool("casevac_within_safe_masking_band");
        Num("casevac_lateral_speed_mps", 3);
        Num("casevac_vertical_speed_mps", 3);
        Num("casevac_wind_x_mps", 3);
        Num("casevac_wind_y_mps", 3);
        Num("casevac_wind_z_mps", 3);
        Num("casevac_visibility_m", 1);
        Num("casevac_precipitation_mm_hr", 3);
        Num("casevac_precipitation_01", 4);
        Num("casevac_rotor_wash_intensity_01", 4);
        Num("casevac_rotor_wash_radius_m", 2);
        Bool("casevac_show_escape_cue");
        CasevacBlock = new BlockDef(
            "casevac",
            casevacStart,
            casevacStart,
            slots.Count - casevacStart);

        SlotCount = Slots.Count;
        _ = i; _ = blockStart;
    }

    /// <summary>
    /// Fill the buffer from the live session. Call after every Session.Advance (and instead of it
    /// while the JS loop holds the simulation paused) so slot values and the cold version are
    /// coherent when the browser reads the shared view later in the same frame.
    /// </summary>
    public static void Fill(double[] buffer, SimulationSession session,
        double worldOriginEastM, double worldOriginNorthM, bool worldOriginConfigured) {
        if (buffer.Length != SlotCount)
            throw new ArgumentException(
                $"hot frame buffer length {buffer.Length} != layout slot count {SlotCount}");

        if (session.CasevacMission) {
            FillCasevac(
                buffer,
                session,
                worldOriginEastM,
                worldOriginNorthM,
                worldOriginConfigured);
            return;
        }

        _lastCasevacFingerprint = null;
        ColdFingerprint fingerprint = ColdFingerprint.Capture(
            session, worldOriginEastM, worldOriginNorthM, worldOriginConfigured);
        if (_lastFingerprint is not { } last || !fingerprint.Equals(last))
            _coldVersion++;
        _lastFingerprint = fingerprint;

        // ---- Derivation prologue: duplicated from SnapshotProjection.BuildState on purpose ----
        AircraftSim player = session.Player;
        bool opponentPresent = session.OpponentPresent;
        IBandit? bandit = opponentPresent ? session.Bandit : null;
        BeatSetup beat = session.Beat;
        DetentLayer detents = session.Controls;
        PilotCommand requestedCommand = detents.Command;
        PilotCommand appliedCommand = player.LastAppliedCommand;
        double playerAlphaRad = player.AngleOfAttackRad;
        bool f22LateralAllocation = beat.PlayerAir.HighAlphaModel
            == HighAlphaModelKind.F22PublicDataSurrogate;
        double f22AriGain = f22LateralAllocation
            ? FlightModel.F22AileronRudderInterconnect(playerAlphaRad) : 0.0;
        double f22AriRudder = f22AriGain * Math.Clamp(
            appliedCommand.RollControl + appliedCommand.SasRollControl, -1.0, 1.0);
        double effectiveRudderCommand = f22LateralAllocation
            ? FlightModel.F22EffectiveRudderCommand(playerAlphaRad, appliedCommand)
            : appliedCommand.Rudder;
        double stabilityYawRateDps = (player.State.BodyRates.R * Math.Cos(playerAlphaRad)
            - player.State.BodyRates.P * Math.Sin(playerAlphaRad)) * 57.29577951308232;
        bool lateralControlApplied = player.HasAppliedFlightCommand;
        GunKill? gunKill = opponentPresent ? session.PlayerGun : null;
        GunKill? opponentGun = opponentPresent ? session.OpponentGun : null;
        GunProfile playerGunProfile = gunKill?.Profile
            ?? beat.CombatRules.PlayerGunProfile;
        FuelModel fuel = session.PlayerFuel;
        AirframeSystems systems = session.PlayerSystems;
        PilotPhysiologyState physiology = session.PilotPhysiologyState;
        AutoGcasState autoGcas = session.AutoGcas;
        AutoGcasPrediction gcasPrediction = autoGcas.Prediction;
        GunneryPitchAssistState pitchAssist = session.GunneryPitchAssist;
        PadlockRollAssistState padlockRollAssist =
            session.PlayerGunTargetPadlockRollAssist;
        Carrier? carrier = session.Carrier;
        Carrier.Recovery recovery = session.Recovery;
        Carrier.TouchdownResult touchdown = session.Touchdown;
        ArrestmentModel arrestment = session.Arrestment;
        CatapultLaunchModel catapult = session.Catapult;
        double simTimeMs = session.TimeMilliseconds;
        bool finished = session.Lifecycle == SimulationSession.LifecycleState.Finished;

        bool catapulting = catapult.IsActive;
        AircraftState s = catapulting ? catapult.State : player.State;
        AircraftState b = bandit?.State ?? default;
        AircraftState gunTarget = opponentPresent
            ? session.SelectedOpponentState
            : default;
        OpponentPilotTelemetry? selectedOpponentPilot =
            session.SelectedOpponentPilotTelemetry;
        PilotCommand? selectedOpponentLastCommand =
            selectedOpponentPilot?.LastCommand;
        bool arrested = arrestment.IsActive && !catapulting;
        Vec3D simulationPosition = arrested ? arrestment.Position : s.Position;
        Vec3D playerPosition = simulationPosition;
        Vec3D groundVelocity;
        Vec3D airVelocity;
        if (catapulting) {
            groundVelocity = s.VelocityVector();
            airVelocity = carrier?.IsMaritime == true
                ? groundVelocity - carrier.SteadyWindWorld
                : player.AirVelocity;
        } else if (arrested && carrier is not null) {
            groundVelocity = carrier.DeckVelocityWorld
                + carrier.LandingFwd * arrestment.RelativeSpeedMps
                + new Vec3D(0.0, carrier.DeckVerticalVelocityMps, 0.0);
            airVelocity = carrier.IsMaritime
                ? groundVelocity - carrier.SteadyWindWorld
                : player.AirVelocity;
        } else {
            groundVelocity = s.VelocityVector();
            airVelocity = player.AirVelocity;
        }
        double trueAirspeedMps = airVelocity.Length;
        IAtmosphereModel atmosphere = player.AtmosphereModel;
        AtmosphericState atmosphericState = atmosphere.Sample(playerPosition.Y);
        double indicatedAirspeedMps = AirData.IndicatedAirspeedMps(
            trueAirspeedMps, playerPosition.Y, atmosphere);
        double equivalentAirspeedMps = AirData.EquivalentAirspeedMps(
            trueAirspeedMps, playerPosition.Y, atmosphere);
        double mach = trueAirspeedMps / atmosphericState.SpeedOfSoundMps;
        // Keep the three physical channels separate:
        // - lagged wall skin is a provisional structural-soak surrogate;
        // - recovery temperature is the instantaneous turbulent flat-skin equilibrium target;
        // - stagnation T0 is the thermodynamic upper bound at an inlet lip / leading edge.
        // Build 174 put the first value in a field named "stagnation", making the HUD comparison
        // physically ambiguous. The canonical fields below make location and time response explicit.
        double rapierRecoveryTempC =
            AirData.AdiabaticWallTemperatureK(mach, atmosphericState.TemperatureK) - 273.15;
        double rapierSkinTempC = player.SkinTemperatureK > 0.0
            ? player.SkinTemperatureK - 273.15
            : rapierRecoveryTempC;
        double rapierStagnationTempC =
            AirData.StagnationTemperatureK(mach, atmosphericState.TemperatureK) - 273.15;
        double rapierThermalBasisK = session.Beat.PlayerAir.AerothermalLimitReference
            == AerothermalLimitReferenceKind.StagnationTemperature
                ? AirData.StagnationTemperatureK(mach, atmosphericState.TemperatureK)
                : AirData.AdiabaticWallTemperatureK(mach, atmosphericState.TemperatureK);
        double rapierThermalEffectiveC = AirData.EffectiveAerothermalZoneTemperatureK(
            atmosphericState.TemperatureK,
            rapierThermalBasisK,
            session.Beat.PlayerAir.AerothermalAdiabaticRiseFraction) - 273.15;
        double? rapierThermalCapabilityC = session.RapierMissionAvailable
            && session.Beat.PlayerAir.SkinTemperatureLimitK > 0.0
                ? session.Beat.PlayerAir.SkinTemperatureLimitK - 273.15
                : null;
        double? rapierThermalMarginC = rapierThermalCapabilityC is { } thermalCapabilityC
            ? thermalCapabilityC - rapierSkinTempC
            : null;
        double? rapierCmcCapabilityC = session.RapierMissionAvailable
            ? RapierV2Design.CmcHotEdgeLimitK - 273.15
            : null;
        double? rapierCmcMarginC = rapierCmcCapabilityC is { } cmcCapabilityC
            ? cmcCapabilityC - rapierStagnationTempC
            : null;
        // Minutes to the contact at present closure; negative means "do not show". Inside 20 km
        // the geometry is a fight rather than a transit and the number churns uselessly.
        double interceptEtiMinutes = -1.0;
        {
            Vec3D etiDelta = opponentPresent
                ? bandit!.State.Position - session.Player.State.Position
                : Vec3D.Zero;
            double etiRangeM = etiDelta.Length;
            if (opponentPresent && etiRangeM >= 20_000.0) {
                Vec3D etiRelative = session.Player.State.VelocityVector()
                    - bandit!.State.VelocityVector();
                double etiClosure = etiRelative.Dot(etiDelta) / Math.Max(1.0, etiRangeM);
                if (etiClosure > 1.0) interceptEtiMinutes = etiRangeM / etiClosure / 60.0;
            }
        }
        Vec3D localWindVelocity = groundVelocity - airVelocity;
        double simulationTimeSeconds = simTimeMs / 1000.0;
        CloudSample localCloud = (session.Weather?.Clouds ?? ClearCloudField.Instance)
            .Sample(playerPosition, simulationTimeSeconds);
        PrecipitationSample localPrecipitation =
            (session.Weather?.Precipitation ?? ClearPrecipitationField.Instance)
                .Sample(playerPosition, simulationTimeSeconds);
        SurfaceConditionSample localSurface =
            (session.Weather?.SurfaceConditions ?? UniformSurfaceConditionField.ClearDry)
                .Sample(playerPosition.X, playerPosition.Z, simulationTimeSeconds);
        double localVisibilityM = Math.Min(
            localCloud.VisibilityM,
            localPrecipitation.VisibilityM);
        double groundSpeedMps = Math.Sqrt(
            groundVelocity.X * groundVelocity.X + groundVelocity.Z * groundVelocity.Z);
        double positiveLoadFactor = Math.Max(1.0,
            Math.Max(player.LastNz,
                lateralControlApplied ? appliedCommand.GDemand : 0.0));
        double configuredLiftIncrement =
            session.PlayerAerodynamicConfiguration.LiftCoefficientIncrement;
        double stallSpeedKias = AirData.StallSpeedKiasAtAltitude(
            s.Mass, beat.PlayerAir, playerPosition.Y, 1.0, configuredLiftIncrement, atmosphere);
        double acceleratedStallSpeedKias = AirData.StallSpeedKiasAtAltitude(
            s.Mass, beat.PlayerAir, playerPosition.Y, positiveLoadFactor,
            configuredLiftIncrement, atmosphere);
        double cornerSpeedKias = AirData.PositiveCornerSpeedKiasAtAltitude(
            s.Mass, beat.PlayerAir, playerPosition.Y, configuredLiftIncrement, atmosphere);
        bool waveOff = session.WaveOffActive;

        Vec3D bl = bandit?.LiftDir ?? Vec3D.Zero;
        Vec3D bf = opponentPresent ? b.ForwardDir() : Vec3D.Zero;
        Vec3D pf;
        Vec3D pl;
        if (catapulting) {
            pf = s.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            pl = s.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        } else {
            player.BodyFrame(out pf, out pl);
        }

        double displayPitchRad = Math.Asin(Math.Clamp(pf.Y, -1.0, 1.0));
        double displayBankRad = catapulting ? 0.0 : player.BodyRollRad;
        double displayHeadingRad = Math.Atan2(pf.X, pf.Z);
        double displayGammaRad = s.Gamma;
        if (arrested && carrier is not null) {
            displayPitchRad = arrestment.NosePitchRad;
            displayBankRad = 0.0;
            displayHeadingRad = carrier.LandingHeadingRad;
            displayGammaRad = 0.0;
            double cosPitch = Math.Cos(displayPitchRad);
            double sinPitch = Math.Sin(displayPitchRad);
            pf = carrier.LandingFwd * cosPitch + new Vec3D(0, sinPitch, 0);
            pl = carrier.LandingFwd * -sinPitch + new Vec3D(0, cosPitch, 0);
        }

        RecoveryPlan? recoveryPlan = beat.RecoveryPlan;
        ConventionalRunwayGeometry? conventionalRunway =
            recoveryPlan?.ConventionalRunway;
        Vec3D? recoveryPoint = recoveryPlan?.Position
            ?? (carrier is null ? null : carrier.Position);
        bool playerRtbActive = session.PlayerRtbActive;
        RecoveryNavigationProjection recoveryNavigation =
            session.ConventionalRunwayPhase == RunwayRecoveryPhase.Recovered
                ? fuel.ProjectCompletedRecovery(
                    simulationPosition,
                    displayHeadingRad,
                    recoveryPlan?.RequiredLandingReserveLb)
                : recoveryPoint is { } home
                    ? fuel.ProjectRecoveryTo(
                        simulationPosition,
                        groundVelocity,
                        displayHeadingRad,
                        home,
                        recoveryPlan?.RequiredLandingReserveLb,
                        active: playerRtbActive || fuel.RtbAdvisory)
                    : RecoveryNavigationProjection.Unknown;
        RtbGuidance rtb = recoveryNavigation.Guidance;
        CarrierSortieRouteState carrierRoute = session.CarrierSortieRoute;
        Vec3D routeDelta = carrierRoute.TargetPosition - playerPosition;
        double carrierRouteBearingRad = carrierRoute.Active
            ? Math.Atan2(routeDelta.X, routeDelta.Z)
            : 0.0;
        double carrierRouteTurnRad = carrierRoute.Active
            ? Math.IEEERemainder(carrierRouteBearingRad - displayHeadingRad,
                2.0 * Math.PI)
            : 0.0;
        double carrierRouteBearingDeg =
            ((carrierRouteBearingRad * 57.29577951308232) % 360.0 + 360.0) % 360.0;
        bool splashCue = !finished && session.SplashCueActive;
        double surfaceAltitudeM = session.Terrain?.TrySample(
            playerPosition.X, playerPosition.Z, out TerrainSample terrainSample) == true
                ? terrainSample.HeightM : 0.0;
        double supportReferenceHeightM = 0.0;
        if (carrier is not null
            && session.Catapult.TryLaunchSupportSurfaceHeight(
                carrier,
                playerPosition,
                RapierLaunchSite.AircraftHalfSpanM + 0.5,
                out double launchSurfaceHeightM)) {
            surfaceAltitudeM = launchSurfaceHeightM;
            supportReferenceHeightM = carrier.AircraftSupportReferenceHeightM;
        } else if (carrier is not null && carrier.WithinDeckFootprint(playerPosition)) {
            surfaceAltitudeM = playerPosition.Y - carrier.DeckFrame(playerPosition).height;
            supportReferenceHeightM = carrier.AircraftSupportReferenceHeightM;
        }
        if (session.ConventionalRunwayRecovery?.Runway is { } runway
            && runway.ContainsPavement(playerPosition, marginM: 2.0))
            surfaceAltitudeM = runway.Threshold.Y;
        double radarAltitudeM = Math.Max(0.0, playerPosition.Y - surfaceAltitudeM);
        double supportClearanceM =
            playerPosition.Y - supportReferenceHeightM - surfaceAltitudeM;
        bool belowGround = supportClearanceM < -RapierLaunchSite.SurfaceContactToleranceM;
        double verticalSpeedMps = arrested ? 0.0 : s.VelocityVector().Y;
        var engine = player.LastEngineOperatingPoint;
        double sustainedG = Protection.SustainedG(s, beat.PlayerAir,
            trueAirspeedMps, engine.NetThrustN,
            session.PlayerAerodynamicConfiguration, atmosphere);
        // ---- End of duplicated prologue ----

        var w = new Writer(buffer);
        w.Num("cold_version", _coldVersion, RawInteger);
        w.Num("t", simTimeMs / 1000.0, 4);
        w.Num("simulation_time_s", simulationTimeSeconds, 3);
        w.Num("tick", session.Tick, RawInteger);
        w.Bool("time_compression_available", session.TimeCompressionAvailable);
        w.Bool("time_compression_enabled", session.TimeCompressionPilotEnabled);
        w.Bool("time_compression_eligible", session.TimeCompressionEligible);
        w.Num("time_compression_requested_factor",
            session.TimeCompressionRequestedFactor, RawInteger);
        w.Num("time_compression_safety_factor_cap",
            session.TimeCompressionSafetyFactorCap, RawInteger);
        w.Num("time_compression_factor", session.TimeCompressionFactor, RawInteger);
        w.Bool("rapier_mission_available", session.RapierMissionAvailable);
        RapierServiceLifeSortieRecord? serviceLife =
            session.RapierServiceLife.LatestRecord;
        w.Bool("service_life_record_available", serviceLife is not null);
        w.Num("service_life_record_sequence",
            serviceLife?.RecordSequence ?? 0L, RawInteger);
        w.Bool("service_life_capture_active", session.RapierServiceLife.Active);
        w.Bool("service_life_exceedance_review_required",
            serviceLife?.ExceedanceReviewRequired == true);
        w.Num("service_life_over_structural_limit_s",
            (serviceLife?.Mechanical.StructuralLimitExceedanceTicks ?? 0L)
                / AircraftSim.TickHz,
            3);
        w.Num("service_life_over_dynamic_pressure_s",
            (serviceLife?.Mechanical.DynamicPressureLimitExceedanceTicks ?? 0L)
                / AircraftSim.TickHz,
            3);
        w.Num("service_life_max_g",
            (serviceLife?.Mechanical.MaximumLoadMilliG ?? 0L) / 1000.0,
            3);
        w.Num("service_life_max_dynamic_pressure_kpa",
            (serviceLife?.Mechanical.MaximumDynamicPressurePa ?? 0L) / 1000.0,
            2);
        w.Num("service_life_min_thermal_margin_c",
            (serviceLife?.ThermalProxy.MinimumThermalMarginMilliK ?? 0L)
                / 1000.0,
            1);
        w.Bool("rapier_pattern_only", session.Beat.ScriptedIntercept?.PatternOnly == true);
        w.Bool("rapier_automation_enabled", session.RapierAutomationEnabled);
        w.Bool("rapier_automation_active", session.RapierAutomationActive);
        w.Num("rapier_computer_failure_plan_code",
            (int)session.RapierComputerFailurePlan, RawInteger);
        w.Num("rapier_computer_failure_active_code",
            (int)session.RapierComputerFailureActive, RawInteger);
        w.Bool("rapier_mission_computer_available", session.RapierMissionComputerAvailable);
        w.Bool("rapier_flight_control_computers_available",
            session.RapierFlightControlComputersAvailable);
        w.Bool("rapier_uncontrolled_reentry", session.RapierUncontrolledReentry);
        w.Num("rapier_mission_phase", (int)session.RapierPhase, RawInteger);
        w.Num("rapier_target_mach", session.RapierTargetMach, 2);
        w.Num("rapier_target_altitude_ft", session.RapierTargetAltitudeFt, 0);
        w.Num("rapier_missiles_remaining", session.RapierMissilesRemaining, RawInteger);
        w.Num("rapier_gun_drones_remaining",
            session.RapierDogfightingDronesRemaining, RawInteger);
        w.Bool("rapier_missile_in_flight", session.RapierMissileInFlight);
        w.Num("rapier_missile_tti_s", session.RapierMissileTimeToImpactSeconds, 2);
        w.Bool("rapier_pursuit_active", session.RapierPursuitActive);
        w.Num("rapier_pursuer_count", session.RapierPursuerCount, RawInteger);
        w.Num("rapier_pursuit_range_m", session.RapierPursuitRangeM, 1);
        w.Bool("rapier_balloon_reaction_active", session.RapierBalloonReactionActive);
        w.Num("rapier_balloon_reaction_seconds",
            session.RapierBalloonReactionSecondsRemaining, 2);
        w.Bool("rapier_balloon_payload_deployed", session.RapierBalloonPayloadDeployed);
        w.Num("rapier_balloon_carriers_remaining",
            session.RapierMissionAvailable
                && session.Beat.ScriptedIntercept?.Job == RapierJobKind.Balloon
                    ? session.LiveOpponentCount : 0,
            RawInteger);
        w.Num("rapier_guidance_x", session.RapierGuidanceWaypoint.X, 3);
        w.Num("rapier_guidance_y", session.RapierGuidanceWaypoint.Y, 3);
        w.Num("rapier_guidance_z", session.RapierGuidanceWaypoint.Z, 3);
        w.Num("rapier_recovery_gate", session.RapierRecoveryGate, RawInteger);
        w.Num("rapier_circuit_leg_code", CircuitLegCode(session.RapierCircuitLeg), RawInteger);
        w.Bool("radio_active", session.MissionRadio.Active);
        w.Num("radio_sequence", session.MissionRadio.Sequence, RawInteger);
        w.Num("radio_priority", (int)session.MissionRadio.Priority, RawInteger);
        w.Num("radio_started_s", session.MissionRadio.StartedAtSeconds, 3);
        w.Num("radio_ends_s", session.MissionRadio.EndsAtSeconds, 3);
        w.Bool("rapier_radio_active", session.MissionRadio.Active);
        w.Num("rapier_radio_sequence", session.MissionRadio.Sequence, RawInteger);
        w.Num("rapier_radio_priority", (int)session.MissionRadio.Priority, RawInteger);
        w.Num("rapier_radio_started_s", session.MissionRadio.StartedAtSeconds, 3);
        w.Num("rapier_radio_ends_s", session.MissionRadio.EndsAtSeconds, 3);
        w.Bool("checklist_active", session.MissionChecklist.Active);
        w.Num("checklist_id", (int)session.MissionChecklist.Id, RawInteger);
        w.Num("checklist_done", session.MissionChecklist.Done, RawInteger);
        w.Num("checklist_total", session.MissionChecklist.Total, RawInteger);
        w.Num("rapier_fd_bank_deg", session.RapierFdBankDeg, 1);
        w.Num("rapier_fd_target_ktas", session.RapierFdTargetKtas, 0);
        w.Num("rapier_gate_half_m", session.RapierGateHalfM, 1);
        w.Num("rapier_gate_face_x", session.RapierGateFace.X, 4);
        w.Num("rapier_gate_face_y", session.RapierGateFace.Y, 4);
        w.Num("rapier_gate_face_z", session.RapierGateFace.Z, 4);
        w.Bool("rapier_gate_in_volume", session.RapierGateInVolume);
        w.Bool("rapier_gate_energy_ok", session.RapierGateEnergyOk);
        w.Num("rapier_nose_on_v_err_deg", session.RapierNoseOnVelocityErrorDeg, 1);
        w.Num("rapier_target_gamma_deg", session.RapierTargetGammaDeg, 2);
        w.Num("rapier_lob_skip", session.RapierLobSkip, RawInteger);
        w.Num("rapier_lob_skip_max", session.RapierLobSkipMax, RawInteger);
        w.Num("rapier_rcs_gas_frac", session.RapierRcsGasFraction, 3);
        w.Num("rapier_rcs_authority", session.RapierRcsAuthority, 3);
        w.Num("rapier_rcs_moment_nm", session.RapierRcsMomentMagnitudeNm, 1);
        w.Num("rapier_rcs_firing_frac", session.RapierRcsFiringFraction, 3);
        w.Num("rapier_inlet_recovery", player.InletFlowRecovery, 3);
        w.Bool("rapier_inlet_distorted", player.InletDistorted);
        w.Bool("rapier_inlet_unstart", player.InletUnstarted);
        w.Num("rapier_normal_alpha_limit_deg",
            RapierAerodynamics.NormalLawAlphaLimitRad(mach) * 57.29577951308232, 2);
        w.Bool("rapier_zoom_lob", session.Beat.ScriptedIntercept?.ZoomLobProfile == true);
        w.Num("rapier_commanded_mach", session.RapierCommandedMach, 2);
        w.Num("rapier_skin_mach_limit",
            double.IsFinite(session.RapierSkinMachLimit) ? session.RapierSkinMachLimit : 0.0, 2);
        w.Nul("rapier_material_mach_ceiling",
            session.RapierMissionAvailable && double.IsFinite(session.RapierSkinMachLimit)
                ? session.RapierSkinMachLimit : null, 2);
        w.Num("rapier_authored_target_mach", session.RapierAuthoredTargetMach, 2);
        w.Num("rapier_turbine_thrust_lbf",
            session.RapierTurbineThrustN / J47PerformanceMap.NewtonsPerPoundForce, 0);
        w.Num("rapier_ramjet_thrust_lbf",
            session.RapierRamjetThrustN / J47PerformanceMap.NewtonsPerPoundForce, 0);
        w.Num("rapier_turbine_thrust_kn", session.RapierTurbineThrustN / 1000.0, 2);
        w.Num("rapier_ramjet_thrust_kn", session.RapierRamjetThrustN / 1000.0, 2);
        w.Num("rapier_drag_lbf",
            player.LastAerodynamicDragN / J47PerformanceMap.NewtonsPerPoundForce, 1);
        w.Num("rapier_dynamic_pressure_limit_kpa",
            RapierAerodynamics.HighDynamicPressurePlacardPa / 1000.0, 2);
        w.Num("rapier_relight_dynamic_pressure_kpa",
            RapierMissionDirector.RelightDynamicPressurePa / 1000.0, 2);
        w.Num("rapier_turbine_fuel_ppm", session.RapierTurbineFuelFlowLbPerMinute, 2);
        w.Num("rapier_ramjet_fuel_ppm", session.RapierRamjetFuelFlowLbPerMinute, 2);
        w.Num("rapier_skin_temp_c", rapierSkinTempC, 0);
        w.Num("rapier_recovery_temp_c", rapierRecoveryTempC, 0);
        w.Num("rapier_stagnation_temp_c", rapierStagnationTempC, 0);
        w.Num("rapier_thermal_effective_temp_c", rapierThermalEffectiveC, 0);
        w.Nul("rapier_thermal_capability_c", rapierThermalCapabilityC, 0);
        w.Nul("rapier_cmc_capability_c", rapierCmcCapabilityC, 0);
        w.Nul("rapier_cmc_margin_c", rapierCmcMarginC, 0);
        w.Nul("rapier_thermal_margin_c", rapierThermalMarginC, 0);
        w.Num("player_gross_lb", session.Player.State.Mass * 2.20462262, 0);
        w.Num("rapier_intercept_eti_min", interceptEtiMinutes, 1);
        w.Num("px", playerPosition.X, 3); w.Num("py", playerPosition.Y, 3); w.Num("pz", playerPosition.Z, 3);
        w.Num("vx", groundVelocity.X, 3); w.Num("vy", groundVelocity.Y, 3); w.Num("vz", groundVelocity.Z, 3);
        w.Num("pfx", pf.X, 5); w.Num("pfy", pf.Y, 5); w.Num("pfz", pf.Z, 5);
        w.Num("plx", pl.X, 5); w.Num("ply", pl.Y, 5); w.Num("plz", pl.Z, 5);
        w.Bool("opponent_present", opponentPresent);
        w.Num("bx", b.Position.X, 3); w.Num("by", b.Position.Y, 3); w.Num("bz", b.Position.Z, 3);
        w.Num("bfx", bf.X, 5); w.Num("bfy", bf.Y, 5); w.Num("bfz", bf.Z, 5);
        w.Num("blx", bl.X, 5); w.Num("bly", bl.Y, 5); w.Num("blz", bl.Z, 5);
        w.Nul("selected_opponent_tactic_code",
            selectedOpponentPilot?.Tactic is { } selectedTactic
                ? (int)selectedTactic : null,
            RawInteger);
        w.Nul("selected_opponent_last_command_load_factor_g",
            selectedOpponentLastCommand?.GDemand, 3);
        w.Nul("selected_opponent_last_command_bank_target_deg",
            selectedOpponentLastCommand?.BankTarget * RadiansToDegrees, 3);
        w.Nul("selected_opponent_last_command_throttle",
            selectedOpponentLastCommand?.Throttle, 3);
        w.Nul("selected_opponent_last_command_rudder",
            selectedOpponentLastCommand?.Rudder, 3);
        bool topGun = TopGunFightRuntime.IsTopGunMission(session.Beat.MissionIdentity.Id);
        bool aim9Mission = topGun
            || FirstRunValleyRuntime.IsFirstRunValleyMission(session.Beat.MissionIdentity.Id);
        bool playerTomcat = topGun
            && session.Beat.PlayerAircraft.Id == AircraftCapability.F14ASurrogate.Id;
        Aim9Telemetry aim9 = session.Aim9Telemetry;
        bool aim9PoseValid = aim9Mission && aim9.State != Aim9FlightState.Safe;
        w.Nul("wing_sweep_deg", topGun ? session.PlayerF14WingSweepDegrees : null, 1);
        w.Nul("opponent_wing_sweep_deg",
            topGun ? session.OpponentF14WingSweepDegrees : null, 1);
        w.Nul("wing_sweep_command_deg",
            playerTomcat ? session.PlayerF14WingSweepCommandDegrees : null, 1);
        w.Num("wing_sweep_mode_code",
            playerTomcat ? (int)session.PlayerF14WingSweepMode : 0, RawInteger);
        w.Nul("f14_g_limit_g", playerTomcat ? TopGunFightRuntime.F14NormalLimitG : null, 1);
        w.Nul("f14_override_limit_g",
            playerTomcat ? TopGunFightRuntime.F14OverrideCommandLimitG : null, 1);
        w.Bool("f14_over_g", playerTomcat && session.PlayerF14OverLimit);
        w.Num("f14_over_g_seconds",
            playerTomcat ? session.PlayerF14OverLimitSeconds : 0.0, 3);
        w.Num("f14_structural_fatigue_01",
            playerTomcat ? session.PlayerF14StructuralFatigue01 : 0.0, 4);
        w.Bool("f14_structural_failed",
            playerTomcat && session.PlayerF14StructuralFailed);
        w.Bool("first_run_weapons_cold", session.FirstRunWeaponsCold);
        bool firstRunValleyAvailable = FirstRunValleyRuntime.IsFirstRunValleyMission(
                session.Beat.MissionIdentity.Id)
            && session.Terrain is FirstRunValleyTerrainSurface;
        w.Bool("first_run_valley_available", firstRunValleyAvailable);
        w.Nul("first_run_valley_geometry_version",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.GeometryVersion : null,
            RawInteger);
        w.Nul("first_run_valley_center_east_m",
            firstRunValleyAvailable ? FirstRunValleyRuntime.ValleyEastM : null, 1);
        w.Nul("first_run_valley_entry_north_m",
            firstRunValleyAvailable ? FirstRunValleyRuntime.PlayerNorthM : null, 1);
        w.Nul("first_run_valley_popout_north_m",
            firstRunValleyAvailable ? FirstRunValleyRuntime.PopOutNorthM : null, 1);
        w.Nul("first_run_valley_route_alt_m",
            firstRunValleyAvailable ? FirstRunValleyRuntime.SpawnAltitudeM : null, 1);
        w.Nul("first_run_valley_floor_height_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.FloorHeightM : null, 1);
        w.Nul("first_run_valley_floor_blend_drop_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.FloorBlendDropM : null, 1);
        w.Nul("first_run_valley_floor_half_width_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.FloorHalfWidthM : null, 1);
        w.Nul("first_run_valley_crest_offset_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.CrestOffsetM : null, 1);
        w.Nul("first_run_valley_outer_offset_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.OuterOffsetM : null, 1);
        w.Nul("first_run_valley_west_ridge_rise_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.WestRidgeRiseM : null, 1);
        w.Nul("first_run_valley_east_ridge_rise_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.EastRidgeRiseM : null, 1);
        w.Nul("first_run_valley_curve_amplitude_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.CentreCurveAmplitudeM : null, 1);
        w.Nul("first_run_valley_curve_wavelength_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.CentreCurveWavelengthM : null, 1);
        w.Nul("first_run_valley_centerline_component_count",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.CentrelineComponentCount : null,
            RawInteger);
        w.Nul("first_run_valley_side_cut_count",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.SideCutCount : null,
            RawInteger);
        w.Nul("first_run_valley_butte_count",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.ButteCount : null,
            RawInteger);
        w.Nul("first_run_valley_side_cut_depth_01",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.SideCutDepth01 : null, 3);
        w.Nul("first_run_valley_strata_step_height_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.StrataStepHeightM : null, 1);
        w.Nul("first_run_valley_strata_bench_fraction",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.StrataBenchFraction : null, 3);
        w.Nul("first_run_valley_south_extent_north_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.SouthExtentNorthM : null, 1);
        w.Nul("first_run_valley_south_full_north_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.SouthFullNorthM : null, 1);
        w.Nul("first_run_valley_popout_fade_start_north_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.PopOutFadeStartNorthM : null, 1);
        w.Nul("first_run_valley_north_extent_north_m",
            firstRunValleyAvailable ? FirstRunValleyTerrainSurface.NorthExtentNorthM : null, 1);
        w.Nul("aim9_remaining", aim9Mission ? session.Aim9Remaining : null, RawInteger);
        w.Bool("aim9_in_flight", session.Aim9InFlight);
        w.Bool("aim9_pose_valid", aim9PoseValid);
        w.Num("aim9_state_code", aim9Mission ? (int)aim9.State : 0, RawInteger);
        w.Nul("aim9_x", aim9PoseValid ? aim9.Position.X : null, 3);
        w.Nul("aim9_y", aim9PoseValid ? aim9.Position.Y : null, 3);
        w.Nul("aim9_z", aim9PoseValid ? aim9.Position.Z : null, 3);
        w.Nul("aim9_vx", aim9PoseValid ? aim9.Velocity.X : null, 3);
        w.Nul("aim9_vy", aim9PoseValid ? aim9.Velocity.Y : null, 3);
        w.Nul("aim9_vz", aim9PoseValid ? aim9.Velocity.Z : null, 3);
        WriteWingman(ref w, session, 0, "w1");
        WriteWingman(ref w, session, 1, "w2");
        WriteWingman(ref w, session, 2, "w3");
        w.Nul("formation_coordination_age_s",
            session.FormationCoordinationAgeSeconds is { } coordinationAgeSeconds
                && double.IsFinite(coordinationAgeSeconds)
                && coordinationAgeSeconds >= 0.0
                    ? coordinationAgeSeconds
                    : null,
            3);
        w.Bool("formation_coordination_stale",
            session.FormationCoordinationStale);
        w.Bool("formation_coordination_health_stale",
            session.FormationCoordinationHealthStale);
        WriteRapierGunDrone(ref w, session);
        w.Num("buffet_pitch_deg", player.PitchBuffetRad * 57.2958, 3);
        w.Num("buffet_roll_deg", player.RollBuffetRad * 57.2958, 3);
        w.Num("buffet_yaw_deg", player.YawBuffetRad * 57.2958, 3);
        w.Num("indicated_airspeed_kts", indicatedAirspeedMps * AirData.MpsToKnots, 2);
        w.Num("calibrated_airspeed_kts", indicatedAirspeedMps * AirData.MpsToKnots, 2);
        w.Num("equivalent_airspeed_kts", equivalentAirspeedMps * AirData.MpsToKnots, 2);
        w.Num("true_airspeed_kts", trueAirspeedMps * AirData.MpsToKnots, 2);
        w.Num("ground_speed_kts", groundSpeedMps * AirData.MpsToKnots, 2);
        w.Num("mach", mach, 4);
        w.Num("static_temperature_c", atmosphericState.TemperatureK - 273.15, 2);
        w.Num("static_pressure_hpa", atmosphericState.PressurePa / 100.0, 2);
        w.Num("air_density_kg_m3", atmosphericState.DensityKgM3, 6);
        w.Num("wind_x_mps", localWindVelocity.X, 3);
        w.Num("wind_y_mps", localWindVelocity.Y, 3);
        w.Num("wind_z_mps", localWindVelocity.Z, 3);
        w.Num("visibility_m", localVisibilityM, 1);
        w.Num("cloud_fraction_01", localCloud.CloudFraction01, 4);
        w.Num("cloud_extinction_per_m", localCloud.ExtinctionPerMetre, 8);
        w.Num("precipitation_mm_hr", localCloud.PrecipitationMmPerHour, 3);
        w.Num("precipitation_total_mm_water_equivalent_hr",
            localPrecipitation.TotalMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_rain_mm_water_equivalent_hr",
            localPrecipitation.Rates.RainMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_snow_mm_water_equivalent_hr",
            localPrecipitation.Rates.SnowMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_freezing_drizzle_mm_water_equivalent_hr",
            localPrecipitation.Rates.FreezingDrizzleMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_freezing_rain_mm_water_equivalent_hr",
            localPrecipitation.Rates.FreezingRainMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_ice_pellets_mm_water_equivalent_hr",
            localPrecipitation.Rates.IcePelletsMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_graupel_mm_water_equivalent_hr",
            localPrecipitation.Rates.GraupelMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_hail_mm_water_equivalent_hr",
            localPrecipitation.Rates.HailMmWaterEquivalentPerHour, 3);
        w.Num("precipitation_extinction_per_m",
            localPrecipitation.ExtinctionPerMetre, 8);
        w.Num("precipitation_visibility_m", localPrecipitation.VisibilityM, 1);
        w.Num("surface_temperature_k", localSurface.SurfaceTemperatureK, 2);
        w.Num("snow_water_equivalent_m", localSurface.SnowWaterEquivalentM, 4);
        w.Num("snow_depth_m", localSurface.SnowDepthM, 4);
        w.Num("snow_liquid_water_fraction_01",
            localSurface.SnowLiquidWaterFraction01, 4);
        w.Num("snow_crust_01", localSurface.SnowCrust01, 4);
        w.Num("surface_wetness_01", localSurface.SurfaceWetness01, 4);
        w.Num("standing_water_depth_m", localSurface.StandingWaterDepthM, 4);
        w.Num("slush_depth_m", localSurface.SlushDepthM, 4);
        w.Num("glaze_ice_thickness_m", localSurface.GlazeIceThicknessM, 4);
        w.Num("mud_depth_m", localSurface.MudDepthM, 4);
        w.Num("surface_friction_coefficient",
            localSurface.FrictionCoefficient, 4);
        w.Num("surface_braking_factor_01", localSurface.BrakingFactor01, 4);
        w.Num("cloud_turbulence_x_mps", localCloud.TurbulenceVelocityMps.X, 3);
        w.Num("cloud_turbulence_y_mps", localCloud.TurbulenceVelocityMps.Y, 3);
        w.Num("cloud_turbulence_z_mps", localCloud.TurbulenceVelocityMps.Z, 3);
        w.Num("cloud_vertical_air_mps", localCloud.VerticalAirVelocityMps, 3);
        w.Num("icing_hazard_01", localCloud.IcingHazard01, 4);
        w.Num("lightning_hazard_01", localCloud.LightningHazard01, 4);
        w.Num("speed_kts", indicatedAirspeedMps * AirData.MpsToKnots, 2);
        w.Num("stall_speed_kias", stallSpeedKias, 2);
        w.Num("accelerated_stall_speed_kias", acceleratedStallSpeedKias, 2);
        w.Num("corner_speed_kias", cornerSpeedKias, 2);
        w.Num("stall_speed_kcas", stallSpeedKias, 2);
        w.Num("accelerated_stall_speed_kcas", acceleratedStallSpeedKias, 2);
        w.Num("corner_speed_kcas", cornerSpeedKias, 2);
        w.Num("effective_on_speed_aoa_deg",
            detents.EffectiveOnSpeedAoARad(beat.PlayerAir) * 57.29577951308232, 3);
        w.Num("stall_load_factor", positiveLoadFactor, 3);
        w.Num("sortie_peak_g", session.SortiePeakLoadFactorG, 3);
        w.Num("sortie_min_g", session.SortieMinimumLoadFactorG, 3);
        w.Num("alt_ft", playerPosition.Y * 3.28084, 1);
        w.Num("radar_alt_ft", radarAltitudeM * 3.28084, 1);
        w.Num("vertical_speed_fpm", verticalSpeedMps * 196.8504, 1);
        w.Num("g_actual", player.LastNz, 3);
        w.Num("g_cmd", appliedCommand.GDemand, 3);
        w.Num("pilot_gz", physiology.NormalAccelerationG, 4);
        w.Bool("pilot_gz_valid", player.HasValidPilotNormalAcceleration);
        w.Num("pilot_positive_onset_rate_g_per_second", physiology.PositiveOnsetRateGPerSecond, 4);
        w.Num("pilot_negative_onset_rate_g_per_second", physiology.NegativeOnsetRateGPerSecond, 4);
        w.Num("pilot_positive_exposure_g_seconds", physiology.PositiveExposureGSeconds, 4);
        w.Num("pilot_negative_exposure_g_seconds", physiology.NegativeExposureGSeconds, 4);
        w.Num("pilot_effective_retinal_reserve_01", physiology.EffectiveRetinalResource01, 5);
        w.Num("pilot_effective_cerebral_reserve_01", physiology.EffectiveCerebralResource01, 5);
        w.Num("pilot_peripheral_vision_01", physiology.PeripheralVision01, 5);
        w.Num("pilot_central_vision_01", physiology.VisualAcuity01, 5);
        w.Num("pilot_redout_01", physiology.Redout01, 5);
        w.Num("pilot_consciousness_01", physiology.Consciousness01, 5);
        w.Bool("pilot_conscious", physiology.Consciousness01 > 0.0);
        w.Num("pilot_cognitive_capacity_01", physiology.CognitiveCapacity01, 5);
        w.Num("pilot_control_authority_01", physiology.ControlAuthority01, 5);
        w.Num("pilot_additional_control_delay_seconds", physiology.AdditionalControlDelaySeconds, 4);
        w.Num("pilot_incapacitation_remaining_seconds",
            physiology.AbsoluteIncapacitationRemainingSeconds, 4);
        w.Num("pilot_agsm_engagement_01", physiology.TechniqueEngagement01, 5);
        w.Num("pilot_push_pull_penalty_g", physiology.PushPullPenaltyG, 4);
        w.Num("pilot_effective_peripheral_loss_g", physiology.EffectivePositivePeripheralLossG, 4);
        w.Num("pilot_effective_blackout_g", physiology.EffectivePositiveBlackoutG, 4);
        w.Num("pilot_effective_loc_g", physiology.EffectivePositiveLossOfConsciousnessG, 4);
        w.Num("pilot_effective_negative_redout_magnitude_g",
            physiology.EffectiveNegativeRedoutMagnitudeG, 4);
        w.Num("pilot_effective_negative_loc_magnitude_g",
            physiology.EffectiveNegativeLossOfConsciousnessMagnitudeG, 4);
        w.Bool("pilot_control_interlocked", session.PilotControlInterlocked);
        w.Bool("pilot_trigger_interlocked", session.PilotTriggerInterlocked);
        w.Num("pilot_g_loc_count", session.PilotGLocCount, RawInteger);
        w.Num("pilot_peak_positive_g", session.PilotPeakPositiveG, 4);
        w.Num("pilot_peak_negative_g", session.PilotPeakNegativeG, 4);
        w.Bool("auto_gcas_active", autoGcas.Active);
        w.Bool("auto_gcas_warning", autoGcas.Warning);
        w.Bool("auto_gcas_override_held", session.AutoGcasOverrideHeld);
        w.Num("auto_gcas_activation_count", autoGcas.ActivationCount, RawInteger);
        w.Num("auto_gcas_override_count", autoGcas.PilotOverrideCount, RawInteger);
        w.Num("auto_gcas_release_count", autoGcas.ReleaseCount, RawInteger);
        w.Num("auto_gcas_active_seconds", autoGcas.ActiveSeconds, 4);
        w.Bool("auto_gcas_prediction_valid", gcasPrediction.Valid);
        w.Bool("auto_gcas_used_fallback_terrain", gcasPrediction.UsedFallbackTerrain);
        w.Nul("auto_gcas_current_clearance_m", Finite(gcasPrediction.CurrentClearanceM), 4);
        w.Nul("auto_gcas_pilot_minimum_clearance_m", Finite(gcasPrediction.PilotMinimumClearanceM), 4);
        w.Nul("auto_gcas_recovery_minimum_clearance_m",
            Finite(gcasPrediction.ImmediateRecoveryMinimumClearanceM), 4);
        w.Nul("auto_gcas_pilot_violation_time_seconds",
            Finite(gcasPrediction.PilotViolationTimeSeconds), 4);
        w.Nul("auto_gcas_time_available_seconds",
            Finite(gcasPrediction.TimeAvailableToAvoidGroundImpactSeconds), 4);
        w.Bool("auto_gcas_pilot_recovery_credited", gcasPrediction.PilotRecoveryCredited);
        w.Num("bank_target_deg", appliedCommand.BankTarget * 57.29577951308232, 3);
        w.Num("roll_control", appliedCommand.RollControl, 3);
        w.Num("applied_rudder", appliedCommand.Rudder, 4);
        w.Num("f22_ari_gain", f22AriGain, 4);
        w.Num("f22_ari_rudder", f22AriRudder, 4);
        w.Num("effective_rudder_command", effectiveRudderCommand, 4);
        w.Num("stability_yaw_rate_dps", stabilityYawRateDps, 3);
        w.Num("pilot_aileron", appliedCommand.RollControl, 3);
        w.Num("sas_aileron", appliedCommand.SasRollControl, 3);
        w.Num("aileron_command_deg",
            appliedCommand.RollControl * beat.PlayerAir.MaxAileronDeflectionRad * 57.29577951308232, 3);
        w.Num("sas_aileron_deg",
            appliedCommand.SasRollControl * beat.PlayerAir.MaxAileronDeflectionRad * 57.29577951308232, 3);
        w.Num("total_aileron_command_deg",
            Math.Clamp(appliedCommand.RollControl + appliedCommand.SasRollControl, -1.0, 1.0)
                * beat.PlayerAir.MaxAileronDeflectionRad * 57.29577951308232, 3);
        w.Bool("lateral_control_applied", lateralControlApplied);
        w.Bool("direct_lateral_control", appliedCommand.DirectLateralControl);
        w.Num("requested_g_cmd", requestedCommand.GDemand, 3);
        w.Num("requested_bank_target_deg", requestedCommand.BankTarget * 57.29577951308232, 3);
        w.Num("requested_rudder", requestedCommand.Rudder, 3);
        w.Num("requested_roll_control", requestedCommand.RollControl, 3);
        w.Num("requested_sas_aileron", requestedCommand.SasRollControl, 3);
        w.Bool("requested_envelope_override", detents.Tier == DemandTier.OverDemand);
        w.Nul("requested_alpha_deg",
            double.IsFinite(requestedCommand.CommandedAlphaRad)
                ? requestedCommand.CommandedAlphaRad * 57.29577951308232
                : null, 3);
        w.Bool("requested_direct_lateral_control", requestedCommand.DirectLateralControl);
        w.Num("roll_moment_nm", player.LastRollMomentNm, 1);
        w.Num("pitch_thrust_vector_deg", player.LastPitchThrustVectorAngleRad * 57.29577951308232, 3);
        w.Num("pitch_thrust_vector_moment_nm", player.LastPitchThrustVectorMomentNm, 1);
        w.Bool("gunnery_pitch_assist", pitchAssist.Active);
        w.Num("gunnery_assist_status_code", pitchAssist.StatusCode, RawInteger);
        w.Num("gunnery_pitch_error_deg", pitchAssist.PitchLeadErrorRad * 57.29577951308232, 3);
        w.Num("gunnery_lateral_error_deg", pitchAssist.LateralLeadErrorRad * 57.29577951308232, 3);
        w.Num("gunnery_total_lead_error_deg", pitchAssist.TotalLeadErrorRad * 57.29577951308232, 3);
        w.Num("gunnery_pitch_rate_cmd_dps",
            pitchAssist.RequestedPitchRateRadPerSecond * 57.29577951308232, 3);
        w.Num("gunnery_pitch_rate_measured_dps",
            pitchAssist.MeasuredPitchRateRadPerSecond * 57.29577951308232, 3);
        w.Num("gunnery_pitch_rate_error_dps",
            pitchAssist.PitchRateErrorRadPerSecond * 57.29577951308232, 3);
        w.Num("gunnery_pitch_assist_g", pitchAssist.AssistedLoadFactorG, 3);
        w.Num("gunnery_pitch_assist_delta_g", pitchAssist.LoadFactorCorrectionG, 3);
        w.Num("gunnery_assist_authority_01", pitchAssist.Authority01, 3);
        w.Num("gunnery_roll_assist", pitchAssist.RollCorrection, 4);
        w.Num("gunnery_yaw_assist", pitchAssist.YawCorrection, 4);
        w.Nul("gunnery_time_to_pass_s",
            double.IsFinite(pitchAssist.TimeToPassSeconds)
                ? pitchAssist.TimeToPassSeconds : null, 3);
        w.Bool("padlock_roll_assist_selected", padlockRollAssist.Selected);
        w.Bool("padlock_roll_assist_geometry_valid", padlockRollAssist.GeometryValid);
        w.Bool("padlock_roll_assist_captured", padlockRollAssist.Captured);
        w.Bool("padlock_roll_assist_active", padlockRollAssist.Active);
        w.Bool("padlock_roll_assist_any_plane", padlockRollAssist.AnyPlane);
        w.Num("padlock_roll_assist_target_sequence",
            padlockRollAssist.TargetSpawnSequence, RawInteger);
        w.Num("padlock_roll_plane_magnitude", padlockRollAssist.PlaneMagnitude, 6);
        w.Num("padlock_roll_error_deg",
            padlockRollAssist.RollErrorRad * 57.29577951308232, 3);
        w.Num("padlock_roll_rate_cmd_dps",
            padlockRollAssist.DesiredRollRateRadPerSecond * 57.29577951308232, 3);
        w.Num("padlock_roll_rate_measured_dps",
            padlockRollAssist.MeasuredRollRateRadPerSecond * 57.29577951308232, 3);
        w.Num("padlock_target_plane_rate_dps",
            padlockRollAssist.EstimatedTargetPlaneRateRadPerSecond * 57.29577951308232, 3);
        w.Num("padlock_roll_assist_aileron", padlockRollAssist.SasRollControl, 4);
        w.Bool("padlock_preferred_plane_valid", padlockRollAssist.PreferredPlaneValid);
        w.Num("padlock_preferred_plane_deg",
            padlockRollAssist.PreferredPlaneRad * 57.29577951308232, 3);
        w.Bool("high_alpha_recovery", detents.HighAlphaRecoveryActive);
        w.Num("g_valley", detents.ValleyG, 3);
        w.Num("g_maxperform", Protection.MaxPerformG(
            s,
            beat.PlayerAir,
            trueAirspeedMps,
            session.PlayerEffectiveAerodynamicConfiguration,
            atmosphere), 3);
        w.Num("g_hardmax", Protection.HardMaxG(s, beat.PlayerAir, trueAirspeedMps, atmosphere), 3);
        w.Num("g_override_max", Protection.OverrideMaxG(s, beat.PlayerAir, trueAirspeedMps, atmosphere), 3);
        w.Num("dynamic_pressure_kpa", player.DynamicPressurePa / 1000.0, 2);
        w.Num("sustained", sustainedG, 3);
        w.Num("sticky", detents.StickyOffsetG, 2);
        w.Num("tier", (int)detents.Tier, RawInteger);
        w.Num("variant", session.Variant == ValleyVariant.PhysicsOnly ? 1 : 0, RawInteger);
        w.Num("prompt", (int)session.Cue, RawInteger);
        w.Bool("buffet", player.Buffet);
        w.Num("pitch_deg", displayPitchRad * 57.2958, 2);
        w.Num("bank_deg", displayBankRad * 57.2958, 2);
        w.Num("aoa_deg", player.AngleOfAttackRad * 57.2958, 2);
        w.Num("beta_deg", player.SideslipRad * 57.2958, 2);
        w.Num("gamma_deg", displayGammaRad * 57.2958, 2);
        w.Num("heading_deg", ((displayHeadingRad * 57.2958) % 360 + 360) % 360, 2);
        w.Num("roll_rate_dps", s.BodyRates.P * 57.2958, 2);
        w.Num("pitch_rate_dps", s.BodyRates.Q * 57.2958, 2);
        w.Num("yaw_rate_dps", s.BodyRates.R * 57.2958, 2);
        w.Num("angle_off_deg",
            opponentPresent ? Geometry.AngleOff(s, gunTarget) * 57.2958 : 0.0, 2);
        w.Num("range_m", opponentPresent ? Geometry.Range(s, gunTarget) : 0.0, 1);
        w.Num("closure_kts", opponentPresent ? session.ClosureKts : 0.0, 1);
        w.Num("selected_player_gun_target_slot",
            opponentPresent ? session.SelectedPlayerGunTargetSlot : 0, RawInteger);
        w.Bool("gun_window",
            opponentPresent && !session.WeaponsInhibited
                && CameraSolver.GunWindow(s, gunTarget));
        w.Bool("gun_solution_raw",
            opponentPresent && gunKill!.InstantaneousGunSolution);
        w.Bool("gun_solution",
            opponentPresent && !session.WeaponsInhibited && gunKill!.GunSolution);
        w.Bool("lead_valid",
            opponentPresent && !session.WeaponsInhibited && gunKill!.HasLeadSolution);
        w.Bool("lead_solution_valid",
            opponentPresent && gunKill!.HasLeadSolution);
        w.Num("lead_x", opponentPresent ? gunKill!.LeadPipper.X : 0.0, 3);
        w.Num("lead_y", opponentPresent ? gunKill!.LeadPipper.Y : 0.0, 3);
        w.Num("lead_z", opponentPresent ? gunKill!.LeadPipper.Z : 0.0, 3);
        w.Num("lead_tof", opponentPresent ? gunKill!.LeadTimeOfFlight : 0.0, 4);
        w.Num("ammo", gunKill?.AmmoRemaining ?? 0, RawInteger);
        w.GunTrajectory("gun_trajectory", playerPosition, groundVelocity, pf, pl,
            s.BodyRates, playerGunProfile);
        w.Num("rounds_fired", opponentPresent ? gunKill!.RoundsFired : 0, RawInteger);
        w.Num("hits", opponentPresent ? gunKill!.TotalHitCount : 0, RawInteger);
        w.Num("selected_target_hits", opponentPresent ? gunKill!.HitCount : 0, RawInteger);
        w.Bool("hit", opponentPresent && gunKill!.HitThisStep);
        w.Bool("gun_firing", opponentPresent
            && session.TriggerDown && session.PlayerWeaponsAuthorized
            && gunKill!.AmmoRemaining > 0 && gunKill.BanditAlive);
        w.Tracers("tracers", opponentPresent
            ? gunKill!.RoundsInFlight : Array.Empty<GunRound>());
        w.Num("kill_progress", opponentPresent ? gunKill!.KillProgress : 0.0, 3);
        w.Num("opponent_health", opponentPresent ? gunKill!.TargetHealth : 0.0, 3);
        w.Bool("opponent_alive", opponentPresent && gunKill!.TargetAlive);
        w.Num("bandit_health", session.PrimaryOpponentHealth, 3);
        w.Bool("bandit_alive", session.PrimaryOpponentAlive);
        w.Num("player_health", session.PlayerHealth, 3);
        w.Bool("player_alive", session.PlayerAlive);
        w.Num("opponent_ammo",
            opponentPresent ? opponentGun!.AmmoRemaining : 0, RawInteger);
        w.Num("opponent_rounds_fired",
            opponentPresent ? opponentGun!.RoundsFired : 0, RawInteger);
        w.Num("opponent_hits", opponentPresent ? session.PlayerHitsTaken : 0, RawInteger);
        w.Bool("opponent_trigger_down",
            opponentPresent && session.OpponentTriggerDown);
        w.Bool("opponent_gun_firing", opponentPresent && session.OpponentTriggerDown
            && opponentGun!.AmmoRemaining > 0 && session.PlayerAlive);
        w.Bool("formation_gun_firing", session.FormationOpponentGunFiring);
        w.Num("sortie_rounds_fired", session.SortiePlayerRoundsFired, RawInteger);
        w.Num("sortie_hits", session.SortiePlayerHits, RawInteger);
        w.Num("sortie_opponent_rounds_fired",
            session.SortieOpponentRoundsFired, RawInteger);
        w.Tracers("opponent_tracers", opponentPresent
            ? session.FormationOpponentRoundsInFlight : Array.Empty<GunRound>());
        w.Num("kill_count", session.KillCount, RawInteger);
        w.Num("engagement_number", session.EngagementNumber, RawInteger);
        w.Bool("opponent_replacement_pending", session.OpponentReplacementPending);
        w.Num("opponent_replacement_s", session.OpponentReplacementSeconds, 3);
        w.Bool("splash_cue", splashCue);
        w.Bool("below_ground", belowGround);
        w.Num("shots_total", session.ShotsTotal, RawInteger);
        w.Num("shots_in_window", session.ShotsInWindow, RawInteger);
        w.Num("combat_handoff_phase", (int)session.CombatHandoffPhase, RawInteger);
        w.Bool("combat_handoff_requested", session.CombatHandoffRequested);
        w.Bool("combat_handoff_active", session.CombatHandoffActive);
        w.Num("relief_kills", session.ReliefKills, RawInteger);
        w.Num("throttle", detents.Throttle, 3);
        w.Num("requested_throttle", requestedCommand.Throttle, 3);
        w.Num("applied_throttle", appliedCommand.Throttle, 3);
        w.Num("engine", player.ThrustFraction, 3);
        w.Num("engine_spool_fraction", player.ThrustFraction, 4);
        w.Num("speed_brake", player.SpeedBrake, 4);
        w.Num("engine_rpm_pct", engine.RpmPercent, 2);
        w.Num("engine_thrust_lbf", engine.NetThrustLbf, 1);
        w.Num("engine_net_thrust_lbf", engine.NetThrustLbf, 1);
        w.Bool("engine_running", engine.Running);
        w.Num("fuel_lb", fuel.FuelLb, 2);
        w.Num("fuel_flow_lb_min", fuel.SmoothedBurnLbPerMinute, 2);
        w.Num("fuel_flow_pph", fuel.SmoothedBurnLbPerMinute * 60.0, 1);
        w.Num("fuel_trend_lb_min", fuel.FuelTrendLbPerMinute, 2);
        w.Nul("fuel_minutes_to_joker", fuel.MinutesToJoker, 2);
        w.Nul("fuel_minutes_to_bingo", fuel.MinutesToBingo, 2);
        w.Nul("fuel_endurance_minutes", fuel.EnduranceMinutes, 2);
        w.Bool("fuel_joker", fuel.IsJoker);
        w.Bool("fuel_bingo", fuel.IsBingo);
        w.Bool("fuel_minimum", fuel.IsMinimumFuel);
        w.Bool("fuel_emergency", fuel.IsEmergencyFuel);
        w.Bool("rtb", fuel.RtbAdvisory);
        w.Bool("rtb_available", session.ReturnToBaseAvailable);
        w.Bool("rtb_steer", rtb.Active);
        w.Num("rtb_bearing_deg", rtb.BearingRad * 57.29577951308232, 2);
        w.Num("rtb_turn_deg", rtb.TurnRad * 57.29577951308232, 2);
        w.Num("rtb_range_nm", rtb.RangeM / 1852.0, 2);
        w.Bool("recovery_point_known", recoveryNavigation.RecoveryPointKnown);
        w.Bool("carrier_sortie_route_active", carrierRoute.Active);
        w.Num("carrier_sortie_route_phase_code", (int)carrierRoute.Phase, RawInteger);
        w.Num("carrier_sortie_route_fix_code", (int)carrierRoute.ActiveFix, RawInteger);
        w.Num("carrier_sortie_route_target_x", carrierRoute.TargetPosition.X, 2);
        w.Num("carrier_sortie_route_target_y", carrierRoute.TargetPosition.Y, 2);
        w.Num("carrier_sortie_route_target_z", carrierRoute.TargetPosition.Z, 2);
        w.Num("carrier_sortie_route_target_bearing_deg", carrierRouteBearingDeg, 2);
        w.Num("carrier_sortie_route_target_turn_deg",
            carrierRouteTurnRad * 57.29577951308232, 2);
        w.Num("carrier_sortie_route_distance_m", carrierRoute.DistanceToTargetM, 1);
        w.Num("carrier_sortie_route_target_tas_mps", carrierRoute.TargetSpeedMps, 1);
        w.Num("carrier_sortie_route_capture_radius_m", carrierRoute.CaptureRadiusM, 1);
        w.Bool("carrier_sortie_route_rtb_available", carrierRoute.RtbAvailable);
        w.Bool("carrier_sortie_route_rtb_requested", carrierRoute.RtbRequested);
        w.Bool("straight_deck_barrier_armed", session.StraightDeckBarrierArmed);
        w.Bool("straight_deck_barrier_engaged",
            session.Recovery == Carrier.Recovery.BarrierEngagement);
        w.Bool("sortie_valid", session.SortiePlan.Valid);
        w.Num("sortie_leg_code", (int)session.SortiePlan.Leg, RawInteger);
        w.Num("sortie_target_height_m", session.SortiePlan.TargetHeightM, 1);
        w.Num("sortie_target_tas_mps", session.SortiePlan.TargetSpeedMps, 1);
        w.Num("sortie_power_01", session.SortiePlan.CommandedPower01, 3);
        w.Num("sortie_limit_code", (int)session.SortiePlan.Limit, RawInteger);
        w.Num("sortie_distance_to_go_m", session.SortiePlan.DistanceToGoM, 0);
        w.Num("sortie_waveoff_s", session.SortiePlan.WaveOffDecisionS, 1);
        var approach = session.ApproachGuidancePlan;
        w.Bool("approach_guidance_active", approach.GuidanceActive);
        w.Bool("approach_valid", approach.Valid);
        w.Num("approach_excess_energy_m", approach.ExcessEnergyM, 0);
        w.Num("approach_track_required_m", approach.TrackRequiredM, 0);
        w.Num("approach_track_available_m", approach.TrackAvailableM, 0);
        w.Num("approach_extension_code", (int)approach.Extension, RawInteger);
        w.Bool("approach_in_groove", approach.InGroove);
        w.Bool("conventional_rtb_pattern_active", session.ConventionalRtbPatternGuidanceActive);
        w.Num("approach_pattern_leg_code", (int)approach.ActivePatternLeg, RawInteger);
        w.Num("approach_energy_state_code", (int)approach.EnergyState, RawInteger);
        w.Num("approach_energy_target_ktas",
            approach.NextTrueAirspeedMps * AirData.MpsToKnots, 1);
        w.Num("approach_energy_tolerance_ktas", approach.TargetSpeedToleranceKtas, 1);
        w.Num("approach_next_alt_m", approach.NextAltitudeM, 1);
        w.Num("approach_next_tas_mps", approach.NextTrueAirspeedMps, 1);
        w.Num("approach_alt_error_m", approach.AltitudeErrorM, 1);
        w.Num("approach_tas_error_mps", approach.TrueAirspeedErrorMps, 1);
        w.Num("approach_power_01", approach.Power01, 3);
        w.Num("approach_gate_count", approach.Gates.Count, RawInteger);
        w.ApproachGates("approach_gates", approach);
        w.Bool("runway_available", conventionalRunway is not null);
        w.Nul("runway_threshold_x", conventionalRunway?.ThresholdPosition.X, 2);
        w.Nul("runway_threshold_y", conventionalRunway?.ThresholdPosition.Y, 2);
        w.Nul("runway_threshold_z", conventionalRunway?.ThresholdPosition.Z, 2);
        w.Nul("runway_heading_deg",
            conventionalRunway?.LandingHeadingRad * 57.29577951308232, 2);
        w.Nul("runway_length_m", conventionalRunway?.LengthM, 2);
        w.Nul("runway_width_m", conventionalRunway?.WidthM, 2);
        w.Nul("runway_touchdown_x",
            conventionalRunway is null ? null : recoveryPlan?.Position.X, 2);
        w.Nul("runway_touchdown_y",
            conventionalRunway is null ? null : recoveryPlan?.Position.Y, 2);
        w.Nul("runway_touchdown_z",
            conventionalRunway is null ? null : recoveryPlan?.Position.Z, 2);
        w.Num("runway_recovery_phase",
            (int)session.ConventionalRunwayPhase, RawInteger);
        w.Bool("runway_weight_on_wheels", session.RunwayWeightOnWheels);
        w.Bool("runway_recovery_complete", session.ConventionalRtbRecoveryCompleted);
        w.Bool("runway_touchdown_contact", session.RunwayTouchdown.Contact);
        w.Bool("runway_touchdown_survivable", session.RunwayTouchdown.Survivable);
        w.Num("runway_touchdown_deviations",
            (int)session.RunwayTouchdown.Deviations, RawInteger);
        w.Bool("player_rtb_active", playerRtbActive);
        w.Nul("rtb_closure_kts", recoveryNavigation.ClosureKts, 2);
        w.Nul("rtb_eta_min", recoveryNavigation.EtaMinutes, 2);
        w.Nul("fuel_to_home_estimate_lb",
            recoveryNavigation.FuelToHomeEstimateLb, 2);
        w.Nul("fuel_on_arrival_estimate_lb",
            recoveryNavigation.FuelOnArrivalEstimateLb, 2);
        w.Nul("fuel_reserve_target_lb", recoveryNavigation.ReserveTargetLb, 2);
        w.Nul("fuel_reserve_margin_lb", recoveryNavigation.ReserveMarginLb, 2);
        MeshNavSolution meshSolution = MeshSnapshot.Project(
            session, simulationPosition, groundVelocity, displayHeadingRad);
        MeshActiveDest? meshActive = session.MeshNav.Active;
        MeshPlace? meshHome = session.MeshNav.HomePlate;
        w.Num("mesh_transit_mode_code", (int)session.MeshNav.Mode, RawInteger);
        w.Bool("mesh_active_known", meshActive is not null);
        w.Bool("mesh_active_is_place", meshActive?.IsPlace == true);
        w.Nul("mesh_active_east_m", meshActive?.EastM, 2);
        w.Nul("mesh_active_north_m", meshActive?.NorthM, 2);
        w.Nul("mesh_home_east_m", meshHome?.EastM, 2);
        w.Nul("mesh_home_north_m", meshHome?.NorthM, 2);
        RtbGuidance meshGuidance = meshSolution.DestLeg.Guidance;
        w.Nul("mesh_dest_bearing_deg",
            meshActive is null ? null : meshGuidance.BearingRad * 57.29577951308232, 2);
        w.Nul("mesh_dest_turn_deg",
            meshActive is null ? null : meshGuidance.TurnRad * 57.29577951308232, 2);
        w.Nul("mesh_dest_range_nm",
            meshActive is null ? null : meshGuidance.RangeM / 1852.0, 2);
        w.Nul("mesh_dest_closure_kts", meshSolution.DestLeg.ClosureKts, 2);
        w.Nul("mesh_dest_eta_min", meshSolution.DestLeg.EtaMinutes, 2);
        w.Nul("mesh_fuel_to_dest_lb", meshSolution.DestLeg.FuelToHomeEstimateLb, 2);
        w.Nul("mesh_fuel_on_arrival_dest_lb",
            meshSolution.DestLeg.FuelOnArrivalEstimateLb, 2);
        w.Nul("mesh_fuel_dest_to_home_lb", meshSolution.FuelDestToHomeLb, 2);
        w.Nul("mesh_fuel_on_arrival_home_via_dest_lb",
            meshSolution.FuelOnArrivalHomeViaDestLb, 2);
        w.Nul("mesh_reserve_margin_via_dest_lb", meshSolution.ReserveMarginViaDestLb, 2);
        RecoveryProcedureDirector meshRecovery = session.RecoveryProcedure;
        RecoveryGate? recoveryGate = meshRecovery.ActiveGate;
        Vec3D recoveryFace = meshRecovery.ActiveGateFace;
        w.Num("mesh_tour_count", session.MeshNav.Tour.Count, RawInteger);
        w.Num("guidance_sortie_sequence", session.PlayerSpawnSequence, RawInteger);
        w.Num("recovery_procedure_kind", (int)meshRecovery.Kind, RawInteger);
        w.Num("recovery_gate_active_index", meshRecovery.ActiveIndex, RawInteger);
        w.Nul("recovery_gate_x", recoveryGate?.EastM, 2);
        w.Nul("recovery_gate_y", recoveryGate?.UpM, 2);
        w.Nul("recovery_gate_z", recoveryGate?.NorthM, 2);
        w.Num("recovery_gate_half_m", recoveryGate?.HalfM ?? 0.0, 1);
        w.Num("recovery_gate_face_x", recoveryFace.X, 4);
        w.Num("recovery_gate_face_y", recoveryFace.Y, 4);
        w.Num("recovery_gate_face_z", recoveryFace.Z, 4);
        w.Bool("recovery_gate_in_volume", meshRecovery.InVolume);
        w.Bool("recovery_gate_energy_ok", meshRecovery.EnergyOk);
        w.Bool("recovery_gate_config_ok", meshRecovery.ConfigOk);
        w.Nul("recovery_gate_target_ktas", recoveryGate?.TargetKtas, 1);
        w.Bool("recovery_gate_dirty", recoveryGate?.DirtyConfig == true);
        w.Num("gear_nose", systems.NoseGearPosition, 4);
        w.Num("gear_left", systems.LeftMainGearPosition, 4);
        w.Num("gear_right", systems.RightMainGearPosition, 4);
        w.Bool("gear_unsafe", systems.GearUnsafeLight);
        w.Bool("gear_warning_horn", systems.GearWarningHorn);
        w.Bool("gear_limit_exceeded", systems.GearLimitExceeded);
        w.Num("flap_left_deg", systems.LeftFlapDegrees, 2);
        w.Num("flap_right_deg", systems.RightFlapDegrees, 2);
        w.Bool("flap_split", systems.FlapSplit);
        w.Bool("flap_limit_exceeded", systems.FlapLimitExceeded);
        w.Bool("primary_bus_powered",
            systems.ElectricalSystemAvailable && systems.PrimaryBusPowered);
        w.Num("utility_hydraulic_pressure_psi", systems.UtilityHydraulicPressurePsi, 1);

        VisualMergeEvaluation? merge = session.VisualMergeEvaluation;
        w.Bool("visual_merge_evaluation", merge is not null);
        w.Bool("weapons_inhibited", merge?.WeaponsInhibited ?? false);
        w.Bool("player_trigger_interlocked", merge?.PlayerTriggerInterlocked ?? false);
        w.Bool("weapons_hot_cue", merge?.WeaponsHotCueActive ?? false);
        if (w.OpenBlock("merge_detail", merge is not null)) {
            w.Bool("first_pass_complete", merge!.FirstPassComplete);
            w.Num("visual_merge_score", merge.Score, RawInteger);
            w.Num("minimum_merge_range_m", merge.MinimumMergeRangeM, 1);
            w.Num("minimum_energy_kias", merge.MinimumEnergyKias, 1);
            w.Num("peak_closure_kts", merge.PeakClosureKts, 1);
            w.Num("closure_decision_score", merge.ClosureScore, 1);
            w.Bool("rear_quarter_valid", merge.CurrentRearQuarterValid);
            w.Num("rear_quarter_dwell_s", merge.RearQuarterDwellSeconds, 2);
            w.Num("head_on_trigger_violations", merge.HeadOnTriggerViolations, RawInteger);
            w.Num("high_aspect_trigger_violations", merge.HighAspectTriggerViolations, RawInteger);
            w.Num("overshoot_count", merge.Overshoots, RawInteger);
            w.Num("evaluated_projectile_rounds", merge.ProjectileRoundsFired, RawInteger);
            w.Num("evaluated_projectile_hits", merge.ProjectileHits, RawInteger);
        }

        DroneRaidEvaluation? drone = session.DroneRaidEvaluation;
        w.Bool("drone_raid_evaluation", drone is not null);
        if (w.OpenBlock("drone_detail", drone is not null)) {
            w.Num("drone_raid_score", drone!.Score, RawInteger);
            w.Num("drone_raid_max_score", drone.MaximumScore, RawInteger);
            w.Num("drone_raid_containment_score", drone.ContainmentScore, RawInteger);
            w.Num("drone_raid_time_score", drone.TimeScore, RawInteger);
            w.Num("drone_raid_fire_discipline_score", drone.FireDisciplineScore, RawInteger);
            w.Num("drone_raid_targets_total", drone.TotalTargets, RawInteger);
            w.Num("drone_raid_targets_resolved", drone.TargetsResolved, RawInteger);
            w.Num("drone_raid_active_target", drone.ActiveTargetNumber, RawInteger);
            w.Num("drone_raid_kills", drone.Kills, RawInteger);
            w.Num("drone_raid_leakers", drone.Leakers, RawInteger);
            w.Bool("drone_raid_zero_leakers", drone.ZeroLeakers);
            w.Bool("drone_raid_finished", drone.Finished);
            w.Bool("drone_raid_ownship_lost", drone.OwnshipLost);
            w.Num("drone_raid_target_elapsed_s", drone.ActiveTargetElapsedSeconds, 2);
            w.Nul("drone_raid_time_to_leak_s", Finite(drone.TargetTimeToLeakSeconds), 2);
            w.Num("drone_raid_average_ttn_s", drone.AverageTimeToNeutralizeSeconds, 2);
            w.Num("drone_raid_rounds_per_kill", drone.RoundsPerKill, 2);
            w.Bool("drone_raid_tail_chase", drone.TailChaseGeometry);
        }

        w.Bool("approach", detents.ApproachMode);
        w.Bool("wave_off", waveOff);

        if (w.OpenBlock("recovery_platform", carrier is not null)) {
            Carrier c = carrier!;
            RecoveryDifficulty difficulty = session.Difficulty;
            CarrierPassResult pass = session.CarrierPass;
            BurbleField? burble = session.Burble;
            var (along, cross, height) = c.LandingFrame(playerPosition);
            bool contacted = touchdown.Recovery != Carrier.Recovery.Flying;
            double airspeed = contacted
                ? touchdown.IndicatedAirspeedMps
                : player.IndicatedAirspeedMps;
            double closure = catapult.IsActive ? catapult.RelativeSpeedMps
                : arrestment.IsActive ? arrestment.RelativeSpeedMps
                : contacted ? touchdown.ClosureMps : c.DeckClosureMps(player.State);
            double sink = contacted ? touchdown.SinkRateMps : c.DeckSinkRateMps(player.State);
            Vec3D deckVelocity = c.DeckRelativeVelocity(player.State);
            double inClose = burble?.InCloseStrength(player.State.Position) ?? 0.0;
            int wire = arrestment.CaughtWire != 0 ? arrestment.CaughtWire : touchdown.Wire;

            w.Bool("recovery_platform", true);
            w.Bool("carrier", c.IsMaritime);
            w.Num("cx", c.Position.X, 2); w.Num("cy", c.Position.Y, 2); w.Num("cz", c.Position.Z, 2);
            w.Num("cheading", c.HeadingRad, 5);
            w.Num("tx", c.TouchdownPoint.X, 2); w.Num("ty", c.TouchdownPoint.Y, 2);
            w.Num("tz", c.TouchdownPoint.Z, 2);
            w.Num("ax", c.ApproachCuePoint.X, 2); w.Num("ay", c.ApproachCuePoint.Y, 2);
            w.Num("az", c.ApproachCuePoint.Z, 2);
            w.Num("approach_director_pitch_deg",
                c.ApproachDirectorPitchOffsetRad * 57.29577951308232, 3);
            w.Num("deck_vx", deckVelocity.X, 3); w.Num("deck_vy", deckVelocity.Y, 3);
            w.Num("deck_vz", deckVelocity.Z, 3);
            w.Num("deck_along", along, 1); w.Num("deck_cross", cross, 1);
            w.Num("deck_height", height, 1);
            w.Num("difficulty_level", difficulty.Level, RawInteger);
            w.Num("difficulty_baseline", difficulty.SkillBaselineLevel, RawInteger);
            w.Num("difficulty_floor", difficulty.FloorLevel, RawInteger);
            w.Num("difficulty_attempt", difficulty.AttemptIndex + 1, RawInteger);
            w.Num("difficulty_variation", difficulty.Variation, RawInteger);
            w.Bool("difficulty_eased", difficulty.IsEased);
            w.Bool("difficulty_spike", difficulty.IsSpike);
            w.Num("clean_traps", session.RecoveryProgress.CleanTrapCount, RawInteger);
            w.Num("deck_pitch_deg", c.DeckPitchRad * 57.2958, 3);
            w.Num("deck_heave_m", c.DeckHeaveM, 3);
            w.Num("approach_airspeed_kts", airspeed * 1.94384, 2);
            w.Num("deck_closure_kts", closure * 1.94384, 2);
            w.Num("sink_rate_mps", sink, 3);
            w.Num("sink_rate_fpm", sink * 196.8504, 1);
            w.Num("in_close_burble", inClose, 3);
            w.Bool("in_close", inClose > 0.20);
            w.Bool("bolter", recovery == Carrier.Recovery.Bolter);
            w.Num("wire", wire, RawInteger);
            w.Bool("carrier_pass_waveoff_required", pass.WaveOffRequired);
            w.Bool("carrier_pass_waveoff_complied", pass.WaveOffComplied);
            w.Bool("soft_trap", touchdown.Quality == Carrier.TouchdownQuality.Soft
                && recovery == Carrier.Recovery.Trap);
            w.Bool("hard_trap", touchdown.Quality == Carrier.TouchdownQuality.Hard
                && recovery == Carrier.Recovery.Trap);
            w.Num("arrest_speed_kts", arrestment.RelativeSpeedMps * 1.94384, 2);
            w.Num("arrest_time_s", arrestment.ElapsedSeconds, 3);
            w.Num("arrest_distance_m", arrestment.DistanceM, 2);
            w.Num("wire_stretch_m", arrestment.WireStretchM, 3);
            w.Num("wire_tension_kn", arrestment.TensionN / 1000.0, 2);
            w.Num("arrest_decel_g", arrestment.DecelerationMps2 / FlightModel.G0, 3);
            w.Num("arrest_peak_decel_g", arrestment.PeakDecelerationMps2 / FlightModel.G0, 3);
            w.Num("arrest_initial_energy_mj", arrestment.InitialEnergyJ / 1_000_000.0, 4);
            w.Num("arrest_absorbed_energy_mj", arrestment.AbsorbedEnergyJ / 1_000_000.0, 4);
            w.Num("arrest_remaining_energy_mj", arrestment.RemainingEnergyJ / 1_000_000.0, 4);
            w.Num("arrest_peak_load_kn", arrestment.PeakLoadN / 1000.0, 2);
            w.Num("arrest_residual_speed_kts", arrestment.ResidualSpeedMps * AirData.MpsToKnots, 2);
            w.Num("arrest_initial_closure_kts",
                arrestment.InitialRelativeSpeedMps * AirData.MpsToKnots, 2);
            w.Bool("catapult_active", catapult.IsActive);
            w.Num("catapult_progress", catapult.StrokeM > 0.0
                ? System.Math.Clamp(catapult.DistanceM / catapult.StrokeM, 0.0, 1.0) : 0.0, 4);
            w.Num("catapult_speed_kts", catapult.RelativeSpeedMps * AirData.MpsToKnots, 2);
            w.Num("catapult_end_speed_kts", catapult.EndSpeedMps * AirData.MpsToKnots, 2);
        }
        w.OpenCasevacBlock(false);
        w.End();
    }

    static void FillCasevac(
        double[] buffer,
        SimulationSession session,
        double worldOriginEastM,
        double worldOriginNorthM,
        bool worldOriginConfigured) {
        CasevacFlightRuntime flight = session.CasevacFlight
            ?? throw new InvalidOperationException(
                "A CASEVAC hot frame requires a staged CASEVAC flight runtime.");
        CasevacMissionSnapshot mission = flight.Snapshot;
        PlayerVehicleState vehicle = flight.VehicleState;
        PlayerVehicleObservation observation = flight.VehicleObservation;
        LandingZoneObservation landingZone = flight.LastLandingZone;
        CasevacTargetGuidance guidance = flight.TargetGuidance;
        CasevacDestinationEnergyPlan energyPlan =
            flight.DestinationEnergyPlan;
        CasevacRotorWashVisual rotorWash =
            flight.RotorWashVisual;

        CasevacColdFingerprint fingerprint = CasevacColdFingerprint.Capture(
            session,
            flight,
            mission,
            landingZone,
            guidance,
            energyPlan,
            worldOriginEastM,
            worldOriginNorthM,
            worldOriginConfigured);
        if (_lastCasevacFingerprint is not { } last || !fingerprint.Equals(last))
            _coldVersion++;
        _lastCasevacFingerprint = fingerprint;
        _lastFingerprint = null;

        // Legacy consumers must never see a plausible combat frame while a CASEVAC session is
        // staged. The browser ignores this region for CASEVAC, but clearing it makes the raw wire
        // contract fail closed for older or diagnostic readers too.
        Array.Clear(buffer, 0, CasevacBlock.Start);
        buffer[ColdVersionIndex] = _coldVersion;

        Vec3D forward = vehicle.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D up = vehicle.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D wind = session.Weather?.Wind.Sample(vehicle.PositionWorldM)
            ?? observation.WindVelocityMps;
        CloudSample cloud = (session.Weather?.Clouds ?? ClearCloudField.Instance)
            .Sample(vehicle.PositionWorldM, session.TimeSeconds);
        double aglM = flight.LastTickObservation?.ClearanceM
            ?? Math.Max(
                0.0,
                vehicle.PositionWorldM.Y - flight.StartLocation.SurfaceElevationM);
        bool hasTarget = guidance.TargetId is not null;
        bool powerAssessed =
            observation.Power.Assessment == VehiclePowerAssessment.Assessed;
        double dwellProgress01 = mission.Phase switch {
            CasevacPhase.PickupApproach or CasevacPhase.DropoffApproach =>
                Fraction(
                    mission.StabilizationProgressTicks,
                    flight.Course.Mission.StabilizationDwellTicks),
            CasevacPhase.Loading or CasevacPhase.Handoff =>
                Fraction(
                    mission.OperationProgressTicks,
                    mission.OperationRequiredTicks),
            _ => 0.0
        };

        var w = new Writer(buffer, CasevacBlock.Start);
        _ = w.OpenCasevacBlock(true);
        w.Bool("__casevac_hot_present", true);
        w.Num("t", session.TimeSeconds, 4);
        w.Num("tick", session.Tick, RawInteger);
        w.Num("px", vehicle.PositionWorldM.X, 3);
        w.Num("py", vehicle.PositionWorldM.Y, 3);
        w.Num("pz", vehicle.PositionWorldM.Z, 3);
        w.Num("vx", vehicle.GroundVelocityMps.X, 3);
        w.Num("vy", vehicle.GroundVelocityMps.Y, 3);
        w.Num("vz", vehicle.GroundVelocityMps.Z, 3);
        w.Num("pfx", forward.X, 5);
        w.Num("pfy", forward.Y, 5);
        w.Num("pfz", forward.Z, 5);
        w.Num("plx", up.X, 5);
        w.Num("ply", up.Y, 5);
        w.Num("plz", up.Z, 5);
        w.Num("pux", up.X, 5);
        w.Num("puy", up.Y, 5);
        w.Num("puz", up.Z, 5);
        w.Num("casevac_pitch_deg", observation.PitchRad * RadiansToDegrees, 3);
        w.Num("casevac_bank_deg", observation.RollRad * RadiansToDegrees, 3);
        w.Num("casevac_heading_deg", PositiveDegrees(observation.YawRad), 3);
        w.Num(
            "casevac_active_mission_ticks",
            mission.ActiveMissionTicks,
            RawInteger);
        w.Bool("casevac_clock_running", mission.ClockRunning);
        w.Bool("casevac_quiet", mission.Phase == CasevacPhase.Quiet);
        w.Num(
            "casevac_quiet_progress_01",
            mission.Phase == CasevacPhase.Quiet
                ? Fraction(
                    mission.QuietProgressTicks,
                    flight.Course.Mission.QuietAftermathTicks)
                : 0.0,
            4);
        w.Nul(
            "casevac_target_x",
            hasTarget ? guidance.TargetWorldM.X : null,
            3);
        w.Nul(
            "casevac_target_y",
            hasTarget ? guidance.TargetWorldM.Y : null,
            3);
        w.Nul(
            "casevac_target_z",
            hasTarget ? guidance.TargetWorldM.Z : null,
            3);
        w.Nul(
            "casevac_target_range_m",
            hasTarget ? guidance.HorizontalRangeM : null,
            1);
        w.Nul(
            "casevac_target_bearing_deg",
            hasTarget ? PositiveDegrees(guidance.AbsoluteBearingRad) : null,
            2);
        w.Nul(
            "casevac_target_relative_bearing_deg",
            hasTarget ? guidance.RelativeBearingRad * RadiansToDegrees : null,
            2);
        w.Nul(
            "casevac_target_eta_s",
            hasTarget ? guidance.EstimatedTimeToTargetSeconds : null,
            1);
        w.Num("casevac_call_age_s", TicksToSeconds(mission.CallAgeTicks), 3);
        w.Bool(
            "casevac_requested_window_passed",
            mission.RequestedHandoffWindowPassed);
        w.Nul(
            "casevac_capsule_secured_call_age_s",
            TicksToSeconds(mission.CapsuleSecuredCallAgeTicks),
            3);
        w.Nul(
            "casevac_handoff_call_age_s",
            TicksToSeconds(mission.HandoffCallAgeTicks),
            3);
        w.Bool("casevac_stable_contact", mission.StableContact);
        w.Bool("casevac_surface_contact", landingZone.SurfaceContact);
        w.Num(
            "casevac_approach_attempt_id",
            mission.CurrentApproachAttemptId,
            RawInteger);
        w.Num(
            "casevac_stabilization_progress_ticks",
            mission.StabilizationProgressTicks,
            RawInteger);
        w.Num(
            "casevac_stabilization_required_ticks",
            flight.Course.Mission.StabilizationDwellTicks,
            RawInteger);
        w.Num("casevac_dwell_progress_01", dwellProgress01, 4);
        w.Num(
            "casevac_operation_progress_ticks",
            mission.OperationProgressTicks,
            RawInteger);
        w.Num(
            "casevac_operation_required_ticks",
            mission.OperationRequiredTicks,
            RawInteger);
        w.Bool("casevac_vehicle_flyable", flight.VehicleFlyable);
        w.Bool("casevac_contact_stable", observation.Contact.IsStable);
        w.Num("casevac_agl_m", aglM, 3);
        w.Num("casevac_gross_mass_kg", observation.GrossMassKg, 2);
        w.Num("casevac_payload_mass_kg", mission.PayloadMassKg, 2);
        w.Nul(
            "casevac_power_margin_fraction",
            powerAssessed ? observation.Power.HoverPowerMarginFraction : null,
            4);
        w.Nul(
            "casevac_power_margin_01",
            powerAssessed
                ? Math.Clamp(
                    observation.Power.HoverPowerMarginFraction,
                    0.0,
                    1.0)
                : null,
            4);
        w.Nul(
            "casevac_available_power_w",
            powerAssessed ? observation.Power.AvailablePowerW : null,
            1);
        w.Nul(
            "casevac_applied_power_w",
            powerAssessed ? observation.Power.AppliedPowerW : null,
            1);
        w.Num(
            "casevac_energy_remaining_kwh",
            flight.RemainingUsableEnergyJ / JoulesPerKilowattHour,
            4);
        w.Num(
            "casevac_energy_remaining_fraction",
            flight.RemainingEnergyFraction,
            6);
        w.Num(
            "casevac_energy_planning_endurance_s",
            flight.PlanningEnduranceSeconds,
            3);
        w.Num(
            "casevac_energy_planning_endurance_min",
            flight.PlanningEnduranceSeconds / SecondsPerMinute,
            3);
        w.Bool("casevac_energy_depleted", flight.EnergyDepleted);
        bool hasEnergyTarget = energyPlan.TargetId is not null;
        w.Nul(
            "casevac_destination_energy_transit_s",
            hasEnergyTarget ? energyPlan.PlannedTransitSeconds : null,
            3);
        w.Nul(
            "casevac_destination_reserve_kwh",
            hasEnergyTarget
                ? energyPlan.ProjectedReserveEnergyJ
                    / JoulesPerKilowattHour
                : null,
            4);
        w.Nul(
            "casevac_destination_reserve_fraction",
            hasEnergyTarget ? energyPlan.ProjectedReserveFraction : null,
            6);
        w.Nul(
            "casevac_destination_reserve_endurance_s",
            hasEnergyTarget
                ? energyPlan.ProjectedReserveEnduranceSeconds
                : null,
            3);
        w.Nul(
            "casevac_destination_reserve_min",
            hasEnergyTarget
                ? energyPlan.ProjectedReserveEnduranceSeconds
                    / SecondsPerMinute
                : null,
            3);
        w.Bool(
            "casevac_within_safe_masking_band",
            flight.LastExposure.WithinSafeMaskingBand);
        w.Num(
            "casevac_lateral_speed_mps",
            Math.Sqrt(
                observation.GroundVelocityMps.X
                    * observation.GroundVelocityMps.X
                + observation.GroundVelocityMps.Z
                    * observation.GroundVelocityMps.Z),
            3);
        w.Num(
            "casevac_vertical_speed_mps",
            observation.VerticalSpeedMps,
            3);
        w.Num("casevac_wind_x_mps", wind.X, 3);
        w.Num("casevac_wind_y_mps", wind.Y, 3);
        w.Num("casevac_wind_z_mps", wind.Z, 3);
        w.Num("casevac_visibility_m", cloud.VisibilityM, 1);
        w.Num(
            "casevac_precipitation_mm_hr",
            cloud.PrecipitationMmPerHour,
            3);
        w.Num(
            "casevac_precipitation_01",
            Math.Clamp(
                cloud.PrecipitationMmPerHour
                    / PresentationRainFullScaleMmPerHour,
                0.0,
                1.0),
            4);
        w.Num(
            "casevac_rotor_wash_intensity_01",
            rotorWash.Intensity01,
            4);
        w.Num(
            "casevac_rotor_wash_radius_m",
            rotorWash.RadiusM,
            2);
        w.Bool(
            "casevac_show_escape_cue",
            mission.Phase == CasevacPhase.AbortReturn);
        w.End();
    }

    static double Fraction(long value, long required) =>
        required > 0
            ? Math.Clamp(value / (double)required, 0.0, 1.0)
            : 0.0;

    static double TicksToSeconds(long ticks) => ticks / AircraftSim.TickHz;

    static double? TicksToSeconds(long? ticks) =>
        ticks.HasValue ? TicksToSeconds(ticks.Value) : null;

    static double PositiveDegrees(double angleRad) {
        double degrees = angleRad * RadiansToDegrees % 360.0;
        return degrees < 0.0 ? degrees + 360.0 : degrees;
    }

    static double? Finite(double value) => double.IsFinite(value) ? value : null;

    /// Round to the same fixed-decimal precision the JSON's F-format uses, so the browser sees the
    /// exact numbers JSON.parse would have produced. RawInteger passes the value through untouched.
    static int CircuitLegCode(string? leg) => leg switch {
        "DEPART" => 1,
        "INITIAL" => 2,
        "BREAK" => 3,
        "DOWNWIND" => 4,
        "BASE" => 5,
        "SHORT_FINAL" => 6,
        "WIRE_FINAL" => 7,
        "COMPLETE" => 8,
        _ => 0,
    };

    static double Quantize(double value, int decimals) {
        if (decimals == RawInteger || !double.IsFinite(value)) return value;
        double away = Math.Round(value, decimals, MidpointRounding.AwayFromZero);
        double even = Math.Round(value, decimals, MidpointRounding.ToEven);
        if (away.Equals(even)) {
            // Scaling can itself round a value just below a decimal midpoint onto x.5, causing
            // both Math.Round modes to agree while fixed-point formatting correctly chooses the
            // other neighbour (for example the pattern's 259.15-ish binary altitude). Escalate
            // only values within a couple of scaled ulps of a midpoint to the exact formatter.
            double scale = decimals switch {
                0 => 1.0,
                1 => 10.0,
                2 => 100.0,
                3 => 1_000.0,
                4 => 10_000.0,
                5 => 100_000.0,
                6 => 1_000_000.0,
                _ => Math.Pow(10.0, decimals),
            };
            double scaled = Math.Abs(value) * scale;
            double fraction = scaled - Math.Floor(scaled);
            double scaledUlp = Math.Abs(Math.BitIncrement(scaled) - scaled);
            if (Math.Abs(fraction - 0.5) > Math.Max(2.0 * scaledUlp, 1e-12))
                return away;
        }

        // Fixed-point formatting resolves exact decimal midpoints from the original binary value;
        // Math.Round first scales and can lose that distinction (for example 0.025 versus 2.1205).
        // Only the rare midpoint path pays for formatting so the per-frame hot path stays numeric.
        string formatted = value.ToString($"F{decimals}", CultureInfo.InvariantCulture);
        return double.Parse(formatted, CultureInfo.InvariantCulture);
    }

    /// Positional writer with name assertions against the static layout. Debug builds (and thus
    /// dotnet test) verify every write lands on the slot the layout declares; release publishes
    /// skip the checks. OpenBlock(false) zero/NaN-fills an absent block and skips past it.
    static void WriteWingman(ref Writer writer, SimulationSession session,
        int index, string prefix) {
        GunsOnly.Sim.Doctrine.Wingman? wingman =
            session.Wingmen.Count > index ? session.Wingmen[index] : null;
        if (wingman is null
            && session.Beat.ScriptedIntercept?.PatternOnly == true
            && index < session.CircuitTraffic.Count
            && session.CircuitTraffic[index].Present) {
            CircuitTrafficShip traffic = session.CircuitTraffic[index];
            double fx = Math.Sin(traffic.Chi);
            double fz = Math.Cos(traffic.Chi);
            writer.Num($"{prefix}_present", 1, RawInteger);
            writer.Num($"{prefix}x", traffic.X, 3);
            writer.Num($"{prefix}y", traffic.Y, 3);
            writer.Num($"{prefix}z", traffic.Z, 3);
            writer.Num($"{prefix}fx", fx, 5);
            writer.Num($"{prefix}fy", 0.0, 5);
            writer.Num($"{prefix}fz", fz, 5);
            writer.Num($"{prefix}lx", 0.0, 5);
            writer.Num($"{prefix}ly", 1.0, 5);
            writer.Num($"{prefix}lz", 0.0, 5);
            writer.Num($"{prefix}_alive", 1, RawInteger);
            WriteNoWingmanGunnery(ref writer, prefix);
            return;
        }
        // Mirror of SnapshotProjection.WingmanJson: a freed slot keeps carrying a still-falling
        // detached wreck (present=1, alive=0) so promotion never blinks an airframe off the wire.
        if (wingman is null
            && session.DetachedWreckForFormationSlot(index) is { } wreck) {
            AircraftState wreckState = wreck.Aircraft;
            Vec3D wreckForward = wreckState.ForwardDir();
            Vec3D wreckLift = wreck.LiftDir;
            writer.Num($"{prefix}_present", 1, RawInteger);
            writer.Num($"{prefix}x", wreckState.Position.X, 3);
            writer.Num($"{prefix}y", wreckState.Position.Y, 3);
            writer.Num($"{prefix}z", wreckState.Position.Z, 3);
            writer.Num($"{prefix}fx", wreckForward.X, 5);
            writer.Num($"{prefix}fy", wreckForward.Y, 5);
            writer.Num($"{prefix}fz", wreckForward.Z, 5);
            writer.Num($"{prefix}lx", wreckLift.X, 5);
            writer.Num($"{prefix}ly", wreckLift.Y, 5);
            writer.Num($"{prefix}lz", wreckLift.Z, 5);
            writer.Num($"{prefix}_alive", 0, RawInteger);
            // A wreck carries no fighting gun, but the block is fixed-width: omitting these
            // shifts every later slot in the buffer.
            WriteNoWingmanGunnery(ref writer, prefix);
            return;
        }
        if (wingman is null) {
            writer.Num($"{prefix}_present", 0, RawInteger);
            writer.Num($"{prefix}x", 0.0, 3);
            writer.Num($"{prefix}y", 0.0, 3);
            writer.Num($"{prefix}z", 0.0, 3);
            writer.Num($"{prefix}fx", 0.0, 5);
            writer.Num($"{prefix}fy", 1.0, 5);
            writer.Num($"{prefix}fz", 0.0, 5);
            writer.Num($"{prefix}lx", 0.0, 5);
            writer.Num($"{prefix}ly", 1.0, 5);
            writer.Num($"{prefix}lz", 0.0, 5);
            writer.Num($"{prefix}_alive", 0, RawInteger);
            WriteNoWingmanGunnery(ref writer, prefix);
            return;
        }

        AircraftState state = wingman.Bandit.State;
        Vec3D forward = state.ForwardDir();
        Vec3D lift = wingman.Bandit.LiftDir;
        writer.Num($"{prefix}_present", 1, RawInteger);
        writer.Num($"{prefix}x", state.Position.X, 3);
        writer.Num($"{prefix}y", state.Position.Y, 3);
        writer.Num($"{prefix}z", state.Position.Z, 3);
        writer.Num($"{prefix}fx", forward.X, 5);
        writer.Num($"{prefix}fy", forward.Y, 5);
        writer.Num($"{prefix}fz", forward.Z, 5);
        writer.Num($"{prefix}lx", lift.X, 5);
        writer.Num($"{prefix}ly", lift.Y, 5);
        writer.Num($"{prefix}lz", lift.Z, 5);
        writer.Num($"{prefix}_alive", wingman.StillFighting ? 1 : 0, RawInteger);
        writer.Num($"{prefix}_ammo", wingman.Gun.AmmoRemaining, RawInteger);
        writer.Num($"{prefix}_rounds_fired", wingman.Gun.RoundsFired, RawInteger);
        writer.Num($"{prefix}_hits", wingman.Gun.TotalHitCount, RawInteger);
        writer.Num($"{prefix}_trigger_down", wingman.TriggerDown ? 1 : 0, RawInteger);
        writer.Num($"{prefix}_gun_firing",
            wingman.TriggerDown
                && wingman.StillFighting
                && wingman.Gun.AmmoRemaining > 0
                && session.PlayerAlive ? 1 : 0,
            RawInteger);
    }

    /// Mirrors SnapshotProjection.NoWingmanGunneryJson for a slot with no fighting aircraft.
    static void WriteNoWingmanGunnery(ref Writer writer, string prefix) {
        writer.Num($"{prefix}_ammo", 0, RawInteger);
        writer.Num($"{prefix}_rounds_fired", 0, RawInteger);
        writer.Num($"{prefix}_hits", 0, RawInteger);
        writer.Num($"{prefix}_trigger_down", 0, RawInteger);
        writer.Num($"{prefix}_gun_firing", 0, RawInteger);
    }

    static void WriteRapierGunDrone(ref Writer writer, SimulationSession session) {
        RapierGunDrone? drone = session.ActiveRapierGunDrone;
        if (drone is null) {
            writer.Num("rd1_present", 0, RawInteger);
            writer.Num("rd1x", 0.0, 3);
            writer.Num("rd1y", 0.0, 3);
            writer.Num("rd1z", 0.0, 3);
            writer.Num("rd1fx", 0.0, 5);
            writer.Num("rd1fy", 1.0, 5);
            writer.Num("rd1fz", 0.0, 5);
            writer.Num("rd1lx", 0.0, 5);
            writer.Num("rd1ly", 1.0, 5);
            writer.Num("rd1lz", 0.0, 5);
            writer.Num("rd1_alive", 0, RawInteger);
            writer.Num("rd1_phase", 0, RawInteger);
            writer.Bool("rd1_turbine_armed", false);
            return;
        }

        AircraftState state = drone.Sim.State;
        Vec3D forward = state.ForwardDir();
        Vec3D lift = drone.Sim.LiftDir;
        writer.Num("rd1_present", 1, RawInteger);
        writer.Num("rd1x", state.Position.X, 3);
        writer.Num("rd1y", state.Position.Y, 3);
        writer.Num("rd1z", state.Position.Z, 3);
        writer.Num("rd1fx", forward.X, 5);
        writer.Num("rd1fy", forward.Y, 5);
        writer.Num("rd1fz", forward.Z, 5);
        writer.Num("rd1lx", lift.X, 5);
        writer.Num("rd1ly", lift.Y, 5);
        writer.Num("rd1lz", lift.Z, 5);
        writer.Num("rd1_alive", 1, RawInteger);
        writer.Num("rd1_phase", (int)drone.Phase, RawInteger);
        writer.Bool("rd1_turbine_armed", drone.TurbineArmed);
    }

    struct Writer {
        readonly double[] _buffer;
        int _index;

        public Writer(double[] buffer, int index = 0) {
            _buffer = buffer;
            _index = index;
        }

        void Write(string name, SlotKind kind, double value) {
            Debug.Assert(Slots[_index].Name == name,
                $"slot {_index}: expected {Slots[_index].Name}, wrote {name}");
            Debug.Assert(Slots[_index].Kind == kind,
                $"slot {_index} ({name}): kind mismatch");
            _buffer[_index++] = value;
        }

        public void Num(string name, double value, int decimals) =>
            Write(name, SlotKind.Number, Quantize(value, decimals));

        public void Bool(string name, bool value) =>
            Write(name, SlotKind.Boolean, value ? 1.0 : 0.0);

        public void Nul(string name, double? value, int decimals) =>
            Write(name, SlotKind.NullableNumber,
                value is { } v && double.IsFinite(v) ? Quantize(v, decimals) : double.NaN);

        public void Tracers(string field, IReadOnlyList<GunRound> rounds) {
            TracerDef def = TracerRegions.First(t => t.Field == field);
            Debug.Assert(_index == def.CountIndex, $"tracer region {field} misaligned");
            // Mirrors TracerJson: only the most recent MaxRounds rounds are projected.
            int first = Math.Max(0, rounds.Count - def.MaxRounds);
            int count = rounds.Count - first;
            _buffer[_index++] = count;
            for (int r = 0; r < count; r++) {
                GunRound round = rounds[first + r];
                _buffer[_index++] = Quantize(round.Position.X, 3);
                _buffer[_index++] = Quantize(round.Position.Y, 3);
                _buffer[_index++] = Quantize(round.Position.Z, 3);
                _buffer[_index++] = Quantize(round.Velocity.X, 3);
                _buffer[_index++] = Quantize(round.Velocity.Y, 3);
                _buffer[_index++] = Quantize(round.Velocity.Z, 3);
            }
            int end = def.Start + def.MaxRounds * 6;
            while (_index < end) _buffer[_index++] = 0.0;
        }

        /// The HUD gunsight funnel's ballistic locus, kept kernel-side rather than recomputed in
        /// JS from hot state: the hot slots for its inputs are quantized for display (body rates
        /// at 2 decimals in degrees, axes at 5), so a client-side BallisticFunnelPoint could not
        /// reproduce the JSON's exact F2/F1 samples — it would break the bridge's bit-identical
        /// contract and the golden tests — and would duplicate the rotation-integral math in a
        /// second language. Mirrors SnapshotProjection.GunTrajectoryJson exactly.
        public void GunTrajectory(string field, in Vec3D shooterPosition,
            in Vec3D shooterVelocity, in Vec3D bodyForward, in Vec3D bodyUp,
            in BodyRates bodyRates, GunProfile profile) {
            SampleArrayDef def = SampleArrays.First(t => t.Field == field);
            Debug.Assert(_index == def.Start,
                $"sample array {field}: cursor {_index} != declared start {def.Start}");
            double horizonSeconds = Math.Min(profile.MaximumFlightSeconds,
                GunKill.EffectiveRangingFlightSeconds);
            Vec3D angularVelocity = GunKill.WorldAngularVelocity(bodyForward, bodyUp, bodyRates);
            for (int i = 0; i < def.Samples; i++) {
                double age = horizonSeconds * i / (def.Samples - 1);
                Vec3D p = GunKill.BallisticFunnelPoint(shooterPosition, shooterVelocity,
                    bodyForward, angularVelocity, profile.MuzzleVelocityMps, age);
                _buffer[_index++] = Quantize(p.X, 2);
                _buffer[_index++] = Quantize(p.Y, 2);
                _buffer[_index++] = Quantize(p.Z, 2);
                _buffer[_index++] = Quantize((p - shooterPosition).Length, 1);
            }
        }

        public void ApproachGates(
            string field, in GunsOnly.Sim.Recovery.ApproachGuidanceState approach) {
            SampleArrayDef def = SampleArrays.First(t => t.Field == field);
            Debug.Assert(_index == def.Start,
                $"sample array {field}: cursor {_index} != declared start {def.Start}");
            IReadOnlyList<GunsOnly.Sim.Recovery.WorldApproachGate> gates = approach.Gates;
            for (int i = 0; i < def.Samples; i++) {
                if (i < gates.Count) {
                    GunsOnly.Sim.Recovery.WorldApproachGate gate = gates[i];
                    _buffer[_index++] = Quantize(gate.EastM, 1);
                    _buffer[_index++] = Quantize(gate.NorthM, 1);
                    _buffer[_index++] = Quantize(gate.UpM, 1);
                    _buffer[_index++] = Quantize(gate.HalfM, 1);
                    _buffer[_index++] = Quantize(gate.TargetAltitudeM, 1);
                    _buffer[_index++] = Quantize(gate.TargetKtas, 0);
                    _buffer[_index++] = Quantize(gate.TargetSpeedToleranceKtas, 0);
                    _buffer[_index++] = (int)gate.PatternLeg;
                    _buffer[_index++] = gate.DirtyConfig ? 1.0 : 0.0;
                    _buffer[_index++] = gate.Active ? 1.0 : 0.0;
                } else {
                    // Fixed-length sample arrays stay numeric (not NaN) so they match the JSON
                    // sample_arrays contract the same way gun_trajectory does.
                    for (int c = 0; c < ApproachGateKeys.Length; c++)
                        _buffer[_index++] = 0.0;
                }
            }
        }

        public bool OpenBlock(string name, bool present) {
            BlockDef block = Blocks.First(bd => bd.Name == name);
            Debug.Assert(_index == block.Start,
                $"block {name}: cursor {_index} != declared start {block.Start}");
            if (present) return true;
            for (int j = block.Start; j < block.Start + block.Count; j++)
                _buffer[j] = Slots[j].Kind == SlotKind.Boolean ? 0.0 : double.NaN;
            if (block.PresenceIndex >= 0 && block.PresenceIndex >= block.Start)
                _buffer[block.PresenceIndex] = 0.0;
            _index = block.Start + block.Count;
            return false;
        }

        public bool OpenCasevacBlock(bool present) {
            Debug.Assert(_index == CasevacBlock.Start,
                $"CASEVAC block: cursor {_index} != declared start {CasevacBlock.Start}");
            if (present) return true;
            for (int j = CasevacBlock.Start;
                j < CasevacBlock.Start + CasevacBlock.Count;
                j++)
                _buffer[j] =
                    Slots[j].Kind == SlotKind.Boolean ? 0.0 : double.NaN;
            _buffer[CasevacBlock.PresenceIndex] = 0.0;
            _index = CasevacBlock.Start + CasevacBlock.Count;
            return false;
        }

        public void End() {
            Debug.Assert(_index == SlotCount,
                $"fill ended at slot {_index}, layout declares {SlotCount}");
        }
    }

    /// <summary>
    /// One-time layout contract for the browser: slot names/kinds/indices, block presence slots,
    /// and tracer regions. The browser uses this to decode the buffer generically, so field
    /// additions only touch this file and the golden tests.
    /// </summary>
    public static string LayoutJson() {
        if (_layoutJson is not null) return _layoutJson;
        var json = new StringBuilder(SlotCount * 48);
        json.Append("{\"layout_version\":").Append(LayoutVersion)
            .Append(",\"slot_count\":").Append(SlotCount)
            .Append(",\"cold_version_index\":").Append(ColdVersionIndex)
            .Append(",\"blocks\":[");
        bool firstBlock = true;
        foreach (BlockDef block in Blocks) {
            if (!firstBlock) json.Append(',');
            firstBlock = false;
            json.Append("{\"name\":").Append(SnapshotJson.JsonString(block.Name))
                .Append(",\"presence_index\":").Append(block.PresenceIndex)
                .Append(",\"slots\":[");
            bool firstSlot = true;
            for (int j = block.Start; j < block.Start + block.Count; j++) {
                SlotDef slot = Slots[j];
                if (slot.Name.Contains('[') || slot.Name.EndsWith("_count", StringComparison.Ordinal)
                    && TracerRegions.Any(t => t.CountIndex == j))
                    continue; // tracer region slots are described by the tracers section
                if (slot.Name == "cold_version") continue;
                if (!firstSlot) json.Append(',');
                firstSlot = false;
                json.Append("{\"name\":").Append(SnapshotJson.JsonString(slot.Name))
                    .Append(",\"index\":").Append(j)
                    .Append(",\"kind\":\"").Append(slot.Kind switch {
                        SlotKind.Boolean => "boolean",
                        SlotKind.NullableNumber => "nullable",
                        _ => "number"
                    }).Append("\"}");
            }
            json.Append("]}");
        }
        json.Append("],\"tracers\":[");
        bool firstTracer = true;
        foreach (TracerDef tracer in TracerRegions) {
            if (!firstTracer) json.Append(',');
            firstTracer = false;
            json.Append("{\"field\":").Append(SnapshotJson.JsonString(tracer.Field))
                .Append(",\"count_index\":").Append(tracer.CountIndex)
                .Append(",\"start\":").Append(tracer.Start)
                .Append(",\"max_rounds\":").Append(tracer.MaxRounds)
                .Append(",\"stride\":6}");
        }
        json.Append("],\"sample_arrays\":[");
        bool firstSampleArray = true;
        foreach (SampleArrayDef sampleArray in SampleArrays) {
            if (!firstSampleArray) json.Append(',');
            firstSampleArray = false;
            json.Append("{\"field\":").Append(SnapshotJson.JsonString(sampleArray.Field))
                .Append(",\"start\":").Append(sampleArray.Start)
                .Append(",\"samples\":").Append(sampleArray.Samples)
                .Append(",\"keys\":[");
            for (int k = 0; k < sampleArray.Keys.Length; k++) {
                if (k != 0) json.Append(',');
                json.Append(SnapshotJson.JsonString(sampleArray.Keys[k]));
            }
            json.Append("]}");
        }
        json.Append("],\"casevac_block\":{\"name\":")
            .Append(SnapshotJson.JsonString(CasevacBlock.Name))
            .Append(",\"presence_index\":")
            .Append(CasevacBlock.PresenceIndex)
            .Append(",\"slots\":[");
        bool firstCasevacSlot = true;
        for (int j = CasevacBlock.Start + 1;
            j < CasevacBlock.Start + CasevacBlock.Count;
            j++) {
            SlotDef slot = Slots[j];
            if (!firstCasevacSlot) json.Append(',');
            firstCasevacSlot = false;
            json.Append("{\"name\":")
                .Append(SnapshotJson.JsonString(slot.Name))
                .Append(",\"index\":").Append(j)
                .Append(",\"kind\":\"").Append(slot.Kind switch {
                    SlotKind.Boolean => "boolean",
                    SlotKind.NullableNumber => "nullable",
                    _ => "number"
                }).Append("\"}");
        }
        json.Append("]}}");
        _layoutJson = json.ToString();
        return _layoutJson;
    }

    /// <summary>
    /// Cheap per-frame signature of everything that only reaches the browser through the cold JSON.
    /// Any change bumps cold_version so the browser re-fetches the full snapshot that same frame.
    /// This is a heuristic to make edges land immediately — the browser's fallback re-fetch
    /// interval remains the correctness backstop for anything not captured here.
    /// </summary>
    readonly record struct CasevacColdFingerprint(
        SimulationSession.LifecycleState Lifecycle,
        int BeatIndex,
        CasevacFlightRuntime Flight,
        long PlayerSpawnSequence,
        long MissionEpochSequence,
        CasevacPhase Phase,
        CapsuleCustody Custody,
        CasevacDisposition Disposition,
        string? TargetSiteId,
        string? DestinationEnergyTargetId,
        bool RequestedHandoffWindowPassed,
        bool StableContact,
        bool StabilizationStarted,
        bool InsideTerminalVolume,
        LandingZoneGateClass GateClass,
        string? LandingSiteId,
        VehicleContactKind ContactKind,
        string? ContactSurfaceId,
        VehiclePowerAssessment PowerAssessment,
        CasevacMaskingState MaskingState,
        int RecentEventCount,
        long LatestEventSequence,
        object? WeatherProfile,
        object? Terrain,
        double WorldOriginEastM,
        double WorldOriginNorthM,
        bool WorldOriginConfigured) {

        public static CasevacColdFingerprint Capture(
            SimulationSession session,
            CasevacFlightRuntime flight,
            CasevacMissionSnapshot mission,
            in LandingZoneObservation landingZone,
            in CasevacTargetGuidance guidance,
            in CasevacDestinationEnergyPlan energyPlan,
            double worldOriginEastM,
            double worldOriginNorthM,
            bool worldOriginConfigured) {
            IReadOnlyList<CasevacMissionEventRecord> events =
                flight.RecentEvents;
            PlayerVehicleObservation observation =
                flight.VehicleObservation;
            return new CasevacColdFingerprint(
                session.Lifecycle,
                session.BeatIndex,
                flight,
                session.PlayerSpawnSequence,
                mission.MissionEpochSequence,
                mission.Phase,
                mission.Custody,
                mission.Disposition,
                guidance.TargetId,
                energyPlan.TargetId,
                mission.RequestedHandoffWindowPassed,
                mission.StableContact,
                mission.StabilizationProgressTicks > 0,
                landingZone.InsideTerminalVolume,
                landingZone.GateClass,
                landingZone.SiteId,
                observation.Contact.Kind,
                observation.Contact.SurfaceId,
                observation.Power.Assessment,
                flight.LastExposure.MaskingState,
                events.Count,
                events.Count > 0 ? events[^1].Sequence : -1,
                session.Weather,
                session.Terrain,
                worldOriginEastM,
                worldOriginNorthM,
                worldOriginConfigured);
        }
    }

    readonly record struct ColdFingerprint(
        SimulationSession.LifecycleState Lifecycle,
        int BeatIndex,
        ValleyVariant Variant,
        SortieOutcome Outcome,
        SortieOutcome PendingOutcome,
        CombatHandoffPhase CombatHandoffPhase,
        MissionRtbReason ReturnToBaseReason,
        RunwayRecoveryPhase ConventionalRunwayPhase,
        bool TerminalPhaseActive,
        AircraftTerminalState PlayerTerminalState,
        AircraftTerminalState OpponentTerminalState,
        ImpactSurface PlayerImpactSurface,
        ImpactSurface OpponentImpactSurface,
        bool OpponentBodyPresent,
        FormationTacticalRole PrimaryFormationRole,
        FormationTacticalRole FirstWingmanFormationRole,
        long PlayerSpawnSequence,
        long BanditSpawnSequence,
        long CarrierSpawnSequence,
        int IncidentReplayClipId,
        bool IncidentReplayAvailable,
        long LatestEventSequence,
        object? WeatherProfile,
        object? Terrain,
        PilotOperationalState PilotState,
        AutoGcasPhase GcasPhase,
        AutoGcasInhibitReason GcasInhibit,
        string? GcasCue,
        string GunneryAssistStatus,
        TimeCompressionInhibitReason TimeCompressionInhibit,
        RapierMissionPhase RapierPhase,
        string RapierPhaseReason,
        string RapierIntention,
        string RapierStrategy,
        RapierComputerFailure RapierComputerFailure,
        LandingGearHandle GearHandle,
        LandingGearIndication GearNose,
        LandingGearIndication GearLeft,
        LandingGearIndication GearRight,
        WingFlapLever FlapLever,
        MissionChecklistId ChecklistId,
        int ChecklistDone,
        int ChecklistTotal,
        FlightConfigurationTarget ConfigurationTarget,
        bool ConfigurationTransitionActive,
        string? TransitionCue,
        string? ConfigurationCue,
        string? AdviceContext,
        FightOutcome FightOutcome,
        Aim9FlightState Aim9State,
        object? MaintenanceScenario,
        int MaintenanceSignature,
        object? MergeEvaluation,
        int MergeSignature,
        string? MergeCue,
        object? DroneEvaluation,
        int DroneSignature,
        string? DroneCue,
        Carrier.Recovery Recovery,
        int CaughtWire,
        int TouchdownSignature,
        int PassSignature,
        ArrestmentModel.ArrestmentPhase ArrestPhase,
        int DifficultySignature,
        bool CircuitRadioActive,
        long CircuitRadioSequence,
        string Mode,
        string? LsoCall,
        LsoSeverity? LsoSeverity,
        double WorldOriginEastM,
        double WorldOriginNorthM,
        bool WorldOriginConfigured,
        string MeshActiveKey,
        CarrierSortieRoutePhase CarrierRoutePhase,
        CarrierSortieRouteFix CarrierRouteFix,
        string CarrierRouteProfileId,
        SortieLeg SortieLeg,
        SortieLimit SortieLimit,
        bool ApproachGuidanceActive,
        string ApproachNextLabel,
        ApproachExtensionKind ApproachExtension) {

        public static ColdFingerprint Capture(SimulationSession session,
            double worldOriginEastM, double worldOriginNorthM, bool worldOriginConfigured) {
            IReadOnlyList<SessionEvent> events = session.RecentEvents;
            AutoGcasState gcas = session.AutoGcas;
            GunneryPitchAssistState gunneryPitchAssist = session.GunneryPitchAssist;
            AirframeSystems systems = session.PlayerSystems;
            F86EmergencyGearRecoveryScenario? maintenance = session.MaintenanceScenario;
            VisualMergeEvaluation? merge = session.VisualMergeEvaluation;
            DroneRaidEvaluation? drone = session.DroneRaidEvaluation;
            Carrier.TouchdownResult touchdown = session.Touchdown;
            CarrierPassResult pass = session.CarrierPass;
            RecoveryDifficulty difficulty = session.Difficulty;

            // The mode string and LSO advisory only travel in the cold JSON but are
            // frame-cadence presentation in carrier beats (paddles call text/severity, the
            // hudMode gate, accessibility announcements). Mirror BuildState's derivation —
            // constant-string selection plus, in carrier beats, the same per-frame
            // Lso.AdviseForMode the old JSON-per-frame path already paid — so their edges
            // bump cold_version the frame they happen. Keep in lockstep with
            // SnapshotProjection.BuildState (mode chain + LSO guard).
            ArrestmentModel arrestment = session.Arrestment;
            Carrier? carrier = session.Carrier;
            bool catapulting = session.Catapult.IsActive;
            bool arrested = arrestment.IsActive && !catapulting;
            bool waveOff = session.WaveOffActive;
            string mode = arrestment.Phase == ArrestmentModel.ArrestmentPhase.Failed
                ? "ARRESTMENT FAILED"
                : session.Recovery == Carrier.Recovery.BarrierEngagement ? "BARRIER"
                : session.TerminalPhaseActive ? "TERMINAL"
                : catapulting ? "CATAPULT"
                : session.Recovery == Carrier.Recovery.Bolter ? "BOLTER"
                : arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested ? "ARRESTED"
                : arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped ? "STOPPED"
                : waveOff ? "WAVE-OFF"
                : session.Controls.ApproachMode ? "APPROACH" : "FREE";
            string? lsoCall = null;
            LsoSeverity? lsoSeverity = null;
            if (carrier is not null && !arrested && !catapulting) {
                LsoAdvice? lso = Lso.AdviseForMode(carrier, session.Player.State,
                    session.Player.AngleOfAttackRad, carrier.ApproachDirectorPitchOffsetRad,
                    mode == "APPROACH", waveOff);
                lsoCall = lso?.Call;
                lsoSeverity = lso?.Severity;
            }

            return new ColdFingerprint(
                session.Lifecycle,
                session.BeatIndex,
                session.Variant,
                session.Outcome,
                session.PendingOutcome,
                session.CombatHandoffPhase,
                session.ReturnToBaseReason,
                session.ConventionalRunwayPhase,
                session.TerminalPhaseActive,
                session.PlayerTerminalState,
                session.OpponentTerminalState,
                session.PlayerImpactSurface,
                session.OpponentImpactSurface,
                session.OpponentBodyPresent,
                session.PrimaryFormationRole,
                session.WingmanFormationRole(0),
                session.PlayerSpawnSequence,
                session.BanditSpawnSequence,
                session.CarrierSpawnSequence,
                session.IncidentReplay.ClipId,
                session.IncidentReplay.ExportAvailable,
                events.Count > 0 ? events[^1].Sequence : -1,
                session.Weather,
                session.Terrain,
                session.PilotState,
                gcas.Phase,
                gcas.InhibitReason,
                gcas.Cue,
                // The numeric status code rides the hot buffer, but the human-readable token is
                // part of the cold JSON base. Refresh that base on the same frame as every status
                // edge so diagnostics can never combine a current code with a stale label.
                gunneryPitchAssist.Status,
                session.TimeCompressionInhibitReason,
                session.RapierPhase,
                session.RapierPhaseReason,
                session.RapierIntention,
                session.RapierStrategy,
                session.RapierComputerFailureActive,
                systems.GearHandle,
                systems.NoseGearIndication,
                systems.LeftMainGearIndication,
                systems.RightMainGearIndication,
                systems.FlapLever,
                // Checklist name/next travel cold-only; fingerprint the progress so a
                // completion (e.g. WEAPONS AUTH) that moves no other fingerprinted field
                // still refreshes the cold wire promptly instead of on the 5 s fallback.
                session.MissionChecklist.Id,
                session.MissionChecklist.Done,
                session.MissionChecklist.Total,
                session.ConfigurationTarget,
                session.ConfigurationTransitionActive,
                session.TransitionCue,
                session.ConfigurationCue,
                session.Advice.Context,
                session.OpponentPresent
                    ? session.PlayerGun.Outcome
                    : FightOutcome.Flying,
                session.Aim9SeekerState,
                maintenance,
                maintenance is null ? 0
                    : System.HashCode.Combine((int)maintenance.State, maintenance.Score,
                        maintenance.DemeritCount, maintenance.ProcedurallyComplete,
                        maintenance.Recovered, maintenance.PilotInstruction),
                merge,
                merge is null ? 0
                    : System.HashCode.Combine(merge.Score, merge.FirstPassComplete,
                        merge.HeadOnTriggerViolations, merge.HighAspectTriggerViolations,
                        merge.Overshoots, merge.WeaponsStateCue),
                merge?.Cue,
                drone,
                drone is null ? 0
                    : System.HashCode.Combine(drone.Score, drone.Kills, drone.Leakers,
                        drone.ActiveTargetNumber, drone.Finished, drone.OwnshipLost),
                drone?.Cue,
                session.Recovery,
                session.Arrestment.CaughtWire,
                System.HashCode.Combine((int)touchdown.Recovery, (int)touchdown.Quality,
                    (int)touchdown.Hook, (int)touchdown.Grade, touchdown.Wire,
                    (int)touchdown.PrimaryCorrection),
                System.HashCode.Combine((int)pass.Grade, (int)pass.PrimaryCorrection,
                    pass.WaveOffRequired, pass.WaveOffComplied, pass.PhaseSummary),
                session.Arrestment.Phase,
                System.HashCode.Combine(difficulty.Level, difficulty.AttemptIndex,
                    difficulty.Variation, difficulty.IsEased, difficulty.IsSpike),
                session.MissionRadio.Active,
                session.MissionRadio.Sequence,
                mode,
                lsoCall,
                lsoSeverity,
                worldOriginEastM,
                worldOriginNorthM,
                worldOriginConfigured,
                FormatMeshNavColdKey(session.MeshNav, session.RecoveryProcedure),
                session.CarrierSortieRoute.Phase,
                session.CarrierSortieRoute.ActiveFix,
                session.CarrierSortieRoute.ProfileId,
                session.SortiePlan.Leg,
                session.SortiePlan.Limit,
                session.ApproachGuidancePlan.GuidanceActive,
                session.ApproachGuidancePlan.NextLabel,
                session.ApproachGuidancePlan.Extension);
        }

        static string FormatMeshNavColdKey(MeshNavDirector mesh, RecoveryProcedureDirector recovery) {
            MeshActiveDest? active = mesh.Active;
            string activeKey = active is null
                ? "none"
                : active.Value.IsPlace
                    ? $"place|{active.Value.PlaceId}"
                    : $"fix|{active.Value.EastM:F0}|{active.Value.NorthM:F0}";
            return $"{(int)mesh.Mode}|{activeKey}|cat:{mesh.Catalog.Count}|tour:{mesh.Tour.Count}"
                + $"|proc:{(int)recovery.Kind}|gate:{recovery.ActiveIndex}";
        }
    }
}
