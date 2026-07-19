import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import * as THREE from "../../../web/wwwroot/vendor/three.module.js";
import {
  AIRCRAFT_ASSET_IDS,
  buildAircraftAssetSpecs,
} from "../generators/aircraft-assets.mjs";
import { inspectModelFile } from "../lib/glb.mjs";

const execFileAsync = promisify(execFile);
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const GENERATOR_MODULE = path.join(REPOSITORY_ROOT, "tools/assets/generators/aircraft-assets.mjs");
const EXPORTER = path.join(REPOSITORY_ROOT, "tools/assets/generators/export-assets.mjs");
const REVIEWED_METRICS = path.join(REPOSITORY_ROOT, "tools/assets/generators/aircraft-assets.metrics.json");
const CANONICAL_PACK = path.join(REPOSITORY_ROOT, "content/packs/korea-1950s");

const EXPECTED_ASSET_IDS = Object.freeze({
  playerExterior: "vehicle.player.sabre-fury.v1",
  banditExterior: "vehicle.bandit.swept-wing.v1",
  playerCockpit: "cockpit.player.sabre-fury.v1",
});

const EXPECTED_SPECS = Object.freeze([
  { assetId: EXPECTED_ASSET_IDS.playerExterior, level: 0, output: "models/player-swept-jet/lod0.glb" },
  { assetId: EXPECTED_ASSET_IDS.banditExterior, level: 0, output: "models/bandit-swept-jet/lod0.glb" },
  { assetId: EXPECTED_ASSET_IDS.playerExterior, level: 1, output: "models/player-swept-jet/lod1.glb" },
  { assetId: EXPECTED_ASSET_IDS.banditExterior, level: 1, output: "models/bandit-swept-jet/lod1.glb" },
  { assetId: EXPECTED_ASSET_IDS.playerExterior, level: 2, output: "models/player-swept-jet/lod2.glb" },
  { assetId: EXPECTED_ASSET_IDS.banditExterior, level: 2, output: "models/bandit-swept-jet/lod2.glb" },
  { assetId: EXPECTED_ASSET_IDS.playerCockpit, level: 0, output: "models/player-cockpit/lod0.glb" },
]);

function specIdentity(spec) {
  return `${spec.assetId}@${spec.level}:${spec.output}`;
}

function assertFiniteAttribute(attribute, label) {
  assert.ok(attribute, `${label} is required`);
  assert.ok(Number.isInteger(attribute.itemSize) && attribute.itemSize > 0, `${label} itemSize must be positive`);
  for (const value of attribute.array) assert.ok(Number.isFinite(value), `${label} contains non-finite data`);
}

function inspectSceneSpec(spec) {
  const identity = specIdentity(spec);
  let nodes = 0;
  let meshes = 0;
  let triangles = 0;
  let drawCalls = 0;
  let cameras = 0;
  let lights = 0;
  let textureReferences = 0;
  const textures = new Set();
  const materials = new Set();
  const socketNames = [];

  spec.scene.updateMatrixWorld(true);
  spec.scene.traverse((object) => {
    nodes++;
    if (object.isCamera) cameras++;
    if (object.isLight) lights++;
    if (object.name.startsWith("SOCKET_")) socketNames.push(object.name);
    if (!object.isMesh) return;

    meshes++;
    const geometry = object.geometry;
    const position = geometry?.getAttribute("position");
    assertFiniteAttribute(position, `${identity}/${object.name}.position`);
    assertFiniteAttribute(geometry.getAttribute("uv"), `${identity}/${object.name}.uv`);
    assertFiniteAttribute(geometry.getAttribute("tangent"), `${identity}/${object.name}.tangent`);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      assertFiniteAttribute(attribute, `${identity}/${object.name}.${name}`);
      assert.equal(attribute.count, position.count, `${identity}/${object.name}.${name} vertex count`);
    }
    for (const [name, attributes] of Object.entries(geometry.morphAttributes ?? {})) {
      for (const [index, attribute] of attributes.entries()) {
        assertFiniteAttribute(attribute, `${identity}/${object.name}.morph.${name}[${index}]`);
      }
    }

    if (geometry.index) {
      for (const value of geometry.index.array) {
        assert.ok(Number.isInteger(value), `${identity}/${object.name} index must be integral`);
        assert.ok(value >= 0 && value < position.count, `${identity}/${object.name} index ${value} is out of range`);
      }
    }
    const elementCount = geometry.index?.count ?? position.count;
    assert.equal(elementCount % 3, 0, `${identity}/${object.name} must be triangle-list geometry`);
    triangles += elementCount / 3;

    const materialList = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materialList) {
      assert.ok(material?.name, `${identity}/${object.name} materials must be named`);
      materials.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture) continue;
        textures.add(value);
        textureReferences++;
      }
    }
    drawCalls += Array.isArray(object.material)
      ? Math.max(1, geometry.groups.length)
      : 1;
  });

  const declaredSockets = spec.anchors.map((anchor) => anchor.node).sort();
  assert.equal(new Set(spec.anchors.map((anchor) => anchor.id)).size, spec.anchors.length, `${identity} anchor IDs must be unique`);
  assert.equal(new Set(declaredSockets).size, declaredSockets.length, `${identity} anchor nodes must be unique`);
  assert.deepEqual(socketNames.sort(), declaredSockets, `${identity} exported socket set must exactly match declared anchors`);
  for (const anchor of spec.anchors) {
    assert.match(anchor.node, /^SOCKET_[A-Z0-9_]+$/, `${identity}/${anchor.id} socket naming`);
    const node = spec.scene.getObjectByName(anchor.node);
    assert.ok(node, `${identity}/${anchor.id} must resolve to ${anchor.node}`);
    const worldPosition = node.getWorldPosition(new THREE.Vector3());
    assert.ok(worldPosition.toArray().every(Number.isFinite), `${identity}/${anchor.id} world position must be finite`);
  }

  const box = new THREE.Box3().setFromObject(spec.scene);
  assert.equal(box.isEmpty(), false, `${identity} scene bounds must not be empty`);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const metrics = { nodes, meshes, triangles, drawCalls, materials: materials.size };
  assert.deepEqual(metrics, {
    nodes: spec.metadata.metrics.nodes,
    meshes: spec.metadata.metrics.meshes,
    triangles: spec.metadata.metrics.triangles,
    drawCalls: spec.metadata.metrics.drawCalls,
    materials: spec.metadata.metrics.materials,
  }, `${identity} embedded metrics must describe the constructed scene`);
  assert.ok(triangles <= spec.metadata.budgets.triangles, `${identity} triangle budget exceeded`);
  assert.ok(drawCalls <= spec.metadata.budgets.drawCalls, `${identity} draw-call budget exceeded`);
  assert.ok(materials.size <= spec.metadata.budgets.materials, `${identity} material budget exceeded`);
  if (spec.assetId === AIRCRAFT_ASSET_IDS.playerCockpit || spec.level < 2) {
    assert.ok(textureReferences > 0, `${identity} should bind deterministic PBR textures`);
    assert.ok(textures.size >= 3, `${identity} should include a compact material texture set`);
  } else {
    assert.equal(textureReferences, 0, `${identity} far LOD should remain texture-free`);
  }
  assert.equal(spec.metadata.coordinates.units, "metres", `${identity} units`);
  assert.equal(spec.metadata.coordinates.up, "+Y", `${identity} up axis`);
  assert.equal(spec.metadata.coordinates.forward, "-Z", `${identity} forward axis`);
  assert.equal(cameras, 0, `${identity} must not include a camera`);
  assert.equal(lights, 0, `${identity} must not include a light`);

  return { ...metrics, box, size, center, sockets: declaredSockets, textures: textures.size };
}

function assertInRange(value, minimum, maximum, label) {
  assert.ok(value >= minimum && value <= maximum, `${label}: expected ${minimum}..${maximum}, received ${value}`);
}

function socketPosition(spec, id) {
  const anchor = spec.anchors.find((candidate) => candidate.id === id);
  assert.ok(anchor, `${specIdentity(spec)} must declare ${id}`);
  return spec.scene.getObjectByName(anchor.node).getWorldPosition(new THREE.Vector3());
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function exportAssets(outputRoot) {
  const { stdout } = await execFileAsync(process.execPath, [
    EXPORTER,
    "--module", GENERATOR_MODULE,
    "--output-root", outputRoot,
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("aircraft generator exposes seven bounded, socket-complete Three scene specs", () => {
  assert.deepEqual(AIRCRAFT_ASSET_IDS, EXPECTED_ASSET_IDS);
  const specs = buildAircraftAssetSpecs(THREE);
  assert.equal(specs.length, 7);
  assert.equal(new Set(specs.map(specIdentity)).size, 7, "spec identities must be unique");
  assert.equal(new Set(specs.map((spec) => spec.output)).size, 7, "output paths must be unique");
  assert.deepEqual(
    specs.map(({ assetId, level, output }) => ({ assetId, level, output })),
    EXPECTED_SPECS,
  );

  const facts = new Map(specs.map((spec) => [specIdentity(spec), inspectSceneSpec(spec)]));
  for (const assetId of [AIRCRAFT_ASSET_IDS.playerExterior, AIRCRAFT_ASSET_IDS.banditExterior]) {
    const levels = specs.filter((spec) => spec.assetId === assetId).sort((left, right) => left.level - right.level);
    assert.deepEqual(levels.map((spec) => spec.level), [0, 1, 2], `${assetId} LOD levels`);
    assert.deepEqual(levels.map((spec) => spec.metadata.minProjectedPixels), [180, 48, 0], `${assetId} LOD thresholds`);
    const counts = levels.map((spec) => facts.get(specIdentity(spec)).triangles);
    assert.ok(counts[0] > counts[1] && counts[1] > counts[2], `${assetId} triangle counts must strictly decrease: ${counts.join(" > ")}`);
    assert.deepEqual(
      levels.map((spec) => facts.get(specIdentity(spec)).sockets),
      levels.map(() => levels[0].anchors.map((anchor) => anchor.node).sort()),
      `${assetId} every LOD must carry the same declared sockets`,
    );
  }

  const player = specs.find((spec) => spec.assetId === AIRCRAFT_ASSET_IDS.playerExterior && spec.level === 0);
  const bandit = specs.find((spec) => spec.assetId === AIRCRAFT_ASSET_IDS.banditExterior && spec.level === 0);
  const cockpit = specs.find((spec) => spec.assetId === AIRCRAFT_ASSET_IDS.playerCockpit);
  const playerFacts = facts.get(specIdentity(player));
  const banditFacts = facts.get(specIdentity(bandit));
  const cockpitFacts = facts.get(specIdentity(cockpit));

  assertInRange(playerFacts.size.x, 10.5, 12.0, "player exterior span in metres");
  assertInRange(playerFacts.size.y, 3.3, 4.5, "player exterior height in metres");
  assertInRange(playerFacts.size.z, 11.0, 12.6, "player exterior length in metres");
  assertInRange(banditFacts.size.x, 9.4, 10.7, "bandit exterior span in metres");
  assertInRange(banditFacts.size.y, 3.2, 4.4, "bandit exterior height in metres");
  assertInRange(banditFacts.size.z, 9.8, 11.4, "bandit exterior length in metres");
  assertInRange(cockpitFacts.size.x, 1.1, 1.9, "cockpit width in metres");
  assertInRange(cockpitFacts.size.y, 1.2, 2.4, "cockpit height in metres");
  assertInRange(cockpitFacts.size.z, 2.5, 4.0, "cockpit occupied length in metres");

  for (const [label, spec, sceneFacts] of [["player", player, playerFacts], ["bandit", bandit, banditFacts]]) {
    assert.ok(sceneFacts.box.min.z < -4.5 && sceneFacts.box.max.z > 4, `${label} should straddle the origin along -Z/+Z`);
    assert.ok(Math.abs(sceneFacts.center.x) < 0.15, `${label} geometry should be centred laterally`);
    assert.ok(Math.abs(sceneFacts.center.z) < 0.75, `${label} origin should remain near centre of mass`);
    const left = socketPosition(spec, "muzzle.left");
    const right = socketPosition(spec, "muzzle.right");
    assert.ok(left.x < 0 && right.x > 0, `${label} muzzle sockets should preserve left/right handedness`);
    assert.ok(left.z < 0 && right.z < 0, `${label} muzzle sockets should lie forward on -Z`);
    assert.ok(socketPosition(spec, "camera.cockpit").z < 0, `${label} cockpit camera should lie forward of the origin`);
  }
  const cockpitCamera = socketPosition(cockpit, "camera.cockpit");
  assert.ok(cockpitCamera.z < 0, "first-person camera should face toward -Z");
  assert.ok(cockpitCamera.y >= 1.6 && cockpitCamera.y <= 1.8,
    "first-person eye point should clear the instrument coaming without leaving the canopy");
  assert.deepEqual(cockpitCamera, socketPosition(player, "camera.cockpit"),
    "cockpit and exterior must share the player eye point");
  assert.ok(socketPosition(cockpit, "gunsight.origin").z < socketPosition(cockpit, "camera.cockpit").z, "gunsight should be forward of the eye point");
});

test("shared exporter emits byte-identical, self-contained aircraft GLBs", async (t) => {
  const firstRoot = await temporaryDirectory(t, "guns-only-aircraft-a-");
  const secondRoot = await temporaryDirectory(t, "guns-only-aircraft-b-");
  const [firstReport, secondReport] = await Promise.all([
    exportAssets(firstRoot),
    exportAssets(secondRoot),
  ]);
  const specs = buildAircraftAssetSpecs(THREE);
  const specsByOutput = new Map(specs.map((spec) => [spec.output, spec]));
  const firstByOutput = new Map(firstReport.assets.map((asset) => [asset.output, asset]));
  const secondByOutput = new Map(secondReport.assets.map((asset) => [asset.output, asset]));

  assert.equal(firstReport.assets.length, 7);
  assert.equal(secondReport.assets.length, 7);
  assert.deepEqual([...firstByOutput.keys()].sort(), EXPECTED_SPECS.map((spec) => spec.output).sort());
  assert.deepEqual([...secondByOutput.keys()].sort(), [...firstByOutput.keys()].sort());

  for (const output of [...firstByOutput.keys()].sort()) {
    const spec = specsByOutput.get(output);
    const firstAsset = firstByOutput.get(output);
    const secondAsset = secondByOutput.get(output);
    const firstFile = path.join(firstRoot, output);
    const secondFile = path.join(secondRoot, output);
    const [firstBytes, secondBytes, firstInfo, secondInfo] = await Promise.all([
      readFile(firstFile),
      readFile(secondFile),
      inspectModelFile(firstFile),
      inspectModelFile(secondFile),
    ]);

    assert.equal(firstBytes.equals(secondBytes), true, `${output} must export byte-identically`);
    assert.equal(firstAsset.sha256, sha256(firstBytes), `${output} first report hash`);
    assert.equal(secondAsset.sha256, sha256(secondBytes), `${output} second report hash`);
    assert.equal(firstAsset.sha256, secondAsset.sha256, `${output} deterministic hash`);
    assert.equal(firstAsset.bytes, firstBytes.byteLength, `${output} reported byte length`);
    assert.equal(secondAsset.bytes, secondBytes.byteLength, `${output} second reported byte length`);
    assert.equal(firstAsset.action, "created", `${output} first output action`);
    assert.equal(secondAsset.action, "created", `${output} second output action`);

    const expectedSockets = spec.anchors.map((anchor) => anchor.node).sort();
    for (const [copy, info] of [["first", firstInfo], ["second", secondInfo]]) {
      assert.equal(info.container, "glb", `${output} ${copy} container`);
      assert.equal(info.version, "2.0", `${output} ${copy} glTF version`);
      assert.deepEqual(info.externalUris, [], `${output} ${copy} external dependencies`);
      assert.equal(info.cameras, 0, `${output} ${copy} cameras`);
      assert.equal(info.lights, 0, `${output} ${copy} lights`);
      assert.equal(info.animations, 0, `${output} ${copy} animations`);
      assert.deepEqual(info.socketNames, expectedSockets, `${output} ${copy} sockets`);
      assert.equal(info.triangles, spec.metadata.metrics.triangles, `${output} ${copy} triangles`);
      assert.equal(info.primitives, spec.metadata.metrics.drawCalls, `${output} ${copy} primitives/draw calls`);
      assert.equal(info.materials, spec.metadata.metrics.materials, `${output} ${copy} materials`);
      assert.equal(info.uv0Primitives, info.primitives, `${output} ${copy} UV0 primitive coverage`);
      assert.equal(info.tangentPrimitives, info.primitives, `${output} ${copy} tangent primitive coverage`);
      if (spec.assetId === AIRCRAFT_ASSET_IDS.playerCockpit || spec.level < 2) {
        assert.ok(info.images >= 3, `${output} ${copy} embedded PBR images`);
        assert.ok(info.pbrTextureMaterials >= 1, `${output} ${copy} textured PBR materials`);
        assert.ok(info.normalMapMaterials >= 1, `${output} ${copy} normal-mapped materials`);
      } else {
        assert.equal(info.images, 0, `${output} ${copy} far LOD image count`);
      }
      assert.ok(info.triangles <= spec.metadata.budgets.triangles, `${output} ${copy} triangle budget`);
      assert.ok(info.primitives <= spec.metadata.budgets.drawCalls, `${output} ${copy} draw-call budget`);
      assert.ok(info.materials <= spec.metadata.budgets.materials, `${output} ${copy} material budget`);
    }

    assert.equal(firstAsset.triangles, firstInfo.triangles, `${output} report triangle consistency`);
    assert.equal(firstAsset.primitives, firstInfo.primitives, `${output} report primitive consistency`);
    assert.equal(firstAsset.materials, firstInfo.materials, `${output} report material consistency`);
    assert.deepEqual(firstAsset.sockets, expectedSockets, `${output} report socket consistency`);
    assert.deepEqual(secondAsset, { ...firstAsset, action: secondAsset.action }, `${output} reports must otherwise match`);
  }
});

test("reviewed aircraft metrics match the canonical generated GLBs", async () => {
  const reviewed = JSON.parse(await readFile(REVIEWED_METRICS, "utf8"));
  assert.equal(reviewed.generator, "guns-only-aircraft-assets/2.0.0");
  assert.equal(reviewed.assets.length, EXPECTED_SPECS.length);
  for (const entry of reviewed.assets) {
    const file = path.join(CANONICAL_PACK, entry.output);
    const [bytes, info] = await Promise.all([readFile(file), inspectModelFile(file)]);
    assert.equal(bytes.byteLength, entry.bytes, `${entry.output} reviewed bytes`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.output} reviewed hash`);
    assert.equal(info.triangles, entry.triangles, `${entry.output} reviewed triangles`);
    assert.equal(info.primitives, entry.drawCalls, `${entry.output} reviewed draw calls`);
    assert.equal(info.materials, entry.materials, `${entry.output} reviewed materials`);
    assert.equal(info.textures, entry.textures, `${entry.output} reviewed textures`);
    assert.equal(info.uv0Primitives, entry.uv0Primitives, `${entry.output} reviewed UV0 coverage`);
    assert.equal(info.tangentPrimitives, entry.tangentPrimitives, `${entry.output} reviewed tangent coverage`);
    assert.equal(info.pbrTextureMaterials, entry.pbrTextureMaterials, `${entry.output} reviewed PBR material count`);
  }
});
