import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createOkanaganWorldRoot, okanaganWorldToRender, okanaganRenderToWorld,
  setOkanaganCockpitCamera, lookAtOkanaganPoint,
} from "../okanagan_render_frame.js";

import { okanaganFlightState } from "../okanagan_hud_adapter.js";

const rad = degrees => degrees * Math.PI / 180;
const origin = { x: 1800, y: 850, z: -4300 };
function pose(heading, pitch = 0, roll = 0) {
  const camera = new THREE.PerspectiveCamera(67, 1.6, .25, 65000);
  setOkanaganCockpitCamera(camera, {
    position: origin, heading_rad: rad(heading), pitch_rad: rad(pitch), roll_rad: rad(roll),
  });
  camera.updateMatrixWorld(true);
  return camera;
}
function landmark(bearing) {
  // Geographic convention, independently of Three: clockwise heading from north.
  return new THREE.Vector3(origin.x + 1000 * Math.sin(rad(bearing)),
    origin.y + 2.25, origin.z + 1000 * Math.cos(rad(bearing)));
}
function projectedWorldPoint(point, camera) {
  const root = createOkanaganWorldRoot();
  const marker = new THREE.Object3D();
  marker.position.copy(point); root.add(marker); root.updateMatrixWorld(true);
  return marker.getWorldPosition(new THREE.Vector3()).project(camera);
}

test("a landmark clockwise of the nose is on the pilot's right at every compass heading", () => {
  for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const camera = pose(heading);
    const ahead = projectedWorldPoint(landmark(heading), camera);
    const right = projectedWorldPoint(landmark(heading + 10), camera);
    const left = projectedWorldPoint(landmark(heading - 10), camera);
    assert.ok(Math.abs(ahead.x) < 1e-10);
    assert.ok(right.x > .1, `heading ${heading}: right-bearing landmark appeared at ${right.x}`);
    assert.ok(left.x < -.1);
    assert.ok(right.z > -1 && right.z < 1);
  }
});

test("a clockwise turn moves a fixed landmark left across the windscreen", () => {
  const fixed = landmark(80);
  const before = projectedWorldPoint(fixed, pose(75));
  const after = projectedWorldPoint(fixed, pose(85));
  assert.ok(before.x > 0 && after.x < 0,
    "a right turn must sweep the outside world left, agreeing with the heading tape");
});

test("right bank lowers the pilot's right wing and nose-up lowers the horizon", () => {
  const camera = pose(35, 0, 20);
  const geographicRight = okanaganWorldToRender({x: Math.cos(rad(35)), y: 0, z: -Math.sin(rad(35))});
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  assert.ok(cameraRight.dot(geographicRight) > .9);
  assert.ok(cameraRight.y < -.3, "positive roll means the right wing is down");
  assert.ok(projectedWorldPoint(landmark(35), pose(35, 10)).y < -.1);
});

test("HUD projections, padlock and scenery all point to the same geographic target", () => {
  const camera = pose(140, 5, 12), target = landmark(155);
  const scenery = projectedWorldPoint(target, camera);
  const hud = okanaganWorldToRender(target).project(camera);
  assert.ok(scenery.distanceTo(hud) < 1e-10);
  lookAtOkanaganPoint(camera, target); camera.updateMatrixWorld(true);
  const locked = projectedWorldPoint(target, camera);
  assert.ok(Math.abs(locked.x) + Math.abs(locked.y) < 1e-10);
  assert.ok(locked.z > -1 && locked.z < 1);
});

test("render conversion preserves geography, altitude and distance for terrain queries", () => {
  const original = new THREE.Vector3(132, 720, -941);
  const copy = original.clone();
  const rendered = okanaganWorldToRender(original);
  assert.equal(rendered.y, original.y);
  assert.equal(rendered.length(), original.length());
  assert.deepEqual(okanaganRenderToWorld(rendered).toArray(), original.toArray());
  assert.deepEqual(original.toArray(), copy.toArray());
});


test("shared HUD flight-path velocity stays ahead and agrees with visible drift", () => {
  for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const camera = pose(heading);
    const current = { position: origin, tas_mps: 60, velocity: {
      x: 60 * Math.sin(rad(heading + 5)), y: 0,
      z: 60 * Math.cos(rad(heading + 5)),
    } };
    const state = okanaganFlightState(current);
    // The shared HUD consumes canonical velocity and makes this single Z conversion.
    const fpv = okanaganWorldToRender(origin).add(
      new THREE.Vector3(state.vx, state.vy, -state.vz).normalize().multiplyScalar(10000)
    ).project(camera);
    assert.ok(fpv.z > -1 && fpv.z < 1, `heading ${heading}: FPV behind the pilot`);
    assert.ok(fpv.x > 0.05, `heading ${heading}: rightward drift must appear right`);
  }
});
