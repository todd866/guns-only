/// Soft-world look features: palette + ground-band structure (no ML).
/// Spec: docs/superpowers/specs/2026-07-29-soft-world-look-gate-design.md

import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const GROUND_BAND_START = 0.45;
const MAX_EDGE = 320;

function srgbToLinear(u) {
  const c = u / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToXyz(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return {
    x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    y: R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
    z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
  };
}

function labF(t) {
  return t > 0.008856 ? t ** (1 / 3) : (7.787 * t) + 16 / 116;
}

function xyzToLab(x, y, z) {
  const fx = labF(x / 0.95047);
  const fy = labF(y / 1.0);
  const fz = labF(z / 1.08883);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function rgbToLab(r, g, b) {
  const { x, y, z } = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value | 0));
}

export function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

export function downsampleRgba(image, maxEdge = MAX_EDGE) {
  const { width, height, data } = image;
  const long = Math.max(width, height);
  if (long <= maxEdge) return image;
  const scale = maxEdge / long;
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
      out[di + 3] = data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

function bandMeans(image, y0Frac, y1Frac) {
  const { width, height, data } = image;
  const y0 = Math.floor(height * y0Frac);
  const y1 = Math.min(height, Math.ceil(height * y1Frac));
  let L = 0;
  let a = 0;
  let b = 0;
  let warm = 0;
  let cool = 0;
  let satSum = 0;
  let n = 0;
  const satHist = new Float64Array(16);
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const bl = data[i + 2];
      const lab = rgbToLab(r, g, bl);
      L += lab.L;
      a += lab.a;
      b += lab.b;
      if (lab.b >= 0) warm += 1;
      else cool += 1;
      const max = Math.max(r, g, bl);
      const min = Math.min(r, g, bl);
      const sat = max === 0 ? 0 : (max - min) / max;
      satSum += sat;
      satHist[Math.min(15, Math.floor(sat * 16))] += 1;
      n += 1;
    }
  }
  if (n === 0) {
    return {
      meanLab: { L: 0, a: 0, b: 0 },
      warmCoolRatio: 1,
      meanSaturation: 0,
      satHist: [...satHist],
    };
  }
  for (let i = 0; i < satHist.length; i += 1) satHist[i] /= n;
  return {
    meanLab: { L: L / n, a: a / n, b: b / n },
    warmCoolRatio: warm / Math.max(1, cool),
    meanSaturation: satSum / n,
    satHist: [...satHist],
  };
}

function groundStructure(image) {
  const { width, height, data } = image;
  const y0 = Math.floor(height * GROUND_BAND_START);
  let lapSum = 0;
  let lapSq = 0;
  let edgeSum = 0;
  let varSum = 0;
  let varSq = 0;
  let n = 0;
  const gray = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      gray[y * width + x] = luma(data[i], data[i + 1], data[i + 2]);
    }
  }
  for (let y = Math.max(y0, 1); y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const c = gray[i];
      const lap = Math.abs(
        4 * c - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width],
      );
      const gx = gray[i + 1] - gray[i - 1];
      const gy = gray[i + width] - gray[i - width];
      const edge = Math.hypot(gx, gy);
      lapSum += lap;
      lapSq += lap * lap;
      edgeSum += edge;
      varSum += c;
      varSq += c * c;
      n += 1;
    }
  }
  if (n === 0) {
    return { laplacianVariance: 0, edgeEnergy: 0, spatialVariance: 0 };
  }
  const meanLap = lapSum / n;
  const laplacianVariance = Math.max(0, lapSq / n - meanLap * meanLap);
  const meanG = varSum / n;
  const spatialVariance = Math.max(0, varSq / n - meanG * meanG);
  return {
    laplacianVariance,
    edgeEnergy: edgeSum / n,
    spatialVariance,
  };
}

export async function extractFeaturesFromFile(pngPath) {
  const buffer = await readFile(pngPath);
  return extractFeaturesFromBuffer(buffer, { path: pngPath });
}

export function extractFeaturesFromBuffer(buffer, meta = {}) {
  const full = decodePng(buffer);
  const image = downsampleRgba(full);
  const sky = bandMeans(image, 0, GROUND_BAND_START);
  const ground = bandMeans(image, GROUND_BAND_START, 1);
  const structure = groundStructure(image);
  return Object.freeze({
    path: meta.path ?? null,
    width: full.width,
    height: full.height,
    sampleWidth: image.width,
    sampleHeight: image.height,
    sky,
    ground,
    structure,
    warmCoolRatio: ground.warmCoolRatio * 0.65 + sky.warmCoolRatio * 0.35,
    groundLabB: ground.meanLab.b,
    skyLabB: sky.meanLab.b,
    groundSaturation: ground.meanSaturation,
    groundEdgeEnergy: structure.edgeEnergy,
    groundLaplacianVariance: structure.laplacianVariance,
    groundSpatialVariance: structure.spatialVariance,
  });
}

function histL1(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum;
}

export function paletteDistance(capture, ref) {
  const dWarm = Math.abs(
    Math.log1p(capture.warmCoolRatio) - Math.log1p(ref.warmCoolRatio),
  );
  const dGroundB = Math.abs(capture.groundLabB - ref.groundLabB) / 40;
  const dSkyB = Math.abs(capture.skyLabB - ref.skyLabB) / 40;
  const dSat = Math.abs(capture.groundSaturation - ref.groundSaturation);
  const dHist = histL1(capture.ground.satHist, ref.ground.satHist);
  return dWarm * 0.35 + dGroundB * 0.25 + dSkyB * 0.15 + dSat * 0.15 + dHist * 0.35;
}

export function structureDistance(capture, ref) {
  const eCap = Math.log1p(capture.groundEdgeEnergy);
  const eRef = Math.log1p(ref.groundEdgeEnergy);
  const lCap = Math.log1p(capture.groundLaplacianVariance);
  const lRef = Math.log1p(ref.groundLaplacianVariance);
  const vCap = Math.log1p(capture.groundSpatialVariance);
  const vRef = Math.log1p(ref.groundSpatialVariance);
  return Math.abs(eCap - eRef) * 0.45
    + Math.abs(lCap - lRef) * 0.35
    + Math.abs(vCap - vRef) * 0.20;
}

export function encodeSolidPng(width, height, rgb) {
  const png = new PNG({ width, height });
  const [r, g, b] = rgb;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    png.data[o] = clampByte(r);
    png.data[o + 1] = clampByte(g);
    png.data[o + 2] = clampByte(b);
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}
