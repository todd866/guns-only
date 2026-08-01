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

test("retires effects into bounded pools and reuses their materials", () => {
  const effects = new KoreaGunEffects(THREE, profile, {
    qualityTier: "balanced",
    maximumPooledPerKind: 4,
  });
  effects.emit("event.weapon.gun-fire.v1", { tracer: true });
  const initiallyCreated = effects.diagnostics().createdObjects;
  assert.equal(initiallyCreated, 2);

  for (let step = 0; step < 12; step++) effects.update(0.1);
  assert.equal(effects.items.length, 0);
  assert.equal(effects.diagnostics().pooledObjects, 2);

  effects.emit("event.weapon.gun-fire.v1", { tracer: true });
  const reused = effects.diagnostics();
  assert.equal(reused.createdObjects, initiallyCreated);
  assert.equal(reused.reusedObjects, 2);
  effects.dispose();
});

test("bounds active combat effects under event bursts", () => {
  const effects = new KoreaGunEffects(THREE, profile, {
    qualityTier: "desktop",
    maximumItems: 12,
    maximumPooledPerKind: 4,
  });
  for (let burst = 0; burst < 8; burst++) {
    effects.emit("event.weapon.gun-impact.v1", { seed: burst + 1 });
  }

  const diagnostics = effects.diagnostics();
  assert.equal(diagnostics.activeItems, 12);
  assert.equal(diagnostics.maximumItems, 12);
  assert.equal(diagnostics.peakActiveItems, 12);
  assert.ok(diagnostics.evictedItems > 0);
  assert.ok(diagnostics.activeDrawCalls <= diagnostics.maximumDrawCalls);
  assert.ok(diagnostics.activeDynamicLights <= diagnostics.maximumDynamicLights);
  effects.dispose();
});

test("keeps hero flashes under saturation and enforces draw and light ceilings", () => {
  const effects = new KoreaGunEffects(THREE, profile, {
    qualityTier: "desktop",
    maximumItems: 6,
    maximumDrawCalls: 7,
    maximumDynamicLights: 1,
  });
  effects.emit("event.vehicle.destroyed.v1", { seed: 3 });
  assert.ok(effects.items.some((item) => item.poolKey === "fireball"));

  for (let burst = 0; burst < 5; burst++) {
    effects.emit("event.weapon.gun-fire.v1", { tracer: true });
    effects.emit("event.weapon.gun-impact.v1", { seed: burst + 10 });
  }

  const diagnostics = effects.diagnostics();
  assert.ok(effects.items.some((item) => item.poolKey === "fireball"),
    "secondary smoke, debris, sparks, and tracers must not evict the destruction cue");
  assert.ok(effects.items.some((item) => item.poolKey === "muzzle-flash"),
    "a muzzle flash should survive lower-priority saturation");
  assert.ok(diagnostics.activeDrawCalls <= 7);
  assert.ok(diagnostics.activeDynamicLights <= 1);
  assert.ok(diagnostics.droppedItems > 0 || diagnostics.evictedItems > 0);
  effects.dispose();
});

test("preserves per-layer authored opacity while fading pooled groups", () => {
  const effects = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  effects.emit("event.weapon.gun-fire.v1", { tracer: false });
  effects.update(0.026);
  const flash = effects.items[0].mesh;
  const opacities = flash.children
    .filter((child) => child.material)
    .map((child) => child.material.opacity);
  assert.equal(opacities.length, 2);
  assert.ok(opacities[1] > opacities[0], "the hot core remains brighter than the outer flash");
  effects.dispose();
});

test("destruction fireball retains a pooled incandescent core", () => {
  const effects = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  effects.emit("event.vehicle.destroyed.v1", { seed: 17 });
  const fireball = effects.items[0].mesh;
  assert.equal(fireball.children.length, 2);
  assert.ok(fireball.children[1].scale.x < fireball.children[0].scale.x);
  assert.equal(
    fireball.children[1].material.color.getHexString().toUpperCase(),
    profile.events["event.vehicle.destroyed.v1"].fireball.innerColor.slice(1),
  );
  effects.dispose();
});

test("pooled re-emission restores deterministic transforms, motion, scale, and opacity", () => {
  const payload = { position: [4, 5, 6], velocity: [20, 0, -3], seed: 19 };
  const snapshot = (effects) => effects.items.map((item) => ({
    kind: item.poolKey,
    position: item.mesh.position.toArray(),
    quaternion: item.mesh.quaternion.toArray(),
    scale: item.mesh.scale.toArray(),
    velocity: item.velocity?.toArray() ?? null,
    opacity: item.materials.map((material) => material.opacity),
  }));
  const reused = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  const fresh = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });

  reused.emit("event.vehicle.destroyed.v1", payload);
  reused.update(0.17);
  reused.clear();
  reused.emit("event.vehicle.destroyed.v1", payload);
  fresh.emit("event.vehicle.destroyed.v1", payload);

  assert.deepEqual(snapshot(reused), snapshot(fresh));
  reused.dispose();
  fresh.dispose();
});

test("pooled array-backed materials restore authored opacity and dispose every layer", () => {
  const effects = new KoreaGunEffects(THREE, profile, { qualityTier: "balanced" });
  effects.emit("event.weapon.gun-fire.v1", { tracer: true });
  const tracer = effects.items.find((item) => item.poolKey === "tracer").mesh;
  const originalMaterial = tracer.material;
  const layers = [originalMaterial.clone(), originalMaterial.clone()];
  layers[0].userData.gunsOnlyBaseOpacity = 0.25;
  layers[1].userData.gunsOnlyBaseOpacity = 0.8;
  for (const material of layers) material.opacity = 0.01;
  tracer.material = layers;
  effects.clear();

  effects.emit("event.weapon.gun-fire.v1", { tracer: true });
  const reusedTracer = effects.items.find((item) => item.poolKey === "tracer").mesh;
  assert.deepEqual(reusedTracer.material.map((material) => material.opacity), [0.25, 0.8]);
  const disposed = [];
  for (const material of layers) {
    material.addEventListener("dispose", () => disposed.push(material));
  }
  effects.dispose();
  originalMaterial.dispose();
  assert.equal(disposed.length, 2);
});
