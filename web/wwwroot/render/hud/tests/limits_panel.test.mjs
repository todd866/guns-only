import assert from "node:assert/strict";
import test from "node:test";

import { limitsPanelPresentation } from "../limits_panel.js";

test("dogfight with no recovery point uses the fuel profile", () => {
  const panel = limitsPanelPresentation({
    fuel_lb: 7500,
    fuel_capacity_lb: 10000,
    fuel_bingo_lb: 4000,
    fuel_joker_lb: 6000,
    fuel_flow_pph: 5400,
    fuel_minutes_to_joker: 16.7,
    fuel_minutes_to_bingo: 38.9,
  });
  assert.equal(panel.profile, "fuel");
  assert.equal(panel.rows.length, 4);
  assert.equal(panel.rows[0].label, "FUEL");
  assert.equal(panel.rows[0].value, "7500");
  assert.equal(panel.rows[1].label, "FF");
  assert.equal(panel.rows[2].label, "JOKER");
  assert.equal(panel.rows[3].label, "BINGO");
  assert.equal(panel.heroIndex, 3);
  assert.equal(panel.accent, "normal");
});

test("Rapier with strip geometry uses nav profile and reserve to home", () => {
  const panel = limitsPanelPresentation({
    rapier_mission_available: true,
    fuel_lb: 2619,
    fuel_capacity_lb: 9920,
    fuel_bingo_lb: 1000,
    fuel_flow_pph: 4500,
    ground_speed_kts: 2160,
    true_airspeed_kts: 2160,
    rtb_range_nm: 30,
    rtb_bearing_deg: 176,
    // Flying toward home along bearing 176° at ~1111 m/s ≈ 2160 kt
    vx: Math.sin(176 * Math.PI / 180) * 1111,
    vz: Math.cos(176 * Math.PI / 180) * 1111,
  });
  assert.equal(panel.profile, "nav");
  assert.equal(panel.rows[0].label, "NM/MIN");
  assert.equal(panel.rows[1].label, "LB/MIN");
  assert.equal(panel.rows[2].label, "LB/NM");
  assert.equal(panel.rows[3].label, "RESERVE");
  assert.equal(panel.rows[3].unit, "MIN");
  assert.equal(panel.rows[0].value, "36.0");
  assert.equal(panel.rows[1].value, "75");
  // 75 / 36 ≈ 2.08
  assert.equal(panel.rows[2].value, "2.08");
  assert.ok(Number(panel.rows[3].value) > 0);
  assert.equal(panel.accent, "normal");
});

test("steep climb does not invent optimistic reserve from TAS alone", () => {
  // High TAS but only ~97 kt closing toward home — ETA must follow closure, not TAS.
  const slowClose = limitsPanelPresentation({
    rapier_mission_available: true,
    fuel_lb: 2000,
    fuel_flow_pph: 16200,
    ground_speed_kts: 400,
    true_airspeed_kts: 2400,
    rtb_range_nm: 200,
    rtb_bearing_deg: 0,
    rtb_closure_kts: 50 * 1.94384,
  });
  const tasWouldEta = 200 / 2400 * 60; // 5 min if TAS
  const closureEta = 200 / (50 * 1.94384) * 60; // ~123 min
  assert.ok(slowClose.etaMinutes > tasWouldEta * 5);
  assert.ok(Math.abs(slowClose.etaMinutes - closureEta) < 1);
  assert.equal(slowClose.accent, "fault");
  assert.ok(Number(slowClose.rows[3].value) < 0);
});

test("slowing down improves LB/NM and reserve minutes", () => {
  // Same geometry; lower specific burn at the slower speed (the trade the triad teaches).
  const base = {
    rapier_mission_available: true,
    fuel_lb: 3000,
    fuel_flow_pph: 12000,
    ground_speed_kts: 1800,
    true_airspeed_kts: 1800,
    rtb_range_nm: 100,
    rtb_bearing_deg: 0,
    vx: 0,
    vz: 1800 / 1.94384,
  };
  const fast = limitsPanelPresentation(base);
  const slow = limitsPanelPresentation({
    ...base,
    fuel_flow_pph: 4000,
    ground_speed_kts: 900,
    true_airspeed_kts: 900,
    vz: 900 / 1.94384,
  });
  assert.ok(Number(slow.rows[2].value) < Number(fast.rows[2].value));
  assert.ok(Number(slow.rows[3].value) > Number(fast.rows[3].value));
});

test("skin over forces fault accent on nav panel", () => {
  const panel = limitsPanelPresentation({
    rtb_steer: true,
    fuel_lb: 4000,
    fuel_flow_pph: 3000,
    ground_speed_kts: 600,
    true_airspeed_kts: 600,
    rtb_range_nm: 50,
    rtb_bearing_deg: 90,
    vx: 600 / 1.94384,
    vz: 0,
    rapier_thermal_margin_c: -150,
  });
  assert.equal(panel.profile, "nav");
  assert.equal(panel.accent, "fault");
});

test("absent fuel hides the panel", () => {
  assert.equal(limitsPanelPresentation({}), null);
});
