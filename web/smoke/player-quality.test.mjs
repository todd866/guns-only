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

// A phone held sideways is a real way to open this game, and the picker's secondary actions were
// a non-wrapping flex row: at 844x390 the row measured 266 px inside a 222 px box, so Practice was
// clipped on the left and Settings on the right while the middle two looked fine. Centred overflow
// hides itself — nothing scrolls and no scrollbar appears — so assert containment, not just width.
test("the aircraft picker keeps every secondary action reachable on a small screen",
  { timeout: 300_000 }, async () => {
  assert.ok(process.env.SMOKE_WWWROOT);
  const site = await serveStatic(process.env.SMOKE_WWWROOT);
  const browser = await chromium.launch({ headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    const errors = []; page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await page.goto(`${site.url}?menu=1&audioQa=silent&server=off`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "READY", null, { timeout: 90_000 });
    for (const [width, height] of [[844, 390], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => document.querySelector(".ready-secondary-actions") !== null);
      const row = await page.locator(".ready-secondary-actions").evaluate((node) => {
        const box = node.getBoundingClientRect();
        return {
          scroll: node.scrollWidth, client: node.clientWidth,
          buttons: [...node.querySelectorAll("button")].filter((button) => !button.hidden).map((button) => {
            const rect = button.getBoundingClientRect();
            return { label: button.textContent.trim(), left: rect.left, right: rect.right, width: rect.width };
          }),
          left: box.left, right: box.right,
        };
      });
      assert.ok(row.buttons.length >= 3, `${width}x${height}: expected the picker's secondary actions`);
      assert.ok(row.scroll <= row.client + 1,
        `${width}x${height}: secondary actions overflow ${row.scroll} > ${row.client}`);
      for (const button of row.buttons) {
        assert.ok(button.width > 0, `${width}x${height}: "${button.label}" collapsed to zero width`);
        assert.ok(button.left >= row.left - 1 && button.right <= row.right + 1,
          `${width}x${height}: "${button.label}" is clipped outside the action row`);
        assert.ok(button.left >= -1 && button.right <= width + 1,
          `${width}x${height}: "${button.label}" is clipped outside the viewport`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); }
});

// Whatever else a small screen does to a brief, the action that starts the thing has to be on it.
// At 844x390 Cobra's Start sat 87 px below the fold of a scrolling card with nothing saying to
// scroll, while Okanagan and Weekend Ride pinned theirs. Assert the contract, not one route's CSS.
test("every production brief keeps its primary action on screen when a phone is held sideways",
  { timeout: 300_000 }, async () => {
  assert.ok(process.env.SMOKE_WWWROOT);
  const site = await serveStatic(process.env.SMOKE_WWWROOT);
  const browser = await chromium.launch({ headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ROUTES = [
    { id: "aircraft picker", url: "?menu=1&audioQa=silent&server=off", action: "#ready-start" },
    { id: "Cobra Canyon", url: "cobra-lab/?audioQa=silent&server=off", action: "#mission-brief-start" },
    { id: "Weekend Ride", url: "weekend-ride/?audioQa=silent&server=off", action: "#ride-brief-start" },
    { id: "Fire Boss", url: "okanagan/?audioQa=silent", action: "#start" },
  ];
  // 844x390 is a large phone on its side; 667x375 is a small one, and the tighter height is where
  // a centred column first grows taller than its row.
  try {
    for (const { width, height } of [{ width: 844, height: 390 }, { width: 667, height: 375 }])
    for (const route of ROUTES) {
      const page = await browser.newPage({ viewport: { width, height }, screen: { width, height }, hasTouch: true, isMobile: true });
      try {
        await page.goto(`${site.url}${route.url}`, { waitUntil: "load" });
        const action = page.locator(route.action);
        await action.waitFor({ state: "visible", timeout: 90_000 });
        // Let the brief settle: fonts, art and any staging copy can still change its height.
        await page.waitForFunction((selector) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          const box = element.getBoundingClientRect();
          const previous = globalThis.__actionProbe;
          globalThis.__actionProbe = `${Math.round(box.top)}:${Math.round(box.bottom)}`;
          return previous === globalThis.__actionProbe;
        }, route.action, { timeout: 30_000, polling: 400 });
        const box = await action.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            text: node.textContent.trim().slice(0, 24) };
        });
        assert.ok(box.bottom <= height + 1 && box.top >= -1,
          `${route.id} at ${width}x${height}: "${box.text}" is off screen at rest `
          + `(top ${Math.round(box.top)}, bottom ${Math.round(box.bottom)} in a ${height} px viewport)`);
        assert.ok(box.left >= -1 && box.right <= width + 1,
          `${route.id} at ${width}x${height}: "${box.text}" is clipped horizontally`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); await site.close(); }
});
