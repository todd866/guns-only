import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { radialStickAxes } from "../../web/wwwroot/render/input/dual_stick_input.js";

import {
  assessFixedWingAiFlight,
  boundedFixedWingGamepadAxes,
  createFirstRunWeaponState,
  createFixedWingAiControllerState,
  createFixedWingGunFireState,
  FIXED_WING_AI_MISSIONS,
  FIXED_WING_AI_SAMPLE_MS,
  firstRunValleyBankFeedForwardDeg,
  firstRunValleyClearanceEvidence,
  firstRunGunHandoffEvidence,
  firstRunWeaponPulse,
  fixedWingAiEvidencePhase,
  fixedWingPhaseCaptureReady,
  fixedWingAiCommand,
  fixedWingCoordinatedLoadFactorG,
  fixedWingAiGunFireDecision,
  fixedWingAiGunFireHold,
  fixedWingIncomingTracerRows,
  fixedWingAiTarget,
  fixedWingLoadFactorForPitch,
  fixedWingOpponentTacticName,
  fixedWingPageSample,
  fixedWingPitchForLoadFactor,
  fixedWingTelemetryNumberOrNull,
  installFixedWingBrowserPilot,
  longestRunawayChaseSeconds,
  missedClosePassEpisodeStats,
  missionSatisfied,
  orderedValuesVisited,
  physicalRollRockingStats,
  rapierAttackEvidence,
  rapierSortieEvidence,
  rawFixedWingGamepadAxis,
  rawFixedWingGamepadAxes,
  rollCommandChatterStats,
  rollInputFidelityStats,
  settledLoadedOverbankStats,
  targetVerticalExcursionStats,
  topGunRecoveryTarget,
  topGunSortieEvidence,
  unloadedRollEpisodeStats,
  wrapAngleDeg,
} from "./fixed_wing_ai_pilot.mjs";

test("fixed-wing telemetry sampling preserves absent and invalid numeric channels", () => {
  assert.equal(fixedWingTelemetryNumberOrNull(undefined), null);
  assert.equal(fixedWingTelemetryNumberOrNull(null), null);
  assert.equal(fixedWingTelemetryNumberOrNull(12.5), 12.5);
  assert.ok(Number.isNaN(fixedWingTelemetryNumberOrNull(Number.NaN)));
  assert.equal(fixedWingTelemetryNumberOrNull(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
});

test("browser page sampler is self-contained across the Playwright boundary", () => {
  const sampled = vm.runInNewContext(
    `(${fixedWingPageSample.toString()})({ startMs: 250, previousMissiles: 2 })`,
    {
      globalThis: {
        __gunsState: {
          mission_definition_id: "mission.test",
          roll_rate_dps: null,
          g_actual: 4.5,
          aoa_deg: Number.NaN,
          vx: 10,
          vy: -2,
          vz: 30,
          pfx: 0.1,
          pfy: 0.2,
          pfz: 0.97,
          plx: -0.2,
          ply: 0.98,
          plz: -0.1,
          recent_events: [],
        },
      },
      performance: { now: () => 1_250 },
      document: { visibilityState: "visible", hasFocus: () => true },
      navigator: { getGamepads: () => [] },
    },
  );
  assert.equal(sampled.wallS, 1);
  assert.equal(sampled.missionId, "mission.test");
  assert.equal(sampled.rollRateDps, null);
  assert.equal(sampled.actualG, 4.5);
  assert.ok(Number.isNaN(sampled.aoaDeg));
  assert.deepEqual(
    [sampled.velocityXMps, sampled.velocityYMps, sampled.velocityZMps],
    [10, -2, 30],
  );
  assert.deepEqual(
    [sampled.forwardX, sampled.forwardY, sampled.forwardZ],
    [0.1, 0.2, 0.97],
  );
  assert.deepEqual(
    [sampled.liftX, sampled.liftY, sampled.liftZ],
    [-0.2, 0.98, -0.1],
  );
});

test("incoming tracer evidence preserves complete finite projectile vectors", () => {
  const valid = [12.5, 2_301, -44, -301.25, 4, 812];
  assert.deepEqual(fixedWingIncomingTracerRows([
    valid,
    [1, 2, 3],
    null,
    [1, 2, 3, 4, 5, Number.NaN],
    ["1", 2, 3, 4, 5, 6],
  ]), [valid]);
  assert.equal(
    fixedWingIncomingTracerRows(
      Array.from({ length: 40 }, (_, index) => [index, 1, 2, 3, 4, 5]),
    ).length,
    32,
    "the evidence boundary must remain bounded to one production burst",
  );
  assert.deepEqual(fixedWingIncomingTracerRows(undefined), []);
});

test("opponent tactic diagnostics preserve null and decode stable authority ordinals", () => {
  assert.equal(fixedWingOpponentTacticName(null), null);
  assert.equal(fixedWingOpponentTacticName(undefined), null);
  assert.equal(fixedWingOpponentTacticName(""), null);
  assert.equal(fixedWingOpponentTacticName(0), "ACQUIRE");
  assert.equal(fixedWingOpponentTacticName(1), "DEFEND");
  assert.equal(fixedWingOpponentTacticName(2), "ENERGY");
  assert.equal(fixedWingOpponentTacticName(3), "RETURN");
  assert.equal(fixedWingOpponentTacticName(4), "PRESENT");
  assert.equal(fixedWingOpponentTacticName(5), null);
  assert.equal(fixedWingOpponentTacticName(1.5), null);
});

test("browser-resident pilot writes and releases the same synthetic standard gamepad", () => {
  const originalDocument = globalThis.document;
  const originalState = globalThis.__gunsState;
  const originalPad = globalThis.__gunsOnlyAiMissionPad;
  const originalPilot = globalThis.__gunsOnlyFixedWingBrowserPilot;
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  try {
    globalThis.document = {};
    globalThis.__gunsOnlyAiMissionPad = {
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 0,
    };
    globalThis.__gunsState = {
      ...f22FinisherState(),
      session_phase: "ACTIVE",
      player_terminal_state: "FLYING",
      opponent_terminal_state: "FLYING",
      tick: 120,
      gun_solution: false,
      gun_window: false,
      kill_count: 0,
      selected_player_gun_target_slot: 0,
      engagement_number: 0,
      bandit_entity_id: "entity.bandit.test",
    };
    const pilot = installFixedWingBrowserPilot({ mission: "f22", sampleMs: 1_000 });
    const diagnostics = pilot.diagnostics();
    assert.equal(diagnostics.updates, 1);
    assert.equal(diagnostics.lastError, null);
    assert.ok(diagnostics.last.desiredLoadFactorG > 1);
    assert.ok(diagnostics.last.appliedLoadFactorG > 1);
    assert.ok(Math.hypot(...globalThis.__gunsOnlyAiMissionPad.axes.slice(0, 2)) > 0);
    assert.ok(globalThis.__gunsOnlyAiMissionPad.axes[1] > 0);
    assert.equal(buttons[0].pressed, true, "the first local update pulses production padlock");
    assert.equal(diagnostics.padlockPulsePending, false);
    assert.equal(pilot.requestPadlockPulse(), true);
    assert.equal(pilot.diagnostics().padlockPulsePending, true,
      "forward-view evidence must ask the control-loop owner for a clean button edge");
    pilot.stop();
    assert.equal(pilot.requestPadlockPulse(), false);
    assert.deepEqual(globalThis.__gunsOnlyAiMissionPad.axes.slice(0, 2), [0, 0]);
    assert.equal(buttons[0].pressed, false);
    assert.equal(buttons[7].pressed, false);
  } finally {
    globalThis.__gunsOnlyFixedWingBrowserPilot?.stop?.();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalState === undefined) delete globalThis.__gunsState;
    else globalThis.__gunsState = originalState;
    if (originalPad === undefined) delete globalThis.__gunsOnlyAiMissionPad;
    else globalThis.__gunsOnlyAiMissionPad = originalPad;
    if (originalPilot === undefined) delete globalThis.__gunsOnlyFixedWingBrowserPilot;
    else globalThis.__gunsOnlyFixedWingBrowserPilot = originalPilot;
  }
});

test("browser pilot unloads recovery without limiter, alpha override, or Auto-GCAS paddle", async () => {
  const originalDocument = globalThis.document;
  const originalState = globalThis.__gunsState;
  const originalPad = globalThis.__gunsOnlyAiMissionPad;
  const originalPilot = globalThis.__gunsOnlyFixedWingBrowserPilot;
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  try {
    globalThis.document = {};
    globalThis.__gunsOnlyAiMissionPad = {
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 0,
    };
    globalThis.__gunsState = {
      ...f22FinisherState(),
      session_phase: "ACTIVE",
      player_terminal_state: "FLYING",
      opponent_terminal_state: "FLYING",
      tick: 120,
      // Tape 423 at 108.33 s: the slice was still unloading at 90 dps, while the filtered
      // production request remained above PILOT_UNLOAD long enough for the gun aid to add 1.88 G.
      gamma_deg: 42.56,
      bank_deg: -80.3,
      roll_rate_dps: -90.01,
      g_actual: 1,
      aoa_deg: 4,
      g_maxperform: 9,
      g_override_max: 12,
      lead_valid: false,
      gun_solution: false,
      gun_window: false,
      kill_count: 0,
      selected_player_gun_target_slot: 0,
      engagement_number: 0,
      bandit_entity_id: "entity.bandit.test",
    };
    const pilot = installFixedWingBrowserPilot({ mission: "f22", sampleMs: 10 });
    const diagnostics = pilot.diagnostics();
    assert.equal(diagnostics.last.verticalRecoveryPhase, "slice");
    assert.equal(diagnostics.last.verticalRecoveryPullActive, false);
    assert.equal(diagnostics.last.limitOverride, false);
    assert.ok(Math.abs(diagnostics.last.appliedLoadFactorG
      - diagnostics.last.desiredLoadFactorG) < 1e-9,
    "declaring recovery ownership must not inflate the bot's requested G");
    assert.equal(buttons[2].pressed, false,
      "recovery unload must not borrow the limiter/Auto-GCAS paddle");

    globalThis.__gunsState = {
      ...globalThis.__gunsState,
      tick: 126,
      gamma_deg: 42.56,
      bank_deg: -180,
      roll_rate_dps: 1,
    };
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(pilot.diagnostics().last.verticalRecoveryPhase, "slice");
    assert.equal(pilot.diagnostics().last.verticalRecoveryPullActive, true);
    assert.equal(pilot.diagnostics().last.desiredLoadFactorG, 6.5);
    assert.equal(pilot.diagnostics().last.limitOverride, false);
    assert.equal(buttons[2].pressed, false,
      "positive recovery pull must remain protected G, not commanded high alpha");

    globalThis.__gunsState = {
      ...globalThis.__gunsState,
      tick: 132,
      gamma_deg: -9,
      bank_deg: -180,
      roll_rate_dps: 1,
    };
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(pilot.diagnostics().last.verticalRecoveryPhase, "level");
    assert.equal(pilot.diagnostics().last.pitchCommand, -0.08);
    assert.equal(buttons[2].pressed, false,
      "vertical level-out remains an ordinary protected pitch command");

    globalThis.__gunsState = {
      ...globalThis.__gunsState,
      tick: 138,
      radar_alt_ft: 350,
      vertical_speed_fpm: -25_000,
      gamma_deg: -55,
      bank_deg: 65,
      roll_rate_dps: 30,
      auto_gcas_active: true,
      auto_gcas_prediction_valid: true,
      auto_gcas_time_available_seconds: 0,
    };
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(pilot.diagnostics().last.terrainRecoveryPhase, "auto-gcas");
    assert.equal(buttons[2].pressed, false,
      "the limiter must never turn the aircraft-owned fly-up into a pilot cancellation");
    assert.deepEqual(globalThis.__gunsOnlyAiMissionPad.axes.slice(0, 2), [0, 0]);

    pilot.stop();
    assert.equal(buttons[2].pressed, false,
      "the recovery limiter cannot leak into the next control phase");
  } finally {
    globalThis.__gunsOnlyFixedWingBrowserPilot?.stop?.();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalState === undefined) delete globalThis.__gunsState;
    else globalThis.__gunsState = originalState;
    if (originalPad === undefined) delete globalThis.__gunsOnlyAiMissionPad;
    else globalThis.__gunsOnlyAiMissionPad = originalPad;
    if (originalPilot === undefined) delete globalThis.__gunsOnlyFixedWingBrowserPilot;
    else globalThis.__gunsOnlyFixedWingBrowserPilot = originalPilot;
  }
});

test("F-22 controller proof stages the explicit single-Ace preview authority", () => {
  assert.deepEqual(FIXED_WING_AI_MISSIONS.f22, {
    search: "?program=ace-duel&preview=1&server=off&audioQa=silent",
    missionId: "mission.modern.ace-duel.f22a-vs-su27s.public-data-surrogate.v1",
    goal: "combat",
    deadlineSeconds: 180,
  });
});

test("combat runner cannot mistake an unspawned opponent for a completed fight", () => {
  const pending = [{
    rangeM: 0,
    killCount: 0,
    opponentTerminal: null,
  }];
  assert.equal(missionSatisfied(pending, "f22"), false);
  assert.equal(missionSatisfied([
    ...pending,
    { rangeM: 1_500, killCount: 0, opponentTerminal: "FLYING" },
  ], "f22"), false);
  assert.equal(missionSatisfied([
    ...pending,
    { rangeM: 1_500, killCount: 0, opponentTerminal: "FLYING" },
    { rangeM: 1_400, killCount: 0, opponentTerminal: "DESTROYED" },
  ], "f22"), true);
});

test("Rapier runner allows the bounded full-sortie authority window", () => {
  assert.deepEqual(FIXED_WING_AI_MISSIONS.rapier, {
    search: "?program=rapier-intercept&server=off&audioQa=silent",
    missionId: "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1",
    goal: "rapier-recovery",
    deadlineSeconds: 1_800,
  });
});

test("Top Gun runner owns a bounded two-splash carrier sortie", () => {
  assert.deepEqual(FIXED_WING_AI_MISSIONS["top-gun"], {
    search: "?program=top-gun&server=off&audioQa=silent",
    missionId: "mission.top-gun.acm.f14a-vs-mig28.v1",
    goal: "top-gun-sortie",
    deadlineSeconds: 1_200,
  });
});

test("first-run missile waits for two live-target authority samples after handoff", () => {
  const controllerState = createFirstRunWeaponState();
  const ready = {
    wallS: 85.2,
    tick: 10_224,
    weaponsCold: false,
    weaponsInhibited: false,
    opponentTerminal: "FLYING",
    aim9Remaining: 1,
    aim9InFlight: false,
    aim9SeekerState: "SAFE",
    banditEntityId: "bandit-2",
    selectedTargetSlot: 0,
    killCount: 1,
    rangeM: 1_640,
    angleOffDeg: 44,
  };
  assert.equal(firstRunWeaponPulse(ready, controllerState), false);
  assert.equal(firstRunWeaponPulse(ready, controllerState), false,
    "a duplicate authority tick cannot fake target stability");
  assert.equal(firstRunWeaponPulse({ ...ready, tick: ready.tick + 6 }, controllerState), true,
    "SAFE is the real pre-launch state and must not block a geometrically valid shot");

  const promoted = {
    ...ready,
    wallS: 86.5,
    tick: ready.tick + 12,
    banditEntityId: "bandit-3",
    killCount: 2,
    aim9SeekerState: "DETONATED",
  };
  assert.equal(firstRunWeaponPulse(promoted, controllerState), false,
    "a splash or target identity change restarts the stability proof");
  assert.equal(firstRunWeaponPulse({ ...promoted, tick: promoted.tick + 6 }, controllerState), true);
});

test("first-run missile rejects an in-flight, dead, distant or off-boresight contact", () => {
  const ready = {
    wallS: 90,
    tick: 12_000,
    weaponsCold: false,
    weaponsInhibited: false,
    opponentTerminal: "FLYING",
    aim9Remaining: 2,
    aim9InFlight: false,
    aim9SeekerState: "SAFE",
    banditEntityId: "bandit-live",
    killCount: 0,
    rangeM: 4_000,
    angleOffDeg: 20,
  };
  for (const overrides of [
    { aim9InFlight: true },
    { opponentTerminal: "DESTROYED" },
    { rangeM: 18_001 },
    { rangeM: 599 },
    { angleOffDeg: 45.1 },
    { banditEntityId: null },
    { selectedTargetSlot: 1 },
  ]) {
    assert.equal(firstRunWeaponPulse(
      { ...ready, ...overrides },
      createFirstRunWeaponState(),
    ), false);
  }
});

test("first-run missile cannot spend both rounds on one physical target", () => {
  const controllerState = createFirstRunWeaponState();
  const sample = {
    wallS: 80,
    tick: 9_600,
    weaponsCold: false,
    weaponsInhibited: false,
    opponentTerminal: "FLYING",
    aim9Remaining: 2,
    aim9InFlight: false,
    aim9SeekerState: "SAFE",
    banditEntityId: "bandit-primary",
    selectedTargetSlot: 0,
    killCount: 0,
    rangeM: 5_000,
    angleOffDeg: 20,
  };
  assert.equal(firstRunWeaponPulse(sample, controllerState), false);
  assert.equal(firstRunWeaponPulse({ ...sample, tick: 9_606 }, controllerState), true);
  assert.equal(firstRunWeaponPulse({
    ...sample,
    wallS: 84,
    tick: 10_080,
    aim9Remaining: 1,
    aim9SeekerState: "LOST",
  }, controllerState), false, "a miss cannot spend the lesson's last missile on the same actor");
  assert.equal(firstRunWeaponPulse({
    ...sample,
    wallS: 84.1,
    tick: 10_086,
    aim9Remaining: 1,
    aim9SeekerState: "EXPIRED",
  }, controllerState), false);

  const promoted = {
    ...sample,
    wallS: 84.2,
    tick: 10_092,
    aim9Remaining: 1,
    banditEntityId: "bandit-promoted",
    killCount: 1,
  };
  assert.equal(firstRunWeaponPulse(promoted, controllerState), false);
  assert.equal(firstRunWeaponPulse({ ...promoted, tick: 10_098 }, controllerState), true,
    "a new physical primary earns its own two-sample launch proof");
});

test("first-run missile stability resets on an interruption or authority tick rewind", () => {
  const controllerState = createFirstRunWeaponState();
  const sample = {
    wallS: 90,
    tick: 12_000,
    weaponsCold: false,
    weaponsInhibited: false,
    opponentTerminal: "FLYING",
    aim9Remaining: 2,
    aim9InFlight: false,
    banditEntityId: "bandit-live",
    selectedTargetSlot: 0,
    killCount: 0,
    rangeM: 4_000,
    angleOffDeg: 20,
  };
  assert.equal(firstRunWeaponPulse(sample, controllerState), false);
  assert.equal(firstRunWeaponPulse({ ...sample, tick: 12_006, angleOffDeg: 50 }, controllerState), false);
  assert.equal(firstRunWeaponPulse({ ...sample, tick: 12_012 }, controllerState), false,
    "one valid sample after an interruption is not a shot");
  assert.equal(firstRunWeaponPulse({ ...sample, tick: 12_006 }, controllerState), false,
    "a backwards tick restarts rather than completing the proof");
  assert.equal(firstRunWeaponPulse({ ...sample, tick: 12_012 }, controllerState), true);
});

function f22FinisherState(overrides = {}) {
  return {
    px: 0, py: 4_500, pz: 0,
    bx: 0, by: 5_300, bz: 1_200,
    lead_x: 0, lead_y: 5_300, lead_z: 1_200,
    lead_valid: true,
    range_m: Math.hypot(800, 1_200),
    closure_kts: 500,
    // Exact authority-published physical body basis: north, wings level.
    pfx: 0, pfy: 0, pfz: 1,
    plx: 0, ply: 1, plz: 0,
    heading_deg: 0, pitch_deg: 0, gamma_deg: 0,
    bank_deg: 0, roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 500,
    calibrated_airspeed_kts: 390,
    corner_speed_kias: 359,
    corner_band_min_kias: 345,
    corner_band_max_kias: 375,
    ...overrides,
  };
}

function f22LeadPlaneState({
  bankDeg,
  rollRateDps,
  planeErrorDeg,
  offBoresightDeg,
  altitudeM = 4_500,
  gammaDeg = 0,
}) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const leadRangeM = 900;
  const planeDeg = bankDeg + planeErrorDeg;
  const transverseM = Math.sin(radians(offBoresightDeg)) * leadRangeM;
  const forwardM = Math.cos(radians(offBoresightDeg)) * leadRangeM;
  const leadXM = Math.sin(radians(planeDeg)) * transverseM;
  const leadYM = altitudeM + Math.cos(radians(planeDeg)) * transverseM;
  return f22FinisherState({
    px: 0, py: altitudeM, pz: 0,
    bx: leadXM, by: leadYM, bz: forwardM,
    lead_x: leadXM, lead_y: leadYM, lead_z: forwardM,
    range_m: leadRangeM,
    closure_kts: 120,
    pfx: 0, pfy: 0, pfz: 1,
    plx: Math.sin(radians(bankDeg)),
    ply: Math.cos(radians(bankDeg)),
    plz: 0,
    bank_deg: bankDeg,
    roll_rate_dps: rollRateDps,
    gamma_deg: gammaDeg,
  });
}

test("F-22 finisher corrects the rejected nose-high hardware pass and brakes closure", () => {
  const command = fixedWingAiCommand(f22FinisherState({
    // /tmp/fixed-wing-f22-357-final at 45.946 s: the old law commanded -0.061 pitch
    // while the physical gun sat 23.50 degrees below ballistic lead at 588 kt closure.
    px: 6_375.001, py: 4_546.862, pz: -334.210,
    bx: 6_304.312, by: 5_151.568, bz: 309.514,
    lead_x: 6_428.074, lead_y: 5_222.479, lead_z: 237.485,
    range_m: 886, closure_kts: 587.7,
    pfx: 0.232327, pfy: 0.460200, pfz: 0.856878,
    plx: -0.429156, ply: 0.839092, plz: -0.334290,
    heading_deg: 15.17, pitch_deg: 27.40, gamma_deg: 25.04,
    bank_deg: -19.07, roll_rate_dps: 16.75,
    true_airspeed_kts: 487.31,
  }), "f22");
  assert.equal(command.target.gunLeadFinisherActive, true);
  assert.ok(command.target.leadRollPlaneErrorDeg > 2
    && command.target.leadRollPlaneErrorDeg < 4);
  assert.ok(command.target.leadOffBoresightDeg > 23
    && command.target.leadOffBoresightDeg < 24);
  assert.ok(command.target.desiredGammaDeg > 49,
    "finisher telemetry must retain the real lead elevation instead of the old +24 degree clip");
  assert.ok(command.pitch > 0.85, "nose-high lead requires a pull, not the rejected negative input");
  assert.equal(command.target.energySpeedMode, "corner-kias");
  assert.equal(command.throttleUp, false);
  assert.equal(command.throttleDown, true);
});

test("Tape 476 admits only the narrow early high-closure finisher corridor", () => {
  const commandAt = ({
    rangeM = 2_480.4,
    closureKts = 863,
    offBoresightDeg = 32.45,
    planeErrorDeg = -51.9,
  } = {}) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -38,
      rollRateDps: -1.4,
      planeErrorDeg,
      offBoresightDeg,
      gammaDeg: 16,
    }),
    range_m: rangeM,
    closure_kts: closureKts,
    radar_alt_ft: 15_500,
    g_actual: 0.86,
    aoa_deg: 1.4,
    requested_g_cmd: 0.85,
    g_cmd: 0.85,
    true_airspeed_kts: 490.8,
    calibrated_airspeed_kts: 394.7,
  }, "f22", createFixedWingAiControllerState());

  const earlyConversion = commandAt();
  assert.equal(earlyConversion.target.gunLeadFinisherActive, true);
  assert.ok(Math.abs(earlyConversion.target.leadOffBoresightDeg - 32.45) < 0.01);
  assert.ok(Math.abs(earlyConversion.target.leadRollPlaneErrorDeg + 51.9) < 0.01);
  assert.ok(Math.abs(earlyConversion.target.desiredBankDeg) <= 90,
    `early finisher requested ${earlyConversion.target.desiredBankDeg.toFixed(2)} degrees bank`);
  assert.equal(earlyConversion.throttleDown, true,
    "the early conversion must shed excess corner-speed energy while it places the lift plane");

  for (const [label, rejected] of [
    ["inside 1,500 m", commandAt({ rangeM: 1_499.9 })],
    ["outside 40 degrees", commandAt({ offBoresightDeg: 40.01 })],
    ["outside the 60-degree lead plane", commandAt({ planeErrorDeg: -60.01 })],
    ["at 900 knots closure", commandAt({ closureKts: 900 })],
  ]) {
    assert.equal(rejected.target.gunLeadFinisherActive, false, label);
  }
});

test("first-run hands the same F-22 from valley steering into the proven gun finisher", () => {
  const hot = fixedWingAiCommand(f22FinisherState({
    first_run_weapons_cold: false,
    aim9_remaining: 0,
  }), "first-run", createFixedWingAiControllerState());
  assert.equal(hot.target.gunLeadBasisValid, true);
  assert.equal(hot.target.gunLeadFinisherActive, true);
  assert.equal(hot.target.energySpeedMode, "corner-kias");

  const heatersRemain = fixedWingAiCommand(f22FinisherState({
    first_run_weapons_cold: false,
    aim9_remaining: 1,
  }), "first-run", createFixedWingAiControllerState());
  assert.equal(heatersRemain.target.gunLeadBasisValid, false,
    "gun conversion must not steal control while Fire still owns a heater");
  assert.equal(heatersRemain.target.gunLeadFinisherActive, false);

  const coldState = {
    ...f22FinisherState(),
    calibrated_airspeed_kts: 500,
    first_run_weapons_cold: true,
    first_run_valley_available: true,
    first_run_valley_geometry_version: 1,
    first_run_valley_center_east_m: 0,
    first_run_valley_entry_north_m: -6_000,
    first_run_valley_popout_north_m: -1_200,
    first_run_valley_route_alt_m: 240,
    first_run_valley_floor_height_m: 100,
    first_run_valley_floor_blend_drop_m: 10,
    first_run_valley_floor_half_width_m: 300,
    first_run_valley_crest_offset_m: 700,
    first_run_valley_outer_offset_m: 1_000,
    first_run_valley_west_ridge_rise_m: 300,
    first_run_valley_east_ridge_rise_m: 250,
    first_run_valley_curve_amplitude_m: 430,
    first_run_valley_curve_wavelength_m: 4_800,
    first_run_valley_south_extent_north_m: -6_600,
    first_run_valley_south_full_north_m: -6_200,
    first_run_valley_popout_fade_start_north_m: -1_500,
    first_run_valley_north_extent_north_m: -900,
  };
  const cold = fixedWingAiCommand(coldState, "first-run", createFixedWingAiControllerState());
  assert.equal(cold.target.mode, "valley");
  assert.equal(cold.target.gunLeadBasisValid, false);
  assert.equal(cold.target.gunLeadFinisherActive, false);
  assert.equal(cold.throttleUp, false);
  assert.equal(cold.throttleDown, true,
    "an overspeeding valley jet must take the real throttle rocker back");
  const onSpeed = fixedWingAiCommand({
    ...coldState,
    true_airspeed_kts: 429,
    calibrated_airspeed_kts: 420,
  }, "first-run", createFixedWingAiControllerState());
  assert.equal(onSpeed.throttleUp, false);
  assert.equal(onSpeed.throttleDown, false);
  const slow = fixedWingAiCommand({
    ...coldState,
    true_airspeed_kts: 407,
    calibrated_airspeed_kts: 400,
  }, "first-run", createFixedWingAiControllerState());
  assert.equal(slow.throttleUp, true);
  assert.equal(slow.throttleDown, false);
});

test("F-22 finisher makes coarse pursuit establish a sane lift plane before conversion", () => {
  const controllerState = createFixedWingAiControllerState();
  const below = f22LeadPlaneState({
    bankDeg: 0,
    rollRateDps: 0,
    planeErrorDeg: 180,
    offBoresightDeg: 30,
  });
  const rolling = fixedWingAiCommand(below, "f22", controllerState);
  assert.equal(rolling.target.gunLeadFinisherActive, false);
  assert.ok(rolling.target.leadRollPlaneErrorDeg > 175);
  assert.ok(Math.abs(rolling.target.desiredBankDeg) <= 78,
    "a transient far-side lead point cannot author a fresh inverted half-roll");
});

test("F-22 finisher excludes the unsafe reciprocal and yields to ceiling recovery", () => {
  const reciprocal = fixedWingAiCommand(f22FinisherState({
    closure_kts: 1_070,
  }), "f22");
  assert.equal(reciprocal.target.gunLeadFinisherActive, false);
  assert.equal(reciprocal.target.desiredGammaDeg, 24,
    "the ordinary pursuit law remains in charge of the reciprocal run-in");

  const recovery = fixedWingAiCommand(f22FinisherState({
    py: 6_300, by: 6_500, lead_y: 6_500,
    gamma_deg: 48, bank_deg: 72,
    g_actual: 1, aoa_deg: 4,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(recovery.target.verticalRecoveryPhase, "slice");
  assert.equal(recovery.target.gunLeadFinisherActive, false);
  assert.equal(recovery.target.desiredBankDeg, 180);
  assert.equal(recovery.throttleDown, true);
});

test("F-22 finisher enters only inside controlled nose and flight-path geometry", () => {
  const grosslyOffAxis = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 40, offBoresightDeg: 80,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(grosslyOffAxis.target.gunLeadFinisherActive, false,
    "coarse pursuit must own the turn while lead is far around the canopy");
  assert.ok(Math.abs(grosslyOffAxis.target.leadOffBoresightDeg - 80) < 1e-9,
    "candidate lead geometry remains observable when the finisher rejects it");

  const steepEntry = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 30,
    gammaDeg: -46,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(steepEntry.target.gunLeadFinisherActive, false,
    "a steep dive must flatten before the close-in lead controller can engage");

  const offAxisController = createFixedWingAiControllerState();
  const entered = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 55,
    gammaDeg: -45,
  }), "f22", offAxisController);
  assert.equal(entered.target.gunLeadFinisherActive, true);
  const retained = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 70,
    gammaDeg: -55,
  }), "f22", offAxisController);
  assert.equal(retained.target.gunLeadFinisherActive, true,
    "bounded hysteresis must prevent a mode flap during an established conversion");
  const releasedOffAxis = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 71,
    gammaDeg: -50,
  }), "f22", offAxisController);
  assert.equal(releasedOffAxis.target.gunLeadFinisherActive, false);

  const steepController = createFixedWingAiControllerState();
  fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 30,
    gammaDeg: -30,
  }), "f22", steepController);
  const releasedSteep = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 45,
    gammaDeg: -56,
  }), "f22", steepController);
  assert.equal(releasedSteep.target.gunLeadFinisherActive, false);
});

test("Tape 466 far-side lead cannot seize a fresh finisher inside the merge", () => {
  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -17.92,
      rollRateDps: 8.28,
      planeErrorDeg: -150.6,
      offBoresightDeg: 54,
      gammaDeg: 15.26,
    }),
    range_m: 450.3,
    closure_kts: -9.1,
    g_actual: -0.239,
    requested_g_cmd: -0.24,
    g_cmd: -0.24,
  }, "f22", createFixedWingAiControllerState());

  assert.equal(command.target.gunLeadFinisherActive, false);
  assert.ok(Math.abs(command.target.desiredBankDeg) <= 78,
    "the 150-degree transient must remain coarse pursuit instead of commanding a split-S");
});

test("Tape 467 finisher travel cap and recovery rearm require a fighting pull", () => {
  const travellingState = createFixedWingAiControllerState();
  travellingState.gunLeadFinisherActive = true;
  travellingState.gunLeadFinisherEntryBankDeg = 7.26;
  const released = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 90,
      rollRateDps: 38.19,
      planeErrorDeg: 17.41,
      offBoresightDeg: 14.58,
      gammaDeg: -23.21,
    }),
    range_m: 1_670.2,
    closure_kts: -56.7,
    g_actual: 0.846,
  }, "f22", travellingState);
  assert.equal(released.target.gunLeadFinisherActive, false);
  assert.equal(released.target.finisherExceededEntryPlaneTravel, true);
  assert.equal(released.target.gunLeadFinisherRearmBlocked, true);

  const recoveryState = createFixedWingAiControllerState();
  recoveryState.invertedRecoveryActive = true;
  recoveryState.invertedRecoveryRollArmed = true;
  recoveryState.invertedRecoveryTargetBankDeg = 78;
  const settledGeometry = f22LeadPlaneState({
    bankDeg: 78,
    rollRateDps: -10,
    planeErrorDeg: 82.39,
    offBoresightDeg: 27.79,
    gammaDeg: -20.84,
  });
  const blocked = fixedWingAiCommand({
    ...settledGeometry,
    range_m: 1_595.7,
    closure_kts: -164.4,
    g_actual: 1,
    requested_g_cmd: 1,
    g_cmd: 1,
  }, "f22", recoveryState);
  assert.equal(blocked.target.invertedRecoveryActive, false);
  assert.equal(blocked.target.gunLeadFinisherActive, false);
  assert.equal(blocked.target.gunLeadFinisherRearmBlocked, true);

  const residualLoad = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 65,
      rollRateDps: 0,
      planeErrorDeg: 20,
      offBoresightDeg: 30,
      gammaDeg: -10,
    }),
    range_m: 1_400,
    closure_kts: 80,
    g_actual: 3.9,
    aoa_deg: 8,
    requested_g_cmd: 1,
    g_cmd: 1,
  }, "f22", recoveryState);
  assert.equal(residualLoad.target.gunLeadFinisherRearmBlocked, true,
    "decaying residual G cannot masquerade as a newly commanded fighting pull");
  assert.equal(residualLoad.target.gunLeadFinisherActive, false);

  recoveryState.combatLoadedRollUnloadActive = true;
  const unloading = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 65,
      rollRateDps: 0,
      planeErrorDeg: 20,
      offBoresightDeg: 30,
      gammaDeg: -10,
    }),
    range_m: 1_400,
    closure_kts: 80,
    g_actual: 3,
    aoa_deg: 8,
    requested_g_cmd: 3,
    g_cmd: 3,
  }, "f22", recoveryState);
  assert.equal(unloading.target.gunLeadFinisherRearmBlocked, true,
    "the loaded-roll owner must finish before another finisher can seed");
  recoveryState.combatLoadedRollUnloadActive = false;

  const reloaded = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 65,
      rollRateDps: 0,
      planeErrorDeg: 20,
      offBoresightDeg: 30,
      gammaDeg: -10,
    }),
    range_m: 1_400,
    closure_kts: 80,
    g_actual: 3,
    aoa_deg: 8,
    requested_g_cmd: 3,
    g_cmd: 3,
  }, "f22", recoveryState);
  assert.equal(reloaded.target.gunLeadFinisherRearmBlocked, false);
  assert.equal(reloaded.target.gunLeadFinisherActive, true,
    "a measured 3 G fighting turn may earn a new controlled conversion");

  const singularTravelState = createFixedWingAiControllerState();
  singularTravelState.gunLeadFinisherActive = true;
  singularTravelState.gunLeadFinisherEntryBankDeg = 0;
  const movingNearAxis = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 17.8,
      planeErrorDeg: 100.3,
      offBoresightDeg: 1.47,
    }),
    g_actual: 1,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", singularTravelState);
  assert.equal(movingNearAxis.target.gunLeadFinisherActive, false,
    "Tape 469's moving 1.47-degree crossing cannot bypass the 90-degree travel cap");
  assert.equal(movingNearAxis.target.finisherExceededEntryPlaneTravel, true);
  assert.equal(movingNearAxis.target.gunLeadFinisherRearmBlocked, true);

  const settledNearAxis = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 10.2,
      planeErrorDeg: 113.7,
      offBoresightDeg: 1.72,
    }),
    g_actual: 1,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", singularTravelState);
  assert.equal(settledNearAxis.target.gunLeadFinisherActive, true,
    "a settled true near-axis solution may reseed its singular lift plane cleanly");
});

test("F-22 enters physical lead conversion at tape 428's rejected close geometry", () => {
  const command = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 58,
    rollRateDps: -5,
    planeErrorDeg: 32,
    offBoresightDeg: 49.5,
    altitudeM: 4_000,
    gammaDeg: 12.5,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(command.target.contactRangeM, 900);
  assert.equal(command.target.gunLeadFinisherActive, true,
    "a close controlled 49-degree lead belongs to 3-D lift-vector conversion, not generic pursuit");
  assert.ok(command.target.leadOffBoresightDeg > 49
    && command.target.leadOffBoresightDeg < 50);
  assert.notEqual(command.roll, 0,
    "the conversion must immediately start placing the lift vector into the lead plane");
});

test("Tape 475 keeps a wide two-kilometre pipper in coarse pursuit", () => {
  const geometry = {
    bankDeg: 65.27,
    rollRateDps: -0.32,
    planeErrorDeg: 30.733,
    offBoresightDeg: 50.864,
  };
  const far = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    range_m: 2_025.2,
    closure_kts: 4.4,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(far.target.gunLeadFinisherActive, false,
    "final-axis control must not begin four seconds before useful gun range");

  const close = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    range_m: 1_499.9,
    closure_kts: 4.4,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(close.target.gunLeadFinisherActive, true,
    "the proved close wide-angle conversion remains available");
});

test("engaged F-22 finisher stays continuous through a closing pass", () => {
  const controllerState = createFixedWingAiControllerState();
  const joined = fixedWingAiCommand(f22FinisherState({
    closure_kts: 500,
  }), "f22", controllerState);
  assert.equal(joined.target.gunLeadFinisherActive, true);
  const closing = fixedWingAiCommand(f22FinisherState({
    closure_kts: 900,
  }), "f22", controllerState);
  assert.equal(closing.target.gunLeadFinisherActive, true,
    "tape 362 dropped the finisher at 751 kt just as lead error reached 1.16 degrees");

  const freshReciprocal = fixedWingAiCommand(f22FinisherState({
    closure_kts: 900,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(freshReciprocal.target.gunLeadFinisherActive, false,
    "high-closure geometry cannot enter the finisher without a prior conversion");
});

test("combat terrain escape rolls upright before pulling out of the tape-shaped dive", () => {
  const controllerState = createFixedWingAiControllerState();
  const dive = f22FinisherState({
    // Tape 361 was still following lead at roughly this geometry: five thousand feet AGL,
    // 500-knot-class energy, a steep descent, and lift pointed mostly sideways.
    radar_alt_ft: 5_000,
    vertical_speed_fpm: -42_000,
    gamma_deg: -48,
    bank_deg: 120,
    roll_rate_dps: 0,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 3.5,
  });
  const rolling = fixedWingAiCommand(dive, "f22", controllerState);
  assert.equal(rolling.target.terrainRecoveryPhase, "roll");
  assert.equal(rolling.target.gunLeadFinisherActive, false,
    "terrain escape must outrank the gun conversion");
  assert.equal(rolling.target.desiredBankDeg, 0);
  assert.ok(rolling.roll < -0.9);
  assert.equal(rolling.pitch, -0.12,
    "positive pull at 120 degrees of bank would deepen the dive");
  assert.equal(rolling.throttleDown, true);

  const stillRolling = fixedWingAiCommand({
    ...dive,
    bank_deg: 30,
    roll_rate_dps: -101,
    auto_gcas_time_available_seconds: null,
  }, "f22", controllerState);
  assert.equal(stillRolling.target.terrainRecoveryPhase, "roll",
    "crossing wings-level at high roll rate is not a captured lift vector");
  assert.equal(stillRolling.pitch, -0.12);

  const pulling = fixedWingAiCommand({
    ...dive,
    bank_deg: 35,
    roll_rate_dps: -8,
    auto_gcas_time_available_seconds: null,
  }, "f22", controllerState);
  assert.equal(pulling.target.terrainRecoveryPhase, "pull");
  assert.equal(pulling.target.desiredBankDeg, 0);
  assert.equal(pulling.pitch, 0.92);

  let released = pulling;
  for (let sample = 0; sample < 6; sample += 1) {
    released = fixedWingAiCommand({
      ...dive,
      radar_alt_ft: 2_200,
      vertical_speed_fpm: 5_000,
      gamma_deg: 10,
      bank_deg: 4,
      roll_rate_dps: 0,
      auto_gcas_prediction_valid: true,
      auto_gcas_time_available_seconds: null,
    }, "f22", controllerState);
  }
  assert.equal(released.target.terrainRecoveryPhase, "idle",
    "safe climb must be held for several real control samples before pursuit resumes");
});

test("Tape 452 terrain escape unloads before rolling a loaded lift plane upright", () => {
  const controllerState = createFixedWingAiControllerState();
  const loadedThreat = f22FinisherState({
    lead_valid: false,
    radar_alt_ft: 7_023.4,
    vertical_speed_fpm: -8_086.4,
    gamma_deg: -13.62,
    bank_deg: 78.84,
    roll_rate_dps: -2.97,
    g_actual: 6.875,
    aoa_deg: 16.31,
    calibrated_airspeed_kts: 313.62,
    true_airspeed_kts: 350.48,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 4,
    auto_gcas_pilot_violation_time_seconds: 11.25,
  });
  const unloading = fixedWingAiCommand(loadedThreat, "f22", controllerState);
  assert.equal(unloading.target.terrainRecoveryPhase, "unload");
  assert.equal(unloading.target.desiredBankDeg, loadedThreat.bank_deg);
  assert.ok(Math.abs(unloading.roll) < 0.05,
    "terrain ownership may damp the existing body rate but cannot start a 7-G roll upright");
  assert.equal(unloading.pitch, -0.12);

  const rolling = fixedWingAiCommand({
    ...loadedThreat,
    roll_rate_dps: 0,
    g_actual: 1.2,
    aoa_deg: 4,
  }, "f22", controllerState);
  assert.equal(rolling.target.terrainRecoveryPhase, "roll");
  assert.equal(rolling.target.desiredBankDeg, 0);
  assert.ok(rolling.roll < -0.9,
    "the terrain recovery must regain prompt roll authority as soon as measured lift is safe");
  assert.equal(rolling.pitch, -0.12);
});

test("playerbot releases every physical control while aircraft-owned Auto-GCAS is active", () => {
  const controllerState = createFixedWingAiControllerState();
  const command = fixedWingAiCommand(f22FinisherState({
    radar_alt_ft: 350,
    vertical_speed_fpm: -25_000,
    gamma_deg: -55,
    bank_deg: 65,
    roll_rate_dps: 30,
    auto_gcas_active: true,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 0,
  }), "f22", controllerState);
  assert.equal(command.target.terrainRecoveryPhase, "auto-gcas");
  assert.equal(command.target.gunLeadFinisherActive, false);
  assert.equal(command.roll, 0);
  assert.equal(command.pitch, 0);
  assert.equal(command.throttleUp, false);
  assert.equal(command.throttleDown, false);

  const handback = fixedWingAiCommand(f22FinisherState({
    lead_valid: false,
    radar_alt_ft: 3_000,
    vertical_speed_fpm: 5_000,
    gamma_deg: 10,
    bank_deg: 70,
    roll_rate_dps: 0,
    auto_gcas_active: false,
    auto_gcas_warning: false,
    auto_gcas_prediction_valid: false,
    auto_gcas_time_available_seconds: null,
  }), "f22", controllerState);
  assert.equal(handback.target.terrainRecoveryPhase, "roll",
    "Auto-GCAS handback must restore the lift vector before the playerbot pulls");
  assert.equal(handback.target.desiredBankDeg, 0);
  assert.equal(handback.pitch, -0.12);

  const spinningController = createFixedWingAiControllerState();
  fixedWingAiCommand(f22FinisherState({
    auto_gcas_active: true,
    bank_deg: 20,
    roll_rate_dps: 100,
  }), "f22", spinningController);
  const spinningHandback = fixedWingAiCommand(f22FinisherState({
    lead_valid: false,
    gamma_deg: 0,
    bank_deg: 20,
    roll_rate_dps: 100,
    auto_gcas_active: false,
    auto_gcas_warning: false,
    auto_gcas_prediction_valid: false,
    auto_gcas_time_available_seconds: null,
  }), "f22", spinningController);
  assert.equal(spinningHandback.target.terrainRecoveryPhase, "roll",
    "near-level Auto-GCAS handback must still arrest a 100-degree-per-second roll");
  assert.equal(spinningHandback.pitch, -0.12);
});

test("terrain escape ignores ordinary controlled low-level flight", () => {
  const command = fixedWingAiCommand(f22FinisherState({
    lead_valid: false,
    radar_alt_ft: 2_500,
    vertical_speed_fpm: -1_000,
    gamma_deg: -4,
    bank_deg: 25,
    auto_gcas_active: false,
    auto_gcas_warning: false,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: null,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(command.target.terrainRecoveryPhase, "idle");
});

test("terrain prediction catches a rising ridge before current RADALT becomes low", () => {
  const command = fixedWingAiCommand(f22FinisherState({
    lead_valid: false,
    radar_alt_ft: 9_000,
    vertical_speed_fpm: -500,
    gamma_deg: -2,
    bank_deg: 20,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 8,
    auto_gcas_pilot_violation_time_seconds: 5.5,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(command.target.terrainRecoveryPhase, "pull");
  assert.equal(command.target.gcasPilotViolationTimeS, 5.5);

  const spinning = fixedWingAiCommand(f22FinisherState({
    lead_valid: false,
    radar_alt_ft: 9_000,
    gamma_deg: -2,
    bank_deg: 20,
    roll_rate_dps: 100,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 8,
    auto_gcas_pilot_violation_time_seconds: 5.5,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(spinning.target.terrainRecoveryPhase, "roll");
  assert.equal(spinning.pitch, -0.12);
});

test("F-22 finisher releases a far-side plane before it can walk through a full roll", () => {
  const controllerState = createFixedWingAiControllerState();
  const established = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 20, offBoresightDeg: 30,
  }), "f22", controllerState);
  assert.equal(established.target.gunLeadFinisherActive, true);
  const rightNoise = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: 179, offBoresightDeg: 30,
  }), "f22", controllerState);
  const leftNoise = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0, rollRateDps: 0, planeErrorDeg: -179, offBoresightDeg: 30,
  }), "f22", controllerState);
  assert.ok(rightNoise.target.leadRollPlaneErrorDeg > 170);
  assert.ok(leftNoise.target.leadRollPlaneErrorDeg < -170);
  assert.equal(rightNoise.target.gunLeadFinisherActive, false);
  assert.equal(rightNoise.target.finisherExceededEntryPlaneTravel, true);
  assert.equal(leftNoise.target.gunLeadFinisherActive, false);
  assert.equal(leftNoise.target.gunLeadFinisherRearmBlocked, true);
  assert.ok(Math.abs(rightNoise.target.desiredBankDeg) <= 78
      && Math.abs(leftNoise.target.desiredBankDeg) <= 78,
  "a moving lead point cannot reseed consecutive inverted half-rolls");
});

test("F-22 finisher manages energy in published KCAS instead of fixed KTAS", () => {
  const slow = fixedWingAiCommand(f22FinisherState({
    closure_kts: 80,
    true_airspeed_kts: 600,
    calibrated_airspeed_kts: 320,
  }), "f22");
  assert.equal(slow.throttleUp, true, "below-band KCAS may add energy despite high TAS");
  assert.equal(slow.throttleDown, false);

  const fast = fixedWingAiCommand(f22FinisherState({
    closure_kts: 80,
    true_airspeed_kts: 400,
    calibrated_airspeed_kts: 390,
  }), "f22");
  assert.equal(fast.throttleUp, false);
  assert.equal(fast.throttleDown, true, "above-band KCAS must brake despite low TAS");
});

test("F-22 latches corner-speed energy management after the first physical merge", () => {
  const controllerState = createFixedWingAiControllerState();
  const geometry = {
    bankDeg: 78,
    rollRateDps: 0,
    planeErrorDeg: 20,
    offBoresightDeg: 80,
  };
  const reciprocal = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    closure_kts: 950,
    true_airspeed_kts: 500,
    calibrated_airspeed_kts: 420,
  }, "f22", controllerState);
  assert.equal(reciprocal.target.combatCornerEnergyActive, false,
    "the opening run-in must retain its authored energy");
  assert.equal(reciprocal.target.energySpeedMode, "target-ktas");

  const opening = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    closure_kts: -600,
    true_airspeed_kts: 500,
    calibrated_airspeed_kts: 420,
  }, "f22", controllerState);
  assert.equal(opening.target.combatCornerEnergyActive, true);
  assert.equal(opening.target.combatCornerFast, true);
  assert.equal(opening.target.energySpeedMode, "corner-kias");
  assert.equal(opening.throttleUp, false);
  assert.equal(opening.throttleDown, true,
    "the first opening pass must not relight afterburner above the corner band");

  const reclosed = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    closure_kts: 300,
    true_airspeed_kts: 500,
    calibrated_airspeed_kts: 420,
  }, "f22", controllerState);
  assert.equal(reclosed.target.combatCornerEnergyActive, true,
    "corner regulation remains latched through later closure reversals");
  assert.equal(reclosed.throttleDown, true);

  const slow = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    closure_kts: 100,
    true_airspeed_kts: 430,
    calibrated_airspeed_kts: 320,
  }, "f22", controllerState);
  assert.equal(slow.throttleUp, true,
    "the same latch restores power below the aircraft-authored corner band");
  assert.equal(slow.throttleDown, false);

  const separated = fixedWingAiCommand({
    ...f22LeadPlaneState(geometry),
    range_m: 5_000,
    closure_kts: -100,
    true_airspeed_kts: 430,
    calibrated_airspeed_kts: 320,
  }, "f22", controllerState);
  assert.equal(separated.target.combatCornerEnergyActive, false,
    "meaningful separation restores the rejoin speed schedule");
  assert.equal(separated.target.energySpeedMode, "target-ktas");
});

test("F-22 finisher holds a captured bank through the tape-shaped near-axis plane loop", () => {
  const controllerState = createFixedWingAiControllerState();
  const cleanCapturePoint = {
    // Hardware tape 359 at 96.95 s, immediately before the sustained limit cycle.
    bankDeg: 78.70,
    rollRateDps: -3.81,
    planeErrorDeg: -3.44,
    offBoresightDeg: 5.93,
  };
  const candidate = fixedWingAiCommand(
    f22LeadPlaneState(cleanCapturePoint), "f22", controllerState,
  );
  assert.equal(candidate.target.gunLeadRollCaptureActive, false,
    "one wider alignment sample must not freeze an unfinished conversion");
  const captured = fixedWingAiCommand(
    f22LeadPlaneState(cleanCapturePoint), "f22", controllerState,
  );
  assert.equal(captured.target.gunLeadRollCaptureActive, true);
  assert.equal(captured.target.gunLeadCartesianRollActive, true,
    "stable Cartesian history must survive the first capture frame");
  assert.ok(Math.abs(controllerState.gunLeadRollCaptureBankDeg - 75.26) < 0.01,
    "capture must still latch bank plus lead-plane error, not arbitrary wings-level");

  const observedPlaneErrorsDeg = [
    26.47, -23.85, 27.84, -26.27, 36.00, -23.72,
    52.67, -59.93, 57.92, -47.86, 24.08, -22.54,
    26.15, -9.91, 8.05, -6.96,
  ];
  const heldSamples = observedPlaneErrorsDeg.map((planeErrorDeg, index) => {
    const command = fixedWingAiCommand(f22LeadPlaneState({
      bankDeg: 75.26,
      rollRateDps: 0,
      planeErrorDeg,
      offBoresightDeg: 5,
    }), "f22", controllerState);
    assert.equal(command.target.gunLeadRollCaptureActive, true);
    assert.ok(Math.abs(command.target.desiredBankDeg - 75.26) < 0.01);
    assert.ok(Math.abs(command.target.leadRollControlErrorDeg) < 0.01,
      "near-axis plane crossings must not re-enter the live conversion loop");
    assert.ok(command.pitch > 0,
      "captured lift-plane projection must keep the correct pull sign above the axis");
    return { wallS: index * 0.817, aiRollCommand: command.roll };
  });
  assert.equal(rollCommandChatterStats(heldSamples).reversals, 0);

  const tape373FineAlignment = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 75.26,
    rollRateDps: 0,
    planeErrorDeg: 35.30,
    offBoresightDeg: 1.23,
  }), "f22", controllerState);
  assert.ok(tape373FineAlignment.pitch > 0.15,
    "the final pitch loop must keep correcting inside one degree instead of going nearly neutral");

  const coupledRateBrake = fixedWingAiCommand(f22LeadPlaneState({
    // Tape 370 held -107.64 degrees while high-G coupling alternated body rate. The old capture
    // gain still asked for more negative roll at -6.4 dps, feeding the visible 2.8-degree rock.
    bankDeg: 79,
    rollRateDps: -6.4,
    planeErrorDeg: 0,
    offBoresightDeg: 5,
  }), "f22", controllerState);
  assert.ok(Math.abs(coupledRateBrake.roll) < 0.1,
    "a live Cartesian crossing may carry one bounded feed-forward sample");
  const steadyRateBrake = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 79,
    rollRateDps: -6.4,
    planeErrorDeg: 0,
    offBoresightDeg: 5,
  }), "f22", controllerState);
  assert.ok(steadyRateBrake.roll > 0,
    "once lateral motion settles, captured damping must brake the overshooting body rate");

  const crossedAxis = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 75.26,
    rollRateDps: 0,
    planeErrorDeg: 120,
    offBoresightDeg: 5,
  }), "f22", controllerState);
  assert.equal(crossedAxis.target.gunLeadRollCaptureActive, true);
  assert.ok(crossedAxis.pitch < -0.35 && crossedAxis.pitch >= -0.42,
    "same captured bank must reverse pitch—not roll—when lead crosses below the gun axis");

  const releaseStates = Array.from({ length: 40 }, (_, index) => fixedWingAiCommand(
    f22LeadPlaneState({
      bankDeg: 75.26,
      rollRateDps: 0,
      // Tape 366 released directly from a nearly-neutral held bank into 76-109 degrees of live
      // plane error. The fighting-bank cap now rejects this 150-degree target instead of walking
      // a captured plane through knife-edge.
      planeErrorDeg: 75,
      offBoresightDeg: 13,
    }),
    "f22",
    controllerState,
  ));
  assert.equal(releaseStates[0].target.gunLeadRollCaptureActive, true);
  assert.equal(releaseStates[1].target.gunLeadRollCaptureActive, true);
  assert.equal(releaseStates[2].target.gunLeadRollCaptureActive, true);
  assert.equal(releaseStates[3].target.gunLeadRollCaptureActive, false);
  assert.equal(releaseStates[3].target.gunLeadFinisherActive, false);
  assert.equal(releaseStates[3].target.gunLeadFinisherBankLimitExitActive, true,
    "a 75-to-150-degree handoff must exit instead of slewing through knife-edge");
  assert.equal(releaseStates[3].target.gunLeadFinisherRearmBlocked, true);
  assert.ok(Math.abs(releaseStates[3].target.gunLeadFinisherBoundedBankTargetDeg) <= 90,
    "the rejected live plane must still publish a contained diagnostic target");

  const interruptedHandoffController = createFixedWingAiControllerState();
  const lowerCapturePoint = {
    ...cleanCapturePoint,
    bankDeg: 73.44,
  };
  fixedWingAiCommand(
    f22LeadPlaneState(lowerCapturePoint), "f22", interruptedHandoffController,
  );
  fixedWingAiCommand(
    f22LeadPlaneState(lowerCapturePoint), "f22", interruptedHandoffController,
  );
  const materialError = (offBoresightDeg) => fixedWingAiCommand(
    f22LeadPlaneState({
      bankDeg: 70,
      rollRateDps: 0,
      planeErrorDeg: 6,
      offBoresightDeg,
    }),
    "f22",
    interruptedHandoffController,
  );
  materialError(13);
  materialError(13);
  materialError(13);
  const progressed = materialError(13);
  const interrupted = materialError(10);
  const stillHeld = materialError(10);
  assert.equal(interrupted.target.gunLeadRollCaptureActive, true);
  assert.equal(interrupted.target.gunLeadRollCaptureHandoffActive, false);
  assert.ok(Math.abs(wrapAngleDeg(
    interrupted.target.desiredBankDeg - progressed.target.desiredBankDeg,
  )) < 0.01, "a recovered off-axis error must freeze the partially slewed bank");
  assert.ok(Math.abs(wrapAngleDeg(
    stillHeld.target.desiredBankDeg - interrupted.target.desiredBankDeg,
  )) < 0.01);

  const targetChangeController = createFixedWingAiControllerState();
  const targetOne = {
    ...f22LeadPlaneState(cleanCapturePoint),
    engagement_number: 0,
    selected_player_gun_target_slot: 0,
    bandit_entity_id: "entity.bandit.2",
  };
  fixedWingAiCommand(targetOne, "f22", targetChangeController);
  assert.equal(fixedWingAiCommand(
    targetOne, "f22", targetChangeController,
  ).target.gunLeadRollCaptureActive, true);
  const targetTwo = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 75.26,
      rollRateDps: 0,
      planeErrorDeg: 12,
      offBoresightDeg: 8,
    }),
    engagement_number: 0,
    selected_player_gun_target_slot: 0,
    bandit_entity_id: "entity.bandit.3",
  }, "f22", targetChangeController);
  assert.equal(targetTwo.target.gunLeadTargetChanged, true);
  assert.equal(targetTwo.target.gunLeadRollCaptureActive, false,
    "a new physical contact cannot inherit the previous target's captured lift plane");
  assert.ok(targetTwo.roll > 0.04 && targetTwo.roll < 0.1,
    "the new target must receive its own bounded 78-degree roll command");

  const recoveryController = createFixedWingAiControllerState();
  fixedWingAiCommand(f22LeadPlaneState(cleanCapturePoint), "f22", recoveryController);
  assert.equal(fixedWingAiCommand(
    f22LeadPlaneState(cleanCapturePoint), "f22", recoveryController,
  ).target.gunLeadRollCaptureActive, true);
  const recovery = fixedWingAiCommand(f22LeadPlaneState({
    ...cleanCapturePoint,
    altitudeM: 6_300,
    gammaDeg: 48,
  }), "f22", recoveryController);
  assert.equal(recovery.target.verticalRecoveryPhase, "slice");
  assert.equal(recovery.target.gunLeadRollCaptureActive, false,
    "vertical escape recovery must release capture immediately");
});

test("F-22 finisher captures a converged lead before the tape-389 axis singularity", () => {
  const controllerState = createFixedWingAiControllerState();
  const converged = fixedWingAiCommand(f22LeadPlaneState({
    // Tape 389 at 134.367 s: the pipper was converging cleanly but the aircraft still had body
    // roll. This is close enough to latch the physical lift plane without waiting for rate zero.
    bankDeg: -84.25,
    rollRateDps: -38.23,
    planeErrorDeg: -20.45,
    offBoresightDeg: 1.81,
  }), "f22", controllerState);
  assert.equal(converged.target.gunLeadRollCaptureActive, true);
  assert.equal(converged.target.gunLeadCartesianRollActive, true);
  assert.ok(converged.target.gunLeadCartesianRollRateDps < -12
    && converged.target.gunLeadCartesianRollRateDps > -13,
  "high-rate converged capture must inherit bounded Cartesian demand, not noisy azimuth");

  const axisCrossing = fixedWingAiCommand(f22LeadPlaneState({
    // Fifty milliseconds after the raw solution, the transverse-plane azimuth became singular
    // and jumped by 124 degrees. The captured bank must absorb that without a full roll command.
    bankDeg: -89.64,
    rollRateDps: -1.37,
    planeErrorDeg: 119.46,
    offBoresightDeg: 0.34,
  }), "f22", controllerState);
  assert.equal(axisCrossing.target.gunLeadRollCaptureActive, true);
  assert.equal(axisCrossing.target.gunLeadCartesianRollActive, true);
  assert.ok(axisCrossing.target.gunLeadCartesianRollFeedForwardDps > 9.9);
  assert.ok(axisCrossing.target.gunLeadCartesianRollRateDps > 15
    && axisCrossing.target.gunLeadCartesianRollRateDps < 17,
  "axis crossing must anticipate the moving miss instead of jumping bank azimuth");
  assert.ok(Math.abs(axisCrossing.roll) < 0.25,
    `axis crossing injected ${axisCrossing.roll.toFixed(3)} roll`);
});

test("F-22 captures tape 433's settled Cartesian axis despite singular plane azimuth", () => {
  const command = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 83,
    rollRateDps: -1.25,
    planeErrorDeg: -145.695,
    offBoresightDeg: 0.986,
  }), "f22", createFixedWingAiControllerState());

  assert.ok(Math.abs(command.target.leadLateralErrorDeg + 0.556) < 0.01);
  assert.equal(command.target.gunLeadCartesianCaptureConverged, true);
  assert.equal(command.target.gunLeadRollCaptureActive, true,
    "a solved lateral axis cannot be vetoed by near-boresight plane azimuth");
  assert.ok(command.target.leadLiftErrorDeg < -0.75
    && command.target.leadLiftErrorDeg > -0.9);
  assert.ok(command.pitch < -0.3,
    "captured signed-lift control must correct the remaining below-gun miss");
});

test("F-22 admits Tape 442's close high-closure axis one update before the gun cone", () => {
  const commandAt = ({
    rangeM = 431.9,
    closureKts = 772.5,
    offBoresightDeg = 0.992089,
    planeErrorDeg = -127.423,
    rollRateDps = -6.2,
  } = {}) => {
    const controllerState = createFixedWingAiControllerState();
    const geometry = f22LeadPlaneState({
      bankDeg: 78,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg,
    });
    // The production pass entered the wide finisher before closure crossed its 650-kt entry
    // ceiling. Stay outside the new 650 m lane while staging that latch, then test only the
    // near-axis capture transition on the next update.
    fixedWingAiCommand({
      ...geometry,
      range_m: 700,
      closure_kts: 640,
      gunnery_pitch_assist: true,
    }, "f22", controllerState);
    return fixedWingAiCommand({
      ...geometry,
      range_m: rangeM,
      closure_kts: closureKts,
      gunnery_pitch_assist: true,
    }, "f22", controllerState);
  };

  const tape442 = commandAt();
  assert.ok(Math.abs(tape442.target.leadLateralErrorDeg + 0.788) < 0.01);
  assert.equal(tape442.target.gunLeadCartesianCaptureConverged, true);
  assert.equal(tape442.target.gunLeadRollCaptureActive, true);
  assert.equal(tape442.target.gunLeadPitchDominatedFineCapture, false,
    "negative signed-lift error must push through Cartesian capture, not arm a pull floor");
  assert.ok(tape442.target.leadLiftErrorDeg < -0.59
    && tape442.target.leadLiftErrorDeg > -0.62);
  assert.ok(tape442.target.desiredLoadFactorG < 0.3,
    "early capture must command the measured negative signed-lift correction");

  assert.equal(commandAt({ rangeM: 650.01 })
    .target.gunLeadCartesianCaptureConverged, false);
  assert.equal(commandAt({ closureKts: 449.99 })
    .target.gunLeadCartesianCaptureConverged, false);
  assert.equal(commandAt({ offBoresightDeg: 2.01, planeErrorDeg: -23.1 })
    .target.gunLeadCartesianCaptureConverged, false);
  assert.equal(commandAt({ offBoresightDeg: 1, planeErrorDeg: -54.1 })
    .target.gunLeadCartesianCaptureConverged, false);
  assert.equal(commandAt({ rollRateDps: 15.01 })
    .target.gunLeadCartesianCaptureConverged, false);

  const inclusiveBoundary = commandAt({
    rangeM: 650,
    closureKts: 450,
    rollRateDps: 15,
  });
  assert.equal(inclusiveBoundary.target.gunLeadCartesianCaptureConverged, true,
    "range, closure and roll thresholds are inclusive");
  assert.equal(commandAt({
    offBoresightDeg: 1.999999,
    planeErrorDeg: -(Math.asin(0.788 / 1.999999) * 180 / Math.PI),
  }).target.gunLeadCartesianCaptureConverged, true,
  "floating reconstruction immediately inside the two-degree edge must capture");
  assert.equal(commandAt({
    offBoresightDeg: 1,
    planeErrorDeg: -(Math.asin(0.799999) * 180 / Math.PI),
  }).target.gunLeadCartesianCaptureConverged, true,
  "floating reconstruction immediately inside the 0.8-degree lateral edge must capture");
});

test("F-22 finisher crosses the near-axis seam with bounded Cartesian roll rate", () => {
  const controllerState = createFixedWingAiControllerState();
  const cleanCandidate = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 93.32,
    rollRateDps: -4.32,
    planeErrorDeg: -7.55,
    offBoresightDeg: 5.36,
  }), "f22", controllerState);
  assert.equal(cleanCandidate.target.gunLeadRollCaptureActive, false);
  assert.equal(cleanCandidate.target.gunLeadCartesianRollActive, true);
  assert.ok(cleanCandidate.target.gunLeadCartesianRollRateDps < -13);
  assert.ok(cleanCandidate.target.gunLeadCartesianRollRateDps > -15);

  const singularPlane = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 92.55,
    rollRateDps: -18,
    planeErrorDeg: -92,
    offBoresightDeg: 2.03,
  }), "f22", controllerState);
  assert.equal(singularPlane.target.gunLeadRollCaptureActive, false);
  assert.equal(singularPlane.target.gunLeadCartesianRollActive, true);
  assert.ok(Math.abs(singularPlane.target.gunLeadCartesianRollRateDps) <= 45);
  assert.ok(Math.abs(singularPlane.roll) < 0.4,
    `near-axis seam injected ${singularPlane.roll.toFixed(3)} roll`);
});

test("F-22 Cartesian roll anticipates a steady lead crossing before it changes sides", () => {
  const controllerState = createFixedWingAiControllerState();
  const approaching = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 90,
    rollRateDps: 0,
    planeErrorDeg: -13.1,
    offBoresightDeg: 1,
  }), "f22", controllerState);
  assert.ok(approaching.target.leadLateralErrorDeg < -0.22);
  assert.equal(approaching.target.gunLeadCartesianRollFeedForwardDps, 0);

  const crossing = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 90,
    rollRateDps: 0,
    planeErrorDeg: 3.85,
    offBoresightDeg: 1,
  }), "f22", controllerState);
  assert.ok(crossing.target.leadLateralErrorDeg > 0.06
    && crossing.target.leadLateralErrorDeg < 0.08);
  assert.ok(crossing.target.leadLateralErrorDeltaDeg > 0.28
    && crossing.target.leadLateralErrorDeltaDeg < 0.31);
  assert.ok(crossing.target.gunLeadCartesianRollFeedForwardDps > 8.4
    && crossing.target.gunLeadCartesianRollFeedForwardDps < 9.3);
  assert.ok(crossing.target.gunLeadCartesianRollRateDps > 9.5,
    "steady rightward lead motion must pre-position positive roll rate at the axis");
  assert.ok(Math.abs(crossing.roll) < 0.15,
    `crossing feed-forward injected ${crossing.roll.toFixed(3)} roll`);
});

test("F-22 captured Cartesian roll removes a persistent lateral tracking bias", () => {
  const controllerState = createFixedWingAiControllerState();
  const captured = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0,
    rollRateDps: 0,
    planeErrorDeg: 0,
    offBoresightDeg: 1,
  }), "f22", controllerState);
  assert.equal(captured.target.gunLeadRollCaptureActive, true);
  assert.equal(captured.target.gunLeadCapturedFineRollActive, true);

  const trackingCommand = (overrides = {}) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: -5.4,
      planeErrorDeg: -75,
      offBoresightDeg: 0.5,
      ...overrides,
    }),
    bandit_entity_id: overrides.banditEntityId ?? "lead-one",
  }, "f22", controllerState);
  const trainBias = (overrides = {}) => {
    let command;
    for (let sample = 0; sample < 50; sample += 1) command = trackingCommand(overrides);
    return command;
  };

  let tracking = trainBias();
  assert.ok(tracking.target.leadLateralErrorDeg < -0.48);
  const expectedBiasRateDps = 49 * tracking.target.leadLateralErrorDeg * 0.15;
  assert.ok(Math.abs(
    tracking.target.gunLeadCartesianRollBiasRateDps - expectedBiasRateDps,
  ) < 1e-9, "the fast first sample must be rejected before steady-error accumulation");
  assert.ok(tracking.target.gunLeadCartesianRollBiasRateDps < -3.5);
  assert.ok(tracking.target.gunLeadCartesianRollBiasRateDps >= -5);
  assert.ok(
    tracking.target.gunLeadCartesianRollRateDps
      < tracking.target.leadLateralErrorDeg * 20 - 3.5,
    "captured fine roll must learn the rate needed to erase a steady miss",
  );

  const fastTransient = trackingCommand({ planeErrorDeg: -30 });
  assert.equal(fastTransient.target.gunLeadCartesianRollBiasRateDps, 0,
    "a fast captured-axis geometry change cannot wind up the fine trim");
  let largeError;
  for (let sample = 0; sample < 10; sample += 1) {
    largeError = trackingCommand({ planeErrorDeg: -90, offBoresightDeg: 0.7 });
  }
  assert.equal(largeError.target.gunLeadCartesianRollBiasRateDps, 0,
    "large captured-axis conversion errors belong to the transient controller");

  tracking = trainBias();
  const fineModeExit = trackingCommand({ offBoresightDeg: 3.1 });
  assert.equal(fineModeExit.target.gunLeadCartesianRollBiasRateDps, 0,
    "leaving captured-fine Cartesian control must discard learned rate");

  tracking = trainBias();
  const changedTarget = trackingCommand({ banditEntityId: "lead-two" });
  assert.equal(changedTarget.target.gunLeadCartesianRollBiasRateDps, 0,
    "a promoted target cannot inherit another actor's learned turn rate");

  const recaptured = trackingCommand({
    planeErrorDeg: 0,
    offBoresightDeg: 1,
    rollRateDps: 0,
    banditEntityId: "lead-two",
  });
  assert.equal(recaptured.target.gunLeadRollCaptureActive, true);
  tracking = trainBias({ banditEntityId: "lead-two" });
  const crossedAxis = trackingCommand({
    planeErrorDeg: 75,
    banditEntityId: "lead-two",
  });
  assert.equal(crossedAxis.target.gunLeadCartesianRollBiasRateDps, 0,
    "the learned rate cannot survive a gun-axis crossing");
});

test("F-22 captured-axis bank trims from continuous lateral error, not singular azimuth", () => {
  const controllerState = createFixedWingAiControllerState();
  const capture = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 38,
    rollRateDps: -20,
    planeErrorDeg: -10,
    offBoresightDeg: 1,
  }), "f22", controllerState);
  assert.equal(capture.target.gunLeadRollCaptureActive, true);

  const rightOfGun = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 36,
    rollRateDps: -3,
    planeErrorDeg: 90,
    offBoresightDeg: 1.5,
  }), "f22", controllerState);
  assert.ok(rightOfGun.target.leadLateralErrorDeg > 1.49);
  assert.ok(rightOfGun.target.leadRollCaptureTrimDeg > 0);
  assert.ok(rightOfGun.target.leadRollCaptureTrimDeg <= 0.35);
  assert.ok(rightOfGun.target.gunLeadCartesianRollRateDps > 29,
    "right-axis miss must demand a bounded physical right roll");
  assert.ok(wrapAngleDeg(rightOfGun.target.desiredBankDeg - 36) > 0);

  const leftOfGun = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 36,
    rollRateDps: 0,
    planeErrorDeg: -90,
    offBoresightDeg: 1.5,
  }), "f22", controllerState);
  assert.ok(leftOfGun.target.leadLateralErrorDeg < -1.49);
  assert.ok(leftOfGun.target.leadRollCaptureTrimDeg < 0);
  assert.ok(Math.abs(leftOfGun.target.leadRollCaptureTrimDeg) <= 0.35);
  assert.ok(leftOfGun.target.gunLeadCartesianRollRateDps < -29,
    "left-axis miss must reverse rate demand without a bank-angle seam");
  assert.ok(wrapAngleDeg(leftOfGun.target.desiredBankDeg - 36) < 0);
});

test("F-22 captured fine roll does not chatter across its live-tape boundary", () => {
  const controllerState = createFixedWingAiControllerState();
  const command = (offBoresightDeg, planeErrorDeg = 20) => fixedWingAiCommand(
    f22LeadPlaneState({
      bankDeg: -45,
      rollRateDps: 0,
      planeErrorDeg,
      offBoresightDeg,
    }),
    "f22",
    controllerState,
  );

  command(2.2, 2);
  const entered = command(2.2, 2);
  assert.equal(entered.target.gunLeadRollCaptureActive, true);
  assert.equal(entered.target.gunLeadCapturedFineRollActive, true);
  assert.equal(entered.target.gunLeadCartesianRollActive, true);

  const tapeBoundary = command(2.65, 38.5);
  assert.equal(tapeBoundary.target.gunLeadCapturedFineRollActive, true,
    "tape 419 alternated controllers each time error crossed the old 2.5-degree edge");
  assert.equal(tapeBoundary.target.gunLeadCartesianRollActive, true);
  assert.equal(command(2.95).target.gunLeadCapturedFineRollActive, true);

  const released = command(3.05);
  assert.equal(released.target.gunLeadCapturedFineRollActive, false);
  assert.equal(released.target.gunLeadCartesianRollActive, true,
    "captured lead keeps continuous Cartesian P/feed-forward through six degrees");
  assert.equal(released.target.gunLeadCartesianRollBiasRateDps, 0,
    "fine integral bias still releases at its narrower hysteresis boundary");
  assert.equal(command(2.5).target.gunLeadCapturedFineRollActive, false,
    "the release shoulder must not immediately re-arm fine roll");
  assert.equal(command(6.01).target.gunLeadCartesianRollActive, false,
    "Cartesian ownership remains bounded by its existing six-degree envelope");
  assert.equal(command(2.3).target.gunLeadCapturedFineRollActive, true);
});

test("F-22 Cartesian seam keeps pursuit authority until bank capture", () => {
  const command = fixedWingAiCommand(f22LeadPlaneState({
    // Tape 432 proved that applying the captured-loop brake before capture starved this final
    // conversion: the jet never reached lead, crossed the transverse seam, and snapped back into
    // full plane pursuit. Keep normal pursuit authority until the stable bank is actually latched.
    bankDeg: 0,
    rollRateDps: -15.5,
    planeErrorDeg: -86,
    offBoresightDeg: 1,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(command.target.gunLeadRollCaptureActive, false);
  assert.equal(command.target.gunLeadCartesianRollActive, true);
  assert.ok(command.target.gunLeadCartesianRollRateDps < -19
    && command.target.gunLeadCartesianRollRateDps > -21);
  assert.ok(command.roll < -0.08 && command.roll > -0.13,
    `uncaptured Cartesian pursuit was over-braked at ${command.roll.toFixed(3)}`);
});

test("F-22 captured-axis fine trim is not swallowed by the route roll deadband", () => {
  const controllerState = createFixedWingAiControllerState();
  const capture = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0,
    rollRateDps: 0,
    planeErrorDeg: 0,
    offBoresightDeg: 1,
  }), "f22", controllerState);
  assert.equal(capture.target.gunLeadRollCaptureActive, true);

  const arrestResidualRoll = fixedWingAiCommand(f22LeadPlaneState({
    bankDeg: 0,
    rollRateDps: -1,
    planeErrorDeg: 90,
    offBoresightDeg: 1,
  }), "f22", controllerState);
  assert.ok(arrestResidualRoll.target.leadRollCaptureTrimDeg > 0);
  assert.ok(arrestResidualRoll.target.gunLeadCartesianRollFeedForwardDps > 9.9);
  assert.ok(arrestResidualRoll.roll > 0,
    "a residual left roll through a right-axis miss needs a real counter-command");
  assert.ok(arrestResidualRoll.roll < 0.3,
    `fine capture injected ${arrestResidualRoll.roll.toFixed(3)} roll`);
});

test("F-22 captured-axis pilot floors high-closure pitch capture at 3 G then restores damping", () => {
  for (const maximumG of [9, 5.5]) {
    const unassisted = fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 0,
        rollRateDps: 0,
        planeErrorDeg: 0,
        offBoresightDeg: 1.9,
      }),
      g_maxperform: maximumG,
      gunnery_pitch_assist: false,
    }, "f22", createFixedWingAiControllerState());
    const liveAssisted = fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 0,
        rollRateDps: 0,
        planeErrorDeg: 0,
        offBoresightDeg: 1.9,
      }),
      g_maxperform: maximumG,
      gunnery_pitch_assist: true,
    }, "f22", createFixedWingAiControllerState());
    const highClosureAssisted = fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 0,
        rollRateDps: 0,
        planeErrorDeg: 0,
        offBoresightDeg: 1.9,
      }),
      closure_kts: 640,
      g_maxperform: maximumG,
      gunnery_pitch_assist: true,
    }, "f22", createFixedWingAiControllerState());
    const settledState = {
      ...f22LeadPlaneState({
        bankDeg: 0,
        rollRateDps: 0,
        planeErrorDeg: 0,
        offBoresightDeg: 0.8,
      }),
      g_maxperform: maximumG,
    };
    const settledUnassisted = fixedWingAiCommand({
      ...settledState,
      gunnery_pitch_assist: false,
    }, "f22", createFixedWingAiControllerState());
    const settledAssisted = fixedWingAiCommand({
      ...settledState,
      gunnery_pitch_assist: true,
    }, "f22", createFixedWingAiControllerState());
    assert.equal(liveAssisted.target.gunLeadRollCaptureActive, true);
    assert.ok(fixedWingLoadFactorForPitch(unassisted.pitch, maximumG) > 2,
      "the independent fallback still needs enough authority when production assist is absent");
    assert.ok(Math.abs(
      fixedWingLoadFactorForPitch(liveAssisted.pitch, maximumG)
        - Math.min(fixedWingLoadFactorForPitch(unassisted.pitch, maximumG), 3),
    ) < 1e-9, `low-closure capture changed its proportional pull at max ${maximumG} G`);
    assert.equal(liveAssisted.target.gunLeadPitchDominatedFineCapture, true);
    assert.ok(Math.abs(
      fixedWingLoadFactorForPitch(highClosureAssisted.pitch, maximumG) - 3,
    ) < 1e-9, `high-closure pitch capture did not hold the 3 G floor at max ${maximumG} G`);
    assert.equal(highClosureAssisted.target.gunLeadPitchDominatedFineCapture, true);
    assert.ok(Math.abs(
      fixedWingLoadFactorForPitch(settledAssisted.pitch, maximumG)
        - Math.min(fixedWingLoadFactorForPitch(settledUnassisted.pitch, maximumG), 1.9),
    ) < 1e-9, `settled lift axis did not restore full damping at max ${maximumG} G`);
    assert.equal(settledAssisted.target.gunLeadPitchDominatedFineCapture, false);
  }

  const hysteresisState = createFixedWingAiControllerState();
  const hysteresisCommand = (liftErrorDeg) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg: liftErrorDeg,
    }),
    gunnery_pitch_assist: true,
  }, "f22", hysteresisState);
  assert.equal(
    hysteresisCommand(1.2).target.gunLeadPitchDominatedFineCapture,
    true,
  );
  for (const noisyLiftErrorDeg of [0.95, 1.05, 0.92, 1.02]) {
    assert.equal(
      hysteresisCommand(noisyLiftErrorDeg).target.gunLeadPitchDominatedFineCapture,
      true,
      "lead noise around one degree must not toggle the 3 G shoulder each 20 Hz sample",
    );
  }
  assert.equal(
    hysteresisCommand(0.75).target.gunLeadPitchDominatedFineCapture,
    false,
    "the shoulder must release only after lift error is clearly settled",
  );
  assert.equal(
    hysteresisCommand(1.02).target.gunLeadPitchDominatedFineCapture,
    false,
    "release hysteresis must not re-arm on one-degree noise",
  );
  assert.equal(
    hysteresisCommand(1.2).target.gunLeadPitchDominatedFineCapture,
    true,
  );

  const unassistedState = createFixedWingAiControllerState();
  const assistedState = createFixedWingAiControllerState();
  for (const [state, active] of [[unassistedState, false], [assistedState, true]]) {
    fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 0,
        rollRateDps: 0,
        planeErrorDeg: 0,
        offBoresightDeg: 1,
      }),
      gunnery_pitch_assist: active,
    }, "f22", state);
  }
  const negativeUnassisted = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 120,
      offBoresightDeg: 2,
    }),
    gunnery_pitch_assist: false,
  }, "f22", unassistedState);
  const negativeAssisted = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 120,
      offBoresightDeg: 2,
    }),
    gunnery_pitch_assist: true,
  }, "f22", assistedState);
  assert.ok(negativeAssisted.pitch <= -0.15);
  assert.equal(negativeAssisted.pitch, negativeUnassisted.pitch,
    "the positive-G damping cap must never weaken a commanded below-line push");
});

test("Tape 441 high-closure lift-axis stall keeps the physical 3 G shoulder", () => {
  const controllerState = createFixedWingAiControllerState();
  const lateralErrorDeg = 0.4829580871561773;
  const liftErrorDeg = 1.8101563643544503;
  const offBoresightDeg = Math.hypot(lateralErrorDeg, liftErrorDeg);
  const planeErrorDeg = Math.atan2(lateralErrorDeg, liftErrorDeg) * 180 / Math.PI;
  const tape441 = (closureKts) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -42.15,
      rollRateDps: 0.1,
      planeErrorDeg,
      offBoresightDeg,
    }),
    closure_kts: closureKts,
    g_maxperform: 8.36,
    gunnery_pitch_assist: true,
  }, "f22", controllerState);

  tape441(640); // Establish the same already-owned finisher before closure crosses its entry gate.
  const stalledCapture = tape441(665.9);
  assert.equal(stalledCapture.target.gunLeadFinisherActive, true);
  assert.equal(stalledCapture.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(Math.abs(stalledCapture.target.leadLateralErrorDeg - lateralErrorDeg) < 1e-9);
  assert.ok(Math.abs(stalledCapture.target.leadLiftErrorDeg - liftErrorDeg) < 1e-9);
  assert.ok(Math.abs(stalledCapture.target.desiredLoadFactorG - 3) < 1e-9,
    `Tape 441 lift-axis capture fell below its 3 G shoulder at ${stalledCapture.target.desiredLoadFactorG} G`);
  assert.equal(stalledCapture.target.gunLeadCartesianRollRateDps, 0,
    "the pitch-owned correction must not reintroduce the old P-driven lateral walk");
});

test("Tape 451 captured pitch-only miss raises base G from published rate deficit", () => {
  const commandAt = ({
    planeErrorDeg = -1.906,
    offBoresightDeg = 3.2668,
    pitchRateErrorDps = 8.354,
    rollRateDps = 0.83,
  } = {}) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    controllerState.gunLeadRollCaptureActive = true;
    controllerState.gunLeadRollCaptureBankDeg = 32.06;
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 32.06,
        rollRateDps,
        planeErrorDeg,
        offBoresightDeg,
        altitudeM: 4_500,
        gammaDeg: 0,
      }),
      range_m: 692.7,
      closure_kts: -96.5,
      g_actual: 6.624,
      aoa_deg: 10.06,
      g_maxperform: 9,
      gunnery_pitch_assist: true,
      gunnery_pitch_rate_error_dps: pitchRateErrorDps,
    }, "f22", controllerState);
  };

  const pitchOnly = commandAt();
  assert.equal(pitchOnly.target.gunLeadRollCaptureActive, true);
  assert.equal(pitchOnly.target.gunLeadCapturedFineRollActive, false,
    "a 3.27-degree lift miss is necessarily outside the old total-error fine-roll gate");
  assert.equal(pitchOnly.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(pitchOnly.target.capturedPitchAxisPullActive, true);
  assert.ok(pitchOnly.target.desiredLoadFactorG > 5.1
      && pitchOnly.target.desiredLoadFactorG <= 5.5,
  `Tape 451's pitch-only lane requested only ${pitchOnly.target.desiredLoadFactorG.toFixed(2)} G`);

  const lateralMiss = commandAt({ planeErrorDeg: 14.1 });
  assert.equal(lateralMiss.target.capturedPitchAxisPullActive, false,
    "a material lateral miss must remain a roll-and-pitch conversion, not receive the pitch-only floor");
  assert.ok(lateralMiss.target.desiredLoadFactorG <= 3 + 1e-9);

  const weakRateDeficit = commandAt({ pitchRateErrorDps: 4.99 });
  assert.equal(weakRateDeficit.target.capturedPitchAxisPullActive, false,
    "the broader base-G lane requires a published material pitch-rate deficit");
  assert.ok(weakRateDeficit.target.desiredLoadFactorG <= 3 + 1e-9);

  const tape452PitchDeficit = commandAt({
    planeErrorDeg: 7.85,
    offBoresightDeg: 2.197,
    pitchRateErrorDps: 5.015,
    rollRateDps: 0.34,
  });
  assert.equal(tape452PitchDeficit.target.capturedPitchAxisPullActive, true);
  assert.ok(tape452PitchDeficit.target.desiredLoadFactorG > 4.5
      && tape452PitchDeficit.target.desiredLoadFactorG < 4.52,
  `Tape 452's measured pitch deficit requested only ${tape452PitchDeficit.target.desiredLoadFactorG.toFixed(2)} G`);

  const unsettledRoll = commandAt({ rollRateDps: 15.01 });
  assert.equal(unsettledRoll.target.capturedPitchAxisPullActive, false,
    "the pitch-only lane must not add G while body roll exceeds its settled-rate boundary");
  assert.ok(unsettledRoll.target.desiredLoadFactorG <= 3 + 1e-9);
});

test("Tape 454 brakes a settled gun-axis approach before the one-sample cone crossing", () => {
  const commandAt = ({
    pitchRateErrorDps = -8.658,
    rollRateDps = -21.05,
    planeErrorDeg = -19.200263995847045,
  } = {}) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 79.76,
        rollRateDps,
        planeErrorDeg,
        offBoresightDeg: 2.6196633135374605,
      }),
      range_m: 406.8,
      closure_kts: -59.1,
      g_maxperform: 9,
      gunnery_pitch_assist: true,
      gunnery_pitch_rate_error_dps: pitchRateErrorDps,
    }, "f22", controllerState);
  };

  const approach = commandAt();
  assert.equal(approach.target.gunLeadFinisherActive, true);
  assert.equal(approach.target.gunLeadCartesianRollActive, true);
  assert.equal(approach.target.gunLeadRollCaptureActive, false);
  assert.ok(Math.abs(approach.target.leadLateralErrorDeg + 0.8615312884533564) < 1e-9);
  assert.equal(approach.target.gunLeadPitchAxisApproachBrakeActive, true);
  assert.ok(Math.abs(approach.target.desiredLoadFactorG - 1.9) < 1e-9,
    `Tape 454 approach retained ${approach.target.desiredLoadFactorG.toFixed(3)} G`);

  const noMeasuredOvershoot = commandAt({ pitchRateErrorDps: -4.99 });
  assert.equal(noMeasuredOvershoot.target.gunLeadPitchAxisApproachBrakeActive, false);
  assert.ok(noMeasuredOvershoot.target.desiredLoadFactorG > 2.7,
    "ordinary convergence outside the full-damping cone must retain its three-G shoulder");

  const unsettledRoll = commandAt({ rollRateDps: -25.01 });
  assert.equal(unsettledRoll.target.gunLeadPitchAxisApproachBrakeActive, false,
    "pitch prediction must not take over during an unfinished lift-plane conversion");

  const lateralMiss = commandAt({ planeErrorDeg: -23 });
  assert.equal(lateralMiss.target.gunLeadPitchAxisApproachBrakeActive, false,
    "a material lateral miss must remain owned by the Cartesian conversion");

  const latchedFineCaptureController = createFixedWingAiControllerState();
  latchedFineCaptureController.gunLeadFinisherActive = true;
  latchedFineCaptureController.gunLeadRollCaptureActive = true;
  latchedFineCaptureController.gunLeadRollCaptureBankDeg = 0;
  latchedFineCaptureController.gunLeadCapturedFineRollActive = true;
  latchedFineCaptureController.gunLeadPitchDominatedFineCaptureActive = true;
  const latchedFineCapture = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 17,
      offBoresightDeg: 2.62,
    }),
    range_m: 406.8,
    closure_kts: -59.1,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: -8.658,
  }, "f22", latchedFineCaptureController);
  assert.equal(latchedFineCapture.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(latchedFineCapture.target.gunLeadPitchAxisApproachBrakeActive, true);
  assert.ok(Math.abs(latchedFineCapture.target.desiredLoadFactorG - 1.9) < 1e-9,
    "direct pitch-rate overshoot evidence must override a stale three-G fine-capture shoulder");

  const promotionController = createFixedWingAiControllerState();
  promotionController.gunLeadFinisherActive = true;
  promotionController.gunLeadRollCaptureTargetKey = "entity:previous-contact";
  const promotedContact = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 79.76,
      rollRateDps: -21.05,
      planeErrorDeg: -19.200263995847045,
      offBoresightDeg: 2.6196633135374605,
    }),
    range_m: 406.8,
    closure_kts: -59.1,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: -8.658,
    bandit_entity_id: "replacement-contact",
  }, "f22", promotionController);
  assert.equal(promotedContact.target.gunLeadTargetChanged, true);
  assert.equal(promotedContact.target.gunLeadPitchAxisApproachBrakeActive, false,
    "a replacement contact cannot inherit the previous target's pitch-rate brake evidence");
});

test("Tape 473 preserves Cartesian capture and brakes its predicted cone crossing", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  const commandAt = ({
    bankDeg,
    rollRateDps,
    planeErrorDeg,
    offBoresightDeg,
    rangeM,
    closureKts,
    actualG,
    aoaDeg,
    pitchRateErrorDps,
  }) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg,
    }),
    range_m: rangeM,
    closure_kts: closureKts,
    g_actual: actualG,
    aoa_deg: aoaDeg,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: pitchRateErrorDps,
  }, "f22", controllerState);

  const approaching = commandAt({
    bankDeg: 75.42,
    rollRateDps: 1.13,
    planeErrorDeg: 1.615301,
    offBoresightDeg: 5.709349,
    rangeM: 1_066.5,
    closureKts: 271.6,
    actualG: 8.202,
    aoaDeg: 13.97,
    pitchRateErrorDps: -9.078,
  });
  assert.equal(approaching.target.gunLeadCartesianRollActive, true);
  assert.equal(approaching.target.gunLeadPredictiveOvershootBrakeActive, true);
  assert.equal(approaching.target.gunLeadPitchAxisApproachBrakeActive, true);
  assert.ok(Math.abs(approaching.target.desiredLoadFactorG - 1.9) < 1e-9);

  const captured = commandAt({
    bankDeg: 75.43,
    rollRateDps: -0.02,
    planeErrorDeg: 0.314888,
    offBoresightDeg: 4.050783,
    rangeM: 1_059.4,
    closureKts: 273.2,
    actualG: 8.146,
    aoaDeg: 13.91,
    pitchRateErrorDps: -13.999,
  });
  assert.equal(captured.target.gunLeadRollCaptureActive, true);
  assert.equal(captured.target.gunLeadCartesianRollActive, true,
    "the first capture frame must retain its stable Cartesian correction");
  assert.equal(captured.target.gunLeadPredictiveOvershootBrakeActive, true);
  assert.ok(captured.target.gunLeadCartesianRollFeedForwardDps < -4
    && captured.target.gunLeadCartesianRollFeedForwardDps > -4.3);
  assert.ok(captured.target.gunLeadCartesianRollRateDps < -3.5
    && captured.target.gunLeadCartesianRollRateDps > -4);
  assert.ok(Math.abs(captured.target.desiredLoadFactorG - 1.9) < 1e-9);

  const noMeasuredOvershootState = createFixedWingAiControllerState();
  noMeasuredOvershootState.gunLeadFinisherActive = true;
  const noMeasuredOvershoot = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 75.42,
      rollRateDps: 1.13,
      planeErrorDeg: 1.615301,
      offBoresightDeg: 5.709349,
    }),
    range_m: 1_066.5,
    closure_kts: 271.6,
    g_actual: 8.202,
    aoa_deg: 13.97,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: -4.99,
  }, "f22", noMeasuredOvershootState);
  assert.equal(noMeasuredOvershoot.target.gunLeadPredictiveOvershootBrakeActive, false,
    "the wider predictive corridor requires a measured pitch overshoot");
});

test("Tape 475 scales only fine Cartesian P by physical range", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = 66.26;
  controllerState.gunLeadRollCaptureActive = true;
  controllerState.gunLeadRollCaptureBankDeg = 78;
  controllerState.gunLeadCapturedFineRollActive = true;
  controllerState.gunLeadLastLateralErrorDeg = 0.4552433446356971;

  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 81,
      rollRateDps: 5.53,
      planeErrorDeg: 88.45934742386434,
      offBoresightDeg: 0.4901756423036465,
    }),
    range_m: 1_738.1,
    closure_kts: 380.2,
    g_actual: 5.451,
    aoa_deg: 13.3,
  }, "f22", controllerState);

  assert.ok(Math.abs(command.target.gunLeadCartesianRangeScale
    - 1_738.1 / 900) < 1e-9);
  assert.ok(command.target.gunLeadCartesianRollRateDps > 19.8
    && command.target.gunLeadCartesianRollRateDps < 20.1,
  `range-scaled correction was only ${command.target.gunLeadCartesianRollRateDps.toFixed(2)} dps`);

  const closeState = createFixedWingAiControllerState();
  closeState.gunLeadFinisherActive = true;
  closeState.gunLeadRollCaptureActive = true;
  closeState.gunLeadRollCaptureBankDeg = 0;
  closeState.gunLeadCapturedFineRollActive = true;
  const close = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg: 0.5,
    }),
    range_m: 900,
  }, "f22", closeState);
  assert.equal(close.target.gunLeadCartesianRangeScale, 1,
    "the existing close-in tuning must stay bit-identical");

  const uncapturedState = createFixedWingAiControllerState();
  uncapturedState.gunLeadFinisherActive = true;
  const uncaptured = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 70,
      rollRateDps: 0,
      planeErrorDeg: 90,
      offBoresightDeg: 5,
    }),
    range_m: 1_738.1,
  }, "f22", uncapturedState);
  assert.equal(uncaptured.target.gunLeadRollCaptureActive, false);
  assert.equal(uncaptured.target.gunLeadCartesianRollActive, true);
  assert.equal(uncaptured.target.gunLeadCartesianRangeScale, 1,
    "long range cannot strengthen an uncaptured Cartesian conversion");

  const capturedCoarseState = createFixedWingAiControllerState();
  capturedCoarseState.gunLeadFinisherActive = true;
  capturedCoarseState.gunLeadRollCaptureActive = true;
  capturedCoarseState.gunLeadRollCaptureBankDeg = 70;
  capturedCoarseState.gunLeadCapturedFineRollActive = false;
  const coarseLateralErrorDeg = 4 * Math.sin(10 * Math.PI / 180);
  capturedCoarseState.gunLeadLastLateralErrorDeg = coarseLateralErrorDeg;
  const capturedCoarse = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 70,
      rollRateDps: 0,
      planeErrorDeg: 10,
      offBoresightDeg: 4,
    }),
    range_m: 1_738.1,
  }, "f22", capturedCoarseState);
  assert.equal(capturedCoarse.target.gunLeadRollCaptureActive, true);
  assert.equal(capturedCoarse.target.gunLeadCapturedFineRollActive, false);
  assert.equal(capturedCoarse.target.gunLeadCartesianRollActive, true);
  assert.equal(capturedCoarse.target.gunLeadCartesianRangeScale, 1,
    "captured coarse tracking retains the proved range-independent gain");
});

test("Tape 475 capture cannot exempt an off-axis full-segment finisher", () => {
  const commandAt = ({
    offBoresightDeg,
    bankDeg,
    planeErrorDeg,
    captureBankDeg,
  }) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    controllerState.gunLeadFinisherEntryBankDeg = 66.26;
    controllerState.gunLeadRollCaptureActive = true;
    controllerState.gunLeadRollCaptureBankDeg = captureBankDeg;
    controllerState.gunLeadCapturedFineRollActive = false;
    const command = fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg,
        rollRateDps: -6.37,
        planeErrorDeg,
        offBoresightDeg,
      }),
      range_m: 1_364,
      closure_kts: 537,
      g_actual: 1,
      aoa_deg: 3,
    }, "f22", controllerState);
    return { command, controllerState };
  };

  const singularBoundary = commandAt({
    offBoresightDeg: 5.99,
    bankDeg: 81,
    planeErrorDeg: 70,
    captureBankDeg: 78,
  }).command;
  assert.equal(singularBoundary.target.gunLeadFinisherActive, true,
    "the settled Cartesian singularity remains protected inside six degrees");

  const escaped = commandAt({
    offBoresightDeg: 7.044,
    bankDeg: 143.08,
    planeErrorDeg: 104.367,
    captureBankDeg: 82,
  }).command;
  assert.equal(escaped.target.gunLeadFinisherActive, false);
  assert.equal(escaped.target.finisherExceededEntryPlaneTravel, true);
  assert.equal(escaped.target.gunLeadFinisherRearmBlocked, true);
  assert.equal(escaped.target.gunLeadRollCaptureActive, false,
    "capture must clear rather than walk its stored bank through another segment");

  const overbankCapture = commandAt({
    offBoresightDeg: 5.99,
    bankDeg: 143.08,
    planeErrorDeg: 104.367,
    captureBankDeg: 121.41,
  }).command;
  assert.equal(overbankCapture.target.gunLeadFinisherActive, false,
    "the Cartesian singularity cannot preserve a stored knife-edge plane");
  assert.equal(overbankCapture.target.finisherExceededEntryPlaneTravel, true);
});

test("Tape 475 finisher contains its bank target and unloads at the overbank seam", () => {
  const bounded = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 84,
      rollRateDps: 0,
      planeErrorDeg: 20,
      offBoresightDeg: 25,
    }),
    range_m: 1_000,
    closure_kts: 300,
    g_actual: 1.2,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(bounded.target.gunLeadFinisherActive, true);
  assert.ok(Math.abs(bounded.target.desiredBankDeg) <= 78 + 1e-9,
    `finisher authored an unrecognizable ${bounded.target.desiredBankDeg.toFixed(2)}-degree bank`);
  assert.equal(bounded.target.gunLeadFinisherOverbankGuardActive, false,
    "a discarded unbounded lead plane is not physical overbank evidence");
  assert.ok(bounded.pitch > 0,
    "the 78-degree fighting turn must carry its nose with wing lift instead of cycling unload");

  const tape477State = createFixedWingAiControllerState();
  tape477State.gunLeadFinisherActive = true;
  tape477State.gunLeadFinisherEntryBankDeg = 54.75;
  tape477State.gunLeadRollCaptureActive = true;
  tape477State.gunLeadRollCaptureBankDeg = 78;
  tape477State.gunLeadCapturedFineRollActive = true;
  const tape477Inward = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 83.5,
      rollRateDps: -0.24,
      planeErrorDeg: 40,
      offBoresightDeg: 2.5,
    }),
    range_m: 1_026,
    closure_kts: 694,
    g_actual: 1.2,
    aoa_deg: 4,
  }, "f22", tape477State);
  assert.ok(tape477Inward.target.gunLeadFinisherUnboundedBankTargetDeg > 90);
  assert.equal(tape477Inward.target.gunLeadFinisherBoundedBankTargetDeg, 78);
  assert.equal(tape477Inward.target.gunLeadFinisherOverbankGuardActive, false,
    "an inward-settling wing below the physical margin cannot remain trapped in unload");
  assert.equal(tape477Inward.target.gunLeadFinisherOverbankUnloadActive, false);
  assert.ok(tape477Inward.pitch > 0,
    "captured positive lift error must resume moderate pitch below the margin");

  const predictiveState = createFixedWingAiControllerState();
  predictiveState.gunLeadFinisherActive = true;
  predictiveState.gunLeadFinisherEntryBankDeg = 70;
  predictiveState.gunLeadRollCaptureActive = true;
  predictiveState.gunLeadRollCaptureBankDeg = 78;
  predictiveState.gunLeadCapturedFineRollActive = true;
  const predictive = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 83,
      rollRateDps: 8,
      planeErrorDeg: 0,
      offBoresightDeg: 2.5,
    }),
    range_m: 1_000,
    closure_kts: 300,
    g_actual: 7,
    aoa_deg: 12,
  }, "f22", predictiveState);
  assert.ok(predictive.target.gunLeadFinisherProjectedBankDeg > 84);
  assert.equal(predictive.target.gunLeadFinisherOverbankGuardActive, true,
    "outward momentum must unload before the physical 84-degree seam is crossed");
  assert.equal(predictive.target.gunLeadFinisherOverbankUnloadActive, true);
  assert.equal(predictive.pitch, -0.10);
  assert.ok(predictive.roll < 0,
    "the predictive guard must brake inward rather than drive the wing through knife-edge");

  const overbankState = createFixedWingAiControllerState();
  overbankState.gunLeadFinisherActive = true;
  overbankState.gunLeadFinisherEntryBankDeg = 66.26;
  overbankState.combatLoadedRollUnloadActive = true;
  overbankState.combatLoadedRollPhase = "roll";
  overbankState.combatLoadedRollTargetBankDeg = 95.11319434258375;
  overbankState.combatLoadedRollTransferSign = 1;
  const overbank = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 91.47,
      rollRateDps: 14.57,
      planeErrorDeg: 7.572774192742371,
      offBoresightDeg: 51.74715025352243,
    }),
    range_m: 1_490,
    closure_kts: 113.8,
    g_actual: 0.664,
    aoa_deg: 1.68,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", overbankState);
  assert.ok(Math.abs(overbank.target.desiredBankDeg) <= 78 + 1e-9,
    `Tape 475 release still targeted ${overbank.target.desiredBankDeg.toFixed(2)} degrees`);
  assert.ok(Math.abs(overbank.target.combatLoadedRollTargetBankDeg) <= 78 + 1e-9,
    "a frozen pre-guard transfer target must be clamped into the fighting-bank envelope");
  assert.equal(overbank.target.gunLeadFinisherOverbankGuardActive, true);
  assert.equal(overbank.pitch, -0.10);
  assert.ok(overbank.roll <= 0,
    `the positive overbank seam commanded outward roll ${overbank.roll.toFixed(3)}`);
});

test("Tape 479 bounded finisher pulls from its physical fighting bank", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = -62.4;
  controllerState.gunLeadFinisherHalfRollSign = -1;
  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -80,
      rollRateDps: -1.61,
      planeErrorDeg: -58.71,
      offBoresightDeg: 29.28,
    }),
    range_m: 977,
    closure_kts: 600,
    g_actual: 0.8,
    aoa_deg: 2,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);
  assert.ok(command.target.gunLeadFinisherUnboundedBankTargetDeg < -130);
  assert.equal(command.target.gunLeadFinisherBoundedBankTargetDeg, -78);
  assert.equal(command.target.gunLeadFinisherOverbankGuardActive, false);
  assert.equal(command.target.combatLoadedRollUnloadActive, false);
  assert.ok(command.target.desiredLoadFactorG > 8,
    "capturing the bounded lift plane must pull toward lead instead of waiting for -139 degrees");
  assert.ok(command.pitch > 0.85);
});

test("Tape 480 keeps a maturing loaded pass through a small finisher bank trim", () => {
  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 71.4,
      rollRateDps: -9.4,
      planeErrorDeg: -5.6,
      offBoresightDeg: 54.7,
    }),
    range_m: 1_149,
    closure_kts: 618,
    g_actual: 6.7,
    aoa_deg: 11,
    requested_g_cmd: 7,
    g_cmd: 7,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(command.target.gunLeadFinisherActive, true);
  assert.ok(Math.abs(command.target.desiredBankDeg - 65.8) < 0.5);
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "a 5.5-degree trim inside the eight-degree capture band cannot dump a maturing 6.7-G pass");
  assert.ok(command.target.desiredLoadFactorG > 8);
  assert.ok(command.pitch > 0.85);
  assert.ok(command.roll < 0 && Math.abs(command.roll) < 0.25,
    "the small loaded trim must stay below the material plane-change threshold");
});

test("Tape 481 holds G while the maturing finisher follows a nine-degree lead-plane trim", () => {
  const commandAt = ({ bankDeg, rollRateDps, planeErrorDeg, offBoresightDeg }) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    controllerState.gunLeadFinisherEntryBankDeg = -56.42;
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg,
        rollRateDps,
        planeErrorDeg,
        offBoresightDeg,
        gammaDeg: -4.43,
      }),
      range_m: 481.7,
      closure_kts: 574.3,
      g_actual: 8.027,
      aoa_deg: 12.16,
      requested_g_cmd: 8.36,
      g_cmd: 8.36,
    }, "f22", controllerState);
  };
  const command = commandAt({
    bankDeg: -51.47,
    rollRateDps: -14.09,
    planeErrorDeg: -8.993711841205423,
    offBoresightDeg: 23.448742233481045,
  });
  assert.equal(command.target.gunLeadFinisherActive, true);
  assert.ok(Math.abs(command.target.desiredBankDeg + 60.4637) < 0.1);
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "a nine-degree correction cannot throw away an established 8-G conversion");
  assert.ok(command.target.desiredLoadFactorG > 8);
  assert.ok(command.pitch > 0.85);
  assert.ok(command.roll < 0 && Math.abs(command.roll) < 0.25,
    "the loaded correction must keep tracking the moving plane without a roll impulse");

  const nextFrame = commandAt({
    bankDeg: -52.02,
    rollRateDps: -4.9,
    planeErrorDeg: -10.6290881839526,
    offBoresightDeg: 21.43691016524443,
  });
  assert.equal(nextFrame.target.combatLoadedRollUnloadActive, false,
    "same-direction body motion keeps the next 10.6-degree trim below material roll authority");
  assert.ok(nextFrame.pitch > 0.85);

  const materialFrame = commandAt({
    bankDeg: -52.16,
    rollRateDps: 0.62,
    planeErrorDeg: -13.03013499521223,
    offBoresightDeg: 19.667614546272222,
  });
  assert.equal(materialFrame.target.combatLoadedRollUnloadActive, true,
    "the ordinary 25%-aileron predicate must still unload a genuinely material transfer");
  assert.equal(materialFrame.pitch, -0.10);
});

test("Tape 481 defers a material fresh finisher handoff until the loaded pursuit is ready", () => {
  const state = {
    ...f22LeadPlaneState({
      bankDeg: -56.14,
      rollRateDps: 13.69,
      planeErrorDeg: 14.616807255353075,
      offBoresightDeg: 54.56338338612703,
      gammaDeg: -10.63,
    }),
    range_m: 960.7,
    closure_kts: 309.3,
    g_actual: 8.259,
    aoa_deg: 11.96,
    requested_g_cmd: 8.36,
    g_cmd: 8.36,
  };
  const loaded = fixedWingAiCommand(state, "f22", createFixedWingAiControllerState());
  assert.equal(loaded.target.gunLeadFinisherFreshLoadedEntryDeferred, true);
  assert.equal(loaded.target.gunLeadFinisherActive, false,
    "final-axis control cannot discard an established pull for a material fresh plane change");
  assert.equal(loaded.target.combatLoadedRollUnloadActive, false);
  assert.ok(loaded.target.desiredLoadFactorG > 8);
  assert.ok(loaded.pitch > 0.85);

  const unloaded = fixedWingAiCommand({
    ...state,
    g_actual: 1.2,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(unloaded.target.gunLeadFinisherFreshLoadedEntryDeferred, false);
  assert.equal(unloaded.target.gunLeadFinisherActive, true,
    "the same geometry may establish its new lift plane once physically unloaded");
});

test("Tape 489 holds its loaded lift plane through the imminent gun pass", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = -63.9;
  const commandAt = ({
    bankDeg,
    rollRateDps,
    planeErrorDeg,
    offBoresightDeg,
    rangeM,
    closureKts,
    actualG,
  }) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg,
      gammaDeg: -15,
    }),
    range_m: rangeM,
    closure_kts: closureKts,
    g_actual: actualG,
    aoa_deg: 12,
    requested_g_cmd: 8.36,
    g_cmd: 8.36,
  }, "f22", controllerState);

  const entry = commandAt({
    bankDeg: -53.17,
    rollRateDps: 17.26,
    planeErrorDeg: 12.777,
    offBoresightDeg: 12.984,
    rangeM: 397.5,
    closureKts: 660.4,
    actualG: 8.322,
  });
  assert.equal(entry.target.gunLeadImminentPassBankHoldActive, true);
  assert.equal(entry.target.desiredBankDeg, -53.17);
  assert.equal(entry.target.combatLoadedRollUnloadActive, false,
    "less than one second from CPA, a rotating lead plane cannot discard the established pull");
  assert.ok(entry.roll < 0 && Math.abs(entry.roll) < 0.25,
    "the committed lift plane should rate-damp the existing roll without accelerating it");
  assert.ok(entry.target.desiredLoadFactorG > 8 && entry.pitch > 0.85);

  const held = commandAt({
    bankDeg: -52.3,
    rollRateDps: 0.85,
    planeErrorDeg: 23.849,
    offBoresightDeg: 9.335,
    rangeM: 362.4,
    closureKts: 676.9,
    actualG: 7.992,
  });
  assert.equal(held.target.gunLeadImminentPassBankHoldActive, true,
    "the hold must outlive the rapidly rotating transverse plane it was introduced to ignore");
  assert.equal(held.target.desiredBankDeg, -52.3);
  assert.equal(held.target.combatLoadedRollUnloadActive, false);
  assert.ok(held.target.desiredLoadFactorG > 8);

  const opening = commandAt({
    bankDeg: -52.3,
    rollRateDps: 0.85,
    planeErrorDeg: 30,
    offBoresightDeg: 10,
    rangeM: 380,
    closureKts: -100,
    actualG: 7.5,
  });
  assert.equal(opening.target.gunLeadImminentPassBankHoldActive, false,
    "the committed plane must release once the pass is opening");
  assert.equal(opening.target.combatLoadedRollUnloadActive, true,
    "ordinary loaded-roll protection resumes after the imminent pass");

  const divergingController = createFixedWingAiControllerState();
  divergingController.gunLeadFinisherActive = true;
  divergingController.gunLeadFinisherEntryBankDeg = -63.9;
  const diverging = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -53.17,
      rollRateDps: -17.26,
      planeErrorDeg: 12.777,
      offBoresightDeg: 12.984,
      gammaDeg: -15,
    }),
    range_m: 397.5,
    closure_kts: 660.4,
    g_actual: 8.322,
    aoa_deg: 12,
    requested_g_cmd: 8.36,
    g_cmd: 8.36,
  }, "f22", divergingController);
  assert.equal(diverging.target.gunLeadImminentPassBankHoldActive, false,
    "an equally fast roll away from the lead plane is not an established plane to preserve");
  assert.equal(diverging.target.combatLoadedRollUnloadActive, true);

  const staleHoldController = createFixedWingAiControllerState();
  staleHoldController.gunLeadFinisherActive = true;
  staleHoldController.gunLeadFinisherEntryBankDeg = -63.9;
  staleHoldController.gunLeadImminentPassBankHoldActive = true;
  const staleHold = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -53.17,
      rollRateDps: 0,
      planeErrorDeg: 12.777,
      offBoresightDeg: 12.984,
      gammaDeg: -15,
    }),
    range_m: 700,
    closure_kts: 100,
    g_actual: 8.322,
    aoa_deg: 12,
    requested_g_cmd: 8.36,
    g_cmd: 8.36,
  }, "f22", staleHoldController);
  assert.equal(staleHold.target.gunLeadImminentPassBankHoldActive, false,
    "the pass hold cannot survive for many seconds on a merely positive closure rate");
});

test("Tape 493 keeps a pitch-dominated approach loaded instead of chasing transverse angle", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = 59.79;
  const commandAt = ({
    bankDeg,
    rollRateDps,
    planeErrorDeg,
    offBoresightDeg,
    rangeM,
    closureKts,
    actualG,
  }) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg,
      gammaDeg: -1.86,
    }),
    range_m: rangeM,
    closure_kts: closureKts,
    g_actual: actualG,
    aoa_deg: 16.06,
    requested_g_cmd: 7.2,
    g_cmd: 7.2,
  }, "f22", controllerState);

  const entry = commandAt({
    bankDeg: 42.37,
    rollRateDps: -8.28,
    planeErrorDeg: -16.70782324380249,
    offBoresightDeg: 7.059238054384278,
    rangeM: 1_117.9,
    closureKts: 304.2,
    actualG: 7.049,
  });
  assert.equal(entry.target.gunLeadPitchDominatedApproachBankHoldActive, true);
  assert.equal(entry.target.gunLeadImminentPassBankHoldActive, true);
  assert.ok(Math.abs(entry.target.desiredBankDeg - 42.37) < 0.01);
  assert.equal(entry.target.combatLoadedRollUnloadActive, false,
    "a two-degree body-right miss cannot discard an established seven-G pitch conversion");
  assert.ok(entry.target.desiredLoadFactorG > 6);

  const held = commandAt({
    bankDeg: 41.9,
    rollRateDps: -4,
    planeErrorDeg: -25,
    offBoresightDeg: 7,
    rangeM: 1_050,
    closureKts: 330,
    actualG: 6.8,
  });
  assert.equal(held.target.gunLeadPitchDominatedApproachBankHoldActive, true,
    "the narrow Cartesian shoulder should remain loaded while lateral miss stays bounded");
  assert.equal(held.target.combatLoadedRollUnloadActive, false);
  assert.ok(held.target.desiredLoadFactorG > 6);

  const lateralExit = commandAt({
    bankDeg: 41.9,
    rollRateDps: -4,
    planeErrorDeg: -20,
    offBoresightDeg: 10,
    rangeM: 1_000,
    closureKts: 330,
    actualG: 6.5,
  });
  assert.equal(lateralExit.target.gunLeadPitchDominatedApproachBankHoldActive, false,
    "a material body-right miss must return authority to the protected roll transfer");
  assert.equal(lateralExit.target.combatLoadedRollUnloadActive, true);
});

test("Tape 483 final-axis tracking uses wing lift instead of living on the overbank guard", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = 70.81;
  controllerState.gunLeadFinisherHalfRollSign = 1;
  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 83.84,
      rollRateDps: -1.54,
      planeErrorDeg: 12.717676874597013,
      offBoresightDeg: 10.712394157147804,
      gammaDeg: 8.48,
    }),
    range_m: 990.1,
    closure_kts: 148.6,
    g_actual: 5.872,
    aoa_deg: 10.8,
    requested_g_cmd: 8.36,
    g_cmd: 8.36,
  }, "f22", controllerState);
  assert.equal(command.target.gunLeadFinisherActive, true);
  assert.equal(command.target.gunLeadFinisherBoundedBankTargetDeg, 78);
  assert.equal(command.target.gunLeadFinisherOverbankGuardActive, false);
  assert.equal(command.target.combatLoadedRollUnloadActive, false);
  assert.ok(command.target.desiredLoadFactorG > 8,
    "the sustainable lift plane must keep converting the near-axis attack");
  assert.ok(command.pitch > 0.85);
  assert.ok(command.roll < 0 && Math.abs(command.roll) < 0.25,
    "the bank reduction must be a loaded inward trim, not another unload/re-roll");
});

test("Tape 484 keeps pull through a captured pitch-axis tracking trim", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = -73.61;
  controllerState.gunLeadRollCaptureActive = true;
  controllerState.gunLeadRollCaptureBankDeg = -73.61;
  controllerState.gunLeadCapturedFineRollActive = true;
  controllerState.gunLeadPitchDominatedFineCaptureActive = true;
  controllerState.gunLeadLastLateralErrorDeg = 0.40260405499569196;

  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -72.53,
      rollRateDps: 2.35,
      planeErrorDeg: 11.366021163678504,
      offBoresightDeg: 2.349813323609807,
      gammaDeg: -6.41,
    }),
    range_m: 1_021.2,
    closure_kts: 47,
    g_actual: 5.387,
    aoa_deg: 11.1,
    requested_g_cmd: 4.998,
    g_cmd: 4.998,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 3.331,
  }, "f22", controllerState);

  assert.equal(command.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(command.target.gunLeadCapturedPitchLoadedTrimActive, true);
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "an 11-dps Cartesian correction cannot discard the established gun-axis pull");
  assert.ok(command.target.desiredLoadFactorG > 3,
    "captured pitch tracking must keep a real pull instead of the 0.8-G unload");
  assert.ok(command.roll > 0 && command.roll < 0.20,
    "the settled body-right correction must stay a bounded loaded trim");

  const closeControllerState = createFixedWingAiControllerState();
  closeControllerState.gunLeadFinisherActive = true;
  closeControllerState.gunLeadFinisherEntryBankDeg = -59.6489;
  closeControllerState.gunLeadRollCaptureActive = true;
  closeControllerState.gunLeadRollCaptureBankDeg = -58.73;
  closeControllerState.gunLeadCapturedFineRollActive = true;
  closeControllerState.gunLeadPitchDominatedFineCaptureActive = true;
  closeControllerState.gunLeadLastLateralErrorDeg = 0.4448270106913975;
  const closeCommand = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -58.73,
      rollRateDps: 0.15,
      planeErrorDeg: 8.172350960257203,
      offBoresightDeg: 3.455005210449163,
      gammaDeg: 26.02,
    }),
    range_m: 581.3,
    closure_kts: 230.2,
    g_actual: 7.674,
    aoa_deg: 14.44,
    requested_g_cmd: 2.889,
    g_cmd: 2.889,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 6.555,
  }, "f22", closeControllerState);
  assert.equal(closeCommand.target.gunLeadCapturedPitchLoadedTrimActive, true);
  assert.equal(closeCommand.target.combatLoadedRollUnloadActive, false);
  assert.ok(closeCommand.target.desiredLoadFactorG > 5);
  assert.ok(closeCommand.roll > 0 && closeCommand.roll < 0.20);
});

test("Tape 485 applies the loaded overbank guard during ordinary pursuit", () => {
  const commandAt = ({ bankDeg, rollRateDps }) => fixedWingAiCommand(
    f22FinisherState({
      lead_valid: false,
      bank_deg: bankDeg,
      roll_rate_dps: rollRateDps,
      gamma_deg: 9.96,
      g_actual: 5.296,
      aoa_deg: 11,
      requested_g_cmd: 5.439,
      g_cmd: 5.439,
    }),
    "f22",
    createFixedWingAiControllerState(),
  );

  const crossed = commandAt({ bankDeg: 84.01, rollRateDps: -2.96 });
  assert.equal(crossed.target.gunLeadFinisherActive, false);
  assert.equal(crossed.target.combatDefensiveBreakControlOwned, false);
  assert.equal(crossed.target.combatGenericOverbankGuardActive, true);
  assert.equal(crossed.target.desiredLoadFactorG, 0.8,
    "the physical 84-degree limit must not depend on the tactical control owner");
  assert.equal(crossed.pitch, -0.10);

  const inward = commandAt({ bankDeg: 83.9, rollRateDps: -3 });
  assert.equal(inward.target.combatGenericOverbankGuardActive, false,
    "an already-inward turn below the limit keeps its ordinary pursuit pull");

  const projected = commandAt({ bankDeg: 83.9, rollRateDps: 4 });
  assert.equal(projected.target.combatGenericOverbankGuardActive, true,
    "outward momentum must unload before the loaded wing crosses the limit");
});

test("Tape 459 brakes a settled close pass before stale pitch-rate telemetry catches up", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  const commandAt = ({
    rangeM = 190.5,
    closureKts = 60,
    planeErrorDeg = -2.04,
    offBoresightDeg = 11.937,
    rollRateDps = -0.39,
  } = {}) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -42,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg,
    }),
    range_m: rangeM,
    closure_kts: closureKts,
    g_actual: 1.978,
    aoa_deg: 7,
    requested_g_cmd: 6.7,
    g_cmd: 6.7,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 0,
  }, "f22", controllerState);

  const approach = commandAt();
  assert.equal(approach.target.gunLeadFinisherActive, true);
  assert.equal(approach.target.gunLeadPitchAxisApproachBrakeActive, false,
    "the old rate-evidence brake must remain inactive on Tape 459's stale zero");
  assert.equal(approach.target.gunLeadCloseApproachBrakeActive, true);
  assert.ok(Math.abs(approach.target.leadLateralErrorDeg + 0.4248) < 0.01);
  assert.ok(Math.abs(approach.target.desiredLoadFactorG - 1.9) < 1e-9,
    `settled close approach retained ${approach.target.desiredLoadFactorG.toFixed(3)} G`);

  const crossing = commandAt({
    rangeM: 187.2,
    closureKts: 37,
    planeErrorDeg: -10.42,
    offBoresightDeg: 7.725,
  });
  assert.ok(Math.abs(crossing.target.leadLateralErrorDeg) > 0.8,
    "the replay must leave the narrow entry corridor after the pipper starts crossing");
  assert.equal(crossing.target.gunLeadCloseApproachBrakeActive, true,
    "the geometric brake must remain latched through the immediate axis crossing");
  assert.ok(crossing.target.desiredLoadFactorG <= 1.9 + 1e-9);

  const departed = commandAt({
    rangeM: 180,
    closureKts: 37,
    planeErrorDeg: -20,
    offBoresightDeg: 15.01,
  });
  assert.equal(departed.target.gunLeadCloseApproachBrakeActive, false,
    "the close brake must release once the crossing leaves its bounded hold corridor");

  const highClosureController = createFixedWingAiControllerState();
  highClosureController.gunLeadFinisherActive = true;
  const highClosure = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -42,
      rollRateDps: 0,
      planeErrorDeg: -2,
      offBoresightDeg: 11,
    }),
    range_m: 300,
    closure_kts: 450,
    g_actual: 1.8,
    aoa_deg: 6,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 0,
  }, "f22", highClosureController);
  assert.equal(highClosure.target.gunLeadCloseApproachBrakeActive, false,
    "a fast conversion must remain owned by the existing high-closure controller");

  const widePlaneController = createFixedWingAiControllerState();
  widePlaneController.gunLeadFinisherActive = true;
  const widePlane = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -42,
      rollRateDps: 0,
      planeErrorDeg: -9,
      offBoresightDeg: 5,
    }),
    range_m: 300,
    closure_kts: 60,
    g_actual: 1.8,
    aoa_deg: 6,
    g_maxperform: 9,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 0,
  }, "f22", widePlaneController);
  assert.equal(widePlane.target.gunLeadCloseApproachBrakeActive, false,
    "an unsettled lift plane must not gain close-pass pitch ownership");
});

test("Tape 463 prearms the close-pass brake from measured carried G", () => {
  const state = {
    ...f22LeadPlaneState({
      bankDeg: -75.25,
      rollRateDps: -1.91,
      planeErrorDeg: -2.4714214589570713,
      offBoresightDeg: 7.38398324550403,
    }),
    range_m: 479,
    closure_kts: 14.5,
    g_actual: 8.502,
    aoa_deg: 11.7,
    requested_g_cmd: 8.318,
    g_cmd: 8.318,
    g_maxperform: 9,
    gunnery_pitch_assist: false,
    gunnery_pitch_rate_error_dps: 0,
  };
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  const prearmed = fixedWingAiCommand(state, "f22", controllerState);
  assert.equal(prearmed.target.gunLeadCloseApproachBrakeActive, true,
    "8.5 G of measured carried load must not wait one more frame for the assist bit");
  assert.ok(Math.abs(prearmed.target.desiredLoadFactorG - 1.9) < 1e-9);

  const lowLoadController = createFixedWingAiControllerState();
  lowLoadController.gunLeadFinisherActive = true;
  const unassistedLowLoad = fixedWingAiCommand({
    ...state,
    g_actual: 3,
  }, "f22", lowLoadController);
  assert.equal(unassistedLowLoad.target.gunLeadCloseApproachBrakeActive, false,
    "low-G tracking cannot acquire the brake without production assist authority");

  const assisted = fixedWingAiCommand({
    ...state,
    g_actual: 3,
    gunnery_pitch_assist: true,
  }, "f22", lowLoadController);
  assert.equal(assisted.target.gunLeadCloseApproachBrakeActive, true,
    "the ordinary production assist path remains unchanged");
});

test("Tape 441 pitch capture retains only bounded lateral lead-motion feed-forward", () => {
  const controllerState = createFixedWingAiControllerState();
  const tape441 = ({
    offBoresightDeg,
    planeErrorDeg,
    liftErrorDeg,
    closureKts = 665.9,
  }) => {
    const command = fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: -42.15,
        rollRateDps: 0,
        planeErrorDeg,
        offBoresightDeg,
      }),
      closure_kts: closureKts,
      g_maxperform: 6.28,
      gunnery_pitch_assist: true,
    }, "f22", controllerState);
    assert.ok(Math.abs(command.target.leadLiftErrorDeg - liftErrorDeg) < 1e-9);
    return command;
  };

  const firstGeometry = {
    offBoresightDeg: 1.8779851863368573,
    planeErrorDeg: 13.873981260322921,
    liftErrorDeg: 1.8231958550914136,
  };
  tape441({ ...firstGeometry, closureKts: 640 });
  tape441(firstGeometry);
  const movingLead = tape441({
    offBoresightDeg: 1.8734766017654116,
    planeErrorDeg: 14.938796495908543,
    liftErrorDeg: 1.8101563643544503,
  });
  const expectedFeedForwardDps = 0.032641271926977355 * 30;
  assert.equal(movingLead.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(Math.abs(movingLead.target.desiredLoadFactorG - 3) < 1e-9);
  assert.ok(Math.abs(
    movingLead.target.gunLeadCartesianRollFeedForwardDps - expectedFeedForwardDps,
  ) < 1e-9);
  assert.ok(Math.abs(
    movingLead.target.gunLeadCartesianRollRateDps - expectedFeedForwardDps,
  ) < 1e-9, "pitch isolation may retain feed-forward but not Cartesian P or integral demand");
  assert.equal(movingLead.target.gunLeadCartesianRollBiasRateDps, 0);
  assert.ok(movingLead.roll > 0 && movingLead.roll < 0.03,
    `bounded moving-lead correction commanded ${movingLead.roll.toFixed(3)} roll`);

  const settledCone = tape441({
    offBoresightDeg: 0.75,
    planeErrorDeg: 0,
    liftErrorDeg: 0.75,
  });
  assert.equal(settledCone.target.gunLeadPitchDominatedFineCapture, true,
    "high-closure isolation should remain latched through the cone handoff");
  assert.equal(settledCone.target.gunLeadCartesianRollFeedForwardDps, 0);
  assert.equal(settledCone.target.gunLeadCartesianRollRateDps, 0,
    "the >0.8-degree moving-lead exception must release before the gun cone");
  assert.ok(settledCone.target.desiredLoadFactorG < 3,
    "roll isolation must not keep the high-closure G floor below 0.8 degrees");
});

test("Tape 495 preserves a captured high-closure cone while lateral inertia decays", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadFinisherEntryBankDeg = -65.7;
  controllerState.gunLeadFinisherHalfRollSign = -1;
  controllerState.gunLeadRollCaptureActive = true;
  controllerState.gunLeadRollCaptureBankDeg = -65.66;
  controllerState.gunLeadCapturedFineRollActive = true;
  controllerState.gunLeadPitchDominatedFineCaptureActive = true;
  controllerState.gunLeadLastLateralErrorDeg = -0.22454897;
  controllerState.gunLeadLastLiftErrorDeg = 1.64708303;

  const frames = [
    [-63.47, 4.23, -12.9080, 1.308689, -16.83, 963.3, 502.4,
      4.661, 12.24, 2.994, true, -3.172],
    [-63.22, 6.54, -36.3567, 0.720387, -16.70, 950.3, 504.7,
      4.386, 11.49, 3.004, true, -4.310],
    [-62.89, 7.41, -64.3298, 0.546735, -16.58, 937.2, 506.8,
      4.121, 10.78, 1.937, true, -4.832],
    [-62.48, 6.92, -90.6707, 0.577855, -16.44, 919.6, 509.4,
      3.704, 9.66, 1.340, true, -1.378],
    [-62.29, 3.47, -95.7389, 0.623068, -16.35, 906.4, 511.4,
      3.368, 8.77, 1.040, false, 0],
  ];
  const commands = frames.map(([
    bankDeg, rollRateDps, planeErrorDeg, offBoresightDeg, gammaDeg,
    rangeM, closureKts, actualG, aoaDeg, requestedG, assist, pitchRateErrorDps,
  ]) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg,
      gammaDeg,
    }),
    bandit_entity_id: "entity.bandit.2",
    range_m: rangeM,
    closure_kts: closureKts,
    g_actual: actualG,
    aoa_deg: aoaDeg,
    requested_g_cmd: requestedG,
    g_cmd: requestedG,
    g_maxperform: 9,
    gunnery_pitch_assist: assist,
    gunnery_pitch_rate_error_dps: pitchRateErrorDps,
  }, "f22", controllerState));

  for (const command of commands.slice(0, 4)) {
    assert.equal(command.target.gunLeadHighClosureConeRecoveryActive, true);
    assert.ok(command.target.gunLeadPitchIsolationRecenterRateDps < 0);
    assert.ok(Math.abs(command.target.gunLeadPitchIsolationRecenterRateDps) <= 10);
    assert.equal(command.target.combatLoadedRollUnloadActive, false);
  }
  assert.ok(commands[3].pitch >= 0,
    "the controller cannot revoke its own incumbent capture with a pilot-unload command");
  const assistDrop = commands[4];
  assert.equal(assistDrop.target.gunLeadHighClosureConeRecoveryActive, true);
  assert.equal(assistDrop.target.gunLeadPitchDominatedFineCapture, true,
    "the incumbent cone survives one production PILOT_UNLOAD echo from the prior command");
  assert.equal(assistDrop.target.combatLoadedRollUnloadActive, false,
    "the bounded ten-degree-per-second correction remains a safe loaded trim");
  assert.ok(assistDrop.pitch >= 0);
});

test("Tape 449 opening pitch capture follows measured lead motion instead of freezing bank", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadRollCaptureActive = true;
  controllerState.gunLeadRollCaptureBankDeg = 0;
  controllerState.gunLeadCapturedFineRollActive = true;
  controllerState.gunLeadPitchDominatedFineCaptureActive = true;
  controllerState.gunLeadLastLateralErrorDeg = 0.7818686457675983;

  const commandAt = (planeErrorDeg, offBoresightDeg) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg,
      offBoresightDeg,
    }),
    closure_kts: -151.3,
    gunnery_pitch_assist: true,
  }, "f22", controllerState);

  const approachingAxis = commandAt(11.14694020522192, 1.2355992596665366);
  assert.equal(approachingAxis.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(approachingAxis.target.leadLateralErrorDeg > 0.23
    && approachingAxis.target.leadLateralErrorDeg < 0.25);
  assert.equal(approachingAxis.target.gunLeadCartesianRollFeedForwardDps, -10);
  assert.equal(approachingAxis.target.gunLeadCartesianRollRateDps, -10,
    "an opening pass still needs bounded lead-motion rate while pitch owns the lift miss");

  const crossedAxis = commandAt(-14.985183253711972, 1.2150180982884904);
  assert.equal(crossedAxis.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(crossedAxis.target.leadLateralErrorDeg < -0.30
    && crossedAxis.target.leadLateralErrorDeg > -0.33);
  assert.equal(crossedAxis.target.gunLeadCartesianRollFeedForwardDps, -10);
  assert.equal(crossedAxis.target.gunLeadCartesianRollRateDps, -10,
    "the Tape 449 crossing must not release into a 30-degree-per-second correction one tick late");
});

test("Tape 457 pitch isolation recenters a material low-closure miss moving away", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadRollCaptureActive = true;
  controllerState.gunLeadRollCaptureBankDeg = 0;
  controllerState.gunLeadCapturedFineRollActive = true;
  controllerState.gunLeadPitchDominatedFineCaptureActive = true;
  controllerState.gunLeadLastLateralErrorDeg = 0.31617111276895954;

  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0.67,
      planeErrorDeg: 20.8114177942767,
      offBoresightDeg: 1.1516026238792336,
    }),
    range_m: 1_326.5,
    closure_kts: -24.4,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 2.368,
  }, "f22", controllerState);

  assert.equal(command.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(Math.abs(
    command.target.leadLateralErrorDeg - 0.4091566339299521,
  ) < 1e-9);
  assert.ok(Math.abs(
    command.target.gunLeadCartesianRollFeedForwardDps - 2.789565634829777,
  ) < 1e-9, "measured lead-motion feed-forward must remain independently observable");
  const expectedRecenterRateDps = command.target.leadLateralErrorDeg * 20;
  assert.ok(Math.abs(
    command.target.gunLeadPitchIsolationRecenterRateDps - expectedRecenterRateDps,
  ) < 1e-9);
  assert.ok(Math.abs(
    command.target.gunLeadCartesianRollRateDps
      - (2.789565634829777 + expectedRecenterRateDps),
  ) < 1e-9);
  assert.ok(command.roll > 0.08 && command.roll < 0.10,
    `bounded recenter produced ${command.roll.toFixed(3)} roll`);

  const convergingState = createFixedWingAiControllerState();
  convergingState.gunLeadFinisherActive = true;
  convergingState.gunLeadRollCaptureActive = true;
  convergingState.gunLeadRollCaptureBankDeg = 0;
  convergingState.gunLeadCapturedFineRollActive = true;
  convergingState.gunLeadPitchDominatedFineCaptureActive = true;
  convergingState.gunLeadLastLateralErrorDeg = 0.5;
  const converging = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 20.8114177942767,
      offBoresightDeg: 1.1516026238792336,
    }),
    range_m: 1_326.5,
    closure_kts: -24.4,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 2.368,
  }, "f22", convergingState);
  assert.equal(converging.target.gunLeadPitchIsolationRecenterRateDps, 0,
    "an axis already moving toward zero must retain feed-forward-only isolation");
});

test("F-22 pitch-dominated capture holds the lift plane while pitch converges", () => {
  const controllerState = createFixedWingAiControllerState();
  const pitchDominated = (rollRateDps = -1.2) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps,
      planeErrorDeg: -9,
      offBoresightDeg: 1.95,
    }),
    gunnery_pitch_assist: true,
  }, "f22", controllerState);

  const entered = pitchDominated();
  assert.equal(entered.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(entered.target.leadLateralErrorDeg < -0.3);
  assert.ok(entered.target.leadLiftErrorDeg > 1.9);
  assert.equal(entered.target.gunLeadCartesianRollRateDps, 0,
    "the newly-earned pitch latch must isolate roll on its first physical command");
  assert.equal(entered.target.gunLeadCartesianRollBiasRateDps, 0,
    "fine-roll bias cannot wind once the current frame declares pitch ownership");

  const isolated = pitchDominated();
  assert.equal(isolated.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(isolated.target.gunLeadCartesianRollActive, true);
  assert.equal(isolated.target.gunLeadCartesianRollRateDps, 0,
    "pitch capture must not walk a previously-small lateral miss out of the cone");
  assert.equal(isolated.target.gunLeadCartesianRollFeedForwardDps, 0);
  assert.equal(isolated.target.gunLeadCartesianRollBiasRateDps, 0,
    "the fine integrator cannot wind up while roll is isolated");
  assert.ok(isolated.roll > 0 && isolated.roll < 0.05,
    "zero desired rate must gently brake the existing left roll");
});

test("F-22 high-closure capture holds its lift plane through the qualified-gun crossing", () => {
  const controllerState = createFixedWingAiControllerState();
  const tape435 = ({ planeErrorDeg, offBoresightDeg, rollRateDps = -0.4 }) =>
    fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 45,
        rollRateDps,
        planeErrorDeg,
        offBoresightDeg,
      }),
      closure_kts: 590,
      gunnery_pitch_assist: true,
    }, "f22", controllerState);

  const entered = tape435({ planeErrorDeg: -6, offBoresightDeg: 1.9 });
  assert.equal(entered.target.gunLeadPitchDominatedFineCapture, true);

  const approachingCone = tape435({ planeErrorDeg: -7.12, offBoresightDeg: 0.69 });
  assert.equal(approachingCone.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(approachingCone.target.gunLeadCartesianRollRateDps, 0);

  const insideCone = tape435({ planeErrorDeg: -50.8, offBoresightDeg: 0.36 });
  assert.equal(insideCone.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(insideCone.target.gunLeadCartesianRollRateDps, 0,
    "the one-tick qualified-cue handoff cannot restart lateral conversion");

  const justPastLiftAxis = tape435({ planeErrorDeg: -98.5, offBoresightDeg: 0.55 });
  assert.equal(justPastLiftAxis.target.gunLeadPitchDominatedFineCapture, true);
  assert.equal(justPastLiftAxis.target.gunLeadCartesianRollRateDps, 0);

  const released = tape435({ planeErrorDeg: -109.7, offBoresightDeg: 0.79 });
  assert.equal(released.target.gunLeadPitchDominatedFineCapture, false,
    "isolation must release once the lift-axis crossing is unambiguously complete");
});

test("Tape 439 pitch isolation cannot damp a positive lift miss into pilot unload", () => {
  const controllerState = createFixedWingAiControllerState();
  const isolated = (offBoresightDeg) => fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg,
    }),
    closure_kts: 596,
    gunnery_pitch_assist: true,
  }, "f22", controllerState);

  const entered = isolated(1.2);
  assert.equal(entered.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(entered.pitch > 0);

  const tape439 = isolated(0.725);
  assert.equal(tape439.target.gunLeadPitchDominatedFineCapture, true);
  assert.ok(Math.abs(tape439.target.leadLiftErrorDeg - 0.725) < 1e-9);
  assert.ok(Math.abs(tape439.target.leadLiftErrorDeltaDeg + 0.475) < 1e-9);
  assert.equal(tape439.target.gunLeadLiftDampingCommand, -0.12);
  assert.equal(tape439.pitch, 0,
    "a damping-only brake may reach neutral but cannot declare PILOT_UNLOAD above the gun line");
  assert.equal(tape439.target.gunLeadCartesianRollRateDps, 0,
    "neutral pitch must retain the already-owned lateral isolation");
});

test("F-22 captured pitch brakes a signed lift crossing before the gun axis", () => {
  const controllerState = createFixedWingAiControllerState();
  const first = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 17,
      offBoresightDeg: 0.5,
    }),
    bandit_entity_id: "lead-one",
  }, "f22", controllerState);
  assert.equal(first.target.gunLeadRollCaptureActive, true);
  assert.ok(first.target.leadLiftErrorDeg > 0.47);
  assert.equal(first.target.leadLiftErrorDeltaDeg, 0);
  assert.equal(first.target.gunLeadLiftDampingCommand, 0);

  const braking = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 69,
      offBoresightDeg: 0.2,
    }),
    bandit_entity_id: "lead-one",
  }, "f22", controllerState);
  assert.ok(braking.target.leadLiftErrorDeg > 0.07);
  assert.ok(braking.target.leadLiftErrorDeltaDeg < -0.39);
  assert.equal(braking.target.gunLeadLiftDampingCommand, -0.12);
  assert.ok(braking.pitch < -0.1,
    "the bot must begin unloading before signed lift error crosses zero");

  const changedTarget = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: 17,
      offBoresightDeg: 0.5,
    }),
    bandit_entity_id: "lead-two",
  }, "f22", controllerState);
  assert.equal(changedTarget.target.leadLiftErrorDeltaDeg, 0,
    "a promoted target cannot inherit pitch damping from the previous actor");
});

test("F-22 near-axis conversion stages pitch damping before full captured-axis authority", () => {
  const maximumG = 9;
  const shoulder = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 65,
      rollRateDps: -18,
      planeErrorDeg: 0,
      offBoresightDeg: 4,
    }),
    g_maxperform: maximumG,
    gunnery_pitch_assist: true,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(shoulder.target.gunLeadRollCaptureActive, false);
  assert.equal(shoulder.target.gunLeadCartesianRollActive, true);
  assert.ok(Math.abs(
    fixedWingLoadFactorForPitch(shoulder.pitch, maximumG) - 3,
  ) < 1e-9);

  const assisted = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 65,
      rollRateDps: -18,
      planeErrorDeg: 0,
      offBoresightDeg: 2.4,
    }),
    g_maxperform: maximumG,
    gunnery_pitch_assist: true,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(assisted.target.gunLeadRollCaptureActive, false);
  assert.equal(assisted.target.gunLeadCartesianRollActive, true);
  assert.ok(Math.abs(
    fixedWingLoadFactorForPitch(assisted.pitch, maximumG) - 1.9,
  ) < 1e-9);
});

test("F-22 high-closure Cartesian entry brakes pitch one sample before fine capture", () => {
  const tape434Entry = {
    ...f22LeadPlaneState({
      bankDeg: 80.31,
      rollRateDps: 8.5,
      planeErrorDeg: 6.1269,
      offBoresightDeg: 5.1526,
    }),
    g_maxperform: 8.36,
    gunnery_pitch_assist: true,
  };
  const lowClosure = fixedWingAiCommand({
    ...tape434Entry,
    closure_kts: 120,
  }, "f22", createFixedWingAiControllerState());
  const highClosure = fixedWingAiCommand({
    ...tape434Entry,
    closure_kts: 603,
  }, "f22", createFixedWingAiControllerState());

  assert.equal(highClosure.target.gunLeadCartesianRollActive, true);
  assert.equal(highClosure.target.gunLeadRollCaptureActive, false);
  assert.ok(lowClosure.target.desiredLoadFactorG > 4.5,
    "ordinary low-closure conversion retains its prior pitch authority");
  assert.ok(Math.abs(highClosure.target.desiredLoadFactorG - 3) < 1e-9,
    "the high-closure pass must enter the existing 3 G shoulder before fine capture");
});

test("F-22 captured bank settles the measured plant without a limit cycle", () => {
  const controllerState = createFixedWingAiControllerState();
  const capturePoint = {
    bankDeg: 78.70,
    rollRateDps: -3.81,
    planeErrorDeg: -3.44,
    offBoresightDeg: 5.93,
  };
  fixedWingAiCommand(f22LeadPlaneState(capturePoint), "f22", controllerState);
  const captured = fixedWingAiCommand(
    f22LeadPlaneState(capturePoint), "f22", controllerState,
  );
  assert.equal(captured.target.gunLeadRollCaptureActive, true);
  const dtS = FIXED_WING_AI_SAMPLE_MS / 1_000;
  let bankDeg = 79;
  let rollRateDps = -6.4;
  const samples = [];
  for (let step = 0; step < 120; step += 1) {
    const command = fixedWingAiCommand(f22LeadPlaneState({
      bankDeg,
      rollRateDps,
      planeErrorDeg: 0,
      offBoresightDeg: 5,
    }), "f22", controllerState);
    samples.push({
      wallS: step * dtS,
      aiRollCommand: command.roll,
      aiDesiredBankDeg: command.target.desiredBankDeg,
      bankDeg,
      rollRateDps,
    });
    rollRateDps = 0.72 * rollRateDps + 64 * command.roll;
    bankDeg += rollRateDps * dtS;
  }
  assert.ok(Math.abs(bankDeg - 79) <= 1.25,
    `zero lateral error should arrest the roll near its aligned bank, got ${bankDeg.toFixed(2)}`);
  assert.ok(Math.abs(rollRateDps) < 0.25,
    `captured roll rate remained ${rollRateDps.toFixed(2)} dps`);
  assert.ok(rollCommandChatterStats(samples).reversals <= 1);
  assert.equal(physicalRollRockingStats(samples).violatingWindows, 0);
});

test("F-22 watchdog rejects a near-axis plane flip before capture", () => {
  const controllerState = createFixedWingAiControllerState();
  const samples = Array.from({ length: 101 }, (_, index) => {
    const command = fixedWingAiCommand(f22LeadPlaneState({
      bankDeg: 75,
      rollRateDps: 0,
      planeErrorDeg: index % 2 === 0 ? 25 : -25,
      offBoresightDeg: 5,
    }), "f22", controllerState);
    assert.equal(command.target.gunLeadRollCaptureActive, false);
    return commonSample({
      wallS: index / 20,
      tick: index * 6,
      aiRollCommand: command.roll,
      aiDesiredBankDeg: command.target.desiredBankDeg,
      bankDeg: 75,
      rollRateDps: 0,
    });
  });
  assert.ok(rollCommandChatterStats(samples).maximumReversalRateHz > 0.9);
  assert.match(
    assessFixedWingAiFlight(samples, { mission: "f22" }).failures.join("\n"),
    /roll control chattered/,
  );
});

test("F-22 and first-run gun triggers require a controlled-closure production solution", () => {
  const coarseWindow = {
    closureKts: 120,
    gunSolution: false,
    gunWindow: true,
    rangeM: 600,
    angleOffDeg: 5,
  };
  assert.equal(fixedWingAiGunFireDecision(coarseWindow, "f22"), false,
    "the 359 tape sprayed 683 fallback rounds without a hit");
  assert.equal(fixedWingAiGunFireDecision(coarseWindow, "first-run"), false,
    "the first-run successor must not inherit the legacy coarse-window spray");
  assert.equal(fixedWingAiGunFireDecision(coarseWindow, "top-gun"), true,
    "legacy combat lessons retain their coarse-window policy");
  assert.equal(fixedWingAiGunFireDecision({
    ...coarseWindow, gunSolution: true, gunSolutionRaw: true,
  }, "f22"), true);
  assert.equal(fixedWingAiGunFireDecision({
    ...coarseWindow, gunSolution: true, gunSolutionRaw: true,
  }, "first-run"), true);
  assert.equal(fixedWingAiGunFireDecision({
    ...coarseWindow, gunSolution: true, gunSolutionRaw: false,
  }, "f22"), false,
  "qualified-cue release hysteresis is HUD stability, not current fire authorization");
  assert.equal(fixedWingAiGunFireDecision({
    ...coarseWindow, gunSolution: true, gunSolutionRaw: true, closureKts: 350,
  }, "f22"), true,
  "an exact production solution remains valid during a fast closing pass");
  assert.equal(fixedWingAiGunFireDecision({
    ...coarseWindow, gunSolution: true, gunSolutionRaw: true, closureKts: 1_050,
  }, "f22"), false);
  assert.equal(fixedWingAiGunFireDecision({
    ...coarseWindow, gunSolution: true, gunSolutionRaw: true, closureKts: -250,
  }, "f22"), false);
});

test("strict gun hold needs two live raw-and-qualified authority ticks", () => {
  const controllerState = createFixedWingGunFireState();
  const eligible = {
    tick: 1_200,
    closureKts: 120,
    gunSolutionRaw: true,
    gunSolution: true,
    pilotControlInterlocked: false,
    weaponsCold: false,
    weaponsInhibited: false,
    playerReturnToBaseActive: false,
    autoGcasActive: false,
    aiTerrainEscapeRecovery: false,
    aiTerrainRecoveryPhase: "idle",
    aiVerticalRecoveryPhase: "idle",
    aiInvertedRecoveryActive: false,
    aiCombatDefensiveBreakActive: false,
    aiCombatDownhillSliceActive: false,
    aiCombatDownhillRecoveryPhase: "idle",
  };
  assert.equal(fixedWingAiGunFireHold(eligible, "f22", controllerState), false,
    "a one-frame cone is not worth a burst");
  assert.equal(fixedWingAiGunFireHold({
    ...eligible, tick: 1_206, gunSolutionRaw: false,
  }, "f22", controllerState), false,
  "qualified-cue release hysteresis cannot complete the hold");
  assert.equal(controllerState.eligibleSamples, 0);
  assert.equal(fixedWingAiGunFireHold({
    ...eligible, tick: 1_212,
  }, "f22", controllerState), false);
  assert.equal(fixedWingAiGunFireHold({
    ...eligible, tick: 1_218,
  }, "f22", controllerState), true);
  assert.equal(controllerState.maximumEligibleSamples, 2);
  assert.equal(controllerState.fireCommandUpdates, 1);
  assert.equal(controllerState.firstFireCommandTick, 1_218);

  const recoveryState = createFixedWingGunFireState();
  assert.equal(fixedWingAiGunFireHold({
    ...eligible,
    tick: 1_300,
    aiInvertedRecoveryActive: true,
  }, "f22", recoveryState), false);
  assert.equal(fixedWingAiGunFireHold({
    ...eligible,
    tick: 1_306,
    aiInvertedRecoveryActive: true,
  }, "f22", recoveryState), false,
    "even a held production solution cannot fire while generic recovery owns the jet");
  assert.equal(recoveryState.maximumEligibleSamples, 0);
});

test("heading wrap takes the short turn across north", () => {
  assert.equal(wrapAngleDeg(358), -2);
  assert.equal(wrapAngleDeg(-358), 2);
});

test("gamepad inverse deadzone preserves sign and full travel", () => {
  assert.equal(rawFixedWingGamepadAxis(0), 0);
  assert.equal(rawFixedWingGamepadAxis(1), 1);
  assert.equal(rawFixedWingGamepadAxis(-1), -1);
  assert.ok(rawFixedWingGamepadAxis(0.2) > 0.14);
});

test("gamepad inverse round-trips the production circular two-axis deadzone", () => {
  for (const desired of [
    { roll: 0.08, pitch: 0.72 },
    { roll: -0.08, pitch: 0.72 },
    { roll: 0.55, pitch: -0.35 },
    { roll: -0.7, pitch: -0.7 },
  ]) {
    const raw = rawFixedWingGamepadAxes(desired.roll, desired.pitch);
    const mapped = radialStickAxes(raw.roll, raw.pitch);
    const desiredMagnitude = Math.hypot(desired.roll, desired.pitch);
    const scale = desiredMagnitude > 1 ? 1 / desiredMagnitude : 1;
    assert.ok(Math.abs(mapped.x - desired.roll * scale) < 1e-12);
    assert.ok(Math.abs(mapped.y - desired.pitch * scale) < 1e-12);
  }
  const tinyRoll = rawFixedWingGamepadAxes(0.001, 0.8);
  assert.ok(Math.abs(tinyRoll.roll) < 0.002,
    "held pitch must not turn a tiny roll correction into a deadzone-sized impulse");
});

test("desired G maps exactly through the protected manual pitch contract", () => {
  assert.equal(fixedWingPitchForLoadFactor(1, 9), 0);
  assert.equal(fixedWingPitchForLoadFactor(5, 9), 0.5);
  assert.equal(fixedWingPitchForLoadFactor(12, 9), 1);
  assert.equal(fixedWingPitchForLoadFactor(0, 9), -0.5);
  assert.equal(fixedWingLoadFactorForPitch(0.5, 9), 5);
  assert.equal(fixedWingLoadFactorForPitch(-0.5, 9), 0);
});

test("coordinated turn law commands physical G without pulling past knife-edge", () => {
  assert.ok(Math.abs(fixedWingCoordinatedLoadFactorG(60, 9) - 2) < 1e-12);
  assert.ok(Math.abs(fixedWingCoordinatedLoadFactorG(80, 9) - 3) < 1e-12);
  assert.equal(fixedWingCoordinatedLoadFactorG(120, 9), 1);

  const common = {
    px: 0, py: 3_000, pz: 0,
    bx: 2_000, by: 3_000, bz: 2_000,
    heading_deg: 0, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 500,
    g_maxperform: 9,
    lead_valid: false,
  };
  const level = fixedWingAiCommand({ ...common, bank_deg: 0 }, "rapier");
  assert.equal(level.target.coordinatedLoadFactorG, 1);
  assert.equal(level.target.desiredLoadFactorG, 1);
  assert.equal(level.pitch, 0);

  const banked = fixedWingAiCommand({ ...common, bank_deg: 60 }, "rapier");
  assert.ok(Math.abs(banked.target.coordinatedLoadFactorG - 2) < 1e-12);
  assert.ok(Math.abs(banked.target.desiredLoadFactorG - 2) < 1e-12);
  assert.ok(Math.abs(banked.pitch - 0.125) < 1e-12);

  const lowerEnvelope = fixedWingAiCommand({
    ...common,
    bank_deg: 60,
    g_maxperform: 5,
  }, "rapier");
  assert.ok(Math.abs(lowerEnvelope.target.desiredLoadFactorG - 2) < 1e-12);
  assert.ok(Math.abs(lowerEnvelope.pitch - 0.25) < 1e-12,
    "the same desired G needs more physical stick when the live envelope is lower");

  const combat = fixedWingAiCommand({
    ...common,
    bx: 0,
    bz: -2_000,
    bank_deg: 60,
  }, "f22");
  const combatLowerEnvelope = fixedWingAiCommand({
    ...common,
    bx: 0,
    bz: -2_000,
    bank_deg: 60,
    g_maxperform: 5,
  }, "f22");
  assert.equal(combat.target.desiredLoadFactorG, 7.5);
  assert.equal(combatLowerEnvelope.target.desiredLoadFactorG, 5);
  assert.ok(combatLowerEnvelope.pitch > combat.pitch);

  const radiallyLimited = boundedFixedWingGamepadAxes(1, combat.pitch);
  assert.ok(radiallyLimited.pitch < combat.pitch);
  assert.ok(fixedWingLoadFactorForPitch(radiallyLimited.pitch, 9)
    < combat.target.desiredLoadFactorG,
  "diagnostics must distinguish desired G from what a simultaneous full roll can deliver");
});

test("pursuit controller banks toward the target and pulls toward altitude", () => {
  const command = fixedWingAiCommand({
    px: 0, py: 1_000, pz: 0,
    bx: 2_000, by: 2_000, bz: 2_000,
    heading_deg: 0, bank_deg: 0, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 400,
    lead_valid: false,
  }, "f22");
  assert.ok(command.roll > 0.5);
  assert.ok(command.pitch > 0.2);
  assert.equal(command.throttleUp, true);
});

test("roll controller brakes measured roll rate before it overshoots the target bank", () => {
  const common = {
    px: 0, py: 2_000, pz: 0,
    bx: 2_000, by: 2_000, bz: 2_000,
    heading_deg: 0, bank_deg: 35, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 450,
    lead_valid: false,
  };
  const still = fixedWingAiCommand({ ...common, roll_rate_dps: 0 }, "f22");
  const rolling = fixedWingAiCommand({ ...common, roll_rate_dps: 35 }, "f22");
  assert.ok(rolling.roll < still.roll, "positive body rate must reduce the positive command");

  const targetBankDeg = still.target.desiredBankDeg;
  const braking = fixedWingAiCommand({
    ...common,
    bank_deg: targetBankDeg,
    roll_rate_dps: 24,
  }, "f22");
  assert.ok(braking.roll <= -0.1, "controller must counter-command residual positive roll rate");
  assert.equal(braking.target.desiredRollRateDps, 0);

  const opposite = fixedWingAiCommand({
    ...common,
    bank_deg: -targetBankDeg,
    roll_rate_dps: -24,
    bx: -2_000,
  }, "f22");
  assert.ok(opposite.roll >= 0.1, "roll-rate damping must preserve polarity on the other wing");
});

test("roll-rate noise near the target bank cannot alternate strong stick commands", () => {
  const controllerState = createFixedWingAiControllerState();
  const base = {
    px: 0, py: 2_000, pz: 0,
    bx: 2_000, by: 2_000, bz: 2_000,
    heading_deg: 0, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 450,
    lead_valid: false,
  };
  const desiredBankDeg = fixedWingAiCommand({
    ...base, bank_deg: 0, roll_rate_dps: 0,
  }, "f22", controllerState).target.desiredBankDeg;
  const signs = Array.from({ length: 20 }, (_, index) => fixedWingAiCommand({
    ...base,
    bank_deg: desiredBankDeg + 2,
    roll_rate_dps: index % 2 === 0 ? -10 : 10,
  }, "f22", controllerState).roll)
    .filter((command) => Math.abs(command) >= 0.05)
    .map(Math.sign);
  assert.ok(signs.length > 0);
  assert.equal(new Set(signs).size, 1);
});

test("roll controller settles a fast plant at the actual playerbot update cadence", () => {
  const state = {
    px: 0, py: 2_000, pz: 0,
    bx: 2_000, by: 2_000, bz: 2_000,
    heading_deg: 0, bank_deg: 0, roll_rate_dps: 0, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 450,
    lead_valid: false,
  };
  const controllerState = createFixedWingAiControllerState();
  const dtS = FIXED_WING_AI_SAMPLE_MS / 1_000;
  let maximumBankDeg = state.bank_deg;
  let strongReversals = 0;
  let previousCommandSign = 0;
  for (let step = 0; step < 120; step += 1) {
    const command = fixedWingAiCommand(state, "f22", controllerState);
    const commandSign = Math.abs(command.roll) >= 0.05 ? Math.sign(command.roll) : 0;
    if (commandSign !== 0 && previousCommandSign !== 0
        && commandSign !== previousCommandSign) strongReversals += 1;
    if (commandSign !== 0) previousCommandSign = commandSign;
    // Actual requested-input fit from the rejected Metal flight after aligning the next command.
    state.roll_rate_dps = 0.72 * state.roll_rate_dps + 64 * command.roll;
    state.bank_deg += state.roll_rate_dps * dtS;
    maximumBankDeg = Math.max(maximumBankDeg, state.bank_deg);
  }
  const targetBankDeg = fixedWingAiCommand(state, "f22", controllerState).target.desiredBankDeg;
  assert.ok(Math.abs(state.bank_deg - targetBankDeg) <= 1.25);
  assert.ok(Math.abs(state.roll_rate_dps) < 0.1);
  assert.ok(maximumBankDeg < targetBankDeg + 5);
  assert.ok(strongReversals <= 1);
});

test("roll controller holds the last good body rate but marks missing telemetry", () => {
  const controllerState = createFixedWingAiControllerState();
  const state = {
    px: 0, py: 2_000, pz: 0,
    bx: 2_000, by: 2_000, bz: 2_000,
    heading_deg: 0, bank_deg: 35, gamma_deg: 0,
    true_airspeed_kts: 450,
    lead_valid: false,
  };
  fixedWingAiCommand({ ...state, roll_rate_dps: 31 }, "f22", controllerState);
  const missing = fixedWingAiCommand(state, "f22", controllerState);
  assert.equal(missing.target.currentRollRateDps, 31);
  assert.equal(missing.target.rollRateTelemetryValid, false);
});

test("combat controller pulls around an established bank instead of flying a flat orbit", () => {
  const state = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: -2_000,
    heading_deg: 0, bank_deg: 60, gamma_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  assert.ok(fixedWingAiCommand(state, "f22").pitch > 0.75);
  assert.ok(fixedWingAiCommand({
    ...state,
    first_run_weapons_cold: true,
    first_run_valley_available: false,
  }, "first-run").pitch < 0.35);

  const inverted = fixedWingAiCommand({ ...state, bank_deg: -170 }, "f22");
  assert.equal(inverted.target.invertedRecoveryTargetBankDeg, -78);
  assert.equal(inverted.target.desiredBankDeg, -78);
  assert.ok(inverted.roll > 0.9);
  assert.equal(inverted.pitch, 0);
});

test("combat pull waits for commanded-bank alignment and settled roll rate", () => {
  const common = {
    px: 0, py: 3_000, pz: 0,
    bx: -2_000, by: 3_000, bz: 0,
    heading_deg: 0, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 500,
    lead_valid: false,
  };
  const reversing = fixedWingAiCommand({
    ...common,
    bank_deg: 88,
    roll_rate_dps: -90,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(reversing.target.desiredBankDeg, -68);
  assert.ok(reversing.target.desiredLoadFactorG <= 3 + 1e-9,
    "an opposite-bank reversal cannot be treated as an established 7.5 G turn");

  const established = fixedWingAiCommand({
    ...common,
    bank_deg: -70,
    roll_rate_dps: -10,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(established.target.desiredBankDeg, -68);
  assert.ok(Math.abs(established.target.desiredLoadFactorG - 7.5) < 1e-9,
    "a settled, aligned turn must retain full BFM pull authority");
});

test("Tape 468 loaded pursuit holds one physical bank until the conversion region", () => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const stateAt = ({
    headingErrorDeg,
    rangeM = 3_500,
    bankDeg = 73,
    rollRateDps = -18,
    actualG = 7,
  }) => ({
    px: 0, py: 3_000, pz: 0,
    bx: Math.sin(radians(headingErrorDeg)) * rangeM,
    by: 3_000,
    bz: Math.cos(radians(headingErrorDeg)) * rangeM,
    range_m: rangeM,
    heading_deg: 0,
    bank_deg: bankDeg,
    roll_rate_dps: rollRateDps,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_actual: actualG,
    aoa_deg: actualG > 2.5 ? 10 : 4,
    requested_g_cmd: actualG,
    g_cmd: actualG,
    lead_valid: false,
  });
  const controllerState = createFixedWingAiControllerState();
  const entered = fixedWingAiCommand(stateAt({ headingErrorDeg: 50 }),
    "f22", controllerState);
  assert.equal(entered.target.combatLoadedPursuitBankHoldActive, true);
  assert.ok(entered.target.combatLoadedPursuitLiveDesiredBankDeg < 60);
  assert.equal(entered.target.desiredBankDeg, 73);
  assert.equal(entered.target.combatLoadedRollUnloadActive, false);
  assert.ok(entered.roll > 0,
    "the loaded hold may brake the existing left roll but cannot accelerate it");
  assert.ok(entered.target.desiredLoadFactorG > 4,
    "the lead turn must retain fighting G instead of dropping to the 0.8-G unload");

  for (const headingErrorDeg of [43, 36]) {
    const held = fixedWingAiCommand(stateAt({
      headingErrorDeg,
      bankDeg: 72,
      rollRateDps: -4,
    }), "f22", controllerState);
    assert.equal(held.target.combatLoadedPursuitBankHoldActive, true);
    assert.equal(held.target.combatLoadedRollUnloadActive, false);
    assert.equal(held.target.desiredBankDeg, 72);
  }

  const conversion = fixedWingAiCommand(stateAt({
    headingErrorDeg: 35,
    bankDeg: 72,
    rollRateDps: 0,
  }), "f22", controllerState);
  assert.equal(conversion.target.combatLoadedPursuitBankHoldActive, false);
  assert.equal(conversion.target.combatLoadedRollUnloadActive, true,
    "the existing unload/transfer interlock must own the one real rollout at 35 degrees");
  assert.equal(conversion.target.desiredLoadFactorG, 0.8);

  const opposite = fixedWingAiCommand(stateAt({
    headingErrorDeg: -50,
    rollRateDps: 0,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(opposite.target.combatLoadedPursuitBankHoldActive, false);
  assert.equal(opposite.target.combatLoadedRollUnloadActive, true,
    "a cross-side plane change still requires the full unload interlock");

  const close = fixedWingAiCommand(stateAt({
    headingErrorDeg: 50,
    rangeM: 1_000,
    rollRateDps: 0,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(close.target.combatLoadedPursuitBankHoldActive, false,
    "unproved close-pass geometry cannot inherit the long-range hold");

  const lowG = fixedWingAiCommand(stateAt({
    headingErrorDeg: 50,
    actualG: 1,
  }), "f22", createFixedWingAiControllerState());
  assert.equal(lowG.target.combatLoadedPursuitBankHoldActive, false);
  assert.equal(lowG.target.combatLoadedRollUnloadActive, false,
    "an already unloaded jet retains ordinary live pursuit steering");
});

test("Tape 440 close-pass reversal unloads gamma pull until the lift plane settles", () => {
  // 84.95 s: the contact is 111 m away and the lead point has just crossed the nose. Generic
  // pursuit asks for a hard left roll while the aircraft is still carrying the preceding max-G
  // pull. This exact geometry produced -8.28 degrees beta with zero requested/applied/ARI rudder.
  const tapeCrossing = {
    px: 2476.677, py: 2904.762, pz: -2115.001,
    bx: 2482.525, by: 2999.189, bz: -2172.412,
    lead_x: 2497.295, lead_y: 3013.307, lead_z: -2149.93,
    lead_valid: true,
    heading_deg: 175.52,
    bank_deg: 18.43,
    roll_rate_dps: -61.87,
    gamma_deg: -25.94,
    true_airspeed_kts: 442.31,
    calibrated_airspeed_kts: 387.2,
    corner_speed_kias: 344.43,
    corner_band_min_kias: 325.84,
    corner_band_max_kias: 364.72,
    g_actual: 7.061,
    aoa_deg: 11.18,
    range_m: 110.7,
    closure_kts: 329.3,
    g_maxperform: 9,
  };
  const controllerState = createFixedWingAiControllerState();
  const crossing = fixedWingAiCommand(tapeCrossing, "f22", controllerState);
  assert.equal(crossing.target.invertedRecoveryActive, false);
  assert.equal(crossing.target.combatDownhillSliceActive, false);
  assert.equal(crossing.target.combatDownhillRecoveryPhase, "idle");
  assert.equal(crossing.target.gunLeadFinisherActive, false);
  assert.equal(crossing.target.combatLoadedRollUnloadActive, true);
  assert.equal(crossing.target.desiredBankDeg, tapeCrossing.bank_deg,
    "a 7-G close-pass handoff must retain its physical lift plane while unloading");
  assert.equal(crossing.target.desiredRollRateDps, 0);
  assert.ok(crossing.roll > 0,
    "opposite aileron may arrest the existing left roll but cannot accelerate the reversal");
  assert.equal(crossing.pitch, -0.10);

  const unloadedState = {
    ...tapeCrossing,
    bank_deg: -29,
    roll_rate_dps: -5,
    g_actual: 1.2,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  };
  const unloadDwell = fixedWingAiCommand(unloadedState, "f22", controllerState);
  assert.equal(unloadDwell.target.combatLoadedRollPhase, "unload");
  const captured = fixedWingAiCommand(unloadedState, "f22", controllerState);
  assert.equal(captured.target.combatLoadedRollUnloadActive, true);
  assert.equal(captured.target.combatLoadedRollPhase, "roll");
  assert.ok(captured.target.desiredBankDeg < -30
      && Math.abs(captured.target.leadRollControlErrorDeg) < 2,
  "two clean unload frames must commit one stable pursuit plane");
  assert.equal(captured.pitch, -0.10,
    "the committed roll must remain unloaded until its target plane is physically captured");

  const settled = fixedWingAiCommand({
    ...unloadedState,
    bank_deg: captured.target.combatLoadedRollTargetBankDeg,
    roll_rate_dps: 0,
  }, "f22", controllerState);
  assert.equal(settled.target.combatLoadedRollUnloadActive, false);
  assert.ok(settled.target.desiredLoadFactorG > 8.3,
    "the captured lift plane must regain the authored maximum-G gamma pull");
});

test("Tape 451 unloads defensive and finisher plane changes before applying aileron", () => {
  const defensiveState = createFixedWingAiControllerState();
  const defensive = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_400, bz: -500,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 0,
    bank_deg: 72.74,
    roll_rate_dps: 13.02,
    gamma_deg: -18.49,
    true_airspeed_kts: 500,
    g_actual: 5.476,
    aoa_deg: 19.75,
    lead_valid: false,
  }, "f22", defensiveState);
  assert.equal(defensive.target.combatDefensiveBreakActive, true);
  assert.equal(defensive.target.combatDefensiveBreakPlaneMagnitudeDeg, 82);
  assert.equal(defensive.target.combatLoadedRollUnloadActive, true);
  assert.equal(defensive.target.desiredBankDeg, 72.74);
  assert.equal(defensive.target.desiredRollRateDps, 0);
  assert.ok(defensive.roll < 0,
    "the loaded high-plane entry may brake right roll but cannot drive farther right");
  assert.equal(defensive.pitch, -0.10);

  const overbankDefense = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_400, bz: -500,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 0,
    bank_deg: 85,
    roll_rate_dps: 0,
    gamma_deg: -5,
    true_airspeed_kts: 500,
    g_actual: 7,
    aoa_deg: 14,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(overbankDefense.target.combatDefensiveBreakPlaneMagnitudeDeg, 82);
  assert.equal(overbankDefense.target.combatDefensiveOverbankGuardActive, true);
  assert.equal(overbankDefense.target.combatDefensiveOverbankUnloadActive, true);
  assert.equal(overbankDefense.pitch, -0.10,
    "high defense cannot keep pulling after inertia carries the wing past 84 degrees");
  assert.ok(overbankDefense.roll < 0,
    "high defense must recover inward from physical overbank");

  const projectedOverbankDefense = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_400, bz: -500,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 0,
    bank_deg: 83,
    roll_rate_dps: 8,
    gamma_deg: -5,
    true_airspeed_kts: 500,
    g_actual: 7,
    aoa_deg: 14,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(projectedOverbankDefense.target.combatDefensiveOverbankGuardActive, true);
  assert.equal(projectedOverbankDefense.pitch, -0.10,
    "high defense must unload before outward body rate crosses the physical seam");
  assert.ok(projectedOverbankDefense.roll < 0);

  const oppositeRateEntry = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_400, bz: -500,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 0,
    bank_deg: 68.53,
    roll_rate_dps: -7.28,
    gamma_deg: -18.78,
    true_airspeed_kts: 500,
    g_actual: 5.019,
    aoa_deg: 19.74,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(oppositeRateEntry.target.combatDefensiveBreakActive, true);
  assert.equal(oppositeRateEntry.target.combatLoadedRollUnloadActive, true);
  assert.equal(oppositeRateEntry.target.desiredBankDeg, 68.53);
  assert.equal(oppositeRateEntry.target.desiredRollRateDps, 0);
  assert.ok(oppositeRateEntry.roll > 0 && oppositeRateEntry.roll < 0.1,
    "opposite-sign braking must not include enough tactical roll to cross zero in one frame");
  assert.equal(oppositeRateEntry.pitch, -0.10);

  const finisherState = createFixedWingAiControllerState();
  const loadedFinisher = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -65,
      rollRateDps: -9.51,
      planeErrorDeg: -15,
      offBoresightDeg: 54.91,
      altitudeM: 4_500,
      gammaDeg: 0,
    }),
    range_m: 526.5,
    closure_kts: -62.5,
    g_actual: 3.852,
    aoa_deg: 9.29,
  }, "f22", finisherState);
  assert.equal(loadedFinisher.target.gunLeadFinisherActive, true);
  assert.equal(loadedFinisher.target.combatLoadedRollUnloadActive, true);
  assert.equal(loadedFinisher.target.desiredBankDeg, -65);
  assert.equal(loadedFinisher.target.desiredRollRateDps, 0);
  assert.ok(loadedFinisher.roll > 0,
    "the loaded finisher may brake its left roll but cannot accelerate the half-roll");
  assert.equal(loadedFinisher.pitch, -0.10);

  const unloadedFinisherState = {
    ...f22LeadPlaneState({
      bankDeg: -65,
      rollRateDps: 0,
      planeErrorDeg: -15,
      offBoresightDeg: 54.91,
      altitudeM: 4_500,
      gammaDeg: 0,
    }),
    range_m: 526.5,
    closure_kts: -62.5,
    g_actual: 1.2,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  };
  const unloadDwell = fixedWingAiCommand(unloadedFinisherState, "f22", finisherState);
  assert.equal(unloadDwell.target.combatLoadedRollPhase, "unload");
  const unloadedFinisher = fixedWingAiCommand(
    unloadedFinisherState, "f22", finisherState,
  );
  assert.equal(unloadedFinisher.target.combatLoadedRollUnloadActive, true);
  assert.equal(unloadedFinisher.target.combatLoadedRollPhase, "roll");
  assert.ok(unloadedFinisher.roll < -0.2,
    "the same finisher must commit promptly after two clean unload frames");
  assert.equal(unloadedFinisher.pitch, -0.10);

  const settledFinisher = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: unloadedFinisher.target.combatLoadedRollTargetBankDeg,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg: 54.91,
      altitudeM: 4_500,
      gammaDeg: 0,
    }),
    range_m: 526.5,
    closure_kts: -62.5,
    g_actual: 1.2,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", finisherState);
  assert.equal(settledFinisher.target.combatLoadedRollUnloadActive, false);
});

test("Tape 473 unloads either sign of a material finisher roll at high G", () => {
  const commandAt = ({
    bankDeg,
    rollRateDps,
    planeErrorDeg,
    offBoresightDeg,
    actualG,
    aoaDeg,
    rangeM,
    closureKts,
    previousLateralErrorDeg = null,
  }) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    if (previousLateralErrorDeg !== null) {
      controllerState.gunLeadRollCaptureActive = true;
      controllerState.gunLeadRollCaptureBankDeg = bankDeg;
      controllerState.gunLeadCapturedFineRollActive = true;
      controllerState.gunLeadLastLateralErrorDeg = previousLateralErrorDeg;
    }
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg,
        rollRateDps,
        planeErrorDeg,
        offBoresightDeg,
      }),
      range_m: rangeM,
      closure_kts: closureKts,
      g_actual: actualG,
      aoa_deg: aoaDeg,
      requested_g_cmd: actualG,
      g_cmd: actualG,
      gunnery_pitch_assist: true,
    }, "f22", controllerState);
  };

  const freshCrossing = commandAt({
    bankDeg: -69.54,
    rollRateDps: 9.72,
    planeErrorDeg: -12.100619,
    offBoresightDeg: 54.8585,
    actualG: 8.037,
    aoaDeg: 16.77,
    rangeM: 1_490,
    closureKts: -140.8,
  });
  assert.equal(freshCrossing.target.combatLoadedRollUnloadActive, true);
  assert.equal(freshCrossing.target.combatLoadedRollPhase, "unload");
  assert.equal(freshCrossing.target.desiredBankDeg, -69.54);
  assert.equal(freshCrossing.target.desiredRollRateDps, 0);
  assert.ok(Math.abs(freshCrossing.roll) < 0.25);
  assert.equal(freshCrossing.pitch, -0.10);

  const mirroredCrossing = commandAt({
    bankDeg: 44.77,
    rollRateDps: -7.87,
    planeErrorDeg: 156.941576,
    offBoresightDeg: 1.760477,
    actualG: 6.742,
    aoaDeg: 11.63,
    rangeM: 1_021.6,
    closureKts: 274.8,
    previousLateralErrorDeg: -0.498514,
  });
  assert.equal(mirroredCrossing.target.combatLoadedRollUnloadActive, true,
    "the 20 Hz sign crossing must be safe in both directions");
  assert.equal(mirroredCrossing.target.desiredRollRateDps, 0);
  assert.ok(Math.abs(mirroredCrossing.roll) < 0.25);
  assert.equal(mirroredCrossing.pitch, -0.10);
});

test("Tape 456 committed finisher transfer owns its frozen bank error after unload", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = -76.98953926453426;
  const command = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: -88.57,
      rollRateDps: 14.71,
      planeErrorDeg: 102.39246404398968,
      offBoresightDeg: 7.357713812787689,
    }),
    range_m: 972.3,
    closure_kts: 135.4,
    g_actual: 1.417,
    aoa_deg: 3.41,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);

  assert.equal(command.target.gunLeadFinisherActive, true);
  assert.equal(command.target.combatLoadedRollPhase, "roll");
  assert.ok(Math.abs(
    command.target.desiredBankDeg - controllerState.combatLoadedRollTargetBankDeg,
  ) < 1e-9);
  assert.ok(Math.abs(command.target.leadRollControlErrorDeg - 11.580460735465742) < 1e-9,
    "the rate loop must use frozen target minus current bank, not the live 102-degree lead plane");
  assert.ok(command.roll > 0.1 && command.roll < 0.25,
    `frozen 12-degree capture produced ${command.roll.toFixed(3)} roll`);
});

test("Tape 475 near-axis shoulder releases once the 78-degree live plane is within four degrees", () => {
  const commandAt = (livePlaneErrorDeg) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    controllerState.gunLeadFinisherEntryBankDeg = 53.46;
    controllerState.combatLoadedRollUnloadActive = true;
    controllerState.combatLoadedRollPhase = "roll";
    controllerState.combatLoadedRollTargetBankDeg = 76.81209075028636;
    controllerState.combatLoadedRollTransferSign = 1;
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 77.53,
        rollRateDps: 0,
        planeErrorDeg: livePlaneErrorDeg,
        offBoresightDeg: 11.687017643414382,
      }),
      range_m: 473.5,
      closure_kts: 249,
      g_actual: 1.2,
      aoa_deg: 4,
      requested_g_cmd: 0.8,
      g_cmd: 0.8,
    }, "f22", controllerState);
  };

  const tapeShoulder = commandAt(9.81);
  assert.equal(tapeShoulder.target.gunLeadFinisherActive, true);
  assert.equal(tapeShoulder.target.gunLeadRollCaptureActive, false);
  assert.equal(tapeShoulder.target.gunLeadCartesianRollActive, false,
    "the 11.69-degree shoulder is outside continuous Cartesian ownership");
  assert.equal(tapeShoulder.target.combatLoadedRollUnloadActive, false,
    "the sustainable 78-degree cap puts the live plane inside the release corridor");
  assert.equal(tapeShoulder.target.combatLoadedRollPhase, "idle");
  assert.ok(tapeShoulder.target.desiredLoadFactorG > 1);
  assert.ok(tapeShoulder.pitch > 0);

  const settledLivePlane = commandAt(3.99);
  assert.equal(settledLivePlane.target.combatLoadedRollUnloadActive, false,
    "a genuinely aligned live plane should release the completed transfer");
  assert.equal(settledLivePlane.target.combatLoadedRollPhase, "idle");
  assert.ok(settledLivePlane.target.desiredLoadFactorG > 1);
  assert.ok(settledLivePlane.pitch > 0);
});

test("Tape 459 far-axis finisher continues one unloaded transfer without pull pulses", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = -49.2397425843766;
  controllerState.combatLoadedRollTransferSign = 1;

  const steps = [
    { bankDeg: -52.5, liveBankDeg: -40.056870913136486 },
    { bankDeg: -43, liveBankDeg: -32.5546641623795 },
    { bankDeg: -35.5, liveBankDeg: -19.43791873604696 },
  ];
  for (const [index, step] of steps.entries()) {
    const command = fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: step.bankDeg,
        rollRateDps: 0,
        planeErrorDeg: step.liveBankDeg - step.bankDeg,
        offBoresightDeg: 45 - index * 4,
      }),
      range_m: 610 - index * 105,
      closure_kts: 260 + index * 90,
      g_actual: 1.2,
      aoa_deg: 4,
      requested_g_cmd: 0.8,
      g_cmd: 0.8,
    }, "f22", controllerState);

    assert.equal(command.target.gunLeadFinisherActive, true);
    assert.equal(command.target.gunLeadRollCaptureActive, false);
    assert.equal(command.target.combatLoadedRollUnloadActive, true);
    assert.equal(command.target.combatLoadedRollPhase, "roll");
    assert.ok(Math.abs(
      command.target.combatLoadedRollTargetBankDeg - step.liveBankDeg,
    ) < 1e-9, `step ${index + 1} did not advance the frozen plane`);
    assert.equal(command.pitch, -0.10,
      `step ${index + 1} emitted the rejected one-frame pull pulse`);
    assert.ok(command.roll >= 0,
      `step ${index + 1} reversed a same-direction transfer with ${command.roll.toFixed(3)}`);
  }
});

test("Tape 460 unloaded transfer hands the near-axis seam to continuous Cartesian roll", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = 79.26002777343776;
  controllerState.combatLoadedRollTransferSign = 1;

  const approachingAxis = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 69.05,
      rollRateDps: 22.46,
      planeErrorDeg: 36.89527534179006,
      offBoresightDeg: 3.880306595435959,
    }),
    range_m: 232.3,
    closure_kts: -7.6,
    g_actual: 1.007,
    aoa_deg: 2.57,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);

  assert.equal(approachingAxis.target.gunLeadCartesianRollActive, true);
  assert.equal(approachingAxis.target.gunLeadRollCaptureActive, false);
  assert.equal(approachingAxis.target.combatLoadedRollUnloadActive, true);
  assert.equal(approachingAxis.target.combatLoadedRollPhase, "roll");
  assert.equal(approachingAxis.target.combatLoadedRollTargetBankDeg, 78,
    "the frozen far-axis plane must yield to the bounded continuous body-right rate");
  assert.ok(Math.abs(
    approachingAxis.target.combatLoadedRollTargetBankDeg - 69.05,
  ) <= 18.75 + 1e-9,
  "the handoff must stay inside the Cartesian 45-dps rate limit, not chase singular azimuth");
  assert.equal(approachingAxis.pitch, -0.10);

  const cartesianTargetBankDeg =
    approachingAxis.target.combatLoadedRollTargetBankDeg;
  const captured = fixedWingAiCommand({
    ...f22LeadPlaneState({
      // Cartesian capture must own this handoff even while the bounded-rate transfer target still
      // trails the aircraft by more than the generic eight-degree bank-capture gate.
      bankDeg: cartesianTargetBankDeg - 12,
      rollRateDps: 0,
      planeErrorDeg: 10,
      offBoresightDeg: 1.8,
    }),
    range_m: 232,
    closure_kts: -12,
    g_actual: 1,
    aoa_deg: 3,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 0,
  }, "f22", controllerState);
  assert.equal(captured.target.gunLeadCartesianCaptureConverged, true);
  assert.equal(captured.target.gunLeadRollCaptureActive, true);
  assert.equal(captured.target.combatLoadedRollUnloadActive, false,
    "real Cartesian capture must release the transfer directly to the captured lift plane");
  assert.notEqual(captured.pitch, -0.10,
    "the captured lift plane must take pitch ownership from the transfer unload");
});

test("Tape 469 captured gun axis takes pitch from a stale unloaded transfer", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = 29.2;
  controllerState.combatLoadedRollTransferSign = 1;

  const captureFrame = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 9.8,
      rollRateDps: 0.05,
      planeErrorDeg: 29.18,
      offBoresightDeg: 1.76,
    }),
    range_m: 903,
    closure_kts: 254,
    g_actual: 2.09,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);
  assert.equal(captureFrame.target.gunLeadRollCaptureActive, true);
  assert.equal(captureFrame.target.combatLoadedRollUnloadActive, true,
    "a still-loaded first capture frame must retain the interlock");

  const settledAxis = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 9.76,
      rollRateDps: 4.35,
      planeErrorDeg: 4.62,
      offBoresightDeg: 2.19,
    }),
    range_m: 896,
    closure_kts: 257,
    g_actual: 1.78,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    gunnery_pitch_assist: true,
    gunnery_pitch_rate_error_dps: 0,
  }, "f22", controllerState);
  assert.equal(settledAxis.target.gunLeadRollCaptureActive, true);
  assert.equal(settledAxis.target.gunLeadCartesianCaptureConverged, false,
    "the 2.19-degree frame must exercise the new captured-axis shoulder, not the old 2-degree gate");
  assert.equal(settledAxis.target.combatLoadedRollUnloadActive, false,
    "the settled captured gun axis must release the obsolete 29-degree transfer");
  assert.notEqual(settledAxis.pitch, -0.10,
    "captured-axis pitch must resume on the release frame");
});

test("Tape 470 moving pursuit plane retargets inside one unloaded transfer", () => {
  const pursuitState = ({ desiredBankDeg, bankDeg }) => {
    const headingErrorDeg = desiredBankDeg / 1.18;
    const bearingRad = headingErrorDeg * Math.PI / 180;
    return {
      px: 0, py: 3_000, pz: 0,
      bx: Math.sin(bearingRad) * 500,
      by: 3_000,
      bz: Math.cos(bearingRad) * 500,
      heading_deg: 0,
      bank_deg: bankDeg,
      roll_rate_dps: 0,
      gamma_deg: 0,
      true_airspeed_kts: 430,
      range_m: 500,
      closure_kts: 0,
      g_actual: 1,
      aoa_deg: 4,
      requested_g_cmd: 0.8,
      g_cmd: 0.8,
      lead_valid: false,
    };
  };

  const reversalState = createFixedWingAiControllerState();
  reversalState.combatLoadedRollUnloadActive = true;
  reversalState.combatLoadedRollPhase = "roll";
  reversalState.combatLoadedRollTargetBankDeg = -33;
  reversalState.combatLoadedRollTransferSign = -1;
  const reversed = fixedWingAiCommand(pursuitState({
    desiredBankDeg: 10.2,
    bankDeg: -33,
  }), "f22", reversalState);
  assert.equal(reversed.target.combatLoadedRollPursuitRetargetMode, "reverse");
  assert.equal(reversed.target.combatLoadedRollUnloadActive, true);
  assert.equal(reversed.target.combatLoadedRollPhase, "unload",
    "an opposite moving target must brake directly without a loaded idle frame");
  assert.ok(Math.abs(reversed.target.combatLoadedRollTargetBankDeg - 10.2) < 1e-6);
  assert.equal(reversed.pitch, -0.10);

  const advancingState = createFixedWingAiControllerState();
  advancingState.combatLoadedRollUnloadActive = true;
  advancingState.combatLoadedRollPhase = "roll";
  advancingState.combatLoadedRollTargetBankDeg = 10.2;
  advancingState.combatLoadedRollTransferSign = 1;
  const advanced = fixedWingAiCommand(pursuitState({
    desiredBankDeg: 50.9,
    bankDeg: 10.2,
  }), "f22", advancingState);
  assert.equal(advanced.target.combatLoadedRollPursuitRetargetMode, "advance");
  assert.equal(advanced.target.combatLoadedRollPhase, "roll");
  assert.ok(Math.abs(advanced.target.combatLoadedRollTargetBankDeg - 50.9) < 1e-6);
  assert.equal(advanced.pitch, -0.10);

  const advancedAgain = fixedWingAiCommand(pursuitState({
    desiredBankDeg: 68,
    bankDeg: 50.9,
  }), "f22", advancingState);
  assert.equal(advancedAgain.target.combatLoadedRollPursuitRetargetMode, "advance");
  assert.equal(advancedAgain.target.combatLoadedRollPhase, "roll");
  assert.ok(Math.abs(advancedAgain.target.combatLoadedRollTargetBankDeg - 68) < 1e-6);
  assert.equal(advancedAgain.pitch, -0.10,
    "same-direction live-plane motion must remain one continuous unloaded roll");
});

test("F-22 tactical plane changes fail closed without current load or roll-rate evidence", () => {
  const defensiveState = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_400, bz: -500,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 0,
    bank_deg: 72.74,
    roll_rate_dps: 0,
    gamma_deg: -18.49,
    true_airspeed_kts: 500,
    lead_valid: false,
  };
  for (const channel of ["g_actual", "aoa_deg"]) {
    for (const invalidValue of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const incompleteLoadState = {
        ...defensiveState,
        g_actual: 1,
        aoa_deg: 4,
        [channel]: invalidValue,
      };
      const command = fixedWingAiCommand(
        incompleteLoadState,
        "f22",
        createFixedWingAiControllerState(),
      );
      assert.equal(command.target.combatLoadedRollUnloadActive, true);
      assert.equal(command.target.desiredBankDeg, incompleteLoadState.bank_deg);
      assert.equal(command.target.desiredRollRateDps, 0);
      assert.equal(command.pitch, -0.10);
    }
  }

  for (const { lastValidRollRateDps, reportedRollRateDps } of [
    { lastValidRollRateDps: -120, reportedRollRateDps: undefined },
    { lastValidRollRateDps: -60, reportedRollRateDps: Number.NaN },
    { lastValidRollRateDps: 60, reportedRollRateDps: null },
    { lastValidRollRateDps: 120, reportedRollRateDps: undefined },
    { lastValidRollRateDps: -120, reportedRollRateDps: Number.POSITIVE_INFINITY },
    { lastValidRollRateDps: null, reportedRollRateDps: undefined },
  ]) {
    const missingRateController = createFixedWingAiControllerState();
    missingRateController.lastValidRollRateDps = lastValidRollRateDps;
    const missingCurrentRollRate = fixedWingAiCommand({
      ...defensiveState,
      roll_rate_dps: reportedRollRateDps,
      g_actual: 5.476,
      aoa_deg: 19.75,
    }, "f22", missingRateController);
    assert.equal(missingCurrentRollRate.target.rollRateTelemetryValid, false);
    assert.equal(missingCurrentRollRate.target.combatLoadedRollUnloadActive, true,
      "a stale body rate cannot cancel or reverse a loaded tactical plane-change interlock");
    assert.equal(missingCurrentRollRate.target.desiredRollRateDps, 0);
    assert.equal(missingCurrentRollRate.roll, 0,
      "without a current body-rate sign, even apparent damping can accelerate the unseen roll");
    assert.equal(missingCurrentRollRate.pitch, -0.10);
  }
});

test("loaded target promotion cannot bypass the committed-plane interlock", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 3_000, pz: 0,
    by: 3_000,
    heading_deg: 0,
    bank_deg: 78,
    roll_rate_dps: 0,
    gamma_deg: 0,
    true_airspeed_kts: 450,
    g_maxperform: 9,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    selected_player_gun_target_slot: 0,
    engagement_number: 1,
  };
  fixedWingAiCommand({
    ...common,
    bx: 2_000,
    bz: 0,
    bandit_entity_id: "entity-a",
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 1,
    g_cmd: 1,
  }, "f22", controllerState);

  const promotedLoaded = fixedWingAiCommand({
    ...common,
    bx: -2_000,
    bz: 0,
    bandit_entity_id: "entity-b",
    g_actual: 7,
    aoa_deg: 18,
    requested_g_cmd: 7,
    g_cmd: 7,
  }, "f22", controllerState);
  assert.equal(promotedLoaded.target.gunLeadTargetChanged, true);
  assert.equal(promotedLoaded.target.combatLoadedRollUnloadActive, true);
  assert.equal(promotedLoaded.target.combatLoadedRollPhase, "unload");
  assert.equal(promotedLoaded.target.desiredBankDeg, 78);
  assert.equal(promotedLoaded.target.desiredRollRateDps, 0);
  assert.equal(promotedLoaded.roll, 0,
    "a target identity handoff cannot apply the reproduced full loaded reversal");
  assert.equal(promotedLoaded.pitch, -0.10);
});

test("target promotion reseeds an active unloaded transfer to the new contact", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.gunLeadFinisherActive = true;
  controllerState.gunLeadRollCaptureTargetKey = "entity:old-contact";
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = 80;
  controllerState.combatLoadedRollTransferSign = 1;

  const promoted = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 0,
      rollRateDps: 0,
      planeErrorDeg: -40,
      offBoresightDeg: 30,
    }),
    bandit_entity_id: "entity:new-contact",
    range_m: 500,
    closure_kts: 100,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);

  assert.equal(promoted.target.gunLeadTargetChanged, true);
  assert.equal(promoted.target.combatLoadedRollUnloadActive, true);
  assert.equal(promoted.target.combatLoadedRollPhase, "unload");
  assert.ok(Math.abs(promoted.target.combatLoadedRollTargetBankDeg + 40) < 1e-9,
    "the promoted contact must replace the dead target's committed +80-degree plane");
  assert.equal(promoted.target.combatLoadedRollTransferSign, -1);
  assert.equal(promoted.target.desiredBankDeg, 0,
    "the replacement plane must still wait for its own unload dwell before rolling");
  assert.equal(promoted.pitch, -0.10);
});

test("first-run gun handoff gets F-22 loaded-roll protection without slowing the valley", () => {
  const loadedReversal = {
    px: 0, py: 3_000, pz: 0,
    bx: -2_000, by: 3_000, bz: 0,
    heading_deg: 0,
    bank_deg: 78,
    roll_rate_dps: 0,
    gamma_deg: 0,
    true_airspeed_kts: 450,
    g_actual: 7,
    aoa_deg: 18,
    requested_g_cmd: 7,
    g_cmd: 7,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
  };
  const gunPhase = fixedWingAiCommand({
    ...loadedReversal,
    first_run_weapons_cold: false,
    aim9_remaining: 0,
  }, "first-run", createFixedWingAiControllerState());
  assert.equal(gunPhase.target.combatLoadedRollUnloadActive, true);
  assert.equal(gunPhase.target.desiredBankDeg, 78);
  assert.equal(gunPhase.roll, 0);
  assert.equal(gunPhase.pitch, -0.10);

  const valleyPhase = fixedWingAiCommand({
    ...loadedReversal,
    first_run_weapons_cold: true,
    aim9_remaining: 2,
    first_run_valley_available: false,
  }, "first-run", createFixedWingAiControllerState());
  assert.equal(valleyPhase.target.combatLoadedRollUnloadActive, false,
    "the gun-phase safety owner must not intrude on the authored valley controller");
});

test("Tape 450 unloads the expired defensive plane before generic pursuit rolls on", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 1;
  controllerState.combatDefensiveBreakSign = -1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 55;
  const tape450Release = {
    px: 0, py: 3_500, pz: 0,
    bx: -2_000, by: 3_500, bz: 0,
    heading_deg: 0,
    bank_deg: -52.11,
    roll_rate_dps: -2.88,
    gamma_deg: -3.31,
    true_airspeed_kts: 450,
    g_actual: 6.111,
    aoa_deg: 19.6,
    lead_valid: false,
  };

  const loadedRelease = fixedWingAiCommand(tape450Release, "f22", controllerState);
  assert.equal(loadedRelease.target.combatDefensiveBreakActive, false);
  assert.equal(loadedRelease.target.combatDefensiveReleaseUnloadActive, true);
  assert.equal(loadedRelease.target.desiredBankDeg, -52.11);
  assert.ok(Math.abs(loadedRelease.roll) < 0.1,
    `defensive handoff applied ${loadedRelease.roll.toFixed(3)} roll while loaded`);
  assert.equal(loadedRelease.pitch, -0.10);

  const cleanHandoffState = {
    ...tape450Release,
    roll_rate_dps: 0,
    g_actual: 1.8,
    aoa_deg: 8,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  };
  const cleanHandoff = fixedWingAiCommand(
    cleanHandoffState, "f22", controllerState,
  );
  assert.equal(cleanHandoff.target.combatDefensiveReleaseUnloadActive, false);
  assert.equal(cleanHandoff.target.combatLoadedRollPhase, "idle");
  assert.equal(cleanHandoff.target.desiredBankDeg, -68);
  assert.ok(cleanHandoff.roll < -0.3,
    "low actual, requested and applied G permit the clean generic handoff");
});

test("Tape 450 holds one pursuit side across the target-behind angle seam", () => {
  const controllerState = createFixedWingAiControllerState();
  const contactAtBearing = (bearingDeg) => {
    const radians = bearingDeg * Math.PI / 180;
    return fixedWingAiCommand({
      px: 0, py: 3_500, pz: 0,
      bx: Math.sin(radians) * 1_000,
      by: 3_500,
      bz: Math.cos(radians) * 1_000,
      heading_deg: 0,
      bank_deg: -72.48,
      roll_rate_dps: 4.87,
      gamma_deg: 0.33,
      true_airspeed_kts: 450,
      g_actual: 5.224,
      aoa_deg: 16.58,
      lead_valid: false,
    }, "f22", controllerState);
  };

  const beforeWrap = contactAtBearing(-178.84);
  assert.equal(beforeWrap.target.combatAftPursuitBankHoldActive, true);
  assert.equal(beforeWrap.target.combatAftPursuitBankHoldSign, -1);
  assert.equal(beforeWrap.target.desiredBankDeg, -72);

  const afterWrap = contactAtBearing(179.16);
  assert.equal(afterWrap.target.combatAftPursuitBankHoldActive, true);
  assert.equal(afterWrap.target.desiredBankDeg, -72,
    "the +/-180 wrap cannot reverse a loaded jet toward the other fighting bank");
  assert.ok(Math.abs(afterWrap.roll) < 0.2,
    `aft seam applied ${afterWrap.roll.toFixed(3)} roll`);

  const clearOfSeam = contactAtBearing(144.9);
  assert.equal(clearOfSeam.target.combatAftPursuitBankHoldActive, true);
  assert.equal(clearOfSeam.target.combatAftPursuitReleaseUnloadActive, true);
  assert.equal(clearOfSeam.target.desiredBankDeg, -72.48,
    "the release boundary cannot relocate the loaded half-roll away from the angle seam");
  assert.equal(clearOfSeam.pitch, -0.10);

  const cleanReleaseState = {
    px: 0, py: 3_500, pz: 0,
    bx: Math.sin(144.9 * Math.PI / 180) * 1_000,
    by: 3_500,
    bz: Math.cos(144.9 * Math.PI / 180) * 1_000,
    heading_deg: 0,
    bank_deg: -72.48,
    roll_rate_dps: 0,
    gamma_deg: 0.33,
    true_airspeed_kts: 450,
    g_actual: 1.8,
    aoa_deg: 8,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    lead_valid: false,
  };
  const cleanRelease = fixedWingAiCommand(cleanReleaseState, "f22", controllerState);
  assert.equal(cleanRelease.target.combatAftPursuitBankHoldActive, false);
  assert.equal(cleanRelease.target.combatAftPursuitReleaseUnloadActive, false);
  assert.equal(cleanRelease.target.combatLoadedRollPhase, "idle");
  assert.equal(cleanRelease.target.desiredBankDeg, 68,
    "low actual, requested and applied G permit the clean pursuit handoff");
});

test("Tape 494 post-aft handoff trims below the visual wall while rebuilding G", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatAftPursuitBankHoldActive = true;
  controllerState.combatAftPursuitBankHoldSign = 1;
  const bearingRad = 144.3 * Math.PI / 180;
  const command = fixedWingAiCommand({
    px: 0, py: 3_500, pz: 0,
    bx: Math.sin(bearingRad) * 3_500,
    by: 3_500,
    bz: Math.cos(bearingRad) * 3_500,
    heading_deg: 0,
    bank_deg: 74.69,
    roll_rate_dps: -0.22,
    gamma_deg: 11.3,
    true_airspeed_kts: 450,
    g_actual: 2.466,
    aoa_deg: 8,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    lead_valid: false,
    range_m: 3_500,
    closure_kts: -415.6,
  }, "f22", controllerState);

  assert.equal(command.target.combatAftPursuitBankHoldActive, false);
  assert.equal(command.target.desiredBankDeg, 68,
    "ordinary pursuit must positively trim away from the sustained 75-degree wall lane");
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "the six-degree same-side trim does not require another unloaded transfer");
  assert.ok(command.target.desiredLoadFactorG > 5,
    "the post-aft handoff must keep useful fighting pull while reducing bank");
});

test("inverted recovery holds the half-roll until the same-side fighting bank settles", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 3_000, pz: 0,
    bx: 2_000, by: 3_000, bz: -400,
    heading_deg: 0, gamma_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  for (const bankDeg of [108, 101, 99, 94]) {
    const command = fixedWingAiCommand({
      ...common,
      bank_deg: bankDeg,
      roll_rate_dps: -35,
    }, "f22", controllerState);
    assert.equal(command.target.invertedRecoveryActive, true);
    assert.equal(command.target.invertedRecoveryTargetBankDeg, 78);
    assert.equal(command.target.desiredBankDeg, 78);
    assert.ok(command.roll < 0,
      `latched half-roll reversed at ${bankDeg} degrees`);
  }
  const fastThroughUpright = fixedWingAiCommand({
    ...common,
    bank_deg: 91,
    roll_rate_dps: -25,
  }, "f22", controllerState);
  assert.equal(fastThroughUpright.target.invertedRecoveryActive, true);
  assert.equal(fastThroughUpright.target.desiredBankDeg, 78);
  assert.equal(fastThroughUpright.pitch, 0,
    "combat pull must not resume while the half-roll is still fast");

  const fightingBankFastRoll = fixedWingAiCommand({
    ...common,
    bank_deg: 78,
    roll_rate_dps: -74,
  }, "f22", controllerState);
  assert.equal(fightingBankFastRoll.target.invertedRecoveryActive, true,
    "bank capture alone cannot return a fast-rolling aircraft to combat pull");
  assert.equal(fightingBankFastRoll.target.desiredBankDeg, 78);
  assert.ok(fightingBankFastRoll.roll > 0,
    "the controller must brake roll through the captured fighting bank");
  assert.equal(fightingBankFastRoll.pitch, 0);

  const released = fixedWingAiCommand({
    ...common,
    bank_deg: 78,
    roll_rate_dps: -10,
  }, "f22", controllerState);
  assert.equal(released.target.invertedRecoveryActive, false);
  assert.equal(released.target.desiredBankDeg, 68);
  assert.ok(released.pitch > 0.75,
    "the settled fighting bank must hand straight back to the same-side pursuit pull");
});

test("Tape 460 recovery handoffs brake opposing body roll before changing direction", () => {
  const invertedController = createFixedWingAiControllerState();
  const invertedState = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 172.46,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 0.61,
    aoa_deg: 1.08,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    lead_valid: false,
  };
  const fastOpposing = fixedWingAiCommand({
    ...invertedState,
    roll_rate_dps: 95.55,
  }, "f22", invertedController);
  assert.equal(fastOpposing.target.invertedRecoveryActive, true);
  assert.equal(fastOpposing.target.invertedRecoveryTargetBankDeg, 78);
  assert.equal(fastOpposing.target.desiredBankDeg, 78);
  assert.equal(fastOpposing.target.nominalDesiredRollRateDps, -120);
  assert.equal(fastOpposing.target.desiredRollRateDps, 0,
    "the new recovery owner must damp +96 dps before feeding in an opposite target rate");
  assert.equal(fastOpposing.target.recoveryRollHandoffBrakingActive, true);
  assert.ok(fastOpposing.roll < -0.65 && fastOpposing.roll > -0.75,
    `inverted handoff produced ${fastOpposing.roll.toFixed(3)} roll instead of damping-only`);

  const crossover = fixedWingAiCommand({
    ...invertedState,
    roll_rate_dps: 10,
  }, "f22", invertedController);
  assert.equal(crossover.target.desiredRollRateDps, -15,
    "the zero crossing must stay bounded to the existing 15-dps capture scale");
  assert.ok(crossover.roll < 0 && crossover.roll > -0.25);

  const aligned = fixedWingAiCommand({
    ...invertedState,
    roll_rate_dps: -10,
  }, "f22", invertedController);
  assert.equal(aligned.target.recoveryRollHandoffBrakingActive, false);
  assert.equal(aligned.target.desiredRollRateDps, -120,
    "full recovery authority must return as soon as body roll agrees with the target");
  assert.ok(aligned.roll < -0.9);

  const terrainController = createFixedWingAiControllerState();
  const terrainOpposing = fixedWingAiCommand({
    ...invertedState,
    bank_deg: -43.39,
    roll_rate_dps: -30.38,
    gamma_deg: -37.2,
    radar_alt_ft: 6_582,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 4,
  }, "f22", terrainController);
  assert.equal(terrainOpposing.target.terrainRecoveryPhase, "roll");
  assert.ok(terrainOpposing.target.nominalDesiredRollRateDps > 90);
  assert.equal(terrainOpposing.target.desiredRollRateDps, 0);
  assert.equal(terrainOpposing.target.recoveryRollHandoffBrakingActive, true);
  assert.ok(terrainOpposing.roll > 0.2 && terrainOpposing.roll < 0.25,
    `terrain handoff produced ${terrainOpposing.roll.toFixed(3)} roll instead of damping-only`);

  const terrainSameDirection = fixedWingAiCommand({
    ...invertedState,
    bank_deg: -43.39,
    roll_rate_dps: 10,
    gamma_deg: -37.2,
    radar_alt_ft: 6_582,
    auto_gcas_prediction_valid: true,
    auto_gcas_time_available_seconds: 4,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(terrainSameDirection.target.terrainRecoveryPhase, "roll");
  assert.equal(terrainSameDirection.target.recoveryRollHandoffBrakingActive, false);
  assert.ok(terrainSameDirection.target.desiredRollRateDps > 90,
    "same-direction terrain recovery cannot lose urgent roll authority");
});

test("Tape 475 inverted recovery rolls -178 to -78 then hands straight to aft pursuit", () => {
  for (const sign of [-1, 1]) {
    const controllerState = createFixedWingAiControllerState();
    const tape475 = {
      px: 0, py: 3_000, pz: 0,
      bx: sign * 100, by: 3_000, bz: -2_000,
      heading_deg: 0,
      gamma_deg: -13.93,
      true_airspeed_kts: 500,
      g_actual: 0.985,
      aoa_deg: 2.24,
      requested_g_cmd: 0.8,
      g_cmd: 0.8,
      lead_valid: false,
    };

    const recovery = fixedWingAiCommand({
      ...tape475,
      bank_deg: sign * 178.54,
      roll_rate_dps: -sign * 69.18,
    }, "f22", controllerState);
    assert.equal(recovery.target.invertedRecoveryActive, true);
    assert.equal(recovery.target.invertedRecoveryTargetBankDeg, sign * 78);
    assert.equal(recovery.target.desiredBankDeg, sign * 78);
    assert.equal(recovery.target.nominalDesiredRollRateDps, -sign * 120);
    assert.equal(recovery.target.desiredRollRateDps, -sign * 120);
    assert.equal(recovery.target.recoveryRollHandoffBrakingActive, false);
    assert.equal(Math.sign(recovery.roll), -sign);
    assert.equal(recovery.pitch, 0,
      "the overbank must unload while rolling directly toward its same-side fighting bank");

    const handoff = fixedWingAiCommand({
      ...tape475,
      bank_deg: sign * 78,
      roll_rate_dps: 0,
    }, "f22", controllerState);
    assert.equal(handoff.target.invertedRecoveryActive, false);
    assert.equal(handoff.target.combatAftPursuitBankHoldActive, true);
    assert.equal(handoff.target.combatAftPursuitBankHoldSign, sign);
    assert.equal(handoff.target.desiredBankDeg, sign * 72);
    assert.equal(handoff.target.combatLoadedRollUnloadActive, false);
    assert.ok(Math.abs(handoff.roll) < 0.15
      && Math.sign(handoff.roll) === -sign,
    "recovery may make only the four-degree same-side trim at the aft-pursuit handoff");
    assert.ok(handoff.pitch > 0.8,
      "aft pursuit must resume its fighting pull on the settled recovery frame");

    const held = fixedWingAiCommand({
      ...tape475,
      bank_deg: sign * 78,
      roll_rate_dps: 0,
    }, "f22", controllerState);
    assert.equal(held.target.combatAftPursuitBankHoldActive, true);
    assert.equal(held.target.desiredBankDeg, sign * 72);
    assert.ok(Math.abs(held.roll) < 0.15
      && Math.sign(held.roll) === -sign,
    "aft pursuit may trim toward 72 degrees without beginning another revolution");
  }
});

test("Tape 447 unloads the 101-degree recovered slice before rolling upright", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDownhillSliceActive = true;
  controllerState.combatDownhillSliceSign = 1;
  const tape447Exit = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 101.73,
    roll_rate_dps: 2.4,
    gamma_deg: -24.78,
    true_airspeed_kts: 500,
    g_actual: 5.046,
    aoa_deg: 19.1,
    lead_valid: false,
  };

  const loaded = fixedWingAiCommand(tape447Exit, "f22", controllerState);
  assert.equal(loaded.target.combatDownhillSliceActive, false);
  assert.equal(loaded.target.combatDownhillSliceTargetRecovered, true);
  assert.equal(loaded.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(loaded.target.combatDownhillRecoveryRollArmed, false);
  assert.equal(loaded.target.invertedRecoveryActive, false,
    "the slice's own continuous recovery should own this handoff");
  assert.equal(loaded.target.desiredBankDeg, tape447Exit.bank_deg,
    "a loaded slice exit must hold its plane instead of commanding the opposite 78-degree bank");
  assert.equal(loaded.roll, 0,
    "holding bank while lift decays removes the high-alpha aileron-to-rudder interconnect kick");
  assert.equal(loaded.pitch, -0.08);

  const unloaded = fixedWingAiCommand({
    ...tape447Exit,
    roll_rate_dps: 0,
    g_actual: 1.8,
    aoa_deg: 10,
  }, "f22", controllerState);
  assert.equal(unloaded.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(unloaded.target.combatDownhillRecoveryRollArmed, true);
  assert.equal(unloaded.target.desiredBankDeg, 0);
  assert.ok(unloaded.roll < 0,
    "the bot may make one clean upright roll only after measured G and alpha settle");
});

test("Tape 457 inverted recovery rejects a stale 8 G command behind a low-G frame", () => {
  const controllerState = createFixedWingAiControllerState();
  const stalePull = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: -105.3,
    roll_rate_dps: 0.36,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 1.913,
    aoa_deg: 3.07,
    requested_g_cmd: 8.08,
    g_cmd: 8.08,
    lead_valid: false,
  }, "f22", controllerState);

  assert.equal(stalePull.target.invertedRecoveryActive, true);
  assert.equal(stalePull.target.invertedRecoveryRollArmed, false,
    "low measured G cannot authorize a plane change while the old pull remains commanded");
  assert.equal(stalePull.target.desiredBankDeg, -105.3);
  assert.equal(stalePull.roll, 0);
  assert.equal(stalePull.pitch, 0);

  const cleanUnload = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: -104.5,
    roll_rate_dps: 0.3,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 1.8,
    aoa_deg: 3,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(cleanUnload.target.invertedRecoveryRollArmed, true);
  assert.equal(cleanUnload.target.invertedRecoveryTargetBankDeg, -78);
  assert.equal(cleanUnload.target.desiredBankDeg, -78);
  assert.ok(cleanUnload.roll > 0,
    "recovery may roll to its same-side fighting bank once load telemetry agrees");

  const tape471Rebound = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: -115.5,
    roll_rate_dps: 0.6,
    gamma_deg: 9.4,
    true_airspeed_kts: 500,
    g_actual: 2.418,
    aoa_deg: 4.2,
    requested_g_cmd: 1.65,
    g_cmd: 1.65,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(tape471Rebound.target.invertedRecoveryActive, true);
  assert.equal(tape471Rebound.target.invertedRecoveryRollArmed, false);
  assert.equal(tape471Rebound.target.desiredBankDeg, -115.5);
  assert.equal(tape471Rebound.roll, 0,
    "Tape 471's residual 2.418 G cannot arm a full-aileron roll before the rebound");
});

test("inverted recovery keeps control through defensive fire and an unsafe finisher cue", () => {
  const common = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0, bank_deg: 120, roll_rate_dps: 40, gamma_deg: -10,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
  };
  const defensiveState = createFixedWingAiControllerState();
  const acquired = fixedWingAiCommand(common, "f22", defensiveState);
  assert.equal(acquired.target.invertedRecoveryActive, true);

  const defensive = fixedWingAiCommand({
    ...common,
    opponent_gun_firing: true,
  }, "f22", defensiveState);
  assert.equal(defensive.target.combatDefensiveBreakActive, true,
    "the threat remains latched for execution after recovery");
  assert.equal(defensive.target.invertedRecoveryActive, true);
  assert.equal(defensive.target.invertedRecoveryTargetBankDeg, 78);
  assert.equal(defensive.target.desiredBankDeg, 78);
  assert.equal(defensive.pitch, 0,
    "defense cannot add an earthward pull while recovery owns the overbank");

  const finisherState = createFixedWingAiControllerState();
  fixedWingAiCommand(common, "f22", finisherState);
  const unsafeFinisher = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 120,
      rollRateDps: 40,
      planeErrorDeg: 0,
      offBoresightDeg: 10,
      altitudeM: 3_000,
      gammaDeg: -10,
    }),
    closure_kts: 300,
    g_actual: 1,
    aoa_deg: 4,
  }, "f22", finisherState);
  assert.equal(unsafeFinisher.target.gunLeadFinisherActive, false);
  assert.equal(unsafeFinisher.target.invertedRecoveryActive, true);
  assert.equal(unsafeFinisher.target.invertedRecoveryTargetBankDeg, 78);
  assert.equal(unsafeFinisher.target.desiredBankDeg, 78);
  assert.equal(unsafeFinisher.pitch, 0);
});

test("high-shooter defense waits for an already-owned same-side recovery", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.invertedRecoveryActive = true;
  controllerState.invertedRecoveryRollArmed = true;
  controllerState.invertedRecoveryTargetBankDeg = 78;
  const highShooter = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_230, bz: -650,
    heading_deg: 0,
    bank_deg: 112,
    roll_rate_dps: -25,
    gamma_deg: -10,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
  };

  const recovering = fixedWingAiCommand(highShooter, "f22", controllerState);
  assert.equal(recovering.target.combatDefensiveBreakActive, true);
  assert.equal(recovering.target.combatDefensiveBreakPlaneMagnitudeDeg, 78,
    "a 112-degree defense cannot replace a recovery already travelling toward +78");
  assert.equal(recovering.target.invertedRecoveryActive, true);
  assert.equal(recovering.target.desiredBankDeg, 78);
  assert.ok(recovering.roll < 0,
    "continuous fire must not reverse the recovery back toward the high defensive plane");

  const released = fixedWingAiCommand({
    ...highShooter,
    bank_deg: 78,
    roll_rate_dps: 0,
  }, "f22", controllerState);
  assert.equal(released.target.invertedRecoveryActive, false);
  assert.equal(released.target.combatDefensiveBreakPlaneMagnitudeDeg, 82,
    "the latched threat may choose its earthward plane once the upright recovery is settled");
  assert.equal(released.target.desiredBankDeg, 82);
  assert.ok(released.roll > 0);
});

test("inverted recovery fails closed without measured G and alpha", () => {
  const controllerState = createFixedWingAiControllerState();
  const missing = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 108,
    roll_rate_dps: 0,
    gamma_deg: -10,
    true_airspeed_kts: 500,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(missing.target.invertedRecoveryActive, true);
  assert.equal(missing.target.invertedRecoveryRollArmed, false);
  assert.equal(missing.target.desiredBankDeg, 108);

  const invalid = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 108,
    roll_rate_dps: 0,
    gamma_deg: -10,
    true_airspeed_kts: 500,
    g_actual: Number.NaN,
    aoa_deg: Number.NaN,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(invalid.target.invertedRecoveryRollArmed, false);
  assert.equal(invalid.target.desiredBankDeg, 108);

  const nullTelemetry = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 108,
    roll_rate_dps: 0,
    gamma_deg: -10,
    true_airspeed_kts: 500,
    g_actual: null,
    aoa_deg: null,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(nullTelemetry.target.invertedRecoveryRollArmed, false,
    "null telemetry cannot coerce to a false safe zero");
  assert.equal(nullTelemetry.target.desiredBankDeg, 108);
});

test("armed inverted recovery waits for a current unload before tactical release", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.invertedRecoveryActive = true;
  controllerState.invertedRecoveryRollArmed = true;
  controllerState.invertedRecoveryTargetBankDeg = 78;
  const highShooter = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_230, bz: -650,
    heading_deg: 0,
    bank_deg: 78,
    roll_rate_dps: 0,
    gamma_deg: 10,
    true_airspeed_kts: 500,
    g_actual: 5,
    aoa_deg: 19,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
  };

  const loadedDwell = fixedWingAiCommand(highShooter, "f22", controllerState);
  assert.equal(loadedDwell.target.invertedRecoveryActive, true);
  assert.equal(loadedDwell.target.invertedRecoveryReleaseDwell, true);
  assert.equal(loadedDwell.target.combatDefensiveBreakPlaneMagnitudeDeg, 78);
  assert.equal(loadedDwell.target.desiredBankDeg, 78,
    "stale armed permission cannot launch a new roll while current G/alpha are unsafe");
  assert.equal(loadedDwell.roll, 0);
  assert.equal(loadedDwell.pitch, 0,
    "the nose-high recovery assist must not perpetuate the unsafe loaded state");

  const cleanRelease = fixedWingAiCommand({
    ...highShooter,
    g_actual: 1,
    aoa_deg: 4,
  }, "f22", controllerState);
  assert.equal(cleanRelease.target.invertedRecoveryActive, false);
  assert.equal(cleanRelease.target.invertedRecoveryReleaseDwell, false);
  assert.equal(cleanRelease.target.combatDefensiveBreakPlaneMagnitudeDeg, 82);
  assert.equal(cleanRelease.target.desiredBankDeg, 82);
});

test("current-frame inverted recovery blocks an opposite downhill-slice entry", () => {
  const command = fixedWingAiCommand({
    px: 0, py: 4_500, pz: 0,
    bx: 2_000, by: 3_500, bz: 0,
    heading_deg: 0, bank_deg: -108, roll_rate_dps: 50, gamma_deg: 5,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());

  assert.equal(command.target.combatDownhillSliceActive, false);
  assert.equal(command.target.invertedRecoveryActive, true);
  assert.equal(command.target.invertedRecoveryTargetBankDeg, -78);
  assert.equal(command.target.desiredBankDeg, -78);
  assert.ok(command.roll > 0,
    "the first overbanked frame must continue toward -78, not reverse into +112 degrees");
});

test("combat controller slices out of a steep climb instead of zooming vertically", () => {
  const common = {
    px: 0, py: 5_900, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, gamma_deg: 48,
    roll_rate_dps: 0,
    true_airspeed_kts: 470,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const rolling = fixedWingAiCommand({ ...common, bank_deg: 72 }, "f22");
  assert.equal(rolling.target.verticalEscapeRecovery, true);
  assert.equal(rolling.target.desiredBankDeg, 180);
  assert.ok(rolling.roll > 0.9);
  assert.equal(rolling.pitch, -0.14);
  assert.equal(rolling.throttleDown, true);

  const overshooting = fixedWingAiCommand({ ...common, bank_deg: 132 }, "f22");
  assert.equal(overshooting.target.verticalEscapeRecovery, true);
  assert.equal(overshooting.target.desiredBankDeg, 180);
  assert.equal(overshooting.pitch, -0.14,
    "crossing a broad overbank threshold cannot pull before the inverted plane is captured");

  const slicing = fixedWingAiCommand({ ...common, bank_deg: 174 }, "f22");
  assert.equal(slicing.target.verticalEscapeRecovery, true);
  assert.equal(slicing.target.desiredBankDeg, 180);
  assert.equal(slicing.target.desiredLoadFactorG, 6.5,
    "a captured inverted plane must drive gamma down without a structural-limit pull");

  for (const invalidRollRate of [undefined, Number.NaN]) {
    const missingRate = fixedWingAiCommand({
      ...common,
      bank_deg: 180,
      roll_rate_dps: invalidRollRate,
    }, "f22", createFixedWingAiControllerState());
    assert.equal(missingRate.target.rollRateTelemetryValid, false);
    assert.equal(missingRate.target.verticalRecoveryPullActive, false,
      "a cached or assumed-zero roll rate cannot authorize the earthward pull");
    assert.equal(missingRate.pitch, -0.14);
  }
});

test("Tape 459 vertical recovery holds its inverted plane under rebuilt G", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 5_900, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, gamma_deg: 48,
    true_airspeed_kts: 470,
    lead_valid: false,
  };

  const entered = fixedWingAiCommand({
    ...common,
    bank_deg: 72,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 1,
    g_cmd: 1,
  }, "f22", controllerState);
  assert.equal(entered.target.verticalRecoverySliceRollArmed, true);
  assert.equal(entered.pitch, -0.14);

  const captured = fixedWingAiCommand({
    ...common,
    bank_deg: 180,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);
  assert.equal(captured.target.verticalRecoveryPullActive, true);
  assert.equal(captured.target.desiredLoadFactorG, 6.5);

  const loadedOvershoot = fixedWingAiCommand({
    ...common,
    bank_deg: 174,
    roll_rate_dps: 0,
    g_actual: 5.7,
    aoa_deg: 19.8,
    requested_g_cmd: 5.7,
    g_cmd: 5.7,
  }, "f22", controllerState);
  assert.equal(loadedOvershoot.target.verticalRecoveryPullActive, true);
  assert.equal(loadedOvershoot.roll, 0,
    "a loaded recovery may hold its near-inverted plane but cannot accelerate a recentering roll");
});

test("Tape 473 vertical recovery aborts a coupled inverted pull instead of recapturing", () => {
  for (const sign of [-1, 1]) {
    const controllerState = createFixedWingAiControllerState();
    controllerState.verticalRecoveryPhase = "slice";
    controllerState.verticalRecoverySliceSign = sign;
    controllerState.verticalRecoverySliceRollArmed = true;
    controllerState.verticalRecoveryPullActive = true;
    const common = {
      px: 0, py: 5_900, pz: 0,
      bx: 0, by: 6_000, bz: -2_000,
      heading_deg: 0, gamma_deg: 42,
      true_airspeed_kts: 470,
      lead_valid: false,
    };

    const loadedDrift = fixedWingAiCommand({
      ...common,
      bank_deg: sign * 160,
      roll_rate_dps: 0,
      g_actual: 5.5,
      aoa_deg: 19,
      requested_g_cmd: 5.5,
      g_cmd: 5.5,
    }, "f22", controllerState);
    assert.equal(loadedDrift.target.verticalRecoveryPhase, "level");
    assert.equal(loadedDrift.target.verticalRecoveryRecaptureActive, false);
    assert.equal(loadedDrift.target.verticalRecoveryPullActive, false);
    assert.equal(loadedDrift.target.desiredBankDeg, sign * 160,
      "a drifted loaded pull must hold the physical plane while lift decays");
    assert.equal(loadedDrift.roll, 0);
    assert.equal(loadedDrift.pitch, -0.08);

    const unloadedRollout = fixedWingAiCommand({
      ...common,
      bank_deg: sign * 160,
      roll_rate_dps: 0,
      g_actual: 1.8,
      aoa_deg: 8,
      requested_g_cmd: 0.8,
      g_cmd: 0.8,
    }, "f22", controllerState);
    assert.equal(unloadedRollout.target.verticalRecoveryPhase, "level");
    assert.equal(unloadedRollout.target.verticalRecoveryLevelRollArmed, true);
    assert.equal(unloadedRollout.target.desiredBankDeg, 0);
    assert.equal(Math.sign(unloadedRollout.roll), -sign,
      "the unloaded abort must roll toward level, not recapture the overbank");
  }
});

test("Tape 450 unloads before the anti-zoom recovery changes lift plane", () => {
  const controllerState = createFixedWingAiControllerState();
  const tape450 = {
    px: 0, py: 5_185, pz: 0,
    bx: 0, by: 5_300, bz: -2_000,
    heading_deg: 0,
    bank_deg: 69.93,
    roll_rate_dps: -4.25,
    gamma_deg: 42.25,
    true_airspeed_kts: 470,
    g_actual: 6.122,
    aoa_deg: 18.68,
    lead_valid: false,
  };

  const loadedEntry = fixedWingAiCommand(tape450, "f22", controllerState);
  assert.equal(loadedEntry.target.verticalRecoveryPhase, "slice");
  assert.equal(loadedEntry.target.verticalRecoverySliceRollArmed, false);
  assert.equal(loadedEntry.target.desiredBankDeg, 69.93,
    "a 6 G / high-alpha jet must hold its existing plane while lift decays");
  assert.ok(Math.abs(loadedEntry.roll) < 0.1,
    `loaded anti-zoom entry applied ${loadedEntry.roll.toFixed(3)} roll`);
  assert.equal(loadedEntry.pitch, -0.14);

  const unloadedRoll = fixedWingAiCommand({
    ...tape450,
    roll_rate_dps: 0,
    g_actual: 1.8,
    aoa_deg: 10,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);
  assert.equal(unloadedRoll.target.verticalRecoverySliceRollArmed, true);
  assert.equal(unloadedRoll.target.desiredBankDeg, 180);
  assert.ok(unloadedRoll.roll > 0.7,
    "the earthward roll must retain authority after measured unload");
});

test("downhill slice levels after a useful dive instead of following the fight vertically", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 4_500, pz: 0,
    bx: -2_000, by: 3_500, bz: 0,
    heading_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const entryState = {
    ...common,
    bank_deg: -70,
    roll_rate_dps: 0,
    gamma_deg: 0,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  };
  const entryDwell = fixedWingAiCommand(entryState, "f22", controllerState);
  assert.equal(entryDwell.target.combatDownhillSliceRollArmed, false);
  assert.equal(entryDwell.target.desiredBankDeg, -70);
  const entered = fixedWingAiCommand(entryState, "f22", controllerState);
  assert.equal(entered.target.combatDownhillSliceActive, true);
  assert.equal(entered.target.combatDownhillSliceRollArmed, true);
  assert.equal(entered.target.desiredBankDeg, -180);

  const capturedSlice = fixedWingAiCommand({
    ...common,
    bank_deg: -180,
    roll_rate_dps: 0,
    gamma_deg: 0,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);
  assert.equal(capturedSlice.target.combatDownhillSlicePullActive, true);

  const loadedSliceDrift = fixedWingAiCommand({
    ...common,
    bank_deg: -160,
    roll_rate_dps: 0,
    gamma_deg: 0,
    g_actual: 5,
    aoa_deg: 19,
    requested_g_cmd: 5,
    g_cmd: 5,
  }, "f22", controllerState);
  assert.equal(loadedSliceDrift.target.combatDownhillSlicePullActive, false);
  assert.equal(loadedSliceDrift.roll, 0,
    "a loaded slice must unload rather than use aileron to chase its escaped plane");
  assert.equal(loadedSliceDrift.pitch, -0.10);

  const recapturedSlice = fixedWingAiCommand({
    ...common,
    bank_deg: -174,
    roll_rate_dps: 0,
    gamma_deg: 0,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", controllerState);
  assert.equal(recapturedSlice.target.combatDownhillSlicePullActive, true,
    "the existing eight-degree capture boundary resumes the authored pull cleanly");

  const depthBound = fixedWingAiCommand({
    ...common,
    bank_deg: -174,
    roll_rate_dps: 0,
    gamma_deg: -36,
    g_actual: 5,
    aoa_deg: 19,
  }, "f22", controllerState);
  assert.equal(depthBound.target.combatDownhillSliceActive, false);
  assert.equal(depthBound.target.combatDownhillSliceDepthRecovery, true);
  assert.equal(depthBound.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(depthBound.target.combatDownhillRecoveryRollArmed, false);
  assert.equal(depthBound.target.desiredBankDeg, -174,
    "the loaded slice plane must be held while G and alpha decay");
  assert.equal(depthBound.roll, 0,
    "the depth-bound handoff cannot add aileron while the airframe is still loaded");
  assert.equal(depthBound.pitch, -0.08,
    "the bot must unload before rolling upright or adding pursuit G to a steep dive");

  const unloadedRoll = fixedWingAiCommand({
    ...common,
    bank_deg: -174,
    roll_rate_dps: 0,
    gamma_deg: -36,
    g_actual: 1.8,
    aoa_deg: 10,
  }, "f22", controllerState);
  assert.equal(unloadedRoll.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(unloadedRoll.target.combatDownhillRecoveryRollArmed, true);
  assert.equal(unloadedRoll.target.desiredBankDeg, 0);
  assert.ok(unloadedRoll.roll > 0,
    "one clean upright roll is authorized only after measured unload");

  const pullingOut = fixedWingAiCommand({
    ...common,
    bank_deg: -20,
    roll_rate_dps: 8,
    gamma_deg: -38,
  }, "f22", controllerState);
  assert.equal(pullingOut.target.combatDownhillRecoveryPhase, "pull");
  assert.equal(pullingOut.target.desiredBankDeg, 0);
  assert.equal(pullingOut.pitch, 0.92);

  const stillRecovering = fixedWingAiCommand({
    ...common,
    bank_deg: 2,
    roll_rate_dps: 1,
    gamma_deg: -10,
  }, "f22", controllerState);
  assert.equal(stillRecovering.target.combatDownhillRecoveryPhase, "pull");
  assert.equal(stillRecovering.target.combatDownhillSliceActive, false,
    "the same depressed contact cannot immediately re-enter the downhill slice");
  assert.equal(stillRecovering.pitch, 0.92);

  const loadedRelease = fixedWingAiCommand({
    ...common,
    bank_deg: 2,
    roll_rate_dps: 1,
    gamma_deg: -7,
    g_actual: 5,
    aoa_deg: 19,
  }, "f22", controllerState);
  assert.equal(loadedRelease.target.combatDownhillRecoveryPhase, "release");
  assert.equal(loadedRelease.target.desiredBankDeg, 2,
    "pull-out ownership must unload before returning a loaded jet to pursuit");
  assert.equal(loadedRelease.pitch, 0);

  const recovered = fixedWingAiCommand({
    ...common,
    bank_deg: 2,
    roll_rate_dps: 1,
    gamma_deg: -7,
    g_actual: 2.2,
    aoa_deg: 10,
  }, "f22", controllerState);
  assert.equal(recovered.target.combatDownhillRecoveryPhase, "idle");
  assert.equal(recovered.target.combatLoadedRollPhase, "unload");
  assert.equal(recovered.pitch, -0.10,
    "the recovery handoff keeps unloading while generic pursuit chooses a new plane");

  const handback = fixedWingAiCommand({
    ...common,
    bank_deg: 2,
    roll_rate_dps: 1,
    gamma_deg: -6.5,
  }, "f22", controllerState);
  assert.equal(handback.target.combatDownhillSliceActive, false,
    "geometric rearm hysteresis must survive beyond the release frame");
  assert.equal(handback.target.combatLoadedRollPhase, "unload");
  assert.equal(handback.pitch, -0.10,
    "the handback keeps a bounded unload while generic pursuit stages its new plane");

  const aligned = fixedWingAiCommand({
    ...common,
    bx: 0,
    bz: 2_000,
    bank_deg: 2,
    roll_rate_dps: 1,
    gamma_deg: -6,
  }, "f22", controllerState);
  assert.equal(aligned.target.combatDownhillSliceActive, false);
  assert.ok(aligned.pitch < 0,
    "once heading geometry clears the latch, ordinary pursuit may descend toward the contact");
});

test("Tape 476 does not start a new split-S while already descending steeply", () => {
  // Exact entry geometry from the 84.04 s ownership handoff. The lead point is still well below
  // the flown path, but at -15.63 degrees gamma another full inverted conversion only stacks a
  // 100-degree roll onto the preceding pursuit half-roll before terrain recovery must reverse it.
  const tape476Entry = {
    px: 2_623.955, py: 2_088.518, pz: 1_791.132,
    bx: 1_912.396, by: 1_309.255, bz: 1_041.97,
    lead_x: 1_841.05, lead_y: 1_259.424, lead_z: 1_189.503,
    lead_valid: true,
    heading_deg: 341.42,
    bank_deg: -75.78,
    roll_rate_dps: 0.15,
    gamma_deg: -15.63,
    true_airspeed_kts: 390,
    calibrated_airspeed_kts: 353,
    g_actual: 1.541,
    aoa_deg: 2.89,
    requested_g_cmd: 1.766,
    g_cmd: 1.766,
    range_m: 1_294.1,
    closure_kts: -239.3,
    g_maxperform: 9,
    radar_alt_ft: 6_426.9,
    vertical_speed_fpm: -10_694.3,
  };
  const rawTargetElevationDeg = Math.atan2(
    tape476Entry.lead_y - tape476Entry.py,
    Math.hypot(
      tape476Entry.lead_x - tape476Entry.px,
      tape476Entry.lead_z - tape476Entry.pz,
    ),
  ) * 180 / Math.PI;
  assert.ok(rawTargetElevationDeg
      <= tape476Entry.gamma_deg - 6,
  "the fixture must retain Tape 476's genuinely below-flight-path contact");

  const steepDescent = fixedWingAiCommand(
    tape476Entry, "f22", createFixedWingAiControllerState(),
  );
  assert.ok(steepDescent.target.headingErrorDeg < -108
    && steepDescent.target.headingErrorDeg > -110);
  assert.equal(steepDescent.target.combatDownhillSliceActive, false,
    "an already-steep descent must use pursuit instead of stacking another split-S");

  const nearLevel = fixedWingAiCommand({
    ...tape476Entry,
    gamma_deg: -9.99,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(nearLevel.target.combatDownhillSliceActive, true,
    "the guard must retain a real below-path conversion just inside the -10-degree boundary");
});

test("Tape 473 rejects fast-opening generic slices before the bearing wrap", () => {
  const entryController = createFixedWingAiControllerState();
  const tape471Entry = {
    px: -79.525, py: 3_337.419, pz: -3_485.956,
    bx: -757.079, by: 3_127.154, bz: -3_434.028,
    lead_x: -716.491, lead_y: 3_063.054, lead_z: -3_339.234,
    lead_valid: true,
    heading_deg: 156.96,
    bank_deg: 75.4,
    roll_rate_dps: 3.08,
    gamma_deg: 11.85,
    true_airspeed_kts: 416.97,
    g_maxperform: 9,
    g_actual: 0.79,
    aoa_deg: 1.47,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    range_m: 711.3,
    closure_kts: -730.5,
  };
  const entered = fixedWingAiCommand(tape471Entry, "f22", entryController);
  assert.equal(entered.target.combatDownhillSliceActive, false,
    "an outward crossing of the 700 m gate cannot self-author another dive");

  const boundedEntry = { ...tape471Entry, closure_kts: -249.9 };
  const boundedController = createFixedWingAiControllerState();
  const staged = fixedWingAiCommand(boundedEntry, "f22", boundedController);
  assert.equal(staged.target.combatDownhillSliceActive, true);
  assert.equal(staged.target.combatDownhillSliceRollArmed, false);
  const committed = fixedWingAiCommand(boundedEntry, "f22", boundedController);
  assert.equal(committed.target.combatDownhillSliceRollArmed, true);
  assert.equal(Math.abs(committed.target.desiredBankDeg), 180,
    "a bounded far-below conversion must be a recognizable split-S");

  const rejectedHalfRoll = fixedWingAiCommand({
    px: 343.047, py: 2_959.627, pz: -2_696.617,
    bx: 285.223, by: 2_817.947, bz: -1_984.645,
    lead_x: 354.036, lead_y: 2_849.991, lead_z: -1_987.249,
    lead_valid: true,
    heading_deg: 151.79,
    bank_deg: 76.56,
    roll_rate_dps: -0.12,
    gamma_deg: 17.94,
    true_airspeed_kts: 387.64,
    g_maxperform: 8.636,
    g_actual: 0.826,
    aoa_deg: 1.71,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    range_m: 728.2,
    closure_kts: -675.6,
  }, "f22", createFixedWingAiControllerState());
  assert.ok(rejectedHalfRoll.target.headingErrorDeg < -150);
  assert.equal(rejectedHalfRoll.target.combatDownhillSliceActive, false,
    "the second Tape 471 entry cannot spend the episode rolling 163 degrees for one pull frame");

  const exitController = createFixedWingAiControllerState();
  exitController.combatDownhillSliceActive = true;
  exitController.combatDownhillSliceSign = 1;
  exitController.combatDownhillSliceRollArmed = true;
  exitController.combatDownhillSlicePullActive = true;
  const tape471AtHeadingFence = {
    px: -25.628, py: 3_317.889, pz: -4_261.967,
    bx: -1_157.226, by: 2_218.438, bz: -4_087.288,
    lead_x: -942.074, lead_y: 2_024.492, lead_z: -4_251.18,
    lead_valid: true,
    heading_deg: 240.43,
    bank_deg: 96.45,
    roll_rate_dps: -0.55,
    gamma_deg: -21.59,
    true_airspeed_kts: 371.77,
    g_maxperform: 7.651,
    g_actual: 7.116,
    aoa_deg: 16.65,
    requested_g_cmd: 7.132,
    g_cmd: 7.132,
    range_m: 1_587.4,
    closure_kts: 89.6,
  };
  const outsideFence = fixedWingAiCommand(
    tape471AtHeadingFence, "f22", exitController,
  );
  assert.ok(outsideFence.target.headingErrorDeg > 30);
  assert.equal(outsideFence.target.combatDownhillSliceActive, true,
    "30.6 degrees remains outside the strict heading-recovery boundary");

  const tape471RecoveredHeading = {
    ...tape471AtHeadingFence,
    px: -32.143, py: 3_313.973, pz: -4_269.263,
    bx: -1_153.768, by: 2_208.039, bz: -4_101.572,
    lead_x: -935.306, lead_y: 2_015.807, lead_z: -4_268.004,
    heading_deg: 241.75,
    bank_deg: 95.93,
    gamma_deg: -22.04,
    true_airspeed_kts: 371.42,
    g_maxperform: 7.639,
    g_actual: 7.104,
    requested_g_cmd: 7.121,
    g_cmd: 7.121,
    range_m: 1_584.1,
    closure_kts: 101.1,
  };
  const recoveredHeading = fixedWingAiCommand(
    tape471RecoveredHeading, "f22", exitController,
  );
  assert.ok(recoveredHeading.target.headingErrorDeg < 30);
  assert.equal(recoveredHeading.target.combatDownhillSliceActive, false);
  assert.equal(recoveredHeading.target.combatDownhillSliceDepthRecovery, true,
    "heading capture must enter the explicit roll-and-pull recovery before the bearing wraps");
  assert.equal(recoveredHeading.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(recoveredHeading.target.desiredBankDeg, tape471RecoveredHeading.bank_deg,
    "the 7.1-G tape frame must unload before it rolls upright");
  assert.equal(recoveredHeading.pitch, -0.08);
  assert.equal(exitController.combatDownhillSliceRearmBlocked, true);

  const recoveryStillOwns = fixedWingAiCommand({
    ...tape471RecoveredHeading,
    bank_deg: 60,
    roll_rate_dps: -20,
    gamma_deg: -18,
    g_actual: 1.8,
    aoa_deg: 8,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", exitController);
  assert.notEqual(recoveryStillOwns.target.combatDownhillRecoveryPhase, "idle");
  assert.equal(exitController.combatDownhillSliceRearmBlocked, true,
    "heading capture cannot clear rearm hysteresis before pull-out ownership finishes");
});

test("Tape 443 wide long-range lead stays in its recognizable downhill conversion", () => {
  const commandAt = ({
    gammaDeg = -2.21,
    planeErrorDeg = 5.909,
    rollRateDps = -10.61,
    hostileGunFiring = false,
  } = {}) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.combatDownhillSliceActive = true;
    controllerState.combatDownhillSliceSign = -1;
    const leadState = f22LeadPlaneState({
      bankDeg: -105.25,
      rollRateDps,
      planeErrorDeg,
      offBoresightDeg: 54.792,
      gammaDeg,
    });
    return fixedWingAiCommand({
      ...leadState,
      // Preserve the production slice's depressed raw contact independently of its ballistic
      // lead point, which is what the finisher actually controls.
      bx: -2_000, by: 3_500, bz: 0,
      range_m: 1_968.3,
      closure_kts: 177.6,
      g_maxperform: 8.36,
      gunnery_pitch_assist: true,
      opponent_present: true,
      opponent_alive: true,
      opponent_gun_firing: hostileGunFiring,
    }, "f22", controllerState);
  };

  const tape443 = commandAt();
  assert.equal(tape443.target.combatDownhillSliceFinisherHandoff, false);
  assert.equal(tape443.target.gunLeadFinisherActive, false,
    "a 1,968 m / 55-degree pipper is not yet a final-axis gun problem");
  assert.equal(tape443.target.combatDownhillSliceActive, true);
  assert.equal(tape443.target.combatDownhillRecoveryPhase, "idle",
    "rejecting the early finisher must not steal the active conversion");
  assert.equal(tape443.target.invertedRecoveryActive, false);
  assert.equal(tape443.pitch, -0.1,
    "the conversion must remain unloaded until its explicit split-S plane is captured");

  for (const [label, unsafe] of [
    ["earthward gamma", commandAt({ gammaDeg: -8.01 })],
    ["lead-plane error", commandAt({ planeErrorDeg: 8.01 })],
    ["body roll rate", commandAt({ rollRateDps: 15.01 })],
  ]) {
    assert.equal(unsafe.target.combatDownhillSliceFinisherHandoff, false, label);
    assert.equal(unsafe.target.gunLeadFinisherActive, false, label);
    assert.equal(unsafe.target.combatDownhillSliceActive, true, label);
  }

  const defensive = commandAt({ hostileGunFiring: true });
  assert.equal(defensive.target.combatDownhillSliceFinisherHandoff, false);
  assert.equal(defensive.target.gunLeadFinisherActive, false);
  assert.equal(defensive.target.combatDefensiveBreakActive, true);
  assert.equal(defensive.target.combatDownhillSliceActive, false);
  assert.equal(defensive.target.combatDownhillRecoveryPhase, "roll",
    "real gunfire must retain roll-first preemption over the aligned shot");
});

test("Tape 450 preserves a high-clearance gun conversion across the -8-degree seam", () => {
  const commandAt = ({
    gammaDeg = -9.32,
    radarAltitudeFt = 16_869,
    rangeM = 767.8,
  } = {}) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.combatDownhillSliceActive = true;
    controllerState.combatDownhillSliceSign = 1;
    controllerState.combatDownhillSliceRollArmed = true;
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: 77.9,
        rollRateDps: 5.93,
        planeErrorDeg: 7.968,
        offBoresightDeg: 49.185,
        gammaDeg,
      }),
      bx: 2_000, by: 3_500, bz: 0,
      range_m: rangeM,
      closure_kts: 2.6,
      radar_alt_ft: radarAltitudeFt,
      g_actual: 8.591,
      aoa_deg: 15.79,
    }, "f22", controllerState);
  };

  const handoff = commandAt();
  assert.equal(handoff.target.combatDownhillSliceFinisherHandoff, true);
  assert.equal(handoff.target.gunLeadFinisherActive, true);
  assert.equal(handoff.target.combatDownhillSliceActive, false);
  assert.equal(handoff.target.combatDownhillRecoveryPhase, "idle");
  assert.equal(handoff.target.desiredBankDeg, 78,
    "the handoff must retain the same turn side without crossing the sustainable bank cap");
  assert.ok(Math.abs(handoff.roll) < 0.15,
    `the loaded same-plane handoff applied ${handoff.roll.toFixed(3)} roll`);

  for (const [label, unsafe] of [
    ["ten-degree dive boundary", commandAt({ gammaDeg: -10.01 })],
    ["terrain clearance", commandAt({ radarAltitudeFt: 2_999 })],
    ["range boundary", commandAt({ rangeM: 1_200.01 })],
  ]) {
    assert.equal(unsafe.target.combatDownhillSliceFinisherHandoff, false, label);
    assert.equal(unsafe.target.gunLeadFinisherActive, false, label);
  }
});

test("Tape 439 post-pass slice idles and pulls out on a same-side fighting bank", () => {
  const controllerState = createFixedWingAiControllerState();
  // The captured break owned the previous 20-Hz sample and expires on this update. These are the
  // 130.35 s kinematics: a 140 m crossing already opening at 293 kt, with the F-22 climbing 27
  // degrees on the established right break plane. KCAS remains inside the corner deadband, which
  // is why the old controller left inherited 1.35 afterburner untouched.
  controllerState.combatDefensiveBreakSamples = 1;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatCornerEnergyActive = true;
  const tapeEntry = {
    px: 147.801, py: 2_664.067, pz: -3_839.132,
    bx: 98.575, by: 2_616.954, bz: -3_958.439,
    lead_x: 98.575, lead_y: 2_616.954, lead_z: -3_958.439,
    lead_valid: true,
    heading_deg: 58.04,
    bank_deg: 87.37,
    roll_rate_dps: 8.19,
    gamma_deg: 27.35,
    true_airspeed_kts: 386.4,
    calibrated_airspeed_kts: 340.55,
    corner_speed_kias: 344.06,
    corner_band_min_kias: 324.65,
    corner_band_max_kias: 363.47,
    g_maxperform: 8.85,
    g_actual: 1,
    aoa_deg: 4,
    range_m: 140.5,
    closure_kts: -293.3,
  };

  const entered = fixedWingAiCommand(tapeEntry, "f22", controllerState);
  assert.equal(entered.target.combatDefensiveBreakActive, false);
  assert.equal(entered.target.combatDownhillSliceActive, true);
  assert.equal(entered.target.combatDownhillPostPassConversionActive, true);
  assert.equal(entered.target.desiredBankDeg, tapeEntry.bank_deg);
  assert.equal(entered.pitch, -0.10,
    "the post-pass correction must prove an unload before changing its lift plane");
  const committed = fixedWingAiCommand(tapeEntry, "f22", controllerState);
  assert.equal(committed.target.combatDownhillSliceRollArmed, true);
  assert.equal(committed.target.desiredBankDeg, 112);
  assert.equal(committed.pitch, -0.10,
    "the committed roll remains unloaded until the overbank and body rate settle");
  const aligned = fixedWingAiCommand({
    ...tapeEntry,
    bank_deg: 108,
    roll_rate_dps: 10,
  }, "f22", controllerState);
  assert.ok(aligned.pitch > 0.9,
    "the aligned post-pass plane keeps the full-G conversion instead of softening the turn");
  assert.ok(aligned.target.desiredLoadFactorG > 8.1,
    "the captured 8.18-G tape demand must not be weakened");
  assert.equal(entered.throttleUp, false);
  assert.equal(entered.throttleDown, true,
    "a strongly opening crossing must scrub inherited afterburner inside the corner deadband");

  const depthBound = fixedWingAiCommand({
    ...tapeEntry,
    bank_deg: 110,
    roll_rate_dps: 4,
    gamma_deg: -25,
    range_m: 1_900,
    closure_kts: -600,
  }, "f22", controllerState);
  assert.equal(depthBound.target.combatDownhillSliceActive, false);
  assert.equal(depthBound.target.combatDownhillSliceDepthRecovery, true);
  assert.equal(depthBound.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(depthBound.target.combatDownhillPostPassConversionActive, true);
  assert.equal(depthBound.target.desiredBankDeg, 60,
    "recovery must keep a same-side turning plane, not start a 112-to-zero roll");
  assert.equal(depthBound.pitch, -0.08);
  assert.equal(depthBound.throttleDown, true);

  const pullingOut = fixedWingAiCommand({
    ...tapeEntry,
    bank_deg: 62,
    roll_rate_dps: -8,
    gamma_deg: -26,
    range_m: 2_100,
    closure_kts: -450,
  }, "f22", controllerState);
  assert.equal(pullingOut.target.combatDownhillRecoveryPhase, "pull");
  assert.equal(pullingOut.target.desiredBankDeg, 60);
  assert.equal(pullingOut.pitch, 0.92);
  assert.ok(pullingOut.target.desiredLoadFactorG > 8.2);
  assert.equal(pullingOut.throttleDown, true);

  const recovered = fixedWingAiCommand({
    ...tapeEntry,
    bank_deg: 60,
    roll_rate_dps: 2,
    gamma_deg: -7,
    range_m: 2_500,
    closure_kts: -100,
  }, "f22", controllerState);
  assert.equal(recovered.target.combatDownhillRecoveryPhase, "idle");
  assert.equal(recovered.target.combatDownhillPostPassConversionActive, false);
  assert.equal(recovered.target.invertedRecoveryActive, false,
    "the generic roll-to-level latch cannot steal the authored banked handoff");
  assert.ok(recovered.target.desiredBankDeg > 0);
  assert.ok(Math.abs(recovered.target.desiredBankDeg - 60) <= 18,
    "normal combat resumes without a second large roll reversal");
});

test("a just-released break cannot fall through to an unqualified generic deep slice", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 1;
  controllerState.combatDefensiveBreakSign = -1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  const command = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 2_850, bz: -450,
    heading_deg: 0,
    bank_deg: -78,
    roll_rate_dps: 4,
    gamma_deg: 10,
    true_airspeed_kts: 400,
    range_m: 475,
    closure_kts: -220,
    lead_valid: false,
  }, "f22", controllerState);

  assert.equal(command.target.combatDefensiveBreakActive, false);
  assert.equal(command.target.combatDownhillPostPassConversionActive, false);
  assert.equal(command.target.combatDownhillSliceActive, false,
    "failed post-pass gates cannot reverse the old break directly into a generic split-S");
  assert.notEqual(Math.abs(command.target.desiredBankDeg), 180);
});

test("post-pass soft geometry exit retains the same-side recovery owner", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDownhillSliceActive = true;
  controllerState.combatDownhillSliceSign = 1;
  controllerState.combatDownhillPostPassConversionActive = true;
  const softExit = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 90,
    roll_rate_dps: -10,
    gamma_deg: -10,
    true_airspeed_kts: 420,
    g_actual: 1,
    aoa_deg: 4,
    range_m: 2_000,
    closure_kts: -200,
    lead_valid: false,
  }, "f22", controllerState);

  assert.equal(softExit.target.combatDownhillSliceActive, false);
  assert.equal(softExit.target.combatDownhillPostPassConversionActive, true);
  assert.equal(softExit.target.combatDownhillRecoveryPhase, "roll",
    "resolved target elevation cannot drop every recovery/fire-interlock owner at high bank");
  assert.equal(softExit.target.desiredBankDeg, 60);
  assert.equal(softExit.pitch, -0.08);
  assert.equal(softExit.throttleDown, true);

  const pull = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_000, bz: 2_000,
    heading_deg: 0,
    bank_deg: 61,
    roll_rate_dps: 2,
    gamma_deg: -10,
    true_airspeed_kts: 410,
    g_actual: 1,
    aoa_deg: 4,
    range_m: 2_000,
    closure_kts: -100,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(pull.target.combatDownhillRecoveryPhase, "pull");
  assert.equal(pull.target.desiredBankDeg, 60);
  assert.equal(pull.pitch, 0.92);
});

test("Tape 439 post-pass recovery yields its banked plane to a renewed threat", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDownhillSliceActive = true;
  controllerState.combatDownhillSliceSign = 1;
  controllerState.combatDownhillPostPassConversionActive = true;
  const renewedThreat = fixedWingAiCommand({
    px: 0, py: 4_000, pz: 0,
    bx: 2_000, by: 3_000, bz: 0,
    heading_deg: 0,
    bank_deg: 112,
    roll_rate_dps: 10,
    gamma_deg: -25,
    true_airspeed_kts: 430,
    calibrated_airspeed_kts: 380,
    g_actual: 1,
    aoa_deg: 4,
    closure_kts: 300,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
  }, "f22", controllerState);

  assert.equal(renewedThreat.target.combatDefensiveBreakActive, true);
  assert.equal(renewedThreat.target.combatDownhillSliceActive, false);
  assert.equal(renewedThreat.target.combatDownhillPostPassConversionActive, false);
  assert.equal(renewedThreat.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(renewedThreat.target.desiredBankDeg, 0,
    "new defense must demote the contact-specific recovery to the established roll-first path");
  assert.equal(renewedThreat.pitch, -0.08);
});

test("defensive fire preempts a downhill slice through roll-first recovery", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDownhillSliceActive = true;
  controllerState.combatDownhillSliceSign = 1;
  const command = fixedWingAiCommand({
    px: 0, py: 4_000, pz: 0,
    bx: 2_000, by: 3_000, bz: 0,
    heading_deg: 0, bank_deg: 120, roll_rate_dps: 10, gamma_deg: -20,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    closure_kts: 300,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
  }, "f22", controllerState);

  assert.equal(command.target.combatDefensiveBreakActive, true);
  assert.equal(command.target.combatDownhillSliceActive, false);
  assert.equal(command.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(command.target.desiredBankDeg, 0);
  assert.equal(command.pitch, -0.08,
    "the queued break cannot pull until the slice lift vector is upright");
});

test("Tape 457 downhill preemption waits for commanded load to unload before rolling", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDownhillSliceActive = true;
  controllerState.combatDownhillSliceSign = -1;
  const stalePull = fixedWingAiCommand({
    px: 0, py: 4_000, pz: 0,
    bx: -2_000, by: 3_000, bz: 0,
    heading_deg: 0,
    bank_deg: -105.3,
    roll_rate_dps: 0.36,
    gamma_deg: -20,
    true_airspeed_kts: 500,
    g_actual: 1.913,
    aoa_deg: 3.07,
    requested_g_cmd: 8.08,
    g_cmd: 8.08,
    closure_kts: 300,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
  }, "f22", controllerState);

  assert.equal(stalePull.target.combatDefensiveBreakActive, true);
  assert.equal(stalePull.target.combatDownhillSliceActive, false);
  assert.equal(stalePull.target.combatDownhillRecoveryPhase, "roll");
  assert.equal(stalePull.target.combatDownhillRecoveryRollArmed, false);
  assert.equal(stalePull.target.desiredBankDeg, -105.3);
  assert.ok(stalePull.roll <= 0 && Math.abs(stalePull.roll) < 0.1,
    "recovery may brake residual rate but cannot accelerate toward level behind a stale pull");
  assert.equal(stalePull.pitch, -0.08);

  const cleanUnload = fixedWingAiCommand({
    px: 0, py: 4_000, pz: 0,
    bx: -2_000, by: 3_000, bz: 0,
    heading_deg: 0,
    bank_deg: -105.3,
    roll_rate_dps: 0,
    gamma_deg: -20,
    true_airspeed_kts: 500,
    g_actual: 1.8,
    aoa_deg: 3,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    closure_kts: 300,
    lead_valid: false,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
  }, "f22", controllerState);
  assert.equal(cleanUnload.target.combatDownhillRecoveryRollArmed, true);
  assert.equal(cleanUnload.target.desiredBankDeg, 0);
  assert.ok(cleanUnload.roll > 0,
    "the same recovery may roll upright once plant and command channels agree");
});

test("escape recovery preserves downhill rearm hysteresis across depressed geometry", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDownhillSliceRearmBlocked = true;
  const depressed = {
    px: 0, py: 4_500, pz: 0,
    bx: 2_000, by: 3_500, bz: 0,
    heading_deg: 0, bank_deg: 0, roll_rate_dps: 0, gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 500,
    lead_valid: false,
  };

  const interrupted = fixedWingAiCommand({
    ...depressed,
    auto_gcas_active: true,
  }, "f22", controllerState);
  assert.equal(interrupted.target.terrainRecoveryPhase, "auto-gcas");
  assert.equal(controllerState.combatDownhillSliceRearmBlocked, true,
    "an unrelated escape cannot erase unresolved downhill geometry");

  const handback = fixedWingAiCommand({
    ...depressed,
    gamma_deg: 10,
    auto_gcas_active: false,
  }, "f22", controllerState);
  assert.equal(handback.target.terrainRecoveryPhase, "idle");
  assert.equal(handback.target.combatDownhillSliceActive, false,
    "the first post-escape frame cannot re-enter the same depressed slice");
  assert.equal(controllerState.combatDownhillSliceRearmBlocked, true);
  assert.ok(handback.pitch >= 0);

  fixedWingAiCommand({
    ...depressed,
    bx: 0,
    bz: 2_000,
    gamma_deg: 10,
    auto_gcas_active: false,
  }, "f22", controllerState);
  assert.equal(controllerState.combatDownhillSliceRearmBlocked, false,
    "the normal geometric release still clears the hysteresis latch");
});

test("downhill slice cannot reverse an already-owned inverted recovery", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 4_500, pz: 0,
    bx: 2_000, bz: 0,
    heading_deg: 0,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const overbanked = fixedWingAiCommand({
    ...common,
    by: 4_500,
    bank_deg: -144,
    roll_rate_dps: 68,
    gamma_deg: 5,
  }, "f22", controllerState);
  assert.equal(overbanked.target.invertedRecoveryActive, true);
  assert.equal(overbanked.target.invertedRecoveryTargetBankDeg, -78);
  assert.equal(overbanked.target.desiredBankDeg, -78);

  const tempted = fixedWingAiCommand({
    ...common,
    by: 3_500,
    bank_deg: -141,
    roll_rate_dps: 90,
    gamma_deg: 5,
  }, "f22", controllerState);
  assert.equal(tempted.target.invertedRecoveryActive, true);
  assert.equal(tempted.target.combatDownhillSliceActive, false);
  assert.equal(tempted.target.desiredBankDeg, -78,
    "a depressed contact cannot flip same-side recovery into an immediate split-S");
  assert.ok(tempted.roll > 0,
    "the established roll toward -78 must remain continuous across the handoff");
});

test("Tape 463 settled inverted recovery blocks an immediate fresh downhill slice", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.invertedRecoveryActive = true;
  controllerState.invertedRecoveryRollArmed = true;
  controllerState.invertedRecoveryTargetBankDeg = -78;
  const depressed = {
    px: 0, py: 4_500, pz: 0,
    bx: -2_000, by: 3_500, bz: 0,
    heading_deg: 0,
    bank_deg: -78,
    roll_rate_dps: -14,
    gamma_deg: -24,
    true_airspeed_kts: 220,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    closure_kts: 125,
    lead_valid: false,
  };
  const release = fixedWingAiCommand(depressed, "f22", controllerState);
  assert.equal(release.target.invertedRecoveryActive, false);
  assert.equal(release.target.combatDownhillSliceActive, false,
    "the recovery-release frame cannot author another inverted plane");
  assert.equal(controllerState.combatDownhillSliceRearmBlocked, true);
  assert.notEqual(Math.abs(release.target.desiredBankDeg), 180);

  const nextFrame = fixedWingAiCommand({
    ...depressed,
    roll_rate_dps: -8,
  }, "f22", controllerState);
  assert.equal(nextFrame.target.combatDownhillSliceActive, false);
  assert.equal(controllerState.combatDownhillSliceRearmBlocked, true,
    "depressed geometry must retain the handoff hysteresis beyond one frame");
  assert.notEqual(Math.abs(nextFrame.target.desiredBankDeg), 180);

  fixedWingAiCommand({
    ...depressed,
    bx: 0,
    by: 4_500,
    bz: 2_000,
    roll_rate_dps: 0,
  }, "f22", controllerState);
  assert.equal(controllerState.combatDownhillSliceRearmBlocked, false,
    "normal nose-captured geometry still clears the rearm block");
});

test("vertical recovery waits for roll rate before latching the earthward pull", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 5_900, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, bank_deg: 174, gamma_deg: 48,
    true_airspeed_kts: 470,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const stillRolling = fixedWingAiCommand({
    ...common,
    roll_rate_dps: 50,
  }, "f22", controllerState);
  assert.equal(stillRolling.target.verticalRecoveryPhase, "slice");
  assert.equal(stillRolling.target.verticalRecoveryPullActive, false);
  assert.equal(stillRolling.pitch, -0.14,
    "overbank alone cannot hand a rolling aircraft to the high-G pull");

  const settled = fixedWingAiCommand({
    ...common,
    roll_rate_dps: 15,
  }, "f22", controllerState);
  assert.equal(settled.target.verticalRecoveryPullActive, true);
  assert.equal(settled.target.desiredLoadFactorG, 6.5);

  const coupledRate = fixedWingAiCommand({
    ...common,
    roll_rate_dps: 45,
  }, "f22", controllerState);
  assert.equal(coupledRate.target.verticalRecoveryPullActive, true,
    "normal roll/pitch coupling must not chatter the latched recovery pull");
  assert.equal(coupledRate.target.desiredLoadFactorG, 6.5);
});

test("vertical recovery latches its slice direction across the Euler bank seam", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 6_800, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, gamma_deg: 80,
    true_airspeed_kts: 410,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const positiveSide = fixedWingAiCommand(
    { ...common, bank_deg: 179.8 }, "f22", controllerState,
  );
  const negativeSide = fixedWingAiCommand(
    { ...common, bank_deg: -179.8 }, "f22", controllerState,
  );
  assert.equal(positiveSide.target.verticalRecoveryPhase, "slice");
  assert.equal(negativeSide.target.verticalRecoveryPhase, "slice");
  assert.equal(positiveSide.target.desiredBankDeg, 180);
  assert.equal(negativeSide.target.desiredBankDeg, 180);
  assert.ok(Math.abs(positiveSide.roll) < 0.05 && Math.abs(negativeSide.roll) < 0.05,
    "both Euler representations must recognize the same inverted plane");
  assert.equal(positiveSide.target.verticalRecoveryPullActive, false);
  assert.equal(negativeSide.target.verticalRecoveryPullActive, false);
  assert.equal(positiveSide.pitch, -0.14);
  assert.equal(negativeSide.pitch, -0.14,
    "crossing the Euler seam cannot earn pull before the authored plane is captured");
  const captured = fixedWingAiCommand(
    { ...common, bank_deg: 180, roll_rate_dps: 0 }, "f22", controllerState,
  );
  assert.equal(captured.target.verticalRecoveryPullActive, true);
  assert.equal(captured.target.desiredLoadFactorG, 6.5);
  assert.equal(positiveSide.throttleDown, true);
  assert.equal(negativeSide.throttleDown, true);
  assert.equal(positiveSide.throttleUp, false);
  assert.equal(negativeSide.throttleUp, false);
});

test("vertical recovery ignores an ordinary mild high-altitude climb", () => {
  const command = fixedWingAiCommand({
    px: 0, py: 5_900, pz: 0,
    bx: 0, by: 6_100, bz: 2_000,
    heading_deg: 0, bank_deg: 20, gamma_deg: 12,
    true_airspeed_kts: 470,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(command.target.verticalEscapeRecovery, false);
  assert.notEqual(Math.abs(command.target.desiredBankDeg), 180);
});

test("vertical recovery levels only after establishing an earthward flight path", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 6_800, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, bank_deg: 180,
    true_airspeed_kts: 410,
    lead_valid: false,
  };
  const slice = fixedWingAiCommand({ ...common, gamma_deg: 60 }, "f22", controllerState);
  const stillSlice = fixedWingAiCommand({ ...common, gamma_deg: 2 }, "f22", controllerState);
  const level = fixedWingAiCommand({
    ...common, gamma_deg: -9, g_actual: 2.2, aoa_deg: 10,
  }, "f22", controllerState);
  assert.equal(slice.target.verticalRecoveryPhase, "slice");
  assert.equal(stillSlice.target.verticalRecoveryPhase, "slice");
  assert.equal(level.target.verticalRecoveryPhase, "level");
  assert.equal(level.target.desiredBankDeg, 0);
  assert.equal(level.pitch, -0.08,
    "level-out keeps a shallow explicit unload until the recovery latch releases");
});

test("vertical recovery unloads before rolling upright and waits for roll rate before handback", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    px: 0, py: 6_800, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, bank_deg: 180, roll_rate_dps: 0,
    true_airspeed_kts: 410,
    lead_valid: false,
  };
  fixedWingAiCommand({
    ...common, gamma_deg: 60, g_actual: 1, aoa_deg: 5,
  }, "f22", controllerState);

  const highLiftHandoff = fixedWingAiCommand({
    ...common, gamma_deg: -9, g_actual: 4.96, aoa_deg: 19.6,
  }, "f22", controllerState);
  assert.equal(highLiftHandoff.target.verticalRecoveryPhase, "level");
  assert.equal(highLiftHandoff.target.verticalRecoveryLevelRollArmed, false);
  assert.equal(Math.abs(highLiftHandoff.target.desiredBankDeg), 180,
    "high-lift handoff must retain its slice plane instead of adding full aileron");
  assert.equal(highLiftHandoff.roll, 0);
  assert.equal(highLiftHandoff.pitch, -0.08);

  for (const telemetryGap of [
    { g_actual: undefined, aoa_deg: 10 },
    { g_actual: 2.2, aoa_deg: undefined },
    { g_actual: Number.NaN, aoa_deg: 10 },
    { g_actual: 2.2, aoa_deg: Number.POSITIVE_INFINITY },
  ]) {
    const unprovenUnload = fixedWingAiCommand({
      ...common, gamma_deg: -9, ...telemetryGap,
    }, "f22", controllerState);
    assert.equal(unprovenUnload.target.verticalRecoveryLevelRollArmed, false,
      "missing or non-finite load/AoA telemetry must hold the established slice plane");
    assert.equal(Math.abs(unprovenUnload.target.desiredBankDeg), 180);
    assert.equal(unprovenUnload.roll, 0);
  }

  const rollArmed = fixedWingAiCommand({
    ...common, gamma_deg: -9, g_actual: 2.2, aoa_deg: 10,
  }, "f22", controllerState);
  assert.equal(rollArmed.target.verticalRecoveryLevelRollArmed, true);
  assert.equal(rollArmed.target.desiredBankDeg, 0);
  assert.ok(rollArmed.roll < -0.9,
    "only the unloaded aircraft may begin the upright roll");

  const loadRebuilt = fixedWingAiCommand({
    ...common, gamma_deg: -9, g_actual: 5, aoa_deg: 19,
  }, "f22", controllerState);
  assert.equal(loadRebuilt.target.verticalRecoveryLevelRollArmed, false,
    "a stale safe sample cannot preserve upright-roll permission after load rebuilds");
  assert.equal(Math.abs(loadRebuilt.target.desiredBankDeg), 180);
  assert.equal(loadRebuilt.roll, 0);

  const stillRolling = fixedWingAiCommand({
    ...common,
    gamma_deg: -9,
    bank_deg: 34,
    roll_rate_dps: -74,
    g_actual: 1.2,
    aoa_deg: 6,
  }, "f22", controllerState);
  assert.equal(stillRolling.target.verticalRecoveryPhase, "level",
    "bank alone cannot return a 74-degree-per-second aircraft to combat pull");
  assert.equal(stillRolling.pitch, -0.08);

  const settled = fixedWingAiCommand({
    ...common,
    gamma_deg: -9,
    bank_deg: 30,
    roll_rate_dps: -10,
    g_actual: 1.1,
    aoa_deg: 5,
  }, "f22", controllerState);
  assert.equal(settled.target.verticalRecoveryPhase, "idle");
});

test("vertical recovery hands back a safe close gun shot instead of diving past it", () => {
  const controllerState = createFixedWingAiControllerState();
  fixedWingAiCommand({
    px: 0, py: 5_900, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, bank_deg: 180, roll_rate_dps: 0, gamma_deg: 48,
    radar_alt_ft: 8_000,
    true_airspeed_kts: 470,
    lead_valid: false,
  }, "f22", controllerState);

  const shot = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 180,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg: 2,
      altitudeM: 2_800,
      gammaDeg: 23,
    }),
    radar_alt_ft: 5_000,
  }, "f22", controllerState);

  assert.equal(shot.target.verticalRecoveryShotOpportunity, true);
  assert.equal(shot.target.verticalRecoveryPhase, "idle");
  assert.equal(shot.target.gunLeadFinisherActive, true);
  assert.equal(shot.target.gunLeadCartesianRollActive, true,
    "the first handed-back frame immediately resumes physical lead-plane steering");

  const capturedShot = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 180,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg: 2,
      altitudeM: 2_800,
      gammaDeg: 23,
    }),
    radar_alt_ft: 5_000,
  }, "f22", controllerState);
  assert.equal(capturedShot.target.gunLeadRollCaptureActive, true,
    "a stable second lead frame enters fine roll capture without recovery reclaiming control");

  const lowControllerState = createFixedWingAiControllerState();
  fixedWingAiCommand({
    px: 0, py: 5_900, pz: 0,
    bx: 0, by: 6_000, bz: -2_000,
    heading_deg: 0, bank_deg: 180, roll_rate_dps: 0, gamma_deg: 48,
    radar_alt_ft: 8_000,
    true_airspeed_kts: 470,
    lead_valid: false,
  }, "f22", lowControllerState);
  const lowShot = fixedWingAiCommand({
    ...f22LeadPlaneState({
      bankDeg: 180,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg: 2,
      altitudeM: 900,
      gammaDeg: 23,
    }),
    radar_alt_ft: 2_500,
  }, "f22", lowControllerState);
  assert.equal(lowShot.target.verticalRecoveryShotOpportunity, false);
  assert.equal(lowShot.target.verticalRecoveryPhase, "slice",
    "a low-altitude pipper coincidence cannot cancel escape recovery");
});

test("Tape 449 keeps a captured high-altitude gun pass through the 42-degree seam", () => {
  const commandAt = ({
    offBoresightDeg = 3.13,
    gammaDeg = 42.18,
    radarAltitudeFt = 11_950,
    rangeM = 673.4,
    closureKts = -34.6,
    rollRateDps = 12.78,
    altitudeM = 3_000,
    targetEntityId = "tape-449",
    finisherActive = true,
    rollCaptureActive = true,
    captureBankDeg = -61.4,
    actualG = 5.02,
    aoaDeg = 14.51,
    stateOverrides = {},
  } = {}) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = finisherActive;
    controllerState.gunLeadRollCaptureActive = rollCaptureActive;
    controllerState.gunLeadRollCaptureBankDeg = captureBankDeg;
    controllerState.gunLeadRollCaptureTargetKey = `entity:${targetEntityId}`;
    return fixedWingAiCommand({
      ...f22LeadPlaneState({
        bankDeg: -85.62,
        rollRateDps,
        planeErrorDeg: 23.8,
        offBoresightDeg,
        altitudeM,
        gammaDeg,
      }),
      bandit_entity_id: targetEntityId,
      range_m: rangeM,
      closure_kts: closureKts,
      radar_alt_ft: radarAltitudeFt,
      g_actual: actualG,
      aoa_deg: aoaDeg,
      gunnery_pitch_assist: true,
      ...stateOverrides,
    }, "f22", controllerState);
  };

  const captured = commandAt();
  assert.equal(captured.target.verticalRecoveryCapturedShotOpportunity, true);
  assert.equal(captured.target.verticalRecoveryPhase, "idle",
    "the generic anti-zoom threshold cannot discard Tape 449's improving 673 m capture");
  assert.equal(captured.target.gunLeadFinisherActive, true);
  assert.equal(captured.target.gunLeadRollCaptureActive, true);
  assert.ok(Math.abs(captured.roll) < 0.15,
    `the loaded captured pass applied ${captured.roll.toFixed(3)} roll`);

  for (const [label, unsafe] of [
    ["finisher latch", commandAt({ finisherActive: false })],
    ["roll-capture latch", commandAt({ rollCaptureActive: false })],
    ["stale capture bank", commandAt({ captureBankDeg: -55.61 })],
    ["six-degree lane", commandAt({ offBoresightDeg: 6.01 })],
    ["1,200-m range", commandAt({ rangeM: 1_200.01 })],
    ["opening-closure boundary", commandAt({ closureKts: -250 })],
    ["closing-closure boundary", commandAt({ closureKts: 650 })],
    ["15-degree roll-rate boundary", commandAt({ rollRateDps: 15.01 })],
    ["45-degree ceiling", commandAt({ gammaDeg: 45.01 })],
    ["6,200-m altitude ceiling", commandAt({ altitudeM: 6_200.01 })],
    ["terrain clearance", commandAt({ radarAltitudeFt: 2_999 })],
    ["target identity", commandAt({
      targetEntityId: "successor",
      stateOverrides: { bandit_entity_id: "different-successor" },
    })],
    ["inverted owner", commandAt({ stateOverrides: { bank_deg: -106 } })],
  ]) {
    assert.equal(unsafe.target.verticalRecoveryCapturedShotOpportunity, false, label);
    assert.equal(unsafe.target.verticalRecoveryPhase, "slice",
      `${label} loss must restore anti-zoom authority immediately`);
  }

  const terrainOwned = commandAt({ stateOverrides: { auto_gcas_warning: true } });
  assert.equal(terrainOwned.target.verticalRecoveryCapturedShotOpportunity, false);
  assert.notEqual(terrainOwned.target.terrainRecoveryPhase, "idle");
  assert.equal(terrainOwned.target.verticalRecoveryPhase, "idle",
    "terrain recovery must retain priority over both the captured pass and anti-zoom slice");
});

test("combat turn pull gives way to a real nose-down command as gamma rises", () => {
  const common = {
    px: 0, py: 4_200, pz: 0,
    bx: 2_000, by: 4_200, bz: 0,
    heading_deg: 0, bank_deg: 76,
    roll_rate_dps: 0,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    lead_valid: false,
  };
  assert.ok(fixedWingAiCommand({ ...common, gamma_deg: 4 }, "f22").pitch > 0.35);
  assert.ok(fixedWingAiCommand({ ...common, gamma_deg: 28 }, "f22").pitch < -0.4);

  const fastOpening = fixedWingAiCommand({
    ...common,
    gamma_deg: 28,
    closure_kts: -300,
  }, "f22");
  assert.equal(fastOpening.target.combatDownhillSliceActive, false);
  assert.ok(Math.abs(fastOpening.pitch + 0.10) < 1e-9,
    "a high-bank fast-opening contact needs an unload, not prolonged negative G");
  assert.ok(fixedWingAiCommand({
    ...common,
    gamma_deg: 28,
    closure_kts: -249,
  }, "f22").pitch < -0.4,
  "the opening-rate boundary cannot weaken ordinary high-gamma recovery");
  assert.ok(fixedWingAiCommand({
    ...common,
    bank_deg: 59,
    gamma_deg: 28,
    closure_kts: -300,
  }, "f22").pitch < -0.4,
  "the high-bank visual guard cannot erase a normal nose-down command");
});

test("combat turn completes a true split-S toward a bandit far below", () => {
  const controllerState = createFixedWingAiControllerState();
  const common = {
    // Tape 365 around 100 s: ownship stayed near +12 degrees gamma while the opponent had
    // descended more than four kilometres. Tape 367 then showed why simply pushing was wrong:
    // negative G at 78 degrees of bank reversed the turn and grew heading error to 159 degrees.
    px: 0, py: 5_100, pz: 0,
    bx: 1, by: 600, bz: -2_500,
    heading_deg: 0, bank_deg: 80, gamma_deg: 12,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const entry = fixedWingAiCommand(common, "f22", controllerState);
  assert.ok(entry.target.desiredGammaDeg <= -18);
  assert.equal(entry.target.combatDownhillSliceActive, true);
  assert.equal(entry.target.desiredBankDeg, 80);
  assert.equal(entry.pitch, -0.10);
  const committed = fixedWingAiCommand(common, "f22", controllerState);
  assert.equal(committed.target.desiredBankDeg, 180);
  assert.equal(committed.pitch, -0.10,
    "the slice must finish moving the lift plane before rebuilding positive G");
  const aligned = fixedWingAiCommand({
    ...common,
    bank_deg: 174,
    roll_rate_dps: 10,
  }, "f22", controllerState);
  assert.ok(aligned.pitch > 0.65,
    "an aligned inverted pull must descend without a prolonged oblique lift vector");
  assert.ok(aligned.target.desiredLoadFactorG <= 6.5,
    "the generic split-S must not hide another structural-limit pull");

  const acrossBehindSeam = fixedWingAiCommand({
    ...common,
    bx: -1,
    bank_deg: 176,
    roll_rate_dps: 0,
  }, "f22", controllerState);
  assert.equal(acrossBehindSeam.target.desiredBankDeg, 180,
    "tiny target noise across the directly-behind seam cannot reverse the slice");
  assert.equal(acrossBehindSeam.target.combatDownhillSlicePullActive, true);
  assert.ok(acrossBehindSeam.pitch > 0.65,
    "a captured slice must not toggle back to unload under ordinary coupling drift");
});

test("Tape 469 rejects an above-path slice while a genuine Tape 449 plane change unloads", () => {
  const controllerState = createFixedWingAiControllerState();
  const tape449Entry = {
    px: -3_142.752, py: 3_939.261, pz: -1_821.99,
    bx: -2_061.298, by: 3_971.677, bz: -1_644.996,
    lead_x: -2_145.729, lead_y: 3_823.621, lead_z: -1_389.932,
    lead_valid: true,
    heading_deg: 135.93,
    bank_deg: -73.08,
    roll_rate_dps: -13.96,
    gamma_deg: -18.37,
    true_airspeed_kts: 317.95,
    calibrated_airspeed_kts: 262.8,
    g_actual: 5.609,
    aoa_deg: 19.12,
    range_m: 1_096.3,
    closure_kts: -173.8,
    g_maxperform: 5.985,
  };

  const falseDownhill = fixedWingAiCommand(
    tape449Entry, "f22", createFixedWingAiControllerState(),
  );
  assert.equal(falseDownhill.target.combatDownhillSliceActive, false,
    "a contact above the current descending flight path cannot author another earthward slice");

  // Preserve the original loaded-plane safety regression with real below-flight-path geometry.
  // Gamma is the only changed channel; bank, G, alpha, target and closure remain Tape 449 exact.
  const genuineDownhillEntry = { ...tape449Entry, gamma_deg: 0 };
  const loaded = fixedWingAiCommand(genuineDownhillEntry, "f22", controllerState);
  assert.equal(loaded.target.combatDownhillSliceActive, true);
  assert.equal(loaded.target.combatDownhillSliceRollArmed, false);
  assert.equal(loaded.target.desiredBankDeg, tape449Entry.bank_deg,
    "5.6 G / 19-degree-alpha entry must hold its plane instead of applying full aileron");
  assert.ok(loaded.roll >= 0,
    "the controller may damp existing roll but cannot accelerate toward inversion while loaded");
  assert.equal(loaded.pitch, -0.10);

  const staleLowActual = fixedWingAiCommand({
    ...genuineDownhillEntry,
    roll_rate_dps: 0,
    g_actual: 1.582,
    aoa_deg: 4,
    requested_g_cmd: 5.677,
    g_cmd: 5.677,
  }, "f22", controllerState);
  assert.equal(staleLowActual.target.combatDownhillSliceRollArmed, false,
    "low actual G cannot arm while the plant still carries the previous pull command");

  const cleanUnloadState = {
    ...genuineDownhillEntry,
    roll_rate_dps: 0,
    g_actual: 1.8,
    aoa_deg: 8,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  };
  const firstCleanUnload = fixedWingAiCommand(
    cleanUnloadState, "f22", controllerState,
  );
  assert.equal(firstCleanUnload.target.combatDownhillSliceRollArmed, false);
  const unloaded = fixedWingAiCommand(cleanUnloadState, "f22", controllerState);
  assert.equal(unloaded.target.combatDownhillSliceActive, true);
  assert.equal(unloaded.target.combatDownhillSliceRollArmed, true);
  assert.equal(unloaded.target.desiredBankDeg, -180);
  assert.ok(unloaded.roll < 0,
    "the earthward plane change is authorized once measured load and alpha settle");

  const loadRebuiltBeforePlane = fixedWingAiCommand({
    ...genuineDownhillEntry,
    bank_deg: -85,
    roll_rate_dps: -30,
    g_actual: 5,
    aoa_deg: 19,
  }, "f22", controllerState);
  assert.equal(loadRebuiltBeforePlane.target.combatDownhillSliceActive, true);
  assert.equal(loadRebuiltBeforePlane.target.combatDownhillSliceRollArmed, true,
    "the committed slice cannot toggle its plane when lagging load rebuilds");
  assert.equal(loadRebuiltBeforePlane.target.desiredBankDeg, -180);
  assert.equal(loadRebuiltBeforePlane.roll, 0,
    "unsafe rebound must pause accelerating aileron without reversing the plane target");
  assert.equal(loadRebuiltBeforePlane.pitch, -0.10);
});

test("Tape 447 keeps generic downhill slices outside the close gun fight", () => {
  const closeDepressedContact = {
    px: 0, py: 3_000, pz: 0,
    bx: 500, by: 2_700, bz: 0,
    heading_deg: 0,
    bank_deg: 0,
    roll_rate_dps: 0,
    gamma_deg: 0,
    true_airspeed_kts: 400,
    range_m: 536.7,
    closure_kts: -397.4,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const close = fixedWingAiCommand(
    closeDepressedContact, "f22", createFixedWingAiControllerState(),
  );
  assert.equal(close.target.combatDownhillSliceActive, false,
    "a close opening contact needs lag pursuit and energy, not another split-S");
  assert.notEqual(Math.abs(close.target.desiredBankDeg), 180);

  const separated = fixedWingAiCommand({
    ...closeDepressedContact,
    range_m: 699.9,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(separated.target.combatDownhillSliceActive, false,
    "Tape 448 proved 651.7 m was still inside the opponent's firing setup");

  const earnedController = createFixedWingAiControllerState();
  const earnedState = {
    ...closeDepressedContact,
    range_m: 700,
    closure_kts: -249.9,
    bank_deg: 80,
  };
  const earnedEntry = fixedWingAiCommand(earnedState, "f22", earnedController);
  assert.equal(earnedEntry.target.combatDownhillSliceActive, true);
  assert.equal(earnedEntry.target.combatDownhillSliceRollArmed, false);
  const earnedSeparation = fixedWingAiCommand(earnedState, "f22", earnedController);
  assert.equal(earnedSeparation.target.combatDownhillSliceActive, true,
    "the vertical conversion remains available once 700 m of close-BFM separation is earned");
  assert.equal(earnedSeparation.target.desiredBankDeg, 180);
});

test("combat controller breaks into formation gunfire and holds through projectile flight", () => {
  const controllerState = createFixedWingAiControllerState();
  const underFire = {
    // Tape 368: w1 began a nine-round burst 592 m astern while the old controller held negative
    // pitch at 60 degrees bank. All three lethal rounds arrived after the trigger was released.
    px: 0, py: 2_300, pz: 0,
    bx: 2_000, by: 2_300, bz: 500,
    w1_present: 1,
    w1_alive: 1,
    w1x: 125,
    w1y: 2_335,
    w1z: -580,
    w1_trigger_down: 1,
    w1_gun_firing: 1,
    formation_gun_firing: true,
    heading_deg: 0,
    bank_deg: 60,
    gamma_deg: -6,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 500,
    lead_valid: false,
  };
  const breaking = fixedWingAiCommand(underFire, "f22", controllerState);
  assert.equal(breaking.target.combatDefensiveBreakActive, true);
  assert.equal(breaking.target.gunLeadFinisherActive, false);
  assert.equal(breaking.target.desiredBankDeg, 78);
  assert.ok(breaking.pitch > 0.85,
    "the bot must pull into an attacker at six o'clock, not steady the tail shot with negative G");

  const clear = {
    ...underFire,
    w1_trigger_down: 0,
    w1_gun_firing: 0,
    formation_gun_firing: false,
    // The attacker has crossed ahead; only the in-flight-round hold keeps the break active.
    w1x: -125,
    w1z: 1_500,
  };
  let holding = fixedWingAiCommand(clear, "f22", controllerState);
  assert.equal(holding.target.combatDefensiveBreakActive, true);
  assert.equal(holding.target.desiredBankDeg, 78);
  for (let sample = 1; sample < 32; sample += 1) {
    holding = fixedWingAiCommand(clear, "f22", controllerState);
  }
  assert.equal(holding.target.combatDefensiveBreakActive, false,
    "the break may release only after the in-flight-round hold expires");

  const renewed = fixedWingAiCommand({
    ...underFire,
    bank_deg: 78,
    roll_rate_dps: 0,
  }, "f22", controllerState);
  assert.equal(renewed.target.desiredBankDeg, 78,
    "a new gunfire episode must re-solve the physical attacker side");
  assert.ok(renewed.pitch > 0.85,
    "an already aligned high-urgency break must pull instead of making a blind reversal");
  const sameRenewedBurst = fixedWingAiCommand({
    ...underFire,
    bank_deg: 78,
    roll_rate_dps: 0,
  }, "f22", controllerState);
  assert.equal(sameRenewedBurst.target.desiredBankDeg, 78,
    "continuous firing samples must not flip the committed break side back and forth");

  const beforeTrigger = fixedWingAiCommand({
    ...underFire,
    w1_trigger_down: 0,
    w1_gun_firing: 0,
    formation_gun_firing: false,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(beforeTrigger.target.combatDefensiveBreakActive, true);
  assert.equal(beforeTrigger.target.combatDefensiveThreatReason, "rear-quarter",
    "an unselected fighter settled inside the rear threat cone must trigger a pre-shot break");

  const primaryThreatState = {
    ...underFire,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: false,
    opponent_trigger_down: false,
    formation_gun_firing: false,
    bx: 125,
    by: 2_335,
    bz: -580,
    bfx: -125 / Math.hypot(125, 35, 580),
    bfy: -35 / Math.hypot(125, 35, 580),
    bfz: 580 / Math.hypot(125, 35, 580),
    w1_present: 0,
    w1_alive: 0,
    w1_trigger_down: 0,
    w1_gun_firing: 0,
    closure_kts: 500,
    bandit_entity_id: "primary-threat",
  };
  const primaryThreatController = createFixedWingAiControllerState();
  const primaryAimCandidate = fixedWingAiCommand(
    primaryThreatState, "f22", primaryThreatController,
  );
  assert.equal(primaryAimCandidate.target.combatDefensiveBreakActive, false,
    "one aimed authority sample must not start a defensive break");
  const primaryBeforeTrigger = fixedWingAiCommand(
    primaryThreatState, "f22", primaryThreatController,
  );
  assert.equal(primaryBeforeTrigger.target.combatDefensiveBreakActive, true);
  assert.equal(primaryBeforeTrigger.target.combatDefensiveThreatReason, "primary-aiming",
    "the selected bandit must not get a free gun solution while the bot waits for tracers");
  assert.ok(primaryBeforeTrigger.target.combatDefensiveOpponentNoseErrorDeg < 0.01);

  const tape432EarlyWarningState = {
    ...underFire,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: false,
    opponent_trigger_down: false,
    formation_gun_firing: false,
    bx: 0,
    by: 2_300,
    bz: -1_450,
    bfx: 0,
    bfy: 0,
    bfz: 1,
    w1_present: 0,
    w1_alive: 0,
    w1_trigger_down: 0,
    w1_gun_firing: 0,
    closure_kts: 810,
    bandit_entity_id: "tape-432-threat",
  };
  const tape432ThreatController = createFixedWingAiControllerState();
  fixedWingAiCommand(
    tape432EarlyWarningState, "f22", tape432ThreatController,
  );
  const tape432EarlyWarning = fixedWingAiCommand(
    tape432EarlyWarningState, "f22", tape432ThreatController,
  );
  assert.equal(tape432EarlyWarning.target.combatDefensiveBreakActive, true);
  assert.equal(tape432EarlyWarning.target.combatDefensiveThreatReason, "primary-aiming",
    "a precisely aimed primary at 1.45 km must not keep a free tracking run to gun range");

  const primaryAhead = fixedWingAiCommand({
    ...underFire,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: false,
    opponent_trigger_down: false,
    formation_gun_firing: false,
    bx: 125,
    by: 2_335,
    bz: 580,
    bfx: 0,
    bfy: 0,
    bfz: 1,
    w1_present: 0,
    w1_alive: 0,
    w1_trigger_down: 0,
    w1_gun_firing: 0,
  }, "f22", createFixedWingAiControllerState());
  assert.equal(primaryAhead.target.combatDefensiveBreakActive, false,
    "a nearby bandit whose nose is not tracking us is still an offensive target, not a threat");
});

test("Tape 477 keeps a bounded captured press briefly but never outranks real fire", () => {
  const attackState = ({
    noseErrorDeg = 28.4,
    offBoresightDeg = 2.05,
    opponentGunFiring = false,
    formationGunFiring = false,
    wingmanGunFiring = false,
  } = {}) => {
    const state = f22LeadPlaneState({
      bankDeg: 82,
      rollRateDps: 0,
      planeErrorDeg: 0,
      offBoresightDeg,
    });
    const relative = [state.bx - state.px, state.by - state.py, state.bz - state.pz];
    const rangeM = Math.hypot(...relative);
    const towardOwnship = relative.map((value) => -value / rangeM);
    const horizontal = Math.hypot(towardOwnship[0], towardOwnship[2]);
    const perpendicular = [
      towardOwnship[2] / horizontal,
      0,
      -towardOwnship[0] / horizontal,
    ];
    const noseErrorRad = noseErrorDeg * Math.PI / 180;
    return {
      ...state,
      bfx: towardOwnship[0] * Math.cos(noseErrorRad)
        + perpendicular[0] * Math.sin(noseErrorRad),
      bfy: towardOwnship[1] * Math.cos(noseErrorRad),
      bfz: towardOwnship[2] * Math.cos(noseErrorRad)
        + perpendicular[2] * Math.sin(noseErrorRad),
      opponent_present: true,
      opponent_alive: true,
      opponent_gun_firing: opponentGunFiring,
      formation_gun_firing: formationGunFiring,
      w1_present: wingmanGunFiring ? 1 : 0,
      w1_alive: wingmanGunFiring ? 1 : 0,
      w1_trigger_down: wingmanGunFiring ? 1 : 0,
      w1_gun_firing: wingmanGunFiring ? 1 : 0,
      w1x: state.px,
      w1y: state.py,
      w1z: state.pz - 800,
      bandit_entity_id: "tape-477-press",
      range_m: 1_008,
      closure_kts: 697,
      g_actual: 2.4,
      aoa_deg: 8,
      requested_g_cmd: 2.4,
      g_cmd: 2.4,
    };
  };
  const attackController = () => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.gunLeadFinisherActive = true;
    controllerState.gunLeadFinisherEntryBankDeg = 70;
    controllerState.gunLeadRollCaptureActive = true;
    controllerState.gunLeadRollCaptureBankDeg = 78;
    controllerState.gunLeadCapturedFineRollActive = true;
    controllerState.combatDefensiveLastPrimaryNoseErrorDeg = 29.25;
    controllerState.combatDefensivePrimaryAimSamples = 1;
    controllerState.combatOffensivePressLastLeadOffBoresightDeg = 2.14;
    return controllerState;
  };

  const pressController = attackController();
  const press = fixedWingAiCommand(attackState(), "f22", pressController);
  assert.equal(press.target.combatOffensivePressActive, true);
  assert.equal(press.target.combatDefensiveBreakActive, false,
    "a loose predicted threat cannot discard an already captured, converging gun attack");
  assert.equal(press.target.gunLeadFinisherActive, true);
  assert.ok(Math.abs(press.target.desiredBankDeg) <= 82);
  assert.ok(press.pitch > 0,
    "the sustainable fighting bank must pull with wing lift instead of limiter unload");

  for (let index = 1; index < 7; index += 1) {
    const held = fixedWingAiCommand(attackState(), "f22", pressController);
    assert.equal(held.target.combatOffensivePressActive, true,
      `the bounded press released early on sample ${index + 1}`);
  }
  const exhausted = fixedWingAiCommand(attackState(), "f22", pressController);
  assert.equal(exhausted.target.combatOffensivePressActive, false);
  assert.equal(exhausted.target.combatOffensivePressExhausted, true);
  assert.equal(exhausted.target.combatOffensivePressSamples, 7,
    "the spent allowance should stay saturated and visible in telemetry");
  assert.equal(exhausted.target.combatDefensiveBreakActive, true,
    "the predicted-threat press must expire after seven 20-Hz control samples");

  const chatterController = attackController();
  for (let sample = 1; sample <= 3; sample += 1) {
    const accumulating = fixedWingAiCommand(attackState(), "f22", chatterController);
    assert.equal(accumulating.target.combatOffensivePressSamples, sample);
  }
  const aimBlink = fixedWingAiCommand(
    attackState({ noseErrorDeg: 30.1 }), "f22", chatterController,
  );
  assert.equal(aimBlink.target.combatOffensivePressActive, false);
  assert.equal(aimBlink.target.combatDefensiveBreakActive, false);
  assert.equal(aimBlink.target.gunLeadFinisherActive, true);
  assert.equal(aimBlink.target.combatOffensivePressSamples, 3,
    "one aim-gate blink must pause the captured attack budget instead of replenishing it");
  const aimReacquireDwell = fixedWingAiCommand(
    attackState({ noseErrorDeg: 29.4 }), "f22", chatterController,
  );
  assert.equal(aimReacquireDwell.target.combatOffensivePressActive, false);
  assert.equal(aimReacquireDwell.target.combatOffensivePressSamples, 3);
  const resumedPress = fixedWingAiCommand(attackState(), "f22", chatterController);
  assert.equal(resumedPress.target.combatOffensivePressActive, true);
  assert.equal(resumedPress.target.combatOffensivePressSamples, 4,
    "the same attack must resume its cumulative allowance rather than restarting at one");
  for (let expected = 5; expected <= 7; expected += 1) {
    const accumulating = fixedWingAiCommand(attackState(), "f22", chatterController);
    assert.equal(accumulating.target.combatOffensivePressSamples, expected);
  }
  const chatterExhausted = fixedWingAiCommand(
    attackState(), "f22", chatterController,
  );
  assert.equal(chatterExhausted.target.combatOffensivePressActive, false);
  assert.equal(chatterExhausted.target.combatOffensivePressExhausted, true);
  assert.equal(chatterExhausted.target.combatDefensiveBreakActive, true,
    "aim-gate chatter cannot extend one captured press beyond seven eligible samples");

  const liveFire = fixedWingAiCommand(
    attackState({ opponentGunFiring: true }), "f22", attackController(),
  );
  assert.equal(liveFire.target.combatOffensivePressActive, false);
  assert.equal(liveFire.target.combatDefensiveBreakActive, true,
    "real hostile fire must preempt the captured attack on the same frame");

  const formationFire = fixedWingAiCommand(
    attackState({ formationGunFiring: true }), "f22", attackController(),
  );
  assert.equal(formationFire.target.combatOffensivePressActive, false);
  assert.equal(formationFire.target.combatDefensiveBreakActive, true,
    "formation gunfire must preempt the captured attack on the same frame");

  const wingmanFire = fixedWingAiCommand(
    attackState({ wingmanGunFiring: true }), "f22", attackController(),
  );
  assert.equal(wingmanFire.target.combatOffensivePressActive, false);
  assert.equal(wingmanFire.target.combatDefensiveBreakActive, true,
    "a firing wingman must preempt the captured attack on the same frame");

  const tightNose = fixedWingAiCommand(
    attackState({ noseErrorDeg: 19.9 }), "f22", attackController(),
  );
  assert.equal(tightNose.target.combatOffensivePressActive, false);
  assert.equal(tightNose.target.combatDefensiveBreakActive, true,
    "a bandit inside twenty degrees of its own gun line must own the exchange");

  const divergingController = attackController();
  divergingController.combatOffensivePressSamples = 1;
  const diverging = fixedWingAiCommand(
    attackState({ offBoresightDeg: 4.1 }), "f22", divergingController,
  );
  assert.equal(diverging.target.combatOffensivePressActive, false);
  assert.equal(diverging.target.combatDefensiveBreakActive, true,
    "a worsening player lead cannot retain the offensive exception");
});

test("F-22 pre-shot defense distinguishes converging aim from a diverging pass", () => {
  const aimedBandit = (rangeM, noseErrorDeg, entityId = "bandit") => ({
    px: 0, py: 2_300, pz: 0,
    bx: 0, by: 2_300, bz: -rangeM,
    bfx: Math.sin(noseErrorDeg * Math.PI / 180),
    bfy: 0,
    bfz: Math.cos(noseErrorDeg * Math.PI / 180),
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: false,
    formation_gun_firing: false,
    closure_kts: 810,
    bandit_entity_id: entityId,
    w1_present: 0, w1_alive: 0, w1_trigger_down: 0, w1_gun_firing: 0,
    heading_deg: 0, bank_deg: 45, gamma_deg: 0, roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 450,
    lead_valid: false,
  });

  const diverging = createFixedWingAiControllerState();
  for (const [rangeM, noseErrorDeg] of [
    [1_592, 6.10], [1_537, 6.30], [1_307, 7.30], [1_078, 8.54],
  ]) {
    const command = fixedWingAiCommand(
      aimedBandit(rangeM, noseErrorDeg), "f22", diverging,
    );
    assert.equal(command.target.combatDefensiveBreakActive, false,
      `diverging ${noseErrorDeg.toFixed(2)}-degree aim at ${rangeM} m caused a false break`);
  }

  const converging = createFixedWingAiControllerState();
  const first = fixedWingAiCommand(aimedBandit(1_582, 8.06), "f22", converging);
  const second = fixedWingAiCommand(aimedBandit(1_561, 7.65), "f22", converging);
  assert.equal(first.target.combatDefensiveBreakActive, false);
  assert.equal(second.target.combatDefensiveBreakActive, true,
    "two samples of severe converging aim must break before the bandit reaches gun range");

  const identityReset = createFixedWingAiControllerState();
  fixedWingAiCommand(aimedBandit(1_000, 5.00, "first"), "f22", identityReset);
  const replacementFirst = fixedWingAiCommand(
    aimedBandit(1_000, 4.90, "replacement"), "f22", identityReset,
  );
  const replacementSecond = fixedWingAiCommand(
    aimedBandit(1_000, 4.93, "replacement"), "f22", identityReset,
  );
  assert.equal(replacementFirst.target.combatDefensiveBreakActive, false,
    "a replacement target cannot inherit the prior target's aim dwell");
  assert.equal(replacementSecond.target.combatDefensiveBreakActive, true,
    "the 0.05-degree tolerance must admit steady noisy aim");

  const tape437BearingRad = -78 * Math.PI / 180;
  const tape437HighClosureThreat = {
    ...aimedBandit(1_560, 0, "tape-437-high-closure"),
    bx: Math.sin(tape437BearingRad) * 1_560,
    bz: Math.cos(tape437BearingRad) * 1_560,
    bfx: -Math.sin(tape437BearingRad),
    bfz: -Math.cos(tape437BearingRad),
    closure_kts: 696,
    bank_deg: -79,
    roll_rate_dps: 0,
  };
  const highClosureRenewal = createFixedWingAiControllerState();
  highClosureRenewal.combatDefensiveBreakHasCommitted = true;
  highClosureRenewal.combatDefensiveBreakSign = 1;
  fixedWingAiCommand(tape437HighClosureThreat, "f22", highClosureRenewal);
  const tape437Break = fixedWingAiCommand(
    tape437HighClosureThreat, "f22", highClosureRenewal,
  );
  assert.equal(tape437Break.target.desiredBankDeg, -55,
    "a high-closure episode must keep the attacker side while leaving the steady turn plane");
  assert.ok(tape437Break.pitch > 0.95,
    "tape 437's aligned entry must ask for the full available defensive G");

  const tape457MaintenanceState = {
    ...tape437HighClosureThreat,
    bank_deg: -67.51,
    roll_rate_dps: 14.42,
    g_actual: 7.55,
    aoa_deg: 11,
    requested_g_cmd: 7.46,
    g_cmd: 7.46,
  };
  const tape457Maintenance = fixedWingAiCommand(
    tape457MaintenanceState, "f22", highClosureRenewal,
  );
  assert.equal(tape457Maintenance.target.combatDefensiveBreakControlOwned, true);
  assert.equal(tape457Maintenance.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(tape457Maintenance.target.desiredBankDeg, -55);
  assert.equal(tape457Maintenance.target.combatLoadedRollUnloadActive, false,
    "a bounded same-side correction cannot be mistaken for another tactical plane change");
  assert.ok(tape457Maintenance.roll > 0 && tape457Maintenance.roll < 0.25,
    `defensive bank maintenance produced ${tape457Maintenance.roll.toFixed(3)} roll`);
  assert.ok(tape457Maintenance.pitch > 0.95,
    "bank maintenance must not dump the defensive pull as the shooter reaches gun range");

  const tape447VerticalM = 230;
  const tape447HorizontalM = 650;
  const tape447RangeM = Math.hypot(tape447HorizontalM, tape447VerticalM);
  const tape447HighShooter = {
    ...aimedBandit(tape447HorizontalM, 0, "tape-447-high-shooter"),
    by: 2_300 + tape447VerticalM,
    bz: -tape447HorizontalM,
    bfx: 0,
    bfy: -tape447VerticalM / tape447RangeM,
    bfz: tape447HorizontalM / tape447RangeM,
    closure_kts: 400,
    bank_deg: 76,
    roll_rate_dps: -24,
    g_actual: 8.45,
    aoa_deg: 12,
  };
  const highShooterDefense = createFixedWingAiControllerState();
  fixedWingAiCommand(tape447HighShooter, "f22", highShooterDefense);
  const tape447Entry = fixedWingAiCommand(
    tape447HighShooter, "f22", highShooterDefense,
  );
  assert.equal(tape447Entry.target.combatDefensiveBreakActive, true);
  assert.ok(tape447Entry.target.combatDefensivePrimaryShooterElevationDeg > 19);
  assert.equal(tape447Entry.target.combatLoadedRollUnloadActive, true);
  assert.equal(tape447Entry.target.desiredBankDeg, 76,
    "a loaded high-shooter entry must retain its present lift plane while unloading");
  assert.equal(tape447Entry.target.desiredRollRateDps, 0);
  assert.ok(tape447Entry.roll > 0 && tape447Entry.roll < 0.2,
    "the loaded entry may arrest the existing left roll but cannot drive through knife-edge");
  assert.equal(tape447Entry.pitch, -0.10);

  const tape447Unloaded = fixedWingAiCommand({
    ...tape447HighShooter,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", highShooterDefense);
  assert.equal(tape447Unloaded.target.combatLoadedRollUnloadActive, true);
  assert.equal(tape447Unloaded.target.combatLoadedRollPhase, "unload");
  const tape447Committed = fixedWingAiCommand({
    ...tape447HighShooter,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", highShooterDefense);
  assert.equal(tape447Committed.target.combatLoadedRollPhase, "roll");
  assert.equal(tape447Committed.target.desiredBankDeg, 82,
    "the selected high-shooter plane commits after two clean unload frames");
  assert.equal(tape447Committed.pitch, -0.10);

  const tape447Settled = fixedWingAiCommand({
    ...tape447HighShooter,
    bank_deg: 82,
    roll_rate_dps: 0,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", highShooterDefense);
  assert.equal(tape447Settled.target.combatLoadedRollUnloadActive, false);
  assert.equal(tape447Settled.target.invertedRecoveryActive, false);
  assert.equal(tape447Settled.target.desiredBankDeg, 82);
  assert.ok(Math.abs(tape447Settled.target.desiredLoadFactorG - 8.4) < 1e-9,
    "the settled high plane must stop below the structural-limit presentation");

  const tape490ShallowHighShooter = {
    ...aimedBandit(1_266, 0, "tape-490-shallow-high-shooter"),
    by: 2_300 + 131,
    closure_kts: 179,
    bank_deg: 29.38,
    roll_rate_dps: 0,
    gamma_deg: 0.18,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  };
  const shallowHighShooterDefense = createFixedWingAiControllerState();
  fixedWingAiCommand(
    tape490ShallowHighShooter, "f22", shallowHighShooterDefense,
  );
  const tape490ShallowEntry = fixedWingAiCommand(
    tape490ShallowHighShooter, "f22", shallowHighShooterDefense,
  );
  assert.ok(tape490ShallowEntry.target.combatDefensiveShooterElevationDeg > 5.8);
  assert.ok(tape490ShallowEntry.target.combatDefensiveShooterElevationDeg < 6.1);
  assert.equal(tape490ShallowEntry.target.combatDefensiveBreakPlaneMagnitudeDeg, 55,
    "a one-degree geometry wobble cannot replace the viable jink with Tape 490's lethal wall turn");

  const closeRear = createFixedWingAiControllerState();
  closeRear.combatDefensiveBreakHasCommitted = true;
  closeRear.combatDefensiveBreakSign = 1;
  const closeRearFirst = fixedWingAiCommand({
    ...aimedBandit(650, 46),
    closure_kts: -30,
  }, "f22", closeRear);
  const closeRearSecond = fixedWingAiCommand({
    ...aimedBandit(652, 45),
    closure_kts: -25,
  }, "f22", closeRear);
  assert.equal(closeRearFirst.target.combatDefensiveBreakActive, false);
  assert.equal(closeRearSecond.target.combatDefensiveBreakActive, true,
    "a close bandit narrowing its aim at six o'clock must preempt a predictable slice");
  assert.equal(closeRearSecond.target.desiredBankDeg, -55,
    "the bounded close-rear episode may alternate side but must enter an out-of-plane break");

  const tape455UrgentRear = (noseErrorDeg) => ({
    ...aimedBandit(540, noseErrorDeg, "tape-455-urgent-rear"),
    by: 2_440,
    closure_kts: 124.1,
    bank_deg: -1.2,
    roll_rate_dps: 0.1,
    g_actual: 5.19,
    aoa_deg: 8.08,
    requested_g_cmd: 5.2,
    g_cmd: 5.2,
  });
  const urgentRear = createFixedWingAiControllerState();
  urgentRear.combatDefensiveBreakHasCommitted = true;
  urgentRear.combatDefensiveLastCommittedBreakSign = 1;
  urgentRear.combatDefensiveBreakSign = 1;
  urgentRear.combatDownhillRecoveryPhase = "pull";
  const suppressedBearingRad = -111.36 * Math.PI / 180;
  const suppressedThreat = {
    ...aimedBandit(1_082.5, 0, "tape-455-suppressed-threat"),
    bx: Math.sin(suppressedBearingRad) * 1_082.5,
    by: 2_186.4,
    bz: Math.cos(suppressedBearingRad) * 1_082.5,
    bfx: -Math.sin(suppressedBearingRad),
    bfy: 0,
    bfz: -Math.cos(suppressedBearingRad),
    closure_kts: 384.2,
    bank_deg: -101.4,
    roll_rate_dps: 43.1,
    gamma_deg: -20,
    g_actual: 1.84,
    aoa_deg: 2.89,
  };
  fixedWingAiCommand(suppressedThreat, "f22", urgentRear);
  const recoveryOwnedThreat = fixedWingAiCommand(
    {
      ...suppressedThreat,
      calibrated_airspeed_kts: 362.5,
      corner_speed_kias: 353,
      corner_band_min_kias: 338,
      corner_band_max_kias: 368,
      throttle: 0,
    }, "f22", urgentRear,
  );
  assert.equal(recoveryOwnedThreat.target.combatDefensiveBreakActive, true);
  assert.equal(recoveryOwnedThreat.target.combatDefensiveBreakControlOwned, false);
  assert.equal(recoveryOwnedThreat.target.combatDefensiveBreakSign, -1);
  assert.equal(recoveryOwnedThreat.target.combatDefensiveBreakPlaneMagnitudeDeg, 78,
    "a recovery-suppressed threat cannot preselect a vertical plane the aircraft never flew");
  assert.equal(recoveryOwnedThreat.target.combatDefensiveLastCommittedBreakSign, 1,
    "a recovery-suppressed proposed break cannot overwrite the last plane actually flown");
  assert.equal(recoveryOwnedThreat.target.desiredBankDeg, 0,
    "the fixture must reproduce downhill recovery retaining control over the detected threat");
  assert.equal(recoveryOwnedThreat.target.combatDefensivePowerOverrideActive, true);
  assert.equal(recoveryOwnedThreat.throttleUp, true,
    "a recovery-owned threat must spool combat power before flight-control handoff");
  assert.equal(recoveryOwnedThreat.throttleDown, false,
    "downhill recovery cannot preserve inherited idle after a defensive threat is live");

  const tape459HandoffController = {
    ...urgentRear,
    combatDownhillRecoveryPhase: "idle",
    combatDownhillRecoveryRollArmed: false,
  };
  const tape459Handoff = fixedWingAiCommand({
    ...suppressedThreat,
    opponent_present: false,
    opponent_alive: false,
    bank_deg: 0,
    roll_rate_dps: 0,
    gamma_deg: 0,
    g_actual: 1,
    aoa_deg: 4,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", tape459HandoffController);
  assert.equal(tape459Handoff.target.combatDefensiveBreakActive, true);
  assert.equal(tape459Handoff.target.combatDefensiveBreakControlOwned, true);
  assert.equal(tape459Handoff.target.combatDefensiveBreakPlaneMagnitudeDeg, 78,
    "a transiently clear recovery handoff must use the neutral base plane, not stale 55 degrees");
  assert.equal(tape459Handoff.target.desiredBankDeg, -78);

  const persistentThreatRelease = createFixedWingAiControllerState();
  persistentThreatRelease.combatDefensiveBreakSamples = 32;
  persistentThreatRelease.combatDefensiveBreakSign = -1;
  persistentThreatRelease.combatDownhillRecoveryPhase = "pull";
  const releaseFrame = fixedWingAiCommand({
    ...suppressedThreat,
    opponent_gun_firing: true,
    bank_deg: 0,
    roll_rate_dps: 0,
    gamma_deg: 0,
    g_actual: 2.2,
    aoa_deg: 8,
    requested_g_cmd: 2.2,
    g_cmd: 2.2,
  }, "f22", persistentThreatRelease);
  assert.equal(releaseFrame.target.combatDownhillRecoveryPhase, "idle");
  assert.equal(releaseFrame.target.combatDefensiveBreakActive, true);
  assert.equal(releaseFrame.target.combatDefensiveBreakPlaneMagnitudeDeg, 55,
    "a persistent threat must resolve its real break plane on the exact recovery-release frame");
  assert.equal(releaseFrame.target.combatLoadedRollUnloadActive, true);
  assert.equal(releaseFrame.target.combatLoadedRollTargetBankDeg, -55,
    "the loaded-roll owner cannot freeze the one-frame neutral fallback at recovery handoff");

  const tape461ThreatRetarget = createFixedWingAiControllerState();
  tape461ThreatRetarget.combatDefensiveBreakHasCommitted = true;
  tape461ThreatRetarget.combatDefensiveLastCommittedBreakSign = 1;
  tape461ThreatRetarget.combatDefensiveBreakSign = 1;
  tape461ThreatRetarget.combatDefensivePrimaryAimSamples = 1;
  tape461ThreatRetarget.combatDefensiveLastPrimaryNoseErrorDeg = 28;
  tape461ThreatRetarget.combatLoadedRollUnloadActive = true;
  tape461ThreatRetarget.combatLoadedRollPhase = "roll";
  tape461ThreatRetarget.combatLoadedRollTargetBankDeg = 78;
  tape461ThreatRetarget.combatLoadedRollTransferSign = 1;
  const tape461Threat = fixedWingAiCommand({
    ...aimedBandit(464, 27, "tape-461-threat"),
    closure_kts: 96,
    bank_deg: 24.59,
    roll_rate_dps: 91.89,
    g_actual: 0.57,
    aoa_deg: 3,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", tape461ThreatRetarget);
  assert.equal(tape461Threat.target.combatDefensiveBreakActive, true);
  assert.equal(tape461Threat.target.combatDefensiveBreakSign, -1,
    "the point-blank episode must alternate from the last flown defensive plane");
  assert.equal(tape461Threat.target.combatLoadedRollUnloadActive, true);
  assert.equal(tape461Threat.target.combatLoadedRollPhase, "unload",
    "an urgent opposite-side break must brake the old roll before changing planes");
  assert.equal(tape461Threat.target.combatLoadedRollTargetBankDeg, -55,
    "the frozen +78-degree pursuit target cannot outrank a live defensive break");
  assert.equal(tape461Threat.target.desiredBankDeg, 24.59,
    "the retarget frame must hold current bank while the body-rate damper arrests the roll");
  assert.ok(tape461Threat.roll < -0.6,
    `the old +${91.89}-dps roll was not braked: ${tape461Threat.roll.toFixed(3)}`);
  assert.equal(tape461Threat.pitch, -0.10);

  const tape488ThreatRetarget = createFixedWingAiControllerState();
  tape488ThreatRetarget.combatDefensiveBreakHasCommitted = true;
  tape488ThreatRetarget.combatDefensiveLastCommittedBreakSign = 1;
  tape488ThreatRetarget.combatDefensiveBreakSign = 1;
  tape488ThreatRetarget.combatDefensivePrimaryAimSamples = 1;
  tape488ThreatRetarget.combatDefensiveLastPrimaryNoseErrorDeg = 28;
  tape488ThreatRetarget.combatLoadedRollUnloadActive = true;
  tape488ThreatRetarget.combatLoadedRollPhase = "roll";
  tape488ThreatRetarget.combatLoadedRollTargetBankDeg = 72;
  tape488ThreatRetarget.combatLoadedRollTransferSign = 1;
  const tape488Threat = fixedWingAiCommand({
    ...aimedBandit(391, 27, "tape-488-threat"),
    closure_kts: -42.9,
    bank_deg: 50.86,
    roll_rate_dps: 47.76,
    g_actual: 0.533,
    aoa_deg: 3,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
  }, "f22", tape488ThreatRetarget);
  assert.equal(tape488Threat.target.combatDefensiveBreakActive, true);
  assert.equal(tape488Threat.target.combatDefensiveCloseRearCurrentPlanePreserved, true);
  assert.equal(tape488Threat.target.combatDefensiveBreakSign, 1,
    "a close-rear renewal must retain the +55-degree plane already beneath Tape 488");
  assert.equal(tape488Threat.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(tape488Threat.target.combatLoadedRollUnloadActive, true);
  assert.equal(tape488Threat.target.combatLoadedRollPhase, "unload",
    "the retained plane must still brake the live +47.76-dps roll before pulling");
  assert.equal(tape488Threat.target.combatLoadedRollTargetBankDeg, 55);
  assert.equal(tape488Threat.target.desiredBankDeg, 50.86,
    "the braking frame must not begin the old 106-degree cross-horizon reversal");
  assert.ok(tape488Threat.roll < 0,
    "the current-plane handoff must arrest roll rate before rebuilding defensive G");

  assert.equal(tape461Threat.target.combatDefensiveCloseRearCurrentPlanePreserved, false,
    "Tape 461 remains too far from +55 degrees and must preserve the proven alternation");

  urgentRear.combatDefensiveBreakSamples = 0;
  urgentRear.combatDownhillRecoveryPhase = "idle";
  urgentRear.combatDownhillRecoveryRollArmed = false;
  fixedWingAiCommand(tape455UrgentRear(28), "f22", urgentRear);
  const urgentRearBreak = fixedWingAiCommand(
    tape455UrgentRear(27), "f22", urgentRear,
  );
  assert.equal(urgentRearBreak.target.combatDefensiveBreakActive, true);
  assert.equal(urgentRearBreak.target.combatDefensiveBreakControlOwned, true);
  assert.equal(urgentRearBreak.target.combatDefensiveBreakSign, -1,
    "close-rear alternation must use the last flown sign, not the suppressed proposal");
  assert.equal(urgentRearBreak.target.combatDefensiveLastCommittedBreakSign, -1);
  assert.ok(urgentRearBreak.target.combatDefensivePrimaryShooterElevationDeg > 14);
  assert.equal(urgentRearBreak.target.combatDefensiveBreakPlaneMagnitudeDeg, 55,
    "Tape 455's close rear threat needs the reachable 55-degree plane, not a 112-degree half-roll");
  assert.equal(urgentRearBreak.target.combatLoadedRollUnloadActive, true,
    "the shorter plane must still obey the measured loaded-roll interlock");

  const tape454PointBlankRear = (noseErrorDeg, {
    rangeScale = 1,
    bearingShiftDeg = 0,
    verticalM = 22,
    closureKts = 10.5,
  } = {}) => {
    const bearingDeg = 138.5 + bearingShiftDeg;
    const slantRangeM = 312 * rangeScale;
    const horizontalM = Math.sqrt(Math.max(0, slantRangeM ** 2 - verticalM ** 2));
    const bearingRad = bearingDeg * Math.PI / 180;
    const relativeX = Math.sin(bearingRad) * horizontalM;
    const relativeZ = Math.cos(bearingRad) * horizontalM;
    const targetMagnitude = Math.hypot(relativeX, verticalM, relativeZ);
    const towardOwnship = {
      x: -relativeX / targetMagnitude,
      y: -verticalM / targetMagnitude,
      z: -relativeZ / targetMagnitude,
    };
    const horizontalTargetMagnitude = Math.hypot(towardOwnship.x, towardOwnship.z);
    const perpendicular = {
      x: towardOwnship.z / horizontalTargetMagnitude,
      y: 0,
      z: -towardOwnship.x / horizontalTargetMagnitude,
    };
    const noseErrorRad = noseErrorDeg * Math.PI / 180;
    return {
      ...aimedBandit(slantRangeM, noseErrorDeg, "tape-454-reacquisition"),
      bx: relativeX,
      by: 2_300 + verticalM,
      bz: relativeZ,
      bfx: towardOwnship.x * Math.cos(noseErrorRad)
        + perpendicular.x * Math.sin(noseErrorRad),
      bfy: towardOwnship.y * Math.cos(noseErrorRad),
      bfz: towardOwnship.z * Math.cos(noseErrorRad)
        + perpendicular.z * Math.sin(noseErrorRad),
      heading_deg: 0,
      closure_kts: closureKts,
    };
  };
  const pointBlankRear = createFixedWingAiControllerState();
  pointBlankRear.combatDefensiveBreakHasCommitted = true;
  pointBlankRear.combatDefensiveBreakSign = 1;
  const tape454First = fixedWingAiCommand(
    tape454PointBlankRear(44.45), "f22", pointBlankRear,
  );
  const tape454Second = fixedWingAiCommand(
    tape454PointBlankRear(43.46), "f22", pointBlankRear,
  );
  assert.equal(tape454First.target.combatDefensiveBreakActive, false);
  assert.equal(tape454Second.target.combatDefensiveBreakActive, true,
    "Tape 454's point-blank rear reacquisition must break before the trigger event");
  assert.equal(tape454Second.target.combatDefensiveThreatReason,
    "point-blank-reacquisition");
  assert.equal(tape454Second.target.combatDefensivePointBlankRearReacquisitionThreat, true);
  assert.equal(tape454Second.target.desiredBankDeg, -55,
    "the reacquisition corridor must retain the proven close-rear alternate-side episode");

  const tape471VerticalGap = createFixedWingAiControllerState();
  fixedWingAiCommand(
    tape454PointBlankRear(34.6, { verticalM: -171, closureKts: 10 }),
    "f22",
    tape471VerticalGap,
  );
  const tape471EarlyBreak = fixedWingAiCommand(
    tape454PointBlankRear(33.5, { verticalM: -171, closureKts: 12 }),
    "f22",
    tape471VerticalGap,
  );
  assert.equal(tape471EarlyBreak.target.combatDefensiveBreakActive, true,
    "Tape 471's 171-m-low point-blank shooter must be classified before it fires");
  assert.equal(tape471EarlyBreak.target.combatDefensiveThreatReason,
    "point-blank-reacquisition");

  const overlappingRearCorridors = createFixedWingAiControllerState();
  const overlapOptions = { rangeScale: 300 / 312, bearingShiftDeg: 21.5 };
  fixedWingAiCommand(
    tape454PointBlankRear(46.5, overlapOptions), "f22", overlappingRearCorridors,
  );
  const overlapThreat = fixedWingAiCommand(
    tape454PointBlankRear(46, overlapOptions), "f22", overlappingRearCorridors,
  );
  assert.equal(overlapThreat.target.combatDefensiveBreakActive, true,
    "the 45-degree point-blank extension cannot narrow the overlapping 50-degree rear gate");
  assert.equal(overlapThreat.target.combatDefensivePointBlankRearReacquisitionThreat, false,
    "overlapping old-gate geometry is not evidence that the new extension caused the break");

  for (const [label, options, firstNoseDeg, secondNoseDeg] of [
    ["bearing", { bearingShiftDeg: -3.6 }, 44.45, 43.46],
    ["closure", { closureKts: 0 }, 44.45, 43.46],
    ["vertical separation", { verticalM: 200.1 }, 44.45, 43.46],
    ["nose angle", {}, 45.02, 45.01],
  ]) {
    const boundaryController = createFixedWingAiControllerState();
    fixedWingAiCommand(
      tape454PointBlankRear(firstNoseDeg, options), "f22", boundaryController,
    );
    const boundary = fixedWingAiCommand(
      tape454PointBlankRear(secondNoseDeg, options), "f22", boundaryController,
    );
    assert.equal(boundary.target.combatDefensiveBreakActive, false,
      `point-blank ${label} fence admitted out-of-contract geometry`);
    assert.equal(boundary.target.combatDefensivePointBlankRearReacquisitionThreat, false);
  }

  const tape463PrecisionRear = ({
    rangeM = 590,
    bearingDeg = 136,
    verticalM = 29,
    closureKts = 100,
    noseErrorDeg = 12.7,
  } = {}) => {
    const horizontalM = Math.sqrt(Math.max(0, rangeM ** 2 - verticalM ** 2));
    const bearingRad = bearingDeg * Math.PI / 180;
    const relativeX = Math.sin(bearingRad) * horizontalM;
    const relativeZ = Math.cos(bearingRad) * horizontalM;
    const towardOwnship = {
      x: -relativeX / rangeM,
      y: -verticalM / rangeM,
      z: -relativeZ / rangeM,
    };
    const horizontalTargetMagnitude = Math.hypot(
      towardOwnship.x,
      towardOwnship.z,
    );
    const perpendicular = {
      x: towardOwnship.z / horizontalTargetMagnitude,
      y: 0,
      z: -towardOwnship.x / horizontalTargetMagnitude,
    };
    const noseErrorRad = noseErrorDeg * Math.PI / 180;
    return {
      ...aimedBandit(rangeM, noseErrorDeg, "tape-463-precision-rear"),
      bx: relativeX,
      by: 2_300 + verticalM,
      bz: relativeZ,
      bfx: towardOwnship.x * Math.cos(noseErrorRad)
        + perpendicular.x * Math.sin(noseErrorRad),
      bfy: towardOwnship.y * Math.cos(noseErrorRad),
      bfz: towardOwnship.z * Math.cos(noseErrorRad)
        + perpendicular.z * Math.sin(noseErrorRad),
      heading_deg: 0,
      closure_kts: closureKts,
      bank_deg: 82,
      roll_rate_dps: 0,
      g_actual: 6.5,
      aoa_deg: 11,
      requested_g_cmd: 6.5,
      g_cmd: 6.5,
    };
  };
  const tape463Defense = createFixedWingAiControllerState();
  const tape463First = fixedWingAiCommand(
    tape463PrecisionRear(), "f22", tape463Defense,
  );
  const tape463Second = fixedWingAiCommand(
    tape463PrecisionRear({ noseErrorDeg: 12.6 }), "f22", tape463Defense,
  );
  assert.equal(tape463First.target.combatDefensiveBreakActive, false,
    "one precise rear-quarter sample is not enough to declare a threat");
  assert.equal(tape463Second.target.combatDefensiveBreakActive, true,
    "Tape 463's narrowing 590 m shooter must be detected before its first tracer");
  assert.equal(tape463Second.target.combatDefensiveThreatReason,
    "precision-rear-quarter");
  assert.equal(tape463Second.target.combatDefensiveBreakSign, 1);
  assert.equal(tape463Second.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(tape463Second.target.combatLoadedRollPhase, "unload");
  assert.equal(tape463Second.target.combatLoadedRollTargetBankDeg, 55);
  assert.equal(tape463Second.target.desiredBankDeg, 82,
    "loaded-roll protection must hold the physical plane while lift decays");
  assert.equal(tape463Second.pitch, -0.10);

  for (const [label, options] of [
    ["range", { rangeM: 600.1 }],
    ["bearing", { bearingDeg: 134.9 }],
    ["closure", { closureKts: 50 }],
    ["nose angle", { noseErrorDeg: 15.1 }],
  ]) {
    const outsidePrecision = createFixedWingAiControllerState();
    fixedWingAiCommand(
      tape463PrecisionRear(options), "f22", outsidePrecision,
    );
    const boundary = fixedWingAiCommand(
      tape463PrecisionRear(options), "f22", outsidePrecision,
    );
    assert.equal(boundary.target.combatDefensiveBreakActive, false,
      `precision rear-quarter ${label} fence admitted out-of-contract geometry`);
  }

  const outsideReacquisition = createFixedWingAiControllerState();
  for (const noseErrorDeg of [44.45, 43.46]) {
    const command = fixedWingAiCommand(
      tape454PointBlankRear(noseErrorDeg, { rangeScale: 401 / 312 }),
      "f22",
      outsideReacquisition,
    );
    assert.equal(command.target.combatDefensiveBreakActive, false,
      "the point-blank exception must not widen ordinary low-closure defense beyond 400 m");
  }

  const liveCloseRear = createFixedWingAiControllerState();
  liveCloseRear.combatDefensiveBreakHasCommitted = true;
  liveCloseRear.combatDefensiveBreakSign = 1;
  const liveCloseRearFire = fixedWingAiCommand({
    ...aimedBandit(650, 20),
    opponent_gun_firing: true,
    closure_kts: -25,
    bank_deg: 45,
  }, "f22", liveCloseRear);
  assert.equal(liveCloseRearFire.target.desiredBankDeg, 55,
    "live rounds must solve the physical side instead of blindly alternating an expired episode");
  assert.equal(liveCloseRear.combatDefensiveBreakSign, 1);

  const closeRearDiverging = createFixedWingAiControllerState();
  for (const noseErrorDeg of [44, 45, 46]) {
    const command = fixedWingAiCommand({
      ...aimedBandit(650, noseErrorDeg),
      closure_kts: -30,
    }, "f22", closeRearDiverging);
    assert.equal(command.target.combatDefensiveBreakActive, false,
      "a close rear contact whose nose is moving away cannot force a defensive break");
  }

  const fastOpening = createFixedWingAiControllerState();
  for (const noseErrorDeg of [14, 13, 12]) {
    const command = fixedWingAiCommand({
      ...aimedBandit(650, noseErrorDeg),
      closure_kts: -80,
    }, "f22", fastOpening);
    assert.equal(command.target.combatDefensiveBreakActive, false,
      "a rapidly opening close pass must not acquire the low-closure threat gate");
  }
});

test("Tape 494 takes the near-side defensive plane from an overbanked rear reacquisition", () => {
  const rangeM = 392;
  const bearingRad = 149.95 * Math.PI / 180;
  const elevationRad = -28.915 * Math.PI / 180;
  const horizontalM = rangeM * Math.cos(elevationRad);
  const relative = {
    x: Math.sin(bearingRad) * horizontalM,
    y: Math.sin(elevationRad) * rangeM,
    z: Math.cos(bearingRad) * horizontalM,
  };
  const towardOwnship = {
    x: -relative.x / rangeM,
    y: -relative.y / rangeM,
    z: -relative.z / rangeM,
  };
  const towardHorizontal = Math.hypot(towardOwnship.x, towardOwnship.z);
  const perpendicular = {
    x: towardOwnship.z / towardHorizontal,
    y: 0,
    z: -towardOwnship.x / towardHorizontal,
  };
  const noseErrorRad = 3.165 * Math.PI / 180;
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensivePrimaryAimSamples = 1;
  controllerState.combatDefensiveLastPrimaryNoseErrorDeg = 3.3;

  const tape494RearState = {
    px: 0, py: 4_000, pz: 0,
    bx: relative.x, by: 4_000 + relative.y, bz: relative.z,
    bfx: towardOwnship.x * Math.cos(noseErrorRad)
      + perpendicular.x * Math.sin(noseErrorRad),
    bfy: towardOwnship.y * Math.cos(noseErrorRad),
    bfz: towardOwnship.z * Math.cos(noseErrorRad)
      + perpendicular.z * Math.sin(noseErrorRad),
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: false,
    formation_gun_firing: false,
    bandit_entity_id: "tape-494-rear",
    heading_deg: 0,
    bank_deg: -111.82,
    roll_rate_dps: -63.89,
    gamma_deg: 41.89,
    true_airspeed_kts: 343,
    g_maxperform: 9,
    g_actual: 0.391,
    aoa_deg: 2,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    range_m: rangeM,
    closure_kts: 110.1,
    lead_valid: false,
  };
  const command = fixedWingAiCommand(tape494RearState, "f22", controllerState);

  assert.equal(command.target.combatDefensiveBreakActive, true);
  assert.equal(command.target.combatDefensiveThreatReason, "point-blank-reacquisition");
  assert.equal(command.target.combatDefensiveOverbankedRearNearestPlanePreserved, true);
  assert.equal(command.target.combatDefensiveBreakSign, -1,
    "a 150-degree bearing wobble cannot turn a 57-degree inward recovery into a 167-degree roll");
  assert.equal(command.target.combatDefensiveBreakPlaneMagnitudeDeg, 78,
    "the active inverted recovery must finish before resolving the latched near-side jink");
  assert.ok(command.target.desiredBankDeg < 0,
    "the overbanked jet must keep recovering toward the near-side negative fighting plane");

  const handoff = fixedWingAiCommand({
    ...tape494RearState,
    bank_deg: -85.8,
    roll_rate_dps: 14,
    gamma_deg: 41,
    g_actual: 1,
    aoa_deg: 4,
  }, "f22", controllerState);
  assert.equal(handoff.target.invertedRecoveryActive, false);
  assert.equal(handoff.target.combatDefensiveBreakControlOwned, true);
  assert.equal(handoff.target.combatDefensiveNoseHighLateralPlanePreserved, true);
  assert.equal(handoff.target.combatDefensiveBreakSign, -1);
  assert.equal(handoff.target.combatDefensiveBreakPlaneMagnitudeDeg, 78);
  assert.equal(handoff.target.desiredBankDeg, -78,
    "recovery must hand directly to the nearby loaded plane without crossing the horizon");
  assert.equal(handoff.target.combatLoadedRollUnloadActive, false);
  assert.equal(handoff.target.desiredLoadFactorG, 9,
    "the same-side handoff must rebuild defensive G immediately");
  assert.ok(handoff.pitch > 0);
});

test("Tape 472 active defense outranks the generic anti-zoom recovery", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = 1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 55;
  const command = fixedWingAiCommand({
    px: 2_865.263, py: 3_556.447, pz: 1_490.994,
    bx: 2_461.425, by: 3_368.665, bz: 1_441.457,
    lead_x: 2_468.783, lead_y: 3_332.908, lead_z: 1_487.947,
    lead_valid: true,
    opponent_present: true,
    opponent_alive: true,
    heading_deg: 190.53,
    bank_deg: 68.99,
    roll_rate_dps: -12.51,
    gamma_deg: 42.24,
    true_airspeed_kts: 334.31,
    g_maxperform: 6.333,
    g_actual: 6.138,
    aoa_deg: 18.22,
    requested_g_cmd: 5.033,
    g_cmd: 5.033,
    range_m: 448.1,
    closure_kts: 409,
  }, "f22", controllerState);
  assert.equal(command.target.verticalRecoveryDefensivePreemption, true);
  assert.equal(command.target.verticalRecoveryPhase, "idle",
    "the 42-degree zoom guard cannot unload in front of an actively defended shooter");
  assert.equal(command.target.combatDefensiveBreakActive, true);
  assert.equal(command.target.combatDefensiveBreakControlOwned, true);
  assert.equal(command.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(command.target.desiredBankDeg, 55);
});

test("Tape 489 contains a shallow defensive climb without surrendering the break", () => {
  const controller = () => {
    const state = createFixedWingAiControllerState();
    state.combatDefensiveBreakSamples = 32;
    state.combatDefensiveBreakSign = 1;
    state.combatDefensiveBreakHasCommitted = true;
    state.combatDefensiveLastCommittedBreakSign = 1;
    state.combatDefensiveBreakPlaneMagnitudeDeg = 55;
    state.combatDefensiveLowPlaneSamples = 8;
    return state;
  };
  const commandAt = ({
    gammaDeg,
    shooterElevationDeg,
    gunFiring = false,
    opponentTracers = [],
  }) => {
    const horizontalRangeM = 383.3;
    const shooterDeltaYM = Math.tan(shooterElevationDeg * Math.PI / 180)
      * horizontalRangeM;
    return fixedWingAiCommand({
      px: 0, py: 3_353.5, pz: 0,
      bx: 0, by: 3_353.5 + shooterDeltaYM, bz: -horizontalRangeM,
      opponent_present: true,
      opponent_alive: true,
      opponent_gun_firing: gunFiring,
      opponent_tracers: opponentTracers,
      formation_gun_firing: false,
      lead_valid: false,
      heading_deg: 0,
      bank_deg: 65.6,
      roll_rate_dps: -12.26,
      gamma_deg: gammaDeg,
      true_airspeed_kts: 343.7,
      g_maxperform: 6.559,
      g_actual: 6.055,
      aoa_deg: 15.22,
      requested_g_cmd: 6.545,
      g_cmd: 6.545,
      range_m: horizontalRangeM,
      closure_kts: 268.2,
    }, "f22", controller());
  };

  const contained = commandAt({ gammaDeg: 40.85, shooterElevationDeg: -14.45 });
  assert.equal(contained.target.combatDefensiveBreakActive, true);
  assert.equal(contained.target.combatDefensiveBreakControlOwned, true);
  assert.equal(contained.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(contained.target.desiredBankDeg, 55,
    "containment must not manufacture a loaded plane transfer inside gun range");
  assert.equal(contained.target.combatLoadedRollUnloadActive, false);
  assert.equal(contained.target.combatDefensiveHighClimbLoadLimited, true);
  assert.ok(contained.target.desiredLoadFactorG <= 3.01,
    `contained break still requested ${contained.target.desiredLoadFactorG.toFixed(2)} G`);
  assert.ok(contained.target.desiredLoadFactorG >= 2.9,
    "the pilot should retain useful lateral defensive load instead of unloading");

  const lowGamma = commandAt({ gammaDeg: 34.9, shooterElevationDeg: -14.45 });
  assert.equal(lowGamma.target.combatDefensiveHighClimbLoadLimited, false);
  assert.ok(lowGamma.target.desiredLoadFactorG > 6,
    "the initial vertical jink must retain its authored max-performance pull");

  const shooterNearPath = commandAt({ gammaDeg: 40, shooterElevationDeg: 29 });
  assert.equal(shooterNearPath.target.combatDefensiveHighClimbLoadLimited, false);
  assert.ok(shooterNearPath.target.desiredLoadFactorG > 6,
    "a shooter near the flight path still requires the full defensive pull");

  const liveFire = commandAt({
    gammaDeg: 40.85,
    shooterElevationDeg: -14.45,
    gunFiring: true,
  });
  assert.equal(liveFire.target.combatDefensiveHighClimbLoadLimited, false);
  assert.ok(liveFire.target.desiredLoadFactorG > 6,
    "fresh gunfire must override climb containment and restore max-performance defense");

  const airborneRound = commandAt({
    gammaDeg: 40.85,
    shooterElevationDeg: -14.45,
    opponentTracers: [[0, 0, 0, 0, 0, 0]],
  });
  assert.equal(airborneRound.target.combatDefensiveHighClimbLoadLimited, false);
  assert.ok(airborneRound.target.desiredLoadFactorG > 6,
    "an airborne hostile round must keep max-performance defense available");
});

test("Tape 496 keeps pulling through muzzle fire and airborne rounds", () => {
  const controller = () => {
    const state = createFixedWingAiControllerState();
    state.combatDefensiveBreakSamples = 32;
    state.combatDefensiveBreakSign = -1;
    state.combatDefensiveBreakHasCommitted = true;
    state.combatDefensiveLastCommittedBreakSign = -1;
    state.combatDefensiveBreakPlaneMagnitudeDeg = 78;
    state.combatDefensiveLowPlaneSamples = 20;
    state.combatDefensiveLowPlaneComplete = true;
    return state;
  };
  const firingState = {
    px: 0, py: 4_000, pz: 0,
    bx: 0, by: 4_012, bz: -776,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    opponent_tracers: [[0, 0, 0, 0, 0, 0]],
    lead_valid: false,
    heading_deg: 0,
    bank_deg: -79.41,
    roll_rate_dps: 0.81,
    gamma_deg: 3.61,
    true_airspeed_kts: 343,
    g_maxperform: 7.809,
    g_actual: 7.821,
    aoa_deg: 16,
    requested_g_cmd: 7.854,
    g_cmd: 7.821,
    range_m: 776,
    closure_kts: 346,
  };

  const defensiveController = controller();
  const onset = fixedWingAiCommand(firingState, "f22", defensiveController);
  assert.ok(onset.target.desiredLoadFactorG > 7,
    `muzzle fire cut the settled defensive pull to ${onset.target.desiredLoadFactorG.toFixed(2)} G`);
  assert.ok(onset.pitch > 0.85,
    `muzzle fire commanded only ${onset.pitch.toFixed(3)} pitch authority`);

  const throughRoundFlight = fixedWingAiCommand({
    ...firingState,
    opponent_gun_firing: false,
    g_actual: 3.5,
  }, "f22", defensiveController);
  assert.ok(throughRoundFlight.target.desiredLoadFactorG > 7,
    "airborne rounds must preserve the max-performance defensive pull");
  assert.ok(throughRoundFlight.pitch > 0.85,
    "the pilot must rebuild G immediately while hostile rounds are airborne");

  const roundClear = fixedWingAiCommand({
    ...firingState,
    opponent_gun_firing: false,
    opponent_tracers: [],
    g_actual: 3.5,
  }, "f22", defensiveController);
  assert.ok(roundClear.target.desiredLoadFactorG > 6,
    "max-performance defense must resume after the volley clears");

  const lowEntryController = controller();
  const lowEntry = fixedWingAiCommand({
    ...firingState,
    g_actual: 3,
    requested_g_cmd: 3,
    g_cmd: 3,
  }, "f22", lowEntryController);
  assert.ok(lowEntry.target.desiredLoadFactorG > 6,
    "Tape 492's low-G muzzle onset must retain the full defensive rebuild");
  const lowEntryLater = fixedWingAiCommand({
    ...firingState,
    g_actual: 6,
  }, "f22", lowEntryController);
  assert.ok(lowEntryLater.target.desiredLoadFactorG > 6);
});

test("Tape 486 bounds the initial low-plane jink before sustained lateral defense", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = 1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 55;
  const state = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 2_900, bz: -500,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    lead_valid: false,
    heading_deg: 0,
    bank_deg: 20,
    roll_rate_dps: 0,
    gamma_deg: 30,
    true_airspeed_kts: 350,
    g_maxperform: 9,
    g_actual: 1.1,
    aoa_deg: 2,
    requested_g_cmd: 1,
    g_cmd: 1,
    range_m: Math.hypot(100, 500),
    closure_kts: 250,
  };

  for (let sample = 0; sample < 25; sample += 1) {
    const travelling = fixedWingAiCommand(state, "f22", controllerState);
    assert.equal(travelling.target.combatDefensiveLowPlanePhysicallyEngaged, false);
    assert.equal(travelling.target.combatDefensiveLowPlaneSamples, 0,
      "unloaded travel time cannot spend the vertical-jink displacement budget");
  }

  const engagedState = {
    ...state,
    bank_deg: 65,
    roll_rate_dps: -12,
    g_actual: 7.5,
    aoa_deg: 12,
    requested_g_cmd: 7,
    g_cmd: 7,
  };
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "unload";
  controllerState.combatLoadedRollTargetBankDeg = 55;
  const interlocked = fixedWingAiCommand({
    ...engagedState,
    opponent_gun_firing: false,
  }, "f22", controllerState);
  assert.equal(interlocked.target.combatDefensiveLowPlanePhysicallyEngaged, false);
  assert.equal(interlocked.target.combatDefensiveLowPlaneSamples, 0,
    "the loaded-roll transfer owner cannot spend the flown-jink budget");
  controllerState.combatLoadedRollUnloadActive = false;
  controllerState.combatLoadedRollPhase = "idle";
  controllerState.combatLoadedRollTargetBankDeg = null;
  controllerState.combatLoadedRollTransferSign = 0;
  controllerState.combatLoadedRollUnloadSamples = 0;

  let initialJink = null;
  for (let sample = 0; sample < 19; sample += 1) {
    initialJink = fixedWingAiCommand(engagedState, "f22", controllerState);
  }
  assert.equal(initialJink.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(initialJink.target.combatDefensiveLowPlanePhysicallyEngaged, true);
  assert.equal(initialJink.target.combatDefensiveLowPlaneSamples, 19);
  assert.equal(initialJink.target.combatDefensiveLowPlaneComplete, false);

  const safeCompletionState = {
    ...engagedState,
    opponent_gun_firing: false,
    range_m: 1_400,
    closure_kts: 200,
  };
  const completedJink = fixedWingAiCommand(
    safeCompletionState,
    "f22",
    controllerState,
  );
  assert.equal(completedJink.target.combatDefensiveBreakPlaneMagnitudeDeg, 55,
    "the twentieth flown sample completes the budget after current-frame arbitration");
  assert.equal(completedJink.target.combatDefensiveLowPlaneSamples, 20);
  assert.equal(completedJink.target.combatDefensiveLowPlaneComplete, true);
  assert.equal(completedJink.target.combatDefensiveLowPlaneTransitionDeferred, false);

  const sustainedBreak = fixedWingAiCommand(
    safeCompletionState,
    "f22",
    controllerState,
  );
  assert.equal(sustainedBreak.target.combatDefensiveBreakPlaneMagnitudeDeg, 78);
  assert.equal(sustainedBreak.target.combatLoadedRollUnloadActive, true,
    "the 55-to-78 transition must still use the measured-load transfer interlock");

  const continuedThreat = fixedWingAiCommand({
    ...engagedState,
    opponent_gun_firing: true,
  }, "f22", controllerState);
  assert.equal(continuedThreat.target.combatDefensiveBreakPlaneMagnitudeDeg, 65,
    "gunfire should hold the current bank, not restart the expired 55-degree climb-away jink");
  assert.equal(continuedThreat.target.combatDefensiveTransferGunfireAbort, true);
  assert.equal(continuedThreat.target.combatDefensiveLowPlaneComplete, true);
});

test("Tape 487 keeps pulling through an imminent merge before leaving the low plane", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = 1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 55;
  controllerState.combatDefensiveLowPlaneSamples = 19;
  const imminentMerge = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 2_985, bz: -812,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    lead_valid: false,
    heading_deg: 0,
    bank_deg: 61.57,
    roll_rate_dps: -2.05,
    gamma_deg: 20.33,
    true_airspeed_kts: 350,
    g_maxperform: 9,
    g_actual: 9.193,
    aoa_deg: 18,
    requested_g_cmd: 4.625,
    g_cmd: 4.625,
    range_m: 812,
    closure_kts: 738,
  };

  const held = fixedWingAiCommand(imminentMerge, "f22", controllerState);
  assert.equal(held.target.combatDefensiveLowPlaneSamples, 20);
  assert.equal(held.target.combatDefensiveLowPlaneComplete, false);
  assert.equal(held.target.combatDefensiveLowPlaneTransitionDeferred, true);
  assert.ok(held.target.combatDefensiveLowPlaneTimeToClosestApproachS < 2.2);
  assert.equal(held.target.combatDefensiveBreakPlaneMagnitudeDeg, 55);
  assert.equal(held.target.combatLoadedRollUnloadActive, false,
    "the controller must not recreate Tape 487's 1.3-second no-G shooting window");

  const airborneRounds = fixedWingAiCommand({
    ...imminentMerge,
    opponent_gun_firing: false,
    opponent_tracers: [{ x: 0, y: 0, z: 0 }],
    closure_kts: -100,
  }, "f22", controllerState);
  assert.equal(airborneRounds.target.combatDefensiveLowPlaneTransitionDeferred, true,
    "opening geometry cannot unload while an already-fired round remains airborne");

  const safeToTransfer = fixedWingAiCommand({
    ...imminentMerge,
    opponent_gun_firing: false,
    opponent_tracers: [],
    range_m: 1_400,
    closure_kts: 200,
  }, "f22", controllerState);
  assert.equal(safeToTransfer.target.combatDefensiveLowPlaneTransitionDeferred, false);
  assert.equal(safeToTransfer.target.combatDefensiveLowPlaneComplete, true);
  assert.ok(safeToTransfer.target.combatDefensiveLowPlaneTimeToGunEnvelopeS > 4.8);

  const transferring = fixedWingAiCommand({
    ...imminentMerge,
    opponent_gun_firing: false,
    opponent_tracers: [],
    range_m: 1_400,
    closure_kts: 200,
  }, "f22", controllerState);
  assert.equal(transferring.target.combatDefensiveBreakPlaneMagnitudeDeg, 78);
  assert.equal(transferring.target.combatLoadedRollUnloadActive, true);
});

test("Tape 487 gunfire aborts an in-progress low-plane transfer and rebuilds G", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = 1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 78;
  controllerState.combatDefensiveLowPlaneSamples = 20;
  controllerState.combatDefensiveLowPlaneComplete = true;
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = 78;
  controllerState.combatLoadedRollTransferSign = 1;

  const command = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 2_900, bz: -409,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    lead_valid: false,
    heading_deg: 0,
    bank_deg: 67.96,
    roll_rate_dps: 18.54,
    gamma_deg: 23.28,
    true_airspeed_kts: 350,
    g_maxperform: 9,
    g_actual: 0.365,
    aoa_deg: 2,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    range_m: 409,
    closure_kts: 660,
  }, "f22", controllerState);

  assert.equal(command.target.combatDefensiveTransferGunfireAbort, true);
  assert.equal(command.target.combatDefensiveGunfireBankHoldActive, true);
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "actual rounds outrank a planned fighting-plane improvement");
  assert.ok(Math.abs(command.target.combatDefensiveBreakPlaneMagnitudeDeg - 67.96) < 0.01);
  assert.ok(Math.abs(command.target.desiredBankDeg - 67.96) < 0.01);
  assert.ok(command.pitch > 0,
    "the current same-side bank should pull immediately instead of staying at 0.8 G");
});

test("Tape 488 gunfire aborts an initial cross-horizon defensive transfer", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = -1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = -1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 55;
  controllerState.combatLoadedRollUnloadActive = true;
  controllerState.combatLoadedRollPhase = "roll";
  controllerState.combatLoadedRollTargetBankDeg = -55;
  controllerState.combatLoadedRollTransferSign = -1;

  const command = fixedWingAiCommand({
    px: 0, py: 4_700, pz: 0,
    bx: 0, by: 4_715, bz: -366,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    opponent_tracers: [[0, 0, 0, 0, 0, 0]],
    lead_valid: false,
    heading_deg: 0,
    bank_deg: -44.69,
    roll_rate_dps: -19.79,
    gamma_deg: -2.07,
    true_airspeed_kts: 405,
    g_maxperform: 7.9,
    g_actual: 0.782,
    aoa_deg: 2,
    requested_g_cmd: 0.8,
    g_cmd: 0.8,
    range_m: 366,
    closure_kts: 79,
  }, "f22", controllerState);

  assert.equal(command.target.combatDefensiveTransferGunfireAbort, true);
  assert.equal(command.target.combatDefensiveGunfireBankHoldActive, true);
  assert.equal(command.target.combatLoadedRollUnloadActive, false);
  assert.ok(Math.abs(command.target.desiredBankDeg + 44.69) < 0.01);
  assert.ok(command.pitch > 0,
    "the live burst must rebuild pull instead of completing the planned -55-degree plane");
});

test("Tape 486 preserves an already-captured nose-high lateral break plane", () => {
  const createHandoffController = (recoveryActive = true) => {
    const controllerState = createFixedWingAiControllerState();
    controllerState.combatDefensiveBreakSamples = 31;
    controllerState.combatDefensiveBreakSign = 1;
    controllerState.combatDefensiveBreakHasCommitted = true;
    controllerState.combatDefensiveLastCommittedBreakSign = 1;
    controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 78;
    controllerState.invertedRecoveryActive = recoveryActive;
    controllerState.invertedRecoveryRollArmed = recoveryActive;
    controllerState.invertedRecoveryTargetBankDeg = recoveryActive ? 78 : null;
    return controllerState;
  };
  const tape486HandoffState = {
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 2_850, bz: -720,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    lead_valid: false,
    heading_deg: 0,
    bank_deg: 70.75,
    roll_rate_dps: 4.75,
    gamma_deg: 19.62,
    true_airspeed_kts: 350,
    g_maxperform: 9,
    g_actual: 0.967,
    aoa_deg: 2,
    requested_g_cmd: 2.659,
    g_cmd: 2.659,
    range_m: 739.5,
    closure_kts: 154.9,
  };
  const controllerState = createHandoffController();
  const command = fixedWingAiCommand(tape486HandoffState, "f22", controllerState);

  assert.equal(command.target.combatDefensiveNoseHighLateralPlanePreserved, true);
  assert.equal(command.target.combatDefensiveBreakPlaneMagnitudeDeg, 78);
  assert.equal(command.target.desiredBankDeg, 78,
    "the threat handoff must retain the nearby fighting plane instead of rolling down to 55");
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "the seven-degree same-side correction must not insert another no-G transfer");
  assert.ok(command.pitch > 0,
    "the captured lateral plane should begin building defensive G immediately");

  const latched = fixedWingAiCommand({
    ...tape486HandoffState,
    gamma_deg: 10,
    roll_rate_dps: 25,
  }, "f22", controllerState);
  assert.equal(latched.target.combatDefensiveBreakPlaneMagnitudeDeg, 78,
    "aim chatter cannot reconsider the latched recovery handoff");

  const ordinaryEntry = fixedWingAiCommand(
    tape486HandoffState,
    "f22",
    createHandoffController(false),
  );
  assert.equal(ordinaryEntry.target.combatDefensiveNoseHighLateralPlanePreserved, false);
  assert.equal(ordinaryEntry.target.combatDefensiveBreakPlaneMagnitudeDeg, 55,
    "the exception is limited to a completed recovery handoff, not every nose-high threat");
});

test("Tape 472 does not call a shooter below the climbing flight path high", () => {
  const command = fixedWingAiCommand({
    px: 2_815.3, py: 3_689.511, pz: 0.81,
    bx: 1_304.525, by: 3_882.871, bz: 351.968,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 235.48,
    bank_deg: 70.45,
    roll_rate_dps: -0.87,
    gamma_deg: 13.26,
    true_airspeed_kts: 423.55,
    g_maxperform: 9,
    g_actual: 2.916,
    aoa_deg: 5.47,
    requested_g_cmd: 2.023,
    g_cmd: 2.023,
    range_m: 1_563.1,
    closure_kts: 719.7,
    lead_valid: false,
  }, "f22", createFixedWingAiControllerState());
  assert.ok(command.target.combatDefensiveShooterElevationDeg > 7);
  assert.ok(command.target.combatDefensiveShooterElevationDeg
    < 13.26 - 3,
  "the exact attacker remains materially below Tape 472's flown climb");
  assert.equal(command.target.combatDefensiveBreakPlaneMagnitudeDeg, 55,
    "an attacker below the flown climb needs the reachable low plane, not the 112-degree roll");
  assert.equal(command.target.combatLoadedRollUnloadActive, true,
    "the smaller correction still obeys the measured-load transfer interlock");
});

test("Tape 471 high-shooter defense uses a bounded plane and exits after conversion", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = 1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 82;
  const tape471HighPlane = {
    px: 2_365.114, py: 3_801.463, pz: -365.133,
    bx: 1_839.852, by: 3_913.879, bz: 70.378,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    heading_deg: 264.21,
    bank_deg: 82,
    roll_rate_dps: 0.76,
    gamma_deg: 2.49,
    true_airspeed_kts: 453.51,
    g_maxperform: 9,
    g_actual: 9.29,
    aoa_deg: 15.37,
    requested_g_cmd: 8.99,
    g_cmd: 8.99,
    range_m: 691.5,
    closure_kts: 694.8,
    lead_valid: false,
  };
  const freshHighShooterClassification = fixedWingAiCommand(
    tape471HighPlane, "f22", createFixedWingAiControllerState(),
  );
  assert.ok(freshHighShooterClassification.target.combatDefensiveShooterElevationDeg > 9);
  assert.equal(
    freshHighShooterClassification.target.combatDefensiveBreakPlaneMagnitudeDeg,
    82,
    "Tape 471's nine-degree attacker remains materially high after widening the Tape 490 seam",
  );
  const beforeConversion = fixedWingAiCommand(
    tape471HighPlane, "f22", controllerState,
  );
  assert.equal(beforeConversion.target.combatDefensiveBreakPlaneMagnitudeDeg, 82);
  assert.equal(beforeConversion.target.combatDefensiveHighPlaneReleaseSamples, 0);
  assert.ok(Math.abs(beforeConversion.target.desiredLoadFactorG - 8.4) < 1e-9,
    "the live 9.29-G frame must be capped before it can retrigger the structural warning");

  const tape471Converted = {
    ...tape471HighPlane,
    px: 2_209.368, py: 3_797.338, pz: -398.158,
    bx: 1_976.095, by: 3_877.783, bz: -42.482,
    heading_deg: 279.07,
    bank_deg: 81.5,
    roll_rate_dps: 1.58,
    gamma_deg: -5.42,
    true_airspeed_kts: 451,
    g_actual: 8.94,
    aoa_deg: 14.87,
    requested_g_cmd: 8.99,
    g_cmd: 8.99,
    range_m: 432.9,
    closure_kts: 678.8,
  };
  const firstConvertedSample = fixedWingAiCommand(
    tape471Converted, "f22", controllerState,
  );
  assert.equal(firstConvertedSample.target.combatDefensiveHighPlaneReleaseSamples, 1);
  assert.equal(firstConvertedSample.target.combatDefensiveBreakPlaneMagnitudeDeg, 82,
    "one threshold sample cannot collapse the defensive plane on telemetry noise");
  const release = fixedWingAiCommand(
    tape471Converted, "f22", controllerState,
  );
  assert.equal(release.target.combatDefensiveHighPlaneComplete, true);
  assert.equal(release.target.combatDefensiveHighPlaneRecoveryActive, true);
  assert.equal(release.target.combatDefensiveBreakPlaneMagnitudeDeg, 78);
  assert.equal(release.target.combatLoadedRollUnloadActive, true);
  assert.equal(release.target.combatLoadedRollPhase, "unload");
  assert.equal(release.target.combatLoadedRollTargetBankDeg, 78);
  assert.equal(release.target.desiredBankDeg, tape471Converted.bank_deg,
    "the 82-to-78 transition must hold its loaded physical plane before rolling");
  assert.equal(release.pitch, -0.10);

  controllerState.combatDefensiveBreakSamples = 1;
  const expiredThreatLatch = fixedWingAiCommand({
    ...tape471Converted,
    opponent_present: false,
    opponent_alive: false,
    opponent_gun_firing: false,
  }, "f22", controllerState);
  assert.equal(expiredThreatLatch.target.combatDefensiveBreakActive, false);
  assert.equal(expiredThreatLatch.target.combatDefensiveHighPlaneRecoveryActive, true);
  assert.equal(expiredThreatLatch.target.invertedRecoveryActive, false,
    "break expiry cannot let generic roll-to-level steal the committed 78-degree recovery");
  assert.equal(expiredThreatLatch.target.combatLoadedRollTargetBankDeg, 78);
  assert.equal(expiredThreatLatch.pitch, -0.10);
});

test("Tape 478 high-defense capture shoulder does not re-arm its loaded-roll interlock", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveLastCommittedBreakSign = 1;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 82;
  const command = fixedWingAiCommand({
    px: 0, py: 3_000, pz: 0,
    bx: 0, by: 3_400, bz: -900,
    opponent_present: false,
    opponent_alive: false,
    opponent_gun_firing: false,
    formation_gun_firing: false,
    heading_deg: 0,
    bank_deg: 75.27,
    roll_rate_dps: 3.29,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_maxperform: 9,
    g_actual: 0.541,
    aoa_deg: 0.99,
    requested_g_cmd: 2.213,
    g_cmd: 2.213,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(command.target.combatDefensiveBreakActive, true);
  assert.equal(command.target.combatDefensiveBreakPlaneMagnitudeDeg, 82);
  assert.equal(command.target.combatLoadedRollUnloadActive, false,
    "the released 6.73-degree shoulder is already inside the eight-degree capture gate");
  assert.equal(command.target.combatLoadedRollPhase, "idle");
  assert.equal(command.target.combatDefensiveOverbankGuardActive, false);
  assert.equal(command.target.desiredBankDeg, 82);
  assert.ok(command.pitch > 0.9,
    "the captured defensive plane should pull instead of restarting another unload cycle");
  assert.ok(command.roll > 0 && command.roll < 0.15,
    "the captured plane needs one stable inward maintenance command");
});

test("F-22 formation tracer onset holds its loaded side without stealing recovery ownership", () => {
  const rearTrackingState = {
    px: 0, py: 2_300, pz: 0,
    bx: 2_000, by: 2_300, bz: 500,
    w1_present: 1, w1_alive: 1,
    w1x: 0, w1y: 2_300, w1z: -600,
    w1_trigger_down: 0, w1_gun_firing: 0,
    formation_gun_firing: false,
    heading_deg: 0,
    bank_deg: 78,
    gamma_deg: 0,
    roll_rate_dps: 0,
    true_airspeed_kts: 500,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  };
  const controllerState = createFixedWingAiControllerState();
  const preShot = fixedWingAiCommand(rearTrackingState, "f22", controllerState);
  assert.equal(preShot.target.desiredBankDeg, 78);

  const firing = {
    ...rearTrackingState,
    w1_trigger_down: 1,
    w1_gun_firing: 1,
    formation_gun_firing: true,
  };
  const tracerOnset = fixedWingAiCommand(firing, "f22", controllerState);
  assert.equal(tracerOnset.target.desiredBankDeg, 78,
    "formation gunfire must not trigger the same lethal full roll reversal");
  assert.ok(tracerOnset.pitch > 0.95,
    "the formation break must keep pulling its full available G");
  const continuousFire = fixedWingAiCommand(firing, "f22", controllerState);
  assert.equal(continuousFire.target.desiredBankDeg, 78,
    "continuous formation fire cannot produce per-frame roll reversals");

  const recoveryState = createFixedWingAiControllerState();
  fixedWingAiCommand(rearTrackingState, "f22", recoveryState);
  const recoveringUnderFire = fixedWingAiCommand({
    ...firing,
    bank_deg: 112,
  }, "f22", recoveryState);
  assert.equal(recoveringUnderFire.target.invertedRecoveryActive, true);
  assert.equal(recoveringUnderFire.target.invertedRecoveryTargetBankDeg, 78);
  assert.equal(recoveringUnderFire.target.desiredBankDeg, 78,
    "current-frame recovery must retain roll ownership through tracer onset");
  const handbackUnderContinuousFire = fixedWingAiCommand({
    ...firing,
    bank_deg: 78,
    roll_rate_dps: 0,
  }, "f22", recoveryState);
  assert.equal(handbackUnderContinuousFire.target.invertedRecoveryActive, false);
  assert.equal(handbackUnderContinuousFire.target.desiredBankDeg, 78,
    "continuous fire must resume the same committed side when recovery hands control back");
});

test("F-22 primary burst holds Tape 445's same-side 55-degree plane", () => {
  const controllerState = createFixedWingAiControllerState();
  controllerState.combatDefensiveBreakSamples = 32;
  controllerState.combatDefensiveBreakSign = 1;
  controllerState.combatDefensiveBreakHasCommitted = true;
  controllerState.combatDefensiveBreakPlaneMagnitudeDeg = 55;
  const tape445Gunfire = fixedWingAiCommand({
    px: 0, py: 2_300, pz: 0,
    bx: 0, by: 2_300, bz: -794,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    formation_gun_firing: false,
    w1_present: 0, w1_alive: 0, w1_trigger_down: 0, w1_gun_firing: 0,
    heading_deg: 0,
    bank_deg: 55,
    roll_rate_dps: 0,
    gamma_deg: 1.36,
    true_airspeed_kts: 500,
    g_maxperform: 9,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(tape445Gunfire.target.desiredBankDeg, 55,
    "the first burst must retain the selected-primary plane that denies its solution");
  assert.ok(tape445Gunfire.pitch > 0.95,
    "the settled first plane must pull the full available G through projectile flight");
  assert.equal(controllerState.combatDefensiveBreakSign, 1);

  const continuous = fixedWingAiCommand({
    px: 0, py: 2_300, pz: 0,
    bx: 0, by: 2_300, bz: -760,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: true,
    formation_gun_firing: false,
    heading_deg: 0,
    bank_deg: 70,
    roll_rate_dps: 40,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_maxperform: 9,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(continuous.target.desiredBankDeg, 55,
    "continuous primary fire cannot retrigger a plane change on every sample");

  const postBurst = fixedWingAiCommand({
    px: 0, py: 2_300, pz: 0,
    bx: 0, by: 2_300, bz: -730,
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: false,
    formation_gun_firing: false,
    heading_deg: 0,
    bank_deg: 55,
    roll_rate_dps: 0,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    g_maxperform: 9,
    g_actual: 1,
    aoa_deg: 4,
    lead_valid: false,
  }, "f22", controllerState);
  assert.equal(postBurst.target.desiredBankDeg, 55,
    "an off pulse must retain the latched plane while airborne rounds remain live");
  assert.equal(postBurst.pitch, 1);
});

test("F-22 reproduces Tape 445 and 446 same-side 55-degree breaks", () => {
  const aimedBandit = ({
    rangeM, noseErrorDeg, bankDeg, rollRateDps, gammaDeg, closureKts,
    gunFiring = false,
  }) => ({
    px: 0, py: 4_300, pz: 0,
    bx: 0, by: 4_300, bz: -rangeM,
    bfx: Math.sin(noseErrorDeg * Math.PI / 180),
    bfy: 0,
    bfz: Math.cos(noseErrorDeg * Math.PI / 180),
    opponent_present: true,
    opponent_alive: true,
    opponent_gun_firing: gunFiring,
    formation_gun_firing: false,
    closure_kts: closureKts,
    bandit_entity_id: "primary",
    heading_deg: 0,
    bank_deg: bankDeg,
    roll_rate_dps: rollRateDps,
    gamma_deg: gammaDeg,
    g_actual: 1,
    aoa_deg: 4,
    true_airspeed_kts: 460,
    g_maxperform: 9,
    lead_valid: false,
  });

  const tape445 = createFixedWingAiControllerState();
  fixedWingAiCommand(aimedBandit({
    rangeM: 1_590, noseErrorDeg: 0.50, bankDeg: 76.76,
    rollRateDps: 0, gammaDeg: -3.5, closureKts: 344.1,
  }), "f22", tape445);
  const tape445Entry = fixedWingAiCommand(aimedBandit({
    rangeM: 1_580.4, noseErrorDeg: 0.37, bankDeg: 76.76,
    rollRateDps: 0, gammaDeg: -3.5, closureKts: 344.1,
  }), "f22", tape445);
  assert.equal(tape445Entry.target.desiredBankDeg, 55,
    "Tape 445's descending right break must first move to the upward 55-degree plane");
  assert.equal(tape445Entry.pitch, 1,
    "an aligned Tape 445 aim entry must request the full published 9 G");
  const tape445Burst = fixedWingAiCommand(aimedBandit({
    rangeM: 794, noseErrorDeg: 2.69, bankDeg: 55,
    rollRateDps: 0, gammaDeg: -2, closureKts: 555.3, gunFiring: true,
  }), "f22", tape445);
  assert.equal(tape445Burst.target.desiredBankDeg, 55,
    "Tape 445's first burst must keep the already-displacing +55 plane");
  assert.equal(tape445Burst.pitch, 1);
  const tape445PostBurst = fixedWingAiCommand(aimedBandit({
    rangeM: 760, noseErrorDeg: 3, bankDeg: 55,
    rollRateDps: 0, gammaDeg: -2, closureKts: 520, gunFiring: false,
  }), "f22", tape445);
  assert.equal(tape445PostBurst.target.desiredBankDeg, 55,
    "Tape 445's off pulse must retain the same upward plane through projectile flight");
  assert.equal(tape445PostBurst.pitch, 1);

  const tape446 = createFixedWingAiControllerState();
  fixedWingAiCommand(aimedBandit({
    rangeM: 926.1, noseErrorDeg: 29.97, bankDeg: -84.53,
    rollRateDps: 1.55, gammaDeg: 7.94, closureKts: 364.9,
  }), "f22", tape446);
  const tape446Entry = fixedWingAiCommand(aimedBandit({
    rangeM: 916.3, noseErrorDeg: 29.04, bankDeg: -84.38,
    rollRateDps: 8.47, gammaDeg: 7.92, closureKts: 371.2,
  }), "f22", tape446);
  assert.equal(tape446Entry.target.desiredBankDeg, -55,
    "Tape 446's climbing left break must move upward on the same attacker side");
  assert.equal(tape446Entry.pitch, 1);
  const tape446Burst = fixedWingAiCommand(aimedBandit({
    rangeM: 840.9, noseErrorDeg: 21.63, bankDeg: -82.66,
    rollRateDps: 6.72, gammaDeg: 7.9, closureKts: 410.2, gunFiring: true,
  }), "f22", tape446);
  assert.equal(tape446Burst.target.desiredBankDeg, -55,
    "the first Tape 446 burst must reinforce the same-sign upright break");
  assert.equal(tape446Burst.pitch, 1);

  const tape446PostBurst = fixedWingAiCommand(aimedBandit({
    rangeM: 650, noseErrorDeg: 10, bankDeg: -55,
    rollRateDps: 0, gammaDeg: 0, closureKts: 450, gunFiring: false,
  }), "f22", tape446);
  assert.equal(tape446PostBurst.target.desiredBankDeg, -55,
    "Tape 446's off edge must not manufacture a roll oscillation");
  assert.equal(tape446PostBurst.pitch, 1);
  const tape446SecondBurst = fixedWingAiCommand(aimedBandit({
    rangeM: 450, noseErrorDeg: 2, bankDeg: -55,
    rollRateDps: 0, gammaDeg: 0, closureKts: 450, gunFiring: true,
  }), "f22", tape446);
  assert.equal(tape446SecondBurst.target.desiredBankDeg, -55,
    "a follow-up burst must still never change the attacker side");
  assert.equal(tape446SecondBurst.pitch, 1);
});

function topGunRecoveryState(overrides = {}) {
  return {
    player_rtb_active: true,
    approach_guidance_active: true,
    approach_gate_count: 8,
    approach_gates: [{
      east_m: 1_000,
      north_m: 0,
      up_m: 800,
      half_m: 450,
      target_ktas: 350,
      dirty: 0,
      active: 1,
    }],
    px: 0, py: 1_000, pz: 0,
    bx: -5_000, by: 3_000, bz: -5_000,
    pfx: 0, pfy: 0, pfz: 1,
    plx: 0, ply: 1, plz: 0,
    heading_deg: 0,
    bank_deg: 0,
    roll_rate_dps: 0,
    gamma_deg: 0,
    true_airspeed_kts: 500,
    calibrated_airspeed_kts: 430,
    g_maxperform: 7.5,
    throttle: 1,
    approach_power_01: 0.25,
    tx: 2_000, ty: 20, tz: 0,
    cx: 2_100, cy: 20, cz: 0,
    ...overrides,
  };
}

test("Top Gun recovery follows live gates and turns WIRES into a physical deck intercept", () => {
  const initial = topGunRecoveryTarget(topGunRecoveryState());
  assert.deepEqual(initial, {
    x: 1_000, y: 800, z: 0,
    targetKtas: 350, halfM: 450, dirty: false, gateCount: 8,
    mode: "carrier-approach",
  });

  const finalState = topGunRecoveryState({
    approach_gate_count: 1,
    approach_gates: [{
      east_m: 1_820, north_m: 0, up_m: 31,
      half_m: 120, target_ktas: 142, dirty: 1, active: 1,
    }],
  });
  assert.deepEqual(topGunRecoveryTarget(finalState), {
    x: 2_000, y: 20, z: 0,
    targetKtas: 142, halfM: 120, dirty: true, gateCount: 1,
    mode: "carrier-final",
  });
  const command = fixedWingAiCommand(finalState, "top-gun");
  assert.equal(command.target.mode, "carrier-final");
  assert.equal(command.target.approachGateCount, 1);
  assert.equal(command.target.approachTargetKtas, 142);
  assert.ok(Math.abs(command.target.desiredBankDeg) <= 18,
    "the final cannot throw combat-bank authority at the deck");
  assert.ok(command.target.desiredGammaDeg >= -8 && command.target.desiredGammaDeg <= 12);
  assert.equal(command.throttleDown, true,
    "the production power rocker must decelerate toward the live approach schedule");
  assert.equal(command.target.combatDefensiveBreakActive, false);
});

test("Top Gun recovery never falls back to the dead opponent and evidence phases are stable", () => {
  const fallback = topGunRecoveryTarget(topGunRecoveryState({
    approach_guidance_active: false,
    approach_gate_count: 0,
    approach_gates: [],
  }));
  assert.equal(fallback.mode, "carrier-home-fallback");
  assert.deepEqual([fallback.x, fallback.z], [2_100, -5_556]);
  assert.equal(fixedWingAiEvidencePhase({ playerReturnToBaseActive: false }, "top-gun"), "fight");
  assert.equal(fixedWingAiEvidencePhase({ playerReturnToBaseActive: true }, "top-gun"), "rtb");
  assert.equal(fixedWingAiEvidencePhase({
    playerReturnToBaseActive: true,
    approachGuidanceActive: true,
    approachGateCount: 8,
  }, "top-gun"), "approach-1");
  assert.equal(fixedWingAiEvidencePhase({
    playerReturnToBaseActive: true,
    approachGuidanceActive: true,
    approachGateCount: 1,
  }, "top-gun"), "wires");
});

test("hardware phase captures wait for settled, action-qualified flight", () => {
  assert.equal(fixedWingPhaseCaptureReady({ wallS: 0.8 }, "rapier", "active"), false);
  assert.equal(fixedWingPhaseCaptureReady({
    wallS: 5,
    rangeM: 1_800,
    aiLeadOffBoresightDeg: 12,
    aiGunLeadFinisherActive: false,
  }, "f22", "fight"), false);
  assert.equal(fixedWingPhaseCaptureReady({
    wallS: 5,
    rangeM: 1_800,
    aiLeadOffBoresightDeg: 12,
    aiGunLeadFinisherActive: true,
    padlockPhase: "TRACK",
    aiCombatLoadedRollUnloadActive: false,
    aiVerticalRecoveryPhase: "idle",
    aiTerrainRecoveryPhase: "idle",
    rollRateDps: 12,
    actualG: 4,
    closureKts: 300,
  }, "f22", "fight"), true);
  assert.equal(fixedWingPhaseCaptureReady({
    wallS: 5,
    rangeM: 49,
    aiLeadOffBoresightDeg: 8,
    aiGunLeadFinisherActive: true,
    padlockPhase: "TRACK",
    aiCombatLoadedRollUnloadActive: false,
    aiVerticalRecoveryPhase: "idle",
    aiTerrainRecoveryPhase: "idle",
    rollRateDps: 106,
    actualG: 0.7,
    closureKts: -87,
  }, "f22", "fight"), false,
  "an unloading 49-m overshoot cannot masquerade as the fight screenshot");
  assert.equal(fixedWingPhaseCaptureReady({
    wallS: 5,
    rangeM: 900,
    aiLeadOffBoresightDeg: 5,
    aiGunLeadFinisherActive: true,
    padlockPhase: "ACQUIRE",
    aiCombatLoadedRollUnloadActive: false,
    aiVerticalRecoveryPhase: "idle",
    aiTerrainRecoveryPhase: "idle",
    rollRateDps: 4,
    actualG: 5,
    closureKts: 200,
  }, "f22", "fight"), false,
  "camera-settling frames are not representative visual evidence");
  assert.equal(fixedWingPhaseCaptureReady({ wallS: 1.1 }, "rapier", "active"), true);
});

test("first-run target follows the authority-published curved centreline", () => {
  const state = {
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
    first_run_weapons_cold: true,
    first_run_valley_available: true,
    first_run_valley_center_east_m: 0,
    first_run_valley_entry_north_m: -6_000,
    first_run_valley_popout_north_m: -1_200,
    first_run_valley_route_alt_m: 240,
    first_run_valley_floor_height_m: 100,
    first_run_valley_floor_blend_drop_m: 10,
    first_run_valley_floor_half_width_m: 300,
    first_run_valley_crest_offset_m: 700,
    first_run_valley_outer_offset_m: 1_000,
    first_run_valley_west_ridge_rise_m: 300,
    first_run_valley_east_ridge_rise_m: 250,
    first_run_valley_curve_amplitude_m: 430,
    first_run_valley_curve_wavelength_m: 4_800,
    first_run_valley_south_extent_north_m: -6_600,
    first_run_valley_south_full_north_m: -6_200,
    first_run_valley_popout_fade_start_north_m: -1_500,
    first_run_valley_north_extent_north_m: -900,
    px: 0, py: 240, pz: -5_000,
  };
  const target = fixedWingAiTarget(state, "first-run");
  assert.equal(target.mode, "valley");
  assert.equal(target.y, 240);
  assert.equal(target.z, -4_050);
  assert.notEqual(target.x, 0);

  const longValley = {
    ...state,
    first_run_valley_entry_north_m: -19_200,
    first_run_valley_popout_north_m: -1_200,
    first_run_valley_curve_amplitude_m: 1_200,
    first_run_valley_curve_wavelength_m: 18_000,
    first_run_valley_south_extent_north_m: -21_000,
    first_run_valley_south_full_north_m: -19_800,
    first_run_valley_popout_fade_start_north_m: -3_600,
    first_run_valley_north_extent_north_m: -450,
    true_airspeed_kts: 429,
  };
  const leftApexFeedForwardDeg = firstRunValleyBankFeedForwardDeg({
    ...longValley,
    pz: -19_200 + 18_000 * 0.35,
  });
  const rightApexFeedForwardDeg = firstRunValleyBankFeedForwardDeg({
    ...longValley,
    pz: -19_200 + 18_000 * 0.65,
  });
  assert.ok(leftApexFeedForwardDeg < -25 && leftApexFeedForwardDeg > -35);
  assert.ok(rightApexFeedForwardDeg > 25 && rightApexFeedForwardDeg < 35,
    "the route controller must anticipate both turn directions before heading error grows");
});

test("first-run clearance evidence measures the published floor instead of mere survival", () => {
  const published = {
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
    first_run_valley_available: true,
    first_run_valley_geometry_version: 1,
    first_run_valley_center_east_m: 0,
    first_run_valley_entry_north_m: -6_000,
    first_run_valley_popout_north_m: -1_200,
    first_run_valley_route_alt_m: 240,
    first_run_valley_floor_height_m: 100,
    first_run_valley_floor_blend_drop_m: 10,
    first_run_valley_floor_half_width_m: 300,
    first_run_valley_crest_offset_m: 700,
    first_run_valley_outer_offset_m: 1_000,
    first_run_valley_west_ridge_rise_m: 300,
    first_run_valley_east_ridge_rise_m: 250,
    first_run_valley_curve_amplitude_m: 430,
    first_run_valley_curve_wavelength_m: 4_800,
    first_run_valley_south_extent_north_m: -6_600,
    first_run_valley_south_full_north_m: -6_200,
    first_run_valley_popout_fade_start_north_m: -1_500,
    first_run_valley_north_extent_north_m: -900,
  };
  const samples = [
    { weaponsCold: true, xM: 0, zM: -6_000, terrainPresent: true,
      belowGround: false, radarAltitudeFt: 420, state: published },
    { weaponsCold: true, xM: 260, zM: -6_000, terrainPresent: true,
      belowGround: false, radarAltitudeFt: 380, state: published },
  ];
  assert.deepEqual(firstRunValleyClearanceEvidence(samples), {
    coldSamples: 2,
    profileSamples: 2,
    profileCoverage: 1,
    terrainCoverage: 1,
    radarAltitudeCoverage: 1,
    belowGroundSamples: 0,
    minimumFloorMarginM: 40,
    p05FloorMarginM: 40,
    calibratedSpeedCoverage: 0,
    minimumCalibratedSpeedKts: null,
    medianCalibratedSpeedKts: null,
    p95CalibratedSpeedKts: null,
    maximumCalibratedSpeedKts: null,
    gMaxPerformCoverage: 0,
    requestedLoadFactorCoverage: 0,
    appliedLoadFactorCoverage: 0,
    actualLoadFactorCoverage: 0,
    maximumDesiredLoadFactorG: null,
    maximumRequestedLoadFactorG: null,
    maximumAppliedLoadFactorG: null,
    maximumActualLoadFactorG: null,
    loadTurnExpectedSamples: 0,
    pullProofSamples: 0,
    maximumRequestedPullG: null,
    maximumAppliedPullG: null,
    maximumActualPullG: null,
  });
});

test("ordered phase evidence rejects a skipped mission phase", () => {
  assert.equal(orderedValuesVisited([
    { phase: "launch" }, { phase: "climb" }, { phase: "attack" },
  ], "phase", ["launch", "climb", "attack"]).pass, true);
  assert.equal(orderedValuesVisited([
    { phase: "launch" }, { phase: "attack" },
  ], "phase", ["launch", "climb", "attack"]).pass, false);
});

function commonSample(overrides = {}) {
  const wallS = Number(overrides.wallS) || 0;
  return {
    wallS: 0,
    missionId: "mission.modern.ace-duel.f22a-vs-su27s.public-data-surrogate.v1",
    tick: 0,
    playerTerminal: "FLYING",
    opponentTerminal: "FLYING",
    pilotControlInterlocked: false,
    weaponsCold: false,
    weaponsInhibited: false,
    playerReturnToBaseActive: false,
    autoGcasActive: false,
    autoGcasOverrideHeld: false,
    aiTerrainEscapeRecovery: false,
    aiTerrainRecoveryPhase: "idle",
    aiVerticalRecoveryPhase: "idle",
    aiInvertedRecoveryActive: false,
    aiCombatDefensiveBreakActive: false,
    aiCombatDownhillSliceActive: false,
    aiCombatDownhillRecoveryPhase: "idle",
    aiGunLeadFinisherActive: false,
    aiFireCommand: false,
    xM: 0, yM: 1_000, zM: 0,
    gammaDeg: 0,
    rangeM: 8_000,
    closureKts: 200,
    roundsFired: 0,
    hits: 0,
    killCount: 0,
    opponentHealth: 1,
    opponentXM: 0, opponentYM: 1_000, opponentZM: 8_000 + wallS * 200,
    radarAltitudeFt: 3_000,
    verticalSpeedFpm: 0,
    autoGcasActivationCount: 0,
    autoGcasOverrideCount: 0,
    rollRateDps: 0,
    aoaDeg: 5,
    requestedRoll: 0.4,
    requestedG: 1,
    visibilityState: "visible",
    gamepadConnected: true,
    ...overrides,
  };
}

test("combat assessment requires actual join, weapon and damage evidence", () => {
  const samples = [
    commonSample(),
    commonSample({
      wallS: 1.9, tick: 228, xM: 2_000, rangeM: 900,
      aiGunLeadFinisherActive: true, gunSolutionRaw: true,
      gunSolution: true, aiFireCommand: true,
    }),
    commonSample({
      wallS: 2, tick: 240, xM: 2_100, rangeM: 850,
      aiGunLeadFinisherActive: true, gunSolutionRaw: true,
      gunSolution: true, aiFireCommand: true,
      roundsFired: 24, hits: 1, opponentHealth: 0,
      opponentTerminal: "DESTROYED", killCount: 1,
    }),
  ];
  assert.deepEqual(assessFixedWingAiFlight(samples, { mission: "f22" }).failures, []);
  const inert = samples.map((sample) => ({
    ...sample, rangeM: 7_000, roundsFired: 0, hits: 0, opponentHealth: 1,
    opponentTerminal: "FLYING", killCount: 0,
  }));
  assert.ok(assessFixedWingAiFlight(inert, { mission: "f22" }).failures.length >= 3);
});

test("live F-22 acceptance requires finisher engagement and a held qualified solution", () => {
  const tape = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    rangeM: index < 20 ? 4_000 : 850,
    aiGunLeadFinisherActive: index >= 20 && index <= 70,
    aiGunLeadRollCaptureActive: index >= 48 && index <= 70,
    gunSolutionRaw: index >= 48 && index <= 52,
    gunSolution: index === 50,
    aiFireCommand: index === 50,
    roundsFired: index >= 55 ? 20 : 0,
    hits: index >= 60 ? 1 : 0,
    opponentHealth: index >= 60 ? 0 : 1,
    opponentTerminal: index >= 60 ? "DESTROYED" : "FLYING",
    killCount: index >= 60 ? 1 : 0,
  }));
  const fleeting = assessFixedWingAiFlight(tape, { mission: "f22" });
  assert.equal(fleeting.metrics.gunLeadFinisherSamples, 51);
  assert.equal(fleeting.metrics.maximumRawGunSolutionSamples, 5);
  assert.equal(fleeting.metrics.maximumQualifiedGunSolutionSamples, 1);
  assert.equal(fleeting.metrics.maximumShootableQualifiedGunSolutionSamples, 1);
  assert.match(fleeting.failures.join("\n"), /no shootable two-sample qualified gun solution/);

  const held = tape.map((sample, index) => ({
    ...sample,
    gunSolution: index === 50 || index === 51,
    aiFireCommand: index === 50 || index === 51,
  }));
  const qualified = assessFixedWingAiFlight(held, { mission: "f22" });
  assert.equal(qualified.metrics.maximumQualifiedGunSolutionSamples, 2);
  assert.equal(qualified.metrics.maximumShootableQualifiedGunSolutionSamples, 2);
  assert.equal(qualified.metrics.gunLeadRollCaptureSamples, 23);
  assert.equal(qualified.metrics.roundsBeforeFirstQualifiedGunSolution, 0);
  assert.doesNotMatch(qualified.failures.join("\n"), /qualified gun solution/);

  for (const [label, blockedState] of [
    ["vertical recovery", { aiVerticalRecoveryPhase: "slice" }],
    ["inverted recovery", { aiInvertedRecoveryActive: true }],
    ["defensive break", { aiCombatDefensiveBreakActive: true }],
    ["downhill slice", { aiCombatDownhillSliceActive: true }],
    ["Auto-GCAS", { autoGcasActive: true }],
  ]) {
    const blocked = held.map((sample, index) => ({
      ...sample,
      ...(index === 50 || index === 51 ? blockedState : {}),
    }));
    const blockedAssessment = assessFixedWingAiFlight(blocked, { mission: "f22" });
    assert.equal(blockedAssessment.metrics.maximumQualifiedGunSolutionSamples, 2,
      "production telemetry still records the geometric solution");
    assert.equal(blockedAssessment.metrics.maximumShootableQualifiedGunSolutionSamples, 0,
      `${label} coincidence is not a firing opportunity`);
    assert.match(
      blockedAssessment.failures.join("\n"),
      /no shootable two-sample qualified gun solution/,
    );
  }

  const uncontrolledClosure = held.map((sample, index) => ({
    ...sample,
    closureKts: index === 50 || index === 51 ? 1_200 : sample.closureKts,
  }));
  assert.equal(
    assessFixedWingAiFlight(uncontrolledClosure, { mission: "f22" })
      .metrics.maximumShootableQualifiedGunSolutionSamples,
    0,
    "the grader must use the same closure gate as the browser trigger",
  );

  const missingInterlockTelemetry = held.map((sample) => ({
    ...sample,
    autoGcasActive: undefined,
  }));
  assert.equal(
    assessFixedWingAiFlight(missingInterlockTelemetry, { mission: "f22" })
      .metrics.maximumShootableQualifiedGunSolutionSamples,
    0,
    "missing safety telemetry must fail closed",
  );

  const missingFireTelemetry = held.map((sample, index) => ({
    ...sample,
    aiFireCommand: index === 50 || index === 51 ? undefined : sample.aiFireCommand,
  }));
  assert.equal(
    assessFixedWingAiFlight(missingFireTelemetry, { mission: "f22" })
      .metrics.maximumShootableQualifiedGunSolutionSamples,
    0,
    "missing actual trigger evidence must fail closed",
  );

  const triggerNotCommanded = held.map((sample) => ({
    ...sample,
    aiFireCommand: false,
  }));
  assert.equal(
    assessFixedWingAiFlight(triggerNotCommanded, { mission: "f22" })
      .metrics.maximumShootableQualifiedGunSolutionSamples,
    0,
    "a geometric solution is not shootable evidence when the browser never commanded fire",
  );

  const missingFinisherTelemetry = held.map((sample) => ({
    ...sample,
    aiGunLeadFinisherActive: undefined,
  }));
  assert.match(
    assessFixedWingAiFlight(missingFinisherTelemetry, { mission: "f22" })
      .failures.join("\n"),
    /gun-finisher telemetry covered 0% of flight/,
    "complete loss of finisher telemetry must fail instead of skipping acceptance",
  );

  const firedOnFirstQualifiedSample = held.map((sample, index) => ({
    ...sample,
    roundsFired: index >= 50 ? 2 : 0,
  }));
  assert.equal(
    assessFixedWingAiFlight(firedOnFirstQualifiedSample, { mission: "f22" })
      .metrics.roundsBeforeFirstQualifiedGunSolution,
    0,
    "rounds first observed with a qualified solution were not fired before it",
  );

  const sprayed = held.map((sample, index) => ({
    ...sample,
    roundsFired: index >= 30 ? 751 : sample.roundsFired,
  }));
  const unaimed = assessFixedWingAiFlight(sprayed, { mission: "f22" });
  assert.equal(unaimed.metrics.roundsBeforeFirstQualifiedGunSolution, 751);
  assert.match(unaimed.failures.join("\n"), /751 rounds before its first qualified solution/);
});

test("browser-rate gun proof survives an observer sample that lands after the cone", () => {
  const tape = Array.from({ length: 80 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    rangeM: index < 20 ? 4_000 : 850,
    aiGunLeadFinisherActive: index >= 20 && index <= 70,
    // The outer observer misses the two exact controller frames. Monotonic browser diagnostics
    // first become visible with the resulting burst on the following sample.
    gunSolutionRaw: false,
    gunSolution: false,
    aiFireCommand: false,
    aiGunFireMaximumEligibleSamples: index >= 51 ? 2 : 0,
    aiGunFireCommandUpdates: index >= 51 ? 1 : 0,
    roundsFired: index >= 51 ? 6 : 0,
    hits: index >= 60 ? 1 : 0,
    opponentHealth: index >= 60 ? 0 : 1,
    opponentTerminal: index >= 60 ? "DESTROYED" : "FLYING",
    killCount: index >= 60 ? 1 : 0,
  }));
  const assessment = assessFixedWingAiFlight(tape, { mission: "f22" });
  assert.equal(assessment.metrics.observedShootableQualifiedGunSolutionSamples, 0);
  assert.equal(assessment.metrics.browserMaximumGunFireEligibleSamples, 2);
  assert.equal(assessment.metrics.maximumShootableQualifiedGunSolutionSamples, 2);
  assert.equal(assessment.metrics.roundsBeforeFirstQualifiedGunSolution, 0);
  assert.doesNotMatch(assessment.failures.join("\n"), /qualified gun solution/);
  assert.doesNotMatch(assessment.failures.join("\n"), /rounds before/);
});

test("first-run assessment requires the heaters-to-guns handoff", () => {
  const missionId = "mission.modern.visual-merge.first-run-valley.v1";
  const openingPairOnly = [
    commonSample({
      missionId, zM: -19_200, weaponsCold: true, aim9Remaining: 2,
      banditEntityId: "opening-lead", sortiePlayerRoundsFired: 0, sortiePlayerHits: 0,
    }),
    commonSample({
      missionId, wallS: 80, tick: 9_600, zM: -1_000,
      weaponsCold: false, aim9Remaining: 0,
      opponentTerminal: "DESTROYED", killCount: 2,
      banditEntityId: "opening-wing", sortiePlayerRoundsFired: 0, sortiePlayerHits: 0,
    }),
  ];
  assert.deepEqual(firstRunGunHandoffEvidence(openingPairOnly), {
    pairComplete: true,
    successorSeen: false,
    gunRoundsFired: false,
    gunHitSeen: false,
  });
  assert.match(
    assessFixedWingAiFlight(openingPairOnly, { mission: "first-run" }).failures.join("\n"),
    /no live gun-phase successor/,
  );

  const samples = [
    ...openingPairOnly,
    commonSample({
      missionId, wallS: 83, tick: 9_960, zM: -500,
      weaponsCold: false, aim9Remaining: 0,
      opponentTerminal: "FLYING", killCount: 2,
      banditEntityId: "gun-successor", sortiePlayerRoundsFired: 0, sortiePlayerHits: 0,
      aiGunLeadFinisherActive: true, gunSolutionRaw: true,
      gunSolution: true, aiFireCommand: true,
    }),
    commonSample({
      missionId, wallS: 86, tick: 10_320, zM: 100,
      weaponsCold: false, aim9Remaining: 0,
      opponentTerminal: "FLYING", killCount: 2,
      banditEntityId: "gun-successor", roundsFired: 24, hits: 1,
      sortiePlayerRoundsFired: 24, sortiePlayerHits: 1,
      aiGunLeadFinisherActive: true, gunSolutionRaw: true,
      gunSolution: true, aiFireCommand: true,
    }),
  ];
  assert.deepEqual(firstRunGunHandoffEvidence(samples), {
    pairComplete: true,
    successorSeen: true,
    gunRoundsFired: true,
    gunHitSeen: true,
  });
  assert.deepEqual(assessFixedWingAiFlight(samples, { mission: "first-run" }).failures, []);

  const shortRoute = samples.map((sample, index) => ({
    ...sample,
    zM: index === 0 ? -5_000 : -1_000,
  }));
  assert.match(
    assessFixedWingAiFlight(shortRoute, { mission: "first-run" }).failures.join("\n"),
    /valley flight covered only 4000 m/,
  );
});

test("first-run short crashes cannot evade valley-quality or navigation-mode gates", () => {
  const missionId = "mission.modern.visual-merge.first-run-valley.v1";
  const crashed = Array.from({ length: 30 }, (_, index) => commonSample({
    missionId,
    wallS: index / 2,
    tick: index * 60,
    xM: index * 12,
    zM: -19_200 + index * 180,
    weaponsCold: true,
    aim9Remaining: 2,
    terrainPresent: true,
    belowGround: false,
    radarAltitudeFt: 280,
    calibratedSpeedKts: 412,
    valleyProfileValid: true,
    valleyFloorMarginM: index < 4 ? -105 : 40,
    assistedFlight: index === 5,
    playerReturnToBaseActive: index === 8,
    returnToBaseReason: index === 8 ? "RELIEF" : "NONE",
    returnToBaseSteer: false,
    requestedThrottle: 0.01,
    appliedThrottle: 0.01,
  }));
  const result = assessFixedWingAiFlight(crashed, {
    mission: "first-run",
    stagedRequestedThrottle: 0.16,
    stagedAppliedThrottle: 0.16,
  });
  assert.match(result.failures.join("\n"), /AI control cadence was 2\.0 Hz/);
  assert.match(result.failures.join("\n"), /AI control interval p95 was 500 ms/);
  assert.match(result.failures.join("\n"), /valley floor margin p05 was -105 m/);
  assert.match(result.failures.join("\n"), /assisted flight engaged/);
  assert.match(result.failures.join("\n"), /return-to-base guidance intruded/);
  assert.match(result.failures.join("\n"), /cold throttle diverged 0\.15/);
});

test("first-run assessment proves a demanded valley pull reached requested, applied and actual G", () => {
  const missionId = "mission.modern.visual-merge.first-run-valley.v1";
  const weak = Array.from({ length: 30 }, (_, index) => commonSample({
    missionId,
    wallS: index / 20,
    tick: index * 6,
    xM: index * 8,
    zM: -19_200 + index * 12,
    weaponsCold: true,
    aim9Remaining: 2,
    terrainPresent: true,
    belowGround: false,
    radarAltitudeFt: 500,
    calibratedSpeedKts: 420,
    valleyProfileValid: true,
    valleyFloorMarginM: 160,
    gMaxPerform: 9,
    aiDesiredBankDeg: 45,
    aiDesiredLoadFactorG: 1.5,
    requestedG: 1,
    appliedGCommand: 1,
    actualG: 1,
  }));
  const rejected = assessFixedWingAiFlight(weak, { mission: "first-run" });
  assert.match(rejected.failures.join("\n"), /valley pull reached only 1\.00 G requested/);

  const pulling = weak.map((sample) => ({
    ...sample,
    requestedG: 1.5,
    appliedGCommand: 1.48,
    actualG: 1.38,
  }));
  const measured = assessFixedWingAiFlight(pulling, { mission: "first-run" });
  assert.doesNotMatch(measured.failures.join("\n"), /valley pull/);
  assert.equal(measured.metrics.firstRunValleyClearance.maximumActualPullG, 1.38);
});

test("combat assessment rejects a bank-only pilot that never delivers its explicit G demand", () => {
  const weak = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    rangeM: index < 20 ? 4_000 : 1_800,
    bankDeg: 60,
    gMaxPerform: 9,
    aiDesiredLoadFactorG: 6.5,
    requestedG: 1.4,
    appliedGCommand: 1.35,
    actualG: 1.25,
    roundsFired: index >= 60 ? 20 : 0,
    hits: index >= 70 ? 1 : 0,
    opponentHealth: index >= 70 ? 0 : 1,
    opponentTerminal: index >= 70 ? "DESTROYED" : "FLYING",
    killCount: index >= 70 ? 1 : 0,
  }));
  const rejected = assessFixedWingAiFlight(weak, { mission: "f22" });
  assert.match(rejected.failures.join("\n"), /combat pull reached only 1\.40 G requested/);

  const pulling = weak.map((sample) => ({
    ...sample,
    requestedG: 6.4,
    appliedGCommand: 6.2,
    actualG: 5.8,
  }));
  const measured = assessFixedWingAiFlight(pulling, { mission: "f22" });
  assert.doesNotMatch(measured.failures.join("\n"), /combat pull/);
  assert.equal(measured.metrics.maximumCombatActualPullG, 5.8);

  const skidding = pulling.map((sample, index) => ({
    ...sample,
    gunneryYawAssist: index === 50 ? 0.4 : 0,
  }));
  assert.match(
    assessFixedWingAiFlight(skidding, { mission: "f22" }).failures.join("\n"),
    /gun director added 0\.400 rudder/,
  );

  const hiddenRoll = pulling.map((sample, index) => ({
    ...sample,
    gunneryRollAssist: index === 50 ? 0.4824 : 0,
  }));
  const hiddenRollAssessment = assessFixedWingAiFlight(hiddenRoll, { mission: "f22" });
  assert.match(
    hiddenRollAssessment.failures.join("\n"),
    /gun director added 0\.482 roll/,
  );
  assert.equal(hiddenRollAssessment.metrics.maximumGunneryRollAssist, 0.4824);

  const hiddenAppliedRudder = pulling.map((sample, index) => ({
    ...sample,
    appliedRudder: index === 50 ? 0.04 : 0,
  }));
  const appliedRudderAssessment = assessFixedWingAiFlight(hiddenAppliedRudder, { mission: "f22" });
  assert.match(
    appliedRudderAssessment.failures.join("\n"),
    /F-22 control path applied 0\.040 rudder/,
  );
  assert.equal(appliedRudderAssessment.metrics.maximumAppliedRudder, 0.04);

  const hiddenAriRudder = pulling.map((sample, index) => ({
    ...sample,
    f22AriRudder: index === 50 ? 0.787 : 0,
    effectiveRudderCommand: index === 50 ? 0.787 : 0,
  }));
  const ariAssessment = assessFixedWingAiFlight(hiddenAriRudder, { mission: "f22" });
  assert.match(
    ariAssessment.failures.join("\n"),
    /F-22 ARI generated 0\.787 effective rudder/,
    "zero pilot rudder cannot hide a large model-generated rudder input",
  );
  assert.equal(ariAssessment.metrics.maximumF22AriRudder, 0.787);

  const excessiveSideslip = pulling.map((sample, index) => ({
    ...sample,
    betaDeg: index === 50 ? -16.8 : 0,
  }));
  assert.match(
    assessFixedWingAiFlight(excessiveSideslip, { mission: "f22" }).failures.join("\n"),
    /F-22 sideslip reached 16\.8 deg/,
  );

  const rollingSkid = pulling.map((sample, index) => ({
    ...sample,
    betaDeg: index === 50 ? -9.1 : 0,
    aoaDeg: index === 50 ? 10.2 : 5,
    rollRateDps: index === 50 ? -88.7 : 0,
  }));
  const rollingSkidAssessment = assessFixedWingAiFlight(
    rollingSkid,
    { mission: "f22" },
  );
  assert.match(
    rollingSkidAssessment.failures.join("\n"),
    /F-22 rolling sideslip reached 9\.1 deg/,
    "a visually ugly low-alpha roll skid must not hide below the post-stall beta gate",
  );
  assert.equal(rollingSkidAssessment.metrics.maximumRollingSideslipDeg, 9.1);

  const loadedRoll = pulling.map((sample, index) => ({
    ...sample,
    aiRollCommand: index === 50 ? -0.455 : 0,
    aiAppliedRollCommand: index === 50 ? -0.455 : 0,
    actualG: index === 50 ? 6.104 : sample.actualG,
    aoaDeg: index === 50 ? 19.59 : 5,
  }));
  const loadedRollAssessment = assessFixedWingAiFlight(loadedRoll, { mission: "f22" });
  assert.match(
    loadedRollAssessment.failures.join("\n"),
    /F-22 applied 0\.455 accelerating roll while loaded \(6\.10 G \/ 19\.6 deg alpha\)/,
    "the harness must fail the control sequencing that creates ARI or a loaded sideslip",
  );
  assert.equal(loadedRollAssessment.metrics.materialLoadedRollSamples, 1);

  const firstRunGunLoadedRoll = loadedRoll.map((sample) => ({
    ...sample,
    missionId: "mission.modern.visual-merge.first-run-valley.v1",
    weaponsCold: false,
    aim9Remaining: 0,
  }));
  const firstRunGunLoadedAssessment = assessFixedWingAiFlight(
    firstRunGunLoadedRoll,
    { mission: "first-run" },
  );
  assert.match(
    firstRunGunLoadedAssessment.failures.join("\n"),
    /F-22 applied 0\.455 accelerating roll while loaded/,
    "the post-heater F-22 gun phase must retain the same loaded-roll acceptance gate",
  );
  assert.equal(firstRunGunLoadedAssessment.metrics.materialLoadedRollSamples, 1);

  const firstRunValleyRoll = firstRunGunLoadedRoll.map((sample) => ({
    ...sample,
    weaponsCold: true,
    aim9Remaining: 2,
  }));
  const firstRunValleyAssessment = assessFixedWingAiFlight(
    firstRunValleyRoll,
    { mission: "first-run" },
  );
  assert.doesNotMatch(
    firstRunValleyAssessment.failures.join("\n"),
    /accelerating roll while loaded/,
    "the combat-specific watchdog must not reject authored valley pull-and-bank flight",
  );
  assert.equal(firstRunValleyAssessment.metrics.materialLoadedRollSamples, 0);

  const loadedRollBrake = loadedRoll.map((sample, index) => ({
    ...sample,
    rollRateDps: index === 50 ? 60 : sample.rollRateDps,
  }));
  const loadedRollBrakeAssessment = assessFixedWingAiFlight(
    loadedRollBrake,
    { mission: "f22" },
  );
  assert.doesNotMatch(
    loadedRollBrakeAssessment.failures.join("\n"),
    /accelerating roll while loaded/,
    "opposite-sign aileron needed to arrest an existing loaded body rate is not a new plane change",
  );
  assert.equal(loadedRollBrakeAssessment.metrics.materialLoadedRollSamples, 0);

  for (const channel of ["actualG", "aoaDeg"]) {
    for (const invalidValue of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const missingLoadTelemetry = pulling.map((sample, index) => ({
        ...sample,
        aiRollCommand: index === 50 ? 0.4 : 0,
        aiAppliedRollCommand: index === 50 ? 0.4 : 0,
        actualG: channel === "actualG" && index === 50 ? invalidValue : sample.actualG,
        aoaDeg: channel === "aoaDeg" && index === 50 ? invalidValue : 5,
      }));
      const missingLoadAssessment = assessFixedWingAiFlight(
        missingLoadTelemetry,
        { mission: "f22" },
      );
      assert.match(
        missingLoadAssessment.failures.join("\n"),
        /F-22 made 1 material roll commands without current G\/alpha telemetry/,
      );
      assert.equal(missingLoadAssessment.metrics.materialRollMissingLoadTelemetrySamples, 1);
    }
  }

  for (const missingRollRate of [undefined, null, Number.NaN]) {
    const loadedWithoutRate = loadedRoll.map((sample, index) => ({
      ...sample,
      rollRateDps: index === 50 ? missingRollRate : sample.rollRateDps,
    }));
    const loadedWithoutRateAssessment = assessFixedWingAiFlight(
      loadedWithoutRate,
      { mission: "f22" },
    );
    assert.equal(loadedWithoutRateAssessment.metrics.materialLoadedRollSamples, 1);
    assert.match(
      loadedWithoutRateAssessment.failures.join("\n"),
      /accelerating roll while loaded/,
    );
  }

  const combinedNullTelemetry = loadedRoll.map((sample, index) => ({
    ...sample,
    rollRateDps: index === 50 ? null : sample.rollRateDps,
    actualG: index === 50 ? null : sample.actualG,
    aoaDeg: index === 50 ? null : sample.aoaDeg,
  }));
  const combinedNullAssessment = assessFixedWingAiFlight(
    combinedNullTelemetry,
    { mission: "f22" },
  );
  assert.equal(combinedNullAssessment.metrics.materialRollMissingLoadTelemetrySamples, 1);
  assert.ok(combinedNullAssessment.metrics.rollRateTelemetryCoverage < 1);
  assert.ok(combinedNullAssessment.metrics.loadFactorTelemetryCoverage < 1);
  assert.ok(combinedNullAssessment.metrics.aoaTelemetryCoverage < 1);
  assert.match(
    combinedNullAssessment.failures.join("\n"),
    /without current G\/alpha telemetry/,
  );

  const shortLoadedRoll = pulling.slice(0, 20).map((sample, index) => ({
    ...sample,
    aoaDeg: index === 10 ? 19 : 5,
    actualG: index === 10 ? 6 : sample.actualG,
    rollRateDps: index === 10 ? -50 : sample.rollRateDps,
    aiRollCommand: index === 10 ? -0.5 : 0,
    aiAppliedRollCommand: index === 10 ? -0.5 : 0,
  }));
  const shortLoadedRollAssessment = assessFixedWingAiFlight(
    shortLoadedRoll,
    { mission: "f22" },
  );
  assert.equal(shortLoadedRollAssessment.metrics.materialLoadedRollSamples, 1);
  assert.match(
    shortLoadedRollAssessment.failures.join("\n"),
    /F-22 applied 0\.500 accelerating roll while loaded/,
    "a fast crash cannot evade a self-authenticating loaded-roll safety event",
  );

  const hiddenGcasInhibit = pulling.map((sample, index) => ({
    ...sample,
    aiLimitOverride: index >= 40 && index <= 65,
    autoGcasInhibitReason: index >= 40 && index <= 65 ? "PILOT_OVERRIDE" : "NONE",
  }));
  const gcasInhibitAssessment = assessFixedWingAiFlight(
    hiddenGcasInhibit,
    { mission: "f22" },
  );
  assert.match(
    gcasInhibitAssessment.failures.join("\n"),
    /used the limiter\/Auto-GCAS paddle .*26 AI samples.*26 PILOT_OVERRIDE inhibits/,
  );
  assert.equal(gcasInhibitAssessment.metrics.autoGcasPilotOverrideInhibitSamples, 26);

  const unsampledPaddleWrite = pulling.map((sample, index) => ({
    ...sample,
    browserPilot: index === pulling.length - 1 ? {
      controlRateHz: 20,
      p95ControlIntervalMs: 50,
      limitOverrideWrites: 1,
      lastError: null,
    } : undefined,
  }));
  assert.match(
    assessFixedWingAiFlight(unsampledPaddleWrite, { mission: "f22" })
      .failures.join("\n"),
    /used the limiter\/Auto-GCAS paddle \(1 writes, 0 AI samples/,
    "a limiter pulse between authority samples must remain visible in browser diagnostics",
  );

  const unsampledGcasInhibit = pulling.map((sample, index) => ({
    ...sample,
    aiLimitOverride: false,
    autoGcasInhibitReason: index === 50 ? "PILOT_OVERRIDE" : "NONE",
  }));
  assert.match(
    assessFixedWingAiFlight(unsampledGcasInhibit, { mission: "f22" })
      .failures.join("\n"),
    /Auto-GCAS reported PILOT_OVERRIDE for 1 samples/,
  );

  const preexistingOverrideCounter = pulling.map((sample) => ({
    ...sample,
    autoGcasOverrideCount: 1,
  }));
  assert.match(
    assessFixedWingAiFlight(preexistingOverrideCounter, { mission: "f22" })
      .failures.join("\n"),
    /Auto-GCAS override counter reached 1/,
    "a counter already nonzero at the first sampled frame must not become the baseline",
  );

  const recoveryInterference = pulling.map((sample, index) => ({
    ...sample,
    aiVerticalRecoveryPhase: index >= 40 && index <= 60 ? "slice" : "idle",
    gunneryPitchAssistDeltaG: index === 50 ? 0.08 : 0,
  }));
  const recoveryAssessment = assessFixedWingAiFlight(recoveryInterference, { mission: "f22" });
  assert.match(recoveryAssessment.failures.join("\n"), /gun assist added 0\.08 G during recovery/);
  assert.equal(recoveryAssessment.metrics.maximumRecoveryPitchAssistDeltaG, 0.08);

  const alignedRecoveryTransition = pulling.map((sample, index) => ({
    ...sample,
    aiTerrainRecoveryPhase: index === 50 || index === 51 ? "unload" : "idle",
    aiAppliedPitchCommand: index === 50 || index === 51 ? -0.12 : sample.aiAppliedPitchCommand,
    gunneryPitchAssistDeltaG: index === 50 ? 1.687 : 0,
    gunneryAssistStatus: index === 50 ? "ACTIVE_SHOULDER"
      : index === 51 ? "PILOT_UNLOAD" : sample.gunneryAssistStatus,
  }));
  const alignedRecoveryAssessment = assessFixedWingAiFlight(
    alignedRecoveryTransition,
    { mission: "f22" },
  );
  assert.doesNotMatch(
    alignedRecoveryAssessment.failures.join("\n"),
    /gun assist added .* during recovery/,
    "one publication-skewed edge is safe only when the next recovery sample proves assist yield",
  );
  assert.equal(alignedRecoveryAssessment.metrics.maximumObservedRecoveryPitchAssistDeltaG, 1.687);
  assert.equal(alignedRecoveryAssessment.metrics.maximumRecoveryPitchAssistDeltaG, 0);
  assert.equal(alignedRecoveryAssessment.metrics.recoveryPitchAssistTransitionSkewSamples, 1);

  const rollingPull = pulling.map((sample, index) => ({
    ...sample,
    aiTerrainRecoveryPhase: index === 50 ? "pull" : "idle",
    aiDesiredLoadFactorG: index === 50 ? 8.36 : sample.aiDesiredLoadFactorG,
    rollRateDps: index === 50 ? -101 : sample.rollRateDps,
  }));
  assert.match(
    assessFixedWingAiFlight(rollingPull, { mission: "f22" }).failures.join("\n"),
    /terrain recovery pulled 8\.36 G at 101 deg\/s roll/,
  );

  const rollingVerticalPull = pulling.map((sample, index) => ({
    ...sample,
    aiVerticalRecoveryPhase: index === 50 ? "slice" : "idle",
    aiDesiredLoadFactorG: index === 50 ? 6.9 : sample.aiDesiredLoadFactorG,
    rollRateDps: index === 50 ? -59 : sample.rollRateDps,
  }));
  const verticalPullAssessment = assessFixedWingAiFlight(
    rollingVerticalPull,
    { mission: "f22" },
  );
  assert.match(
    verticalPullAssessment.failures.join("\n"),
    /vertical recovery pulled 6\.90 G at 59 deg\/s roll/,
  );
  assert.equal(verticalPullAssessment.metrics.unsafeVerticalRecoveryPullSamples, 1);

  const zeroToleranceBoundary = pulling.map((sample, index) => ({
    ...sample,
    gunneryRollAssist: index === 50 ? 0.001 : 0,
    gunneryYawAssist: index === 50 ? 0.001 : 0,
  }));
  assert.doesNotMatch(
    assessFixedWingAiFlight(
      zeroToleranceBoundary,
      { mission: "f22" },
    ).failures.join("\n"),
    /gun director added/,
  );
  const visibleSkid = pulling.map((sample, index) => ({
    ...sample,
    gunneryRollAssist: index === 50 ? 0.002 : 0,
    gunneryYawAssist: index === 50 ? 0.002 : 0,
  }));
  assert.match(
    assessFixedWingAiFlight(visibleSkid, { mission: "f22" }).failures.join("\n"),
    /gun director added 0\.002 rudder/,
  );
  const firstRunMissionId = "mission.modern.visual-merge.first-run-valley.v1";
  assert.doesNotMatch(
    assessFixedWingAiFlight(
      zeroToleranceBoundary.map((sample) => ({ ...sample, missionId: firstRunMissionId })),
      { mission: "first-run" },
    ).failures.join("\n"),
    /gun director added/,
  );
  assert.match(
    assessFixedWingAiFlight(
      visibleSkid.map((sample) => ({ ...sample, missionId: firstRunMissionId })),
      { mission: "first-run" },
    ).failures.join("\n"),
    /gun director added 0\.002 rudder/,
  );
  assert.match(
    assessFixedWingAiFlight(
      visibleSkid.map((sample) => ({ ...sample, missionId: firstRunMissionId })),
      { mission: "first-run" },
    ).failures.join("\n"),
    /gun director added 0\.002 roll/,
  );
});

test("missed-close-pass watchdog reports repeated point-blank fly-throughs", () => {
  const pass = ({ wallS, minimumRangeM, minimumLeadErrorDeg, converted = false }) => [
    {
      wallS,
      simS: wallS,
      rangeM: 700,
      closureKts: 200,
      roundsFired: 0,
      hits: 0,
      gunSolution: false,
      aiFireCommand: false,
      aiGunLeadBasisValid: true,
      aiGunLeadFinisherActive: true,
      aiLeadOffBoresightDeg: minimumLeadErrorDeg + 4,
      opponentTerminal: "FLYING",
    },
    {
      wallS: wallS + 0.1,
      simS: wallS + 0.1,
      rangeM: minimumRangeM,
      closureKts: 20,
      roundsFired: 0,
      hits: 0,
      gunSolution: converted,
      aiFireCommand: false,
      aiGunLeadBasisValid: true,
      aiGunLeadFinisherActive: true,
      aiLeadOffBoresightDeg: minimumLeadErrorDeg,
      bankDeg: 72,
      rollRateDps: 3,
      actualG: 7,
      opponentTerminal: "FLYING",
    },
    {
      wallS: wallS + 0.2,
      simS: wallS + 0.2,
      rangeM: minimumRangeM + 80,
      closureKts: -80,
      roundsFired: 0,
      hits: 0,
      gunSolution: false,
      aiFireCommand: false,
      aiGunLeadBasisValid: true,
      aiGunLeadFinisherActive: true,
      aiLeadOffBoresightDeg: minimumLeadErrorDeg + 2,
      opponentTerminal: "FLYING",
    },
  ];
  const samples = [
    ...pass({ wallS: 0, minimumRangeM: 180, minimumLeadErrorDeg: 8 }),
    ...pass({ wallS: 4, minimumRangeM: 90, minimumLeadErrorDeg: 1.5 }),
    ...pass({ wallS: 8, minimumRangeM: 240, minimumLeadErrorDeg: 12 }),
    ...pass({ wallS: 12, minimumRangeM: 150, minimumLeadErrorDeg: 0.4, converted: true }),
  ];
  const stats = missedClosePassEpisodeStats(samples);
  assert.equal(stats.completedPasses, 4);
  assert.equal(stats.unconvertedClosePasses, 3);
  assert.equal(stats.closestUnconvertedRangeM, 90);
  assert.equal(stats.bestUnconvertedLeadErrorDeg, 1.5);
  assert.equal(stats.episodes[1].cpaActualG, 7);
  assert.deepEqual(stats.episodes[1].owners, ["gun-finisher"]);
  assert.equal(stats.episodes[3].converted, true,
    "a qualified solution distinguishes a conversion from another empty fly-through");

  const assessment = assessFixedWingAiFlight(samples, { mission: "f22" });
  assert.equal(assessment.metrics.missedClosePasses.unconvertedClosePasses, 3);
  assert.ok(assessment.failures.some((failure) =>
    failure.includes("3 unconverted close passes under 500 m")));
});

test("runaway watchdog ignores the reciprocal run-in but rejects a post-join stern chase", () => {
  const opening = [
    commonSample({ wallS: 0, rangeM: 9_000, closureKts: -40 }),
    commonSample({ wallS: 8, tick: 960, rangeM: 5_000, closureKts: 300 }),
  ];
  assert.equal(longestRunawayChaseSeconds(opening), 0);

  const chased = [
    ...opening,
    commonSample({ wallS: 12, tick: 1_440, rangeM: 3_000, closureKts: 80 }),
    commonSample({ wallS: 20, tick: 2_400, rangeM: 4_200, closureKts: -80 }),
    commonSample({ wallS: 28, tick: 3_360, rangeM: 5_700, closureKts: -110 }),
  ];
  assert.equal(longestRunawayChaseSeconds(chased), 16);
  assert.match(
    assessFixedWingAiFlight(chased, { mission: "f22" }).failures.join("\n"),
    /opening stern chase/,
  );
});

test("bandit vertical watchdog rejects sustained near-vertical looping", () => {
  const level = Array.from({ length: 121 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    banditEntityId: "bandit-level",
    opponentXM: 0,
    opponentYM: 3_000,
    opponentZM: index * 10,
  }));
  const levelStats = targetVerticalExcursionStats(level);
  assert.equal(levelStats.maximumAbsGammaDeg, 0);
  assert.equal(levelStats.cumulativeSteepS, 0);
  assert.ok(levelStats.coverage > 0.9);

  const gammaRad = 70 * Math.PI / 180;
  const looping = level.map((sample, index) => ({
    ...sample,
    banditEntityId: "bandit-looping",
    opponentYM: 3_000 + Math.sin(gammaRad) * index * 10,
    opponentZM: Math.cos(gammaRad) * index * 10,
  }));
  const loopingStats = targetVerticalExcursionStats(looping);
  assert.ok(loopingStats.maximumAbsGammaDeg > 69.9);
  assert.ok(loopingStats.cumulativeSteepS > 5);
  assert.ok(loopingStats.longestSteepS > 5);
  assert.match(
    assessFixedWingAiFlight(looping, { mission: "f22" }).failures.join("\n"),
    /bandit vertical loop reached 70\.0 deg/,
  );
});

test("ownship vertical watchdog rejects a gross sustained dive", () => {
  const diving = Array.from({ length: 121 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    gammaDeg: -85,
    opponentXM: 0,
    opponentYM: 3_000,
    opponentZM: index * 10,
  }));
  const assessment = assessFixedWingAiFlight(diving, { mission: "f22" });
  assert.match(assessment.failures.join("\n"), /AI ownship vertical dive reached 85\.0 deg/);
  assert.equal(assessment.metrics.ownshipVerticalExcursion.maximumAbsGammaDeg, 85);
  assert.ok(assessment.metrics.ownshipVerticalExcursion.longestSteepS > 5);
});

test("unloaded-roll watchdog permits a tactical half-roll but rejects a low-G revolution", () => {
  const halfRoll = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 10,
    tick: index * 12,
    actualG: 1,
    rollRateDps: index <= 80 ? 20 : 0,
  }));
  const halfRollStats = unloadedRollEpisodeStats(halfRoll);
  assert.equal(halfRollStats.qualifyingEpisodes, 0);
  assert.ok(halfRollStats.maximumIntegratedRollDeg > 159);
  assert.ok(halfRollStats.maximumIntegratedRollDeg < 161);

  const fullRoll = halfRoll.map((sample, index) => ({
    ...sample,
    rollRateDps: index <= 80 ? 50 : 0,
  }));
  const fullRollStats = unloadedRollEpisodeStats(fullRoll);
  assert.equal(fullRollStats.qualifyingEpisodes, 1);
  assert.ok(fullRollStats.maximumIntegratedRollDeg > 399);
  assert.ok(fullRollStats.maximumIntegratedRollDeg < 401);
  assert.match(
    assessFixedWingAiFlight(fullRoll, { mission: "f22" }).failures.join("\n"),
    /F-22 rolled 400 deg continuously while unloaded over 10\.0 s/,
  );

  const loaded = fullRoll.map((sample) => ({ ...sample, actualG: 2 }));
  assert.equal(unloadedRollEpisodeStats(loaded).qualifyingEpisodes, 0,
    "the 2-G boundary belongs to the existing loaded-roll watchdog");

  // Tape 476 did not fly one 420-degree revolution. It rolled about 257 degrees left through a
  // pursuit/downhill cascade, then terrain recovery visibly reversed and rolled 163 degrees
  // right. A continuous-direction watchdog must preserve both manoeuvres without summing them.
  const tape476Reversal = Array.from({ length: 142 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    actualG: 1,
    rollRateDps: index <= 86 ? -60 : 60,
  }));
  const reversalStats = unloadedRollEpisodeStats(tape476Reversal);
  assert.equal(reversalStats.qualifyingEpisodes, 0);
  assert.equal(reversalStats.episodes, 2);
  assert.ok(reversalStats.maximumIntegratedRollDeg > 257
    && reversalStats.maximumIntegratedRollDeg < 259);
  assert.doesNotMatch(
    assessFixedWingAiFlight(tape476Reversal, { mission: "f22" }).failures.join("\n"),
    /rolled .* continuously while unloaded/,
  );

  const sameDirection = tape476Reversal.map((sample) => ({
    ...sample,
    rollRateDps: -60,
  }));
  assert.equal(unloadedRollEpisodeStats(sameDirection).qualifyingEpisodes, 1,
    "a genuine same-direction revolution must still fail the 270-degree watchdog");
  assert.match(
    assessFixedWingAiFlight(sameDirection, { mission: "f22" }).failures.join("\n"),
    /rolled 423 deg continuously while unloaded/,
  );
});

test("settled loaded-overbank watchdog catches the top-rudder-looking pull", () => {
  const loadedWallTurnStats = (samples) => settledLoadedOverbankStats(samples, {
    minimumAbsBankDeg: 75,
    remainMinimumAbsBankDeg: 74,
    maximumQualifyingAbsBankDeg: 84,
    minimumBankInclusive: true,
    minimumLoadInclusive: true,
    maximumAbsGammaDeg: 45,
    excludeSafetyRecovery: true,
    maximumContinuityGapS: 0.25,
  });
  const sustainableTurn = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    bankDeg: 82,
    actualG: 7,
    rollRateDps: 0,
  }));
  assert.equal(settledLoadedOverbankStats(sustainableTurn).evidenceSamples, 0,
    "the authored 82-degree fighting turn must remain inside visual acceptance");
  const wallTurnStats = loadedWallTurnStats(sustainableTurn);
  assert.ok(wallTurnStats.longestS > 4.9 && wallTurnStats.longestS < 5.1);
  assert.match(
    assessFixedWingAiFlight(sustainableTurn, { mission: "f22" }).failures.join("\n"),
    /F-22 held a settled 82 deg loaded wall turn for 5\.0 s/,
    "a prolonged sub-84-degree wall turn must no longer evade visual acceptance",
  );
  const ordinaryTurn = sustainableTurn.map((sample) => ({ ...sample, bankDeg: 72 }));
  assert.doesNotMatch(
    assessFixedWingAiFlight(ordinaryTurn, { mission: "f22" }).failures.join("\n"),
    /loaded wall turn/,
    "the ordinary pursuit plane must remain outside the visual wall-turn lane",
  );
  const exactWallFailure = Array.from({ length: 123 }, (_, index) => commonSample({
    wallS: index / 40,
    tick: index * 3,
    bankDeg: index === 0 ? 75 : 74,
    actualG: 2.5,
    rollRateDps: 20,
    gammaDeg: 45,
  }));
  assert.ok(loadedWallTurnStats(exactWallFailure).longestS > 3.04,
    "75-degree entry may remain through a one-degree hysteresis lane");
  assert.match(
    assessFixedWingAiFlight(exactWallFailure, { mission: "f22" }).failures.join("\n"),
    /loaded wall turn for 3\.0 s/,
  );
  const shortWall = exactWallFailure.slice(0, 119);
  assert.doesNotMatch(
    assessFixedWingAiFlight(shortWall, { mission: "f22" }).failures.join("\n"),
    /loaded wall turn/,
    "a 2.95-second tactical use must remain below the visual dwell budget",
  );
  for (const [label, overrides] of [
    ["below entry bank", { bankDeg: 74.9 }],
    ["below loaded threshold", { actualG: 2.49 }],
    ["still rolling", { rollRateDps: 20.1 }],
    ["vertical manoeuvre", { gammaDeg: 45.1 }],
    ["Auto-GCAS", { autoGcasActive: true }],
    ["terrain escape", { aiTerrainEscapeRecovery: true }],
  ]) {
    const excluded = exactWallFailure.map((sample) => ({ ...sample, ...overrides }));
    assert.equal(loadedWallTurnStats(excluded).evidenceSamples, 0,
      `${label} must not count as a sustained loaded wall turn`);
  }
  const limiterLeak = sustainableTurn.map((sample) => ({ ...sample, bankDeg: 85 }));
  assert.equal(settledLoadedOverbankStats(limiterLeak).evidenceSamples, 101,
    "a settled loaded turn beyond the 84-degree physical margin must be visible to the harness");
  const visibleKnifeEdge = sustainableTurn.map((sample, index) => ({
    ...sample,
    bankDeg: index <= 16 ? 85 : 82,
  }));
  assert.ok(settledLoadedOverbankStats(visibleKnifeEdge).longestS > 0.79);
  assert.match(
    assessFixedWingAiFlight(visibleKnifeEdge, { mission: "f22" }).failures.join("\n"),
    /F-22 held a settled 85 deg loaded overbank for 0\.8 s/,
    "acceptance must reject the same 0.75-second knife-edge episode captured by visual QA",
  );

  const verticalKnifeEdge = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    bankDeg: 112,
    actualG: 6,
    rollRateDps: 0,
    aiVerticalRecoveryPhase: "slice",
  }));
  const stats = settledLoadedOverbankStats(verticalKnifeEdge);
  assert.equal(stats.evidenceSamples, 101);
  assert.ok(stats.longestS > 4.9 && stats.longestS < 5.1);
  assert.ok(stats.ownerSeconds.verticalRecovery > 4.9);
  assert.equal(stats.ownerSeconds.other, 0);
  assert.match(
    assessFixedWingAiFlight(verticalKnifeEdge, { mission: "f22" }).failures.join("\n"),
    /F-22 held a settled 112 deg loaded overbank for 5\.0 s/,
  );

  const tacticalBreak = verticalKnifeEdge.map((sample, index) => ({
    ...sample,
    bankDeg: index <= 60 ? 112 : 0,
    aiVerticalRecoveryPhase: "idle",
    aiCombatDefensiveBreakActive: index <= 60,
    aiCombatDefensiveBreakPlaneMagnitudeDeg: index <= 60 ? 95 : 78,
  }));
  const breakStats = settledLoadedOverbankStats(tacticalBreak);
  assert.ok(breakStats.longestS > 2.9 && breakStats.longestS < 3.1);
  assert.ok(breakStats.ownerSeconds.defensive > 2.9);
  assert.match(
    assessFixedWingAiFlight(tacticalBreak, { mission: "f22" }).failures.join("\n"),
    /loaded overbank/,
    "the former three-second defensive knife edge must now fail visual acceptance",
  );

  const acceptedBoundary = verticalKnifeEdge.map((sample, index) => ({
    ...sample,
    bankDeg: index <= 15 ? 112 : 0,
  }));
  assert.equal(settledLoadedOverbankStats(acceptedBoundary).longestS, 0.75);
  assert.doesNotMatch(
    assessFixedWingAiFlight(acceptedBoundary, { mission: "f22" }).failures.join("\n"),
    /loaded overbank/,
    "the 0.75-second visual-capture boundary itself remains accepted",
  );

  const mixedEpisodes = [
    ...Array.from({ length: 41 }, (_, index) => commonSample({
      wallS: index / 20,
      tick: index * 6,
      bankDeg: 135,
      actualG: 6,
      rollRateDps: 0,
    })),
    commonSample({ wallS: 2.05, tick: 246, bankDeg: 0, actualG: 6, rollRateDps: 0 }),
    ...Array.from({ length: 101 }, (_, index) => commonSample({
      wallS: 2.1 + index / 20,
      tick: 252 + index * 6,
      bankDeg: 112,
      actualG: 6,
      rollRateDps: 0,
    })),
  ];
  const mixedStats = settledLoadedOverbankStats(mixedEpisodes);
  assert.equal(mixedStats.maximumAbsBankDeg, 135);
  assert.equal(mixedStats.longestEpisode.maximumAbsBankDeg, 112);
  assert.match(
    assessFixedWingAiFlight(mixedEpisodes, { mission: "f22" }).failures.join("\n"),
    /settled 112 deg loaded overbank for 5\.0 s/,
    "the grade must describe the longest episode instead of another episode's peak bank",
  );

  const observerGap = verticalKnifeEdge.map((sample, index) => ({
    ...sample,
    wallS: index < 50 ? index / 20 : 10 + index / 20,
  }));
  assert.ok(settledLoadedOverbankStats(observerGap).longestS < 2.6,
    "a CDP evidence gap must split rather than extend the physical episode");
});

test("roll chatter watchdog rejects sustained rocking but permits a committed turn reversal", () => {
  const smooth = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 10,
    tick: index * 12,
    aiRollCommand: index < 50 ? 0.45 : -0.45,
  }));
  assert.deepEqual(rollCommandChatterStats(smooth), {
    reversals: 1,
    maximumReversalRateHz: 0.1,
    maximumBurstReversalRateHz: 0.5,
    threshold: 0.05,
    windowS: 10,
    burstWindowS: 2,
  });

  const scissors = smooth.map((sample, index) => ({
    ...sample,
    aiRollCommand: Math.floor(index / 20) % 2 === 0 ? 0.45 : -0.45,
  }));
  const scissorsAssessment = assessFixedWingAiFlight(scissors, { mission: "f22" });
  assert.doesNotMatch(scissorsAssessment.failures.join("\n"), /roll control chattered/);

  const rocking = smooth.map((sample, index) => ({
    ...sample,
    aiRollCommand: index % 2 === 0 ? 0.3 : -0.3,
  }));
  assert.ok(rollCommandChatterStats(rocking).maximumReversalRateHz > 0.9);
  assert.match(
    assessFixedWingAiFlight(rocking, { mission: "f22" }).failures.join("\n"),
    /roll control chattered/,
  );

  const shortBurst = smooth.map((sample, index) => ({
    ...sample,
    aiRollCommand: index >= 30 && index <= 36
      ? (index % 2 === 0 ? 0.3 : -0.3)
      : 0.3,
  }));
  assert.ok(rollCommandChatterStats(shortBurst).maximumReversalRateHz < 0.9);
  assert.match(
    assessFixedWingAiFlight(shortBurst, { mission: "f22" }).failures.join("\n"),
    /roll control chattered/,
  );

  const boundaryBurst = Array.from({ length: 6 }, (_, index) => commonSample({
    wallS: index * 0.4,
    tick: index * 48,
    aiRollCommand: index % 2 === 0 ? 0.3 : -0.3,
  }));
  assert.equal(rollCommandChatterStats(boundaryBurst).maximumBurstReversalRateHz, 2.5);
  assert.match(
    assessFixedWingAiFlight(boundaryBurst, { mission: "f22" }).failures.join("\n"),
    /roll control chattered/,
    "the burst boundary must fail closed",
  );
});

test("roll chatter watchdog separates tape-shaped tactical transitions from real rocking", () => {
  const tape420Transitions = [
    { wallS: 85.084, aiRollCommand: 0.064, aiDesiredBankDeg: 112,
      aiTargetMode: "gun-lead", aiCombatDownhillSliceActive: true },
    { wallS: 85.136, aiRollCommand: -1, aiDesiredBankDeg: 0,
      aiTargetMode: "gun-lead" },
    { wallS: 85.345, aiRollCommand: -0.523, aiDesiredBankDeg: 0,
      aiTargetMode: "gun-lead" },
    { wallS: 85.397, aiRollCommand: 0.304, aiDesiredBankDeg: 78,
      aiTargetMode: "gun-lead" },
    { wallS: 85.447, aiRollCommand: 0.114, aiDesiredBankDeg: 78,
      aiTargetMode: "gun-lead" },
    { wallS: 86.384, aiRollCommand: -0.051, aiDesiredBankDeg: 73.92,
      aiTargetMode: "gun-lead" },
    { wallS: 87.892, aiRollCommand: -0.093, aiDesiredBankDeg: 42.44,
      aiTargetMode: "gun-lead" },
    { wallS: 87.944, aiRollCommand: 0.801, aiDesiredBankDeg: 86.09,
      aiTargetMode: "gun-lead", aiGunLeadFinisherActive: true },
    { wallS: 88.527, aiRollCommand: 0.053, aiDesiredBankDeg: 83.57,
      aiTargetMode: "gun-lead", aiGunLeadFinisherActive: true },
    { wallS: 88.734, aiRollCommand: -0.086, aiDesiredBankDeg: 75.08,
      aiTargetMode: "gun-lead", aiGunLeadFinisherActive: true },
    { wallS: 89.984, aiRollCommand: -0.337, aiDesiredBankDeg: -80.34,
      aiTargetMode: "gun-lead", aiGunLeadFinisherActive: true },
    { wallS: 90.041, aiRollCommand: 0.102, aiDesiredBankDeg: -61.77,
      aiTargetMode: "gun-lead" },
    { wallS: 90.142, aiRollCommand: -0.208, aiDesiredBankDeg: -68.93,
      aiTargetMode: "gun-lead" },
    { wallS: 90.717, aiRollCommand: -0.053, aiDesiredBankDeg: -78,
      aiTargetMode: "gun-lead" },
    { wallS: 91.709, aiRollCommand: 0.051, aiDesiredBankDeg: -78,
      aiTargetMode: "gun-lead" },
    { wallS: 93.224, aiRollCommand: 0.124, aiDesiredBankDeg: -78,
      aiTargetMode: "gun-lead" },
    { wallS: 93.275, aiRollCommand: -0.554, aiDesiredBankDeg: -112,
      aiTargetMode: "gun-lead", aiCombatDownhillSliceActive: true },
    { wallS: 95.05, aiRollCommand: -0.096, aiDesiredBankDeg: -112,
      aiTargetMode: "gun-lead", aiCombatDownhillSliceActive: true },
    { wallS: 95.106, aiRollCommand: 0.623, aiDesiredBankDeg: 0,
      aiTargetMode: "gun-lead", aiTerrainRecoveryPhase: "roll" },
  ].map((sample, index) => commonSample({ tick: index * 6, ...sample }));
  const transitionStats = rollCommandChatterStats(tape420Transitions);
  assert.equal(transitionStats.reversals, 5);
  assert.equal(transitionStats.maximumReversalRateHz, 0.5);
  assert.equal(transitionStats.maximumBurstReversalRateHz, 1);
  assert.doesNotMatch(
    assessFixedWingAiFlight(tape420Transitions, { mission: "f22" }).failures.join("\n"),
    /roll control chattered/,
  );

  const stableTargetRocking = Array.from({ length: 30 }, (_, index) => commonSample({
    wallS: index / 10,
    tick: index * 12,
    aiRollCommand: index % 2 === 0 ? 0.3 : -0.3,
    aiDesiredBankDeg: 78,
    aiTargetMode: "gun-lead",
    aiTerrainRecoveryPhase: "idle",
    aiVerticalRecoveryPhase: "idle",
  }));
  assert.ok(rollCommandChatterStats(stableTargetRocking).maximumReversalRateHz > 0.9,
    "stable-target left/right commands must still fail closed");

  const modeDwellRocking = Array.from({ length: 40 }, (_, index) => commonSample({
    wallS: index / 20,
    aiRollCommand: Math.floor(index / 2) % 2 === 0 ? 0.3 : -0.3,
    aiDesiredBankDeg: 78,
    aiTargetMode: Math.floor(index / 2) % 2 === 0 ? "route-a" : "route-b",
  }));
  assert.ok(rollCommandChatterStats(modeDwellRocking).maximumReversalRateHz > 0.9,
    "mode labels cannot hide constant-bank A/A/B/B rocking");

  const desiredBankDwellRocking = modeDwellRocking.map((sample, index) => ({
    ...sample,
    aiDesiredBankDeg: Math.floor(index / 2) % 2 === 0 ? 78 : -78,
    aiTargetMode: "gun-lead",
  }));
  assert.ok(rollCommandChatterStats(desiredBankDwellRocking).maximumReversalRateHz > 0.9,
    "a repeated A/A/B/B bank-target return is oscillation, not a chain of new turns");

  assert.equal(rollCommandChatterStats([
    commonSample({ wallS: 0, aiRollCommand: 0.3, aiDesiredBankDeg: null }),
    commonSample({ wallS: 0.1, aiRollCommand: -0.3, aiDesiredBankDeg: 78 }),
  ]).reversals, 1, "missing target telemetry must fail closed");
  assert.equal(rollCommandChatterStats([
    commonSample({ wallS: 0, aiRollCommand: 0.3, aiDesiredBankDeg: 176 }),
    commonSample({ wallS: 0.1, aiRollCommand: -0.3, aiDesiredBankDeg: -176 }),
  ]).reversals, 1, "a small wrapped target move cannot excuse a strong reversal");
});

test("physical rocking watchdog requires a steady target and real bank motion", () => {
  const rocking = Array.from({ length: 45 }, (_, index) => commonSample({
    wallS: index / 20,
    tick: index * 6,
    aiDesiredBankDeg: 78,
    bankDeg: 78 + (index % 2 === 0 ? 1.2 : -1.2),
    rollRateDps: index % 2 === 0 ? 10 : -10,
  }));
  const stats = physicalRollRockingStats(rocking);
  assert.ok(stats.maximumReversals > 20);
  assert.ok(stats.maximumRockingBankPeakToPeakDeg >= 2.4);
  assert.ok(stats.violatingWindows > 0);
  assert.match(
    assessFixedWingAiFlight(rocking, { mission: "f22" }).failures.join("\n"),
    /physically rocked/,
  );

  const commandedReversals = rocking.map((sample, index) => ({
    ...sample,
    aiDesiredBankDeg: Math.floor(index / 8) % 2 === 0 ? 78 : -78,
  }));
  assert.equal(physicalRollRockingStats(commandedReversals).violatingWindows, 0);

  const commandedCapture = rocking.map((sample, index) => ({
    ...sample,
    aiDesiredBankDeg: 112,
    bankDeg: 82 + 26 * index / (rocking.length - 1),
  }));
  assert.equal(physicalRollRockingStats(commandedCapture).violatingWindows, 0,
    "a damped 82-to-108-degree capture is not a settled roll oscillation");

  const slowRock = Array.from({ length: 45 }, (_, index) => {
    const wallS = index / 20;
    return commonSample({
      wallS,
      tick: index * 6,
      aiDesiredBankDeg: 78,
      bankDeg: 78 + 1.4 * Math.sin(2 * Math.PI * wallS),
      rollRateDps: 1.4 * 2 * Math.PI * Math.cos(2 * Math.PI * wallS),
    });
  });
  const slowStats = physicalRollRockingStats(slowRock);
  assert.ok(slowStats.maximumReversals >= 4);
  assert.ok(slowStats.maximumRockingBankPeakToPeakDeg > 2.7);
  assert.ok(slowStats.violatingWindows > 0,
    "the tape-shaped 2.8-degree, 1 Hz rock must fail");
  assert.match(
    assessFixedWingAiFlight(slowRock, { mission: "f22" }).failures.join("\n"),
    /physically rocked/,
  );
});

test("input-fidelity watchdog accepts current or one-cycle-old writes but rejects bad mapping", () => {
  const faithful = Array.from({ length: 101 }, (_, index) => {
    const command = index % 4 < 2 ? 0.22 : -0.18;
    return commonSample({
      wallS: index / 20,
      tick: index * 6,
      aiAppliedRollCommand: command,
      requestedRoll: command,
      rangeM: index > 40 ? 2_200 : 8_000,
      roundsFired: index > 50 ? 24 : 0,
      hits: index > 60 ? 1 : 0,
      opponentHealth: index > 60 ? 0 : 1,
      opponentTerminal: index > 60 ? "DESTROYED" : "FLYING",
      killCount: index > 60 ? 1 : 0,
    });
  });
  assert.equal(rollInputFidelityStats(faithful).p95AbsoluteError, 0);

  const oneCycleOld = faithful.map((sample, index) => ({
    ...sample,
    requestedRoll: index === 0 ? sample.requestedRoll
      : faithful[index - 1].aiAppliedRollCommand,
  }));
  assert.equal(rollInputFidelityStats(oneCycleOld).p95AbsoluteError, 0);

  const inflated = faithful.map((sample, index) => ({
    ...sample,
    requestedRoll: faithful[index].aiAppliedRollCommand * 2,
  }));
  assert.ok(rollInputFidelityStats(inflated).p95AbsoluteError > 0.15);
  assert.match(
    assessFixedWingAiFlight(inflated, { mission: "f22" }).failures.join("\n"),
    /gamepad roll fidelity/,
  );
});

test("assessment rejects a sortie that silently loses roll-rate telemetry", () => {
  const samples = [
    commonSample(),
    commonSample({
      wallS: 2, tick: 240, rangeM: 2_200, rollRateDps: Number.NaN,
      roundsFired: 24, hits: 1, opponentHealth: 0,
      opponentTerminal: "DESTROYED", killCount: 1,
    }),
  ];
  assert.match(
    assessFixedWingAiFlight(samples, { mission: "f22" }).failures.join("\n"),
    /roll-rate telemetry covered only 50%/,
  );
});

test("assessment rejects a live-length tape whose playerbot loop falls below 17 Hz", () => {
  const slow = Array.from({ length: 101 }, (_, index) => commonSample({
    wallS: index / 10,
    tick: index * 12,
    rangeM: index > 40 ? 2_200 : 8_000,
    roundsFired: index > 50 ? 24 : 0,
    hits: index > 60 ? 1 : 0,
    opponentHealth: index > 60 ? 0 : 1,
    opponentTerminal: index > 60 ? "DESTROYED" : "FLYING",
    killCount: index > 60 ? 1 : 0,
  }));
  assert.match(
    assessFixedWingAiFlight(slow, { mission: "f22" }).failures.join("\n"),
    /AI control cadence was 10.0 Hz/,
  );
});

test("assessment rejects a short failed tape whose playerbot loop falls below 17 Hz", () => {
  const slow = Array.from({ length: 30 }, (_, index) => commonSample({
    wallS: index / 2,
    tick: index * 60,
    rangeM: 8_000 - index * 100,
    aiAuthorityReadLatencyMs: 240 + index % 3,
    aiGamepadWriteLatencyMs: 210 + index % 2,
    keyboardQuarantine: { unexpectedCount: index < 10 ? 0 : 2 },
  }));
  const result = assessFixedWingAiFlight(slow, { mission: "f22" });
  assert.match(result.failures.join("\n"), /AI control cadence was 2\.0 Hz/);
  assert.match(result.failures.join("\n"), /AI control interval p95 was 500 ms/);
  assert.ok(result.metrics.p95AuthorityReadLatencyMs >= 241);
  assert.ok(result.metrics.p95GamepadWriteLatencyMs >= 210);
  assert.equal(result.metrics.maximumUnexpectedKeyboardEvents, 2);
  assert.match(result.failures.join("\n"), /keyboard quarantine blocked 2 unexpected events/);
});

test("combat assessment rejects a bandit that takes the fight into the stratosphere", () => {
  const samples = [
    commonSample({ rangeM: 2_300, opponentYM: 3_100 }),
    commonSample({
      wallS: 20, tick: 2_400, rangeM: 900, opponentYM: 9_000,
      roundsFired: 20, hits: 1, opponentHealth: 0,
      opponentTerminal: "DESTROYED", killCount: 1,
    }),
  ];
  assert.match(
    assessFixedWingAiFlight(samples, { mission: "f22" }).failures.join("\n"),
    /climbed out of the fight/,
  );

  const boundary = samples.map((sample) => ({ ...sample, opponentYM: 6_200 }));
  assert.doesNotMatch(
    assessFixedWingAiFlight(boundary, { mission: "f22" }).failures.join("\n"),
    /climbed out of the fight/,
  );
  const missing = samples.map((sample) => ({ ...sample, opponentYM: Number.NaN }));
  assert.match(
    assessFixedWingAiFlight(missing, { mission: "f22" }).failures.join("\n"),
    /altitude telemetry disappeared/,
  );
});

test("combat assessment rejects a harness ownship that escapes vertically", () => {
  const samples = [
    commonSample({ rangeM: 2_300, yM: 3_100 }),
    commonSample({
      wallS: 20, tick: 2_400, rangeM: 900, yM: 9_000,
      roundsFired: 20, hits: 1, opponentHealth: 0,
      opponentTerminal: "DESTROYED", killCount: 1,
    }),
  ];
  assert.match(
    assessFixedWingAiFlight(samples, { mission: "f22" }).failures.join("\n"),
    /ownship climbed out of the fight/,
  );
  const boundary = samples.map((sample) => ({ ...sample, yM: 7_500 }));
  assert.doesNotMatch(
    assessFixedWingAiFlight(boundary, { mission: "f22" }).failures.join("\n"),
    /ownship climbed out of the fight/,
  );

  const topGun = samples.map((sample) => ({
    ...sample,
    missionId: "mission.top-gun.acm.f14a-vs-mig28.v1",
  }));
  assert.match(
    assessFixedWingAiFlight(topGun, { mission: "top-gun" }).failures.join("\n"),
    /ownship climbed out of the fight/,
  );
});

function rapierFirstKillTape() {
  const missionId = "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1";
  return [
    commonSample({
      missionId,
      rapierPhase: "launch",
      rapierAutomationEnabled: true,
      rapierReactionActive: false,
      rapierReactionSeconds: 0,
      rapierCarriersRemaining: 3,
      rapierPayloadDeployed: false,
      sortiePlayerRoundsFired: 0,
      sortiePlayerHits: 0,
    }),
    commonSample({
      missionId, wallS: 75, tick: 9_000, xM: 8_000, yM: 5_000,
      rapierPhase: "climb", rapierAutomationEnabled: true,
      rapierReactionActive: false, rapierReactionSeconds: 0,
      rapierCarriersRemaining: 3, rapierPayloadDeployed: false,
      sortiePlayerRoundsFired: 0, sortiePlayerHits: 0,
    }),
    commonSample({
      missionId, wallS: 250, tick: 30_000, xM: 45_000, yM: 13_200,
      rapierPhase: "intercept", rapierAutomationEnabled: true,
      rapierReactionActive: false, rapierReactionSeconds: 0,
      rapierCarriersRemaining: 3, rapierPayloadDeployed: false,
      sortiePlayerRoundsFired: 0, sortiePlayerHits: 0,
    }),
    commonSample({
      missionId, wallS: 350, tick: 42_000, xM: 60_000, yM: 13_550,
      rapierPhase: "attack", rapierAutomationEnabled: true,
      rapierReactionActive: true, rapierReactionSeconds: 29.8,
      rapierCarriersRemaining: 3, rapierPayloadDeployed: false,
      sortiePlayerRoundsFired: 0, sortiePlayerHits: 0,
    }),
    commonSample({
      missionId, wallS: 350.1, tick: 42_012, xM: 60_030, yM: 13_550,
      rapierPhase: "attack", rapierAutomationEnabled: true,
      rapierReactionActive: true, rapierReactionSeconds: 29.7,
      rapierCarriersRemaining: 2, rapierPayloadDeployed: false,
      roundsFired: 12, hits: 1, killCount: 1,
      sortiePlayerRoundsFired: 12, sortiePlayerHits: 1,
    }),
  ];
}

function rapierFullSortieTape() {
  const samples = rapierFirstKillTape();
  const missionId = samples[0].missionId;
  return [
    ...samples,
    commonSample({
      missionId, wallS: 351, tick: 42_120, xM: 60_120, yM: 13_540,
      rapierPhase: "attack", rapierAutomationEnabled: true,
      rapierReactionActive: true, rapierReactionSeconds: 24,
      rapierCarriersRemaining: 2, rapierPayloadDeployed: false,
      roundsFired: 12, hits: 1, killCount: 1,
      sortiePlayerRoundsFired: 12, sortiePlayerHits: 1,
    }),
    commonSample({
      missionId, wallS: 352, tick: 42_240, xM: 60_210, yM: 13_530,
      rapierPhase: "attack", rapierAutomationEnabled: true,
      rapierReactionActive: true, rapierReactionSeconds: 23,
      rapierCarriersRemaining: 1, rapierPayloadDeployed: false,
      roundsFired: 24, hits: 2, killCount: 2,
      sortiePlayerRoundsFired: 24, sortiePlayerHits: 2,
    }),
    commonSample({
      missionId, wallS: 353, tick: 42_360, xM: 60_300, yM: 13_520,
      rapierPhase: "attack", rapierAutomationEnabled: true,
      rapierReactionActive: true, rapierReactionSeconds: 22,
      rapierCarriersRemaining: 1, rapierPayloadDeployed: false,
      roundsFired: 24, hits: 2, killCount: 2,
      sortiePlayerRoundsFired: 24, sortiePlayerHits: 2,
    }),
    commonSample({
      missionId, wallS: 354, tick: 42_480, xM: 60_390, yM: 13_500,
      rapierPhase: "attack", rapierAutomationEnabled: true,
      rapierReactionActive: false, rapierReactionSeconds: 0,
      rapierCarriersRemaining: 0, rapierPayloadDeployed: false,
      roundsFired: 36, hits: 3, killCount: 3,
      sortiePlayerRoundsFired: 36, sortiePlayerHits: 3,
      opponentTerminal: "DESTROYED",
    }),
    commonSample({
      missionId, wallS: 420, tick: 50_400, xM: 45_000, yM: 15_000,
      rapierPhase: "returntobase", rapierAutomationEnabled: true,
      rapierReactionActive: false, rapierReactionSeconds: 0,
      rapierCarriersRemaining: 0, rapierPayloadDeployed: false,
      playerReturnToBaseActive: true,
      roundsFired: 36, hits: 3, killCount: 3,
      sortiePlayerRoundsFired: 36, sortiePlayerHits: 3,
      opponentTerminal: "DESTROYED",
    }),
    ...[0, 1, 2, 3, 4].map((gate, index) => commonSample({
      missionId,
      wallS: 900 + index * 150,
      tick: (900 + index * 150) * 120,
      xM: 20_000 - index * 4_500,
      yM: 4_000 - index * 850,
      rapierPhase: "recovery",
      rapierAutomationEnabled: true,
      rapierReactionActive: false,
      rapierReactionSeconds: 0,
      rapierCarriersRemaining: 0,
      rapierPayloadDeployed: false,
      rapierRecoveryGate: gate,
      playerReturnToBaseActive: true,
      roundsFired: 36,
      hits: 3,
      killCount: 3,
      sortiePlayerRoundsFired: 36,
      sortiePlayerHits: 3,
      opponentTerminal: "DESTROYED",
    })),
    commonSample({
      missionId, wallS: 1_505, tick: 180_600, xM: 1_900, yM: 120,
      sessionPhase: "FINISHED", sessionFinished: true, sortieOutcome: "VICTORY",
      rapierPhase: "recovery", rapierAutomationEnabled: true,
      rapierReactionActive: false, rapierReactionSeconds: 0,
      rapierCarriersRemaining: 0, rapierPayloadDeployed: false,
      rapierRecoveryGate: 4, playerReturnToBaseActive: false,
      recovery: "Trap", hookOutcome: "ENGAGED", wire: 3, arrestPhase: "STOPPED",
      arrestFailureReason: "NONE",
      roundsFired: 36, hits: 3, killCount: 3,
      sortiePlayerRoundsFired: 36, sortiePlayerHits: 3,
      opponentTerminal: "DESTROYED",
      recentEvents: [{ type: "SORTIE_FINISHED", outcome: "VICTORY" }],
    }),
  ];
}

test("Rapier first-kill evidence no longer ends the full-sortie runner", () => {
  const samples = rapierFirstKillTape();
  const evidence = rapierAttackEvidence(samples);
  assert.equal(evidence.pass, true);
  assert.deepEqual(evidence.phases.visited, ["launch", "climb", "intercept", "attack"]);
  assert.equal(evidence.initialCarriersRemaining, 3);
  assert.equal(evidence.minimumCarriersRemaining, 2);
  assert.equal(evidence.roundsFiredDelta, 12);
  assert.equal(evidence.hitsDelta, 1);
  assert.equal(evidence.carrierDecrementBeforePayload, true);
  assert.equal(missionSatisfied(samples.slice(0, -1), "rapier"), false);
  assert.equal(missionSatisfied(samples, "rapier"), false);
  const assessment = assessFixedWingAiFlight(samples, { mission: "rapier" });
  assert.match(assessment.failures.join("\n"), /expected 3 -> 2 -> 1 -> 0/);
  assert.equal(assessment.metrics.rapierAttack.pass, true);
  assert.equal(assessment.metrics.rapierSortie.pass, false);
});

test("Rapier full-sortie acceptance proves three fresh kills, RTB, gates, and trap", () => {
  const samples = rapierFullSortieTape();
  const evidence = rapierSortieEvidence(samples);
  assert.equal(evidence.pass, true);
  assert.deepEqual(evidence.carrierProgression, [3, 2, 1, 0]);
  assert.deepEqual(
    evidence.transitions.map((transition) => ({
      from: transition.fromCarriers,
      to: transition.toCarriers,
      rounds: transition.roundsFiredDelta,
      hits: transition.hitsDelta,
      fuse: transition.reactionFuseLive,
    })),
    [
      { from: 3, to: 2, rounds: 12, hits: 1, fuse: true },
      { from: 2, to: 1, rounds: 12, hits: 1, fuse: true },
      { from: 1, to: 0, rounds: 12, hits: 1, fuse: true },
    ],
  );
  assert.deepEqual(evidence.recoveryGates, [0, 1, 2, 3, 4]);
  assert.equal(evidence.playerRtbActiveSeen, true);
  assert.equal(evidence.terminalPass, true);
  assert.equal(missionSatisfied(samples.slice(0, -1), "rapier"), false);
  assert.equal(missionSatisfied(samples, "rapier"), true);
  const assessment = assessFixedWingAiFlight(samples, { mission: "rapier" });
  assert.deepEqual(assessment.failures, []);
  assert.equal(assessment.metrics.rapierSortie.pass, true);
});

test("Rapier departure and skipped-intercept tapes cannot satisfy the mission", () => {
  const samples = rapierFirstKillTape();
  const departureOnly = samples.slice(0, 2);
  assert.equal(missionSatisfied(departureOnly, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(departureOnly, { mission: "rapier" }).failures.join("\n"),
    /Rapier phases stopped at launch -> climb/,
  );

  const skippedIntercept = samples.filter((_, index) => index !== 2);
  assert.equal(missionSatisfied(skippedIntercept, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(skippedIntercept, { mission: "rapier" }).failures.join("\n"),
    /Rapier phases stopped at launch -> climb -> attack/,
  );
});

test("Rapier acceptance rejects synthetic kills and premature payload deployment", () => {
  const cases = [
    {
      label: "pre-Attack weapon activity",
      samples: rapierFirstKillTape().map((sample, index) => ({
        ...sample,
        roundsFired: index >= 2 ? 12 : 0,
        hits: index >= 2 ? 1 : 0,
        sortiePlayerRoundsFired: index >= 2 ? 12 : 0,
        sortiePlayerHits: index >= 2 ? 1 : 0,
      })),
      failure: /Rapier 3 -> 2 carrier kill fired no fresh player rounds/,
    },
    {
      label: "rounds",
      samples: rapierFirstKillTape().map((sample) => ({
        ...sample, roundsFired: 0, sortiePlayerRoundsFired: 0,
      })),
      failure: /Rapier 3 -> 2 carrier kill fired no fresh player rounds/,
    },
    {
      label: "hits",
      samples: rapierFirstKillTape().map((sample) => ({
        ...sample, hits: 0, sortiePlayerHits: 0,
      })),
      failure: /Rapier 3 -> 2 carrier kill produced no fresh player hit/,
    },
    {
      label: "carrier decrement",
      samples: rapierFirstKillTape().map((sample) => ({
        ...sample, rapierCarriersRemaining: 3,
      })),
      failure: /Rapier missed the 3 -> 2 carrier promotion/,
    },
    {
      label: "payload ordering",
      samples: rapierFirstKillTape().map((sample, index) => ({
        ...sample, rapierPayloadDeployed: index === 3,
      })),
      failure: /Rapier payload deployed before all three carriers were destroyed/,
    },
  ];

  for (const fixture of cases) {
    assert.equal(missionSatisfied(fixture.samples, "rapier"), false, fixture.label);
    assert.match(
      assessFixedWingAiFlight(fixture.samples, { mission: "rapier" }).failures.join("\n"),
      fixture.failure,
      fixture.label,
    );
  }
});

test("Rapier full-sortie acceptance rejects skipped and recycled carrier kills", () => {
  const skippedTwo = rapierFullSortieTape().map((sample) => ({
    ...sample,
    rapierCarriersRemaining: sample.rapierCarriersRemaining === 2
      ? 1 : sample.rapierCarriersRemaining,
  }));
  assert.equal(missionSatisfied(skippedTwo, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(skippedTwo, { mission: "rapier" }).failures.join("\n"),
    /carrier progression was 3 -> 1 -> 0/,
  );

  const recycledRounds = rapierFullSortieTape().map((sample) => ({
    ...sample,
    roundsFired: sample.rapierCarriersRemaining <= 1 ? 12 : sample.roundsFired,
    sortiePlayerRoundsFired: sample.rapierCarriersRemaining <= 1
      ? 12 : sample.sortiePlayerRoundsFired,
  }));
  assert.equal(missionSatisfied(recycledRounds, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(recycledRounds, { mission: "rapier" }).failures.join("\n"),
    /Rapier 2 -> 1 carrier kill fired no fresh player rounds/,
  );

  const recycledHit = rapierFullSortieTape().map((sample) => ({
    ...sample,
    hits: sample.rapierCarriersRemaining <= 1 ? 1 : sample.hits,
    sortiePlayerHits: sample.rapierCarriersRemaining <= 1
      ? 1 : sample.sortiePlayerHits,
  }));
  assert.equal(missionSatisfied(recycledHit, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(recycledHit, { mission: "rapier" }).failures.join("\n"),
    /Rapier 2 -> 1 carrier kill produced no fresh player hit/,
  );

  const deadFuse = rapierFullSortieTape().map((sample) => ({
    ...sample,
    rapierReactionActive: sample.rapierCarriersRemaining <= 2
      ? false : sample.rapierReactionActive,
    rapierReactionSeconds: sample.rapierCarriersRemaining <= 2
      ? 0 : sample.rapierReactionSeconds,
  }));
  assert.equal(missionSatisfied(deadFuse, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(deadFuse, { mission: "rapier" }).failures.join("\n"),
    /Rapier 2 -> 1 carrier kill lacked a live reaction fuse/,
  );

  const staleBaselineFuse = rapierFullSortieTape().map((sample) => ({
    ...sample,
    rapierReactionActive: sample.wallS >= 351 && sample.wallS <= 352
      ? false : sample.rapierReactionActive,
    rapierReactionSeconds: sample.wallS >= 351 && sample.wallS <= 352
      ? 0 : sample.rapierReactionSeconds,
  }));
  assert.equal(missionSatisfied(staleBaselineFuse, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(staleBaselineFuse, { mission: "rapier" }).failures.join("\n"),
    /Rapier 2 -> 1 carrier kill lacked a live reaction fuse/,
  );

  const missingSortieCounters = rapierFullSortieTape().map((sample) => ({
    ...sample,
    sortiePlayerRoundsFired: undefined,
    sortiePlayerHits: undefined,
  }));
  assert.equal(missionSatisfied(missingSortieCounters, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(
      missingSortieCounters,
      { mission: "rapier" },
    ).failures.join("\n"),
    /lacked cumulative sortie weapon telemetry/,
  );
});

test("Rapier full-sortie acceptance rejects fake RTB and recovery progression", () => {
  const directRecovery = rapierFullSortieTape().filter((sample) =>
    sample.rapierPhase !== "returntobase");
  assert.equal(missionSatisfied(directRecovery, "rapier"), true);
  assert.deepEqual(
    assessFixedWingAiFlight(directRecovery, { mission: "rapier" }).failures,
    [],
  );

  const lateRtb = rapierFullSortieTape().map((sample) => ({
    ...sample,
    rapierPhase: sample.rapierPhase === "recovery" && sample.rapierRecoveryGate === 2
      ? "returntobase" : sample.rapierPhase,
  }));
  assert.equal(missionSatisfied(lateRtb, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(lateRtb, { mission: "rapier" }).failures.join("\n"),
    /ReturnToBase appeared after Recovery/,
  );

  const noRtbAuthority = rapierFullSortieTape().map((sample) => ({
    ...sample, playerReturnToBaseActive: false,
  }));
  assert.equal(missionSatisfied(noRtbAuthority, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(noRtbAuthority, { mission: "rapier" }).failures.join("\n"),
    /never published active player RTB/,
  );

  const skippedGate = rapierFullSortieTape().map((sample) => ({
    ...sample,
    rapierRecoveryGate: sample.rapierPhase === "recovery"
        && sample.rapierRecoveryGate === 2
      ? 3 : sample.rapierRecoveryGate,
  }));
  assert.equal(missionSatisfied(skippedGate, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(skippedGate, { mission: "rapier" }).failures.join("\n"),
    /recovery gates were 0 -> 1 -> 3 -> 4/,
  );

  const clean = rapierFullSortieTape();
  const recoveryStart = clean.findIndex((sample) => sample.rapierPhase === "recovery");
  const recoverySeed = clean[recoveryStart];
  const retriedApproach = [
    ...clean.slice(0, recoveryStart),
    ...[0, 1, 2, 3, 4, 0].map((gate, index) => ({
      ...recoverySeed,
      wallS: 500 + index * 50,
      tick: (500 + index * 50) * 120,
      rapierRecoveryGate: gate,
    })),
    ...clean.slice(recoveryStart),
  ];
  const retriedEvidence = rapierSortieEvidence(retriedApproach);
  assert.deepEqual(retriedEvidence.finalApproachGates, [1, 2, 3, 4]);
  assert.equal(missionSatisfied(retriedApproach, "rapier"), true);
});

test("Rapier full-sortie acceptance requires authoritative finished trap evidence", () => {
  const notFinished = rapierFullSortieTape().map((sample, index, rows) => index === rows.length - 1
    ? { ...sample, sessionFinished: false, sessionPhase: "ACTIVE" }
    : sample);
  assert.equal(missionSatisfied(notFinished, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(notFinished, { mission: "rapier" }).failures.join("\n"),
    /never reached FINISHED authority/,
  );

  const bolterLabelledComplete = rapierFullSortieTape().map(
    (sample, index, rows) => index === rows.length - 1
      ? { ...sample, recovery: "Bolter", hookOutcome: "MISSED", wire: 0, arrestPhase: "NONE" }
      : sample,
  );
  assert.equal(missionSatisfied(bolterLabelledComplete, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(
      bolterLabelledComplete,
      { mission: "rapier" },
    ).failures.join("\n"),
    /not a stopped, wire-engaged trap/,
  );

  const noFinishEvent = rapierFullSortieTape().map((sample, index, rows) =>
    index === rows.length - 1 ? { ...sample, recentEvents: [] } : sample);
  assert.equal(missionSatisfied(noFinishEvent, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(noFinishEvent, { mission: "rapier" }).failures.join("\n"),
    /no VICTORY SortieFinished event/,
  );

  const draw = rapierFullSortieTape().map((sample, index, rows) =>
    index === rows.length - 1 ? { ...sample, sortieOutcome: "DRAW" } : sample);
  assert.equal(missionSatisfied(draw, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(draw, { mission: "rapier" }).failures.join("\n"),
    /terminal sortie outcome was not VICTORY/,
  );

  const terminalPayload = rapierFullSortieTape().map((sample, index, rows) =>
    index === rows.length - 1 ? { ...sample, rapierPayloadDeployed: true } : sample);
  assert.equal(missionSatisfied(terminalPayload, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(terminalPayload, { mission: "rapier" }).failures.join("\n"),
    /terminal authority reported payload deployment/,
  );

  const missingKillLedger = rapierFullSortieTape().map((sample, index, rows) =>
    index === rows.length - 1 ? { ...sample, killCount: 2 } : sample);
  assert.equal(missionSatisfied(missingKillLedger, "rapier"), false);
  assert.match(
    assessFixedWingAiFlight(missingKillLedger, { mission: "rapier" }).failures.join("\n"),
    /terminal authority did not retain three player kills/,
  );
});

function topGunFullSortieTape() {
  const missionId = "mission.top-gun.acm.f14a-vs-mig28.v1";
  const rows = [];
  const approachGates = (count) => Array.from({ length: count }, (_, index) => ({
    eastM: -1_000 - index * 200,
    northM: 4_000 - index * 500,
    upM: 250 - index * 20,
    halfM: 80,
    targetKtas: 250 - index * 15,
    dirty: index >= 2,
    active: index === 0,
  }));
  const add = (overrides = {}) => {
    const index = rows.length;
    rows.push(commonSample({
      missionId,
      wallS: index / 20,
      tick: index * 6,
      aim9Remaining: 2,
      sortiePlayerRoundsFired: 0,
      sortiePlayerHits: 0,
      killCount: 0,
      combatHandoffPhase: 1,
      returnToBaseReason: "NONE",
      playerReturnToBaseActive: false,
      configurationTarget: "COMBAT",
      configurationAutomatic: true,
      configurationGearAutomatic: true,
      configurationFlapAutomatic: true,
      gearNose: 0,
      gearLeft: 0,
      gearRight: 0,
      flapLeftDeg: 0,
      flapRightDeg: 0,
      recentEvents: [],
      ...overrides,
    }));
  };
  add();
  add({
    aim9Remaining: 1,
    killCount: 1,
    opponentTerminal: "DESTROYED_AIRBORNE",
    recentEvents: [{
      sequence: 10, type: "DESTROYED", source: "PLAYER", target: "OPPONENT",
      entityId: "bandit-1",
    }],
  });
  add({
    aim9Remaining: 1,
    killCount: 1,
    opponentTerminal: "FLYING",
    recentEvents: [{
      sequence: 10, type: "DESTROYED", source: "PLAYER", target: "OPPONENT",
      entityId: "bandit-1",
    }],
  });
  add({
    aim9Remaining: 0,
    killCount: 2,
    opponentTerminal: "DESTROYED_AIRBORNE",
    recentEvents: [
      { sequence: 10, type: "DESTROYED", source: "PLAYER", target: "OPPONENT",
        entityId: "bandit-1" },
      { sequence: 20, type: "DESTROYED", source: "PLAYER", target: "OPPONENT",
        entityId: "bandit-2" },
    ],
  });
  add({
    aim9Remaining: 0,
    killCount: 2,
    returnToBaseAvailable: true,
    aiRtbRequestIssued: true,
  });

  for (const count of [8, 7, 6, 5, 4, 3, 2, 1]) {
    for (let held = 0; held < 3; held += 1) {
      const dirty = count <= 6;
      add({
        aim9Remaining: 0,
        killCount: 2,
        opponentTerminal: "DESTROYED_AIRBORNE",
        playerReturnToBaseActive: true,
        returnToBaseReason: "PILOT_KNOCK_IT_OFF",
        combatHandoffPhase: 5,
        approachGuidanceActive: true,
        approachValid: true,
        approachGateCount: count,
        approachGates: approachGates(count),
        aiTargetMode: count === 1 ? "carrier-final" : "carrier-approach",
        configurationTarget: dirty ? "RECOVERY" : "COMBAT",
        gearNose: dirty ? 1 : 0,
        gearLeft: dirty ? 1 : 0,
        gearRight: dirty ? 1 : 0,
        flapLeftDeg: dirty ? 35 : 0,
        flapRightDeg: dirty ? 35 : 0,
      });
    }
  }
  add({
    aim9Remaining: 0,
    killCount: 2,
    opponentTerminal: "DESTROYED_AIRBORNE",
    sessionPhase: "FINISHED",
    sessionFinished: true,
    sortieOutcome: "VICTORY",
    playerReturnToBaseActive: false,
    returnToBaseReason: "PILOT_KNOCK_IT_OFF",
    combatHandoffPhase: 8,
    approachGuidanceActive: true,
    approachValid: true,
    approachGateCount: 1,
    approachGates: approachGates(1),
    aiTargetMode: "carrier-final",
    configurationTarget: "RECOVERY",
    gearNose: 1,
    gearLeft: 1,
    gearRight: 1,
    flapLeftDeg: 35,
    flapRightDeg: 35,
    recovery: "Trap",
    hookOutcome: "ENGAGED",
    wire: 3,
    arrestPhase: "STOPPED",
    arrestFailureReason: "NONE",
    recentEvents: [{ type: "SORTIE_FINISHED", outcome: "VICTORY" }],
  });
  return rows;
}

test("Top Gun full-sortie acceptance proves replacement kills, O RTB, Case I and wire", () => {
  const samples = topGunFullSortieTape();
  const evidence = topGunSortieEvidence(samples);
  assert.equal(evidence.pass, true);
  assert.deepEqual(evidence.killProgression, [0, 1, 2]);
  assert.deepEqual(evidence.transitions.map((transition) => ({
    missile: transition.missilesDelta,
    event: transition.destroyedEventSequence,
  })), [
    { missile: 1, event: 10 },
    { missile: 1, event: 20 },
  ]);
  assert.deepEqual(evidence.combatHandoffPhases, [1, 5, 8]);
  assert.deepEqual(evidence.approachGateCounts, [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(evidence.finalApproachGateCounts, [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(evidence.replacementTargetsDistinct, true);
  assert.equal(evidence.approachGateGeometryPass, true);
  assert.equal(evidence.recoveryConfigurationSeen, true);
  assert.equal(evidence.terminalPass, true);
  assert.equal(missionSatisfied(samples.slice(0, -1), "top-gun"), false);
  assert.equal(missionSatisfied(samples, "top-gun"), true);
  assert.deepEqual(assessFixedWingAiFlight(samples, { mission: "top-gun" }).failures, []);
});

test("Top Gun acceptance rejects stale destruction, skipped gates and fake configuration", () => {
  const noSecondDestroyed = topGunFullSortieTape().map((sample) => ({
    ...sample,
    recentEvents: (sample.recentEvents ?? []).filter((event) => event.sequence !== 20),
  }));
  assert.equal(missionSatisfied(noSecondDestroyed, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(noSecondDestroyed, { mission: "top-gun" }).failures.join("\n"),
    /splash 2 had no fresh player DESTROYED event/,
  );

  const skippedGate = topGunFullSortieTape().filter((sample) => sample.approachGateCount !== 4);
  assert.equal(missionSatisfied(skippedGate, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(skippedGate, { mission: "top-gun" }).failures.join("\n"),
    /approach ladder was 8 -> 7 -> 6 -> 5 -> 3 -> 2 -> 1/,
  );

  const cleanOnFinal = topGunFullSortieTape().map((sample) => ({
    ...sample,
    gearNose: 0,
    gearLeft: 0,
    gearRight: 0,
    flapLeftDeg: 0,
    flapRightDeg: 0,
  }));
  assert.equal(missionSatisfied(cleanOnFinal, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(cleanOnFinal, { mission: "top-gun" }).failures.join("\n"),
    /never physically locked gear and flaps/,
  );
});

test("Top Gun acceptance rejects a recycled airframe, weapon proof or O request", () => {
  const recycledAirframe = topGunFullSortieTape().map((sample) => ({
    ...sample,
    recentEvents: (sample.recentEvents ?? []).map((event) => event.sequence === 20
      ? { ...event, entityId: "bandit-1" }
      : event),
  }));
  assert.equal(missionSatisfied(recycledAirframe, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(recycledAirframe, { mission: "top-gun" }).failures.join("\n"),
    /did not destroy two distinct replacement aircraft/,
  );

  const recycledWeaponProof = topGunFullSortieTape().map((sample) =>
    sample.killCount >= 2 ? { ...sample, aim9Remaining: 1 } : sample);
  assert.equal(missionSatisfied(recycledWeaponProof, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(recycledWeaponProof, { mission: "top-gun" }).failures.join("\n"),
    /splash 2 had no fresh gun hit or AIM-9 launch/,
  );

  const noPhysicalO = topGunFullSortieTape().map((sample) => ({
    ...sample,
    aiRtbRequestIssued: false,
  }));
  assert.equal(missionSatisfied(noPhysicalO, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(noPhysicalO, { mission: "top-gun" }).failures.join("\n"),
    /never issued a physical O request/,
  );
});

test("Top Gun recovery evidence binds authority, geometry and automation to the real final", () => {
  const earlyHandoffOnly = topGunFullSortieTape().map((sample, index) => ({
    ...sample,
    combatHandoffPhase: index === 0 ? 5
      : sample.combatHandoffPhase === 5 ? 4 : sample.combatHandoffPhase,
  }));
  assert.equal(missionSatisfied(earlyHandoffOnly, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(earlyHandoffOnly, { mission: "top-gun" }).failures.join("\n"),
    /never reached PLAYER_RTB authority/,
  );

  const counterWithoutGeometry = topGunFullSortieTape().map((sample) =>
    sample.approachGateCount === 6 ? { ...sample, approachGates: [] } : sample);
  assert.equal(missionSatisfied(counterWithoutGeometry, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(counterWithoutGeometry, { mission: "top-gun" }).failures.join("\n"),
    /lacked live authoritative gate geometry/,
  );

  const automaticOnlyInCombat = topGunFullSortieTape().map((sample) =>
    sample.configurationTarget === "RECOVERY"
      ? { ...sample, configurationAutomatic: false,
        configurationGearAutomatic: false, configurationFlapAutomatic: false }
      : sample);
  assert.equal(missionSatisfied(automaticOnlyInCombat, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(automaticOnlyInCombat, { mission: "top-gun" }).failures.join("\n"),
    /did not use the production automatic configuration path/,
  );
});

test("Top Gun grades the final complete Case I attempt after a bolter reset", () => {
  const original = topGunFullSortieTape();
  const retryApproach = original.filter((sample) =>
    sample.playerReturnToBaseActive === true && sample.approachGuidanceActive === true);
  const retry = [
    ...original.slice(0, -1),
    ...retryApproach,
    original.at(-1),
  ].map((sample, index) => ({ ...sample, wallS: index / 20, tick: index * 6 }));
  const evidence = topGunSortieEvidence(retry);
  assert.deepEqual(evidence.approachGateCounts,
    [8, 7, 6, 5, 4, 3, 2, 1, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(evidence.finalApproachGateCounts, [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(evidence.pass, true);
  assert.equal(missionSatisfied(retry, "top-gun"), true);
});

test("Top Gun acceptance requires pilot RTB and a stopped winning wire", () => {
  const bingo = topGunFullSortieTape().map((sample) => ({
    ...sample,
    returnToBaseReason: sample.returnToBaseReason === "PILOT_KNOCK_IT_OFF"
      ? "BINGO_FUEL" : sample.returnToBaseReason,
  }));
  assert.equal(missionSatisfied(bingo, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(bingo, { mission: "top-gun" }).failures.join("\n"),
    /did not retain the real O\/KNOCK-IT-OFF reason/,
  );

  const bolter = topGunFullSortieTape().map((sample, index, rows) => index === rows.length - 1
    ? { ...sample, recovery: "Bolter", hookOutcome: "MISSED", wire: 0,
      arrestPhase: "NONE", sessionPhase: "ACTIVE", sessionFinished: false,
      sortieOutcome: null, combatHandoffPhase: 5, recentEvents: [] }
    : sample);
  assert.equal(missionSatisfied(bolter, "top-gun"), false);
  assert.match(
    assessFixedWingAiFlight(bolter, { mission: "top-gun" }).failures.join("\n"),
    /not a stopped, wire-engaged trap/,
  );
});
