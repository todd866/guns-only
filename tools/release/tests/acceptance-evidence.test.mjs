import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { acceptanceMatrix, DIMENSIONS, fileHash, treeHash, main } from "../acceptance-evidence.mjs";
const identity = { sourceRevision: "a".repeat(40), build: "353", artifactSha256: "b".repeat(64) };
const experiences = ["first-merge", "weekend-ride"];

test("missing acceptance is not_run; source mismatches and unsupported claims fail closed", async () => {
  const matrix = await acceptanceMatrix({ identity, experiences });
  for (const row of Object.values(matrix)) for (const key of Object.keys(DIMENSIONS))
    assert.deepEqual(row[key], { status: "not_run" });
  const evidence = { schemaVersion: 1, identity, matrix: { "first-merge": { bonus: { status: "passed" } } } };
  await assert.rejects(acceptanceMatrix({ identity, experiences, evidence }), /Unsupported dimension/);
  await assert.rejects(acceptanceMatrix({ identity, experiences, evidence: { ...evidence, identity: { ...identity, build: "352" } } }), /identity mismatch/);
  await assert.rejects(acceptanceMatrix({ identity, experiences, evidence: { ...evidence, matrix: { "first-merge": { outcome: { status: "not_applicable", reason: "not tested" } } } } }), /evidence or not_run/);
});
test("boot evidence cannot become outcome evidence, and a changed proof artifact is rejected", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "guns-acceptance-")); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "proof.json"), '{"physicalOutcome":"recovered"}');
  const proof = { kind: "browser-outcome", path: "proof.json", sha256: await fileHash(path.join(root, "proof.json")) };
  const cell = { status: "passed", route: "/?program=first-merge", device: "Chromium desktop", seed: "authored default", summary: "Physical recovery observed", proof };
  const evidence = { schemaVersion: 1, identity, matrix: { "first-merge": { outcome: cell } } };
  const options = { identity, experiences, evidence, proofRoot: root };
  assert.equal((await acceptanceMatrix(options))["first-merge"].outcome.status, "passed");
  proof.kind = "browser-boot"; await assert.rejects(acceptanceMatrix(options), /browser-outcome proof/);
  proof.kind = "browser-outcome";
  await writeFile(path.join(root, "proof.json"), "changed");
  await assert.rejects(acceptanceMatrix(options), /hash mismatch/);
  delete cell.device; await assert.rejects(acceptanceMatrix(options), /device required/);
});
test("tree identity matches deploy byte ordering including mixed case paths", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "guns-tree-")); t.after(() => rm(root, { recursive: true, force: true }));
  const expected = createHash("sha256");
  for (const name of ["B.json", "Z.json", "a.json"]) {
    await writeFile(path.join(root, name), name);
    const length = Buffer.alloc(4); length.writeUInt32BE(Buffer.byteLength(name));
    expected.update(length).update(name).update(createHash("sha256").update(name).digest());
  }
  assert.equal(await treeHash(root), expected.digest("hex"));
});
test("CLI binds the actual published files and writes a reproducible inventory outside wwwroot", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "guns-cli-")); t.after(() => rm(root, { recursive: true, force: true }));
  const www = path.join(root, "www");
  const atlas = "content/packs/ukraine-modern/environment/terrain-atlas";
  for (const folder of ["api", "render/progression", atlas]) await mkdir(path.join(www, folder), { recursive: true });
  await writeFile(path.join(www, "api/build-info.js"), 'const RELEASE_BUILD = "353";');
  await writeFile(path.join(www, "render/progression/campaign_progression.js"), 'export function productionExperiences() { return [{id:"first-merge"}]; }');
  await writeFile(path.join(www, atlas, "rapier-range.atlas.manifest.json"), "{}");
  const output = path.join(root, "acceptance.json");
  const args = ["--wwwroot", www, "--output", output, "--sha", identity.sourceRevision, "--generated-at", "2026-09-05T00:00:00Z"];
  await main(args); const first = await readFile(output, "utf8");
  await main(args); assert.equal(await readFile(output, "utf8"), first);
  const manifest = JSON.parse(first);
  assert.equal(manifest.identity.artifactSha256, await treeHash(www));
  assert.equal(manifest.matrix["first-merge"].human.status, "not_run");
  await assert.rejects(main(["--wwwroot", www, "--output", output, "--sha", "bad"]), /40-character/);
});
