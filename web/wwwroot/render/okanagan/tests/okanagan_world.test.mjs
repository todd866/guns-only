import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOkanaganSurfaceSampler,
  geographicToWorld,
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
  const highway = world.roads.find((road) => road.id === "highway-97");
  const waterPoints = highway.points.filter((point) => pointInPolygon(point, world.lake.shoreline));
  assert.deepEqual(waterPoints, [[-119.516, 49.8875]],
    "only the William R. Bennett Bridge span may cross open water");
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
