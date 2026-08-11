import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld } from "../cobra_canyon_plan.js";
import {
  CAMP_EMBER_COLORS,
  CAMP_EMBER_LANDMARK_ID,
  campEmberFirebaseParts,
  createCampEmberFirebase,
  isCampEmberGroundSite,
} from "../cobra_camp_ember_firebase.js";
import { readFile } from "node:fs/promises";

const world = JSON.parse(await readFile(new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
), "utf8"));

test("Camp Ember firebase parts cover BF:V families without control-green", () => {
  const parts = campEmberFirebaseParts();
  assert.ok(parts.length >= 28, "firebase needs enough clutter to read as a base");
  const families = new Set(parts.map((part) => part.family));
  for (const family of ["psp", "sandbag", "tent", "fuel", "timber", "steel", "crate"]) {
    assert.ok(families.has(family), `missing family ${family}`);
  }
  for (const part of parts) {
    const [r, g, b] = part.color;
    // Control-green site disc was ~0x8fbf5a — refuse that hue family.
    assert.ok(!(g > 0.55 && g > r + 0.12 && g > b + 0.12),
      `${part.family} must not read as control-green`);
  }
  assert.ok(CAMP_EMBER_COLORS.psp[1] < 0.5);
});

test("createCampEmberFirebase places one merged mesh on the landmark", () => {
  const plan = planCobraCanyonWorld(world, { qualityTier: "balanced" });
  const firebase = createCampEmberFirebase(THREE, plan);
  assert.ok(firebase);
  assert.equal(firebase.drawCalls, 1);
  assert.ok(firebase.partCount >= 28);
  assert.equal(firebase.mesh.userData.cobraCanyon.landmarkId, CAMP_EMBER_LANDMARK_ID);
  assert.ok(firebase.mesh.material.vertexColors);
  assert.equal(firebase.mesh.castShadow, true);
  assert.equal(firebase.mesh.receiveShadow, true);
  const landmark = plan.landmarks.find((entry) => entry.id === CAMP_EMBER_LANDMARK_ID);
  assert.equal(firebase.mesh.position.x, landmark.positionLocalM[0]);
  assert.equal(firebase.mesh.position.z, -landmark.positionLocalM[2]);
});

test("Camp Ember ground sites are suppressed for the control disc", () => {
  assert.equal(isCampEmberGroundSite({
    id: "site.camp-ember.v1",
    landmark_id: "landmark.cobra-canyon.camp-ember.v1",
  }), true);
  assert.equal(isCampEmberGroundSite({
    id: "site.iron-bell-bridge.v1",
    landmark_id: "landmark.cobra-canyon.iron-bell-bridge.v1",
  }), false);
});
