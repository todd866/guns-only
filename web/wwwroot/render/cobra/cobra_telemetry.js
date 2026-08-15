import {
  buildTelemetryBatch,
  retainNewestTelemetryRows,
} from "../telemetry/telemetry_batch.js?v=338";

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
// The cadence starts a bounded multi-request drain cycle; see MAX_DRAIN_BATCHES below.
export const COBRA_TELEMETRY_FLUSH_INTERVAL_MS = 5_000;
// A real Build 327 Cobra state row is ~3 KiB (ground-war units/events included), so a 48 KiB
// request carries only ~16 rows while 50 arrive every five seconds. One request per cadence can
// never catch up. Drain several bounded requests after each successful periodic send; eight is
// >2.5x the measured arrival rate while still preventing an unbounded promise chain on a slow
// connection. Pagehide remains exactly one keepalive request.
export const COBRA_TELEMETRY_MAX_DRAIN_BATCHES = 8;
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
  let sendingOwner = 0;
  let requestSequence = 0;
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

  function sendBatch({ pagehide, drainBudget }) {
    let ownsSingleFlight = false;
    let requestId = 0;
    try {
      if (typeof fetchImpl !== "function") return null;
      // Single-flight for periodic flushes. Pagehide may overlap an in-flight attempt: the body
      // is idempotent per batch ID, and a last-gasp duplicate beats a lost sortie tail.
      if (sending && !pagehide) return null;
      const overlapsExistingRequest = sending && pagehide;
      const batch = takeBatch();
      if (!batch) return null;
      lastAttemptMs = now();
      requestId = ++requestSequence;
      ownsSingleFlight = !overlapsExistingRequest;
      if (ownsSingleFlight) {
        sending = true;
        sendingOwner = requestId;
      }
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
            // A pagehide duplicate can settle after the periodic owner has already advanced to
            // the next batch. Clear only the exact object this request sent; never erase that
            // newer pending batch by observing a late success for the old idempotency key.
            if (pending === batch) pending = null;
            return true;
          }
          failures += 1;
          lastError = `HTTP ${response?.status ?? "unknown"}`;
          return false;
        })
        .catch((error) => {
          // Transport failure: keep the immutable pending batch for an identical retry.
          failures += 1;
          lastError = String(error);
          return false;
        })
        .then((delivered) => {
          // An overlapping pagehide request never owns the periodic single-flight latch. Its
          // late completion must not make a recursively-started successor appear idle.
          if (ownsSingleFlight && sendingOwner === requestId) {
            sending = false;
            sendingOwner = 0;
          }
          // A successful periodic attempt owns a bounded drain cycle. Awaiting the recursive
          // send makes `await flush()` mean the cycle is complete, which keeps diagnostics and
          // tests deterministic. A failure never spins; its immutable pending body waits for the
          // next scheduled retry.
          if (delivered && !pagehide && drainBudget > 1 && rows.length > 0) {
            return sendBatch({ pagehide: false, drainBudget: drainBudget - 1 });
          }
          return undefined;
        });
    } catch (error) {
      failures += 1;
      lastError = String(error);
      if (ownsSingleFlight && sendingOwner === requestId) {
        sending = false;
        sendingOwner = 0;
      }
      return null;
    }
  }

  function flush({ pagehide = false } = {}) {
    return sendBatch({
      pagehide,
      drainBudget: pagehide ? 1 : COBRA_TELEMETRY_MAX_DRAIN_BATCHES,
    });
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
