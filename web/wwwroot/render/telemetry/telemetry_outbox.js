// Durable telemetry outbox. On a flaky link (owner on Starlink, 2026-10-14) a failed upload lived
// only in memory, and closing the tab lost it — the RTB the owner wanted analysed never reached
// the store. A batch that fails transport, or is still unsent at pagehide, is written here as its
// exact immutable request body and re-sent on the next load. The receiver's deterministic Blob path
// makes a repeated batch id idempotent, so a duplicate send is harmless.
//
// Everything fails quiet: no IndexedDB (private window, blocked storage) simply means no outbox.

const DB_NAME = "guns-telemetry-outbox";
const STORE = "batches";
// Each body is at most 2 MiB; cap the outbox so a long offline spell cannot fill the disk.
export const TELEMETRY_OUTBOX_MAX_ENTRIES = 12;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createTelemetryOutbox({
  indexedDB = globalThis.indexedDB,
  maxEntries = TELEMETRY_OUTBOX_MAX_ENTRIES,
} = {}) {
  let dbPromise = null;
  function db() {
    if (!indexedDB) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        let open;
        try { open = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains(STORE))
            open.result.createObjectStore(STORE, { keyPath: "batchId" });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => resolve(null);
        open.onblocked = () => resolve(null);
      });
    }
    return dbPromise;
  }
  async function withStore(mode, fn) {
    try {
      const database = await db();
      if (!database) return null;
      const tx = database.transaction(STORE, mode);
      // Arm completion before issuing requests: a transaction can commit as soon as its last
      // request settles, and a handler attached afterwards would never fire.
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      const result = await fn(tx.objectStore(STORE));
      await done;
      return result;
    } catch {
      return null;
    }
  }
  return {
    /** Persist one exact request body; evict the oldest beyond the cap. */
    put(batchId, payload) {
      if (!batchId || typeof payload !== "string" || !payload) return Promise.resolve(null);
      return withStore("readwrite", async (store) => {
        await request(store.put({ batchId: String(batchId), payload, savedAt: Date.now() }));
        const all = await request(store.getAll());
        const excess = all.length - Math.max(1, maxEntries);
        if (excess > 0) {
          all.sort((a, b) => a.savedAt - b.savedAt);
          for (const entry of all.slice(0, excess)) await request(store.delete(entry.batchId));
        }
        return true;
      });
    },
    remove(batchId) {
      if (!batchId) return Promise.resolve(null);
      return withStore("readwrite", (store) => request(store.delete(String(batchId))));
    },
    /** Telemetry opt-out destroys everything not yet acknowledged, including saved bodies. */
    clear() {
      return withStore("readwrite", (store) => request(store.clear()));
    },
    /** Oldest first. */
    async list() {
      const all = await withStore("readonly", (store) => request(store.getAll()));
      return Array.isArray(all) ? all.sort((a, b) => a.savedAt - b.savedAt) : [];
    },
  };
}

/**
 * Re-send saved batches oldest first. A receiver rejection (400/413/422) is permanent for that
 * body, so it is discarded; any transport failure stops the drain for this load.
 */
export async function drainTelemetryOutbox(outbox, send) {
  let sent = 0;
  for (const entry of await outbox.list()) {
    let status;
    try { status = await send(entry.payload); } catch { break; }
    if (status >= 200 && status < 300) { await outbox.remove(entry.batchId); sent++; continue; }
    if (status === 400 || status === 413 || status === 422) { await outbox.remove(entry.batchId); continue; }
    break;
  }
  return sent;
}
