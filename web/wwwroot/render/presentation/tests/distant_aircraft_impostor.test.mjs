import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createDistantAircraftImpostor,
  createDistantAircraftState,
  fixedPixelWorldSize,
  projectedPixelSize,
  stepDistantAircraftState,
} from "../distant_aircraft_impostor.js";

test("fixed-pixel conversion is distance-independent after perspective projection", () => {
  const fov = 66 * Math.PI / 180;
  for (const depth of [100, 1000, 25000]) {
    const worldSize = fixedPixelWorldSize(8, depth, fov, 1080);
    assert.ok(Math.abs(projectedPixelSize(worldSize, depth, fov, 1080) - 8) < 1e-12);
  }
});

test("contact mode has a 10/14-pixel hysteresis band", () => {
  let state = createDistantAircraftState();
  state = stepDistantAircraftState(state,
    { projectedPixels: 9, deltaSeconds: 0.1, visible: true });
  assert.equal(state.active, true);
  state = stepDistantAircraftState(state,
    { projectedPixels: 12, deltaSeconds: 0.1, visible: true });
  assert.equal(state.active, true, "contact remains active inside the hysteresis band");
  state = stepDistantAircraftState(state,
    { projectedPixels: 14, deltaSeconds: 0.1, visible: true });
  assert.equal(state.active, false);
  state = stepDistantAircraftState(state,
    { projectedPixels: 12, deltaSeconds: 0.1, visible: true });
  assert.equal(state.active, false, "model remains active inside the band after the contact exits");
});

test("silhouette fades in before asking the caller to hide the real model", () => {
  let state = createDistantAircraftState();
  state = stepDistantAircraftState(state,
    { projectedPixels: 2, deltaSeconds: 0.05, visible: true }, { fadeSeconds: 0.1 });
  assert.equal(state.opacity, 0.5);
  assert.equal(state.modelVisible, true);
  state = stepDistantAircraftState(state,
    { projectedPixels: 2, deltaSeconds: 0.05, visible: true }, { fadeSeconds: 0.1 });
  assert.equal(state.opacity, 1);
  assert.equal(state.pixelSize, 8);
  assert.equal(state.modelVisible, false);
  state = stepDistantAircraftState(state,
    { projectedPixels: 20, deltaSeconds: 0.02, visible: true }, { fadeSeconds: 0.1 });
  assert.equal(state.modelVisible, true, "the authored model returns before the contact fades out");
});

test("Three impostor produces an 8-pixel contact without touching aircraft scale", () => {
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 100000);
  camera.position.set(0, 0, 0);
  camera.quaternion.identity();
  camera.updateMatrixWorld(true);
  const target = new THREE.Group();
  target.position.set(0, 0, -1000);
  target.scale.set(1, 1, 1);
  target.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  scene.add(target);
  const contact = createDistantAircraftImpostor(THREE);
  assert.equal(contact.material.fog, true);
  assert.match(contact.material.vertexShader, /logdepthbuf_vertex/);
  scene.add(contact.object3d);
  contact.update({
    camera,
    target,
    projectedPixels: 2,
    viewportHeight: 1080,
    deltaSeconds: 0.1,
  });
  const result = contact.update({
    camera,
    target,
    projectedPixels: 2,
    viewportHeight: 1080,
    deltaSeconds: 0.1,
  });
  assert.equal(result.pixelSize, 8);
  assert.equal(result.modelVisible, false);
  assert.equal(result.visible, true);
  assert.ok(Math.abs(projectedPixelSize(result.worldSize, result.cameraDepth,
    camera.fov * Math.PI / 180, 1080) - 8) < 1e-12);
  assert.deepEqual(target.scale.toArray(), [1, 1, 1]);
  contact.dispose();
  contact.dispose();
  assert.equal(contact.object3d.parent, null);
});

test("contacts behind the camera never become visible", () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const target = new THREE.Group();
  target.position.z = 100;
  target.updateMatrixWorld(true);
  const contact = createDistantAircraftImpostor(THREE);
  const result = contact.update({
    camera,
    target,
    projectedPixels: 1,
    viewportHeight: 500,
    deltaSeconds: 0.1,
  });
  assert.equal(result.visible, false);
  assert.equal(contact.object3d.visible, false);
  contact.dispose();
});
