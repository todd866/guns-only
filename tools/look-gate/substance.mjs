// Frame substance -- how much of this frame is actually a picture of something?
//
// The look gate scores palette and structure against an art corpus. Both are averages, and an
// average is comfortable on an empty frame: measured 2026-08-23, `combat-apex-72k` is roughly
// 85% featureless grey-white haze and scored paletteDistance 1.264 against a 3.6 ceiling. A
// frame with the world erased out of it has a very safe palette. Nothing in the gate could say
// "there is nothing in this picture", so nothing did.
//
// This module answers only that question. It says nothing about whether the frame is beautiful,
// correctly coloured, or the right scene -- other metrics own those. It reports:
//
//   liveFraction    fraction of tiles carrying local detail (structure you could see)
//   flatFraction    fraction of tiles that are featureless
//   dominantShare   fraction of pixels sitting within a small distance of one single colour
//
// dominantShare is the erasure detector. A haze that has eaten the world drives one colour to
// dominate the frame; a real landscape, however soft, does not.

import { decodePng, downsampleRgba } from "./features.mjs";

// Work on a downsampled copy: substance is a composition-scale question, and full resolution
// would let per-pixel dither masquerade as detail.
const WORK_EDGE = 256;
const TILE = 16;

// A tile whose luma standard deviation clears this carries visible local detail. Calibrated
// against the five Ukraine captures: it separates open sky and haze from ground, treeline and
// river without flagging a clean sky gradient as detail (a gradient is smooth WITHIN a tile).
const LIVE_STDDEV = 2.0;

// Radius in RGB space around the modal colour. Wide enough to absorb the banding of a smooth
// haze, narrow enough that distinct terrain tones fall outside it.
const DOMINANT_RADIUS = 18;

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Modal colour by coarse histogram, then the centroid of that bin. Taking the centroid rather
// than the bin centre keeps a gradient that straddles a bin boundary from splitting in two.
function dominantCentroid(data, pixels) {
  const bins = new Map();
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const key = ((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3);
    const bin = bins.get(key);
    if (bin) {
      bin.n += 1; bin.r += data[o]; bin.g += data[o + 1]; bin.b += data[o + 2];
    } else {
      bins.set(key, { n: 1, r: data[o], g: data[o + 1], b: data[o + 2] });
    }
  }
  let best = null;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  if (!best) return [0, 0, 0];
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

export function frameSubstance(image) {
  const work = downsampleRgba(image, WORK_EDGE);
  const { width, height, data } = work;
  const pixels = width * height;

  const [cr, cg, cb] = dominantCentroid(data, pixels);
  const radiusSq = DOMINANT_RADIUS * DOMINANT_RADIUS;
  let near = 0;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const dr = data[o] - cr, dg = data[o + 1] - cg, db = data[o + 2] - cb;
    if (dr * dr + dg * dg + db * db <= radiusSq) near += 1;
  }

  let live = 0;
  let tiles = 0;
  for (let ty = 0; ty + TILE <= height; ty += TILE) {
    for (let tx = 0; tx + TILE <= width; tx += TILE) {
      let sum = 0;
      let sumSq = 0;
      for (let y = ty; y < ty + TILE; y += 1) {
        for (let x = tx; x < tx + TILE; x += 1) {
          const o = (y * width + x) * 4;
          const l = luma(data[o], data[o + 1], data[o + 2]);
          sum += l;
          sumSq += l * l;
        }
      }
      const n = TILE * TILE;
      const variance = Math.max(0, sumSq / n - (sum / n) ** 2);
      tiles += 1;
      if (Math.sqrt(variance) >= LIVE_STDDEV) live += 1;
    }
  }

  const liveFraction = tiles === 0 ? 0 : live / tiles;
  return {
    liveFraction,
    flatFraction: 1 - liveFraction,
    dominantShare: pixels === 0 ? 1 : near / pixels,
    tiles,
    width,
    height,
  };
}

export function frameSubstanceFromBuffer(buffer) {
  return frameSubstance(decodePng(buffer));
}

// Calibrated 2026-08-23 against the five Ukraine captures, each one looked at before its number
// was used. Measured live% / dominant%:
//
//   steppe-low       79.4 / 27.7   reads as a picture
//   corridor-mid     80.0 / 27.5   reads as a picture
//   high-oblique     82.5 / 30.5   reads as a picture
//   zoom-apex        75.0 / 43.7   bottom third only; the rest is milk
//   combat-apex-72k  46.3 / 68.0   world erased
//
// dominantShare separates cleanly at the break between 30.5 and 43.7, so the ceiling sits at 35
// and flags BOTH hazed-out views. Setting it above zoom-apex would have been the original sin
// repeated -- fitting a threshold to a frame nobody had looked at. liveFraction only isolates
// combat-apex-72k; it is kept as a second, weaker check rather than dropped, because it catches
// erasure that happens to be multi-coloured, which dominantShare would miss.
//
// Five captures, one theatre, one time of day. Re-measure before trusting these elsewhere.
export const SUBSTANCE_FLOORS = Object.freeze({
  minLiveFraction: 0.60,
  maxDominantShare: 0.35,
});

// Can a pixel difference in this frame mean anything? A view that is mostly one flat colour
// cannot carry proof that a terrain edit landed: whatever moved, it moved somewhere the
// picture was not looking. Separate from `bin/seen`'s reproducibility gate, and both must pass.
export function proofSurface(substance, floors = SUBSTANCE_FLOORS) {
  const reasons = [];
  if (substance.liveFraction < floors.minLiveFraction) {
    reasons.push(
      `only ${(substance.liveFraction * 100).toFixed(0)}% of tiles carry detail ` +
      `(floor ${(floors.minLiveFraction * 100).toFixed(0)}%)`,
    );
  }
  if (substance.dominantShare > floors.maxDominantShare) {
    reasons.push(
      `${(substance.dominantShare * 100).toFixed(0)}% of pixels are one colour ` +
      `(ceiling ${(floors.maxDominantShare * 100).toFixed(0)}%)`,
    );
  }
  return { usable: reasons.length === 0, reasons };
}
