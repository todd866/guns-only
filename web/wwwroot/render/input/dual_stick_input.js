function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Circular deadzone with the remaining travel remapped back to the full unit disc. */
export function radialStickAxes(xValue, yValue, deadzone = 0.14) {
  let x = clamp(finite(xValue), -1, 1);
  let y = clamp(finite(yValue), -1, 1);
  let magnitude = Math.hypot(x, y);
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
    magnitude = 1;
  }
  const neutral = clamp(finite(deadzone, 0.14), 0, 0.45);
  if (magnitude <= neutral) return Object.freeze({ x: 0, y: 0 });
  const remappedMagnitude = (magnitude - neutral) / (1 - neutral);
  const scale = remappedMagnitude / magnitude;
  return Object.freeze({ x: x * scale, y: y * scale });
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (!button) return 0;
  return clamp(Math.max(finite(button.value), button.pressed === true ? 1 : 0), 0, 1);
}

/**
 * Standard-mapping gamepad projection. One flight layout across the fleet
 * (owner, 6 Nov 2026 — RC Odyssey, the toy dogfight, and here): left stick
 * pitch/roll (pull = nose up), right stick look, RT/LT throttle up/down,
 * LB/RB rudder, A guns, B padlock, X limit override, Y wheel brakes (WoW),
 * D-pad Up RTB / Down Gear / Left-Right Flaps, R3 chase camera. The phone's
 * two on-screen sticks use a separate throttle/yaw plus pitch/roll contract.
 */
/** Non-linear response curve preserving zero and full deflection (`expo` in `[0, 0.85]`). */
export function expoCurve(value, expo = 0.35) {
  const x = clamp(finite(value), -1, 1);
  const weight = clamp(finite(expo, 0.35), 0, 0.85);
  return (1 - weight) * x + weight * x * x * x;
}

export function standardGamepadState(gamepad, previous = {}, options = {}) {
  if (!gamepad || gamepad.connected === false || gamepad.mapping !== "standard") {
    return Object.freeze({
      connected: false,
      index: -1,
      roll: 0,
      pitch: 0,
      yaw: 0,
      lookX: 0,
      lookY: 0,
      fire: false,
      limitOverride: false,
      brakeHeld: false,
      padlockPressed: false,
      rtbPressed: false,
      gearPressed: false,
      flapsUpPressed: false,
      flapsDownPressed: false,
      cameraTogglePressed: false,
      throttleDown: false,
      throttleUp: false,
      padlock: false,
      rtb: false,
      gear: false,
      flapsUp: false,
      flapsDown: false,
      cameraToggle: false,
    });
  }
  const flight = radialStickAxes(gamepad.axes?.[0], gamepad.axes?.[1]);
  const look = radialStickAxes(gamepad.axes?.[2], gamepad.axes?.[3], 0.18);
  const expo = clamp(finite(options?.expo, 0), 0, 0.85);
  const padlock = buttonValue(gamepad, 1) > 0.5;
  const rtb = buttonValue(gamepad, 12) > 0.5;
  const gear = buttonValue(gamepad, 13) > 0.5;
  const flapsUp = buttonValue(gamepad, 14) > 0.5;
  const flapsDown = buttonValue(gamepad, 15) > 0.5;
  const cameraToggle = buttonValue(gamepad, 11) > 0.5;
  const rudderLeft = buttonValue(gamepad, 4) > 0.35 ? 1 : 0;
  const rudderRight = buttonValue(gamepad, 5) > 0.35 ? 1 : 0;
  return Object.freeze({
    connected: true,
    index: Math.max(0, Math.trunc(finite(gamepad.index))),
    roll: expo > 0 ? expoCurve(flight.x, expo) : flight.x,
    // Browser standard mapping reports pull-back as positive Y, matching the kernel's +pull axis.
    pitch: expo > 0 ? expoCurve(flight.y, expo) : flight.y,
    yaw: rudderRight - rudderLeft,
    lookX: look.x,
    lookY: look.y,
    fire: buttonValue(gamepad, 0) > 0.5,
    limitOverride: buttonValue(gamepad, 2) > 0.5,
    brakeHeld: buttonValue(gamepad, 3) > 0.5,
    padlockPressed: padlock && previous.padlock !== true,
    rtbPressed: rtb && previous.rtb !== true,
    gearPressed: gear && previous.gear !== true,
    flapsUpPressed: flapsUp && previous.flapsUp !== true,
    flapsDownPressed: flapsDown && previous.flapsDown !== true,
    cameraTogglePressed: cameraToggle && previous.cameraToggle !== true,
    throttleDown: buttonValue(gamepad, 6) > 0.12,
    throttleUp: buttonValue(gamepad, 7) > 0.12,
    padlock,
    rtb,
    gear,
    flapsUp,
    flapsDown,
    cameraToggle,
  });
}

/** Integrate a right-stick look-rate command through the same bounded gimbal as pointer look. */
export function gamepadLookDelta(state, deltaSeconds, {
  yawRateRad = 2.15,
  pitchRateRad = 1.7,
} = {}) {
  const dt = clamp(finite(deltaSeconds), 0, 0.1);
  return Object.freeze({
    yawRad: finite(state?.lookX) * yawRateRad * dt,
    pitchRad: -finite(state?.lookY) * pitchRateRad * dt,
  });
}
