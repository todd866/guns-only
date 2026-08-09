import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { SCENERY_LIMITS, scoreRgbaImage, verdict } from "../emptiness.mjs";

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function fixture(width = 720, height = 450, options = {}) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const canonicalX = x * 720 / width;
      const canonicalY = y * 450 / height;
      const unitY = y / height;
      let red;
      let green;
      let blue;
      if (unitY < 0.45) {
        const horizon = unitY / 0.45;
        red = 92 + horizon * 52;
        green = 132 + horizon * 43;
        blue = 172 + horizon * 30;
        if (options.warmSky) {
          red += 72;
          green += 26;
          blue -= 34;
        }
        if (options.skyStipple) {
          const grit = ((Math.floor(canonicalX) * 17 + Math.floor(canonicalY) * 29) % 11) - 5;
          red += grit * 3.1;
          green += grit * 3.1;
          blue += grit * 3.1;
        }
      } else if (options.flatGround) {
        red = 72;
        green = 105;
        blue = 57;
      } else {
        const macro = Math.sin(canonicalX / 67) * 14
          + Math.sin((canonicalX + canonicalY * 0.7) / 41) * 10;
        const meso = Math.sin(canonicalX / 15) * Math.sin(canonicalY / 19) * 8;
        const near = Math.sin(canonicalX / 4.7 + canonicalY / 6.1) * 2.2;
        red = 66 + macro * 0.72 + meso * 0.58 + near;
        green = 103 + macro + meso * 0.76 + near;
        blue = 54 + macro * 0.48 + meso * 0.38 + near * 0.55;
        if (options.noiseOnly) {
          const hash = ((Math.floor(canonicalX) * 73 + Math.floor(canonicalY) * 151) % 19) - 9;
          red = 72 + hash * 2.6;
          green = 105 + hash * 2.6;
          blue = 57 + hash * 2.6;
        }
      }

      const inDarkSlab = options.darkSlab
        && unitY > 0.52 && unitY < 0.82 && x / width > 0.28 && x / width < 0.68;
      const inPaleSlab = options.paleSlab
        && unitY > 0.54 && unitY < 0.80 && x / width > 0.31 && x / width < 0.72;
      if (inDarkSlab) [red, green, blue] = [12, 12, 12];
      if (inPaleSlab) [red, green, blue] = [190, 191, 189];

      if (options.crispObjects && unitY > 0.50) {
        const trunk = Math.abs((canonicalX % 83) - 41) < 1.4
          && canonicalY % 96 > 18 && canonicalY % 96 < 74;
        const crown = Math.hypot((canonicalX % 83) - 41, (canonicalY % 96) - 20) < 11;
        if (trunk || crown) [red, green, blue] = crown ? [32, 76, 34] : [58, 45, 28];
      }

      const offset = (y * width + x) * 4;
      png.data[offset] = clampByte(red);
      png.data[offset + 1] = clampByte(green);
      png.data[offset + 2] = clampByte(blue);
      png.data[offset + 3] = 255;
    }
  }
  return { width, height, data: png.data };
}

test("smooth sky and multi-scale terrain pass", () => {
  const score = scoreRgbaImage(fixture());
  assert.equal(score.pass, true, score.failures.join("; "));
  assert.ok(score.groundMesoTileFraction >= SCENERY_LIMITS.groundMesoTileFractionMin);
});

test("flat green wash fails the meso-structure floor", () => {
  const score = scoreRgbaImage(fixture(720, 450, { flatGround: true }));
  assert.equal(score.pass, false);
  assert.ok(score.groundMesoTileFraction < SCENERY_LIMITS.groundMesoTileFractionMin);
});

test("hash grit cannot substitute for multi-scale ground structure", () => {
  const score = scoreRgbaImage(fixture(720, 450, { noiseOnly: true }));
  assert.equal(score.pass, false);
  assert.ok(
    score.groundMicroDominantFraction > SCENERY_LIMITS.groundMicroDominantFractionMax,
    JSON.stringify(score),
  );
});

test("stippled sky fails the high-frequency veto", () => {
  const score = scoreRgbaImage(fixture(720, 450, { skyStipple: true }));
  assert.equal(score.pass, false);
  assert.ok(score.skyHighFrequencyP90 > SCENERY_LIMITS.skyHighFrequencyP90Max
    || score.skyHighFrequencyFraction > SCENERY_LIMITS.skyHighFrequencyFractionMax);
});

test("large crushed-shadow and neutral-pale slabs fail", () => {
  const shadow = scoreRgbaImage(fixture(720, 450, { darkSlab: true }));
  const pale = scoreRgbaImage(fixture(720, 450, { paleSlab: true }));
  assert.equal(shadow.pass, false);
  assert.ok(shadow.groundShadowComponentFraction
    > SCENERY_LIMITS.groundShadowComponentFractionMax);
  assert.equal(pale.pass, false);
  assert.ok(pale.groundPaleComponentFraction
    > SCENERY_LIMITS.groundPaleComponentFractionMax);
});

test("localized crisp trees remain legal over coherent terrain", () => {
  const score = scoreRgbaImage(fixture(720, 450, { crispObjects: true }));
  assert.equal(score.pass, true, score.failures.join("; "));
});

test("canonical box sampling keeps verdict stable across output resolutions", () => {
  const base = scoreRgbaImage(fixture(720, 450));
  const large = scoreRgbaImage(fixture(1440, 900));
  const huge = scoreRgbaImage(fixture(2160, 1350));
  assert.equal(base.pass, true, base.failures.join("; "));
  assert.equal(large.pass, true, large.failures.join("; "));
  assert.equal(huge.pass, true, huge.failures.join("; "));
  assert.ok(Math.abs(base.groundMesoTileFraction - large.groundMesoTileFraction) < 0.06);
  assert.ok(Math.abs(base.groundMesoTileFraction - huge.groundMesoTileFraction) < 0.06);
});

test("fixed Cobra views fail closed when the blue-sky mask is absent", () => {
  const score = scoreRgbaImage(fixture(720, 450, { warmSky: true }));
  assert.equal(score.pass, false);
  assert.ok(score.skyMaskCoverage < SCENERY_LIMITS.skyMaskCoverageMin);
});

test("verdict aggregates named stills", () => {
  const good = scoreRgbaImage(fixture());
  const bad = scoreRgbaImage(fixture(720, 450, { flatGround: true }));
  const result = verdict({ "mid-gorge.png": bad, "camp-ember.png": good });
  assert.equal(result.pass, false);
  assert.match(result.message, /lacks coherent visual depth/);
  assert.match(result.message, /mid-gorge/);
});
