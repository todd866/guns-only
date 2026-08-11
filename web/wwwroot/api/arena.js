// Vercel Function: rated arena matchmaker. Same-origin only; persists the ladder in private
// Vercel Blob (BLOB_READ_WRITE_TOKEN). No npm build — mirrors api/telemetry.js.

"use strict";

const {
  ARENA_PROTOCOL,
  ArenaStore,
} = require("./arena-logic.js");

const BLOB_API = "https://blob.vercel-storage.com";
const LADDER_PATHNAME = "arena/ladder-v1.json";
const STORAGE_DEADLINE_MS = 8_000;
const MAX_WRITE_ATTEMPTS = 6;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_LADDER_BYTES = 2 * 1024 * 1024;

class BlobHttpError extends Error {
  constructor(status, detail) {
    super(`Vercel Blob returned ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
    this.detail = detail;
  }
}

function setResponseHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
}

function finish(response, status, body) {
  response.statusCode = status;
  if (body === undefined) response.end();
  else response.end(typeof body === "string" ? body : JSON.stringify(body));
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

async function readJsonBody(request) {
  const body = request.body;
  if (body !== undefined && body !== null) {
    if (Buffer.isBuffer(body)) {
      if (body.byteLength > MAX_REQUEST_BYTES) throw new Error("request too large");
      return JSON.parse(body.toString("utf8"));
    }
    if (typeof body === "string") {
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) throw new Error("request too large");
      return JSON.parse(body);
    }
    if (typeof body === "object") return body;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) throw new Error("request too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function uploadUrl(pathname) {
  return `${BLOB_API}/${pathname.split("/").map(encodeURIComponent).join("/")}`;
}

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function storeFromSnapshot(snapshot, deps) {
  const store = new ArenaStore(deps);
  if (!snapshot || typeof snapshot !== "object") return store;
  store.humans = new Map(snapshot.humans || []);
  store.bots = new Map(snapshot.bots || []);
  store.matches = new Map(snapshot.matches || []);
  store._seq = Number(snapshot.seq) || 0;
  // Re-seed any stock bots missing after schema bumps.
  for (const [botId, bot] of new ArenaStore({ now: () => 0 }).bots) {
    if (!store.bots.has(botId)) store.bots.set(botId, bot);
  }
  return store;
}

function snapshotFromStore(store) {
  return {
    protocol: ARENA_PROTOCOL,
    version: (Number(store._persistVersion) || 0) + 1,
    seq: store._seq,
    humans: [...store.humans.entries()],
    bots: [...store.bots.entries()],
    matches: [...store.matches.entries()],
  };
}

async function readLadder(token, signal) {
  const response = await fetch(uploadUrl(LADDER_PATHNAME), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (response.status === 404) return { snapshot: null, etag: null };
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new BlobHttpError(response.status, detail);
  }
  const etag = response.headers.get("etag");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_LADDER_BYTES) {
    throw new BlobHttpError(502, "ladder exceeds size limit");
  }
  return { snapshot: JSON.parse(text), etag };
}

async function writeLadder(token, snapshot, etag, signal) {
  const body = Buffer.from(JSON.stringify(snapshot), "utf8");
  if (body.byteLength > MAX_LADDER_BYTES) {
    throw new BlobHttpError(413, "ladder exceeds size limit");
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-content-type": "application/json",
    "x-content-length": String(body.byteLength),
    "x-add-random-suffix": "0",
    "x-allow-overwrite": "1",
    "x-cache-control-max-age": "0",
    "x-vercel-blob-access": "private",
  };
  // Soft optimistic concurrency: when Blob returns an etag, ask to replace that generation.
  if (etag) headers["x-vercel-blob-if-match"] = etag;

  const response = await fetch(uploadUrl(LADDER_PATHNAME), {
    method: "PUT",
    headers,
    body,
    signal,
  });
  if (response.ok) return;
  const detail = (await response.text()).slice(0, 300);
  throw new BlobHttpError(response.status, detail);
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error("deadline");
      error.name = "AbortError";
      reject(error);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error("deadline");
      error.name = "AbortError";
      reject(error);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function withPersistentStore(mutate, deps = {}) {
  const token = blobToken();
  // Local / unit tests without Blob: ephemeral in-process store (not shared across instances).
  if (!token) {
    // A hosted rated arena must never pretend an instance-local ladder is durable. Preview stays
    // unavailable until its private Blob binding is present; local development keeps the small
    // in-memory parity store below.
    if (isHostedVercelEnvironment()) {
      throw new BlobHttpError(503, "BLOB_READ_WRITE_TOKEN is not configured");
    }
    if (!globalThis.__gunsArenaMemoryStore) {
      globalThis.__gunsArenaMemoryStore = new ArenaStore(deps);
    }
    const store = globalThis.__gunsArenaMemoryStore;
    return mutate(store);
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), STORAGE_DEADLINE_MS);
  try {
    let lastError;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        const { snapshot, etag } = await readLadder(token, controller.signal);
        const store = storeFromSnapshot(snapshot, deps);
        store._persistVersion = Number(snapshot?.version) || 0;
        const result = await mutate(store);
        const next = snapshotFromStore(store);
        await writeLadder(token, next, etag, controller.signal);
        return result;
      } catch (error) {
        lastError = error;
        const conflict = error instanceof BlobHttpError
          && (error.status === 409 || error.status === 412 || /precondition|conflict/i.test(error.detail || ""));
        if (!conflict || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
        await delay(30 * 2 ** attempt, controller.signal);
      }
    }
    throw lastError;
  } finally {
    clearTimeout(deadline);
  }
}

function requestPath(request) {
  const raw = firstHeader(request, "x-forwarded-uri")
    || firstHeader(request, "x-invoke-path")
    || request.url
    || "";
  try {
    return new URL(raw, "http://local.invalid").pathname;
  } catch {
    return String(raw).split("?")[0] || "";
  }
}

async function handleGet(request, response) {
  const url = new URL(request.url || "/", "http://local.invalid");
  const limit = Number(url.searchParams.get("limit") || 50);
  if (url.searchParams.has("standings") || requestPath(request).endsWith("/standings")) {
    const payload = await withPersistentStore((store) => ({
      protocol: ARENA_PROTOCOL,
      standings: store.standings(limit),
    }));
    finish(response, 200, payload);
    return;
  }
  const health = await withPersistentStore((store) => ({
    ...store.health(),
    service: "guns-only-arena",
    storage: blobToken() ? "blob" : "memory",
  }));
  finish(response, 200, health);
}

async function handlePost(request, response) {
  if (!hasJsonContentType(request)) {
    finish(response, 415, { ok: false, reason: "content-type" });
    return;
  }
  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    finish(response, 400, { ok: false, reason: "invalid-json" });
    return;
  }
  if (!body || typeof body !== "object") {
    finish(response, 400, { ok: false, reason: "invalid-request" });
    return;
  }

  const path = requestPath(request);
  const action = body.action
    || (path.includes("/complete") ? "complete"
      : (path.includes("/match") || path.endsWith("/arena") || path.endsWith("/api/arena")
        ? (body.matchId ? "complete" : "match")
        : null));

  if (action === "match" || action === "create_match") {
    const result = await withPersistentStore((store) => store.createMatch({
      pilotKey: body.pilotKey,
      scaffolded: Boolean(body.scaffolded),
    }));
    finish(response, result.ok ? 200 : (result.reason === "no-eligible-bot" ? 503 : 400), result);
    return;
  }

  if (action === "complete" || action === "complete_match") {
    const result = await withPersistentStore((store) => store.completeMatchRequest({
      matchId: String(body.matchId || ""),
      pilotKey: body.pilotKey,
      outcome: body.outcome,
      completed: body.completed !== false,
      earlyAbandon: Boolean(body.earlyAbandon),
      rematch: Boolean(body.rematch),
      againVote: Number(body.againVote) || 0,
      sanity: body.sanity ?? null,
    }));
    const status = result.ok ? 200
      : result.reason === "unknown-match" ? 404
        : result.reason === "already-completed" ? 409
          : 400;
    finish(response, status, result);
    return;
  }

  finish(response, 400, { ok: false, reason: "unknown-action" });
}

module.exports = async function arena(request, response) {
  setResponseHeaders(response);

  if (request.method === "OPTIONS") {
    finish(response, 403, "Cross-origin arena is not allowed");
    return;
  }
  if (!isSameOriginRequest(request)) {
    finish(response, 403, { ok: false, reason: "cross-origin" });
    return;
  }

  try {
    if (request.method === "GET") {
      await handleGet(request, response);
      return;
    }
    if (request.method === "POST") {
      await handlePost(request, response);
      return;
    }
    response.setHeader("Allow", "GET, POST, OPTIONS");
    finish(response, 405, { ok: false, reason: "method" });
  } catch (error) {
    if (error && error.name === "AbortError") {
      finish(response, 504, { ok: false, reason: "storage-timeout" });
      return;
    }
    if (error instanceof BlobHttpError) {
      finish(response, 503, { ok: false, reason: "storage", detail: error.detail });
      return;
    }
    console.error("arena function error", error);
    finish(response, 500, { ok: false, reason: "internal" });
  }
};

module.exports._test = {
  storeFromSnapshot,
  snapshotFromStore,
  withPersistentStore,
  LADDER_PATHNAME,
};
