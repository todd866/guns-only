// Door gunner: aim inside the door arc, soft lock-on, balloon lob preview.
// Pure logic; the view reads the state, the session steps it. The door is on
// the chopper's RIGHT side, so the arc is centred a quarter turn starboard of
// the nose. All yaw/pitch here are RELATIVE to the chopper heading.

import {faceIndex, tvStick} from "../render/split/pad_flight.mjs";

export const DOOR = Object.freeze({
  yawCenter: Math.PI / 2, // starboard
  yawHalf: 1.05,          // ±60° of swing
  pitchMin: -0.85,        // down toward the lawn
  pitchMax: 0.35,
});

export const AIM = Object.freeze({
  maxRate: 2.6,     // rad/s at full stick
  accel: 9,         // how fast the swing picks up (gentle, not instant)
  zoomRate: 0.45,   // rate multiplier while zoomed
  zoomFov: 0.45,    // fraction of normal fov
});

export const LOCK = Object.freeze({cone: 0.38, range: 60, blend: 0.8});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createGunner() {
  return {
    yaw: DOOR.yawCenter,
    pitch: -0.25,
    vyaw: 0,
    vpitch: 0,
    zoom: false,
    lockId: null,
    shots: 0,
    hits: 0,
  };
}

/** stick = {x, y} in -1..1 (already deadzoned); y positive pulls the aim up. */
export function stepGunnerAim(gunner, stick, dt, zoomHeld = false) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  gunner.zoom = zoomHeld === true;
  const rate = AIM.maxRate * (gunner.zoom ? AIM.zoomRate : 1);
  const k = 1 - Math.exp(-AIM.accel * step);
  gunner.vyaw += ((Number(stick?.x) || 0) * rate - gunner.vyaw) * k;
  gunner.vpitch += ((Number(stick?.y) || 0) * rate - gunner.vpitch) * k;
  gunner.yaw = clamp(gunner.yaw + gunner.vyaw * step, DOOR.yawCenter - DOOR.yawHalf, DOOR.yawCenter + DOOR.yawHalf);
  gunner.pitch = clamp(gunner.pitch + gunner.vpitch * step, DOOR.pitchMin, DOOR.pitchMax);
  if (gunner.yaw === DOOR.yawCenter - DOOR.yawHalf || gunner.yaw === DOOR.yawCenter + DOOR.yawHalf) gunner.vyaw = 0;
  if (gunner.pitch === DOOR.pitchMin || gunner.pitch === DOOR.pitchMax) gunner.vpitch = 0;
  return gunner;
}

/** World-space unit aim vector for a chopper heading and the gunner's relative aim. */
export function gunnerDirection(heading, gunner) {
  const yaw = (Number(heading) || 0) + gunner.yaw;
  const cp = Math.cos(gunner.pitch);
  return {x: Math.sin(yaw) * cp, y: Math.sin(gunner.pitch), z: Math.cos(yaw) * cp};
}

/**
 * Soft lock: the target nearest the reticle (angle first, distance second)
 * inside the cone. Returns {target, aim} — aim already blended toward the
 * lock so shots snap without the reticle jumping.
 */
export function pickLock(origin, dir, targets, opts = LOCK) {
  const cone = opts.cone ?? LOCK.cone;
  const range = opts.range ?? LOCK.range;
  const blend = opts.blend ?? LOCK.blend;
  let best = null;
  let bestScore = Infinity;
  let bestAim = null;
  for (const t of targets ?? []) {
    if (!t || t.state === "popped") continue;
    const dx = t.x - origin.x, dy = (t.y ?? 0) - origin.y, dz = t.z - origin.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1 || dist > range) continue;
    const aim = {x: dx / dist, y: dy / dist, z: dz / dist};
    const dot = clamp(aim.x * dir.x + aim.y * dir.y + aim.z * dir.z, -1, 1);
    const angle = Math.acos(dot);
    if (angle > cone) continue;
    const score = angle * 100 + dist * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = t;
      bestAim = aim;
    }
  }
  if (!best) return {target: null, aim: dir};
  const m = {
    x: dir.x * (1 - blend) + bestAim.x * blend,
    y: dir.y * (1 - blend) + bestAim.y * blend,
    z: dir.z * (1 - blend) + bestAim.z * blend,
  };
  const len = Math.hypot(m.x, m.y, m.z) || 1;
  return {target: best, aim: {x: m.x / len, y: m.y / len, z: m.z / len}};
}

/** Balloon lob preview: points along the arc until it meets the ground (y=0). */
export function lobArc(origin, dir, speed = 16, gravity = 9, step = 0.12, maxSteps = 30) {
  const pts = [];
  let {x, y, z} = origin;
  let vx = dir.x * speed, vy = dir.y * speed, vz = dir.z * speed;
  for (let i = 0; i < maxSteps; i += 1) {
    vy -= gravity * step;
    x += vx * step; y += vy * step; z += vz * step;
    pts.push({x, y: Math.max(0, y), z});
    if (y <= 0) break;
  }
  return pts;
}

/**
 * Is a world direction inside the door arc for this heading? Returns the
 * signed yaw error (0 when inside): the pilot marker uses it to say which way
 * to bank/pedal. Positive error = target is further clockwise than the arc.
 */
export function doorArcError(heading, worldDir) {
  const want = Math.atan2(worldDir.x, worldDir.z);
  let rel = want - (Number(heading) || 0) - DOOR.yawCenter;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  if (Math.abs(rel) <= DOOR.yawHalf) return 0;
  return rel - Math.sign(rel) * DOOR.yawHalf;
}

/**
 * Angle for the small "pilot is heading this way" arrow in the gunner's half:
 * the chopper's nose relative to where the gunner is looking.
 */
export function headingArrowAngle(gunner) {
  const rel = -gunner.yaw;
  return ((rel + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/**
 * Gunner pad read: left stick aims (y up = aim up), printed A darts, printed B
 * lobs a balloon, RB zooms. Same TV deadzone family as the flight pad.
 */
export function readGunnerPad(pad, prev = {}) {
  if (!pad || pad.connected === false) {
    return {connected: false, x: 0, y: 0, dartDown: false, balloonDown: false, zoom: false,
      startDown: false, dartEdge: false, balloonEdge: false, startEdge: false, touched: false};
  }
  const id = String(pad.id || "");
  const value = (i) => {
    const b = pad.buttons?.[i];
    if (!b) return 0;
    return Math.max(b.pressed === true ? 1 : 0, Number(b.value) || 0);
  };
  const dx = (value(15) > 0.5 ? 1 : 0) - (value(14) > 0.5 ? 1 : 0);
  const dy = (value(12) > 0.5 ? 1 : 0) - (value(13) > 0.5 ? 1 : 0);
  const x = tvStick(pad.axes?.[0]) || dx;
  const y = -(tvStick(pad.axes?.[1]) || 0) || dy;
  const dartDown = value(faceIndex(id, "A")) > 0.5;
  const balloonDown = value(faceIndex(id, "B")) > 0.5;
  const startDown = value(9) > 0.5;
  return {
    connected: true,
    x, y,
    dartDown,
    balloonDown,
    zoom: value(5) > 0.5,
    startDown,
    dartEdge: dartDown && prev.dartDown !== true,
    balloonEdge: balloonDown && prev.balloonDown !== true,
    startEdge: startDown && prev.startDown !== true,
    touched: Math.abs(x) + Math.abs(y) > 0.1 || dartDown || balloonDown || startDown,
  };
}
