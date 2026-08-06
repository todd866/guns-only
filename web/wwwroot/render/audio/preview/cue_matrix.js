const F22_ID = "aircraft.f22a.public-data-surrogate.v1";
const F22_AUDIO_ID = "audio.f22a.aged-twin-fan.v1";

const F22_CONTROL = Object.freeze({
  applied_throttle: 0.8,
  max_thrust_fraction: 1.35,
  engine_rpm_pct: 80,
  engine_spool_fraction: 0.8,
  mach: 0.62,
  true_airspeed_kts: 400,
  air_density_kg_m3: 0.92,
  altitude_m: 2_600,
  player_aircraft_id: F22_ID,
  audio_profile_id: F22_AUDIO_ID,
  engine_running: true,
  pilot_gz: 1,
  pilot_gz_valid: true,
  g_actual: 1,
  pilot_positive_onset_rate_g_per_second: 0,
  pilot_negative_onset_rate_g_per_second: 0,
  buffet: 0,
  buffet_pitch_deg: 0,
  buffet_yaw_deg: 0,
  speed_brake: 0,
  has_speed_brake: true,
  replay_external: false,
  replay_camera: "COCKPIT",
  audio_perspective: "cockpit",
  px: 0,
  py: 0,
  pz: 0,
  pfx: 1,
  pfy: 0,
  pfz: 0,
  plx: 0,
  ply: 1,
  plz: 0,
});

function f22State(overrides = {}) {
  return Object.freeze({ ...F22_CONTROL, ...overrides });
}

function fixedCue(id, label, description, state) {
  return Object.freeze({
    id,
    label,
    description,
    kind: "fixed",
    state,
  });
}

function animatedCue(id, label, description, animation, durationSeconds) {
  return Object.freeze({
    id,
    label,
    description,
    kind: "animated",
    animation,
    durationSeconds,
  });
}

const POWER_60 = f22State({
  applied_throttle: 0.6,
  engine_rpm_pct: 60,
  engine_spool_fraction: 0.6,
});
const POWER_80 = f22State();
const POWER_100 = f22State({
  applied_throttle: 1,
  engine_rpm_pct: 100,
  engine_spool_fraction: 1,
});
const POWER_AUGMENTED = f22State({
  applied_throttle: 1.35,
  engine_rpm_pct: 100,
  engine_spool_fraction: 1.35,
});

const Q_LOW = f22State({
  mach: 0.22,
  true_airspeed_kts: 145,
  air_density_kg_m3: 1.15,
  altitude_m: 150,
  gear_nose: 1,
  gear_left: 1,
  gear_right: 1,
  has_speed_brake: true,
  speed_brake: 0.35,
});
const Q_CRUISE = f22State({
  mach: 0.6,
  true_airspeed_kts: 400,
  air_density_kg_m3: 1.05,
  altitude_m: 2_000,
  gear_nose: 0,
  gear_left: 0,
  gear_right: 0,
});
const Q_HIGH = f22State({
  mach: 0.9,
  true_airspeed_kts: 595,
  air_density_kg_m3: 1,
  altitude_m: 1_300,
  gear_nose: 0,
  gear_left: 0,
  gear_right: 0,
});
const Q_DASH = f22State({
  mach: 1.15,
  true_airspeed_kts: 760,
  air_density_kg_m3: 1.05,
  altitude_m: 800,
  applied_throttle: 1.1,
  engine_rpm_pct: 100,
  engine_spool_fraction: 1.1,
  gear_nose: 0,
  gear_left: 0,
  gear_right: 0,
});

const ALTITUDE_Q_PA = 16_000;
function controlledAltitudeState({ altitudeM, density, speedOfSoundMps }) {
  const trueAirspeedMps = Math.sqrt(2 * ALTITUDE_Q_PA / density);
  return f22State({
    altitude_m: altitudeM,
    air_density_kg_m3: density,
    true_airspeed_mps: trueAirspeedMps,
    true_airspeed_kts: trueAirspeedMps * 1.9438444924406,
    mach: trueAirspeedMps / speedOfSoundMps,
  });
}

const ALTITUDE_5K_FT = controlledAltitudeState({
  altitudeM: 1_524,
  density: 1.055584657,
  speedOfSoundMps: 334.389,
});
const ALTITUDE_30K_FT = controlledAltitudeState({
  altitudeM: 9_144,
  density: 0.459040532,
  speedOfSoundMps: 303.171,
});
const ALTITUDE_55K_FT = controlledAltitudeState({
  altitudeM: 16_764,
  density: 0.147667759,
  speedOfSoundMps: 295.069,
});
// Deliberately an acoustic-limit reference, not an F-22 performance claim. At this ballistic apex
// q has collapsed, exposing the pressurized-cabin and structure floor.
const ALTITUDE_200K_FT = f22State({
  altitude_m: 60_960,
  air_density_kg_m3: 0.000274593,
  true_airspeed_mps: 620,
  true_airspeed_kts: 1_205.183584,
  mach: 1.96,
});

const G_ONE = f22State();
const G_THREE = f22State({
  pilot_gz: 3,
  g_actual: 3,
  pilot_positive_onset_rate_g_per_second: 1.5,
});
const G_SIX = f22State({
  pilot_gz: 6,
  g_actual: 6,
  pilot_positive_onset_rate_g_per_second: 3.5,
});
const G_NEGATIVE_TWO = f22State({
  pilot_gz: -2,
  g_actual: -2,
  pilot_negative_onset_rate_g_per_second: 2.8,
});

export const CUE_GROUPS = Object.freeze([
  Object.freeze({
    id: "power",
    label: "Engine power · fixed dynamic pressure",
    description: "The air state stays identical. Only commanded power, spool, and RPM change.",
    cues: Object.freeze([
      fixedCue("f22_power_60", "60% RPM", "Low-power F-22 cockpit reference.", POWER_60),
      fixedCue("f22_power_80", "80% RPM", "Mid-power F-22 cockpit reference.", POWER_80),
      fixedCue("f22_power_100", "100% RPM", "Full dry-power F-22 cockpit reference.", POWER_100),
      fixedCue(
        "f22_power_augmented",
        "Full augmentation",
        "Core RPM stays governed while delivered power and exhaust body rise.",
        POWER_AUGMENTED,
      ),
      animatedCue(
        "f22_power_sweep",
        "Auto: 60 → 80 → 100 → augmented",
        "Loops through the four fixed-q power states, 2.5 seconds each.",
        "power",
        10,
      ),
    ]),
  }),
  Object.freeze({
    id: "dynamic-pressure",
    label: "Dynamic pressure · approach through dash",
    description:
      "Threshold / cruise / high-subsonic hold mid power so air-load is isolated; dash adds power as a separate ear gate.",
    cues: Object.freeze([
      fixedCue(
        "f22_q_low",
        "Landing threshold · 145 kt · dirty",
        "Gear down, light board, mid power — sealed beds must stay quiet.",
        Q_LOW,
      ),
      fixedCue(
        "f22_q_cruise",
        "Cruise · M0.6",
        "Clean mid-q cruise at unchanged mid power.",
        Q_CRUISE,
      ),
      fixedCue(
        "f22_q_high",
        "High subsonic · M0.9",
        "Dense high-subsonic air at unchanged mid power.",
        Q_HIGH,
      ),
      fixedCue(
        "f22_q_dash",
        "Dash · M1.15",
        "Low-supersonic air-load with elevated power — rush/beds fully open.",
        Q_DASH,
      ),
      animatedCue(
        "f22_q_sweep",
        "Auto: threshold → cruise → M0.9 → dash",
        "Walks the envelope every three seconds.",
        "dynamic-pressure",
        12,
      ),
    ]),
  }),
  Object.freeze({
    id: "altitude",
    label: "Altitude / density · fixed power",
    description: "The first three references hold engine power and 16 kPa q constant; the 200k-ft acoustic limit lets q collapse.",
    cues: Object.freeze([
      fixedCue("f22_altitude_5k", "5,000 ft", "Dense-air cockpit reference at controlled q.", ALTITUDE_5K_FT),
      fixedCue("f22_altitude_30k", "30,000 ft", "Mid-altitude reference at the same power and q.", ALTITUDE_30K_FT),
      fixedCue("f22_altitude_55k", "55,000 ft", "Thin-air reference at the same power and q.", ALTITUDE_55K_FT),
      fixedCue(
        "f22_altitude_200k",
        "200,000 ft acoustic limit",
        "Near-vacuum ballistic reference; equipment and low structure should remain.",
        ALTITUDE_200K_FT,
      ),
      animatedCue(
        "f22_altitude_sweep",
        "Auto: 5k → 30k → 55k → 200k ft",
        "Loops through density references every three seconds.",
        "altitude",
        12,
      ),
    ]),
  }),
  Object.freeze({
    id: "g-load",
    label: "Pilot load · fixed power and dynamic pressure",
    description: "Engine and air state stay fixed so suit, harness, flex, and seal cues stand alone.",
    cues: Object.freeze([
      fixedCue("f22_g_1", "+1 G reference", "Level-flight acoustic reference.", G_ONE),
      fixedCue("f22_g_3", "+3 G", "Moderate positive load and onset.", G_THREE),
      fixedCue("f22_g_6", "+6 G", "High positive load and onset.", G_SIX),
      fixedCue("f22_g_negative_2", "−2 G", "Negative-G unload / restraint reference.", G_NEGATIVE_TWO),
      animatedCue(
        "f22_g_sweep",
        "Auto: +1 / +3 / +6 / −2 G",
        "Loops through all signed-G references, three seconds each.",
        "g-load",
        12,
      ),
    ]),
  }),
  Object.freeze({
    id: "traffic",
    label: "Other aircraft through the canopy",
    description: "Range and closure animate while ownship power, q, and G remain controlled.",
    cues: Object.freeze([
      animatedCue(
        "fighter_close_pass",
        "Close fighter pass",
        "Fighter closes to 140 m, crosses, then recedes behind the canopy.",
        "fighter-pass",
        8,
      ),
      animatedCue(
        "bear_distant_pass",
        "Distant Tu-95 / Bear pass",
        "Contra-rotating heavy turboprop remains kilometres away throughout.",
        "bear-pass",
        16,
      ),
    ]),
  }),
  Object.freeze({
    id: "perspective",
    label: "Ownship perspective",
    description: "Same 100% RPM and air state; only listener / camera perspective changes.",
    cues: Object.freeze([
      fixedCue("f22_cockpit_100", "F-22 cockpit", "Sealed cockpit at full dry power.", POWER_100),
      fixedCue("f22_external_100", "F-22 external chase", "Exterior listener at the same state.", f22State({
        ...POWER_100,
        replay_external: true,
        replay_camera: "CHASE",
        audio_perspective: "external",
      })),
    ]),
  }),
]);

export const CUE_PRESET_BY_ID = Object.freeze(Object.fromEntries(
  CUE_GROUPS.flatMap((group) => group.cues.map((cue) => [cue.id, cue])),
));

const POWER_STATES = Object.freeze([POWER_60, POWER_80, POWER_100, POWER_AUGMENTED]);
const ALTITUDE_STATES = Object.freeze([
  ALTITUDE_5K_FT,
  ALTITUDE_30K_FT,
  ALTITUDE_55K_FT,
  ALTITUDE_200K_FT,
]);
const G_STATES = Object.freeze([G_ONE, G_THREE, G_SIX, G_NEGATIVE_TWO]);

function loopingProgress(elapsedSeconds, durationSeconds) {
  const elapsed = Number.isFinite(Number(elapsedSeconds)) ? Math.max(0, Number(elapsedSeconds)) : 0;
  return (elapsed % durationSeconds) / durationSeconds;
}

function stepState(states, elapsedSeconds, secondsPerStep) {
  const elapsed = Number.isFinite(Number(elapsedSeconds)) ? Math.max(0, Number(elapsedSeconds)) : 0;
  return states[Math.floor(elapsed / secondsPerStep) % states.length];
}

/// One straight-line constant-velocity pass down the left side of the cockpit, integrated properly.
///
/// This used to hold range on a triangle wave and closure on a square wave that flipped sign in one
/// frame at the midpoint. That is not a pass — it is a step, and it hid the very Doppler sweep the
/// production graph is supposed to produce, because the radial velocity of a real crossing goes
/// smoothly through zero over the time it takes to fly a couple of miss distances.
///
/// The frame is ownship-relative: the listener sits at the origin with `pfx = 1` while the contact
/// moves, which is exactly how every consumer reads these fields (they only ever use
/// `contact - player`). The ownship `true_airspeed_kts: 400` in `F22_CONTROL` is therefore part of
/// the closure, not separate from it: at `closingSpeedKts: 700` the merge is a 400 kt ownship and a
/// 300 kt contact, which is what the Doppler split will charge to each of them.
///
/// Geometry: the contact closes along the ownship fore/aft axis at `closingSpeedKts`, offset
/// laterally by `missDistanceM`. With s = v t measured from closest approach,
///   range(t)   = hypot(v t, d)
///   closure(t) = -d(range)/dt = -v^2 t / range(t)
/// which is positive (closing) before the crossing and negative after it, with the crossing rate
/// set by the geometry rather than by an author.
function trafficState({
  id,
  audioClass,
  elapsedSeconds,
  durationSeconds,
  missDistanceM,
  closingSpeedKts,
  timeLapse = 1,
}) {
  const progress = loopingProgress(elapsedSeconds, durationSeconds);
  const speedMps = closingSpeedKts * 0.514444;
  // Centre the crossing at 55% of the cue so the approach is heard in full before it happens.
  // `timeLapse` scales the simulated clock only: range and closure still come from one consistent
  // geometry, so a transit that genuinely takes minutes can be auditioned in seconds without the
  // fixture lying about the relationship between them.
  const t = (progress - 0.55) * durationSeconds * timeLapse;
  const alongM = -speedMps * t;
  const rangeM = Math.hypot(alongM, missDistanceM);
  const closureKts = (-(speedMps * speedMps) * t / Math.max(1, rangeM)) / 0.514444;
  return {
    ...F22_CONTROL,
    bandit_aircraft_id: id,
    bandit_audio_class: audioClass,
    range_m: rangeM,
    closure_kts: closureKts,
    bx: alongM,
    by: 0,
    bz: missDistanceM,
    // The contact is flying the reciprocal of the ownship forward axis, so it presents its nose on
    // the way in and its tailpipes on the way out. This is what makes the two halves of a pass
    // sound different, so the lab must publish it.
    bfx: -1,
    bfy: 0,
    bfz: 0,
    cue_pass_progress_01: progress,
  };
}

/// Return the flat snapshot to feed the production audio update functions at `elapsedSeconds`.
export function cueStateAt(cueOrId, elapsedSeconds = 0) {
  const cue = typeof cueOrId === "string" ? CUE_PRESET_BY_ID[cueOrId] : cueOrId;
  if (!cue) return { ...F22_CONTROL };
  if (cue.kind === "fixed") return { ...cue.state };

  if (cue.animation === "power") {
    return { ...stepState(POWER_STATES, elapsedSeconds, 2.5) };
  }
  if (cue.animation === "dynamic-pressure") {
    return { ...stepState([Q_LOW, Q_CRUISE, Q_HIGH, Q_DASH], elapsedSeconds, 3) };
  }
  if (cue.animation === "altitude") {
    return { ...stepState(ALTITUDE_STATES, elapsedSeconds, 3) };
  }
  if (cue.animation === "g-load") {
    return { ...stepState(G_STATES, elapsedSeconds, 3) };
  }
  if (cue.animation === "fighter-pass") {
    return trafficState({
      id: "aircraft.fighter.generic.public-data-surrogate.v1",
      audioClass: "fighter_jet",
      elapsedSeconds,
      durationSeconds: cue.durationSeconds,
      missDistanceM: 140,
      closingSpeedKts: 700,
    });
  }
  if (cue.animation === "bear-pass") {
    return trafficState({
      id: "aircraft.tu95.bear.reference.v1",
      audioClass: "heavy_contra_prop",
      elapsedSeconds,
      durationSeconds: cue.durationSeconds,
      missDistanceM: 14_000,
      closingSpeedKts: 360,
      // A 360 kt aircraft passing 14 km abeam takes minutes to develop; 16x compresses that into
      // an auditionable cue without letting range and closure disagree with each other.
      timeLapse: 16,
    });
  }
  return { ...F22_CONTROL };
}

export function dynamicPressurePa(state) {
  const speedMps = Math.max(0, Number(state?.true_airspeed_mps)
    || Number(state?.true_airspeed_kts || 0) * 0.514444);
  const density = Math.max(0, Number(state?.air_density_kg_m3) || 0);
  return 0.5 * density * speedMps * speedMps;
}
