// Mario-Kart-style drift. A press edge at speed hops the car; holding the button with a turn
// keeps it sliding for as long as it is held, steering tightens or widens the arc, and the
// slide charges sparks through three tiers. Releasing on the wheels fires a mini-turbo sized by
// the tier. A straight hop (no turn chosen) never charges, and a missed landing ends the slide.
export const DRIFT = Object.freeze({
  minSpeed: 3,
  holdSpeed: 2,
  hop: 0.72,
  hopWindow: 0.11,
  maxAirTime: 0.32,
  cooldown: 0.4,
  lateralGripScale: 0.5,
  yawGain: 2.4,
  yawRate: 0.12,
  maxYaw: 1.9,
  // Steering into the drift tightens the arc by up to this much; countersteer widens it.
  trim: 0.45,
  // Seconds of sliding for blue, orange and purple sparks; steering into the drift charges faster.
  tiers: [0.55, 1.2, 2],
  kidCharge: 1.35,
  turbo: [0.5, 0.9, 1.35],
  turboBoost: 1.45,
  turboKick: [0.9, 1.5, 2.2],
  // A kart drift carries its speed through the corner. Below this share of the entry speed the
  // slide is topped up along its own direction of travel, never above the entry speed.
  carry: 0.9,
  carryAccel: 7,
  // The slide settles at this slip angle (radians) instead of swinging ever wider, and a
  // release straightens most of the remaining slip so the turbo points down the road.
  maxSlip: 0.45,
  straighten: 0.7,
});

export function createDrift() {
  return { held: false, active: false, hopTime: 0, airTime: 0, cooldown: 0, direction: 0, charge: 0, tier: 0, turbo: 0, fired: 0 };
}

export function driftTier(charge) { return DRIFT.tiers.reduce((t, at) => charge >= at ? t + 1 : t, 0); }

export function stepDrift(state, car, raw = {}, dt = 1 / 120, upright = 1, mode = 'bigKid') {
  const pressed = !!raw.drift;
  const edge = pressed && !state.held;
  state.held = pressed;
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.turbo = Math.max(0, state.turbo - dt);
  state.fired = 0;
  let hop = 0, kick = 0;

  if (edge && state.cooldown <= 0 && car.grounded && upright > 0.65 && car.forwardSpeed >= DRIFT.minSpeed) {
    state.active = true;
    state.hopTime = DRIFT.hopWindow;
    state.airTime = 0;
    state.cooldown = DRIFT.cooldown;
    state.direction = Math.sign(raw.steer || 0);
    state.charge = 0; state.tier = 0; state.entry = car.forwardSpeed;
    hop = DRIFT.hop;
  }

  if (state.active) {
    // A player can tap drift before choosing a direction. Acquire the first meaningful
    // steer input during the hop, then latch it for the rest of the slide so a countersteer
    // trims the line without reversing the drift direction.
    if (state.direction === 0 && state.hopTime > 0 && raw.steer) state.direction = Math.sign(raw.steer);
    state.hopTime = Math.max(0, state.hopTime - dt);
    if (!car.grounded) state.airTime += dt;
    else state.airTime = 0;
    const into = state.direction * Math.max(-1, Math.min(1, raw.steer || 0));
    if (state.direction && car.grounded && state.hopTime <= 0) {
      state.charge += dt * (0.75 + 0.5 * Math.max(0, into)) * (mode === 'kid' ? DRIFT.kidCharge : 1);
      state.tier = driftTier(state.charge);
    }
    const lost = state.airTime > DRIFT.maxAirTime || car.forwardSpeed < DRIFT.holdSpeed || upright < 0.5;
    if (!pressed || lost) {
      // Only a release on the wheels pays out; spinning out or flying off a ledge forfeits it.
      if (!pressed && !lost && car.grounded && state.tier > 0) {
        state.turbo = DRIFT.turbo[state.tier - 1];
        state.fired = state.tier;
        kick = DRIFT.turboKick[state.tier - 1];
      }
      state.active = false;
      state.hopTime = 0;
      state.airTime = 0;
      state.direction = 0;
      state.charge = 0; state.tier = 0;
    }
  }

  const turbo = state.turbo > 0 ? DRIFT.turboBoost : 1;
  if (!state.active) return { active: false, hop, kick, turbo, fired: state.fired, tier: 0, lateralGripScale: 1, yawTarget: 0, yawGain: 0 };
  const into = state.direction * Math.max(-1, Math.min(1, raw.steer || 0));
  return {
    active: true,
    hop, kick, turbo, fired: 0,
    tier: state.tier,
    carry: state.entry * DRIFT.carry,
    lateralGripScale: DRIFT.lateralGripScale,
    // Car yaw is opposite the body's positive world-Y angular velocity, so assistInput
    // converts this target into a bounded PD torque. A zero direction means no steering bias.
    yawTarget: -state.direction * Math.min(DRIFT.maxYaw, car.forwardSpeed * DRIFT.yawRate) * (1 + DRIFT.trim * into),
    yawGain: DRIFT.yawGain,
  };
}
