import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld } from "../cobra_canyon_plan.js";
import {
  CAMP_EMBER_COLORS,
  CAMP_EMBER_DEPARTURE_YAW_RAD,
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
  assert.equal(firebase.mesh.rotation.y, CAMP_EMBER_DEPARTURE_YAW_RAD);
});

test("Camp Ember opens a rotor-clear eastbound departure lane", () => {
  // AH-1G rotor diameter is 13.4 m, but the launch lane is a fuselage/skid corridor: the rotor
  // disc rises above these sub-3 m props. Preserve at least 5.5 m each side of the centreline.
  const minimumHalfWidthM = 5.5;
  let checked = 0;
  for (const part of campEmberFirebaseParts()) {
    if (part.y + part.heightM * 0.5 <= 0.5) continue; // apron paint is allowed under the aircraft
    const yaw = part.yaw + CAMP_EMBER_DEPARTURE_YAW_RAD;
    const centreForwardM = part.z;
    const centreLateralM = -part.x;
    const forwardExtentM = Math.abs(Math.cos(yaw)) * part.widthM * 0.5
      + Math.abs(Math.sin(yaw)) * part.depthM * 0.5;
    if (centreForwardM + forwardExtentM <= 2) continue; // structures wholly behind the skids
    const lateralExtentM = Math.abs(Math.sin(yaw)) * part.widthM * 0.5
      + Math.abs(Math.cos(yaw)) * part.depthM * 0.5;
    const clearHalfWidthM = Math.abs(centreLateralM) - lateralExtentM;
    assert.ok(clearHalfWidthM >= minimumHalfWidthM,
      `${part.family} narrows the eastbound lane to ${clearHalfWidthM.toFixed(2)} m`);
    checked += 1;
  }
  assert.ok(checked >= 10, "the clearance contract must cover the forward firebase clutter");
});

test("Camp Ember PSP is a terrain-seated plate, not a skid-swallowing slab", () => {
  const pads = campEmberFirebaseParts().filter((part) => part.family === "psp");
  assert.ok(pads.length >= 5);
  const highestTopM = Math.max(...pads.map((part) => part.y + part.heightM * 0.5));
  assert.ok(highestTopM <= 0.04, `PSP top ${highestTopM.toFixed(3)} m must stay at apron datum`);
});

test("merged firebase geometry keeps centre-authored pads, berms and mast on the ground", () => {
  const plan = planCobraCanyonWorld(world, { qualityTier: "balanced" });
  const firebase = createCampEmberFirebase(THREE, plan);
  const parts = campEmberFirebaseParts();
  const positions = firebase.mesh.geometry.getAttribute("position");
  const verticesPerBox = 36;
  assert.equal(positions.count, parts.length * verticesPerBox);
  const yBoundsFor = (partIndex) => {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let vertex = partIndex * verticesPerBox;
      vertex < (partIndex + 1) * verticesPerBox;
      vertex++) {
      minimum = Math.min(minimum, positions.getY(vertex));
      maximum = Math.max(maximum, positions.getY(vertex));
    }
    return { minimum, maximum };
  };
  const primaryPad = yBoundsFor(0);
  assert.ok(Math.abs(primaryPad.minimum + 0.06) < 1e-6);
  assert.ok(Math.abs(primaryPad.maximum - 0.02) < 1e-6);
  const bermIndex = parts.findIndex((part) => part.family === "sandbag" && part.heightM === 2.2);
  const berm = yBoundsFor(bermIndex);
  assert.ok(Math.abs(berm.minimum) < 1e-6);
  assert.ok(Math.abs(berm.maximum - 2.2) < 1e-6);
  const mastIndex = parts.findIndex((part) => part.family === "steel" && part.heightM === 17);
  const mast = yBoundsFor(mastIndex);
  assert.ok(Math.abs(mast.minimum) < 1e-6);
  assert.ok(Math.abs(mast.maximum - 17) < 1e-6);
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
