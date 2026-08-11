import assert from "node:assert/strict";
import test from "node:test";

import { KOREA_SCENERY_PROFILES } from "../korea_scenery_planner.js";
import { resolveTerrainPresentationRoute } from "../terrain_presentation_route.js";

const UKRAINE_TERRAIN_ID = "terrain.ukraine.rapier-range.atlas.v1";

test("Top Gun snapshot resolves to a supported matching atlas and scenery provider", () => {
  const state = {
    theatre_id: "theatre.top-gun.socal-training-fiction.v1",
    terrain_profile_id: UKRAINE_TERRAIN_ID,
    terrain_scenery_profile: "ukraine-modern",
    terrain_present: true,
  };
  const route = resolveTerrainPresentationRoute({
    state,
    ukraineTerrainId: UKRAINE_TERRAIN_ID,
    terrainPackId: "korea-1950s",
    selectedBeat: 0,
  });

  assert.deepEqual(route, {
    ukraineTheatre: true,
    loader: "ukraine-atlas",
    terrainId: state.terrain_profile_id,
    sceneryEra: state.terrain_scenery_profile,
  });
  assert.ok(KOREA_SCENERY_PROFILES[route.sceneryEra],
    "FlightView may only pass a known profile into the scenery runtime");
});

test("unknown terrain does not masquerade as the Ukraine loader", () => {
  const route = resolveTerrainPresentationRoute({
    state: {
      terrain_profile_id: "terrain.unknown.preview.v1",
      terrain_scenery_profile: null,
    },
    ukraineTerrainId: UKRAINE_TERRAIN_ID,
    selectedBeat: 1,
  });
  assert.equal(route.ukraineTheatre, false);
  assert.equal(route.loader, "korea-atlas");
  assert.equal(route.terrainId, "terrain.korea.central-front.v2");
  assert.equal(route.sceneryEra, "1950s");
});
