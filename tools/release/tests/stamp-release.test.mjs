import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RELEASE_QUERY_TOKEN,
  applyPublishedReleaseQueries,
  materializeReleaseSource,
  releaseBuildFromIdentity,
  stampRelease,
  stampSource,
  verifyReleaseStamps,
} from "../stamp-release.mjs";

const FIXTURE_FILES = Object.freeze({
  "docs/STATUS.md": "Next candidate: Build 237, not deployed — example.\n",
  "web/smoke/node_modules/playwright/index.js": 'const thirdParty = "/asset.js?v=1";\n',
  "web/smoke/smoke.mjs": `const app = "/app.js?v=${RELEASE_QUERY_TOKEN}";\n`,
  "web/wwwroot/api/build-info.js": `const RELEASE_BUILD_PLACEHOLDER = "${RELEASE_QUERY_TOKEN}";\n`,
  "web/wwwroot/app.js": `import "./hud.js?v=${RELEASE_QUERY_TOKEN}";\n`,
  "web/wwwroot/index.html": [
    "Build 237 · historical comment that must not move",
    `<output id="ready-build" data-state="checking">Build ${RELEASE_QUERY_TOKEN} · verifying</output>`,
    `<script type="module">await import("./app.js?v=${RELEASE_QUERY_TOKEN}");</script>`,
    "",
  ].join("\n"),
  "web/wwwroot/render/audio/sample_bed.js":
    `import { RELEASE_BUILD as SAMPLE_BED_BUILD } from "../release/release_identity.js?v=${RELEASE_QUERY_TOKEN}";\n`,
  "web/wwwroot/render/release/release_identity.js": 'export const RELEASE_BUILD = "237";\n',
  "web/wwwroot/service-worker.js": `const RELEASE_BUILD = "${RELEASE_QUERY_TOKEN}";\n`,
});

async function releaseFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stamp-release-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [relative, source] of Object.entries(FIXTURE_FILES)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, source);
  }
  return root;
}

async function snapshotFixture(root) {
  return new Map(await Promise.all(Object.keys(FIXTURE_FILES).map(async (relative) => [
    relative,
    await fs.readFile(path.join(root, relative)),
  ])));
}

async function assertFixtureUnchanged(root, before) {
  for (const [relative, expected] of before) {
    assert.deepEqual(await fs.readFile(path.join(root, relative)), expected, relative);
  }
}

async function transactionArtifacts(root) {
  const artifacts = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.name.includes(".stamp-release-")) artifacts.push(absolute);
    }
  }
  await visit(root);
  return artifacts;
}

test("publish materialization rewrites the placeholder and leaves unrelated numbers alone", () => {
  const source = [
    "color: rgba(255, 237, 196, .94);",
    `import "./module.js?v=${RELEASE_QUERY_TOKEN}";`,
    "Build 237 · historical comment that must not move",
    `navigator.serviceWorker.register("service-worker.js?v=${RELEASE_QUERY_TOKEN}");`,
  ].join("\n");
  const published = materializeReleaseSource(source, 238);
  assert.match(published, /rgba\(255, 237, 196/);
  assert.match(published, /Build 237 · historical/);
  assert.doesNotMatch(published, new RegExp(RELEASE_QUERY_TOKEN));
  assert.equal([...published.matchAll(/\?v=238/g)].length, 2);
});

test("stamp advances only the identity constant and the status candidate line", () => {
  assert.equal(stampSource(
    "web/wwwroot/render/release/release_identity.js",
    'export const RELEASE_BUILD = "237";',
    237,
    238,
  ), 'export const RELEASE_BUILD = "238";');
  assert.equal(stampSource(
    "docs/STATUS.md",
    "Next candidate: Build 237, not deployed — example.\n",
    237,
    238,
  ), "Next candidate: Build 238, not deployed — example.\n");
  const app = `import "./hud.js?v=${RELEASE_QUERY_TOKEN}";\n`;
  assert.equal(stampSource("web/wwwroot/app.js", app, 237, 238), app);
});

test("releaseBuildFromIdentity rejects missing or nonnumeric identity", () => {
  assert.equal(releaseBuildFromIdentity('export const RELEASE_BUILD = "237";'), 237);
  assert.throws(() => releaseBuildFromIdentity('export const RELEASE_BUILD = "dev";'),
    /no numeric RELEASE_BUILD/);
});

test("a source file with a hard-coded numeric cache buster fails verification", async (t) => {
  const root = await releaseFixture(t);
  await fs.writeFile(path.join(root, "web/wwwroot/app.js"), 'import "./hud.js?v=237";\n');

  await assert.rejects(
    verifyReleaseStamps(root),
    /hard-coded release query/,
    "a query that matches the current build is still a second copy of the number",
  );
});

test("dry run validates the prospective graph without mutating or staging files", async (t) => {
  const root = await releaseFixture(t);
  const before = await snapshotFixture(root);

  const result = await stampRelease({ root, nextBuild: 238, dryRun: true });

  assert.equal(result.currentBuild, 237);
  assert.equal(result.nextBuild, 238);
  assert.deepEqual([...result.changed], [
    "docs/STATUS.md",
    "web/wwwroot/render/release/release_identity.js",
  ]);
  await assertFixtureUnchanged(root, before);
  assert.deepEqual(await transactionArtifacts(root), []);
});

test("successful transaction commits a coherent graph and removes rollback files", async (t) => {
  const root = await releaseFixture(t);
  const dependency = "web/smoke/node_modules/playwright/index.js";
  const dependencyBefore = await fs.readFile(path.join(root, dependency));
  const appBefore = await fs.readFile(path.join(root, "web/wwwroot/app.js"), "utf8");

  const result = await stampRelease({ root, nextBuild: 238 });

  assert.equal(result.currentBuild, 237);
  assert.equal(result.nextBuild, 238);
  assert.deepEqual([...result.changed], [
    "docs/STATUS.md",
    "web/wwwroot/render/release/release_identity.js",
  ]);
  assert.ok(!result.changed.includes(dependency), "installed dependencies are outside release truth");
  assert.deepEqual(await fs.readFile(path.join(root, dependency)), dependencyBefore);
  assert.equal(await fs.readFile(path.join(root, "web/wwwroot/app.js"), "utf8"), appBefore);
  assert.match(
    await fs.readFile(path.join(root, "web/wwwroot/index.html"), "utf8"),
    /Build 237 · historical comment that must not move/,
  );
  assert.equal((await verifyReleaseStamps(root)).releaseBuild, 238);
  assert.deepEqual(await transactionArtifacts(root), []);
});

test("publish applies the single build id and is safe to repeat", async (t) => {
  const root = await releaseFixture(t);
  const wwwroot = path.join(root, "web/wwwroot");

  const first = await applyPublishedReleaseQueries(wwwroot);
  const index = await fs.readFile(path.join(wwwroot, "index.html"), "utf8");
  const worker = await fs.readFile(path.join(wwwroot, "service-worker.js"), "utf8");
  const identity = await fs.readFile(
    path.join(wwwroot, "render/release/release_identity.js"),
    "utf8",
  );

  assert.equal(first.releaseBuild, 237);
  assert.ok(first.rewritten > 0);
  assert.match(index, /Build 237 · historical comment that must not move/);
  assert.match(index, /Build 237 · verifying/);
  assert.match(index, /\.\/app\.js\?v=237/);
  assert.doesNotMatch(index, new RegExp(RELEASE_QUERY_TOKEN));
  assert.match(worker, /const RELEASE_BUILD = "237";/);
  assert.equal(identity, 'export const RELEASE_BUILD = "237";\n');

  const second = await applyPublishedReleaseQueries(wwwroot);
  assert.equal(second.rewritten, 0);
  assert.equal(second.releaseBuild, 237);
});

test("preflight read failure leaves every source byte-identical and creates no temp files", async (t) => {
  const root = await releaseFixture(t);
  const before = await snapshotFixture(root);
  let reads = 0;
  const fileSystem = {
    ...fs,
    async readFile(...args) {
      reads += 1;
      if (reads === 3) {
        const error = new Error("injected preflight read failure");
        error.code = "EIO";
        throw error;
      }
      return fs.readFile(...args);
    },
  };

  await assert.rejects(
    stampRelease({ root, nextBuild: 238, fileSystem }),
    /injected preflight read failure/,
  );
  await assertFixtureUnchanged(root, before);
  assert.deepEqual(await transactionArtifacts(root), []);
});

test("prospective validation failure occurs before staging and preserves originals", async (t) => {
  const root = await releaseFixture(t);
  await fs.writeFile(path.join(root, "web/wwwroot/app.js"), 'import "./hud.js?v=236";\n');
  const before = await snapshotFixture(root);

  await assert.rejects(
    stampRelease({ root, nextBuild: 238 }),
    /hard-coded release query/,
  );
  await assertFixtureUnchanged(root, before);
  assert.deepEqual(await transactionArtifacts(root), []);
});

test("commit rename failure rolls back replaced sources and removes every temp file", async (t) => {
  const root = await releaseFixture(t);
  const before = await snapshotFixture(root);
  let replacementRenames = 0;
  let injected = false;
  const fileSystem = {
    ...fs,
    async rename(from, to) {
      if (!injected && from.endsWith(".next")) {
        replacementRenames += 1;
        if (replacementRenames === 2) {
          injected = true;
          const error = new Error("injected commit rename failure");
          error.code = "EIO";
          throw error;
        }
      }
      return fs.rename(from, to);
    },
  };

  await assert.rejects(
    stampRelease({ root, nextBuild: 238, fileSystem }),
    /injected commit rename failure/,
  );
  assert.equal(replacementRenames, 2, "failure must occur after one source was replaced");
  await assertFixtureUnchanged(root, before);
  assert.deepEqual(await transactionArtifacts(root), []);
});

test("post-commit verification failure rolls back every replacement", async (t) => {
  const root = await releaseFixture(t);
  const before = await snapshotFixture(root);
  let verificationReads = 0;
  const fileSystem = {
    ...fs,
    async readFile(...args) {
      if (args[1] === "utf8") {
        verificationReads += 1;
        if (verificationReads === 3) {
          const error = new Error("injected post-commit verification failure");
          error.code = "EIO";
          throw error;
        }
      }
      return fs.readFile(...args);
    },
  };

  await assert.rejects(
    stampRelease({ root, nextBuild: 238, fileSystem }),
    /injected post-commit verification failure/,
  );
  await assertFixtureUnchanged(root, before);
  assert.deepEqual(await transactionArtifacts(root), []);
});
