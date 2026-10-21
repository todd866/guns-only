// Kid mode. Assists are honest pilots: they shape the inputs and add bounded torques the way a
// steady hand on the transmitter would. They never change the car's physics. Big Kid turns
// them down to plain speed-sensitive steering, as in a real RC transmitter's dual rate.
import { dot, cross, scale, sub, add } from './math.mjs';
import { carUp, carForward } from './car.mjs';

export const MODES = {
  kid: { steerFalloff: 0.1, yawHold: 8, airLevel: true, autoRight: true, freeRecovery: true },
  bigKid: { steerFalloff: 0.035, yawHold: 0, airLevel: false, autoRight: false, freeRecovery: false },
};

export function createAssist(mode = 'kid') { return { mode, flipTime: 0, righting: 0 }; }

// Turns the raw transmitter input into the input stepCar receives.
export function assistInput(a, car, raw, dt) {
  const m = MODES[a.mode], p = car.params, out = { ...raw };
  const speed = Math.abs(car.forwardSpeed);
  out.steerLimit = p.maxSteer / (1 + m.steerFalloff * speed);
  const up = carUp(car), I = 1 / car.invInertia[0];
  let torque = [0, 0, 0];

  // Yaw hold: damp yaw rate toward what the front wheels ask for, so the rear does not swap
  // ends on a six-year-old. Wheelbase from the wheel layout.
  if (m.yawHold && car.contacts >= 3) {
    const L = Math.abs(p.wheels[0].at[2] - p.wheels[2].at[2]);
    // What the front wheels ask for, capped at what tyre grip can deliver (a ≈ 1.2 g).
    const kinematic = -car.forwardSpeed * Math.tan(car.steer) / L, gripLimit = 1.2 * 9.81 / Math.max(1, Math.abs(car.forwardSpeed));
    const wanted = Math.max(-gripLimit, Math.min(gripLimit, kinematic)), actual = dot(car.ang, up);
    torque = add(torque, scale(up, -m.yawHold * (actual - wanted) / car.invInertia[1]));
  }
  // Air levelling: in the air, ease the body toward wheels-down so landings land.
  if (m.airLevel && car.contacts === 0) torque = add(torque, levelTorque(car, up, I, 5));

  // Auto-right: upside-down or on its side and stopped for 0.8 s → hop and roll upright.
  const stuck = up[1] < 0.3 && car.speed < 1.5;
  a.flipTime = stuck ? a.flipTime + dt : 0;
  if (m.autoRight && a.flipTime > 0.8 && a.righting <= 0) { a.righting = 0.7; car.vel[1] += 2.2; a.flipTime = 0; }
  if (a.righting > 0) { a.righting -= dt; torque = add(torque, levelTorque(car, up, I, 14)); }

  out.torque = torque;
  return out;
}

// PD torque that rotates the body's up axis toward world up, leaving yaw alone.
function levelTorque(car, up, I, omega) {
  let err = cross(up, [0, 1, 0]);
  // Exactly inverted, the cross product vanishes: roll about the car's own forward axis.
  if (up[1] < 0 && Math.hypot(...err) < 0.3) err = add(err, scale(carForward(car), 0.3));
  const angNoYaw = sub(car.ang, scale([0, 1, 0], car.ang[1]));
  return sub(scale(err, I * omega * omega), scale(angNoYaw, 2 * 0.8 * I * omega));
}

export { carForward };
