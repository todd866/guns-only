import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKLIST_NAMES,
  administrateRow,
  aviateRow,
  closedAncaTone,
  communicateRow,
  deriveAncaView,
  navigateRow,
} from "../anca_view_model.js";

function state(overrides = {}) {
  return {
    ready: false,
    finished: false,
    visual_merge_evaluation: false,
    drone_raid_evaluation: false,
    rapier_mission_available: false,
    gear_handle: "DOWN",
    gear_unsafe: false,
    gear_warning_horn: false,
    gear_limit_exceeded: false,
    has_flaps: true,
    flap_left_deg: 30,
    flap_right_deg: 30,
    flap_limit_exceeded: false,
    flap_split: false,
    configuration_automatic: false,
    configuration_transition: false,
    configuration_target: "COMBAT",
    fuel_consumes: true,
    fuel_lb: 4210,
    fuel_to_home_estimate_lb: 1240,
    fuel_on_arrival_estimate_lb: 2970,
    fuel_reserve_margin_lb: 1970,
    fuel_joker: false,
    fuel_bingo: false,
    fuel_minimum: false,
    fuel_emergency: false,
    fuel_minutes_to_joker: 9.4,
    fuel_minutes_to_bingo: 21.2,
    recovery_point_known: false,
    player_rtb_active: false,
    rtb_bearing_deg: 247,
    rtb_range_nm: 84,
    rtb_eta_min: 12.4,
    recovery_display_name: "CVA-31",
    combat_handoff_requested: false,
    combat_handoff_active: false,
    radio_active: false,
    radio_frequency: "281.800 UHF",
    radio_channel: "TOWER",
    radio_speaker: "",
    radio_text: "",
    checklist_active: true,
    checklist_id: 1,
    checklist_done: 2,
    checklist_total: 4,
    checklist_name: "LAUNCH",
    checklist_next: "GEAR UP",
    ...overrides,
  };
}

test("four priority layers stay in ANCA order and may honestly be blank", () => {
  const view = deriveAncaView(state());
  assert.equal(view.rows.length, 4);
  assert.deepEqual(view.rows.map((row) => row.letter), ["A", "N", "C", "A"]);
  assert.deepEqual(view.shownRows.map((row) => row.key), ["administrate"]);
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.rows[0]));
  assert.ok(Object.isFrozen(view.shownRows));
});

test("panel hides on the ready and finished screens", () => {
  assert.equal(deriveAncaView(state({ ready: true })).visible, false);
  assert.equal(deriveAncaView(state({ finished: true })).visible, false);
  assert.equal(deriveAncaView(state()).visible, true);
});

test("the optional stowed control does not duplicate another surface's alarm", () => {
  assert.equal(deriveAncaView(state({ gear_unsafe: true })).tone, "quiet");
  assert.equal(deriveAncaView(state({ fuel_bingo: true })).tone, "quiet");
  assert.equal(closedAncaTone([{ tone: "attention", notify: false }]), "quiet");
  assert.equal(closedAncaTone([{ tone: "attention", notify: true }]), "attention");
});

test("dogfight Aviate is the limiting fuel horizon, not navigation arithmetic", () => {
  const normal = aviateRow(state({
    visual_merge_evaluation: true,
    fuel_minutes_to_bingo: 6.2,
  }));
  assert.equal(normal.line, "BINGO 6.2 MIN");
  assert.equal(normal.tone, "steady");

  const joker = aviateRow(state({
    visual_merge_evaluation: true,
    fuel_joker: true,
    fuel_minutes_to_bingo: 3.4,
  }));
  assert.equal(joker.line, "JOKER · BINGO 3.4 MIN");
  assert.equal(joker.tone, "attention");

  const bingo = aviateRow(state({
    visual_merge_evaluation: true,
    fuel_bingo: true,
  }));
  assert.equal(bingo.line, "BINGO · 4210 LB");
  assert.equal(bingo.tone, "attention");

  const short = aviateRow(state({
    visual_merge_evaluation: true,
    fuel_reserve_margin_lb: -240,
  }));
  assert.equal(short.line, "RESERVE SHORT 240 LB");
  assert.equal(short.tone, "attention");
});

test("long non-limiting endurance does not fill the Aviate layer", () => {
  assert.equal(aviateRow(state({
    visual_merge_evaluation: true,
    fuel_minutes_to_bingo: 48,
  })), null);
});

test("Rapier Aviate states the authored flight profile with authority as context", () => {
  const climb = aviateRow(state({
    rapier_mission_available: true,
    rapier_mission_computer_available: true,
    rapier_mission_phase: 2,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_target_mach: 0.9,
    rapier_target_altitude_ft: 56_000,
  }));
  assert.equal(climb.line, "AUTO · CLIMB · M0.90 · FL560");
  assert.equal(climb.tone, "active");

  const circuit = aviateRow(state({
    rapier_mission_available: true,
    rapier_mission_computer_available: true,
    rapier_pattern_only: true,
    rapier_mission_phase: 13,
    rapier_circuit_leg: "DOWNWIND",
    rapier_automation_enabled: true,
    rapier_automation_active: false,
    rapier_fd_target_ktas: 250,
    rapier_target_altitude_ft: 2500,
  }));
  assert.equal(circuit.line, "DIRECT · DOWNWIND · 250 KT · 2500 FT");
  assert.equal(circuit.tone, "steady");

  const failed = aviateRow(state({
    rapier_mission_available: true,
    rapier_mission_computer_available: false,
    rapier_mission_phase: 9,
  }));
  assert.equal(failed.line, "PILOT · PROFILE UNAVAILABLE");
  assert.equal(failed.tone, "attention");
});

test("immediate configuration exceptions still constrain Aviate", () => {
  const unsafe = aviateRow(state({
    gear_unsafe: true,
    flap_split: true,
  }));
  assert.equal(unsafe.tone, "attention");
  assert.match(unsafe.line, /GEAR UNSAFE/);
  assert.match(unsafe.line, /FLAPS SPLIT/);
});

test("Navigate is the home-plate vector and contains no fuel", () => {
  assert.equal(navigateRow(state()), null);

  const vector = navigateRow(state({
    visual_merge_evaluation: true,
    recovery_point_known: true,
  }));
  assert.equal(vector.line, "CVA-31 · 247° · 84 NM");
  assert.doesNotMatch(vector.line, /LB|BINGO|RES/);

  const rtb = navigateRow(state({
    visual_merge_evaluation: true,
    recovery_point_known: true,
    player_rtb_active: true,
  }));
  assert.equal(rtb.line, "CVA-31 · 247° · 84 NM · ETA 12 MIN");
});

test("Navigate gives the active raider vector during the low-level intercept", () => {
  const vector = navigateRow(state({
    drone_raid_evaluation: true,
    drone_raid_active_target: 3,
    px: 0,
    pz: 0,
    bx: 1852,
    bz: 0,
    range_m: 1852,
  }));
  assert.equal(vector.line, "RAIDER 3 · 090° · 1.0 NM");
});

test("Navigate gives Rapier the next mission vector or home vector", () => {
  const track = navigateRow(state({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    px: 0,
    pz: 0,
    rapier_guidance_x: 1852,
    rapier_guidance_z: 0,
  }));
  assert.equal(track.line, "MISSION TRACK · 090° · 1.0 NM");

  const home = navigateRow(state({
    rapier_mission_available: true,
    rapier_mission_phase: 12,
    recovery_point_known: true,
    player_rtb_active: true,
  }));
  assert.equal(home.line, "CVA-31 · 247° · 84 NM · ETA 12 MIN");
});

test("Communicate expresses coordination posture even between transmissions", () => {
  const engaging = communicateRow(state({
    visual_merge_evaluation: true,
  }));
  assert.deepEqual(engaging, {
    line: "PACKAGE · ENGAGING",
    tone: "steady",
  });

  const egressing = communicateRow(state({
    visual_merge_evaluation: true,
    combat_handoff_requested: true,
  }));
  assert.equal(egressing.line, "PACKAGE · EGRESSING");

  const transmitting = communicateRow(state({
    visual_merge_evaluation: true,
    radio_active: true,
    radio_channel: "PACKAGE",
    radio_text: "Ghost One One, engaging.",
  }));
  assert.equal(transmitting.line, "PACKAGE · ENGAGING");
  assert.equal(transmitting.tone, "steady");
  assert.doesNotMatch(transmitting.line, /Ghost One One/);
});

test("Communicate reflects Rapier airspace position", () => {
  const downwind = communicateRow(state({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_circuit_leg: "DOWNWIND",
    rapier_mission_phase: 13,
  }));
  assert.equal(downwind.line, "TOWER · DOWNWIND");

  const intercept = communicateRow(state({
    rapier_mission_available: true,
    rapier_pattern_only: false,
    rapier_mission_phase: 9,
  }));
  assert.equal(intercept.line, "CONTROL · INTERCEPTING");
});

test("Administrate exposes only checks or configuration that require verification", () => {
  const checklist = administrateRow(state());
  assert.equal(checklist.line, "LAUNCH · VERIFY 2/4 → GEAR UP");
  assert.equal(checklist.tone, "active");

  const complete = administrateRow(state({
    checklist_done: 4,
    checklist_next: "",
  }));
  assert.equal(complete, null);

  const transition = administrateRow(state({
    checklist_active: false,
    configuration_automatic: true,
    configuration_transition: true,
    configuration_target: "RECOVERY",
    mode: "CATAPULT",
    gear_handle: "UP",
    flap_left_deg: 0,
    flap_right_deg: 0,
  }));
  assert.equal(
    transition.line,
    "RECOVERY · AUTO CONFIGURING · GEAR UP · FLAPS UP",
  );

  const recovery = administrateRow(state({
    checklist_active: false,
    configuration_automatic: true,
    configuration_target: "RECOVERY",
    mode: "APPROACH",
  }));
  assert.equal(recovery.line, "RECOVERY · VERIFY · GEAR DN · FLAPS LDG");
});

test("checklist name falls back to the ordinal table and fuel stays in Aviate", () => {
  const fallback = administrateRow(state({ checklist_name: undefined }));
  assert.match(fallback.line, new RegExp(CHECKLIST_NAMES[1]));

  assert.equal(administrateRow(state({
    checklist_name: undefined,
    checklist_id: 4,
    checklist_total: 3,
    checklist_done: 2,
    checklist_next: "RESERVE MARGIN",
  })), null);
});

test("stale or missing snapshot degrades to hidden quiet rows, never throws", () => {
  const view = deriveAncaView(undefined);
  assert.equal(view.visible, false);
  assert.equal(view.shownRows.length, 0);
  for (const row of view.rows) {
    assert.equal(row.line, "—");
    assert.equal(row.tone, "quiet");
    assert.equal(row.shown, false);
  }
});
