import assert from "node:assert/strict";
import test from "node:test";
import { derivePostStackPlan, threeToneMappingForName } from "../post_stack.js";
import { ACESFilmicToneMapping, NoToneMapping } from "../../../vendor/three.module.js";

test("desktop pass order stays linear until one final output transform", () => {
  const plan = derivePostStackPlan({
    postProcessing: {
      enabled: true,
      antialiasing: "smaa",
      bloom: { enabled: true },
    },
  }, { halfFloatColorBuffer: true, supportsSmaa: true });
  assert.equal(plan.mode, "composer");
  assert.deepEqual(plan.passes, [
    "scene-linear-hdr",
    "threshold-bloom",
    "smaa",
    "output-aces-srgb",
  ]);
  assert.equal(plan.passes.filter((pass) => pass.startsWith("output-")).length, 1);
});

test("SMAA degrades to FXAA and unsupported HDR degrades to direct rendering", () => {
  const config = {
    postProcessing: { enabled: true, antialiasing: "smaa", bloom: { enabled: false } },
  };
  assert.deepEqual(
    derivePostStackPlan(config, { halfFloatColorBuffer: true, supportsSmaa: false }).passes,
    ["scene-linear-hdr", "fxaa", "output-aces-srgb"],
  );
  const direct = derivePostStackPlan(config, { halfFloatColorBuffer: false });
  assert.equal(direct.mode, "direct");
  assert.equal(direct.reason, "half-float-unavailable");
  const ldr = derivePostStackPlan({ postProcessing: { enabled: true, hdr: false } });
  assert.equal(ldr.mode, "direct");
  assert.equal(ldr.reason, "profile-hdr-disabled");
});

test("r160 tone mapping names have deterministic safe fallbacks", () => {
  assert.equal(threeToneMappingForName("none"), NoToneMapping);
  assert.equal(threeToneMappingForName("aces_filmic"), ACESFilmicToneMapping);
  assert.equal(threeToneMappingForName("neutral"), ACESFilmicToneMapping);
  assert.equal(threeToneMappingForName("unknown"), ACESFilmicToneMapping);
});
