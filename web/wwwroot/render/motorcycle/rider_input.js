const DEFAULT_AXIS_DEADZONE = 0.12;

function finiteUnit(value, minimum = -1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(minimum, numeric));
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  return finiteUnit(typeof button === "number" ? button : button?.value, 0);
}

export function applyAxisDeadzone(value, deadzone = DEFAULT_AXIS_DEADZONE) {
  const axis = finiteUnit(value);
  const threshold = Math.min(0.95, Math.max(0, Number(deadzone) || 0));
  const magnitude = Math.abs(axis);
  if (magnitude <= threshold) return 0;
  return Math.sign(axis) * (magnitude - threshold) / (1 - threshold);
}

export function dominantSignedAxis(primary, secondary) {
  const a = finiteUnit(primary);
  const b = finiteUnit(secondary);
  return Math.abs(a) >= Math.abs(b) ? a : b;
}

export function gamepadRiderAxes(gamepad) {
  return Object.freeze({
    throttle: buttonValue(gamepad, 7),
    brake: buttonValue(gamepad, 6),
    turn: applyAxisDeadzone(gamepad?.axes?.[0]),
    bodyLateral: applyAxisDeadzone(gamepad?.axes?.[2]),
    bodyForeAft: -applyAxisDeadzone(gamepad?.axes?.[3]),
  });
}
