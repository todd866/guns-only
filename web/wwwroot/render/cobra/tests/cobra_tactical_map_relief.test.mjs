import assert from "node:assert/strict";
import test from "node:test";
import { bakeCobraTacticalRelief } from "../cobra_tactical_map_relief.js";

const BOUNDS = { minEastM: 0, maxEastM: 1000, minNorthM: 0, maxNorthM: 1000 };

/** A ridge running east-west, so height depends only on north. */
const ridge = (eastM, northM) => 200 + 300 * Math.exp(-((northM - 500) ** 2) / (2 * 120 ** 2));

function pixel(relief, row, column) {
  const index = (row * relief.widthPx + column) * 4;
  return [relief.rgba[index], relief.rgba[index + 1], relief.rgba[index + 2], relief.rgba[index + 3]];
}

test("bakes an opaque square buffer of the requested size", () => {
  const relief = bakeCobraTacticalRelief({ sampleHeightM: ridge, bounds: BOUNDS, sizePx: 32 });
  assert.equal(relief.widthPx, 32);
  assert.equal(relief.heightPx, 32);
  assert.equal(relief.rgba.length, 32 * 32 * 4);
  for (let index = 3; index < relief.rgba.length; index += 4) {
    assert.equal(relief.rgba[index], 255, "relief must be fully opaque");
  }
});

test("reports the true height range of the sampled terrain", () => {
  const relief = bakeCobraTacticalRelief({ sampleHeightM: ridge, bounds: BOUNDS, sizePx: 64 });
  assert.ok(relief.maxHeightM > 450, `ridge crest should be near 500, got ${relief.maxHeightM}`);
  assert.ok(relief.minHeightM < 220, `valley floor should be near 200, got ${relief.minHeightM}`);
});

test("row 0 is the NORTHERN edge, matching the map projection", () => {
  // A north-up chart with a mirrored relief is worse than no relief: every marker would sit on
  // the wrong side of the ridge it is actually behind.
  const northHigh = (eastM, northM) => northM;
  const relief = bakeCobraTacticalRelief({
    sampleHeightM: northHigh, bounds: BOUNDS, sizePx: 16,
  });
  const top = pixel(relief, 0, 8);
  const bottom = pixel(relief, 15, 8);
  const luma = ([r, g, b]) => r + g + b;
  assert.ok(luma(top) > luma(bottom),
    "the northern (high) edge must render brighter than the southern (low) edge");
});

test("terrain at or below the water height renders as water, not as ground", () => {
  const bowl = (eastM, northM) => (northM < 500 ? 100 : 400);
  const relief = bakeCobraTacticalRelief({
    sampleHeightM: bowl, bounds: BOUNDS, sizePx: 16, waterHeightM: 150,
  });
  const dryNorth = pixel(relief, 2, 8);
  const wetSouth = pixel(relief, 13, 8);
  // Water is the one cool region: blue must dominate green there, and not on dry ground.
  assert.ok(wetSouth[2] > wetSouth[1], `expected water blue-dominant, got ${wetSouth}`);
  assert.ok(dryNorth[1] >= dryNorth[2], `expected ground green-dominant, got ${dryNorth}`);
});

test("flat terrain still renders without dividing by a zero relief range", () => {
  const relief = bakeCobraTacticalRelief({
    sampleHeightM: () => 200, bounds: BOUNDS, sizePx: 8,
  });
  for (const value of relief.rgba) assert.ok(Number.isFinite(value));
});

test("a non-finite height sample cannot poison the buffer", () => {
  const relief = bakeCobraTacticalRelief({
    sampleHeightM: (e, n) => (n > 500 ? Number.NaN : 300), bounds: BOUNDS, sizePx: 8,
  });
  for (const value of relief.rgba) assert.ok(Number.isFinite(value));
});

test("rejects a missing sampler and degenerate bounds", () => {
  assert.throws(() => bakeCobraTacticalRelief({ bounds: BOUNDS }), TypeError);
  assert.throws(() => bakeCobraTacticalRelief({
    sampleHeightM: ridge,
    bounds: { minEastM: 0, maxEastM: 0, minNorthM: 0, maxNorthM: 1000 },
  }), TypeError);
});

test("the bake is deterministic", () => {
  const a = bakeCobraTacticalRelief({ sampleHeightM: ridge, bounds: BOUNDS, sizePx: 24 });
  const b = bakeCobraTacticalRelief({ sampleHeightM: ridge, bounds: BOUNDS, sizePx: 24 });
  assert.deepEqual(Array.from(a.rgba), Array.from(b.rgba));
});
