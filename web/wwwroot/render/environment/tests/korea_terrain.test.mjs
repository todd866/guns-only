import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createTerrainGeometry,
  decodeTerrainRecord,
  loadKoreaTerrain,
  selectTerrainLod,
  terrainCurvatureDropM,
  TerrainBundleReader,
  validateTerrainManifest,
} from "../korea_terrain.js";

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

test("validates range-addressable terrain records and rejects overruns", () => {
  assert.equal(validateTerrainManifest(manifest()).terrainId, "terrain.test.v1");
  const invalid = manifest();
  invalid.chunks[0].lods[0].byteOffset = 4;
  assert.throws(() => validateTerrainManifest(invalid), /Invalid Korea terrain LOD/);
});

test("decodes little-endian decimetres and omits all-water triangles", () => {
  const values = new Int16Array([
    -32768, -32768, 100,
    -32768, -32768, 200,
    300, 400, 500,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  assert.equal(decoded.heights[2], 10);
  assert.equal(decoded.water[0], 1);
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);
  assert.ok(built.triangleCount > 0);
  assert.ok(built.surfaceTriangleCount < 8,
    "the northwest all-water cell should not emit both surface triangles");
  assert.equal(built.geometry.attributes.position.count, 25);
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
  assert.equal(waterBuilt.triangleCount, 0,
    "an all-water chunk must not draw terrain or underwater skirts");
  waterBuilt.geometry.dispose();
});

test("selects progressively coarser LODs with tier-specific distance", () => {
  assert.equal(selectTerrainLod(5_000, "balanced", 4), 0);
  assert.equal(selectTerrainLod(30_000, "balanced", 4), 1);
  assert.equal(selectTerrainLod(70_000, "balanced", 4), 2);
  assert.equal(selectTerrainLod(200_000, "balanced", 4), 3);
  assert.equal(selectTerrainLod(12_000, "mobile", 4), 1);
  assert.equal(selectTerrainLod(12_000, "desktop", 4), 0);
  assert.equal(selectTerrainLod(16_500, "balanced", 4, 0), 0,
    "a small outward threshold crossing should retain the current LOD");
  assert.equal(selectTerrainLod(18_000, "balanced", 4, 0), 1);
  assert.equal(selectTerrainLod(15_000, "balanced", 4, 1), 1,
    "a small inward threshold crossing should retain the current LOD");
  assert.equal(selectTerrainLod(14_000, "balanced", 4, 1), 0);
});

test("uses the active ocean curvature contract for terrain presentation", () => {
  assert.equal(terrainCurvatureDropM(12_000), 0);
  assert.ok(Math.abs(terrainCurvatureDropM(45_000) - 85.4654) < 0.001,
    "terrain must match the active ocean's 12 km / Earth-radius curvature");
});

test("uses HTTP ranges and safely falls back when a server returns the complete bundle", async () => {
  const complete = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
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
