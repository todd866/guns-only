import test from "node:test";
import assert from "node:assert/strict";
import {
  CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN,
} from "../carrier_sortie_route_presentation.js";
import {
  syncCarrierSortieTouchRtbControl,
} from "../carrier_sortie_touch_control.js";

function routeSnapshot(overrides = {}) {
  return {
    carrier_sortie_route_active: true,
    carrier_sortie_route_profile_id: "PROVISIONAL_KOREA_CARRIER_DAY_V1",
    carrier_sortie_route_phase: "AWAITING_RETURN",
    carrier_sortie_route_phase_code: 5,
    carrier_sortie_route_fix: "TRANSIT",
    carrier_sortie_route_fix_code: 3,
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

function visibleButton() {
  return { hidden: false, disabled: false };
}

function assertUnavailable(button, state) {
  const actionToken = syncCarrierSortieTouchRtbControl(button, state);
  assert.equal(actionToken, null);
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
}

test("valid AwaitingReturn exposes and enables the contextual RTB action", () => {
  const button = { hidden: true, disabled: true };

  const actionToken = syncCarrierSortieTouchRtbControl(button, routeSnapshot());

  assert.equal(actionToken, CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN);
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
});

test("Return, inactive, malformed, and null route states fail closed", () => {
  assertUnavailable(visibleButton(), routeSnapshot({
    carrier_sortie_route_phase: "RETURN",
    carrier_sortie_route_phase_code: 6,
    carrier_sortie_route_fix: "RETURN_INITIAL",
    carrier_sortie_route_fix_code: 4,
    carrier_sortie_route_rtb_requested: true,
  }));
  assertUnavailable(visibleButton(), { carrier_sortie_route_active: false });
  assertUnavailable(visibleButton(), routeSnapshot({
    carrier_sortie_route_phase: "RETURN",
  }));
  assertUnavailable(visibleButton(), routeSnapshot({
    carrier_sortie_route_rtb_available: "true",
  }));
  assertUnavailable(visibleButton(), null);
});

test("the action token remains available to integration without a mounted button", () => {
  assert.equal(
    syncCarrierSortieTouchRtbControl(null, routeSnapshot()),
    CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN,
  );
});
