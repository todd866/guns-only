import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOkanaganSurfaceSampler,
  geographicToWorld,
  isAgriculturePoint,
  okanaganForestStandChance,
  okanaganGroundCoverShade,
  okanaganIncidentTimberPoints,
} from "../okanagan_world.js";

const pack = new URL("../../../content/packs/okanagan-fire/environment/", import.meta.url);

test("the rendered CDEM is flattened under the scoop lane and Kelowna runway", async () => {
  const [terrainData, worldData] = await Promise.all([
    readFile(new URL("okanagan-central.cdem.json", pack), "utf8").then(JSON.parse),
    readFile(new URL("okanagan-central.world.json", pack), "utf8").then(JSON.parse),
  ]);
  const sampleHeight = createOkanaganSurfaceSampler(terrainData, worldData);
  const scoopExit = geographicToWorld(49.875, -119.515);
  const formerHandDrawnLane = geographicToWorld(49.875, -119.555);
  const runwayThreshold = geographicToWorld(49.9670, -119.3778);
  assert.equal(sampleHeight(scoopExit.x, scoopExit.z), 342);
  assert.notEqual(sampleHeight(formerHandDrawnLane.x, formerHandDrawnLane.z), 342);
  assert.equal(sampleHeight(runwayThreshold.x, runwayThreshold.z), 433);
});

test("the scenery pack carries official shoreline resolution and recognizable valley landmarks", async () => {
  const world = JSON.parse(await readFile(new URL("okanagan-central.world.json", pack), "utf8"));
  assert.equal(world.sources.shoreline, "British Columbia Freshwater Atlas Lakes");
  assert.ok(world.lake.shoreline.length >= 100, "the lake must not regress to a hand-drawn strip");
  assert.ok(world.roads.some((road) => road.id === "highway-97" && road.points.length >= 12));
  assert.deepEqual(world.agriculture.map((zone) => zone.id), [
    "ellison", "rutland", "east-kelowna", "west-bench",
  ]);
  assert.ok(world.agriculture.every((zone) => zone.epistemic === "surrogate"));
  const highway = world.roads.find((road) => road.id === "highway-97");
  const waterPoints = highway.points.filter((point) => pointInPolygon(point, world.lake.shoreline));
  assert.deepEqual(waterPoints, [[-119.516, 49.8875]],
    "only the William R. Bennett Bridge span may cross open water");
});

test("agricultural scenery masks honour each authored rotation", () => {
  const world = {
    agriculture: [{
      latitude: 49.88,
      longitude: -119.50,
      radiusXM: 2_000,
      radiusZM: 500,
      rotationDeg: 90,
    }],
  };
  assert.equal(isAgriculturePoint(world, 0, 1_500), true,
    "the long local-X axis must rotate onto world Z");
  assert.equal(isAgriculturePoint(world, 1_500, 0), false,
    "world X must use the rotated short axis");
});

test("the west-side fire bench is wooded enough to read as timber, not bare dirt", () => {
  const emptyWorld = { agriculture: [], communities: [] };
  const fire = geographicToWorld(49.850, -119.655);
  const lakeJoin = geographicToWorld(49.935, -119.492);
  assert.ok(okanaganForestStandChance(fire.x, fire.z, 810, emptyWorld) >= 0.72);
  assert.ok(
    okanaganForestStandChance(fire.x, fire.z, 810, emptyWorld)
      > okanaganForestStandChance(lakeJoin.x + 8_000, lakeJoin.z, 810, emptyWorld),
    "the incident bench must be denser than far open valley",
  );
});

test("the fire bench is a dedicated timber stand, not leftover valley samples", () => {
  const fire = geographicToWorld(49.850, -119.655);
  const points = okanaganIncidentTimberPoints(80);
  assert.equal(points.length, 80);
  assert.ok(points.every((point) => Math.hypot(point.x - fire.x, point.z - fire.z) <= 2_400));
  const nearest = Math.min(...points.map((point) => Math.hypot(point.x - fire.x, point.z - fire.z)));
  assert.ok(nearest < 400, "some stems must sit on the published flank");
});

test("the fire bench ground reads as timber, not bunchgrass", () => {
  const fire = geographicToWorld(49.850, -119.655);
  const lakeJoin = geographicToWorld(49.935, -119.492);
  const bench = okanaganGroundCoverShade(fire.x, fire.z, 810);
  const valley = okanaganGroundCoverShade(lakeJoin.x + 8_000, lakeJoin.z, 810);
  assert.ok(bench.g < valley.g, "the incident bench must be darker fir, not dry grass");
  assert.ok(bench.r < 0.45);
});

function pointInPolygon([longitude, latitude], shoreline) {
  let inside = false;
  for (let index = 0, previous = shoreline.length - 1; index < shoreline.length; previous = index++) {
    const [xi, yi] = shoreline[index];
    const [xj, yj] = shoreline[previous];
    if (((yi > latitude) !== (yj > latitude))
      && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
