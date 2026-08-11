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

  // Cobra's ladder remains camera/world referenced, while W is the stable aircraft body cue.
  if (data.ladderReference === "camera") {
    const waterlineError = distance(geometry.waterlinePx, probes.waterline);
    check(name, "Cobra waterline == projected body-forward",
      waterlineError <= 1.5, `error ${waterlineError.toFixed(3)} px (tol 1.5)`);
    if (geometry.gunCrossPx) {
      const gunCrossError = distance(geometry.gunCrossPx, probes.waterline);
      check(name, "gun cross remains on projected body-forward",
        gunCrossError <= 1.5, `error ${gunCrossError.toFixed(3)} px (tol 1.5)`);
    }
    const expectedSeparation = probes.cameraWaterline
      ? distance(probes.waterline, probes.cameraWaterline) : 0;
    if (expectedSeparation >= 20) {
      const separation = distance(geometry.waterlinePx, probes.cameraWaterline);
      check(name, "pitched Cobra W stays separate from ladder horizon",
        separation >= 20, `separation ${separation.toFixed(3)} px (min 20)`);
    }
    const fpvError = distance(geometry.fpvPx, probes.fpv);
    check(name, "camera fpv == projected world-velocity",
      fpvError <= 1.5, `error ${fpvError.toFixed(3)} px (tol 1.5)`);
    return;
  }

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
  const pitch = data.ladderReference === "camera"
    ? (Number(probes.cameraPitchDeg) || 0)
    : (Number(state.pitch_deg) || 0);
  const lookingOffAxis = data.ladderReference !== "camera"
    && (Math.abs(Number(look?.yawDeg) || 0) > 1e-9
      || Math.abs(Number(look?.pitchDeg) || 0) > 1e-9);
  if (lookingOffAxis && probes.waterline?.behind === true) {
    check(name, "off-axis ladder has no clamped ghosts",
      geometry.ladderRungs.length === 0,
      `${geometry.ladderRungs.length} rungs recorded`);
    return;
  }
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
  const selectedAlive = typeof state.opponent_alive === "boolean"
    ? state.opponent_alive
    : state.bandit_alive === true;
  const usable = selectedAlive && state.lead_valid === true
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
  const { name, geometry, probes, padlockState, state } = data;
  const director = geometry.padlockDirector;
  const preferredValid = state.padlock_preferred_plane_valid === true;
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
  const expectedRollErrorRad = preferredValid
    ? Number(state.padlock_preferred_plane_deg) * DEG
    : probes.padlockRollErrorRad;
  const error = Math.abs(director.rollErrorRad - expectedRollErrorRad);
  check(name, preferredValid
    ? "padlock director uses the kernel preferred-plane error"
    : "padlock roll error == atan2(target-right, target-up)",
    error <= 1e-9,
    `error ${(error * RAD).toFixed(9)} deg (tol ${(1e-9 * RAD).toFixed(9)})`);
  if (preferredValid) {
    check(name, "preferred-plane director never draws the neutral ring",
      director.anyPlane === false, `anyPlane=${director.anyPlane}`);
    check(name, "preferred-plane presentation captures inside 11 degrees",
      director.captured === (Math.abs(expectedRollErrorRad) <= 11 * DEG),
      `captured=${director.captured}; error=${Math.abs(expectedRollErrorRad * RAD).toFixed(1)} deg`);
  }
  if (probes.padlockPlaneMagnitude < 0.035 && probes.padlockTargetForward < 0) {
    check(name, preferredValid
      ? "dead-six preferred plane replaces the neutral director"
      : "dead-six director retains the current lift plane",
    preferredValid
      ? director.anyPlane === false
      : director.anyPlane === true && director.captured === true,
    `anyPlane=${director.anyPlane}; captured=${director.captured}`);
  }
}

function assertTargetTwoDirector(data) {
  if (data.name.endsWith("forward-target-two-offscreen")) {
    check(data.name, "forward view gives the selected wingman the sole target locator",
      data.geometry.selectedTargetLocator?.owner === "wingman"
        && data.geometry.banditLocator?.arrowDrawn === false,
      `selected=${JSON.stringify(data.geometry.selectedTargetLocator)}; `
        + `primary=${JSON.stringify(data.geometry.banditLocator)}`);
    check(data.name, "forward TARGET 2 locator carries identity, range, and closure",
      /^TARGET 2 · SELECTED · .+ · .+$/.test(
        data.geometry.selectedTargetLocator?.label ?? "",
      ),
      `label=${JSON.stringify(data.geometry.selectedTargetLocator?.label)}`);
    return;
  }
  if (!data.name.endsWith("padlock-target-two-roll-right")) return;
  const { geometry, padlockState } = data;
  check(data.name, "TARGET 2 remains the padlocked camera contact",
    padlockState?.target === "wingman",
    `target=${padlockState?.target}`);
  check(data.name, "TARGET 2 is explicitly identified as selected",
    geometry.padlockMode?.title === "TARGET 2 · SELECTED · PADLOCK",
    `title=${JSON.stringify(geometry.padlockMode?.title)}`);
  // The roll command is the director's signed error on the instrument, not the string
  // "TARGET 2 · ROLL RIGHT 43°". A positive roll error is a roll to the right.
  check(data.name, "TARGET 2 receives an explicit roll-right command",
    Number(geometry.padlockDirector?.rollErrorRad) > 0,
    `rollErrorRad=${JSON.stringify(geometry.padlockDirector?.rollErrorRad)}`);
  // The caged-gun text is deliberately gone: it appeared mid-screen whenever the padlocked
  // pipper went off-axis and duplicated, less precisely, the signed roll error asserted above.
  check(data.name, "no redundant caged-gun text competes with the padlock director",
    !geometry.offAxisGunCue,
    `cue=${JSON.stringify(geometry.offAxisGunCue)}`);
}

function assertPresentationCaptureSequence(data) {
  const steps = data.presentationCaptureSequence;
  if (!Array.isArray(steps)) return;
  const expected = [
    { errorDeg: 11, captured: true, label: "enters at 11 degrees" },
    { errorDeg: 15, captured: true, label: "retains through the 18-degree band" },
    { errorDeg: 19, captured: false, label: "releases outside 18 degrees" },
  ];
  check(data.name, "presentation capture sequence has three frames",
    steps.length === expected.length, `${steps.length} frames`);
  for (let index = 0; index < Math.min(steps.length, expected.length); index += 1) {
    const actual = steps[index];
    const want = expected[index];
    check(data.name, `presentation capture ${want.label}`,
      actual.errorDeg === want.errorDeg && actual.captured === want.captured,
      `error=${actual.errorDeg}; captured=${actual.captured}`);
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

function assertPadlockActionAndLocator(data) {
  const { name, geometry, probes, padlockState, state } = data;
  if (!data.padlock || padlockState?.target === "carrier") return;

  // Steering IS the attitude ball. The text action strip that used to carry it printed the roll
  // error across the ball's horizon and was retired; a command to the pilot is graphical.
  const action = geometry.padlockAction;
  const director = geometry.padlockDirector;
  const radarAltFt = Number(state.radar_alt_ft);
  const sinkFpm = Number(state.vertical_speed_fpm);
  const pitchDeg = Number(state.pitch_deg);
  const urgentPull = state.auto_gcas_active === true
    || state.auto_gcas_warning === true
    || (radarAltFt < 2000 && (pitchDeg < -2 || sinkFpm < -1500))
    || (state.auto_gcas_available !== true && radarAltFt < 500 && sinkFpm < -1000);
  if (director || urgentPull) {
    check(name, "padlock shows the attitude instrument when steering is live",
      Boolean(geometry.padlockAttitude),
      geometry.padlockAttitude ? "adi" : "missing");
    check(name, "no text action strip covers the attitude ball", !action,
      action ? `${action.action} ${action.direction}` : "absent");
  }
  if (action) {
    const bankDeg = Number(state.bank_deg) || 0;
    const pitchDeg = Number(state.pitch_deg) || 0;
    check(name, "action strip bank and pitch are ownship truth",
      Math.abs(action.bankDeg - bankDeg) <= 1e-9
        && Math.abs(action.pitchDeg - pitchDeg) <= 1e-9,
      `bank ${action.bankDeg}/${bankDeg}; pitch ${action.pitchDeg}/${pitchDeg}`);
    check(name, "portrait-safe action label stays compact",
      /^T[12] · (?:ROLL [LR] \d+°|PULL(?: UP)?)$/.test(action.displayLabel ?? ""),
      `displayLabel=${JSON.stringify(action.displayLabel)}`);
  }

  if (urgentPull && action) {
    check(name, "ground/GCAS danger pre-empts combat steering with PULL UP",
      action.action === "PULL UP" && action.direction === "up",
      `action=${action.action}; direction=${action.direction}`);
  } else if (director && action && !director.captured && !director.anyPlane) {
    const expectedRollErrorRad = state.padlock_preferred_plane_valid === true
      ? Number(state.padlock_preferred_plane_deg) * DEG
      : probes.padlockRollErrorRad;
    const error = Math.abs(action.rollErrorRad - expectedRollErrorRad);
    const expectedDirection = expectedRollErrorRad >= 0 ? "right" : "left";
    check(name, state.padlock_preferred_plane_valid === true
      ? "action == kernel preferred-plane error"
      : "action == body-frame roll error (never mirrored)",
      error <= 1e-9,
      `error ${(error * RAD).toFixed(9)} deg`);
    check(name, "action names the correct roll direction once",
      action.direction === expectedDirection
        && action.action.startsWith(`ROLL ${expectedDirection.toUpperCase()}`),
      `action=${action.action}; direction=${action.direction}`);
  } else if (director && action && (director.captured || director.anyPlane)) {
    check(name, "captured/neutral director becomes one PULL command",
      action.action === "PULL" && action.direction === "up",
      `action=${action.action}; direction=${action.direction}`);
  }

  // AFT language remains body-relative but drops the verbose shoulder instruction.
  if (action && probes.padlockTargetForward < -0.17) {
    const ambiguous = Math.abs(probes.padlockTargetRight) < 0.05;
    const expectedShoulder = probes.padlockTargetRight >= 0 ? "R" : "L";
    check(name, "action strip names the correct aft side",
      typeof action.hemisphere === "string"
        && action.hemisphere.includes("AFT")
        && (ambiguous
          ? !/[LR]$/.test(action.hemisphere)
          : action.hemisphere.endsWith(expectedShoulder)),
      `hemisphere "${action.hemisphere}" for targetRight ${probes.padlockTargetRight.toFixed(3)}`);
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
  if (name.endsWith(":gcas-bottom-out-release")) {
    const bottomFt = Math.round(Number(state.gcas_last_flyup_bottom_ft));
    const marginFt = Math.round(Number(state.gcas_last_flyup_bottom_ft) - 100);
    const expected = `GCAS BOTTOM ${bottomFt} FT · `
      + `${marginFt >= 0 ? "+" : ""}${marginFt} VS 100 FT MSD`;
    check(name, "released fly-up shows its bottom and signed 100 FT MSD margin",
      state.auto_gcas_release_count === 1
        && state.gcas_flyup_count === 1
        && geometry.warningLine === expected,
      `warningLine=${JSON.stringify(geometry.warningLine)}; expected=${JSON.stringify(expected)}`);
  }
}

function assertBasicJobs(data) {
  const { name, geometry, probes, look, state } = data;
  const locator = geometry.banditLocator;
  const lookingOffAxis = Math.abs(Number(look?.yawDeg) || 0) > 1e-9
    || Math.abs(Number(look?.pitchDeg) || 0) > 1e-9;
  const selectedAlive = typeof state?.opponent_alive === "boolean"
    ? state.opponent_alive : state?.bandit_alive === true;
  if (lookingOffAxis && selectedAlive) {
    check(name, "look-offset target still has exactly one marker/locator job",
      Boolean(locator), locator ? "job recorded" : "missing");
  } else if (lookingOffAxis) {
    check(name, "look-offset frame without an opponent draws no ghost target job",
      !locator, locator ? "unexpected job" : "absent");
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
    if (!locator.bvrContact
        && geometry.banditPx && !geometry.banditPx.behind
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

// Counts frames where the speed-brake indicator was actually drawn. The harness `state` object is
// an explicit allowlist (harness.js), so a missing key would silently send every scenario down the
// "no capability" branch and turn this whole assertion green-but-vacuous. main() requires at least
// one real observation.
let speedBrakeVisibleObservations = 0;
let rapierMissionObservations = 0;

function assertSpeedBrake(data) {
  const { name, geometry, state, viewport } = data;
  const brake = geometry.speedBrake;

  if (state?.has_speed_brake !== true) {
    check(name, "no speed-brake indicator without the airframe capability",
      !brake || brake.visible === false,
      `speedBrake=${JSON.stringify(brake ?? null)}`);
    return;
  }

  // drawThrottle early-returns on has_engine === false, fuel_consumes === false or a non-finite
  // throttle, taking the whole PWR block with it. Absent geometry is therefore tolerated in this
  // branch too — but only as "nothing drawn", never as a pass for a commanded deployment.
  const commanded = Number(state.speed_brake);
  if (!brake) {
    check(name, "absent PWR block never hides a commanded speed brake",
      !(commanded > 0.02),
      `speed_brake=${commanded} with no geometry.speedBrake record`);
    return;
  }

  check(name, "speed-brake indicator tracks the projected deployment",
    Math.abs(brake.deployment - Math.min(1, Math.max(0, commanded))) < 1e-6,
    `indicator=${brake.deployment}; state=${commanded}`);
  check(name, "fully splayed speed brake annunciates SB",
    commanded < 0.9 || (brake.deployed === true && brake.text === "SB"),
    `deployed=${brake.deployed}; text=${brake.text}`);
  check(name, "stowed speed brake draws nothing",
    commanded > 0.02 || brake.visible === false,
    `visible=${brake.visible}`);

  // `drawn` is recorded INSIDE drawThrottle's canvas branch, so it is the only field here that
  // cannot be satisfied by the readout alone. Without it the whole block passed with every
  // stroke, fill and label deleted — verified by mutation during review, and the same shape of
  // hole that shipped visually broken pixels at Builds 60 and 62.
  if (commanded > 0.02) {
    check(name, "a commanded speed brake is actually stroked onto the canvas",
      brake.drawn === true,
      `drawn=${brake.drawn}; speed_brake=${commanded}`);
    check(name, "the splay bar fill length carries the deployment fraction",
      Math.abs(brake.fillWidth - (brake.width - 2) * brake.deployment) < 1e-6
        && brake.fillWidth > 0,
      `fillWidth=${brake.fillWidth}; width=${brake.width}; deployment=${brake.deployment}`);
    // Amber while travelling, green once fully out — the transit band is the whole point of the
    // indicator ("so I know it's working"), and nothing else pinned its colour or its glyph.
    const expectedText = brake.deployed ? "SB" : "SB\u2195";
    check(name, "travelling speed brake reads amber, fully splayed reads green",
      brake.color === (brake.deployed ? "#4dff88" : "#ffb020"),
      `color=${brake.color}; deployed=${brake.deployed}`);
    check(name, "the speed-brake glyph distinguishes travel from fully out",
      brake.text === expectedText,
      `text=${JSON.stringify(brake.text)}; expected=${JSON.stringify(expectedText)}`);
  }

  if (brake.visible !== true) return;
  speedBrakeVisibleObservations += 1;
  // The PWR rail sits at layout.tapeInset - 46, and tapeInset FLOORS at 48, so x is 2 at the
  // 430-wide portrait viewport. Anything drawn at a negative offset from the rail renders
  // entirely off-canvas on a phone while passing every landscape check.
  check(name, "speed-brake indicator stays inside the canvas",
    brake.x >= 0 && brake.width > 0 && brake.x + brake.width <= viewport.width,
    `x=${brake.x}; width=${brake.width}; viewportWidth=${viewport.width}`);
  check(name, "speed-brake indicator stays inside the canvas vertically",
    brake.y >= 0 && brake.height > 0 && brake.y + brake.height <= viewport.height,
    `y=${brake.y}; height=${brake.height}; viewportHeight=${viewport.height}`);
}

function assertRapierMission(data) {
  const { name, geometry, state, viewport } = data;
  if (state.rapier_mission_available !== true) return;
  if (data.profile !== "standard") return;
  rapierMissionObservations += 1;

  const line = geometry.rapierModeLine;
  check(name, "Rapier quiet mode line is drawn", Boolean(line?.text),
    line?.text ? line.text : "missing");
  if (!line) return;

  check(name, "Rapier mode line has empty detail (no triad essay)",
    line.detail === "" || line.detail == null,
    `detail=${JSON.stringify(line.detail)}`);
  check(name, "Rapier mode line stays inside the canvas",
    line.x >= 0 && line.y >= 0
      && line.x + line.width <= viewport.width
      && line.y + line.height <= viewport.height,
    `box=${line.x},${line.y} ${line.width}x${line.height}`);

  const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
  const circuits = state.rapier_pattern_only === true;
  const drones = Math.floor(Number(state.rapier_gun_drones_remaining) || 0);
  const gate = Math.floor(Number(state.rapier_recovery_gate) || 0);

  if (!circuits && phase === 10) {
    check(name, "attack mode line authorizes F swarm release",
      /F RELEASES SWARM/i.test(line.text) && line.text.includes(String(drones)),
      line.text);
    check(name, "attack level is attack (not buried under propulsion essay)",
      line.level === "attack", `level=${line.level}`);
  }
  if (!circuits && phase === 11) {
    check(name, "egress mode line is short EGRESS · HOME",
      /EGRESS/.test(line.text) && /HOME/.test(line.text) && !/NEED/.test(line.text),
      line.text);
  }
  if (!circuits && phase === 13) {
    check(name, "recovery mode line carries gate index",
      line.text.includes(`GATE ${gate}/4`),
      line.text);
  }

  const panel = geometry.limitsPanel;
  if (circuits) {
    check(name, "Circuits line is only authority plus current leg",
      line.text.endsWith(String(state.rapier_circuit_leg).replaceAll("_", " "))
        && !/CIRCUITS|HOOK|GEAR|ELEVONS|\d+ KT|\d+ FT/.test(line.text),
      line.text);
    check(name, "non-limiting Circuits fuel stays latent",
      !panel, panel ? `${panel.profile} rows=${panel.rows?.length}` : "absent");
    if (name.includes("rapier-circuits-downwind-verified")) {
      check(name, "verified Circuits configuration expires",
        !geometry.systemsPanel,
        geometry.systemsPanel ? "systems panel still drawn" : "absent");
    }
    if (name.includes("rapier-circuits-downwind-config-due")) {
      check(name, "configuration disagreement resurfaces VERIFY",
        Boolean(geometry.systemsPanel),
        geometry.systemsPanel ? "systems panel drawn" : "missing");
    }
    return;
  }

  const compact = panel?.compact === true;
  const expectedRows = compact ? 2 : 5;
  check(name, "Rapier Limits Panel is drawn (nav to strip)",
    panel?.profile === "nav" && Array.isArray(panel.rows)
      && panel.rows.length === expectedRows,
    panel ? `${panel.profile} rows=${panel.rows?.length}` : "missing");
  if (!panel || panel.profile !== "nav") return;

  if (compact) {
    check(name, "normal outbound Limits collapses to fuel plus arrival reserve",
      panel.rows[0].label === "FUEL" && /^ARR/.test(panel.rows[1].label),
      panel.rows.map((row) => row.label).join(" · "));
  } else {
    check(name, "expanded Limits slots are FUEL · NM/MIN · LB/MIN · LB/NM · ARR",
      panel.rows[0].label === "FUEL"
        && panel.rows[1].label === "NM/MIN"
        && panel.rows[2].label === "LB/MIN"
        && panel.rows[3].label === "LB/NM"
        && /^ARR/.test(panel.rows[4].label),
      panel.rows.map((row) => row.label).join(" · "));
  }
  check(name, "Limits panel stays inside the canvas",
    panel.x >= 0 && panel.y >= 0
      && panel.x + panel.width <= viewport.width
      && panel.y + panel.height <= viewport.height,
    `box=${panel.x},${panel.y} ${panel.width}x${panel.height}`);

  if (name.includes("rapier-escape-fuel-triad")) {
    check(name, "escape arrival fuel is fault when closure starves the ETA",
      panel.accent === "fault"
        && (panel.rows[4].label === "ARR DRY" || Number(panel.rows[4].value) < 0),
      `accent=${panel.accent}; arr=${panel.rows[4].label} ${panel.rows[4].value}`);
  }
}

function rectanglesOverlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function assertRapierPanelLayout(data) {
  if (!data.name.endsWith("rapier-ram-only-systems-layout")) return;
  const {
    rapierCycleTeach: cycle,
    gTape,
    systemsPanel: systems,
    limitsPanel: limits,
  } = data.geometry;
  // Attack phase: phase-aware HUD hides cycle teach and gear/systems; Limits + G remain.
  check(data.name, "limits panel is recorded", Boolean(limits),
    limits ? `box=${limits.x},${limits.y} ${limits.width}x${limits.height}` : "missing");
  check(data.name, "G tape is recorded", Boolean(gTape),
    gTape ? `box=${gTape.x},${gTape.y} ${gTape.width}x${gTape.height}` : "missing");
  check(data.name, "combined-cycle lesson stays off outside ascent",
    !cycle, cycle ? `unexpected box=${cycle.x},${cycle.y}` : "absent");
  check(data.name, "gear/systems panel stays off outside recovery",
    !systems, systems ? `unexpected box=${systems.x},${systems.y}` : "absent");
  if (limits && gTape) {
    check(data.name, "limits clears the G tape",
      !rectanglesOverlap(limits, gTape),
      `limits=${limits.y}; G=${gTape.y}`);
  }
}

function assertCarrierSortieRouteGuidance(data) {
  const { geometry, name } = data;
  const validAwaitingReturn = name.endsWith(":carrier-route-awaiting-return");
  const malformedActive = name.endsWith(":carrier-route-malformed-active");
  if (!validAwaitingReturn && !malformedActive) return;

  const route = geometry.carrierSortieRoute;
  const caret = geometry.carrierRouteCaret;
  if (validAwaitingReturn) {
    check(name, "valid carrier route draws its heading caret",
      caret?.drawn === true
        && caret.source === "carrier-route"
        && caret.phase === "AWAITING_RETURN",
      JSON.stringify(caret));
    check(name, "valid carrier route publishes route debug",
      route?.source === "carrier-route"
        && route.phase === "AWAITING_RETURN"
        && route.rtbActionRequired === true,
      JSON.stringify(route));
    check(name, "route debug text carries guidance and the keyboard RTB prompt",
      typeof route?.guidanceDirective === "string"
        && route.text?.includes(route.guidanceDirective) === true
        && route.keyboardPrompt === "PRESS O — RETURN TO SHIP"
        && route.text.includes("PRESS O — RETURN TO SHIP"),
      JSON.stringify(route?.text));
    check(name, "valid carrier route suppresses the generic boat caret",
      !geometry.boatRtbCaret, JSON.stringify(geometry.boatRtbCaret));
    check(name, "valid carrier route suppresses the generic RTB cue",
      !geometry.rtbCue, JSON.stringify(geometry.rtbCue));
    return;
  }

  check(name, "malformed active route publishes no route debug",
    !route, JSON.stringify(route));
  check(name, "malformed active route publishes no RTB prompt",
    route?.keyboardPrompt == null, JSON.stringify(route?.keyboardPrompt));
  check(name, "malformed active route draws no route caret",
    !caret, JSON.stringify(caret));
  check(name, "malformed active route keeps the generic boat caret suppressed",
    !geometry.boatRtbCaret, JSON.stringify(geometry.boatRtbCaret));
  check(name, "malformed active route keeps the generic RTB cue suppressed",
    !geometry.rtbCue, JSON.stringify(geometry.rtbCue));
}

function assertMobileTacticalHierarchy(data) {
  if (data.profile === "standard") return;
  const { geometry, name, viewport } = data;
  const rail = geometry.mobileTactical;
  check(name, "production mobile presentation profile reaches the HUD",
    geometry.presentationProfile === data.profile,
    `geometry=${geometry.presentationProfile}; requested=${data.profile}`);
  check(name, "mobile tactical rail is drawn", Boolean(rail),
    rail ? `${rail.actualText} / ${rail.contextText}` : "missing");
  if (!rail) return;
  if (data.largeText) {
    check(name, "large-interface text reaches the tactical rail",
      rail.fontSize === 11, `fontSize=${rail.fontSize}`);
  }
  const drawnRows = Object.fromEntries(
    (rail.drawnRows ?? []).map((row) => [row.key, row.text]),
  );
  const actualDrawn = drawnRows.actual ?? "";
  const contextDrawn = drawnRows.context ?? "";
  const directiveDrawn = drawnRows.directive ?? "";
  const helicopter = data.state?.heli_flight_path === true;
  check(name, "mobile rail paints every critical row without ellipsis",
    rail.drawnRows?.length > 0
      && rail.drawnRows.every((row) => !row.text.includes("…")),
    JSON.stringify(rail.drawnRows));
  check(name, "mobile rail carries actual speed and vertical state",
    helicopter
      ? /KIAS/.test(actualDrawn)
        && /(?:H\d{3}|·\d{3}·)/.test(actualDrawn)
        && /V\/S/.test(actualDrawn)
      : /KCAS|KIAS/.test(actualDrawn)
        && /(?:\d(?:\.\d)?K|FL\d{3})/.test(actualDrawn)
        && /(?:V\/S|↑|↓)/.test(actualDrawn),
    actualDrawn);
  check(name, "mobile rail carries authoritative ammunition in combat",
    helicopter
      || !/forward-level|gun-overheat|padlock-ground-warning|rapier-mobile-climb-bvr/.test(name)
      || /GUN\d+/.test(contextDrawn),
    contextDrawn);
  check(name, "mobile rail stays wholly on canvas",
    rail.x >= 0 && rail.y >= 0
      && rail.x + rail.width <= viewport.width
      && rail.y + rail.height <= viewport.height,
    `box=${rail.x},${rail.y} ${rail.width}x${rail.height}; viewport=${viewport.width}x${viewport.height}`);
  check(name, "desktop tapes and normal secondary cards stay off mobile",
    geometry.desktopFlightChrome === false
      && !geometry.limitsPanel
      && !geometry.systemsPanel
      && !geometry.rapierCycleTeach
      && !geometry.rapierModeLine,
    `desktop=${geometry.desktopFlightChrome}; limits=${Boolean(geometry.limitsPanel)}; `
      + `systems=${Boolean(geometry.systemsPanel)}; cycle=${Boolean(geometry.rapierCycleTeach)}; `
      + `mode=${Boolean(geometry.rapierModeLine)}`);
  check(name, "mobile ladder contains 10-degree majors only",
    geometry.ladderRungs.every((rung) => rung.deg % 10 === 0),
    geometry.ladderRungs.map((rung) => rung.deg).join(","));

  if (name.endsWith(":gun-overheat-latched")) {
    check(name, "mobile weapon line retains the qualified overheat state",
      /GUN\d+/.test(contextDrawn)
        && /OVERHEAT/.test(contextDrawn)
        && geometry.gunHeat?.integrated === true,
      `${contextDrawn}; gunHeat=${JSON.stringify(geometry.gunHeat)}`);
  }
  if (name.endsWith(":assisted-corner-hold")) {
    check(name, "portrait assistance mode remains explicit after tape removal",
      /AUTO(?: COR)?\+30/.test(actualDrawn),
      actualDrawn);
  }
  if (name.endsWith(":rapier-mobile-climb-bvr")) {
    check(name, "BVR target identity, range, closure, fuel, and fast time are explicit",
      actualDrawn.includes("×4")
        && /T1 160NM/.test(contextDrawn)
        && /CLOS916/.test(contextDrawn)
        && /F3\.5K/.test(contextDrawn),
      `${actualDrawn} / ${contextDrawn}`);
    check(name, "Rapier climb shows commanded Mach and flight level",
      /CMD M0\.90/.test(directiveDrawn)
        && /FL560/.test(directiveDrawn),
      directiveDrawn);
    check(name, "outbound BVR waypoint never becomes a recovery box",
      !geometry.recoveryGate,
      JSON.stringify(geometry.recoveryGate));
    check(name, "BVR contact gets a bearing locator, never a false visual bracket",
      geometry.banditLocator?.bvrContact === true
        && geometry.banditLocator?.markerInside === false
        && geometry.banditLocator?.arrowDrawn === true,
      JSON.stringify(geometry.banditLocator));
  }
  if (name.endsWith(":rapier-recovery-gate-2")) {
    check(name, "real recovery geometry survives mobile declutter",
      geometry.recoveryGate?.drawn === true,
      JSON.stringify(geometry.recoveryGate));
  }
}

// The portrait assisted mode is a first-class experience, so a phone-portrait pass runs the
// core scenarios through the SAME geometry contract at 430x860. The full battery stays on the
// landscape pass to bound gate time.
const PORTRAIT_SCENARIOS = new Set([
  "assisted-corner-hold",
  "cobra-forward-level", "cobra-forward-pitched",
  "forward-level", "forward-bandit-near-edge", "forward-bandit-offscreen",
  "forward-target-two-offscreen",
  "gun-overheat-latched", "gcas-bottom-out-release",
  "funnel-level-mid", "padlock-bandit-right-high", "padlock-bandit-behind",
  "padlock-aft-right-high", "padlock-target-two-roll-right",
  "idle-speed-brake-out", "idle-speed-brake-transit",
  "rapier-attack-authorize", "rapier-escape-fuel-triad",
  "rapier-ram-only-systems-layout",
]);

const MOBILE_SCENARIOS = new Set([
  "assisted-corner-hold",
  "cobra-forward-level",
  "cobra-forward-pitched",
  "forward-level",
  "gun-overheat-latched",
  "padlock-ground-warning",
  "rapier-mobile-climb-bvr",
  "rapier-recovery-gate-2",
]);

async function runViewport(site, browser, {
  label, width, height, subset, profile = "standard", largeText = false,
}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
  await page.goto(
    `${site.url}render/hud/tests/harness/harness.html?all=1&w=${width}&h=${height}&profile=${profile}`,
    { waitUntil: "load", timeout: 30000 },
  );
  await page.waitForFunction(() => window.__hudReady === "harness", { timeout: 15000 });
  if (largeText) {
    await page.evaluate(() =>
      document.documentElement.classList.add("large-interface-text"));
  }
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
    data.largeText = largeText;
    assertAirframeSymbols(data);
    assertLadder(data);
    assertFunnel(data);
    assertBandit(data);
    if (data.padlock) assertPadlockDirector(data);
    assertTargetTwoDirector(data);
    assertPresentationCaptureSequence(data);
    assertPadlockActionAndLocator(data);
    assertBasicJobs(data);
    assertGunHeat(data);
    assertSpeedBrake(data);
    assertRapierMission(data);
    assertRapierPanelLayout(data);
    assertCarrierSortieRouteGuidance(data);
    assertFunnelContainsTarget(data);
    assertWarningLine(data);
    assertMobileTacticalHierarchy(data);
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
    await runViewport(site, browser, {
      label: "mobile-portrait",
      width: 430,
      height: 860,
      subset: MOBILE_SCENARIOS,
      profile: "portrait_dual_stick",
    });
    await runViewport(site, browser, {
      label: "mobile-landscape",
      width: 844,
      height: 390,
      subset: MOBILE_SCENARIOS,
      profile: "touch_dual_stick",
    });
    await runViewport(site, browser, {
      label: "mobile-small-portrait",
      width: 320,
      height: 568,
      subset: MOBILE_SCENARIOS,
      profile: "portrait_dual_stick",
    });
    await runViewport(site, browser, {
      label: "mobile-small-portrait-large-text",
      width: 320,
      height: 568,
      subset: new Set(["assisted-corner-hold", "rapier-mobile-climb-bvr"]),
      profile: "portrait_dual_stick",
      largeText: true,
    });
  } finally {
    await browser.close();
    await site.close();
  }

  if (speedBrakeVisibleObservations === 0) {
    failures.push(
      "speed-brake assertions never saw a drawn indicator: the harness state allowlist or the "
      + "F-22 speed-brake scenarios are broken, so those checks passed vacuously",
    );
  }
  if (rapierMissionObservations === 0) {
    failures.push(
      "Rapier assertions never saw a mission scenario: harness state allowlist or the "
      + "P0 Rapier scenarios are broken, so those checks passed vacuously",
    );
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
