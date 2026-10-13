// Local device history only. No telemetry dependency, credentials, unlocks or aircraft modifiers.
import { attemptElapsedSeconds } from "./attempt_clock.js";
import {
  f22AttemptContract, f22CombatDisposition, f22RecoveryDisposition,
} from "../debrief/f22_result_instrument.js";

const DISPOSITIONS = new Set(["complete", "lost", "open", "recovered"]);
export const LOGBOOK_KEY = "guns-only.pilot-logbook.v1";
export const LOGBOOK_LIMIT = 100;
export function createBrowserPilotLogbook() {
  let storage;
  try { storage = globalThis.localStorage; } catch { /* private browsing */ }
  return createPilotLogbook({ storage });
}
const text = (value, limit = 240) => typeof value === "string" ? value.slice(0, limit) : "";
const count = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1e7, value)) : null;
const disposition = (value) => DISPOSITIONS.has(value) ? value : "";

export function normalizeAttempt(value) {
  if (!value || typeof value !== "object" || !text(value.id, 80)
      || !text(value.activity, 80) || !text(value.outcome, 80)) return null;
  return {
    id: text(value.id, 80), activity: text(value.activity, 80),
    kind: value.kind === "practice" ? "practice" : "sortie",
    exercise: text(value.exercise, 24),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : null,
    endedAt: Number.isFinite(value.endedAt) ? value.endedAt : null,
    durationSeconds: count(value.durationSeconds),
    outcome: text(value.outcome, 80), correction: text(value.correction),
    rounds: count(value.rounds), hits: count(value.hits), kills: count(value.kills),
    recovered: value.recovered === true,
    valleyCleared: value.valleyCleared === true,
    laps: count(value.laps), bestLapSeconds: value.bestLapSeconds > 0 ? count(value.bestLapSeconds) : null,
    effectiveDrops: count(value.effectiveDrops), waterKg: count(value.waterKg), cycles: count(value.cycles),
    // F-22 like-for-like contract and the two separate results. Absent on older records.
    rung: Number.isInteger(value.rung) && value.rung >= 0 && value.rung <= 3 ? value.rung : null,
    opponent: text(value.opponent, 24), assist: text(value.assist, 12),
    combat: disposition(value.combat), recovery: disposition(value.recovery),
  };
}

export function createPilotLogbook({ storage, now = Date.now,
  newId = () => globalThis.crypto.randomUUID() } = {}) {
  let pending = null;
  let storageAvailable = !!storage;
  function read() {
    try {
      const raw = storage?.getItem(LOGBOOK_KEY);
      if (!raw) return [];
      if (raw.length > 256_000) throw new Error("oversized logbook");
      const data = JSON.parse(raw);
      if (data?.version !== 1 || !Array.isArray(data.attempts)) return [];
      const seen = new Set();
      return data.attempts.map(normalizeAttempt).filter((a) => {
        if (!a || seen.has(a.id)) return false;
        seen.add(a.id); return true;
      }).slice(-LOGBOOK_LIMIT);
    } catch { storageAvailable = false; return null; }
  }
  let memory = read() ?? [];
  let dirty = false;
  function latest() {
    // Persisted history is authoritative, including deletion in another tab. Once a write
    // fails, retain this tab's unsaved history until a later write succeeds.
    if (!dirty) memory = read() ?? memory;
    return memory;
  }
  function write(attempts) {
    memory = attempts.slice(-LOGBOOK_LIMIT);
    try {
      if (!storage) throw new Error("storage unavailable");
      storage.setItem(LOGBOOK_KEY, JSON.stringify({ version: 1, attempts: memory }));
      storageAvailable = true;
      dirty = false;
    } catch { storageAvailable = false; dirty = true; }
  }
  return {
    get pending() { return pending !== null; },
    get storageAvailable() { return storageAvailable; },
    /** Session-clock reading when the pending attempt began (see attempt_clock.js). */
    get pendingStartSimSeconds() { return pending?.startSimSeconds ?? null; },
    list() { return latest().map((a) => ({ ...a })); },
    begin({ activity, exercise = "", startSimSeconds = null }) {
      // A duplicate Begin edge is not another attempt. Call finish before restaging.
      if (pending) return pending.id;
      pending = { id: newId(), startedAt: now(), activity, exercise,
        kind: exercise ? "practice" : "sortie",
        startSimSeconds: Number.isFinite(startSimSeconds) ? startSimSeconds : null };
      return pending.id;
    },
    finish(result) {
      if (!pending) return null;
      const attempt = normalizeAttempt({ ...result, ...pending, endedAt: now() });
      pending = null;
      if (!attempt) return null;
      // Merge at write time so another tab's completed sortie is not overwritten.
      const byId = new Map([...latest(), attempt].map((a) => [a.id, a]));
      write([...byId.values()].sort((a, b) => a.endedAt - b.endedAt));
      return attempt;
    },
    clear() { write([]); },
    exportJson() { return JSON.stringify({ version: 1, attempts: latest() }, null, 2); },
  };
}

export function snapshotAttemptResult(state = {}, {
  abandoned = false, correction = "", startSimSeconds = null, combatResult = false,
} = {}) {
  const practice = state.practice_exercise && state.practice_exercise !== "none";
  const contract = f22AttemptContract(state);
  return {
    outcome: combatResult ? "Combat complete" : abandoned ? "Left before completion" : practice
      ? ({ completed: "Exercise complete", lost: "Aircraft lost", timelimit: "Time limit",
        ended: "Exercise ended" }[state.practice_status] || "Exercise ended")
      : String(state.sortie_outcome || "Ended").replaceAll("_", " "),
    correction,
    durationSeconds: attemptElapsedSeconds(state, startSimSeconds),
    rung: contract?.rung ?? null, opponent: contract?.opponent ?? "",
    assist: contract?.assist ?? "",
    combat: f22CombatDisposition(state) ?? "", recovery: f22RecoveryDisposition(state) ?? "",
    rounds: Number(state.sortie_rounds_fired), hits: Number(state.sortie_hits),
    kills: Number(state.kill_count),
    recovered: state.runway_recovery_phase_name === "RECOVERED"
      || state.combat_handoff_phase_name === "RECOVERED",
    valleyCleared: state.first_run_valley_available === true
      && state.first_run_weapons_cold === false,
  };
}

/** Same activity under the same difficulty contract: a harder opponent is a different task. */
export function sameTask(a, b) {
  return a.activity === b.activity && a.kind === b.kind && a.exercise === b.exercise
    && (a.rung ?? null) === (b.rung ?? null)
    && (a.opponent || "") === (b.opponent || "")
    && (a.assist || "") === (b.assist || "");
}

export function compareAttempts(attempts, attempt) {
  const previous = [...attempts].reverse().find((a) => a.id !== attempt.id && sameTask(a, attempt));
  if (!previous) return attempt.opponent ? "First attempt against this opponent" : "First recorded attempt";
  if (attempt.laps > 0 && previous.laps > 0 && attempt.bestLapSeconds > 0 && previous.bestLapSeconds > 0) {
    const delta = attempt.bestLapSeconds - previous.bestLapSeconds;
    return `Best clean lap ${Math.abs(delta).toFixed(2)} seconds ${delta <= 0 ? "quicker" : "slower"} vs previous ride`;
  }
  if (attempt.effectiveDrops != null && previous.effectiveDrops != null) {
    const delta = attempt.effectiveDrops - previous.effectiveDrops;
    return `${delta >= 0 ? "+" : ""}${delta} effective drops vs previous sortie`;
  }
  if (attempt.hits != null && previous.hits != null
      && attempt.rounds > 0 && previous.rounds > 0) {
    const delta = 100 * (attempt.hits / attempt.rounds - previous.hits / previous.rounds);
    return `Hit rate ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} percentage points vs previous attempt`;
  }
  if (attempt.outcome === "Exercise complete" && previous.outcome === attempt.outcome
      && attempt.durationSeconds != null && previous.durationSeconds != null) {
    const delta = attempt.durationSeconds - previous.durationSeconds;
    return `${Math.abs(delta).toFixed(1)} seconds ${delta <= 0 ? "quicker" : "longer"} vs previous completion`;
  }
  return `Previous: ${previous.outcome}`;
}
