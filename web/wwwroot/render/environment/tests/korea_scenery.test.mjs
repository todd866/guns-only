import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createKoreaSceneryRuntime,
  KOREA_SCENERY_PROFILES,
  planKoreaScenery,
} from "../korea_scenery.js";

function decodedFixture(waterValue = 0) {
  const sampleCount = 9;
  const heights = new Float32Array(sampleCount * sampleCount);
  const water = new Uint8Array(sampleCount * sampleCount).fill(waterValue);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      heights[north * sampleCount + east] = 32 + east * 0.3 + north * 0.2;
    }
  }
  return { sampleCount, heights, water };
}

function flatDecodedFixture(sampleCount = 33, heightM = 24) {
  return {
    sampleCount,
    heights: new Float32Array(sampleCount * sampleCount).fill(heightM),
    water: new Uint8Array(sampleCount * sampleCount),
  };
}

function chunkFixture() {
  return {
    id: "e0001-n0002",
    boundsLocalM: [0, 0, 1_000, 1_000],
    generation: { seed: 123456789, landFraction: 1 },
  };
}

test("plans deterministic scenery while keeping eras materially distinct", () => {
  const chunk = chunkFixture();
  const decoded = decodedFixture();
  const first = planKoreaScenery(chunk, decoded, { era: "1950s", qualityTier: "mobile" });
  const repeated = planKoreaScenery(chunk, decoded, { era: "1950s", qualityTier: "mobile" });
  const modern = planKoreaScenery(chunk, decoded, { era: "modern", qualityTier: "mobile" });
  assert.deepEqual(first, repeated);
  assert.notEqual(first.seed, modern.seed);
  assert.ok(modern.trees.length > first.trees.length);
  assert.ok(modern.buildings.length > first.buildings.length);
  assert.ok(first.fields.length > modern.fields.length);
  assert.ok(first.fieldRows.every((row) => row.widthM <= 1.4));
  assert.ok(modern.roads.every((road) => road.widthM >= 5.8));
  assert.equal(KOREA_SCENERY_PROFILES["1950s"].highRiseChance, 0);
  assert.ok(KOREA_SCENERY_PROFILES.modern.highRiseChance > 0);
  assert.equal(KOREA_SCENERY_PROFILES["1950s"].roadMarkingColor, null);
  assert.ok(Number.isInteger(KOREA_SCENERY_PROFILES.modern.roadMarkingColor));

  const fullTile = { ...chunk, boundsLocalM: [0, 0, 8_192, 8_192] };
  const periodTile = planKoreaScenery(fullTile, decoded, {
    era: "1950s", qualityTier: "desktop",
  });
  const modernTile = planKoreaScenery(fullTile, decoded, {
    era: "modern", qualityTier: "desktop",
  });
  assert.ok(modernTile.trees.length > periodTile.trees.length);
  assert.ok(modernTile.buildings.length > periodTile.buildings.length);
});

test("generates continuous vector infrastructure and rare airfields without source downloads", () => {
  const decoded = flatDecodedFixture();
  const base = {
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 1, landFraction: 1 },
  };
  const west = planKoreaScenery({
    ...base, id: "e0000-n0000", eastIndex: 0, northIndex: 0,
  }, decoded, { era: "modern", qualityTier: "mobile" });
  const east = planKoreaScenery({
    ...base, id: "e0001-n0000", eastIndex: 1, northIndex: 0,
  }, decoded, { era: "modern", qualityTier: "mobile" });
  assert.ok(west.roads.length > 0);
  assert.deepEqual(west.roads.slice(0, 5), east.roads.slice(0, 5));
  assert.ok(west.powerPoles.length > 1);
  assert.equal(west.powerLines.length, west.powerPoles.length - 1);

  const rail = planKoreaScenery({
    ...base, id: "e0006-n0222", eastIndex: 6, northIndex: 222,
  }, decoded, { era: "1950s", qualityTier: "mobile" });
  assert.ok(rail.railSegments.length > 0);
  assert.ok(rail.railSegments.length <= 12);

  const airfield = planKoreaScenery({
    ...base, id: "e0053-n0761", eastIndex: 53, northIndex: 761,
  }, decoded, { era: "modern", qualityTier: "mobile" });
  assert.equal(airfield.airfieldCount, 1);
  assert.ok(airfield.runways.length > 0);
  assert.ok(airfield.runways.length <= 6);
});

test("never scatters scenery onto an all-water terrain tile", () => {
  const plan = planKoreaScenery(chunkFixture(), decodedFixture(1), {
    era: "modern",
    qualityTier: "desktop",
  });
  assert.equal(plan.trees.length, 0);
  assert.equal(plan.buildings.length, 0);
  assert.equal(plan.fields.length, 0);
  assert.equal(plan.fieldRows.length, 0);
  assert.equal(plan.roads.length, 0);
  assert.equal(plan.railSegments.length, 0);
  assert.equal(plan.runways.length, 0);
  assert.equal(plan.airfieldCount, 0);
  assert.equal(plan.powerPoles.length, 0);
  assert.equal(plan.powerLines.length, 0);
});

test("creates instanced, disposable scenery only for the closest terrain LOD", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "1950s",
    qualityTier: "mobile",
  });
  assert.equal(runtime.createTile(chunkFixture(), decodedFixture(), 1), null);
  const group = runtime.createTile(chunkFixture(), decodedFixture(), 0);
  assert.ok(group);
  assert.equal(group.userData.scenery.era, "1950s");
  assert.ok(group.userData.scenery.trees > 0);
  assert.ok(group.userData.scenery.fields > 0);
  assert.ok(group.userData.scenery.fieldRows > 0);
  assert.ok(group.userData.scenery.roadSegments > 0);
  assert.ok(group.children.every((child) => child.isInstancedMesh));
  let disposedInstances = 0;
  for (const child of group.children) {
    child.addEventListener("dispose", () => disposedInstances++);
  }
  const instanceBatches = group.children.length;
  runtime.disposeTile(group);
  assert.equal(disposedInstances, instanceBatches);
  runtime.dispose();
  runtime.dispose();
  assert.equal(runtime.createTile(chunkFixture(), decodedFixture(), 0), null);
});

test("renders modern transport and power batches as instanced closest-LOD geometry", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "modern",
    qualityTier: "mobile",
  });
  const group = runtime.createTile({
    id: "e0000-n0000",
    eastIndex: 0,
    northIndex: 0,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 1, landFraction: 1 },
  }, flatDecodedFixture(), 0);
  const names = new Set(group.children.map((child) => child.name));
  assert.ok(names.has("PROCEDURAL_MODERN_ROADS"));
  assert.ok(names.has("PROCEDURAL_ROAD_MARKINGS"));
  assert.ok(names.has("PROCEDURAL_MODERN_POWER_POLES"));
  assert.ok(names.has("PROCEDURAL_POWER_LINES"));
  assert.ok(group.userData.scenery.powerPoles <= 10);
  assert.ok(group.children.every((child) => child.isInstancedMesh));
  runtime.dispose();
});

// Field rows and road markings derive their Y from the very slab they decorate, so they sit a
// fixed 7.5 mm above its top face on every terrain. The production camera (near 0.06, far 680000)
// resolves 8.9 cm at 300 m and 99 cm at 1 km, so past ~90 m that pair is inside a single depth
// LSB and shimmers. The stacking order has to be asserted in depth-bias units, not in millimetres.
test("layers coplanar with their own parent slab carry a depth bias", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "modern",
    qualityTier: "mobile",
  });
  const group = runtime.createTile({
    id: "e0000-n0000",
    eastIndex: 0,
    northIndex: 0,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 1, landFraction: 1 },
  }, flatDecodedFixture(), 0);
  const decals = ["PROCEDURAL_FIELD_ROWS", "PROCEDURAL_ROAD_MARKINGS"];
  let checked = 0;
  for (const node of group.children) {
    if (!node.material || !node.name) continue;
    if (decals.includes(node.name)) {
      assert.equal(node.material.polygonOffset, true,
        `${node.name} must be depth-biased against the slab it decorates`);
      assert.ok(node.material.polygonOffsetUnits < 0,
        `${node.name} must be biased toward the viewer, not away`);
      checked++;
    }
    // The slabs themselves sit metres from the terrain by construction (mean of a footprint that
    // tolerates 13-21 m of relief), so biasing them would push buried slabs through hillsides.
    if (node.name === "PROCEDURAL_MODERN_ROADS" || node.name === "PROCEDURAL_FIELDS") {
      assert.notEqual(node.material.polygonOffset, true,
        `${node.name} must NOT be biased — its terrain separation is intersection, not precision`);
    }
  }
  assert.equal(checked, decals.length,
    "the fixture must produce both coplanar decal layers");
  runtime.dispose?.();
});
