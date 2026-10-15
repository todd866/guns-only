import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createSu27,
  su27LevelBudgets,
  SU27_FAR_LOD_DISTANCE_M,
  SU27_LENGTH_M,
  SU27_PRESENTATION_ID,
  SU27_SPAN_M,
} from "../su27_surrogate.js";

test("Su-27 surrogate is built at published overall dimensions, not range-scaled", () => {
  const jet = createSu27();
  const size = new THREE.Box3().setFromObject(jet).getSize(new THREE.Vector3());
  assert.equal(SU27_PRESENTATION_ID, "presentation.vehicle.su27s.public-data-surrogate.v1");
  assert.ok(Math.abs(size.z - SU27_LENGTH_M) < 0.01, `length ${size.z}`);
  assert.ok(Math.abs(size.x - SU27_SPAN_M) < 0.01, `span ${size.x}`);
  // Fin tips to ventral fins; the published 5.93 m height includes the landing gear.
  assert.ok(size.y > 4.2 && size.y < 5.2, `height ${size.y}`);
  assert.deepEqual(jet.scale.toArray(), [1, 1, 1]);
});

test("aircraft local -Z is forward: radome ahead of the origin, tail sting behind it", () => {
  const jet = createSu27();
  const box = new THREE.Box3().setFromObject(jet);
  assert.ok(box.min.z < -10.5 && box.max.z > 10.0, `${box.min.z} .. ${box.max.z}`);
  // Twin fins stand above the body, outboard of the centreline, at the tail.
  const near = jet.getObjectByName("SU27_LOD0_BODY").geometry.attributes.position;
  let finTop = null;
  for (let i = 0; i < near.count; i++) {
    if (finTop === null || near.getY(i) > near.getY(finTop)) finTop = i;
  }
  assert.ok(Math.abs(near.getX(finTop)) > 1.8, "highest point is a fin outboard of centre");
  assert.ok(near.getZ(finTop) > 5, "fin tips are aft");
});

test("bounded LOD: near body + canopy, single-draw far body, both within fighter budget", () => {
  const jet = createSu27();
  const lod = jet.getObjectByName("SU27_LOD");
  assert.ok(lod?.isLOD);
  const budgets = su27LevelBudgets(jet);
  assert.equal(budgets.length, 2);
  assert.equal(budgets[0].distance, 0);
  assert.equal(budgets[1].distance, SU27_FAR_LOD_DISTANCE_M);
  assert.ok(budgets[0].triangles <= 2500 && budgets[0].drawCalls <= 2, JSON.stringify(budgets[0]));
  assert.ok(budgets[1].triangles <= 1500 && budgets[1].drawCalls === 1, JSON.stringify(budgets[1]));
  assert.ok(budgets[1].triangles < budgets[0].triangles);
});

test("near body and canopy remain visible through gun range approaching and receding", () => {
  const jet = createSu27();
  const lod = jet.getObjectByName("SU27_LOD");
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 10000);
  jet.updateMatrixWorld(true);
  // Start far away: the old 650 m switch retained FAR down to 572 m on approach.
  for (const distance of [2500, 1500, 650, 639, 630, 600, 300, 600, 650, 1500, 2500]) {
    camera.position.set(0, 0, distance);
    camera.updateMatrixWorld();
    lod.update(camera);
    const near = distance < 2500;
    assert.equal(lod.getCurrentLevel(), near ? 0 : 1, `range ${distance}`);
    assert.equal(jet.getObjectByName("SU27_LOD0").visible, near, `near body + canopy at ${distance}`);
    assert.equal(jet.getObjectByName("SU27_LOD1_BODY").visible, !near, `far body at ${distance}`);
  }
});

test("LOD hysteresis holds detail state across jitter at both range boundaries", () => {
  const jet = createSu27();
  const lod = jet.getObjectByName("SU27_LOD");
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 10000);
  jet.updateMatrixWorld(true);
  for (const [distance, level] of [
    [300, 0], [1799, 0], [1800, 1], [1801, 1], [1799, 1],
    [1585, 1], [1584, 1], [1583, 0], [1585, 0], [1799, 0], [1800, 1],
  ]) {
    camera.position.set(0, 0, distance);
    camera.updateMatrixWorld();
    lod.update(camera);
    assert.equal(lod.getCurrentLevel(), level, `range ${distance}`);
  }
});

test("geometry is finite, vertex-coloured, shadow-casting and shares one body material", () => {
  const jet = createSu27();
  const bodies = ["SU27_LOD0_BODY", "SU27_LOD1_BODY"].map((name) => jet.getObjectByName(name));
  assert.equal(bodies[0].material, bodies[1].material);
  assert.equal(bodies[0].material.vertexColors, true);
  jet.traverse((object) => {
    if (!object.isMesh) return;
    assert.equal(object.castShadow, true);
    for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    for (const value of object.geometry.attributes.normal.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(jet.userData.sockets.cockpitCamera);
  assert.ok(jet.userData.proceduralFallback);
});
