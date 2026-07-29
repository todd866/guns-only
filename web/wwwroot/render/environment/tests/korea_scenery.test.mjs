import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  applyKoreaSceneryBudgetLevel,
  createKoreaSceneryRuntime,
  KOREA_TREE_STAND_SIZE,
  SOFT_WORLD_GRASS_BLADES_PER_PATCH,
  UKRAINE_NEAR_RING_STAND_SIZE,
  UKRAINE_NEAR_RING_VISIBLE_TRUNKS,
  UKRAINE_MID_RING_STAND_SIZE,
  KOREA_SCENERY_PROFILES,
  planKoreaScenery,
} from "../korea_scenery.js";
import {
  UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES,
} from "../soft_world_atmosphere.js";

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

function trianglesPerInstance(mesh) {
  return (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
}

function localHorizontalOffset(matrix, worldEast, worldNorth) {
  const elements = matrix.elements;
  const a = elements[0];
  const b = elements[8];
  const c = elements[2];
  const d = elements[10];
  const determinant = a * d - b * c;
  return new THREE.Vector2(
    (d * worldEast - b * worldNorth) / determinant,
    (-c * worldEast + a * worldNorth) / determinant,
  );
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
  assert.ok(first.trees.every((tree) => Number.isInteger(tree.crownVariant)));
  assert.ok(modern.buildings.every((building) => Number.isInteger(building.settlementIndex)
    && Number.isInteger(building.colorVariant)));
  assert.ok(modern.fields.every((field) => Number.isInteger(field.colorVariant)));

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
  assert.equal(plan.grass.length, 0);
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
  assert.equal(runtime.createTile(chunkFixture(), decodedFixture(), 2), null);
  const group = runtime.createTile(chunkFixture(), decodedFixture(), 0);
  assert.ok(group);
  assert.equal(group.userData.scenery.era, "1950s");
  assert.ok(group.userData.scenery.trees > 0);
  assert.ok(group.userData.scenery.fields > 0);
  assert.ok(group.userData.scenery.fieldRows > 0);
  assert.ok(group.userData.scenery.roadSegments > 0);
  assert.ok(group.children.every((child) => child.isInstancedMesh));
  assert.equal(group.userData.scenery.treeSilhouettes,
    group.userData.scenery.trees * KOREA_TREE_STAND_SIZE);
  const crowns = group.children.find((child) => child.name === "PROCEDURAL_TREE_CROWNS");
  const roofs = group.children.find((child) => child.name === "PROCEDURAL_1950S_ROOFS");
  assert.ok(crowns.instanceColor, "tree-stand colour variation must stay in one instance batch");
  assert.ok(roofs?.isInstancedMesh, "settlement roof silhouettes must be instanced");
  assert.ok(roofs.instanceColor, "roof palette variation must stay in one instance batch");
  assert.ok(crowns.geometry.getAttribute("position").count > 7 * 10,
    "one chunk-time tree matrix must expand to a compound stand in shared geometry");
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

test("consumes a worker-prepared scenery plan without replanning the tile", () => {
  const chunk = chunkFixture();
  const decoded = decodedFixture();
  const plan = planKoreaScenery(chunk, decoded, {
    era: "1950s",
    qualityTier: "mobile",
    ring: "near",
  });
  assert.ok(plan.trees.length > 0);
  const prepared = Object.freeze({
    ...plan,
    trees: Object.freeze([]),
  });
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "1950s",
    qualityTier: "mobile",
  });
  const group = runtime.createTile(chunk, decoded, 0, prepared);
  assert.ok(group, "non-tree prepared layers should still build the tile");
  assert.equal(group.userData.scenery.trees, 0);
  assert.equal(group.getObjectByName("PROCEDURAL_TREE_CROWNS"), undefined,
    "the runtime must use the worker result rather than invoking the planner again");
  runtime.disposeTile(group);
  runtime.dispose();
});

test("keeps scenery on the nearest selectable mobile and balanced terrain LOD", () => {
  for (const qualityTier of ["mobile", "balanced"]) {
    const runtime = createKoreaSceneryRuntime(THREE, {
      era: "ukraine-modern",
      qualityTier,
    });
    const group = runtime.createTile(chunkFixture(), decodedFixture(), 1);
    assert.ok(group, `${qualityTier} LOD1 must retain low-level scenery`);
    assert.equal(group.userData.scenery.theatre, "ukraine");
    assert.equal(group.userData.scenery.trainingSector, true);
    runtime.disposeTile(group);
    runtime.dispose();
  }
});

test("plans a distinct Ukraine rewild grammar with sparse ambient compounds", () => {
  const chunk = {
    id: "e0000-n0000",
    eastIndex: 0,
    northIndex: 0,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 17, landFraction: 1 },
  };
  const first = planKoreaScenery(chunk, flatDecodedFixture(), {
    era: "ukraine-modern",
    qualityTier: "desktop",
  });
  const repeated = planKoreaScenery(chunk, flatDecodedFixture(), {
    era: "ukraine-modern",
    qualityTier: "desktop",
  });
  assert.deepEqual(first, repeated);
  assert.ok(first.trees.length > first.buildings.length,
    "rewild canopy should dominate rare compounds");
  assert.ok(first.grassPatchCapacity > 0,
    "the close rewild layer should reserve a deterministic camera-local meadow pool");
  assert.ok(first.buildings.every((building, index) =>
    building.entityId === `scenery.ukraine-modern.${chunk.id}.building.${index}`
      && building.role === "ambient"
      && building.targetable === false));
  assert.equal(KOREA_SCENERY_PROFILES["ukraine-modern"].theatre, "ukraine");
  assert.match(KOREA_SCENERY_PROFILES["ukraine-modern"].period, /rewild/i);
  assert.ok(KOREA_SCENERY_PROFILES["ukraine-modern"].buildingDensityPerKm2 < 3);
  assert.ok(KOREA_SCENERY_PROFILES["ukraine-modern"].treeDensityPerKm2 > 40);
  assert.equal(KOREA_SCENERY_PROFILES["ukraine-modern"].crownShape, "soft-canopy");
  assert.equal(KOREA_SCENERY_PROFILES["ukraine-modern"].softLit, true);
  assert.ok(KOREA_SCENERY_PROFILES["ukraine-modern"].grassPatchDensityPerKm2 > 100);
  assert.ok(KOREA_SCENERY_PROFILES["ukraine-modern"].toonSteps.length >= 3);
});

test("Ukraine shelterbelt stands align and stretch along their continuous route", () => {
  const chunk = {
    id: "e0030-n0030",
    eastIndex: 30,
    northIndex: 30,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 153, landFraction: 1 },
  };
  const plan = planKoreaScenery(chunk, flatDecodedFixture(), {
    era: "ukraine-modern",
    qualityTier: "desktop",
  });
  const shelterbelt = plan.trees.filter((tree) => tree.kind === "shelterbelt");
  assert.ok(shelterbelt.length > 10);
  assert.ok(shelterbelt.every((tree) => Math.abs(tree.yaw) < 1e-12),
    "this deterministic row route must align every stand east-west");
  assert.ok(shelterbelt.every((tree) => tree.widthScale >= 1.5),
    "existing instances must overlap into a windbreak instead of isolated crown dots");
  assert.ok(plan.trees.some((tree) => tree.kind === "woodland"),
    "the route must not replace the separate woodland grammar");
});

test("authored mission footprints exclude ambient scenery without creating LZ claims", () => {
  const chunk = chunkFixture();
  const exclusion = [{ eastM: 500, northM: 500, radiusM: 1_000 }];
  const plan = planKoreaScenery(chunk, flatDecodedFixture(), {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ambientExclusionZones: exclusion,
  });
  for (const key of [
    "trees", "buildings", "fields", "fieldRows", "roads",
    "railSegments", "runways", "powerPoles", "powerLines",
  ]) {
    assert.equal(plan[key].length, 0, `${key} must yield to the authored footprint`);
  }
  assert.equal(Object.hasOwn(plan, "landingZones"), false,
    "ambient scenery must not invent operational LZ state");

  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ambientExclusionZones: exclusion,
  });
  const group = runtime.createTile(chunk, flatDecodedFixture(), 0);
  assert.ok(group, "the bounded camera-local grass pool can remain allocated");
  runtime.update({ cameraPosition: new THREE.Vector3(500, 120, -500) });
  assert.equal(group.getObjectByName("PROCEDURAL_SOFT_WORLD_GRASS")?.count ?? 0, 0,
    "camera-local grass must consume the same authored exclusion");
  runtime.disposeTile(group);
  runtime.dispose();
});

test("Ukraine meadow clumps batch real blades and share the authoritative wind field", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
  });
  const group = runtime.createTile(chunkFixture(), flatDecodedFixture(), 0);
  assert.equal(group.getObjectByName("PROCEDURAL_SOFT_WORLD_GRASS"), undefined,
    "the camera-local pool should be allocated lazily, not during every terrain tile build");
  group.traverse((child) => {
    if (child.isInstancedMesh) {
      assert.ok(child.boundingSphere,
        `${child.name} should carry a precomputed chunk bound before its first render`);
      assert.ok(child.boundingSphere.radius > Math.SQRT2 * 500 + 300,
        `${child.name} bound must include horizontal object footprints past the tile centre`);
    }
  });
  runtime.update({
    elapsedSeconds: 12.5,
    windX: 7,
    windZ: -3,
    cameraPosition: new THREE.Vector3(500, 120, -500),
  });
  const grass = group.getObjectByName("PROCEDURAL_SOFT_WORLD_GRASS");
  assert.ok(grass?.isInstancedMesh);
  assert.equal(grass.instanceMatrix.count, group.userData.scenery.grassPatchCapacity);
  assert.equal(
    group.userData.scenery.grassBladeCapacity,
    grass.instanceMatrix.count * SOFT_WORLD_GRASS_BLADES_PER_PATCH,
  );
  assert.ok(grass.geometry.attributes.position.count
    >= SOFT_WORLD_GRASS_BLADES_PER_PATCH * 5);
  assert.equal(grass.material.type, "MeshBasicMaterial",
    "foreground grass should keep its authored palette without dark Lambert aliasing");
  assert.ok(grass.count > 0);
  assert.ok(grass.count <= KOREA_SCENERY_PROFILES["ukraine-modern"].localGrassUpdatesPerFrame,
    "the first visible frame must obey the camera-grass matrix update budget");
  assert.ok(grass.count <= group.userData.scenery.grassPatchCapacity);
  assert.equal(group.userData.scenery.grassPatches, grass.count);
  assert.equal(
    group.userData.scenery.grassBlades,
    grass.count * SOFT_WORLD_GRASS_BLADES_PER_PATCH,
  );
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\nvoid main(){\n#include <begin_vertex>\n}",
  };
  grass.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSoftWorldTime.value, 12.5);
  assert.deepEqual(shader.uniforms.uSoftWorldWind.value.toArray(), [7, -3]);
  assert.match(shader.vertexShader, /travellingWave/);
  assert.match(shader.vertexShader, /softWorldDeterminant/);
  assert.doesNotMatch(shader.vertexShader, /0\.70710678/);
  runtime.disposeTile(group);
  runtime.dispose();
});

test("camera-local Ukraine grass is governed by AGL rather than world altitude", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
  });
  const group = runtime.createTile(chunkFixture(), flatDecodedFixture(), 0);
  runtime.update({
    cameraPosition: new THREE.Vector3(500, 1_120, -500),
    cameraAglM: 90,
  });
  const grass = group.getObjectByName("PROCEDURAL_SOFT_WORLD_GRASS");
  assert.ok(grass?.visible);
  assert.ok(grass.count > 0,
    "high-datum terrain must retain hover-height grass when the aircraft is actually low");
  runtime.update({
    cameraPosition: new THREE.Vector3(500, 340, -500),
    cameraAglM: 220,
  });
  assert.equal(grass.visible, false,
    "sub-pixel blade batches must stay unsubmitted at low-level cruise height");
  runtime.update({
    cameraPosition: new THREE.Vector3(500, 1_120, -500),
    cameraAglM: 60,
  });
  assert.equal(grass.visible, true);
  runtime.disposeTile(group);
  runtime.dispose();
});

test("camera-local Ukraine grass preserves overlapping placements across adjacent snaps", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
  });
  const group = runtime.createTile(chunkFixture(), flatDecodedFixture(), 0);
  const matricesByPosition = (mesh) => {
    const matrix = new THREE.Matrix4();
    const result = new Map();
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix);
      const elements = Array.from(matrix.elements);
      const key = `${elements[12].toFixed(5)}:${elements[14].toFixed(5)}`;
      result.set(key, elements);
    }
    return result;
  };

  for (let frame = 0; frame < 8; frame++) {
    runtime.update({
      cameraPosition: new THREE.Vector3(504, 120, -504),
    });
  }
  const grass = group.getObjectByName("PROCEDURAL_SOFT_WORLD_GRASS");
  const before = matricesByPosition(grass);
  assert.ok(before.size > 0);

  // One exact 42 m camera-cell step east. Grass still inside the new 270 m disc must retain the
  // same world transform; only the strip leaving/entering the disc is allowed to change.
  for (let frame = 0; frame < 8; frame++) {
    runtime.update({
      cameraPosition: new THREE.Vector3(546, 120, -504),
    });
  }
  const after = matricesByPosition(grass);
  const newCentreX = 546 - 500;
  const newCentreZ = -(504 - 500);
  const expectedOverlap = [...before.entries()].filter(([, elements]) =>
    Math.hypot(elements[12] - newCentreX, elements[14] - newCentreZ) <= 270);

  assert.ok(expectedOverlap.length > before.size * 0.7,
    "adjacent camera cells should share most of the meadow");
  for (const [key, matrix] of expectedOverlap) {
    assert.deepEqual(after.get(key), matrix,
      `overlapping world placement ${key} must not be reseeded`);
  }
  assert.ok([...before.keys()].some((key) => !after.has(key)),
    "the trailing edge should leave the bounded pool");
  const entering = [...after.entries()].filter(([key]) => !before.has(key));
  assert.ok(entering.length > 0,
    "the leading edge should fill the bounded pool");
  const priorCentreX = 504 - 500;
  const priorCentreZ = -(504 - 500);
  assert.ok(entering.every(([, elements]) =>
    Math.hypot(elements[12] - priorCentreX, elements[14] - priorCentreZ) >= 269.999),
  "new instances should appear only across the leading edge, not pop into the overlap");
  assert.ok(grass.count <= grass.instanceMatrix.count,
    "camera motion must not grow the fixed quality-tier instance allocation");

  runtime.disposeTile(group);
  runtime.dispose();
});

test("soft-world bending preserves authoritative world direction across yaw and scale", () => {
  const worldOffset = new THREE.Vector2(0.36, -0.18);
  for (const [yaw, radius] of [[0, 4], [Math.PI / 2, 9]]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(12, 3, -8),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(radius, 1.2, radius),
    );
    const local = localHorizontalOffset(matrix, worldOffset.x, worldOffset.y);
    const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
    const displaced = new THREE.Vector3(local.x, 0, local.y).applyMatrix4(matrix);
    const recovered = displaced.sub(origin);
    assert.ok(Math.abs(recovered.x - worldOffset.x) < 1e-9);
    assert.ok(Math.abs(recovered.z - worldOffset.y) < 1e-9);
  }
  assert.deepEqual(
    localHorizontalOffset(new THREE.Matrix4(), 0, 0).toArray(),
    [0, 0],
  );
});

test("Ukraine soft-canopy stands use rounded crown geometry and Lambert lighting", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "desktop",
  });
  const group = runtime.createTile(chunkFixture(), flatDecodedFixture(), 0);
  assert.ok(group);
  const crowns = group.getObjectByName("PROCEDURAL_TREE_CROWNS");
  const trunks = group.getObjectByName("PROCEDURAL_TREE_TRUNKS");
  assert.ok(crowns?.isInstancedMesh);
  assert.ok(trunks?.isInstancedMesh);
  const crownTriangles = trianglesPerInstance(crowns);
  const trunkTriangles = trianglesPerInstance(trunks);
  assert.equal(crownTriangles, UKRAINE_NEAR_RING_STAND_SIZE * 24,
    "all five six-sided smooth canopy lobes must survive the geometry reduction");
  assert.equal(trunkTriangles, UKRAINE_NEAR_RING_VISIBLE_TRUNKS * 24,
    "only one dominant trunk should remain under overlapping foliage");
  assert.ok(crownTriangles + trunkTriangles <= 200,
    "a complete Ukraine near stand must stay inside its 200-triangle ceiling");
  assert.equal(crowns.geometry.getAttribute("color")?.itemSize, 3,
    "painted lobe variation must live in the shared geometry instead of another draw");
  assert.equal(crowns.material.type, "MeshLambertMaterial",
    "Ukraine soft-world crowns must not use hard toon posterization");
  runtime.update({ elapsedSeconds: 8, windX: 5, windZ: 2 });
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\nvoid main(){\n#include <begin_vertex>\n}",
  };
  crowns.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSoftWorldTime.value, 8);
  assert.deepEqual(shader.uniforms.uSoftWorldWind.value.toArray(), [5, 2]);
  assert.match(shader.vertexShader, /canopyWeight/);
  assert.match(shader.vertexShader, /softWorldDeterminant/);
  assert.doesNotMatch(shader.vertexShader, /0\.70710678/);
  runtime.disposeTile(group);
  runtime.dispose();
});

test("all Ukraine scenery materials share the terrain atmosphere by identity", () => {
  const atmosphereUniforms = {
    uFogColor: { value: new THREE.Color(0xd2c4a8) },
    uFogDensity: { value: 1 / 48_000 },
    uAtmosphereDensityScale: { value: 0.42 },
    uAtmosphereHazeColor: { value: new THREE.Color(0.78, 0.72, 0.58) },
    uAtmosphereHazeMix: { value: 0.62 },
    uWorldEdgeM: { value: 12_000 },
    uHazeBands: { value: 3 },
    uHazeBandBlend: { value: 0.18 },
  };
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    atmosphereUniforms,
  });
  const group = runtime.createTile(chunkFixture(), flatDecodedFixture(), 0);
  const materials = new Set();
  group.traverse((child) => {
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) if (material) materials.add(material);
  });
  assert.ok(materials.size > 5);
  for (const material of materials) {
    assert.equal(material.fog, false, `${material.name || material.type} must not double-fog`);
    assert.equal(material.userData.ukraineSoftWorldFog, true);
  }

  const material = group.getObjectByName("PROCEDURAL_TREE_CROWNS").material;
  const shader = {
    uniforms: {},
    vertexShader: [
      "#include <common>",
      "void main(){",
      "vec4 mvPosition = vec4(0.0);",
      "#include <begin_vertex>",
      "#include <fog_pars_vertex>",
      "#include <fog_vertex>",
      "}",
    ].join("\n"),
    fragmentShader: [
      "#include <fog_pars_fragment>",
      "void main(){",
      "vec3 outgoingLight = vec3(1.0);",
      "#include <opaque_fragment>",
      "}",
    ].join("\n"),
  };
  material.onBeforeCompile(shader);
  for (const name of UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES) {
    assert.equal(shader.uniforms[name], atmosphereUniforms[name],
      `${name} must be the terrain uniform entry, not a copied value`);
  }
  assert.match(shader.vertexShader, /length\(mvPosition\.xyz\)/);
  assert.match(shader.fragmentShader, /uWorldEdgeM \* 0\.40/);
  assert.match(shader.fragmentShader, /floor\(softWorldAerial \* uHazeBands\)/);
  assert.match(shader.fragmentShader, /outgoingLight = mix/);
  runtime.disposeTile(group);
  runtime.dispose();
});

test("Ukraine mid-ring scenery uses thinner stands and lower density than the near ring", () => {
  const chunk = {
    id: "e0002-n0003",
    eastIndex: 2,
    northIndex: 3,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 42, landFraction: 1 },
  };
  const decoded = flatDecodedFixture();
  const near = planKoreaScenery(chunk, decoded, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ring: "near",
  });
  const mid = planKoreaScenery(chunk, decoded, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ring: "mid",
  });
  assert.ok(near.trees.length > 0);
  assert.ok(mid.trees.length < near.trees.length,
    "mid ring must keep fewer tree instances than the near ring under the same tier cap");
  assert.ok(mid.trees.length <= Math.ceil(near.trees.length * 0.55) + 1);
  assert.ok(near.grassPatchCapacity > 0);
  assert.equal(mid.grassPatchCapacity, 0,
    "individual grass blades belong only to the closest scenery ring");

  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
  });
  const nearTile = runtime.createTile(chunk, decoded, 0);
  const midTile = runtime.createTile(chunk, decoded, 1);
  assert.ok(nearTile && midTile);
  assert.equal(nearTile.userData.scenery.ring, "near");
  assert.equal(midTile.userData.scenery.ring, "mid");
  assert.equal(
    nearTile.userData.scenery.treeSilhouettes,
    nearTile.userData.scenery.trees * UKRAINE_NEAR_RING_STAND_SIZE,
  );
  assert.equal(
    midTile.userData.scenery.treeSilhouettes,
    midTile.userData.scenery.trees * UKRAINE_MID_RING_STAND_SIZE,
  );
  const nearCrowns = nearTile.getObjectByName("PROCEDURAL_TREE_CROWNS");
  const midCrowns = midTile.getObjectByName("PROCEDURAL_TREE_CROWNS");
  const midTrunks = midTile.getObjectByName("PROCEDURAL_TREE_TRUNKS");
  assert.ok(midCrowns.geometry.attributes.position.count
    < nearCrowns.geometry.attributes.position.count,
    "mid-ring stand geometry must be cheaper than the near-ring full stand");
  assert.ok(trianglesPerInstance(midCrowns) <= 60,
    "a Ukraine mid-ring tree mass must stay inside its 60-triangle ceiling");
  assert.equal(midTrunks, undefined,
    "mid-ring canopy masses must not submit hidden trunk geometry");
  runtime.disposeTile(nearTile);
  runtime.disposeTile(midTile);
  runtime.dispose();
});

test("Ukraine desktop scenery stops at LOD0 instead of dressing the whole terrain disc", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "desktop",
  });
  const chunk = chunkFixture();
  const decoded = flatDecodedFixture();
  const nearTile = runtime.createTile(chunk, decoded, 0);
  assert.ok(nearTile);
  assert.equal(runtime.createTile(chunk, decoded, 1), null);
  runtime.disposeTile(nearTile);
  runtime.dispose();
});

test("Korea LOD1 retains the established density and full tree stands", () => {
  const chunk = {
    id: "e0002-n0003",
    eastIndex: 2,
    northIndex: 3,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 42, landFraction: 1 },
  };
  const decoded = flatDecodedFixture();
  const near = planKoreaScenery(chunk, decoded, {
    era: "1950s",
    qualityTier: "balanced",
    ring: "near",
  });
  const mid = planKoreaScenery(chunk, decoded, {
    era: "1950s",
    qualityTier: "balanced",
    ring: "mid",
  });
  assert.equal(mid.trees.length, near.trees.length);
  assert.equal(mid.buildings.length, near.buildings.length);
  assert.equal(mid.fields.length, near.fields.length);

  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "1950s",
    qualityTier: "balanced",
  });
  const midTile = runtime.createTile(chunk, decoded, 1);
  assert.equal(
    midTile.userData.scenery.treeSilhouettes,
    midTile.userData.scenery.trees * KOREA_TREE_STAND_SIZE,
  );
  const crowns = midTile.getObjectByName("PROCEDURAL_TREE_CROWNS");
  const trunks = midTile.getObjectByName("PROCEDURAL_TREE_TRUNKS");
  assert.ok(crowns.geometry.attributes.position.count > KOREA_TREE_STAND_SIZE * 10);
  assert.equal(trianglesPerInstance(crowns), 147,
    "Ukraine-only blob reduction must not alter Korea crown geometry");
  assert.equal(trianglesPerInstance(trunks), 140,
    "Ukraine-only trunk reduction must not alter Korea trunk geometry");
  runtime.disposeTile(midTile);
  runtime.dispose();
});

test("ambient budget rungs shed secondary detail and restore exact authored counts", () => {
  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "mobile",
  });
  const group = runtime.createTile({
    id: "e0120-n0000",
    eastIndex: 120,
    northIndex: 0,
    boundsLocalM: [0, 0, 8_192, 8_192],
    generation: { seed: 1, landFraction: 1 },
  }, flatDecodedFixture(), 0);
  runtime.update({
    cameraPosition: new THREE.Vector3(4_096, 120, -4_096),
  });

  const byName = (name) => {
    const mesh = group.getObjectByName(name);
    assert.ok(mesh?.isInstancedMesh, `${name} fixture batch must exist`);
    return mesh;
  };
  const crowns = byName("PROCEDURAL_TREE_CROWNS");
  assert.equal(group.getObjectByName("PROCEDURAL_UKRAINE-MODERN_LAND_USE"), undefined,
    "former-field structure belongs in the terrain byte, not intersecting mean-height boxes");
  const grass = byName("PROCEDURAL_SOFT_WORLD_GRASS");
  const hiddenAtLevelOne = [
    grass,
    byName("PROCEDURAL_TREE_TRUNKS"),
    byName("PROCEDURAL_ROAD_MARKINGS"),
    byName("PROCEDURAL_POWER_LINES"),
  ];
  const navigationCues = [
    byName("PROCEDURAL_UKRAINE-MODERN_BUILDINGS"),
    byName("PROCEDURAL_UKRAINE-MODERN_ROADS"),
    byName("PROCEDURAL_UKRAINE-MODERN_POWER_POLES"),
  ];
  const meshes = group.children.filter((child) => child.isInstancedMesh);
  const original = new Map(meshes.map((mesh) => [
    mesh.name,
    { count: mesh.count, visible: mesh.visible },
  ]));

  assert.equal(applyKoreaSceneryBudgetLevel(group, 1), 1);
  assert.equal(group.userData.koreaSceneryBudgetLevel, 1);
  assert.equal(crowns.count, Math.ceil(original.get(crowns.name).count * 0.60));
  for (const mesh of hiddenAtLevelOne) assert.equal(mesh.visible, false);
  for (const mesh of navigationCues) {
    assert.equal(mesh.visible, original.get(mesh.name).visible,
      `${mesh.name} must remain visible at budget level 1`);
    assert.equal(mesh.count, original.get(mesh.name).count,
      `${mesh.name} must retain all navigation instances at budget level 1`);
  }
  runtime.update({
    cameraPosition: new THREE.Vector3(4_096, 120, -4_096),
  });
  assert.equal(grass.visible, false,
    "the camera-local updater must not undo a grass budget shed");

  assert.equal(applyKoreaSceneryBudgetLevel(group, 2), 2);
  const levelTwoCounts = {
    crowns: crowns.count,
  };
  assert.equal(levelTwoCounts.crowns,
    Math.ceil(original.get(crowns.name).count * 0.35));
  for (const mesh of navigationCues) {
    assert.equal(mesh.visible, original.get(mesh.name).visible,
      `${mesh.name} must remain visible at budget level 2`);
    assert.equal(mesh.count, original.get(mesh.name).count,
      `${mesh.name} must retain all navigation instances at budget level 2`);
  }
  applyKoreaSceneryBudgetLevel(group, 2);
  assert.deepEqual(
    { crowns: crowns.count },
    levelTwoCounts,
    "reapplying a rung must not compound instance reductions",
  );

  assert.equal(applyKoreaSceneryBudgetLevel(group, 0), 0);
  for (const mesh of meshes) {
    assert.deepEqual(
      { count: mesh.count, visible: mesh.visible },
      original.get(mesh.name),
      `${mesh.name} must restore its exact pre-budget state`,
    );
  }

  runtime.disposeTile(group);
  runtime.dispose();
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
  assert.ok(names.has("PROCEDURAL_MODERN_ROOFS"));
  assert.ok(names.has("PROCEDURAL_ROAD_MARKINGS"));
  assert.ok(names.has("PROCEDURAL_MODERN_POWER_POLES"));
  assert.ok(names.has("PROCEDURAL_POWER_LINES"));
  assert.ok(group.userData.scenery.powerPoles <= 10);
  assert.ok(group.userData.scenery.buildingSilhouettes
    > group.userData.scenery.buildings);
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
