import test from "node:test";
import assert from "node:assert/strict";
import { cycleOkanaganTarget, okanaganTargets, retainOkanaganTarget } from "../okanagan_targets.js";

test("water circuits offer the lake practice drop as a target", () => {
  const targets = okanaganTargets({
    sortie: "water-circuits",
    active_gate: 0,
    route: [
      { id: "departure", label: "DEPART 16", position: { x: 1, y: 2, z: 3 } },
    ],
    drop_aim: { x: 40, y: 342, z: -80 },
  });
  assert.equal(targets.at(-1).id, "practice:drop");
  assert.equal(targets.at(-1).label, "PRACTICE DROP");
  assert.deepEqual(targets.at(-1).position, { x: 40, y: 342, z: -80 });
});

test("target cycle contains current procedure fixes, the incident, then traffic", () => {
  const targets = okanaganTargets({
    sortie: "fire-attack",
    active_gate: 1,
    route: [
      { id: "spent", label: "SPENT", position: { x: 0, y: 0, z: 0 } },
      { id: "target-entry", label: "TARGET ENTRY", position: { x: 1, y: 2, z: 3 } },
      { id: "drop-start", label: "START DROP", position: { x: 4, y: 5, z: 6 } },
    ],
    fire_cells: [{ x: 10, y: 800, z: 20, intensity: 0.8 }],
    traffic: [{ callsign: "BIRD DOG", position: { x: 30, y: 900, z: 40 } }],
  });
  assert.deepEqual(targets.map((target) => target.id), [
    "fix:target-entry", "fix:drop-start", "incident:fire", "traffic:BIRD DOG",
  ]);
  assert.equal(targets[2].label, "FIRE");
  assert.equal(targets[2].position.y, 1_220);
});

test("Tab wraps and phase changes retain a still-relevant target", () => {
  const targets = [
    { id: "fix:ip" }, { id: "incident:fire" }, { id: "fix:base" },
  ];
  assert.equal(cycleOkanaganTarget(targets, "fix:ip").id, "incident:fire");
  assert.equal(cycleOkanaganTarget(targets, "fix:base").id, "fix:ip");
  assert.equal(retainOkanaganTarget(targets, "incident:fire").id, "incident:fire");
  assert.equal(retainOkanaganTarget(targets, "missing").id, "fix:ip");
});
