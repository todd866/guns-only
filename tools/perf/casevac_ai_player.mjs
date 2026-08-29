#!/usr/bin/env node

import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";
import { CONTROL_BINDINGS } from "../../web/wwwroot/render/settings/player_settings.js";

const requireFromSmoke = createRequire(
  process.env.GUNS_SMOKE_PACKAGE
    ?? new URL("../../web/smoke/package.json", import.meta.url),
);
const { chromium } = requireFromSmoke("playwright");

export const CASEVAC_AI_MISSION_ID =
  "mission.ukraine-2030s.casevac-low-level.prototype.v1";
export const CASEVAC_AI_SAMPLE_MS = 50;
export const CASEVAC_AI_TIMEOUT_SECONDS = 420;
export const CASEVAC_GAMEPAD_DEADZONE = 0.14;
export const CASEVAC_APPROACH_HOVER_AGL_M = 6;
export const CASEVAC_CONTACT_HOLD_AGL_M = 1.65;
// The reduced-order vehicle's skids touch at 1.5 m COM AGL. A command exactly at that boundary
// asymptotically hovers a few centimetres high under discrete controls, so command a modest 0.3 m
// through the plane; the authoritative contact solver clamps the vehicle at a gentle touchdown.
export const CASEVAC_CONTACT_TARGET_AGL_M = 1.2;
const bindingCode = (action) => CONTROL_BINDINGS.find((binding) =>
  binding.action === action)?.defaultCode;
export const CASEVAC_KEY_BINDINGS = Object.freeze({
  forwardPositive: bindingCode("push"),
  forwardNegative: bindingCode("pull"),
  yawPositive: bindingCode("rudderRight"),
  yawNegative: bindingCode("rudderLeft"),
});
export const CASEVAC_REQUIRED_PHASES = Object.freeze([
  "INGRESS",
  "PICKUP_APPROACH",
  "LOADING",
  "OUTBOUND",
  "DROPOFF_APPROACH",
  "HANDOFF",
  "QUIET",
  "COMPLETE",
]);
export const CASEVAC_REQUIRED_EVENTS = Object.freeze([
  "CASEVAC_TASK_STARTED",
  "PICKUP_APPROACH_ENTERED",
  "LOADING_STARTED",
  "CAPSULE_SECURED",
  "DROPOFF_APPROACH_ENTERED",
  "HANDOFF_STARTED",
  "HANDOFF_COMPLETED",
]);

const MAXIMUM_FORWARD_SPEED_MPS = 32;
const MAXIMUM_REVERSE_SPEED_MPS = 8;
const MAXIMUM_LATERAL_SPEED_MPS = 11;
const MAXIMUM_VERTICAL_SPEED_MPS = 2;

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, finite(value)));

export function wrapAngleRad(value) {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function horizontalDistance(left, right) {
  return Math.hypot(
    finite(left?.x ?? left?.east_m) - finite(right?.x ?? right?.east_m),
    finite(left?.z ?? left?.north_m) - finite(right?.z ?? right?.north_m),
  );
}

/** Undo the production standard-pad deadzone so the requested lateral value reaches the kernel. */
export function rawCasevacGamepadAxis(value, deadzone = CASEVAC_GAMEPAD_DEADZONE) {
  const axis = clamp(value, -1, 1);
  if (Math.abs(axis) < 1e-6) return 0;
  return Math.sign(axis) * (deadzone + Math.abs(axis) * (1 - deadzone));
}

/** Invert the production circular deadzone without distorting simultaneous forward/side input. */
export function rawCasevacGamepadAxes(rightValue, forwardValue, {
  deadzone = CASEVAC_GAMEPAD_DEADZONE,
} = {}) {
  let x = clamp(rightValue, -1, 1);
  // Standard pad stick-forward is negative physical Y; CASEVAC semantic forward is positive.
  let y = -clamp(forwardValue, -1, 1);
  let magnitude = Math.hypot(x, y);
  if (magnitude < 1e-6) return Object.freeze({ x: 0, y: 0 });
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
    magnitude = 1;
  }
  const rawMagnitude = deadzone + magnitude * (1 - deadzone);
  const scale = rawMagnitude / magnitude;
  return Object.freeze({ x: x * scale, y: y * scale });
}

export function orderedValuesVisited(samples, property, requiredValues) {
  const visited = [];
  for (const sample of samples ?? []) {
    const value = String(sample?.[property] ?? "").toUpperCase();
    if (value && value !== visited.at(-1)) visited.push(value);
  }
  let cursor = 0;
  for (const requiredValue of requiredValues ?? []) {
    const wanted = String(requiredValue).toUpperCase();
    while (cursor < visited.length && visited[cursor] !== wanted) cursor += 1;
    if (cursor >= visited.length) return Object.freeze({ pass: false, visited });
    cursor += 1;
  }
  return Object.freeze({ pass: true, visited });
}

/**
 * Error-diffusion turns a normalized semantic axis into real held/released controls at 20 Hz.
 * This preserves the production keyboard/button path without pretending those controls are analog.
 */
export class CasevacDigitalAxisModulator {
  constructor() {
    this.residue = new Map();
  }

  next(name, value) {
    const axis = clamp(value, -1, 1);
    if (Math.abs(axis) < 0.01) {
      this.residue.set(name, 0);
      return 0;
    }
    const magnitude = Math.abs(axis);
    const combined = finite(this.residue.get(name)) + magnitude;
    const active = combined >= 0.5;
    this.residue.set(name, combined - (active ? 1 : 0));
    return active ? Math.sign(axis) : 0;
  }

  command(command = {}) {
    return Object.freeze({
      forward: this.next("forward", command.forward),
      vertical: this.next("vertical", command.vertical),
      yaw: this.next("yaw", command.yaw),
    });
  }
}

function normalizedRoutePoint(point, route, index) {
  return Object.freeze({
    id: String(point?.id ?? `${route?.id ?? "route"}.${index}`),
    routeId: String(route?.id ?? ""),
    leg: String(route?.leg ?? "").toUpperCase(),
    kind: String(route?.kind ?? "").toUpperCase(),
    index,
    x: finite(point?.east_m),
    y: finite(point?.surface_elevation_m),
    z: finite(point?.north_m),
    targetAglM: finite(point?.target_agl_m, 34),
    corridorRadiusM: finite(point?.corridor_radius_m, 80),
  });
}

export function casevacDirectRoute(state, leg) {
  const wanted = String(leg ?? "").toUpperCase();
  const route = (state?.casevac_routes ?? []).find((candidate) =>
    String(candidate?.kind ?? "").toUpperCase() === "DIRECT"
      && String(candidate?.leg ?? "").toUpperCase() === wanted);
  if (!route || !Array.isArray(route.control_points)) return null;
  return Object.freeze({
    id: String(route.id ?? ""),
    leg: wanted,
    kind: "DIRECT",
    points: Object.freeze(route.control_points.map((point, index) =>
      normalizedRoutePoint(point, route, index))),
  });
}

export function casevacLegForPhase(phase) {
  const token = String(phase ?? "").toUpperCase();
  if (["INGRESS", "PICKUP_APPROACH", "LOADING"].includes(token)) return "INGRESS";
  if (["OUTBOUND", "DROPOFF_APPROACH", "HANDOFF", "QUIET", "COMPLETE"]
    .includes(token)) return "OUTBOUND";
  return null;
}

/**
 * Browser counterpart of the flight runtime's own test pilot. The output is semantic intent only;
 * the runner must express it as ordinary gamepad buttons/axis and keyboard keys.
 */
export function casevacAiCommand(state, target, {
  land = false,
  landingCommitted = false,
  landingHeadingRad = null,
} = {}) {
  if (!state || !target) throw new TypeError("CASEVAC AI pilot requires state and target");
  const dx = finite(target.x) - finite(state.px);
  const dz = finite(target.z) - finite(state.pz);
  const rangeM = Math.hypot(dx, dz);
  let desiredSpeedMps = Math.min(
    MAXIMUM_FORWARD_SPEED_MPS,
    rangeM * (land ? 0.12 : 0.20),
  );
  if (land && rangeM < 3) desiredSpeedMps = 0;
  const inverseRange = rangeM > 1e-9 ? 1 / rangeM : 0;
  const desiredEastMps = dx * inverseRange * desiredSpeedMps;
  const desiredNorthMps = dz * inverseRange * desiredSpeedMps;
  const yaw = finite(state.casevac_heading_deg) * Math.PI / 180;
  const forwardEast = Math.sin(yaw);
  const forwardNorth = Math.cos(yaw);
  const rightEast = Math.cos(yaw);
  const rightNorth = -Math.sin(yaw);
  const desiredForwardMps = desiredEastMps * forwardEast
    + desiredNorthMps * forwardNorth;
  const desiredRightMps = desiredEastMps * rightEast
    + desiredNorthMps * rightNorth;
  const forward = desiredForwardMps >= 0
    ? desiredForwardMps / MAXIMUM_FORWARD_SPEED_MPS
    : desiredForwardMps / MAXIMUM_REVERSE_SPEED_MPS;
  const right = desiredRightMps / MAXIMUM_LATERAL_SPEED_MPS;

  // Transit guidance is authored as AGL, not absolute altitude. Reconstruct the current terrain
  // surface from the observer-safe AGL fact so a sparse control point beyond a valley cannot make
  // the pilot hold its distant surface elevation across the whole segment. Only a stabilized,
  // footprint-centred landing commit uses the site's exact published surface.
  const routeTargetAglM = land && rangeM <= 80
    ? CASEVAC_APPROACH_HOVER_AGL_M
    : finite(target.targetAglM, 34);
  const currentSurfaceM = finite(state.py) - finite(state.casevac_agl_m);
  const targetHeightM = land && landingCommitted
    ? finite(target.y) + CASEVAC_CONTACT_TARGET_AGL_M
    : Math.max(
      currentSurfaceM + routeTargetAglM,
      // Anticipate a rising destination surface. Pure current-AGL control reached three metres
      // clearance on the receiver ridge because the vehicle can only climb at two metres/second.
      finite(target.y) + routeTargetAglM,
    );
  const heightErrorM = targetHeightM - finite(state.py);
  let desiredVerticalSpeedMps = clamp(heightErrorM * 0.20, -1.4, 1.6);
  if (land && rangeM < 3 && state.casevac_surface_contact === true) {
    desiredVerticalSpeedMps = 0;
  }
  const desiredBearingRad = landingCommitted && Number.isFinite(landingHeadingRad)
    ? landingHeadingRad
    : rangeM > 1e-9 ? Math.atan2(dx, dz) : yaw;
  const yawErrorRad = wrapAngleRad(desiredBearingRad - yaw);

  return Object.freeze({
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    vertical: clamp(desiredVerticalSpeedMps / MAXIMUM_VERTICAL_SPEED_MPS, -1, 1),
    yaw: clamp(yawErrorRad * 1.8, -1, 1),
    target: Object.freeze({
      id: target.id,
      routeId: target.routeId,
      leg: target.leg,
      index: target.index,
      land,
      landingCommitted,
      rangeM,
      targetHeightM,
      desiredSpeedMps,
      desiredBearingRad,
      yawErrorRad,
    }),
  });
}

/** Commit the descent only from a stabilized hover well inside the six-metre enter footprint. */
export function shouldCommitCasevacLanding(state, command) {
  return command?.target?.land === true
    && finite(command.target.rangeM, Number.POSITIVE_INFINITY) <= 4
    && finite(state?.casevac_lateral_speed_mps, Number.POSITIVE_INFINITY) <= 0.35
    && Math.abs(finite(state?.casevac_vertical_speed_mps)) <= 0.30
    && Math.abs(finite(state?.casevac_pitch_deg)) <= 4
    && Math.abs(finite(state?.casevac_bank_deg)) <= 4
    && Math.abs(finite(command?.target?.yawErrorRad, Number.POSITIVE_INFINITY))
      <= 10 * Math.PI / 180;
}

/**
 * Keep the real lower-collective input held through the reduced-order skid transition. The rotor
 * still carries hover thrust for a few physics ticks after the first contact; releasing the button
 * at that instant can produce a one-tick hop that mission authority correctly calls a go-around.
 */
export function casevacTouchdownVerticalCommand(state, command, modulatedVertical = 0) {
  const phase = String(state?.casevac_phase ?? "").toUpperCase();
  const activeApproach = phase === "PICKUP_APPROACH" || phase === "DROPOFF_APPROACH";
  if (activeApproach
    && command?.target?.landingCommitted === true
    && finite(state?.casevac_agl_m, Number.POSITIVE_INFINITY)
      <= CASEVAC_CONTACT_HOLD_AGL_M) {
    return -1;
  }
  return Math.sign(finite(modulatedVertical));
}

/** The projected navigation target remains surface+route-AGL; framing must use the pad itself. */
export function casevacApproachDepressionDeg(state, target, rangeM) {
  const heightM = finite(state?.py, Number.NaN) - finite(target?.y, Number.NaN);
  const distanceM = finite(rangeM, Number.NaN);
  if (!Number.isFinite(heightM) || !Number.isFinite(distanceM)) return Number.NaN;
  return Math.atan2(Math.max(0, heightM), Math.max(0.1, distanceM)) * 180 / Math.PI;
}

/** Require new forward acceleration, not velocity left over from the preceding physical probe. */
export function casevacForwardProbeResponded(
  displacementM,
  initialVelocityMps,
  finalVelocityMps,
  { minimumDisplacementM = 0.08, minimumVelocityDeltaMps = 0.35 } = {},
) {
  return finite(displacementM, Number.NEGATIVE_INFINITY) >= minimumDisplacementM
    && finite(finalVelocityMps, Number.NEGATIVE_INFINITY)
      - finite(initialVelocityMps, Number.POSITIVE_INFINITY) >= minimumVelocityDeltaMps;
}

function distanceTravelled(samples) {
  let distanceM = 0;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    distanceM += Math.hypot(
      finite(samples[index].xM) - finite(samples[index - 1].xM),
      finite(samples[index].yM) - finite(samples[index - 1].yM),
      finite(samples[index].zM) - finite(samples[index - 1].zM),
    );
  }
  return distanceM;
}

function longestAuthorityStallSeconds(samples) {
  let longest = 0;
  let stallStartedAt = null;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (finite(current.tick, -1) <= finite(previous.tick, -1)) {
      stallStartedAt ??= finite(previous.wallS);
      longest = Math.max(longest, finite(current.wallS) - stallStartedAt);
    } else {
      stallStartedAt = null;
    }
  }
  return longest;
}

function maximumSampleGapSeconds(samples) {
  let maximum = 0;
  for (let index = 1; index < (samples?.length ?? 0); index += 1) {
    maximum = Math.max(
      maximum,
      finite(samples[index].wallS) - finite(samples[index - 1].wallS),
    );
  }
  return maximum;
}

function uniqueEvents(samples) {
  const events = new Map();
  for (const sample of samples ?? []) {
    for (const event of sample?.events ?? []) {
      const sequence = finite(event?.sequence, Number.NaN);
      const key = Number.isFinite(sequence) ? sequence : `${event?.kind}:${events.size}`;
      if (!events.has(key)) events.set(key, event);
    }
  }
  return [...events.values()].sort((left, right) =>
    finite(left?.sequence) - finite(right?.sequence));
}

export function assessCasevacAiFlight(samples, journey = {}, errors = [], {
  maximumReadyMs = 20_000,
  maximumStartLatencyMs = 90_000,
  minimumAuthorityHz = 90,
  maximumAuthorityStallS = 0.7,
  maximumControlGapS = 2.5,
  maximumCompletionS = 340,
  minimumCruiseSpeedMps = 29.5,
} = {}) {
  const failures = [];
  const first = samples?.[0] ?? {};
  const last = samples?.at(-1) ?? {};
  const phases = orderedValuesVisited(samples, "phase", CASEVAC_REQUIRED_PHASES);
  const events = uniqueEvents(samples);
  const eventKinds = events.map((event) => event.kind);
  const eventOrder = orderedValuesVisited(
    events.map((event) => ({ kind: event.kind })),
    "kind",
    CASEVAC_REQUIRED_EVENTS,
  );
  const durationS = Math.max(0, finite(last.wallS) - finite(first.wallS));
  const tickSpan = Math.max(0, finite(last.tick) - finite(first.tick));
  const authorityHz = durationS > 0 ? tickSpan / durationS : 0;
  const maximumStallS = longestAuthorityStallSeconds(samples);
  const maximumControlGap = maximumSampleGapSeconds(samples);
  const travelledM = distanceTravelled(samples);
  const minimumEnergyFraction = Math.min(
    1,
    ...(samples ?? []).map((sample) => finite(sample.energyFraction, 1)),
  );
  const maximumLateralSpeed = Math.max(
    0,
    ...(samples ?? []).map((sample) => finite(sample.lateralSpeedMps)),
  );
  const contactSites = new Set((samples ?? [])
    .filter((sample) => sample.stableContact === true)
    .map((sample) => sample.contactSiteId)
    .filter(Boolean));
  const activeSamples = (samples ?? []).filter((sample) =>
    sample.sessionPhase === "ACTIVE");

  if (!samples?.length) failures.push("no live CASEVAC samples");
  if (journey.readyVisible !== true) failures.push("mission 13 Ready card was not visible");
  if (journey.readyClicked !== true) failures.push("mission was not launched through Ready");
  if (finite(journey.readyMs, Number.POSITIVE_INFINITY) > maximumReadyMs) {
    failures.push(`Ready took ${finite(journey.readyMs).toFixed(0)} ms`);
  }
  if (finite(journey.startLatencyMs, Number.POSITIVE_INFINITY) > maximumStartLatencyMs) {
    failures.push(`active flight took ${finite(journey.startLatencyMs).toFixed(0)} ms after Ready`);
  }
  if (first.missionId !== CASEVAC_AI_MISSION_ID
    || (samples ?? []).some((sample) => sample.missionId !== CASEVAC_AI_MISSION_ID)) {
    failures.push(`wrong CASEVAC authority: ${first.missionId ?? "missing"}`);
  }
  if (!phases.pass) failures.push(`mission phases stopped at ${phases.visited.join(" -> ")}`);
  if (!eventOrder.pass) failures.push(`mission evidence stopped at ${eventOrder.visited.join(" -> ")}`);

  for (const error of errors ?? []) failures.push(`page: ${error}`);
  if (activeSamples.some((sample) => sample.paused === true)) {
    failures.push("mission paused during autonomous flight");
  }
  if ((samples ?? []).some((sample) => sample.visibilityState !== "visible")) {
    failures.push("flight page became hidden");
  }
  if ((samples ?? []).some((sample) => sample.gamepadConnected !== true
    || sample.gamepadMapping !== "standard")) {
    failures.push("synthetic standard gamepad left the production input path");
  }
  if ((samples ?? []).some((sample) => sample.gamepadActionsNeutral !== true)) {
    failures.push("a non-flight gamepad action was active");
  }
  if (journey.gamepadLateralResponseObserved !== true) {
    failures.push("lateral state did not respond to the standard gamepad probe");
  }
  if (journey.keyboardForwardResponseObserved !== true) {
    failures.push("flight state did not respond to real keyboard forward input");
  }
  if (journey.gamepadForwardResponseObserved !== true) {
    failures.push("flight state did not respond to continuous standard-gamepad forward input");
  }
  if (journey.collectiveResponseObserved !== true) {
    failures.push("flight state did not respond to the standard gamepad collective buttons");
  }
  if ((journey.landingCommits ?? []).length !== 2) {
    failures.push(`pilot made ${(journey.landingCommits ?? []).length} stabilized landing commits`);
  }
  for (const commit of journey.landingCommits ?? []) {
    if (finite(commit.rangeM, Number.POSITIVE_INFINITY) > 4
      || finite(commit.lateralSpeedMps, Number.POSITIVE_INFINITY) > 0.35
      || finite(commit.headingErrorDeg, Number.POSITIVE_INFINITY) > 10) {
      failures.push(`${commit.id ?? "landing"} commit was not centred, slow, and nose-aligned`);
    }
  }
  for (const name of ["pickup-approach", "dropoff-approach"]) {
    const frame = (journey.approachFrames ?? []).find((candidate) => candidate.name === name);
    if (!frame) {
      failures.push(`${name} had no forward-readable framing evidence`);
    } else if (finite(frame.rangeM, Number.POSITIVE_INFINITY) < 25
      || finite(frame.rangeM, Number.POSITIVE_INFINITY) > 35
      || finite(frame.bearingErrorDeg, Number.POSITIVE_INFINITY) > 12
      || Math.abs(finite(frame.bankDeg, Number.POSITIVE_INFINITY)) > 4
      || finite(frame.depressionDeg, Number.POSITIVE_INFINITY) < 15
      || finite(frame.depressionDeg, Number.POSITIVE_INFINITY) > 35) {
      failures.push(`${name} frame was not forward, readable, and wings-level`);
    }
  }

  if (authorityHz < minimumAuthorityHz) {
    failures.push(`authority cadence was ${authorityHz.toFixed(1)} Hz`);
  }
  if (maximumStallS > maximumAuthorityStallS) {
    failures.push(`authority stalled for ${maximumStallS.toFixed(2)} s`);
  }
  if (maximumControlGap > maximumControlGapS) {
    failures.push(`closed-loop control gap reached ${maximumControlGap.toFixed(2)} s`);
  }
  if (durationS > maximumCompletionS) {
    failures.push(`terminal completion took ${durationS.toFixed(1)} s (limit ${maximumCompletionS} s)`);
  }
  if (maximumLateralSpeed < minimumCruiseSpeedMps) {
    failures.push(`real-input cruise reached only ${maximumLateralSpeed.toFixed(1)} m/s`);
  }
  if (travelledM < 6_500) failures.push(`physical flight covered only ${travelledM.toFixed(0)} m`);

  const expectedWaypointIds = journey.expectedWaypointIds ?? [];
  const reachedWaypointIds = (journey.waypointsReached ?? []).map((point) => point.id);
  const waypoints = orderedValuesVisited(
    reachedWaypointIds.map((id) => ({ id })),
    "id",
    expectedWaypointIds,
  );
  if (!expectedWaypointIds.length) failures.push("direct route authority was not published");
  else if (!waypoints.pass) {
    failures.push(`authored route stopped at ${reachedWaypointIds.join(" -> ") || "none"}`);
  }

  const expectedScreenshots = [
    "ready", "ingress", "pickup-approach", "loading", "outbound",
    "dropoff-approach", "handoff", "quiet", "result",
  ];
  const screenshots = new Set(journey.screenshots ?? []);
  for (const name of expectedScreenshots) {
    if (!screenshots.has(name)) failures.push(`missing ${name} phase screenshot`);
    if (finite(journey.screenshotBytes?.[name]) < 1_024) {
      failures.push(`${name} phase screenshot was empty or missing on disk`);
    }
  }

  const forbiddenEvents = eventKinds.filter((kind) => [
    "APPROACH_DISCONTINUED",
    "LOADING_PAUSED",
    "LOADING_RESET",
    "HANDOFF_PAUSED",
    "HANDOFF_RESET",
    "ABORT_RETURN_STARTED",
    "CASEVAC_ABORTED",
    "CASEVAC_AIRCRAFT_LOST",
  ].includes(kind));
  if (forbiddenEvents.length) {
    failures.push(`forbidden mission evidence: ${forbiddenEvents.join(", ")}`);
  }
  if (eventKinds.filter((kind) => kind === "STABLE_CONTACT_ENTERED").length < 2) {
    failures.push("both stable landing contacts were not recorded");
  }
  if (!contactSites.has(first.pickupSiteId) || !contactSites.has(first.receiverSiteId)) {
    failures.push("pickup and receiver stable-contact authority was not observed");
  }

  if (last.sessionPhase !== "FINISHED" || last.finished !== true
    || last.phase !== "COMPLETE") {
    failures.push(`terminal authority was ${last.sessionPhase ?? "missing"}/${last.phase ?? "missing"}`);
  }
  if (last.custody !== "AT_RECEIVER") failures.push(`final custody was ${last.custody ?? "missing"}`);
  if (last.disposition !== "TRANSFERRED_ON_TIME") {
    failures.push(`final disposition was ${last.disposition ?? "missing"}`);
  }
  if (last.vehicleFlyable !== true || last.energyDepleted === true) {
    failures.push("aircraft did not remain flyable with usable energy");
  }
  if (last.debriefVisible !== true || journey.resultVisible !== true) {
    failures.push("terminal CASEVAC debrief was not visibly presented");
  }
  if (last.safeAssessment !== "PASS" || last.safeDebriefStatus !== "CLEAR"
    || finite(last.obstacleContacts, 1) !== 0) {
    failures.push("safe-axis evidence did not show a collision-free pass");
  }
  if (last.controlledAssessment !== "PASS"
    || last.controlledDebriefStatus !== "CONTROLLED"
    || finite(last.approachDiscontinuations, 1) !== 0
    || finite(last.loadingInterruptions, 1) !== 0
    || finite(last.handoffInterruptions, 1) !== 0) {
    failures.push("controlled-axis evidence did not show uninterrupted contacts");
  }
  // Timely is an evidence-completeness axis: the assessment authority emits ASSESSED
  // for a coherent transfer, while the debrief status carries the actual window grade.
  if (last.timelyAssessment !== "ASSESSED" || last.timelyDebriefStatus !== "WITHIN_REQUEST") {
    failures.push("timely-axis evidence missed the requested handoff window");
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      readyMs: finite(journey.readyMs),
      startLatencyMs: finite(journey.startLatencyMs),
      durationS,
      tickSpan,
      authorityHz,
      maximumAuthorityStallS: maximumStallS,
      maximumControlGapS: maximumControlGap,
      travelledM,
      maximumLateralSpeedMps: maximumLateralSpeed,
      minimumEnergyFraction,
      phases: Object.freeze(phases.visited),
      eventKinds: Object.freeze(eventKinds),
      reachedWaypointIds: Object.freeze(reachedWaypointIds),
      gamepadProbeDisplacementM: finite(journey.gamepadProbeDisplacementM),
      keyboardProbeDisplacementM: finite(journey.keyboardProbeDisplacementM),
      keyboardForwardProbeDeltaMps: finite(journey.keyboardForwardProbeDeltaMps),
      gamepadForwardProbeDisplacementM:
        finite(journey.gamepadForwardProbeDisplacementM),
      gamepadForwardProbeDeltaMps: finite(journey.gamepadForwardProbeDeltaMps),
      collectiveProbeDeltaM: finite(journey.collectiveProbeDeltaM),
      landingCommitCount: (journey.landingCommits ?? []).length,
      approachFrameCount: (journey.approachFrames ?? []).length,
      screenshotCount: screenshots.size,
    }),
  });
}

const INSTALL_STANDARD_GAMEPAD = () => {
  const buttons = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  const pad = {
    id: "Guns Only CASEVAC AI Player",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  };
  globalThis.__gunsOnlyCasevacAiPad = pad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};

async function applyGamepad(page, { right = 0, forward = 0, vertical = 0 } = {}) {
  const flightAxes = rawCasevacGamepadAxes(right, forward);
  await page.evaluate((next) => {
    const pad = globalThis.__gunsOnlyCasevacAiPad;
    if (!pad) throw new Error("CASEVAC AI gamepad was not installed before boot");
    pad.axes.splice(0, pad.axes.length, next.x, next.y, 0, 0);
    for (const button of pad.buttons) {
      button.pressed = false;
      button.touched = false;
      button.value = 0;
    }
    if (next.vertical > 0) {
      pad.buttons[5].pressed = true;
      pad.buttons[5].touched = true;
      pad.buttons[5].value = 1;
    } else if (next.vertical < 0) {
      pad.buttons[4].pressed = true;
      pad.buttons[4].touched = true;
      pad.buttons[4].value = 1;
    }
    pad.timestamp = performance.now();
  }, {
    x: flightAxes.x,
    y: flightAxes.y,
    vertical: Math.sign(finite(vertical)),
  });
}

async function applyKeyboardAxes(page, heldKeys, digital = {}) {
  const desired = new Set();
  if (digital.forward > 0) desired.add(CASEVAC_KEY_BINDINGS.forwardPositive);
  else if (digital.forward < 0) desired.add(CASEVAC_KEY_BINDINGS.forwardNegative);
  if (digital.yaw > 0) desired.add(CASEVAC_KEY_BINDINGS.yawPositive);
  else if (digital.yaw < 0) desired.add(CASEVAC_KEY_BINDINGS.yawNegative);

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

async function applyPhysicalCommand(page, heldKeys, command = {}, digital = {}) {
  await applyGamepad(page, {
    right: command.right,
    forward: command.forward,
    vertical: digital.vertical,
  });
  await applyKeyboardAxes(page, heldKeys, digital);
}

async function releasePhysicalControls(page, heldKeys) {
  if (!page || page.isClosed()) return;
  await applyGamepad(page).catch(() => {});
  for (const code of [...heldKeys]) {
    await page.keyboard.up(code).catch(() => {});
    heldKeys.delete(code);
  }
}

async function readObservation(page, startedAtMs) {
  return page.evaluate((startMs) => {
    const state = globalThis.__gunsState ?? null;
    const pad = navigator.getGamepads?.()[0] ?? null;
    const debrief = state?.casevac_debrief ?? null;
    const controlled = debrief?.axes?.controlled ?? null;
    return {
      wallS: (performance.now() - startMs) / 1000,
      state,
      ui: {
        visibilityState: document.visibilityState,
        readyVisible: document.querySelector("#ready-screen")?.classList.contains("visible") === true,
        readyMode: document.querySelector("#ready-screen")?.dataset?.mode ?? null,
        readyStartVisible: document.querySelector("#ready-start")?.offsetParent !== null,
        readyStartText: document.querySelector("#ready-start")?.textContent?.trim() ?? "",
        fatalVisible: document.querySelector("#fatal")?.classList.contains("visible") === true,
        fatalMessage: document.querySelector("#fatal-message")?.textContent?.trim() ?? "",
        paused: document.documentElement.classList.contains("run-paused"),
      },
      pad: {
        connected: pad?.connected === true && pad?.id === "Guns Only CASEVAC AI Player",
        mapping: pad?.mapping ?? null,
        actionsNeutral: pad ? pad.buttons.every((button, index) =>
          index === 4 || index === 5
            || (button?.pressed !== true && Number(button?.value) === 0)) : false,
      },
      debrief: debrief ? {
        visible: debrief.visible === true,
        obstacleContacts: Number(debrief?.axes?.safe?.obstacleContacts),
        safeStatus: debrief?.axes?.safe?.status ?? null,
        controlledStatus: controlled?.status ?? null,
        approachDiscontinuations: Number(controlled?.approachDiscontinuations),
        loadingInterruptions: Number(controlled?.loadingInterruptions),
        handoffInterruptions: Number(controlled?.handoffInterruptions),
        timelyStatus: debrief?.axes?.timely?.status ?? null,
        maskedStatus: debrief?.axes?.masked?.status ?? null,
        safeBandPercent: Number(debrief?.axes?.masked?.safeBandPercent),
      } : null,
    };
  }, startedAtMs);
}

function compactSample(observation, command = null, digital = null) {
  const state = observation?.state ?? {};
  const debrief = observation?.debrief ?? {};
  return {
    wallS: finite(observation?.wallS),
    missionId: state.casevac_scenario_id ?? state.mission_definition_id ?? null,
    tick: finite(state.tick),
    simS: finite(state.t),
    sessionPhase: state.session_phase ?? null,
    ready: state.ready === true,
    finished: state.finished === true,
    phase: state.casevac_phase ?? null,
    custody: state.casevac_custody ?? null,
    disposition: state.casevac_disposition ?? null,
    xM: finite(state.px),
    yM: finite(state.py),
    zM: finite(state.pz),
    vxMps: finite(state.vx),
    vyMps: finite(state.vy),
    vzMps: finite(state.vz),
    headingDeg: finite(state.casevac_heading_deg),
    pitchDeg: finite(state.casevac_pitch_deg),
    bankDeg: finite(state.casevac_bank_deg),
    aglM: finite(state.casevac_agl_m),
    lateralSpeedMps: finite(state.casevac_lateral_speed_mps),
    verticalSpeedMps: finite(state.casevac_vertical_speed_mps),
    contactKind: state.casevac_contact_kind ?? null,
    surfaceContact: state.casevac_surface_contact === true,
    stableContact: state.casevac_stable_contact === true,
    contactSiteId: state.casevac_contact_site_id ?? null,
    gateClass: state.casevac_gate_class ?? null,
    stabilizationTicks: finite(state.casevac_stabilization_progress_ticks),
    operationTicks: finite(state.casevac_operation_progress_ticks),
    operationRequiredTicks: finite(state.casevac_operation_required_ticks),
    pickupSiteId: state.casevac_pickup_id ?? null,
    receiverSiteId: state.casevac_receiver_id ?? null,
    vehicleFlyable: state.casevac_vehicle_flyable === true,
    energyFraction: finite(state.casevac_energy_remaining_fraction),
    energyDepleted: state.casevac_energy_depleted === true,
    safeAssessment: state.casevac_assessment_safe ?? null,
    controlledAssessment: state.casevac_assessment_controlled ?? null,
    maskedAssessment: state.casevac_assessment_masked ?? null,
    timelyAssessment: state.casevac_assessment_timely ?? null,
    debriefVisible: debrief.visible === true,
    obstacleContacts: finite(debrief.obstacleContacts),
    safeDebriefStatus: debrief.safeStatus ?? null,
    controlledDebriefStatus: debrief.controlledStatus ?? null,
    timelyDebriefStatus: debrief.timelyStatus ?? null,
    maskedDebriefStatus: debrief.maskedStatus ?? null,
    safeBandPercent: Number.isFinite(debrief.safeBandPercent) ? debrief.safeBandPercent : null,
    approachDiscontinuations: finite(debrief.approachDiscontinuations),
    loadingInterruptions: finite(debrief.loadingInterruptions),
    handoffInterruptions: finite(debrief.handoffInterruptions),
    visibilityState: observation?.ui?.visibilityState ?? null,
    paused: observation?.ui?.paused === true,
    fatalVisible: observation?.ui?.fatalVisible === true,
    readyVisible: observation?.ui?.readyVisible === true,
    readyMode: observation?.ui?.readyMode ?? null,
    gamepadConnected: observation?.pad?.connected === true,
    gamepadMapping: observation?.pad?.mapping ?? null,
    gamepadActionsNeutral: observation?.pad?.actionsNeutral === true,
    targetId: command?.target?.id ?? null,
    targetRangeM: command?.target?.rangeM ?? null,
    targetRelativeBearingDeg: Number.isFinite(Number(state.casevac_target_relative_bearing_deg))
      ? Number(state.casevac_target_relative_bearing_deg) : null,
    commandHeadingErrorDeg: command?.target
      ? command.target.yawErrorRad * 180 / Math.PI : null,
    landingCommitted: command?.target?.landingCommitted === true,
    command: command ? {
      forward: command.forward,
      right: command.right,
      vertical: command.vertical,
      yaw: command.yaw,
    } : null,
    digital: digital ? {
      forward: digital.forward,
      vertical: digital.vertical,
      yaw: digital.yaw,
    } : null,
    events: Array.isArray(state.casevac_recent_events)
      ? state.casevac_recent_events.map((event) => ({
        sequence: finite(event?.sequence),
        kind: event?.kind ?? null,
      }))
      : [],
  };
}

function phaseScreenshotName(phase) {
  return {
    INGRESS: "ingress",
    PICKUP_APPROACH: "pickup-approach",
    LOADING: "loading",
    OUTBOUND: "outbound",
    DROPOFF_APPROACH: "dropoff-approach",
    HANDOFF: "handoff",
    QUIET: "quiet",
  }[phase] ?? null;
}

export function casevacRouteArrivalRadius(point, finalPoint) {
  if (finalPoint) return 3.5;
  return Math.min(18, Math.max(10, finite(point?.corridorRadiusM) * 0.14));
}

export function updateCasevacRouteProgress(state, progress, journey, wallS) {
  const leg = casevacLegForPhase(state?.casevac_phase);
  if (!leg) return null;
  const route = casevacDirectRoute(state, leg);
  if (!route?.points.length) return null;
  if (progress.leg !== leg || progress.routeId !== route.id) {
    progress.leg = leg;
    progress.routeId = route.id;
    progress.index = 0;
    progress.landingCommittedTargetId = null;
    progress.landingCommittedHeadingRad = null;
  }
  while (progress.index < route.points.length) {
    const point = route.points[progress.index];
    const finalPoint = progress.index === route.points.length - 1;
    const rangeM = horizontalDistance({ x: state.px, z: state.pz }, point);
    if (rangeM > casevacRouteArrivalRadius(point, finalPoint)) break;
    if (!journey.waypointsReached.some((entry) => entry.id === point.id)) {
      journey.waypointsReached.push({
        id: point.id,
        routeId: point.routeId,
        leg: point.leg,
        wallS,
        tick: finite(state.tick),
        rangeM,
        aglM: finite(state.casevac_agl_m),
      });
    }
    if (finalPoint) break;
    progress.index += 1;
  }
  return route.points[Math.min(progress.index, route.points.length - 1)];
}

function argvValue(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

export async function runCasevacAiFlight({
  wwwroot,
  timeoutSeconds = CASEVAC_AI_TIMEOUT_SECONDS,
  hardware = false,
  outputDirectory = "/tmp/casevac-ai-player",
} = {}) {
  if (!wwwroot) throw new TypeError("runCasevacAiFlight requires a published wwwroot");
  await mkdir(outputDirectory, { recursive: true });
  const samples = [];
  const errors = [];
  const warnings = [];
  const heldKeys = new Set();
  const modulator = new CasevacDigitalAxisModulator();
  const progress = {
    leg: null,
    routeId: null,
    index: 0,
    landingCommittedTargetId: null,
    landingCommittedHeadingRad: null,
  };
  const pendingApproachScreenshots = new Set();
  const journey = {
    readyVisible: false,
    readyClicked: false,
    readyMs: null,
    startLatencyMs: null,
    gamepadLateralResponseObserved: false,
    gamepadProbeDisplacementM: 0,
    keyboardForwardResponseObserved: false,
    keyboardProbeDisplacementM: 0,
    keyboardForwardProbeDeltaMps: 0,
    gamepadForwardResponseObserved: false,
    gamepadForwardProbeDisplacementM: 0,
    gamepadForwardProbeDeltaMps: 0,
    collectiveResponseObserved: false,
    collectiveProbeDeltaM: 0,
    expectedWaypointIds: [],
    waypointsReached: [],
    landingCommits: [],
    approachFrames: [],
    screenshots: [],
    screenshotBytes: {},
    resultVisible: false,
  };
  let site = null;
  let browser = null;
  let context = null;
  let page = null;
  let startedAtMs = null;

  const capture = async (name, fullPage = false) => {
    if (!page || page.isClosed() || journey.screenshots.includes(name)) return;
    try {
      const bytes = await page.screenshot({
        path: `${outputDirectory}/casevac-${name}.png`,
        type: "png",
        fullPage,
        timeout: 12_000,
      });
      journey.screenshots.push(name);
      journey.screenshotBytes[name] = bytes.byteLength;
    } catch (error) {
      warnings.push(`screenshot ${name}: ${error?.message?.split("\n")[0] ?? error}`);
    }
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
    await context.addInitScript(INSTALL_STANDARD_GAMEPAD);
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
    page.on("crash", () => errors.push("browser page crashed"));

    const navigationStartedAt = Date.now();
    await page.goto(`${site.url}?program=medevac&preview=1&server=off&audioQa=silent`, {
      waitUntil: "load",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("ready") === true
        && globalThis.__gunsState?.casevac_phase === "READY"
        && globalThis.__gunsState?.casevac_scenario_id,
      undefined,
      { timeout: 120_000 },
    );
    journey.readyMs = Date.now() - navigationStartedAt;
    journey.readyVisible = await page.locator("#ready-start").isVisible();
    const readyText = (await page.locator("#ready-start").textContent())?.trim() ?? "";
    if (!/medevac|casevac/i.test(readyText)) {
      throw new Error(`mission 13 Ready action was '${readyText || "empty"}'`);
    }
    const readyState = await page.evaluate(() => globalThis.__gunsState);
    if (readyState?.casevac_scenario_id !== CASEVAC_AI_MISSION_ID) {
      throw new Error(`wrong Ready authority '${readyState?.casevac_scenario_id ?? "missing"}'`);
    }
    await capture("ready", true);

    const startClickedAt = Date.now();
    await page.locator("#ready-start").click();
    journey.readyClicked = true;
    await page.waitForFunction(
      () => globalThis.__gunsState?.session_phase === "ACTIVE"
        && globalThis.__gunsState?.casevac_phase === "INGRESS"
        && globalThis.__gunsState?.casevac_vehicle_flyable === true
        && !document.documentElement.classList.contains("run-paused"),
      undefined,
      { timeout: 180_000 },
    );
    journey.startLatencyMs = Date.now() - startClickedAt;
    const teaching = page.locator("#controls-onboarding-dismiss");
    if (await teaching.isVisible()) await teaching.click();
    await page.bringToFront();
    await page.locator("#scene").focus().catch(() => {});
    startedAtMs = await page.evaluate(() => performance.now());

    const initial = await readObservation(page, startedAtMs);
    const initialState = initial.state;
    const ingressRoute = casevacDirectRoute(initialState, "INGRESS");
    const outboundRoute = casevacDirectRoute(initialState, "OUTBOUND");
    journey.expectedWaypointIds = [
      ...(ingressRoute?.points ?? []),
      ...(outboundRoute?.points ?? []),
    ].map((point) => point.id);
    samples.push(compactSample(initial));

    // A small, reversible standard-pad lateral probe proves the browser-to-kernel path before the
    // route pilot takes over. It is normal flight input and changes only physical vehicle state.
    await applyGamepad(page, { right: 0.65 });
    await page.waitForTimeout(700);
    await applyGamepad(page);
    await page.waitForTimeout(250);
    const probeEnd = await readObservation(page, startedAtMs);
    journey.gamepadProbeDisplacementM = horizontalDistance(
      { x: initialState.px, z: initialState.pz },
      { x: probeEnd.state.px, z: probeEnd.state.pz },
    );
    journey.gamepadLateralResponseObserved = journey.gamepadProbeDisplacementM >= 0.12
      || Math.hypot(finite(probeEnd.state.vx), finite(probeEnd.state.vz)) >= 0.25;
    samples.push(compactSample(probeEnd));

    // Probe the default Push binding in isolation. Measure only displacement/velocity along the
    // aircraft's original body-forward axis, so residual lateral motion cannot satisfy the check.
    await applyKeyboardAxes(page, heldKeys, { forward: 1 });
    await page.waitForTimeout(700);
    await applyKeyboardAxes(page, heldKeys);
    await page.waitForTimeout(250);
    const keyboardEnd = await readObservation(page, startedAtMs);
    const probeYawRad = finite(probeEnd.state.casevac_heading_deg) * Math.PI / 180;
    const probeForwardEast = Math.sin(probeYawRad);
    const probeForwardNorth = Math.cos(probeYawRad);
    const keyboardDx = finite(keyboardEnd.state.px) - finite(probeEnd.state.px);
    const keyboardDz = finite(keyboardEnd.state.pz) - finite(probeEnd.state.pz);
    journey.keyboardProbeDisplacementM = keyboardDx * probeForwardEast
      + keyboardDz * probeForwardNorth;
    const keyboardVelocityMps = finite(keyboardEnd.state.vx) * probeForwardEast
      + finite(keyboardEnd.state.vz) * probeForwardNorth;
    const keyboardInitialVelocityMps = finite(probeEnd.state.vx) * probeForwardEast
      + finite(probeEnd.state.vz) * probeForwardNorth;
    journey.keyboardForwardProbeDeltaMps = keyboardVelocityMps
      - keyboardInitialVelocityMps;
    journey.keyboardForwardResponseObserved = casevacForwardProbeResponded(
      journey.keyboardProbeDisplacementM,
      keyboardInitialVelocityMps,
      keyboardVelocityMps,
    );
    samples.push(compactSample(keyboardEnd));

    // Prove the newly wired continuous longitudinal stick independently of both the keyboard and
    // lateral axis before relying on it for the time-critical route controller.
    await applyGamepad(page, { forward: 0.65 });
    await page.waitForTimeout(700);
    await applyGamepad(page);
    await page.waitForTimeout(250);
    const gamepadForwardEnd = await readObservation(page, startedAtMs);
    const padProbeYawRad = finite(keyboardEnd.state.casevac_heading_deg) * Math.PI / 180;
    const padForwardEast = Math.sin(padProbeYawRad);
    const padForwardNorth = Math.cos(padProbeYawRad);
    const padForwardDx = finite(gamepadForwardEnd.state.px) - finite(keyboardEnd.state.px);
    const padForwardDz = finite(gamepadForwardEnd.state.pz) - finite(keyboardEnd.state.pz);
    journey.gamepadForwardProbeDisplacementM = padForwardDx * padForwardEast
      + padForwardDz * padForwardNorth;
    const padForwardVelocityMps = finite(gamepadForwardEnd.state.vx) * padForwardEast
      + finite(gamepadForwardEnd.state.vz) * padForwardNorth;
    const padInitialVelocityMps = finite(keyboardEnd.state.vx) * padForwardEast
      + finite(keyboardEnd.state.vz) * padForwardNorth;
    journey.gamepadForwardProbeDeltaMps = padForwardVelocityMps - padInitialVelocityMps;
    journey.gamepadForwardResponseObserved = casevacForwardProbeResponded(
      journey.gamepadForwardProbeDisplacementM,
      padInitialVelocityMps,
      padForwardVelocityMps,
    );
    samples.push(compactSample(gamepadForwardEnd));

    // The collective is a separate standard-pad shoulder-button path. Keep every horizontal axis
    // neutral and require a vertical state response before the route controller begins.
    await applyGamepad(page, { vertical: 1 });
    await page.waitForTimeout(700);
    await applyGamepad(page);
    await page.waitForTimeout(250);
    const collectiveEnd = await readObservation(page, startedAtMs);
    journey.collectiveProbeDeltaM = finite(collectiveEnd.state.py)
      - finite(gamepadForwardEnd.state.py);
    journey.collectiveResponseObserved = journey.collectiveProbeDeltaM >= 0.03
      || finite(collectiveEnd.state.vy) >= 0.08;
    samples.push(compactSample(collectiveEnd));
    await capture("ingress");

    const deadlineAt = Date.now() + finite(timeoutSeconds, CASEVAC_AI_TIMEOUT_SECONDS) * 1_000;
    let previousPhase = "INGRESS";
    let lastLogSecond = -1;
    while (Date.now() < deadlineAt) {
      const observation = await readObservation(page, startedAtMs);
      const state = observation.state;
      if (!state) throw new Error("CASEVAC authority snapshot disappeared during flight");
      if (observation.ui.fatalVisible) {
        throw new Error(`FLIGHT KERNEL OFFLINE: ${observation.ui.fatalMessage}`);
      }

      const target = updateCasevacRouteProgress(state, progress, journey, observation.wallS);
      const activeFlight = [
        "INGRESS", "PICKUP_APPROACH", "OUTBOUND", "DROPOFF_APPROACH",
      ].includes(state.casevac_phase);
      const route = target ? casevacDirectRoute(state, target.leg) : null;
      const land = Boolean(target && route
        && target.index === route.points.length - 1);
      let command = activeFlight && target
        ? casevacAiCommand(state, target, { land })
        : null;
      if (land && target
        && progress.landingCommittedTargetId !== target.id
        && shouldCommitCasevacLanding(state, command)) {
        progress.landingCommittedTargetId = target.id;
        progress.landingCommittedHeadingRad = command.target.desiredBearingRad;
        journey.landingCommits.push({
          id: target.id,
          wallS: observation.wallS,
          tick: finite(state.tick),
          rangeM: finite(command?.target?.rangeM),
          lateralSpeedMps: finite(state.casevac_lateral_speed_mps),
          aglM: finite(state.casevac_agl_m),
          headingErrorDeg: Math.abs(finite(command?.target?.yawErrorRad)) * 180 / Math.PI,
        });
      }
      if (command && progress.landingCommittedTargetId === target?.id) {
        command = casevacAiCommand(state, target, {
          land,
          landingCommitted: true,
          landingHeadingRad: progress.landingCommittedHeadingRad,
        });
      }
      const modulated = command
        ? modulator.command({ ...command, forward: 0 })
        : { forward: 0, vertical: 0, yaw: 0 };
      const digital = Object.freeze({
        ...modulated,
        vertical: casevacTouchdownVerticalCommand(state, command, modulated.vertical),
      });
      samples.push(compactSample(observation, command, digital));

      if (state.casevac_phase !== previousPhase) {
        previousPhase = state.casevac_phase;
        const screenshotName = phaseScreenshotName(previousPhase);
        if (screenshotName) {
          if (["pickup-approach", "dropoff-approach"].includes(screenshotName)) {
            pendingApproachScreenshots.add(screenshotName);
          } else {
            await releasePhysicalControls(page, heldKeys);
            await capture(screenshotName);
          }
        }
      }

      const approachScreenshotName = phaseScreenshotName(state.casevac_phase);
      const approachRangeM = finite(command?.target?.rangeM, Number.POSITIVE_INFINITY);
      const approachDepressionDeg = casevacApproachDepressionDeg(
        state,
        target,
        approachRangeM,
      );
      if (pendingApproachScreenshots.has(approachScreenshotName)
        && approachRangeM >= 25
        && approachRangeM <= 35
        && finite(state.casevac_lateral_speed_mps) <= 18
        && Math.abs(finite(command?.target?.yawErrorRad, Number.POSITIVE_INFINITY))
          <= 12 * Math.PI / 180
        && Math.abs(finite(state.casevac_bank_deg, Number.POSITIVE_INFINITY)) <= 4
        && approachDepressionDeg >= 15
        && approachDepressionDeg <= 35) {
        // Keep the last real flight command held during readback. Releasing it here made the
        // vehicle coast outside the six-metre landing footprint during the screenshot itself.
        journey.approachFrames.push({
          name: approachScreenshotName,
          targetId: target?.id ?? null,
          wallS: observation.wallS,
          tick: finite(state.tick),
          rangeM: finite(command?.target?.rangeM),
          bearingErrorDeg: Math.abs(finite(command?.target?.yawErrorRad)) * 180 / Math.PI,
          bankDeg: finite(state.casevac_bank_deg),
          aglM: finite(state.casevac_agl_m),
          depressionDeg: approachDepressionDeg,
        });
        await capture(approachScreenshotName);
        pendingApproachScreenshots.delete(approachScreenshotName);
      }

      if (state.session_phase === "FINISHED" || state.casevac_phase === "COMPLETE") {
        await releasePhysicalControls(page, heldKeys);
        journey.resultVisible = observation.ui.readyVisible === true
          && observation.ui.readyMode === "debrief";
        if (!journey.resultVisible) {
          await page.waitForFunction(
            () => document.querySelector("#ready-screen")?.classList.contains("visible") === true,
            undefined,
            { timeout: 10_000 },
          ).catch(() => {});
          const terminalUi = await readObservation(page, startedAtMs);
          journey.resultVisible = terminalUi.ui.readyVisible === true;
          samples.push(compactSample(terminalUi));
        }
        await capture("result", true);
        break;
      }

      await applyPhysicalCommand(page, heldKeys, command ?? {}, digital);
      const wholeSecond = Math.floor(observation.wallS);
      if (wholeSecond !== lastLogSecond && wholeSecond % 5 === 0) {
        lastLogSecond = wholeSecond;
        console.log(
          `[casevac-ai] t=${observation.wallS.toFixed(1)}s phase=${state.casevac_phase} `
          + `target=${target?.id ?? "dwell"} range=${finite(command?.target?.rangeM).toFixed(0)}m `
          + `agl=${finite(state.casevac_agl_m).toFixed(1)}m `
          + `speed=${finite(state.casevac_lateral_speed_mps).toFixed(1)}m/s`,
        );
      }
      await page.waitForTimeout(CASEVAC_AI_SAMPLE_MS);
    }

    if (samples.at(-1)?.phase !== "COMPLETE") {
      errors.push(`mission deadline expired in ${samples.at(-1)?.phase ?? "unknown"}`);
    }
  } catch (error) {
    errors.push(error?.message ?? String(error));
  } finally {
    await releasePhysicalControls(page, heldKeys).catch(() => {});
  }

  let assessment;
  let result;
  try {
    assessment = assessCasevacAiFlight(samples, journey, errors);
    result = { assessment, journey, errors, warnings, samples };
    await writeFile(
      `${outputDirectory}/casevac-ai-flight.json`,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await browser?.close().catch(() => {});
    await site?.close().catch(() => {});
  }
  if (!assessment.pass) {
    throw new Error(`CASEVAC AI flight failed:\n- ${assessment.failures.join("\n- ")}`);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runCasevacAiFlight({
    wwwroot: process.env.GUNS_WWWROOT,
    timeoutSeconds: Number(argvValue("seconds", CASEVAC_AI_TIMEOUT_SECONDS)),
    hardware: argvValue("hardware", false) === true,
    outputDirectory: String(process.env.OUT ?? "/tmp/casevac-ai-player"),
  });
  console.log(JSON.stringify(result.assessment, null, 2));
}
