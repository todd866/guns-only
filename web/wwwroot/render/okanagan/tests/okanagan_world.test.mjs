import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOkanaganSurfaceSampler,
  geographicToWorld,
  isAgriculturePoint,
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
