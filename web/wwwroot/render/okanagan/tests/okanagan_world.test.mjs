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
  const scoopExit = geographicToWorld(49.875, -119.555);
  const runwayThreshold = geographicToWorld(49.9670, -119.3778);
  assert.equal(sampleHeight(scoopExit.x, scoopExit.z), 342);
  assert.equal(sampleHeight(runwayThreshold.x, runwayThreshold.z), 433);
});
