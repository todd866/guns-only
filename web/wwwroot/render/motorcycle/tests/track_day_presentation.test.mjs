import assert from "node:assert/strict";
import test from "node:test";

import {
  RAPIER_TRACK_DAY_SCHEMA,
  planRapierTrackDay,
} from "../track_day_presentation.js";

// Mirrors the reshaped sim circuit: straights on the strip, wide hairpin aprons
// (|z| up to 44 m) beyond the 48 m runway width at both thresholds.
const circuit = [
  { x: 1_300, y: 192, z: -14 },
  { x: 0, y: 192, z: -14 },
  { x: -1_300, y: 192, z: -14 },
  { x: -1_360, y: 192, z: -44 },
  { x: -1_482, y: 192, z: 0 },
  { x: -1_360, y: 192, z: 44 },
  { x: -1_300, y: 192, z: 14 },
  { x: 0, y: 192, z: 14 },
  { x: 1_300, y: 192, z: 14 },
  { x: 1_360, y: 192, z: 44 },
  { x: 1_482, y: 192, z: 0 },
  { x: 1_360, y: 192, z: -44 },
  { x: 1_300, y: 192, z: -14 },
];

test("track-day plan carries unmistakable circuit and paddock cues", () => {
  const plan = planRapierTrackDay(circuit);

  assert.equal(plan.schema, RAPIER_TRACK_DAY_SCHEMA);
  assert.equal(plan.trackWidthM, 20);
  assert.equal(plan.gantry.center.x, circuit[0].x);
  assert.equal(plan.marshalPosts.length, 3);
  assert.ok(plan.cones.length >= 16);
  assert.ok(plan.tyreWalls.length >= 20);
  assert.ok(plan.paddock.length >= 6);
});

test("all authored cues stay inside the paved extents, hairpin aprons included", () => {
  const plan = planRapierTrackDay(circuit);
  const runwayAssets = [
    plan.gantry,
    ...plan.marshalPosts,
    ...plan.cones,
    ...plan.tyreWalls,
  ];

  for (const asset of runwayAssets) {
    assert.ok(Math.abs(asset.center.x) <= plan.pavedHalfLengthM);
    assert.ok(Math.abs(asset.center.z) <= plan.pavedHalfWidthM);
  }
  // Hairpin cones must NOT be squashed onto the 48 m runway rectangle.
  assert.ok(plan.cones.some((cone) => Math.abs(cone.center.z) > 24));
  // Tyre walls belong beyond the track's outer edge, never on the racing surface.
  const apexOuterEdge = 1_482 + plan.trackWidthM * 0.5;
  for (const wall of plan.tyreWalls) {
    assert.ok(
      Math.abs(wall.center.x) >= apexOuterEdge,
      `tyre wall at x=${wall.center.x} sits on the track`,
    );
  }
});

test("plan grounds the off-track world and marks the strip from a distance", () => {
  const plan = planRapierTrackDay(circuit);

  assert.ok(plan.ground.sizeM >= 12_000, `ground ${plan.ground.sizeM} m is still a void`);
  // Sim grants pavement grip 16 m either side of the centreline
  // (PaintedCircuit.PavedApronHalfWidthM); the rendered shoulder must match.
  assert.equal(plan.apronHalfWidthM, 16);
  assert.ok(plan.beacons.length >= 4);
  for (const beacon of plan.beacons) {
    assert.ok(Math.abs(beacon.center.x) >= 1_000, "beacons belong at the thresholds");
    assert.ok(beacon.heightM >= 20, "beacons must read from a kilometre away");
  }
});

test("horizon ring surrounds the world so deep off-track never reads as void", () => {
  const plan = planRapierTrackDay(circuit);

  // Treeline/hill band: enough segments to encircle the rider, far enough to
  // stay scenery, near enough to survive the fog (sky sphere 8 km, fog ~11.7 km).
  assert.ok(plan.horizon.segments.length >= 24);
  assert.ok(plan.horizon.radiusM >= 4_000 && plan.horizon.radiusM <= 7_500);
  for (const segment of plan.horizon.segments) {
    assert.ok(segment.heightM >= 30, "horizon band must read above the ground line");
    assert.ok(Number.isFinite(segment.bearingRad));
  }
  // A few far building silhouettes so the ring is not a uniform hedge.
  assert.ok(plan.horizon.silhouettes.length >= 3);
  for (const silhouette of plan.horizon.silhouettes) {
    const rangeM = Math.hypot(silhouette.center.x, silhouette.center.z);
    assert.ok(rangeM >= 2_500, "silhouettes belong on the horizon, not the infield");
    assert.ok(silhouette.heightM >= 14);
  }
});

test("airfield carries a tall landmark so the strip is findable from deep off-track", () => {
  const plan = planRapierTrackDay(circuit);

  assert.ok(plan.waterTower.heightM >= 30, "landmark must out-read the 30 m beacons");
  assert.ok(
    Math.abs(plan.waterTower.center.x) <= plan.pavedHalfLengthM,
    "the water tower belongs to the airfield cluster",
  );
  assert.ok(Math.abs(plan.waterTower.center.z) <= 400);
  // Hangar block: a wide slab that still reads where slim masts vanish.
  assert.ok(plan.hangar.widthM >= 50);
  assert.ok(plan.hangar.heightM >= 10);
  assert.ok(Math.abs(plan.hangar.center.x) <= plan.pavedHalfLengthM);
  assert.ok(Math.abs(plan.hangar.center.z) <= 400);
  assert.ok(
    Math.hypot(plan.hangar.center.x - plan.waterTower.center.x, plan.hangar.center.z - plan.waterTower.center.z) <= 300,
    "hangar and tower form one airfield cluster",
  );
});

test("ground variation breaks the uniform plane with painted bands and a road", () => {
  const plan = planRapierTrackDay(circuit);

  assert.ok(plan.fieldPatches.length >= 4, "need several mowed/unmowed tone bands");
  for (const patch of plan.fieldPatches) {
    assert.ok(patch.widthM > 100 && patch.depthM > 100, "patches are large-scale tone, not clutter");
    assert.ok(
      Math.abs(patch.center.x) + patch.widthM / 2 <= plan.ground.sizeM / 2
        && Math.abs(patch.center.z) + patch.depthM / 2 <= plan.ground.sizeM / 2,
    );
  }
  // Dirt access road: leaves the paddock side of the strip and runs into the field.
  assert.ok(plan.accessRoad.lengthM >= 1_500);
  assert.ok(plan.accessRoad.widthM >= 5 && plan.accessRoad.widthM <= 12);
  assert.ok(plan.accessRoad.start.z > 24, "road starts on the paddock side of the runway");
  // Hedgerows: kilometre-long field boundaries that survive eye-height
  // compression, clear of the circuit and never growing across the road.
  assert.ok(plan.hedgerows.length >= 4);
  for (const row of plan.hedgerows) {
    assert.ok(row.lengthM >= 1_500, "hedgerows are field boundaries, not shrubs");
    assert.ok(row.heightM >= 2.5 && row.heightM <= 6);
    assert.ok(Math.abs(row.center.z) >= 500, "hedgerows stay off the airfield");
    assert.ok(
      Math.abs(row.center.x) + row.lengthM / 2 <= plan.ground.sizeM / 2
        && Math.abs(row.center.z) <= plan.ground.sizeM / 2,
    );
    if (row.center.z > 0) {
      const roadX = plan.accessRoad.start.x
        + Math.sin(plan.accessRoad.headingRad)
          * ((row.center.z - plan.accessRoad.start.z) / Math.cos(plan.accessRoad.headingRad));
      const nearEdge = Math.abs(roadX - row.center.x) - row.lengthM / 2;
      assert.ok(nearEdge >= 20, "hedgerows on the road side keep a gap for the dirt road");
    }
  }
});

test("midfield verticals give the flat plane parallax without touching the circuit", () => {
  const plan = planRapierTrackDay(circuit);

  // Flat tone bands compress to a few pixels past ~300 m; trees and farm blocks
  // are what actually read from a kilometre out.
  assert.ok(plan.trees.length >= 80 && plan.trees.length <= 400);
  for (const tree of plan.trees) {
    assert.ok(tree.heightM >= 4 && tree.heightM <= 20);
    const nearCircuit =
      Math.abs(tree.center.x) < plan.pavedHalfLengthM + 60
      && Math.abs(tree.center.z) < 170;
    assert.ok(!nearCircuit, `tree at (${tree.center.x}, ${tree.center.z}) crowds the circuit`);
    assert.ok(
      Math.abs(tree.center.x) <= plan.ground.sizeM / 2
        && Math.abs(tree.center.z) <= plan.ground.sizeM / 2,
    );
  }
  assert.ok(plan.farms.length >= 2);
  for (const farm of plan.farms) {
    const rangeM = Math.hypot(farm.center.x, farm.center.z);
    assert.ok(rangeM >= 800 && rangeM <= 4_500, "farms live in the midfield");
  }
});

test("dense authority geometry keeps ambient marker counts bounded", () => {
  const dense = Array.from({ length: 1_024 }, (_, index) => {
    const angle = index / 1_024 * Math.PI * 2;
    return {
      x: Math.cos(angle) * 1_400,
      y: 192,
      z: Math.sin(angle) * 14,
    };
  });
  dense.push(dense[0]);

  const plan = planRapierTrackDay(dense);

  assert.ok(plan.cones.length <= 128);
  assert.ok(plan.tyreWalls.length <= 32);
  assert.equal(plan.paddock.length, 6);
});
