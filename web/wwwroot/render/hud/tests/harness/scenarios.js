// Deterministic HUD visual-test scenarios.
//
// Every scenario is a FULLY FIXED synthetic frame description: attitude, bandit geometry and the
// flat state snapshot are all constants, and the harness renders with now=0 and a fixed dt, so a
// given build of hud.js always produces byte-identical strokes. No Date.now, no randomness.
//
// The geometry vocabulary is body-relative: bandit/lead directions are azimuth (deg, right
// positive) and elevation (deg, up positive) from the ownship nose, at a range in metres. The
// harness (harness.js) turns these into world vectors + a real PerspectiveCamera exactly the way
// app.js does, so hud.js sees the same frame contract production feeds it.

// A quiet, healthy F-86-ish fight snapshot. Scenarios override only what they are about.
const BASE_STATE = {
  player_entity_id: "hud-harness-player",
  bandit_entity_id: "hud-harness-bandit",
  mode: "FREE",
  carrier: false,
  fight: "Engaged",
  bandit_alive: true,
  gun_solution: false,
  lead_valid: false,
  target_wingspan_m: 11.3,
  gun_muzzle_velocity_mps: 870,
  gun_max_flight_s: 1.75,
  ammo: 640,
  hits: 0,
  kill_count: 0,
  aoa_deg: 3.4,
  beta_deg: 0,
  roll_rate_dps: 0,
  pitch_rate_dps: 0,
  yaw_rate_dps: 0,
  g_actual: 1.0,
  g_hardmax: 9,
  sustained: 5.4,
  tier: 1,
  indicated_airspeed_kts: 420,
  true_airspeed_kts: 452,
  ground_speed_kts: 438,
  corner_speed_kias: 335,
  stall_speed_kias: 112,
  accelerated_stall_speed_kias: 118,
  vertical_speed_fpm: 0,
  throttle: 0.82,
  engine_spool_fraction: 0.8,
  has_afterburner: false,
  fuel_lb: 1900,
  fuel_capacity_lb: 2826,
  fuel_bingo_lb: 800,
  fuel_flow_lb_min: 41,
  fuel_minutes_to_bingo: 26,
  pilot_conscious: true,
  auto_gcas_available: true,
  buffet: false,
  closure_kts: 85,
};

// Shared "canonical funnel" geometry. A funnel scenario with a VALID solution places the bandit
// ON the emitted ballistic locus at its range (bandit: { onTrajectory: true }): SHOOT means the
// bullets genuinely arrive where the target is, so the geometry and the state can never disagree.
// Tracking pitch rates are the realistic ones for the declared load factor (q ~ (n-1)*g/V at 1g
// wings-level, n*g/V in the lift plane of a hard turn): the bullets-in-the-air locus spreads with
// own-ship rotation exactly as a real EEGS funnel does.
const FUNNEL_PLAYER = { headingDeg: 5, pitchDeg: 0, bankDeg: 0, altFt: 8200 };

export const SCENARIOS = [
  {
    name: "funnel-level-mid",
    about: "Wings-level 3g tracking pull, bandit on the ballistic locus at 450 m, valid lead + gun solution: the canonical wingspan-ranging funnel with SHOOT cue, bandit between the rails.",
    player: FUNNEL_PLAYER,
    bandit: { onTrajectory: true, rangeM: 450 },
    lead: null,
    state: {
      lead_valid: true, gun_solution: true, range_m: 450, closure_kts: 95,
      g_actual: 3.0, aoa_deg: 6.0, pitch_rate_dps: 4.8,
    },
  },
  {
    name: "funnel-banked-60L",
    about: "bank_deg = -60 with a 4.6g pull: the funnel must follow the projected ballistic locus (lagging into the turn), not rotate as a screen decal.",
    player: { ...FUNNEL_PLAYER, bankDeg: -60 },
    bandit: { onTrajectory: true, rangeM: 450 },
    lead: null,
    state: {
      lead_valid: true, gun_solution: true, range_m: 450, bank_deg: -60,
      g_actual: 4.6, aoa_deg: 8.5, pitch_rate_dps: 10.8,
    },
  },
  {
    name: "funnel-banked-60R",
    about: "bank_deg = +60, same pull: the funnel must sweep the opposite way from 60L, by construction of the projection.",
    player: { ...FUNNEL_PLAYER, bankDeg: 60 },
    bandit: { onTrajectory: true, rangeM: 450 },
    lead: null,
    state: {
      lead_valid: true, gun_solution: true, range_m: 450, bank_deg: 60,
      g_actual: 4.6, aoa_deg: 8.5, pitch_rate_dps: 10.8,
    },
  },
  {
    name: "funnel-banked-60L-pulling",
    about: "bank -60 with a full 5g pull: the bullets-in-the-air locus is long and visibly curved (rotation lag + gravity droop), and the bandit at 500 m sits between the one-wingspan rails.",
    player: { ...FUNNEL_PLAYER, bankDeg: -60 },
    bandit: { onTrajectory: true, rangeM: 500 },
    lead: null,
    state: {
      lead_valid: true, gun_solution: true, range_m: 500, bank_deg: -60,
      g_actual: 5.0, aoa_deg: 9.5, pitch_rate_dps: 12.0, closure_kts: 110,
    },
  },
  {
    name: "funnel-near-edge",
    about: "Bandit on the locus at ~170 m, just inside the 150 m tracking floor: target sits near the wide funnel mouth.",
    player: FUNNEL_PLAYER,
    bandit: { onTrajectory: true, rangeM: 170 },
    lead: null,
    state: {
      lead_valid: true, gun_solution: true, range_m: 170, closure_kts: 140,
      g_actual: 2.0, aoa_deg: 4.6, pitch_rate_dps: 2.4,
    },
  },
  {
    name: "funnel-far-edge",
    about: "Bandit on the locus at ~780 m, just inside the 783 m effective ceiling: target pinches into the narrow funnel throat.",
    player: FUNNEL_PLAYER,
    bandit: { onTrajectory: true, rangeM: 780 },
    lead: null,
    state: {
      lead_valid: true, gun_solution: true, range_m: 780, closure_kts: 60,
      g_actual: 2.0, aoa_deg: 4.6, pitch_rate_dps: 2.4,
    },
  },
  {
    name: "funnel-out-of-envelope",
    about: "Bandit at ~1200 m, outside the effective gun envelope: the funnel must NOT draw (gun cross and lead cue only).",
    player: FUNNEL_PLAYER,
    bandit: { azimuthDeg: 0, elevationDeg: 2, rangeM: 1200 },
    lead: { azimuthDeg: -1.5, elevationDeg: 2.5, rangeM: 1200 },
    state: { lead_valid: true, gun_solution: false, range_m: 1200, closure_kts: 40 },
  },
  {
    name: "funnel-no-solution",
    about: "lead_valid = false at 420 m: a real sight cages — no funnel, no pipper, just the boresight gun cross.",
    player: FUNNEL_PLAYER,
    bandit: { azimuthDeg: 4, elevationDeg: 3, rangeM: 420 },
    lead: null,
    state: { lead_valid: false, gun_solution: false, range_m: 420 },
  },
  {
    name: "padlock-bandit-right-high",
    about: "Padlock slaved to a bandit 55° right / 18° high: amber chevrons sweep from the green aircraft/lift index into the physical lift-plane gate.",
    player: { headingDeg: 40, pitchDeg: 4, bankDeg: 15, altFt: 9500 },
    bandit: { azimuthDeg: 55, elevationDeg: 18, rangeM: 620 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 620, closure_kts: 30 },
  },
  {
    name: "padlock-bandit-left-low",
    about: "Padlock slaved to a bandit 70° left / 14° low: roll chevrons sweep the opposite way while the lift index remains referenced against the horizon.",
    player: { headingDeg: 220, pitchDeg: 2, bankDeg: -10, altFt: 7000 },
    bandit: { azimuthDeg: -70, elevationDeg: -14, rangeM: 750 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 750, closure_kts: 45 },
  },
  {
    name: "padlock-bandit-on-lift",
    about: "Padlock slaved high with the lift vector already on the target: the amber roll arc yields to green outward pull-flow chevrons.",
    player: { headingDeg: 90, pitchDeg: 2, bankDeg: 0, altFt: 9000 },
    bandit: { azimuthDeg: 0, elevationDeg: 35, rangeM: 580 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 580, closure_kts: 20 },
  },
  {
    name: "padlock-bandit-near-offset",
    about: "A just-off-axis padlock: the compact physical roll director must remain distinct from the nearby target box.",
    player: { headingDeg: 20, pitchDeg: 1, bankDeg: 0, altFt: 8500 },
    bandit: { azimuthDeg: 15, elevationDeg: 9, rangeM: 650 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 650, closure_kts: 15 },
  },
  {
    name: "padlock-bandit-deep-aft",
    about: "A target 179° aft / 10° high is already within the physical lift plane: it must show captured pull flow, never an invented 80–90° roll.",
    player: { headingDeg: 310, pitchDeg: 0, bankDeg: 0, altFt: 10000 },
    bandit: { azimuthDeg: 179, elevationDeg: 10, rangeM: 700 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 700, closure_kts: -80 },
  },
  {
    name: "padlock-bandit-dead-six",
    about: "At exact six the roll plane is non-unique: retain the current plane and show neutral green pull flow rather than inventing a left/right roll.",
    player: { headingDeg: 45, pitchDeg: 0, bankDeg: 30, altFt: 10000 },
    bandit: { azimuthDeg: 180, elevationDeg: 0, rangeM: 720 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 720, closure_kts: -100 },
  },
  {
    name: "padlock-roll-servo-lag",
    about: "After first acquisition, ordinary camera-servo lag during a roll says CAMERA SETTLING while the physical director remains live.",
    player: { headingDeg: 40, pitchDeg: 4, bankDeg: 45, altFt: 9500 },
    bandit: { azimuthDeg: 55, elevationDeg: 18, rangeM: 620 },
    lead: null,
    view: {
      padlock: true,
      padlockPhase: "ACQUIRE",
      primeTrack: true,
      sensor: "auto",
    },
    state: { range_m: 620, closure_kts: 30 },
  },
  {
    name: "padlock-bandit-behind",
    about: "Manual slew looking forward with the bandit at deep six: bandit is behind the sensor, so the edge caret + clock label must point at it.",
    player: { headingDeg: 120, pitchDeg: 0, bankDeg: 0, altFt: 8000 },
    bandit: { azimuthDeg: 172, elevationDeg: -6, rangeM: 900 },
    lead: null,
    view: {
      padlock: true,
      padlockPhase: "SLEW",
      manualLookActive: true,
      sensor: { yawDeg: 0, pitchDeg: 0 },
    },
    state: { range_m: 900, closure_kts: -120 },
  },
  {
    name: "padlock-ground-warning",
    about: "Padlocked, nose-low and below 2000 ft radar with a hard sink: red horizon, GROUND · PULL UP, and the central GCAS PULL UP warning.",
    player: { headingDeg: 180, pitchDeg: -12, bankDeg: 25, altFt: 950 },
    bandit: { azimuthDeg: 65, elevationDeg: 8, rangeM: 700 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: {
      range_m: 700,
      alt_ft: 950,
      radar_alt_ft: 900,
      vertical_speed_fpm: -3800,
      auto_gcas_warning: true,
      g_actual: 2.1,
    },
  },
  {
    name: "padlock-inverted-135",
    about: "bank_deg = 135 (past inverted) while padlocked: horizon line, ground-side hatching, sky tick and lift vector must stay coherent.",
    player: { headingDeg: 300, pitchDeg: -8, bankDeg: 135, altFt: 11000 },
    bandit: { azimuthDeg: 40, elevationDeg: 12, rangeM: 600 },
    lead: null,
    view: { padlock: true, padlockPhase: "TRACK", sensor: "auto" },
    state: { range_m: 600, bank_deg: 135, g_actual: 3.2 },
  },
  {
    name: "forward-level",
    about: "Baseline forward HUD, no padlock: pitch ladder, tapes, heading, G/power/fuel, bandit box at 950 m, caged sight.",
    player: { headingDeg: 5, pitchDeg: 0, bankDeg: 0, altFt: 8000 },
    bandit: { azimuthDeg: 3, elevationDeg: 1, rangeM: 950 },
    lead: null,
    state: { range_m: 950 },
  },
  {
    name: "vs-extreme",
    about: "vertical_speed_fpm = 19700 in a steep zoom: the V/S readout must show the capped (readable) value, not the raw five-figure spike.",
    player: { headingDeg: 90, pitchDeg: 32, bankDeg: 0, altFt: 12500 },
    bandit: { azimuthDeg: 0, elevationDeg: 0, rangeM: 2500 },
    lead: null,
    state: {
      range_m: 2500,
      alt_ft: 12500,
      radar_alt_ft: 12500,
      vertical_speed_fpm: 19700,
      indicated_airspeed_kts: 300,
      ground_speed_kts: 260,
      g_actual: 1.4,
    },
  },
];

export function scenarioByName(name) {
  return SCENARIOS.find((scenario) => scenario.name === name) ?? null;
}

// The flat snapshot hud.js reads. Attitude/altitude fields are derived from the geometry so the
// canvas symbology (state-driven) and the projected world (camera-driven) can never disagree.
export function buildScenarioState(scenario) {
  const player = scenario.player;
  return {
    ...BASE_STATE,
    heading_deg: player.headingDeg,
    pitch_deg: player.pitchDeg,
    bank_deg: player.bankDeg,
    alt_ft: player.altFt,
    radar_alt_ft: player.altFt,
    range_m: scenario.bandit.rangeM,
    ...scenario.state,
  };
}
