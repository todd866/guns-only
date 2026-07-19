import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveResolutionController } from "../adaptive_resolution.js";

test("drops quickly under sustained load and recovers asymmetrically", () => {
  const changes = [];
  const controller = new AdaptiveResolutionController({
    pixelRatioCap: 1.5,
    targetFps: 60,
    minScale: 0.7,
    stepDown: 0.1,
    stepUp: 0.05,
    smoothing: 1,
    warmupSamples: 3,
    cooldownSamples: 2,
    onChange: (ratio, metadata) => changes.push([ratio, metadata.reason]),
  });
  controller.setViewport(1920, 1080, 2);
  assert.equal(controller.pixelRatio, 1.5);
  controller.sample(20);
  controller.sample(20);
  const slow = controller.sample(20);
  assert.equal(slow.changed, true);
  assert.equal(slow.scale, 0.9);
  assert.equal(slow.pixelRatio, 1.35);

  controller.sample(10);
  const fast = controller.sample(10);
  assert.equal(fast.changed, true);
  assert.equal(fast.scale, 0.95);
  assert.equal(fast.pixelRatio, 1.43);
  assert.deepEqual(changes.map((entry) => entry[1]), ["resize", "sustained-slow-frame", "sustained-fast-frame"]);
});

test("ignores background stalls and resets its window when mode changes", () => {
  const controller = new AdaptiveResolutionController({
    targetFps: 60,
    modeTargetFps: { carrier: 50 },
    warmupSamples: 1,
    cooldownSamples: 1,
    smoothing: 1,
  });
  controller.setViewport(800, 600, 1);
  assert.equal(controller.sample(500).ignored, true);
  assert.equal(controller.samples, 0);
  controller.sample(16);
  assert.equal(controller.samples, 1);
  assert.equal(controller.setMode("carrier"), true);
  assert.equal(controller.samples, 0);
  assert.equal(controller.targetFrameMs, 20);
});

test("disabled adaptation still honors the quality-tier pixel ratio cap", () => {
  const controller = new AdaptiveResolutionController({ enabled: false, pixelRatioCap: 1.4 });
  controller.setViewport(1280, 720, 3);
  assert.equal(controller.pixelRatio, 1.4);
  assert.equal(controller.sample(40).changed, false);
  assert.equal(controller.scale, 1);
});
