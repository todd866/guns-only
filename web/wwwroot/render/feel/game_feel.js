// Presentation-only combat feel. The simulation clock, flight model, and weapons stay untouched.
// Camera shake, FOV kick, speed lines, G vignette, and the kill flash are derived from the
// published snapshot and can be switched off without changing what the kernel integrates.

const SPEED_OF_SOUND_MPS = 340.29;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smootherstep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function read(snapshot, names, fallback = 0) {
  for (const name of names) {
    const number = Number(snapshot?.[name]);
    if (Number.isFinite(number)) return number;
  }
  return fallback;
}

export function createGameFeelState() {
  return {
    seeded: false,
    lastRoundsFired: 0,
    lastOpponentRounds: 0,
    lastHits: 0,
    lastOpponentAlive: true,
    shake: 0,
    nearMiss: 0,
    killFlash: 0,
    hitStop: 0,
    fovKickDeg: 0,
    vignette: 0,
    speedLines: 0,
    phase: 0,
  };
}

function opponentAlive(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return true;
  if (snapshot.opponent_alive === false || snapshot.bandit_alive === false) return false;
  if (snapshot.fight === "Splash") return false;
  const terminal = snapshot.opponent_terminal_state;
  if (typeof terminal === "string" && terminal && terminal !== "FLYING" && terminal !== "ALIVE")
    return false;
  return true;
}

function airspeedMps(snapshot) {
  const mps = read(snapshot, ["true_airspeed_mps", "airspeed_mps"], NaN);
  if (Number.isFinite(mps)) return Math.max(0, mps);
  const kts = read(snapshot, ["true_airspeed_kts", "indicated_airspeed_kts"], NaN);
  if (Number.isFinite(kts)) return Math.max(0, kts) * 0.514444;
  return 0;
}

/**
 * Advance presentation feel by one frame.
 *
 * `enabled` is the settings toggle. Reduced motion keeps a faint G vignette and drops shake,
 * speed lines, and the FOV kick. External cameras (chase, deck) receive a zero pose offset so
 * a replay does not pretend the lens is the pilot's head.
 */
export function stepGameFeel(state, snapshot, deltaSeconds, {
  enabled = true,
  reducedMotion = false,
  externalCamera = false,
} = {}) {
  const feel = state && typeof state === "object" ? state : createGameFeelState();
  const dt = clamp(finite(deltaSeconds), 0, 0.1);
  const rounds = Math.max(0, Math.trunc(read(snapshot, ["rounds_fired"])));
  const opponentRounds = Math.max(0, Math.trunc(read(snapshot, ["opponent_rounds_fired"])));
  const hits = Math.max(0, Math.trunc(read(snapshot, ["hits"])));
  const alive = opponentAlive(snapshot);
  const rangeM = Math.max(0, read(snapshot, ["range_m"], 8000));
  const mach = Math.max(0, read(snapshot, ["mach"], airspeedMps(snapshot) / SPEED_OF_SOUND_MPS));
  const g = read(snapshot, ["g_actual", "pilot_gz", "nz"], 1);
  const gunFiring = snapshot?.gun_firing === true && snapshot?.gun_overheat !== true;

  if (!feel.seeded) {
    feel.seeded = true;
    feel.lastRoundsFired = rounds;
    feel.lastOpponentRounds = opponentRounds;
    feel.lastHits = hits;
    feel.lastOpponentAlive = alive;
  }

  const shotDelta = rounds >= feel.lastRoundsFired
    ? Math.min(8, rounds - feel.lastRoundsFired) : 0;
  const incoming = opponentRounds >= feel.lastOpponentRounds
    ? Math.min(6, opponentRounds - feel.lastOpponentRounds) : 0;
  const ownshipHit = hits > feel.lastHits;
  const nearMiss = incoming > 0 && !ownshipHit && rangeM < 520 && rangeM > 8;
  const killed = feel.lastOpponentAlive === true && alive === false;

  feel.lastRoundsFired = rounds;
  feel.lastOpponentRounds = opponentRounds;
  feel.lastHits = hits;
  feel.lastOpponentAlive = alive;
  feel.phase += dt;

  const motion = enabled && !externalCamera && !reducedMotion ? 1 : 0;
  const vignetteAllowed = enabled && !externalCamera;

  feel.shake = clamp01(feel.shake * Math.exp(-dt * 9.5)
    + (gunFiring ? 0.34 : 0) * motion
    + shotDelta * 0.16 * motion
    + (nearMiss ? 0.72 : 0) * motion);
  feel.nearMiss = clamp01(feel.nearMiss * Math.exp(-dt * 3.2) + (nearMiss ? 1 : 0) * motion);
  feel.killFlash = clamp01(feel.killFlash * Math.exp(-dt * 4.6) + (killed ? 1 : 0) * (enabled && !externalCamera ? 1 : 0));
  // Visual hit-stop: a short lens hold. The simulation keeps integrating.
  feel.hitStop = clamp01(feel.hitStop * Math.exp(-dt * 7.5) + (killed ? 1 : 0) * motion);

  const machKick = smootherstep((mach - 0.45) / 0.7) * 5.5;
  const stopDip = feel.hitStop * 1.8;
  const kickTarget = motion * (machKick - stopDip);
  const kickRate = 1 - Math.exp(-dt * 6);
  feel.fovKickDeg += (kickTarget - feel.fovKickDeg) * (dt === 0 ? 1 : kickRate);

  const gStrain = smootherstep((Math.max(0, g) - 3.2) / 3.4);
  const vignetteTarget = vignetteAllowed ? gStrain * (reducedMotion ? 0.48 : 0.62) : 0;
  feel.vignette += (vignetteTarget - feel.vignette) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 5));

  const lineTarget = motion * smootherstep((mach - 0.82) / 0.38);
  feel.speedLines += (lineTarget - feel.speedLines) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 4));

  return Object.freeze({
    shake: feel.shake,
    nearMiss: feel.nearMiss,
    killFlash: feel.killFlash,
    hitStop: feel.hitStop,
    fovKickDeg: feel.fovKickDeg,
    vignette: feel.vignette,
    desaturate: clamp01(feel.vignette * 0.85 + feel.hitStop * 0.35),
    speedLines: feel.speedLines,
    shakeX: Math.sin(feel.phase * 47) * feel.shake * 0.011,
    shakeY: Math.cos(feel.phase * 39) * feel.shake * 0.008,
    shakeRoll: Math.sin(feel.phase * 33) * feel.shake * 0.0045,
    active: feel.shake > 0.01 || feel.killFlash > 0.02 || feel.vignette > 0.02
      || feel.speedLines > 0.02 || Math.abs(feel.fovKickDeg) > 0.05,
  });
}

export function applyGameFeelToCamera(THREE, camera, frame, baseFovDeg, scratch = {}) {
  if (!camera || !frame) return camera;
  const kick = finite(frame.fovKickDeg);
  const nextFov = clamp(finite(baseFovDeg, camera.fov) + kick, 48, 96);
  if (Math.abs(camera.fov - nextFov) > 0.01) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix?.();
  }
  if (!THREE) return camera;
  const offset = scratch.offset ?? new THREE.Vector3();
  const euler = scratch.euler ?? new THREE.Euler(0, 0, 0, "YXZ");
  const quaternion = scratch.quaternion ?? new THREE.Quaternion();
  offset.set(finite(frame.shakeX), finite(frame.shakeY), 0).applyQuaternion(camera.quaternion);
  camera.position.add(offset);
  euler.set(0, 0, finite(frame.shakeRoll), "YXZ");
  quaternion.setFromEuler(euler);
  camera.quaternion.multiply(quaternion).normalize();
  return camera;
}

export function paintGameFeel(root, frame) {
  if (!root) return;
  const shown = frame?.active === true;
  root.hidden = !shown;
  root.setAttribute?.("aria-hidden", "true");
  const style = root.style;
  if (!style?.setProperty) return;
  style.setProperty("--feel-shake", (frame?.shake ?? 0).toFixed(4));
  style.setProperty("--feel-vignette", (frame?.vignette ?? 0).toFixed(4));
  style.setProperty("--feel-desaturate", (frame?.desaturate ?? 0).toFixed(4));
  style.setProperty("--feel-lines", (frame?.speedLines ?? 0).toFixed(4));
  style.setProperty("--feel-flash", (frame?.killFlash ?? 0).toFixed(4));
  style.setProperty("--feel-hit-stop", (frame?.hitStop ?? 0).toFixed(4));
}
