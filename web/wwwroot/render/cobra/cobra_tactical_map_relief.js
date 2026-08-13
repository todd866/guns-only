/**
 * Shaded-relief backdrop for the conquest charts.
 *
 * The minimap shipped as a dark box with four coloured dots on it, and the owner's verdict was
 * that it is "really hard to figure out where to go". That is not a styling problem: a chart
 * with no LAND on it cannot be related to anything out of the windscreen. You can see a valley,
 * a river and a ridge line; the chart showed none of them, so there was nothing to match against
 * and the dots floated in a void. BF:Vietnam's minimap is legible for the opposite reason — it
 * draws the terrain first and puts the flags on top of it.
 *
 * This bakes ONCE per mission (the terrain does not move) into a plain pixel buffer. It is pure:
 * it takes a height sampler and returns bytes, so it is testable headless and carries no canvas,
 * no DOM and no three.js.
 */

/** Sun for the hillshade, from the north-west — the cartographic convention, because a relief lit
 * from the south-east reads inverted to most people (craters become hills). */
const LIGHT_EAST = -0.5;
const LIGHT_NORTH = 0.5;
const LIGHT_UP = 0.7;

function normalise(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

const [SUN_E, SUN_N, SUN_U] = normalise(LIGHT_EAST, LIGHT_NORTH, LIGHT_UP);

function mix(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * @param {{
 *   sampleHeightM: (eastM: number, northM: number) => number,
 *   bounds: { minEastM: number, maxEastM: number, minNorthM: number, maxNorthM: number },
 *   sizePx?: number,
 *   waterHeightM?: number | null,
 * }} params
 * @returns {{ widthPx: number, heightPx: number, rgba: Uint8ClampedArray,
 *   minHeightM: number, maxHeightM: number }}
 */
export function bakeCobraTacticalRelief({
  sampleHeightM,
  bounds,
  sizePx = 128,
  waterHeightM = null,
} = {}) {
  if (typeof sampleHeightM !== "function") {
    throw new TypeError("bakeCobraTacticalRelief: sampleHeightM must be a function");
  }
  if (!bounds || !Number.isFinite(bounds.minEastM) || !Number.isFinite(bounds.maxEastM)
    || !Number.isFinite(bounds.minNorthM) || !Number.isFinite(bounds.maxNorthM)) {
    throw new TypeError("bakeCobraTacticalRelief: bounds must be finite");
  }
  const size = Math.max(8, Math.floor(sizePx));
  const eastSpan = bounds.maxEastM - bounds.minEastM;
  const northSpan = bounds.maxNorthM - bounds.minNorthM;
  if (!(eastSpan > 0) || !(northSpan > 0)) {
    throw new TypeError("bakeCobraTacticalRelief: bounds spans must be positive");
  }

  // One height sample per pixel, taken once. North-up: row 0 is the NORTHERN edge, matching
  // cobraTacticalMapModel's projection, so the relief cannot end up mirrored against the markers.
  const heights = new Float64Array(size * size);
  let minHeightM = Infinity;
  let maxHeightM = -Infinity;
  for (let row = 0; row < size; row++) {
    const northM = bounds.maxNorthM - (northSpan * (row + 0.5)) / size;
    for (let column = 0; column < size; column++) {
      const eastM = bounds.minEastM + (eastSpan * (column + 0.5)) / size;
      const raw = Number(sampleHeightM(eastM, northM));
      const heightM = Number.isFinite(raw) ? raw : 0;
      heights[row * size + column] = heightM;
      if (heightM < minHeightM) minHeightM = heightM;
      if (heightM > maxHeightM) maxHeightM = heightM;
    }
  }
  if (!Number.isFinite(minHeightM)) { minHeightM = 0; maxHeightM = 1; }
  const relief = Math.max(1e-6, maxHeightM - minHeightM);

  const metresPerPixelEast = eastSpan / size;
  const metresPerPixelNorth = northSpan / size;
  const rgba = new Uint8ClampedArray(size * size * 4);

  const at = (row, column) => heights[
    Math.min(size - 1, Math.max(0, row)) * size + Math.min(size - 1, Math.max(0, column))
  ];

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const heightM = heights[row * size + column];
      // Central differences → surface normal → Lambert term. Rows run north-DOWN, so the north
      // gradient is negated to keep the sun where the comment above says it is.
      const slopeEast = (at(row, column + 1) - at(row, column - 1)) / (2 * metresPerPixelEast);
      const slopeNorth = -(at(row + 1, column) - at(row - 1, column)) / (2 * metresPerPixelNorth);
      const [nx, ny, nz] = normalise(-slopeEast, 1, -slopeNorth);
      const lambert = Math.max(0, nx * SUN_E + ny * SUN_U + nz * SUN_N);

      const elevation = (heightM - minHeightM) / relief;
      // Dark valley floor → paler high ground, in the shell's muted green, so the chart sits in
      // the same palette as the rest of the instrument rather than looking like a satellite photo.
      let red = mix(18, 96, elevation);
      let green = mix(34, 112, elevation);
      let blue = mix(24, 82, elevation);

      const shade = 0.45 + 0.75 * lambert;
      red *= shade;
      green *= shade;
      blue *= shade;

      if (waterHeightM !== null && Number.isFinite(waterHeightM) && heightM <= waterHeightM) {
        // Water reads as the one flat, cool region on the chart. The river is the strongest
        // landmark a pilot actually has out of the window, so it has to be findable here too.
        red = 26;
        green = 54;
        blue = 74;
      }

      const index = (row * size + column) * 4;
      rgba[index] = red;
      rgba[index + 1] = green;
      rgba[index + 2] = blue;
      rgba[index + 3] = 255;
    }
  }

  return { widthPx: size, heightPx: size, rgba, minHeightM, maxHeightM };
}
