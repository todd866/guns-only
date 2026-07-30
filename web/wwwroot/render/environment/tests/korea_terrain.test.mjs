import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  ambientSceneryRadiusM,
  createTerrainGeometry,
  createTerrainMaterial,
  decodeTerrainRecord,
  loadKoreaTerrain,
  reconstructWaterHeights,
  selectTerrainLod,
  terrainCurvatureDropM,
  TerrainBundleReader,
  ukraineTrainingApronHeightM,
  ukraineTrainingSourceHeightM,
  validateTerrainAtlasManifest,
  validateTerrainManifest,
} from "../korea_terrain.js";
import {
  buildTerrainMeshArrays,
  TERRAIN_LANDCOVER_MACRO_CELL_M,
  TERRAIN_LANDCOVER_MESO_CELL_M,
} from "../terrain_mesh_builder.js";
import {
  createKoreaSceneryRuntime,
  planKoreaScenery,
} from "../korea_scenery.js";

const quantization = {
  storage: "little-endian-signed-int16",
  metresPerUnit: 0.1,
  waterSentinel: -32768,
};

function manifest() {
  return {
    schemaVersion: "1.0.0",
    terrainId: "terrain.test.v1",
    boundsLocalM: [0, 0, 2, 2],
    quantization,
    bundle: { uri: "test.terrain", byteLength: 18, sha256: "a".repeat(64) },
    chunks: [{
      id: "e00-n00",
      boundsLocalM: [0, 0, 2, 2],
      lods: [{ level: 0, sampleCount: 3, byteOffset: 0, byteLength: 18, spacingM: 1 }],
    }],
  };
}

test("Ukraine visual apron edge source stays byte-aligned with the shipped truth grid", async () => {
  const payload = await readFile(new URL(
    "../../../content/packs/ukraine-modern/environment/terrain/soniachne-steppe.truth",
    import.meta.url,
  ));
  const gridOffset = 64;
  const pointCount = 513;
  const truthHeightM = (eastM, northM) => {
    const eastIndex = Math.round((eastM + 8_192) / 32);
    const northIndex = Math.round((northM + 8_192) / 32);
    const index = northIndex * pointCount + eastIndex;
    return payload.readInt16LE(gridOffset + index * 2) * 0.1;
  };
  for (let alongEdgeM = -8_192; alongEdgeM <= 8_192; alongEdgeM += 32) {
    for (const [eastM, northM] of [
      [alongEdgeM, -8_192], [alongEdgeM, 8_192],
      [-8_192, alongEdgeM], [8_192, alongEdgeM],
    ]) {
      assert.equal(Math.round(ukraineTrainingSourceHeightM(eastM, northM) * 10),
        Math.round(truthHeightM(eastM, northM) * 10));
    }
  }
});

test("shipped Ukraine terrain manifest exposes one v2 theatre with nested fidelity bands", async () => {
  const source = JSON.parse(await readFile(new URL(
    "../../../content/packs/ukraine-modern/environment/terrain/soniachne-steppe.manifest.json",
    import.meta.url,
  ), "utf8"));
  assert.equal(source.terrainId, "terrain.ukraine.soniachne-theatre.v2");
  assert.deepEqual(source.boundsLocalM, [-131_072, -131_072, 131_072, 131_072]);
  assert.deepEqual(source.fidelityBands.map((band) => [
    band.id, band.simulationSpacingM,
  ]), [
    ["theatre-macro", 256],
    ["soniachne-detail", 32],
  ]);
  assert.equal(source.simulationTruth.spacingM, 32);
  assert.equal(source.regionalSimulationTruth.spacingM, 256);
  assert.equal(source.chunks.filter(
    (chunk) => chunk.generation.fidelityBand === "detail",
  ).length, 4);
  assert.equal(source.chunks.filter(
    (chunk) => chunk.generation.fidelityBand === "macro",
  ).length, 24);
});

function streamingManifest() {
  const chunks = [
    { id: "far", boundsLocalM: [40, 0, 42, 2] },
    { id: "middle", boundsLocalM: [0, 0, 2, 2] },
    { id: "near", boundsLocalM: [20, 0, 22, 2] },
  ].map((chunk, index) => ({
    ...chunk,
    lods: [{
      level: 0,
      sampleCount: 3,
      byteOffset: index * 18,
      byteLength: 18,
      spacingM: 1,
    }],
  }));
  return {
    schemaVersion: "1.0.0",
    terrainId: "terrain.streaming-test.v1",
    boundsLocalM: [0, 0, 42, 2],
    quantization,
    bundle: { uri: "streaming.terrain", byteLength: 54, sha256: "c".repeat(64) },
    chunks,
  };
}

function macroStreamingManifest() {
  const chunks = [
    { id: "macro-under-aircraft", boundsLocalM: [0, 0, 65_536, 65_536] },
    { id: "macro-remote", boundsLocalM: [131_072, 0, 196_608, 65_536] },
  ].map((chunk, index) => ({
    ...chunk,
    lods: [{
      level: 0,
      sampleCount: 3,
      byteOffset: index * 18,
      byteLength: 18,
      spacingM: 32_768,
    }],
  }));
  return {
    schemaVersion: "1.0.0",
    terrainId: "terrain.macro-streaming-test.v1",
    boundsLocalM: [0, 0, 196_608, 65_536],
    quantization,
    bundle: { uri: "macro.terrain", byteLength: 36, sha256: "d".repeat(64) },
    chunks,
  };
}

function adjacentTerrainFixture() {
  const sources = [
    {
      id: "west",
      boundsLocalM: [0, 0, 2, 2],
      levels: [
        { sampleCount: 3, values: [0, 10, 40, 0, 10, 40, 0, 10, 40] },
        { sampleCount: 2, values: [0, 40, 0, 40] },
      ],
    },
    {
      id: "east",
      boundsLocalM: [2, 0, 4, 2],
      levels: [
        { sampleCount: 3, values: [40, 90, 160, 40, 90, 160, 40, 90, 160] },
        { sampleCount: 2, values: [40, 160, 40, 160] },
      ],
    },
  ];
  const records = [];
  let byteOffset = 0;
  const chunks = sources.map((source) => ({
    id: source.id,
    boundsLocalM: source.boundsLocalM,
    lods: source.levels.map((level, levelIndex) => {
      const bytes = new Uint8Array(level.values.length * 2);
      const view = new DataView(bytes.buffer);
      for (let index = 0; index < level.values.length; index++) {
        view.setInt16(index * 2, level.values[index], true);
      }
      const record = {
        level: levelIndex,
        sampleCount: level.sampleCount,
        byteOffset,
        byteLength: bytes.byteLength,
        spacingM: 2 / (level.sampleCount - 1),
      };
      byteOffset += bytes.byteLength;
      records.push(bytes);
      return record;
    }),
  }));
  const bundle = new Uint8Array(byteOffset);
  let destinationOffset = 0;
  for (const record of records) {
    bundle.set(record, destinationOffset);
    destinationOffset += record.byteLength;
  }
  return {
    manifest: {
      schemaVersion: "1.0.0",
      terrainId: "terrain.adjacent-test.v1",
      boundsLocalM: [0, 0, 4, 2],
      quantization,
      bundle: {
        uri: "adjacent.terrain",
        byteLength: bundle.byteLength,
        sha256: "b".repeat(64),
      },
      chunks,
    },
    bundle: bundle.buffer,
  };
}

function normalAt(entry, vertexIndex) {
  const normals = entry.mesh.geometry.getAttribute("normal");
  return [normals.getX(vertexIndex), normals.getY(vertexIndex), normals.getZ(vertexIndex)];
}

function baseBoundaryNormalAt(entry, vertexIndex) {
  const boundaryIndex = entry.normalBoundary.indices.indexOf(vertexIndex);
  assert.notEqual(boundaryIndex, -1);
  const offset = boundaryIndex * 3;
  return [...entry.normalBoundary.normals.slice(offset, offset + 3)];
}

function assertVectorNear(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) {
    assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance,
      `${actual[index]} should be within ${tolerance} of ${expected[index]}`);
  }
}

function applyLegacyNormalPostProcessing(geometry, chunk, decoded) {
  const { water, sampleCount } = decoded;
  const heights = reconstructWaterHeights(decoded);
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = chunk.boundsLocalM;
  const spacingEast = (maximumEast - minimumEast) / (sampleCount - 1);
  const spacingNorth = (maximumNorth - minimumNorth) / (sampleCount - 1);
  const smoothed = new Float32Array(heights.length);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      let weightedHeight = 0;
      let totalWeight = 0;
      for (let northOffset = -2; northOffset <= 2; northOffset++) {
        const adjacentNorth = Math.min(sampleCount - 1, Math.max(0, north + northOffset));
        for (let eastOffset = -2; eastOffset <= 2; eastOffset++) {
          const adjacentEast = Math.min(sampleCount - 1, Math.max(0, east + eastOffset));
          const weight = 1 / (1 + Math.abs(eastOffset) + Math.abs(northOffset));
          weightedHeight += heights[adjacentNorth * sampleCount + adjacentEast] * weight;
          totalWeight += weight;
        }
      }
      smoothed[north * sampleCount + east] = weightedHeight / totalWeight;
    }
  }

  const normals = geometry.getAttribute("normal");
  for (let north = 0; north < sampleCount; north++) {
    const south = Math.max(0, north - 1);
    const northNeighbour = Math.min(sampleCount - 1, north + 1);
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      if (water[index]) {
        normals.setXYZ(index, 0, 1, 0);
        continue;
      }
      const west = Math.max(0, east - 1);
      const eastNeighbour = Math.min(sampleCount - 1, east + 1);
      const eastSlope = (
        smoothed[north * sampleCount + eastNeighbour]
        - smoothed[north * sampleCount + west]
      ) / Math.max(spacingEast, (eastNeighbour - west) * spacingEast);
      const northSlope = (
        smoothed[northNeighbour * sampleCount + east]
        - smoothed[south * sampleCount + east]
      ) / Math.max(spacingNorth, (northNeighbour - south) * spacingNorth);
      const length = Math.hypot(eastSlope, 1, northSlope);
      normals.setXYZ(index, -eastSlope / length, 1 / length, northSlope / length);
    }
  }

  const perimeter = [];
  for (let east = 0; east < sampleCount; east++) perimeter.push(east);
  for (let north = 1; north < sampleCount; north++) {
    perimeter.push(north * sampleCount + sampleCount - 1);
  }
  for (let east = sampleCount - 2; east >= 0; east--) {
    perimeter.push((sampleCount - 1) * sampleCount + east);
  }
  for (let north = sampleCount - 2; north > 0; north--) {
    perimeter.push(north * sampleCount);
  }
  const skirtStart = sampleCount * sampleCount;
  for (let perimeterIndex = 0; perimeterIndex < perimeter.length; perimeterIndex++) {
    const source = perimeter[perimeterIndex];
    for (const skirtVertex of [
      skirtStart + perimeterIndex * 2,
      skirtStart + perimeterIndex * 2 + 1,
    ]) {
      normals.setXYZ(skirtVertex,
        normals.getX(source),
        normals.getY(source),
        normals.getZ(source));
    }
  }
}

test("validates range-addressable terrain records and rejects overruns", () => {
  assert.equal(validateTerrainManifest(manifest()).terrainId, "terrain.test.v1");
  const invalid = manifest();
  invalid.chunks[0].lods[0].byteOffset = 4;
  assert.throws(() => validateTerrainManifest(invalid), /Invalid Korea terrain LOD/);
});

test("validates paged atlas manifests and rejects duplicate page identities", () => {
  const atlas = {
    schemaVersion: "2.0.0",
    terrainId: "terrain.atlas-test.v1",
    boundsLocalM: [0, 0, 16, 8],
    tileSpanM: 8,
    pageSpanM: 8,
    pages: [{
      id: "west",
      boundsLocalM: [0, 0, 8, 8],
      manifest: { uri: "west.json", byteLength: 100, sha256: "c".repeat(64) },
    }],
  };
  assert.equal(validateTerrainAtlasManifest(atlas).terrainId, "terrain.atlas-test.v1");
  atlas.pages.push(structuredClone(atlas.pages[0]));
  assert.throws(() => validateTerrainAtlasManifest(atlas), /Invalid Korea terrain atlas page/);
});

test("reconstructs bank-height water without sea-level slot trenches", () => {
  const values = new Int16Array([
    -32768, -32768, 100,
    -32768, -32768, 200,
    300, 400, 500,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  assert.equal(decoded.heights[2], 10);
  assert.equal(decoded.water[0], 1);
  assert.deepEqual([...reconstructWaterHeights(decoded)].slice(0, 6), [10, 10, 10, 30, 10, 20],
    "narrow inland water should inherit the nearest low bank instead of sentinel height zero");
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);
  assert.ok(built.triangleCount > 0);
  assert.equal(built.surfaceTriangleCount, 8,
    "water and land must share one continuous triangulation for a smooth shoreline");
  assert.equal(built.geometry.attributes.position.count, 25);
  assert.equal(built.geometry.attributes.terrainWater.getX(0), 1);
  assert.equal(built.geometry.attributes.landcover.itemSize, 2);
  assert.equal(built.geometry.attributes.landcover.normalized, true,
    "two baked bytes should arrive in the shader as normalized land-cover weights");
  assert.equal(built.geometry.attributes.landcover.count,
    built.geometry.attributes.position.count,
    "surface and skirt vertices both need the seamless land-cover field");
  assert.equal(built.geometry.attributes.position.getY(0), 10);
  assert.equal(built.triangleCount - built.surfaceTriangleCount, 12,
    "land-bearing chunk edges must receive crack-hiding skirt triangles");
  assert.ok(built.skirtDepthM >= 200);
  assert.ok(built.geometry.attributes.normal.getY(4) > 0,
    "north-to-renderer Z conversion must leave the terrain front-facing from above");
  built.geometry.dispose();

  const allWater = decodeTerrainRecord(
    new Int16Array(9).fill(-32768).buffer,
    record,
    quantization,
  );
  const waterBuilt = createTerrainGeometry(THREE, manifest().chunks[0], allWater);
  assert.equal(waterBuilt.surfaceTriangleCount, 8,
    "an all-water chunk must draw the analytic water surface");
  assert.equal(waterBuilt.triangleCount, 8,
    "an all-water chunk must not add underwater skirts");
  waterBuilt.geometry.dispose();
});

test("bakes a concavity attribute so valley floors read as enclosed", () => {
  // Heights are decimetres (metresPerUnit 0.1): a 100 m plateau with a single
  // 0 m pit at the centre. The pit is the most concave sample in the grid.
  const values = new Int16Array([
    1000, 1000, 1000,
    1000, 0, 1000,
    1000, 1000, 1000,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);

  const concavity = built.geometry.getAttribute("concavity");
  assert.ok(concavity, "terrain geometry must carry a baked concavity attribute");
  assert.equal(concavity.itemSize, 1);
  assert.equal(concavity.count, built.geometry.getAttribute("position").count,
    "every vertex, skirts included, needs a concavity value");
  assert.ok(concavity.getX(4) < 0.5,
    "the pit at the centre must read as concave");
  for (let index = 0; index < concavity.count; index++) {
    const value = concavity.getX(index);
    assert.ok(value >= 0 && value <= 1, `concavity ${value} must stay in [0, 1]`);
  }
  built.geometry.dispose();
});

test("concavity fades to neutral at chunk edges so neighbours cannot seam", () => {
  // Each chunk can only see its own samples, so a clamped neighbourhood at the boundary would
  // give the SAME world position a different value in each of the two chunks that share it —
  // painting a visible grid of seams every 16 km. Forcing the boundary to exactly 0.5 makes both
  // sides agree by construction.
  const values = new Int16Array([
    1000, 1000, 1000,
    1000, 0, 1000,
    1000, 1000, 1000,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);
  const concavity = built.geometry.getAttribute("concavity");

  // Every perimeter sample of the 3x3 grid sits on the chunk boundary.
  for (const index of [0, 1, 2, 3, 5, 6, 7, 8]) {
    assert.equal(concavity.getX(index), 0.5,
      `boundary sample ${index} must be exactly neutral`);
  }
  built.geometry.dispose();
});

test("worker-baked Ukraine land cover is deterministic, varied, and seamless by world position", () => {
  const sampleCount = 9;
  const decoded = {
    sampleCount,
    heights: new Float32Array(sampleCount * sampleCount).fill(100),
    water: new Uint8Array(sampleCount * sampleCount),
  };
  const spanM = TERRAIN_LANDCOVER_MACRO_CELL_M * 4;
  const west = buildTerrainMeshArrays([0, 0, spanM, spanM], decoded);
  const repeated = buildTerrainMeshArrays([0, 0, spanM, spanM], decoded);
  const east = buildTerrainMeshArrays([spanM, 0, spanM * 2, spanM], decoded);

  assert.deepEqual(west.landcover, repeated.landcover,
    "the worker field must not depend on load order or chunk identity");
  assert.ok(new Set(west.landcover.slice(0, sampleCount * sampleCount * 2)).size > 8,
    "macro and meso weights should add readable variation within a terrain tile");
  for (let north = 0; north < sampleCount; north++) {
    const westIndex = (north * sampleCount + sampleCount - 1) * 2;
    const eastIndex = (north * sampleCount) * 2;
    assert.deepEqual(
      [...west.landcover.slice(westIndex, westIndex + 2)],
      [...east.landcover.slice(eastIndex, eastIndex + 2)],
      `shared boundary sample ${north} must be byte-identical`,
    );
  }
  assert.ok(TERRAIN_LANDCOVER_MESO_CELL_M < TERRAIN_LANDCOVER_MACRO_CELL_M);

  const fineSampleCount = 65;
  const fineDecoded = {
    sampleCount: fineSampleCount,
    heights: new Float32Array(fineSampleCount * fineSampleCount).fill(100),
    water: new Uint8Array(fineSampleCount * fineSampleCount),
  };
  const fine = buildTerrainMeshArrays([0, 0, 8_192, 8_192], fineDecoded);
  const fieldHistory = [];
  for (let index = 0; index < fineSampleCount * fineSampleCount; index++) {
    fieldHistory.push(fine.landcover[index * 2 + 1]);
  }
  assert.ok(Math.min(...fieldHistory) < 40,
    "the reused second channel must carry sparse former access-track lows");
  assert.ok(Math.max(...fieldHistory) - Math.min(...fieldHistory) > 140,
    "large former-field planes must remain readable without a texture or extra draw");
});

test("non-Ukraine terrain skips the optional land-cover bake and uses a neutral shader default", () => {
  const sampleCount = 9;
  const decoded = {
    sampleCount,
    heights: new Float32Array(sampleCount * sampleCount).fill(100),
    water: new Uint8Array(sampleCount * sampleCount),
    includeLandcover: false,
  };
  const built = buildTerrainMeshArrays([0, 0, 1_800, 1_800], decoded);
  assert.equal(built.landcover.length, 0,
    "Korea must not pay the Ukraine macro-field CPU or buffer cost");

  const chunk = {
    id: "non-ukraine",
    boundsLocalM: [0, 0, 1_800, 1_800],
  };
  const geometry = createTerrainGeometry(THREE, chunk, decoded).geometry;
  assert.equal(geometry.getAttribute("landcover"), undefined);

  const material = createTerrainMaterial(THREE, { sceneryEra: "1950s" });
  assert.deepEqual(material.defaultAttributeValues.landcover, [0.5, 0.5]);
  geometry.dispose();
  material.dispose();
});

test("skirt vertices inherit their source surface normal so they never shade as black walls", () => {
  // Skirts are near-vertical crack-hiding curtains dropped below each perimeter vertex. Their own
  // wall normals have dot(N, sun) ~= 0, so once the shadow floor dropped from 0.43 to 0.12 they
  // render as near-black slabs, most visibly at waterlines. computeVertexNormals() assigns those
  // wall normals; this asserts they are overwritten with the top-surface normal, which makes the
  // skirt shade as a continuation of the terrain edge and vanish.
  // A flat plateau: every surface normal is exactly (0, 1, 0), while computeVertexNormals() would
  // give each vertical skirt wall a ~horizontal normal. So an inherited-vs-wall normal is an
  // unambiguous difference, and the RED run confirmed the walls start out un-inherited.
  const values = new Int16Array([
    500, 500, 500,
    500, 500, 500,
    500, 500, 500,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);
  const normal = built.geometry.getAttribute("normal");

  // 3x3 grid: baseVertexCount 9 is skirtStart. Perimeter order is the same one the builder walks:
  // top row, right column, bottom row (reversed), left column (reversed).
  const perimeter = [0, 1, 2, 5, 8, 7, 6, 3];
  for (let i = 0; i < perimeter.length; i++) {
    const source = perimeter[i];
    for (const skirtVertex of [9 + i * 2, 9 + i * 2 + 1]) {
      assert.ok(
        Math.abs(normal.getX(skirtVertex) - normal.getX(source)) < 1e-6
        && Math.abs(normal.getY(skirtVertex) - normal.getY(source)) < 1e-6
        && Math.abs(normal.getZ(skirtVertex) - normal.getZ(source)) < 1e-6,
        `skirt vertex ${skirtVertex} must carry source vertex ${source}'s normal`);
    }
  }
  // The source normals must be genuinely surface-facing (mostly +Y), not the ~horizontal wall
  // normals — otherwise the assertion above would pass trivially on two equal wrong values.
  assert.ok(normal.getY(0) > 0.5, "a perimeter surface vertex must face upward");
  built.geometry.dispose();
});

test("analytic heightfield normals match the legacy final normals within tolerance", () => {
  const chunk = {
    id: "normal-equivalence",
    boundsLocalM: [0, 0, 8, 12],
  };
  const decoded = {
    sampleCount: 5,
    heights: Float32Array.from([
      10, 14, 25, 18, 12,
      8, 20, 38, 24, 15,
      6, 16, 0, 32, 19,
      9, 22, 41, 28, 17,
      12, 18, 29, 21, 14,
    ]),
    water: Uint8Array.from([
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ]),
  };
  const built = createTerrainGeometry(THREE, chunk, decoded);
  const legacy = built.geometry.clone();
  legacy.deleteAttribute("normal");
  legacy.computeVertexNormals();
  applyLegacyNormalPostProcessing(legacy, chunk, decoded);

  const analyticNormals = built.geometry.getAttribute("normal").array;
  const legacyNormals = legacy.getAttribute("normal").array;
  assert.equal(analyticNormals.length, legacyNormals.length);
  for (let index = 0; index < analyticNormals.length; index++) {
    assert.ok(Math.abs(analyticNormals[index] - legacyNormals[index]) <= 1e-6,
      `normal component ${index} must preserve the computeVertexNormals result after smoothing`);
  }
  legacy.dispose();
  built.geometry.dispose();
});

test("concavity is deterministic across repeated builds", () => {
  const values = new Int16Array([1000, 400, 1000, 250, 0, 250, 1000, 400, 1000]);
  const record = manifest().chunks[0].lods[0];
  const first = createTerrainGeometry(THREE, manifest().chunks[0],
    decodeTerrainRecord(values.buffer, record, quantization));
  const second = createTerrainGeometry(THREE, manifest().chunks[0],
    decodeTerrainRecord(values.buffer, record, quantization));
  assert.deepEqual(
    Array.from(first.geometry.getAttribute("concavity").array),
    Array.from(second.geometry.getAttribute("concavity").array),
  );
  first.geometry.dispose();
  second.geometry.dispose();
});

test("selects progressively coarser LODs with tier-specific distance", () => {
  // Weak tiers floor at LOD1 (129^2): mobile/balanced never draw the 257^2 LOD0 surface, nor its
  // LOD0-only near-chunk scenery, even at the surface. This caps near-ground fill-rate/overdraw.
  assert.equal(selectTerrainLod(5_000, "balanced", 4), 1);
  assert.equal(selectTerrainLod(30_000, "balanced", 4), 1);
  assert.equal(selectTerrainLod(70_000, "balanced", 4), 2);
  assert.equal(selectTerrainLod(200_000, "balanced", 4), 3);
  assert.equal(selectTerrainLod(5_000, "mobile", 4), 1);
  assert.equal(selectTerrainLod(12_000, "mobile", 4), 1);
  // Desktop retains full near-ground detail at LOD0.
  assert.equal(selectTerrainLod(5_000, "desktop", 4), 0);
  assert.equal(selectTerrainLod(12_000, "desktop", 4), 0);
  // Broad, low-relief Ukraine keeps a tight LOD0 ring instead of paying Korea's mountain budget.
  assert.equal(selectTerrainLod(4_000, "ukraine-desktop", 4), 0);
  assert.equal(selectTerrainLod(6_000, "ukraine-desktop", 4), 1);
  assert.equal(selectTerrainLod(25_000, "ukraine-desktop", 4), 2);
  // The floor is clamped to the chunk's coarsest level, so a single-LOD chunk is unaffected.
  assert.equal(selectTerrainLod(0, "balanced", 1), 0);
  // Hysteresis retains the current LOD across a small threshold crossing (desktop keeps LOD0).
  assert.equal(selectTerrainLod(41_000, "desktop", 4, 0), 0,
    "a small outward threshold crossing should retain the current LOD");
  assert.equal(selectTerrainLod(46_000, "desktop", 4, 0), 1);
  assert.equal(selectTerrainLod(37_000, "desktop", 4, 1), 1,
    "a small inward threshold crossing should retain the current LOD");
  assert.equal(selectTerrainLod(34_000, "desktop", 4, 1), 0);
});

test("bounds Ukraine ambient scenery independently from terrain residency", () => {
  assert.equal(ambientSceneryRadiusM("mobile", "ukraine-modern"), 8_000);
  assert.equal(ambientSceneryRadiusM("balanced", "ukraine-modern"), 12_000);
  assert.equal(ambientSceneryRadiusM("desktop", "ukraine-modern"), 6_000);
  assert.equal(ambientSceneryRadiusM("mobile", "1950s"), Number.POSITIVE_INFINITY);
});

test("uses the active ocean curvature contract for terrain presentation", () => {
  assert.equal(terrainCurvatureDropM(12_000), 0);
  assert.ok(Math.abs(terrainCurvatureDropM(45_000) - 85.4654) < 0.001,
    "terrain must match the active ocean's 12 km / Earth-radius curvature");
});

test("uses HTTP ranges and safely falls back when a server returns the complete bundle", async () => {
  const complete = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
  let fetchReceiver = "not-called";
  const bindingReader = new TerrainBundleReader("https://game.test/terrain", 6,
    async function (_url, options) {
      fetchReceiver = this;
      assert.equal(options.headers.Range, "bytes=0-0");
      return { ok: true, status: 206, arrayBuffer: async () => complete.slice(0, 1) };
    });
  await bindingReader.read({ byteOffset: 0, byteLength: 1 });
  assert.equal(fetchReceiver, undefined,
    "the native fetch implementation must not receive TerrainBundleReader as its receiver");

  const requested = [];
  const rangeReader = new TerrainBundleReader("https://game.test/terrain", 6,
    async (_url, options) => {
      requested.push(options.headers.Range);
      return { ok: true, status: 206, arrayBuffer: async () => complete.slice(2, 5) };
    });
  const record = { byteOffset: 2, byteLength: 3 };
  assert.deepEqual([...new Uint8Array(await rangeReader.read(record))], [3, 4, 5]);
  assert.deepEqual([...new Uint8Array(await rangeReader.read(record))], [3, 4, 5]);
  assert.deepEqual(requested, ["bytes=2-4"]);
  assert.deepEqual(rangeReader.diagnostics(), {
    networkRequests: 1,
    networkBytes: 3,
    cachedRanges: 1,
    pendingRanges: 0,
    rangeCacheHits: 1,
    completeBundleFallback: false,
    rangeSupported: true,
  });

  let calls = 0;
  const completeReader = new TerrainBundleReader("https://game.test/terrain", 6,
    async () => {
      calls++;
      return { ok: true, status: 200, arrayBuffer: async () => complete };
    });
  const [completeRange, completeStart] = await Promise.all([
    completeReader.read(record),
    completeReader.read({ byteOffset: 0, byteLength: 2 }),
    completeReader.read({ byteOffset: 1, byteLength: 1 }),
    completeReader.read({ byteOffset: 3, byteLength: 1 }),
    completeReader.read({ byteOffset: 4, byteLength: 1 }),
    completeReader.read({ byteOffset: 5, byteLength: 1 }),
  ]);
  assert.deepEqual([...new Uint8Array(completeRange)], [3, 4, 5]);
  assert.deepEqual([...new Uint8Array(completeStart)], [1, 2]);
  assert.equal(calls, 1);
  assert.equal(completeReader.diagnostics().networkBytes, 6,
    "a Range-ignorant server must download the full bundle at most once");
});

test("bounds the successful range cache with least-recently-used eviction", async () => {
  const source = new Uint8Array([1, 2, 3, 4]).buffer;
  const requests = [];
  const reader = new TerrainBundleReader("https://game.test/terrain", 4,
    async (_url, options) => {
      requests.push(options.headers.Range);
      const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => source.slice(Number(match[1]), Number(match[2]) + 1),
      };
    }, 2);
  await reader.read({ byteOffset: 0, byteLength: 1 });
  await reader.read({ byteOffset: 1, byteLength: 1 });
  await reader.read({ byteOffset: 0, byteLength: 1 });
  await reader.read({ byteOffset: 2, byteLength: 1 });
  await reader.read({ byteOffset: 1, byteLength: 1 });
  assert.deepEqual(requests, ["bytes=0-0", "bytes=1-1", "bytes=2-2", "bytes=1-1"]);
  assert.equal(reader.diagnostics().cachedRanges, 2);
});

test("builds at most one nearest terrain chunk per frame and drains queued builds", async () => {
  const source = streamingManifest();
  const scheduledFrames = new Map();
  let nextFrameId = 1;
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/streaming.manifest.json",
    lazyChunks: true,
    maximumConcurrentLoads: 3,
    requestTerrainBuildFrame: (callback) => {
      const id = nextFrameId++;
      scheduledFrames.set(id, callback);
      return id;
    },
    cancelTerrainBuildFrame: (id) => scheduledFrames.delete(id),
    fetch: async (_url, options = {}) => {
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });

  terrain.update({ cameraPosition: new THREE.Vector3(21, 500, -1) });
  for (let attempt = 0;
    attempt < 20 && terrain.diagnostics().queuedBuilds !== 3;
    attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(terrain.diagnostics().queuedBuilds, 3);
  assert.equal(scheduledFrames.size, 1,
    "all ready chunks must share one pending animation-frame callback");

  const runFrame = () => {
    assert.equal(scheduledFrames.size, 1);
    const [id, callback] = scheduledFrames.entries().next().value;
    scheduledFrames.delete(id);
    callback();
  };
  runFrame();
  assert.equal(terrain.diagnostics().residentChunks, 1,
    "one animation frame may build only one chunk");
  assert.ok(terrain.entries.get("near").mesh,
    "the closest ready chunk must be built before manifest-order chunks");
  assert.equal(terrain.entries.get("middle").mesh, null);
  assert.equal(terrain.entries.get("far").mesh, null);

  const residentGeometry = terrain.entries.get("near").mesh.geometry;
  await terrain.requestLevel(terrain.entries.get("near"), 0);
  assert.equal(terrain.entries.get("near").mesh.geometry, residentGeometry,
    "requesting an already-resident LOD must not rebuild its geometry");

  runFrame();
  assert.equal(terrain.diagnostics().residentChunks, 2,
    "the following frame may build exactly one more chunk");
  assert.equal(terrain.diagnostics().queuedBuilds, 1);
  terrain.dispose();
  assert.equal(scheduledFrames.size, 0,
    "teardown must cancel the frame callback for queued geometry");
  assert.equal(terrain.diagnostics().queuedBuilds, 0,
    "teardown must drain queued geometry work");
});

test("lazy streaming loads and retains a large macro chunk by footprint distance", async () => {
  const source = macroStreamingManifest();
  const ranges = [];
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/macro-streaming.manifest.json",
    lazyChunks: true,
    chunkLoadRadiusM: 12_000,
    chunkEvictRadiusM: 14_000,
    maximumConcurrentLoads: 1,
    fetch: async (_url, options = {}) => {
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      ranges.push(options.headers.Range);
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });
  await terrain.ready;
  assert.equal(ranges.length, 0,
    "lazy construction must not fetch the whole theatre before mission-local warmup");
  assert.equal(terrain.diagnostics().residentChunks, 0);
  assert.equal(terrain.diagnostics().localResidentChunks, 0);

  const placementEastM = 100_000;
  const placementNorthM = -20_000;
  const worldPosition = (localEastM, localNorthM) => new THREE.Vector3(
    placementEastM + localEastM,
    500,
    -(placementNorthM + localNorthM),
  );
  terrain.update({
    cameraPosition: worldPosition(1, 32_768),
    placementEastM,
    placementNorthM,
  });
  await terrain.whenIdle();
  let diagnostics = terrain.diagnostics();
  assert.equal(ranges.length, 1);
  assert.ok(terrain.entries.get("macro-under-aircraft").mesh,
    "a camera inside the chunk must load it even when its centre is beyond the radius");
  assert.equal(terrain.entries.get("macro-remote").mesh, null);
  assert.equal(diagnostics.placementEastM, placementEastM);
  assert.equal(diagnostics.placementNorthM, placementNorthM);
  assert.equal(diagnostics.residentChunks, 1);
  assert.equal(diagnostics.localResidentChunks, 1);

  terrain.update({
    placementEastM: placementEastM + 250_000,
    placementNorthM,
  });
  diagnostics = terrain.diagnostics();
  assert.equal(diagnostics.residentChunks, 1);
  assert.equal(diagnostics.localResidentChunks, 0,
    "changing mission placement without a new camera update must invalidate local warmth");
  assert.equal(diagnostics.placementEastM, placementEastM + 250_000);

  terrain.update({
    cameraPosition: worldPosition(1, 32_768),
    placementEastM,
    placementNorthM,
  });
  assert.equal(terrain.diagnostics().localResidentChunks, 1);

  terrain.update({ cameraPosition: worldPosition(-13_000, 32_768) });
  diagnostics = terrain.diagnostics();
  assert.equal(diagnostics.residentChunks, 1,
    "the eviction hysteresis ring must retain the already-built macro chunk");
  assert.equal(diagnostics.localResidentChunks, 0,
    "a retained chunk outside the load footprint must not satisfy local warmup");

  terrain.update({ cameraPosition: worldPosition(-15_000, 32_768) });
  assert.equal(terrain.diagnostics().residentChunks, 0,
    "the chunk must evict once distance from its nearest bound exceeds the eviction radius");

  terrain.update({
    cameraPosition: worldPosition(-15_000, 32_768),
    streamPosition: worldPosition(1, 32_768),
  });
  await terrain.whenIdle();
  diagnostics = terrain.diagnostics();
  assert.equal(diagnostics.residentChunks, 1,
    "look-ahead coverage inside the footprint must request the macro chunk");
  assert.equal(diagnostics.localResidentChunks, 1);
  terrain.dispose();
});

test("streams atlas pages around the aircraft and evicts pages behind it", async () => {
  const pageManifest = (id, minimumEastM) => ({
    schemaVersion: "1.0.0",
    terrainId: `terrain.page-${id}.v1`,
    boundsLocalM: [minimumEastM, 0, minimumEastM + 8, 8],
    quantization,
    bundle: { uri: `${id}.terrain`, byteLength: 18, sha256: id.repeat(64).slice(0, 64) },
    chunks: [{
      id: `${id}-chunk`,
      boundsLocalM: [minimumEastM, 0, minimumEastM + 8, 8],
      lods: [{ level: 0, sampleCount: 3, byteOffset: 0, byteLength: 18, spacingM: 4 }],
    }],
  });
  const west = pageManifest("d", 0);
  const east = pageManifest("e", 8);
  const atlas = {
    schemaVersion: "2.0.0",
    terrainId: "terrain.korea.atlas-stream-test.v1",
    boundsLocalM: [0, 0, 16, 8],
    tileSpanM: 8,
    pageSpanM: 8,
    pages: [
      {
        id: "west",
        boundsLocalM: [0, 0, 8, 8],
        manifest: { uri: "west.manifest.json", byteLength: 100, sha256: "f".repeat(64) },
      },
      {
        id: "east",
        boundsLocalM: [8, 0, 16, 8],
        manifest: { uri: "east.manifest.json", byteLength: 100, sha256: "a".repeat(64) },
      },
    ],
  };
  const requested = [];
  let pageFetchReceiver = "not-called";
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/korea.atlas.json",
    qualityTier: "balanced",
    pageLoadRadiusM: 1,
    pageEvictRadiusM: 2,
    chunkLoadRadiusM: 6,
    chunkEvictRadiusM: 8,
    lookAheadSeconds: 0,
    maximumPageLoads: 1,
    maximumConcurrentLoads: 1,
    fetch: async function (url, options = {}) {
      pageFetchReceiver = this;
      requested.push({ url: String(url), range: options.headers?.Range ?? null });
      if (String(url).endsWith("korea.atlas.json")) {
        return { ok: true, status: 200, json: async () => atlas };
      }
      if (String(url).includes("west.manifest.json")) {
        return { ok: true, status: 200, json: async () => west };
      }
      if (String(url).includes("east.manifest.json")) {
        return { ok: true, status: 200, json: async () => east };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });

  pageFetchReceiver = "not-called";
  terrain.update({ cameraPosition: new THREE.Vector3(1, 500, -4), deltaSeconds: 1 });
  await terrain.whenIdle();
  assert.equal(pageFetchReceiver, undefined,
    "atlas page/bundle fetch must not bind the atlas presentation as receiver");
  assert.equal(terrain.diagnostics().residentPages, 1);
  assert.equal(terrain.diagnostics().residentChunks, 1);
  assert.equal(terrain.diagnostics().localResidentChunks, 1);
  assert.equal(terrain.diagnostics().localSceneryChunks, 0);
  // A 206-answering server must report healthy range streaming with no whole-bundle fallback.
  assert.equal(terrain.diagnostics().rangeSupportedPages, 1);
  assert.equal(terrain.diagnostics().completeBundleFallbackPages, 0);
  const westPresentation = terrain.pages.get("west").presentation;
  assert.equal(westPresentation.streamingRadiusM, 6);
  assert.equal(terrain.setStreamingRadiusM(3), true);
  assert.equal(terrain.streamingRadiusM, 3);
  assert.equal(terrain.pageLoadRadiusM, 3,
    "atlas page loading must shrink with the public streaming radius");
  assert.equal(westPresentation.streamingRadiusM, 3,
    "already-loaded page presentations must obey governor radius changes");
  assert.ok(westPresentation.chunkEvictRadiusM >= westPresentation.streamingRadiusM);
  assert.equal(terrain.setStreamingRadiusM(6), true);
  assert.equal(westPresentation.streamingRadiusM, 6,
    "restoring the atlas radius must restore child page streaming too");
  terrain.update({ cameraPosition: new THREE.Vector3(15, 500, -4), deltaSeconds: 1 });
  await terrain.whenIdle();
  assert.equal(terrain.diagnostics().residentPages, 1);
  assert.equal(terrain.diagnostics().residentChunks, 1);
  assert.equal(terrain.diagnostics().localResidentChunks, 1);
  assert.equal(terrain.pages.get("west").presentation, null);
  assert.ok(terrain.pages.get("east").presentation);
  assert.equal(requested.filter((request) => request.range).length, 2);
  terrain.dispose();
});

test("atlas diagnostics name a Range-ignorant server instead of stalling silently", async () => {
  // A server that answers 200 with the full body sends TerrainBundleReader down its whole-bundle
  // fallback. That path is correct but catastrophic at atlas scale, and it used to present only as
  // an unexplained multi-second stall somewhere downstream. The atlas must report it by name.
  const page = {
    schemaVersion: "1.0.0",
    terrainId: "terrain.page-rangeless.v1",
    boundsLocalM: [0, 0, 8, 8],
    quantization,
    bundle: { uri: "rangeless.terrain", byteLength: 18, sha256: "b".repeat(64) },
    chunks: [{
      id: "rangeless-chunk",
      boundsLocalM: [0, 0, 8, 8],
      lods: [{ level: 0, sampleCount: 3, byteOffset: 0, byteLength: 18, spacingM: 4 }],
    }],
  };
  const atlas = {
    schemaVersion: "2.0.0",
    terrainId: "terrain.korea.atlas-rangeless-test.v1",
    boundsLocalM: [0, 0, 8, 8],
    tileSpanM: 8,
    pageSpanM: 8,
    pages: [{
      id: "only",
      boundsLocalM: [0, 0, 8, 8],
      manifest: { uri: "only.manifest.json", byteLength: 100, sha256: "c".repeat(64) },
    }],
  };
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/rangeless.atlas.json",
    qualityTier: "balanced",
    pageLoadRadiusM: 1,
    pageEvictRadiusM: 2,
    chunkLoadRadiusM: 6,
    chunkEvictRadiusM: 8,
    lookAheadSeconds: 0,
    maximumPageLoads: 1,
    maximumConcurrentLoads: 1,
    fetch: async (url) => {
      if (String(url).endsWith("rangeless.atlas.json")) {
        return { ok: true, status: 200, json: async () => atlas };
      }
      if (String(url).includes("only.manifest.json")) {
        return { ok: true, status: 200, json: async () => page };
      }
      // The defining behaviour: Range requested, Range ignored, whole bundle returned.
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(18) };
    },
  });

  terrain.update({ cameraPosition: new THREE.Vector3(1, 500, -4), deltaSeconds: 1 });
  await terrain.whenIdle();
  const diagnostics = terrain.diagnostics();
  assert.equal(diagnostics.residentPages, 1, "the page must still load — the fallback is not a failure");
  assert.equal(diagnostics.completeBundleFallbackPages, 1);
  assert.equal(diagnostics.rangeSupportedPages, 0);
  terrain.dispose();
});

test("passes atlas-root mission exclusions into page workers without duplicating features", async () => {
  const pack = JSON.parse(await readFile(new URL(
    "../../../content/packs/ukraine-modern/environment/hero-cells/"
      + "soniachne-clinic-a.feature-pack.json",
    import.meta.url,
  ), "utf8"));
  const boundsLocalM = [-4_700, 3_600, -3_700, 4_600];
  const page = {
    schemaVersion: "1.0.0",
    terrainId: "terrain.ukraine.exclusion-page.v1",
    boundsLocalM,
    quantization,
    bundle: {
      uri: "exclusion.terrain",
      byteLength: 18,
      sha256: "b".repeat(64),
    },
    chunks: [{
      id: "exclusion-chunk",
      boundsLocalM,
      generation: { seed: 17, landFraction: 1 },
      lods: [{
        level: 0,
        sampleCount: 3,
        byteOffset: 0,
        byteLength: 18,
        spacingM: 500,
      }],
    }],
  };
  const atlas = {
    schemaVersion: "2.0.0",
    terrainId: "terrain.ukraine.exclusion-atlas.v1",
    boundsLocalM,
    tileSpanM: 1_000,
    pageSpanM: 1_000,
    pages: [{
      id: "hero",
      boundsLocalM,
      manifest: {
        uri: "hero.manifest.json",
        byteLength: 100,
        sha256: "c".repeat(64),
      },
    }],
  };
  const workers = stubMeshWorkers();
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/exclusion.atlas.json",
    qualityTier: "balanced",
    sceneryEra: "ukraine-modern",
    missionFeaturePack: pack,
    missionFeaturePackSha256: "d".repeat(64),
    pageLoadRadiusM: 1_500,
    pageEvictRadiusM: 2_000,
    chunkLoadRadiusM: 1_500,
    chunkEvictRadiusM: 2_000,
    lookAheadSeconds: 0,
    maximumPageLoads: 1,
    maximumConcurrentLoads: 1,
    createTerrainMeshWorker: workers.factory,
    terrainMeshWorkerCount: 1,
    fetch: async (url, options = {}) => {
      if (String(url).endsWith("exclusion.atlas.json")) {
        return { ok: true, status: 200, json: async () => atlas };
      }
      if (String(url).includes("hero.manifest.json")) {
        return { ok: true, status: 200, json: async () => page };
      }
      assert.equal(options.headers?.Range, "bytes=0-17");
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });

  terrain.update({
    cameraPosition: new THREE.Vector3(-4_208, 500, -4_096),
    deltaSeconds: 1,
  });
  await terrain.whenIdle();

  const expectedZones = [
    { eastM: -4_222, northM: 4_100, radiusM: 76 },
    { eastM: -4_173, northM: 4_076, radiusM: 48 },
    { eastM: -3_968, northM: 4_096, radiusM: 140 },
  ];
  const pagePresentation = terrain.pages.get("hero").presentation;
  assert.ok(pagePresentation);
  assert.equal(pagePresentation.missionFeaturePack, null,
    "the authored feature root must remain atlas-owned rather than duplicating once per page");
  assert.deepEqual(pagePresentation.ambientExclusionZones, expectedZones);
  const workerRequest = workers.created.flatMap((worker) => worker.requests)
    .find((request) => request.sceneryPlanRequest);
  assert.ok(workerRequest, "the page must prepare its ambient scenery in the shared worker pool");
  assert.deepEqual(
    workerRequest.sceneryPlanRequest.options.ambientExclusionZones,
    expectedZones,
    "the worker planner must consume the same translated footprint as the atlas runtime",
  );
  terrain.dispose();
});

test("versions a same-origin bundle with its manifest hash while preserving Range", async () => {
  const requested = [];
  const source = manifest();
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/central-front.manifest.json",
    fetch: async (url, options = {}) => {
      requested.push({ url, range: options.headers?.Range ?? null });
      if (String(url).endsWith(".json")) {
        return { ok: true, status: 200, json: async () => source };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });
  await terrain.ready;

  assert.deepEqual(requested, [
    { url: "https://game.test/content/central-front.manifest.json", range: null },
    {
      url: `https://game.test/content/test.terrain?sha256=${"a".repeat(64)}`,
      range: "bytes=0-17",
    },
  ]);
  assert.equal(terrain.diagnostics().transfer.completeBundleFallback, false);
  terrain.dispose();
});

test("swaps 1950s and 2030s scenery in place without refetching retained terrain", async () => {
  const source = manifest();
  source.boundsLocalM = [0, 0, 1_000, 1_000];
  source.chunks[0].boundsLocalM = [0, 0, 1_000, 1_000];
  source.chunks[0].generation = { seed: 99, landFraction: 1 };
  const requested = [];
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/era-swap.manifest.json",
    sceneryEra: "1950s",
    qualityTier: "desktop",
    fetch: async (url, options = {}) => {
      requested.push({ url: String(url), range: options.headers?.Range ?? null });
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });
  await terrain.ready;
  const entry = terrain.entries.get("e00-n00");
  assert.equal(entry.mesh.userData.scenery.period, "1950s");
  assert.equal(terrain.material.uniforms.uModernScenery.value, 0);
  assert.equal(terrain.material.uniforms.uParcelTint.value, 1);
  assert.equal(terrain.material.defines.MODERN_SCENERY, undefined);
  const periodScenery = entry.mesh.children.find((child) => child.userData.scenery);
  let disposedPeriodBatches = 0;
  for (const child of periodScenery.children) {
    child.addEventListener("dispose", () => disposedPeriodBatches++);
  }

  await terrain.setSceneryEra("modern");
  assert.equal(terrain.diagnostics().sceneryEra, "modern");
  assert.equal(entry.mesh.userData.scenery.period, "2030s");
  assert.equal(terrain.material.uniforms.uModernScenery.value, 1);
  assert.equal(terrain.material.uniforms.uParcelTint.value, 0);
  assert.equal(terrain.material.defines.MODERN_SCENERY, 1);
  assert.equal(disposedPeriodBatches, periodScenery.children.length,
    "an era swap must release every replaced instanced GPU buffer");
  assert.equal(requested.length, 2,
    "the successful height range should be reused while only scenery instances change");
  assert.equal(terrain.diagnostics().transfer.rangeCacheHits, 1);

  await terrain.setSceneryEra("1950s");
  assert.equal(entry.mesh.userData.scenery.period, "1950s");
  assert.equal(terrain.material.uniforms.uParcelTint.value, 1);
  assert.equal(terrain.material.defines.MODERN_SCENERY, undefined);
  assert.equal(requested.length, 2);
  terrain.dispose();
});

test("unified Ukraine v2 terrain retains its palette while ambient micro scenery is shed", async () => {
  const source = manifest();
  source.terrainId = "terrain.ukraine.soniachne-theatre.v2";
  source.boundsLocalM = [-131_072, -131_072, 131_072, 131_072];
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/soniachne-v2.manifest.json",
    sceneryEra: "ukraine-modern",
    qualityTier: "balanced",
    fetch: async (_url, options = {}) => {
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });
  await terrain.ready;

  assert.equal(terrain.group.name, "UKRAINE_SONIACHNE_2030S_TERRAIN");
  assert.equal(terrain.material.defines.MODERN_SCENERY, 1);
  assert.equal(terrain.material.defines.UKRAINE_SCENERY, 1);
  assert.equal(terrain.diagnostics().horizonApron, true,
    "the v2 product still needs a horizon apron: it is 262 km across and the horizon at FL700 is "
    + "about 520 km, so without one the world simply stops and the sky shows through");
  const apronRoot = terrain.group.getObjectByName(
    "FICTIONAL_UKRAINE_PRESENTATION_APRON_SYSTEM",
  );
  assert.ok(apronRoot);
  assert.equal(apronRoot.userData.terrain.coreHalfSpanM, 131_072,
    "theatre apron must start outside the authored ±131 km bounds, not the old 8.2 km training cell");
  assert.equal(terrain.diagnostics().ambientSceneryEnabled, true);
  assert.equal(terrain.diagnostics().sceneryChunks, 1);
  assert.equal(terrain.diagnostics().localSceneryChunks, 0,
    "resident scenery is not locally warm until a camera coverage update");

  terrain.update({ cameraPosition: new THREE.Vector3(1, 500, -1) });
  assert.equal(terrain.diagnostics().localResidentChunks, 1);
  assert.equal(terrain.diagnostics().localSceneryChunks, 1);
  assert.equal(terrain.diagnostics().visibleSceneryChunks, 1);
  assert.equal(terrain.diagnostics().ambientSceneryRadiusM, 12_000);

  terrain.update({ cameraPosition: new THREE.Vector3(20_000, 500, -1) });
  assert.equal(terrain.diagnostics().sceneryChunks, 1,
    "distant scenery may stay resident so returning does not regenerate it");
  assert.equal(terrain.diagnostics().visibleSceneryChunks, 0,
    "sub-pixel ambient batches must not be submitted outside their own radius");
  terrain.update({ cameraPosition: new THREE.Vector3(1, 500, -1) });
  assert.equal(terrain.diagnostics().visibleSceneryChunks, 1);

  await terrain.disableAmbientScenery();
  assert.equal(terrain.diagnostics().sceneryEra, "ukraine-modern",
    "shedding micro instances must not recolour the shared theatre");
  assert.equal(terrain.diagnostics().ambientSceneryEnabled, false);
  assert.equal(terrain.diagnostics().sceneryChunks, 0);
  assert.equal(terrain.diagnostics().localSceneryChunks, 0);
  assert.equal(terrain.material.defines.UKRAINE_SCENERY, 1);

  await terrain.enableAmbientScenery();
  assert.equal(terrain.diagnostics().ambientSceneryEnabled, true);
  assert.equal(terrain.diagnostics().sceneryChunks, 1);
  assert.equal(terrain.diagnostics().localSceneryChunks, 1);
  terrain.dispose();
});

test("legacy compact Ukraine v1 terrain retains a non-authoritative land horizon apron", async () => {
  const source = manifest();
  source.terrainId = "terrain.ukraine.soniachne-training.v1";
  source.boundsLocalM = [-8_192, -8_192, 8_192, 8_192];
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/soniachne.manifest.json",
    sceneryEra: "ukraine-modern",
    qualityTier: "balanced",
    fetch: async (_url, options = {}) => {
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });
  await terrain.ready;

  assert.equal(terrain.material.defines.MODERN_SCENERY, 1);
  assert.equal(terrain.material.defines.UKRAINE_SCENERY, 1);
  assert.equal(terrain.diagnostics().horizonApron, true);
  assert.equal(terrain.diagnostics().sceneryChunks, 1,
    "warmup diagnostics must distinguish scenery-bearing near LODs from coarse terrain");
  const apron = terrain.group.getObjectByName(
    "FICTIONAL_UKRAINE_PRESENTATION_ONLY_LAND_APRON",
  );
  assert.ok(apron);
  assert.equal(apron.position.y, 78);
  assert.equal(apron.userData.terrain.authoritative, false);
  assert.equal(apron.userData.terrain.collision, false);
  assert.equal(apron.userData.terrain.targetable, false);
  assert.equal(apron.userData.terrain.transitionM, 4_000);
  assert.equal(apron.userData.terrain.coreHalfSpanM, 8_192,
    "legacy training apron keeps the compact 16.4 km core");
  const transition = terrain.group.getObjectByName(
    "FICTIONAL_UKRAINE_PRESENTATION_TRANSITION_RING",
  );
  assert.ok(transition);
  assert.equal(transition.children.length, 4);
  const transitionNormals = transition.children[0].geometry.getAttribute("normal");
  assert.ok(transitionNormals.getY(0) > 0,
    "transition apron vertices must face upward for lighting and back-face culling");
  for (const strip of transition.children) {
    const positions = strip.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const eastM = positions.getX(index);
      const northM = -positions.getZ(index);
      const onEastWestSeam = Math.abs(Math.abs(eastM) - 8_192) <= 1e-6
        && Math.abs(northM) <= 8_192;
      const onNorthSouthSeam = Math.abs(Math.abs(northM) - 8_192) <= 1e-6
        && Math.abs(eastM) <= 8_192;
      if (!onEastWestSeam && !onNorthSouthSeam) continue;
      assert.equal(Math.round(positions.getY(index) * 10),
        Math.round(ukraineTrainingSourceHeightM(
          Math.max(-8_192, Math.min(8_192, eastM)),
          Math.max(-8_192, Math.min(8_192, northM)),
        ) * 10), "every detailed-cell seam vertex must match packed truth");
    }
  }
  const edgeHeight = ukraineTrainingSourceHeightM(8_192, 0);
  assert.equal(ukraineTrainingApronHeightM(8_192, 0), edgeHeight);
  assert.ok(Math.abs(
    ukraineTrainingApronHeightM(10_192, 0) - (edgeHeight + 78) * 0.5,
  ) < 1e-9, "the 2 km midpoint must match the physics smoothstep blend");
  assert.equal(ukraineTrainingApronHeightM(12_192, 0), 78);
  assert.equal(terrain.streamingRadiusM, Number.POSITIVE_INFINITY);
  assert.equal(terrain.setStreamingRadiusM(12_000), true);
  assert.equal(terrain.streamingRadiusM, 12_000);
  // Compact v1 apron starts at ±8.2 km; a 12 km stream already reaches it, so fog may open.
  assert.equal(terrain.visibleWorldRadiusM, 560_000);
  assert.equal(terrain.setStreamingRadiusM(12_000), false);
  assert.equal(terrain.setStreamingRadiusM(Number.NaN), false);
  terrain.dispose();
});

test("theatre fog closes on the streamed disc until chunks reach the apron", async () => {
  const source = manifest();
  source.terrainId = "terrain.ukraine.soniachne-theatre.v2";
  source.boundsLocalM = [-131_072, -131_072, 131_072, 131_072];
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/soniachne-v2-fog.manifest.json",
    sceneryEra: "ukraine-modern",
    qualityTier: "balanced",
    fetch: async (_url, options = {}) => {
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(18),
      };
    },
  });
  await terrain.ready;
  assert.equal(terrain.setStreamingRadiusM(48_000), true);
  assert.equal(terrain.visibleWorldRadiusM, 48_000,
    "Shared/dogfight 48 km stream must not leave a sky hole to the ±131 km apron in clear air");
  assert.equal(terrain.setStreamingRadiusM(12_000), true);
  assert.equal(terrain.visibleWorldRadiusM, 12_000,
    "governor-shed discs must close fog on the streamed edge");
  assert.equal(terrain.setStreamingRadiusM(145_000), true);
  assert.equal(terrain.visibleWorldRadiusM, 560_000,
    "Rapier-scale stream that reaches the apron may open fog to the far horizon");
  assert.equal(terrain.setStreamingRadiusM(Number.NaN), false);
  terrain.dispose();
});

test("reconciles same-LOD boundary normals and restores them across LOD swaps", async () => {
  const fixture = adjacentTerrainFixture();
  const terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/adjacent.manifest.json",
    maximumConcurrentLoads: 1,
    fetch: async (_url, options = {}) => {
      if (!options.headers?.Range) {
        return { ok: true, status: 200, json: async () => fixture.manifest };
      }
      const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
      assert.ok(match);
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => fixture.bundle.slice(Number(match[1]), Number(match[2]) + 1),
      };
    },
  });
  await terrain.ready;

  const west = terrain.entries.get("west");
  const east = terrain.entries.get("east");
  const westCoarseEdge = 1;
  const eastCoarseEdge = 0;
  assert.notDeepEqual(baseBoundaryNormalAt(west, westCoarseEdge),
    baseBoundaryNormalAt(east, eastCoarseEdge),
    "the fixture needs genuinely different one-sided boundary normals");
  assertVectorNear(normalAt(west, westCoarseEdge), normalAt(east, eastCoarseEdge));

  await terrain.requestLevel(west, 0);
  assert.equal(west.level, 0);
  assert.equal(east.level, 1);
  assertVectorNear(normalAt(east, eastCoarseEdge),
    baseBoundaryNormalAt(east, eastCoarseEdge),
    1e-7);

  await terrain.requestLevel(east, 0);
  assert.equal(east.level, 0);
  const westFineEdge = 5;
  const eastFineEdge = 3;
  assertVectorNear(normalAt(west, westFineEdge), normalAt(east, eastFineEdge));
  terrain.dispose();
});

test("terrain shading consumes baked occlusion and opens the value range", () => {
  const period = createTerrainMaterial(THREE, { sceneryEra: "period", qualityTier: "desktop" });
  const modern = createTerrainMaterial(THREE, { sceneryEra: "modern", qualityTier: "desktop" });
  const ukraine = createTerrainMaterial(
    THREE, { sceneryEra: "ukraine-modern", qualityTier: "desktop" },
  );

  assert.match(period.vertexShader, /attribute float concavity;/,
    "the vertex shader must declare the baked occlusion attribute");
  assert.match(period.vertexShader, /vConcavity = concavity;/);
  assert.match(period.fragmentShader, /varying float vConcavity;/);

  // Era is a compile-time #define, so both materials share one fragmentShader string. Asserting
  // against both is deliberate: it catches an accidental split into two sources.
  assert.match(period.fragmentShader, /uOcclusionRange/);
  assert.ok(period.uniforms.uOcclusionRange, "occlusion range must be a uniform");
  assert.ok(period.uniforms.uShadowFloor, "shadow floor must be a uniform");

  // The floors that crushed relief into the top 60% of value must be gone.
  assert.doesNotMatch(period.fragmentShader, /0\.43 \+ 0\.57 \*/,
    "the period diffuse floor of 0.43 must be replaced by the uShadowFloor uniform");
  assert.doesNotMatch(modern.fragmentShader, /toneRamp = 0\.40 \+/,
    "the modern tone-ramp floor of 0.40 must be replaced by the uShadowFloor uniform");

  assert.ok(period.uniforms.uShadowFloor.value <= 0.2,
    "a legible hillshade needs the darkest slope well below 40% lit");
  assert.match(modern.fragmentShader, /float valleyFloor =/);
  assert.match(modern.fragmentShader, /float slopeFace =/);
  assert.match(modern.fragmentShader, /float exposedFace =/);
  assert.equal(ukraine.defines.MODERN_SCENERY, 1);
  assert.equal(ukraine.defines.UKRAINE_SCENERY, 1);
  assert.match(ukraine.fragmentShader, /ADR-0003 soft world/i);
  assert.match(ukraine.fragmentShader, /Stage C rewild/i);
  assert.match(ukraine.vertexShader, /attribute vec2 landcover;/);
  assert.match(ukraine.vertexShader, /vTerrainLandcover = landcover;/);
  assert.match(ukraine.fragmentShader, /varying vec2 vTerrainLandcover;/);
  assert.match(ukraine.fragmentShader,
    /float ukraineElevationBand = smoothstep\(38\.0, 78\.0, vTerrainHeight\)/,
    "the low-relief theatre needs a Ukraine-scale height ramp at macro LOD");
  assert.match(ukraine.fragmentShader,
    /float succession = softLandcover\.x;/,
    "rewild cover must consume the worker-baked organic succession field");
  assert.match(ukraine.fragmentShader,
    /float fieldHistory = softLandcover\.y;/,
    "the second baked byte must carry seamless former-field history");
  assert.match(ukraine.fragmentShader,
    /vec3 meadowCover = mix\(vec3\(0\.23, 0\.45, 0\.12\)/,
    "macro albedo must read meadow → scrub → canopy");
  assert.match(ukraine.fragmentShader,
    /float trackCue = \(1\.0 - smoothstep\(0\.06, 0\.18, fieldHistory\)\) \* openField;/,
    "worker-baked access tracks should provide structure without per-fragment procedural noise");
  assert.match(ukraine.fragmentShader,
    /heroMix = rewildFloor[\s\S]{0,80}?\(0\.72 \+ \(1\.0 - ukraineElevationBand\) \* 0\.12\)[\s\S]{0,40}?\* uTerrainDetail01/,
    "rewild wash remains part of terrain albedo, faded by altitude so the hero/regional LOD"
    + " quilt cannot print at combat apex (2026-07-29)");
  assert.ok(ukraine.uniforms.uTerrainDetail01,
    "altitude detail fraction must be a uniform the presentations drive from cameraAglM");
  assert.match(ukraine.fragmentShader, /reliefGain = mix\(2\.2, 7\.5, uTerrainDetail01\)/,
    "the 7.5x macro-normal cue is a per-chunk LOD signature and must relax aloft");
  assert.match(ukraine.fragmentShader,
    /terrainOcclusion = mix\([\s\S]{0,90}?expandedOcclusion,[\s\S]{0,30}?uTerrainDetail01\)/,
    "the 4x concavity expansion must relax aloft with the same detail fraction");
  assert.match(ukraine.fragmentShader,
    /sAlbedo \*= mix\(1\.06, 0\.92, ukraineElevationBand\)/,
    "the rewild palette must retain regional height value structure");
  assert.doesNotMatch(ukraine.fragmentShader, /macroParcelCell/,
    "cadastral parcel lattice must not return to the Ukraine soft-world path");
  assert.doesNotMatch(ukraine.fragmentShader, /abandonedScar/,
    "ghost-agriculture scars must not reintroduce crop blotches at altitude");
  assert.doesNotMatch(ukraine.fragmentShader, /sin\(rewild/,
    "land-cover structure belongs in the worker, not nested fragment sine calls");
  assert.match(ukraine.fragmentShader,
    /mix\(0\.34, 1\.0, halfLambert\)/,
    "Ukraine soft-world lighting must be continuous, not a hard two-step toon ramp");
  assert.match(ukraine.fragmentShader,
    /dot\(normal\.xz, regionalSunDirection\) \* reliefGain/,
    "coarse lowland normals need a bounded directional relief cue");
  assert.match(ukraine.fragmentShader,
    /0\.5 \+ \(terrainOcclusion - 0\.5\) \* 4\.0/,
    "Ukraine drainage relief must expand around the seam-neutral concavity midpoint");
  assert.ok(ukraine.uniforms.uShadowFloor.value >= 0.18,
    "Ukraine soft-world should lift the shadow floor for painterly lee slopes");
  assert.ok(ukraine.uniforms.uHazeBandBlend.value <= 0.25,
    "Ukraine soft-world should soften aerial haze banding");
  assert.match(ukraine.fragmentShader,
    /mix\(uFogColor, uAtmosphereHazeColor, uAtmosphereHazeMix\)/,
    "terrain and scenery must share one warm haze contract");
  assert.equal(ukraine.uniforms.uAtmosphereDensityScale.value, 0.34);
  assert.deepEqual(ukraine.uniforms.uAtmosphereHazeColor.value.toArray(),
    [0.66, 0.51, 0.30]);
  assert.equal(ukraine.uniforms.uAtmosphereHazeMix.value, 0.58);
  assert.ok(ukraine.uniforms.uWorldEdgeM, "stream-edge bury uniform must exist");
  assert.equal(ukraine.uniforms.uSnowCover01.value, 0,
    "winter surface shading must preserve the current green-world default");
  assert.equal(ukraine.uniforms.uSnowWetness01.value, 0);
  assert.equal(ukraine.uniforms.uGlazeIce01.value, 0);
  assert.match(ukraine.fragmentShader, /uSnowCover01 > 0\.001 \|\| uGlazeIce01 > 0\.001/,
    "snow-free frames must skip the winter shading work through one coherent uniform branch");
  assert.match(ukraine.fragmentShader, /float snowRetention =/,
    "snow cover must follow terrain slope rather than behave as a flat colour filter");
  assert.match(ukraine.fragmentShader,
    /smoothstep\(uWorldEdgeM \* 0\.36, uWorldEdgeM \* 0\.72, distanceToCamera\)/,
    "Ukraine soft-world must haze out the streamed disc so it never reads as a render-square");
  assert.ok(
    modern.fragmentShader.indexOf("lit *= mix(uOcclusionRange.x")
      < modern.fragmentShader.indexOf("lit = mix(lit, waterLit, waterMask)"),
    "baked terrain occlusion must remain before analytic water compositing",
  );

  period.dispose();
  modern.dispose();
  ukraine.dispose();
});

test("aerial perspective is banded so ridgelines separate in value", () => {
  const material = createTerrainMaterial(THREE, { sceneryEra: "modern", qualityTier: "desktop" });

  assert.ok(material.uniforms.uHazeBands, "band count must be a uniform");
  assert.ok(material.uniforms.uHazeBandBlend, "band blend must be a uniform");
  assert.match(material.fragmentShader, /floor\(aerial \* uHazeBands\) \/ uHazeBands/,
    "haze must be quantised into discrete distance planes");
  assert.ok(material.uniforms.uHazeBands.value >= 3,
    "fewer than three planes cannot separate stacked ridges");

  // Banding must degrade to the old smooth wash when disabled, not divide by zero.
  const off = createTerrainMaterial(THREE, { sceneryEra: "modern", hazeBands: 0 });
  assert.equal(off.uniforms.uHazeBands.value, 0);
  assert.match(off.fragmentShader, /uHazeBands > 0\.5/,
    "the shader must guard the divide when banding is disabled");

  material.dispose();
  off.dispose();
});

// --- Off-thread chunk meshing -------------------------------------------------------------
//
// Building one LOD0 chunk is ~9.5 ms of array arithmetic, which is 57% of a 60 fps frame, and it
// used to run on the render thread. A Build 112 tape caught the consequence: `geometries` 88 -> 126
// in one five second window with frame_ms_max 217-400 ms, while triangles and draw calls barely
// moved. These tests hold the two properties that make moving it to a Worker safe — the off-thread
// mesh must be IDENTICAL to the synchronous one, and a worker that dies must cost a frame, not a
// chunk.

/// A Worker stand-in that runs the real builder in-process. Node has no Worker constructor, so
/// without this the pool would simply report itself unavailable and the worker path would never be
/// exercised by a test at all.
function stubMeshWorkers(behaviour = "build") {
  const created = [];
  const factory = () => {
    if (behaviour === "unconstructable") throw new Error("worker blocked");
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      requests: [],
      // The real module worker announces itself; the hardened pool holds dispatch until it does.
      announceReady() {
        queueMicrotask(() => worker.onmessage?.({ data: { type: "ready" } }));
      },
      postMessage(request) {
        if (request?.type !== "build") return;
        worker.requests.push(request);
        queueMicrotask(() => {
          if (behaviour === "fail") {
            worker.onmessage?.({ data: { type: "failed", id: request.id, message: "nope" } });
            return;
          }
          // Structured-clone the payload the way a real postMessage would, so a test can never
          // pass by sharing an array the browser would have copied.
          const payload = structuredClone({
            heights: request.heights,
            water: request.water,
            sampleCount: request.sampleCount,
            includeLandcover: request.includeLandcover,
          });
          const built = buildTerrainMeshArrays(request.boundsLocalM, payload);
          if (request.sceneryPlanRequest) {
            const sceneryRequest = structuredClone(request.sceneryPlanRequest);
            built.sceneryPlan = planKoreaScenery(
              sceneryRequest.chunk,
              payload,
              sceneryRequest.options,
            );
          }
          worker.onmessage?.({ data: { type: "built", id: request.id, built } });
        });
      },
      terminate() {
        worker.terminated = true;
      },
    };
    created.push(worker);
    queueMicrotask(() => worker.onmessage?.({ data: { type: "ready" } }));
    return worker;
  };
  return { factory, created };
}

async function loadSingleChunkTerrain(values, options = {}) {
  const source = manifest();
  return loadKoreaTerrain(THREE, {
    manifestUrl: "https://game.test/content/central-front.manifest.json",
    fetch: async (url, requestOptions = {}) => {
      if (!requestOptions.headers?.Range) {
        return { ok: true, status: 200, json: async () => source };
      }
      return { ok: true, status: 206, arrayBuffer: async () => values.buffer.slice(0) };
    },
    ...options,
  });
}

test("attaches one mission feature pack at the terrain root and reports its hash", async () => {
  const pack = JSON.parse(await readFile(new URL(
    "../../../content/packs/ukraine-modern/environment/hero-cells/"
      + "soniachne-clinic-a.feature-pack.json",
    import.meta.url,
  ), "utf8"));
  const sha256 = "1c2bf3cae753df11b93551a9caaee534b634e1d536a9423f5947b368a98c363d";
  const values = new Int16Array([
    100, 100, 100,
    100, 100, 100,
    100, 100, 100,
  ]);
  const terrain = await loadSingleChunkTerrain(values, {
    sceneryEra: "ukraine-modern",
    qualityTier: "mobile",
    missionFeaturePack: pack,
    missionFeaturePackSha256: sha256,
  });
  await terrain.whenIdle();

  const featureRootName =
    "MISSION_FEATURE_PACK_MISSION-FEATURE-PACK_UKRAINE-MODERN_SONIACHNE-CLINIC-A_V1";
  const featureRoot = terrain.group.getObjectByName(featureRootName);
  assert.equal(featureRoot?.parent, terrain.group,
    "the selected authored island belongs once beneath the terrain placement root");
  let featureRootCount = 0;
  terrain.group.traverse((object) => {
    if (object.name === featureRootName) featureRootCount++;
  });
  assert.equal(featureRootCount, 1);
  const diagnostics = terrain.diagnostics();
  assert.equal(diagnostics.missionFeaturePackId, pack.featurePackId);
  assert.equal(diagnostics.missionFeaturePackSha256, sha256);
  assert.equal(diagnostics.missionFeatures.lzAssessmentStatus, "unassessed");
  assert.ok(diagnostics.missionFeatures.drawCalls <= 6);

  terrain.dispose();
  assert.equal(featureRoot.parent, null);
});

test("rejects a prepared scenery plan built for a different ambient exclusion footprint", () => {
  const chunk = {
    id: "e0001-n0002",
    boundsLocalM: [0, 0, 1_000, 1_000],
    generation: { seed: 123456789, landFraction: 1 },
  };
  const sampleCount = 33;
  const decoded = {
    sampleCount,
    heights: new Float32Array(sampleCount * sampleCount).fill(24),
    water: new Uint8Array(sampleCount * sampleCount),
  };
  const preparedWithoutExclusions = planKoreaScenery(chunk, decoded, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ring: "near",
  });
  assert.ok(preparedWithoutExclusions.trees.length > 0,
    "the fixture must expose stale ambient candidates if the plan is incorrectly reused");
  const exclusionZones = [{ eastM: 500, northM: 500, radiusM: 1_000 }];
  const correctlyExcluded = planKoreaScenery(chunk, decoded, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ring: "near",
    ambientExclusionZones: exclusionZones,
  });
  assert.notEqual(
    preparedWithoutExclusions.ambientExclusionIdentity,
    correctlyExcluded.ambientExclusionIdentity,
  );

  const runtime = createKoreaSceneryRuntime(THREE, {
    era: "ukraine-modern",
    qualityTier: "balanced",
    ambientExclusionZones: exclusionZones,
  });
  const group = runtime.createTile(chunk, decoded, 0, preparedWithoutExclusions);
  assert.ok(group, "the bounded grass controller can retain the otherwise empty tile");
  assert.equal(group.userData.scenery.trees, 0,
    "a mismatched prepared plan must be discarded and replanned with the active footprint");
  assert.equal(group.userData.scenery.buildings, 0);
  assert.equal(group.userData.scenery.roadSegments, 0);
  runtime.disposeTile(group);
  runtime.dispose();
});

test("meshes terrain chunks in a worker and matches the synchronous build exactly", async () => {
  const values = new Int16Array([
    -32768, -32768, 100,
    -32768, 1400, 200,
    300, 400, 500,
  ]);
  const workers = stubMeshWorkers();
  const terrain = await loadSingleChunkTerrain(values, {
    createTerrainMeshWorker: workers.factory,
    terrainMeshWorkerCount: 1,
    sceneryEra: "ukraine-modern",
  });
  await terrain.whenIdle();

  const mesh = terrain.entries.get("e00-n00").mesh;
  assert.ok(mesh, "the worker path must still produce a chunk mesh");
  assert.ok(workers.created.length >= 1, "the pool must have constructed a worker");
  const workerRequest = workers.created.flatMap((worker) => worker.requests)[0];
  assert.equal(workerRequest.sceneryPlanRequest.options.era, "ukraine-modern");
  assert.equal(workerRequest.sceneryPlanRequest.options.ring, "near");
  assert.equal(workerRequest.sceneryPlanRequest.chunk.id, "e00-n00",
    "the same worker burst must prepare deterministic scenery candidates off the render thread");

  const reference = createTerrainGeometry(THREE, manifest().chunks[0],
    decodeTerrainRecord(values.buffer.slice(0), manifest().chunks[0].lods[0], quantization));
  for (const name of ["position", "normal", "terrainWater", "landcover", "concavity"]) {
    assert.deepEqual(
      [...mesh.geometry.getAttribute(name).array],
      [...reference.geometry.getAttribute(name).array],
      `worker-built ${name} must be identical to the synchronous build`);
  }
  assert.deepEqual([...mesh.geometry.getIndex().array], [...reference.geometry.getIndex().array]);
  assert.deepEqual(mesh.geometry.groups, reference.geometry.groups,
    "the single-sided surface / double-sided skirt split must survive the worker boundary");
  assert.equal(mesh.geometry.boundingSphere.radius, reference.geometry.boundingSphere.radius,
    "a worker-supplied bounding sphere must match the one THREE would have computed");
  // Frustum culling reads this on every frame; a null sphere silently draws every chunk.
  assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));
  reference.geometry.dispose();
  terrain.dispose();
});

test("forwards the non-Ukraine land-cover gate through the terrain worker", async () => {
  const values = new Int16Array([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  const workers = stubMeshWorkers();
  const terrain = await loadSingleChunkTerrain(values, {
    createTerrainMeshWorker: workers.factory,
    terrainMeshWorkerCount: 1,
  });
  await terrain.whenIdle();

  assert.equal(workers.created[0].requests[0].includeLandcover, false);
  assert.equal(
    terrain.entries.get("e00-n00").mesh.geometry.getAttribute("landcover"),
    undefined,
  );
  terrain.dispose();
});

test("falls back to synchronous meshing when the terrain workers are unusable", async () => {
  const values = new Int16Array([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  for (const behaviour of ["fail", "unconstructable"]) {
    const workers = stubMeshWorkers(behaviour);
    const terrain = await loadSingleChunkTerrain(values, {
      createTerrainMeshWorker: workers.factory,
      terrainMeshWorkerCount: 1,
    });
    await terrain.whenIdle();
    const mesh = terrain.entries.get("e00-n00").mesh;
    assert.ok(mesh,
      `a ${behaviour} worker must cost a frame, never a chunk`);
    assert.equal(mesh.geometry.getAttribute("landcover"), undefined,
      "worker failure must preserve the non-Ukraine land-cover gate on sync fallback");
    if (behaviour === "fail") {
      assert.ok(workers.created[0].terminated,
        "a worker that reports a failed build must be retired rather than retried forever");
    }
    terrain.dispose();
  }
});

test("terrain worker teardown terminates its workers", async () => {
  const values = new Int16Array([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  const workers = stubMeshWorkers();
  const terrain = await loadSingleChunkTerrain(values, {
    createTerrainMeshWorker: workers.factory,
    terrainMeshWorkerCount: 1,
  });
  await terrain.whenIdle();
  terrain.dispose();
  assert.ok(workers.created.every((worker) => worker.terminated),
    "disposing the terrain must not leak worker threads");
});
