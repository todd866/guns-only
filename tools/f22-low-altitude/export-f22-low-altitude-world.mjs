#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  KOREA_SCENERY_PROFILES,
  planKoreaScenery,
} from "../../web/wwwroot/render/environment/korea_scenery_planner.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ATLAS_ROOT = path.join(
  ROOT,
  "content/packs/ukraine-modern/environment/terrain-atlas",
);
const FOLIAGE_ROOT = path.join(
  ROOT,
  "content/packs/ukraine-modern/environment/foliage",
);
const PLANNER_PATH = path.join(
  ROOT,
  "web/wwwroot/render/environment/korea_scenery_planner.js",
);
const OUTPUT_PATHS = [
  path.join(
    ROOT,
    "content/packs/ukraine-modern/presentation/"
      + "f22-low-altitude-world.web-build-299.v1.json",
  ),
  path.join(
    ROOT,
    "web/wwwroot/content/packs/ukraine-modern/presentation/"
      + "f22-low-altitude-world.web-build-299.v1.json",
  ),
  path.join(
    ROOT,
    "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/presentation/"
      + "f22-low-altitude-world.web-build-299.v1.json",
  ),
];

const SELECTED_CHUNKS = Object.freeze([
  Object.freeze({ page: "page-em001-nm001", chunk: "e0045-n0025" }),
  Object.freeze({ page: "page-ep000-nm001", chunk: "e0046-n0025" }),
  Object.freeze({ page: "page-em001-np000", chunk: "e0045-n0026" }),
  Object.freeze({ page: "page-ep000-np000", chunk: "e0046-n0026" }),
]);

const FOLIAGE_REGIONS = Object.freeze({
  matureWoodland: Object.freeze([0.02, 0.02, 0.48, 0.48]),
  poplarWindbreak: Object.freeze([0.52, 0.02, 0.98, 0.48]),
  mixedHedgerow: Object.freeze([0.02, 0.52, 0.48, 0.98]),
  meadowScrub: Object.freeze([0.52, 0.52, 0.98, 0.98]),
});

const FOLIAGE_ROLES = Object.freeze([
  Object.freeze({
    id: "matureWoodland",
    centreX: -0.10,
    centreZ: 0.00,
    width: 2.18,
    height: 1.04,
    yawRad: 0.00,
  }),
  Object.freeze({
    id: "poplarWindbreak",
    centreX: 0.76,
    centreZ: 0.18,
    width: 1.08,
    height: 1.22,
    yawRad: 0.52,
  }),
  Object.freeze({
    id: "mixedHedgerow",
    centreX: -0.54,
    centreZ: -0.38,
    width: 1.72,
    height: 0.58,
    yawRad: -0.34,
  }),
  Object.freeze({
    id: "meadowScrub",
    centreX: 0.24,
    centreZ: 0.62,
    width: 1.46,
    height: 0.34,
    yawRad: 0.83,
  }),
]);

const BUILDING_COMPOUND_LAYOUT = Object.freeze([
  Object.freeze({ x: 0, z: 0, width: 1, depth: 1, height: 1 }),
  Object.freeze({ x: 0.92, z: 0.48, width: 0.58, depth: 0.62, height: 0.66 }),
  Object.freeze({ x: -0.78, z: -0.68, width: 0.50, depth: 0.68, height: 0.74 }),
]);

// V8/libm can legitimately differ by one ULP for the pow() operations used by the Web colour and
// scenery math. The contract is a cross-runtime interchange file, so preserve materially more
// precision than either renderer consumes while removing those engine-specific tail digits before
// JSON.stringify chooses a decimal spelling. At the largest world coordinate in this export,
// fourteen significant digits retain sub-nanometre resolution.
export const CONTRACT_FLOAT_SIGNIFICANT_DIGITS = 14;

function canonicalContractNumber(value) {
  assert.equal(Number.isFinite(value), true, "F-22 contract numbers must be finite");
  if (Number.isInteger(value)) return value;
  return Number(value.toPrecision(CONTRACT_FLOAT_SIGNIFICANT_DIGITS));
}

function contractJsonReplacer(_key, value) {
  return typeof value === "number" ? canonicalContractNumber(value) : value;
}

function bytes(file) {
  return fs.readFileSync(file);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return sha256(bytes(file));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function linearChannel(byte) {
  const value = byte / 255;
  return value < 0.04045
    ? value * 0.0773993808
    : (value * 0.9478672986 + 0.0521327014) ** 2.4;
}

function linearRgb(hex) {
  return [
    linearChannel((hex >>> 16) & 0xff),
    linearChannel((hex >>> 8) & 0xff),
    linearChannel(hex & 0xff),
  ];
}

function lerpRgb(from, to, amount) {
  return from.map((value, index) => value + (to[index] - value) * amount);
}

function decodeRecord(pageManifest, bundle, record) {
  assert.equal(record.level, 0, `${record.level} is not the frozen Web LOD0`);
  const recordBytes = bundle.subarray(
    record.byteOffset,
    record.byteOffset + record.byteLength,
  );
  assert.equal(sha256(recordBytes), record.sha256, `${record.sha256} record hash`);
  const count = record.sampleCount ** 2;
  assert.equal(recordBytes.length, count * 2, "terrain record length");
  const heights = new Float32Array(count);
  const water = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const quantized = recordBytes.readInt16LE(index * 2);
    const isWater = quantized === pageManifest.quantization.waterSentinel;
    water[index] = isWater ? 1 : 0;
    heights[index] = isWater
      ? 0
      : quantized * pageManifest.quantization.metresPerUnit;
  }
  return { heights, water, sampleCount: record.sampleCount };
}

function sourcePosition(centreEastM, centreNorthM, value) {
  return [
    centreEastM + value.x,
    value.y,
    centreNorthM - value.z,
  ];
}

function sourceSegment(centreEastM, centreNorthM, value) {
  return {
    fromSourceM: [
      centreEastM + value.fromX,
      value.fromY,
      centreNorthM - value.fromZ,
    ],
    toSourceM: [
      centreEastM + value.toX,
      value.toY,
      centreNorthM - value.toZ,
    ],
    widthM: value.widthM,
  };
}

function buildChunk(selection, profile) {
  const pageManifestPath = path.join(
    ATLAS_ROOT,
    `pages/${selection.page}.manifest.json`,
  );
  const pageManifestBytes = bytes(pageManifestPath);
  const pageManifest = JSON.parse(pageManifestBytes);
  const bundlePath = path.join(ATLAS_ROOT, `pages/${selection.page}.terrain`);
  const bundle = bytes(bundlePath);
  assert.equal(bundle.length, pageManifest.bundle.byteLength, "terrain page byte length");
  assert.equal(sha256(bundle), pageManifest.bundle.sha256, "terrain page SHA-256");
  const chunk = pageManifest.chunks.find((candidate) => candidate.id === selection.chunk);
  assert.ok(chunk, `missing ${selection.chunk} from ${selection.page}`);
  const record = chunk.lods.find((candidate) => candidate.level === 0);
  assert.ok(record, `missing LOD0 ${selection.chunk}`);
  const decoded = decodeRecord(pageManifest, bundle, record);
  const plan = planKoreaScenery(chunk, decoded, {
    era: "ukraine-modern",
    qualityTier: "desktop",
    ring: "near",
    ambientExclusionZones: [],
  });
  const [minimumEastM, minimumNorthM, maximumEastM, maximumNorthM] =
    chunk.boundsLocalM;
  const centreEastM = (minimumEastM + maximumEastM) * 0.5;
  const centreNorthM = (minimumNorthM + maximumNorthM) * 0.5;
  const crownLinear = profile.crownColors.map((hex) =>
    lerpRgb([1, 1, 1], linearRgb(hex), 0.14));
  const buildingLinear = profile.buildingColors.map(linearRgb);
  const roofLinear = profile.roofColors.map(linearRgb);

  return {
    chunkId: chunk.id,
    pageId: selection.page,
    boundsSourceM: chunk.boundsLocalM,
    generation: chunk.generation,
    sourceRecord: {
      level: record.level,
      spacingM: record.spacingM,
      sampleCount: record.sampleCount,
      byteLength: record.byteLength,
      sha256: record.sha256,
    },
    sourcePageManifestSha256: sha256(pageManifestBytes),
    seed: plan.seed,
    trees: plan.trees.map((tree) => ({
      positionSourceM: sourcePosition(centreEastM, centreNorthM, tree),
      yawRad: tree.yaw,
      heightM: tree.heightM,
      widthScale: tree.widthScale,
      kind: tree.kind,
      crownVariant: tree.crownVariant,
      tintLinearRgb: crownLinear[tree.crownVariant],
    })),
    buildings: plan.buildings.map((building) => ({
      positionSourceM: sourcePosition(centreEastM, centreNorthM, building),
      yawRad: building.yaw,
      widthM: building.widthM,
      depthM: building.depthM,
      heightM: building.heightM,
      highRise: building.highRise,
      kind: building.kind,
      colorVariant: building.colorVariant,
      wallLinearRgb: buildingLinear[building.colorVariant],
      roofLinearRgb: roofLinear[building.colorVariant % roofLinear.length],
    })),
    roads: plan.roads.map((segment) =>
      sourceSegment(centreEastM, centreNorthM, segment)),
    railSegments: plan.railSegments.map((segment) =>
      sourceSegment(centreEastM, centreNorthM, segment)),
    runways: plan.runways.map((segment) =>
      sourceSegment(centreEastM, centreNorthM, segment)),
    powerPoles: plan.powerPoles.map((pole) => ({
      positionSourceM: sourcePosition(centreEastM, centreNorthM, pole),
      heightM: pole.heightM,
    })),
    powerLines: plan.powerLines.map((segment) =>
      sourceSegment(centreEastM, centreNorthM, segment)),
  };
}

function count(chunks, name) {
  return chunks.reduce((total, chunk) => total + chunk[name].length, 0);
}

export function buildContract() {
  const profile = KOREA_SCENERY_PROFILES["ukraine-modern"];
  const chunks = SELECTED_CHUNKS.map((selection) => buildChunk(selection, profile));
  const terrainTruthPath = path.join(ATLAS_ROOT, "rapier-site.kernel.truth");
  const foliagePath = path.join(FOLIAGE_ROOT, "ukraine-temperate-foliage-v1.png");
  const foliageManifestPath = path.join(
    FOLIAGE_ROOT,
    "ukraine-foliage-art-manifest.v1.json",
  );
  const contract = {
    schemaVersion: "1.0.0",
    presentationId: "presentation.ukraine-modern.f22-low-altitude.web-build-299.v1",
    sourceRenderer: "Web / Three r160",
    build: 299,
    authority: {
      mode: "presentation_only",
      collisionAuthority: "none",
      navigationAuthority: "none",
      terrainHeights: "exact kernel truth derived from the same Web LOD0 records",
      sceneryPlacements: "exact output of the Web deterministic scenery planner",
    },
    coordinateFrame: {
      sourceAxes: ["east", "up", "north"],
      unityMapping: ["east", "up", "-north"],
      detailBoundsSourceM: [-8192, -8192, 8192, 8192],
    },
    terrain: {
      source: "content/packs/ukraine-modern/environment/terrain-atlas/"
        + "rapier-site.kernel.truth",
      sha256: sha256File(terrainTruthPath),
      byteLength: fs.statSync(terrainTruthPath).size,
      magic: "GOKTRN1\\0",
      version: 1,
      sampleCount: 513,
      spacingM: 32,
      metresPerUnit: 0.1,
      triangulation: "southwest-southeast-northwest; southeast-northeast-northwest",
      lightingNormals: "Web five-by-five weighted height smoothing per 257x257 source chunk",
      landcover: "Web absolute-metre macro/meso value-noise bytes",
    },
    foliageAtlas: {
      id: "environment.foliage.ukraine-temperate.v1",
      source: "content/packs/ukraine-modern/environment/foliage/"
        + "ukraine-temperate-foliage-v1.png",
      sha256: sha256File(foliagePath),
      byteLength: fs.statSync(foliagePath).size,
      artManifestSha256: sha256File(foliageManifestPath),
      width: 1024,
      height: 1024,
      alphaCutoff: 0.38,
      authoredUvOrigin: "top-left-v-down",
      regions: FOLIAGE_REGIONS,
      roles: FOLIAGE_ROLES.map((role) => ({
        ...role,
        region: FOLIAGE_REGIONS[role.id],
        crossedCardYawOffsetRad: Math.PI * 0.5,
      })),
    },
    geometry: {
      buildingCompoundLayout: BUILDING_COMPOUND_LAYOUT,
      roof: { primitive: "four-sided-cone", radius: 0.72, height: 1 },
    },
    materials: {
      roadLinearRgb: linearRgb(profile.roadColor),
      roadMarkingLinearRgb: linearRgb(profile.roadMarkingColor),
      railBedLinearRgb: linearRgb(profile.railBedColor),
      railLinearRgb: linearRgb(profile.railColor),
      runwayLinearRgb: linearRgb(profile.runwayColor),
      powerPoleLinearRgb: linearRgb(profile.powerPoleColor),
      powerWireLinearRgb: linearRgb(profile.powerWireColor),
    },
    planner: {
      module: "web/wwwroot/render/environment/korea_scenery_planner.js",
      sha256: sha256File(PLANNER_PATH),
      era: "ukraine-modern",
      qualityTier: "desktop",
      ring: "near",
      ambientExclusionZones: [],
      selectedChunkIds: SELECTED_CHUNKS.map((value) => value.chunk),
    },
    deliberateOmissions: [
      "camera-relative soft-world grass is not frozen because its cells follow the live camera",
      "mission-feature packs are not part of the F-22 first-merge mission contract",
      "far fallback outside the exact 16.384 km detail square is bounded Unity presentation",
    ],
    counts: {
      chunks: chunks.length,
      trees: count(chunks, "trees"),
      buildings: count(chunks, "buildings"),
      roadSegments: count(chunks, "roads"),
      railSegments: count(chunks, "railSegments"),
      runwaySegments: count(chunks, "runways"),
      powerPoles: count(chunks, "powerPoles"),
      powerLines: count(chunks, "powerLines"),
    },
    chunks,
  };
  return `${JSON.stringify(contract, contractJsonReplacer, 2)}\n`;
}

function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  const expected = buildContract();
  if (mode === "write") {
    for (const outputPath of OUTPUT_PATHS) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, expected);
    }
    process.stdout.write(
      `wrote ${OUTPUT_PATHS.length} F-22 low-altitude contracts `
        + `sha256=${sha256(expected)} bytes=${Buffer.byteLength(expected)}\n`,
    );
    return;
  }
  for (const outputPath of OUTPUT_PATHS) {
    assert.ok(fs.existsSync(outputPath), `missing generated contract ${outputPath}`);
    assert.equal(fs.readFileSync(outputPath, "utf8"), expected, outputPath);
  }
  process.stdout.write(
    `F-22 low-altitude contract PASS sha256=${sha256(expected)}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
