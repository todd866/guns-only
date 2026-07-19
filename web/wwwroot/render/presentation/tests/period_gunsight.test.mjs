import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  attachPeriodGunsightToSemanticAnchor,
  collimatedAngularCoordinates,
  createGunsightVisibilityState,
  createPeriodGunsight,
  infiniteReticleIntersection,
  stepGunsightVisibility,
} from "../period_gunsight.js";

const basis = {
  forward: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
};

test("collimated reticle remains a fixed aim direction as the eye moves", () => {
  const direction = { x: 0, y: 0, z: -1 };
  const planeOrigin = { x: 0, y: 0, z: -1 };
  const planeNormal = { x: 0, y: 0, z: 1 };
  const leftEyeHit = infiniteReticleIntersection(
    { x: -0.05, y: 0.02, z: 0 }, direction, planeOrigin, planeNormal);
  const rightEyeHit = infiniteReticleIntersection(
    { x: 0.05, y: -0.01, z: 0 }, direction, planeOrigin, planeNormal);
  assert.deepEqual(leftEyeHit, { x: -0.05, y: 0.02, z: -1 });
  assert.deepEqual(rightEyeHit, { x: 0.05, y: -0.01, z: -1 });
  assert.deepEqual(collimatedAngularCoordinates(direction, basis), { x: 0, y: 0, inFront: true });
});

test("angular coordinates reject rays behind the optical boresight", () => {
  assert.equal(collimatedAngularCoordinates({ x: 0, y: 0, z: 1 }, basis).inFront, false);
  const offset = collimatedAngularCoordinates({ x: 0.1, y: -0.05, z: -1 }, basis);
  assert.ok(Math.abs(offset.x - 0.1) < 1e-12);
  assert.ok(Math.abs(offset.y + 0.05) < 1e-12);
});

test("gunsight power and replay lifecycle fades deterministically", () => {
  const state = createGunsightVisibilityState();
  stepGunsightVisibility(state, { primary_bus_powered: true }, 0.06, { fadeSeconds: 0.12 });
  assert.equal(state.opacity, 0.5);
  stepGunsightVisibility(state, { primary_bus_powered: true }, 0.06, { fadeSeconds: 0.12 });
  assert.equal(state.opacity, 1);
  stepGunsightVisibility(state, { replay_external: true }, 0.03, { fadeSeconds: 0.12 });
  assert.equal(state.opacity, 0.75);
  stepGunsightVisibility(state, { primary_bus_powered: false }, 0.09, { fadeSeconds: 0.12 });
  assert.equal(state.opacity, 0);
});

test("period gunsight attaches only through the supplied semantic resolver and disposes", () => {
  const cockpit = new THREE.Group();
  const anchor = new THREE.Object3D();
  anchor.name = "SOCKET_GUNSIGHT_ORIGIN";
  cockpit.add(anchor);
  const gunsight = createPeriodGunsight(THREE);
  assert.match(gunsight.material.fragmentShader, /logdepthbuf_fragment/);
  const scene = new THREE.Scene();
  scene.add(cockpit, gunsight.object3d);
  assert.equal(attachPeriodGunsightToSemanticAnchor(
    gunsight,
    (semanticId) => semanticId === "gunsight.origin" ? anchor : null,
  ), true);
  assert.equal(gunsight.anchor, anchor);
  assert.equal(gunsight.object3d.parent, scene,
    "presentation resources stay outside the disposable cockpit asset subtree");
  const camera = new THREE.PerspectiveCamera();
  anchor.position.set(1, 2, 3);
  scene.updateMatrixWorld(true);
  gunsight.update(camera, { primary_bus_powered: true }, 0.1);
  assert.ok(gunsight.uniforms.uOpacity.value > 0);
  assert.ok(gunsight.object3d.position.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-12);
  assert.ok(gunsight.uniforms.uBoresightForward.value.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-12);
  gunsight.dispose();
  gunsight.dispose();
  assert.equal(gunsight.disposed, true);
  assert.equal(gunsight.object3d.parent, null);
});
