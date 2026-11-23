// One aeroplane for every JS flight surface (owner, 6 Nov 2026: "we need to
// rethink those flight controls" — "it was very not-like-an-airplane").
// Pure functions, no renderer, no DOM. Aviation signs throughout:
//   pitch+  = pull, nose up        roll+ = right wing down
//   rudder+ = nose right           lever = throttle 0..1
// The nose points where you go: velocity chases the nose with a lag set by
// lift, so a pull is felt before the path bends. Bank to turn: the turn rate
// is the coordinated g·tanφ/V (auto-rudder; the pedals only slip the nose).
// Energy matters: climbing bleeds speed, diving buys it back, and a hard turn
// (induced drag) bleeds both. Below Vs the wing stalls: controls go mushy and
// the nose sags until speed returns — gentle, no spin. There is no hover and
// no strafe: a plane with no airspeed is falling.
//
// Params are per airframe ON PURPOSE (AGENTS.md §5): never tune these shared
// functions against one aircraft; pass a params object instead.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Default airframe: the backyard toy scale. Callers pass their own. */
export const PLANE = Object.freeze({
  g: 9.8,
  vs: 6.5, // stall speed, m/s
  vmax: 19, // level top speed at full lever
  thrust: 8.5, // m/s² at lever 1
  induced: 60, // induced-drag scale: a_i = induced·(n²−1)/v²
  rollRate: 2.6, // rad/s at full stick
  pitchRate: 1.5,
  maxBank: 1.2,
  maxPitch: 0.95,
  align: 2.6, // 1/s: how fast the path chases the nose at flying speed
  rudderYaw: 0.6, // rad/s of slip at full pedal
  stallSag: 1.1, // nose-down authority of the stall, rad/s at zero lift
  kid: Object.freeze({
    level: 2.2, // hands-off wings-level / nose-level rate, 1/s
    turnBoost: 1.35, // generous turn rate
    vKeep: 1.2, // auto-throttle below vKeep·vs
    floor: 2.5, // ground the pull-up defends, m
    look: 0.9 // seconds of flight path the pull-up looks along
  })
});

/** Nose unit vector for heading/pitch state (same frame as the toy fight). */
export function noseVector(craft) {
  const p = num(craft.pitch), h = num(craft.heading), cp = Math.cos(p);
  return {x: Math.sin(h) * cp, y: Math.sin(p), z: Math.cos(h) * cp};
}

/**
 * Kid assist, applied to the stick before the physics. Hands off the wings
 * roll level and the nose settles; low and sinking it pulls up; slow it adds
 * throttle and refuses a deeper pull. Pilot is the raw aeroplane.
 */
export function applyAssist(craft, cmd, P = PLANE, env = {}) {
  if ((cmd.assist ?? craft.assist ?? 'kid') !== 'kid') return cmd;
  const K = P.kid, v = num(craft.speed), out = {...cmd};
  if (Math.abs(num(out.roll)) < 0.08)
    out.roll = clamp((-num(craft.bank) * K.level) / P.rollRate, -1, 1);
  if (Math.abs(num(out.pitch)) < 0.08)
    out.pitch = clamp((-num(craft.pitch) * K.level) / P.pitchRate, -1, 1);
  if (v < P.vs * K.vKeep) {
    out.lever = Math.max(num(out.lever), 0.8);
    out.pitch = Math.min(num(out.pitch), 0); // no deeper pull while slow
  }
  const groundY = num(env.groundY, -Infinity);
  if (groundY > -Infinity && num(craft.y) + num(craft.vy) * K.look < groundY + K.floor) {
    out.pitch = 1;
    out.roll = clamp((-num(craft.bank) * K.level) / P.rollRate, -1, 1);
    out.lever = 1;
  }
  out.turnBoost = K.turnBoost;
  return out;
}

/**
 * One step of the aeroplane. Mutates craft {x,y,z, heading,pitch,bank, speed,
 * vx,vy,vz, stalled, gLoad}. cmd = {pitch, roll, rudder in -1..1, lever 0..1,
 * assist: 'pilot'|'kid', turnBoost}. env = {groundY} for the kid pull-up.
 */
export function stepAirplane(craft, cmd = {}, dt = 1 / 120, P = PLANE, env = {}) {
  const step = clamp(num(dt), 0, 0.05);
  if (step === 0) return craft;
  const c = applyAssist(craft, cmd, P, env);
  const pitchIn = clamp(num(c.pitch), -1, 1),
    rollIn = clamp(num(c.roll), -1, 1),
    rudderIn = clamp(num(c.rudder), -1, 1),
    lever = clamp(num(c.lever), 0, 1);

  // Velocity state. First call seeds it from heading/speed.
  if (!Number.isFinite(craft.vx) || !Number.isFinite(craft.vz)) {
    const n = noseVector(craft), v0 = Math.max(0, num(craft.speed));
    craft.vx = n.x * v0;
    craft.vy = num(craft.vy, n.y * v0);
    craft.vz = n.z * v0;
  }
  let v = Math.hypot(craft.vx, craft.vy, craft.vz);
  const lift = clamp((v / P.vs) ** 2, 0, 1); // how much wing is flying
  craft.stalled = v < P.vs;

  // Attitude. Stalled controls are mushy and the nose sags toward the path.
  const authority = craft.stalled ? 0.35 : 1;
  craft.bank = clamp(num(craft.bank) + rollIn * P.rollRate * authority * step, -P.maxBank, P.maxBank);
  craft.pitch = clamp(num(craft.pitch) + pitchIn * P.pitchRate * authority * step, -P.maxPitch, P.maxPitch);
  if (craft.stalled) {
    craft.pitch += (-0.5 - craft.pitch) * P.stallSag * (1 - lift) * step;
    craft.bank *= Math.exp(-0.5 * (1 - lift) * step);
  }

  // Bank to turn, coordinated. Aviation sign: right wing down turns right,
  // which in this frame (fwd = [sin H, cos H], right wing at −X) is H−.
  const turnRate = (P.g * Math.tan(clamp(craft.bank, -1.45, 1.45))) / Math.max(v, 3) * num(c.turnBoost, 1) * lift;
  const headingDot = -turnRate - rudderIn * P.rudderYaw;
  craft.heading = num(craft.heading) + headingDot * step;

  // Load factor for the HUD: 1 g wings level, more in the turn and the pull.
  craft.gLoad = Math.hypot(1, (v * turnRate) / P.g) + Math.max(0, pitchIn) * ((P.pitchRate * v) / P.g) * 0.25 * lift;

  // Energy. Thrust along the nose, parasite + induced drag, gravity on the
  // flight path: climbing bleeds speed and diving gains it.
  const oldV = v;
  const gamma = v > 0.01 ? Math.asin(clamp(craft.vy / v, -1, 1)) : 0;
  const k = P.thrust / (P.vmax * P.vmax);
  const drag = k * v * v + (P.induced * Math.max(0, craft.gLoad * craft.gLoad - 1)) / Math.max(v * v, 9);
  v = Math.max(0, v + (P.thrust * lever - drag - P.g * Math.sin(gamma)) * step);

  // The path chases the nose: full lag authority when the wing is flying,
  // fading to none in the stall, where gravity owns the path instead.
  const nose = noseVector(craft);
  let dx = oldV > 0.01 ? craft.vx / oldV : nose.x,
    dy = oldV > 0.01 ? craft.vy / oldV : nose.y,
    dz = oldV > 0.01 ? craft.vz / oldV : nose.z;
  const follow = Math.min(1, P.align * lift * step);
  dx += (nose.x - dx) * follow;
  dy += (nose.y - dy) * follow;
  dz += (nose.z - dz) * follow;
  const m = Math.hypot(dx, dy, dz) || 1;
  craft.vx = (dx / m) * v;
  craft.vy = (dy / m) * v + -P.g * (1 - lift) * step; // the stalled wing falls
  craft.vz = (dz / m) * v;
  craft.speed = Math.hypot(craft.vx, craft.vy, craft.vz);

  craft.x = num(craft.x) + craft.vx * step;
  craft.y = num(craft.y) + craft.vy * step;
  craft.z = num(craft.z) + craft.vz * step;
  return craft;
}

/** Specific energy (height + speed), for tests and tuning. */
export function specificEnergy(craft, P = PLANE) {
  const v = num(craft.speed);
  return P.g * num(craft.y) + 0.5 * v * v;
}

/**
 * Lead-computing gunsight: where to put the pipper so a shot at shotSpeed
 * meets the target. Returns the predicted world point and time of flight.
 */
export function gunsightLead(shooter, target, shotSpeed) {
  const s = Math.max(1, num(shotSpeed, 1));
  let px = num(target.x), py = num(target.y), pz = num(target.z), t = 0;
  for (let i = 0; i < 3; i += 1) {
    t = Math.hypot(px - num(shooter.x), py - num(shooter.y), pz - num(shooter.z)) / s;
    px = num(target.x) + num(target.vx) * t;
    py = num(target.y) + num(target.vy) * t;
    pz = num(target.z) + num(target.vz) * t;
  }
  return {x: px, y: py, z: pz, time: t};
}
