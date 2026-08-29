import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceWeekendWaypoint,
  assessWeekendAiRide,
  rawWeekendGamepadAxis,
  weekendAiRiderCommand,
  weekendCornerEvidence,
  weekendCircuitLengthM,
  wrapWeekendAngleRad,
} from "./weekend_ai_rider.mjs";

const closedCircuit = [
  { x: 0, z: 0 },
  { x: 100, z: 0 },
  { x: 100, z: 100 },
  { x: 0, z: 100 },
  { x: 0, z: 0 },
];

test("angle wrap and inverse gamepad deadzone preserve rider command sense", () => {
  assert.ok(Math.abs(wrapWeekendAngleRad(Math.PI * 2 + 0.2) - 0.2) < 1e-9);
  assert.equal(rawWeekendGamepadAxis(0), 0);
  assert.equal(rawWeekendGamepadAxis(1), 1);
  assert.equal(rawWeekendGamepadAxis(-1), -1);
  assert.ok(Math.abs(rawWeekendGamepadAxis(0.5) - 0.56) < 1e-9);
});

test("circuit utilities retain closure and advance only through forward points", () => {
  assert.equal(weekendCircuitLengthM(closedCircuit), 400);
  const waypoint = advanceWeekendWaypoint(closedCircuit, { x: 98, z: 2 }, 1);
  assert.equal(waypoint.waypointIndex, 2);
  assert.ok(waypoint.nearestForwardDistanceM < 3);
  assert.throws(
    () => weekendCircuitLengthM(closedCircuit.slice(0, -1)),
    /not closed/,
  );
});

test("ported centreline rider turns toward the target and meters speed for curvature", () => {
  const command = weekendAiRiderCommand({
    px: 20,
    pz: 0,
    vx: 0,
    vz: 8,
  }, closedCircuit, 1);
  assert.ok(command.turn > 0.5, `expected right turn, got ${command.turn}`);
  assert.ok(command.targetSpeedMps >= 7 && command.targetSpeedMps <= 22);
  assert.ok(command.bodyLateral > 0.35);
  assert.equal(command.throttle, 0.78);
  assert.equal(command.brake, 0);
});

test("controller golden vector locks the C# lookahead and curvature gains", () => {
  const pointCount = 128;
  const circuit = Array.from({ length: pointCount }, (_, index) => ({
    x: Math.sin(index * Math.PI * 2 / pointCount) * 100,
    z: Math.cos(index * Math.PI * 2 / pointCount) * 100,
  }));
  circuit.push({ ...circuit[0] });
  const position = circuit[10];
  const ahead = circuit[11];
  const segmentLength = Math.hypot(ahead.x - position.x, ahead.z - position.z);
  const command = weekendAiRiderCommand({
    px: position.x,
    pz: position.z,
    vx: (ahead.x - position.x) / segmentLength * 9,
    vz: (ahead.z - position.z) / segmentLength * 9,
  }, circuit, 10);

  assert.equal(command.waypointIndex, 13);
  assert.equal(command.targetIndex, 23);
  assert.ok(Math.abs(command.turn - 0.5301437602932758) < 1e-12);
  assert.equal(command.targetSpeedMps, 7);
  assert.equal(command.throttle, 0);
  assert.ok(Math.abs(command.brake - 2 / 7) < 1e-12);
});

function activeSample(overrides = {}) {
  return {
    wallS: 0,
    phase: "active",
    xM: 0,
    zM: 0,
    speedMps: 18,
    leanRad: -0.2,
    lap: 0,
    lapTimeS: 0,
    lastLapS: 0,
    authorityElapsedS: 0,
    lapValid: true,
    sectorSeconds: [0, 0, 0, 0],
    offTrackS: 0,
    onTrack: true,
    tipped: false,
    visibilityState: "visible",
    gamepadConnected: true,
    requestedThrottle: 0.7,
    requestedBrake: 0,
    requestedTurn: 0.2,
    requestedBodyLateral: 0.14,
    padThrottle: 0.7,
    padBrake: 0,
    padTurn: 0.296,
    padBodyLateral: 0.2432,
    appliedThrottle: 0.7,
    appliedBrake: 0,
    appliedRiderLateral: 0.14,
    lensFovDeg: 74,
    ...overrides,
  };
}

function lifecycle({ lap = 0, lastLapS = 0, bestLapS = null } = {}) {
  return {
    pauseEvidence: {
      visible: true,
      phase: "paused",
      heldWallS: 0.6,
      authorityDeltaS: 0,
    },
    debrief: {
      visible: true,
      title: "RIDE COMPLETE",
      summary: lap > 0 ? `${lap} completed lap.` : "Open lap clean.",
      metrics: {
        laps: String(lap),
        last: lastLapS > 0 ? "7:19.80" : "—:——",
        record: bestLapS > 0 ? "7:19.80" : "—:——",
        openLap: "CLEAN",
        offTrack: "0.0 s",
      },
      result: { title: "RIDE COMPLETE" },
      authority: {
        phase: "finished",
        lap,
        last_lap_s: lastLapS,
        best_lap_s: bestLapS,
        lap_valid: true,
        sector_s: lap > 0 ? [0, 0, 0, 0] : [120, 0, 0, 0],
      },
    },
  };
}

test("sector gate requires clean authority progress and the visible terminal lifecycle", () => {
  const samples = [
    activeSample(),
    activeSample({
      wallS: 120,
      xM: 1_200,
      lapTimeS: 120,
      authorityElapsedS: 120,
      sectorSeconds: [120, 0, 0, 0],
    }),
  ];
  const result = assessWeekendAiRide(samples, {
    goal: "sector",
    circuitLengthM: 5_800,
    readyMs: 900,
    startLatencyMs: 80,
    ...lifecycle(),
  });
  assert.equal(result.pass, true);
  assert.equal(result.metrics.maximumCompletedSectors, 1);

  const inert = samples.map((sample) => ({
    ...sample,
    xM: 0,
    sectorSeconds: [0, 0, 0, 0],
    requestedThrottle: 0,
    requestedTurn: 0,
  }));
  const failed = assessWeekendAiRide(inert, {
    goal: "sector",
    circuitLengthM: 5_800,
    ...lifecycle(),
  });
  assert.match(failed.failures.join(" "), /input|covered|sector/);
});

test("lap gate requires a clean recorded lap in the finished debrief", () => {
  const samples = [
    activeSample({ speedMps: 0, lensFovDeg: 74 }),
    activeSample({
      wallS: 220,
      xM: 2_900,
      lapTimeS: 220,
      authorityElapsedS: 220,
      sectorSeconds: [55, 55, 55, 0],
      lensFovDeg: 72,
    }),
    activeSample({
      wallS: 440,
      xM: 0,
      zM: 50,
      lap: 1,
      lapTimeS: 0.2,
      lastLapS: 439.8,
      authorityElapsedS: 440,
      sectorSeconds: [0, 0, 0, 0],
      lensFovDeg: 70,
    }),
  ];
  const result = assessWeekendAiRide(samples, {
    goal: "lap",
    circuitLengthM: 5_800,
    ...lifecycle({ lap: 1, lastLapS: 439.8, bestLapS: 439.8 }),
  });
  assert.equal(result.pass, true);
  assert.equal(result.metrics.maximumLap, 1);

  const missingDebriefLap = assessWeekendAiRide(samples, {
    goal: "lap",
    circuitLengthM: 5_800,
    ...lifecycle({ lap: 1 }),
  });
  assert.match(missingDebriefLap.failures.join(" "), /completed lap|clean lap record/);
});

test("lap gate rejects the old slow upright steering-only proof", () => {
  const samples = [
    activeSample({
      requestedBodyLateral: 0,
      padBodyLateral: 0,
      appliedRiderLateral: 0,
      leanRad: 0,
      speedMps: 13,
    }),
    activeSample({
      wallS: 440,
      xM: 5_800,
      lap: 1,
      lastLapS: 439.8,
      lapTimeS: 0.2,
      authorityElapsedS: 440,
      requestedBodyLateral: 0,
      padBodyLateral: 0,
      appliedRiderLateral: 0,
      leanRad: 0,
      speedMps: 13,
      lensFovDeg: 74,
    }),
  ];
  const result = assessWeekendAiRide(samples, {
    goal: "lap",
    circuitLengthM: 5_800,
    paceCaptureSeen: false,
    cornerCaptureSeen: false,
    ...lifecycle({ lap: 1, lastLapS: 439.8, bestLapS: 439.8 }),
  });

  assert.equal(result.pass, false);
  assert.match(
    result.failures.join(" "),
    /body weight|reached only|moving median|at-speed|loaded|corner visual|helmet lens/,
  );
});

test("corner evidence requires speed, lean and inside body weight together", () => {
  assert.equal(weekendCornerEvidence(activeSample()), true);
  assert.equal(weekendCornerEvidence(activeSample({ speedMps: 7 })), true);
  assert.equal(weekendCornerEvidence(activeSample({ speedMps: 4 })), false);
  assert.equal(weekendCornerEvidence(activeSample({ leanRad: -0.05 })), false);
  assert.equal(weekendCornerEvidence(activeSample({ appliedRiderLateral: -0.14 })), false);
});

test("evidence screenshots settle two animation frames before capture", async () => {
  const source = await import("node:fs/promises")
    .then(({ readFile }) => readFile(new URL("./weekend_ai_rider.mjs", import.meta.url), "utf8"));
  assert.match(
    source,
    /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)[\s\S]*page\.screenshot/u,
  );
});

test("gate rejects any off-track, tip-over, hidden page or lifecycle shortcut", () => {
  const samples = [
    activeSample(),
    activeSample({
      wallS: 120,
      xM: 1_200,
      lapTimeS: 120,
      authorityElapsedS: 120,
      sectorSeconds: [120, 0, 0, 0],
      offTrackS: 0.1,
      onTrack: false,
      tipped: true,
      lapValid: false,
      visibilityState: "hidden",
      gamepadConnected: false,
    }),
  ];
  const result = assessWeekendAiRide(samples, {
    goal: "sector",
    circuitLengthM: 5_800,
    pauseEvidence: { visible: false, phase: "active", heldWallS: 0, authorityDeltaS: 1 },
    debrief: null,
  });
  assert.equal(result.pass, false);
  assert.match(
    result.failures.join(" "),
    /hidden|gamepad|painted circuit|tipped|invalid|pause|debrief/,
  );
});

test("forward search cannot snap onto the nearby return leg", () => {
  const outbound = Array.from({ length: 51 }, (_, index) => ({ x: index * 10, z: 0 }));
  const returnLeg = Array.from({ length: 50 }, (_, index) => ({
    x: (49 - index) * 10,
    z: 5,
  }));
  const doubledBack = [...outbound, { x: 500, z: 5 }, ...returnLeg, { x: 0, z: 0 }];
  const waypoint = advanceWeekendWaypoint(doubledBack, { x: 100, z: 4.9 }, 5);
  assert.ok(waypoint.waypointIndex < 50,
    `forward search jumped to return-leg index ${waypoint.waypointIndex}`);
});

test("gate rejects a visually moving ride whose authority clock crawls", () => {
  const samples = [
    activeSample(),
    activeSample({
      wallS: 120,
      xM: 1_200,
      lapTimeS: 12,
      authorityElapsedS: 12,
      sectorSeconds: [12, 0, 0, 0],
    }),
  ];
  const result = assessWeekendAiRide(samples, {
    goal: "sector",
    circuitLengthM: 5_800,
    ...lifecycle(),
  });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(" "), /authority advanced at 0\.100x/);
});

test("lap-validity evidence fails closed when the authority field is missing", () => {
  const samples = [
    activeSample(),
    activeSample({
      wallS: 120,
      xM: 1_200,
      lapTimeS: 120,
      authorityElapsedS: 120,
      sectorSeconds: [120, 0, 0, 0],
    }),
  ];
  delete samples[1].lapValid;
  const result = assessWeekendAiRide(samples, {
    goal: "sector",
    circuitLengthM: 5_800,
    ...lifecycle(),
  });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(" "), /lap became invalid/);
});
