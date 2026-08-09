#!/usr/bin/env node

/**
 * QA-only fixed-camera comparison between clean Web reference plates and Unity world captures.
 *
 * Structural alignment and calibrated Build 299 appearance both gate by default. Operators may
 * override thresholds on the CLI, but a colour-space or material regression cannot pass silently.
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";

export const CAPTURE_WIDTH = 1_600;
export const CAPTURE_HEIGHT = 1_000;
export const DOWNSAMPLE_FACTOR = 4;
export const TRANSLATION_SEARCH_RADIUS_PX = 32;
const SAMPLE_WIDTH = CAPTURE_WIDTH / DOWNSAMPLE_FACTOR;
const SAMPLE_HEIGHT = CAPTURE_HEIGHT / DOWNSAMPLE_FACTOR;
const SAMPLE_TRANSLATION_RADIUS = TRANSLATION_SEARCH_RADIUS_PX / DOWNSAMPLE_FACTOR;
const EDGE_INSET = 2;
const SSIM_WINDOW = 8;
export const LOW_FREQUENCY_BLUR_RADIUS_PX = 8;
export const LOW_FREQUENCY_NOTICE_BYTE_ERROR = 4;

export const VIEW_PAIRS = Object.freeze([
  Object.freeze({ id: "camp-ember", web: "camp-ember.png", unity: "world_00_camp-ember.png" }),
  Object.freeze({ id: "mid-gorge", web: "mid-gorge.png", unity: "world_01_mid-gorge.png" }),
  Object.freeze({ id: "iron-bell", web: "iron-bell.png", unity: "world_02_iron-bell.png" }),
]);

export const DEFAULT_THRESHOLDS = Object.freeze({
  minEdgeNcc: 0.995,
  maxTranslationPx: 1,
  minChiralityMargin: 0.50,
  maxLinearRgbMae: 0.001,
  maxLinearRgbRmse: 0.003,
  maxP95LumaError: 0.002,
  minLuminanceSsim: 0.995,
  // Exact shared geometry still rasterizes thin Iron Bell beams on different sample edges in
  // Chromium/WebGL and Unity/Metal. Clean 4x-MSAA plates establish a 9.31-byte / 0.1993% floor;
  // leave narrow headroom for that edge coverage while retaining the smooth-atmosphere veto
  // (the smallest reproduced mist regression was 12.24 bytes).
  maxLowFrequencySrgbByteError: 10,
  maxLowFrequencySrgbFractionOver4: 0.0025,
});

const SRGB_BYTE_TO_LINEAR = Float64Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
});

export class ParityInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParityInputError";
  }
}

function finiteNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be a finite number.`);
  return parsed;
}

function resolvedThresholds(overrides = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...overrides };
  thresholds.minEdgeNcc = finiteNumber(thresholds.minEdgeNcc, "minEdgeNcc");
  thresholds.maxTranslationPx = finiteNumber(
    thresholds.maxTranslationPx,
    "maxTranslationPx",
  );
  thresholds.minChiralityMargin = finiteNumber(
    thresholds.minChiralityMargin,
    "minChiralityMargin",
  );
  for (const name of [
    "maxLinearRgbMae",
    "maxLinearRgbRmse",
    "maxP95LumaError",
    "minLuminanceSsim",
    "maxLowFrequencySrgbByteError",
    "maxLowFrequencySrgbFractionOver4",
  ]) {
    if (thresholds[name] !== null) thresholds[name] = finiteNumber(thresholds[name], name);
  }
  if (thresholds.minEdgeNcc < -1 || thresholds.minEdgeNcc > 1) {
    throw new RangeError("minEdgeNcc must be within [-1, 1].");
  }
  if (thresholds.maxTranslationPx < 0
      || thresholds.maxTranslationPx > TRANSLATION_SEARCH_RADIUS_PX) {
    throw new RangeError(
      `maxTranslationPx must be within [0, ${TRANSLATION_SEARCH_RADIUS_PX}].`,
    );
  }
  if (thresholds.minChiralityMargin < -2 || thresholds.minChiralityMargin > 2) {
    throw new RangeError("minChiralityMargin must be within [-2, 2].");
  }
  if (thresholds.maxLowFrequencySrgbByteError !== null
      && (thresholds.maxLowFrequencySrgbByteError < 0
        || thresholds.maxLowFrequencySrgbByteError > 255)) {
    throw new RangeError("maxLowFrequencySrgbByteError must be within [0, 255].");
  }
  if (thresholds.maxLowFrequencySrgbFractionOver4 !== null
      && (thresholds.maxLowFrequencySrgbFractionOver4 < 0
        || thresholds.maxLowFrequencySrgbFractionOver4 > 1)) {
    throw new RangeError("maxLowFrequencySrgbFractionOver4 must be within [0, 1].");
  }
  return Object.freeze(thresholds);
}

export function validateCaptureImage(image, label = "capture") {
  if (!image || typeof image !== "object") {
    throw new ParityInputError(`${label} is not a decoded PNG image.`);
  }
  if (image.width !== CAPTURE_WIDTH || image.height !== CAPTURE_HEIGHT) {
    throw new ParityInputError(
      `${label} must be exactly ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT}; `
        + `got ${image.width}x${image.height}.`,
    );
  }
  const expectedBytes = CAPTURE_WIDTH * CAPTURE_HEIGHT * 4;
  if (!image.data || image.data.length !== expectedBytes) {
    throw new ParityInputError(
      `${label} RGBA payload must contain ${expectedBytes} bytes; got ${image.data?.length ?? 0}.`,
    );
  }
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] !== 255) {
      const pixel = (offset - 3) / 4;
      throw new ParityInputError(
        `${label} must be fully opaque; pixel (${pixel % CAPTURE_WIDTH}, `
          + `${Math.floor(pixel / CAPTURE_WIDTH)}) has alpha ${image.data[offset]}.`,
      );
    }
  }
  return image;
}

export function decodeCapturePng(bytes, label = "capture") {
  let image;
  try {
    image = PNG.sync.read(bytes);
  } catch (error) {
    throw new ParityInputError(`${label} is not a readable PNG: ${error.message}`);
  }
  return validateCaptureImage(image, label);
}

function boxBlur(values, width, height, radius = 1) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += values[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }
  const blurred = new Float64Array(values.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum = integral[(y1 + 1) * stride + x1 + 1]
        - integral[y0 * stride + x1 + 1]
        - integral[(y1 + 1) * stride + x0]
        + integral[y0 * stride + x0];
      blurred[y * width + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return blurred;
}

function downsampleCapture(image) {
  const pixelCount = SAMPLE_WIDTH * SAMPLE_HEIGHT;
  const srgbLuma = new Float64Array(pixelCount);
  const linearRed = new Float64Array(pixelCount);
  const linearGreen = new Float64Array(pixelCount);
  const linearBlue = new Float64Array(pixelCount);
  const blockArea = DOWNSAMPLE_FACTOR * DOWNSAMPLE_FACTOR;
  for (let sampleY = 0; sampleY < SAMPLE_HEIGHT; sampleY++) {
    const sourceY = sampleY * DOWNSAMPLE_FACTOR;
    for (let sampleX = 0; sampleX < SAMPLE_WIDTH; sampleX++) {
      const sourceX = sampleX * DOWNSAMPLE_FACTOR;
      let redByte = 0;
      let greenByte = 0;
      let blueByte = 0;
      let redLinear = 0;
      let greenLinear = 0;
      let blueLinear = 0;
      for (let blockY = 0; blockY < DOWNSAMPLE_FACTOR; blockY++) {
        let offset = ((sourceY + blockY) * CAPTURE_WIDTH + sourceX) * 4;
        for (let blockX = 0; blockX < DOWNSAMPLE_FACTOR; blockX++, offset += 4) {
          const red = image.data[offset];
          const green = image.data[offset + 1];
          const blue = image.data[offset + 2];
          redByte += red;
          greenByte += green;
          blueByte += blue;
          redLinear += SRGB_BYTE_TO_LINEAR[red];
          greenLinear += SRGB_BYTE_TO_LINEAR[green];
          blueLinear += SRGB_BYTE_TO_LINEAR[blue];
        }
      }
      const index = sampleY * SAMPLE_WIDTH + sampleX;
      srgbLuma[index] = (0.2126 * redByte + 0.7152 * greenByte + 0.0722 * blueByte)
        / (255 * blockArea);
      linearRed[index] = redLinear / blockArea;
      linearGreen[index] = greenLinear / blockArea;
      linearBlue[index] = blueLinear / blockArea;
    }
  }
  const blurredRed = boxBlur(linearRed, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const blurredGreen = boxBlur(linearGreen, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const blurredBlue = boxBlur(linearBlue, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const linearLuma = new Float64Array(pixelCount);
  for (let index = 0; index < pixelCount; index++) {
    linearLuma[index] = 0.2126 * blurredRed[index]
      + 0.7152 * blurredGreen[index]
      + 0.0722 * blurredBlue[index];
  }
  return {
    width: SAMPLE_WIDTH,
    height: SAMPLE_HEIGHT,
    srgbLuma: boxBlur(srgbLuma, SAMPLE_WIDTH, SAMPLE_HEIGHT),
    linearRed: blurredRed,
    linearGreen: blurredGreen,
    linearBlue: blurredBlue,
    linearLuma,
  };
}

function sobelMagnitude(values, width, height) {
  const edges = new Float64Array(values.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const top = (y - 1) * width + x;
      const middle = y * width + x;
      const bottom = (y + 1) * width + x;
      const gx = -values[top - 1] + values[top + 1]
        - 2 * values[middle - 1] + 2 * values[middle + 1]
        - values[bottom - 1] + values[bottom + 1];
      const gy = -values[top - 1] - 2 * values[top] - values[top + 1]
        + values[bottom - 1] + 2 * values[bottom] + values[bottom + 1];
      edges[middle] = Math.hypot(gx, gy);
    }
  }
  return edges;
}

function mirrorHorizontal(values, width, height) {
  const mirrored = new Float64Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      mirrored[y * width + x] = values[y * width + (width - 1 - x)];
    }
  }
  return mirrored;
}

function samplePlane(values, width, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(SAMPLE_HEIGHT - 1, y0 + 1);
  const blendX = x - x0;
  const blendY = y - y0;
  const top = values[y0 * width + x0] * (1 - blendX)
    + values[y0 * width + x1] * blendX;
  const bottom = values[y1 * width + x0] * (1 - blendX)
    + values[y1 * width + x1] * blendX;
  return top * (1 - blendY) + bottom * blendY;
}

function edgeNccAtOffset(left, right, dx, dy) {
  const x0 = Math.max(EDGE_INSET, Math.ceil(EDGE_INSET - dx));
  const x1 = Math.min(
    SAMPLE_WIDTH - EDGE_INSET,
    Math.ceil(SAMPLE_WIDTH - EDGE_INSET - dx),
  );
  const y0 = Math.max(EDGE_INSET, Math.ceil(EDGE_INSET - dy));
  const y1 = Math.min(
    SAMPLE_HEIGHT - EDGE_INSET,
    Math.ceil(SAMPLE_HEIGHT - EDGE_INSET - dy),
  );
  const integralOffset = Number.isInteger(dx) && Number.isInteger(dy);
  let leftSum = 0;
  let rightSum = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  let productSum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    let leftIndex = y * SAMPLE_WIDTH + x0;
    let rightIndex = integralOffset
      ? (y + dy) * SAMPLE_WIDTH + x0 + dx
      : 0;
    for (let x = x0; x < x1; x++, leftIndex++, rightIndex++) {
      const leftValue = left[leftIndex];
      const rightValue = integralOffset
        ? right[rightIndex]
        : samplePlane(right, SAMPLE_WIDTH, x + dx, y + dy);
      leftSum += leftValue;
      rightSum += rightValue;
      leftSquared += leftValue * leftValue;
      rightSquared += rightValue * rightValue;
      productSum += leftValue * rightValue;
      count++;
    }
  }
  if (count < 2) return -1;
  const covariance = productSum - leftSum * rightSum / count;
  const leftEnergy = leftSquared - leftSum * leftSum / count;
  const rightEnergy = rightSquared - rightSum * rightSum / count;
  const denominator = Math.sqrt(Math.max(0, leftEnergy) * Math.max(0, rightEnergy));
  if (denominator <= 1e-20) return leftEnergy <= 1e-20 && rightEnergy <= 1e-20 ? 1 : 0;
  // True overlap-local zero-normalised cross-correlation. Clamp only floating-point epsilon.
  return Math.max(-1, Math.min(1, covariance / denominator));
}

function betterOffset(candidate, incumbent) {
  if (!incumbent || candidate.ncc > incumbent.ncc + 1e-12) return true;
  if (Math.abs(candidate.ncc - incumbent.ncc) > 1e-12) return false;
  const candidateDistance = Math.abs(candidate.x) + Math.abs(candidate.y);
  const incumbentDistance = Math.abs(incumbent.x) + Math.abs(incumbent.y);
  if (candidateDistance !== incumbentDistance) return candidateDistance < incumbentDistance;
  if (candidate.y !== incumbent.y) return candidate.y < incumbent.y;
  return candidate.x < incumbent.x;
}

function bestEdgeAlignment(left, right) {
  const coarse = [];
  for (let dy = -SAMPLE_TRANSLATION_RADIUS; dy <= SAMPLE_TRANSLATION_RADIUS; dy++) {
    for (let dx = -SAMPLE_TRANSLATION_RADIUS; dx <= SAMPLE_TRANSLATION_RADIUS; dx++) {
      const candidate = { x: dx, y: dy, ncc: edgeNccAtOffset(left, right, dx, dy) };
      coarse.push(candidate);
    }
  }
  coarse.sort((leftCandidate, rightCandidate) => {
    if (betterOffset(leftCandidate, rightCandidate)) return -1;
    if (betterOffset(rightCandidate, leftCandidate)) return 1;
    return 0;
  });
  let best = coarse[0];
  // The 4x plate reduction keeps the exhaustive +/-32 px scan inexpensive. Refine around the
  // four strongest coarse basins at quarter-sample increments so reported offsets retain exact
  // full-resolution pixel granularity instead of silently rounding 1-3 px drift to zero.
  for (const basin of coarse.slice(0, 4)) {
    for (let quarterY = -3; quarterY <= 3; quarterY++) {
      for (let quarterX = -3; quarterX <= 3; quarterX++) {
        const dx = basin.x + quarterX / DOWNSAMPLE_FACTOR;
        const dy = basin.y + quarterY / DOWNSAMPLE_FACTOR;
        if (Math.abs(dx) > SAMPLE_TRANSLATION_RADIUS
            || Math.abs(dy) > SAMPLE_TRANSLATION_RADIUS) continue;
        const candidate = { x: dx, y: dy, ncc: edgeNccAtOffset(left, right, dx, dy) };
        if (betterOffset(candidate, best)) best = candidate;
      }
    }
  }
  const fullX = Math.round(best.x * DOWNSAMPLE_FACTOR);
  const fullY = Math.round(best.y * DOWNSAMPLE_FACTOR);
  return Object.freeze({
    edgeNcc: best.ncc,
    unityContentOffsetPx: Object.freeze({
      x: Object.is(fullX, -0) ? 0 : fullX,
      y: Object.is(fullY, -0) ? 0 : fullY,
    }),
    unityShiftToAlignPx: Object.freeze({
      x: fullX === 0 ? 0 : -fullX,
      y: fullY === 0 ? 0 : -fullY,
    }),
  });
}

function percentile95(values) {
  values.sort((left, right) => left - right);
  return values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
}

function luminanceSsim(left, right, width, height) {
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let total = 0;
  let windows = 0;
  for (let y0 = 0; y0 < height; y0 += SSIM_WINDOW) {
    for (let x0 = 0; x0 < width; x0 += SSIM_WINDOW) {
      const x1 = Math.min(width, x0 + SSIM_WINDOW);
      const y1 = Math.min(height, y0 + SSIM_WINDOW);
      const count = (x1 - x0) * (y1 - y0);
      let leftSum = 0;
      let rightSum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const index = y * width + x;
          leftSum += left[index];
          rightSum += right[index];
        }
      }
      const leftMean = leftSum / count;
      const rightMean = rightSum / count;
      let leftVariance = 0;
      let rightVariance = 0;
      let covariance = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const index = y * width + x;
          const leftDelta = left[index] - leftMean;
          const rightDelta = right[index] - rightMean;
          leftVariance += leftDelta * leftDelta;
          rightVariance += rightDelta * rightDelta;
          covariance += leftDelta * rightDelta;
        }
      }
      const denominator = Math.max(1, count - 1);
      leftVariance /= denominator;
      rightVariance /= denominator;
      covariance /= denominator;
      total += ((2 * leftMean * rightMean + C1) * (2 * covariance + C2))
        / ((leftMean * leftMean + rightMean * rightMean + C1)
          * (leftVariance + rightVariance + C2));
      windows++;
    }
  }
  return total / Math.max(1, windows);
}

function appearanceMetrics(left, right, contentOffsetPx) {
  const dx = contentOffsetPx.x / DOWNSAMPLE_FACTOR;
  const dy = contentOffsetPx.y / DOWNSAMPLE_FACTOR;
  const x0 = Math.max(0, Math.ceil(-dx));
  const x1 = Math.min(SAMPLE_WIDTH, Math.ceil(SAMPLE_WIDTH - dx));
  const y0 = Math.max(0, Math.ceil(-dy));
  const y1 = Math.min(SAMPLE_HEIGHT, Math.ceil(SAMPLE_HEIGHT - dy));
  const width = x1 - x0;
  const height = y1 - y0;
  const leftLuma = new Float64Array(width * height);
  const rightLuma = new Float64Array(width * height);
  const lumaErrors = [];
  let absolute = 0;
  let squared = 0;
  let samples = 0;
  let outputIndex = 0;
  for (let y = y0; y < y1; y++) {
    let leftIndex = y * SAMPLE_WIDTH + x0;
    for (let x = x0; x < x1; x++, leftIndex++, outputIndex++) {
      const sampleX = x + dx;
      const sampleY = y + dy;
      const red = left.linearRed[leftIndex]
        - samplePlane(right.linearRed, SAMPLE_WIDTH, sampleX, sampleY);
      const green = left.linearGreen[leftIndex]
        - samplePlane(right.linearGreen, SAMPLE_WIDTH, sampleX, sampleY);
      const blue = left.linearBlue[leftIndex]
        - samplePlane(right.linearBlue, SAMPLE_WIDTH, sampleX, sampleY);
      absolute += Math.abs(red) + Math.abs(green) + Math.abs(blue);
      squared += red * red + green * green + blue * blue;
      samples += 3;
      leftLuma[outputIndex] = left.linearLuma[leftIndex];
      rightLuma[outputIndex] = samplePlane(
        right.linearLuma,
        SAMPLE_WIDTH,
        sampleX,
        sampleY,
      );
      lumaErrors.push(Math.abs(leftLuma[outputIndex] - rightLuma[outputIndex]));
    }
  }
  return Object.freeze({
    alignmentAppliedPx: Object.freeze({
      x: -contentOffsetPx.x,
      y: -contentOffsetPx.y,
    }),
    overlapPx: Object.freeze({
      width: width * DOWNSAMPLE_FACTOR,
      height: height * DOWNSAMPLE_FACTOR,
    }),
    linearRgbMae: absolute / Math.max(1, samples),
    linearRgbRmse: Math.sqrt(squared / Math.max(1, samples)),
    p95LinearLumaError: percentile95(lumaErrors),
    luminanceSsim: luminanceSsim(leftLuma, rightLuma, width, height),
  });
}

function integralRectangleSum(integral, stride, x0, y0, x1, y1) {
  return integral[y1 * stride + x1]
    - integral[y0 * stride + x1]
    - integral[y1 * stride + x0]
    + integral[y0 * stride + x0];
}

/**
 * Detect broad, low-contrast differences that whole-frame percentiles can miss.
 *
 * A box blur is linear, so blurring the signed Web-minus-Unity byte difference is exactly the
 * same as blurring both sRGB plates independently and subtracting the results. Keeping the sign
 * is important: isolated raster-edge disagreement cancels across the 17x17 neighbourhood while
 * a coherent mist or colour-wash residual survives. All windows are clipped to the aligned
 * overlap, and the worst RGB-channel error defines the error at each pixel.
 */
function lowFrequencySrgbMetrics(webImage, unityImage, contentOffsetPx) {
  const dx = contentOffsetPx.x;
  const dy = contentOffsetPx.y;
  const overlapX0 = Math.max(0, -dx);
  const overlapX1 = Math.min(CAPTURE_WIDTH, CAPTURE_WIDTH - dx);
  const overlapY0 = Math.max(0, -dy);
  const overlapY1 = Math.min(CAPTURE_HEIGHT, CAPTURE_HEIGHT - dy);
  const width = overlapX1 - overlapX0;
  const height = overlapY1 - overlapY0;
  const stride = width + 1;
  const integralLength = stride * (height + 1);
  // The largest possible signed full-plate sum is 255 * 1,600 * 1,000, within Int32 range.
  // Integer integrals keep this QA metric bit-for-bit deterministic across JS engines.
  const redIntegral = new Int32Array(integralLength);
  const greenIntegral = new Int32Array(integralLength);
  const blueIntegral = new Int32Array(integralLength);

  for (let y = 0; y < height; y++) {
    let webOffset = ((overlapY0 + y) * CAPTURE_WIDTH + overlapX0) * 4;
    let unityOffset = ((overlapY0 + y + dy) * CAPTURE_WIDTH + overlapX0 + dx) * 4;
    let redRowSum = 0;
    let greenRowSum = 0;
    let blueRowSum = 0;
    const integralRow = (y + 1) * stride;
    const previousIntegralRow = y * stride;
    for (let x = 0; x < width; x++, webOffset += 4, unityOffset += 4) {
      redRowSum += webImage.data[webOffset] - unityImage.data[unityOffset];
      greenRowSum += webImage.data[webOffset + 1] - unityImage.data[unityOffset + 1];
      blueRowSum += webImage.data[webOffset + 2] - unityImage.data[unityOffset + 2];
      const destination = integralRow + x + 1;
      redIntegral[destination] = redIntegral[previousIntegralRow + x + 1] + redRowSum;
      greenIntegral[destination] = greenIntegral[previousIntegralRow + x + 1] + greenRowSum;
      blueIntegral[destination] = blueIntegral[previousIntegralRow + x + 1] + blueRowSum;
    }
  }

  let maxByteError = 0;
  let pixelsOverNotice = 0;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - LOW_FREQUENCY_BLUR_RADIUS_PX);
    const y1 = Math.min(height, y + LOW_FREQUENCY_BLUR_RADIUS_PX + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - LOW_FREQUENCY_BLUR_RADIUS_PX);
      const x1 = Math.min(width, x + LOW_FREQUENCY_BLUR_RADIUS_PX + 1);
      const area = (x1 - x0) * (y1 - y0);
      const byteError = Math.max(
        Math.abs(integralRectangleSum(redIntegral, stride, x0, y0, x1, y1)) / area,
        Math.abs(integralRectangleSum(greenIntegral, stride, x0, y0, x1, y1)) / area,
        Math.abs(integralRectangleSum(blueIntegral, stride, x0, y0, x1, y1)) / area,
      );
      maxByteError = Math.max(maxByteError, byteError);
      if (byteError > LOW_FREQUENCY_NOTICE_BYTE_ERROR + Number.EPSILON) pixelsOverNotice++;
    }
  }
  const pixelsEvaluated = width * height;
  return Object.freeze({
    lowFrequencySrgbMaxByteError: maxByteError,
    lowFrequencySrgbPixelsOver4: pixelsOverNotice,
    lowFrequencySrgbFractionOver4: pixelsOverNotice / Math.max(1, pixelsEvaluated),
    lowFrequencySrgbPixelsEvaluated: pixelsEvaluated,
  });
}

function thresholdFailure(metric, operator, threshold) {
  return `${metric}=${operator.value.toFixed(6)} ${operator.symbol} ${threshold}`;
}

function hasAppearanceGate(thresholds) {
  return [
    thresholds.maxLinearRgbMae,
    thresholds.maxLinearRgbRmse,
    thresholds.maxP95LumaError,
    thresholds.minLuminanceSsim,
    thresholds.maxLowFrequencySrgbByteError,
    thresholds.maxLowFrequencySrgbFractionOver4,
  ].some((value) => value !== null);
}

export function compareCaptureImages(webImage, unityImage, options = {}) {
  validateCaptureImage(webImage, options.webLabel ?? "Web capture");
  validateCaptureImage(unityImage, options.unityLabel ?? "Unity capture");
  const thresholds = resolvedThresholds(options.thresholds);
  const web = downsampleCapture(webImage);
  const unity = downsampleCapture(unityImage);
  const webEdges = sobelMagnitude(web.srgbLuma, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const unityEdges = sobelMagnitude(unity.srgbLuma, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const originNcc = edgeNccAtOffset(webEdges, unityEdges, 0, 0);
  const best = bestEdgeAlignment(webEdges, unityEdges);
  const mirrored = bestEdgeAlignment(
    webEdges,
    mirrorHorizontal(unityEdges, SAMPLE_WIDTH, SAMPLE_HEIGHT),
  );
  const chiralityMargin = best.edgeNcc - mirrored.edgeNcc;
  const appearance = Object.freeze({
    ...appearanceMetrics(web, unity, best.unityContentOffsetPx),
    ...lowFrequencySrgbMetrics(webImage, unityImage, best.unityContentOffsetPx),
  });
  const structuralFailures = [];
  if (best.edgeNcc < thresholds.minEdgeNcc) {
    structuralFailures.push(thresholdFailure(
      "bestEdgeNcc",
      { value: best.edgeNcc, symbol: "<" },
      thresholds.minEdgeNcc,
    ));
  }
  const translationMagnitude = Math.max(
    Math.abs(best.unityContentOffsetPx.x),
    Math.abs(best.unityContentOffsetPx.y),
  );
  if (translationMagnitude > thresholds.maxTranslationPx) {
    structuralFailures.push(
      `translation=${best.unityContentOffsetPx.x},${best.unityContentOffsetPx.y}px `
        + `exceeds ${thresholds.maxTranslationPx}px`,
    );
  }
  if (chiralityMargin < thresholds.minChiralityMargin) {
    structuralFailures.push(
      `wrong-chirality: direct-minus-mirrored=${chiralityMargin.toFixed(6)} `
        + `< ${thresholds.minChiralityMargin}`,
    );
  }

  const appearanceFailures = [];
  const maximumAppearance = [
    ["linearRgbMae", appearance.linearRgbMae, thresholds.maxLinearRgbMae],
    ["linearRgbRmse", appearance.linearRgbRmse, thresholds.maxLinearRgbRmse],
    ["p95LinearLumaError", appearance.p95LinearLumaError, thresholds.maxP95LumaError],
    [
      "lowFrequencySrgbMaxByteError",
      appearance.lowFrequencySrgbMaxByteError,
      thresholds.maxLowFrequencySrgbByteError,
    ],
    [
      "lowFrequencySrgbFractionOver4",
      appearance.lowFrequencySrgbFractionOver4,
      thresholds.maxLowFrequencySrgbFractionOver4,
    ],
  ];
  for (const [name, value, threshold] of maximumAppearance) {
    if (threshold !== null && value > threshold) {
      appearanceFailures.push(thresholdFailure(name, { value, symbol: ">" }, threshold));
    }
  }
  if (thresholds.minLuminanceSsim !== null
      && appearance.luminanceSsim < thresholds.minLuminanceSsim) {
    appearanceFailures.push(thresholdFailure(
      "luminanceSsim",
      { value: appearance.luminanceSsim, symbol: "<" },
      thresholds.minLuminanceSsim,
    ));
  }
  const appearanceGateEnabled = hasAppearanceGate(thresholds);

  return Object.freeze({
    schema: "guns-only.cobra-web-unity-parity.v1",
    input: Object.freeze({
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      opaque: true,
    }),
    analysis: Object.freeze({
      downsampleFactor: DOWNSAMPLE_FACTOR,
      sampleWidth: SAMPLE_WIDTH,
      sampleHeight: SAMPLE_HEIGHT,
      translationSearchRadiusPx: TRANSLATION_SEARCH_RADIUS_PX,
      translationCoarseStepPx: DOWNSAMPLE_FACTOR,
      translationRefinementStepPx: 1,
      appearanceColorSpace: "linear-sRGB",
      appearanceAlignedToBestUnmirroredTranslation: true,
      lowFrequencyColorSpace: "sRGB byte code values",
      lowFrequencyBoxBlurRadiusPx: LOW_FREQUENCY_BLUR_RADIUS_PX,
      lowFrequencyBoxBlurDiameterPx: LOW_FREQUENCY_BLUR_RADIUS_PX * 2 + 1,
      lowFrequencyPixelError: "maximum absolute RGB-channel error after signed box blur",
      lowFrequencyNoticeByteError: LOW_FREQUENCY_NOTICE_BYTE_ERROR,
    }),
    structure: Object.freeze({
      edgeNccAtOrigin: originNcc,
      bestUnmirrored: best,
      bestMirrored: mirrored,
      chiralityMargin,
    }),
    appearance,
    thresholds,
    gating: Object.freeze({
      structuralFailures: Object.freeze(structuralFailures),
      appearanceGateEnabled,
      appearanceReportOnly: !appearanceGateEnabled,
      appearanceFailures: Object.freeze(appearanceFailures),
      pass: structuralFailures.length === 0 && appearanceFailures.length === 0,
    }),
  });
}

export function checkerboardImage(webImage, unityImage, tileSizePx = 80) {
  validateCaptureImage(webImage, "Web capture");
  validateCaptureImage(unityImage, "Unity capture");
  const data = Buffer.alloc(webImage.data.length);
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const useUnity = (Math.floor(x / tileSizePx) + Math.floor(y / tileSizePx)) % 2 === 1;
      const source = useUnity ? unityImage.data : webImage.data;
      const offset = (y * CAPTURE_WIDTH + x) * 4;
      data[offset] = source[offset];
      data[offset + 1] = source[offset + 1];
      data[offset + 2] = source[offset + 2];
      data[offset + 3] = 255;
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

export function amplifiedDifferenceImage(webImage, unityImage, gain = 4) {
  validateCaptureImage(webImage, "Web capture");
  validateCaptureImage(unityImage, "Unity capture");
  const resolvedGain = finiteNumber(gain, "diff gain");
  if (resolvedGain <= 0) throw new RangeError("diff gain must be greater than zero.");
  const data = Buffer.alloc(webImage.data.length);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.min(255, Math.round(Math.abs(
      webImage.data[offset] - unityImage.data[offset],
    ) * resolvedGain));
    data[offset + 1] = Math.min(255, Math.round(Math.abs(
      webImage.data[offset + 1] - unityImage.data[offset + 1],
    ) * resolvedGain));
    data[offset + 2] = Math.min(255, Math.round(Math.abs(
      webImage.data[offset + 2] - unityImage.data[offset + 2],
    ) * resolvedGain));
    data[offset + 3] = 255;
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function encodePng(image) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

export async function writePairArtifacts({
  outDir,
  id,
  webImage,
  unityImage,
  report,
  diffGain = 4,
}) {
  const resolvedOut = resolve(outDir);
  await mkdir(resolvedOut, { recursive: true });
  const artifactNames = {
    report: `${id}.parity.json`,
    checkerboard: `${id}.checkerboard.png`,
    amplifiedDifference: `${id}.diff.png`,
  };
  const withArtifacts = {
    ...report,
    id,
    artifacts: Object.freeze({
      ...artifactNames,
      checkerboardTileSizePx: 80,
      differenceGain: diffGain,
      diagnosticsUseFixedCoordinates: true,
    }),
  };
  await Promise.all([
    writeFile(
      join(resolvedOut, artifactNames.checkerboard),
      encodePng(checkerboardImage(webImage, unityImage)),
    ),
    writeFile(
      join(resolvedOut, artifactNames.amplifiedDifference),
      encodePng(amplifiedDifferenceImage(webImage, unityImage, diffGain)),
    ),
    writeFile(
      join(resolvedOut, artifactNames.report),
      `${JSON.stringify(withArtifacts, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return withArtifacts;
}

const HELP = `Usage: node tools/cobra-scenery-gate/compare-unity.mjs [options]

Required:
  --web DIR                    Clean Web plates (camp-ember.png, mid-gorge.png, iron-bell.png)
  --unity DIR                  Unity QA directory (world_00_..., world_01_..., world_02_...)
  --out DIR                    Per-view JSON/checkerboard/difference output

Structural gates (enabled by default):
  --min-edge-ncc N             Default ${DEFAULT_THRESHOLDS.minEdgeNcc}
  --max-translation-px N       Default ${DEFAULT_THRESHOLDS.maxTranslationPx}; search is +/-32 px
  --min-chirality-margin N     Default ${DEFAULT_THRESHOLDS.minChiralityMargin}

Calibrated appearance gates (enabled by default):
  --max-linear-mae N           Default ${DEFAULT_THRESHOLDS.maxLinearRgbMae}
  --max-linear-rmse N          Default ${DEFAULT_THRESHOLDS.maxLinearRgbRmse}
  --max-p95-luma N             Default ${DEFAULT_THRESHOLDS.maxP95LumaError}
  --min-luma-ssim N            Default ${DEFAULT_THRESHOLDS.minLuminanceSsim}
  --max-lowfreq-byte-error N   Default ${DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError}; 8px radius sRGB blur
  --max-lowfreq-over4-frac N   Default ${DEFAULT_THRESHOLDS.maxLowFrequencySrgbFractionOver4}; fraction >4 bytes

Other:
  --diff-gain N                Amplified difference multiplier (default 4)
  --mode fail|warn             Default fail
  -h, --help
`;

function optionValue(argv, index, option) {
  if (index + 1 >= argv.length) throw new TypeError(`${option} requires a value.`);
  return argv[index + 1];
}

export function parseArgs(argv) {
  const options = {
    webDir: null,
    unityDir: null,
    outDir: null,
    mode: "fail",
    diffGain: 4,
    thresholds: {},
  };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === "-h" || option === "--help") return { help: true };
    const value = () => optionValue(argv, index, option);
    if (option === "--web") options.webDir = resolve(value());
    else if (option === "--unity") options.unityDir = resolve(value());
    else if (option === "--out") options.outDir = resolve(value());
    else if (option === "--mode") options.mode = value();
    else if (option === "--diff-gain") options.diffGain = finiteNumber(value(), option);
    else if (option === "--min-edge-ncc") {
      options.thresholds.minEdgeNcc = finiteNumber(value(), option);
    } else if (option === "--max-translation-px") {
      options.thresholds.maxTranslationPx = finiteNumber(value(), option);
    } else if (option === "--min-chirality-margin") {
      options.thresholds.minChiralityMargin = finiteNumber(value(), option);
    } else if (option === "--max-linear-mae") {
      options.thresholds.maxLinearRgbMae = finiteNumber(value(), option);
    } else if (option === "--max-linear-rmse") {
      options.thresholds.maxLinearRgbRmse = finiteNumber(value(), option);
    } else if (option === "--max-p95-luma") {
      options.thresholds.maxP95LumaError = finiteNumber(value(), option);
    } else if (option === "--min-luma-ssim") {
      options.thresholds.minLuminanceSsim = finiteNumber(value(), option);
    } else if (option === "--max-lowfreq-byte-error") {
      options.thresholds.maxLowFrequencySrgbByteError = finiteNumber(value(), option);
    } else if (option === "--max-lowfreq-over4-frac") {
      options.thresholds.maxLowFrequencySrgbFractionOver4 = finiteNumber(value(), option);
    } else {
      throw new TypeError(`Unknown option '${option}'.`);
    }
    index++;
  }
  if (!options.webDir || !options.unityDir || !options.outDir) {
    throw new TypeError("--web, --unity and --out are required.");
  }
  if (!new Set(["fail", "warn"]).has(options.mode)) {
    throw new TypeError("--mode must be 'fail' or 'warn'.");
  }
  if (options.diffGain <= 0) throw new RangeError("--diff-gain must be greater than zero.");
  options.thresholds = resolvedThresholds(options.thresholds);
  return options;
}

export async function runComparison(options) {
  const webDir = resolve(options.webDir);
  const unityDir = resolve(options.unityDir);
  const outDir = resolve(options.outDir);
  const thresholds = resolvedThresholds(options.thresholds);
  const appearanceGateEnabled = hasAppearanceGate(thresholds);
  await mkdir(outDir, { recursive: true });
  const views = [];
  for (const pair of VIEW_PAIRS) {
    const webPath = join(webDir, pair.web);
    const unityPath = join(unityDir, pair.unity);
    let report;
    try {
      const [webBytes, unityBytes] = await Promise.all([readFile(webPath), readFile(unityPath)]);
      const webImage = decodeCapturePng(webBytes, `Web ${pair.id}`);
      const unityImage = decodeCapturePng(unityBytes, `Unity ${pair.id}`);
      const comparison = compareCaptureImages(webImage, unityImage, {
        webLabel: `Web ${pair.id}`,
        unityLabel: `Unity ${pair.id}`,
        thresholds,
      });
      report = await writePairArtifacts({
        outDir,
        id: pair.id,
        webImage,
        unityImage,
        report: {
          ...comparison,
          sources: { web: webPath, unity: unityPath },
        },
        diffGain: options.diffGain ?? 4,
      });
    } catch (error) {
      report = {
        schema: "guns-only.cobra-web-unity-parity.v1",
        id: pair.id,
        sources: { web: webPath, unity: unityPath },
        inputError: error instanceof Error ? error.message : String(error),
        gating: {
          structuralFailures: ["invalid-input"],
          appearanceGateEnabled,
          appearanceReportOnly: !appearanceGateEnabled,
          appearanceFailures: [],
          pass: false,
        },
      };
      await writeFile(
        join(outDir, `${pair.id}.parity.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
    }
    views.push(report);
  }
  const summary = {
    schema: "guns-only.cobra-web-unity-parity-summary.v1",
    pass: views.every((view) => view.gating.pass),
    appearanceGateEnabled,
    thresholds,
    views: views.map((view) => ({
      id: view.id,
      pass: view.gating.pass,
      structuralFailures: view.gating.structuralFailures,
      appearanceFailures: view.gating.appearanceFailures,
      inputError: view.inputError ?? null,
    })),
  };
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`parity-compare: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let summary;
  try {
    summary = await runComparison(options);
  } catch (error) {
    process.stderr.write(`parity-compare: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  for (const view of summary.views) {
    process.stdout.write(
      `${view.id}: ${view.pass ? "PASS" : "FAIL"}`
        + `${view.structuralFailures.length ? ` · ${view.structuralFailures.join("; ")}` : ""}`
        + `${view.appearanceFailures.length ? ` · ${view.appearanceFailures.join("; ")}` : ""}\n`,
    );
  }
  process.stdout.write(
    `appearance: ${summary.appearanceGateEnabled ? "gated with calibrated thresholds" : "report-only"}\n`,
  );
  return summary.pass || options.mode === "warn" ? 0 : 1;
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
