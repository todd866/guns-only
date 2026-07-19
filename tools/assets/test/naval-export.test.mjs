import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { inspectModelFile } from "../lib/glb.mjs";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const EXPORTER = path.join(REPOSITORY_ROOT, "tools/assets/generators/export-assets.mjs");
const NAVAL_MODULE = path.join(REPOSITORY_ROOT, "tools/assets/generators/naval-assets.mjs");
const OUTPUTS = Object.freeze([
  "models/naval/straight-deck-carrier.glb",
  "models/naval/gun-destroyer-escort.glb",
]);

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function exportNaval(outputRoot) {
  const { stdout } = await execFileAsync(process.execPath, [
    EXPORTER,
    "--module", NAVAL_MODULE,
    "--output-root", outputRoot,
  ], { cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

test("naval exporter is byte-deterministic, self-contained, UV-authored, and PBR-ready", async (t) => {
  const firstRoot = await temporaryDirectory(t, "guns-only-naval-a-");
  const secondRoot = await temporaryDirectory(t, "guns-only-naval-b-");
  const [firstReport, secondReport] = await Promise.all([exportNaval(firstRoot), exportNaval(secondRoot)]);
  assert.deepEqual(firstReport.assets.map((asset) => asset.output), OUTPUTS);
  assert.deepEqual(secondReport.assets.map((asset) => asset.output), OUTPUTS);

  for (const output of OUTPUTS) {
    const firstFile = path.join(firstRoot, output);
    const secondFile = path.join(secondRoot, output);
    const [firstBytes, secondBytes, info] = await Promise.all([
      readFile(firstFile), readFile(secondFile), inspectModelFile(firstFile),
    ]);
    assert.equal(firstBytes.equals(secondBytes), true, `${output} deterministic bytes`);
    assert.deepEqual(info.externalUris, [], `${output} external dependencies`);
    assert.equal(info.images, 6, `${output} embedded paint/deck images`);
    assert.equal(info.textures, 6, `${output} embedded paint/deck textures`);
    assert.equal(info.primitives, 14, `${output} consolidated primitive count`);
    assert.equal(info.uv0Primitives, info.primitives, `${output} UV0 coverage`);
    assert.ok(info.tangentPrimitives >= info.primitives - 2, `${output} major-surface tangent coverage`);
    assert.equal(info.pbrTextureMaterials, 4, `${output} textured PBR materials`);
    assert.equal(info.normalMapMaterials, 4, `${output} normal-mapped materials`);
    assert.equal(info.cameras, 0, `${output} camera count`);
    assert.equal(info.lights, 0, `${output} light count`);
  }
});
