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
    fuel_lb: 4210,
    fuel_to_home_estimate_lb: 1240,
    fuel_on_arrival_estimate_lb: 2970,
    fuel_reserve_margin_lb: 1970,
    fuel_joker: false,
    fuel_bingo: false,
    fuel_minutes_to_joker: 9.4,
    fuel_minutes_to_bingo: 21.2,
    player_rtb_active: false,
    rtb_eta_min: 12.4,
    recovery_display_name: "CVA-31",
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

test("four rows in ANCA order, frozen", () => {
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

test("aviate hides routine manual state and shows automatic transitions or recovery", () => {
  assert.equal(aviateRow(state()), null);

  const transition = aviateRow(state({
    configuration_automatic: true,
    configuration_transition: true,
    configuration_target: "COMBAT",
    gear_handle: "UP",
    flap_left_deg: 0,
    flap_right_deg: 0,
  }));
  assert.equal(transition.tone, "active");
  assert.match(transition.line, /AUTO CONFIG/);
  assert.match(transition.line, /GEAR UP/);
  assert.match(transition.line, /FLAPS UP/);

  const recovery = aviateRow(state({
    configuration_automatic: true,
    configuration_target: "RECOVERY",
    mode: "APPROACH",
  }));
  assert.equal(recovery.tone, "steady");
  assert.match(recovery.line, /AUTO RECOVERY CONFIG/);
  assert.match(recovery.line, /GEAR DN/);
});

test("aviate does not confuse a dirty launch target with the recovery phase", () => {
  assert.equal(aviateRow(state({
    configuration_automatic: true,
    configuration_target: "RECOVERY",
    mode: "CATAPULT",
  })), null);
});

test("aviate consolidates truthful configuration exceptions", () => {
  const unsafe = aviateRow(state({
    gear_unsafe: true,
    flap_split: true,
  }));
  assert.equal(unsafe.tone, "attention");
  assert.match(unsafe.line, /GEAR UNSAFE/);
  assert.match(unsafe.line, /FLAPS SPLIT/);
});

test("aviate never fabricates for missing systems", () => {
  const row = deriveAncaView(state({
    gear_handle: undefined,
    has_flaps: false,
    flap_left_deg: undefined,
    flap_right_deg: undefined,
    checklist_active: false,
  }))
    .rows[0];
  assert.equal(row.line, "—");
  assert.equal(row.tone, "quiet");
  assert.equal(row.shown, false);
});

test("navigate hides routine burn figures and shows an active RTB projection", () => {
  assert.equal(navigateRow(state()), null);

  const rtb = navigateRow(state({ player_rtb_active: true }));
  assert.equal(rtb.tone, "steady");
  assert.match(rtb.line, /RTB CVA-31/);
  assert.match(rtb.line, /ETA 12 MIN/);
  assert.match(rtb.line, /ARR 2970 LB/);
  assert.match(rtb.line, /\+1970 LB RES/);
  assert.doesNotMatch(rtb.line, /1240 LB HOME/);
});

test("navigate keeps fuel thresholds and reserve shortfalls as open-drawer attention", () => {
  assert.equal(navigateRow(state({ fuel_joker: true })).tone, "attention");
  assert.equal(navigateRow(state({ fuel_bingo: true })).tone, "attention");
  assert.match(navigateRow(state({ fuel_bingo: true })).line, /BINGO/);
  const short = navigateRow(state({ fuel_reserve_margin_lb: -240 }));
  assert.equal(short.tone, "attention");
  assert.match(short.line, /RESERVE SHORT/);
  assert.match(short.line, /-240 LB RES/);
});

test("communicate appears only for an active automation transmission", () => {
  assert.equal(communicateRow(state()), null);
  const talking = communicateRow(state({
    radio_active: true, radio_speaker: "TOWER", radio_text: "Check gear down." }));
  assert.equal(talking.tone, "active");
  assert.equal(talking.line, "TOWER · AUTO TX");
  assert.doesNotMatch(talking.line, /Check gear down\./);
});

test("administrate shows only incomplete automatic work and makes ownership explicit", () => {
  const row = administrateRow(state());
  assert.equal(row.line, "LAUNCH · AUTO 2/4 → GEAR UP");
  assert.equal(row.tone, "active");

  const complete = administrateRow(state({
    checklist_done: 4, checklist_next: "" }));
  assert.equal(complete, null);

  const none = deriveAncaView(state({
    checklist_active: false, checklist_id: 0, checklist_total: 0 })).rows[3];
  assert.equal(none.tone, "quiet");
  assert.equal(none.line, "—");
});

test("checklist name falls back to the ordinal table when cold strings lag", () => {
  const row = administrateRow(state({ checklist_name: undefined }));
  assert.match(row.line, new RegExp(CHECKLIST_NAMES[1]));

  // Reserve consequences belong to Navigate, not a duplicate administrate task.
  assert.equal(administrateRow(state({
    checklist_name: undefined, checklist_id: 4, checklist_total: 3,
    checklist_done: 2, checklist_next: "RESERVE MARGIN",
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
