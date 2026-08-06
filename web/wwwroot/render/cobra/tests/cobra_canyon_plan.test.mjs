import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COBRA_CANYON_PLAN_SCHEMA,
  COBRA_CANYON_PRESENTATION_KIT_SCHEMA,
  COBRA_CANYON_WORLD_SCHEMA,
  COBRA_CANYON_WORLD_URL,
  loadCobraCanyonWorld,
  planCobraCanyonWorld,
  sampleCobraCanyonTerrain,
  validateCobraCanyonWorld,
} from "../cobra_canyon_plan.js";

const WORLD_FILE = new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
);

async function rawWorld() {
  return JSON.parse(await readFile(WORLD_FILE, "utf8"));
}

function routeLengthM(route) {
  let lengthM = 0;
  for (let index = 1; index < route.pathLocalM.length; index++) {
    const previous = route.pathLocalM[index - 1];
    const current = route.pathLocalM[index];
    lengthM += Math.hypot(current[0] - previous[0], current[2] - previous[2]);
  }
  return lengthM;
}

function contentHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("validates the authored fictional 16 km basin and three public route contracts", async () => {
  const world = validateCobraCanyonWorld(await rawWorld());

  assert.equal(world.schema, COBRA_CANYON_WORLD_SCHEMA);
  assert.equal(world.worldId, "world.cobra-canyon.v1");
  assert.equal(world.epistemic, "fiction");
  assert.equal(world.period.fictional, true);
  assert.equal(world.boundsLocalM.maximumEastM - world.boundsLocalM.minimumEastM, 16_000);
  assert.equal(world.boundsLocalM.maximumNorthM - world.boundsLocalM.minimumNorthM, 16_000);
  assert.deepEqual(
    world.routeLanes.map((route) => route.id),
    [
      "route.cobra-canyon.river-gorge.v1",
      "route.cobra-canyon.ridge-shadow.v1",
      "route.cobra-canyon.road-plantation.v1",
    ],
  );
  assert.equal(world.terrain.ribbons.length, 3);
  assert.equal(world.heroCells.length, 3);
  for (const route of world.routeLanes) {
    assert.ok(routeLengthM(route) >= 12_000);
    assert.ok(route.landmarkIds.length >= 3);
    assert.ok(route.hazardIds.length >= 2);
    assert.equal(route.heroCellIds.length, 1);
  }
  assert.ok(Object.isFrozen(world));
  assert.ok(Object.isFrozen(world.routeLanes));
  assert.ok(Object.isFrozen(world.routeLanes[0].pathLocalM));
});

test("produces deterministic deeply frozen planner arrays and public metadata", async () => {
  const world = await rawWorld();
  const first = planCobraCanyonWorld(world, { qualityTier: "balanced" });
  const repeated = planCobraCanyonWorld(world, { qualityTier: "balanced" });

  assert.deepEqual(first, repeated);
  assert.equal(first.schema, COBRA_CANYON_PLAN_SCHEMA);
  assert.equal(first.worldId, "world.cobra-canyon.v1");
  assert.equal(first.qualityTier, "balanced");
  for (const field of [
    "terrainRibbons",
    "cells",
    "landmarks",
    "hazards",
    "setPieceCells",
    "ambientBatches",
  ]) {
    assert.ok(Array.isArray(first[field]), `${field} must be a plan array`);
    assert.ok(Object.isFrozen(first[field]), `${field} must be frozen`);
    assert.ok(first[field].every(Object.isFrozen), `${field} entries must be frozen`);
  }
  assert.ok(Object.isFrozen(first));
  assert.equal(first.presentationKit.schema, COBRA_CANYON_PRESENTATION_KIT_SCHEMA);
  assert.ok(Object.isFrozen(first.presentationKit));
  assert.ok(Object.isFrozen(first.presentationKit.ambientArchetypes));
  assert.ok(Object.isFrozen(first.presentationKit.landmarkArchetypes));
  assert.ok(Object.isFrozen(first.budget));
  assert.ok(Object.isFrozen(first.counts));
  assert.throws(() => {
    first.hazards.push({});
  }, TypeError);
});

test("keeps authority content invariant and sheds only ambient presentation by tier", async () => {
  const world = await rawWorld();
  const mobile = planCobraCanyonWorld(world, { qualityTier: "mobile" });
  const balanced = planCobraCanyonWorld(world, { qualityTier: "balanced" });
  const desktop = planCobraCanyonWorld(world, { qualityTier: "desktop" });

  for (const plan of [mobile, balanced, desktop]) {
    assert.equal(plan.terrainRibbons.length, 3);
    assert.equal(plan.cells.length, 3);
    assert.equal(plan.landmarks.length, 11);
    assert.equal(plan.hazards.length, 14);
    assert.equal(plan.presentationKit.ambientArchetypes.length, 11);
    assert.equal(plan.presentationKit.landmarkArchetypes.length, 11);
    assert.equal(plan.setPieceCells.length, 9);
    assert.ok(plan.counts.ambientArchetypes <= plan.budget.maxAmbientArchetypes);
    assert.ok(plan.counts.landmarkArchetypes <= plan.budget.maxLandmarkArchetypes);
    assert.ok(plan.counts.setPieceCells <= plan.budget.maxSetPieceCells);
    assert.ok(plan.counts.ambientBatches <= plan.budget.maxAmbientBatches);
    assert.ok(plan.counts.ambientInstances <= plan.budget.maxAmbientInstances);
    assert.ok(plan.counts.estimatedDrawCalls <= plan.budget.maxDrawCalls);
    assert.ok(plan.counts.shadowCasters <= plan.budget.maxShadowCasters);
  }
  assert.deepEqual(mobile.hazards, desktop.hazards);
  assert.deepEqual(mobile.landmarks, desktop.landmarks);
  assert.deepEqual(mobile.presentationKit, desktop.presentationKit);
  assert.deepEqual(mobile.setPieceCells, desktop.setPieceCells);
  assert.ok(mobile.counts.ambientBatches < desktop.counts.ambientBatches);
  assert.ok(mobile.counts.ambientInstances < balanced.counts.ambientInstances);
  assert.ok(balanced.counts.ambientInstances < desktop.counts.ambientInstances);
  assert.deepEqual(
    [mobile.counts.ambientInstances, balanced.counts.ambientInstances, desktop.counts.ambientInstances],
    [350, 794, 1582],
  );
  assert.throws(
    () => planCobraCanyonWorld(world, { qualityTier: "cinematic" }),
    /qualityTier must be one of/,
  );
});

test("tags every important item with stable authority and keeps ambient non-targetable", async () => {
  const world = validateCobraCanyonWorld(await rawWorld());
  const important = [
    ...world.terrain.ribbons,
    ...world.routeLanes,
    ...world.heroCells,
    ...world.landmarks,
    ...world.hazards,
    ...world.visualBands,
  ];
  const stableIds = new Set();
  for (const item of important) {
    assert.match(item.id, /^[a-z][a-z0-9.-]+\.v1$/);
    assert.ok(item.authority?.role?.endsWith("authority"));
    assert.equal(item.authority.sourceId, world.authoritySourceId);
    assert.equal(item.presentationOnly, false);
    assert.equal(item.targetable, false);
    assert.equal(stableIds.has(item.id), false, `${item.id} must be globally unique`);
    stableIds.add(item.id);
  }
  for (const batch of world.ambientBatches) {
    assert.match(batch.id, /^[a-z][a-z0-9.-]+\.v1$/);
    assert.equal(batch.authority.role, "presentation-only");
    assert.equal(batch.presentationOnly, true);
    assert.equal(batch.targetable, false);
    assert.equal(stableIds.has(batch.id), false, `${batch.id} must be globally unique`);
    stableIds.add(batch.id);
  }
  for (const item of [
    ...world.presentationKit.ambientArchetypes,
    ...world.presentationKit.landmarkArchetypes,
    ...world.setPieceCells,
  ]) {
    assert.match(item.id, /^[a-z][a-z0-9.-]+\.v1$/);
    assert.equal(item.authority.role, "presentation-only");
    assert.equal(item.authority.sourceId, world.authoritySourceId);
    assert.equal(item.presentationOnly, true);
    assert.equal(item.targetable, false);
    assert.equal(stableIds.has(item.id), false, `${item.id} must be globally unique`);
    stableIds.add(item.id);
  }
});

test("publishes a geometry-free visual kit and route-ordered authored reveals", async () => {
  const plan = planCobraCanyonWorld(await rawWorld(), { qualityTier: "mobile" });
  const ambientRoles = new Set(
    plan.presentationKit.ambientArchetypes.map((archetype) => archetype.renderRole),
  );
  assert.deepEqual(
    [...ambientRoles].sort(),
    ["jungle", "mist", "paddy", "plantation", "rock", "village", "water-accent"],
  );
  for (const archetype of plan.presentationKit.ambientArchetypes) {
    assert.ok(archetype.paletteHex.every((color) => /^#[0-9A-F]{6}$/i.test(color)));
    assert.ok(archetype.scaleM.width > 0);
    assert.ok(archetype.scaleM.height > 0);
    assert.ok(archetype.scaleM.depth > 0);
    assert.equal("geometry" in archetype, false);
    assert.equal("vertices" in archetype, false);
  }
  assert.deepEqual(
    new Set(plan.presentationKit.landmarkArchetypes.map((archetype) => archetype.authoredKind)),
    new Set(plan.landmarks.map((landmark) => landmark.kind)),
  );

  for (const route of plan.routeLanes) {
    const reveals = plan.setPieceCells.filter((cell) => cell.routeId === route.id);
    assert.equal(reveals.length, 3);
    assert.ok(reveals.every((cell) => cell.displayName && cell.approachLocalM.length === 3));
    assert.deepEqual(
      reveals.map((cell) => cell.distanceAlongRouteM),
      [...reveals].map((cell) => cell.distanceAlongRouteM).sort((left, right) => left - right),
    );
    assert.ok(reveals.at(-1).distanceAlongRouteM < routeLengthM(route));
  }
});

test("preserves route XYZ, terrain shaping, landmark anchors, and hazard authority byte-for-number", async () => {
  const world = await rawWorld();
  assert.equal(contentHash(world.routeLanes.map(({ id, pathLocalM }) => ({ id, pathLocalM }))),
    "fb315c285edc1a4154cfa4ec96c5dd848b82f3333c971b5f3ded292c6b4e8bef");
  assert.equal(contentHash({
    model: world.terrain.model,
    ribbons: world.terrain.ribbons.map(({
      id,
      laneId,
      pointsLocalM,
      halfWidthM,
      blendWidthM,
      bankRiseM,
      floorFraction,
    }) => ({
      id, laneId, pointsLocalM, halfWidthM, blendWidthM, bankRiseM, floorFraction,
    })),
    patches: world.heroCells.map(({ id, terrainPatch }) => ({ id, terrainPatch })),
  }), "3e2206463d46c59872d6e6e4060290d9d7754b3a90135205f6ff24569c6c297a");
  assert.equal(contentHash(
    world.landmarks.map(({ id, positionLocalM }) => ({ id, positionLocalM })),
  ), "51a15145fef93e0011b70e9b218159dca5b2df9d2e21438902598242d5bb2be5");
  assert.equal(world.hazards.length, 14);
  assert.equal(contentHash(world.hazards),
    "c4a0eb80e25575135def5a892bce61db27ebd64cd5ba1176877c64437370e640");
});

test("copies exact collision-authority shapes without generating hazards", async () => {
  const world = validateCobraCanyonWorld(await rawWorld());
  const plan = planCobraCanyonWorld(world, { qualityTier: "mobile" });

  assert.deepEqual(plan.hazards, world.hazards);
  assert.ok(plan.hazards.some((hazard) => hazard.collision.shape === "aabb"));
  assert.ok(plan.hazards.some((hazard) => hazard.collision.shape === "capsuleSegment"));
  for (const hazard of plan.hazards) {
    assert.equal(hazard.authority.role, "collision-authority");
    if (hazard.collision.shape === "capsuleSegment") {
      assert.equal(hazard.collision.fromLocalM.length, 3);
      assert.equal(hazard.collision.toLocalM.length, 3);
      assert.ok(hazard.collision.radiusM > 0);
    } else {
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(
          hazard.collision.minimumLocalM[axis] < hazard.collision.maximumLocalM[axis],
        );
      }
    }
  }
});

test("samples one deterministic finite relief surface for the lab camera and floor", async () => {
  const plan = planCobraCanyonWorld(await rawWorld(), { qualityTier: "desktop" });
  const samples = [];
  for (let northM = -8000; northM <= 8000; northM += 1000) {
    for (let eastM = -8000; eastM <= 8000; eastM += 1000) {
      const heightM = sampleCobraCanyonTerrain(plan, eastM, northM);
      assert.ok(Number.isFinite(heightM), `${eastM},${northM} must be finite`);
      assert.equal(heightM, sampleCobraCanyonTerrain(plan, eastM, northM));
      samples.push(heightM);
    }
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) > 650,
    "the highland basin needs unmistakable vertical relief");
  const gorgeFloor = sampleCobraCanyonTerrain(plan, 1550, 4100);
  const gorgeShoulder = sampleCobraCanyonTerrain(plan, 2700, 4100);
  assert.ok(gorgeShoulder - gorgeFloor > 70,
    "the river ribbon must carve a legible low-level gorge");
  assert.equal(
    sampleCobraCanyonTerrain(plan, -9000, -9000),
    sampleCobraCanyonTerrain(plan, -8000, -8000),
    "sampling clamps to the authored world extent",
  );
  assert.throws(() => sampleCobraCanyonTerrain(plan, Number.NaN, 0), /eastM must be finite/);
});

test("loads through injected fetch in either supported argument order and validates failures", async () => {
  const value = await rawWorld();
  const requests = [];
  const receivers = [];
  async function fetchImpl(url, options) {
    receivers.push(this);
    requests.push([String(url), options]);
    return { ok: true, json: async () => value };
  }

  const first = await loadCobraCanyonWorld(fetchImpl);
  const second = await loadCobraCanyonWorld("/test/cobra-canyon.json", fetchImpl);
  const third = await loadCobraCanyonWorld({ fetch: fetchImpl, url: "/options/world.json" });
  assert.equal(first.worldId, "world.cobra-canyon.v1");
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.deepEqual(requests.map(([url]) => url), [
    COBRA_CANYON_WORLD_URL,
    "/test/cobra-canyon.json",
    "/options/world.json",
  ]);
  assert.ok(requests.every(([, options]) => options.credentials === "same-origin"));
  assert.ok(receivers.every((receiver) => receiver === globalThis),
    "browser-style fetch functions retain their required global receiver");

  await assert.rejects(
    () => loadCobraCanyonWorld(async () => ({ ok: false, status: 404 })),
    /HTTP 404/,
  );
  await assert.rejects(
    () => loadCobraCanyonWorld(async () => ({ ok: true })),
    /must provide json/,
  );
});

test("rejects authority, route-id, collision, and budget drift", async () => {
  const original = await rawWorld();

  const wrongRoute = structuredClone(original);
  wrongRoute.routeLanes[0].id = "route.cobra-canyon.shortcut.v1";
  assert.throws(() => validateCobraCanyonWorld(wrongRoute), /public river-gorge/);

  const targetableAmbient = structuredClone(original);
  targetableAmbient.ambientBatches[0].targetable = true;
  assert.throws(() => validateCobraCanyonWorld(targetableAmbient), /targetable must be false/);

  const targetableArchetype = structuredClone(original);
  targetableArchetype.presentationKit.ambientArchetypes[0].targetable = true;
  assert.throws(() => validateCobraCanyonWorld(targetableArchetype), /targetable must be false/);

  const invalidPalette = structuredClone(original);
  invalidPalette.presentationKit.landmarkArchetypes[0].paletteHex[0] = "olive";
  assert.throws(() => validateCobraCanyonWorld(invalidPalette), /#RRGGBB/);

  const ambiguousReveal = structuredClone(original);
  ambiguousReveal.setPieceCells[1].distanceAlongRouteM = 100;
  assert.throws(() => validateCobraCanyonWorld(ambiguousReveal), /must increase within each route/);

  const unknownArchetype = structuredClone(original);
  unknownArchetype.setPieceCells[0].archetypeIds[0] = "archetype.cobra-canyon.unknown.v1";
  assert.throws(() => validateCobraCanyonWorld(unknownArchetype), /references unknown id/);

  const inventedHazard = structuredClone(original);
  inventedHazard.hazards[0].authority.role = "presentation-only";
  assert.throws(() => validateCobraCanyonWorld(inventedHazard), /collision-authority/);

  const badCollision = structuredClone(original);
  badCollision.hazards[0].collision.shape = "sphere";
  assert.throws(() => validateCobraCanyonWorld(badCollision), /capsuleSegment or aabb/);

  const sheddingAuthority = structuredClone(original);
  sheddingAuthority.qualityBudgets.mobile.maxHazards = 13;
  assert.throws(() => validateCobraCanyonWorld(sheddingAuthority), /gameplay-important/);

  const sheddingSetPieces = structuredClone(original);
  sheddingSetPieces.qualityBudgets.mobile.maxSetPieceCells = 8;
  assert.throws(() => validateCobraCanyonWorld(sheddingSetPieces), /presentation archetype/);

  const mutableInput = await rawWorld();
  const validated = validateCobraCanyonWorld(mutableInput);
  mutableInput.landmarks[0].displayName = "mutated after validation";
  assert.equal(validated.landmarks[0].displayName, "Camp Ember");
});
