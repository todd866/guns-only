import {
  DEG_TO_RAD,
  clamp,
  finite,
  stepCriticalSpring,
} from "./presentation_math.js";

const TAU = Math.PI * 2;

export const DEFAULT_COCKPIT_MOTION_OPTIONS = Object.freeze({
  translationFrequencyHz: 7.5,
  rotationFrequencyHz: 10.5,
  reducedMotionScale: 0.12,
  motionScale: 1,
  maximumTranslationMetres: Object.freeze({ x: 0.018, y: 0.042, z: 0.052 }),
  maximumRotationRadians: Object.freeze({
    pitch: 1.45 * DEG_TO_RAD,
    yaw: 0.95 * DEG_TO_RAD,
    roll: 1.65 * DEG_TO_RAD,
  }),
});

function channel() {
  return { value: 0, velocity: 0 };
}

export function createCockpitMotionState() {
  return {
    translation: { x: channel(), y: channel(), z: channel() },
    rotation: { pitch: channel(), yaw: channel(), roll: channel() },
    target: {
      translation: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
    },
    recoilEnvelope: 0,
    trapEnvelope: 0,
    lastRoundsFired: null,
    lastArrestPhase: null,
    lastWire: null,
    lastTick: null,
    initialized: false,
  };
}

export function resetCockpitMotionState(state, snapshot = null) {
  for (const axis of Object.values(state.translation)) {
    axis.value = 0;
    axis.velocity = 0;
  }
  for (const axis of Object.values(state.rotation)) {
    axis.value = 0;
    axis.velocity = 0;
  }
  state.target.translation.x = 0;
  state.target.translation.y = 0;
  state.target.translation.z = 0;
  state.target.rotation.pitch = 0;
  state.target.rotation.yaw = 0;
  state.target.rotation.roll = 0;
  state.recoilEnvelope = 0;
  state.trapEnvelope = 0;
  state.lastRoundsFired = snapshot ? Math.max(0, finite(snapshot.rounds_fired)) : null;
  state.lastArrestPhase = snapshot ? String(snapshot.arrest_phase ?? "") : null;
  state.lastWire = snapshot ? Math.max(0, finite(snapshot.wire)) : null;
  state.lastTick = snapshot && Number.isFinite(Number(snapshot.tick)) ? Number(snapshot.tick) : null;
  state.initialized = snapshot !== null;
  return state;
}

function mergeOptions(options) {
  return {
    ...DEFAULT_COCKPIT_MOTION_OPTIONS,
    ...options,
    maximumTranslationMetres: {
      ...DEFAULT_COCKPIT_MOTION_OPTIONS.maximumTranslationMetres,
      ...options.maximumTranslationMetres,
    },
    maximumRotationRadians: {
      ...DEFAULT_COCKPIT_MOTION_OPTIONS.maximumRotationRadians,
      ...options.maximumRotationRadians,
    },
  };
}

function readFirstFinite(snapshot, names, fallback = 0) {
  for (const name of names) {
    const value = Number(snapshot?.[name]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function updateEventEnvelopes(state, snapshot, dt) {
  const roundsFired = Math.max(0, finite(snapshot?.rounds_fired));
  const tick = Number(snapshot?.tick);
  const tickRegressed = state.lastTick !== null && Number.isFinite(tick) && tick < state.lastTick;
  if (!state.initialized || tickRegressed) {
    state.lastRoundsFired = roundsFired;
    state.lastArrestPhase = String(snapshot?.arrest_phase ?? "");
    state.lastWire = Math.max(0, finite(snapshot?.wire));
    state.recoilEnvelope = 0;
    state.trapEnvelope = 0;
    state.initialized = true;
  } else {
    const shotDelta = roundsFired >= state.lastRoundsFired
      ? Math.min(12, roundsFired - state.lastRoundsFired)
      : 0;
    const explicitRecoil = clamp(readFirstFinite(snapshot,
      ["gun_recoil_01", "gun_recoil", "recoil_impulse", "recoil"], 0), 0, 1);
    state.recoilEnvelope = clamp(Math.max(
      state.recoilEnvelope * Math.exp(-dt * 18) + shotDelta * 0.22,
      explicitRecoil,
    ), 0, 1);

    const arrestPhase = String(snapshot?.arrest_phase ?? "");
    const wire = Math.max(0, finite(snapshot?.wire));
    const caughtNow = arrestPhase === "ARRESTED"
      && (state.lastArrestPhase !== "ARRESTED" || (wire > 0 && wire !== state.lastWire));
    const explicitTrap = clamp(readFirstFinite(snapshot,
      ["trap_impulse_01", "trap_impulse", "touchdown_impulse_01"], 0), 0, 1);
    state.trapEnvelope = clamp(Math.max(
      state.trapEnvelope * Math.exp(-dt * 5.2)
        + (caughtNow ? snapshot?.hard_trap === true ? 1 : 0.62 : 0),
      explicitTrap,
    ), 0, 1);
    state.lastArrestPhase = arrestPhase;
    state.lastWire = wire;
    state.lastRoundsFired = roundsFired;
  }
  if (Number.isFinite(tick)) state.lastTick = tick;
}

/**
 * Computes an aircraft-local eye displacement from one immutable simulation snapshot.
 *
 * Three camera convention is used: +X right, +Y up, and -Z forward. Angles are radians. The
 * returned object is newly allocated for diagnostics; the real-time controller below uses the
 * same values to step preallocated springs.
 */
function computeCockpitMotionTarget(snapshot, presentationState, config, result) {
  const g = clamp(readFirstFinite(snapshot, ["g_actual", "nz"], 1), -3, 10);
  const rollRate = clamp(readFirstFinite(snapshot, ["roll_rate_dps"], 0), -360, 360);
  const pitchRate = clamp(readFirstFinite(snapshot, ["pitch_rate_dps"], 0), -240, 240);
  const yawRate = clamp(readFirstFinite(snapshot, ["yaw_rate_dps"], 0), -180, 180);
  const buffetPitch = clamp(readFirstFinite(snapshot, ["buffet_pitch_deg"], 0), -4, 4);
  const buffetRoll = clamp(readFirstFinite(snapshot, ["buffet_roll_deg"], 0), -4, 4);
  const buffetYaw = clamp(readFirstFinite(snapshot, ["buffet_yaw_deg"], 0), -4, 4);
  const burble = clamp(readFirstFinite(snapshot, ["in_close_burble", "burble_01"], 0), 0, 1);
  const arrestDecel = clamp(Math.abs(readFirstFinite(snapshot, ["arrest_decel_g"], 0)), 0, 3);
  const snapshotTime = readFirstFinite(snapshot, ["t"], finite(snapshot?.tick) / 60);
  const burblePhase = snapshotTime * TAU;
  const trap = Math.max(presentationState.trapEnvelope, arrestDecel / 1.4);
  const recoil = presentationState.recoilEnvelope;

  const preferenceScale = config.reducedMotion === true
    ? clamp(finite(config.reducedMotionScale, 0.12), 0, 1)
    : 1;
  const scale = clamp(finite(config.motionScale, 1), 0, 2) * preferenceScale;
  const burbleX = Math.sin(burblePhase * 7.1 + 0.4) * burble;
  const burbleY = Math.sin(burblePhase * 9.7 + 1.3) * burble;
  const gDelta = g - 1;

  const { translation, rotation } = result;
  translation.x = (-yawRate * 0.000018 + burbleX * 0.0015) * scale;
  translation.y = (-gDelta * 0.0045 + pitchRate * 0.000018 + burbleY * 0.0018) * scale;
  translation.z = (-trap * 0.041 - recoil * 0.0045 - pitchRate * 0.000024) * scale;
  rotation.pitch = (-pitchRate * 0.0035 + buffetPitch * 0.34 - trap * 0.5
    + recoil * 0.16 + burbleY * 0.11) * DEG_TO_RAD * scale;
  rotation.yaw = (-yawRate * 0.003 + buffetYaw * 0.3 + burbleX * 0.09)
    * DEG_TO_RAD * scale;
  rotation.roll = (-rollRate * 0.0025 + buffetRoll * 0.34 + burbleX * 0.14
    + recoil * Math.sin(burblePhase * 17) * 0.08) * DEG_TO_RAD * scale;

  for (const axis of ["x", "y", "z"]) {
    const limit = Math.abs(finite(config.maximumTranslationMetres[axis], 0));
    translation[axis] = clamp(translation[axis], -limit, limit);
  }
  for (const axis of ["pitch", "yaw", "roll"]) {
    const limit = Math.abs(finite(config.maximumRotationRadians[axis], 0));
    rotation[axis] = clamp(rotation[axis], -limit, limit);
  }
  return result;
}

export function cockpitMotionTarget(snapshot, presentationState, options = {}, result = null) {
  return computeCockpitMotionTarget(snapshot, presentationState, mergeOptions(options), result ?? {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0, roll: 0 },
  });
}

/** Mutates only `presentationState`, never `snapshot`. */
export function stepCockpitMotionState(presentationState, snapshot, deltaSeconds, options = {}) {
  const config = mergeOptions(options);
  const dt = clamp(finite(deltaSeconds), 0, 0.1);
  updateEventEnvelopes(presentationState, snapshot, dt);
  const target = computeCockpitMotionTarget(snapshot, presentationState, config,
    presentationState.target);
  for (const axis of ["x", "y", "z"]) {
    stepCriticalSpring(presentationState.translation[axis], target.translation[axis], dt,
      config.translationFrequencyHz);
    const limit = Math.abs(finite(config.maximumTranslationMetres[axis], 0));
    const bounded = clamp(presentationState.translation[axis].value, -limit, limit);
    if (bounded !== presentationState.translation[axis].value) {
      presentationState.translation[axis].value = bounded;
      presentationState.translation[axis].velocity = 0;
    }
  }
  for (const axis of ["pitch", "yaw", "roll"]) {
    stepCriticalSpring(presentationState.rotation[axis], target.rotation[axis], dt,
      config.rotationFrequencyHz);
    const limit = Math.abs(finite(config.maximumRotationRadians[axis], 0));
    const bounded = clamp(presentationState.rotation[axis].value, -limit, limit);
    if (bounded !== presentationState.rotation[axis].value) {
      presentationState.rotation[axis].value = bounded;
      presentationState.rotation[axis].velocity = 0;
    }
  }
  return presentationState;
}

export function cockpitMotionSample(presentationState, result = null) {
  const sample = result ?? {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0, roll: 0 },
    recoilEnvelope: 0,
    trapEnvelope: 0,
  };
  sample.translation.x = presentationState.translation.x.value;
  sample.translation.y = presentationState.translation.y.value;
  sample.translation.z = presentationState.translation.z.value;
  sample.rotation.pitch = presentationState.rotation.pitch.value;
  sample.rotation.yaw = presentationState.rotation.yaw.value;
  sample.rotation.roll = presentationState.rotation.roll.value;
  sample.recoilEnvelope = presentationState.recoilEnvelope;
  sample.trapEnvelope = presentationState.trapEnvelope;
  return sample;
}

export function applyCockpitMotionToCamera(THREE, camera, sample, scratch = {}) {
  const localOffset = scratch.localOffset ?? new THREE.Vector3();
  const offsetQuaternion = scratch.offsetQuaternion ?? new THREE.Quaternion();
  const euler = scratch.euler ?? new THREE.Euler(0, 0, 0, "YXZ");
  localOffset.set(
    finite(sample?.translation?.x),
    finite(sample?.translation?.y),
    finite(sample?.translation?.z),
  ).applyQuaternion(camera.quaternion);
  camera.position.add(localOffset);
  euler.set(
    finite(sample?.rotation?.pitch),
    finite(sample?.rotation?.yaw),
    finite(sample?.rotation?.roll),
    "YXZ",
  );
  offsetQuaternion.setFromEuler(euler);
  camera.quaternion.multiply(offsetQuaternion).normalize();
  camera.updateMatrixWorld?.(true);
  return camera;
}

/**
 * Allocation-free Three.js adapter. The caller must establish the semantic cockpit camera pose
 * before each update, because this intentionally adds a presentation-only local displacement.
 */
export function createCockpitHeadPresentation(THREE, options = {}) {
  const state = createCockpitMotionState();
  const sample = cockpitMotionSample(state);
  const reducedMotionMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const scratch = {
    localOffset: new THREE.Vector3(),
    offsetQuaternion: new THREE.Quaternion(),
    euler: new THREE.Euler(0, 0, 0, "YXZ"),
  };
  return {
    state,
    reset(snapshot = null) {
      resetCockpitMotionState(state, snapshot);
    },
    update(camera, snapshot, deltaSeconds, frameOptions = {}) {
      const reducedMotion = frameOptions.reducedMotion
        ?? options.reducedMotion
        ?? reducedMotionMedia?.matches
        ?? false;
      stepCockpitMotionState(state, snapshot, deltaSeconds, {
        ...options,
        ...frameOptions,
        reducedMotion,
      });
      cockpitMotionSample(state, sample);
      applyCockpitMotionToCamera(THREE, camera, sample, scratch);
      return sample;
    },
  };
}
