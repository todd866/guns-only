#!/usr/bin/env node

import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

const requireFromSmoke = createRequire(
  process.env.GUNS_SMOKE_PACKAGE
    ?? new URL("../../web/smoke/package.json", import.meta.url),
);
// RESOLVED ON FIRST LAUNCH, NOT AT IMPORT. This module is imported by its own unit tests, which
// exercise scoring and assessment logic and never open a browser, and by mission_ai_suite. CI's
// deterministic job deliberately does not install Playwright — it belongs to the browser stage —
// so importing it eagerly failed those tests with "Cannot find module 'playwright'" on a machine
// that was never going to need one. Only `launch` is used, so a lazy shim keeps every call site.
let playwrightChromium;
const chromium = {
  launch: (...args) =>
    (playwrightChromium ??= requireFromSmoke("playwright").chromium).launch(...args),
};

export const COBRA_AI_SAMPLE_MS = 100;
export const COBRA_AI_TARGET_SPEED_MPS = 28;
export const COBRA_AI_MIN_CLEARANCE_M = 24;
export const COBRA_AI_MAX_CLEARANCE_M = 56;
export const COBRA_AI_COMBAT_CLEARANCE_M = 60;
export const COBRA_AI_IRON_BELL_STANDOFF_M = 420;
export const COBRA_AI_REARM_APPROACH_CLEARANCE_M = 32;
export const COBRA_AI_REARM_SETTLE_CLEARANCE_M = 6;
export const COBRA_AI_RTB_FINAL_CLEARANCE_M = 4;
export const COBRA_AI_CAMP_EMBER_FINAL_HEADING_RAD = 300 * Math.PI / 180;
export const COBRA_AI_MAX_READY_MS = 8_000;
export const COBRA_AI_MAX_START_MS = 1_500;
export const COBRA_AI_SORTIE_MAX_SECONDS = 1_200;
export const COBRA_AI_MIN_FRIENDLY_BATTLE_SPAN_PX = 12;
export const COBRA_AI_MIN_HOSTILE_BATTLE_SPAN_PX = 8;
export const COBRA_AI_BATTLE_PIXEL_SEARCH_RADIUS_PX = 8;
export const COBRA_AI_BATTLE_FLASH_SEARCH_RADIUS_PX = 7;
export const COBRA_AI_MIN_P05_CLEARANCE_M = 18;
export const COBRA_AI_MAX_P95_CLEARANCE_M = 80;
export const COBRA_AI_GOALS = Object.freeze(["flight", "ingress", "engage", "sortie"]);
const GAMEPAD_DEADZONE = 0.12;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number(value) || 0));

export function wrapAngleRad(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cobraBattlePixelMatchesFaction(red, green, blue, faction) {
  const peak = Math.max(red, green, blue);
  if (peak < 120) return false;
  if (faction === "friendly") {
    // Production friendly fire is the lime pair #cfff78 / #e3ffb0. These relative-channel
    // tests survive additive blending and sRGB screenshot encoding without accepting white HUD
    // text or ordinary grey terrain.
    return green >= red + 8 && green >= blue + 25 && red >= blue + 15;
  }
  if (faction === "hostile") {
    // Production hostile fire is the orange pair #ff6330 / #ffad78.
    return red >= green + 25 && green >= blue + 8 && red >= blue + 45;
  }
  return false;
}

/**
 * Prove that a semantic production tracer is also present in a captured RGBA framebuffer.
 *
 * `probe` uses coordinates from the production camera projection and names the exact authority
 * event/faction. The scorer looks only in a narrow capsule around that projected moving dash and
 * at its muzzle flash. It cannot turn an authority event into pixels or grade an unrelated part
 * of the screenshot. This function is pure so synthetic pixel fixtures can exercise it without a
 * GPU browser.
 */
export function assessCobraBattleFramePixels(image, probe) {
  const width = Math.round(Number(image?.width));
  const height = Math.round(Number(image?.height));
  const data = image?.data;
  const faction = probe?.faction;
  const startX = Number(probe?.segment?.start?.x);
  const startY = Number(probe?.segment?.start?.y);
  const endX = Number(probe?.segment?.end?.x);
  const endY = Number(probe?.segment?.end?.y);
  const flashX = Number(probe?.flash?.x);
  const flashY = Number(probe?.flash?.y);
  const pixelScale = Number.isFinite(Number(probe?.pixelScale)) && Number(probe.pixelScale) > 0
    ? Number(probe.pixelScale)
    : 1;
  const tracerSearchRadiusPx = COBRA_AI_BATTLE_PIXEL_SEARCH_RADIUS_PX * pixelScale;
  const flashSearchRadiusPx = COBRA_AI_BATTLE_FLASH_SEARCH_RADIUS_PX * pixelScale;
  const failures = [];
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0
    || !data || Number(data.length) < width * height * 4) {
    failures.push("invalid RGBA framebuffer");
  }
  if (faction !== "friendly" && faction !== "hostile") {
    failures.push("unknown battle faction");
  }
  if (![startX, startY, endX, endY, flashX, flashY].every(Number.isFinite)) {
    failures.push("invalid projected battle probe");
  }
  if (failures.length) {
    return Object.freeze({
      pass: false,
      failures: Object.freeze(failures),
      metrics: Object.freeze({ matchedPixels: 0, oppositePixels: 0, streakPx: 0,
        flashMatchedPixels: 0, pixelScale }),
    });
  }

  const dx = endX - startX;
  const dy = endY - startY;
  const semanticSpanPx = Math.hypot(dx, dy);
  const minimumSemanticSpanPx = faction === "friendly"
    ? COBRA_AI_MIN_FRIENDLY_BATTLE_SPAN_PX * pixelScale
    : COBRA_AI_MIN_HOSTILE_BATTLE_SPAN_PX * pixelScale;
  if (semanticSpanPx < minimumSemanticSpanPx) {
    failures.push(
      `${faction} projected span ${semanticSpanPx.toFixed(1)} px < `
      + `${minimumSemanticSpanPx} px`,
    );
  }
  const spanSquared = semanticSpanPx * semanticSpanPx;
  const bins = new Uint8Array(Math.max(1, Math.ceil(semanticSpanPx)));
  let matchedPixels = 0;
  let oppositePixels = 0;
  let flashMatchedPixels = 0;
  const oppositeFaction = faction === "friendly" ? "hostile" : "friendly";
  const minX = Math.max(0, Math.floor(Math.min(startX, endX, flashX)
    - tracerSearchRadiusPx));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(startX, endX, flashX)
    + tracerSearchRadiusPx));
  const minY = Math.max(0, Math.floor(Math.min(startY, endY, flashY)
    - tracerSearchRadiusPx));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(startY, endY, flashY)
    + tracerSearchRadiusPx));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const pixelX = x + 0.5;
      const pixelY = y + 0.5;
      const along = spanSquared > 1e-6
        ? ((pixelX - startX) * dx + (pixelY - startY) * dy) / spanSquared
        : 0;
      const clampedAlong = Math.max(0, Math.min(1, along));
      const nearestX = startX + dx * clampedAlong;
      const nearestY = startY + dy * clampedAlong;
      const distanceToSegmentPx = Math.hypot(pixelX - nearestX, pixelY - nearestY);
      const distanceToFlashPx = Math.hypot(pixelX - flashX, pixelY - flashY);
      if (distanceToSegmentPx > tracerSearchRadiusPx
        && distanceToFlashPx > flashSearchRadiusPx) continue;
      const offset = (y * width + x) * 4;
      const red = Number(data[offset]);
      const green = Number(data[offset + 1]);
      const blue = Number(data[offset + 2]);
      const expectedMatch = cobraBattlePixelMatchesFaction(red, green, blue, faction);
      const oppositeMatch = cobraBattlePixelMatchesFaction(red, green, blue, oppositeFaction);
      if (distanceToSegmentPx <= tracerSearchRadiusPx
        && along >= 0 && along <= 1) {
        if (expectedMatch) {
          matchedPixels += 1;
          bins[Math.min(bins.length - 1, Math.floor(clampedAlong * bins.length))] = 1;
        }
        if (oppositeMatch) oppositePixels += 1;
      }
      if (distanceToFlashPx <= flashSearchRadiusPx && expectedMatch) {
        flashMatchedPixels += 1;
      }
    }
  }

  // A readable tracer is a continuous streak, not two coincidental same-hue pixels at opposite
  // ends of a vegetation patch. One empty one-pixel bin is tolerated for antialiasing.
  let longestRunBins = 0;
  let currentRunBins = 0;
  let singleGapAvailable = true;
  for (const occupied of bins) {
    if (occupied) {
      currentRunBins += 1;
      longestRunBins = Math.max(longestRunBins, currentRunBins);
      continue;
    }
    if (currentRunBins > 0 && singleGapAvailable) {
      currentRunBins += 1;
      singleGapAvailable = false;
      continue;
    }
    currentRunBins = 0;
    singleGapAvailable = true;
  }
  const streakPx = Math.min(semanticSpanPx, longestRunBins);
  const minimumMatchedPixels = Math.max(4, Math.ceil(minimumSemanticSpanPx * 0.5));
  const minimumStreakPx = minimumSemanticSpanPx * 0.55;
  if (matchedPixels < minimumMatchedPixels) {
    failures.push(
      `${faction} framebuffer pixels ${matchedPixels} < ${minimumMatchedPixels}`,
    );
  }
  if (streakPx < minimumStreakPx) {
    failures.push(
      `${faction} framebuffer streak ${streakPx.toFixed(1)} px < `
      + `${minimumStreakPx.toFixed(1)} px`,
    );
  }
  if (flashMatchedPixels < 1) failures.push(`${faction} muzzle flash absent from framebuffer`);
  if (oppositePixels > matchedPixels) {
    failures.push(`${faction} framebuffer probe is dominated by ${oppositeFaction} colour`);
  }
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      semanticSpanPx,
      pixelScale,
      matchedPixels,
      oppositePixels,
      streakPx,
      flashMatchedPixels,
    }),
  });
}

function percentile(values, fraction) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function orderedActsVisited(samples, requiredActs = []) {
  const acts = [];
  for (const sample of samples ?? []) {
    const act = String(sample?.act ?? "").toLowerCase();
    if (act && acts.at(-1) !== act) acts.push(act);
  }
  let cursor = 0;
  for (const required of requiredActs) {
    const wanted = String(required).toLowerCase();
    while (cursor < acts.length && acts[cursor] !== wanted) cursor++;
    if (cursor >= acts.length) return { pass: false, acts };
    cursor++;
  }
  return { pass: true, acts };
}

export function activeCobraPathGate(authority) {
  const gates = Array.isArray(authority?.path_gates) ? authority.path_gates : [];
  return gates.find((gate) => gate?.active === true)
    ?? gates[Math.max(0, Math.min(gates.length - 1,
      Math.round(finite(authority?.route_guidance?.segment_index, 0))))]
    ?? null;
}

function cobraFobTarget(authority) {
  const fob = authority?.ground_war?.fob;
  const eastM = optionalFinite(fob?.x_m);
  const northM = optionalFinite(fob?.z_m);
  const upM = optionalFinite(fob?.y_m);
  if ([eastM, northM, upM].some((value) => value === null)) return null;
  return {
    east_m: eastM,
    north_m: northM,
    up_m: upM,
    half_m: Math.max(28, finite(fob?.radius_m, 80)),
  };
}

function cobraFobRangeM(authority, fob) {
  const published = optionalFinite(authority?.ground_war?.fob_range_m);
  if (published !== null) return Math.max(0, published);
  const vehicle = authority?.vehicle;
  return Math.hypot(
    finite(vehicle?.x_m) - finite(fob?.east_m),
    finite(vehicle?.z_m) - finite(fob?.north_m),
  );
}

function cobraCampEmberFinalHeadingRad(authority) {
  const gates = Array.isArray(authority?.path_gates) ? authority.path_gates : [];
  const from = gates.at(-2);
  const to = gates.at(-1);
  const eastM = Number(to?.east_m) - Number(from?.east_m);
  const northM = Number(to?.north_m) - Number(from?.north_m);
  return Number.isFinite(eastM) && Number.isFinite(northM)
      && Math.hypot(eastM, northM) > 1
    ? Math.atan2(eastM, northM)
    : COBRA_AI_CAMP_EMBER_FINAL_HEADING_RAD;
}

export function cobraAiFireIntent(authority, target = cobraAiFlightTarget(authority)) {
  const act = String(authority?.mission_act ?? "").toLowerCase();
  const ammoRemaining = optionalFinite(authority?.ground_war?.ammo_remaining);
  const selectedTargetId = authority?.gunner?.selected_target_id;
  const selectedTarget = (authority?.ground_war?.units ?? []).find(
    (unit) => unit?.id === selectedTargetId,
  );
  return (act === "engage" || act === "hold")
    && target?.mode === "combat"
    && authority?.ground_war?.ammo_dry !== true
    && (ammoRemaining === null || ammoRemaining > 0)
    && typeof selectedTargetId === "string"
    && selectedTargetId.length > 0
    && selectedTarget?.alive === true
    && selectedTarget?.faction !== "friendly";
}

/**
 * Production gates own Depart, Ingress and the Camp Ember arrival. Combat uses a fixed safe
 * standoff; a dry magazine overrides that hold with an explicit FOB rearm approach. The final
 * arrival and rearm settle target the sim's real service/recovery volumes rather than the route
 * controller's normal 24-metre clearance floor.
 */
export function cobraAiFlightTarget(authority) {
  const act = String(authority?.mission_act ?? "").toLowerCase();
  const fob = cobraFobTarget(authority);
  if (act === "rtb") {
    const gate = activeCobraPathGate(authority);
    const gates = Array.isArray(authority?.path_gates) ? authority.path_gates : [];
    const activeGateIndex = gates.findIndex((candidate) => candidate?.active === true);
    const fobRangeM = fob ? cobraFobRangeM(authority, fob) : Number.POSITIVE_INFINITY;
    const finalApproach = fob
      && activeGateIndex >= 0
      && activeGateIndex === gates.length - 1
      && fobRangeM <= Math.max(220, fob.half_m * 2.5);
    if (finalApproach) {
      return {
        ...fob,
        up_m: fob.up_m + COBRA_AI_RTB_FINAL_CLEARANCE_M,
        target_clearance_m: COBRA_AI_RTB_FINAL_CLEARANCE_M,
        heading_rad: cobraCampEmberFinalHeadingRad(authority),
        active: true,
        mode: "rtb-final",
      };
    }
    if (gate) {
      return {
        ...gate,
        target_clearance_m: clamp(
          finite(authority?.route_guidance?.target_agl_m, 38),
          COBRA_AI_MIN_CLEARANCE_M,
          COBRA_AI_MAX_CLEARANCE_M,
        ),
        active: true,
        mode: "rtb-arrival",
      };
    }
  }

  const ammoRemaining = optionalFinite(authority?.ground_war?.ammo_remaining);
  const ammoDry = authority?.ground_war?.ammo_dry === true
    || (ammoRemaining !== null && ammoRemaining <= 0);
  if ((act === "engage" || act === "hold") && ammoDry && fob) {
    const fobRangeM = cobraFobRangeM(authority, fob);
    const settle = fobRangeM <= Math.max(220, fob.half_m * 2.5);
    const targetClearanceM = settle
      ? COBRA_AI_REARM_SETTLE_CLEARANCE_M
      : COBRA_AI_REARM_APPROACH_CLEARANCE_M;
    return {
      ...fob,
      up_m: fob.up_m + targetClearanceM,
      target_clearance_m: targetClearanceM,
      heading_rad: settle ? COBRA_AI_CAMP_EMBER_FINAL_HEADING_RAD : undefined,
      active: true,
      mode: settle ? "rearm-settle" : "rearm-approach",
    };
  }

  if (act === "engage" || act === "hold") {
    const sites = Array.isArray(authority?.ground_war?.sites)
      ? authority.ground_war.sites
      : [];
    const site = sites.find((candidate) => candidate?.owner === "hostile");
    const eastM = Number(site?.x_m);
    const northM = Number(site?.z_m);
    const upM = Number(site?.y_m);
    if ([eastM, northM].every(Number.isFinite)) {
      const ironBell = String(site?.id ?? "").includes("iron-bell");
      const fob = authority?.ground_war?.fob;
      const fobEastM = Number(fob?.x_m);
      const fobNorthM = Number(fob?.z_m);
      const fromSiteEastM = Number.isFinite(fobEastM) ? fobEastM - eastM : 0;
      const fromSiteNorthM = Number.isFinite(fobNorthM) ? fobNorthM - northM : -1;
      const fromSiteLengthM = Math.max(1, Math.hypot(fromSiteEastM, fromSiteNorthM));
      // Iron Bell has a surveyed clear attack hover directly south of the bridge. It is the same
      // 420 m geometry exercised by the production crew-chain test. Other objectives fall back
      // to a stable FOB-side offset rather than a ring that moves every frame with the aircraft.
      const attackEastM = ironBell
        ? eastM
        : eastM + fromSiteEastM / fromSiteLengthM * COBRA_AI_IRON_BELL_STANDOFF_M;
      const attackNorthM = ironBell
        ? northM - COBRA_AI_IRON_BELL_STANDOFF_M
        : northM + fromSiteNorthM / fromSiteLengthM * COBRA_AI_IRON_BELL_STANDOFF_M;
      const selectedId = authority?.gunner?.selected_target_id;
      const selected = (authority?.ground_war?.units ?? []).find(
        (unit) => unit?.id === selectedId && unit?.alive === true,
      );
      return {
        east_m: attackEastM,
        north_m: attackNorthM,
        up_m: Number.isFinite(upM)
          ? upM + COBRA_AI_COMBAT_CLEARANCE_M + 10
          : Number(authority?.vehicle?.y_m),
        aim_east_m: Number.isFinite(Number(selected?.x_m)) ? Number(selected.x_m) : eastM,
        aim_north_m: Number.isFinite(Number(selected?.z_m)) ? Number(selected.z_m) : northM,
        half_m: 90,
        active: true,
        mode: "combat",
        site_id: site.id ?? null,
      };
    }
  }
  const gate = activeCobraPathGate(authority);
  return gate ? { ...gate, mode: "route" } : null;
}

/**
 * Closed-loop route pilot. Outputs physical stick positions plus collective-lever rate in the
 * same command sense consumed by cobraGamepadControlAxes.
 */
export function cobraAiPilotCommand(authority) {
  const vehicle = authority?.vehicle;
  if (!vehicle) throw new TypeError("Cobra AI pilot requires vehicle authority");
  const gate = cobraAiFlightTarget(authority);
  if (!gate) throw new TypeError("Cobra AI pilot requires an active path gate");

  const eastM = finite(vehicle.x_m);
  const northM = finite(vehicle.z_m);
  const deltaEastM = finite(gate.east_m) - eastM;
  const deltaNorthM = finite(gate.north_m) - northM;
  const gateRangeM = Math.hypot(deltaEastM, deltaNorthM);
  const bearingRad = Math.atan2(deltaEastM, deltaNorthM);
  const guidanceHeadingRad = Number.isFinite(Number(gate.heading_rad))
    ? Number(gate.heading_rad)
    : bearingRad;
  const aimBearingRad = gate.mode === "combat"
    ? Math.atan2(
      finite(gate.aim_east_m, finite(gate.east_m)) - eastM,
      finite(gate.aim_north_m, finite(gate.north_m)) - northM,
    )
    : bearingRad;
  const headingErrorRad = wrapAngleRad(guidanceHeadingRad - finite(vehicle.yaw_rad));
  const aimHeadingErrorRad = wrapAngleRad(aimBearingRad - finite(vehicle.yaw_rad));
  const speedMps = Math.max(
    0,
    finite(vehicle.directional_air_speed_mps, finite(vehicle.ground_speed_mps)),
  );

  const clearanceM = finite(authority?.route_guidance?.current_clearance_m);
  const targetClearanceM = Number.isFinite(Number(gate.target_clearance_m))
    ? Math.max(0, Number(gate.target_clearance_m))
    : gate.mode === "combat"
      ? COBRA_AI_COMBAT_CLEARANCE_M
      : clamp(
        finite(authority?.route_guidance?.target_agl_m, 38),
        COBRA_AI_MIN_CLEARANCE_M,
        COBRA_AI_MAX_CLEARANCE_M,
      );
  const verticalSpeedMps = finite(vehicle.vertical_speed_mps);
  const gateAltitudeErrorM = finite(gate.up_m, finite(vehicle.y_m)) - finite(vehicle.y_m);
  const clearanceErrorM = targetClearanceM - clearanceM;
  // Absolute gate height teaches the route profile; AGL truth keeps that profile from dragging
  // the ship hundreds of feet above a descending valley floor. Limit gate authority to an
  // 18-metre window around the authored clearance error so both constraints stay meaningful.
  const verticalErrorM = clamp(
    gateAltitudeErrorM,
    clearanceErrorM - 18,
    clearanceErrorM + 18,
  );
  const precisionLanding = gate.mode === "rearm-settle" || gate.mode === "rtb-final";
  const desiredVerticalSpeedMps = clamp(
    verticalErrorM * 0.12,
    gate.mode === "rtb-final" ? -0.75 : gate.mode === "rearm-settle" ? -0.9 : -3.4,
    precisionLanding ? 1.2 : 3.6,
  );
  // Effective translational lift reduces the collective needed to hold height. Without this
  // feed-forward term, a controller tuned at hover climbs out of the nap band at cruise.
  const hoverCollective = 0.575 - clamp(speedMps * 0.0048, 0, 0.14);
  const targetCollective = clamp(
    // The previous 0.025 feed-forward almost exactly cancelled the descent command at cruise,
    // leaving the harness level at 120+ m AGL while the route descended beneath it. Give the
    // authored vertical-speed command enough authority to follow the valley without relying on
    // a slowly accumulated altitude error.
    hoverCollective + desiredVerticalSpeedMps * 0.06 - verticalSpeedMps * 0.018,
    0.24,
    0.74,
  );
  const collectiveRate = clamp(
    (targetCollective - finite(vehicle.collective)) * 5.5,
    -1,
    1,
  );

  const turnSpeedFactor = clamp(1 - Math.abs(headingErrorRad) / 1.35, 0.25, 1);
  const desiredSpeedMps = precisionLanding
    ? Math.min(
      clearanceM < 12 ? 1.4 : 6,
      gateRangeM * 0.035,
    ) * turnSpeedFactor
    : gate.mode === "rearm-approach"
      ? clamp(gateRangeM * 0.045, 6, 24) * turnSpeedFactor
      : gate.mode === "rtb-arrival"
        ? clamp(gateRangeM * 0.06, 7, 24) * turnSpeedFactor
        : clearanceM < 12
          ? 2
          : gate.mode === "combat"
            ? clamp(gateRangeM * 0.055, 0, 22) * turnSpeedFactor
            : COBRA_AI_TARGET_SPEED_MPS * turnSpeedFactor;
  const velocityEastMps = finite(vehicle.velocity_x_mps);
  const velocityNorthMps = finite(vehicle.velocity_z_mps);
  const yawRad = finite(vehicle.yaw_rad);
  const forwardSpeedMps = velocityEastMps * Math.sin(yawRad)
    + velocityNorthMps * Math.cos(yawRad);
  const rightSpeedMps = velocityEastMps * Math.cos(yawRad)
    - velocityNorthMps * Math.sin(yawRad);
  const desiredVelocityEastMps = Math.sin(bearingRad) * desiredSpeedMps;
  const desiredVelocityNorthMps = Math.cos(bearingRad) * desiredSpeedMps;
  const desiredForwardSpeedMps = desiredVelocityEastMps * Math.sin(yawRad)
    + desiredVelocityNorthMps * Math.cos(yawRad);
  const desiredRightSpeedMps = desiredVelocityEastMps * Math.cos(yawRad)
    - desiredVelocityNorthMps * Math.sin(yawRad);
  // AH-1G pitch is positive nose-up. Positive forward cyclic commands nose-down.
  const desiredPitchRad = clamp(
    (gate.mode === "combat" || precisionLanding
      ? forwardSpeedMps - desiredForwardSpeedMps
      : speedMps - desiredSpeedMps) * 0.012,
    -0.20,
    0.12,
  );
  const forwardCyclic = clamp(
    (finite(vehicle.pitch_rad) - desiredPitchRad) * 2.0,
    -0.52,
    0.52,
  );

  // Close combat is a helicopter position hold, not an aeroplane orbit. World-velocity error is
  // transformed into the current body frame so the ship can brake lateral drift while keeping
  // the gunner's target in the broad M28 turret arc.
  const desiredRollRad = gate.mode === "combat" || precisionLanding
    ? clamp((desiredRightSpeedMps - rightSpeedMps) * 0.035, -0.30, 0.30)
    : clamp(headingErrorRad * 0.48, -0.34, 0.34);
  const rollRateRadS = finite(vehicle?.rotorcraft?.body_roll_rate_rad_s);
  const rightCyclic = clamp(
    (desiredRollRad - finite(vehicle.roll_rad)) * 1.75 - rollRateRadS * 0.30,
    -0.58,
    0.58,
  );
  const yaw = clamp(
    (gate.mode === "combat" ? aimHeadingErrorRad : headingErrorRad) * 0.82
      - finite(vehicle.yaw_rate_rad_s) * 0.32,
    -0.66,
    0.66,
  );

  return Object.freeze({
    collectiveRate,
    forwardCyclic,
    rightCyclic,
    yaw,
    fireIntent: cobraAiFireIntent(authority, gate),
    target: Object.freeze({
      gateRangeM,
      bearingRad,
      headingErrorRad,
      guidanceHeadingRad,
      aimBearingRad,
      aimHeadingErrorRad,
      targetClearanceM,
      targetAltitudeM: finite(gate.up_m),
      verticalErrorM,
      desiredSpeedMps,
      desiredForwardSpeedMps,
      desiredRightSpeedMps,
      desiredVerticalSpeedMps,
      targetCollective,
      mode: gate.mode,
      siteId: gate.site_id ?? null,
    }),
  });
}

/** Undo the standard-pad deadzone so production receives the controller's requested stick. */
export function rawGamepadAxis(value, deadzone = GAMEPAD_DEADZONE) {
  const axis = clamp(value, -1, 1);
  if (Math.abs(axis) < 1e-6) return 0;
  return Math.sign(axis) * (deadzone + Math.abs(axis) * (1 - deadzone));
}

/**
 * Pure keyboard decision for the browser runner. Fire follows the controller's current intent,
 * rather than latching when combat first starts, so a dry magazine, dead target, rearm leg or RTB
 * releases F on the very sample that changes the authority state.
 */
export function cobraAiRunnerCombatDecision({
  goal,
  sample,
  command,
  fireHeld = false,
  targetAttemptDue = false,
} = {}) {
  const controlsCombat = goal === "engage" || goal === "sortie";
  const targetMode = command?.target?.mode ?? null;
  const selectedTargetReady = typeof sample?.selectedTargetId === "string"
    && sample.selectedTargetId.length > 0
    && sample?.selectedTargetAlive === true;
  const selectTarget = controlsCombat
    && targetMode === "combat"
    && !selectedTargetReady
    && targetAttemptDue === true;
  const desiredFireHeld = controlsCombat && command?.fireIntent === true;
  const fireKeyAction = desiredFireHeld === fireHeld
    ? null
    : desiredFireHeld ? "down" : "up";
  return Object.freeze({
    selectTarget,
    desiredFireHeld,
    fireKeyAction,
  });
}

export function cobraAiGoalDurationSeconds(goal, requestedSeconds = null) {
  if (!COBRA_AI_GOALS.includes(goal)) throw new TypeError(`Unknown Cobra AI goal '${goal}'`);
  const requested = Number(requestedSeconds);
  if (Number.isFinite(requested) && requested > 0) return requested;
  if (goal === "sortie") return COBRA_AI_SORTIE_MAX_SECONDS;
  if (goal === "engage") return 260;
  if (goal === "ingress") return 95;
  return 55;
}

export function assessCobraAiFlight(samples, {
  minimumProgressM = 450,
  minimumAirborneSeconds = 20,
  minimumGateAdvances = 3,
  minimumGateEntries = 0,
  requiredActs = [],
  minimumAuthorityRateHz = 90,
  maximumAuthorityStallSeconds = 0.6,
  maximumP95ClearanceM = COBRA_AI_MAX_P95_CLEARANCE_M,
  minimumP05ClearanceM = COBRA_AI_MIN_P05_CLEARANCE_M,
  readyMs = null,
  startLatencyMs = null,
  requireLowSpeedLensEvidence = false,
  allowTerminalState = false,
} = {}) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return Object.freeze({ pass: false, failures: ["insufficient flight samples"], metrics: {} });
  }
  const first = samples[0];
  const last = samples.at(-1);
  const firstTerminalIndex = samples.findIndex((sample) => sample.status !== "active");
  // The runner may wait up to five seconds after authority freezes for the terminal debrief to
  // paint. Keep that presentation evidence in the tape, but grade cadence only through the first
  // terminal sample; a deliberate frozen debrief is not a mid-flight authority stall.
  const cadenceSamples = allowTerminalState && firstTerminalIndex >= 0
    ? samples.slice(0, firstTerminalIndex + 1)
    : samples;
  const cadenceFirst = cadenceSamples[0];
  const cadenceLast = cadenceSamples.at(-1);
  const active = samples.filter((sample) => sample.status === "active");
  const flyable = samples.filter((sample) => sample.flyable === true);
  const airborne = samples.filter((sample) => sample.clearanceM >= 10);
  const initialRemainingM = finite(first.remainingM);
  const finalRemainingM = finite(last.remainingM);
  const routeProgressM = initialRemainingM - finalRemainingM;
  const horizontalDisplacementM = Math.hypot(
    finite(last.xM) - finite(first.xM),
    finite(last.zM) - finite(first.zM),
  );
  let cumulativeHorizontalTravelM = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    const deltaEastM = Number(current.xM) - Number(previous.xM);
    const deltaNorthM = Number(current.zM) - Number(previous.zM);
    if (Number.isFinite(deltaEastM) && Number.isFinite(deltaNorthM)) {
      cumulativeHorizontalTravelM += Math.hypot(deltaEastM, deltaNorthM);
    }
  }
  // During Depart, route_guidance.remaining_m is projected onto the downstream gorge lane and
  // can increase while the aircraft correctly flies Camp Ember's connector. A full sortie also
  // returns to its origin, making start/end displacement nearly zero. Integrated travel remains
  // meaningful through both cases without confusing a successful recovery for no movement.
  const progressM = Math.max(routeProgressM, horizontalDisplacementM, cumulativeHorizontalTravelM);
  const durationSeconds = Math.max(
    0,
    finite(cadenceLast?.wallS) - finite(cadenceFirst?.wallS),
  );
  let airborneSeconds = 0;
  let authorityAdvancingSeconds = 0;
  let currentAuthorityStallSeconds = 0;
  let maximumAuthorityStallObservedSeconds = 0;
  for (let index = 1; index < cadenceSamples.length; index++) {
    const previous = cadenceSamples[index - 1];
    const current = cadenceSamples[index];
    const intervalSeconds = Math.max(0, finite(current.wallS) - finite(previous.wallS));
    const previousTick = Number(previous.authorityTick);
    const currentTick = Number(current.authorityTick);
    const authorityAdvanced = Number.isFinite(previousTick) && Number.isFinite(currentTick)
      && currentTick > previousTick;
    if (authorityAdvanced) {
      authorityAdvancingSeconds += intervalSeconds;
      currentAuthorityStallSeconds = 0;
      if (finite(current.clearanceM) >= 10) airborneSeconds += intervalSeconds;
    } else {
      currentAuthorityStallSeconds += intervalSeconds;
      maximumAuthorityStallObservedSeconds = Math.max(
        maximumAuthorityStallObservedSeconds,
        currentAuthorityStallSeconds,
      );
    }
  }
  const initialAuthorityTick = Number(cadenceFirst?.authorityTick);
  const finalAuthorityTick = Number(cadenceLast?.authorityTick);
  const authorityTickSpan = Number.isFinite(initialAuthorityTick)
    && Number.isFinite(finalAuthorityTick)
    ? finalAuthorityTick - initialAuthorityTick
    : 0;
  const authorityRateHz = durationSeconds > 0 ? authorityTickSpan / durationSeconds : 0;
  const authorityAdvanceFraction = durationSeconds > 0
    ? authorityAdvancingSeconds / durationSeconds
    : 0;
  const validGateSamples = samples.filter((sample) =>
    Number.isInteger(sample.activeGateIndex) && sample.activeGateIndex >= 0);
  const gateSequence = [];
  for (const sample of validGateSamples) {
    const previous = gateSequence.at(-1);
    if (!previous || previous.index !== sample.activeGateIndex || previous.act !== sample.act) {
      gateSequence.push({ index: sample.activeGateIndex, act: sample.act });
    }
  }
  let gateAdvances = 0;
  let gateRegressions = 0;
  for (let index = 1; index < gateSequence.length; index++) {
    const previous = gateSequence[index - 1];
    const current = gateSequence[index];
    if (current.act !== previous.act) continue;
    if (current.index > previous.index) gateAdvances++;
    else if (current.index < previous.index) gateRegressions++;
  }
  const gateCount = new Set(validGateSamples.map((sample) => sample.activeGateIndex)).size;
  const enteredGateKeys = new Set(samples.filter((sample) =>
    Number.isFinite(Number(sample.activeGateDistanceM))
      && Number.isFinite(Number(sample.activeGateRadiusM))
      && Number(sample.activeGateDistanceM) <= Number(sample.activeGateRadiusM))
    .map((sample) => `${sample.act}:${sample.activeGateIndex}`));
  const gateEntries = enteredGateKeys.size;
  const validGateFraction = validGateSamples.length / samples.length;
  const insideCorridorFraction = samples.filter((sample) => sample.insideCorridor).length
    / samples.length;
  // `route_guidance` always describes the selected outbound canyon route. RTB owns a different,
  // authority-authored Camp Ember arrival and is graded by its path gates, not this stale corridor.
  const ingressSamples = samples.filter((sample) => sample.act === "ingress");
  const routePhaseCorridorFraction = ingressSamples.length
    ? ingressSamples.filter((sample) => sample.insideCorridor).length
      / ingressSamples.length
    : null;
  const maximumAbsRollDeg = Math.max(...samples.map((sample) =>
    Math.abs(finite(sample.rollRad)) * 180 / Math.PI));
  const minimumClearanceM = airborne.length
    ? Math.min(...airborne.map((sample) => finite(sample.clearanceM)))
    : 0;
  const maximumClearanceM = airborne.length
    ? Math.max(...airborne.map((sample) => finite(sample.clearanceM)))
    : 0;
  const p95ClearanceM = percentile(airborne.map((sample) => sample.clearanceM), 0.95);
  const napBandStartIndex = samples.findIndex((sample) =>
    finite(sample.clearanceM) >= COBRA_AI_MIN_CLEARANCE_M);
  const napBandSamples = napBandStartIndex >= 0
    ? samples.slice(napBandStartIndex).filter((sample) =>
      sample.status === "active"
        && sample.pilotMode !== "rearm-settle"
        && sample.pilotMode !== "rtb-final"
        && Number.isFinite(Number(sample.clearanceM)))
    : [];
  const p05ClearanceM = napBandSamples.length
    ? percentile(napBandSamples.map((sample) => sample.clearanceM), 0.05)
    : null;
  const finalGateAltitudeErrorM = Math.abs(
    finite(last.activeGateUpM, finite(last.yM)) - finite(last.yM),
  );
  const lensSamples = samples.filter((sample) =>
    Number.isFinite(Number(sample.cockpitFovDeg)) && sample.cockpitLensActive === true);
  const lowSpeedLensSamples = lensSamples.filter((sample) =>
    finite(sample.groundSpeedMps, Number.POSITIVE_INFINITY) <= 3);
  const cruiseLensSamples = lensSamples.filter((sample) =>
    finite(sample.groundSpeedMps, Number.NEGATIVE_INFINITY) >= 26);
  const maximumLowSpeedFovDeg = lowSpeedLensSamples.length
    ? Math.max(...lowSpeedLensSamples.map((sample) => finite(sample.cockpitFovDeg)))
    : null;
  const minimumCruiseFovDeg = cruiseLensSamples.length
    ? Math.min(...cruiseLensSamples.map((sample) => finite(sample.cockpitFovDeg)))
    : null;
  const failures = [];
  if (!allowTerminalState && active.length !== samples.length) {
    failures.push("sortie left active state");
  } else if (allowTerminalState && firstTerminalIndex >= 0
    && samples.slice(firstTerminalIndex).some((sample) => sample.status === "active")) {
    failures.push("sortie resumed active state after reaching a terminal state");
  }
  if (flyable.length !== samples.length) failures.push("airframe became un-flyable");
  if (progressM < minimumProgressM) {
    failures.push(`route progress ${progressM.toFixed(0)} m < ${minimumProgressM} m`);
  }
  if (gateCount < 2) failures.push("AI pilot did not advance an active route gate");
  if (gateAdvances < minimumGateAdvances) {
    failures.push(`active gates advanced ${gateAdvances} < ${minimumGateAdvances}`);
  }
  if (gateEntries < minimumGateEntries) {
    failures.push(`route gate volumes entered ${gateEntries} < ${minimumGateEntries}`);
  }
  if (gateRegressions > 0) failures.push("active gate sequence regressed");
  if (validGateFraction < 0.98) failures.push("active path gate disappeared during flight");
  if (airborneSeconds < minimumAirborneSeconds) {
    failures.push(`airborne ${airborneSeconds.toFixed(1)} s < ${minimumAirborneSeconds} s`);
  }
  if (maximumAbsRollDeg > 58) {
    failures.push(`bank reached ${maximumAbsRollDeg.toFixed(1)}°`);
  }
  if (p95ClearanceM > maximumP95ClearanceM) {
    failures.push(`p95 clearance ${p95ClearanceM.toFixed(1)} m > ${maximumP95ClearanceM} m`);
  }
  if (p05ClearanceM === null) {
    failures.push("AI pilot never established the nap-of-earth clearance band");
  } else if (p05ClearanceM < minimumP05ClearanceM) {
    failures.push(`p05 clearance ${p05ClearanceM.toFixed(1)} m < ${minimumP05ClearanceM} m`);
  }
  if (last.contactFailureCause && last.contactFailureCause !== "none") {
    failures.push(`contact failure: ${last.contactFailureCause}`);
  }
  if (authorityRateHz < minimumAuthorityRateHz) {
    failures.push(`authority rate ${authorityRateHz.toFixed(1)} Hz < ${minimumAuthorityRateHz} Hz`);
  }
  if (authorityAdvanceFraction < 0.9) {
    failures.push(`authority advanced for only ${(authorityAdvanceFraction * 100).toFixed(1)}%`);
  }
  if (maximumAuthorityStallObservedSeconds > maximumAuthorityStallSeconds) {
    failures.push(
      `authority stalled for ${maximumAuthorityStallObservedSeconds.toFixed(1)} s`,
    );
  }
  if (samples.some((sample) => sample.briefHidden !== true)) {
    failures.push("mission brief covered the cockpit during flight");
  }
  if (samples.some((sample) => sample.paused === true)) failures.push("sortie paused during flight");
  if (samples.some((sample) => sample.visibilityState !== "visible")) {
    failures.push("flight page lost foreground visibility");
  }
  if (samples.some((sample) => sample.gamepadConnected !== true)) {
    failures.push("AI gamepad disconnected during flight");
  }
  if (requireLowSpeedLensEvidence) {
    if (lensSamples.length < samples.length * 0.95) {
      failures.push("live Cobra camera did not publish continuous lens evidence");
    }
    if (maximumLowSpeedFovDeg === null || maximumLowSpeedFovDeg < 68) {
      failures.push(`low-speed cockpit widened only to ${maximumLowSpeedFovDeg ?? "missing"}°`);
    }
    if (cruiseLensSamples.length && minimumCruiseFovDeg > 60.5) {
      failures.push(`cruise cockpit remained over-wide at ${minimumCruiseFovDeg.toFixed(1)}°`);
    }
    if (lensSamples.some((sample) =>
      Math.abs(finite(sample.cockpitOpticalCenterX01)) > 1e-6
        || Math.abs(finite(sample.cockpitOpticalCenterY01)) > 1e-6)) {
      failures.push("low-speed lens moved the nose-forward optical center");
    }
  }
  if (routePhaseCorridorFraction !== null && routePhaseCorridorFraction < 0.5) {
    failures.push(
      `route corridor occupancy ${(routePhaseCorridorFraction * 100).toFixed(1)}% < 50%`,
    );
  }
  const actVisit = orderedActsVisited(samples, requiredActs);
  if (!actVisit.pass) {
    failures.push(`mission acts ${actVisit.acts.join(" → ")} did not reach ${requiredActs.join(" → ")}`);
  }
  if (Number.isFinite(Number(readyMs)) && Number(readyMs) > COBRA_AI_MAX_READY_MS) {
    failures.push(`Ready ${Number(readyMs).toFixed(0)} ms > ${COBRA_AI_MAX_READY_MS} ms`);
  }
  if (Number.isFinite(Number(startLatencyMs))
    && Number(startLatencyMs) > COBRA_AI_MAX_START_MS) {
    failures.push(
      `Start response ${Number(startLatencyMs).toFixed(0)} ms > ${COBRA_AI_MAX_START_MS} ms`,
    );
  }
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      progressM,
      airborneSeconds,
      gateCount,
      gateAdvances,
      gateRegressions,
      gateEntries,
      actSequence: Object.freeze(actVisit.acts),
      validGateFraction,
      insideCorridorFraction,
      routePhaseCorridorFraction,
      authorityTickSpan,
      authorityRateHz,
      authorityAdvanceFraction,
      maximumAuthorityStallSeconds: maximumAuthorityStallObservedSeconds,
      durationSeconds,
      readyMs,
      startLatencyMs,
      maximumAbsRollDeg,
      minimumClearanceM,
      maximumClearanceM,
      p05ClearanceM,
      p95ClearanceM,
      finalGateAltitudeErrorM,
      initialRemainingM,
      finalRemainingM,
      routeProgressM,
      horizontalDisplacementM,
      cumulativeHorizontalTravelM,
      finalAct: last.act,
      maximumLowSpeedFovDeg,
      minimumCruiseFovDeg,
    }),
  });
}

export function assessCobraAiEngagement(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return Object.freeze({ pass: false, failures: ["insufficient engagement samples"], metrics: {} });
  }
  const failures = [];
  const ammoSamples = samples.map((sample) => Number(sample.ammoRemaining))
    .filter(Number.isFinite);
  const initialAmmo = ammoSamples[0] ?? 0;
  const minimumAmmo = ammoSamples.length ? Math.min(...ammoSamples) : initialAmmo;
  const roundsExpended = Math.max(0, initialAmmo - minimumAmmo);
  const firstIngress = samples.find((sample) => sample.act === "ingress") ?? null;
  const firstEngage = samples.find((sample) => sample.act === "engage" || sample.act === "hold")
    ?? null;
  const firstAuthorized = samples.find((sample) => sample.fireAuthorized === true) ?? null;
  const visibleBattle = samples.find((sample) => sample.battleEvidenceVisible === true) ?? null;
  const visibleBattleFactions = new Set(samples
    .filter((sample) => sample.battleEvidenceVisible === true)
    .map((sample) => sample.battleEvidenceFaction));
  const maximumFriendlyBattleSpanPx = Math.max(0, ...samples
    .filter((sample) => sample.battleEvidenceFaction === "friendly")
    .map((sample) => finite(sample.battleEvidenceSpanPx)));
  const maximumHostileBattleSpanPx = Math.max(0, ...samples
    .filter((sample) => sample.battleEvidenceFaction === "hostile")
    .map((sample) => finite(sample.battleEvidenceSpanPx)));
  const validFramebufferBattleSample = (sample) => {
    const faction = sample.battlePixelEvidenceFaction;
    const pixelScale = optionalFinite(sample.battlePixelScale) > 0
      ? Number(sample.battlePixelScale)
      : 1;
    const minimumSpanPx = faction === "friendly"
      ? COBRA_AI_MIN_FRIENDLY_BATTLE_SPAN_PX * pixelScale
      : faction === "hostile"
        ? COBRA_AI_MIN_HOSTILE_BATTLE_SPAN_PX * pixelScale
        : Number.POSITIVE_INFINITY;
    return sample.battlePixelEvidenceVisible === true
      && finite(sample.battlePixelMatchedPixels) >= Math.max(4, Math.ceil(minimumSpanPx * 0.5))
      && finite(sample.battlePixelStreakPx) >= minimumSpanPx * 0.55
      && finite(sample.battlePixelFlashMatchedPixels) >= 1
      && finite(sample.battlePixelOppositePixels) <= finite(sample.battlePixelMatchedPixels);
  };
  const firstFramebufferBattle = samples.find(validFramebufferBattleSample) ?? null;
  const framebufferBattleFactions = new Set(samples
    .filter(validFramebufferBattleSample)
    .map((sample) => sample.battlePixelEvidenceFaction));
  const maximumFriendlyBattlePixelStreakPx = Math.max(0, ...samples
    .filter((sample) => sample.battlePixelEvidenceFaction === "friendly")
    .map((sample) => finite(sample.battlePixelStreakPx)));
  const maximumHostileBattlePixelStreakPx = Math.max(0, ...samples
    .filter((sample) => sample.battlePixelEvidenceFaction === "hostile")
    .map((sample) => finite(sample.battlePixelStreakPx)));
  const selected = samples.find((sample) => typeof sample.selectedTargetId === "string"
    && sample.selectedTargetId.length > 0) ?? null;
  const selectedIndex = selected ? samples.indexOf(selected) : -1;
  const triggerStartIndex = selectedIndex >= 0
    ? samples.findIndex((sample, index) => index >= selectedIndex
      && sample.selectedTargetId === selected.selectedTargetId
      && (sample.fireKeyAction === "down" || sample.fireHeld === true))
    : -1;
  const triggerBaselineIndex = triggerStartIndex >= 0 ? triggerStartIndex : selectedIndex;
  const hitTickBeforeTrigger = triggerBaselineIndex >= selectedIndex && selectedIndex >= 0
    ? Math.max(Number.NEGATIVE_INFINITY, ...samples
      .slice(selectedIndex, triggerBaselineIndex + 1)
      .filter((sample) => sample.selectedTargetId === selected.selectedTargetId)
      .map((sample) => optionalFinite(sample.selectedTargetGunHitTick))
      .filter((tick) => tick !== null))
    : Number.NEGATIVE_INFINITY;
  const firstSelectedGunHit = triggerBaselineIndex >= 0
    ? samples.slice(triggerBaselineIndex + 1).find((sample) => {
      const tick = optionalFinite(sample.selectedTargetGunHitTick);
      return sample.selectedTargetId === selected.selectedTargetId
        && tick !== null
        && tick > hitTickBeforeTrigger;
    }) ?? null
    : null;
  const selectedHealthSamples = selectedIndex >= 0
    ? samples.slice(selectedIndex)
      .filter((sample) => sample.selectedTargetHealth !== null
        && sample.selectedTargetHealth !== undefined)
      .map((sample) => Number(sample.selectedTargetHealth))
      .filter(Number.isFinite)
    : [];
  const initialSelectedHealth = selectedHealthSamples[0] ?? 0;
  const minimumSelectedHealth = selectedHealthSamples.length
    ? Math.min(...selectedHealthSamples)
    : initialSelectedHealth;
  const selectedTargetDamage = Math.max(0, initialSelectedHealth - minimumSelectedHealth);
  const prematureBursts = samples.filter((sample) =>
    sample.act === "depart" && finite(sample.threatBurstsFired) > 0);
  const maximumFriendlyKills = Math.max(...samples.map((sample) => finite(sample.friendlyKills)));
  const publishedHostileUnitCounts = samples
    .map((sample) => optionalFinite(sample.hostileUnitCount))
    .filter((count) => count !== null);
  const maximumHostileUnitCount = publishedHostileUnitCounts.length
    ? Math.max(...publishedHostileUnitCounts)
    : null;
  const hostileHealthSamples = samples
    .filter((sample) => {
      const total = optionalFinite(sample.hostileHealthTotal);
      if (total === null) return false;
      const count = optionalFinite(sample.hostileUnitCount);
      return maximumHostileUnitCount === null || count === maximumHostileUnitCount;
    })
    .map((sample) => Number(sample.hostileHealthTotal));
  const initialHostileHealth = hostileHealthSamples[0] ?? 0;
  const minimumHostileHealth = hostileHealthSamples.length
    ? Math.min(...hostileHealthSamples)
    : initialHostileHealth;
  const hostileDamage = Math.max(0, initialHostileHealth - minimumHostileHealth);
  const stableCombatGuidance = firstEngage
    ? samples.filter((sample) => sample.wallS >= firstEngage.wallS + 1
      && (sample.act === "engage" || sample.act === "hold")
      && sample.guidanceVisible === true)
    : [];
  const guidanceRebuildCountsByObjective = new Map();
  for (const sample of stableCombatGuidance) {
    const rebuildCount = Number(sample.guidanceRebuildCount);
    if (!Number.isFinite(rebuildCount)) continue;
    const objectiveId = sample.objectiveSiteId ?? "unscoped-objective";
    const counts = guidanceRebuildCountsByObjective.get(objectiveId) ?? [];
    counts.push(rebuildCount);
    guidanceRebuildCountsByObjective.set(objectiveId, counts);
  }
  const guidanceRebuildSpans = [...guidanceRebuildCountsByObjective.values()]
    .map((counts) => Math.max(...counts) - Math.min(...counts));
  const combatGuidanceRebuildSpan = guidanceRebuildSpans.length
    ? Math.max(...guidanceRebuildSpans)
    : null;

  const actVisit = orderedActsVisited(samples, ["depart", "ingress", "engage"]);
  if (!actVisit.pass) failures.push("sortie did not reach the fight through Depart → Ingress → Engage");
  if (!samples.some((sample) => sample.combatLive === true)) {
    failures.push("ground battle never became live");
  }
  if (!selected) failures.push("production Tab path never selected a hostile");
  if (triggerStartIndex < 0) failures.push("production trigger path never held fire on the selected target");
  if (!firstAuthorized) failures.push("production gunner never authorized fire");
  if (roundsExpended < 1) failures.push("production gun path expended no ammunition");
  if (!firstSelectedGunHit) failures.push("authority emitted no player gun-hit on the selected target");
  if (selectedTargetDamage <= 0) failures.push("selected target took no player-gun damage");
  if (hostileDamage <= 0) failures.push("no hostile health loss observed during engagement");
  if (!visibleBattle) failures.push("no live ground exchange was visible in the cockpit");
  if (!visibleBattleFactions.has("friendly")) failures.push("friendly ground fire was never visible");
  if (!visibleBattleFactions.has("hostile")) failures.push("hostile ground fire was never visible");
  if (!firstFramebufferBattle) {
    failures.push("no authority-backed ground exchange produced readable framebuffer pixels");
  }
  if (!framebufferBattleFactions.has("friendly")) {
    failures.push("friendly ground fire was not proven in the framebuffer");
  }
  if (!framebufferBattleFactions.has("hostile")) {
    failures.push("hostile ground fire was not proven in the framebuffer");
  }
  if (maximumFriendlyBattleSpanPx < COBRA_AI_MIN_FRIENDLY_BATTLE_SPAN_PX) {
    failures.push(
      `friendly tracer span ${maximumFriendlyBattleSpanPx.toFixed(1)} px < `
      + `${COBRA_AI_MIN_FRIENDLY_BATTLE_SPAN_PX} px`,
    );
  }
  if (maximumHostileBattleSpanPx < COBRA_AI_MIN_HOSTILE_BATTLE_SPAN_PX) {
    failures.push(
      `hostile tracer span ${maximumHostileBattleSpanPx.toFixed(1)} px < `
      + `${COBRA_AI_MIN_HOSTILE_BATTLE_SPAN_PX} px`,
    );
  }
  if (maximumFriendlyKills > 0) failures.push("engagement caused a friendly kill");
  if (prematureBursts.length) failures.push("hostile air fire opened during protected departure");
  if (stableCombatGuidance.length < 2) failures.push("fixed combat guidance was not observable");
  if (combatGuidanceRebuildSpan !== null && combatGuidanceRebuildSpan > 0) {
    failures.push("combat chevrons rebuilt while the objective was unchanged");
  }
  if (stableCombatGuidance.some((sample) => sample.guidanceTimeDriven === true)) {
    failures.push("combat chevrons retained a time-driven shader animation");
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      actSequence: Object.freeze(actVisit.acts),
      timeToIngressSeconds: firstIngress?.wallS ?? null,
      timeToEngageSeconds: firstEngage?.wallS ?? null,
      timeToFireSeconds: firstAuthorized?.wallS ?? null,
      timeToPlayerGunHitSeconds: firstSelectedGunHit?.wallS ?? null,
      timeToVisibleBattleSeconds: visibleBattle?.wallS ?? null,
      timeToFramebufferBattleSeconds: firstFramebufferBattle?.wallS ?? null,
      maximumFriendlyBattleSpanPx,
      maximumHostileBattleSpanPx,
      maximumFriendlyBattlePixelStreakPx,
      maximumHostileBattlePixelStreakPx,
      roundsExpended,
      selectedTargetDamage,
      hostileDamage,
      maximumHostileUnitCount,
      hostileHealthSamples: hostileHealthSamples.length,
      maximumFriendlyKills,
      prematureDepartureBursts: prematureBursts.length,
      combatGuidanceSamples: stableCombatGuidance.length,
      combatGuidanceRebuildSpan,
    }),
  });
}

/** Full Hold the Bridge acceptance: fight, rearm, win the ground war and recover at Camp Ember. */
export function assessCobraAiSortie(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return Object.freeze({ pass: false, failures: ["insufficient sortie samples"], metrics: {} });
  }
  const failures = [];
  const last = samples.at(-1);
  const terminal = [...samples].reverse().find((sample) => sample.status !== "active") ?? last;
  const requiredActs = ["depart", "ingress", "engage", "hold", "rtb", "complete"];
  const actVisit = orderedActsVisited(samples, requiredActs);
  const pilotModes = [];
  const ownershipSignatures = [];
  for (const sample of samples) {
    if (sample.pilotMode && pilotModes.at(-1) !== sample.pilotMode) {
      pilotModes.push(sample.pilotMode);
    }
    if (sample.siteOwnershipSignature
      && ownershipSignatures.at(-1) !== sample.siteOwnershipSignature) {
      ownershipSignatures.push(sample.siteOwnershipSignature);
    }
  }

  const friendlyPointSamples = samples.map((sample) => Number(sample.friendlyPoints))
    .filter(Number.isFinite);
  const hostilePointSamples = samples.map((sample) => Number(sample.hostilePoints))
    .filter(Number.isFinite);
  const initialFriendlyPoints = friendlyPointSamples[0] ?? 0;
  const maximumFriendlyPoints = friendlyPointSamples.length
    ? Math.max(...friendlyPointSamples)
    : 0;
  const finalFriendlyPoints = friendlyPointSamples.at(-1) ?? 0;
  const initialHostilePoints = hostilePointSamples[0] ?? 0;
  const minimumHostilePoints = hostilePointSamples.length
    ? Math.min(...hostilePointSamples)
    : 0;
  const finalHostilePoints = hostilePointSamples.at(-1) ?? 0;
  const maximumFobRearms = Math.max(0, ...samples.map((sample) => finite(sample.fobRearms)));
  const ammoDryIndex = samples.findIndex((sample) => sample.ammoDry === true);
  const firstRearmIndex = samples.findIndex((sample) => finite(sample.fobRearms) > 0);
  const firstRtb = samples.find((sample) => sample.act === "rtb") ?? null;
  const firstComplete = samples.find((sample) => sample.act === "complete") ?? null;
  const firstHold = samples.find((sample) => sample.act === "hold") ?? null;
  const terminalFobRangeM = optionalFinite(terminal.fobRangeM);
  const terminalClearanceM = optionalFinite(terminal.clearanceM);
  const minimumRtbFobRangeM = Math.min(
    Number.POSITIVE_INFINITY,
    ...samples.filter((sample) => sample.act === "rtb" || sample.act === "complete")
      .map((sample) => optionalFinite(sample.fobRangeM))
      .filter((value) => value !== null),
  );
  const unsafeFireHeld = samples.filter((sample) => sample.fireHeld === true && !(
    sample.pilotFireIntent === true
      && sample.pilotMode === "combat"
      && (sample.act === "engage" || sample.act === "hold")
      && sample.selectedTargetAlive === true
      && finite(sample.ammoRemaining) > 0
  ));
  const audioSamples = samples.filter((sample) => sample.audioQaSilent !== null
    && sample.audioQaSilent !== undefined);
  const audioSignalSamples = audioSamples.filter((sample) => sample.audioSignalActive === true);
  const unexpectedAudibleSamples = audioSamples.filter((sample) => sample.audioAudible === true);

  if (!actVisit.pass) {
    failures.push(`mission acts ${actVisit.acts.join(" → ")} did not reach ${requiredActs.join(" → ")}`);
  }
  if (maximumFriendlyPoints <= initialFriendlyPoints || ownershipSignatures.length < 2) {
    failures.push("conquest ownership never moved toward friendly control");
  }
  if (ammoDryIndex < 0) failures.push("full sortie never exercised the dry-magazine branch");
  if (maximumFobRearms < 1 || firstRearmIndex < 0) {
    failures.push("full sortie did not rearm at Camp Ember");
  } else if (ammoDryIndex >= 0 && firstRearmIndex <= ammoDryIndex) {
    failures.push("FOB rearm was not observed after the magazine ran dry");
  }
  for (const mode of ["rearm-approach", "rearm-settle", "rtb-arrival", "rtb-final"]) {
    if (!pilotModes.includes(mode)) failures.push(`pilot never entered ${mode}`);
  }
  if (unsafeFireHeld.length) {
    failures.push(`fire remained held outside valid combat for ${unsafeFireHeld.length} samples`);
  }
  if (terminal.status !== "victory") {
    failures.push(`terminal status was ${terminal.status ?? "missing"}, not victory`);
  }
  if (terminal.missionOutcome !== "victory" || terminal.debriefMissionOutcome !== "victory") {
    failures.push("authoritative ground-war/debrief outcome was not victory");
  }
  if (terminal.debriefVisible !== true) failures.push("terminal debrief never became visible");
  if (terminalFobRangeM === null || terminalFobRangeM > 70) {
    failures.push(`terminal FOB range ${terminalFobRangeM?.toFixed(1) ?? "missing"} m > 70 m`);
  }
  if (terminalClearanceM === null || terminalClearanceM > 12) {
    failures.push(`terminal clearance ${terminalClearanceM?.toFixed(1) ?? "missing"} m > 12 m`);
  }
  if (terminal.contactKind !== "stable-surface-contact") {
    failures.push(`terminal contact was ${terminal.contactKind ?? "missing"}, not stable surface contact`);
  }
  if (!audioSamples.length) failures.push("shared flight-audio diagnostics were never published");
  if (audioSamples.some((sample) => sample.audioQaSilent !== true)) {
    failures.push("silent QA mode was not retained for the full sortie");
  }
  if (!audioSignalSamples.length) failures.push("shared audio graph never produced a live signal");
  if (!audioSamples.some((sample) => sample.audioOutputMode === "silent-qa")) {
    failures.push("shared audio graph never reached silent-qa output mode");
  }
  if (unexpectedAudibleSamples.length) {
    failures.push(`silent QA leaked ${unexpectedAudibleSamples.length} audible samples`);
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      actSequence: Object.freeze(actVisit.acts),
      pilotModeSequence: Object.freeze(pilotModes),
      siteOwnershipTransitions: Math.max(0, ownershipSignatures.length - 1),
      initialFriendlyPoints,
      maximumFriendlyPoints,
      finalFriendlyPoints,
      initialHostilePoints,
      minimumHostilePoints,
      finalHostilePoints,
      maximumFobRearms,
      timeToAmmoDrySeconds: ammoDryIndex >= 0 ? samples[ammoDryIndex].wallS : null,
      timeToFirstRearmSeconds: firstRearmIndex >= 0 ? samples[firstRearmIndex].wallS : null,
      timeToHoldSeconds: firstHold?.wallS ?? null,
      timeToRtbSeconds: firstRtb?.wallS ?? null,
      timeToCompleteSeconds: firstComplete?.wallS ?? null,
      minimumRtbFobRangeM: Number.isFinite(minimumRtbFobRangeM)
        ? minimumRtbFobRangeM
        : null,
      terminalFobRangeM,
      terminalClearanceM,
      terminalContactKind: terminal.contactKind ?? null,
      terminalStatus: terminal.status ?? null,
      missionOutcome: terminal.missionOutcome ?? null,
      debriefMissionOutcome: terminal.debriefMissionOutcome ?? null,
      debriefVisible: terminal.debriefVisible === true,
      fireHeldSamples: samples.filter((sample) => sample.fireHeld === true).length,
      unsafeFireHeldSamples: unsafeFireHeld.length,
      audioSignalSamples: audioSignalSamples.length,
      unexpectedAudibleSamples: unexpectedAudibleSamples.length,
    }),
  });
}

export function assessCobraFlightTelemetry(diagnostics, samples = []) {
  const telemetry = diagnostics ?? {};
  const failures = [];
  const minimumTick = Number(telemetry.telemetryMinimumCobraAuthorityTick);
  const maximumTick = Number(telemetry.telemetryMaximumCobraAuthorityTick);
  const telemetryTickSpan = Number.isFinite(minimumTick) && Number.isFinite(maximumTick)
    ? maximumTick - minimumTick
    : 0;
  const lastSampleTick = Number(samples.at(-1)?.authorityTick);
  if (finite(telemetry.telemetryRequests) < 1) failures.push("no telemetry request received");
  if (finite(telemetry.telemetryHeaderRows) < 1) failures.push("telemetry header missing");
  if (finite(telemetry.telemetryCobraSessions) !== 1) {
    failures.push("telemetry did not identify one Cobra session");
  }
  if (finite(telemetry.telemetryCobraStateRows) < 10) {
    failures.push("fewer than 10 Cobra state rows received");
  }
  if (telemetryTickSpan < 120) failures.push("telemetry authority tick did not advance by 120");
  if (Number.isFinite(lastSampleTick) && Number.isFinite(maximumTick)
    && maximumTick < lastSampleTick - 900) {
    failures.push("telemetry trail is more than 7.5 seconds behind the flight");
  }
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({ telemetryTickSpan }),
  });
}

const FAKE_PAD_SOURCE = () => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const pad = {
    id: "Guns Only AI Flight Harness",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  };
  globalThis.__gunsOnlyAiPad = pad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};

function argvFlag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

async function readFlightSample(page, startedAtMs) {
  return page.evaluate((startMs) => {
    const state = globalThis.__gunsOnlyCobraAuthority;
    const vehicle = state?.vehicle;
    const war = state?.ground_war;
    const selectedTargetId = state?.gunner?.selected_target_id ?? null;
    const gates = Array.isArray(state?.path_gates) ? state.path_gates : [];
    const activeGateIndex = gates.findIndex((gate) => gate?.active === true);
    const activeGate = activeGateIndex >= 0 ? gates[activeGateIndex] : null;
    const activeGateRangeM = activeGate
      ? Math.hypot(
        Number(activeGate.east_m) - Number(vehicle?.x_m),
        Number(activeGate.north_m) - Number(vehicle?.z_m),
      )
      : null;
    const activeGateAltitudeErrorM = activeGate
      ? Number(activeGate.up_m) - Number(vehicle?.y_m)
      : null;
    const activeGateDistanceM = Number.isFinite(activeGateRangeM)
        && Number.isFinite(activeGateAltitudeErrorM)
      ? Math.hypot(activeGateRangeM, activeGateAltitudeErrorM)
      : null;
    let battleEvidenceVisible = false;
    let battleEvidenceTick = null;
    let battleEvidenceFaction = null;
    let battleEvidenceSpanPx = 0;
    let battleEvidenceProbe = null;
    const cameraQa = globalThis.__gunsOnlyCobraLabCamera;
    const sites = Array.isArray(war?.sites) ? war.sites.filter(Boolean) : [];
    const events = Array.isArray(war?.events) ? [...war.events].reverse() : [];
    const latestFobRearmEvent = events.find((event) => event?.kind === "fob-rearm") ?? null;
    const selectedTargetGunHitEvent = selectedTargetId
      ? events.find((event) => event?.kind === "gun-hit"
        && event?.unit_id === selectedTargetId) ?? null
      : null;
    for (const event of events) {
      if (event?.kind !== "small-arms") continue;
      const evidence = cameraQa?.renderedBattleEvidence?.(
        event.site_id,
        event.tick,
        event.unit_id,
      );
      if (!evidence?.sourceFlash || !Array.isArray(evidence?.tracer?.segments)) continue;
      const flash = cameraQa.projectSimPointToScreen(
        evidence.sourceFlash.x_m,
        evidence.sourceFlash.y_m,
        evidence.sourceFlash.z_m,
      );
      let eventProbe = null;
      for (const segment of evidence.tracer.segments) {
        const start = cameraQa.projectSimPointToScreen(
          segment.start.x_m,
          segment.start.y_m,
          segment.start.z_m,
        );
        const end = cameraQa.projectSimPointToScreen(
          segment.end.x_m,
          segment.end.y_m,
          segment.end.z_m,
        );
        const spanPx = Math.hypot(end.x - start.x, end.y - start.y);
        if (flash.inFrame && start.inFrame && end.inFrame && spanPx >= 6
          && (!eventProbe || spanPx > eventProbe.spanPx)) {
          eventProbe = {
            faction: evidence.faction,
            tick: Number(evidence.tick),
            viewportWidthPx: window.innerWidth,
            viewportHeightPx: window.innerHeight,
            flash: { x: Number(flash.x), y: Number(flash.y) },
            segment: {
              start: { x: Number(start.x), y: Number(start.y) },
              end: { x: Number(end.x), y: Number(end.y) },
            },
            spanPx,
          };
        }
      }
      if (eventProbe) {
        battleEvidenceVisible = true;
        battleEvidenceTick = evidence.tick;
        battleEvidenceFaction = evidence.faction;
        battleEvidenceSpanPx = eventProbe.spanPx;
        battleEvidenceProbe = eventProbe;
        break;
      }
    }
    const hostileUnits = Array.isArray(war?.units)
      ? war.units.filter((unit) => unit?.faction === "hostile")
      : [];
    const nullableNumber = (value) => value === null || value === undefined
      ? null
      : Number.isFinite(Number(value)) ? Number(value) : null;
    const selectedTarget = Array.isArray(war?.units)
      ? war.units.find((unit) => unit?.id === selectedTargetId) ?? null
      : null;
    const objectiveSite = sites.find((site) => site?.owner === "hostile") ?? null;
    const ownershipSites = [...sites].sort((left, right) =>
      String(left?.id ?? "").localeCompare(String(right?.id ?? "")));
    const friendlyPoints = sites.filter((site) => site?.owner === "friendly").length;
    const hostilePoints = sites.filter((site) => site?.owner === "hostile").length;
    const audioRoot = document.documentElement;
    const guidanceEvidence = cameraQa?.fixedGuidanceEvidence?.() ?? null;
    const lensEvidence = cameraQa?.cockpitLensEvidence?.() ?? null;
    // Do not return the full authority object: its rolling events and unit arrays make a long
    // sortie tape grow without bound. This is the complete, bounded subset consumed by the pilot.
    const pilotAuthority = {
      mission_act: state?.mission_act ?? null,
      path_gates: gates.map((gate) => ({
        east_m: gate?.east_m,
        up_m: gate?.up_m,
        north_m: gate?.north_m,
        half_m: gate?.half_m,
        active: gate?.active === true,
      })),
      route_guidance: {
        current_clearance_m: state?.route_guidance?.current_clearance_m,
        target_agl_m: state?.route_guidance?.target_agl_m,
        segment_index: state?.route_guidance?.segment_index,
      },
      vehicle: {
        x_m: vehicle?.x_m,
        y_m: vehicle?.y_m,
        z_m: vehicle?.z_m,
        yaw_rad: vehicle?.yaw_rad,
        yaw_rate_rad_s: vehicle?.yaw_rate_rad_s,
        roll_rad: vehicle?.roll_rad,
        pitch_rad: vehicle?.pitch_rad,
        ground_speed_mps: vehicle?.ground_speed_mps,
        directional_air_speed_mps: vehicle?.directional_air_speed_mps,
        vertical_speed_mps: vehicle?.vertical_speed_mps,
        velocity_x_mps: vehicle?.velocity_x_mps,
        velocity_z_mps: vehicle?.velocity_z_mps,
        collective: vehicle?.collective,
        rotorcraft: {
          body_roll_rate_rad_s: vehicle?.rotorcraft?.body_roll_rate_rad_s,
        },
      },
      ground_war: {
        ammo_remaining: war?.ammo_remaining,
        ammo_dry: war?.ammo_dry === true,
        fob_range_m: war?.fob_range_m,
        fob: war?.fob ? {
          x_m: war.fob.x_m,
          y_m: war.fob.y_m,
          z_m: war.fob.z_m,
          radius_m: war.fob.radius_m,
        } : null,
        sites: sites.map((site) => ({
          id: site?.id,
          owner: site?.owner,
          x_m: site?.x_m,
          y_m: site?.y_m,
          z_m: site?.z_m,
        })),
        units: selectedTarget ? [{
          id: selectedTarget.id,
          faction: selectedTarget.faction,
          alive: selectedTarget.alive === true,
          x_m: selectedTarget.x_m,
          z_m: selectedTarget.z_m,
        }] : [],
      },
      gunner: { selected_target_id: selectedTargetId },
    };
    return {
      wallS: (performance.now() - startMs) / 1000,
      status: state?.status ?? null,
      act: state?.mission_act ?? null,
      authorityTick: Number(state?.authority_tick),
      xM: Number(vehicle?.x_m),
      yM: Number(vehicle?.y_m),
      zM: Number(vehicle?.z_m),
      flyable: vehicle?.flyable === true,
      contactKind: vehicle?.contact_kind ?? null,
      contactFailureCause: vehicle?.contact_failure_cause ?? null,
      touchdownSinkMps: nullableNumber(vehicle?.touchdown_sink_mps),
      touchdownLateralMps: nullableNumber(vehicle?.touchdown_lateral_mps),
      touchdownYawRateRadS: nullableNumber(vehicle?.touchdown_yaw_rate_rad_s),
      clearanceM: Number(state?.route_guidance?.current_clearance_m),
      remainingM: Number(state?.route_guidance?.remaining_m),
      segmentIndex: Number(state?.route_guidance?.segment_index),
      insideCorridor: state?.route_guidance?.inside_corridor === true,
      activeGateIndex,
      activeGateUpM: activeGate ? Number(activeGate.up_m) : null,
      activeGateRangeM,
      activeGateRadiusM: activeGate ? Number(activeGate.half_m) : null,
      activeGateDistanceM,
      rollRad: Number(vehicle?.roll_rad),
      pitchRad: Number(vehicle?.pitch_rad),
      yawRad: Number(vehicle?.yaw_rad),
      groundSpeedMps: Number(vehicle?.ground_speed_mps),
      verticalSpeedMps: Number(vehicle?.vertical_speed_mps),
      collective: Number(vehicle?.collective),
      combatLive: war?.combat_live === true,
      ammoRemaining: Number(war?.ammo_remaining),
      ammoCapacity: Number(war?.ammo_capacity),
      ammoDry: war?.ammo_dry === true,
      overFob: war?.over_fob === true,
      fobRangeM: nullableNumber(war?.fob_range_m),
      fobRearms: Number(war?.debrief?.fob_rearms),
      latestFobRearmEventTick: nullableNumber(latestFobRearmEvent?.tick),
      friendlyPoints,
      hostilePoints,
      heldPoints: friendlyPoints + hostilePoints,
      contestedSiteCount: sites.filter((site) => site?.contested === true).length,
      objectiveSiteId: objectiveSite?.id ?? null,
      siteOwnershipSignature: ownershipSites
        .map((site) => `${site?.id ?? "unknown"}:${site?.owner ?? "unknown"}`)
        .join("|"),
      missionOutcome: war?.outcome ?? null,
      missionOutcomeReason: war?.outcome_reason ?? null,
      victoryHoldProgress: nullableNumber(war?.victory_hold_progress),
      groundWarTimeRemainingS: nullableNumber(war?.time_remaining_s),
      debriefMissionOutcome: war?.debrief?.outcome ?? null,
      debriefMissionOutcomeReason: war?.debrief?.outcome_reason ?? null,
      hostileKills: Number(war?.debrief?.hostile_kills),
      friendlyKills: Number(war?.debrief?.friendly_kills),
      hostileUnitCount: hostileUnits.length,
      hostileHealthTotal: hostileUnits.length > 0
          && hostileUnits.every((unit) => Number.isFinite(Number(unit?.health)))
        ? hostileUnits.reduce((total, unit) => total + Math.max(0, Number(unit.health)), 0)
        : null,
      selectedTargetId,
      selectedTargetAlive: selectedTarget?.alive === true,
      selectedTargetHealth: nullableNumber(selectedTarget?.health),
      selectedTargetMaxHealth: nullableNumber(selectedTarget?.max_health),
      selectedTargetGunHit: selectedTargetGunHitEvent !== null,
      selectedTargetGunHitTick: nullableNumber(selectedTargetGunHitEvent?.tick),
      gunnerState: state?.gunner?.state ?? null,
      gunnerReason: state?.gunner?.reason ?? null,
      fireAuthorized: state?.gunner?.fire_authorized === true,
      targetRangeM: nullableNumber(state?.gunner?.target_range_m),
      targetWithinRange: state?.gunner?.target_within_range ?? null,
      targetHasLineOfSight: state?.gunner?.target_has_line_of_sight ?? null,
      targetWithinTurretEnvelope: state?.gunner?.target_within_turret_envelope ?? null,
      targetHasBallisticSolution: state?.gunner?.target_has_ballistic_solution ?? null,
      receivingFire: state?.battle_damage?.receiving_fire === true,
      threatBurstsFired: Number(state?.battle_damage?.bursts_fired),
      battleEvidenceVisible,
      battleEvidenceTick,
      battleEvidenceFaction,
      battleEvidenceSpanPx,
      battleEvidenceProbe,
      guidanceVisible: guidanceEvidence?.visible === true,
      guidanceRebuildCount: nullableNumber(guidanceEvidence?.rebuildCount),
      guidanceActiveMarkerCount: nullableNumber(guidanceEvidence?.activeMarkerCount),
      guidanceTimeDriven: guidanceEvidence?.timeDriven === true,
      cockpitLensActive: lensEvidence?.active === true,
      cockpitFovDeg: nullableNumber(lensEvidence?.fovDeg),
      cockpitOpticalCenterX01: nullableNumber(lensEvidence?.opticalCenterX01),
      cockpitOpticalCenterY01: nullableNumber(lensEvidence?.opticalCenterY01),
      debriefVisible: document.querySelector("#debrief")?.hidden === false,
      debriefTone: document.querySelector("#debrief")?.dataset.outcome ?? null,
      debriefTitle: document.querySelector("#debrief-title")?.textContent?.trim() ?? null,
      audioContextState: audioRoot?.dataset.audioContextState ?? null,
      audioSignalActive: audioRoot?.dataset.audioSignalActive === "true",
      audioAudible: audioRoot?.dataset.audioAudible === "true",
      audioOutputGain: nullableNumber(audioRoot?.dataset.audioOutputGain),
      audioOutputMode: audioRoot?.dataset.audioOutputMode ?? null,
      audioQaSilent: audioRoot?.dataset.audioQaSilent === "true",
      briefHidden: document.querySelector("#mission-brief")?.hidden === true,
      paused: document.body.dataset.paused === "true"
        || document.querySelector("#pause-menu")?.hidden === false,
      visibilityState: document.visibilityState,
      gamepadConnected: navigator.getGamepads?.()[0]?.connected === true
        && navigator.getGamepads?.()[0]?.id === "Guns Only AI Flight Harness",
      pilotAuthority,
    };
  }, startedAtMs);
}

async function applyPilotCommand(page, command) {
  const padCommand = {
    axes: [
      rawGamepadAxis(command.rightCyclic),
      rawGamepadAxis(-command.forwardCyclic),
      rawGamepadAxis(command.yaw),
      0,
    ],
    collectiveUp: Math.max(0, command.collectiveRate),
    collectiveDown: Math.max(0, -command.collectiveRate),
  };
  await page.evaluate((next) => {
    const pad = globalThis.__gunsOnlyAiPad;
    if (!pad) throw new Error("AI gamepad was not installed before Cobra boot");
    pad.axes.splice(0, pad.axes.length, ...next.axes);
    for (const index of [6, 7]) {
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
    }
    pad.buttons[7].pressed = next.collectiveUp > 0.01;
    pad.buttons[7].value = next.collectiveUp;
    pad.buttons[6].pressed = next.collectiveDown > 0.01;
    pad.buttons[6].value = next.collectiveDown;
    pad.timestamp = performance.now();
  }, padCommand);
}

export function cobraPngDimensions(png) {
  if (!Buffer.isBuffer(png) || png.length < 24
    || png.toString("ascii", 1, 4) !== "PNG") {
    throw new TypeError("Playwright did not return a PNG framebuffer");
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width <= 0 || height <= 0) throw new TypeError("PNG framebuffer has invalid dimensions");
  return { width, height };
}

export function cobraBattleProbeInFramebuffer(probe, width, height) {
  const sourceWidth = Number(probe?.viewportWidthPx);
  const sourceHeight = Number(probe?.viewportHeightPx);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)
    || !(Number(width) > 0) || !(Number(height) > 0)) return null;
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const point = (value) => ({
    x: Number(value?.x) * scaleX,
    y: Number(value?.y) * scaleY,
  });
  return {
    faction: probe.faction,
    tick: probe.tick,
    pixelScale: Math.min(scaleX, scaleY),
    flash: point(probe.flash),
    segment: {
      start: point(probe.segment?.start),
      end: point(probe.segment?.end),
    },
  };
}

export function cobraBattleFramebufferRegion(framebufferProbe, width, height) {
  if (!(Number(width) > 0) || !(Number(height) > 0)) return null;
  const points = [
    framebufferProbe?.flash,
    framebufferProbe?.segment?.start,
    framebufferProbe?.segment?.end,
  ];
  if (!points.every((point) => Number.isFinite(Number(point?.x))
      && Number.isFinite(Number(point?.y)))) return null;
  const pixelScale = Number(framebufferProbe?.pixelScale) > 0
    ? Number(framebufferProbe.pixelScale)
    : 1;
  const paddingPx = Math.ceil(
    Math.max(COBRA_AI_BATTLE_PIXEL_SEARCH_RADIUS_PX,
      COBRA_AI_BATTLE_FLASH_SEARCH_RADIUS_PX) * pixelScale + 2,
  );
  const crop = {
    x: Math.max(0, Math.floor(Math.min(...points.map((point) => point.x)) - paddingPx)),
    y: Math.max(0, Math.floor(Math.min(...points.map((point) => point.y)) - paddingPx)),
    right: Math.min(width, Math.ceil(Math.max(...points.map((point) => point.x)) + paddingPx)),
    bottom: Math.min(height, Math.ceil(Math.max(...points.map((point) => point.y)) + paddingPx)),
  };
  crop.width = Math.max(1, crop.right - crop.x);
  crop.height = Math.max(1, crop.bottom - crop.y);
  const localPoint = (point) => ({ x: point.x - crop.x, y: point.y - crop.y });
  return {
    crop,
    probe: {
      ...framebufferProbe,
      flash: localPoint(framebufferProbe.flash),
      segment: {
        start: localPoint(framebufferProbe.segment.start),
        end: localPoint(framebufferProbe.segment.end),
      },
    },
  };
}

async function captureCobraBattleFrameEvidence(page, probe) {
  // One immutable screenshot buffer feeds both the pixel gate and the review artifact. We do not
  // take a second "pretty" frame after the proof has passed.
  const png = await page.screenshot({ type: "png" });
  const { width, height } = cobraPngDimensions(png);
  const framebufferProbe = cobraBattleProbeInFramebuffer(probe, width, height);
  if (!framebufferProbe) {
    return {
      png,
      assessment: assessCobraBattleFramePixels(null, null),
    };
  }
  const frameRegion = cobraBattleFramebufferRegion(framebufferProbe, width, height);
  if (!frameRegion) {
    return {
      png,
      assessment: assessCobraBattleFramePixels(null, null),
    };
  }
  const { crop, probe: localProbe } = frameRegion;
  const region = await page.evaluate(async ({ pngBase64, clip }) => {
    const binary = atob(pngBase64);
    const encoded = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      encoded[index] = binary.charCodeAt(index);
    }
    const bitmap = await createImageBitmap(new Blob([encoded], { type: "image/png" }));
    const canvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(clip.width, clip.height)
      : Object.assign(document.createElement("canvas"), {
        width: clip.width,
        height: clip.height,
      });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(
      bitmap,
      clip.x,
      clip.y,
      clip.width,
      clip.height,
      0,
      0,
      clip.width,
      clip.height,
    );
    const rgba = context.getImageData(0, 0, clip.width, clip.height);
    bitmap.close?.();
    return {
      width: clip.width,
      height: clip.height,
      data: Array.from(rgba.data),
    };
  }, {
    pngBase64: png.toString("base64"),
    clip: crop,
  });
  return {
    png,
    assessment: assessCobraBattleFramePixels(region, localProbe),
  };
}

export async function runCobraAiFlight({
  wwwroot,
  durationSeconds = null,
  goal = "flight",
  hardware = false,
  outputDirectory = "/tmp/cobra-ai-flight",
} = {}) {
  if (!wwwroot) throw new TypeError("runCobraAiFlight requires a published wwwroot");
  if (!COBRA_AI_GOALS.includes(goal)) {
    throw new TypeError(`Unknown Cobra AI goal '${goal}'`);
  }
  const resolvedDurationSeconds = cobraAiGoalDurationSeconds(goal, durationSeconds);
  const site = await serveStatic(wwwroot);
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ["--use-angle=metal", "--enable-webgl-draft-extensions"]
      : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(FAKE_PAD_SOURCE);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
  page.on("crash", () => errors.push("browser page crashed"));
  page.on("close", () => errors.push("browser page closed"));
  const samples = [];
  let fireHeld = false;
  try {
    await mkdir(outputDirectory, { recursive: true });
    const navigationStartedAtMs = Date.now();
    await page.goto(`${site.url}cobra-lab/?audioQa=silent`, {
      waitUntil: "load",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => document.querySelector("#status")?.dataset.ready === "true"
        && !!globalThis.__gunsOnlyCobraAuthority?.vehicle,
      undefined,
      { timeout: 120_000 },
    );
    const readyMs = Date.now() - navigationStartedAtMs;
    const startClickedAtMs = Date.now();
    await page.locator("#mission-brief-start").click();
    await page.waitForFunction(
      () => document.querySelector("#mission-brief")?.hidden === true,
      undefined,
      { timeout: 20_000 },
    );
    const startLatencyMs = Date.now() - startClickedAtMs;
    const teaching = page.locator("#controls-onboarding-dismiss");
    if (await teaching.isVisible()) await teaching.click();
    await page.bringToFront();
    await page.locator("#scene").focus().catch(() => {});

    const startedAtMs = await page.evaluate(() => performance.now());
    const deadlineMs = Date.now() + resolvedDurationSeconds * 1000;
    let lastLogSecond = -1;
    let previousAct = null;
    let lastTargetAttemptMs = -Infinity;
    const battleScreenshotFactions = new Set();
    let battleScreenshotCaptured = false;
    const captureBattlePixelsForSample = async (sample) => {
      const battleScreenshotThresholdPx = sample.battleEvidenceFaction === "friendly"
        ? COBRA_AI_MIN_FRIENDLY_BATTLE_SPAN_PX
        : sample.battleEvidenceFaction === "hostile"
          ? COBRA_AI_MIN_HOSTILE_BATTLE_SPAN_PX
          : Number.POSITIVE_INFINITY;
      if (!sample.battleEvidenceVisible
          || sample.battleEvidenceSpanPx < battleScreenshotThresholdPx
          || !sample.battleEvidenceProbe
          || battleScreenshotFactions.has(sample.battleEvidenceFaction)) return;
      const frameEvidence = await captureCobraBattleFrameEvidence(
        page,
        sample.battleEvidenceProbe,
      );
      Object.assign(sample, {
        battlePixelEvidenceVisible: frameEvidence.assessment.pass,
        battlePixelEvidenceFaction: sample.battleEvidenceFaction,
        battlePixelScale: frameEvidence.assessment.metrics.pixelScale ?? 1,
        battlePixelMatchedPixels: frameEvidence.assessment.metrics.matchedPixels,
        battlePixelOppositePixels: frameEvidence.assessment.metrics.oppositePixels,
        battlePixelStreakPx: frameEvidence.assessment.metrics.streakPx,
        battlePixelFlashMatchedPixels: frameEvidence.assessment.metrics.flashMatchedPixels,
        battlePixelFailures: [...frameEvidence.assessment.failures],
      });
      if (!frameEvidence.assessment.pass) return;
      battleScreenshotFactions.add(sample.battleEvidenceFaction);
      await writeFile(
        `${outputDirectory}/cobra-ai-battle-${sample.battleEvidenceFaction}.png`,
        frameEvidence.png,
      );
      if (!battleScreenshotCaptured) {
        battleScreenshotCaptured = true;
        await writeFile(`${outputDirectory}/cobra-ai-battle.png`, frameEvidence.png);
      }
    };
    while (Date.now() < deadlineMs) {
      const sample = await readFlightSample(page, startedAtMs);
      const pilotAuthority = sample.pilotAuthority;
      delete sample.pilotAuthority;
      Object.assign(sample, {
        battlePixelEvidenceVisible: false,
        battlePixelEvidenceFaction: null,
        battlePixelScale: 1,
        battlePixelMatchedPixels: 0,
        battlePixelOppositePixels: 0,
        battlePixelStreakPx: 0,
        battlePixelFlashMatchedPixels: 0,
        battlePixelFailures: [],
      });
      // Capture before screenshots, keyboard input or pilot application can advance presentation.
      // The remaining gap is only Playwright's screenshot command immediately after the read-only
      // projection RPC; no harness input occurs between the authority probe and its framebuffer.
      await captureBattlePixelsForSample(sample);
      if (sample.status !== "active" || sample.flyable !== true) {
        if (fireHeld) {
          await page.keyboard.up("f");
          fireHeld = false;
        }
        Object.assign(sample, {
          pilotMode: null,
          pilotTargetSiteId: null,
          pilotFireIntent: false,
          targetSelectionRequested: false,
          fireKeyAction: null,
          fireHeld: false,
        });
        samples.push(sample);
        if (goal === "sortie" && sample.status !== "active") {
          await page.waitForFunction(
            () => document.querySelector("#debrief")?.hidden === false,
            undefined,
            { timeout: 5_000 },
          ).catch(() => {});
          const presentationSample = await readFlightSample(page, startedAtMs);
          delete presentationSample.pilotAuthority;
          Object.assign(presentationSample, {
            pilotMode: null,
            pilotTargetSiteId: null,
            pilotFireIntent: false,
            targetSelectionRequested: false,
            fireKeyAction: null,
            fireHeld: false,
          });
          samples.push(presentationSample);
          await page.screenshot({
            path: `${outputDirectory}/cobra-ai-terminal.png`,
            type: "png",
          });
        }
        break;
      }
      const command = cobraAiPilotCommand(pilotAuthority);
      if (sample.act !== previousAct) {
        previousAct = sample.act;
        await page.screenshot({
          path: `${outputDirectory}/cobra-ai-${sample.act || "unknown"}.png`,
          type: "png",
        });
      }
      const nowMs = Date.now();
      const combatDecision = cobraAiRunnerCombatDecision({
        goal,
        sample,
        command,
        fireHeld,
        targetAttemptDue: nowMs - lastTargetAttemptMs >= 1_000,
      });
      if (combatDecision.selectTarget) {
        lastTargetAttemptMs = nowMs;
        await page.keyboard.press("Tab");
      }
      if (combatDecision.fireKeyAction === "down") {
        await page.keyboard.down("f");
      } else if (combatDecision.fireKeyAction === "up") {
        await page.keyboard.up("f");
      }
      fireHeld = combatDecision.desiredFireHeld;
      Object.assign(sample, {
        pilotMode: command.target.mode,
        pilotTargetSiteId: command.target.siteId,
        pilotFireIntent: command.fireIntent,
        targetSelectionRequested: combatDecision.selectTarget,
        fireKeyAction: combatDecision.fireKeyAction,
        fireHeld,
      });
      samples.push(sample);
      await applyPilotCommand(page, command);
      const wholeSecond = Math.floor(sample.wallS);
      if (wholeSecond !== lastLogSecond && wholeSecond % 5 === 0) {
        lastLogSecond = wholeSecond;
        console.log(
          `[cobra-ai] t=${sample.wallS.toFixed(1)}s act=${sample.act} `
          + `agl=${sample.clearanceM.toFixed(1)}m gs=${sample.groundSpeedMps.toFixed(1)}m/s `
          + `remaining=${sample.remainingM.toFixed(0)}m`,
        );
      }
      if (goal === "engage") {
        const engagement = assessCobraAiEngagement(samples);
        if (engagement.pass) break;
      } else if (goal === "ingress" && sample.act === "ingress"
        && samples.filter((candidate) => candidate.act === "ingress").length >= 20) {
        break;
      }
      await page.waitForTimeout(COBRA_AI_SAMPLE_MS);
    }

    if (fireHeld) {
      await page.keyboard.up("f");
      fireHeld = false;
    }
    await applyPilotCommand(page, {
      collectiveRate: 0,
      forwardCyclic: 0,
      rightCyclic: 0,
      yaw: 0,
    });
    const telemetry = site.diagnostics();
    const flightAssessment = assessCobraAiFlight(samples, {
      readyMs,
      startLatencyMs,
      minimumGateEntries: 2,
      requiredActs: goal === "sortie"
        ? ["depart", "ingress", "engage", "hold", "rtb", "complete"]
        : goal === "engage"
        ? ["depart", "ingress", "engage"]
        : goal === "ingress" ? ["depart", "ingress"] : [],
      maximumP95ClearanceM: COBRA_AI_MAX_P95_CLEARANCE_M,
      requireLowSpeedLensEvidence: true,
      allowTerminalState: goal === "sortie",
    });
    const engagementAssessment = goal === "engage" || goal === "sortie"
      ? assessCobraAiEngagement(samples)
      : { pass: true, failures: [], metrics: {} };
    const sortieAssessment = goal === "sortie"
      ? assessCobraAiSortie(samples)
      : { pass: true, failures: [], metrics: {} };
    const telemetryAssessment = assessCobraFlightTelemetry(telemetry, samples);
    const assessmentFailures = [
      ...flightAssessment.failures,
      ...engagementAssessment.failures.map((failure) => `engagement: ${failure}`),
      ...sortieAssessment.failures.map((failure) => `sortie: ${failure}`),
      ...telemetryAssessment.failures.map((failure) => `telemetry: ${failure}`),
      ...errors.map((error) => `page: ${error}`),
    ];
    const assessment = Object.freeze({
      pass: assessmentFailures.length === 0,
      failures: Object.freeze(assessmentFailures),
      metrics: Object.freeze({
        ...flightAssessment.metrics,
        ...engagementAssessment.metrics,
        ...sortieAssessment.metrics,
        ...telemetryAssessment.metrics,
        goal,
      }),
    });
    const result = { assessment, telemetry, errors, samples };
    await writeFile(
      `${outputDirectory}/cobra-ai-flight.json`,
      JSON.stringify(result, null, 2),
    );
    await page.screenshot({
      path: `${outputDirectory}/cobra-ai-flight.png`,
      type: "png",
    });
    if (!assessment.pass) {
      throw new Error(`Cobra AI flight failed:\n- ${assessment.failures.join("\n- ")}`);
    }
    return result;
  } finally {
    if (fireHeld) await page.keyboard.up("f").catch(() => {});
    await browser.close();
    await site.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runCobraAiFlight({
    wwwroot: process.env.GUNS_WWWROOT,
    durationSeconds: Number(argvFlag("seconds", Number.NaN)),
    goal: String(argvFlag("goal", "flight")),
    hardware: argvFlag("hardware", false) === true,
    outputDirectory: String(process.env.OUT ?? "/tmp/cobra-ai-flight"),
  });
  console.log(JSON.stringify(result.assessment, null, 2));
}
