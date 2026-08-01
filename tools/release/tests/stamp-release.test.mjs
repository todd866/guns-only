import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  releaseBuildFromIdentity,
  stampRelease,
  stampSource,
  verifyReleaseStamps,
} from "../stamp-release.mjs";

const FIXTURE_FILES = Object.freeze({
  "web/smoke/node_modules/playwright/index.js": 'const thirdParty = "/asset.js?v=1";\n',
  "web/smoke/smoke.mjs": 'const app = "/app.js?v=237";\n',
  "web/wwwroot/api/build-info.js": 'const RELEASE_BUILD = "237";\n',
  "web/wwwroot/app.js": 'import "./hud.js?v=237";\n',
  "web/wwwroot/index.html": [
    "Build 237 · verifying",
    'const releaseBuild = "237";',
    '<script src="./app.js?v=237"></script>',
    "",
  ].join("\n"),
  "web/wwwroot/render/release/release_identity.js": 'export const RELEASE_BUILD = "237";\n',
  "web/wwwroot/service-worker.js": [
    'const RELEASE_BUILD = "237";',
    'const APP = "./app.js?v=237";',
    "",
  ].join("\n"),
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

test("stampSource advances cache queries without rewriting unrelated numbers", () => {
  const source = [
    "color: rgba(255, 237, 196, .94);",
    'import "./module.js?v=237";',
    'navigator.serviceWorker.register("service-worker.js?v=169");',
  ].join("\n");
  const stamped = stampSource("web/wwwroot/app.js", source, 237, 238);
  assert.match(stamped, /rgba\(255, 237, 196/);
  assert.doesNotMatch(stamped, /\?v=237/);
  assert.equal([...stamped.matchAll(/\?v=238/g)].length, 2);
});

test("canonical constants and visible shell identity advance together", () => {
  assert.equal(stampSource(
    "web/wwwroot/render/release/release_identity.js",
    'export const RELEASE_BUILD = "237";',
    237,
    238,
  ), 'export const RELEASE_BUILD = "238";');
  const index = stampSource("web/wwwroot/index.html", [
    "Build 237 · verifying",
    "A network-fresh Build 237 document",
    'const releaseBuild = "237";',
    '<script src="./app.js?v=237"></script>',
  ].join("\n"), 237, 238);
  assert.doesNotMatch(index, /Build 237|\?v=237|releaseBuild = "237"/);
  assert.match(index, /Build 238 · verifying/);
  assert.match(index, /releaseBuild = "238"/);

  const standalone = stampSource(
    "web/wwwroot/indoor/index.html",
    'const releaseBuild = new URL("../service-worker.js?v=237", location.href)',
    237,
    238,
  );
  assert.match(standalone, /service-worker\.js\?v=238/,
    "standalone preboot controller comparisons must advance with stamped URLs");
});

test("releaseBuildFromIdentity rejects missing or nonnumeric identity", () => {
  assert.equal(releaseBuildFromIdentity('export const RELEASE_BUILD = "237";'), 237);
  assert.throws(() => releaseBuildFromIdentity('export const RELEASE_BUILD = "dev";'),
    /no numeric RELEASE_BUILD/);
});

test("dry run validates the prospective graph without mutating or staging files", async (t) => {
  const root = await releaseFixture(t);
  const before = await snapshotFixture(root);

  const result = await stampRelease({ root, nextBuild: 238, dryRun: true });

  assert.equal(result.currentBuild, 237);
  assert.equal(result.nextBuild, 238);
  assert.ok(result.changed.length > 0);
  await assertFixtureUnchanged(root, before);
  assert.deepEqual(await transactionArtifacts(root), []);
});

test("successful transaction commits a coherent graph and removes rollback files", async (t) => {
  const root = await releaseFixture(t);
  const dependency = "web/smoke/node_modules/playwright/index.js";
  const dependencyBefore = await fs.readFile(path.join(root, dependency));

  const result = await stampRelease({ root, nextBuild: 238 });

  assert.equal(result.currentBuild, 237);
  assert.equal(result.nextBuild, 238);
  assert.ok(!result.changed.includes(dependency), "installed dependencies are outside release truth");
  assert.deepEqual(await fs.readFile(path.join(root, dependency)), dependencyBefore);
  assert.equal((await verifyReleaseStamps(root)).releaseBuild, 238);
  assert.deepEqual(await transactionArtifacts(root), []);
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
  const buildInfo = path.join(root, "web/wwwroot/api/build-info.js");
  await fs.writeFile(buildInfo, 'const RELEASE_BUILD = "236";\n');
  const before = await snapshotFixture(root);

  await assert.rejects(
    stampRelease({ root, nextBuild: 238 }),
    /build-info\.js does not match release Build 238/,
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
