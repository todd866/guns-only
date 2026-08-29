import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

const WWWROOT = process.env.SMOKE_WWWROOT;
const PLAYER_SETTINGS_KEY = "guns-only.player-settings.v1";

test("production standalones inherit saved mute and retain silent QA on catalogue exits", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");
  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const context = await browser.newContext();
    await context.addInitScript((storageKey) => {
      localStorage.setItem(storageKey, JSON.stringify({ audio: false }));
    }, PLAYER_SETTINGS_KEY);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));

    await page.goto(`${site.url}?menu=1&server=off&audioQa=silent&throwaway=1`, {
      waitUntil: "load",
      timeout: 150_000,
    });
    await page.waitForFunction(() =>
      document.querySelector("#boot")?.classList.contains("ready") === true,
    undefined, { timeout: 150_000 });
    await page.locator('[data-program-node="cobra-lab"]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-program-node="cobra-lab"]')
        ?.getAttribute("aria-pressed") === "true"
        && document.querySelector("#ready-start")?.disabled === false,
    undefined, { timeout: 30_000 });
    await page.locator("#ready-start").click();
    await page.waitForURL((url) => url.pathname === "/cobra-lab/", { timeout: 60_000 });
    const launched = new URL(page.url());
    assert.equal(launched.searchParams.get("audioQa"), "silent");
    assert.deepEqual([...launched.searchParams.keys()], ["audioQa"],
      "standalone launch leaked root-shell query state");

    for (const route of [
      { path: "cobra-lab/", selector: "#mission-brief-exit", program: "cobra-lab" },
      { path: "weekend-ride/", selector: "#ride-brief-return", program: "weekend-ride" },
      { path: "okanagan/", selector: '#sortie-menu a[href*="program="]', program: "okanagan-fireboss" },
    ]) {
      await page.goto(`${site.url}${route.path}?audioQa=silent&throwaway=1`, {
        waitUntil: "load",
        timeout: 60_000,
      });
      await page.waitForFunction(() =>
        document.documentElement.dataset.audioEnabled === "false",
      undefined, { timeout: 60_000 });
      const exitHref = new URL(await page.locator(route.selector).getAttribute("href"));
      assert.equal(exitHref.pathname, "/", route.program);
      assert.equal(exitHref.searchParams.get("program"), route.program, route.program);
      assert.equal(exitHref.searchParams.get("menu"), "1", route.program);
      assert.equal(exitHref.searchParams.get("audioQa"), "silent", route.program);
      assert.deepEqual([...exitHref.searchParams.keys()].sort(),
        ["audioQa", "menu", "program"], `${route.program} leaked source-page query state`);
      assert.equal(await page.evaluate((storageKey) =>
        JSON.parse(localStorage.getItem(storageKey) || "{}").audio,
      PLAYER_SETTINGS_KEY), false, `${route.program} ignored the saved mute`);
      if (route.program === "okanagan-fireboss") {
        await page.evaluate(() => document.querySelector("#sound")?.click());
        await page.waitForFunction(() =>
          document.documentElement.dataset.audioEnabled === "true");
        assert.equal(await page.evaluate((storageKey) =>
          JSON.parse(localStorage.getItem(storageKey) || "{}").audio,
        PLAYER_SETTINGS_KEY), true, "Okanagan sound toggle did not persist to shared settings");
        // Leave the shared browser profile muted for any later smoke work in this context.
        await page.evaluate(() => document.querySelector("#sound")?.click());
        await page.waitForFunction(() =>
          document.documentElement.dataset.audioEnabled === "false");
      }
    }

    assert.deepEqual(pageErrors, [], `uncaught standalone page errors:\n${pageErrors.join("\n")}`);
    await context.close();
  } finally {
    await browser.close();
    await site.close();
  }
});
