import assert from "node:assert/strict";
import test from "node:test";

import {
  arrivalFuelStatePresentation,
  limitsPanelPresentation,
  navigationRateReadout,
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

test("Rapier nav panel is FUEL · triad · ARR→next physical state", () => {
  const panel = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 2619,
    fuel_capacity_lb: 9920,
    fuel_bingo_lb: 1000,
    fuel_minimum_lb: 900,
    fuel_emergency_lb: 550,
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
  assert.equal(panel.rows.length, 5);
  assert.equal(panel.rows[0].label, "FUEL");
  assert.equal(panel.rows[0].value, "2619");
  assert.equal(panel.rows[0].unit, "LB");
  assert.equal(panel.rows[1].label, "NM/MIN");
  assert.equal(panel.rows[2].label, "LB/MIN");
  assert.equal(panel.rows[3].label, "LB/NM");
  assert.equal(panel.rows[4].label, "ARR MIN");
  assert.equal(panel.rows[4].unit, "MIN");
  assert.equal(panel.rows[1].value, "36.0");
  assert.equal(panel.rows[2].value, "75");
  assert.equal(panel.rows[3].value, "2.08");
  // (2556.5 - 900) / 75 ≈ 22.1 → 22
  assert.equal(panel.rows[4].value, "22");
  assert.equal(panel.heroIndex, 4);
  assert.equal(panel.arrivalNextState, "min");
  assert.equal(panel.accent, "normal");
});

test("the Rapier rate triad is shared by F-22, F-14, and other recovery-capable aircraft", () => {
  for (const aircraft of [
    { player_aircraft_id: "f-22a", fuel_capacity_lb: 18_000 },
    { player_aircraft_id: "f-14a", fuel_capacity_lb: 16_000 },
    { player_aircraft_id: "f-86f", fuel_capacity_lb: 2_826 },
  ]) {
    const rate = navigationRateReadout({
      ...aircraft,
      recovery_point_known: true,
      ground_speed_kts: 480,
      fuel_flow_pph: 4_800,
    });
    assert.deepEqual(rate, {
      nmPerMin: 8,
      lbPerMin: 80,
      lbPerNm: 10,
      text: "NAV 8.0 NM/MIN · 80 LB/MIN · 10.00 LB/NM",
      compactText: "8.0NM/MIN·80LB/MIN·10.0LB/NM",
    }, aircraft.player_aircraft_id);
  }
  assert.equal(navigationRateReadout({ ground_speed_kts: 480, fuel_flow_pph: 4_800 }), null,
    "no known recovery point means no invented navigation triad");
});

test("arrival hero flips MIN → EMER → DRY", () => {
  const toMin = arrivalFuelStatePresentation({
    fuelOnArrivalLb: 1200,
    lbPerMin: 60,
    minimumLb: 900,
    emergencyLb: 550,
  });
  assert.equal(toMin.label, "ARR MIN");
  assert.equal(toMin.nextState, "min");
  assert.ok(Math.abs(toMin.minutes - 5) < 0.01);

  const toEmer = arrivalFuelStatePresentation({
    fuelOnArrivalLb: 700,
    lbPerMin: 50,
    minimumLb: 900,
    emergencyLb: 550,
  });
  assert.equal(toEmer.label, "ARR EMER");
  assert.equal(toEmer.nextState, "emer");
  assert.ok(Math.abs(toEmer.minutes - 3) < 0.01);

  const toDry = arrivalFuelStatePresentation({
    fuelOnArrivalLb: 200,
    lbPerMin: 40,
    minimumLb: 900,
    emergencyLb: 550,
  });
  assert.equal(toDry.label, "ARR DRY");
  assert.equal(toDry.nextState, "dry");
  assert.ok(Math.abs(toDry.minutes - 5) < 0.01);
});

test("steep climb consumes authoritative ETA and arrival fuel instead of TAS", () => {
  const closureEta = 200 / (50 * 1.94384) * 60;
  const fuelToHome = 16200 * closureEta / 60;
  const slowClose = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 2000,
    fuel_flow_pph: 16200,
    fuel_minimum_lb: 1000,
    fuel_emergency_lb: 550,
    ground_speed_kts: 400,
    true_airspeed_kts: 2400,
    rtb_range_nm: 200,
    rtb_bearing_deg: 0,
    rtb_closure_kts: 50 * 1.94384,
    rtb_eta_min: closureEta,
    fuel_to_home_estimate_lb: fuelToHome,
    fuel_on_arrival_estimate_lb: 2000 - fuelToHome,
    fuel_reserve_target_lb: 1000,
    fuel_reserve_margin_lb: 1000 - fuelToHome,
  });
  const tasWouldEta = 200 / 2400 * 60; // 5 min if TAS
  assert.ok(slowClose.etaMinutes > tasWouldEta * 5);
  assert.ok(Math.abs(slowClose.etaMinutes - closureEta) < 1);
  assert.equal(slowClose.accent, "fault");
  assert.equal(slowClose.rows[4].label, "ARR DRY");
  assert.ok(Number(slowClose.rows[4].value) < 0);
});

test("slowing down improves LB/NM and arrival minutes to MIN", () => {
  const base = {
    recovery_point_known: true,
    fuel_lb: 3000,
    fuel_flow_pph: 12000,
    fuel_minimum_lb: 1000,
    fuel_emergency_lb: 550,
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
  assert.ok(Number(slow.rows[3].value) < Number(fast.rows[3].value));
  assert.ok(Number(slow.rows[4].value) > Number(fast.rows[4].value));
});

test("Rapier CMC stagnation overage forces fault accent on nav panel", () => {
  const panel = limitsPanelPresentation({
    rapier_mission_available: true,
    recovery_point_known: true,
    fuel_lb: 4000,
    fuel_flow_pph: 3000,
    fuel_minimum_lb: 900,
    fuel_emergency_lb: 550,
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

test("outbound keeps FUEL + triad with ARR blank when arrival undefended", () => {
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
  assert.equal(outbound.travelState, "outbound");
  assert.equal(outbound.etaMinutes, null);
  assert.equal(outbound.fuelOnArrivalLb, null);

  const panel = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 7000,
    fuel_capacity_lb: 18000,
    fuel_bingo_lb: 4000,
    fuel_minimum_lb: 2100,
    fuel_emergency_lb: 550,
    fuel_flow_pph: 9000,
    ground_speed_kts: 1200,
    rtb_closure_kts: -240,
    rtb_eta_min: null,
    fuel_reserve_target_lb: 4000,
  });
  assert.equal(panel.profile, "nav");
  assert.equal(panel.rows[0].label, "FUEL");
  assert.equal(panel.rows[0].value, "7000");
  assert.equal(panel.rows[4].value, "--");
  assert.equal(panel.etaMinutes, null);
  assert.equal(panel.fuelRequiredLb, null);
});

test("arrival under emergency marks ARR DRY and faults", () => {
  const panel = limitsPanelPresentation({
    recovery_point_known: true,
    fuel_lb: 5000,
    fuel_capacity_lb: 18000,
    fuel_bingo_lb: 4000,
    fuel_minimum_lb: 4500,
    fuel_emergency_lb: 4200,
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
  assert.equal(panel.rows[4].label, "ARR DRY");
  assert.ok(Number(panel.rows[4].value) >= 0);
});
