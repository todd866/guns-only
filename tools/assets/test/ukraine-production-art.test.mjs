import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const CANONICAL_ROOT = path.join(
  REPOSITORY_ROOT,
  "content/packs/ukraine-modern/environment/foliage",
);
const STAGED_ROOT = path.join(
  REPOSITORY_ROOT,
  "web/wwwroot/content/packs/ukraine-modern/environment/foliage",
);

const EXPECTED_FILES = Object.freeze([
  "ukraine-foliage-art-manifest.v1.json",
  "ukraine-temperate-foliage-v1.png",
]);
const MANIFEST_SHA256 = "d9a2ff59a5c9d2e54c6696c121befe7f8f7b4fa68599e975a14e747c8ce61e77";
const GENERATED_SOURCE_SHA256 = "3e901c2f85495f3edf81ee967e081bc04507508b98624325d6a12ce8742658c0";
const RUNTIME_SHA256 = "9172d362a64332cb87535359b2ed9553db28fb01628de909196446ff34ccfec4";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("Ukraine production foliage has one exact canonical and staged release set", async () => {
  const [canonicalFiles, stagedFiles] = await Promise.all([
    readdir(CANONICAL_ROOT),
    readdir(STAGED_ROOT),
  ]);
  assert.deepEqual(canonicalFiles.sort(), [...EXPECTED_FILES]);
  assert.deepEqual(stagedFiles.sort(), [...EXPECTED_FILES]);

  for (const relative of EXPECTED_FILES) {
    const [canonical, staged] = await Promise.all([
      readFile(path.join(CANONICAL_ROOT, relative)),
      readFile(path.join(STAGED_ROOT, relative)),
    ]);
    assert.equal(staged.equals(canonical), true, `${relative} staged bytes drifted`);
  }
});

test("Ukraine production foliage provenance pins the exact RGBA runtime atlas", async () => {
  const [manifestBytes, runtimeBytes] = await Promise.all([
    readFile(path.join(CANONICAL_ROOT, EXPECTED_FILES[0])),
    readFile(path.join(CANONICAL_ROOT, EXPECTED_FILES[1])),
  ]);
  assert.equal(sha256(manifestBytes), MANIFEST_SHA256);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.assetFamilyId, "art.ukraine-modern.temperate-foliage.v1");
  assert.equal(manifest.authorship.generatedOn, "2026-08-09");
  assert.match(manifest.authorship.method, /image generation/i);
  assert.equal(manifest.assets.length, 1);

  const asset = manifest.assets[0];
  assert.equal(asset.id, "environment.foliage.ukraine-temperate.v1");
  assert.equal(asset.uri, EXPECTED_FILES[1]);
  assert.equal(asset.source.generatedPngSha256, GENERATED_SOURCE_SHA256);
  assert.equal(asset.source.generatedPngSizeBytes, 1_670_121);
  assert.match(asset.source.modelBackend, /OpenAI built-in image generation/);
  assert.equal(asset.processing.width, 1_024);
  assert.equal(asset.processing.height, 1_024);
  assert.equal(asset.processing.runtimeSha256, RUNTIME_SHA256);
  assert.equal(asset.processing.runtimeSizeBytes, 1_283_185);
  assert.equal(sha256(runtimeBytes), RUNTIME_SHA256);
  assert.equal(runtimeBytes.byteLength, asset.processing.runtimeSizeBytes);

  assert.equal(runtimeBytes.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(runtimeBytes.readUInt32BE(16), 1_024, "PNG width drifted");
  assert.equal(runtimeBytes.readUInt32BE(20), 1_024, "PNG height drifted");
  assert.equal(runtimeBytes[24], 8, "PNG must retain 8-bit channels");
  assert.equal(runtimeBytes[25], 6, "PNG must retain RGBA colour type");
});

test("Ukraine production foliage is explicit in staging and actual-publish closure", async () => {
  const releaseGate = await readFile(path.join(REPOSITORY_ROOT, "bin/check"), "utf8");
  assert.match(releaseGate,
    /ukraine_foliage_source="\$ukraine_env_dir\/foliage"[\s\S]*cp -R "\$ukraine_foliage_source\/\." "\$ukraine_foliage_stage\/"/);
  assert.match(releaseGate,
    /for ukraine_foliage_relative in \\\n+  ukraine-foliage-art-manifest\.v1\.json \\\n+  ukraine-temperate-foliage-v1\.png[\s\S]*cmp -s "\$ukraine_foliage_canonical" "\$ukraine_foliage_published"/);
});
