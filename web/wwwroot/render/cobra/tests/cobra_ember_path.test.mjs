import assert from "node:assert/strict";
import test from "node:test";
import {
  emberActObjectiveOverlay,
  emberPathGuidanceState,
} from "../cobra_ember_path.js";

test("ember path maps sim gates into guidance_path approach samples", () => {
  const state = emberPathGuidanceState({
    path_gates: [
      { east_m: -6500, up_m: 190, north_m: -6200, half_m: 155, active: false },
      { east_m: -2710, up_m: 146, north_m: -500, half_m: 155, active: true },
    ],
  });
  assert.equal(state.approach_guidance_active, true);
  assert.equal(state.approach_gate_count, 2);
  assert.equal(state.approach_gates[1].active, true);
  assert.equal(state.approach_gates[1].east_m, -2710);
  assert.ok(state.approach_gates[0].half_m >= 40);
});

test("empty gates hide the path", () => {
  const state = emberPathGuidanceState({ path_gates: [] });
  assert.equal(state.approach_guidance_active, false);
  assert.equal(state.approach_gate_count, 0);
});

test("act overlays cover the Ember Run spine", () => {
  assert.match(emberActObjectiveOverlay("depart").line, /DEPART CAMP EMBER/);
  assert.match(emberActObjectiveOverlay("ingress").line, /INGRESS/);
  assert.match(emberActObjectiveOverlay("engage").line, /ENGAGE/);
  assert.match(emberActObjectiveOverlay("rtb").line, /RTB/);
});
