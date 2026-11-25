#ifndef GUNS_ONLY_SIM_H
#define GUNS_ONLY_SIM_H

#include <stdint.h>

#define GUNS_SIM_ABI_VERSION 4

/* Canonical flight experiences & practice exercises */
#define GUNS_SIM_BEAT_F22_MERGE 7
#define GUNS_SIM_BEAT_RAPIER_INTERCEPT 12
#define GUNS_SIM_BEAT_COBRA_CANYON 100
#define GUNS_SIM_BEAT_PRACTICE_VALLEY 101
#define GUNS_SIM_BEAT_PRACTICE_GUNNERY 102
#define GUNS_SIM_BEAT_PRACTICE_RECOVERY 103
#define GUNS_SIM_BEAT_PRACTICE_SHORT_FINAL 104
#define GUNS_SIM_BEAT_FIRST_RUN 105
#define GUNS_SIM_BEAT_TOPGUN_F14 200
#define GUNS_SIM_BEAT_OKANAGAN_FIREBOSS 300

/* Canonical GKey ordinals (mirror sim/KeyGrammar.cs) */
#define GUNS_GKEY_PULL_UP 0
#define GUNS_GKEY_PUSH_DOWN 1
#define GUNS_GKEY_ROLL_LEFT 2
#define GUNS_GKEY_ROLL_RIGHT 3
#define GUNS_GKEY_RUDDER_LEFT 4
#define GUNS_GKEY_RUDDER_RIGHT 5
#define GUNS_GKEY_THROTTLE_UP 6
#define GUNS_GKEY_THROTTLE_DOWN 7
#define GUNS_GKEY_TRIGGER 8
#define GUNS_GKEY_PADLOCK 9
#define GUNS_GKEY_KNOCK_IT_OFF 10
#define GUNS_GKEY_RESTART 11
#define GUNS_GKEY_OVERRIDE 12
#define GUNS_GKEY_GEAR_TOGGLE 13
#define GUNS_GKEY_FLAP_UP 14
#define GUNS_GKEY_FLAP_DOWN 15
#define GUNS_GKEY_AUTO_GCAS_OVERRIDE 20
#define GUNS_GKEY_WING_SWEEP_FWD 21
#define GUNS_GKEY_WING_SWEEP_AFT 22
#define GUNS_GKEY_WING_SWEEP_AUTO 23
#define GUNS_GKEY_HOOK_TOGGLE 24
#define GUNS_GKEY_TIME_COMPRESSION_TOGGLE 25

/* Contact roles:
 *   1 = Opponent primary (Su-27S / Su-35S)
 *   2 = Opponent wingman
 *   3 = Friendly relief / wingman (F-22A)
 *   4 = MiG-28 aggressor (F-5E)
 *   5 = High-altitude weather balloon / payload
 *   6 = Rapier dogfighting drone / pursuer
 *   7 = Active missile in flight (AIM-9 / Rapier SRM)
 *   10..15 = Cobra ground-war units
 */

#ifdef __cplusplus
extern "C" {
#endif

typedef struct GunsSimFrame {
    double sim_time_s;
    int64_t tick;
    double pos_east_m;
    double pos_up_m;
    double pos_north_m;
    double vel_east_mps;
    double vel_up_mps;
    double vel_north_mps;
    double fwd_east;
    double fwd_up;
    double fwd_north;
    double up_east;
    double up_up;
    double up_north;
    double speed_mps;
    double kcas;
    double mach;
    double alpha_deg;
    double nz_g;
    double throttle01;
    double speedbrake01;
    double gear_down01;
    double flaps01;
    double fuel_lb;
    double player_health;
    double guidance_next_alt_m;
    double guidance_next_tas_mps;
    double guidance_power01;
    int32_t lifecycle;
    int32_t outcome;
    int32_t player_alive;
    int32_t player_rtb_active;
    int32_t rtb_available;
    int32_t can_end_sortie;
    int32_t weight_on_wheels;
    int32_t runway_phase;
    int32_t buffet;
    int32_t ammo_remaining;
    int32_t rounds_fired;
    int32_t live_opponent_count;
    int32_t relief_kills;
    int32_t guidance_active;
    int32_t guidance_in_groove;
    int32_t guidance_pattern_leg;
    int32_t guidance_energy_state;
    int32_t guidance_gate_count;
    int32_t contact_count;
    int32_t tracer_count;
} GunsSimFrame;

typedef struct GunsSimContact {
    double health;
    double pos_east_m;
    double pos_up_m;
    double pos_north_m;
    double vel_east_mps;
    double vel_up_mps;
    double vel_north_mps;
    double fwd_east;
    double fwd_up;
    double fwd_north;
    double up_east;
    double up_up;
    double up_north;
    double speed_mps;
    int32_t role;
    int32_t alive;
} GunsSimContact;

typedef struct GunsSimTracer {
    double pos_east_m;
    double pos_up_m;
    double pos_north_m;
    double vel_east_mps;
    double vel_up_mps;
    double vel_north_mps;
    double age_s;
    int32_t id;
    int32_t friendly;
} GunsSimTracer;

typedef struct GunsSimApproachGate {
    double east_m;
    double north_m;
    double up_m;
    double half_m;
    double target_alt_m;
    double target_ktas;
    double distance_to_go_m;
    int32_t pattern_leg;
    int32_t dirty_config;
    int32_t active;
    int32_t reserved0;
} GunsSimApproachGate;

typedef struct GunsSimRunway {
    double threshold_east_m;
    double threshold_up_m;
    double threshold_north_m;
    double heading_rad;
    double length_m;
    double width_m;
    double touchdown_aim_along_m;
    int32_t present;
    int32_t reserved0;
} GunsSimRunway;

typedef struct GunsSimCourseState {
    double carrot_east_m;
    double carrot_up_m;
    double carrot_north_m;
    double carrot_target_kcas;
    double predictor_east_m;
    double predictor_up_m;
    double predictor_north_m;
    double next_gate_dist_nm;
    double next_gate_alt_ft;
    double next_gate_kcas;
    double glideslope_deg;
    double runway_dist_nm;
    double cross_track_m;
    int32_t armed;
    int32_t complete;
    int32_t carrot_valid;
    int32_t next_gate_index;
    int32_t next_gate_needs_gear;
    int32_t autothrottle_active;
    int32_t total_gates;
    int32_t passed_gates;
    int32_t gate_grades[7];
    int32_t touchdown_contact;
    int32_t touchdown_survivable;
    int32_t kills;
    int32_t sortie_hits;
    int32_t combat_complete;
} GunsSimCourseState;

typedef struct GunsSimLeadCue {
    double lead_east_m;
    double lead_up_m;
    double lead_north_m;
    double lead_dir_east;
    double lead_dir_up;
    double lead_dir_north;
    double lead_tof_s;
    double range_m;
    int32_t has_lead_solution;
    int32_t gun_solution;
    int32_t in_gun_window;
    int32_t weapons_inhibited;
} GunsSimLeadCue;

typedef struct GunsSimCobraState {
    double main_rotor_rpm;
    double rotor_azimuth_rad;
    double torque_fraction;
    double agl_m;
    double vertical_speed_mps;
    double collective01;
    double target_east_m;
    double target_up_m;
    double target_north_m;
    double target_health01;
    double fob_east_m;
    double fob_up_m;
    double fob_north_m;
    double bridge_east_m;
    double bridge_up_m;
    double bridge_north_m;
    int32_t active;
    int32_t assisted_scas;
    int32_t gunner_state;
    int32_t gunner_fire_authorized;
    int32_t rockets_remaining;
    int32_t friendly_points;
    int32_t hostile_points;
    int32_t friendly_tickets;
    int32_t hostile_tickets;
    int32_t time_remaining_s;
    int32_t mission_status;
    int32_t has_target;
} GunsSimCobraState;

typedef struct GunsSimGunFunnel {
    double east_m[9];
    double up_m[9];
    double north_m[9];
    double range_m[9];
    double target_wingspan_m;
    double muzzle_velocity_mps;
    double closure_kts;
    double corner_speed_kias;
    double stall_speed_kias;
    double sustained_g;
    int32_t sample_count;
    int32_t selected_target_slot;
    int32_t valid;
    int32_t reserved0;
} GunsSimGunFunnel;

typedef struct GunsSimPilotState {
    double peripheral_vision01;
    double central_vision01;
    double redout01;
    double control_authority01;
    double cognitive_capacity01;
    double buffet_pitch_deg;
    double buffet_roll_deg;
    double buffet_yaw_deg;
    double body_rate_p_rps;
    double body_rate_q_rps;
    double body_rate_r_rps;
    double auto_gcas_time_avail_s;
    double auto_gcas_clearance_m;
    int32_t pilot_state; /* 0=Normal,1=Straining,2=Grayout,3=Blackout,4=GLoc,5=Recovering,6=Redout */
    int32_t high_alpha_recovery;
    int32_t padlock_roll_assist_active;
    int32_t auto_gcas_available;
    int32_t auto_gcas_warning;
    int32_t auto_gcas_active;
    int32_t auto_gcas_override_held;
    int32_t g_loc_count;
    int32_t control_interlocked;
    int32_t trigger_interlocked;
} GunsSimPilotState;

typedef struct GunsSimCombatDirector {
    double wave_score_multiplier;
    double combat_score;
    double sortie_peak_g;
    double sortie_min_g;
    double aim9_boresight_deg;
    double aim9_track_rate_dps;
    double wing_sweep_deg;
    double hook_down01;
    double rapier_target_mach;
    double rapier_skin_temp_c;
    double rapier_skin_limit_c;
    double incoming_wave_bearing_deg;
    int32_t wave_number;
    int32_t engagements_won;
    int32_t engagement_cap;
    int32_t rtb_bounce_active;
    int32_t sortie_rung;
    int32_t earned_rung;
    int32_t director_hits;
    int32_t director_kills;
    int32_t splash_cue_active;
    int32_t selected_target_slot;
    int32_t missiles_remaining;
    int32_t missile_in_flight;
    int32_t aim9_seeker_state;
    int32_t rapier_phase;
    int32_t rapier_automation_active;
    int32_t time_compression_factor;
    int32_t time_compression_eligible;
    int32_t incoming_wave_active;
} GunsSimCombatDirector;

typedef struct GunsSimWeatherState {
    double local_cloud_fraction01;
    double local_cloud_extinction_per_m;
    double local_visibility_m;
    double precipitation_mm_hr;
    double turbulence_rms_mps;
    double layer_base_alt_m[4];
    double layer_top_alt_m[4];
    double layer_coverage01[4];
    double layer_scale_m[4];
    double layer_adv_east_mps[4];
    double layer_adv_north_mps[4];
    int32_t layer_count;
    int32_t reserved0;
} GunsSimWeatherState;

typedef struct GunsSimCarrierState {
    double pos_east_m;
    double pos_up_m;
    double pos_north_m;
    double heading_rad;
    double landing_heading_rad;
    double deck_length_m;
    double deck_width_m;
    double speed_mps;
    double glideslope_err_deg;
    double lineup_err_m;
    double aoa_err_deg;
    double wire_decel_mps2;
    int32_t present;
    int32_t lso_severity; /* 0=None,1=OnBall,2=Correcting,3=WaveOff */
    int32_t arrestment_phase; /* 0=None,1=Arrested,2=Stopped,3=Failed */
    int32_t caught_wire;
    int32_t catapult_active;
    int32_t angled_deck;
} GunsSimCarrierState;

typedef struct GunsSimOkanaganState {
    double water_kg;
    double water_capacity_kg;
    double scoop_target_kg;
    double fire_intensity;
    double burned_area_ha;
    double score;
    double drop_aim_east_m;
    double drop_aim_up_m;
    double drop_aim_north_m;
    double water_level_m;
    double scoop_rate_kgps;
    double water_released_this_tick_kg;
    double agl_m;
    double fuel_kg;
    int32_t active;
    int32_t phase;
    int32_t surface_mode; /* 0=Runway,1=Water,2=Airborne,3=Destroyed */
    int32_t scoops_commanded;
    int32_t scoop_valid;
    int32_t dropping;
    int32_t effective_drops;
    int32_t completed_cycles;
    int32_t fire_cell_count;
    int32_t reserved0;
} GunsSimOkanaganState;

typedef struct GunsSimFireCell {
    double east_m;
    double up_m;
    double north_m;
    double intensity01;
} GunsSimFireCell;

int32_t guns_sim_abi_version(void);
int64_t guns_sim_create(int32_t beat_index, int32_t deck_config);
void guns_sim_destroy(int64_t handle);
void guns_sim_begin(int64_t handle);
void guns_sim_restart(int64_t handle);
void guns_sim_set_paused(int64_t handle, int32_t paused);
int32_t guns_sim_request_rtb(int64_t handle);
int32_t guns_sim_end_sortie(int64_t handle);
void guns_sim_set_controls(
    int64_t handle,
    double roll,
    double pitch,
    double yaw,
    double throttle01,
    int32_t throttle_override,
    int32_t trigger_down);
void guns_sim_feed_key(int64_t handle, int32_t gkey, int32_t pressed);
void guns_sim_set_assisted_flight(int64_t handle, int32_t enabled);
void guns_sim_set_auto_gcas(int64_t handle, int32_t enabled);
void guns_sim_set_padlock_roll_assist(int64_t handle, int32_t enabled);
int32_t guns_sim_advance(int64_t handle, double delta_seconds, int32_t max_compression);
int32_t guns_sim_read_frame(int64_t handle, GunsSimFrame* out_frame);
int32_t guns_sim_read_contacts(int64_t handle, GunsSimContact* out_contacts, int32_t max_count);
int32_t guns_sim_read_tracers(int64_t handle, GunsSimTracer* out_tracers, int32_t max_count);
int32_t guns_sim_read_gates(int64_t handle, GunsSimApproachGate* out_gates, int32_t max_count);
int32_t guns_sim_read_runway(int64_t handle, GunsSimRunway* out_runway);
int32_t guns_sim_read_course(int64_t handle, GunsSimCourseState* out_course);
int32_t guns_sim_read_lead_cue(int64_t handle, GunsSimLeadCue* out_lead);
int32_t guns_sim_sample_terrain_m(int64_t handle, double east_m, double north_m, double* out_height_m);
int32_t guns_sim_sample_terrain_grid(
    int64_t handle,
    double min_east_m,
    double min_north_m,
    double step_m,
    int32_t count_east,
    int32_t count_north,
    float* out_heights_m);
int32_t guns_sim_read_cobra_state(int64_t handle, GunsSimCobraState* out_cobra);
int32_t guns_sim_cycle_target(int64_t handle);
int32_t guns_sim_fire_rocket(int64_t handle);
int32_t guns_sim_fire_secondary(int64_t handle);
int32_t guns_sim_set_director_rung(int64_t handle, int32_t rung);
int32_t guns_sim_get_director_rung(int64_t handle);
int32_t guns_sim_read_gun_funnel(int64_t handle, GunsSimGunFunnel* out_funnel);
int32_t guns_sim_read_pilot_state(int64_t handle, GunsSimPilotState* out_pilot);
int32_t guns_sim_read_combat_director(int64_t handle, GunsSimCombatDirector* out_director);
int32_t guns_sim_read_weather(int64_t handle, GunsSimWeatherState* out_weather);
int32_t guns_sim_read_carrier(int64_t handle, GunsSimCarrierState* out_carrier);
int32_t guns_sim_read_okanagan(int64_t handle, GunsSimOkanaganState* out_okanagan);
int32_t guns_sim_read_fire_cells(int64_t handle, GunsSimFireCell* out_cells, int32_t max_count);

#ifdef __cplusplus
}
#endif

#endif /* GUNS_ONLY_SIM_H */
