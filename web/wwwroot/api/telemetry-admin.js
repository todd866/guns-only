// Production-only, operator-authenticated access to deliberately selected telemetry chunks.
//
// The browser recorder writes to a private Vercel Blob store. This function keeps the store's
// master token inside Vercel while giving the local analysis tools two deliberately narrow
// operations: one bounded list page, or one bounded immutable chunk download. It intentionally
// has no CORS, pagination, retry, range, redirect, delete, or write capability.

const { timingSafeEqual } = require("node:crypto");

const BLOB_API = "https://blob.vercel-storage.com";
const BLOB_API_VERSION = "12";
const MAX_LIST_ITEMS = 100;
const MAX_LIST_RESPONSE_BYTES = 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const STORAGE_DEADLINE_MS = 15_000;

class AdminRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function finish(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.statusCode = status;
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (body === undefined) {
    response.end();
    return;
  }
  response.setHeader("Content-Type", contentType);
  response.end(body);
}

function firstHeader(request, name) {
  const headers = request.headers || {};
  const lowerName = name.toLowerCase();
  const direct = headers[lowerName] ?? headers[name];
  const value = direct !== undefined
    ? direct
    : Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function constantTimeMatch(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}

function isAuthorized(request) {
  const expected = process.env.TELEMETRY_ADMIN_TOKEN;
  if (typeof expected !== "string" || expected.length < 32) return false;
  const authorization = firstHeader(request, "authorization");
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  return constantTimeMatch(authorization.slice("Bearer ".length), expected);
}

function parseRequestUrl(request) {
  const host = firstHeader(request, "x-forwarded-host") || firstHeader(request, "host") || "localhost";
  try {
    return new URL(request.url || "/api/telemetry-admin", `https://${String(host).split(",")[0].trim()}`);
  } catch {
    throw new AdminRequestError(400, "Request URL is invalid");
  }
}

function boundedInteger(raw, name, maximum) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new AdminRequestError(400, `${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new AdminRequestError(400, `${name} exceeds its maximum`);
  }
  return value;
}

function normalizeEtag(value) {
  if (typeof value !== "string" || !value || value.length > 512 || /[\r\n]/.test(value)) {
    throw new AdminRequestError(400, "etag is invalid");
  }
  return value.replace(/^W\//i, "").replace(/^"|"$/g, "");
}

function validateBlobUrl(raw) {
  if (typeof raw !== "string" || raw.length > 4096) {
    throw new AdminRequestError(400, "url is invalid");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AdminRequestError(400, "url is invalid");
  }
  const hostname = url.hostname.toLowerCase();
  const blobHost = hostname === "blob.vercel-storage.com"
    || hostname.endsWith(".blob.vercel-storage.com");
  if (
    url.protocol !== "https:"
    || !blobHost
    || url.port
    || url.username
    || url.password
    || url.hash
    || !url.pathname.startsWith("/telemetry/")
  ) {
    throw new AdminRequestError(400, "url must identify one telemetry object in Vercel Blob");
  }
  return url;
}

function parseContentLength(headers) {
  const raw = headers.get("content-length");
  if (raw === null) return null;
  if (!/^(0|[1-9]\d*)$/.test(raw)) throw new AdminRequestError(502, "Blob response length is invalid");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new AdminRequestError(502, "Blob response is too large");
  return value;
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Best effort while failing closed.
  }
}

async function readBoundedBody(response, maximumBytes, expectedBytes = null) {
  const declaredLength = parseContentLength(response.headers);
  if (declaredLength !== null && declaredLength > maximumBytes) {
    await cancelBody(response);
    throw new AdminRequestError(502, "Blob response exceeds the byte limit");
  }
  if (expectedBytes !== null && declaredLength !== null && declaredLength !== expectedBytes) {
    await cancelBody(response);
    throw new AdminRequestError(409, "Blob size no longer matches the selected metadata");
  }

  const chunks = [];
  let received = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.byteLength;
      if (received > maximumBytes) {
        await cancelBody(response);
        throw new AdminRequestError(502, "Blob response exceeds the byte limit");
      }
      chunks.push(buffer);
    }
  }
  if (declaredLength !== null && received !== declaredLength) {
    throw new AdminRequestError(502, "Blob response did not match Content-Length");
  }
  if (expectedBytes !== null && received !== expectedBytes) {
    throw new AdminRequestError(409, "Blob size no longer matches the selected metadata");
  }
  return Buffer.concat(chunks);
}

async function withBlobResponse(url, { list = false } = {}, consume) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (typeof token !== "string" || !token) throw new AdminRequestError(503, "Telemetry storage is unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STORAGE_DEADLINE_MS);
  try {
    let response;
    try {
      const headers = {
        Accept: list ? "application/json" : "application/gzip",
        "Accept-Encoding": "identity",
        Authorization: `Bearer ${token}`,
      };
      if (list) headers["x-api-version"] = BLOB_API_VERSION;
      response = await fetch(url, {
        method: "GET",
        headers,
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new AdminRequestError(502, "Bounded Blob request failed; no retry was attempted");
    }
    try {
      return await consume(response);
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof AdminRequestError)) {
        throw new AdminRequestError(504, "Bounded Blob request timed out; no retry was attempted");
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function listOnePage(requestUrl) {
  const prefix = requestUrl.searchParams.get("prefix") || "telemetry/";
  if (!prefix.startsWith("telemetry/") || prefix.length > 1024) {
    throw new AdminRequestError(400, "prefix must start with telemetry/");
  }
  const limit = boundedInteger(requestUrl.searchParams.get("limit") || "50", "limit", MAX_LIST_ITEMS);
  const cursor = requestUrl.searchParams.get("cursor");
  if (cursor !== null && (!cursor || cursor.length > 4096)) {
    throw new AdminRequestError(400, "cursor is invalid");
  }

  const blobUrl = new URL(BLOB_API);
  blobUrl.searchParams.set("prefix", prefix);
  blobUrl.searchParams.set("limit", String(limit));
  blobUrl.searchParams.set("mode", "expanded");
  if (cursor !== null) blobUrl.searchParams.set("cursor", cursor);
  return withBlobResponse(blobUrl, { list: true }, async (blobResponse) => {
    if (blobResponse.status !== 200) {
      await cancelBody(blobResponse);
      throw new AdminRequestError(502, `Blob list returned HTTP ${blobResponse.status}`);
    }
    const body = await readBoundedBody(blobResponse, MAX_LIST_RESPONSE_BYTES);
    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      throw new AdminRequestError(502, "Blob list response was invalid JSON");
    }
    if (!payload || !Array.isArray(payload.blobs) || payload.blobs.length > limit) {
      throw new AdminRequestError(502, "Blob list response exceeded its item limit");
    }
    for (const blob of payload.blobs) {
      if (!blob || typeof blob.pathname !== "string" || !blob.pathname.startsWith(prefix)) {
        throw new AdminRequestError(502, "Blob list returned an object outside the requested prefix");
      }
    }
    return Buffer.from(JSON.stringify({
      prefix,
      limit,
      blobs: payload.blobs,
      hasMore: payload.hasMore === true,
      cursor: typeof payload.cursor === "string" ? payload.cursor : null,
      autoPaginated: false,
    }));
  });
}

async function getOneChunk(requestUrl) {
  const url = validateBlobUrl(requestUrl.searchParams.get("url"));
  const expectedSize = boundedInteger(requestUrl.searchParams.get("expectedSize"), "expectedSize", MAX_CHUNK_BYTES);
  const expectedEtag = normalizeEtag(requestUrl.searchParams.get("etag"));
  return withBlobResponse(url, {}, async (blobResponse) => {
    if (blobResponse.status !== 200) {
      await cancelBody(blobResponse);
      throw new AdminRequestError(502, `Blob download returned HTTP ${blobResponse.status}`);
    }
    if (blobResponse.headers.get("content-range") !== null) {
      await cancelBody(blobResponse);
      throw new AdminRequestError(502, "Blob download unexpectedly returned a partial response");
    }
    const encoding = blobResponse.headers.get("content-encoding");
    if (encoding !== null && encoding.trim().toLowerCase() !== "identity") {
      await cancelBody(blobResponse);
      throw new AdminRequestError(502, "Blob download returned transformed bytes");
    }
    const actualEtag = blobResponse.headers.get("etag");
    if (!actualEtag || normalizeEtag(actualEtag) !== expectedEtag) {
      await cancelBody(blobResponse);
      throw new AdminRequestError(409, "Blob ETag no longer matches the selected metadata");
    }
    return {
      body: await readBoundedBody(blobResponse, MAX_CHUNK_BYTES, expectedSize),
      etag: actualEtag,
    };
  });
}

module.exports = async function telemetryAdmin(request, response) {
  if (process.env.VERCEL_ENV !== "production") {
    finish(response, 404, "Not Found");
    return;
  }
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    finish(response, 405, "Method Not Allowed");
    return;
  }
  if (!isAuthorized(request)) {
    response.setHeader("WWW-Authenticate", "Bearer");
    finish(response, 401, "Unauthorized");
    return;
  }

  try {
    const requestUrl = parseRequestUrl(request);
    const action = requestUrl.searchParams.get("action");
    if (action === "list") {
      const body = await listOnePage(requestUrl);
      finish(response, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (action === "get") {
      const result = await getOneChunk(requestUrl);
      response.setHeader("Content-Length", String(result.body.byteLength));
      response.setHeader("ETag", result.etag);
      finish(response, 200, result.body, "application/gzip");
      return;
    }
    throw new AdminRequestError(400, "action must be list or get");
  } catch (error) {
    const status = error instanceof AdminRequestError ? error.status : 500;
    const message = error instanceof AdminRequestError ? error.message : "Telemetry admin request failed";
    finish(response, status, message);
  }
};
