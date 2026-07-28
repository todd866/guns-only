/**
 * Closed-loop AI work budgeting driven by delivered frame and measured simulation cost.
 *
 * The browser owns measurement; the deterministic kernel owns the meaning of each integer level.
 * Keeping that boundary small lets the kernel amortize lookahead work without making gameplay
 * depend on browser brands, CPU model strings, deviceMemory, or other unreliable device sniffing.
 */

// This ordering is the bridge contract: zero preserves full planner quality and larger values ask
// the kernel to shed progressively more compute. It matches SetAiComputeLevel(int).
export const AI_COMPUTE_LEVEL = Object.freeze({
  FULL: 0,
  BALANCED: 1,
  CONSERVATIVE: 2,
  EMERGENCY: 3,
});

export const AI_WORK_BUDGET_FRACTIONS = Object.freeze([
  1,
  0.75,
  0.55,
  0.35,
]);

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const finitePositive = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const finiteNonNegative = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

/**
 * The policy drops AI work quickly under simulation-attributed frame pressure and restores it
 * only after sustained headroom. `observe` is deterministic: all time enters through the sample,
 * so an identical sample tape produces identical level transitions.
 *
 * `executedTicks` is optional. When catch-up runs more than the normal two 120 Hz ticks per 60 Hz
 * frame, simulation cost is normalized to the nominal tick load and that amortized cost is
 * attributed against the delivered frame. This avoids shedding twice for a catch-up burst while
 * preserving genuine per-tick simulation spikes.
 */
export class AdaptiveAiWorkBudget {
  constructor({
    targetFps = 60,
    simulationBudgetFraction = 0.48,
    lateFrameMultiplier = 1.32,
    healthyFrameMultiplier = 1.12,
    healthySimulationFraction = 0.62,
    severeFrameMultiplier = 2,
    severeSimulationMultiplier = 1.6,
    minimumSimulationShare = 0.30,
    overloadSamplesToShed = 2,
    minimumFramesBetweenSheds = 6,
    recoveryHeadroomMs = 8_000,
    nominalTicksPerFrame = 2,
    initialLevel = AI_COMPUTE_LEVEL.FULL,
  } = {}) {
    this.targetFps = finitePositive(targetFps, 60);
    this.targetFrameMs = 1000 / this.targetFps;
    this.simulationBudgetMs = this.targetFrameMs
      * finitePositive(simulationBudgetFraction, 0.48);
    this.lateFrameMs = this.targetFrameMs
      * finitePositive(lateFrameMultiplier, 1.32);
    this.healthyFrameMs = this.targetFrameMs
      * finitePositive(healthyFrameMultiplier, 1.12);
    this.healthySimulationMs = this.simulationBudgetMs
      * finitePositive(healthySimulationFraction, 0.62);
    this.severeFrameMs = this.targetFrameMs
      * finitePositive(severeFrameMultiplier, 2);
    this.severeSimulationMs = this.simulationBudgetMs
      * finitePositive(severeSimulationMultiplier, 1.6);
    this.minimumSimulationShare = clamp(
      finiteNonNegative(minimumSimulationShare, 0.30), 0, 1,
    );
    this.overloadSamplesToShed = Math.max(1, Math.floor(
      finitePositive(overloadSamplesToShed, 2),
    ));
    this.minimumFramesBetweenSheds = Math.max(0, Math.floor(
      finiteNonNegative(minimumFramesBetweenSheds, 6),
    ));
    this.recoveryHeadroomMs = finitePositive(recoveryHeadroomMs, 8_000);
    this.nominalTicksPerFrame = Math.max(1, Math.floor(
      finitePositive(nominalTicksPerFrame, 2),
    ));

    this.level = this.#validLevel(initialLevel);
    this.overloadSamples = 0;
    this.framesSinceShed = Number.POSITIVE_INFINITY;
    this.healthyMilliseconds = 0;
    this.lastCause = "initial";
  }

  #validLevel(value) {
    return clamp(
      Math.floor(finiteNonNegative(value, AI_COMPUTE_LEVEL.FULL)),
      AI_COMPUTE_LEVEL.FULL,
      AI_COMPUTE_LEVEL.EMERGENCY,
    );
  }

  #result({
    changed = false,
    cause = "none",
    frameMs = null,
    simMs = null,
    normalizedSimMs = null,
  } = {}) {
    return Object.freeze({
      changed,
      cause,
      computeLevel: this.level,
      workBudgetFraction: AI_WORK_BUDGET_FRACTIONS[this.level],
      targetFrameMs: this.targetFrameMs,
      simulationBudgetMs: this.simulationBudgetMs,
      frameMs,
      simMs,
      normalizedSimMs,
    });
  }

  snapshot() {
    return this.#result({ cause: this.lastCause });
  }

  /**
   * Forget partial evidence while paused, loading, replaying, or backgrounded. The earned level is
   * retained, just as the scenery governor retains its level within a sortie.
   */
  idle() {
    this.overloadSamples = 0;
    this.framesSinceShed = Number.POSITIVE_INFINITY;
    this.healthyMilliseconds = 0;
    this.lastCause = "idle";
    return this.snapshot();
  }

  reset(level = AI_COMPUTE_LEVEL.FULL) {
    this.level = this.#validLevel(level);
    this.overloadSamples = 0;
    this.framesSinceShed = Number.POSITIVE_INFINITY;
    this.healthyMilliseconds = 0;
    this.lastCause = "reset";
    return this.snapshot();
  }

  observe({
    frameMs,
    simMs,
    executedTicks = this.nominalTicksPerFrame,
    active = true,
  } = {}) {
    if (active !== true) return this.idle();

    const measuredFrameMs = Number(frameMs);
    const measuredSimMs = Number(simMs);
    if (!Number.isFinite(measuredFrameMs) || measuredFrameMs <= 0
      || !Number.isFinite(measuredSimMs) || measuredSimMs < 0) {
      this.lastCause = "invalid-sample";
      return this.#result({ cause: this.lastCause });
    }

    const ticks = Math.max(1, Math.floor(
      finitePositive(executedTicks, this.nominalTicksPerFrame),
    ));
    const catchupScale = Math.min(1, this.nominalTicksPerFrame / ticks);
    const normalizedSimMs = measuredSimMs * catchupScale;
    // The denominator deliberately remains the delivered frame, not a similarly scaled synthetic
    // frame. Catch-up has already charged several ticks to this one frame; scaling both sides would
    // restore the raw share and shed again for the same backlog. Truly expensive per-tick work
    // still trips the absolute normalized-simulation thresholds below.
    const normalizedSimulationShare = measuredFrameMs > 0
      ? normalizedSimMs / measuredFrameMs
      : 0;

    const simOverloaded = normalizedSimMs > this.simulationBudgetMs;
    const lateAndSimulationAttributed = measuredFrameMs > this.lateFrameMs
      && normalizedSimulationShare >= this.minimumSimulationShare;
    const overloaded = simOverloaded || lateAndSimulationAttributed;
    const severe = normalizedSimMs >= this.severeSimulationMs
      || (measuredFrameMs >= this.severeFrameMs
        && normalizedSimulationShare >= this.minimumSimulationShare);
    const healthy = measuredFrameMs <= this.healthyFrameMs
      && normalizedSimMs <= this.healthySimulationMs;

    this.framesSinceShed += 1;

    if (overloaded) {
      this.healthyMilliseconds = 0;
      this.overloadSamples += 1;

      const mayShed = this.framesSinceShed >= this.minimumFramesBetweenSheds;
      const sustained = this.overloadSamples >= this.overloadSamplesToShed;
      if (this.level < AI_COMPUTE_LEVEL.EMERGENCY && mayShed
        && (severe || sustained)) {
        const drop = severe ? 2 : 1;
        const previousLevel = this.level;
        this.level = Math.min(AI_COMPUTE_LEVEL.EMERGENCY, this.level + drop);
        this.framesSinceShed = 0;
        this.overloadSamples = 0;
        this.lastCause = severe
          ? "severe-simulation-pressure"
          : "sustained-simulation-pressure";
        return this.#result({
          changed: this.level !== previousLevel,
          cause: this.lastCause,
          frameMs: measuredFrameMs,
          simMs: measuredSimMs,
          normalizedSimMs,
        });
      }

      this.lastCause = simOverloaded
        ? "simulation-pressure"
        : "frame-pressure-attributed-to-simulation";
      return this.#result({
        cause: this.lastCause,
        frameMs: measuredFrameMs,
        simMs: measuredSimMs,
        normalizedSimMs,
      });
    }

    this.overloadSamples = 0;
    if (!healthy) {
      this.healthyMilliseconds = 0;
      this.lastCause = "within-hysteresis-band";
      return this.#result({
        cause: this.lastCause,
        frameMs: measuredFrameMs,
        simMs: measuredSimMs,
        normalizedSimMs,
      });
    }

    // Do not let a background-sized delta count as seconds of recovery evidence. A healthy sample
    // can contribute at most two target intervals.
    this.healthyMilliseconds += Math.min(measuredFrameMs, this.targetFrameMs * 2);
    if (this.level > AI_COMPUTE_LEVEL.FULL
      && this.healthyMilliseconds >= this.recoveryHeadroomMs) {
      this.level -= 1;
      this.healthyMilliseconds = 0;
      this.lastCause = "sustained-headroom";
      return this.#result({
        changed: true,
        cause: this.lastCause,
        frameMs: measuredFrameMs,
        simMs: measuredSimMs,
        normalizedSimMs,
      });
    }

    this.lastCause = "healthy";
    return this.#result({
      cause: this.lastCause,
      frameMs: measuredFrameMs,
      simMs: measuredSimMs,
      normalizedSimMs,
    });
  }
}
