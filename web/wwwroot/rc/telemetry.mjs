import { buildTelemetryBatch } from "../render/telemetry/telemetry_batch.js";
import {
  createTelemetryOutbox,
  drainTelemetryOutbox,
} from "../render/telemetry/telemetry_outbox.js";

export const RC_TELEMETRY_CONSENT_KEY = "guns-only.telemetry-sharing.v1";
export const RC_TELEMETRY_ENDPOINT = "/telemetry";
export const RC_TELEMETRY_FLUSH_INTERVAL_MS = 15_000;
export const RC_TELEMETRY_BUFFER_LIMIT = 240;

const EVENT_CODES = new Set([
  "session_start", "first_input", "race_start", "race_finish", "race_quit",
  "furball_outcome", "choice", "item_use", "mute", "frame_p95", "session_end",
  "skate_start", "skate_end", "pumpkin", "garage", "playmate",
  "boot", "error", "visit", "activity_start", "activity_end", "map_open", "recover", "heartbeat",
  "form", "flight", "discover",
]);
const ERROR_LIMIT = 8;
const short = (value, n = 40) => String(value ?? "unknown").slice(0, n);
const ITEMS = new Set(["zoom", "balloon", "oil", "bubble", "foxtwo", "pitbull", "foxone", "zuni", "laser"]);

// Anonymous gameplay events are on for every player; only an explicit "disabled" from the
// site's Settings toggle (or ?telemetry=off) stops them.
function readConsent(storage) {
  try { return storage?.getItem?.(RC_TELEMETRY_CONSENT_KEY) !== "disabled"; } catch { return true; }
}

function canonicalHost(locationObject) {
  const hostname = String(locationObject?.hostname ?? globalThis.location?.hostname ?? "").toLowerCase();
  return hostname === "guns-only.com" || hostname === "www.guns-only.com";
}

function sessionId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  try {
    const id = typeof randomUUID === "function" ? randomUUID() : Math.random().toString(36).slice(2);
    return `rc-${String(id).replace(/[^a-z0-9-]/gi, "").slice(0, 48)}`;
  } catch { return `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

function deviceClass(navigatorObject = globalThis.navigator) {
  return Number(navigatorObject?.maxTouchPoints) > 0 ? "touch" : "desktop";
}

function finite(value, fallback = null) {
  return value === null || value === undefined || value === ""
    ? fallback : (Number.isFinite(Number(value)) ? Number(value) : fallback);
}

/**
 * Small, default-on RC event recorder. It intentionally has no user agent, IP, URL, account,
 * fingerprint, or raw simulation state. The shared batch builder and IndexedDB outbox provide
 * bounded immutable requests and retry; this module owns only the RC event vocabulary.
 */
export function createRCTelemetry({
  storage,
  indexedDB,
  locationObject = globalThis.location,
  navigatorObject = globalThis.navigator,
  endpoint = RC_TELEMETRY_ENDPOINT,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  now = () => performance.now(),
  randomUUID,
  session = sessionId(randomUUID),
  track, mode,
  outbox,
  bufferLimit = RC_TELEMETRY_BUFFER_LIMIT,
} = {}) {
  let safeStorage = storage;
  if (safeStorage === undefined) { try { safeStorage = globalThis.localStorage; } catch { safeStorage = undefined; } }
  const query = new URLSearchParams(locationObject?.search ?? "");
  const consent = () => readConsent(safeStorage) && query.get("telemetry") !== "off";
  const injectedTransport = arguments[0]?.fetchImpl !== undefined || arguments[0]?.outbox !== undefined;
  const uploadAllowed = consent() && query.get("telemetry") !== "off" && (injectedTransport || canonicalHost(locationObject))
    && typeof fetchImpl === "function";
  if (indexedDB === undefined) { try { indexedDB = globalThis.indexedDB ?? null; } catch { indexedDB = null; } }
  const durableOutbox = outbox ?? ((injectedTransport || canonicalHost(locationObject)) && typeof fetchImpl === "function"
    ? createTelemetryOutbox({ indexedDB, dbName: "guns-rc-telemetry-outbox" }) : null);
  const startedAt = now();
  let rows = [];
  let sequence = 0;
  let active = null;
  let firstInputRecorded = false;
  let lastFlush = startedAt;
  let frames = [];
  let previousActiveFrame = false;
  let lastResult = null;
  let pending = null;
  let batchSequence = 0;
  let sending = null;
  let sessionEnded = false;
  const eventSession = String(session);
  let raceSequence = 0;

  function record(code, data = {}) {
    if (!uploadAllowed || !consent() || !EVENT_CODES.has(code)) return false;
    const row = { k: "in", type: "rc", code, session: eventSession, event: ++sequence, t: Math.max(0, Math.round(now() - startedAt)), ...data };
    if (active) row.race_id = active.id;
    rows.push(row);
    if (rows.length > bufferLimit) rows = rows.slice(-bufferLimit);
    return true;
  }

  function firstInput(source = "unknown") {
    if (firstInputRecorded) return;
    firstInputRecorded = true;
    record("first_input", { source: ["keyboard", "pointer", "button", "touch"].includes(source) ? source : "unknown" });
  }
  function raceStart({ kind = "race", track, mode } = {}) {
    if (active) raceQuit("replaced");
    active = { id: `${eventSession}-r${++raceSequence}`, kind, startedAt: now(), track: String(track ?? "unknown").slice(0, 40), mode: mode === "bigKid" ? "bigKid" : "kid" };
    record("race_start", { race_id: active.id, kind: kind === "furball" ? "furball" : "race", track: active.track, mode: active.mode });
  }
  function raceFinish({ place, time, gap, recoveries, altTaken, turbos } = {}) {
    if (!active) return;
    record(active.kind === "furball" ? "furball_outcome" : "race_finish", active.kind === "furball"
      ? {} : { track: active.track, mode: active.mode, place: finite(place), time: finite(time), gap: finite(gap), recoveries: finite(recoveries, 0), turbos: finite(turbos, 0), alt_taken: altTaken === null || altTaken === undefined ? null : Boolean(altTaken) });
    lastResult = { race_id: active.id, track: active.track, mode: active.mode };
    active = null;
  }
  function raceQuit(reason = "quit") {
    if (!active) return;
    record("race_quit", { kind: active.kind, track: active.track, mode: active.mode, reason: String(reason).slice(0, 24) });
    active = null;
  }
  function furballOutcome({ balloonsLeft, pops, kills, duration, winner } = {}) {
    if (!active || active.kind !== "furball") return;
    record("furball_outcome", { track: active.track, mode: active.mode, balloons_left: finite(balloonsLeft), pops: finite(pops, 0), kills: finite(kills, 0), duration: finite(duration), winner: winner === null || winner === undefined ? null : Boolean(winner) });
    lastResult = { race_id: active.id, track: active.track, mode: active.mode };
    active = null;
  }
  function choice(choiceName) {
    if (choiceName === "again" || choiceName === "drive" || choiceName === "skate_again" || choiceName === "skate_free") record("choice", { ...lastResult, choice: choiceName });
  }
  function setMode(value) {
    if (active && value !== active.mode) active.mode = "mixed";
  }
  let skateRun = null;
  function skateStart(park) {
    if (skateRun) skateEnd({ reason: "replaced" });
    skateRun = { park: String(park ?? "unknown").slice(0, 24), startedAt: now() };
    record("skate_start", { park: skateRun.park });
  }
  function skateEnd({ reason = "time", score, bestCombo, gaps, goals, newGoals, letters } = {}) {
    if (!skateRun) return;
    record("skate_end", { park: skateRun.park, reason: String(reason).slice(0, 24), duration: Math.max(0, Math.round(now() - skateRun.startedAt)),
      score: finite(score, 0), best_combo: finite(bestCombo, 0), gaps: finite(gaps, 0), goals: finite(goals, 0), new_goals: finite(newGoals, 0), letters: finite(letters, 0) });
    lastResult = { park: skateRun.park };
    skateRun = null;
  }
  // "Does it work": time to drivable, asset failures, script errors (URLs stripped, capped).
  function boot({ assets, ms } = {}) { record("boot", { assets: short(assets, 16), ms: finite(ms) === null ? null : Math.round(finite(ms)) }); }
  let errors = 0;
  function error(kind, message) {
    if (++errors > ERROR_LIMIT) return;
    record("error", { kind: short(kind, 16), message: String(message ?? "").replace(/\b(?:https?|blob|data):\S*/g, "<url>").slice(0, 200) });
  }
  // "What are they doing": places reached, side games, map use, resets and a once-a-minute status.
  let lastPlace = null;
  function visit(place) { if (!place || place === lastPlace) return; lastPlace = place; record("visit", { place: short(place) }); }
  function activityStart(game) { record("activity_start", { game: short(game, 16) }); }
  function activityEnd({ game, score, total } = {}) { record("activity_end", { game: short(game, 16), score: finite(score), total: finite(total) }); }
  // Where, coarsely: the car's world x and z rounded to 10 m (anonymous; enough to find the spot a
  // player got stuck or lost, nothing finer). Optional on map_open, recover and heartbeat.
  const where = at => Array.isArray(at) && Number.isFinite(at[0]) && Number.isFinite(at[2]) ? { x: Math.round(at[0] / 10) * 10, z: Math.round(at[2] / 10) * 10 } : {};
  function mapOpen(at) { record("map_open", { ...where(at) }); }
  function recover(how, at) { record("recover", { how: ["key", "button", "auto"].includes(how) ? how : "unknown", ...where(at) }); }
  function heartbeat({ doing, place, metres, recoveries, at } = {}) { record("heartbeat", { doing: short(doing, 16), place: place ? short(place) : null, metres: Math.round(finite(metres, 0)), recoveries: finite(recoveries, 0), ...where(at) }); }
  function itemUse(item) { if (ITEMS.has(item)) record("item_use", { item }); }
  // Halloween pumpkins: every smash up to 30, then every tenth, so a smashing spree stays small.
  // The moment something is found for the first time (a place, a desert find, an adventure item),
  // so places-per-session and time-between-discoveries are exact (tools/rc/analytics-report.mjs).
  function discover(id, kind) { if (id) record("discover", { id: short(String(id)), kind: short(String(kind ?? 'place'), 12) }); }
  function pumpkin(total) { const n = Math.round(finite(total, 0)); if (n > 0 && (n <= 30 || n % 10 === 0)) record("pumpkin", { total: n }); }
  function garage({ body, shell, paint, pattern } = {}) { record("garage", { body: short(body, 16), shell: short(shell, 16), paint: short(paint, 24), pattern: short(pattern, 16) }); }
  // The toy's form (car / robot / board) and free-drive flight: fly, chute, land (from = previous mode).
  function form(name) { record("form", { form: short(name, 12) }); }
  function flight({ mode, from, assist, at } = {}) { record("flight", { mode: short(mode, 8), from: short(from, 8), assist: !!assist, ...where(at) }); }
  function playmate({ dest, result, closed } = {}) { record("playmate", { dest: short(dest, 24), result: short(result, 12), ...(Number.isFinite(closed) ? { closed: Math.round(closed) } : {}) }); }
  function mute(value) { record("mute", { muted: Boolean(value) }); }
  function observeFrame(deltaMs, activeFrame = true) {
    const eligible = activeFrame && previousActiveFrame;
    previousActiveFrame = activeFrame;
    if (!eligible) return;
    const delta = finite(deltaMs);
    if (delta === null || delta < 0 || delta > 10_000) return;
    frames.push(delta);
    if (frames.length > 600) frames.shift();
  }
  function p95() {
    if (!frames.length) return null;
    const sorted = [...frames].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))];
  }
  const allowed = () => uploadAllowed && consent();
  async function discard() { rows = []; pending = null; frames = []; await durableOutbox?.clear?.(); }
  async function send(payload) {
    if (!allowed()) return 0;
    const response = await fetchImpl(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true });
    return response?.status ?? (response?.ok ? 200 : 500);
  }
  function flush({ force = false } = {}) {
    if (sending) return sending;
    sending = flushOnce({ force }).catch(() => 0).finally(() => { sending = null; });
    return sending;
  }
  async function flushOnce({ force = false } = {}) {
    if (!allowed() || !durableOutbox) { await discard(); return 0; }
    const timestamp = now();
    if (!force && timestamp - lastFlush < RC_TELEMETRY_FLUSH_INTERVAL_MS) return 0;
    lastFlush = timestamp;
    if (p95() !== null) { record("frame_p95", { p95_ms: Math.round(p95() * 100) / 100, samples: frames.length }); frames = []; }
    // Keep an immutable in-memory batch until either durable storage or transport acknowledges it.
    if (!pending && rows.length) {
      const batchId = `${session}-batch-${String(++batchSequence).padStart(6, "0")}`;
      const built = buildTelemetryBatch({ session, batchId, rows, maximumRequestBytes: 60_000 });
      rows = built.remainingRows;
      if (built.payload) pending = { batchId, payload: built.payload };
    }
    if (pending) {
      const batch = pending;
      const saved = await durableOutbox.put(batch.batchId, batch.payload);
      if (!allowed()) { await discard(); return 0; }
      if (saved === true) pending = null;
      else {
        try {
          const status = await send(batch.payload);
          if ((status >= 200 && status < 300) || [400, 413, 422].includes(status)) pending = null;
        } catch { /* Retry the exact body next flush. */ }
      }
    }
    if (!allowed()) { await discard(); return 0; }
    const sent = await drainTelemetryOutbox(durableOutbox, send);
    if (!allowed()) await discard();
    return sent;
  }

  const initialTrack = String(track ?? query.get("track") ?? "housing").slice(0, 40);
  const initialMode = mode === "bigKid" ? "bigKid" : "kid";
  record("session_start", { track: initialTrack, mode: initialMode, device: deviceClass(navigatorObject), day: new Date().toISOString().slice(0, 10) });
  function endSession() { if (sessionEnded) return; sessionEnded = true; skateEnd({ reason: "pagehide" }); record("session_end", { duration: Math.max(0, Math.round(now() - startedAt)) }); }
  return Object.freeze({ session, enabled: uploadAllowed, firstInput, raceStart, raceFinish, raceQuit, furballOutcome, skateStart, skateEnd, boot, error, visit, discover, activityStart, activityEnd, mapOpen, recover, heartbeat, choice, setMode, itemUse, pumpkin, garage, playmate, form, flight, mute, observeFrame, flush, endSession, diagnostics: () => ({ bufferedRows: rows.length, active: Boolean(active), frameSamples: frames.length, p95: p95() }) });
}
