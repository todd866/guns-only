export const GCAS_SAVE_CAMERA_HOLD_SECONDS = 2.5;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

/**
 * Presentation-only edge latch for the Auto-GCAS save camera. Simulation time, physiology, and
 * replay authority remain outside this controller.
 */
export class GcasSaveCameraController {
  constructor() {
    this.external = false;
    this.holdRemainingSeconds = 0;
    this._wasFlyUpActive = false;
    this._lastReleaseCount = 0;
  }

  update(state = {}, deltaSeconds = 0) {
    const flyUpActive = state.auto_gcas_active === true;
    const releaseCount = count(state.auto_gcas_release_count);

    // Historical replay owns its camera outright. Ready/restage also clears any prior sortie hold.
    if (state.replay_external === true || state.ready === true) {
      this.external = false;
      this.holdRemainingSeconds = 0;
      this._wasFlyUpActive = flyUpActive;
      this._lastReleaseCount = releaseCount;
      return false;
    }

    if (releaseCount < this._lastReleaseCount) {
      this.holdRemainingSeconds = 0;
    }
    const released = (this._wasFlyUpActive && !flyUpActive)
      || releaseCount > this._lastReleaseCount;
    if (flyUpActive) {
      this.holdRemainingSeconds = 0;
    } else if (released) {
      this.holdRemainingSeconds = GCAS_SAVE_CAMERA_HOLD_SECONDS;
    } else if (state.paused !== true) {
      const dt = clamp(Number(deltaSeconds) || 0, 0, 0.25);
      this.holdRemainingSeconds = Math.max(0, this.holdRemainingSeconds - dt);
      if (this.holdRemainingSeconds < 1e-9) this.holdRemainingSeconds = 0;
    }

    this._wasFlyUpActive = flyUpActive;
    this._lastReleaseCount = releaseCount;
    this.external = flyUpActive || this.holdRemainingSeconds > 0;
    return this.external;
  }
}

/**
 * Deterministic horizontal side/chase geometry. The look target bisects ownship and the sampled
 * ground plane, while range scales with radar altitude so both remain inside the vertical frame.
 */
export function gcasSaveCameraFraming({
  position = {},
  forward = {},
  radarAltitudeFt = 100,
} = {}) {
  const px = Number(position.x) || 0;
  const py = Number(position.y) || 0;
  const pz = Number(position.z) || 0;
  let forwardX = Number(forward.x) || 0;
  let forwardZ = Number(forward.z) || 0;
  const horizontalLength = Math.hypot(forwardX, forwardZ);
  if (horizontalLength > 1e-6) {
    forwardX /= horizontalLength;
    forwardZ /= horizontalLength;
  } else {
    forwardX = 0;
    forwardZ = -1;
  }
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const reportedClearanceM = Number(radarAltitudeFt) * 0.3048;
  const clearanceM = Number.isFinite(reportedClearanceM)
    ? clamp(reportedClearanceM, 0, 600)
    : 30.48;
  const framedClearanceM = Math.max(30, clearanceM);
  const rangeM = clamp(framedClearanceM * 1.05 + 36, 68, 680);
  const cameraHeightM = clamp(framedClearanceM * 0.12 + 6, 10, 55);
  const groundY = py - clearanceM;

  return {
    camera: {
      x: px + rightX * rangeM * 0.82 - forwardX * rangeM * 0.46,
      y: py + cameraHeightM,
      z: pz + rightZ * rangeM * 0.82 - forwardZ * rangeM * 0.46,
    },
    target: {
      x: px + forwardX * 6,
      y: (py + groundY) * 0.5,
      z: pz + forwardZ * 6,
    },
    groundY,
    clearanceM,
    rangeM,
  };
}
