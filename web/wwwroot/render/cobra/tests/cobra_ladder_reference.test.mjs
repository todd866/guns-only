import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import { cameraPitchAnchor } from "../../../hud.js";
import { lookOffsetFromAngles } from "../cobra_camera_bias.js";
import { createCobraHudFrame } from "../cobra_hud_adapter.js";

const WIDTH = 1416;
const HEIGHT = 774;
const DEG = Math.PI / 180;
const PRODUCTION_FOV_DEG = 58;
const PRODUCTION_PROJECTION_SCALE_Y = 1 / Math.tan(PRODUCTION_FOV_DEG * DEG / 2);

/**
 * three.js matrixWorld is column-major; elements 8..10 are the camera's local +Z axis in world
 * space, and the camera looks down -Z. A camera pitched nose-up by `pitchRad` therefore has
 * zAxis.y = -sin(pitchRad).
 */
function cameraPitchedBy(pitchRad, { projection = [] } = {}) {
  const world = new Array(16).fill(0);
  world[9] = -Math.sin(pitchRad);
  const projectionMatrix = new Array(16).fill(0);
  projectionMatrix[5] = PRODUCTION_PROJECTION_SCALE_Y;
  for (const [index, value] of Object.entries(projection)) {
    projectionMatrix[Number(index)] = value;
  }
  return {
    matrixWorld: { elements: world },
    projectionMatrix: { elements: projectionMatrix },
  };
}

test("camera reference anchors the ladder at the principal point", () => {
  const anchor = cameraPitchAnchor(cameraPitchedBy(0), WIDTH, HEIGHT);
  assert.ok(anchor, "a level camera must yield an anchor");
  assert.equal(anchor.centerX, WIDTH * 0.5);
  assert.equal(anchor.centerY, HEIGHT * 0.5);
  assert.ok(Math.abs(anchor.pitchDeg) < 1e-9, `expected 0 deg, got ${anchor.pitchDeg}`);
});

test("production heading-90 camera projects body-forward exactly on its principal point", () => {
  const pose = {
    x_m: 20, y_m: 50, z_m: -100,
    pitch_rad: 0.12, roll_rad: -0.28, yaw_rad: Math.PI / 2,
  };
  const frame = createCobraHudFrame(THREE).update({
    camera: null,
    pose,
    state: {},
    dt: 1 / 60,
    nowSeconds: 0,
  });
  const camera = new THREE.PerspectiveCamera(PRODUCTION_FOV_DEG, WIDTH / HEIGHT, 0.12, 32_000);
  camera.rotation.order = "YXZ";
  camera.position.set(23, 52, 98);
  const offset = lookOffsetFromAngles(pose.yaw_rad, pose.pitch_rad, 140);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(offset.x, offset.y, offset.z)));
  camera.rotation.z = -pose.roll_rad;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const bodyForward = camera.position.clone().addScaledVector(frame.playerForward, 10_000);
  const projected = bodyForward.project(camera);
  assert.ok(Math.abs(projected.x) < 1e-9, `body-forward x NDC ${projected.x}`);
  assert.ok(Math.abs(projected.y) < 1e-9, `body-forward y NDC ${projected.y}`);
});

test("ladder pitch is read off the body-aligned camera at production 58 degree FOV", () => {
  const anchor = cameraPitchAnchor(cameraPitchedBy(0.08), WIDTH, HEIGHT);
  assert.ok(Math.abs(anchor.pitchDeg - 0.08 / DEG) < 1e-6);
  assert.ok(Math.abs(PRODUCTION_PROJECTION_SCALE_Y - 1.804) < 0.001);
});

test("an off-centre frustum anchors on the optical axis, not the canvas centre", () => {
  const anchor = cameraPitchAnchor(
    cameraPitchedBy(0, { projection: { 8: 0.25, 9: -0.5 } }),
    WIDTH,
    HEIGHT,
  );
  assert.equal(anchor.centerX, WIDTH * 0.5 * 0.75);
  assert.equal(anchor.centerY, HEIGHT * 0.5 * 0.5);
});

test("a camera without an honest matrix yields no anchor, so the ladder falls back", () => {
  assert.equal(cameraPitchAnchor(null, WIDTH, HEIGHT), null);
  assert.equal(cameraPitchAnchor({}, WIDTH, HEIGHT), null);
  assert.equal(
    cameraPitchAnchor({ matrixWorld: { elements: [] }, projectionMatrix: null }, WIDTH, HEIGHT),
    null,
  );
});

test("the Cobra frame requests the camera-referenced ladder", () => {
  const THREE = {
    Quaternion: class { },
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set() { return this; }
    },
  };
  const { frame } = createCobraHudFrame(THREE);
  assert.equal(frame.ladderReference, "camera");
});

test("camera-referenced ladder horizon remains bank-aware without owning the centred W", async () => {
  const { cameraReferencedAirframeAnchors } = await import("../../../hud.js");
  const camera = cameraPitchedBy(0.08);
  const bankDeg = 35;
  const anchors = cameraReferencedAirframeAnchors(camera, WIDTH, HEIGHT, { bank_deg: bankDeg });
  assert.ok(anchors);
  const ladder = cameraPitchAnchor(camera, WIDTH, HEIGHT);
  const focalY = HEIGHT * 0.5 * PRODUCTION_PROJECTION_SCALE_Y;
  const localY = Math.tan(ladder.pitchDeg * Math.PI / 180) * focalY;
  const bank = -bankDeg * Math.PI / 180;
  const expectedX = ladder.centerX - localY * Math.sin(bank);
  const expectedY = ladder.centerY + localY * Math.cos(bank);
  assert.ok(Math.abs(anchors.horizon.x - expectedX) < 1e-6);
  assert.ok(Math.abs(anchors.horizon.y - expectedY) < 1e-6);
});

test("Cobra snapshot requests the camera/world ladder while W remains body-forward", async () => {
  const { cobraHudState } = await import("../cobra_hud_adapter.js");
  const state = cobraHudState({
    vehicle: {
      ground_speed_mps: 40,
      velocity_x_mps: 20,
      velocity_y_mps: 0,
      velocity_z_mps: 0,
      rotorcraft: { vortex_ring_severity: 0, retreating_blade_stall_severity: 0 },
    },
    gunner: { fire_authorized: false },
  }, { pitch_rad: 0.08, roll_rad: 0, yaw_rad: 0, y_m: 100 });
  assert.equal(state.heli_flight_path, true);
  assert.equal(state.heli_fpv_mode, "cruise");
});
