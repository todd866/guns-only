import assert from "node:assert/strict";
import test from "node:test";
import { encodeSolidPng } from "../features.mjs";
import {
  SUBSTANCE_FLOORS,
  frameSubstance,
  frameSubstanceFromBuffer,
  proofSurface,
} from "../substance.mjs";

// An RGBA image built from a per-pixel callback, so a test can state the picture it means.
function image(width, height, fn) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fn(x, y);
      const o = (y * width + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

test("a solid field is entirely dominated by one colour and carries no detail", () => {
  const s = frameSubstanceFromBuffer(encodeSolidPng(256, 256, [190, 193, 196]));
  assert.equal(s.dominantShare, 1);
  assert.equal(s.liveFraction, 0);
  assert.equal(s.flatFraction, 1);
});

test("the erased frame is rejected as a proof surface", () => {
  const verdict = proofSurface({ liveFraction: 0.463, dominantShare: 0.680 });
  assert.equal(verdict.usable, false);
  // Both floors are breached by the real combat-apex-72k measurement, so both are reported.
  assert.equal(verdict.reasons.length, 2);
  assert.match(verdict.reasons.join(" "), /one colour/);
});

test("a frame that is mostly one colour is rejected even when it is not flat", () => {
  // Fine dither everywhere keeps liveFraction high; the picture is still absent.
  const verdict = proofSurface({ liveFraction: 0.95, dominantShare: 0.62 });
  assert.equal(verdict.usable, false);
  assert.equal(verdict.reasons.length, 1);
});

test("the three views that read as pictures are accepted", () => {
  for (const [live, dominant] of [[0.794, 0.277], [0.800, 0.275], [0.825, 0.305]]) {
    assert.equal(proofSurface({ liveFraction: live, dominantShare: dominant }).usable, true);
  }
});

test("zoom-apex sits on the rejected side of the calibrated break", () => {
  // Deliberate: it was accepted by the look gate and should not have been.
  assert.equal(proofSurface({ liveFraction: 0.750, dominantShare: 0.437 }).usable, false);
});

test("a smooth gradient is not mistaken for detail", () => {
  // A clean sky ramp is smooth WITHIN any tile, so it must not inflate liveFraction.
  const s = frameSubstance(image(256, 256, (_x, y) => {
    const v = 120 + Math.round((y / 255) * 100);
    return [v, v, v + 6];
  }));
  assert.ok(s.liveFraction < 0.1, `gradient read as detail: ${s.liveFraction}`);
});

test("structured content registers as detail", () => {
  const s = frameSubstance(image(256, 256, (x, y) => (
    ((x >> 2) + (y >> 2)) % 2 === 0 ? [40, 90, 40] : [200, 210, 160]
  )));
  assert.ok(s.liveFraction > 0.9, `structure not seen: ${s.liveFraction}`);
  assert.ok(s.dominantShare < 0.6);
});

test("floors are the calibrated values and are frozen", () => {
  assert.equal(SUBSTANCE_FLOORS.minLiveFraction, 0.6);
  assert.equal(SUBSTANCE_FLOORS.maxDominantShare, 0.35);
  assert.ok(Object.isFrozen(SUBSTANCE_FLOORS));
});
