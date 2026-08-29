import assert from "node:assert/strict";
import test from "node:test";

import { radialStickAxes } from "../../web/wwwroot/render/input/dual_stick_input.js";

import {
  CASEVAC_AI_MISSION_ID,
  CASEVAC_KEY_BINDINGS,
  CASEVAC_REQUIRED_PHASES,
  CasevacDigitalAxisModulator,
  assessCasevacAiFlight,
  casevacAiCommand,
  casevacApproachDepressionDeg,
  casevacDirectRoute,
  casevacForwardProbeResponded,
  casevacLegForPhase,
  casevacTouchdownVerticalCommand,
  orderedValuesVisited,
  rawCasevacGamepadAxis,
  rawCasevacGamepadAxes,
  shouldCommitCasevacLanding,
  updateCasevacRouteProgress,
  wrapAngleRad,
} from "./casevac_ai_player.mjs";

test("heading wrap takes the short turn across north", () => {
  assert.ok(Math.abs(wrapAngleRad(Math.PI * 2 - 0.1) + 0.1) < 1e-9);
  assert.ok(Math.abs(wrapAngleRad(-Math.PI * 2 + 0.1) - 0.1) < 1e-9);
});

test("standard gamepad inverse deadzone preserves sign and full travel", () => {
  assert.equal(rawCasevacGamepadAxis(0), 0);
  assert.equal(rawCasevacGamepadAxis(1), 1);
  assert.equal(rawCasevacGamepadAxis(-1), -1);
  assert.ok(rawCasevacGamepadAxis(0.2) > 0.14);
});

test("combined standard-pad axes survive the production radial deadzone", () => {
  const raw = rawCasevacGamepadAxes(0.35, 0.55);
  const projected = radialStickAxes(raw.x, raw.y);
  assert.ok(Math.abs(projected.x - 0.35) < 1e-9);
  assert.ok(Math.abs(projected.y + 0.55) < 1e-9);
});

test("positive CASEVAC forward uses the production Push binding", () => {
  assert.equal(CASEVAC_KEY_BINDINGS.forwardPositive, "ArrowUp");
  assert.equal(CASEVAC_KEY_BINDINGS.forwardNegative, "ArrowDown");
  assert.equal(CASEVAC_KEY_BINDINGS.yawPositive, "KeyD");
});

test("digital modulator preserves normalized duty and direction", () => {
  const modulator = new CasevacDigitalAxisModulator();
  const positive = Array.from({ length: 100 }, () => modulator.next("forward", 0.35));
  assert.equal(positive.filter((value) => value === 1).length, 35);
  const negative = Array.from({ length: 100 }, () => modulator.next("yaw", -0.22));
  assert.equal(negative.filter((value) => value === -1).length, 22);
  assert.equal(modulator.next("vertical", 0), 0);
});

function routeState() {
  return {
    casevac_routes: [
      {
        id: "route.ingress.direct",
        kind: "DIRECT",
        leg: "INGRESS",
        control_points: [
          {
            id: "start", east_m: -2_500, surface_elevation_m: 5,
            north_m: 1_800, target_agl_m: 34, corridor_radius_m: 140,
          },
          {
            id: "pickup", east_m: 0, surface_elevation_m: 7,
            north_m: 0, target_agl_m: 20, corridor_radius_m: 85,
          },
        ],
      },
      {
        id: "route.outbound.masked",
        kind: "MASKED",
        leg: "OUTBOUND",
        control_points: [],
      },
    ],
  };
}

test("route reader selects only the authored direct leg and normalizes coordinates", () => {
  const route = casevacDirectRoute(routeState(), "ingress");
  assert.equal(route.id, "route.ingress.direct");
  assert.equal(route.points[1].id, "pickup");
  assert.deepEqual(
    { x: route.points[1].x, y: route.points[1].y, z: route.points[1].z },
    { x: 0, y: 7, z: 0 },
  );
  assert.equal(casevacDirectRoute(routeState(), "outbound"), null);
  assert.equal(casevacLegForPhase("LOADING"), "INGRESS");
  assert.equal(casevacLegForPhase("HANDOFF"), "OUTBOUND");
  assert.equal(casevacLegForPhase("READY"), null);
});

test("route progress records authored points in order and holds the final landing target", () => {
  const state = {
    ...routeState(),
    casevac_phase: "INGRESS",
    px: -2_500,
    pz: 1_800,
    tick: 1,
    casevac_agl_m: 34,
  };
  const progress = { leg: null, routeId: null, index: 0 };
  const journey = { waypointsReached: [] };
  const firstTarget = updateCasevacRouteProgress(state, progress, journey, 0);
  assert.equal(firstTarget.id, "pickup");
  assert.deepEqual(journey.waypointsReached.map((point) => point.id), ["start"]);
  state.px = 0;
  state.pz = 0;
  state.tick = 200;
  const landingTarget = updateCasevacRouteProgress(state, progress, journey, 2);
  assert.equal(landingTarget.id, "pickup");
  assert.deepEqual(journey.waypointsReached.map((point) => point.id), ["start", "pickup"]);
});

test("pilot translates world error into body velocity and lands neutral on contact", () => {
  const command = casevacAiCommand({
    px: 0, py: 10, pz: 0,
    casevac_heading_deg: 0,
    casevac_surface_contact: false,
  }, {
    id: "waypoint", routeId: "route", leg: "INGRESS", index: 1,
    x: 100, y: 0, z: 100, targetAglM: 30,
  });
  assert.ok(command.forward > 0.6);
  assert.ok(command.right > 0.9);
  assert.ok(command.vertical > 0);
  assert.ok(command.yaw > 0);

  const landed = casevacAiCommand({
    px: 0.5, py: 1.5, pz: 0.5,
    casevac_heading_deg: 90,
    casevac_surface_contact: true,
  }, {
    id: "lz", routeId: "route", leg: "INGRESS", index: 2,
    x: 0, y: 0, z: 0, targetAglM: 20,
  }, { land: true, landingCommitted: true, landingHeadingRad: Math.PI / 2 });
  assert.equal(Math.abs(landed.forward), 0);
  assert.equal(landed.vertical, 0);
  assert.equal(landed.yaw, 0);
});

test("transit altitude follows current terrain AGL rather than a distant point surface", () => {
  const command = casevacAiCommand({
    px: 0, py: 240, pz: 0,
    casevac_agl_m: 200,
    casevac_heading_deg: 0,
    casevac_surface_contact: false,
  }, {
    id: "far-side", routeId: "route", leg: "INGRESS", index: 1,
    x: 0, y: 0, z: 1_000, targetAglM: 30,
  });
  assert.equal(command.target.targetHeightM, 70);
  assert.ok(command.vertical < 0);
});

test("transit anticipates a rising destination surface instead of exhausting climb authority", () => {
  const command = casevacAiCommand({
    px: 0, py: 30, pz: 0,
    casevac_agl_m: 30,
    casevac_heading_deg: 0,
    casevac_surface_contact: false,
  }, {
    id: "ridge", routeId: "route", leg: "OUTBOUND", index: 2,
    x: 0, y: 140, z: 1_000, targetAglM: 20,
  });
  assert.equal(command.target.targetHeightM, 160);
  assert.ok(command.vertical > 0);
});

test("final descent commands through the skid plane until authority reports contact", () => {
  const command = casevacAiCommand({
    px: 2.8, py: 189.334, pz: 0.2,
    casevac_agl_m: 1.546,
    casevac_heading_deg: 267,
    casevac_surface_contact: false,
  }, {
    id: "pickup", routeId: "route", leg: "INGRESS", index: 2,
    x: 0, y: 187.788, z: 0, targetAglM: 20,
  }, { land: true, landingCommitted: true });
  assert.ok(command.vertical < -0.02);
  assert.equal(command.target.targetHeightM, 188.988);
});

test("landing commit requires a slow stabilized hover inside the tight footprint", () => {
  const command = {
    target: { land: true, rangeM: 3.8, yawErrorRad: 5 * Math.PI / 180 },
  };
  assert.equal(shouldCommitCasevacLanding({
    casevac_lateral_speed_mps: 0.3,
    casevac_vertical_speed_mps: 0.1,
    casevac_pitch_deg: 2,
    casevac_bank_deg: -1,
  }, command), true);
  assert.equal(shouldCommitCasevacLanding({
    casevac_lateral_speed_mps: 0.3,
    casevac_vertical_speed_mps: 0.1,
    casevac_pitch_deg: 2,
    casevac_bank_deg: -1,
  }, { target: { land: true, rangeM: 6.1 } }), false);
  assert.equal(shouldCommitCasevacLanding({
    casevac_lateral_speed_mps: 0.7,
    casevac_vertical_speed_mps: 0.1,
    casevac_pitch_deg: 2,
    casevac_bank_deg: -1,
  }, command), false);
  assert.equal(shouldCommitCasevacLanding({
    casevac_lateral_speed_mps: 0.2,
    casevac_vertical_speed_mps: 0.1,
    casevac_pitch_deg: 2,
    casevac_bank_deg: -1,
  }, { target: { land: true, rangeM: 3.8, yawErrorRad: 40 * Math.PI / 180 } }), false);
});

test("touchdown holds real lower collective through contact and releases after approach", () => {
  const command = { target: { landingCommitted: true } };
  assert.equal(casevacTouchdownVerticalCommand({
    casevac_phase: "PICKUP_APPROACH",
    casevac_agl_m: 1.6,
  }, command, 0), -1);
  assert.equal(casevacTouchdownVerticalCommand({
    casevac_phase: "PICKUP_APPROACH",
    casevac_agl_m: 1.8,
  }, command, 1), 1);
  assert.equal(casevacTouchdownVerticalCommand({
    casevac_phase: "LOADING",
    casevac_agl_m: 1.5,
  }, command, 0), 0);
});

test("approach framing measures depression to the pad rather than elevated route guidance", () => {
  const depressionDeg = casevacApproachDepressionDeg({
    py: 202.451,
    casevac_target_y: 207.788,
  }, { y: 187.788 }, 30.188);
  assert.ok(depressionDeg > 25 && depressionDeg < 27);
});

test("forward probes require new acceleration rather than residual velocity", () => {
  assert.equal(casevacForwardProbeResponded(1.2, 0.1, 1.0), true);
  assert.equal(casevacForwardProbeResponded(1.2, 1.0, 0.9), false);
  assert.equal(casevacForwardProbeResponded(0.02, 0.0, 1.0), false);
});

function successfulFixture() {
  const phases = CASEVAC_REQUIRED_PHASES;
  const positions = [
    [-2_500, 34, 1_800],
    [-100, 20, 100],
    [0, 1.5, 0],
    [0, 1.5, 0],
    [1_500, 34, -1_100],
    [3_200, 1.5, -2_400],
    [3_200, 1.5, -2_400],
    [3_200, 1.5, -2_400],
  ];
  const pickup = "pickup.site";
  const receiver = "receiver.site";
  const events = [
    "CASEVAC_TASK_STARTED",
    "PICKUP_APPROACH_ENTERED",
    "APPROACH_ATTEMPT_STARTED",
    "STABLE_CONTACT_ENTERED",
    "LOADING_STARTED",
    "CAPSULE_SECURED",
    "DROPOFF_APPROACH_ENTERED",
    "APPROACH_ATTEMPT_STARTED",
    "STABLE_CONTACT_ENTERED",
    "HANDOFF_STARTED",
    "HANDOFF_COMPLETED",
  ].map((kind, index) => ({ sequence: index + 1, kind }));
  const samples = phases.map((phase, index) => ({
    wallS: index * 0.5,
    missionId: CASEVAC_AI_MISSION_ID,
    tick: index * 60,
    sessionPhase: phase === "COMPLETE" ? "FINISHED" : "ACTIVE",
    finished: phase === "COMPLETE",
    phase,
    custody: phase === "COMPLETE" ? "AT_RECEIVER" : "AT_PICKUP",
    disposition: phase === "COMPLETE" ? "TRANSFERRED_ON_TIME" : "PENDING",
    xM: positions[index][0],
    yM: positions[index][1],
    zM: positions[index][2],
    lateralSpeedMps: index === 1 ? 30.5 : 0,
    stableContact: phase === "LOADING" || phase === "HANDOFF",
    contactSiteId: phase === "LOADING" ? pickup : phase === "HANDOFF" ? receiver : null,
    pickupSiteId: pickup,
    receiverSiteId: receiver,
    vehicleFlyable: true,
    energyFraction: 0.8,
    energyDepleted: false,
    visibilityState: "visible",
    paused: false,
    gamepadConnected: true,
    gamepadMapping: "standard",
    gamepadActionsNeutral: true,
    events,
    safeAssessment: phase === "COMPLETE" ? "PASS" : "NOT_ASSESSED",
    controlledAssessment: phase === "COMPLETE" ? "PASS" : "NOT_ASSESSED",
    timelyAssessment: phase === "COMPLETE" ? "ASSESSED" : "NOT_ASSESSED",
    debriefVisible: phase === "COMPLETE",
    obstacleContacts: 0,
    safeDebriefStatus: phase === "COMPLETE" ? "CLEAR" : null,
    controlledDebriefStatus: phase === "COMPLETE" ? "CONTROLLED" : null,
    timelyDebriefStatus: phase === "COMPLETE" ? "WITHIN_REQUEST" : null,
    approachDiscontinuations: 0,
    loadingInterruptions: 0,
    handoffInterruptions: 0,
  }));
  const screenshotNames = [
    "ready", "ingress", "pickup-approach", "loading", "outbound",
    "dropoff-approach", "handoff", "quiet", "result",
  ];
  const journey = {
    readyVisible: true,
    readyClicked: true,
    readyMs: 2_000,
    startLatencyMs: 4_000,
    gamepadLateralResponseObserved: true,
    gamepadProbeDisplacementM: 0.8,
    keyboardForwardResponseObserved: true,
    gamepadForwardResponseObserved: true,
    gamepadForwardProbeDisplacementM: 0.7,
    collectiveResponseObserved: true,
    expectedWaypointIds: ["orchard-gap", "canal-crossing"],
    waypointsReached: [{ id: "orchard-gap" }, { id: "canal-crossing" }],
    landingCommits: [
      { id: "pickup", rangeM: 3.7, lateralSpeedMps: 0.3, headingErrorDeg: 6 },
      { id: "receiver", rangeM: 3.5, lateralSpeedMps: 0.25, headingErrorDeg: 4 },
    ],
    approachFrames: [
      {
        name: "pickup-approach", rangeM: 30, bearingErrorDeg: 8,
        bankDeg: 2, depressionDeg: 22,
      },
      {
        name: "dropoff-approach", rangeM: 32, bearingErrorDeg: 5,
        bankDeg: -1, depressionDeg: 20,
      },
    ],
    screenshots: screenshotNames,
    screenshotBytes: Object.fromEntries(screenshotNames.map((name) => [name, 8_192])),
    resultVisible: true,
  };
  return { samples, journey };
}

test("assessment requires the entire physical route and terminal evidence", () => {
  const fixture = successfulFixture();
  const result = assessCasevacAiFlight(fixture.samples, fixture.journey);
  assert.deepEqual(result.failures, []);
  assert.equal(result.metrics.authorityHz, 120);
  assert.ok(result.metrics.travelledM > 6_500);
  assert.deepEqual(
    orderedValuesVisited(fixture.samples, "phase", CASEVAC_REQUIRED_PHASES).visited,
    CASEVAC_REQUIRED_PHASES,
  );
});

test("assessment rejects input non-response, collision evidence, and abort phases", () => {
  const fixture = successfulFixture();
  fixture.journey.keyboardForwardResponseObserved = false;
  const final = fixture.samples.at(-1);
  final.obstacleContacts = 1;
  final.safeAssessment = "DEVELOPING";
  final.events = [
    ...final.events,
    { sequence: 99, kind: "ABORT_RETURN_STARTED" },
  ];
  const failures = assessCasevacAiFlight(fixture.samples, fixture.journey).failures.join("\n");
  assert.match(failures, /keyboard forward input/);
  assert.match(failures, /forbidden mission evidence/);
  assert.match(failures, /collision-free pass/);
});

test("assessment rejects a moving but speed-capped real-input path", () => {
  const fixture = successfulFixture();
  for (const sample of fixture.samples) sample.lateralSpeedMps = 20;
  const failures = assessCasevacAiFlight(fixture.samples, fixture.journey).failures.join("\n");
  assert.match(failures, /real-input cruise reached only 20\.0 m\/s/);
});

test("assessment rejects a closed-loop sampling gap even when authority later catches up", () => {
  const fixture = successfulFixture();
  for (let index = 1; index < fixture.samples.length; index += 1) {
    fixture.samples[index].wallS += 3;
    fixture.samples[index].tick += 360;
  }
  const failures = assessCasevacAiFlight(fixture.samples, fixture.journey).failures.join("\n");
  assert.match(failures, /closed-loop control gap/);
});

test("terminal debrief overlay pause is not an active-flight pause failure", () => {
  const fixture = successfulFixture();
  fixture.samples.at(-1).paused = true;
  assert.deepEqual(assessCasevacAiFlight(fixture.samples, fixture.journey).failures, []);
  fixture.samples[3].paused = true;
  assert.match(
    assessCasevacAiFlight(fixture.samples, fixture.journey).failures.join("\n"),
    /paused during autonomous flight/,
  );
});

test("assessment keeps late handoff and completion-margin contracts strict", () => {
  const late = successfulFixture();
  const final = late.samples.at(-1);
  final.disposition = "TRANSFERRED_AFTER_REQUESTED_TIME";
  final.timelyAssessment = "ASSESSED";
  final.timelyDebriefStatus = "WINDOW_PASSED";
  let failures = assessCasevacAiFlight(late.samples, late.journey).failures.join("\n");
  assert.match(failures, /final disposition/);
  assert.match(failures, /timely-axis/);

  const slow = successfulFixture();
  slow.samples.at(-1).wallS = 341;
  slow.samples.at(-1).tick = 40_920;
  failures = assessCasevacAiFlight(slow.samples, slow.journey, [], {
    maximumControlGapS: 400,
  }).failures.join("\n");
  assert.match(failures, /terminal completion took 341\.0 s/);
});
