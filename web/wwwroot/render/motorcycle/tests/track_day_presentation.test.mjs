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
