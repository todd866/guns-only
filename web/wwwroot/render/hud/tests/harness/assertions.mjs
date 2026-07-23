#!/usr/bin/env node
// The HUD geometry contract, asserted numerically. Runs every deterministic scenario through the
// real hud.js in headless Chromium with window.__HUD_DEBUG__ set, then compares the geometry
// hud.js actually drew (waterline/FPV anchors, ladder rung endpoints, funnel rail samples, bandit
// marker) against independent probe projections computed with THREE's own camera math in the
// harness (window.__debugScenario). Per scenario:
//   - angle(waterline -> FPV) through the focal length equals alpha within 0.15 deg, directed
//     along body-down, with beta showing laterally;
//   - 10-deg ladder rung spacing equals focal * tan-projection within 1%, and the horizon rung
//     is perpendicular to the projected world-up direction;
//   - every funnel sample's half-width is focal * span/2 / r within 1 px AND its centre lies on
//     the projected ballistic trajectory;
//   - the bandit marker sits on the projected bandit position within 2 px;
//   - valid-solution coherence: the bandit lies BETWEEN the rails at the rung where the rail
//     separation equals the projected wingspan.
// Any violation fails the gate. Test instrument only — excluded from publish.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { serveStatic } from "./static_server.mjs";

const require = createRequire(
  new URL("../../../../../smoke/package.json", import.meta.url),
);
const { chromium } = require("playwright");

const WWWROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const RAD = 180 / Math.PI;
const DEG = Math.PI / 180;

const failures = [];
let checkCount = 0;

function check(scenario, label, ok, detail) {
  checkCount += 1;
  const line = `${scenario} :: ${label} :: ${detail}`;
  if (ok) {
    console.log(`  ok  ${line}`);
  } else {
    console.error(`  FAIL ${line}`);
    failures.push(line);
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Linear interpolation of the projected trajectory polyline at a given range.
function trajectoryAt(trajectory, rangeM) {
  for (let i = 1; i < trajectory.length; i++) {
    const a = trajectory[i - 1];
    const b = trajectory[i];
    if ((a.rangeM <= rangeM && rangeM <= b.rangeM)
      || (b.rangeM <= rangeM && rangeM <= a.rangeM)) {
      const f = (rangeM - a.rangeM) / (b.rangeM - a.rangeM || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return null;
}

function assertAirframeSymbols(data) {
  const { name, geometry, probes, state, look } = data;
  if (data.padlock) return; // the ladder/FPV contract is the forward HUD's
  const aoa = Number(state.aoa_deg) || 0;
  const beta = Number(state.beta_deg) || 0;
  const lookingOffAxis = Math.abs(Number(look?.yawDeg) || 0) > 1e-9
    || Math.abs(Number(look?.pitchDeg) || 0) > 1e-9;
  const waterlineExpected = probes.waterline?.behind !== true;
  const fpvExpected = probes.fpv?.behind !== true;

  check(name, waterlineExpected ? "waterline recorded" : "waterline leaves viewport plane",
    Boolean(geometry.waterlinePx) === waterlineExpected,
    geometry.waterlinePx ? "present" : "absent");
  check(name, fpvExpected ? "fpv recorded" : "fpv leaves viewport plane",
    Boolean(geometry.fpvPx) === fpvExpected,
    geometry.fpvPx ? "present" : "absent");
  if (!waterlineExpected && !fpvExpected) {
    check(name, "off-axis gun cross has no clamped ghost",
      geometry.gunCrossPx === null, geometry.gunCrossPx ? "present" : "absent");
    return;
  }
  if (!geometry.waterlinePx || !geometry.fpvPx) return;

  // hud.js anchors match the independent probe projections.
  const waterlineError = distance(geometry.waterlinePx, probes.waterline);
  check(name, "waterline == projected body-forward",
    waterlineError <= 1.5, `error ${waterlineError.toFixed(3)} px (tol 1.5)`);
  const fpvError = distance(geometry.fpvPx, probes.fpv);
  check(name, "fpv == projected world-velocity",
    fpvError <= 1.5, `error ${fpvError.toFixed(3)} px (tol 1.5)`);
  if (lookingOffAxis) {
    const nominalFocalError = Math.abs(probes.focalYPx - probes.nominalFocalYPx);
    check(name, "manual look leaves the camera focal unchanged",
      nominalFocalError <= 1e-9,
      `error ${nominalFocalError.toExponential(3)} px`);
    if (probes.lookBoresight) {
      const offsetError = distance(geometry.waterlinePx, probes.lookBoresight);
      check(name, "waterline == focal-projected manual-look offset",
        offsetError <= 1.5, `error ${offsetError.toFixed(3)} px (tol 1.5)`);
    }
    const gunCrossError = geometry.gunCrossPx
      ? distance(geometry.gunCrossPx, geometry.waterlinePx)
      : Number.POSITIVE_INFINITY;
    check(name, "gun cross remains on projected boresight",
      gunCrossError <= 1e-9, `error ${gunCrossError.toFixed(3)} px`);
    // Once the boresight is off-axis, gnomonic scale varies across the image (the apparent
    // waterline/FPV pixel gap is not atan(gap/focal)). Their independently projected positions
    // above are the valid contract; the centred small-angle checks below remain for forward view.
    return;
  }

  // The alpha gap through the focal length. The waterline sits on the projection axis, so the
  // angular separation is exactly atan(pixelDistance / focal).
  const dx = geometry.fpvPx.x - geometry.waterlinePx.x;
  const dy = geometry.fpvPx.y - geometry.waterlinePx.y;
  const measuredDeg = Math.atan(Math.hypot(dx, dy) / probes.focalYPx) * RAD;
  const expectedDeg = Math.acos(Math.cos(aoa * DEG) * Math.cos(beta * DEG)) * RAD;
  check(name, "angle(waterline->fpv) == alpha(+beta)",
    Math.abs(measuredDeg - expectedDeg) <= 0.15,
    `measured ${measuredDeg.toFixed(3)} deg vs ${expectedDeg.toFixed(3)} deg (tol 0.15)`);
  // Direction: body-down is screen-down through the body-fixed camera; beta shows laterally.
  check(name, "fpv sits along body-down",
    aoa <= 0 || dy > 0, `dy ${dy.toFixed(2)} px for alpha ${aoa} deg`);
  const expectedLateral = probes.focalXPx * Math.tan(beta * DEG);
  check(name, "beta shows laterally",
    Math.abs(dx - expectedLateral) <= 1.5,
    `dx ${dx.toFixed(2)} px vs ${expectedLateral.toFixed(2)} px (tol 1.5)`);
}

function assertLadder(data) {
  const { name, geometry, probes, state, look } = data;
  if (data.padlock) {
    check(name, "no ladder in padlock", geometry.ladderRungs.length === 0,
      `${geometry.ladderRungs.length} rungs recorded`);
    return;
  }
  const lookingOffAxis = Math.abs(Number(look?.yawDeg) || 0) > 1e-9
    || Math.abs(Number(look?.pitchDeg) || 0) > 1e-9;
  if (lookingOffAxis && probes.waterline?.behind === true) {
    check(name, "off-axis ladder has no clamped ghosts",
      geometry.ladderRungs.length === 0,
      `${geometry.ladderRungs.length} rungs recorded`);
    return;
  }
  const pitch = Number(state.pitch_deg) || 0;
  const rungs = new Map(geometry.ladderRungs.map((rung) => [rung.deg, rung]));
  check(name, "ladder rungs recorded", rungs.size > 0, `${rungs.size} rungs`);
  if (rungs.size === 0) return;

  // 10-degree spacing between recorded major rungs matches the true tan projection within 1%.
  let spacingChecks = 0;
  for (const [deg, rung] of rungs) {
    if (deg % 10 !== 0 || !rungs.has(deg + 10)) continue;
    const upper = rungs.get(deg + 10);
    const measured = Math.hypot(upper.cx - rung.cx, upper.cy - rung.cy);
    const expected = probes.focalYPx
      * Math.abs(Math.tan((pitch - deg) * DEG) - Math.tan((pitch - deg - 10) * DEG));
    check(name, `rung ${deg}->${deg + 10} spacing == focal*tan projection`,
      Math.abs(measured - expected) <= expected * 0.01,
      `measured ${measured.toFixed(2)} px vs ${expected.toFixed(2)} px (tol 1%)`);
    spacingChecks += 1;
  }
  check(name, "spacing pairs measured", spacingChecks > 0, `${spacingChecks} pairs`);
  if (pitch === 0 && rungs.has(0) && rungs.has(10)) {
    const horizonRung = rungs.get(0);
    if (geometry.waterlinePx) {
      const anchorError = distance(
        { x: horizonRung.cx, y: horizonRung.cy },
        geometry.waterlinePx,
      );
      check(name, "ladder origin == projected airframe boresight",
        anchorError <= 1.5, `error ${anchorError.toFixed(3)} px (tol 1.5)`);
    }
    const ten = rungs.get(10);
    const measured = Math.hypot(ten.cx - horizonRung.cx, ten.cy - horizonRung.cy);
    const expected = probes.focalYPx * Math.tan(10 * DEG);
    check(name, "10-deg rung spacing == focal*tan(10)",
      Math.abs(measured - expected) <= expected * 0.01,
      `measured ${measured.toFixed(2)} px vs ${expected.toFixed(2)} px (tol 1%)`);
  }

  // The horizon rung is perpendicular to the projected world-up direction (independent probe).
  const horizon = rungs.get(0);
  if (horizon && probes.worldUpScreen) {
    const length = Math.hypot(horizon.x2 - horizon.x1, horizon.y2 - horizon.y1) || 1;
    const dirX = (horizon.x2 - horizon.x1) / length;
    const dirY = (horizon.y2 - horizon.y1) / length;
    const dot = Math.abs(dirX * probes.worldUpScreen.x + dirY * probes.worldUpScreen.y);
    check(name, "horizon rung perpendicular to projected world-up",
      dot <= 0.03, `|dot| ${dot.toFixed(4)} (tol 0.03)`);
    if (probes.horizonScreen) {
      const cross = Math.abs(dirX * probes.horizonScreen.y - dirY * probes.horizonScreen.x);
      check(name, "horizon rung parallel to projected true horizon",
        cross <= 0.03, `|cross| ${cross.toFixed(4)} (tol 0.03)`);
    }
  }
}

function assertFunnel(data) {
  const { name, geometry, probes, state } = data;
  const usable = state.bandit_alive === true && state.lead_valid === true
    && Number(state.range_m) >= 150 && Number(state.range_m) <= 783;
  if (!usable) {
    check(name, "funnel absent outside the usable envelope", geometry.funnel === null,
      geometry.funnel ? `${geometry.funnel.length} samples drawn` : "absent");
    return;
  }
  check(name, "funnel drawn", Array.isArray(geometry.funnel) && geometry.funnel.length >= 2,
    geometry.funnel ? `${geometry.funnel.length} samples` : "missing");
  if (!Array.isArray(geometry.funnel)) return;

  const span = Number(state.target_wingspan_m);
  let worstWidth = 0;
  let worstCentre = 0;
  for (const sample of geometry.funnel) {
    const expectedHalf = Math.max(2.5, probes.focalXPx * (span * 0.5) / sample.rangeM);
    worstWidth = Math.max(worstWidth, Math.abs(sample.halfWidthPx - expectedHalf));
    const onPath = trajectoryAt(probes.trajectory, sample.rangeM);
    worstCentre = Math.max(worstCentre,
      onPath ? distance(sample, onPath) : Number.POSITIVE_INFINITY);
  }
  check(name, "funnel half-width == focal*span/2/r",
    worstWidth < 1, `worst error ${worstWidth.toFixed(3)} px (tol 1)`);
  check(name, "funnel centres lie on the projected trajectory",
    worstCentre <= 1.5, `worst error ${worstCentre.toFixed(3)} px (tol 1.5)`);
}

function assertBandit(data) {
  const { name, geometry, probes, look } = data;
  if (!geometry.banditPx || geometry.banditPx.behind) return;
  const error = distance(geometry.banditPx, probes.bandit);
  const lookingOffAxis = Math.abs(Number(look?.yawDeg) || 0) > 1e-9
    || Math.abs(Number(look?.pitchDeg) || 0) > 1e-9;
  check(name, lookingOffAxis
    ? "manual look keeps bandit on its world projection"
    : "bandit marker == projected bandit position",
    error <= 2, `error ${error.toFixed(3)} px (tol 2)`);
}

function assertPadlockDirector(data) {
  const { name, geometry, probes, padlockState } = data;
  const director = geometry.padlockDirector;
  const shouldHaveDirector = data.padlock
    && padlockState?.target !== "carrier"
    && (padlockState?.phase === "TRACK" || padlockState?.trackPrimed === true)
    && padlockState?.manualLookActive !== true
    && (probes.padlockPlaneMagnitude >= 0.035 || probes.padlockTargetForward < 0)
    && !name.endsWith("padlock-ground-warning");
  check(name, "padlock director presence follows valid tracked physical geometry",
    Boolean(director) === shouldHaveDirector,
    `${director ? "present" : "absent"}; expected ${shouldHaveDirector ? "present" : "absent"}`);
  if (!director) return;
  const error = Math.abs(director.rollErrorRad - probes.padlockRollErrorRad);
  check(name, "padlock roll error == atan2(target-right, target-up)",
    error <= 1e-9,
    `error ${(error * RAD).toFixed(9)} deg (tol ${(1e-9 * RAD).toFixed(9)})`);
  if (probes.padlockPlaneMagnitude < 0.035 && probes.padlockTargetForward < 0) {
    check(name, "dead-six director retains the current lift plane",
      director.anyPlane === true && director.captured === true,
      `anyPlane=${director.anyPlane}; captured=${director.captured}`);
  }
}

function assertFunnelContainsTarget(data) {
  const { name, geometry, probes, state } = data;
  if (!data.banditOnTrajectory || !Array.isArray(geometry.funnel)) return;
  // At the rung whose range matches the bandit's range the rail separation is one projected
  // wingspan; a valid solution must place the bandit marker BETWEEN the rails there.
  const rangeM = Number(state.range_m);
  const rail = geometry.funnel;
  let best = rail[0];
  for (const sample of rail) {
    if (Math.abs(sample.rangeM - rangeM) < Math.abs(best.rangeM - rangeM)) best = sample;
  }
  const separation = 2 * best.halfWidthPx;
  const projectedWingspan = probes.focalXPx * Number(state.target_wingspan_m) / best.rangeM;
  check(name, "rail separation == projected wingspan at target range",
    Math.abs(separation - projectedWingspan) < 1,
    `separation ${separation.toFixed(2)} px vs wingspan ${projectedWingspan.toFixed(2)} px`);
  const bandit = geometry.banditPx && !geometry.banditPx.behind
    ? geometry.banditPx : probes.bandit;
  const offset = distance(bandit, best);
  check(name, "bandit sits between the rails at its range",
    offset < best.halfWidthPx,
    `offset ${offset.toFixed(2)} px < halfWidth ${best.halfWidthPx.toFixed(2)} px`
    + ` at r=${best.rangeM.toFixed(0)} m`);
}

function assertPadlockInsetAndLocator(data) {
  const { name, geometry, probes, padlockState } = data;
  if (!data.padlock || padlockState?.target === "carrier") return;

  // The body-fixed locator inset is the padlock's single ownship instrument: always present in
  // bandit padlock, valid at every camera attitude (that is the point of being body-fixed).
  const inset = geometry.padlockInset;
  check(name, "locator inset present in bandit padlock", Boolean(inset),
    inset ? "present" : "missing");
  if (!inset) return;

  const bankDeg = Number(data.state.bank_deg) || 0;
  check(name, "inset ADI bank == ownship bank",
    Math.abs(inset.bankDeg - bankDeg) <= 1e-9, `${inset.bankDeg} vs ${bankDeg}`);
  const pitchDeg = Number(data.state.pitch_deg) || 0;
  check(name, "inset horizon offset finite and pitch-signed",
    Number.isFinite(inset.horizonOffsetPx)
      && (pitchDeg === 0 || Math.sign(inset.horizonOffsetPx) === Math.sign(pitchDeg)),
    `offset ${inset.horizonOffsetPx?.toFixed?.(2)} px for pitch ${pitchDeg} deg`);

  // The gate is the signed BODY-FRAME roll error, never mirrored by camera azimuth or target
  // hemisphere. Chevrons therefore always mean keyboard roll direction.
  const director = geometry.padlockDirector;
  if (director && !director.captured && !director.anyPlane) {
    const error = Math.abs(inset.gateAngleFromUpRad - probes.padlockRollErrorRad);
    check(name, "inset gate == body-frame roll error (never mirrored)",
      error <= 1e-9,
      `error ${(error * RAD).toFixed(9)} deg`);
  } else if (director && (director.captured || director.anyPlane)) {
    check(name, "captured/neutral gate sits on the lift line",
      inset.gateAngleFromUpRad === 0,
      `gate ${inset.gateAngleFromUpRad}`);
  }
  check(name, "neutral ring follows the dead-six anyPlane state",
    Boolean(inset.neutral) === Boolean(director?.anyPlane),
    `neutral=${inset.neutral}; anyPlane=${director?.anyPlane}`);

  // AFT / shoulder language from the body-frame hemisphere.
  if (probes.padlockTargetForward < -0.17) {
    const ambiguous = Math.abs(probes.padlockTargetRight) < 0.05;
    const expectedShoulder = probes.padlockTargetRight >= 0 ? "R" : "L";
    check(name, "aft label present with the correct shoulder",
      typeof inset.aftLabel === "string"
        && inset.aftLabel.includes("AFT")
        && (ambiguous
          ? !inset.aftLabel.includes("SHOULDER")
          : inset.aftLabel.includes(`${expectedShoulder} SHOULDER`)),
      `label "${inset.aftLabel}" for targetRight ${probes.padlockTargetRight.toFixed(3)}`);
  }

  // The off-axis locator caret must track the camera-space great-circle direction to the
  // target — continuity through the aft hemisphere is exactly what "wanders" was.
  const locator = geometry.padlockLocator;
  if (locator?.drawn && probes.banditCameraDir) {
    const dot = locator.dirX * probes.banditCameraDir.x
      + locator.dirY * probes.banditCameraDir.y;
    check(name, "locator caret points along the camera-space target direction",
      dot >= 0.995, `dot ${dot.toFixed(5)} (tol 0.995)`);
  }
}

// The "first five seconds" battery: rules a pilot notices instantly, asserted on EVERY
// scenario. One glyph per job — if the target marker is on screen, the locator arrow is
// redundant noise pointing at a dude you can already see.
function assertWarningLine(data) {
  const { name, geometry, state } = data;
  if (state?.auto_gcas_inhibit_reason === "LOW_LEVEL_STANDBY"
    && state?.auto_gcas_active !== true && state?.auto_gcas_warning !== true) {
    check(name, "GCAS low-level standby shows the quiet GCAS STBY status line",
      geometry.warningLine === "GCAS STBY",
      `warningLine=${JSON.stringify(geometry.warningLine)}`);
  }
  if (state?.auto_gcas_warning === true && state?.auto_gcas_active !== true) {
    check(name, "GCAS warning shows PULL UP",
      geometry.warningLine === "PULL UP",
      `warningLine=${JSON.stringify(geometry.warningLine)}`);
  }
}

function assertBasicJobs(data) {
  const { name, geometry, probes, look } = data;
  const locator = geometry.banditLocator;
  const lookingOffAxis = Math.abs(Number(look?.yawDeg) || 0) > 1e-9
    || Math.abs(Number(look?.pitchDeg) || 0) > 1e-9;
  if (lookingOffAxis) {
    check(name, "look-offset target still has exactly one marker/locator job",
      Boolean(locator), locator ? "job recorded" : "missing");
  }
  if (locator) {
    check(name, "marker and locator arrow are mutually exclusive",
      !(locator.markerInside && locator.arrowDrawn),
      `markerInside=${locator.markerInside} arrowDrawn=${locator.arrowDrawn}`);
    const viewport = data.viewport ?? { width: 1400, height: 1020 };
    if (locator?.arrowDrawn && Number.isFinite(locator.dirX)
        && probes.banditCameraDir) {
      const dot = locator.dirX * probes.banditCameraDir.x
        + locator.dirY * probes.banditCameraDir.y;
      check(name, "locator arrow points along the camera-space target direction",
        dot >= 0.995, `dot ${dot.toFixed(5)} (tol 0.995)`);
    }
    if (geometry.banditPx && !geometry.banditPx.behind
        && geometry.banditPx.x >= 20 && geometry.banditPx.x <= viewport.width - 20
        && geometry.banditPx.y >= 20 && geometry.banditPx.y <= viewport.height - 20) {
      check(name, "visible bandit gets the marker, not the arrow",
        locator.markerInside && !locator.arrowDrawn,
        `bandit at ${geometry.banditPx.x?.toFixed?.(0)},${geometry.banditPx.y?.toFixed?.(0)}: `
        + `markerInside=${locator.markerInside} arrowDrawn=${locator.arrowDrawn}`);
    }
  }
}

function assertGunHeat(data) {
  const { name, geometry, state, triggerHeld } = data;
  if (!name.endsWith(":gun-overheat-latched")) return;

  const bar = geometry.gunHeat;
  check(name, "gun heat bar present", bar?.present === true,
    bar ? "present" : "missing");
  check(name, "gun heat bar shows authoritative heat",
    bar?.heat === 1 && bar?.fillFraction === 1,
    `heat=${bar?.heat}; fill=${bar?.fillFraction}`);
  check(name, "gun heat bar enters amber caution band",
    bar?.caution === true && bar?.overheated === true,
    `caution=${bar?.caution}; overheated=${bar?.overheated}`);

  const annunciation = geometry.gunOverheatAnnunciation;
  check(name, "latched overheat annunciation appears",
    annunciation?.latched === true
      && annunciation?.visible === true
      && annunciation?.text === "OVERHEAT",
    `latched=${annunciation?.latched}; visible=${annunciation?.visible}; `
      + `text=${annunciation?.text}`);
  check(name, "latched gun refuses fire with trigger held",
    triggerHeld === true && state.gun_overheat === true && state.gun_firing === false,
    `triggerHeld=${triggerHeld}; overheat=${state.gun_overheat}; `
      + `gun_firing=${state.gun_firing}`);
}

// The portrait assisted mode is a first-class experience, so a phone-portrait pass runs the
// core scenarios through the SAME geometry contract at 430x860. The full battery stays on the
// landscape pass to bound gate time.
const PORTRAIT_SCENARIOS = new Set([
  "assisted-corner-hold",
  "forward-level", "forward-bandit-near-edge", "forward-bandit-offscreen",
  "gun-overheat-latched",
  "funnel-level-mid", "padlock-bandit-right-high", "padlock-bandit-behind",
  "padlock-aft-right-high",
]);

async function runViewport(site, browser, { label, width, height, subset }) {
  const page = await browser.newPage({ viewport: { width, height } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
  await page.goto(
    `${site.url}render/hud/tests/harness/harness.html?all=1&w=${width}&h=${height}`,
    { waitUntil: "load", timeout: 30000 },
  );
  await page.waitForFunction(() => window.__hudReady === "harness", { timeout: 15000 });
  const names = await page.evaluate(() => window.__scenarioNames);
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error("harness exposed no scenarios");
  }

  for (const name of names) {
    if (subset && !subset.has(name)) continue;
    console.log(`\n[${label}] ${name}`);
    const data = await page.evaluate(
      (scenario) => window.__debugScenario(scenario), name,
    );
    if (!data.geometry) {
      check(`${label}:${name}`, "debug geometry produced", false,
        "window.__HUD_GEOMETRY missing");
      continue;
    }
    data.name = `${label}:${name}`;
    data.viewport = { width, height };
    assertAirframeSymbols(data);
    assertLadder(data);
    assertFunnel(data);
    assertBandit(data);
    if (data.padlock) assertPadlockDirector(data);
    assertPadlockInsetAndLocator(data);
    assertBasicJobs(data);
    assertGunHeat(data);
    assertFunnelContainsTarget(data);
    assertWarningLine(data);
  }
  if (pageErrors.length > 0) {
    failures.push(`[${label}] uncaught page errors:\n${pageErrors.join("\n")}`);
  }
  await page.close();
}

async function main() {
  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(site, browser,
      { label: "landscape", width: 1400, height: 1020, subset: null });
    await runViewport(site, browser,
      { label: "portrait", width: 430, height: 860, subset: PORTRAIT_SCENARIOS });
  } finally {
    await browser.close();
    await site.close();
  }

  if (failures.length > 0) {
    console.error(`\nHUD geometry assertions FAILED (${failures.length}/${checkCount}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`\nHUD geometry contract holds: ${checkCount} assertions across all scenarios.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
