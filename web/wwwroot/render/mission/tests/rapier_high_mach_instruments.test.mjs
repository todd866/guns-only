import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceRapierHighMachInstruments,
  createRapierHighMachHistory,
  rapierHighMachPresentation,
  rapierHighMachSample,
} from "../rapier_high_mach_instruments.js";

const highMach = Object.freeze({
  rapier_mission_available: true,
  rapier_mission_phase: 4,
  simulation_time_s: 100,
  mach: 2.4,
  dynamic_pressure_kpa: 35,
  rapier_dynamic_pressure_limit_kpa: 55,
  alt_ft: 65_000,
  true_airspeed_kts: 1_400,
  vertical_speed_fpm: 12_000,
  gamma_deg: 12,
  engine_net_thrust_lbf: 27_000,
  rapier_drag_lbf: 19_000,
  rapier_turbine_thrust_lbf: 7_000,
  rapier_ramjet_thrust_lbf: 20_000,
  rapier_ram_light_mach: 1.6,
  rapier_full_ram_mach: 2.8,
  rapier_turbine_gone_mach: 3.0,
  rapier_inlet_recovery: 0.94,
  rapier_skin_temp_c: 250,
  rapier_recovery_temp_c: 640,
  rapier_stagnation_temp_c: 720,
  rapier_thermal_zone: "insulated-warm-panel",
  rapier_thermal_effective_temp_c: 470,
  rapier_thermal_capability_c: 350,
  rapier_thermal_margin_c: 100,
  rapier_cmc_capability_c: 1_200,
  rapier_cmc_margin_c: 480,
  static_temperature_c: -50,
  fuel_lb: 7_100,
  fuel_on_arrival_estimate_lb: 2_700,
  fuel_reserve_target_lb: 1_200,
  fuel_reserve_margin_lb: 1_500,
});

test("high-Mach instruments stay out of other missions, launch, Circuits, and recovery", () => {
  assert.equal(rapierHighMachPresentation({}), null);
  assert.equal(rapierHighMachPresentation({
    ...highMach,
    rapier_pattern_only: true,
  }), null);
  assert.equal(rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 1,
  }), null);
  assert.equal(rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 13,
  }), null);
});

test("one compact contract connects Mach, q, excess thrust, TBCC, heat, and home fuel", () => {
  const first = advanceRapierHighMachInstruments(null, highMach);
  const second = advanceRapierHighMachInstruments(first.history, {
    ...highMach,
    simulation_time_s: 102,
    mach: 2.5,
    dynamic_pressure_kpa: 37,
    alt_ft: 66_000,
    true_airspeed_kts: 1_470,
    rapier_skin_temp_c: 254,
  });
  const view = second.presentation;

  assert.equal(view.rows.length, 4);
  assert.match(view.flight.row.text, /^M2\.50↑ · Q37\/55↑ · T−D \+8\.0K LBF$/);
  assert.equal(view.flight.excessThrustLbf, 8_000);
  assert.equal(view.flight.energyTrend, "rising");
  assert.ok(view.flight.specificEnergyRateMPerS > 0);

  assert.equal(view.propulsion.mode, "handover");
  assert.match(view.propulsion.row.text, /^TBCC XFER · FULL \+M0\.30$/);
  assert.ok(Math.abs(view.propulsion.transitionMarginMach - 0.3) < 1e-9);

  assert.equal(view.thermal.skinRateCPerS, 2);
  assert.equal(view.thermal.skinTrend, "rising");
  assert.ok(view.thermal.soakFraction > 0.58 && view.thermal.soakFraction < 0.59);
  assert.match(view.thermal.row.text, /^SKIN 254°C↑2\.0\/S · SOAK 58%$/);

  assert.equal(view.fuel.marginLb, 1_500);
  assert.equal(view.fuel.row.text, "HOME RES +1.5K LB");
  assert.equal(view.level, "normal");
});

test("specific-energy rate is the causal fallback when drag is not published", () => {
  const firstState = {
    rapier_mission_available: true,
    rapier_mission_phase: 3,
    simulation_time_s: 10,
    mach: 2.2,
    dynamic_pressure_kpa: 36,
    alt_ft: 62_000,
    true_airspeed_kts: 1_500,
  };
  const first = advanceRapierHighMachInstruments(null, firstState);
  const second = advanceRapierHighMachInstruments(first.history, {
    ...firstState,
    simulation_time_s: 12,
    mach: 2.1,
    dynamic_pressure_kpa: 32,
    alt_ft: 60_000,
    true_airspeed_kts: 1_430,
  });

  assert.equal(second.presentation.flight.excessThrustLbf, null);
  assert.equal(second.presentation.flight.energyTrend, "falling");
  assert.ok(second.presentation.flight.specificEnergyRateMPerS < 0);
  assert.match(second.presentation.flight.row.text, / · E −\d+ M\/S$/);
});

test("q has no invented placard and becomes causal when the runtime publishes its limit", () => {
  const unknown = rapierHighMachPresentation({
    ...highMach,
    dynamic_pressure_kpa: 49,
    rapier_dynamic_pressure_limit_kpa: null,
  });
  assert.equal(unknown.flight.dynamicPressureLimitKpa, null);
  assert.match(unknown.flight.row.text, /Q49/);
  assert.doesNotMatch(unknown.flight.row.text, /Q49\/49/);

  const over = rapierHighMachPresentation({
    ...highMach,
    dynamic_pressure_kpa: 82,
    rapier_dynamic_pressure_limit_kpa: 80,
  });
  assert.equal(over.flight.dynamicPressureMarginKpa, -2);
  assert.equal(over.flight.level, "danger");
  assert.equal(over.level, "danger");
  assert.match(over.flight.row.text, /Q82\/80/);
});

test("actual stream thrust decides TBCC mode; Mach alone cannot claim a handover", () => {
  const locked = rapierHighMachPresentation({
    ...highMach,
    mach: 2.2,
    rapier_turbine_thrust_lbf: 18_000,
    rapier_ramjet_thrust_lbf: 0,
  });
  assert.equal(locked.propulsion.mode, "locked");
  assert.equal(locked.propulsion.row.text, "TBCC RAM LOCKED · CLIMB FOR RAM");
  assert.equal(locked.propulsion.level, "caution");

  const lit = rapierHighMachPresentation({
    ...highMach,
    mach: 2.2,
    rapier_turbine_thrust_lbf: 12_000,
    rapier_ramjet_thrust_lbf: 8_000,
  });
  assert.equal(lit.propulsion.mode, "handover");
  assert.match(lit.propulsion.row.text, /FULL \+M0\.60/);

  const unstarted = rapierHighMachPresentation({
    ...highMach,
    rapier_inlet_unstart: true,
  });
  assert.equal(unstarted.propulsion.mode, "unstart");
  assert.equal(unstarted.propulsion.level, "danger");
});

test("thermal row uses the binding warm-panel trend, soak, and material margin", () => {
  const cooling = rapierHighMachPresentation({
    ...highMach,
    rapier_skin_temp_c: 300,
    rapier_thermal_effective_temp_c: 650,
    static_temperature_c: -50,
    rapier_thermal_margin_c: 25,
  }, { skinCPerS: -1.25 });
  assert.equal(cooling.thermal.skinTrend, "falling");
  assert.equal(cooling.thermal.soakFraction, 0.5);
  assert.equal(cooling.thermal.level, "caution");
  assert.match(cooling.thermal.row.text, /SKIN 300°C↓1\.3\/S/);
  assert.match(cooling.thermal.row.text, /SOAK 50%/);
  assert.match(cooling.thermal.row.text, /MRG \+25°C/);

  const over = rapierHighMachPresentation({
    ...highMach,
    rapier_thermal_margin_c: -12,
  });
  assert.equal(over.thermal.level, "danger");
  assert.match(over.thermal.row.text, /MRG −12°C/);
});

test("home reserve prefers the published margin and has transparent fallbacks", () => {
  const derived = rapierHighMachPresentation({
    ...highMach,
    fuel_reserve_margin_lb: null,
    fuel_on_arrival_estimate_lb: null,
    fuel_lb: 5_000,
    fuel_to_home_estimate_lb: 3_100,
    fuel_reserve_target_lb: 1_200,
  });
  assert.equal(derived.fuel.marginLb, 700);
  assert.equal(derived.fuel.row.text, "HOME RES +700 LB");

  const short = rapierHighMachPresentation({
    ...highMach,
    fuel_reserve_margin_lb: -240,
  });
  assert.equal(short.fuel.marginLb, -240);
  assert.equal(short.fuel.level, "danger");
  assert.equal(short.fuel.row.text, "HOME RES −240 LB");
});

test("zoom, apex, reentry, and relight each own one short causal cue", () => {
  const zoom = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 5,
    requested_alpha_deg: 20,
  });
  assert.equal(zoom.cue.text, "ZOOM · α20° · IDLE/PREDICT");

  const apex = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 6,
    vertical_speed_fpm: 800,
  });
  assert.equal(apex.cue.text, "APEX NOW");

  const climbing = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 6,
    vertical_speed_fpm: 5_400,
  });
  assert.equal(climbing.cue.text, "APEX · CLIMB +5.4K FPM");

  const align = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 7,
    rapier_nose_on_v_err_deg: 18,
  });
  assert.equal(align.cue.text, "REENTRY · ALIGN V 18°");
  const onVelocity = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 7,
    rapier_nose_on_v_err_deg: 6,
  });
  assert.equal(onVelocity.cue.text, "REENTRY · ON V");

  const buildQ = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 8,
    dynamic_pressure_kpa: 3.2,
    rapier_relight_dynamic_pressure_kpa: 4,
    rapier_turbine_thrust_lbf: 9_000,
    rapier_ramjet_thrust_lbf: 0,
  });
  assert.equal(buildQ.cue.text, "RELIGHT · Q3.2→4.0");

  const lit = rapierHighMachPresentation({
    ...highMach,
    rapier_mission_phase: 8,
    rapier_turbine_thrust_lbf: 3_000,
    rapier_ramjet_thrust_lbf: 8_000,
  });
  assert.equal(lit.cue.text, "RELIGHT · RAM LIT");
});

test("history waits out snapshot quantisation and resets on a rewound sim clock", () => {
  const empty = createRapierHighMachHistory();
  assert.ok(Object.isFrozen(empty));
  const first = advanceRapierHighMachInstruments(empty, highMach);
  const tooSoon = advanceRapierHighMachInstruments(first.history, {
    ...highMach,
    simulation_time_s: 100.25,
    rapier_skin_temp_c: 251,
  });
  assert.equal(tooSoon.presentation.thermal.skinRateCPerS, null);
  assert.equal(tooSoon.history.anchor.atS, 100);

  const measured = advanceRapierHighMachInstruments(tooSoon.history, {
    ...highMach,
    simulation_time_s: 101,
    rapier_skin_temp_c: 252,
  });
  assert.equal(measured.presentation.thermal.skinRateCPerS, 2);
  assert.equal(first.history.rates.skinCPerS, null, "the reducer mutated an earlier result");

  const rewound = advanceRapierHighMachInstruments(measured.history, {
    ...highMach,
    simulation_time_s: 2,
  });
  assert.deepEqual(rewound.history.rates, {
    machPerS: null,
    dynamicPressureKpaPerS: null,
    specificEnergyMPerS: null,
    skinCPerS: null,
  });
});

test("the presentation ignores job, drone, economy, and failure lottery state", () => {
  const baseline = rapierHighMachPresentation(highMach);
  const noisy = rapierHighMachPresentation({
    ...highMach,
    rapier_job: "RANDOM_OTHER_JOB",
    rapier_gun_drones_remaining: 99,
    rapier_economy_sortie_net_credits: -999,
    rapier_computer_failure_plan: "RANDOM_TERMINAL_FAILURE",
  });
  assert.deepEqual(noisy, baseline);

  const visibleCopy = [
    noisy.cue?.text,
    ...noisy.rows.map((row) => row.text),
  ].filter(Boolean).join(" ");
  assert.doesNotMatch(visibleCopy, /job|drone|econom|failure|swarm/i);
  assert.ok(noisy.rows.length <= 4);
  assert.ok(noisy.rows.every((row) => row.text.length <= 42), visibleCopy);
  assert.ok(!noisy.cue || noisy.cue.text.length <= 28, visibleCopy);
});

test("sampling uses simulation time and produces immutable specific-energy evidence", () => {
  const sample = rapierHighMachSample(highMach);
  assert.equal(sample.atS, 100);
  assert.ok(sample.specificEnergyM > sample.altitudeM);
  assert.ok(Object.isFrozen(sample));

  const explicit = rapierHighMachSample({ ...highMach, simulation_time_s: 999 }, 12.5);
  assert.equal(explicit.atS, 12.5);
});
