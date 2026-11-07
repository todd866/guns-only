// A toy car nose-into a wall makes no progress. The old kid assist teleported.
// This is the physical answer: a hop off the blocking face, a yaw that swings the
// nose clear (forward drive is held off while it still points into the wall), and,
// on a slope, extra wheel drive plus a torque that stands the body on the contact.
// Never a position reset.
import {add, sub, scale, dot, cross, len, norm, rotate, unrotate} from './math.mjs';
import {carUp, carForward} from './car.mjs';

export const UNSTICK = Object.freeze({
  window: 2, // s of throttle or steer with little travel
  progress: 1, // m that counts as "it is moving"
  input: 0.15,
  pulse: 1.1, // s to yaw onto the wall and roll clear of it
  hop: 1.7, // m/s along the contact normal
  along: 1.4, // m/s along the face, so the hop is not straight back into it
  boost: 2.4 // extra wheel drive, on top of whatever the transmitter asked
});

function contactNormals(car) {
  return [
    ...car.wheels.filter(w => w.contact && w.contactNormal).map(w => w.contactNormal),
    ...(car.hullContacts ?? []).map(c => c.normal)
  ];
}

function dominantNormal(car) {
  const fwd = carForward(car);
  let best = null,
    score = -Infinity;
  for (const n of contactNormals(car)) {
    // A face in front of the nose outranks the ground the wheels are standing on.
    const s = -dot(n, fwd) + Math.max(0, 0.85 - n[1]) * 0.4;
    if (s > score) {
      score = s;
      best = n;
    }
  }
  if (best) return norm(best);
  return len(fwd) > 1e-6 ? scale(fwd, -1) : [0, 1, 0];
}

// Sum of the faces actually blocking the nose. Two walls of a corner then point out of it,
// instead of the single steeper face shoving the car into the other one.
function escapeNormal(car) {
  const fwd = carForward(car);
  let acc = [0, 0, 0],
    n = 0;
  for (const normal of contactNormals(car)) {
    if (normal[1] > 0.75) continue;
    if (-dot(normal, fwd) < 0.15 && normal[1] > 0.45) continue;
    acc = add(acc, normal);
    n++;
  }
  if (n && len(acc) > 0.2) return norm(acc);
  return dominantNormal(car);
}

// Nose aimed into a wall: forward drive pins it there. A slope you can stand on is not that.
function facingInto(car, normal) {
  return dot(carForward(car), normal) < -0.2 && normal[1] < 0.55;
}

// The shorter swing onto the face: driving along a wall leaves it, driving into it does not.
function alongWall(normal, fwd) {
  const flat = Math.hypot(normal[0], normal[2]);
  if (flat < 0.25) return null;
  const tx = -normal[2] / flat,
    tz = normal[0] / flat,
    a = [tx, 0, tz],
    b = [-tx, 0, -tz];
  return dot(fwd, a) >= dot(fwd, b) ? a : b;
}

// Swing the nose toward `dir`'s horizontal. Yaw only, so a wall does not pitch the car onto its roof.
function yawToward(car, dir) {
  const fwd = carForward(car),
    flatF = [fwd[0], 0, fwd[2]],
    flatD = [dir[0], 0, dir[2]],
    fl = len(flatF),
    dl = len(flatD);
  if (fl < 1e-4 || dl < 1e-4) return [0, 0, 0];
  const err = cross(scale(flatF, 1 / fl), scale(flatD, 1 / dl));
  const yawRate = dot(car.ang, [0, 1, 0]),
    omega = 10,
    accel = err[1] * omega * omega - 2 * 0.75 * omega * yawRate;
  return rotate(
    car.q,
    unrotate(car.q, [0, accel, 0]).map((v, i) => v / car.invInertia[i])
  );
}

// Torque that rotates the body's up axis onto the contact normal.
function uprightTorque(car, normal) {
  const up = carUp(car);
  let err = cross(up, normal);
  if (len(err) < 0.08 && up[1] < 0) err = add(err, scale(carForward(car), 0.3));
  if (len(err) < 1e-4) return [0, 0, 0];
  const along = scale(normal, dot(car.ang, normal));
  const angNoSpin = sub(car.ang, along);
  const omega = 9;
  const acceleration = sub(scale(err, omega * omega), scale(angNoSpin, 2 * 0.75 * omega));
  return rotate(
    car.q,
    unrotate(car.q, acceleration).map((v, i) => v / car.invInertia[i])
  );
}

/**
 * Call once per car step, before assistInput. Returns drive/torque to merge
 * into the step input, and may add a one-shot hop to car.vel.
 * @returns {{boost:number, torque:number[]}|null}
 */
function pulseInput(car, normal) {
  // Measured: boost 2.4 while the nose still points at the wall kills a 1.7 m/s hop
  // in one substep (0.16 m of retreat). A fixed heading then drives straight back into
  // the same face. Turn onto the wall and roll along it; hold the wheels there so a
  // stick still aimed at the concrete cannot plant the car again during the pulse.
  const along = alongWall(normal, carForward(car));
  if (along && normal[1] < 0.55) {
    const fwd = carForward(car),
      right = rotate(car.q, [1, 0, 0]),
      aligned = dot(fwd, along) > 0.65;
    return {
      boost: aligned ? 1.6 : 1,
      throttle: aligned ? 1 : 0,
      steer: aligned ? 0 : Math.max(-1, Math.min(1, dot(right, along) * 3)),
      torque: aligned ? [0, 0, 0] : yawToward(car, along)
    };
  }
  if (facingInto(car, normal)) return {boost: 1, throttle: 0, torque: yawToward(car, normal)};
  return {boost: UNSTICK.boost, torque: uprightTorque(car, normal)};
}

export function stepUnstick(s, raw, dt = 1 / 120) {
  const u = (s.unstick ??= {t: 0, anchor: null, pulse: 0, normal: null, hopped: false});
  if (u.pulse > 0) {
    u.pulse = Math.max(0, u.pulse - dt);
    return pulseInput(s.car, u.normal ?? [0, 1, 0]);
  }
  const trying = Math.abs(raw.throttle || 0) > UNSTICK.input || Math.abs(raw.steer || 0) > UNSTICK.input;
  if (!trying) {
    u.t = 0;
    u.anchor = [...s.car.pos];
    return null;
  }
  if (!u.anchor) u.anchor = [...s.car.pos];
  u.t += dt;
  const moved = Math.hypot(s.car.pos[0] - u.anchor[0], s.car.pos[2] - u.anchor[2]);
  if (u.t < UNSTICK.window) return null;
  u.t = 0;
  u.anchor = [...s.car.pos];
  if (moved >= UNSTICK.progress) return null;
  const n = escapeNormal(s.car);
  u.normal = n;
  u.pulse = UNSTICK.pulse;
  const closing = Math.min(0, dot(s.car.vel, n));
  s.car.vel = add(s.car.vel, scale(n, -closing + UNSTICK.hop));
  const along = alongWall(n, carForward(s.car));
  if (along) s.car.vel = add(s.car.vel, scale(along, UNSTICK.along));
  return pulseInput(s.car, n);
}
