const DEFAULTS = Object.freeze({
  wideFovDeg: 78,
  cruiseFovDeg: 66,
  wideThroughSpeedMps: 2,
  cruiseSpeedMps: 24,
  maxEdgeWrap01: 0.08,
  responsePerSecond: 4.2,
});

function finite(value, fallback) {
  if (value === null || value === undefined || typeof value === "boolean") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smootherstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function normalizedConfig(options = {}) {
  const cruiseFovDeg = clamp(
    finite(options.cruiseFovDeg, DEFAULTS.cruiseFovDeg),
    48,
    90,
  );
  const wideFovDeg = clamp(
    finite(options.wideFovDeg, DEFAULTS.wideFovDeg),
    cruiseFovDeg,
    96,
  );
  const wideThroughSpeedMps = clamp(
    finite(options.wideThroughSpeedMps, DEFAULTS.wideThroughSpeedMps),
    0,
    30,
  );
  const cruiseSpeedMps = clamp(
    finite(options.cruiseSpeedMps, DEFAULTS.cruiseSpeedMps),
    wideThroughSpeedMps + 1,
    80,
  );
  return Object.freeze({
    wideFovDeg,
    cruiseFovDeg,
    wideThroughSpeedMps,
    cruiseSpeedMps,
    maxEdgeWrap01: clamp(
      finite(options.maxEdgeWrap01, DEFAULTS.maxEdgeWrap01),
      0,
      0.12,
    ),
    responsePerSecond: clamp(
      finite(options.responsePerSecond, DEFAULTS.responsePerSecond),
      0.25,
      20,
    ),
  });
}

function immutableLens(fovDeg, edgeWrap01) {
  return Object.freeze({
    fovDeg,
    edgeWrap01,
    // The lens deliberately never moves the principal point. Any future cylindrical edge pass
    // consumes edgeWrap01 outside this utility while keeping the central sight line rectilinear.
    opticalCenterX01: 0,
    opticalCenterY01: 0,
  });
}

export function lowSpeedLensTarget(speedMps, options) {
  const config = normalizedConfig(options);
  const speed = clamp(finite(speedMps, config.cruiseSpeedMps), 0, 160);
  const speedProgress = (
    speed - config.wideThroughSpeedMps
  ) / (
    config.cruiseSpeedMps - config.wideThroughSpeedMps
  );
  const cruiseBlend = smootherstep01(speedProgress);
  return immutableLens(
    config.wideFovDeg
      + (config.cruiseFovDeg - config.wideFovDeg) * cruiseBlend,
    config.maxEdgeWrap01 * (1 - cruiseBlend),
  );
}

export function neutralLowSpeedLens(options) {
  const config = normalizedConfig(options);
  return immutableLens(config.cruiseFovDeg, 0);
}

export function advanceLowSpeedLens(current, target, deltaSeconds, options) {
  const config = normalizedConfig(options);
  const safeCurrent = current && typeof current === "object"
    ? current
    : neutralLowSpeedLens(config);
  const safeTarget = target && typeof target === "object"
    ? target
    : neutralLowSpeedLens(config);
  const currentFov = clamp(
    finite(safeCurrent.fovDeg, config.cruiseFovDeg),
    48,
    96,
  );
  const targetFov = clamp(
    finite(safeTarget.fovDeg, config.cruiseFovDeg),
    config.cruiseFovDeg,
    config.wideFovDeg,
  );
  const currentEdgeWrap = clamp(
    finite(safeCurrent.edgeWrap01, 0),
    0,
    config.maxEdgeWrap01,
  );
  const targetEdgeWrap = clamp(
    finite(safeTarget.edgeWrap01, 0),
    0,
    config.maxEdgeWrap01,
  );
  const dt = clamp(finite(deltaSeconds, 0), 0, 0.25);
  const blend = 1 - Math.exp(-config.responsePerSecond * dt);
  return immutableLens(
    currentFov + (targetFov - currentFov) * blend,
    currentEdgeWrap + (targetEdgeWrap - currentEdgeWrap) * blend,
  );
}
