import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
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
      // Practice rows name each button "<title>, <limit>. <brief>" (brief also in the tooltip).
      await page.getByRole("button", { name: new RegExp(`^${title},`) }).click();
      await page.waitForFunction((id) => globalThis.__gunsState?.practice_exercise === id
        && globalThis.__gunsState?.practice_status === "ready", exercise);
      assert.equal(await page.locator("#ready-selector").isVisible(), false);
      await page.locator("#ready-start").click();
      await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "ACTIVE", null, { timeout: 90_000 });
      if (exercise === "gunnery") {
        // Budget the pass in simulated time, not wall time: a loaded SwiftShader runner can run
        // the 120 Hz kernel well below real time, and a 30 s wall-clock wait failed on CI while
        // the same commit passed on its PR run. Thirty simulated seconds is generous for two hits.
        const startTick = await page.evaluate(() => globalThis.__gunsState.tick);
        await page.keyboard.down("f");
        try {
          await page.waitForFunction((start) => globalThis.__gunsState?.practice_completed === true
            || globalThis.__gunsState?.tick - start >= 30 * 120, startTick, { timeout: 240_000 });
        } finally { await page.keyboard.up("f"); }
        assert.equal(await page.evaluate(() => globalThis.__gunsState.practice_completed), true,
          "two physical hits within 30 simulated seconds of holding Fire");
      }
      // Gunnery completed through physical hits; valley/recovery use the paused restart path.
      // Both paths must retain practice authority.
      if (await page.evaluate(() => globalThis.__gunsState?.session_phase === "ACTIVE")) await page.keyboard.press("Escape");
      // Completed practice has one Repeat practice action; paused practice keeps Restart.
      await page.locator('#ready-screen[data-mode="debrief"] #ready-start, #ready-screen[data-mode="pause"] #ready-restart').click();
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
    for (const [width, height] of [[844, 390], [667, 375], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => document.querySelector(".ready-secondary-actions") !== null);
      // An inherited display:block used to stack landscape posters at the full selector width.
      // Choosing a lower card then scrolled the oversized row and took Fly off screen. Exercise
      // real selection before checking geometry; a default focused action can hide that overflow.
      await page.locator('[data-program-node="cobra-lab"]').click();
      const primary = await page.locator("#ready-start").evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      assert.ok(primary.top >= -1 && primary.bottom <= height + 1,
        `${width}x${height}: choosing a poster moved Fly off screen (${primary.top}..${primary.bottom})`);
      const row = await page.locator(".ready-secondary-actions").evaluate((node) => {
        const box = node.getBoundingClientRect();
        const mode = node.closest('#ready-screen').dataset.mode;
        return {
          scroll: node.scrollWidth, client: node.clientWidth,
          // Mode membership is CSS-owned; [hidden] only supplies per-sortie exceptions.
          // Keep expected controls even if CSS accidentally collapses or hides them.
          buttons: [...node.querySelectorAll("button")].filter((button) => !button.hidden
            && button.dataset.consoleModes.split(' ').includes(mode)).map((button) => {
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
        assert.ok(button.width >= 44, `${width}x${height}: "${button.label}" needs a usable width (${button.width})`);
        assert.ok(button.left >= row.left - 1 && button.right <= row.right + 1,
          `${width}x${height}: "${button.label}" is clipped outside the action row`);
        assert.ok(button.left >= -1 && button.right <= width + 1,
          `${width}x${height}: "${button.label}" is clipped outside the viewport`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); }
});

// Exercise every action set against the real cascade, including the seven-button pause row.
// The live picker smoke above supplies selection/scroll coverage; these fixtures isolate sizing.
test("every console mode keeps usable action targets in phone portrait and landscape", async () => {
  const html = await readFile(new URL('../wwwroot/index.html', import.meta.url), 'utf8');
  const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const generic = html.match(/<div class="ready-secondary-actions console-actions">([\s\S]*?)<\/div>/)[1];
  const result = html.match(/<div class="f22-actions console-actions">([\s\S]*?)<\/div>/)[1];
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  try {
    for (const [width, height] of [[844, 390], [667, 375], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
      try {
        for (const [mode, ids] of [
          ['program', ['practice', 'logbook', 'intro-replay', 'settings', 'report']],
          ['pause', ['practice', 'logbook', 'return', 'restart', 'settings', 'report', 'handoff']],
          ['debrief', ['practice', 'logbook', 'return', 'restart', 'settings', 'report']],
          ['intro', ['practice', 'logbook', 'intro-replay', 'settings', 'report']],
          ['f22', ['again', 'recover', 'logbook', 'aircraft', 'settings']],
        ]) {
          const f22 = mode === 'f22';
          const expected = ids.map(id => `${f22 ? 'f22' : 'ready'}-${id}`);
          const row = f22 ? `<section class="f22-result"><div class="f22-actions console-actions">${result}</div></section>`
            : `<div class="ready-secondary-actions console-actions">${generic}</div>`;
          await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
            <style>${styles}</style><div id="ready-screen" class="visible" data-mode="${f22 ? 'debrief' : mode}"
              ${f22 ? 'data-f22-result="combat"' : ''}>
              <div class="ready-card"><div class="ready-layout"><div class="ready-selector"></div>
                <section class="ready-briefing console-surface">${row}</section></div></div></div>`);
          const geometry = await page.evaluate((expected) => {
            document.documentElement.classList.add('touch-mode', 'run-paused');
            const mode = document.querySelector('#ready-screen').dataset.mode;
            // Show the full authored set; intro's contextual alternative occupies one slot.
            for (const button of document.querySelectorAll('button'))
              button.hidden = button.id === 'ready-return' && mode === 'intro';
            const labelFor = id => document.querySelector(`#${id} .shell-action-label`);
            if (mode === 'intro') labelFor('ready-intro-replay').textContent = 'Choose another mission';
            if (mode === 'debrief' && labelFor('ready-restart')) {
              labelFor('ready-restart').textContent = 'Repeat sortie';
              labelFor('ready-practice').textContent = 'Practise landing';
            }
            const row = document.querySelector('.console-actions');
            const box = row.getBoundingClientRect();
            return { left: box.left, right: box.right, scroll: row.scrollWidth, client: row.clientWidth,
              visible: [...row.querySelectorAll('button')]
                .filter(button => getComputedStyle(button).display !== 'none').map(button => button.id),
              buttons: expected.map(id => {
                const button = document.getElementById(id);
                const rect = button.getBoundingClientRect();
                const label = button.querySelector('.shell-action-label');
                return { id, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
                  labelScroll: label.scrollWidth, labelWidth: label.clientWidth };
              }) };
          }, expected);
          const context = `${mode} ${width}x${height}`;
          assert.deepEqual(geometry.visible, expected, `${context}: mode action set changed`);
          assert.ok(geometry.scroll <= geometry.client + 1, `${context}: action row overflows`);
          for (const button of geometry.buttons) {
            assert.ok(button.width >= 44 && button.height >= 44, `${context}: ${button.id} target collapsed`);
            assert.ok(button.left >= Math.max(0, geometry.left) - 1
              && button.right <= Math.min(width, geometry.right) + 1, `${context}: ${button.id} is clipped`);
            assert.ok(button.labelScroll <= button.labelWidth + 1, `${context}: ${button.id} label overflows`);
          }
        }
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
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
    { id: "Area 51½", url: "rc/?audioQa=silent", action: "#start" },
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

// Exercise the real stylesheet cascade with the shell's authorised/unauthorised DOM states.
// The separate WASM flight smoke covers the touch action's PLAYER_RTB transition.
test('pause exposes authorised RTB and respects the hidden authority flag on phone and laptop', async () => {
  const html=await readFile(new URL('../wwwroot/index.html',import.meta.url),'utf8');
  const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const browser=await chromium.launch({headless:true,channel:'chromium'});
  try {
    for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:720}]) {
      const page=await browser.newPage({viewport});
      try {
        await page.setContent(`<style>${styles}</style><div id="ready-screen" class="visible" data-mode="pause"><button id="ready-handoff">Call It A Day</button></div>`);
        const button=page.locator('#ready-handoff');
        assert.equal(await button.isVisible(),true);
        await button.evaluate(el=>el.hidden=true);
        assert.equal(await button.isVisible(),false);
      } finally {await page.close();}
    }
  } finally {await browser.close();}
});
