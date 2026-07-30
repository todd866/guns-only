import assert from "node:assert/strict";
import test from "node:test";

import {
  circuitConfigurationMatches,
  hudPhasePresentation,
  rapierPhaseBand,
} from "../hud_phase.js";

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

test("Circuits keeps the director but expires normal config and fuel chrome", () => {
  const hud = hudPhasePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_mission_phase: 13,
    rapier_circuit_leg: "DOWNWIND",
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    flap_left_deg: 30,
    flap_right_deg: 30,
    fuel_lb: 9800,
    fuel_bingo_lb: 1000,
  });
  assert.equal(hud.mission, "rapier_circuits");
  assert.equal(hud.circuitLeg, "DOWNWIND");
  assert.equal(hud.surfaces.centerFdCommands, true);
  assert.equal(hud.surfaces.systemsGear, false);
  assert.equal(hud.surfaces.limitsFuel, false);
  assert.equal(hud.surfaces.cycleTeach, false);
});

test("Circuits VERIFY appears for a leg/config disagreement then expires", () => {
  const due = {
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_circuit_leg: "DOWNWIND",
    gear_nose: 0,
    gear_left: 0,
    gear_right: 0,
    flap_left_deg: 0,
    flap_right_deg: 0,
  };
  assert.equal(circuitConfigurationMatches(due), false);
  assert.equal(hudPhasePresentation(due).surfaces.systemsGear, true);

  const verified = {
    ...due,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    flap_left_deg: 30,
    flap_right_deg: 30,
  };
  assert.equal(circuitConfigurationMatches(verified), true);
  assert.equal(hudPhasePresentation(verified).surfaces.systemsGear, false);

  assert.equal(circuitConfigurationMatches({
    ...verified,
    gear_right: 0.4,
  }), false, "all three gear legs must verify down");
  assert.equal(circuitConfigurationMatches({
    ...verified,
    flap_right_deg: 0,
  }), false, "both elevons must verify down");
});

test("Circuits fuel remains latent until it is limiting", () => {
  const normal = {
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_circuit_leg: "INITIAL",
    fuel_lb: 9800,
    fuel_bingo_lb: 1000,
  };
  assert.equal(hudPhasePresentation(normal).surfaces.limitsFuel, false);
  assert.equal(hudPhasePresentation({
    ...normal,
    fuel_joker: true,
  }).surfaces.limitsFuel, true);
  assert.equal(hudPhasePresentation({
    ...normal,
    fuel_lb: 900,
  }).surfaces.limitsFuel, true);
});
