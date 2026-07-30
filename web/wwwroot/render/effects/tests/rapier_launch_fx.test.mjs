import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRapierLaunchFx,
  launchFxShouldRun,
} from "../rapier_launch_fx.js";

const launchFxUrl = new URL("../rapier_launch_fx.js", import.meta.url);

test("launchFxShouldRun only during fixed-strip catshot", () => {
  assert.equal(launchFxShouldRun({}), false);
  assert.equal(launchFxShouldRun({ catapult_active: true, carrier: true }), false);
  assert.equal(launchFxShouldRun({
    catapult_active: true,
    platform_kind: "FIXED_ARRESTING_STRIP",
  }), true);
});

test("createRapierLaunchFx hides particles until catapult_active", () => {
  const fx = createRapierLaunchFx({
    catapultX: -70,
    railStartZ: -20,
    flatLengthM: 430,
    galleryEndZ: -450,
    galleryHalfWidth: 7,
    galleryHeight: 8,
    particleMultiplier: 1,
  });
  assert.equal(fx.group.name, "LAUNCH_FX");
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").visible, false);
  fx.update({ catapult_active: true, catapult_progress: 0.4 }, 1 / 60);
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").visible, true);
  assert.ok(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").material.opacity > 0);
  fx.update({ catapult_active: false, catapult_progress: 1 }, 1 / 60);
  // Ship C: soft post-handoff fade — still visible briefly, then clears.
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").visible, true);
  assert.ok(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").material.opacity > 0);
  for (let i = 0; i < 90; i += 1) {
    fx.update({ catapult_active: false, catapult_progress: 1 }, 1 / 60);
  }
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").visible, false);
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").material.opacity, 0);
  fx.dispose();
});

test("portal daylight sheet strengthens near gallery exit", () => {
  const fx = createRapierLaunchFx({
    catapultX: -70,
    railStartZ: -20,
    flatLengthM: 430,
    galleryEndZ: -450,
    particleMultiplier: 1,
  });
  const sheet = fx.group.getObjectByName("LAUNCH_FX_PORTAL_SHEET");
  fx.update({ catapult_active: true, catapult_progress: 0.4 }, 1 / 60);
  assert.equal(sheet.material.opacity, 0);
  fx.update({ catapult_active: true, catapult_progress: 0.9 }, 1 / 60);
  assert.ok(sheet.material.opacity > 0.3, "near-exit portal sheet must read as daylight");
  assert.equal(sheet.material.color.getHex(), 0xfff0d0);
  fx.dispose();
});

test("particle layouts are deterministic and remain static while progress moves the effects", () => {
  const layout = {
    catapultX: -70,
    railStartZ: -20,
    flatLengthM: 430,
    galleryEndZ: -450,
    galleryHalfWidth: 7,
    galleryHeight: 8,
    particleMultiplier: 1,
  };
  const first = createRapierLaunchFx(layout);
  const second = createRapierLaunchFx(layout);
  const names = [
    "LAUNCH_FX_VENT_DUST",
    "LAUNCH_FX_PORTAL_SHEET",
    "LAUNCH_FX_RAIL_SHIMMER",
  ];
  const initial = new Map();

  assert.equal(first.group.children.filter((child) => child.isPoints).length, 3,
    "the bounded launch treatment must remain exactly three particle draws");
  for (const name of names) {
    const firstPoints = first.group.getObjectByName(name);
    const secondPoints = second.group.getObjectByName(name);
    const firstPosition = firstPoints.geometry.getAttribute("position");
    const secondPosition = secondPoints.geometry.getAttribute("position");
    const firstSeed = firstPoints.geometry.getAttribute("aSeed");
    const secondSeed = secondPoints.geometry.getAttribute("aSeed");
    assert.deepEqual(firstPosition.array, secondPosition.array,
      `${name} position scatter must reproduce exactly`);
    assert.deepEqual(firstSeed.array, secondSeed.array,
      `${name} seed scatter must reproduce exactly`);
    assert.ok(firstPosition.array.some((value) => value !== 0),
      `${name} must be initialized before its first visible frame`);
    initial.set(name, {
      attribute: firstPosition,
      values: firstPosition.array.slice(),
      version: firstPosition.version,
    });
  }

  const rail = first.group.getObjectByName("LAUNCH_FX_RAIL_SHIMMER");
  first.update({ catapult_active: true, catapult_progress: 0.2 }, 1 / 60);
  const earlyRailZ = rail.position.z;
  first.update({ catapult_active: true, catapult_progress: 0.8 }, 1 / 60);
  assert.ok(rail.position.z < earlyRailZ,
    "the stable rail shimmer cloud must travel down the launcher with the aircraft");

  for (const name of names) {
    const snapshot = initial.get(name);
    const current = first.group.getObjectByName(name).geometry.getAttribute("position");
    assert.equal(current, snapshot.attribute, `${name} must retain its position attribute`);
    assert.deepEqual(current.array, snapshot.values,
      `${name} must animate by Object3D transform instead of rewriting vertices`);
    assert.equal(current.version, snapshot.version,
      `${name} must not request a position-buffer upload during the stroke`);
  }

  first.dispose();
  second.dispose();
});

test("launch FX source contains no random or per-frame buffer invalidation path", async () => {
  const source = await readFile(launchFxUrl, "utf8");
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(source, /\.needsUpdate\s*=\s*true/);
});
