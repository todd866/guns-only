import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import { geographicToWorld } from "../okanagan_world.js";
import { createOkanaganPracticeTarget } from "../okanagan_practice_target.js";

function angularWidthDeg(sizeM, rangeM) {
  return Math.atan(sizeM / rangeM) * (180 / Math.PI);
}

test("the lake practice drop is a landmark you can see from the scoop exit", () => {
  const scoopExit = geographicToWorld(49.875, -119.515, 430);
  const drop = geographicToWorld(49.888, -119.505, 342);
  const scene = new THREE.Scene();
  const target = createOkanaganPracticeTarget(scene);
  target.update({ x: drop.x, y: 342, z: drop.z }, true);
  const box = new THREE.Box3().setFromObject(target.group);
  const spanM = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const heightM = box.max.y - box.min.y;
  const rangeM = scoopExit.distanceTo(drop);
  assert.ok(target.group.visible);
  assert.ok(spanM >= 90, `practice mark was only ${spanM.toFixed(0)} m across`);
  assert.ok(heightM >= 22, "a pole or barge must clear the water so the mark has silhouette");
  assert.ok(
    angularWidthDeg(spanM, rangeM) >= 2.2,
    `mark ${spanM.toFixed(0)} m at ${rangeM.toFixed(0)} m is only `
      + `${angularWidthDeg(spanM, rangeM).toFixed(2)}° from the scoop`,
  );
});
