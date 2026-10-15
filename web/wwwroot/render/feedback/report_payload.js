import { TelemetryStateEncoder, ensureTelemetryChunkKeyframe } from "../telemetry/state_delta.js";
import { TelemetrySampleScheduler } from "../telemetry/sample_scheduler.js";

export const REPORT_KEY = "F8";
export const REPORT_WINDOW_MS = 120_000;
export const REPORT_MAX_ROWS = 6_000;
export const REPORT_JSON_BYTES = 16 * 1024 * 1024;
export const REPORT_BINARY_BYTES = 1.5 * 1024 * 1024;
export const REPORT_NOTE_LENGTH = 2_000;
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const clone = (value) => JSON.parse(JSON.stringify(value));

// Local memory only. Upload acknowledgements and sharing consent never consume this history.
// The encoder is the telemetry encoder, including a promotable first keyframe after eviction.
export function createReportHistory() {
  const encoder = new TelemetryStateEncoder();
  const scheduler = new TelemetrySampleScheduler();
  let rows = [];
  return {
    add(row) {
      rows.push(row);
      const cutoff = row.t - REPORT_WINDOW_MS;
      let start = Math.max(0, rows.length - REPORT_MAX_ROWS);
      while (start < rows.length && rows[start].t < cutoff) start++;
      if (start) rows = ensureTelemetryChunkKeyframe(rows.slice(start));
    },
    sample(state, time, build, held) {
      if (!state) return;
      const decision = scheduler.observe(state);
      if (!decision.record) return;
      if (decision.forceKeyframe) encoder.forceKeyframe();
      const row = encoder.encode({ state, time, build, held });
      row.authority_tick_delta = decision.authorityTickDelta;
      row.sample_reason = decision.reasons.join("+");
      this.add(row);
    },
    snapshot(now) {
      return ensureTelemetryChunkKeyframe(rows.filter(row => row.t >= now - REPORT_WINDOW_MS && row.t <= now));
    },
  };
}

/** Pure, bounded JSON schema. Full current state is never pruned to make room for history. */
export function buildReportPayload({ id, created, now, build, revision = null, url,
  program = null, mission = null, beat = null, state, settings = {}, device = {},
  perf = {}, camera = {}, held = [], rows = [], warnings = [], note = "", timeOrigin = null,
  presentation = null, maxBytes = REPORT_JSON_BYTES }) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) throw new TypeError("Invalid report ID");
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("Missing full state");
  let recent = ensureTelemetryChunkKeyframe(rows.filter(row => row && Number.isFinite(row.t)
    && row.t >= now - REPORT_WINDOW_MS && row.t <= now).slice(-REPORT_MAX_ROWS));
  const originalRows = rows.filter(row => row && row.t >= now - REPORT_WINDOW_MS && row.t <= now).length;
  const report = {
    schema: "guns-only-feedback/1", id, created, build, revision, url,
    program, mission, beat,
    seeds: Object.fromEntries(Object.entries(state).filter(([key]) => /seed/i.test(key))),
    difficulty: state.difficulty_rung ?? state.sortie_rung ?? null,
    settings: clone(settings), device: clone(device), perf: clone(perf), camera: clone(camera),
    state: { k: "st", t: now, build, q: 0, held: [...held], s: clone(state) },
    presentation: presentation === null ? null : clone(presentation),
    timeOrigin, historyWindowMs: REPORT_WINDOW_MS,
    telemetry: [], inputs: [],
    console: warnings.slice(-50).map(row => ({ ...row, message: String(row.message ?? "").slice(0, 2048) })),
    note: String(note).slice(0, REPORT_NOTE_LENGTH),
    historyDroppedRows: 0,
  };
  const limit = Math.min(REPORT_JSON_BYTES, maxBytes);
  for (;;) {
    report.telemetry = recent.filter(row => row.k !== "in");
    report.inputs = recent.filter(row => row.k === "in");
    report.historyDroppedRows = originalRows - recent.length;
    if (bytes(report) <= limit) return clone(report);
    if (!recent.length) throw new RangeError("Full report state exceeds the report limit");
    recent = ensureTelemetryChunkKeyframe(recent.slice(Math.max(1, Math.ceil(recent.length / 5))));
  }
}

export function frameTimeStats(samples) {
  const ordered = samples.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!ordered.length) return { count: 0 };
  return { count: ordered.length, meanMs: ordered.reduce((sum, n) => sum + n, 0) / ordered.length,
    p50Ms: ordered[Math.floor((ordered.length - 1) * .5)],
    p95Ms: ordered[Math.floor((ordered.length - 1) * .95)],
    p99Ms: ordered[Math.floor((ordered.length - 1) * .99)], maxMs: ordered.at(-1) };
}

/** Make a smaller independently decodable tail after serialization (no hidden encoder state). */
export function trimReportHistory(report) {
  const ordered = [...report.telemetry, ...report.inputs].sort((a, b) => a.t - b.t);
  const remove = Math.max(1, Math.ceil(ordered.length / 4));
  const keep = new Set(ordered.slice(remove));
  let materialized = null;
  let anchored = false;
  const telemetry = [];
  for (const row of report.telemetry) {
    if (row.k === "st") {
      materialized = row.s ? { ...row.s } : { ...materialized, ...row.d };
      for (const key of row.x || []) delete materialized[key];
    }
    if (!keep.has(row)) continue;
    if (row.k === "st" && !anchored) {
      const { d, x, ...rest } = row;
      telemetry.push({ ...rest, build: row.build ?? report.build, s: materialized });
      anchored = true;
    } else telemetry.push(row);
  }
  return { ...report, telemetry, inputs: report.inputs.filter(row => keep.has(row)),
    historyDroppedRows: report.historyDroppedRows + Math.min(remove, ordered.length) };
}
