export const AUTHORITY_TICK_HZ = 120;
export const TELEMETRY_SAMPLE_TARGET_HZ = 20;
export const DEFAULT_TELEMETRY_TICK_STRIDE =
  AUTHORITY_TICK_HZ / TELEMETRY_SAMPLE_TARGET_HZ;
export const TELEMETRY_SAMPLE_SCHEDULE = "elapsed-authority-ticks-v1";

function token(value, fallback = "") {
  return String(value ?? fallback).toUpperCase();
}

function booleanToken(value) {
  return value === true ? "1" : "0";
}

function countToken(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? String(count) : "-";
}

function latestEventSequence(state) {
  if (!Array.isArray(state?.recent_events)) return null;
  let latest = null;
  for (const event of state.recent_events) {
    const sequence = Number(event?.sequence);
    if (Number.isSafeInteger(sequence) && sequence >= 0
      && (latest === null || sequence > latest)) latest = sequence;
  }
  return latest;
}

/**
 * A compact signature of Auto-GCAS state-machine truth, deliberately excluding continuously
 * changing prediction/clearance values. Any protection mode, inhibit, cue, paddle, or counter
 * transition must bypass the ordinary 20 Hz cadence without turning the recorder into a 120 Hz
 * numerical trace.
 */
export function autoGcasTransitionSignature(state) {
  return [
    token(state?.auto_gcas_phase, "UNKNOWN"),
    token(state?.auto_gcas_inhibit_reason, "NONE"),
    token(state?.auto_gcas_cue),
    booleanToken(state?.auto_gcas_active),
    booleanToken(state?.auto_gcas_warning),
    booleanToken(state?.auto_gcas_override_held),
    booleanToken(state?.auto_gcas_prediction_valid),
    booleanToken(state?.auto_gcas_used_fallback_terrain),
    countToken(state?.auto_gcas_activation_count),
    countToken(state?.auto_gcas_release_count),
    countToken(state?.auto_gcas_override_count),
  ].join("|");
}

export function terminalTransitionSignature(state) {
  return [
    booleanToken(state?.finished),
    token(state?.player_terminal_state, "FLYING"),
    token(state?.player_impact_surface, "NONE"),
    token(state?.session_phase, "UNKNOWN"),
    token(state?.sortie_outcome, "NONE"),
  ].join("|");
}

/**
 * Drives trace cadence from elapsed authoritative ticks instead of tick modulo. A browser whose
 * render loop observes only ticks 1, 7, 13... must still record at 20 Hz; modulo scheduling can
 * otherwise starve an entire sortie while making the encoded row sequence look gap-free.
 */
export class TelemetrySampleScheduler {
  constructor({ strideTicks = DEFAULT_TELEMETRY_TICK_STRIDE } = {}) {
    this.strideTicks = Number.isSafeInteger(strideTicks) && strideTicks > 0
      ? strideTicks : DEFAULT_TELEMETRY_TICK_STRIDE;
    this.reset();
  }

  reset() {
    this.lastObservedTick = null;
    this.lastRecordedTick = null;
    this.lastFallbackKey = null;
    this.lastSessionPhase = null;
    this.lastProtectionSignature = null;
    this.lastTerminalSignature = null;
    this.lastEventSequence = null;
    this.lastFinished = false;
    this.seenState = false;
  }

  observe(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return Object.freeze({ record: false, forceKeyframe: false, reasons: [] });
    }

    const rawTick = Number(state.tick);
    const hasTick = Number.isSafeInteger(rawTick) && rawTick >= 0;
    const tick = hasTick ? rawTick : null;
    const fallbackKey = hasTick ? null : `time:${String(state.t ?? "")}`;
    const sessionPhase = token(state.session_phase, "UNKNOWN");
    const protectionSignature = autoGcasTransitionSignature(state);
    const terminalSignature = terminalTransitionSignature(state);
    const eventSequence = latestEventSequence(state);
    const finished = state.finished === true;

    const firstState = !this.seenState;
    const lifecycleChanged = this.lastSessionPhase === null
      || sessionPhase !== this.lastSessionPhase;
    const protectionChanged = this.lastProtectionSignature !== null
      && protectionSignature !== this.lastProtectionSignature;
    const terminalChanged = this.lastTerminalSignature !== null
      && terminalSignature !== this.lastTerminalSignature;
    const recentEventChanged = !firstState
      && eventSequence !== this.lastEventSequence;
    const finishedEdge = finished && !this.lastFinished;
    const tickReset = hasTick && this.lastObservedTick !== null
      && tick < this.lastObservedTick;
    const authorityTickDelta = hasTick && this.lastRecordedTick !== null && !tickReset
      ? tick - this.lastRecordedTick : null;
    const cadenceDue = hasTick
      ? this.lastRecordedTick === null || tickReset
        || authorityTickDelta >= this.strideTicks
      : fallbackKey !== this.lastFallbackKey;

    const reasons = [];
    if (firstState) reasons.push("initial");
    if (tickReset) reasons.push("tick-reset");
    if (lifecycleChanged) reasons.push("lifecycle");
    if (protectionChanged) reasons.push("protection");
    if (terminalChanged || finishedEdge) reasons.push("terminal");
    if (recentEventChanged) reasons.push("authoritative-event");
    if (cadenceDue && !firstState && !tickReset) reasons.push("cadence");

    const record = firstState || tickReset || lifecycleChanged || protectionChanged
      || terminalChanged || finishedEdge || recentEventChanged || cadenceDue;
    const forceKeyframe = firstState || tickReset || lifecycleChanged || protectionChanged
      || terminalChanged || finishedEdge || recentEventChanged;

    this.seenState = true;
    this.lastSessionPhase = sessionPhase;
    this.lastProtectionSignature = protectionSignature;
    this.lastTerminalSignature = terminalSignature;
    this.lastFinished = finished;
    this.lastEventSequence = eventSequence;
    if (hasTick) this.lastObservedTick = tick;
    else this.lastFallbackKey = fallbackKey;
    if (record && hasTick) this.lastRecordedTick = tick;

    return Object.freeze({
      record,
      forceKeyframe,
      reasons: Object.freeze(reasons),
      tick,
      authorityTickDelta,
      lifecycleChanged,
      protectionChanged,
      terminalChanged,
      recentEventChanged,
      finishedEdge,
      tickReset,
    });
  }
}
