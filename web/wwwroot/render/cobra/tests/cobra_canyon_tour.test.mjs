import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { planCobraCanyonWorld, sampleCobraCanyonTerrain } from "../cobra_canyon_plan.js";
import {
  COBRA_CANYON_TOUR_BASE_AGL_M,
  COBRA_CANYON_TOUR_CLEARANCE_MARGIN_M,
  COBRA_CANYON_TOUR_MANEUVERS,
  COBRA_CANYON_TOUR_ROTOR_RADIUS_M,
  COBRA_CANYON_TOUR_TANGENT_WINDOW_M,
  createCobraCanyonRouteSampler,
  sampleCobraCanyonTour,
} from "../cobra_canyon_tour.js";

const WORLD_FILE = new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
);

async function plan() {
  const world = JSON.parse(await readFile(WORLD_FILE, "utf8"));
  return planCobraCanyonWorld(world, { qualityTier: "mobile" });
}

function distanceToSegment(point, from, to) {
  const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const offset = [point[0] - from[0], point[1] - from[1], point[2] - from[2]];
  const lengthSquared = delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2;
  const blend = Math.max(0, Math.min(1,
    lengthSquared > 0
      ? (offset[0] * delta[0] + offset[1] * delta[1] + offset[2] * delta[2]) / lengthSquared
      : 0));
  return Math.hypot(
    point[0] - (from[0] + delta[0] * blend),
    point[1] - (from[1] + delta[1] * blend),
    point[2] - (from[2] + delta[2] * blend),
  );
}

function distanceToAabb(point, minimum, maximum) {
  return Math.hypot(
    Math.max(minimum[0] - point[0], 0, point[0] - maximum[0]),
    Math.max(minimum[1] - point[1], 0, point[1] - maximum[1]),
    Math.max(minimum[2] - point[2], 0, point[2] - maximum[2]),
  );
}

function clearanceToHazard(point, hazard) {
  const collision = hazard.collision;
  const primitiveDistanceM = collision.shape === "aabb"
    ? distanceToAabb(point, collision.minimumLocalM, collision.maximumLocalM)
    : distanceToSegment(point, collision.fromLocalM, collision.toLocalM) - collision.radiusM;
  return primitiveDistanceM - COBRA_CANYON_TOUR_ROTOR_RADIUS_M;
}

test("publishes deeply frozen, route-bounded camera maneuvers", async () => {
  const worldPlan = await plan();
  assert.equal(COBRA_CANYON_TOUR_BASE_AGL_M, 34);
  assert.equal(COBRA_CANYON_TOUR_ROTOR_RADIUS_M, 6.706);
  assert.equal(COBRA_CANYON_TOUR_CLEARANCE_MARGIN_M, 3);
  assert.equal(COBRA_CANYON_TOUR_TANGENT_WINDOW_M, 45);
  assert.ok(Object.isFrozen(COBRA_CANYON_TOUR_MANEUVERS));
  for (const route of worldPlan.routeLanes) {
    const sampler = createCobraCanyonRouteSampler(route);
    const maneuvers = COBRA_CANYON_TOUR_MANEUVERS[route.id];
    assert.equal(maneuvers.length, 2);
    assert.ok(Object.isFrozen(maneuvers));
    for (const maneuver of maneuvers) {
      assert.ok(Object.isFrozen(maneuver));
      assert.ok(Object.isFrozen(maneuver.keyframes));
      assert.ok(maneuver.keyframes.every(Object.isFrozen));
      assert.ok(maneuver.startDistanceM >= 0);
      assert.ok(maneuver.endDistanceM < sampler.lengthM);
      assert.match(maneuver.id, /^tour\.cobra-canyon\..+\.v1$/);
      assert.match(maneuver.cue, / \/ /);
    }
  }
});

test("samples exact keyframes, clamps open-route distance, and reuses a caller target", async () => {
  const worldPlan = await plan();
  const target = {};
  for (const route of worldPlan.routeLanes) {
    const { lengthM } = createCobraCanyonRouteSampler(route);
    for (const maneuver of COBRA_CANYON_TOUR_MANEUVERS[route.id]) {
      for (const keyframe of maneuver.keyframes) {
        const sampled = sampleCobraCanyonTour(route.id, keyframe.distanceM, lengthM, target);
        assert.equal(sampled, target);
        const actual = maneuver.axis === "agl" ? sampled.commandedAglM : sampled.lateralOffsetM;
        assert.ok(Math.abs(actual - keyframe.value) < 1e-9, maneuver.id);
      }
    }
    assert.equal(sampleCobraCanyonTour(route.id, lengthM + 25, lengthM, target).distanceM, lengthM);
    assert.equal(sampleCobraCanyonTour(route.id, -10, lengthM, target).distanceM, 0);
  }
  assert.throws(() => sampleCobraCanyonTour("route.unknown", 0, 100, target), /Unknown/);
  assert.throws(() => sampleCobraCanyonTour(worldPlan.routeLanes[0].id, 0, 0, target), /greater/);
});

test("keeps the measured camera and 6.706 m rotor envelope clear of exact hazards", async () => {
  const worldPlan = await plan();
  const routePoint = {};
  const tourPoint = {};
  for (const route of worldPlan.routeLanes) {
    const sampler = createCobraCanyonRouteSampler(route);
    let minimumTerrainClearanceM = Infinity;
    let minimumObstacleClearanceM = Infinity;
    let previousEastM = null;
    let previousNorthM = null;
    for (let distanceM = 0; distanceM <= sampler.lengthM; distanceM += 0.25) {
      sampler.sample(distanceM, routePoint);
      sampleCobraCanyonTour(route.id, distanceM, sampler.lengthM, tourPoint);
      const eastM = routePoint.eastM + routePoint.tangentNorth * tourPoint.lateralOffsetM;
      const northM = routePoint.northM - routePoint.tangentEast * tourPoint.lateralOffsetM;
      const aglM = COBRA_CANYON_TOUR_BASE_AGL_M + tourPoint.aglOffsetM;
      const point = [eastM, sampleCobraCanyonTerrain(worldPlan, eastM, northM) + aglM, northM];
      if (previousEastM !== null) {
        assert.ok(
          Math.hypot(eastM - previousEastM, northM - previousNorthM) < 0.5,
          `${route.id} offset path must remain continuous near ${distanceM.toFixed(2)} m`,
        );
      }
      previousEastM = eastM;
      previousNorthM = northM;
      minimumTerrainClearanceM = Math.min(
        minimumTerrainClearanceM,
        aglM - COBRA_CANYON_TOUR_ROTOR_RADIUS_M,
      );
      for (const hazard of worldPlan.hazards) {
        minimumObstacleClearanceM = Math.min(
          minimumObstacleClearanceM,
          clearanceToHazard(point, hazard),
        );
      }
    }
    assert.ok(
      minimumTerrainClearanceM >= COBRA_CANYON_TOUR_CLEARANCE_MARGIN_M,
      `${route.id} terrain clearance ${minimumTerrainClearanceM.toFixed(3)} m`,
    );
    assert.ok(
      minimumObstacleClearanceM >= COBRA_CANYON_TOUR_CLEARANCE_MARGIN_M,
      `${route.id} obstacle clearance ${minimumObstacleClearanceM.toFixed(3)} m`,
    );
  }
});
