import { mergeGeometries } from "../../vendor/three/addons/utils/BufferGeometryUtils.js";

// One chunk-time matrix now places a whole small stand. The extra silhouettes live in the shared
// geometry, so forest density costs vertices/fill on the under-drawn GPU instead of multiplying
// the synchronous LOD0 planning and matrix-composition work that already hitches the main thread.
export const KOREA_TREE_STAND_SIZE = 7;
// Mid-ring (terrain LOD1) Ukraine stands: fewer silhouettes per instance so the far ring stays
// readable without paying the full soft-canopy sphere budget twice.
export const UKRAINE_MID_RING_STAND_SIZE = 3;
export const SOFT_WORLD_GRASS_BLADES_PER_PATCH = 24;

const TREE_STAND_LAYOUT = Object.freeze([
  Object.freeze({ x: 0, z: 0, height: 1, radius: 1 }),
  Object.freeze({ x: -1.75, z: 0.55, height: 0.76, radius: 0.82 }),
  Object.freeze({ x: 1.45, z: -0.72, height: 0.88, radius: 0.90 }),
  Object.freeze({ x: 0.48, z: 1.72, height: 0.68, radius: 0.76 }),
  Object.freeze({ x: -0.72, z: -1.68, height: 0.64, radius: 0.72 }),
  Object.freeze({ x: 2.28, z: 1.05, height: 0.58, radius: 0.66 }),
  Object.freeze({ x: -2.18, z: -0.92, height: 0.55, radius: 0.64 }),
]);

const UKRAINE_MID_RING_STAND_LAYOUT = Object.freeze(
  TREE_STAND_LAYOUT.slice(0, UKRAINE_MID_RING_STAND_SIZE),
);

const BUILDING_COMPOUND_LAYOUT = Object.freeze([
  Object.freeze({ x: 0, z: 0, width: 1, depth: 1, height: 1 }),
  Object.freeze({ x: 0.92, z: 0.48, width: 0.58, depth: 0.62, height: 0.66 }),
  Object.freeze({ x: -0.78, z: -0.68, width: 0.50, depth: 0.68, height: 0.74 }),
]);

const QUALITY = Object.freeze({
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
    treeDensityPerKm2: 56,
    buildingDensityPerKm2: 1.4,
    fieldDensityPerKm2: 1.2,
    treeLimitScale: 0.55,
    buildingLimitScale: 0.5,
    fieldLimitScale: 0.55,
    settlementClusters: 4,
    settlementSpread01: 0.042,
    woodlandClusters: 5,
    woodlandSpread01: 0.16,
    woodlandClusterShare: 0.78,
    shelterbeltBands: 1,
    shelterbeltRowChance: 0.55,
    shelterbeltColumnChance: 0.40,
    shelterbeltSpacingM: 110,
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
    roadSegmentM: 130,
    roadRowChance: 0.28,
    roadColumnChance: 0.22,
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
    buildingColors: Object.freeze([0xc9b89a, 0xd8ccb0, 0xaeb4a6, 0xd0c0aa]),
    roofColor: 0x7a4a3c,
    // Quiet weathered roofs — readable at low AGL without tourist kitsch.
    roofColors: Object.freeze([0x8a4e3c, 0x5a6468, 0x725848, 0x6a5850]),
    fieldColor: 0x6a8a48,
    // Soft meadow / scrub scars — not ripe wheat parcels.
    fieldColors: Object.freeze([0x8fa866, 0x78955d, 0xa3ad72, 0xaaa06a, 0x6f9258]),
    fieldRowColor: 0x5a6840,
    // The close rewild layer is not a terrain texture. Deterministic clumps give the low-level
    // aircraft real parallax and let one authoritative wind field visibly travel across the land.
    grassPatchDensityPerKm2: 180,
    grassPatchLimitScale: 1,
    grassHeightM: [0.45, 1.15],
    grassRadiusM: [4, 9],
    localGrassRadiusM: 270,
    localGrassSnapM: 42,
    localGrassUpdatesPerFrame: 160,
    localGrassMaximumCameraAltitudeM: 1_800,
    grassColors: Object.freeze([0xc8dc7d, 0xaccb68, 0xdbe48e, 0x92b85a, 0xe4d795]),
    roadColor: 0x5c5a56,
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

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashString(value) {
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

function mixedUint32(value) {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function seededUnit(seed, salt) {
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

function fraction(value) {
  return value - Math.floor(value);
}

function surfaceSample(decoded, east01, north01, spanEastM, spanNorthM) {
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

  const addTree = (surface, variation) => {
    trees.push({
      ...surface,
      yaw: variation * Math.PI * 2,
      heightM: profile.treeHeightM[0]
        + (profile.treeHeightM[1] - profile.treeHeightM[0]) * fraction(variation * 3.731),
      widthScale: 0.72 + fraction(variation * 7.123) * 0.62,
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
      addTree(surface, variation);
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
    addTree(surface, random());
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

  const fieldRows = fieldRowSegments(fields, profile, quality.fieldRowLimit);

  return Object.freeze({
    era: profile.id,
    period: profile.period,
    ring,
    seed: seed >>> 0,
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

function setMatrix(THREE, mesh, index, position, quaternion, scale, matrix) {
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function setPaletteColor(array, index, color) {
  const offset = index * 3;
  array[offset] = color.r;
  array[offset + 1] = color.g;
  array[offset + 2] = color.b;
}

function setSegmentMatrix(mesh, index, segment, widthM, heightM, yOffsetM, work) {
  work.start.set(segment.fromX, segment.fromY, segment.fromZ);
  work.end.set(segment.toX, segment.toY, segment.toZ);
  work.direction.subVectors(work.end, work.start);
  const lengthM = work.direction.length();
  if (!lengthM) return;
  work.position.addVectors(work.start, work.end).multiplyScalar(0.5);
  work.position.y += yOffsetM;
  work.quaternion.setFromUnitVectors(work.segmentAxis, work.direction.normalize());
  work.scale.set(widthM, heightM, lengthM);
  work.matrix.compose(work.position, work.quaternion, work.scale);
  mesh.setMatrixAt(index, work.matrix);
}

function addSegmentMesh(THREE, group, geometry, material, name, segments, options, work) {
  if (!segments.length) return null;
  const multiplier = options.multiplier ?? 1;
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length * multiplier);
  mesh.name = name;
  let outputIndex = 0;
  for (const segment of segments) {
    if (options.pairedOffsetM) {
      const deltaX = segment.toX - segment.fromX;
      const deltaZ = segment.toZ - segment.fromZ;
      const horizontalLengthM = Math.max(0.001, Math.hypot(deltaX, deltaZ));
      const offsetX = -deltaZ / horizontalLengthM * options.pairedOffsetM;
      const offsetZ = deltaX / horizontalLengthM * options.pairedOffsetM;
      for (const side of [-1, 1]) {
        setSegmentMatrix(mesh, outputIndex++, {
          ...segment,
          fromX: segment.fromX + offsetX * side,
          fromZ: segment.fromZ + offsetZ * side,
          toX: segment.toX + offsetX * side,
          toZ: segment.toZ + offsetZ * side,
        }, options.widthM ?? segment.widthM, options.heightM, options.yOffsetM, work);
      }
    } else {
      setSegmentMatrix(
        mesh, outputIndex++, segment, options.widthM ?? segment.widthM,
        options.heightM, options.yOffsetM, work,
      );
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

function assignInstancedChunkBounds(THREE, group, chunk, decoded, level, profile) {
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = chunk.boundsLocalM;
  const record = chunk.lods?.[level];
  const fallbackHeightM = finite(decoded.heights?.[0]);
  const minimumHeightM = finite(record?.minimumHeightM, fallbackHeightM);
  const maximumHeightM = finite(record?.maximumHeightM, fallbackHeightM);
  const objectHeightM = Math.max(
    profile.treeHeightM?.[1] ?? 0,
    profile.buildingHeightM?.[1] ?? 0,
    profile.powerPoleHeightM?.[1] ?? 0,
  ) * 1.5;
  const horizontalMarginM = Math.max(
    (profile.treeHeightM?.[1] ?? 0) * 1.5,
    profile.buildingWidthM?.[1] ?? 0,
    profile.buildingDepthM?.[1] ?? 0,
    (profile.fieldWidthM?.[1] ?? 0) * 0.5,
    (profile.fieldDepthM?.[1] ?? 0) * 0.5,
    profile.runwayWidthM?.[1] ?? 0,
    profile.grassRadiusM?.[1] ?? 0,
  );
  const bottomM = minimumHeightM - 2;
  const topM = maximumHeightM + objectHeightM;
  const centreY = (bottomM + topM) * 0.5;
  const radiusM = Math.hypot(
    (maximumEast - minimumEast) * 0.5 + horizontalMarginM,
    (maximumNorth - minimumNorth) * 0.5 + horizontalMarginM,
    (topM - bottomM) * 0.5,
  );
  const bounds = new THREE.Sphere(new THREE.Vector3(0, centreY, 0), radiusM);
  // Three otherwise derives an InstancedMesh sphere by walking every instance on first render.
  // The tile footprint is already authoritative, so install one conservative bound while the
  // scheduled tile build is in hand and avoid that hidden first-visible-frame scan.
  group.traverse((child) => {
    if (child.isInstancedMesh) child.boundingSphere = bounds.clone();
  });
}

// Budget one deterministic world cell per visible instance slot across the complete camera disc.
// Adjacent terrain chunks partition the same cells, so crossing a chunk boundary cannot multiply
// the global meadow density. Minor lattice-count variation is clamped by the fixed GPU capacity.
const LOCAL_GRASS_CANDIDATES_PER_SLOT = 1;

function localGrassCandidate(profile, cellEast, cellNorth, cellSizeM) {
  const key = `${cellEast}:${cellNorth}`;
  const seed = mixedUint32(
    (profile.seedSalt ?? hashString(profile.id))
      ^ Math.imul(cellEast, 0x9e3779b1)
      ^ Math.imul(cellNorth, 0x85ebca77),
  );
  return {
    key,
    eastM: (cellEast + 0.1 + seededUnit(seed, 0xa511e9b3) * 0.8) * cellSizeM,
    northM: (cellNorth + 0.1 + seededUnit(seed, 0x63d83595) * 0.8) * cellSizeM,
    priority: seededUnit(seed, 0xc2b2ae35),
    variation: seededUnit(seed, 0x27d4eb2f),
  };
}

function writeLocalGrassMatrix(THREE, controller, placement, slot, work) {
  work.quaternion.setFromAxisAngle(work.yAxis, placement.yaw);
  work.position.set(placement.x, placement.y, placement.z);
  work.scale.set(placement.scaleX, placement.scaleY, placement.scaleZ);
  setMatrix(THREE, controller.mesh, slot, work.position, work.quaternion, work.scale,
    work.matrix);
}

function removeLocalGrassPlacement(THREE, controller, key, work) {
  const placement = controller.placements.get(key);
  if (!placement) return false;
  const removedSlot = placement.slot;
  const lastSlot = controller.slots.length - 1;
  const lastKey = controller.slots[lastSlot];
  controller.placements.delete(key);
  controller.slots.pop();
  if (removedSlot !== lastSlot) {
    const lastPlacement = controller.placements.get(lastKey);
    controller.slots[removedSlot] = lastKey;
    lastPlacement.slot = removedSlot;
    writeLocalGrassMatrix(THREE, controller, lastPlacement, removedSlot, work);
  }
  return true;
}

function updateCameraGrassController(
  THREE,
  controller,
  frame,
  profile,
  work,
  ensureMesh,
  updateBudget,
) {
  const camera = frame.cameraPosition;
  if (!camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.z)) return;
  const maximumAltitudeM = profile.localGrassMaximumCameraAltitudeM ?? 1_800;
  if (finite(camera.y) > maximumAltitudeM) {
    if (controller.mesh) controller.mesh.visible = false;
    return;
  }
  const cameraEastM = camera.x - finite(frame.placementEastM);
  const cameraNorthM = -camera.z - finite(frame.placementNorthM);
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] =
    controller.chunk.boundsLocalM;
  const deltaEastM = cameraEastM < minimumEast ? minimumEast - cameraEastM
    : cameraEastM > maximumEast ? cameraEastM - maximumEast : 0;
  const deltaNorthM = cameraNorthM < minimumNorth ? minimumNorth - cameraNorthM
    : cameraNorthM > maximumNorth ? cameraNorthM - maximumNorth : 0;
  const radiusM = profile.localGrassRadiusM ?? 270;
  if (Math.hypot(deltaEastM, deltaNorthM) > radiusM) {
    if (controller.mesh) controller.mesh.visible = false;
    return;
  }

  // The budget is shared across all nearby terrain tiles. Do not make later tiles allocate a
  // 960-slot mesh and enumerate/sort their whole candidate disc after an earlier tile has consumed
  // this frame's allowance; they will initialise on the next frame instead.
  if (updateBudget.remaining <= 0) return;
  if (!controller.mesh) ensureMesh(controller);
  controller.mesh.visible = true;
  const snapM = Math.max(8, profile.localGrassSnapM ?? 42);
  const snappedEastM = Math.round(cameraEastM / snapM) * snapM;
  const snappedNorthM = Math.round(cameraNorthM / snapM) * snapM;
  const cellKey = `${snappedEastM}:${snappedNorthM}`;
  const spanEastM = maximumEast - minimumEast;
  const spanNorthM = maximumNorth - minimumNorth;
  const [minimumHeightM, maximumHeightM] = profile.grassHeightM ?? [0.5, 1];
  const [minimumRadiusM, maximumRadiusM] = profile.grassRadiusM ?? [1, 2];
  const maximumSlope = Math.max(0.18, profile.maximumTreeSlope * 0.86);
  const radiusSquaredM = radiusM * radiusM;

  if (cellKey !== controller.cellKey) {
    controller.cellKey = cellKey;
    controller.pendingRemovals = [];
    for (const [key, placement] of controller.placements) {
      const deltaEast = placement.eastM - snappedEastM;
      const deltaNorth = placement.northM - snappedNorthM;
      if (deltaEast * deltaEast + deltaNorth * deltaNorth > radiusSquaredM) {
        controller.pendingRemovals.push(key);
      }
    }
    controller.pendingRemovalIndex = 0;

    const candidates = [];
    const cellSizeM = controller.candidateCellSizeM;
    const minimumCellEast = Math.floor((snappedEastM - radiusM) / cellSizeM);
    const maximumCellEast = Math.floor((snappedEastM + radiusM) / cellSizeM);
    const minimumCellNorth = Math.floor((snappedNorthM - radiusM) / cellSizeM);
    const maximumCellNorth = Math.floor((snappedNorthM + radiusM) / cellSizeM);
    for (let cellNorth = minimumCellNorth; cellNorth <= maximumCellNorth; cellNorth++) {
      for (let cellEast = minimumCellEast; cellEast <= maximumCellEast; cellEast++) {
        const candidate = localGrassCandidate(profile, cellEast, cellNorth, cellSizeM);
        if (controller.placements.has(candidate.key)) continue;
        const deltaEast = candidate.eastM - snappedEastM;
        const deltaNorth = candidate.northM - snappedNorthM;
        if (deltaEast * deltaEast + deltaNorth * deltaNorth > radiusSquaredM) continue;
        if (candidate.eastM < minimumEast || candidate.eastM > maximumEast
          || candidate.northM < minimumNorth || candidate.northM > maximumNorth) continue;
        candidates.push(candidate);
      }
    }
    candidates.sort((left, right) =>
      left.priority - right.priority || left.key.localeCompare(right.key));
    controller.pendingCandidates = candidates;
    controller.pendingCandidateIndex = 0;
  }

  let changed = false;
  while (updateBudget.remaining > 0
    && controller.pendingRemovalIndex < controller.pendingRemovals.length) {
    const key = controller.pendingRemovals[controller.pendingRemovalIndex++];
    changed = removeLocalGrassPlacement(THREE, controller, key, work) || changed;
    updateBudget.remaining--;
  }
  while (updateBudget.remaining > 0
    && controller.pendingCandidateIndex < controller.pendingCandidates.length) {
    if (controller.placements.size >= controller.capacity) {
      controller.pendingCandidateIndex = controller.pendingCandidates.length;
      break;
    }
    const candidate = controller.pendingCandidates[controller.pendingCandidateIndex++];
    updateBudget.remaining--;
    if (controller.placements.has(candidate.key)) continue;
    const surface = surfaceSample(
      controller.decoded,
      (candidate.eastM - minimumEast) / spanEastM,
      (candidate.northM - minimumNorth) / spanNorthM,
      spanEastM,
      spanNorthM,
    );
    if (!surface || surface.slope > maximumSlope) continue;
    const variation = candidate.variation;
    const placement = {
      eastM: candidate.eastM,
      northM: candidate.northM,
      x: surface.x,
      y: surface.y + 0.025,
      z: surface.z,
      yaw: variation * Math.PI * 2,
      scaleX: minimumRadiusM
        + (maximumRadiusM - minimumRadiusM) * fraction(variation * 5.731),
      scaleY: minimumHeightM
        + (maximumHeightM - minimumHeightM) * fraction(variation * 9.173),
      scaleZ: minimumRadiusM
        + (maximumRadiusM - minimumRadiusM) * fraction(variation * 7.113),
      slot: controller.slots.length,
    };
    controller.placements.set(candidate.key, placement);
    controller.slots.push(candidate.key);
    writeLocalGrassMatrix(THREE, controller, placement, placement.slot, work);
    changed = true;
  }
  controller.mesh.count = controller.slots.length;
  if (changed) controller.mesh.instanceMatrix.needsUpdate = true;
}

function mergeLayout(baseGeometry, layout, transform) {
  const parts = layout.map((item) => {
    const part = baseGeometry.clone();
    transform(part, item);
    return part;
  });
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Failed to create shared Korea scenery geometry.");
  merged.computeBoundingSphere();
  return merged;
}

function createTreeStandGeometry(crownPrimitive, trunkPrimitive, layout = TREE_STAND_LAYOUT) {
  const crowns = mergeLayout(crownPrimitive, layout, (geometry, tree) => {
    geometry.scale(tree.radius, tree.height, tree.radius);
    geometry.translate(tree.x, 0, tree.z);
  });
  const trunks = mergeLayout(trunkPrimitive, layout, (geometry, tree) => {
    const trunkRadius = 0.172 * tree.radius;
    geometry.scale(trunkRadius, tree.height * 0.48, trunkRadius);
    geometry.translate(tree.x, 0, tree.z);
  });
  return { crowns, trunks };
}

function createBuildingCompoundGeometry(buildingPrimitive) {
  return mergeLayout(buildingPrimitive, BUILDING_COMPOUND_LAYOUT, (geometry, building) => {
    geometry.scale(building.width, building.height, building.depth);
    geometry.translate(building.x, 0, building.z);
  });
}

function createSoftWorldGrassGeometry(THREE) {
  const positions = [];
  const indices = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let blade = 0; blade < SOFT_WORLD_GRASS_BLADES_PER_PATCH; blade++) {
    const fraction = (blade + 0.5) / SOFT_WORLD_GRASS_BLADES_PER_PATCH;
    const angle = blade * goldenAngle;
    const centreRadius = Math.sqrt(fraction) * 0.82;
    const centreX = Math.cos(angle) * centreRadius;
    const centreZ = Math.sin(angle) * centreRadius;
    const facing = angle * 1.83 + 0.37;
    const tangentX = Math.cos(facing);
    const tangentZ = Math.sin(facing);
    const width = 0.028 + (blade % 4) * 0.008;
    const height = 0.68 + (blade % 5) * 0.075;
    const shoulderHeight = height * 0.72;
    const shoulderWidth = width * 0.58;
    const base = positions.length / 3;
    positions.push(
      centreX - tangentX * width, 0, centreZ - tangentZ * width,
      centreX + tangentX * width, 0, centreZ + tangentZ * width,
      centreX - tangentX * shoulderWidth, shoulderHeight,
      centreZ - tangentZ * shoulderWidth,
      centreX + tangentX * shoulderWidth, shoulderHeight,
      centreZ + tangentZ * shoulderWidth,
      centreX, height, centreZ,
    );
    indices.push(
      base, base + 1, base + 2,
      base + 1, base + 3, base + 2,
      base + 2, base + 3, base + 4,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSoftWorldGrassMaterial(THREE, uniforms) {
  // Near grass is small enough that Lambert's dark back-facing response aliases into black
  // needles. A palette-lit basic material is both cheaper and closer to painted-cel foreground
  // colour; terrain fog and the shared wind shader still integrate it with the scene.
  const material = new THREE.MeshBasicMaterial({
    color: 0xa4bf5e,
    side: THREE.DoubleSide,
  });
  material.name = "SOFT_WORLD_WIND_GRASS";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSoftWorldTime = uniforms.time;
    shader.uniforms.uSoftWorldWind = uniforms.wind;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSoftWorldTime;
        uniform vec2 uSoftWorldWind;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        float grassTip = clamp(position.y / 1.05, 0.0, 1.0);
        float windSpeed = min(length(uSoftWorldWind), 26.0);
        vec2 windDirection = windSpeed > 0.01 ? normalize(uSoftWorldWind) : vec2(0.0);
        mat4 softWorldMatrix = modelMatrix;
        #ifdef USE_INSTANCING
          softWorldMatrix = modelMatrix * instanceMatrix;
        #endif
        vec3 grassOrigin = (softWorldMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float travellingWave = 0.55 + 0.45 * sin(
          dot(grassOrigin.xz, windDirection * 0.038)
          - uSoftWorldTime * (1.0 + windSpeed * 0.075)
        );
        vec2 crossWindDirection = vec2(-windDirection.y, windDirection.x);
        float fineSway = 0.72 + 0.28 * sin(
          dot(grassOrigin.xz, crossWindDirection * 0.08) + uSoftWorldTime * 1.37
        );
        float bend = grassTip * grassTip
          * (windSpeed * 0.012)
          * travellingWave * fineSway;
        vec2 softWorldOffset = windDirection * bend;
        float softWorldDeterminant = softWorldMatrix[0][0] * softWorldMatrix[2][2]
          - softWorldMatrix[2][0] * softWorldMatrix[0][2];
        if (abs(softWorldDeterminant) > 0.000001) {
          transformed.xz += vec2(
            softWorldMatrix[2][2] * softWorldOffset.x
              - softWorldMatrix[2][0] * softWorldOffset.y,
            -softWorldMatrix[0][2] * softWorldOffset.x
              + softWorldMatrix[0][0] * softWorldOffset.y
          ) / softWorldDeterminant;
        }`,
      );
  };
  material.customProgramCacheKey = () => "soft-world-wind-grass-v2";
  return material;
}

function addSoftWorldCanopyWind(material, uniforms) {
  material.name = "SOFT_WORLD_WIND_CANOPY";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSoftWorldTime = uniforms.time;
    shader.uniforms.uSoftWorldWind = uniforms.wind;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSoftWorldTime;
        uniform vec2 uSoftWorldWind;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        float windSpeed = min(length(uSoftWorldWind), 26.0);
        vec2 windDirection = windSpeed > 0.01 ? normalize(uSoftWorldWind) : vec2(0.0);
        mat4 softWorldMatrix = modelMatrix;
        #ifdef USE_INSTANCING
          softWorldMatrix = modelMatrix * instanceMatrix;
        #endif
        vec3 canopyOrigin = (softWorldMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float travellingWave = 0.65 + 0.35 * sin(
          dot(canopyOrigin.xz, windDirection * 0.009)
          - uSoftWorldTime * (0.32 + windSpeed * 0.026)
        );
        float canopyWeight = smoothstep(0.18, 1.45, position.y);
        float bend = canopyWeight * (windSpeed * 0.0045) * travellingWave;
        vec2 softWorldOffset = windDirection * bend;
        float softWorldDeterminant = softWorldMatrix[0][0] * softWorldMatrix[2][2]
          - softWorldMatrix[2][0] * softWorldMatrix[0][2];
        if (abs(softWorldDeterminant) > 0.000001) {
          transformed.xz += vec2(
            softWorldMatrix[2][2] * softWorldOffset.x
              - softWorldMatrix[2][0] * softWorldOffset.y,
            -softWorldMatrix[0][2] * softWorldOffset.x
              + softWorldMatrix[0][0] * softWorldOffset.y
          ) / softWorldDeterminant;
        }`,
      );
  };
  material.customProgramCacheKey = () => "soft-world-wind-canopy-v2";
  return material;
}

export function disposeKoreaSceneryTile(group) {
  if (!group) return;
  group.userData.sceneryDisposed = true;
  group.traverse((child) => {
    if (child.isInstancedMesh) child.dispose();
  });
  group.removeFromParent();
}

export function createKoreaSceneryRuntime(THREE, options = {}) {
  const era = options.era ?? "1950s";
  const profile = KOREA_SCENERY_PROFILES[era];
  if (!profile) throw new TypeError(`Unknown Korea scenery era: ${era}.`);
  const qualityTier = options.qualityTier ?? "balanced";
  const quality = QUALITY[qualityTier] ?? QUALITY.balanced;
  // Mobile and balanced terrain deliberately floor at LOD1 to cap heightfield cost. Restricting
  // scenery to literal LOD0 therefore made every building, tree and road disappear on those tiers.
  // Permit their nearest selectable LOD while still avoiding duplicate dressing on farther rings.
  // Desktop owns a real LOD0 close ring, so all procedural objects stop there. Weak tiers floor
  // terrain at LOD1 and retain their reduced scenery grammar because LOD0 is never selectable.
  // Distant Ukraine structure comes from terrain colour/parcel shaping rather than sphere stands.
  const maximumSceneryLevel = qualityTier === "desktop" ? 0 : 1;
  const softCanopy = profile.crownShape === "soft-canopy";
  // Ukraine soft-world: rounded canopy ellipsoids. Korea eras keep the cheap faceted cone stands.
  // Mid-ring soft canopies use a lower-tessellation sphere so vertex count is strictly cheaper.
  const crownPrimitive = softCanopy
    ? (() => {
      // A 7×5 smooth ellipsoid reads as an intentionally chunky painted canopy at low AGL while
      // cutting 38% of the former 9×6 crown triangles. Shape design, not sphere tessellation,
      // carries the seven-lobe stand silhouette.
      const geometry = new THREE.SphereGeometry(1, 7, 5);
      geometry.scale(1.05, 0.78, 1.05);
      geometry.translate(0, 0.78, 0);
      return geometry;
    })()
    : (() => {
      const geometry = new THREE.ConeGeometry(1, 1, 7, 1);
      geometry.translate(0, 0.5, 0);
      return geometry;
    })();
  const midCrownPrimitive = softCanopy
    ? (() => {
      const geometry = new THREE.SphereGeometry(1, 6, 4);
      geometry.scale(1.05, 0.78, 1.05);
      geometry.translate(0, 0.78, 0);
      return geometry;
    })()
    : crownPrimitive.clone();
  const trunkPrimitive = new THREE.CylinderGeometry(
    softCanopy ? 0.09 : 0.12,
    softCanopy ? 0.14 : 0.18,
    1,
    softCanopy ? 6 : 5,
    1,
  );
  trunkPrimitive.translate(0, 0.5, 0);
  const midTrunkPrimitive = softCanopy
    ? (() => {
      const geometry = new THREE.CylinderGeometry(0.09, 0.14, 1, 5, 1);
      geometry.translate(0, 0.5, 0);
      return geometry;
    })()
    : trunkPrimitive.clone();
  const treeStandGeometry = createTreeStandGeometry(crownPrimitive, trunkPrimitive);
  const midTreeStandGeometry = createTreeStandGeometry(
    midCrownPrimitive, midTrunkPrimitive, UKRAINE_MID_RING_STAND_LAYOUT,
  );
  const crownGeometry = treeStandGeometry.crowns;
  const trunkGeometry = treeStandGeometry.trunks;
  const midCrownGeometry = midTreeStandGeometry.crowns;
  const midTrunkGeometry = midTreeStandGeometry.trunks;
  crownPrimitive.dispose();
  trunkPrimitive.dispose();
  if (midCrownPrimitive !== crownPrimitive) midCrownPrimitive.dispose();
  if (midTrunkPrimitive !== trunkPrimitive) midTrunkPrimitive.dispose();
  const buildingPrimitive = new THREE.BoxGeometry(1, 1, 1);
  buildingPrimitive.translate(0, 0.5, 0);
  const buildingGeometry = createBuildingCompoundGeometry(buildingPrimitive);
  buildingPrimitive.dispose();
  const roofGeometry = new THREE.ConeGeometry(0.72, 1, 4, 1);
  roofGeometry.rotateY(Math.PI * 0.25);
  roofGeometry.translate(0, 0.5, 0);
  const surfaceGeometry = new THREE.BoxGeometry(1, 1, 1);
  const segmentGeometry = new THREE.BoxGeometry(1, 1, 1);
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.13, 1, 6, 1);
  poleGeometry.translate(0, 0.5, 0);
  const grassGeometry = profile.grassPatchDensityPerKm2 > 0
    ? createSoftWorldGrassGeometry(THREE)
    : null;
  const grassUniforms = {
    time: { value: 0 },
    wind: { value: new THREE.Vector2(0, 0) },
  };
  const toonGradient = !profile.softLit && profile.toonSteps
    ? new THREE.DataTexture(
      Uint8Array.from(profile.toonSteps),
      profile.toonSteps.length,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    )
    : null;
  if (toonGradient) {
    toonGradient.minFilter = THREE.NearestFilter;
    toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.generateMipmaps = false;
    toonGradient.colorSpace = THREE.NoColorSpace;
    toonGradient.needsUpdate = true;
  }
  // A restrained material-local sky fill keeps sub-pixel procedural instances legible even if a
  // diagnostic scene momentarily stages them before its production lights. It is not a glow: the
  // shipped hemisphere and sun still provide nearly all of the final Lambert response.
  const softLit = profile.softLit === true;
  const litMaterial = (color, emissive = color) => toonGradient
    ? new THREE.MeshToonMaterial({
      color,
      emissive,
      emissiveIntensity: 0.1,
      gradientMap: toonGradient,
    })
    : new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity: softLit ? 0.16 : 0.14,
    });
  // Two of these layers are coplanar with their own parent slab BY CONSTRUCTION, not by terrain
  // accident: field rows take their Y from the same `field.y` mean the field slab uses, and road
  // markings reuse the road segment's own endpoints. Both end up 7.5 mm above the top face of the
  // slab they decorate, on every terrain, forever.
  //
  // 7.5 mm does not survive this depth buffer. With near = 0.06 and far = 680000 (app.js), a
  // 24-bit depth buffer resolves z² · (1/n - 1/f) / 2²⁴ — 8.9 cm at 300 m, 25 cm at 500 m, 99 cm
  // at 1 km. So past roughly 90 m the marking and its road are inside one depth LSB of each other,
  // the per-pixel comparison flips with sub-LSB phase as the aircraft moves, and the pair shimmers.
  //
  // Assert the stacking order in depth-bias units instead, which is fixed-function raster state
  // and costs no fill. Same fix, same reason, as depthBiasDeckMaterial in scene_builders.js
  // ("near-coplanar deck layers lost depth precision and shimmered on approach").
  //
  // Deliberately NOT applied to the field/road/runway/rail slabs themselves. Those sit at the mean
  // of a 5-sample footprint that tolerates 13-21 m of relief, so their separation from the terrain
  // is metres of genuine intersection, not a precision problem — biasing them toward the eye would
  // punch buried slabs out through hillsides.
  const decalOf = (material, order) => {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;   // slope-scaled: these are grazing-angle surfaces
    material.polygonOffsetUnits = -order;
    return material;
  };
  const crownMaterial = litMaterial(0xffffff, profile.crownColor);
  const trunkMaterial = litMaterial(profile.trunkColor);
  const buildingMaterial = litMaterial(0xffffff, profile.buildingColor);
  const roofMaterial = litMaterial(0xffffff, profile.roofColor);
  const fieldMaterial = litMaterial(0xffffff, profile.fieldColor);
  const fieldRowMaterial = decalOf(litMaterial(profile.fieldRowColor), 1);
  const roadMaterial = litMaterial(profile.roadColor);
  const roadMarkingMaterial = profile.roadMarkingColor === null ? null
    : decalOf(new THREE.MeshBasicMaterial({ color: profile.roadMarkingColor }), 1);
  const railBedMaterial = litMaterial(profile.railBedColor);
  const railMaterial = litMaterial(profile.railColor);
  const runwayMaterial = litMaterial(profile.runwayColor);
  const powerPoleMaterial = litMaterial(profile.powerPoleColor);
  const powerWireMaterial = new THREE.MeshBasicMaterial({ color: profile.powerWireColor });
  const grassMaterial = grassGeometry ? createSoftWorldGrassMaterial(THREE, grassUniforms) : null;
  if (softCanopy) addSoftWorldCanopyWind(crownMaterial, grassUniforms);
  const crownPalette = profile.crownColors.map((color) => new THREE.Color(color));
  const buildingPalette = profile.buildingColors.map((color) => new THREE.Color(color));
  const roofPalette = profile.roofColors.map((color) => new THREE.Color(color));
  const fieldPalette = profile.fieldColors.map((color) => new THREE.Color(color));
  const geometries = [
    crownGeometry, trunkGeometry, midCrownGeometry, midTrunkGeometry,
    buildingGeometry, roofGeometry,
    surfaceGeometry, segmentGeometry, poleGeometry, grassGeometry,
  ].filter(Boolean);
  const materials = [
    crownMaterial, trunkMaterial, buildingMaterial, roofMaterial, fieldMaterial, fieldRowMaterial,
    roadMaterial, roadMarkingMaterial, railBedMaterial, railMaterial, runwayMaterial,
    powerPoleMaterial, powerWireMaterial, grassMaterial,
  ].filter(Boolean);
  const grassControllers = new Set();
  const grassWork = {
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    yAxis: new THREE.Vector3(0, 1, 0),
  };
  let disposed = false;

  const ensureGrassMesh = (controller) => {
    if (controller.mesh || !grassGeometry || !grassMaterial) return controller.mesh;
    const grass = new THREE.InstancedMesh(
      grassGeometry, grassMaterial, controller.capacity,
    );
    grass.name = "PROCEDURAL_SOFT_WORLD_GRASS";
    grass.frustumCulled = true;
    grass.count = 0;
    controller.mesh = grass;
    controller.group.add(grass);
    assignInstancedChunkBounds(
      THREE,
      controller.group,
      controller.chunk,
      controller.decoded,
      controller.level,
      profile,
    );
    return grass;
  };

  return Object.freeze({
    era,
    disposeTile: disposeKoreaSceneryTile,
    update({ elapsedSeconds, windX, windZ, cameraPosition,
      placementEastM, placementNorthM } = {}) {
      if (disposed || !grassMaterial) return;
      if (Number.isFinite(elapsedSeconds)) grassUniforms.time.value = elapsedSeconds;
      if (Number.isFinite(windX)) grassUniforms.wind.value.x = windX;
      if (Number.isFinite(windZ)) grassUniforms.wind.value.y = windZ;
      const updateBudget = {
        remaining: Math.max(1, Math.round(profile.localGrassUpdatesPerFrame ?? 160)),
      };
      for (const controller of grassControllers) {
        if (controller.group.userData.sceneryDisposed) {
          grassControllers.delete(controller);
          continue;
        }
        updateCameraGrassController(
          THREE,
          controller,
          { cameraPosition, placementEastM, placementNorthM },
          profile,
          grassWork,
          ensureGrassMesh,
          updateBudget,
        );
      }
    },
    createTile(chunk, decoded, level = 0) {
      if (disposed || level < 0 || level > maximumSceneryLevel) return null;
      const ring = level >= 1 ? "mid" : "near";
      const reducedMidRing = ring === "mid" && profile.theatre === "ukraine";
      const standSize = reducedMidRing ? UKRAINE_MID_RING_STAND_SIZE : KOREA_TREE_STAND_SIZE;
      const activeCrownGeometry = reducedMidRing ? midCrownGeometry : crownGeometry;
      const activeTrunkGeometry = reducedMidRing ? midTrunkGeometry : trunkGeometry;
      const plan = planKoreaScenery(chunk, decoded, { era, qualityTier, ring });
      const grassPatchCapacity = ring === "near" && grassGeometry
        && plan.grassPatchCapacity > 0
        ? Math.round(quality.grassPatchLimit * (profile.grassPatchLimitScale ?? 0))
        : 0;
      if (!plan.trees.length && !plan.buildings.length && !plan.fields.length
        && !grassPatchCapacity
        && !plan.roads.length && !plan.railSegments.length && !plan.runways.length
        && !plan.powerPoles.length) return null;
      const group = new THREE.Group();
      group.name = `SCENERY_${era.toUpperCase()}_${chunk.id.toUpperCase()}`;
      let grassController = null;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const segmentWork = {
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        position,
        quaternion,
        scale,
        matrix,
        segmentAxis: new THREE.Vector3(0, 0, 1),
      };
      if (plan.trees.length) {
        const crowns = new THREE.InstancedMesh(
          activeCrownGeometry, crownMaterial, plan.trees.length,
        );
        const trunks = new THREE.InstancedMesh(
          activeTrunkGeometry, trunkMaterial, plan.trees.length,
        );
        const crownColors = new Float32Array(plan.trees.length * 3);
        crowns.name = "PROCEDURAL_TREE_CROWNS";
        trunks.name = "PROCEDURAL_TREE_TRUNKS";
        for (let index = 0; index < plan.trees.length; index++) {
          const tree = plan.trees[index];
          quaternion.setFromAxisAngle(yAxis, tree.yaw);
          position.set(tree.x, tree.y, tree.z);
          scale.set(
            tree.heightM * (softCanopy ? 0.42 : 0.32) * tree.widthScale,
            tree.heightM * (softCanopy ? 0.92 : 1),
            tree.heightM * (softCanopy ? 0.42 : 0.32),
          );
          setMatrix(THREE, crowns, index, position, quaternion, scale, matrix);
          setPaletteColor(crownColors, index, crownPalette[tree.crownVariant]);
        }
        // Compound crowns and trunks use the exact same stand transform. Copying the finished
        // matrix buffer avoids recomposing all 900 desktop transforms a second time.
        trunks.instanceMatrix.array.set(crowns.instanceMatrix.array);
        crowns.instanceColor = new THREE.InstancedBufferAttribute(crownColors, 3);
        crowns.instanceMatrix.needsUpdate = true;
        trunks.instanceMatrix.needsUpdate = true;
        crowns.instanceColor.needsUpdate = true;
        group.add(crowns, trunks);
      }
      if (plan.buildings.length) {
        const buildings = new THREE.InstancedMesh(
          buildingGeometry, buildingMaterial, plan.buildings.length,
        );
        const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, plan.buildings.length);
        const buildingColors = new Float32Array(plan.buildings.length * 3);
        const roofColors = new Float32Array(plan.buildings.length * 3);
        buildings.name = `PROCEDURAL_${era.toUpperCase()}_BUILDINGS`;
        roofs.name = `PROCEDURAL_${era.toUpperCase()}_ROOFS`;
        for (let index = 0; index < plan.buildings.length; index++) {
          const building = plan.buildings[index];
          quaternion.setFromAxisAngle(yAxis, building.yaw);
          position.set(building.x, building.y, building.z);
          scale.set(building.widthM, building.heightM, building.depthM);
          setMatrix(THREE, buildings, index, position, quaternion, scale, matrix);
          setPaletteColor(buildingColors, index, buildingPalette[building.colorVariant]);
          setPaletteColor(roofColors, index,
            roofPalette[building.colorVariant % roofPalette.length]);
          position.y += building.heightM;
          scale.set(
            building.widthM,
            Math.min(building.widthM, building.depthM) * (building.highRise ? 0.16 : 0.28),
            building.depthM,
          );
          setMatrix(THREE, roofs, index, position, quaternion, scale, matrix);
        }
        buildings.instanceColor = new THREE.InstancedBufferAttribute(buildingColors, 3);
        roofs.instanceColor = new THREE.InstancedBufferAttribute(roofColors, 3);
        buildings.instanceMatrix.needsUpdate = true;
        buildings.instanceColor.needsUpdate = true;
        roofs.instanceMatrix.needsUpdate = true;
        roofs.instanceColor.needsUpdate = true;
        group.add(buildings, roofs);
      }
      if (plan.fields.length) {
        const fields = new THREE.InstancedMesh(surfaceGeometry, fieldMaterial, plan.fields.length);
        const fieldColors = new Float32Array(plan.fields.length * 3);
        fields.name = `PROCEDURAL_${era.toUpperCase()}_LAND_USE`;
        for (let index = 0; index < plan.fields.length; index++) {
          const field = plan.fields[index];
          quaternion.setFromAxisAngle(yAxis, field.yaw);
          position.set(field.x, field.y + 0.035, field.z);
          scale.set(field.widthM, 0.07, field.depthM);
          setMatrix(THREE, fields, index, position, quaternion, scale, matrix);
          setPaletteColor(fieldColors, index, fieldPalette[field.colorVariant]);
        }
        fields.instanceColor = new THREE.InstancedBufferAttribute(fieldColors, 3);
        fields.instanceMatrix.needsUpdate = true;
        fields.instanceColor.needsUpdate = true;
        group.add(fields);
      }
      if (grassGeometry && grassMaterial && grassPatchCapacity) {
        const localGrassRadiusM = profile.localGrassRadiusM ?? 270;
        const candidateCellSizeM = Math.sqrt(
          Math.PI * localGrassRadiusM * localGrassRadiusM
            / (grassPatchCapacity * LOCAL_GRASS_CANDIDATES_PER_SLOT),
        );
        grassController = {
          group,
          mesh: null,
          chunk,
          decoded,
          level,
          capacity: grassPatchCapacity,
          candidateCellSizeM,
          placements: new Map(),
          slots: [],
          cellKey: null,
          pendingRemovals: [],
          pendingRemovalIndex: 0,
          pendingCandidates: [],
          pendingCandidateIndex: 0,
        };
        grassControllers.add(grassController);
      }
      addSegmentMesh(
        THREE, group, segmentGeometry, fieldRowMaterial, "PROCEDURAL_FIELD_ROWS",
        plan.fieldRows, { heightM: 0.025, yOffsetM: 0.09 }, segmentWork,
      );
      addSegmentMesh(
        THREE, group, segmentGeometry, roadMaterial, `PROCEDURAL_${era.toUpperCase()}_ROADS`,
        plan.roads, { heightM: 0.12, yOffsetM: 0.085 }, segmentWork,
      );
      if (roadMarkingMaterial) {
        addSegmentMesh(
          THREE, group, segmentGeometry, roadMarkingMaterial, "PROCEDURAL_ROAD_MARKINGS",
          plan.roads, { widthM: 0.16, heightM: 0.025, yOffsetM: 0.165 }, segmentWork,
        );
      }
      addSegmentMesh(
        THREE, group, segmentGeometry, railBedMaterial, "PROCEDURAL_RAIL_BEDS",
        plan.railSegments, { widthM: 4.2, heightM: 0.18, yOffsetM: 0.1 }, segmentWork,
      );
      addSegmentMesh(
        THREE, group, segmentGeometry, railMaterial, "PROCEDURAL_RAILS",
        plan.railSegments,
        {
          multiplier: 2,
          pairedOffsetM: 0.72,
          widthM: 0.11,
          heightM: 0.13,
          yOffsetM: 0.245,
        },
        segmentWork,
      );
      addSegmentMesh(
        THREE, group, segmentGeometry, runwayMaterial, `PROCEDURAL_${era.toUpperCase()}_RUNWAYS`,
        plan.runways, { heightM: 0.11, yOffsetM: 0.08 }, segmentWork,
      );
      if (plan.powerPoles.length) {
        const poles = new THREE.InstancedMesh(
          poleGeometry, powerPoleMaterial, plan.powerPoles.length,
        );
        poles.name = `PROCEDURAL_${era.toUpperCase()}_POWER_POLES`;
        for (let index = 0; index < plan.powerPoles.length; index++) {
          const pole = plan.powerPoles[index];
          quaternion.identity();
          position.set(pole.x, pole.y, pole.z);
          const baseWidthM = era === "1950s" ? 0.24 : 0.34;
          scale.set(baseWidthM, pole.heightM, baseWidthM);
          setMatrix(THREE, poles, index, position, quaternion, scale, matrix);
        }
        poles.instanceMatrix.needsUpdate = true;
        group.add(poles);
      }
      addSegmentMesh(
        THREE, group, segmentGeometry, powerWireMaterial, "PROCEDURAL_POWER_LINES",
        plan.powerLines, { heightM: 0.08, yOffsetM: 0 }, segmentWork,
      );
      assignInstancedChunkBounds(THREE, group, chunk, decoded, level, profile);
      group.userData.scenery = Object.freeze({
        era,
        theatre: profile.theatre ?? "korea",
        trainingSector: profile.trainingSector === true,
        period: profile.period,
        ring,
        seed: plan.seed,
        trees: plan.trees.length,
        treeSilhouettes: plan.trees.length * standSize,
        buildings: plan.buildings.length,
        buildingSilhouettes: plan.buildings.length * BUILDING_COMPOUND_LAYOUT.length,
        fields: plan.fields.length,
        get grassPatches() {
          return grassController?.mesh?.count ?? 0;
        },
        grassPatchCapacity,
        get grassBlades() {
          return (grassController?.mesh?.count ?? 0) * SOFT_WORLD_GRASS_BLADES_PER_PATCH;
        },
        grassBladeCapacity: grassPatchCapacity * SOFT_WORLD_GRASS_BLADES_PER_PATCH,
        fieldRows: plan.fieldRows.length,
        roadSegments: plan.roads.length,
        railSegments: plan.railSegments.length,
        airfields: plan.airfieldCount,
        runwaySegments: plan.runways.length,
        powerPoles: plan.powerPoles.length,
        powerLines: plan.powerLines.length,
      });
      return group;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      grassControllers.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      toonGradient?.dispose();
    },
  });
}
