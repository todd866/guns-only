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

function smoothBounded(current, measured, deltaSeconds, timeConstant, maximumLag) {
  if (!Number.isFinite(measured)) return current;
  if (!Number.isFinite(current)) return measured;
  const dt = clamp(finite(deltaSeconds, 0), 0, 0.25);
  if (dt === 0) return current;
  const alpha = 1 - Math.exp(-dt / Math.max(0.001, timeConstant));
  let next = current + (measured - current) * alpha;
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
    if (number === null) return this.value ?? 0;
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
 * Presentation-only filtering for fast, continuously moving scales. It removes sample/rounding
 * chatter without changing simulation truth, warnings, limits, gun solutions, or recorded data.
 * Maximum-lag clamps keep rapid F-22 acceleration and descent immediately legible.
 */
export class HudSignalStabilizer {
  constructor() {
    this.speedDigits = new StableRoundedValue();
    this.altitudeDigits = new StableRoundedValue();
    this.headingDigits = new StableRoundedValue();
    this.verticalSpeedDigits = new StableRoundedValue({ step: 50, hysteresisFraction: 0.20 });
    this.reset();
  }

  reset() {
    this.entityId = null;
    this.indicatedKts = null;
    this.groundKts = null;
    this.altitudeFt = null;
    this.verticalSpeedFpm = null;
    this.headingUnwrappedDeg = null;
    this.speedDigits.reset();
    this.altitudeDigits.reset();
    this.headingDigits.reset();
    this.verticalSpeedDigits.reset();
  }

  update(state = {}, deltaSeconds = 0) {
    const entityId = `${String(state.player_entity_id ?? "legacy")}:${state.replay_external === true ? "replay" : "live"}`;
    const indicated = Math.max(0,
      finite(state.indicated_airspeed_kts, finite(state.speed_kts, 0)));
    const groundTruth = finite(state.ground_speed_kts, finite(state.groundspeed_kts));
    const ground = groundTruth === null ? null : Math.max(0, groundTruth);
    const altitude = finite(state.alt_ft, 0);
    const verticalSpeed = finite(state.vertical_speed_fpm);
    const heading = wrapDegrees(finite(state.heading_deg, 0));
    const discontinuity = this.entityId !== entityId
      || !Number.isFinite(this.indicatedKts)
      || finite(deltaSeconds, 0) > 0.25;

    if (discontinuity) {
      this.entityId = entityId;
      this.indicatedKts = indicated;
      this.groundKts = ground;
      this.altitudeFt = altitude;
      this.verticalSpeedFpm = verticalSpeed;
      this.headingUnwrappedDeg = heading;
      this.speedDigits.reset();
      this.altitudeDigits.reset();
      this.headingDigits.reset();
      this.verticalSpeedDigits.reset();
    } else {
      this.indicatedKts = smoothBounded(
        this.indicatedKts, indicated, deltaSeconds, 0.14, 3,
      );
      this.groundKts = ground === null ? null : smoothBounded(
        this.groundKts, ground, deltaSeconds, 0.16, 3,
      );
      this.altitudeFt = smoothBounded(
        this.altitudeFt, altitude, deltaSeconds, 0.12, 18,
      );
      this.verticalSpeedFpm = verticalSpeed === null ? null : smoothBounded(
        this.verticalSpeedFpm, verticalSpeed, deltaSeconds, 0.18, 250,
      );
      if (verticalSpeed === null) this.verticalSpeedDigits.reset();
      const unwrappedHeading = nearestHeading(heading, this.headingUnwrappedDeg);
      this.headingUnwrappedDeg = smoothBounded(
        this.headingUnwrappedDeg, unwrappedHeading, deltaSeconds, 0.10, 2.5,
      );
    }

    return {
      indicatedKts: this.indicatedKts,
      indicatedDigits: this.speedDigits.update(this.indicatedKts),
      groundKts: this.groundKts,
      altitudeFt: this.altitudeFt,
      altitudeDigits: this.altitudeDigits.update(this.altitudeFt),
      verticalSpeedFpm: this.verticalSpeedFpm,
      verticalSpeedDigits: this.verticalSpeedFpm === null
        ? null : this.verticalSpeedDigits.update(this.verticalSpeedFpm),
      headingDeg: wrapDegrees(this.headingUnwrappedDeg),
      headingDigits: wrapDegrees(this.headingDigits.update(this.headingUnwrappedDeg)),
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
