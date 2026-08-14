import assert from "node:assert/strict";
import test from "node:test";
import { cobraObjectiveCopy } from "../cobra_objective_copy.js";
import { cobraTacticalMapModel } from "../cobra_tactical_map.js";

const BOUNDS = { minEastM: 0, maxEastM: 2_000, minNorthM: 0, maxNorthM: 2_000 };
const PLAYER = { eastM: 0, northM: 0, headingRad: 0 };

function hostileSite(id, label, xM) {
  return {
    id,
    label,
    owner: "hostile",
    capture_progress: 0,
    contested: false,
    x_m: xM,
    y_m: 0,
    z_m: 0,
    capture_radius_m: 60,
  };
}

test("objective copy and map both skip a near cleared point for a farther live garrison", () => {
  const sites = [
    hostileSite("cleared", "Near Cleared", 200),
    hostileSite("garrisoned", "Far Garrison", 1_200),
  ];
  const units = [
    { id: "cleared.garrison", faction: "hostile", alive: false, x_m: 200, z_m: 0 },
    { id: "garrisoned.garrison", faction: "hostile", alive: true, x_m: 1_200, z_m: 0 },
  ];
  const war = {
    ammo_dry: false,
    ammo_bingo: false,
    tickets: { friendly: 300, hostile: 300 },
    sites,
    units,
  };

  const copy = cobraObjectiveCopy(war, { player: PLAYER });
  const map = cobraTacticalMapModel({
    sites,
    units,
    player: PLAYER,
    bounds: BOUNDS,
    widthPx: 300,
    heightPx: 300,
  });

  assert.equal(copy.line, "DESTROY GARRISON · FAR GARRISON");
  assert.match(copy.detail, /^1\.2 km — /);
  assert.equal(map.objective?.siteId, "garrisoned");
  assert.equal(map.objective?.label.toUpperCase(), "FAR GARRISON");
  assert.equal(map.objective?.rangeM, 1_200);
});
