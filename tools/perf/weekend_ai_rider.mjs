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

export const WEEKEND_AI_SAMPLE_MS = 50;
export const WEEKEND_AI_GOALS = Object.freeze(["sector", "lap"]);
export const WEEKEND_AI_MAX_READY_MS = 15_000;
export const WEEKEND_AI_MAX_START_MS = 5_000;
export const WEEKEND_AI_MINIMUM_SIMULATION_RATE = 0.85;

const GAMEPAD_DEADZONE = 0.12;
const FORWARD_SEARCH_POINTS = 40;
const WAYPOINT_CAPTURE_M = 10;
const TARGET_LOOKAHEAD_POINTS = 10;
const MINIMUM_PEAK_SPEED_MPS = 18;
const MINIMUM_MEDIAN_MOVING_SPEED_MPS = 14;
const MINIMUM_CORNER_SPEED_MPS = 7;
const MINIMUM_CORNER_LEAN_RAD = 10 * Math.PI / 180;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value)));
}

function horizontalDistance(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

export function wrapWeekendAngleRad(value) {
  return Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
}

/** Undo the production rider-input deadzone without bypassing the standard gamepad path. */
export function rawWeekendGamepadAxis(value, deadzone = GAMEPAD_DEADZONE) {
  const axis = clamp(value, -1, 1);
  if (Math.abs(axis) < 1e-6) return 0;
  const threshold = clamp(deadzone, 0, 0.95);
  return Math.sign(axis) * (threshold + Math.abs(axis) * (1 - threshold));
}

function uniquePointCount(circuit) {
  if (!Array.isArray(circuit) || circuit.length < 4) {
    throw new TypeError("Weekend AI rider requires a closed circuit with at least three points");
  }
  const count = circuit.length - 1;
  if (horizontalDistance(circuit[0], circuit.at(-1)) > 0.05) {
    throw new TypeError("Weekend AI rider circuit is not closed");
  }
  return count;
}

function segmentHeading(circuit, index, count) {
  const start = circuit[(index + count) % count];
  const end = circuit[(index + 1 + count) % count];
  return Math.atan2(finite(end?.x) - finite(start?.x), finite(end?.z) - finite(start?.z));
}

export function weekendCircuitLengthM(circuit) {
  const count = uniquePointCount(circuit);
  let lengthM = 0;
  for (let index = 0; index < count; index += 1) {
    lengthM += horizontalDistance(circuit[index], circuit[index + 1]);
  }
  return lengthM;
}

/**
 * The same forward-only nearest-point search used by the authoritative sim test. Looking only
 * ahead prevents the rider from snapping to the opposite straight where the runway loop doubles
 * back a few metres away.
 */
export function advanceWeekendWaypoint(circuit, position, waypointIndex = 1) {
  const count = uniquePointCount(circuit);
  let nextIndex = ((Math.trunc(finite(waypointIndex, 1)) % count) + count) % count;
  let nearestForwardIndex = nextIndex;
  let nearestForwardDistanceM = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset <= FORWARD_SEARCH_POINTS; offset += 1) {
    const candidate = (nextIndex + offset) % count;
    const distanceM = horizontalDistance(position, circuit[candidate]);
    if (distanceM < nearestForwardDistanceM) {
      nearestForwardDistanceM = distanceM;
      nearestForwardIndex = candidate;
    }
  }
  nextIndex = nearestForwardIndex;
  let captures = 0;
  while (horizontalDistance(position, circuit[nextIndex]) < WAYPOINT_CAPTURE_M
    && captures < count) {
    nextIndex = (nextIndex + 1) % count;
    captures += 1;
  }
  return Object.freeze({
    waypointIndex: nextIndex,
    nearestForwardIndex,
    nearestForwardDistanceM,
  });
}

function observedHeadingRad(state, circuit, waypointIndex, count) {
  const vx = finite(state?.vx);
  const vz = finite(state?.vz);
  if (Math.hypot(vx, vz) > 0.35) return Math.atan2(vx, vz);
  return segmentHeading(circuit, waypointIndex - 1, count);
}

/**
 * Deterministic centreline rider ported from WeekendRideMissionRuntimeTests. The command still
 * travels through navigator.getGamepads(), the production deadzone, the assisted rider reflex,
 * the browser bridge, and the ordinary 120 Hz mission authority.
 */
export function weekendAiRiderCommand(state, circuit, waypointIndex = 1) {
  const count = uniquePointCount(circuit);
  const position = { x: finite(state?.px), z: finite(state?.pz) };
  const waypoint = advanceWeekendWaypoint(circuit, position, waypointIndex);
  const targetIndex = (waypoint.waypointIndex + TARGET_LOOKAHEAD_POINTS) % count;
  const target = circuit[targetIndex];
  const desiredHeadingRad = Math.atan2(
    finite(target?.x) - position.x,
    finite(target?.z) - position.z,
  );
  const headingRad = observedHeadingRad(state, circuit, waypoint.waypointIndex, count);
  const headingErrorRad = wrapWeekendAngleRad(desiredHeadingRad - headingRad);
  const turn = clamp(headingErrorRad * 1.8, -1, 1);
  const previewHeadingA = segmentHeading(
    circuit,
    (waypoint.waypointIndex + 12) % count,
    count,
  );
  const previewHeadingB = segmentHeading(
    circuit,
    (waypoint.waypointIndex + 40) % count,
    count,
  );
  const previewTurnRad = Math.abs(wrapWeekendAngleRad(previewHeadingB - previewHeadingA));
  // The C# regression rider deliberately tops out at 13 m/s; that proves authority but makes a
  // six-kilometre superbike lap take eight minutes. Preserve its cautious hairpin pace while
  // letting the long Rapier straights expose gearing, lens response, and scenery at useful speed.
  const targetSpeedMps = clamp(
    22 - Math.abs(headingErrorRad) * 8 - previewTurnRad * 28,
    7,
    22,
  );
  const speedMps = Math.hypot(finite(state?.vx), finite(state?.vz));
  const throttle = speedMps < targetSpeedMps ? 0.78 : 0;
  const brake = speedMps > targetSpeedMps + 0.8
    ? clamp((speedMps - targetSpeedMps) / 7, 0, 1)
    : 0;
  const bodyLateral = clamp(turn * 0.7, -0.8, 0.8);
  return Object.freeze({
    waypointIndex: waypoint.waypointIndex,
    targetIndex,
    throttle,
    brake,
    turn,
    bodyLateral,
    targetSpeedMps,
    speedMps,
    headingRad,
    desiredHeadingRad,
    headingErrorRad,
    previewTurnRad,
    targetDistanceM: horizontalDistance(position, target),
    nearestForwardDistanceM: waypoint.nearestForwardDistanceM,
  });
}

export function weekendCornerEvidence(sample) {
  const leanRad = finite(sample?.leanRad);
  const riderLateral = finite(sample?.appliedRiderLateral);
  return finite(sample?.speedMps) >= MINIMUM_CORNER_SPEED_MPS
    && Math.abs(leanRad) >= MINIMUM_CORNER_LEAN_RAD
    && Math.abs(riderLateral) >= 0.08
    // Motorcycle telemetry defines right steer/body input as negative lean.
    && leanRad * riderLateral < 0;
}

export function completedWeekendSectors(sample) {
  return Array.isArray(sample?.sectorSeconds)
    ? sample.sectorSeconds.filter((value) => finite(value) > 0).length
    : 0;
}

function distanceTravelled(samples) {
  let distanceM = 0;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    distanceM += Math.hypot(
      finite(samples[index]?.xM) - finite(samples[index - 1]?.xM),
      finite(samples[index]?.zM) - finite(samples[index - 1]?.zM),
    );
  }
  return distanceM;
}

function authorityElapsedSeconds(sample) {
  const explicit = Number(sample?.authorityElapsedS);
  if (Number.isFinite(explicit)) return explicit;
  return Math.max(0, finite(sample?.lastLapS)) + Math.max(0, finite(sample?.lapTimeS));
}

export function assessWeekendAiRide(samples, {
  goal = "lap",
  circuitLengthM = 0,
  readyMs = 0,
  startLatencyMs = 0,
  pauseEvidence = null,
  debrief = null,
  paceCaptureSeen = null,
  cornerCaptureSeen = null,
} = {}) {
  if (!WEEKEND_AI_GOALS.includes(goal)) throw new TypeError(`Unknown Weekend AI goal '${goal}'`);
  const failures = [];
  const sampleList = Array.isArray(samples) ? samples : [];
  const travelledM = distanceTravelled(sampleList);
  const wallDurationS = sampleList.length > 1
    ? finite(sampleList.at(-1)?.wallS) - finite(sampleList[0]?.wallS)
    : 0;
  const authorityDurationS = sampleList.length > 1
    ? authorityElapsedSeconds(sampleList.at(-1)) - authorityElapsedSeconds(sampleList[0])
    : 0;
  const simulationRate = wallDurationS > 0 ? authorityDurationS / wallDurationS : 0;
  const maximumSpeedMps = Math.max(0, ...sampleList.map((sample) => finite(sample?.speedMps)));
  const movingSpeeds = sampleList
    .map((sample) => finite(sample?.speedMps))
    .filter((speedMps) => speedMps >= 2)
    .sort((a, b) => a - b);
  const medianMovingSpeedMps = movingSpeeds.length > 0
    ? movingSpeeds[Math.floor(movingSpeeds.length / 2)]
    : 0;
  const maximumLeanDeg = Math.max(
    0,
    ...sampleList.map((sample) => Math.abs(finite(sample?.leanRad)) * 180 / Math.PI),
  );
  const maximumLap = Math.max(0, ...sampleList.map((sample) => finite(sample?.lap)));
  const maximumCompletedSectors = Math.max(
    0,
    ...sampleList.map((sample) => completedWeekendSectors(sample)),
  );
  const maximumOffTrackS = Math.max(0, ...sampleList.map((sample) => finite(sample?.offTrackS)));
  const plannerControlSeen = sampleList.some((sample) =>
    finite(sample?.requestedThrottle) > 0.1
      || Math.abs(finite(sample?.requestedTurn)) > 0.05
      || finite(sample?.requestedBrake) > 0.05);
  const plannerBodyControlSeen = sampleList.some((sample) =>
    Math.abs(finite(sample?.requestedBodyLateral)) > 0.08);
  const padControlSeen = sampleList.some((sample) =>
    finite(sample?.padThrottle) > 0.1
      || Math.abs(finite(sample?.padTurn)) > GAMEPAD_DEADZONE
      || finite(sample?.padBrake) > 0.05);
  const padBodyControlSeen = sampleList.some((sample) =>
    Math.abs(finite(sample?.padBodyLateral)) > GAMEPAD_DEADZONE);
  const authorityControlSeen = sampleList.some((sample) =>
    finite(sample?.appliedThrottle) > 0.1 || finite(sample?.appliedBrake) > 0.05);
  const authorityBodyControlSeen = sampleList.some((sample) =>
    Math.abs(finite(sample?.appliedRiderLateral)) > 0.05);
  const cornerEvidenceSeen = sampleList.some(weekendCornerEvidence);
  const lensFovs = sampleList
    .map((sample) => Number(sample?.lensFovDeg))
    .filter(Number.isFinite);
  const minimumLensFovDeg = lensFovs.length > 0 ? Math.min(...lensFovs) : null;
  const maximumLensFovDeg = lensFovs.length > 0 ? Math.max(...lensFovs) : null;
  const wideLensFovs = sampleList
    .filter((sample) => finite(sample?.speedMps) <= 3)
    .map((sample) => Number(sample?.lensFovDeg))
    .filter(Number.isFinite);
  const atSpeedLensFovs = sampleList
    .filter((sample) => finite(sample?.speedMps) >= MINIMUM_PEAK_SPEED_MPS)
    .map((sample) => Number(sample?.lensFovDeg))
    .filter(Number.isFinite);
  const wideLensFovDeg = wideLensFovs.length > 0 ? Math.max(...wideLensFovs) : null;
  const atSpeedLensFovDeg = atSpeedLensFovs.length > 0 ? Math.min(...atSpeedLensFovs) : null;

  if (sampleList.length < 2) failures.push("fewer than two live ride samples");
  if (readyMs > WEEKEND_AI_MAX_READY_MS) failures.push(`Ready took ${readyMs} ms`);
  if (startLatencyMs > WEEKEND_AI_MAX_START_MS) {
    failures.push(`ride start took ${startLatencyMs} ms`);
  }
  if (!sampleList.every((sample) => sample?.phase === "active")) {
    failures.push("ride samples were not continuously active");
  }
  if (!sampleList.every((sample) => sample?.visibilityState === "visible")) {
    failures.push("ride page became hidden");
  }
  if (!sampleList.every((sample) => sample?.gamepadConnected === true)) {
    failures.push("synthetic standard gamepad left the production input path");
  }
  if (!plannerControlSeen) failures.push("AI planner never requested rider control");
  if (!padControlSeen) failures.push("synthetic standard gamepad never carried rider control");
  if (!authorityControlSeen) failures.push("production authority never applied gamepad control");
  if (simulationRate < WEEKEND_AI_MINIMUM_SIMULATION_RATE) {
    failures.push(
      `authority advanced at ${simulationRate.toFixed(3)}x wall time; minimum `
      + `${WEEKEND_AI_MINIMUM_SIMULATION_RATE.toFixed(2)}x`,
    );
  }
  if (maximumSpeedMps < MINIMUM_PEAK_SPEED_MPS) {
    failures.push(`bike reached only ${maximumSpeedMps.toFixed(1)} m/s`);
  }
  if (medianMovingSpeedMps < MINIMUM_MEDIAN_MOVING_SPEED_MPS) {
    failures.push(`moving median was only ${medianMovingSpeedMps.toFixed(1)} m/s`);
  }
  if (paceCaptureSeen === false) failures.push("no at-speed visual evidence was captured");
  if (maximumOffTrackS > 1e-6 || !sampleList.every((sample) => sample?.onTrack === true)) {
    failures.push(`ride left the painted circuit for ${maximumOffTrackS.toFixed(3)} s`);
  }
  if (sampleList.some((sample) => sample?.tipped === true)) failures.push("bike tipped over");
  if (sampleList.some((sample) => sample?.lapValid !== true)) failures.push("open lap became invalid");

  const minimumTravelM = goal === "lap"
    ? Math.max(1_000, finite(circuitLengthM) * 0.8)
    : Math.max(500, finite(circuitLengthM) * 0.18);
  if (travelledM < minimumTravelM) {
    failures.push(`ride covered ${travelledM.toFixed(0)} m; minimum ${minimumTravelM.toFixed(0)} m`);
  }
  if (goal === "lap") {
    if (maximumLap < 1) failures.push("AI did not complete a lap");
    if (!plannerBodyControlSeen) failures.push("AI planner never requested rider body weight");
    if (!padBodyControlSeen) {
      failures.push("synthetic standard gamepad never carried rider body weight");
    }
    if (!authorityBodyControlSeen) {
      failures.push("production authority never applied rider body weight");
    }
    if (!cornerEvidenceSeen || maximumLeanDeg < 10) {
      failures.push("full lap never proved a loaded, body-weighted corner");
    }
    if (cornerCaptureSeen === false) failures.push("no corner visual evidence was captured");
    if (wideLensFovDeg === null || atSpeedLensFovDeg === null
      || wideLensFovDeg - atSpeedLensFovDeg < 2) {
      failures.push("helmet lens did not widen at low speed and narrow at pace");
    }
    if (!(finite(debrief?.authority?.last_lap_s) > 0)) failures.push("debrief has no completed lap");
    if (!(finite(debrief?.authority?.best_lap_s) > 0)) failures.push("debrief has no clean lap record");
  } else {
    if (maximumCompletedSectors < 1) failures.push("AI did not close a clean sector");
    const debriefSectors = Array.isArray(debrief?.authority?.sector_s)
      ? debrief.authority.sector_s.filter((value) => finite(value) > 0).length
      : 0;
    if (debriefSectors < 1 || debrief?.authority?.lap_valid !== true) {
      failures.push("debrief did not preserve the clean sector evidence");
    }
  }

  if (pauseEvidence?.visible !== true || pauseEvidence?.phase !== "paused") {
    failures.push("visible pause menu did not hold authority");
  }
  if (!(finite(pauseEvidence?.heldWallS) >= 0.4)
    || Math.abs(finite(pauseEvidence?.authorityDeltaS, Number.POSITIVE_INFINITY)) > 0.02) {
    failures.push("pause UI did not prove a held authority clock");
  }
  if (debrief?.visible !== true) failures.push("finished debrief was not visible");
  if (debrief?.authority?.phase !== "finished") {
    failures.push(`debrief authority phase was ${debrief?.authority?.phase ?? "missing"}`);
  }
  if (!debrief?.result || !String(debrief?.title ?? "").trim()) {
    failures.push("finished debrief model was missing");
  }
  if (goal === "lap") {
    if (!(Number.parseInt(debrief?.metrics?.laps, 10) >= 1)
      || /—/.test(String(debrief?.metrics?.last ?? ""))
      || /—/.test(String(debrief?.metrics?.record ?? ""))) {
      failures.push("visible debrief metrics did not show the completed clean lap");
    }
  } else if (debrief?.metrics?.openLap !== "CLEAN"
    || !/^0(?:\.0)? s$/u.test(String(debrief?.metrics?.offTrack ?? ""))) {
    failures.push("visible debrief metrics did not show the clean open sector");
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      goal,
      readyMs,
      startLatencyMs,
      circuitLengthM: finite(circuitLengthM),
      sampleCount: sampleList.length,
      durationS: wallDurationS,
      authorityDurationS,
      simulationRate,
      travelledM,
      maximumSpeedMps,
      medianMovingSpeedMps,
      maximumLeanDeg,
      cornerEvidenceSeen,
      minimumLensFovDeg,
      maximumLensFovDeg,
      wideLensFovDeg,
      atSpeedLensFovDeg,
      maximumLap,
      maximumCompletedSectors,
      maximumOffTrackS,
    }),
  });
}

const INSTALL_WEEKEND_GAMEPAD = () => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const pad = {
    id: "Guns Only AI Weekend Rider",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  };
  globalThis.__gunsOnlyAiWeekendPad = pad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};

async function applyWeekendCommand(page, command) {
  await page.evaluate((next) => {
    const pad = globalThis.__gunsOnlyAiWeekendPad;
    if (!pad) throw new Error("AI Weekend gamepad was not installed before boot");
    pad.axes[0] = next.turn;
    pad.axes[2] = next.bodyLateral;
    pad.axes[3] = 0;
    for (const index of [6, 7]) {
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
    }
    pad.buttons[6].pressed = next.brake > 0.01;
    pad.buttons[6].value = next.brake;
    pad.buttons[7].pressed = next.throttle > 0.01;
    pad.buttons[7].value = next.throttle;
    pad.timestamp = performance.now();
  }, {
    turn: rawWeekendGamepadAxis(command?.turn ?? 0),
    bodyLateral: rawWeekendGamepadAxis(command?.bodyLateral ?? 0),
    throttle: clamp(command?.throttle, 0, 1),
    brake: clamp(command?.brake, 0, 1),
  });
}

async function readWeekendCircuit(page) {
  return page.evaluate(async () => {
    const runtime = await globalThis.getDotnetRuntime(0);
    const exports = await runtime.getAssemblyExports("GunsOnly.Web");
    return JSON.parse(exports.GunsOnly.Web.MotorcycleWebBridge.GetCircuit());
  });
}

async function readWeekendSample(page, startedAtMs) {
  return page.evaluate((startMs) => {
    const state = globalThis.__gunsOnlyWeekendAuthority ?? {};
    const pad = navigator.getGamepads?.()[0] ?? null;
    return {
      wallS: (performance.now() - startMs) / 1_000,
      phase: state.phase ?? null,
      xM: Number(state.px),
      zM: Number(state.pz),
      vx: Number(state.vx),
      vz: Number(state.vz),
      speedMps: Math.hypot(Number(state.vx) || 0, Number(state.vz) || 0),
      leanRad: Number(state.lean_rad),
      gear: Number(state.gear),
      rpm: Number(state.rpm),
      appliedRiderLateral: Number(state.rider_lateral),
      appliedThrottle: Number(state.throttle),
      appliedBrake: Number(state.brake),
      lap: Number(state.lap),
      lapTimeS: Number(state.lap_time_s),
      lastLapS: Number(state.last_lap_s),
      bestLapS: state.best_lap_s == null ? null : Number(state.best_lap_s),
      authorityElapsedS: Math.max(0, Number(state.last_lap_s) || 0)
        + Math.max(0, Number(state.lap_time_s) || 0),
      lapValid: state.lap_valid === true,
      sectorSeconds: Array.isArray(state.sector_s) ? [...state.sector_s] : [],
      bestSectorSeconds: Array.isArray(state.best_sector_s) ? [...state.best_sector_s] : [],
      offTrackS: Number(state.off_track_s),
      onTrack: state.on_track === true,
      tipped: state.tipped === true,
      tipRecoveryFlashS: Number(state.tip_recovery_flash_s),
      briefHidden: document.querySelector("#ride-brief")?.hidden === true,
      pauseHidden: document.querySelector("#pause-menu")?.hidden === true,
      resultHidden: document.querySelector("#ride-result")?.hidden === true,
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
      gamepadConnected: pad?.connected === true
        && pad?.mapping === "standard"
        && pad?.id === "Guns Only AI Weekend Rider",
      padTurn: Number(pad?.axes?.[0]),
      padBodyLateral: Number(pad?.axes?.[2]),
      padBrake: Number(pad?.buttons?.[6]?.value),
      padThrottle: Number(pad?.buttons?.[7]?.value),
      lensFovDeg: Number(globalThis.__gunsOnlyWeekendLens?.fovDeg),
    };
  }, startedAtMs);
}

function argvValue(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

export async function runWeekendAiRide({
  wwwroot,
  goal = "lap",
  durationSeconds = null,
  hardware = false,
  outputDirectory = "/tmp/weekend-ai-rider",
} = {}) {
  if (!wwwroot) throw new TypeError("runWeekendAiRide requires a published wwwroot");
  if (!WEEKEND_AI_GOALS.includes(goal)) throw new TypeError(`Unknown Weekend AI goal '${goal}'`);
  const resolvedDurationSeconds = Number.isFinite(Number(durationSeconds))
    ? Number(durationSeconds)
    : goal === "lap" ? 900 : 300;
  const site = await serveStatic(wwwroot);
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ["--use-angle=metal", "--enable-webgl-draft-extensions"]
      : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INSTALL_WEEKEND_GAMEPAD);
  const page = await context.newPage();
  const errors = [];
  const samples = [];
  const screenshots = [];
  page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
  page.on("crash", () => errors.push("browser page crashed"));
  let resultWritten = false;

  const capture = async (name) => {
    const filename = `weekend-ai-${name}.png`;
    // The WebGL workload can span a frame on software renderers. Two settled RAF edges prevent
    // evidence frames from catching the track before its later draw submissions have landed.
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await page.screenshot({ path: `${outputDirectory}/${filename}`, type: "png" });
    screenshots.push(Object.freeze({ phase: name, file: filename }));
  };

  try {
    await mkdir(outputDirectory, { recursive: true });
    const navigationStartedAtMs = Date.now();
    await page.goto(`${site.url}weekend-ride/?audioQa=silent`, {
      waitUntil: "load",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => document.querySelector("#status")?.dataset.ready === "true"
        && document.querySelector("#ride-brief")?.hidden === false
        && globalThis.__gunsOnlyWeekendAuthority?.phase === "paused",
      undefined,
      { timeout: 120_000 },
    );
    const readyMs = Date.now() - navigationStartedAtMs;
    await capture("ready");

    const startClickedAtMs = Date.now();
    await page.locator("#ride-brief-start").click();
    await page.waitForFunction(
      () => document.querySelector("#ride-brief")?.hidden === true
        && globalThis.__gunsOnlyWeekendAuthority?.phase === "active",
      undefined,
      { timeout: 20_000 },
    );
    const startLatencyMs = Date.now() - startClickedAtMs;
    const teaching = page.locator("#controls-onboarding-dismiss");
    if (await teaching.isVisible()) await teaching.click();
    await page.bringToFront();
    await page.locator("#scene").focus().catch(() => {});
    await capture("active");

    const circuit = await readWeekendCircuit(page);
    const circuitLengthM = weekendCircuitLengthM(circuit);
    const startedAtMs = await page.evaluate(() => performance.now());
    const deadlineMs = Date.now() + resolvedDurationSeconds * 1_000;
    let waypointIndex = 1;
    let maximumSectors = 0;
    let paceCaptured = false;
    let cornerCaptured = false;
    let lastLogSecond = -1;
    let goalSatisfied = false;

    while (Date.now() < deadlineMs) {
      const sample = await readWeekendSample(page, startedAtMs);
      if (sample.phase !== "active") {
        samples.push(sample);
        break;
      }
      const command = weekendAiRiderCommand({
        px: sample.xM,
        pz: sample.zM,
        vx: sample.vx,
        vz: sample.vz,
      }, circuit, waypointIndex);
      waypointIndex = command.waypointIndex;
      Object.assign(sample, {
        waypointIndex,
        targetIndex: command.targetIndex,
        targetSpeedMps: command.targetSpeedMps,
        targetDistanceM: command.targetDistanceM,
        headingErrorRad: command.headingErrorRad,
        previewTurnRad: command.previewTurnRad,
        requestedThrottle: command.throttle,
        requestedBrake: command.brake,
        requestedTurn: command.turn,
        requestedBodyLateral: command.bodyLateral,
      });
      samples.push(sample);

      if (!paceCaptured && sample.speedMps >= MINIMUM_PEAK_SPEED_MPS) {
        await capture("at-speed");
        paceCaptured = true;
      }
      if (goal === "lap" && !cornerCaptured && weekendCornerEvidence(sample)) {
        await capture("corner");
        cornerCaptured = true;
      }

      const completedSectors = completedWeekendSectors(sample);
      if (completedSectors > maximumSectors) {
        maximumSectors = completedSectors;
        await capture(`sector-${completedSectors}`);
      }
      if (sample.lap >= 1) {
        await capture("lap-complete");
        goalSatisfied = true;
        break;
      }
      if (goal === "sector" && completedSectors >= 1) {
        goalSatisfied = true;
        break;
      }

      await applyWeekendCommand(page, command);
      const wholeSecond = Math.floor(sample.wallS);
      if (wholeSecond !== lastLogSecond && wholeSecond % 10 === 0) {
        lastLogSecond = wholeSecond;
        console.log(
          `[weekend-ai] t=${sample.wallS.toFixed(1)}s speed=${sample.speedMps.toFixed(1)}m/s `
          + `wp=${waypointIndex}/${circuit.length - 1} sectors=${completedSectors} `
          + `off=${sample.offTrackS.toFixed(2)}s sim=${sample.authorityElapsedS.toFixed(1)}s`,
        );
      }
      await page.waitForTimeout(WEEKEND_AI_SAMPLE_MS);
    }

    await applyWeekendCommand(page, {
      turn: 0,
      bodyLateral: 0,
      throttle: 0,
      brake: 0,
    });
    const finalActive = await readWeekendSample(page, startedAtMs);
    if (finalActive.phase === "active"
      && (samples.length === 0 || finalActive.wallS > samples.at(-1).wallS)) {
      const previous = samples.at(-1);
      Object.assign(finalActive, {
        waypointIndex,
        requestedThrottle: previous?.requestedThrottle ?? 0,
        requestedBrake: previous?.requestedBrake ?? 0,
        requestedTurn: previous?.requestedTurn ?? 0,
        requestedBodyLateral: previous?.requestedBodyLateral ?? 0,
      });
      samples.push(finalActive);
    }
    goalSatisfied ||= goal === "lap"
      ? samples.some((sample) => finite(sample?.lap) >= 1)
      : samples.some((sample) => completedWeekendSectors(sample) >= 1);

    await page.locator("#pause-button").click();
    await page.waitForFunction(
      () => document.querySelector("#pause-menu")?.hidden === false
        && globalThis.__gunsOnlyWeekendAuthority?.phase === "paused",
      undefined,
      { timeout: 10_000 },
    );
    const pauseStartedAtMs = await page.evaluate(() => performance.now());
    const pauseAuthorityBeforeS = await page.evaluate(() =>
      Math.max(0, Number(globalThis.__gunsOnlyWeekendAuthority?.last_lap_s) || 0)
        + Math.max(0, Number(globalThis.__gunsOnlyWeekendAuthority?.lap_time_s) || 0));
    await page.waitForTimeout(600);
    const pauseEvidence = await page.evaluate(({ pauseStartMs, authorityBeforeS }) => {
      const authorityAfterS = Math.max(
        0,
        Number(globalThis.__gunsOnlyWeekendAuthority?.last_lap_s) || 0,
      ) + Math.max(0, Number(globalThis.__gunsOnlyWeekendAuthority?.lap_time_s) || 0);
      return {
        visible: document.querySelector("#pause-menu")?.hidden === false,
        title: document.querySelector("#pause-title")?.textContent?.trim() ?? "",
        detail: document.querySelector("#pause-detail")?.textContent?.trim() ?? "",
        phase: globalThis.__gunsOnlyWeekendAuthority?.phase ?? null,
        heldWallS: (performance.now() - pauseStartMs) / 1_000,
        authorityBeforeS,
        authorityAfterS,
        authorityDeltaS: authorityAfterS - authorityBeforeS,
      };
    }, { pauseStartMs: pauseStartedAtMs, authorityBeforeS: pauseAuthorityBeforeS });
    await capture("paused");

    await page.locator("#pause-end").click();
    await page.waitForFunction(
      () => document.querySelector("#ride-result")?.hidden === false
        && globalThis.__gunsOnlyWeekendAuthority?.phase === "finished"
        && !!globalThis.__gunsOnlyWeekendResult,
      undefined,
      { timeout: 10_000 },
    );
    const debrief = await page.evaluate(() => ({
      visible: document.querySelector("#ride-result")?.hidden === false,
      title: document.querySelector("#result-title")?.textContent?.trim() ?? "",
      verdict: document.querySelector("#result-verdict")?.textContent?.trim() ?? "",
      summary: document.querySelector("#result-summary")?.textContent?.trim() ?? "",
      correction: document.querySelector("#result-correction")?.textContent?.trim() ?? "",
      metrics: {
        laps: document.querySelector("#result-laps")?.textContent?.trim() ?? "",
        last: document.querySelector("#result-last")?.textContent?.trim() ?? "",
        record: document.querySelector("#result-record")?.textContent?.trim() ?? "",
        openLap: document.querySelector("#result-open-lap")?.textContent?.trim() ?? "",
        offTrack: document.querySelector("#result-off-track")?.textContent?.trim() ?? "",
      },
      authority: { ...globalThis.__gunsOnlyWeekendAuthority },
      result: globalThis.__gunsOnlyWeekendResult,
    }));
    await capture("debrief");

    const baseAssessment = assessWeekendAiRide(samples, {
      goal,
      circuitLengthM,
      readyMs,
      startLatencyMs,
      pauseEvidence,
      debrief,
      paceCaptureSeen: paceCaptured,
      cornerCaptureSeen: cornerCaptured,
    });
    const failures = [
      ...baseAssessment.failures,
      ...(!goalSatisfied ? [`${goal} goal timed out after ${resolvedDurationSeconds}s`] : []),
      ...errors.map((error) => `page: ${error}`),
    ];
    const assessment = Object.freeze({
      pass: failures.length === 0,
      failures: Object.freeze(failures),
      metrics: baseAssessment.metrics,
    });
    const result = {
      assessment,
      errors,
      screenshots,
      lifecycle: { pause: pauseEvidence, debrief },
      samples,
    };
    await writeFile(
      `${outputDirectory}/weekend-ai-rider.json`,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    resultWritten = true;
    if (!assessment.pass) {
      throw new Error(`Weekend AI rider failed:\n- ${assessment.failures.join("\n- ")}`);
    }
    return result;
  } catch (error) {
    if (!resultWritten) {
      await page.screenshot({
        path: `${outputDirectory}/weekend-ai-error.png`,
        type: "png",
      }).catch(() => {});
      await writeFile(
        `${outputDirectory}/weekend-ai-rider.json`,
        `${JSON.stringify({
          assessment: { pass: false, failures: [error?.message ?? String(error)] },
          errors,
          screenshots,
          samples,
        }, null, 2)}\n`,
        "utf8",
      ).catch(() => {});
    }
    throw error;
  } finally {
    await applyWeekendCommand(page, {
      turn: 0,
      bodyLateral: 0,
      throttle: 0,
      brake: 0,
    }).catch(() => {});
    await browser.close();
    await site.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const goal = String(argvValue("goal", "lap"));
  const result = await runWeekendAiRide({
    wwwroot: process.env.GUNS_WWWROOT,
    goal,
    durationSeconds: Number(argvValue("seconds", Number.NaN)),
    hardware: argvValue("hardware", false) === true,
    outputDirectory: String(process.env.OUT ?? "/tmp/weekend-ai-rider"),
  });
  console.log(JSON.stringify(result.assessment, null, 2));
}
