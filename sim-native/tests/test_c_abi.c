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
_Static_assert(sizeof(GunsSimGunFunnel) == 352, "GunsSimGunFunnel ABI size mismatch");
_Static_assert(sizeof(GunsSimPilotState) == 144, "GunsSimPilotState ABI size mismatch");
_Static_assert(sizeof(GunsSimCombatDirector) == 168, "GunsSimCombatDirector ABI size mismatch");
_Static_assert(sizeof(GunsSimWeatherState) == 240, "GunsSimWeatherState ABI size mismatch");
_Static_assert(sizeof(GunsSimCarrierState) == 120, "GunsSimCarrierState ABI size mismatch");
_Static_assert(sizeof(GunsSimOkanaganState) == 152, "GunsSimOkanaganState ABI size mismatch");
_Static_assert(sizeof(GunsSimFireCell) == 32, "GunsSimFireCell ABI size mismatch");

int main(void) {
    assert(guns_sim_abi_version() == GUNS_SIM_ABI_VERSION);

    /* 1. Beat 7: F-22A visual merge + EEGS funnel + Weather + Pilot + Son runway */
    int64_t h = guns_sim_create(GUNS_SIM_BEAT_F22_MERGE, 1);
    assert(h > 0);

    GunsSimRunway runway = {0};
    assert(guns_sim_read_runway(h, &runway) == 1);
    assert(runway.present == 1);

    double son_h = 0.0;
    assert(guns_sim_sample_terrain_m(h, runway.threshold_east_m, runway.threshold_north_m, &son_h) == 1);
    assert(son_h > 60.0 && son_h < 95.0);

    guns_sim_begin(h);
    guns_sim_set_padlock_roll_assist(h, 1);
    for (int i = 0; i < 120; i++) {
        guns_sim_advance(h, 1.0 / 120.0, 1);
    }

    GunsSimFrame frame = {0};
    assert(guns_sim_read_frame(h, &frame) == 1);
    assert(frame.player_alive == 1 && frame.speed_mps > 100.0 && frame.contact_count >= 1);

    GunsSimGunFunnel funnel = {0};
    assert(guns_sim_read_gun_funnel(h, &funnel) == 1);
    assert(funnel.valid == 1 && funnel.sample_count == 9);
    assert(funnel.target_wingspan_m > 10.0 && funnel.muzzle_velocity_mps > 900.0);
    for (int i = 0; i < 9; i++) {
        assert(isfinite(funnel.east_m[i]) && isfinite(funnel.up_m[i]) && isfinite(funnel.north_m[i]));
        assert(funnel.range_m[i] >= 0.0);
    }

    GunsSimPilotState pilot = {0};
    assert(guns_sim_read_pilot_state(h, &pilot) == 1);
    assert(pilot.peripheral_vision01 > 0.5 && pilot.central_vision01 > 0.5);
    assert(pilot.auto_gcas_available == 1);

    GunsSimWeatherState weather = {0};
    assert(guns_sim_read_weather(h, &weather) == 1);
    assert(weather.layer_count >= 1);
    assert(weather.layer_top_alt_m[0] > weather.layer_base_alt_m[0]);

    GunsSimCombatDirector dir = {0};
    assert(guns_sim_read_combat_director(h, &dir) == 1);
    assert(dir.wave_score_multiplier >= 1.0 && dir.engagement_cap >= 1);
    assert(guns_sim_set_director_rung(h, 2) == 1);
    assert(guns_sim_get_director_rung(h) == 2);

    guns_sim_feed_key(h, GUNS_GKEY_TRIGGER, 1);
    for (int i = 0; i < 30; i++) guns_sim_advance(h, 1.0 / 120.0, 1);
    guns_sim_feed_key(h, GUNS_GKEY_TRIGGER, 0);
    assert(guns_sim_read_frame(h, &frame) == 1);
    assert(frame.rounds_fired > 0);
    guns_sim_destroy(h);

    /* 2. Beat 12: Rapier High-Altitude Intercept */
    int64_t hr = guns_sim_create(GUNS_SIM_BEAT_RAPIER_INTERCEPT, 1);
    assert(hr > 0);
    guns_sim_begin(hr);
    for (int i = 0; i < 60; i++) guns_sim_advance(hr, 1.0 / 120.0, 1);
    GunsSimFrame rframe = {0};
    assert(guns_sim_read_frame(hr, &rframe) == 1);
    assert(rframe.player_alive == 1);
    GunsSimWeatherState rweather = {0};
    assert(guns_sim_read_weather(hr, &rweather) == 1);
    assert(rweather.layer_count >= 1);
    guns_sim_destroy(hr);

    /* 3. Beat 100: AH-1G Cobra Canyon */
    int64_t hc = guns_sim_create(GUNS_SIM_BEAT_COBRA_CANYON, 1);
    assert(hc > 0);
    guns_sim_begin(hc);
    for (int i = 0; i < 120; i++) guns_sim_advance(hc, 1.0 / 120.0, 1);
    GunsSimCobraState cobra = {0};
    assert(guns_sim_read_cobra_state(hc, &cobra) == 1);
    assert(cobra.active == 1 && cobra.rockets_remaining == 38);
    assert(guns_sim_cycle_target(hc) == 1);
    assert(guns_sim_fire_rocket(hc) == 1);
    guns_sim_destroy(hc);

    /* 4. Beat 200: Top Gun F-14A + USS Carrier + AIM-9 + Wing Sweep */
    int64_t htg = guns_sim_create(GUNS_SIM_BEAT_TOPGUN_F14, 1);
    assert(htg > 0);
    guns_sim_begin(htg);
    for (int i = 0; i < 60; i++) guns_sim_advance(htg, 1.0 / 120.0, 1);
    GunsSimFrame tgframe = {0};
    assert(guns_sim_read_frame(htg, &tgframe) == 1);
    assert(tgframe.player_alive == 1 && tgframe.contact_count >= 1);
    GunsSimCarrierState carrier = {0};
    assert(guns_sim_read_carrier(htg, &carrier) == 1);
    assert(carrier.present == 1 && carrier.deck_length_m > 250.0);
    GunsSimCombatDirector tgdir = {0};
    assert(guns_sim_read_combat_director(htg, &tgdir) == 1);
    assert(tgdir.wing_sweep_deg >= 19.0 && tgdir.missiles_remaining >= 1);
    guns_sim_destroy(htg);

    /* 5. Beat 300: Okanagan Fire Boss AT-802F + CDEM + Lake + Fire Cells */
    int64_t hok = guns_sim_create(GUNS_SIM_BEAT_OKANAGAN_FIREBOSS, 1);
    assert(hok > 0);
    guns_sim_begin(hok);
    for (int i = 0; i < 60; i++) guns_sim_advance(hok, 1.0 / 120.0, 1);
    GunsSimFrame okframe = {0};
    assert(guns_sim_read_frame(hok, &okframe) == 1);
    assert(okframe.player_alive == 1 && okframe.speed_mps > 30.0);
    GunsSimOkanaganState okstate = {0};
    assert(guns_sim_read_okanagan(hok, &okstate) == 1);
    assert(okstate.active == 1 && okstate.fire_cell_count > 0 && okstate.water_level_m > 300.0);
    GunsSimFireCell cells[64];
    int32_t ncells = guns_sim_read_fire_cells(hok, cells, 64);
    assert(ncells > 0 && cells[0].intensity01 > 0.0);
    guns_sim_destroy(hok);

    /* 6. First Run Valley (105) & Practice Gunnery (102) */
    int64_t hfr = guns_sim_create(GUNS_SIM_BEAT_FIRST_RUN, 1);
    assert(hfr > 0);
    guns_sim_destroy(hfr);
    int64_t hp = guns_sim_create(GUNS_SIM_BEAT_PRACTICE_GUNNERY, 1);
    assert(hp > 0);
    guns_sim_destroy(hp);

    printf("test_c_abi v4: OK (f22_clouds=%d, carrier_deck=%.0fm, okanagan_cells=%d, wing_sweep=%.1fdeg)\n",
           weather.layer_count, carrier.deck_length_m, okstate.fire_cell_count, tgdir.wing_sweep_deg);
    return 0;
}
