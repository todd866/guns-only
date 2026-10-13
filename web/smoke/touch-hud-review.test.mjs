import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

// Deterministic presentation fixtures, rendered by the real HUD with real Canvas metrics.
// These do not claim a simulated flight or physical-phone acceptance.
const root = fileURLToPath(new URL("../wwwroot/", import.meta.url));
async function withHud(viewport, run) {
  const site = await serveStatic(root);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chromium" });
    const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
    await page.goto(`${site.url}render/hud/tests/harness/harness.html?all=1&audioQa=silent`
      + `&w=${viewport.width}&h=${viewport.height}`);
    await page.waitForFunction(() => window.__hudReady === "harness");
    await page.addStyleTag({ content: "body{padding:0}#hud{border:0}#label{display:none}" });
    await page.evaluate(async ({ width, height }) => {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1";
      document.head.append(meta);
      const { createHud } = await import("/hud.js");
      const { buildFrame } = await import("/render/hud/tests/harness/harness.js");
      const hud = createHud(document.querySelector("#hud"));
      hud.setAudioEnabled(false);
      hud.setTouchMode(true);
      hud.setPresentationProfile("portrait_dual_stick");
      hud.resize(width, height, 1);
      globalThis.__HUD_DEBUG__ = true;
      globalThis.reviewHud = hud;
      globalThis.reviewFrame = buildFrame({
        player: { headingDeg: 0, pitchDeg: 0, bankDeg: 0, altFt: 10000 },
        bandit: { azimuthDeg: 0, elevationDeg: 0, rangeM: 37040 },
        state: { mach: 0.634, assisted_flight: true, g_actual: 4.4,
          gun_heat: 0.3, ammo: 400, fuel_lb: 12000, fuel_capacity_lb: 18000,
          closure_kts: 600, vertical_speed_fpm: 2000 },
      });
    }, viewport);
    await run(page);
  } finally {
    await browser?.close();
    await site.close();
  }
}

async function screenshot(page, name) {
  if (!process.env.HUD_REVIEW_SHOTS) return;
  await mkdir(process.env.HUD_REVIEW_SHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.HUD_REVIEW_SHOTS}/${name}.png` });
}

test("390px BVR/heat/G header preserves weapons and fuel and leaves contact data at its locator", async () => {
  await withHud({ width: 390, height: 844 }, async (page) => {
    for (const large of [false, true]) {
      const result = await page.evaluate((large) => {
        document.documentElement.classList.toggle("large-interface-text", large);
        const texts = [];
        const ctx = reviewHud.ctx;
        const fillText = ctx.fillText;
        ctx.fillText = function(text, ...args) { texts.push(text); return fillText.call(this, text, ...args); };
        try { reviewHud.draw(reviewFrame); } finally { ctx.fillText = fillText; }
        return { rail: __HUD_GEOMETRY.mobileTactical, texts };
      }, large);
      await screenshot(page, `bvr-390-${large ? "large" : "normal"}`);
      assert.equal(result.rail.drawnRows.length, 1);
      const text = result.rail.drawnRows[0].text;
      for (const reading of ["M.63", "AUTO COR", "4.4G", "GUN400", "T30%", "F12K"])
        assert.ok(text.includes(reading), `missing ${reading} in ${text}`);
      assert.doesNotMatch(text, /…|T1 |CLOS/);
      assert.ok(result.texts.some((text) => /TGT 1.*20NM.*600/.test(text)),
        `contact range and closure must remain at the locator: ${result.texts}`);
    }
  });
});

test("selected target data avoids published controls along the portrait lower edge", async () => {
  await withHud({ width: 390, height: 844 }, async (page) => {
    for (const x of [60, 195, 330]) {
      for (const y of [680, 810]) {
        const result = await page.evaluate(({ x, y }) => {
          const controls = [
            { id: "padlock-target", left: 16, right: 122, top: 668, bottom: 712 },
            { id: "flight-stick", left: 232, right: 374, top: 682, bottom: 824 },
          ];
          reviewHud.setOccupiedRects(controls);
          // Project a real world point onto the requested pixel using the fixture camera.
          const point = reviewFrame.banditPosition.clone().set(
            x / 390 * 2 - 1, 1 - y / 844 * 2, 0.5).unproject(reviewFrame.camera);
          point.sub(reviewFrame.camera.position).normalize().multiplyScalar(600)
            .add(reviewFrame.camera.position);
          reviewFrame.banditPosition.copy(point);
          reviewFrame.state.range_m = 600;
          reviewHud.draw(reviewFrame);
          return { line: __HUD_GEOMETRY.targetDataLine, controls,
            target: __HUD_GEOMETRY.banditPx };
        }, { x, y });
        await screenshot(page, `lower-edge-${x}-${y}`);
        assert.ok(Math.abs(result.target.x - x) < 0.1 && Math.abs(result.target.y - y) < 0.1,
          `expected ${x},${y}; projected ${JSON.stringify(result.target)}`);
        const line = result.line;
        assert.ok(line, "the selected target must retain its range/closure line");
        for (const rect of result.controls) {
          assert.ok(!(line.x < rect.right && line.x + line.width > rect.left
            && line.y < rect.bottom && line.y + line.height > rect.top),
          `${x},${y}: ${JSON.stringify(line)} overlaps ${rect.id}`);
        }
      }
    }
  });
});

test("high-alpha cue is reserved in the 390px large-text combat row and desktop G row", async () => {
  await withHud({ width: 390, height: 844 }, async (page) => {
    for (const desktop of [false, true]) {
      const result = await page.evaluate((desktop) => {
        document.documentElement.classList.add("large-interface-text");
        Object.assign(reviewFrame.state, { player_aircraft_id: "f-22a",
          high_alpha_recovery: true, g_actual: 3, mach: 0.39,
          requested_envelope_override: true, vertical_speed_fpm: -20000 });
        const draws = [];
        const ctx = reviewHud.ctx;
        const fillText = ctx.fillText;
        ctx.fillText = function(text, x, y, ...args) {
          const width = this.measureText(text).width;
          const left = this.textAlign === "right" ? x - width
            : this.textAlign === "center" ? x - width / 2 : x;
          draws.push({ text, left, right: left + width, y, color: this.fillStyle });
          return fillText.call(this, text, x, y, ...args);
        };
        try {
          if (desktop) {
            ctx.clearRect(0, 0, 390, 844);
            reviewHud.drawGTape(reviewFrame.state);
          } else reviewHud.draw(reviewFrame);
        } finally { ctx.fillText = fillText; }
        return { draws, rail: __HUD_GEOMETRY.mobileTactical };
      }, desktop);
      await screenshot(page, `high-alpha-${desktop ? "desktop-row" : "390-large"}`);
      const cue = result.draws.find((draw) => draw.text === "→⊙←");
      assert.ok(cue, "the complete cue must be drawn separately from fitted text");
      assert.equal(cue.color, "#ffb020");
      assert.ok(cue.left >= 0 && cue.right <= 390);
      for (const other of result.draws.filter((draw) => draw !== cue && draw.y === cue.y))
        assert.ok(other.right <= cue.left || other.left >= cue.right,
          `${other.text} overlaps reserved cue`);
      if (!desktop) {
        assert.equal(result.rail.drawnRows.length, 1);
        const row = result.rail.drawnRows[0];
        for (const reading of ["3.0G", "GUN400", "T30%", "F12K", "→⊙←"])
          assert.ok(row.text.includes(reading), `missing ${reading}: ${row.text}`);
        assert.doesNotMatch(row.text, /…/);
      }
    }
  });
});
