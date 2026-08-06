/**
 * Always-on shell-health beacon: boot milestones and fatals only.
 * Does not carry stick inputs, aircraft state, or multiplayer identifiers.
 */

import { detectEmbeddedBrowser } from "../shell/inapp_browser.js";

export const SHELL_HEALTH_SCHEMA = "guns-only.shell-health.v1";

export const SHELL_HEALTH_MILESTONES = Object.freeze([
  "script_load",
  "bridge_ready",
  "webgl_ok",
  "ready",
  "active",
]);

const FATAL_CLASSES = Object.freeze(["webgl", "bridge", "module", "oom", "unknown"]);

/**
 * Coarse device classification from a user-agent string.
 */
export function classifyShellDevice(userAgent = "", viewport = {}, { maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent || "");
  // One detector, shared with the fallback UI. If telemetry and the on-screen message disagreed
  // about whether a session is inside a webview, the numbers would stop describing the screen.
  const embedded = detectEmbeddedBrowser({ userAgent: ua, maxTouchPoints });
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const narrow = Math.min(width, height);
  const wide = Math.max(width, height);
  const portrait = height >= width;

  let platform = "unknown";
  if (/iPhone|iPad|iPod/i.test(ua)) platform = "ios";
  else if (/Android/i.test(ua)) platform = "android";
  else if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) platform = "desktop";

  let arrival = "other";
  if (embedded.embedded) arrival = embedded.app;
  else if (/CriOS/i.test(ua)) arrival = "chrome-ios";
  else if (/FxiOS/i.test(ua)) arrival = "firefox-ios";
  else if (/Edg\//i.test(ua)) arrival = "edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) arrival = "chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/CriOS/i.test(ua)) arrival = "safari";
  else if (/Firefox\//i.test(ua)) arrival = "firefox";

  let browser = "unknown";
  if (embedded.embedded) browser = "in-app";
  else if (arrival.startsWith("chrome")) browser = "chrome";
  else if (arrival.includes("firefox")) browser = "firefox";
  else if (arrival === "safari") browser = "safari";
  else if (arrival === "edge") browser = "edge";

  let viewportBucket = "desktop";
  if (narrow <= 500) viewportBucket = portrait ? "phone-portrait" : "phone-landscape";
  else if (narrow <= 900) viewportBucket = "tablet";

  // Short family string: enough to spot in-app browsers without dumping the full UA into reports.
  const family = ua
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);

  return Object.freeze({
    platform,
    browser,
    arrival,
    // Separate from `arrival` on purpose: `in_app` answers "was this a webview at all" without
    // needing the report to know every vendor slug, and `in_app_signal` records WHY we said so,
    // so a structural catch of an app we have never named is still attributable.
    in_app: embedded.embedded,
    in_app_signal: embedded.confidence,
    viewport_bucket: viewportBucket,
    viewport_w: width,
    viewport_h: height,
    ua_family: family || "unknown",
  });
}

/**
 * Map an Error / string into a coarse fatal class + truncated message.
 */
export function classifyShellFatal(error) {
  const message = error instanceof Error
    ? String(error.message || error.name || "error")
    : String(error || "error");
  const stack = error instanceof Error ? String(error.stack || "") : "";
  const haystack = `${message}\n${stack}`.toLowerCase();

  let reason = "unknown";
  if (/webgl|getcontext|gpu|swiftshader|angle/i.test(haystack)) reason = "webgl";
  else if (/blazor|dotnet|wasm|bridge|getassemblyexports|flight runtime/i.test(haystack)) {
    reason = "bridge";
  } else if (/failed to fetch|import\(|module|syntaxerror|unexpected token/i.test(haystack)) {
    reason = "module";
  } else if (/out of memory|oom|allocation failed|memory/i.test(haystack)) {
    reason = "oom";
  }

  return Object.freeze({
    reason: FATAL_CLASSES.includes(reason) ? reason : "unknown",
    message: message.replace(/\s+/g, " ").trim().slice(0, 160),
  });
}

function milestoneRank(name) {
  const index = SHELL_HEALTH_MILESTONES.indexOf(name);
  return index >= 0 ? index : -1;
}

/**
 * Create a shell-health recorder. Always enabled; independent of flight-diagnostics opt-in.
 */
export function createShellHealthBeacon({
  build,
  revision = null,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  sendBeacon = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator),
  now = () => performance.now(),
  epochMs = () => Date.now(),
  userAgent = globalThis.navigator?.userAgent ?? "",
  maxTouchPoints = globalThis.navigator?.maxTouchPoints ?? 0,
  viewport = () => ({
    width: globalThis.document?.documentElement?.clientWidth
      || globalThis.innerWidth
      || 0,
    height: globalThis.document?.documentElement?.clientHeight
      || globalThis.innerHeight
      || 0,
  }),
  endpoint = "/telemetry",
  documentRef = globalThis.document,
} = {}) {
  const startedAt = epochMs();
  const session = `shell-${startedAt}-${Math.floor(Math.random() * 1e6)}`;
  const device = classifyShellDevice(userAgent, viewport(), { maxTouchPoints });
  const reached = new Set();
  // Boot-shell events that are neither a milestone nor a fatal: a stall verdict, a fallback screen
  // being shown, a player taking the escape route. Bounded, because a stuck boot must not be able
  // to turn a health beacon into a firehose.
  const notes = [];
  const MAX_NOTES = 12;
  let lastFatal = null;
  let flushChain = Promise.resolve();
  let stopped = false;
  let flushTimer = null;
  const FLUSH_DEBOUNCE_MS = 750;

  function headerRow(batchId) {
    return {
      k: "hdr",
      schema_version: SHELL_HEALTH_SCHEMA,
      channel: "shell-health",
      build: String(build ?? "dev"),
      revision: revision == null ? null : String(revision),
      session,
      batch_id: batchId,
      t0: startedAt,
      ...device,
    };
  }

  function rowsForFlush() {
    const batchId = `shell-batch-${startedAt}-${reached.size}-${notes.length}-${lastFatal ? 1 : 0}-${Math.floor(Math.random() * 1e9)}`
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .slice(0, 128);
    const rows = [headerRow(batchId)];
    for (const name of SHELL_HEALTH_MILESTONES) {
      if (!reached.has(name)) continue;
      rows.push({
        k: "in",
        type: "shell_health",
        code: "milestone",
        milestone: name,
        t: Math.round(now()),
      });
    }
    for (const note of notes) rows.push({ ...note });
    if (lastFatal) {
      rows.push({
        k: "in",
        type: "shell_health",
        code: "fatal",
        reason: lastFatal.reason,
        message: lastFatal.message,
        t: Math.round(now()),
      });
    }
    return { batchId, rows };
  }

  async function postJson(payload, { keepalive = false } = {}) {
    const body = JSON.stringify(payload);
    if (keepalive && typeof sendBeacon === "function") {
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (sendBeacon(endpoint, blob)) return { ok: true, via: "beacon" };
      } catch {
        // Fall through to fetch.
      }
    }
    if (typeof fetchImpl !== "function") return { ok: false, via: "none" };
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: keepalive === true,
      credentials: "same-origin",
    });
    return { ok: response?.ok === true, via: "fetch", status: response?.status };
  }

  function flush({ keepalive = false, force = false } = {}) {
    if (stopped && !force) return flushChain;
    if (reached.size === 0 && notes.length === 0 && !lastFatal) return flushChain;
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const { batchId, rows } = rowsForFlush();
    const payload = { session, batchId, rows };
    flushChain = flushChain
      .catch(() => {})
      .then(() => postJson(payload, { keepalive }))
      .catch(() => ({ ok: false, via: "error" }));
    return flushChain;
  }

  function scheduleFlush() {
    if (flushTimer != null) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  // Hard tab-kills and OOM terminations — the exact population this beacon exists to count —
  // fire neither the debounce timer nor pagehide. A hidden tab is the last observable moment
  // before most of those deaths, so flush immediately (keepalive) instead of waiting 750 ms.
  if (typeof documentRef?.addEventListener === "function") {
    documentRef.addEventListener("visibilitychange", () => {
      if (documentRef.visibilityState === "hidden") void flush({ keepalive: true });
    });
  }

  return {
    schema: SHELL_HEALTH_SCHEMA,
    session,
    device,
    get milestones() {
      return [...SHELL_HEALTH_MILESTONES].filter((name) => reached.has(name));
    },
    get lastFatal() {
      return lastFatal;
    },
    get notes() {
      return notes.map((note) => ({ ...note }));
    },
    /**
     * Record a boot-shell event. `code` is a short slug ("stall", "fallback_shown",
     * "fallback_escape"); `fields` are flat scalars folded into the row.
     */
    note(code, fields = {}, { immediate = false } = {}) {
      if (stopped) return false;
      const slug = String(code || "").replace(/[^a-z0-9_]/gi, "_").slice(0, 32);
      if (!slug) return false;
      if (notes.length >= MAX_NOTES) return false;
      const row = { k: "in", type: "shell_health", code: slug, t: Math.round(now()) };
      for (const [key, value] of Object.entries(fields)) {
        if (value == null) continue;
        if (typeof value === "number" && !Number.isFinite(value)) continue;
        row[key] = typeof value === "string" ? value.slice(0, 160) : value;
      }
      notes.push(row);
      // `immediate` exists for notes recorded as the player leaves — tapping the escape route
      // navigates away, and a 750 ms debounce would lose the one row that says it worked. The
      // keepalive/sendBeacon decision stays inside this module: gameplay telemetry ships gzipped
      // chunks that must never use keepalive, and that distinction should not leak into app.js.
      if (immediate) void flush({ keepalive: true, force: true });
      else scheduleFlush();
      return true;
    },
    mark(milestone) {
      if (stopped) return false;
      if (!SHELL_HEALTH_MILESTONES.includes(milestone)) return false;
      const previous = [...reached].reduce((max, name) => Math.max(max, milestoneRank(name)), -1);
      if (milestoneRank(milestone) < previous) return false;
      const first = !reached.has(milestone);
      reached.add(milestone);
      // Debounce boot-edge POSTs so milestone chatter cannot stall the render loop.
      if (first) scheduleFlush();
      return first;
    },
    fatal(error) {
      lastFatal = classifyShellFatal(error);
      void flush({ keepalive: true, force: true });
      return lastFatal;
    },
    flush,
    stop() {
      stopped = true;
      return flush({ keepalive: true, force: true });
    },
  };
}
