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
