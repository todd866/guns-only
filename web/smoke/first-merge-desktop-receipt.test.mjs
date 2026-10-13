// Desktop first-merge receipt: laptop keyboard is the core experience (owner, 2026-10-13). Fresh
// storage, the root URL at 1280x720, the wordless front door launched with the Enter key, then a
// HUD-cue-only pilot flying ONLY real Playwright key events (keyboard.down/up holds and taps on
// the arrows and F). No bridge calls, no state writes, no touch.
//
// What the pilots read is what the HUD drew (window.__HUD_GEOMETRY under the harness-only
// __HUD_DEBUG__ switch, exactly as first-merge-receipt.test.mjs): the gun cross, the target
// bracket, the edge locator, the lead pipper and its solution state, and the ladder scale.
// The scorer reads __gunsState for clock and outcome only (simulation_time_s, session_phase,
// range_m, hits, rounds_fired, kill_count, bandit_presenting, bfm_lesson).
//
// Pilots:
//   human — 250 ms reaction, proportional taps and holds, fires only on the drawn solution.
//           Asserted: contact <= 20 s, coarse gun window >= 2 s (or until the hit) before 30 s,
//           hit <= 45 s, and the ladder's O1 -> D1 hand-over after the kill.
//   kid   — the owner's main player: 450 ms reaction, coarse fixed holds that overshoot, long
//           trigger bursts whenever the target is roughly ahead.
// Both pilots run by default (DESKTOP_RECEIPT_PILOTS narrows them). Both need the gimballed-gun
// auto-aim (imp/c11-hit-autoaim): gun_gimbal_mounted telemetry is required in every run.
// KID_REACTION_S / KID_ROLL_MS /
//           KID_PULL_MS vary the child model for sweeps (defaults 0.45 s / 400 ms / 500 ms).
//
// Holds are timed in SIMULATED time (the kernel clock the pilot experiences), so a slow
// SwiftShader runner does not stretch a 100 ms tap into a full-stick hold.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

import { checkDesktopReceipt, createGunWindowTracker, WINDOW_BY_S, HIT_BY_S, KILL_TO_D1_S } from "./first-merge-desktop-acceptance.mjs";

const VIEWPORT = { width: 1280, height: 720 };
const COARSE_CONE_DEG = 12;
const COARSE_RANGE_M = 800;
const PILOTS = (process.env.DESKTOP_RECEIPT_PILOTS || "human,kid").split(",").filter(Boolean);

const captureRoot = path.join(process.env.SMOKE_ARTIFACT_DIR || process.env.MEDEVAC_QA_CAPTURE_DIR
  || path.join(os.tmpdir(), "guns-only-smoke"), "first-merge-desktop-receipt");

const KEYS = { pull: "ArrowDown", push: "ArrowUp", left: "ArrowLeft", right: "ArrowRight", fire: "KeyF" };

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

function perceive(geo, height) {
  if (!geo || !geo.gunCrossPx) return null;
  const scale = pxPerDeg(geo.ladderRungs, height);
  const cross = geo.gunCrossPx;
  const marker = geo.banditLocator?.markerInside === true && geo.banditPx && !geo.banditPx.behind
    ? geo.banditPx : null;
  const pipper = geo.leadPipper && Number.isFinite(geo.leadPipper.x) ? geo.leadPipper : null;
  const offset = (p) => ({ right: (p.x - cross.x) / scale, up: (cross.y - p.y) / scale });
  // Bank read off the drawn pitch ladder: the rung centres line up along world "up".
  let bankDeg = null;
  const rungs = Array.isArray(geo.ladderRungs) ? geo.ladderRungs : [];
  if (rungs.length >= 2) {
    const sorted = [...rungs].sort((a, b) => a.deg - b.deg);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    if (hi.deg > lo.deg) bankDeg = Math.atan2(hi.cx - lo.cx, lo.cy - hi.cy) * 180 / Math.PI;
  }
  return {
    bankDeg,
    marker: marker ? offset(marker) : null,
    pipper: pipper ? offset(pipper) : null,
    arrow: geo.banditLocator?.arrowDrawn === true
      ? { right: geo.banditLocator.dirX, up: -geo.banditLocator.dirY } : null,
    solution: geo.leadPipper?.solution === true,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Each pilot returns hold requests in milliseconds of sim time: { roll: ±ms, pitch: ±ms, fireMs }.
// Positive roll = right, positive pitch = pull. fireMs > 0 holds F that long; 0 releases it.
const PILOT_MODELS = {
  human: {
    reactionS: 0.25,
    decide(c) {
      // A pilot flies the nose to the target bracket first and refines on the pipper once it is
      // close; the pipper moves with ownship rates, so chasing it from afar is a PIO.
      const pipperNear = c?.pipper && Math.hypot(c.pipper.right, c.pipper.up) < 6;
      const aim = pipperNear ? c.pipper : c?.marker ?? c?.pipper;
      if (!aim) {
        if (c?.arrow) return { roll: Math.sign(c.arrow.right || 1) * 250, pitch: 250, fireMs: 0 };
        return { roll: 0, pitch: 0, fireMs: 0 };
      }
      const d = Math.hypot(aim.right, aim.up);
      const bearing = Math.atan2(aim.right, aim.up) * 180 / Math.PI; // 0 = straight up the HUD
      let roll = 0, pitch = 0;
      // Lift-vector tracking at every range: roll the target toward the top of the HUD, pull
      // it down to the cross. Close in, the holds shrink to taps; a target just below the cross
      // gets a push tap rather than a half roll.
      const fine = d < 6;
      if (fine && aim.up < 0 && d < 1.5) {
        pitch = -clamp(-aim.up * 80, 30, 120);
        if (Math.abs(aim.right) > 0.5) roll = Math.sign(aim.right) * clamp(Math.abs(aim.right) * 40, 30, 80);
      } else {
        if (Math.abs(bearing) > (fine ? 25 : 15)) {
          roll = Math.sign(bearing) * clamp(Math.abs(bearing) * (fine ? 1.2 : 1.5), 30, fine ? 160 : 250);
        }
        if (Math.abs(bearing) < 60) {
          const along = d * Math.cos(bearing * Math.PI / 180);
          pitch = fine ? clamp(along * 60, 30, 200) : clamp(along * 25, 60, 300);
        }
        // Back-pressure in a bank so the nose does not fall out of the turn while rolling.
        const bank = Math.abs(c.bankDeg ?? 0);
        if (pitch <= 0 && bank > 30 && bank < 150) pitch = clamp((bank - 30) * 2, 40, 120);
      }
      return { roll, pitch, fireMs: c.solution ? 300 : 0 };
    },
  },
  kid: {
    reactionS: Number(process.env.KID_REACTION_S) || 0.45,
    decide(c) {
      const aim = c?.marker ?? c?.pipper;
      if (!aim) {
        if (c?.arrow) return { roll: Math.sign(c.arrow.right || 1) * 600, pitch: 600, fireMs: 0 };
        return { roll: 0, pitch: 0, fireMs: 0 };
      }
      let roll = 0, pitch = 0;
      const rollMs = Number(process.env.KID_ROLL_MS) || 400;
      const pullMs = Number(process.env.KID_PULL_MS) || 500;
      if (Math.abs(aim.right) > 3) roll = Math.sign(aim.right) * rollMs;
      if (aim.up > 2) pitch = pullMs;
      else if (aim.up < -4) pitch = -300;
      const roughlyAhead = Math.hypot(aim.right, aim.up) < 15;
      return { roll, pitch, fireMs: roughlyAhead ? 1500 : 0 };
    },
  },
};

async function flyDesktop(browser, site, pilotName) {
  const model = PILOT_MODELS[pilotName];
  const out = path.join(captureRoot, pilotName);
  await mkdir(out, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT });
  await context.route("**/api/**", (route) => route.fulfill({ status: 204, body: "" }));
  await context.addInitScript(() => { globalThis.__HUD_DEBUG__ = true; });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  const receipt = { receipt: "first-merge-desktop", pilot: pilotName, viewport: "1280x720",
    input: "keyboard", reactionS: model.reactionS, frames: {}, errors, keyEvents: 0 };
  const wallStart = Date.now();
  const frame = async (key, t) => {
    const file = path.join(out, `${key}.png`);
    await page.screenshot({ path: file });
    receipt.frames[key] = { file, t: t === null ? null : +t.toFixed(3) };
  };
  const down = new Map(); // key code -> release sim time (s)
  const press = async (code, untilS) => {
    if (!down.has(code)) { await page.keyboard.down(code); receipt.keyEvents++; }
    down.set(code, untilS);
  };
  const release = async (code) => {
    if (down.has(code)) { await page.keyboard.up(code); receipt.keyEvents++; down.delete(code); }
  };
  try {
    await page.goto(`${site.url}?audioQa=silent&server=off`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "READY"
      && document.querySelector("#ready-start")?.disabled === false, null, { timeout: 120_000 });
    receipt.door = await page.evaluate(() => ({
      mode: document.querySelector("#ready-screen")?.dataset.mode ?? null,
      mission: globalThis.__gunsState?.mission_definition_id ?? null,
      launchLabel: document.querySelector("#ready-start")?.textContent?.trim() ?? null,
    }));
    receipt.build = await page.evaluate(() => globalThis.__gunsBuild ?? null);
    receipt.renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    });
    // Keyboard launch: Tab focus is how a keyboard user reaches the primary action; Enter fires it.
    await page.focus("#ready-start");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "ACTIVE", null,
      { timeout: 90_000 });
    const t0 = await page.evaluate(() => globalThis.__gunsState.simulation_time_s);
    receipt.launch = await page.evaluate(() => ({
      mission: globalThis.__gunsState.mission_definition_id ?? null,
      assisted: globalThis.__gunsState.assisted_flight ?? null,
      lesson: globalThis.__gunsState.bfm_lesson ?? null,
      presenting: globalThis.__gunsState.bandit_presenting ?? null,
      // Required telemetry from the integrated gimballed-gun implementation.
      autoAim: typeof globalThis.__gunsState.gun_gimbal_mounted === "boolean",
    }));
    await frame("launch", 0);

    const seen = [];
    // Decision trace (diagnostic only; the pilot never reads range/KCAS/bank):
// [t, aimRightDeg, aimUpDeg, cue P/M/A, solution, range m, KCAS, rollMs, pitchMs, fireMs, bankDeg].
    const trace = [];
    receipt.trace = trace;
    const gunWindows = createGunWindowTracker();
    let contactS = null, windowStartS = null, firstHitS = null, roundsToFirstHit = null;
    let killS = null, d1S = null, solutionS = 0, prev = null, nextDecisionS = 0, endReason = "time";
    let fireS = 0, lastFireT = null;
    const wallDeadline = Date.now() + 300_000;
    for (;;) {
      if (Date.now() > wallDeadline) { endReason = "wall-budget"; break; }
      const s = await page.evaluate(() => {
        const g = globalThis.__gunsState, h = globalThis.__HUD_GEOMETRY;
        if (!g) return null;
        return {
          time: g.simulation_time_s, phase: g.session_phase, range: g.range_m, hits: g.hits,
          rounds: g.rounds_fired, kills: g.kill_count, presenting: g.bandit_presenting,
          lesson: g.bfm_lesson, bank: g.bank_deg, kcas: g.calibrated_airspeed_kts ?? g.kcas ?? g.ias_kts,
          geo: h ? { gunCrossPx: h.gunCrossPx, banditPx: h.banditPx, banditLocator: h.banditLocator,
            leadPipper: h.leadPipper, ladderRungs: h.ladderRungs } : null,
        };
      });
      if (!s || s.phase !== "ACTIVE") { endReason = `phase:${s?.phase ?? "none"}`; break; }
      const t = s.time - t0;
      for (const [code, until] of [...down]) if (t >= until) await release(code);
      if (killS === null && t > HIT_BY_S) break;
      const cue = perceive(s.geo, VIEWPORT.height);
      if (contactS === null && cue?.marker) { contactS = t; await frame("first-contact", t); }
      const coarse = cue?.marker && Math.hypot(cue.marker.right, cue.marker.up) < COARSE_CONE_DEG
        && Number(s.range) < COARSE_RANGE_M;
      gunWindows.sample(t, coarse);
      if (prev && t <= WINDOW_BY_S) {
        if (cue?.solution && prev.solution) solutionS += t - prev.t;
      }
      if (down.has(KEYS.fire) && lastFireT !== null) fireS += t - lastFireT;
      lastFireT = t;
      if (coarse && windowStartS === null) { windowStartS = t; await frame("first-window", t); }
      if (firstHitS === null && (Number(s.hits) > 0 || Number(s.kills) > 0)) {
        firstHitS = t; roundsToFirstHit = s.rounds; await frame("first-hit", t);
      }
      if (killS === null && Number(s.kills) > 0) { killS = t; await frame("kill", t); }
      if (killS !== null && d1S === null && s.lesson === "D1") { d1S = t; await frame("d1", t); }
      prev = { t, solution: cue?.solution === true };
      if (d1S !== null && t >= d1S + 1) { endReason = "receipt-complete"; break; }
      if (killS !== null && t > killS + KILL_TO_D1_S) { endReason = "no-d1"; break; }

      // After the kill the pilot keeps hands off; the receipt only needs the hand-over.
      seen.push({ t, cue });
      let view = null;
      while (seen.length && seen[0].t <= t - model.reactionS) view = seen.shift();
      if (killS === null && view && t >= nextDecisionS) {
        nextDecisionS = t + model.reactionS;
        const d = model.decide(view.cue);
        const c = view.cue, aim = c?.pipper ?? c?.marker;
        trace.push([+t.toFixed(2), aim ? +aim.right.toFixed(2) : null, aim ? +aim.up.toFixed(2) : null,
          c?.pipper ? "P" : c?.marker ? "M" : c?.arrow ? "A" : "-", c?.solution ? 1 : 0,
          Math.round(Number(s.range)), Math.round(Number(s.kcas)), Math.round(d.roll), Math.round(d.pitch), d.fireMs,
          Math.round(Number(s.bank))]);
        const hold = async (pos, neg, ms) => {
          if (ms > 0) { await release(neg); await press(pos, t + ms / 1000); }
          else if (ms < 0) { await release(pos); await press(neg, t - ms / 1000); }
        };
        await hold(KEYS.right, KEYS.left, d.roll);
        await hold(KEYS.pull, KEYS.push, d.pitch);
        if (d.fireMs > 0) await press(KEYS.fire, t + d.fireMs / 1000);
        else if (pilotName === "human") await release(KEYS.fire);
      } else if (killS !== null) {
        for (const code of [...down.keys()]) await release(code);
      }
      await page.waitForTimeout(10);
    }
    for (const code of [...down.keys()]) await release(code);
    const endT = await page.evaluate(() => globalThis.__gunsState?.simulation_time_s ?? null);
    await frame("end", endT === null ? null : endT - t0);
    const r3 = (v) => v === null ? null : +v.toFixed(3);
    Object.assign(receipt, {
      endReason, contactS: r3(contactS), firstWindowS: r3(windowStartS), ...gunWindows.result(),
      // Keep the hit and window endpoints unrounded so containment uses the sampled times.
      solutionCueS: +solutionS.toFixed(3), triggerHeldS: +fireS.toFixed(3), firstHitS,
      roundsToFirstHit, killS: r3(killS), d1S: r3(d1S),
      end: await page.evaluate(() => ({ phase: globalThis.__gunsState?.session_phase,
        rounds: globalThis.__gunsState?.rounds_fired, kills: globalThis.__gunsState?.kill_count,
        lesson: globalThis.__gunsState?.bfm_lesson })),
    });
  } finally {
    receipt.wallS = +((Date.now() - wallStart) / 1000).toFixed(1);
    await writeFile(path.join(captureRoot, `first-merge-desktop-receipt-${pilotName}.json`),
      `${JSON.stringify(receipt, null, 1)}\n`).catch(() => {});
    await context.close();
  }
  return receipt;
}


for (const pilot of PILOTS) {
  test(`first merge on a 1280x720 laptop: ${pilot} keyboard pilot gets contact, a hit, a kill and D1`,
    { timeout: 480_000 }, async () => {
      assert.ok(process.env.SMOKE_WWWROOT, "SMOKE_WWWROOT must name the published wwwroot");
      await mkdir(captureRoot, { recursive: true });
      const site = await serveStatic(process.env.SMOKE_WWWROOT);
      const browser = await chromium.launch({ headless: true, channel: "chromium",
        args: ["--enable-unsafe-swiftshader", "--mute-audio"] });
      try {
        const r = await flyDesktop(browser, site, pilot);
        checkDesktopReceipt(r);
      } finally { await browser.close(); await site.close(); }
    });
}
