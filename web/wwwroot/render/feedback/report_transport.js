import { createTelemetryOutbox } from "../telemetry/telemetry_outbox.js";

export function createReportTransport({
  outbox = createTelemetryOutbox({ dbName: "guns-feedback-outbox", maxEntries: 8 }),
  fetcher = globalThis.fetch.bind(globalThis), onEnabled = () => {},
  capabilityKey = null, capabilityStorage = null,
} = {}) {
  let enabled = false;
  let storage = capabilityStorage;
  // Only a prior successful server check authorizes offline reports. Scope it to this build;
  // a deployment that has never advertised a token remains disabled, online or offline.
  try {
    storage ??= globalThis.localStorage;
    const saved = capabilityKey && JSON.parse(storage?.getItem(capabilityKey) || "null");
    enabled = saved?.enabled === true && Date.now() - saved.checkedAt < 7 * 24 * 60 * 60_000;
  } catch { /* Blocked storage means online verification is required. */ }
  onEnabled(enabled);
  let draining = null;
  let retryDelay = 30_000;
  let nextAttempt = 0;
  async function send(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return (await fetcher("/report", { method: "POST", headers: { "Content-Type": "application/json" },
        body: payload, signal: controller.signal })).status;
    } finally { clearTimeout(timer); }
  }
  return {
    get enabled() { return enabled; },
    async check() {
      try {
        const response = await fetcher("/report", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (response.ok) {
          enabled = (await response.json()).enabled === true;
          try {
            if (capabilityKey) storage?.setItem(capabilityKey, JSON.stringify({ enabled, checkedAt: Date.now() }));
          } catch { /* This page can still report if capability storage is unavailable. */ }
        }
      } catch { /* A temporary offline link preserves this page's last verified capability. */ }
      onEnabled(enabled);
      return enabled;
    },
    async submit(id, payload) {
      if (!enabled) throw new Error("Reports unavailable on this deployment");
      // Persist before attempting transport: closing the tab during a POST must not lose it.
      const persisted = await outbox.put(id, payload);
      let status = 0;
      try { status = await send(payload); } catch { /* Retain exact body and ID. */ }
      if (status >= 200 && status < 300) {
        await outbox.remove(id);
        return "Sent";
      }
      if ([400, 413, 422].includes(status)) {
        throw new Error(`Report rejected (${status}); ${persisted ? "retained locally for retry" : "local storage unavailable"}`);
      }
      if (!persisted) throw new Error("Report not sent; local storage unavailable. Retry while online.");
      return "Queued";
    },
    drain({ force = false } = {}) {
      if (!enabled || draining || (!force && Date.now() < nextAttempt)) return draining;
      draining = (async () => {
        for (const entry of await outbox.list()) {
          let status = 0;
          try { status = await send(entry.payload); } catch { /* Stop at the first failed write. */ }
          if (status >= 200 && status < 300) {
            await outbox.remove(entry.batchId);
            continue;
          }
          nextAttempt = Date.now() + retryDelay;
          retryDelay = Math.min(300_000, retryDelay * 2);
          return;
        }
        nextAttempt = Date.now() + 30_000;
        retryDelay = 30_000;
      })().finally(() => { draining = null; });
      return draining;
    },
  };
}
