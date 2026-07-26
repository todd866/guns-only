import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createOneWayAttackDrone } from "../../scene/scene_builders.js";

test("fictional raid drone is a canopy-free single-engine 5.5 metre training silhouette", () => {
  const drone = createOneWayAttackDrone();
  const size = new THREE.Box3().setFromObject(drone).getSize(new THREE.Vector3());
  const truth = drone.userData.trainingTarget;

  assert.ok(Math.abs(size.x - 5.5) < 0.08,
    `visual span ${size.x.toFixed(3)} m must match the 5.5 m simulation/gunsight truth`);
  assert.ok(size.z > 4.3 && size.z < 4.7);
  assert.equal(truth.fictional, true);
  assert.equal(truth.crewed, false);
  assert.equal(truth.engineCount, 1);
  assert.equal(truth.wingSpanM, 5.5);
  assert.equal(truth.carriesGroundWeapon, false);
  assert.ok(drone.getObjectByName("TRAINING_DRONE_SINGLE_ENGINE_BODY"));
  assert.ok(drone.getObjectByName("TRAINING_DRONE_SINGLE_EXHAUST"));
  assert.equal(drone.children.some((child) => /canopy/i.test(child.name)), false);
});
