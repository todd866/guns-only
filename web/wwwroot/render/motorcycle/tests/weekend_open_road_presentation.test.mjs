import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as THREE from "../../../vendor/three.module.js";
import {
  WEEKEND_OPEN_ROAD_PRESENTATION_SCHEMA,
  WEEKEND_ROAD_NETWORK_SCHEMA,
  WEEKEND_ROADSIDE_ATLAS_URL,
  createWeekendOpenRoadPresentation,
  planWeekendOpenRoad,
} from "../weekend_open_road_presentation.js";

const contractUrl = new URL(
  "../../../content/packs/weekend-ride/environment/roads/"
    + "weekend-hinterland-road-network.v1.json",
  import.meta.url,
);

async function loadContract() {
  return JSON.parse(await readFile(contractUrl, "utf8"));
}

test("versioned graph exposes one connected 12 km scenic loop plus branches", async () => {
  const contract = await loadContract();
  const plan = planWeekendOpenRoad(contract);

  assert.equal(contract.schema, WEEKEND_ROAD_NETWORK_SCHEMA);
  assert.equal(plan.schema, WEEKEND_OPEN_ROAD_PRESENTATION_SCHEMA);
  assert.equal(plan.networkId, "weekend-hinterland.open-road.v1");
  assert.equal(contract.geometry.coordinate_system, "left-handed-east-up-north-metres");
  assert.equal(plan.roads.length, 8);
  assert.equal(plan.primaryRouteRoadIds.length, 4);
  assert.ok(plan.primaryRouteLengthM > 12_000);
  assert.ok(plan.roads.some((road) => road.id === "paddock-access"));
  assert.ok(plan.roads.some((road) => road.id === "reservoir-overlook-spur"));
  assert.ok(plan.roads.some((road) => road.id === "village-cut-through"));
  assert.ok(plan.roads.some((road) => road.id === "airfield-service-link"));
  assert.ok(plan.junctions.some((junction) => junction.roadIds.length >= 4));
  assert.deepEqual(plan.circuitAccessPoint, contract.circuit_access_point);
  assert.equal(plan.roadside.instances.length, 144);
  assert.deepEqual(
    Array.from(plan.roadside.regions.keys()),
    ["eucalyptus", "dry-grass", "sandstone", "scrub"],
  );
});

test("one asphalt mesh uses every authority sample and exact per-road width", async () => {
  const contract = await loadContract();
  const texture = new THREE.Texture();
  const atlas = new THREE.Texture();
  const presentation = createWeekendOpenRoadPresentation(THREE, contract, {
    surfaceTexture: texture,
    roadsideAtlas: atlas,
  });
  const surface = presentation.object3d.getObjectByName("weekend-open-road-asphalt");
  const pointCount = contract.roads.reduce(
    (sum, road) => sum + road.centreline.length,
    0,
  );
  const expectedVertices = pointCount * 2 + contract.junctions.length * 25;

  assert.equal(presentation.object3d.name, "weekend-open-road-network");
  assert.equal(presentation.object3d.children.length, 2, "one road draw plus one roadside draw");
  assert.ok(surface?.isMesh);
  assert.equal(surface.geometry.getAttribute("position").count, expectedVertices);
  assert.equal(
    surface.geometry.getAttribute("uv").count,
    surface.geometry.getAttribute("position").count,
  );
  assert.equal(surface.material.map, texture);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.wrapS, THREE.MirroredRepeatWrapping);
  assert.equal(texture.wrapT, THREE.MirroredRepeatWrapping);
  const roadside = presentation.object3d.getObjectByName("weekend-open-road-roadside");
  assert.ok(roadside?.isMesh);
  assert.equal(
    roadside.geometry.getAttribute("position").count,
    contract.roadside_instances.length * 4,
  );
  assert.equal(roadside.material.map, atlas);
  assert.equal(atlas.colorSpace, THREE.SRGBColorSpace);
  assert.equal(atlas.flipY, false);
  assert.equal(atlas.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(roadside.material.alphaTest, 0.42);
  assert.equal(roadside.material.transparent, false);
  const roadsideUv = roadside.geometry.getAttribute("uv");
  assert.deepEqual(
    Array.from({ length: 4 }, (_, index) => [roadsideUv.getX(index), roadsideUv.getY(index)]),
    [[0, 0.5], [0.5, 0.5], [0.5, 0], [0, 0]],
    "flipY=false must map authored top-left eucalyptus without swapping atlas rows",
  );
  const fixture = [
    ["eucalyptus", "dry-grass"],
    ["scrub", "sandstone"],
  ];
  const sampleTopLeftFixture = (u, v) => fixture[
    Math.min(1, Math.floor(v * 2))
  ][Math.min(1, Math.floor(u * 2))];
  for (const regionId of fixture.flat()) {
    const instanceIndex = contract.roadside_instances.findIndex(
      (instance) => instance.region_id === regionId,
    );
    assert.ok(instanceIndex >= 0);
    const firstUv = instanceIndex * 4;
    const centerU = (roadsideUv.getX(firstUv) + roadsideUv.getX(firstUv + 2)) * 0.5;
    const centerV = (roadsideUv.getY(firstUv) + roadsideUv.getY(firstUv + 2)) * 0.5;
    assert.equal(
      sampleTopLeftFixture(centerU, centerV),
      regionId,
      `2x2 fixture region '${regionId}' must stay on its authored atlas row`,
    );
  }

  const position = surface.geometry.getAttribute("position");
  const firstRoad = contract.roads[0];
  const widthM = Math.hypot(
    position.getX(1) - position.getX(0),
    position.getZ(1) - position.getZ(0),
  );
  assert.ok(Math.abs(widthM - firstRoad.paved_width_m) < 1e-4);
  assert.ok(Math.abs((position.getX(0) + position.getX(1)) * 0.5
    - firstRoad.centreline[0].x) < 1e-4);
  assert.ok(Math.abs((position.getZ(0) + position.getZ(1)) * 0.5
    + firstRoad.centreline[0].z) < 1e-4, "Web must map north to local -Z");
  presentation.dispose();
});

test("canonical roadside atlas and provenance are byte-identical in staged Web content", async () => {
  assert.equal(
    WEEKEND_ROADSIDE_ATLAS_URL,
    "/content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png?v=299",
  );
  const paths = [
    new URL("../../../../../content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png", import.meta.url),
    new URL("../../../content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png", import.meta.url),
  ];
  const bytes = await Promise.all(paths.map((path) => readFile(path)));
  for (const value of bytes) {
    assert.equal(
      createHash("sha256").update(value).digest("hex"),
      "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf",
    );
  }
  assert.deepEqual(bytes[0], bytes[1]);
});

test("contract validation rejects renderer-owned drift and malformed road geometry", async () => {
  const contract = await loadContract();
  assert.throws(
    () => planWeekendOpenRoad({ ...contract, schema: "weekend-road-local.v0" }),
    /versioned connected road-network/,
  );
  assert.throws(
    () => planWeekendOpenRoad({
      ...contract,
      roads: [
        ...contract.roads.slice(0, -1),
        { ...contract.roads.at(-1), paved_width_m: 200 },
      ],
    }),
    /invalid paved width/,
  );
  const driftedRoad = {
    ...contract.roads[0],
    centreline: [
      contract.roads[0].centreline[0],
      { ...contract.roads[0].centreline[1], x: contract.roads[0].centreline[1].x + 500 },
    ],
  };
  assert.throws(
    () => planWeekendOpenRoad({
      ...contract,
      roads: [driftedRoad, ...contract.roads.slice(1)],
    }),
    /sampling contract|length does not match/,
  );
});

test("Web bridge exports the graph once, outside the per-frame state", async () => {
  const bridgeSource = await readFile(
    new URL("../../../../MotorcycleOpenRoadWebBridge.cs", import.meta.url),
    "utf8",
  );
  assert.match(bridgeSource, /public static string GetRoadNetwork\(\)/);
  assert.match(bridgeSource, /WeekendRoadNetworkContract\.FromDefaultWeekendWorld/);
  assert.doesNotMatch(bridgeSource, /GetState\(|Advance\(/);
});
