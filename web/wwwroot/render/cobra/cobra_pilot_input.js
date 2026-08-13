import { advanceCobraCollectiveLever } from "./cobra_control_profile.js";

const DEFAULT_COLLECTIVE_FULL_TRAVEL_PER_SECOND = 0.40;
const DEFAULT_CYCLIC_FULL_TRAVEL_PER_SECOND = 2.5;
const DEFAULT_PEDAL_FULL_TRAVEL_PER_SECOND = 2.5;
const DEFAULT_AXIS_DEADZONE = 0.12;

/**
 * Cyclic expo. A hover lives in roughly the inner fifth of cyclic travel, and a linear stick
 * spends the same resolution there as it does at the stops — which is why holding a hover felt
 * like the controls were too sensitive precisely where they had to be finest. This curve gives
 * the centre band about a third of its linear command while leaving FULL authority at full
 * deflection, so nothing the aircraft could previously do becomes unreachable.
 *
 * 0 is linear, 1 is pure cubic. 0.65 was chosen so |0.2| stick reads ~0.075 command.
 */
export const COBRA_CYCLIC_EXPO = 0.65;

function finiteUnit(value, minimum = -1, maximum = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function applyAxisDeadzone(value, deadzone = DEFAULT_AXIS_DEADZONE) {
  const axis = finiteUnit(value);
  const threshold = Math.min(0.95, Math.max(0, Number(deadzone) || 0));
  const magnitude = Math.abs(axis);
  if (magnitude <= threshold) return 0;
  return Math.sign(axis) * (magnitude - threshold) / (1 - threshold);
}

function requireFiniteNonNegative(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
  return numeric;
}

function requirePositiveRate(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new RangeError(`${label} must be finite and positive`);
  }
  return numeric;
}

function moveToward(current, target, maxStep) {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}

function freezeState(state) {
  return Object.freeze({
    collective: finiteUnit(state.collective, 0, 1),
    forwardCyclic: finiteUnit(state.forwardCyclic),
    rightCyclic: finiteUnit(state.rightCyclic),
    yaw: finiteUnit(state.yaw),
  });
}

/**
 * Persistent pilot lever and stick positions for the AH-1G production input path.
 * Collective is a held lever; cyclic and pedals are spring-centred sticks.
 */
/**
 * Shapes a cyclic STICK POSITION into the command sent to the flight model. Deliberately not
 * folded into the control state: the state stays a truthful record of where the stick is, so
 * slew, spring-centering and the on-screen readouts keep behaving linearly and the curve cannot
 * compound frame over frame.
 *
 * @param {number} position stick position in [-1, 1]
 * @returns {number} command in [-1, 1], same sign, never larger in magnitude
 */
export function cobraCyclicCommand(position, expo = COBRA_CYCLIC_EXPO) {
  const value = finiteUnit(position);
  const strength = Math.min(1, Math.max(0, Number(expo) || 0));
  const magnitude = Math.abs(value);
  const shaped = strength * magnitude * magnitude * magnitude + (1 - strength) * magnitude;
  return value < 0 ? -shaped : shaped;
}

export function createCobraPilotControlState(collective = 0.5) {
  return freezeState({
    collective,
    forwardCyclic: 0,
    rightCyclic: 0,
    yaw: 0,
  });
}

/**
 * Proportional gamepad/touch axes. Values are already in the aircraft command sense:
 * forward cyclic positive, right cyclic positive, right pedal positive, collective rate
 * positive when pulling.
 */
export function cobraAnalogControlAxes({
  forwardCyclic = 0,
  rightCyclic = 0,
  yaw = 0,
  collectiveRate = 0,
  deadzone = DEFAULT_AXIS_DEADZONE,
} = {}) {
  return Object.freeze({
    forwardCyclic: applyAxisDeadzone(forwardCyclic, deadzone),
    rightCyclic: applyAxisDeadzone(rightCyclic, deadzone),
    yaw: applyAxisDeadzone(yaw, deadzone),
    collectiveRate: finiteUnit(collectiveRate),
  });
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  return finiteUnit(typeof button === "number" ? button : button?.value, 0, 1);
}

/**
 * Standard-mapping gamepad projection for the Cobra: left stick cyclic, right-stick X pedals,
 * right trigger pulls collective and left trigger pushes it. Missing pads fail neutral.
 */
export function cobraGamepadControlAxes(gamepad, deadzone = DEFAULT_AXIS_DEADZONE) {
  if (!gamepad || gamepad.connected === false) {
    return cobraAnalogControlAxes({ deadzone });
  }
  return cobraAnalogControlAxes({
    rightCyclic: gamepad.axes?.[0] ?? 0,
    forwardCyclic: -(gamepad.axes?.[1] ?? 0),
    yaw: gamepad.axes?.[2] ?? 0,
    collectiveRate: buttonValue(gamepad, 7) - buttonValue(gamepad, 6),
    deadzone,
  });
}

/**
 * Focus loss and page-hide release: zero every spring-centred command immediately while leaving
 * the collective lever where the pilot last set it.
 */
export function releaseCobraPilotControls(state) {
  return freezeState({
    collective: state?.collective ?? 0.5,
    forwardCyclic: 0,
    rightCyclic: 0,
    yaw: 0,
  });
}

/**
 * Integrate one frame of production pilot input.
 *
 * Digital keyboard axes slew and spring-center. Analog axes remain proportional position
 * demands. When both are present they sum and clamp. Unfocused windows release every command.
 * Aircraft attitude is deliberately absent from this input seam: neutral cyclic cannot create a
 * hidden command. Stability augmentation, if any, belongs in an explicit flight-model mode.
 */
export function advanceCobraPilotControls(state, {
  keyboardIntent = null,
  analogAxes = null,
  deltaSeconds,
  focused = true,
  collectiveFullTravelPerSecond = DEFAULT_COLLECTIVE_FULL_TRAVEL_PER_SECOND,
  cyclicFullTravelPerSecond = DEFAULT_CYCLIC_FULL_TRAVEL_PER_SECOND,
  pedalFullTravelPerSecond = DEFAULT_PEDAL_FULL_TRAVEL_PER_SECOND,
} = {}) {
  const current = freezeState(state ?? createCobraPilotControlState());
  const dt = requireFiniteNonNegative(deltaSeconds, "deltaSeconds");
  if (focused !== true) return releaseCobraPilotControls(current);

  const collectiveRate = requirePositiveRate(
    collectiveFullTravelPerSecond,
    "collectiveFullTravelPerSecond",
  );
  const cyclicRate = requirePositiveRate(
    cyclicFullTravelPerSecond,
    "cyclicFullTravelPerSecond",
  );
  const pedalRate = requirePositiveRate(
    pedalFullTravelPerSecond,
    "pedalFullTravelPerSecond",
  );

  const digital = keyboardIntent ?? Object.freeze({
    collectiveRate: 0,
    forwardCyclic: 0,
    rightCyclic: 0,
    yaw: 0,
  });
  const analog = analogAxes ?? Object.freeze({
    collectiveRate: 0,
    forwardCyclic: 0,
    rightCyclic: 0,
    yaw: 0,
  });

  const combinedCollectiveRate = finiteUnit(
    finiteUnit(digital.collectiveRate) + finiteUnit(analog.collectiveRate),
  );
  const collective = advanceCobraCollectiveLever(
    current.collective,
    { collectiveRate: combinedCollectiveRate },
    dt,
    collectiveRate,
  );

  const forwardTarget = finiteUnit(
    finiteUnit(digital.forwardCyclic) + finiteUnit(analog.forwardCyclic),
  );
  const rightTarget = finiteUnit(
    finiteUnit(digital.rightCyclic) + finiteUnit(analog.rightCyclic),
  );
  const yawTarget = finiteUnit(finiteUnit(digital.yaw) + finiteUnit(analog.yaw));

  // Analog sticks are proportional position demands: when analog dominates an axis, snap to the
  // combined target so device travel stays 1:1. Pure digital axes keep the slew/spring path.
  const analogForward = Math.abs(finiteUnit(analog.forwardCyclic)) > 1e-9;
  const analogRight = Math.abs(finiteUnit(analog.rightCyclic)) > 1e-9;
  const analogYaw = Math.abs(finiteUnit(analog.yaw)) > 1e-9;

  return freezeState({
    collective,
    forwardCyclic: analogForward
      ? forwardTarget
      : moveToward(current.forwardCyclic, forwardTarget, cyclicRate * dt),
    rightCyclic: analogRight
      ? rightTarget
      : moveToward(current.rightCyclic, rightTarget, cyclicRate * dt),
    yaw: analogYaw
      ? yawTarget
      : moveToward(current.yaw, yawTarget, pedalRate * dt),
  });
}
