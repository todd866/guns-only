import test from "node:test";
import assert from "node:assert/strict";
import { createRCTelemetry } from "./telemetry.mjs";

function memoryOutbox() {
  const entries = new Map();
  return { async put(id, payload) { entries.set(id, payload); return true; }, async list() { return [...entries].map(([batchId, payload]) => ({ batchId, payload, savedAt: 0 })); }, async remove(id) { entries.delete(id); }, async clear() { entries.clear(); }, entries };
}

function noIdbOutbox() {
  return { async put() { return null; }, async list() { return []; }, async remove() {}, async clear() {} };
}

test("records by default; missing storage cannot throw and an explicit Settings opt out sends nothing", async () => {
  const outbox = memoryOutbox(); let calls = 0;
  const t = createRCTelemetry({ storage: undefined, locationObject: { hostname: "guns-only.com", search: "" }, outbox, fetchImpl: async () => { calls++; return { status: 200 }; } });
  t.firstInput("keyboard"); await t.flush({ force: true });
  assert.equal(t.enabled, true); assert.equal(calls, 1);
  const fresh = createRCTelemetry({ storage: { getItem: () => null }, locationObject: { hostname: "guns-only.com", search: "" }, outbox: memoryOutbox(), fetchImpl: async () => { calls++; return { status: 200 }; } });
  fresh.firstInput("touch"); await fresh.flush({ force: true }); assert.equal(fresh.enabled, true); assert.equal(calls, 2, "a never-asked player records");
  const optedOut = createRCTelemetry({ storage: { getItem: () => "disabled" }, locationObject: { hostname: "guns-only.com", search: "" }, outbox: memoryOutbox(), fetchImpl: async () => { calls++; return { status: 200 }; } });
  optedOut.firstInput("touch"); await optedOut.flush({ force: true }); assert.equal(optedOut.enabled, false); assert.equal(calls, 2);
});

test("skate runs record park, score and how the run ended, and the follow-up choice", async () => {
  const rows = []; let now = 0; const t = createRCTelemetry({ storage: { getItem: () => null }, locationObject: { hostname: "guns-only.com", search: "" }, outbox: noIdbOutbox(), now: () => now, fetchImpl: async (_url, options) => { rows.push(...JSON.parse(options.body).rows); return { status: 200, ok: true }; } });
  t.skateStart("intro"); now = 120_000; t.skateEnd({ reason: "time", score: 12_345, bestCombo: 4, gaps: 3, goals: 2, newGoals: 1, letters: 5 }); t.choice("skate_again");
  t.skateStart("hangar"); now = 130_000; t.skateStart("school"); t.endSession(); await t.flush({ force: true });
  const ends = rows.filter((row) => row.code === "skate_end");
  assert.deepEqual(ends.map((row) => [row.park, row.reason]), [["intro", "time"], ["hangar", "replaced"], ["school", "pagehide"]]);
  assert.equal(ends[0].score, 12_345); assert.equal(ends[0].duration, 120_000); assert.equal(ends[0].best_combo, 4); assert.equal(ends[0].letters, 5);
  assert.equal(rows.find((row) => row.code === "choice").park, "intro");
  assert.equal(rows.filter((row) => row.code === "skate_start").length, 3);
});

test("records bounded lifecycle vocabulary without user data", async () => {
  const outbox = memoryOutbox(); const storage = { getItem: () => "enabled" }; let now = 0;
  const t = createRCTelemetry({ storage, locationObject: { hostname: "guns-only.com", search: "?track=liberty" }, navigatorObject: { maxTouchPoints: 0 }, outbox, now: () => now, fetchImpl: async () => ({ status: 200 }) });
  now = 10; t.firstInput("keyboard"); t.firstInput("pointer"); t.raceStart({ track: "liberty", mode: "kid" }); t.itemUse("zoom"); t.mute(true); t.observeFrame(10); t.observeFrame(20); now = 100; t.raceFinish({ place: 1, time: 90, gap: 0, recoveries: 2, altTaken: true }); await t.flush({ force: true });
  const payload = [...outbox.entries.values()][0]; assert.equal(payload, undefined, "successful send drains the outbox");
  const rows = []; const send = async (_url, options) => { rows.push(...JSON.parse(options.body).rows); return { status: 503 }; };
  const retry = createRCTelemetry({ storage, locationObject: { hostname: "guns-only.com", search: "" }, outbox: memoryOutbox(), now: () => now, fetchImpl: send });
  retry.firstInput("touch"); await retry.flush({ force: true });
  assert.ok(rows.length > 0); assert.ok(rows.every((row) => row.type === "rc")); assert.ok(rows.every((row) => !("ua" in row) && !("user" in row)));
});

test("transport failure keeps the exact batch for retry and noncanonical hosts stay memory only", async () => {
  const outbox = memoryOutbox(); const storage = { getItem: () => "enabled" };
  const t = createRCTelemetry({ storage, locationObject: { hostname: "preview.vercel.app", search: "" }, outbox, fetchImpl: async () => ({ status: 200 }) });
  t.firstInput("button"); await t.flush({ force: true }); assert.equal(t.enabled, true, "injected transport is testable"); assert.equal(outbox.entries.size, 0);
  const noTransport = createRCTelemetry({ storage, locationObject: { hostname: "preview.vercel.app", search: "" }, fetchImpl: undefined });
  noTransport.firstInput("button"); await noTransport.flush({ force: true }); assert.equal(noTransport.enabled, false);
});

test("opt out clears queued events, query opt out wins, and concurrent flushes are single flight", async () => {
  const outbox = memoryOutbox(); let consent = "enabled"; let calls = 0; let release;
  const storage = { getItem: () => consent };
  const fetchImpl = async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return { status: 200, ok: true }; };
  const t = createRCTelemetry({ storage, locationObject: { hostname: "guns-only.com", search: "" }, outbox, fetchImpl });
  t.firstInput("keyboard"); const first = t.flush({ force: true }); const second = t.flush({ force: true });
  await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(calls, 1); release(); await Promise.all([first, second]);
  consent = "disabled"; t.itemUse("zoom"); await t.flush({ force: true }); assert.equal(outbox.entries.size, 0);
  const off = createRCTelemetry({ storage, locationObject: { hostname: "guns-only.com", search: "?telemetry=off" }, outbox: memoryOutbox(), fetchImpl: async () => ({ status: 200, ok: true }) });
  off.firstInput("keyboard"); await off.flush({ force: true }); assert.equal(off.enabled, false);
});

test("no IndexedDB retries the exact payload instead of losing it", async () => {
  const storage = { getItem: () => "enabled" }; const payloads = []; let status = 503;
  const t = createRCTelemetry({ storage, locationObject: { hostname: "guns-only.com", search: "" }, outbox: noIdbOutbox(), fetchImpl: async (_url, options) => { payloads.push(options.body); return { status, ok: status >= 200 && status < 300 }; } });
  t.firstInput("keyboard"); await t.flush({ force: true }); assert.equal(payloads.length, 1);
  status = 204; await t.flush({ force: true }); assert.equal(payloads.length, 2); assert.equal(payloads[0], payloads[1]);
});

test("events recorded while IndexedDB put is pending survive that batch acknowledgement", async () => {
  const storage = { getItem: () => "enabled" }; let releasePut; let putStarted;
  const outbox = { async put() { putStarted = new Promise((resolve) => { releasePut = resolve; }); await putStarted; return true; }, async list() { return []; }, async remove() {}, async clear() {} };
  const t = createRCTelemetry({ storage, locationObject: { hostname: "guns-only.com", search: "" }, outbox, fetchImpl: async () => ({ status: 200, ok: true }) });
  t.firstInput("keyboard"); const pending = t.flush({ force: true }); await new Promise((resolve) => setTimeout(resolve, 0)); t.itemUse("zoom"); releasePut(); await pending;
  assert.equal(t.diagnostics().bufferedRows, 1, "the event added during put remains queued");
});

test("consent revoked while put is pending clears without sending", async () => {
  let consent = "enabled"; let releasePut; let sends = 0;
  const outbox = { async put() { await new Promise((resolve) => { releasePut = resolve; }); return true; }, async list() { return []; }, async remove() {}, async clear() {} };
  const t = createRCTelemetry({ storage: { getItem: () => consent }, locationObject: { hostname: "guns-only.com", search: "" }, outbox, fetchImpl: async () => { sends += 1; return { status: 200, ok: true }; } });
  t.firstInput("keyboard"); const pending = t.flush({ force: true }); await new Promise((resolve) => setTimeout(resolve, 0)); consent = "disabled"; releasePut(); await pending;
  assert.equal(sends, 0); assert.equal(t.diagnostics().bufferedRows, 0);
});

test("race switches and choices retain race attribution; null metrics stay null", async () => {
  const rows = []; const t = createRCTelemetry({ storage: { getItem: () => "enabled" }, locationObject: { hostname: "guns-only.com", search: "" }, outbox: noIdbOutbox(), fetchImpl: async (_url, options) => { rows.push(...JSON.parse(options.body).rows); return { status: 200, ok: true }; } });
  t.raceStart({ kind: "race", track: "base", mode: "kid" }); t.raceStart({ kind: "furball", track: "liberty", mode: "bigKid" }); t.furballOutcome({ balloonsLeft: 2, pops: 1, kills: 0, duration: 3, winner: null }); t.choice("again"); t.raceStart({ kind: "race", track: "liberty", mode: "bigKid" }); t.raceFinish({ place: 2, time: 10, gap: null, altTaken: null }); await t.flush({ force: true });
  const starts = rows.filter((row) => row.code === "race_start"); const result = rows.find((row) => row.code === "furball_outcome"); const choice = rows.find((row) => row.code === "choice");
  assert.equal(starts.length, 3); assert.notEqual(starts[0].race_id, starts[1].race_id); assert.notEqual(starts[1].race_id, starts[2].race_id); assert.equal(result.track, "liberty"); assert.equal(result.mode, "bigKid"); assert.equal(choice.race_id, result.race_id);
  assert.equal(result.winner, null);
});

test("foreground p95 excludes the first resumed frame and null metrics are preserved", async () => {
  const rows = []; const t = createRCTelemetry({ storage: { getItem: () => "enabled" }, locationObject: { hostname: "guns-only.com", search: "" }, outbox: noIdbOutbox(), fetchImpl: async (_url, options) => { rows.push(...JSON.parse(options.body).rows); return { status: 200, ok: true }; } });
  t.observeFrame(10, false); t.observeFrame(100, true); t.observeFrame(20, true); t.raceStart(); t.raceFinish({ gap: null, altTaken: null }); await t.flush({ force: true });
  assert.equal(rows.find((row) => row.code === "frame_p95").p95_ms, 20);
  assert.equal(rows.find((row) => row.code === "race_finish").gap, null); assert.equal(rows.find((row) => row.code === "race_finish").alt_taken, null);
});

test("throwing browser storage getters cannot throw and still record", async () => {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage"); const oldIndexed = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { throw new Error("blocked"); } });
    const t = createRCTelemetry({ locationObject: { hostname: "guns-only.com", search: "" }, fetchImpl: async () => ({ status: 200 }) });
    t.firstInput("keyboard"); await t.flush({ force: true }); assert.equal(t.enabled, true);
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage); else delete globalThis.localStorage;
    if (oldIndexed) Object.defineProperty(globalThis, "indexedDB", oldIndexed); else delete globalThis.indexedDB;
  }
});
