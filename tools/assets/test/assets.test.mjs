import assert from "node:assert/strict";
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeStage, planExport, planOptimize } from "../lib/build.mjs";
import { checkSafePath, pathExists, readJson, stableStringify } from "../lib/common.mjs";
import { inspectModelFile } from "../lib/glb.mjs";
import { validateRepository } from "../lib/validator.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const FIXTURE = path.join(TEST_DIRECTORY, "fixtures/socket-triangle.gltf");
const STARTER_PACK = "content/packs/korea-1950s/pack.json";
const WEB_BRIDGE = "web/WebBridge.cs";

function csharpStringConstants(source) {
  const constants = new Map();
  const declaration = /\bconst\s+string\s+([A-Za-z_]\w*)\s*=\s*"([^"]*)"\s*;/g;
  for (const match of source.matchAll(declaration)) constants.set(match[1], match[2]);
  return constants;
}

function requiredConstant(constants, name) {
  assert.equal(constants.has(name), true, `WebBridge is missing const string ${name}`);
  return constants.get(name);
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function authoredPackCopy(t) {
  const root = await temporaryDirectory(t, "guns-only-assets-");
  await cp(path.join(REPOSITORY_ROOT, "content"), path.join(root, "content"), { recursive: true });
  const packDirectory = path.join(root, "content/packs/korea-1950s");
  await mkdir(path.join(packDirectory, "models"), { recursive: true });
  await copyFile(FIXTURE, path.join(packDirectory, "models/socket-triangle.gltf"));

  const assetFile = path.join(packDirectory, "asset-manifest.json");
  const assets = await readJson(assetFile);
  assets.assets[0] = {
    ...assets.assets[0],
    status: "production",
    sources: [],
    fallbacks: [],
    lods: [{
      level: 0,
      minProjectedPixels: 0,
      source: { uri: "models/socket-triangle.gltf", format: "gltf", mediaType: "model/gltf+json" },
      budgets: { triangles: 1, drawCalls: 1, materials: 1, textureMemoryMiB: 0, maxTextureDimension: 1 },
    }],
    anchors: [
      { id: "camera.cockpit", node: "SOCKET_CAMERA_COCKPIT" },
      { id: "muzzle.left", node: "SOCKET_MUZZLE_LEFT" },
      { id: "muzzle.right", node: "SOCKET_MUZZLE_RIGHT" },
    ],
  };
  await writeFile(assetFile, stableStringify(assets));

  const licenseFile = path.join(packDirectory, "licenses.json");
  const licenses = await readJson(licenseFile);
  licenses.entries[0].appliesTo.push("models/socket-triangle.gltf");
  licenses.entries[0].appliesTo.sort();
  await writeFile(licenseFile, stableStringify(licenses));
  return { root, packDirectory, assetFile, licenseFile };
}

test("canonical pack-relative paths reject traversal and non-canonical forms", () => {
  assert.equal(checkSafePath("models/fighter/lod0.glb"), null);
  assert.match(checkSafePath("../fighter.glb"), /must not contain/);
  assert.match(checkSafePath("models\\fighter.glb"), /POSIX/);
  assert.match(checkSafePath("https://example.invalid/fighter.glb"), /local path/);
});

test("dependency-free glTF inspection counts geometry and sockets", async () => {
  const result = await inspectModelFile(FIXTURE);
  assert.equal(result.triangles, 1);
  assert.equal(result.primitives, 1);
  assert.equal(result.materials, 1);
  assert.deepEqual(result.socketNames, ["SOCKET_CAMERA_COCKPIT", "SOCKET_MUZZLE_LEFT", "SOCKET_MUZZLE_RIGHT"]);
});

test("canonical starter content passes strict validation", async () => {
  const report = await validateRepository({ root: REPOSITORY_ROOT, packs: [STARTER_PACK], strict: true });
  assert.equal(report.ok, true, stableStringify({ errors: report.errors, warnings: report.warnings }));
  assert.deepEqual(report.summary, {
    schemas: 4,
    manifests: 4,
    packs: 1,
    profiles: 1,
    assets: 11,
    licenses: 1,
    referencedBytes: 2317099,
    modelTriangles: 20396,
  });
});

test("WebBridge Korea presentation constants match the canonical starter pack", async () => {
  const bridgeSource = await readFile(path.join(REPOSITORY_ROOT, WEB_BRIDGE), "utf8");
  const constants = csharpStringConstants(bridgeSource);
  const packFile = path.join(REPOSITORY_ROOT, STARTER_PACK);
  const packDirectory = path.dirname(packFile);
  const pack = await readJson(packFile);
  const presentation = pack.presentation.profiles.find(
    (candidate) => candidate.id === pack.presentation.defaultPresentationProfileId,
  );
  assert.ok(presentation, "canonical pack default presentation profile must exist");
  const profileFile = path.resolve(packDirectory, presentation.visualProfile.uri);
  const profile = await readJson(profileFile);
  const manifestFile = path.resolve(path.dirname(profileFile), profile.assetProfile.manifest.uri);
  const manifest = await readJson(manifestFile);

  const expectedConstants = {
    KoreaPackId: pack.packId,
    KoreaPackVersion: pack.packVersion,
    KoreaPackUri: STARTER_PACK,
    SnapshotSchemaVersion: pack.compatibility.snapshotSchemaVersion,
    KoreaPresentationProfileId: presentation.id,
    KoreaVisualProfileId: profile.profileId,
    KoreaAssetProfileId: profile.assetProfile.id,
    KoreaAssetManifestId: manifest.manifestId,
    FixedWingCameraProfileId: presentation.cameraProfileId,
    FixedWingHudProfileId: presentation.hudProfileId,
    FixedWingInputProfileId: presentation.inputProfileId,
    FixedWingAudioProfileId: presentation.audioProfileId,
    FixedWingEffectsProfileId: presentation.effectsProfileId,
  };
  for (const [name, expected] of Object.entries(expectedConstants)) {
    assert.equal(requiredConstant(constants, name), expected, `${name} drifted from canonical content`);
  }

  assert.equal(presentation.visualProfile.id, profile.profileId);
  assert.equal(presentation.assetProfileId, profile.assetProfile.id);
  assert.equal(presentation.effectsProfileId, profile.effectsProfile.id);
  assert.equal(profile.assetProfile.manifest.id, manifest.manifestId);

  const canonicalBindings = profile.assetProfile.bindings
    .map((binding) => binding.presentationId)
    .sort();
  const bridgeBindings = [
    requiredConstant(constants, "PlayerPresentationId"),
    requiredConstant(constants, "BanditPresentationId"),
    requiredConstant(constants, "CarrierPresentationId"),
  ].sort();
  assert.equal(new Set(bridgeBindings).size, bridgeBindings.length);
  for (const binding of bridgeBindings) {
    assert.equal(canonicalBindings.includes(binding), true,
      `WebBridge presentation binding ${binding} is absent from canonical content`);
  }
});

test("authored model LOD, budget, license coverage, and anchors validate together", async (t) => {
  const baseline = await validateRepository({
    root: REPOSITORY_ROOT,
    packs: [STARTER_PACK],
    strict: true,
  });
  const copy = await authoredPackCopy(t);
  const report = await validateRepository({ root: copy.root, packs: [STARTER_PACK], strict: true });
  assert.equal(report.ok, true, stableStringify({ errors: report.errors, warnings: report.warnings }));
  const canonicalAssets = await readJson(path.join(REPOSITORY_ROOT, "content/packs/korea-1950s/asset-manifest.json"));
  const canonicalPlayer = canonicalAssets.assets.find((asset) => asset.id === "vehicle.player.sabre-fury.v1");
  const primaryPlayerModel = await inspectModelFile(path.join(
    REPOSITORY_ROOT,
    "content/packs/korea-1950s",
    canonicalPlayer.lods[0].source.uri,
  ));
  const replacedTriangles = primaryPlayerModel.triangles;
  assert.equal(report.summary.modelTriangles, baseline.summary.modelTriangles - replacedTriangles + 1);
  assert.equal(report.packClosures[0].runtimeFiles.some((file) => file.endsWith("models/socket-triangle.gltf")), true);
});

test("semantic validator catches LOD ordering, real budgets, license scope, and socket naming", async (t) => {
  const copy = await authoredPackCopy(t);
  const assets = await readJson(copy.assetFile);
  assets.assets[0].lods[0].level = 1;
  assets.assets[0].lods[0].budgets.triangles = 0;
  assets.assets[0].anchors[0].node = "COCKPIT_CAMERA";
  await writeFile(copy.assetFile, stableStringify(assets));
  const licenses = await readJson(copy.licenseFile);
  const removedLicenseScopes = new Set([
    "vehicle.player.sabre-fury.v1",
    "models/socket-triangle.gltf",
  ]);
  licenses.entries[0].appliesTo = licenses.entries[0].appliesTo.filter(
    (item) => !removedLicenseScopes.has(item),
  );
  await writeFile(copy.licenseFile, stableStringify(licenses));

  const report = await validateRepository({ root: copy.root, packs: [STARTER_PACK], strict: true });
  const codes = new Set(report.errors.map((error) => error.code));
  assert.equal(report.ok, false);
  for (const code of ["lod.order", "budget.exceeded", "license.coverage", "socket.nodeName"]) assert.equal(codes.has(code), true, `missing ${code}`);
});

test("dry-run build plans require no external optimizer", async (t) => {
  const directory = await temporaryDirectory(t, "guns-only-plan-");
  const blend = path.join(directory, "fighter.blend");
  await writeFile(blend, "test placeholder");
  const exported = await planExport({ root: REPOSITORY_ROOT, source: blend, output: path.join(directory, "fighter.glb"), dryRun: true });
  assert.equal(exported.command.includes("--background"), true);
  assert.equal(exported.command.includes("--apply-modifiers"), true);

  const optimized = await planOptimize({ root: REPOSITORY_ROOT, source: FIXTURE, output: path.join(directory, "fighter.glb"), dryRun: true });
  assert.equal(path.basename(optimized.command[0]), "gltf-transform");
  assert.deepEqual(optimized.command.slice(-4), ["--compress", "meshopt", "--texture-compress", "ktx2"]);

  await assert.rejects(
    () => planOptimize({
      root: REPOSITORY_ROOT,
      source: FIXTURE,
      output: path.join(directory, "fighter-draco.glb"),
      compress: "draco",
      dryRun: true,
    }),
    /--compress must be meshopt or none/,
  );
});

test("stage publishes schemas and a validated pack atomically without changing sources", async (t) => {
  const directory = await temporaryDirectory(t, "guns-only-stage-");
  const output = path.join(directory, "site-content");
  const before = await readFile(path.join(REPOSITORY_ROOT, STARTER_PACK), "utf8");
  const first = await executeStage({ root: REPOSITORY_ROOT, pack: STARTER_PACK, output });
  assert.equal(first.schemas.action, "created");
  assert.equal(first.pack.action, "created");
  assert.equal(await pathExists(path.join(output, "schemas/content-pack.schema.json")), true);
  assert.equal(await pathExists(path.join(output, "packs/korea-1950s/pack.json")), true);
  assert.equal(await readFile(path.join(REPOSITORY_ROOT, STARTER_PACK), "utf8"), before);
  const stagedReport = await validateRepository({
    root: output,
    schemaDir: "schemas",
    packs: ["packs/korea-1950s/pack.json"],
    strict: true,
  });
  assert.equal(stagedReport.ok, true, stableStringify({ errors: stagedReport.errors, warnings: stagedReport.warnings }));

  const second = await executeStage({ root: REPOSITORY_ROOT, pack: STARTER_PACK, output });
  assert.equal(second.schemas.action, "unchanged");
  assert.equal(second.pack.action, "unchanged");

  await writeFile(path.join(output, "packs/korea-1950s/pack.json"), `${before}\n`);
  await assert.rejects(() => executeStage({ root: REPOSITORY_ROOT, pack: STARTER_PACK, output, dryRun: true }), /--replace/);
});
