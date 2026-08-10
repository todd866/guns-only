/**
 * Cobra corridor scenery emptiness gate.
 *
 * Owner 2026-08-08: overnight "scenery passes" self-certified while mid-gorge stills were
 * plastic green wash. This scores PNGs on ground-band structure; plastic wash fails closed.
 *
 *   node tools/cobra-scenery-gate/score.mjs --shots /path/to/stills
 *
 * Floors are calibrated so current overnight stills FAIL and a textured near-field still
 * has a path to PASS. Not a Battlefield Vietnam pixel match — an emptiness veto.
 */

import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const GROUND_START = 0.45;
const GROUND_END = 0.88;
const X_INSET = 0.22;
const MAX_EDGE = 360;

/** Minimum structure for a mid-gorge / set-piece still to count as "not shit". */
export const EMPTINESS_FLOORS = Object.freeze({
  // HUD chrome inflates whole-frame laplacian; score the inset ground band only.
  groundEdgeEnergy: 4.8,
  groundSpatialVariance: 180.0,
  // Fraction of inset ground pixels that deviate from the band mean (trees/huts/rocks).
  groundHeterogeneity: 0.10,
});

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function downsample(png) {
  const { width, height, data } = png;
  const long = Math.max(width, height);
  if (long <= MAX_EDGE) {
    return { width, height, data: Buffer.from(data) };
  }
  const scale = MAX_EDGE / long;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

export function scoreRgbaImage(image) {
  const { width, height, data } = image;
  const y0 = Math.floor(height * GROUND_START);
  const y1 = Math.min(height - 1, Math.ceil(height * GROUND_END));
  const x0 = Math.floor(width * X_INSET);
  const x1 = Math.ceil(width * (1 - X_INSET));
  const gray = new Float64Array(width * height);
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  let groundN = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      gray[y * width + x] = luma(data[i], data[i + 1], data[i + 2]);
      if (y >= y0 && y < y1 && x >= x0 && x < x1) {
        meanR += data[i];
        meanG += data[i + 1];
        meanB += data[i + 2];
        groundN += 1;
      }
    }
  }
  meanR /= Math.max(1, groundN);
  meanG /= Math.max(1, groundN);
  meanB /= Math.max(1, groundN);

  let edgeSum = 0;
  let varSum = 0;
  let varSq = 0;
  let hetero = 0;
  let n = 0;
  for (let y = Math.max(y0, 1); y < Math.min(y1, height - 1); y += 1) {
    for (let x = Math.max(x0, 1); x < Math.min(x1, width - 1); x += 1) {
      const i = y * width + x;
      const c = gray[i];
      const edge = Math.hypot(gray[i + 1] - gray[i - 1], gray[i + width] - gray[i - width]);
      edgeSum += edge;
      varSum += c;
      varSq += c * c;
      const pi = i * 4;
      const dr = data[pi] - meanR;
      const dg = data[pi + 1] - meanG;
      const db = data[pi + 2] - meanB;
      if (dr * dr + dg * dg + db * db > 28 * 28) hetero += 1;
      n += 1;
    }
  }
  if (n === 0) {
    return {
      groundEdgeEnergy: 0,
      groundSpatialVariance: 0,
      groundHeterogeneity: 0,
      pass: false,
      failures: ["empty-ground-band"],
    };
  }
  const meanGry = varSum / n;
  const metrics = {
    groundEdgeEnergy: edgeSum / n,
    groundSpatialVariance: Math.max(0, varSq / n - meanGry * meanGry),
    groundHeterogeneity: hetero / n,
  };
  const failures = [];
  for (const [key, floor] of Object.entries(EMPTINESS_FLOORS)) {
    if (metrics[key] < floor) {
      failures.push(`${key}=${metrics[key].toFixed(3)} < ${floor}`);
    }
  }
  return { ...metrics, pass: failures.length === 0, failures };
}

export async function scorePngFile(path) {
  const buffer = await readFile(path);
  const png = PNG.sync.read(buffer);
  return scoreRgbaImage(downsample(png));
}

export function verdict(scoresByName) {
  const failures = [];
  for (const [name, score] of Object.entries(scoresByName)) {
    if (!score.pass) {
      failures.push(`${name}: ${score.failures.join("; ")}`);
    }
  }
  return {
    pass: failures.length === 0,
    failures,
    message: failures.length === 0
      ? "cobra scenery gate PASS"
      : `cobra scenery gate FAIL — this is shit, do better:\n- ${failures.join("\n- ")}`,
  };
}
