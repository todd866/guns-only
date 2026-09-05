import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

test("published practice owns staging, real input, pause, restart and the local logbook", { timeout: 300_000 }, async () => {
  assert.ok(process.env.SMOKE_WWWROOT);
  const site = await serveStatic(process.env.SMOKE_WWWROOT);
  const browser = await chromium.launch({ headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await page.goto(`${site.url}?menu=1&audioQa=silent&server=off`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "READY", null, { timeout: 90_000 });
    for (const [exercise, title] of [["gunnery", "Controlled gun pass"], ["valley", "Clear the valley"], ["recovery", "Runway recovery"]]) {
      await page.locator("#ready-practice").click();
      await page.getByRole("button", { name: `Brief: ${title}`, exact: true }).click();
      await page.waitForFunction((id) => globalThis.__gunsState?.practice_exercise === id
        && globalThis.__gunsState?.practice_status === "ready", exercise);
      assert.equal(await page.locator("#ready-selector").isVisible(), false);
      await page.locator("#ready-start").click();
      await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "ACTIVE", null, { timeout: 90_000 });
      if (exercise === "gunnery") {
        await page.keyboard.down("f");
        try {
          await page.waitForFunction(() => globalThis.__gunsState?.sortie_rounds_fired > 0, null, { timeout: 30_000 });
        } finally { await page.keyboard.up("f"); }
      }
      // Success can stop a gun pass before Escape. Both paths must retain practice authority.
      if (await page.evaluate(() => globalThis.__gunsState?.session_phase === "ACTIVE")) await page.keyboard.press("Escape");
      await page.locator("#ready-restart").click();
      await page.waitForFunction((id) => globalThis.__gunsState?.practice_exercise === id
        && globalThis.__gunsState?.session_phase === "ACTIVE", exercise, { timeout: 90_000 });
      await page.keyboard.press("Escape");
      await page.locator("#ready-return").click();
      await page.waitForFunction(() => globalThis.__gunsState?.practice_exercise === "none"
        && globalThis.__gunsState?.session_phase === "READY");
    }
    await page.locator("#ready-logbook").click();
    const dialog = page.locator("dialog.pilot-notebook");
    await dialog.waitFor({ state: "visible" });
    assert.match(await dialog.innerText(), /Left before completion/);
    assert.match(await dialog.innerText(), /Controlled gun pass/);
    assert.match(await dialog.innerText(), /Runway recovery/);
    const frame = await page.evaluate(() => globalThis.__gunsState.tick);
    await page.keyboard.press("r"); await page.keyboard.press("f");
    assert.equal(await dialog.isVisible(), true, "gameplay shortcuts must not escape the notebook");
    assert.equal(await page.evaluate(() => globalThis.__gunsState.tick), frame);
    // Reflow the real dialog into a phone viewport. Both scroll and focus stay in the dialog.
    await page.setViewportSize({ width: 390, height: 844 });
    const geometry = await dialog.evaluate((node) => ({ scroll: node.scrollWidth, width: node.clientWidth,
      left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }));
    assert.ok(geometry.scroll <= geometry.width + 1);
    assert.ok(geometry.left >= 0 && geometry.right <= 391);
    const capture = process.env.SMOKE_ARTIFACT_DIR || process.env.MEDEVAC_QA_CAPTURE_DIR;
    if (capture) { await mkdir(capture, { recursive: true }); await page.screenshot({ path: path.join(capture, "pilot-logbook-phone.png") }); }
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); }
});
