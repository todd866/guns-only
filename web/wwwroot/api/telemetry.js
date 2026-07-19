// Vercel Function for the browser recorder in ../app.js.
//
// This intentionally talks to Vercel Blob over HTTP instead of importing
// @vercel/blob: wwwroot is deployed as-is and has no npm build step.

const { createHash } = require("crypto");
const { promisify } = require("util");
const { gzip } = require("zlib");

const BLOB_API = "https://blob.vercel-storage.com";
const STORAGE_DEADLINE_MS = 8_000;
const MAX_WRITE_ATTEMPTS = 4;
const MAX_ROWS_PER_CHUNK = 1_500;
const MAX_JSONL_BYTES = 2 * 1024 * 1024;
// Allow a little JSON-envelope overhead beyond the validated JSONL ceiling, while preventing an
// originless or oversized stream from being accumulated in Function memory without a bound.
const MAX_REQUEST_BYTES = MAX_JSONL_BYTES + 64 * 1024;
const gzipAsync = promisify(gzip);

class BlobHttpError extends Error {
  constructor(status, detail) {
    super(`Vercel Blob returned ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
    this.detail = detail;
  }
}

class RequestBodyTooLargeError extends Error {}
class InvalidTelemetryPayloadError extends Error {}
class TelemetryPayloadTooLargeError extends Error {}

function setResponseHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
}

function finish(response, status, body) {
  response.statusCode = status;
  if (body === undefined) response.end();
  else response.end(body);
}

async function readJsonBody(request) {
  // Vercel's Node helper normally parses JSON into request.body. Keep the
  // stream fallback so the function is also usable when helpers are disabled.
  const body = request.body;
  if (body !== undefined && body !== null) {
    if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8"));
    if (typeof body === "string") return JSON.parse(body);
    if (typeof body === "object") return body;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new RequestBodyTooLargeError(`telemetry request exceeds ${MAX_REQUEST_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safeSessionName(value) {
  return String(value || "")
    .replace(/\.\.+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 180);
}

function safeBatchId(value) {
  if (typeof value !== "string" || value.length < 16 || value.length > 128) return null;
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

function firstHeader(request, name) {
  const headers = request.headers;
  if (!headers) return undefined;
  const lowerName = name.toLowerCase();
  const direct = headers[lowerName] ?? headers[name];
  const value = direct !== undefined
    ? direct
    : Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function isHostedVercelEnvironment() {
  return typeof process.env.VERCEL_ENV === "string" && process.env.VERCEL_ENV.length > 0;
}

function isSameOriginRequest(request) {
  const origin = firstHeader(request, "origin");
  // Browser fetches always carry Origin for this POST. Permit only true local originless probes;
  // no hosted Vercel target should expose the Blob writer to scripts with no provenance.
  if (!origin) return !isHostedVercelEnvironment();
  const host = firstHeader(request, "x-forwarded-host") || firstHeader(request, "host");
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    const expectedHost = String(host).split(",")[0].trim().toLowerCase();
    if (originUrl.host.toLowerCase() !== expectedHost) return false;

    const forwardedProtocol = firstHeader(request, "x-forwarded-proto");
    const expectedProtocol = forwardedProtocol
      ? `${String(forwardedProtocol).split(",")[0].trim().replace(/:$/, "")}:`
      : (isHostedVercelEnvironment() ? "https:" : null);
    return expectedProtocol === null || originUrl.protocol.toLowerCase() === expectedProtocol.toLowerCase();
  } catch {
    return false;
  }
}

function hasJsonContentType(request) {
  const contentType = firstHeader(request, "content-type");
  if (typeof contentType !== "string") return false;
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function declaredBodyIsTooLarge(request) {
  const rawLength = firstHeader(request, "content-length");
  if (rawLength === undefined) return false;
  const length = Number(rawLength);
  return Number.isFinite(length) && length > MAX_REQUEST_BYTES;
}

function uploadUrl(pathname) {
  const encodedPath = pathname.split("/").map(encodeURIComponent).join("/");
  return `${BLOB_API}/${encodedPath}`;
}

async function writeBlob(pathname, contents, token, signal) {
  // The path-in-URL upload API rejects versioned read/list headers here.
  // Likewise a bare `access` header is rejected; use x-vercel-blob-access.
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/gzip",
    "x-content-type": "application/gzip",
    "x-content-length": String(Buffer.byteLength(contents)),
    "x-add-random-suffix": "0",
    "x-allow-overwrite": "0",
    "x-cache-control-max-age": "60",
    "x-vercel-blob-access": "private",
  };

  const response = await fetch(uploadUrl(pathname), {
    method: "PUT",
    headers,
    body: contents,
    signal,
  });
  if (response.ok) return;

  const detail = (await response.text()).slice(0, 300);
  // A retry can arrive after Blob committed the immutable object but before the Function response
  // reached the browser. The deterministic batch path makes already-exists an acknowledgement of
  // that same operation, not a reason to create a second billable object under another name.
  if (
    response.status === 409 ||
    (response.status === 400 && /already exists|precondition/i.test(detail))
  ) {
    return;
  }
  throw new BlobHttpError(response.status, detail);
}

function isRetryable(error) {
  if (error && error.name === "AbortError") return false;
  if (!(error instanceof BlobHttpError)) return true;
  return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

function delay(milliseconds, signal) {
  if (signal.aborted) {
    const error = new Error("Telemetry storage deadline exceeded");
    error.name = "AbortError";
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error("Telemetry storage deadline exceeded");
      error.name = "AbortError";
      reject(error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function appendRows(session, batchId, rows, token) {
  if (rows.length > MAX_ROWS_PER_CHUNK) {
    throw new TelemetryPayloadTooLargeError(`telemetry payload exceeds ${MAX_ROWS_PER_CHUNK} rows`);
  }
  if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new InvalidTelemetryPayloadError("telemetry rows must be JSON objects");
  }

  let serializedRows;
  try {
    serializedRows = rows.map((row) => {
      const serialized = JSON.stringify(row);
      if (typeof serialized !== "string" || !serialized.startsWith("{")) {
        throw new InvalidTelemetryPayloadError("telemetry rows must serialize as JSON objects");
      }
      return serialized;
    });
  } catch (error) {
    if (error instanceof InvalidTelemetryPayloadError) throw error;
    throw new InvalidTelemetryPayloadError("telemetry rows must be valid JSON objects");
  }
  const jsonl = Buffer.from(`${serializedRows.join("\n")}\n`, "utf8");
  if (jsonl.byteLength > MAX_JSONL_BYTES) {
    throw new TelemetryPayloadTooLargeError(
      `telemetry payload exceeds ${MAX_JSONL_BYTES} uncompressed bytes`,
    );
  }
  // Old tabs from the pre-batchId release remain accepted. Their exact JSONL content hashes to a
  // stable legacy path, so a lost response is still idempotent. New clients supply a random batch
  // ID once and retain the exact body across retries.
  const effectiveBatchId = batchId || `legacy-${createHash("sha256").update(jsonl).digest("hex")}`;
  const pathname = `telemetry/${session}/${effectiveBatchId}.jsonl.gz`;
  const compressed = await gzipAsync(jsonl, { level: 6 });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), STORAGE_DEADLINE_MS);
  let lastError;

  try {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        await writeBlob(pathname, compressed, token, controller.signal);
        return;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
        await delay(40 * 2 ** attempt, controller.signal);
      }
    }
    throw lastError || new Error("Vercel Blob telemetry write failed");
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = async function telemetry(request, response) {
  setResponseHeaders(response);

  if (request.method === "OPTIONS") {
    // The recorder is same-origin. Deliberately omit CORS headers so another website cannot use a
    // visitor's browser to turn this public function into an unmetered Blob write proxy.
    finish(response, 403, "Cross-origin telemetry is not allowed");
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    finish(response, 405, "Method Not Allowed");
    return;
  }
  if (!isSameOriginRequest(request)) {
    finish(response, 403, "Cross-origin telemetry is not allowed");
    return;
  }
  if (!hasJsonContentType(request)) {
    finish(response, 415, "Content-Type must be application/json");
    return;
  }
  if (declaredBodyIsTooLarge(request)) {
    finish(response, 413, "Telemetry request is too large");
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const session = safeSessionName(payload && payload.session);
    const suppliedBatchId = payload && payload.batchId;
    const rows = payload && payload.rows;
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!session || !Array.isArray(rows) || rows.length === 0) {
      throw new InvalidTelemetryPayloadError(
        "telemetry payload must contain a session and non-empty rows array",
      );
    }
    const batchId = suppliedBatchId === undefined ? null : safeBatchId(suppliedBatchId);
    if (suppliedBatchId !== undefined && !batchId) {
      throw new InvalidTelemetryPayloadError(
        "telemetry batchId must be 16-128 URL-safe characters",
      );
    }
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

    await appendRows(session, batchId, rows, token);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError
      || error instanceof TelemetryPayloadTooLargeError) {
      finish(response, 413, "Telemetry request is too large");
      return;
    }
    if (error instanceof InvalidTelemetryPayloadError || error instanceof SyntaxError) {
      finish(response, 400, "Telemetry payload is invalid");
      return;
    }
    // A persistence outage must be distinguishable from an accepted write. The browser recorder
    // remains isolated from gameplay, but retains this exact batch ID/body and backs off.
    console.error("telemetry persistence failed:", error instanceof Error ? error.message : String(error));
    response.setHeader("Retry-After", "30");
    finish(response, 503, "Telemetry persistence is unavailable");
    return;
  }

  finish(response, 204);
};
