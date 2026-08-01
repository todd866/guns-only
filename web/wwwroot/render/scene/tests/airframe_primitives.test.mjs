import assert from "node:assert/strict";
import test from "node:test";

import { RELEASE_BUILD } from "../../release/release_identity.js";
import {
  addSemanticSocket as sceneSocket,
  createLoftGeometry as sceneLoft,
  createPlanformGeometry as scenePlanform,
  makeMaterial as sceneMaterial,
} from "../scene_builders.js";

const {
  addSemanticSocket: sharedSocket,
  createLoftGeometry: sharedLoft,
  createPlanformGeometry: sharedPlanform,
  makeMaterial: sharedMaterial,
} = await import(`../airframe_primitives.js?v=${RELEASE_BUILD}`);

test("scene and definition-driven airframes use one shared primitive implementation", () => {
  assert.equal(sceneSocket, sharedSocket);
  assert.equal(sceneLoft, sharedLoft);
  assert.equal(scenePlanform, sharedPlanform);
  assert.equal(sceneMaterial, sharedMaterial);
});

test("shared airframe geometry remains finite and indexed", () => {
  const loft = sharedLoft([
    { rx: 0.2, ry: 0.3, y: 0, z: -1 },
    { rx: 0.4, ry: 0.5, y: 0.1, z: 1 },
  ], 8);
  const wing = sharedPlanform([
    [0, -1],
    [-2, 1],
    [2, 1],
  ]);
  assert.ok(loft.index.count > 0);
  assert.ok(wing.attributes.position.count > 0);
  assert.equal([...loft.attributes.position.array].every(Number.isFinite), true);
  assert.equal([...wing.attributes.position.array].every(Number.isFinite), true);
});
