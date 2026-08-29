import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  airdataReadout,
  fuelReadout,
  mobileTacticalReadout,
  speedBrakeReadout,
  speedTapeMarkers,
  stallAwareness,
  systemsReadout,
  targetClosureReadout,
  targetRangeReadout,
  verticalSpeedText,
  visualMergeWeaponsCue,
} from "../hud_readouts.js";

test("airdata makes calibrated airspeed primary and exposes Mach", () => {
  const readout = airdataReadout({
    calibrated_airspeed_kts: 196.52,
    indicated_airspeed_kts: 197.08,
    speed_kts: 999,
    true_airspeed_kts: 219.0,
    ground_speed_kts: 214.4,
    mach: 0.884,
    vertical_speed_fpm: -641,
  });

  assert.equal(readout.indicatedKts, 196.52);
  assert.equal(readout.primaryText, "197");
  assert.equal(readout.speedUnit, "KCAS");
  assert.equal(readout.unitText, "A/S KCAS");
  assert.equal(readout.machText, "M .88");
  assert.equal(readout.groundText, "G/S 214 KT");
  assert.equal(readout.verticalSpeedFpm, -641);
  assert.equal(readout.verticalText, "V/S -650 FPM");
  assert.equal(readout.trueKts, 219.0);
});

test("legacy speed alias remains an indicated-airdata fallback", () => {
  assert.equal(airdataReadout({ speed_kts: 181 }).indicatedKts, 181);
  assert.equal(airdataReadout({ speed_kts: 181 }).speedUnit, "KIAS");
  assert.equal(airdataReadout({ speed_kts: 181 }).unitText, "A/S KIAS");
  assert.equal(airdataReadout({ speed_kts: 181 }).machText, null);
  assert.equal(airdataReadout({ speed_kts: 181 }).groundText, "G/S --- KT");
  assert.equal(airdataReadout({ speed_kts: 181 }).verticalText, "V/S --- FPM");
});

test("TAS-only airframes label the tape KTAS instead of lying about a pitot chain", () => {
  // Rotorcraft (AH-1G) publish true airspeed only: no calibrated/indicated channel
  // exists in their authority state, and labeling raw TAS "KIAS" would invent one.
  const readout = airdataReadout({ true_airspeed_kts: 62.4, ground_speed_kts: 58.9 });
  assert.equal(readout.indicatedKts, 62.4);
  assert.equal(readout.primaryText, "62");
  assert.equal(readout.speedUnit, "KTAS");
  assert.equal(readout.unitText, "A/S KTAS");
  assert.equal(readout.groundText, "G/S 59 KT");
});

test("any indicated-chain channel outranks the TAS fallback", () => {
  // The fallback exists ONLY for airframes without an indicated chain. Every F-22
  // snapshot carries calibrated_airspeed_kts, so its presentation is untouched.
  const calibrated = airdataReadout({ calibrated_airspeed_kts: 196, true_airspeed_kts: 219 });
  assert.equal(calibrated.indicatedKts, 196);
  assert.equal(calibrated.speedUnit, "KCAS");
  const indicated = airdataReadout({ indicated_airspeed_kts: 197, true_airspeed_kts: 219 });
  assert.equal(indicated.indicatedKts, 197);
  assert.equal(indicated.speedUnit, "KIAS");
  const legacy = airdataReadout({ speed_kts: 181, true_airspeed_kts: 219 });
  assert.equal(legacy.indicatedKts, 181);
  assert.equal(legacy.speedUnit, "KIAS");
});

test("missing primary airdata fails visibly instead of becoming a plausible zero", () => {
  const readout = airdataReadout({});
  assert.equal(readout.indicatedKts, null);
  assert.equal(readout.primaryText, "---");
  assert.equal(readout.groundKts, null);
  assert.equal(readout.groundText, "G/S --- KT");
  assert.equal(readout.verticalSpeedFpm, null);
});

test("vertical speed is signed, deadbanded, compact, and never inferred from carrier sink", () => {
  assert.equal(verticalSpeedText(undefined), "V/S --- FPM");
  assert.equal(verticalSpeedText(24.9), "V/S 0 FPM");
  assert.equal(verticalSpeedText(25), "V/S +50 FPM");
  assert.equal(verticalSpeedText(-25), "V/S -50 FPM");
  assert.equal(verticalSpeedText(641), "V/S +650 FPM");
  assert.equal(verticalSpeedText(-641), "V/S -650 FPM");
  assert.equal(verticalSpeedText(12_420), "V/S +12.4K FPM");
  assert.equal(verticalSpeedText(19_700), "V/S +19.7K FPM");
  assert.equal(verticalSpeedText(-123_500), "V/S -124K FPM");
  assert.equal(airdataReadout({ sink_rate_fpm: 700 }).verticalText, "V/S --- FPM",
    "positive-down deck-relative sink is not an ownship vertical-speed substitute");
});

test("stall awareness and corner marker use the calibrated-airdata contract", () => {
  const awareness = stallAwareness({
    stall_speed_kcas: 119.0,
    accelerated_stall_speed_kcas: 197.33,
  });
  const markers = speedTapeMarkers({ corner_speed_kcas: 314.79 });

  assert.deepEqual(awareness, {
    baseKts: 119.0,
    boundaryKts: 197.33,
    amberTopKts: null,
    unit: "KCAS",
  });
  assert.deepEqual(markers, [{ value: 314.79, label: "COR", unit: "KCAS" }]);
  assert.deepEqual(speedTapeMarkers({
    corner_speed_kcas: 314.79,
    carrier: true,
    mode: "APPROACH",
  }), []);
  assert.equal(stallAwareness({
    stall_speed_kias: 120,
    accelerated_stall_speed_kias: 180,
  }).unit, "KIAS", "older recordings retain an honest legacy label");
});

test("fixed recovery strips suppress combat speed markers just like maritime decks", () => {
  assert.deepEqual(speedTapeMarkers({
    recovery_platform: true,
    carrier: false,
    mode: "APPROACH",
    corner_speed_kcas: 314.79,
  }), []);
});

test("corner marker carries the kernel's turn-rate band and degrades to a point without it", () => {
  assert.deepEqual(speedTapeMarkers({
    corner_speed_kcas: 314.79,
    corner_band_min_kias: 291.4,
    corner_band_max_kias: 341.2,
  }), [{
    value: 314.79,
    label: "COR",
    unit: "KCAS",
    bandMinValue: 291.4,
    bandMaxValue: 341.2,
  }]);
  // One missing edge, a degenerate band, or an inverted band must not fabricate a strip.
  assert.deepEqual(speedTapeMarkers({
    corner_speed_kias: 314.79,
    corner_band_min_kias: 291.4,
  }), [{ value: 314.79, label: "COR", unit: "KIAS" }]);
  assert.deepEqual(speedTapeMarkers({
    corner_speed_kias: 314.79,
    corner_band_min_kias: 300,
    corner_band_max_kias: 300,
  }), [{ value: 314.79, label: "COR", unit: "KIAS" }]);
  assert.deepEqual(speedTapeMarkers({
    corner_speed_kias: 314.79,
    corner_band_min_kias: 341.2,
    corner_band_max_kias: 291.4,
  }), [{ value: 314.79, label: "COR", unit: "KIAS" }]);
});

test("target closure is explicit about whether range is closing or opening", () => {
  assert.deepEqual(targetClosureReadout(42.4), {
    closureKts: 42.4,
    trend: "closing",
    compactText: "42KT CLOSING",
    text: "42 KT CLOSING",
  });
  assert.equal(targetClosureReadout(-18.6).text, "19 KT OPENING");
  assert.equal(targetClosureReadout(0.2).text, "RANGE STEADY");
  assert.equal(targetClosureReadout(undefined).text, "CLOSURE -- KT");
});

test("fighter target range uses nautical miles with gun-range precision", () => {
  assert.deepEqual(targetRangeReadout(258), {
    rangeNm: 258 / 1852,
    compactText: "0.14NM",
    text: "0.14 NM",
  });
  assert.equal(targetRangeReadout(450).text, "0.24 NM");
  assert.equal(targetRangeReadout(1852).text, "1.0 NM");
  assert.equal(targetRangeReadout(18_520).text, "10 NM");
  assert.equal(targetRangeReadout(undefined).text, "---");
  assert.equal(targetRangeReadout(-1).text, "---");
});

test("mobile tactical rail carries actual energy, vertical state, heading, and active fast time", () => {
  const readout = mobileTacticalReadout({
    calibrated_airspeed_kts: 478.6,
    alt_ft: 4236,
    vertical_speed_fpm: 5034,
    heading_deg: 269.4,
    mach: 0.774,
    time_compression_available: true,
    time_compression_factor: 4,
    fuel_lb: 3523,
  });

  assert.equal(readout.actualText,
    "×4 · M.77 · 479 KCAS · H269 · 4.2K ↑5K");
  assert.equal(readout.contextText, "F3.5K");
  assert.deepEqual(readout.actual, {
    mach: 0.774,
    indicatedKts: 478.6,
    speedUnit: "KCAS",
    headingDeg: 269.4,
    altitudeFt: 4236,
    verticalFpm: 5034,
    compressionFactor: 4,
    condensed: false,
  });
  assert.deepEqual(readout.energy, {
    cornerKts: null,
    cornerDeltaKts: null,
    actualG: null,
    assistedFlight: false,
    assistedSpeedBiasKts: 0,
    token: null,
  });
});

test("mobile tactical rail makes BVR target, ammunition, closure, and fuel explicit", () => {
  const readout = mobileTacticalReadout({
    indicated_airspeed_kts: 481,
    alt_ft: 4928,
    vertical_speed_fpm: -620,
    heading_deg: 270,
    mach: 0.77,
    ammo: 480,
    gun_heat: 0,
    fuel_lb: 3523,
    range_m: 158 * 1852,
    closure_kts: 914,
  }, {}, { fightActive: true, targetNumber: 1 });

  assert.equal(readout.contextText,
    "GUN480 · T1 158NM · CLOS914 · F3.5K");
  assert.equal(readout.target.bvrContact, true);
  assert.equal(readout.target.rangeNm, 158);
  assert.equal(readout.target.closureTrend, "closing");
  assert.equal(readout.weapon.level, "normal");
});

test("small-phone tactical rail preserves Rapier truth without ellipsis-prone spacing", () => {
  const readout = mobileTacticalReadout({
    calibrated_airspeed_kts: 478.6,
    alt_ft: 4236,
    vertical_speed_fpm: 5034,
    heading_deg: 269.4,
    mach: 0.774,
    time_compression_available: true,
    time_compression_factor: 4,
    rapier_mission_available: true,
    ammo: 480,
    fuel_lb: 3523,
    range_m: 160 * 1852,
    closure_kts: 916,
  }, {}, {
    fightActive: true,
    targetNumber: 1,
    condensed: true,
  });

  assert.equal(readout.actualText, "×4·M.77·479KCAS·4.2K·↑5K");
  assert.equal(readout.contextText, "GUN480·T1 160NM·CLOS916·F3.5K");
  assert.doesNotMatch(readout.actualText, /H269/,
    "heading yields to vertical state only at the narrowest supported width");
});

test("mobile tactical rail leaves WVR numbers on the physical target and qualifies weapon limits", () => {
  const readout = mobileTacticalReadout({
    speed_kts: 310,
    alt_ft: 12_500,
    vertical_speed_fpm: 0,
    heading_deg: 7,
    mach: 0.81,
    ammo: 72,
    gun_heat: 0.78,
    fuel_lb: 3900,
    fuel_bingo_lb: 4000,
    range_m: 900,
    closure_kts: -18,
  }, {}, { fightActive: true, targetNumber: 2 });

  assert.equal(readout.contextText, "GUN72 · T78% · BINGO3.9K");
  assert.equal(readout.target.bvrContact, false,
    "the WVR bracket owns its selected-target range and closure");
  assert.equal(readout.weapon.level, "caution");

  const overheat = mobileTacticalReadout({
    ammo: 0,
    gun_heat: 1,
    gun_overheat: true,
    range_m: 30_000,
  }, {}, { fightActive: true });
  assert.match(overheat.contextText, /^GUN0 · OVERHEAT · T1/);
  assert.equal(overheat.weapon.level, "warning");

  const empty = mobileTacticalReadout({
    ammo: 0,
    gun_heat: 0,
  }, {}, { fightActive: true });
  assert.equal(empty.contextText, "GUN0");
  assert.equal(empty.weapon.level, "warning");

  const nonCombat = mobileTacticalReadout({
    ammo: 0,
    gun_heat: 1,
    gun_overheat: true,
    fuel_lb: 3500,
  }, {}, { fightActive: false });
  assert.equal(nonCombat.contextText, "F3.5K");
  assert.equal(nonCombat.weapon.level, "normal",
    "hidden combat state must not tint an unrelated normal fuel value red");
});

test("mobile tactical rail replaces low-value heading with corner, G, and assist state", () => {
  const manoeuvring = mobileTacticalReadout({
    speed_kts: 350,
    corner_speed_kias: 315,
    alt_ft: 8300,
    vertical_speed_fpm: -450,
    heading_deg: 190,
    mach: 0.72,
    g_actual: 4.86,
    ammo: 480,
  }, {}, { fightActive: true });

  assert.equal(manoeuvring.actualText,
    "M.72 · 350 KIAS · COR+35 · 4.9G · 8.3K ↓450");
  assert.equal(manoeuvring.energy.token, "COR+35");
  assert.equal(manoeuvring.energy.actualG, 4.86);
  assert.doesNotMatch(manoeuvring.actualText, /H190/);

  const assisted = mobileTacticalReadout({
    speed_kts: 315,
    corner_speed_kias: 315,
    alt_ft: 8000,
    vertical_speed_fpm: 0,
    heading_deg: 5,
    mach: 0.66,
    assisted_flight: true,
    assisted_speed_bias_kts: 30,
    ammo: 480,
  }, {}, { fightActive: true });
  assert.equal(assisted.energy.token, "AUTO COR+30");
  assert.match(assisted.actualText, /AUTO COR\+30/);
  assert.doesNotMatch(assisted.actualText, /H005/);
});

test("visual merge weapon safety stays visible only while it changes a pilot decision", () => {
  const base = { visual_merge_evaluation: true };
  assert.deepEqual(visualMergeWeaponsCue({ ...base, weapons_inhibited: true }), {
    text: "GUNS SAFE · FIRST PASS",
    level: "caution",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...base,
    player_trigger_interlocked: true,
  }), {
    text: "RELEASE TRIGGER TO ARM",
    level: "warning",
  });
  assert.deepEqual(visualMergeWeaponsCue({ ...base, weapons_hot_cue: true }), {
    text: "GUNS HOT",
    level: "normal",
  });
  assert.equal(visualMergeWeaponsCue(base), null,
    "an armed steady-state fight must return the HUD space");
  assert.equal(visualMergeWeaponsCue({
    ...base,
    weapons_inhibited: true,
    terminal_phase_active: true,
  }), null);
});

test("first-run valley owns a persistent truthful objective ladder", () => {
  const firstRun = {
    visual_merge_evaluation: true,
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
  };
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    weapons_inhibited: false,
    aim9_remaining: 2,
  }), {
    text: "FOLLOW VALLEY · WEAPONS SAFE",
    level: "caution",
  }, "a loaded magazine alone cannot promote the Enter-valley cue before the pop-out");
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    weapons_inhibited: true,
    aim9_remaining: 2,
  }), {
    text: "FOLLOW VALLEY · WEAPONS SAFE",
    level: "caution",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    weapons_inhibited: false,
    aim9_remaining: 2,
  }, { firstRunWeaponsActionable: true }), {
    text: "FOX TWO ×2 · FIRE",
    level: "normal",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    weapons_inhibited: false,
    aim9_remaining: 1,
    aim9_in_flight: true,
  }, { firstRunWeaponsActionable: true }), {
    text: "FOX TWO IN FLIGHT · TRACK",
    level: "normal",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    weapons_inhibited: false,
    aim9_remaining: 0,
  }, { firstRunWeaponsActionable: true }), {
    text: "GUNS · FIRE · SPLASH TARGET",
    level: "normal",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    weapons_inhibited: false,
    aim9_remaining: 0,
    rtb_available: true,
  }, { firstRunWeaponsActionable: true }), {
    text: "GUNS · FIRE / RTB · O",
    level: "normal",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...firstRun,
    player_rtb_active: true,
  }), {
    text: "RTB · FOLLOW THE ROUTE",
    level: "normal",
  });
});

test("powered fuel readout uses USAF pounds per hour and time to bingo", () => {
  const readout = fuelReadout({
    fuel_lb: 2825,
    fuel_capacity_lb: 2826,
    fuel_bingo_lb: 800,
    fuel_flow_lb_min: 105.47,
    fuel_burn_lb_min: 42,
    fuel_minutes_to_bingo: 24.2,
    fuel_consumes: true,
    fuel_bingo: false,
  });

  assert.equal(readout.flowPoundsPerHour, 6328.2);
  assert.equal(readout.quantityText, "F 2825 LB");
  assert.equal(readout.flowText, "FF 6328 PPH");
  assert.equal(readout.flowUnitText, "PPH");
  assert.equal(readout.decisionText, "BINGO 24 MIN");
  assert.equal(readout.padlockText, "2825 LB · FF 6328 PPH · BINGO 24 MIN");
});

test("direct PPH wins and legacy per-minute burn converts at the display boundary", () => {
  assert.equal(fuelReadout({
    fuel_lb: 2000,
    fuel_flow_pph: 6012.4,
    fuel_flow_lb_min: 20,
  }).flowText, "FF 6012 PPH");
  assert.equal(fuelReadout({
    fuel_lb: 2000,
    fuel_burn_lb_min: 44.6,
  }).flowText, "FF 2676 PPH");
  assert.equal(fuelReadout({ fuel_lb: 2000 }).flowText, "FF --- PPH");
  assert.equal(fuelReadout({ fuel_lb: 2000, fuel_flow_pph: 0 }).flowText, "FF 0 PPH");
});

test("bingo switches the decision to endurance and preserves unavailable values", () => {
  assert.equal(fuelReadout({
    fuel_lb: 790,
    fuel_bingo_lb: 800,
    fuel_flow_lb_min: 87,
    fuel_endurance_minutes: 9.2,
    fuel_bingo: true,
  }).decisionText, "END 9 MIN");

  assert.equal(fuelReadout({
    fuel_lb: 1200,
    fuel_flow_lb_min: 0,
    fuel_minutes_to_bingo: null,
  }).decisionText, "BINGO -- MIN");
});

test("F-22 fuel calls preserve Joker, Bingo, minimum, and emergency precedence", () => {
  const base = {
    fuel_capacity_lb: 18_000,
    fuel_joker_lb: 6000,
    fuel_bingo_lb: 4000,
    fuel_minimum_lb: 2100,
    fuel_emergency_lb: 1200,
    fuel_flow_pph: 24_000,
  };
  const normal = fuelReadout({
    ...base, fuel_lb: 6500, fuel_minutes_to_joker: 1.25,
  });
  assert.equal(normal.statusText, null);
  assert.equal(normal.decisionText, "JOKER 1 MIN");

  const joker = fuelReadout({
    ...base, fuel_lb: 5800, fuel_minutes_to_bingo: 4.1,
  });
  assert.equal(joker.statusText, "JOKER");
  assert.equal(joker.decisionDisplayText, "JOKER · BINGO 4 MIN");

  assert.equal(fuelReadout({ ...base, fuel_lb: 3900 }).statusText, "BINGO");
  assert.equal(fuelReadout({ ...base, fuel_lb: 2000 }).statusText, "MIN FUEL");
  const emergency = fuelReadout({ ...base, fuel_lb: 1100 });
  assert.equal(emergency.statusText, "EMER FUEL");
  assert.equal(emergency.critical, true);
});

test("missing fuel and flow remain unavailable while explicit status stays authoritative", () => {
  const unavailable = fuelReadout({ fuel_consumes: true });
  assert.equal(unavailable.fuelLb, null);
  assert.equal(unavailable.quantityText, "F --- LB");
  assert.equal(unavailable.flowPoundsPerHour, null);
  assert.equal(unavailable.flowText, "FF --- PPH");
  assert.equal(unavailable.bingo, false);
  assert.equal(unavailable.critical, false);

  const declared = fuelReadout({ fuel_bingo: true });
  assert.equal(declared.fuelLb, null);
  assert.equal(declared.bingo, true);
  assert.equal(declared.statusText, "BINGO");
});

test("engine-less loadout reports unpowered instead of inventing endurance", () => {
  const readout = fuelReadout({ fuel_lb: 0, fuel_consumes: false });
  assert.equal(readout.flowText, "UNPOWERED");
  assert.equal(readout.flowUnitText, "");
  assert.equal(readout.decisionText, "END -- MIN");
  assert.equal(readout.padlockText, "0 LB · UNPOWERED");
});

test("speed brake reports travel, not just a latched boolean, and hides when stowed", () => {
  const stowed = speedBrakeReadout({ has_speed_brake: true, speed_brake: 0 });
  assert.equal(stowed.available, true);
  assert.equal(stowed.stowed, true);
  assert.equal(stowed.visible, false);
  assert.equal(stowed.text, "");

  const transit = speedBrakeReadout({ has_speed_brake: true, speed_brake: 0.45 });
  assert.equal(transit.transit, true);
  assert.equal(transit.deployed, false);
  assert.equal(transit.visible, true);
  assert.equal(transit.deployment, 0.45);
  assert.equal(transit.text, "SB↕");

  const out = speedBrakeReadout({ has_speed_brake: true, speed_brake: 1 });
  assert.equal(out.deployed, true);
  assert.equal(out.transit, false);
  assert.equal(out.visible, true);
  assert.equal(out.text, "SB");
});

test("speed brake stays absent without the airframe capability or a finite position", () => {
  // The F-86 and the balloon glider pin SpeedBrake at exactly 0.0 in the kernel; the capability
  // flag is what keeps a permanently-stowed indicator off their HUD instead of a dead instrument.
  const noCapability = speedBrakeReadout({ has_speed_brake: false, speed_brake: 1 });
  assert.equal(noCapability.available, false);
  assert.equal(noCapability.visible, false);
  assert.equal(noCapability.deployment, 0);
  assert.equal(noCapability.text, "");

  assert.equal(speedBrakeReadout({}).available, false);
  assert.equal(speedBrakeReadout({ has_speed_brake: true }).available, false);
  assert.equal(speedBrakeReadout({ has_speed_brake: true, speed_brake: "x" }).visible, false);
  // Out-of-range projections clamp rather than overdrawing the tick.
  assert.equal(speedBrakeReadout({ has_speed_brake: true, speed_brake: 1.4 }).deployment, 1);
  assert.equal(speedBrakeReadout({ has_speed_brake: true, speed_brake: -0.3 }).deployment, 0);
});

test("systems readout preserves command, three independent gear indications, and flap asymmetry", () => {
  const readout = systemsReadout({
    gear_handle: "DOWN",
    gear_nose: 1,
    gear_left: 0.45,
    gear_right: 1,
    gear_left_indication: "striped transit/unsafe",
    gear_unsafe: true,
    flap_lever: "HOLD",
    flap_left_deg: 24.6,
    flap_right_deg: 18.1,
    primary_bus_powered: true,
    utility_hydraulic_pressure_psi: 2912,
    engine_rpm_pct: 73.4,
    engine_running: true,
  });

  assert.equal(readout.available, true);
  assert.equal(readout.gearHandle, "DOWN");
  assert.equal(readout.gear.nose.text, "DN");
  assert.equal(readout.gear.left.text, "TR");
  assert.equal(readout.gear.right.text, "DN");
  assert.equal(readout.flapLever, "HOLD");
  assert.equal(readout.flapPositionText, "25°/18°");
  assert.equal(readout.flapSplit, true);
  assert.deepEqual(readout.warnings.map((warning) => warning.text), ["GEAR UNSAFE", "FLAP SPLIT"]);
});

test("Rapier systems identify elevons and installed-inlet recovery", () => {
  const readout = systemsReadout({
    rapier_mission_available: true,
    rapier_inlet_recovery: 0.61,
    flap_lever: "HOLD",
    flap_left_deg: 18,
    flap_right_deg: 12,
    primary_bus_powered: true,
    utility_hydraulic_pressure_psi: 4000,
    engine_running: true,
    rapier_turbine_thrust_lbf: 0,
    rapier_ramjet_thrust_lbf: 4200,
  });

  assert.equal(readout.flapLabel, "ELEV");
  assert.equal(readout.inletRecovery, 0.61);
  assert.match(readout.propulsionText, /RAM 4,200 LBF/);
  assert.deepEqual(readout.warnings.map((warning) => warning.text), [
    "INLET DISTORTION",
    "ELEV SPLIT",
  ]);
});

test("unpowered striped gear indications remain unknown without inventing physical transit", () => {
  const readout = systemsReadout({
    gear_handle: "DOWN",
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    gear_nose_indication: "STRIPED",
    gear_left_indication: "STRIPED",
    gear_right_indication: "STRIPED",
    gear_unsafe: false,
    primary_bus_powered: false,
  });

  assert.deepEqual(readout.gear, {
    nose: { text: "STRIPE", state: "unknown", position: 1 },
    left: { text: "STRIPE", state: "unknown", position: 1 },
    right: { text: "STRIPE", state: "unknown", position: 1 },
  });
  assert.equal(readout.gearUnsafe, false);
  assert.deepEqual(readout.warnings, [{ text: "PRIMARY BUS", level: "caution" }]);
});

test("powered striped indication with physical travel remains genuine transit", () => {
  const readout = systemsReadout({
    gear_handle: "DOWN",
    gear_nose: 0.45,
    gear_left: 0,
    gear_right: 0,
    gear_nose_indication: "STRIPED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    primary_bus_powered: true,
  });

  assert.deepEqual(readout.gear.nose, { text: "TR", state: "transit", position: 0.45 });
  assert.equal(readout.gearUnsafe, true);
  assert.deepEqual(readout.warnings, [{ text: "GEAR UNSAFE", level: "caution" }]);
});

test("explicit unsafe state remains authoritative without a transit indication", () => {
  const readout = systemsReadout({
    gear_handle: "UP",
    gear_nose: 0,
    gear_left: 0,
    gear_right: 0,
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: true,
    primary_bus_powered: true,
  });

  assert.equal(readout.gear.nose.state, "up");
  assert.equal(readout.gearUnsafe, true);
  assert.deepEqual(readout.warnings, [{ text: "GEAR UNSAFE", level: "caution" }]);
});

test("systems readout surfaces procedural failure cues without inventing absent systems", () => {
  assert.equal(systemsReadout({}).available, false);
  const readout = systemsReadout({
    gear_warning_horn: true,
    gear_limit_exceeded: true,
    flap_limit_exceeded: true,
    primary_bus_powered: false,
    utility_hydraulic_pressure_psi: 0,
    engine_rpm_pct: 11.2,
    engine_running: false,
  });
  assert.deepEqual(readout.warnings, [
    { text: "ENGINE FLAMEOUT", level: "warning" },
    { text: "GEAR WARNING", level: "warning" },
    { text: "GEAR OVERSPEED", level: "warning" },
    { text: "FLAP OVERSPEED", level: "warning" },
    { text: "PRIMARY BUS", level: "caution" },
  ]);
  assert.equal(readout.panelSuppressed, false,
    "ordinary fixed-wing systems warnings must retain their existing panel");
});

test("Cobra damage uses the production warning lane without exposing observer acquisition", () => {
  const trackingOnly = systemsReadout({
    has_engine: true,
    engine_running: true,
    cobra_threat_tracking: true,
    cobra_acquisition_progress: 0.99,
  });
  assert.deepEqual(trackingOnly.warnings, [],
    "an observer tracking the aircraft is not yet a player-facing fire warning");

  const underFire = systemsReadout({
    has_engine: true,
    engine_running: true,
    cobra_receiving_ground_fire: true,
    suppress_systems_panel: true,
  });
  assert.deepEqual(underFire.warnings, [
    { text: "GROUND FIRE", level: "caution" },
  ]);
  assert.equal(underFire.panelSuppressed, true,
    "warning-only consumers must not wake the fixed-wing systems card");

  const damaged = systemsReadout({
    has_engine: true,
    engine_running: false,
    cobra_engine_damaged: true,
    cobra_scas_damaged: true,
    cobra_receiving_ground_fire: true,
    suppress_systems_panel: true,
  });
  assert.deepEqual(damaged.warnings.slice(0, 3), [
    { text: "ENGINE OUT", level: "warning" },
    { text: "SCAS OUT", level: "caution" },
    { text: "GROUND FIRE", level: "caution" },
  ]);
  assert.equal(damaged.panelSuppressed, true);

  const intentionalShutdown = systemsReadout({
    has_engine: true,
    engine_running: false,
    cobra_turnaround_active: true,
    suppress_systems_panel: true,
  });
  assert.deepEqual(intentionalShutdown.warnings, [],
    "an expected ramp shutdown must not masquerade as an engine failure");
});

test("normal systems stay latent while recovery, transitions, and failures surface them", () => {
  const normal = systemsReadout({
    has_engine: true,
    has_retractable_gear: true,
    has_flaps: true,
    has_electrical_system: true,
    has_utility_hydraulics: true,
    engine_running: true,
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    primary_bus_powered: true,
    utility_hydraulic_pressure_psi: 3000,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(normal.available, true);
  assert.equal(normal.relevant, false);

  assert.equal(systemsReadout({
    carrier: true,
    mode: "APPROACH",
    gear_handle: "DOWN",
  }).relevant, true);
  assert.equal(systemsReadout({
    recovery_platform: true,
    carrier: false,
    mode: "APPROACH",
    gear_handle: "DOWN",
  }).relevant, true);

  const hydraulicFailure = systemsReadout({
    utility_hydraulic_pressure_psi: 0,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(hydraulicFailure.relevant, true);
  assert.deepEqual(hydraulicFailure.warnings,
    [{ text: "UTILITY HYD LOW", level: "warning" }]);
});

test("Rapier systems line reports the live propulsion stream in pounds instead of turbine RPM", () => {
  const readout = systemsReadout({
    rapier_mission_available: true,
    has_engine: true,
    engine_running: true,
    engine_rpm_pct: 0,
    rapier_turbine_thrust_lbf: 0,
    rapier_ramjet_thrust_lbf: 18_000,
  });
  assert.equal(readout.propulsionText, "RAM 18,000 LBF");
});

test("dirty free-flight configuration surfaces until physically clean without flagging approach config", () => {
  const dirty = systemsReadout({
    mode: "FREE",
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
    primary_bus_powered: true,
  });
  assert.equal(dirty.configurationActionable, true);
  assert.equal(dirty.gearNeedsCleanup, true);
  assert.equal(dirty.flapNeedsCleanup, true);
  assert.equal(dirty.relevant, true);
  assert.deepEqual(dirty.warnings, [
    { text: "CLEAN UP GEAR", level: "caution" },
    { text: "CLEAN UP FLAPS", level: "caution" },
  ]);

  const approach = systemsReadout({
    carrier: true,
    mode: "APPROACH",
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
  });
  assert.equal(approach.configurationActionable, false);
  assert.equal(approach.relevant, true,
    "landing configuration remains useful in the recovery scan");
  assert.deepEqual(approach.warnings, []);

  const recoveryTargetBeforeApproachLaw = systemsReadout({
    carrier: true,
    mode: "FREE",
    configuration_target: "RECOVERY",
    configuration_automatic: true,
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
  });
  assert.equal(recoveryTargetBeforeApproachLaw.configurationActionable, false);
  assert.deepEqual(recoveryTargetBeforeApproachLaw.warnings, [],
    "recovery intent must prevent a false cleanup demand before the groove law engages");

  const clean = systemsReadout({
    mode: "FREE",
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 0,
    flap_right_deg: 0,
  });
  assert.equal(clean.configurationActionable, false);
  assert.equal(clean.relevant, false);

  const cleanWaveOff = systemsReadout({
    carrier: true,
    mode: "WAVE-OFF",
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 0,
    flap_right_deg: 0,
  });
  assert.equal(cleanWaveOff.relevant, false,
    "a completed cleanup must remove the post-launch systems panel");
});

test("engine-less vehicles do not inherit fighter warnings or systems relevance", () => {
  const readout = systemsReadout({
    has_engine: false,
    has_retractable_gear: false,
    has_flaps: false,
    has_electrical_system: false,
    has_utility_hydraulics: false,
    engine_running: false,
    gear_unsafe: true,
    flap_limit_exceeded: true,
    primary_bus_powered: false,
    utility_hydraulic_pressure_psi: 0,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(readout.available, false);
  assert.equal(readout.relevant, false);
  assert.deepEqual(readout.warnings, []);
});

test("systems mode allowlist retains an explicit barrier engagement", async () => {
  const source = await readFile(new URL("../hud_readouts.js", import.meta.url), "utf8");
  const declaration = source.match(
    /const mode = normalizedEnum\(state\.mode,\s*\[([^\]]+)]/,
  );
  assert.ok(declaration, "systems mode allowlist declaration must remain inspectable");
  assert.match(declaration[1], /["']BARRIER["']/);
});

test("production HUD consumes stabilized KIAS plus physical corner and limits panel", async () => {
  const source = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(source, /this\._signals\.update\(frame\.state, frame\.dt\)/);
  assert.match(source, /const spd = display\.indicatedKts/);
  assert.match(source, /lowSpeed:\s*stallAwareness\(frame\.state\)/);
  assert.match(source, /fixedMarkers:\s*speedTapeMarkers\(frame\.state\)/);
  assert.match(source,
    /this\.drawAirdataLabels\(frame\.state, tapeInset, this\.width - tapeInset, display\)/);
  assert.match(source, /ctx\.fillText\("ALT FT", altitudeX/);
  assert.match(source, /ctx\.fillText\(verticalText, altitudeX/,
    "vertical speed belongs to the altitude-side readout");
  assert.match(source, /verticalSpeedText\(verticalSpeedFpm\)/);
  assert.doesNotMatch(source, /if \(!frame\.padlock\)\s*\{\s*const tapeInset/,
    "padlock must retain the physical IAS/stall/corner tape instead of a duplicate card");
  assert.match(source, /fuelReadout\(state\)/);
  assert.match(source, /limitsPanelPresentation/);
  assert.match(source, /navigationRateReadout/);
  assert.match(source, /this\.drawLimitsPanel\(frame\.state\)/);
  assert.match(source, /key:\s*["']navigation["']/,
    "mobile fixed-wing HUD gets the same NM\/MIN · LB\/MIN · LB\/NM triad");
  assert.match(source, /const compact = state\.rapier_mission_available === true/);
  assert.match(source, /GUN_HEAT_DISPLAY_THRESHOLD/);
  // The G tape is now ALWAYS drawn, so this no longer pins a 3.0 G visibility threshold. An
  // accelerometer that appears only once you are already pulling 3 cannot tell you what your hands
  // are doing below 3 -- which is most of a circuit, all of an approach, and the part of a roll
  // where this airframe's inertia coupling is worth watching. What is pinned instead is that it
  // declutters by WEIGHT rather than by disappearing.
  assert.match(source, /const prominence = clamp\(\(Math\.abs\(actualG\) - 1\.0\) \/ 2\.0, 0, 1\)/);
  assert.doesNotMatch(source, /const visible = overrideSelected/,
    "the G tape must not be conditionally hidden");
  assert.match(source, /this\.showLegendHint !== true/);
  assert.match(source, /systemsReadout\(frame\.state\)/);
  assert.match(source, /speedBrakeReadout\(state\)/,
    "the idle-commanded speed brake annunciates on the unconditionally drawn PWR rail");
  assert.match(source, /flightMissionGuidance\(frame\.state/);
  assert.match(source, /missionGuidanceLayout\(\{/);
  assert.match(source, /missionGuidanceActionText\(cue\.primaryAction/);
  assert.match(source, /this\.drawVisualMergeWeaponsCue\(frame\)/);
  assert.match(source, /state\.has_engine === false \|\| state\.fuel_consumes === false/);
  assert.match(source, /state\.engine_spool_fraction \?\? state\.engine/);
  assert.match(source, /Number\.isFinite\(sustained\) && sustained >= 1\.0/);
  assert.match(source, /state\.effective_on_speed_aoa_deg/);
  assert.match(source, /state\.on_speed_aoa_tolerance_deg/);
  assert.match(source, /case "COME LEFT": return "COME LEFT"/);
  assert.match(source, /case "COME RIGHT": return "COME RIGHT"/);
  assert.match(source, /case "TERMINAL":/);
  assert.match(source, /display\.indicatedRateKtsPerSecond \* 6/);
  assert.match(source, /const trendAlpha = valueValid && Number\.isFinite\(trend\)/);
  assert.match(source, /panel\.rows\.length/);
  assert.match(source, /entry\.label/);
  assert.doesNotMatch(source, /GATE \$\{gate\}\/4 · FLY THROUGH/);
  assert.match(source, /rapierCycleTeachPresentation/);
  assert.match(source, /this\.drawRapierCycleTeach\(frame\.state\)/);
  assert.doesNotMatch(source, /rapierEnginePresentation\(frame\.state\)/);
  assert.doesNotMatch(source, /READABLE_VERTICAL_SPEED_FPM/,
    "vertical speed must never be silently under-reported");
  assert.doesNotMatch(source, /Number\(state\.kill_progress\)/,
    "hit count is not a physical damage percentage");
  assert.doesNotMatch(source, /`AIRFRAME \$\{Math\.round\(health \* 100\)\}%`/,
    "abstract health must not masquerade as an airframe condition indication");
  assert.doesNotMatch(source, /this\.drawFrameWash\(\)/,
    "scanlines and vignette have no decision-support role");
});

test("production HUD gates recovery guidance on the shared platform contract", async () => {
  const source = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /drawApproachEnergyCue/,
    "world-space guidance owns recovery teaching; the HUD must not reinstate a prose number bar");
  assert.match(source,
    /if \(!recoveryPlatformAvailable\(state\)\) return false;[\s\S]*?mode === "APPROACH"/,
    "approach geometry must work for fixed strips and legacy carriers");
  assert.match(source,
    /if \(!recoveryPlatformAvailable\(state\)\) return;/,
    "recovery difficulty cues must accept the shared platform contract");
  assert.match(source,
    /if \(!recoveryPlatformAvailable\(state\)[\s\S]*?mode !== "APPROACH"[\s\S]*?mode !== "WAVE-OFF"/,
    "LSO calls must accept the shared platform contract");
  assert.match(source, /recoveryPlatformIsMaritime\(frame\.state\) \? "BOAT" : "STRIP"/);
  assert.match(source, /maritime \? "DECK UP" : "STRIP UP"/);
  assert.match(source, /if \(maritime\) \{[\s\S]*?`WOD /,
    "wind-over-deck remains maritime-only");
  assert.match(source, /maritime[\s\S]*?`BRC [\s\S]*?: `FINAL COURSE /,
    "BRC remains maritime while a fixed strip receives a neutral final course");
});
