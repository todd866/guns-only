import assert from "node:assert/strict";
import test from "node:test";
import {
  createRapierLaunchFx,
  launchFxShouldRun,
} from "../rapier_launch_fx.js";

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
