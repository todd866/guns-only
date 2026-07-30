import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveResolutionController } from "../adaptive_resolution.js";

test("drops quickly under sustained load and recovers asymmetrically", () => {
  const changes = [];
  const controller = new AdaptiveResolutionController({
    pixelRatioCap: 1.5,
    maxRenderPixels: 10_000_000,
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

test("an explicitly foreground severe stall is clamped and drives a resolution drop", () => {
  const controller = new AdaptiveResolutionController({
    targetFps: 60,
    warmupSamples: 1,
    cooldownSamples: 1,
    smoothing: 1,
    minScale: 0.6,
    stepDown: 0.1,
  });
  controller.setViewport(800, 600, 1);
  const result = controller.sample(500, { activeForeground: true });

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.equal(result.scale, 0.9);
  assert.equal(result.emaFrameMs, 250);
});

test("disabled adaptation still honors the quality-tier pixel ratio cap", () => {
  const controller = new AdaptiveResolutionController({ enabled: false, pixelRatioCap: 1.4 });
  controller.setViewport(1280, 720, 3);
  assert.equal(controller.pixelRatio, 1.4);
  assert.equal(controller.sample(40).changed, false);
  assert.equal(controller.scale, 1);
});

test("applies the viewport pixel budget before the adaptive scale", () => {
  const changes = [];
  const controller = new AdaptiveResolutionController({
    pixelRatioCap: 2,
    maxRenderPixels: 2_100_000,
    minScale: 0.6,
    warmupSamples: 1,
    cooldownSamples: 1,
    smoothing: 1,
    onChange: (ratio, metadata) => changes.push({ ratio, metadata }),
  });
  controller.setViewport(1366, 1024, 2);

  const budgetRatio = Math.sqrt(2_100_000 / (1366 * 1024));
  assert.equal(controller.pixelRatio, budgetRatio);
  assert.equal(controller.maximumPixelRatio, budgetRatio);
  assert.ok(controller.pixelRatio ** 2 * 1366 * 1024 <= 2_100_000);
  assert.equal(changes.at(-1).metadata.maxRenderPixels, 2_100_000);
  assert.equal(changes.at(-1).metadata.maximumPixelRatio, budgetRatio);

  controller.reset(0.6);
  assert.equal(controller.pixelRatio, 0.74);
  assert.ok(controller.pixelRatio < budgetRatio);
});

test("recomputes the hard pixel ceiling on viewport changes", () => {
  const controller = new AdaptiveResolutionController({
    pixelRatioCap: 2,
    maxRenderPixels: 3_700_000,
  });
  controller.setViewport(1920, 1080, 2);
  assert.equal(controller.pixelRatio, Math.sqrt(3_700_000 / (1920 * 1080)));

  controller.setViewport(800, 600, 2);
  assert.equal(controller.pixelRatio, 2);
  assert.equal(controller.status().maxRenderPixels, 3_700_000);
});

test("disabled adaptation still enforces the render-pixel budget", () => {
  const controller = new AdaptiveResolutionController({
    enabled: false,
    pixelRatioCap: 3,
    maxRenderPixels: 1_300_000,
  });
  controller.setViewport(1920, 1080, 3);
  assert.equal(controller.maximumPixelRatio, Math.sqrt(1_300_000 / (1920 * 1080)));
  assert.equal(controller.pixelRatio, 0.79);
  assert.ok(controller.pixelRatio ** 2 * 1920 * 1080 <= 1_300_000);
});
