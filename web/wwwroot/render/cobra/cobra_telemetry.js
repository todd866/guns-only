import {
  buildTelemetryBatch,
  retainNewestTelemetryRows,
} from "../telemetry/telemetry_batch.js?v=311";

/**
 * Bounded telemetry channel for the Cobra mission page.
 *
 * Chrome rejects any keepalive request whose body exceeds 65,536 bytes. The previous uploader
 * posted every batch with keepalive:true, gated periodic flushes at ≥120 rows (≈98 KB), and
 * spliced rows out of the queue BEFORE the fetch with a bare catch — so every periodic flush
 * failed and destroyed its rows (97–99% loss on the owner's production drive). This channel:
 *  - builds every batch to ≤48 KiB with the production batch builder (slice, keep remainder),
 *  - sends periodic flushes as plain fetch and reserves keepalive for the single pagehide path
 *    (where the ≤48 KiB body is safely under the keepalive cap),
 *  - retains a failed batch untouched and retries the identical idempotent body,
 *  - bounds the buffer, shedding oldest rows behind an explicit counter,
 *  - leads every batch with an hdr row (build/session/ua/t0) in the F-22 recorder's shape.
 * Every entry point is guarded: telemetry must never be able to stall the flight loop.
 */

export const COBRA_TELEMETRY_BATCH_BYTE_LIMIT = 48 * 1024;
// Rows arrive at ~10 Hz × ~0.8 KB ≈ 8 KB/s; a 5 s cadence drains up to 48 KiB per flush, so the
// queue empties faster than it fills in steady state.
export const COBRA_TELEMETRY_FLUSH_INTERVAL_MS = 5_000;
// ≈4 minutes of rows at 10 Hz. Bounded memory outranks a perfect trace, as in the F-22 recorder.
export const COBRA_TELEMETRY_BUFFER_ROW_LIMIT = 2_400;

export function createCobraTelemetryChannel({
  session,
  build,
  userAgent,
  endpoint = "../api/telemetry",
  fetchImpl = globalThis.fetch?.bind(globalThis),
  now = () => performance.now(),
  bufferRowLimit = COBRA_TELEMETRY_BUFFER_ROW_LIMIT,
  batchByteLimit = COBRA_TELEMETRY_BATCH_BYTE_LIMIT,
  flushIntervalMs = COBRA_TELEMETRY_FLUSH_INTERVAL_MS,
} = {}) {
  let rows = [];
  let pending = null;
  let sending = false;
  let droppedRows = 0;
  let flushes = 0;
  let failures = 0;
  let lastError = null;
  let lastAttemptMs = now();
  let batchSequence = 0;
  const timeOriginMs = globalThis.performance?.timeOrigin ?? Date.now();

  // Same attribution shape as the F-22 recorder's chunk header, so the telemetry admin decoder
  // attributes Cobra sessions (build/UA) without a bespoke path.
  function header(batchId) {
    return {
      k: "hdr",
      build,
      session,
      ua: userAgent,
      t0: timeOriginMs,
      clock_basis: "performance_time_origin_plus_monotonic_ms",
      batch_id: batchId,
    };
  }

  function record(row) {
    if (!row || typeof row !== "object") return;
    rows.push(row);
    if (rows.length > bufferRowLimit) {
      const overflow = rows.length - bufferRowLimit;
      rows = retainNewestTelemetryRows(rows, bufferRowLimit);
      droppedRows += overflow;
    }
  }

  function takeBatch() {
    if (pending) return pending;
    if (!rows.length) return null;
    const batchId = `${session}-${++batchSequence}`;
    const built = buildTelemetryBatch({
      session,
      batchId,
      rows: [header(batchId), ...rows],
      maximumRequestBytes: batchByteLimit,
      maximumJsonlBytes: batchByteLimit,
    });
    // The header always serializes first, so remainingRows is exactly the unsent data tail.
    rows = [...built.remainingRows];
    droppedRows += built.droppedRows;
    if (!built.payload) return null;
    pending = { batchId, payload: built.payload, rowCount: built.rows.length - 1 };
    return pending;
  }

  function flush({ pagehide = false } = {}) {
    try {
      if (typeof fetchImpl !== "function") return null;
      // Single-flight for periodic flushes. Pagehide may overlap an in-flight attempt: the body
      // is idempotent per batch ID, and a last-gasp duplicate beats a lost sortie tail.
      if (sending && !pagehide) return null;
      const batch = takeBatch();
      if (!batch) return null;
      lastAttemptMs = now();
      sending = true;
      flushes += 1;
      const options = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: batch.payload,
      };
      // Keepalive ONLY here: the ≤48 KiB batch stays under Chrome's 64 KiB keepalive body cap.
      if (pagehide) options.keepalive = true;
      // Start the request synchronously — a pagehide flush may never see another microtask.
      // A synchronous fetchImpl throw lands in the outer catch with the batch retained.
      return Promise.resolve(fetchImpl(endpoint, options))
        .then((response) => {
          if (response?.ok) {
            pending = null;
            return;
          }
          failures += 1;
          lastError = `HTTP ${response?.status ?? "unknown"}`;
        })
        .catch((error) => {
          // Transport failure: keep the immutable pending batch for an identical retry.
          failures += 1;
          lastError = String(error);
        })
        .finally(() => {
          sending = false;
        });
    } catch (error) {
      failures += 1;
      lastError = String(error);
      sending = false;
      return null;
    }
  }

  function flushIfDue(nowMs) {
    if (nowMs - lastAttemptMs < flushIntervalMs) return null;
    if (!rows.length && !pending) return null;
    return flush();
  }

  function diagnostics() {
    return {
      bufferedRows: rows.length,
      pendingRows: pending?.rowCount ?? 0,
      droppedRows,
      flushes,
      failures,
      lastError,
    };
  }

  return Object.freeze({ record, flush, flushIfDue, diagnostics });
}
