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
