import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../../vendor/three.module.js";
import {
  createDamageSmokeTrail,
  nextDamageSmokeIndex,
  shouldEmitDamageSmoke,
} from "../damage_smoke_trail.js";

test("damage smoke ring wraps deterministically", () => {
  assert.equal(nextDamageSmokeIndex(0, 3), 1);
  assert.equal(nextDamageSmokeIndex(2, 3), 0);
});
test("damage smoke emission is rate limited", () => {
  assert.equal(shouldEmitDamageSmoke(Number.NEGATIVE_INFINITY, 1, 0.1), true);
  assert.equal(shouldEmitDamageSmoke(1, 1.05, 0.1), false);
  assert.equal(shouldEmitDamageSmoke(1, 1.11, 0.1), true);
});

test("runtime reuses one points buffer and clears births", () => {
  const trail = createDamageSmokeTrail(THREE, { capacity: 8, intervalSeconds: 0 });
  assert.equal(trail.emit(new THREE.Vector3(1, 2, 3), 1), true);
  assert.ok(trail.births.some((birth) => birth === 1));
  trail.update(2, new THREE.Color(0x7898a0), 0.000055, 2);
  assert.equal(trail.uniforms.uTime.value, 2);
  trail.clear();
  assert.equal(trail.births.every((birth) => birth === -1000), true);
  trail.dispose();
});
