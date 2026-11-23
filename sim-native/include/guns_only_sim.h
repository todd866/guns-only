#ifndef GUNS_ONLY_SIM_H
#define GUNS_ONLY_SIM_H

#include <stdint.h>

#define GUNS_SIM_ABI_VERSION 1

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
    int32_t role; /* 1=opponent, 2=wingman, 3=relief */
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
int32_t guns_sim_advance(int64_t handle, double delta_seconds, int32_t max_compression);
int32_t guns_sim_read_frame(int64_t handle, GunsSimFrame* out_frame);
int32_t guns_sim_read_contacts(int64_t handle, GunsSimContact* out_contacts, int32_t max_count);
int32_t guns_sim_read_tracers(int64_t handle, GunsSimTracer* out_tracers, int32_t max_count);
int32_t guns_sim_read_gates(int64_t handle, GunsSimApproachGate* out_gates, int32_t max_count);
int32_t guns_sim_read_runway(int64_t handle, GunsSimRunway* out_runway);

#ifdef __cplusplus
}
#endif

#endif /* GUNS_ONLY_SIM_H */
