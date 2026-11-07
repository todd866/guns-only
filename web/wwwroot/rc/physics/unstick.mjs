// A toy car nose-into a wall makes no progress. The old kid assist teleported.
// This is the physical answer: more wheel drive, a torque that stands the body
// up on the contact, and a small hop off that contact. Never a position reset.
import {add, sub, scale, dot, cross, len, norm, rotate, unrotate} from './math.mjs';
import {carUp, carForward} from './car.mjs';

export const UNSTICK = Object.freeze({
  window: 2, // s of throttle or steer with little travel
  progress: 1, // m that counts as "it is moving"
  input: 0.15,
  pulse: 0.45, // s the extra drive and righting torque stay on
  hop: 1.7, // m/s along the contact normal
  boost: 2.4 // extra wheel drive, on top of whatever the transmitter asked
});

function dominantNormal(car) {
  const wheels = car.wheels.filter(w => w.contact && w.contactNormal).map(w => w.contactNormal);
  const hull = (car.hullContacts ?? []).map(c => c.normal);
  const fwd = carForward(car);
  let best = null,
    score = -Infinity;
  for (const n of [...hull, ...wheels]) {
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
export function stepUnstick(s, raw, dt = 1 / 120) {
  const u = (s.unstick ??= {t: 0, anchor: null, pulse: 0, normal: null, hopped: false});
  if (u.pulse > 0) {
    u.pulse = Math.max(0, u.pulse - dt);
    const n = u.normal ?? [0, 1, 0];
    return {boost: UNSTICK.boost, torque: uprightTorque(s.car, n)};
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
  const n = dominantNormal(s.car);
  u.normal = n;
  u.pulse = UNSTICK.pulse;
  s.car.vel = add(s.car.vel, scale(n, UNSTICK.hop));
  return {boost: UNSTICK.boost, torque: uprightTorque(s.car, n)};
}
