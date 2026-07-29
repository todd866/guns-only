const finitePositive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const finiteFraction = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
};

/// Pure frame-budget policy. Rendering side effects stay in app.js; this class owns only the
/// hysteretic decision about when one quality rung may be shed or restored.
export class FrameGovernorPolicy {
  constructor({
    windowMs = 1000,
    lateFrameMs = 22,
    tripFraction = 0.05,
    recoverFraction = 0.01,
    recoverCleanWindows = 8,
    severeFrameMs = Number.POSITIVE_INFINITY,
    severeFrameCount = 3,
    maxLevel = 4,
  } = {}) {
    this.windowMs = finitePositive(windowMs, 1000);
    this.lateFrameMs = finitePositive(lateFrameMs, 22);
    this.tripFraction = finiteFraction(tripFraction, 0.05);
    // A run of severely late frames sheds immediately instead of waiting out the window: a
    // pilot feels three consecutive ~28 ms frames long before a 1 s late-fraction can trip.
    this.severeFrameMs = Number(severeFrameMs) > this.lateFrameMs
      ? Number(severeFrameMs) : Number.POSITIVE_INFINITY;
    this.severeFrameCount = Math.max(
      1, Math.floor(finitePositive(severeFrameCount, 3)));
    this.recoverFraction = Math.min(
      this.tripFraction,
      finiteFraction(recoverFraction, 0.01),
    );
    this.recoverCleanWindows = Math.max(
      1,
      Math.floor(finitePositive(recoverCleanWindows, 8)),
    );
    this.maxLevel = Math.max(1, Math.floor(finitePositive(maxLevel, 4)));
    this.reset();
  }

  observe(deltaMs, nowMs) {
    if (!Number.isFinite(deltaMs) || !Number.isFinite(nowMs)) return null;
    if (!Number.isFinite(this.windowStartedAt)) this.windowStartedAt = nowMs;
    this.windowFrames += 1;
    if (deltaMs > this.lateFrameMs) this.lateFrames += 1;
    this.consecutiveSevereFrames = deltaMs > this.severeFrameMs
      ? this.consecutiveSevereFrames + 1 : 0;
    if (this.consecutiveSevereFrames >= this.severeFrameCount) {
      this.consecutiveSevereFrames = 0;
      this.windowStartedAt = nowMs;
      this.lateFrames = 0;
      this.windowFrames = 0;
      this.cleanWindows = 0;
      if (this.level >= this.maxLevel) return null;
      const previousLevel = this.level;
      this.level += 1;
      return Object.freeze({
        direction: "shed",
        previousLevel,
        level: this.level,
        lateFraction: 1,
        severe: true,
      });
    }
    if (nowMs - this.windowStartedAt < this.windowMs) return null;

    const lateFraction = this.windowFrames > 0
      ? this.lateFrames / this.windowFrames : 0;
    this.windowStartedAt = nowMs;
    this.lateFrames = 0;
    this.windowFrames = 0;

    if (lateFraction >= this.tripFraction) {
      this.cleanWindows = 0;
      if (this.level >= this.maxLevel) return null;
      const previousLevel = this.level;
      this.level += 1;
      return Object.freeze({
        direction: "shed",
        previousLevel,
        level: this.level,
        lateFraction,
      });
    }

    if (lateFraction <= this.recoverFraction) {
      this.cleanWindows = Math.min(
        this.recoverCleanWindows,
        this.cleanWindows + 1,
      );
    } else {
      this.cleanWindows = 0;
    }
    if (this.level <= 0 || this.cleanWindows < this.recoverCleanWindows) return null;

    const previousLevel = this.level;
    this.level -= 1;
    this.cleanWindows = 0;
    return Object.freeze({
      direction: "recover",
      previousLevel,
      level: this.level,
      lateFraction,
    });
  }

  idle(nowMs) {
    this.windowStartedAt = Number.isFinite(nowMs) ? nowMs : 0;
    this.lateFrames = 0;
    this.windowFrames = 0;
    this.cleanWindows = 0;
    this.consecutiveSevereFrames = 0;
  }

  reset(nowMs = Number.NaN) {
    this.level = 0;
    this.windowStartedAt = Number.isFinite(nowMs) ? nowMs : Number.NaN;
    this.lateFrames = 0;
    this.windowFrames = 0;
    this.cleanWindows = 0;
    this.consecutiveSevereFrames = 0;
  }
}
