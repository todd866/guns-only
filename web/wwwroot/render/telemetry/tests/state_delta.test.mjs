import assert from "node:assert/strict";
import test from "node:test";
import { buildTelemetryBatch } from "../telemetry_batch.js";
import {
  ensureTelemetryChunkKeyframe,
  ensureTelemetryChunkHeader,
  materializeTelemetryState,
  releaseTelemetryMaterializedStates,
  TelemetryStateEncoder,
  TelemetryStateDecoder,
  TELEMETRY_STATE_ENCODING,
} from "../state_delta.js";

test("keyframes and deltas reconstruct the exact flat WebBridge state", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 3 });
  const states = [
    { tick: 0, px: 0, mode: "FREE", gear: { nose: 1, left: 1, right: 1 }, tracers: [] },
    { tick: 1, px: 4.25, mode: "FREE", gear: { nose: 1, left: 1, right: 1 }, tracers: [] },
    { tick: 2, px: 8.5, mode: "FIGHT", gear: { nose: 1, left: 1, right: 1 }, tracers: [1] },
    { tick: 3, px: 12.75, mode: "FIGHT", gear: { nose: 1, left: 1, right: 1 }, tracers: [1] },
    { tick: 4, px: 17, mode: "FIGHT", gear: { nose: 1, left: 1, right: 1 }, tracers: [] },
  ];
  let reconstructed = null;
  const rows = states.map((state, index) => encoder.encode({
    state,
    time: index * 50,
    build: "test",
    held: index === 2 ? ["ArrowLeft"] : [],
  }));

  assert.ok(rows[0].s);
  assert.ok(rows[1].d);
  assert.deepEqual(rows[1].d, { tick: 1, px: 4.25 });
  assert.ok(rows[3].s, "periodic recovery keyframe should be present");
  for (let index = 0; index < rows.length; index += 1) {
    reconstructed = materializeTelemetryState(rows[index], reconstructed);
    assert.deepEqual(reconstructed, states[index]);
    assert.equal(rows[index].q, index);
  }
  assert.equal(TELEMETRY_STATE_ENCODING, "shallow-keyframe-delta-v1");
});

test("removed fields are explicit and a forced upload boundary starts with a keyframe", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 20 });
  const constants = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`c${index}`, index]));
  const first = encoder.encode({
    state: { ...constants, tick: 0, transient: true },
    time: 0,
    build: "test",
  });
  const second = encoder.encode({ state: { ...constants, tick: 1 }, time: 50, build: "test" });
  encoder.forceKeyframe();
  const third = encoder.encode({ state: { tick: 2 }, time: 100, build: "test" });

  assert.ok(first.s);
  assert.deepEqual(second.x, ["transient"]);
  assert.deepEqual(materializeTelemetryState(second, first.s), { ...constants, tick: 1 });
  assert.ok(third.s);
  assert.equal(third.d, undefined);
});

test("unchanged broad state produces a materially smaller lossless row", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 40 });
  const base = Object.fromEntries(Array.from({ length: 180 }, (_, index) => [
    `field_${index}`,
    index % 3 === 0 ? `constant-${index}` : index,
  ]));
  encoder.encode({ state: base, time: 0, build: "test" });
  const next = { ...base, tick: 1, px: 123.456, fuel_lb: 2876.54 };
  const delta = encoder.encode({ state: next, time: 50, build: "test" });
  const fullBytes = JSON.stringify({ k: "st", t: 50, build: "test", held: [], s: next }).length;
  const deltaBytes = JSON.stringify(delta).length;

  assert.ok(delta.d);
  assert.ok(deltaBytes < fullBytes * 0.2, `${deltaBytes} should be far below ${fullBytes}`);
  assert.deepEqual(materializeTelemetryState(delta, base), next);
});

test("a real batch capacity split promotes the next queued delta into an independent keyframe", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 40 });
  const constants = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`c${index}`, index]));
  const rows = Array.from({ length: 6 }, (_, tick) => encoder.encode({
    state: { ...constants, tick },
    time: tick * 50,
    build: "test",
  }));
  assert.ok(rows[1].d);

  const first = buildTelemetryBatch({
    session: "test",
    batchId: "batch-first-boundary",
    rows,
    maximumRows: 3,
  });
  assert.deepEqual(first.rows.map((row) => row.q), [0, 1, 2]);
  const retained = ensureTelemetryChunkKeyframe([
    { k: "in", code: "ArrowLeft" },
    ...first.remainingRows,
  ]);
  assert.equal(retained[0].k, "in");
  assert.ok(retained[1].s);
  assert.equal(retained[1].d, undefined);
  assert.deepEqual(retained[1].s, { ...constants, tick: 3 });

  const second = buildTelemetryBatch({
    session: "test",
    batchId: "batch-second-boundary",
    rows: retained,
    maximumRows: 10,
  });
  assert.equal(second.remainingRows.length, 0);

  const decoder = new TelemetryStateDecoder();
  for (const row of second.rows.filter((candidate) => candidate.k === "st")) {
    assert.deepEqual(decoder.decode(row), { ...constants, tick: row.q });
  }
});

test("decoder rejects a missing delta but accepts the next recovery keyframe", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 3 });
  const states = Array.from({ length: 4 }, (_, tick) => ({ tick, constant: "truth" }));
  const rows = states.map((state, tick) => encoder.encode({
    state,
    time: tick * 50,
    build: "test",
  }));
  const decoder = new TelemetryStateDecoder();

  assert.deepEqual(decoder.decode(rows[0]), states[0]);
  assert.throws(() => decoder.decode(rows[2]), /sequence gap/);
  assert.ok(rows[3].s, "interval boundary should provide a recovery keyframe");
  assert.deepEqual(decoder.decode(rows[3]), states[3]);
});

test("decoder rejects duplicate/backward keyframes and isolates nested analyst mutations", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 2 });
  const rows = [
    encoder.encode({ state: { tick: 0, nested: { value: 1 } }, time: 0, build: "test" }),
    encoder.encode({ state: { tick: 1, nested: { value: 2 } }, time: 50, build: "test" }),
    encoder.encode({ state: { tick: 2, nested: { value: 3 } }, time: 100, build: "test" }),
  ];
  const decoder = new TelemetryStateDecoder();
  const first = decoder.decode(rows[0]);
  first.nested.value = 999;
  assert.deepEqual(decoder.decode(rows[1]), { tick: 1, nested: { value: 2 } });
  assert.throws(() => decoder.decode(rows[0]), /keyframe sequence must advance/);
  assert.deepEqual(decoder.decode(rows[2]), { tick: 2, nested: { value: 3 } });
});

test("queue truncation can promote retained state, while uploaded rows release hidden snapshots", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 40 });
  const constants = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`c${index}`, index]));
  const rows = Array.from({ length: 8 }, (_, tick) => encoder.encode({
    state: { ...constants, tick },
    time: tick * 50,
    build: "test",
  }));
  const retained = ensureTelemetryChunkKeyframe(rows.slice(-5));
  assert.ok(retained[0].s, "the first retained state must become a recovery keyframe");
  assert.deepEqual(retained[0].s, { ...constants, tick: 3 });

  releaseTelemetryMaterializedStates(rows);
  assert.throws(() => ensureTelemetryChunkKeyframe(rows.slice(1)), /cannot be promoted/);
  assert.ok(rows.every((row) => JSON.stringify(row).includes("telemetry-materialized-state") === false));
});

test("every isolated batch replaces provisional metadata with its own stable header", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 40 });
  const rows = Array.from({ length: 6 }, (_, tick) => encoder.encode({
    state: { tick, constant: "truth" },
    time: tick * 50,
    build: "47",
  }));
  const header = (batchId) => ({
    k: "hdr",
    schema_version: "2.0.0",
    state_encoding: TELEMETRY_STATE_ENCODING,
    keyframe_interval_samples: 40,
    session: "web-test",
    build: "47",
    batch_id: batchId,
  });
  const firstRows = ensureTelemetryChunkHeader(rows, header("batch-one"));
  const first = buildTelemetryBatch({
    session: "web-test",
    batchId: "batch-one",
    rows: firstRows,
    maximumRows: 4,
  });
  assert.equal(first.rows[0].batch_id, "batch-one");

  const retained = ensureTelemetryChunkKeyframe(first.remainingRows);
  const secondRows = ensureTelemetryChunkHeader(retained, header("batch-two"));
  const second = buildTelemetryBatch({
    session: "web-test",
    batchId: "batch-two",
    rows: secondRows,
    maximumRows: 10,
  });
  assert.equal(second.rows[0].batch_id, "batch-two");
  assert.equal(second.rows[0].schema_version, "2.0.0");
  assert.equal(second.rows[0].state_encoding, TELEMETRY_STATE_ENCODING);
  assert.equal(second.rows[1].k, "st");
  assert.ok(second.rows[1].s, "the second isolated Blob must start from a full state");
});
