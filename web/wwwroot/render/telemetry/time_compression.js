// The host may offer eight ordinary fixed ticks per wall-clock tick when measured cost permits it.
// The kernel independently tapers predictable contact/fuel/GCAS/ram boundaries through 8→4→2→1;
// the renderer cannot declare that higher rate safe or bypass an immediate pilot/damage handback.
export const TIME_COMPRESSION_MAX_FACTOR = 8;
export const TIME_COMPRESSION_SIM_BUDGET_MS = 8;
export const TIME_COMPRESSION_INITIAL_TICK_COST_MS = 1;

const finitePositive = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const powerOfTwoFactorCap = (maximum) => {
  const cap = Math.max(1, Math.floor(Number(maximum) || 1));
  if (cap >= 8) return 8;
  if (cap >= 4) return 4;
  if (cap >= 2) return 2;
  return 1;
};

/**
 * Cost-governed offer to the kernel. This never declares compression safe; it only answers how
 * many ordinary authority ticks the renderer can currently afford. SimulationSession accepts or
 * rejects the resulting maximum factor from deterministic state.
 */
export class MeasuredTimeCompressionBudget {
  constructor({
    tickHz = 120,
    budgetMs = TIME_COMPRESSION_SIM_BUDGET_MS,
    maximumFactor = TIME_COMPRESSION_MAX_FACTOR,
    initialTickCostMs = TIME_COMPRESSION_INITIAL_TICK_COST_MS,
  } = {}) {
    this.tickHz = finitePositive(tickHz, 120);
    this.budgetMs = finitePositive(budgetMs, TIME_COMPRESSION_SIM_BUDGET_MS);
    this.maximumFactor = Math.max(1, Math.floor(
      finitePositive(maximumFactor, TIME_COMPRESSION_MAX_FACTOR),
    ));
    this.tickCostMs = finitePositive(
      initialTickCostMs, TIME_COMPRESSION_INITIAL_TICK_COST_MS,
    );
  }

  observeSimPhase(milliseconds, ticks) {
    const elapsed = Number(milliseconds);
    const advanced = Math.floor(Number(ticks));
    if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(advanced)
      || advanced <= 0) return this.tickCostMs;
    const sample = elapsed / advanced;
    if (!Number.isFinite(sample) || sample <= 0) return this.tickCostMs;
    // Expensive ticks take effect immediately to stop a catch-up spiral. Cheaper observations
    // decay slowly, so one anomalously light frame cannot spend the whole next frame's budget.
    this.tickCostMs = sample >= this.tickCostMs
      ? sample
      : this.tickCostMs * 0.84 + sample * 0.16;
    return this.tickCostMs;
  }

  plan(renderDeltaMs, baseCatchupCapSeconds) {
    const capSeconds = finitePositive(baseCatchupCapSeconds, 10 / this.tickHz);
    const elapsedSeconds = Math.max(0,
      Math.min(Number(renderDeltaMs) / 1000 || 0, capSeconds));
    const baseTicks = elapsedSeconds > 0
      ? Math.max(1, Math.round(elapsedSeconds * this.tickHz))
      : 0;
    const requestedTicks = baseTicks * this.maximumFactor;
    const affordableTicks = baseTicks === 0 ? 0 : Math.max(
      baseTicks, Math.floor(this.budgetMs / this.tickCostMs),
    );
    const maximumFactor = baseTicks === 0 ? 1 : powerOfTwoFactorCap(Math.min(
      this.maximumFactor, Math.floor(affordableTicks / baseTicks),
    ));
    const scheduledTicks = baseTicks * maximumFactor;
    return Object.freeze({
      elapsedSeconds,
      baseTicks,
      requestedTicks,
      scheduledTicks,
      droppedTicks: Math.max(0, requestedTicks - scheduledTicks),
      maximumFactor,
      measuredTickCostMs: this.tickCostMs,
      // The old catch-up seam expressed as simulated seconds. Compression deliberately raises it,
      // but only as far as the measured sim-phase budget can pay for this frame.
      catchupCapSeconds: Math.max(capSeconds, scheduledTicks / this.tickHz),
    });
  }
}

export function timeCompressionHudPresentation(state) {
  if (state?.time_compression_available !== true) return null;
  const factor = Math.max(1, Math.floor(Number(state.time_compression_factor) || 1));
  if (factor > 1) {
    return Object.freeze({
      text: `TIME ×${factor} · T NORMAL`,
      level: "active",
    });
  }
  // No idle-state chrome: the pill exists only while fast time is actually running
  // (owner direction 2026-07-29 — "don't show random shit like that").
  return null;
}
