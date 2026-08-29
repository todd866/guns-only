import assert from "node:assert/strict";
import test from "node:test";

import {
  activeCobraPathGate,
  assessCobraBattleFramePixels,
  assessCobraAiEngagement,
  assessCobraAiFlight,
  assessCobraAiSortie,
  assessCobraFlightTelemetry,
  COBRA_AI_CAMP_EMBER_FINAL_HEADING_RAD,
  COBRA_AI_REARM_SETTLE_CLEARANCE_M,
  COBRA_AI_RTB_FINAL_CLEARANCE_M,
  COBRA_AI_SORTIE_MAX_SECONDS,
  cobraAiFireIntent,
  cobraAiFlightTarget,
  cobraAiGoalDurationSeconds,
  cobraAiPilotCommand,
  cobraAiRunnerCombatDecision,
  cobraBattleFramebufferRegion,
  cobraBattleProbeInFramebuffer,
  cobraPngDimensions,
  orderedActsVisited,
  rawGamepadAxis,
  wrapAngleRad,
} from "./cobra_ai_pilot.mjs";

function battlePixelFixture({ faction, y = 12, startX = 8, endX = 28 } = {}) {
  const width = 64;
  const height = 36;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 30;
    data[offset + 1] = 34;
    data[offset + 2] = 31;
    data[offset + 3] = 255;
  }
  const color = faction === "friendly" ? [227, 255, 176] : [255, 173, 120];
  const paint = (x, paintY) => {
    if (x < 0 || x >= width || paintY < 0 || paintY >= height) return;
    const offset = (paintY * width + x) * 4;
    [data[offset], data[offset + 1], data[offset + 2]] = color;
  };
  for (let x = startX; x <= endX; x += 1) {
    paint(x, y);
    paint(x, y + 1);
  }
  for (let flashY = y - 2; flashY <= y + 2; flashY += 1) {
    for (let flashX = startX - 2; flashX <= startX + 2; flashX += 1) {
      paint(flashX, flashY);
    }
  }
  return {
    image: { width, height, data },
    probe: {
      faction,
      flash: { x: startX, y },
      segment: { start: { x: startX, y }, end: { x: endX, y } },
    },
  };
}

function fillFixturePixel(image, x, y, [red, green, blue]) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = red;
  image.data[offset + 1] = green;
  image.data[offset + 2] = blue;
}

function authority(overrides = {}) {
  return {
    status: "active",
    mission_act: "ingress",
    path_gates: [
      { east_m: 0, north_m: 500, up_m: 140, active: true },
      { east_m: 300, north_m: 900, up_m: 145, active: false },
    ],
    route_guidance: {
      current_clearance_m: 35,
      target_agl_m: 38,
      remaining_m: 4_000,
      segment_index: 0,
      inside_corridor: true,
    },
    vehicle: {
      x_m: 0,
      y_m: 135,
      z_m: 0,
      yaw_rad: 0,
      yaw_rate_rad_s: 0,
      roll_rad: 0,
      pitch_rad: 0,
      ground_speed_mps: 20,
      directional_air_speed_mps: 20,
      vertical_speed_mps: 0,
      collective: 0.575,
      flyable: true,
      contact_failure_cause: "none",
      rotorcraft: { body_roll_rate_rad_s: 0 },
    },
    ...overrides,
  };
}

test("angle wrapping and gate selection are deterministic across north", () => {
  assert.ok(Math.abs(wrapAngleRad(Math.PI * 2 + 0.2) - 0.2) < 1e-9);
  assert.equal(activeCobraPathGate(authority()).north_m, 500);
});

test("pilot climbs from low clearance and turns toward a gate on the right", () => {
  const state = authority();
  state.route_guidance.current_clearance_m = 2;
  state.vehicle.collective = 0.2;
  state.path_gates[0].east_m = 500;
  const command = cobraAiPilotCommand(state);
  assert.ok(command.collectiveRate > 0.9);
  assert.ok(command.rightCyclic > 0);
  assert.ok(command.yaw > 0);
  assert.ok(command.target.targetClearanceM >= 24);
});

test("pilot lowers collective above the corridor and slows for a large turn", () => {
  const state = authority();
  state.route_guidance.current_clearance_m = 70;
  state.vehicle.collective = 0.72;
  state.vehicle.vertical_speed_mps = 2;
  state.path_gates[0].east_m = -500;
  state.path_gates[0].north_m = -100;
  const command = cobraAiPilotCommand(state);
  assert.ok(command.collectiveRate < 0);
  assert.ok(command.target.desiredSpeedMps < 15);
});

test("pilot commands a real descent when cruise lift carries it above the nap band", () => {
  const state = authority();
  state.route_guidance.current_clearance_m = 120;
  state.vehicle.y_m = 220;
  state.vehicle.collective = 0.40;
  state.vehicle.ground_speed_mps = 24;
  state.vehicle.directional_air_speed_mps = 24;
  state.path_gates[0].up_m = 145;
  const command = cobraAiPilotCommand(state);
  assert.equal(command.target.desiredVerticalSpeedMps, -3.4);
  assert.ok(command.target.targetCollective < 0.3,
    `expected decisive descent collective, got ${command.target.targetCollective}`);
  assert.ok(command.collectiveRate < -0.5,
    `expected collective-down authority, got ${command.collectiveRate}`);
});

test("pilot keeps descending when a falling valley floor carries it through the nap ceiling", () => {
  const state = authority();
  state.route_guidance.current_clearance_m = 95;
  state.vehicle.y_m = 220;
  state.vehicle.collective = 0.316;
  state.vehicle.vertical_speed_mps = -1.87;
  state.vehicle.ground_speed_mps = 25;
  state.vehicle.directional_air_speed_mps = 25;
  state.path_gates[0].up_m = 240;
  const command = cobraAiPilotCommand(state);
  assert.equal(command.target.desiredVerticalSpeedMps, -3.4);
  assert.ok(command.target.targetCollective < state.vehicle.collective,
    `descent arrested early at ${command.target.targetCollective}`);
  assert.ok(command.collectiveRate < 0);
});

test("combat pilot follows the hostile objective and slows into standoff", () => {
  const state = authority({
    mission_act: "engage",
    ground_war: {
      fob: { x_m: -1_000, z_m: -2_000 },
      sites: [{ id: "site.iron-bell-bridge.v1", owner: "hostile", x_m: 0, y_m: 100, z_m: 500 }],
      units: [],
    },
  });
  const target = cobraAiFlightTarget(state);
  assert.equal(target.mode, "combat");
  assert.equal(target.site_id, "site.iron-bell-bridge.v1");
  assert.equal(target.east_m, 0);
  assert.equal(target.north_m, 80);
  assert.equal(target.up_m, 170);
  assert.equal(target.aim_east_m, 0);
  assert.equal(target.aim_north_m, 500);
  const command = cobraAiPilotCommand(state);
  assert.equal(command.target.targetClearanceM, 60);
  assert.ok(command.target.desiredSpeedMps < 22);
});

test("combat position hold damps sideways drift while yawing toward the gunner's mark", () => {
  const state = authority({
    mission_act: "engage",
    ground_war: {
      fob: { x_m: -1_000, z_m: -2_000 },
      sites: [{ id: "site.iron-bell-bridge.v1", owner: "hostile", x_m: 0, y_m: 100, z_m: 500 }],
      units: [{ id: "gun", alive: true, x_m: 250, z_m: 500 }],
    },
    gunner: { selected_target_id: "gun" },
  });
  Object.assign(state.vehicle, {
    x_m: 0,
    z_m: 80,
    y_m: 170,
    yaw_rad: 0,
    ground_speed_mps: 8,
    directional_air_speed_mps: 0,
    velocity_x_mps: 8,
    velocity_z_mps: 0,
  });
  state.route_guidance.current_clearance_m = 60;
  const command = cobraAiPilotCommand(state);
  assert.equal(command.target.gateRangeM, 0);
  assert.equal(command.target.desiredSpeedMps, 0);
  assert.ok(command.rightCyclic < 0, "rightward drift should command a left correction");
  assert.ok(command.yaw > 0, "the nose should turn right toward the selected gun pit");
});

test("dry combat redirects to a staged Camp Ember rearm approach and safes the gun", () => {
  const state = authority({
    mission_act: "hold",
    ground_war: {
      ammo_remaining: 0,
      ammo_dry: true,
      fob_range_m: 1_000,
      fob: { x_m: -3_800, y_m: 214, z_m: -4_600, radius_m: 80 },
      sites: [{ id: "site.iron-bell-bridge.v1", owner: "hostile", x_m: 0, y_m: 100, z_m: 500 }],
      units: [{ id: "gun", alive: true, x_m: 0, z_m: 500 }],
    },
    gunner: { selected_target_id: "gun" },
  });
  Object.assign(state.vehicle, {
    x_m: -3_800,
    y_m: 246,
    z_m: -3_600,
    yaw_rad: Math.PI,
  });

  const target = cobraAiFlightTarget(state);
  const command = cobraAiPilotCommand(state);
  assert.equal(target.mode, "rearm-approach");
  assert.equal(target.east_m, -3_800);
  assert.equal(target.north_m, -4_600);
  assert.equal(target.up_m, 246);
  assert.equal(command.target.targetClearanceM, 32);
  assert.ok(command.target.desiredSpeedMps <= 24);
  assert.equal(command.fireIntent, false);
  assert.equal(cobraAiFireIntent(state), false);
});

test("Camp Ember rearm settle targets the service-zone clearance with low speed and sink", () => {
  const final = COBRA_AI_CAMP_EMBER_FINAL_HEADING_RAD;
  const rangeM = 40;
  const state = authority({
    mission_act: "hold",
    ground_war: {
      ammo_remaining: 0,
      ammo_dry: true,
      fob_range_m: rangeM,
      fob: { x_m: -3_800, y_m: 214, z_m: -4_600, radius_m: 80 },
      sites: [],
      units: [],
    },
    gunner: { selected_target_id: "gun" },
  });
  Object.assign(state.vehicle, {
    x_m: -3_800 - Math.sin(final) * rangeM,
    y_m: 222,
    z_m: -4_600 - Math.cos(final) * rangeM,
    yaw_rad: final,
    ground_speed_mps: 4,
    directional_air_speed_mps: 4,
    velocity_x_mps: Math.sin(final) * 4,
    velocity_z_mps: Math.cos(final) * 4,
    vertical_speed_mps: -1,
  });
  state.route_guidance.current_clearance_m = 8;

  const command = cobraAiPilotCommand(state);
  assert.equal(command.target.mode, "rearm-settle");
  assert.equal(command.target.targetClearanceM, COBRA_AI_REARM_SETTLE_CLEARANCE_M);
  assert.ok(command.target.targetClearanceM <= 9);
  assert.ok(command.target.desiredSpeedMps <= 1.4);
  assert.ok(command.target.desiredVerticalSpeedMps >= -0.9);
  assert.ok(command.target.desiredVerticalSpeedMps < 0);
  assert.ok(command.forwardCyclic < 0, "four metres per second on short final should command braking");
  assert.equal(command.fireIntent, false);
});

test("RTB follows the sim-authored Camp Ember arrival gate before final", () => {
  const state = authority({
    mission_act: "rtb",
    path_gates: [
      { east_m: -1_700, north_m: -5_800, up_m: 514, half_m: 95, active: true },
      { east_m: -2_760, north_m: -5_200, up_m: 364, half_m: 72, active: false },
      { east_m: -3_800, north_m: -4_600, up_m: 226, half_m: 28, active: false },
    ],
    ground_war: {
      ammo_remaining: 450,
      ammo_dry: false,
      // Being geometrically near the pad is not permission to bypass the active arrival gate.
      // This represents an off-axis aircraft whose authority still owns gate zero.
      fob_range_m: 100,
      fob: { x_m: -3_800, y_m: 214, z_m: -4_600, radius_m: 80 },
    },
    gunner: { selected_target_id: "gun" },
  });
  Object.assign(state.vehicle, { x_m: -1_000, z_m: -6_200, y_m: 480 });

  const target = cobraAiFlightTarget(state);
  const command = cobraAiPilotCommand(state);
  assert.equal(target.mode, "rtb-arrival");
  assert.equal(target.east_m, -1_700);
  assert.equal(target.north_m, -5_800);
  assert.equal(command.target.targetClearanceM, 38);
  assert.ok(command.target.desiredSpeedMps <= 24);
  assert.equal(command.fireIntent, false);
});

test("RTB final holds Camp Ember heading and demands a slow sub-12-metre landing", () => {
  const final = COBRA_AI_CAMP_EMBER_FINAL_HEADING_RAD;
  const rangeM = 60;
  const fob = { x_m: -3_800, y_m: 214, z_m: -4_600, radius_m: 80 };
  const previousGate = {
    east_m: fob.x_m - Math.sin(final) * 180,
    north_m: fob.z_m - Math.cos(final) * 180,
    up_m: 236.5,
    half_m: 38,
    active: false,
  };
  const state = authority({
    mission_act: "rtb",
    path_gates: [
      previousGate,
      { east_m: fob.x_m, north_m: fob.z_m, up_m: 226, half_m: 28, active: true },
    ],
    ground_war: {
      ammo_remaining: 450,
      ammo_dry: false,
      fob_range_m: rangeM,
      fob,
    },
    gunner: { selected_target_id: "gun" },
  });
  Object.assign(state.vehicle, {
    x_m: fob.x_m - Math.sin(final) * rangeM,
    y_m: 224,
    z_m: fob.z_m - Math.cos(final) * rangeM,
    yaw_rad: final,
    ground_speed_mps: 3,
    directional_air_speed_mps: 3,
    velocity_x_mps: Math.sin(final) * 3,
    velocity_z_mps: Math.cos(final) * 3,
    vertical_speed_mps: -1.4,
  });
  state.route_guidance.current_clearance_m = 10;

  const target = cobraAiFlightTarget(state);
  const command = cobraAiPilotCommand(state);
  assert.equal(target.mode, "rtb-final");
  assert.equal(command.target.targetClearanceM, COBRA_AI_RTB_FINAL_CLEARANCE_M);
  assert.ok(command.target.targetClearanceM < 12);
  assert.ok(Math.abs(wrapAngleRad(command.target.guidanceHeadingRad - final)) < 1e-9);
  assert.ok(command.target.desiredSpeedMps <= 1.4);
  assert.ok(command.target.desiredVerticalSpeedMps >= -0.75);
  assert.ok(command.target.desiredVerticalSpeedMps < 0);
  assert.ok(command.forwardCyclic < 0, "three metres per second on final should command braking");
  assert.equal(command.fireIntent, false);
});

test("only an armed combat target produces Cobra AI fire intent", () => {
  const combat = authority({
    mission_act: "engage",
    ground_war: {
      ammo_remaining: 450,
      ammo_dry: false,
      fob: { x_m: -3_800, y_m: 214, z_m: -4_600, radius_m: 80 },
      sites: [{ id: "site.iron-bell-bridge.v1", owner: "hostile", x_m: 0, y_m: 100, z_m: 500 }],
      units: [{ id: "gun", alive: true, x_m: 0, z_m: 500 }],
    },
    gunner: { selected_target_id: "gun" },
  });
  assert.equal(cobraAiFireIntent(combat), true);
  assert.equal(cobraAiPilotCommand(combat).fireIntent, true);

  const ingress = authority({
    mission_act: "ingress",
    ground_war: combat.ground_war,
    gunner: combat.gunner,
  });
  assert.equal(cobraAiFireIntent(ingress), false);
  assert.equal(cobraAiPilotCommand(ingress).fireIntent, false);

  combat.ground_war.units[0].alive = false;
  assert.equal(cobraAiFireIntent(combat), false,
    "a stale selection must safe the gun on the sample where its target dies");
});

test("runner combat decision releases F immediately for rearm, RTB and non-combat goals", () => {
  const liveSample = { selectedTargetId: "gun", selectedTargetAlive: true };
  const combat = { fireIntent: true, target: { mode: "combat" } };
  assert.deepEqual(cobraAiRunnerCombatDecision({
    goal: "sortie",
    sample: liveSample,
    command: combat,
    fireHeld: false,
  }), {
    selectTarget: false,
    desiredFireHeld: true,
    fireKeyAction: "down",
  });

  const rearm = { fireIntent: false, target: { mode: "rearm-approach" } };
  assert.deepEqual(cobraAiRunnerCombatDecision({
    goal: "sortie",
    sample: liveSample,
    command: rearm,
    fireHeld: true,
  }), {
    selectTarget: false,
    desiredFireHeld: false,
    fireKeyAction: "up",
  });

  const deadTarget = { selectedTargetId: "gun", selectedTargetAlive: false };
  assert.deepEqual(cobraAiRunnerCombatDecision({
    goal: "sortie",
    sample: deadTarget,
    command: { fireIntent: false, target: { mode: "combat" } },
    fireHeld: false,
    targetAttemptDue: true,
  }), {
    selectTarget: true,
    desiredFireHeld: false,
    fireKeyAction: null,
  });

  assert.equal(cobraAiRunnerCombatDecision({
    goal: "flight",
    sample: liveSample,
    command: combat,
    fireHeld: true,
  }).fireKeyAction, "up");
});

test("sortie goal owns a bounded full-mission deadline while explicit overrides still win", () => {
  assert.equal(COBRA_AI_SORTIE_MAX_SECONDS, 1_200);
  assert.equal(cobraAiGoalDurationSeconds("sortie"), COBRA_AI_SORTIE_MAX_SECONDS);
  assert.equal(cobraAiGoalDurationSeconds("engage"), 260);
  assert.equal(cobraAiGoalDurationSeconds("sortie", 42), 42);
  assert.throws(() => cobraAiGoalDurationSeconds("unknown"), /Unknown Cobra AI goal/);
});

test("gamepad inverse deadzone round-trips requested stick magnitude", () => {
  assert.equal(rawGamepadAxis(0), 0);
  assert.ok(Math.abs(rawGamepadAxis(0.5) - 0.56) < 1e-9);
  assert.ok(Math.abs(rawGamepadAxis(-0.5) + 0.56) < 1e-9);
});

test("flight assessment requires real progress, sustained lift and a flyable aircraft", () => {
  const samples = Array.from({ length: 301 }, (_, index) => ({
    wallS: index * 0.1,
    status: "active",
    flyable: true,
    clearanceM: index < 20 ? index * 0.5 : 32,
    remainingM: 4_000 - index * 2,
    segmentIndex: index < 150 ? 0 : 1,
    activeGateIndex: Math.min(4, Math.floor(index / 75)),
    activeGateUpM: 32,
    authorityTick: index * 12,
    xM: index * 2,
    yM: 32,
    zM: 0,
    insideCorridor: index > 30,
    rollRad: 0.1,
    contactFailureCause: "none",
    act: "ingress",
    briefHidden: true,
    paused: false,
    visibilityState: "visible",
    gamepadConnected: true,
  }));
  const result = assessCobraAiFlight(samples);
  assert.equal(result.pass, true);
  assert.ok(result.metrics.progressM >= 450);
  assert.ok(result.metrics.airborneSeconds >= 20);

  const withLens = samples.map((sample, index) => ({
    ...sample,
    groundSpeedMps: index < 40 ? 0 : 26,
    cockpitLensActive: true,
    cockpitFovDeg: index < 40 ? 70 : 58,
    cockpitOpticalCenterX01: 0,
    cockpitOpticalCenterY01: 0,
  }));
  const lensResult = assessCobraAiFlight(withLens, {
    requireLowSpeedLensEvidence: true,
  });
  assert.equal(lensResult.pass, true);
  assert.equal(lensResult.metrics.maximumLowSpeedFovDeg, 70);
  assert.equal(lensResult.metrics.minimumCruiseFovDeg, 58);

  const shiftedLens = withLens.map((sample) => ({
    ...sample,
    cockpitOpticalCenterX01: 0.02,
  }));
  assert.match(
    assessCobraAiFlight(shiftedLens, {
      requireLowSpeedLensEvidence: true,
    }).failures.join("\n"),
    /moved the nose-forward optical center/,
  );

  const crashed = samples.map((sample) => ({ ...sample }));
  crashed.at(-1).status = "vehicle-authority-lost";
  crashed.at(-1).flyable = false;
  crashed.at(-1).contactFailureCause = "water-contact";
  const failed = assessCobraAiFlight(crashed);
  assert.equal(failed.pass, false);
  assert.match(failed.failures.join(" "), /active|flyable|water-contact/);

  const tooHigh = samples.map((sample) => ({ ...sample, clearanceM: 85 }));
  const highResult = assessCobraAiFlight(tooHigh);
  assert.equal(highResult.pass, false);
  assert.match(highResult.failures.join(" "), /p95 clearance/);

  const tooLow = samples.map((sample) => ({ ...sample, clearanceM: 12 }));
  const lowResult = assessCobraAiFlight(tooLow);
  assert.equal(lowResult.pass, false);
  assert.match(lowResult.failures.join(" "), /never established the nap-of-earth clearance band/);

  const terrainStrikeRisk = samples.map((sample, index) => ({
    ...sample,
    clearanceM: index >= 80 && index < 105 ? 12 : sample.clearanceM,
  }));
  const strikeRiskResult = assessCobraAiFlight(terrainStrikeRisk);
  assert.equal(strikeRiskResult.pass, false);
  assert.match(strikeRiskResult.failures.join(" "), /p05 clearance/);
});

test("flight assessment measures round-trip travel and permits only a terminal tail", () => {
  const samples = Array.from({ length: 301 }, (_, index) => ({
    wallS: index * 0.1,
    status: index === 300 ? "victory" : "active",
    flyable: true,
    clearanceM: 32,
    remainingM: 4_000,
    activeGateIndex: Math.min(4, Math.floor(index / 75)),
    activeGateUpM: 32,
    authorityTick: index * 12,
    xM: index <= 150 ? index * 4 : (300 - index) * 4,
    yM: 32,
    zM: 0,
    // RTB follows a separate authority arrival. It is intentionally outside the outbound route
    // corridor and must not dilute the valid Ingress corridor evidence.
    insideCorridor: index < 100,
    rollRad: 0,
    contactFailureCause: "none",
    act: index < 100 ? "ingress" : "rtb",
    briefHidden: true,
    paused: false,
    visibilityState: "visible",
    gamepadConnected: true,
  }));
  // A terminal presentation read can arrive several seconds after simulation authority freezes.
  samples.push({ ...samples.at(-1), wallS: 35 });

  const strict = assessCobraAiFlight(samples);
  assert.equal(strict.pass, false);
  assert.match(strict.failures.join(" "), /left active state/);

  const recovered = assessCobraAiFlight(samples, { allowTerminalState: true });
  assert.equal(recovered.pass, true);
  assert.equal(recovered.metrics.horizontalDisplacementM, 0);
  assert.ok(recovered.metrics.cumulativeHorizontalTravelM >= 1_190);
  assert.equal(recovered.metrics.progressM, recovered.metrics.cumulativeHorizontalTravelM);
  assert.equal(recovered.metrics.routePhaseCorridorFraction, 1);
  assert.equal(recovered.metrics.maximumAuthorityStallSeconds, 0);
  assert.equal(recovered.metrics.durationSeconds, 30);

  samples.at(-2).status = "defeat";
  samples.at(-1).status = "active";
  const resumed = assessCobraAiFlight(samples, { allowTerminalState: true });
  assert.equal(resumed.pass, false);
  assert.match(resumed.failures.join(" "), /resumed active state/);
});

test("flight assessment rejects a frozen snapshot and invalid gate progress", () => {
  const samples = Array.from({ length: 301 }, (_, index) => ({
    wallS: index * 0.1,
    status: "active",
    flyable: true,
    clearanceM: 32,
    remainingM: 4_000,
    activeGateIndex: index < 150 ? 0 : -1,
    activeGateUpM: 32,
    authorityTick: index < 100 ? index * 12 : 1_200,
    xM: Math.min(index, 100) * 6,
    yM: 32,
    zM: 0,
    insideCorridor: false,
    rollRad: 0,
    contactFailureCause: "none",
    act: "depart",
    briefHidden: true,
    paused: false,
    visibilityState: "visible",
    gamepadConnected: true,
  }));
  const result = assessCobraAiFlight(samples);
  assert.equal(result.pass, false);
  assert.match(
    result.failures.join(" "),
    /authority rate|authority advanced|authority stalled|path gate|active gates/,
  );
});

test("flight assessment rejects cockpit obstruction, pause and slow Ready", () => {
  const samples = Array.from({ length: 301 }, (_, index) => ({
    wallS: index * 0.1,
    status: "active",
    flyable: true,
    clearanceM: 32,
    remainingM: 4_000 - index * 2,
    activeGateIndex: Math.min(4, Math.floor(index / 75)),
    activeGateUpM: 32,
    authorityTick: index * 12,
    xM: index * 2,
    yM: 32,
    zM: 0,
    insideCorridor: true,
    rollRad: 0,
    contactFailureCause: "none",
    act: "ingress",
    briefHidden: index !== 100,
    paused: index === 150,
    visibilityState: "visible",
    gamepadConnected: true,
  }));
  const result = assessCobraAiFlight(samples, { readyMs: 9_000 });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(" "), /brief|paused|Ready/);
});

test("flight assessment distinguishes index changes from actual gate-volume entries", () => {
  const samples = Array.from({ length: 301 }, (_, index) => ({
    wallS: index * 0.1,
    status: "active",
    flyable: true,
    clearanceM: 32,
    remainingM: 4_000 - index * 2,
    activeGateIndex: Math.min(4, Math.floor(index / 75)),
    activeGateUpM: 32,
    activeGateRadiusM: 40,
    activeGateDistanceM: 65,
    authorityTick: index * 12,
    xM: index * 2,
    yM: 32,
    zM: 0,
    insideCorridor: true,
    rollRad: 0,
    contactFailureCause: "none",
    act: index < 150 ? "depart" : "ingress",
    briefHidden: true,
    paused: false,
    visibilityState: "visible",
    gamepadConnected: true,
  }));
  const missed = assessCobraAiFlight(samples, {
    minimumGateEntries: 2,
    requiredActs: ["depart", "ingress"],
  });
  assert.equal(missed.pass, false);
  assert.match(missed.failures.join(" "), /gate volumes entered/);

  samples[50].activeGateDistanceM = 20;
  samples[200].activeGateDistanceM = 20;
  const entered = assessCobraAiFlight(samples, {
    minimumGateEntries: 2,
    requiredActs: ["depart", "ingress"],
  });
  assert.equal(entered.pass, true);
});

test("battle framebuffer scorer requires a continuous faction-colour tracer at the exact probe", () => {
  const friendly = battlePixelFixture({ faction: "friendly" });
  const friendlyResult = assessCobraBattleFramePixels(friendly.image, friendly.probe);
  assert.equal(friendlyResult.pass, true, friendlyResult.failures.join("; "));
  assert.ok(friendlyResult.metrics.streakPx >= 12 * 0.55);
  assert.ok(friendlyResult.metrics.flashMatchedPixels > 0);

  const hostile = battlePixelFixture({ faction: "hostile", startX: 10, endX: 22 });
  const hostileResult = assessCobraBattleFramePixels(hostile.image, hostile.probe);
  assert.equal(hostileResult.pass, true, hostileResult.failures.join("; "));

  const scaled = battlePixelFixture({ faction: "friendly", startX: 4, endX: 36 });
  const scaledResult = assessCobraBattleFramePixels(scaled.image, {
    ...scaled.probe,
    pixelScale: 2,
  });
  assert.equal(scaledResult.pass, true, scaledResult.failures.join("; "));

  const mislabelled = assessCobraBattleFramePixels(friendly.image, {
    ...friendly.probe,
    faction: "hostile",
  });
  assert.equal(mislabelled.pass, false);
  assert.match(mislabelled.failures.join(" "), /framebuffer pixels|muzzle flash|dominated/);

  const unrelated = battlePixelFixture({ faction: "friendly", y: 30 });
  const absentAtProbe = assessCobraBattleFramePixels(unrelated.image, {
    ...unrelated.probe,
    flash: { x: 8, y: 8 },
    segment: { start: { x: 8, y: 8 }, end: { x: 28, y: 8 } },
  });
  assert.equal(absentAtProbe.pass, false,
    "same-hue pixels elsewhere in the framebuffer cannot certify the authority packet");

  const noFlash = battlePixelFixture({ faction: "hostile", startX: 8, endX: 28 });
  const noFlashResult = assessCobraBattleFramePixels(noFlash.image, {
    ...noFlash.probe,
    flash: { x: 52, y: 28 },
  });
  assert.equal(noFlashResult.pass, false);
  assert.match(noFlashResult.failures.join(" "), /muzzle flash/);

  const broken = battlePixelFixture({ faction: "friendly", startX: 8, endX: 28 });
  for (let x = 12; x <= 24; x += 1) {
    fillFixturePixel(broken.image, x, 12, [30, 34, 31]);
    fillFixturePixel(broken.image, x, 13, [30, 34, 31]);
  }
  const brokenResult = assessCobraBattleFramePixels(broken.image, broken.probe);
  assert.equal(brokenResult.pass, false);
  assert.match(brokenResult.failures.join(" "), /framebuffer streak/);
});

test("battle framebuffer coordinates scale and crop without moving the authority probe", () => {
  const projected = {
    faction: "friendly",
    tick: 44,
    viewportWidthPx: 100,
    viewportHeightPx: 50,
    flash: { x: 10, y: 12 },
    segment: { start: { x: 20, y: 14 }, end: { x: 36, y: 18 } },
  };
  const framebuffer = cobraBattleProbeInFramebuffer(projected, 200, 100);
  assert.deepEqual(framebuffer.flash, { x: 20, y: 24 });
  assert.deepEqual(framebuffer.segment.end, { x: 72, y: 36 });
  assert.equal(framebuffer.pixelScale, 2);
  const region = cobraBattleFramebufferRegion(framebuffer, 200, 100);
  assert.ok(region.crop.x < framebuffer.flash.x);
  assert.ok(region.crop.right > framebuffer.segment.end.x);
  assert.deepEqual(region.probe.flash, {
    x: framebuffer.flash.x - region.crop.x,
    y: framebuffer.flash.y - region.crop.y,
  });
  assert.equal(cobraBattleProbeInFramebuffer(projected, 200, 0), null);

  const png = Buffer.alloc(24);
  png[0] = 0x89;
  png.write("PNG", 1, "ascii");
  png.writeUInt32BE(1440, 16);
  png.writeUInt32BE(900, 20);
  assert.deepEqual(cobraPngDimensions(png), { width: 1440, height: 900 });
  assert.throws(() => cobraPngDimensions(Buffer.from("not a png")), /PNG framebuffer/);
});

test("engagement assessment requires ordered acts, real controls, damage and visible exchange", () => {
  const acts = ["depart", "ingress", "engage"];
  const samples = acts.flatMap((act, actIndex) => Array.from({ length: 10 }, (_, index) => ({
    wallS: actIndex * 10 + index,
    act,
    combatLive: act === "engage",
    ammoRemaining: act === "engage" && index >= 5 ? 894 : 900,
    hostileHealthTotal: act === "engage" && index >= 5 ? 980 : 1_000,
    hostileUnitCount: 10,
    friendlyKills: 0,
    selectedTargetId: act === "engage" ? "hostile.pit" : null,
    selectedTargetHealth: act === "engage" && index >= 5 ? 139.45 : 140,
    selectedTargetGunHit: act === "engage" && index >= 5,
    selectedTargetGunHitTick: act === "engage" && index >= 5 ? 31 : null,
    fireKeyAction: act === "engage" && index === 3 ? "down" : null,
    fireHeld: act === "engage" && index >= 3,
    fireAuthorized: act === "engage" && index >= 4,
    battleEvidenceVisible: act === "engage" && (index === 6 || index === 7),
    battleEvidenceFaction: act === "engage" && index === 6 ? "friendly"
      : act === "engage" && index === 7 ? "hostile" : null,
    battleEvidenceSpanPx: act === "engage" && index === 6 ? 14
      : act === "engage" && index === 7 ? 9 : 0,
    battlePixelEvidenceVisible: act === "engage" && (index === 6 || index === 7),
    battlePixelEvidenceFaction: act === "engage" && index === 6 ? "friendly"
      : act === "engage" && index === 7 ? "hostile" : null,
    battlePixelMatchedPixels: act === "engage" && index === 6 ? 10
      : act === "engage" && index === 7 ? 7 : 0,
    battlePixelStreakPx: act === "engage" && index === 6 ? 8
      : act === "engage" && index === 7 ? 5 : 0,
    battlePixelFlashMatchedPixels: act === "engage" && (index === 6 || index === 7) ? 2 : 0,
    threatBurstsFired: 0,
    guidanceVisible: act === "engage",
    guidanceRebuildCount: act === "engage" ? 7 : 6,
    guidanceTimeDriven: false,
  })));
  assert.equal(orderedActsVisited(samples, acts).pass, true);
  const result = assessCobraAiEngagement(samples);
  assert.equal(result.pass, true);
  assert.equal(result.metrics.roundsExpended, 6);
  assert.ok(result.metrics.selectedTargetDamage > 0);
  assert.equal(result.metrics.combatGuidanceRebuildSpan, 0);
  assert.equal(result.metrics.maximumFriendlyBattleSpanPx, 14);
  assert.equal(result.metrics.maximumHostileBattleSpanPx, 9);
  assert.equal(result.metrics.maximumFriendlyBattlePixelStreakPx, 8);
  assert.equal(result.metrics.maximumHostileBattlePixelStreakPx, 5);

  const semanticOnly = samples.map((sample) => ({
    ...sample,
    battlePixelEvidenceVisible: false,
  }));
  const semanticOnlyRejected = assessCobraAiEngagement(semanticOnly);
  assert.equal(semanticOnlyRejected.pass, false);
  assert.match(semanticOnlyRejected.failures.join(" "), /framebuffer/,
    "projected geometry without captured pixels must not certify a visible battle");

  const claimedWithoutPixels = samples.map((sample) => ({
    ...sample,
    battlePixelMatchedPixels: 0,
    battlePixelStreakPx: 0,
    battlePixelFlashMatchedPixels: 0,
  }));
  const unscoredClaimRejected = assessCobraAiEngagement(claimedWithoutPixels);
  assert.equal(unscoredClaimRejected.pass, false);
  assert.match(unscoredClaimRejected.failures.join(" "), /framebuffer/,
    "a boolean claim cannot bypass framebuffer pixel metrics");

  const inferredHitOnly = samples.map((sample) => ({
    ...sample,
    selectedTargetGunHit: false,
    selectedTargetGunHitTick: null,
  }));
  const rejected = assessCobraAiEngagement(inferredHitOnly);
  assert.equal(rejected.pass, false);
  assert.match(rejected.failures.join(" "), /player gun-hit/,
    "ammo plus unrelated health loss must not substitute for an authority hit event");

  const staleHit = samples.map((sample) => ({
    ...sample,
    selectedTargetGunHit: sample.selectedTargetId !== null,
    selectedTargetGunHitTick: sample.selectedTargetId !== null ? 12 : null,
  }));
  const staleRejected = assessCobraAiEngagement(staleHit);
  assert.equal(staleRejected.pass, false);
  assert.match(staleRejected.failures.join(" "), /player gun-hit/,
    "a rolling hit event that predates the trigger pull is not fresh engagement evidence");

  const missingUnitFrame = samples.map((sample) => ({
    ...sample,
    hostileHealthTotal: 1_000,
  }));
  missingUnitFrame[24].hostileUnitCount = 0;
  missingUnitFrame[24].hostileHealthTotal = 0;
  const missingUnitRejected = assessCobraAiEngagement(missingUnitFrame);
  assert.equal(missingUnitRejected.pass, false);
  assert.match(missingUnitRejected.failures.join(" "), /hostile health loss/,
    "a transient empty unit array must not manufacture hostile damage");

  const tinyTracers = samples.map((sample) => ({
    ...sample,
    battleEvidenceSpanPx: sample.battleEvidenceVisible ? 6 : 0,
  }));
  const illegible = assessCobraAiEngagement(tinyTracers);
  assert.equal(illegible.pass, false);
  assert.match(illegible.failures.join(" "), /tracer span/);

  const departureOnly = samples.filter((sample) => sample.act === "depart");
  assert.equal(assessCobraAiEngagement(departureOnly).pass, false);
});

test("full-sortie assessment requires conquest, rearm, safe fire, RTB and a live silent audio graph", () => {
  const common = {
    status: "active",
    flyable: true,
    friendlyPoints: 1,
    hostilePoints: 3,
    siteOwnershipSignature: "ember:friendly|bridge:hostile|ford:hostile|ridge:hostile",
    fobRearms: 0,
    ammoRemaining: 900,
    ammoDry: false,
    fobRangeM: 4_000,
    clearanceM: 40,
    contactKind: "airborne",
    missionOutcome: "pending",
    debriefMissionOutcome: "pending",
    debriefVisible: false,
    selectedTargetId: null,
    selectedTargetAlive: false,
    pilotMode: "route",
    pilotFireIntent: false,
    fireHeld: false,
    audioQaSilent: true,
    audioSignalActive: true,
    audioAudible: false,
    audioOutputMode: "silent-qa",
  };
  const sample = (wallS, act, overrides = {}) => ({ ...common, wallS, act, ...overrides });
  const samples = [
    sample(0, "depart"),
    sample(60, "ingress"),
    sample(130, "engage", {
      selectedTargetId: "pit",
      selectedTargetAlive: true,
      pilotMode: "combat",
      pilotFireIntent: true,
      fireHeld: true,
      ammoRemaining: 500,
    }),
    sample(180, "hold", {
      selectedTargetId: "pit",
      selectedTargetAlive: true,
      pilotMode: "combat",
      pilotFireIntent: true,
      fireHeld: true,
      ammoRemaining: 20,
    }),
    sample(190, "hold", { pilotMode: "rearm-approach", ammoRemaining: 0, ammoDry: true }),
    sample(240, "hold", {
      pilotMode: "rearm-settle",
      ammoRemaining: 0,
      ammoDry: true,
      fobRangeM: 30,
    }),
    sample(241, "hold", {
      pilotMode: "combat",
      ammoRemaining: 900,
      fobRearms: 1,
      friendlyPoints: 2,
      hostilePoints: 2,
      siteOwnershipSignature: "ember:friendly|bridge:friendly|ford:hostile|ridge:hostile",
    }),
    sample(390, "rtb", {
      pilotMode: "rtb-arrival",
      ammoRemaining: 600,
      fobRearms: 1,
      friendlyPoints: 3,
      hostilePoints: 1,
      siteOwnershipSignature: "ember:friendly|bridge:friendly|ford:friendly|ridge:hostile",
      missionOutcome: "victory",
      debriefMissionOutcome: "victory",
    }),
    sample(470, "rtb", {
      pilotMode: "rtb-final",
      ammoRemaining: 600,
      fobRearms: 1,
      fobRangeM: 50,
      clearanceM: 8,
      friendlyPoints: 3,
      hostilePoints: 1,
      siteOwnershipSignature: "ember:friendly|bridge:friendly|ford:friendly|ridge:hostile",
      missionOutcome: "victory",
      debriefMissionOutcome: "victory",
    }),
    sample(480, "complete", {
      status: "victory",
      pilotMode: null,
      ammoRemaining: 600,
      fobRearms: 1,
      fobRangeM: 20,
      clearanceM: 4,
      contactKind: "stable-surface-contact",
      friendlyPoints: 3,
      hostilePoints: 1,
      siteOwnershipSignature: "ember:friendly|bridge:friendly|ford:friendly|ridge:hostile",
      missionOutcome: "victory",
      debriefMissionOutcome: "victory",
      debriefVisible: true,
    }),
  ];

  const accepted = assessCobraAiSortie(samples);
  assert.equal(accepted.pass, true, accepted.failures.join("\n"));
  assert.equal(accepted.metrics.maximumFobRearms, 1);
  assert.equal(accepted.metrics.terminalContactKind, "stable-surface-contact");
  assert.equal(accepted.metrics.unsafeFireHeldSamples, 0);

  const unsafe = samples.map((entry) => ({ ...entry }));
  unsafe[7].fireHeld = true;
  unsafe.at(-1).contactKind = "surface-contact";
  unsafe.at(-1).audioAudible = true;
  const rejected = assessCobraAiSortie(unsafe);
  assert.equal(rejected.pass, false);
  assert.match(rejected.failures.join(" "), /fire remained held|stable surface contact|leaked/);
});

test("telemetry assessment requires production Cobra rows with advancing authority", () => {
  const samples = [{ authorityTick: 0 }, { authorityTick: 3_600 }];
  const healthy = assessCobraFlightTelemetry({
    telemetryRequests: 3,
    telemetryHeaderRows: 3,
    telemetryCobraSessions: 1,
    telemetryCobraStateRows: 30,
    telemetryMinimumCobraAuthorityTick: 12,
    telemetryMaximumCobraAuthorityTick: 3_480,
  }, samples);
  assert.equal(healthy.pass, true);

  const empty = assessCobraFlightTelemetry({
    telemetryRequests: 1,
    telemetryHeaderRows: 1,
    telemetryCobraSessions: 0,
    telemetryCobraStateRows: 0,
  }, samples);
  assert.equal(empty.pass, false);
  assert.match(empty.failures.join(" "), /Cobra session|state rows|tick/);
});
