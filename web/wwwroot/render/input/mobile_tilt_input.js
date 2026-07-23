function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function angleDelta(value, centre) {
  return ((value - centre + 540) % 360) - 180;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function centredMedian(samples, axis) {
  const anchor = samples[0][axis];
  return anchor + median(samples.map((sample) => angleDelta(sample[axis], anchor)));
}

/**
 * Collect a short, stationary sensor history before declaring the phone's neutral attitude.
 * Medians make one noisy event harmless, while the inlier span prevents a moving phone from
 * becoming the centre merely because enough events arrived.
 */
export class StableTiltCalibration {
  constructor({
    durationMs = 300,
    minimumSamples = 5,
    maximumSpanDegrees = 2.5,
  } = {}) {
    this.durationMs = Math.max(1, finiteNumber(durationMs) ?? 300);
    this.minimumSamples = Math.max(2, Math.round(finiteNumber(minimumSamples) ?? 5));
    this.maximumSpanDegrees = Math.max(0.1,
      finiteNumber(maximumSpanDegrees) ?? 2.5);
    this.reset();
  }

  reset() {
    this.samples = [];
    this.angle = null;
  }

  add(sample, timestampMs) {
    const roll = finiteNumber(sample?.roll);
    const pitch = finiteNumber(sample?.pitch);
    const angle = finiteNumber(sample?.angle);
    const timeMs = finiteNumber(timestampMs);
    if (roll === null || pitch === null || angle === null || timeMs === null) return null;

    if (this.angle !== angle || (this.samples.length > 0
        && timeMs < this.samples[this.samples.length - 1].timeMs)) {
      this.reset();
      this.angle = angle;
    }
    this.samples.push({ roll, pitch, angle, timeMs });

    // A stalled calibration should not retain an old hand position indefinitely. Keep enough
    // history to prove the requested stable duration while bounding recovery after movement.
    const oldestUsefulMs = timeMs - this.durationMs * 2;
    this.samples = this.samples.filter((candidate) => candidate.timeMs >= oldestUsefulMs);
    if (this.samples.length < this.minimumSamples
        || timeMs - this.samples[0].timeMs < this.durationMs) return null;

    const rollMedian = centredMedian(this.samples, "roll");
    const pitchMedian = centredMedian(this.samples, "pitch");
    const maximumDeviation = this.maximumSpanDegrees / 2;
    const inliers = this.samples.filter((candidate) =>
      Math.abs(angleDelta(candidate.roll, rollMedian)) <= maximumDeviation
        && Math.abs(angleDelta(candidate.pitch, pitchMedian)) <= maximumDeviation);
    const requiredInliers = Math.max(this.minimumSamples,
      Math.ceil(this.samples.length * 0.75));
    if (inliers.length < requiredInliers
        || inliers[inliers.length - 1].timeMs - inliers[0].timeMs < this.durationMs) return null;

    const centreRoll = centredMedian(inliers, "roll");
    const centrePitch = centredMedian(inliers, "pitch");
    const rollValues = inliers.map((candidate) => angleDelta(candidate.roll, centreRoll));
    const pitchValues = inliers.map((candidate) => angleDelta(candidate.pitch, centrePitch));
    const rollSpan = Math.max(...rollValues) - Math.min(...rollValues);
    const pitchSpan = Math.max(...pitchValues) - Math.min(...pitchValues);
    if (rollSpan > this.maximumSpanDegrees || pitchSpan > this.maximumSpanDegrees) return null;

    return { roll: centreRoll, pitch: centrePitch, angle };
  }
}

/** A sensor-rate-independent first-order low-pass step. */
export function smoothTilt(previous, target, deltaSeconds, {
  timeConstantSeconds = 0.05,
} = {}) {
  const prior = finiteNumber(previous) ?? 0;
  const next = finiteNumber(target);
  if (next === null) return prior;
  const elapsed = clamp(finiteNumber(deltaSeconds) ?? 0, 0, 0.25);
  const timeConstant = Math.max(0.001,
    finiteNumber(timeConstantSeconds) ?? 0.05);
  const alpha = 1 - Math.exp(-elapsed / timeConstant);
  return prior + (next - prior) * alpha;
}

/**
 * Rearmable sensor-liveness timer. A stale callback neutralizes the controls; an absolute recovery
 * deadline hands the player to fallback controls unless a stable calibration explicitly completes.
 */
export class TiltSensorWatchdog {
  constructor({
    onStale,
    onFallback,
    staleMs = 450,
    fallbackMs = 3000,
    setTimer = globalThis.setTimeout?.bind(globalThis),
    clearTimer = globalThis.clearTimeout?.bind(globalThis),
  } = {}) {
    if (typeof onStale !== "function" || typeof onFallback !== "function"
        || typeof setTimer !== "function" || typeof clearTimer !== "function") {
      throw new TypeError("tilt watchdog requires callbacks and timer functions");
    }
    this.onStale = onStale;
    this.onFallback = onFallback;
    this.staleMs = Math.max(1, finiteNumber(staleMs) ?? 450);
    this.fallbackMs = Math.max(1, finiteNumber(fallbackMs) ?? 3000);
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.staleTimer = null;
    this.fallbackTimer = null;
  }

  sample() {
    if (this.staleTimer !== null) this.clearTimer(this.staleTimer);
    this.staleTimer = this.setTimer(() => {
      this.staleTimer = null;
      this.onStale();
      this.beginRecovery();
    }, this.staleMs);
  }

  beginRecovery() {
    if (this.fallbackTimer !== null) return;
    this.fallbackTimer = this.setTimer(() => {
      this.fallbackTimer = null;
      this.onFallback();
    }, this.fallbackMs);
  }

  recovered() {
    if (this.fallbackTimer !== null) this.clearTimer(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  stop() {
    if (this.staleTimer !== null) this.clearTimer(this.staleTimer);
    if (this.fallbackTimer !== null) this.clearTimer(this.fallbackTimer);
    this.staleTimer = null;
    this.fallbackTimer = null;
  }
}

/**
 * Turn calibrated phone tilt into a continuous lateral-stick command.
 *
 * Four degrees around centre is neutral. Beyond it, an exponential response reserves small phone
 * motions for formation-like corrections while retaining full aileron authority at a deliberate
 * 30-degree tilt. Sensitivity is applied to the measured angle before this function.
 */
/**
 * Decide whether the latest continuous roll command must cross the WASM bridge.
 *
 * Sub-noise deltas are suppressed so sensor jitter cannot spam the bridge, but the transition to
 * exact neutral is ALWAYS transmitted while the previously sent command is nonzero: the
 * simulation's G-LOC control interlock releases only when the flown roll command is exactly zero,
 * so a suppressed final zero would latch a stale sub-noise roll command and keep the pilot locked
 * out with the phone physically neutral.
 */
export function shouldTransmitAnalogRoll(command, lastSent, { epsilon = 0.002 } = {}) {
  const next = Number(command);
  if (!Number.isFinite(next)) return false;
  const previous = Number(lastSent) || 0;
  if (next === 0) return previous !== 0;
  return Math.abs(next - previous) >= Math.max(0, Number(epsilon) || 0);
}

export function mobileRollCommand(degrees, {
  // Softened after the first Build 72 phone sortie ("a bit too sensitive"): a wider deadzone,
  // more physical tilt for full deflection, and a gentler mid-range. The user-adjustable
  // tiltSensitivity multiplier still scales the incoming angle before this curve.
  deadzoneDegrees = 5,
  fullScaleDegrees = 38,
  exponent = 2.0,
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
