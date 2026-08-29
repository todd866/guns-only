import assert from "node:assert/strict";
import test from "node:test";

import {
  OKANAGAN_REQUIRED_PHASES,
  OKANAGAN_REQUIRED_SCREENSHOTS,
  OkanaganDigitalAxisModulator,
  assessOkanaganAiFlight,
  okanaganAiCommand,
  okanaganPhaseTimeoutSeconds,
  okanaganAiTarget,
  okanaganScreenshotIntegrity,
  okanaganScreenshotQualification,
  orderedValuesVisited,
  rawOkanaganGamepadAxis,
  wrapOkanaganAngleRad,
} from "./okanagan_ai_player.mjs";

function gate(id, x, y, z, radiusM = 500, targetSpeedMps = 55) {
  return {
    id,
    label: id.toUpperCase(),
    position: { x, y, z },
    radius_m: radiusM,
    target_speed_mps: targetSpeedMps,
  };
}

function state(overrides = {}) {
  return {
    phase: "depart",
    surface: "airborne",
    position: { x: 0, y: 600, z: 0 },
    velocity: { x: 0, y: 0, z: 50 },
    heading_rad: 0,
    pitch_rad: 0,
    roll_rad: 0,
    tas_mps: 50,
    vertical_speed_mps: 0,
    throttle: 0.65,
    water_kg: 0,
    scoops_commanded: false,
    active_gate: 0,
    route: [gate("one", 0, 700, 1_000)],
    ...overrides,
  };
}

test("angle wrap and inverse gamepad deadzone preserve short direction", () => {
  assert.ok(Math.abs(wrapOkanaganAngleRad(Math.PI * 2 - 0.1) + 0.1) < 1e-9);
  assert.ok(Math.abs(wrapOkanaganAngleRad(-Math.PI * 2 + 0.1) - 0.1) < 1e-9);
  assert.equal(rawOkanaganGamepadAxis(0), 0);
  assert.equal(rawOkanaganGamepadAxis(1), 1);
  assert.equal(rawOkanaganGamepadAxis(-1), -1);
  assert.ok(rawOkanaganGamepadAxis(0.2) > 0.14);
});

test("long authored transit legs receive explicit watchdog budgets", () => {
  assert.equal(okanaganPhaseTimeoutSeconds("join-scoop"), 210);
  assert.equal(okanaganPhaseTimeoutSeconds("rtb"), 240);
  assert.equal(okanaganPhaseTimeoutSeconds("scoop"), 60);
  assert.equal(okanaganPhaseTimeoutSeconds("unknown"), 180);
});

test("surface scoop target remains the visible lane endpoint after phase route reset", () => {
  const route = [
    gate("scoop-entry", 0, 520, 0),
    gate("scoop-touch", 200, 348, 700),
    gate("scoop-lane", 800, 350, 2_500),
  ];
  const target = okanaganAiTarget(state({
    phase: "scoop",
    surface: "water",
    position: { x: 220, y: 342, z: 710 },
    route,
    active_gate: 0,
  }));
  assert.equal(target.id, "scoop-lane");
  assert.equal(target.index, 2);
});

test("airborne pilot banks toward a published gate and commands climb energy", () => {
  const command = okanaganAiCommand(state({
    phase: "rtb",
    route: [gate("rtb-crossing", 1_000, 850, 1_000, 900, 65)],
    position: { x: 0, y: 600, z: 0 },
    tas_mps: 50,
    throttle: 0.4,
  }));
  assert.ok(command.roll > 0);
  assert.ok(command.pitch > 0);
  assert.ok(command.throttleUp);
  assert.equal(command.target.id, "rtb-crossing");
  assert.ok(command.target.desiredVerticalSpeedMps > 0);
});

test("lake and runway surface commands use physical rotation and digital steering", () => {
  const departure = okanaganAiCommand(state({
    phase: "depart",
    surface: "runway",
    tas_mps: 40,
    throttle: 0.7,
    route: [gate("departure", 400, 590, 1_000)],
  }));
  assert.equal(departure.roll, 0);
  assert.ok(departure.pitch >= 0.5);
  assert.ok(departure.yaw > 0);
  assert.equal(departure.throttleTarget, 1);

  const waterTakeoff = okanaganAiCommand(state({
    phase: "climb",
    surface: "water",
    position: { x: 0, y: 342, z: 0 },
    tas_mps: 45,
    route: [gate("lift-off", 200, 430, 1_000)],
  }));
  assert.equal(waterTakeoff.pitch, 0.72);
  assert.equal(waterTakeoff.throttleTarget, 1);
  assert.equal(waterTakeoff.scoops, false);
});

test("landing controller holds shallow sink and tight bank close to contact", () => {
  const command = okanaganAiCommand(state({
    phase: "approach",
    position: { x: 0, y: 438, z: 0 },
    vertical_speed_mps: -2.1,
    roll_rad: 20 * Math.PI / 180,
    route: [gate("threshold", 80, 433, 600, 420, 42)],
  }));
  assert.equal(command.target.landingSurfaceM, 433);
  assert.equal(command.target.desiredVerticalSpeedMps, -0.65);
  assert.ok(Math.abs(command.target.desiredBankRad) <= 9 * Math.PI / 180 + 1e-9);
  assert.ok(command.pitch > 0, "pilot should arrest the excessive sink before contact");
  assert.ok(command.target.guidanceRangeM > command.target.rangeM,
    "threshold guidance should continue down the runway rather than reverse at the point");
});

test("scoop touchdown aims through the lane instead of turning at water contact", () => {
  const route = [
    gate("scoop-entry", 0, 520, 0),
    gate("scoop-touch", 0, 348, 1_000),
    gate("scoop-lane", 800, 350, 3_000),
  ];
  const command = okanaganAiCommand(state({
    phase: "join-scoop",
    position: { x: 0, y: 360, z: 900 },
    route,
    active_gate: 1,
  }));
  assert.equal(command.target.id, "scoop-touch");
  assert.equal(command.target.guidanceX, 800);
  assert.equal(command.target.guidanceZ, 3_000);
  assert.ok(command.target.desiredVerticalSpeedMps < 0);
});

test("training drop arms only on the authored downwind drop gate", () => {
  const route = [
    gate("downwind-entry", 0, 720, 0, 900, 58),
    gate("training-drop", 0, 720, 1_000, 900, 58),
    gate("base-turn", 0, 610, 2_000, 900, 55),
  ];
  assert.equal(okanaganAiCommand(state({
    phase: "downwind",
    water_kg: 3_000,
    route,
    active_gate: 1,
    position: { x: 0, y: 720, z: 0 },
  })).drop, true);
  assert.equal(okanaganAiCommand(state({
    phase: "downwind",
    water_kg: 3_000,
    route,
    active_gate: 0,
  })).drop, false);
});

test("phase screenshots wait for the physical action they are meant to show", () => {
  assert.equal(okanaganScreenshotQualification("depart", state({
    phase: "depart", surface: "runway", active_gate: 0,
  })), false);
  assert.equal(okanaganScreenshotQualification("depart", state({
    phase: "depart", surface: "airborne", active_gate: 1,
  })), true);
  assert.equal(okanaganScreenshotQualification("scoop", state({
    phase: "scoop", surface: "water", scoop_valid: true, water_kg: 40,
  })), false);
  assert.equal(okanaganScreenshotQualification("scoop", state({
    phase: "scoop", surface: "water", scoop_valid: true, water_kg: 700,
  })), true);
  assert.equal(okanaganScreenshotQualification("downwind", state({
    phase: "downwind", water_released_this_tick_kg: 0,
  })), false);
  assert.equal(okanaganScreenshotQualification("downwind", state({
    phase: "downwind", water_released_this_tick_kg: 12,
  })), true);
  assert.equal(okanaganScreenshotQualification("approach", state({
    phase: "approach", surface: "airborne", active_gate: 0,
  })), false);
  assert.equal(okanaganScreenshotQualification("approach", state({
    phase: "approach", surface: "airborne", active_gate: 1,
  })), true);
});

test("screenshot integrity rejects large blank images without claiming visual quality", () => {
  assert.equal(okanaganScreenshotIntegrity({
    sampledPixels: 5_760,
    lumaStdDev: 0,
    uniqueColorBuckets: 1,
    nearBlackFraction: 1,
  }).pass, false);
  assert.equal(okanaganScreenshotIntegrity({
    sampledPixels: 5_760,
    lumaStdDev: 0,
    uniqueColorBuckets: 1,
    nearBlackFraction: 0,
  }).pass, false, "a uniform blue frame must not pass merely because it is bright");
  assert.equal(okanaganScreenshotIntegrity({
    sampledPixels: 5_760,
    lumaStdDev: 31,
    uniqueColorBuckets: 84,
    nearBlackFraction: 0.08,
  }).pass, true);
});

test("digital yaw modulator preserves proportional duty and sign", () => {
  const modulator = new OkanaganDigitalAxisModulator();
  const positive = Array.from({ length: 100 }, () => modulator.next(0.35));
  assert.equal(positive.filter((value) => value === 1).length, 35);
  const negative = Array.from({ length: 100 }, () => modulator.next(-0.22));
  assert.equal(negative.filter((value) => value === -1).length, 22);
  assert.equal(modulator.next(0), 0);
});

function successfulFixture() {
  const phases = OKANAGAN_REQUIRED_PHASES;
  const surfaces = [
    "runway", "airborne", "water", "airborne", "airborne",
    "airborne", "airborne", "runway", "runway",
  ];
  const water = [0, 0, 3_000, 3_000, 0, 0, 0, 0, 0];
  return phases.map((phase, index) => ({
    wallS: index,
    simS: index,
    phase,
    surface: surfaces[index],
    flyable: true,
    visibilityState: "visible",
    gamepadConnected: true,
    gamepadMapping: "standard",
    xM: index * 1_000,
    yM: surfaces[index] === "water" ? 342 : surfaces[index] === "runway" ? 433 : 700,
    zM: index * 1_100,
    waterKg: water[index],
    completedCycles: index >= 5 ? 1 : 0,
    waterReleasedThisTickKg: phase === "downwind" ? 18 : 0,
    fuelAboveMinimumKg: 100,
    scoopsCommanded: phase === "scoop",
    scoopValid: phase === "scoop",
    command: {
      roll: index === 1 ? 0.3 : 0,
      pitch: index === 1 ? 0.2 : 0,
      yaw: 0,
      scoops: phase === "scoop",
      drop: phase === "downwind",
    },
    authorityInput: {
      roll: index === 1 ? 0.3 : 0,
      pitch: index === 1 ? 0.2 : 0,
      yaw: 0,
      scoops: phase === "scoop",
      drop: phase === "downwind",
    },
    audioBuilt: true,
    audioContextState: "running",
    audioSilentQa: true,
    audioSignalActive: true,
    audioAudible: false,
    audioOutputMode: "silent-qa",
    debriefVisible: phase === "complete",
    debriefOutcome: phase === "complete" ? "complete" : null,
    debriefTitle: phase === "complete" ? "Complete" : "",
    debriefSummary: phase === "complete" ? "1 circuit" : "",
    debriefReserveProtected: phase === "complete",
  }));
}

function successfulJourney() {
  return {
    readyVisible: true,
    startClicked: true,
    readyMs: 500,
    startLatencyMs: 80,
    screenshots: OKANAGAN_REQUIRED_SCREENSHOTS.map((phase) => ({
      phase,
      file: `${phase}.png`,
      bytes: 5_000,
      actionQualified: true,
      visualIntegrity: true,
      pixelStats: {
        sampledPixels: 5_760,
        lumaStdDev: 31,
        uniqueColorBuckets: 84,
        nearBlackFraction: 0.08,
      },
    })),
  };
}

test("assessment requires the whole real-input scoop, drop, RTB and debrief lifecycle", () => {
  const samples = successfulFixture();
  const assessment = assessOkanaganAiFlight(samples, successfulJourney());
  assert.equal(assessment.pass, true, assessment.failures.join("\n"));
  assert.deepEqual(assessment.metrics.phases, OKANAGAN_REQUIRED_PHASES);
  assert.equal(assessment.metrics.maximumWaterKg, 3_000);
  assert.equal(assessment.metrics.releasedWaterKg, 3_000);
});

test("assessment rejects a launch-only trace that never scoops or recovers", () => {
  const samples = successfulFixture().slice(0, 2);
  const assessment = assessOkanaganAiFlight(samples, successfulJourney());
  assert.equal(assessment.pass, false);
  assert.match(assessment.failures.join(" "), /phases stopped|hopper|water circuit|terminal/iu);
});

test("assessment rejects decorative phase files and a dead silent-audio graph", () => {
  const blankJourney = successfulJourney();
  blankJourney.screenshots = blankJourney.screenshots.map((entry) => ({
    ...entry,
    bytes: 80_000,
    visualIntegrity: entry.phase !== "downwind",
  }));
  const blank = assessOkanaganAiFlight(successfulFixture(), blankJourney);
  assert.equal(blank.pass, false);
  assert.match(blank.failures.join(" "), /downwind phase screenshot was blank/iu);

  const decorativeJourney = successfulJourney();
  decorativeJourney.screenshots = decorativeJourney.screenshots.map((entry) => ({
    ...entry,
    actionQualified: entry.phase !== "scoop",
  }));
  const decorative = assessOkanaganAiFlight(successfulFixture(), decorativeJourney);
  assert.equal(decorative.pass, false);
  assert.match(decorative.failures.join(" "), /scoop phase screenshot was not action-qualified/iu);

  const silentGraph = successfulFixture().map((sample) => ({
    ...sample,
    audioContextState: "suspended",
    audioSignalActive: false,
    audioOutputMode: "suspended",
  }));
  const audio = assessOkanaganAiFlight(silentGraph, successfulJourney());
  assert.equal(audio.pass, false);
  assert.match(audio.failures.join(" "), /audio graph|scoop action|water release/iu);
});

test("ordered phase evidence cannot satisfy the contract out of order", () => {
  const evidence = orderedValuesVisited([
    { phase: "depart" }, { phase: "scoop" }, { phase: "join-scoop" },
  ], "phase", ["depart", "join-scoop", "scoop"]);
  assert.equal(evidence.pass, false);
});
