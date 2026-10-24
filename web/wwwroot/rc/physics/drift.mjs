// Optional Mario-Kart-style hop/slide. A press edge starts a tiny hop only when the car is
// moving on its wheels; the slide then relaxes lateral grip for a short, finite window. There
// is no boost, airtime chain, or requirement to use this to complete a course.
export const DRIFT = Object.freeze({
  minSpeed: 3,
  hop: 0.72,
  hopWindow: 0.11,
  slideWindow: 0.72,
  maxAirTime: 0.32,
  cooldown: 0.4,
  lateralGripScale: 0.58,
  yawGain: 2.4,
  yawRate: 0.14,
});

export function createDrift() {
  return { held: false, active: false, hopTime: 0, slideTime: 0, airTime: 0, cooldown: 0, direction: 0 };
}

export function stepDrift(state, car, raw = {}, dt = 1 / 120, upright = 1) {
  const pressed = !!raw.drift;
  const edge = pressed && !state.held;
  state.held = pressed;
  state.cooldown = Math.max(0, state.cooldown - dt);
  let hop = 0;

  if (edge && state.cooldown <= 0 && car.grounded && upright > 0.65 && car.forwardSpeed >= DRIFT.minSpeed) {
    state.active = true;
    state.hopTime = DRIFT.hopWindow;
    state.slideTime = DRIFT.slideWindow;
    state.airTime = 0;
    state.cooldown = DRIFT.cooldown;
    state.direction = Math.sign(raw.steer || 0);
    hop = DRIFT.hop;
  }

  if (state.active) {
    // A player can tap drift before choosing a direction. Acquire the first meaningful
    // steer input during the hop, then latch it for the rest of the slide so a countersteer
    // trims the line without reversing the drift direction.
    if (state.direction === 0 && raw.steer) state.direction = Math.sign(raw.steer);
    state.hopTime = Math.max(0, state.hopTime - dt);
    state.slideTime = Math.max(0, state.slideTime - dt);
    if (!car.grounded) state.airTime += dt;
    else state.airTime = 0;
    // A missed landing or a released button ends the slide cleanly; no infinite hopping.
    if (!pressed || state.slideTime <= 0 || state.airTime > DRIFT.maxAirTime) {
      state.active = false;
      state.hopTime = 0;
      state.slideTime = 0;
      state.airTime = 0;
      state.direction = 0;
    }
  }

  return state.active ? {
    active: true,
    hop,
    lateralGripScale: DRIFT.lateralGripScale,
    // Car yaw is opposite the body's positive world-Y angular velocity, so assistInput
    // converts this target into a bounded PD torque. A zero direction means no steering bias.
    yawTarget: -state.direction * Math.min(2.4, car.forwardSpeed * DRIFT.yawRate),
    yawGain: DRIFT.yawGain,
  } : { active: false, hop, lateralGripScale: 1, yawTarget: 0, yawGain: 0 };
}
