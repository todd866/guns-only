import test from "node:test";
import assert from "node:assert/strict";
import {
  createTelemetryOutbox,
  drainTelemetryOutbox,
  TELEMETRY_OUTBOX_MAX_ENTRIES,
} from "../telemetry_outbox.js";

// Minimal IndexedDB stand-in: requests settle on a later macrotask and a transaction commits
// once its requests have settled, which is the ordering that bites a late oncomplete handler.
function fakeIndexedDB() {
  const stores = new Map();
  const later = (fn) => setTimeout(fn, 0);
  function makeRequest(run, tx) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    tx.pending++;
    later(() => {
      try { req.result = run(); req.onsuccess?.(); } catch (error) { req.error = error; req.onerror?.(); }
      tx.pending--;
      later(() => tx.maybeComplete());
    });
    return req;
  }
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); },
    transaction(name) {
      const data = stores.get(name);
      const tx = {
        pending: 0, completed: false, oncomplete: null, onerror: null, onabort: null,
        maybeComplete() {
          if (this.pending === 0 && !this.completed) { this.completed = true; this.oncomplete?.(); }
        },
        objectStore() {
          return {
            put: (value) => makeRequest(() => { data.set(value.batchId, structuredClone(value)); }, tx),
            getAll: () => makeRequest(() => [...data.values()].map((v) => structuredClone(v)), tx),
            delete: (key) => makeRequest(() => { data.delete(key); }, tx),
            clear: () => makeRequest(() => { data.clear(); }, tx),
          };
        },
      };
      return tx;
    },
  };
  return {
    open() {
      const req = { result: database, onsuccess: null, onupgradeneeded: null, onerror: null };
      later(() => {
        if (!stores.has("batches")) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

test("an unsent body survives in the outbox and drains oldest first", async () => {
  const outbox = createTelemetryOutbox({ indexedDB: fakeIndexedDB() });
  await outbox.put("batch-a", '{"rows":[1]}');
  await new Promise((resolve) => setTimeout(resolve, 2));
  await outbox.put("batch-b", '{"rows":[2]}');
  assert.deepEqual((await outbox.list()).map((e) => e.batchId), ["batch-a", "batch-b"]);

  const sent = [];
  const count = await drainTelemetryOutbox(outbox, async (payload) => { sent.push(payload); return 200; });
  assert.equal(count, 2);
  assert.deepEqual(sent, ['{"rows":[1]}', '{"rows":[2]}']);
  assert.deepEqual(await outbox.list(), []);
});

test("a transport failure stops the drain and keeps the body; a rejection discards it", async () => {
  const outbox = createTelemetryOutbox({ indexedDB: fakeIndexedDB() });
  await outbox.put("bad", "x");
  await new Promise((resolve) => setTimeout(resolve, 2));
  await outbox.put("later", "y");
  await drainTelemetryOutbox(outbox, async () => { throw new Error("offline"); });
  assert.equal((await outbox.list()).length, 2, "offline drain must not lose anything");

  await drainTelemetryOutbox(outbox, async (payload) => (payload === "x" ? 422 : 503));
  assert.deepEqual((await outbox.list()).map((e) => e.batchId), ["later"],
    "a permanently rejected body is dropped; a 503 stops the drain and keeps the rest");
});

test("the outbox is bounded, and opt-out clears it", async () => {
  const outbox = createTelemetryOutbox({ indexedDB: fakeIndexedDB() });
  for (let i = 0; i < TELEMETRY_OUTBOX_MAX_ENTRIES + 3; i += 1) {
    await outbox.put(`b${i}`, `p${i}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const kept = await outbox.list();
  assert.equal(kept.length, TELEMETRY_OUTBOX_MAX_ENTRIES);
  assert.equal(kept[0].batchId, "b3", "the oldest bodies are evicted first");
  await outbox.clear();
  assert.deepEqual(await outbox.list(), []);
});

test("no IndexedDB means no outbox, never an exception", async () => {
  const outbox = createTelemetryOutbox({ indexedDB: undefined });
  assert.equal(await outbox.put("a", "b"), null);
  assert.deepEqual(await outbox.list(), []);
  assert.equal(await drainTelemetryOutbox(outbox, async () => 200), 0);
});
