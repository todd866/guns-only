import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildInfoUrl,
  createReleaseIdentity,
  RELEASE_BUILD,
  runningBuildInfoUrl,
} from "../release_identity.js";

const require = createRequire(import.meta.url);
const buildInfo = require("../../../api/build-info.js");
const WEB_ROOT = new URL("../../../", import.meta.url);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

function git(args) {
  return spawnSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
}

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    statusCode: 0,
    body: undefined,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    end(body) { this.body = body; },
  };
}

test("release identity detects mixed shell and superseded production builds", () => {
  const nextBuild = String(Number(RELEASE_BUILD) + 1);
  const current = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    running: { build: RELEASE_BUILD, revision: "abcdef1234567890", deployment: "dpl_current" },
    current: { build: RELEASE_BUILD, revision: "abcdef1234567890", deployment: "dpl_current" },
    lookup: "complete",
  });
  assert.equal(current.stale, false);
  assert.equal(current.state, "current");
  assert.equal(current.telemetryBuild,
    `${RELEASE_BUILD}+rev.abcdef1234567890.dep.dpl_current`);
  assert.match(current.label,
    new RegExp(`BUILD ${RELEASE_BUILD} · REV abcdef12 · DEP dpl_current`));

  const mixed = createReleaseIdentity({
    entrypointBuild: "47",
    current: { build: RELEASE_BUILD },
    lookup: "complete",
  });
  assert.equal(mixed.stale, true);
  assert.equal(
    mixed.label,
    `UPDATE AVAILABLE · RUNNING BUILD 47 · CURRENT BUILD ${RELEASE_BUILD}`,
  );

  const superseded = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    current: { build: nextBuild },
    lookup: "complete",
  });
  assert.equal(superseded.stale, true);
  assert.match(superseded.label, new RegExp(`CURRENT BUILD ${nextBuild}`));

  const redeployed = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    running: { build: RELEASE_BUILD, revision: "aaaaaaaa11111111" },
    current: { build: RELEASE_BUILD, revision: "bbbbbbbb22222222" },
    lookup: "complete",
  });
  assert.equal(redeployed.stale, true);
  assert.match(redeployed.label,
    new RegExp(`RUNNING BUILD ${RELEASE_BUILD} · REV aaaaaaaa`));
  assert.match(redeployed.label,
    new RegExp(`CURRENT BUILD ${RELEASE_BUILD} · REV bbbbbbbb`));

  const sameRevisionNewDeployment = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    running: { build: RELEASE_BUILD, revision: "same-sha", deployment: "dpl_old" },
    current: { build: RELEASE_BUILD, revision: "same-sha", deployment: "dpl_new" },
    lookup: "complete",
  });
  assert.equal(sameRevisionNewDeployment.stale, true,
    "a deployment change remains meaningful even when Git revision is unchanged");
  assert.match(sameRevisionNewDeployment.telemetryBuild, /rev\.same-sha\.dep\.dpl_old/);

  const mixedRuntimeTuple = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    running: { build: "47", revision: "old-runtime" },
    current: { build: RELEASE_BUILD, revision: "current-runtime" },
    lookup: "complete",
  });
  assert.equal(mixedRuntimeTuple.stale, true,
    "a mixed cached runtime cannot be cleared merely because entrypoint and canonical agree");
  assert.match(mixedRuntimeTuple.label, /RUNNING BUILD 47/);

  const unverified = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    lookup: "unverified",
  });
  assert.equal(unverified.stale, false);
  assert.equal(unverified.state, "unverified");
  assert.match(unverified.label, /UNVERIFIED/);
});

test("build lookup uses canonical production from Vercel deployments but stays offline locally", () => {
  assert.equal(buildInfoUrl({ hostname: "guns-only.vercel.app" }), "/api/build-info");
  assert.equal(runningBuildInfoUrl({ hostname: "guns-only.vercel.app" }), "/api/build-info");
  assert.equal(
    buildInfoUrl({ hostname: "guns-only-git-old.vercel.app" }),
    "https://guns-only.vercel.app/api/build-info",
  );
  assert.equal(
    runningBuildInfoUrl({ hostname: "guns-only-git-old.vercel.app" }),
    "/api/build-info",
    "a direct deployment must establish its own provenance before canonical comparison",
  );
  assert.equal(buildInfoUrl({ hostname: "127.0.0.1" }), null);
  assert.equal(runningBuildInfoUrl({ hostname: "127.0.0.1" }), null);
  assert.equal(buildInfoUrl({ hostname: "localhost" }), null);
});

test("shell, browser module, and deployment endpoint share one release number", async () => {
  const [index, app] = await Promise.all([
    readFile(new URL("index.html", WEB_ROOT), "utf8"),
    readFile(new URL("app.js", WEB_ROOT), "utf8"),
  ]);
  const entrypoint = index.match(/<script type="module" src="\.\/app\.js\?v=([^"]+)"/);
  assert.ok(entrypoint, "index must cache-bust the application entrypoint");
  assert.equal(entrypoint[1], RELEASE_BUILD, "index and canonical release must advance together");
  assert.equal(buildInfo.RELEASE_BUILD, RELEASE_BUILD, "endpoint and canonical release must match");
  assert.match(app, /from "\.\/render\/release\/release_identity\.js"/);
  assert.doesNotMatch(app, /const BUILD = new URL\(import\.meta\.url\)/);
  assert.match(app, /BUILD_IDENTITY_REVALIDATE_MS = 60_000/);
  assert.match(app, /function buildIdentityBlocksSortie\(\)[\s\S]*?buildIdentity\.stale \|\| buildIdentity\.state === "checking"/,
    "a sortie must remain held while current production provenance is unresolved");
  assert.match(app, /readyStart\.disabled = buildIdentityBlocksSortie\(\)/);
  assert.match(app, /function beginFlight\(\)[\s\S]*?if \(buildIdentityBlocksSortie\(\)/);
  assert.match(app, /buildIdentityLookupSucceeded\s*\?\s*"complete"[\s\S]*?"unverified"/,
    "a failed first lookup must not report the build as verified current");
  assert.match(app,
    /runningBuildInfo = await fetchBuildInfo\(runningUrl, controller\.signal\)[\s\S]*?const current = await fetchBuildInfo\(currentUrl, controller\.signal\)/,
    "direct deployments must read running provenance before canonical current provenance");
  assert.match(app, /event\.persisted\) void resolveBuildIdentity\(\{ force: true \}\)/);
  assert.match(app, /!document\.hidden\) void resolveBuildIdentity\(\)/);
  assert.match(app, /window\.addEventListener\("focus", \(\) => void resolveBuildIdentity\(\)\)/);
  assert.doesNotMatch(app, /setInterval\([^)]*resolveBuildIdentity/);
  assert.match(index, /id="ready-build"/);
  assert.match(index, /id="ready-build-reload"/);
});

test("a committed production runtime change cannot silently reuse this build", (context) => {
  const repository = git(["rev-parse", "--show-toplevel"]);
  if (repository.status !== 0) {
    context.skip("release-history guard requires a Git checkout");
    return;
  }

  // During release preparation the bump may still be unstaged or staged. Require every dirty
  // production runtime change to advance index.html in the same worktree; otherwise a normal
  // pre-commit run could bless another same-number deployment before history exists to catch it.
  const dirtyStatus = git([
    "status", "--porcelain=v1", "--untracked-files=all", "--", "web/wwwroot",
  ]).stdout.trimEnd();
  const dirtyRuntimePaths = dirtyStatus.split("\n").filter(Boolean).map((line) => {
    const path = line.slice(3);
    return path.includes(" -> ") ? path.split(" -> ").at(-1) : path;
  }).filter((path) => path.startsWith("web/wwwroot/")
    && !path.includes("/tests/")
    && !/\.test\.(?:js|mjs)$/.test(path));
  const dirtyIndex = dirtyRuntimePaths.includes("web/wwwroot/index.html");
  const dirtyWithoutIndex = dirtyRuntimePaths.filter((path) => path !== "web/wwwroot/index.html");
  assert.ok(dirtyIndex || dirtyWithoutIndex.length === 0,
    `production runtime changed without advancing index.html: ${dirtyWithoutIndex.join(", ")}`);

  // Once committed, the introduction commit becomes the boundary: every later production-file
  // change must introduce a new build query, or this test fails in CI.
  const unstaged = git(["diff", "--quiet", "--", "web/wwwroot/index.html"]);
  const staged = git(["diff", "--cached", "--quiet", "--", "web/wwwroot/index.html"]);
  if (unstaged.status === 1 || staged.status === 1) return;

  const introduced = git([
    "log", "-1", "--format=%H", `-Sapp.js?v=${RELEASE_BUILD}`,
    "--", "web/wwwroot/index.html",
  ]).stdout.trim();
  assert.ok(introduced, `Build ${RELEASE_BUILD} must have an introduction commit`);
  const laterRuntimeChanges = git([
    "log", "--format=%H", `${introduced}..HEAD`, "--", "web/wwwroot",
    ":(exclude)web/wwwroot/render/**/tests/**",
    ":(exclude)web/wwwroot/api/*.test.js",
  ]).stdout.trim();
  assert.equal(
    laterRuntimeChanges,
    "",
    `Build ${RELEASE_BUILD} was reused after production files changed; advance RELEASE_BUILD and app.js?v together`,
  );
});

test("build-info is bounded, uncached, public metadata", () => {
  const previousRevision = process.env.VERCEL_GIT_COMMIT_SHA;
  const previousDeployment = process.env.VERCEL_DEPLOYMENT_ID;
  process.env.VERCEL_GIT_COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_release_identity_test";
  try {
    const response = responseRecorder();
    buildInfo({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(JSON.parse(response.body), {
      build: RELEASE_BUILD,
      revision: "0123456789abcdef0123456789abcdef01234567",
      deployment: "dpl_release_identity_test",
    });

    const rejected = responseRecorder();
    buildInfo({ method: "POST" }, rejected);
    assert.equal(rejected.statusCode, 405);
    assert.equal(rejected.headers.get("allow"), "GET");
  } finally {
    if (previousRevision === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previousRevision;
    if (previousDeployment === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = previousDeployment;
  }
});
