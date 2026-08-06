import assert from "node:assert/strict";
import test from "node:test";

import { cameraPitchAnchor } from "../../../hud.js";
import { createCobraHudFrame } from "../cobra_hud_adapter.js";

const WIDTH = 1416;
const HEIGHT = 774;
const DEG = Math.PI / 180;

/**
 * three.js matrixWorld is column-major; elements 8..10 are the camera's local +Z axis in world
 * space, and the camera looks down -Z. A camera pitched nose-up by `pitchRad` therefore has
 * zAxis.y = -sin(pitchRad).
 */
function cameraPitchedBy(pitchRad, { projection = [] } = {}) {
  const world = new Array(16).fill(0);
  world[9] = -Math.sin(pitchRad);
  const projectionMatrix = new Array(16).fill(0);
  projectionMatrix[5] = 2.14;
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

test("ladder pitch is read off the camera, so a sight bias is included rather than ignored", () => {
  // The Cobra rear seat holds a fixed +0.08 rad sight bias. An airframe-referenced ladder used
  // the aircraft's own pitch and so disagreed with the drawn horizon by exactly this angle.
  const anchor = cameraPitchAnchor(cameraPitchedBy(0.08), WIDTH, HEIGHT);
  assert.ok(Math.abs(anchor.pitchDeg - 0.08 / DEG) < 1e-6);
});

test("an off-centre frustum anchors on the optical axis, not the canvas centre", () => {
  const anchor = cameraPitchAnchor(
    cameraPitchedBy(0, { projection: { 8: 0.25, 9: -0.5 } }),
    WIDTH,
    HEIGHT,
  );
  assert.equal(anchor.centerX, WIDTH * 0.5 * 1.25);
  assert.equal(anchor.centerY, HEIGHT * 0.5 * 1.5);
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
