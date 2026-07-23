import assert from "node:assert/strict";
import test from "node:test";

import {
  GCAS_SAVE_CAMERA_HOLD_SECONDS,
  GcasSaveCameraController,
  gcasSaveCameraFraming,
} from "../gcas_save_camera.js";

test("save camera follows only a real fly-up and holds 2.5 active seconds after release", () => {
  const camera = new GcasSaveCameraController();
  assert.equal(camera.update({
    auto_gcas_active: false,
    auto_gcas_inhibit_reason: "LOW_LEVEL_STANDBY",
    auto_gcas_release_count: 0,
  }, 1 / 60), false);

  assert.equal(camera.update({
    auto_gcas_active: true,
    auto_gcas_release_count: 0,
  }, 1 / 60), true);
  assert.equal(camera.update({
    auto_gcas_active: false,
    auto_gcas_release_count: 1,
  }, 1 / 60), true);
  assert.equal(camera.holdRemainingSeconds, GCAS_SAVE_CAMERA_HOLD_SECONDS);

  for (let index = 0; index < 149; index += 1) {
    assert.equal(camera.update({
      auto_gcas_active: false,
      auto_gcas_release_count: 1,
    }, 1 / 60), true);
  }
  assert.equal(camera.update({
    auto_gcas_active: false,
    auto_gcas_release_count: 1,
  }, 1 / 60), false);
});

test("pause freezes the post-save hold and replay owns the camera", () => {
  const camera = new GcasSaveCameraController();
  camera.update({ auto_gcas_active: true, auto_gcas_release_count: 0 }, 0.1);
  camera.update({ auto_gcas_active: false, auto_gcas_release_count: 1 }, 0.1);

  for (let index = 0; index < 20; index += 1) {
    assert.equal(camera.update({
      paused: true,
      auto_gcas_active: false,
      auto_gcas_release_count: 1,
    }, 0.25), true);
  }
  assert.equal(camera.holdRemainingSeconds, GCAS_SAVE_CAMERA_HOLD_SECONDS);
  assert.equal(camera.update({
    replay_external: true,
    auto_gcas_active: false,
    auto_gcas_release_count: 1,
  }, 0.1), false);
  assert.equal(camera.holdRemainingSeconds, 0);
});

test("framing is a deterministic level side/chase shot that bisects aircraft and ground", () => {
  const framing = gcasSaveCameraFraming({
    position: { x: 120, y: 1030.48, z: -45 },
    forward: { x: 0, y: -0.7, z: -0.7 },
    radarAltitudeFt: 100,
  });
  assert.equal(framing.clearanceM, 30.48);
  assert.equal(framing.groundY, 1000);
  assert.equal(framing.target.y, (1030.48 + 1000) / 2);
  assert.ok(framing.camera.y > 1030.48);
  assert.ok(framing.camera.x > 120, "the deterministic view stays on the right side");
  assert.ok(framing.camera.z > -45, "the view also trails the aircraft");
  assert.ok(framing.rangeM >= framing.clearanceM * 1.05 + 36 - 1e-9);
});
