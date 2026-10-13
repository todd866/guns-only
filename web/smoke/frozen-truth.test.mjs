import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

const WWWROOT = process.env.SMOKE_WWWROOT;
const ROOT = join(import.meta.dirname, "../..");
const FROZEN = [
  ["/content/packs/korea-1950s/environment/terrain/central-front.truth", "content/packs/korea-1950s/environment/terrain/central-front.truth"],
  ["/content/packs/okanagan-fire/environment/okanagan-resorts.osm.json", "web/wwwroot/content/packs/okanagan-fire/environment/okanagan-resorts.osm.json"],
  ["/content/packs/okanagan-fire/environment/okanagan-central.cdem.json", "web/wwwroot/content/packs/okanagan-fire/environment/okanagan-central.cdem.json"],
  ["/content/packs/okanagan-fire/environment/okanagan-central.world.json", "web/wwwroot/content/packs/okanagan-fire/environment/okanagan-central.world.json"],
];
const UKRAINE = [
  "content/packs/ukraine-modern/environment/terrain-atlas/rapier-site.kernel.truth",
  "content/packs/ukraine-modern/environment/terrain-atlas/rapier-range.kernel.truth",
];

test("published frozen truth is deferred, exact, and fail-closed", { skip: !WWWROOT, timeout: 240_000 }, async () => {
  const originals = await Promise.all(FROZEN.map(([, source]) => readFile(join(ROOT, source))));
  const manifest = JSON.parse(await readFile(join(WWWROOT, "offline-manifest.json"), "utf8"));
  for (let i = 0; i < FROZEN.length; i++) {
    const [url] = FROZEN[i];
    const expected = {
      url,
      size: originals[i].byteLength,
      sha256: createHash("sha256").update(originals[i]).digest("hex"),
      core: false,
    };
    assert.deepEqual(manifest.assets.find(asset => asset.url === url), expected);
    assert.deepEqual(await readFile(join(WWWROOT, url)), originals[i]);
  }

  const [sim, web] = await Promise.all(["GunsOnly.Sim", "GunsOnly.Web"].map(name =>
    readFile(join(WWWROOT, `_framework/${name}.wasm`))));
  assert.ok(sim, "published GunsOnly.Sim.wasm is required");
  assert.ok(web, "published GunsOnly.Web.wasm is required");
  for (const bytes of originals) {
    assert.equal(sim.includes(bytes), false, "frozen truth must not be embedded in Sim WASM");
    assert.equal(web.includes(bytes), false, "frozen truth must not be embedded in Web WASM");
  }
  for (const source of UKRAINE) {
    const bytes = await readFile(join(ROOT, source));
    assert.equal(web.includes(bytes), true, `${source} must remain eager Web WASM truth`);
  }

  const site = await serveStatic(WWWROOT);
  let browser, context;
  try {
    browser = await chromium.launch({ headless: true, channel: "chromium" });
    context = await browser.newContext({ serviceWorkers: "block" });
    await context.route(`${site.url}__truth_qa__*`, route => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><base href="/"><script src="/_framework/blazor.webassembly.js" autostart="false"></script>`,
    }));
    const page = await context.newPage();
    await page.goto(`${site.url}__truth_qa__?audioQa=silent`, { waitUntil: "load" });
    await page.evaluate(async () => {
      await globalThis.Blazor.start();
      const runtime = await globalThis.getDotnetRuntime(0);
      const exports = await runtime.getAssemblyExports("GunsOnly.Web");
      globalThis.__truthBridge = exports.GunsOnly.Web.OkanaganWebBridge;
    });
    const invoke = (method, ...args) => page.evaluate(async ({ method, args }) => {
      try {
        return { ok: true, value: await globalThis.__truthBridge[method](...args) };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    }, { method, args });
    for (let sortie = 0; sortie < 7; sortie++) {
      assert.equal((await invoke("PreviewPlan", sortie)).ok, false, `PreviewPlan ${sortie} must require truth`);
      assert.equal((await invoke("Start", sortie)).ok, false, `Start ${sortie} must require truth`);
    }
    const corrupt = await invoke("LoadTruth", "{}", "{}", "{}");
    assert.equal(corrupt.ok, false, "corrupt truth must be rejected");

    await page.evaluate(async () => {
      const { loadOkanaganTruth } = await import("/render/okanagan/okanagan_truth.js");
      const truth = await loadOkanaganTruth();
      globalThis.__truthBridge.LoadTruth(...truth.texts);
    });
    for (let sortie = 0; sortie < 7; sortie++) {
      assert.equal((await invoke("PreviewPlan", sortie)).ok, true, `PreviewPlan ${sortie} must launch`);
      assert.equal((await invoke("Start", sortie)).ok, true, `Start ${sortie} must launch`);
      const advanced = await invoke("Advance", 0.1);
      assert.equal(advanced.ok, true);
      const state = await invoke("GetState");
      assert.equal(state.ok, true);
      assert.ok(JSON.parse(state.value).mission_s > 0, `sortie ${sortie} must advance`);
    }

    // Exercise the actual boot owner as well as exports: a network failure never publishes
    // its bridge/Ready state, while successful boot allows the normal Start control to fly.
    await context.close();
    context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/okanagan-central.cdem.json", route => route.fulfill({ status: 503, body: "unavailable" }));
    const failedPage = await context.newPage();
    await failedPage.goto(`${site.url}okanagan/?audioQa=silent`);
    await failedPage.waitForFunction(() => document.querySelector("#status")?.textContent.includes("truth unavailable (503)"));
    assert.equal(await failedPage.locator("#status").getAttribute("data-ready"), null);
    assert.equal(await failedPage.evaluate(() => globalThis.__gunsOnlyOkanagan.start()), false);
    await context.close();
    context = await browser.newContext({ serviceWorkers: "block" });
    const flightPage = await context.newPage();
    await flightPage.goto(`${site.url}okanagan/?audioQa=silent`);
    await flightPage.waitForSelector('#status[data-ready="true"]', { timeout: 120_000 });
    await flightPage.locator("#start").click();
    await flightPage.waitForFunction(() => globalThis.__gunsOnlyOkanagan?.getState()?.mission_s > 0.1);
  } finally {
    await context?.close();
    await browser?.close();
    await site.close();
  }
});
