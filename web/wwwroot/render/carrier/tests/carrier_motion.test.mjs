import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { applyCarrierRootPose } from "../carrier_motion.js";

const state = {
  cx: 120,
  cy: 19.75,
  cz: -440,
  cheading: 0.63,
  deck_pitch_deg: 4.5,
};

test("deck pose consumes simulated heave, heading, and positive bow-up pitch", () => {
  const root = new THREE.Group();
  applyCarrierRootPose(THREE, root, state, { followPitch: true });

  assert.deepEqual(root.position.toArray(), [120, 19.75, 440]);
  const bowDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
  assert.ok(bowDirection.y > 0.07, "positive deck pitch must raise the local -Z bow");
});

test("water pose follows carrier position and yaw while remaining level at sea height", () => {
  const root = new THREE.Group();
  applyCarrierRootPose(THREE, root, state, { seaLevel: true });

  assert.deepEqual(root.position.toArray(), [120, 0, 440]);
  const waterNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion);
  assert.ok(waterNormal.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12);

  const expectedForward = new THREE.Vector3(Math.sin(state.cheading), 0, -Math.cos(state.cheading));
  const renderedForward = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
  assert.ok(renderedForward.distanceTo(expectedForward) < 1e-12);
});

test("the production view keeps authored recovery dynamics separate from the GLB and water", async () => {
  const source = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.match(source,
    /applyCarrierRootPose\(THREE, carrierRoot, state, \{\s*followPitch: true,/s,
    "the live carrier hull must consume deck_pitch_deg through the tested deck pose");
  assert.match(source,
    /applyCarrierRootPose\(THREE, runtime\.water\.group, state, \{\s*seaLevel: true,/s,
    "wake and spray must use the tested level water pose");
  assert.match(source, /hideAuthoredCarrierRecoveryNodes\(carrier\);/,
    "authored fixed wires must yield to the simulation-driven overlay");
});
