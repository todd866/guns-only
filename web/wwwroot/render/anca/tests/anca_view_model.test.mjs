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
    has_flaps: true,
    flap_left_deg: 30,
    flap_right_deg: 30,
    fuel_lb: 4210,
    fuel_to_home_estimate_lb: 1240,
    fuel_joker: false,
    fuel_bingo: false,
    fuel_minutes_to_joker: 9.4,
    fuel_minutes_to_bingo: 21.2,
    recovery_display_name: "CVA-31",
    radio_active: false,
    radio_frequency: "281.800 UHF",
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
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.rows[0]));
});

test("panel hides on the ready and finished screens", () => {
  assert.equal(deriveAncaView(state({ ready: true })).visible, false);
  assert.equal(deriveAncaView(state({ finished: true })).visible, false);
  assert.equal(deriveAncaView(state()).visible, true);
});

test("the stowed control stays quiet for routine automation and live radio", () => {
  const routine = deriveAncaView(state());
  assert.equal(routine.tone, "quiet");
  assert.equal(closedAncaTone(routine.rows), "quiet");

  const talking = deriveAncaView(state({
    radio_active: true, radio_speaker: "TOWER", radio_text: "Check gear down.",
  }));
  assert.equal(talking.rows[2].tone, "steady");
  assert.equal(talking.tone, "quiet");
});

test("the stowed control advertises a genuine attention state", () => {
  assert.equal(deriveAncaView(state({ gear_unsafe: true })).tone, "attention");
  assert.equal(deriveAncaView(state({ fuel_bingo: true })).tone, "attention");
});

test("aviate reads config truth and flags unsafe gear", () => {
  const steady = aviateRow(state());
  assert.equal(steady.tone, "steady");
  assert.match(steady.line, /GEAR DN/);
  assert.match(steady.line, /FLAPS LDG/);

  const unsafe = aviateRow(state({ gear_unsafe: true }));
  assert.equal(unsafe.tone, "attention");
  assert.match(unsafe.line, /GEAR UNSAFE/);
});

test("aviate never fabricates for missing systems", () => {
  const row = deriveAncaView(state({ gear_handle: undefined, has_flaps: false }))
    .rows[0];
  assert.equal(row.line, "—");
  assert.equal(row.tone, "quiet");
});

test("navigate reads fuel-to-home and escalates joker then bingo", () => {
  const steady = navigateRow(state());
  assert.match(steady.line, /1240 LB HOME/);
  assert.match(steady.line, /CVA-31/);
  assert.equal(steady.tone, "steady");

  assert.equal(navigateRow(state({ fuel_joker: true })).tone, "attention");
  assert.equal(navigateRow(state({ fuel_bingo: true })).tone, "attention");
  assert.match(navigateRow(state({ fuel_bingo: true })).line, /BINGO/);
});

test("idle communicate names the channel when the wire carries one", () => {
  const named = communicateRow(state({ radio_channel: "TOWER" }));
  assert.equal(named.tone, "steady");
  assert.match(named.line, /281\.800/);
  assert.match(named.line, /TOWER/);
  assert.doesNotMatch(named.line, /MONITORING/);
});

test("communicate keeps net state instead of duplicating the radio transcript", () => {
  const quietRow = communicateRow(state());
  assert.equal(quietRow.tone, "steady");
  assert.match(quietRow.line, /281\.800/);

  const talking = communicateRow(state({
    radio_active: true, radio_speaker: "TOWER", radio_text: "Check gear down." }));
  assert.equal(talking.tone, "steady");
  assert.match(talking.line, /281\.800/);
  assert.doesNotMatch(talking.line, /Check gear down\./);
});

test("administrate shows checklist progress and next item", () => {
  const row = administrateRow(state());
  assert.match(row.line, /LAUNCH 2\/4/);
  assert.match(row.line, /GEAR UP/);
  assert.equal(row.tone, "steady");

  const complete = administrateRow(state({
    checklist_done: 4, checklist_next: "" }));
  assert.match(complete.line, /LAUNCH 4\/4/);
  assert.equal(complete.tone, "steady");

  const none = deriveAncaView(state({
    checklist_active: false, checklist_id: 0, checklist_total: 0 })).rows[3];
  assert.equal(none.tone, "quiet");
  assert.equal(none.line, "—");
});

test("checklist name falls back to the ordinal table when cold strings lag", () => {
  const row = administrateRow(state({ checklist_name: undefined }));
  assert.match(row.line, new RegExp(CHECKLIST_NAMES[1]));
  const rtb = administrateRow(state({
    checklist_name: undefined, checklist_id: 4, checklist_total: 3,
    checklist_done: 2, checklist_next: "RESERVE MARGIN" }));
  assert.match(rtb.line, /RTB 2\/3/);
  assert.match(rtb.line, /RESERVE MARGIN/);
});

test("stale or missing snapshot degrades to quiet dashes, never throws", () => {
  const view = deriveAncaView(undefined);
  assert.equal(view.visible, false);
  for (const row of view.rows) {
    assert.equal(row.line, "—");
    assert.equal(row.tone, "quiet");
  }
});
