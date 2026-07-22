function finite(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function nearestHeading(value, reference) {
  return reference + (((value - reference + 540) % 360) - 180);
}

function smoothBounded(current, measured, deltaSeconds, timeConstant, maximumLag, deadband = 0) {
  if (!Number.isFinite(measured)) return current;
  if (!Number.isFinite(current)) return measured;
  const dt = clamp(finite(deltaSeconds, 0), 0, 0.25);
  if (dt === 0) return current;
  const error = measured - current;
  const quietBand = Math.max(0, finite(deadband, 0));
  if (Math.abs(error) <= quietBand) return current;
  const target = measured - Math.sign(error) * quietBand;
  const alpha = 1 - Math.exp(-dt / Math.max(0.001, timeConstant));
  let next = current + (target - current) * alpha;
  const lag = measured - next;
  if (Math.abs(lag) > maximumLag) next = measured - Math.sign(lag) * maximumLag;
  return next;
}

export class StableRoundedValue {
  constructor({ step = 1, hysteresisFraction = 0.16 } = {}) {
    this.step = Math.max(1e-6, finite(step, 1));
    this.hysteresisFraction = clamp(finite(hysteresisFraction, 0.16), 0, 0.49);
    this.value = null;
  }

  reset() {
    this.value = null;
  }

  update(measured) {
    const number = finite(measured);
    if (number === null) {
      this.reset();
      return null;
    }
    if (this.value === null || Math.abs(number - this.value) > this.step * 4) {
      this.value = Math.round(number / this.step) * this.step;
      return this.value;
    }
    const threshold = this.step * (0.5 + this.hysteresisFraction);
    while (number >= this.value + threshold) this.value += this.step;
    while (number <= this.value - threshold) this.value -= this.step;
    return this.value;
  }
}

/**
 * A sampled rate estimate for display trends. Differentiating a per-frame filtered value makes
 * tiny sample and frame-time changes look like alternating acceleration. A short measurement
 * window gives a calm caret while still showing a deliberate energy change within a fraction of
 * a second.
 */
export class StableRateEstimate {
  constructor({
    sampleSeconds = 0.10,
    smoothingSeconds = 0.45,
    deadbandPerSecond = 0.35,
    qualifySeconds = 0.50,
  } = {}) {
    this.sampleSeconds = Math.max(0.05, finite(sampleSeconds, 0.10));
    this.smoothingSeconds = Math.max(0.05, finite(smoothingSeconds, 0.45));
    this.deadbandPerSecond = Math.max(0, finite(deadbandPerSecond, 0.35));
    this.qualifySeconds = Math.max(this.sampleSeconds, finite(qualifySeconds, 0.50));
    this.reset();
  }

  reset(value = null) {
    this.reference = finite(value);
    this.elapsed = 0;
    this.value = 0;
    this.candidateDirection = 0;
    this.candidateSeconds = 0;
  }

  update(measured, deltaSeconds = 0) {
    const number = finite(measured);
    if (number === null) return this.value;
    if (this.reference === null) {
      this.reference = number;
      return this.value;
    }
    this.elapsed += clamp(finite(deltaSeconds, 0), 0, 0.25);
    if (this.elapsed < this.sampleSeconds) return this.value;

    const measuredRate = (number - this.reference) / this.elapsed;
    const target = Math.abs(measuredRate) <= this.deadbandPerSecond
      ? 0
      : measuredRate - Math.sign(measuredRate) * this.deadbandPerSecond;
    const direction = Math.sign(target);
    if (direction === 0) {
      this.candidateDirection = 0;
      this.candidateSeconds = 0;
    } else if (direction === this.candidateDirection) {
      this.candidateSeconds += this.elapsed;
    } else {
      this.candidateDirection = direction;
      this.candidateSeconds = this.elapsed;
    }
    const alpha = 1 - Math.exp(-this.elapsed / this.smoothingSeconds);
    const qualifiedTarget = direction !== 0
      && (Math.sign(this.value) === direction || this.candidateSeconds >= this.qualifySeconds)
      ? target : 0;
    this.value += (qualifiedTarget - this.value) * alpha;
    if (Math.abs(this.value) < 0.05 && qualifiedTarget === 0) this.value = 0;
    this.reference = number;
    this.elapsed = 0;
    return this.value;
  }
}

/**
 * A presentation-only opacity envelope for cues that would otherwise flash when an authoritative
 * boolean crosses a threshold for a single frame. Urgent callers can still request immediate
 * onset; the release envelope only prevents an instantaneous visual dropout.
 */
export class VisibilityEnvelope {
  constructor({ attackSeconds = 0.05, releaseSeconds = 0.16 } = {}) {
    this.attackSeconds = Math.max(0, finite(attackSeconds, 0.05));
    this.releaseSeconds = Math.max(0, finite(releaseSeconds, 0.16));
    this.reset();
  }

  reset(value = 0) {
    this.value = clamp(finite(value, 0), 0, 1);
  }

  update(visible, deltaSeconds = 0, { instantAttack = false, instantRelease = false } = {}) {
    const target = visible === true ? 1 : 0;
    if ((target === 1 && instantAttack) || (target === 0 && instantRelease)) {
      this.value = target;
      return this.value;
    }
    const duration = target > this.value ? this.attackSeconds : this.releaseSeconds;
    if (duration === 0) {
      this.value = target;
      return this.value;
    }
    const step = clamp(finite(deltaSeconds, 0), 0, 0.25) / duration;
    this.value = target > this.value
      ? Math.min(target, this.value + step)
      : Math.max(target, this.value - step);
    return this.value;
  }
}

/**
 * Presentation-only filtering for fast, continuously moving scales. It removes sample/rounding
 * chatter without changing simulation truth, warnings, limits, gun solutions, or recorded data.
 * Maximum-lag clamps keep rapid F-22 acceleration and descent immediately legible.
 */
export class HudSignalStabilizer {
  constructor() {
    this.speedDigits = new StableRoundedValue({ hysteresisFraction: 0.30 });
    this.altitudeDigits = new StableRoundedValue();
    this.headingDigits = new StableRoundedValue();
    this.verticalSpeedDigits = new StableRoundedValue({ step: 50, hysteresisFraction: 0.20 });
    this.speedRate = new StableRateEstimate();
    this.reset();
  }

  reset() {
    this.entityId = null;
    this.indicatedKts = null;
    this.groundKts = null;
    this.altitudeFt = null;
    this.verticalSpeedFpm = null;
    this.headingUnwrappedDeg = null;
    this.speedRate.reset();
    this.speedDigits.reset();
    this.altitudeDigits.reset();
    this.headingDigits.reset();
    this.verticalSpeedDigits.reset();
  }

  update(state = {}, deltaSeconds = 0) {
    const entityId = `${String(state.player_entity_id ?? "legacy")}:${state.replay_external === true ? "replay" : "live"}`;
    const indicatedTruth = finite(state.calibrated_airspeed_kts,
      finite(state.indicated_airspeed_kts, finite(state.speed_kts)));
    const indicated = indicatedTruth === null ? null : Math.max(0, indicatedTruth);
    const groundTruth = finite(state.ground_speed_kts, finite(state.groundspeed_kts));
    const ground = groundTruth === null ? null : Math.max(0, groundTruth);
    const altitude = finite(state.alt_ft);
    const verticalSpeed = finite(state.vertical_speed_fpm);
    const headingTruth = finite(state.heading_deg);
    const heading = headingTruth === null ? null : wrapDegrees(headingTruth);
    const discontinuity = this.entityId !== entityId
      || finite(deltaSeconds, 0) > 0.25;

    if (discontinuity) {
      this.entityId = entityId;
      this.indicatedKts = indicated;
      this.groundKts = ground;
      this.altitudeFt = altitude;
      this.verticalSpeedFpm = verticalSpeed;
      this.headingUnwrappedDeg = heading;
      this.speedRate.reset(indicated);
      this.speedDigits.reset();
      this.altitudeDigits.reset();
      this.headingDigits.reset();
      this.verticalSpeedDigits.reset();
    } else {
      if (indicated === null) {
        this.indicatedKts = null;
        this.speedRate.reset();
        this.speedDigits.reset();
      } else if (this.indicatedKts === null) {
        this.indicatedKts = indicated;
        this.speedRate.reset(indicated);
        this.speedDigits.reset();
      } else {
        this.indicatedKts = smoothBounded(
          this.indicatedKts, indicated, deltaSeconds, 0.42, 3, 0.45,
        );
      }
      this.groundKts = ground === null ? null : smoothBounded(
        this.groundKts, ground, deltaSeconds, 0.16, 3,
      );
      if (altitude === null) {
        this.altitudeFt = null;
        this.altitudeDigits.reset();
      } else if (this.altitudeFt === null) {
        this.altitudeFt = altitude;
        this.altitudeDigits.reset();
      } else {
        this.altitudeFt = smoothBounded(
          this.altitudeFt, altitude, deltaSeconds, 0.12, 18,
        );
      }
      this.verticalSpeedFpm = verticalSpeed === null ? null : smoothBounded(
        this.verticalSpeedFpm, verticalSpeed, deltaSeconds, 0.18, 250,
      );
      if (verticalSpeed === null) this.verticalSpeedDigits.reset();
      if (heading === null) {
        this.headingUnwrappedDeg = null;
        this.headingDigits.reset();
      } else if (this.headingUnwrappedDeg === null) {
        this.headingUnwrappedDeg = heading;
        this.headingDigits.reset();
      } else {
        const unwrappedHeading = nearestHeading(heading, this.headingUnwrappedDeg);
        this.headingUnwrappedDeg = smoothBounded(
          this.headingUnwrappedDeg, unwrappedHeading, deltaSeconds, 0.10, 2.5,
        );
      }
    }

    return {
      indicatedKts: this.indicatedKts,
      indicatedDigits: this.indicatedKts === null
        ? null : this.speedDigits.update(this.indicatedKts),
      indicatedRateKtsPerSecond: this.indicatedKts === null
        ? 0 : this.speedRate.update(this.indicatedKts, deltaSeconds),
      groundKts: this.groundKts,
      altitudeFt: this.altitudeFt,
      altitudeDigits: this.altitudeFt === null
        ? null : this.altitudeDigits.update(this.altitudeFt),
      verticalSpeedFpm: this.verticalSpeedFpm,
      verticalSpeedDigits: this.verticalSpeedFpm === null
        ? null : this.verticalSpeedDigits.update(this.verticalSpeedFpm),
      headingDeg: this.headingUnwrappedDeg === null
        ? null : wrapDegrees(this.headingUnwrappedDeg),
      headingDigits: this.headingUnwrappedDeg === null
        ? null : wrapDegrees(this.headingDigits.update(this.headingUnwrappedDeg)),
    };
  }
}

export function latchedRectVisibility(previous, point = {}, rectangle = {}, symbolRadius = 0,
  hysteresis = 6) {
  if (point.behind === true || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const radius = Math.max(0, finite(symbolRadius, 0));
  const band = Math.max(0, finite(hysteresis, 6));
  const margin = previous ? Math.max(0, radius - band) : radius + band;
  return point.x >= finite(rectangle.left, 0) + margin
    && point.x <= finite(rectangle.right, 0) - margin
    && point.y >= finite(rectangle.top, 0) + margin
    && point.y <= finite(rectangle.bottom, 0) - margin;
}
