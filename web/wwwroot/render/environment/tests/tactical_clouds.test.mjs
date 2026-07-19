import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../../vendor/three.module.js";
import {
  cloudCellDescriptor,
  cloudDensityAt,
  createTacticalCloudField,
} from "../tactical_clouds.js";

test("cloud cells are deterministic and world anchored", () => {
  const first = cloudCellDescriptor(12, -7);
  const second = cloudCellDescriptor(12, -7);
  assert.deepEqual(first, second);
  assert.ok(Number.isFinite(first.x));
  assert.ok(Number.isFinite(first.y));
  assert.ok(Number.isFinite(first.z));
});
test("cloud density rises inside a present cloud and clears outside it", () => {
  const cloud = { present: true, x: 100, y: 1500, z: -200, width: 1800, height: 500 };
  assert.ok(cloudDensityAt({ x: 100, y: 1500, z: -200 }, [cloud]) > 0.95);
  assert.equal(cloudDensityAt({ x: 10000, y: 1500, z: -200 }, [cloud]), 0);
});

test("runtime builds one instanced cloud and shadow draw for its tier", () => {
  const field = createTacticalCloudField(THREE, { qualityTier: "mobile" });
  assert.equal(field.cloudMesh.count, 25);
  assert.equal(field.shadowMesh.count, 25);
  const extinction = field.update(new THREE.Vector3(0, 1450, 0), 2,
    new THREE.Color(0x7898a0), 0.000055);
  assert.ok(extinction >= 0 && extinction <= 1);
  assert.equal(field.descriptors.length, 25);
  field.dispose();
});
