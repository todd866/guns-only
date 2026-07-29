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
  fx.update({ catapult_active: false, catapult_progress: 0 }, 1 / 60);
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").visible, false);
  assert.equal(fx.group.getObjectByName("LAUNCH_FX_VENT_DUST").material.opacity, 0);
  fx.dispose();
});
