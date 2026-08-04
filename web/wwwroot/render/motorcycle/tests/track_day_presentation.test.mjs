import assert from "node:assert/strict";
import test from "node:test";

import {
  RAPIER_TRACK_DAY_SCHEMA,
  planRapierTrackDay,
} from "../track_day_presentation.js";

const circuit = [
  { x: 1_300, y: 192, z: -14 },
  { x: 0, y: 192, z: -14 },
  { x: -1_300, y: 192, z: -14 },
  { x: -1_480, y: 192, z: 0 },
  { x: -1_300, y: 192, z: 14 },
  { x: 0, y: 192, z: 14 },
  { x: 1_300, y: 192, z: 14 },
  { x: 1_480, y: 192, z: 0 },
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
  assert.ok(plan.paddock.every((asset) => Math.abs(asset.center.z) > 24));
});

test("all authored runway cues stay inside the Rapier operating rectangle", () => {
  const plan = planRapierTrackDay(circuit);
  const runwayAssets = [
    plan.gantry,
    ...plan.marshalPosts,
    ...plan.cones,
    ...plan.tyreWalls,
  ];

  for (const asset of runwayAssets) {
    assert.ok(Math.abs(asset.center.x) <= 1_524);
    assert.ok(Math.abs(asset.center.z) <= 24);
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
