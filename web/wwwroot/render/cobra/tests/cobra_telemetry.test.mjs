import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_TELEMETRY_BATCH_BYTE_LIMIT,
  COBRA_TELEMETRY_BUFFER_ROW_LIMIT,
  COBRA_TELEMETRY_FLUSH_INTERVAL_MS,
  createCobraTelemetryChannel,
} from "../cobra_telemetry.js";

function fatRow(index) {
  return { k: "st", t: index, s: { index, filler: "x".repeat(760) } };
}

function stubFetch(script = []) {
  const calls = [];
  const impl = (url, options) => {
    calls.push({ url, options, body: options?.body ?? null });
    const step = script.length ? script.shift() : { ok: true };
    if (step.reject) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ ok: step.ok !== false, status: step.status ?? 200 });
  };
  return { calls, impl };
}

function channelWith(fetchScript, options = {}) {
  const { calls, impl } = stubFetch(fetchScript);
  const channel = createCobraTelemetryChannel({
    session: "web-cobra-test",
    build: "263",
    userAgent: "test agent",
    endpoint: "../api/telemetry",
    fetchImpl: impl,
    now: options.now ?? (() => 0),
    ...options,
  });
  return { channel, calls };
}

function bodyRows(call) {
  return JSON.parse(call.body).rows;
}

test("periodic batches stay under the keepalive-safe byte cap and keep the remainder queued", async () => {
  const { channel, calls } = channelWith([{ ok: true }]);
  for (let index = 0; index < 200; index++) channel.record(fatRow(index));

  await channel.flush();

  assert.equal(calls.length, 1);
  const bytes = new TextEncoder().encode(calls[0].body).byteLength;
  assert.ok(bytes <= COBRA_TELEMETRY_BATCH_BYTE_LIMIT,
    `batch body ${bytes} B exceeds the ${COBRA_TELEMETRY_BATCH_BYTE_LIMIT} B cap`);
  const rows = bodyRows(calls[0]);
  const dataRows = rows.filter((row) => row.k !== "hdr");
  const diagnostics = channel.diagnostics();
  assert.ok(dataRows.length > 0 && dataRows.length < 200, "cap must slice, not send everything");
  assert.equal(dataRows.length + diagnostics.bufferedRows, 200,
    "remainder rows must stay queued, not vanish");
  assert.equal(diagnostics.droppedRows, 0);
});

test("every batch leads with an hdr row carrying build and UA attribution", async () => {
  const { channel, calls } = channelWith([{ ok: true }]);
  channel.record(fatRow(0));

  await channel.flush();

  const rows = bodyRows(calls[0]);
  assert.equal(rows[0].k, "hdr");
  assert.equal(rows[0].build, "263");
  assert.equal(rows[0].session, "web-cobra-test");
  assert.equal(rows[0].ua, "test agent");
  assert.equal(typeof rows[0].t0, "number");
});

test("keepalive is used only on the pagehide path", async () => {
  const { channel, calls } = channelWith([{ ok: true }, { ok: true }]);
  channel.record(fatRow(0));
  await channel.flush();
  channel.record(fatRow(1));
  await channel.flush({ pagehide: true });

  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].options.keepalive, true,
    "periodic flushes must never set keepalive");
  assert.equal(calls[1].options.keepalive, true,
    "the pagehide flush must set keepalive");
});

test("a rejected flush destroys nothing and the retry re-sends the identical batch", async () => {
  const { channel, calls } = channelWith([{ reject: true }, { ok: true }, { ok: true }]);
  for (let index = 0; index < 40; index++) channel.record(fatRow(index));

  await channel.flush();
  assert.equal(channel.diagnostics().droppedRows, 0,
    "a transport failure must not destroy rows");
  assert.ok(channel.diagnostics().pendingRows > 0, "the failed batch must stay pending");

  await channel.flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, calls[0].body,
    "the retry must re-send the identical idempotent batch");

  // Drain any remainder, then prove every recorded row arrived exactly once, in order.
  await channel.flush();
  const delivered = calls
    .slice(1)
    .flatMap((call) => bodyRows(call))
    .filter((row) => row.k !== "hdr")
    .map((row) => row.s.index);
  assert.deepEqual(delivered, Array.from({ length: 40 }, (_, index) => index));
  assert.equal(channel.diagnostics().droppedRows, 0);
});

test("an HTTP error response also retains the batch for retry", async () => {
  const { channel, calls } = channelWith([{ ok: false, status: 500 }, { ok: true }]);
  for (let index = 0; index < 5; index++) channel.record(fatRow(index));

  await channel.flush();
  assert.equal(channel.diagnostics().droppedRows, 0);
  await channel.flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, calls[0].body);
});

test("the buffer is bounded and sheds oldest rows with an explicit counter", () => {
  const { channel } = channelWith([], { bufferRowLimit: 100 });
  for (let index = 0; index < 150; index++) channel.record(fatRow(index));

  const diagnostics = channel.diagnostics();
  assert.equal(diagnostics.bufferedRows, 100);
  assert.equal(diagnostics.droppedRows, 50);
});

test("default buffer bound and flush interval are sane for a ~10 Hz row stream", () => {
  assert.ok(COBRA_TELEMETRY_BUFFER_ROW_LIMIT >= 1_000);
  assert.ok(COBRA_TELEMETRY_FLUSH_INTERVAL_MS <= 10_000);
});

test("flushIfDue posts only after the interval elapses", async () => {
  let nowMs = 0;
  const { channel, calls } = channelWith([{ ok: true }], { now: () => nowMs });
  channel.record(fatRow(0));

  nowMs = COBRA_TELEMETRY_FLUSH_INTERVAL_MS - 1;
  channel.flushIfDue(nowMs);
  assert.equal(calls.length, 0);

  nowMs = COBRA_TELEMETRY_FLUSH_INTERVAL_MS + 1;
  await channel.flushIfDue(nowMs);
  assert.equal(calls.length, 1);
});

test("a flush while one is in flight does not double-send", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const channel = createCobraTelemetryChannel({
    session: "s",
    build: "263",
    userAgent: "ua",
    fetchImpl: (url, options) => {
      calls.push({ url, options });
      return gate.then(() => ({ ok: true }));
    },
    now: () => 0,
  });
  channel.record(fatRow(0));
  const first = channel.flush();
  channel.flush();
  assert.equal(calls.length, 1);
  release();
  await first;
});

test("an empty channel never posts", async () => {
  const { channel, calls } = channelWith([]);
  await channel.flush();
  await channel.flush({ pagehide: true });
  assert.equal(calls.length, 0);
});
