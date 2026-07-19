import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_EVENT_STREAM_ID,
  PresentationEventStreams,
  presentationVector,
  terminalVisualEvents,
} from "../presentation_event_stream.js";

test("live and replay generations retain independent one-shot cursors", () => {
  const streams = new PresentationEventStreams();
  const live = [{ sequence: 9, type: "DESTROYED" }];
  assert.deepEqual(streams.consume(LIVE_EVENT_STREAM_ID, live).events, live);

  assert.equal(streams.switchTo("incident-replay:4:1"), true);
  assert.deepEqual(streams.consume("incident-replay:4:1", [
    { sequence: 9, type: "IMPACT" },
  ]).events.map((event) => event.type), ["IMPACT"],
  "an equal sequence on another timeline is not suppressed");
  assert.deepEqual(streams.consume("incident-replay:4:1", [
    { sequence: 9, type: "IMPACT" },
  ]).events, []);

  assert.equal(streams.switchTo(LIVE_EVENT_STREAM_ID), true);
  assert.deepEqual(streams.consume(LIVE_EVENT_STREAM_ID, live).events, [],
    "returning to live preserves its advanced cursor");
  assert.equal(streams.switchTo("incident-replay:4:2"), true);
  assert.deepEqual(streams.consume("incident-replay:4:2", [
    { sequence: 9, type: "IMPACT" },
  ]).events.length, 1, "Replay Again gets a fresh generation");
  assert.equal(streams.cursors.size, 2, "old replay generations are pruned");
});

test("same-tick collision facts coalesce but later physical impact remains visible", () => {
  const collision = [
    { sequence: 3, tick: 40, type: "IMPACT", target: "OPPONENT", surface: "WATER" },
    { sequence: 4, tick: 40, type: "DESTROYED", target: "OPPONENT", surface: "NONE" },
    { sequence: 5, tick: 70, type: "IMPACT", target: "PLAYER", surface: "FLIGHT_DECK" },
    { sequence: 6, tick: 80, type: "DESTROYED", target: "PLAYER", surface: "NONE" },
    { sequence: 7, tick: 90, type: "IMPACT", target: "PLAYER", surface: "WATER" },
  ];
  assert.deepEqual(terminalVisualEvents(collision).map((event) => event.sequence), [3, 5, 6, 7]);
});

test("simulation vectors enter the renderer frame with one Z flip", () => {
  assert.deepEqual(presentationVector([12, 3, -8]), [12, 3, 8]);
  assert.deepEqual(presentationVector({ x: -2, y: 4, z: 9 }), [-2, 4, -9]);
  assert.equal(presentationVector([1, Number.NaN, 2]), null);
});
