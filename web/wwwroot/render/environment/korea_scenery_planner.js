// Worker-safe deterministic scenery planning. Keep this module free of THREE, DOM globals and
// renderer helpers: terrain_mesh_worker.js imports it directly.
export const QUALITY = Object.freeze({
  mobile: Object.freeze({
    treeLimit: 180,
    buildingLimit: 18,
    fieldLimit: 18,
    fieldRowLimit: 96,
    roadSegmentLimit: 32,
    railSegmentLimit: 12,
    powerPoleLimit: 10,
    runwaySegmentLimit: 6,
    grassPatchLimit: 240,
    density: 0.34,
  }),
  balanced: Object.freeze({
    treeLimit: 480,
    buildingLimit: 48,
    fieldLimit: 46,
    fieldRowLimit: 240,
    roadSegmentLimit: 72,
    railSegmentLimit: 28,
    powerPoleLimit: 28,
    runwaySegmentLimit: 10,
    grassPatchLimit: 480,
    density: 0.68,
  }),
  desktop: Object.freeze({
    treeLimit: 900,
    buildingLimit: 90,
    fieldLimit: 90,
    fieldRowLimit: 480,
    roadSegmentLimit: 128,
    railSegmentLimit: 48,
    powerPoleLimit: 52,
    runwaySegmentLimit: 16,
    grassPatchLimit: 960,
    density: 1,
  }),
});

export const KOREA_SCENERY_PROFILES = Object.freeze({
  "1950s": Object.freeze({
    id: "1950s",
    period: "1950s",
    seedSalt: 0x1950_0001,
    treeDensityPerKm2: 34,
    buildingDensityPerKm2: 2.2,
    fieldDensityPerKm2: 7.5,
    treeLimitScale: 0.55,
    buildingLimitScale: 0.35,
    fieldLimitScale: 1,
    settlementClusters: 3,
    settlementSpread01: 0.038,
    shelterbeltBands: 0,
    shelterbeltRowChance: 0,
    shelterbeltColumnChance: 0,
    shelterbeltSpacingM: 95,
    maximumTreeSlope: 0.78,
    maximumBuildingSlope: 0.16,
    maximumFieldSlope: 0.085,
    maximumRoadSlope: 0.24,
    maximumRoadGrade: 0.16,
    maximumRailSlope: 0.16,
    maximumRailGrade: 0.08,
    maximumSettlementHeightM: 760,
    maximumFieldHeightM: 560,
    treeHeightM: [5.5, 13],
    buildingWidthM: [4.5, 10],
    buildingDepthM: [4, 8],
    buildingHeightM: [2.7, 5.8],
    fieldWidthM: [38, 105],
    fieldDepthM: [52, 155],
    fieldRowSpacingM: 6.5,
    fieldRowWidthM: 1.4,
    roadWidthM: [3.4, 5.2],
    roadSegmentM: 125,
    roadRowChance: 0.21,
    roadColumnChance: 0.15,
    railSegmentM: 165,
    railRowChance: 0.10,
    railColumnChance: 0.07,
    powerRowChance: 0.10,
    powerColumnChance: 0.08,
    powerPoleSpacingM: 110,
    powerPoleHeightM: [9, 13],
    airfieldChance: 0.004,
    runwayLengthM: [820, 1_450],
    runwayWidthM: [24, 34],
    highRiseChance: 0,
    crownColor: 0x334a25,
    crownColors: Object.freeze([0x26391f, 0x324925, 0x40542c, 0x2d4222]),
    trunkColor: 0x463722,
    buildingColor: 0x8a806b,
    buildingColors: Object.freeze([0x817762, 0x9a8e72, 0x706b5c]),
    roofColor: 0x4b4033,
    roofColors: Object.freeze([0x4b4033, 0x55483a, 0x3d3832]),
    fieldColor: 0x62683c,
    fieldColors: Object.freeze([0x62683c, 0x777342, 0x4f6036, 0x817646]),
    fieldRowColor: 0x3f482a,
    grassPatchDensityPerKm2: 0,
    grassPatchLimitScale: 0,
    grassColors: Object.freeze([]),
    roadColor: 0x625b4c,
    roadMarkingColor: null,
    railBedColor: 0x514c42,
    railColor: 0x3a3936,
    runwayColor: 0x6b6555,
    powerPoleColor: 0x55432f,
    powerWireColor: 0x353432,
  }),
  modern: Object.freeze({
    id: "modern",
    period: "2030s",
    seedSalt: 0x2030_0001,
    treeDensityPerKm2: 58,
    buildingDensityPerKm2: 7.5,
    fieldDensityPerKm2: 4.2,
    treeLimitScale: 1,
    buildingLimitScale: 1,
    fieldLimitScale: 0.82,
    settlementClusters: 6,
    settlementSpread01: 0.065,
    shelterbeltBands: 0,
    shelterbeltRowChance: 0,
    shelterbeltColumnChance: 0,
    shelterbeltSpacingM: 105,
    maximumTreeSlope: 0.92,
    maximumBuildingSlope: 0.12,
    maximumFieldSlope: 0.075,
    maximumRoadSlope: 0.28,
    maximumRoadGrade: 0.20,
    maximumRailSlope: 0.15,
    maximumRailGrade: 0.065,
    maximumSettlementHeightM: 620,
    maximumFieldHeightM: 480,
    treeHeightM: [6, 16],
    buildingWidthM: [6, 18],
    buildingDepthM: [5, 14],
    buildingHeightM: [3.2, 12],
    fieldWidthM: [72, 190],
    fieldDepthM: [95, 280],
    fieldRowSpacingM: 10,
    fieldRowWidthM: 2.2,
    roadWidthM: [5.8, 11],
    roadSegmentM: 115,
    roadRowChance: 0.38,
    roadColumnChance: 0.30,
    railSegmentM: 150,
    railRowChance: 0.16,
    railColumnChance: 0.12,
    powerRowChance: 0.34,
    powerColumnChance: 0.28,
    powerPoleSpacingM: 210,
    powerPoleHeightM: [18, 31],
    airfieldChance: 0.007,
    runwayLengthM: [1_450, 2_900],
    runwayWidthM: [38, 56],
    highRiseChance: 0.075,
    crownColor: 0x58734a,
    crownColors: Object.freeze([0x294b25, 0x365f2d, 0x4b7039, 0x31552b]),
    trunkColor: 0x695640,
    buildingColor: 0xa9aaa3,
    buildingColors: Object.freeze([0x969993, 0xb3afa4, 0x8d9697, 0xc0b59e]),
    roofColor: 0x515962,
    roofColors: Object.freeze([0x515962, 0x5d514b, 0x46545c]),
    fieldColor: 0x657748,
    fieldColors: Object.freeze([0x657748, 0x7b8047, 0x536f3d, 0x85804d]),
    fieldRowColor: 0x4f623b,
    grassPatchDensityPerKm2: 0,
    grassPatchLimitScale: 0,
    grassColors: Object.freeze([]),
    roadColor: 0x505457,
    roadMarkingColor: 0xd2cfad,
    railBedColor: 0x494b4b,
    railColor: 0x777b7d,
    runwayColor: 0x303337,
    powerPoleColor: 0x686d70,
    powerWireColor: 0x666d70,
  }),
  "ukraine-modern": Object.freeze({
    id: "ukraine-modern",
    theatre: "ukraine",
    period: "late-2030s-accidental-rewild-reserve",
    trainingSector: true,
    seedSalt: 0x26_07_0001,
    // Stage C rewild remains canopy-led, but low-level missions need authored structure rather
    // than uniform tree noise: woodland masses, shelterbelts, former fields and rare settlement
    // islands create navigation cues while leaving most of the terrain quiet.
    // Ship B (2026-07-29): denser Place-scale structure — still sparse vs a village carpet.
    treeDensityPerKm2: 72,
    buildingDensityPerKm2: 2.1,
    // Large former-field planes now live in the seam-safe terrain byte. Per-tile mean-height
    // boxes intersected rolling ground and cost one extra draw for a worse result.
    fieldDensityPerKm2: 0,
    treeLimitScale: 0.62,
    buildingLimitScale: 0.58,
    fieldLimitScale: 0,
    settlementClusters: 6,
    settlementSpread01: 0.038,
    woodlandClusters: 7,
    woodlandSpread01: 0.15,
    woodlandClusterShare: 0.80,
    shelterbeltBands: 2,
    shelterbeltRowChance: 0.62,
    shelterbeltColumnChance: 0.48,
    shelterbeltSpacingM: 95,
    maximumTreeSlope: 0.48,
    maximumBuildingSlope: 0.08,
    maximumFieldSlope: 0.055,
    maximumRoadSlope: 0.16,
    maximumRoadGrade: 0.10,
    maximumRailSlope: 0.09,
    maximumRailGrade: 0.04,
    maximumSettlementHeightM: 340,
    maximumFieldHeightM: 300,
    treeHeightM: [8, 22],
    buildingWidthM: [6, 16],
    buildingDepthM: [5, 18],
    buildingHeightM: [2.8, 7.5],
    fieldWidthM: [180, 520],
    fieldDepthM: [220, 680],
    fieldRowSpacingM: 0,
    fieldRowWidthM: 0,
    roadWidthM: [4.5, 8.5],
    roadSegmentM: 64,
    roadRowChance: 0.34,
    roadColumnChance: 0.26,
    railSegmentM: 160,
    railRowChance: 0.10,
    railColumnChance: 0.08,
    powerRowChance: 0.18,
    powerColumnChance: 0.14,
    powerPoleSpacingM: 160,
    powerPoleHeightM: [10, 18],
    airfieldChance: 0.002,
    runwayLengthM: [1_100, 2_400],
    runwayWidthM: [30, 48],
    highRiseChance: 0.0,
    // Soft canopy blobs instead of faceted fir cones — Ghibli-adjacent silhouettes at low AGL.
    crownShape: "soft-canopy",
    softLit: true,
    // Continuous-ish value ladder; softLit uses Lambert so these are a fallback only.
    toonSteps: Object.freeze([96, 148, 198, 238]),
    crownColor: 0x3a6a38,
    crownColors: Object.freeze([0x2a5230, 0x3a6b3c, 0x4e7a48, 0x244828, 0x5a824c, 0x6a8a52]),
    trunkColor: 0x6a5340,
    buildingColor: 0xc4b8a0,
    buildingColors: Object.freeze([0xc9b89a, 0xd8ccb0, 0xaeb4a6, 0xd0c0aa, 0xb8c0a8]),
    roofColor: 0x7a4a3c,
    // Quiet weathered roofs — readable at low AGL without tourist kitsch.
    roofColors: Object.freeze([0x8a4e3c, 0x5a6468, 0x725848, 0x6a5850, 0x4a6a78]),
    fieldColor: 0x6a8a48,
    // Soft meadow / scrub scars — not ripe wheat parcels.
    fieldColors: Object.freeze([0x8fa866, 0x78955d, 0xa3ad72, 0xaaa06a, 0x6f9258]),
    fieldRowColor: 0x5a6840,
    // The close rewild layer is not a terrain texture. Deterministic clumps give the low-level
    // aircraft real parallax and let one authoritative wind field visibly travel across the land.
    grassPatchDensityPerKm2: 220,
    grassPatchLimitScale: 1,
    grassHeightM: [0.45, 1.15],
    grassRadiusM: [4, 9],
    localGrassRadiusM: 300,
    localGrassSnapM: 42,
    localGrassUpdatesPerFrame: 180,
    // Individual blades are a hover/nap-of-earth cue. Above 120 m AGL the terrain's painted
    // former-field structure carries the picture and the sub-pixel blade batch stays unsubmitted.
    localGrassMaximumCameraAltitudeM: 120,
    grassColors: Object.freeze([0xc8dc7d, 0xaccb68, 0xdbe48e, 0x92b85a, 0xe4d795]),
    roadColor: 0x777069,
    roadMarkingColor: 0xe4d8b8,
    railBedColor: 0x524e48,
    railColor: 0x828078,
    runwayColor: 0x3a3c40,
    powerPoleColor: 0x686460,
    powerWireColor: 0x403c38,
  }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashUnit(value) {
  return hashString(value) / 4294967296;
}

export function mixedUint32(value) {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

export function seededUnit(seed, salt) {
  return mixedUint32(seed ^ salt) / 4294967296;
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function between(random, range) {
  return range[0] + (range[1] - range[0]) * random();
}

export function fraction(value) {
  return value - Math.floor(value);
}

export function surfaceSample(decoded, east01, north01, spanEastM, spanNorthM) {
  const sampleCount = decoded.sampleCount;
  const east = clamp(Math.round(east01 * (sampleCount - 1)), 0, sampleCount - 1);
  const north = clamp(Math.round(north01 * (sampleCount - 1)), 0, sampleCount - 1);
  const index = north * sampleCount + east;
  if (decoded.water[index]) return null;
  const west = Math.max(0, east - 1);
  const eastNeighbour = Math.min(sampleCount - 1, east + 1);
  const south = Math.max(0, north - 1);
  const northNeighbour = Math.min(sampleCount - 1, north + 1);
  const spacingEastM = spanEastM / (sampleCount - 1);
  const spacingNorthM = spanNorthM / (sampleCount - 1);
  const slopeEast = Math.abs(
    decoded.heights[north * sampleCount + eastNeighbour]
      - decoded.heights[north * sampleCount + west],
  ) / Math.max(spacingEastM, (eastNeighbour - west) * spacingEastM);
  const slopeNorth = Math.abs(
    decoded.heights[northNeighbour * sampleCount + east]
      - decoded.heights[south * sampleCount + east],
  ) / Math.max(spacingNorthM, (northNeighbour - south) * spacingNorthM);
  return {
    x: (east01 - 0.5) * spanEastM,
    y: decoded.heights[index],
    z: -(north01 - 0.5) * spanNorthM,
    slope: Math.hypot(slopeEast, slopeNorth),
  };
}

function candidateCount(densityPerKm2, areaKm2, landFraction, limit, qualityDensity) {
  return Math.min(limit,
    Math.max(0, Math.round(densityPerKm2 * areaKm2 * landFraction * qualityDensity)));
}

function chunkGridPosition(chunk) {
  const match = /^e(\d+)-n(\d+)$/.exec(chunk.id);
  return {
    eastIndex: Math.trunc(finite(chunk.eastIndex, match ? Number(match[1]) : 0)),
    northIndex: Math.trunc(finite(chunk.northIndex, match ? Number(match[2]) : 0)),
  };
}

function rectangleSurface(decoded, east01, north01, widthM, depthM, yaw,
  spanEastM, spanNorthM, maximumSlope) {
  const sine = Math.sin(yaw);
  const cosine = Math.cos(yaw);
  const samples = [];
  for (const localEast of [-widthM * 0.5, widthM * 0.5]) {
    for (const localDepth of [-depthM * 0.5, depthM * 0.5]) {
      const worldEast = cosine * localEast + sine * localDepth;
      const worldNorth = sine * localEast - cosine * localDepth;
      const sampleEast01 = east01 + worldEast / spanEastM;
      const sampleNorth01 = north01 + worldNorth / spanNorthM;
      if (sampleEast01 < 0 || sampleEast01 > 1 || sampleNorth01 < 0 || sampleNorth01 > 1) {
        return null;
      }
      const sample = surfaceSample(
        decoded,
        sampleEast01,
        sampleNorth01,
        spanEastM,
        spanNorthM,
      );
      if (!sample || sample.slope > maximumSlope) return null;
      samples.push(sample);
    }
  }
  const centre = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
  if (!centre || centre.slope > maximumSlope) return null;
  const heights = [...samples.map((sample) => sample.y), centre.y];
  if (Math.max(...heights) - Math.min(...heights)
    > Math.max(widthM, depthM) * maximumSlope) return null;
  return { ...centre, y: heights.reduce((sum, value) => sum + value, 0) / heights.length };
}

function routePoint(east01, north01) {
  return Object.freeze({ east01, north01 });
}

function routeOffset(profile, feature, axis, index) {
  return 0.13 + hashUnit(`${profile.id}:${feature}:${axis}:offset:${index}`) * 0.74;
}

function axisRoutes(chunk, profile, feature, rowChance, columnChance) {
  const { eastIndex, northIndex } = chunkGridPosition(chunk);
  const routes = [];
  if (hashUnit(`${profile.id}:${feature}:row:${northIndex}`) < rowChance) {
    const north01 = routeOffset(profile, feature, "row", northIndex);
    routes.push(Object.freeze({
      key: `${profile.id}:${feature}:row:${northIndex}`,
      start: routePoint(0.005, north01),
      end: routePoint(0.995, north01),
    }));
  }
  if (hashUnit(`${profile.id}:${feature}:column:${eastIndex}`) < columnChance) {
    const east01 = routeOffset(profile, feature, "column", eastIndex);
    routes.push(Object.freeze({
      key: `${profile.id}:${feature}:column:${eastIndex}`,
      start: routePoint(east01, 0.005),
      end: routePoint(east01, 0.995),
    }));
  }
  return routes;
}

function traceRoute(decoded, route, spanEastM, spanNorthM, options) {
  const deltaEastM = (route.end.east01 - route.start.east01) * spanEastM;
  const deltaNorthM = (route.end.north01 - route.start.north01) * spanNorthM;
  const horizontalLengthM = Math.hypot(deltaEastM, deltaNorthM);
  const stepCount = Math.max(1, Math.min(
    options.maximumSegments,
    Math.ceil(horizontalLengthM / options.preferredSegmentM),
  ));
  const points = [];
  for (let index = 0; index <= stepCount; index++) {
    const fraction = index / stepCount;
    const surface = surfaceSample(
      decoded,
      route.start.east01 + (route.end.east01 - route.start.east01) * fraction,
      route.start.north01 + (route.end.north01 - route.start.north01) * fraction,
      spanEastM,
      spanNorthM,
    );
    points.push(surface && surface.slope <= options.maximumSlope ? surface : null);
  }
  const segments = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    const runM = Math.hypot(end.x - start.x, end.z - start.z);
    if (!runM || Math.abs(end.y - start.y) / runM > options.maximumGrade) continue;
    segments.push({
      fromX: start.x,
      fromY: start.y,
      fromZ: start.z,
      toX: end.x,
      toY: end.y,
      toZ: end.z,
      widthM: options.widthM,
    });
  }
  return Object.freeze({ points: Object.freeze(points), segments: Object.freeze(segments) });
}

function appendRoutes(target, routes, limit, decoded, spanEastM, spanNorthM, options) {
  for (let routeIndex = 0; routeIndex < routes.length && target.length < limit; routeIndex++) {
    const remainingRoutes = routes.length - routeIndex;
    const maximumSegments = Math.max(1, Math.floor((limit - target.length) / remainingRoutes));
    const widthM = typeof options.widthM === "function"
      ? options.widthM(routes[routeIndex], routeIndex)
      : options.widthM;
    const traced = traceRoute(decoded, routes[routeIndex], spanEastM, spanNorthM, {
      ...options,
      maximumSegments,
      widthM,
    });
    target.push(...traced.segments.slice(0, limit - target.length));
  }
}

function fieldRowSegments(fields, profile, limit) {
  const rows = [];
  if (!(profile.fieldRowSpacingM > 0) || !(profile.fieldRowWidthM > 0)) return rows;
  for (let fieldIndex = 0; fieldIndex < fields.length && rows.length < limit; fieldIndex++) {
    const field = fields[fieldIndex];
    const desired = Math.max(1, Math.floor(field.widthM / profile.fieldRowSpacingM) - 1);
    const remainingFields = fields.length - fieldIndex;
    const count = Math.min(desired, Math.max(1, Math.floor((limit - rows.length) / remainingFields)));
    const sine = Math.sin(field.yaw);
    const cosine = Math.cos(field.yaw);
    for (let index = 0; index < count && rows.length < limit; index++) {
      const localEast = -field.widthM * 0.5 + field.widthM * (index + 1) / (count + 1);
      const startDepth = -field.depthM * 0.48;
      const endDepth = field.depthM * 0.48;
      rows.push({
        fromX: field.x + cosine * localEast + sine * startDepth,
        fromY: field.y,
        fromZ: field.z - sine * localEast + cosine * startDepth,
        toX: field.x + cosine * localEast + sine * endDepth,
        toY: field.y,
        toZ: field.z - sine * localEast + cosine * endDepth,
        widthM: profile.fieldRowWidthM,
      });
    }
  }
  return rows;
}

export function normaliseAmbientExclusionZones(zones) {
  if (!Array.isArray(zones)) return Object.freeze([]);
  return Object.freeze(zones.flatMap((zone) => {
    const eastM = Number(zone?.eastM);
    const northM = Number(zone?.northM);
    const radiusM = Number(zone?.radiusM);
    return Number.isFinite(eastM) && Number.isFinite(northM) && radiusM > 0
      ? [Object.freeze({ eastM, northM, radiusM })]
      : [];
  }));
}

/// Prepared plans cross an asynchronous Worker boundary. Carry the exact normalized exclusion
/// footprint that shaped the plan so a presentation can never reuse candidates prepared for a
/// different authored mission island.
export function ambientExclusionIdentity(zones) {
  const normalised = normaliseAmbientExclusionZones(zones);
  return JSON.stringify(normalised.map((zone) => [
    zone.eastM,
    zone.northM,
    zone.radiusM,
  ]));
}

export function pointInsideAmbientExclusion(sourceEastM, sourceNorthM, zones, paddingM = 0) {
  return zones.some((zone) => {
    const radiusM = zone.radiusM + Math.max(0, paddingM);
    return Math.hypot(sourceEastM - zone.eastM, sourceNorthM - zone.northM) < radiusM;
  });
}

function segmentInsideAmbientExclusion(segment, centreEastM, centreNorthM, zones) {
  const fromEastM = centreEastM + segment.fromX;
  const fromNorthM = centreNorthM - segment.fromZ;
  const toEastM = centreEastM + segment.toX;
  const toNorthM = centreNorthM - segment.toZ;
  const deltaEastM = toEastM - fromEastM;
  const deltaNorthM = toNorthM - fromNorthM;
  const lengthSquaredM = deltaEastM * deltaEastM + deltaNorthM * deltaNorthM;
  return zones.some((zone) => {
    const fraction = lengthSquaredM > 0
      ? clamp(
        ((zone.eastM - fromEastM) * deltaEastM
          + (zone.northM - fromNorthM) * deltaNorthM) / lengthSquaredM,
        0,
        1,
      )
      : 0;
    const closestEastM = fromEastM + deltaEastM * fraction;
    const closestNorthM = fromNorthM + deltaNorthM * fraction;
    return Math.hypot(
      closestEastM - zone.eastM,
      closestNorthM - zone.northM,
    ) < zone.radiusM;
  });
}

/// Authored mission features own their immediate visual footprint. Ambient scenery consumes this
/// mask but never creates, classifies, or certifies the feature itself.
function applyAmbientExclusions(plan, chunk, zones) {
  if (!zones.length) return;
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = chunk.boundsLocalM;
  const centreEastM = (minimumEast + maximumEast) * 0.5;
  const centreNorthM = (minimumNorth + maximumNorth) * 0.5;
  const removePoint = (item) => pointInsideAmbientExclusion(
    centreEastM + item.x,
    centreNorthM - item.z,
    zones,
    Math.hypot(Number(item.widthM) || 0, Number(item.depthM) || 0) * 0.5,
  );
  for (const items of [plan.trees, plan.buildings, plan.fields, plan.powerPoles]) {
    for (let index = items.length - 1; index >= 0; index--) {
      if (removePoint(items[index])) items.splice(index, 1);
    }
  }
  for (const segments of [
    plan.roads,
    plan.railSegments,
    plan.runways,
    plan.powerLines,
  ]) {
    for (let index = segments.length - 1; index >= 0; index--) {
      if (segmentInsideAmbientExclusion(
        segments[index],
        centreEastM,
        centreNorthM,
        zones,
      )) {
        segments.splice(index, 1);
      }
    }
  }
}

export function planKoreaScenery(chunk, decoded, options = {}) {
  const profile = KOREA_SCENERY_PROFILES[options.era ?? "1950s"];
  if (!profile) throw new TypeError(`Unknown Korea scenery era: ${options.era}.`);
  const quality = QUALITY[options.qualityTier] ?? QUALITY.balanced;
  const ring = options.ring === "mid" ? "mid" : "near";
  // Only Ukraine's soft-canopy profile has an authored reduced mid ring. Korea retains its
  // established density and stand grammar when LOD1 is the closest selectable mobile tier.
  const reducedMidRing = ring === "mid" && profile.theatre === "ukraine";
  const ringDensity = reducedMidRing ? 0.5 : 1;
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = chunk.boundsLocalM;
  const spanEastM = maximumEast - minimumEast;
  const spanNorthM = maximumNorth - minimumNorth;
  const areaKm2 = spanEastM * spanNorthM / 1_000_000;
  const declaredLandFraction = finite(chunk.generation?.landFraction, NaN);
  const landFraction = Number.isFinite(declaredLandFraction)
    ? clamp(declaredLandFraction, 0, 1)
    : 1 - decoded.water.reduce((sum, value) => sum + value, 0) / decoded.water.length;
  const seed = (Number(chunk.generation?.seed) || hashString(chunk.id)) ^ profile.seedSalt;
  const random = randomGenerator(seed);
  const trees = [];
  const buildings = [];
  const fields = [];
  const grass = [];
  const roads = [];
  const railSegments = [];
  const runways = [];
  const powerPoles = [];
  const powerLines = [];
  const ambientExclusionZones = normaliseAmbientExclusionZones(
    options.ambientExclusionZones,
  );
  const exclusionIdentity = ambientExclusionIdentity(ambientExclusionZones);
  const treeTarget = candidateCount(profile.treeDensityPerKm2, areaKm2, landFraction,
    Math.round(quality.treeLimit * profile.treeLimitScale * ringDensity),
    quality.density * ringDensity);
  const buildingTarget = candidateCount(profile.buildingDensityPerKm2, areaKm2, landFraction,
    Math.round(quality.buildingLimit * profile.buildingLimitScale * ringDensity),
    quality.density * ringDensity);
  const fieldTarget = candidateCount(profile.fieldDensityPerKm2, areaKm2, landFraction,
    Math.round(quality.fieldLimit * profile.fieldLimitScale * ringDensity),
    quality.density * ringDensity);
  // Individual blades only earn their cost in the closest ring. Distant meadow colour and shape
  // belong in the terrain material; distributing animated blades through LOD1 was nearly invisible
  // and multiplied the Ukraine theatre's fill and vertex work.
  const grassRingDensity = ring === "near" ? 1 : 0;
  const grassTarget = candidateCount(
    profile.grassPatchDensityPerKm2 ?? 0,
    areaKm2,
    landFraction,
    Math.round(quality.grassPatchLimit
      * (profile.grassPatchLimitScale ?? 0) * grassRingDensity),
    quality.density * grassRingDensity,
  );

  const addTree = (surface, variation, options = {}) => {
    const naturalWidthScale = 0.72 + fraction(variation * 7.123) * 0.62;
    trees.push({
      ...surface,
      kind: options.kind ?? "woodland",
      yaw: Number.isFinite(options.yaw) ? options.yaw : variation * Math.PI * 2,
      heightM: profile.treeHeightM[0]
        + (profile.treeHeightM[1] - profile.treeHeightM[0]) * fraction(variation * 3.731),
      widthScale: naturalWidthScale * finite(options.widthScale, 1),
      crownVariant: Math.floor(fraction(variation * 11.417) * profile.crownColors.length),
    });
  };

  // Ukrainian agricultural shelterbelts are structural navigation cues, not generic tree noise.
  // Their deterministic row/column keys continue across chunk edges, while the ordinary scatter
  // below fills only the remaining profile budget.
  const shelterbeltRoutes = [];
  const shelterbeltBands = Math.max(0, Math.round(profile.shelterbeltBands ?? 1));
  for (let band = 0; band < shelterbeltBands; band++) {
    shelterbeltRoutes.push(...axisRoutes(
      chunk,
      profile,
      `shelterbelt-${band}`,
      profile.shelterbeltRowChance ?? 0,
      profile.shelterbeltColumnChance ?? 0,
    ));
  }
  for (let routeIndex = 0; routeIndex < shelterbeltRoutes.length
    && trees.length < treeTarget; routeIndex++) {
    const route = shelterbeltRoutes[routeIndex];
    const deltaEastM = (route.end.east01 - route.start.east01) * spanEastM;
    const deltaNorthM = (route.end.north01 - route.start.north01) * spanNorthM;
    const lengthM = Math.hypot(deltaEastM, deltaNorthM);
    const remainingRoutes = shelterbeltRoutes.length - routeIndex;
    const routeBudget = Math.max(1, Math.floor((treeTarget - trees.length) / remainingRoutes));
    const count = Math.min(
      routeBudget,
      Math.max(1, Math.ceil(lengthM / Math.max(20, profile.shelterbeltSpacingM ?? 95))),
    );
    const perpendicularEast = lengthM > 0 ? -deltaNorthM / lengthM : 0;
    const perpendicularNorth = lengthM > 0 ? deltaEastM / lengthM : 0;
    const routeYaw = Math.atan2(deltaNorthM, deltaEastM);
    for (let index = 0; index < count && trees.length < treeTarget; index++) {
      const along = (index + 0.5) / count;
      const variation = hashUnit(`${route.key}:${chunk.id}:tree:${index}`);
      const jitterM = (fraction(variation * 17.313) - 0.5) * 18;
      const east01 = route.start.east01
        + (route.end.east01 - route.start.east01) * along
        + perpendicularEast * jitterM / spanEastM;
      const north01 = route.start.north01
        + (route.end.north01 - route.start.north01) * along
        + perpendicularNorth * jitterM / spanNorthM;
      const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
      if (!surface || surface.slope > profile.maximumTreeSlope) continue;
      // One planned stand should read as part of a continuous windbreak, not a randomly rotated
      // copse. Stretch its existing shared geometry along the route; instance and triangle counts
      // stay unchanged while the 110 m sampling begins to form a legible shelterbelt.
      addTree(surface, variation, {
        kind: "shelterbelt",
        yaw: routeYaw,
        widthScale: 2.15,
      });
    }
  }

  const woodlandCentres = [];
  const woodlandClusterCount = Math.max(0, Math.round(profile.woodlandClusters ?? 0));
  for (let index = 0; index < woodlandClusterCount; index++) {
    woodlandCentres.push({
      east01: 0.06 + random() * 0.88,
      north01: 0.06 + random() * 0.88,
    });
  }

  let attempts = 0;
  while (trees.length < treeTarget && attempts++ < treeTarget * 8 + 32) {
    let east01 = random();
    let north01 = random();
    if (woodlandCentres.length && random() < (profile.woodlandClusterShare ?? 0)) {
      const centre = woodlandCentres[Math.floor(random() * woodlandCentres.length)];
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (profile.woodlandSpread01 ?? 0.12);
      east01 = clamp(centre.east01 + Math.cos(angle) * radius, 0.01, 0.99);
      north01 = clamp(centre.north01 + Math.sin(angle) * radius, 0.01, 0.99);
    }
    const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
    if (!surface || surface.slope > profile.maximumTreeSlope) continue;
    addTree(surface, random(), { kind: "woodland" });
  }

  const centres = [];
  attempts = 0;
  while (centres.length < profile.settlementClusters && attempts++ < 80) {
    const east01 = 0.08 + random() * 0.84;
    const north01 = 0.08 + random() * 0.84;
    const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
    if (!surface || surface.slope > profile.maximumBuildingSlope
      || surface.y > profile.maximumSettlementHeightM) continue;
    centres.push({
      east01,
      north01,
      fallbackYaw: random() * Math.PI,
    });
  }
  for (let index = 0; index < centres.length; index++) {
    const start = centres[Math.max(0, index - 1)];
    const end = centres[Math.min(centres.length - 1, index + 1)];
    const deltaEastM = (end.east01 - start.east01) * spanEastM;
    const deltaNorthM = (end.north01 - start.north01) * spanNorthM;
    centres[index].corridorYaw = Math.hypot(deltaEastM, deltaNorthM) > 1
      ? Math.atan2(deltaEastM, -deltaNorthM)
      : centres[index].fallbackYaw;
  }
  attempts = 0;
  while (buildings.length < buildingTarget && centres.length
    && attempts++ < buildingTarget * 14 + 64) {
    const settlementIndex = Math.floor(random() * centres.length);
    const centre = centres[settlementIndex];
    const spread = profile.settlementSpread01;
    const east01 = clamp(centre.east01 + (random() + random() - 1) * spread, 0.01, 0.99);
    const north01 = clamp(centre.north01 + (random() + random() - 1) * spread, 0.01, 0.99);
    const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
    if (!surface || surface.slope > profile.maximumBuildingSlope
      || surface.y > profile.maximumSettlementHeightM) continue;
    const style = random();
    const highRise = style < profile.highRiseChance;
    const quarterTurn = fraction(style * 3.719) < 0.34 ? Math.PI * 0.5 : 0;
    const buildingIndex = buildings.length;
    const buildingKind = highRise
      ? "apartment"
      : fraction(style * 5.317) < 0.3 ? "agricultural" : "house";
    buildings.push({
      ...surface,
      entityId: `scenery.${profile.id}.${chunk.id}.building.${buildingIndex}`,
      role: "ambient",
      targetable: false,
      kind: buildingKind,
      settlementIndex,
      yaw: centre.corridorYaw + quarterTurn + (fraction(style * 9.137) - 0.5) * 0.24,
      widthM: between(random, profile.buildingWidthM) * (highRise ? 1.25 : 1),
      depthM: between(random, profile.buildingDepthM) * (highRise ? 1.25 : 1),
      heightM: highRise ? 24 + random() * 68 : between(random, profile.buildingHeightM),
      highRise,
      colorVariant: Math.floor(fraction(style * 15.311) * profile.buildingColors.length),
    });
  }

  attempts = 0;
  while (fields.length < fieldTarget && attempts++ < fieldTarget * 14 + 48) {
    const fieldStyle = random();
    const east01 = 0.025 + random() * 0.95;
    const north01 = 0.025 + random() * 0.95;
    const yaw = fieldStyle * Math.PI;
    const widthM = between(random, profile.fieldWidthM);
    const depthM = between(random, profile.fieldDepthM);
    const surface = rectangleSurface(
      decoded, east01, north01, widthM, depthM, yaw,
      spanEastM, spanNorthM, profile.maximumFieldSlope,
    );
    if (!surface || surface.y > profile.maximumFieldHeightM) continue;
    fields.push({
      ...surface,
      yaw,
      widthM,
      depthM,
      colorVariant: Math.floor(fraction(fieldStyle * 13.173) * profile.fieldColors.length),
    });
  }

  const roadRoutes = axisRoutes(
    chunk, profile, "road", profile.roadRowChance, profile.roadColumnChance,
  );
  for (let index = 1; index < centres.length; index++) {
    roadRoutes.push(Object.freeze({
      start: routePoint(centres[index - 1].east01, centres[index - 1].north01),
      end: routePoint(centres[index].east01, centres[index].north01),
    }));
  }
  appendRoutes(
    roads, roadRoutes, quality.roadSegmentLimit, decoded, spanEastM, spanNorthM,
    {
      preferredSegmentM: profile.roadSegmentM,
      maximumSlope: profile.maximumRoadSlope,
      maximumGrade: profile.maximumRoadGrade,
      widthM: (route) => route.key
        ? profile.roadWidthM[0] + (profile.roadWidthM[1] - profile.roadWidthM[0])
          * hashUnit(`${route.key}:width`)
        : between(random, profile.roadWidthM),
    },
  );

  const railRoutes = axisRoutes(
    chunk, profile, "rail", profile.railRowChance, profile.railColumnChance,
  );
  appendRoutes(
    railSegments, railRoutes, quality.railSegmentLimit, decoded, spanEastM, spanNorthM,
    {
      preferredSegmentM: profile.railSegmentM,
      maximumSlope: profile.maximumRailSlope,
      maximumGrade: profile.maximumRailGrade,
      widthM: 3.8,
    },
  );

  let airfieldCount = 0;
  if (hashUnit(`${profile.id}:airfield:${chunk.id}`) < profile.airfieldChance) {
    attempts = 0;
    while (!airfieldCount && attempts++ < 18) {
      const east01 = 0.18 + random() * 0.64;
      const north01 = 0.18 + random() * 0.64;
      const yaw = random() * Math.PI;
      const lengthM = between(random, profile.runwayLengthM);
      const widthM = between(random, profile.runwayWidthM);
      const surface = rectangleSurface(
        decoded, east01, north01, widthM, lengthM, yaw,
        spanEastM, spanNorthM, 0.035,
      );
      if (!surface || surface.y > 420) continue;
      const sine = Math.sin(yaw);
      const cosine = Math.cos(yaw);
      const halfLengthM = lengthM * 0.5;
      const route = Object.freeze({
        start: routePoint(
          east01 - sine * halfLengthM / spanEastM,
          north01 + cosine * halfLengthM / spanNorthM,
        ),
        end: routePoint(
          east01 + sine * halfLengthM / spanEastM,
          north01 - cosine * halfLengthM / spanNorthM,
        ),
      });
      const traced = traceRoute(decoded, route, spanEastM, spanNorthM, {
        maximumSegments: quality.runwaySegmentLimit,
        preferredSegmentM: 240,
        maximumSlope: 0.05,
        maximumGrade: 0.025,
        widthM,
      });
      if (!traced.segments.length) continue;
      runways.push(...traced.segments);
      airfieldCount = 1;
    }
  }

  const powerRoutes = axisRoutes(
    chunk, profile, "power", profile.powerRowChance, profile.powerColumnChance,
  );
  for (let routeIndex = 0; routeIndex < powerRoutes.length
    && powerPoles.length < quality.powerPoleLimit; routeIndex++) {
    const remainingRoutes = powerRoutes.length - routeIndex;
    const maximumPoles = Math.max(
      2,
      Math.floor((quality.powerPoleLimit - powerPoles.length) / remainingRoutes),
    );
    const route = powerRoutes[routeIndex];
    const poleHeightM = route.key
      ? profile.powerPoleHeightM[0]
        + (profile.powerPoleHeightM[1] - profile.powerPoleHeightM[0])
          * hashUnit(`${route.key}:height`)
      : between(random, profile.powerPoleHeightM);
    const traced = traceRoute(decoded, route, spanEastM, spanNorthM, {
      maximumSegments: maximumPoles - 1,
      preferredSegmentM: profile.powerPoleSpacingM,
      maximumSlope: 0.85,
      maximumGrade: 0.55,
      widthM: 0.12,
    });
    let prior = null;
    for (const point of traced.points) {
      if (!point) {
        prior = null;
        continue;
      }
      if (powerPoles.length >= quality.powerPoleLimit) break;
      powerPoles.push({ ...point, heightM: poleHeightM });
      if (prior) {
        powerLines.push({
          fromX: prior.x,
          fromY: prior.y + poleHeightM * 0.92,
          fromZ: prior.z,
          toX: point.x,
          toY: point.y + poleHeightM * 0.92,
          toZ: point.z,
          widthM: profile.id === "1950s" ? 0.085 : 0.12,
        });
      }
      prior = point;
    }
  }

  applyAmbientExclusions({
    trees,
    buildings,
    fields,
    roads,
    railSegments,
    runways,
    powerPoles,
    powerLines,
  }, chunk, ambientExclusionZones);
  const fieldRows = fieldRowSegments(fields, profile, quality.fieldRowLimit);

  return Object.freeze({
    era: profile.id,
    qualityTier: options.qualityTier ?? "balanced",
    period: profile.period,
    ring,
    seed: seed >>> 0,
    ambientExclusionIdentity: exclusionIdentity,
    trees: Object.freeze(trees),
    buildings: Object.freeze(buildings),
    fields: Object.freeze(fields),
    grass: Object.freeze(grass),
    grassPatchCapacity: grassTarget,
    fieldRows: Object.freeze(fieldRows),
    roads: Object.freeze(roads),
    railSegments: Object.freeze(railSegments),
    runways: Object.freeze(runways),
    airfieldCount,
    powerPoles: Object.freeze(powerPoles),
    powerLines: Object.freeze(powerLines),
  });
}
