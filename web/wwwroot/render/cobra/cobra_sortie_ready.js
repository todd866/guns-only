const INPUT_EPSILON = 1e-9;

const AXIS_NAMES = Object.freeze([
  "collectiveRate",
  "forwardCyclic",
  "rightCyclic",
  "yaw",
]);

function hasAxisInput(axes) {
  return AXIS_NAMES.some((axis) => Math.abs(Number(axes?.[axis]) || 0) > INPUT_EPSILON);
}

/**
 * True only for input that can change the aircraft or authorise its gunner. Modifier keys and a
 * connected-but-neutral controller must leave the sortie at Ready.
 */
export function hasDeliberateCobraCockpitInput({
  keyboardIntent,
  analogAxes,
  turnaroundAction = false,
} = {}) {
  return turnaroundAction === true
    || keyboardIntent?.fire === true
    || hasAxisInput(keyboardIntent)
    || hasAxisInput(analogAxes);
}

/**
 * Per-sortie authority gate. Wall-clock rendering may continue at Ready, but simulation time
 * cannot move until a deliberate cockpit or tactical action starts the sortie.
 */
export function createCobraSortieReadyInterlock({ ready = false } = {}) {
  let isReady = ready === true;
  let waitingForNeutral = false;

  return Object.freeze({
    get ready() {
      return isReady;
    },

    get awaitingNeutral() {
      return waitingForNeutral;
    },

    start() {
      isReady = true;
      waitingForNeutral = false;
      return true;
    },

    /**
     * Observe the complete cockpit input state for this frame. After a restart, held controls are
     * ignored until one fully neutral frame has occurred; the next deliberate edge both starts
     * the sortie and remains available to the ordinary control integrator on that same frame.
     */
    observeInput(deliberateInput) {
      if (isReady) return true;
      if (deliberateInput !== true) {
        waitingForNeutral = false;
        return false;
      }
      if (waitingForNeutral) return false;
      isReady = true;
      return true;
    },

    reset(nextReady = false, { requireNeutral = false } = {}) {
      isReady = nextReady === true;
      waitingForNeutral = !isReady && requireNeutral === true;
    },

    advance(deltaSeconds, advanceAuthority) {
      if (!isReady) return false;
      if (typeof advanceAuthority !== "function") {
        throw new TypeError("advanceAuthority must be a function");
      }
      advanceAuthority(deltaSeconds);
      return true;
    },
  });
}
