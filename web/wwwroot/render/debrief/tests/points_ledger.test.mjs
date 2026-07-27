import assert from "node:assert/strict";
import test from "node:test";
import {
  clearanceForBalance,
  pointsLedgerPresentation,
} from "../points_ledger.js";

test("clearance thresholds", () => {
  assert.equal(clearanceForBalance(0), "CLEARED");
  assert.equal(clearanceForBalance(-1), "DEFERRED");
  assert.equal(clearanceForBalance(-150), "DEFERRED");
  assert.equal(clearanceForBalance(-151), "GROUNDED");
});

test("kill and trap slip formats municipal copy", () => {
  const slip = pointsLedgerPresentation({
    finished: true,
    points_sortie_net: 70,
    points_lines: [
      { code: "KILL", label: "Verified splash", points: 100 },
      { code: "RECOVERY", label: "Clean recovery", points: 50 },
      { code: "FUEL", label: "Fuel burned", points: -80 },
    ],
  }, 0);
  assert.equal(slip.kicker, "Allocation posted");
  assert.equal(slip.netText, "Sortie net · +70");
  assert.equal(slip.balanceText, "Balance · 70");
  assert.equal(slip.clearanceText, "Norm fulfilled · cleared");
  assert.equal(slip.lines[0].pointsText, "+100");
});

test("grounded phrasing after loss", () => {
  const slip = pointsLedgerPresentation({
    finished: true,
    points_sortie_net: -210,
    points_lines: [
      { code: "LOSS", label: "Asset not returned", points: -200 },
      { code: "FUEL", label: "Fuel burned", points: -10 },
    ],
  }, 0);
  assert.equal(slip.clearance, "GROUNDED");
  assert.match(slip.clearanceText, /Exception denied/);
});
