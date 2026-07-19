import test from "node:test";
import assert from "node:assert/strict";

import {
  TELEMETRY_JSONL_BYTE_LIMIT,
  TELEMETRY_REQUEST_BYTE_LIMIT,
  buildTelemetryBatch,
  retainNewestTelemetryRows,
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

test("bounded queues retain the newest reconstruction trace", () => {
  const rows = Array.from({ length: 12 }, (_, tick) => ({ tick }));
  assert.deepEqual(retainNewestTelemetryRows(rows, 5).map((row) => row.tick), [7, 8, 9, 10, 11]);
  assert.equal(retainNewestTelemetryRows(rows, 0).length, 0);
});
