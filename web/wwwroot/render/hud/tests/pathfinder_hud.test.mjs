import assert from "node:assert/strict";
import test from "node:test";
import { pathfinderHud, nextPathfinderSlot } from "../pathfinder_hud.js";

const relay = (id, live = true) => ({ id, relay_active: live, leak_fraction: 0,
  position: { x: 10, y: 20600, z: 30 },
  gondola_position: { x: 10, y: 20570, z: 30 } });
const state = (classification = "clear") => ({ pathfinder: {
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

test("manual relay cycling follows authored order including denied relays", () => {
  const input = state();
  assert.equal(nextPathfinderSlot(input), 1);
  input.pathfinder.selected_id = 3;
  assert.equal(nextPathfinderSlot(input), 2);
  input.pathfinder.selected_id = 5;
  assert.equal(nextPathfinderSlot(input), 0);
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
