// Play-first transmitter assists: predictable steering, optional drift, wheels-down
// landings and an authored quarter-pipe return. Big Kid reduces steering stabilization.
import { dot, cross, scale, sub, add, rotate, unrotate } from './math.mjs';
import { carUp, carForward } from './car.mjs';
import { createDrift, stepDrift, DRIFT } from './drift.mjs';
import { stepQuarterReturn } from './quarter-return.mjs';
import { SURFACES } from './world.mjs';

export const MODES = {
  kid: { steerFalloff: 0.1, yawHold: 8, airLevel: true, autoRight: true, freeRecovery: true },
  // Big Kid still has a gentle transmitter stabiliser and air attitude help. It rewards a
  // clean line without making precision steering or mid-air correction into homework.
  bigKid: { steerFalloff: 0.035, yawHold: 2.4, airLevel: true, autoRight: false, freeRecovery: false },
};

export function createAssist(mode = 'kid') { return { mode, flipTime: 0, righting: 0, airTime: 0, drift: createDrift() }; }

// Turns the raw transmitter input into the input stepCar receives.
export function assistInput(a, car, raw, dt, world) {
  const m = MODES[a.mode], p = car.params, out = { ...raw };
  if(a.placement !== (car.placement ?? 0)) {
    a.placement = car.placement ?? 0;
    a.drift = createDrift(); a.drift.held = !!raw.drift; a.quarter = {};
  }
  const speed = Math.abs(car.forwardSpeed);
  out.steerLimit = p.maxSteer / (1 + m.steerFalloff * speed);
  const up = carUp(car), I = 1 / car.invInertia[0];
  let torque = [0, 0, 0];
  const drift = stepDrift(a.drift, car, raw, dt, up[1], a.mode);
  const quarter = stepQuarterReturn(a.quarter ??= {}, car, raw, dt, world);

  // Yaw hold: damp yaw rate toward what the front wheels ask for, so the rear does not swap
  // ends on a six-year-old. Wheelbase from the wheel layout.
  const wheelGrips = car.wheels.map(w => SURFACES[w.surface]?.grip ?? 1).filter(Number.isFinite);
  const lowGrip = wheelGrips.length ? Math.min(...wheelGrips) : 1;
  // A yaw damper that is helpful on asphalt fights the intentional slip of ice and snow.
  // Let the tyre model own those surfaces; retain stabilization on ordinary roads.
  if (m.yawHold && car.contacts >= 3 && (a.mode === 'kid' || lowGrip >= 0.72)) {
    const L = Math.abs(p.wheels[0].at[2] - p.wheels[2].at[2]);
    // What the front wheels ask for, capped at what tyre grip can deliver (a ≈ 1.2 g).
    const kinematic = -car.forwardSpeed * Math.tan(car.steer) / L, gripLimit = 1.2 * 9.81 / Math.max(1, Math.abs(car.forwardSpeed));
    const wanted = Math.max(-gripLimit, Math.min(gripLimit, kinematic)), actual = dot(car.ang, up);
    torque = add(torque, scale(up, -m.yawHold * (drift.active ? .35 : 1) * (actual - wanted) / car.invInertia[1]));
  }
  // Air levelling: in the air, ease the body toward wheels-down so landings land. A
  // steer (or an explicit airControl input) gives a small, bounded hip-transfer control:
  // steer rolls around the car's forward axis, while airControl may pitch around its
  // right axis. Held accelerator alone keeps the normal upright assist. This is
  // torque only (no velocity or position injection), so a transfer can shape a landing
  // without becoming a hidden boost or a mandatory trick system.
  if (quarter) {
    torque = add(torque, quarter); a.airTime = 0;
  } else if (m.airLevel && car.contacts === 0) {
    // Road seams and kerb tops can briefly report zero contacts. Keep normal
    // levelling immediate, but wait for a sustained airborne state before
    // optional hip steering can influence the attitude.
    a.airTime += dt;
    // Keep the landing gyro in charge after a seam kicks the chassis into a tumble.
    const stable = up[1] > .5 && Math.hypot(car.ang[0], car.ang[2]) < 4;
    const transfer = stable && a.airTime >= 0.1 && (Math.abs(raw.steer || 0) > 0.05 || raw.airControl);
    torque = add(torque, levelTorque(car, up, transfer ? 2.2 : 5));
    if (transfer) {
      const fwd = carForward(car), right = rotate(car.q, [1, 0, 0]);
      const iz = 1 / car.invInertia[2];
      const steer = Math.max(-1, Math.min(1, raw.steer || 0));
      const throttle = raw.airControl ? Math.max(-1, Math.min(1, raw.throttle || 0)) : 0;
      // Peak angular acceleration is deliberately modest for the 0.5–1.0 s airtime
      // of the RC kickers. It is enough to bank through a hip, never enough to spin
      // the car into a new heading by itself.
      torque = add(torque, scale(fwd, steer * iz * 2.4));
      torque = add(torque, scale(right, throttle * I * 1.8));
    }
  } else {
    a.airTime = 0;
  }

  // Auto-right: upside-down or on its side and stopped for 0.8 s → hop and roll upright.
  const stuck = up[1] < 0.3 && car.speed < 1.5;
  a.flipTime = stuck ? a.flipTime + dt : 0;
  if (m.autoRight && a.flipTime > 0.8 && a.righting <= 0) { a.righting = 0.7; car.vel[1] += 2.2; a.flipTime = 0; }
  if (a.righting > 0) { a.righting -= dt; torque = add(torque, levelTorque(car, up, 14)); }

  // Drift is opt-in. The edge-triggered hop and the held slide are bounded by drift.mjs;
  // releasing the button returns to the normal tyre model and pays out any charged mini-turbo.
  if (drift.hop) car.vel[1] += drift.hop;
  // Turn the horizontal velocity toward the heading: during a slide it carves at maxSlip; on a
  // paid-out release most of the slip straightens so the mini-turbo shoots along the nose.
  const keep = drift.active ? DRIFT.maxSlip : drift.fired ? null : undefined;
  if (keep !== undefined && car.grounded) {
    const f = carForward(car), h = Math.atan2(f[0], f[2]), v = Math.atan2(car.vel[0], car.vel[2]);
    const slip = Math.atan2(Math.sin(h - v), Math.cos(h - v));
    const turn = keep === null ? slip * DRIFT.straighten : Math.sign(slip) * Math.max(0, Math.abs(slip) - keep);
    if (turn && Math.hypot(car.vel[0], car.vel[2]) > 0.5) {
      const c = Math.cos(turn), sn = Math.sin(turn), x = car.vel[0], z = car.vel[2];
      car.vel[0] = x * c + z * sn; car.vel[2] = -x * sn + z * c;
    }
  }
  if (drift.kick) { const f = carForward(car); car.vel = add(car.vel, scale([f[0], 0, f[2]], drift.kick / Math.max(1e-6, Math.hypot(f[0], f[2])))); }
  if (drift.turbo > 1) out.boost = (raw.boost ?? 1) * drift.turbo;
  a.driftFired = drift.fired; a.driftTier = drift.tier; if (drift.fired) a.turbos = (a.turbos ?? 0) + 1;
  if (drift.active) {
    out.lateralGripScale = drift.lateralGripScale;
    const flat = Math.hypot(car.vel[0], car.vel[2]);
    if (car.grounded && (raw.throttle ?? 0) > 0 && flat > 0.5 && flat < drift.carry) {
      const dv = Math.min(drift.carry - flat, DRIFT.carryAccel * dt) / flat;
      car.vel[0] += car.vel[0] * dv; car.vel[2] += car.vel[2] * dv;
    }
    if (drift.yawTarget) {
      const actual = dot(car.ang, up);
      torque = add(torque, scale(up, -drift.yawGain * (actual - drift.yawTarget) / car.invInertia[1]));
    }
  }

  a.skateAir = raw.skate && car.contacts === 0 ? (a.skateAir ?? 0) + dt : 0;
  a.skateSpinning = a.skateAir > .12 && raw.drift && Math.abs(raw.steer || 0) > .25;
  if (a.skateSpinning) {
    // A held grab and steer spins in the air; the wheels-down assist still owns pitch/roll.
    torque[1] = (-raw.steer * 9 - car.ang[1]) * 8 / car.invInertia[1];
  }
  out.torque = torque;
  return out;
}

// PD torque that rotates the body's up axis toward world up, leaving yaw alone.
function levelTorque(car, up, omega) {
  let err = cross(up, [0, 1, 0]);
  // Exactly inverted, the cross product vanishes: roll about the car's own forward axis.
  if (up[1] < 0 && Math.hypot(...err) < 0.3) err = add(err, scale(carForward(car), 0.3));
  const angNoYaw = sub(car.ang, scale([0, 1, 0], car.ang[1]));
  const acceleration = sub(scale(err, omega * omega), scale(angNoYaw, 2 * 0.8 * omega));
  return rotate(car.q, unrotate(car.q, acceleration).map((v, i) => v / car.invInertia[i]));
}

export { carForward };
