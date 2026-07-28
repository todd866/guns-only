import test from "node:test";
import assert from "node:assert/strict";

import {
  TELEMETRY_JSONL_BYTE_LIMIT,
  TELEMETRY_REQUEST_BYTE_LIMIT,
  buildTelemetryBatch,
  retainNewestTelemetryRows,
  retainTelemetryRowsUnderBackpressure,
  utf8ByteLength,
} from "../telemetry_batch.js";

function representativeCarrierState(tick) {
  // WebBridge currently projects roughly 250 fields during carrier operations. Long descriptive
  // values plus bounded event/tracer arrays make this deliberately representative of that live
  // shape rather than the tiny rows used by the HTTP unit tests.
  const state = Object.fromEntries(Array.from({ length: 246 }, (_, index) => [
    `carrier_system_field_${String(index).padStart(3, "0")}`,
    index % 5 === 0 ? `PROVISIONAL_KOREA_JET_VALUE_${tick}_${index}` : tick + index / 1000,
  ]));
  state.tick = tick;
  state.context = "TRAP · WIRE 3 · FLY THROUGH — DO NOT FLARE";
  state.recent_events = Array.from({ length: 8 }, (_, index) => ({
    sequence: tick + index,
    type: "IMPACT",
    surface: "FLIGHT_DECK",
    outcome: "NONE",
  }));
  state.tracers = Array.from({ length: 18 }, (_, index) => [
    index + 0.123, 1400.456, -900.789, 12.3, -4.5, 820.6,
  ]);
  return state;
}

test("large carrier traces split into bounded ordered requests without losing rows", () => {
  const source = Array.from({ length: 600 }, (_, index) => ({
    k: "st",
    t: index * 50,
    build: "release-test",
    held: [],
    s: representativeCarrierState(index * 6),
  }));
  assert.ok(utf8ByteLength(JSON.stringify({ session: "large", rows: source }))
    > TELEMETRY_REQUEST_BYTE_LIMIT, "fixture must reproduce the former oversized 30-second batch");

  const recovered = [];
  const sizes = [];
  let queued = source;
  while (queued.length > 0) {
    const batch = buildTelemetryBatch({
      session: "large",
      batchId: `batch-large-${sizes.length.toString().padStart(4, "0")}`,
      rows: queued,
    });
    assert.ok(batch.rows.length > 0, "a valid queue must always make progress");
    assert.equal(batch.droppedRows, 0);
    assert.ok(batch.requestBytes <= TELEMETRY_REQUEST_BYTE_LIMIT);
    assert.ok(batch.jsonlBytes <= TELEMETRY_JSONL_BYTE_LIMIT);
    assert.equal(utf8ByteLength(batch.payload), batch.requestBytes);
    assert.deepEqual(JSON.parse(batch.payload).rows, batch.rows);
    recovered.push(...batch.rows);
    sizes.push(batch.requestBytes);
    queued = batch.remainingRows;
  }

  assert.deepEqual(recovered, source);
  assert.ok(sizes.length > 1, "representative flight must drain through multiple immutable chunks");
});

test("an unsplittable or unserializable head row is dropped and cannot wedge later data", () => {
  const circular = { k: "st" };
  circular.self = circular;
  const valid = { k: "st", s: { tick: 6, note: "valid after poison rows" } };
  const batch = buildTelemetryBatch({
    session: "poison",
    batchId: "batch-poison-0001",
    rows: [
      { k: "st", huge: "한".repeat(TELEMETRY_REQUEST_BYTE_LIMIT) },
      circular,
      valid,
    ],
  });

  assert.equal(batch.droppedRows, 2);
  assert.deepEqual(batch.rows, [valid]);
  assert.deepEqual(batch.remainingRows, []);
  assert.ok(batch.requestBytes <= TELEMETRY_REQUEST_BYTE_LIMIT);
});

test("UTF-8 byte accounting, rather than JavaScript character count, sets the boundary", () => {
  const row = { k: "ctx", value: "한글✈".repeat(1000) };
  const batch = buildTelemetryBatch({
    session: "unicode",
    batchId: "batch-unicode-001",
    rows: [row],
    maximumRequestBytes: utf8ByteLength(JSON.stringify({
      session: "unicode",
      batchId: "batch-unicode-001",
      rows: [row],
    })),
  });
  assert.deepEqual(batch.rows, [row]);
  assert.equal(batch.requestBytes, utf8ByteLength(batch.payload));
  assert.ok(batch.requestBytes > batch.payload.length);
});

test("AI compute transitions retain their effective authority ticks through serialization", () => {
  const rows = [
    {
      k: "in",
      type: "perf",
      code: "AiComputeLevel",
      level: 2,
      initial: true,
      effective_authority_tick: 0,
    },
    {
      k: "in",
      type: "perf",
      code: "AiComputeLevel",
      level: 0,
      effective_authority_tick: 19,
    },
  ];
  const batch = buildTelemetryBatch({
    session: "ai-level-tape",
    batchId: "batch-ai-level-tape-0001",
    rows,
  });
  const decodedRows = JSON.parse(batch.payload).rows;

  assert.deepEqual(decodedRows, rows);
  assert.deepEqual(
    decodedRows.map((row) => [
      row.effective_authority_tick,
      row.level,
    ]),
    [[0, 2], [19, 0]],
  );
});

test("bounded queues retain the newest reconstruction trace", () => {
  const rows = Array.from({ length: 12 }, (_, tick) => ({ tick }));
  assert.deepEqual(retainNewestTelemetryRows(rows, 5).map((row) => row.tick), [7, 8, 9, 10, 11]);
  assert.equal(retainNewestTelemetryRows(rows, 0).length, 0);
});

test("backpressure retains and serializes the latest sortie AI baseline in order", () => {
  const oldBaseline = {
    k: "in",
    t: 0,
    sortie: "sortie-1",
    type: "perf",
    code: "AiComputeLevel",
    level: 0,
    cause: "sortie-initial",
    initial: true,
    effective_authority_tick: 0,
  };
  const currentBaseline = {
    k: "in",
    t: 20,
    sortie: "sortie-2",
    type: "perf",
    code: "AiComputeLevel",
    level: 2,
    cause: "sortie-initial",
    initial: true,
    effective_authority_tick: 240,
  };
  let queued = [
    oldBaseline,
    ...Array.from({ length: 4 }, (_, index) => ({ k: "ctx", t: index + 1 })),
    currentBaseline,
    ...Array.from({ length: 8 }, (_, index) => ({
      k: "in",
      t: 21 + index,
      sortie: "sortie-2",
      type: "input",
      code: `sample-${index}`,
    })),
  ];

  queued = retainTelemetryRowsUnderBackpressure(queued, 5);
  assert.equal(queued.length, 5);
  assert.equal(queued[0], currentBaseline,
    "the latest sortie baseline replaces only the oldest retained tail row");
  assert.deepEqual(queued.slice(1).map((row) => row.t), [25, 26, 27, 28]);
  assert.equal(queued.includes(oldBaseline), false);

  queued.push({
    k: "in",
    t: 29,
    sortie: "sortie-2",
    type: "input",
    code: "sample-8",
  });
  queued = retainTelemetryRowsUnderBackpressure(queued, 5);
  assert.deepEqual(queued.map((row) => row.t), [20, 26, 27, 28, 29],
    "repeated overflow remains bounded and chronological");

  const batch = buildTelemetryBatch({
    session: "ai-baseline-backpressure",
    batchId: "batch-ai-baseline-backpressure-0001",
    rows: queued,
  });
  const decodedRows = JSON.parse(batch.payload).rows;
  assert.equal(decodedRows.length, 5);
  assert.deepEqual(decodedRows, queued);
  assert.deepEqual(decodedRows[0], currentBaseline);
  assert.deepEqual(
    decodedRows.map((row) => row.t),
    [20, 26, 27, 28, 29],
  );
});
