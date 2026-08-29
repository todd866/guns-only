import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { EMPTINESS_FLOORS, scoreRgbaImage, verdict } from "../emptiness.mjs";

function solidPng(width, height, rgb) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    png.data[o] = rgb[0];
    png.data[o + 1] = rgb[1];
    png.data[o + 2] = rgb[2];
    png.data[o + 3] = 255;
  }
  return { width, height, data: png.data };
}

function noisyPng(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      // Vertical palm trunks + frond blobs in the inset ground band (matches gate crop).
      const inBand = y > height * 0.45 && y < height * 0.88
        && x > width * 0.22 && x < width * 0.78;
      const trunk = inBand && (x % 23 < 2) ? 1 : 0;
      const frond = inBand && ((x + y) % 19 < 4) && y < height * 0.62 ? 1 : 0;
      const grit = ((x * 17 + y * 11) % 13);
      if (trunk || frond) {
        png.data[o] = 35 + grit;
        png.data[o + 1] = 70 + grit * 4;
        png.data[o + 2] = 30 + grit;
      } else {
        png.data[o] = 88 + grit * 3;
        png.data[o + 1] = 108 + grit * 2;
        png.data[o + 2] = 68 + grit;
      }
      png.data[o + 3] = 255;
    }
  }
  return { width, height, data: png.data };
}

test("plastic wash fails the emptiness floors", () => {
  const score = scoreRgbaImage(solidPng(320, 200, [95, 120, 70]));
  assert.equal(score.pass, false);
  assert.ok(score.failures.length >= 1);
  assert.ok(score.groundEdgeEnergy < EMPTINESS_FLOORS.groundEdgeEnergy);
});

test("structured near-field clutter can pass", () => {
  const score = scoreRgbaImage(noisyPng(360, 240));
  assert.equal(score.pass, true, score.failures.join("; "));
});

test("verdict aggregates named stills", () => {
  const bad = scoreRgbaImage(solidPng(160, 120, [80, 100, 60]));
  const good = scoreRgbaImage(noisyPng(360, 240));
  const result = verdict({ "mid-gorge.png": bad, "camp.png": good });
  assert.equal(result.pass, false);
  assert.match(result.message, /this is shit, do better/);
  assert.match(result.message, /mid-gorge/);
});

// Added 2026-08-23, when this gate was wired into bin/check. The three tests above had existed
// since Build 295 and had never run: tools/cobra-scenery-gate/node_modules was never installed,
// and nothing in bin/ or .github/ referenced the gate. These cover the gaps that mattered once
// it started running for real.

test("a gentle gradient is still a wash", () => {
  // The 2026-08-08 failure was not a constant colour, it was a smooth wash. A gate that only
  // catches literally-uniform pixels would have passed the stills that caused it.
  const png = new PNG({ width: 360, height: 240 });
  for (let y = 0; y < 240; y += 1) {
    for (let x = 0; x < 360; x += 1) {
      const o = (y * 360 + x) * 4;
      const v = 70 + Math.round((y / 239) * 30);
      png.data[o] = v; png.data[o + 1] = v + 34; png.data[o + 2] = v - 8; png.data[o + 3] = 255;
    }
  }
  assert.equal(scoreRgbaImage({ width: 360, height: 240, data: png.data }).pass, false);
});

test("content outside the ground band cannot rescue a washed band", () => {
  // HUD chrome and sky detail inflate a whole-frame laplacian; the inset crop exists to ignore
  // them. If detail above the band could carry the score, the gate would pass a washed gorge.
  const png = new PNG({ width: 360, height: 240 });
  for (let y = 0; y < 240; y += 1) {
    for (let x = 0; x < 360; x += 1) {
      const o = (y * 360 + x) * 4;
      const sky = y < 240 * 0.45;
      png.data[o] = sky ? (x * 31) % 255 : 95;
      png.data[o + 1] = sky ? (y * 17) % 255 : 120;
      png.data[o + 2] = sky ? 200 : 70;
      png.data[o + 3] = 255;
    }
  }
  assert.equal(scoreRgbaImage({ width: 360, height: 240, data: png.data }).pass, false);
});

test("an empty ground band is a failure, not a divide by zero", () => {
  const score = scoreRgbaImage({ width: 0, height: 0, data: Buffer.alloc(0) });
  assert.equal(score.pass, false);
  assert.deepEqual(score.failures, ["empty-ground-band"]);
});

test("floors are frozen so a red gate cannot be quietly widened", () => {
  assert.ok(Object.isFrozen(EMPTINESS_FLOORS));
  assert.equal(EMPTINESS_FLOORS.groundEdgeEnergy, 4.8);
  assert.equal(EMPTINESS_FLOORS.groundSpatialVariance, 180.0);
  assert.equal(EMPTINESS_FLOORS.groundHeterogeneity, 0.1);
});
