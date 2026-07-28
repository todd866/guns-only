import assert from "node:assert/strict";
import test from "node:test";

import {
  limitsPanelPresentation,
  recoveryNavigationPresentation,
} from "../limits_panel.js";

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
    recovery_point_known: true,
    fuel_lb: 2619,
    fuel_capacity_lb: 9920,
    fuel_bingo_lb: 1000,
    fuel_flow_pph: 4500,
    ground_speed_kts: 2160,
    true_airspeed_kts: 2160,
    rtb_range_nm: 30,
    rtb_bearing_deg: 176,
    rtb_closure_kts: 2160,
    rtb_eta_min: 30 / 2160 * 60,
    fuel_to_home_estimate_lb: 62.5,
    fuel_on_arrival_estimate_lb: 2556.5,
    fuel_reserve_target_lb: 1000,
    fuel_reserve_margin_lb: 1556.5,
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
  assert.equal(panel.reserveMarginLb, 1556.5);
  assert.equal(panel.accent, "normal");
});

test("steep climb consumes authoritative ETA and reserve instead of TAS", () => {
  const closureEta = 200 / (50 * 1.94384) * 60;
  const slowClose = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 2000,
    fuel_flow_pph: 16200,
    ground_speed_kts: 400,
    true_airspeed_kts: 2400,
    rtb_range_nm: 200,
    rtb_bearing_deg: 0,
    rtb_closure_kts: 50 * 1.94384,
    rtb_eta_min: closureEta,
    fuel_to_home_estimate_lb: 16200 * closureEta / 60,
    fuel_on_arrival_estimate_lb: 2000 - 16200 * closureEta / 60,
    fuel_reserve_target_lb: 1000,
    fuel_reserve_margin_lb: 1000 - 16200 * closureEta / 60,
  });
  const tasWouldEta = 200 / 2400 * 60; // 5 min if TAS
  assert.ok(slowClose.etaMinutes > tasWouldEta * 5);
  assert.ok(Math.abs(slowClose.etaMinutes - closureEta) < 1);
  assert.equal(slowClose.accent, "fault");
  assert.ok(Number(slowClose.rows[3].value) < 0);
});

test("slowing down improves LB/NM and reserve minutes", () => {
  // Same geometry; lower specific burn at the slower speed (the trade the triad teaches).
  const base = {
    recovery_point_known: true,
    fuel_lb: 3000,
    fuel_flow_pph: 12000,
    ground_speed_kts: 1800,
    true_airspeed_kts: 1800,
    rtb_range_nm: 100,
    rtb_bearing_deg: 0,
    rtb_closure_kts: 1800,
    rtb_eta_min: 100 / 1800 * 60,
    fuel_to_home_estimate_lb: 12000 * (100 / 1800),
    fuel_on_arrival_estimate_lb: 3000 - 12000 * (100 / 1800),
    fuel_reserve_target_lb: 1000,
    fuel_reserve_margin_lb: 2000 - 12000 * (100 / 1800),
  };
  const fast = limitsPanelPresentation(base);
  const slow = limitsPanelPresentation({
    ...base,
    fuel_flow_pph: 4000,
    ground_speed_kts: 900,
    true_airspeed_kts: 900,
    rtb_closure_kts: 900,
    rtb_eta_min: 100 / 900 * 60,
    fuel_to_home_estimate_lb: 4000 * (100 / 900),
    fuel_on_arrival_estimate_lb: 3000 - 4000 * (100 / 900),
    fuel_reserve_margin_lb: 2000 - 4000 * (100 / 900),
  });
  assert.ok(Number(slow.rows[2].value) < Number(fast.rows[2].value));
  assert.ok(Number(slow.rows[3].value) > Number(fast.rows[3].value));
});

test("Rapier CMC stagnation overage forces fault accent on nav panel", () => {
  const panel = limitsPanelPresentation({
    rapier_mission_available: true,
    recovery_point_known: true,
    fuel_lb: 4000,
    fuel_flow_pph: 3000,
    ground_speed_kts: 600,
    true_airspeed_kts: 600,
    rtb_range_nm: 50,
    rtb_bearing_deg: 90,
    rtb_closure_kts: 600,
    rtb_eta_min: 5,
    fuel_to_home_estimate_lb: 250,
    fuel_on_arrival_estimate_lb: 3750,
    fuel_reserve_target_lb: 1000,
    fuel_reserve_margin_lb: 2750,
    rapier_cmc_margin_c: -150,
  });
  assert.equal(panel.profile, "nav");
  assert.equal(panel.accent, "fault");
});

test("absent fuel hides the panel", () => {
  assert.equal(limitsPanelPresentation({}), null);
});

test("pre-snapshot null and primitive states fail closed", () => {
  for (const state of [undefined, null, false, 0, ""]) {
    const navigation = recoveryNavigationPresentation(state);
    assert.equal(navigation.recoveryPointKnown, false);
    assert.equal(navigation.travelState, "unavailable");
    assert.equal(navigation.rangeNm, null);
    assert.equal(navigation.etaMinutes, null);
    assert.equal(navigation.fuelToHomeLb, null);
    assert.equal(navigation.reserveMarginLb, null);
    assert.equal(limitsPanelPresentation(state), null);
  }
});

test("outbound and abeam recovery states remain explicit with no TAS fallback", () => {
  const outbound = recoveryNavigationPresentation({
    recovery_point_known: true,
    rtb_range_nm: 80,
    rtb_bearing_deg: 270,
    rtb_closure_kts: -240,
    rtb_eta_min: null,
    fuel_to_home_estimate_lb: null,
    fuel_on_arrival_estimate_lb: null,
    fuel_reserve_target_lb: 4000,
    fuel_reserve_margin_lb: null,
    true_airspeed_kts: 1500,
    ground_speed_kts: 1200,
    fuel_flow_pph: 9000,
  });
  const abeam = recoveryNavigationPresentation({
    recovery_point_known: true,
    rtb_range_nm: 80,
    rtb_bearing_deg: 270,
    rtb_closure_kts: 0.4,
    rtb_eta_min: null,
    fuel_to_home_estimate_lb: null,
    fuel_on_arrival_estimate_lb: null,
    fuel_reserve_target_lb: 4000,
    fuel_reserve_margin_lb: null,
    true_airspeed_kts: 1500,
  });

  assert.equal(outbound.travelState, "outbound");
  assert.equal(abeam.travelState, "abeam");
  assert.equal(outbound.etaMinutes, null);
  assert.equal(outbound.fuelToHomeLb, null);
  assert.equal(outbound.fuelOnArrivalLb, null);
  assert.equal(outbound.reserveMarginLb, null);

  const panel = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 7000,
    fuel_capacity_lb: 18000,
    fuel_bingo_lb: 4000,
    fuel_flow_pph: 9000,
    ground_speed_kts: 1200,
    rtb_closure_kts: -240,
    rtb_eta_min: null,
    fuel_reserve_target_lb: 4000,
  });
  assert.equal(panel.profile, "nav");
  assert.equal(panel.rows[3].value, "--");
  assert.equal(panel.etaMinutes, null);
  assert.equal(panel.fuelRequiredLb, null);
});

test("protected reserve margin, not merely fuel left after the leg, owns the warning", () => {
  const panel = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 5000,
    fuel_capacity_lb: 18000,
    fuel_bingo_lb: 4000,
    fuel_flow_pph: 6000,
    ground_speed_kts: 600,
    rtb_closure_kts: 600,
    rtb_eta_min: 10,
    fuel_to_home_estimate_lb: 1000,
    fuel_on_arrival_estimate_lb: 4000,
    fuel_reserve_target_lb: 4500,
    fuel_reserve_margin_lb: -500,
  });

  assert.equal(panel.accent, "fault");
  assert.equal(panel.reserveMarginLb, -500);
  assert.ok(Number(panel.rows[3].value) < 0);
});
