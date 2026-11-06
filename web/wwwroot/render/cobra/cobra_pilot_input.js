import { advanceCobraCollectiveLever } from "./cobra_control_profile.js";
import { FLIGHT_PAD, faceIndex, leverAxis, pedalAxis } from "../../rc/flight_layout.mjs";

const DEFAULT_COLLECTIVE_FULL_TRAVEL_PER_SECOND = 0.40;
const DEFAULT_CYCLIC_FULL_TRAVEL_PER_SECOND = 2.5;
const DEFAULT_PEDAL_FULL_TRAVEL_PER_SECOND = 2.5;
const DEFAULT_AXIS_DEADZONE = 0.12;

/**
 * Authored play-mode ramp position. Zero is the physical full-down stop, not hover trim; the
 * pilot must deliberately pull collective before the AH-1G can leave its skids.
 */
export const COBRA_GROUNDED_COLLECTIVE = 0;

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

export function createCobraPilotControlState(collective = COBRA_GROUNDED_COLLECTIVE) {
  return freezeState({
    collective,
    forwardCyclic: 0,
    rightCyclic: 0,
    yaw: 0,
  });
}

/**
 * Fresh production-sortie controls. The named constructor keeps the ramp-start contract explicit
 * at play/restart/swap call sites: a playable aircraft never inherits hover collective from an
 * authority snapshot or an earlier airframe.
 */
export function createCobraGroundedPilotControlState() {
  return createCobraPilotControlState(COBRA_GROUNDED_COLLECTIVE);
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

function buttonHeld(gamepad, index) {
  if (!gamepad || gamepad.connected === false) return false;
  const button = gamepad.buttons?.[index];
  if (typeof button === "number") return button > 0.5;
  return button?.pressed === true || Number(button?.value) > 0.5;
}

/**
 * One pad layout across guns-only, the helicopters and RC (owner, 6 Nov 2026;
 * rc/flight_layout.mjs): printed A holds gunner consent — the same button that
 * is guns everywhere else — and printed B cycles the gunner mark, the same
 * target job as guns-only's B padlock. The letters follow the pad's print
 * (the SN30 swaps them). A held face button must not spin through every mark —
 * only the rising edge cycles. Y keeps the turnaround action (cobra_turnaround.js).
 */
export function cobraGamepadFireButton(gamepad) {
  return faceIndex(String(gamepad?.id ?? ""), "A");
}
export function cobraGamepadCycleTargetButton(gamepad) {
  return faceIndex(String(gamepad?.id ?? ""), "B");
}

export function cobraGamepadCombatState(gamepad, previous = null) {
  const cycleTarget = buttonHeld(gamepad, cobraGamepadCycleTargetButton(gamepad));
  return Object.freeze({
    fire: buttonHeld(gamepad, cobraGamepadFireButton(gamepad)),
    cycleTarget,
    cycleTargetPressed: cycleTarget && previous?.cycleTarget !== true,
  });
}

/**
 * Standard-mapping gamepad projection for the Cobra, on the shared flight rows
 * (rc/flight_layout.mjs): left stick cyclic, LB/RB pedals (right pedal yaws
 * right), right trigger pulls collective and left trigger pushes it. The right
 * stick is RESERVED for look: the authority camera is body-fixed (forward =
 * nose-forward, the optical-centre contract above syncAuthorityCamera), so
 * binding it is a deliberate camera change, not an input remap — the same
 * treatment as guns-only's reserved LB/RB rudder channel. Missing pads fail
 * neutral.
 */
export function cobraGamepadControlAxes(gamepad, deadzone = DEFAULT_AXIS_DEADZONE) {
  if (!gamepad || gamepad.connected === false) {
    return cobraAnalogControlAxes({ deadzone });
  }
  return cobraAnalogControlAxes({
    rightCyclic: gamepad.axes?.[FLIGHT_PAD.LS_X] ?? 0,
    forwardCyclic: -(gamepad.axes?.[FLIGHT_PAD.LS_Y] ?? 0),
    yaw: pedalAxis(buttonHeld(gamepad, FLIGHT_PAD.LB), buttonHeld(gamepad, FLIGHT_PAD.RB)),
    collectiveRate: leverAxis(buttonValue(gamepad, FLIGHT_PAD.RT), buttonValue(gamepad, FLIGHT_PAD.LT)),
    deadzone,
  });
}

/**
 * Focus loss and page-hide release: zero every spring-centred command immediately while leaving
 * the collective lever where the pilot last set it.
 */
export function releaseCobraPilotControls(state) {
  return freezeState({
    collective: state?.collective ?? COBRA_GROUNDED_COLLECTIVE,
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
