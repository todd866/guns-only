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
    locationLike: { hostname: "guns-only.com" },
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

  const previewCandidate = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    running: { build: RELEASE_BUILD, revision: "candidate-sha", deployment: "dpl_candidate" },
    current: { build: nextBuild, revision: "production-sha", deployment: "dpl_production" },
    lookup: "complete",
    locationLike: { hostname: "guns-only-git-pivot-hardening.vercel.app" },
  });
  assert.equal(previewCandidate.stale, false,
    "an immutable preview which differs from production must remain flyable");
  assert.equal(previewCandidate.candidate, true);
  assert.equal(previewCandidate.state, "candidate");
  assert.match(previewCandidate.label, /PREVIEW CANDIDATE/);
  assert.match(previewCandidate.label, new RegExp(`PRODUCTION BUILD ${nextBuild}`));
  assert.equal(previewCandidate.telemetry.candidate, true);

  const brokenPreviewRuntime = createReleaseIdentity({
    entrypointBuild: RELEASE_BUILD,
    running: { build: "47", revision: "mixed-preview-runtime" },
    current: { build: RELEASE_BUILD, revision: "production-runtime" },
    lookup: "complete",
    locationLike: { hostname: "guns-only-git-pivot-hardening.vercel.app" },
  });
  assert.equal(brokenPreviewRuntime.stale, true,
    "preview leniency must not bless a mixed local shell/runtime");
  assert.equal(brokenPreviewRuntime.candidate, false);

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
  assert.equal(buildInfoUrl({ hostname: "guns-only.com" }), "/api/build-info");
  assert.equal(runningBuildInfoUrl({ hostname: "guns-only.com" }), "/api/build-info");
  assert.equal(buildInfoUrl({ hostname: "guns-only.cohort.md" }), "/api/build-info");
  assert.equal(runningBuildInfoUrl({ hostname: "guns-only.cohort.md" }), "/api/build-info");
  assert.equal(
    buildInfoUrl({ hostname: "guns-only.vercel.app" }),
    "https://guns-only.com/api/build-info",
    "the retired vercel.app alias compares against canonical production like any preview",
  );
  assert.equal(
    buildInfoUrl({ hostname: "guns-only-git-old.vercel.app" }),
    "https://guns-only.com/api/build-info",
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

test("local release scripts and GitHub verification require the same Node 24 runtime", async () => {
  assert.equal(process.versions.node.split(".")[0], "24",
    `release contracts must run on Node 24; found ${process.version}`);
  const [checkScript, deployScript, workflow] = await Promise.all([
    readFile(new URL("../../../../../bin/check", import.meta.url), "utf8"),
    readFile(new URL("../../../../../bin/deploy-web", import.meta.url), "utf8"),
    readFile(new URL("../../../../../.github/workflows/verify.yml", import.meta.url), "utf8"),
  ]);
  assert.match(checkScript, /node_major[\s\S]*?!= "24"/,
    "the complete local gate must reject a different Node major");
  assert.match(deployScript, /node_major[\s\S]*?!= "24"/,
    "deployment must reject a different Node major before verification or publishing");
  assert.equal((workflow.match(/node-version: "24"/g) ?? []).length, 2,
    "both deterministic and browser jobs must install Node 24");
});

test("shell, browser module, service worker, and deployment endpoint share one release number", async () => {
  const [index, app, hud, serviceWorker, deployScript, sceneBuilders, airframeBuilder,
    airframePrimitives] = await Promise.all([
    readFile(new URL("index.html", WEB_ROOT), "utf8"),
    readFile(new URL("app.js", WEB_ROOT), "utf8"),
    readFile(new URL("hud.js", WEB_ROOT), "utf8"),
    readFile(new URL("service-worker.js", WEB_ROOT), "utf8"),
    readFile(new URL("../../../../../bin/deploy-web", import.meta.url), "utf8"),
    readFile(new URL("render/scene/scene_builders.js", WEB_ROOT), "utf8"),
    readFile(new URL("render/scene/airframe_from_definition.js", WEB_ROOT), "utf8"),
    readFile(new URL("render/scene/airframe_primitives.js", WEB_ROOT), "utf8"),
  ]);
  const entrypoint = index.match(/await import\("\.\/app\.js\?v=([^"]+)"\)/);
  const blazorLoader = index.match(
    /loadClassicScript\("\.\/_framework\/blazor\.webassembly\.js\?v=([^"]+)"/,
  );
  const worker = serviceWorker.match(/const RELEASE_BUILD = "([^"]+)"/);
  assert.ok(entrypoint, "index must cache-bust the application entrypoint");
  assert.ok(blazorLoader, "index must cache-bust the Blazor loader");
  assert.ok(worker, "service worker must carry the release cache stamp");
  assert.equal(entrypoint[1], RELEASE_BUILD, "index and canonical release must advance together");
  assert.equal(blazorLoader[1], RELEASE_BUILD,
    "the Blazor loader and canonical release must advance together");
  assert.equal(worker[1], RELEASE_BUILD,
    "service-worker cache and canonical release must advance together");
  assert.equal(buildInfo.RELEASE_BUILD, RELEASE_BUILD, "endpoint and canonical release must match");
  assert.match(deployScript,
    /verify_korea_atlas\.py" "\$atlas_manifest"/,
    "deployments must verify the gitignored terrain atlas before publishing");
  assert.match(deployScript,
    /rsync[\s\S]*?verify_korea_atlas\.py" "\$staged_atlas_manifest"/,
    "deployments must verify the exact staged atlas bytes after copying");
  assert.doesNotMatch(deployScript, /Ukraine atlas pages missing; Rapier theatre may render empty/,
    "a missing deployment atlas must be fatal, not a warning");
  for (const path of [
    "./hud.js",
    "./render/audio/flight_audio.js",
    "./render/debrief/sortie_result.js",
    "./render/hud/limits_panel.js",
    "./render/release/release_identity.js",
    "./render/scene/scene_builders.js",
    "./render/settings/player_settings.js",
    "./render/telemetry/ai_frame_pressure.js",
    "./render/telemetry/telemetry_batch.js",
  ]) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      app,
      new RegExp(`from "${escapedPath}\\?v=${RELEASE_BUILD}"`),
      `${path} must bypass the previous release worker's cache on the first upgraded load`,
    );
    assert.doesNotMatch(app, new RegExp(`from "${escapedPath}"`),
      `${path} must not retain an unversioned direct import`);
  }
  assert.match(
    hud,
    new RegExp(`from "\\./render/audio/flight_audio\\.js\\?v=${RELEASE_BUILD}"`),
    "the HUD gesture path and render loop must import the same flight-audio module identity",
  );
  assert.doesNotMatch(
    hud,
    /from "\.\/render\/audio\/flight_audio\.js";/,
    "the HUD must not reintroduce an unversioned second flight-audio controller",
  );
  assert.match(sceneBuilders,
    new RegExp(`from "\\./airframe_from_definition\\.js\\?v=${RELEASE_BUILD}"`),
    "the versioned scene graph must not re-enter an older cached airframe builder");
  assert.match(sceneBuilders,
    new RegExp(`from "\\./airframe_primitives\\.js\\?v=${RELEASE_BUILD}"`),
    "scene builders must share the versioned airframe primitive module");
  assert.match(airframeBuilder,
    new RegExp(`from "\\./airframe_primitives\\.js\\?v=${RELEASE_BUILD}"`),
    "the airframe builder must depend on one-way shared primitives");
  assert.doesNotMatch(airframeBuilder, /from "\.\/scene_builders\.js/,
    "airframe construction must not recreate the former ESM circular dependency");
  assert.match(airframePrimitives, /export function createPlanformGeometry/);
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
  assert.match(app,
    /!runningBuildInfo[\s\S]*?runningUrl === currentUrl[\s\S]*?runningBuildInfo = current/,
    "a preview must never borrow canonical production metadata as its running provenance");
  assert.match(app, /event\.persisted\) void resolveBuildIdentity\(\{ force: true \}\)/);
  assert.match(app, /!document\.hidden\) void resolveBuildIdentity\(\)/);
  assert.match(app, /window\.addEventListener\("focus", \(\) => void resolveBuildIdentity\(\)\)/);
  assert.doesNotMatch(app, /setInterval\([^)]*resolveBuildIdentity/);
  assert.match(app, /async function reloadCurrentBuild\(\)/,
    "reload must be async so it can drop the service-worker cache before navigating");
  assert.match(app, /serviceWorker\.getRegistrations/,
    "reload must unregister service workers or the same ?v= build stays pinned in Cache Storage");
  assert.match(app, /caches\.keys\(\)/);
  assert.match(app, /caches\.delete/,
    "reload must delete guns-only-* caches before navigating to the current release");
  assert.match(app,
    /new URLSearchParams\(window\.location\.search\)\.get\("audioQa"\) === "silent"[\s\S]*?destination\.searchParams\.set\("audioQa", "silent"\)/,
    "stale-build reload must preserve the explicit shared-machine silent audio clamp");
  assert.match(index, /id="ready-build"/);
  assert.match(
    index,
    new RegExp(
      `id="ready-build"[^>]*>Build ${RELEASE_BUILD} · verifying<\\/output>`,
    ),
    "the static verification placeholder must match the canonical release stamp",
  );
  assert.match(index, /id="ready-build-reload"/);

  const prebootGate = index.indexOf("globalThis.__gunsPrebootReady = (async () =>");
  const prebootAwait = index.indexOf("await globalThis.__gunsPrebootReady;");
  const appEntrypoint = index.indexOf(`./app.js?v=${RELEASE_BUILD}`);
  const blazorEntrypoint = index.indexOf(
    `./_framework/blazor.webassembly.js?v=${RELEASE_BUILD}`,
  );
  assert.ok(prebootGate >= 0, "index must establish the upgrade gate");
  assert.ok(prebootGate < prebootAwait
    && prebootAwait < appEntrypoint
    && prebootAwait < blazorEntrypoint,
  "the upgrade gate must settle before either runtime graph can be fetched");
  assert.doesNotMatch(index,
    /<script[^>]+(?:src="\.\/app\.js|src="\.\/_framework\/blazor\.webassembly\.js)/,
    "static runtime tags can race ESM linking against an older controlling worker");
  assert.match(index,
    new RegExp(`const releaseBuild = new URL\\("\\.\/service-worker\\.js\\?v=${RELEASE_BUILD}"`),
    "the preboot comparison must derive from an automatically stamped release URL");
  assert.match(index,
    /navigator\.serviceWorker\?\.controller[\s\S]*?\[controller, \.\.\.registeredWorkers\][\s\S]*?worker\.scriptURL[\s\S]*?searchParams\.get\("v"\)/,
    "the gate must distinguish every current or pending worker by its release query");
  assert.match(index,
    /registration\.active,[\s\S]*?registration\.waiting,[\s\S]*?registration\.installing,[\s\S]*?staleWorker/,
    "the gate must catch a stale registration before it becomes the controlling worker");
  assert.match(index,
    /serviceWorker\?\.getRegistrations\?\.\(\)[\s\S]*?registration\.unregister\(\)/,
    "an older controller must be unregistered before runtime startup");
  assert.match(index,
    /caches\.keys\(\)[\s\S]*?key\.startsWith\("guns-only-"\)[\s\S]*?caches\.delete\(key\)/,
    "an older controller's cache must be removed before unversioned WASM requests");
  assert.match(app,
    /async function boot\(\) \{[\s\S]*?await \(globalThis\.__gunsPrebootReady \?\? Promise\.resolve\(\)\);[\s\S]*?await blazor\.start\(\);/,
    "Blazor startup must await the index upgrade gate");
  assert.match(app,
    new RegExp(`serviceWorker\\.register\\("service-worker\\.js\\?v=${RELEASE_BUILD}"\\)`),
    "the installed worker URL must carry the release query inspected by the next upgrade");
});

test("every published sub-application shares the release-qualified service worker", async () => {
  const [indoorIndex, indoorApp, medevacIndex, medevacApp] = await Promise.all([
    readFile(new URL("../../../indoor/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../../indoor/game.js", import.meta.url), "utf8"),
    readFile(new URL("../../../medevac/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../../medevac/app.js", import.meta.url), "utf8"),
  ]);
  for (const [label, source] of [
    ["indoor HTML", indoorIndex],
    ["indoor app", indoorApp],
    ["medevac HTML", medevacIndex],
    ["medevac app", medevacApp],
  ]) {
    assert.match(source,
      new RegExp(`(?:release_identity\\.js|(?:game|app)\\.js)\\?v=${RELEASE_BUILD}`),
      `${label} must load its release-qualified entrypoint or identity module`);
  }
  assert.match(indoorApp,
    /serviceWorker\.register\(`\.\.\/service-worker\.js\?v=\$\{RELEASE_BUILD\}`\)/);
  assert.match(medevacApp,
    /serviceWorker\.register\(`\.\.\/service-worker\.js\?v=\$\{RELEASE_BUILD\}`\)/);
  assert.doesNotMatch(`${indoorApp}\n${medevacApp}`,
    /serviceWorker\.register\("\.\.\/service-worker\.js"\)/,
    "a sub-app must never replace the release-qualified worker with an unversioned registration");
  for (const [label, source, entrypoint] of [
    ["indoor", indoorIndex, `./game.js?v=${RELEASE_BUILD}`],
    ["medevac", medevacIndex, `/medevac/app.js?v=${RELEASE_BUILD}`],
  ]) {
    const gate = source.indexOf("globalThis.__gunsPrebootReady = (async () =>");
    const settled = source.indexOf("await globalThis.__gunsPrebootReady;");
    const releaseGate = source.indexOf(
      `../render/release/quarantine_gate.js?v=${RELEASE_BUILD}`,
    );
    const appEntry = source.indexOf(entrypoint);
    assert.ok(gate >= 0 && gate < settled && settled < releaseGate && releaseGate < appEntry,
      `${label} must purge an older worker/cache before linking any release module`);
    assert.match(source,
      /serviceWorker\?\.getRegistrations\?\.\(\)[\s\S]*?registration\.unregister\(\)[\s\S]*?caches\.delete\(key\)/,
      `${label} must remove both the older controller registration and its runtime cache`);
    assert.match(source,
      /registration\.active,[\s\S]*?registration\.waiting,[\s\S]*?registration\.installing,[\s\S]*?staleWorker/,
      `${label} must inspect stale registrations even before they control a page`);
    assert.match(source,
      new RegExp(`const releaseBuild = new URL\\("\\.\\.\/service-worker\\.js\\?v=${RELEASE_BUILD}"`),
      `${label} must derive its controller comparison from the stamped release URL`);
    assert.doesNotMatch(source,
      /import \{ renderExperienceGate \} from/,
      `${label} cannot use a static import before its preboot await`);
  }
  assert.match(medevacIndex,
    new RegExp(`script\\.src = "/_framework/blazor\\.webassembly\\.js\\?v=${RELEASE_BUILD}"`),
    "Medevac must fetch its Blazor loader only after the worker handoff");
  assert.doesNotMatch(medevacIndex,
    /<script[^>]+src="\/_framework\/blazor\.webassembly\.js/,
    "Medevac must not leave a parser-fetched Blazor loader racing preboot");
  for (const [label, source, fatalCopy] of [
    ["main", await readFile(new URL("../../../index.html", import.meta.url), "utf8"),
      "#fatal-message"],
    ["indoor", indoorIndex, "#fatal-copy"],
    ["medevac", medevacIndex, "#fatal-copy"],
  ]) {
    assert.match(source,
      new RegExp(`catch \\(error\\)[\\s\\S]*?querySelector\\("${fatalCopy}"\\)[\\s\\S]*?classList\\.add\\("visible"\\)`),
      `${label} bootstrap failures must reveal the existing fatal surface`);
  }
});

test("environment lab immutable module keys use the numeric release identity", async () => {
  const [environmentIndex, environmentApp] = await Promise.all([
    readFile(new URL("../../../environment-lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../../environment-lab/main.js", import.meta.url), "utf8"),
  ]);
  assert.match(environmentIndex,
    new RegExp(`\\./main\\.js\\?v=${RELEASE_BUILD}`));
  assert.match(environmentApp,
    new RegExp(`tactical_clouds\\.js\\?v=${RELEASE_BUILD}`));
  assert.doesNotMatch(`${environmentIndex}\n${environmentApp}`, /\?v=[A-Za-z]/,
    "semantic v= keys become falsely immutable in the service worker cache");
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
