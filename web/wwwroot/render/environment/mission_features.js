import {
  addUkraineSoftWorldFog,
  UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES,
  UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE,
  UKRAINE_SOFT_WORLD_FOG_HEX,
  UKRAINE_SOFT_WORLD_HAZE_MIX,
  UKRAINE_SOFT_WORLD_HAZE_RGB,
} from "./soft_world_atmosphere.js";
import {
  addSoftWorldCanopyWind,
  acquireUkraineFoliageAtlas,
  isUkraineFoliageAtlasReady,
  UKRAINE_TEMPERATE_FOLIAGE_ALPHA_CUTOFF,
  UKRAINE_TEMPERATE_FOLIAGE_REGIONS,
  validateUkraineFoliageAtlas,
} from "./korea_scenery.js";

export const MISSION_FEATURE_RENDER_BUDGETS = Object.freeze({
  mobile: Object.freeze({
    maxDrawCalls: 8,
    maxInstances: 384,
    maxTriangles: 45_000,
  }),
  balanced: Object.freeze({
    maxDrawCalls: 9,
    maxInstances: 640,
    maxTriangles: 75_000,
  }),
  desktop: Object.freeze({
    maxDrawCalls: 12,
    maxInstances: 896,
    maxTriangles: 120_000,
  }),
});

const MISSION_FEATURE_SEMANTIC_CAPS = Object.freeze({
  maxStableFeatures: 128,
  maxLandingZoneCandidates: 4,
});

const LZ_STATUS_UNASSESSED = "unassessed";
const FEATURE_BATCH_ORDER = Object.freeze([
  "structures",
  "roofs",
  "columns",
  "segments",
  "canopies",
  "markings",
]);

// A cast-shadow mesh is submitted once to the colour pass and again to the directional shadow
// pass. Constrained tiers keep the authored landmark readable through its Lambert silhouette and
// received world shadows without paying that second submission. Desktop can afford the solid
// authored batches; transparent surface markings never cast.
function batchCastsShadow(qualityTier, batchId) {
  return qualityTier === "desktop"
    && batchId !== "markings"
    && batchId !== "canopies";
}

const DEFAULT_BATCH_COLORS = Object.freeze({
  structures: 0xc9b89a,
  roofs: 0x8a4e3c,
  columns: 0x746957,
  segments: 0x625b50,
  canopies: 0x4e7a48,
  markings: 0xe6d9b4,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function normalizedToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function stableName(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_").toUpperCase();
}

function localTriple(value, label) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    throw new TypeError(`${label} must be an east/up/north triple.`);
  }
  if (value.length !== 3) throw new TypeError(`${label} must contain exactly three values.`);
  const result = [Number(value[0]), Number(value[1]), Number(value[2])];
  if (!result.every(Number.isFinite)) throw new TypeError(`${label} must contain finite values.`);
  return result;
}

function localPath(value, label) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${label} must contain at least two east/up/north points.`);
  }
  return value.map((point, index) => localTriple(point, `${label}[${index}]`));
}

function pointAlongLocalPath(path, t) {
  const scaled = Math.min(1, Math.max(0, t)) * (path.length - 1);
  const startIndex = Math.min(path.length - 2, Math.floor(scaled));
  const blend = scaled - startIndex;
  const start = path[startIndex];
  const end = path[startIndex + 1];
  return [
    start[0] + (end[0] - start[0]) * blend,
    start[1] + (end[1] - start[1]) * blend,
    start[2] + (end[2] - start[2]) * blend,
  ];
}

function assertPathEndpoint(point, expected, label) {
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(point[axis] - expected[axis]) > 0.01) {
      throw new TypeError(`${label} must match the declared road endpoint.`);
    }
  }
}

function sourceAnchor(pack) {
  const anchor = pack.coordinateFrame?.anchorSourceM ?? {};
  const eastM = Number(anchor.eastM ?? 0);
  const northM = Number(anchor.northM ?? 0);
  const upM = Number(anchor.upM ?? 0);
  if (![eastM, northM, upM].every(Number.isFinite)) {
    throw new TypeError("coordinateFrame.anchorSourceM must contain finite metre values.");
  }
  return Object.freeze({ eastM, northM, upM });
}

function looksLikeFeature(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && (
      value.id !== undefined
      || value.featureId !== undefined
      || value.kind !== undefined
      || value.pose !== undefined
      || value.presentation !== undefined
      || value.fromLocalM !== undefined
      || value.toLocalM !== undefined
    );
}

function collectionRecords(collection, options = {}) {
  const records = [];
  const idFields = options.idFields ?? ["id"];

  const append = (value, keyHint = null, kindHint = null) => {
    if (Array.isArray(value)) {
      for (const candidate of value) append(candidate, null, kindHint);
      return;
    }
    if (!value || typeof value !== "object") {
      throw new TypeError(`${options.label ?? "collection"} entries must be objects.`);
    }
    if (looksLikeFeature(value) || options.forceLeaf === true) {
      let id = null;
      for (const field of idFields) {
        if (typeof value[field] === "string" && value[field].trim()) {
          id = value[field];
          break;
        }
      }
      id ??= keyHint;
      records.push({
        ...value,
        id: requireString(id, `${options.label ?? "collection"} entry id`),
        kind: value.kind ?? kindHint ?? options.defaultKind,
      });
      return;
    }
    for (const [key, candidate] of Object.entries(value)) {
      if (Array.isArray(candidate)) append(candidate, null, key);
      else append(candidate, key, kindHint);
    }
  };

  if (Array.isArray(collection)) {
    for (const candidate of collection) append(candidate);
  } else if (collection && typeof collection === "object") {
    for (const [key, candidate] of Object.entries(collection)) {
      if (Array.isArray(candidate)) append(candidate, null, key);
      else append(candidate, key);
    }
  } else if (collection !== undefined && collection !== null) {
    throw new TypeError(`${options.label ?? "collection"} must be an array or object.`);
  }

  records.sort((left, right) => left.id.localeCompare(right.id));
  return records;
}

function normalizeFeatures(pack) {
  return collectionRecords(pack.features ?? [], {
    label: "features",
    idFields: ["id", "featureId"],
  });
}

function normalizeLandingZones(pack) {
  return collectionRecords(pack.landingZones ?? [], {
    label: "landingZones",
    idFields: ["id", "landingZoneId", "lzId"],
    defaultKind: "landing_zone",
    forceLeaf: true,
  });
}

function assertUniqueSemanticIds(features, landingZones) {
  const ids = new Set();
  for (const candidate of [...features, ...landingZones]) {
    if (ids.has(candidate.id)) {
      throw new TypeError(`Duplicate mission-feature semantic id: ${candidate.id}.`);
    }
    ids.add(candidate.id);
  }
}

function lzStatus(candidate) {
  return candidate.status
    ?? candidate.lzStatus
    ?? candidate.assessmentStatus
    ?? candidate.assessment?.status
    ?? LZ_STATUS_UNASSESSED;
}

function assertUnassessedLandingZone(candidate) {
  const status = normalizedToken(lzStatus(candidate));
  if (status !== LZ_STATUS_UNASSESSED) {
    throw new TypeError(
      `Landing zone ${candidate.id} cannot be rendered with unsafe assessment status "${status}".`,
    );
  }
  for (const forbidden of ["safeApproachHeadingDeg", "medicalCapability", "registered"]) {
    if (candidate[forbidden] !== undefined) {
      throw new TypeError(`Landing zone ${candidate.id} cannot declare renderer-owned ${forbidden}.`);
    }
  }
  for (const forbiddenClaim of [
    "safeApproachClaimed",
    "medicalCapabilityClaimed",
    "operationalUseAuthorized",
  ]) {
    if (candidate[forbiddenClaim] === true) {
      throw new TypeError(
        `Landing zone ${candidate.id} cannot assert ${forbiddenClaim} while unassessed.`,
      );
    }
  }
}

function isLandingZoneFeature(feature) {
  const kind = normalizedToken(feature.kind);
  return kind === "landing_zone"
    || kind === "landing_zone_candidate"
    || kind === "lz";
}

function resolvedSemanticCaps(pack) {
  const declared = pack.semanticCaps ?? {};
  const maxStableFeatures = Math.min(
    MISSION_FEATURE_SEMANTIC_CAPS.maxStableFeatures,
    Math.max(0, Math.floor(finite(
      declared.maxStableFeatures,
      MISSION_FEATURE_SEMANTIC_CAPS.maxStableFeatures,
    ))),
  );
  const maxLandingZoneCandidates = Math.min(
    MISSION_FEATURE_SEMANTIC_CAPS.maxLandingZoneCandidates,
    Math.max(0, Math.floor(finite(
      declared.maxLandingZoneCandidates,
      MISSION_FEATURE_SEMANTIC_CAPS.maxLandingZoneCandidates,
    ))),
  );
  return Object.freeze({ maxStableFeatures, maxLandingZoneCandidates });
}

function resolvedRenderBudget(pack, qualityTier) {
  const hard = MISSION_FEATURE_RENDER_BUDGETS[qualityTier];
  if (!hard) throw new TypeError(`Unknown mission-feature quality tier: ${qualityTier}.`);
  const declared = pack.renderBudgets?.[qualityTier] ?? {};
  return Object.freeze({
    maxDrawCalls: Math.min(
      hard.maxDrawCalls,
      Math.max(0, Math.floor(finite(declared.maxDrawCalls, hard.maxDrawCalls))),
    ),
    maxInstances: Math.min(
      hard.maxInstances,
      Math.max(0, Math.floor(finite(declared.maxInstances, hard.maxInstances))),
    ),
    maxTriangles: Math.min(
      hard.maxTriangles,
      Math.max(0, Math.floor(finite(declared.maxTriangles, hard.maxTriangles))),
    ),
    maxSurfacePatchTriangles: Math.max(
      0,
      Math.floor(finite(declared.maxSurfacePatchTriangles, 0)),
    ),
  });
}

function dimensionsFor(feature) {
  const dimensions = feature.dimensionsM ?? {};
  if (Array.isArray(dimensions) || ArrayBuffer.isView(dimensions)) {
    if (dimensions.length !== 3) {
      throw new TypeError(`Feature ${feature.id} dimensionsM must contain three values.`);
    }
    return {
      widthM: Math.max(0.01, finite(dimensions[0], 1)),
      heightM: Math.max(0.01, finite(dimensions[1], 1)),
      depthM: Math.max(0.01, finite(dimensions[2], 1)),
    };
  }
  return {
    widthM: Math.max(0.01, finite(dimensions.widthM ?? dimensions.width, 1)),
    heightM: Math.max(0.01, finite(dimensions.heightM ?? dimensions.height, 1)),
    depthM: Math.max(0.01, finite(dimensions.depthM ?? dimensions.depth, 1)),
  };
}

function positionFor(feature) {
  return localTriple(
    feature.pose?.positionLocalM ?? feature.positionLocalM ?? feature.centerLocalM,
    `Feature ${feature.id} position`,
  );
}

function yawFor(feature) {
  const yawDeg = Number(feature.pose?.yawDeg ?? feature.yawDeg ?? 0);
  if (!Number.isFinite(yawDeg)) throw new TypeError(`Feature ${feature.id} yawDeg must be finite.`);
  // Authored ENU yaw is clockwise from north. Three's +Y rotation is counter-clockwise when the
  // local north axis is rendered as -Z, hence the sign inversion.
  return -yawDeg * Math.PI / 180;
}

function colorValue(THREE, value, fallback) {
  const color = new THREE.Color();
  try {
    color.set(value ?? fallback);
  } catch {
    throw new TypeError(`Invalid mission-feature colour: ${String(value)}.`);
  }
  return color;
}

function semanticMetadata(candidate, overrides = {}) {
  const presentationBinding = candidate.presentationBinding
    ?? candidate.presentation?.binding
    ?? null;
  return Object.freeze({
    semantic: true,
    featureId: candidate.id,
    kind: normalizedToken(candidate.kind || overrides.kind || "feature"),
    role: typeof candidate.role === "string" ? candidate.role : null,
    affiliation: typeof candidate.affiliation === "string" ? candidate.affiliation : null,
    targetable: candidate.targetable === true,
    essential: candidate.presentation?.essential !== false,
    presentationBinding: typeof presentationBinding === "string" ? presentationBinding : null,
    ...(overrides.status ? { status: overrides.status } : {}),
  });
}

function createGableGeometry(THREE) {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.5, 0, -0.5,
    0.5, 0, -0.5,
    0, 1, -0.5,
    -0.5, 0, 0.5,
    0.5, 0, 0.5,
    0, 1, 0.5,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 1, 2,
    5, 4, 3,
    0, 2, 5, 0, 5, 3,
    2, 1, 4, 2, 4, 5,
    0, 3, 4, 0, 4, 1,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function createUkraineShelterbeltCardGeometry(THREE) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const [uMin, vMin, uMax, vMax] = UKRAINE_TEMPERATE_FOLIAGE_REGIONS.poplarWindbreak;
  const append = (yaw) => {
    const base = positions.length / 3;
    const tangentX = Math.cos(yaw) * 0.5;
    const tangentZ = Math.sin(yaw) * 0.5;
    positions.push(
      -tangentX, -0.5, -tangentZ,
      tangentX, -0.5, tangentZ,
      -tangentX, 0.5, -tangentZ,
      tangentX, 0.5, tangentZ,
    );
    uvs.push(uMin, vMax, uMax, vMax, uMin, vMin, uMax, vMin);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  };
  append(0);
  append(Math.PI * 0.5);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBatchGeometry(THREE, batchId, usesUkraineFoliage = false) {
  switch (batchId) {
    case "structures":
    case "segments":
      return new THREE.BoxGeometry(1, 1, 1);
    case "roofs":
      return createGableGeometry(THREE);
    case "columns":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false);
    case "canopies":
      return usesUkraineFoliage
        ? createUkraineShelterbeltCardGeometry(THREE)
        : new THREE.SphereGeometry(0.5, 8, 5);
    case "markings":
      // One short arc instanced around the candidate circumference. A broken meadow ring reads as
      // an authored visual cue, not as a renderer-certified helipad, and costs the same draw call.
      return new THREE.RingGeometry(0.80, 1, 8, 1, -0.14, 0.28);
    default:
      throw new TypeError(`Unknown mission-feature render batch: ${batchId}.`);
  }
}

function geometryTriangleCount(geometry) {
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  return Math.floor((geometry.getAttribute("position")?.count ?? 0) / 3);
}

function createAtmosphereUniforms(THREE, provided = {}) {
  const fallback = {
    uFogColor: { value: new THREE.Color(UKRAINE_SOFT_WORLD_FOG_HEX) },
    uFogDensity: { value: 0.000052 },
    uAtmosphereDensityScale: { value: UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE },
    uAtmosphereHazeColor: { value: new THREE.Color(...UKRAINE_SOFT_WORLD_HAZE_RGB) },
    uAtmosphereHazeMix: { value: UKRAINE_SOFT_WORLD_HAZE_MIX },
    uWorldEdgeM: { value: 0 },
    uHazeBands: { value: 3 },
    uHazeBandBlend: { value: 0.18 },
  };
  return Object.fromEntries(
    UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES.map((name) => [
      name,
      provided[name] ?? fallback[name],
    ]),
  );
}

function batchIdFor(feature) {
  const primitive = normalizedToken(feature.presentation?.primitive ?? feature.primitive);
  const requestedBatch = normalizedToken(feature.presentation?.batch);
  const kind = normalizedToken(feature.kind);
  if (primitive === "gable_building") return "structures";
  if (primitive === "lz_ring_marking") return "markings";
  if (primitive === "road_ribbon") return "segments";
  if (primitive === "shelterbelt_canopy") return "canopies";
  if (primitive === "post_and_rail_fence" || primitive === "overhead_wire") {
    return "segments";
  }
  if (primitive === "utility_pole") return "columns";
  if (/roof/.test(primitive)) return "roofs";
  if (/pole|column|post|trunk|cylinder/.test(primitive)) return "columns";
  if (/fence|wire|segment|line|barrier/.test(primitive)) return "segments";
  if (/road|track|ribbon/.test(primitive)) return "segments";
  if (/tree|canopy|bush|vegetation|sphere/.test(primitive)) return "canopies";
  if (/marking|surface|ring/.test(primitive)) return "markings";
  if (/building|clinic|shed|structure|box/.test(primitive)) return "structures";

  if (/marking/.test(requestedBatch)) return "markings";
  if (/fence|wire/.test(requestedBatch)) return "segments";
  if (/pole/.test(requestedBatch)) return "columns";
  if (/building/.test(requestedBatch)) return "structures";
  if (/landing_zone|marking|surface/.test(kind)) return "markings";
  if (/fence|wire|segment|barrier/.test(kind)) return "segments";
  if (/road|bridge|culvert/.test(kind)) return "segments";
  if (/vegetation/.test(kind)) return "canopies";
  if (/pole|column|post/.test(kind)) return "columns";
  if (/building|clinic|shed|structure/.test(kind)) return "structures";
  throw new TypeError(
    `Feature ${feature.id} has unsupported presentation primitive "${primitive || "(missing)"}".`,
  );
}

function placementRecord(THREE, feature, batchId, position, quaternion, scale, color,
  primitiveRole = null) {
  return {
    featureId: feature.id,
    semanticKind: normalizedToken(feature.kind ?? "feature"),
    batchId,
    primitiveRole: primitiveRole ?? normalizedToken(feature.presentation?.primitive ?? batchId),
    position: new THREE.Vector3(position[0], position[1], -position[2]),
    quaternion: quaternion.clone(),
    scale: new THREE.Vector3(scale[0], scale[1], scale[2]),
    color,
  };
}

function segmentPlacement(THREE, feature, fromLocalM, toLocalM, widthM, color,
  primitiveRole = null) {
  const from = new THREE.Vector3(fromLocalM[0], fromLocalM[1], -fromLocalM[2]);
  const to = new THREE.Vector3(toLocalM[0], toLocalM[1], -toLocalM[2]);
  const direction = new THREE.Vector3().subVectors(to, from);
  const lengthM = direction.length();
  if (!(lengthM > 0)) throw new TypeError(`Feature ${feature.id} segment cannot have zero length.`);
  return {
    featureId: feature.id,
    semanticKind: normalizedToken(feature.kind ?? "segment"),
    batchId: "segments",
    primitiveRole: primitiveRole
      ?? normalizedToken(feature.presentation?.primitive ?? "segment"),
    position: new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction.normalize(),
    ),
    scale: new THREE.Vector3(widthM, widthM, lengthM),
    color,
  };
}

function roadRibbonPlacement(THREE, feature, fromLocalM, toLocalM, widthM, color) {
  const from = new THREE.Vector3(fromLocalM[0], fromLocalM[1], -fromLocalM[2]);
  const to = new THREE.Vector3(toLocalM[0], toLocalM[1], -toLocalM[2]);
  const direction = new THREE.Vector3().subVectors(to, from);
  const lengthM = direction.length();
  if (!(lengthM > 0)) throw new TypeError(`Feature ${feature.id} road cannot have zero length.`);
  // Keep the box just thick enough to avoid z-fighting. A deeper slab exposes its shaded side
  // from the authored approach camera and makes the track read as a black rail above the field.
  const thicknessM = 0.06;
  return {
    featureId: feature.id,
    semanticKind: normalizedToken(feature.kind ?? "road"),
    batchId: "segments",
    primitiveRole: "road_ribbon",
    position: new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
      .add(new THREE.Vector3(0, thicknessM * 0.5, 0)),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction.normalize(),
    ),
    scale: new THREE.Vector3(widthM, thicknessM, lengthM),
    color,
  };
}

function appendFencePlacements(THREE, placements, feature, qualityTier, color) {
  const from = localTriple(feature.fromLocalM, `Feature ${feature.id} fromLocalM`);
  const to = localTriple(feature.toLocalM, `Feature ${feature.id} toLocalM`);
  const railWidthM = Math.max(0.04, finite(feature.widthM, 0.10));
  const fenceHeightM = Math.max(0.8, finite(feature.heightM, 1.45));
  const railOffsetsM = [fenceHeightM * 0.48, fenceHeightM * 0.88];
  for (let index = 0; index < railOffsetsM.length; index++) {
    const offset = railOffsetsM[index];
    placements.segments.push(segmentPlacement(
      THREE,
      feature,
      [from[0], from[1] + offset, from[2]],
      [to[0], to[1] + offset, to[2]],
      railWidthM,
      color,
      `fence_rail_${index + 1}`,
    ));
  }

  const horizontalLengthM = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const preferredSpacingM = qualityTier === "mobile" ? 8 : qualityTier === "balanced" ? 6 : 4;
  const postCount = Math.max(2, Math.floor(horizontalLengthM / preferredSpacingM) + 1);
  for (let index = 0; index < postCount; index++) {
    const t = postCount === 1 ? 0 : index / (postCount - 1);
    const base = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
    placements.segments.push(placementRecord(
      THREE,
      feature,
      "segments",
      [base[0], base[1] + fenceHeightM * 0.5, base[2]],
      new THREE.Quaternion(),
      [railWidthM * 1.35, fenceHeightM, railWidthM * 1.35],
      color,
      "fence_post",
    ));
  }
}

function appendWirePlacements(THREE, placements, feature, qualityTier, color) {
  const from = localTriple(feature.fromLocalM, `Feature ${feature.id} fromLocalM`);
  const to = localTriple(feature.toLocalM, `Feature ${feature.id} toLocalM`);
  const widthM = Math.max(0.025, finite(feature.widthM, 0.055));
  const sagM = Math.max(0, finite(feature.sagM, 0.9));
  const segmentCount = qualityTier === "mobile" ? 4 : qualityTier === "balanced" ? 6 : 8;
  let prior = from;
  for (let index = 1; index <= segmentCount; index++) {
    const t = index / segmentCount;
    const next = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t - sagM * 4 * t * (1 - t),
      from[2] + (to[2] - from[2]) * t,
    ];
    placements.segments.push(segmentPlacement(
      THREE,
      feature,
      prior,
      next,
      widthM,
      color,
      `wire_chord_${index}`,
    ));
    prior = next;
  }
}

function offsetLocalTriple(THREE, origin, quaternion, eastM, upM, renderForwardM) {
  const position = new THREE.Vector3(origin[0], origin[1], -origin[2]);
  position.add(new THREE.Vector3(eastM, upM, renderForwardM).applyQuaternion(quaternion));
  return [position.x, position.y, -position.z];
}

/// A gable shell alone reads as a block from cockpit height. These deterministic facade pieces
/// reuse the existing structure/roof/column batches and inherit the parent feature ID, so the
/// visual gains human scale without inventing new target, collision, or medical semantics.
function appendGableDetails(THREE, placements, feature, qualityTier, position, quaternion,
  dimensions, wallColor) {
  const widthM = dimensions.widthM;
  const heightM = dimensions.heightM;
  const depthM = dimensions.depthM;
  const windowColor = colorValue(
    THREE,
    feature.presentation?.windowColor,
    0x617d7b,
  );
  const doorColor = colorValue(
    THREE,
    feature.presentation?.doorColor,
    feature.role === "pastoral_store" ? 0x654b3b : 0x6f5847,
  );
  const foundationColor = wallColor.clone().multiplyScalar(0.72);
  const roofColor = colorValue(
    THREE,
    feature.presentation?.secondaryColor,
    DEFAULT_BATCH_COLORS.roofs,
  );

  placements.structures.push(placementRecord(
    THREE,
    feature,
    "structures",
    [position[0], position[1] + 0.17, position[2]],
    quaternion,
    [widthM * 1.04, 0.34, depthM * 1.04],
    foundationColor,
    "stone_plinth",
  ));

  const frontM = depthM * 0.5 + 0.07;
  const backM = -depthM * 0.5 - 0.07;
  const windowCount = qualityTier === "mobile" ? 2 : qualityTier === "balanced" ? 3 : 4;
  const windowWidthM = Math.max(0.7, Math.min(1.35, widthM / (windowCount * 2.6)));
  const windowHeightM = Math.max(0.75, Math.min(1.25, heightM * 0.24));
  const windowCentreUpM = Math.max(1.55, Math.min(heightM * 0.58, 2.65));
  const doorWidthM = feature.role === "pastoral_store"
    ? Math.min(3.2, widthM * 0.28)
    : Math.min(1.65, widthM * 0.18);
  const doorHeightM = Math.min(2.55, Math.max(2.0, heightM * 0.48));
  const doorForwardM = frontM + 0.03 + (feature.role === "clinic_main" ? 2.2 : 0);
  const facadeOffsets = Array.from({ length: windowCount }, (_, index) =>
    ((index + 1) / (windowCount + 1) - 0.5) * widthM * 0.82);
  for (const sideM of [frontM, backM]) {
    for (const offsetEastM of facadeOffsets) {
      if (sideM === frontM && Math.abs(offsetEastM) < doorWidthM * 0.72) continue;
      placements.structures.push(placementRecord(
        THREE,
        feature,
        "structures",
        offsetLocalTriple(
          THREE,
          position,
          quaternion,
          offsetEastM,
          windowCentreUpM,
          sideM,
        ),
        quaternion,
        [windowWidthM, windowHeightM, 0.14],
        windowColor,
        sideM === frontM ? "front_window" : "rear_window",
      ));
    }
  }

  placements.structures.push(placementRecord(
    THREE,
    feature,
    "structures",
    offsetLocalTriple(
      THREE,
      position,
      quaternion,
      0,
      doorHeightM * 0.5 + 0.04,
      doorForwardM,
    ),
    quaternion,
    [doorWidthM, doorHeightM, 0.18],
    doorColor,
    feature.role === "pastoral_store" ? "store_double_door" : "entry_door",
  ));

  const hasPorch = feature.role === "clinic_main" || feature.role === "pastoral_store";
  if (hasPorch) {
    const porchWidthM = feature.role === "clinic_main" ? 4.6 : 5.2;
    const porchDepthM = feature.role === "clinic_main" ? 2.2 : 1.8;
    if (feature.role === "clinic_main") {
      placements.structures.push(placementRecord(
        THREE,
        feature,
        "structures",
        offsetLocalTriple(
          THREE,
          position,
          quaternion,
          0,
          1.35,
          depthM * 0.5 + porchDepthM * 0.5,
        ),
        quaternion,
        [porchWidthM, 2.7, porchDepthM],
        wallColor.clone().lerp(new THREE.Color(0xf0e5c9), 0.28),
        "clinic_vestibule",
      ));
    }
    placements.roofs.push(placementRecord(
      THREE,
      feature,
      "roofs",
      offsetLocalTriple(
        THREE,
        position,
        quaternion,
        0,
        feature.role === "clinic_main" ? 2.82 : 2.55,
        depthM * 0.5 + porchDepthM * 0.72,
      ),
      quaternion,
      [porchWidthM * 1.08, 0.52, porchDepthM * 1.25],
      roofColor,
      "entry_awning",
    ));
  }

  const chimneyHeightM = Math.max(1.4, Math.min(2.2, heightM * 0.34));
  placements.columns.push(placementRecord(
    THREE,
    feature,
    "columns",
    offsetLocalTriple(
      THREE,
      position,
      quaternion,
      widthM * 0.24,
      heightM + chimneyHeightM * 0.5,
      -depthM * 0.10,
    ),
    quaternion,
    [0.62, chimneyHeightM, 0.62],
    doorColor.clone().multiplyScalar(0.80),
    "chimney",
  ));
}

function appendBrokenMarking(THREE, placements, feature, qualityTier, position, yaw,
  radiusM, color) {
  const dashCount = qualityTier === "mobile" ? 8 : qualityTier === "balanced" ? 10 : 12;
  const flat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI * 0.5,
  );
  for (let index = 0; index < dashCount; index++) {
    const rotation = new THREE.Quaternion()
      .setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw + index * Math.PI * 2 / dashCount,
      )
      .multiply(flat);
    placements.markings.push(placementRecord(
      THREE,
      feature,
      "markings",
      [position[0], position[1] + 0.06, position[2]],
      rotation,
      [radiusM, radiusM, 1],
      color,
      "unassessed_lz_dash",
    ));
  }
}

function appendShelterbeltPlacements(
  THREE, placements, feature, qualityTier, color, usesUkraineFoliage,
) {
  const origin = positionFor(feature);
  const yaw = yawFor(feature);
  const dimensions = dimensionsFor(feature);
  const groundPath = feature.pathLocalM === undefined
    ? null
    : localPath(feature.pathLocalM, `Feature ${feature.id} pathLocalM`);
  const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yaw,
  );
  const standCount = qualityTier === "mobile" ? 10 : qualityTier === "balanced" ? 12 : 14;
  const spacingM = dimensions.widthM / Math.max(1, standCount - 1);
  const baseCrownWidthM = Math.min(34, spacingM * 0.92);
  const heightPattern = [0.78, 1.08, 0.90, 1.18, 0.84, 1.02, 0.74];
  const trunkColor = colorValue(
    THREE,
    feature.presentation?.secondaryColor,
    0x66503e,
  );
  for (let stand = 0; stand < standCount; stand++) {
    const t = standCount === 1 ? 0.5 : stand / (standCount - 1);
    const endpointScale = stand === 0 || stand === standCount - 1 ? 0 : 1;
    const acrossM = (t - 0.5) * dimensions.widthM
      + Math.sin(stand * 3.11 + 0.8) * spacingM * 0.16 * endpointScale;
    const forwardM = (
      Math.sin(stand * 2.17 + 0.6) * 0.22
      + (stand % 2 === 0 ? -0.06 : 0.06)
    ) * dimensions.depthM;
    const standHeightM = dimensions.heightM * heightPattern[stand % heightPattern.length];
    const crownWidthM = baseCrownWidthM * (0.86 + (stand % 5) * 0.055);
    const crownDepthM = dimensions.depthM * (0.48 + (stand % 4) * 0.07);
    const trunkHeightM = standHeightM * 0.58;
    const trunkBase = groundPath
      ? groundPath.length >= standCount
        ? groundPath[Math.round(t * (groundPath.length - 1))]
        : pointAlongLocalPath(groundPath, t)
      : offsetLocalTriple(
        THREE,
        origin,
        yawQuaternion,
        acrossM,
        0,
        forwardM,
      );
    if (usesUkraineFoliage) {
      const cardQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw + Math.sin(stand * 1.73) * 0.18,
      );
      placements.canopies.push(placementRecord(
        THREE,
        feature,
        "canopies",
        [trunkBase[0], trunkBase[1] + standHeightM * 0.5, trunkBase[2]],
        cardQuaternion,
        [crownWidthM * 1.24, standHeightM, crownDepthM * 1.12],
        new THREE.Color(0xffffff).lerp(color, 0.12),
        "shelterbelt_atlas_windbreak",
      ));
      continue;
    }

    placements.columns.push(placementRecord(
      THREE,
      feature,
      "columns",
      [trunkBase[0], trunkBase[1] + trunkHeightM * 0.5, trunkBase[2]],
      yawQuaternion,
      [0.88 + (stand % 3) * 0.12, trunkHeightM, 0.88 + (stand % 3) * 0.12],
      trunkColor,
      "shelterbelt_trunk",
    ));

    for (let lobe = 0; lobe < 3; lobe++) {
      const lobeAcrossOffsets = [-0.25, 0.04, 0.29];
      const lobeAcrossM = acrossM + lobeAcrossOffsets[lobe] * crownWidthM;
      const lobeForwardSign = (stand + lobe) % 2 === 0 ? -1 : 1;
      const lobeForwardM = forwardM + lobeForwardSign * crownDepthM * (0.06 + lobe * 0.025);
      const lobePosition = groundPath
        ? offsetLocalTriple(
          THREE,
          trunkBase,
          yawQuaternion,
          lobeAcrossM - acrossM,
          standHeightM * (lobe === 1 ? 0.71 : lobe === 0 ? 0.61 : 0.65),
          lobeForwardM - forwardM,
        )
        : offsetLocalTriple(
          THREE,
          origin,
          yawQuaternion,
          lobeAcrossM,
          standHeightM * (lobe === 1 ? 0.71 : lobe === 0 ? 0.61 : 0.65),
          lobeForwardM,
        );
      const lobeColor = color.clone().multiplyScalar(
        (0.91 + (stand % 4) * 0.025) * (lobe === 0 ? 0.91 : lobe === 1 ? 1.05 : 0.98),
      );
      const lobeQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw + Math.sin(stand * 1.73 + lobe) * 0.18,
      );
      placements.canopies.push(placementRecord(
        THREE,
        feature,
        "canopies",
        lobePosition,
        lobeQuaternion,
        [
          crownWidthM * (lobe === 1 ? 0.74 : 0.58),
          standHeightM * (lobe === 1 ? 0.66 : 0.52),
          crownDepthM * (lobe === 1 ? 0.92 : 0.74),
        ],
        lobeColor,
        `shelterbelt_crown_${lobe + 1}`,
      ));
    }
  }
}

function appendFeaturePlacements(
  THREE, placements, feature, qualityTier, usesUkraineFoliage = false,
) {
  const primitive = normalizedToken(feature.presentation?.primitive ?? feature.primitive);
  const kind = normalizedToken(feature.kind);
  const batchId = batchIdFor(feature);
  const primaryColor = colorValue(
    THREE,
    feature.presentation?.color ?? feature.color,
    DEFAULT_BATCH_COLORS[batchId],
  );

  if (primitive === "road_ribbon" || kind === "road") {
    const from = localTriple(feature.fromLocalM, `Feature ${feature.id} fromLocalM`);
    const to = localTriple(feature.toLocalM, `Feature ${feature.id} toLocalM`);
    const path = feature.pathLocalM === undefined
      ? [from, to]
      : localPath(feature.pathLocalM, `Feature ${feature.id} pathLocalM`);
    assertPathEndpoint(path[0], from, `Feature ${feature.id} pathLocalM first point`);
    assertPathEndpoint(path[path.length - 1], to,
      `Feature ${feature.id} pathLocalM last point`);
    for (let index = 1; index < path.length; index++) {
      placements.segments.push(roadRibbonPlacement(
        THREE,
        feature,
        path[index - 1],
        path[index],
        Math.max(1, finite(feature.widthM, 6)),
        primaryColor,
      ));
    }
    return;
  }
  if (primitive === "post_and_rail_fence") {
    appendFencePlacements(THREE, placements, feature, qualityTier, primaryColor);
    return;
  }
  if (primitive === "overhead_wire") {
    appendWirePlacements(THREE, placements, feature, qualityTier, primaryColor);
    return;
  }
  if (feature.fromLocalM !== undefined || feature.toLocalM !== undefined) {
    const from = localTriple(feature.fromLocalM, `Feature ${feature.id} fromLocalM`);
    const to = localTriple(feature.toLocalM, `Feature ${feature.id} toLocalM`);
    placements.segments.push(segmentPlacement(
      THREE,
      feature,
      from,
      to,
      Math.max(0.025, finite(feature.widthM, 0.1)),
      primaryColor,
    ));
    return;
  }

  const position = positionFor(feature);
  const yaw = yawFor(feature);
  const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yaw,
  );
  const dimensions = dimensionsFor(feature);

  if (primitive === "shelterbelt_canopy") {
    appendShelterbeltPlacements(
      THREE,
      placements,
      feature,
      qualityTier,
      primaryColor,
      usesUkraineFoliage,
    );
    return;
  }

  if (batchId === "structures") {
    placements.structures.push(placementRecord(
      THREE,
      feature,
      batchId,
      [position[0], position[1] + dimensions.heightM * 0.5, position[2]],
      yawQuaternion,
      [dimensions.widthM, dimensions.heightM, dimensions.depthM],
      primaryColor,
      "building_shell",
    ));
    if (primitive === "gable_building" || feature.presentation?.secondaryColor !== undefined) {
      const roofHeightM = Math.max(
        0.6,
        finite(feature.presentation?.roofHeightM,
          Math.min(dimensions.widthM, dimensions.depthM) * 0.28),
      );
      placements.roofs.push(placementRecord(
        THREE,
        feature,
        "roofs",
        [position[0], position[1] + dimensions.heightM, position[2]],
        yawQuaternion,
        [dimensions.widthM * 1.08, roofHeightM, dimensions.depthM * 1.08],
        colorValue(
          THREE,
          feature.presentation?.secondaryColor,
          DEFAULT_BATCH_COLORS.roofs,
        ),
        "gable_roof",
      ));
    }
    if (primitive === "gable_building") {
      appendGableDetails(
        THREE,
        placements,
        feature,
        qualityTier,
        position,
        yawQuaternion,
        dimensions,
        primaryColor,
      );
    }
    return;
  }

  if (batchId === "roofs") {
    placements.roofs.push(placementRecord(
      THREE,
      feature,
      batchId,
      position,
      yawQuaternion,
      [dimensions.widthM, dimensions.heightM, dimensions.depthM],
      primaryColor,
    ));
    return;
  }

  if (batchId === "columns") {
    placements.columns.push(placementRecord(
      THREE,
      feature,
      batchId,
      [position[0], position[1] + dimensions.heightM * 0.5, position[2]],
      yawQuaternion,
      [dimensions.widthM, dimensions.heightM, dimensions.depthM],
      primaryColor,
    ));
    if (primitive === "utility_pole") {
      const crossarmWidthM = Math.max(2.4, dimensions.widthM * 8);
      placements.segments.push(placementRecord(
        THREE,
        feature,
        "segments",
        [position[0], position[1] + dimensions.heightM * 0.88, position[2]],
        yawQuaternion,
        [crossarmWidthM, Math.max(0.08, dimensions.widthM * 0.55),
          Math.max(0.08, dimensions.depthM * 0.55)],
        primaryColor,
        "pole_crossarm",
      ));
    }
    return;
  }

  if (batchId === "canopies") {
    placements.canopies.push(placementRecord(
      THREE,
      feature,
      batchId,
      [position[0], position[1] + dimensions.heightM * 0.5, position[2]],
      yawQuaternion,
      [dimensions.widthM, dimensions.heightM, dimensions.depthM],
      primaryColor,
    ));
    return;
  }

  if (batchId === "markings") {
    const radiusM = Math.max(
      0.5,
      finite(feature.markerRadiusM, Math.max(dimensions.widthM, dimensions.depthM) * 0.5),
    );
    appendBrokenMarking(
      THREE,
      placements,
      feature,
      qualityTier,
      position,
      yaw,
      radiusM,
      primaryColor,
    );
    return;
  }

  throw new TypeError(`Feature ${feature.id} could not be assigned to a render batch.`);
}

function appendLandingZonePlacement(THREE, placements, landingZone, qualityTier) {
  const centre = localTriple(
    landingZone.centerLocalM ?? landingZone.pose?.positionLocalM,
    `Landing zone ${landingZone.id} centerLocalM`,
  );
  const radiusM = Math.max(0.5, finite(landingZone.markerRadiusM, 31));
  appendBrokenMarking(
    THREE,
    placements,
    {
      ...landingZone,
      kind: "landing_zone",
      presentation: {
        primitive: "lz_ring_marking",
        essential: true,
      },
    },
    qualityTier,
    centre,
    yawFor(landingZone),
    radiusM,
    colorValue(
      THREE,
      landingZone.presentation?.color ?? landingZone.markingColor,
      DEFAULT_BATCH_COLORS.markings,
    ),
  );
}

function landingZoneHasAuthoredMarker(features, landingZone) {
  const centre = localTriple(
    landingZone.centerLocalM ?? landingZone.pose?.positionLocalM,
    `Landing zone ${landingZone.id} centerLocalM`,
  );
  return features.some((feature) => {
    if (normalizedToken(feature.presentation?.primitive) !== "lz_ring_marking") return false;
    const markerCentre = positionFor(feature);
    return markerCentre.every((value, index) => Math.abs(value - centre[index]) <= 0.05);
  });
}

function createSemanticNode(THREE, candidate, status = null) {
  const node = new THREE.Object3D();
  node.name = `MISSION_FEATURE_${stableName(candidate.id)}`;
  const position = candidate.centerLocalM
    ?? candidate.pose?.positionLocalM
    ?? candidate.positionLocalM;
  if (position !== undefined) {
    const [eastM, upM, northM] = localTriple(
      position,
      `Semantic feature ${candidate.id} position`,
    );
    node.position.set(eastM, upM, -northM);
  }
  node.rotation.y = yawFor(candidate);
  node.updateMatrix();
  node.matrixAutoUpdate = false;
  node.userData.missionFeature = semanticMetadata(candidate, {
    status,
    kind: status ? "landing_zone" : undefined,
  });
  return node;
}

function staticMaterial(
  THREE,
  batchId,
  atmosphereUniforms,
  ukraineFoliageAtlas = null,
  foliageWindUniforms = null,
) {
  const usesFoliageAtlas = batchId === "canopies" && ukraineFoliageAtlas !== null;
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: batchId !== "markings" && !usesFoliageAtlas,
    side: batchId === "markings" || usesFoliageAtlas
      ? THREE.DoubleSide
      : THREE.FrontSide,
    transparent: batchId === "markings",
    opacity: batchId === "markings" ? 0.94 : 1,
    depthWrite: batchId !== "markings",
    map: usesFoliageAtlas ? ukraineFoliageAtlas : null,
    alphaTest: usesFoliageAtlas ? UKRAINE_TEMPERATE_FOLIAGE_ALPHA_CUTOFF : 0,
    emissive: usesFoliageAtlas ? 0x3a6a38 : 0x000000,
    emissiveIntensity: usesFoliageAtlas ? 0.16 : 1,
  });
  material.name = `MISSION_FEATURE_${batchId.toUpperCase()}_MATERIAL`;
  if (usesFoliageAtlas && foliageWindUniforms) {
    addSoftWorldCanopyWind(material, foliageWindUniforms);
  }
  addUkraineSoftWorldFog(material, atmosphereUniforms);
  return material;
}

/**
 * Builds one immutable, source-frame mission-feature presentation. The caller attaches `group`
 * directly below the authoritative terrain group, whose placement transform supplies the mission
 * translation. The pack is assumed schema-valid; the defensive checks here protect the frame
 * budget and prevent presentation data from promoting an LZ beyond "unassessed".
 */
export function createMissionFeaturePresentation(THREE, pack, options = {}) {
  if (!THREE?.Group || !THREE?.InstancedMesh) {
    throw new TypeError("A Three.js namespace is required.");
  }
  if (!pack || typeof pack !== "object") {
    throw new TypeError("A validated mission feature pack is required.");
  }

  const featurePackId = requireString(pack.featurePackId, "featurePackId");
  const packVersion = requireString(pack.packVersion, "packVersion");
  const theatreId = pack.theatre?.theatreId ?? pack.theatre?.id ?? null;
  const usesUkraineFoliage = typeof theatreId === "string"
    && theatreId.startsWith("theatre.ukraine.");
  const qualityTier = options.qualityTier ?? "balanced";
  const budget = resolvedRenderBudget(pack, qualityTier);
  const semanticCaps = resolvedSemanticCaps(pack);
  const features = normalizeFeatures(pack);
  const landingZones = normalizeLandingZones(pack);
  assertUniqueSemanticIds(features, landingZones);
  for (const landingZone of landingZones) assertUnassessedLandingZone(landingZone);
  for (const feature of features) {
    if (feature.targetable === true || feature.presentationOnly === false) {
      throw new TypeError(
        `Feature ${feature.id} must remain non-targetable presentation-only scenery.`,
      );
    }
    if (isLandingZoneFeature(feature)) assertUnassessedLandingZone(feature);
    if (usesUkraineFoliage
        && batchIdFor(feature) === "canopies"
        && normalizedToken(feature.presentation?.primitive ?? feature.primitive)
          !== "shelterbelt_canopy") {
      throw new TypeError(
        `Feature ${feature.id} must declare shelterbelt_canopy before entering the shared `
          + "Ukraine foliage-card batch.",
      );
    }
  }

  const semanticFeatureCount = features.length + landingZones.length;
  if (semanticFeatureCount > semanticCaps.maxStableFeatures) {
    throw new RangeError(
      `${featurePackId} declares ${semanticFeatureCount} semantic features; `
        + `tier-safe cap is ${semanticCaps.maxStableFeatures}.`,
    );
  }
  if (landingZones.length > semanticCaps.maxLandingZoneCandidates) {
    throw new RangeError(
      `${featurePackId} declares ${landingZones.length} landing zones; `
        + `cap is ${semanticCaps.maxLandingZoneCandidates}.`,
    );
  }

  const placements = Object.fromEntries(
    FEATURE_BATCH_ORDER.map((batchId) => [batchId, []]),
  );
  for (const feature of features) appendFeaturePlacements(
    THREE,
    placements,
    feature,
    qualityTier,
    usesUkraineFoliage,
  );
  for (const landingZone of landingZones) {
    if (!landingZoneHasAuthoredMarker(features, landingZone)) {
      appendLandingZonePlacement(THREE, placements, landingZone, qualityTier);
    }
  }

  const geometries = new Map();
  let mainPassDrawCalls = 0;
  let shadowDrawCalls = 0;
  let instances = 0;
  let mainPassTriangles = 0;
  let shadowTriangles = 0;
  for (const batchId of FEATURE_BATCH_ORDER) {
    const batchPlacements = placements[batchId];
    if (!batchPlacements.length) continue;
    const geometry = createBatchGeometry(THREE, batchId, usesUkraineFoliage);
    const batchTriangles = geometryTriangleCount(geometry) * batchPlacements.length;
    geometries.set(batchId, geometry);
    mainPassDrawCalls += 1;
    mainPassTriangles += batchTriangles;
    if (batchCastsShadow(qualityTier, batchId)) {
      shadowDrawCalls += 1;
      shadowTriangles += batchTriangles;
    }
    instances += batchPlacements.length;
  }
  // renderBudgets.maxDrawCalls is a submission ceiling, not merely a count of visible materials.
  // Count the possible shadow pass even when the current renderer has shadows disabled so a pack
  // remains inside its declared ceiling when the production sun enables them.
  const drawCalls = mainPassDrawCalls + shadowDrawCalls;
  const triangles = mainPassTriangles + shadowTriangles;

  if (drawCalls > budget.maxDrawCalls) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw new RangeError(
      `${featurePackId} needs ${drawCalls} draw calls on ${qualityTier}; `
        + `${mainPassDrawCalls} main + ${shadowDrawCalls} shadow submissions, `
        + `budget is ${budget.maxDrawCalls}.`,
    );
  }
  if (instances > budget.maxInstances) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw new RangeError(
      `${featurePackId} needs ${instances} instances on ${qualityTier}; `
        + `budget is ${budget.maxInstances}.`,
    );
  }
  if (triangles > budget.maxTriangles) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw new RangeError(
      `${featurePackId} needs ${triangles} triangles on ${qualityTier}; `
        + `budget is ${budget.maxTriangles}.`,
    );
  }

  const anchor = sourceAnchor(pack);
  const group = new THREE.Group();
  group.name = `MISSION_FEATURE_PACK_${stableName(featurePackId)}`;
  group.position.set(anchor.eastM, anchor.upM, -anchor.northM);
  group.updateMatrix();
  group.matrixAutoUpdate = false;
  group.userData.missionFeaturePack = Object.freeze({
    featurePackId,
    packVersion,
    qualityTier,
    theatreId,
    locationId: pack.theatre?.locationId ?? null,
    worldFrameId: pack.theatre?.worldFrameId ?? pack.coordinateFrame?.worldFrameId ?? null,
    contentHashSha256: pack.contentHashSha256 ?? pack.sha256 ?? null,
    lzAssessmentStatus: LZ_STATUS_UNASSESSED,
    anchorSourceM: anchor,
  });

  const semanticGroup = new THREE.Group();
  semanticGroup.name = "MISSION_FEATURE_SEMANTICS";
  semanticGroup.matrixAutoUpdate = false;
  semanticGroup.updateMatrix();
  for (const feature of features) {
    semanticGroup.add(createSemanticNode(
      THREE,
      feature,
      isLandingZoneFeature(feature) ? LZ_STATUS_UNASSESSED : null,
    ));
  }
  for (const landingZone of landingZones) {
    semanticGroup.add(createSemanticNode(THREE, landingZone, LZ_STATUS_UNASSESSED));
  }
  group.add(semanticGroup);

  const atmosphereUniforms = createAtmosphereUniforms(
    THREE,
    options.atmosphereUniforms,
  );
  let ukraineFoliageAtlasLease = null;
  let ukraineFoliageAtlas = options.ukraineFoliageAtlas ?? null;
  if (usesUkraineFoliage && !ukraineFoliageAtlas) {
    ukraineFoliageAtlasLease = acquireUkraineFoliageAtlas(THREE);
    ukraineFoliageAtlas = ukraineFoliageAtlasLease.texture;
  }
  if (ukraineFoliageAtlas && !ukraineFoliageAtlasLease) {
    validateUkraineFoliageAtlas(THREE, ukraineFoliageAtlas);
  }
  const materials = [];
  const meshes = [];
  const matrix = new THREE.Matrix4();
  const foliageWindUniforms = usesUkraineFoliage
    ? {
        time: { value: 0 },
        wind: { value: new THREE.Vector2() },
      }
    : null;
  for (const batchId of FEATURE_BATCH_ORDER) {
    const batchPlacements = placements[batchId];
    if (!batchPlacements.length) continue;
    const geometry = geometries.get(batchId);
    const material = staticMaterial(
      THREE,
      batchId,
      atmosphereUniforms,
      usesUkraineFoliage ? ukraineFoliageAtlas : null,
      foliageWindUniforms,
    );
    const mesh = new THREE.InstancedMesh(geometry, material, batchPlacements.length);
    mesh.name = `MISSION_FEATURE_BATCH_${batchId.toUpperCase()}`;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const instanceColors = new Float32Array(batchPlacements.length * 3);
    for (let index = 0; index < batchPlacements.length; index++) {
      const placement = batchPlacements[index];
      matrix.compose(placement.position, placement.quaternion, placement.scale);
      mesh.setMatrixAt(index, matrix);
      placement.color.toArray(instanceColors, index * 3);
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = batchCastsShadow(qualityTier, batchId);
    mesh.receiveShadow = true;
    mesh.userData.missionFeatureBatch = Object.freeze({
      batchId,
      static: true,
      castsShadow: mesh.castShadow,
      semanticInstances: Object.freeze(batchPlacements.map((placement, instanceId) =>
        Object.freeze({
          instanceId,
          featureId: placement.featureId,
          kind: placement.semanticKind,
          primitiveRole: placement.primitiveRole,
        }))),
    });
    materials.push(material);
    meshes.push(mesh);
    group.add(mesh);
  }

  let disposed = false;
  const builtMetrics = Object.freeze({
    drawCalls,
    mainPassDrawCalls,
    shadowDrawCalls,
    instances,
    triangles,
    mainPassTriangles,
    shadowTriangles,
  });
  const diagnostics = () => Object.freeze({
    featurePackId,
    packVersion,
    contentHashSha256: pack.contentHashSha256 ?? pack.sha256 ?? null,
    qualityTier,
    drawCalls: disposed ? 0 : builtMetrics.drawCalls,
    mainPassDrawCalls: disposed ? 0 : builtMetrics.mainPassDrawCalls,
    shadowDrawCalls: disposed ? 0 : builtMetrics.shadowDrawCalls,
    instances: disposed ? 0 : builtMetrics.instances,
    triangles: disposed ? 0 : builtMetrics.triangles,
    mainPassTriangles: disposed ? 0 : builtMetrics.mainPassTriangles,
    shadowTriangles: disposed ? 0 : builtMetrics.shadowTriangles,
    semanticFeatures: semanticFeatureCount,
    landingZones: landingZones.length,
    lzAssessmentStatus: LZ_STATUS_UNASSESSED,
    foliageAtlasId: usesUkraineFoliage
      ? "environment.foliage.ukraine-temperate.v1"
      : null,
    foliageAtlasSynthetic: ukraineFoliageAtlasLease?.synthetic ?? false,
    get foliageAtlasReady() {
      return ukraineFoliageAtlasLease?.ready
        ?? isUkraineFoliageAtlasReady(ukraineFoliageAtlas);
    },
    get foliageAtlasError() {
      return ukraineFoliageAtlasLease?.error ?? null;
    },
    budget,
    disposed,
  });

  return Object.freeze({
    group,
    diagnostics,
    update({ elapsedSeconds, windX, windZ } = {}) {
      if (!foliageWindUniforms || disposed) return;
      if (Number.isFinite(elapsedSeconds)) foliageWindUniforms.time.value = elapsedSeconds;
      if (Number.isFinite(windX)) foliageWindUniforms.wind.value.x = windX;
      if (Number.isFinite(windZ)) foliageWindUniforms.wind.value.y = windZ;
    },
    featureNode(featureId) {
      return semanticGroup.children.find(
        (child) => child.userData.missionFeature?.featureId === featureId,
      ) ?? null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) {
        mesh.count = 0;
        mesh.removeFromParent();
      }
      semanticGroup.clear();
      semanticGroup.removeFromParent();
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials) material.dispose();
      ukraineFoliageAtlasLease?.release();
      group.userData.missionFeatureDisposed = true;
    },
  });
}
