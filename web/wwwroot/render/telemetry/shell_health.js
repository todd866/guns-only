/**
 * Always-on shell-health beacon: boot milestones and fatals only.
 * Does not carry stick inputs, aircraft state, or multiplayer identifiers.
 */

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
export function classifyShellDevice(userAgent = "", viewport = {}) {
  const ua = String(userAgent || "");
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
  if (/Threads/i.test(ua)) arrival = "threads";
  else if (/FBAN|FBAV|Facebook/i.test(ua)) arrival = "facebook";
  else if (/Instagram/i.test(ua)) arrival = "instagram";
  else if (/CriOS/i.test(ua)) arrival = "chrome-ios";
  else if (/FxiOS/i.test(ua)) arrival = "firefox-ios";
  else if (/Edg\//i.test(ua)) arrival = "edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) arrival = "chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/CriOS/i.test(ua)) arrival = "safari";
  else if (/Firefox\//i.test(ua)) arrival = "firefox";

  let browser = "unknown";
  if (arrival === "threads" || arrival === "facebook" || arrival === "instagram") browser = "in-app";
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
  const device = classifyShellDevice(userAgent, viewport());
  const reached = new Set();
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
    const batchId = `shell-batch-${startedAt}-${reached.size}-${lastFatal ? 1 : 0}-${Math.floor(Math.random() * 1e9)}`
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
    if (reached.size === 0 && !lastFatal) return flushChain;
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
