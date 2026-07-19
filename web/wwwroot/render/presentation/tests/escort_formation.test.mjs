import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  applyEscortFormationPose,
  escortFormationPose,
} from "../escort_formation.js";

test("northbound port-quarter station converts simulation north into negative render Z", () => {
  const pose = escortFormationPose({ cx: 100, cz: 200, cheading: 0 });
  assert.deepEqual(pose.position, { x: -420, y: 0, z: 700 });
  assert.equal(pose.yawRadians, 0);
});

test("eastbound formation rotates both station and Three heading", () => {
  const root = new THREE.Group();
  const pose = applyEscortFormationPose(THREE, root,
    { cx: 0, cz: 0, cheading: Math.PI / 2 },
    { station: "starboard-quarter", waterlineY: 1.5 });
  assert.ok(root.position.distanceTo(new THREE.Vector3(-1120, 1.5, 640)) < 1e-10);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
  assert.ok(forward.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
  assert.equal(pose.station, "starboard-quarter");
});
