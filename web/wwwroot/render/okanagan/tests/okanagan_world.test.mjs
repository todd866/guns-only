import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  terrainHierarchy,
  createOkanaganSurfaceSampler,
  createOkanaganRawSampler,
  createOkanaganWorld,
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
  assert.equal(world.sources.shoreline, "Regional District of Central Okanagan mapped Okanagan Lake");
  assert.ok(world.lake.shoreline.length >= 100, "the lake must not regress to a hand-drawn strip");
  assert.ok(world.roads.some((road) => road.id === "highway-97" && road.paths.length >= 1));
  assert.deepEqual(world.agriculture.map((zone) => zone.id), [
    "ellison", "rutland", "east-kelowna", "west-bench",
  ]);
  assert.ok(world.agriculture.every((zone) => zone.epistemic === "surrogate"));
  assert.ok(world.peachland.buildings.length > 4_000);
  assert.ok(world.peachland.roads.some((road) => road.name === "Beach Ave"));
  assert.ok(world.peachland.roads.some((road) => road.name === "Princeton Ave"));
  assert.ok(world.peachland.parks.some((park) => park.name === "Swim Bay"));
  for (const road of world.peachland.roads.filter(r => ["Highway 97", "Beach Ave", "Princeton Ave"].includes(r.name))) {
    for (const path of road.paths) for (let i = 1; i < path.length; i++) {
      const a = geographicToWorld(path[i-1][1], path[i-1][0]);
      const b = geographicToWorld(path[i][1], path[i][0]);
      const steps = Math.max(1,Math.ceil(a.distanceTo(b)/20));
      for (let step=0;step<=steps;step++) {
        const t=step/steps;
        const point=[path[i-1][0]*(1-t)+path[i][0]*t,path[i-1][1]*(1-t)+path[i][1]*t];
        assert.equal(pointInPolygon(point,world.lake.shoreline),false,
          `${road.name} crossed mapped water at ${point}; test segments, not just control points`);
      }
    }
  }
});

test("the detailed terrain blends continuously to the regional grid", () => {
  const base = { bounds: { south: 49.68, north: 50.08, west: -119.86, east: -119.24 }, rows: 5, columns: 5,
    elevationsM: Array.from({length:5}, () => Array(5).fill(400)) };
  base.details = [{ bounds: { south: 49.78, north: 49.98, west: -119.705, east: -119.395 }, rows: 9, columns: 9,
    blendCells: 1, elevationsM: Array.from({length:9}, () => Array(9).fill(800)) }];
  const sample = createOkanaganRawSampler(base);
  const at = (lat, lon) => { const p = geographicToWorld(lat, lon); return sample(p.x,p.z); };
  assert.ok(Math.abs(at(49.88, -119.705) - 400) < 1e-6);
  assert.ok(Math.abs(at(49.88, -119.55) - 800) < 1e-6);
  assert.ok(Math.abs(at(49.83, -119.55) - 600) < 1e-6);
  assert.ok(Math.abs(at(49.78 + 1e-8, -119.55) - at(49.78 - 1e-8, -119.55)) < 0.001);
});

test("closed lake rings do not classify every land point as water", () => {
  const data = { bounds: { south:49, north:50, west:-120, east:-119 }, rows:2, columns:2,
    elevationsM:[[600,600],[600,600]] };
  const world = { lake:{surfaceElevationM:342,shoreline:[[-119.9,49.1],[-119.8,49.1],[-119.8,49.2],[-119.9,49.2],[-119.9,49.1]]}, airfields:[{elevationM:433}] };
  const sample = createOkanaganSurfaceSampler(data, world);
  const land = geographicToWorld(49.4,-119.7);
  const water = geographicToWorld(49.15,-119.85);
  assert.equal(sample(land.x,land.z),600);
  assert.equal(sample(water.x,water.z),342);
});

test("Peachland mesh preserves the mapped shoreline without dense global tessellation", async () => {
  const [terrain, world, resorts] = await Promise.all(["okanagan-central.cdem.json", "okanagan-central.world.json", "okanagan-resorts.osm.json"]
    .map(name => readFile(new URL(name,pack),"utf8").then(JSON.parse)));
  world.resorts = resorts.resorts;
  assert.equal(terrain.rows,449);
  assert.ok(terrain.bounds.west <= -119.83, "include the hillside neighbourhoods");
  const detail = terrainHierarchy(terrain).map(({grid})=>grid).find(grid=>grid.id === "peachland");
  assert.equal(detail.rows,385);
  assert.ok(detail.shoreCells.length > 500);
  assert.equal(detail.source.verticalDatum,"CGVD2013");
  const scene = new THREE.Scene();
  const rendered = createOkanaganWorld(scene,terrain,world,"mobile");
  let triangles=0, meshes=0;
  rendered.group.traverse(object=>{
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count)/3 * (object.isInstancedMesh ? object.count : 1);
  });
  // Complete 156 km valley + five local patches. Individual resort batches are frustum culled.
  assert.ok(triangles < 1_800_000, `mobile scene exceeded geometry budget: ${triangles}`);
  assert.ok(meshes < 80, `mapped buildings and roads must remain batched: ${meshes}`);
  assert.ok(rendered.group.getObjectByName("Peachland building footprints"));
  rendered.dispose();
  assert.equal(scene.children.length,0);
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
