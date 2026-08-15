import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createOkanaganHighway } from "../okanagan_highway.js";

const route = [
  { id: "one", position: { x: 0, y: 600, z: 0 }, radius_m: 600, target_speed_mps: 55 },
  { id: "turn", position: { x: 1_200, y: 720, z: 2_000 }, radius_m: 600, target_speed_mps: 60 },
  { id: "three", position: { x: -400, y: 800, z: 4_000 }, radius_m: 600, target_speed_mps: 62 },
];

test("the Okanagan highway connects every gate and retains a final visual after gate completion", () => {
  const scene = new THREE.Scene();
  const highway = createOkanaganHighway(scene);
  highway.update(route, 0);
  assert.equal(highway.group.children.filter((child) => child.name.startsWith("route-gate:")).length, 3);
  assert.equal(highway.group.children.filter((child) => child.name.startsWith("route-corridor:")).length, 2);
  highway.update(route, route.length);
  const finalGate = highway.group.children.find((child) => child.name === "route-gate:three");
  assert.equal(finalGate.visible, true, "the visual route must not drop out before phase handoff");
  assert.ok(finalGate.children.some((child) => child.material?.opacity > 0.9),
    "the final active gate remains visually dominant");
  highway.dispose();
});
