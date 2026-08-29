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

export const OKANAGAN_AI_SAMPLE_MS = 50;
export const OKANAGAN_AI_TIMEOUT_SECONDS = 900;
export const OKANAGAN_AI_MINIMUM_SIMULATION_RATE = 0.85;
export const OKANAGAN_GAMEPAD_DEADZONE = 0.14;
export const OKANAGAN_REQUIRED_PHASES = Object.freeze([
  "depart",
  "join-scoop",
  "scoop",
  "climb",
  "downwind",
  "rtb",
  "approach",
  "landed",
  "complete",
]);
export const OKANAGAN_REQUIRED_SURFACES = Object.freeze([
  "runway",
  "airborne",
  "water",
  "airborne",
  "runway",
]);
export const OKANAGAN_REQUIRED_SCREENSHOTS = Object.freeze([
  "ready",
  "depart",
  "join-scoop",
  "scoop",
  "climb",
  "downwind",
  "rtb",
  "approach",
  "landed",
  "result",
]);

export function okanaganScreenshotQualification(phase, state = {}) {
  const wanted = String(phase ?? "").trim().toLowerCase();
  const actual = String(state?.phase ?? "").trim().toLowerCase();
  const surface = String(state?.surface ?? "").trim().toLowerCase();
  const activeGate = Math.max(0, Math.trunc(finite(state?.active_gate)));
  if (wanted !== actual) return false;
  if (wanted === "depart") return surface === "airborne" && activeGate >= 1;
  if (wanted === "join-scoop") return surface === "airborne" && activeGate >= 1;
  if (wanted === "scoop") return surface === "water"
    && state?.scoop_valid === true && finite(state?.water_kg) >= 500;
  if (wanted === "climb") return surface === "airborne";
  if (wanted === "downwind") return finite(state?.water_released_this_tick_kg) > 0;
  if (wanted === "rtb") return surface === "airborne" && activeGate >= 1;
  if (wanted === "approach") return surface === "airborne" && activeGate >= 1;
  if (wanted === "landed") return surface === "runway";
  return true;
}

/** This is a blank/corrupt-frame guard, not a substitute for human composition review. */
export function okanaganScreenshotIntegrity(pixelStats = {}) {
  const sampledPixels = Math.max(0, Math.trunc(finite(pixelStats.sampledPixels)));
  const lumaStdDev = Math.max(0, finite(pixelStats.lumaStdDev));
  const uniqueColorBuckets = Math.max(0, Math.trunc(finite(pixelStats.uniqueColorBuckets)));
  const nearBlackFraction = clamp(pixelStats.nearBlackFraction, 0, 1);
  const failures = [];
  if (sampledPixels < 1_000) failures.push("too few decoded pixels");
  if (lumaStdDev < 3.5) failures.push("near-uniform luminance");
  if (uniqueColorBuckets < 12) failures.push("near-uniform colour");
  if (nearBlackFraction > 0.98) failures.push("near-black frame");
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
  });
}

export function okanaganPhaseTimeoutSeconds(phase) {
  return Object.freeze({
    depart: 180,
    "join-scoop": 210,
    scoop: 60,
    climb: 180,
    downwind: 210,
    rtb: 240,
    approach: 150,
    landed: 180,
  })[String(phase ?? "").toLowerCase()] ?? 180;
}

const LAKE_SURFACE_M = 342;
const RUNWAY_SURFACE_M = 433;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value)));
}

export function wrapOkanaganAngleRad(value) {
  return Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
}

export function horizontalDistance(left, right) {
  return Math.hypot(
    finite(left?.x) - finite(right?.x),
    finite(left?.z) - finite(right?.z),
  );
}

/** Undo the production radial deadzone without bypassing the standard-pad input layer. */
export function rawOkanaganGamepadAxis(value, deadzone = OKANAGAN_GAMEPAD_DEADZONE) {
  const axis = clamp(value, -1, 1);
  if (Math.abs(axis) < 1e-6) return 0;
  const threshold = clamp(deadzone, 0, 0.45);
  return Math.sign(axis) * (threshold + Math.abs(axis) * (1 - threshold));
}

export function orderedValuesVisited(samples, property, requiredValues) {
  const visited = [];
  for (const sample of samples ?? []) {
    const value = String(sample?.[property] ?? "").trim().toLowerCase();
    if (value && value !== visited.at(-1)) visited.push(value);
  }
  let cursor = 0;
  for (const required of requiredValues ?? []) {
    const wanted = String(required).trim().toLowerCase();
    while (cursor < visited.length && visited[cursor] !== wanted) cursor += 1;
    if (cursor >= visited.length) return Object.freeze({ pass: false, visited });
    cursor += 1;
  }
  return Object.freeze({ pass: true, visited });
}

function normalizeGate(gate, index) {
  if (!gate?.position) return null;
  return Object.freeze({
    id: String(gate.id ?? `gate-${index}`),
    label: String(gate.label ?? ""),
    index,
    x: finite(gate.position.x),
    y: finite(gate.position.y),
    z: finite(gate.position.z),
    radiusM: Math.max(1, finite(gate.radius_m, 500)),
    targetSpeedMps: clamp(gate.target_speed_mps, 30, 80),
  });
}

/** Select only published route truth. No private pose, objective or phase authority is consulted. */
export function okanaganAiTarget(state) {
  const route = Array.isArray(state?.route) ? state.route : [];
  if (route.length === 0) return null;
  const phase = String(state?.phase ?? "").toLowerCase();
  const surface = String(state?.surface ?? "").toLowerCase();
  let index = Math.max(0, Math.min(route.length - 1, Math.trunc(finite(state?.active_gate))));
  // Touching the lake resets the Scoop route to gate zero even though the aircraft has already
  // passed it. The visible lane endpoint is the meaningful surface target while the hopper fills.
  if ((phase === "scoop" || phase === "join-scoop") && surface === "water") {
    index = route.length - 1;
  }
  return normalizeGate(route[index], index);
}

function landingSurfaceFor(state, target) {
  const phase = String(state?.phase ?? "").toLowerCase();
  if (phase === "join-scoop"
    && ["scoop-touch", "scoop-lane"].includes(target?.id)) return LAKE_SURFACE_M;
  if (phase === "approach" && target?.id === "threshold") return RUNWAY_SURFACE_M;
  return null;
}

function targetVerticalSpeedMps(state, target, rangeM) {
  const phase = String(state?.phase ?? "").toLowerCase();
  const altitudeM = finite(state?.position?.y);
  const landingSurfaceM = landingSurfaceFor(state, target);
  if (landingSurfaceM != null) {
    const heightM = altitudeM - landingSurfaceM;
    if (heightM <= 8) return -0.65;
    if (heightM <= 25) return -1.05;
    const geometricMps = (finite(target?.y, landingSurfaceM) - altitudeM)
      / Math.max(350, rangeM) * clamp(state?.tas_mps, 35, 65);
    return clamp(geometricMps, -2.4, -1.15);
  }
  const altitudeErrorM = finite(target?.y, altitudeM) - altitudeM;
  const gain = phase === "climb" ? 0.020 : 0.014;
  return clamp(altitudeErrorM * gain, phase === "approach" ? -3.0 : -3.8,
    phase === "climb" ? 5.0 : 3.8);
}

function targetThrottle(state, target, desiredVerticalSpeedMps) {
  const phase = String(state?.phase ?? "").toLowerCase();
  const surface = String(state?.surface ?? "").toLowerCase();
  const speedMps = finite(state?.tas_mps);
  const targetSpeedMps = finite(target?.targetSpeedMps, phase === "approach" ? 44 : 58);
  if (phase === "landed" || phase === "complete") return 0;
  if (surface === "runway" && phase === "depart") return 1;
  if (surface === "water" && phase === "climb") return 1;
  if (surface === "water") {
    return clamp(0.78 + (targetSpeedMps - speedMps) * 0.045, 0.42, 0.95);
  }
  const base = phase === "approach" || phase === "join-scoop" ? 0.46 : 0.64;
  return clamp(base + (targetSpeedMps - speedMps) * 0.032
    + Math.max(0, desiredVerticalSpeedMps) * 0.018, 0.12, 1);
}

/**
 * Closed-loop route, energy and landing controller. Output is semantic pilot intent; the runner
 * expresses it through the ordinary standard gamepad plus the documented A/D keys.
 */
export function okanaganAiCommand(state) {
  const target = okanaganAiTarget(state);
  if (!target) throw new TypeError("Okanagan AI pilot requires a published route gate");
  const phase = String(state?.phase ?? "").toLowerCase();
  const surface = String(state?.surface ?? "").toLowerCase();
  const position = state?.position ?? {};
  let guidanceX = target.x;
  let guidanceZ = target.z;
  if (phase === "join-scoop" && target.id === "scoop-touch") {
    const lane = normalizeGate(state?.route?.[target.index + 1], target.index + 1);
    if (lane) {
      guidanceX = lane.x;
      guidanceZ = lane.z;
    }
  } else if (phase === "approach" && target.id === "threshold") {
    // Keep looking down Runway 16 through touchdown. A point-target controller reverses its
    // desired heading the instant the nose crosses the threshold and commands a ground-loop.
    const runwayHeadingRad = 160 * Math.PI / 180;
    guidanceX += Math.sin(runwayHeadingRad) * 1_200;
    guidanceZ += Math.cos(runwayHeadingRad) * 1_200;
  }
  const gateDx = target.x - finite(position.x);
  const gateDz = target.z - finite(position.z);
  const dx = guidanceX - finite(position.x);
  const dz = guidanceZ - finite(position.z);
  const gateRangeM = Math.hypot(gateDx, gateDz);
  const rangeM = Math.hypot(dx, dz);
  const desiredHeadingRad = Math.atan2(dx, dz);
  const headingErrorRad = wrapOkanaganAngleRad(
    desiredHeadingRad - finite(state?.heading_rad),
  );
  const landingSurfaceM = landingSurfaceFor(state, target);
  const heightAboveLandingM = landingSurfaceM == null
    ? Number.POSITIVE_INFINITY : finite(position.y) - landingSurfaceM;
  const surfaceSteering = surface === "runway" || surface === "water";
  const maximumBankDeg = landingSurfaceM != null && heightAboveLandingM < 55
    ? 9 : phase === "approach" || phase === "join-scoop" ? 26 : 38;
  const desiredBankRad = surfaceSteering ? 0 : clamp(
    headingErrorRad * 1.55,
    -maximumBankDeg * Math.PI / 180,
    maximumBankDeg * Math.PI / 180,
  );
  const bankErrorRad = wrapOkanaganAngleRad(desiredBankRad - finite(state?.roll_rad));
  const roll = surfaceSteering ? 0 : clamp(bankErrorRad / (24 * Math.PI / 180), -1, 1);

  let desiredVerticalSpeedMps = 0;
  let pitch = 0;
  if (surface === "runway" && phase === "depart") {
    pitch = finite(state?.tas_mps) >= 38 ? 0.55 : 0.34;
  } else if (surface === "water" && phase === "climb") {
    pitch = 0.72;
  } else if (!surfaceSteering) {
    desiredVerticalSpeedMps = targetVerticalSpeedMps(state, target, gateRangeM);
    const bankRad = clamp(Math.abs(finite(state?.roll_rad)), 0, 65 * Math.PI / 180);
    const bankLiftCompensation = (1 / Math.max(0.42, Math.cos(bankRad)) - 1) / 2.5;
    pitch = clamp(
      (desiredVerticalSpeedMps - finite(state?.vertical_speed_mps)) / 15
        + bankLiftCompensation,
      -0.42,
      0.62,
    );
  }

  const throttleTarget = targetThrottle(state, target, desiredVerticalSpeedMps);
  const currentThrottle = finite(state?.throttle);
  const yaw = surfaceSteering ? clamp(headingErrorRad / 0.28, -1, 1) : 0;
  return Object.freeze({
    roll,
    pitch,
    yaw,
    throttleTarget,
    throttleUp: currentThrottle < throttleTarget - 0.025,
    throttleDown: currentThrottle > throttleTarget + 0.025,
    scoops: phase === "scoop" && surface === "water",
    drop: phase === "downwind"
      && finite(state?.water_kg) > 300
      && ((target.id === "training-drop" && rangeM <= target.radiusM + 250)
        || finite(state?.active_gate) >= 2),
    target: Object.freeze({
      ...target,
      rangeM: gateRangeM,
      guidanceRangeM: rangeM,
      guidanceX,
      guidanceZ,
      desiredHeadingRad,
      headingErrorRad,
      desiredBankRad,
      desiredVerticalSpeedMps,
      landingSurfaceM,
      heightAboveLandingM,
    }),
  });
}

/** Preserve a proportional yaw request while using only the documented digital A/D controls. */
export class OkanaganDigitalAxisModulator {
  constructor() {
    this.residue = 0;
  }

  next(value) {
    const axis = clamp(value, -1, 1);
    if (Math.abs(axis) < 0.02) {
      this.residue = 0;
      return 0;
    }
    const combined = this.residue + Math.abs(axis);
    const active = combined >= 0.5;
    this.residue = combined - (active ? 1 : 0);
    return active ? Math.sign(axis) : 0;
  }
}

function distanceTravelled(samples) {
  let distanceM = 0;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    distanceM += Math.hypot(
      finite(samples[index]?.xM) - finite(samples[index - 1]?.xM),
      finite(samples[index]?.yM) - finite(samples[index - 1]?.yM),
      finite(samples[index]?.zM) - finite(samples[index - 1]?.zM),
    );
  }
  return distanceM;
}

function longestAuthorityStallSeconds(samples) {
  let longestS = 0;
  let stallStartS = null;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (finite(current?.simS) <= finite(previous?.simS) + 1e-9) {
      stallStartS ??= finite(previous?.wallS);
      longestS = Math.max(longestS, finite(current?.wallS) - stallStartS);
    } else {
      stallStartS = null;
    }
  }
  return longestS;
}

export function assessOkanaganAiFlight(samples, journey = {}, errors = []) {
  const sampleList = Array.isArray(samples) ? samples : [];
  const failures = [];
  const first = sampleList[0] ?? {};
  const last = sampleList.at(-1) ?? {};
  const phases = orderedValuesVisited(sampleList, "phase", OKANAGAN_REQUIRED_PHASES);
  const surfaces = orderedValuesVisited(sampleList, "surface", OKANAGAN_REQUIRED_SURFACES);
  const wallDurationS = Math.max(0, finite(last.wallS) - finite(first.wallS));
  const authorityDurationS = Math.max(0, finite(last.simS) - finite(first.simS));
  const simulationRate = wallDurationS > 0 ? authorityDurationS / wallDurationS : 0;
  const maximumWaterKg = Math.max(0, ...sampleList.map((sample) => finite(sample.waterKg)));
  const loadedAt = sampleList.findIndex((sample) => finite(sample.waterKg) >= maximumWaterKg - 1);
  const minimumWaterAfterLoadKg = loadedAt >= 0
    ? Math.min(maximumWaterKg, ...sampleList.slice(loadedAt)
      .map((sample) => Math.max(0, finite(sample.waterKg))))
    : 0;
  const releasedWaterKg = maximumWaterKg - minimumWaterAfterLoadKg;
  const maximumCycles = Math.max(0, ...sampleList.map((sample) => finite(sample.completedCycles)));
  const minimumFuelMarginKg = Math.min(...sampleList.map((sample) =>
    finite(sample.fuelAboveMinimumKg, Number.POSITIVE_INFINITY)));
  const screenshotMap = new Map((journey.screenshots ?? []).map((entry) => [entry.phase, entry]));
  const liveSilentAudio = (sample) => sample?.audioBuilt === true
    && sample?.audioContextState === "running"
    && sample?.audioSilentQa === true
    && sample?.audioSignalActive === true
    && sample?.audioAudible === false
    && sample?.audioOutputMode === "silent-qa";

  if (sampleList.length < 3) failures.push("insufficient live mission samples");
  if (journey.readyVisible !== true) failures.push("visible Ready dispatch was not observed");
  if (journey.startClicked !== true) failures.push("Water Circuits was not launched visibly");
  if (finite(journey.readyMs, Number.POSITIVE_INFINITY) > 15_000) {
    failures.push(`Ready took ${finite(journey.readyMs).toFixed(0)} ms`);
  }
  if (finite(journey.startLatencyMs, Number.POSITIVE_INFINITY) > 10_000) {
    failures.push(`sortie start took ${finite(journey.startLatencyMs).toFixed(0)} ms`);
  }
  for (const name of OKANAGAN_REQUIRED_SCREENSHOTS) {
    const screenshot = screenshotMap.get(name);
    if (!screenshot || finite(screenshot.bytes) < 1_024) {
      failures.push(`missing ${name} phase screenshot`);
    } else if (screenshot.actionQualified !== true) {
      failures.push(`${name} phase screenshot was not action-qualified`);
    } else if (screenshot.visualIntegrity !== true) {
      failures.push(`${name} phase screenshot was blank or near-uniform`);
    }
  }
  for (const error of errors ?? []) failures.push(`page: ${error}`);
  if (!phases.pass) failures.push(`mission phases stopped at ${phases.visited.join(" -> ")}`);
  if (!surfaces.pass) failures.push(`surface sequence stopped at ${surfaces.visited.join(" -> ")}`);
  if (!sampleList.every((sample) => sample.visibilityState === "visible")) {
    failures.push("mission page became hidden");
  }
  if (!sampleList.every((sample) => sample.gamepadConnected === true
    && sample.gamepadMapping === "standard")) {
    failures.push("synthetic standard gamepad left the production input path");
  }
  if (!sampleList.every((sample) => sample.flyable === true)) {
    failures.push("Fire Boss became unserviceable");
  }
  if (sampleList.some((sample) => sample.phase === "failed" || sample.surface === "destroyed")) {
    failures.push("sortie ended in a crash");
  }
  if (!sampleList.some((sample) => Math.abs(finite(sample.command?.roll)) > 0.08
    || Math.abs(finite(sample.command?.pitch)) > 0.08
    || Math.abs(finite(sample.command?.yaw)) > 0.08)) {
    failures.push("AI issued no material physical flight command");
  }
  if (!sampleList.some((sample) => Math.abs(finite(sample.authorityInput?.roll)) > 0.08
    || Math.abs(finite(sample.authorityInput?.pitch)) > 0.08
    || Math.abs(finite(sample.authorityInput?.yaw)) > 0.08)) {
    failures.push("browser telemetry never reflected the real control path");
  }
  if (simulationRate < OKANAGAN_AI_MINIMUM_SIMULATION_RATE) {
    failures.push(`authority advanced at ${simulationRate.toFixed(3)}x wall time`);
  }
  const maximumStallS = longestAuthorityStallSeconds(sampleList);
  if (maximumStallS > 0.75) failures.push(`authority stalled for ${maximumStallS.toFixed(2)} s`);
  if (maximumWaterKg < 2_800) failures.push(`hopper filled only to ${maximumWaterKg.toFixed(0)} L`);
  if (releasedWaterKg < 2_400) failures.push(`training drop released only ${releasedWaterKg.toFixed(0)} L`);
  if (maximumCycles < 1) failures.push("authority credited no complete water circuit");
  if (!sampleList.some((sample) => sample.command?.scoops === true
    && sample.scoopsCommanded === true && sample.scoopValid === true)) {
    failures.push("scoops never filled through the production command path");
  }
  if (!sampleList.some((sample) => sample.command?.drop === true
    && sample.authorityInput?.drop === true)) {
    failures.push("training drop never traversed the real Space input path");
  }
  if (!sampleList.some(liveSilentAudio)) {
    failures.push("shared flight audio graph never ran in silent QA mode");
  }
  if (sampleList.some((sample) => sample.audioAudible === true)) {
    failures.push("silent audio QA reached the audible output");
  }
  if (!sampleList.some((sample) => sample.command?.scoops === true
    && sample.scoopValid === true && liveSilentAudio(sample))) {
    failures.push("scoop action was not observed with the live audio graph");
  }
  if (!sampleList.some((sample) => sample.command?.drop === true
    && finite(sample.waterReleasedThisTickKg) > 0 && liveSilentAudio(sample))) {
    failures.push("water release was not observed with the live audio graph");
  }
  if (last.phase !== "complete" || last.debriefVisible !== true) {
    failures.push(`terminal mission state was ${last.phase ?? "missing"}`);
  }
  if (last.debriefOutcome !== "complete" || last.debriefTitle !== "Complete") {
    failures.push("successful visible debrief was not presented");
  }
  if (maximumCycles >= 1 && !/1 circuit/u.test(String(last.debriefSummary ?? ""))) {
    failures.push("debrief omitted the completed circuit");
  }
  if (minimumFuelMarginKg < -0.1 || last.debriefReserveProtected !== true) {
    failures.push("sortie did not protect the published RTB reserve");
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      readyMs: finite(journey.readyMs),
      startLatencyMs: finite(journey.startLatencyMs),
      sampleCount: sampleList.length,
      wallDurationS,
      authorityDurationS,
      simulationRate,
      maximumAuthorityStallS: maximumStallS,
      distanceTravelledM: distanceTravelled(sampleList),
      maximumWaterKg,
      releasedWaterKg,
      maximumCycles,
      minimumFuelMarginKg,
      liveSilentAudioSamples: sampleList.filter(liveSilentAudio).length,
      screenshotIntegrityPasses: [...screenshotMap.values()]
        .filter((entry) => entry.visualIntegrity === true).length,
      phases: phases.visited,
      surfaces: surfaces.visited,
    }),
  });
}

const INSTALL_OKANAGAN_GAMEPAD = () => {
  const buttons = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  const pad = {
    id: "Guns Only Okanagan AI Player",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  };
  globalThis.__gunsOnlyOkanaganAiPad = pad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};

async function applyGamepad(page, command = {}) {
  await page.evaluate((next) => {
    const pad = globalThis.__gunsOnlyOkanaganAiPad;
    if (!pad) throw new Error("Okanagan AI gamepad was not installed before boot");
    pad.axes.splice(0, pad.axes.length, next.roll, next.pitch, 0, 0);
    for (const button of pad.buttons) {
      button.pressed = false;
      button.touched = false;
      button.value = 0;
    }
    if (next.throttleDown) {
      pad.buttons[4].pressed = true;
      pad.buttons[4].touched = true;
      pad.buttons[4].value = 1;
    }
    if (next.throttleUp) {
      pad.buttons[5].pressed = true;
      pad.buttons[5].touched = true;
      pad.buttons[5].value = 1;
    }
    pad.timestamp = performance.now();
  }, {
    roll: rawOkanaganGamepadAxis(command.roll),
    pitch: rawOkanaganGamepadAxis(command.pitch),
    throttleDown: command.throttleDown === true,
    throttleUp: command.throttleUp === true,
  });
}

async function applyHeldKeys(page, heldKeys, { yaw = 0, drop = false } = {}) {
  const desired = new Set();
  if (yaw > 0) desired.add("KeyD");
  else if (yaw < 0) desired.add("KeyA");
  if (drop) desired.add("Space");
  for (const code of [...heldKeys]) {
    if (desired.has(code)) continue;
    await page.keyboard.up(code);
    heldKeys.delete(code);
  }
  for (const code of desired) {
    if (heldKeys.has(code)) continue;
    await page.keyboard.down(code);
    heldKeys.add(code);
  }
}

async function releaseControls(page, heldKeys) {
  if (!page || page.isClosed()) return;
  await applyGamepad(page).catch(() => {});
  for (const code of [...heldKeys]) {
    await page.keyboard.up(code).catch(() => {});
    heldKeys.delete(code);
  }
}

async function readObservation(page, startedAtMs) {
  return page.evaluate((startMs) => {
    const runtime = globalThis.__gunsOnlyOkanagan;
    const state = runtime?.getState?.() ?? null;
    const telemetry = runtime?.getLastTelemetry?.() ?? null;
    const debrief = runtime?.getDebrief?.() ?? null;
    const audio = runtime?.getAudioDiagnostics?.() ?? null;
    const pad = navigator.getGamepads?.()[0] ?? null;
    return {
      wallS: (performance.now() - startMs) / 1_000,
      state,
      telemetry,
      debrief,
      audio,
      ui: {
        visibilityState: document.visibilityState,
        readyVisible: document.querySelector("#sortie-menu")?.classList.contains("visible") === true,
        resultVisible: document.querySelector("#mission-result")?.classList.contains("visible") === true,
        resultTitle: document.querySelector("#mission-result-title")?.textContent?.trim() ?? "",
        resultSummary: document.querySelector("#mission-result-summary")?.textContent?.trim() ?? "",
        status: document.querySelector("#status")?.textContent?.trim() ?? "",
        fatal: document.querySelector("#status")?.dataset.ready !== "true"
          && /unavailable|failed|error/iu.test(document.querySelector("#status")?.textContent ?? ""),
      },
      pad: {
        connected: pad?.connected === true && pad?.id === "Guns Only Okanagan AI Player",
        mapping: pad?.mapping ?? null,
        roll: Number(pad?.axes?.[0]),
        pitch: Number(pad?.axes?.[1]),
        throttleDown: Number(pad?.buttons?.[4]?.value),
        throttleUp: Number(pad?.buttons?.[5]?.value),
      },
    };
  }, startedAtMs);
}

function compactSample(observation, command = null, digitalYaw = 0) {
  const state = observation?.state ?? {};
  const telemetry = observation?.telemetry ?? {};
  const debrief = observation?.debrief ?? {};
  return {
    wallS: finite(observation?.wallS),
    simS: finite(state.mission_s),
    sortie: state.sortie ?? null,
    phase: state.phase ?? null,
    surface: state.surface ?? null,
    flyable: state.flyable === true,
    xM: finite(state.position?.x),
    yM: finite(state.position?.y),
    zM: finite(state.position?.z),
    vxMps: finite(state.velocity?.x),
    vyMps: finite(state.velocity?.y),
    vzMps: finite(state.velocity?.z),
    speedMps: finite(state.tas_mps),
    verticalSpeedMps: finite(state.vertical_speed_mps),
    headingRad: finite(state.heading_rad),
    pitchRad: finite(state.pitch_rad),
    rollRad: finite(state.roll_rad),
    throttle: finite(state.throttle),
    waterKg: finite(state.water_kg),
    scoopsCommanded: state.scoops_commanded === true,
    scoopValid: state.scoop_valid === true,
    scoopFault: state.scoop_fault ?? "",
    waterReleasedThisTickKg: finite(state.water_released_this_tick_kg),
    fuelKg: finite(state.fuel_kg),
    fuelAboveMinimumKg: finite(state.fuel_plan?.above_minimum_kg),
    completedCycles: finite(state.completed_cycles),
    activeGateIndex: finite(state.active_gate),
    activeGateId: state.route?.[state.active_gate]?.id ?? null,
    passedGateIds: Array.isArray(state.route)
      ? state.route.filter((gate) => gate?.passed === true).map((gate) => gate.id) : [],
    terrainClearanceM: Number.isFinite(Number(telemetry.terrain_clearance_m))
      ? Number(telemetry.terrain_clearance_m) : null,
    authorityInput: telemetry.input ? { ...telemetry.input } : null,
    audioBuilt: observation?.audio?.built === true,
    audioContextState: observation?.audio?.contextState ?? null,
    audioSilentQa: observation?.audio?.silentQa === true,
    audioSignalActive: observation?.audio?.signalActive === true,
    audioAudible: observation?.audio?.audible === true,
    audioOutputMode: observation?.audio?.outputMode ?? null,
    visibilityState: observation?.ui?.visibilityState ?? null,
    fatalVisible: observation?.ui?.fatal === true,
    gamepadConnected: observation?.pad?.connected === true,
    gamepadMapping: observation?.pad?.mapping ?? null,
    pad: { ...observation?.pad },
    command: command ? {
      roll: command.roll,
      pitch: command.pitch,
      yaw: command.yaw,
      digitalYaw,
      throttleTarget: command.throttleTarget,
      throttleUp: command.throttleUp,
      throttleDown: command.throttleDown,
      scoops: command.scoops,
      drop: command.drop,
      targetId: command.target.id,
      targetRangeM: command.target.rangeM,
      headingErrorRad: command.target.headingErrorRad,
      desiredVerticalSpeedMps: command.target.desiredVerticalSpeedMps,
    } : null,
    debriefVisible: observation?.ui?.resultVisible === true,
    debriefOutcome: debrief.outcome ?? null,
    debriefTitle: observation?.ui?.resultTitle ?? "",
    debriefSummary: observation?.ui?.resultSummary ?? "",
    debriefReserveProtected: debrief.reserve?.protectedReserve === true,
  };
}

function phaseScreenshotName(phase) {
  return OKANAGAN_REQUIRED_PHASES.includes(phase) && phase !== "complete" ? phase : null;
}

async function screenshotPixelStats(page, pngBuffer) {
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 60;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Set();
    let count = 0;
    let mean = 0;
    let squares = 0;
    let nearBlack = 0;
    for (let index = 0; index < rgba.length; index += 4) {
      if (rgba[index + 3] < 128) continue;
      const red = rgba[index];
      const green = rgba[index + 1];
      const blue = rgba[index + 2];
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      count += 1;
      const delta = luma - mean;
      mean += delta / count;
      squares += delta * (luma - mean);
      if (Math.max(red, green, blue) < 16) nearBlack += 1;
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
    return {
      sampledPixels: count,
      lumaMean: mean,
      lumaStdDev: count > 1 ? Math.sqrt(squares / (count - 1)) : 0,
      uniqueColorBuckets: buckets.size,
      nearBlackFraction: count > 0 ? nearBlack / count : 1,
    };
  }, pngBuffer.toString("base64"));
}

function argvValue(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

export async function runOkanaganAiFlight({
  wwwroot,
  hardware = false,
  timeoutSeconds = OKANAGAN_AI_TIMEOUT_SECONDS,
  outputDirectory = "/tmp/okanagan-ai-player",
} = {}) {
  if (!wwwroot) throw new TypeError("runOkanaganAiFlight requires a published wwwroot");
  const site = await serveStatic(wwwroot);
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ["--use-angle=metal", "--enable-webgl-draft-extensions"]
      : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INSTALL_OKANAGAN_GAMEPAD);
  const page = await context.newPage();
  const errors = [];
  const samples = [];
  const heldKeys = new Set();
  const yawModulator = new OkanaganDigitalAxisModulator();
  const journey = {
    readyVisible: false,
    startClicked: false,
    readyMs: 0,
    startLatencyMs: 0,
    screenshots: [],
  };
  page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
  page.on("crash", () => errors.push("browser page crashed"));
  let resultWritten = false;
  let lastScoopToggleWallMs = -Infinity;

  const capture = async (phase, evidence = null) => {
    if (journey.screenshots.some((entry) => entry.phase === phase)) return;
    const filename = `okanagan-ai-${phase}.png`;
    const path = `${outputDirectory}/${filename}`;
    const png = await page.screenshot({ type: "png" });
    await writeFile(path, png);
    const pixelStats = await screenshotPixelStats(page, png);
    const integrity = okanaganScreenshotIntegrity(pixelStats);
    const actionQualified = phase === "ready" || phase === "result"
      ? true
      : okanaganScreenshotQualification(phase, evidence);
    journey.screenshots.push(Object.freeze({
      phase,
      file: filename,
      bytes: png.byteLength,
      actionQualified,
      visualIntegrity: integrity.pass,
      pixelStats,
      integrityFailures: integrity.failures,
      evidence: evidence ? {
        phase: evidence.phase ?? null,
        surface: evidence.surface ?? null,
        activeGate: finite(evidence.active_gate),
        waterKg: finite(evidence.water_kg),
        scoopValid: evidence.scoop_valid === true,
        waterReleasedThisTickKg: finite(evidence.water_released_this_tick_kg),
      } : null,
    }));
  };

  try {
    await mkdir(outputDirectory, { recursive: true });
    const navigationStartedMs = Date.now();
    await page.goto(`${site.url}okanagan/?sortie=water-circuits&audioQa=silent`, {
      waitUntil: "load",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => document.querySelector("#status")?.dataset.ready === "true"
        && document.querySelector("#sortie-menu")?.classList.contains("visible") === true
        && globalThis.__gunsOnlyOkanagan?.getState?.() == null,
      undefined,
      { timeout: 120_000 },
    );
    journey.readyMs = Date.now() - navigationStartedMs;
    journey.readyVisible = true;
    await capture("ready");

    const startClickedMs = Date.now();
    await page.locator('[data-sortie="water-circuits"]').click();
    await page.locator("#start").click();
    journey.startClicked = true;
    await page.waitForFunction(
      () => globalThis.__gunsOnlyOkanagan?.getState?.()?.sortie === "water-circuits"
        && globalThis.__gunsOnlyOkanagan?.getState?.()?.phase === "depart"
        && document.querySelector("#sortie-menu")?.classList.contains("visible") === false,
      undefined,
      { timeout: 10_000 },
    );
    journey.startLatencyMs = Date.now() - startClickedMs;
    await page.bringToFront();
    await page.locator("#scene").focus();
    const startedAtMs = await page.evaluate(() => performance.now());
    const deadlineMs = Date.now() + finite(timeoutSeconds, OKANAGAN_AI_TIMEOUT_SECONDS) * 1_000;
    let lastLogSecond = -1;
    let activePhase = null;
    let phaseStartedMs = Date.now();

    while (Date.now() < deadlineMs) {
      const observation = await readObservation(page, startedAtMs);
      const state = observation.state;
      if (!state) throw new Error("Okanagan authority disappeared during the sortie");
      const phase = String(state.phase ?? "").toLowerCase();
      if (phase !== activePhase) {
        activePhase = phase;
        phaseStartedMs = Date.now();
      }
      const command = phase === "complete" || phase === "failed"
        ? null : okanaganAiCommand(state);
      const digitalYaw = command ? yawModulator.next(command.yaw) : 0;
      const sample = compactSample(observation, command, digitalYaw);
      samples.push(sample);

      const screenshotName = phaseScreenshotName(phase);
      if (screenshotName && okanaganScreenshotQualification(screenshotName, state)) {
        await capture(screenshotName, state);
      }
      if (phase === "complete" || phase === "failed") {
        await releaseControls(page, heldKeys);
        await page.waitForTimeout(100);
        const terminal = compactSample(await readObservation(page, startedAtMs));
        samples.push(terminal);
        await capture("result");
        break;
      }
      if (state.flyable !== true || String(state.surface).toLowerCase() === "destroyed") break;
      if (observation.ui.fatal || observation.ui.visibilityState !== "visible") break;
      const phaseTimeoutS = okanaganPhaseTimeoutSeconds(phase);
      if (Date.now() - phaseStartedMs > phaseTimeoutS * 1_000) {
        errors.push(`${phase} made no phase progress for ${phaseTimeoutS} seconds`);
        break;
      }

      await applyGamepad(page, command);
      await applyHeldKeys(page, heldKeys, { yaw: digitalYaw, drop: command.drop });
      if (command.scoops !== (state.scoops_commanded === true)
        && Date.now() - lastScoopToggleWallMs >= 650) {
        await page.keyboard.press("KeyE");
        lastScoopToggleWallMs = Date.now();
      }

      const wholeSecond = Math.floor(sample.wallS);
      if (wholeSecond !== lastLogSecond && wholeSecond % 10 === 0) {
        lastLogSecond = wholeSecond;
        console.log(
          `[okanagan-ai] t=${sample.wallS.toFixed(1)}s sim=${sample.simS.toFixed(1)}s `
          + `${phase}/${sample.surface} ${sample.speedMps.toFixed(1)}m/s `
          + `water=${sample.waterKg.toFixed(0)}L gate=${sample.activeGateId ?? "none"} `
          + `range=${finite(command.target.rangeM).toFixed(0)}m`,
        );
      }
      await page.waitForTimeout(OKANAGAN_AI_SAMPLE_MS);
    }

    await releaseControls(page, heldKeys);
    const assessment = assessOkanaganAiFlight(samples, journey, errors);
    const result = { assessment, errors, journey, samples };
    await writeFile(
      `${outputDirectory}/okanagan-ai-player.json`,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    resultWritten = true;
    if (!assessment.pass) {
      throw new Error(`Okanagan AI player failed:\n- ${assessment.failures.join("\n- ")}`);
    }
    return result;
  } catch (error) {
    if (!resultWritten) {
      await page.screenshot({
        path: `${outputDirectory}/okanagan-ai-error.png`,
        type: "png",
      }).catch(() => {});
      await writeFile(
        `${outputDirectory}/okanagan-ai-player.json`,
        `${JSON.stringify({
          assessment: { pass: false, failures: [error?.message ?? String(error)] },
          errors,
          journey,
          samples,
        }, null, 2)}\n`,
        "utf8",
      ).catch(() => {});
    }
    throw error;
  } finally {
    await releaseControls(page, heldKeys).catch(() => {});
    await browser.close();
    await site.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runOkanaganAiFlight({
    wwwroot: process.env.GUNS_WWWROOT,
    hardware: argvValue("hardware", false) === true,
    timeoutSeconds: Number(argvValue("seconds", OKANAGAN_AI_TIMEOUT_SECONDS)),
    outputDirectory: String(process.env.OUT ?? "/tmp/okanagan-ai-player"),
  });
  console.log(JSON.stringify(result.assessment, null, 2));
}
