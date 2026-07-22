import assert from "node:assert/strict";
import test from "node:test";

import { mobileControlProfile } from "../mobile_control_profile.js";

test("opening F-22 fight keeps only combat controls on the phone HUD", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    bandit_alive: true,
    fight: "Neutral",
    ammo: 480,
    has_engine: true,
    carrier: false,
    has_retractable_gear: false,
    has_flaps: false,
    configuration_automatic: false,
  });

  assert.deepEqual(profile, {
    throttle: true,
    waveOff: false,
    gear: false,
    flaps: false,
    padlock: true,
    limitOverride: true,
    fire: true,
    gcasOverride: false,
  });
});

test("automatic carrier approach exposes approach actions without combat clutter", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    carrier: true,
    approach: true,
    bandit_alive: false,
    has_engine: true,
    has_retractable_gear: true,
    has_flaps: true,
    configuration_automatic: true,
  });

  assert.equal(profile.throttle, true);
  assert.equal(profile.waveOff, true);
  assert.equal(profile.padlock, true);
  assert.equal(profile.gear, false);
  assert.equal(profile.flaps, false);
  assert.equal(profile.limitOverride, false);
  assert.equal(profile.fire, false);
});

test("manual system controls appear only when the pilot owns configuration", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    carrier: true,
    mode: "FREE",
    bandit_alive: false,
    has_retractable_gear: true,
    has_flaps: true,
    configuration_automatic: false,
  });

  assert.equal(profile.gear, true);
  assert.equal(profile.flaps, true);
  assert.equal(profile.waveOff, false);
});

test("legacy non-carrier combat does not inherit recovery controls", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    carrier: false,
    ammo: 160,
    has_engine: true,
    has_retractable_gear: true,
    has_flaps: true,
    configuration_automatic: false,
  });

  assert.equal(profile.gear, false);
  assert.equal(profile.flaps, false);
  assert.equal(profile.fire, true);
});

test("combat layout stays stable during opponent replacement", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    carrier: false,
    bandit_alive: false,
    opponent_replacement_pending: true,
    ammo: 320,
    has_engine: true,
  });

  assert.equal(profile.padlock, true);
  assert.equal(profile.limitOverride, true);
  assert.equal(profile.fire, true);
});

test("partial state fails closed instead of advertising an unverified gun", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    carrier: false,
    has_engine: true,
  });

  assert.equal(profile.fire, false);
});

test("maintenance console owns system actions instead of duplicating the phone HUD", () => {
  const profile = mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    carrier: true,
    approach: true,
    maintenance_scenario: true,
    has_retractable_gear: true,
    has_flaps: true,
    configuration_automatic: false,
  });

  assert.equal(profile.gear, false);
  assert.equal(profile.flaps, false);
  assert.equal(profile.waveOff, true);
});

test("non-active and ownship-terminal states clear every live mobile action", () => {
  for (const lifecycle of [
    { session_phase: "PAUSED", player_terminal_state: "FLYING" },
    { session_phase: "FINISHED", player_terminal_state: "FLYING" },
    { session_phase: "ACTIVE", player_terminal_state: "DESTROYED" },
  ]) {
    const profile = mobileControlProfile({
      ...lifecycle,
      carrier: false,
      bandit_alive: true,
      ammo: 480,
      has_engine: true,
      auto_gcas_available: true,
      auto_gcas_active: true,
      pilot_control_authority_01: 1,
    });
    assert.ok(Object.values(profile).every((visible) => visible === false));
  }
});

test("Auto-GCAS paddle remains strictly contextual", () => {
  assert.equal(mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    bandit_alive: true,
    auto_gcas_available: true,
    auto_gcas_active: true,
    pilot_control_authority_01: 0.8,
  }).gcasOverride, true);
  assert.equal(mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    bandit_alive: true,
    auto_gcas_available: true,
    auto_gcas_active: true,
    pilot_control_authority_01: 0.4,
  }).gcasOverride, false);
  assert.equal(mobileControlProfile({
    session_phase: "ACTIVE",
    player_terminal_state: "FLYING",
    bandit_alive: true,
    auto_gcas_available: true,
    auto_gcas_active: false,
    auto_gcas_override_held: true,
    pilot_control_authority_01: 0.8,
  }).gcasOverride, true, "held paddle must remain under the finger until its release edge");
});
