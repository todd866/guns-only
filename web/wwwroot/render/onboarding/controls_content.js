/**
 * Per-mode onboarding content for the shared first-run controls overlay.
 *
 * One shared implementation (first_run_controls.js), per-mode data here — never forked DOM.
 * Grouping doctrine: a compact MISSION truth can precede FLY when the rules are not inferable;
 * otherwise FLY (or RIDE) comes first, FIGHT second, SYSTEM last. A brand-new player must know
 * both why and what to press in the first ten seconds. Touch variants are honest: these pages
 * have no touch control surface today, so the glass says keyboard/gamepad instead of pretending
 * W is a button (touch-control-layout doctrine: never lie about the control surface).
 *
 * The F-22 shell is intentionally absent: it already teaches through its ready-screen legend,
 * the persistent "H · CONTROLS" chip and the CONTROL QUICKLOOK card, plus real touch controls
 * with on-screen labels in touch mode.
 */

export const COBRA_ONBOARDING_CONTENT = Object.freeze({
  modeId: "cobra-hold-the-bridge",
  title: "AH-1G · HOLD THE BRIDGE",
  desktop: Object.freeze([
    Object.freeze({
      label: "MISSION",
      rows: Object.freeze([
        Object.freeze(["BREAK", "Kill the garrison and clear the point"]),
        Object.freeze(["COVER", "Protect the inbound squad while it captures"]),
        Object.freeze(["HOLD", "A point majority drains enemy tickets"]),
        Object.freeze(["RECOVER", "After the ticket result, land stable at Camp Ember"]),
        Object.freeze(["M · MAP", "Score and captures — the fight keeps running"]),
      ]),
    }),
    Object.freeze({
      label: "FLY",
      rows: Object.freeze([
        Object.freeze(["W / S", "Collective up / down — hold W to lift"]),
        Object.freeze(["↑ ↓ ← →", "Cyclic — nose down / up, bank left / right"]),
        Object.freeze(["A / D", "Pedals — yaw left / right"]),
      ]),
    }),
    Object.freeze({
      label: "FIGHT",
      rows: Object.freeze([
        Object.freeze(["Tab", "Cycle hostile target"]),
        Object.freeze(["V", "Padlock on / off the selected mark"]),
        Object.freeze(["hold F", "Gunner engages the cued target"]),
      ]),
    }),
    Object.freeze({
      label: "SYSTEM",
      rows: Object.freeze([
        Object.freeze(["E", "Shut down a damaged bird · start the spare"]),
        Object.freeze(["R", "Restart after the debrief"]),
        Object.freeze(["Esc", "Pause · resume from the mission menu"]),
        Object.freeze(["Gamepad", "Sticks fly · trigger consents the gunner"]),
      ]),
    }),
  ]),
  touch: Object.freeze([
    Object.freeze({
      label: "THIS MISSION",
      rows: Object.freeze([
        Object.freeze(["Keyboard", "Hold the Bridge flies on physical keys today"]),
        Object.freeze(["Gamepad", "Sticks fly · trigger consents the gunner"]),
      ]),
    }),
  ]),
});

export const WEEKEND_RIDE_ONBOARDING_CONTENT = Object.freeze({
  modeId: "weekend-ride",
  title: "YZF-R1 · WEEKEND RIDE",
  desktop: Object.freeze([
    Object.freeze({
      label: "RIDE",
      rows: Object.freeze([
        Object.freeze(["W / S", "Throttle / brake — hold W to ride"]),
        Object.freeze(["A / D", "Steer left / right"]),
        Object.freeze(["↑ ↓ ← →", "Rider body bias — hang off, tuck"]),
      ]),
    }),
    Object.freeze({
      label: "GEARBOX",
      rows: Object.freeze([
        Object.freeze(["Q / E", "Shift down / up"]),
        Object.freeze(["Shift", "Clutch (manual mode)"]),
        Object.freeze(["C", "Auto / manual gearbox"]),
      ]),
    }),
    Object.freeze({
      label: "SYSTEM",
      rows: Object.freeze([
        Object.freeze(["T", "Rider reflex assist / raw physics"]),
        Object.freeze(["M", "Sound on / off"]),
        Object.freeze(["R", "Reset to grid"]),
        Object.freeze(["Esc", "Pause"]),
      ]),
    }),
  ]),
  touch: Object.freeze([
    Object.freeze({
      label: "THIS MISSION",
      rows: Object.freeze([
        Object.freeze(["Keyboard", "The ride runs on physical keys today"]),
        Object.freeze(["Gamepad", "Left stick turns · right stick biases the rider · triggers brake and accelerate"]),
      ]),
    }),
  ]),
});
