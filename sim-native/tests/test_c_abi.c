#include "guns_only_sim.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>

_Static_assert(sizeof(GunsSimFrame) == 304, "GunsSimFrame ABI size mismatch");
_Static_assert(sizeof(GunsSimContact) == 120, "GunsSimContact ABI size mismatch");
_Static_assert(sizeof(GunsSimTracer) == 64, "GunsSimTracer ABI size mismatch");
_Static_assert(sizeof(GunsSimApproachGate) == 72, "GunsSimApproachGate ABI size mismatch");
_Static_assert(sizeof(GunsSimRunway) == 64, "GunsSimRunway ABI size mismatch");
_Static_assert(sizeof(GunsSimCourseState) == 184, "GunsSimCourseState ABI size mismatch");
_Static_assert(sizeof(GunsSimLeadCue) == 80, "GunsSimLeadCue ABI size mismatch");
_Static_assert(sizeof(GunsSimCobraState) == 176, "GunsSimCobraState ABI size mismatch");

int main(void) {
    assert(guns_sim_abi_version() == GUNS_SIM_ABI_VERSION);

    /* Beat 7: F-22A visual merge + Son conventional runway recovery */
    int64_t h = guns_sim_create(7, 1);
    assert(h > 0);

    GunsSimRunway runway = {0};
    assert(guns_sim_read_runway(h, &runway) == 1);
    assert(runway.present == 1);
    assert(runway.length_m >= 600.0);
    assert(runway.width_m >= 15.0);

    /* Terrain truth: Son threshold height & real elevation relief across 16x16 grid */
    double son_h = 0.0;
    assert(guns_sim_sample_terrain_m(h, runway.threshold_east_m, runway.threshold_north_m, &son_h) == 1);
    assert(son_h > 60.0 && son_h < 95.0);

    float terrain_grid[16 * 16];
    int32_t terrain_samples = guns_sim_sample_terrain_grid(h, -12000.0, 4000.0, 1500.0, 16, 16, terrain_grid);
    assert(terrain_samples == 256);
    float min_h = terrain_grid[0];
    float max_h = terrain_grid[0];
    for (int i = 1; i < 256; i++) {
        if (terrain_grid[i] < min_h) min_h = terrain_grid[i];
        if (terrain_grid[i] > max_h) max_h = terrain_grid[i];
    }
    assert((max_h - min_h) > 10.0f);

    guns_sim_begin(h);
    for (int i = 0; i < 120; i++) {
        guns_sim_advance(h, 1.0 / 120.0, 1);
    }

    GunsSimFrame frame = {0};
    assert(guns_sim_read_frame(h, &frame) == 1);
    assert(frame.player_alive == 1);
    assert(frame.tick == 120);
    assert(frame.speed_mps > 100.0);
    assert(isfinite(frame.pos_east_m) && isfinite(frame.pos_up_m) && isfinite(frame.pos_north_m));
    assert(isfinite(frame.fwd_east) && isfinite(frame.up_up));
    assert(frame.contact_count >= 1);

    GunsSimContact contacts[16];
    int32_t nc = guns_sim_read_contacts(h, contacts, 16);
    assert(nc == frame.contact_count && nc >= 1);
    assert(contacts[0].alive == 1);
    assert(contacts[0].speed_mps > 50.0);

    GunsSimLeadCue lead = {0};
    assert(guns_sim_read_lead_cue(h, &lead) == 1);
    assert(isfinite(lead.range_m) && lead.range_m > 100.0);
    assert(isfinite(lead.lead_east_m) && isfinite(lead.lead_dir_east));

    /* Pull trigger for 0.25 s and read live tracers */
    guns_sim_set_controls(h, 0.0, 0.0, 0.0, -1.0, 0, 1);
    for (int i = 0; i < 30; i++) {
        guns_sim_advance(h, 1.0 / 120.0, 1);
    }
    guns_sim_set_controls(h, 0.0, 0.0, 0.0, -1.0, 0, 0);

    assert(guns_sim_read_frame(h, &frame) == 1);
    assert(frame.rounds_fired > 0);
    assert(frame.tracer_count > 0);
    GunsSimTracer tracers[64];
    int32_t nt = guns_sim_read_tracers(h, tracers, 64);
    assert(nt > 0);
    assert(tracers[0].friendly == 1);
    assert(isfinite(tracers[0].pos_east_m));

    /* Request RTB and verify overhead approach gates appear */
    assert(guns_sim_request_rtb(h) == 1);
    for (int i = 0; i < 15; i++) {
        guns_sim_advance(h, 1.0 / 120.0, 1);
    }
    assert(guns_sim_read_frame(h, &frame) == 1);
    assert(frame.player_rtb_active == 1);
    assert(frame.guidance_active == 1);
    assert(frame.guidance_gate_count >= 1);

    GunsSimApproachGate gates[32];
    int32_t ng = guns_sim_read_gates(h, gates, 32);
    assert(ng >= 1);
    assert(isfinite(gates[0].east_m) && isfinite(gates[0].north_m) && isfinite(gates[0].up_m));

    GunsSimCourseState course = {0};
    assert(guns_sim_read_course(h, &course) == 1);
    assert(course.armed == 1);
    assert(course.total_gates == 7);
    assert(course.carrot_valid == 1);
    assert(isfinite(course.carrot_east_m) && isfinite(course.predictor_east_m));
    assert(isfinite(course.glideslope_deg) && isfinite(course.runway_dist_nm));

    guns_sim_destroy(h);

    /* Beat 100: AH-1G Cobra Canyon + SCAS stability + Hydra-70 rockets + Ground War */
    int64_t hc = guns_sim_create(GUNS_SIM_BEAT_COBRA_CANYON, 1);
    assert(hc > 0);

    float canyon_grid[16 * 16];
    int32_t csamp = guns_sim_sample_terrain_grid(hc, -4500.0, -5000.0, 400.0, 16, 16, canyon_grid);
    assert(csamp == 256);
    float cmin = canyon_grid[0], cmax = canyon_grid[0];
    for (int i = 1; i < 256; i++) {
        if (canyon_grid[i] < cmin) cmin = canyon_grid[i];
        if (canyon_grid[i] > cmax) cmax = canyon_grid[i];
    }
    assert((cmax - cmin) > 40.0f);

    guns_sim_begin(hc);
    for (int i = 0; i < 360; i++) {
        guns_sim_advance(hc, 1.0 / 120.0, 1);
    }

    GunsSimFrame cframe = {0};
    assert(guns_sim_read_frame(hc, &cframe) == 1);
    assert(cframe.player_alive == 1);

    GunsSimCobraState cobra = {0};
    assert(guns_sim_read_cobra_state(hc, &cobra) == 1);
    assert(cobra.active == 1);
    assert(cobra.assisted_scas == 1);
    assert(cobra.agl_m > 15.0);
    assert(cobra.main_rotor_rpm > 250.0);
    assert(cobra.rockets_remaining == 38);

    assert(guns_sim_cycle_target(hc) == 1);
    assert(guns_sim_read_cobra_state(hc, &cobra) == 1);
    assert(cobra.has_target == 1);

    assert(guns_sim_fire_rocket(hc) == 1);
    guns_sim_advance(hc, 1.0 / 120.0, 1);
    assert(guns_sim_read_cobra_state(hc, &cobra) == 1);
    assert(cobra.rockets_remaining == 37);

    GunsSimTracer ctracers[64];
    int32_t cnt = guns_sim_read_tracers(hc, ctracers, 64);
    int found_rocket = 0;
    for (int i = 0; i < cnt; i++) {
        if (ctracers[i].friendly == 2) found_rocket = 1;
    }
    assert(found_rocket == 1);

    GunsSimContact ccontacts[64];
    int32_t cnc = guns_sim_read_contacts(hc, ccontacts, 64);
    assert(cnc >= 4);

    guns_sim_destroy(hc);
    printf("test_c_abi: OK (tick=%lld, rounds=%d, tracers=%d, gates=%d, runway=%.0fx%.0fm, son=%.1fm, relief=%.1fm, cobra_agl=%.1fm, cobra_relief=%.1fm, ground_units=%d)\n",
           (long long)frame.tick, frame.rounds_fired, nt, ng, runway.length_m, runway.width_m, son_h, (double)(max_h - min_h),
           cobra.agl_m, (double)(cmax - cmin), cnc);
    return 0;
}
