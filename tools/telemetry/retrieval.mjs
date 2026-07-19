import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const LIST_API = "https://blob.vercel-storage.com";
const API_VERSION = "12";
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export const DEFAULT_MAX_BLOB_BYTES = 128 * 1024 * 1024;
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const MAX_LIST_RESPONSE_BYTES = 1024 * 1024;

export class TelemetryRetrievalError extends Error {
  constructor(message) {
    super(message);
    this.name = "TelemetryRetrievalError";
  }
}

class ByteLimitError extends TelemetryRetrievalError {}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TelemetryRetrievalError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TelemetryRetrievalError(`${name} must be a non-negative integer`);
  }
  return value;
}

function normalizeSha256(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new TelemetryRetrievalError("expected SHA-256 must be exactly 64 hexadecimal characters");
  }
  return normalized;
}

function normalizeEtag(value) {
  if (value === undefined || value === null) return undefined;
  let normalized = String(value).trim();
  if (!normalized) throw new TelemetryRetrievalError("expected ETag must not be empty");

  let weak = false;
  if (/^W\//i.test(normalized)) {
    weak = true;
    normalized = normalized.slice(2).trim();
  }
  if (normalized.startsWith('"') && normalized.endsWith('"') && normalized.length >= 2) {
    normalized = normalized.slice(1, -1);
  }
  if (!normalized) throw new TelemetryRetrievalError("expected ETag must not be empty");
  return `${weak ? "W/" : ""}${normalized}`;
}

function validateBlobUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TelemetryRetrievalError("blob URL is invalid");
  }

  const hostname = url.hostname.toLowerCase();
  const isVercelBlobHost = hostname === "blob.vercel-storage.com"
    || hostname.endsWith(".blob.vercel-storage.com");
  if (
    url.protocol !== "https:"
    || !isVercelBlobHost
    || url.port
    || url.username
    || url.password
    || url.hash
  ) {
    throw new TelemetryRetrievalError(
      "blob URL must be an HTTPS vercel-storage.com Blob URL without credentials, port, or fragment",
    );
  }
  return url;
}

function parseContentLength(headers) {
  const value = headers.get("content-length");
  if (value === null) return undefined;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new TelemetryRetrievalError("response Content-Length is invalid");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new TelemetryRetrievalError("response Content-Length is too large to verify safely");
  }
  return length;
}

async function statIfPresent(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function unlinkIfPresent(path) {
  if (!path) return;
  try {
    await unlink(path);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function metadataPathFor(outputPath) {
  return `${resolve(outputPath)}.blob-metadata.json`;
}

async function readCacheMetadata(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (
      !parsed
      || parsed.version !== 1
      || typeof parsed.sourceUrl !== "string"
      || !Number.isSafeInteger(parsed.size)
      || parsed.size < 0
      || typeof parsed.sha256 !== "string"
      || !SHA256_PATTERN.test(parsed.sha256)
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function reuseExistingFile({
  outputPath,
  sourceUrl,
  metadataPath,
  expectedSize,
  expectedSha256,
  expectedEtag,
  skipExisting,
  replace,
}) {
  const fileStat = await statIfPresent(outputPath);
  if (!fileStat) return null;
  if (!fileStat.isFile()) {
    throw new TelemetryRetrievalError("output path exists but is not a regular file");
  }
  if (replace) return null;

  const metadata = await readCacheMetadata(metadataPath);
  if (expectedSize !== undefined && fileStat.size !== expectedSize) {
    throw new TelemetryRetrievalError(
      "existing output does not match the expected size; use --replace to retrieve it again",
    );
  }

  if (expectedEtag !== undefined) {
    if (
      !metadata
      || metadata.sourceUrl !== sourceUrl
      || normalizeEtag(metadata.etag) !== expectedEtag
    ) {
      throw new TelemetryRetrievalError(
        "existing output cannot be proven to match the expected ETag; use --replace to retrieve it again",
      );
    }
  }

  let actualSha256;
  if (expectedSha256 !== undefined) {
    actualSha256 = await sha256File(outputPath);
    if (actualSha256 !== expectedSha256) {
      throw new TelemetryRetrievalError(
        "existing output does not match the expected SHA-256; use --replace to retrieve it again",
      );
    }
  }

  if (skipExisting) {
    return {
      status: "skipped-explicitly",
      outputPath,
      size: fileStat.size,
      sha256: actualSha256 ?? null,
      etag: metadata?.etag ?? null,
    };
  }

  if (expectedSha256 !== undefined) {
    return {
      status: "cached",
      outputPath,
      size: fileStat.size,
      sha256: actualSha256,
      etag: metadata?.etag ?? null,
    };
  }

  if (
    !metadata
    || metadata.sourceUrl !== sourceUrl
    || metadata.size !== fileStat.size
  ) {
    throw new TelemetryRetrievalError(
      "output already exists but has no matching cache metadata; use --skip-existing or --replace explicitly",
    );
  }

  actualSha256 = await sha256File(outputPath);
  if (actualSha256 !== metadata.sha256.toLowerCase()) {
    throw new TelemetryRetrievalError(
      "existing output no longer matches its cache metadata; use --replace to retrieve it again",
    );
  }
  return {
    status: "cached",
    outputPath,
    size: fileStat.size,
    sha256: actualSha256,
    etag: metadata.etag ?? null,
  };
}

async function cancelBody(response) {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The caller is already failing closed; cancellation is best effort.
  }
}

async function checkedContentLength(response) {
  try {
    return parseContentLength(response.headers);
  } catch (error) {
    await cancelBody(response);
    throw error;
  }
}

async function atomicWriteJson(path, value) {
  const temporaryPath = join(dirname(path), `.telemetry-metadata-${randomUUID()}.partial`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await unlinkIfPresent(temporaryPath);
  }
}

/**
 * Retrieve exactly one blob with at most one HTTP GET. This function never sends HEAD or Range,
 * never follows redirects, and never retries. A verified local cache hit sends no request.
 */
export async function downloadBlob({
  url,
  outputPath,
  token,
  maxBytes = DEFAULT_MAX_BLOB_BYTES,
  timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  expectedSize,
  expectedSha256,
  expectedEtag,
  skipExisting = false,
  replace = false,
  fetchImpl = globalThis.fetch,
}) {
  const blobUrl = validateBlobUrl(url);
  if (!outputPath || typeof outputPath !== "string") {
    throw new TelemetryRetrievalError("output path is required");
  }
  const destination = resolve(outputPath);
  const cacheMetadataPath = metadataPathFor(destination);
  const byteLimit = positiveInteger(maxBytes, "maximum bytes");
  const deadline = positiveInteger(timeoutMs, "timeout milliseconds");
  const verifiedSize = expectedSize === undefined
    ? undefined
    : nonNegativeInteger(expectedSize, "expected size");
  const verifiedSha256 = normalizeSha256(expectedSha256);
  const verifiedEtag = normalizeEtag(expectedEtag);

  if (skipExisting && replace) {
    throw new TelemetryRetrievalError("--skip-existing and --replace cannot be used together");
  }
  if (verifiedSize !== undefined && verifiedSize > byteLimit) {
    throw new TelemetryRetrievalError("expected size exceeds the configured maximum bytes");
  }

  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const cached = await reuseExistingFile({
    outputPath: destination,
    sourceUrl: blobUrl.href,
    metadataPath: cacheMetadataPath,
    expectedSize: verifiedSize,
    expectedSha256: verifiedSha256,
    expectedEtag: verifiedEtag,
    skipExisting,
    replace,
  });
  if (cached) return cached;

  if (typeof token !== "string" || !token.trim()) {
    throw new TelemetryRetrievalError(
      "BLOB_READ_WRITE_TOKEN is required for a missing blob (it is read only from the environment)",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new TelemetryRetrievalError("this Node.js runtime does not provide fetch");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadline);
  let temporaryPath;

  try {
    let response;
    try {
      response = await fetchImpl(blobUrl, {
        method: "GET",
        headers: {
          Accept: "application/octet-stream",
          "Accept-Encoding": "identity",
          Authorization: `Bearer ${token}`,
        },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new TelemetryRetrievalError("blob GET timed out; no retry was attempted");
      }
      throw new TelemetryRetrievalError("blob GET failed; no retry was attempted");
    }

    if (response.status !== 200) {
      await cancelBody(response);
      throw new TelemetryRetrievalError(
        `blob GET returned HTTP ${response.status}; response body was not saved and no retry was attempted`,
      );
    }
    if (response.headers.get("content-range") !== null) {
      await cancelBody(response);
      throw new TelemetryRetrievalError("blob GET unexpectedly returned a partial response");
    }
    const contentEncoding = response.headers.get("content-encoding");
    if (contentEncoding !== null && contentEncoding.trim().toLowerCase() !== "identity") {
      await cancelBody(response);
      throw new TelemetryRetrievalError(
        "blob GET returned Content-Encoding despite requesting identity bytes",
      );
    }

    const declaredLength = await checkedContentLength(response);
    if (declaredLength !== undefined && declaredLength > byteLimit) {
      await cancelBody(response);
      throw new ByteLimitError(
        `blob Content-Length ${declaredLength} exceeds the ${byteLimit}-byte maximum`,
      );
    }
    if (verifiedSize !== undefined && declaredLength !== undefined && declaredLength !== verifiedSize) {
      await cancelBody(response);
      throw new TelemetryRetrievalError(
        `blob Content-Length ${declaredLength} does not match expected size ${verifiedSize}`,
      );
    }

    const responseEtag = response.headers.get("etag");
    if (verifiedEtag !== undefined) {
      let actualEtag;
      try {
        actualEtag = normalizeEtag(responseEtag);
      } catch {
        actualEtag = undefined;
      }
      if (actualEtag !== verifiedEtag) {
        await cancelBody(response);
        throw new TelemetryRetrievalError("blob response ETag does not match the expected ETag");
      }
    }

    temporaryPath = join(dirname(destination), `.telemetry-download-${randomUUID()}.partial`);
    const hash = createHash("sha256");
    let receivedBytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        const nextBytes = receivedBytes + chunk.byteLength;
        if (nextBytes > byteLimit) {
          callback(new ByteLimitError(
            `blob stream exceeds the ${byteLimit}-byte maximum`,
          ));
          return;
        }
        receivedBytes = nextBytes;
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      if (response.body === null) {
        await writeFile(temporaryPath, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
      } else {
        await pipeline(
          Readable.fromWeb(response.body),
          meter,
          createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
        );
      }
    } catch (error) {
      const timedOut = controller.signal.aborted;
      controller.abort();
      if (error instanceof ByteLimitError) throw error;
      if (timedOut) {
        throw new TelemetryRetrievalError("blob stream timed out; partial file removed; no retry was attempted");
      }
      throw new TelemetryRetrievalError("blob stream failed; partial file removed; no retry was attempted");
    }

    if (declaredLength !== undefined && receivedBytes !== declaredLength) {
      throw new TelemetryRetrievalError(
        `received ${receivedBytes} bytes but Content-Length declared ${declaredLength}`,
      );
    }
    if (verifiedSize !== undefined && receivedBytes !== verifiedSize) {
      throw new TelemetryRetrievalError(
        `received ${receivedBytes} bytes but expected ${verifiedSize}`,
      );
    }

    const actualSha256 = hash.digest("hex");
    if (verifiedSha256 !== undefined && actualSha256 !== verifiedSha256) {
      throw new TelemetryRetrievalError("downloaded blob does not match the expected SHA-256");
    }

    const destinationAtInstall = await statIfPresent(destination);
    if (destinationAtInstall && !replace) {
      throw new TelemetryRetrievalError(
        "output appeared while the blob was downloading; refusing to overwrite it",
      );
    }
    if (destinationAtInstall && !destinationAtInstall.isFile()) {
      throw new TelemetryRetrievalError("output path is no longer a regular file");
    }

    await rename(temporaryPath, destination);
    temporaryPath = undefined;
    await atomicWriteJson(cacheMetadataPath, {
      version: 1,
      sourceUrl: blobUrl.href,
      size: receivedBytes,
      sha256: actualSha256,
      etag: responseEtag,
      lastModified: response.headers.get("last-modified"),
      downloadedAt: new Date().toISOString(),
    });

    return {
      status: "downloaded",
      outputPath: destination,
      size: receivedBytes,
      sha256: actualSha256,
      etag: responseEtag,
    };
  } finally {
    clearTimeout(timeout);
    await unlinkIfPresent(temporaryPath);
  }
}

async function readBoundedJsonResponse(response, maximumBytes, controller) {
  const declaredLength = await checkedContentLength(response);
  if (declaredLength !== undefined && declaredLength > maximumBytes) {
    await cancelBody(response);
    throw new ByteLimitError(
      `list response Content-Length exceeds the ${maximumBytes}-byte maximum`,
    );
  }

  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        controller.abort();
        throw new ByteLimitError(`list response exceeds the ${maximumBytes}-byte maximum`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream can already be closed or aborted.
    }
    reader.releaseLock();
  }

  if (declaredLength !== undefined && receivedBytes !== declaredLength) {
    throw new TelemetryRetrievalError("list response did not match its Content-Length");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TelemetryRetrievalError("list response was not valid JSON");
  }
}

function normalizeListedBlob(blob, index, prefix) {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) {
    throw new TelemetryRetrievalError(`list response blob ${index} is invalid`);
  }
  if (typeof blob.pathname !== "string" || !blob.pathname.startsWith(prefix)) {
    throw new TelemetryRetrievalError(`list response blob ${index} is outside the requested prefix`);
  }
  if (!Number.isSafeInteger(blob.size) || blob.size < 0) {
    throw new TelemetryRetrievalError(`list response blob ${index} has an invalid size`);
  }

  const url = validateBlobUrl(blob.url).href;
  const downloadUrl = blob.downloadUrl === undefined || blob.downloadUrl === null
    ? null
    : validateBlobUrl(blob.downloadUrl).href;
  return {
    pathname: blob.pathname,
    url,
    downloadUrl,
    size: blob.size,
    uploadedAt: typeof blob.uploadedAt === "string" ? blob.uploadedAt : null,
    etag: typeof blob.etag === "string" ? blob.etag : null,
  };
}

/**
 * Make one explicit, bounded list request. This function does not paginate and does not retrieve
 * any blob body.
 */
export async function listTelemetryBlobs({
  token,
  prefix = "telemetry/",
  limit = DEFAULT_LIST_LIMIT,
  cursor,
  timeoutMs = 30_000,
  maxResponseBytes = MAX_LIST_RESPONSE_BYTES,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof token !== "string" || !token.trim()) {
    throw new TelemetryRetrievalError(
      "BLOB_READ_WRITE_TOKEN is required (it is read only from the environment)",
    );
  }
  if (typeof prefix !== "string" || !prefix.startsWith("telemetry/") || prefix.length > 1024) {
    throw new TelemetryRetrievalError("list prefix must start with telemetry/ and be at most 1024 characters");
  }
  const pageLimit = positiveInteger(limit, "list limit");
  if (pageLimit > MAX_LIST_LIMIT) {
    throw new TelemetryRetrievalError(`list limit cannot exceed ${MAX_LIST_LIMIT}`);
  }
  if (cursor !== undefined && (typeof cursor !== "string" || !cursor || cursor.length > 4096)) {
    throw new TelemetryRetrievalError("cursor must be a non-empty string of at most 4096 characters");
  }
  const deadline = positiveInteger(timeoutMs, "timeout milliseconds");
  const responseLimit = positiveInteger(maxResponseBytes, "maximum list response bytes");
  if (typeof fetchImpl !== "function") {
    throw new TelemetryRetrievalError("this Node.js runtime does not provide fetch");
  }

  const listUrl = new URL(LIST_API);
  listUrl.searchParams.set("prefix", prefix);
  listUrl.searchParams.set("limit", String(pageLimit));
  listUrl.searchParams.set("mode", "expanded");
  if (cursor !== undefined) listUrl.searchParams.set("cursor", cursor);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadline);
  try {
    let response;
    try {
      response = await fetchImpl(listUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          Authorization: `Bearer ${token}`,
          "x-api-version": API_VERSION,
        },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new TelemetryRetrievalError("bounded Blob list GET timed out; no retry was attempted");
      }
      throw new TelemetryRetrievalError("bounded Blob list GET failed; no retry was attempted");
    }

    if (response.status !== 200) {
      await cancelBody(response);
      throw new TelemetryRetrievalError(
        `bounded Blob list GET returned HTTP ${response.status}; no retry was attempted`,
      );
    }

    let payload;
    try {
      payload = await readBoundedJsonResponse(response, responseLimit, controller);
    } catch (error) {
      if (error instanceof TelemetryRetrievalError) throw error;
      if (controller.signal.aborted) {
        throw new TelemetryRetrievalError("bounded Blob list GET timed out; no retry was attempted");
      }
      throw new TelemetryRetrievalError("bounded Blob list response failed; no retry was attempted");
    }

    if (!payload || !Array.isArray(payload.blobs) || payload.blobs.length > pageLimit) {
      throw new TelemetryRetrievalError("list response exceeded the requested item limit or was malformed");
    }
    if (payload.cursor !== undefined && typeof payload.cursor !== "string") {
      throw new TelemetryRetrievalError("list response cursor is invalid");
    }

    return {
      prefix,
      limit: pageLimit,
      blobs: payload.blobs.map((blob, index) => normalizeListedBlob(blob, index, prefix)),
      hasMore: payload.hasMore === true,
      cursor: typeof payload.cursor === "string" ? payload.cursor : null,
      autoPaginated: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
