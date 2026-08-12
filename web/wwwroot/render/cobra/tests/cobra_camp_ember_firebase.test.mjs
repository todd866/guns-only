import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld } from "../cobra_canyon_plan.js";
import {
  CAMP_EMBER_COLORS,
  CAMP_EMBER_DEPARTURE_YAW_RAD,
  CAMP_EMBER_LANDMARK_ID,
  CAMP_EMBER_SPAWN_SAFETY_VOLUME,
  campEmberFirebaseParts,
  createCampEmberFirebase,
  isCampEmberGroundSite,
} from "../cobra_camp_ember_firebase.js";
import { readFile } from "node:fs/promises";

const world = JSON.parse(await readFile(new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
), "utf8"));

function localBounds(part) {
  const halfWidthM = Math.abs(Math.cos(part.yaw)) * part.widthM * 0.5
    + Math.abs(Math.sin(part.yaw)) * part.depthM * 0.5;
  const halfDepthM = Math.abs(Math.sin(part.yaw)) * part.widthM * 0.5
    + Math.abs(Math.cos(part.yaw)) * part.depthM * 0.5;
  return {
    minimumX: part.x - halfWidthM,
    maximumX: part.x + halfWidthM,
    minimumY: part.centreY - part.heightM * 0.5,
    maximumY: part.centreY + part.heightM * 0.5,
    minimumZ: part.z - halfDepthM,
    maximumZ: part.z + halfDepthM,
  };
}

function overlaps(left, right) {
  return left.minimumX < right.maximumX && left.maximumX > right.minimumX
    && left.minimumY < right.maximumY && left.maximumY > right.minimumY
    && left.minimumZ < right.maximumZ && left.maximumZ > right.minimumZ;
}

test("Camp Ember firebase parts cover BF:V families without control-green", () => {
  const parts = campEmberFirebaseParts();
  assert.ok(parts.length >= 28, "firebase needs enough clutter to read as a base");
  const families = new Set(parts.map((part) => part.family));
  for (const family of ["psp", "sandbag", "tent", "hooch", "fuel", "timber", "steel", "crate"]) {
    assert.ok(families.has(family), `missing family ${family}`);
  }
  for (const part of parts) {
    const [r, g, b] = part.color;
    // Control-green site disc was ~0x8fbf5a — refuse that hue family.
    assert.ok(!(g > 0.55 && g > r + 0.12 && g > b + 0.12),
      `${part.family} must not read as control-green`);
  }
  assert.ok(CAMP_EMBER_COLORS.psp[1] < 0.5);
  assert.ok(new Set(parts.map((part) => part.color.join(","))).size >= 10,
    "firebase needs coherent material variation, not one flat block colour");
  assert.ok(parts.every((part) => Number.isFinite(part.centreY) && part.y === undefined),
    "all authored vertical positions use explicit centre semantics");
  assert.ok(parts.filter((part) => part.family === "tent" || part.family === "hooch")
    .every((part) => part.shape === "tent"), "canvas shelters must have pitched silhouettes");
  assert.ok(parts.filter((part) => part.family === "fuel")
    .every((part) => part.shape === "cylinder"), "fuel stores must read as drums");
  assert.ok(parts.filter((part) => part.family === "sandbag")
    .every((part) => part.shape === "revetment"
      && Math.max(part.widthM, part.depthM) <= 12),
  "sandbags must be low modular revetments, not giant boxes");
});

test("the firebase reads as a real FSB: scar, berm ring, rosettes, tracks, burns, bird revetments", () => {
  const parts = campEmberFirebaseParts();
  const byId = new Map(parts.map((part) => [part.id, part]));

  // The scar is the base (Granite): an irregular laterite fan under everything, inside
  // the 58 m flat contact apron so presentation never floats above the blend ring.
  const scar = byId.get("scar-apron");
  assert.ok(scar, "the laterite scar apron is the ground truth of the base");
  assert.equal(scar.shape, "fan");
  assert.ok(scar.surface === true);
  assert.ok(Array.isArray(scar.outline) && scar.outline.length >= 12,
    "the scar outline must be irregular, not a disc");
  for (const [x, z] of scar.outline) {
    assert.ok(Math.hypot(x, z) <= 56.5, `scar vertex ${x},${z} escapes the flat apron`);
  }

  // Berm ring with a gap at the eastbound departure mouth (local +z = east).
  const berm = parts.filter((part) => part.id.startsWith("berm-"));
  assert.ok(berm.length >= 12, `a berm ring needs segments, got ${berm.length}`);
  assert.ok(berm.every((part) => part.shape === "revetment"));
  assert.ok(!berm.some((part) =>
    part.z > 30 && Math.abs(part.x) < 12),
    "the departure mouth through the berm must stay open");

  // Two rosette positions (the FSB signature from the air): pit disc + radiating lobes.
  for (const rosette of ["rosette-0", "rosette-1"]) {
    const pit = byId.get(`${rosette}-pit`);
    assert.ok(pit && pit.surface === true, `${rosette} needs its pit disc`);
    const lobes = parts.filter((part) => part.id.startsWith(`${rosette}-lobe-`));
    assert.ok(lobes.length >= 6, `${rosette} needs radiating sandbag lobes`);
  }

  // Track spaghetti and burn scars are surfaces, never elevated geometry.
  assert.ok(parts.filter((part) => part.id.startsWith("track-")).length >= 3);
  const burns = parts.filter((part) => part.id.startsWith("burn-"));
  assert.ok(burns.length >= 2);
  assert.ok(burns.every((part) => part.surface === true
    && part.color[0] < 0.2 && part.color[1] < 0.2 && part.color[2] < 0.2));

  // Bunker mounds carry glinting PSP roofs (A Shau read).
  const bunkerRoofs = parts.filter((part) => part.id.startsWith("bunker-")
    && part.id.endsWith("-roof"));
  assert.ok(bunkerRoofs.length >= 3);

  // Bird revetments sit at the sim's spare stations: local +x = north, +z = east,
  // stations at north ±30 / east +6 (CobraAirframePool constants, pinned numerically).
  const north = byId.get("bird-revetment-0");
  const south = byId.get("bird-revetment-1");
  assert.ok(north && south, "the two spare Cobras need revetments");
  assert.equal(north.x, 30);
  assert.equal(north.z, 6);
  assert.equal(south.x, -30);
  assert.equal(south.z, 6);
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
    if (part.centreY + part.heightM * 0.5 <= 0.5) continue; // apron is allowed under aircraft
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

test("Camp Ember keeps a no-geometry safety volume around spawn, eye, skids and departure", () => {
  let minimumHorizontalClearanceM = Infinity;
  let checked = 0;
  for (const part of campEmberFirebaseParts()) {
    const bounds = localBounds(part);
    if (part.surface) {
      assert.ok(bounds.maximumY <= CAMP_EMBER_SPAWN_SAFETY_VOLUME.minimumY,
        `${part.id} surface rises into the spawn volume`);
      continue;
    }
    if (bounds.maximumY <= CAMP_EMBER_SPAWN_SAFETY_VOLUME.minimumY
      || bounds.minimumY >= CAMP_EMBER_SPAWN_SAFETY_VOLUME.maximumY) continue;
    assert.equal(overlaps(bounds, CAMP_EMBER_SPAWN_SAFETY_VOLUME), false,
      `${part.id} intersects the authored spawn/eye/skid safety volume`);
    const gapX = Math.max(
      CAMP_EMBER_SPAWN_SAFETY_VOLUME.minimumX - bounds.maximumX,
      bounds.minimumX - CAMP_EMBER_SPAWN_SAFETY_VOLUME.maximumX,
      0,
    );
    const gapZ = Math.max(
      CAMP_EMBER_SPAWN_SAFETY_VOLUME.minimumZ - bounds.maximumZ,
      bounds.minimumZ - CAMP_EMBER_SPAWN_SAFETY_VOLUME.maximumZ,
      0,
    );
    minimumHorizontalClearanceM = Math.min(minimumHorizontalClearanceM, Math.hypot(gapX, gapZ));
    checked += 1;
  }
  assert.ok(checked >= 30);
  assert.ok(minimumHorizontalClearanceM >= 3.5,
    `elevated scenery clears the safety volume by only ${minimumHorizontalClearanceM.toFixed(2)} m`);
});

test("authored ammo and supply crates never interpenetrate", () => {
  const crates = campEmberFirebaseParts().filter((part) => part.family === "crate");
  assert.ok(crates.length >= 7);
  for (let left = 0; left < crates.length; left++) {
    for (let right = left + 1; right < crates.length; right++) {
      assert.equal(overlaps(localBounds(crates[left]), localBounds(crates[right])), false,
        `${crates[left].id} intersects ${crates[right].id}`);
    }
  }
});

test("Camp Ember PSP is a terrain-seated plate, not a skid-swallowing slab", () => {
  const pads = campEmberFirebaseParts().filter((part) => part.family === "psp");
  assert.ok(pads.length >= 5);
  const highestTopM = Math.max(...pads.map((part) => part.centreY + part.heightM * 0.5));
  assert.ok(highestTopM <= 0.013 + 1e-9,
    `PSP top ${highestTopM.toFixed(3)} m must stay at apron datum`);
});

test("merged firebase geometry keeps centre-authored pads, berms and mast on the ground", () => {
  const plan = planCobraCanyonWorld(world, { qualityTier: "balanced" });
  const firebase = createCampEmberFirebase(THREE, plan);
  const parts = campEmberFirebaseParts();
  const positions = firebase.mesh.geometry.getAttribute("position");
  assert.equal(firebase.partVertexRanges.length, parts.length);
  const yBoundsFor = (partId) => {
    const range = firebase.partVertexRanges.find((entry) => entry.id === partId);
    assert.ok(range, `missing vertex range for ${partId}`);
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let vertex = range.start; vertex < range.start + range.count; vertex++) {
      minimum = Math.min(minimum, positions.getY(vertex));
      maximum = Math.max(maximum, positions.getY(vertex));
    }
    return { minimum, maximum };
  };
  const primaryPad = yBoundsFor("psp-main-bed");
  assert.ok(Math.abs(primaryPad.minimum + 0.02) < 1e-6);
  assert.ok(Math.abs(primaryPad.maximum) < 1e-6);
  const berm = yBoundsFor("revetment-main-0");
  assert.ok(Math.abs(berm.minimum) < 1e-6);
  assert.ok(Math.abs(berm.maximum - 1.1) < 1e-6);
  const mast = yBoundsFor("radio-mast");
  assert.ok(Math.abs(mast.minimum) < 1e-6);
  assert.ok(Math.abs(mast.maximum - 15) < 1e-6);
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
