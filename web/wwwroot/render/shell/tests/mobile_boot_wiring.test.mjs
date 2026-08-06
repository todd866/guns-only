import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [appSource, indexSource, workerSource, shellHealthSource] = await Promise.all([
  readFile(new URL("../../../app.js", import.meta.url), "utf8"),
  readFile(new URL("../../../index.html", import.meta.url), "utf8"),
  readFile(new URL("../../../service-worker.js", import.meta.url), "utf8"),
  readFile(new URL("../../telemetry/shell_health.js", import.meta.url), "utf8"),
]);

test("the inline boot scripts parse", () => {
  // A syntax error in the index bootstrap is silent in every unit test and catastrophic in the
  // browser: the module never links, so app.js never runs and the page sits on the painted sky
  // for ever -- the exact `script_load and nothing else` shape this branch exists to eliminate.
  // (This guard was written because that is precisely what happened while writing it.)
  const directory = mkdtempSync(join(tmpdir(), "guns-boot-scripts-"));
  const blocks = [...indexSource.matchAll(
    /<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g,
  )].filter((match) => !/\ssrc=/.test(match.groups.attrs));
  assert.ok(blocks.length >= 2, "expected the preboot gate and the module bootstrap");
  for (const [index, block] of blocks.entries()) {
    const isModule = /type="module"/.test(block.groups.attrs);
    const file = join(directory, `block-${index}.${isModule ? "mjs" : "cjs"}`);
    writeFileSync(file, block.groups.body);
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0,
      `inline <script${block.groups.attrs}> does not parse:\n${result.stderr}`);
  }
});

test("the shell fallback markup exists in the document the boot can still reach", () => {
  // It has to be static markup: the case it must cover includes "the module graph did not load".
  for (const id of [
    "shell-fallback", "shell-fallback-title", "shell-fallback-body", "shell-fallback-steps",
    "shell-fallback-open", "shell-fallback-url", "shell-fallback-reload", "shell-fallback-copy",
    "shell-fallback-detail",
  ]) {
    assert.match(indexSource, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(indexSource, /#shell-fallback\.visible/, "the overlay needs a reveal rule");
  assert.match(indexSource, /#shell-fallback-copy/,
    "the copy control must be wired without the module graph");
});

test("every dead end routes to the fallback screen", () => {
  assert.match(appSource, /function showBootFallback\(/);
  assert.match(appSource,
    /if \(reason === "webgl" \|\| embeddedBrowser\.embedded\) \{[\s\S]{0,200}showBootFallback\(/,
    "a refused WebGL context, and anything at all inside a webview, must get the human screen");
  assert.match(appSource, /showBootFallback\("stalled"\)/,
    "the watchdog stall verdict must surface the fallback");
  assert.match(indexSource, /reason: "module"[\s\S]{0,120}mountBootFallback|mountBootFallback\(document, bootFallbackModel\(\{[\s\S]{0,120}reason: "module"/,
    "a module-graph failure in the inline bootstrap must not fall through to a blank page");
});

test("the boot watchdog runs on a timer, not requestAnimationFrame", () => {
  // rAF is suspended in exactly the throttled webviews the watchdog exists to catch.
  assert.match(appSource, /setInterval\(\(\) => \{\s*const snapshot = bootWatchdog\.tick\(\)/);
  assert.match(appSource,
    /function waitForGlobal\([\s\S]{0,400}setTimeout\(poll, \d+\)/,
    "the runtime wait must be able to reach its own timeout in a background webview");
  assert.doesNotMatch(appSource,
    /function waitForGlobal\([\s\S]{0,400}requestAnimationFrame\(poll\)/);
});

test("slow and stuck are distinguished and separately measured", () => {
  assert.match(appSource, /shellHealth\.note\("boot_slow"/);
  assert.match(appSource, /shellHealth\.note\("boot_stalled"/);
  assert.match(appSource, /shellHealth\.note\("fallback_shown"/);
  assert.match(appSource, /shellHealth\.note\("fallback_escape"/);
  assert.match(appSource, /bootScreen\.dataset\.progress = "slow"/,
    "a slow boot gets a visible status line rather than an escape hatch");
  assert.match(indexSource, /#boot\[data-progress="slow"\] #boot-status/,
    "the sr-only status must become visible when the boot is slow");
  assert.match(shellHealthSource, /note\(code, fields = \{\}, \{ immediate = false \} = \{\}\)/);
});

test("in-app detection is shared by the fallback UI and the telemetry header", () => {
  assert.match(shellHealthSource, /from "\.\.\/shell\/inapp_browser\.js"/,
    "one detector: telemetry and the on-screen message must not disagree");
  assert.match(shellHealthSource, /in_app: embedded\.embedded/);
  assert.match(shellHealthSource, /in_app_signal: embedded\.confidence/);
  assert.match(appSource, /detectEmbeddedBrowser\(\{\s*userAgent: navigator\.userAgent/);
});

test("a superseded release cannot keep serving itself", () => {
  assert.match(workerSource, /async function reclaimStaleClients\(/);
  assert.match(workerSource, /guns-release-activated/);
  assert.match(workerSource, /client\.navigate\(client\.url\)/,
    "a document too old to answer the handshake must be re-navigated by the new worker");
  assert.match(workerSource, /if \(replacedBuild\) await reclaimStaleClients\(\)/,
    "a first install must never reload anybody");
  assert.match(indexSource, /guns-release-ack/,
    "the reply must live in a classic inline script so a stalled module graph still counts alive");
  assert.match(appSource, /registration\.update\(\)/,
    "a long-lived tab must re-check for a new release without needing a navigation");
});
