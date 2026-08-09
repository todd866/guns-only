import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const CANONICAL_ROOT = path.join(REPOSITORY_ROOT, "content/packs/weekend-ride");
const STAGED_ROOT = path.join(REPOSITORY_ROOT, "web/wwwroot/content/packs/weekend-ride");

const EXPECTED_RELEASE_FILES = Object.freeze([
  "environment/foliage/weekend-roadside-art-manifest.v1.json",
  "environment/foliage/weekend-roadside-atlas-v1.png",
  "environment/roads/weekend-hinterland-road-network.v1.json",
  "environment/textures/track-asphalt-v1.webp",
  "environment/textures/track-surface-art-manifest.v1.json",
  "environment/textures/weekend-field-landcover-v1.webp",
  "environment/textures/weekend-hinterland-ground-v1.webp",
  "presentation/r1-first-person-contract.v1.json",
  "presentation/weekend-track-day-presentation.v1.json",
  "qa/weekend-visual-acceptance.v1.json",
]);

const UNITY_RELEASE_PATHS = Object.freeze({
  "environment/foliage/weekend-roadside-art-manifest.v1.json":
    "OpenRoad/weekend-roadside-art-manifest-v1.json",
  "environment/foliage/weekend-roadside-atlas-v1.png":
    "OpenRoad/weekend-roadside-atlas-v1.png",
  "environment/roads/weekend-hinterland-road-network.v1.json":
    "OpenRoad/weekend-hinterland-road-network-v1.json",
  "environment/textures/track-asphalt-v1.webp":
    "OpenRoad/source/track-asphalt-v1.webp.bytes",
  "environment/textures/track-surface-art-manifest.v1.json":
    "OpenRoad/track-surface-art-manifest-v1.json",
  "environment/textures/weekend-field-landcover-v1.webp":
    "OpenRoad/source/weekend-field-landcover-v1.webp.bytes",
  "environment/textures/weekend-hinterland-ground-v1.webp":
    "OpenRoad/source/weekend-hinterland-ground-v1.webp.bytes",
  "presentation/r1-first-person-contract.v1.json":
    "r1-first-person-contract-v1.json",
  "presentation/weekend-track-day-presentation.v1.json":
    "Circuit/weekend-track-day-presentation-v1.json",
  "qa/weekend-visual-acceptance.v1.json":
    "QA/weekend-visual-acceptance-v1.json",
});

const UNITY_RELEASE_ROOT = path.join(
  REPOSITORY_ROOT,
  "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide",
);

const ART_MANIFESTS = Object.freeze([
  "environment/foliage/weekend-roadside-art-manifest.v1.json",
  "environment/textures/track-surface-art-manifest.v1.json",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "release contract numbers must be finite");
  }
  return JSON.stringify(value);
}

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function readPair(relative) {
  const [canonical, staged] = await Promise.all([
    readFile(path.join(CANONICAL_ROOT, relative)),
    readFile(path.join(STAGED_ROOT, relative)),
  ]);
  return { canonical, staged };
}

test("Weekend release pack has one exact canonical, staged, and Unity-source closure", async () => {
  const [canonicalFiles, stagedFiles] = await Promise.all([
    walk(CANONICAL_ROOT),
    walk(STAGED_ROOT),
  ]);
  assert.deepEqual(canonicalFiles, EXPECTED_RELEASE_FILES);
  assert.deepEqual(stagedFiles, EXPECTED_RELEASE_FILES);

  for (const relative of EXPECTED_RELEASE_FILES) {
    const { canonical, staged } = await readPair(relative);
    assert.equal(staged.equals(canonical), true, `${relative} staged bytes drifted`);
    const unityRelative = UNITY_RELEASE_PATHS[relative];
    assert.equal(typeof unityRelative, "string", `${relative} lacks a Unity source mapping`);
    const unity = await readFile(path.join(UNITY_RELEASE_ROOT, unityRelative));
    assert.equal(unity.equals(canonical), true, `${relative} Unity source bytes drifted`);
  }
});

test("Weekend generated-art provenance pins every runtime byte", async () => {
  const seenAssets = new Set();
  for (const relative of ART_MANIFESTS) {
    const { canonical: manifestBytes, staged: stagedManifestBytes } = await readPair(relative);
    assert.equal(stagedManifestBytes.equals(manifestBytes), true, `${relative} manifest drifted`);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));

    assert.equal(manifest.schemaVersion, "1.0.0");
    assert.match(manifest.assetFamilyId, /^art\.weekend-ride\./);
    assert.equal(manifest.authorship.generatedOn, "2026-08-09");
    assert.match(manifest.authorship.method, /image generation/i);
    assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);

    for (const asset of manifest.assets) {
      assert.equal(seenAssets.has(asset.id), false, `duplicate art asset ${asset.id}`);
      seenAssets.add(asset.id);
      assert.match(asset.id, /^environment\.(?:foliage|texture)\.weekend-/);
      assert.equal(path.basename(asset.uri), asset.uri, `${asset.id} must remain manifest-local`);
      assert.match(asset.source.generatedPngSha256, /^[a-f0-9]{64}$/);
      assert.ok(asset.source.generatedPngSizeBytes > 0);
      assert.match(asset.source.modelBackend, /OpenAI built-in image generation/);
      assert.equal(asset.processing.width, 1024);
      assert.equal(asset.processing.height, 1024);
      assert.match(asset.processing.runtimeSha256, /^[a-f0-9]{64}$/);
      assert.ok(asset.processing.runtimeSizeBytes > 0);

      const canonicalAssetPath = path.join(CANONICAL_ROOT, path.dirname(relative), asset.uri);
      const stagedAssetPath = path.join(STAGED_ROOT, path.dirname(relative), asset.uri);
      const [canonicalAsset, stagedAsset] = await Promise.all([
        readFile(canonicalAssetPath),
        readFile(stagedAssetPath),
      ]);
      assert.equal(stagedAsset.equals(canonicalAsset), true, `${asset.id} staged bytes drifted`);
      assert.equal(sha256(canonicalAsset), asset.processing.runtimeSha256);
      assert.equal(canonicalAsset.byteLength, asset.processing.runtimeSizeBytes);
      if (asset.processing.unityPngSha256 || asset.processing.unityPngSizeBytes) {
        assert.match(asset.processing.unityPngSha256, /^[a-f0-9]{64}$/);
        assert.ok(asset.processing.unityPngSizeBytes > 0);
        const unityPng = await readFile(path.join(
          UNITY_RELEASE_ROOT,
          "OpenRoad",
          asset.uri.replace(/\.webp$/, ".png"),
        ));
        assert.equal(sha256(unityPng), asset.processing.unityPngSha256,
          `${asset.id} Unity PNG hash drifted`);
        assert.equal(unityPng.byteLength, asset.processing.unityPngSizeBytes,
          `${asset.id} Unity PNG size drifted`);
      }
    }
  }

  assert.deepEqual([...seenAssets].sort(), [
    "environment.foliage.weekend-roadside-atlas.v1",
    "environment.texture.weekend-field-landcover.v1",
    "environment.texture.weekend-hinterland-ground.v1",
    "environment.texture.weekend-track-asphalt.v1",
  ]);
});

test("Weekend road contract resolves its exact generated surfaces and atlas", async () => {
  const relative = "environment/roads/weekend-hinterland-road-network.v1.json";
  const { canonical, staged } = await readPair(relative);
  assert.equal(staged.equals(canonical), true);
  const contract = JSON.parse(canonical.toString("utf8"));

  assert.equal(contract.schema, "guns-only.weekend-road-network.v1");
  assert.equal(contract.route_kind, "connected-road-network");
  assert.equal(contract.geometry.coordinate_system, "left-handed-east-up-north-metres");
  assert.equal(contract.primary_route_length_m, 15_784.050519750808);
  assert.equal(contract.roads.length, 8);
  assert.equal(contract.junctions.length, 7);
  assert.equal(contract.roadside_instances.length, 144);

  for (const surface of [
    contract.road_surface,
    contract.world_ground_surface,
    contract.roadside_atlas,
  ]) {
    const canonicalAsset = await readFile(path.join(CANONICAL_ROOT, surface.pack_relative_uri));
    const stagedAsset = await readFile(path.join(STAGED_ROOT, surface.pack_relative_uri));
    assert.equal(stagedAsset.equals(canonicalAsset), true, `${surface.asset_id} staged bytes drifted`);
    assert.equal(sha256(canonicalAsset), surface.sha256, `${surface.asset_id} hash drifted`);
    assert.equal(surface.color_space, "sRGB");
  }
});

test("Weekend circuit scene manifest is internally pinned to current Web source and assets", async () => {
  const relative = "presentation/weekend-track-day-presentation.v1.json";
  const { canonical, staged } = await readPair(relative);
  assert.equal(staged.equals(canonical), true);
  const manifest = JSON.parse(canonical.toString("utf8"));

  assert.equal(manifest.schema, "guns-only.weekend-track-day-scene.v1");
  assert.equal(manifest.serialization, "canonical-json-v1");
  assert.equal(manifest.source.module,
    "web/wwwroot/render/motorcycle/track_day_presentation.js");
  assert.equal(manifest.route_authority.schema, "guns-only.weekend-route.v1");
  assert.equal(manifest.route_authority.route_kind, "closed-circuit");
  assert.equal(manifest.route_authority.closed, true);
  assert.ok(manifest.scene.leaf_count > 0);
  assert.equal(manifest.scene.leaf_count, manifest.scene.leaves.length);

  const sourceBytes = await readFile(path.join(REPOSITORY_ROOT, manifest.source.module));
  assert.equal(sha256(sourceBytes), manifest.source.source_sha256,
    "Weekend scene export is stale relative to its Web renderer source");
  for (const texture of manifest.textures) {
    const bytes = await readFile(path.join(REPOSITORY_ROOT, texture.source));
    assert.equal(sha256(bytes), texture.sha256, `${texture.id} scene texture hash drifted`);
  }

  const { semantic_sha256: declaredSemanticSha256, ...semanticPayload } = manifest;
  assert.equal(sha256(canonicalJson(semanticPayload)), declaredSemanticSha256,
    "Weekend scene semantic hash does not describe its payload");
});

test("Weekend visual acceptance contract pins the released scenes and world art", async () => {
  const relative = "qa/weekend-visual-acceptance.v1.json";
  const { canonical, staged } = await readPair(relative);
  assert.equal(staged.equals(canonical), true);
  const contract = JSON.parse(canonical.toString("utf8"));

  assert.equal(contract.schema, "guns-only.weekend-visual-acceptance.v1");
  assert.equal(contract.serialization, "canonical-json-v1");

  const circuitBytes = await readFile(path.join(
    CANONICAL_ROOT,
    "presentation/weekend-track-day-presentation.v1.json",
  ));
  const circuit = JSON.parse(circuitBytes.toString("utf8"));
  assert.equal(contract.scenes.circuit.file_sha256, sha256(circuitBytes));
  assert.equal(contract.scenes.circuit.semantic_sha256, circuit.semantic_sha256);
  assert.equal(contract.scenes.circuit.leaf_count, circuit.scene.leaf_count);

  const roadsBytes = await readFile(path.join(
    CANONICAL_ROOT,
    "environment/roads/weekend-hinterland-road-network.v1.json",
  ));
  const roads = JSON.parse(roadsBytes.toString("utf8"));
  assert.equal(contract.scenes.open_road.file_sha256, sha256(roadsBytes));
  assert.equal(contract.scenes.open_road.id, roads.id);
  assert.equal(contract.scenes.open_road.road_count, roads.roads.length);
  assert.equal(contract.scenes.open_road.roadside_instance_count,
    roads.roadside_instances.length);

  const assetPaths = new Map([
    ["environment.texture.weekend-track-asphalt.v1",
      "environment/textures/track-asphalt-v1.webp"],
    ["environment.texture.weekend-hinterland-ground.v1",
      "environment/textures/weekend-hinterland-ground-v1.webp"],
    ["environment.texture.weekend-field-landcover.v1",
      "environment/textures/weekend-field-landcover-v1.webp"],
    ["environment.foliage.weekend-roadside-atlas.v1",
      "environment/foliage/weekend-roadside-atlas-v1.png"],
  ]);
  assert.deepEqual(contract.assets.map((asset) => asset.id).sort(),
    [...assetPaths.keys()].sort());
  for (const asset of contract.assets) {
    const bytes = await readFile(path.join(CANONICAL_ROOT, assetPaths.get(asset.id)));
    assert.equal(asset.sha256, sha256(bytes), `${asset.id} acceptance hash drifted`);
  }
});
