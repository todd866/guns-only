import assert from "node:assert/strict";
import test from "node:test";
import { pathfinderHud, nextPathfinderSlot } from "../pathfinder_hud.js";

const relay = (id, live = true) => ({ id, relay_active: live, leak_fraction: 0,
  position: { x: 10, y: 20600, z: 30 },
  gondola_position: { x: 10, y: 20570, z: 30 } });
const state = (classification = "clear") => ({ px: 0, py: 0, pz: 0, pathfinder: {
  selected_id: 1, relays: [relay(1), relay(3), relay(5, false)],
  selected_footprint: { classification },
} });

test("one relay row distinguishes live/leaking from denied with symbols", () => {
  const input = state();
  input.pathfinder.relays[0].leak_fraction = 1;
  const hud = pathfinderHud(input);
  assert.equal(hud.row, "◇◇◆  F GUN");
  assert.equal(hud.row.includes("\n"), false);
  assert.match(hud.label, /Relay 1: live; Relay 3: live; Relay 5: denied/);
});

test("target anchor is the selected gondola, never its envelope", () => {
  const input = state();
  input.pathfinder.selected_id = 3;
  assert.equal(pathfinderHud(input).target, input.pathfinder.relays[1].gondola_position);
  assert.notEqual(pathfinderHud(input).target.y, input.pathfinder.relays[1].position.y);
});

test("only a known clear footprint clears ROE; town and unknown stay blocked", () => {
  for (const classification of ["populated", "unknown", undefined]) {
    const hud = pathfinderHud(state(classification === undefined ? null : classification));
    assert.equal(hud.blocked, true);
    assert.equal(hud.tag, "ROE");
  }
  assert.equal(pathfinderHud(state()).blocked, false);
  assert.equal(pathfinderHud(state()).tag, "");
});

test("kill clears the selected bracket without silently selecting another live relay", () => {
  const input = state("populated");
  input.pathfinder.relays[0].relay_active = false;
  const hud = pathfinderHud(input);
  assert.equal(hud.row, "◆◇◆  F GUN");
  assert.equal(hud.target, null);
  assert.equal(hud.blocked, false);
  assert.equal(hud.selectedId, 1);
});

test("first cycle selects the nearest live relay and preserves its original slot", () => {
  const input = state();
  input.pathfinder.relays[0].gondola_position = { x: 900, y: 0, z: 0 };
  input.pathfinder.relays[1].gondola_position = { x: 100, y: 0, z: 0 };
  assert.equal(nextPathfinderSlot(input, { startFromNearest: true }), 1);
  // Spawn already preselects the nearest actor: the first Tab must keep it,
  // rather than skipping directly to the 38 NM relay as before.
  input.pathfinder.selected_id = 3;
  assert.equal(nextPathfinderSlot(input, { startFromNearest: true }), 1);
  assert.equal(nextPathfinderSlot(input), 0);
});

test("subsequent cycles follow current range order, skip dead relays, and wrap", () => {
  const input = state();
  input.pathfinder.relays[0].gondola_position = { x: 900, y: 0, z: 0 };
  input.pathfinder.relays[1].gondola_position = { x: 100, y: 0, z: 0 };
  input.pathfinder.relays[2].gondola_position = { x: 10, y: 0, z: 0 };
  assert.equal(nextPathfinderSlot(input), 1);
  input.pathfinder.selected_id = 3;
  assert.equal(nextPathfinderSlot(input), 0);
  input.pathfinder.selected_id = 1;
  assert.equal(nextPathfinderSlot(input), 1);
  input.pathfinder.relays[1].relay_active = false;
  assert.equal(nextPathfinderSlot(input), 0);
});

test("ties retain authored slot order and missing or dead selection starts nearest", () => {
  const input = state();
  input.pathfinder.relays[0].gondola_position = { x: 100, y: 0, z: 0 };
  input.pathfinder.relays[1].gondola_position = { x: -100, y: 0, z: 0 };
  input.pathfinder.selected_id = 99;
  assert.equal(nextPathfinderSlot(input), 0);
  assert.equal(nextPathfinderSlot(input, { startFromNearest: true }), 0);
  input.pathfinder.selected_id = 5;
  assert.equal(nextPathfinderSlot(input), 0);
});

test("no live targets or invalid player and gondola positions return no slot", () => {
  const input = state();
  input.pathfinder.relays[0].relay_active = false;
  input.pathfinder.relays[1].relay_active = false;
  assert.equal(nextPathfinderSlot(input), null);
  input.pathfinder.relays[0].relay_active = true;
  input.pathfinder.relays[0].gondola_position.x = NaN;
  assert.equal(nextPathfinderSlot(input), null);
  input.pathfinder.relays[0].gondola_position.x = 10;
  input.px = Infinity;
  assert.equal(nextPathfinderSlot(input), null);
});

test("each live gondola keeps its small diamond when another relay is selected or denied", () => {
  const input = state();
  assert.deepEqual(pathfinderHud(input).markers.map(marker => marker.id), [1, 3]);
  input.pathfinder.relays[0].relay_active = false;
  assert.equal(pathfinderHud(input).target, null);
  assert.deepEqual(pathfinderHud(input).markers, [{ id: 3, position: input.pathfinder.relays[1].gondola_position }]);
  input.pathfinder.relays[1].gondola_position.x = NaN;
  assert.deepEqual(pathfinderHud(input).markers, []);
});

test("other missions, malformed positions and absent selection cannot manufacture a target", () => {
  assert.equal(pathfinderHud({}), null);
  assert.equal(nextPathfinderSlot({}), null);
  const input = state();
  input.pathfinder.relays[0].gondola_position.y = NaN;
  assert.equal(pathfinderHud(input).target, null);
  input.pathfinder.selected_id = 99;
  assert.equal(pathfinderHud(input).target, null);
});
