import { AssetPipelineError, assetAssert } from "./errors.js?runtime=2";

const LOD_THRESHOLD_FIELDS = [
  "minProjectedPixelHeight",
  "minProjectedPixels",
  "minPixelHeight",
  "minPixels",
  "threshold",
];

export function lodMinimumPixelHeight(lod, path = "lod") {
  assetAssert(lod && typeof lod === "object", "INVALID_LOD", `${path} must be an object.`, { path });
  let raw;
  for (const field of LOD_THRESHOLD_FIELDS) {
    if (lod[field] !== undefined) {
      raw = lod[field];
      break;
    }
  }
  if (raw === undefined) raw = 0;
  const value = Number(raw);
  assetAssert(Number.isFinite(value) && value >= 0, "INVALID_LOD_THRESHOLD",
    `${path}.minProjectedPixelHeight must be a finite number >= 0.`, { path, details: raw });
  return value;
}

/**
 * Selects the most detailed LOD whose minimum screen-height requirement is met.
 * Input order does not matter. If the object is smaller than every threshold,
 * the lowest-threshold entry is returned as the final silhouette fallback.
 */
export function selectLodByProjectedPixelHeight(lods, projectedPixelHeight, options = {}) {
  assetAssert(Array.isArray(lods) && lods.length > 0, "MISSING_LODS",
    "LOD selection requires at least one LOD entry.");

  const rawHeight = projectedPixelHeight === undefined ? Number.POSITIVE_INFINITY : projectedPixelHeight;
  const height = Number(rawHeight);
  if (!(Number.isFinite(height) || height === Number.POSITIVE_INFINITY) || height < 0) {
    throw new AssetPipelineError("INVALID_PROJECTED_PIXEL_HEIGHT",
      "projectedPixelHeight must be a number >= 0 or Infinity.", { details: rawHeight });
  }

  const scale = options.pixelHeightScale === undefined ? 1 : Number(options.pixelHeightScale);
  assetAssert(Number.isFinite(scale) && scale > 0, "INVALID_LOD_SCALE",
    "pixelHeightScale must be a finite number > 0.", { details: options.pixelHeightScale });
  const effectiveHeight = height * scale;

  let selected = null;
  let selectedThreshold = Number.NEGATIVE_INFINITY;
  let lowest = null;
  let lowestThreshold = Number.POSITIVE_INFINITY;

  for (let index = 0; index < lods.length; index++) {
    const lod = lods[index];
    const threshold = lodMinimumPixelHeight(lod, `lods[${index}]`);
    if (threshold < lowestThreshold) {
      lowest = lod;
      lowestThreshold = threshold;
    }
    if (effectiveHeight >= threshold && threshold > selectedThreshold) {
      selected = lod;
      selectedThreshold = threshold;
    }
  }

  return selected ?? lowest;
}

function sameLod(candidate, current) {
  if (candidate === current) return true;
  const currentId = typeof current === "string" || typeof current === "number"
    ? String(current)
    : current?.id ?? current?.level;
  const candidateId = candidate?.id ?? candidate?.level;
  return currentId !== undefined && candidateId !== undefined && String(currentId) === String(candidateId);
}

/**
 * Stateful-friendly LOD selection with asymmetric switch thresholds. A higher
 * detail level requires crossing its threshold by +hysteresis; the current
 * level is retained while shrinking until it falls -hysteresis below its own
 * threshold. This prevents range/pixel quantization from thrashing model loads.
 */
export function selectLodWithHysteresis(lods, projectedPixelHeight, currentLod, options = {}) {
  if (currentLod === undefined || currentLod === null) {
    return selectLodByProjectedPixelHeight(lods, projectedPixelHeight, options);
  }
  const hysteresis = options.hysteresis === undefined ? 0.12 : Number(options.hysteresis);
  assetAssert(Number.isFinite(hysteresis) && hysteresis >= 0 && hysteresis < 1,
    "INVALID_LOD_HYSTERESIS", "LOD hysteresis must be a finite number in [0, 1).", {
      details: options.hysteresis,
    });
  const scale = options.pixelHeightScale === undefined ? 1 : Number(options.pixelHeightScale);
  assetAssert(Number.isFinite(scale) && scale > 0, "INVALID_LOD_SCALE",
    "pixelHeightScale must be a finite number > 0.", { details: options.pixelHeightScale });
  const height = projectedPixelHeight === undefined ? Number.POSITIVE_INFINITY : Number(projectedPixelHeight);
  assetAssert((Number.isFinite(height) || height === Number.POSITIVE_INFINITY) && height >= 0,
    "INVALID_PROJECTED_PIXEL_HEIGHT", "projectedPixelHeight must be a number >= 0 or Infinity.", {
      details: projectedPixelHeight,
    });

  const ordered = [...lods].sort((a, b) => lodMinimumPixelHeight(b) - lodMinimumPixelHeight(a));
  const currentIndex = ordered.findIndex((lod) => sameLod(lod, currentLod));
  if (currentIndex < 0) return selectLodByProjectedPixelHeight(lods, projectedPixelHeight, options);
  const current = ordered[currentIndex];
  const base = selectLodByProjectedPixelHeight(ordered, projectedPixelHeight, options);
  const baseIndex = ordered.indexOf(base);
  if (baseIndex === currentIndex) return current;
  const effectiveHeight = height * scale;

  if (baseIndex < currentIndex) {
    // Moving toward higher detail: demand a margin above every crossed boundary.
    for (let index = 0; index < currentIndex; index++) {
      const threshold = lodMinimumPixelHeight(ordered[index]) * (1 + hysteresis);
      if (effectiveHeight >= threshold) return ordered[index];
    }
    return current;
  }

  // Moving toward lower detail: retain current until it is clearly below its threshold.
  if (effectiveHeight >= lodMinimumPixelHeight(current) * (1 - hysteresis)) return current;
  for (let index = currentIndex + 1; index < ordered.length; index++) {
    const threshold = lodMinimumPixelHeight(ordered[index]) * (1 - hysteresis);
    if (effectiveHeight >= threshold) return ordered[index];
  }
  return ordered[ordered.length - 1];
}

export class LodSelectionState {
  constructor(options = {}) {
    this.hysteresis = options.hysteresis ?? 0.12;
    this.current = options.current ?? null;
  }

  select(lods, projectedPixelHeight, options = {}) {
    this.current = selectLodWithHysteresis(lods, projectedPixelHeight, this.current, {
      ...options,
      hysteresis: options.hysteresis ?? this.hysteresis,
    });
    return this.current;
  }

  reset(current = null) {
    this.current = current;
  }
}

function vectorComponents(value, path) {
  const components = Array.isArray(value)
    ? value.slice(0, 3)
    : value && typeof value === "object"
      ? [value.x, value.y, value.z]
      : [];
  assetAssert(components.length === 3 && components.every((component) => Number.isFinite(Number(component))),
    "INVALID_VECTOR", `${path} must provide finite x, y, and z components.`, {
      path,
      details: value,
    });
  return components.map(Number);
}

/**
 * Returns the diameter of the sphere enclosing an axis-aligned bounds box.
 * This is orientation-independent, unlike using only the box's upright height.
 */
export function boundingSphereDiameterFromSize(boundsSize) {
  const [x, y, z] = vectorComponents(boundsSize, "boundsSize");
  assetAssert(x >= 0 && y >= 0 && z >= 0, "INVALID_BOUNDS_SIZE",
    "boundsSize components must be >= 0.", { path: "boundsSize", details: boundsSize });
  return Math.hypot(x, y, z);
}

/**
 * Conservative scale for a bounding sphere under an arbitrary world transform.
 * Mirrored axes are valid; the largest absolute component keeps the sphere enclosing.
 */
export function maximumAxisScale(worldScale) {
  const [x, y, z] = vectorComponents(worldScale, "worldScale");
  return Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
}

/**
 * Fast projected-extent estimate. `worldHeight` is retained as the public field
 * name for compatibility, but callers may supply any screen-relevant world extent
 * such as an orientation-independent bounding-sphere diameter.
 */
export function estimateProjectedPixelHeight({
  worldHeight,
  distance,
  verticalFovRadians,
  viewportHeight,
}) {
  const height = Number(worldHeight);
  const range = Number(distance);
  const fov = Number(verticalFovRadians);
  const pixels = Number(viewportHeight);
  assetAssert(Number.isFinite(height) && height >= 0, "INVALID_WORLD_HEIGHT",
    "worldHeight must be a finite number >= 0.");
  assetAssert(Number.isFinite(range) && range >= 0, "INVALID_DISTANCE",
    "distance must be a finite number >= 0.");
  assetAssert(Number.isFinite(fov) && fov > 0 && fov < Math.PI, "INVALID_VERTICAL_FOV",
    "verticalFovRadians must be between 0 and PI.");
  assetAssert(Number.isFinite(pixels) && pixels > 0, "INVALID_VIEWPORT_HEIGHT",
    "viewportHeight must be a finite number > 0.");
  if (height === 0) return 0;
  if (range === 0) return Number.POSITIVE_INFINITY;
  return pixels * height / (2 * range * Math.tan(fov * 0.5));
}
