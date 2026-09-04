import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  OKANAGAN_DROP_CURTAIN,
  createOkanaganDropCurtain,
  stepOkanaganDropCurtain,
} from "../okanagan_drop_curtain.js";

test("a live drop from drop height lays a curtain that reaches the ground", () => {
  const aircraft = { x: 100, y: 905, z: -50 };
  const surfaceY = 810;
  let samples = [];
  let reachedGround = false;
  for (let tick = 0; tick < 180; tick += 1) {
    samples = stepOkanaganDropCurtain(samples, {
      active: true,
      origin: aircraft,
      surfaceY,
      dtSeconds: 1 / 60,
    });
    if (samples.some((sample) => sample.y <= surfaceY + 8)) reachedGround = true;
  }
  assert.equal(OKANAGAN_DROP_CURTAIN.fallSpeedMps >= 18, true);
  assert.equal(OKANAGAN_DROP_CURTAIN.fallSpeedMps <= 42, true);
  assert.ok(reachedGround, "the curtain must reach the surface, not glitter under the belly");
  const liveHeights = samples.map((sample) => sample.y);
  assert.ok(Math.max(...liveHeights) - Math.min(...liveHeights) >= 60,
    "while dropping, the stream must read as a vertical curtain");
});

test("releasing the drop lets the remaining water fall out instead of vanishing", () => {
  const aircraft = { x: 0, y: 920, z: 0 };
  let samples = [];
  for (let tick = 0; tick < 12; tick += 1) {
    samples = stepOkanaganDropCurtain(samples, {
      active: true,
      origin: aircraft,
      surfaceY: 800,
      dtSeconds: 1 / 60,
    });
  }
  const loaded = samples.length;
  assert.ok(loaded >= 8);
  samples = stepOkanaganDropCurtain(samples, {
    active: false,
    origin: aircraft,
    surfaceY: 800,
    dtSeconds: 1 / 60,
  });
  assert.ok(samples.length >= loaded - 2, "stopping the valve must not delete airborne water");
});

test("the live curtain is a sheet, not a bead string", () => {
  const aircraft = { x: 0, y: 900, z: 0 };
  let samples = [];
  for (let tick = 0; tick < 24; tick += 1) {
    samples = stepOkanaganDropCurtain(samples, {
      active: true,
      origin: aircraft,
      surfaceY: 800,
      dtSeconds: 1 / 60,
    });
  }
  const spanX = Math.max(...samples.map((sample) => sample.x))
    - Math.min(...samples.map((sample) => sample.x));
  const spanZ = Math.max(...samples.map((sample) => sample.z))
    - Math.min(...samples.map((sample) => sample.z));
  assert.ok(OKANAGAN_DROP_CURTAIN.emitPerTick >= 5);
  assert.ok(OKANAGAN_DROP_CURTAIN.jitterM >= 4);
  assert.ok(Math.hypot(spanX, spanZ) >= 4,
    "the falling water must have width, not sit on one world point");
});

test("the cockpit sees a water sheet, not glitter points", () => {
  const scene = new THREE.Scene();
  const curtain = createOkanaganDropCurtain(scene);
  const drawn = curtain.update({ position: { x: 0, y: 900, z: 0 } }, true, 1 / 60, 800);
  assert.ok(drawn >= 1);
  assert.equal(curtain.group.type, "Mesh");
  assert.ok(curtain.group.isInstancedMesh);
  assert.ok(curtain.group.count >= 1);
  const box = new THREE.Box3().setFromObject(curtain.group);
  assert.ok(box.max.x - box.min.x >= 2.4, "each slug must have width in the world");
});
