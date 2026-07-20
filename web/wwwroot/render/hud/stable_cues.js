function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedDeltaSeconds(value) {
  return Math.min(0.25, Math.max(0, finite(value) ?? 0));
}

export class AoAIndexerQualifier {
  constructor({ acquireSeconds = 0.25, hysteresisFraction = 0.18 } = {}) {
    this.acquireSeconds = Math.max(0, finite(acquireSeconds) ?? 0.25);
    this.hysteresisFraction = Math.max(0, finite(hysteresisFraction) ?? 0.18);
    this.reset();
  }

  reset() {
    this.state = null;
    this.pending = null;
    this.pendingSeconds = 0;
  }

  classify(aoa, onSpeed, tolerance) {
    const margin = tolerance * this.hysteresisFraction;
    const lower = onSpeed - tolerance;
    const upper = onSpeed + tolerance;
    if (this.state === "FAST") {
      if (aoa < lower + margin) return "FAST";
      return aoa > upper + margin ? "SLOW" : "ON_SPEED";
    }
    if (this.state === "SLOW") {
      if (aoa > upper - margin) return "SLOW";
      return aoa < lower - margin ? "FAST" : "ON_SPEED";
    }
    if (aoa < lower - margin) return "FAST";
    if (aoa > upper + margin) return "SLOW";
    return "ON_SPEED";
  }

  update({ aoa, onSpeed, tolerance } = {}, deltaSeconds = 0) {
    const measured = finite(aoa);
    const datum = finite(onSpeed);
    const band = finite(tolerance);
    if (measured === null || datum === null || band === null || band <= 0) {
      this.reset();
      return null;
    }

    const candidate = this.classify(measured, datum, band);
    if (this.state === null) {
      this.state = candidate;
      return this.state;
    }
    if (candidate === this.state) {
      this.pending = null;
      this.pendingSeconds = 0;
      return this.state;
    }
    if (candidate !== this.pending) {
      this.pending = candidate;
      this.pendingSeconds = 0;
    }
    this.pendingSeconds += boundedDeltaSeconds(deltaSeconds);
    if (this.pendingSeconds >= this.acquireSeconds) {
      this.state = candidate;
      this.pending = null;
      this.pendingSeconds = 0;
    }
    return this.state;
  }
}

export class DisplayCueQualifier {
  constructor({ acquireSeconds = 0.25, releaseSeconds = 0.35 } = {}) {
    this.acquireSeconds = Math.max(0, finite(acquireSeconds) ?? 0.25);
    this.releaseSeconds = Math.max(0, finite(releaseSeconds) ?? 0.35);
    this.reset();
  }

  reset() {
    this.current = null;
    this.pending = null;
    this.pendingSeconds = 0;
  }

  update(value, deltaSeconds = 0, { urgent = false } = {}) {
    const candidate = value ?? null;
    if (urgent && candidate !== null) {
      this.current = candidate;
      this.pending = null;
      this.pendingSeconds = 0;
      return this.current;
    }
    if (this.current === null) {
      if (candidate === null) return null;
      this.current = candidate;
      return this.current;
    }
    const same = candidate !== null
      && candidate.key === this.current.key;
    if (same) {
      this.current = candidate;
      this.pending = null;
      this.pendingSeconds = 0;
      return this.current;
    }

    const candidateKey = candidate?.key ?? null;
    if ((this.pending?.key ?? null) !== candidateKey) {
      this.pending = candidate;
      this.pendingSeconds = 0;
    } else {
      this.pending = candidate;
    }
    this.pendingSeconds += boundedDeltaSeconds(deltaSeconds);
    const dwell = candidate === null ? this.releaseSeconds : this.acquireSeconds;
    if (this.pendingSeconds >= dwell) {
      this.current = candidate;
      this.pending = null;
      this.pendingSeconds = 0;
    }
    return this.current;
  }
}
