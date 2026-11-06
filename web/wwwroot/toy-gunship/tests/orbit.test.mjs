import test from "node:test";
import assert from "node:assert/strict";
import {
  CRATE, ORBIT, createOrbit, createSearchlight, dropCrate, orbitPose,
  resetCrateIds, searchlightAim, stepCrates, stepOrbit, stepSearchlight,
} from "../orbit.mjs";

test("orbit clamps radius, altitude and speed to the yard envelope", () => {
  const orbit = createOrbit();
  for (let i = 0; i < 400; i += 1) stepOrbit(orbit, {radiusRate: 1, altRate: 1, speedRate: 1}, 0.05);
  assert.equal(orbit.radius, ORBIT.radiusMax);
  assert.equal(orbit.alt, ORBIT.altMax);
  assert.equal(orbit.speed, ORBIT.speedMax);
  for (let i = 0; i < 800; i += 1) stepOrbit(orbit, {radiusRate: -1, altRate: -1, speedRate: -1}, 0.05);
  assert.equal(orbit.radius, ORBIT.radiusMin);
  assert.equal(orbit.alt, ORBIT.altMin);
  assert.equal(orbit.speed, ORBIT.speedMin);
});

test("hold-steady freezes the orbit shape but the plane keeps circling", () => {
  const orbit = createOrbit();
  const before = {radius: orbit.radius, alt: orbit.alt, angle: orbit.angle};
  stepOrbit(orbit, {radiusRate: 1, altRate: 1, speedRate: 1}, 0.05, true);
  assert.equal(orbit.radius, before.radius);
  assert.equal(orbit.alt, before.alt);
  assert.ok(orbit.angle > before.angle);
});

test("orbitPose sits on the circle at altitude with a tangent heading", () => {
  const orbit = createOrbit();
  const pose = orbitPose(orbit);
  assert.ok(Math.abs(Math.hypot(pose.x, pose.z) - orbit.radius) < 1e-9);
  assert.equal(pose.y, orbit.alt);
  assert.ok(Math.abs(pose.heading - (orbit.angle + Math.PI / 2)) < 1e-9);
});

test("the searchlight catches a plane parked in the beam, once, and lets go", () => {
  const light = createSearchlight();
  const aim = searchlightAim(10);
  const inBeam = {x: aim.x, y: 16, z: aim.z};
  const newly = stepSearchlight(light, inBeam, 0.05, 10);
  assert.equal(newly, true);
  assert.equal(light.caught, true);
  const again = stepSearchlight(light, inBeam, 0.05, 10);
  assert.equal(again, false, "spotted only fires on the catch frame");
  const away = {x: aim.x + 50, y: 16, z: aim.z};
  stepSearchlight(light, away, 0.05, 10);
  assert.equal(light.caught, false);
  assert.ok(light.totalSpottedS > 0.09, "spotted time accrues for the pilot star");
});

test("crate drops respect the bay cooldown and land on target near the squad lead", () => {
  resetCrateIds();
  const crates = [];
  const pose = {x: 5, y: 16, z: 5};
  const first = dropCrate(crates, pose, 10, -Infinity);
  assert.ok(first);
  assert.equal(dropCrate(crates, pose, 12, 10), null, "bay still reloading");
  assert.ok(dropCrate(crates, pose, 10 + CRATE.cooldownS, 10));
  const lead = {x: 6, z: 6};
  let landed = [];
  let now = 10;
  for (let i = 0; i < 200 && landed.length === 0; i += 1) {
    now += 0.05;
    landed = stepCrates(crates, 0.05, lead, now);
  }
  assert.equal(landed.length, 2, "both drops fall together and land");
  assert.ok(landed.every((c) => c.onTarget === true));
  // Landed crates rest for the view, then clean up.
  stepCrates(crates, 0.05, lead, now + CRATE.restS + 1);
  assert.ok(!crates.includes(landed[0]));
});
