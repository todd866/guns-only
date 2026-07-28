using System.Diagnostics;
using System.Globalization;
using System.Text;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

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

    public const int LayoutVersion = 15;
    public const int ColdVersionIndex = 0;
    // Mirrors SnapshotProjection.TracerJson's MaxRenderedTracers window (last N rounds in flight).
    const int MaxTracerRounds = 48;
    // Mirrors SnapshotProjection.GunTrajectoryJson's SampleCount: the HUD funnel's 9 samples of
    // the bullets-in-the-air locus. Slot order per sample is x,y,z,r (r = range from shooter).
    const int TrajectorySampleCount = 9;
    static readonly string[] TrajectoryKeys = { "x", "y", "z", "r" };
    static readonly int[] TrajectoryDecimals = { 2, 2, 2, 1 };
    const int RawInteger = -1;

    static readonly List<SlotDef> Slots = new();
    static readonly List<BlockDef> Blocks = new();
    static readonly List<TracerDef> TracerRegions = new();
    static readonly List<SampleArrayDef> SampleArrays = new();
    public static readonly int SlotCount;

    static long _coldVersion = 1;
    static ColdFingerprint? _lastFingerprint;
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

        Num("cold_version", RawInteger);
        Debug.Assert(slots.Count - 1 == ColdVersionIndex);

        Num("t", 4);
        Num("tick", RawInteger);
        Bool("time_compression_available");
        Bool("time_compression_enabled");
        Bool("time_compression_eligible");
        Num("time_compression_requested_factor", RawInteger);
        Num("time_compression_factor", RawInteger);
        Bool("rapier_mission_available");
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
        Num("rapier_guidance_x", 3);
        Num("rapier_guidance_y", 3);
        Num("rapier_guidance_z", 3);
        Num("rapier_recovery_gate", RawInteger);
        Num("rapier_circuit_leg_code", RawInteger);
        Num("rapier_fd_bank_deg", 1);
        Num("rapier_fd_target_ktas", 0);
        Num("rapier_gate_half_m", 1);
        Num("rapier_gate_face_x", 4);
        Num("rapier_gate_face_y", 4);
        Num("rapier_gate_face_z", 4);
        Bool("rapier_gate_in_volume");
        Bool("rapier_gate_energy_ok");
        Num("rapier_nose_on_v_err_deg", 1);
        Num("rapier_lob_skip", RawInteger);
        Num("rapier_lob_skip_max", RawInteger);
        Num("rapier_rcs_gas_frac", 3);
        Num("rapier_rcs_authority", 3);
        Bool("rapier_zoom_lob");
        Num("rapier_commanded_mach", 2);
        Num("rapier_skin_mach_limit", 2);
        Num("rapier_authored_target_mach", 2);
        Num("rapier_turbine_thrust_kn", 2);
        Num("rapier_ramjet_thrust_kn", 2);
        Num("rapier_turbine_fuel_ppm", 2);
        Num("rapier_ramjet_fuel_ppm", 2);
        Num("rapier_stagnation_temp_c", 0);
        Num("rapier_thermal_margin_c", 0);
        Num("player_gross_lb", 0);
        Num("rapier_intercept_eti_min", 1);
        Num("px", 3); Num("py", 3); Num("pz", 3);
        // World-frame ground velocity: the HUD projects the flight-path marker (FPV) from this
        // exact vector every frame, so it must ride the hot path (Build 64 reconciliation).
        Num("vx", 3); Num("vy", 3); Num("vz", 3);
        Num("pfx", 5); Num("pfy", 5); Num("pfz", 5);
        Num("plx", 5); Num("ply", 5); Num("plz", 5);
        Num("bx", 3); Num("by", 3); Num("bz", 3);
        Num("bfx", 5); Num("bfy", 5); Num("bfz", 5);
        Num("blx", 5); Num("bly", 5); Num("blz", 5);
        // Three fixed additional-aircraft blocks keep the hot path allocation-free while exposing
        // the complete four-ship formation authored for Rapier.
        foreach (string prefix in new[] { "w1", "w2", "w3" }) {
            Num($"{prefix}_present", RawInteger);
            Num($"{prefix}x", 3); Num($"{prefix}y", 3); Num($"{prefix}z", 3);
            Num($"{prefix}fx", 5); Num($"{prefix}fy", 5); Num($"{prefix}fz", 5);
            Num($"{prefix}lx", 5); Num($"{prefix}ly", 5); Num($"{prefix}lz", 5);
            Num($"{prefix}_alive", RawInteger);
        }
        Nul("formation_coordination_age_s", 3);
        Bool("formation_coordination_stale");
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
        Num("gunnery_pitch_error_deg", 3);
        Num("gunnery_total_lead_error_deg", 3);
        Num("gunnery_pitch_rate_cmd_dps", 3);
        Num("gunnery_pitch_rate_measured_dps", 3);
        Num("gunnery_pitch_rate_error_dps", 3);
        Num("gunnery_pitch_assist_g", 3);
        Num("gunnery_pitch_assist_delta_g", 3);
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
        Bool("high_alpha_recovery");
        Num("g_valley", 3);
        Num("g_maxperform", 3);
        Num("g_hardmax", 3);
        Num("g_override_max", 3);
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
        Bool("rtb_steer");
        Num("rtb_bearing_deg", 2);
        Num("rtb_turn_deg", 2);
        Num("rtb_range_nm", 2);
        Bool("recovery_point_known");
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
        Num("runway_touchdown_deviations", RawInteger);
        Bool("player_rtb_active");
        Nul("rtb_closure_kts", 2);
        Nul("rtb_eta_min", 2);
        Nul("fuel_to_home_estimate_lb", 2);
        Nul("fuel_on_arrival_estimate_lb", 2);
        Nul("fuel_reserve_target_lb", 2);
        Nul("fuel_reserve_margin_lb", 2);
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

        ColdFingerprint fingerprint = ColdFingerprint.Capture(
            session, worldOriginEastM, worldOriginNorthM, worldOriginConfigured);
        if (_lastFingerprint is not { } last || !fingerprint.Equals(last))
            _coldVersion++;
        _lastFingerprint = fingerprint;

        // ---- Derivation prologue: duplicated from SnapshotProjection.BuildState on purpose ----
        AircraftSim player = session.Player;
        IBandit bandit = session.Bandit;
        BeatSetup beat = session.Beat;
        DetentLayer detents = session.Controls;
        PilotCommand requestedCommand = detents.Command;
        PilotCommand appliedCommand = player.LastAppliedCommand;
        bool lateralControlApplied = player.HasAppliedFlightCommand;
        GunKill gunKill = session.PlayerGun;
        GunKill opponentGun = session.OpponentGun;
        FuelModel fuel = session.PlayerFuel;
        AirframeSystems systems = session.PlayerSystems;
        PilotPhysiologyState physiology = session.PilotPhysiologyState;
        AutoGcasState autoGcas = session.AutoGcas;
        AutoGcasPrediction gcasPrediction = autoGcas.Prediction;
        GunneryPitchAssistState pitchAssist = session.GunneryPitchAssist;
        PadlockRollAssistState padlockRollAssist = session.BanditPadlockRollAssist;
        Carrier? carrier = session.Carrier;
        Carrier.Recovery recovery = session.Recovery;
        Carrier.TouchdownResult touchdown = session.Touchdown;
        ArrestmentModel arrestment = session.Arrestment;
        CatapultLaunchModel catapult = session.Catapult;
        double simTimeMs = session.TimeMilliseconds;
        bool finished = session.Lifecycle == SimulationSession.LifecycleState.Finished;

        bool catapulting = catapult.IsActive;
        AircraftState s = catapulting ? catapult.State : player.State;
        AircraftState b = bandit.State;
        AircraftState gunTarget = session.SelectedOpponentState;
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
        // Lagged structural skin (heat capacity). Instantaneous adiabatic wall temperature falls on
        // a decelerating dive; publishing that as "skin" made the HUD cool from 100 kft to sea
        // level. Limit schedules still use AirData.AdiabaticWallTemperatureK / MachLimit.
        double rapierStagnationTempC = player.SkinTemperatureK > 0.0
            ? player.SkinTemperatureK - 273.15
            : AirData.AdiabaticWallTemperatureK(mach, atmosphericState.TemperatureK) - 273.15;
        // Read from the AIRFRAME, never hardcoded. This was 900 C (the Mach-4 engine's number),
        // then 320 C (steel), while the aircraft moved to a 1200 C CMC hot structure — so the HUD
        // reported the pilot 150 C over a limit they were nowhere near. A displayed limit that does
        // not come from the thing it is limiting will always drift out of date.
        double rapierThermalLimitC =
            (session.Beat.PlayerAir.SkinTemperatureLimitK > 0.0
                ? session.Beat.PlayerAir.SkinTemperatureLimitK : 593.15) - 273.15;
        // Minutes to the contact at present closure; negative means "do not show". Inside 20 km
        // the geometry is a fight rather than a transit and the number churns uselessly.
        double interceptEtiMinutes = -1.0;
        {
            Vec3D etiDelta = session.Bandit.State.Position - session.Player.State.Position;
            double etiRangeM = etiDelta.Length;
            if (etiRangeM >= 20_000.0) {
                Vec3D etiRelative = session.Player.State.VelocityVector()
                    - session.Bandit.State.VelocityVector();
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

        Vec3D bl = bandit.LiftDir;
        Vec3D bf = b.ForwardDir();
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
        bool splashCue = !finished && session.SplashCueActive;
        double surfaceAltitudeM = session.Terrain?.TrySample(
            playerPosition.X, playerPosition.Z, out TerrainSample terrainSample) == true
                ? terrainSample.HeightM : 0.0;
        if (carrier is not null && carrier.WithinDeckFootprint(playerPosition))
            surfaceAltitudeM = playerPosition.Y - carrier.DeckFrame(playerPosition).height;
        if (session.ConventionalRunwayRecovery?.Runway is { } runway
            && runway.ContainsPavement(playerPosition, marginM: 2.0))
            surfaceAltitudeM = runway.Threshold.Y;
        double radarAltitudeM = Math.Max(0.0, playerPosition.Y - surfaceAltitudeM);
        double verticalSpeedMps = arrested ? 0.0 : s.VelocityVector().Y;
        var engine = player.LastEngineOperatingPoint;
        double sustainedG = Protection.SustainedG(s, beat.PlayerAir,
            trueAirspeedMps, engine.NetThrustN,
            session.PlayerAerodynamicConfiguration, atmosphere);
        // ---- End of duplicated prologue ----

        var w = new Writer(buffer);
        w.Num("cold_version", _coldVersion, RawInteger);
        w.Num("t", simTimeMs / 1000.0, 4);
        w.Num("tick", session.Tick, RawInteger);
        w.Bool("time_compression_available", session.TimeCompressionAvailable);
        w.Bool("time_compression_enabled", session.TimeCompressionPilotEnabled);
        w.Bool("time_compression_eligible", session.TimeCompressionEligible);
        w.Num("time_compression_requested_factor",
            session.TimeCompressionRequestedFactor, RawInteger);
        w.Num("time_compression_factor", session.TimeCompressionFactor, RawInteger);
        w.Bool("rapier_mission_available", session.RapierMissionAvailable);
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
        w.Num("rapier_guidance_x", session.RapierGuidanceWaypoint.X, 3);
        w.Num("rapier_guidance_y", session.RapierGuidanceWaypoint.Y, 3);
        w.Num("rapier_guidance_z", session.RapierGuidanceWaypoint.Z, 3);
        w.Num("rapier_recovery_gate", session.RapierRecoveryGate, RawInteger);
        w.Num("rapier_circuit_leg_code", CircuitLegCode(session.RapierCircuitLeg), RawInteger);
        w.Num("rapier_fd_bank_deg", session.RapierFdBankDeg, 1);
        w.Num("rapier_fd_target_ktas", session.RapierFdTargetKtas, 0);
        w.Num("rapier_gate_half_m", session.RapierGateHalfM, 1);
        w.Num("rapier_gate_face_x", session.RapierGateFace.X, 4);
        w.Num("rapier_gate_face_y", session.RapierGateFace.Y, 4);
        w.Num("rapier_gate_face_z", session.RapierGateFace.Z, 4);
        w.Bool("rapier_gate_in_volume", session.RapierGateInVolume);
        w.Bool("rapier_gate_energy_ok", session.RapierGateEnergyOk);
        w.Num("rapier_nose_on_v_err_deg", session.RapierNoseOnVelocityErrorDeg, 1);
        w.Num("rapier_lob_skip", session.RapierLobSkip, RawInteger);
        w.Num("rapier_lob_skip_max", session.RapierLobSkipMax, RawInteger);
        w.Num("rapier_rcs_gas_frac", session.RapierRcsGasFraction, 3);
        w.Num("rapier_rcs_authority", session.RapierRcsAuthority, 3);
        w.Bool("rapier_zoom_lob", session.Beat.ScriptedIntercept?.ZoomLobProfile == true);
        w.Num("rapier_commanded_mach", session.RapierCommandedMach, 2);
        w.Num("rapier_skin_mach_limit",
            double.IsFinite(session.RapierSkinMachLimit) ? session.RapierSkinMachLimit : 0.0, 2);
        w.Num("rapier_authored_target_mach", session.RapierAuthoredTargetMach, 2);
        w.Num("rapier_turbine_thrust_kn", session.RapierTurbineThrustN / 1000.0, 2);
        w.Num("rapier_ramjet_thrust_kn", session.RapierRamjetThrustN / 1000.0, 2);
        w.Num("rapier_turbine_fuel_ppm", session.RapierTurbineFuelFlowLbPerMinute, 2);
        w.Num("rapier_ramjet_fuel_ppm", session.RapierRamjetFuelFlowLbPerMinute, 2);
        w.Num("rapier_stagnation_temp_c", rapierStagnationTempC, 0);
        w.Num("rapier_thermal_margin_c",
            rapierThermalLimitC - rapierStagnationTempC, 0);
        w.Num("player_gross_lb", session.Player.State.Mass * 2.20462262, 0);
        w.Num("rapier_intercept_eti_min", interceptEtiMinutes, 1);
        w.Num("px", playerPosition.X, 3); w.Num("py", playerPosition.Y, 3); w.Num("pz", playerPosition.Z, 3);
        w.Num("vx", groundVelocity.X, 3); w.Num("vy", groundVelocity.Y, 3); w.Num("vz", groundVelocity.Z, 3);
        w.Num("pfx", pf.X, 5); w.Num("pfy", pf.Y, 5); w.Num("pfz", pf.Z, 5);
        w.Num("plx", pl.X, 5); w.Num("ply", pl.Y, 5); w.Num("plz", pl.Z, 5);
        w.Num("bx", b.Position.X, 3); w.Num("by", b.Position.Y, 3); w.Num("bz", b.Position.Z, 3);
        w.Num("bfx", bf.X, 5); w.Num("bfy", bf.Y, 5); w.Num("bfz", bf.Z, 5);
        w.Num("blx", bl.X, 5); w.Num("bly", bl.Y, 5); w.Num("blz", bl.Z, 5);
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
        w.Num("gunnery_pitch_error_deg", pitchAssist.PitchLeadErrorRad * 57.29577951308232, 3);
        w.Num("gunnery_total_lead_error_deg", pitchAssist.TotalLeadErrorRad * 57.29577951308232, 3);
        w.Num("gunnery_pitch_rate_cmd_dps",
            pitchAssist.RequestedPitchRateRadPerSecond * 57.29577951308232, 3);
        w.Num("gunnery_pitch_rate_measured_dps",
            pitchAssist.MeasuredPitchRateRadPerSecond * 57.29577951308232, 3);
        w.Num("gunnery_pitch_rate_error_dps",
            pitchAssist.PitchRateErrorRadPerSecond * 57.29577951308232, 3);
        w.Num("gunnery_pitch_assist_g", pitchAssist.AssistedLoadFactorG, 3);
        w.Num("gunnery_pitch_assist_delta_g", pitchAssist.LoadFactorCorrectionG, 3);
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
        w.Bool("high_alpha_recovery", detents.HighAlphaRecoveryActive);
        w.Num("g_valley", detents.ValleyG, 3);
        w.Num("g_maxperform", Protection.MaxPerformG(s, beat.PlayerAir, trueAirspeedMps, atmosphere), 3);
        w.Num("g_hardmax", Protection.HardMaxG(s, beat.PlayerAir, trueAirspeedMps, atmosphere), 3);
        w.Num("g_override_max", Protection.OverrideMaxG(s, beat.PlayerAir, trueAirspeedMps, atmosphere), 3);
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
        w.Num("angle_off_deg", Geometry.AngleOff(s, gunTarget) * 57.2958, 2);
        w.Num("range_m", Geometry.Range(s, gunTarget), 1);
        w.Num("closure_kts", session.ClosureKts, 1);
        w.Num("selected_player_gun_target_slot",
            session.SelectedPlayerGunTargetSlot, RawInteger);
        w.Bool("gun_window",
            !session.WeaponsInhibited && CameraSolver.GunWindow(s, gunTarget));
        w.Bool("gun_solution_raw", gunKill.InstantaneousGunSolution);
        w.Bool("gun_solution", !session.WeaponsInhibited && gunKill.GunSolution);
        w.Bool("lead_valid", !session.WeaponsInhibited && gunKill.HasLeadSolution);
        w.Num("lead_x", gunKill.LeadPipper.X, 3);
        w.Num("lead_y", gunKill.LeadPipper.Y, 3);
        w.Num("lead_z", gunKill.LeadPipper.Z, 3);
        w.Num("lead_tof", gunKill.LeadTimeOfFlight, 4);
        w.Num("ammo", gunKill.AmmoRemaining, RawInteger);
        w.GunTrajectory("gun_trajectory", playerPosition, groundVelocity, pf, pl,
            s.BodyRates, gunKill.Profile);
        w.Num("rounds_fired", gunKill.RoundsFired, RawInteger);
        w.Num("hits", gunKill.TotalHitCount, RawInteger);
        w.Num("selected_target_hits", gunKill.HitCount, RawInteger);
        w.Bool("hit", gunKill.HitThisStep);
        w.Bool("gun_firing", session.TriggerDown && session.PlayerWeaponsAuthorized
            && gunKill.AmmoRemaining > 0 && gunKill.BanditAlive);
        w.Tracers("tracers", gunKill.RoundsInFlight);
        w.Num("kill_progress", gunKill.KillProgress, 3);
        w.Num("opponent_health", gunKill.TargetHealth, 3);
        w.Bool("opponent_alive", gunKill.TargetAlive);
        w.Num("bandit_health", session.PrimaryOpponentHealth, 3);
        w.Bool("bandit_alive", session.PrimaryOpponentAlive);
        w.Num("player_health", session.PlayerHealth, 3);
        w.Bool("player_alive", session.PlayerAlive);
        w.Num("opponent_ammo", opponentGun.AmmoRemaining, RawInteger);
        w.Num("opponent_rounds_fired", opponentGun.RoundsFired, RawInteger);
        w.Num("opponent_hits", session.PlayerHitsTaken, RawInteger);
        w.Bool("opponent_trigger_down", session.OpponentTriggerDown);
        w.Bool("opponent_gun_firing", session.OpponentTriggerDown
            && opponentGun.AmmoRemaining > 0 && session.PlayerAlive);
        w.Tracers("opponent_tracers", session.FormationOpponentRoundsInFlight);
        w.Num("kill_count", session.KillCount, RawInteger);
        w.Num("engagement_number", session.EngagementNumber, RawInteger);
        w.Bool("opponent_replacement_pending", session.OpponentReplacementPending);
        w.Num("opponent_replacement_s", session.OpponentReplacementSeconds, 3);
        w.Bool("splash_cue", splashCue);
        w.Bool("below_ground", playerPosition.Y <= surfaceAltitudeM);
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
        w.Bool("rtb_steer", rtb.Active);
        w.Num("rtb_bearing_deg", rtb.BearingRad * 57.29577951308232, 2);
        w.Num("rtb_turn_deg", rtb.TurnRad * 57.29577951308232, 2);
        w.Num("rtb_range_nm", rtb.RangeM / 1852.0, 2);
        w.Bool("recovery_point_known", recoveryNavigation.RecoveryPointKnown);
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
        w.End();
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
        if (away.Equals(even)) return away;

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

        public Writer(double[] buffer) { _buffer = buffer; _index = 0; }

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
        json.Append("]}");
        _layoutJson = json.ToString();
        return _layoutJson;
    }

    /// <summary>
    /// Cheap per-frame signature of everything that only reaches the browser through the cold JSON.
    /// Any change bumps cold_version so the browser re-fetches the full snapshot that same frame.
    /// This is a heuristic to make edges land immediately — the browser's fallback re-fetch
    /// interval remains the correctness backstop for anything not captured here.
    /// </summary>
    readonly record struct ColdFingerprint(
        SimulationSession.LifecycleState Lifecycle,
        int BeatIndex,
        ValleyVariant Variant,
        SortieOutcome Outcome,
        SortieOutcome PendingOutcome,
        CombatHandoffPhase CombatHandoffPhase,
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
        TimeCompressionInhibitReason TimeCompressionInhibit,
        RapierMissionPhase RapierPhase,
        string RapierPhaseReason,
        RapierComputerFailure RapierComputerFailure,
        LandingGearHandle GearHandle,
        LandingGearIndication GearNose,
        LandingGearIndication GearLeft,
        LandingGearIndication GearRight,
        WingFlapLever FlapLever,
        FlightConfigurationTarget ConfigurationTarget,
        bool ConfigurationTransitionActive,
        string? TransitionCue,
        string? ConfigurationCue,
        string? AdviceContext,
        FightOutcome FightOutcome,
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
        string Mode,
        string? LsoCall,
        LsoSeverity? LsoSeverity,
        double WorldOriginEastM,
        double WorldOriginNorthM,
        bool WorldOriginConfigured) {

        public static ColdFingerprint Capture(SimulationSession session,
            double worldOriginEastM, double worldOriginNorthM, bool worldOriginConfigured) {
            IReadOnlyList<SessionEvent> events = session.RecentEvents;
            AutoGcasState gcas = session.AutoGcas;
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
                session.TimeCompressionInhibitReason,
                session.RapierPhase,
                session.RapierPhaseReason,
                session.RapierComputerFailureActive,
                systems.GearHandle,
                systems.NoseGearIndication,
                systems.LeftMainGearIndication,
                systems.RightMainGearIndication,
                systems.FlapLever,
                session.ConfigurationTarget,
                session.ConfigurationTransitionActive,
                session.TransitionCue,
                session.ConfigurationCue,
                session.Advice.Context,
                session.PlayerGun.Outcome,
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
                mode,
                lsoCall,
                lsoSeverity,
                worldOriginEastM,
                worldOriginNorthM,
                worldOriginConfigured);
        }
    }
}
