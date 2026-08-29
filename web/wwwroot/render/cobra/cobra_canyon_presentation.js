import {
  COBRA_STRUCTURE_SURFACES,
  createCobraStructureMaterial,
} from "./cobra_structure_material.js?v=348";
import {
  applyCobraCanyonCampEmberApron,
  COBRA_CANYON_CAMP_EMBER_APRON,
  smoothstep,
  sampleCobraCanyonTerrain,
  sampleCobraCanyonTerrainBeforeCampEmberApron,
} from "./cobra_canyon_plan.js?v=348";
import {
  COBRA_CANYON_AMBIENT_BUDGETS,
  createCobraCanyonAssetKit,
} from "./cobra_canyon_asset_kit.js?v=348";
import { COBRA_CANYON_VISUAL_PROFILE } from "./cobra_canyon_visual_profile.js?v=348";
import {
  createCobraCanyonBasinMaterial,
  createCobraCanyonRiverMaterial,
} from "./cobra_canyon_terrain_material.js?v=348";
import {
  CAMP_EMBER_DRAWN_RECESS_M,
  createCampEmberFirebase,
} from "./cobra_camp_ember_firebase.js?v=348";

export { COBRA_CANYON_AMBIENT_BUDGETS };

export const COBRA_CANYON_PRESENTATION_SCHEMA =
  "guns-only.cobra-canyon-presentation.v1";

// Basin grid resolution. Trimmed from 96/128/160 to fund canopy INSTANCES, which is the better
// buy now the heightfield carries real relief: a 133 m quad on a 300 m gorge wall still reads as
// that wall, whereas one more canopy stand is the difference between a bare hillside and jungle.
// Every tier keeps its authored triangle ceiling; see COBRA_CANYON_RENDER_BUDGETS below.
export const COBRA_CANYON_TERRAIN_SEGMENTS = Object.freeze({
  mobile: 92,
  balanced: 120,
  desktop: 152,
});

// The core analytical terrain and authority cues occupy eleven submissions (basin, river, roads,
// hero cells, landmarks, Plantation worked rows, non-bridge hazards, its water tower, bridge
// decks, approaches and piers). Camp Ember is one merged vertex-coloured mesh (+1). Long Fang
// remains navigation authority but deliberately has no fake freestanding geometry: a real falls
// needs a terrain cut, not another procedural obelisk.
// The asset kit adds at most one instanced submission for each of its seven roles.
export const COBRA_CANYON_RENDER_BUDGETS = Object.freeze({
  // maxAuthoredTriangles is the slice of maxTriangles that authored glTF meshes may spend.
  // An authored palm costs ~470 triangles against a crossed card's dozen, so without a
  // ceiling the jungle role alone runs to millions and the budget check throws at boot. Mobile
  // gets none: its whole scene fits in 46,200 triangles, which one hero batch would eat.
  mobile: Object.freeze({
    maxDrawCalls: 19,
    maxInstances: 640,
    maxTriangles: 46_200,
    maxAssetInstances: 580,
    maxAuthoredTriangles: 0,
    nearRingMaximumAglM: 180,
  }),
  balanced: Object.freeze({
    maxDrawCalls: 19,
    maxInstances: 4_200,
    maxTriangles: 380_000,
    maxAssetInstances: 3_900,
    maxAuthoredTriangles: 150_000,
    nearRingMaximumAglM: 260,
  }),
  // DENSITY IS THE PICTURE. 1,330 ambient instances across a 6.9 km valley — jungle, village,
  // paddy, rock and mist combined — is why the corridor read as empty hillsides with a few
  // scattered trees. These are InstancedMeshes: one draw call per role regardless of count, so
  // the real costs are vertex throughput, fill rate and shadow submissions, not draw calls.
  // Build 312 production telemetry measured a locked 60 fps with view_ms ~1.2 and sim_ms ~3.4,
  // i.e. a whole frame of headroom on desktop. Spend it on canopy.
  desktop: Object.freeze({
    maxDrawCalls: 19,
    maxInstances: 9_600,
    maxTriangles: 900_000,
    maxAssetInstances: 9_000,
    maxAuthoredTriangles: 420_000,
    nearRingMaximumAglM: 360,
  }),
});

export const COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M = 9.706;

/** Triangles every tier keeps unspent, so the ceiling stays a margin rather than a target. */
const PRESENTATION_TRIANGLE_RESERVE = 2_048;

const CONTAINER_KEYS = Object.freeze([
  "presentation",
  "authored",
  "features",
  "world",
  "environment",
  "terrain",
]);

const PRESENTATION_TAG = Object.freeze({
  presentationOnly: true,
  authoritative: false,
  collisionSource: false,
  targetSource: false,
  targetable: false,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function recordId(record, fallback) {
  return String(
    record?.id
      ?? record?.featureId
      ?? record?.cellId
      ?? record?.landmarkId
      ?? record?.hazardId
      ?? fallback,
  );
}

function sortedRecords(records, prefix) {
  return records
    .map((record, index) => ({ record, id: recordId(record, `${prefix}.${index}`), index }))
    .sort((left, right) => left.id.localeCompare(right.id) || left.index - right.index)
    .map((entry) => entry.record);
}

function candidateContainers(plan) {
  const result = [plan];
  for (const key of CONTAINER_KEYS) {
    const candidate = plan?.[key];
    if (candidate && typeof candidate === "object") result.push(candidate);
  }
  return result;
}

function firstValue(plan, keys) {
  for (const container of candidateContainers(plan)) {
    for (const key of keys) {
      if (container[key] !== undefined && container[key] !== null) return container[key];
    }
  }
  return null;
}

function collectionFrom(value, nestedKeys = []) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") return [];
  for (const key of nestedKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [value];
}

function collection(plan, keys, nestedKeys = []) {
  return collectionFrom(firstValue(plan, keys), nestedKeys);
}

function pointFrom(value, fallbackY = 0) {
  if (!value) return null;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length >= 3) {
      return {
        x: finite(value[0]),
        y: finite(value[1], fallbackY),
        z: -finite(value[2]),
      };
    }
    if (value.length >= 2) {
      return { x: finite(value[0]), y: fallbackY, z: -finite(value[1]) };
    }
    return null;
  }

  const nested = value.positionWorldM
    ?? value.worldPositionM
    ?? value.positionLocalM
    ?? value.centerLocalM
    ?? value.centreLocalM
    ?? value.positionM
    ?? value.centerM
    ?? value.centreM
    ?? value.position
    ?? value.center
    ?? value.centre
    ?? value.terrainPatch?.centerLocalM;
  if (nested && nested !== value) return pointFrom(nested, fallbackY);

  const east = value.eastM ?? value.east_m ?? value.centerEastM ?? value.centreEastM;
  const north = value.northM ?? value.north_m ?? value.centerNorthM ?? value.centreNorthM;
  if (east !== undefined || north !== undefined) {
    return {
      x: finite(east),
      y: finite(
        value.upM
          ?? value.up_m
          ?? value.elevationM
          ?? value.elevation_m
          ?? value.surfaceElevationM
          ?? value.surface_elevation_m,
        fallbackY,
      ),
      z: -finite(north),
    };
  }

  if (value.x !== undefined || value.z !== undefined) {
    return { x: finite(value.x), y: finite(value.y, fallbackY), z: finite(value.z) };
  }
  return null;
}

function pathFrom(record) {
  const value = Array.isArray(record)
    ? record
    : record?.points
      ?? record?.controlPoints
      ?? record?.control_points
      ?? record?.centreline
      ?? record?.centerline
      ?? record?.path
      ?? record?.polyline
      ?? record?.vertices
      ?? record?.pointsLocalM
      ?? record?.pathLocalM;
  if (!Array.isArray(value)) return [];
  const points = [];
  const fallbackY = finite(
    record?.elevationM ?? record?.surfaceElevationM ?? record?.upM,
    0,
  );
  for (const candidate of value) {
    const point = pointFrom(candidate, fallbackY);
    if (point) points.push(point);
  }
  return points;
}

function boundsFrom(value) {
  if (!value || typeof value !== "object") return null;
  if (
    value.minimumEastM !== undefined
    && value.minimumNorthM !== undefined
    && value.maximumEastM !== undefined
    && value.maximumNorthM !== undefined
  ) {
    return {
      minimumEastM: finite(value.minimumEastM),
      minimumNorthM: finite(value.minimumNorthM),
      maximumEastM: finite(value.maximumEastM),
      maximumNorthM: finite(value.maximumNorthM),
      elevationM: finite(value.elevationM ?? value.surfaceElevationM ?? value.upM),
    };
  }
  const bounds = value.boundsLocalM ?? value.boundsM ?? value.bounds;
  if (bounds && typeof bounds === "object" && !Array.isArray(bounds)
      && !ArrayBuffer.isView(bounds)) {
    return boundsFrom(bounds);
  }
  if ((Array.isArray(bounds) || ArrayBuffer.isView(bounds)) && bounds.length >= 4) {
    return {
      minimumEastM: finite(bounds[0]),
      minimumNorthM: finite(bounds[1]),
      maximumEastM: finite(bounds[2]),
      maximumNorthM: finite(bounds[3]),
      elevationM: finite(value.elevationM ?? value.surfaceElevationM ?? value.upM),
    };
  }
  const minimum = value.minimumLocalM ?? value.minimumWorldM ?? value.minimum;
  const maximum = value.maximumLocalM ?? value.maximumWorldM ?? value.maximum;
  if (minimum && maximum) {
    const low = pointFrom(minimum);
    const high = pointFrom(maximum);
    if (low && high) {
      return {
        minimumEastM: Math.min(low.x, high.x),
        minimumNorthM: Math.min(-low.z, -high.z),
        maximumEastM: Math.max(low.x, high.x),
        maximumNorthM: Math.max(-low.z, -high.z),
        elevationM: Math.max(low.y, high.y),
      };
    }
  }
  const center = pointFrom(value);
  const widthM = finite(value.widthM ?? value.width_m ?? value.sizeM?.[0] ?? value.sizeM, 0);
  const depthM = finite(value.depthM ?? value.depth_m ?? value.sizeM?.[2] ?? value.sizeM, 0);
  if (center && widthM > 0 && depthM > 0) {
    return {
      minimumEastM: center.x - widthM * 0.5,
      minimumNorthM: -center.z - depthM * 0.5,
      maximumEastM: center.x + widthM * 0.5,
      maximumNorthM: -center.z + depthM * 0.5,
      elevationM: center.y,
    };
  }
  return null;
}

function yawRadians(record) {
  if (Number.isFinite(Number(record?.yawRad))) return Number(record.yawRad);
  const degrees = finite(
    record?.yawDeg ?? record?.headingDeg ?? record?.heading_deg ?? record?.rotationDeg,
    0,
  );
  return degrees * Math.PI / 180;
}

function appendTriangle(positions, a, b, c, colors = null, color = null) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  if (colors && color) colors.push(...color, ...color, ...color);
}

function appendColoredTriangle(positions, colors, a, b, c, colorA, colorB, colorC) {
  appendTriangle(positions, a, b, c);
  colors.push(...colorA, ...colorB, ...colorC);
}

function appendBoxPrism(positions, minimum, maximum, colors = null, color = null) {
  const [x0, y0, z0] = minimum;
  const [x1, y1, z1] = maximum;
  const corners = [
    { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
    { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 },
    { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
    { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 },
  ];
  for (const [a, b, c] of [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
    [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4],
  ]) {
    appendTriangle(positions, corners[a], corners[b], corners[c], colors, color);
  }
}

/** Add a rectangular beam in the XY plane, extruded between two Z faces. */
function appendOrientedBeamPrism(
  positions,
  from,
  to,
  width,
  minimumZ,
  maximumZ,
  colors = null,
  color = null,
) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= 1e-6 || width <= 0 || maximumZ <= minimumZ) return;
  const halfWidth = width * 0.5;
  const normalX = -deltaY / length * halfWidth;
  const normalY = deltaX / length * halfWidth;
  // Clockwise around the beam as seen from -Z; this matches appendBoxPrism's corner order.
  const face = [
    { x: from.x - normalX, y: from.y - normalY },
    { x: to.x - normalX, y: to.y - normalY },
    { x: to.x + normalX, y: to.y + normalY },
    { x: from.x + normalX, y: from.y + normalY },
  ];
  const corners = [
    ...face.map((point) => ({ ...point, z: minimumZ })),
    ...face.map((point) => ({ ...point, z: maximumZ })),
  ];
  for (const [a, b, c] of [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
    [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4],
  ]) {
    appendTriangle(positions, corners[a], corners[b], corners[c], colors, color);
  }
}

/**
 * Add an XY beam whose thickness is expressed in world metres before the normalized bridge
 * geometry is stretched into its authored collision span. A single normalized width made a
 * diagonal on the 185 x 12 m approach several metres thick in X while remaining thin in Y,
 * which is the slab/shard silhouette visible from the cockpit.
 */
function appendWorldMetricBeamPrism(
  positions,
  from,
  to,
  thicknessM,
  spanWidthM,
  spanHeightM,
  minimumZ,
  maximumZ,
  colors = null,
  color = null,
) {
  const deltaXM = (to.x - from.x) * spanWidthM;
  const deltaYM = (to.y - from.y) * spanHeightM;
  const lengthM = Math.hypot(deltaXM, deltaYM);
  if (lengthM <= 1e-6 || thicknessM <= 0 || maximumZ <= minimumZ) return;
  const halfThicknessM = thicknessM * 0.5;
  const normalX = (-deltaYM / lengthM * halfThicknessM) / spanWidthM;
  const normalY = (deltaXM / lengthM * halfThicknessM) / spanHeightM;
  const face = [
    { x: from.x - normalX, y: from.y - normalY },
    { x: to.x - normalX, y: to.y - normalY },
    { x: to.x + normalX, y: to.y + normalY },
    { x: from.x + normalX, y: from.y + normalY },
  ];
  const corners = [
    ...face.map((point) => ({ ...point, z: minimumZ })),
    ...face.map((point) => ({ ...point, z: maximumZ })),
  ];
  for (const [a, b, c] of [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
    [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4],
  ]) {
    appendTriangle(positions, corners[a], corners[b], corners[c], colors, color);
  }
}

/** Add a rectangular beam in the ZY plane, extruded between two X faces. */
function appendCrossBeamPrism(
  positions,
  from,
  to,
  width,
  minimumX,
  maximumX,
  colors = null,
  color = null,
) {
  const deltaZ = to.z - from.z;
  const deltaY = to.y - from.y;
  const length = Math.hypot(deltaZ, deltaY);
  if (length <= 1e-6 || width <= 0 || maximumX <= minimumX) return;
  const halfWidth = width * 0.5;
  const normalZ = -deltaY / length * halfWidth;
  const normalY = deltaZ / length * halfWidth;
  const face = [
    { z: from.z - normalZ, y: from.y - normalY },
    { z: to.z - normalZ, y: to.y - normalY },
    { z: to.z + normalZ, y: to.y + normalY },
    { z: from.z + normalZ, y: from.y + normalY },
  ];
  const corners = [
    ...face.map((point) => ({ x: minimumX, ...point })),
    ...face.map((point) => ({ x: maximumX, ...point })),
  ];
  for (const [a, b, c] of [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
    [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4],
  ]) {
    appendTriangle(positions, corners[a], corners[b], corners[c], colors, color);
  }
}

/** Add a closed, faceted cylinder/frustum around the Y axis. */
function appendCylinderFrustum(
  positions,
  colors,
  minimumY,
  maximumY,
  lowerRadius,
  upperRadius,
  segments,
  sideColor,
  capColor = sideColor,
) {
  const bottomCentre = { x: 0, y: minimumY, z: 0 };
  const topCentre = { x: 0, y: maximumY, z: 0 };
  for (let segment = 0; segment < segments; segment++) {
    const angle0 = segment / segments * Math.PI * 2;
    const angle1 = (segment + 1) / segments * Math.PI * 2;
    const lower0 = {
      x: Math.cos(angle0) * lowerRadius,
      y: minimumY,
      z: Math.sin(angle0) * lowerRadius,
    };
    const lower1 = {
      x: Math.cos(angle1) * lowerRadius,
      y: minimumY,
      z: Math.sin(angle1) * lowerRadius,
    };
    const upper0 = {
      x: Math.cos(angle0) * upperRadius,
      y: maximumY,
      z: Math.sin(angle0) * upperRadius,
    };
    const upper1 = {
      x: Math.cos(angle1) * upperRadius,
      y: maximumY,
      z: Math.sin(angle1) * upperRadius,
    };
    appendTriangle(positions, lower0, upper0, upper1, colors, sideColor);
    appendTriangle(positions, lower0, upper1, lower1, colors, sideColor);
    appendTriangle(positions, bottomCentre, lower0, lower1, colors, capColor);
    appendTriangle(positions, topCentre, upper1, upper0, colors, capColor);
  }
}

/**
 * Unit-normalized deck truss. Outer AABB is exactly [-0.5,0.5]^3 so composeBox preserves
 * authored collision bounds while the silhouette reads as a steel span, not a solid orange box.
 */
function bridgeDeckTrussGeometry(THREE) {
  const positions = [];
  const colors = [];
  // The collision span is 142–160 m. Keep the physical roadway joined to the ground-war road
  // datum at 144.56 m, leaving a truthful 15.44 m through-truss silhouette above traffic.
  const roadSurfaceY = -0.35777777777777775;
  const lowerChordTopY = -0.285;
  // Vertex colour does the compositional work a second material batch would normally do. A dark
  // traffic deck anchors the crossing while sun-catching ochre chords and rust-red diagonals
  // keep the OPEN truss legible against both jungle and humid sky. Length/height placement and
  // draw-call count stay collision-backed; visible width is deliberately narrower than authority.
  appendBoxPrism(
    positions,
    [-0.5, -0.5, -0.30],
    [0.5, -0.405, 0.30],
    colors,
    [0.12, 0.14, 0.14],
  );
  // Cross-deck roadway lip so the span reads as a crossing, not two parallel walls.
  appendBoxPrism(
    positions,
    [-0.5, -0.405, -0.30],
    [0.5, roadSurfaceY, 0.30],
    colors,
    [0.22, 0.24, 0.23],
  );
  appendBoxPrism(
    positions,
    [-0.48, roadSurfaceY + 0.002, -0.014],
    [0.48, roadSurfaceY + 0.012, 0.014],
    colors,
    [0.58, 0.52, 0.36],
  );

  // Two genuinely open Warren-truss faces. Chords touch the authored side envelope; posts and
  // diagonals are narrow structural members rather than full-height slabs. The inset panel nodes
  // leave enough room for a rotated beam's corners to remain inside the normalized X envelope.
  const panelX = [-0.475, -0.2375, 0, 0.2375, 0.475];
  for (const side of [-1, 1]) {
    const minimumZ = side < 0 ? -0.5 : 0.42;
    const maximumZ = side < 0 ? -0.42 : 0.5;
    appendBoxPrism(
      positions,
      [-0.5, roadSurfaceY, minimumZ],
      [0.5, lowerChordTopY, maximumZ],
      colors,
      [0.28, 0.30, 0.29],
    );
    appendBoxPrism(
      positions,
      [-0.5, 0.42, minimumZ],
      [0.5, 0.5, maximumZ],
      colors,
      [0.48, 0.35, 0.24],
    );
    for (const x of panelX.slice(1, -1)) {
      appendBoxPrism(
        positions,
        [x - 0.0036, lowerChordTopY, minimumZ],
        [x + 0.0036, 0.42, maximumZ],
        colors,
        [0.24, 0.27, 0.27],
      );
    }
    for (let panel = 0; panel < panelX.length - 1; panel++) {
      const rises = panel % 2 === 0;
      appendWorldMetricBeamPrism(
        positions,
        { x: panelX[panel], y: rises ? lowerChordTopY : 0.42 },
        { x: panelX[panel + 1], y: rises ? 0.42 : lowerChordTopY },
        0.82,
        130,
        18,
        minimumZ,
        maximumZ,
        colors,
        panel % 2 === 0 ? [0.42, 0.31, 0.22] : [0.34, 0.30, 0.26],
      );
    }
  }
  // Portal beams join both truss faces at every panel node. Without them the two Warren faces
  // read as unrelated broken fences in a broadside view; these make the central span visibly
  // continuous and load-bearing while remaining inside the authored collision envelope.
  for (const x of panelX) {
    appendBoxPrism(
      positions,
      [x - 0.0036, 0.42, -0.42],
      [x + 0.0036, 0.49, 0.42],
      colors,
      [0.46, 0.34, 0.25],
    );
  }
  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_BRIDGE_DECK_TRUSS_GEOMETRY",
    { name: "color", itemSize: 3, values: colors },
  );
}

/**
 * Unit-normalized raised approach. The outer end sits on the high bank and the inner end meets
 * the truss roadway. A thin sloped deck, open support bents and joined guard girders preserve the
 * collision-backed length/height without drawing its entire 185 m length as a concrete retaining
 * wall. East uses the same geometry rotated 180°; composition supplies a narrower visual width.
 */
function bridgeApproachGeometry(THREE) {
  const positions = [];
  const colors = [];
  const bottomY = -0.5;
  const outerRoadY = -0.23333333333333334;
  const innerRoadY = 0.21333333333333337;
  const deckBottomOffset = 0.065;
  const roadHalfWidth = 0.30;
  const roadColor = [0.13, 0.15, 0.15];
  const edgeColor = [0.25, 0.28, 0.28];
  const supportColor = [0.38, 0.37, 0.33];
  const railColor = [0.40, 0.34, 0.26];
  const roadYAt = (x) => outerRoadY + (innerRoadY - outerRoadY) * (x + 0.5);

  // Thin, closed sloped road deck. It joins the bank and central span but leaves the valley and
  // fighting positions visible beneath and around it.
  const roadCorners = {
    outerLeftTop: { x: -0.5, y: outerRoadY, z: -roadHalfWidth },
    outerRightTop: { x: -0.5, y: outerRoadY, z: roadHalfWidth },
    innerLeftTop: { x: 0.5, y: innerRoadY, z: -roadHalfWidth },
    innerRightTop: { x: 0.5, y: innerRoadY, z: roadHalfWidth },
    outerLeftBottom: { x: -0.5, y: outerRoadY - deckBottomOffset, z: -roadHalfWidth },
    outerRightBottom: { x: -0.5, y: outerRoadY - deckBottomOffset, z: roadHalfWidth },
    innerLeftBottom: { x: 0.5, y: innerRoadY - deckBottomOffset, z: -roadHalfWidth },
    innerRightBottom: { x: 0.5, y: innerRoadY - deckBottomOffset, z: roadHalfWidth },
  };
  const appendQuad = (a, b, c, d, color) => {
    appendTriangle(positions, a, b, c, colors, color);
    appendTriangle(positions, a, c, d, colors, color);
  };
  appendQuad(
    roadCorners.outerLeftTop,
    roadCorners.innerLeftTop,
    roadCorners.innerRightTop,
    roadCorners.outerRightTop,
    roadColor,
  );
  appendQuad(
    roadCorners.outerLeftBottom,
    roadCorners.outerRightBottom,
    roadCorners.innerRightBottom,
    roadCorners.innerLeftBottom,
    edgeColor,
  );
  appendQuad(
    roadCorners.outerLeftBottom,
    roadCorners.innerLeftBottom,
    roadCorners.innerLeftTop,
    roadCorners.outerLeftTop,
    edgeColor,
  );
  appendQuad(
    roadCorners.outerRightBottom,
    roadCorners.outerRightTop,
    roadCorners.innerRightTop,
    roadCorners.innerRightBottom,
    edgeColor,
  );
  appendQuad(
    roadCorners.outerLeftBottom,
    roadCorners.outerLeftTop,
    roadCorners.outerRightTop,
    roadCorners.outerRightBottom,
    edgeColor,
  );
  appendQuad(
    roadCorners.innerLeftBottom,
    roadCorners.innerRightBottom,
    roadCorners.innerRightTop,
    roadCorners.innerLeftTop,
    edgeColor,
  );
  appendQuad(
    { x: -0.48, y: roadYAt(-0.48) + 0.006, z: -0.012 },
    { x: 0.48, y: roadYAt(0.48) + 0.006, z: -0.012 },
    { x: 0.48, y: roadYAt(0.48) + 0.006, z: 0.012 },
    { x: -0.48, y: roadYAt(-0.48) + 0.006, z: 0.012 },
    [0.58, 0.52, 0.36],
  );

  // Continuous open side trusses make both approaches visibly join the central span. Ground-to-
  // deck load paths belong to separate collision-backed pier instances below; nothing here hangs
  // a presentation-only support forty metres above the river floor.
  for (const side of [-1, 1]) {
    const minimumZ = side < 0 ? -0.5 : 0.43;
    const maximumZ = side < 0 ? -0.43 : 0.5;
    const lowerYAt = (x) => roadYAt(x) - (0.19 + (x + 0.5) * 0.055);
    appendWorldMetricBeamPrism(
      positions,
      { x: -0.47, y: outerRoadY - 0.005 },
      { x: 0.47, y: innerRoadY - 0.005 },
      0.72,
      185,
      12,
      minimumZ,
      maximumZ,
      colors,
      edgeColor,
    );
    appendWorldMetricBeamPrism(
      positions,
      { x: -0.47, y: lowerYAt(-0.47) },
      { x: 0.47, y: lowerYAt(0.47) },
      0.72,
      185,
      12,
      minimumZ,
      maximumZ,
      colors,
      supportColor,
    );
    appendWorldMetricBeamPrism(
      positions,
      { x: -0.47, y: outerRoadY + 0.24 },
      { x: 0.47, y: innerRoadY + 0.24 },
      0.46,
      185,
      12,
      minimumZ,
      maximumZ,
      colors,
      railColor,
    );
    const panelXs = [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45];
    for (const x of panelXs) {
      const baseY = roadYAt(x);
      appendBoxPrism(
        positions,
        [x - 0.0028, baseY, minimumZ],
        [x + 0.0028, Math.min(0.5, baseY + 0.25), maximumZ],
        colors,
        railColor,
      );
      appendBoxPrism(
        positions,
        [x - 0.0028, lowerYAt(x), minimumZ],
        [x + 0.0028, baseY, maximumZ],
        colors,
        supportColor,
      );
    }
    for (let panel = 0; panel < panelXs.length - 1; panel++) {
      const fromX = panelXs[panel];
      const toX = panelXs[panel + 1];
      const rises = panel % 2 === 0;
      appendWorldMetricBeamPrism(
        positions,
        {
          x: fromX,
          y: rises ? lowerYAt(fromX) : roadYAt(fromX),
        },
        {
          x: toX,
          y: rises ? roadYAt(toX) : lowerYAt(toX),
        },
        0.58,
        185,
        12,
        minimumZ,
        maximumZ,
        colors,
        railColor,
      );
    }
  }

  // Compact bank and truss abutments visually close the load path and retain the exact AABB
  // envelope without resurrecting the full-length wall.
  appendBoxPrism(
    positions,
    [-0.5, bottomY, -0.40],
    [-0.455, outerRoadY - deckBottomOffset, 0.40],
    colors,
    supportColor,
  );
  appendBoxPrism(
    positions,
    [0.455, bottomY, -0.40],
    [0.5, 0.5, 0.40],
    colors,
    supportColor,
  );
  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_BRIDGE_APPROACH_GEOMETRY",
    { name: "color", itemSize: 3, values: colors },
  );
}

/** Unit-normalized pier: faceted footing, tapered shaft and cap fill the collision envelope. */
function bridgePierGeometry(THREE) {
  const positions = [];
  const colors = [];
  appendCylinderFrustum(
    positions,
    colors,
    -0.5,
    -0.39,
    0.5,
    0.42,
    8,
    [0.25, 0.27, 0.27],
    [0.21, 0.23, 0.23],
  );
  appendCylinderFrustum(
    positions,
    colors,
    -0.39,
    0.37,
    0.31,
    0.24,
    8,
    [0.37, 0.37, 0.34],
    [0.43, 0.41, 0.36],
  );
  appendBoxPrism(
    positions,
    [-0.48, 0.37, -0.5],
    [0.48, 0.5, 0.5],
    colors,
    [0.48, 0.46, 0.40],
  );
  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_BRIDGE_PIER_GEOMETRY",
    { name: "color", itemSize: 3, values: colors },
  );
}

/**
 * Unit-normalized plantation water tower. The authored collision remains one AABB, but its
 * presentation is a four-legged, open-frame tower whose tank, rim and cap touch the exact unit
 * envelope. composeBox therefore preserves collision identity without drawing a 18 × 48 × 18 m
 * warning-coloured wall through the battle cell.
 */
function waterTowerGeometry(THREE) {
  const positions = [];
  const colors = [];
  const legColor = [0.24, 0.27, 0.23];
  const braceColor = [0.48, 0.34, 0.22];
  const tankColor = [0.42, 0.47, 0.37];
  const rimColor = [0.70, 0.49, 0.29];
  const capColor = [0.56, 0.43, 0.28];

  // Four independent legs leave the lower 70% of the collision envelope optically open.
  const legCentre = 0.34;
  const legHalfWidth = 0.04;
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const x = xSign * legCentre;
      const z = zSign * legCentre;
      appendBoxPrism(
        positions,
        [x - legHalfWidth, -0.5, z - legHalfWidth],
        [x + legHalfWidth, 0.22, z + legHalfWidth],
        colors,
        legColor,
      );
    }
  }

  // X-bracing on all four faces keeps the tower unmistakably structural from any approach.
  const braceInset = 0.34;
  const braceThickness = 0.045;
  const braceDepth = 0.024;
  for (const zSign of [-1, 1]) {
    const z = zSign * braceInset;
    appendOrientedBeamPrism(
      positions,
      { x: -braceInset, y: -0.42 },
      { x: braceInset, y: 0.14 },
      braceThickness,
      z - braceDepth,
      z + braceDepth,
      colors,
      braceColor,
    );
    appendOrientedBeamPrism(
      positions,
      { x: braceInset, y: -0.42 },
      { x: -braceInset, y: 0.14 },
      braceThickness,
      z - braceDepth,
      z + braceDepth,
      colors,
      braceColor,
    );
  }
  for (const xSign of [-1, 1]) {
    const x = xSign * braceInset;
    appendCrossBeamPrism(
      positions,
      { z: -braceInset, y: -0.42 },
      { z: braceInset, y: 0.14 },
      braceThickness,
      x - braceDepth,
      x + braceDepth,
      colors,
      braceColor,
    );
    appendCrossBeamPrism(
      positions,
      { z: braceInset, y: -0.42 },
      { z: -braceInset, y: 0.14 },
      braceThickness,
      x - braceDepth,
      x + braceDepth,
      colors,
      braceColor,
    );
  }

  // Sixteen facets read cylindrical at combat-view distance without spending a second material
  // batch. The projecting rim reaches ±0.5 in X/Z; the roof reaches +0.5 in Y, while leg feet
  // reach -0.5, so the visible normalized bounds remain identical to the authored AABB.
  const segments = 16;
  appendCylinderFrustum(
    positions, colors, 0.18, 0.25, 0.32, 0.44, segments, capColor, legColor,
  );
  appendCylinderFrustum(
    positions, colors, 0.25, 0.42, 0.44, 0.44, segments, tankColor, tankColor,
  );
  appendCylinderFrustum(
    positions, colors, 0.42, 0.5, 0.44, 0.10, segments, capColor, capColor,
  );
  appendCylinderFrustum(
    positions, colors, 0.225, 0.275, 0.5, 0.5, segments, rimColor, rimColor,
  );

  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_WATER_TOWER_GEOMETRY",
    { name: "color", itemSize: 3, values: colors },
  );
}

/**
 * Low, terrain-seated worked rows inside the Plantation objective clearing. Full plantation-tree
 * instances stay outside the 235 m battle eye so authority-backed formations remain visible;
 * these flat furrow/crop strips restore the identity of cultivated ground without becoming
 * cover, floating leaf cards, or another live-combat claim.
 */
function plantationGroundGeometry(THREE, plan) {
  const landmark = (plan?.landmarks ?? []).find((record) =>
    recordId(record, "") === "landmark.cobra-canyon.plantation-water-tower.v1");
  const point = pointFrom(landmark);
  if (!point) return null;
  const positions = [];
  const colors = [];
  const routePoint = nearestRoutePoint(plan, landmark.id, point.x, point.z);
  const tangentLengthM = Math.hypot(routePoint?.tangentX ?? 0, routePoint?.tangentZ ?? 0);
  if (tangentLengthM < 0.001) return null;
  const tangentX = routePoint.tangentX / tangentLengthM;
  const tangentZ = routePoint.tangentZ / tangentLengthM;
  const normalX = -tangentZ;
  const normalZ = tangentX;
  const darkFurrow = [0.115, 0.055, 0.022];
  const laterite = [0.34, 0.16, 0.052];
  const clippedStubble = [0.29, 0.37, 0.085];
  const heightOffsetM = 0.18;
  const worldPoint = (alongM, acrossM) => ({
    x: point.x + tangentX * alongM + normalX * acrossM,
    z: point.z + tangentZ * alongM + normalZ * acrossM,
  });
  const appendBand = (along0M, along1M, across0M, across1M, color) => {
    const p0 = worldPoint(along0M, across0M);
    const p1 = worldPoint(along1M, across0M);
    const p2 = worldPoint(along1M, across1M);
    const p3 = worldPoint(along0M, across1M);
    const yAt = (x, z) => sampleCobraCanyonTerrain(plan, x, -z) + heightOffsetM;
    const a = { ...p0, y: yAt(p0.x, p0.z) };
    const b = { ...p1, y: yAt(p1.x, p1.z) };
    const c = { ...p2, y: yAt(p2.x, p2.z) };
    const d = { ...p3, y: yAt(p3.x, p3.z) };
    // The material is intentionally FrontSide. Keep the tessellation counter-clockwise from the
    // player-above-ground view so the cultivated surface is rendered instead of back-face culled.
    appendTriangle(positions, a, c, b, colors, color);
    appendTriangle(positions, a, d, c, colors, color);
  };
  const halfRowWidthM = 2.6;
  const halfParcelLengthM = 170;
  const yardHalfLengthM = 60;
  const yardHalfWidthM = 50;
  for (let row = -145, rowIndex = 0; row <= 145; row += 10, rowIndex++) {
    const spans = Math.abs(row) <= yardHalfWidthM + halfRowWidthM
      ? [[-halfParcelLengthM, -yardHalfLengthM], [yardHalfLengthM, halfParcelLengthM]]
      : [[-halfParcelLengthM, halfParcelLengthM]];
    const color = rowIndex % 7 === 0
      ? clippedStubble
      : rowIndex % 3 === 0 ? laterite : darkFurrow;
    for (const [spanStartM, spanEndM] of spans) {
      const segmentCount = Math.ceil((spanEndM - spanStartM) / 20);
      for (let segment = 0; segment < segmentCount; segment++) {
        const along0M = spanStartM
          + (spanEndM - spanStartM) * segment / segmentCount;
        const along1M = spanStartM
          + (spanEndM - spanStartM) * (segment + 1) / segmentCount;
        appendBand(
          along0M,
          along1M,
          row - halfRowWidthM,
          row + halfRowWidthM,
          color,
        );
      }
    }
  }
  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_PLANTATION_WORKED_ROWS_GEOMETRY",
    { name: "color", itemSize: 3, values: colors },
  );
}

function appendRibbon(positions, points, widthM, yOffsetM) {
  const halfWidthM = Math.max(0.05, widthM * 0.5);
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const lengthM = Math.hypot(deltaX, deltaZ);
    if (lengthM <= 0.001) continue;
    const offsetX = -deltaZ / lengthM * halfWidthM;
    const offsetZ = deltaX / lengthM * halfWidthM;
    const a = { x: from.x + offsetX, y: from.y + yOffsetM, z: from.z + offsetZ };
    const b = { x: from.x - offsetX, y: from.y + yOffsetM, z: from.z - offsetZ };
    const c = { x: to.x - offsetX, y: to.y + yOffsetM, z: to.z - offsetZ };
    const d = { x: to.x + offsetX, y: to.y + yOffsetM, z: to.z + offsetZ };
    appendTriangle(positions, a, b, c);
    appendTriangle(positions, a, c, d);
  }
}

function geometryFromPositions(THREE, positions, name, vertexField = null) {
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (vertexField && vertexField.values.length === positions.length / 3 * vertexField.itemSize) {
    geometry.setAttribute(
      vertexField.name,
      new THREE.Float32BufferAttribute(vertexField.values, vertexField.itemSize),
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryTriangles(geometry) {
  if (!geometry) return 0;
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3);
}

// Which world roles put geometry BETWEEN the sun and the ground. Render-architecture stage 0
// turned the shadow pass on; this is the list of things worth paying a second rasterisation of.
//
// The basin is on it and it is the important one: a 300 m gorge wall under a 16-degree sun lays a
// ~1 km shadow across the valley floor, which is the cue the canyon has been missing (the tone
// ramp can only shade a face by its own normal — see terrain_legibility diagnosis). It costs one
// extra draw call in the light view for the whole 46 k-triangle mesh.
//
// Off the list: the river (a flat sheet at ground level — it can only shadow-acne itself), the
// roads (a decal on the surface, same problem), the hero-cell markers (transparent authority
// cues, not world objects) and the group itself.
const SHADOW_CASTING_ROLES = Object.freeze(new Set([
  "basin",
  "landmarks",
  "hazards",
  "water-tower",
  "bridge-deck",
  "bridge-approach",
  "bridge-pier",
  "vegetation",
]));

function tagObject(object, role, extra = {}) {
  object.userData.cobraCanyon = Object.freeze({
    schema: COBRA_CANYON_PRESENTATION_SCHEMA,
    role,
    ...PRESENTATION_TAG,
    ...extra,
  });
  object.castShadow = SHADOW_CASTING_ROLES.has(role);
  object.receiveShadow = true;
  object.matrixAutoUpdate = false;
  object.updateMatrix();
  return object;
}

function materialFor(THREE, role) {
  // The basin and the river run the painted-tactical surface shaders: hillshade, hue-separated
  // key/fill, enclosure occlusion and banded aerial haze are computed per FRAGMENT, because the
  // 100 m basin vertex spacing cannot carry a field edge, a canopy line or a 77 m shoreline —
  // baking those into vertex colours interpolates them away, which is the Build 264 monotone and
  // the sand-coloured river of the parked WIP. Scene lights deliberately do not touch either.
  if (role === "basin") return createCobraCanyonBasinMaterial(THREE, COBRA_CANYON_VISUAL_PROFILE);
  if (role === "river") return createCobraCanyonRiverMaterial(THREE, COBRA_CANYON_VISUAL_PROFILE);
  const parameters = {
    // Laterite dirt, not warning tape: the road must read as ground the FOB's laterite
    // apron belongs to (owner 2026-08-12: "what's this red line?"). No emissive — a road
    // does not glow. The full width/texture/soft-edge treatment is the corridor-scenery
    // slice; this keeps the ribbon honest until then.
    roads: { color: 0x7d5638, roughness: 1 },
    // Authored combat cells are scorched earth, not a nearly invisible brown selection decal.
    // Their geometry carries a soot-centre / laterite-rim gradient; white here preserves it.
    heroCells: { color: 0xffffff, roughness: 1, vertexColors: true },
    landmarks: { color: 0xffffff, roughness: 0.95 },
    "plantation-ground": {
      color: 0xffffff,
      roughness: 1,
      vertexColors: true,
    },
    hazards: { color: 0xe96a43, emissive: 0x411006, roughness: 0.8 },
    // Authored sage tank, weathered ochre rim and dark steel frame all share one vertex-coloured
    // batch. This remains an AABB-backed hazard cue, but no longer reads as a warning-red wall.
    "water-tower": {
      color: 0xffffff,
      emissive: 0x10140e,
      roughness: 0.94,
      vertexColors: true,
    },
    // Weathered steel over jungle green — Iron Bell should read as the fight site, not an
    // orange hazard box that matches every other collision marker.
    "bridge-deck": {
      color: 0xffffff,
      emissive: 0x211307,
      roughness: 0.9,
      vertexColors: true,
    },
    "bridge-approach": {
      color: 0xffffff,
      emissive: 0x11110f,
      roughness: 0.96,
      vertexColors: true,
    },
    "bridge-pier": {
      color: 0xffffff,
      emissive: 0x12110e,
      roughness: 0.94,
      vertexColors: true,
    },
    vegetation: { color: 0xffffff, roughness: 1 },
  }[role];
  // Soft normals on landmarks/bridges/vegetation — flat boxes read as crystal shards at nap AGL.
  // Hazards and roads keep hard facets so collision cues stay readable.
  const flatShading = role !== "heroCells"
    && role !== "landmarks"
    && role !== "vegetation"
    && role !== "water-tower"
    && role !== "bridge-deck"
    && role !== "bridge-approach"
    && role !== "bridge-pier";
  const side = role === "roads" ? THREE.DoubleSide : THREE.FrontSide;
  // Authored structures get procedural surface detail. Without it the bridge deck — most of
  // the screen on a nap-of-the-earth pass — is one flat fill sitting on a five-octave
  // terrain, which is the whole reason the corridor read as cardboard.
  const material = role in COBRA_STRUCTURE_SURFACES
      || role === "water-tower"
      || role === "bridge-approach"
    ? createCobraStructureMaterial(THREE, role, {
      color: parameters.color,
      emissive: parameters.emissive ?? 0x000000,
      flatShading,
      side,
      vertexColors: parameters.vertexColors === true,
    })
    : new THREE.MeshLambertMaterial({
      color: parameters.color,
      emissive: parameters.emissive ?? 0x000000,
      flatShading,
      side,
      vertexColors: parameters.vertexColors === true,
    });
  if (role === "heroCells") {
    material.transparent = true;
    material.opacity = 0.30;
    material.depthWrite = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
  }
  if (role === "roads") {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -2;
  }
  if (role === "plantation-ground") {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
  }
  material.name = `COBRA_CANYON_${String(role).toUpperCase().replaceAll("-", "_")}_MATERIAL`;
  return material;
}

function addStaticMesh(THREE, group, role, geometry, resources, metrics) {
  if (!geometry) return null;
  const material = materialFor(THREE, role);
  const mesh = tagObject(
    new THREE.Mesh(geometry, material),
    role,
    { ambient: false, hazardCue: role === "hazards" },
  );
  mesh.name = `COBRA_CANYON_${role.toUpperCase()}`;
  resources.geometries.add(geometry);
  resources.materials.add(material);
  resources.meshes.push(mesh);
  metrics.drawCalls += 1;
  metrics.triangles += geometryTriangles(geometry);
  metrics.roleTriangles[role] = geometryTriangles(geometry);
  group.add(mesh);
  return mesh;
}

function addInstancedMesh(
  THREE,
  group,
  role,
  geometry,
  placements,
  resources,
  metrics,
  writeMatrix,
  options = {},
) {
  if (!placements.length) {
    geometry.dispose();
    return null;
  }
  const material = materialFor(THREE, role);
  const mesh = tagObject(
    new THREE.InstancedMesh(geometry, material, placements.length),
    role,
    {
      ambient: options.ambient === true,
      hazardCue: options.hazardCue === true,
      instances: placements.length,
    },
  );
  mesh.name = `COBRA_CANYON_${role.toUpperCase()}_INSTANCES`;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const work = {
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    yAxis: new THREE.Vector3(0, 1, 0),
  };
  for (let index = 0; index < placements.length; index++) {
    writeMatrix(mesh, index, placements[index], work);
  }
  mesh.instanceMatrix.needsUpdate = true;
  // Avoid Three.js discovering the complete instance bound by walking every matrix on the first
  // visible frame. All matrices are immutable after construction, so pay that scan here once.
  if (typeof mesh.computeBoundingSphere === "function") mesh.computeBoundingSphere();
  if (options.hazardCue === true) {
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
  }
  resources.geometries.add(geometry);
  resources.materials.add(material);
  resources.meshes.push(mesh);
  const unitTriangles = geometryTriangles(geometry);
  metrics.drawCalls += 1;
  metrics.instances += placements.length;
  metrics.triangles += unitTriangles * placements.length;
  metrics.roleInstances[role] = placements.length;
  metrics.roleTriangles[role] = unitTriangles * placements.length;
  group.add(mesh);
  return mesh;
}

function composeBox(mesh, index, placement, work) {
  work.position.set(placement.x, placement.y, placement.z);
  work.quaternion.setFromAxisAngle(work.yAxis, placement.yaw);
  work.scale.set(placement.widthM, placement.heightM, placement.depthM);
  work.matrix.compose(work.position, work.quaternion, work.scale);
  mesh.setMatrixAt(index, work.matrix);
}

// Collision owns a conservative 32 m-wide crossing envelope. Rendering that envelope literally
// turned a two-lane bridge into a motorway and stretched every side member/pier across the gorge.
// Keep the same authoritative centre/length/height while using credible visible widths.
function composeBridgeDeck(mesh, index, placement, work) {
  work.position.set(placement.x, placement.y, placement.z);
  work.quaternion.setFromAxisAngle(work.yAxis, placement.yaw);
  work.scale.set(placement.widthM, placement.heightM, Math.min(12, placement.depthM));
  work.matrix.compose(work.position, work.quaternion, work.scale);
  mesh.setMatrixAt(index, work.matrix);
}

function composeBridgeApproach(mesh, index, placement, work) {
  composeBridgeDeck(mesh, index, placement, work);
}

function composeBridgePier(mesh, index, placement, work) {
  work.position.set(placement.x, placement.y, placement.z);
  work.quaternion.setFromAxisAngle(work.yAxis, placement.yaw);
  work.scale.set(
    Math.min(8, placement.widthM),
    placement.heightM,
    Math.min(8, placement.depthM),
  );
  work.matrix.compose(work.position, work.quaternion, work.scale);
  mesh.setMatrixAt(index, work.matrix);
}

function composeSegment(mesh, index, placement, work) {
  work.direction.set(
    placement.to.x - placement.from.x,
    placement.to.y - placement.from.y,
    placement.to.z - placement.from.z,
  );
  const lengthM = Math.max(0.001, work.direction.length());
  work.position.set(
    (placement.from.x + placement.to.x) * 0.5,
    (placement.from.y + placement.to.y) * 0.5,
    (placement.from.z + placement.to.z) * 0.5,
  );
  work.quaternion.setFromUnitVectors(work.yAxis, work.direction.multiplyScalar(1 / lengthM));
  work.scale.set(placement.widthM, lengthM, placement.depthM);
  work.matrix.compose(work.position, work.quaternion, work.scale);
  mesh.setMatrixAt(index, work.matrix);
}

function composeHazard(mesh, index, placement, work) {
  if (placement.from && placement.to) composeSegment(mesh, index, placement, work);
  else composeBox(mesh, index, placement, work);
}

/**
 * The height a basin VERTEX is emitted at: the analytic sample, pulled down to the lowest analytic
 * sample in the vertex's own half-cell.
 *
 * PRESENTATION MUST NOT OUTRUN THE KERNEL, and here it is the ground itself that was outrunning it.
 * The gorge cross-section drops ~250 m across a 190 m blend; on a 133 m render grid a quad can span
 * the whole convex rim, and the chord across a convex surface sits ABOVE it. Measured on the plain
 * analytic sample the rendered basin stood up to 51 m (desktop) / 106 m (mobile) proud of the field
 * `CobraCanyonTerrainSurface` flies the aircraft over — 20 m of that on the ridge-shadow route
 * itself, which is half its recommended AGL band. The helicopter would fly into a hill the sim does
 * not have. Biasing every vertex to its neighbourhood minimum makes the chord conservative: the
 * drawn ground sits at or below simulated ground, so the error can only ever show the pilot MORE
 * clearance than exists, never less. It costs five analytic samples per vertex at build time.
 * Camp Ember adds dedicated local axes because its 380 m level bench and 600 m blend cannot fit
 * inside a 105–174 m cell. The rings keep triangles which cross the circular blend edge
 * within 0.3 m of contact height; the rest of the world retains its authored tier resolution.
 * Crests pay for the minimum bias by shaving, which is the correct side to lose on.
 */
const CAMP_EMBER_GRID_OFFSETS_M = Object.freeze([
  -COBRA_CANYON_CAMP_EMBER_APRON.blendRadiusM,
  -260,
  -220,
  -200,
  -194,
  -COBRA_CANYON_CAMP_EMBER_APRON.levelRadiusM,
  -186,
  -180,
  -160,
  -120,
  -80,
  -40,
  0,
  40,
  80,
  120,
  160,
  180,
  186,
  COBRA_CANYON_CAMP_EMBER_APRON.levelRadiusM,
  194,
  200,
  220,
  260,
  COBRA_CANYON_CAMP_EMBER_APRON.blendRadiusM,
]);
// The global balanced mesh is intentionally sparse over the 16 km theatre, but the player fights
// on three much smaller authored cells. Refining only those axes removes the 133 m triangular
// facets visible behind units without turning the whole basin into a uniform high-resolution
// grid. These are presentation samples; collision remains the analytic terrain authority.
const BATTLE_CELL_GRID_OFFSETS_M = Object.freeze({
  mobile: Object.freeze([-180, 0, 180]),
  balanced: Object.freeze([-240, -180, -120, -80, -40, 0, 40, 80, 120, 180, 240]),
  desktop: Object.freeze([-240, -180, -120, -90, -60, -30, 0, 30, 60, 90, 120, 180, 240]),
});
const BATTLE_OBJECTIVE_LANDMARK_IDS = new Set([
  "landmark.cobra-canyon.iron-bell-bridge.v1",
  "landmark.cobra-canyon.plantation-water-tower.v1",
  "landmark.cobra-canyon.red-earth-quarry.v1",
]);
const BATTLE_OBJECTIVE_TERRAIN_RADIUS_M = 260;
const BASIN_GRID_CACHE = new WeakMap();

function battleTerrainFoci(plan) {
  const cellFoci = sortedRecords(plan.cells ?? plan.heroCells ?? [], "hero-cell")
    .map((cell) => ({
      center: pointFrom(cell.terrainPatch?.centerLocalM ?? cell),
      radiusM: Math.max(1, finite(cell.terrainPatch?.radiusM, 1)),
      kind: "battle-cell",
    }))
    .filter((focus) => focus.center);
  const objectiveFoci = sortedRecords(plan.landmarks ?? [], "landmark")
    .filter((landmark) => BATTLE_OBJECTIVE_LANDMARK_IDS.has(recordId(landmark, "")))
    .map((landmark) => ({
      center: pointFrom(landmark),
      radiusM: BATTLE_OBJECTIVE_TERRAIN_RADIUS_M,
      kind: "objective",
    }))
    .filter((focus) => focus.center);
  return [...cellFoci, ...objectiveFoci];
}

function refinedBasinAxis(
  minimumM,
  maximumM,
  segments,
  campFocusM,
  battleFocusM,
  battleOffsetsM,
) {
  const stepM = (maximumM - minimumM) / segments;
  const values = Array.from(
    { length: segments + 1 },
    (_, index) => minimumM + index * stepM,
  );
  for (const offsetM of CAMP_EMBER_GRID_OFFSETS_M) {
    const valueM = campFocusM + offsetM;
    if (valueM > minimumM && valueM < maximumM) values.push(valueM);
  }
  for (const focus of battleFocusM) {
    const focusM = typeof focus === "number" ? focus : Number(focus?.valueM);
    const offsetsM = Array.isArray(focus?.offsetsM) ? focus.offsetsM : battleOffsetsM;
    if (!Number.isFinite(focusM)) continue;
    for (const offsetM of offsetsM) {
      const valueM = focusM + offsetM;
      if (valueM > minimumM && valueM < maximumM) values.push(valueM);
    }
  }
  values.sort((left, right) => left - right);
  return Object.freeze(values.filter(
    (value, index) => index === 0 || Math.abs(value - values[index - 1]) > 1e-6,
  ));
}

function basinGrid(plan, qualityTier) {
  let byTier = BASIN_GRID_CACHE.get(plan);
  if (!byTier) {
    byTier = new Map();
    BASIN_GRID_CACHE.set(plan, byTier);
  }
  if (byTier.has(qualityTier)) return byTier.get(qualityTier);
  const bounds = boundsFrom(plan);
  const segments = COBRA_CANYON_TERRAIN_SEGMENTS[qualityTier];
  if (!bounds || !segments) throw new TypeError(`Unknown Cobra Canyon quality tier: ${qualityTier}.`);
  const eastStepM = (bounds.maximumEastM - bounds.minimumEastM) / segments;
  const northStepM = (bounds.maximumNorthM - bounds.minimumNorthM) / segments;
  const battleFoci = battleTerrainFoci(plan);
  // Refine each real east/north focus on its matching axis. The Cartesian grid still intersects
  // every battle point, while avoiding the old wasteful practice of treating northings as eastings.
  // That recovered topology budget funds the exact gun-pit/point centres, not unrelated strips.
  const battleOffsetsM = BATTLE_CELL_GRID_OFFSETS_M[qualityTier] ?? [];
  // Hero cells own their local refinement. Objective landmarks need one exact crossing only;
  // applying every ring offset to each global east and north axis forms a Cartesian grid far
  // beyond the objective and roughly doubles synchronous basin construction.
  const focusOffsets = (focus) => focus.kind === "objective" ? [0] : battleOffsetsM;
  const battleFocusEastM = battleFoci.map((focus) => ({
    valueM: focus.center.x,
    offsetsM: focusOffsets(focus),
  }));
  const battleFocusNorthM = battleFoci.map((focus) => ({
    valueM: -focus.center.z,
    offsetsM: focusOffsets(focus),
  }));
  const grid = Object.freeze({
    bounds,
    segments,
    eastStepM,
    northStepM,
    eastAxis: refinedBasinAxis(
      bounds.minimumEastM,
      bounds.maximumEastM,
      segments,
      COBRA_CANYON_CAMP_EMBER_APRON.eastM,
      battleFocusEastM,
      battleOffsetsM,
    ),
    northAxis: refinedBasinAxis(
      bounds.minimumNorthM,
      bounds.maximumNorthM,
      segments,
      COBRA_CANYON_CAMP_EMBER_APRON.northM,
      battleFocusNorthM,
      battleOffsetsM,
    ),
  });
  byTier.set(qualityTier, grid);
  return grid;
}

function basinAxisCell(axis, valueM) {
  let low = 0;
  let high = axis.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (axis[middle] <= valueM) low = middle;
    else high = middle;
  }
  return clamp(low, 0, axis.length - 2);
}

/**
 * Depth of the presentation-only dish cut under Camp Ember, feathered on the SAME ramp the
 * apron flattens on so no step appears at the blend edge. See CAMP_EMBER_DRAWN_RECESS_M for
 * why the camp's ground stack had to gain real thickness.
 */
function campEmberDrawnRecessM(eastM, northM) {
  const distanceM = Math.hypot(
    eastM - COBRA_CANYON_CAMP_EMBER_APRON.eastM,
    northM - COBRA_CANYON_CAMP_EMBER_APRON.northM,
  );
  const blend = 1 - smoothstep(
    COBRA_CANYON_CAMP_EMBER_APRON.levelRadiusM,
    COBRA_CANYON_CAMP_EMBER_APRON.blendRadiusM,
    distanceM,
  );
  return blend > 0 ? CAMP_EMBER_DRAWN_RECESS_M * blend : 0;
}

function basinVertexHeight(
  plan,
  eastM,
  northM,
  eastStepM,
  northStepM,
) {
  const biasEastM = eastStepM * 0.42;
  const biasNorthM = northStepM * 0.42;
  const conservativeHeightM = Math.min(
    sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM, northM),
    sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM - biasEastM, northM),
    sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM + biasEastM, northM),
    sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM, northM - biasNorthM),
    sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM, northM + biasNorthM),
  );
  // Camp flatten/blend MUST be last. Biasing samples which already contain the flat apron lets a
  // 105–174 m half-cell reach across the blend and pull 8–25 m pits into rendered triangles at
  // spawn. Applying the shared apron operation to the conservative PRE-apron field preserves the
  // no-overshoot contract while emitting an actually flat contact surface in every tier.
  const apronHeightM = applyCobraCanyonCampEmberApron(
    plan,
    eastM,
    northM,
    conservativeHeightM,
  );
  return apronHeightM - campEmberDrawnRecessM(eastM, northM);
}

function basinGeometry(THREE, plan, qualityTier) {
  const positions = [];
  const concavity = [];
  const battleInfluence = [];
  const indices = [];
  const grid = basinGrid(plan, qualityTier);
  const columnCount = grid.eastAxis.length;
  const rowCount = grid.northAxis.length;
  const heights = new Float32Array(columnCount * rowCount);
  for (let northIndex = 0; northIndex < rowCount; northIndex++) {
    const northM = grid.northAxis[northIndex];
    for (let eastIndex = 0; eastIndex < columnCount; eastIndex++) {
      heights[northIndex * columnCount + eastIndex] = basinVertexHeight(
        plan,
        grid.eastAxis[eastIndex],
        northM,
        grid.eastStepM,
        grid.northStepM,
      );
    }
  }
  const heightAt = (eastIndex, northIndex) => heights[
    clamp(northIndex, 0, rowCount - 1) * columnCount
      + clamp(eastIndex, 0, columnCount - 1)
  ];
  const paint = COBRA_CANYON_VISUAL_PROFILE.terrainPaint;
  const battleCells = battleTerrainFoci(plan);
  for (let northIndex = 0; northIndex < rowCount; northIndex++) {
    const northM = grid.northAxis[northIndex];
    for (let eastIndex = 0; eastIndex < columnCount; eastIndex++) {
      const eastM = grid.eastAxis[eastIndex];
      const elevationM = heights[northIndex * columnCount + eastIndex];
      positions.push(eastM, elevationM, -northM);
      // Enclosure term (korea_terrain's baked `concavity` attribute): a two-cell ring mean says
      // whether this vertex sits below its neighbourhood — a valley to darken — or above it — a
      // crest to let catch light. This is one of two basin inputs a fragment cannot re-derive:
      // concavity needs the height field, while battle influence below needs the authored plan.
      // Landcover, surface grain and light remain per-pixel in cobra_canyon_terrain_material.js.
      const ringMeanM = (
        heightAt(eastIndex - 2, northIndex)
        + heightAt(eastIndex + 2, northIndex)
        + heightAt(eastIndex, northIndex - 2)
        + heightAt(eastIndex, northIndex + 2)
      ) * 0.25;
      concavity.push(clamp(
        0.5 + (elevationM - ringMeanM) / (2 * paint.concavityNormalizerM),
        0,
        1,
      ));
      let authoredBattleInfluence = 0;
      for (const cell of battleCells) {
        const distanceM = Math.hypot(eastM - cell.center.x, -northM - cell.center.z);
        authoredBattleInfluence = Math.max(
          authoredBattleInfluence,
          1 - smoothstep(cell.radiusM * 0.12, cell.radiusM * 0.82, distanceM),
        );
      }
      battleInfluence.push(authoredBattleInfluence);
    }
  }
  for (let northIndex = 0; northIndex < rowCount - 1; northIndex++) {
    for (let eastIndex = 0; eastIndex < columnCount - 1; eastIndex++) {
      const northWest = northIndex * columnCount + eastIndex;
      const northEast = northWest + 1;
      const southWest = northWest + columnCount;
      const southEast = southWest + 1;
      indices.push(northWest, northEast, southEast, northWest, southEast, southWest);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "COBRA_CANYON_BASIN_GEOMETRY";
  geometry.userData.cobraBasinGrid = Object.freeze({ columnCount, rowCount });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("concavity", new THREE.Float32BufferAttribute(concavity, 1));
  geometry.setAttribute(
    "battleInfluence",
    new THREE.Float32BufferAttribute(battleInfluence, 1),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function heroCellGeometry(THREE, plan) {
  const positions = [];
  const colors = [];
  for (const cell of sortedRecords(plan.cells ?? plan.heroCells ?? [], "hero-cell")) {
    const patch = cell.terrainPatch;
    const center = pointFrom(patch?.centerLocalM);
    if (!patch || !center) continue;
    const seed = hashString(cell.id);
    // Compact irregular scorch marks give each AUTHORED battle cell history without cutting a
    // black tabletop crater into the current fight. They remain terrain-hugging and subdued; live
    // authority events, not these static marks, must own the battle read.
    for (let scar = 0; scar < 4; scar++) {
      const scarSeed = mixedUint32(seed ^ Math.imul(scar + 1, 0x9e3779b1));
      const bearing = seededUnit(scarSeed, 0xa511e9b3) * Math.PI * 2;
      const offsetM = patch.radiusM * (0.07 + seededUnit(scarSeed, 0x63d83595) * 0.27);
      const scarEastM = center.x + Math.cos(bearing) * offsetM;
      const scarNorthM = -center.z + Math.sin(bearing) * offsetM;
      const radiusEastM = patch.radiusM * (0.012 + seededUnit(scarSeed, 0xc2b2ae35) * 0.016);
      const radiusNorthM = patch.radiusM * (0.010 + seededUnit(scarSeed, 0x27d4eb2f) * 0.014);
      const scarYaw = seededUnit(scarSeed, 0x85ebca6b) * Math.PI;
      const cosYaw = Math.cos(scarYaw);
      const sinYaw = Math.sin(scarYaw);
      const scarCenter = {
        x: scarEastM,
        y: sampleCobraCanyonTerrain(plan, scarEastM, scarNorthM) + 0.38,
        z: -scarNorthM,
      };
      const sides = 14;
      const outer = [];
      const inner = [];
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const irregularity = 0.83 + seededUnit(scarSeed, 0x165667b1 ^ side) * 0.30;
        const ellipseEastM = Math.cos(angle) * radiusEastM * irregularity;
        const ellipseNorthM = Math.sin(angle) * radiusNorthM * irregularity;
        const eastOffsetM = ellipseEastM * cosYaw - ellipseNorthM * sinYaw;
        const northOffsetM = ellipseEastM * sinYaw + ellipseNorthM * cosYaw;
        const outerEastM = scarEastM + eastOffsetM;
        const outerNorthM = scarNorthM + northOffsetM;
        const innerEastM = scarEastM + eastOffsetM * 0.54;
        const innerNorthM = scarNorthM + northOffsetM * 0.54;
        outer.push({
          x: outerEastM,
          y: sampleCobraCanyonTerrain(plan, outerEastM, outerNorthM) + 0.38,
          z: -outerNorthM,
        });
        inner.push({
          x: innerEastM,
          y: sampleCobraCanyonTerrain(plan, innerEastM, innerNorthM) + 0.39,
          z: -innerNorthM,
        });
      }
      const rimVariation = seededUnit(scarSeed, 0xd3a2646c);
      // Wet laterite and charcoal, not emissive orange decals. The scars must survive foliage
      // grain while remaining part of the ground plane when a low battle camera passes nearby.
      const rimColor = [0.18 + rimVariation * 0.08, 0.070 + rimVariation * 0.035, 0.030];
      const sootEdge = [0.060, 0.042, 0.028];
      const sootCenter = [0.038, 0.028, 0.020];
      for (let side = 0; side < sides; side++) {
        const next = (side + 1) % sides;
        appendColoredTriangle(
          positions,
          colors,
          outer[side],
          outer[next],
          inner[next],
          rimColor,
          rimColor,
          sootEdge,
        );
        appendColoredTriangle(
          positions,
          colors,
          outer[side],
          inner[next],
          inner[side],
          rimColor,
          sootEdge,
          sootEdge,
        );
        appendColoredTriangle(
          positions,
          colors,
          scarCenter,
          inner[side],
          inner[next],
          sootCenter,
          sootEdge,
          sootEdge,
        );
      }
    }
  }
  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_HERO_CELLS_GEOMETRY",
    { name: "color", itemSize: 3, values: colors },
  );
}

/**
 * Samples the actual triangle plane emitted by `basinGeometry`. This is presentation geometry,
 * not analytical terrain or collision authority; it exists so thin overlays cannot disappear
 * under a coarse render triangle between authoritative samples.
 */
export function sampleCobraCanyonRenderedBasinHeight(
  plan,
  qualityTier,
  eastM,
  northM,
) {
  const grid = basinGrid(plan, qualityTier);
  const { bounds } = grid;
  const east = clamp(finite(eastM), bounds.minimumEastM, bounds.maximumEastM);
  const north = clamp(finite(northM), bounds.minimumNorthM, bounds.maximumNorthM);
  const eastCell = basinAxisCell(grid.eastAxis, east);
  const northCell = basinAxisCell(grid.northAxis, north);
  const east0 = grid.eastAxis[eastCell];
  const east1 = grid.eastAxis[eastCell + 1];
  const north0 = grid.northAxis[northCell];
  const north1 = grid.northAxis[northCell + 1];
  const eastBlend = clamp((east - east0) / (east1 - east0), 0, 1);
  const northBlend = clamp((north - north0) / (north1 - north0), 0, 1);
  const corner = (eastM, northM) =>
    Math.fround(basinVertexHeight(
      plan,
      eastM,
      northM,
      grid.eastStepM,
      grid.northStepM,
    ));
  const northWest = corner(east0, north0);
  const northEast = corner(east1, north0);
  const southWest = corner(east0, north1);
  const southEast = corner(east1, north1);
  if (eastBlend >= northBlend) {
    return northWest
      + eastBlend * (northEast - northWest)
      + northBlend * (southEast - northEast);
  }
  return northWest
    + eastBlend * (southEast - southWest)
    + northBlend * (southWest - northWest);
}

function clipPolygonToTriangle(polygon, triangle) {
  let output = polygon;
  for (let edgeIndex = 0; edgeIndex < 3 && output.length; edgeIndex++) {
    const edgeFrom = triangle[edgeIndex];
    const edgeTo = triangle[(edgeIndex + 1) % 3];
    const edgeEastM = edgeTo.eastM - edgeFrom.eastM;
    const edgeNorthM = edgeTo.northM - edgeFrom.northM;
    const signedDistance = (point) => edgeEastM * (point.northM - edgeFrom.northM)
      - edgeNorthM * (point.eastM - edgeFrom.eastM);
    const input = output;
    output = [];
    let previous = input[input.length - 1];
    let previousDistance = signedDistance(previous);
    for (const current of input) {
      const currentDistance = signedDistance(current);
      const previousInside = previousDistance >= -1e-7;
      const currentInside = currentDistance >= -1e-7;
      if (previousInside !== currentInside) {
        const denominator = previousDistance - currentDistance;
        const blend = Math.abs(denominator) > 1e-12 ? previousDistance / denominator : 0;
        output.push({
          eastM: previous.eastM + (current.eastM - previous.eastM) * blend,
          northM: previous.northM + (current.northM - previous.northM) * blend,
        });
      }
      if (currentInside) output.push(current);
      previous = current;
      previousDistance = currentDistance;
    }
  }
  if (output.length < 3) return [];
  const deduplicated = [];
  for (const point of output) {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && Math.hypot(point.eastM - previous.eastM, point.northM - previous.northM) < 1e-5) {
      continue;
    }
    deduplicated.push(point);
  }
  if (deduplicated.length > 2) {
    const first = deduplicated[0];
    const last = deduplicated[deduplicated.length - 1];
    if (Math.hypot(first.eastM - last.eastM, first.northM - last.northM) < 1e-5) {
      deduplicated.pop();
    }
  }
  let doubledArea = 0;
  for (let index = 0; index < deduplicated.length; index++) {
    const from = deduplicated[index];
    const to = deduplicated[(index + 1) % deduplicated.length];
    doubledArea += from.eastM * to.northM - to.eastM * from.northM;
  }
  return Math.abs(doubledArea) > 1e-4 ? deduplicated : [];
}

function appendGridClippedPolygon(
  positions,
  plan,
  qualityTier,
  polygon,
  yOffsetM,
  fieldValues,
  fieldAt,
) {
  const grid = basinGrid(plan, qualityTier);
  const eastValues = polygon.map((point) => point.eastM);
  const northValues = polygon.map((point) => point.northM);
  const minimumEastCell = basinAxisCell(grid.eastAxis, Math.min(...eastValues));
  const maximumEastCell = basinAxisCell(grid.eastAxis, Math.max(...eastValues));
  const minimumNorthCell = basinAxisCell(grid.northAxis, Math.min(...northValues));
  const maximumNorthCell = basinAxisCell(grid.northAxis, Math.max(...northValues));
  for (let northCell = minimumNorthCell; northCell <= maximumNorthCell; northCell++) {
    const north0 = grid.northAxis[northCell];
    const north1 = grid.northAxis[northCell + 1];
    for (let eastCell = minimumEastCell; eastCell <= maximumEastCell; eastCell++) {
      const east0 = grid.eastAxis[eastCell];
      const east1 = grid.eastAxis[eastCell + 1];
      const northWest = { eastM: east0, northM: north0 };
      const northEast = { eastM: east1, northM: north0 };
      const southEast = { eastM: east1, northM: north1 };
      const southWest = { eastM: east0, northM: north1 };
      for (const triangle of [
        [northWest, northEast, southEast],
        [northWest, southEast, southWest],
      ]) {
        const clipped = clipPolygonToTriangle(polygon, triangle);
        if (clipped.length < 3) continue;
        const rendered = clipped.map((point) => ({
          x: point.eastM,
          y: sampleCobraCanyonRenderedBasinHeight(
            plan,
            qualityTier,
            point.eastM,
            point.northM,
          ) + yOffsetM,
          z: -point.northM,
        }));
        for (let index = 1; index < rendered.length - 1; index++) {
          appendTriangle(positions, rendered[0], rendered[index], rendered[index + 1]);
          if (!fieldValues || !fieldAt) continue;
          for (const vertex of [rendered[0], rendered[index], rendered[index + 1]]) {
            fieldValues.push(...fieldAt(vertex.x, -vertex.z));
          }
        }
      }
    }
  }
}

/**
 * Resamples an authored centreline into a meandering watercourse.
 *
 * The authored polyline is NAVIGATION authority — the route corridor, the bridge, the gorge wires
 * and the terrain carve all key off it, so it may not move. What may move is the water inside the
 * channel that polyline cut. A river drawn straight down its own corridor at one constant width
 * is a canal, and that is what Build 264 renders: hard parallel edges from horizon to horizon.
 *
 * The lateral offset is two incommensurable harmonics of arclength (so the bends never repeat on
 * a visible period) with a third, much longer wave modulating their amplitude, which is what makes
 * some reaches straight and others tightly wound. It is clamped to `maximumOffsetM`, which the
 * caller sets from the ribbon's FLAT FLOOR — `halfWidthM * floorFraction` — so the sheet can
 * never climb a bank however the harmonics land. Width is a fourth wave in antiphase with the
 * bend rate: real channels run wide and shallow on the straights and narrow into the bends, and
 * the exposed floor either side of a narrow reach is read by the bank shader as a gravel bar.
 */
function meanderedCourse(points, maximumOffsetM, widthM) {
  if (points.length < 2 || maximumOffsetM <= 0) {
    return { points, widths: points.map(() => widthM) };
  }
  const spacingM = 115;
  const resampled = [];
  let travelledM = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    const spanM = Math.hypot(to.x - from.x, to.z - from.z);
    if (spanM < 1e-3) continue;
    const steps = Math.max(1, Math.round(spanM / spacingM));
    for (let step = 0; step < steps; step++) {
      const blend = step / steps;
      resampled.push({
        x: from.x + (to.x - from.x) * blend,
        y: from.y + (to.y - from.y) * blend,
        z: from.z + (to.z - from.z) * blend,
        s: travelledM + spanM * blend,
      });
    }
    travelledM += spanM;
  }
  resampled.push({ ...points[points.length - 1], s: travelledM });

  const offsets = resampled.map(({ s }) => {
    const envelope = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(s / 2_050 - 0.9));
    const wander = Math.sin(s / 545) * 0.68 + Math.sin(s / 331 + 2.2) * 0.32;
    return clamp(wander * envelope, -1, 1) * maximumOffsetM;
  });
  const widths = resampled.map(({ s }) => widthM * (1.28 - 0.46 * Math.abs(
    Math.sin(s / 545) * 0.68 + Math.sin(s / 331 + 2.2) * 0.32,
  )));

  // Displace along the local normal, then let the ribbon builder miter the result. Endpoints keep
  // their authored position so the course still starts at Camp Ember and ends at the rally point.
  const course = resampled.map((point, index) => {
    const previous = resampled[Math.max(0, index - 1)];
    const next = resampled[Math.min(resampled.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const lengthM = Math.max(1e-3, Math.hypot(tangentX, tangentZ));
    const taper = clamp(Math.min(index, resampled.length - 1 - index) / 3, 0, 1);
    const offsetM = offsets[index] * taper;
    return {
      x: point.x + (-tangentZ / lengthM) * offsetM,
      y: point.y,
      z: point.z + (tangentX / lengthM) * offsetM,
    };
  });
  return { points: course, widths };
}

function appendDrapedRibbon(
  positions,
  plan,
  qualityTier,
  points,
  widthM,
  fieldValues,
  fieldForSegment,
  widths = null,
) {
  const halfWidthAt = (index) => Math.max(
    0.05,
    (widths ? widths[Math.min(widths.length - 1, index)] : widthM) * 0.5,
  );
  const centres = points.map((point) => ({ eastM: point.x, northM: -point.z }));
  const normals = [];
  for (let index = 0; index < centres.length - 1; index++) {
    const deltaEastM = centres[index + 1].eastM - centres[index].eastM;
    const deltaNorthM = centres[index + 1].northM - centres[index].northM;
    const lengthM = Math.max(0.001, Math.hypot(deltaEastM, deltaNorthM));
    normals.push({ eastM: -deltaNorthM / lengthM, northM: deltaEastM / lengthM });
  }
  const left = [];
  const right = [];
  for (let index = 0; index < centres.length; index++) {
    const previous = normals[Math.max(0, index - 1)];
    const next = normals[Math.min(normals.length - 1, index)];
    let miterEastM = previous.eastM + next.eastM;
    let miterNorthM = previous.northM + next.northM;
    let miterLengthM = Math.hypot(miterEastM, miterNorthM);
    if (miterLengthM < 0.001) {
      miterEastM = next.eastM;
      miterNorthM = next.northM;
      miterLengthM = 1;
    }
    miterEastM /= miterLengthM;
    miterNorthM /= miterLengthM;
    const alignment = Math.max(0.5, miterEastM * next.eastM + miterNorthM * next.northM);
    const halfWidthM = halfWidthAt(index);
    const distanceM = Math.min(halfWidthM * 2, halfWidthM / alignment);
    const offsetEastM = miterEastM * distanceM;
    const offsetNorthM = miterNorthM * distanceM;
    left.push({
      eastM: centres[index].eastM + offsetEastM,
      northM: centres[index].northM + offsetNorthM,
    });
    right.push({
      eastM: centres[index].eastM - offsetEastM,
      northM: centres[index].northM - offsetNorthM,
    });
  }
  for (let index = 0; index < centres.length - 1; index++) {
    appendGridClippedPolygon(
      positions,
      plan,
      qualityTier,
      [left[index], right[index], right[index + 1], left[index + 1]],
      0.35,
      fieldValues,
      fieldForSegment?.(centres[index], centres[index + 1]),
    );
  }
}

/**
 * The river carries its own CENTRELINE, not its own colour: a vec4 of
 * `(anchorEast, anchorNorth, normalEast/halfWater, normalNorth/halfWater)` per vertex, constant
 * across each ribbon segment, from which the shader recovers exact lateral distance per fragment
 * — 1.0 is the waterline, so the channel gradient and the gravel bar are pixel-crisp.
 *
 * Two earlier shapes of this both failed the same way. Baking the COLOUR paints the whole river
 * the colour of its own bank, and so does baking a lateral SCALAR: the ribbon has four vertices
 * across its width and all four sit at the outer edge, so any per-vertex quantity is constant
 * across the quad and the shoreline — which lives in the interior — cannot exist. An anchor and
 * a scaled normal are constant across the segment by construction, so interpolation is exact and
 * the geometry does not need lateral subdivision (or its triangle bill).
 *
 * Built per segment against that segment's infinite line. A global nearest-point-on-polyline
 * distance is wrong here: at bends the miter pushes ribbon corners up to two half-widths out,
 * which would put gravel lobes across the water at every curve.
 */
function riverFrameField(halfWaterM, from, to) {
  const tangentEastM = to.eastM - from.eastM;
  const tangentNorthM = to.northM - from.northM;
  const lengthM = Math.max(0.001, Math.hypot(tangentEastM, tangentNorthM));
  const scale = 1 / (lengthM * Math.max(1, halfWaterM));
  const frame = [
    from.eastM,
    from.northM,
    -tangentNorthM * scale,
    tangentEastM * scale,
  ];
  return () => frame;
}

function ribbonGeometry(THREE, plan, role, qualityTier) {
  const positions = [];
  const riverFrame = role === "river" ? [] : null;
  const records = role === "river"
    ? collection(
      plan,
      ["river", "rivers", "waterways", "terrainRibbons", "ribbons"],
      ["rivers", "paths", "segments", "ribbons"],
    )
    : collection(
      plan,
      ["roads", "roadNetwork", "tracks", "terrainRibbons", "ribbons"],
      ["roads", "paths", "segments", "ribbons"],
    );
  for (const record of sortedRecords(records, role)) {
    const kind = stableToken(record?.kind ?? record?.type);
    if (role === "river" && kind && !kind.includes("river") && !kind.includes("water")) continue;
    if (role === "roads" && kind && !kind.includes("road") && !kind.includes("track")) continue;
    // A BENCH is terrain, not a road. `road-and-plantation-bench` is a 235 m half-width shelf
    // the landscape is graded along — the thing a road and a plantation would sit ON — and it
    // carries `authority.role: "terrain-authority"` to say so. Because its kind contains the
    // substring "road" it passed the filter above, took the 7 m default width (it authors
    // none), and got drawn as a 7 m laterite stripe down a 13 km terrain contour: straight
    // across the valley, straight across the river with no bridge, edge to edge of the map.
    // That is the "random red line" reported three times. It was never navigation and never
    // meant anything, which is exactly why it could not be read.
    if (role === "roads"
      && (kind?.includes("bench") || record?.authority?.role === "terrain-authority"))
      continue;
    const points = pathFrom(record);
    if (points.length < 2) continue;
    const widthM = Math.max(0.5, finite(
      record?.widthM ?? record?.width_m,
      role === "river"
        ? Math.min(90, Math.max(24, finite(record?.halfWidthM, 72) * 0.5))
        : 7,
    ));
    // The gravel bar is carved OUT of the authored ribbon width rather than added outside it, so
    // the river's triangle bill is exactly what it was before the bar existed and the balanced
    // tier keeps its reserve. Only the waterline moves inward.
    const bankWidthM = COBRA_CANYON_VISUAL_PROFILE.water.bankWidthM;
    const waterWidthM = Math.max(24, widthM - 2 * bankWidthM);
    // The sheet may wander only across the ribbon's authored FLAT FLOOR, and only by what the
    // widest reach leaves over: floor half-width minus the widest half-width the course asks for.
    // Beyond that the geometry would ride up the carved bank and the water would visibly climb.
    const floorHalfWidthM = finite(record?.halfWidthM, 0) * finite(record?.floorFraction, 0);
    const course = role === "river"
      ? meanderedCourse(
        points,
        Math.max(0, floorHalfWidthM - widthM * 1.28 * 0.5),
        widthM,
      )
      : { points, widths: null };
    appendDrapedRibbon(
      positions,
      plan,
      qualityTier,
      course.points,
      widthM,
      riverFrame,
      role === "river"
        ? (from, to) => riverFrameField(waterWidthM * 0.5, from, to)
        : null,
      course.widths,
    );
  }
  if (role !== "river") {
    return geometryFromPositions(
      THREE,
      positions,
      `COBRA_CANYON_${role.toUpperCase()}_GEOMETRY`,
    );
  }
  return geometryFromPositions(
    THREE,
    positions,
    "COBRA_CANYON_RIVER_GEOMETRY",
    { name: "riverFrame", itemSize: 4, values: riverFrame },
  );
}

const ROUTE_CLEARED_LANDMARK_KINDS = new Set([
  "rock-spires",
  "ridge-gate",
  "hill-pagoda",
]);

function nearestRoutePoint(plan, landmarkId, x, z) {
  const routes = landmarkId
    ? (plan.routeLanes ?? []).filter((route) => route.landmarkIds?.includes(landmarkId))
    : plan.routeLanes ?? [];
  let nearest = null;
  let nearestDistanceSquared = Infinity;
  for (const route of routes) {
    const points = route.pathLocalM ?? [];
    for (let index = 0; index < points.length - 1; index++) {
      const fromX = finite(points[index][0]);
      const fromZ = -finite(points[index][2]);
      const toX = finite(points[index + 1][0]);
      const toZ = -finite(points[index + 1][2]);
      const tangentX = toX - fromX;
      const tangentZ = toZ - fromZ;
      const lengthSquared = tangentX * tangentX + tangentZ * tangentZ;
      const blend = lengthSquared > 0
        ? clamp(((x - fromX) * tangentX + (z - fromZ) * tangentZ) / lengthSquared, 0, 1)
        : 0;
      const routeX = fromX + tangentX * blend;
      const routeZ = fromZ + tangentZ * blend;
      const offsetX = x - routeX;
      const offsetZ = z - routeZ;
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared >= nearestDistanceSquared) continue;
      nearestDistanceSquared = distanceSquared;
      nearest = {
        x: routeX,
        z: routeZ,
        tangentX,
        tangentZ,
        offsetX,
        offsetZ,
        distanceM: Math.sqrt(distanceSquared),
      };
    }
  }
  return nearest;
}

function routeClearedLandmark(plan, record, placement) {
  const radiusM = Math.hypot(placement.widthM, placement.depthM) * 0.5;
  const requiredCentreDistanceM = radiusM + COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M + 0.05;
  let x = placement.x;
  let z = placement.z;
  let adjusted = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const nearest = nearestRoutePoint(plan, record.id, x, z);
    if (!nearest || nearest.distanceM >= requiredCentreDistanceM) break;
    let directionX = nearest.offsetX;
    let directionZ = nearest.offsetZ;
    let directionLengthM = nearest.distanceM;
    if (directionLengthM < 0.001) {
      const tangentLengthM = Math.max(0.001, Math.hypot(nearest.tangentX, nearest.tangentZ));
      const side = seededUnit(hashString(`${record.id}:${placement.id}`), 0x9e3779b9) < 0.5
        ? -1
        : 1;
      directionX = -nearest.tangentZ / tangentLengthM * side;
      directionZ = nearest.tangentX / tangentLengthM * side;
      directionLengthM = 1;
    }
    x = nearest.x + directionX / directionLengthM * requiredCentreDistanceM;
    z = nearest.z + directionZ / directionLengthM * requiredCentreDistanceM;
    adjusted = true;
  }
  const nearest = nearestRoutePoint(plan, record.id, x, z);
  return {
    ...placement,
    x,
    z,
    routeEnvelopeAdjusted: adjusted,
    routeEnvelopeClearanceM: nearest ? nearest.distanceM - radiusM : Infinity,
  };
}

function landmarkPlacements(plan) {
  const placements = [];
  const add = (record, point, suffix, offset, dimensions) => {
    const candidate = {
      id: `${record.id}.${suffix}`,
      landmarkId: record.id,
      kind: stableToken(record.kind),
      x: point.x + offset[0],
      z: point.z + offset[2],
      yaw: yawRadians(record),
      widthM: dimensions[0],
      heightM: dimensions[1],
      depthM: dimensions[2],
      authoredAnchorX: point.x,
      authoredAnchorZ: point.z,
    };
    const placement = ROUTE_CLEARED_LANDMARK_KINDS.has(candidate.kind)
      ? routeClearedLandmark(plan, record, candidate)
      : candidate;
    const groundY = sampleCobraCanyonTerrain(plan, placement.x, -placement.z);
    placement.y = groundY + offset[1] + dimensions[1] * 0.5;
    placements.push(placement);
  };
  for (const record of sortedRecords(plan.landmarks ?? [], "landmark")) {
    const point = pointFrom(record);
    if (!point) continue;
    const kind = stableToken(record.kind);
    const groundY = sampleCobraCanyonTerrain(plan, point.x, -point.z);
    // Cap silhouette height. Authored top anchors on this heightfield can sit 100–300 m above
    // terrain (karst needles 311 m); drawing that as a solid box paints a UFO on the horizon
    // (owner 2026-08-08: "what's that giant thing").
    const authoredHeightM = Math.min(
      64,
      Math.max(4, point.y - groundY),
    );
    if (kind === "steel-truss-bridge" || kind === "radio-mast" || kind === "water-tower"
      || kind === "waterfall") {
      continue;
    }
    if (kind === "forward-operating-base") {
      // Camp Ember is the dedicated BF:V firebase mesh (createCampEmberFirebase) — do not
      // also emit stretched cylinder AABBs that read as debug placeholders.
      continue;
    }
    if (kind === "rock-spires") {
      const spireH = Math.min(52, authoredHeightM);
      add(record, point, "spire-one", [-18, 0, 6], [14, spireH * 0.72, 16]);
      add(record, point, "spire-two", [4, 0, -8], [17, spireH, 19]);
      add(record, point, "spire-three", [26, 0, 10], [12, spireH * 0.61, 14]);
    } else if (kind === "ridge-gate") {
      const toothH = Math.min(58, authoredHeightM);
      add(record, point, "tooth-west", [-34, 0, 0], [42, toothH, 54]);
      add(record, point, "tooth-east", [34, 0, 0], [38, toothH * 0.84, 48]);
    } else if (kind === "hill-pagoda") {
      add(record, point, "base", [0, 0, 0], [26, authoredHeightM * 0.32, 22]);
      add(record, point, "roof-low", [0, 0, 0], [34, authoredHeightM * 0.52, 30]);
      add(record, point, "roof-high", [0, 0, 0], [24, authoredHeightM * 0.73, 20]);
      add(record, point, "spire", [0, 0, 0], [4, authoredHeightM, 4]);
    } else if (kind === "open-quarry") {
      add(record, point, "quarry-cut", [0, -3, 0], [150, 6, 110]);
    } else if (kind === "mill-chimney") {
      add(record, point, "mill", [-12, 0, 0], [34, 12, 26]);
      add(record, point, "stack", [18, 0, 0], [7, Math.min(48, Math.max(28, authoredHeightM)), 7]);
    } else if (kind === "signal-smoke") {
      // Cap the column: an authored top anchor far above terrain made a 60 m+ orange prism that
      // read as a placeholder cone on the river bank (Build 267 owner flight).
      add(record, point, "smoke-column", [0, 0, 0], [6, Math.min(28, Math.max(14, authoredHeightM * 0.35)), 6]);
    } else {
      add(record, point, "silhouette", [0, 0, 0], [12, 18, 12]);
    }
  }
  return placements;
}

function landmarkColor(kind) {
  const token = stableToken(kind);
  if (token === "forward-operating-base") return [0.52, 0.48, 0.40];
  if (token === "waterfall") return [0.55, 0.72, 0.74];
  if (token === "rock-spires") return [0.50, 0.52, 0.44];
  if (token === "ridge-gate") return [0.30, 0.36, 0.26];
  if (token === "hill-pagoda") return [0.82, 0.78, 0.68];
  if (token === "open-quarry") return [0.58, 0.28, 0.12];
  if (token === "mill-chimney") return [0.38, 0.36, 0.30];
  // Cool grey plume — warm orange read as an unfinished debug solid on the gorge bank.
  if (token === "signal-smoke") return [0.62, 0.64, 0.66];
  return [0.52, 0.46, 0.31];
}

function segmentEndpoints(record) {
  const source = record?.collision ?? record;
  const from = pointFrom(
    source?.fromWorldM
      ?? source?.startWorldM
      ?? source?.fromLocalM
      ?? source?.startLocalM
      ?? source?.from
      ?? source?.start,
  );
  const to = pointFrom(
    source?.toWorldM
      ?? source?.endWorldM
      ?? source?.toLocalM
      ?? source?.endLocalM
      ?? source?.to
      ?? source?.end,
  );
  return from && to ? { from, to } : null;
}

function aabbPlacement(record) {
  const minimum = pointFrom(record?.collision?.minimumLocalM ?? record?.minimumLocalM);
  const maximum = pointFrom(record?.collision?.maximumLocalM ?? record?.maximumLocalM);
  if (!minimum || !maximum) return null;
  return {
    id: record.id,
    kind: stableToken(record.kind),
    x: (minimum.x + maximum.x) * 0.5,
    y: (minimum.y + maximum.y) * 0.5,
    z: (minimum.z + maximum.z) * 0.5,
    yaw: 0,
    widthM: Math.abs(maximum.x - minimum.x),
    heightM: Math.abs(maximum.y - minimum.y),
    depthM: Math.abs(maximum.z - minimum.z),
    authoredHazard: true,
  };
}

function hazardPlacements(plan) {
  const placements = [];
  const waterTowers = [];
  const bridgeDecks = [];
  const bridgeApproaches = [];
  const bridgePiers = [];
  const wireSpans = [];
  const poleKeys = new Set();
  let suppressedPresentationPoles = 0;
  const authored = sortedRecords(plan.hazards ?? [], "hazard");
  for (const record of authored) {
    const kind = stableToken(record.kind);
    const shape = stableToken(record.collision?.shape);
    if (shape === "aabb") {
      const placement = aabbPlacement(record);
      if (!placement) continue;
      if (kind === "water-tower" || kind === "watertower") waterTowers.push(placement);
      else if (kind.includes("bridge-approach")) bridgeApproaches.push({
        ...placement,
        yaw: kind.includes("east") ? Math.PI : 0,
      });
      else if (kind.includes("bridge-pier") || kind === "bridgepier") bridgePiers.push(placement);
      else if (kind.includes("bridge")) bridgeDecks.push(placement);
      else placements.push(placement);
      continue;
    }
    if (shape !== "capsule-segment" && shape !== "capsulesegment") continue;
    const endpoints = segmentEndpoints(record);
    if (!endpoints) continue;
    const visualRadiusM = clamp(finite(record.collision?.radiusM, 0.2), 0.16, 0.68);
    placements.push({
      id: record.id,
      kind,
      ...endpoints,
      widthM: visualRadiusM * 2,
      depthM: visualRadiusM * 2,
      authoredHazard: true,
    });
    if (!kind.includes("wire")) continue;
    wireSpans.push(record.id);
    if (kind.includes("guy")) continue;
    for (const endpoint of [endpoints.from, endpoints.to]) {
      const key = `${endpoint.x.toFixed(3)}:${endpoint.z.toFixed(3)}`;
      if (poleKeys.has(key)) continue;
      poleKeys.add(key);
      const routePoint = nearestRoutePoint(plan, null, endpoint.x, endpoint.z);
      if (routePoint?.distanceM < COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M + 2) {
        suppressedPresentationPoles += 1;
        continue;
      }
      const groundY = sampleCobraCanyonTerrain(plan, endpoint.x, -endpoint.z);
      if (endpoint.y <= groundY + 1) continue;
      placements.push({
        id: `${record.id}.presentation-pole.${poleKeys.size}`,
        kind: "presentation-wire-pole",
        from: { x: endpoint.x, y: groundY, z: endpoint.z },
        to: endpoint,
        widthM: 0.58,
        depthM: 0.58,
        authoredHazard: false,
      });
    }
  }
  return {
    placements,
    waterTowers,
    bridgeDecks,
    bridgeApproaches,
    bridgePiers,
    bridges: [...bridgeDecks, ...bridgeApproaches, ...bridgePiers],
    wireSpans,
    authoredCount: authored.length,
    suppressedPresentationPoles,
  };
}

function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixedUint32(value) {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

function seededUnit(seed, salt) {
  return mixedUint32(seed ^ salt) / 0x1_0000_0000;
}

function worldCentre(plan, heroCells, landmarks, vegetation) {
  const bounds = boundsFrom(plan) ?? boundsFrom(firstValue(plan, ["basin"]));
  if (bounds) {
    return Object.freeze({
      x: (bounds.minimumEastM + bounds.maximumEastM) * 0.5,
      z: -(bounds.minimumNorthM + bounds.maximumNorthM) * 0.5,
      radiusM: Math.max(
        100,
        Math.hypot(
          bounds.maximumEastM - bounds.minimumEastM,
          bounds.maximumNorthM - bounds.minimumNorthM,
        ) * 0.6,
      ),
    });
  }
  const candidates = [...heroCells, ...landmarks, ...vegetation];
  if (!candidates.length) return Object.freeze({ x: 0, z: 0, radiusM: 20_000 });
  let minimumX = Infinity;
  let minimumZ = Infinity;
  let maximumX = -Infinity;
  let maximumZ = -Infinity;
  for (const candidate of candidates) {
    minimumX = Math.min(minimumX, candidate.x);
    minimumZ = Math.min(minimumZ, candidate.z);
    maximumX = Math.max(maximumX, candidate.x);
    maximumZ = Math.max(maximumZ, candidate.z);
  }
  return Object.freeze({
    x: (minimumX + maximumX) * 0.5,
    z: (minimumZ + maximumZ) * 0.5,
    radiusM: Math.max(100, Math.hypot(maximumX - minimumX, maximumZ - minimumZ) * 0.75),
  });
}

function disposeResources(resources) {
  for (const mesh of resources.meshes) {
    if (mesh.isInstancedMesh) {
      mesh.count = 0;
      if (typeof mesh.dispose === "function") mesh.dispose();
    }
    mesh.removeFromParent();
  }
  for (const geometry of resources.geometries) geometry.dispose();
  for (const material of resources.materials) material.dispose();
}

/**
 * Builds bounded presentation-only geometry from a validated Cobra Canyon plan.
 *
 * The planner owns authored placement and the simulation owns collision/target authority. This
 * adapter only turns those records into a small, deterministic render set. `update()` performs no
 * spatial qualification: it changes one pre-authored ambient prefix and one near-ring visibility
 * bit, leaving every bridge, pole, span and landmark intact.
 */
export function createCobraCanyonPresentation(THREE, plan, options = {}) {
  if (!THREE?.Group || !THREE?.InstancedMesh || !THREE?.BufferGeometry) {
    throw new TypeError("A complete Three.js namespace is required.");
  }
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("A Cobra Canyon world plan is required.");
  }

  const qualityTier = options.qualityTier ?? plan.qualityTier ?? "balanced";
  const budget = COBRA_CANYON_RENDER_BUDGETS[qualityTier];
  if (!budget) throw new TypeError(`Unknown Cobra Canyon quality tier: ${qualityTier}.`);

  const group = new THREE.Group();
  group.name = "COBRA_CANYON_PRESENTATION_ONLY";
  tagObject(group, "world", {
    worldId: plan.worldId ?? plan.id ?? "cobra-canyon",
    qualityTier,
  });

  const resources = {
    geometries: new Set(),
    materials: new Set(),
    meshes: [],
  };
  const metrics = {
    drawCalls: 0,
    instances: 0,
    triangles: 0,
    roleInstances: Object.create(null),
    roleTriangles: Object.create(null),
  };

  addStaticMesh(
    THREE,
    group,
    "basin",
    basinGeometry(THREE, plan, qualityTier),
    resources,
    metrics,
  );
  addStaticMesh(
    THREE,
    group,
    "river",
    ribbonGeometry(THREE, plan, "river", qualityTier),
    resources,
    metrics,
  );
  addStaticMesh(
    THREE,
    group,
    "roads",
    ribbonGeometry(THREE, plan, "roads", qualityTier),
    resources,
    metrics,
  );
  addStaticMesh(THREE, group, "heroCells", heroCellGeometry(THREE, plan), resources, metrics);

  const heroCells = plan.cells ?? plan.heroCells ?? [];
  const landmarks = landmarkPlacements(plan);
  const hazards = hazardPlacements(plan);
  // The firebase is built BEFORE the asset kit so `metrics.triangles` is the complete static cost
  // of the world by the time the kit is asked to size itself. The kit's allocation now varies with
  // the local vegetation mix rather than with a fixed authored instance count, so it needs to be
  // told what is actually left of the tier's triangle ceiling instead of assuming.
  const campEmber = createCampEmberFirebase(THREE, plan);
  if (campEmber) {
    group.add(campEmber.group);
    for (const geometry of campEmber.resources.geometries) resources.geometries.add(geometry);
    for (const material of campEmber.resources.materials) resources.materials.add(material);
    resources.meshes.push(...campEmber.resources.meshes);
    // Static mesh: counts as a draw call + triangles, not an instance (matches basin/river).
    metrics.drawCalls += campEmber.drawCalls;
    metrics.triangles += campEmber.triangles;
    metrics.roleTriangles["camp-ember-firebase"] = campEmber.triangles;
  }

  const plantationGroundMesh = addStaticMesh(
    THREE,
    group,
    "plantation-ground",
    plantationGroundGeometry(THREE, plan),
    resources,
    metrics,
  );
  if (plantationGroundMesh) {
    plantationGroundMesh.userData.cobraCanyonLandmarkId =
      "landmark.cobra-canyon.plantation-water-tower.v1";
  }


  const landmarkMesh = addInstancedMesh(
    THREE,
    group,
    "landmarks",
    new THREE.CylinderGeometry(0.28, 0.5, 1, 4, 1, false),
    landmarks,
    resources,
    metrics,
    composeBox,
  );
  const hazardMesh = addInstancedMesh(
    THREE,
    group,
    "hazards",
    new THREE.BoxGeometry(1, 1, 1),
    hazards.placements,
    resources,
    metrics,
    composeHazard,
    { hazardCue: true },
  );
  const waterTowerMesh = addInstancedMesh(
    THREE,
    group,
    "water-tower",
    waterTowerGeometry(THREE),
    hazards.waterTowers,
    resources,
    metrics,
    composeBox,
    { hazardCue: true },
  );
  const bridgeDeckMesh = addInstancedMesh(
    THREE,
    group,
    "bridge-deck",
    bridgeDeckTrussGeometry(THREE),
    hazards.bridgeDecks,
    resources,
    metrics,
    composeBridgeDeck,
    { hazardCue: true },
  );
  const bridgeApproachMesh = addInstancedMesh(
    THREE,
    group,
    "bridge-approach",
    bridgeApproachGeometry(THREE),
    hazards.bridgeApproaches,
    resources,
    metrics,
    composeBridgeApproach,
    { hazardCue: true },
  );
  const bridgePierMesh = addInstancedMesh(
    THREE,
    group,
    "bridge-pier",
    bridgePierGeometry(THREE),
    hazards.bridgePiers,
    resources,
    metrics,
    composeBridgePier,
    { hazardCue: true },
  );
  if (landmarkMesh) {
    landmarkMesh.userData.cobraCanyonInstances = Object.freeze(
      landmarks.map((placement, instanceId) => Object.freeze({
        instanceId,
        id: placement.id,
        landmarkId: placement.landmarkId,
        kind: placement.kind,
        authoredAnchorX: placement.authoredAnchorX,
        authoredAnchorZ: placement.authoredAnchorZ,
        routeEnvelopeAdjusted: placement.routeEnvelopeAdjusted === true,
        routeEnvelopeClearanceM: placement.routeEnvelopeClearanceM ?? null,
      })),
    );
    const instanceColors = new Float32Array(landmarks.length * 3);
    for (let index = 0; index < landmarks.length; index++) {
      const color = landmarkColor(landmarks[index].kind);
      instanceColors[index * 3] = color[0];
      instanceColors[index * 3 + 1] = color[1];
      instanceColors[index * 3 + 2] = color[2];
    }
    landmarkMesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
    landmarkMesh.instanceColor.needsUpdate = true;
  }
  if (hazardMesh) {
    hazardMesh.userData.cobraCanyonInstances = Object.freeze(
      hazards.placements.map((placement, instanceId) => Object.freeze({
        instanceId,
        id: placement.id,
        kind: placement.kind,
        authoredHazard: placement.authoredHazard,
      })),
    );
  }
  if (waterTowerMesh) {
    waterTowerMesh.userData.cobraCanyonInstances = Object.freeze(
      hazards.waterTowers.map((placement, instanceId) => Object.freeze({
        instanceId,
        id: placement.id,
        kind: placement.kind,
        authoredHazard: true,
      })),
    );
  }
  if (bridgeDeckMesh) {
    bridgeDeckMesh.userData.cobraCanyonInstances = Object.freeze(
      hazards.bridgeDecks.map((placement, instanceId) => Object.freeze({
        instanceId,
        id: placement.id,
        kind: placement.kind,
        authoredHazard: true,
      })),
    );
  }
  if (bridgeApproachMesh) {
    bridgeApproachMesh.userData.cobraCanyonInstances = Object.freeze(
      hazards.bridgeApproaches.map((placement, instanceId) => Object.freeze({
        instanceId,
        id: placement.id,
        kind: placement.kind,
        authoredHazard: true,
      })),
    );
  }
  if (bridgePierMesh) {
    bridgePierMesh.userData.cobraCanyonInstances = Object.freeze(
      hazards.bridgePiers.map((placement, instanceId) => Object.freeze({
        instanceId,
        id: placement.id,
        kind: placement.kind,
        authoredHazard: true,
      })),
    );
  }
  // LAST, ON PURPOSE. Everything above is fixed geometry whose cost is known the moment it is
  // built; the asset kit is the only part of the scene that sizes itself to what is left. Building
  // it here means `metrics.triangles` is the complete static cost of the world — basin, river,
  // firebase, landmarks, hazards and bridges — so the kit is told the truth about its ceiling
  // rather than a figure that three later submissions will quietly spend.
  const assetKit = createCobraCanyonAssetKit(THREE, plan, {
    qualityTier,
    maxInstances: budget.maxAssetInstances,
    // Minus a reserve: a tier that lands EXACTLY on its ceiling has nothing left for the next
    // authored hazard or landmark, and the ceiling contract is a working margin, not a target.
    maxTriangles: budget.maxTriangles - metrics.triangles - PRESENTATION_TRIANGLE_RESERVE,
    foliageTextures: options.foliageTextures ?? null,
    roleGeometries: options.roleGeometries ?? null,
    authoredTriangleBudget: budget.maxAuthoredTriangles,
  });
  group.add(assetKit.group);

  const builtMetrics = Object.freeze({
    drawCalls: metrics.drawCalls + assetKit.builtMetrics.drawCalls,
    instances: metrics.instances + assetKit.builtMetrics.instances,
    triangles: metrics.triangles + assetKit.builtMetrics.triangles,
  });
  if (builtMetrics.drawCalls > budget.maxDrawCalls
      || builtMetrics.instances > budget.maxInstances
      || builtMetrics.triangles > budget.maxTriangles) {
    assetKit.dispose();
    disposeResources(resources);
    throw new RangeError(
      `Cobra Canyon ${qualityTier} presentation needs ${builtMetrics.drawCalls} draw calls, `
        + `${builtMetrics.instances} instances and ${builtMetrics.triangles} triangles; `
        + `budget is ${budget.maxDrawCalls}/${budget.maxInstances}/${budget.maxTriangles}.`,
    );
  }

  const centre = worldCentre(plan, heroCells, landmarks, []);
  const routeEnvelopePlacements = landmarks.filter(
    (placement) => Number.isFinite(placement.routeEnvelopeClearanceM),
  );
  const roleCounts = Object.freeze({
    basinTriangles: metrics.roleTriangles.basin ?? 0,
    riverTriangles: metrics.roleTriangles.river ?? 0,
    roadTriangles: metrics.roleTriangles.roads ?? 0,
    heroCells: heroCells.length,
    landmarks: plan.landmarks?.length ?? landmarks.length,
    landmarkInstances: landmarks.length,
    wireSpans: hazards.wireSpans.length,
    suppressedPresentationPoles: hazards.suppressedPresentationPoles,
    hazards: hazards.authoredCount,
    hazardInstances:
      hazards.placements.length + hazards.waterTowers.length + hazards.bridges.length,
    waterTowers: hazards.waterTowers.length,
    bridges: hazards.bridges.length,
    bridgeDecks: hazards.bridgeDecks.length,
    bridgeApproaches: hazards.bridgeApproaches.length,
    bridgePiers: hazards.bridgePiers.length,
    campEmberFirebaseParts: campEmber?.partCount ?? 0,
    campEmberFirebaseTriangles: campEmber?.triangles ?? 0,
    plantationGroundTriangles: metrics.roleTriangles["plantation-ground"] ?? 0,
    routeEnvelopeAdjustedInstances: routeEnvelopePlacements.filter(
      (placement) => placement.routeEnvelopeAdjusted,
    ).length,
    routeEnvelopeMinimumClearanceM: routeEnvelopePlacements.length
      ? Math.min(...routeEnvelopePlacements.map((placement) => placement.routeEnvelopeClearanceM))
      : null,
    coreRenderBatches: metrics.drawCalls,
    assetRenderBatches: assetKit.roleCounts.renderBatches,
    worldRenderBatches: builtMetrics.drawCalls,
    ...assetKit.roleCounts,
  });

  const snapshots = Array.from({ length: 3 }, () => [null, null]);
  for (let level = 0; level <= 2; level++) {
    for (let nearIndex = 0; nearIndex <= 1; nearIndex++) {
      const nearRingVisible = nearIndex === 1;
      const assetSnapshot = assetKit.diagnosticsFor(level, nearRingVisible);
      snapshots[level][nearIndex] = Object.freeze({
        schema: COBRA_CANYON_PRESENTATION_SCHEMA,
        worldId: plan.worldId ?? plan.id ?? "cobra-canyon",
        qualityTier,
        ambientBudgetLevel: level,
        nearRingVisible,
        drawCalls: metrics.drawCalls + assetSnapshot.drawCalls,
        instances: metrics.instances + assetSnapshot.instances,
        triangles: metrics.triangles + assetSnapshot.triangles,
        builtDrawCalls: builtMetrics.drawCalls,
        builtInstances: builtMetrics.instances,
        builtTriangles: builtMetrics.triangles,
        presentationDrawCallHeadroom: budget.maxDrawCalls - builtMetrics.drawCalls,
        presentationInstanceHeadroom: budget.maxInstances - builtMetrics.instances,
        presentationTriangleHeadroom: budget.maxTriangles - builtMetrics.triangles,
        authoredWorldDrawCallCeiling: plan.budget?.maxDrawCalls ?? budget.maxDrawCalls,
        availableSceneDrawCallHeadroom:
          (plan.budget?.maxDrawCalls ?? budget.maxDrawCalls) - builtMetrics.drawCalls,
        visibleAmbientInstances: assetSnapshot.instances,
        visibleAssetInstances: assetSnapshot.instances,
        visibleAssetDrawCalls: assetSnapshot.drawCalls,
        hazards: hazards.authoredCount,
        hazardInstances:
          hazards.placements.length + hazards.waterTowers.length + hazards.bridges.length,
        hazardsVisible: true,
        presentationOnly: true,
        authoritative: false,
        collisionSource: false,
        targetSource: false,
        roleCounts,
        budget,
        withinBudget: true,
        disposed: false,
      });
    }
  }
  const disposedDiagnostics = Object.freeze({
    ...snapshots[0][0],
    drawCalls: 0,
    instances: 0,
    triangles: 0,
    visibleAmbientInstances: 0,
    visibleAssetInstances: 0,
    visibleAssetDrawCalls: 0,
    hazardsVisible: false,
    nearRingVisible: false,
    disposed: true,
  });

  let disposed = false;
  let ambientBudgetLevel = 0;
  let nearRingVisible = true;
  let currentDiagnostics = snapshots[ambientBudgetLevel][1];
  let currentAssetSnapshot = null;
  let currentBaseSnapshot = null;
  let assetKitCamera = null;

  function applyVisibility() {
    if (hazardMesh) {
      hazardMesh.visible = true;
      hazardMesh.count = hazards.placements.length;
    }
    if (waterTowerMesh) {
      waterTowerMesh.visible = true;
      waterTowerMesh.count = hazards.waterTowers.length;
    }
    if (bridgeDeckMesh) {
      bridgeDeckMesh.visible = true;
      bridgeDeckMesh.count = hazards.bridgeDecks.length;
    }
    if (bridgeApproachMesh) {
      bridgeApproachMesh.visible = true;
      bridgeApproachMesh.count = hazards.bridgeApproaches.length;
    }
    if (bridgePierMesh) {
      bridgePierMesh.visible = true;
      bridgePierMesh.count = hazards.bridgePiers.length;
    }
    assetKit.update({ ambientBudgetLevel, nearRingVisible, cameraPosition: assetKitCamera });
    const base = snapshots[ambientBudgetLevel][nearRingVisible ? 1 : 0];
    // The asset kit's occupancy follows the aircraft (near-field scatter), so the asset-derived
    // fields cannot be baked at build time the way the static world's can. Rebuild them only when
    // they actually move: `diagnostics()` must keep returning the SAME frozen object for repeated
    // identical frames, which is what makes the update path allocation-free while parked.
    const assetSnapshot = assetKit.diagnosticsFor(ambientBudgetLevel, nearRingVisible);
    if (currentAssetSnapshot === assetSnapshot && currentBaseSnapshot === base) return;
    currentAssetSnapshot = assetSnapshot;
    currentBaseSnapshot = base;
    currentDiagnostics = Object.freeze({
      ...base,
      drawCalls: metrics.drawCalls + assetSnapshot.drawCalls,
      instances: metrics.instances + assetSnapshot.instances,
      triangles: metrics.triangles + assetSnapshot.triangles,
      visibleAmbientInstances: assetSnapshot.instances,
      visibleAssetInstances: assetSnapshot.instances,
      visibleAssetDrawCalls: assetSnapshot.drawCalls,
      roleCounts: Object.freeze({ ...base.roleCounts, ...assetSnapshot.roleCounts }),
    });
  }

  const nearRingMaximumAglM = Math.max(1, finite(
    options.nearRingMaximumAglM,
    budget.nearRingMaximumAglM,
  ));
  const nearRingRadiusM = Math.max(1, finite(options.nearRingRadiusM, centre.radiusM));

  return Object.freeze({
    group,
    update(frame = {}) {
      if (disposed) return;
      const requestedLevel = finite(
        frame.ambientBudgetLevel
          ?? frame.sceneryBudgetLevel
          ?? frame.budgetLevel,
        ambientBudgetLevel,
      );
      ambientBudgetLevel = clamp(Math.trunc(requestedLevel), 0, 2);

      const camera = frame.cameraPosition;
      const cameraAglM = finite(frame.cameraAglM ?? frame.aglM, 0);
      let insideWorldRing = true;
      if (camera && Number.isFinite(Number(camera.x)) && Number.isFinite(Number(camera.z))) {
        const deltaX = Number(camera.x) - centre.x;
        const deltaZ = Number(camera.z) - centre.z;
        insideWorldRing = deltaX * deltaX + deltaZ * deltaZ
          <= nearRingRadiusM * nearRingRadiusM;
      }
      nearRingVisible = cameraAglM <= nearRingMaximumAglM && insideWorldRing;
      // The asset kit's near-field scatter follows the aircraft; it reads the same camera the
      // near-ring shed reads, so there is exactly one notion of where the pilot is.
      assetKitCamera = camera ?? null;
      applyVisibility();
    },
    diagnostics() {
      return currentDiagnostics;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      assetKit.dispose();
      disposeResources(resources);
      group.clear();
      group.userData.cobraCanyonDisposed = true;
      currentDiagnostics = disposedDiagnostics;
    },
  });
}
