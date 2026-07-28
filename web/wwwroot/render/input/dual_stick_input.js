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
 * Standard-mapping gamepad projection. It intentionally mirrors the phone:
 * left stick flies, right stick looks, right trigger fires, A padlocks, bumpers move power.
 */
export function standardGamepadState(gamepad, previous = {}) {
  if (!gamepad || gamepad.connected === false || gamepad.mapping !== "standard") {
    return Object.freeze({
      connected: false,
      index: -1,
      roll: 0,
      pitch: 0,
      lookX: 0,
      lookY: 0,
      fire: false,
      padlockPressed: false,
      throttleDown: false,
      throttleUp: false,
    });
  }
  const flight = radialStickAxes(gamepad.axes?.[0], gamepad.axes?.[1]);
  const look = radialStickAxes(gamepad.axes?.[2], gamepad.axes?.[3], 0.18);
  const padlock = buttonValue(gamepad, 0) > 0.5;
  return Object.freeze({
    connected: true,
    index: Math.max(0, Math.trunc(finite(gamepad.index))),
    roll: flight.x,
    // Browser standard mapping reports pull-back as positive Y, matching the kernel's +pull axis.
    pitch: flight.y,
    lookX: look.x,
    lookY: look.y,
    fire: buttonValue(gamepad, 7) > 0.12,
    padlockPressed: padlock && previous.padlock !== true,
    throttleDown: buttonValue(gamepad, 4) > 0.5,
    throttleUp: buttonValue(gamepad, 5) > 0.5,
    padlock,
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
