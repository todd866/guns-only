function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Turn calibrated phone tilt into a continuous lateral-stick command.
 *
 * Four degrees around centre is neutral. Beyond it, an exponential response reserves small phone
 * motions for formation-like corrections while retaining full aileron authority at a deliberate
 * 30-degree tilt. Sensitivity is applied to the measured angle before this function.
 */
export function mobileRollCommand(degrees, {
  deadzoneDegrees = 4,
  fullScaleDegrees = 30,
  exponent = 1.7,
} = {}) {
  const angle = Number(degrees);
  if (!Number.isFinite(angle)) return 0;
  const deadzone = Math.max(0, Number(deadzoneDegrees) || 0);
  const fullScale = Math.max(deadzone + 0.001, Number(fullScaleDegrees) || 30);
  const curve = Math.max(1, Number(exponent) || 1);
  const magnitude = Math.abs(angle);
  if (magnitude <= deadzone) return 0;
  const normalized = clamp((magnitude - deadzone) / (fullScale - deadzone), 0, 1);
  return Math.sign(angle) * normalized ** curve;
}
