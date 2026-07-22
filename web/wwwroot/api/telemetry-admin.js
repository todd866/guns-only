// Production-only, operator-authenticated access to deliberately selected telemetry chunks.
//
// The browser recorder writes to a private Vercel Blob store. This function keeps the store's
// master token inside Vercel while giving the local analysis tools two deliberately narrow
// operations: one bounded list page, one bounded immutable chunk download, or one bounded
// non-identifying aggregate summary page under a separate report credential. It intentionally has
// no CORS, automatic pagination, retry, range, redirect, delete, or write capability.

const { timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { gunzip } = require("node:zlib");

const BLOB_API = "https://blob.vercel-storage.com";
const BLOB_API_VERSION = "12";
const MAX_LIST_ITEMS = 100;
const MAX_LIST_RESPONSE_BYTES = 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_SUMMARY_CHUNKS = 20;
const MAX_SUMMARY_COMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_SUMMARY_CHUNK_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_SUMMARY_TOTAL_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_ROWS_PER_CHUNK = 1_500;
const STORAGE_DEADLINE_MS = 15_000;
const SUMMARY_DEADLINE_MS = 25_000;
const gunzipAsync = promisify(gunzip);

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

function isAuthorized(request, environmentName = "TELEMETRY_ADMIN_TOKEN") {
  const expected = process.env[environmentName];
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

async function withBlobResponse(url, { list = false, deadlineMs = STORAGE_DEADLINE_MS } = {}, consume) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (typeof token !== "string" || !token) throw new AdminRequestError(503, "Telemetry storage is unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadlineMs);
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

async function readOneListPage(requestUrl, {
  defaultLimit = 50,
  maximumItems = MAX_LIST_ITEMS,
} = {}) {
  const prefix = requestUrl.searchParams.get("prefix") || "telemetry/";
  if (!prefix.startsWith("telemetry/") || prefix.length > 1024) {
    throw new AdminRequestError(400, "prefix must start with telemetry/");
  }
  const limit = boundedInteger(
    requestUrl.searchParams.get("limit") || String(defaultLimit),
    "limit",
    maximumItems,
  );
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
    return {
      prefix,
      limit,
      blobs: payload.blobs,
      hasMore: payload.hasMore === true,
      cursor: typeof payload.cursor === "string" ? payload.cursor : null,
      autoPaginated: false,
    };
  });
}

async function listOnePage(requestUrl) {
  return Buffer.from(JSON.stringify(await readOneListPage(requestUrl)));
}

async function downloadOneChunk(url, expectedSize, expectedEtag, deadlineMs = STORAGE_DEADLINE_MS) {
  return withBlobResponse(url, { deadlineMs }, async (blobResponse) => {
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

async function getOneChunk(requestUrl) {
  const url = validateBlobUrl(requestUrl.searchParams.get("url"));
  const expectedSize = boundedInteger(
    requestUrl.searchParams.get("expectedSize"),
    "expectedSize",
    MAX_CHUNK_BYTES,
  );
  const expectedEtag = normalizeEtag(requestUrl.searchParams.get("etag"));
  return downloadOneChunk(url, expectedSize, expectedEtag);
}

function positiveBlobSize(value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > MAX_CHUNK_BYTES) {
    throw new AdminRequestError(502, "Blob list returned an invalid telemetry object size");
  }
  return numeric;
}

function sessionFromPathname(pathname) {
  if (typeof pathname !== "string") return null;
  const match = /^telemetry\/([^/]+)\/[^/]+\.jsonl\.gz$/.exec(pathname);
  return match ? match[1] : null;
}

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function increment(object, key) {
  const candidate = String(key || "UNKNOWN").slice(0, 80);
  const safeKey = /^[A-Za-z0-9_.:+-]+$/.test(candidate) ? candidate : "OTHER";
  const previous = Object.prototype.hasOwnProperty.call(object, safeKey) ? object[safeKey] : 0;
  object[safeKey] = previous + 1;
}

function applyStateRow(row, previousState) {
  if (row && row.s && typeof row.s === "object" && !Array.isArray(row.s)) {
    return { ...row.s };
  }
  if (!previousState || !row || !row.d || typeof row.d !== "object" || Array.isArray(row.d)) {
    return null;
  }
  const next = { ...previousState, ...row.d };
  if (Array.isArray(row.x)) {
    for (const key of row.x) delete next[key];
  }
  return next;
}

function summarySortie(sorties, session, sortieId) {
  if (typeof sortieId !== "string" || !sortieId || !session) return null;
  const key = `${session}\u0000${sortieId}`;
  let sortie = sorties.get(key);
  if (!sortie) {
    sortie = {
      started: false,
      finished: false,
      ended: false,
      outcome: "NONE",
      endReason: null,
      playerDead: false,
      opponentDead: false,
      roundsFired: 0,
      hits: 0,
      kills: 0,
      shotsTotal: 0,
      shotsInWindow: 0,
      timingEligible: false,
      firstStateTime: null,
      firstShotTime: null,
      lastStateTime: null,
    };
    sorties.set(key, sortie);
  }
  return sortie;
}

function updateMax(sortie, property, value) {
  const numeric = nonNegativeNumber(value);
  if (numeric !== null) sortie[property] = Math.max(sortie[property], numeric);
}

function applyLifecycleRow(row, session, sorties) {
  if (row?.k !== "in" || row.type !== "lifecycle") return;
  const sortie = summarySortie(sorties, session, row.sortie);
  if (!sortie) return;
  if (row.code === "sortie_started") sortie.started = true;
  if (row.code === "sortie_finished") sortie.finished = true;
  if (row.code === "sortie_ended") {
    sortie.ended = true;
    if (typeof row.reason === "string") sortie.endReason = row.reason;
  }
  const outcome = String(row.sortie_outcome || "NONE").toUpperCase();
  if (outcome !== "NONE" && outcome !== "UNKNOWN") sortie.outcome = outcome.slice(0, 80);
}

function applyStateToSortie(state, row, session, sorties) {
  const sortie = summarySortie(sorties, session, state?.telemetry_sortie_id);
  if (!sortie) return;
  const stateTime = nonNegativeNumber(state.t) ?? nonNegativeNumber(row.t);
  if (stateTime !== null) {
    if (sortie.firstStateTime === null) {
      sortie.firstStateTime = stateTime;
      sortie.timingEligible = sortie.started && (nonNegativeNumber(state.rounds_fired) ?? 0) === 0;
    }
    sortie.lastStateTime = Math.max(sortie.lastStateTime ?? stateTime, stateTime);
  }
  const roundsBefore = sortie.roundsFired;
  updateMax(sortie, "roundsFired", state.rounds_fired);
  updateMax(sortie, "hits", state.hits);
  updateMax(sortie, "kills", state.kill_count);
  updateMax(sortie, "shotsTotal", state.shots_total);
  updateMax(sortie, "shotsInWindow", state.shots_in_window);
  if (sortie.timingEligible && sortie.firstShotTime === null
    && sortie.roundsFired > roundsBefore && stateTime !== null) {
    sortie.firstShotTime = stateTime;
  }
  if (state.finished === true) sortie.finished = true;
  if (state.player_alive === false) sortie.playerDead = true;
  if (state.opponent_alive === false || state.bandit_alive === false) sortie.opponentDead = true;
  const outcome = String(state.sortie_outcome || "NONE").toUpperCase();
  if (outcome !== "NONE" && outcome !== "UNKNOWN") sortie.outcome = outcome.slice(0, 80);
}

function parseTelemetryRows(uncompressed) {
  const text = uncompressed.toString("utf8");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (lines.length > MAX_ROWS_PER_CHUNK) {
    throw new AdminRequestError(502, "Telemetry chunk exceeded its row limit");
  }
  return lines.filter(Boolean).map((line) => {
    let row;
    try { row = JSON.parse(line); } catch { throw new AdminRequestError(502, "Telemetry chunk contained invalid JSONL"); }
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new AdminRequestError(502, "Telemetry chunk contained a non-object row");
    }
    return row;
  });
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function finishSummary({ page, chunksRead, compressedBytes, uncompressedBytes, rowCount,
  failedChunks, skippedChunks, unsupportedChunks, sessions, sessionBuilds, sorties, uploadedAt }) {
  const outcomeCounts = Object.create(null);
  const endReasonCounts = Object.create(null);
  let started = 0;
  let finished = 0;
  let finishedWithObservedStart = 0;
  let ended = 0;
  let playerDeaths = 0;
  let opponentDeaths = 0;
  let roundsFired = 0;
  let hits = 0;
  let kills = 0;
  let shotsTotal = 0;
  let shotsInWindow = 0;
  const firstShotSeconds = [];
  for (const sortie of sorties.values()) {
    if (sortie.started) started += 1;
    if (sortie.finished) finished += 1;
    if (sortie.started && sortie.finished) finishedWithObservedStart += 1;
    if (sortie.ended) ended += 1;
    if (sortie.playerDead) playerDeaths += 1;
    if (sortie.opponentDead) opponentDeaths += 1;
    roundsFired += sortie.roundsFired;
    hits += sortie.hits;
    kills += sortie.kills;
    shotsTotal += sortie.shotsTotal;
    shotsInWindow += sortie.shotsInWindow;
    increment(outcomeCounts, sortie.outcome);
    if (sortie.endReason) increment(endReasonCounts, sortie.endReason);
    if (sortie.firstShotTime !== null && sortie.firstStateTime !== null
      && sortie.firstShotTime >= sortie.firstStateTime) {
      firstShotSeconds.push(sortie.firstShotTime - sortie.firstStateTime);
    }
  }
  firstShotSeconds.sort((a, b) => a - b);
  const medianIndex = Math.floor(firstShotSeconds.length / 2);
  const medianFirstShot = !firstShotSeconds.length ? null
    : firstShotSeconds.length % 2 === 1 ? firstShotSeconds[medianIndex]
      : Number(((firstShotSeconds[medianIndex - 1] + firstShotSeconds[medianIndex]) / 2).toFixed(3));
  const buildCounts = Object.create(null);
  for (const build of sessionBuilds.values()) increment(buildCounts, build || "UNKNOWN");
  const validUploadedTimes = uploadedAt.filter(Number.isFinite).sort((a, b) => a - b);
  return Buffer.from(JSON.stringify({
    version: 1,
    generated_at: new Date().toISOString(),
    scope: {
      requested_chunk_limit: page.limit,
      auto_paginated: false,
      has_more: page.hasMore,
      next_cursor: page.cursor,
      partial: page.hasMore || failedChunks > 0 || skippedChunks > 0 || unsupportedChunks > 0,
    },
    coverage: {
      chunks_listed: page.blobs.length,
      chunks_read: chunksRead,
      chunks_failed: failedChunks,
      chunks_skipped_by_budget: skippedChunks,
      chunks_unsupported_format: unsupportedChunks,
      compressed_bytes_read: compressedBytes,
      uncompressed_bytes_read: uncompressedBytes,
      rows_read: rowCount,
      first_upload_at: validUploadedTimes.length ? new Date(validUploadedTimes[0]).toISOString() : null,
      last_upload_at: validUploadedTimes.length
        ? new Date(validUploadedTimes[validUploadedTimes.length - 1]).toISOString()
        : null,
    },
    sessions: {
      observed: sessions.size,
      builds: buildCounts,
    },
    sorties: {
      observed: sorties.size,
      started_events: started,
      finished: finished,
      ended_events: ended,
      completion_rate: ratio(finishedWithObservedStart, started),
      completion_denominator: started,
      outcomes: outcomeCounts,
      end_reasons: endReasonCounts,
    },
    combat: {
      rounds_fired: roundsFired,
      hits,
      hit_rate: ratio(hits, roundsFired),
      kills,
      player_deaths: playerDeaths,
      opponent_deaths: opponentDeaths,
      shots_total: shotsTotal,
      shots_in_window: shotsInWindow,
      gun_window_share: ratio(shotsInWindow, shotsTotal),
      median_time_to_first_shot_seconds: medianFirstShot,
      sorties_with_first_shot_timing: firstShotSeconds.length,
    },
    privacy: {
      raw_rows_returned: false,
      identifiers_returned: false,
      user_agents_returned: false,
    },
  }));
}

async function summarizeOnePage(requestUrl) {
  const startedAt = Date.now();
  const page = await readOneListPage(requestUrl, {
    defaultLimit: 20,
    maximumItems: MAX_SUMMARY_CHUNKS,
  });
  const blobs = [...page.blobs].sort((left, right) => {
    const leftTime = Date.parse(left?.uploadedAt || "");
    const rightTime = Date.parse(right?.uploadedAt || "");
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
      || String(left?.pathname || "").localeCompare(String(right?.pathname || ""));
  });
  const sessions = new Set();
  const sessionBuilds = new Map();
  const sorties = new Map();
  const uploadedAt = [];
  let chunksRead = 0;
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let rowCount = 0;
  let failedChunks = 0;
  let skippedChunks = 0;
  let unsupportedChunks = 0;

  for (let index = 0; index < blobs.length; index += 1) {
    const blob = blobs[index];
    const sessionFromPath = sessionFromPathname(blob?.pathname);
    if (!sessionFromPath) {
      unsupportedChunks += 1;
      continue;
    }
    const size = positiveBlobSize(blob?.size);
    const remainingMs = SUMMARY_DEADLINE_MS - (Date.now() - startedAt);
    if (compressedBytes + size > MAX_SUMMARY_COMPRESSED_BYTES || remainingMs < 250) {
      skippedChunks += blobs.length - index;
      break;
    }
    try {
      const blobUrl = validateBlobUrl(blob.url);
      if (blobUrl.pathname !== `/${blob.pathname}`) {
        throw new AdminRequestError(502, "Blob URL did not match listed telemetry pathname");
      }
      const result = await downloadOneChunk(
        blobUrl,
        size,
        normalizeEtag(blob.etag),
        Math.min(STORAGE_DEADLINE_MS, remainingMs),
      );
      const uncompressed = await gunzipAsync(result.body, {
        maxOutputLength: MAX_SUMMARY_CHUNK_OUTPUT_BYTES,
      });
      if (uncompressedBytes + uncompressed.byteLength > MAX_SUMMARY_TOTAL_OUTPUT_BYTES) {
        skippedChunks += blobs.length - index;
        break;
      }
      const rows = parseTelemetryRows(uncompressed);
      const header = rows.find((row) => row.k === "hdr");
      if (typeof header?.session !== "string" || header.session !== sessionFromPath) {
        throw new AdminRequestError(502, "Telemetry chunk header did not match its object path");
      }
      const session = header.session;
      sessions.add(session);
      if (!sessionBuilds.has(session)) sessionBuilds.set(session, String(header?.build || "UNKNOWN"));
      const uploadedTime = Date.parse(blob.uploadedAt || "");
      if (Number.isFinite(uploadedTime)) uploadedAt.push(uploadedTime);
      let state = null;
      for (const row of rows) {
        applyLifecycleRow(row, session, sorties);
        if (row.k !== "st") continue;
        state = applyStateRow(row, state);
        if (state) applyStateToSortie(state, row, session, sorties);
      }
      chunksRead += 1;
      compressedBytes += size;
      uncompressedBytes += uncompressed.byteLength;
      rowCount += rows.length;
    } catch {
      failedChunks += 1;
    }
  }

  return finishSummary({
    page,
    chunksRead,
    compressedBytes,
    uncompressedBytes,
    rowCount,
    failedChunks,
    skippedChunks,
    unsupportedChunks,
    sessions,
    sessionBuilds,
    sorties,
    uploadedAt,
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
  let requestUrl;
  try {
    requestUrl = parseRequestUrl(request);
  } catch (error) {
    finish(response, error instanceof AdminRequestError ? error.status : 400, "Request URL is invalid");
    return;
  }
  const action = requestUrl.searchParams.get("action");
  const credential = action === "summary" ? "TELEMETRY_REPORT_TOKEN" : "TELEMETRY_ADMIN_TOKEN";
  if (!isAuthorized(request, credential)) {
    response.setHeader("WWW-Authenticate", "Bearer");
    finish(response, 401, "Unauthorized");
    return;
  }

  try {
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
    if (action === "summary") {
      const body = await summarizeOnePage(requestUrl);
      finish(response, 200, body, "application/json; charset=utf-8");
      return;
    }
    throw new AdminRequestError(400, "action must be list, get, or summary");
  } catch (error) {
    const status = error instanceof AdminRequestError ? error.status : 500;
    const message = error instanceof AdminRequestError ? error.message : "Telemetry admin request failed";
    finish(response, status, message);
  }
};
