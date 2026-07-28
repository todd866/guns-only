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
  mach: 0.34,
  true_airspeed_kts: 220,
  air_density_kg_m3: 0.75,
  altitude_m: 5_000,
});
const Q_HIGH = f22State({
  mach: 0.92,
  true_airspeed_kts: 600,
  air_density_kg_m3: 1,
  altitude_m: 1_300,
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
    label: "Dynamic pressure · fixed engine power",
    description: "Power and RPM stay at 80%; only the air-load state changes.",
    cues: Object.freeze([
      fixedCue("f22_q_low", "Low q · 220 kt", "Thin, slow air at unchanged engine power.", Q_LOW),
      fixedCue("f22_q_high", "High q · 600 kt", "Dense, fast air at unchanged engine power.", Q_HIGH),
      animatedCue(
        "f22_q_sweep",
        "Auto: low q ↔ high q",
        "Alternates the two fixed-power states every three seconds.",
        "dynamic-pressure",
        6,
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
const G_STATES = Object.freeze([G_ONE, G_THREE, G_SIX, G_NEGATIVE_TWO]);

function loopingProgress(elapsedSeconds, durationSeconds) {
  const elapsed = Number.isFinite(Number(elapsedSeconds)) ? Math.max(0, Number(elapsedSeconds)) : 0;
  return (elapsed % durationSeconds) / durationSeconds;
}

function stepState(states, elapsedSeconds, secondsPerStep) {
  const elapsed = Number.isFinite(Number(elapsedSeconds)) ? Math.max(0, Number(elapsedSeconds)) : 0;
  return states[Math.floor(elapsed / secondsPerStep) % states.length];
}

function trafficState({
  id,
  audioClass,
  elapsedSeconds,
  durationSeconds,
  farRangeM,
  nearRangeM,
  approachingClosureKts,
  recedingClosureKts,
}) {
  const progress = loopingProgress(elapsedSeconds, durationSeconds);
  const approaching = progress < 0.5;
  const leg = approaching ? progress * 2 : (progress - 0.5) * 2;
  const rangeM = approaching
    ? farRangeM + (nearRangeM - farRangeM) * leg
    : nearRangeM + (farRangeM - nearRangeM) * leg;
  return {
    ...F22_CONTROL,
    bandit_aircraft_id: id,
    bandit_audio_class: audioClass,
    range_m: rangeM,
    closure_kts: approaching ? approachingClosureKts : recedingClosureKts,
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
    return { ...stepState([Q_LOW, Q_HIGH], elapsedSeconds, 3) };
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
      farRangeM: 3_200,
      nearRangeM: 140,
      approachingClosureKts: 680,
      recedingClosureKts: -720,
    });
  }
  if (cue.animation === "bear-pass") {
    return trafficState({
      id: "aircraft.tu95.bear.reference.v1",
      audioClass: "heavy_contra_prop",
      elapsedSeconds,
      durationSeconds: cue.durationSeconds,
      farRangeM: 65_000,
      nearRangeM: 14_000,
      approachingClosureKts: 360,
      recedingClosureKts: -360,
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
