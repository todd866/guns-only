// Vercel Function for the browser recorder in ../app.js.
//
// This intentionally talks to Vercel Blob over HTTP instead of importing
// @vercel/blob: wwwroot is deployed as-is and has no npm build step.

const BLOB_API = "https://blob.vercel-storage.com";
const BLOB_API_VERSION = "12";
const STORAGE_DEADLINE_MS = 8_000;
const MAX_APPEND_ATTEMPTS = 4;

class BlobHttpError extends Error {
  constructor(status, detail) {
    super(`Vercel Blob returned ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
    this.detail = detail;
  }
}

function setResponseHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
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
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

function blobHeaders(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-api-version": BLOB_API_VERSION,
  };

  // Recent Blob API versions accept the store id explicitly. Read-write
  // tokens have the form vercel_blob_rw_<store-id>_<secret>.
  const storeId = token.split("_")[3];
  if (storeId) headers["x-vercel-blob-store-id"] = storeId;
  return headers;
}

async function blobMetadata(pathname, token, signal) {
  const url = `${BLOB_API}?url=${encodeURIComponent(pathname)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: blobHeaders(token),
    cache: "no-store",
    signal,
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new BlobHttpError(response.status, (await response.text()).slice(0, 300));
  }

  const metadata = await response.json();
  if (!metadata || typeof metadata.url !== "string") {
    throw new Error("Vercel Blob metadata response did not include a URL");
  }
  return metadata;
}

async function readCurrentBlob(pathname, token, signal) {
  const metadata = await blobMetadata(pathname, token, signal);
  if (!metadata) return null;

  const url = new URL(metadata.url);
  // Private Blob reads can bypass the CDN after an overwrite. This matters
  // here because a stale read followed by another overwrite could lose rows.
  url.searchParams.set("cache", "0");

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  if (response.status === 404) {
    throw new BlobHttpError(409, "blob changed while it was being read");
  }
  if (!response.ok) {
    throw new BlobHttpError(response.status, (await response.text()).slice(0, 300));
  }

  return {
    text: await response.text(),
    etag: metadata.etag || response.headers.get("etag"),
  };
}

function uploadUrl(pathname) {
  const encodedPath = pathname.split("/").map(encodeURIComponent).join("/");
  return `${BLOB_API}/${encodedPath}`;
}

async function overwriteBlob(pathname, contents, current, token, signal) {
  // The write PUT must send ONLY these headers. Adding x-api-version or
  // x-vercel-blob-store-id (which blobHeaders injects for the read/list paths)
  // makes the versioned upload API reject a path-in-URL PUT with 400
  // "Invalid pathname" — verified against the live private store. Likewise a
  // bare `access` header (vs x-vercel-blob-access) is rejected. So the write
  // uses the legacy, path-in-URL upload with only the private-access header;
  // reads and list keep the versioned headers via blobHeaders.
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "x-content-type": "application/x-ndjson; charset=utf-8",
    "x-content-length": String(Buffer.byteLength(contents)),
    "x-add-random-suffix": "0",
    "x-allow-overwrite": current ? "1" : "0",
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
  // A simultaneous first write is sometimes reported as 400 rather than
  // 409. Treat both that and an ETag precondition failure as retryable.
  if (
    response.status === 409 ||
    response.status === 412 ||
    (response.status === 400 && /already exists|precondition/i.test(detail))
  ) {
    throw new BlobHttpError(409, detail);
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

async function appendRows(session, rows, token) {
  const pathname = `telemetry/${session}.jsonl`;
  const added = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), STORAGE_DEADLINE_MS);
  let lastError;

  try {
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        const current = await readCurrentBlob(pathname, token, controller.signal);
        let contents = current ? current.text : "";
        if (contents && !contents.endsWith("\n")) contents += "\n";
        contents += added;
        await overwriteBlob(pathname, contents, current, token, controller.signal);
        return;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_APPEND_ATTEMPTS - 1) throw error;
        await delay(40 * 2 ** attempt, controller.signal);
      }
    }
    throw lastError || new Error("Vercel Blob append failed");
  } finally {
    clearTimeout(deadline);
  }
}

module.exports = async function telemetry(request, response) {
  setResponseHeaders(response);

  if (request.method === "OPTIONS") {
    finish(response, 204);
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    finish(response, 405, "Method Not Allowed");
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const session = safeSessionName(payload && payload.session);
    const rows = payload && payload.rows;
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!session || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("telemetry payload must contain a session and non-empty rows array");
    }
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

    await appendRows(session, rows, token);
  } catch (error) {
    // Recorder POSTs are deliberately fire-and-forget. Keep gameplay isolated
    // from malformed data, missing configuration, and storage outages.
    console.error("telemetry persistence failed:", error instanceof Error ? error.message : String(error));
  }

  finish(response, 204);
};
