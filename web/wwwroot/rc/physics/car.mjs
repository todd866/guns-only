// Area 51½ car: a 6-DOF rigid body on four raycast spring-damper wheels with static/kinetic
// friction tyres, plus hull spheres that collide with the triangle world. Original model; SI
// units; car-local axes are +X right, +Y up, −Z forward. Re-Volt informed the *form* of the
// model (see docs/area-51-build-plan.md); none of its code or data is used.
import { add, sub, scale, madd, dot, cross, len, norm, rotate, unrotate, quatIntegrate, quatIdentity, quatAxisAngle, yawOf } from './math.mjs';
import { SURFACES } from './world.mjs';

// 1:10 electric buggy. Values are fiction, chosen for toy-scale feel and checked by tests.
export const BUGGY = {
  mass: 1.8,
  size: [0.24, 0.1, 0.42],            // body box for inertia, metres
  inertiaScale: 1.0,
  // Wheel layout matches the Blender buggy (assets/rc/models/buggy.blend) drawn at VISUAL_SCALE.
  wheels: [                           // attach points relative to the centre of mass
    { at: [-0.1625, 0, -0.14], front: true }, { at: [0.1625, 0, -0.14], front: true },
    { at: [-0.1625, 0, 0.14], front: false }, { at: [0.1625, 0, 0.14], front: false },
  ],
  wheelRadius: 0.084,
  restLength: 0.055,                  // attach point to wheel centre at full droop
  spring: 450, damper: 9,             // per wheel, N/m and N·s/m
  bumpAt: 0.036, bumpSpring: 4000, bumpDamper: 40, // bump rubber: absorbs before the hull touches
  staticFriction: [1.6, 1.52],        // front, rear (rear a little lower: it lets go first)
  kineticFriction: [1.2, 1.12],
  lateralStiffness: 0.5,              // fraction of the per-wheel lateral slip removed per substep
  rollCentre: 0.6,                    // tyre forces act this fraction of the way up to the CoM
  driveForce: 26, topSpeed: 14, reverseSpeed: 5, brakeForce: 30,
  maxSteer: 0.5, steerRate: 5,
  downforce: 0.04,                    // N per (m/s)²
  linearDrag: 0.012, angularDrag: 0.4,
  // Hull: body corners act as bump stops when the suspension bottoms out, plus roof and nose.
  hull: [
    { at: [-0.1, -0.045, -0.15], r: 0.04 }, { at: [0.1, -0.045, -0.15], r: 0.04 },
    { at: [-0.1, -0.045, 0.15], r: 0.04 }, { at: [0.1, -0.045, 0.15], r: 0.04 },
    { at: [0, 0.03, -0.19], r: 0.04 }, { at: [0, 0.03, 0.19], r: 0.04 },
    { at: [0, 0.07, 0], r: 0.05 }, { at: [-0.08, 0.05, 0], r: 0.04 }, { at: [0.08, 0.05, 0], r: 0.04 },
  ],
  restitution: 0.25, hullFriction: 0.45,
};

const G = 9.81, SUBSTEPS = 4;
// The Blender buggy is authored at 1:5.6 of this toy (0.75 m body, 0.15 m wheels); draw it at this scale.
export const VISUAL_SCALE = 0.56;

export function createCar(params = BUGGY, pos = [0, 0.1, 0], yaw = 0) {
  const [w, h, l] = params.size, m = params.mass, k = params.inertiaScale;
  const inertia = [m / 12 * (h * h + l * l) * k, m / 12 * (w * w + l * l) * k, m / 12 * (w * w + h * h) * k];
  return {
    params, invInertia: inertia.map(i => 1 / i),
    pos: [...pos], q: quatAxisAngle([0, 1, 0], -yaw), vel: [0, 0, 0], ang: [0, 0, 0],
    steer: 0, wheels: params.wheels.map(() => ({ compression: 0, contact: false, spin: 0, slip: 0, surface: null })),
    grounded: false, contacts: 0, impact: 0, speed: 0, forwardSpeed: 0, placement: 0,
  };
}

// Resting height of the centre of mass above flat ground, for spawning.
export function rideHeight(p = BUGGY) {
  const sag = p.mass * G / 4 / p.spring;
  return p.restLength - sag + p.wheelRadius - p.wheels[0].at[1];
}

export function placeCar(car, pos, yaw) {
  car.placement = (car.placement ?? 0) + 1;
  car.pos = [...pos]; car.q = quatAxisAngle([0, 1, 0], -yaw); car.vel = [0, 0, 0]; car.ang = [0, 0, 0]; car.steer = 0;
}

const applyInvInertia = (car, v) => rotate(car.q, unrotate(car.q, v).map((x, i) => x * car.invInertia[i]));
function pointVelocity(car, p) { return add(car.vel, cross(car.ang, sub(p, car.pos))); }
function applyImpulse(car, j, at) {
  car.vel = madd(car.vel, j, 1 / car.params.mass);
  car.ang = add(car.ang, applyInvInertia(car, cross(sub(at, car.pos), j)));
}

// input: { throttle −1..1, steer −1..1 (positive = right), brake bool }. Returns nothing; mutates car.
export function stepCar(car, input, world, dt = 1 / 120) {
  const p = car.params;
  const steerTarget = Math.max(-1, Math.min(1, input.steer || 0)) * (input.steerLimit ?? p.maxSteer);
  const sd = steerTarget - car.steer, maxD = p.steerRate * dt;
  car.steer += Math.max(-maxD, Math.min(maxD, sd));
  car.impact = 0; car.wallImpact = 0;
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) substep(car, input, world, h);
  car.speed = len(car.vel);
  car.forwardSpeed = dot(car.vel, rotate(car.q, [0, 0, -1]));
}

function substep(car, input, world, dt) {
  const p = car.params, m = p.mass, up = rotate(car.q, [0, 1, 0]), fwd = rotate(car.q, [0, 0, -1]);
  let force = [0, -G * m, 0], torque = [0, 0, 0];
  const addForce = (f, at) => { force = add(force, f); torque = add(torque, cross(sub(at, car.pos), f)); };
  const throttle = Math.max(-1, Math.min(1, input.throttle || 0));
  const vFwd = dot(car.vel, fwd);
  // Throttle opposite to motion brakes first, then reverses (RC-transmitter behaviour).
  const braking = !!input.brake || (throttle !== 0 && vFwd * throttle < -0.3);
  let drive = 0;
  const boost = input.boost ?? 1;   // zoom pickup: more push and a higher top end
  if (!braking && throttle > 0) drive = throttle * p.driveForce * boost * Math.max(0, 1 - vFwd / (p.topSpeed * boost));
  if (!braking && throttle < 0) drive = throttle * p.driveForce * 0.6 * Math.max(0, 1 + vFwd / p.reverseSpeed);
  const grip = input.gripScale ?? 1;

  let contacts = 0;
  car.wheels.forEach((ws, i) => {
    const wp = p.wheels[i], attach = add(car.pos, rotate(car.q, wp.at)), reach = p.restLength + p.wheelRadius;
    const hit = world.raycast(attach, scale(up, -1), reach);
    if (!hit) { ws.contact = false; ws.compression = 0; ws.surface = null; ws.slip = 0; ws.contactPoint = null; return; }
    contacts++;
    const compression = reach - hit.dist, vAttach = pointVelocity(car, attach);
    const rate = -dot(vAttach, up);
    const bump = compression > p.bumpAt, bounce = (SURFACES[hit.surface] || SURFACES.concrete).bounce ?? 1;
    // A bouncy surface (trampoline) is a stiffer, nearly undamped spring under the wheel.
    const springF = Math.max(0, p.spring * bounce * compression + (bump ? p.bumpSpring * (compression - p.bumpAt) + p.bumpDamper * Math.max(0, rate) / bounce : 0) + p.damper * rate / (bounce * bounce));
    ws.contact = true; ws.compression = compression; ws.surface = hit.surface; ws.contactPoint = hit.point;
    addForce(scale(up, springF), attach);

    // Tyre: forces in the contact plane, applied part-way up toward the CoM (roll centre).
    const n = hit.normal, surf = SURFACES[hit.surface] || SURFACES.concrete;
    const steerQ = wp.front ? quatAxisAngle(up, -car.steer) : null;
    let wf = steerQ ? rotate(steerQ, fwd) : fwd;
    wf = norm(sub(wf, scale(n, dot(wf, n))));
    const wl = norm(cross(wf, n));
    const vp = pointVelocity(car, hit.point), vLong = dot(vp, wf), vLat = dot(vp, wl);
    const load = springF, axle = wp.front ? 0 : 1;
    const muS = p.staticFriction[axle] * surf.grip * grip, muK = p.kineticFriction[axle] * surf.grip * grip;
    let fLat = -vLat * (m / 4) / dt * p.lateralStiffness * (input.lateralGripScale ?? 1);
    let fLong = drive / 4 - Math.sign(vLong) * Math.min(1, Math.abs(vLong) * 5) * surf.roll * load;
    if (braking) fLong += -Math.sign(vLong) * Math.min(p.brakeForce / 4, Math.abs(vLong) * (m / 4) / dt * 0.5);
    const total = Math.hypot(fLat, fLong), limitS = muS * load;
    if (total > limitS && total > 0) { const s = muK * load / total; fLat *= s; fLong *= s; ws.slip = 1; } else ws.slip = 0;
    const at = add(hit.point, scale(sub(car.pos, hit.point), p.rollCentre));
    addForce(add(scale(wl, fLat), scale(wf, fLong)), at);
    ws.spin += vLong / p.wheelRadius * dt;
  });
  car.contacts = contacts; car.grounded = contacts > 0;

  // Downforce along the body's down axis, aerodynamic and rolling drag.
  const speed = len(car.vel);
  if (contacts) force = madd(force, up, -p.downforce * speed * speed);
  force = madd(force, car.vel, -p.linearDrag * speed);
  torque = madd(torque, car.ang, -p.angularDrag * 0.01);
  if (input.torque) torque = add(torque, input.torque);   // assists act through torque, see assists.mjs

  car.vel = madd(car.vel, force, dt / m);
  car.ang = add(car.ang, scale(applyInvInertia(car, torque), dt));
  car.pos = madd(car.pos, car.vel, dt);
  car.q = quatIntegrate(car.q, car.ang, dt);

  solveHull(car, world);
}

// Hull contacts. Gather every contact first, push out once per surface, then solve impulses
// over a few iterations with accumulated (clamped) impulses so the result does not depend on
// which corner happened to be checked first.
function solveHull(car, world) {
  const p = car.params, m = p.mass, contacts = [];
  for (const s of p.hull) {
    for (const ct of world.sphereContacts(add(car.pos, rotate(car.q, s.at)), s.r)) {
      const twin = contacts.find(f => dot(f.normal, ct.normal) > 0.99 && len(sub(f.point, ct.point)) < s.r * 2);
      if (!twin) contacts.push(ct); else if (ct.depth > twin.depth) Object.assign(twin, ct);
    }
  }
  if (!contacts.length) return;
  const push = [];
  for (const ct of contacts) {
    const same = push.find(f => dot(f.normal, ct.normal) > 0.99);
    if (!same) push.push({ normal: ct.normal, depth: ct.depth }); else same.depth = Math.max(same.depth, ct.depth);
  }
  for (const f of push) car.pos = madd(car.pos, f.normal, f.depth * 0.8);
  for (const ct of contacts) {
    ct.r = sub(ct.point, car.pos);
    ct.kN = 1 / m + dot(ct.normal, cross(applyInvInertia(car, cross(ct.r, ct.normal)), ct.r));
    const vn = dot(pointVelocity(car, ct.point), ct.normal);
    ct.bias = vn < -0.5 ? -p.restitution * vn : 0; ct.jn = 0; ct.jt = [0, 0, 0];
    car.impact = Math.max(car.impact, -vn);
    if (Math.abs(ct.normal[1]) < 0.5) car.wallImpact = Math.max(car.wallImpact, -vn);
  }
  for (let it = 0; it < 6; it++) for (const ct of contacts) {
    const vRel = pointVelocity(car, ct.point), vn = dot(vRel, ct.normal);
    const jn = Math.max(0, ct.jn + (ct.bias - vn) / ct.kN), dj = jn - ct.jn; ct.jn = jn;
    if (dj) applyImpulse(car, scale(ct.normal, dj), ct.point);
    const v2 = pointVelocity(car, ct.point), vt = sub(v2, scale(ct.normal, dot(v2, ct.normal))), vtl = len(vt);
    if (vtl < 1e-6) continue;
    const t = scale(vt, 1 / vtl), kT = 1 / m + dot(t, cross(applyInvInertia(car, cross(ct.r, t)), ct.r));
    let jt = madd(ct.jt, t, -vtl / kT); const jl = len(jt), max = p.hullFriction * ct.jn;
    if (jl > max) jt = scale(jt, max / jl);
    applyImpulse(car, sub(jt, ct.jt), ct.point); ct.jt = jt;
  }
}

// Readouts the renderer and HUD use.
export const carUp = car => rotate(car.q, [0, 1, 0]);
export const carForward = car => rotate(car.q, [0, 0, -1]);
export const carYaw = car => yawOf(car.q);
export { quatIdentity };
