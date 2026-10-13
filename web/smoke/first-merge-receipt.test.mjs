// First-merge receipt: the standard real-input evidence that the PUBLIC opening gives a stranger
// a fight on a phone. Fresh storage, the root URL, the wordless front door, one tap on the
// primary action, then a HUD-cue-only thumb pilot on the real touch controls.
//
// What the pilot may read (everything it steers or fires on is drawn on the HUD):
//   * window.__HUD_GEOMETRY, the real hud.js's own record of what it drew this frame, published
//     because the page sets window.__HUD_DEBUG__ = true before boot (harness-only switch; it
//     changes no drawing): gunCrossPx (boresight cross), banditPx + banditLocator.markerInside
//     (the target bracket on screen), banditLocator.arrowDrawn/dirX/dirY (the edge locator when
//     the bracket is off screen), leadPipper {x, y, solution} (the drawn pipper and whether the
//     drawn cue reads as a solution) and ladderRungs (the pitch ladder, used only as the
//     pixels-per-degree scale a pilot reads off the ladder spacing).
// What the pilot never reads: positions, headings, lead points or any other kernel truth.
//
// The scorer separately reads __gunsState for the clock and outcome only: simulation_time_s,
// session_phase, range_m (rendered on the target data line), hits, rounds_fired, kill_count,
// bandit_presenting, assisted_flight, auto_throttle, mission_definition_id.
//
// Determinism: the kernel exposes no seed; the rung-0 opening is fixed geometry. Jitter comes
// only from frame timing, so the bounds below are generous but meaningful.
//
// Receipt and frames: $SMOKE_ARTIFACT_DIR (or $MEDEVAC_QA_CAPTURE_DIR, else a temp dir) under
// first-merge-receipt/. Override the artifact with $SMOKE_WWWROOT as for the other smoke files.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

const CONTACT_BY_S = 20;
const WINDOW_BY_S = 30;
const WINDOW_MIN_S = 2;
const HIT_BY_S = 45;
const REACTION_S = 0.25;
// A coarse gun window: the target bracket drawn within 12 degrees of the gun cross and the
// data-line range inside 800 m (the HUD's tally/gun envelope). Same bound as the a1 kernel test.
const COARSE_CONE_DEG = 12;
const COARSE_RANGE_M = 800;
const ORIENTATIONS = [
  { name: "portrait", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
];

const captureRoot = path.join(process.env.SMOKE_ARTIFACT_DIR || process.env.MEDEVAC_QA_CAPTURE_DIR
  || path.join(os.tmpdir(), "guns-only-smoke"), "first-merge-receipt");

// Pixels per degree from the drawn pitch ladder; fall back to the 66 degree default lens.
function pxPerDeg(rungs, height) {
  if (Array.isArray(rungs) && rungs.length >= 2) {
    const sorted = [...rungs].sort((a, b) => Math.abs(a.deg) - Math.abs(b.deg));
    const a = sorted[0];
    const b = sorted.find((r) => r.deg !== a.deg);
    if (b) {
      const scale = Math.hypot(b.cx - a.cx, b.cy - a.cy) / Math.abs(b.deg - a.deg);
      if (Number.isFinite(scale) && scale > 0.5) return scale;
    }
  }
  return height / 66;
}

// What the HUD shows, reduced to the cue a pilot would steer to (degrees, right/up positive).
function perceive(geo, height) {
  if (!geo || !geo.gunCrossPx) return null;
  const scale = pxPerDeg(geo.ladderRungs, height);
  const cross = geo.gunCrossPx;
  const marker = geo.banditLocator?.markerInside === true && geo.banditPx && !geo.banditPx.behind
    ? geo.banditPx : null;
  const pipper = geo.leadPipper && Number.isFinite(geo.leadPipper.x) ? geo.leadPipper : null;
  const offset = (p) => ({ right: (p.x - cross.x) / scale, up: (cross.y - p.y) / scale });
  return {
    marker: marker ? offset(marker) : null,
    pipper: pipper ? offset(pipper) : null,
    arrow: geo.banditLocator?.arrowDrawn === true
      ? { right: geo.banditLocator.dirX, up: -geo.banditLocator.dirY } : null,
    solution: geo.leadPipper?.solution === true,
  };
}

async function flyReceipt(browser, site, orientation) {
  const { name, width, height } = orientation;
  const out = path.join(captureRoot, name);
  await mkdir(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height }, screen: { width, height },
    hasTouch: true, isMobile: true });
  await context.route("**/api/**", (route) => route.fulfill({ status: 204, body: "" }));
  await context.addInitScript(() => { globalThis.__HUD_DEBUG__ = true; });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  const receipt = { receipt: "first-merge", orientation: name, viewport: `${width}x${height}`,
    input: "cdp-touch", reactionS: REACTION_S, frames: {}, errors };
  const wallStart = Date.now();
  const frame = async (key, t) => {
    const file = path.join(out, `${key}.png`);
    await page.screenshot({ path: file });
    receipt.frames[key] = { file, t: t === null ? null : +t.toFixed(3) };
  };
  try {
    await page.goto(`${site.url}?audioQa=silent&server=off`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "READY"
      && document.querySelector("#ready-start")?.disabled === false, null, { timeout: 120_000 });
    receipt.door = await page.evaluate(() => ({
      mode: document.querySelector("#ready-screen")?.dataset.mode ?? null,
      mission: globalThis.__gunsState?.mission_definition_id ?? null,
    }));
    receipt.build = await page.evaluate(() => globalThis.__gunsBuild ?? null);
    receipt.renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    });
    const start = await page.locator("#ready-start").boundingBox();
    await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "ACTIVE", null,
      { timeout: 90_000 });
    const t0 = await page.evaluate(() => globalThis.__gunsState.simulation_time_s);
    receipt.launch = await page.evaluate(() => ({
      mission: globalThis.__gunsState.mission_definition_id ?? null,
      assisted: globalThis.__gunsState.assisted_flight ?? null,
      autoThrottle: globalThis.__gunsState.auto_throttle ?? null,
      presenting: globalThis.__gunsState.bandit_presenting ?? null,
    }));
    await frame("launch", 0);

    const stick = await page.locator("#target-stick").boundingBox();
    const fire = await page.locator("#touch-fire").boundingBox();
    assert.ok(stick && stick.width > 20, `${name}: the touch stick is not on screen`);
    assert.ok(fire && fire.width > 20, `${name}: the touch FIRE button is not on screen`);
    const fireXY = { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
    const cdp = await context.newCDPSession(page);
    let stickDown = false, fireDown = false, roll = 0, pitch = 0, lastT = 0;
    const points = (sx, sy) => [
      ...(stickDown ? [{ x: sx, y: sy, id: 1, radiusX: 8, radiusY: 8, force: 1 }] : []),
      ...(fireDown ? [{ ...fireXY, id: 2, radiusX: 8, radiusY: 8, force: 1 }] : []),
    ];
    const stickPoint = () => {
      const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
      const radius = Math.min(stick.width, stick.height) / 2;
      const mag = Math.hypot(roll, pitch);
      if (mag < 1e-4) return [cx, cy];
      const reach = (0.12 + Math.min(1, mag) * 0.88) * radius;
      return [cx + (roll / mag) * reach, cy + (pitch / mag) * reach];
    };

    const seen = [];
    let contactS = null, windowStartS = null, coarseS = 0, firstHitS = null, roundsToFirstHit = null;
    let presentEndS = null, solutionS = 0, prev = null, endReason = "time";
    // SwiftShader runs the kernel far below real time; this only stops a hung flight.
    const wallDeadline = Date.now() + 240_000;
    for (;;) {
      if (Date.now() > wallDeadline) { endReason = "wall-budget"; break; }
      const s = await page.evaluate(() => {
        const g = globalThis.__gunsState, h = globalThis.__HUD_GEOMETRY;
        if (!g) return null;
        return {
          time: g.simulation_time_s, phase: g.session_phase, range: g.range_m, hits: g.hits,
          rounds: g.rounds_fired, kills: g.kill_count, presenting: g.bandit_presenting,
          geo: h ? { gunCrossPx: h.gunCrossPx, banditPx: h.banditPx, banditLocator: h.banditLocator,
            leadPipper: h.leadPipper, ladderRungs: h.ladderRungs } : null,
        };
      });
      if (!s || s.phase !== "ACTIVE") { endReason = `phase:${s?.phase ?? "none"}`; break; }
      const t = s.time - t0;
      if (t > HIT_BY_S) break;
      const cue = perceive(s.geo, height);
      // Scoring from what was drawn this frame.
      if (contactS === null && cue?.marker) { contactS = t; await frame("first-contact", t); }
      const coarse = cue?.marker && Math.hypot(cue.marker.right, cue.marker.up) < COARSE_CONE_DEG
        && Number(s.range) < COARSE_RANGE_M;
      if (prev && t <= WINDOW_BY_S) {
        if (coarse && prev.coarse) coarseS += t - prev.t;
        if (cue?.solution && prev.solution) solutionS += t - prev.t;
      }
      if (coarse && windowStartS === null) { windowStartS = t; await frame("first-window", t); }
      if (presentEndS === null && s.presenting === false) presentEndS = t;
      if (firstHitS === null && (Number(s.hits) > 0 || Number(s.kills) > 0)) {
        firstHitS = t; roundsToFirstHit = s.rounds; await frame("first-hit", t);
      }
      prev = { t, coarse: !!coarse, solution: cue?.solution === true };
      if (contactS !== null && firstHitS !== null && coarseS >= WINDOW_MIN_S && t >= firstHitS + 1) {
        endReason = "receipt-complete"; break;
      }

      // The pilot acts on what it saw REACTION_S ago.
      seen.push({ t, cue });
      let view = null;
      while (seen.length && seen[0].t <= t - REACTION_S) view = seen.shift();
      if (view) {
        const c = view.cue;
        const aim = c?.pipper ?? c?.marker;
        let rollTarget = 0, pitchTarget = 0;
        if (aim) {
          rollTarget = Math.max(-0.35, Math.min(0.35, 0.04 * aim.right));
          pitchTarget = Math.max(-0.3, Math.min(0.6, 0.045 * aim.up));
        } else if (c?.arrow) {
          rollTarget = Math.sign(c.arrow.right) * 0.35;
          pitchTarget = 0.4;
        }
        // Bounded thumb: at most three stick-radii per second of travel. Positive pitch drags
        // the thumb down the stick, which is a pull.
        const step = 3 * Math.max(0.016, t - lastT);
        roll += Math.max(-step, Math.min(step, rollTarget - roll));
        pitch += Math.max(-step, Math.min(step, pitchTarget - pitch));
        const [sx, sy] = stickPoint();
        const wasStick = stickDown, wasFire = fireDown;
        stickDown = true;
        fireDown = c?.solution === true;
        if (wasFire && !fireDown) {
          // CDP touchEnd releases exactly the points it lists; dropping a point from touchMove
          // does not lift that finger.
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd",
            touchPoints: [{ ...fireXY, id: 2, radiusX: 8, radiusY: 8, force: 1 }] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(sx, sy) });
        } else {
          await cdp.send("Input.dispatchTouchEvent", {
            type: !wasStick || (fireDown && !wasFire) ? "touchStart" : "touchMove",
            touchPoints: points(sx, sy) });
        }
      }
      lastT = t;
      await page.waitForTimeout(20);
    }
    if (stickDown || fireDown) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const endT = await page.evaluate(() => globalThis.__gunsState?.simulation_time_s ?? null);
    await frame("end", endT === null ? null : endT - t0);
    Object.assign(receipt, {
      endReason,
      contactS: contactS === null ? null : +contactS.toFixed(3),
      firstWindowS: windowStartS === null ? null : +windowStartS.toFixed(3),
      coarseWindowS: +coarseS.toFixed(3),
      solutionCueS: +solutionS.toFixed(3),
      firstHitS: firstHitS === null ? null : +firstHitS.toFixed(3),
      roundsToFirstHit,
      presentEndS: presentEndS === null ? null : +presentEndS.toFixed(3),
      end: await page.evaluate(() => ({ phase: globalThis.__gunsState?.session_phase,
        rounds: globalThis.__gunsState?.rounds_fired, kills: globalThis.__gunsState?.kill_count })),
    });
  } finally {
    receipt.wallS = +((Date.now() - wallStart) / 1000).toFixed(1);
    await writeFile(path.join(captureRoot, `first-merge-receipt-${name}.json`),
      `${JSON.stringify(receipt, null, 1)}\n`).catch(() => {});
    await context.close();
  }
  return receipt;
}

for (const orientation of ORIENTATIONS) {
  test(`first merge on a ${orientation.name} phone: contact, a gun window and a hit through real touch`,
    { timeout: 420_000 }, async () => {
      assert.ok(process.env.SMOKE_WWWROOT, "SMOKE_WWWROOT must name the published wwwroot");
      await mkdir(captureRoot, { recursive: true });
      const site = await serveStatic(process.env.SMOKE_WWWROOT);
      // Full Chromium headless takes the hardware GPU where one exists (the receipt records the
      // renderer); a GPU-less CI runner falls back to SwiftShader, which is slow but still runs
      // the same fixed-tick kernel, so every bound below is in simulated seconds.
      const browser = await chromium.launch({ headless: true, channel: "chromium",
        args: ["--enable-unsafe-swiftshader", "--mute-audio"] });
      try {
        const r = await flyReceipt(browser, site, orientation);
        const tag = `${orientation.name} (${r.launch?.mission ?? "?"}, end ${r.endReason})`;
        assert.ok(r.contactS !== null && r.contactS <= CONTACT_BY_S,
          `${tag}: no target bracket in the forward view within ${CONTACT_BY_S} s (first at ${r.contactS})`);
        assert.ok(r.coarseWindowS >= WINDOW_MIN_S,
          `${tag}: coarse gun window ${r.coarseWindowS} s before ${WINDOW_BY_S} s, need ${WINDOW_MIN_S} s`);
        assert.ok(r.firstHitS !== null && r.firstHitS <= HIT_BY_S,
          `${tag}: no physical hit within ${HIT_BY_S} s (rounds fired ${r.end?.rounds ?? "?"})`);
        assert.deepEqual(r.errors, []);
      } finally { await browser.close(); await site.close(); }
    });
}
