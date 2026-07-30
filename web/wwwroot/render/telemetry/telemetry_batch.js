const UTF8 = new TextEncoder();

// The Vercel function permits a 2 MiB JSONL body plus 64 KiB of request-envelope overhead.
// Keep the browser's complete JSON request at or below the stricter 2 MiB boundary as well, so
// neither the HTTP envelope nor the newline representation can surprise the receiver.
export const TELEMETRY_REQUEST_BYTE_LIMIT = 2 * 1024 * 1024;
export const TELEMETRY_JSONL_BYTE_LIMIT = 2 * 1024 * 1024;
export const TELEMETRY_ROWS_PER_BATCH_LIMIT = 1_500;

export function utf8ByteLength(value) {
  return UTF8.encode(value).byteLength;
}

export function retainNewestTelemetryRows(rows, maximumRows) {
  if (!Array.isArray(rows)) return [];
  const limit = Number.isSafeInteger(maximumRows) && maximumRows >= 0 ? maximumRows : 0;
  return rows.length <= limit ? rows : rows.slice(rows.length - limit);
}

function isSortieInitialAiComputeLevel(row) {
  return row?.k === "in"
    && row.type === "perf"
    && row.code === "AiComputeLevel"
    && row.initial === true
    && row.cause === "sortie-initial";
}

function isForegroundFrameContractBreach(row) {
  return row?.k === "perf"
    && row.active_foreground === 1
    && (row.contract_pass === 0 || row.contract_pass === false);
}

/**
 * Bound the live recorder queue without orphaning its diagnostic baselines or latest breach.
 *
 * Reconstruction favors the newest rows during backpressure, but the latest sortie's initial
 * level is the baseline that gives every later transition meaning. If ordinary head trimming
 * would remove it, preserve it. The latest failed foreground frame contract is similarly the
 * evidence needed to explain a machine that remained slow at minimum quality. Sacrifice the
 * oldest non-critical retained tail rows for those at most two anchors. The result remains
 * chronological and never exceeds `maximumRows`.
 */
export function retainTelemetryRowsUnderBackpressure(rows, maximumRows) {
  const retained = retainNewestTelemetryRows(rows, maximumRows);
  if (!Array.isArray(rows) || retained.length === 0 || retained.length === rows.length)
    return retained;

  let baselineIndex = -1;
  let breachIndex = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (baselineIndex < 0 && isSortieInitialAiComputeLevel(rows[index])) {
      baselineIndex = index;
    }
    if (breachIndex < 0 && isForegroundFrameContractBreach(rows[index])) breachIndex = index;
    if (baselineIndex >= 0 && breachIndex >= 0) break;
  }

  const firstRetainedIndex = rows.length - retained.length;
  const selected = new Set(
    Array.from({ length: retained.length }, (_, offset) => firstRetainedIndex + offset),
  );
  const critical = new Set(
    [baselineIndex, breachIndex].filter((index) => index >= 0),
  );
  for (const criticalIndex of [...critical].sort((a, b) => a - b)) {
    if (selected.has(criticalIndex)) continue;
    const victim = [...selected].sort((a, b) => a - b)
      .find((index) => !critical.has(index));
    if (victim === undefined) continue;
    selected.delete(victim);
    selected.add(criticalIndex);
  }
  return [...selected].sort((a, b) => a - b).map((index) => rows[index]);
}

function serializeObjectRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  try {
    const serialized = JSON.stringify(row);
    // A custom toJSON() can turn an object into a primitive. The server accepts object rows only,
    // so reject that locally instead of creating a batch that can never succeed.
    return typeof serialized === "string" && serialized.startsWith("{") ? serialized : null;
  } catch {
    return null;
  }
}

/**
 * Select the largest ordered prefix that satisfies both production byte ceilings.
 *
 * Invalid or individually oversized rows are discarded while scanning. This is deliberate: a
 * single poison row must not remain at the head of the queue and wedge every later valid sample.
 * Rows after a normal capacity boundary remain queued for the next single-flight upload.
 */
export function buildTelemetryBatch({
  session,
  batchId,
  rows,
  maximumRequestBytes = TELEMETRY_REQUEST_BYTE_LIMIT,
  maximumJsonlBytes = TELEMETRY_JSONL_BYTE_LIMIT,
  maximumRows = TELEMETRY_ROWS_PER_BATCH_LIMIT,
} = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const requestLimit = Number.isSafeInteger(maximumRequestBytes) && maximumRequestBytes > 0
    ? maximumRequestBytes : TELEMETRY_REQUEST_BYTE_LIMIT;
  const jsonlLimit = Number.isSafeInteger(maximumJsonlBytes) && maximumJsonlBytes > 0
    ? maximumJsonlBytes : TELEMETRY_JSONL_BYTE_LIMIT;
  const rowLimit = Number.isSafeInteger(maximumRows) && maximumRows > 0
    ? maximumRows : TELEMETRY_ROWS_PER_BATCH_LIMIT;
  const prefix = `{"session":${JSON.stringify(String(session ?? ""))},`
    + `"batchId":${JSON.stringify(String(batchId ?? ""))},"rows":[`;
  const suffix = "]}";
  const emptyRequestBytes = utf8ByteLength(prefix) + utf8ByteLength(suffix);

  const selectedRows = [];
  const serializedRows = [];
  let selectedRequestBytes = emptyRequestBytes;
  let selectedJsonlBytes = 0;
  let droppedRows = 0;
  let cursor = 0;

  while (cursor < sourceRows.length && selectedRows.length < rowLimit) {
    const row = sourceRows[cursor];
    const serialized = serializeObjectRow(row);
    if (serialized === null) {
      droppedRows++;
      cursor++;
      continue;
    }

    const rowBytes = utf8ByteLength(serialized);
    const commaBytes = selectedRows.length > 0 ? 1 : 0;
    const nextRequestBytes = selectedRequestBytes + commaBytes + rowBytes;
    const nextJsonlBytes = selectedJsonlBytes + rowBytes + 1;
    const rowCannotFitAlone = emptyRequestBytes + rowBytes > requestLimit
      || rowBytes + 1 > jsonlLimit;

    if (rowCannotFitAlone) {
      droppedRows++;
      cursor++;
      continue;
    }
    if (nextRequestBytes > requestLimit || nextJsonlBytes > jsonlLimit) break;

    selectedRows.push(row);
    serializedRows.push(serialized);
    selectedRequestBytes = nextRequestBytes;
    selectedJsonlBytes = nextJsonlBytes;
    cursor++;
  }

  const remainingRows = sourceRows.slice(cursor);
  if (selectedRows.length === 0) {
    return Object.freeze({
      rows: Object.freeze([]),
      remainingRows,
      droppedRows,
      payload: null,
      requestBytes: 0,
      jsonlBytes: 0,
    });
  }

  const payload = `${prefix}${serializedRows.join(",")}${suffix}`;
  const requestBytes = utf8ByteLength(payload);
  if (requestBytes !== selectedRequestBytes) {
    throw new Error("Telemetry batch byte accounting drifted from its serialized payload");
  }
  return Object.freeze({
    rows: Object.freeze(selectedRows),
    remainingRows,
    droppedRows,
    payload,
    requestBytes,
    jsonlBytes: selectedJsonlBytes,
  });
}
