import assert from "node:assert/strict";
import test from "node:test";
import {
  clearanceForBalance,
  rapierEconomyPresentation,
} from "../points_ledger.js";

test("clearance thresholds", () => {
  assert.equal(clearanceForBalance(0), "CLEARED");
  assert.equal(clearanceForBalance(-1), "DEFERRED");
  assert.equal(clearanceForBalance(-150), "DEFERRED");
  assert.equal(clearanceForBalance(-151), "GROUNDED");
});

test("Rapier contract and recovery slip formats allocation credits", () => {
  const slip = rapierEconomyPresentation({
    finished: true,
    rapier_economy_active: true,
    rapier_economy_sortie_net_credits: 70,
    rapier_economy_lines: [
      { category: "CONTRACT", code: "TARGET_NEUTRALIZED", label: "Balloon contract", credits: 90 },
      { category: "RECOVERY", code: "ASSET_RETURNED", label: "Rapier returned", credits: 20 },
      { category: "CONSUMABLE", code: "FUEL", label: "Fuel consumed", credits: -40 },
    ],
  }, 0);
  assert.equal(slip.kicker, "Rapier budget posted");
  assert.equal(slip.netText, "Sortie net · +70 CR");
  assert.equal(slip.balanceText, "Rapier balance · +70 CR");
  assert.equal(slip.clearanceText, "Operating budget positive");
  assert.equal(slip.lines[0].creditsText, "+90 CR");
});

test("allocation exception phrasing follows a confirmed loss", () => {
  const slip = rapierEconomyPresentation({
    finished: true,
    rapier_economy_active: true,
    rapier_economy_sortie_net_credits: -720,
    rapier_economy_lines: [
      { category: "LOSS", code: "AIRFRAME_LOST", label: "Confirmed Rapier loss reserve", credits: -700 },
      { category: "CONSUMABLE", code: "FUEL", label: "Fuel consumed", credits: -20 },
    ],
  }, 0);
  assert.equal(slip.clearance, "GROUNDED");
  assert.match(slip.clearanceText, /exception required/i);
});

test("arcade finished sorties never receive a Rapier budget slip", () => {
  assert.equal(rapierEconomyPresentation({
    finished: true,
    rapier_economy_active: false,
    rapier_economy_sortie_net_credits: 999,
    rapier_economy_lines: [
      { category: "CONTRACT", code: "TARGET_NEUTRALIZED", credits: 999 },
    ],
  }, 0), null);
});
