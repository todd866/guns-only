import assert from "node:assert/strict";
import test from "node:test";

import {
  FACILITY,
  createIndoorMission,
  stepIndoorMission,
} from "../../web/wwwroot/indoor/sim.js";
import {
  INDOOR_ATTACK_SCAN_IDS,
  INDOOR_ATRIUM_RISE,
  INDOOR_PROFILE_UI_COPY,
  assessIndoorAttackSite,
  distanceBetween,
  indoorAiPilotCommand,
  indoorAttackTarget,
  standardGamepadAxis,
  standardGamepadPayload,
  wrapAngleRad,
} from "./indoor_ai_player.mjs";

test("the gate pins the authored raised atrium path and standard-pad deadzone", () => {
  const authored = FACILITY.pathNodes.find((node) => node.id === "atrium-rise");
  assert.deepEqual(INDOOR_ATRIUM_RISE.position, authored.position);
  assert.ok(Math.abs(wrapAngleRad(Math.PI * 2 + 0.2) - 0.2) < 1e-9);
  assert.equal(standardGamepadAxis(0.04), 0);
  assert.equal(standardGamepadAxis(0.1), 0.14);
  assert.equal(standardGamepadAxis(-0.1), -0.14);
  assert.deepEqual(standardGamepadPayload({
    forward: 0.5,
    right: -0.4,
    up: -0.3,
    yaw: 0.2,
    pitch: -0.25,
  }), {
    axes: [-0.4, -0.5, 0.2, 0.25],
    up: 0,
    down: 0.3,
  });
});

test("target selection requires first scan, raised crossing, then second scan", () => {
  const state = createIndoorMission({ missionId: "attack-site" });
  assert.equal(indoorAttackTarget(state).id, INDOOR_ATTACK_SCAN_IDS[0]);
  state.survey.scanPoints[0].complete = true;
  assert.equal(indoorAttackTarget(state).id, "atrium-rise");
  assert.equal(indoorAttackTarget(state, { atriumRiseReached: true }).id,
    INDOOR_ATTACK_SCAN_IDS[1]);
  state.survey.scanPoints[1].complete = true;
  assert.equal(indoorAttackTarget(state, { atriumRiseReached: true }), null);
});

test("pilot commands forward flight, climb, and body-frame drift correction", () => {
  const state = createIndoorMission({ missionId: "attack-site" });
  const first = indoorAiPilotCommand(state, indoorAttackTarget(state));
  assert.ok(first.forward > 0.9);
  assert.equal(first.right, 0);
  assert.equal(first.up, 0);

  state.survey.scanPoints[0].complete = true;
  state.drone.position = { x: 0.4, y: 2, z: 8.1 };
  state.drone.velocity = { x: 0.8, y: 0, z: 0 };
  const rise = indoorAiPilotCommand(state, indoorAttackTarget(state));
  assert.ok(rise.forward > 0);
  assert.ok(rise.up > 0);
  assert.ok(rise.right < 0, "rightward position and velocity should command left strafe");
});

test("closed-loop controller physically flies both scans and lets return autonomy recover", () => {
  let state = createIndoorMission({ missionId: "attack-site" });
  let atriumRiseReached = false;
  let returnRequested = false;
  const samples = [];
  for (let index = 0; index < 60 * 30 && state.status === "active"; index += 1) {
    if (state.survey.scanPoints[0].complete
      && distanceBetween(state.drone.position, INDOOR_ATRIUM_RISE.position)
        <= INDOOR_ATRIUM_RISE.radius) {
      atriumRiseReached = true;
    }
    const target = indoorAttackTarget(state, { atriumRiseReached });
    const input = target ? indoorAiPilotCommand(state, target) : {};
    if (state.survey.objectives.scan.complete && !returnRequested) {
      input.returnHome = true;
      returnRequested = true;
    }
    state = stepIndoorMission(state, input, 1 / 60);
    samples.push({
      tick: state.tick,
      status: state.status,
      position: { ...state.drone.position },
    });
  }
  assert.equal(atriumRiseReached, true);
  assert.equal(returnRequested, true);
  assert.equal(state.status, "success");
  assert.equal(state.survey.objectives.scan.completed, 2);
  assert.equal(state.survey.silentReturn, true);
  assert.equal(state.survey.returnedHome, true);
  assert.equal(state.link.mode, "fiber");
  assert.equal(state.drone.collisionCount, 0);
  assert.equal(state.gun.shots, 0);
  assert.ok(samples.length > 120);
});

function acceptedSample(overrides = {}) {
  const returning = overrides.returnRequested ?? true;
  const sampleWallS = Number(overrides.wallS ?? 14);
  return {
    wallS: 14,
    bodyPhase: "result",
    paused: false,
    selectedMissionId: "attack-site",
    fatalVisible: false,
    resultVisible: true,
    resultTitle: "Route stayed dark",
    gamepadConnected: true,
    gamepadMapping: "standard",
    gamepadActionsNeutral: true,
    audioEnabled: true,
    audioSilentQa: true,
    audioContextState: "running",
    audioMasterGain: 0,
    rendererReady: true,
    framebufferWidth: 2_160,
    framebufferHeight: 1_350,
    visibleRouteCueCount: 2,
    visibleCompletedSurveyMarkerCount: 0,
    routeCueDirection: returning ? "return" : "ingress",
    routeCueAnchor: returning ? 3 : 0,
    visibleRouteCueIndices: returning ? [2, 1] : [1, 2],
    renderFrameCount: Math.max(1, Math.round(sampleWallS * 60) + 1),
    renderTriangleCount: 1_200,
    webglContextLost: false,
    tick: 840,
    status: "success",
    success: true,
    failure: false,
    failureReason: null,
    battery: 96,
    integrity: 100,
    collisionCount: 0,
    linkMode: "fiber",
    fiberConnected: true,
    fiberDetached: false,
    fiberSnags: 0,
    shots: 0,
    breach: null,
    scansCompleted: 2,
    scansTotal: 2,
    returnRequested: true,
    silentReturn: true,
    returnedHome: true,
    returnComplete: true,
    command: { forward: 1, right: 0, up: 0 },
    events: [
      { id: 1, tick: 120, type: "survey-scan-complete", scanId: "bracken-intake" },
      { id: 2, tick: 420, type: "survey-scan-complete", scanId: "bracken-overlook" },
      { id: 3, tick: 421, type: "survey-return-started", source: "operator", silent: true },
      { id: 4, tick: 840, type: "survey-complete" },
      { id: 5, tick: 840, type: "mission-complete" },
    ],
    ...overrides,
  };
}

const completeJourney = Object.freeze({
  quarantineVisible: true,
  previewClicked: true,
  briefingVisible: true,
  profileBriefings: Object.freeze(Object.fromEntries(
    Object.entries(INDOOR_PROFILE_UI_COPY).map(([profileId, copy]) => [profileId, {
      selectedMissionId: profileId,
      ...copy,
    }]),
  )),
  beginClicked: true,
  atriumRiseReached: true,
  returnKeyPressed: true,
  gamepadResponseObserved: true,
  screenshots: [
    "quarantine",
    "briefing",
    "first-scan",
    "atrium-rise",
    "second-scan",
    "return",
    "result",
  ],
  screenshotBytes: {
    quarantine: 2_048,
    briefing: 2_048,
    "first-scan": 2_048,
    "atrium-rise": 2_048,
    "second-scan": 2_048,
    return: 2_048,
    result: 2_048,
  },
});

test("assessment accepts complete optical player-path evidence", () => {
  const samples = [
    acceptedSample({ wallS: 0, tick: 1, bodyPhase: "active", status: "active",
      success: false, resultVisible: false, resultTitle: "", scansCompleted: 0,
      returnRequested: false, silentReturn: false, returnedHome: false, returnComplete: false }),
    acceptedSample({ wallS: 7, tick: 420, bodyPhase: "active", status: "active",
      success: false, resultVisible: false, resultTitle: "", scansCompleted: 2,
      returnRequested: false, silentReturn: false, returnedHome: false, returnComplete: false }),
    acceptedSample(),
  ];
  const assessment = assessIndoorAttackSite(samples, completeJourney);
  assert.equal(assessment.pass, true, assessment.failures.join("\n"));
  assert.equal(assessment.metrics.maximumShots, 0);
  assert.equal(assessment.metrics.maximumCollisions, 0);
});

test("assessment fails closed on collision, firing, detachment, or stealth breach", () => {
  const bad = acceptedSample({
    collisionCount: 1,
    shots: 1,
    linkMode: "rf",
    fiberConnected: false,
    fiberDetached: true,
    breach: "firing",
    events: [
      ...acceptedSample().events,
      { id: 6, type: "gun-fired" },
      { id: 7, type: "fiber-detached" },
      { id: 8, type: "survey-stealth-breached" },
    ],
  });
  const samples = [
    acceptedSample({ wallS: 0, tick: 1, bodyPhase: "active", status: "active",
      success: false, resultVisible: false }),
    acceptedSample({ wallS: 7, tick: 420, bodyPhase: "active", status: "active",
      success: false, resultVisible: false }),
    bad,
  ];
  const assessment = assessIndoorAttackSite(samples, completeJourney);
  assert.equal(assessment.pass, false);
  assert.match(assessment.failures.join(" "), /fiber|optical|breach|gun fired|collision|forbidden/);
});

test("assessment fails closed when the real route/input/screenshot journey is absent", () => {
  const samples = [
    acceptedSample({ wallS: 0, tick: 1, bodyPhase: "active", status: "active",
      success: false, resultVisible: false }),
    acceptedSample({ wallS: 7, tick: 420, bodyPhase: "active", status: "active",
      success: false, resultVisible: false }),
    acceptedSample(),
  ];
  const journey = {
    ...completeJourney,
    atriumRiseReached: false,
    returnKeyPressed: false,
    gamepadResponseObserved: false,
    screenshots: completeJourney.screenshots.filter((name) => name !== "result"),
    screenshotBytes: { ...completeJourney.screenshotBytes, result: 0 },
  };
  const assessment = assessIndoorAttackSite(samples, journey);
  assert.equal(assessment.pass, false);
  assert.match(
    assessment.failures.join(" "),
    /respond.*gamepad|raised atrium|real input|missing result|result phase screenshot was empty/,
  );
});

test("assessment rejects a dead audio graph or corridor-obscuring spatial cues", () => {
  const samples = [
    acceptedSample({
      wallS: 0,
      tick: 1,
      bodyPhase: "active",
      status: "active",
      success: false,
      resultVisible: false,
      audioContextState: "uninitialized",
      rendererReady: false,
      visibleRouteCueCount: 4,
      visibleCompletedSurveyMarkerCount: 1,
    }),
    acceptedSample({ wallS: 7, tick: 420, bodyPhase: "active", status: "active",
      success: false, resultVisible: false }),
    acceptedSample(),
  ];
  const assessment = assessIndoorAttackSite(samples, completeJourney);
  assert.equal(assessment.pass, false);
  assert.match(
    assessment.failures.join(" "),
    /audio graph|framebuffer|route cues|captured survey markers/,
  );
});

test("assessment verifies cue order instead of trusting the direction label", () => {
  const samples = [
    acceptedSample({ wallS: 0, tick: 1, bodyPhase: "active", status: "active",
      success: false, resultVisible: false, returnRequested: false,
      visibleRouteCueCount: 0, visibleRouteCueIndices: [] }),
    acceptedSample({ wallS: 7, tick: 420, bodyPhase: "active", status: "active",
      success: false, resultVisible: false, returnRequested: false,
      visibleRouteCueCount: 0, visibleRouteCueIndices: [] }),
    acceptedSample({
      routeCueDirection: "return",
      routeCueAnchor: 3,
      visibleRouteCueIndices: [4],
      visibleRouteCueCount: 1,
    }),
  ];
  const assessment = assessIndoorAttackSite(samples, completeJourney);
  assert.equal(assessment.pass, false);
  assert.match(assessment.failures.join(" "), /ingress cues|reverse/);
});
