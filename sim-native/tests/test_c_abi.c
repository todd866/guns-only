#include "guns_only_sim.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>

_Static_assert(sizeof(GunsSimFrame) == 304, "GunsSimFrame ABI size mismatch");
_Static_assert(sizeof(GunsSimContact) == 120, "GunsSimContact ABI size mismatch");
_Static_assert(sizeof(GunsSimTracer) == 64, "GunsSimTracer ABI size mismatch");
_Static_assert(sizeof(GunsSimApproachGate) == 72, "GunsSimApproachGate ABI size mismatch");
_Static_assert(sizeof(GunsSimRunway) == 64, "GunsSimRunway ABI size mismatch");

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

    guns_sim_destroy(h);
    printf("test_c_abi: OK (tick=%lld, rounds=%d, tracers=%d, gates=%d, runway=%.0fx%.0fm)\n",
           (long long)frame.tick, frame.rounds_fired, nt, ng, runway.length_m, runway.width_m);
    return 0;
}
