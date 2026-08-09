import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDir, "../../..");
const exporter = resolve(repositoryRoot, "tools/cobra-unity/export-jungle-manifest.mjs");
const canonical = resolve(
  repositoryRoot,
  "content/packs/cobra-vietnam/environment/cobra-canyon-asset-kit-desktop-v1.json",
);
const staged = resolve(
  repositoryRoot,
  "web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon-asset-kit-desktop-v1.json",
);

test("Web Build 299 deterministically exports the exact staged Unity asset kit", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "guns-only-cobra-unity-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const output = join(scratch, "cobra-canyon-asset-kit-desktop-v1.json");
  const run = spawnSync(process.execPath, [exporter, "--out", output], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);

  const [expectedBytes, stagedBytes, outputBytes] = await Promise.all([
    readFile(canonical),
    readFile(staged),
    readFile(output),
  ]);
  assert.deepEqual(stagedBytes, expectedBytes, "published source copy drifted");
  assert.deepEqual(outputBytes, expectedBytes, "exported Web plan drifted");

  const manifest = JSON.parse(outputBytes.toString("utf8"));
  assert.equal(manifest.sourceWebBuild, 299);
  assert.equal(manifest.qualityTier, "desktop");
  assert.equal(manifest.roles.length, 7);
  assert.equal(
    manifest.roles.reduce((count, role) => count + role.instances.length, 0),
    1_330,
  );
});
