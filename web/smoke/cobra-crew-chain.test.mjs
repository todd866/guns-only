import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";
import {
  COBRA_CHROMIUM_ARGS,
  COBRA_ROUTE,
  designateNextHostile,
  readCobraHud,
  waitForCobraAuthority,
} from "./cobra_authority.mjs";

// THE AH-1G CREW CHAIN, END TO END -- AND DELIBERATELY NOT PART OF THE PUBLISHED-SMOKE GATE.
//
// Run it by hand against a published wwwroot:
//
//   SMOKE_WWWROOT=<publish>/wwwroot node --test web/smoke/cobra-crew-chain.test.mjs
//
// bin/check syntax-checks this file but does not execute it. Here is why, honestly.
//
// What it proves is worth keeping: Tab designates, the gunner authority qualifies the track and
// reports GUN ON TARGET - HOLD F with consent released, holding F produces fire_authorized with
// the reason chain clear (None) and GUN FIRING on the combiner with rounds actually gone from the
// magazine, and releasing F disarms. That is the whole AH-1G crew contract and no other test in
// the repo executes it.
//
// Why it was out of the gate before Build 267: Hold the Bridge only offered an engageable
// hostile for ~20 s at spawn, and the garrison killed that pair before a slow CI runner could
// designate. Build 267 seeds `ground.hostile.gunnery-seam.000` on the aircraft nose (immune to
// friendly mutual combat), so the crew chain is reachable for the whole sortie. Re-admit this
// file to the published-smoke gate once a Verify run proves the seam on the runner.

const WWWROOT = process.env.SMOKE_WWWROOT;
const TIMEOUT_SCALE = Math.max(1, Number(process.env.SMOKE_TIMEOUT_SCALE) || 1);
// Wall budgets are backstops against a genuine hang, never the thing that decides the outcome.
// The semantic budget is the mission clock below.
const scaled = (ms) => ms * TIMEOUT_SCALE;

// Reasons that mean the mount is working the problem and time will resolve it. Every other reason
// (Masked, OutOfLimits, NoBallisticSolution, FriendlyTarget, TargetUnavailable) is a standing
// geometric verdict from the authority itself: waiting on it only burns the window, so take the
// next mark immediately instead.
const WORKING_REASONS = new Set(["Acquiring", "SightNotCoincident", "ConsentReleased"]);
// In MISSION seconds, not wall seconds. The seeded pair lives about 20 s; qualifying a track costs
// 0.75 s of acquisition plus under 1.4 s of turret slew (80 deg/s across the 110 deg envelope).
const ENGAGEMENT_WINDOW_S = 14;

test("the published Cobra route runs the AH-1G crew chain from designation to rounds away",
  async () => {
    assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

    const site = await serveStatic(WWWROOT);
    const browser = await chromium.launch({ headless: true, args: COBRA_CHROMIUM_ARGS });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
      await page.goto(`${site.url}${COBRA_ROUTE}`, {
        waitUntil: "load",
        timeout: scaled(150000),
      });
      await waitForCobraAuthority(page, scaled(150000));

      // Re-arm the tactical picture before acting. The ground war is deterministically seeded
      // (fixed RNG seed, fixed spawn rings), so the picture at a given mission second is identical
      // on every machine; re-spawning via the app's own restart -- restartRoute(), the production
      // handler behind the play debrief's "Fly again" button and the terminal-state R key -- makes
      // mission time SINCE RESTART, rather than wall time since page load, the clock the
      // engagement rides on.
      const restartSortie = async () => {
        const beforeS = (await readCobraHud(page)).elapsedS;
        assert.ok(Number.isFinite(beforeS), "the ground war reports no mission clock");
        await page.evaluate(() => {
          const restart = document.querySelector("#reset");
          if (!restart) throw new Error("the Cobra restart control is gone");
          restart.click();
        });
        await page.waitForFunction(
          (prior) => {
            const elapsed = window.__gunsOnlyCobraAuthority?.ground_war?.debrief?.elapsed_s;
            return Number.isFinite(elapsed) && elapsed < prior;
          },
          beforeS,
          { timeout: scaled(120000) },
        );
        const fresh = await readCobraHud(page);
        // Prove the restart actually re-spawned rather than silently no-opping: the mission clock
        // went backwards to the start line and the magazine is whole again.
        assert.ok(fresh.elapsedS < beforeS && fresh.elapsedS < 5,
          `restart did not reset the mission clock: ${beforeS} -> ${fresh.elapsedS}`);
        assert.equal(fresh.ammo, fresh.ammoCapacity,
          `restart did not restore the magazine: ${JSON.stringify(fresh)}`);
        assert.ok(fresh.hostiles >= 1,
          `a fresh sortie seeded no hostiles: ${JSON.stringify(fresh)}`);
        return fresh;
      };

      // Which hostile the turret can reach is geometry and the ground war keeps killing units, so
      // cycle until the gunner reports a qualified track rather than assuming the first mark is
      // engageable -- then hold F on THAT one. If a whole cycle finds nothing before the window
      // shuts, take a fresh sortie and cycle again.
      let engaged = null;
      const attempted = [];
      for (let sortie = 0; sortie < 4 && !engaged; sortie += 1) {
        const fresh = await restartSortie();
        for (let press = 0; press <= fresh.hostiles && !engaged; press += 1) {
          await designateNextHostile(page, scaled(120000));
          const designated = await readCobraHud(page);
          assert.ok(designated.gunner.selected_target_id,
            "Tab did not reach the gunner authority");
          attempted.push({
            id: designated.gunner.selected_target_id,
            reason: designated.gunner.reason,
            atMissionS: Number(designated.elapsedS?.toFixed?.(1) ?? designated.elapsedS),
          });
          if (designated.gunner.reason === "TargetUnavailable") continue;
          assert.match(designated.model.gunner.detail, /TGT\s+\S+/,
            `the combiner is not carrying the designated target: ${
              JSON.stringify(designated.model.gunner)}`);
          assert.equal(designated.model.designation?.id, designated.gunner.selected_target_id,
            "the designation bracket and the authority disagree about the mark");
          // Out of the spawn window: this sortie has nothing left to offer, take a fresh one.
          if (designated.elapsedS > ENGAGEMENT_WINDOW_S) break;
          if (!WORKING_REASONS.has(designated.gunner.reason)) continue;
          try {
            // The ready cue, exactly: a qualified track whose ONLY remaining inhibit is the
            // trigger. "tracking" alone is reached while the turret is still slewing onto the
            // sight line. The deadline is on the mission clock, so a slow machine gets all the
            // wall time it needs to reach the same 14 mission seconds a fast one gets.
            await page.waitForFunction(
              (deadlineS) => {
                const state = window.__gunsOnlyCobraAuthority;
                const elapsed = state?.ground_war?.debrief?.elapsed_s ?? 0;
                if (elapsed > deadlineS) throw new Error("engagement window shut");
                return state?.gunner?.state === "tracking"
                  && state?.gunner?.reason === "ConsentReleased";
              },
              ENGAGEMENT_WINDOW_S,
              { timeout: scaled(120000) },
            );
            engaged = await readCobraHud(page);
          } catch {
            // Masked, out of limits, still dying, or the window shut: try the next mark.
          }
        }
      }
      assert.ok(engaged,
        "no designated hostile ever produced a qualified track from a fresh spawn hover; "
        + `marks tried: ${JSON.stringify(attempted)}`);
      // Trigger up, the crew says so in as many words. This is the state F has to change.
      assert.equal(engaged.gunner.reason, "ConsentReleased");
      assert.equal(engaged.model.gunner.line, "GUN ON TARGET — HOLD F");

      await page.keyboard.down("f");
      let held;
      try {
        // Latch the exact snapshot in which consent produced fire, atomically: the target this is
        // shooting at can die a second later, and a snapshot read after that would be measuring
        // the aftermath instead of the trigger.
        await page.waitForFunction(
          (before) => {
            const state = window.__gunsOnlyCobraAuthority;
            if (state?.gunner?.fire_authorized !== true) return false;
            if (!(state?.ground_war?.ammo_remaining < before)) return false;
            window.__smokeFiringSnapshot = state;
            return true;
          },
          engaged.ammo,
          { timeout: scaled(120000) },
        );
        held = await page.evaluate(async () => {
          const { cobraRotorcraftHudModel } =
            await import("/render/cobra/cobra_rotorcraft_hud.js?v=296");
          const state = window.__smokeFiringSnapshot;
          return {
            model: cobraRotorcraftHudModel(state),
            gunner: state.gunner,
            ammo: state.ground_war.ammo_remaining,
          };
        });
      } finally {
        await page.keyboard.up("f");
      }
      // Holding F is consent reaching the authority: fire authorized, the reason chain clear of
      // ConsentReleased, the combiner saying FIRING, and rounds actually leaving the magazine.
      assert.equal(held.gunner.fire_authorized, true);
      assert.equal(held.gunner.reason, "None");
      assert.equal(held.model.gunner.line, "GUN FIRING");
      assert.ok(held.ammo < engaged.ammo && held.ammo >= 0,
        `holding F spent no ammunition: ${engaged.ammo} -> ${held.ammo}`);
      assert.match(held.model.gunner.detail, /AMMO\s+\d+/i);

      const released = await page.evaluate(() => new Promise((resolve) => setTimeout(
        () => resolve(window.__gunsOnlyCobraAuthority?.gunner ?? null), 600)));
      assert.equal(released?.fire_authorized, false,
        "releasing F left the gun authorized to fire");
      assert.deepEqual(pageErrors, [], `uncaught Cobra page errors:\n${pageErrors.join("\n")}`);
    } finally {
      await browser.close();
      await site.close();
    }
  });
