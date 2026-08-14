/**
 * Browser projection of the Cobra's authority-owned ramp turnaround.
 *
 * This module does not run a timer or advance a phase. It only maps the one contextual cockpit
 * action and reads the capability flags published by CobraMissionRuntime. Keeping those jobs
 * pure makes a stale browser frame harmless: authority still decides whether a hold counts,
 * whether the rotor is safe to leave, and when the spare is ready to fly.
 */

export const COBRA_TURNAROUND_ACTION_CODE = "KeyE";
// Standard Gamepad mapping: button 3 is the north/Y face button. It does not collide with the
// triggers used for collective or the gunner's trigger contract.
export const COBRA_TURNAROUND_GAMEPAD_BUTTON = 3;

function gamepadButtonHeld(gamepad, index) {
  if (!gamepad || gamepad.connected === false) return false;
  const button = gamepad.buttons?.[index];
  if (typeof button === "number") return button > 0.5;
  return button?.pressed === true || Number(button?.value) > 0.5;
}

export function cobraTurnaroundActionHeld({ activeCodes, gamepad } = {}) {
  const keyboard = typeof activeCodes?.has === "function"
    && activeCodes.has(COBRA_TURNAROUND_ACTION_CODE);
  return keyboard || gamepadButtonHeld(gamepad, COBRA_TURNAROUND_GAMEPAD_BUTTON);
}

export function cobraTurnaroundIsActive(turnaround) {
  const phase = String(turnaround?.phase ?? "").trim().toLowerCase();
  return phase !== "" && phase !== "none" && phase !== "operational";
}

export function cobraTurnaroundLocksFlightControls(turnaround) {
  if (typeof turnaround?.flight_controls_enabled === "boolean") {
    return !turnaround.flight_controls_enabled;
  }
  return cobraTurnaroundIsActive(turnaround);
}
