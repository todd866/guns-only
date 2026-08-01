import test from "node:test";
import assert from "node:assert/strict";
import {
  CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN,
  carrierSortieRoutePresentation,
  selectCarrierSortieNavigationPresentation,
} from "../carrier_sortie_route_presentation.js";

function routeSnapshot(overrides = {}) {
  return {
    carrier_sortie_route_active: true,
    carrier_sortie_route_profile_id: "PROVISIONAL_KOREA_CARRIER_DAY_V1",
    carrier_sortie_route_phase: "OUTBOUND",
    carrier_sortie_route_phase_code: 3,
    carrier_sortie_route_fix: "OUTBOUND",
    carrier_sortie_route_fix_code: 2,
    carrier_sortie_route_target_x: 8000,
    carrier_sortie_route_target_y: 1378,
    carrier_sortie_route_target_z: 2500,
    carrier_sortie_route_target_bearing_deg: 31.4,
    carrier_sortie_route_target_turn_deg: 12.6,
    carrier_sortie_route_distance_m: 7778.4,
    carrier_sortie_route_target_tas_mps: 154.3332,
    carrier_sortie_route_capture_radius_m: 1100,
    carrier_sortie_route_rtb_available: true,
    carrier_sortie_route_rtb_requested: false,
    ...overrides,
  };
}

test("carrier route fails closed when inactive or malformed", () => {
  assert.equal(carrierSortieRoutePresentation({}), null);
  assert.equal(carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_active: false,
  })), null);
  assert.equal(carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_phase: "RETURN",
  })), null, "contradictory phase code/token must not leak stale guidance");
  assert.equal(carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_phase: "OUT!BOUND",
  })), null, "unknown punctuation must not be repaired into a phase token");
  assert.equal(carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_distance_m: "7778.4",
  })), null, "projected numerics are not repaired from strings");
  assert.equal(carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_target_turn_deg: 181,
  })), null);
  assert.equal(carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_fix_code: 4,
    carrier_sortie_route_fix: "RETURN_INITIAL",
  })), null, "phase/fix disagreement must not become a flyable cue");
});

test("route labels stay stable for every flyable phase and fix", () => {
  const cases = [
    [1, "OnDeck", "ON DECK", 1, "Departure", "DEPARTURE", false, false],
    [2, "departure", "DEPARTURE", 1, "DEPARTURE", "DEPARTURE", true, false],
    [3, "OUTBOUND", "OUTBOUND", 2, "outbound", "OUTBOUND", true, false],
    [4, "TRANSIT", "TRANSIT", 3, "Transit", "TRANSIT", true, false],
    [5, "awaiting-return", "AWAITING RETURN", 3, "TRANSIT", "TRANSIT", true, false],
    [6, "RETURN", "RETURN", 4, "return initial", "RETURN INITIAL", true, true],
    [7, "RECOVERY", "RECOVERY", 5, "RecoveryInitial", "RECOVERY INITIAL", true, true],
    [8, "GROOVE", "GROOVE", 6, "groove", "GROOVE", true, true],
  ];

  for (const [phaseCode, phaseToken, phaseLabel, fixCode, fixToken, fixLabel,
    rtbAvailable, rtbRequested] of cases) {
    const view = carrierSortieRoutePresentation(routeSnapshot({
      carrier_sortie_route_phase_code: phaseCode,
      carrier_sortie_route_phase: phaseToken,
      carrier_sortie_route_fix_code: fixCode,
      carrier_sortie_route_fix: fixToken,
      carrier_sortie_route_rtb_available: rtbAvailable,
      carrier_sortie_route_rtb_requested: rtbRequested,
    }));
    assert.ok(view, `phase ${phaseCode} should be presentable`);
    assert.equal(view.phaseLabel, phaseLabel);
    assert.equal(view.fixLabel, fixLabel);
  }
});

test("route exposes authoritative geometry and concise flight directives", () => {
  const view = carrierSortieRoutePresentation(routeSnapshot());

  assert.equal(view.navigationSource, "route");
  assert.deepEqual(view.target, { eastM: 8000, altitudeM: 1378, northM: 2500 });
  assert.equal(view.distanceM, 7778.4);
  assert.ok(Math.abs(view.rangeNm - 4.2) < 1e-12);
  assert.equal(view.bearingDeg, 31.4);
  assert.equal(view.turnDeg, 12.6);
  assert.ok(Math.abs(view.targetKtas - 300) < 0.001);
  assert.equal(view.bearingDirective, "031°");
  assert.equal(view.distanceDirective, "4.2 NM");
  assert.equal(view.turnDirective, "R 013°");
  assert.equal(view.targetSpeedDirective, "300 KTAS");
  assert.equal(
    view.guidanceDirective,
    "OUTBOUND · BRG 031° · 4.2 NM · R 013° · 300 KTAS",
  );

  const left = carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_target_turn_deg: -15.2,
  }));
  assert.equal(left.turnDeg, -15.2);
  assert.equal(left.turnDirective, "L 015°");
});

test("AwaitingReturn publishes separate keyboard and touch RTB actions", () => {
  const awaiting = carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_phase: "AWAITING_RETURN",
    carrier_sortie_route_phase_code: 5,
    carrier_sortie_route_fix: "TRANSIT",
    carrier_sortie_route_fix_code: 3,
  }));
  assert.equal(awaiting.rtbActionRequired, true);
  assert.equal(awaiting.keyboardPrompt, "PRESS O — RETURN TO SHIP");
  assert.equal(awaiting.touchActionToken, CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN);

  const returning = carrierSortieRoutePresentation(routeSnapshot({
    carrier_sortie_route_phase: "RETURN",
    carrier_sortie_route_phase_code: 6,
    carrier_sortie_route_fix: "RETURN_INITIAL",
    carrier_sortie_route_fix_code: 4,
    carrier_sortie_route_rtb_requested: true,
  }));
  assert.equal(returning.rtbActionRequired, false);
  assert.equal(returning.keyboardPrompt, null);
  assert.equal(returning.touchActionToken, null);
});

test("navigation precedence is route, Mesh, then Home Plate", () => {
  const mesh = Object.freeze({ active: true, displayName: "MESH DEST" });
  const home = Object.freeze({ recoveryPointKnown: true, displayName: "HOME" });

  const routeSelected = selectCarrierSortieNavigationPresentation(
    routeSnapshot(),
    { mesh, home },
  );
  assert.equal(routeSelected.source, "route");
  assert.equal(routeSelected.presentation.fixLabel, "OUTBOUND");

  const meshSelected = selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: false },
    { mesh, home },
  );
  assert.deepEqual(meshSelected, { source: "mesh", presentation: mesh });

  const homeSelected = selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: false },
    { home },
  );
  assert.deepEqual(homeSelected, { source: "home", presentation: home });

  assert.equal(selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: false },
    {},
  ), null);
  assert.equal(selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: false },
    null,
  ), null);
});

test("an active malformed route blocks stale Mesh and home fallback", () => {
  const selected = selectCarrierSortieNavigationPresentation(
    routeSnapshot({ carrier_sortie_route_target_tas_mps: Number.NaN }),
    {
      mesh: { active: true, displayName: "STALE MESH DEST" },
      home: { recoveryPointKnown: true, displayName: "STALE HOME" },
    },
  );
  assert.equal(selected, null);

  assert.equal(selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: "true" },
    {
      mesh: { active: true },
      home: { recoveryPointKnown: true },
    },
  ), null);
});
