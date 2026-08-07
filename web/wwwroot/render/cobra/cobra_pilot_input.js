import { advanceCobraCollectiveLever } from "./cobra_control_profile.js";

const DEFAULT_COLLECTIVE_FULL_TRAVEL_PER_SECOND = 0.40;
const DEFAULT_CYCLIC_FULL_TRAVEL_PER_SECOND = 2.5;
const DEFAULT_PEDAL_FULL_TRAVEL_PER_SECOND = 2.5;
const DEFAULT_AXIS_DEADZONE = 0.12;
// Attitude-HOLD assist for idle cyclic axes. The AH-1G dynamics are rate-command: a centered
// stick means zero pitch/roll RATE, not a level ship, so a one-second keyboard tap used to
// leave a latched dive attitude that flew the ship into the ground. Builds up to 265 answered
// that by springing an idle axis toward ZERO attitude, which flew the ship level again and
// fought the pilot: nosing over to accelerate and releasing the stick pulled the nose straight
// back up. On 2026-08-06 the owner ruled that out ("way too self-levelling, makes acceleration
// annoying") in favour of DCS-BS1-style attitude hold.
//
// So an idle axis now captures the attitude it was released at and holds THAT, driving the
// error between the measured attitude and the captured reference to zero. Releasing at 12 deg
// nose down keeps 12 deg nose down. Any held key or live analog deflection on the axis
// overrides the assist completely and clears its reference, so the next release captures
// afresh. Gain 3.0/rad saturates the assist at ~9.6 deg of error; authority 0.5 keeps half the
// stick throw in reserve so the assist can never out-muscle the pilot.
//
// The captured reference is clamped to a recoverable envelope, which is what survives of the
// original flew-into-the-ground rationale: the assist will hold a deliberate attitude but will
// not hold a departure. Past the limit it flies the ship back to the edge of the envelope and
// holds there, rather than to level.
const DEFAULT_CYCLIC_LEVELING_GAIN_PER_RAD = 3.0;
const DEFAULT_CYCLIC_LEVELING_AUTHORITY = 0.5;
const DEFAULT_HOLD_PITCH_LIMIT_RAD = 0.35; // ~20 deg
const DEFAULT_HOLD_ROLL_LIMIT_RAD = 1.05; // ~60 deg

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

function finiteOrNull(value) {
  // Guard null/undefined explicitly: Number(null) is 0, which would turn "no hold reference"
  // into a real zero-attitude reference and silently restore the level-to-zero behaviour.
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampSymmetric(value, limit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const bound = Math.abs(Number(limit) || 0);
  return Math.min(bound, Math.max(-bound, numeric));
}

function freezeState(state) {
  return Object.freeze({
    collective: finiteUnit(state.collective, 0, 1),
    forwardCyclic: finiteUnit(state.forwardCyclic),
    rightCyclic: finiteUnit(state.rightCyclic),
    yaw: finiteUnit(state.yaw),
    // Attitude the idle cyclic axis is holding, or null when the pilot has the axis.
    holdPitchRad: finiteOrNull(state.holdPitchRad),
    holdRollRad: finiteOrNull(state.holdRollRad),
  });
}

/**
 * Persistent pilot lever and stick positions for the AH-1G production input path.
 * Collective is a held lever; cyclic and pedals are spring-centred sticks.
 */
export function createCobraPilotControlState(collective = 0.5) {
  return freezeState({
    collective,
    forwardCyclic: 0,
    rightCyclic: 0,
    yaw: 0,
    holdPitchRad: null,
    holdRollRad: null,
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
    // Drop the hold references too: whatever the ship does while the window is unfocused, the
    // pilot did not choose it, so the next focused frame captures a fresh reference.
    holdPitchRad: null,
    holdRollRad: null,
  });
}

/**
 * Leveling command for one idle cyclic axis: a bounded stick deflection proportional to the
 * attitude error, in the sense that drives the error toward zero under the AH-1G's
 * rate-command dynamics (positive pitch = nose up needs forward cyclic; positive roll =
 * right roll needs left cyclic — the caller passes the already-signed error).
 */
function levelingCyclicCommand(attitudeErrorRad, gainPerRad, authority) {
  const error = Number(attitudeErrorRad);
  if (!Number.isFinite(error)) return 0;
  const limit = Math.min(1, Math.max(0, Number(authority) || 0));
  return Math.min(limit, Math.max(-limit, error * gainPerRad));
}

/**
 * Integrate one frame of production pilot input.
 *
 * Digital keyboard axes slew and spring-center. Analog axes remain proportional position
 * demands. When both are present they sum and clamp. Unfocused windows release every command.
 * When a cyclic axis is completely idle and the caller supplies the measured attitude
 * ({ pitchRad, rollRad }), the axis captures that attitude and holds it, because neutral cyclic
 * under rate-command dynamics would freeze the ship in whatever dive or bank the last tap left
 * behind. Holding the released attitude — rather than flying back to level — is what lets the
 * pilot nose over to accelerate and leave it there.
 */
export function advanceCobraPilotControls(state, {
  keyboardIntent = null,
  analogAxes = null,
  attitude = null,
  deltaSeconds,
  focused = true,
  collectiveFullTravelPerSecond = DEFAULT_COLLECTIVE_FULL_TRAVEL_PER_SECOND,
  cyclicFullTravelPerSecond = DEFAULT_CYCLIC_FULL_TRAVEL_PER_SECOND,
  pedalFullTravelPerSecond = DEFAULT_PEDAL_FULL_TRAVEL_PER_SECOND,
  cyclicLevelingGainPerRad = DEFAULT_CYCLIC_LEVELING_GAIN_PER_RAD,
  cyclicLevelingAuthority = DEFAULT_CYCLIC_LEVELING_AUTHORITY,
  holdPitchLimitRad = DEFAULT_HOLD_PITCH_LIMIT_RAD,
  holdRollLimitRad = DEFAULT_HOLD_ROLL_LIMIT_RAD,
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

  // Idle cyclic axes (no digital, no analog) hold the attitude they were released at. The
  // reference is captured on the first idle frame and kept until the pilot takes the axis back.
  const forwardIdle = !analogForward && Math.abs(finiteUnit(digital.forwardCyclic)) < 1e-9;
  const rightIdle = !analogRight && Math.abs(finiteUnit(digital.rightCyclic)) < 1e-9;
  const holdPitchRad = forwardIdle && attitude
    ? current.holdPitchRad ?? clampSymmetric(attitude.pitchRad, holdPitchLimitRad)
    : null;
  const holdRollRad = rightIdle && attitude
    ? current.holdRollRad ?? clampSymmetric(attitude.rollRad, holdRollLimitRad)
    : null;

  const forwardSpringTarget = holdPitchRad === null
    ? forwardTarget
    : levelingCyclicCommand(
      Number(attitude.pitchRad) - holdPitchRad,
      cyclicLevelingGainPerRad,
      cyclicLevelingAuthority,
    );
  const rightSpringTarget = holdRollRad === null
    ? rightTarget
    : levelingCyclicCommand(
      -(Number(attitude.rollRad) - holdRollRad),
      cyclicLevelingGainPerRad,
      cyclicLevelingAuthority,
    );

  return freezeState({
    collective,
    forwardCyclic: analogForward
      ? forwardTarget
      : moveToward(current.forwardCyclic, forwardSpringTarget, cyclicRate * dt),
    rightCyclic: analogRight
      ? rightTarget
      : moveToward(current.rightCyclic, rightSpringTarget, cyclicRate * dt),
    yaw: analogYaw
      ? yawTarget
      : moveToward(current.yaw, yawTarget, pedalRate * dt),
    holdPitchRad,
    holdRollRad,
  });
}
