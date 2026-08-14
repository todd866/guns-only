import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COBRA_TELEMETRY_BATCH_BYTE_LIMIT,
  COBRA_TELEMETRY_BUFFER_ROW_LIMIT,
  COBRA_TELEMETRY_FLUSH_INTERVAL_MS,
  COBRA_TELEMETRY_MAX_DRAIN_BATCHES,
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

test("periodic drain keeps every request under the byte cap and sends the queued prefix in order", async () => {
  const { channel, calls } = channelWith([]);
  for (let index = 0; index < 200; index++) channel.record(fatRow(index));

  await channel.flush();

  assert.ok(calls.length > 1, "a capped remainder must drain without waiting another five seconds");
  assert.ok(calls.length <= COBRA_TELEMETRY_MAX_DRAIN_BATCHES);
  for (const call of calls) {
    const bytes = new TextEncoder().encode(call.body).byteLength;
    assert.ok(bytes <= COBRA_TELEMETRY_BATCH_BYTE_LIMIT,
      `batch body ${bytes} B exceeds the ${COBRA_TELEMETRY_BATCH_BYTE_LIMIT} B cap`);
  }
  const delivered = calls.flatMap(bodyRows)
    .filter((row) => row.k !== "hdr")
    .map((row) => row.s.index);
  const diagnostics = channel.diagnostics();
  assert.deepEqual(delivered, Array.from({ length: 200 }, (_, index) => index));
  assert.equal(diagnostics.bufferedRows, 0);
  assert.equal(diagnostics.droppedRows, 0);
});

test("one cadence out-drains the measured 10 Hz stream of three-kilobyte Cobra states", async () => {
  const { channel, calls } = channelWith([]);
  for (let index = 0; index < 50; index++) {
    channel.record({ k: "st", t: index * 100, s: { index, filler: "x".repeat(3_000) } });
  }

  await channel.flush();

  assert.ok(calls.length >= 3, "measured rows should prove the old one-request cadence was too slow");
  assert.ok(calls.length <= COBRA_TELEMETRY_MAX_DRAIN_BATCHES);
  assert.equal(channel.diagnostics().bufferedRows, 0,
    "a five-second / 50-row arrival window must be completely drained");
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
  assert.ok(COBRA_TELEMETRY_MAX_DRAIN_BATCHES >= 4);
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

test("a late pagehide duplicate cannot erase or unlock the periodic successor batch", async () => {
  const periodicA = deferred();
  const pagehideA = deferred();
  const periodicB = deferred();
  const gates = [periodicA, pagehideA, periodicB];
  const calls = [];
  const channel = createCobraTelemetryChannel({
    session: "race",
    build: "327",
    userAgent: "ua",
    fetchImpl: (url, options) => {
      calls.push({ url, options, body: options.body });
      const gate = gates[calls.length - 1];
      return gate ? gate.promise : Promise.resolve({ ok: true });
    },
    now: () => 0,
  });
  // More than one byte-capped request, so successful A immediately starts successor B.
  for (let index = 0; index < 120; index++) channel.record(fatRow(index));

  const periodicDrain = channel.flush();
  const pagehideDuplicate = channel.flush({ pagehide: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, calls[0].body, "pagehide must duplicate A's idempotent body");

  periodicA.resolve({ ok: true });
  // Let A's success clear itself, release its latch, and synchronously recurse into B.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.length, 3, "periodic A success should start successor B");
  const successorBody = calls[2].body;
  assert.notEqual(successorBody, calls[0].body);

  pagehideA.resolve({ ok: true });
  await pagehideDuplicate;
  assert.ok(channel.diagnostics().pendingRows > 0,
    "late pagehide(A) must not clear pending successor B");
  channel.flush();
  assert.equal(calls.length, 3,
    "late pagehide(A) must not release B's single-flight latch");

  periodicB.reject(new TypeError("successor transport failed"));
  await periodicDrain;
  assert.ok(channel.diagnostics().pendingRows > 0,
    "failed successor B must remain pending for an identical retry");

  await channel.flush();
  assert.equal(calls[3].body, successorBody,
    "retry must preserve successor B's exact idempotent payload");
});

test("an empty channel never posts", async () => {
  const { channel, calls } = channelWith([]);
  await channel.flush();
  await channel.flush({ pagehide: true });
  assert.equal(calls.length, 0);
});

test("uploaded Cobra state rows preserve ground-fire and subsystem evidence", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  const recordTelemetry = main.match(/function recordTelemetry\(nowMs\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(recordTelemetry, /const battleDamage = authorityState\.battle_damage/);
  assert.match(recordTelemetry, /latestThreatBurst/);
  for (const field of [
    "cobra_ground_fire_active_observer_id",
    "cobra_ground_fire_acquisition_progress",
    "cobra_ground_fire_tracking_observers",
    "cobra_ground_fire_threat_tracking",
    "cobra_ground_fire_receiving_fire",
    "cobra_ground_fire_bursts_fired",
    "cobra_ground_fire_pending_bursts",
    "cobra_ground_fire_damaging_hits",
    "cobra_ground_fire_seconds_to_next_impact",
    "cobra_ground_fire_scas_damaged",
    "cobra_ground_fire_engine_damaged",
    "cobra_ground_fire_last_burst_sequence",
    "cobra_ground_fire_last_burst_observer_id",
    "cobra_ground_fire_last_burst_will_hit",
    "cobra_ground_fire_last_burst_subsystem",
    "cobra_ground_fire_last_burst_has_impacted",
  ]) {
    assert.match(recordTelemetry, new RegExp(`\\b${field}\\s*:`), `missing ${field}`);
  }
});

test("uploaded Cobra state rows preserve the complete ramp-turnaround sequence", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  const recordTelemetry = main.match(/function recordTelemetry\(nowMs\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(recordTelemetry, /const turnaround = authorityState\.turnaround/);
  for (const field of [
    "cobra_turnaround_phase",
    "cobra_turnaround_sequence",
    "cobra_turnaround_action",
    "cobra_turnaround_hold_progress",
    "cobra_turnaround_flight_controls_enabled",
    "cobra_turnaround_weapons_enabled",
    "cobra_engine_operating",
    "cobra_engine_shaft_power_w",
    "cobra_engine_shaft_power_fraction",
  ]) {
    assert.match(recordTelemetry, new RegExp(`\\b${field}\\s*:`), `missing ${field}`);
  }
});
