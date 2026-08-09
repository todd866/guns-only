/**
 * Cobra corridor visual-coherence gate.
 *
 * This is intentionally not an "edge count". Build 298 proved that white mist rectangles,
 * stippled sky and camouflage noise could score better than a coherent scene. The gate now asks
 * for structure at the scale of landforms while capping pixel-scale grit and crushed slabs.
 */

import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const GROUND_START = 0.28;
const GROUND_END = 0.91;
const GROUND_X_INSET = 0.06;
const PALE_START = 0.36;
const SKY_START = 0.075;
const SKY_END = 0.44;
const SKY_X_INSET = 0.15;

export const SCENERY_LIMITS = Object.freeze({
  skyHighFrequencyP90Max: 1.5,
  skyHighFrequencyFractionMax: 0.06,
  skyMaskCoverageMin: 0.04,
  groundMicroDominantFractionMax: 0.10,
  groundMesoTileFractionMin: 0.45,
  groundShadowFractionMax: 0.04,
  groundShadowComponentFractionMax: 0.02,
  groundPaleComponentFractionMax: 0.006,
});

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function resizeToMaxEdge(image, maxEdge) {
  const { width, height, data } = image;
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, data: Buffer.from(data) };
  const scale = maxEdge / long;
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const output = Buffer.alloc(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y += 1) {
    const sourceY0 = Math.floor(y * height / outputHeight);
    const sourceY1 = Math.max(sourceY0 + 1, Math.floor((y + 1) * height / outputHeight));
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX0 = Math.floor(x * width / outputWidth);
      const sourceX1 = Math.max(sourceX0 + 1, Math.floor((x + 1) * width / outputWidth));
      const outputOffset = (y * outputWidth + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;
      for (let sourceY = sourceY0; sourceY < Math.min(height, sourceY1); sourceY += 1) {
        for (let sourceX = sourceX0; sourceX < Math.min(width, sourceX1); sourceX += 1) {
          const sourceOffset = (sourceY * width + sourceX) * 4;
          red += data[sourceOffset];
          green += data[sourceOffset + 1];
          blue += data[sourceOffset + 2];
          samples += 1;
        }
      }
      output[outputOffset] = Math.round(red / Math.max(1, samples));
      output[outputOffset + 1] = Math.round(green / Math.max(1, samples));
      output[outputOffset + 2] = Math.round(blue / Math.max(1, samples));
      output[outputOffset + 3] = 255;
    }
  }
  return { width: outputWidth, height: outputHeight, data: output };
}

function lumaPlane(image) {
  const plane = new Float64Array(image.width * image.height);
  for (let index = 0; index < plane.length; index += 1) {
    const offset = index * 4;
    plane[index] = luma(
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
    );
  }
  return plane;
}

function channelPlane(image, channel) {
  const plane = new Float64Array(image.width * image.height);
  for (let index = 0; index < plane.length; index += 1) {
    plane[index] = image.data[index * 4 + channel];
  }
  return plane;
}

function boxBlur(values, width, height, radius) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += values[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const output = new Float64Array(values.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum = integral[(y1 + 1) * stride + x1 + 1]
        - integral[y0 * stride + x1 + 1]
        - integral[(y1 + 1) * stride + x0]
        + integral[y0 * stride + x0];
      output[y * width + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return output;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  values.sort((left, right) => left - right);
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))];
}

function skyCandidateMask(image, radius = 4, options = {}) {
  const blueMinusRedMin = options.blueMinusRedMin ?? 5;
  const blueMinusGreenMin = options.blueMinusGreenMin ?? -3;
  const lumaMin = options.lumaMin ?? 65;
  const red = boxBlur(channelPlane(image, 0), image.width, image.height, radius);
  const green = boxBlur(channelPlane(image, 1), image.width, image.height, radius);
  const blue = boxBlur(channelPlane(image, 2), image.width, image.height, radius);
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    const value = luma(red[index], green[index], blue[index]);
    mask[index] = blue[index] - red[index] > blueMinusRedMin
      && blue[index] - green[index] > blueMinusGreenMin
      && value > lumaMin
      ? 1
      : 0;
  }
  return mask;
}

function connectedFromTop(mask, width, height, x0, x1, y0, y1) {
  const connected = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let y = y0; y < Math.min(y1, y0 + 3); y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * width + x;
      if (!mask[index] || connected[index]) continue;
      connected[index] = 1;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nextX < x0 || nextX >= x1 || nextY < y0 || nextY >= y1) continue;
      const next = nextY * width + nextX;
      if (!mask[next] || connected[next]) continue;
      connected[next] = 1;
      queue[tail++] = next;
    }
  }
  return connected;
}

function skyMetrics(fullImage) {
  const image = resizeToMaxEdge(fullImage, 720);
  const gray = lumaPlane(image);
  const blur = boxBlur(gray, image.width, image.height, 1);
  const x0 = Math.floor(image.width * SKY_X_INSET);
  const x1 = Math.ceil(image.width * (1 - SKY_X_INSET));
  const y0 = Math.floor(image.height * SKY_START);
  const y1 = Math.ceil(image.height * SKY_END);
  const candidate = skyCandidateMask(image);
  const connected = connectedFromTop(
    candidate, image.width, image.height, x0, x1, y0, y1,
  );
  const residuals = [];
  let aboveThree = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * image.width + x;
      if (!connected[index]) continue;
      const residual = Math.abs(gray[index] - blur[index]);
      residuals.push(residual);
      if (residual > 3) aboveThree += 1;
    }
  }
  return {
    skyHighFrequencyP90: percentile(residuals, 0.90),
    skyHighFrequencyFraction: aboveThree / Math.max(1, residuals.length),
    skyMaskCoverage: residuals.length / Math.max(1, image.width * image.height),
    skySamplePixels: residuals.length,
  };
}

function largestComponentFraction(mask, width, height, x0, x1, y0, y1, denominator) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let largest = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      let head = 0;
      let tail = 1;
      let size = 0;
      queue[0] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        size += 1;
        const pixelX = index % width;
        const pixelY = Math.floor(index / width);
        for (const next of [index - 1, index + 1, index - width, index + width]) {
          const nextX = next % width;
          const nextY = Math.floor(next / width);
          if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
          if (nextX < x0 || nextX >= x1 || nextY < y0 || nextY >= y1) continue;
          if (Math.abs(nextX - pixelX) + Math.abs(nextY - pixelY) !== 1) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      largest = Math.max(largest, size);
    }
  }
  return largest / Math.max(1, denominator);
}

function groundMetrics(fullImage) {
  const image = resizeToMaxEdge(fullImage, 360);
  const gray = lumaPlane(image);
  const blur1 = boxBlur(gray, image.width, image.height, 1);
  const blur3 = boxBlur(gray, image.width, image.height, 3);
  const blur9 = boxBlur(gray, image.width, image.height, 9);
  const x0 = Math.floor(image.width * GROUND_X_INSET);
  const x1 = Math.ceil(image.width * (1 - GROUND_X_INSET));
  const y0 = Math.floor(image.height * GROUND_START);
  const y1 = Math.ceil(image.height * GROUND_END);
  const paleY0 = Math.max(y0, Math.floor(image.height * PALE_START));
  const skyConnected = connectedFromTop(
    skyCandidateMask(image, 4, {
      blueMinusRedMin: -6,
      blueMinusGreenMin: -10,
      lumaMin: 55,
    }),
    image.width,
    image.height,
    x0,
    x1,
    0,
    y1,
  );
  const valid = new Uint8Array(gray.length);
  const darkMask = new Uint8Array(gray.length);
  const paleMask = new Uint8Array(gray.length);
  let groundPixels = 0;
  let shadowPixels = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * image.width + x;
      if (skyConnected[index]) continue;
      const offset = index * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      valid[index] = 1;
      darkMask[index] = gray[index] < 20 ? 1 : 0;
      if (darkMask[index]) shadowPixels += 1;
      paleMask[index] = y >= paleY0
        && gray[index] > 145
        && Math.max(r, g, b) - Math.min(r, g, b) < 28
        ? 1
        : 0;
      groundPixels += 1;
    }
  }

  const tileSize = 12;
  let microDominantTiles = 0;
  let mesoTiles = 0;
  let tileCount = 0;
  for (let tileY = y0; tileY < y1; tileY += tileSize) {
    for (let tileX = x0; tileX < x1; tileX += tileSize) {
      let fine = 0;
      let meso = 0;
      let samples = 0;
      const tileArea = (Math.min(y1, tileY + tileSize) - tileY)
        * (Math.min(x1, tileX + tileSize) - tileX);
      for (let y = tileY; y < Math.min(y1, tileY + tileSize); y += 1) {
        for (let x = tileX; x < Math.min(x1, tileX + tileSize); x += 1) {
          const index = y * image.width + x;
          if (!valid[index]) continue;
          fine += Math.abs(gray[index] - blur1[index]);
          meso += Math.abs(blur1[index] - blur3[index]) + Math.abs(blur3[index] - blur9[index]);
          samples += 1;
        }
      }
      if (!samples || samples / Math.max(1, tileArea) < 0.80) continue;
      const fineMean = fine / samples;
      const mesoMean = meso / samples;
      if (fineMean > 0.85 && fineMean / (mesoMean + 0.05) > 0.75) {
        microDominantTiles += 1;
      }
      if (mesoMean > 1.5) mesoTiles += 1;
      tileCount += 1;
    }
  }
  return {
    groundMicroDominantFraction: microDominantTiles / Math.max(1, tileCount),
    groundMesoTileFraction: mesoTiles / Math.max(1, tileCount),
    groundShadowFraction: shadowPixels / Math.max(1, groundPixels),
    groundShadowComponentFraction: largestComponentFraction(
      darkMask, image.width, image.height, x0, x1, y0, y1, groundPixels,
    ),
    groundPaleComponentFraction: largestComponentFraction(
      paleMask, image.width, image.height, x0, x1, paleY0, y1, groundPixels,
    ),
    groundTileCount: tileCount,
  };
}

export function scoreRgbaImage(image) {
  const metrics = { ...skyMetrics(image), ...groundMetrics(image) };
  const failures = [];
  const checkMaximum = (key, limit) => {
    if (metrics[key] > limit) failures.push(`${key}=${metrics[key].toFixed(3)} > ${limit}`);
  };
  const checkMinimum = (key, limit) => {
    if (metrics[key] < limit) failures.push(`${key}=${metrics[key].toFixed(3)} < ${limit}`);
  };
  if (metrics.skySamplePixels < 64 || metrics.groundTileCount < 8) {
    failures.push("insufficient-analysis-samples");
  }
  checkMaximum("skyHighFrequencyP90", SCENERY_LIMITS.skyHighFrequencyP90Max);
  checkMaximum("skyHighFrequencyFraction", SCENERY_LIMITS.skyHighFrequencyFractionMax);
  checkMinimum("skyMaskCoverage", SCENERY_LIMITS.skyMaskCoverageMin);
  checkMaximum(
    "groundMicroDominantFraction",
    SCENERY_LIMITS.groundMicroDominantFractionMax,
  );
  checkMinimum("groundMesoTileFraction", SCENERY_LIMITS.groundMesoTileFractionMin);
  checkMaximum("groundShadowFraction", SCENERY_LIMITS.groundShadowFractionMax);
  checkMaximum(
    "groundShadowComponentFraction",
    SCENERY_LIMITS.groundShadowComponentFractionMax,
  );
  checkMaximum("groundPaleComponentFraction", SCENERY_LIMITS.groundPaleComponentFractionMax);
  return { ...metrics, pass: failures.length === 0, failures };
}

export async function scorePngFile(path) {
  const png = PNG.sync.read(await readFile(path));
  return scoreRgbaImage(png);
}

export function verdict(scoresByName) {
  const failures = [];
  for (const [name, score] of Object.entries(scoresByName)) {
    if (!score.pass) failures.push(`${name}: ${score.failures.join("; ")}`);
  }
  return {
    pass: failures.length === 0,
    failures,
    message: failures.length === 0
      ? "cobra scenery gate PASS"
      : `cobra scenery gate FAIL — scene lacks coherent visual depth:\n- ${failures.join("\n- ")}`,
  };
}
