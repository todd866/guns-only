// Feedback report upload endpoint. This intentionally uses the Vercel Blob HTTP API so the
// wwwroot deployment has no npm build step.
const { promisify } = require("node:util");
const { gzip } = require("node:zlib");

const BLOB_API = "https://blob.vercel-storage.com";
const STORAGE_DEADLINE_MS = 8_000;
const MAX_WRITE_ATTEMPTS = 4;
const MAX_REPORT_JSON_BYTES = 2 * 1024 * 1024;
const MAX_JPEG_BYTES = 1.5 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4.2 * 1024 * 1024;
const gzipAsync = promisify(gzip);
const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_DEFAULT_MAX = 30;

class RequestBodyTooLargeError extends Error {}
class InvalidReportError extends Error {}
class BlobHttpError extends Error {
  constructor(status, detail) {
    super(`Vercel Blob returned ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
  }
}

function firstHeader(request, name) {
  const headers = request.headers || {};
  const lower = name.toLowerCase();
  const value = headers[lower] ?? headers[name]
    ?? Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function hosted() {
  return typeof process.env.VERCEL_ENV === "string" && process.env.VERCEL_ENV.length > 0;
}

function sameOrigin(request) {
  const origin = firstHeader(request, "origin");
  if (!origin) return !hosted();
  const host = firstHeader(request, "x-forwarded-host") || firstHeader(request, "host");
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    const expectedHost = String(host).split(",")[0].trim().toLowerCase();
    if (originUrl.host.toLowerCase() !== expectedHost) return false;
    const proto = firstHeader(request, "x-forwarded-proto");
    const expected = proto ? `${String(proto).split(",")[0].trim().replace(/:$/, "")}:`
      : (hosted() ? "https:" : null);
    return expected === null || originUrl.protocol.toLowerCase() === expected.toLowerCase();
  } catch { return false; }
}

function jsonContentType(request) {
  const value = firstHeader(request, "content-type");
  return typeof value === "string" && value.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function declaredTooLarge(request) {
  const length = Number(firstHeader(request, "content-length"));
  return Number.isFinite(length) && length > MAX_REQUEST_BYTES;
}

async function readJsonBody(request) {
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body) || typeof request.body === "string") {
      const bytes = Buffer.byteLength(request.body);
      if (bytes > MAX_REQUEST_BYTES) throw new RequestBodyTooLargeError();
      return JSON.parse(request.body.toString());
    }
    if (typeof request.body === "object") {
      const encoded = JSON.stringify(request.body);
      if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) throw new RequestBodyTooLargeError();
      return request.body;
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
}

function safeId(value) {
  return typeof value === "string" && value.length >= 16 && value.length <= 128
    && /^[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

function reportDate(created) {
  if (typeof created !== "string" || !/^\d{4}-\d\d-\d\dT/.test(created)) return null;
  const date = new Date(created);
  return Number.isFinite(date.getTime()) && created === date.toISOString()
    ? date.toISOString().slice(0, 10) : null;
}

function clientIp(request) {
  const real = firstHeader(request, "x-real-ip");
  const forwarded = firstHeader(request, "x-forwarded-for");
  return (typeof real === "string" && real.trim()) ? real.trim()
    : (typeof forwarded === "string" && forwarded.trim() ? forwarded.split(",")[0].trim() : "unknown");
}

function rateLimited(request) {
  const now = Date.now();
  const key = clientIp(request);
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }
  bucket.count += 1;
  const configured = Number(process.env.REPORT_RATE_LIMIT_MAX);
  const max = Number.isFinite(configured) && configured > 0 ? configured : RATE_LIMIT_DEFAULT_MAX;
  return bucket.count > max;
}

function uploadUrl(pathname) {
  return `${BLOB_API}/${pathname.split("/").map(encodeURIComponent).join("/")}`;
}

async function writeBlob(pathname, contents, token, contentType, signal) {
  const response = await fetch(uploadUrl(pathname), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "x-content-type": contentType,
      "x-content-length": String(contents.length),
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "0",
      "x-cache-control-max-age": "60",
      "x-vercel-blob-access": "private",
    },
    body: contents,
    signal,
  });
  if (response.ok || response.status === 409) return;
  const detail = (await response.text()).slice(0, 300);
  if (response.status === 400 && /already exists|precondition/i.test(detail)) return;
  throw new BlobHttpError(response.status, detail);
}

function retryable(error) {
  return !(error && error.name === "AbortError") &&
    (!(error instanceof BlobHttpError) || [408, 409, 429].includes(error.status) || error.status >= 500);
}

function wait(ms, signal) {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("storage deadline exceeded"), { name: "AbortError" }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("storage deadline exceeded"), { name: "AbortError" }));
    }, { once: true });
  });
}

async function writeWithRetry(pathname, body, token, contentType, signal) {
  let last;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    try { await writeBlob(pathname, body, token, contentType, signal); return; }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
      await wait(40 * 2 ** attempt, signal);
    }
  }
  throw last;
}

function finish(response, status, body) {
  response.statusCode = status;
  if (body !== undefined) response.end(body);
  else response.end();
}

module.exports = async function report(request, response) {
  response.setHeader("Cache-Control", "no-store");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    finish(response, 200, JSON.stringify({ enabled: Boolean(token) }));
    return;
  }
  if (request.method === "OPTIONS") { finish(response, 403, "Cross-origin reports are not allowed"); return; }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    finish(response, 405, "Method Not Allowed");
    return;
  }
  if (!sameOrigin(request)) { finish(response, 403, "Cross-origin reports are not allowed"); return; }
  if (!jsonContentType(request)) { finish(response, 415, "Content-Type must be application/json"); return; }
  if (declaredTooLarge(request)) { finish(response, 413, "Report request is too large"); return; }
  if (rateLimited(request)) { response.setHeader("Retry-After", "60"); finish(response, 429, "Too many report requests"); return; }
  if (!token) { finish(response, 503, "Report persistence is unavailable"); return; }

  try {
    const payload = await readJsonBody(request);
    const report = payload && payload.report;
    if (!report || typeof report !== "object" || Array.isArray(report)
      || !safeId(report.id) || !reportDate(report.created)
      || typeof payload.jpeg !== "string") throw new InvalidReportError();
    const jpeg = Buffer.from(payload.jpeg, "base64");
    if (!jpeg.length || jpeg.length > MAX_JPEG_BYTES || !jpeg.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) {
      throw new InvalidReportError();
    }
    const json = Buffer.from(JSON.stringify(report), "utf8");
    if (json.length > MAX_REPORT_JSON_BYTES) throw new RequestBodyTooLargeError();
    const path = `reports/${reportDate(report.created)}/${report.id}`;
    const compressed = await gzipAsync(json, { level: 6 });
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), STORAGE_DEADLINE_MS);
    try {
      await writeWithRetry(`${path}.json.gz`, compressed, token, "application/gzip", controller.signal);
      await writeWithRetry(`${path}.jpg`, jpeg, token, "image/jpeg", controller.signal);
    } finally { clearTimeout(deadline); }
    finish(response, 204);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) { finish(response, 413, "Report request is too large"); return; }
    if (error instanceof InvalidReportError || error instanceof SyntaxError || error instanceof TypeError) {
      finish(response, 400, "Report payload is invalid"); return;
    }
    console.error("report persistence failed:", error instanceof Error ? error.message : String(error));
    response.setHeader("Retry-After", "30");
    finish(response, 503, "Report persistence is unavailable");
  }
};

module.exports._test = { MAX_JPEG_BYTES, MAX_REPORT_JSON_BYTES, MAX_REQUEST_BYTES };
