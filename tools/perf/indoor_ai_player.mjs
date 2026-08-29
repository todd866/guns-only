#!/usr/bin/env node

import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

export const INDOOR_AI_SAMPLE_MS = 50;
export const INDOOR_AI_TIMEOUT_SECONDS = 45;
export const INDOOR_GAMEPAD_DEADZONE = 0.13;
export const INDOOR_ATTACK_SCAN_IDS = Object.freeze([
  "bracken-intake",
  "bracken-overlook",
]);
export const INDOOR_PROFILE_UI_COPY = Object.freeze({
  "attack-site": Object.freeze({
    brief: "Map both rooms. Keep the fibre attached. Return dark.",
    begin: "LAUNCH QUIET SURVEY",
  }),
  "discretionary-site": Object.freeze({
    brief: "Map both rooms. Return dark or break away if challenged.",
    begin: "LAUNCH DISCRETIONARY SURVEY",
  }),
  "diversion-site": Object.freeze({
    brief: "Map both rooms. Broadcast. Draw the response force in.",
    begin: "LAUNCH DIVERSION SURVEY",
  }),
});
export const INDOOR_ATRIUM_RISE = Object.freeze({
  id: "atrium-rise",
  kind: "waypoint",
  position: Object.freeze({ x: 0, y: 4.35, z: 2.15 }),
  radius: 0.38,
});

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number(value) || 0));

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export function wrapAngleRad(value) {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function distanceBetween(left, right) {
  return Math.hypot(
    finite(left?.x) - finite(right?.x),
    finite(left?.y) - finite(right?.y),
    finite(left?.z) - finite(right?.z),
  );
}

function scanTarget(point) {
  return point ? Object.freeze({
    id: point.id,
    kind: "scan",
    position: Object.freeze({
      x: finite(point.position?.x),
      y: finite(point.position?.y),
      z: finite(point.position?.z),
    }),
    radius: finite(point.radius, 0.9),
  }) : null;
}

/**
 * Return the next authored point without granting the harness action authority. The two scan
 * positions come from the live mission snapshot; only the raised atrium clearance point is
 * pinned here because the browser projection deliberately omits facility geometry.
 */
export function indoorAttackTarget(state, { atriumRiseReached = false } = {}) {
  const survey = state?.survey;
  if (!survey || survey.profileId !== "attack-site") return null;
  const first = survey.scanPoints?.find((point) => point.id === INDOOR_ATTACK_SCAN_IDS[0]);
  const second = survey.scanPoints?.find((point) => point.id === INDOOR_ATTACK_SCAN_IDS[1]);
  if (!first?.complete) return scanTarget(first);
  if (!atriumRiseReached) return INDOOR_ATRIUM_RISE;
  if (!second?.complete) return scanTarget(second);
  return null;
}

/**
 * Position/velocity controller expressed as the standard pad axes consumed by indoor/game.js.
 * The drone starts facing -Z; world velocity errors are transformed into its current body frame
 * so this remains closed-loop if yaw is disturbed.
 */
export function indoorAiPilotCommand(state, target) {
  if (!state?.drone?.position || !state?.drone?.velocity || !target?.position) {
    throw new TypeError("Indoor AI pilot requires drone state and a target position");
  }
  const position = state.drone.position;
  const velocity = state.drone.velocity;
  const delta = {
    x: finite(target.position.x) - finite(position.x),
    y: finite(target.position.y) - finite(position.y),
    z: finite(target.position.z) - finite(position.z),
  };
  const rangeM = Math.hypot(delta.x, delta.y, delta.z);
  const desiredSpeedMps = rangeM < 0.05
    ? 0
    : clamp(rangeM * 1.2, 0.22, target.kind === "scan" ? 2.8 : 2.45);
  const scale = rangeM > 1e-9 ? desiredSpeedMps / rangeM : 0;
  const desiredVelocity = {
    x: delta.x * scale,
    y: delta.y * scale,
    z: delta.z * scale,
  };
  const worldCommand = {};
  for (const axis of ["x", "y", "z"]) {
    // 3.8 / 13.5 is the production drag/acceleration feed-forward. The error term brakes the
    // airframe into each dwell sphere instead of merely pointing it through the marker.
    worldCommand[axis] = clamp(
      (desiredVelocity[axis] - finite(velocity[axis])) * 0.7
        + desiredVelocity[axis] * 3.8 / 13.5,
      -1,
      1,
    );
  }

  const yaw = finite(state.drone.yaw);
  const forward = worldCommand.x * Math.sin(yaw) - worldCommand.z * Math.cos(yaw);
  const right = worldCommand.x * Math.cos(yaw) + worldCommand.z * Math.sin(yaw);
  return Object.freeze({
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    up: clamp(worldCommand.y, -1, 1),
    yaw: clamp(wrapAngleRad(-yaw) * 1.2, -1, 1),
    pitch: clamp(-finite(state.drone.pitch), -1, 1),
    target: Object.freeze({
      id: target.id,
      kind: target.kind,
      rangeM,
      desiredSpeedMps,
    }),
  });
}

/** Preserve small deliberate commands across the production pad's hard deadzone. */
export function standardGamepadAxis(value, deadzone = INDOOR_GAMEPAD_DEADZONE) {
  const axis = clamp(value, -1, 1);
  if (Math.abs(axis) < 0.055) return 0;
  return Math.sign(axis) * Math.max(deadzone + 0.01, Math.abs(axis));
}

export function standardGamepadPayload(command = {}) {
  return Object.freeze({
    axes: Object.freeze([
      standardGamepadAxis(command.right),
      standardGamepadAxis(-finite(command.forward)),
      standardGamepadAxis(command.yaw),
      standardGamepadAxis(-finite(command.pitch)),
    ]),
    up: Math.max(0, finite(command.up)),
    down: Math.max(0, -finite(command.up)),
  });
}

function uniqueEvents(samples) {
  const byId = new Map();
  for (const sample of samples ?? []) {
    for (const event of sample?.events ?? []) {
      const key = Number.isFinite(Number(event?.id))
        ? Number(event.id)
        : `${event?.type}:${event?.scanId ?? ""}:${event?.tick ?? ""}`;
      if (!byId.has(key)) byId.set(key, event);
    }
  }
  return [...byId.values()].sort((left, right) =>
    finite(left?.id, finite(left?.tick)) - finite(right?.id, finite(right?.tick)));
}

export function assessIndoorAttackSite(samples, journey = {}, errors = []) {
  const failures = [];
  const evidence = uniqueEvents(samples);
  const last = samples?.at(-1) ?? {};
  const expectedScreenshots = [
    "quarantine",
    "briefing",
    "first-scan",
    "atrium-rise",
    "second-scan",
    "return",
    "result",
  ];

  if (!Array.isArray(samples) || samples.length < 3) failures.push("insufficient flight samples");
  if (journey.quarantineVisible !== true) failures.push("quarantine boundary was not visible");
  if (journey.previewClicked !== true) failures.push("preview was not entered through its visible link");
  if (journey.briefingVisible !== true) failures.push("attack-site briefing was not visible");
  for (const [profileId, expected] of Object.entries(INDOOR_PROFILE_UI_COPY)) {
    const observed = journey.profileBriefings?.[profileId];
    if (observed?.selectedMissionId !== profileId
      || observed?.brief !== expected.brief
      || observed?.begin !== expected.begin) {
      failures.push(`${profileId} did not expose its concise live briefing`);
    }
  }
  if (journey.beginClicked !== true) failures.push("mission was not launched through the visible button");
  if (journey.gamepadResponseObserved !== true) {
    failures.push("production flight state did not respond to synthetic gamepad input");
  }
  if (journey.atriumRiseReached !== true) failures.push("pilot did not traverse the raised atrium waypoint");
  if (journey.returnKeyPressed !== true) failures.push("operator return was not requested with real input");
  const screenshots = new Set(journey.screenshots ?? []);
  for (const name of expectedScreenshots) {
    if (!screenshots.has(name)) failures.push(`missing ${name} phase screenshot`);
    if (finite(journey.screenshotBytes?.[name]) < 1_024) {
      failures.push(`${name} phase screenshot was empty or missing on disk`);
    }
  }
  for (const error of errors ?? []) failures.push(`page: ${error}`);

  const active = (samples ?? []).filter((sample) => sample.bodyPhase === "active");
  if (!active.length) failures.push("mission never entered active flight");
  if (active.some((sample) => sample.paused === true)) failures.push("mission paused during AI flight");
  if (active.some((sample) => sample.gamepadConnected !== true
    || sample.gamepadMapping !== "standard")) {
    failures.push("synthetic standard gamepad was not continuously exposed during flight");
  }
  if (active.some((sample) => sample.gamepadActionsNeutral !== true)) {
    failures.push("gamepad non-flight action buttons were not neutral");
  }
  if (active.some((sample) => sample.audioEnabled !== true
    || sample.audioSilentQa !== true
    || sample.audioContextState !== "running"
    || sample.audioMasterGain !== 0)) {
    failures.push("silent QA did not keep the live Indoor audio graph running and destination-muted");
  }
  if (active.some((sample) => sample.rendererReady !== true
    || sample.framebufferWidth < 1_000
    || sample.framebufferHeight < 600
    || sample.webglContextLost === true
    || sample.renderTriangleCount < 1)) {
    failures.push("production renderer did not expose a full-size live framebuffer");
  }
  const renderFrames = active.map((sample) => finite(sample.renderFrameCount));
  if (!renderFrames.length
    || Math.max(...renderFrames) - Math.min(...renderFrames) < 5) {
    failures.push("production WebGL frame counter did not advance during flight");
  }
  if (active.some((sample) => sample.visibleRouteCueCount > 2)) {
    failures.push("more than two spatial route cues obstructed the corridor");
  }
  if (active.some((sample) => sample.visibleCompletedSurveyMarkerCount > 0)) {
    failures.push("captured survey markers remained in the flight path");
  }
  const hasOrderedCues = (sample, direction) => {
    const indices = sample.visibleRouteCueIndices ?? [];
    const anchor = finite(sample.routeCueAnchor, -1);
    return sample.routeCueDirection === direction
      && indices.length >= 1
      && indices.length <= 2
      && indices.every((index) => {
        const offset = direction === "return"
          ? anchor - finite(index, anchor)
          : finite(index, anchor) - anchor;
        return offset >= 1 && offset <= 2;
      });
  };
  if (!active.some((sample) => sample.returnRequested !== true
    && hasOrderedCues(sample, "ingress"))) {
    failures.push("fixed ingress cues did not lead the aircraft along the authored route");
  }
  if (!(samples ?? []).some((sample) => sample.returnRequested === true
    && hasOrderedCues(sample, "return"))) {
    failures.push("fixed spatial cues did not reverse for autonomous recovery");
  }
  if (!active.some((sample) => sample.command
    && Math.hypot(sample.command.forward, sample.command.right, sample.command.up) > 0.2)) {
    failures.push("pilot issued no material gamepad flight command");
  }
  if (last.selectedMissionId !== "attack-site") failures.push("wrong indoor profile was flown");
  if (last.status !== "success" || last.success !== true || last.failure === true) {
    failures.push(`terminal mission status was ${last.status ?? "missing"}`);
  }
  if (last.bodyPhase !== "result" || last.resultVisible !== true) {
    failures.push("successful result screen was not reached");
  }
  if (last.resultTitle !== "Route stayed dark") failures.push("dark-route result was not presented");
  if (last.linkMode !== "fiber" || last.fiberConnected !== true
    || last.fiberDetached === true) failures.push("optical fiber was not intact at recovery");
  if ((samples ?? []).some((sample) => sample.linkMode !== "fiber")) {
    failures.push("mission left the optical link at least once");
  }
  if ((samples ?? []).some((sample) => sample.breach !== null && sample.breach !== undefined)) {
    failures.push("stealth doctrine was breached");
  }
  const maximumShots = Math.max(0, ...(samples ?? []).map((sample) => finite(sample.shots)));
  if (maximumShots !== 0) failures.push(`gun fired ${maximumShots} shots`);
  const maximumCollisions = Math.max(
    0,
    ...(samples ?? []).map((sample) => finite(sample.collisionCount)),
  );
  if (maximumCollisions !== 0) failures.push(`drone recorded ${maximumCollisions} collisions`);
  const maximumSnags = Math.max(0, ...(samples ?? []).map((sample) => finite(sample.fiberSnags)));
  if (maximumSnags !== 0) failures.push(`fiber snagged ${maximumSnags} times`);
  if (last.scansCompleted !== 2 || last.scansTotal !== 2) failures.push("both scans did not complete");
  if (last.returnRequested !== true || last.silentReturn !== true
    || last.returnedHome !== true || last.returnComplete !== true) {
    failures.push("silent autonomous return did not complete");
  }

  const scanEvents = evidence.filter((event) => event?.type === "survey-scan-complete");
  const scanIds = scanEvents.map((event) => event.scanId);
  if (scanIds.length !== INDOOR_ATTACK_SCAN_IDS.length
    || scanIds.some((id, index) => id !== INDOOR_ATTACK_SCAN_IDS[index])) {
    failures.push(`scan event order was ${scanIds.join(" → ") || "empty"}`);
  }
  for (const id of INDOOR_ATTACK_SCAN_IDS) {
    if (scanEvents.filter((event) => event.scanId === id).length !== 1) {
      failures.push(`${id} did not complete exactly once`);
    }
  }
  const returnEvent = evidence.find((event) => event?.type === "survey-return-started");
  if (returnEvent?.source !== "operator" || returnEvent?.silent !== true) {
    failures.push("authority did not record an operator-requested silent return");
  }
  const forbiddenEvents = evidence.filter((event) => [
    "fiber-detached",
    "fiber-snagged",
    "gun-fired",
    "survey-broadcast-started",
    "survey-stealth-breached",
    "mission-failed",
  ].includes(event?.type));
  if (forbiddenEvents.length) {
    failures.push(`forbidden events: ${forbiddenEvents.map((event) => event.type).join(", ")}`);
  }
  if (!evidence.some((event) => event?.type === "survey-complete")
    || !evidence.some((event) => event?.type === "mission-complete")) {
    failures.push("terminal survey evidence is incomplete");
  }

  const first = samples?.[0] ?? {};
  const tickSpan = finite(last.tick) - finite(first.tick);
  if (tickSpan < 120) failures.push(`simulation tick advanced only ${tickSpan}`);
  const durationSeconds = Math.max(0, finite(last.wallS) - finite(first.wallS));
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      durationSeconds,
      tickSpan,
      sampleCount: samples?.length ?? 0,
      scanIds: Object.freeze(scanIds),
      maximumShots,
      maximumCollisions,
      maximumSnags,
      maximumVisibleRouteCues: Math.max(
        0,
        ...active.map((sample) => finite(sample.visibleRouteCueCount)),
      ),
      renderFrameSpan: renderFrames.length
        ? Math.max(...renderFrames) - Math.min(...renderFrames) : 0,
      minimumRenderTriangles: active.length ? Math.min(
        ...active.map((sample) => finite(sample.renderTriangleCount)),
      ) : 0,
      profileBriefingsVerified: Object.keys(journey.profileBriefings ?? {}).length,
      finalBattery: finite(last.battery),
      finalIntegrity: finite(last.integrity),
      eventCount: evidence.length,
    }),
  });
}

const FAKE_STANDARD_PAD_SOURCE = () => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = {
    id: "Guns Only Indoor AI Player",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  };
  globalThis.__gunsOnlyIndoorAiPad = pad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};

async function applyGamepadCommand(page, command = {}) {
  const padCommand = standardGamepadPayload(command);
  await page.evaluate((next) => {
    const pad = globalThis.__gunsOnlyIndoorAiPad;
    if (!pad) throw new Error("Indoor AI gamepad was not installed before boot");
    pad.axes.splice(0, pad.axes.length, ...next.axes);
    for (const button of pad.buttons) {
      button.pressed = false;
      button.touched = false;
      button.value = 0;
    }
    pad.buttons[7].pressed = next.up > 0.01;
    pad.buttons[7].touched = next.up > 0.01;
    pad.buttons[7].value = next.up;
    pad.buttons[6].pressed = next.down > 0.01;
    pad.buttons[6].touched = next.down > 0.01;
    pad.buttons[6].value = next.down;
    pad.timestamp = performance.now();
  }, padCommand);
}

async function readObservation(page, startedAtMs) {
  return page.evaluate((startMs) => {
    const diagnostics = globalThis.__gunsIndoor;
    const state = diagnostics?.state ?? null;
    const pad = navigator.getGamepads?.()[0] ?? null;
    return {
      wallS: (performance.now() - startMs) / 1000,
      state,
      ui: {
        bodyPhase: document.body.dataset.phase ?? null,
        paused: diagnostics?.paused === true,
        selectedMissionId: diagnostics?.selectedMissionId ?? null,
        fatalVisible: document.querySelector("#fatal")?.classList.contains("visible") === true,
        briefingVisible: document.querySelector("#briefing")?.classList.contains("visible") === true,
        resultVisible:
          document.querySelector("#result-screen")?.classList.contains("visible") === true,
        resultTitle: document.querySelector("#result-title")?.textContent?.trim() ?? "",
      },
      pad: {
        connected: pad?.connected === true && pad?.id === "Guns Only Indoor AI Player",
        mapping: pad?.mapping ?? null,
        actionsNeutral: pad ? pad.buttons.every((button, index) =>
          index === 6 || index === 7
            || (button?.pressed !== true && Number(button?.value) === 0)) : false,
      },
      audio: diagnostics?.audioDiagnostics ?? null,
      visual: diagnostics?.visualDiagnostics ?? null,
    };
  }, startedAtMs);
}

function compactSample(observation, command = null) {
  const state = observation?.state ?? {};
  const drone = state.drone ?? {};
  const survey = state.survey ?? {};
  const audio = observation?.audio ?? {};
  const visual = observation?.visual ?? {};
  const audioMasterGain = typeof audio.masterGain === "number"
    && Number.isFinite(audio.masterGain) ? audio.masterGain : null;
  return {
    wallS: finite(observation?.wallS),
    bodyPhase: observation?.ui?.bodyPhase ?? null,
    paused: observation?.ui?.paused === true,
    selectedMissionId: observation?.ui?.selectedMissionId ?? null,
    fatalVisible: observation?.ui?.fatalVisible === true,
    resultVisible: observation?.ui?.resultVisible === true,
    resultTitle: observation?.ui?.resultTitle ?? "",
    gamepadConnected: observation?.pad?.connected === true,
    gamepadMapping: observation?.pad?.mapping ?? null,
    gamepadActionsNeutral: observation?.pad?.actionsNeutral === true,
    audioEnabled: audio.enabled === true,
    audioSilentQa: audio.silentQa === true,
    audioContextState: audio.contextState ?? null,
    audioMasterGain,
    rendererReady: visual.rendererReady === true,
    framebufferWidth: finite(visual.framebufferWidth),
    framebufferHeight: finite(visual.framebufferHeight),
    visibleRouteCueCount: finite(visual.visibleRouteCueCount),
    routeCueDirection: visual.routeDirection ?? null,
    routeCueAnchor: finite(visual.routeCueAnchor, -1),
    visibleRouteCueIndices: Array.isArray(visual.visibleRouteCueIndices)
      ? visual.visibleRouteCueIndices.map((index) => finite(index, -1)) : [],
    renderFrameCount: finite(visual.renderFrameCount),
    renderTriangleCount: finite(visual.renderTriangleCount),
    webglContextLost: visual.webglContextLost === true,
    visibleCompletedSurveyMarkerCount:
      Array.isArray(visual.visibleCompletedSurveyMarkerIds)
        ? visual.visibleCompletedSurveyMarkerIds.length : -1,
    tick: finite(state.tick),
    time: finite(state.time),
    status: state.status ?? null,
    success: state.success === true,
    failure: state.failure === true,
    failureReason: state.failureReason ?? null,
    x: finite(drone.position?.x),
    y: finite(drone.position?.y),
    z: finite(drone.position?.z),
    vx: finite(drone.velocity?.x),
    vy: finite(drone.velocity?.y),
    vz: finite(drone.velocity?.z),
    yaw: finite(drone.yaw),
    pitch: finite(drone.pitch),
    battery: finite(drone.battery),
    integrity: finite(drone.integrity),
    collisionCount: finite(drone.collisionCount),
    autonomyMode: drone.autonomy?.mode ?? null,
    linkMode: state.link?.mode ?? null,
    fiberConnected: state.link?.fiber?.connected === true,
    fiberDetached: state.link?.fiber?.detached === true,
    fiberSnags: finite(state.link?.fiber?.snags),
    fiberTension: finite(state.link?.fiber?.tension),
    shots: finite(state.gun?.shots),
    ammo: finite(drone.ammo),
    breach: survey.breach ?? null,
    surveyPhase: survey.phase ?? null,
    scanning: survey.scanning === true,
    currentScanId: survey.currentScanId ?? null,
    scansCompleted: finite(survey.objectives?.scan?.completed),
    scansTotal: finite(survey.objectives?.scan?.total),
    returnRequested: survey.returnRequested === true,
    silentReturn: survey.silentReturn === true,
    returnedHome: survey.returnedHome === true,
    returnComplete: survey.objectives?.return?.complete === true,
    targetId: command?.target?.id ?? null,
    targetKind: command?.target?.kind ?? null,
    targetRangeM: command?.target?.rangeM ?? null,
    command: command ? {
      forward: command.forward,
      right: command.right,
      up: command.up,
      yaw: command.yaw,
      pitch: command.pitch,
    } : null,
    events: Array.isArray(state.events)
      ? state.events.map((event) => ({
        id: event.id,
        tick: event.tick,
        time: event.time,
        type: event.type,
        scanId: event.scanId ?? null,
        source: event.source ?? null,
        silent: event.silent ?? null,
        reason: event.reason ?? null,
      }))
      : [],
  };
}

function argvFlag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

export async function runIndoorAiPlayer({
  wwwroot,
  timeoutSeconds = INDOOR_AI_TIMEOUT_SECONDS,
  hardware = false,
  outputDirectory = "/tmp/indoor-ai-player",
} = {}) {
  if (!wwwroot) throw new TypeError("runIndoorAiPlayer requires a published wwwroot");
  await mkdir(outputDirectory, { recursive: true });
  const journey = {
    quarantineVisible: false,
    previewClicked: false,
    briefingVisible: false,
    profileBriefings: {},
    beginClicked: false,
    atriumRiseReached: false,
    returnKeyPressed: false,
    screenshots: [],
    screenshotBytes: {},
    gamepadResponseObserved: false,
  };
  const samples = [];
  const errors = [];
  let site = null;
  let browser = null;
  let context = null;
  let page = null;
  let firstScanCaptured = false;
  let secondScanCaptured = false;
  let returnCaptured = false;
  let resultCaptured = false;
  let startedAtMs = null;
  let activeStartPosition = null;

  const capture = async (name, fullPage = false) => {
    if (!page || page.isClosed()) return;
    const bytes = await page.screenshot({
      path: `${outputDirectory}/indoor-ai-${name}.png`,
      type: "png",
      fullPage,
    });
    journey.screenshotBytes[name] = bytes.byteLength;
    if (!journey.screenshots.includes(name)) journey.screenshots.push(name);
  };

  try {
    site = await serveStatic(wwwroot);
    browser = await chromium.launch({
      headless: !hardware,
      args: hardware
        ? ["--use-angle=metal", "--enable-webgl-draft-extensions"]
        : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(FAKE_STANDARD_PAD_SOURCE);
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
    page.on("crash", () => errors.push("browser page crashed"));

    await page.goto(`${site.url}indoor/?audioQa=silent`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.locator("#release-quarantine").waitFor({ state: "visible", timeout: 10_000 });
    journey.quarantineVisible = await page.locator("#release-quarantine").isVisible();
    await capture("quarantine", true);

    const preview = page.getByRole("link", { name: /open experimental preview/i });
    const previewHref = await preview.getAttribute("href");
    if (!previewHref
      || new URL(previewHref, page.url()).searchParams.get("preview") !== "1") {
      throw new Error("quarantine preview link did not carry an explicit preview acknowledgement");
    }
    await preview.click();
    journey.previewClicked = true;
    await page.waitForFunction(
      () => globalThis.__gunsIndoor?.ready === true
        && document.body.dataset.phase === "briefing",
      undefined,
      { timeout: 30_000 },
    );
    for (const [profileId] of Object.entries(INDOOR_PROFILE_UI_COPY)) {
      await page.locator(`[data-mission-id="${profileId}"]`).click();
      await page.waitForFunction(
        (expectedId) => globalThis.__gunsIndoor?.selectedMissionId === expectedId,
        profileId,
      );
      journey.profileBriefings[profileId] = await page.evaluate(() => ({
        selectedMissionId: globalThis.__gunsIndoor?.selectedMissionId ?? null,
        brief: document.querySelector("#mission-brief")?.textContent?.trim() ?? "",
        begin: document.querySelector("#begin-button")?.textContent?.trim() ?? "",
      }));
    }
    await page.locator('[data-mission-id="attack-site"]').click();
    await page.waitForFunction(
      () => globalThis.__gunsIndoor?.selectedMissionId === "attack-site"
        && document.querySelector("#briefing")?.classList.contains("visible") === true,
    );
    journey.briefingVisible = true;
    await capture("briefing", true);

    await page.locator("#begin-button").click();
    journey.beginClicked = true;
    await page.waitForFunction(
      () => document.body.dataset.phase === "active"
        && globalThis.__gunsIndoor?.paused === false
        && globalThis.__gunsIndoor?.state?.status === "active"
        && globalThis.__gunsIndoor?.audioDiagnostics?.contextState === "running"
        && globalThis.__gunsIndoor?.visualDiagnostics?.renderFrameCount > 0,
      undefined,
      { timeout: 10_000 },
    );
    startedAtMs = await page.evaluate(() => performance.now());
    const deadlineMs = Date.now() + Number(timeoutSeconds) * 1000;
    let lastLogSecond = -1;

    while (Date.now() < deadlineMs) {
      const observation = await readObservation(page, startedAtMs);
      const state = observation.state;
      if (!state) throw new Error("Indoor authority snapshot disappeared during flight");
      if (!activeStartPosition) activeStartPosition = { ...state.drone.position };
      if (!journey.gamepadResponseObserved
        && state.survey?.returnRequested !== true
        && distanceBetween(activeStartPosition, state.drone.position) >= 0.3) {
        journey.gamepadResponseObserved = true;
      }

      const riseDistance = distanceBetween(state.drone?.position, INDOOR_ATRIUM_RISE.position);
      if (state.survey?.scanPoints?.[0]?.complete === true
        && !journey.atriumRiseReached
        && riseDistance <= INDOOR_ATRIUM_RISE.radius) {
        journey.atriumRiseReached = true;
        await applyGamepadCommand(page);
        await capture("atrium-rise");
      }

      const target = indoorAttackTarget(state, journey);
      const command = state.status === "active" && target
        ? indoorAiPilotCommand(state, target)
        : null;
      samples.push(compactSample(observation, command));

      if (state.survey?.scanPoints?.[0]?.complete === true && !firstScanCaptured) {
        firstScanCaptured = true;
        await applyGamepadCommand(page);
        await capture("first-scan");
      }
      if (state.survey?.objectives?.scan?.complete === true && !secondScanCaptured) {
        secondScanCaptured = true;
        await applyGamepadCommand(page);
        await capture("second-scan");
      }
      if (state.survey?.objectives?.scan?.complete === true
        && !journey.returnKeyPressed && state.status === "active") {
        await applyGamepadCommand(page);
        await page.keyboard.press("r");
        journey.returnKeyPressed = true;
      }
      if (state.survey?.returnRequested === true && !returnCaptured) {
        returnCaptured = true;
        await applyGamepadCommand(page);
        await capture("return");
      }
      if (observation.ui.resultVisible && !resultCaptured) {
        resultCaptured = true;
        await applyGamepadCommand(page);
        await capture("result", true);
      }

      if (observation.ui.fatalVisible) throw new Error("Indoor route displayed its fatal screen");
      if (observation.ui.resultVisible || state.failure === true) break;
      await applyGamepadCommand(page, command ?? {});

      const wholeSecond = Math.floor(observation.wallS);
      if (wholeSecond !== lastLogSecond && wholeSecond % 2 === 0) {
        lastLogSecond = wholeSecond;
        console.log(
          `[indoor-ai] t=${observation.wallS.toFixed(1)}s target=${target?.id ?? "return"} `
          + `pos=${state.drone.position.x.toFixed(2)},${state.drone.position.y.toFixed(2)},`
          + `${state.drone.position.z.toFixed(2)} scans=${state.survey.objectives.scan.completed}/2`,
        );
      }
      await page.waitForTimeout(INDOOR_AI_SAMPLE_MS);
    }

    await applyGamepadCommand(page);
    if (!samples.at(-1)?.resultVisible) {
      const observation = await readObservation(
        page,
        startedAtMs ?? await page.evaluate(() => performance.now()),
      );
      samples.push(compactSample(observation));
      if (observation.ui.resultVisible && !resultCaptured) {
        resultCaptured = true;
        await capture("result", true);
      }
    }
    if (!samples.at(-1)?.resultVisible && !samples.at(-1)?.failure) {
      errors.push(`mission exceeded ${Number(timeoutSeconds).toFixed(1)} second deadline`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    if (page && !page.isClosed()) await capture("failure", true).catch(() => {});
  } finally {
    if (page && !page.isClosed()) await applyGamepadCommand(page).catch(() => {});
  }

  for (const [label, close] of [
    ["browser context", () => context?.close()],
    ["browser", () => browser?.close()],
    ["static server", () => site?.close()],
  ]) {
    try {
      await close();
    } catch (error) {
      errors.push(`${label} cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const assessment = assessIndoorAttackSite(samples, journey, errors);
  const result = {
    assessment,
    journey,
    errors,
    samples,
  };
  await writeFile(
    `${outputDirectory}/indoor-ai-player.json`,
    JSON.stringify(result, null, 2),
  );
  if (!assessment.pass) {
    throw new Error(`Indoor AI player failed:\n- ${assessment.failures.join("\n- ")}`);
  }
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  const result = await runIndoorAiPlayer({
    wwwroot: process.env.GUNS_WWWROOT,
    timeoutSeconds: Number(argvFlag("seconds", INDOOR_AI_TIMEOUT_SECONDS)),
    hardware: argvFlag("hardware", false) === true,
    outputDirectory: String(process.env.OUT ?? "/tmp/indoor-ai-player"),
  });
  console.log(JSON.stringify(result.assessment, null, 2));
}
