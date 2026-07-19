import assert from "node:assert/strict";
import test from "node:test";
import { consumeRecentEvents } from "../session_event_cursor.js";

const sameTickDraw = [
  { sequence: 7, tick: 120, type: "HIT", source: "PLAYER", target: "OPPONENT", count: 1 },
  { sequence: 8, tick: 120, type: "HIT", source: "OPPONENT", target: "PLAYER", count: 1 },
  { sequence: 9, tick: 120, type: "DESTROYED", source: "PLAYER", target: "OPPONENT", count: 0 },
  { sequence: 10, tick: 120, type: "DESTROYED", source: "OPPONENT", target: "PLAYER", count: 0 },
  { sequence: 11, tick: 120, type: "SORTIE_FINISHED", source: "NONE", target: "NONE", count: 0, outcome: "DRAW" },
];

test("consumes a catch-up window once and preserves authoritative order", () => {
  const seen = [];
  const cursor = consumeRecentEvents(sameTickDraw, 6, (event) => seen.push(event.sequence));
  assert.equal(cursor, 11);
  assert.deepEqual(seen, [7, 8, 9, 10, 11]);

  const repeated = [];
  assert.equal(consumeRecentEvents(sameTickDraw, cursor, (event) => repeated.push(event)), 11);
  assert.deepEqual(repeated, []);
});

test("an empty restage window does not reset the session-lifetime cursor", () => {
  const seen = [];
  let cursor = consumeRecentEvents([], 11, (event) => seen.push(event.sequence));
  cursor = consumeRecentEvents([
    { sequence: 12, tick: 240, type: "HIT", source: "OPPONENT", target: "PLAYER", count: 1 },
  ], cursor, (event) => seen.push(event.sequence));
  assert.equal(cursor, 12);
  assert.deepEqual(seen, [12]);
});

test("ignores malformed, duplicate, and stale sequence values", () => {
  const seen = [];
  const cursor = consumeRecentEvents([
    null,
    { sequence: "not-a-number" },
    { sequence: 3, type: "STALE" },
    { sequence: 4, type: "NEXT" },
    { sequence: 4, type: "DUPLICATE" },
    { sequence: Number.MAX_SAFE_INTEGER + 1, type: "UNSAFE" },
  ], 3, (event) => seen.push(event.type));
  assert.equal(cursor, 4);
  assert.deepEqual(seen, ["NEXT"]);
});
