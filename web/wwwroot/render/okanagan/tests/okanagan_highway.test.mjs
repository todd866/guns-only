import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createOkanaganHighway,
  okanaganGuidanceContinuityKey,
} from "../okanagan_highway.js";

const route = [
  { id: "one", position: { x: 0, y: 600, z: 0 }, radius_m: 600, target_speed_mps: 55 },
  { id: "turn", position: { x: 1_200, y: 720, z: 2_000 }, radius_m: 600, target_speed_mps: 60 },
  { id: "three", position: { x: -400, y: 800, z: 4_000 }, radius_m: 600, target_speed_mps: 62 },
];

test("Okanagan uses the shared guidance path and retains a final visual after gate completion", () => {
  const scene = new THREE.Scene();
  const highway = createOkanaganHighway(scene);
  const position = { x: -500, y: 500, z: -300 };
  assert.ok(highway.update(route, 0, position) >= 3);
  assert.equal(highway.group.name, "Fire Boss shared guidance path");
  assert.ok(highway.group.children.some((child) => child.visible
    && ["procedure-volume", "rtb-chevron"].includes(child.userData.guidanceStyle)));
  assert.ok(highway.update(route, route.length, position) >= 1,
    "the final route cue must not drop out before phase handoff");
  assert.equal(highway.group.visible, true);
  highway.dispose();
});

test("advancing through one route preserves the highway continuity identity", () => {
  const identity = okanaganGuidanceContinuityKey(route);
  assert.equal(identity, "okanagan:one|turn|three");
  assert.equal(okanaganGuidanceContinuityKey(route), identity);
  assert.notEqual(okanaganGuidanceContinuityKey(route.slice(1)), identity,
    "a phase route replacement should still establish a new identity");
});
