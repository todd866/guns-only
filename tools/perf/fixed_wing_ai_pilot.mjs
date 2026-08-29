#!/usr/bin/env node

const IS_NODE_RUNTIME = typeof process !== "undefined" && process?.versions?.node;
let chromium;
let mkdir;
let readFile;
let runtimeProcess;
let serveStatic;
let writeFile;
if (IS_NODE_RUNTIME) {
  const [{ createRequire }, fs, processModule, serverModule] = await Promise.all([
    import("node:module"),
    import("node:fs/promises"),
    import("node:process"),
    import("../../web/wwwroot/render/hud/tests/harness/static_server.mjs"),
  ]);
  ({ mkdir, readFile, writeFile } = fs);
  runtimeProcess = processModule.default;
  ({ serveStatic } = serverModule);
  const requireFromSmoke = createRequire(
    runtimeProcess.env.GUNS_SMOKE_PACKAGE
      ?? new URL("../../web/smoke/package.json", import.meta.url),
  );
  // Lazily, for the same reason as the other drivers: this module and mission_ai_suite are
  // imported by unit tests that never open a browser, and CI's deterministic job does not install
  // Playwright. Only `launch` is used.
  let playwrightChromium;
  chromium = {
    launch: (...args) =>
      (playwrightChromium ??= requireFromSmoke("playwright").chromium).launch(...args),
  };
}

const valleyModule = await import(IS_NODE_RUNTIME
  ? "../../web/wwwroot/render/environment/first_run_valley.js"
  : "/render/environment/first_run_valley.js");
const {
  firstRunValleyCenterEastM,
  firstRunValleyProfileFromState,
} = valleyModule;

export const FIXED_WING_AI_SAMPLE_MS = 50;

/** Preserve an absent authority channel as absent instead of silently turning null into zero. */
export function fixedWingTelemetryNumberOrNull(value) {
  return value == null ? null : Number(value);
}

export const FIRST_RUN_AI_MINIMUM_ROUTE_DISTANCE_M = 16_500;
export const FIXED_WING_AI_MISSIONS = Object.freeze({
  f22: Object.freeze({
    // Keep flight-controller acceptance to one authoritative contact. The public first-merge
    // programme is deliberately a 2-v-1 Ace-pair fight and needs a separate formation-survival
    // proof; an unseen wingman killing the bot cannot diagnose pursuit, roll or gun-lead control.
    search: "?program=ace-duel&preview=1&server=off&audioQa=silent",
    missionId: "mission.modern.ace-duel.f22a-vs-su27s.public-data-surrogate.v1",
    goal: "combat",
    deadlineSeconds: 180,
  }),
  "first-run": Object.freeze({
    search: "?firstRun=1&server=off&audioQa=silent",
    missionId: "mission.modern.visual-merge.first-run-valley.v1",
    goal: "valley",
    // The 18 km gorge consumes about 83 seconds at the authored 420 KCAS. Preserve enough tape
    // after the pop-out to prove both heater splashes, successor promotion and the gun handoff.
    deadlineSeconds: 180,
  }),
  "top-gun": Object.freeze({
    search: "?program=top-gun&server=off&audioQa=silent",
    missionId: "mission.top-gun.acm.f14a-vs-mig28.v1",
    goal: "top-gun-sortie",
    // Two physical splashes, an O/KNOCK-IT-OFF handoff and the taught eight-gate Case-I pattern
    // are a whole sortie, not the old one-kill combat smoke. Twenty minutes is an engineering
    // watchdog; the browser still exits immediately on the stopped wire transaction.
    deadlineSeconds: 20 * 60,
  }),
  rapier: Object.freeze({
    search: "?program=rapier-intercept&server=off&audioQa=silent",
    missionId: "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1",
    goal: "rapier-recovery",
    // Active authority bounds Attack at eight minutes and the authored recovery fixture at
    // fifteen. Card 12 then enters Recovery directly from its 65 km gallery. Thirty minutes leaves
    // more than six minutes for three live-fuse kills, marshal capture and browser observer lag,
    // while remaining an explicit engineering watchdog (there is no active end-to-end SLA yet).
    deadlineSeconds: 30 * 60,
  }),
});

const GAMEPAD_DEADZONE = 0.14;
const F22_GUN_LEAD_ROLL_CAPTURE_ENTER_OFF_BORESIGHT_DEG = 6;
const F22_GUN_LEAD_ROLL_CAPTURE_ENTER_PLANE_DEG = 8;
const F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS = 15;
const F22_GUN_LEAD_ROLL_CAPTURE_ENTER_SAMPLES = 2;
const F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_OFF_BORESIGHT_DEG = 2;
const F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_PLANE_DEG = 30;
const F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_BANK_OFFSET_LIMIT_DEG = 10;
const F22_GUN_LEAD_ROLL_CAPTURE_RELEASE_OFF_BORESIGHT_DEG = 12;
const F22_GUN_LEAD_ROLL_CAPTURE_RELEASE_SAMPLES = 4;
const F22_GUN_LEAD_ROLL_CAPTURE_HANDOFF_STEP_DEG = 3;
const F22_GUN_LEAD_CAPTURED_RECOVERY_MAX_BANK_ERROR_DEG = 30;
const F22_GUN_LEAD_ROLL_CAPTURE_RATE_GAIN = 0.85;
const F22_GUN_LEAD_ROLL_CAPTURE_DAMPING_DPS = 140;
const F22_GUN_LEAD_ROLL_CAPTURE_TRIM_OFF_BORESIGHT_DEG = 2.5;
const F22_GUN_LEAD_CAPTURED_FINE_ROLL_ENTER_OFF_BORESIGHT_DEG = 2.35;
const F22_GUN_LEAD_CAPTURED_FINE_ROLL_RELEASE_OFF_BORESIGHT_DEG = 3;
const F22_GUN_LEAD_ROLL_CAPTURE_TRIM_GAIN = 0.25;
const F22_GUN_LEAD_ROLL_CAPTURE_TRIM_STEP_DEG = 0.35;
const F22_GUN_LEAD_ROLL_CAPTURE_BANK_DEADBAND_DEG = 0.15;
const F22_GUN_LEAD_ROLL_CAPTURE_RATE_DEADBAND_DPS = 0.35;
const F22_GUN_LEAD_CARTESIAN_ROLL_OFF_BORESIGHT_DEG = 6;
const F22_GUN_LEAD_CARTESIAN_ROLL_RATE_GAIN = 20;
const F22_GUN_LEAD_CARTESIAN_RANGE_SCALE_REFERENCE_M = 900;
const F22_GUN_LEAD_CARTESIAN_RANGE_SCALE_LIMIT = 2;
const F22_GUN_LEAD_CARTESIAN_ROLL_DELTA_GAIN = 30;
const F22_GUN_LEAD_CARTESIAN_ROLL_DELTA_RATE_LIMIT_DPS = 10;
const F22_GUN_LEAD_CARTESIAN_CAPTURED_COARSE_MAX_DELTA_DEG = 1;
const F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_GAIN = 0.15;
const F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MIN_ERROR_DEG = 0.08;
const F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG = 0.65;
const F22_GUN_LEAD_CLOSE_CAPTURE_MAX_RANGE_M = 650;
const F22_GUN_LEAD_CLOSE_CAPTURE_MAX_LATERAL_ERROR_DEG = 0.8;
const F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_DELTA_DEG = 0.02;
const F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_RATE_LIMIT_DPS = 5;
const F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS = 45;
const F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_MIN_ERROR_DEG = 0.25;
const F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_GAIN = 20;
const F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_RATE_LIMIT_DPS = 10;
const F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_MIN_CLOSURE_KTS = -100;
const F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_MAX_CLOSURE_KTS = 450;
// Tape 428 repeatedly reached a physical 49-degree lead at 1.1 km with controlled closure, but
// the old 35-degree gate left the jet in generic pursuit for the entire 180-second fight. The
// body-axis controller is the physically correct way to convert that close lead: roll the lift
// vector into its plane, then pull. Keep the existing range, closure, gamma, recovery and threat
// vetoes; widen only this handoff and preserve the same 15-degree hysteresis margin.
const F22_GUN_LEAD_FINISHER_ENTER_OFF_BORESIGHT_DEG = 55;
const F22_GUN_LEAD_FINISHER_REMAIN_OFF_BORESIGHT_DEG = 70;
const F22_GUN_LEAD_FINISHER_LONG_RANGE_ENTER_OFF_BORESIGHT_DEG = 40;
const F22_GUN_LEAD_FINISHER_LONG_RANGE_REMAIN_OFF_BORESIGHT_DEG = 45;
const F22_GUN_LEAD_FINISHER_WIDE_ENTRY_MAX_RANGE_M = 1_500;
const F22_GUN_LEAD_FINISHER_EARLY_ENTRY_MAX_RANGE_M = 2_500;
const F22_GUN_LEAD_FINISHER_EARLY_ENTRY_MAX_CLOSURE_KTS = 900;
const F22_GUN_LEAD_FINISHER_EARLY_ENTRY_MAX_PLANE_ERROR_DEG = 60;
const F22_GUN_LEAD_FINISHER_ENTER_MAX_PLANE_ERROR_DEG = 90;
const F22_GUN_LEAD_FINISHER_MAX_ENTRY_PLANE_TRAVEL_DEG = 95;
// High defense may briefly use 82 degrees, but final-axis tracking needs a visibly sustainable
// lift plane. At 78 degrees a seven-G pull supplies 1.46 vertical G while sacrificing barely one
// percent of horizontal turn authority versus 82. Tape 483 proved the old finisher target lived
// above 83.5 degrees for 1.4 seconds and looked like top-rudder flight despite commanding none.
// Keep the independent 84-degree physical stop for genuine overbank excursions.
const F22_SUSTAINED_FIGHTING_BANK_DEG = 82;
const F22_SUSTAINED_LOADED_OVERBANK_LIMIT_DEG = 84;
const F22_ORDINARY_PURSUIT_BANK_LIMIT_DEG = 68;
const F22_AFT_PURSUIT_BANK_LIMIT_DEG = 72;
const F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG = 78;
const F22_GUN_LEAD_FINISHER_OVERBANK_LIMIT_DEG =
  F22_SUSTAINED_LOADED_OVERBANK_LIMIT_DEG;
const F22_GUN_LEAD_FINISHER_OVERBANK_PREDICTION_S = 0.25;
const F22_GUN_LEAD_FINISHER_REARM_MIN_G = 2.5;
const F22_GUN_LEAD_IMMINENT_PASS_ENTER_RANGE_M = 500;
const F22_GUN_LEAD_IMMINENT_PASS_HOLD_RANGE_M = 750;
const F22_GUN_LEAD_IMMINENT_PASS_ENTER_CLOSURE_KTS = 500;
const F22_GUN_LEAD_IMMINENT_PASS_RELEASE_CLOSURE_KTS = 50;
const F22_GUN_LEAD_IMMINENT_PASS_ENTER_TIME_TO_CPA_S = 1.25;
const F22_GUN_LEAD_IMMINENT_PASS_HOLD_TIME_TO_CPA_S = 2;
const F22_GUN_LEAD_IMMINENT_PASS_ENTER_OFF_BORESIGHT_DEG = 30;
const F22_GUN_LEAD_IMMINENT_PASS_HOLD_OFF_BORESIGHT_DEG = 40;
const F22_GUN_LEAD_IMMINENT_PASS_ENTER_PLANE_ERROR_DEG = 15;
const F22_GUN_LEAD_IMMINENT_PASS_ENTER_ROLL_RATE_DPS = 25;
const F22_GUN_LEAD_IMMINENT_PASS_CONVERGED_ROLL_RATE_DPS = 5;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_RANGE_M = 1_200;
const F22_GUN_LEAD_PITCH_APPROACH_HOLD_RANGE_M = 1_300;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_MIN_CLOSURE_KTS = 250;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_MAX_CLOSURE_KTS = 450;
const F22_GUN_LEAD_PITCH_APPROACH_HOLD_MIN_CLOSURE_KTS = 50;
const F22_GUN_LEAD_PITCH_APPROACH_HOLD_MAX_CLOSURE_KTS = 500;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_OFF_BORESIGHT_DEG = 8;
const F22_GUN_LEAD_PITCH_APPROACH_HOLD_OFF_BORESIGHT_DEG = 10;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_LATERAL_ERROR_DEG = 2.25;
const F22_GUN_LEAD_PITCH_APPROACH_HOLD_LATERAL_ERROR_DEG = 3;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_MAX_PLANE_ERROR_DEG = 30;
const F22_GUN_LEAD_PITCH_APPROACH_HOLD_MAX_PLANE_ERROR_DEG = 35;
const F22_GUN_LEAD_PITCH_APPROACH_ENTER_MAX_ROLL_RATE_DPS = 15;
const F22_GUN_LEAD_FINISHER_ENTER_GAMMA_DEG = 45;
const F22_GUN_LEAD_FINISHER_REMAIN_GAMMA_DEG = 55;
const F22_GUN_LEAD_PITCH_DEADBAND_DEG = 0.05;
const F22_GUN_LEAD_PITCH_DAMPING_OFF_BORESIGHT_DEG = 4.25;
const F22_GUN_LEAD_PITCH_DAMPING_MAX_G = 3;
const F22_GUN_LEAD_PITCH_FULL_DAMPING_OFF_BORESIGHT_DEG = 2.5;
const F22_GUN_LEAD_PITCH_ASSIST_FULL_DAMPING_MAX_G = 1.9;
const F22_GUN_LEAD_APPROACH_BRAKE_OFF_BORESIGHT_DEG = 3;
const F22_GUN_LEAD_APPROACH_BRAKE_MAX_LATERAL_ERROR_DEG = 1;
const F22_GUN_LEAD_APPROACH_BRAKE_MAX_ROLL_RATE_DPS = 25;
const F22_GUN_LEAD_APPROACH_BRAKE_PITCH_RATE_ERROR_DPS = -5;
const F22_GUN_LEAD_PREDICTIVE_BRAKE_MAX_RANGE_M = 1_200;
const F22_GUN_LEAD_PREDICTIVE_BRAKE_MAX_OFF_BORESIGHT_DEG = 6;
const F22_GUN_LEAD_PREDICTIVE_BRAKE_MAX_LATERAL_ERROR_DEG = 0.8;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_RANGE_M = 650;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MAX_RANGE_M = 750;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MIN_CLOSURE_KTS = -100;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_CLOSURE_KTS = 150;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MIN_CLOSURE_KTS = -150;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MAX_CLOSURE_KTS = 200;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_OFF_BORESIGHT_DEG = 12;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MAX_OFF_BORESIGHT_DEG = 15;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_LATERAL_ERROR_DEG = 0.8;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_ROLL_RATE_DPS = 15;
const F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_PLANE_ERROR_DEG = 8;
const F22_GUN_LEAD_CAPTURED_PITCH_RATE_ENTRY_ERROR_DPS = 5;
const F22_GUN_LEAD_CAPTURED_PITCH_RATE_HOLD_ERROR_DPS = 2;
const F22_GUN_LEAD_CAPTURED_PITCH_ENTRY_ROLL_RATE_DPS = 15;
const F22_GUN_LEAD_CAPTURED_PITCH_HOLD_ROLL_RATE_DPS = 15;
const F22_GUN_LEAD_CAPTURED_PITCH_BASE_MAX_G = 5.5;
const F22_GUN_LEAD_HIGH_CLOSURE_DAMPING_MIN_CLOSURE_KTS = 450;
const F22_GUN_LEAD_HIGH_CLOSURE_ISOLATION_RELEASE_LIFT_ERROR_DEG = -0.15;
const F22_GUN_LEAD_HIGH_CLOSURE_PITCH_FLOOR_RELEASE_LIFT_ERROR_DEG = 0.8;
const F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_RANGE_M = 1_100;
const F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_CLOSURE_KTS = 550;
const F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_OFF_BORESIGHT_DEG = 1.5;
const F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_LATERAL_ERROR_DEG = 0.8;
const F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MIN_ROLL_RATE_DPS = 3;
const F22_GUN_LEAD_LIFT_ERROR_DELTA_GAIN = 0.5;
const F22_GUN_LEAD_LIFT_ERROR_DELTA_LIMIT = 0.12;
const COMBAT_TERRAIN_ESCAPE_ENTER_SECONDS = 10;
const COMBAT_TERRAIN_ESCAPE_PREDICTION_SECONDS = 4;
const COMBAT_TERRAIN_ESCAPE_VIOLATION_SECONDS = 8;
const COMBAT_TERRAIN_ESCAPE_PULL_BANK_DEG = 35;
const COMBAT_TERRAIN_ESCAPE_PULL_ROLL_RATE_DPS = 35;
const COMBAT_RECOVERY_ROLL_MAX_G = 2.5;
const COMBAT_RECOVERY_ROLL_MAX_AOA_DEG = 12;
// A single low-G observer frame is not proof that the lift command has actually unloaded. Tape
// 453 entered a slice while the published plant still carried the previous 7-G request; actual G
// crossed the ordinary 2.5-G boundary after aileron was already committed. Require two consecutive
// frames with margin and, when published, low requested/applied G before authorizing a new plane.
const COMBAT_PLANE_CHANGE_ARM_MAX_G = 2;
const COMBAT_PLANE_CHANGE_ARM_MAX_AOA_DEG = 10;
const COMBAT_PLANE_CHANGE_ARM_MAX_COMMAND_G = 2;
const COMBAT_PLANE_CHANGE_ARM_SAMPLES = 2;
const COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG = 8;
// Uncaptured final-axis control reaches the shared 25%-aileron materiality boundary at 12.5
// degrees. Keep the same physical ceiling after Cartesian capture, whose deliberately softer
// rate gain would otherwise permit a loaded 35-degree plane change.
const F22_GUN_LEAD_FINISHER_MATERIAL_BANK_ERROR_DEG = 12.5;
const COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS = 15;
// A nose-high fighter should make an unmistakable split-S: unload, roll fully inverted, then
// pull the flight path back below the horizon. The former 118-degree "slice" spent seconds at
// 123-132 degrees under 5-6 G. With zero rudder it was numerically coordinated, but both padlock
// and forward views read as a broken top-rudder knife edge. A true inverted plane is faster,
// symmetric across the Euler seam, and visually explains where the lift vector is pointing.
const COMBAT_VERTICAL_RECOVERY_BANK_DEG = 180;
const COMBAT_VERTICAL_RECOVERY_MAX_G = 6.5;
const COMBAT_VERTICAL_RECOVERY_PLANE_DRIFT_DEG = 10;
const COMBAT_VERTICAL_RECOVERY_RECAPTURE_BANK_ERROR_DEG = 6;
const COMBAT_DOWNHILL_SLICE_PLANE_DRIFT_DEG = 10;
const COMBAT_VERTICAL_LEVEL_RELEASE_BANK_DEG = 35;
const COMBAT_VERTICAL_LEVEL_RELEASE_ROLL_RATE_DPS = 15;
const COMBAT_INVERTED_RECOVERY_ENTRY_BANK_DEG = 100;
const COMBAT_INVERTED_RECOVERY_FIGHTING_BANK_DEG = 78;
const COMBAT_INVERTED_RECOVERY_RELEASE_BANK_ERROR_DEG = 8;
const COMBAT_INVERTED_RECOVERY_RELEASE_ROLL_RATE_DPS = 15;
const COMBAT_BFM_PULL_BANK_ERROR_ZERO_DEG = 75;
const COMBAT_BFM_PULL_BANK_ERROR_FULL_DEG = 20;
const COMBAT_BFM_PULL_ROLL_RATE_ZERO_DPS = 60;
const COMBAT_BFM_PULL_ROLL_RATE_FULL_DPS = 20;
const COMBAT_LOADED_PURSUIT_HOLD_MIN_G = 2.5;
const COMBAT_LOADED_PURSUIT_HOLD_MIN_HEADING_ERROR_DEG = 35;
const COMBAT_LOADED_PURSUIT_HOLD_MIN_RANGE_M = 1_500;
const COMBAT_LOADED_PURSUIT_HOLD_MIN_BANK_DEG = 55;
const COMBAT_LOADED_PURSUIT_HOLD_MAX_BANK_DEG = 90;
const COMBAT_LOADED_PURSUIT_HOLD_MIN_REDUCTION_DEG = 12.5;
const COMBAT_LOADED_PURSUIT_HOLD_RELEASE_BANK_GROWTH_DEG = 5;
const COMBAT_GENERIC_HIGH_BANK_PUSH_OPENING_KTS = -250;
const COMBAT_DEFENSIVE_BASE_BANK_DEG = 78;
const COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG = 55;
const COMBAT_DEFENSIVE_NOSE_HIGH_LATERAL_MIN_GAMMA_DEG = 15;
// The lower bank is an initial vertical jink, not a place to live. One second covers the
// validated projectile-flight displacement; after that, sustained defense needs lateral rate.
const COMBAT_DEFENSIVE_LOW_PLANE_MAX_SAMPLES = 20;
const COMBAT_DEFENSIVE_GUN_ENVELOPE_M = 900;
const COMBAT_DEFENSIVE_LOW_PLANE_TRANSFER_REBUILD_S = 1.6;
const COMBAT_DEFENSIVE_LOW_PLANE_CLOSE_OPENING_RELEASE_KTS = -50;
const COMBAT_DEFENSIVE_HIGH_CLIMB_MIN_GAMMA_DEG = 35;
const COMBAT_DEFENSIVE_HIGH_CLIMB_MIN_SHOOTER_BELOW_PATH_DEG = 12;
const COMBAT_DEFENSIVE_HIGH_CLIMB_MAX_G = 3;
const COMBAT_DEFENSIVE_POWER_TARGET = 1.05;
const COMBAT_DEFENSIVE_POWER_DEADBAND = 0.025;
const COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG = F22_SUSTAINED_FIGHTING_BANK_DEG;
const COMBAT_DEFENSIVE_HIGH_PLANE_MAX_G = 8.4;
const COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_GAMMA_DEG = -5;
const COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_RELATIVE_ELEVATION_DEG = 12;
const COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_MIN_G = 2.5;
const COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_SAMPLES = 2;
// Tape 490 crossed a five-degree classification seam by barely one degree and replaced Tape
// 489's successful vertical jink with a flat 82-degree circle. The bandit tracked that predictable
// wall turn for 3.6 seconds and killed the player. Reserve the high plane for a materially high
// attacker; a shallow six-degree offset still needs the reachable, aim-breaking low-plane jink.
const COMBAT_DEFENSIVE_HIGH_SHOOTER_MIN_ELEVATION_DEG = 8;
const COMBAT_DEFENSIVE_HIGH_SHOOTER_MIN_VERTICAL_M = 50;
const COMBAT_DEFENSIVE_HIGH_SHOOTER_MIN_ABOVE_FLIGHT_PATH_DEG = 3;
const COMBAT_DEFENSIVE_REACQUISITION_MAX_RANGE_M = 400;
const COMBAT_DEFENSIVE_REACQUISITION_MAX_VERTICAL_M = 200;
const COMBAT_DEFENSIVE_REACQUISITION_MIN_REAR_BEARING_DEG = 135;
const COMBAT_DEFENSIVE_REACQUISITION_MAX_NOSE_ERROR_DEG = 45;
const COMBAT_DEFENSIVE_PRECISION_REAR_MAX_RANGE_M = 600;
const COMBAT_DEFENSIVE_PRECISION_REAR_MAX_VERTICAL_M = 100;
const COMBAT_DEFENSIVE_PRECISION_REAR_MIN_BEARING_DEG = 135;
const COMBAT_DEFENSIVE_PRECISION_REAR_MIN_CLOSURE_KTS = 50;
const COMBAT_DEFENSIVE_PRECISION_REAR_MAX_NOSE_ERROR_DEG = 15;
const COMBAT_DEFENSIVE_URGENT_HIGH_PLANE_EXTRA_ROLL_DEG = 20;
const COMBAT_OFFENSIVE_PRESS_MIN_RANGE_M = 650;
const COMBAT_OFFENSIVE_PRESS_MAX_RANGE_M = 1_200;
const COMBAT_OFFENSIVE_PRESS_MAX_LEAD_ERROR_DEG = 3;
const COMBAT_OFFENSIVE_PRESS_HOLD_LEAD_ERROR_DEG = 4;
const COMBAT_OFFENSIVE_PRESS_MAX_ROLL_RATE_DPS = 15;
const COMBAT_OFFENSIVE_PRESS_MAX_CLOSURE_KTS = 900;
const COMBAT_OFFENSIVE_PRESS_MIN_OPPONENT_NOSE_ERROR_DEG = 20;
const COMBAT_OFFENSIVE_PRESS_MAX_SAMPLES = 7;
// Generic far-below conversion is also a real split-S rather than a prolonged oblique pull.
// The tightly bounded close post-pass conversion retains its separately proved 112-degree plane.
const COMBAT_DOWNHILL_SLICE_BANK_DEG = 180;
const COMBAT_DOWNHILL_SLICE_MAX_G = 6.5;
const COMBAT_DOWNHILL_SLICE_MAX_ENTRY_PLANE_TRAVEL_DEG = 120;
const COMBAT_DOWNHILL_GENERIC_MIN_CLOSURE_KTS = -250;
const COMBAT_DOWNHILL_SLICE_RELEASE_GAMMA_DEG = -24;
const COMBAT_DOWNHILL_SLICE_RELEASE_HEADING_ERROR_DEG = 30;
// A close, fast opening immediately after a defensive crossing is a reversal, not permission to
// draw the generic deep downhill pursuit arc. Tape 439 crossed at 132 m while climbing 27 degrees,
// then held afterburner and the 112-degree slice all the way to -37 degrees. Bound only that
// unmistakable post-pass episode and recover on a same-side fighting bank so the aircraft keeps
// converting heading while it pulls out instead of rolling 112 -> 0 -> 78 degrees.
const COMBAT_DOWNHILL_POST_PASS_RANGE_M = 400;
const COMBAT_DOWNHILL_POST_PASS_OPENING_KTS = -250;
const COMBAT_DOWNHILL_POST_PASS_MIN_GAMMA_DEG = 15;
const COMBAT_DOWNHILL_POST_PASS_BANK_DEG = 112;
const COMBAT_DOWNHILL_POST_PASS_RELEASE_GAMMA_DEG = -24;
const COMBAT_DOWNHILL_POST_PASS_RECOVERY_BANK_DEG = 60;
const COMBAT_DOWNHILL_POST_PASS_RECOVERY_BANK_ERROR_DEG = 12;
const COMBAT_DOWNHILL_GENERIC_MIN_RANGE_M = 700;
const COMBAT_DOWNHILL_GENERIC_ENTRY_MIN_GAMMA_DEG = -10;
const COMBAT_DOWNHILL_RECOVERY_RELEASE_GAMMA_DEG = -8;
const COMBAT_DOWNHILL_ENTRY_MIN_BELOW_FLIGHT_PATH_DEG = 6;
// The hardware harness captures this failure at 0.75 s because that is already long enough to
// read as sustained knife-edge/top-rudder flight. Acceptance must reject the same evidence rather
// than allowing a second full capture window before failing.
const F22_MAX_SETTLED_LOADED_OVERBANK_S = 0.75;
// The hard overbank watchdog catches physically extreme pulls above 84 degrees. Tape 488 still
// spent 14 seconds settled above 75 degrees and looked like a wall turn despite never crossing
// that boundary. Permit brief tactical use of the lane, but reject a prolonged visual hold.
const F22_MAX_SUSTAINED_LOADED_WALL_TURN_S = 3;
const COMBAT_DOWNHILL_TARGET_ABOVE_FLIGHT_PATH_RELEASE_DEG = 4;
const COMBAT_DOWNHILL_HIGH_CLEARANCE_FINISHER_MIN_GAMMA_DEG = -10;
const COMBAT_TERRAIN_ESCAPE_RELEASE_GAMMA_DEG = 8;
const COMBAT_TERRAIN_ESCAPE_RELEASE_RADAR_ALT_FT = 1_800;
const COMBAT_TERRAIN_ESCAPE_RELEASE_SAMPLES = 6;
const FIRST_RUN_VALLEY_LOOKAHEAD_M = 950;
const FIRST_RUN_VALLEY_CURVATURE_STEP_M = 40;
const FIRST_RUN_VALLEY_CURVATURE_BANK_GAIN = 0.45;
const FIRST_RUN_VALLEY_CURVATURE_BANK_LIMIT_DEG = 35;
const toRadians = (degrees) => Number(degrees) * Math.PI / 180;
const toDegrees = (radians) => Number(radians) * 180 / Math.PI;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Preserve only complete, finite projectile position/velocity vectors at the browser boundary. */
export function fixedWingIncomingTracerRows(value, maximumRows = 32) {
  if (!Array.isArray(value)) return [];
  const limit = Math.max(0, Math.floor(finite(maximumRows, 32)));
  return value.slice(0, limit).flatMap((row) => {
    if (!Array.isArray(row) || row.length < 6) return [];
    const vector = row.slice(0, 6);
    return vector.every(Number.isFinite) ? [vector] : [];
  });
}

function fixedWingGunTargetKey(state) {
  const rawBanditEntityId = state?.bandit_entity_id;
  const banditEntityId = rawBanditEntityId == null
    ? null
    : String(rawBanditEntityId).trim() || null;
  if (banditEntityId !== null) return `entity:${banditEntityId}`;
  const rawSelectedTargetSlot = state?.selected_player_gun_target_slot;
  const rawEngagementNumber = state?.engagement_number;
  if (rawSelectedTargetSlot == null || rawEngagementNumber == null) return null;
  const selectedTargetSlot = Number(rawSelectedTargetSlot);
  const engagementNumber = Number(rawEngagementNumber);
  return Number.isInteger(selectedTargetSlot) && Number.isInteger(engagementNumber)
    ? `engagement:${engagementNumber}:slot:${selectedTargetSlot}`
    : null;
}

const BANDIT_TACTIC_NAMES = Object.freeze([
  "ACQUIRE",
  "DEFEND",
  "ENERGY",
  "RETURN",
  "PRESENT",
]);

/** Decode the simulation's stable BanditTactic ordinal without turning null into Acquire. */
export function fixedWingOpponentTacticName(value) {
  if (value === null || value === undefined || value === "") return null;
  const code = Number(value);
  return Number.isInteger(code) ? BANDIT_TACTIC_NAMES[code] ?? null : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value)));
}

function percentile(values, fraction) {
  const sorted = (values ?? []).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * clamp(fraction, 0, 1))];
}

function smootherstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function vector3(x, y, z) {
  const values = [Number(x), Number(y), Number(z)];
  if (!values.every(Number.isFinite)) return null;
  const magnitude = Math.hypot(...values);
  if (magnitude < 1e-6) return null;
  return values.map((value) => value / magnitude);
}

function dot3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross3(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function subtractProjection3(vector, axis) {
  const projection = dot3(vector, axis);
  return [
    vector[0] - axis[0] * projection,
    vector[1] - axis[1] * projection,
    vector[2] - axis[2] * projection,
  ];
}

export function wrapAngleDeg(value) {
  let angle = finite(value);
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

export function boundedFixedWingGamepadAxes(roll, pitch) {
  let x = clamp(roll, -1, 1);
  let y = clamp(pitch, -1, 1);
  let magnitude = Math.hypot(x, y);
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
    magnitude = 1;
  }
  return Object.freeze({ roll: x, pitch: y, magnitude });
}

/** Undo the production circular deadzone as one stick vector, not two independent axes. */
export function rawFixedWingGamepadAxes(roll, pitch, deadzone = GAMEPAD_DEADZONE) {
  const bounded = boundedFixedWingGamepadAxes(roll, pitch);
  const { roll: x, pitch: y, magnitude } = bounded;
  if (magnitude < 1e-6) return Object.freeze({ roll: 0, pitch: 0 });
  const neutral = clamp(deadzone, 0, 0.45);
  const rawMagnitude = neutral + magnitude * (1 - neutral);
  const scale = rawMagnitude / magnitude;
  return Object.freeze({ roll: x * scale, pitch: y * scale });
}

/** Scalar convenience for tests and callers that truly use only one stick axis. */
export function rawFixedWingGamepadAxis(value, deadzone = GAMEPAD_DEADZONE) {
  return rawFixedWingGamepadAxes(value, 0, deadzone).roll;
}

/**
 * Convert the simulation's protected load-factor contract to the physical pitch axis. Manual
 * fixed-wing input is linear from neutral 1 G to g_maxperform on pull, and from 1 G to the
 * ordinary -1 G bunt floor on push. Keeping the conversion here lets the pilot ask for a real
 * manoeuvre instead of hoping a magic stick fraction happens to fit this airframe.
 */
export function fixedWingPitchForLoadFactor(
  desiredLoadFactorG,
  maximumLoadFactorG = 9,
  minimumLoadFactorG = -1,
) {
  const maximumG = Math.max(1.01, finite(maximumLoadFactorG, 9));
  const minimumG = Math.min(0.99, finite(minimumLoadFactorG, -1));
  const desiredG = clamp(desiredLoadFactorG, minimumG, maximumG);
  return desiredG >= 1
    ? (desiredG - 1) / (maximumG - 1)
    : (desiredG - 1) / (1 - minimumG);
}

/** Inverse of fixedWingPitchForLoadFactor for command and browser-pad evidence. */
export function fixedWingLoadFactorForPitch(
  pitch,
  maximumLoadFactorG = 9,
  minimumLoadFactorG = -1,
) {
  const maximumG = Math.max(1.01, finite(maximumLoadFactorG, 9));
  const minimumG = Math.min(0.99, finite(minimumLoadFactorG, -1));
  const boundedPitch = clamp(pitch, -1, 1);
  return boundedPitch >= 0
    ? 1 + (maximumG - 1) * boundedPitch
    : 1 + (1 - minimumG) * boundedPitch;
}

/** Upright load needed to hold altitude at the current bank; knife-edge is capped at 3 G. */
export function fixedWingCoordinatedLoadFactorG(bankDeg, maximumLoadFactorG = 9) {
  const maximumG = Math.max(1.01, finite(maximumLoadFactorG, 9));
  const absoluteBankDeg = Math.abs(wrapAngleDeg(bankDeg));
  if (absoluteBankDeg >= 90) return 1;
  const maximumCoordinatedBankDeg = toDegrees(Math.acos(1 / 3));
  const uprightBankDeg = Math.min(maximumCoordinatedBankDeg, absoluteBankDeg);
  return clamp(1 / Math.cos(toRadians(uprightBankDeg)), 1, Math.min(3, maximumG));
}

export function createFixedWingAiControllerState() {
  return {
    terrainRecoveryPhase: "idle",
    terrainRecoveryReleaseSamples: 0,
    verticalRecoveryPhase: "idle",
    verticalRecoverySliceSign: 1,
    verticalRecoverySliceRollArmed: false,
    verticalRecoveryPullActive: false,
    verticalRecoveryRecaptureActive: false,
    verticalRecoveryLevelRollArmed: false,
    combatDownhillSliceActive: false,
    combatDownhillSliceSign: 1,
    combatDownhillSliceRollArmed: false,
    combatDownhillSlicePullActive: false,
    combatDownhillSliceUnloadSamples: 0,
    combatDownhillSliceRearmBlocked: false,
    combatDownhillRecoveryPhase: "idle",
    combatDownhillRecoveryRollArmed: false,
    combatDownhillPostPassConversionActive: false,
    combatDefensiveBreakSamples: 0,
    combatDefensiveBreakSign: 1,
    combatDefensiveBreakHasCommitted: false,
    combatDefensiveLastCommittedBreakSign: null,
    combatDefensiveBreakPlaneMagnitudeDeg: COMBAT_DEFENSIVE_BASE_BANK_DEG,
    combatDefensiveLowPlaneSamples: 0,
    combatDefensiveLowPlaneComplete: false,
    combatDefensiveGunfireBankHoldActive: false,
    combatDefensiveHighPlaneReleaseSamples: 0,
    combatDefensiveHighPlaneComplete: false,
    combatDefensiveHighPlaneRecoveryActive: false,
    combatDefensiveReleaseUnloadActive: false,
    combatLoadedRollUnloadActive: false,
    combatLoadedRollPhase: "idle",
    combatLoadedRollTargetBankDeg: 0,
    combatLoadedRollTransferSign: 0,
    combatLoadedRollUnloadSamples: 0,
    combatLoadedPursuitBankHoldActive: false,
    combatAftPursuitBankHoldActive: false,
    combatAftPursuitBankHoldSign: 1,
    pursuitHandoffTrimActive: false,
    combatDefensivePrimaryTargetKey: null,
    combatDefensiveLastPrimaryNoseErrorDeg: null,
    combatDefensivePrimaryAimSamples: 0,
    combatOffensivePressSamples: 0,
    combatOffensivePressExhausted: false,
    combatOffensivePressLastLeadOffBoresightDeg: null,
    combatCornerEnergyActive: false,
    lastValidRollRateDps: null,
    invertedRecoveryActive: false,
    invertedRecoveryRollArmed: false,
    invertedRecoveryTargetBankDeg: null,
    gunLeadFinisherActive: false,
    gunLeadFinisherRearmBlocked: false,
    gunLeadFinisherEntryBankDeg: null,
    gunLeadCloseApproachBrakeActive: false,
    gunLeadImminentPassBankHoldActive: false,
    gunLeadFinisherHalfRollSign: 1,
    gunLeadRollCaptureActive: false,
    gunLeadRollCaptureBankDeg: 0,
    gunLeadRollCaptureCandidateSamples: 0,
    gunLeadRollCaptureReleaseSamples: 0,
    gunLeadRollCaptureTargetKey: null,
    gunLeadCapturedFineRollActive: false,
    gunLeadPitchDominatedFineCaptureActive: false,
    gunLeadLastLateralErrorDeg: null,
    gunLeadCartesianRollBiasRateDps: 0,
    gunLeadLastLiftErrorDeg: null,
  };
}

export function orderedValuesVisited(samples, property, requiredValues) {
  const visited = [];
  for (const sample of samples ?? []) {
    const value = String(sample?.[property] ?? "").toLowerCase();
    if (value && value !== visited.at(-1)) visited.push(value);
  }
  let cursor = 0;
  for (const requiredValue of requiredValues ?? []) {
    const wanted = String(requiredValue).toLowerCase();
    while (cursor < visited.length && visited[cursor] !== wanted) cursor += 1;
    if (cursor >= visited.length) return Object.freeze({ pass: false, visited });
    cursor += 1;
  }
  return Object.freeze({ pass: true, visited });
}

function topGunPublishedApproachGate(state) {
  if (state?.approach_guidance_active !== true) return null;
  const count = Math.max(0, Math.floor(Number(state?.approach_gate_count) || 0));
  const gates = Array.isArray(state?.approach_gates) ? state.approach_gates : [];
  const bounded = gates.slice(0, Math.min(count || gates.length, gates.length));
  const gate = bounded.find((candidate) => candidate?.active === true
      || Number(candidate?.active) === 1)
    ?? bounded.find((candidate) => Number(candidate?.half_m) > 0);
  if (!gate) return null;
  const values = [gate.east_m, gate.up_m, gate.north_m, gate.target_ktas]
    .map(Number);
  if (!values.every(Number.isFinite)) return null;
  return Object.freeze({
    x: values[0],
    y: values[1],
    z: values[2],
    targetKtas: values[3],
    halfM: Math.max(0, finite(gate.half_m)),
    dirty: gate?.dirty === true || Number(gate?.dirty) === 1,
    gateCount: count,
  });
}

/** Production Top Gun recovery target: the live taught gate, then the physical wire datum. */
export function topGunRecoveryTarget(state) {
  if (state?.player_rtb_active !== true) return null;
  const gate = topGunPublishedApproachGate(state);
  if (gate) {
    const touchdown = [state?.tx, state?.ty, state?.tz].map(Number);
    // The last published gate is WIRES at 180 m astern and 36 ft. Flying from GROOVE through that
    // point to the live touchdown datum creates the physical no-flare glideslope; continuing to
    // chase the final gate itself would make the bot pull up and turn around just before the deck.
    if (gate.gateCount === 1 && touchdown.every(Number.isFinite)) {
      return Object.freeze({
        ...gate,
        x: touchdown[0],
        y: touchdown[1],
        z: touchdown[2],
        mode: "carrier-final",
      });
    }
    return Object.freeze({ ...gate, mode: "carrier-approach" });
  }

  // Approach publication normally arrives on the same fixed-tick edge as PlayerRtb. Retain a
  // bounded moving-home fallback for that one edge rather than pointing at a dead opponent.
  const carrier = [state?.cx, state?.cy, state?.cz].map(Number);
  if (!carrier.every(Number.isFinite)) return null;
  return Object.freeze({
    x: carrier[0],
    y: carrier[1] + 800 * 0.3048,
    z: carrier[2] - 3 * 1852,
    targetKtas: 350,
    halfM: 450,
    dirty: false,
    gateCount: 0,
    mode: "carrier-home-fallback",
  });
}

function rapierCumulativeCounter(sample, sortieProperty, currentProperty) {
  const sortieRaw = sample?.[sortieProperty];
  const sortieValue = sortieRaw == null ? Number.NaN : Number(sortieRaw);
  return Number.isFinite(sortieValue)
    ? sortieValue
    : finite(sample?.[currentProperty]);
}

function rapierPublishedSortieCounter(sample, property) {
  const raw = sample?.[property];
  if (raw == null || raw === "") return Number.NaN;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

function rapierCarrierCount(sample) {
  const raw = sample?.rapierCarriersRemaining;
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : null;
}

/** First honest Rapier objective proof: reach Attack and physically remove one live carrier. */
export function rapierAttackEvidence(samples) {
  const rows = samples ?? [];
  const phases = orderedValuesVisited(
    rows,
    "rapierPhase",
    ["launch", "climb", "intercept", "attack"],
  );
  const attackIndex = rows.findIndex((sample) =>
    String(sample?.rapierPhase ?? "").toLowerCase() === "attack");
  const carrierBaselineIndex = rows.findIndex((sample) => {
    const value = rapierCarrierCount(sample);
    return value !== null;
  });
  const initialCarriersRemaining = carrierBaselineIndex >= 0
    ? rapierCarrierCount(rows[carrierBaselineIndex])
    : null;
  const carrierDecrementIndex = carrierBaselineIndex >= 0
    ? rows.findIndex((sample, index) => {
      const value = rapierCarrierCount(sample);
      return index > carrierBaselineIndex
        && value !== null
        && value < initialCarriersRemaining;
    })
    : -1;
  const payloadDeploymentIndex = rows.findIndex((sample) =>
    sample?.rapierPayloadDeployed === true);
  const proofRows = carrierDecrementIndex >= 0
    ? rows.slice(0, carrierDecrementIndex + 1)
    : rows;
  // A climb/intercept burst cannot be recycled as proof of the Attack. Baseline on the last
  // authority sample before Attack so weapon evidence arriving with the transition still counts.
  const attackCounterBaselineIndex = attackIndex > 0 ? attackIndex - 1 : 0;
  const initialRounds = rows.length
    ? rapierCumulativeCounter(
      rows[attackCounterBaselineIndex],
      "sortiePlayerRoundsFired",
      "roundsFired",
    )
    : 0;
  const initialHits = rows.length
    ? rapierCumulativeCounter(rows[attackCounterBaselineIndex], "sortiePlayerHits", "hits")
    : 0;
  const maximumRounds = Math.max(initialRounds, ...proofRows.map((sample) =>
    rapierCumulativeCounter(sample, "sortiePlayerRoundsFired", "roundsFired")));
  const maximumHits = Math.max(initialHits, ...proofRows.map((sample) =>
    rapierCumulativeCounter(sample, "sortiePlayerHits", "hits")));
  const roundsFiredDelta = Math.max(0, maximumRounds - initialRounds);
  const hitsDelta = Math.max(0, maximumHits - initialHits);
  const reactionArmedBeforeDecrement = carrierDecrementIndex >= 0
    && rows.slice(0, carrierDecrementIndex + 1).some((sample) =>
      sample?.rapierReactionActive === true
        && Number(sample?.rapierReactionSeconds) > 0);
  const carrierDecrementAfterAttack = carrierDecrementIndex >= attackIndex
    && attackIndex >= 0;
  const carrierDecrementBeforePayload = carrierDecrementIndex >= 0
    && (payloadDeploymentIndex < 0 || carrierDecrementIndex < payloadDeploymentIndex);
  const carrierCounts = rows.map(rapierCarrierCount)
    .filter((value) => value !== null);
  return Object.freeze({
    pass: phases.pass
      && initialCarriersRemaining === 3
      && carrierDecrementAfterAttack
      && carrierDecrementBeforePayload
      && reactionArmedBeforeDecrement
      && roundsFiredDelta > 0
      && hitsDelta > 0,
    phases,
    attackIndex,
    initialCarriersRemaining,
    carrierDecrementIndex,
    minimumCarriersRemaining: carrierCounts.length ? Math.min(...carrierCounts) : null,
    payloadDeploymentIndex,
    carrierDecrementAfterAttack,
    carrierDecrementBeforePayload,
    reactionArmedBeforeDecrement,
    roundsFiredDelta,
    hitsDelta,
  });
}

/** Complete Rapier gallery and recovery proof, segmented at each physical carrier promotion. */
export function rapierSortieEvidence(samples) {
  const rows = samples ?? [];
  const attack = rapierAttackEvidence(rows);
  const phases = orderedValuesVisited(
    rows,
    "rapierPhase",
    ["launch", "climb", "intercept", "attack", "recovery"],
  );
  const returnToBaseIndex = rows.findIndex((sample) =>
    String(sample?.rapierPhase ?? "").toLowerCase() === "returntobase");
  const recoveryIndex = rows.findIndex((sample) =>
    String(sample?.rapierPhase ?? "").toLowerCase() === "recovery");
  const lateReturnToBaseIndex = rows.findIndex((sample, index) =>
    index > recoveryIndex
      && String(sample?.rapierPhase ?? "").toLowerCase() === "returntobase");
  // Card 12 is only 65 km from home, inside the 150 km direct-Recovery threshold. A farther
  // gallery may publish ReturnToBase first, but it must never appear after Recovery has begun.
  const recoveryRoutePass = attack.attackIndex >= 0
    && recoveryIndex > attack.attackIndex
    && lateReturnToBaseIndex < 0
    && (returnToBaseIndex < 0
      || (returnToBaseIndex > attack.attackIndex && returnToBaseIndex < recoveryIndex));
  const carrierProgression = [];
  for (const sample of rows) {
    const count = rapierCarrierCount(sample);
    if (count !== null && count !== carrierProgression.at(-1)) carrierProgression.push(count);
  }
  const carrierProgressionPass = carrierProgression.length === 4
    && carrierProgression.every((count, index) => count === 3 - index);

  const transitions = [];
  let baselineIndex = attack.attackIndex > 0 ? attack.attackIndex - 1 : attack.attackIndex;
  for (const toCarriers of [2, 1, 0]) {
    const fromCarriers = toCarriers + 1;
    const decrementIndex = baselineIndex >= 0
      ? rows.findIndex((sample, index) =>
        index > baselineIndex && rapierCarrierCount(sample) === toCarriers)
      : -1;
    const segmentEndIndex = decrementIndex >= 0 ? decrementIndex : rows.length - 1;
    const segment = baselineIndex >= 0
      ? rows.slice(baselineIndex, segmentEndIndex + 1)
      : [];
    const baseline = baselineIndex >= 0 ? rows[baselineIndex] : null;
    const baselineRounds = rapierPublishedSortieCounter(baseline, "sortiePlayerRoundsFired");
    const baselineHits = rapierPublishedSortieCounter(baseline, "sortiePlayerHits");
    const terminalRounds = decrementIndex >= 0
      ? rapierPublishedSortieCounter(rows[decrementIndex], "sortiePlayerRoundsFired")
      : Number.NaN;
    const terminalHits = decrementIndex >= 0
      ? rapierPublishedSortieCounter(rows[decrementIndex], "sortiePlayerHits")
      : Number.NaN;
    const counterTelemetryPresent = [
      baselineRounds,
      baselineHits,
      terminalRounds,
      terminalHits,
    ].every(Number.isFinite);
    const roundsFiredDelta = counterTelemetryPresent
      ? Math.max(0, terminalRounds - baselineRounds)
      : Number.NaN;
    const hitsDelta = counterTelemetryPresent
      ? Math.max(0, terminalHits - baselineHits)
      : Number.NaN;
    // The previous promotion's sample may have shown a live fuse many seconds earlier. Prove the
    // fuse was still live on the last authority observation before this carrier disappeared; the
    // final 1 -> 0 sample itself legitimately clears reaction state because no live carrier remains.
    const preDecrement = decrementIndex > 0 ? rows[decrementIndex - 1] : null;
    const reactionFuseLive = preDecrement?.rapierReactionActive === true
      && Number(preDecrement?.rapierReactionSeconds) > 0;
    const attackPhaseSeen = segment.some((sample) =>
      String(sample?.rapierPhase ?? "").toLowerCase() === "attack");
    const exactCarrierDecrement = decrementIndex >= 0
      && rapierCarrierCount(rows[baselineIndex]) === fromCarriers
      && rapierCarrierCount(rows[decrementIndex]) === toCarriers;
    transitions.push(Object.freeze({
      fromCarriers,
      toCarriers,
      baselineIndex,
      decrementIndex,
      exactCarrierDecrement,
      attackPhaseSeen,
      reactionFuseLive,
      counterTelemetryPresent,
      roundsFiredDelta,
      hitsDelta,
      pass: exactCarrierDecrement
        && attackPhaseSeen
        && reactionFuseLive
        && counterTelemetryPresent
        && roundsFiredDelta > 0
        && hitsDelta > 0,
    }));
    if (decrementIndex >= 0) baselineIndex = decrementIndex;
  }

  const galleryCompleteIndex = transitions.at(-1)?.decrementIndex ?? -1;
  const payloadDeploymentIndex = rows.findIndex((sample) =>
    sample?.rapierPayloadDeployed === true);
  const galleryClearedBeforePayload = galleryCompleteIndex >= 0
    && (payloadDeploymentIndex < 0 || galleryCompleteIndex < payloadDeploymentIndex);
  const playerRtbActiveSeen = galleryCompleteIndex >= 0
    && rows.slice(galleryCompleteIndex).some((sample) =>
      sample?.playerReturnToBaseActive === true
        && ["returntobase", "recovery"].includes(
          String(sample?.rapierPhase ?? "").toLowerCase(),
        ));

  const recoveryGates = [];
  for (const sample of rows) {
    if (String(sample?.rapierPhase ?? "").toLowerCase() !== "recovery") continue;
    const gate = Number(sample?.rapierRecoveryGate);
    if (Number.isInteger(gate) && gate >= 0 && gate <= 4 && gate !== recoveryGates.at(-1)) {
      recoveryGates.push(gate);
    }
  }
  // A bolter legitimately resets the director to gate zero. Grade the last attempted approach so
  // an earlier 1..4 cannot launder a later skipped gate, while a complete second pass can recover.
  const lastGateResetIndex = recoveryGates.lastIndexOf(0);
  const finalApproachGates = recoveryGates.slice(lastGateResetIndex + 1);
  const recoveryGatesPass = finalApproachGates.length === 4
    && finalApproachGates.every((gate, index) => gate === index + 1);

  const latest = rows.at(-1) ?? {};
  const sortieFinishedEventSeen = (latest.recentEvents ?? []).some((event) =>
    String(event?.type ?? "").toUpperCase() === "SORTIE_FINISHED"
      && String(event?.outcome ?? "").toUpperCase() === "VICTORY");
  const terminal = Object.freeze({
    sessionFinished: latest.sessionFinished === true
      && String(latest.sessionPhase ?? "").toUpperCase() === "FINISHED",
    recoveryPhase: ["recovery", "complete"].includes(
      String(latest.rapierPhase ?? "").toLowerCase(),
    ),
    victory: String(latest.sortieOutcome ?? "").toUpperCase() === "VICTORY",
    playerFlying: String(latest.playerTerminal ?? "").toUpperCase() === "FLYING",
    threeKills: finite(latest.killCount) >= 3,
    carriersCleared: rapierCarrierCount(latest) === 0,
    payloadSafe: latest.rapierPayloadDeployed !== true,
    arrestedTrap: String(latest.recovery ?? "").toLowerCase() === "trap"
      && String(latest.hookOutcome ?? "").toUpperCase() === "ENGAGED"
      && Number.isInteger(Number(latest.wire))
      && Number(latest.wire) >= 1
      && Number(latest.wire) <= 4
      && String(latest.arrestPhase ?? "").toUpperCase() === "STOPPED"
      && String(latest.arrestFailureReason ?? "").toUpperCase() === "NONE",
    sortieFinishedEventSeen,
  });
  const terminalPass = Object.values(terminal).every((value) => value === true);

  return Object.freeze({
    pass: attack.initialCarriersRemaining === 3
      && phases.pass
      && recoveryRoutePass
      && carrierProgressionPass
      && transitions.every((transition) => transition.pass)
      && galleryClearedBeforePayload
      && playerRtbActiveSeen
      && recoveryGatesPass
      && terminalPass,
    attack,
    phases,
    returnToBaseIndex,
    recoveryIndex,
    lateReturnToBaseIndex,
    recoveryRoutePass,
    carrierProgression: Object.freeze(carrierProgression),
    carrierProgressionPass,
    transitions: Object.freeze(transitions),
    galleryCompleteIndex,
    payloadDeploymentIndex,
    galleryClearedBeforePayload,
    playerRtbActiveSeen,
    recoveryGates: Object.freeze(recoveryGates),
    finalApproachGates: Object.freeze(finalApproachGates),
    recoveryGatesPass,
    terminal,
    terminalPass,
  });
}

function topGunPlayerDestroyedEvents(samples) {
  const events = new Map();
  for (let sampleIndex = 0; sampleIndex < (samples?.length ?? 0); sampleIndex += 1) {
    for (const event of samples[sampleIndex]?.recentEvents ?? []) {
      if (String(event?.type ?? "").toUpperCase() !== "DESTROYED"
          || String(event?.source ?? "").toUpperCase() !== "PLAYER"
          || String(event?.target ?? "").toUpperCase() !== "OPPONENT") continue;
      const sequence = Number(event?.sequence);
      if (!Number.isFinite(sequence) || events.has(sequence)) continue;
      events.set(sequence, Object.freeze({
        sequence,
        sampleIndex,
        entityId: event?.entityId ?? null,
      }));
    }
  }
  return Object.freeze([...events.values()].sort((left, right) =>
    left.sequence - right.sequence));
}

/**
 * Full Top Gun proof. Two distinct player-caused destruction events close the replacement-stream
 * blind spot; the return then has to consume every shrinking eight-gate ladder stage, physically
 * dirty the same aircraft and end stopped on a wire.
 */
export function topGunSortieEvidence(samples) {
  const rows = samples ?? [];
  const first = rows[0] ?? {};
  const latest = rows.at(-1) ?? {};
  const openingKills = finite(first.killCount);
  const killProgression = [];
  for (const sample of rows) {
    const count = Number(sample?.killCount);
    if (Number.isInteger(count) && count !== killProgression.at(-1)) {
      killProgression.push(count);
    }
  }
  const exactTwoKillProgression = killProgression.length >= 3
    && killProgression.slice(0, 3).every((count, index) => count === openingKills + index);
  const destroyedEvents = topGunPlayerDestroyedEvents(rows);
  const transitions = [];
  let baselineIndex = 0;
  for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
    const targetKills = openingKills + ordinal;
    const killIndex = rows.findIndex((sample, index) =>
      index > baselineIndex && Number(sample?.killCount) === targetKills);
    const baseline = rows[baselineIndex] ?? {};
    const terminal = killIndex >= 0 ? rows[killIndex] : {};
    const roundsDelta = Math.max(0,
      finite(terminal?.sortiePlayerRoundsFired) - finite(baseline?.sortiePlayerRoundsFired));
    const hitsDelta = Math.max(0,
      finite(terminal?.sortiePlayerHits) - finite(baseline?.sortiePlayerHits));
    const missilesDelta = Math.max(0,
      finite(baseline?.aim9Remaining) - finite(terminal?.aim9Remaining));
    const destruction = destroyedEvents.find((event) =>
      event.sampleIndex > baselineIndex && event.sampleIndex <= killIndex);
    transitions.push(Object.freeze({
      ordinal,
      baselineIndex,
      killIndex,
      roundsDelta,
      hitsDelta,
      missilesDelta,
      destroyedEventSequence: destruction?.sequence ?? null,
      destroyedEntityId: destruction?.entityId ?? null,
      pass: killIndex > baselineIndex
        && (hitsDelta > 0 || missilesDelta > 0)
        && destruction !== undefined,
    }));
    if (killIndex >= 0) baselineIndex = killIndex;
  }
  const destroyedEntityIds = transitions.map((transition) =>
    String(transition.destroyedEntityId ?? "").trim()).filter(Boolean);
  const replacementTargetsDistinct = destroyedEntityIds.length === 2
    && new Set(destroyedEntityIds).size === 2;

  const secondKillIndex = transitions[1]?.killIndex ?? -1;
  const rtbRequestIssuedIndex = secondKillIndex >= 0
    ? rows.findIndex((sample, index) => index >= secondKillIndex
      && sample?.aiRtbRequestIssued === true)
    : -1;
  const rtbIndex = secondKillIndex >= 0
    ? rows.findIndex((sample, index) => index > secondKillIndex
      && sample?.playerReturnToBaseActive === true)
    : -1;
  const pilotRtbReasonSeen = rtbIndex >= 0 && rows.slice(rtbIndex).some((sample) =>
    String(sample?.returnToBaseReason ?? "").toUpperCase() === "PILOT_KNOCK_IT_OFF");
  const combatHandoffPhases = [];
  for (const sample of rows) {
    const phase = Number(sample?.combatHandoffPhase);
    if (Number.isInteger(phase) && phase !== combatHandoffPhases.at(-1)) {
      combatHandoffPhases.push(phase);
    }
  }
  const combatHandoffRtbSeen = rtbIndex >= 0 && rows.slice(rtbIndex).some((sample) =>
    Number(sample?.combatHandoffPhase) === 5);

  const approachGateCounts = [];
  const approachGateRecords = [];
  for (const sample of rtbIndex >= 0 ? rows.slice(rtbIndex) : []) {
    if (sample?.approachGuidanceActive !== true) continue;
    const count = Number(sample?.approachGateCount);
    if (!Number.isInteger(count) || count < 1 || count > 8
        || count === approachGateCounts.at(-1)) continue;
    const publishedGates = Array.isArray(sample?.approachGates)
      ? sample.approachGates.slice(0, count)
      : [];
    const geometryValid = publishedGates.length === count
      && publishedGates.every((gate) =>
        [gate?.eastM, gate?.northM, gate?.upM, gate?.halfM, gate?.targetKtas]
          .every((value) => Number.isFinite(Number(value)))
        && Number(gate?.halfM) > 0
        && Number(gate?.targetKtas) > 0)
      && publishedGates[0]?.active === true;
    approachGateCounts.push(count);
    approachGateRecords.push(Object.freeze({ count, geometryValid }));
  }
  // A bolter resets the conventional director to all eight gates. Grade only the final attempt:
  // an earlier complete ladder cannot launder a later skip, while a complete retry may still win.
  const finalApproachStartIndex = approachGateCounts.lastIndexOf(8);
  const finalApproachGateCounts = finalApproachStartIndex >= 0
    ? approachGateCounts.slice(finalApproachStartIndex)
    : [];
  const finalApproachGateRecords = finalApproachStartIndex >= 0
    ? approachGateRecords.slice(finalApproachStartIndex)
    : [];
  const approachGatesPass = finalApproachGateCounts.length === 8
    && finalApproachGateCounts.every((count, index) => count === 8 - index);
  const approachGateGeometryPass = finalApproachGateRecords.length === 8
    && finalApproachGateRecords.every((record) => record.geometryValid);
  const approachControlSamples = rows.filter((sample) =>
    ["carrier-approach", "carrier-final"].includes(sample?.aiTargetMode)).length;
  const finalApproachSeen = rows.some((sample) => sample?.aiTargetMode === "carrier-final");

  const cleanConfigurationSeen = rows.slice(0, Math.max(0, rtbIndex)).some((sample) =>
    [sample?.gearNose, sample?.gearLeft, sample?.gearRight]
      .every((value) => Number(value) <= 0.05)
      && Math.max(finite(sample?.flapLeftDeg), finite(sample?.flapRightDeg)) <= 0.5);
  const recoveryConfiguration = (sample) =>
    [sample?.gearNose, sample?.gearLeft, sample?.gearRight]
      .every((value) => Number(value) >= 0.98)
      && Math.min(finite(sample?.flapLeftDeg), finite(sample?.flapRightDeg)) >= 20
      && String(sample?.configurationTarget ?? "").toUpperCase() === "RECOVERY";
  const recoveryRows = rtbIndex >= 0 ? rows.slice(rtbIndex) : [];
  const recoveryConfigurationSeen = recoveryRows.some(recoveryConfiguration);
  const automaticConfigurationSeen = recoveryRows.some((sample) =>
    recoveryConfiguration(sample)
      && sample?.configurationAutomatic === true
      && sample?.configurationGearAutomatic === true
      && sample?.configurationFlapAutomatic === true);
  const configurationLimitsRespected = rows.every((sample) =>
    sample?.gearLimitExceeded !== true
      && sample?.flapLimitExceeded !== true
      && sample?.flapSplit !== true);

  const sortieFinishedEventSeen = (latest.recentEvents ?? []).some((event) =>
    String(event?.type ?? "").toUpperCase() === "SORTIE_FINISHED"
      && String(event?.outcome ?? "").toUpperCase() === "VICTORY");
  const terminal = Object.freeze({
    sessionFinished: latest.sessionFinished === true
      && String(latest.sessionPhase ?? "").toUpperCase() === "FINISHED",
    victory: String(latest.sortieOutcome ?? "").toUpperCase() === "VICTORY",
    playerFlying: String(latest.playerTerminal ?? "").toUpperCase() === "FLYING",
    twoKills: finite(latest.killCount) >= openingKills + 2,
    recoveredHandoff: Number(latest.combatHandoffPhase) === 8,
    arrestedTrap: String(latest.recovery ?? "").toLowerCase() === "trap"
      && String(latest.hookOutcome ?? "").toUpperCase() === "ENGAGED"
      && Number.isInteger(Number(latest.wire))
      && Number(latest.wire) >= 1
      && Number(latest.wire) <= 4
      && String(latest.arrestPhase ?? "").toUpperCase() === "STOPPED"
      && String(latest.arrestFailureReason ?? "").toUpperCase() === "NONE",
    sortieFinishedEventSeen,
  });
  const terminalPass = Object.values(terminal).every((value) => value === true);

  return Object.freeze({
    pass: exactTwoKillProgression
      && transitions.every((transition) => transition.pass)
      && destroyedEvents.length >= 2
      && replacementTargetsDistinct
      && rtbRequestIssuedIndex >= secondKillIndex
      && rtbRequestIssuedIndex < rtbIndex
      && rtbIndex > secondKillIndex
      && pilotRtbReasonSeen
      && combatHandoffRtbSeen
      && approachGatesPass
      && approachGateGeometryPass
      && approachControlSamples >= 20
      && finalApproachSeen
      && cleanConfigurationSeen
      && recoveryConfigurationSeen
      && automaticConfigurationSeen
      && configurationLimitsRespected
      && terminalPass,
    openingKills,
    killProgression: Object.freeze(killProgression),
    exactTwoKillProgression,
    destroyedEvents,
    transitions: Object.freeze(transitions),
    replacementTargetsDistinct,
    secondKillIndex,
    rtbRequestIssuedIndex,
    rtbIndex,
    pilotRtbReasonSeen,
    combatHandoffPhases: Object.freeze(combatHandoffPhases),
    combatHandoffRtbSeen,
    approachGateCounts: Object.freeze(approachGateCounts),
    finalApproachGateCounts: Object.freeze(finalApproachGateCounts),
    approachGatesPass,
    approachGateGeometryPass,
    approachControlSamples,
    finalApproachSeen,
    cleanConfigurationSeen,
    recoveryConfigurationSeen,
    automaticConfigurationSeen,
    configurationLimitsRespected,
    terminal,
    terminalPass,
  });
}

function firstRunTarget(state) {
  const profile = firstRunValleyProfileFromState(state);
  if (!profile) return null;
  const northM = finite(state?.pz);
  const targetNorthM = Math.min(
    profile.popOutNorthM + 120,
    northM + FIRST_RUN_VALLEY_LOOKAHEAD_M,
  );
  return Object.freeze({
    x: firstRunValleyCenterEastM(profile, targetNorthM),
    y: profile.routeAltitudeM,
    z: targetNorthM,
    mode: "valley",
  });
}

/** Coordinated-turn anticipation for the authority-published valley centreline. */
export function firstRunValleyBankFeedForwardDeg(state) {
  const profile = firstRunValleyProfileFromState(state);
  if (!profile) return 0;
  const northM = finite(state?.pz);
  const stepM = FIRST_RUN_VALLEY_CURVATURE_STEP_M;
  const centerM = firstRunValleyCenterEastM(profile, northM);
  const beforeM = firstRunValleyCenterEastM(profile, northM - stepM);
  const afterM = firstRunValleyCenterEastM(profile, northM + stepM);
  const slope = (afterM - beforeM) / (2 * stepM);
  const secondDerivative = (afterM - 2 * centerM + beforeM) / (stepM * stepM);
  const curvaturePerM = secondDerivative / (1 + slope * slope) ** 1.5;
  const speedMps = Math.max(0, finite(state?.true_airspeed_kts)) * 0.514444;
  return clamp(toDegrees(Math.atan(
    FIRST_RUN_VALLEY_CURVATURE_BANK_GAIN
      * speedMps * speedMps * curvaturePerM / 9.80665,
  )), -FIRST_RUN_VALLEY_CURVATURE_BANK_LIMIT_DEG,
  FIRST_RUN_VALLEY_CURVATURE_BANK_LIMIT_DEG);
}

export function fixedWingAiTarget(state, mission = "f22") {
  if (mission === "first-run" && state?.first_run_weapons_cold === true) {
    const target = firstRunTarget(state);
    if (target) return target;
  }
  if (mission === "top-gun" && state?.player_rtb_active === true) {
    const target = topGunRecoveryTarget(state);
    if (target) return target;
  }
  if (mission === "rapier") {
    const x = Number(state?.rapier_guidance_x);
    const y = Number(state?.rapier_guidance_y);
    const z = Number(state?.rapier_guidance_z);
    if ([x, y, z].every(Number.isFinite)) {
      return Object.freeze({ x, y, z, mode: "mission-guidance" });
    }
  }
  const leadValid = state?.lead_valid === true
    && [state?.lead_x, state?.lead_y, state?.lead_z].every((value) =>
      Number.isFinite(Number(value)));
  return Object.freeze({
    x: finite(leadValid ? state.lead_x : state?.bx),
    y: finite(leadValid ? state.lead_y : state?.by),
    z: finite(leadValid ? state.lead_z : state?.bz),
    mode: leadValid ? "gun-lead" : "contact",
  });
}

/** Exact physical-body geometry for the close gun conversion controller. */
function bodyAxisLeadGeometry(state, target) {
  const forward = vector3(state?.pfx, state?.pfy, state?.pfz);
  const publishedUp = vector3(state?.plx, state?.ply, state?.plz);
  const lead = vector3(
    finite(target?.x) - finite(state?.px),
    finite(target?.y) - finite(state?.py),
    finite(target?.z) - finite(state?.pz),
  );
  if (!forward || !publishedUp || !lead) return null;
  const up = vector3(...subtractProjection3(publishedUp, forward));
  if (!up) return null;
  // World X-east/Y-up/Z-north uses up x forward as physical body-right.
  const right = vector3(...cross3(up, forward));
  if (!right) return null;
  const forwardDot = clamp(dot3(forward, lead), -1, 1);
  const offBoresightDeg = toDegrees(Math.acos(forwardDot));
  const transverse = vector3(...subtractProjection3(lead, forward));
  const rollPlaneErrorDeg = transverse
    ? toDegrees(Math.atan2(dot3(transverse, right), dot3(transverse, up)))
    : 0;
  return Object.freeze({ offBoresightDeg, rollPlaneErrorDeg });
}

/**
 * Closed-loop pursuit/route controller. Its output is a physical standard-gamepad command; the
 * browser's normal controller mapping and the simulation's normal detent/control laws remain in
 * charge. No pose, phase, damage or objective state is injected.
 */
export function fixedWingAiCommand(
  state,
  mission = "f22",
  controllerState = createFixedWingAiControllerState(),
) {
  const target = fixedWingAiTarget(state, mission);
  const dx = finite(target.x) - finite(state?.px);
  const dy = finite(target.y) - finite(state?.py);
  const dz = finite(target.z) - finite(state?.pz);
  const horizontalRangeM = Math.max(1, Math.hypot(dx, dz));
  const rawTargetElevationDeg = toDegrees(Math.atan2(dy, horizontalRangeM));
  const desiredHeadingDeg = toDegrees(Math.atan2(dx, dz));
  const headingErrorDeg = wrapAngleDeg(desiredHeadingDeg - finite(state?.heading_deg));
  const topGunRecoveryFlight = mission === "top-gun"
    && state?.player_rtb_active === true
    && target.mode?.startsWith("carrier-");
  // The canyon controller must commit early. At 400+ kt a polite 25-degree bank traverses the
  // entire 720-m floor before the nose has moved appreciably—the first live harness flight proved
  // that by hitting the outside wall on the reversal. Combat remains smoother so pursuit does not
  // thrash around a crossing target.
  const canyonFlight = mission === "first-run" && state?.first_run_weapons_cold === true;
  const bankGain = canyonFlight
    ? 2.15
    : topGunRecoveryFlight
      ? target.dirty ? 1.05 : 1.35
    : 1.18;
  const valleyBankFeedForwardDeg = canyonFlight
    ? firstRunValleyBankFeedForwardDeg(state)
    : 0;
  // Pure pursuit sees only the chord to a moving point and therefore asks for almost no bank at
  // the apex of a broad bend. Anticipate the published centreline curvature, then leave the
  // existing heading-error feedback to reject cross-track and plant disturbances.
  const topGunRecoveryBankLimitDeg = target.mode === "carrier-final" ? 18
    : target.gateCount <= 3 && target.gateCount > 0 ? 30
      : target.dirty ? 42 : 60;
  // The 68-degree cap buys a sustainable lift plane for a forward-quarter chase, where the nose
  // only has to lead a target it can already see. Behind the 3/9 line the jet is closing an angle
  // it is losing, and the existing 72-degree aft authority is what pays for it. Tape 498 applied
  // 68 everywhere and converted its first post-merge turn about 1.1 deg/s slower than Tape 495.
  //
  // Geometry alone is not enough. When the aft seam hold or an inverted recovery hands control
  // back to ordinary pursuit the jet is still at a wall-lane bank -- Tape 494 released at 74.69
  // degrees against a 75-degree sustained lane, and the inverted recovery releases at 101.3
  // degrees of heading error, aft of the 3/9 line. Re-widening to 72 on the handoff frame would
  // park the jet three degrees under the wall instead of trimming away from it. Hold the narrower
  // plane until the live pursuit side is physically captured (below), then let geometry govern.
  const f22PursuitBankLimitDeg = Math.abs(headingErrorDeg) > 90
    ? F22_AFT_PURSUIT_BANK_LIMIT_DEG
    : F22_ORDINARY_PURSUIT_BANK_LIMIT_DEG;
  let desiredBankDeg = clamp(
    headingErrorDeg * bankGain + valleyBankFeedForwardDeg,
    topGunRecoveryFlight
      ? -topGunRecoveryBankLimitDeg
      : mission === "f22" ? -f22PursuitBankLimitDeg : -78,
    topGunRecoveryFlight
      ? topGunRecoveryBankLimitDeg
      : mission === "f22" ? f22PursuitBankLimitDeg : 78,
  );
  const currentBankDeg = wrapAngleDeg(finite(state?.bank_deg));
  const reportedRollRateDps = state?.roll_rate_dps;
  const rollRateTelemetryValid = Number.isFinite(reportedRollRateDps);
  if (rollRateTelemetryValid) controllerState.lastValidRollRateDps = reportedRollRateDps;
  const currentRollRateDps = rollRateTelemetryValid
    ? reportedRollRateDps
    : finite(controllerState.lastValidRollRateDps);
  // Geometry alone cannot decide the handoff frame. When the aft seam hold or an inverted
  // recovery gives ordinary pursuit back, the jet is still at a wall-lane bank -- Tape 494
  // released at 74.69 degrees against a 75-degree sustained lane, and the inverted recovery
  // releases at 101.3 degrees of heading error, aft of the 3/9 line. Re-widening straight to 72
  // would park the jet three degrees under the wall instead of trimming away from it. Hold the
  // narrower plane across the whole physical trim -- one tick at 68 degrees is a number, not a
  // manoeuvre -- and release one-way on evidence that the live pursuit side is actually captured:
  // same side, inside the aft authority, and no longer rolling. The trim never latches a pursuit
  // side of its own, so Tape 450's negative seam sign cannot survive into a positive pursuit turn.
  const pursuitHandoffTrimHandedOff = mission === "f22"
    && (controllerState.pursuitHandoffTrimActive === true
      || controllerState.combatAftPursuitBankHoldActive === true
      || controllerState.invertedRecoveryActive === true);
  const pursuitHandoffTrimCaptured =
    Math.sign(currentBankDeg) === Math.sign(headingErrorDeg)
    && Math.abs(currentBankDeg) <= F22_AFT_PURSUIT_BANK_LIMIT_DEG
    && Math.abs(currentRollRateDps) <= COMBAT_INVERTED_RECOVERY_RELEASE_ROLL_RATE_DPS;
  const pursuitHandoffTrimActive = pursuitHandoffTrimHandedOff && !pursuitHandoffTrimCaptured;
  controllerState.pursuitHandoffTrimActive = pursuitHandoffTrimActive;
  if (pursuitHandoffTrimActive) {
    desiredBankDeg = clamp(
      desiredBankDeg,
      -F22_ORDINARY_PURSUIT_BANK_LIMIT_DEG,
      F22_ORDINARY_PURSUIT_BANK_LIMIT_DEG,
    );
  }
  const measuredActualG = state?.g_actual;
  const measuredAoaDeg = state?.aoa_deg;
  // Every large recovery-plane change is authorized by measured unloading, not by absent
  // telemetry. Fail closed on either channel so a stale browser sample cannot manufacture a
  // loaded roll and the F-22's associated aileron-rudder-interconnect kick.
  const verticalLevelUnloadSettled =
    Number.isFinite(measuredActualG)
    && Math.abs(measuredActualG) <= COMBAT_RECOVERY_ROLL_MAX_G
    && Number.isFinite(measuredAoaDeg)
    && Math.abs(measuredAoaDeg) <= COMBAT_RECOVERY_ROLL_MAX_AOA_DEG;
  const optionalLoadCommandSettled = (value) => value == null
    || (Number.isFinite(value) && Math.abs(value) <= COMBAT_PLANE_CHANGE_ARM_MAX_COMMAND_G);
  const optionalLoadCommandFighting = (value) => value == null
    || (Number.isFinite(value) && value >= F22_GUN_LEAD_FINISHER_REARM_MIN_G);
  const combatPlaneChangeUnloadSettled = Number.isFinite(measuredActualG)
    && Math.abs(measuredActualG) <= COMBAT_PLANE_CHANGE_ARM_MAX_G
    && Number.isFinite(measuredAoaDeg)
    && Math.abs(measuredAoaDeg) <= COMBAT_PLANE_CHANGE_ARM_MAX_AOA_DEG
    && optionalLoadCommandSettled(state?.requested_g_cmd)
    && optionalLoadCommandSettled(state?.g_cmd);
  // Tapes 457/471 each showed a deceptively clean observer frame followed by a residual-load
  // rebound exactly as recovery applied full aileron. Use the stricter <=2 G / <=10-degree-alpha
  // tactical permission, including requested/applied load when published, rather than the wider
  // 2.5-G recovery-settled envelope. Generic inverted and downhill recovery cross the same
  // lift-plane boundary and may not arm from Tape 471's still-loaded 2.418-G frame.
  const combatRecoveryRollPermission = combatPlaneChangeUnloadSettled;
  const storedInvertedRecoveryTargetValue =
    controllerState.invertedRecoveryTargetBankDeg;
  const storedInvertedRecoveryTargetBankDeg = storedInvertedRecoveryTargetValue == null
    ? Number.NaN
    : Number(storedInvertedRecoveryTargetValue);
  const invertedRecoveryCandidateBankDeg = (Math.sign(currentBankDeg) || 1)
    * COMBAT_INVERTED_RECOVERY_FIGHTING_BANK_DEG;
  // Latch one same-side fighting bank across the +/-180 Euler seam. Rolling all the way to zero
  // and then immediately back to +/-78 turned an ordinary overbank recovery into the 318-degree
  // unloaded revolution visible in Tape 475.
  const invertedRecoveryTargetBankDeg = controllerState.invertedRecoveryActive === true
      && Number.isFinite(storedInvertedRecoveryTargetBankDeg)
    ? wrapAngleDeg(storedInvertedRecoveryTargetBankDeg)
    : invertedRecoveryCandidateBankDeg;
  const invertedRecoveryKinematicsSettled =
    Math.abs(wrapAngleDeg(invertedRecoveryTargetBankDeg - currentBankDeg))
      <= COMBAT_INVERTED_RECOVERY_RELEASE_BANK_ERROR_DEG
    && Math.abs(currentRollRateDps)
      <= COMBAT_INVERTED_RECOVERY_RELEASE_ROLL_RATE_DPS;
  // Decide generic roll-to-level ownership from this physical frame, before any tactical mode is
  // allowed to enter. The old ordering consulted only yesterday's latch: a jet crossing 105
  // degrees could enter a new downhill slice or gun conversion for one frame before recovery
  // noticed, while an already-latched recovery could be stolen by a defensive break. One predicate
  // now owns both entry hysteresis and every tactical veto.
  const invertedRecoveryRequiredNow =
    controllerState.invertedRecoveryActive === true
      ? !invertedRecoveryKinematicsSettled || !verticalLevelUnloadSettled
      : Math.abs(currentBankDeg) > COMBAT_INVERTED_RECOVERY_ENTRY_BANK_DEG;
  const terrainPullReady = Math.abs(currentBankDeg) <= COMBAT_TERRAIN_ESCAPE_PULL_BANK_DEG
    && Math.abs(currentRollRateDps) <= COMBAT_TERRAIN_ESCAPE_PULL_ROLL_RATE_DPS;
  const maximumLoadFactorG = Math.max(1.5, finite(state?.g_maxperform, 9));
  const currentGammaDeg = finite(state?.gamma_deg);
  const currentAltitudeM = finite(state?.py);
  const combatMission = mission !== "rapier"
    && !topGunRecoveryFlight
    && !(mission === "first-run" && state?.first_run_weapons_cold === true);
  const radarAltitudeValue = state?.radar_alt_ft;
  const radarAltitudeFt = radarAltitudeValue == null
    ? Number.NaN
    : Number(radarAltitudeValue);
  const radarAltitudeValid = Number.isFinite(radarAltitudeFt) && radarAltitudeFt >= 0;
  const verticalSpeedValue = state?.vertical_speed_fpm;
  const verticalSpeedFpm = verticalSpeedValue == null
    ? Number.NaN
    : Number(verticalSpeedValue);
  const speedMps = Math.max(0, finite(state?.true_airspeed_kts)) * 0.514444;
  const inferredDescentMps = Math.max(0, -speedMps * Math.sin(toRadians(currentGammaDeg)));
  const descentMps = Number.isFinite(verticalSpeedFpm)
    ? Math.max(0, -verticalSpeedFpm / 196.8504)
    : inferredDescentMps;
  const secondsToTerrain = radarAltitudeValid && descentMps > 1
    ? radarAltitudeFt / 3.28084 / descentMps
    : Number.POSITIVE_INFINITY;
  const gcasTimeValue = state?.auto_gcas_time_available_seconds;
  const gcasTimeAvailableS = state?.auto_gcas_prediction_valid === true
      && gcasTimeValue != null
      && Number.isFinite(Number(gcasTimeValue))
    ? Number(gcasTimeValue)
    : Number.POSITIVE_INFINITY;
  const gcasViolationTimeValue = state?.auto_gcas_pilot_violation_time_seconds;
  const gcasPilotViolationTimeS = state?.auto_gcas_prediction_valid === true
      && gcasViolationTimeValue != null
      && Number.isFinite(Number(gcasViolationTimeValue))
    ? Number(gcasViolationTimeValue)
    : Number.POSITIVE_INFINITY;
  const autoGcasActive = state?.auto_gcas_active === true;
  const autoGcasWarning = state?.auto_gcas_warning === true;
  const descentTerrainThreat = mission === "first-run"
    ? secondsToTerrain <= COMBAT_TERRAIN_ESCAPE_VIOLATION_SECONDS
    : currentGammaDeg < -8
      && secondsToTerrain <= COMBAT_TERRAIN_ESCAPE_ENTER_SECONDS;
  const terrainThreat = combatMission && (
    autoGcasActive
    || autoGcasWarning
    || gcasTimeAvailableS <= COMBAT_TERRAIN_ESCAPE_PREDICTION_SECONDS
    || gcasPilotViolationTimeS <= COMBAT_TERRAIN_ESCAPE_VIOLATION_SECONDS
    || descentTerrainThreat
  );
  if (!combatMission) {
    controllerState.terrainRecoveryPhase = "idle";
    controllerState.terrainRecoveryReleaseSamples = 0;
  } else if (autoGcasActive) {
    // Auto-GCAS owns the aircraft once it commits. Any physical stick held for 0.2 seconds is a
    // deliberate pilot paddle in production, so the playerbot must release the gamepad instead of
    // cancelling the recovery it was supposed to validate.
    controllerState.terrainRecoveryPhase = "auto-gcas";
    controllerState.terrainRecoveryReleaseSamples = 0;
  } else if (controllerState.terrainRecoveryPhase === "idle" && terrainThreat) {
    controllerState.terrainRecoveryPhase = terrainPullReady
      ? "pull"
      : verticalLevelUnloadSettled ? "roll" : "unload";
    controllerState.terrainRecoveryReleaseSamples = 0;
  } else if (controllerState.terrainRecoveryPhase === "auto-gcas") {
    // The aircraft can return authority while still steeply banked. Do not turn a successful
    // automatic fly-up into a bot-commanded earthward pull on the first frame after handback.
    controllerState.terrainRecoveryPhase = !terrainPullReady
      ? verticalLevelUnloadSettled ? "roll" : "unload"
      : terrainThreat || currentGammaDeg < COMBAT_TERRAIN_ESCAPE_RELEASE_GAMMA_DEG
        ? "pull"
        : "idle";
  } else if (controllerState.terrainRecoveryPhase === "unload") {
    if (terrainPullReady) {
      controllerState.terrainRecoveryPhase = "pull";
    } else if (verticalLevelUnloadSettled) {
      controllerState.terrainRecoveryPhase = "roll";
    }
  } else if (controllerState.terrainRecoveryPhase === "roll"
      && terrainPullReady) {
    controllerState.terrainRecoveryPhase = "pull";
  } else if (controllerState.terrainRecoveryPhase === "pull") {
    if (Math.abs(currentBankDeg) > 60 && currentGammaDeg < 0) {
      controllerState.terrainRecoveryPhase = verticalLevelUnloadSettled ? "roll" : "unload";
      controllerState.terrainRecoveryReleaseSamples = 0;
    } else {
      const clearanceRecovered = !radarAltitudeValid
        || radarAltitudeFt >= COMBAT_TERRAIN_ESCAPE_RELEASE_RADAR_ALT_FT;
      const releaseCandidate = !terrainThreat
        && currentGammaDeg >= COMBAT_TERRAIN_ESCAPE_RELEASE_GAMMA_DEG
        && clearanceRecovered;
      controllerState.terrainRecoveryReleaseSamples = releaseCandidate
        ? finite(controllerState.terrainRecoveryReleaseSamples) + 1
        : 0;
      if (controllerState.terrainRecoveryReleaseSamples
          >= COMBAT_TERRAIN_ESCAPE_RELEASE_SAMPLES) {
        controllerState.terrainRecoveryPhase = "idle";
        controllerState.terrainRecoveryReleaseSamples = 0;
      }
    }
  }
  const terrainRecoveryPhase = controllerState.terrainRecoveryPhase;
  const terrainEscapeRecovery = terrainRecoveryPhase !== "idle";
  // A real browser sortie exposed a controller failure that the earlier synthetic checks could
  // not see: after a crossing merge the pursuit bank carried through inverted, while the generic
  // gamma controller continued pushing. That combination flew the harness ownship almost
  // vertically to 14.6 km. Slice toward the earth before a steep climb becomes a zoom chase.
  // Recovery is stateful: it latches one roll direction across the +/-180 Euler seam, holds the
  // earthward slice until gamma is safely negative, then levels before rejoining pursuit.
  const verticalRecoveryLeadGeometry = mission === "f22"
      && target.mode === "gun-lead"
    ? bodyAxisLeadGeometry(state, target)
    : null;
  const verticalRecoveryRangeValue = state?.range_m;
  const verticalRecoveryPublishedRangeM = verticalRecoveryRangeValue == null
    ? Number.NaN
    : Number(verticalRecoveryRangeValue);
  const verticalRecoveryPublishedRangeValid =
    Number.isFinite(verticalRecoveryPublishedRangeM)
    && verticalRecoveryPublishedRangeM > 0;
  const verticalRecoveryContactRangeM = verticalRecoveryPublishedRangeValid
    ? verticalRecoveryPublishedRangeM
    : Math.hypot(
      finite(target.x) - finite(state?.px),
      finite(target.y) - finite(state?.py),
      finite(target.z) - finite(state?.pz),
    );
  const verticalRecoveryClosureValue = state?.closure_kts;
  const verticalRecoveryClosureKts = verticalRecoveryClosureValue == null
    ? Number.NaN
    : Number(verticalRecoveryClosureValue);
  // Tape 427's safe high-altitude slice physically put the gun 1.9 degrees from lead at 782 m,
  // but the phase latch insisted on diving through -8 degrees before giving combat back. Abort
  // only for a close, controlled, nearly-on-axis shot with ample terrain clearance; ordinary
  // pursuit can never cancel the anti-zoom recovery.
  const verticalRecoveryShotOpportunity =
    controllerState.verticalRecoveryPhase === "slice"
    && verticalRecoveryLeadGeometry !== null
    && verticalRecoveryLeadGeometry.offBoresightDeg <= 6
    && verticalRecoveryContactRangeM <= 1_200
    && Number.isFinite(verticalRecoveryClosureKts)
    && verticalRecoveryClosureKts > -250
    && verticalRecoveryClosureKts < 650
    && currentGammaDeg <= 25
    && radarAltitudeValid
    && radarAltitudeFt >= 3_000;
  // Tape 449 crossed the generic 42-degree anti-zoom threshold with a captured 3.13-degree lead
  // solution at 673 m, only 35 kt opening and nearly 12,000 ft AGL. The immediate recovery threw
  // away that safe conversion for 7.5 seconds. A previously captured finisher may finish this
  // bounded high-altitude pass; losing its six-degree lane, clearance, range or 45-degree ceiling
  // restores anti-zoom authority on the current frame.
  const verticalRecoveryGunTargetKey = fixedWingGunTargetKey(state);
  const verticalRecoveryCapturedShotOpportunity =
    controllerState.verticalRecoveryPhase === "idle"
    && controllerState.gunLeadFinisherActive === true
    && controllerState.gunLeadRollCaptureActive === true
    && verticalRecoveryGunTargetKey !== null
    && verticalRecoveryGunTargetKey === controllerState.gunLeadRollCaptureTargetKey
    && Math.abs(wrapAngleDeg(
      finite(controllerState.gunLeadRollCaptureBankDeg) - currentBankDeg,
    )) <= F22_GUN_LEAD_CAPTURED_RECOVERY_MAX_BANK_ERROR_DEG
    && verticalRecoveryPublishedRangeValid
    && verticalRecoveryLeadGeometry !== null
    && verticalRecoveryLeadGeometry.offBoresightDeg <= 6
    && verticalRecoveryContactRangeM <= 1_200
    && Number.isFinite(verticalRecoveryClosureKts)
    && verticalRecoveryClosureKts > -250
    && verticalRecoveryClosureKts < 650
    && rollRateTelemetryValid
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS
    && state?.gamma_deg != null
    && Number.isFinite(Number(state.gamma_deg))
    && currentGammaDeg <= F22_GUN_LEAD_FINISHER_ENTER_GAMMA_DEG
    && state?.py != null
    && Number.isFinite(Number(state.py))
    && currentAltitudeM <= 6_200
    && radarAltitudeValid
    && radarAltitudeFt >= 3_000
    && !terrainEscapeRecovery
    && !invertedRecoveryRequiredNow;
  const verticalRecoveryImmediateGunThreat = state?.opponent_gun_firing === true
    || state?.formation_gun_firing === true
    || [1, 2, 3].some((index) =>
      Number(state?.[`w${index}_trigger_down`]) === 1
        || Number(state?.[`w${index}_gun_firing`]) === 1);
  const verticalRecoveryDefensivePreemption = mission === "f22"
    && (finite(controllerState.combatDefensiveBreakSamples) > 0
      || verticalRecoveryImmediateGunThreat);
  const verticalRecoveryEntry = combatMission && !terrainEscapeRecovery
    && !verticalRecoveryCapturedShotOpportunity
    && !verticalRecoveryDefensivePreemption
    && (currentGammaDeg > 42 || (currentAltitudeM > 6_200 && currentGammaDeg > 24));
  const verticalRecoveryBankErrorDeg = Math.abs(wrapAngleDeg(
    (controllerState.verticalRecoverySliceSign || 1)
      * COMBAT_VERTICAL_RECOVERY_BANK_DEG - currentBankDeg,
  ));
  const verticalRecoveryPullDriftedFromPlane =
    controllerState.verticalRecoveryPhase === "slice"
    && controllerState.verticalRecoveryPullActive === true
    && verticalRecoveryBankErrorDeg > COMBAT_VERTICAL_RECOVERY_PLANE_DRIFT_DEG;
  if (verticalRecoveryPullDriftedFromPlane) {
    // A true inverted pull should remain symmetric. If coupling moves it more than ten degrees,
    // abort the split-S instead of recreating Tape 473's pull/unload/recapture cycle. Hold the
    // physical plane until load decays, roll upright once safe, and retain recovery ownership
    // until gamma is below the entry hysteresis.
    controllerState.verticalRecoveryPhase = "level";
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = verticalLevelUnloadSettled;
  }
  if (!combatMission) {
    controllerState.verticalRecoveryPhase = "idle";
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = false;
  } else if (terrainEscapeRecovery) {
    controllerState.verticalRecoveryPhase = "idle";
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = false;
  } else if (verticalRecoveryDefensivePreemption) {
    // Tape 472 acquired and held a valid low-plane defense for eight seconds, then the generic
    // 42-degree anti-zoom entry stole control at 448 m. It unloaded to 0.36 G and rolled toward
    // the old oblique slice while the bandit fired the lethal burst. Terrain recovery still outranks combat,
    // but an ordinary zoom guard must wait until the active projectile-flight defense releases.
    controllerState.verticalRecoveryPhase = "idle";
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = false;
  } else if (controllerState.verticalRecoveryPhase === "idle" && verticalRecoveryEntry) {
    controllerState.verticalRecoveryPhase = "slice";
    controllerState.verticalRecoverySliceRollArmed = verticalLevelUnloadSettled;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = false;
    controllerState.verticalRecoverySliceSign = Math.sign(Math.abs(currentBankDeg) > 4
      ? currentBankDeg
      : headingErrorDeg || 1) || 1;
  } else if (verticalRecoveryShotOpportunity) {
    controllerState.verticalRecoveryPhase = "idle";
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = false;
  } else if (controllerState.verticalRecoveryPhase === "slice" && currentGammaDeg <= -8) {
    controllerState.verticalRecoveryPhase = "level";
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = verticalLevelUnloadSettled;
  } else if (controllerState.verticalRecoveryPhase === "slice"
      && controllerState.verticalRecoveryPullActive !== true
      && controllerState.verticalRecoverySliceRollArmed === true
      && !verticalLevelUnloadSettled) {
    // Permission is current, not historical. A delayed load response after the first neutral-stick
    // frame must pause the roll rather than turning one safe sample into a loaded plane change.
    controllerState.verticalRecoverySliceRollArmed = false;
  } else if (controllerState.verticalRecoveryPhase === "slice"
      && controllerState.verticalRecoverySliceRollArmed !== true
      && verticalLevelUnloadSettled) {
    controllerState.verticalRecoverySliceRollArmed = true;
  } else if (controllerState.verticalRecoveryPhase === "level"
      && controllerState.verticalRecoveryLevelRollArmed === true
      && !verticalLevelUnloadSettled) {
    controllerState.verticalRecoveryLevelRollArmed = false;
  } else if (controllerState.verticalRecoveryPhase === "level"
      && controllerState.verticalRecoveryLevelRollArmed !== true
      && verticalLevelUnloadSettled) {
    controllerState.verticalRecoveryLevelRollArmed = true;
  } else if (controllerState.verticalRecoveryPhase === "level"
      && controllerState.verticalRecoveryLevelRollArmed === true
      && Math.abs(currentBankDeg) <= COMBAT_VERTICAL_LEVEL_RELEASE_BANK_DEG
      && Math.abs(currentRollRateDps)
        <= COMBAT_VERTICAL_LEVEL_RELEASE_ROLL_RATE_DPS
      && currentGammaDeg <= 24) {
    controllerState.verticalRecoveryPhase = "idle";
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
    controllerState.verticalRecoveryLevelRollArmed = false;
  }
  const verticalRecoveryPhase = controllerState.verticalRecoveryPhase;
  const verticalRecoverySliceRollArmed = verticalRecoveryPhase === "slice"
    && controllerState.verticalRecoverySliceRollArmed === true;
  const verticalRecoverySliceTargetCaptured = verticalRecoveryPhase === "slice"
    && rollRateTelemetryValid
    && Math.abs(wrapAngleDeg(
      (controllerState.verticalRecoverySliceSign || 1)
        * COMBAT_VERTICAL_RECOVERY_BANK_DEG - currentBankDeg,
    )) <= (controllerState.verticalRecoveryRecaptureActive === true
      ? COMBAT_VERTICAL_RECOVERY_RECAPTURE_BANK_ERROR_DEG
      : COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG)
    && Math.abs(currentRollRateDps) <= COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS;
  if (verticalRecoveryPhase === "slice"
      && verticalRecoverySliceRollArmed
      && controllerState.verticalRecoveryPullActive !== true
      && verticalRecoverySliceTargetCaptured) {
    // Tape 459 crossed the old broad 105-degree / 30-dps gate on its way to the authored
    // 118-degree slice. Pull then rebuilt to 5.7 G while the jet overshot through 125 degrees and
    // the roll loop tried to recenter at high alpha. Require capture of this recovery's actual
    // target; the downhill tactical slice uses its own exact gate below. Once earned,
    // keep the pull latched so ordinary roll/pitch coupling cannot turn into pitch chatter.
    controllerState.verticalRecoveryPullActive = true;
    controllerState.verticalRecoveryRecaptureActive = false;
  } else if (verticalRecoveryPhase !== "slice") {
    controllerState.verticalRecoverySliceRollArmed = false;
    controllerState.verticalRecoveryPullActive = false;
    controllerState.verticalRecoveryRecaptureActive = false;
  }
  const verticalRecoveryPullActive =
    controllerState.verticalRecoveryPullActive === true;
  const verticalEscapeRecovery = verticalRecoveryPhase !== "idle";
  const escapeRecovery = terrainEscapeRecovery || verticalEscapeRecovery;
  const firingWingmanIndex = [1, 2, 3].find((index) =>
    Number(state?.[`w${index}_trigger_down`]) === 1
      || Number(state?.[`w${index}_gun_firing`]) === 1);
  const primaryRelativeX = Number(state?.bx) - finite(state?.px);
  const primaryRelativeY = Number(state?.by) - finite(state?.py);
  const primaryRelativeZ = Number(state?.bz) - finite(state?.pz);
  const primaryHorizontalRangeM = Math.hypot(primaryRelativeX, primaryRelativeZ);
  const primaryShooterElevationDeg = Number.isFinite(primaryRelativeY)
    ? toDegrees(Math.atan2(primaryRelativeY, primaryHorizontalRangeM))
    : null;
  const primaryRangeM = Math.hypot(
    primaryRelativeX,
    primaryRelativeY,
    primaryRelativeZ,
  );
  const primaryForwardX = Number(state?.bfx);
  const primaryForwardY = Number(state?.bfy);
  const primaryForwardZ = Number(state?.bfz);
  const primaryForwardMagnitude = Math.hypot(
    primaryForwardX,
    primaryForwardY,
    primaryForwardZ,
  );
  const primaryNoseDot = primaryRangeM > 1e-6 && primaryForwardMagnitude > 1e-6
    ? clamp((
      primaryForwardX * -primaryRelativeX
        + primaryForwardY * -primaryRelativeY
        + primaryForwardZ * -primaryRelativeZ
    ) / (primaryForwardMagnitude * primaryRangeM), -1, 1)
    : Number.NaN;
  const primaryOpponentNoseErrorDeg = Number.isFinite(primaryNoseDot)
    ? toDegrees(Math.acos(primaryNoseDot))
    : null;
  const defensiveBanditEntityId = state?.bandit_entity_id == null
    ? null
    : String(state.bandit_entity_id).trim() || null;
  const defensiveSelectedTargetSlot = Number(state?.selected_player_gun_target_slot);
  const defensiveEngagementNumber = Number(state?.engagement_number);
  const defensivePrimaryTargetKey = defensiveBanditEntityId !== null
    ? `entity:${defensiveBanditEntityId}`
    : Number.isInteger(defensiveSelectedTargetSlot)
        && Number.isInteger(defensiveEngagementNumber)
      ? `engagement:${defensiveEngagementNumber}:slot:${defensiveSelectedTargetSlot}`
      : "primary";
  const defensivePrimaryTargetChanged =
    controllerState.combatDefensivePrimaryTargetKey !== null
    && controllerState.combatDefensivePrimaryTargetKey !== defensivePrimaryTargetKey;
  if (defensivePrimaryTargetChanged) {
    controllerState.combatDefensiveLastPrimaryNoseErrorDeg = null;
    controllerState.combatDefensivePrimaryAimSamples = 0;
    controllerState.combatOffensivePressSamples = 0;
    controllerState.combatOffensivePressExhausted = false;
    controllerState.combatOffensivePressLastLeadOffBoresightDeg = null;
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
      COMBAT_DEFENSIVE_BASE_BANK_DEG;
    controllerState.combatDefensiveLowPlaneSamples = 0;
    controllerState.combatDefensiveLowPlaneComplete = false;
    controllerState.combatDefensiveGunfireBankHoldActive = false;
    controllerState.combatDefensiveHighPlaneReleaseSamples = 0;
    controllerState.combatDefensiveHighPlaneComplete = false;
    controllerState.combatDefensiveHighPlaneRecoveryActive = false;
  }
  controllerState.combatDefensivePrimaryTargetKey = defensivePrimaryTargetKey;
  // Tape 425 was killed by the selected bandit, not a formation wingman. Waiting for its first
  // tracer left only ~0.6 s before three lethal hits. Tape 426 proved that position alone was too
  // blunt: an aft bandit is often merely across the circle, and that rule consumed 806 defensive
  // samples without a shot. Tape 432 then showed both halves of the missing contract: an earlier
  // 1.1 km pass had a close nose which was diverging, while the lethal pass converged below ten
  // degrees from 1.67 km. Tape 436 added a tighter exception: within 700 m, 30 degrees of six and
  // 200 m vertically, a slowly opening bandit narrowing its nose is already a threat even below
  // the old closure gate. Give that corridor a 50-degree acquisition cone. Tape 454 then exposed
  // a point-blank reacquisition seam: a bandit at 312 m, 138.5 degrees aft and only 10.5 knots
  // closure was already narrowing through 44.4 degrees, but missed both the 150-degree rear gate
  // and the 150-knot ordinary gate. Admit that smaller 400 m / 135-degree corridor at positive
  // closure and 45 degrees of nose error. All other passes keep the prior contracts; gunfire
  // itself remains immediate.
  const primaryAimClosureKts = Number(state?.closure_kts);
  const primaryRelativeBearingDeg = wrapAngleDeg(
    toDegrees(Math.atan2(primaryRelativeX, primaryRelativeZ))
      - finite(state?.heading_deg),
  );
  const primaryCloseRearTrackingGeometry = primaryRangeM <= 700
    && Math.abs(primaryRelativeY) <= 200
    && Math.abs(primaryRelativeBearingDeg) >= 150
    && Number.isFinite(primaryAimClosureKts)
    && primaryAimClosureKts > -50;
  const primaryPointBlankRearReacquisitionGeometry =
    primaryRangeM <= COMBAT_DEFENSIVE_REACQUISITION_MAX_RANGE_M
    && Math.abs(primaryRelativeY) <= COMBAT_DEFENSIVE_REACQUISITION_MAX_VERTICAL_M
    && Math.abs(primaryRelativeBearingDeg)
      >= COMBAT_DEFENSIVE_REACQUISITION_MIN_REAR_BEARING_DEG
    && Number.isFinite(primaryAimClosureKts)
    && primaryAimClosureKts > 0;
  // Tape 463 sat in the gap between the two existing rear-threat lanes: 600..505 m,
  // 135..137 degrees aft, about 100 knots of closure, and a precisely narrowing 12.7..6.5-degree
  // nose. The 400 m point-blank lane was still too far away, while the broader 700 m lane asked
  // for 150 degrees aft. Add only the missing precision corridor; its tight 15-degree nose gate
  // and existing two-sample non-diverging dwell do not turn an ordinary rear-quarter pass into a
  // threat.
  const primaryPrecisionRearQuarterGeometry =
    primaryRangeM <= COMBAT_DEFENSIVE_PRECISION_REAR_MAX_RANGE_M
    && Math.abs(primaryRelativeY) <= COMBAT_DEFENSIVE_PRECISION_REAR_MAX_VERTICAL_M
    && Math.abs(primaryRelativeBearingDeg)
      >= COMBAT_DEFENSIVE_PRECISION_REAR_MIN_BEARING_DEG
    && Number.isFinite(primaryAimClosureKts)
    && primaryAimClosureKts > COMBAT_DEFENSIVE_PRECISION_REAR_MIN_CLOSURE_KTS;
  const primaryRearTrackingGeometry = primaryCloseRearTrackingGeometry
    || primaryPointBlankRearReacquisitionGeometry
    || primaryPrecisionRearQuarterGeometry;
  const primaryAimGeometryEligible = state?.opponent_present === true
    && state?.opponent_alive === true
    && Number.isFinite(primaryOpponentNoseErrorDeg)
    && primaryRangeM <= 1_600
    && Math.abs(primaryRelativeY) <= 600
    && Number.isFinite(primaryAimClosureKts)
    && (primaryAimClosureKts > 150 || primaryRearTrackingGeometry);
  const primaryAimAngleGateDeg = primaryCloseRearTrackingGeometry
    ? 50
    : primaryPointBlankRearReacquisitionGeometry
      ? COMBAT_DEFENSIVE_REACQUISITION_MAX_NOSE_ERROR_DEG
      : primaryPrecisionRearQuarterGeometry
        ? COMBAT_DEFENSIVE_PRECISION_REAR_MAX_NOSE_ERROR_DEG
      : primaryRangeM <= 1_100 ? 30 : 10;
  const previousPrimaryNoseErrorDeg =
    Number.isFinite(controllerState.combatDefensiveLastPrimaryNoseErrorDeg)
      ? controllerState.combatDefensiveLastPrimaryNoseErrorDeg
      : null;
  const primaryAimNotDiverging = primaryAimGeometryEligible
    && Number.isFinite(previousPrimaryNoseErrorDeg)
    && primaryOpponentNoseErrorDeg <= previousPrimaryNoseErrorDeg + 0.05;
  const primaryAimCandidate = primaryAimGeometryEligible
    && primaryOpponentNoseErrorDeg <= primaryAimAngleGateDeg;
  if (!primaryAimGeometryEligible) {
    controllerState.combatDefensiveLastPrimaryNoseErrorDeg = null;
    controllerState.combatDefensivePrimaryAimSamples = 0;
  } else {
    controllerState.combatDefensivePrimaryAimSamples =
      primaryAimCandidate
          && (previousPrimaryNoseErrorDeg === null || primaryAimNotDiverging)
        ? finite(controllerState.combatDefensivePrimaryAimSamples) + 1
        : 0;
    controllerState.combatDefensiveLastPrimaryNoseErrorDeg =
      primaryOpponentNoseErrorDeg;
  }
  const primaryAimingThreat =
    finite(controllerState.combatDefensivePrimaryAimSamples) >= 2;
  const primaryCloseRearTrackingThreat = primaryAimingThreat
    && primaryRearTrackingGeometry
    && primaryAimClosureKts <= 150;
  const primaryPointBlankRearReacquisitionThreat = primaryAimingThreat
    && primaryPointBlankRearReacquisitionGeometry
    && !primaryCloseRearTrackingGeometry
    && primaryAimClosureKts <= 150;
  const primaryPrecisionRearQuarterThreat = primaryAimingThreat
    && primaryPrecisionRearQuarterGeometry
    && !primaryCloseRearTrackingGeometry
    && !primaryPointBlankRearReacquisitionGeometry
    && primaryAimClosureKts <= 150;
  const rearThreatWingmanIndex = [1, 2, 3].find((index) => {
    if (Number(state?.[`w${index}_present`]) !== 1
        || Number(state?.[`w${index}_alive`]) !== 1) return false;
    const wingmanX = Number(state?.[`w${index}x`]);
    const wingmanY = Number(state?.[`w${index}y`]);
    const wingmanZ = Number(state?.[`w${index}z`]);
    if (![wingmanX, wingmanY, wingmanZ].every(Number.isFinite)) return false;
    const relativeX = wingmanX - finite(state?.px);
    const relativeY = wingmanY - finite(state?.py);
    const relativeZ = wingmanZ - finite(state?.pz);
    const bearingDeg = wrapAngleDeg(
      toDegrees(Math.atan2(relativeX, relativeZ)) - finite(state?.heading_deg),
    );
    return Math.hypot(relativeX, relativeY, relativeZ) <= 1_100
      && Math.abs(relativeY) <= 600
      && Math.abs(bearingDeg) >= 120;
  });
  const defensiveWingmanIndex = firingWingmanIndex ?? rearThreatWingmanIndex;
  const defensiveShooterRelativeX = defensiveWingmanIndex === undefined
    ? primaryRelativeX
    : Number(state?.[`w${defensiveWingmanIndex}x`]) - finite(state?.px);
  const defensiveShooterRelativeY = defensiveWingmanIndex === undefined
    ? primaryRelativeY
    : Number(state?.[`w${defensiveWingmanIndex}y`]) - finite(state?.py);
  const defensiveShooterRelativeZ = defensiveWingmanIndex === undefined
    ? primaryRelativeZ
    : Number(state?.[`w${defensiveWingmanIndex}z`]) - finite(state?.pz);
  const defensiveShooterHorizontalRangeM = Math.hypot(
    defensiveShooterRelativeX,
    defensiveShooterRelativeZ,
  );
  const defensiveShooterElevationDeg = Number.isFinite(defensiveShooterRelativeY)
      && Number.isFinite(defensiveShooterHorizontalRangeM)
    ? toDegrees(Math.atan2(
      defensiveShooterRelativeY,
      defensiveShooterHorizontalRangeM,
    ))
    : null;
  const hostileGunFiring = state?.opponent_gun_firing === true
    || state?.formation_gun_firing === true
    || firingWingmanIndex !== undefined;
  // Tape 477 had an incumbent, captured gun conversion at 1,008 m and 2.05 degrees of ballistic
  // lead error. A loose two-sample prediction declared the bandit dangerous at 28 degrees of nose
  // error, a full second before its first round, and discarded the only maturing attack. Preserve
  // at most 350 ms of that already-earned press while lead continues to converge. This never
  // outranks real gunfire, a rear-quarter contact, recovery, a 20-degree nose, or worsening axis
  // geometry; those threats still preempt on the same control frame.
  const defensiveOwnLeadGeometry = mission === "f22"
      && target.mode === "gun-lead"
    ? bodyAxisLeadGeometry(state, target)
    : null;
  const defensiveOwnRangeValue = Number(state?.range_m);
  const defensiveOwnRangeM = Number.isFinite(defensiveOwnRangeValue)
      && defensiveOwnRangeValue > 0
    ? defensiveOwnRangeValue
    : primaryRangeM;
  const rawPreviousOffensivePressLeadErrorDeg =
    controllerState.combatOffensivePressLastLeadOffBoresightDeg;
  const previousOffensivePressLeadErrorDeg =
      rawPreviousOffensivePressLeadErrorDeg == null
    ? Number.NaN
    : Number(rawPreviousOffensivePressLeadErrorDeg);
  const defensiveOwnLeadErrorDeg = defensiveOwnLeadGeometry?.offBoresightDeg;
  const defensiveOwnLeadNonDiverging = Number.isFinite(defensiveOwnLeadErrorDeg)
    && Number.isFinite(previousOffensivePressLeadErrorDeg)
    && defensiveOwnLeadErrorDeg <= previousOffensivePressLeadErrorDeg + 0.05;
  const offensivePressWasActive = finite(
    controllerState.combatOffensivePressSamples,
  ) > 0;
  const offensivePressLeadGateDeg = offensivePressWasActive
    ? COMBAT_OFFENSIVE_PRESS_HOLD_LEAD_ERROR_DEG
    : COMBAT_OFFENSIVE_PRESS_MAX_LEAD_ERROR_DEG;
  const combatOffensivePressCandidate = primaryAimingThreat
    && controllerState.gunLeadFinisherActive === true
    && controllerState.gunLeadRollCaptureActive === true
    && defensiveOwnLeadNonDiverging
    && defensiveOwnLeadErrorDeg <= offensivePressLeadGateDeg
    && defensiveOwnRangeM >= COMBAT_OFFENSIVE_PRESS_MIN_RANGE_M
    && defensiveOwnRangeM <= COMBAT_OFFENSIVE_PRESS_MAX_RANGE_M
    && Number.isFinite(primaryAimClosureKts)
    && primaryAimClosureKts > 0
    && primaryAimClosureKts < COMBAT_OFFENSIVE_PRESS_MAX_CLOSURE_KTS
    && Number.isFinite(primaryOpponentNoseErrorDeg)
    && primaryOpponentNoseErrorDeg
      > COMBAT_OFFENSIVE_PRESS_MIN_OPPONENT_NOSE_ERROR_DEG
    && Math.abs(currentRollRateDps) <= COMBAT_OFFENSIVE_PRESS_MAX_ROLL_RATE_DPS
    && !primaryRearTrackingGeometry
    && rearThreatWingmanIndex === undefined
    && !hostileGunFiring
    && !escapeRecovery
    && !invertedRecoveryRequiredNow
    && controllerState.combatDownhillSliceActive !== true
    && controllerState.combatDownhillRecoveryPhase === "idle";
  const incumbentGunAttackTracking = controllerState.gunLeadFinisherActive === true
    && controllerState.gunLeadRollCaptureActive === true
    && Number.isFinite(defensiveOwnLeadErrorDeg);
  if (!incumbentGunAttackTracking) {
    controllerState.combatOffensivePressSamples = 0;
    controllerState.combatOffensivePressExhausted = false;
  } else if (combatOffensivePressCandidate
      && controllerState.combatOffensivePressExhausted !== true
      && finite(controllerState.combatOffensivePressSamples)
        < COMBAT_OFFENSIVE_PRESS_MAX_SAMPLES) {
    controllerState.combatOffensivePressSamples =
      finite(controllerState.combatOffensivePressSamples) + 1;
  } else if (combatOffensivePressCandidate
      && finite(controllerState.combatOffensivePressSamples)
        >= COMBAT_OFFENSIVE_PRESS_MAX_SAMPLES) {
    // The allowance belongs to one continuous captured attack, not one uninterrupted threat
    // indication. Keep the spent budget latched if the two-sample aim predictor blinks for a
    // frame; otherwise a noisy 30-degree nose gate can manufacture an unlimited attack press.
    controllerState.combatOffensivePressExhausted = true;
  }
  const combatOffensivePressActive = combatOffensivePressCandidate
    && controllerState.combatOffensivePressExhausted !== true
    && finite(controllerState.combatOffensivePressSamples) > 0;
  controllerState.combatOffensivePressLastLeadOffBoresightDeg =
    incumbentGunAttackTracking ? defensiveOwnLeadErrorDeg : null;
  const hostileGunThreat = hostileGunFiring
    || (primaryAimingThreat && !combatOffensivePressActive)
    || rearThreatWingmanIndex !== undefined;
  const primaryGunFiring = state?.opponent_gun_firing === true;
  const committedBreakSign = Math.sign(
    finite(
      controllerState.combatDefensiveLastCommittedBreakSign,
      finite(controllerState.combatDefensiveBreakSign, 1),
    ),
  ) || 1;
  const combatDefensiveBreakWasActive = combatMission
    && finite(controllerState.combatDefensiveBreakSamples) > 0;
  let combatDefensiveNoseHighLateralPlanePreserved = false;
  let combatDefensiveCloseRearCurrentPlanePreserved = false;
  let combatDefensiveOverbankedRearNearestPlanePreserved = false;
  const defensiveBreakPlaneMagnitudeForCurrentThreat = () => {
    const defensiveShooterClearlyAbove = defensiveShooterRelativeY
        >= COMBAT_DEFENSIVE_HIGH_SHOOTER_MIN_VERTICAL_M
      && defensiveShooterElevationDeg
        >= Math.max(
          COMBAT_DEFENSIVE_HIGH_SHOOTER_MIN_ELEVATION_DEG,
          currentGammaDeg
            + COMBAT_DEFENSIVE_HIGH_SHOOTER_MIN_ABOVE_FLIGHT_PATH_DEG,
        );
    const defensiveBreakSign = Math.sign(
      finite(controllerState.combatDefensiveBreakSign, 1),
    ) || 1;
    const lowPlaneBankErrorDeg = Math.abs(wrapAngleDeg(
      defensiveBreakSign * COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG - currentBankDeg,
    ));
    const highPlaneBankErrorDeg = Math.abs(wrapAngleDeg(
      defensiveBreakSign * COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG - currentBankDeg,
    ));
    const urgentRearNeedsShortPlane = primaryRearTrackingGeometry
      && primaryAimClosureKts <= 150
      && highPlaneBankErrorDeg > lowPlaneBankErrorDeg
        + COMBAT_DEFENSIVE_URGENT_HIGH_PLANE_EXTRA_ROLL_DEG;
    if (defensiveShooterClearlyAbove && !urgentRearNeedsShortPlane) {
      return COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG;
    }
    const noseHighLateralPlaneAlreadyCaptured =
      controllerState.invertedRecoveryActive === true
      && !invertedRecoveryRequiredNow
      && currentGammaDeg >= COMBAT_DEFENSIVE_NOSE_HIGH_LATERAL_MIN_GAMMA_DEG
      && Number.isFinite(defensiveShooterElevationDeg)
      && currentGammaDeg - defensiveShooterElevationDeg
        >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_RELATIVE_ELEVATION_DEG
      && Math.sign(currentBankDeg) === defensiveBreakSign
      && Math.abs(wrapAngleDeg(
        defensiveBreakSign * COMBAT_DEFENSIVE_BASE_BANK_DEG - currentBankDeg,
      )) <= COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG
      && Math.abs(currentRollRateDps) <= COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS;
    if (noseHighLateralPlaneAlreadyCaptured) {
      // Tape 486 had already completed a same-side recovery into +70.75 degrees at a 19.6-degree
      // climb when the threat owner arrived. Replacing that captured lateral plane with +55
      // authored another unload/roll interval, then pulled the jet into a predictable 56-degree
      // climb. Preserve the available fighting plane and begin defensive G immediately.
      combatDefensiveNoseHighLateralPlanePreserved = true;
      // This is an episode decision, not a one-frame convenience. A later aim pulse or a small
      // gamma/rate wobble must not reselect 55 degrees underneath the established pull.
      controllerState.combatDefensiveLowPlaneComplete = true;
      return COMBAT_DEFENSIVE_BASE_BANK_DEG;
    }
    return COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG;
  };
  if (!combatMission) {
    controllerState.combatDefensiveBreakSamples = 0;
    controllerState.combatDefensiveBreakHasCommitted = false;
    controllerState.combatDefensiveLastCommittedBreakSign = null;
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
      COMBAT_DEFENSIVE_BASE_BANK_DEG;
    controllerState.combatDefensiveHighPlaneReleaseSamples = 0;
    controllerState.combatDefensiveHighPlaneComplete = false;
    controllerState.combatDefensiveHighPlaneRecoveryActive = false;
  } else if (hostileGunThreat) {
    if (finite(controllerState.combatDefensiveBreakSamples) <= 0) {
      controllerState.combatDefensiveHighPlaneReleaseSamples = 0;
      controllerState.combatDefensiveHighPlaneComplete = false;
      controllerState.combatDefensiveHighPlaneRecoveryActive = false;
      controllerState.combatDefensiveLowPlaneSamples = 0;
      controllerState.combatDefensiveLowPlaneComplete = false;
      controllerState.combatDefensiveGunfireBankHoldActive = false;
      const currentBankSign = Math.sign(currentBankDeg);
      const currentSideLowPlaneBankErrorDeg = currentBankSign === 0
        ? Number.POSITIVE_INFINITY
        : Math.abs(wrapAngleDeg(
          currentBankSign * COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG - currentBankDeg,
        ));
      const oppositeSideLowPlaneBankErrorDeg = currentBankSign === 0
        ? Number.POSITIVE_INFINITY
        : Math.abs(wrapAngleDeg(
          -currentBankSign * COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG - currentBankDeg,
        ));
      const overbankedRearNeedsNearestPlane = primaryRearTrackingGeometry
        && !hostileGunFiring
        && Math.abs(currentBankDeg) >= COMBAT_INVERTED_RECOVERY_ENTRY_BANK_DEG
        && currentSideLowPlaneBankErrorDeg + 30
          < oppositeSideLowPlaneBankErrorDeg;
      if (overbankedRearNeedsNearestPlane) {
        // Tape 494 acquired a 150-degree rear shooter while the jet was already at -112 degrees.
        // The bearing sat one tenth of a degree outside the direct-aft seam, so alternating to +55
        // demanded a 167-degree unloaded roll and delivered a steady target at 245 m. Finish the
        // existing inward recovery toward the nearer -55 plane; this is still an unloaded change,
        // but it cannot choose the long way around the horizon on a threshold wobble.
        controllerState.combatDefensiveBreakSign = currentBankSign;
        combatDefensiveOverbankedRearNearestPlanePreserved = true;
      } else if (controllerState.combatDefensiveBreakHasCommitted === true
          && primaryCloseRearTrackingThreat
          && !hostileGunFiring) {
        const currentLowPlaneBankErrorDeg = currentBankSign === 0
          ? Number.POSITIVE_INFINITY
          : currentSideLowPlaneBankErrorDeg;
        const currentLowPlaneAlreadyAvailable = currentLowPlaneBankErrorDeg
          <= COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG;
        // A repeated close-rear pass normally alternates away from the predictable prior circle.
        // Tape 488 arrived with the +55-degree fighting plane already beneath the jet, however;
        // alternating there demanded a lethal 106-degree unloaded reversal. Retain a physically
        // available low plane, brake its body rate through the existing interlock, then pull.
        controllerState.combatDefensiveBreakSign = currentLowPlaneAlreadyAvailable
          ? currentBankSign : -committedBreakSign;
        combatDefensiveCloseRearCurrentPlanePreserved = currentLowPlaneAlreadyAvailable;
      } else {
        const shooterHeadingErrorDeg = wrapAngleDeg(
          toDegrees(Math.atan2(defensiveShooterRelativeX, defensiveShooterRelativeZ))
            - finite(state?.heading_deg),
        );
        // High-closure threats must solve the physical attacker side afresh. Tape 437 already had
        // the correct -79-degree bank against a shooter at -78 degrees; blindly alternating that
        // episode caused a two-second unloaded reversal. Directly astern is the only +/-180 seam:
        // keep an established bank there, otherwise break into the attacker to grow LOS rate.
        controllerState.combatDefensiveBreakSign = Math.abs(shooterHeadingErrorDeg) > 150
            && Math.abs(currentBankDeg) > 20
          ? Math.sign(currentBankDeg)
          : Math.sign(shooterHeadingErrorDeg) || Math.sign(currentBankDeg) || 1;
      }
    }
    if ((primaryAimingThreat || primaryGunFiring) && !escapeRecovery
        && !invertedRecoveryRequiredNow
        && controllerState.combatDownhillSliceActive !== true
        && controllerState.combatDownhillRecoveryPhase === "idle"
        && controllerState.combatDefensiveGunfireBankHoldActive !== true
        && controllerState.combatDefensiveLowPlaneComplete !== true
        && controllerState.combatDefensiveHighPlaneComplete !== true
        && finite(controllerState.combatDefensiveBreakPlaneMagnitudeDeg,
          COMBAT_DEFENSIVE_BASE_BANK_DEG) === COMBAT_DEFENSIVE_BASE_BANK_DEG) {
      // Tapes 444-446 had a shooter below; their old 78-degree circle displaced only 4.9-7.4 m
      // during first-round flight, while a same-sign 55-degree climb projects 9.8-15 m. Tape 447
      // supplied the missing mirror case: its attacker began 231 m / 19 degrees above, and the
      // universal climb drove ownship straight into the gun line. Choose the vertical plane once
      // per threat episode and pull away from the shooter. The deadbands keep near-level noise from
      // switching the choice, and the latched magnitude prevents aim telemetry from chattering it.
      // Tapes 471/472 then exposed the missing reference frame: their attackers were above the
      // aircraft but six degrees below its 12-13-degree climbing flight path. Calling that a high
      // shooter authored the entire 112-degree knife-edge sequence the player saw. The bounded
      // 82-degree high plane now requires the attacker to be materially above the path the jet is
      // actually flying. An already-owned recovery completes first: selecting either 55 or 82
      // degrees while a
      // downhill slice is travelling toward zero stores a proposal the aircraft never flew. Tape
      // 459 later handed that stale 55-degree proposal control after the aim pulse had vanished,
      // replacing the neutral 78-degree break that had actually earned the handoff. Continuous
      // threat ownership may choose a vertical plane only after every recovery owner releases.
      // Tape 455 acquired a slow-closing rear shooter at 558 m while nearly wings-level. The
      // old vertical rule selected +112 degrees, forcing 2.4 seconds of unload and roll before the
      // first defensive G; the attacker fired four honest rounds during the resulting predictable
      // plane and landed three. A close-rear threat does not have time for that extra half-roll.
      // Keep the bounded high plane when it is already nearby (Tape 447 entered at +76 degrees),
      // but choose the same-side 55-degree break when reaching it would cost over 30 additional
      // degrees of roll. The normal measured-load interlock still owns either transition.
      controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
        defensiveBreakPlaneMagnitudeForCurrentThreat();
    }
    // The GSh envelope permits about 1.05 s time of flight after trigger release. Keep defensive
    // ownership for 1.6 s at the validated 20 Hz cadence so an off pulse cannot hand airborne
    // rounds a steady pursuit target. Primary fire reinforces the selected vertical plane.
    controllerState.combatDefensiveBreakSamples = 32;
  } else {
    controllerState.combatDefensiveBreakSamples = Math.max(
      0,
      finite(controllerState.combatDefensiveBreakSamples) - 1,
    );
  }
  const combatDefensiveBreakActive = combatMission
    && finite(controllerState.combatDefensiveBreakSamples) > 0;
  if (!combatDefensiveBreakActive) {
    controllerState.combatDefensiveLowPlaneSamples = 0;
    controllerState.combatDefensiveLowPlaneComplete = false;
    controllerState.combatDefensiveGunfireBankHoldActive = false;
  }
  const combatDefensiveHighPlaneRecoveryTargetBankDeg =
    (controllerState.combatDefensiveBreakSign || 1) * COMBAT_DEFENSIVE_BASE_BANK_DEG;
  const combatDefensiveHighPlaneRecoverySettled =
    controllerState.combatDefensiveHighPlaneRecoveryActive === true
    && rollRateTelemetryValid
    && Math.abs(wrapAngleDeg(
      combatDefensiveHighPlaneRecoveryTargetBankDeg - currentBankDeg,
    )) <= COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG
    && Math.abs(currentRollRateDps) <= COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS
    && combatPlaneChangeUnloadSettled;
  if (combatDefensiveHighPlaneRecoverySettled) {
    controllerState.combatDefensiveHighPlaneRecoveryActive = false;
    controllerState.combatDefensiveHighPlaneComplete = false;
  }
  if (!combatDefensiveBreakActive) {
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
      COMBAT_DEFENSIVE_BASE_BANK_DEG;
    controllerState.combatDefensiveHighPlaneReleaseSamples = 0;
    if (controllerState.combatDefensiveHighPlaneRecoveryActive !== true) {
      controllerState.combatDefensiveHighPlaneComplete = false;
    }
  } else if (controllerState.combatDefensiveHighPlaneComplete !== true
      && finite(
        controllerState.combatDefensiveBreakPlaneMagnitudeDeg,
        COMBAT_DEFENSIVE_BASE_BANK_DEG,
      ) === COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG) {
    const highPlaneBankDeg = (controllerState.combatDefensiveBreakSign || 1)
      * COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG;
    const highPlanePhysicallyEngaged = rollRateTelemetryValid
      && Math.abs(wrapAngleDeg(highPlaneBankDeg - currentBankDeg))
        <= COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG
      && Math.abs(currentRollRateDps) <= COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS
      && Number.isFinite(measuredActualG)
      && measuredActualG >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_MIN_G;
    const highPlaneHasControl = !escapeRecovery
      && controllerState.combatDownhillSliceActive !== true
      && controllerState.combatDownhillRecoveryPhase === "idle";
    const highPlaneHasConvertedVerticalGeometry =
      highPlaneHasControl
      && highPlanePhysicallyEngaged
      && (currentGammaDeg <= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_GAMMA_DEG
        || primaryAimClosureKts < -50
        || (Number.isFinite(defensiveShooterElevationDeg)
          && defensiveShooterElevationDeg - currentGammaDeg
            >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_RELATIVE_ELEVATION_DEG));
    controllerState.combatDefensiveHighPlaneReleaseSamples =
      highPlaneHasConvertedVerticalGeometry
        ? finite(controllerState.combatDefensiveHighPlaneReleaseSamples) + 1
        : 0;
    if (controllerState.combatDefensiveHighPlaneReleaseSamples
        >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_SAMPLES) {
      // Tape 471 proved that the former 112-degree plane was a useful initial break but a terrible
      // place to live. The 82-degree replacement is a sustainable fighting bank, and an opening
      // pass is now direct evidence that its displacement job is complete. Latch completion for
      // this threat episode, unload, and recover to the ordinary same-side 78-degree fighting bank.
      // Two observer samples reject a one-frame gamma/elevation wobble at the threshold.
      controllerState.combatDefensiveHighPlaneComplete = true;
      controllerState.combatDefensiveHighPlaneRecoveryActive = true;
      controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
        COMBAT_DEFENSIVE_BASE_BANK_DEG;
    }
  } else if (controllerState.combatDefensiveHighPlaneComplete !== true) {
    controllerState.combatDefensiveHighPlaneReleaseSamples = 0;
  }
  let combatDefensiveBreakPlaneMagnitudeDeg = finite(
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg,
    COMBAT_DEFENSIVE_BASE_BANK_DEG,
  );
  let combatDefensiveBreakBankDeg =
    (controllerState.combatDefensiveBreakSign || 1)
      * combatDefensiveBreakPlaneMagnitudeDeg;
  const combatDefensiveBreakJustReleased = combatDefensiveBreakWasActive
    && !combatDefensiveBreakActive;
  if (!combatMission || escapeRecovery || combatDefensiveBreakActive
      || controllerState.combatDefensiveHighPlaneRecoveryActive === true) {
    controllerState.combatDefensiveReleaseUnloadActive = false;
  } else if (combatDefensiveBreakJustReleased && !verticalLevelUnloadSettled) {
    // Tape 450's low-plane break expired at 6.10 G / 19.59 degrees alpha. Generic pursuit then
    // changed the target bank from -55 to -78 in one update and ARI visibly moved the rudders.
    // Preserve the established defensive plane until measured lift has actually decayed.
    controllerState.combatDefensiveReleaseUnloadActive = true;
  } else if (controllerState.combatDefensiveReleaseUnloadActive === true
      && verticalLevelUnloadSettled) {
    controllerState.combatDefensiveReleaseUnloadActive = false;
  }
  const combatDefensiveReleaseUnloadActive =
    controllerState.combatDefensiveReleaseUnloadActive === true;
  const publishedRangeM = Number(state?.range_m);
  const contactRangeM = Number.isFinite(publishedRangeM) && publishedRangeM > 0
    ? publishedRangeM
    : Math.hypot(
      finite(state?.bx) - finite(state?.px),
      finite(state?.by) - finite(state?.py),
      finite(state?.bz) - finite(state?.pz),
    );
  const closureKts = finite(state?.closure_kts, Number.POSITIVE_INFINITY);
  const firstRunGunPhase = mission === "first-run"
    && state?.first_run_weapons_cold === false
    && finite(state?.aim9_remaining, Number.POSITIVE_INFINITY) <= 0;
  const f22LoadedRollProtection = mission === "f22" || firstRunGunPhase;
  const leadGeometry = (mission === "f22" || firstRunGunPhase)
      && target.mode === "gun-lead"
    ? bodyAxisLeadGeometry(state, target)
    : null;
  // Wingman promotion commonly keeps engagement and selected slot unchanged. Physical entity
  // identity must reset every roll-capture latch or the successor inherits an obsolete bank.
  const gunLeadTargetKey = fixedWingGunTargetKey(state);
  const gunLeadTargetChanged = gunLeadTargetKey !== null
    && controllerState.gunLeadRollCaptureTargetKey !== null
    && gunLeadTargetKey !== controllerState.gunLeadRollCaptureTargetKey;
  if (gunLeadTargetKey !== null) {
    controllerState.gunLeadRollCaptureTargetKey = gunLeadTargetKey;
  }
  const invertedRecoveryJustSettled = mission === "f22"
    && controllerState.invertedRecoveryActive === true
    && !invertedRecoveryRequiredNow;
  if (mission !== "f22") {
    controllerState.gunLeadFinisherRearmBlocked = false;
  } else if (invertedRecoveryJustSettled) {
    // Tape 467 completed an ordinary inverted recovery, then handed the still-unloaded jet
    // directly to another 90-plus-degree finisher roll. Require a real fighting pull between
    // those plane changes; a settled near-axis shot remains explicitly exempt below.
    controllerState.gunLeadFinisherRearmBlocked = true;
  } else if (controllerState.gunLeadFinisherRearmBlocked === true
      && Number.isFinite(measuredActualG)
      && measuredActualG >= F22_GUN_LEAD_FINISHER_REARM_MIN_G
      // Tape 483's decaying 4-G residual cleared this block while both commanded channels were
      // already at one G and the loaded-roll owner was still unloading. Rearm requires a newly
      // commanded fighting pull, not stored energy from the manoeuvre which just exhausted itself.
      && optionalLoadCommandFighting(state?.requested_g_cmd)
      && optionalLoadCommandFighting(state?.g_cmd)
      && controllerState.combatLoadedRollUnloadActive !== true) {
    controllerState.gunLeadFinisherRearmBlocked = false;
  }
  const finisherWasActive = controllerState.gunLeadFinisherActive === true
    && !gunLeadTargetChanged;
  const finisherPlaneAzimuthSingular = leadGeometry !== null
    && leadGeometry.offBoresightDeg
      <= F22_GUN_LEAD_CARTESIAN_ROLL_OFF_BORESIGHT_DEG;
  const finisherNearAxisEntry = leadGeometry !== null
    && leadGeometry.offBoresightDeg
      <= F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_OFF_BORESIGHT_DEG
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS;
  const freshFinisherHalfRollSign = Math.sign(
    Math.abs(currentBankDeg) > 3 ? currentBankDeg : headingErrorDeg,
  ) || 1;
  const freshFinisherUnboundedBankDeg = leadGeometry !== null
    ? wrapAngleDeg(currentBankDeg + wrapAngleDeg(leadGeometry.rollPlaneErrorDeg))
    : currentBankDeg;
  const freshFinisherBoundedBankDeg =
    Math.abs(freshFinisherUnboundedBankDeg) <= F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG
      ? freshFinisherUnboundedBankDeg
      : freshFinisherHalfRollSign * F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG;
  const freshFinisherBankErrorDeg = wrapAngleDeg(
    freshFinisherBoundedBankDeg - currentBankDeg,
  );
  const freshFinisherDesiredRollRateDps = clamp(
    freshFinisherBankErrorDeg * 2.4,
    -120,
    120,
  );
  const freshFinisherRawRoll = freshFinisherDesiredRollRateDps / 120
    - currentRollRateDps / 240;
  // Tape 481 entered final-axis control from an already-productive 8.26-G pursuit, even though
  // its new lift plane required a material 14.6-degree change. The mandatory unload consumed the
  // entire useful close pass. Defer only a fresh, off-axis handoff while the aircraft is loaded
  // and the exact 2.4-gain roll law would request at least 25% aileron. Incumbent finishers retain
  // continuity, and an unloaded aircraft may still establish the same plane normally.
  const finisherFreshLoadedEntryDeferred = leadGeometry !== null
    && mission === "f22"
    && !finisherNearAxisEntry
    && contactRangeM <= F22_GUN_LEAD_FINISHER_WIDE_ENTRY_MAX_RANGE_M
    && closureKts > 250
    && !combatPlaneChangeUnloadSettled
    && (Math.abs(freshFinisherDesiredRollRateDps / 120) >= 0.25
      || Math.abs(freshFinisherRawRoll) >= 0.25);
  const finisherCapturedPlaneEstablished =
    controllerState.gunLeadRollCaptureActive === true
    && !gunLeadTargetChanged;
  const storedFinisherEntryBankValue = controllerState.gunLeadFinisherEntryBankDeg;
  const storedFinisherEntryBankDeg = storedFinisherEntryBankValue == null
    ? Number.NaN
    : Number(storedFinisherEntryBankValue);
  const finisherLivePlaneTravelFromEntryDeg = leadGeometry !== null
      && Number.isFinite(storedFinisherEntryBankDeg)
    ? Math.abs(wrapAngleDeg(
      currentBankDeg + wrapAngleDeg(leadGeometry.rollPlaneErrorDeg)
        - storedFinisherEntryBankDeg,
    ))
    : 0;
  const finisherCapturedPlaneTravelFromEntryDeg = finisherCapturedPlaneEstablished
      && Number.isFinite(storedFinisherEntryBankDeg)
    ? Math.abs(wrapAngleDeg(
      finite(controllerState.gunLeadRollCaptureBankDeg, currentBankDeg)
        - storedFinisherEntryBankDeg,
    ))
    : 0;
  const finisherCapturedBankDeg = wrapAngleDeg(finite(
    controllerState.gunLeadRollCaptureBankDeg,
    currentBankDeg,
  ));
  const finisherCapturedPlaneWithinFightingBank = !finisherCapturedPlaneEstablished
    || Math.abs(finisherCapturedBankDeg) <= F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG;
  const finisherCapturedPlaneWithinEntryTravel = !finisherCapturedPlaneEstablished
    || !Number.isFinite(storedFinisherEntryBankDeg)
    || finisherCapturedPlaneTravelFromEntryDeg
      <= F22_GUN_LEAD_FINISHER_MAX_ENTRY_PLANE_TRAVEL_DEG;
  const finisherWithinEntryPlaneTravel = finisherCapturedPlaneWithinFightingBank
    && finisherCapturedPlaneWithinEntryTravel
    && (finisherNearAxisEntry
      || (finisherCapturedPlaneEstablished && finisherPlaneAzimuthSingular)
      || !Number.isFinite(storedFinisherEntryBankDeg)
      || finisherLivePlaneTravelFromEntryDeg
        <= F22_GUN_LEAD_FINISHER_MAX_ENTRY_PLANE_TRAVEL_DEG);
  const finisherEarlyHighClosureEntry = leadGeometry !== null
    && contactRangeM >= F22_GUN_LEAD_FINISHER_WIDE_ENTRY_MAX_RANGE_M
    && contactRangeM <= F22_GUN_LEAD_FINISHER_EARLY_ENTRY_MAX_RANGE_M
    && closureKts >= 650
    && closureKts < F22_GUN_LEAD_FINISHER_EARLY_ENTRY_MAX_CLOSURE_KTS
    && leadGeometry.offBoresightDeg
      <= F22_GUN_LEAD_FINISHER_LONG_RANGE_ENTER_OFF_BORESIGHT_DEG
    && Math.abs(wrapAngleDeg(leadGeometry.rollPlaneErrorDeg))
      <= F22_GUN_LEAD_FINISHER_EARLY_ENTRY_MAX_PLANE_ERROR_DEG;
  const finisherCanEnter = leadGeometry !== null
    && contactRangeM <= 2_500
    && closureKts > -250
    // Tape 476 exposed one clean, early lead-conversion corridor at 2.48 km, 32 degrees off and
    // 863 kt closure. Rejecting it solely on the close-pass closure ceiling left the pilot in
    // route pursuit until a 300 m fly-through. Admit that narrow long-range setup while there is
    // still time to roll, pull and idle; a late high-closure contact inside 1.5 km remains barred.
    && (closureKts < 650 || finisherEarlyHighClosureEntry)
    && leadGeometry.offBoresightDeg <= F22_GUN_LEAD_FINISHER_ENTER_OFF_BORESIGHT_DEG
    // Tape 475 showed that the widened 55-degree gate cannot be range-agnostic: it handed a
    // 2,025 m / 51-degree contact to final-axis control, which then spent four seconds rolling
    // and pulling past knife-edge before the pipper was even in useful gun range. Coarse pursuit
    // owns wide geometry outside 1.5 km; the proved Tape 428 handoff at 900 m remains unchanged.
    && (contactRangeM <= F22_GUN_LEAD_FINISHER_WIDE_ENTRY_MAX_RANGE_M
      || leadGeometry.offBoresightDeg
        <= F22_GUN_LEAD_FINISHER_LONG_RANGE_ENTER_OFF_BORESIGHT_DEG)
    // Tape 466 let a fresh finisher seize a 53-degree lead point that sat 149 degrees across the
    // lift plane. The jet unloaded, rolled nearly inverted, crossed one 50 ms raw solution and
    // then completed a 515-degree low-G sequence while recovering upright. That is not a gun
    // conversion; it is an abrupt split-S authored from a transient lead point. Coarse pursuit
    // must first bring ballistic lead into the positive-lift hemisphere. An already established
    // finisher retains the wider plane hysteresis below so continuous tracking cannot mode-flap.
    && (finisherPlaneAzimuthSingular
      || Math.abs(wrapAngleDeg(leadGeometry.rollPlaneErrorDeg))
        <= F22_GUN_LEAD_FINISHER_ENTER_MAX_PLANE_ERROR_DEG)
    && (mission !== "f22"
      || controllerState.gunLeadFinisherRearmBlocked !== true
      || finisherNearAxisEntry)
    && !finisherFreshLoadedEntryDeferred
    && Math.abs(currentGammaDeg) <= F22_GUN_LEAD_FINISHER_ENTER_GAMMA_DEG;
  const finisherCanRemain = leadGeometry !== null
    && contactRangeM <= 2_800
    && closureKts > -350
    && closureKts < 1_100
    && leadGeometry.offBoresightDeg <= F22_GUN_LEAD_FINISHER_REMAIN_OFF_BORESIGHT_DEG
    && (contactRangeM <= F22_GUN_LEAD_FINISHER_WIDE_ENTRY_MAX_RANGE_M
      || leadGeometry.offBoresightDeg
        <= F22_GUN_LEAD_FINISHER_LONG_RANGE_REMAIN_OFF_BORESIGHT_DEG)
    && finisherWithinEntryPlaneTravel
    && Math.abs(currentGammaDeg) <= F22_GUN_LEAD_FINISHER_REMAIN_GAMMA_DEG;
  // Tape 443 held a useful downhill conversion for 2.23 s because this finisher could not become
  // active until the slice was inactive, while the slice's own preemption required an active
  // finisher. Permit one physically continuous transition: all ordinary finisher gates must pass,
  // the slice plane must already be within eight degrees of ballistic lead, body roll must be
  // settled and the flight path must be above the existing pull-out release. Tape 450 exposed a
  // two-degree seam: at -9.32 degrees gamma, 768 m and 16,869 ft AGL the slice already matched the
  // lead plane within 7.97 degrees, but the old -8-degree cutoff discarded the whole conversion.
  // Permit that tiny extension only inside 1,200 m with at least 3,000 ft clearance. A new threat
  // or target still takes the established roll-first recovery path.
  const combatDownhillHighClearanceFinisherHandoff =
    currentGammaDeg >= COMBAT_DOWNHILL_HIGH_CLEARANCE_FINISHER_MIN_GAMMA_DEG
    && currentGammaDeg < COMBAT_DOWNHILL_RECOVERY_RELEASE_GAMMA_DEG
    && contactRangeM <= 1_200
    && radarAltitudeValid
    && radarAltitudeFt >= 3_000;
  const combatDownhillSliceFinisherHandoff =
    controllerState.combatDownhillSliceActive === true
    && controllerState.combatDownhillRecoveryPhase === "idle"
    && !escapeRecovery
    && !combatDefensiveBreakActive
    && !gunLeadTargetChanged
    && finisherCanEnter
    && (currentGammaDeg >= COMBAT_DOWNHILL_RECOVERY_RELEASE_GAMMA_DEG
      || combatDownhillHighClearanceFinisherHandoff)
    && Math.abs(wrapAngleDeg(leadGeometry.rollPlaneErrorDeg))
      <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_PLANE_DEG
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS;
  const finisherRecoveryHandoff = combatDownhillSliceFinisherHandoff
    || verticalRecoveryShotOpportunity
    || (controllerState.invertedRecoveryActive !== true
      && (finisherWasActive
        || (leadGeometry !== null
          && leadGeometry.offBoresightDeg
            <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_OFF_BORESIGHT_DEG
          && Math.abs(wrapAngleDeg(leadGeometry.rollPlaneErrorDeg))
            <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_PLANE_DEG
          && Math.abs(currentRollRateDps)
            <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS)));
  controllerState.gunLeadFinisherActive = !escapeRecovery
    && !combatDefensiveBreakActive
    && !combatDefensiveReleaseUnloadActive
    && (!invertedRecoveryRequiredNow || finisherRecoveryHandoff)
    && (controllerState.combatDownhillSliceActive !== true
      || combatDownhillSliceFinisherHandoff)
    && controllerState.combatDownhillRecoveryPhase === "idle"
    && (finisherWasActive ? finisherCanRemain : finisherCanEnter);
  let gunLeadFinisherActive = controllerState.gunLeadFinisherActive === true;
  const finisherExceededEntryPlaneTravel = finisherWasActive
    && !finisherWithinEntryPlaneTravel;
  if (mission === "f22" && finisherExceededEntryPlaneTravel) {
    // Do not let a released finisher immediately reseed its entry bank and walk through a second
    // 90-degree segment. Reloading the wing is the physical rearm signal.
    controllerState.gunLeadFinisherRearmBlocked = true;
  }
  if (gunLeadFinisherActive && (!finisherWasActive || gunLeadTargetChanged)) {
    controllerState.gunLeadFinisherEntryBankDeg = currentBankDeg;
  } else if (!gunLeadFinisherActive) {
    controllerState.gunLeadFinisherEntryBankDeg = null;
  }
  // Publish candidate geometry before the mode latches. Tape 428 reported only "finisher
  // inactive" and discarded the exact angle that rejected every entry, forcing an approximate
  // reconstruction from attitude. All control branches below remain explicitly finisher-gated.
  let leadRollPlaneErrorDeg = leadGeometry !== null
    ? wrapAngleDeg(leadGeometry.rollPlaneErrorDeg)
    : 0;
  const leadOffBoresightDeg = leadGeometry !== null
    ? leadGeometry.offBoresightDeg
    : Number.NaN;
  if (gunLeadFinisherActive && (!finisherWasActive || gunLeadTargetChanged)) {
    controllerState.gunLeadFinisherHalfRollSign = Math.sign(
      Math.abs(currentBankDeg) > 3 ? currentBankDeg : headingErrorDeg,
    ) || 1;
  }
  // A target exactly below makes +/-180 equally short. Hold one side through small telemetry
  // noise instead of flipping the ailerons every time the lead point crosses the body centreline.
  if (gunLeadFinisherActive && Math.abs(leadRollPlaneErrorDeg) > 150) {
    leadRollPlaneErrorDeg = (controllerState.gunLeadFinisherHalfRollSign || 1)
      * Math.abs(leadRollPlaneErrorDeg);
  }
  const gunLeadFinisherFightingBankSign = Math.sign(finite(
    controllerState.gunLeadFinisherHalfRollSign,
    1,
  )) || 1;
  const boundedGunLeadFinisherBankDeg = (bankDeg) => {
    const wrappedBankDeg = wrapAngleDeg(bankDeg);
    return Math.abs(wrappedBankDeg) <= F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG
      ? wrappedBankDeg
      : gunLeadFinisherFightingBankSign * F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG;
  };
  const leadRollCaptureCandidate = gunLeadFinisherActive
    && leadOffBoresightDeg <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_OFF_BORESIGHT_DEG
    && Math.abs(leadRollPlaneErrorDeg) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_PLANE_DEG
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS;
  const leadRollPlaneCaptureConverged = gunLeadFinisherActive
    && leadOffBoresightDeg <= F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_OFF_BORESIGHT_DEG
    && Math.abs(leadRollPlaneErrorDeg) <= F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_PLANE_DEG;
  const leadRollCaptureWasActive = controllerState.gunLeadRollCaptureActive === true;
  let leadRollCaptureHandoffActive = false;
  const leadLateralErrorDeg = gunLeadFinisherActive
    ? leadOffBoresightDeg * Math.sin(toRadians(leadRollPlaneErrorDeg))
    : 0;
  // Tape 433 solved the physical body-right miss to -0.556 degrees with only -1.25 dps roll,
  // but the transverse plane angle ran through -146/+163 degrees as the lead crossed below the
  // gun. That azimuth is singular near boresight; the Cartesian lateral component is not. Admit
  // the existing captured signed-lift controller when the real lateral axis and roll rate are
  // already settled, without widening either the gun cone or ordinary capture geometry.
  const closeHighClosureCartesianCapture = mission === "f22"
    && contactRangeM <= F22_GUN_LEAD_CLOSE_CAPTURE_MAX_RANGE_M
    && closureKts >= F22_GUN_LEAD_HIGH_CLOSURE_DAMPING_MIN_CLOSURE_KTS
    && leadOffBoresightDeg
      <= F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CLOSE_CAPTURE_MAX_LATERAL_ERROR_DEG
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS;
  // Tape 442 missed the seven-metre M61 cone by 0.175 m. At 432 m and 773 kt closure,
  // the continuous lateral miss was already settled at 0.788 degrees and -6.2 dps, but the
  // ordinary 0.65-degree lane delayed signed-lift capture by one 50 ms update. Admit only this
  // close, high-closure F-22 conversion shoulder. It changes controller ownership, not the
  // production ballistic cone or the two-sample trigger qualification.
  const leadCartesianCaptureConverged = gunLeadFinisherActive
    && leadOffBoresightDeg <= F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_OFF_BORESIGHT_DEG
    && ((Math.abs(leadLateralErrorDeg)
          <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG
        && Math.abs(currentRollRateDps)
          <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS)
      || closeHighClosureCartesianCapture);
  const leadRollCaptureConverged = leadRollPlaneCaptureConverged
    || leadCartesianCaptureConverged;
  const rawPreviousLeadLateralErrorDeg = controllerState.gunLeadLastLateralErrorDeg;
  const previousLeadLateralErrorDeg = Number(rawPreviousLeadLateralErrorDeg);
  const leadLateralErrorDeltaDeg = rawPreviousLeadLateralErrorDeg !== null
      && Number.isFinite(previousLeadLateralErrorDeg)
      && !gunLeadTargetChanged
    ? leadLateralErrorDeg - previousLeadLateralErrorDeg
    : 0;
  // Tape 404's lead point crossed the gun line by a repeatable ~0.30 deg every 50 ms, but the
  // P-only Cartesian law asked for roll only after the miss had changed sides. Feed that measured
  // motion forward as roll *rate*, in the same direction as the crossing. This is deliberately
  // different from the removed bank-angle derivative: it anticipates a moving miss without
  // integrating or preserving a stale bank demand through the azimuth singularity.
  const leadLateralErrorRateFeedForwardDps = clamp(
    leadLateralErrorDeltaDeg * F22_GUN_LEAD_CARTESIAN_ROLL_DELTA_GAIN,
    -F22_GUN_LEAD_CARTESIAN_ROLL_DELTA_RATE_LIMIT_DPS,
    F22_GUN_LEAD_CARTESIAN_ROLL_DELTA_RATE_LIMIT_DPS,
  );
  let leadRollCaptureTrimDeg = 0;
  let gunLeadFinisherBankLimitExitActive = false;
  if (!gunLeadFinisherActive || !Number.isFinite(leadOffBoresightDeg)
      || gunLeadTargetChanged) {
    controllerState.gunLeadRollCaptureActive = false;
    controllerState.gunLeadRollCaptureCandidateSamples = 0;
    controllerState.gunLeadRollCaptureReleaseSamples = 0;
  } else if (leadRollCaptureWasActive) {
    controllerState.gunLeadRollCaptureCandidateSamples = 0;
    if (leadOffBoresightDeg <= F22_GUN_LEAD_ROLL_CAPTURE_TRIM_OFF_BORESIGHT_DEG) {
      // Tape 395 entered the real ballistic cone, but only for one 50 ms sample: the latched bank
      // kept rolling left while the continuous body-right miss crossed from +0.07 to -0.33 deg.
      // Integrate a tiny bounded bank trim from that Cartesian error. Unlike transverse azimuth it
      // stays continuous through boresight, so this preserves the singularity fix without asking
      // rudder to walk the nose sideways. Tape 398 proved that subtracting a discrete derivative
      // was counterproductive here: while the miss crossed right-to-left it kept the bank trim
      // positive for two extra samples. The physical roll-rate loop below already supplies damping.
      leadRollCaptureTrimDeg = clamp(
        leadLateralErrorDeg * F22_GUN_LEAD_ROLL_CAPTURE_TRIM_GAIN,
        -F22_GUN_LEAD_ROLL_CAPTURE_TRIM_STEP_DEG,
        F22_GUN_LEAD_ROLL_CAPTURE_TRIM_STEP_DEG,
      );
      controllerState.gunLeadRollCaptureBankDeg = boundedGunLeadFinisherBankDeg(
        finite(controllerState.gunLeadRollCaptureBankDeg, currentBankDeg)
          + leadRollCaptureTrimDeg,
      );
    }
    controllerState.gunLeadRollCaptureReleaseSamples = leadOffBoresightDeg
        >= F22_GUN_LEAD_ROLL_CAPTURE_RELEASE_OFF_BORESIGHT_DEG
      ? finite(controllerState.gunLeadRollCaptureReleaseSamples) + 1
      : 0;
    if (controllerState.gunLeadRollCaptureReleaseSamples
        >= F22_GUN_LEAD_ROLL_CAPTURE_RELEASE_SAMPLES) {
      // Tape 365 exposed a second discontinuity after the near-axis capture fix: release changed
      // the desired bank from the latched plane to a live plane 50-75 degrees away in one 50 ms
      // sample. Slew the held plane toward live geometry while capture remains active, then release
      // only when both branches would command the same bank. This bounds the handoff without
      // weakening the production gun-solution or capture-entry gates.
      const capturedBankDeg = wrapAngleDeg(finite(
        controllerState.gunLeadRollCaptureBankDeg,
        currentBankDeg,
      ));
      const capturedErrorDeg = wrapAngleDeg(capturedBankDeg - currentBankDeg);
      const handoffDeltaDeg = wrapAngleDeg(leadRollPlaneErrorDeg - capturedErrorDeg);
      const liveHandoffBankDeg = wrapAngleDeg(currentBankDeg + leadRollPlaneErrorDeg);
      const liveHandoffExceedsFightingBank = Math.abs(liveHandoffBankDeg)
        > F22_GUN_LEAD_FINISHER_MAX_ABS_BANK_DEG;
      if (liveHandoffExceedsFightingBank) {
        // Tape 475 invalidated the old claim that a captured bank could not walk through another
        // segment. Its release handoff stepped 121 -> 178 -> -175 degrees, then the ordinary
        // inverted recovery completed a 318-degree low-G sequence. End final-axis ownership
        // instead of slewing toward a live plane outside the recognizable fighting-bank band.
        controllerState.gunLeadRollCaptureActive = false;
        controllerState.gunLeadRollCaptureReleaseSamples = 0;
        controllerState.gunLeadFinisherActive = false;
        controllerState.gunLeadFinisherRearmBlocked = true;
        controllerState.gunLeadFinisherEntryBankDeg = null;
        gunLeadFinisherActive = false;
        gunLeadFinisherBankLimitExitActive = true;
      } else if (Math.abs(handoffDeltaDeg)
          <= F22_GUN_LEAD_ROLL_CAPTURE_HANDOFF_STEP_DEG) {
        controllerState.gunLeadRollCaptureBankDeg = boundedGunLeadFinisherBankDeg(
          currentBankDeg + leadRollPlaneErrorDeg,
        );
        controllerState.gunLeadRollCaptureActive = false;
        controllerState.gunLeadRollCaptureReleaseSamples = 0;
      } else {
        controllerState.gunLeadRollCaptureBankDeg = boundedGunLeadFinisherBankDeg(
          capturedBankDeg + clamp(
            handoffDeltaDeg,
            -F22_GUN_LEAD_ROLL_CAPTURE_HANDOFF_STEP_DEG,
            F22_GUN_LEAD_ROLL_CAPTURE_HANDOFF_STEP_DEG,
          ),
        );
        leadRollCaptureHandoffActive = true;
      }
    }
  } else {
    controllerState.gunLeadRollCaptureReleaseSamples = 0;
    // Tape 389 reached a real raw solution while still rolling at 28 dps. Waiting for a second
    // low-rate sample let the transverse vector cross the gun axis first, where its azimuth is
    // mathematically undefined: the reported plane jumped -4.6 -> +119.5 degrees and the bot
    // answered with full aileron. Once the lead is already inside two degrees and its lift plane
    // is converged, latch that physical plane immediately and let captured-bank rate damping stop
    // the remaining roll. A wider alignment still needs two samples: tape 400 proved that
    // freezing the lift plane immediately at 5.36 degrees off-axis was premature and left a
    // two-degree miss. The uncaptured Cartesian rate law below now carries that final conversion
    // through the azimuth singularity without chasing it at 96 dps.
    if (leadRollCaptureConverged) {
      const convergedCartesianRollRateDps = clamp(
        leadLateralErrorDeg * F22_GUN_LEAD_CARTESIAN_ROLL_RATE_GAIN
          + leadLateralErrorRateFeedForwardDps,
        -F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS,
        F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS,
      );
      controllerState.gunLeadRollCaptureActive = true;
      controllerState.gunLeadRollCaptureBankDeg = boundedGunLeadFinisherBankDeg(
        currentBankDeg + clamp(
          convergedCartesianRollRateDps / 2.4,
          -F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_BANK_OFFSET_LIMIT_DEG,
          F22_GUN_LEAD_ROLL_CAPTURE_CONVERGED_BANK_OFFSET_LIMIT_DEG,
        ),
      );
      controllerState.gunLeadRollCaptureCandidateSamples = 0;
    } else {
      controllerState.gunLeadRollCaptureCandidateSamples = leadRollCaptureCandidate
        ? finite(controllerState.gunLeadRollCaptureCandidateSamples) + 1
        : 0;
      if (controllerState.gunLeadRollCaptureCandidateSamples
          >= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_SAMPLES) {
        controllerState.gunLeadRollCaptureActive = true;
        controllerState.gunLeadRollCaptureBankDeg = boundedGunLeadFinisherBankDeg(
          currentBankDeg + leadRollPlaneErrorDeg,
        );
        controllerState.gunLeadRollCaptureCandidateSamples = 0;
      }
    }
  }
  const gunLeadRollCaptureActive = controllerState.gunLeadRollCaptureActive === true;
  if (!gunLeadRollCaptureActive) {
    controllerState.gunLeadCapturedFineRollActive = false;
  } else if (controllerState.gunLeadCapturedFineRollActive === true) {
    controllerState.gunLeadCapturedFineRollActive = leadOffBoresightDeg
      <= F22_GUN_LEAD_CAPTURED_FINE_ROLL_RELEASE_OFF_BORESIGHT_DEG;
  } else {
    controllerState.gunLeadCapturedFineRollActive = leadOffBoresightDeg
      <= F22_GUN_LEAD_CAPTURED_FINE_ROLL_ENTER_OFF_BORESIGHT_DEG;
  }
  const gunLeadCapturedFineRollActive =
    controllerState.gunLeadCapturedFineRollActive === true;
  const gunLeadCartesianRollActive = gunLeadFinisherActive
    && leadOffBoresightDeg <= F22_GUN_LEAD_CARTESIAN_ROLL_OFF_BORESIGHT_DEG
    && (!gunLeadRollCaptureActive
      || gunLeadCapturedFineRollActive
      // Outside fine trim, reject a first-frame transverse spike but preserve a genuinely stable
      // Cartesian sample through the capture handoff. Tape 473 had finite lateral history and a
      // 0.139-degree delta, yet dropped its -4 dps correction for exactly one decisive frame.
      // The old tape-359 plane loop moved 2-5 degrees per sample and still fails this one-degree
      // continuity gate.
      || ((leadRollCaptureWasActive || rawPreviousLeadLateralErrorDeg !== null)
        && Math.abs(leadLateralErrorDeltaDeg)
          <= F22_GUN_LEAD_CARTESIAN_CAPTURED_COARSE_MAX_DELTA_DEG));
  const leadLiftErrorDeg = gunLeadRollCaptureActive
    ? leadOffBoresightDeg * Math.cos(toRadians(leadRollPlaneErrorDeg))
    : null;
  const highClosureCartesianPitchDamping = gunLeadCartesianRollActive
    && closureKts >= F22_GUN_LEAD_HIGH_CLOSURE_DAMPING_MIN_CLOSURE_KTS
    && leadOffBoresightDeg <= F22_GUN_LEAD_CARTESIAN_ROLL_OFF_BORESIGHT_DEG;
  const gunLeadHighClosureConeRecoveryActive = mission === "f22"
    && gunLeadFinisherActive
    && !gunLeadTargetChanged
    && gunLeadRollCaptureActive
    && gunLeadCapturedFineRollActive
    && controllerState.gunLeadPitchDominatedFineCaptureActive === true
    && contactRangeM <= F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_RANGE_M
    && closureKts >= F22_GUN_LEAD_HIGH_CLOSURE_DAMPING_MIN_CLOSURE_KTS
    && closureKts <= F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_CLOSURE_KTS
    && leadOffBoresightDeg
      <= F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MAX_LATERAL_ERROR_DEG
    && Number.isFinite(leadLiftErrorDeg)
    && leadLiftErrorDeg
      > F22_GUN_LEAD_HIGH_CLOSURE_ISOLATION_RELEASE_LIFT_ERROR_DEG
    && Math.abs(currentRollRateDps)
      <= F22_GUN_LEAD_CAPTURED_PITCH_HOLD_ROLL_RATE_DPS;
  const publishedPitchRateErrorValue = state?.gunnery_pitch_rate_error_dps;
  const publishedPitchRateErrorDps = publishedPitchRateErrorValue == null
    ? Number.NaN
    : Number(publishedPitchRateErrorValue);
  // Tape 473 missed a 1,036 m ballistic cone by 0.24 m. The production rate error already said
  // the nose was overshooting at 5.71 degrees off-axis, but the old 4.25-degree damping gate
  // ignored it for 120 ms and then released its narrow 3 -> 2.5 degree brake too early. This
  // corridor changes only pitch demand: it needs a live finisher, production assist, stable
  // Cartesian ownership and measured overshoot, while the ballistic cone and dwell stay exact.
  const gunLeadPredictiveOvershootBrakeActive = mission === "f22"
    && gunLeadFinisherActive
    && state?.gunnery_pitch_assist === true
    && !gunLeadTargetChanged
    && (gunLeadRollCaptureActive || gunLeadCartesianRollActive)
    && contactRangeM <= F22_GUN_LEAD_PREDICTIVE_BRAKE_MAX_RANGE_M
    && leadOffBoresightDeg <= F22_GUN_LEAD_PREDICTIVE_BRAKE_MAX_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_PREDICTIVE_BRAKE_MAX_LATERAL_ERROR_DEG
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_APPROACH_BRAKE_MAX_ROLL_RATE_DPS
    && Number.isFinite(publishedPitchRateErrorDps)
    && publishedPitchRateErrorDps <= F22_GUN_LEAD_APPROACH_BRAKE_PITCH_RATE_ERROR_DPS;
  const gunLeadPitchDampingActive = gunLeadHighClosureConeRecoveryActive
    || gunLeadPredictiveOvershootBrakeActive
    || (gunLeadFinisherActive
      && state?.gunnery_pitch_assist === true
      && (gunLeadRollCaptureActive || gunLeadCartesianRollActive)
      && (leadOffBoresightDeg <= F22_GUN_LEAD_PITCH_DAMPING_OFF_BORESIGHT_DEG
        || highClosureCartesianPitchDamping));
  // Tape 454 crossed the raw gun cone for one 50 ms observer interval, but never held the
  // production 80 ms dwell. One update before capture, the target was already laterally settled
  // (0.86 degrees), just 0.12 degrees outside full damping, and production published an 8.66 dps
  // pitch-rate overshoot. The generic three-G shoulder nevertheless increased the request to
  // 2.77 G; input filtering then carried 2.08 G through the raw solution. Admit the existing
  // 1.9-G production damper early only in this narrow, Cartesian-owned approach corridor. This
  // predicts the crossing without widening the ballistic cone or weakening wider conversions.
  const gunLeadPitchAxisApproachBrakeActive = gunLeadPredictiveOvershootBrakeActive
    || (gunLeadPitchDampingActive
      && !gunLeadTargetChanged
      && gunLeadCartesianRollActive
      && leadOffBoresightDeg > F22_GUN_LEAD_PITCH_FULL_DAMPING_OFF_BORESIGHT_DEG
      && leadOffBoresightDeg <= F22_GUN_LEAD_APPROACH_BRAKE_OFF_BORESIGHT_DEG
      && Math.abs(leadLateralErrorDeg)
        <= F22_GUN_LEAD_APPROACH_BRAKE_MAX_LATERAL_ERROR_DEG
      && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_APPROACH_BRAKE_MAX_ROLL_RATE_DPS
      && Number.isFinite(publishedPitchRateErrorDps)
      && publishedPitchRateErrorDps <= F22_GUN_LEAD_APPROACH_BRAKE_PITCH_RATE_ERROR_DPS);
  // Tape 459 arrived at 190 m with the lead plane already settled to two degrees and only
  // 60 knots of closure, but the observer still published a zero pitch-rate error. The ordinary
  // finisher therefore held 6.7 G until the next 50 ms sample, when the pipper had already crossed
  // the gun line. Brake from the directly observed geometry in this narrow close/slow corridor;
  // latch through the immediate crossing because lateral and transverse-plane coordinates both
  // move sharply near the body axis. This changes only G ownership. The production cone, dwell,
  // trigger and every wider or high-closure conversion remain untouched.
  const gunLeadCloseApproachBrakeWasActive =
    controllerState.gunLeadCloseApproachBrakeActive === true;
  // Tape 463 reached every geometric entry gate at 479 m while still carrying 8.5 G, but the
  // production assist bit published one 50 ms control frame after the measured lead geometry.
  // Waiting for that redundant bit carried the old pull through the entire 80 ms ballistic dwell.
  // A measured load above the existing three-G damping shoulder is sufficient authority to
  // pre-arm this same narrow brake; low-G unassisted tracking still cannot acquire it.
  const gunLeadCloseApproachBrakeAuthority =
    state?.gunnery_pitch_assist === true
    || (Number.isFinite(measuredActualG)
      && measuredActualG > F22_GUN_LEAD_PITCH_DAMPING_MAX_G);
  const gunLeadCloseApproachBrakeEntry = mission === "f22"
    && gunLeadFinisherActive
    && gunLeadCloseApproachBrakeAuthority
    && !gunLeadTargetChanged
    && contactRangeM <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_RANGE_M
    && closureKts >= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MIN_CLOSURE_KTS
    && closureKts <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_CLOSURE_KTS
    && leadOffBoresightDeg <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_LATERAL_ERROR_DEG
    && Math.abs(currentRollRateDps)
      <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_ROLL_RATE_DPS
    && Math.abs(leadRollPlaneErrorDeg)
      <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_MAX_PLANE_ERROR_DEG;
  const gunLeadCloseApproachBrakeHold = mission === "f22"
    && gunLeadFinisherActive
    && gunLeadCloseApproachBrakeAuthority
    && !gunLeadTargetChanged
    && contactRangeM <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MAX_RANGE_M
    && closureKts >= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MIN_CLOSURE_KTS
    && closureKts <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MAX_CLOSURE_KTS
    && leadOffBoresightDeg
      <= F22_GUN_LEAD_CLOSE_APPROACH_BRAKE_HOLD_MAX_OFF_BORESIGHT_DEG;
  controllerState.gunLeadCloseApproachBrakeActive =
    gunLeadCloseApproachBrakeWasActive
      ? gunLeadCloseApproachBrakeHold
      : gunLeadCloseApproachBrakeEntry;
  const gunLeadCloseApproachBrakeActive =
    controllerState.gunLeadCloseApproachBrakeActive === true;
  // Tape 451 solved the lateral axis to 0.109 degrees with a settled roll, but total lead error
  // remained 3.27 degrees because that residual was entirely lift-axis. Requiring total error to
  // enter the old 2.35-degree "fine roll" lane made pitch-only capture mathematically impossible
  // in precisely that case. Admit a second, physical corridor when published production telemetry
  // confirms a material positive pitch-rate deficit; the existing lateral and roll-rate gates keep
  // it from turning an ordinary moving-plane conversion into a blind pull.
  const capturedPitchAxisEntry = gunLeadRollCaptureActive
    && Number.isFinite(publishedPitchRateErrorDps)
    && publishedPitchRateErrorDps
      >= F22_GUN_LEAD_CAPTURED_PITCH_RATE_ENTRY_ERROR_DPS
    && Math.abs(currentRollRateDps)
      <= F22_GUN_LEAD_CAPTURED_PITCH_ENTRY_ROLL_RATE_DPS;
  const capturedPitchAxisHold = gunLeadRollCaptureActive
    && Number.isFinite(publishedPitchRateErrorDps)
    && publishedPitchRateErrorDps
      >= F22_GUN_LEAD_CAPTURED_PITCH_RATE_HOLD_ERROR_DPS
    && Math.abs(currentRollRateDps)
      <= F22_GUN_LEAD_CAPTURED_PITCH_HOLD_ROLL_RATE_DPS;
  const pitchDominatedFineCaptureEntry = gunLeadPitchDampingActive
    && (gunLeadCapturedFineRollActive || capturedPitchAxisEntry)
    && Number.isFinite(leadLiftErrorDeg)
    && leadLiftErrorDeg > 1.1
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG;
  const pitchDominatedFineCaptureHold = gunLeadPitchDampingActive
    && (gunLeadCapturedFineRollActive || capturedPitchAxisHold)
    && Number.isFinite(leadLiftErrorDeg)
    && (leadLiftErrorDeg > 0.8
      // Tape 435 earned the raw cone for 0.10 s, but released roll isolation one sample
      // before the qualified cue arrived. On a fast pass, retain the captured lift plane until
      // the lead is plainly below the axis or lateral error leaves the narrow capture lane.
      || (closureKts >= F22_GUN_LEAD_HIGH_CLOSURE_DAMPING_MIN_CLOSURE_KTS
        && leadLiftErrorDeg
          > F22_GUN_LEAD_HIGH_CLOSURE_ISOLATION_RELEASE_LIFT_ERROR_DEG))
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG + 0.15;
  controllerState.gunLeadPitchDominatedFineCaptureActive =
    controllerState.gunLeadPitchDominatedFineCaptureActive === true
      ? pitchDominatedFineCaptureHold
      : pitchDominatedFineCaptureEntry;
  const gunLeadPitchDominatedFineCapture =
    controllerState.gunLeadPitchDominatedFineCaptureActive === true;
  const capturedPitchAxisPullActive = gunLeadPitchDominatedFineCapture
    && capturedPitchAxisHold
    && Number.isFinite(leadLiftErrorDeg)
    && leadLiftErrorDeg > F22_GUN_LEAD_HIGH_CLOSURE_PITCH_FLOOR_RELEASE_LIFT_ERROR_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG + 0.15;
  const highClosurePitchDominatedPullFloor =
    highClosureCartesianPitchDamping
    && gunLeadPitchDominatedFineCapture
    && leadLiftErrorDeg
      > F22_GUN_LEAD_HIGH_CLOSURE_PITCH_FLOOR_RELEASE_LIFT_ERROR_DEG;
  // Capture owns the stable lift-plane reference, not a dead lateral axis. Tape 430 captured at
  // 3.56 degrees, then disabled Cartesian roll because it was outside the narrower fine/bias
  // shoulder; the real body-right miss wandered +0.58 -> +4.18 -> -1.90 degrees while pitch
  // converged. Keep continuous Cartesian P/feed-forward through the already-declared six-degree
  // envelope. Integral bias and lift-delta damping remain fine-only below.
  const leadLateralCrossedAxis = rawPreviousLeadLateralErrorDeg !== null
    && Number.isFinite(previousLeadLateralErrorDeg)
    && leadLateralErrorDeg * previousLeadLateralErrorDeg < 0
    && Math.abs(leadLateralErrorDeg - previousLeadLateralErrorDeg) > 0.01;
  // Tape 420 held a repeatable 0.47-degree body-left miss for several seconds: a P-only rate
  // request needs that error just to maintain the turn, leaving the physical 7 m cone half a
  // metre away. Accumulate only inside the already captured fine-roll envelope, cap the added
  // rate to five degrees per second. A small/slow integration envelope rejects capture transients
  // and holds—rather than keeps winding—the learned rate once the miss is negligible. Discard it
  // at every axis/target/mode transition as well, so stale demand cannot cross the singularity.
  const gunLeadCartesianRollBiasStable = gunLeadCartesianRollActive
    && gunLeadCapturedFineRollActive
    && !gunLeadPitchDominatedFineCapture
    && !gunLeadTargetChanged
    && !leadLateralCrossedAxis
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG
    && Math.abs(leadLateralErrorDeltaDeg)
      <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_DELTA_DEG;
  const priorGunLeadCartesianRollBiasRateDps = finite(
    controllerState.gunLeadCartesianRollBiasRateDps,
  );
  const gunLeadCartesianRollBiasHasStaleSign =
    Math.abs(leadLateralErrorDeg) >= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MIN_ERROR_DEG
    && priorGunLeadCartesianRollBiasRateDps * leadLateralErrorDeg < 0;
  if (!gunLeadCartesianRollBiasStable || gunLeadCartesianRollBiasHasStaleSign) {
    controllerState.gunLeadCartesianRollBiasRateDps = 0;
  } else if (Math.abs(leadLateralErrorDeg)
      >= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MIN_ERROR_DEG) {
    controllerState.gunLeadCartesianRollBiasRateDps = clamp(
      priorGunLeadCartesianRollBiasRateDps
        + leadLateralErrorDeg * F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_GAIN,
      -F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_RATE_LIMIT_DPS,
      F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_RATE_LIMIT_DPS,
    );
  }
  const gunLeadCartesianRollBiasRateDps = gunLeadCartesianRollActive
      && gunLeadCapturedFineRollActive
    ? finite(controllerState.gunLeadCartesianRollBiasRateDps)
    : 0;
  // Once this frame's pitch-dominated latch identifies a small lateral / material lift-axis
  // miss, stop the P and integral loops from moving the lift plane until pitch converges. Tape 431
  // began at only -0.307 degrees lateral, but Cartesian P ramped to -20 dps and created a
  // -2.33-degree miss while the pitch aid was doing its job. Tape 441 exposed the complementary
  // moving-lead case: zeroing even the measured one-sample feed-forward let lateral error drift
  // 0.33 -> 0.79 degrees before pitch converged. Retain only that bounded physical lead-motion
  // rate while a material >0.8-degree lift miss owns the pass; near/through the cone it returns to
  // zero, preserving the settled-axis dwell. Tape 449 proved that this is geometric rather than a
  // closure-only need: on an opening pass the lead still crossed 0.55 degrees per sample while the
  // old zero-rate isolation froze the bank, turning a 1.215-degree near-solution into another orbit.
  // The measured-rate damper always remains.
  const gunLeadPitchIsolationRollHold = gunLeadRollCaptureActive
    && gunLeadPitchDominatedFineCapture;
  const gunLeadPitchIsolationFeedForwardDps =
    gunLeadPitchIsolationRollHold
        && Number.isFinite(leadLiftErrorDeg)
        && leadLiftErrorDeg > 0.8
      ? leadLateralErrorRateFeedForwardDps
      : 0;
  // Tape 457's low-closure capture still lost its lateral lane while pitch converged: error moved
  // away from +0.32 to +0.89 degrees, but isolation requested only 2.5-4.2 dps of feed-forward
  // and the plant achieved less than one. At the 0.8-degree latch boundary the full Cartesian P
  // loop then arrived discontinuously at 18-22 dps and forced another unload. Reintroduce only a
  // ten-dps recenter shoulder when a material miss is demonstrably moving away. Tape 473 then
  // exposed the same breakout at 379 kt closure; extending this bounded shoulder through 450 kt
  // is still materially below the 25-32 dps full-P jump it prevents. Converging/crossing axes,
  // the integral loop and the settled cone remain isolated exactly as before.
  const gunLeadHighClosureConeOutwardRecenter =
    gunLeadHighClosureConeRecoveryActive
    && Math.abs(currentRollRateDps)
      >= F22_GUN_LEAD_HIGH_CLOSURE_CONE_RECOVERY_MIN_ROLL_RATE_DPS
    && leadLateralErrorDeg * currentRollRateDps < 0;
  const gunLeadOrdinaryPitchIsolationRecenter =
    Number.isFinite(leadLiftErrorDeg)
    && leadLiftErrorDeg > 0.8
    && closureKts >= F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_MIN_CLOSURE_KTS
    && closureKts <= F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_MAX_CLOSURE_KTS;
  const gunLeadPitchIsolationRecenterRateDps =
    gunLeadPitchIsolationRollHold
      && (gunLeadOrdinaryPitchIsolationRecenter
        || gunLeadHighClosureConeOutwardRecenter)
      && Math.abs(leadLateralErrorDeg)
        >= F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_MIN_ERROR_DEG
      && leadLateralErrorDeg * leadLateralErrorDeltaDeg > 0
    ? clamp(
      leadLateralErrorDeg * F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_GAIN,
      -F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_RATE_LIMIT_DPS,
      F22_GUN_LEAD_PITCH_ISOLATION_RECENTER_RATE_LIMIT_DPS,
    )
    : 0;
  const gunLeadCartesianRangeScale = gunLeadRollCaptureActive
      && gunLeadCapturedFineRollActive
    // One degree is twice as many metres at 1.8 km as at the 900 m tuning fixture. Tape 475's
    // pitch axis reached the director at 1,738 m while its lateral miss walked outward because
    // the unchanged P rate could not keep up. Scale only the already-captured fine Cartesian P
    // term; feed-forward, integral bias, close conversions and the 45-dps ceiling stay unchanged.
    ? clamp(
      contactRangeM / F22_GUN_LEAD_CARTESIAN_RANGE_SCALE_REFERENCE_M,
      1,
      F22_GUN_LEAD_CARTESIAN_RANGE_SCALE_LIMIT,
    )
    : 1;
  const gunLeadCartesianRollRateDps = gunLeadCartesianRollActive
      && !gunLeadPitchIsolationRollHold
    ? clamp(
      leadLateralErrorDeg * F22_GUN_LEAD_CARTESIAN_ROLL_RATE_GAIN
        * gunLeadCartesianRangeScale
        + leadLateralErrorRateFeedForwardDps
        + gunLeadCartesianRollBiasRateDps,
      -F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS,
      F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS,
    )
    : gunLeadCartesianRollActive
      ? clamp(
        gunLeadPitchIsolationFeedForwardDps
          + gunLeadPitchIsolationRecenterRateDps,
        -F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS,
        F22_GUN_LEAD_CARTESIAN_ROLL_RATE_LIMIT_DPS,
      )
      : 0;
  const gunLeadCartesianRollFeedForwardDps = gunLeadCartesianRollActive
    ? (gunLeadPitchIsolationRollHold
        ? gunLeadPitchIsolationFeedForwardDps
        : leadLateralErrorRateFeedForwardDps)
    : 0;
  const gunLeadFinisherUnboundedBankTargetDeg = !gunLeadFinisherActive
    ? currentBankDeg
    : gunLeadCartesianRollActive
      ? wrapAngleDeg(
        currentBankDeg + gunLeadCartesianRollRateDps
          / (gunLeadRollCaptureActive ? F22_GUN_LEAD_ROLL_CAPTURE_RATE_GAIN : 2.4),
      )
      : gunLeadRollCaptureActive
        ? wrapAngleDeg(finite(
          controllerState.gunLeadRollCaptureBankDeg,
          currentBankDeg,
        ))
        : wrapAngleDeg(currentBankDeg + leadRollPlaneErrorDeg);
  const gunLeadFinisherBoundedBankTargetDeg = boundedGunLeadFinisherBankDeg(
    gunLeadFinisherUnboundedBankTargetDeg,
  );
  const projectedGunLeadFinisherBankDeg = wrapAngleDeg(
    currentBankDeg
      + currentRollRateDps * F22_GUN_LEAD_FINISHER_OVERBANK_PREDICTION_S,
  );
  const finisherProjectedOutwardOverbank = Math.abs(currentBankDeg)
      <= F22_GUN_LEAD_FINISHER_OVERBANK_LIMIT_DEG
    && Math.abs(projectedGunLeadFinisherBankDeg)
      > F22_GUN_LEAD_FINISHER_OVERBANK_LIMIT_DEG
    && Math.abs(projectedGunLeadFinisherBankDeg) > Math.abs(currentBankDeg);
  const gunLeadFinisherOverbankGuardActive = gunLeadFinisherActive
    && (Math.abs(currentBankDeg) > F22_GUN_LEAD_FINISHER_OVERBANK_LIMIT_DEG
      || finisherProjectedOutwardOverbank);
  controllerState.gunLeadLastLateralErrorDeg = gunLeadCartesianRollActive
      || gunLeadRollCaptureActive
    ? leadLateralErrorDeg
    : null;
  const combatDownhillSliceTacticalPreemption = combatDefensiveBreakActive
    || gunLeadFinisherActive || gunLeadTargetChanged;
  if (mission !== "f22" || escapeRecovery
      || combatDownhillSliceTacticalPreemption) {
    // A fresh tactical/safety owner gets the established wings-level recovery. The same-side
    // post-pass plane is valid only for the one contact and break episode which authored it.
    controllerState.combatDownhillPostPassConversionActive = false;
  }
  const combatDownhillRecoveryTargetBankDeg =
      controllerState.combatDownhillPostPassConversionActive === true
    ? (controllerState.combatDownhillSliceSign || 1)
      * COMBAT_DOWNHILL_POST_PASS_RECOVERY_BANK_DEG
    : 0;
  const combatDownhillRecoveryRollSettled =
    Math.abs(wrapAngleDeg(
      combatDownhillRecoveryTargetBankDeg - currentBankDeg,
    )) <= (controllerState.combatDownhillPostPassConversionActive === true
      ? COMBAT_DOWNHILL_POST_PASS_RECOVERY_BANK_ERROR_DEG
      : COMBAT_VERTICAL_LEVEL_RELEASE_BANK_DEG)
    && Math.abs(currentRollRateDps) <= COMBAT_VERTICAL_LEVEL_RELEASE_ROLL_RATE_DPS;
  const combatDownhillSliceRearmGeometryClear = rawTargetElevationDeg >= -2
    || Math.abs(headingErrorDeg) <= 35;
  if (mission !== "f22") {
    controllerState.combatDownhillSliceRearmBlocked = false;
  } else if (invertedRecoveryJustSettled) {
    // Tape 463 finished rolling upright with the same contact still depressed and across the
    // turn. The generic recovery latch released, then the downhill selector authored a fresh
    // +/-112-degree slice on that exact frame and sent the unloaded jet through another full
    // roll. Preserve the already-proven geometric rearm block across this ownership handoff;
    // normal same-altitude or nose-captured geometry clears it below.
    controllerState.combatDownhillSliceRearmBlocked = true;
  } else if (controllerState.combatDownhillSliceRearmBlocked === true
      && controllerState.combatDownhillSliceActive !== true
      && controllerState.combatDownhillRecoveryPhase === "idle"
      && combatDownhillSliceRearmGeometryClear) {
    // After a full pull-out, turn onto the contact before authoring another earthward slice.
    // This is geometric hysteresis rather than a wall-clock pause, so it cannot expire while the
    // jet is still pointing across the fight with the contact materially below it.
    controllerState.combatDownhillSliceRearmBlocked = false;
  }
  const combatDownhillSliceBaseCandidate = mission === "f22"
    && !escapeRecovery
    && !combatDefensiveBreakActive
    && !combatDefensiveReleaseUnloadActive
    && !gunLeadFinisherActive
    && !gunLeadTargetChanged
    && !invertedRecoveryRequiredNow
    && controllerState.combatDownhillRecoveryPhase === "idle"
    && controllerState.combatDownhillSliceRearmBlocked !== true
    && rawTargetElevationDeg <= -6
    // "Below the horizon" is not the same as below the aircraft's flown path. Tape 469 entered
    // three 112-degree slices while already descending 18-23 degrees and the contact sat above
    // that path. They were visually indistinguishable from holding the nose up on top rudder and
    // contributed nothing to conversion. A fresh slice must have real earthward work to do.
    && rawTargetElevationDeg
      <= currentGammaDeg - COMBAT_DOWNHILL_ENTRY_MIN_BELOW_FLIGHT_PATH_DEG
    && Math.abs(headingErrorDeg) >= 60;
  const combatDownhillPostPassEntry = combatDownhillSliceBaseCandidate
    && combatDefensiveBreakJustReleased
    && contactRangeM <= COMBAT_DOWNHILL_POST_PASS_RANGE_M
    && closureKts <= COMBAT_DOWNHILL_POST_PASS_OPENING_KTS
    && currentGammaDeg >= COMBAT_DOWNHILL_POST_PASS_MIN_GAMMA_DEG
    && Math.abs(currentBankDeg) >= 60
    && Math.sign(currentBankDeg) === Math.sign(headingErrorDeg);
  const combatDownhillGenericEntryPlaneTravelDeg = Math.abs(wrapAngleDeg(
    (Math.sign(headingErrorDeg) || 1) * COMBAT_DOWNHILL_SLICE_BANK_DEG
      - currentBankDeg,
  ));
  // Tape 447 authored generic 112-degree slices at 33.7, 96.5 and 536.7 m. Those were not useful
  // vertical conversions; they forced dive/recovery churn inside the gun fight and handed the
  // only finisher a jet below corner speed. Keep generic slices outside close BFM, while retaining
  // the separately proved defensive post-pass conversion at <=400 m. Tape 471 added the opposite
  // failure: a generic entry asked a +76-degree jet for a near-half-roll, so the whole episode
  // was a slow half-roll with one pull frame. Reject paths requiring more than 120 degrees
  // away; ordinary pursuit is already turning the aircraft and can earn a useful same-side entry.
  const combatDownhillSliceCandidate = combatDownhillSliceBaseCandidate
    && (combatDownhillPostPassEntry
      || (contactRangeM >= COMBAT_DOWNHILL_GENERIC_MIN_RANGE_M
        // Tape 476 was already descending 15.6 degrees when generic pursuit chained a second
        // full split-S onto a completed cross-side roll. The target was only another six degrees
        // below that flown path; ordinary bank-and-pull pursuit owns it. Reserve a fresh inverted
        // slice for level/shallow flight so it cannot immediately force terrain recovery upright.
        && currentGammaDeg >= COMBAT_DOWNHILL_GENERIC_ENTRY_MIN_GAMMA_DEG
        // Tape 473 crossed outward through the 700 m gate at 510 kt opening and immediately
        // authored a four-second loaded slice. That is a completed pass, not far-below pursuit;
        // only the dedicated, close defensive post-pass branch may convert a fast opener.
        && closureKts > COMBAT_DOWNHILL_GENERIC_MIN_CLOSURE_KTS
        && combatDownhillGenericEntryPlaneTravelDeg
          <= COMBAT_DOWNHILL_SLICE_MAX_ENTRY_PLANE_TRAVEL_DEG));
  // A defensive owner may hand directly to the tightly proved post-pass conversion, but it may
  // not hand the same physical frame to the generic deep slice. If any tape-shaped gate misses,
  // ordinary pursuit gets one clean sample to establish the new geometry instead of reversing an
  // existing break plane straight toward the opposite conversion target.
  const combatDownhillSliceEntry = combatDownhillSliceCandidate
    && (!combatDefensiveBreakJustReleased || combatDownhillPostPassEntry);
  let combatDownhillSliceDepthRecovery = false;
  let combatDownhillSlicePreemptionRecovery = false;
  let combatDownhillSlicePostPassGeometryRecovery = false;
  const combatDownhillSliceTargetRecovered =
    controllerState.combatDownhillSliceActive === true
    && currentGammaDeg <= COMBAT_DOWNHILL_RECOVERY_RELEASE_GAMMA_DEG
    && rawTargetElevationDeg >= currentGammaDeg
      + COMBAT_DOWNHILL_TARGET_ABOVE_FLIGHT_PATH_RELEASE_DEG;
  const combatDownhillSliceGenericGeometryRecovery =
    controllerState.combatDownhillSliceActive === true
    && controllerState.combatDownhillPostPassConversionActive !== true
    && (currentGammaDeg <= COMBAT_DOWNHILL_SLICE_RELEASE_GAMMA_DEG
      || Math.abs(headingErrorDeg)
        <= COMBAT_DOWNHILL_SLICE_RELEASE_HEADING_ERROR_DEG);
  if (mission !== "f22" || escapeRecovery) {
    controllerState.combatDownhillSliceActive = false;
    controllerState.combatDownhillSliceRollArmed = false;
    controllerState.combatDownhillSlicePullActive = false;
    controllerState.combatDownhillSliceUnloadSamples = 0;
  } else if (controllerState.combatDownhillSliceActive === true
      && combatDownhillSliceTacticalPreemption) {
    // A threat or target handoff may end the tactical slice, but it cannot immediately replace a
    // 90-plus-degree lift vector with a hard tactical pull. First recover bank/rate (and any
    // established descent), then let the already-latched break or new target resume.
    combatDownhillSlicePreemptionRecovery =
      !combatDownhillSliceFinisherHandoff
      && (!combatDownhillRecoveryRollSettled
        || currentGammaDeg < COMBAT_DOWNHILL_RECOVERY_RELEASE_GAMMA_DEG);
    controllerState.combatDownhillSliceActive = false;
    controllerState.combatDownhillSliceRollArmed = false;
    controllerState.combatDownhillSlicePullActive = false;
    controllerState.combatDownhillSliceUnloadSamples = 0;
  } else if (controllerState.combatDownhillSliceActive !== true
      && combatDownhillSliceEntry) {
    controllerState.combatDownhillSliceActive = true;
    controllerState.combatDownhillSliceSign = Math.sign(headingErrorDeg) || 1;
    controllerState.combatDownhillSliceRollArmed = false;
    controllerState.combatDownhillSlicePullActive = false;
    controllerState.combatDownhillSliceUnloadSamples = combatPlaneChangeUnloadSettled ? 1 : 0;
    controllerState.combatDownhillPostPassConversionActive =
      combatDownhillPostPassEntry;
  } else if (controllerState.combatDownhillSliceActive === true
      && (combatDownhillSliceGenericGeometryRecovery
        || currentGammaDeg <= (
        controllerState.combatDownhillPostPassConversionActive === true
          ? COMBAT_DOWNHILL_POST_PASS_RELEASE_GAMMA_DEG
          : COMBAT_DOWNHILL_SLICE_RELEASE_GAMMA_DEG
      )
        || combatDownhillSliceTargetRecovered
        || rawTargetElevationDeg >= -2
        || (Math.abs(headingErrorDeg) <= 35 && rawTargetElevationDeg > -6))) {
    combatDownhillSliceDepthRecovery =
      combatDownhillSliceGenericGeometryRecovery
      || currentGammaDeg <= (
        controllerState.combatDownhillPostPassConversionActive === true
          ? COMBAT_DOWNHILL_POST_PASS_RELEASE_GAMMA_DEG
          : COMBAT_DOWNHILL_SLICE_RELEASE_GAMMA_DEG
      ) || combatDownhillSliceTargetRecovered;
    combatDownhillSlicePostPassGeometryRecovery =
      controllerState.combatDownhillPostPassConversionActive === true
      && !combatDownhillSliceDepthRecovery;
    controllerState.combatDownhillSliceActive = false;
    controllerState.combatDownhillSliceRollArmed = false;
    controllerState.combatDownhillSlicePullActive = false;
    controllerState.combatDownhillSliceUnloadSamples = 0;
    if (!combatDownhillSliceDepthRecovery
        && !combatDownhillSlicePostPassGeometryRecovery) {
      controllerState.combatDownhillPostPassConversionActive = false;
    }
  } else if (controllerState.combatDownhillSliceActive === true
      && controllerState.combatDownhillSliceRollArmed !== true
  ) {
    controllerState.combatDownhillSliceUnloadSamples = combatPlaneChangeUnloadSettled
      ? finite(controllerState.combatDownhillSliceUnloadSamples) + 1
      : 0;
    if (controllerState.combatDownhillSliceUnloadSamples
        >= COMBAT_PLANE_CHANGE_ARM_SAMPLES) {
      // Permission is a one-way commitment to the authored slice plane. Tape 453 repeatedly
      // revoked it as lagging G crossed 2.5, alternately targeting the conversion plane and present
      // bank. Keep the plane stable; the final command gate below pauses only accelerating
      // aileron if measured load unexpectedly rebuilds before capture.
      controllerState.combatDownhillSliceRollArmed = true;
    }
  }
  const combatDownhillSliceActive = controllerState.combatDownhillSliceActive === true;
  const combatDownhillSliceRollArmed = combatDownhillSliceActive
    && controllerState.combatDownhillSliceRollArmed === true;
  const combatDownhillSliceBankDeg =
    (controllerState.combatDownhillSliceSign || 1)
      * (controllerState.combatDownhillPostPassConversionActive === true
        ? COMBAT_DOWNHILL_POST_PASS_BANK_DEG
        : COMBAT_DOWNHILL_SLICE_BANK_DEG);
  const combatDownhillSliceTargetCaptured = combatDownhillSliceRollArmed
    && rollRateTelemetryValid
    && Math.abs(wrapAngleDeg(combatDownhillSliceBankDeg - currentBankDeg))
      <= COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG
    && Math.abs(currentRollRateDps) <= COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS;
  const combatDownhillSlicePullDriftedFromPlane = combatDownhillSliceActive
    && controllerState.combatDownhillSlicePullActive === true
    && Math.abs(wrapAngleDeg(combatDownhillSliceBankDeg - currentBankDeg))
      > COMBAT_DOWNHILL_SLICE_PLANE_DRIFT_DEG;
  if (combatDownhillSlicePullDriftedFromPlane) {
    // The same coupling that moved vertical recovery can move a loaded downhill slice away from
    // its authored pull plane. Do not chase the bank with aileron under G; release the pull,
    // let the existing load interlock unload, then use the exact 8-degree/15-deg/s capture gate.
    controllerState.combatDownhillSlicePullActive = false;
  } else if (combatDownhillSliceActive
      && controllerState.combatDownhillSlicePullActive !== true
      && combatDownhillSliceTargetCaptured) {
    // Once the physical conversion plane is captured, keep its pull ownership until the slice
    // exits. Re-evaluating a broad live |bank| gate made pitch alternate between 8.36 and 0.8 G as
    // ordinary roll/pitch coupling crossed 105 degrees. Exact capture gives the manoeuvre a clean
    // roll-then-pull sequence and removes that visible porpoising without weakening roll safety.
    controllerState.combatDownhillSlicePullActive = true;
  } else if (!combatDownhillSliceActive) {
    controllerState.combatDownhillSlicePullActive = false;
  }
  const combatDownhillSlicePullActive = combatDownhillSliceActive
    && controllerState.combatDownhillSlicePullActive === true;
  if (mission !== "f22" || escapeRecovery) {
    controllerState.combatDownhillRecoveryPhase = "idle";
    controllerState.combatDownhillRecoveryRollArmed = false;
  } else if (combatDownhillSliceDepthRecovery
      || combatDownhillSlicePreemptionRecovery
      || combatDownhillSlicePostPassGeometryRecovery) {
    controllerState.combatDownhillSliceRearmBlocked = true;
    controllerState.combatDownhillRecoveryRollArmed = combatRecoveryRollPermission;
    controllerState.combatDownhillRecoveryPhase = combatDownhillSliceDepthRecovery
        || !combatDownhillRecoveryRollSettled
        || !combatRecoveryRollPermission
      ? "roll"
      : "pull";
  } else if (controllerState.combatDownhillRecoveryPhase === "roll"
      && !combatRecoveryRollPermission) {
    // The permission is physical, not historical. If load or alpha rebuilds during the transfer,
    // pause aileron and resume unloading instead of carrying a stale one-frame authorization.
    controllerState.combatDownhillRecoveryRollArmed = false;
  } else if (controllerState.combatDownhillRecoveryPhase === "roll"
      && controllerState.combatDownhillRecoveryRollArmed !== true) {
    controllerState.combatDownhillRecoveryRollArmed = combatRecoveryRollPermission;
    if (combatDownhillRecoveryRollSettled) {
      controllerState.combatDownhillRecoveryPhase = "pull";
    }
  } else if (controllerState.combatDownhillRecoveryPhase === "roll"
      && controllerState.combatDownhillRecoveryRollArmed === true
      && combatDownhillRecoveryRollSettled) {
    controllerState.combatDownhillRecoveryPhase = "pull";
  } else if (controllerState.combatDownhillRecoveryPhase === "pull"
      && currentGammaDeg >= COMBAT_DOWNHILL_RECOVERY_RELEASE_GAMMA_DEG) {
    controllerState.combatDownhillRecoveryPhase = verticalLevelUnloadSettled
      ? "idle"
      : "release";
    controllerState.combatDownhillRecoveryRollArmed = false;
  } else if (controllerState.combatDownhillRecoveryPhase === "release"
      && verticalLevelUnloadSettled) {
    controllerState.combatDownhillRecoveryPhase = "idle";
    controllerState.combatDownhillRecoveryRollArmed = false;
  }
  if (controllerState.combatDownhillSliceActive !== true
      && controllerState.combatDownhillRecoveryPhase === "idle") {
    controllerState.combatDownhillPostPassConversionActive = false;
    controllerState.combatDownhillRecoveryRollArmed = false;
  }
  const combatDownhillRecoveryPhase =
    String(controllerState.combatDownhillRecoveryPhase ?? "idle");
  const combatDownhillRecoveryActive = combatDownhillRecoveryPhase !== "idle";
  const combatDownhillRecoveryRollArmed = combatDownhillRecoveryActive
    && controllerState.combatDownhillRecoveryRollArmed === true;
  const combatDownhillPostPassConversionActive =
    controllerState.combatDownhillPostPassConversionActive === true;
  if (combatDefensiveBreakActive
      && (primaryAimingThreat || primaryGunFiring)
      && !escapeRecovery
      && !invertedRecoveryRequiredNow
      && controllerState.combatDownhillSliceActive !== true
      && combatDownhillRecoveryPhase === "idle"
      && controllerState.combatDefensiveGunfireBankHoldActive !== true
      && controllerState.combatDefensiveLowPlaneComplete !== true
      && controllerState.combatDefensiveHighPlaneComplete !== true
      && combatDefensiveBreakPlaneMagnitudeDeg === COMBAT_DEFENSIVE_BASE_BANK_DEG) {
    // Threat geometry is evaluated before the downhill recovery state machine. If recovery
    // releases on this exact frame, do not stage the neutral 78-degree fallback for one tick and
    // freeze it in the loaded-roll owner. Resolve the still-live threat now that control is
    // genuinely available; a vanished aim pulse retains the intentional neutral handoff.
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
      defensiveBreakPlaneMagnitudeForCurrentThreat();
    combatDefensiveBreakPlaneMagnitudeDeg =
      controllerState.combatDefensiveBreakPlaneMagnitudeDeg;
    combatDefensiveBreakBankDeg =
      (controllerState.combatDefensiveBreakSign || 1)
        * combatDefensiveBreakPlaneMagnitudeDeg;
  }
  const combatDownhillPostPassRecoveryBankDeg =
    (controllerState.combatDownhillSliceSign || 1)
      * COMBAT_DOWNHILL_POST_PASS_RECOVERY_BANK_DEG;
  // Do not hand an overbanked jet straight back to pursuit at the old 105-degree edge. Tape 419
  // crossed that edge while still rolling; pursuit's target happened to sit almost exactly on the
  // opposite bank, so one degree of Euler noise flipped the wrapped error from +179 to -178 and
  // commanded a full-scale left/right/left snap. Tape 434 exposed the subtler version: the old
  // 92-degree release handed a jet still rolling at -106 dps to combat pull, building 5-6 G while
  // the half-roll continued and producing ten degrees of visible sideslip with zero rudder input.
  // Keep recovery ownership until a same-side 78-degree fighting bank and body rate are both
  // genuinely settled. That plane can hand directly to aft pursuit without a second roll.
  const invertedRecoveryWasActive =
    controllerState.invertedRecoveryActive === true;
  if (gunLeadFinisherActive) {
    // An established finisher or explicit safe shot handoff authored this overbank. A generic
    // recovery may not steal it, but an already-owned recovery was vetoed above and cannot arrive
    // here through this exception.
    controllerState.invertedRecoveryActive = false;
    controllerState.invertedRecoveryRollArmed = false;
    controllerState.invertedRecoveryTargetBankDeg = null;
  } else if (combatDownhillSliceActive || combatDownhillRecoveryActive) {
    // The authored downhill slice and its explicit roll/pull-out state machine own the overbank.
    // Do not let the generic latch survive underneath and steal a same-side post-pass handoff just
    // because its deliberately banked recovery plane sits outside the generic entry envelope.
    controllerState.invertedRecoveryActive = false;
    controllerState.invertedRecoveryRollArmed = false;
    controllerState.invertedRecoveryTargetBankDeg = null;
  } else if ((combatDefensiveBreakActive
        && (combatDefensiveBreakPlaneMagnitudeDeg
            === COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG
          || controllerState.combatDefensiveHighPlaneComplete === true)
      || controllerState.combatDefensiveHighPlaneRecoveryActive === true)
      && !escapeRecovery) {
    // An attacker above owns an authored overbanked break plane. Terrain and vertical recovery
    // have already retained higher priority, but generic roll-to-level must not steal this safe,
    // latched defensive slice merely because it crosses the ordinary 100-degree entry boundary.
    controllerState.invertedRecoveryActive = false;
    controllerState.invertedRecoveryRollArmed = false;
    controllerState.invertedRecoveryTargetBankDeg = null;
  } else {
    controllerState.invertedRecoveryActive = invertedRecoveryRequiredNow;
    if (controllerState.invertedRecoveryActive !== true) {
      controllerState.invertedRecoveryRollArmed = false;
      controllerState.invertedRecoveryTargetBankDeg = null;
    } else if (!invertedRecoveryWasActive) {
      controllerState.invertedRecoveryTargetBankDeg = invertedRecoveryCandidateBankDeg;
      controllerState.invertedRecoveryRollArmed = combatRecoveryRollPermission;
    } else {
      if (!Number.isFinite(storedInvertedRecoveryTargetBankDeg)) {
        controllerState.invertedRecoveryTargetBankDeg = invertedRecoveryCandidateBankDeg;
      }
      if (controllerState.invertedRecoveryRollArmed !== true
          && combatRecoveryRollPermission) {
        controllerState.invertedRecoveryRollArmed = true;
      }
    }
  }
  const invertedRecovery = controllerState.invertedRecoveryActive === true;
  const invertedRecoveryRollArmed = invertedRecovery
    && controllerState.invertedRecoveryRollArmed === true;
  const invertedRecoveryReleaseDwell = invertedRecovery
    && invertedRecoveryKinematicsSettled
    && !verticalLevelUnloadSettled;
  const combatAftPursuitOwnerAvailable = mission === "f22"
    && !terrainEscapeRecovery
    && verticalRecoveryPhase === "idle"
    && !invertedRecovery
    && !combatDefensiveBreakActive
    && !combatDefensiveReleaseUnloadActive
    && !combatDownhillSliceActive
    && !combatDownhillRecoveryActive
    && !gunLeadFinisherActive;
  if (!combatAftPursuitOwnerAvailable) {
    controllerState.combatAftPursuitBankHoldActive = false;
  } else if (Math.abs(headingErrorDeg) >= 150
      && controllerState.combatAftPursuitBankHoldActive !== true) {
    // Tape 450's target crossed -178.8 -> +179.2 degrees behind the tail while ownship was still
    // at 5.22 G / 16.58 degrees alpha. Following the wrapped sign flipped -78 -> +78 and launched
    // a violent loaded half-roll. Choose one pursuit side on entry and retain it through the seam.
    controllerState.combatAftPursuitBankHoldActive = true;
    controllerState.combatAftPursuitBankHoldSign = Math.sign(
      Math.abs(currentBankDeg) > 20 ? currentBankDeg : desiredBankDeg,
    ) || 1;
  } else if (Math.abs(headingErrorDeg) <= 145 && verticalLevelUnloadSettled) {
    controllerState.combatAftPursuitBankHoldActive = false;
  }
  const combatAftPursuitBankHoldActive = combatAftPursuitOwnerAvailable
    && controllerState.combatAftPursuitBankHoldActive === true;
  const combatAftPursuitReleaseUnloadActive = combatAftPursuitBankHoldActive
    && Math.abs(headingErrorDeg) <= 145
    && !verticalLevelUnloadSettled;
  const combatAftPursuitBankHoldSign = Math.sign(
    finite(controllerState.combatAftPursuitBankHoldSign, 1),
  ) || 1;
  const gunLeadImminentPassBankHoldOwnerAvailable = mission === "f22"
    && gunLeadFinisherActive
    && !gunLeadTargetChanged
    && !gunLeadCartesianRollActive
    && !gunLeadRollCaptureActive
    && terrainRecoveryPhase === "idle"
    && verticalRecoveryPhase === "idle"
    && !invertedRecovery
    && !combatDefensiveReleaseUnloadActive
    && !combatDefensiveBreakActive
    && !combatDownhillSliceActive
    && !combatDownhillRecoveryActive;
  const gunLeadImminentPassTimeToClosestApproachS = closureKts > 0
    ? contactRangeM / Math.max(1, closureKts * 0.514444)
    : null;
  const gunLeadImminentPassBankHoldCanRemain =
    gunLeadImminentPassBankHoldOwnerAvailable
    && contactRangeM <= F22_GUN_LEAD_IMMINENT_PASS_HOLD_RANGE_M
    && closureKts > F22_GUN_LEAD_IMMINENT_PASS_RELEASE_CLOSURE_KTS
    && gunLeadImminentPassTimeToClosestApproachS !== null
    && gunLeadImminentPassTimeToClosestApproachS
      <= F22_GUN_LEAD_IMMINENT_PASS_HOLD_TIME_TO_CPA_S
    && leadOffBoresightDeg <= F22_GUN_LEAD_IMMINENT_PASS_HOLD_OFF_BORESIGHT_DEG;
  const gunLeadImminentPassBankHoldCanEnter =
    gunLeadImminentPassBankHoldCanRemain
    && contactRangeM <= F22_GUN_LEAD_IMMINENT_PASS_ENTER_RANGE_M
    && closureKts >= F22_GUN_LEAD_IMMINENT_PASS_ENTER_CLOSURE_KTS
    && gunLeadImminentPassTimeToClosestApproachS
      <= F22_GUN_LEAD_IMMINENT_PASS_ENTER_TIME_TO_CPA_S
    && leadOffBoresightDeg <= F22_GUN_LEAD_IMMINENT_PASS_ENTER_OFF_BORESIGHT_DEG
    && Math.abs(leadRollPlaneErrorDeg)
      <= F22_GUN_LEAD_IMMINENT_PASS_ENTER_PLANE_ERROR_DEG
    && Math.abs(leadRollPlaneErrorDeg)
      > F22_GUN_LEAD_FINISHER_MATERIAL_BANK_ERROR_DEG
    && Number.isFinite(measuredActualG)
    && measuredActualG >= F22_GUN_LEAD_FINISHER_REARM_MIN_G
    && Math.abs(currentRollRateDps)
      <= F22_GUN_LEAD_IMMINENT_PASS_ENTER_ROLL_RATE_DPS
    // Preserve a useful loaded plane only when the airframe is already settling on it or rolling
    // toward it. A same-sized rate moving away is a real transfer and must keep the unload owner.
    && (Math.abs(currentRollRateDps)
        <= F22_GUN_LEAD_IMMINENT_PASS_CONVERGED_ROLL_RATE_DPS
      || Math.sign(currentRollRateDps) === Math.sign(leadRollPlaneErrorDeg));
  const gunLeadPitchDominatedApproachBankHoldCanRemain =
    gunLeadImminentPassBankHoldOwnerAvailable
    && contactRangeM <= F22_GUN_LEAD_PITCH_APPROACH_HOLD_RANGE_M
    && closureKts > F22_GUN_LEAD_PITCH_APPROACH_HOLD_MIN_CLOSURE_KTS
    && closureKts <= F22_GUN_LEAD_PITCH_APPROACH_HOLD_MAX_CLOSURE_KTS
    && leadOffBoresightDeg <= F22_GUN_LEAD_PITCH_APPROACH_HOLD_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_PITCH_APPROACH_HOLD_LATERAL_ERROR_DEG
    && Math.abs(leadRollPlaneErrorDeg)
      <= F22_GUN_LEAD_PITCH_APPROACH_HOLD_MAX_PLANE_ERROR_DEG;
  const gunLeadPitchDominatedApproachBankHoldCanEnter =
    gunLeadPitchDominatedApproachBankHoldCanRemain
    && contactRangeM <= F22_GUN_LEAD_PITCH_APPROACH_ENTER_RANGE_M
    && closureKts >= F22_GUN_LEAD_PITCH_APPROACH_ENTER_MIN_CLOSURE_KTS
    && closureKts <= F22_GUN_LEAD_PITCH_APPROACH_ENTER_MAX_CLOSURE_KTS
    && leadOffBoresightDeg <= F22_GUN_LEAD_PITCH_APPROACH_ENTER_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_PITCH_APPROACH_ENTER_LATERAL_ERROR_DEG
    && Math.abs(leadRollPlaneErrorDeg)
      > F22_GUN_LEAD_FINISHER_MATERIAL_BANK_ERROR_DEG
    && Math.abs(leadRollPlaneErrorDeg)
      <= F22_GUN_LEAD_PITCH_APPROACH_ENTER_MAX_PLANE_ERROR_DEG
    && Number.isFinite(measuredActualG)
    && measuredActualG >= F22_GUN_LEAD_FINISHER_REARM_MIN_G
    && Math.abs(currentRollRateDps)
      <= F22_GUN_LEAD_PITCH_APPROACH_ENTER_MAX_ROLL_RATE_DPS
    && (Math.abs(currentRollRateDps)
        <= F22_GUN_LEAD_IMMINENT_PASS_CONVERGED_ROLL_RATE_DPS
      || Math.sign(currentRollRateDps) === Math.sign(leadRollPlaneErrorDeg));
  controllerState.gunLeadImminentPassBankHoldActive =
    controllerState.gunLeadImminentPassBankHoldActive === true
      ? gunLeadImminentPassBankHoldCanRemain
        || gunLeadPitchDominatedApproachBankHoldCanRemain
      : gunLeadImminentPassBankHoldCanEnter
        || gunLeadPitchDominatedApproachBankHoldCanEnter;
  const gunLeadImminentPassBankHoldActive =
    controllerState.gunLeadImminentPassBankHoldActive === true;
  const gunLeadPitchDominatedApproachBankHoldActive =
    gunLeadImminentPassBankHoldActive
    && gunLeadPitchDominatedApproachBankHoldCanRemain;
  if (terrainRecoveryPhase === "auto-gcas") {
    desiredBankDeg = currentBankDeg;
  } else if (terrainRecoveryPhase === "unload") {
    desiredBankDeg = currentBankDeg;
  } else if (terrainEscapeRecovery) {
    desiredBankDeg = 0;
  } else if (verticalRecoveryPhase === "slice") {
    // Tape 450 crossed the anti-zoom seam at 6.12 G / 18.68 degrees alpha. Commanding the
    // immediate large roll on that same frame produced the remaining visible ARI rudder kick.
    // Neutralize lift first, hold the physical plane while it decays, then make the earthward roll.
    desiredBankDeg = verticalRecoverySliceRollArmed
      ? controllerState.verticalRecoverySliceSign * COMBAT_VERTICAL_RECOVERY_BANK_DEG
      : currentBankDeg;
  } else if (verticalRecoveryPhase === "level") {
    // Tape 431 switched directly from a 5 G / 20-degree-AoA earthward pull to full aileron,
    // creating the brief ARI kick players read as top rudder. Hold the established slice plane
    // while the explicit unload decays lift, then roll upright. Recovery retains ownership until
    // both bank and body roll rate are genuinely settled.
    desiredBankDeg = controllerState.verticalRecoveryLevelRollArmed === true
      ? 0
      : currentBankDeg;
  } else if (combatDownhillRecoveryActive) {
    const recoveryBankDeg = combatDownhillPostPassConversionActive
      ? combatDownhillPostPassRecoveryBankDeg
      : 0;
    desiredBankDeg = (combatDownhillRecoveryPhase === "roll"
        && !combatDownhillRecoveryRollArmed)
        || combatDownhillRecoveryPhase === "release"
      ? currentBankDeg
      : recoveryBankDeg;
  } else if (invertedRecovery) {
    // Tape 447 left a downhill slice at 101.7 degrees of bank, 19.1 degrees alpha and 5 G, then
    // immediately commanded full opposite aileron toward -78 degrees. That loaded half-roll was
    // the only moment the F-22's ARI produced visible rudder. Hold the present plane while lift
    // unloads, then make one clean same-side roll to a fighting bank rather than coupling roll and
    // pitch at high alpha or rolling to zero only to reverse immediately back toward pursuit.
    desiredBankDeg = invertedRecoveryRollArmed && combatRecoveryRollPermission
      ? invertedRecoveryTargetBankDeg
      : currentBankDeg;
  } else if (combatDefensiveReleaseUnloadActive) {
    desiredBankDeg = currentBankDeg;
  } else if (combatDefensiveBreakActive) {
    desiredBankDeg = combatDefensiveBreakBankDeg;
  } else if (controllerState.combatDefensiveHighPlaneRecoveryActive === true) {
    desiredBankDeg = combatDefensiveHighPlaneRecoveryTargetBankDeg;
  } else if (combatDownhillSliceActive) {
    desiredBankDeg = combatDownhillSliceRollArmed
      ? combatDownhillSliceBankDeg
      : currentBankDeg;
  } else if (gunLeadCartesianRollActive) {
    // The transverse plane angle is undefined on the gun axis. Tape 398 followed its
    // -7.6 -> -92.3 degree jump and snapped to -96.5 dps; tape 400 froze it too early and missed
    // by two degrees. The body-right component is continuous through that same crossing, so use
    // it to ask for a bounded roll rate and publish the equivalent bank target for diagnostics.
    desiredBankDeg = gunLeadFinisherBoundedBankTargetDeg;
  } else if (gunLeadRollCaptureActive) {
    // A live Metal flight exposed a near-axis limit cycle: every residual-rate crossing changed
    // the sign of the noisy transverse plane, although the gun stayed within seven degrees of
    // lead. Hold the genuinely aligned bank and its normal rate damping until off-boresight—not
    // the unstable plane angle—proves that a new conversion is necessary.
    desiredBankDeg = gunLeadFinisherBoundedBankTargetDeg;
  } else if (gunLeadFinisherActive) {
    desiredBankDeg = gunLeadFinisherBoundedBankTargetDeg;
  } else if (combatAftPursuitBankHoldActive) {
    desiredBankDeg = combatAftPursuitReleaseUnloadActive
      ? currentBankDeg
      : combatAftPursuitBankHoldSign * F22_AFT_PURSUIT_BANK_LIMIT_DEG;
  }
  if (gunLeadImminentPassBankHoldActive) {
    // Tape 489 reached a maturing 8.3-G conversion at 398 m / 660 kt closure with ballistic lead
    // already inside 13 degrees. Chasing the rapidly rotating transverse plane demanded a new
    // material bank at less than one second to CPA, so the safety interlock correctly unloaded —
    // and discarded the only near-gun pass. Commit the useful physical lift plane through this
    // brief corridor, rate-damp it, and keep pulling. Tape 493 exposed the same error one second
    // earlier: at 1,118 m the total miss was only 7.06 degrees and body-right miss only 2.03,
    // while a 16.7-degree transverse-plane trim discarded a healthy 7 G pitch conversion. The
    // narrow pitch-dominated approach corridor holds that already-useful plane too. Continuous
    // Cartesian/captured-axis control still preempts the latch if a real fine solution forms;
    // opening geometry or a material lateral miss releases it.
    desiredBankDeg = currentBankDeg;
  }

  const combatLoadedPursuitLiveDesiredBankDeg = desiredBankDeg;
  const combatLoadedPursuitBankHoldOwnerAvailable = mission === "f22"
    && combatMission
    && terrainRecoveryPhase === "idle"
    && verticalRecoveryPhase === "idle"
    && !invertedRecovery
    && !combatDefensiveReleaseUnloadActive
    && !combatDefensiveBreakActive
    && !combatDownhillSliceActive
    && !combatDownhillRecoveryActive
    && !gunLeadFinisherActive
    && !gunLeadRollCaptureActive
    && !gunLeadCartesianRollActive
    && !combatAftPursuitBankHoldActive
    && controllerState.combatLoadedRollUnloadActive !== true;
  const combatLoadedPursuitSameSideReduction =
    Math.sign(combatLoadedPursuitLiveDesiredBankDeg) === Math.sign(currentBankDeg)
    && Math.sign(currentBankDeg) !== 0
    && Math.abs(combatLoadedPursuitLiveDesiredBankDeg)
      < Math.abs(currentBankDeg);
  const combatLoadedPursuitLoadTelemetryValid = Number.isFinite(measuredActualG)
    && Number.isFinite(measuredAoaDeg);
  const combatLoadedPursuitHoldPhysicalEnvelope =
    combatLoadedPursuitLoadTelemetryValid
    && rollRateTelemetryValid
    && measuredActualG > COMBAT_LOADED_PURSUIT_HOLD_MIN_G
    && Math.abs(currentBankDeg) >= COMBAT_LOADED_PURSUIT_HOLD_MIN_BANK_DEG
    && Math.abs(currentBankDeg) <= COMBAT_LOADED_PURSUIT_HOLD_MAX_BANK_DEG
    && contactRangeM >= COMBAT_LOADED_PURSUIT_HOLD_MIN_RANGE_M
    && Math.abs(headingErrorDeg)
      > COMBAT_LOADED_PURSUIT_HOLD_MIN_HEADING_ERROR_DEG;
  const combatLoadedPursuitHoldCanRemain =
    combatLoadedPursuitBankHoldOwnerAvailable
    && combatLoadedPursuitHoldPhysicalEnvelope
    && Math.sign(combatLoadedPursuitLiveDesiredBankDeg) === Math.sign(currentBankDeg)
    && Math.abs(combatLoadedPursuitLiveDesiredBankDeg)
      <= Math.abs(currentBankDeg)
        + COMBAT_LOADED_PURSUIT_HOLD_RELEASE_BANK_GROWTH_DEG;
  const combatLoadedPursuitHoldCanEnter = combatLoadedPursuitHoldCanRemain
    && combatLoadedPursuitSameSideReduction
    && Math.abs(wrapAngleDeg(
      combatLoadedPursuitLiveDesiredBankDeg - currentBankDeg,
    )) >= COMBAT_LOADED_PURSUIT_HOLD_MIN_REDUCTION_DEG;
  if (controllerState.combatLoadedPursuitBankHoldActive === true) {
    controllerState.combatLoadedPursuitBankHoldActive =
      combatLoadedPursuitHoldCanRemain;
  } else {
    controllerState.combatLoadedPursuitBankHoldActive =
      combatLoadedPursuitHoldCanEnter;
  }
  const combatLoadedPursuitBankHoldActive =
    controllerState.combatLoadedPursuitBankHoldActive === true;
  if (combatLoadedPursuitBankHoldActive) {
    // Tape 468 spent three quarters of a five-second lead turn repeatedly unloading and moving
    // the lift plane in 12.5-degree steps as the same-side pursuit target relaxed toward level.
    // Retain the already-loaded physical plane until the contact reaches the 35-degree conversion
    // region. Setting the target to the measured bank permits rate damping only: no accelerating
    // aileron is authorized under G, and every tactical/recovery owner above still preempts it.
    desiredBankDeg = currentBankDeg;
  }

  // Preserve the live tactical request before a committed loaded-roll transfer replaces it with
  // its frozen target below. A far-from-axis finisher may keep rotating in the same physical
  // direction while the unloaded jet reaches that first target; Tape 459 needs the live value to
  // continue that one transfer without a one-frame pull/reload pulse. Near-axis geometry remains
  // frozen because its transverse plane is singular.
  const combatLoadedRollLiveDesiredBankDeg = desiredBankDeg;
  if (gunLeadFinisherActive
      && controllerState.combatLoadedRollUnloadActive === true) {
    // A transfer captured before the fighting-bank guard was evaluated can otherwise keep an
    // obsolete overbank target alive for several seconds. Clamp the committed target too:
    // the unload interlock may brake back to the boundary, but final-axis ownership never earns a
    // loaded knife-edge plane merely because that target was frozen on an earlier frame.
    controllerState.combatLoadedRollTargetBankDeg = boundedGunLeadFinisherBankDeg(
      finite(controllerState.combatLoadedRollTargetBankDeg, currentBankDeg),
    );
    controllerState.combatLoadedRollTransferSign = Math.sign(wrapAngleDeg(
      controllerState.combatLoadedRollTargetBankDeg - currentBankDeg,
    ));
  }

  // Tape 455 detected a threat while downhill recovery still owned the aircraft. The proposed
  // -55-degree break never reached desiredBankDeg, but the old code immediately recorded its sign
  // as committed. The next close-rear episode therefore alternated from a manoeuvre that had not
  // happened and rolled the wrong way across 112 degrees. Commit episode history only when the
  // defensive branch genuinely owns the control target; a load interlock may still stage that
  // owned plane safely, but a higher-priority recovery cannot poison the next episode.
  const combatDefensiveBreakControlOwned = combatDefensiveBreakActive
    && terrainRecoveryPhase === "idle"
    && verticalRecoveryPhase === "idle"
    && !combatDownhillRecoveryActive
    && !invertedRecovery
    && !combatDefensiveReleaseUnloadActive;
  const combatDefensiveLowPlaneBankDeg =
    (controllerState.combatDefensiveBreakSign || 1)
      * COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG;
  let combatDefensiveLowPlanePhysicallyEngaged = false;
  let combatDefensiveLowPlaneTransitionDeferred = false;
  const combatDefensiveLowPlaneClosureMps = closureKts > 1
    ? closureKts * 0.514444
    : null;
  const combatDefensiveLowPlaneTimeToClosestApproachS =
    combatDefensiveLowPlaneClosureMps !== null
    ? contactRangeM / combatDefensiveLowPlaneClosureMps
    : null;
  const combatDefensiveLowPlaneTimeToGunEnvelopeS =
    combatDefensiveLowPlaneClosureMps !== null
    ? Math.max(0, contactRangeM - COMBAT_DEFENSIVE_GUN_ENVELOPE_M)
      / combatDefensiveLowPlaneClosureMps
    : null;
  const combatDefensiveIncomingTracerActive =
    Array.isArray(state?.opponent_tracers)
    && state.opponent_tracers.length > 0;
  let combatDefensiveTransferGunfireAbort = false;
  if (combatDefensiveBreakControlOwned
      && controllerState.combatLoadedRollUnloadActive === true
      && (hostileGunFiring || primaryGunFiring || combatDefensiveIncomingTracerActive)
      && Math.abs(currentBankDeg) >= 20) {
    // Tapes 487/488 caught both sides of the same bug. A planned 55->78 improvement and a fresh
    // 105-degree break-plane reversal each kept pitch at 0.8 G after the actual burst arrived. A
    // real round outranks bank perfection: retain whichever useful bank the jet physically has,
    // release the roll owner, and rebuild defensive G immediately through projectile flight.
    const gunfireHoldMagnitudeDeg = Math.min(
      COMBAT_DEFENSIVE_BASE_BANK_DEG,
      Math.abs(currentBankDeg),
    );
    controllerState.combatDefensiveBreakSign = Math.sign(currentBankDeg) || 1;
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg = gunfireHoldMagnitudeDeg;
    combatDefensiveBreakPlaneMagnitudeDeg = gunfireHoldMagnitudeDeg;
    combatDefensiveBreakBankDeg =
      (controllerState.combatDefensiveBreakSign || 1) * gunfireHoldMagnitudeDeg;
    desiredBankDeg = combatDefensiveBreakBankDeg;
    controllerState.combatLoadedRollUnloadActive = false;
    controllerState.combatLoadedRollPhase = "idle";
    controllerState.combatLoadedRollTargetBankDeg = null;
    controllerState.combatLoadedRollTransferSign = 0;
    controllerState.combatLoadedRollUnloadSamples = 0;
    controllerState.combatDefensiveGunfireBankHoldActive = true;
    combatDefensiveTransferGunfireAbort = true;
  }
  const combatDefensiveGunfireBankHoldActive =
    combatDefensiveBreakActive
    && controllerState.combatDefensiveGunfireBankHoldActive === true;
  const combatDefensiveHighClimbLoadLimited = combatDefensiveBreakActive
    && combatDefensiveBreakPlaneMagnitudeDeg < COMBAT_DEFENSIVE_BASE_BANK_DEG
    // Tape 492 survived the first burst at full load, then held this 3 G climb cap while the
    // bandit fired again from 247 m and was killed. Containment is only for the quiet interval;
    // fresh muzzle fire or an airborne round must restore max-performance defense immediately.
    && !hostileGunFiring
    && !combatDefensiveIncomingTracerActive
    && currentGammaDeg >= COMBAT_DEFENSIVE_HIGH_CLIMB_MIN_GAMMA_DEG
    && Number.isFinite(defensiveShooterElevationDeg)
    && currentGammaDeg - defensiveShooterElevationDeg
      >= COMBAT_DEFENSIVE_HIGH_CLIMB_MIN_SHOOTER_BELOW_PATH_DEG;
  const projectedSustainedLoadedBankDeg = wrapAngleDeg(
    currentBankDeg
      + currentRollRateDps * F22_GUN_LEAD_FINISHER_OVERBANK_PREDICTION_S,
  );
  const combatDefensiveProjectedOutwardOverbank = Math.abs(currentBankDeg)
      <= F22_SUSTAINED_LOADED_OVERBANK_LIMIT_DEG
    && Math.abs(projectedSustainedLoadedBankDeg)
      > F22_SUSTAINED_LOADED_OVERBANK_LIMIT_DEG
    && Math.abs(projectedSustainedLoadedBankDeg) > Math.abs(currentBankDeg);
  const combatDefensiveOverbankGuardActive = combatDefensiveBreakControlOwned
    && combatDefensiveBreakPlaneMagnitudeDeg === COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG
    && (Math.abs(currentBankDeg) > F22_SUSTAINED_LOADED_OVERBANK_LIMIT_DEG
      || combatDefensiveProjectedOutwardOverbank);
  const combatGenericOverbankGuardActive = mission === "f22"
    && !gunLeadFinisherActive
    && !combatDefensiveBreakControlOwned
    && !escapeRecovery
    && !combatDownhillSliceActive
    && !combatDownhillRecoveryActive
    && !invertedRecovery
    && Number.isFinite(measuredActualG)
    && Math.abs(measuredActualG) > COMBAT_RECOVERY_ROLL_MAX_G
    && (Math.abs(currentBankDeg) > F22_SUSTAINED_LOADED_OVERBANK_LIMIT_DEG
      || combatDefensiveProjectedOutwardOverbank);
  if (combatDefensiveBreakControlOwned) {
    controllerState.combatDefensiveBreakHasCommitted = true;
    controllerState.combatDefensiveLastCommittedBreakSign = Math.sign(
      finite(controllerState.combatDefensiveBreakSign, 1),
    ) || 1;
  }

  // Tape 451 exposed the common seam underneath three apparently unrelated visual failures:
  // terrain-recovery release, defensive-break entry and ordinary/finisher close-pass pursuit all
  // selected a new lift plane while the aircraft still carried 5-8 G. The F-22 then turned that
  // aileron into either ARI rudder at high alpha or a large rolling skid below ARI onset. Preview
  // the exact rate-damped roll command before applying it. If it is material while measured
  // G/alpha are unsafe, retain the physical plane and unload. Tape 473 proved that an apparently
  // opposite-sign brake can cross zero inside one 20 Hz plant interval and become accelerating
  // aileron under 8 G; safe braking therefore happens inside the unload owner with zero target
  // rate, not by carrying tactical feed-forward through zero. Explicit terrain/vertical/downhill/
  // inverted recoveries keep their narrower safety state machines above this handoff interlock.
  const preliminaryBankErrorDeg = gunLeadRollCaptureActive
    ? wrapAngleDeg(desiredBankDeg - currentBankDeg)
    : gunLeadFinisherActive
      ? wrapAngleDeg(desiredBankDeg - currentBankDeg)
    : wrapAngleDeg(desiredBankDeg - currentBankDeg);
  const preliminaryDesiredRollRateGain = gunLeadRollCaptureActive
    ? F22_GUN_LEAD_ROLL_CAPTURE_RATE_GAIN
    : 2.4;
  const preliminaryDesiredRollRateDps = gunLeadCartesianRollActive
      && !gunLeadFinisherOverbankGuardActive
    ? gunLeadCartesianRollRateDps
    : clamp(
      preliminaryBankErrorDeg * preliminaryDesiredRollRateGain,
      -120,
      120,
    );
  const preliminaryRollRateDampingDps = gunLeadRollCaptureActive
      || escapeRecovery || combatDownhillRecoveryActive
      || invertedRecovery || combatDefensiveBreakActive
    ? F22_GUN_LEAD_ROLL_CAPTURE_DAMPING_DPS
    : 240;
  const preliminaryRawRoll = preliminaryDesiredRollRateDps / 120
    - currentRollRateDps / preliminaryRollRateDampingDps;
  const gunLeadCapturedPitchLoadedTrimActive = gunLeadFinisherActive
    && gunLeadRollCaptureActive
    && gunLeadPitchIsolationRollHold
    && gunLeadCartesianRollActive
    && leadOffBoresightDeg <= F22_GUN_LEAD_ROLL_CAPTURE_RELEASE_OFF_BORESIGHT_DEG
    && Math.abs(leadLateralErrorDeg)
      <= F22_GUN_LEAD_CARTESIAN_ROLL_BIAS_MAX_ERROR_DEG + 0.15
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_CAPTURED_PITCH_HOLD_ROLL_RATE_DPS
    && Math.abs(preliminaryDesiredRollRateDps) <= 15
    && Math.abs(preliminaryRawRoll) < 0.20
    && !gunLeadFinisherOverbankGuardActive;
  // Tape 457's correctly established -55-degree defensive break drifted to -67.5 degrees under
  // 7.5 G. Its small +0.14 rate-damped aileron correction was safe bank maintenance, but the
  // undamped target-rate term crossed the generic 0.25 plane-change threshold by 0.0002 and
  // repeatedly dumped the defensive pull. Inside the authored same-side -55..-78-degree lane,
  // trust the actual rate-damped command; a cross-side, overbanked or material correction still
  // enters the full unload/transfer interlock.
  const combatDefensiveLowPlaneMaintenance = combatDefensiveBreakControlOwned
    && combatDefensiveBreakPlaneMagnitudeDeg === COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG
    && Math.sign(currentBankDeg) === Math.sign(combatDefensiveBreakBankDeg)
    && Math.abs(currentBankDeg) >= COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG
    && Math.abs(currentBankDeg) <= COMBAT_DEFENSIVE_BASE_BANK_DEG
    && Math.abs(preliminaryRawRoll) < 0.25;
  const combatLoadTelemetryValid = Number.isFinite(measuredActualG)
    && Number.isFinite(measuredAoaDeg);
  // Tactical plane-change permission is safety evidence, so absent telemetry cannot be treated as
  // an unloaded aircraft. Live acceptance separately rejects the missing channel; this fail-closed
  // branch prevents the controller from making the unsafe command before the observer reports it.
  const combatLoadUnsafeOrUnknown = !combatLoadTelemetryValid
    || Math.abs(measuredActualG) > COMBAT_RECOVERY_ROLL_MAX_G
    || Math.abs(measuredAoaDeg) > COMBAT_RECOVERY_ROLL_MAX_AOA_DEG;
  const combatLoadedRollOwnerAvailable = f22LoadedRollProtection
    && !terrainEscapeRecovery
    && verticalRecoveryPhase === "idle"
    && !invertedRecovery
    && !combatDefensiveReleaseUnloadActive
    && !combatAftPursuitReleaseUnloadActive
    && !combatDownhillSliceActive
    && !combatDownhillRecoveryActive;
  // Tape 498 at 67.942 s asked for +32.7 -> +19.7 degrees of bank: the same side, a smaller
  // magnitude, a rate-damped command of about -0.218 under the shared 0.25 materiality boundary,
  // and the jet already rolling that way. The static 12.5-degree gate still called that a tactical
  // plane change, dumped to 0.8 G, and let lateral error grow while ballistic lead was improving
  // to 4.80 degrees. Maintaining a captured plane is not a plane change. Cross-side, increasing,
  // wrong-way, overbank and material commands fall through to the interlock unchanged.
  const gunLeadFinisherMaintenanceTrim = gunLeadFinisherActive
    && Math.abs(preliminaryRawRoll) < 0.25
    && Math.sign(desiredBankDeg) === Math.sign(currentBankDeg)
    && Math.abs(desiredBankDeg) < Math.abs(currentBankDeg)
    && Math.abs(currentBankDeg) <= F22_GUN_LEAD_FINISHER_OVERBANK_LIMIT_DEG
    && (currentRollRateDps === 0
      || Math.sign(currentRollRateDps) === Math.sign(preliminaryBankErrorDeg));
  const materialTacticalPlaneChangeRequested =
    (Math.abs(preliminaryDesiredRollRateDps / 120) >= 0.25
      // The sustainable 82-degree high break can be only a few degrees from an existing 78-degree
      // turn. Its one-shot conversion back to 78 is still a tactical handoff and unloads, but
      // ordinary high-plane maintenance does not re-enter until it has drifted outside the same
      // eight-degree capture gate which releases the interlock.
      || (combatDefensiveBreakControlOwned
        && (controllerState.combatDefensiveHighPlaneRecoveryActive === true
          || Math.abs(preliminaryBankErrorDeg)
            > COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG))
      || (gunLeadFinisherActive
        && !gunLeadCapturedPitchLoadedTrimActive
        && Math.abs(preliminaryBankErrorDeg)
          > F22_GUN_LEAD_FINISHER_MATERIAL_BANK_ERROR_DEG))
    && !combatDefensiveLowPlaneMaintenance
    && !gunLeadFinisherMaintenanceTrim;
  const materialUnsafeRollRequested = materialTacticalPlaneChangeRequested
    || (rollRateTelemetryValid
      ? Math.abs(preliminaryRawRoll) >= 0.25
    // A stale body rate can cancel a material desired plane change, or can drive a large damping
    // command with the wrong sign after the unseen aircraft reverses. Either case is unsafe while
    // loaded: enter the unload owner and emit no lateral input until a current rate arrives.
      : Math.abs(preliminaryRawRoll) >= 0.25);
  const capturedGunAxisTransferReady = gunLeadFinisherActive
    && !gunLeadTargetChanged
    && gunLeadRollCaptureActive
    && leadOffBoresightDeg <= 3
    && Math.abs(leadLateralErrorDeg) <= 0.8
    && Math.abs(currentRollRateDps) <= F22_GUN_LEAD_ROLL_CAPTURE_ENTER_RATE_DPS
    && combatPlaneChangeUnloadSettled;
  let combatLoadedRollPursuitRetargetMode = "none";
  if (!combatLoadedRollOwnerAvailable) {
    controllerState.combatLoadedRollUnloadActive = false;
    controllerState.combatLoadedRollPhase = "idle";
    controllerState.combatLoadedRollTransferSign = 0;
    controllerState.combatLoadedRollUnloadSamples = 0;
  } else if (controllerState.combatLoadedRollUnloadActive !== true
      && !combatPlaneChangeUnloadSettled
      && materialUnsafeRollRequested) {
    controllerState.combatLoadedRollUnloadActive = true;
    controllerState.combatLoadedRollPhase = "unload";
    controllerState.combatLoadedRollTargetBankDeg = desiredBankDeg;
    controllerState.combatLoadedRollTransferSign = Math.sign(wrapAngleDeg(
      desiredBankDeg - currentBankDeg,
    ));
    controllerState.combatLoadedRollUnloadSamples = 0;
  } else if (controllerState.combatLoadedRollUnloadActive === true
      && combatDefensiveBreakControlOwned
      && Math.abs(wrapAngleDeg(
        combatDefensiveBreakBankDeg
          - finite(controllerState.combatLoadedRollTargetBankDeg, currentBankDeg),
      )) > COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG) {
    // Tape 461 acquired a point-blank aiming threat while an unrelated +78-degree transfer was
    // already committed. The defensive owner selected -55, but the frozen target kept rolling
    // toward +78 for another second before releasing; the bandit then fired from 167 m. Retarget
    // the existing interlock to the stable, episode-latched break plane and return to unload so
    // the rate damper arrests any opposing roll before the evasive plane accelerates.
    controllerState.combatLoadedRollPhase = "unload";
    controllerState.combatLoadedRollTargetBankDeg = combatDefensiveBreakBankDeg;
    controllerState.combatLoadedRollTransferSign = Math.sign(wrapAngleDeg(
      combatDefensiveBreakBankDeg - currentBankDeg,
    ));
    controllerState.combatLoadedRollUnloadSamples = 0;
  } else if (controllerState.combatLoadedRollUnloadActive === true
      && gunLeadTargetChanged) {
    // A committed roll belongs to the physical target that authored it. Promotion can occur
    // without changing the selected slot or engagement number, so reseed the new contact's plane
    // under the existing unload instead of completing or extending the dead target's transfer.
    controllerState.combatLoadedRollPhase = "unload";
    controllerState.combatLoadedRollTargetBankDeg = desiredBankDeg;
    controllerState.combatLoadedRollTransferSign = Math.sign(wrapAngleDeg(
      desiredBankDeg - currentBankDeg,
    ));
    controllerState.combatLoadedRollUnloadSamples = 0;
  } else if (controllerState.combatLoadedRollUnloadActive === true) {
    if (controllerState.combatLoadedRollPhase === "roll") {
      const continuousNearAxisCartesianTransfer = gunLeadFinisherActive
        && !gunLeadTargetChanged
        && !gunLeadRollCaptureActive
        && gunLeadCartesianRollActive;
      if (continuousNearAxisCartesianTransfer) {
        // Tape 460 reached the continuous Cartesian lane while an earlier far-axis transfer still
        // owned a frozen bank. Holding that target left a two-degree lateral miss; releasing it
        // handed control to the singular transverse angle and commanded a needless half-roll.
        // The body-right Cartesian rate is explicitly continuous through boresight, so follow its
        // bounded equivalent bank while retaining unload until real Cartesian capture takes over.
        controllerState.combatLoadedRollTargetBankDeg =
          boundedGunLeadFinisherBankDeg(combatLoadedRollLiveDesiredBankDeg);
        controllerState.combatLoadedRollUnloadSamples = 0;
      } else if ((leadCartesianCaptureConverged || capturedGunAxisTransferReady)
          && combatPlaneChangeUnloadSettled) {
        // Cartesian convergence already proves that the physical body-right miss and roll rate
        // are settled. Tape 469 exposed the immediately adjacent case: transverse-plane capture
        // had latched at 1.76 degrees from the gun, then the continuous lateral miss settled to
        // 0.18 degrees while an obsolete 29-degree transfer kept pitch at 0.8 G for another 1.7
        // seconds. Once the real gun axis, captured plane, roll rate and physical unload all agree,
        // release directly to that captured lift plane even if the old bounded-rate target still
        // trails by more than the generic eight-degree gate. Production cone and trigger dwell are
        // untouched; this changes only which already-safe roll owner gets the next frame.
        controllerState.combatLoadedRollUnloadActive = false;
        controllerState.combatLoadedRollPhase = "idle";
        controllerState.combatLoadedRollTransferSign = 0;
        controllerState.combatLoadedRollUnloadSamples = 0;
      } else {
        const targetBankDeg = wrapAngleDeg(finite(
          controllerState.combatLoadedRollTargetBankDeg,
          currentBankDeg,
        ));
        const transferCaptureBankErrorDeg = gunLeadFinisherActive
            && !gunLeadRollCaptureActive
          // Tape 475 released a far-axis transfer with 6.8 degrees of live plane still left,
          // then immediately rebuilt 6.6 G. The lead plane outran the loaded roll plant and the
          // pipper missed laterally. Final-axis transfer needs the tighter physical margin; all
          // defensive, recovery and ordinary pursuit planes retain the proved eight-degree gate.
          ? 4
          : COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG;
        const targetCaptured = Math.abs(wrapAngleDeg(targetBankDeg - currentBankDeg))
            <= transferCaptureBankErrorDeg
          && Math.abs(currentRollRateDps) <= COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS
          && combatPlaneChangeUnloadSettled;
        if (targetCaptured) {
          const liveTargetDeltaDeg = wrapAngleDeg(
            combatLoadedRollLiveDesiredBankDeg - targetBankDeg,
          );
          const liveTargetErrorDeg = wrapAngleDeg(
            combatLoadedRollLiveDesiredBankDeg - currentBankDeg,
          );
          const transferSign = Math.sign(finite(
            controllerState.combatLoadedRollTransferSign,
          ));
          const continueFarAxisFinisherTransfer = gunLeadFinisherActive
            && !gunLeadTargetChanged
            && !gunLeadRollCaptureActive
            && leadOffBoresightDeg > F22_GUN_LEAD_ROLL_CAPTURE_RELEASE_OFF_BORESIGHT_DEG
            && Math.abs(liveTargetErrorDeg) > transferCaptureBankErrorDeg
            && Math.sign(liveTargetDeltaDeg) === transferSign;
          const holdFrozenFinisherTransfer = gunLeadFinisherActive
            && !gunLeadTargetChanged
            && !gunLeadRollCaptureActive
            && Math.abs(liveTargetErrorDeg) > transferCaptureBankErrorDeg;
          const continueOrdinaryPursuitTransfer = !gunLeadFinisherActive
            && !gunLeadRollCaptureActive
            && !gunLeadCartesianRollActive
            && !combatDefensiveBreakActive
            && !combatDefensiveBreakControlOwned
            && !combatAftPursuitBankHoldActive
            && Math.abs(liveTargetErrorDeg)
              > COMBAT_PLANE_CHANGE_CAPTURE_BANK_ERROR_DEG;
          if (continueFarAxisFinisherTransfer) {
            // Tape 459 reached -49.2 while the live far-axis plane had advanced to -40.1, released
            // pitch for one frame, then immediately unloaded and repeated at -39.6/-31.7/-17.7.
            // Continue the already-safe, same-direction transfer instead. Tape 456's seven-degree
            // near-axis singularity cannot enter this branch and retains frozen precedence.
            controllerState.combatLoadedRollTargetBankDeg =
              boundedGunLeadFinisherBankDeg(combatLoadedRollLiveDesiredBankDeg);
            controllerState.combatLoadedRollUnloadSamples = 0;
          } else if (holdFrozenFinisherTransfer) {
            // The 6..12-degree shoulder is intentionally too close to the transverse-axis
            // singularity to walk a frozen plane, but it is not permission to emit one frame of
            // full pull while the live plane is still materially uncaptured. Keep the stable
            // target and unload until Cartesian ownership takes over or the live error really
            // settles inside the same four-degree release gate.
            controllerState.combatLoadedRollUnloadSamples = 0;
          } else if (continueOrdinaryPursuitTransfer) {
            // Tape 470 captured each frozen pursuit plane, emitted one idle frame with 7-8 G and
            // a large aileron pulse, then immediately discovered that the live plane had advanced
            // 10-40 degrees and re-entered unload. That pull/reload pulse generated the measured
            // 2.5-Hz rocking burst. Ordinary pursuit already owns a safe unloaded transfer here;
            // move its target without ever passing through loaded idle. Same-direction motion is
            // one continuous roll. A crossed target returns directly to unload so body rate can
            // brake before the new direction is armed. Finisher, Cartesian, defense, aft-pursuit
            // and recovery owners remain on their dedicated branches.
            controllerState.combatLoadedRollTargetBankDeg =
              combatLoadedRollLiveDesiredBankDeg;
            const liveTransferSign = Math.sign(liveTargetErrorDeg);
            if (Math.sign(liveTargetDeltaDeg) === transferSign
                && transferSign !== 0) {
              combatLoadedRollPursuitRetargetMode = "advance";
            } else {
              combatLoadedRollPursuitRetargetMode = "reverse";
              controllerState.combatLoadedRollPhase = "unload";
              controllerState.combatLoadedRollTransferSign = liveTransferSign;
            }
            controllerState.combatLoadedRollUnloadSamples = 0;
          } else {
            controllerState.combatLoadedRollUnloadActive = false;
            controllerState.combatLoadedRollPhase = "idle";
            controllerState.combatLoadedRollTransferSign = 0;
            controllerState.combatLoadedRollUnloadSamples = 0;
          }
        }
      }
    } else {
      controllerState.combatLoadedRollPhase = "unload";
      controllerState.combatLoadedRollUnloadSamples = combatPlaneChangeUnloadSettled
        ? finite(controllerState.combatLoadedRollUnloadSamples) + 1
        : 0;
      if (controllerState.combatLoadedRollUnloadSamples
          >= COMBAT_PLANE_CHANGE_ARM_SAMPLES) {
        // Capture the requested plane once, then finish that transfer under an unload. The old
        // boolean latch released as soon as actual G crossed 2.5, immediately rebuilt tactical
        // pull, and re-entered on the next frame. Tape 453 recorded the resulting -55/current-bank
        // target pulse as 3.5 roll-command reversals per second.
        controllerState.combatLoadedRollPhase = "roll";
      }
    }
  }
  const combatLoadedRollUnloadActive = combatLoadedRollOwnerAvailable
    && controllerState.combatLoadedRollUnloadActive === true;
  const combatLoadedRollPhase = combatLoadedRollUnloadActive
    ? controllerState.combatLoadedRollPhase
    : "idle";
  if (combatLoadedRollUnloadActive) {
    desiredBankDeg = combatLoadedRollPhase === "roll"
      ? wrapAngleDeg(finite(controllerState.combatLoadedRollTargetBankDeg, currentBankDeg))
      : currentBankDeg;
  }

  // Count only a physically flown low-plane pull after every recovery and loaded-roll owner has
  // released. Evaluating here also excludes the exact frame which *enters* the interlock; reading
  // its state before that arbitration made Tape 487 spend one sample while it was starting an
  // unloaded transfer. The established 55..78-degree maintenance lane deliberately tolerates
  // normal pitch/roll coupling instead of requiring a perfect 55-degree Euler bank.
  combatDefensiveLowPlanePhysicallyEngaged =
    combatDefensiveBreakControlOwned
    && combatDefensiveBreakPlaneMagnitudeDeg === COMBAT_DEFENSIVE_LOW_PLANE_BANK_DEG
    && !combatLoadedRollUnloadActive
    && combatDefensiveLowPlaneMaintenance
    && Number.isFinite(measuredActualG)
    && measuredActualG >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_MIN_G
    && Number.isFinite(state?.requested_g_cmd)
    && state.requested_g_cmd >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_MIN_G
    && Number.isFinite(state?.g_cmd)
    && state.g_cmd >= COMBAT_DEFENSIVE_HIGH_PLANE_RELEASE_MIN_G;
  if (combatDefensiveLowPlanePhysicallyEngaged
      && controllerState.combatDefensiveLowPlaneComplete !== true) {
    controllerState.combatDefensiveLowPlaneSamples = Math.min(
      COMBAT_DEFENSIVE_LOW_PLANE_MAX_SAMPLES,
      finite(controllerState.combatDefensiveLowPlaneSamples) + 1,
    );
    if (controllerState.combatDefensiveLowPlaneSamples
        >= COMBAT_DEFENSIVE_LOW_PLANE_MAX_SAMPLES) {
      combatDefensiveLowPlaneTransitionDeferred =
        hostileGunFiring
        || primaryGunFiring
        || combatDefensiveIncomingTracerActive
        || (combatDefensiveLowPlaneTimeToGunEnvelopeS !== null
          && combatDefensiveLowPlaneTimeToGunEnvelopeS
            <= COMBAT_DEFENSIVE_LOW_PLANE_TRANSFER_REBUILD_S)
        // A co-speed stern shooter has no finite closing-time estimate but is already dangerous.
        || (contactRangeM <= COMBAT_DEFENSIVE_GUN_ENVELOPE_M
          && closureKts
            > COMBAT_DEFENSIVE_LOW_PLANE_CLOSE_OPENING_RELEASE_KTS);
      if (!combatDefensiveLowPlaneTransitionDeferred) {
        // Preserve one second of *flown, loaded* displacement—not one second spent unloading and
        // travelling toward the plane—then ask the next controller frame to transfer through the
        // measured-load interlock to the same-side sustained lateral break. Tape 487 reached this
        // point only 2.14 seconds from CPA and was already inside the 900 m gun envelope; unloading
        // there let the bandit fire three clean rounds. Keep pulling until there is at least 1.6
        // seconds before gun range, or until the pass is opening, so the unload, roll and G rebuild
        // fit before the shot.
        controllerState.combatDefensiveLowPlaneComplete = true;
        controllerState.combatDefensiveBreakPlaneMagnitudeDeg =
          COMBAT_DEFENSIVE_BASE_BANK_DEG;
      }
    }
  }

  // Tape 456 froze a safe -76.99-degree transfer target, but this selector let the still-active
  // finisher replace its control error with the live near-axis plane after unload. Telemetry kept
  // reporting -76.99 while the ailerons chased a 102-degree singular vector for 5.5 seconds. A
  // committed transfer owns both its published target and its rate loop until physical capture.
  const bankErrorDeg = combatLoadedRollUnloadActive
    ? combatLoadedRollPhase === "roll"
      ? wrapAngleDeg(desiredBankDeg - currentBankDeg)
      : 0
    : gunLeadRollCaptureActive
      ? wrapAngleDeg(desiredBankDeg - currentBankDeg)
      : gunLeadFinisherActive
        ? wrapAngleDeg(desiredBankDeg - currentBankDeg)
        : wrapAngleDeg(desiredBankDeg - currentBankDeg);
  // Command a roll rate, then damp it with the authority-published body rate. The old direct
  // bank-error controller kept commanding through the target bank, reversing only after the
  // aircraft had overshot. A real 180-second F-22 tape recorded nearly two strong command
  // reversals per second—the visible left/right rocking reported by players.
  const desiredRollRateGain = canyonFlight ? 3.15
    : gunLeadRollCaptureActive ? F22_GUN_LEAD_ROLL_CAPTURE_RATE_GAIN
      : 2.4;
  const nominalDesiredRollRateDps = combatLoadedRollUnloadActive
    ? combatLoadedRollPhase === "roll"
      ? clamp(bankErrorDeg * desiredRollRateGain, -120, 120)
      : 0
    : gunLeadCartesianRollActive && !gunLeadFinisherOverbankGuardActive
      ? gunLeadCartesianRollRateDps
      : clamp(
        bankErrorDeg * desiredRollRateGain,
        -120,
        120,
      );
  // Tape 460 exposed two visually violent but fully unloaded owner handoffs. Inverted recovery
  // replaced a +96-dps finisher roll with a -120-dps target in one frame; terrain recovery later
  // replaced a -109-dps pursuit roll with +99 dps. Neither was rudder or unsafe loaded roll—the
  // target-rate feed-forward simply fought the body's existing momentum before damping it. Brake
  // an opposed recovery roll first, cross zero on the existing 15-dps capture scale, then restore
  // full target-rate authority once the aircraft is actually rotating toward the recovery plane.
  const recoveryRollOwnerActive = escapeRecovery
    || combatDownhillRecoveryActive
    || invertedRecovery;
  const recoveryRollHandoffBrakingActive = recoveryRollOwnerActive
    && rollRateTelemetryValid
    && nominalDesiredRollRateDps * currentRollRateDps < 0;
  const desiredRollRateDps = recoveryRollHandoffBrakingActive
    ? Math.abs(currentRollRateDps) > COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS
      ? 0
      : clamp(
        nominalDesiredRollRateDps,
        -COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS,
        COMBAT_PLANE_CHANGE_CAPTURE_ROLL_RATE_DPS,
      )
    : nominalDesiredRollRateDps;
  // The rejected hardware tape identified both the discrete plant and a harness input defect:
  // inverting the circular gamepad deadzone per axis doubled many small roll requests and created
  // a finite +/- jump at zero while pitch was held. With the vector inverse fixed, the measured
  // requested-input model is approximately nextRate = 0.72 * rate + 64 * stick. The gentler
  // derivative term below leaves a positive, damped pole instead of alternating every sample.
  const rollRateDampingDps = gunLeadRollCaptureActive
      || escapeRecovery || combatDownhillRecoveryActive
      || invertedRecovery || combatDefensiveBreakActive
    ? F22_GUN_LEAD_ROLL_CAPTURE_DAMPING_DPS
    : 240;
  const rawRoll = desiredRollRateDps / 120 - currentRollRateDps / rollRateDampingDps;
  // The broad route deadband hid every captured-axis fine trim in tapes 397/398: the target bank
  // moved by 0.4-0.7 degrees while a residual 1.2 dps roll carried the pipper straight through the
  // 7 m ballistic cone, yet the bot published exactly zero aileron. Keep that quiet deadband for
  // ordinary manoeuvring, but let the already rate-damped capture loop make tiny physical inputs.
  const bankDeadbandDeg = gunLeadRollCaptureActive
    ? F22_GUN_LEAD_ROLL_CAPTURE_BANK_DEADBAND_DEG
    : 1.25;
  const rateDeadbandDps = gunLeadRollCaptureActive
    ? F22_GUN_LEAD_ROLL_CAPTURE_RATE_DEADBAND_DPS
    : 2.5;
  let roll = combatLoadedRollUnloadActive && !rollRateTelemetryValid
    ? 0
    : Math.abs(bankErrorDeg) < bankDeadbandDeg
        && Math.abs(currentRollRateDps) < rateDeadbandDps
      ? 0
      : clamp(rawRoll, -1, 1);
  const committedPlaneTransferActive = combatLoadedRollPhase === "roll"
    || (combatDownhillSliceActive && combatDownhillSliceRollArmed)
    || (verticalRecoveryPhase === "slice" && verticalRecoverySliceRollArmed);
  const committedPlaneRollWouldAccelerate = !rollRateTelemetryValid
    || Math.abs(currentRollRateDps) < rateDeadbandDps
    || roll * currentRollRateDps >= 0;
  if (f22LoadedRollProtection && committedPlaneTransferActive
      && !combatPlaneChangeUnloadSettled && committedPlaneRollWouldAccelerate) {
    // Do not revoke or reverse the committed plane when lagging load briefly rebuilds. Zero the
    // accelerating aileron, retain the stable target and unload pitch, then resume the same roll
    // direction after the physical load gate clears. Braking a real body rate remains available.
    roll = 0;
  }

  let desiredGammaDeg = rawTargetElevationDeg;
  if (terrainRecoveryPhase === "pull") {
    desiredGammaDeg = 12;
  } else if (terrainEscapeRecovery) {
    desiredGammaDeg = currentGammaDeg;
  } else if (mission === "first-run" && state?.first_run_weapons_cold === true) {
    const altitudeErrorM = finite(target.y) - finite(state?.py);
    desiredGammaDeg = clamp(altitudeErrorM / 45, -7, 7);
  } else if (mission === "rapier") {
    desiredGammaDeg = clamp(desiredGammaDeg, -12, 28);
  } else if (topGunRecoveryFlight) {
    // The pattern is already a moving, carrier-relative energy schedule. Follow its physical
    // altitude instead of layering BFM vertical capture over a 3.5-degree no-flare final.
    desiredGammaDeg = clamp(desiredGammaDeg, -8, 12);
  } else if (gunLeadFinisherActive) {
    // Telemetry reports the lead point's real elevation. The finisher below steers the physical
    // body axis, so this value is evidence rather than a separately clipped control target.
    desiredGammaDeg = rawTargetElevationDeg;
  } else {
    desiredGammaDeg = clamp(desiredGammaDeg, -18, 24);
  }
  const gammaErrorDeg = desiredGammaDeg - currentGammaDeg;
  // A bank is not a turn until the wing carries the load. Ask the production protected-control
  // law for the exact coordinated G (up to 3 G before knife-edge), then layer the existing gamma
  // correction over it. This is airframe-independent because live g_maxperform closes the map.
  const coordinatedLoadFactorG = invertedRecovery
    ? 1
    : fixedWingCoordinatedLoadFactorG(currentBankDeg, maximumLoadFactorG);
  const coordinatedPitch = fixedWingPitchForLoadFactor(
    coordinatedLoadFactorG,
    maximumLoadFactorG,
  );
  let leadLiftErrorDeltaDeg = 0;
  let gunLeadLiftDampingCommand = 0;
  if (!gunLeadCapturedFineRollActive) controllerState.gunLeadLastLiftErrorDeg = null;
  let pitch = clamp(gammaErrorDeg / 17 + coordinatedPitch, -0.62, 0.92);
  if (terrainRecoveryPhase === "auto-gcas") {
    pitch = 0;
  } else if (terrainRecoveryPhase === "unload" || terrainRecoveryPhase === "roll") {
    // Unload while placing the lift vector above the horizon. Pulling hard at an oblique bank
    // accelerates the dive even though the pitch stick looks like a recovery command.
    pitch = -0.12;
  } else if (terrainRecoveryPhase === "pull") {
    pitch = 0.92;
  } else if (verticalRecoveryPhase === "slice") {
    // Unload through the roll, then cap the true inverted split-S at 6.5 G. Pulling before exact
    // plane/rate capture recreates the oblique loaded hold; carrying the full 9-G command makes a
    // routine anti-zoom recovery look like a structural-limit event. At 180 degrees the capped
    // lift points cleanly earthward and returns gamma faster than the former 118-degree cycle.
    pitch = verticalRecoveryPullActive
      ? fixedWingPitchForLoadFactor(
        Math.min(maximumLoadFactorG, COMBAT_VERTICAL_RECOVERY_MAX_G),
        maximumLoadFactorG,
      )
      : -0.14;
  } else if (verticalRecoveryPhase === "level") {
    // Keep a small explicit unload while rolling upright. Neutral stick hands pitch back to the
    // gun-rate aid, which tape 423 used to add recovery G even though the bot was still committed
    // to leaving the vertical. The shallow push also helps high-alpha lift decay before rejoin.
    pitch = -0.08;
  } else if (combatDownhillRecoveryActive) {
    // The 112-degree slice has already earned the descent. Unload while returning the lift vector
    // to its recovery plane, then make a real pull-out and retain ownership until gamma is safely
    // above -8 degrees. Generic downhill pursuit returns fully upright. Tape 439's tightly gated
    // post-pass reversal instead uses a same-side 60-degree fighting bank: enough upright lift to
    // pull out quickly while retaining lateral G, without the wasteful 112 -> 0 -> 78 double roll.
    pitch = combatDownhillRecoveryPhase === "pull" ? 0.92
      : combatDownhillRecoveryPhase === "release" ? 0
        : -0.08;
  } else if (invertedRecovery) {
    controllerState.gunLeadPitchDominatedFineCaptureActive = false;
    // Keep the roll genuinely unloaded until the same-side fighting bank. Tape 451 showed the old
    // assist rebuilding 2.5-3 G every time the roll latch armed, producing three accelerate/brake
    // cycles on the way to level. Combat pull resumes immediately after recovery releases.
    pitch = 0;
  } else if (combatDefensiveReleaseUnloadActive) {
    pitch = -0.10;
  } else if (combatAftPursuitReleaseUnloadActive) {
    // Do not merely move the loaded half-roll from the +/-180 seam to the 145-degree hysteresis
    // boundary. Hold the established plane and unload before allowing pursuit to choose a new side.
    pitch = -0.10;
  } else if (combatDefensiveBreakActive) {
    const breakBankErrorDeg = Math.abs(wrapAngleDeg(desiredBankDeg - currentBankDeg));
    const uprightBreakAlignment = smootherstep01((90 - breakBankErrorDeg) / 60);
    const highPlaneBankAlignment = smootherstep01((30 - breakBankErrorDeg) / 20);
    const highPlaneRateAlignment = smootherstep01(
      (60 - Math.abs(currentRollRateDps)) / 40,
    );
    const breakAlignment = combatDefensiveBreakPlaneMagnitudeDeg
        === COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG
      ? Math.min(highPlaneBankAlignment, highPlaneRateAlignment)
      : uprightBreakAlignment;
    // Upright urgent breaks retain full published g_maxperform. The high-shooter plane instead
    // tops out at 8.4 G: Tape 471 reached 9.29 G while banked 110 degrees, triggering the
    // structural-limit presentation without buying meaningful additional displacement. It still
    // waits for both bank and rate capture before loading the slice.
    const defensiveBreakPitchCeiling =
      combatDefensiveBreakPlaneMagnitudeDeg === COMBAT_DEFENSIVE_HIGH_PLANE_BANK_DEG
      ? fixedWingPitchForLoadFactor(
        Math.min(maximumLoadFactorG, COMBAT_DEFENSIVE_HIGH_PLANE_MAX_G),
        maximumLoadFactorG,
      )
      : combatDefensiveHighClimbLoadLimited
        // Tape 489's shallow +55-degree jink had already put the shooter 54 degrees below its
        // flight path, yet the pilot kept asking for 6-9 G until gamma exceeded 60 degrees. Keep
        // the defensive plane and useful lateral load, but stop converting an earned displacement
        // into a vertical zoom. This changes pitch only; no loaded roll or vulnerable unload is
        // introduced inside the gun envelope.
        ? fixedWingPitchForLoadFactor(
          Math.min(maximumLoadFactorG, COMBAT_DEFENSIVE_HIGH_CLIMB_MAX_G),
          maximumLoadFactorG,
        )
        : 1;
    pitch = -0.10 + (defensiveBreakPitchCeiling + 0.10) * breakAlignment;
  } else if (combatDownhillSliceActive) {
    // Pushing while banked 78 degrees reverses the lateral acceleration as well as lowering the
    // nose. Tape 367 therefore turned away from a descending contact for 19.6 seconds. Overbank
    // the lift vector below the horizon, then use positive G to turn and descend at once. Unload
    // until the requested slice plane is close enough so an opposite-side entry cannot pull the
    // jet the wrong way.
    if (!combatDownhillSliceRollArmed || !combatDownhillSlicePullActive) {
      // Tape 449 entered this manoeuvre at 5.61 G / 19.12 degrees alpha and immediately applied
      // 72% aileron toward 112 degrees, recreating a visible 2% ARI kick. Establish the unload
      // before moving the lift plane. Tape 453 then showed that the old continuous alignment blend
      // rebuilt pull while the roll was still travelling, which crossed the load gate and toggled
      // the plane target seven times. Keep the unload through physical bank/rate capture; only then
      // may the existing alignment schedule build the authored downhill pull.
      pitch = -0.10;
    } else {
      const sliceBankErrorDeg = Math.abs(wrapAngleDeg(
        combatDownhillSliceBankDeg - currentBankDeg,
      ));
      const sliceBankAlignment = smootherstep01((80 - sliceBankErrorDeg) / 60);
      const sliceRateAlignment = smootherstep01(
        (60 - Math.abs(currentRollRateDps)) / 40,
      );
      const sliceAlignment = Math.min(sliceBankAlignment, sliceRateAlignment);
      const downhillSlicePitchCeiling =
        controllerState.combatDownhillPostPassConversionActive === true
          ? 0.92
          : fixedWingPitchForLoadFactor(
            Math.min(maximumLoadFactorG, COMBAT_DOWNHILL_SLICE_MAX_G),
            maximumLoadFactorG,
          );
      pitch = -0.10 + (downhillSlicePitchCeiling + 0.10) * sliceAlignment;
    }
  } else if (gunLeadFinisherActive) {
    // Bank the lift vector into the three-dimensional lead plane, then pull the body-fixed gun
    // toward the pipper. This is the manoeuvre an aircraft can actually fly: a target below is an
    // inverted pull, not the weak wings-level negative-G push produced by the old gamma split.
    if (gunLeadRollCaptureActive) {
      // Near the axis, a target crossing flips the transverse plane by ~180 degrees even though
      // the captured bank remains correct. Project the small angular error onto physical body-up:
      // its magnitude damps the singular angle, and its sign changes pull to push after crossover
      // without asking the ailerons to chase it (tapes 363/364).
      const signedLiftErrorDeg = leadLiftErrorDeg;
      if (gunLeadCapturedFineRollActive) {
        const previousLiftErrorDeg = Number(controllerState.gunLeadLastLiftErrorDeg);
        leadLiftErrorDeltaDeg = controllerState.gunLeadLastLiftErrorDeg !== null
            && Number.isFinite(previousLiftErrorDeg)
            && !gunLeadTargetChanged
          ? signedLiftErrorDeg - previousLiftErrorDeg
          : 0;
        gunLeadLiftDampingCommand = clamp(
          leadLiftErrorDeltaDeg * F22_GUN_LEAD_LIFT_ERROR_DELTA_GAIN,
          -F22_GUN_LEAD_LIFT_ERROR_DELTA_LIMIT,
          F22_GUN_LEAD_LIFT_ERROR_DELTA_LIMIT,
        );
        controllerState.gunLeadLastLiftErrorDeg = signedLiftErrorDeg;
      } else {
        controllerState.gunLeadLastLiftErrorDeg = null;
      }
      // Tapes 391-394 retained a clean captured plane and the production 120 Hz rate damper, but
      // the negative branch converged just outside the range-scaled ballistic cone (0.709, 0.562,
      // 0.458, then 0.383 degrees). Stronger positive gain would recreate the pre-crossing >2 G
      // overshoot; only the already-past-line push needs more authority.
      const signedPitchErrorScaleDeg = signedLiftErrorDeg < 0 ? 0.75 : 6;
      const signedPull = Math.sign(signedLiftErrorDeg)
        * clamp(
          (Math.abs(signedLiftErrorDeg) - F22_GUN_LEAD_PITCH_DEADBAND_DEG)
            / signedPitchErrorScaleDeg,
          0,
          0.92,
        );
      const capturedBankAlignment = gunLeadCartesianRollActive
        ? 1
        : smootherstep01((45 - Math.abs(bankErrorDeg)) / 30);
      // Tapes 419/420 put the lift- and lateral-axis zero crossings roughly 0.2 s apart. Static
      // gain reacted only after the gun had crossed the lift axis, then saturated in unload. A
      // bounded one-sample delta starts braking that crossing early without changing the 7 m cone,
      // adding steady-state gain, or carrying state across target/recovery handoffs.
      const capturedPitch = clamp(
        (signedPull + gunLeadLiftDampingCommand) * capturedBankAlignment,
        -0.42,
        0.92,
      );
      // Tape 439 missed the 908-m cone by less than one metre after the one-sample delta brake
      // outweighed a still-positive 0.725-degree lift error by 0.0075 stick. Production correctly
      // read that tiny negative command as PILOT_UNLOAD, dropped pitch assist, and the newly
      // unisolated Cartesian loop moved the lateral axis away. While the explicit pitch-dominated
      // latch still owns a positive lift miss, damping may brake only to neutral—not push through
      // the director. Signed below-axis control and every non-isolated conversion remain two-sided.
      pitch = (gunLeadPitchDominatedFineCapture && signedLiftErrorDeg > 0)
          || gunLeadHighClosureConeRecoveryActive
        ? Math.max(0, capturedPitch)
        : capturedPitch;
      // Tape 441 held a settled lift plane at 757 m / 666 kt closure, but its remaining
      // 1.81-degree lift-axis miss stopped converging. The nominal "3 G shoulder" below was only
      // a ceiling, so the proportional fine-capture law quietly fell to 2.5 G while the physical
      // director accelerated away at 13.75 dps. In that narrow high-closure, pitch-owned lane,
      // keep a real 3 G floor until the lift error reaches the existing 0.8-degree settle band.
      // Do not carry the floor through the high-closure isolation extension: below 0.8 degrees
      // the ordinary two-sided damper must still brake the crossing, and Tape 439's positive-miss
      // neutral command must remain possible.
      if (highClosurePitchDominatedPullFloor) {
        pitch = Math.max(
          pitch,
          fixedWingPitchForLoadFactor(
            F22_GUN_LEAD_PITCH_DAMPING_MAX_G,
            maximumLoadFactorG,
          ),
        );
      }
    } else {
      controllerState.gunLeadLastLiftErrorDeg = null;
      // The final-axis lift plane is deliberately bounded to a sustainable 82-degree fighting
      // bank. Tape 479 reached -80 degrees while the mathematical lead plane continued to -139;
      // measuring alignment against that unreachable plane held the jet at 0.8 G for 1.6 seconds
      // and let a 20-degree solution pass through the nose. Pull when the commanded physical plane
      // is captured. The remaining off-boresight error is exactly what this pull must convert.
      const liftPlaneBankAlignment = smootherstep01(
        (45 - Math.abs(bankErrorDeg)) / 30,
      );
      const liftPlaneRateAlignment = smootherstep01(
        (60 - Math.abs(currentRollRateDps)) / 40,
      );
      const liftPlaneAlignment = Math.min(
        liftPlaneBankAlignment,
        liftPlaneRateAlignment,
      );
      const leadPull = clamp(
        (leadOffBoresightDeg - F22_GUN_LEAD_PITCH_DEADBAND_DEG) / 10,
        0,
        0.92,
      );
      pitch = -0.10 + (leadPull + 0.10) * liftPlaneAlignment;
    }
    if (gunLeadPitchDampingActive) {
      // Tape 390 showed why two independent pitch servos cannot both own the final degree. The
      // bot asked for >2 G while body q was already carrying the nose through lead. Production's
      // rate-damped assist correctly wanted to ease, but its deliberate-pull guard forbids that
      // below-line correction at a 2 G-or-higher pilot request. Tapes 401/405 then exposed the
      // 70 ms analog-command filter means waiting for capture leaves excess G at the ballistic
      // cone. Hardware tapes 406-408 also proved that dropping straight to 1.9 G at 6, 4.75 or
      // 4.25 degrees unloads too soon and freezes a 0.6-2 degree pitch miss. Use a 3 G shoulder,
      // then admit the full two-sided production damper only inside the same 2.5-degree fine-trim
      // envelope as roll. Tape 409 proved that preserving the pull to that point earns the raw
      // cone; this shoulder is solely to slow its 12 dps crossing enough to hold the 0.08 s dwell.
      // A negative push is untouched by Math.min; hard BFM and wider conversion remain unchanged.
      // Tape 423 held a clean lateral capture for nine seconds while the remaining +2-degree
      // miss was almost entirely on the lift axis. The 1.9 G two-sided-damping handoff left the
      // measured pitch rate roughly 5 deg/s behind the director. Reuse the existing 3 G shoulder
      // only while that residual is clearly pitch-dominated; once lift error is below one degree,
      // return to the 1.9 G cap so production can still ease either side of the gun line.
      // Tape 434 then missed the physical cone by only 1.46 m at 808 m: at 5.15 degrees and
      // 603-knot closure Cartesian roll was already controlling the pass, but this brake waited
      // one more 20 Hz sample for the old 4.25-degree boundary. Admit the same 3 G shoulder across
      // the existing six-degree Cartesian envelope only at high closure. Low-closure tracking and
      // the narrower 1.9 G final-cone handoff remain unchanged.
      const capturedPitchAxisMaximumG = capturedPitchAxisPullActive
        ? clamp(
          F22_GUN_LEAD_PITCH_DAMPING_MAX_G
            + (publishedPitchRateErrorDps
              - F22_GUN_LEAD_CAPTURED_PITCH_RATE_HOLD_ERROR_DPS) * 0.5,
          F22_GUN_LEAD_PITCH_DAMPING_MAX_G,
          Math.min(F22_GUN_LEAD_CAPTURED_PITCH_BASE_MAX_G, maximumLoadFactorG),
        )
        : null;
      if (capturedPitchAxisMaximumG !== null) {
        // Tape 452 proved this adaptive value had become a non-binding ceiling: production
        // published a persistent +5 dps pitch-rate deficit, yet the proportional base law asked
        // for only 3.3 G and parked two degrees outside the ballistic cone. In this already
        // captured, lateral-settled, positive-lift lane the deficit is direct evidence that more
        // base pull is required. Command the calculated value as a floor as well as a cap; the
        // lane releases on rate, roll, lateral or signed-lift evidence before a crossing.
        pitch = Math.max(
          pitch,
          fixedWingPitchForLoadFactor(
            capturedPitchAxisMaximumG,
            maximumLoadFactorG,
          ),
        );
      }
      const pitchDampingMaximumG = capturedPitchAxisMaximumG
        ?? (gunLeadPitchAxisApproachBrakeActive
          || (leadOffBoresightDeg
            <= F22_GUN_LEAD_PITCH_FULL_DAMPING_OFF_BORESIGHT_DEG
            && !gunLeadPitchDominatedFineCapture)
        ? F22_GUN_LEAD_PITCH_ASSIST_FULL_DAMPING_MAX_G
        : F22_GUN_LEAD_PITCH_DAMPING_MAX_G);
      pitch = Math.min(
        pitch,
        fixedWingPitchForLoadFactor(
          pitchDampingMaximumG,
          maximumLoadFactorG,
        ),
      );
    }
    if (gunLeadCloseApproachBrakeActive) {
      pitch = Math.min(
        pitch,
        fixedWingPitchForLoadFactor(
          F22_GUN_LEAD_PITCH_ASSIST_FULL_DAMPING_MAX_G,
          maximumLoadFactorG,
        ),
      );
    }
  } else if (combatMission) {
    controllerState.gunLeadPitchDominatedFineCaptureActive = false;
    // A fighter does not turn merely by banking. The first real browser flight exposed that the
    // route-style gamma controller settled at roughly 3 G with the bandit behind, then died in a
    // tidy 70-degree bank. Roll first, then command a real level BFM pull in proportion to how far
    // the contact remains around the turn. The normal FBW/G limiter still owns the resulting load.
    const turnDemand = clamp((Math.abs(headingErrorDeg) - 12) / 78, 0, 1);
    // "Bank established" means aligned with the bank we asked for, not merely tilted. Tape 434
    // handed a +88-degree, -106 dps half-roll to a -78-degree pursuit bank; the old absolute-bank
    // check called that fully established and layered a 7.5 G pull onto the reversal. Require both
    // commanded-bank alignment and a settling body rate before adding the BFM pull. The ordinary
    // coordinated-load term remains available while the lift plane is being placed.
    const bfmBankAlignment = smootherstep01(
      (COMBAT_BFM_PULL_BANK_ERROR_ZERO_DEG - Math.abs(bankErrorDeg))
        / (COMBAT_BFM_PULL_BANK_ERROR_ZERO_DEG
          - COMBAT_BFM_PULL_BANK_ERROR_FULL_DEG),
    );
    const bfmRollRateAlignment = smootherstep01(
      (COMBAT_BFM_PULL_ROLL_RATE_ZERO_DPS - Math.abs(currentRollRateDps))
        / (COMBAT_BFM_PULL_ROLL_RATE_ZERO_DPS
          - COMBAT_BFM_PULL_ROLL_RATE_FULL_DPS),
    );
    const bankEstablished = bfmBankAlignment * bfmRollRateAlignment;
    // Tape 440 exposed the remaining loaded-roll path. The BFM turn pull above was correctly
    // gated by lift-plane alignment, but the generic gamma loop had already saturated at 8.36 G
    // while a 110-m crossing swept the requested bank through +10 -> -78 degrees. The jet then
    // carried 6-8 G through a 100 dps roll and produced the visible eight-degree skid that can be
    // mistaken for top rudder even though requested, applied and ARI rudder are all zero. Apply the
    // same physical alignment to only the positive F-22 gamma increment; preserve the coordinated
    // load while rolling, every explicit safety/tactical owner above, all nose-down commands, and
    // the full gamma pull once the commanded bank and body rate are settled.
    if (mission === "f22" && pitch > coordinatedPitch) {
      pitch = coordinatedPitch + (pitch - coordinatedPitch) * bankEstablished;
    }
    // Preserve a demanded nose-down input. Math.max(pitch, 0) used to erase every such command,
    // even with no turn demand. Taper the BFM pull to zero as gamma climbs so pursuit cannot turn
    // a level fight into an endless vertical chase.
    const verticalHeadroom = clamp((18 - currentGammaDeg) / 10, 0, 1)
      * clamp((7_200 - currentAltitudeM) / 1_400, 0, 1);
    // Tape 365 exposed a false "runaway" that was actually the playerbot holding an 80-degree,
    // 6-G climbing turn while the live bandit descended four kilometres beneath it. Suppress the
    // level-turn pull when the target is materially below; unload lets the turn slice downhill
    // instead of manufacturing a 32-second separation.
    const targetBelowTurnFactor = clamp((rawTargetElevationDeg + 18) / 18, 0, 1);
    const maximumBfmLoadFactorG = Math.min(maximumLoadFactorG, 7.5);
    const bfmLoadFactorG = 1 + (maximumBfmLoadFactorG - 1)
      * turnDemand * bankEstablished * verticalHeadroom * targetBelowTurnFactor;
    const bfmPull = fixedWingPitchForLoadFactor(
      bfmLoadFactorG,
      maximumLoadFactorG,
    );
    if (bfmPull > 0.04) pitch = Math.max(pitch, bfmPull);
    if (mission === "f22"
        && Math.abs(currentBankDeg) >= 60
        && closureKts <= COMBAT_GENERIC_HIGH_BANK_PUSH_OPENING_KTS
        && pitch < -0.10) {
      // Tape 463 spent 2.2 seconds at 72..77 degrees of bank pushing negative G at a contact
      // already opening faster than 250 knots. That reverses lateral lift and looks like a
      // prolonged top-rudder knife-edge even though rudder is zero. A bounded unload still lets
      // gravity lower the flight path; explicit downhill slices and closing collision-avoidance
      // pushes retain their dedicated branches and full authority.
      pitch = -0.10;
    }
  }
  if (controllerState.combatDownhillSliceRearmBlocked === true
      && !escapeRecovery
      && !combatDownhillRecoveryActive
      && !invertedRecovery
      && !combatDefensiveBreakActive
      && !combatDownhillSliceActive
      && !gunLeadFinisherActive) {
    // The pull-out may release while the same contact is still far below and across the turn.
    // Preserve at least neutral-G pitch while banking onto it; otherwise generic elevation pursuit
    // immediately commands a full push and recreates the dive one controller tick later.
    pitch = Math.max(pitch, 0);
  }
  const gunLeadFinisherOverbankUnloadActive = gunLeadFinisherOverbankGuardActive
    && terrainRecoveryPhase === "idle"
    && verticalRecoveryPhase === "idle"
    && !invertedRecovery
    && !combatDefensiveBreakActive
    && !combatDefensiveReleaseUnloadActive
    && !combatDownhillSliceActive
    && !combatDownhillRecoveryActive;
  const combatDefensiveOverbankUnloadActive = combatDefensiveOverbankGuardActive;
  const combatGenericOverbankUnloadActive = combatGenericOverbankGuardActive;
  if (gunLeadFinisherOverbankUnloadActive) {
    // The 82-degree final-axis target preserves vertical lift. If momentum is nevertheless about
    // to carry the wing past the 84-degree physical margin, remove pull before the crossing and
    // let the bounded target/rate damper bring it back. An unavailable unbounded lead plane is not
    // itself an unload request; that was Tape 477's permanent knife-edge deadlock.
    pitch = -0.10;
  }
  if (combatDefensiveOverbankUnloadActive) {
    // The high defensive break shares the same 82-degree sustainable plane as the gun finisher.
    // If inertia carries it through the 84-degree physical margin, unload until the inward target
    // and rate damper recover the wing. Pulling through that seam is the false top-rudder look.
    pitch = -0.10;
  }
  if (combatGenericOverbankUnloadActive) {
    // Tape 485 found the same false knife-edge outside the named finisher/defense owners:
    // ordinary pursuit asked for 78 degrees and inward roll, yet pitch/turn coupling held the
    // Euler bank at 84..84.5 degrees under 5-6 G for 0.78 seconds. The airframe does not care
    // which tactical selector authored the pull, so apply the shared physical limit everywhere.
    pitch = -0.10;
  }
  if (combatLoadedRollUnloadActive) {
    // This late override also covers finisher and generic gamma laws calculated above. It never
    // owns terrain or authored recovery; its sole job is to let measured lift decay before a
    // tactical plane change.
    pitch = -0.10;
  }

  // Recovery and finisher branches can deliberately replace the route/BFM target. Publish the
  // exact final load request represented by their physical pitch command.
  const desiredLoadFactorG = fixedWingLoadFactorForPitch(pitch, maximumLoadFactorG);

  const speedKts = finite(state?.true_airspeed_kts);
  const firstRunValleyPhase = mission === "first-run"
    && state?.first_run_weapons_cold === true;
  const targetSpeedKts = firstRunValleyPhase ? 430
    : mission === "first-run" ? 360
    : mission === "rapier" ? Math.max(360, finite(state?.rapier_fd_target_ktas, 520))
      : topGunRecoveryFlight ? Math.max(120, finite(target.targetKtas, 350))
      : 500;
  const calibratedSpeedKts = Number.isFinite(Number(state?.calibrated_airspeed_kts))
    ? Number(state.calibrated_airspeed_kts)
    : Number(state?.indicated_airspeed_kts);
  const cornerSpeedKias = Number(state?.corner_speed_kias);
  const cornerSpeedValid = Number.isFinite(calibratedSpeedKts)
    && Number.isFinite(cornerSpeedKias)
    && cornerSpeedKias > 0;
  const cornerBandMinimumKias = Number.isFinite(Number(state?.corner_band_min_kias))
    && Number(state.corner_band_min_kias) > 0
    ? Number(state.corner_band_min_kias)
    : cornerSpeedKias - 15;
  const cornerBandMaximumKias = Number.isFinite(Number(state?.corner_band_max_kias))
    && Number(state.corner_band_max_kias) > 0
    ? Number(state.corner_band_max_kias)
    : cornerSpeedKias + 15;
  // Tape 428 flew 96.8% of its close fight above the published corner band. Generic 500-KTAS
  // regulation lit afterburner immediately after the first merge, undoing the energy shed by the
  // 8-G break; tape 429 then crossed a real raw gun solution at 427 KCAS and 930 kt closure too
  // quickly to earn the production 0.08-second dwell. A negative closure inside gun-fight range
  // is an unambiguous completed merge. Latch the aircraft's own corner-KCAS schedule from there
  // so idle power begins several seconds before lead conversion, without slowing the initial run-in.
  if (mission !== "f22" || state?.opponent_alive === false
      || state?.opponent_present === false) {
    controllerState.combatCornerEnergyActive = false;
  } else if (controllerState.combatCornerEnergyActive === true
      && contactRangeM >= 4_500) {
    // Corner speed is for the visual fight, not a five-kilometre rejoin. Restore the 500-KTAS
    // schedule after meaningful separation, then earn a new post-merge latch on the next join.
    controllerState.combatCornerEnergyActive = false;
  } else if (controllerState.combatCornerEnergyActive !== true
      && cornerSpeedValid
      && leadGeometry !== null
      && contactRangeM <= 2_500
      && closureKts < -50) {
    controllerState.combatCornerEnergyActive = true;
  }
  const combatCornerEnergyActive =
    controllerState.combatCornerEnergyActive === true;
  const combatCornerFast = combatCornerEnergyActive && cornerSpeedValid
    && calibratedSpeedKts > cornerBandMaximumKias + 5;
  const combatCornerSlow = combatCornerEnergyActive && cornerSpeedValid
    && calibratedSpeedKts < cornerBandMinimumKias - 10;
  // TAS is the wrong energy variable for a fight spanning several kilometres of altitude. During
  // conversion use the authority's own KCAS/corner contract and brake high closure even when the
  // jet happens to be inside the corner band.
  const finisherFast = gunLeadFinisherActive && cornerSpeedValid
    && calibratedSpeedKts > cornerBandMaximumKias + 5;
  const finisherSlow = gunLeadFinisherActive && cornerSpeedValid
    && calibratedSpeedKts < cornerBandMinimumKias - 10;
  const finisherNeedsBrake = gunLeadFinisherActive
    && (closureKts > 250 || finisherFast);
  // Stage at 420 KCAS, then regulate a deliberately broad 405..435 KCAS band through the same
  // spring-loaded rocker a player uses. KCAS is the authored contract and remains stable at this
  // low altitude; TAS is used by the other routes. Tape 379's lever walk was external W/S keyboard
  // leakage, now independently rejected by the harness keyboard quarantine below.
  const valleyEnergySpeedKts = Number.isFinite(calibratedSpeedKts)
    ? calibratedSpeedKts
    : speedKts;
  let throttleUp = firstRunValleyPhase
    ? valleyEnergySpeedKts < 405
    : !escapeRecovery && speedKts < targetSpeedKts - 25;
  let throttleDown = firstRunValleyPhase
    ? valleyEnergySpeedKts > 435
    : verticalEscapeRecovery || speedKts > targetSpeedKts
      + (mission === "rapier" ? 90 : mission === "first-run" ? 25 : 35);
  if (combatCornerEnergyActive && !escapeRecovery && !gunLeadFinisherActive) {
    throttleUp = combatCornerSlow;
    throttleDown = combatCornerFast;
  }
  let recoveryDesiredPower01 = null;
  if (topGunRecoveryFlight) {
    const publishedPower01 = clamp(state?.approach_power_01, 0, 1);
    recoveryDesiredPower01 = clamp(
      publishedPower01 + (targetSpeedKts - speedKts) / 70,
      0,
      1,
    );
    const currentThrottle = clamp(state?.throttle, 0, 1);
    throttleUp = currentThrottle < recoveryDesiredPower01 - 0.025;
    throttleDown = currentThrottle > recoveryDesiredPower01 + 0.025;
  }
  if (gunLeadFinisherActive) {
    throttleUp = !finisherNeedsBrake && closureKts < 120 && finisherSlow;
    throttleDown = finisherNeedsBrake;
  }
  if (terrainEscapeRecovery) {
    if (terrainRecoveryPhase === "auto-gcas") {
      throttleUp = false;
      throttleDown = false;
    } else {
      const recoverySpeedKts = Number.isFinite(calibratedSpeedKts)
        ? calibratedSpeedKts
        : speedKts;
      throttleUp = recoverySpeedKts < 280;
      throttleDown = recoverySpeedKts > 350;
    }
  }
  if (combatDownhillRecoveryActive) {
    const recoverySpeedKts = Number.isFinite(calibratedSpeedKts)
      ? calibratedSpeedKts
      : speedKts;
    throttleUp = recoverySpeedKts < 280;
    throttleDown = recoverySpeedKts > 350;
  }
  if (combatDownhillPostPassConversionActive) {
    // Tape 439 entered the conversion inside the corner-speed deadband, so neither rocker moved
    // and an inherited 1.35 afterburner setting widened the whole max-G reversal. A rapidly opening
    // 140-m post-pass has energy to spend regardless of KCAS; drive the real spring-loaded rocker
    // toward idle for this episode, then return power authority when the pull-out completes.
    throttleUp = false;
    throttleDown = true;
  }
  const currentThrottle = Number(state?.throttle);
  const combatDefensivePowerOverrideActive = mission === "f22"
    && combatDefensiveBreakActive
    && !terrainEscapeRecovery
    && !combatCornerFast
    && Number.isFinite(currentThrottle);
  if (combatDefensivePowerOverrideActive) {
    // Tape 497 inherited idle from the downhill pull-out, then corner-speed deadband preserved
    // that stale lever for 5.9 seconds while a live shooter closed. Flight-control recovery may
    // retain the lift plane, but it cannot starve an already-detected defensive break of thrust.
    // Rock toward bounded combat power even before the break owns roll/pitch so the engine has
    // spooled by handoff; genuine corner overspeed still keeps the normal idle command above.
    throttleUp = currentThrottle
      < COMBAT_DEFENSIVE_POWER_TARGET - COMBAT_DEFENSIVE_POWER_DEADBAND;
    throttleDown = currentThrottle
      > COMBAT_DEFENSIVE_POWER_TARGET + COMBAT_DEFENSIVE_POWER_DEADBAND;
  }

  const outputRoll = terrainRecoveryPhase === "auto-gcas" ? 0 : roll;

  return Object.freeze({
    roll: outputRoll,
    pitch,
    throttleUp,
    throttleDown,
    target: Object.freeze({
      ...target,
      horizontalRangeM,
      desiredHeadingDeg,
      headingErrorDeg,
      desiredBankDeg,
      valleyBankFeedForwardDeg,
      currentRollRateDps,
      nominalDesiredRollRateDps,
      desiredRollRateDps,
      recoveryRollHandoffBrakingActive,
      rollRateTelemetryValid,
      desiredGammaDeg,
      maximumLoadFactorG,
      coordinatedLoadFactorG,
      desiredLoadFactorG,
      terrainEscapeRecovery,
      terrainRecoveryPhase,
      radarAltitudeFt,
      secondsToTerrain,
      gcasTimeAvailableS,
      gcasPilotViolationTimeS,
      verticalEscapeRecovery,
      verticalRecoveryPhase,
      verticalRecoverySliceRollArmed,
      verticalRecoveryPullActive,
      verticalRecoveryRecaptureActive:
        controllerState.verticalRecoveryRecaptureActive === true,
      verticalRecoveryLevelRollArmed:
        controllerState.verticalRecoveryLevelRollArmed === true,
      verticalRecoveryShotOpportunity,
      verticalRecoveryCapturedShotOpportunity,
      verticalRecoveryDefensivePreemption,
      invertedRecoveryActive: invertedRecovery,
      invertedRecoveryRollArmed,
      invertedRecoveryTargetBankDeg: invertedRecovery
          || invertedRecoveryWasActive
        ? invertedRecoveryTargetBankDeg
        : null,
      invertedRecoveryReleaseDwell,
      combatDefensiveBreakActive,
      combatDefensiveOverbankGuardActive,
      combatGenericOverbankGuardActive,
      combatDefensiveOverbankUnloadActive,
      combatOffensivePressActive,
      combatOffensivePressSamples: finite(
        controllerState.combatOffensivePressSamples,
      ),
      combatOffensivePressExhausted:
        controllerState.combatOffensivePressExhausted === true,
      combatDefensiveReleaseUnloadActive,
      combatLoadedRollUnloadActive,
      combatLoadedRollPhase,
      combatLoadedRollTargetBankDeg: controllerState.combatLoadedRollTargetBankDeg,
      combatLoadedRollTransferSign: finite(controllerState.combatLoadedRollTransferSign),
      combatLoadedRollPursuitRetargetMode,
      combatLoadedPursuitBankHoldActive,
      combatLoadedPursuitLiveDesiredBankDeg,
      combatAftPursuitBankHoldActive,
      combatAftPursuitReleaseUnloadActive,
      combatAftPursuitBankHoldSign,
      combatDefensiveBreakControlOwned,
      combatDefensiveBreakSign: Math.sign(
        finite(controllerState.combatDefensiveBreakSign, 1),
      ) || 1,
      combatDefensiveLastCommittedBreakSign:
        controllerState.combatDefensiveBreakHasCommitted === true
          ? Math.sign(finite(controllerState.combatDefensiveLastCommittedBreakSign, 1)) || 1
          : null,
      combatDefensiveBreakPlaneMagnitudeDeg,
      combatDefensiveNoseHighLateralPlanePreserved,
      combatDefensiveCloseRearCurrentPlanePreserved,
      combatDefensiveOverbankedRearNearestPlanePreserved,
      combatDefensiveLowPlanePhysicallyEngaged,
      combatDefensiveLowPlaneTransitionDeferred,
      combatDefensiveHighClimbLoadLimited,
      combatDefensiveTransferGunfireAbort,
      combatDefensiveGunfireBankHoldActive,
      combatDefensiveLowPlaneTimeToClosestApproachS,
      combatDefensiveLowPlaneTimeToGunEnvelopeS,
      combatDefensiveLowPlaneSamples: finite(
        controllerState.combatDefensiveLowPlaneSamples,
      ),
      combatDefensiveLowPlaneComplete:
        controllerState.combatDefensiveLowPlaneComplete === true,
      combatDefensiveHighPlaneReleaseSamples: finite(
        controllerState.combatDefensiveHighPlaneReleaseSamples,
      ),
      combatDefensiveHighPlaneComplete:
        controllerState.combatDefensiveHighPlaneComplete === true,
      combatDefensiveHighPlaneRecoveryActive:
        controllerState.combatDefensiveHighPlaneRecoveryActive === true,
      combatDefensivePrimaryShooterElevationDeg: primaryShooterElevationDeg,
      combatDefensiveShooterElevationDeg: defensiveShooterElevationDeg,
      combatDefensiveThreatReason: hostileGunThreat
        ? hostileGunFiring
          ? "gunfire"
          : primaryPointBlankRearReacquisitionThreat
            ? "point-blank-reacquisition"
          : primaryPrecisionRearQuarterThreat
            ? "precision-rear-quarter"
          : primaryAimingThreat
            ? "primary-aiming"
            : "rear-quarter"
        : null,
      combatDefensivePointBlankRearReacquisitionThreat:
        primaryPointBlankRearReacquisitionThreat,
      combatDefensiveOpponentNoseErrorDeg: primaryOpponentNoseErrorDeg,
      combatDefensivePrimaryAimSamples: finite(
        controllerState.combatDefensivePrimaryAimSamples,
      ),
      combatDefensivePrimaryAimNotDiverging: primaryAimNotDiverging,
      combatDownhillSliceActive,
      combatDownhillSliceRollArmed,
      combatDownhillSlicePullActive,
      combatDownhillSliceUnloadSamples: finite(
        controllerState.combatDownhillSliceUnloadSamples,
      ),
      combatDownhillSliceFinisherHandoff,
      combatDownhillSliceDepthRecovery,
      combatDownhillSliceTargetRecovered,
      combatDownhillRecoveryPhase,
      combatDownhillRecoveryRollArmed,
      combatDownhillPostPassConversionActive,
      gunLeadBasisValid: leadGeometry !== null,
      gunLeadFinisherActive,
      gunLeadImminentPassBankHoldActive,
      gunLeadPitchDominatedApproachBankHoldActive,
      gunLeadFinisherEarlyHighClosureEntry: finisherEarlyHighClosureEntry,
      gunLeadFinisherFreshLoadedEntryDeferred: finisherFreshLoadedEntryDeferred,
      gunLeadFinisherRearmBlocked:
        controllerState.gunLeadFinisherRearmBlocked === true,
      gunLeadFinisherEntryBankDeg:
        controllerState.gunLeadFinisherEntryBankDeg != null
          && Number.isFinite(Number(controllerState.gunLeadFinisherEntryBankDeg))
          ? Number(controllerState.gunLeadFinisherEntryBankDeg)
          : null,
      gunLeadFinisherLivePlaneTravelFromEntryDeg:
        finisherLivePlaneTravelFromEntryDeg,
      gunLeadFinisherCapturedPlaneTravelFromEntryDeg:
        finisherCapturedPlaneTravelFromEntryDeg,
      gunLeadFinisherBankLimitExitActive,
      gunLeadFinisherOverbankGuardActive,
      gunLeadFinisherOverbankUnloadActive,
      gunLeadFinisherUnboundedBankTargetDeg,
      gunLeadFinisherBoundedBankTargetDeg,
      gunLeadFinisherProjectedBankDeg: projectedGunLeadFinisherBankDeg,
      finisherExceededEntryPlaneTravel,
      gunLeadRollCaptureActive,
      gunLeadCartesianCaptureConverged: leadCartesianCaptureConverged,
      gunLeadCapturedFineRollActive,
      gunLeadRollCaptureHandoffActive: leadRollCaptureHandoffActive,
      gunLeadCartesianRollActive,
      gunLeadCartesianRollRateDps,
      gunLeadCartesianRangeScale,
      gunLeadCartesianRollFeedForwardDps,
      gunLeadPitchIsolationRecenterRateDps,
      gunLeadHighClosureConeRecoveryActive,
      gunLeadCartesianRollBiasRateDps,
      leadLateralErrorDeg,
      leadLateralErrorDeltaDeg,
      leadLiftErrorDeg,
      leadLiftErrorDeltaDeg,
      gunLeadLiftDampingCommand,
      gunLeadPitchDominatedFineCapture,
      gunLeadCapturedPitchLoadedTrimActive,
      capturedPitchAxisPullActive,
      gunLeadPredictiveOvershootBrakeActive,
      gunLeadPitchAxisApproachBrakeActive,
      gunLeadCloseApproachBrakeActive,
      publishedPitchRateErrorDps: Number.isFinite(publishedPitchRateErrorDps)
        ? publishedPitchRateErrorDps
        : null,
      leadRollCaptureTrimDeg,
      gunLeadTargetChanged,
      leadRollPlaneErrorDeg,
      leadRollControlErrorDeg: bankErrorDeg,
      leadOffBoresightDeg,
      contactRangeM,
      closureKts,
      combatCornerEnergyActive,
      combatCornerFast,
      combatDefensivePowerOverrideActive,
      combatDefensivePowerTarget: COMBAT_DEFENSIVE_POWER_TARGET,
      energySpeedMode: gunLeadFinisherActive || combatCornerEnergyActive
        ? "corner-kias"
        : "target-ktas",
      calibratedSpeedKts,
      cornerSpeedKias,
      cornerBandMinimumKias,
      cornerBandMaximumKias,
      finisherNeedsBrake,
      recoveryDesiredPower01,
      approachGateCount: finite(target.gateCount),
      approachTargetKtas: Number.isFinite(Number(target.targetKtas))
        ? Number(target.targetKtas) : null,
    }),
  });
}

export function createFirstRunWeaponState() {
  return {
    targetKey: null,
    killCount: null,
    eligibleSamples: 0,
    lastEligibleTick: null,
    lastShotAt: -Infinity,
    lastFiredTargetKey: null,
  };
}

/**
 * Pulse Fire only after two distinct authority frames agree on one live target. Production does
 * not publish a pre-launch seeker lock: SAFE becomes SEEKING/TRACKING only after launch, while an
 * in-flight missile makes another launch impossible. Target identity and conservative geometry
 * are therefore the honest handoff proof.
 */
export function firstRunWeaponPulse(sample, controllerState) {
  if (!controllerState || typeof controllerState !== "object") {
    throw new TypeError("firstRunWeaponPulse requires controller state");
  }
  const targetKey = String(sample?.banditEntityId ?? "").trim();
  const killCount = finite(sample?.killCount);
  if (!targetKey || targetKey !== controllerState.targetKey
      || killCount !== controllerState.killCount) {
    controllerState.targetKey = targetKey || null;
    controllerState.killCount = killCount;
    controllerState.eligibleSamples = 0;
    controllerState.lastEligibleTick = null;
  }

  const tick = Number(sample?.tick);
  const rangeM = Number(sample?.rangeM);
  const angleOffDeg = Number(sample?.angleOffDeg);
  const eligible = targetKey.length > 0
    && targetKey !== controllerState.lastFiredTargetKey
    && sample?.weaponsCold === false
    && sample?.weaponsInhibited !== true
    && sample?.opponentTerminal === "FLYING"
    && Number(sample?.selectedTargetSlot) === 0
    && finite(sample?.aim9Remaining) > 0
    && sample?.aim9InFlight !== true
    && Number.isFinite(tick)
    && Number.isFinite(rangeM)
    && rangeM >= 600
    && rangeM <= 18_000
    && Number.isFinite(angleOffDeg)
    && angleOffDeg <= 45;
  if (!eligible) {
    controllerState.eligibleSamples = 0;
    controllerState.lastEligibleTick = null;
    return false;
  }
  if (controllerState.lastEligibleTick !== null
      && tick < controllerState.lastEligibleTick) {
    controllerState.eligibleSamples = 0;
    controllerState.lastEligibleTick = null;
  }
  if (tick > finite(controllerState.lastEligibleTick, -Infinity)) {
    controllerState.eligibleSamples += 1;
    controllerState.lastEligibleTick = tick;
  }
  if (controllerState.eligibleSamples < 2
      || finite(sample?.wallS) - finite(controllerState.lastShotAt, -Infinity) < 1.2) {
    return false;
  }
  controllerState.lastShotAt = finite(sample.wallS);
  controllerState.lastFiredTargetKey = targetKey;
  controllerState.eligibleSamples = 0;
  controllerState.lastEligibleTick = null;
  return true;
}

/** Keep the F-22 proof to an aimed production solution; legacy combat lessons retain fallback. */
export function fixedWingAiGunFireDecision(sample, mission = "f22") {
  if (!fixedWingAiGunClosureControlled(sample, mission)) return false;
  const solutionOnly = mission === "f22" || mission === "first-run";
  // Production's qualified cue deliberately lingers across a short dropout so the HUD does not
  // flicker. That is display hysteresis, not permission to shoot: tape 430 fired only after the
  // instantaneous cone had already gone false. Strict combat pilots require both signals on the
  // current sample; legacy lessons retain their historical qualified/coarse policy below.
  if (solutionOnly) {
    return sample?.gunSolution === true && sample?.gunSolutionRaw === true;
  }
  if (sample?.gunSolution === true) return true;
  return sample?.gunWindow === true
    && finite(sample?.rangeM, Number.POSITIVE_INFINITY) < 1_250
    && finite(sample?.angleOffDeg, Number.POSITIVE_INFINITY) < 14;
}

export function createFixedWingGunFireState() {
  return {
    eligibleSamples: 0,
    lastEligibleTick: null,
    maximumEligibleSamples: 0,
    fireCommandUpdates: 0,
    firstFireCommandTick: null,
  };
}

/**
 * Qualify strict guns at the browser controller's own 20 Hz cadence. The outer Playwright tape
 * can land between control updates; tape 431 therefore observed six rounds but missed the exact
 * raw+qualified overlap that authorized them. Requiring two distinct authority ticks both avoids
 * one-frame bursts and publishes a monotonic proof that the slower observer cannot miss.
 */
export function fixedWingAiGunFireHold(sample, mission, controllerState) {
  if (!controllerState || typeof controllerState !== "object") {
    throw new TypeError("fixedWingAiGunFireHold requires controller state");
  }
  const strict = mission === "f22" || mission === "first-run";
  const eligible = fixedWingAiGunFireDecision(sample, mission)
    && (!strict || fixedWingAiGunSolutionInterlockClear(sample));
  const tick = Number(sample?.tick);
  if (!eligible || (strict && !Number.isFinite(tick))) {
    controllerState.eligibleSamples = 0;
    controllerState.lastEligibleTick = null;
    return false;
  }
  if (!strict) return true;
  if (controllerState.lastEligibleTick !== null
      && tick < controllerState.lastEligibleTick) {
    controllerState.eligibleSamples = 0;
    controllerState.lastEligibleTick = null;
  }
  if (tick > finite(controllerState.lastEligibleTick, Number.NEGATIVE_INFINITY)) {
    controllerState.eligibleSamples += 1;
    controllerState.lastEligibleTick = tick;
    controllerState.maximumEligibleSamples = Math.max(
      finite(controllerState.maximumEligibleSamples),
      controllerState.eligibleSamples,
    );
  }
  if (controllerState.eligibleSamples < 2) return false;
  controllerState.fireCommandUpdates = finite(controllerState.fireCommandUpdates) + 1;
  controllerState.firstFireCommandTick ??= tick;
  return true;
}

function fixedWingAiGunClosureControlled(sample, mission = "f22") {
  const closureKts = Number(sample?.closureKts);
  const maximumClosureKts = mission === "f22" || mission === "first-run"
    ? 1_050 : 350;
  return Number.isFinite(closureKts)
    && closureKts < maximumClosureKts
    && closureKts > -250;
}

/** A production solution only counts as shootable when every trigger interlock is observed clear. */
export function fixedWingAiGunSolutionInterlockClear(sample) {
  const requiredBooleans = [
    sample?.pilotControlInterlocked,
    sample?.weaponsCold,
    sample?.weaponsInhibited,
    sample?.playerReturnToBaseActive,
    sample?.autoGcasActive,
    sample?.aiTerrainEscapeRecovery,
    sample?.aiInvertedRecoveryActive,
    sample?.aiCombatDefensiveBreakActive,
    sample?.aiCombatDownhillSliceActive,
  ];
  if (!requiredBooleans.every((value) => typeof value === "boolean")) return false;
  if (typeof sample?.aiTerrainRecoveryPhase !== "string"
      || typeof sample?.aiVerticalRecoveryPhase !== "string"
      || typeof sample?.aiCombatDownhillRecoveryPhase !== "string") return false;
  return sample.pilotControlInterlocked === false
    && sample.weaponsCold === false
    && sample.weaponsInhibited === false
    && sample.playerReturnToBaseActive === false
    && sample.autoGcasActive === false
    && sample.aiTerrainEscapeRecovery === false
    && sample.aiTerrainRecoveryPhase === "idle"
    && sample.aiVerticalRecoveryPhase === "idle"
    && sample.aiInvertedRecoveryActive === false
    && sample.aiCombatDefensiveBreakActive === false
    && sample.aiCombatDownhillSliceActive === false
    && sample.aiCombatDownhillRecoveryPhase === "idle";
}

/**
 * Run the closed-loop pilot beside the production animation/input loop. Playwright remains the
 * observer, but CDP scheduling can no longer hold a stick or trigger command across a long host
 * round trip. The only mutation is the same synthetic standard-gamepad object used by the
 * external harness path.
 */
export function installFixedWingBrowserPilot({
  mission = "f22",
  sampleMs = FIXED_WING_AI_SAMPLE_MS,
} = {}) {
  if (typeof document === "undefined") {
    throw new Error("installFixedWingBrowserPilot requires a browser page");
  }
  globalThis.__gunsOnlyFixedWingBrowserPilot?.stop?.();
  const controllerState = createFixedWingAiControllerState();
  const firstRunWeaponState = createFirstRunWeaponState();
  const topGunWeaponState = createFirstRunWeaponState();
  const gunFireState = createFixedWingGunFireState();
  const intervalsMs = [];
  const startedAtMs = performance.now();
  let firstUpdateAtMs = null;
  let lastUpdateAtMs = null;
  let last = null;
  let updates = 0;
  let padlockPulse = true;
  let limitOverrideWrites = 0;
  let timer = null;
  let stopped = false;
  let lastError = null;
  let foxTwoRequestSequence = 0;

  const writePad = (command, {
    fire = false,
    padlock = false,
    limitOverride = false,
  } = {}) => {
    if (limitOverride === true) limitOverrideWrites += 1;
    const desiredAxes = boundedFixedWingGamepadAxes(command.roll, command.pitch);
    const flightAxes = rawFixedWingGamepadAxes(command.roll, command.pitch);
    const pad = globalThis.__gunsOnlyAiMissionPad;
    if (!pad) throw new Error("AI mission gamepad was not installed before boot");
    pad.axes[0] = flightAxes.roll;
    pad.axes[1] = flightAxes.pitch;
    // The right stick is camera look, not rudder. Centre it every update so this pilot can never
    // hide a view or coordination input in stale synthetic-pad state.
    pad.axes[2] = 0;
    pad.axes[3] = 0;
    for (const index of [0, 2, 4, 5, 7]) {
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
    }
    for (const [index, active] of [
      [0, padlock], [2, limitOverride], [4, command.throttleDown],
      [5, command.throttleUp], [7, fire],
    ]) {
      pad.buttons[index].pressed = active === true;
      pad.buttons[index].value = active === true ? 1 : 0;
    }
    pad.timestamp = performance.now();
    return desiredAxes;
  };

  const release = () => writePad({
    roll: 0,
    pitch: 0,
    throttleUp: false,
    throttleDown: false,
  });

  const update = () => {
    if (stopped) return;
    const updateAtMs = performance.now();
    if (lastUpdateAtMs !== null) {
      intervalsMs.push(updateAtMs - lastUpdateAtMs);
      if (intervalsMs.length > 2_048) intervalsMs.shift();
    }
    firstUpdateAtMs ??= updateAtMs;
    lastUpdateAtMs = updateAtMs;
    try {
      const state = globalThis.__gunsState ?? {};
      if (state.session_phase !== "ACTIVE" || state.player_terminal_state !== "FLYING") {
        release();
        return;
      }
      const command = fixedWingAiCommand(state, mission, controllerState);
      const pulseSample = {
        wallS: (updateAtMs - startedAtMs) / 1_000,
        tick: Number(state.tick),
        pilotControlInterlocked: state.pilot_control_interlocked === true,
        weaponsCold: state.first_run_weapons_cold === true,
        weaponsInhibited: state.weapons_inhibited === true,
        playerReturnToBaseActive: state.player_rtb_active === true,
        autoGcasActive: state.auto_gcas_active === true,
        opponentTerminal: state.opponent_terminal_state ?? null,
        aim9Remaining: Number(state.aim9_remaining),
        aim9InFlight: state.aim9_in_flight === true,
        selectedTargetSlot: Number(state.selected_player_gun_target_slot),
        banditEntityId: state.bandit_entity_id ?? null,
        killCount: Number(state.kill_count),
        rangeM: Number(state.range_m),
        angleOffDeg: Number(state.angle_off_deg),
        closureKts: Number(state.closure_kts),
        gunSolutionRaw: state.gun_solution_raw === true,
        gunSolution: state.gun_solution === true,
        gunWindow: state.gun_window === true,
        aiTerrainEscapeRecovery: command.target.terrainEscapeRecovery === true,
        aiTerrainRecoveryPhase: String(command.target.terrainRecoveryPhase ?? ""),
        aiVerticalRecoveryPhase: String(command.target.verticalRecoveryPhase ?? ""),
        aiInvertedRecoveryActive:
          command.target.invertedRecoveryActive === true,
        aiCombatDefensiveBreakActive:
          command.target.combatDefensiveBreakActive === true,
        aiCombatDownhillSliceActive:
          command.target.combatDownhillSliceActive === true,
        aiCombatDownhillRecoveryPhase:
          String(command.target.combatDownhillRecoveryPhase ?? "idle"),
        aiCombatDownhillPostPassConversionActive:
          command.target.combatDownhillPostPassConversionActive === true,
      };
      let fire;
      if (mission === "rapier") {
        fire = String(state.rapier_mission_phase_name ?? "").toLowerCase() === "attack"
          && state.gun_solution === true;
      } else if (mission === "first-run") {
        fire = finite(pulseSample.aim9Remaining) > 0
          ? firstRunWeaponPulse(pulseSample, firstRunWeaponState)
          : fixedWingAiGunFireHold(pulseSample, mission, gunFireState);
      } else if (mission === "f22") {
        fire = fixedWingAiGunFireHold(pulseSample, mission, gunFireState);
      } else {
        fire = !command.target.terrainEscapeRecovery
          && !command.target.verticalEscapeRecovery
          && !command.target.combatDefensiveBreakActive
          && !command.target.combatDownhillSliceActive
          && fixedWingAiGunFireDecision(pulseSample, mission);
      }
      if (mission === "top-gun"
          && state.player_rtb_active !== true
          && firstRunWeaponPulse(pulseSample, topGunWeaponState)) {
        // Playwright still delivers the eventual R/FOX TWO key through the production keyboard
        // grammar. Persist a monotonic request in diagnostics so a slow CDP observer cannot miss
        // the browser-resident 20 Hz decision edge.
        foxTwoRequestSequence += 1;
      }
      if (mission === "top-gun" && state.player_rtb_active === true) fire = false;
      // Never use the F-22 limiter paddle as harness ownership. Production maps it both to
      // commanded incidence and to Auto-GCAS override, so even a negative-only workaround silently
      // inhibited the safety system for 26 samples in tape 424. DetentLayer now publishes raw
      // stick-forward intent directly to GunneryPitchAssist, suppressing stale filtered gun pull
      // without changing the physical control mode or touching Auto-GCAS.
      const recoveryLimitOverride = false;
      const overrideMaximumLoadFactorG = Math.max(
        command.target.maximumLoadFactorG,
        finite(state.g_override_max, command.target.maximumLoadFactorG),
      );
      const physicalPitch = command.pitch;
      const physicalCommand = state.pilot_control_interlocked === true
        ? { ...command, pitch: physicalPitch, throttleUp: false, throttleDown: false }
        : { ...command, pitch: physicalPitch };
      const physicalFire = state.pilot_control_interlocked === true ? false : fire;
      const appliedAxes = writePad(physicalCommand, {
        fire: physicalFire,
        padlock: padlockPulse,
        limitOverride: recoveryLimitOverride,
      });
      padlockPulse = false;
      updates += 1;
      last = {
        atMs: updateAtMs,
        targetMode: command.target.mode,
        targetXM: command.target.x,
        targetYM: command.target.y,
        targetZM: command.target.z,
        headingErrorDeg: command.target.headingErrorDeg,
        desiredBankDeg: command.target.desiredBankDeg,
        valleyBankFeedForwardDeg: command.target.valleyBankFeedForwardDeg,
        nominalDesiredRollRateDps: command.target.nominalDesiredRollRateDps,
        desiredRollRateDps: command.target.desiredRollRateDps,
        recoveryRollHandoffBrakingActive:
          command.target.recoveryRollHandoffBrakingActive,
        desiredGammaDeg: command.target.desiredGammaDeg,
        maximumLoadFactorG: command.target.maximumLoadFactorG,
        coordinatedLoadFactorG: command.target.coordinatedLoadFactorG,
        desiredLoadFactorG: command.target.desiredLoadFactorG,
        terrainEscapeRecovery: command.target.terrainEscapeRecovery,
        terrainRecoveryPhase: command.target.terrainRecoveryPhase,
        secondsToTerrain: command.target.secondsToTerrain,
        terrainPilotViolationTimeS: command.target.gcasPilotViolationTimeS,
        verticalRecoveryPhase: command.target.verticalRecoveryPhase,
        verticalRecoverySliceRollArmed:
          command.target.verticalRecoverySliceRollArmed,
        verticalRecoveryPullActive: command.target.verticalRecoveryPullActive,
        verticalRecoveryRecaptureActive:
          command.target.verticalRecoveryRecaptureActive,
        verticalRecoveryLevelRollArmed:
          command.target.verticalRecoveryLevelRollArmed,
        verticalRecoveryShotOpportunity:
          command.target.verticalRecoveryShotOpportunity,
        verticalRecoveryCapturedShotOpportunity:
          command.target.verticalRecoveryCapturedShotOpportunity,
        verticalRecoveryDefensivePreemption:
          command.target.verticalRecoveryDefensivePreemption,
        invertedRecoveryActive: command.target.invertedRecoveryActive,
        invertedRecoveryRollArmed: command.target.invertedRecoveryRollArmed,
        invertedRecoveryTargetBankDeg:
          command.target.invertedRecoveryTargetBankDeg,
        invertedRecoveryReleaseDwell: command.target.invertedRecoveryReleaseDwell,
        combatDefensiveBreakActive: command.target.combatDefensiveBreakActive,
        combatDefensiveOverbankGuardActive:
          command.target.combatDefensiveOverbankGuardActive,
        combatGenericOverbankGuardActive:
          command.target.combatGenericOverbankGuardActive,
        combatDefensiveOverbankUnloadActive:
          command.target.combatDefensiveOverbankUnloadActive,
        combatOffensivePressActive: command.target.combatOffensivePressActive,
        combatOffensivePressSamples: command.target.combatOffensivePressSamples,
        combatOffensivePressExhausted:
          command.target.combatOffensivePressExhausted,
        combatDefensiveReleaseUnloadActive:
          command.target.combatDefensiveReleaseUnloadActive,
        combatLoadedRollUnloadActive:
          command.target.combatLoadedRollUnloadActive,
        combatLoadedRollPhase: command.target.combatLoadedRollPhase,
        combatLoadedRollTargetBankDeg:
          command.target.combatLoadedRollTargetBankDeg,
        combatLoadedRollTransferSign:
          command.target.combatLoadedRollTransferSign,
        combatLoadedRollPursuitRetargetMode:
          command.target.combatLoadedRollPursuitRetargetMode,
        combatLoadedPursuitBankHoldActive:
          command.target.combatLoadedPursuitBankHoldActive,
        combatLoadedPursuitLiveDesiredBankDeg:
          command.target.combatLoadedPursuitLiveDesiredBankDeg,
        combatAftPursuitBankHoldActive:
          command.target.combatAftPursuitBankHoldActive,
        combatAftPursuitReleaseUnloadActive:
          command.target.combatAftPursuitReleaseUnloadActive,
        combatAftPursuitBankHoldSign:
          command.target.combatAftPursuitBankHoldSign,
        combatDefensiveBreakControlOwned:
          command.target.combatDefensiveBreakControlOwned,
        combatDefensiveBreakSign:
          command.target.combatDefensiveBreakSign,
        combatDefensiveLastCommittedBreakSign:
          command.target.combatDefensiveLastCommittedBreakSign,
        combatDefensiveBreakPlaneMagnitudeDeg:
          command.target.combatDefensiveBreakPlaneMagnitudeDeg,
        combatDefensiveNoseHighLateralPlanePreserved:
          command.target.combatDefensiveNoseHighLateralPlanePreserved,
        combatDefensiveCloseRearCurrentPlanePreserved:
          command.target.combatDefensiveCloseRearCurrentPlanePreserved,
        combatDefensiveOverbankedRearNearestPlanePreserved:
          command.target.combatDefensiveOverbankedRearNearestPlanePreserved,
        combatDefensiveLowPlanePhysicallyEngaged:
          command.target.combatDefensiveLowPlanePhysicallyEngaged,
        combatDefensiveLowPlaneTransitionDeferred:
          command.target.combatDefensiveLowPlaneTransitionDeferred,
        combatDefensiveHighClimbLoadLimited:
          command.target.combatDefensiveHighClimbLoadLimited,
        combatDefensiveTransferGunfireAbort:
          command.target.combatDefensiveTransferGunfireAbort,
        combatDefensiveGunfireBankHoldActive:
          command.target.combatDefensiveGunfireBankHoldActive,
        combatDefensiveLowPlaneTimeToClosestApproachS:
          command.target.combatDefensiveLowPlaneTimeToClosestApproachS,
        combatDefensiveLowPlaneTimeToGunEnvelopeS:
          command.target.combatDefensiveLowPlaneTimeToGunEnvelopeS,
        combatDefensiveLowPlaneSamples:
          command.target.combatDefensiveLowPlaneSamples,
        combatDefensiveLowPlaneComplete:
          command.target.combatDefensiveLowPlaneComplete,
        combatDefensiveHighPlaneReleaseSamples:
          command.target.combatDefensiveHighPlaneReleaseSamples,
        combatDefensiveHighPlaneComplete:
          command.target.combatDefensiveHighPlaneComplete,
        combatDefensiveHighPlaneRecoveryActive:
          command.target.combatDefensiveHighPlaneRecoveryActive,
        combatDefensiveThreatReason: command.target.combatDefensiveThreatReason,
        combatDefensivePointBlankRearReacquisitionThreat:
          command.target.combatDefensivePointBlankRearReacquisitionThreat,
        combatDefensivePrimaryShooterElevationDeg:
          command.target.combatDefensivePrimaryShooterElevationDeg,
        combatDefensiveShooterElevationDeg:
          command.target.combatDefensiveShooterElevationDeg,
        combatDefensiveOpponentNoseErrorDeg:
          command.target.combatDefensiveOpponentNoseErrorDeg,
        combatDefensivePrimaryAimSamples:
          command.target.combatDefensivePrimaryAimSamples,
        combatDefensivePrimaryAimNotDiverging:
          command.target.combatDefensivePrimaryAimNotDiverging,
        combatDownhillSliceActive: command.target.combatDownhillSliceActive,
        combatDownhillSliceRollArmed: command.target.combatDownhillSliceRollArmed,
        combatDownhillSlicePullActive: command.target.combatDownhillSlicePullActive,
        combatDownhillSliceUnloadSamples:
          command.target.combatDownhillSliceUnloadSamples,
        combatDownhillSliceTargetRecovered:
          command.target.combatDownhillSliceTargetRecovered,
        combatDownhillRecoveryPhase: command.target.combatDownhillRecoveryPhase,
        combatDownhillRecoveryRollArmed:
          command.target.combatDownhillRecoveryRollArmed,
        combatDownhillPostPassConversionActive:
          command.target.combatDownhillPostPassConversionActive,
        gunLeadBasisValid: command.target.gunLeadBasisValid,
        gunLeadFinisherActive: command.target.gunLeadFinisherActive,
        gunLeadImminentPassBankHoldActive:
          command.target.gunLeadImminentPassBankHoldActive,
        gunLeadPitchDominatedApproachBankHoldActive:
          command.target.gunLeadPitchDominatedApproachBankHoldActive,
        gunLeadFinisherEarlyHighClosureEntry:
          command.target.gunLeadFinisherEarlyHighClosureEntry,
        gunLeadFinisherFreshLoadedEntryDeferred:
          command.target.gunLeadFinisherFreshLoadedEntryDeferred,
        gunLeadFinisherRearmBlocked:
          command.target.gunLeadFinisherRearmBlocked,
        gunLeadFinisherEntryBankDeg:
          command.target.gunLeadFinisherEntryBankDeg,
        gunLeadFinisherLivePlaneTravelFromEntryDeg:
          command.target.gunLeadFinisherLivePlaneTravelFromEntryDeg,
        gunLeadFinisherCapturedPlaneTravelFromEntryDeg:
          command.target.gunLeadFinisherCapturedPlaneTravelFromEntryDeg,
        gunLeadFinisherBankLimitExitActive:
          command.target.gunLeadFinisherBankLimitExitActive,
        gunLeadFinisherOverbankGuardActive:
          command.target.gunLeadFinisherOverbankGuardActive,
        gunLeadFinisherOverbankUnloadActive:
          command.target.gunLeadFinisherOverbankUnloadActive,
        gunLeadFinisherUnboundedBankTargetDeg:
          command.target.gunLeadFinisherUnboundedBankTargetDeg,
        gunLeadFinisherBoundedBankTargetDeg:
          command.target.gunLeadFinisherBoundedBankTargetDeg,
        gunLeadFinisherProjectedBankDeg:
          command.target.gunLeadFinisherProjectedBankDeg,
        finisherExceededEntryPlaneTravel:
          command.target.finisherExceededEntryPlaneTravel,
        gunLeadRollCaptureActive: command.target.gunLeadRollCaptureActive,
        gunLeadCartesianCaptureConverged:
          command.target.gunLeadCartesianCaptureConverged,
        gunLeadCapturedFineRollActive: command.target.gunLeadCapturedFineRollActive,
        gunLeadRollCaptureHandoffActive: command.target.gunLeadRollCaptureHandoffActive,
        gunLeadCartesianRollActive: command.target.gunLeadCartesianRollActive,
        gunLeadCartesianRollRateDps: command.target.gunLeadCartesianRollRateDps,
        gunLeadCartesianRangeScale: command.target.gunLeadCartesianRangeScale,
        gunLeadCartesianRollFeedForwardDps:
          command.target.gunLeadCartesianRollFeedForwardDps,
        gunLeadPitchIsolationRecenterRateDps:
          command.target.gunLeadPitchIsolationRecenterRateDps,
        gunLeadHighClosureConeRecoveryActive:
          command.target.gunLeadHighClosureConeRecoveryActive,
        gunLeadCartesianRollBiasRateDps:
          command.target.gunLeadCartesianRollBiasRateDps,
        leadLateralErrorDeg: command.target.leadLateralErrorDeg,
        leadLateralErrorDeltaDeg: command.target.leadLateralErrorDeltaDeg,
        leadLiftErrorDeg: command.target.leadLiftErrorDeg,
        leadLiftErrorDeltaDeg: command.target.leadLiftErrorDeltaDeg,
        gunLeadLiftDampingCommand: command.target.gunLeadLiftDampingCommand,
        gunLeadPitchDominatedFineCapture:
          command.target.gunLeadPitchDominatedFineCapture,
        gunLeadCapturedPitchLoadedTrimActive:
          command.target.gunLeadCapturedPitchLoadedTrimActive,
        capturedPitchAxisPullActive:
          command.target.capturedPitchAxisPullActive,
        gunLeadPredictiveOvershootBrakeActive:
          command.target.gunLeadPredictiveOvershootBrakeActive,
        gunLeadPitchAxisApproachBrakeActive:
          command.target.gunLeadPitchAxisApproachBrakeActive,
        gunLeadCloseApproachBrakeActive:
          command.target.gunLeadCloseApproachBrakeActive,
        publishedPitchRateErrorDps:
          command.target.publishedPitchRateErrorDps,
        leadRollCaptureTrimDeg: command.target.leadRollCaptureTrimDeg,
        gunLeadTargetChanged: command.target.gunLeadTargetChanged,
        leadRollPlaneErrorDeg: command.target.leadRollPlaneErrorDeg,
        leadRollControlErrorDeg: command.target.leadRollControlErrorDeg,
        leadOffBoresightDeg: command.target.leadOffBoresightDeg,
        combatCornerEnergyActive: command.target.combatCornerEnergyActive,
        combatCornerFast: command.target.combatCornerFast,
        combatDefensivePowerOverrideActive:
          command.target.combatDefensivePowerOverrideActive,
        combatDefensivePowerTarget: command.target.combatDefensivePowerTarget,
        energySpeedMode: command.target.energySpeedMode,
        finisherNeedsBrake: command.target.finisherNeedsBrake,
        recoveryDesiredPower01: command.target.recoveryDesiredPower01,
        approachGateCount: command.target.approachGateCount,
        approachTargetKtas: command.target.approachTargetKtas,
        foxTwoRequestSequence,
        rollCommand: command.roll,
        pitchCommand: command.pitch,
        throttleUp: physicalCommand.throttleUp,
        throttleDown: physicalCommand.throttleDown,
        appliedRollCommand: appliedAxes.roll,
        appliedPitchCommand: appliedAxes.pitch,
        limitOverride: recoveryLimitOverride,
        overrideMaximumLoadFactorG,
        appliedLoadFactorG: fixedWingLoadFactorForPitch(
          appliedAxes.pitch,
          command.target.maximumLoadFactorG,
        ),
        gunSolutionRaw: pulseSample.gunSolutionRaw,
        gunSolution: pulseSample.gunSolution,
        gunDecisionTick: pulseSample.tick,
        gunDecisionRangeM: pulseSample.rangeM,
        gunDecisionClosureKts: pulseSample.closureKts,
        gunDecisionInterlockClear:
          fixedWingAiGunSolutionInterlockClear(pulseSample),
        gunFireEligibleSamples: gunFireState.eligibleSamples,
        gunFireMaximumEligibleSamples: gunFireState.maximumEligibleSamples,
        gunFireCommandUpdates: gunFireState.fireCommandUpdates,
        gunFireFirstCommandTick: gunFireState.firstFireCommandTick,
        fire: physicalFire,
      };
    } catch (error) {
      lastError = error?.message ?? String(error);
      stopped = true;
      try { release(); } catch { /* retain the original controller failure */ }
      if (timer !== null) clearInterval(timer);
    }
  };

  const api = {
    diagnostics() {
      const durationS = firstUpdateAtMs !== null && lastUpdateAtMs > firstUpdateAtMs
        ? (lastUpdateAtMs - firstUpdateAtMs) / 1_000
        : 0;
      return {
        updates,
        controlRateHz: durationS > 0 && updates > 1 ? (updates - 1) / durationS : 0,
        p95ControlIntervalMs: intervalsMs.length ? percentile(intervalsMs, 0.95) : 0,
        maximumControlIntervalMs: intervalsMs.length ? Math.max(...intervalsMs) : 0,
        limitOverrideWrites,
        gunFireMaximumEligibleSamples: gunFireState.maximumEligibleSamples,
        gunFireCommandUpdates: gunFireState.fireCommandUpdates,
        gunFireFirstCommandTick: gunFireState.firstFireCommandTick,
        padlockPulsePending: padlockPulse,
        lastError,
        last,
      };
    },
    requestPadlockPulse() {
      if (stopped) return false;
      padlockPulse = true;
      return true;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearInterval(timer);
      release();
    },
  };
  globalThis.__gunsOnlyFixedWingBrowserPilot = api;
  update();
  timer = setInterval(update, Math.max(20, Number(sampleMs) || FIXED_WING_AI_SAMPLE_MS));
  return api;
}

function distanceTravelled(samples) {
  if (!samples?.length) return 0;
  let distanceM = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    distanceM += Math.hypot(
      finite(current.xM) - finite(previous.xM),
      finite(current.yM) - finite(previous.yM),
      finite(current.zM) - finite(previous.zM),
    );
  }
  return distanceM;
}

/** Evidence that a real first-run flight stayed on the published river floor, not just alive. */
export function firstRunValleyClearanceEvidence(samples) {
  const coldSamples = (samples ?? []).filter((sample) => sample?.weaponsCold === true);
  const marginsM = [];
  const calibratedSpeedsKts = coldSamples
    .map((sample) => Number(sample?.calibratedSpeedKts))
    .filter(Number.isFinite);
  const gMaxPerformValues = coldSamples
    .map((sample) => Number(sample?.gMaxPerform))
    .filter(Number.isFinite);
  const desiredLoadFactorValues = coldSamples
    .map((sample) => Number(sample?.aiDesiredLoadFactorG))
    .filter(Number.isFinite);
  const requestedLoadFactorValues = coldSamples
    .map((sample) => Number(sample?.requestedG))
    .filter(Number.isFinite);
  const appliedLoadFactorValues = coldSamples
    .map((sample) => Number(sample?.appliedGCommand))
    .filter(Number.isFinite);
  const actualLoadFactorValues = coldSamples
    .map((sample) => Number(sample?.actualG))
    .filter(Number.isFinite);
  const pullProofSamples = coldSamples.filter((sample) =>
    Number(sample?.aiDesiredLoadFactorG) >= 1.35
      && sample?.pilotControlInterlocked !== true
      && sample?.autoGcasActive !== true);
  const loadTurnExpectedSamples = coldSamples.filter((sample) =>
    Math.abs(Number(sample?.aiDesiredBankDeg)) >= 35).length;
  const pullRequestedValues = pullProofSamples
    .map((sample) => Number(sample?.requestedG))
    .filter(Number.isFinite);
  const pullAppliedValues = pullProofSamples
    .map((sample) => Number(sample?.appliedGCommand))
    .filter(Number.isFinite);
  const pullActualValues = pullProofSamples
    .map((sample) => Number(sample?.actualG))
    .filter(Number.isFinite);
  for (const sample of coldSamples) {
    const publishedMarginM = Number(sample?.valleyFloorMarginM);
    if (sample?.valleyProfileValid === true && Number.isFinite(publishedMarginM)) {
      marginsM.push(publishedMarginM);
      continue;
    }
    const profile = firstRunValleyProfileFromState(sample?.state ?? {});
    const eastM = Number(sample?.xM);
    const northM = Number(sample?.zM);
    if (!profile || !Number.isFinite(eastM) || !Number.isFinite(northM)) continue;
    const centreEastM = firstRunValleyCenterEastM(profile, northM);
    if (!Number.isFinite(centreEastM)) continue;
    marginsM.push(profile.floorHalfWidthM - Math.abs(eastM - centreEastM));
  }
  const radarAltitudeSamples = coldSamples.filter((sample) =>
    Number.isFinite(Number(sample?.radarAltitudeFt)));
  return Object.freeze({
    coldSamples: coldSamples.length,
    profileSamples: marginsM.length,
    profileCoverage: coldSamples.length ? marginsM.length / coldSamples.length : 0,
    terrainCoverage: coldSamples.length
      ? coldSamples.filter((sample) => sample?.terrainPresent === true).length
        / coldSamples.length
      : 0,
    radarAltitudeCoverage: coldSamples.length
      ? radarAltitudeSamples.length / coldSamples.length
      : 0,
    belowGroundSamples: coldSamples.filter((sample) => sample?.belowGround === true).length,
    minimumFloorMarginM: marginsM.length ? Math.min(...marginsM) : null,
    p05FloorMarginM: marginsM.length ? percentile(marginsM, 0.05) : null,
    calibratedSpeedCoverage: coldSamples.length
      ? calibratedSpeedsKts.length / coldSamples.length
      : 0,
    minimumCalibratedSpeedKts: calibratedSpeedsKts.length
      ? Math.min(...calibratedSpeedsKts)
      : null,
    medianCalibratedSpeedKts: calibratedSpeedsKts.length
      ? percentile(calibratedSpeedsKts, 0.5)
      : null,
    p95CalibratedSpeedKts: calibratedSpeedsKts.length
      ? percentile(calibratedSpeedsKts, 0.95)
      : null,
    maximumCalibratedSpeedKts: calibratedSpeedsKts.length
      ? Math.max(...calibratedSpeedsKts)
      : null,
    gMaxPerformCoverage: coldSamples.length
      ? gMaxPerformValues.length / coldSamples.length
      : 0,
    requestedLoadFactorCoverage: coldSamples.length
      ? requestedLoadFactorValues.length / coldSamples.length
      : 0,
    appliedLoadFactorCoverage: coldSamples.length
      ? appliedLoadFactorValues.length / coldSamples.length
      : 0,
    actualLoadFactorCoverage: coldSamples.length
      ? actualLoadFactorValues.length / coldSamples.length
      : 0,
    maximumDesiredLoadFactorG: desiredLoadFactorValues.length
      ? Math.max(...desiredLoadFactorValues)
      : null,
    maximumRequestedLoadFactorG: requestedLoadFactorValues.length
      ? Math.max(...requestedLoadFactorValues)
      : null,
    maximumAppliedLoadFactorG: appliedLoadFactorValues.length
      ? Math.max(...appliedLoadFactorValues)
      : null,
    maximumActualLoadFactorG: actualLoadFactorValues.length
      ? Math.max(...actualLoadFactorValues)
      : null,
    loadTurnExpectedSamples,
    pullProofSamples: pullProofSamples.length,
    maximumRequestedPullG: pullRequestedValues.length ? Math.max(...pullRequestedValues) : null,
    maximumAppliedPullG: pullAppliedValues.length ? Math.max(...pullAppliedValues) : null,
    maximumActualPullG: pullActualValues.length ? Math.max(...pullActualValues) : null,
  });
}

function longestAuthorityStallSeconds(samples) {
  let longest = 0;
  let stallStartedAt = null;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (finite(current.tick, -1) <= finite(previous.tick, -1)) {
      stallStartedAt ??= finite(previous.wallS);
      longest = Math.max(longest, finite(current.wallS) - stallStartedAt);
    } else {
      stallStartedAt = null;
    }
  }
  return longest;
}

function optionalDesiredBankDeg(sample) {
  const raw = sample?.aiDesiredBankDeg;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isIntentionalRollCommandTransition(previous, current, previousReversalOrigin) {
  const previousDesiredBankDeg = optionalDesiredBankDeg(previous);
  const currentDesiredBankDeg = optionalDesiredBankDeg(current);
  if (previousDesiredBankDeg === null || currentDesiredBankDeg === null
      || Math.abs(wrapAngleDeg(currentDesiredBankDeg - previousDesiredBankDeg)) <= 10) {
    return false;
  }

  const originDesiredBankDeg = optionalDesiredBankDeg(previousReversalOrigin);
  const returnedToPriorTarget = originDesiredBankDeg !== null
    && Math.abs(wrapAngleDeg(currentDesiredBankDeg - originDesiredBankDeg)) <= 10;
  if (returnedToPriorTarget) return false;

  // A material one-way target move is expected whether it comes from live geometry or an explicit
  // tactical owner. The previous-reversal origin above makes A/B/A target or mode toggles visible.
  return true;
}

/**
 * Detect sustained left/right command chatter without treating a new recovery/tactical owner or
 * a material commanded-bank move as oscillation. Neutral commands do not reset the committed
 * sign. Sparse synthetic/legacy tapes without those diagnostics retain the fail-closed behavior.
 */
export function rollCommandChatterStats(samples, {
  threshold = 0.05,
  windowS = 10,
  burstWindowS = 2,
} = {}) {
  let previousSign = 0;
  let previousStrongSample = null;
  let previousReversalOriginSample = null;
  const reversalTimesS = [];
  for (const sample of samples ?? []) {
    const command = Number(sample?.aiRollCommand);
    const wallS = Number(sample?.wallS);
    if (!Number.isFinite(command) || !Number.isFinite(wallS)) continue;
    const sign = command >= threshold ? 1 : command <= -threshold ? -1 : 0;
    if (sign === 0) continue;
    if (previousSign !== 0 && sign !== previousSign) {
      if (!isIntentionalRollCommandTransition(
        previousStrongSample,
        sample,
        previousReversalOriginSample,
      )) {
        reversalTimesS.push(wallS);
      }
      previousReversalOriginSample = previousStrongSample;
    }
    previousSign = sign;
    previousStrongSample = sample;
  }

  const maximumRateInWindow = (durationS) => {
    let start = 0;
    let maximumRateHz = 0;
    for (let index = 0; index < reversalTimesS.length; index += 1) {
      while (reversalTimesS[index] - reversalTimesS[start] > durationS) start += 1;
      maximumRateHz = Math.max(maximumRateHz, (index - start + 1) / durationS);
    }
    return maximumRateHz;
  };
  return Object.freeze({
    reversals: reversalTimesS.length,
    maximumReversalRateHz: maximumRateInWindow(windowS),
    maximumBurstReversalRateHz: maximumRateInWindow(burstWindowS),
    threshold,
    windowS,
    burstWindowS,
  });
}

/**
 * Detect continuous low-load body rotation. A controller can look perfectly smooth to the command
 * chatter watchdog while still flying a visually absurd full aileron roll; integrating the
 * measured roll rate makes that physical failure observable without rejecting an ordinary
 * half-roll into a new tactical plane.
 */
export function unloadedRollEpisodeStats(samples, {
  maximumLoadG = 2,
  fullRollDeg = 270,
  maximumEvidenceStepS = 0.2,
  directionDeadbandDps = 15,
} = {}) {
  const episodes = [];
  let current = null;

  const finishEpisode = () => {
    if (current?.evidenceSamples >= 2) episodes.push(Object.freeze({ ...current }));
    current = null;
  };

  for (const sample of samples ?? []) {
    const wallS = Number(sample?.wallS);
    const actualG = fixedWingTelemetryNumberOrNull(sample?.actualG);
    const rollRateDps = fixedWingTelemetryNumberOrNull(sample?.rollRateDps);
    const validUnloadedEvidence = sample?.playerTerminal === "FLYING"
      && Number.isFinite(wallS)
      && Number.isFinite(actualG)
      && Number.isFinite(rollRateDps)
      && Math.abs(actualG) < maximumLoadG;
    if (!validUnloadedEvidence) {
      finishEpisode();
      continue;
    }

    const materialDirectionSign = Math.abs(rollRateDps) >= directionDeadbandDps
      ? Math.sign(rollRateDps)
      : 0;
    if (current === null || wallS <= current.lastWallS) {
      finishEpisode();
      current = {
        startWallS: wallS,
        lastWallS: wallS,
        durationS: 0,
        integratedRollDeg: 0,
        evidenceSamples: 1,
        directionSign: materialDirectionSign,
      };
      continue;
    }

    if (materialDirectionSign !== 0
        && current.directionSign !== 0
        && materialDirectionSign !== current.directionSign) {
      // "Continuously rolled" means one physical direction. Tape 476 rolled ~257 degrees left,
      // then terrain recovery reversed through ~163 degrees right; summing absolute rate across
      // that obvious reversal falsely reported a 420-degree aileron roll. End the episode only on
      // a material direction change so ordinary rate damping around zero cannot fragment proof.
      finishEpisode();
      current = {
        startWallS: wallS,
        lastWallS: wallS,
        durationS: 0,
        integratedRollDeg: 0,
        evidenceSamples: 1,
        directionSign: materialDirectionSign,
      };
      continue;
    }
    if (current.directionSign === 0 && materialDirectionSign !== 0) {
      current.directionSign = materialDirectionSign;
    }

    const elapsedS = clamp(wallS - current.lastWallS, 0, maximumEvidenceStepS);
    current.durationS += elapsedS;
    current.integratedRollDeg += Math.abs(rollRateDps) * elapsedS;
    current.lastWallS = wallS;
    current.evidenceSamples += 1;
  }
  finishEpisode();

  const qualifyingEpisodes = episodes.filter((episode) =>
    episode.integratedRollDeg >= fullRollDeg);
  const largestEpisode = episodes.reduce((largest, episode) =>
    episode.integratedRollDeg > (largest?.integratedRollDeg ?? -1) ? episode : largest, null);
  return Object.freeze({
    episodes: episodes.length,
    qualifyingEpisodes: qualifyingEpisodes.length,
    maximumIntegratedRollDeg: largestEpisode?.integratedRollDeg ?? 0,
    maximumEpisodeDurationS: largestEpisode?.durationS ?? 0,
    cumulativeQualifyingRollDeg: qualifyingEpisodes.reduce(
      (sum, episode) => sum + episode.integratedRollDeg,
      0,
    ),
    maximumLoadG,
    fullRollDeg,
    maximumEvidenceStepS,
    directionDeadbandDps,
  });
}

/**
 * Detect the visually implausible knife-edge pull that can look like the pilot is holding the
 * nose up with top rudder even when requested, applied and ARI rudder are all zero. This is a
 * physical-state watchdog: only settled, positive-G flight beyond the sustainable 84-degree bank
 * margin and below 150 degrees qualifies. A fully inverted, symmetric split-S is a separate
 * recognizable manoeuvre; transit
 * rate and vertical-excursion gates still grade it. Observer gaps break an episode rather than
 * manufacturing duration from stale evidence.
 */
export function isSettledLoadedOverbankSample(sample, {
  minimumAbsBankDeg = 84,
  maximumAbsBankDeg = 150,
  minimumLoadG = 2.5,
  maximumAbsRollRateDps = 20,
  minimumBankInclusive = false,
  minimumLoadInclusive = false,
  maximumAbsGammaDeg = Number.POSITIVE_INFINITY,
  excludeSafetyRecovery = false,
} = {}) {
  const bankDeg = fixedWingTelemetryNumberOrNull(sample?.bankDeg);
  const actualG = fixedWingTelemetryNumberOrNull(sample?.actualG);
  const rollRateDps = fixedWingTelemetryNumberOrNull(sample?.rollRateDps);
  const gammaDeg = fixedWingTelemetryNumberOrNull(sample?.gammaDeg);
  const bankAboveMinimum = minimumBankInclusive
    ? Math.abs(bankDeg) >= minimumAbsBankDeg
    : Math.abs(bankDeg) > minimumAbsBankDeg;
  const loadAboveMinimum = minimumLoadInclusive
    ? actualG >= minimumLoadG : actualG > minimumLoadG;
  return sample?.playerTerminal === "FLYING"
    && Number.isFinite(Number(sample?.wallS))
    && Number.isFinite(bankDeg)
    && Number.isFinite(actualG)
    && Number.isFinite(rollRateDps)
    && bankAboveMinimum
    && Math.abs(bankDeg) < maximumAbsBankDeg
    && loadAboveMinimum
    && Math.abs(rollRateDps) <= maximumAbsRollRateDps
    && (!Number.isFinite(maximumAbsGammaDeg)
      || (Number.isFinite(gammaDeg) && Math.abs(gammaDeg) <= maximumAbsGammaDeg))
    && (!excludeSafetyRecovery
      || (sample?.autoGcasActive !== true && sample?.aiTerrainEscapeRecovery !== true));
}

export function settledLoadedOverbankStats(samples, {
  minimumAbsBankDeg = 84,
  remainMinimumAbsBankDeg = minimumAbsBankDeg,
  maximumQualifyingAbsBankDeg = 150,
  minimumLoadG = 2.5,
  maximumAbsRollRateDps = 20,
  minimumBankInclusive = false,
  minimumLoadInclusive = false,
  maximumAbsGammaDeg = Number.POSITIVE_INFINITY,
  excludeSafetyRecovery = false,
  maximumEvidenceStepS = 0.2,
  maximumContinuityGapS = 1,
} = {}) {
  const ownerSeconds = {
    verticalRecovery: 0,
    downhillSlice: 0,
    defensive: 0,
    other: 0,
  };
  const episodes = [];
  let current = null;
  let evidenceSamples = 0;
  let totalS = 0;
  let maximumAbsBankDeg = 0;

  const ownerFor = (sample) => {
    if (sample?.aiVerticalRecoveryPhase === "slice") return "verticalRecovery";
    if (sample?.aiCombatDownhillSliceActive === true) return "downhillSlice";
    if (sample?.aiCombatDefensiveBreakControlOwned === true
        || sample?.aiCombatDefensiveBreakActive === true
        || sample?.aiCombatDefensiveHighPlaneRecoveryActive === true) {
      return "defensive";
    }
    return "other";
  };
  const finishEpisode = () => {
    if (current?.evidenceSamples >= 2) {
      episodes.push(Object.freeze({
        ...current,
        ownerSeconds: Object.freeze({ ...current.ownerSeconds }),
      }));
    }
    current = null;
  };

  for (const sample of samples ?? []) {
    const wallS = Number(sample?.wallS);
    const bankDeg = Number(sample?.bankDeg);
    const continuingEpisode = current !== null
      && wallS > current.lastWallS
      && wallS - current.lastWallS <= maximumContinuityGapS;
    const qualifies = isSettledLoadedOverbankSample(sample, {
      minimumAbsBankDeg: continuingEpisode
        ? remainMinimumAbsBankDeg : minimumAbsBankDeg,
      maximumAbsBankDeg: maximumQualifyingAbsBankDeg,
      minimumLoadG,
      maximumAbsRollRateDps,
      minimumBankInclusive,
      minimumLoadInclusive,
      maximumAbsGammaDeg,
      excludeSafetyRecovery,
    });
    if (!qualifies) {
      finishEpisode();
      continue;
    }

    const absBankDeg = Math.abs(bankDeg);
    maximumAbsBankDeg = Math.max(maximumAbsBankDeg, absBankDeg);
    evidenceSamples += 1;
    if (current === null || wallS <= current.lastWallS
        || wallS - current.lastWallS > maximumContinuityGapS) {
      finishEpisode();
      current = {
        startWallS: wallS,
        lastWallS: wallS,
        durationS: 0,
        maximumAbsBankDeg: absBankDeg,
        evidenceSamples: 1,
        ownerSeconds: {
          verticalRecovery: 0,
          downhillSlice: 0,
          defensive: 0,
          other: 0,
        },
      };
      continue;
    }

    const elapsedS = Math.min(wallS - current.lastWallS, maximumEvidenceStepS);
    current.durationS += elapsedS;
    current.lastWallS = wallS;
    current.maximumAbsBankDeg = Math.max(current.maximumAbsBankDeg, absBankDeg);
    current.evidenceSamples += 1;
    totalS += elapsedS;
    const owner = ownerFor(sample);
    ownerSeconds[owner] += elapsedS;
    current.ownerSeconds[owner] += elapsedS;
  }
  finishEpisode();

  const longestEpisode = episodes.reduce((longest, episode) =>
    episode.durationS > (longest?.durationS ?? -1) ? episode : longest, null);

  return Object.freeze({
    episodes: episodes.length,
    evidenceSamples,
    totalS,
    longestS: longestEpisode?.durationS ?? 0,
    longestEpisode,
    maximumAbsBankDeg,
    ownerSeconds: Object.freeze(ownerSeconds),
    minimumAbsBankDeg,
    remainMinimumAbsBankDeg,
    maximumQualifyingAbsBankDeg,
    minimumLoadG,
    maximumAbsRollRateDps,
    minimumBankInclusive,
    minimumLoadInclusive,
    maximumAbsGammaDeg,
    excludeSafetyRecovery,
    maximumEvidenceStepS,
    maximumContinuityGapS,
  });
}

function unwrappedValuesDeg(values) {
  if (!values?.length) return [];
  let previous = finite(values[0]);
  let unwrapped = previous;
  const result = [unwrapped];
  for (let index = 1; index < values.length; index += 1) {
    const next = finite(values[index]);
    unwrapped += wrapAngleDeg(next - previous);
    previous = next;
    result.push(unwrapped);
  }
  return result;
}

function unwrappedSpanDeg(values) {
  const unwrapped = unwrappedValuesDeg(values);
  if (!unwrapped.length) return 0;
  const minimum = Math.min(...unwrapped);
  const maximum = Math.max(...unwrapped);
  return maximum - minimum;
}

function detrendedUnwrappedSpanDeg(values) {
  const unwrapped = unwrappedValuesDeg(values);
  if (unwrapped.length < 2) return 0;
  const first = unwrapped[0];
  const slope = (unwrapped.at(-1) - first) / (unwrapped.length - 1);
  const residuals = unwrapped.map((value, index) => value - first - slope * index);
  return Math.max(...residuals) - Math.min(...residuals);
}

/** Physical rocking while the controller's desired bank is essentially stationary. */
export function physicalRollRockingStats(samples, {
  windowS = 2,
  desiredBankSpanLimitDeg = 3,
  bankTrackingErrorLimitDeg = 5,
  rollRateThresholdDps = 3,
  minimumReversals = 4,
  bankPeakToPeakLimitDeg = 1.5,
} = {}) {
  let start = 0;
  let maximumReversals = 0;
  let maximumRockingBankPeakToPeakDeg = 0;
  let violatingWindows = 0;
  for (let end = 0; end < (samples?.length ?? 0); end += 1) {
    while (start < end && finite(samples[end]?.wallS) - finite(samples[start]?.wallS) > windowS) {
      start += 1;
    }
    const windowDurationS = finite(samples[end]?.wallS) - finite(samples[start]?.wallS);
    if (windowDurationS < windowS * 0.9) continue;
    const window = samples.slice(start, end + 1);
    const desiredSpanDeg = unwrappedSpanDeg(window.map((sample) => sample.aiDesiredBankDeg));
    if (desiredSpanDeg > desiredBankSpanLimitDeg) continue;
    const maximumTrackingErrorDeg = Math.max(...window.map((sample) => Math.abs(wrapAngleDeg(
      finite(sample?.bankDeg) - finite(sample?.aiDesiredBankDeg),
    ))));
    if (maximumTrackingErrorDeg > bankTrackingErrorLimitDeg) continue;
    // A commanded capture can contain several damped rate reversals while still moving tens of
    // degrees toward the requested bank. Remove that legitimate trend; a settled alternating
    // rock remains in the residual motion and still fails the same physical threshold.
    const bankPeakToPeakDeg = detrendedUnwrappedSpanDeg(
      window.map((sample) => sample.bankDeg),
    );
    let previousSign = 0;
    let reversals = 0;
    for (const sample of window) {
      const rate = finite(sample?.rollRateDps);
      const sign = rate >= rollRateThresholdDps ? 1 : rate <= -rollRateThresholdDps ? -1 : 0;
      if (sign === 0) continue;
      if (previousSign !== 0 && sign !== previousSign) reversals += 1;
      previousSign = sign;
    }
    maximumReversals = Math.max(maximumReversals, reversals);
    if (reversals >= minimumReversals) {
      maximumRockingBankPeakToPeakDeg = Math.max(
        maximumRockingBankPeakToPeakDeg,
        bankPeakToPeakDeg,
      );
      if (bankPeakToPeakDeg > bankPeakToPeakLimitDeg) violatingWindows += 1;
    }
  }
  return Object.freeze({
    maximumReversals,
    maximumRockingBankPeakToPeakDeg,
    violatingWindows,
    windowS,
    desiredBankSpanLimitDeg,
    bankTrackingErrorLimitDeg,
    rollRateThresholdDps,
    minimumReversals,
    bankPeakToPeakLimitDeg,
  });
}

/**
 * Prove the production roll mapping across the asynchronous 20 Hz writer / 120 Hz consumer.
 * A single observer sample can land just before or just after the newest gamepad write is consumed,
 * so the authoritative request must match either the current write or the immediately previous one.
 */
export function rollInputFidelityStats(samples) {
  const absoluteErrors = [];
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    const current = Number(samples[index]?.aiAppliedRollCommand);
    const previous = Number(samples[index - 1]?.aiAppliedRollCommand);
    const actual = Number(samples[index]?.requestedRoll);
    if (!Number.isFinite(current) || !Number.isFinite(previous)
        || !Number.isFinite(actual)) continue;
    absoluteErrors.push(Math.min(
      Math.abs(actual - current),
      Math.abs(actual - previous),
    ));
  }
  const squaredError = absoluteErrors.reduce((sum, error) => sum + error * error, 0);
  return Object.freeze({
    pairs: absoluteErrors.length,
    coverage: (samples?.length ?? 0) > 1
      ? absoluteErrors.length / (samples.length - 1)
      : 0,
    p95AbsoluteError: percentile(absoluteErrors, 0.95),
    rmsError: absoluteErrors.length ? Math.sqrt(squaredError / absoluteErrors.length) : 0,
  });
}

/**
 * Longest post-merge stern chase where the selected live opponent is outside useful BFM range and
 * still opening. The initial reciprocal run-in is intentionally ignored: the latch arms only
 * after the aircraft have first joined inside 3.5 km. A reversal can open briefly, but a training
 * opponent may not turn that into the slow, indefinite chase reported by players.
 */
export function longestRunawayChaseSeconds(samples, {
  joinRangeM = 3_500,
  openingClosureKts = -10,
  maximumRelevantRangeM = 15_000,
} = {}) {
  let joined = false;
  let currentS = 0;
  let longestS = 0;
  for (let index = 0; index < (samples?.length ?? 0); index += 1) {
    const sample = samples[index];
    const rangeM = finite(sample?.rangeM, Number.POSITIVE_INFINITY);
    if (rangeM <= joinRangeM) joined = true;
    const previousWallS = index > 0 ? finite(samples[index - 1]?.wallS) : finite(sample?.wallS);
    const elapsedS = Math.max(0, finite(sample?.wallS) - previousWallS);
    const running = joined
      && sample?.opponentTerminal === "FLYING"
      && rangeM > joinRangeM
      && rangeM <= maximumRelevantRangeM
      && finite(sample?.closureKts) < openingClosureKts;
    currentS = running ? currentS + elapsedS : 0;
    longestS = Math.max(longestS, currentS);
  }
  return longestS;
}

/** Derive the selected opponent's earth-relative flight path from its published position tape. */
export function targetVerticalExcursionStats(samples, {
  baselineS = 0.5,
  steepGammaDeg = 60,
  maximumEvidenceStepS = 0.2,
} = {}) {
  const position = (sample) => {
    const raw = [sample?.opponentXM, sample?.opponentYM, sample?.opponentZM];
    if (raw.some((value) => value == null || !Number.isFinite(Number(value)))) return null;
    return raw.map(Number);
  };
  const key = (sample) => String(sample?.banditEntityId ?? "").trim();
  let anchor = 0;
  let activeKey = null;
  let previousEvidenceWallS = null;
  let currentSteepS = 0;
  let longestSteepS = 0;
  let cumulativeSteepS = 0;
  let maximumAbsGammaDeg = 0;
  let evidenceSamples = 0;
  let eligibleSamples = 0;

  for (let end = 0; end < (samples?.length ?? 0); end += 1) {
    const sample = samples[end];
    const sampleKey = key(sample);
    const samplePosition = position(sample);
    const targetChanged = activeKey !== null && sampleKey.length > 0 && sampleKey !== activeKey;
    if (sample?.opponentTerminal !== "FLYING" || samplePosition === null || targetChanged) {
      anchor = end;
      previousEvidenceWallS = null;
      currentSteepS = 0;
      activeKey = sampleKey || null;
      continue;
    }
    activeKey ??= sampleKey || null;
    eligibleSamples += 1;
    while (anchor < end - 1
        && finite(sample.wallS) - finite(samples[anchor + 1]?.wallS) >= baselineS) {
      anchor += 1;
    }
    const anchorSample = samples[anchor];
    const anchorPosition = position(anchorSample);
    const anchorKey = key(anchorSample);
    const elapsedBaselineS = finite(sample.wallS) - finite(anchorSample?.wallS);
    if (anchorPosition === null
        || (sampleKey.length > 0 && anchorKey.length > 0 && sampleKey !== anchorKey)
        || elapsedBaselineS < baselineS * 0.9) continue;

    const dx = samplePosition[0] - anchorPosition[0];
    const dy = samplePosition[1] - anchorPosition[1];
    const dz = samplePosition[2] - anchorPosition[2];
    if (Math.hypot(dx, dy, dz) < 1) continue;
    const absGammaDeg = Math.abs(toDegrees(Math.atan2(dy, Math.hypot(dx, dz))));
    maximumAbsGammaDeg = Math.max(maximumAbsGammaDeg, absGammaDeg);
    evidenceSamples += 1;
    const evidenceStepS = previousEvidenceWallS === null
      ? 0
      : clamp(finite(sample.wallS) - previousEvidenceWallS, 0, maximumEvidenceStepS);
    if (absGammaDeg > steepGammaDeg) {
      cumulativeSteepS += evidenceStepS;
      currentSteepS += evidenceStepS;
      longestSteepS = Math.max(longestSteepS, currentSteepS);
    } else {
      currentSteepS = 0;
    }
    previousEvidenceWallS = finite(sample.wallS);
  }

  return Object.freeze({
    evidenceSamples,
    eligibleSamples,
    coverage: eligibleSamples > 0 ? evidenceSamples / eligibleSamples : 0,
    maximumAbsGammaDeg,
    cumulativeSteepS,
    longestSteepS,
    baselineS,
    steepGammaDeg,
  });
}

/** Grade the playerbot's published flight path so a bandit watchdog cannot hide its own dive. */
export function ownshipVerticalExcursionStats(samples, {
  steepGammaDeg = 60,
  maximumEvidenceStepS = 0.2,
} = {}) {
  let previousWallS = null;
  let currentSteepS = 0;
  let longestSteepS = 0;
  let cumulativeSteepS = 0;
  let maximumAbsGammaDeg = 0;
  let evidenceSamples = 0;
  for (const sample of samples ?? []) {
    const gammaDeg = Number(sample?.gammaDeg);
    if (sample?.playerTerminal !== "FLYING" || !Number.isFinite(gammaDeg)) {
      previousWallS = null;
      currentSteepS = 0;
      continue;
    }
    const wallS = finite(sample?.wallS);
    const evidenceStepS = previousWallS === null
      ? 0
      : clamp(wallS - previousWallS, 0, maximumEvidenceStepS);
    previousWallS = wallS;
    evidenceSamples += 1;
    const absGammaDeg = Math.abs(gammaDeg);
    maximumAbsGammaDeg = Math.max(maximumAbsGammaDeg, absGammaDeg);
    if (absGammaDeg > steepGammaDeg) {
      cumulativeSteepS += evidenceStepS;
      currentSteepS += evidenceStepS;
      longestSteepS = Math.max(longestSteepS, currentSteepS);
    } else {
      currentSteepS = 0;
    }
  }
  return Object.freeze({
    evidenceSamples,
    maximumAbsGammaDeg,
    cumulativeSteepS,
    longestSteepS,
    steepGammaDeg,
  });
}

function sortieCounter(sample, sortieProperty, liveProperty) {
  const sortieValue = Number(sample?.[sortieProperty]);
  return Number.isFinite(sortieValue) ? sortieValue : finite(sample?.[liveProperty]);
}

/** Prove the first-run Fire control really changes from two heaters to guns on a new contact. */
export function firstRunGunHandoffEvidence(samples) {
  const tape = samples ?? [];
  const first = tape[0] ?? {};
  const openingKills = finite(first.killCount);
  const openingMissiles = finite(first.aim9Remaining);
  const pairCompleteIndex = tape.findIndex((sample) =>
    finite(sample?.killCount) >= openingKills + 2
      && finite(sample?.aim9Remaining, Number.POSITIVE_INFINITY) <= openingMissiles - 2);
  if (pairCompleteIndex < 0) {
    return Object.freeze({
      pairComplete: false,
      successorSeen: false,
      gunRoundsFired: false,
      gunHitSeen: false,
    });
  }

  const pairComplete = tape[pairCompleteIndex];
  const retiredTargetKey = String(pairComplete?.banditEntityId ?? "").trim();
  const successorOffset = tape.slice(pairCompleteIndex + 1).findIndex((sample) => {
    const targetKey = String(sample?.banditEntityId ?? "").trim();
    return targetKey.length > 0
      && targetKey !== retiredTargetKey
      && sample?.opponentTerminal === "FLYING";
  });
  if (successorOffset < 0) {
    return Object.freeze({
      pairComplete: true,
      successorSeen: false,
      gunRoundsFired: false,
      gunHitSeen: false,
    });
  }

  const successorIndex = pairCompleteIndex + 1 + successorOffset;
  const roundsAtHandoff = sortieCounter(
    pairComplete,
    "sortiePlayerRoundsFired",
    "roundsFired",
  );
  const hitsAtHandoff = sortieCounter(pairComplete, "sortiePlayerHits", "hits");
  const successorTape = tape.slice(successorIndex);
  return Object.freeze({
    pairComplete: true,
    successorSeen: true,
    gunRoundsFired: successorTape.some((sample) => sortieCounter(
      sample,
      "sortiePlayerRoundsFired",
      "roundsFired",
    ) > roundsAtHandoff),
    gunHitSeen: successorTape.some((sample) => sortieCounter(
      sample,
      "sortiePlayerHits",
      "hits",
    ) > hitsAtHandoff),
  });
}

function longestConsecutiveSampleRun(samples, predicate) {
  let current = 0;
  let longest = 0;
  for (const sample of samples ?? []) {
    current = predicate(sample) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function closePassControlOwner(sample) {
  if (sample?.aiCombatDefensiveBreakActive === true) return "defense";
  if (sample?.aiTerrainRecoveryPhase && sample.aiTerrainRecoveryPhase !== "idle") {
    return "terrain-recovery";
  }
  if (sample?.aiVerticalRecoveryPhase && sample.aiVerticalRecoveryPhase !== "idle") {
    return "vertical-recovery";
  }
  if (sample?.aiCombatDownhillSliceActive === true
      || (sample?.aiCombatDownhillRecoveryPhase
        && sample.aiCombatDownhillRecoveryPhase !== "idle")) return "downhill-recovery";
  if (sample?.aiGunLeadRollCaptureActive === true) return "gun-capture";
  if (sample?.aiGunLeadFinisherActive === true) return "gun-finisher";
  return "pursuit";
}

/**
 * Turns repeated point-blank fly-throughs into explicit harness evidence. A pass arms while the
 * contact is inside the close-fight gate and closing, then completes only after closure has
 * crossed a real opening hysteresis boundary. Tiny sign noise therefore cannot manufacture CPAs.
 */
export function missedClosePassEpisodeStats(samples, {
  armRangeM = 750,
  qualifyRangeM = 500,
  minimumClosingKts = 50,
  maximumOpeningKts = -50,
  mergeGapS = 2,
} = {}) {
  const rawEpisodes = [];
  let active = null;
  const startEpisode = (sample, rangeM, closureKts) => ({
    startWallS: finite(sample?.wallS, finite(sample?.simS)),
    endWallS: finite(sample?.wallS, finite(sample?.simS)),
    entryClosureKts: closureKts,
    exitClosureKts: closureKts,
    cpaSample: sample,
    minimumRangeM: rangeM,
    minimumLeadErrorDeg: Number.POSITIVE_INFINITY,
    openingRounds: finite(sample?.roundsFired),
    maximumRounds: finite(sample?.roundsFired),
    openingHits: finite(sample?.hits),
    maximumHits: finite(sample?.hits),
    qualifiedSolutionSeen: sample?.gunSolution === true,
    fireCommandSeen: sample?.aiFireCommand === true,
    owners: new Set([closePassControlOwner(sample)]),
  });
  const updateEpisode = (episode, sample, rangeM, closureKts) => {
    episode.endWallS = finite(sample?.wallS, finite(sample?.simS));
    episode.exitClosureKts = closureKts;
    episode.maximumRounds = Math.max(episode.maximumRounds, finite(sample?.roundsFired));
    episode.maximumHits = Math.max(episode.maximumHits, finite(sample?.hits));
    episode.qualifiedSolutionSeen ||= sample?.gunSolution === true;
    episode.fireCommandSeen ||= sample?.aiFireCommand === true;
    episode.owners.add(closePassControlOwner(sample));
    const leadErrorDeg = Number(sample?.aiLeadOffBoresightDeg);
    if (sample?.aiGunLeadBasisValid === true && Number.isFinite(leadErrorDeg)) {
      episode.minimumLeadErrorDeg = Math.min(episode.minimumLeadErrorDeg, leadErrorDeg);
    }
    if (rangeM < episode.minimumRangeM) {
      episode.minimumRangeM = rangeM;
      episode.cpaSample = sample;
    }
  };
  const finishEpisode = (episode) => {
    const roundsDelta = Math.max(0, episode.maximumRounds - episode.openingRounds);
    const hitsDelta = Math.max(0, episode.maximumHits - episode.openingHits);
    const cpa = episode.cpaSample ?? {};
    rawEpisodes.push({
      startWallS: episode.startWallS,
      endWallS: episode.endWallS,
      cpaWallS: finite(cpa?.wallS, finite(cpa?.simS)),
      minimumRangeM: episode.minimumRangeM,
      minimumLeadErrorDeg: Number.isFinite(episode.minimumLeadErrorDeg)
        ? episode.minimumLeadErrorDeg : null,
      entryClosureKts: episode.entryClosureKts,
      exitClosureKts: episode.exitClosureKts,
      roundsDelta,
      hitsDelta,
      qualifiedSolutionSeen: episode.qualifiedSolutionSeen,
      fireCommandSeen: episode.fireCommandSeen,
      owners: [...episode.owners],
      cpaBankDeg: Number.isFinite(Number(cpa?.bankDeg)) ? Number(cpa.bankDeg) : null,
      cpaRollRateDps: Number.isFinite(Number(cpa?.rollRateDps))
        ? Number(cpa.rollRateDps) : null,
      cpaActualG: Number.isFinite(Number(cpa?.actualG)) ? Number(cpa.actualG) : null,
    });
  };

  for (const sample of samples ?? []) {
    const rangeM = Number(sample?.rangeM);
    const closureKts = Number(sample?.closureKts);
    if (!Number.isFinite(rangeM) || !Number.isFinite(closureKts)) continue;
    if (active === null) {
      if (rangeM <= armRangeM && closureKts >= minimumClosingKts) {
        active = startEpisode(sample, rangeM, closureKts);
        updateEpisode(active, sample, rangeM, closureKts);
      }
      continue;
    }
    updateEpisode(active, sample, rangeM, closureKts);
    if (closureKts <= maximumOpeningKts) {
      finishEpisode(active);
      active = null;
    }
  }

  const mergedEpisodes = [];
  for (const episode of rawEpisodes) {
    const previous = mergedEpisodes.at(-1);
    if (!previous || episode.startWallS - previous.endWallS >= mergeGapS) {
      mergedEpisodes.push({ ...episode });
      continue;
    }
    previous.endWallS = episode.endWallS;
    previous.exitClosureKts = episode.exitClosureKts;
    previous.roundsDelta += episode.roundsDelta;
    previous.hitsDelta += episode.hitsDelta;
    previous.qualifiedSolutionSeen ||= episode.qualifiedSolutionSeen;
    previous.fireCommandSeen ||= episode.fireCommandSeen;
    previous.owners = [...new Set([...previous.owners, ...episode.owners])];
    const previousLeadErrorDeg = typeof previous.minimumLeadErrorDeg === "number"
        && Number.isFinite(previous.minimumLeadErrorDeg)
      ? previous.minimumLeadErrorDeg : Number.POSITIVE_INFINITY;
    const episodeLeadErrorDeg = typeof episode.minimumLeadErrorDeg === "number"
        && Number.isFinite(episode.minimumLeadErrorDeg)
      ? episode.minimumLeadErrorDeg : Number.POSITIVE_INFINITY;
    previous.minimumLeadErrorDeg = Math.min(previousLeadErrorDeg, episodeLeadErrorDeg);
    if (episode.minimumRangeM < previous.minimumRangeM) {
      previous.minimumRangeM = episode.minimumRangeM;
      previous.cpaWallS = episode.cpaWallS;
      previous.cpaBankDeg = episode.cpaBankDeg;
      previous.cpaRollRateDps = episode.cpaRollRateDps;
      previous.cpaActualG = episode.cpaActualG;
    }
  }
  const episodes = mergedEpisodes.map((episode) => Object.freeze({
    ...episode,
    minimumLeadErrorDeg: Number.isFinite(episode.minimumLeadErrorDeg)
      ? episode.minimumLeadErrorDeg : null,
    converted: episode.roundsDelta > 0
      || episode.hitsDelta > 0
      || episode.qualifiedSolutionSeen
      || episode.fireCommandSeen,
    owners: Object.freeze([...episode.owners]),
  }));
  const unconvertedClosePasses = episodes.filter((episode) =>
    episode.minimumRangeM <= qualifyRangeM && !episode.converted);
  return Object.freeze({
    episodes: Object.freeze(episodes),
    completedPasses: episodes.length,
    unconvertedClosePasses: unconvertedClosePasses.length,
    closestUnconvertedRangeM: unconvertedClosePasses.length
      ? Math.min(...unconvertedClosePasses.map((episode) => episode.minimumRangeM)) : null,
    bestUnconvertedLeadErrorDeg: unconvertedClosePasses.some((episode) =>
      Number.isFinite(episode.minimumLeadErrorDeg))
      ? Math.min(...unconvertedClosePasses
        .map((episode) => episode.minimumLeadErrorDeg)
        .filter(Number.isFinite)) : null,
    armRangeM,
    qualifyRangeM,
    minimumClosingKts,
    maximumOpeningKts,
  });
}

export function assessFixedWingAiFlight(samples, {
  mission = "f22",
  readyMs = 0,
  startLatencyMs = 0,
  stagedRequestedThrottle = null,
  stagedAppliedThrottle = null,
  maximumReadyMs = 15_000,
  maximumStartMs = 75_000,
} = {}) {
  const failures = [];
  const first = samples?.[0] ?? {};
  const last = samples?.at(-1) ?? {};
  const durationS = Math.max(0, finite(last.wallS) - finite(first.wallS));
  const tickSpan = Math.max(0, finite(last.tick) - finite(first.tick));
  const authorityRateHz = durationS > 0 ? tickSpan / durationS : 0;
  const evidenceSampleRateHz = durationS > 0 && (samples?.length ?? 0) > 1
    ? (samples.length - 1) / durationS
    : 0;
  const controlIntervalsMs = (samples ?? []).slice(1).map((sample, index) =>
    (finite(sample.wallS) - finite(samples[index]?.wallS)) * 1_000);
  const p95EvidenceSampleIntervalMs = percentile(controlIntervalsMs, 0.95);
  const browserPilotDiagnostics = [...(samples ?? [])].reverse()
    .find((sample) => sample?.browserPilot)?.browserPilot ?? null;
  const controlRateHz = browserPilotDiagnostics
    ? finite(browserPilotDiagnostics.controlRateHz)
    : evidenceSampleRateHz;
  const p95ControlIntervalMs = browserPilotDiagnostics
    ? finite(browserPilotDiagnostics.p95ControlIntervalMs)
    : p95EvidenceSampleIntervalMs;
  const authorityReadLatenciesMs = (samples ?? [])
    .map((sample) => Number(sample?.aiAuthorityReadLatencyMs))
    .filter(Number.isFinite);
  const gamepadWriteLatenciesMs = (samples ?? [])
    .map((sample) => Number(sample?.aiGamepadWriteLatencyMs))
    .filter(Number.isFinite);
  const p95AuthorityReadLatencyMs = authorityReadLatenciesMs.length
    ? percentile(authorityReadLatenciesMs, 0.95)
    : null;
  const p95GamepadWriteLatencyMs = gamepadWriteLatenciesMs.length
    ? percentile(gamepadWriteLatenciesMs, 0.95)
    : null;
  const travelledM = distanceTravelled(samples);
  const maximumStallS = longestAuthorityStallSeconds(samples);
  const maximumRunawayChaseS = longestRunawayChaseSeconds(samples);
  const targetVerticalExcursion = targetVerticalExcursionStats(samples);
  const ownshipVerticalExcursion = ownshipVerticalExcursionStats(samples);
  const rollChatter = rollCommandChatterStats(samples);
  const unloadedRollEpisodes = unloadedRollEpisodeStats(samples);
  const settledLoadedOverbank = settledLoadedOverbankStats(samples);
  const sustainedLoadedWallTurn = settledLoadedOverbankStats(samples, {
    minimumAbsBankDeg: 75,
    remainMinimumAbsBankDeg: 74,
    maximumQualifyingAbsBankDeg: 84,
    minimumBankInclusive: true,
    minimumLoadInclusive: true,
    maximumAbsGammaDeg: 45,
    excludeSafetyRecovery: true,
    maximumContinuityGapS: 0.25,
  });
  const physicalRollRocking = physicalRollRockingStats(samples);
  const rollInputFidelity = rollInputFidelityStats(samples);
  const rollRateTelemetryCoverage = samples?.length
    ? samples.filter((sample) =>
      Number.isFinite(fixedWingTelemetryNumberOrNull(sample?.rollRateDps))).length
      / samples.length
    : 0;
  const desiredLoadFactorValues = (samples ?? [])
    .map((sample) => Number(sample?.aiDesiredLoadFactorG))
    .filter(Number.isFinite);
  const maximumLoadFactorValues = (samples ?? [])
    .map((sample) => Number(sample?.gMaxPerform))
    .filter(Number.isFinite);
  const requestedLoadFactorValues = (samples ?? [])
    .map((sample) => Number(sample?.requestedG))
    .filter(Number.isFinite);
  const appliedLoadFactorValues = (samples ?? [])
    .map((sample) => Number(sample?.appliedGCommand))
    .filter(Number.isFinite);
  const actualLoadFactorValues = (samples ?? [])
    .map((sample) => fixedWingTelemetryNumberOrNull(sample?.actualG))
    .filter(Number.isFinite);
  const aoaValues = (samples ?? [])
    .map((sample) => fixedWingTelemetryNumberOrNull(sample?.aoaDeg))
    .filter(Number.isFinite);
  const aoaTelemetryCoverage = samples?.length
    ? aoaValues.length / samples.length
    : 0;
  const sortiePeakLoadFactorValues = (samples ?? [])
    .map((sample) => Number(sample?.sortiePeakG))
    .filter(Number.isFinite);
  const maximumDesiredLoadFactorG = desiredLoadFactorValues.length
    ? Math.max(...desiredLoadFactorValues) : null;
  const maximumRequestedLoadFactorG = requestedLoadFactorValues.length
    ? Math.max(...requestedLoadFactorValues) : null;
  const maximumAppliedLoadFactorG = appliedLoadFactorValues.length
    ? Math.max(...appliedLoadFactorValues) : null;
  const maximumActualLoadFactorG = actualLoadFactorValues.length
    ? Math.max(...actualLoadFactorValues) : null;
  const maximumSortiePeakLoadFactorG = sortiePeakLoadFactorValues.length
    ? Math.max(...sortiePeakLoadFactorValues) : null;
  const maximumRequestedRudder = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.requestedRudder))).filter(Number.isFinite));
  const maximumAppliedRudder = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.appliedRudder))).filter(Number.isFinite));
  const maximumF22AriRudder = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.f22AriRudder))).filter(Number.isFinite));
  const maximumEffectiveRudderCommand = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.effectiveRudderCommand))).filter(Number.isFinite));
  const maximumStabilityYawRateDps = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.stabilityYawRateDps))).filter(Number.isFinite));
  const f22LoadedRollEvidencePhase = (sample) => mission === "f22"
    || (mission === "first-run"
      && sample?.weaponsCold === false
      && finite(sample?.aim9Remaining, Number.POSITIVE_INFINITY) <= 0);
  const materialRollMissingLoadTelemetrySamples = (samples ?? []).filter((sample) => {
    const rollValue = sample?.aiAppliedRollCommand ?? sample?.aiRollCommand;
    const rollCommand = Number(rollValue);
    const actualG = Number(sample?.actualG);
    const aoaDeg = Number(sample?.aoaDeg);
    return f22LoadedRollEvidencePhase(sample)
      && rollValue != null
      && Number.isFinite(rollCommand)
      && Math.abs(rollCommand) >= 0.25
      && (sample?.actualG == null || !Number.isFinite(actualG)
        || sample?.aoaDeg == null || !Number.isFinite(aoaDeg))
      && sample?.autoGcasActive !== true
      && sample?.aiTerrainRecoveryPhase !== "auto-gcas";
  });
  const materialLoadedRollSamples = (samples ?? []).filter((sample) => {
    const rollValue = sample?.aiAppliedRollCommand ?? sample?.aiRollCommand;
    const rollCommand = Number(rollValue);
    const rollRateDps = Number(sample?.rollRateDps);
    const rollRateTelemetryValid = sample?.rollRateDps != null
      && Number.isFinite(rollRateDps);
    const actualG = Number(sample?.actualG);
    const aoaDeg = Number(sample?.aoaDeg);
    return f22LoadedRollEvidencePhase(sample)
      && rollValue != null
      && Number.isFinite(rollCommand)
      && Math.abs(rollCommand) >= 0.25
      && sample?.actualG != null
      && Number.isFinite(actualG)
      && sample?.aoaDeg != null
      && Number.isFinite(aoaDeg)
      && (Math.abs(actualG) > COMBAT_RECOVERY_ROLL_MAX_G
        || Math.abs(aoaDeg) > COMBAT_RECOVERY_ROLL_MAX_AOA_DEG)
      // Opposite-sign aileron is arresting an existing body rate, not starting the loaded plane
      // change the watchdog is intended to reject. Missing rate telemetry still fails closed.
      && (!rollRateTelemetryValid
        || Math.abs(rollRateDps) < 2.5
        || rollCommand * rollRateDps >= 0)
      && sample?.autoGcasActive !== true
      && sample?.aiTerrainRecoveryPhase !== "auto-gcas";
  });
  const maximumMaterialLoadedRollCommand = Math.max(0, ...materialLoadedRollSamples
    .map((sample) => Math.abs(Number(
      sample?.aiAppliedRollCommand ?? sample?.aiRollCommand,
    )))
    .filter(Number.isFinite));
  const maximumMaterialLoadedRollG = Math.max(0, ...materialLoadedRollSamples
    .map((sample) => Math.abs(Number(sample?.actualG))).filter(Number.isFinite));
  const maximumMaterialLoadedRollAoaDeg = Math.max(0, ...materialLoadedRollSamples
    .map((sample) => Math.abs(Number(sample?.aoaDeg))).filter(Number.isFinite));
  const maximumGunneryRollAssist = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.gunneryRollAssist))).filter(Number.isFinite));
  const maximumGunneryYawAssist = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.gunneryYawAssist))).filter(Number.isFinite));
  const recoveryOwnerActive = (sample) =>
    (sample?.aiTerrainRecoveryPhase
        && sample.aiTerrainRecoveryPhase !== "idle")
      || (sample?.aiVerticalRecoveryPhase
        && sample.aiVerticalRecoveryPhase !== "idle");
  const recoveryPitchAssistSamples = (samples ?? []).map((sample, index) => ({
    sample,
    index,
    deltaG: Math.abs(Number(sample?.gunneryPitchAssistDeltaG)),
  })).filter(({ sample, deltaG }) => recoveryOwnerActive(sample)
    && Number.isFinite(deltaG)
    && deltaG > 0.05);
  // Browser diagnostics publish the newly written 20 Hz command alongside the production plant
  // state created by the preceding command. A single idle->recovery edge can therefore show the
  // new unload phase and the old assist correction together. Treat only that proven one-cycle
  // skew as aligned when the next sample remains in recovery and production explicitly reports
  // that it yielded; persisted or terminal-edge assist remains a hard failure.
  const recoveryPitchAssistTransitionSkewSamples = recoveryPitchAssistSamples.filter((entry) => {
    const previous = (samples ?? [])[entry.index - 1];
    const next = (samples ?? [])[entry.index + 1];
    const appliedPitch = Number(entry.sample?.aiAppliedPitchCommand);
    const explicitRecoveryIntent = Number.isFinite(appliedPitch)
      && (appliedPitch <= -0.05 || appliedPitch >= 0.9);
    const nextDeltaG = Math.abs(Number(next?.gunneryPitchAssistDeltaG));
    return !recoveryOwnerActive(previous)
      && explicitRecoveryIntent
      && recoveryOwnerActive(next)
      && Number.isFinite(nextDeltaG)
      && nextDeltaG <= 0.05
      && ["PILOT_UNLOAD", "PILOT_MAXIMUM_PULL"].includes(next?.gunneryAssistStatus);
  });
  const recoveryPitchAssistTransitionSkewIndexes = new Set(
    recoveryPitchAssistTransitionSkewSamples.map(({ index }) => index),
  );
  const recoveryPitchAssistViolationSamples = recoveryPitchAssistSamples.filter(({ index }) =>
    !recoveryPitchAssistTransitionSkewIndexes.has(index));
  const maximumObservedRecoveryPitchAssistDeltaG = Math.max(
    0,
    ...recoveryPitchAssistSamples.map(({ deltaG }) => deltaG),
  );
  const maximumRecoveryPitchAssistDeltaG = Math.max(
    0,
    ...recoveryPitchAssistViolationSamples.map(({ deltaG }) => deltaG),
  );
  const unsafeTerrainRecoveryPullSamples = (samples ?? []).filter((sample) =>
    sample?.aiTerrainRecoveryPhase === "pull"
      && Math.abs(Number(sample?.rollRateDps)) > 40
      && Number(sample?.aiDesiredLoadFactorG) >= 4);
  const maximumUnsafeRecoveryPullRollRateDps = Math.max(
    0,
    ...unsafeTerrainRecoveryPullSamples
      .map((sample) => Math.abs(Number(sample?.rollRateDps)))
      .filter(Number.isFinite),
  );
  const maximumUnsafeRecoveryPullG = Math.max(
    0,
    ...unsafeTerrainRecoveryPullSamples
      .map((sample) => Number(sample?.aiDesiredLoadFactorG))
      .filter(Number.isFinite),
  );
  const unsafeVerticalRecoveryPullSamples = (samples ?? []).filter((sample) =>
    sample?.aiVerticalRecoveryPhase === "slice"
      && Number(sample?.aiDesiredLoadFactorG) >= 4
      && Math.abs(Number(sample?.rollRateDps)) > 35);
  const maximumUnsafeVerticalPullRollRateDps = Math.max(
    0,
    ...unsafeVerticalRecoveryPullSamples
      .map((sample) => Math.abs(Number(sample?.rollRateDps)))
      .filter(Number.isFinite),
  );
  const maximumUnsafeVerticalPullG = Math.max(
    0,
    ...unsafeVerticalRecoveryPullSamples
      .map((sample) => Number(sample?.aiDesiredLoadFactorG))
      .filter(Number.isFinite),
  );
  const maximumSideslipDeg = Math.max(0, ...(samples ?? [])
    .map((sample) => Math.abs(Number(sample?.betaDeg))).filter(Number.isFinite));
  const maximumRollingSideslipDeg = Math.max(0, ...(samples ?? [])
    .filter((sample) => Math.abs(Number(sample?.rollRateDps)) >= 40
      && Math.abs(Number(sample?.aoaDeg)) <= 12)
    .map((sample) => Math.abs(Number(sample?.betaDeg))).filter(Number.isFinite));
  const combatPullProofSamples = (samples ?? []).filter((sample) =>
    Number(sample?.aiDesiredLoadFactorG) >= 4
      && Math.abs(Number(sample?.bankDeg)) < 90
      && sample?.pilotControlInterlocked !== true
      && sample?.autoGcasActive !== true
      && !["roll", "pull", "auto-gcas"].includes(sample?.aiTerrainRecoveryPhase)
      && !["slice", "level"].includes(sample?.aiVerticalRecoveryPhase));
  const maximumCombatRequestedPullG = Math.max(0, ...combatPullProofSamples
    .map((sample) => Number(sample?.requestedG)).filter(Number.isFinite));
  const maximumCombatAppliedPullG = Math.max(0, ...combatPullProofSamples
    .map((sample) => Number(sample?.appliedGCommand)).filter(Number.isFinite));
  const maximumCombatActualPullG = Math.max(0, ...combatPullProofSamples
    .map((sample) => Number(sample?.actualG)).filter(Number.isFinite));
  const minimumRangeM = Math.min(...(samples ?? [])
    .map((sample) => finite(sample.rangeM, Number.POSITIVE_INFINITY)));
  const missedClosePasses = missedClosePassEpisodeStats(samples);
  const maximumAltitudeM = Math.max(...(samples ?? []).map((sample) => finite(sample.yM)));
  const maximumOpponentAltitudeM = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.opponentYM, Number.NEGATIVE_INFINITY)));
  const missingJoinedOpponentAltitude = mission !== "rapier" && (samples ?? []).some((sample) =>
    finite(sample.rangeM, Number.POSITIVE_INFINITY) <= 3_500
      && sample.opponentTerminal === "FLYING"
      && !Number.isFinite(Number(sample.opponentYM)));
  const maximumRounds = Math.max(...(samples ?? []).map((sample) => finite(sample.roundsFired)));
  const maximumHits = Math.max(...(samples ?? []).map((sample) => finite(sample.hits)));
  const maximumOpponentRounds = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.opponentRoundsFired)));
  const maximumSortieOpponentRounds = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.sortieOpponentRoundsFired)));
  const maximumKillsForDefensiveSample = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.killCount)));
  const defensiveSampleValid = maximumSortieOpponentRounds > 0
    || maximumKillsForDefensiveSample > finite((samples ?? [])[0]?.killCount);
  const maximumWingmanHits = Math.max(...(samples ?? []).map((sample) =>
    (sample?.wingmen ?? []).reduce(
      (sum, wingman) => sum + finite(wingman?.hits),
      0,
    )));
  const maximumPlayerHitsTaken = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.playerHitsTaken)));
  const minimumPlayerHealth = Math.min(...(samples ?? [])
    .map((sample) => finite(sample.playerHealth, 1)));
  const minimumOpponentHealth = Math.min(...(samples ?? [])
    .map((sample) => finite(sample.opponentHealth, 1)));
  const maximumKills = Math.max(...(samples ?? []).map((sample) => finite(sample.killCount)));
  const combatTerminalSeen = (samples ?? []).some((sample) =>
    sample.opponentTerminal && sample.opponentTerminal !== "FLYING");
  const requestedControlSeen = (samples ?? []).some((sample) =>
    Math.abs(finite(sample.requestedRoll)) > 0.08
      || Math.abs(finite(sample.requestedG, 1) - 1) > 0.12);
  const maximumUnexpectedKeyboardEvents = Math.max(0, ...(samples ?? [])
    .map((sample) => finite(sample?.keyboardQuarantine?.unexpectedCount)));
  const finisherTelemetryPresent = (samples ?? []).some((sample) =>
    typeof sample?.aiGunLeadFinisherActive === "boolean");
  const finisherTelemetryCoverage = samples?.length
    ? samples.filter((sample) =>
      typeof sample?.aiGunLeadFinisherActive === "boolean").length / samples.length
    : 0;
  const gunLeadFinisherSamples = (samples ?? []).filter((sample) =>
    sample?.aiGunLeadFinisherActive === true).length;
  const gunLeadRollCaptureSamples = (samples ?? []).filter((sample) =>
    sample?.aiGunLeadRollCaptureActive === true).length;
  const gunLeadRollCaptureHandoffSamples = (samples ?? []).filter((sample) =>
    sample?.aiGunLeadRollCaptureHandoffActive === true).length;
  const terrainRecoverySamples = (samples ?? []).filter((sample) =>
    sample?.aiTerrainRecoveryPhase && sample.aiTerrainRecoveryPhase !== "idle").length;
  const combatDownhillSliceSamples = (samples ?? []).filter((sample) =>
    sample?.aiCombatDownhillSliceActive === true).length;
  const combatDefensiveBreakSamples = (samples ?? []).filter((sample) =>
    sample?.aiCombatDefensiveBreakActive === true).length;
  const radarAltitudeSamplesFt = (samples ?? [])
    .map((sample) => Number(sample?.radarAltitudeFt))
    .filter(Number.isFinite);
  const radarAltitudeTelemetryCoverage = samples?.length
    ? radarAltitudeSamplesFt.length / samples.length
    : 0;
  const minimumRadarAltitudeFt = radarAltitudeSamplesFt.length
    ? Math.min(...radarAltitudeSamplesFt)
    : null;
  const maximumAutoGcasActivations = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.autoGcasActivationCount)));
  const maximumAutoGcasOverrides = Math.max(...(samples ?? [])
    .map((sample) => finite(sample.autoGcasOverrideCount)));
  const harnessLimiterOverrideSamples = (samples ?? []).filter((sample) =>
    sample?.aiLimitOverride === true).length;
  const harnessLimiterOverrideWrites = finite(
    browserPilotDiagnostics?.limitOverrideWrites,
  );
  const autoGcasOverrideHeldSamples = (samples ?? []).filter((sample) =>
    sample?.autoGcasOverrideHeld === true).length;
  const autoGcasPilotOverrideInhibitSamples = (samples ?? []).filter((sample) =>
    sample?.autoGcasInhibitReason === "PILOT_OVERRIDE").length;
  const finisherLeadErrorsDeg = (samples ?? [])
    .filter((sample) => sample?.aiGunLeadFinisherActive === true)
    .map((sample) => Number(sample?.aiLeadOffBoresightDeg))
    .filter(Number.isFinite);
  const minimumFinisherLeadErrorDeg = finisherLeadErrorsDeg.length
    ? Math.min(...finisherLeadErrorsDeg)
    : null;
  const candidateLeadErrorsDeg = (samples ?? [])
    .filter((sample) => sample?.aiGunLeadBasisValid === true)
    .map((sample) => Number(sample?.aiLeadOffBoresightDeg))
    .filter(Number.isFinite);
  const minimumCandidateLeadErrorDeg = candidateLeadErrorsDeg.length
    ? Math.min(...candidateLeadErrorsDeg)
    : null;
  const finisherBrakeSamples = (samples ?? []).filter((sample) =>
    sample?.aiGunLeadFinisherActive === true
      && sample?.aiFinisherNeedsBrake === true).length;
  const maximumRawGunSolutionSamples = longestConsecutiveSampleRun(
    samples,
    (sample) => sample?.gunSolutionRaw === true,
  );
  const maximumQualifiedGunSolutionSamples = longestConsecutiveSampleRun(
    samples,
    (sample) => sample?.gunSolution === true,
  );
  const maximumShootableRawGunSolutionSamples = longestConsecutiveSampleRun(
    samples,
    (sample) => sample?.gunSolutionRaw === true
      && fixedWingAiGunSolutionInterlockClear(sample)
      && fixedWingAiGunClosureControlled(sample, mission),
  );
  const observedShootableQualifiedGunSolutionSamples = longestConsecutiveSampleRun(
    samples,
    (sample) => fixedWingAiGunSolutionInterlockClear(sample)
      && sample?.aiFireCommand === true
      && fixedWingAiGunFireDecision(sample, mission),
  );
  const browserMaximumGunFireEligibleSamples = (samples ?? []).reduce(
    (maximum, sample) => Math.max(
      maximum,
      finite(sample?.aiGunFireMaximumEligibleSamples),
    ),
    0,
  );
  const browserGunFireCommandUpdates = (samples ?? []).reduce(
    (maximum, sample) => Math.max(
      maximum,
      finite(sample?.aiGunFireCommandUpdates),
    ),
    0,
  );
  const maximumShootableQualifiedGunSolutionSamples = Math.max(
    observedShootableQualifiedGunSolutionSamples,
    browserMaximumGunFireEligibleSamples,
  );
  const firstQualifiedGunSolutionIndex = (samples ?? []).findIndex((sample) =>
    finite(sample?.aiGunFireCommandUpdates) > 0
      || (fixedWingAiGunSolutionInterlockClear(sample)
        && sample?.aiFireCommand === true
        && fixedWingAiGunFireDecision(sample, mission)));
  const firstQualifiedGunSolutionSample = firstQualifiedGunSolutionIndex >= 0
    ? samples[firstQualifiedGunSolutionIndex]
    : null;
  // Rounds observed on the first qualified sample were fired with that solution; they are not
  // "before" it. Grade the last authority observation preceding qualification instead.
  const preSolutionSample = firstQualifiedGunSolutionIndex > 0
    ? samples[firstQualifiedGunSolutionIndex - 1]
    : first;
  const roundsBeforeFirstQualifiedGunSolution = firstQualifiedGunSolutionSample
    ? Math.max(0, finite(preSolutionSample.roundsFired) - finite(first.roundsFired))
    : Math.max(0, maximumRounds - finite(first.roundsFired));
  const firstRunGunHandoff = mission === "first-run"
    ? firstRunGunHandoffEvidence(samples)
    : null;
  const firstRunValleyClearance = mission === "first-run"
    ? firstRunValleyClearanceEvidence(samples)
    : null;
  const rapierAttack = mission === "rapier"
    ? rapierAttackEvidence(samples)
    : null;
  const rapierSortie = mission === "rapier"
    ? rapierSortieEvidence(samples)
    : null;
  const topGunSortie = mission === "top-gun"
    ? topGunSortieEvidence(samples)
    : null;

  if (!samples?.length) failures.push("no live flight samples");
  if (readyMs > maximumReadyMs) failures.push(`Ready took ${readyMs} ms`);
  if (startLatencyMs > maximumStartMs) failures.push(`flight start took ${startLatencyMs} ms`);
  if (first.missionId !== FIXED_WING_AI_MISSIONS[mission]?.missionId) {
    failures.push(`wrong mission authority: ${first.missionId ?? "missing"}`);
  }
  if (!samples?.every((sample) => sample.visibilityState === "visible")) {
    failures.push("flight page became hidden");
  }
  if (!samples?.every((sample) => sample.gamepadConnected === true)) {
    failures.push("synthetic standard gamepad left the production input path");
  }
  if (maximumUnexpectedKeyboardEvents > 0) {
    failures.push(
      `keyboard quarantine blocked ${maximumUnexpectedKeyboardEvents} unexpected events`,
    );
  }
  if (["f22", "first-run"].includes(mission)
      && (harnessLimiterOverrideSamples > 0
        || harnessLimiterOverrideWrites > 0
        || autoGcasOverrideHeldSamples > 0)) {
    failures.push(
      `AI harness used the limiter/Auto-GCAS paddle `
        + `(${harnessLimiterOverrideWrites} writes, `
        + `${harnessLimiterOverrideSamples} AI samples, `
        + `${autoGcasOverrideHeldSamples} authority samples)`
        + (autoGcasPilotOverrideInhibitSamples > 0
          ? ` (${autoGcasPilotOverrideInhibitSamples} PILOT_OVERRIDE inhibits)` : ""),
    );
  }
  if (["f22", "first-run"].includes(mission)
      && autoGcasPilotOverrideInhibitSamples > 0) {
    failures.push(
      `Auto-GCAS reported PILOT_OVERRIDE for `
        + `${autoGcasPilotOverrideInhibitSamples} samples`,
    );
  }
  if (["f22", "first-run"].includes(mission) && maximumAutoGcasOverrides > 0) {
    failures.push(`Auto-GCAS override counter reached ${maximumAutoGcasOverrides}`);
  }
  if (maximumRequestedRudder > 0.001) {
    failures.push(`AI pilot requested ${maximumRequestedRudder.toFixed(3)} rudder`);
  }
  if (["f22", "first-run"].includes(mission) && maximumAppliedRudder > 0.001) {
    failures.push(`F-22 control path applied ${maximumAppliedRudder.toFixed(3)} rudder`);
  }
  if (["f22", "first-run"].includes(mission) && maximumGunneryRollAssist > 0.001) {
    failures.push(
      `F-22 gun director added ${maximumGunneryRollAssist.toFixed(3)} roll`,
    );
  }
  if (["f22", "first-run"].includes(mission) && maximumGunneryYawAssist > 0.001) {
    failures.push(
      `F-22 gun director added ${maximumGunneryYawAssist.toFixed(3)} rudder`,
    );
  }
  // Requested/applied rudder can both be zero while the F-22 ARI silently allocates most of the
  // rudder from lateral stick at high alpha. Tape 423 reached 0.787 and looked like top-rudder
  // recovery even though the old input-only gate stayed green. Combat harness flights are not
  // intentional post-stall demonstrations: fail the visible model output and the resulting skid.
  if (["f22", "first-run"].includes(mission) && (samples?.length ?? 0) >= 100
      && Math.max(maximumF22AriRudder, maximumEffectiveRudderCommand) > 0.01) {
    failures.push(
      `F-22 ARI generated ${Math.max(
        maximumF22AriRudder,
        maximumEffectiveRudderCommand,
      ).toFixed(3)} effective rudder`,
    );
  }
  if (["f22", "first-run"].includes(mission) && (samples?.length ?? 0) >= 100
      && maximumSideslipDeg > 12) {
    failures.push(`F-22 sideslip reached ${maximumSideslipDeg.toFixed(1)} deg`);
  }
  if (["f22", "first-run"].includes(mission) && (samples?.length ?? 0) >= 100
      && maximumRollingSideslipDeg > 5) {
    failures.push(
      `F-22 rolling sideslip reached ${maximumRollingSideslipDeg.toFixed(1)} deg`,
    );
  }
  // Input-only rudder checks missed the actual visual defect in tapes 448-450: a large aileron
  // command while the jet still carried 5-8 G and high alpha. Depending on the exact alpha this
  // appears either as ARI rudder or as a violent sideslip with ARI at zero. Make that unsafe
  // sequencing itself an acceptance failure so a successful kill cannot hide an ugly sortie.
  if (["f22", "first-run"].includes(mission) && materialLoadedRollSamples.length > 0) {
    failures.push(
      `F-22 applied ${maximumMaterialLoadedRollCommand.toFixed(3)} accelerating roll while loaded `
        + `(${maximumMaterialLoadedRollG.toFixed(2)} G / `
        + `${maximumMaterialLoadedRollAoaDeg.toFixed(1)} deg alpha)`,
    );
  }
  if (["f22", "first-run"].includes(mission)
      && materialRollMissingLoadTelemetrySamples.length > 0) {
    failures.push(
      `F-22 made ${materialRollMissingLoadTelemetrySamples.length} material roll commands `
        + `without current G/alpha telemetry`,
    );
  }
  if (!requestedControlSeen) failures.push("production authority never received AI stick input");
  if (authorityRateHz < 90) failures.push(`authority rate was ${authorityRateHz.toFixed(1)} Hz`);
  // A fast crash is exactly when cadence evidence matters most. Tape 380 ended after 67 samples,
  // so the old 100-sample guard hid a 2.1 Hz controller and reported only the downstream impact.
  if ((samples?.length ?? 0) >= 20 && controlRateHz < 17) {
    failures.push(`AI control cadence was ${controlRateHz.toFixed(1)} Hz`);
  }
  if ((samples?.length ?? 0) >= 20 && p95ControlIntervalMs > 90) {
    failures.push(`AI control interval p95 was ${p95ControlIntervalMs.toFixed(0)} ms`);
  }
  if (browserPilotDiagnostics?.lastError) {
    failures.push(`browser-resident pilot failed: ${browserPilotDiagnostics.lastError}`);
  }
  if (maximumStallS > 0.7) failures.push(`authority stalled for ${maximumStallS.toFixed(2)} s`);
  if (samples?.length && rollRateTelemetryCoverage < 0.98) {
    failures.push(
      `roll-rate telemetry covered only ${(rollRateTelemetryCoverage * 100).toFixed(0)}% of flight`,
    );
  }
  if (["f22", "first-run"].includes(mission) && samples?.length
      && aoaTelemetryCoverage < 0.98) {
    failures.push(
      `angle-of-attack telemetry covered only ${(aoaTelemetryCoverage * 100).toFixed(0)}% of flight`,
    );
  }
  const requireCombatPullProof = ["f22", "top-gun"].includes(mission)
    && (samples?.length ?? 0) >= 100
    && desiredLoadFactorValues.length > 0;
  if (requireCombatPullProof) {
    const maximumLoadCoverage = maximumLoadFactorValues.length / samples.length;
    const requestedLoadCoverage = requestedLoadFactorValues.length / samples.length;
    const appliedLoadCoverage = appliedLoadFactorValues.length / samples.length;
    const actualLoadCoverage = actualLoadFactorValues.length / samples.length;
    if (Math.min(
      maximumLoadCoverage,
      requestedLoadCoverage,
      appliedLoadCoverage,
      actualLoadCoverage,
    ) < 0.98) {
      failures.push(
        `combat load-factor telemetry covered only `
        + `${(maximumLoadCoverage * 100).toFixed(0)}% max / `
        + `${(requestedLoadCoverage * 100).toFixed(0)}% requested / `
        + `${(appliedLoadCoverage * 100).toFixed(0)}% applied / `
        + `${(actualLoadCoverage * 100).toFixed(0)}% actual`,
      );
    }
    if (combatPullProofSamples.length < 4) {
      failures.push("combat pilot never commanded a sustained 4-G turn");
    } else if (maximumCombatRequestedPullG < 3.5
        || maximumCombatAppliedPullG < 3.2
        || maximumCombatActualPullG < 3.0) {
      failures.push(
        `combat pull reached only ${maximumCombatRequestedPullG.toFixed(2)} G requested / `
        + `${maximumCombatAppliedPullG.toFixed(2)} G applied / `
        + `${maximumCombatActualPullG.toFixed(2)} G actual`,
      );
    }
  }
  if (mission === "f22" && (samples?.length ?? 0) >= 100
      && radarAltitudeTelemetryCoverage < 0.98) {
    failures.push(
      `radar-altitude telemetry covered only `
      + `${(radarAltitudeTelemetryCoverage * 100).toFixed(0)}% of flight`,
    );
  }
  if (rollChatter.maximumReversalRateHz >= 0.9
      || rollChatter.maximumBurstReversalRateHz >= 2.5) {
    failures.push(
      `AI roll control chattered at ${rollChatter.maximumReversalRateHz.toFixed(1)} reversals/s `
      + `(${rollChatter.maximumBurstReversalRateHz.toFixed(1)} burst)`,
    );
  }
  if (physicalRollRocking.violatingWindows > 0) {
    failures.push(
      `AI physically rocked ${physicalRollRocking.maximumRockingBankPeakToPeakDeg.toFixed(1)} deg `
      + `with ${physicalRollRocking.maximumReversals} roll-rate reversals`,
    );
  }
  if (mission === "f22" && (samples?.length ?? 0) >= 100
      && unloadedRollEpisodes.qualifyingEpisodes > 0) {
    failures.push(
      `F-22 rolled ${unloadedRollEpisodes.maximumIntegratedRollDeg.toFixed(0)} deg continuously `
      + `while unloaded over ${unloadedRollEpisodes.maximumEpisodeDurationS.toFixed(1)} s`,
    );
  }
  if (mission === "f22" && (samples?.length ?? 0) >= 100
      && settledLoadedOverbank.longestS > F22_MAX_SETTLED_LOADED_OVERBANK_S) {
    failures.push(
      `F-22 held a settled `
      + `${settledLoadedOverbank.longestEpisode.maximumAbsBankDeg.toFixed(0)} deg `
      + `loaded overbank for ${settledLoadedOverbank.longestS.toFixed(1)} s`,
    );
  }
  if (mission === "f22" && (samples?.length ?? 0) >= 100
      && sustainedLoadedWallTurn.longestS > F22_MAX_SUSTAINED_LOADED_WALL_TURN_S) {
    failures.push(
      `F-22 held a settled `
      + `${sustainedLoadedWallTurn.longestEpisode.maximumAbsBankDeg.toFixed(0)} deg `
      + `loaded wall turn for ${sustainedLoadedWallTurn.longestS.toFixed(1)} s`,
    );
  }
  if ((samples?.length ?? 0) >= 100
      && (rollInputFidelity.coverage < 0.98 || rollInputFidelity.p95AbsoluteError > 0.035)) {
    failures.push(
      `gamepad roll fidelity was ${(rollInputFidelity.coverage * 100).toFixed(0)}% coverage / `
      + `${rollInputFidelity.p95AbsoluteError.toFixed(3)} p95 error`,
    );
  }
  if (last.playerTerminal !== "FLYING") failures.push(`ownship ended ${last.playerTerminal}`);
  if (maximumRunawayChaseS >= 15) {
    failures.push(`bandit forced a ${maximumRunawayChaseS.toFixed(1)} s opening stern chase`);
  }
  if (mission === "f22" && (samples?.length ?? 0) >= 100) {
    if (targetVerticalExcursion.coverage < 0.8) {
      failures.push(
        `bandit flight-path evidence covered only `
          + `${(targetVerticalExcursion.coverage * 100).toFixed(0)}% of flight`,
      );
    } else if (targetVerticalExcursion.maximumAbsGammaDeg >= 65
        || targetVerticalExcursion.cumulativeSteepS >= 2
        || targetVerticalExcursion.longestSteepS >= 1) {
      failures.push(
        `bandit vertical loop reached ${targetVerticalExcursion.maximumAbsGammaDeg.toFixed(1)} deg / `
          + `${targetVerticalExcursion.cumulativeSteepS.toFixed(1)} s beyond 60 deg `
          + `(${targetVerticalExcursion.longestSteepS.toFixed(1)} s continuous)`,
      );
    }
    if (ownshipVerticalExcursion.maximumAbsGammaDeg >= 80
        || ownshipVerticalExcursion.cumulativeSteepS >= 4
        || ownshipVerticalExcursion.longestSteepS >= 4) {
      failures.push(
        `AI ownship vertical dive reached `
          + `${ownshipVerticalExcursion.maximumAbsGammaDeg.toFixed(1)} deg / `
          + `${ownshipVerticalExcursion.cumulativeSteepS.toFixed(1)} s beyond 60 deg `
          + `(${ownshipVerticalExcursion.longestSteepS.toFixed(1)} s continuous)`,
      );
    }
    if (maximumRecoveryPitchAssistDeltaG > 0.05) {
      failures.push(
        `gun assist added ${maximumRecoveryPitchAssistDeltaG.toFixed(2)} G during recovery`,
      );
    }
    if (unsafeTerrainRecoveryPullSamples.length > 0) {
      failures.push(
        `terrain recovery pulled ${maximumUnsafeRecoveryPullG.toFixed(2)} G at `
          + `${maximumUnsafeRecoveryPullRollRateDps.toFixed(0)} deg/s roll`,
      );
    }
    if (unsafeVerticalRecoveryPullSamples.length > 0) {
      failures.push(
        `vertical recovery pulled ${maximumUnsafeVerticalPullG.toFixed(2)} G at `
          + `${maximumUnsafeVerticalPullRollRateDps.toFixed(0)} deg/s roll`,
      );
    }
  }
  const opponentAltitudeCeilingM = mission === "first-run" ? 3_800
    : mission === "rapier" ? Number.POSITIVE_INFINITY : 6_200;
  if (missingJoinedOpponentAltitude) {
    failures.push("live opponent altitude telemetry disappeared after the join");
  }
  if (maximumOpponentAltitudeM > opponentAltitudeCeilingM) {
    failures.push(`bandit climbed out of the fight to ${maximumOpponentAltitudeM.toFixed(0)} m`);
  }
  const ownshipAltitudeCeilingM = mission === "f22" || mission === "top-gun"
    ? 7_500 : Number.POSITIVE_INFINITY;
  if (maximumAltitudeM > ownshipAltitudeCeilingM) {
    failures.push(`AI ownship climbed out of the fight to ${maximumAltitudeM.toFixed(0)} m`);
  }
  const requireFinisherAcceptance = mission === "f22"
    || (mission === "first-run" && firstRunGunHandoff?.successorSeen === true);
  if (requireFinisherAcceptance) {
    if (!finisherTelemetryPresent || finisherTelemetryCoverage < 0.999) {
      failures.push(
        `gun-finisher telemetry covered `
          + `${(finisherTelemetryCoverage * 100).toFixed(0)}% of flight`,
      );
    }
    if (gunLeadFinisherSamples < 1) {
      failures.push("3-D gun lead finisher never engaged");
    }
    if (maximumShootableQualifiedGunSolutionSamples < 2) {
      failures.push("AI held no shootable two-sample qualified gun solution");
    }
    if (roundsBeforeFirstQualifiedGunSolution > 0) {
      failures.push(
        `AI fired ${roundsBeforeFirstQualifiedGunSolution} rounds before its first qualified solution`,
      );
    }
    if (mission === "f22" && missedClosePasses.unconvertedClosePasses >= 3) {
      const closestRangeM = typeof missedClosePasses.closestUnconvertedRangeM === "number"
          && Number.isFinite(missedClosePasses.closestUnconvertedRangeM)
        ? missedClosePasses.closestUnconvertedRangeM : Number.POSITIVE_INFINITY;
      const bestLeadDeg = typeof missedClosePasses.bestUnconvertedLeadErrorDeg === "number"
          && Number.isFinite(missedClosePasses.bestUnconvertedLeadErrorDeg)
        ? missedClosePasses.bestUnconvertedLeadErrorDeg : Number.POSITIVE_INFINITY;
      failures.push(
        `${missedClosePasses.unconvertedClosePasses} unconverted close passes under 500 m `
          + `(closest ${Number.isFinite(closestRangeM) ? closestRangeM.toFixed(0) : "unknown"} m; `
          + `best lead ${Number.isFinite(bestLeadDeg) ? bestLeadDeg.toFixed(1) : "unknown"} deg)`,
      );
    }
  }

  // A sortie the opponent never contested cannot certify defensive behaviour. Tapes 495 and 498
  // both ran the full 180 s "untouched" with `sortieOpponentRoundsFired` at zero — 495 before the
  // defensive-power repair and 498 after it — so survival there measured whether the Ace engaged,
  // not whether ownship defended. Killing the Ace before it shoots is still a real result.
  if (mission === "f22" && !defensiveSampleValid) {
    failures.push(
      "opponent never fired and was never killed: uncontested sortie, "
        + "survival is not a defensive result",
    );
  }

  if (mission === "first-run") {
    const coldSamples = (samples ?? []).filter((sample) => sample?.weaponsCold === true);
    let harnessRockerSeen = false;
    let neutralThrottleDivergence = null;
    for (const sample of samples ?? []) {
      if (sample?.weaponsCold === true && !harnessRockerSeen) {
        const requestedDivergence = stagedRequestedThrottle != null
            && Number.isFinite(Number(stagedRequestedThrottle))
          ? Math.abs(finite(sample?.requestedThrottle) - Number(stagedRequestedThrottle))
          : 0;
        const appliedDivergence = stagedAppliedThrottle != null
            && Number.isFinite(Number(stagedAppliedThrottle))
          ? Math.abs(finite(sample?.appliedThrottle) - Number(stagedAppliedThrottle))
          : 0;
        if (Math.max(requestedDivergence, appliedDivergence) > 0.03) {
          neutralThrottleDivergence = Math.max(requestedDivergence, appliedDivergence);
          break;
        }
      }
      harnessRockerSeen ||= sample?.aiThrottleUp === true || sample?.aiThrottleDown === true;
    }
    if (!(samples ?? []).some((sample) => sample.weaponsCold === true)) {
      failures.push("valley weapons-cold interlock was not observed");
    }
    if (!(samples ?? []).some((sample) => sample.weaponsCold === false)) {
      failures.push("AI never reached the valley pop-out");
    }
    if (!(samples ?? []).some((sample) => sample.aim9Remaining < first.aim9Remaining)) {
      failures.push("AI reached pop-out but never launched through the real Fire input");
    }
    if (Math.min(...(samples ?? []).map((sample) => finite(
      sample.aim9Remaining, Number.POSITIVE_INFINITY,
    ))) > finite(first.aim9Remaining) - 2) {
      failures.push("AI did not prosecute both aircraft in the opening pair");
    }
    if (maximumKills < finite(first.killCount) + 2) {
      failures.push(`opening pair was not defeated (${maximumKills} splashes)`);
    }
    if (!firstRunGunHandoff.successorSeen) {
      failures.push("no live gun-phase successor appeared after the opening pair");
    } else if (!firstRunGunHandoff.gunRoundsFired) {
      failures.push("Fire never changed from empty heaters to the gun trigger");
    } else if (!firstRunGunHandoff.gunHitSeen) {
      failures.push("post-heater guns produced no hit on the successor");
    }
    if (travelledM < FIRST_RUN_AI_MINIMUM_ROUTE_DISTANCE_M) {
      failures.push(`valley flight covered only ${travelledM.toFixed(0)} m`);
    }
    if (coldSamples.some((sample) => sample?.assistedFlight === true)) {
      failures.push("assisted flight engaged during the weapons-cold valley");
    }
    if (coldSamples.some((sample) => sample?.playerReturnToBaseActive === true
        || sample?.returnToBaseSteer === true
        || !["", "NONE"].includes(String(sample?.returnToBaseReason ?? "").toUpperCase()))) {
      failures.push("return-to-base guidance intruded during the weapons-cold valley");
    }
    if (neutralThrottleDivergence !== null) {
      failures.push(
        `cold throttle diverged ${neutralThrottleDivergence.toFixed(2)} before any AI rocker input`,
      );
    }
    // A short crash still needs route-quality evidence. Twenty cold samples reject isolated
    // startup values but catch the 67-sample canyon impact that the old 100-sample guard hid.
    if (firstRunValleyClearance.coldSamples >= 20) {
      if (firstRunValleyClearance.profileCoverage < 0.98) {
        failures.push(
          `published valley profile covered only `
          + `${(firstRunValleyClearance.profileCoverage * 100).toFixed(0)}% of cold flight`,
        );
      }
      if (firstRunValleyClearance.terrainCoverage < 0.98) {
        failures.push(
          `terrain authority covered only `
          + `${(firstRunValleyClearance.terrainCoverage * 100).toFixed(0)}% of cold flight`,
        );
      }
      if (firstRunValleyClearance.radarAltitudeCoverage < 0.98) {
        failures.push(
          `radar altitude covered only `
          + `${(firstRunValleyClearance.radarAltitudeCoverage * 100).toFixed(0)}% of cold flight`,
        );
      }
      if (firstRunValleyClearance.calibratedSpeedCoverage < 0.98) {
        failures.push(
          `authority published valley KCAS for only `
          + `${(firstRunValleyClearance.calibratedSpeedCoverage * 100).toFixed(0)}% of cold flight`,
        );
      }
      if (firstRunValleyClearance.gMaxPerformCoverage < 0.98
          || firstRunValleyClearance.appliedLoadFactorCoverage < 0.98
          || firstRunValleyClearance.actualLoadFactorCoverage < 0.98) {
        failures.push(
          `load-factor telemetry covered only `
          + `${(firstRunValleyClearance.gMaxPerformCoverage * 100).toFixed(0)}% max / `
          + `${(firstRunValleyClearance.appliedLoadFactorCoverage * 100).toFixed(0)}% applied / `
          + `${(firstRunValleyClearance.actualLoadFactorCoverage * 100).toFixed(0)}% actual`,
        );
      }
      if (firstRunValleyClearance.loadTurnExpectedSamples >= 10) {
        if (firstRunValleyClearance.pullProofSamples < 4) {
          failures.push("AI banked through the valley without commanding coordinated G");
        }
        if (finite(firstRunValleyClearance.maximumRequestedPullG) < 1.30
            || finite(firstRunValleyClearance.maximumAppliedPullG) < 1.25
            || finite(firstRunValleyClearance.maximumActualPullG) < 1.20) {
          failures.push(
            `valley pull reached only `
            + `${finite(firstRunValleyClearance.maximumRequestedPullG).toFixed(2)} G requested / `
            + `${finite(firstRunValleyClearance.maximumAppliedPullG).toFixed(2)} G applied / `
            + `${finite(firstRunValleyClearance.maximumActualPullG).toFixed(2)} G actual`,
          );
        }
      }
      if (firstRunValleyClearance.belowGroundSamples > 0) {
        failures.push(
          `authority reported ${firstRunValleyClearance.belowGroundSamples} below-ground samples`,
        );
      }
      if (firstRunValleyClearance.p05FloorMarginM !== null
          && firstRunValleyClearance.p05FloorMarginM < 80) {
        failures.push(
          `valley floor margin p05 was `
          + `${firstRunValleyClearance.p05FloorMarginM.toFixed(0)} m`,
        );
      }
      if (firstRunValleyClearance.medianCalibratedSpeedKts !== null
          && (firstRunValleyClearance.medianCalibratedSpeedKts < 400
            || firstRunValleyClearance.medianCalibratedSpeedKts > 440)) {
        failures.push(
          `valley median speed was `
          + `${firstRunValleyClearance.medianCalibratedSpeedKts.toFixed(0)} KCAS`,
        );
      }
      if (firstRunValleyClearance.p95CalibratedSpeedKts !== null
          && firstRunValleyClearance.p95CalibratedSpeedKts > 465) {
        failures.push(
          `valley speed p95 ran away to `
          + `${firstRunValleyClearance.p95CalibratedSpeedKts.toFixed(0)} KCAS`,
        );
      }
    }
  } else if (mission === "rapier") {
    if (!rapierSortie.phases.pass) {
      failures.push(`Rapier phases stopped at ${rapierSortie.phases.visited.join(" -> ")}`);
    }
    if (!rapierSortie.recoveryRoutePass) {
      failures.push("Rapier ReturnToBase appeared after Recovery or recovery never followed Attack");
    }
    if (!(samples ?? []).some((sample) => sample.rapierAutomationEnabled === true)) {
      failures.push("real P mission-demo input never engaged Rapier automation");
    }
    if (rapierSortie.attack.initialCarriersRemaining !== 3) {
      failures.push(
        `Rapier carrier baseline was `
          + `${rapierSortie.attack.initialCarriersRemaining ?? "missing"}, expected 3`,
      );
    }
    if (!rapierSortie.carrierProgressionPass) {
      failures.push(
        `Rapier carrier progression was `
          + `${rapierSortie.carrierProgression.join(" -> ") || "missing"}, expected 3 -> 2 -> 1 -> 0`,
      );
    }
    for (const transition of rapierSortie.transitions) {
      const label = `${transition.fromCarriers} -> ${transition.toCarriers}`;
      if (!transition.exactCarrierDecrement) {
        failures.push(`Rapier missed the ${label} carrier promotion`);
        continue;
      }
      if (!transition.attackPhaseSeen) {
        failures.push(`Rapier ${label} carrier kill happened outside Attack`);
      }
      if (!transition.reactionFuseLive) {
        failures.push(`Rapier ${label} carrier kill lacked a live reaction fuse`);
      }
      if (!transition.counterTelemetryPresent) {
        failures.push(`Rapier ${label} carrier kill lacked cumulative sortie weapon telemetry`);
      } else if (transition.roundsFiredDelta < 1) {
        failures.push(`Rapier ${label} carrier kill fired no fresh player rounds`);
      } else if (transition.hitsDelta < 1) {
        failures.push(`Rapier ${label} carrier kill produced no fresh player hit`);
      }
    }
    if (rapierSortie.payloadDeploymentIndex >= 0
        && !rapierSortie.galleryClearedBeforePayload) {
      failures.push("Rapier payload deployed before all three carriers were destroyed");
    }
    if (!rapierSortie.playerRtbActiveSeen) {
      failures.push("Rapier never published active player RTB after clearing the gallery");
    }
    if (!rapierSortie.recoveryGatesPass) {
      failures.push(
        `Rapier recovery gates were `
          + `${rapierSortie.recoveryGates.join(" -> ") || "missing"}, expected final 1 -> 2 -> 3 -> 4`,
      );
    }
    if (!rapierSortie.terminal.sessionFinished) {
      failures.push("Rapier recovery never reached FINISHED authority");
    }
    if (!rapierSortie.terminal.recoveryPhase) {
      failures.push("Rapier terminal authority did not retain the recovery phase");
    }
    if (!rapierSortie.terminal.victory) {
      failures.push("Rapier terminal sortie outcome was not VICTORY");
    }
    if (!rapierSortie.terminal.playerFlying) {
      failures.push("Rapier terminal recovery did not retain a flying ownship state");
    }
    if (!rapierSortie.terminal.threeKills) {
      failures.push("Rapier terminal authority did not retain three player kills");
    }
    if (!rapierSortie.terminal.carriersCleared) {
      failures.push("Rapier terminal authority did not retain zero carriers");
    }
    if (!rapierSortie.terminal.payloadSafe) {
      failures.push("Rapier terminal authority reported payload deployment");
    }
    if (!rapierSortie.terminal.arrestedTrap) {
      failures.push("Rapier terminal recovery was not a stopped, wire-engaged trap");
    }
    if (!rapierSortie.terminal.sortieFinishedEventSeen) {
      failures.push("Rapier terminal authority published no VICTORY SortieFinished event");
    }
    if (maximumAltitudeM < 600) failures.push(`Rapier climbed only to ${maximumAltitudeM.toFixed(0)} m`);
    if (travelledM < 1_500) failures.push(`Rapier covered only ${travelledM.toFixed(0)} m`);
  } else if (mission === "top-gun") {
    if (!topGunSortie.exactTwoKillProgression) {
      failures.push(
        `Top Gun kill progression was ${topGunSortie.killProgression.join(" -> ") || "missing"}, `
          + `expected ${topGunSortie.openingKills} -> ${topGunSortie.openingKills + 1} -> `
          + `${topGunSortie.openingKills + 2}`,
      );
    }
    for (const transition of topGunSortie.transitions) {
      if (transition.killIndex < 0) {
        failures.push(`Top Gun splash ${transition.ordinal} never reached authority`);
      } else if (transition.destroyedEventSequence === null) {
        failures.push(`Top Gun splash ${transition.ordinal} had no fresh player DESTROYED event`);
      } else if (transition.hitsDelta < 1 && transition.missilesDelta < 1) {
        failures.push(`Top Gun splash ${transition.ordinal} had no fresh gun hit or AIM-9 launch`);
      }
    }
    if (!topGunSortie.replacementTargetsDistinct) {
      failures.push("Top Gun splashes did not destroy two distinct replacement aircraft");
    }
    if (topGunSortie.rtbRequestIssuedIndex < topGunSortie.secondKillIndex
        || topGunSortie.rtbRequestIssuedIndex >= topGunSortie.rtbIndex) {
      failures.push("Top Gun harness never issued a physical O request before RTB authority");
    }
    if (topGunSortie.rtbIndex <= topGunSortie.secondKillIndex) {
      failures.push("Top Gun never entered RTB after its second splash");
    }
    if (!topGunSortie.pilotRtbReasonSeen) {
      failures.push("Top Gun RTB did not retain the real O/KNOCK-IT-OFF reason");
    }
    if (!topGunSortie.combatHandoffRtbSeen) {
      failures.push("Top Gun combat handoff never reached PLAYER_RTB authority");
    }
    if (!topGunSortie.approachGatesPass) {
      failures.push(
        `Top Gun approach ladder was `
          + `${topGunSortie.finalApproachGateCounts.join(" -> ") || "missing"}, `
          + "expected 8 -> 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1",
      );
    }
    if (!topGunSortie.approachGateGeometryPass) {
      failures.push("Top Gun final approach ladder lacked live authoritative gate geometry");
    }
    if (topGunSortie.approachControlSamples < 20) {
      failures.push("Top Gun pilot never controlled the live carrier approach long enough");
    }
    if (!topGunSortie.finalApproachSeen) {
      failures.push("Top Gun pilot never converted the WIRES gate into the physical deck final");
    }
    if (!topGunSortie.cleanConfigurationSeen) {
      failures.push("Top Gun never proved a clean combat configuration before RTB");
    }
    if (!topGunSortie.recoveryConfigurationSeen) {
      failures.push("Top Gun never physically locked gear and flaps for recovery");
    }
    if (!topGunSortie.automaticConfigurationSeen) {
      failures.push("Top Gun recovery did not use the production automatic configuration path");
    }
    if (!topGunSortie.configurationLimitsRespected) {
      failures.push("Top Gun recovery exceeded a gear/flap limit or developed flap split");
    }
    if (!topGunSortie.terminal.sessionFinished) {
      failures.push("Top Gun recovery never reached FINISHED authority");
    }
    if (!topGunSortie.terminal.victory) {
      failures.push("Top Gun terminal sortie outcome was not VICTORY");
    }
    if (!topGunSortie.terminal.playerFlying) {
      failures.push("Top Gun terminal recovery did not retain a flying ownship state");
    }
    if (!topGunSortie.terminal.twoKills) {
      failures.push("Top Gun terminal authority did not retain two player splashes");
    }
    if (!topGunSortie.terminal.recoveredHandoff) {
      failures.push("Top Gun trap did not complete the combat-handoff lifecycle");
    }
    if (!topGunSortie.terminal.arrestedTrap) {
      failures.push("Top Gun terminal recovery was not a stopped, wire-engaged trap");
    }
    if (!topGunSortie.terminal.sortieFinishedEventSeen) {
      failures.push("Top Gun terminal authority published no VICTORY SortieFinished event");
    }
  } else {
    if (minimumRangeM > 2_500) failures.push(`AI never joined the fight (${minimumRangeM.toFixed(0)} m)`);
    if (maximumRounds < 1 && !(samples ?? []).some((sample) => sample.aim9Launched)) {
      failures.push("AI never fired a production weapon");
    }
    if (maximumHits < 1 && minimumOpponentHealth >= 1
      && !combatTerminalSeen) {
      failures.push("AI produced no damaging combat evidence");
    }
    if (maximumKills <= finite(first.killCount) && !combatTerminalSeen) {
      failures.push("AI never completed the fight");
    }
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      mission,
      readyMs,
      startLatencyMs,
      durationS,
      authorityRateHz,
      controlRateHz,
      p95ControlIntervalMs,
      evidenceSampleRateHz,
      p95EvidenceSampleIntervalMs,
      p95AuthorityReadLatencyMs,
      p95GamepadWriteLatencyMs,
      maximumUnexpectedKeyboardEvents,
      maximumAuthorityStallS: maximumStallS,
      rollRateTelemetryCoverage,
      loadFactorTelemetryCoverage: samples?.length
        ? actualLoadFactorValues.length / samples.length
        : 0,
      aoaTelemetryCoverage,
      maximumLoadFactorTelemetryCoverage: samples?.length
        ? maximumLoadFactorValues.length / samples.length
        : 0,
      maximumDesiredLoadFactorG,
      maximumRequestedLoadFactorG,
      maximumAppliedLoadFactorG,
      maximumActualLoadFactorG,
      maximumSortiePeakLoadFactorG,
      maximumRequestedRudder,
      maximumAppliedRudder,
      maximumF22AriRudder,
      maximumEffectiveRudderCommand,
      maximumStabilityYawRateDps,
      materialRollMissingLoadTelemetrySamples:
        materialRollMissingLoadTelemetrySamples.length,
      materialLoadedRollSamples: materialLoadedRollSamples.length,
      maximumMaterialLoadedRollCommand,
      maximumMaterialLoadedRollG,
      maximumMaterialLoadedRollAoaDeg,
      maximumGunneryRollAssist,
      maximumGunneryYawAssist,
      maximumObservedRecoveryPitchAssistDeltaG,
      maximumRecoveryPitchAssistDeltaG,
      recoveryPitchAssistTransitionSkewSamples:
        recoveryPitchAssistTransitionSkewSamples.length,
      unsafeTerrainRecoveryPullSamples: unsafeTerrainRecoveryPullSamples.length,
      maximumUnsafeRecoveryPullRollRateDps,
      maximumUnsafeRecoveryPullG,
      unsafeVerticalRecoveryPullSamples: unsafeVerticalRecoveryPullSamples.length,
      maximumUnsafeVerticalPullRollRateDps,
      maximumUnsafeVerticalPullG,
      maximumSideslipDeg,
      maximumRollingSideslipDeg,
      combatPullProofSamples: combatPullProofSamples.length,
      maximumCombatRequestedPullG,
      maximumCombatAppliedPullG,
      maximumCombatActualPullG,
      rollCommandReversals: rollChatter.reversals,
      maximumRollCommandReversalRateHz: rollChatter.maximumReversalRateHz,
      maximumBurstRollCommandReversalRateHz: rollChatter.maximumBurstReversalRateHz,
      unloadedRollEpisodes,
      settledLoadedOverbank,
      sustainedLoadedWallTurn,
      maximumStableBankRollRateReversals: physicalRollRocking.maximumReversals,
      maximumRockingBankPeakToPeakDeg:
        physicalRollRocking.maximumRockingBankPeakToPeakDeg,
      rollInputFidelityCoverage: rollInputFidelity.coverage,
      rollInputFidelityP95Error: rollInputFidelity.p95AbsoluteError,
      rollInputFidelityRmsError: rollInputFidelity.rmsError,
      maximumRunawayChaseS,
      targetVerticalExcursion,
      ownshipVerticalExcursion,
      finisherTelemetryCoverage,
      gunLeadFinisherSamples,
      gunLeadRollCaptureSamples,
      gunLeadRollCaptureHandoffSamples,
      terrainRecoverySamples,
      combatDownhillSliceSamples,
      combatDefensiveBreakSamples,
      radarAltitudeTelemetryCoverage,
      minimumRadarAltitudeFt,
      autoGcasActivationCount: maximumAutoGcasActivations,
      autoGcasOverrideCount: maximumAutoGcasOverrides,
      harnessLimiterOverrideSamples,
      harnessLimiterOverrideWrites,
      autoGcasOverrideHeldSamples,
      autoGcasPilotOverrideInhibitSamples,
      finisherBrakeSamples,
      minimumFinisherLeadErrorDeg,
      minimumCandidateLeadErrorDeg,
      maximumRawGunSolutionSamples,
      maximumQualifiedGunSolutionSamples,
      maximumShootableRawGunSolutionSamples,
      maximumShootableQualifiedGunSolutionSamples,
      observedShootableQualifiedGunSolutionSamples,
      browserMaximumGunFireEligibleSamples,
      browserGunFireCommandUpdates,
      roundsBeforeFirstQualifiedGunSolution,
      missedClosePasses,
      travelledM,
      minimumRangeM: Number.isFinite(minimumRangeM) ? minimumRangeM : null,
      maximumAltitudeM,
      maximumOpponentAltitudeM: Number.isFinite(maximumOpponentAltitudeM)
        ? maximumOpponentAltitudeM : null,
      roundsFired: maximumRounds,
      hits: maximumHits,
      opponentRoundsFired: maximumOpponentRounds,
      sortieOpponentRoundsFired: maximumSortieOpponentRounds,
      defensiveSampleValid,
      wingmanHits: maximumWingmanHits,
      playerHitsTaken: maximumPlayerHitsTaken,
      minimumPlayerHealth,
      kills: maximumKills,
      minimumOpponentHealth,
      stagedRequestedThrottle,
      stagedAppliedThrottle,
      firstRunValleyClearance,
      rapierAttack,
      rapierSortie,
      topGunSortie,
      phases: orderedValuesVisited(samples, "rapierPhase", []).visited,
    }),
  });
}

const INSTALL_STANDARD_GAMEPAD = () => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const pad = {
    id: "Guns Only AI Mission Harness",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  };
  globalThis.__gunsOnlyAiMissionPad = pad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};

const INSTALL_KEYBOARD_QUARANTINE = () => {
  const state = {
    armedCode: null,
    armedUntilMs: 0,
    armedKeyDownSeen: false,
    unexpectedCount: 0,
    unexpected: [],
  };
  const api = {
    arm(code) {
      state.armedCode = String(code ?? "");
      state.armedUntilMs = performance.now() + 1_000;
      state.armedKeyDownSeen = false;
    },
    diagnostics() {
      return {
        unexpectedCount: state.unexpectedCount,
        lastUnexpected: state.unexpected.at(-1) ?? null,
      };
    },
  };
  globalThis.__gunsOnlyAiMissionKeyboardQuarantine = api;
  const intercept = (event) => {
    const nowMs = performance.now();
    const armed = event.code === state.armedCode && nowMs <= state.armedUntilMs;
    if (armed) {
      if (event.type === "keydown") state.armedKeyDownSeen = true;
      if (event.type === "keyup" && state.armedKeyDownSeen) {
        state.armedCode = null;
        state.armedUntilMs = 0;
        state.armedKeyDownSeen = false;
      }
      return;
    }
    state.unexpectedCount += 1;
    state.unexpected.push({ type: event.type, code: event.code, key: event.key, atMs: nowMs });
    if (state.unexpected.length > 32) state.unexpected.shift();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  addEventListener("keydown", intercept, { capture: true });
  addEventListener("keyup", intercept, { capture: true });
};

async function pressHarnessKey(page, key, code = `Key${String(key).toUpperCase()}`) {
  await page.evaluate((armedCode) => {
    globalThis.__gunsOnlyAiMissionKeyboardQuarantine?.arm(armedCode);
  }, code);
  await page.keyboard.press(key);
}

async function applyCommand(page, command, {
  fire = false,
  padlock = false,
  limitOverride = false,
} = {}) {
  const desiredAxes = boundedFixedWingGamepadAxes(command.roll, command.pitch);
  const flightAxes = rawFixedWingGamepadAxes(command.roll, command.pitch);
  await page.evaluate((next) => {
    const pad = globalThis.__gunsOnlyAiMissionPad;
    if (!pad) throw new Error("AI mission gamepad was not installed before boot");
    pad.axes[0] = next.roll;
    pad.axes[1] = next.pitch;
    for (const index of [0, 2, 4, 5, 7]) {
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
    }
    for (const [index, active] of [
      [0, next.padlock], [2, next.limitOverride], [4, next.throttleDown],
      [5, next.throttleUp], [7, next.fire],
    ]) {
      pad.buttons[index].pressed = active === true;
      pad.buttons[index].value = active === true ? 1 : 0;
    }
    pad.timestamp = performance.now();
  }, {
    roll: flightAxes.roll,
    pitch: flightAxes.pitch,
    throttleUp: command.throttleUp,
    throttleDown: command.throttleDown,
    fire,
    padlock,
    limitOverride,
  });
  return desiredAxes;
}

export function fixedWingPageSample({ startMs, previousMissiles }) {
    const state = globalThis.__gunsState ?? {};
    const view = typeof globalThis.__gunsView?.snapshot === "function"
      ? globalThis.__gunsView.snapshot()
      : {};
    const numberOrNull = (value) => value == null ? null : Number(value);
    // Do not send the complete hot/cold authority snapshot over CDP every 50 ms. The controller
    // needs this bounded projection; live evidence below captures the remaining scalar outputs.
    const controllerState = {
      mission_definition_id: state.mission_definition_id,
      px: state.px, py: state.py, pz: state.pz,
      bx: state.bx, by: state.by, bz: state.bz,
      pfx: state.pfx, pfy: state.pfy, pfz: state.pfz,
      bfx: state.bfx, bfy: state.bfy, bfz: state.bfz,
      opponent_present: state.opponent_present,
      opponent_alive: state.opponent_alive,
      plx: state.plx, ply: state.ply, plz: state.plz,
      lead_valid: state.lead_valid,
      lead_x: state.lead_x, lead_y: state.lead_y, lead_z: state.lead_z,
      heading_deg: state.heading_deg,
      bank_deg: state.bank_deg,
      roll_rate_dps: state.roll_rate_dps,
      gamma_deg: state.gamma_deg,
      radar_alt_ft: state.radar_alt_ft,
      vertical_speed_fpm: state.vertical_speed_fpm,
      true_airspeed_kts: state.true_airspeed_kts,
      indicated_airspeed_kts: state.indicated_airspeed_kts,
      calibrated_airspeed_kts: state.calibrated_airspeed_kts,
      g_maxperform: state.g_maxperform,
      corner_speed_kias: state.corner_speed_kias,
      corner_band_min_kias: state.corner_band_min_kias,
      corner_band_max_kias: state.corner_band_max_kias,
      range_m: state.range_m,
      closure_kts: state.closure_kts,
      opponent_gun_firing: state.opponent_gun_firing,
      formation_gun_firing: state.formation_gun_firing,
      w1_present: state.w1_present, w1_alive: state.w1_alive,
      w1x: state.w1x, w1y: state.w1y, w1z: state.w1z,
      w1_trigger_down: state.w1_trigger_down, w1_gun_firing: state.w1_gun_firing,
      w2_present: state.w2_present, w2_alive: state.w2_alive,
      w2x: state.w2x, w2y: state.w2y, w2z: state.w2z,
      w2_trigger_down: state.w2_trigger_down, w2_gun_firing: state.w2_gun_firing,
      w3_present: state.w3_present, w3_alive: state.w3_alive,
      w3x: state.w3x, w3y: state.w3y, w3z: state.w3z,
      w3_trigger_down: state.w3_trigger_down, w3_gun_firing: state.w3_gun_firing,
      auto_gcas_active: state.auto_gcas_active,
      auto_gcas_warning: state.auto_gcas_warning,
      auto_gcas_prediction_valid: state.auto_gcas_prediction_valid,
      auto_gcas_time_available_seconds: state.auto_gcas_time_available_seconds,
      auto_gcas_pilot_violation_time_seconds:
        state.auto_gcas_pilot_violation_time_seconds,
      first_run_weapons_cold: state.first_run_weapons_cold,
      aim9_remaining: state.aim9_remaining,
      selected_player_gun_target_slot: state.selected_player_gun_target_slot,
      engagement_number: state.engagement_number,
      bandit_entity_id: state.bandit_entity_id,
      rapier_guidance_x: state.rapier_guidance_x,
      rapier_guidance_y: state.rapier_guidance_y,
      rapier_guidance_z: state.rapier_guidance_z,
      rapier_fd_target_ktas: state.rapier_fd_target_ktas,
      first_run_valley_available: state.first_run_valley_available,
      first_run_valley_geometry_version: state.first_run_valley_geometry_version,
      first_run_valley_center_east_m: state.first_run_valley_center_east_m,
      first_run_valley_entry_north_m: state.first_run_valley_entry_north_m,
      first_run_valley_popout_north_m: state.first_run_valley_popout_north_m,
      first_run_valley_route_alt_m: state.first_run_valley_route_alt_m,
      first_run_valley_floor_height_m: state.first_run_valley_floor_height_m,
      first_run_valley_floor_blend_drop_m: state.first_run_valley_floor_blend_drop_m,
      first_run_valley_floor_half_width_m: state.first_run_valley_floor_half_width_m,
      first_run_valley_crest_offset_m: state.first_run_valley_crest_offset_m,
      first_run_valley_outer_offset_m: state.first_run_valley_outer_offset_m,
      first_run_valley_west_ridge_rise_m: state.first_run_valley_west_ridge_rise_m,
      first_run_valley_east_ridge_rise_m: state.first_run_valley_east_ridge_rise_m,
      first_run_valley_curve_amplitude_m: state.first_run_valley_curve_amplitude_m,
      first_run_valley_curve_wavelength_m: state.first_run_valley_curve_wavelength_m,
      first_run_valley_centerline_component_count:
        state.first_run_valley_centerline_component_count,
      first_run_valley_side_cut_count: state.first_run_valley_side_cut_count,
      first_run_valley_butte_count: state.first_run_valley_butte_count,
      first_run_valley_side_cut_depth_01: state.first_run_valley_side_cut_depth_01,
      first_run_valley_strata_step_height_m: state.first_run_valley_strata_step_height_m,
      first_run_valley_strata_bench_fraction: state.first_run_valley_strata_bench_fraction,
      first_run_valley_south_extent_north_m: state.first_run_valley_south_extent_north_m,
      first_run_valley_south_full_north_m: state.first_run_valley_south_full_north_m,
      first_run_valley_popout_fade_start_north_m:
        state.first_run_valley_popout_fade_start_north_m,
      first_run_valley_north_extent_north_m: state.first_run_valley_north_extent_north_m,
    };
    return {
      wallS: (performance.now() - startMs) / 1000,
      missionId: state.mission_definition_id ?? null,
      tick: Number(state.tick),
      simS: Number(state.t),
      sessionPhase: state.session_phase ?? null,
      sessionFinished: state.finished === true,
      sortieOutcome: state.sortie_outcome ?? null,
      playerTerminal: state.player_terminal_state ?? null,
      opponentTerminal: state.opponent_terminal_state ?? null,
      padlockActive: view.padlock === true,
      padlockPhase: view.phase ?? null,
      playerImpactSurface: state.player_impact_surface ?? null,
      terrainPresent: state.terrain_present === true,
      belowGround: state.below_ground === true,
      altitudeFt: Number(state.alt_ft),
      xM: Number(state.px),
      yM: Number(state.py),
      zM: Number(state.pz),
      velocityXMps: Number(state.vx),
      velocityYMps: Number(state.vy),
      velocityZMps: Number(state.vz),
      forwardX: Number(state.pfx),
      forwardY: Number(state.pfy),
      forwardZ: Number(state.pfz),
      liftX: Number(state.plx),
      liftY: Number(state.ply),
      liftZ: Number(state.plz),
      opponentXM: Number(state.bx),
      opponentYM: Number(state.by),
      opponentZM: Number(state.bz),
      opponentTacticCode: state.selected_opponent_tactic_code == null
        ? null : Number(state.selected_opponent_tactic_code),
      opponentLastCommandLoadFactorG:
        state.selected_opponent_last_command_load_factor_g == null
          ? null : Number(state.selected_opponent_last_command_load_factor_g),
      opponentLastCommandBankTargetDeg:
        state.selected_opponent_last_command_bank_target_deg == null
          ? null : Number(state.selected_opponent_last_command_bank_target_deg),
      opponentLastCommandThrottle:
        state.selected_opponent_last_command_throttle == null
          ? null : Number(state.selected_opponent_last_command_throttle),
      opponentLastCommandRudder:
        state.selected_opponent_last_command_rudder == null
          ? null : Number(state.selected_opponent_last_command_rudder),
      headingDeg: Number(state.heading_deg),
      bankDeg: Number(state.bank_deg),
      rollRateDps: numberOrNull(state.roll_rate_dps),
      pitchRateDps: Number(state.pitch_rate_dps),
      pitchDeg: Number(state.pitch_deg),
      gammaDeg: Number(state.gamma_deg),
      radarAltitudeFt: Number(state.radar_alt_ft),
      verticalSpeedFpm: Number(state.vertical_speed_fpm),
      speedKts: Number(state.true_airspeed_kts),
      calibratedSpeedKts: Number(state.calibrated_airspeed_kts),
      throttle: Number(state.throttle),
      requestedThrottle: Number(state.requested_throttle),
      appliedThrottle: Number(state.applied_throttle),
      engineThrustFraction: Number(state.engine),
      assistedFlight: state.assisted_flight === true,
      returnToBaseAvailable: state.rtb_available === true,
      returnToBaseReason: state.rtb_reason ?? null,
      returnToBaseSteer: state.rtb_steer === true,
      playerReturnToBaseActive: typeof state.player_rtb_active === "boolean"
        ? state.player_rtb_active : undefined,
      combatHandoffPhase: Number(state.combat_handoff_phase),
      combatHandoffRequested: state.combat_handoff_requested === true,
      combatHandoffActive: state.combat_handoff_active === true,
      pilotControlInterlocked: typeof state.pilot_control_interlocked === "boolean"
        ? state.pilot_control_interlocked : undefined,
      cornerSpeedKias: Number(state.corner_speed_kias),
      cornerBandMinimumKias: Number(state.corner_band_min_kias),
      cornerBandMaximumKias: Number(state.corner_band_max_kias),
      rangeM: Number(state.range_m),
      angleOffDeg: Number(state.angle_off_deg),
      closureKts: Number(state.closure_kts),
      requestedRoll: Number(state.requested_roll_control),
      requestedRudder: Number(state.requested_rudder),
      appliedRudder: Number(state.applied_rudder),
      requestedG: Number(state.requested_g_cmd),
      gMaxPerform: Number(state.g_maxperform),
      appliedGCommand: Number(state.g_cmd),
      actualG: numberOrNull(state.g_actual),
      sortiePeakG: Number(state.sortie_peak_g),
      pilotG: Number(state.pilot_gz),
      pilotGValid: state.pilot_gz_valid === true,
      gunneryAssistActive: state.gunnery_pitch_assist === true,
      gunneryAssistStatus: state.gunnery_assist_status ?? null,
      gunneryAssistStatusCode: Number(state.gunnery_assist_status_code),
      gunneryPitchErrorDeg: Number(state.gunnery_pitch_error_deg),
      gunneryLateralErrorDeg: Number(state.gunnery_lateral_error_deg),
      gunneryTotalLeadErrorDeg: Number(state.gunnery_total_lead_error_deg),
      gunneryPitchRateCommandDps: Number(state.gunnery_pitch_rate_cmd_dps),
      gunneryPitchRateMeasuredDps: Number(state.gunnery_pitch_rate_measured_dps),
      gunneryPitchRateErrorDps: Number(state.gunnery_pitch_rate_error_dps),
      gunneryPitchAssistG: Number(state.gunnery_pitch_assist_g),
      gunneryPitchAssistDeltaG: Number(state.gunnery_pitch_assist_delta_g),
      gunneryAssistAuthority01: Number(state.gunnery_assist_authority_01),
      gunneryRollAssist: Number(state.gunnery_roll_assist),
      gunneryYawAssist: Number(state.gunnery_yaw_assist),
      f22AriGain: Number(state.f22_ari_gain),
      f22AriRudder: Number(state.f22_ari_rudder),
      effectiveRudderCommand: Number(state.effective_rudder_command),
      stabilityYawRateDps: Number(state.stability_yaw_rate_dps),
      padlockRollAssistAileron: Number(state.padlock_roll_assist_aileron),
      aoaDeg: numberOrNull(state.aoa_deg),
      betaDeg: Number(state.beta_deg),
      yawRateDps: Number(state.yaw_rate_dps),
      rollControl: Number(state.roll_control),
      sasAileron: Number(state.sas_aileron),
      totalAileronCommandDeg: Number(state.total_aileron_command_deg),
      rollMomentNm: Number(state.roll_moment_nm),
      roundsFired: Number(state.rounds_fired),
      hits: Number(state.hits),
      opponentHealth: Number(state.opponent_health),
      playerHealth: Number(state.player_health),
      playerAlive: state.player_alive === true,
      opponentRoundsFired: Number(state.opponent_rounds_fired),
      playerHitsTaken: Number(state.opponent_hits),
      opponentGunFiring: state.opponent_gun_firing === true,
      opponentTriggerDown: state.opponent_trigger_down === true,
      formationGunFiring: state.formation_gun_firing === true,
      // Preserve exact incoming projectile position/velocity truth in the evidence tape. Prior
      // runs retained only round counts, so a miss and a physically impossible late dodge looked
      // identical to the harness. Bound the copy to the production gun's short live burst.
      opponentTracers: Array.isArray(state.opponent_tracers)
        ? state.opponent_tracers.slice(0, 32)
        : [],
      sortieOpponentRoundsFired: Number(state.sortie_opponent_rounds_fired),
      sortiePlayerRoundsFired: Number(state.sortie_rounds_fired),
      sortiePlayerHits: Number(state.sortie_hits),
      selectedTargetSlot: Number(state.selected_player_gun_target_slot),
      engagementNumber: Number(state.engagement_number),
      banditEntityId: state.bandit_entity_id ?? null,
      wingmen: [1, 2, 3].map((index) => ({
        slot: index,
        present: Number(state[`w${index}_present`]) === 1,
        alive: Number(state[`w${index}_alive`]) === 1,
        xM: Number(state[`w${index}x`]),
        yM: Number(state[`w${index}y`]),
        zM: Number(state[`w${index}z`]),
        roundsFired: Number(state[`w${index}_rounds_fired`]),
        hits: Number(state[`w${index}_hits`]),
        triggerDown: Number(state[`w${index}_trigger_down`]) === 1,
        gunFiring: Number(state[`w${index}_gun_firing`]) === 1,
      })).filter((contact) => contact.present),
      autoGcasPhase: state.auto_gcas_phase ?? null,
      autoGcasInhibitReason: state.auto_gcas_inhibit_reason ?? null,
      autoGcasActive: typeof state.auto_gcas_active === "boolean"
        ? state.auto_gcas_active : undefined,
      autoGcasOverrideHeld: typeof state.auto_gcas_override_held === "boolean"
        ? state.auto_gcas_override_held : undefined,
      autoGcasWarning: state.auto_gcas_warning === true,
      autoGcasPredictionValid: state.auto_gcas_prediction_valid === true,
      autoGcasCurrentClearanceM: state.auto_gcas_current_clearance_m == null
        ? null : Number(state.auto_gcas_current_clearance_m),
      autoGcasPilotMinimumClearanceM: state.auto_gcas_pilot_minimum_clearance_m == null
        ? null : Number(state.auto_gcas_pilot_minimum_clearance_m),
      autoGcasRecoveryMinimumClearanceM:
        state.auto_gcas_recovery_minimum_clearance_m == null
          ? null : Number(state.auto_gcas_recovery_minimum_clearance_m),
      autoGcasTimeAvailableS: state.auto_gcas_time_available_seconds == null
        ? null : Number(state.auto_gcas_time_available_seconds),
      autoGcasPilotViolationTimeS: state.auto_gcas_pilot_violation_time_seconds == null
        ? null : Number(state.auto_gcas_pilot_violation_time_seconds),
      autoGcasActivationCount: Number(state.auto_gcas_activation_count),
      autoGcasOverrideCount: Number(state.auto_gcas_override_count),
      autoGcasReleaseCount: Number(state.auto_gcas_release_count),
      killCount: Number(state.kill_count),
      gunSolutionRaw: state.gun_solution_raw === true,
      gunSolution: state.gun_solution === true,
      gunWindow: state.gun_window === true,
      weaponsCold: typeof state.first_run_weapons_cold === "boolean"
        ? state.first_run_weapons_cold : undefined,
      weaponsInhibited: typeof state.weapons_inhibited === "boolean"
        ? state.weapons_inhibited : undefined,
      aim9Remaining: Number(state.aim9_remaining),
      aim9InFlight: state.aim9_in_flight === true,
      aim9SeekerState: state.aim9_seeker_state ?? null,
      aim9Launched: Number.isFinite(previousMissiles)
        && Number(state.aim9_remaining) < previousMissiles,
      rapierPhase: String(state.rapier_mission_phase_name ?? "").toLowerCase(),
      rapierPhaseReason: state.rapier_phase_reason ?? null,
      rapierAutomationEnabled: state.rapier_automation_enabled === true,
      rapierAutomationActive: state.rapier_automation_active === true,
      rapierReactionActive: state.rapier_balloon_reaction_active === true,
      rapierReactionSeconds: Number(state.rapier_balloon_reaction_seconds),
      rapierCarriersRemaining: Number(state.rapier_balloon_carriers_remaining),
      rapierPayloadDeployed: state.rapier_balloon_payload_deployed === true,
      rapierRecoveryGate: Number(state.rapier_recovery_gate),
      configurationTarget: state.configuration_target ?? null,
      configurationAutomatic: state.configuration_automatic === true,
      configurationTransition: state.configuration_transition === true,
      configurationGearAutomatic: state.configuration_gear_auto === true,
      configurationFlapAutomatic: state.configuration_flap_auto === true,
      gearNose: Number(state.gear_nose),
      gearLeft: Number(state.gear_left),
      gearRight: Number(state.gear_right),
      gearUnsafe: state.gear_unsafe === true,
      gearLimitExceeded: state.gear_limit_exceeded === true,
      flapLeftDeg: Number(state.flap_left_deg),
      flapRightDeg: Number(state.flap_right_deg),
      flapSplit: state.flap_split === true,
      flapLimitExceeded: state.flap_limit_exceeded === true,
      approachGuidanceActive: state.approach_guidance_active === true,
      approachValid: state.approach_valid === true,
      approachInGroove: state.approach_in_groove === true,
      approachNextAltitudeM: Number(state.approach_next_alt_m),
      approachNextTrueAirspeedMps: Number(state.approach_next_tas_mps),
      approachPower01: Number(state.approach_power_01),
      approachGateCount: Number(state.approach_gate_count),
      approachGates: Array.isArray(state.approach_gates)
        ? state.approach_gates.slice(0, 8).map((gate) => ({
          eastM: Number(gate?.east_m),
          northM: Number(gate?.north_m),
          upM: Number(gate?.up_m),
          halfM: Number(gate?.half_m),
          targetKtas: Number(gate?.target_ktas),
          dirty: gate?.dirty === true || Number(gate?.dirty) === 1,
          active: gate?.active === true || Number(gate?.active) === 1,
        }))
        : [],
      carrierXM: Number(state.cx),
      carrierYM: Number(state.cy),
      carrierZM: Number(state.cz),
      touchdownXM: Number(state.tx),
      touchdownYM: Number(state.ty),
      touchdownZM: Number(state.tz),
      recovery: state.recovery ?? null,
      hookOutcome: state.hook_outcome ?? null,
      wire: Number(state.wire),
      arrestPhase: state.arrest_phase ?? null,
      arrestFailureReason: state.arrest_failure_reason ?? null,
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
      gamepadConnected: navigator.getGamepads?.()[0]?.connected === true
        && navigator.getGamepads?.()[0]?.id === "Guns Only AI Mission Harness",
      keyboardQuarantine:
        globalThis.__gunsOnlyAiMissionKeyboardQuarantine?.diagnostics?.() ?? null,
      browserPilot: globalThis.__gunsOnlyFixedWingBrowserPilot?.diagnostics?.() ?? null,
      recentEvents: Array.isArray(state.recent_events)
        ? state.recent_events.slice(-8).map((event) => ({
          sequence: Number(event?.sequence),
          tick: Number(event?.tick),
          type: event?.type ?? null,
          source: event?.source ?? null,
          target: event?.target ?? null,
          count: Number(event?.count),
          outcome: event?.outcome ?? null,
          surface: event?.surface ?? null,
          entityId: event?.entity_id ?? null,
        }))
        : [],
      state: controllerState,
    };
}

async function readSample(page, startedAtMs, previousAim9Remaining) {
  const sample = await page.evaluate(
    fixedWingPageSample,
    { startMs: startedAtMs, previousMissiles: previousAim9Remaining },
  );
  sample.opponentTracers = fixedWingIncomingTracerRows(sample.opponentTracers);
  sample.opponentTactic = fixedWingOpponentTacticName(
    sample.opponentTacticCode,
  );
  return sample;
}

async function captureScreenshot(page, path, warnings, timeout = 5_000) {
  try {
    await page.screenshot({ path, type: "png", timeout });
    return true;
  } catch (error) {
    warnings.push(`screenshot ${path}: ${error?.message?.split("\n")[0] ?? error}`);
    return false;
  }
}

async function withPageWatchdog(promise, label, timeoutMs = 8_000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} blocked for more than ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function missionSatisfied(samples, mission) {
  const latest = samples.at(-1);
  if (!latest) return false;
  if (mission === "first-run") {
    return samples.some((sample) => sample.weaponsCold === false)
      && firstRunGunHandoffEvidence(samples).gunHitSeen;
  }
  if (mission === "rapier") {
    // Full-sortie evidence is necessarily false before the terminal transaction. Avoid rescanning
    // a growing 30-minute tape at 20 Hz; perform the linear proof once FINISHED is observable.
    if (latest.sessionFinished !== true
        || String(latest.sessionPhase ?? "").toUpperCase() !== "FINISHED") return false;
    return rapierSortieEvidence(samples).pass;
  }
  if (mission === "top-gun") {
    if (latest.sessionFinished !== true
        || String(latest.sessionPhase ?? "").toUpperCase() !== "FINISHED") return false;
    return topGunSortieEvidence(samples).pass;
  }
  const liveOpponentSeen = samples.some((sample) => sample.opponentTerminal === "FLYING");
  const opponentFinished = liveOpponentSeen
    && typeof latest.opponentTerminal === "string"
    && latest.opponentTerminal.length > 0
    && latest.opponentTerminal !== "FLYING";
  return samples.some((sample) => sample.rangeM < 2_500)
    && (Math.max(...samples.map((sample) => finite(sample.killCount)))
      > finite(samples[0]?.killCount)
      || opponentFinished);
}

export function fixedWingAiEvidencePhase(sample, mission) {
  if (mission === "rapier") return sample?.rapierPhase || "active";
  if (mission === "top-gun") {
    if (sample?.playerReturnToBaseActive !== true) return "fight";
    if (sample?.approachGuidanceActive !== true) return "rtb";
    const count = Number(sample?.approachGateCount);
    if (!Number.isInteger(count) || count < 1 || count > 8) return "approach";
    return count === 1 ? "wires" : `approach-${9 - count}`;
  }
  return sample?.weaponsCold ? "valley" : "fight";
}

/** Do not save a transition frame and label it as mission evidence. */
export function fixedWingPhaseCaptureReady(sample, mission, phase) {
  if (finite(sample?.wallS) < 1) return false;
  if (mission === "f22" && phase === "fight") {
    return sample?.aiGunLeadFinisherActive === true
      && sample?.padlockPhase === "TRACK"
      && sample?.aiCombatLoadedRollUnloadActive !== true
      && sample?.aiVerticalRecoveryPhase === "idle"
      && sample?.aiTerrainRecoveryPhase === "idle"
      && finite(sample?.rangeM, Number.POSITIVE_INFINITY) >= 250
      && finite(sample?.rangeM, Number.POSITIVE_INFINITY) <= 2_500
      && finite(sample?.aiLeadOffBoresightDeg, Number.POSITIVE_INFINITY) <= 12
      && Math.abs(finite(sample?.rollRateDps, Number.POSITIVE_INFINITY)) <= 20
      && finite(sample?.actualG) >= 2.5
      && finite(sample?.closureKts, Number.NEGATIVE_INFINITY) >= -50;
  }
  return true;
}

function argvValue(name, fallback = null) {
  const index = runtimeProcess.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = runtimeProcess.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

export async function runFixedWingAiFlight({
  wwwroot,
  mission = "f22",
  durationSeconds = null,
  hardware = false,
  outputDirectory = `/tmp/fixed-wing-ai-${mission}`,
} = {}) {
  if (!wwwroot) throw new TypeError("runFixedWingAiFlight requires a published wwwroot");
  const definition = FIXED_WING_AI_MISSIONS[mission];
  if (!definition) throw new TypeError(`Unknown fixed-wing AI mission '${mission}'`);
  const deadlineSeconds = Number.isFinite(Number(durationSeconds))
    ? Number(durationSeconds)
    : definition.deadlineSeconds;
  const site = await serveStatic(wwwroot);
  const schedulingArgs = [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ];
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ["--use-angle=metal", "--enable-webgl-draft-extensions", ...schedulingArgs]
      : [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        ...schedulingArgs,
      ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INSTALL_STANDARD_GAMEPAD);
  await context.addInitScript(INSTALL_KEYBOARD_QUARANTINE);
  const page = await context.newPage();
  const errors = [];
  const captureWarnings = [];
  const samples = [];
  page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
  page.on("crash", () => errors.push("browser page crashed"));
  try {
    await mkdir(outputDirectory, { recursive: true });
    const navigationStartedAt = Date.now();
    await page.goto(`${site.url}${definition.search}`, {
      waitUntil: "load",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("ready") === true
        && !!globalThis.__gunsState,
      undefined,
      { timeout: 120_000 },
    );
    const readyMs = Date.now() - navigationStartedAt;
    const fatal = await page.evaluate(() => ({
      visible: document.querySelector("#fatal")?.classList.contains("visible") === true,
      message: document.querySelector("#fatal-message")?.textContent ?? "",
    }));
    if (fatal.visible) throw new Error(`FLIGHT KERNEL OFFLINE: ${fatal.message}`);
    const stagedThrottle = await page.evaluate(() => ({
      requested: Number(globalThis.__gunsState?.requested_throttle),
      applied: Number(globalThis.__gunsState?.applied_throttle),
    }));
    await page.waitForFunction(() => {
      const ready = document.querySelector("#ready-screen");
      return ready?.classList.contains("visible") === true
        && ready.getAttribute("aria-hidden") === "false"
        && Number.parseFloat(getComputedStyle(ready).opacity) >= 0.99;
    }, undefined, { timeout: 5_000 });
    await captureScreenshot(
      page,
      `${outputDirectory}/${mission}-ready.png`,
      captureWarnings,
    );

    const startClickedAt = Date.now();
    await page.locator("#ready-start").click();
    await page.waitForFunction(
      () => globalThis.__gunsState?.session_phase === "ACTIVE"
        && globalThis.__gunsState?.player_terminal_state === "FLYING"
        && !document.documentElement.classList.contains("run-paused"),
      undefined,
      { timeout: 180_000 },
    );
    const startLatencyMs = Date.now() - startClickedAt;
    const stagedAppliedThrottle = await page.evaluate(() =>
      Number(globalThis.__gunsState?.applied_throttle));
    const teaching = page.locator("#controls-onboarding-dismiss");
    if (await teaching.isVisible()) await teaching.click();
    // presentationDiagnostics() traverses multiple scene systems. It is static acceptance evidence,
    // not a control-loop input, so capture it once instead of forcing the renderer to rebuild the
    // full diagnostics tree on every authority sample.
    const firstRunValleyPresentation = mission === "first-run"
      ? await page.evaluate(() =>
        globalThis.__gunsAssets?.diagnostics?.().firstRunValley ?? null)
      : null;
    if (mission === "rapier") {
      await pressHarnessKey(page, "p");
      await page.waitForFunction(
        () => globalThis.__gunsState?.rapier_automation_enabled === true,
        undefined,
        { timeout: 10_000 },
      );
    }
    const browserControllerSource = (await readFile(new URL(import.meta.url), "utf8"))
      .replace(/^#![^\n]*\n/, "");
    await page.addScriptTag({ type: "module", content: browserControllerSource });
    await page.waitForFunction(
      () => !!globalThis.__gunsOnlyFixedWingControllerModule,
      undefined,
      { timeout: 10_000 },
    );
    await page.evaluate(({ missionId, intervalMs }) => {
      globalThis.__gunsOnlyFixedWingControllerModule.installFixedWingBrowserPilot({
        mission: missionId,
        sampleMs: intervalMs,
      });
    }, { missionId: mission, intervalMs: FIXED_WING_AI_SAMPLE_MS });

    const startedAtMs = await page.evaluate(() => performance.now());
    const initialDeadlineAt = Date.now() + deadlineSeconds * 1000;
    const hardDeadlineAt = initialDeadlineAt + 5_000;
    let deadlineAt = initialDeadlineAt;
    let previousPhase = null;
    let previousAim9Remaining = Number.NaN;
    let openingTopGunKills = null;
    let topGunLastRtbRequestAtMs = Number.NEGATIVE_INFINITY;
    let observedFoxTwoRequestSequence = 0;
    let lastLogSecond = -1;
    const capturedEvidence = new Set();
    let settledLoadedOverbankObservedS = 0;
    let settledLoadedOverbankLastWallS = null;
    let sustainedLoadedWallTurnObservedS = 0;
    let sustainedLoadedWallTurnLastWallS = null;
    while (Date.now() < deadlineAt) {
      const controlCycleStartedAt = Date.now();
      let sample;
      try {
        sample = await withPageWatchdog(
          readSample(page, startedAtMs, previousAim9Remaining),
          "live authority read",
        );
        sample.aiAuthorityReadLatencyMs = Date.now() - controlCycleStartedAt;
      } catch (error) {
        errors.push(error?.message ?? String(error));
        break;
      }
      previousAim9Remaining = sample.aim9Remaining;
      if (mission === "f22" && sample.roundsFired > 0
          && deadlineAt - Date.now() < 3_000) {
        // Do not close the browser with a qualified burst still in flight. At the 2.5 km finisher
        // boundary, production M61 rounds need real ballistic time to reach the target.
        deadlineAt = Math.min(hardDeadlineAt, Date.now() + 3_000);
      }
      const pilot = sample.browserPilot?.last;
      if (!pilot) {
        errors.push("browser-resident pilot published no live command");
        break;
      }
      sample.aiTargetMode = pilot.targetMode;
      sample.aiTargetXM = pilot.targetXM;
      sample.aiTargetYM = pilot.targetYM;
      sample.aiTargetZM = pilot.targetZM;
      sample.aiHeadingErrorDeg = pilot.headingErrorDeg;
      sample.aiDesiredBankDeg = pilot.desiredBankDeg;
      sample.aiValleyBankFeedForwardDeg = pilot.valleyBankFeedForwardDeg;
      sample.aiNominalDesiredRollRateDps = pilot.nominalDesiredRollRateDps;
      sample.aiDesiredRollRateDps = pilot.desiredRollRateDps;
      sample.aiRecoveryRollHandoffBrakingActive =
        pilot.recoveryRollHandoffBrakingActive;
      sample.aiDesiredGammaDeg = pilot.desiredGammaDeg;
      sample.aiMaximumLoadFactorG = pilot.maximumLoadFactorG;
      sample.aiCoordinatedLoadFactorG = pilot.coordinatedLoadFactorG;
      sample.aiDesiredLoadFactorG = pilot.desiredLoadFactorG;
      sample.aiTerrainEscapeRecovery = pilot.terrainEscapeRecovery;
      sample.aiTerrainRecoveryPhase = pilot.terrainRecoveryPhase;
      sample.aiTerrainSecondsToImpact = pilot.secondsToTerrain;
      sample.aiTerrainPilotViolationTimeS = pilot.terrainPilotViolationTimeS;
      sample.aiVerticalRecoveryPhase = pilot.verticalRecoveryPhase;
      sample.aiVerticalRecoverySliceRollArmed =
        pilot.verticalRecoverySliceRollArmed;
      sample.aiVerticalRecoveryPullActive = pilot.verticalRecoveryPullActive;
      sample.aiVerticalRecoveryRecaptureActive =
        pilot.verticalRecoveryRecaptureActive;
      sample.aiVerticalRecoveryLevelRollArmed =
        pilot.verticalRecoveryLevelRollArmed;
      sample.aiVerticalRecoveryShotOpportunity =
        pilot.verticalRecoveryShotOpportunity;
      sample.aiVerticalRecoveryCapturedShotOpportunity =
        pilot.verticalRecoveryCapturedShotOpportunity;
      sample.aiVerticalRecoveryDefensivePreemption =
        pilot.verticalRecoveryDefensivePreemption;
      sample.aiInvertedRecoveryActive = pilot.invertedRecoveryActive;
      sample.aiInvertedRecoveryRollArmed = pilot.invertedRecoveryRollArmed;
      sample.aiInvertedRecoveryTargetBankDeg = pilot.invertedRecoveryTargetBankDeg;
      sample.aiInvertedRecoveryReleaseDwell = pilot.invertedRecoveryReleaseDwell;
      sample.aiCombatDefensiveBreakActive = pilot.combatDefensiveBreakActive;
      sample.aiCombatDefensiveOverbankGuardActive =
        pilot.combatDefensiveOverbankGuardActive;
      sample.aiCombatGenericOverbankGuardActive =
        pilot.combatGenericOverbankGuardActive;
      sample.aiCombatDefensiveOverbankUnloadActive =
        pilot.combatDefensiveOverbankUnloadActive;
      sample.aiCombatOffensivePressActive = pilot.combatOffensivePressActive;
      sample.aiCombatOffensivePressSamples = pilot.combatOffensivePressSamples;
      sample.aiCombatOffensivePressExhausted =
        pilot.combatOffensivePressExhausted;
      sample.aiCombatDefensiveReleaseUnloadActive =
        pilot.combatDefensiveReleaseUnloadActive;
      sample.aiCombatLoadedRollUnloadActive =
        pilot.combatLoadedRollUnloadActive;
      sample.aiCombatLoadedRollPhase = pilot.combatLoadedRollPhase;
      sample.aiCombatLoadedRollTargetBankDeg = pilot.combatLoadedRollTargetBankDeg;
      sample.aiCombatLoadedRollTransferSign = pilot.combatLoadedRollTransferSign;
      sample.aiCombatLoadedRollPursuitRetargetMode =
        pilot.combatLoadedRollPursuitRetargetMode;
      sample.aiCombatLoadedPursuitBankHoldActive =
        pilot.combatLoadedPursuitBankHoldActive;
      sample.aiCombatLoadedPursuitLiveDesiredBankDeg =
        pilot.combatLoadedPursuitLiveDesiredBankDeg;
      sample.aiCombatAftPursuitBankHoldActive =
        pilot.combatAftPursuitBankHoldActive;
      sample.aiCombatAftPursuitReleaseUnloadActive =
        pilot.combatAftPursuitReleaseUnloadActive;
      sample.aiCombatAftPursuitBankHoldSign =
        pilot.combatAftPursuitBankHoldSign;
      sample.aiCombatDefensiveBreakControlOwned =
        pilot.combatDefensiveBreakControlOwned;
      sample.aiCombatDefensiveBreakSign = pilot.combatDefensiveBreakSign;
      sample.aiCombatDefensiveLastCommittedBreakSign =
        pilot.combatDefensiveLastCommittedBreakSign;
      sample.aiCombatDefensiveBreakPlaneMagnitudeDeg =
        pilot.combatDefensiveBreakPlaneMagnitudeDeg;
      sample.aiCombatDefensiveNoseHighLateralPlanePreserved =
        pilot.combatDefensiveNoseHighLateralPlanePreserved;
      sample.aiCombatDefensiveCloseRearCurrentPlanePreserved =
        pilot.combatDefensiveCloseRearCurrentPlanePreserved;
      sample.aiCombatDefensiveOverbankedRearNearestPlanePreserved =
        pilot.combatDefensiveOverbankedRearNearestPlanePreserved;
      sample.aiCombatDefensiveLowPlanePhysicallyEngaged =
        pilot.combatDefensiveLowPlanePhysicallyEngaged;
      sample.aiCombatDefensiveLowPlaneTransitionDeferred =
        pilot.combatDefensiveLowPlaneTransitionDeferred;
      sample.aiCombatDefensiveHighClimbLoadLimited =
        pilot.combatDefensiveHighClimbLoadLimited;
      sample.aiCombatDefensiveTransferGunfireAbort =
        pilot.combatDefensiveTransferGunfireAbort;
      sample.aiCombatDefensiveGunfireBankHoldActive =
        pilot.combatDefensiveGunfireBankHoldActive;
      sample.aiCombatDefensiveLowPlaneTimeToClosestApproachS =
        pilot.combatDefensiveLowPlaneTimeToClosestApproachS;
      sample.aiCombatDefensiveLowPlaneTimeToGunEnvelopeS =
        pilot.combatDefensiveLowPlaneTimeToGunEnvelopeS;
      sample.aiCombatDefensiveLowPlaneSamples =
        pilot.combatDefensiveLowPlaneSamples;
      sample.aiCombatDefensiveLowPlaneComplete =
        pilot.combatDefensiveLowPlaneComplete;
      sample.aiCombatDefensiveHighPlaneReleaseSamples =
        pilot.combatDefensiveHighPlaneReleaseSamples;
      sample.aiCombatDefensiveHighPlaneComplete =
        pilot.combatDefensiveHighPlaneComplete;
      sample.aiCombatDefensiveHighPlaneRecoveryActive =
        pilot.combatDefensiveHighPlaneRecoveryActive;
      sample.aiCombatDefensivePrimaryShooterElevationDeg =
        pilot.combatDefensivePrimaryShooterElevationDeg;
      sample.aiCombatDefensiveShooterElevationDeg =
        pilot.combatDefensiveShooterElevationDeg;
      sample.aiCombatDefensiveThreatReason = pilot.combatDefensiveThreatReason;
      sample.aiCombatDefensivePointBlankRearReacquisitionThreat =
        pilot.combatDefensivePointBlankRearReacquisitionThreat;
      sample.aiCombatDefensiveOpponentNoseErrorDeg =
        pilot.combatDefensiveOpponentNoseErrorDeg;
      sample.aiCombatDefensivePrimaryAimSamples =
        pilot.combatDefensivePrimaryAimSamples;
      sample.aiCombatDefensivePrimaryAimNotDiverging =
        pilot.combatDefensivePrimaryAimNotDiverging;
      sample.aiCombatDownhillSliceActive = pilot.combatDownhillSliceActive;
      sample.aiCombatDownhillSliceRollArmed = pilot.combatDownhillSliceRollArmed;
      sample.aiCombatDownhillSlicePullActive = pilot.combatDownhillSlicePullActive;
      sample.aiCombatDownhillSliceUnloadSamples =
        pilot.combatDownhillSliceUnloadSamples;
      sample.aiCombatDownhillSliceTargetRecovered =
        pilot.combatDownhillSliceTargetRecovered;
      sample.aiCombatDownhillRecoveryPhase = pilot.combatDownhillRecoveryPhase;
      sample.aiCombatDownhillRecoveryRollArmed =
        pilot.combatDownhillRecoveryRollArmed;
      sample.aiCombatDownhillPostPassConversionActive =
        pilot.combatDownhillPostPassConversionActive;
      sample.aiGunLeadBasisValid = pilot.gunLeadBasisValid;
      sample.aiGunLeadFinisherActive = pilot.gunLeadFinisherActive;
      sample.aiGunLeadImminentPassBankHoldActive =
        pilot.gunLeadImminentPassBankHoldActive;
      sample.aiGunLeadPitchDominatedApproachBankHoldActive =
        pilot.gunLeadPitchDominatedApproachBankHoldActive;
      sample.aiGunLeadFinisherEarlyHighClosureEntry =
        pilot.gunLeadFinisherEarlyHighClosureEntry;
      sample.aiGunLeadFinisherFreshLoadedEntryDeferred =
        pilot.gunLeadFinisherFreshLoadedEntryDeferred;
      sample.aiGunLeadFinisherRearmBlocked =
        pilot.gunLeadFinisherRearmBlocked;
      sample.aiGunLeadFinisherEntryBankDeg =
        pilot.gunLeadFinisherEntryBankDeg;
      sample.aiGunLeadFinisherLivePlaneTravelFromEntryDeg =
        pilot.gunLeadFinisherLivePlaneTravelFromEntryDeg;
      sample.aiGunLeadFinisherCapturedPlaneTravelFromEntryDeg =
        pilot.gunLeadFinisherCapturedPlaneTravelFromEntryDeg;
      sample.aiGunLeadFinisherBankLimitExitActive =
        pilot.gunLeadFinisherBankLimitExitActive;
      sample.aiGunLeadFinisherOverbankGuardActive =
        pilot.gunLeadFinisherOverbankGuardActive;
      sample.aiGunLeadFinisherOverbankUnloadActive =
        pilot.gunLeadFinisherOverbankUnloadActive;
      sample.aiGunLeadFinisherUnboundedBankTargetDeg =
        pilot.gunLeadFinisherUnboundedBankTargetDeg;
      sample.aiGunLeadFinisherBoundedBankTargetDeg =
        pilot.gunLeadFinisherBoundedBankTargetDeg;
      sample.aiGunLeadFinisherProjectedBankDeg =
        pilot.gunLeadFinisherProjectedBankDeg;
      sample.aiFinisherExceededEntryPlaneTravel =
        pilot.finisherExceededEntryPlaneTravel;
      sample.aiGunLeadRollCaptureActive = pilot.gunLeadRollCaptureActive;
      sample.aiGunLeadCartesianCaptureConverged =
        pilot.gunLeadCartesianCaptureConverged;
      sample.aiGunLeadCapturedFineRollActive = pilot.gunLeadCapturedFineRollActive;
      sample.aiGunLeadRollCaptureHandoffActive = pilot.gunLeadRollCaptureHandoffActive;
      sample.aiGunLeadCartesianRollActive = pilot.gunLeadCartesianRollActive;
      sample.aiGunLeadCartesianRollRateDps = pilot.gunLeadCartesianRollRateDps;
      sample.aiGunLeadCartesianRangeScale = pilot.gunLeadCartesianRangeScale;
      sample.aiGunLeadCartesianRollFeedForwardDps =
        pilot.gunLeadCartesianRollFeedForwardDps;
      sample.aiGunLeadPitchIsolationRecenterRateDps =
        pilot.gunLeadPitchIsolationRecenterRateDps;
      sample.aiGunLeadHighClosureConeRecoveryActive =
        pilot.gunLeadHighClosureConeRecoveryActive;
      sample.aiGunLeadCartesianRollBiasRateDps = pilot.gunLeadCartesianRollBiasRateDps;
      sample.aiLeadLateralErrorDeg = pilot.leadLateralErrorDeg;
      sample.aiLeadLateralErrorDeltaDeg = pilot.leadLateralErrorDeltaDeg;
      sample.aiLeadLiftErrorDeg = pilot.leadLiftErrorDeg;
      sample.aiLeadLiftErrorDeltaDeg = pilot.leadLiftErrorDeltaDeg;
      sample.aiGunLeadLiftDampingCommand = pilot.gunLeadLiftDampingCommand;
      sample.aiGunLeadPitchDominatedFineCapture =
        pilot.gunLeadPitchDominatedFineCapture;
      sample.aiGunLeadCapturedPitchLoadedTrimActive =
        pilot.gunLeadCapturedPitchLoadedTrimActive;
      sample.aiCapturedPitchAxisPullActive =
        pilot.capturedPitchAxisPullActive;
      sample.aiGunLeadPredictiveOvershootBrakeActive =
        pilot.gunLeadPredictiveOvershootBrakeActive;
      sample.aiGunLeadPitchAxisApproachBrakeActive =
        pilot.gunLeadPitchAxisApproachBrakeActive;
      sample.aiGunLeadCloseApproachBrakeActive =
        pilot.gunLeadCloseApproachBrakeActive;
      sample.aiPublishedPitchRateErrorDps =
        pilot.publishedPitchRateErrorDps;
      sample.aiLeadRollCaptureTrimDeg = pilot.leadRollCaptureTrimDeg;
      sample.aiGunLeadTargetChanged = pilot.gunLeadTargetChanged;
      sample.aiLeadRollPlaneErrorDeg = pilot.leadRollPlaneErrorDeg;
      sample.aiLeadRollControlErrorDeg = pilot.leadRollControlErrorDeg;
      sample.aiLeadOffBoresightDeg = pilot.leadOffBoresightDeg;
      sample.aiCombatCornerEnergyActive = pilot.combatCornerEnergyActive;
      sample.aiCombatCornerFast = pilot.combatCornerFast;
      sample.aiCombatDefensivePowerOverrideActive =
        pilot.combatDefensivePowerOverrideActive;
      sample.aiCombatDefensivePowerTarget = pilot.combatDefensivePowerTarget;
      sample.aiEnergySpeedMode = pilot.energySpeedMode;
      sample.aiFinisherNeedsBrake = pilot.finisherNeedsBrake;
      sample.aiRecoveryDesiredPower01 = pilot.recoveryDesiredPower01;
      sample.aiApproachGateCount = pilot.approachGateCount;
      sample.aiApproachTargetKtas = pilot.approachTargetKtas;
      sample.aiFoxTwoRequestSequence = pilot.foxTwoRequestSequence;
      sample.aiRollCommand = pilot.rollCommand;
      sample.aiPitchCommand = pilot.pitchCommand;
      sample.aiThrottleUp = pilot.throttleUp;
      sample.aiThrottleDown = pilot.throttleDown;
      sample.aiAppliedRollCommand = pilot.appliedRollCommand;
      sample.aiAppliedPitchCommand = pilot.appliedPitchCommand;
      sample.aiAppliedLoadFactorG = pilot.appliedLoadFactorG;
      sample.aiLimitOverride = pilot.limitOverride;
      sample.aiFireCommand = pilot.fire === true;
      sample.aiFireGunSolutionRaw = pilot.gunSolutionRaw === true;
      sample.aiFireGunSolution = pilot.gunSolution === true;
      sample.aiFireDecisionTick = Number(pilot.gunDecisionTick);
      sample.aiFireDecisionRangeM = Number(pilot.gunDecisionRangeM);
      sample.aiFireDecisionClosureKts = Number(pilot.gunDecisionClosureKts);
      sample.aiFireDecisionInterlockClear =
        pilot.gunDecisionInterlockClear === true;
      sample.aiGunFireEligibleSamples = Number(pilot.gunFireEligibleSamples);
      sample.aiGunFireMaximumEligibleSamples = Number(
        sample.browserPilot?.gunFireMaximumEligibleSamples,
      );
      sample.aiGunFireCommandUpdates = Number(
        sample.browserPilot?.gunFireCommandUpdates,
      );
      sample.aiGunFireFirstCommandTick = Number(
        sample.browserPilot?.gunFireFirstCommandTick,
      );
      sample.aiOverrideMaximumLoadFactorG = pilot.overrideMaximumLoadFactorG;
      sample.valleyPresentationActive = firstRunValleyPresentation?.active === true;
      sample.valleyTriangleCount = Number(firstRunValleyPresentation?.triangleCount);
      sample.valleyDrawCount = Number(firstRunValleyPresentation?.drawCount);
      sample.valleyDedicatedMaterial =
        firstRunValleyPresentation?.dedicatedCanyonMaterial === true;
      if (mission === "first-run" && sample.weaponsCold) {
        const valleyProfile = firstRunValleyProfileFromState(sample.state);
        const centreEastM = valleyProfile
          ? firstRunValleyCenterEastM(valleyProfile, sample.zM)
          : null;
        sample.valleyProfileValid = valleyProfile !== null
          && Number.isFinite(centreEastM);
        sample.valleyFloorMarginM = sample.valleyProfileValid
          ? valleyProfile.floorHalfWidthM - Math.abs(sample.xM - centreEastM)
          : null;
        sample.valleyProgress01 = sample.valleyProfileValid
          ? clamp(
            (sample.zM - valleyProfile.entryNorthM)
              / (valleyProfile.popOutNorthM - valleyProfile.entryNorthM),
            0,
            1,
          )
          : null;
      }
      delete sample.state;
      samples.push(sample);
      if (sample.sessionPhase !== "ACTIVE" || sample.playerTerminal !== "FLYING") break;

      if (mission === "top-gun") openingTopGunKills ??= sample.killCount;
      if (mission === "top-gun"
          && Number(pilot.foxTwoRequestSequence) > observedFoxTwoRequestSequence) {
        observedFoxTwoRequestSequence = Number(pilot.foxTwoRequestSequence);
        await pressHarnessKey(page, "r");
      }
      if (mission === "top-gun"
          && sample.killCount >= finite(openingTopGunKills) + 2
          && sample.returnToBaseAvailable === true
          && sample.playerReturnToBaseActive !== true
          && Date.now() - topGunLastRtbRequestAtMs >= 500) {
        await pressHarnessKey(page, "o");
        topGunLastRtbRequestAtMs = Date.now();
        sample.aiRtbRequestIssued = true;
      }

      const phase = fixedWingAiEvidencePhase(sample, mission);
      if (phase !== previousPhase) {
        previousPhase = phase;
      }

      // Software WebGL readback can monopolise the page for minutes. Hardware evidence waits for
      // a real action state and for the Ready/pause surface to finish fading; the old first-sample
      // capture repeatedly saved a translucent Resume dialog and called it a fight screenshot.
      const phaseEvidenceName = `phase:${phase || "active"}`;
      if (hardware && !capturedEvidence.has(phaseEvidenceName)
          && fixedWingPhaseCaptureReady(sample, mission, phase)) {
        const presentationClear = await page.evaluate(() => {
          const ready = document.querySelector("#ready-screen");
          return !document.documentElement.classList.contains("run-paused")
            && ready?.classList.contains("visible") !== true
            && Number.parseFloat(getComputedStyle(ready).opacity) <= 0.01;
        });
        if (presentationClear && await captureScreenshot(
          page,
          `${outputDirectory}/${mission}-${phase || "active"}.png`,
          captureWarnings,
        )) capturedEvidence.add(phaseEvidenceName);
      }
      const firstRunEvidenceName = mission === "first-run" && sample.weaponsCold
        ? sample.valleyProgress01 >= 0.72 ? "canyon-deep"
          : sample.valleyProgress01 >= 0.44 ? "canyon-mid" : null
        : null;
      if (hardware && firstRunEvidenceName && !capturedEvidence.has(firstRunEvidenceName)) {
        const presentationClear = await page.evaluate(() => {
          const ready = document.querySelector("#ready-screen");
          return !document.documentElement.classList.contains("run-paused")
            && ready?.classList.contains("visible") !== true
            && Number.parseFloat(getComputedStyle(ready).opacity) <= 0.01;
        });
        if (presentationClear && await captureScreenshot(
          page,
          `${outputDirectory}/${mission}-${firstRunEvidenceName}.png`,
          captureWarnings,
        )) capturedEvidence.add(firstRunEvidenceName);
      }

      // Save the exact loaded portion of the replacement recovery. A generic fight screenshot
      // cannot distinguish a clean inverted split-S from the old long oblique hold that players
      // reasonably read as top-rudder flight.
      const splitSEvidence = mission === "f22"
        && sample.aiVerticalRecoveryPhase === "slice"
        && sample.aiVerticalRecoveryPullActive === true
        && sample.padlockPhase === "TRACK"
        && Math.abs(finite(sample.bankDeg)) >= 165
        && Math.abs(finite(sample.rollRateDps)) <= 15
        && finite(sample.actualG) >= 3
        && finite(sample.aoaDeg, Number.POSITIVE_INFINITY) < 15
        && finite(sample.calibratedSpeedKts, Number.NEGATIVE_INFINITY)
          >= finite(sample.cornerBandMinimumKias, Number.POSITIVE_INFINITY) - 10;
      if (hardware && splitSEvidence && !capturedEvidence.has("split-s")) {
        const presentationClear = await page.evaluate(() => {
          const ready = document.querySelector("#ready-screen");
          return !document.documentElement.classList.contains("run-paused")
            && ready?.classList.contains("visible") !== true
            && Number.parseFloat(getComputedStyle(ready).opacity) <= 0.01;
        });
        if (presentationClear && await captureScreenshot(
          page,
          `${outputDirectory}/${mission}-split-s.png`,
          captureWarnings,
        )) capturedEvidence.add("split-s");
      }

      const settledLoadedOverbankEvidence = mission === "f22"
        && isSettledLoadedOverbankSample(sample);
      if (!settledLoadedOverbankEvidence) {
        settledLoadedOverbankObservedS = 0;
        settledLoadedOverbankLastWallS = null;
      } else {
        const evidenceGapS = settledLoadedOverbankLastWallS === null
          ? 0 : sample.wallS - settledLoadedOverbankLastWallS;
        settledLoadedOverbankObservedS = evidenceGapS > 0 && evidenceGapS <= 1
          ? settledLoadedOverbankObservedS + Math.min(evidenceGapS, 0.2)
          : 0;
        settledLoadedOverbankLastWallS = sample.wallS;
      }
      const sustainedLoadedWallTurnGapS = sustainedLoadedWallTurnLastWallS === null
        ? null : sample.wallS - sustainedLoadedWallTurnLastWallS;
      const sustainedLoadedWallTurnContinuing = sustainedLoadedWallTurnGapS > 0
        && sustainedLoadedWallTurnGapS <= 0.25;
      const sustainedLoadedWallTurnEvidence = mission === "f22"
        && isSettledLoadedOverbankSample(sample, {
          minimumAbsBankDeg: sustainedLoadedWallTurnContinuing ? 74 : 75,
          maximumAbsBankDeg: 84,
          minimumBankInclusive: true,
          minimumLoadInclusive: true,
          maximumAbsGammaDeg: 45,
          excludeSafetyRecovery: true,
        });
      if (!sustainedLoadedWallTurnEvidence) {
        sustainedLoadedWallTurnObservedS = 0;
        sustainedLoadedWallTurnLastWallS = null;
      } else {
        sustainedLoadedWallTurnObservedS = sustainedLoadedWallTurnContinuing
          ? sustainedLoadedWallTurnObservedS
            + Math.min(sustainedLoadedWallTurnGapS, 0.2)
          : 0;
        sustainedLoadedWallTurnLastWallS = sample.wallS;
      }
      if (hardware && sustainedLoadedWallTurnObservedS >= 2
          && !capturedEvidence.has("loaded-wall-turn")) {
        const presentationClear = await page.evaluate(() => {
          const ready = document.querySelector("#ready-screen");
          return !document.documentElement.classList.contains("run-paused")
            && ready?.classList.contains("visible") !== true
            && Number.parseFloat(getComputedStyle(ready).opacity) <= 0.01;
        });
        if (presentationClear && await captureScreenshot(
          page,
          `${outputDirectory}/${mission}-loaded-wall-turn.png`,
          captureWarnings,
        )) capturedEvidence.add("loaded-wall-turn");
      }
      if (hardware && settledLoadedOverbankObservedS >= 0.75
          && !capturedEvidence.has("loaded-overbank")) {
        const presentationClear = await page.evaluate(() => {
          const ready = document.querySelector("#ready-screen");
          return !document.documentElement.classList.contains("run-paused")
            && ready?.classList.contains("visible") !== true
            && Number.parseFloat(getComputedStyle(ready).opacity) <= 0.01;
        });
        if (presentationClear && await captureScreenshot(
          page,
          `${outputDirectory}/${mission}-loaded-overbank.png`,
          captureWarnings,
        )) {
          capturedEvidence.add("loaded-overbank");
          const wasPadlocked = await page.evaluate(() =>
            document.querySelector('[data-pulse-key="KeyV"]')?.getAttribute("aria-pressed")
              === "true");
          if (wasPadlocked) {
            let forwardViewSelected = false;
            try {
              const requested = await page.evaluate(() =>
                globalThis.__gunsOnlyFixedWingBrowserPilot?.requestPadlockPulse?.() === true);
              if (!requested) throw new Error("browser pilot rejected live forward-view pulse");
              await page.waitForFunction(() =>
                document.querySelector('[data-pulse-key="KeyV"]')?.getAttribute("aria-pressed")
                  === "false", undefined, { timeout: 2_000 });
              forwardViewSelected = true;
              await page.waitForTimeout(100);
              if (await captureScreenshot(
                page,
                `${outputDirectory}/${mission}-loaded-overbank-forward.png`,
                captureWarnings,
              )) capturedEvidence.add("loaded-overbank-forward");
            } catch (error) {
              captureWarnings.push(
                `live forward-view capture: ${error?.message?.split("\n")[0] ?? error}`,
              );
            } finally {
              if (forwardViewSelected) {
                try {
                  const requested = await page.evaluate(() =>
                    globalThis.__gunsOnlyFixedWingBrowserPilot?.requestPadlockPulse?.() === true);
                  if (!requested) throw new Error("browser pilot rejected padlock restore pulse");
                  await page.waitForFunction(() =>
                    document.querySelector('[data-pulse-key="KeyV"]')
                      ?.getAttribute("aria-pressed") === "true",
                  undefined, { timeout: 2_000 });
                } catch (error) {
                  captureWarnings.push(
                    `live padlock restore: ${error?.message?.split("\n")[0] ?? error}`,
                  );
                }
              }
            }
          }
        }
      }

      const wholeSecond = Math.floor(sample.wallS);
      if (wholeSecond !== lastLogSecond && wholeSecond % 5 === 0) {
        lastLogSecond = wholeSecond;
        console.log(
          `[fixed-wing-ai] mission=${mission} t=${sample.wallS.toFixed(1)}s `
          + `phase=${phase} range=${sample.rangeM.toFixed(0)}m `
          + `alt=${sample.yM.toFixed(0)}m agl=${sample.radarAltitudeFt.toFixed(0)}ft `
          + `escape=${sample.aiTerrainRecoveryPhase} hits=${sample.hits}`,
        );
      }
      if (missionSatisfied(samples, mission)) break;
      // Evidence sampling is deliberately outside the browser-resident 20 Hz control loop. Keep
      // it eager when CDP is healthy, but never let a slow observer hold the physical controls.
      await page.waitForTimeout(Math.max(
        0,
        FIXED_WING_AI_SAMPLE_MS - (Date.now() - controlCycleStartedAt),
      ));
    }

    if (hardware && mission === "f22") {
      const wasPadlocked = await page.evaluate(() =>
        document.querySelector('[data-pulse-key="KeyV"]')?.getAttribute("aria-pressed")
          === "true");
      let forwardViewReady = !wasPadlocked;
      if (wasPadlocked) {
        try {
          const requested = await page.evaluate(() =>
            globalThis.__gunsOnlyFixedWingBrowserPilot?.requestPadlockPulse?.() === true);
          if (!requested) throw new Error("browser pilot rejected forward-view pulse");
          await page.waitForFunction(() =>
            document.querySelector('[data-pulse-key="KeyV"]')?.getAttribute("aria-pressed")
              === "false", undefined, { timeout: 2_000 });
          await page.waitForTimeout(250);
          forwardViewReady = true;
        } catch (error) {
          captureWarnings.push(
            `forward-view release: ${error?.message?.split("\n")[0] ?? error}`,
          );
        }
      }
      if (forwardViewReady) {
        await captureScreenshot(
          page,
          `${outputDirectory}/${mission}-forward.png`,
          captureWarnings,
        );
      }
    }
    await withPageWatchdog(
      page.evaluate(() => globalThis.__gunsOnlyFixedWingBrowserPilot?.stop?.()),
      "browser-resident pilot release",
      3_000,
    ).catch((error) => captureWarnings.push(error?.message ?? String(error)));
    const baseAssessment = assessFixedWingAiFlight(samples, {
      mission,
      readyMs,
      startLatencyMs,
      stagedRequestedThrottle: stagedThrottle.requested,
      stagedAppliedThrottle,
    });
    const failures = [
      ...baseAssessment.failures,
      ...errors.map((error) => `page: ${error}`),
    ];
    const assessment = Object.freeze({
      pass: failures.length === 0,
      failures: Object.freeze(failures),
      metrics: baseAssessment.metrics,
    });
    const result = { assessment, errors, captureWarnings, samples };
    await writeFile(
      `${outputDirectory}/${mission}-ai-flight.json`,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    await captureScreenshot(
      page,
      `${outputDirectory}/${mission}-ai-flight.png`,
      captureWarnings,
    );
    if (!assessment.pass) {
      throw new Error(`${mission} AI flight failed:\n- ${assessment.failures.join("\n- ")}`);
    }
    return result;
  } finally {
    await browser.close();
    await site.close();
  }
}

if (!IS_NODE_RUNTIME) {
  Object.defineProperty(globalThis, "__gunsOnlyFixedWingControllerModule", {
    configurable: true,
    value: Object.freeze({ installFixedWingBrowserPilot }),
  });
}

if (IS_NODE_RUNTIME && import.meta.url === `file://${runtimeProcess.argv[1]}`) {
  const mission = String(argvValue("mission", "f22"));
  const result = await runFixedWingAiFlight({
    wwwroot: runtimeProcess.env.GUNS_WWWROOT,
    mission,
    durationSeconds: Number(argvValue("seconds", Number.NaN)),
    hardware: argvValue("hardware", false) === true,
    outputDirectory: String(runtimeProcess.env.OUT ?? `/tmp/fixed-wing-ai-${mission}`),
  });
  console.log(JSON.stringify(result.assessment, null, 2));
}
