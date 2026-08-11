import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTexelStabilizedDirectionalShadow,
  computeTexelStabilizedShadowFrame,
  shadowHalfExtentForMode,
} from "../shadow_stabilizer.js";

test("shadow focus snaps to the directional light texel lattice", () => {
  const frame = computeTexelStabilizedShadowFrame({
    focus: [10.31, 4.7, -9.77],
    direction: [0.3, -0.8, -0.4],
    halfExtent: 512,
    mapSize: 1024,
  });
  assert.equal(frame.worldUnitsPerTexel, 1);
  const x = frame.focus[0] * frame.right[0] + frame.focus[1] * frame.right[1] + frame.focus[2] * frame.right[2];
  const y = frame.focus[0] * frame.up[0] + frame.focus[1] * frame.up[1] + frame.focus[2] * frame.up[2];
  assert.ok(Math.abs(x - Math.round(x)) < 1e-9);
  assert.ok(Math.abs(y - Math.round(y)) < 1e-9);
});

test("mode extents prioritize carrier detail without exceeding profile distance", () => {
  assert.equal(shadowHalfExtentForMode(6000, "carrier"), 900);
  assert.equal(shadowHalfExtentForMode(6000, "combat"), 3000);
  assert.equal(shadowHalfExtentForMode(500, "carrier"), 500);
  assert.equal(shadowHalfExtentForMode(6000, "carrier", { carrier: 700 }), 700);
});

test("applies a stabilized frame without importing or constructing Three vectors", () => {
  const position = (x, y, z) => ({
    x,
    y,
    z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
  });
  let mapDisposed = false;
  let targetUpdated = false;
  let lightUpdated = false;
  let cameraUpdated = false;
  const light = {
    position: position(0, 100, 0),
    target: {
      position: position(0, 0, 0),
      updateMatrixWorld() { targetUpdated = true; },
    },
    shadow: {
      mapSize: {
        x: 1024,
        y: 1024,
        set(x, y) { this.x = x; this.y = y; },
      },
      map: { dispose() { mapDisposed = true; } },
      camera: {
        near: 0,
        far: 0,
        updateProjectionMatrix() { cameraUpdated = true; },
      },
    },
    updateMatrixWorld() { lightUpdated = true; },
  };

  const frame = applyTexelStabilizedDirectionalShadow(light, [10, 20, 30], {
    direction: [0, -1, 0],
    halfExtent: 100,
    mapSize: 512,
    lightDistance: 250,
  });

  assert.deepEqual(
    [light.target.position.x, light.target.position.y, light.target.position.z],
    frame.focus,
  );
  assert.deepEqual(
    [light.position.x, light.position.y, light.position.z],
    [frame.focus[0], frame.focus[1] + 250, frame.focus[2]],
  );
  assert.equal(light.shadow.mapSize.x, 512);
  assert.equal(light.shadow.mapSize.y, 512);
  assert.equal(mapDisposed, true);
  assert.equal(light.shadow.map, null);
  assert.equal(light.shadow.camera.left, -100);
  assert.equal(light.shadow.camera.right, 100);
  assert.equal(light.shadow.camera.top, 100);
  assert.equal(light.shadow.camera.bottom, -100);
  assert.equal(light.shadow.camera.near, 1);
  assert.equal(light.shadow.camera.far, 625);
  assert.equal(targetUpdated, true);
  assert.equal(lightUpdated, true);
  assert.equal(cameraUpdated, true);
});
