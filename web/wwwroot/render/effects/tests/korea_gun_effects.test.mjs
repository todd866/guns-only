import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { KoreaGunEffects } from "../korea_gun_effects.js";

const profile = JSON.parse(await readFile(new URL(
  "../../../../../content/packs/korea-1950s/effects/guns.effects.json",
  import.meta.url,
), "utf8"));

test("emits and retires deterministic gun, impact, destruction, and wake effects", () => {
  const effects = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  effects.emit("event.weapon.gun-fire.v1", {
    position: new THREE.Vector3(1, 2, 3),
    direction: new THREE.Vector3(0, 0, -1),
  });
  assert.equal(effects.items.length, 2);
  assert.equal(effects.group.children.length, 2);

  effects.emit("event.weapon.gun-impact.v1", {
    position: [0, 0, 0],
    normal: [0, 1, 0],
    seed: 42,
  });
  const firstSparkVelocity = effects.items.find((item) => item.velocity && item.gravity)?.velocity.clone();
  assert.ok(firstSparkVelocity?.length() > 0);

  effects.emit("event.vehicle.destroyed.v1", { position: [4, 5, 6], velocity: [20, 0, 0], seed: 9 });
  effects.emit("event.platform.wake.v1", { position: [0, 0.1, 0], direction: [0, 0, 1] });
  assert.ok(effects.items.length > 20);

  for (let step = 0; step < 140; step++) effects.update(0.1);
  assert.equal(effects.items.length, 0);
  assert.equal(effects.group.children.length, 0);
  effects.dispose();
  assert.equal(effects.disposed, true);
});

test("quality tier scales particle counts", () => {
  const mobile = new KoreaGunEffects(THREE, profile, { qualityTier: "mobile" });
  const desktop = new KoreaGunEffects(THREE, profile, { qualityTier: "desktop" });
  mobile.emit("event.weapon.gun-impact.v1", { seed: 2 });
  desktop.emit("event.weapon.gun-impact.v1", { seed: 2 });
  assert.ok(desktop.items.length > mobile.items.length);
  mobile.dispose();
  desktop.dispose();
});

test("replay scope reset clears particles and deterministic seeds reproduce debris", () => {
  const first = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  const replay = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  const payload = { position: [4, 5, 6], velocity: [20, 0, -3], seed: 19 };
  first.emit("event.vehicle.destroyed.v1", payload);
  replay.emit("event.vehicle.destroyed.v1", payload);
  const velocities = (effects) => effects.items
    .filter((item) => item.gravity)
    .map((item) => item.velocity.toArray());
  assert.deepEqual(velocities(first), velocities(replay));
  first.clear();
  assert.equal(first.items.length, 0);
  assert.equal(first.group.children.length, 0);
  first.dispose();
  replay.dispose();
});
