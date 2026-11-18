// Saucer Springs RC car: a 6-DOF rigid body on four raycast spring-damper wheels with static/kinetic
// friction tyres, plus hull spheres that collide with the triangle world. Original model; SI
// units; car-local axes are +X right, +Y up, −Z forward. Re-Volt informed the *form* of the
// model (see docs/area-51-build-plan.md); none of its code or data is used.
import {
  add,
  sub,
  scale,
  madd,
  dot,
  cross,
  len,
  norm,
  rotate,
  unrotate,
  quatIntegrate,
  quatIdentity,
  quatAxisAngle,
  quatNorm,
  yawOf
} from './math.mjs';
import {SURFACES, TRANSITION_SURFACES} from './world.mjs';

// 1:10 electric buggy. Values are fiction, chosen for toy-scale feel and checked by tests.
export const BUGGY = {
  mass: 1.8,
  size: [0.18, 0.08, 0.42], // body box for inertia, metres
  inertiaScale: 1.0,
  wheelMassFraction: 0.15,
  // Provisional 1:10 envelope: 420 mm long, 280 mm outside wheels, 116 mm tyres.
  wheels: [
    // attach points relative to the centre of mass
    {at: [-0.115, 0, -0.14], front: true},
    {at: [0.115, 0, -0.14], front: true},
    {at: [-0.115, 0, 0.14], front: false},
    {at: [0.115, 0, 0.14], front: false}
  ],
  wheelRadius: 0.058,
  wheelWidth: 0.05,
  restLength: 0.05, // attach point to wheel centre at full droop
  spring: 450,
  damper: 12, // per wheel, N/m and N·s/m
  bumpAt: 0.032,
  bumpSpring: 4000,
  bumpDamper: 40, // bump rubber: absorbs before the hull touches
  staticFriction: [1.6, 1.52], // front, rear (rear a little lower: it lets go first)
  kineticFriction: [1.2, 1.12],
  lateralStiffness: 0.5, // fraction of the per-wheel lateral slip removed per substep
  rollCentre: 0.72, // tyre forces act this fraction of the way up to the CoM
  driveForce: 26,
  topSpeed: 14,
  reverseSpeed: 5,
  brakeForce: 30,
  maxSteer: 0.5,
  steerRate: 5,
  downforce: 0.04, // N per (m/s)²
  linearDrag: 0.012,
  angularDrag: 0.4,
  // Hull: body corners act as bump stops when the suspension bottoms out, plus roof and nose.
  hull: [
    {at: [-0.072, -0.028, -0.15], r: 0.028},
    {at: [0.072, -0.028, -0.15], r: 0.028},
    {at: [-0.072, -0.028, 0.15], r: 0.028},
    {at: [0.072, -0.028, 0.15], r: 0.028},
    {at: [0, 0.022, -0.18], r: 0.03},
    {at: [0, 0.022, 0.18], r: 0.03},
    {at: [0, 0.055, 0], r: 0.04},
    {at: [-0.06, 0.035, 0], r: 0.03},
    {at: [0.06, 0.035, 0], r: 0.03}
  ],
  restitution: 0.25,
  hullFriction: 0.45
};

const G = 9.81,
  SUBSTEPS = 4;
// Model units to metres; wheel and shell fitting lives in vehicle-pose.mjs.
export const VISUAL_SCALE = 0.56;

export function createCar(params = BUGGY, pos = [0, 0.1, 0], yaw = 0) {
  const [w, h, l] = params.size,
    m = params.mass,
    k = params.inertiaScale;
  const wheelMass = (m * (params.wheelMassFraction ?? 0)) / params.wheels.length,
    bodyMass = m - wheelMass * params.wheels.length;
  const inertia = [h * h + l * l, w * w + l * l, w * w + h * h].map(v => (bodyMass * v) / 12);
  // The outboard wheels carry mass too; a narrow body box alone understates roll inertia.
  for (const wheel of params.wheels) {
    const [x, atY, z] = wheel.at,
      y = atY - params.restLength + (m * G) / 4 / params.spring;
    const r2 = params.wheelRadius ** 2,
      radial = (3 * r2 + (params.wheelWidth ?? 0) ** 2) / 12;
    inertia[0] += wheelMass * (y * y + z * z + r2 / 2);
    inertia[1] += wheelMass * (x * x + z * z + radial);
    inertia[2] += wheelMass * (x * x + y * y + radial);
  }
  return {
    params,
    invInertia: inertia.map(i => 1 / (i * k)),
    pos: [...pos],
    q: quatAxisAngle([0, 1, 0], -yaw),
    vel: [0, 0, 0],
    ang: [0, 0, 0],
    steer: 0,
    wheels: params.wheels.map(() => ({
      compression: (params.mass * G) / 4 / params.spring,
      contact: false,
      spin: 0,
      slip: 0,
      surface: null
    })),
    grounded: false,
    contacts: 0,
    impact: 0,
    speed: 0,
    forwardSpeed: 0,
    placement: 0
  };
}

// Resting height of the centre of mass above flat ground, for spawning.
export function rideHeight(p = BUGGY) {
  const sag = (p.mass * G) / 4 / p.spring;
  return p.restLength - sag + p.wheelRadius - p.wheels[0].at[1];
}

// Gate recovery drops the car rolling forward so a lip or jump is not a dead stop.
export const RECOVERY_ROLL_MPS = 6;

export function placeCar(car, pos, yaw, rollMps = 0) {
  car.placement = (car.placement ?? 0) + 1;
  car.pos = [...pos];
  car.q = quatAxisAngle([0, 1, 0], -yaw);
  car.vel = [0, 0, 0];
  car.ang = [0, 0, 0];
  car.steer = 0;
  if (rollMps > 0) {
    const fwd = rotate(car.q, [0, 0, -1]);
    car.vel = [fwd[0] * rollMps, fwd[1] * rollMps, fwd[2] * rollMps];
  }
  car.speed = len(car.vel);
  car.forwardSpeed = dot(car.vel, rotate(car.q, [0, 0, -1]));
  car.lipHold = 0;
  car.vertAir = 0;
}

// Body axes in world: +X right, +Y up, +Z back (forward is −Z).
function quatFromBasis(x, y, z) {
  const m00 = x[0],
    m10 = x[1],
    m20 = x[2],
    m01 = y[0],
    m11 = y[1],
    m21 = y[2],
    m02 = z[0],
    m12 = z[1],
    m22 = z[2],
    tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return quatNorm([qx, qy, qz, qw]);
}
// Snap the deck onto a surface, keeping the direction the car is already travelling.
export function alignCar(car, up) {
  const n = norm(up);
  if (len(n) < 0.5) return;
  let fwd = sub(rotate(car.q, [0, 0, -1]), scale(n, dot(rotate(car.q, [0, 0, -1]), n)));
  if (len(fwd) < 0.2) fwd = sub([car.vel[0], 0, car.vel[2]], scale(n, dot([car.vel[0], 0, car.vel[2]], n)));
  if (len(fwd) < 0.05) return;
  fwd = norm(fwd);
  const right = norm(cross(fwd, n));
  if (len(right) < 0.5) return;
  car.q = quatFromBasis(right, n, norm(cross(right, n)));
}

const applyInvInertia = (car, v) =>
  rotate(
    car.q,
    unrotate(car.q, v).map((x, i) => x * car.invInertia[i])
  );
export function pointVelocity(car, p) {
  return add(car.vel, cross(car.ang, sub(p, car.pos)));
}
export function applyImpulse(car, j, at) {
  car.vel = madd(car.vel, j, 1 / car.params.mass);
  car.ang = add(car.ang, applyInvInertia(car, cross(sub(at, car.pos), j)));
}

// input: { throttle −1..1, steer −1..1 (positive = right), brake bool }. Returns nothing; mutates car.
export function stepCar(car, input, world, dt = 1 / 120) {
  const p = car.params;
  const steerTarget = Math.max(-1, Math.min(1, input.steer || 0)) * (input.steerLimit ?? p.maxSteer);
  // Kid mode passes a lower rate. The buggy's own steerRate stays the airframe constant.
  const sd = steerTarget - car.steer,
    steerCap = Number.isFinite(input.steerRate) ? Math.min(p.steerRate, input.steerRate) : p.steerRate,
    maxD = steerCap * dt;
  car.steer += Math.max(-maxD, Math.min(maxD, sd));
  car.impact = 0;
  car.wallImpact = 0;
  settleOntoGround(car, world);
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) substep(car, input, world, h);
  car.speed = len(car.vel);
  car.forwardSpeed = dot(car.vel, rotate(car.q, [0, 0, -1]));
  // The bowl curves under the chassis before the wheels leave the flat. Hold
  // the car on the flat the wheels are on, or one frame reads as upright on a slope.
  if (car.transferSettle && car.contacts >= 2) {
    const wheels = car.wheels.filter(w => w.contact && w.contactNormal);
    const flat = wheels.length >= 2 && wheels.every(w => w.contactNormal[1] > 0.95);
    const speed = Math.hypot(car.vel[0], car.vel[2]);
    if (flat && speed > 0.3) {
      const back = [-car.vel[0] / speed, 0, -car.vel[2] / speed];
      for (let n = 0; n < 6; n++) {
        const support = world.raycast([car.pos[0], car.pos[1] + 0.3, car.pos[2]], [0, -1, 0], 2);
        if (!support || support.normal[1] >= 0.9) break;
        car.pos[0] += back[0] * 0.025;
        car.pos[2] += back[2] * 0.025;
      }
    }
  }
  car.transferSettle = false;
  keepAboveGround(car, world);
}

// One-sided ground: once the body is more than a hull-radius behind the face, wheel
// rays and sphere contacts both miss and the car freefalls (playtest y=-8). Put it
// back on that skin. A real room (sewer, a deck you drove under) has a ceiling well
// below the overhead floor, and is left alone. A cavity directly under a thin slab is
// the same fall, so that one comes back up too.
function keepAboveGround(car, world) {
  const [x, y, z] = car.pos;
  const overhead = world.raycast([x, y + 12, z], [0, -1, 0], 12);
  if (!overhead || overhead.normal[1] < 0.55 || overhead.point[1] <= y + 0.06) return;
  const gap = overhead.point[1] - y;
  const below = world.raycast([x, y - 0.02, z], [0, -1, 0], 8);
  const ceiling = world.raycast([x, y, z], [0, 1, 0], gap);
  const thickness = ceiling ? overhead.point[1] - (y + ceiling.dist) : Infinity;
  const room = ceiling && thickness > 0.35;
  if (room) return;
  const fellThrough = !below && gap < 12;
  // Inside a thin slab (the underside is on the body), not driving under a deck.
  const clippedSlab = !!ceiling && ceiling.dist < 0.15 && thickness < 0.35 && gap < 0.5;
  if (!fellThrough && !clippedSlab) return;
  car.pos[1] = overhead.point[1] + rideHeight(car.params);
  if (car.vel[1] < 0) car.vel[1] = 0;
}

function airborneTransition(car, surface, normalY) {
  return (car.lipHold > 0 || car.vertAir > 0) && TRANSITION_SURFACES.has(surface) && normalY < 0.82;
}
// A spawn sits a couple of centimetres above the springs. Pull that down in one
// step so the first move is on the ground. Leave real hops and lip airs alone.
function settleOntoGround(car, world) {
  if (car.lipHold > 0 || car.vertAir > 0 || car.vel[1] > 0.8) return;
  // The 4–45 mm window is a spawn sitting on its springs. Once the car is
  // rolling, that same rise is a stoppie or a drift hop, and pulling it down ends it.
  if (Math.hypot(car.vel[0], car.vel[2]) > 0.5) return;
  const hit = world.raycast([car.pos[0], car.pos[1] + 0.05, car.pos[2]], [0, -1, 0], 0.45);
  // Slopes report a shorter vertical gap than the suspension ride height. Settling
  // there plants the hull. Only a flat spawn needs the pull-down.
  if (!hit || hit.normal[1] < 0.96) return;
  const target = hit.point[1] + rideHeight(car.params),
    gap = car.pos[1] - target;
  if (gap > 0.004 && gap < 0.045) {
    car.pos[1] = target;
    if (car.vel[1] < 0) car.vel[1] = 0;
  }
}
function substep(car, input, world, dt) {
  if (car.lipHold > 0) car.lipHold = Math.max(0, car.lipHold - dt);
  if (car.vertAir > 0) {
    car.vertAir = Math.max(0, car.vertAir - dt);
    const below = world.raycast([car.pos[0], car.pos[1] + 0.05, car.pos[2]], [0, -1, 0], 2);
    // Slide off the steep column toward the bowl so the drop meets the same wall's
    // lower face instead of falling through the shell.
    if (below && car.vel[1] < 1 && TRANSITION_SURFACES.has(below.surface) && below.normal[1] < 0.8 && below.dist < 0.9) {
      const h = Math.hypot(below.normal[0], below.normal[2]) || 1;
      car.pos[0] += (below.normal[0] / h) * 0.004;
      car.pos[2] += (below.normal[2] / h) * 0.004;
    }
    if (below && below.dist < 0.4 && (below.normal[1] > 0.82 || !TRANSITION_SURFACES.has(below.surface)))
      car.vertAir = 0;
    if (car.pos[1] < 0.02) {
      car.vertAir = 0;
      car.lipHold = 0;
      const floor = world.raycast([car.pos[0], 2, car.pos[2]], [0, -1, 0], 4);
      if (floor) car.pos[1] = floor.point[1] + 0.25;
    }
  }
  const p = car.params,
    m = p.mass,
    up = rotate(car.q, [0, 1, 0]),
    fwd = rotate(car.q, [0, 0, -1]);
  let force = [0, -G * m, 0],
    torque = [0, 0, 0];
  const addForce = (f, at) => {
    force = add(force, f);
    torque = add(torque, cross(sub(at, car.pos), f));
  };
  const throttle = Math.max(-1, Math.min(1, input.throttle || 0));
  const vFwd = dot(car.vel, fwd);
  // Throttle opposite to motion brakes first, then reverses (RC-transmitter behaviour).
  const braking = !!input.brake || (throttle !== 0 && vFwd * throttle < -0.3);
  let drive = 0;
  const boost = input.boost ?? 1; // zoom pickup: more push and a higher top end
  if (!braking && throttle > 0)
    drive = throttle * p.driveForce * boost * Math.max(0, 1 - vFwd / (p.topSpeed * boost));
  if (!braking && throttle < 0)
    drive = throttle * p.driveForce * 0.6 * Math.max(0, 1 + vFwd / p.reverseSpeed);
  const grip = input.gripScale ?? 1;

  let contacts = 0;
  car.wheels.forEach((ws, i) => {
    const wp = p.wheels[i],
      attach = add(car.pos, rotate(car.q, wp.at)),
      reach = p.restLength + p.wheelRadius;
    const hit = world.raycast(attach, scale(up, -1), reach);
    // Face normal, not the seam shade: the shade can be 40° on a flat triangle.
    const face = hit?.face || hit?.normal;
    if (!hit || airborneTransition(car, hit.surface, face[1])) {
      ws.contact = false;
      ws.compression = 0;
      ws.surface = null;
      ws.slip = 0;
      ws.contactPoint = null;
      ws.contactNormal = null;
      return;
    }
    contacts++;
    const compression = reach - hit.dist,
      vAttach = pointVelocity(car, attach);
    const rate = -dot(vAttach, up);
    const surf = SURFACES[hit.surface] || SURFACES.concrete;
    const glued = TRANSITION_SURFACES.has(hit.surface) && ((input.throttle ?? 0) >= 0.48 || car.forwardSpeed > 7);
    const bump = !glued && compression > p.bumpAt,
      bounce = surf.bounce ?? 1;
    // A bouncy surface (trampoline) is a stiffer, nearly undamped spring under the wheel.
    const springF = glued
      ? Math.max(0, p.spring * compression + p.damper * 8 * Math.max(0, rate))
      : Math.max(
          0,
          p.spring * bounce * compression +
            (bump
              ? p.bumpSpring * (compression - p.bumpAt) +
                ((surf.bumpDamper ?? 1) * p.bumpDamper * Math.max(0, rate)) / bounce
              : 0) +
            ((surf.damper ?? 1) * p.damper * rate) / (bounce * bounce)
        );
    ws.contact = true;
    ws.compression = compression;
    ws.surface = hit.surface;
    ws.contactPoint = hit.point;
    ws.contactNormal = face;
    addForce(scale(up, springF), attach);

    // Tyre: forces in the contact plane, applied part-way up toward the CoM (roll centre).
    const n = face;
    const steerQ = wp.front ? quatAxisAngle(up, -car.steer) : null;
    let wf = steerQ ? rotate(steerQ, fwd) : fwd;
    wf = norm(sub(wf, scale(n, dot(wf, n))));
    const wl = norm(cross(wf, n));
    const vp = pointVelocity(car, hit.point),
      vLong = dot(vp, wf),
      vLat = dot(vp, wl);
    const load = springF,
      axle = wp.front ? 0 : 1;
    const muS = p.staticFriction[axle] * surf.grip * grip,
      muK = p.kineticFriction[axle] * surf.grip * grip;
    let fLat = ((-vLat * (m / 4)) / dt) * p.lateralStiffness * (input.lateralGripScale ?? 1);
    let fLong = drive / 4 - Math.sign(vLong) * Math.min(1, Math.abs(vLong) * 5) * surf.roll * load;
    if (braking)
      fLong += -Math.sign(vLong) * Math.min(p.brakeForce / 4, ((Math.abs(vLong) * (m / 4)) / dt) * 0.5);
    const total = Math.hypot(fLat, fLong),
      limitS = muS * load;
    if (total > limitS && total > 0) {
      const s = (muK * load) / total;
      fLat *= s;
      fLong *= s;
      ws.slip = 1;
    } else ws.slip = 0;
    const at = add(hit.point, scale(sub(car.pos, hit.point), p.rollCentre));
    addForce(add(scale(wl, fLat), scale(wf, fLong)), at);
    ws.spin += (vLong / p.wheelRadius) * dt;
  });
  car.contacts = contacts;
  car.grounded = contacts > 0;

  // Downforce along the body's down axis, aerodynamic and rolling drag.
  const speed = len(car.vel);
  if (contacts) force = madd(force, up, -p.downforce * speed * speed);
  force = madd(force, car.vel, -p.linearDrag * speed);
  torque = madd(torque, car.ang, -p.angularDrag * 0.01);
  if (input.torque) torque = add(torque, input.torque); // assists act through torque, see assists.mjs

  car.vel = madd(car.vel, force, dt / m);
  car.ang = add(car.ang, scale(applyInvInertia(car, torque), dt));
  car.pos = madd(car.pos, car.vel, dt);
  car.q = quatIntegrate(car.q, car.ang, dt);

  solveHull(car, world);
  stickTransition(car, input, world, dt);
  holdVertLane(car, input, world);
}
// Concrete floor between verts. A straight run that has yawed along the pipe
// walks out the end; one frame of drive at that yaw is enough. Leave a run
// that is already headed at a wall alone, or the approach into the pipe stops.
function holdVertLane(car, input, world) {
  if (Math.abs(input.steer || 0) > 0.15 || (input.throttle ?? 0) < 0.4) return;
  if (car.lipHold > 0 || car.vertAir > 0 || carUp(car)[1] < 0.85) return;
  let best = null;
  for (const dir of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1]
  ]) {
    const hit = world.raycast([car.pos[0], car.pos[1] + 0.2, car.pos[2]], dir, 3.2);
    if (!hit || hit.surface !== 'vert') continue;
    if (!best || hit.dist < best.dist) best = hit;
  }
  if (!best) return;
  const dx = best.point[0] - car.pos[0],
    dz = best.point[2] - car.pos[2],
    across = Math.hypot(dx, dz) || 1,
    ax = dx / across,
    az = dz / across,
    lx = -az,
    lz = ax,
    acrossSpeed = car.vel[0] * ax + car.vel[2] * az,
    alongSpeed = car.vel[0] * lx + car.vel[2] * lz;
  if (Math.abs(alongSpeed) <= Math.abs(acrossSpeed) || Math.abs(alongSpeed) < 0.35) return;
  car.vel[0] -= lx * alongSpeed;
  car.vel[2] -= lz * alongSpeed;
  car.q = quatAxisAngle([0, 1, 0], -Math.atan2(ax, -az));
  car.ang = [0, 0, 0];
}

// Held throttle on a bowl or quarter: stay on the curve, no suspension pogo, a little
// speed on the way down, and enough push that the wall does not stall the car.
function stickTransition(car, input, world, dt) {
  const wheels = car.wheels.filter(
    w => w.contact && w.contactNormal && (w.surface === 'bowl' || w.surface === 'vert')
  );
  if (wheels.length < 2 || car.lipHold > 0 || car.vertAir > 0) return;
  const n = norm(wheels.reduce((s, w) => add(s, w.contactNormal), [0, 0, 0]));
  if (n[1] < 0.05) return;
  // Crossing a deck lip into the bowl: the face normal points along the run,
  // and projecting onto that plane stops the car on the coping. Let the drop
  // keep its speed. A climb is already leant into the wall, so it still sticks.
  const up = carUp(car),
    speedH = Math.hypot(car.vel[0], car.vel[2]),
    along = speedH > 0.2 ? (car.vel[0] * n[0] + car.vel[2] * n[2]) / speedH : 0;
  if (
    Math.abs(input.steer || 0) < 0.2 &&
    wheels.some(w => w.surface === 'vert') &&
    n[1] < 0.9
  ) {
    const lip = [-n[2], 0, n[0]],
      lh = Math.hypot(lip[0], lip[2]) || 1,
      slide = (car.vel[0] * lip[0] + car.vel[2] * lip[2]) / lh;
    car.vel[0] -= (lip[0] / lh) * slide;
    car.vel[2] -= (lip[2] / lh) * slide;
  }
  if (up[1] > 0.82 && n[1] < 0.72 && along > 0.5 && speedH > 3.2 && car.vel[1] < 1) {
    // Long enough to clear the lip and still be a scored drop, not a hop off the seam.
    car.lipHold = 0.55;
    if (car.vel[1] < 3.6) car.vel[1] = 3.6;
    return;
  }
  // A braked landing has to stay on the face. The full position glue tipped a
  // fast brake off the hip run-out, so a brake only keeps the deck aligned and
  // sheds speed into the surface.
  if (input.brake) {
    alignCar(car, n);
    const into = dot(car.vel, n);
    if (into < 0) car.vel = sub(car.vel, scale(n, into));
    return;
  }
  // Coasting keeps the real suspension.
  if ((input.throttle ?? 0) < 0.48) return;
  alignCar(car, n);
  const origin = add(car.pos, scale(n, 0.35));
  const hit = world.raycast(origin, scale(n, -1), 1.1);
  if (hit && (TRANSITION_SURFACES.has(hit.surface) || hit.surface === 'concrete')) {
    const err = dot(sub(car.pos, hit.point), n) - rideHeight(car.params);
    if (err < 0.22 && err > -0.08) car.pos = add(car.pos, scale(n, -err * 0.8));
  }
  car.vel = sub(car.vel, scale(n, dot(car.vel, n)));
  car.ang = scale(n, dot(car.ang, n));
  const throttle = input.throttle ?? 0;
  if (throttle > 0.2) {
    const downhill = [n[0] * n[1], n[1] * n[1] - 1, n[2] * n[1]];
    const dl = Math.hypot(...downhill);
    if (dl > 0.15 && dot(car.vel, downhill) > 0) car.vel = add(car.vel, scale(downhill, (4.2 * dt) / dl));
  }
  let fwd = sub(rotate(car.q, [0, 0, -1]), scale(n, dot(rotate(car.q, [0, 0, -1]), n)));
  if (len(fwd) > 0.2) {
    fwd = norm(fwd);
    // Anti-stall only. A steady push under 5.5 m/s carried a part-throttle
    // run up the west quarter onto the secret tape.
    if (throttle > 0.48 && fwd[1] > 0.15 && dot(car.vel, fwd) < 2.2) car.vel = add(car.vel, scale(fwd, 8 * dt));
  }
}

// Hull contacts. Gather every contact first, push out once per surface, then solve impulses
// over a few iterations with accumulated (clamped) impulses so the result does not depend on
// which corner happened to be checked first.
function solveHull(car, world) {
  const p = car.params,
    m = p.mass,
    contacts = [];
  for (const s of p.hull) {
    for (const ct of world.sphereContacts(add(car.pos, rotate(car.q, s.at)), s.r)) {
      const twin = contacts.find(
        f => dot(f.normal, ct.normal) > 0.99 && len(sub(f.point, ct.point)) < s.r * 2
      );
      if (!twin) contacts.push(ct);
      else if (ct.depth > twin.depth) Object.assign(twin, ct);
    }
  }
  car.hullContacts = contacts;
  if (!contacts.length) return;
  for (let i = contacts.length - 1; i >= 0; i--)
    if (airborneTransition(car, contacts[i].surface, contacts[i].normal[1])) contacts.splice(i, 1);
  if (!contacts.length) return;
  const push = [];
  for (const ct of contacts) {
    const same = push.find(f => dot(f.normal, ct.normal) > 0.99);
    if (!same) push.push({normal: ct.normal, depth: ct.depth});
    else same.depth = Math.max(same.depth, ct.depth);
  }
  for (const f of push) car.pos = madd(car.pos, f.normal, f.depth * 0.8);
  for (const ct of contacts) {
    ct.r = sub(ct.point, car.pos);
    ct.kN = 1 / m + dot(ct.normal, cross(applyInvInertia(car, cross(ct.r, ct.normal)), ct.r));
    const vn = dot(pointVelocity(car, ct.point), ct.normal);
    ct.bias = TRANSITION_SURFACES.has(ct.surface) || vn >= -0.5 ? 0 : -p.restitution * vn;
    ct.jn = 0;
    ct.jt = [0, 0, 0];
    car.impact = Math.max(car.impact, -vn);
    // Riding an upward-facing quarter transition is intentional, even near vertical.
    if (Math.abs(ct.normal[1]) < 0.5 && !(TRANSITION_SURFACES.has(ct.surface) && ct.normal[1] > 0.05))
      car.wallImpact = Math.max(car.wallImpact, -vn);
  }
  for (let it = 0; it < 6; it++)
    for (const ct of contacts) {
      const vRel = pointVelocity(car, ct.point),
        vn = dot(vRel, ct.normal);
      const jn = Math.max(0, ct.jn + (ct.bias - vn) / ct.kN),
        dj = jn - ct.jn;
      ct.jn = jn;
      if (dj) applyImpulse(car, scale(ct.normal, dj), ct.point);
      const v2 = pointVelocity(car, ct.point),
        vt = sub(v2, scale(ct.normal, dot(v2, ct.normal))),
        vtl = len(vt);
      if (vtl < 1e-6) continue;
      const t = scale(vt, 1 / vtl),
        kT = 1 / m + dot(t, cross(applyInvInertia(car, cross(ct.r, t)), ct.r));
      let jt = madd(ct.jt, t, -vtl / kT);
      const jl = len(jt),
        max = p.hullFriction * ct.jn;
      if (jl > max) jt = scale(jt, max / jl);
      applyImpulse(car, sub(jt, ct.jt), ct.point);
      ct.jt = jt;
    }
}

// Readouts the renderer and HUD use.
export const carUp = car => rotate(car.q, [0, 1, 0]);
export const carForward = car => rotate(car.q, [0, 0, -1]);
export const carYaw = car => yawOf(car.q);
export {quatIdentity};
