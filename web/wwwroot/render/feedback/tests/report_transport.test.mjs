import test from "node:test";
import assert from "node:assert/strict";
import { createReportTransport } from "../report_transport.js";

function memoryOutbox() {
  const entries = new Map();
  return { entries, put: async (id, payload) => { entries.set(id, { batchId: id, payload }); return true; },
    remove: async id => entries.delete(id), list: async () => [...entries.values()] };
}
test("deployment capability gates explicit sending without a diagnostics preference", async () => {
  const outbox = memoryOutbox();
  let calls = 0;
  const transport = createReportTransport({ outbox, fetcher: async () => {
    calls++; return { ok: true, json: async () => ({ enabled: false }) };
  } });
  assert.equal(await transport.check(), false);
  await assert.rejects(transport.submit("id", "payload"), /unavailable/);
  assert.equal(calls, 1);
  assert.equal(outbox.entries.size, 0);
});

test("offline send persists before POST and a new page retries the identical body and ID", async () => {
  const outbox = memoryOutbox();
  const first = createReportTransport({ outbox, fetcher: async (_url, options) => {
    if (options.method === "POST") {
      assert.equal(outbox.entries.get("report-1").payload, "immutable request");
      throw new Error("offline");
    }
    return { ok: true, json: async () => ({ enabled: true }) };
  } });
  await first.check();
  assert.equal(await first.submit("report-1", "immutable request"), "Queued");
  const sent = [];
  const next = createReportTransport({ outbox, fetcher: async (_url, options) => {
    if (options.method === "POST") { sent.push(options.body); return { status: 204 }; }
    return { ok: true, json: async () => ({ enabled: true }) };
  } });
  await next.check();
  await Promise.all([next.drain(), next.drain()]);
  assert.deepEqual(sent, ["immutable request"]);
  assert.equal(outbox.entries.size, 0);
});

test("storage failure never claims queued and success removes the durable entry", async () => {
  const outbox = memoryOutbox();
  let status = 204;
  const transport = createReportTransport({ outbox, fetcher: async (_url, options) =>
    options.method === "POST" ? { status } : { ok: true, json: async () => ({ enabled: true }) } });
  await transport.check();
  assert.equal(await transport.submit("id", "body"), "Sent");
  assert.equal(outbox.entries.size, 0);
  outbox.put = async () => null;
  status = 503;
  await assert.rejects(transport.submit("id", "body"), /storage unavailable/);
});

test("a failed drain retains reports and backs off without blocking flight", async () => {
  const outbox = memoryOutbox();
  await outbox.put("id", "body");
  let posts = 0;
  const transport = createReportTransport({ outbox, fetcher: async (_url, options) => {
    if (options.method === "POST") { posts++; return { status: 503 }; }
    return { ok: true, json: async () => ({ enabled: true }) };
  } });
  await transport.check();
  await transport.drain();
  await transport.drain();
  assert.equal(posts, 1);
  assert.equal(outbox.entries.size, 1);
});

test("receiver rejection retains explicit report evidence for retry", async () => {
  const outbox = memoryOutbox();
  const transport = createReportTransport({ outbox, fetcher: async (_url, options) =>
    options.method === "POST" ? { status: 413 } : { ok: true, json: async () => ({ enabled: true }) } });
  await transport.check();
  await assert.rejects(transport.submit("id", "body"), /retained locally/);
  await transport.drain();
  assert.equal(outbox.entries.get("id").payload, "body");
});

test("verified build capability survives offline reload, but absent or disabled capability cannot send", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const outbox = memoryOutbox();
  const capable = createReportTransport({ outbox, capabilityKey: "build381", capabilityStorage: storage,
    fetcher: async () => ({ ok: true, json: async () => ({ enabled: true }) }) });
  await capable.check();
  const offline = createReportTransport({ outbox, capabilityKey: "build381", capabilityStorage: storage,
    fetcher: async () => { throw new Error("offline"); } });
  assert.equal(await offline.check(), true);
  assert.equal(await offline.submit("id", "body"), "Queued");
  const anotherBuild = createReportTransport({ outbox, capabilityKey: "build382", capabilityStorage: storage,
    fetcher: async () => { throw new Error("offline"); } });
  assert.equal(await anotherBuild.check(), false);
  const disabled = createReportTransport({ outbox, capabilityKey: "build381", capabilityStorage: storage,
    fetcher: async () => ({ ok: true, json: async () => ({ enabled: false }) }) });
  assert.equal(await disabled.check(), false);
  const reload = createReportTransport({ outbox, capabilityKey: "build381", capabilityStorage: storage });
  assert.equal(reload.enabled, false);
});
