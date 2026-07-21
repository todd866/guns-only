import test from "node:test";
import assert from "node:assert/strict";
import {
  carrierAoARelevant,
  carrierConfigurationCue,
  carrierDistanceM,
  carrierLandingConfigured,
  carrierPadlockSupersededByCombat,
  carrierPadlockEligible,
  carrierPatternCue,
  carrierRelativeMotion,
  CarrierPatternCueQualifier,
  contextualPadlockTarget,
  CARRIER_PADLOCK_RADIUS_M,
  CARRIER_PADLOCK_RELEASE_RADIUS_M,
  padlockTargetValid,
} from "../carrier_sa.js";
import { systemsReadout } from "../hud_readouts.js";

const configured = {
  gear_handle: "DOWN",
  gear_nose_indication: "DOWN_LOCKED",
  gear_left_indication: "DOWN_LOCKED",
  gear_right_indication: "DOWN_LOCKED",
  gear_nose: 1,
  gear_left: 1,
  gear_right: 1,
  flap_left_deg: 38,
  flap_right_deg: 38,
};

const pattern = (overrides = {}) => ({
  carrier: true,
  mode: "FREE",
  approach: false,
  landing_heading: 0,
  deck_vx: 0,
  deck_vz: 55,
  deck_along: -1200,
  deck_cross: 0,
  deck_height: 183,
  indicated_airspeed_kts: 140,
  ...configured,
  ...overrides,
});

test("carrier padlock is contextual, null-safe, lifecycle-safe, and range bounded", () => {
  const near = { carrier: true, px: 0, py: 1000, pz: 0, cx: 0, cy: 20, cz: 9000 };
  assert.ok(carrierDistanceM(near) < CARRIER_PADLOCK_RADIUS_M);
  assert.equal(carrierPadlockEligible(near), true);
  assert.equal(contextualPadlockTarget(near), "carrier");
  assert.equal(carrierPadlockEligible({ ...near, carrier: false }), false);
  assert.equal(carrierPadlockEligible({ ...near, cz: 30_000 }), false);
  assert.equal(carrierPadlockEligible({ ...near, replay_external: true }), false);
  assert.equal(carrierPadlockEligible({ ...near, finished: true }), false);
  assert.equal(carrierPadlockEligible({ carrier: true }), false);
  assert.equal(carrierPadlockEligible(null), false);
  assert.equal(carrierDistanceM(null), null);
});

test("padlock validity releases stale boat/replay geometry and preserves combat fallback", () => {
  const carrierState = {
    carrier: true, px: 0, py: 100, pz: 0, cx: 0, cy: 20, cz: 1000,
    bx: 10, by: 100, bz: 500, opponent_body_present: true,
    configuration_target: "RECOVERY",
  };
  assert.equal(contextualPadlockTarget(carrierState), "carrier",
    "recovery intent keeps the boat as the useful reference despite a staged bandit");
  assert.equal(padlockTargetValid(carrierState, "carrier"), true);
  const boundaryState = { ...carrierState, px: 0, py: 100, pz: 0, cy: 20 };
  assert.equal(carrierPadlockEligible({ ...boundaryState, cz: CARRIER_PADLOCK_RADIUS_M + 10 }), false,
    "a new carrier lock cannot acquire beyond 12 NM");
  assert.equal(padlockTargetValid({ ...boundaryState, cz: CARRIER_PADLOCK_RADIUS_M + 10 }, "carrier"), true,
    "an existing carrier lock receives bounded release hysteresis");
  assert.equal(padlockTargetValid({ ...boundaryState, cz: CARRIER_PADLOCK_RELEASE_RADIUS_M + 10 }, "carrier"), false);
  assert.equal(padlockTargetValid({ ...carrierState, replay_external: true }, "carrier"), false);
  assert.equal(contextualPadlockTarget({ ...carrierState, carrier: false }), "bandit");
  assert.equal(padlockTargetValid({ ...carrierState, carrier: false }, "bandit"), true);
  assert.equal(padlockTargetValid({ ...carrierState, opponent_body_present: false }, "bandit"), false);
  assert.equal(padlockTargetValid({ ...carrierState, bandit_alive: false }, "bandit"), false);
  assert.equal(padlockTargetValid({ ...carrierState, opponent_alive: false }, "bandit"), false);
});

test("a completed trap and relaunch hands contextual padlock from recovery back to combat", () => {
  const shared = {
    carrier: true,
    px: 0, py: 80, pz: 250,
    cx: 0, cy: 20, cz: 0,
    bx: 450, by: 650, bz: 1500,
    opponent_body_present: true,
    bandit_alive: true,
    opponent_alive: true,
  };
  const stoppedTrap = {
    ...shared,
    mode: "STOPPED",
    configuration_target: "RECOVERY",
  };
  assert.equal(contextualPadlockTarget(stoppedTrap), "carrier");
  assert.equal(padlockTargetValid(stoppedTrap, "carrier"), true);
  for (const mode of ["CATAPULT", "WAVE-OFF", "BOLTER"]) {
    const recoveryTransition = {
      ...shared,
      mode,
      configuration_target: "COMBAT",
    };
    assert.equal(contextualPadlockTarget(recoveryTransition), "carrier",
      `${mode} remains a recovery task even while the jet cleans up`);
    assert.equal(padlockTargetValid(recoveryTransition, "carrier"), true);
  }

  const postLaunchCombat = {
    ...shared,
    px: 0, py: 110, pz: 600,
    mode: "FREE",
    approach: false,
    configuration_target: "COMBAT",
  };
  assert.equal(contextualPadlockTarget(postLaunchCombat), "bandit",
    "carrier proximity must not outrank a valid threat after automatic combat cleanup");
  assert.equal(carrierPadlockSupersededByCombat(postLaunchCombat), true);
  assert.equal(padlockTargetValid(postLaunchCombat, "carrier"), false,
    "the pre-trap boat lock must release instead of surviving into the dogfight");
  assert.equal(padlockTargetValid(postLaunchCombat, "bandit"), true);

  assert.equal(contextualPadlockTarget({
    ...postLaunchCombat,
    opponent_body_present: false,
  }), "carrier", "the boat remains a safe fallback when no combat target exists");
  assert.equal(contextualPadlockTarget({
    ...postLaunchCombat,
    maintenance_scenario: true,
  }), "carrier", "maintenance recovery remains boat-centric even with a staged target body");
  assert.equal(carrierPadlockSupersededByCombat({
    ...postLaunchCombat,
    terminal_phase_active: true,
  }), false, "terminal invalidation is not misreported as a combat-task handoff");
});

test("deck-relative track preserves landing-frame signs", () => {
  assert.deepEqual(carrierRelativeMotion({ landing_heading: 0, deck_vx: 7, deck_vz: 50 }), {
    alongMps: 50,
    crossMps: 7,
    trackRad: Math.atan2(7, 50),
  });
  const eastboundLandingArea = carrierRelativeMotion({
    landing_heading: Math.PI / 2,
    deck_vx: 50,
    deck_vz: -7,
  });
  assert.ok(Math.abs(eastboundLandingArea.alongMps - 50) < 1e-12);
  assert.ok(Math.abs(eastboundLandingArea.crossMps - 7) < 1e-12);
});

test("pattern coach distinguishes astern initial from final using energy, mode, altitude, and track", () => {
  const initial = carrierPatternCue(pattern({
    deck_along: -5556,
    deck_cross: 320,
    deck_height: 244,
    deck_vz: 175,
    indicated_airspeed_kts: 350,
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_nose: 0,
    gear_left: 0,
    gear_right: 0,
    flap_left_deg: 0,
    flap_right_deg: 0,
  }));
  assert.equal(initial.phase, "INITIAL");
  assert.match(initial.instruction, /350 KIAS/);

  const tooHigh = carrierPatternCue({
    ...pattern({ deck_along: -5556, deck_cross: 320, deck_vz: 175, indicated_airspeed_kts: 350 }),
    deck_height: 500,
  });
  assert.equal(tooHigh.phase, "JOIN");

  const final = carrierPatternCue(pattern({ mode: "APPROACH", approach: true }));
  assert.equal(final.phase, "FINAL");
  const rightOfLine = carrierPatternCue(pattern({
    mode: "APPROACH", approach: true, deck_cross: 45,
  }));
  assert.match(rightOfLine.instruction, /COME LEFT/);
  const leftOfLine = carrierPatternCue(pattern({
    mode: "APPROACH", approach: true, deck_cross: -45,
  }));
  assert.match(leftOfLine.instruction, /COME RIGHT/);

  const reciprocal = carrierPatternCue(pattern({ deck_vz: -55 }));
  assert.notEqual(reciprocal.phase, "FINAL", "an outbound aircraft is not called final");

  const liveCloseSnapshot = carrierPatternCue(pattern({
    mode: "FREE",
    approach: false,
    deck_along: -461,
    deck_cross: -104,
    deck_height: 85,
    deck_vx: 0,
    deck_vz: -55,
    deck_closure_kts: 106,
    indicated_airspeed_kts: 165,
  }));
  assert.equal(liveCloseSnapshot.phase, "FINAL",
    "authoritative positive closure and landing configuration must beat rounded vector ambiguity");
  assert.match(liveCloseSnapshot.instruction, /ON-SPEED AOA/);

  const liveInCloseSnapshot = carrierPatternCue(pattern({
    mode: "FREE",
    approach: true,
    deck_along: -332,
    deck_cross: -2,
    deck_height: 61,
    deck_closure_kts: 100,
    indicated_airspeed_kts: 122,
  }));
  assert.equal(liveInCloseSnapshot.phase, "FINAL",
    "in-close guidance must remain FINAL through the ramp instead of reverting to JOIN");
  assert.equal(liveInCloseSnapshot.title, "FINAL · BALL");

  const liveOverflightSnapshot = carrierPatternCue(pattern({
    mode: "FREE",
    approach: false,
    deck_along: 203,
    deck_cross: -2,
    deck_height: 59,
    deck_closure_kts: 100,
    indicated_airspeed_kts: 131,
  }));
  assert.equal(liveOverflightSnapshot.phase, "WAVE-OFF",
    "a centered, low-energy overflight must teach the missed approach, not a 350-knot join");

  const catapultDeparture = carrierPatternCue(pattern({
    mode: "FREE",
    approach: false,
    deck_along: 203,
    deck_cross: -2,
    deck_height: 59,
    deck_closure_kts: 100,
    indicated_airspeed_kts: 131,
    gear_handle: "UP",
  }));
  assert.notEqual(catapultDeparture.phase, "WAVE-OFF",
    "an UP gear handle must keep a post-catapult departure out of inferred recovery guidance");
});

test("pattern coach classifies port downwind, the 180, and waveoff from relative motion", () => {
  assert.equal(carrierPatternCue(pattern({
    deck_along: 200,
    deck_cross: -900,
    deck_vz: -70,
  })).phase, "DOWNWIND");
  assert.equal(carrierPatternCue(pattern({
    deck_along: -1500,
    deck_cross: -850,
    deck_vx: 18,
    deck_vz: -25,
  })).phase, "180");
  assert.equal(carrierPatternCue(pattern({ mode: "WAVE-OFF" })).phase, "WAVE-OFF");
});

test("on-speed AoA guidance appears only on recovery legs", () => {
  assert.equal(carrierAoARelevant("JOIN"), false);
  assert.equal(carrierAoARelevant("INITIAL"), false);
  assert.equal(carrierAoARelevant("DOWNWIND"), true);
  assert.equal(carrierAoARelevant("180"), true);
  assert.equal(carrierAoARelevant("FINAL"), true);
  assert.equal(carrierAoARelevant("WAVE-OFF"), true);
});

test("landing configuration and padlock configuration readout use actuator/downlock truth", () => {
  assert.equal(carrierLandingConfigured(pattern()), true);
  assert.equal(carrierLandingConfigured(pattern({
    gear_left_indication: "UNSAFE",
    gear_left: 0.4,
  })), false);

  const failed = carrierConfigurationCue(systemsReadout(pattern({
    gear_left_indication: "UNSAFE",
    gear_left: 0.4,
    flap_left_deg: 38,
    flap_right_deg: 24,
    flap_split: true,
  })));
  assert.equal(failed.gearLocked, false);
  assert.match(failed.gearText, /N:DN L:TR R:DN/);
  assert.equal(failed.flapText, "FLAP L:38° R:24° SPLIT");
  assert.equal(failed.flapSplit, true);

  const normal = carrierConfigurationCue(systemsReadout(pattern()));
  assert.equal(normal.gearLocked, true);
  assert.equal(normal.flapText, "FLAP 38°");
});

test("pattern qualifier rejects short phase pulses and gives lineup correction hysteresis", () => {
  const qualifier = new CarrierPatternCueQualifier({
    acquireSeconds: 0.25,
    minimumSeconds: 0.55,
  });
  const initialState = pattern({
    deck_along: -4000,
    deck_cross: 320,
    deck_height: 244,
    deck_vz: 175,
    indicated_airspeed_kts: 350,
  });
  const finalState = pattern({ mode: "APPROACH", approach: true, deck_cross: 20 });
  assert.equal(qualifier.update(initialState, 0.02).phase, "INITIAL");
  for (let index = 0; index < 20; index += 1) {
    const noisy = index % 2 === 0 ? finalState : initialState;
    assert.equal(qualifier.update(noisy, 0.02).phase, "INITIAL");
  }
  for (let index = 0; index < 13; index += 1) qualifier.update(finalState, 0.02);
  assert.equal(qualifier.current.phase, "FINAL");
  assert.equal(qualifier.current.lineup, "COME LEFT");
  assert.equal(qualifier.update({ ...finalState, deck_cross: 9 }, 0.02).lineup, "COME LEFT");
  assert.equal(qualifier.update({ ...finalState, deck_cross: 4 }, 0.02).lineup, "HOLD LINEUP");
});
