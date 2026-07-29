import assert from "node:assert/strict";
import test from "node:test";

import { hudPhasePresentation, rapierPhaseBand } from "../hud_phase.js";

test("rapier phase bands collapse kernel phases", () => {
  assert.equal(rapierPhaseBand(4), "ascent");
  assert.equal(rapierPhaseBand(6), "lob");
  assert.equal(rapierPhaseBand(9), "intercept");
  assert.equal(rapierPhaseBand(10), "attack");
  assert.equal(rapierPhaseBand(11), "egress");
  assert.equal(rapierPhaseBand(12), "egress");
  assert.equal(rapierPhaseBand(13), "recovery");
});

test("Intercept mid-sortie gates FD, gear, and cycle teach off", () => {
  const hud = hudPhasePresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    rapier_cmc_margin_c: 800,
  });
  assert.equal(hud.mission, "rapier_intercept");
  assert.equal(hud.phaseBand, "intercept");
  assert.equal(hud.surfaces.centerFdCommands, false);
  assert.equal(hud.surfaces.systemsGear, false);
  assert.equal(hud.surfaces.cycleTeach, false);
  assert.equal(hud.surfaces.limitsFuel, true);
  assert.equal(hud.surfaces.quietLine, true);
});

test("ascent enables cycle teach; recovery enables gear", () => {
  const ascent = hudPhasePresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 4,
  });
  assert.equal(ascent.surfaces.cycleTeach, true);
  assert.equal(ascent.surfaces.systemsGear, false);

  const recovery = hudPhasePresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 13,
  });
  assert.equal(recovery.surfaces.systemsGear, true);
  assert.equal(recovery.surfaces.cycleTeach, false);
});

test("thermal OVER resurfaces cycle teach outside ascent", () => {
  const hud = hudPhasePresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    rapier_cmc_margin_c: -20,
  });
  assert.equal(hud.surfaces.cycleTeach, true);
});

test("Circuits keeps FD and gear chrome", () => {
  const hud = hudPhasePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_mission_phase: 13,
  });
  assert.equal(hud.mission, "rapier_circuits");
  assert.equal(hud.surfaces.centerFdCommands, true);
  assert.equal(hud.surfaces.systemsGear, true);
  assert.equal(hud.surfaces.cycleTeach, false);
});
