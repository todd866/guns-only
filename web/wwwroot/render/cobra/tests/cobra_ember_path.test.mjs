import assert from "node:assert/strict";
import test from "node:test";
import {
  EMBER_GATE_VISUAL_HALF_M,
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
  // Visual half is capped — authored 155 m must never reach the scene as a UFO diamond.
  assert.ok(state.approach_gates[0].half_m <= EMBER_GATE_VISUAL_HALF_M);
  assert.ok(state.approach_gates[1].half_m <= EMBER_GATE_VISUAL_HALF_M * 1.2);
  assert.ok(
    state.approach_gates[1].half_m > state.approach_gates[0].half_m,
    "active gate should read larger than spent trail gates",
  );
});

test("ember path drops far-behind gates so the gorge stays clear", () => {
  const state = emberPathGuidanceState({
    path_gates: [
      { east_m: -6500, up_m: 190, north_m: -6200, half_m: 155, active: false },
      { east_m: -5200, up_m: 180, north_m: -4800, half_m: 155, active: false },
      { east_m: -4000, up_m: 160, north_m: -2000, half_m: 155, active: true },
      { east_m: -2710, up_m: 146, north_m: -500, half_m: 155, active: false },
    ],
  });
  assert.equal(state.approach_gate_count, 3);
  assert.equal(state.approach_gates[0].east_m, -5200);
  assert.equal(state.approach_gates.find((gate) => gate.active).east_m, -4000);
});

test("empty gates hide the path", () => {
  const state = emberPathGuidanceState({ path_gates: [] });
  assert.equal(state.approach_guidance_active, false);
  assert.equal(state.approach_gate_count, 0);
});

test("pad-centred gates stay dark while ownship is still on Camp Ember", () => {
  const state = emberPathGuidanceState({
    path_gates: [
      { east_m: -6775, up_m: 246, north_m: -6200, half_m: 90, active: true },
      { east_m: -6500, up_m: 190, north_m: -6200, half_m: 155, active: false },
    ],
    vehicle: { x_m: -6775, z_m: -6200 },
    ground_war: { fob: { x_m: -6775, z_m: -6200 } },
  });
  assert.equal(state.approach_gate_count, 1);
  assert.equal(state.approach_gates[0].east_m, -6500);
  assert.equal(state.approach_gates[0].active, false);
});

test("act overlays cover the Ember Run spine", () => {
  assert.match(emberActObjectiveOverlay("depart").line, /DEPART CAMP EMBER/);
  assert.match(emberActObjectiveOverlay("ingress").line, /INGRESS/);
  assert.match(emberActObjectiveOverlay("engage").line, /ENGAGE/);
  assert.match(emberActObjectiveOverlay("rtb").line, /RTB/);
});

test("engage and hold overlays explain the conquest that authority actually runs", () => {
  const engage = emberActObjectiveOverlay("engage");
  const hold = emberActObjectiveOverlay("hold");
  assert.match(engage.line, /BREAK HOSTILE POINTS/);
  assert.match(engage.detail, /garrison.*clear.*friendly lift/i);
  assert.match(hold.line, /POINT MAJORITY/);
  assert.match(hold.detail, /tickets bleed/i);
  assert.doesNotMatch(`${engage.line} ${engage.detail} ${hold.line} ${hold.detail}`,
    /tip control|hold 45/i,
    "mission copy may not teach the retired hidden-control rule");
});

test("ingress and rtb overlays include remaining distance when known", () => {
  assert.match(
    emberActObjectiveOverlay("ingress", { remainingM: 4200 }).line,
    /4\.2 km TO THE BRIDGE/,
  );
  assert.match(
    emberActObjectiveOverlay("rtb", { remainingM: 850 }).line,
    /850 m TO CAMP EMBER/,
  );
});
