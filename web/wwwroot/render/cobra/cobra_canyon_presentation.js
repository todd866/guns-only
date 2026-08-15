import {
  COBRA_STRUCTURE_SURFACES,
  createCobraStructureMaterial,
} from "./cobra_structure_material.js?v=334";
import {
  applyCobraCanyonCampEmberApron,
  COBRA_CANYON_CAMP_EMBER_APRON,
  smoothstep,
  sampleCobraCanyonTerrain,
  sampleCobraCanyonTerrainBeforeCampEmberApron,
} from "./cobra_canyon_plan.js?v=334";
import {
  COBRA_CANYON_AMBIENT_BUDGETS,
  createCobraCanyonAssetKit,
} from "./cobra_canyon_asset_kit.js?v=334";
import { COBRA_CANYON_VISUAL_PROFILE } from "./cobra_canyon_visual_profile.js?v=334";
import {
  createCobraCanyonBasinMaterial,
  createCobraCanyonRiverMaterial,
} from "./cobra_canyon_terrain_material.js?v=334";
import {
  CAMP_EMBER_DRAWN_RECESS_M,
  createCampEmberFirebase,
} from "./cobra_camp_ember_firebase.js?v=334";

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

// The core analytical terrain and authority cues occupy eight submissions (basin, river, roads,
// hero cells, landmarks, non-bridge hazards, bridge decks, bridge piers). Camp Ember firebase is
// one merged vertex-colored mesh (+1). The asset kit adds at most one instanced submission for
// each of its seven roles; none cast a second shadow pass.
export const COBRA_CANYON_RENDER_BUDGETS = Object.freeze({
  // maxAuthoredTriangles is the slice of maxTriangles that authored glTF meshes may spend.
  // An authored palm costs ~470 triangles against a crossed card's dozen, so without a
  // ceiling the jungle role alone runs to millions and the budget check throws at boot. Mobile
  // gets none: its whole scene fits in 45,000 triangles, which one hero batch would eat.
  mobile: Object.freeze({
    maxDrawCalls: 17,
    maxInstances: 640,
    maxTriangles: 45_000,
    maxAssetInstances: 580,
    maxAuthoredTriangles: 0,
    nearRingMaximumAglM: 180,
  }),
  balanced: Object.freeze({
    maxDrawCalls: 17,
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
    maxDrawCalls: 17,
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

function appendTriangle(positions, a, b, c) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function appendBoxPrism(positions, minimum, maximum) {
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
    appendTriangle(positions, corners[a], corners[b], corners[c]);
  }
}

/**
 * Unit-normalized deck truss. Outer AABB is exactly [-0.5,0.5]^3 so composeBox preserves
 * authored collision bounds while the silhouette reads as a steel span, not a solid orange box.
 */
function bridgeDeckTrussGeometry(THREE) {
  const positions = [];
  appendBoxPrism(positions, [-0.5, -0.5, -0.42], [0.5, -0.28, 0.42]);
  appendBoxPrism(positions, [-0.5, -0.5, -0.5], [0.5, 0.5, -0.42]);
  appendBoxPrism(positions, [-0.5, -0.5, 0.42], [0.5, 0.5, 0.5]);
  // Cross-deck roadway lip so the span reads as a crossing, not two parallel walls.
  appendBoxPrism(positions, [-0.5, -0.28, -0.42], [0.5, -0.18, 0.42]);
  for (const z of [-0.42, 0.42]) {
    appendBoxPrism(positions, [-0.5, 0.38, z - 0.04], [0.5, 0.5, z + 0.04]);
    appendBoxPrism(positions, [-0.5, -0.1, z - 0.03], [0.5, 0.02, z + 0.03]);
    for (const x of [-0.45, -0.15, 0.15, 0.45]) {
      appendBoxPrism(positions, [x - 0.03, -0.28, z - 0.04], [x + 0.03, 0.5, z + 0.04]);
    }
  }
  // Diagonal X-bracing on each face — cheap triangles, big silhouette change from a mile out.
  for (const z of [-0.46, 0.46]) {
    appendBoxPrism(positions, [-0.42, -0.22, z - 0.02], [-0.08, 0.36, z + 0.02]);
    appendBoxPrism(positions, [0.08, -0.22, z - 0.02], [0.42, 0.36, z + 0.02]);
  }
  return geometryFromPositions(THREE, positions, "COBRA_CANYON_BRIDGE_DECK_TRUSS_GEOMETRY");
}

/** Unit-normalized pier: footing, shaft, and cap that still fill the collision AABB envelope. */
function bridgePierGeometry(THREE) {
  const positions = [];
  appendBoxPrism(positions, [-0.5, -0.5, -0.5], [0.5, -0.38, 0.5]);
  appendBoxPrism(positions, [-0.5, 0.38, -0.5], [0.5, 0.5, 0.5]);
  appendBoxPrism(positions, [-0.32, -0.38, -0.36], [0.32, 0.38, 0.36]);
  return geometryFromPositions(THREE, positions, "COBRA_CANYON_BRIDGE_PIER_GEOMETRY");
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
  "bridge-deck",
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
    heroCells: { color: 0x6a5030, roughness: 1 },
    landmarks: { color: 0xffffff, roughness: 0.95 },
    hazards: { color: 0xe96a43, emissive: 0x411006, roughness: 0.8 },
    // Weathered steel over jungle green — Iron Bell should read as the fight site, not an
    // orange hazard box that matches every other collision marker.
    "bridge-deck": { color: 0xc9b89a, emissive: 0x2a2214, roughness: 0.9 },
    "bridge-pier": { color: 0x8f806c, emissive: 0x1a1610, roughness: 0.94 },
    vegetation: { color: 0xffffff, roughness: 1 },
  }[role];
  // Soft normals on landmarks/bridges/vegetation — flat boxes read as crystal shards at nap AGL.
  // Hazards and roads keep hard facets so collision cues stay readable.
  const flatShading = role !== "heroCells"
    && role !== "landmarks"
    && role !== "vegetation"
    && role !== "bridge-deck"
    && role !== "bridge-pier";
  const side = role === "roads" ? THREE.DoubleSide : THREE.FrontSide;
  // Authored structures get procedural surface detail. Without it the bridge deck — most of
  // the screen on a nap-of-the-earth pass — is one flat fill sitting on a five-octave
  // terrain, which is the whole reason the corridor read as cardboard.
  const material = role in COBRA_STRUCTURE_SURFACES
    ? createCobraStructureMaterial(THREE, role, {
      color: parameters.color,
      emissive: parameters.emissive ?? 0x000000,
      flatShading,
      side,
    })
    : new THREE.MeshLambertMaterial({
      color: parameters.color,
      emissive: parameters.emissive ?? 0x000000,
      flatShading,
      side,
    });
  if (role === "heroCells") {
    material.transparent = true;
    material.opacity = 0.16;
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
const BASIN_GRID_CACHE = new WeakMap();

function refinedBasinAxis(minimumM, maximumM, segments, focusM) {
  const stepM = (maximumM - minimumM) / segments;
  const values = Array.from(
    { length: segments + 1 },
    (_, index) => minimumM + index * stepM,
  );
  for (const offsetM of CAMP_EMBER_GRID_OFFSETS_M) {
    const valueM = focusM + offsetM;
    if (valueM > minimumM && valueM < maximumM) values.push(valueM);
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
    ),
    northAxis: refinedBasinAxis(
      bounds.minimumNorthM,
      bounds.maximumNorthM,
      segments,
      COBRA_CANYON_CAMP_EMBER_APRON.northM,
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
  for (let northIndex = 0; northIndex < rowCount; northIndex++) {
    const northM = grid.northAxis[northIndex];
    for (let eastIndex = 0; eastIndex < columnCount; eastIndex++) {
      const eastM = grid.eastAxis[eastIndex];
      const elevationM = heights[northIndex * columnCount + eastIndex];
      positions.push(eastM, elevationM, -northM);
      // Enclosure term (korea_terrain's baked `concavity` attribute): a two-cell ring mean says
      // whether this vertex sits below its neighbourhood — a valley to darken — or above it — a
      // crest to let catch light. This is the one shading input a fragment cannot re-derive,
      // because it needs the height field, not the surface point; everything else is per-pixel
      // in cobra_canyon_terrain_material.js.
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
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("concavity", new THREE.Float32BufferAttribute(concavity, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function heroCellGeometry(THREE, plan) {
  const positions = [];
  for (const cell of sortedRecords(plan.cells ?? plan.heroCells ?? [], "hero-cell")) {
    const patch = cell.terrainPatch;
    const center = pointFrom(patch?.centerLocalM);
    if (!patch || !center) continue;
    const seed = hashString(cell.id);
    for (let scar = 0; scar < 3; scar++) {
      const scarSeed = mixedUint32(seed ^ Math.imul(scar + 1, 0x9e3779b1));
      const bearing = seededUnit(scarSeed, 0xa511e9b3) * Math.PI * 2;
      const offsetM = patch.radiusM * (0.08 + seededUnit(scarSeed, 0x63d83595) * 0.24);
      const scarEastM = center.x + Math.cos(bearing) * offsetM;
      const scarNorthM = -center.z + Math.sin(bearing) * offsetM;
      const radiusEastM = patch.radiusM * (0.10 + seededUnit(scarSeed, 0xc2b2ae35) * 0.10);
      const radiusNorthM = patch.radiusM * (0.06 + seededUnit(scarSeed, 0x27d4eb2f) * 0.08);
      const scarCenter = {
        x: scarEastM,
        y: sampleCobraCanyonTerrain(plan, scarEastM, scarNorthM) + 0.34,
        z: -scarNorthM,
      };
      const sides = 12;
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const nextAngle = (side + 1) / sides * Math.PI * 2;
        const eastM = scarEastM + Math.cos(angle) * radiusEastM;
        const northM = scarNorthM + Math.sin(angle) * radiusNorthM;
        const nextEastM = scarEastM + Math.cos(nextAngle) * radiusEastM;
        const nextNorthM = scarNorthM + Math.sin(nextAngle) * radiusNorthM;
        appendTriangle(
          positions,
          scarCenter,
          {
            x: eastM,
            y: sampleCobraCanyonTerrain(plan, eastM, northM) + 0.34,
            z: -northM,
          },
          {
            x: nextEastM,
            y: sampleCobraCanyonTerrain(plan, nextEastM, nextNorthM) + 0.34,
            z: -nextNorthM,
          },
        );
      }
    }
  }
  return geometryFromPositions(THREE, positions, "COBRA_CANYON_HERO_CELLS_GEOMETRY");
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
    if (kind === "steel-truss-bridge" || kind === "radio-mast" || kind === "water-tower") {
      continue;
    }
    if (kind === "forward-operating-base") {
      // Camp Ember is the dedicated BF:V firebase mesh (createCampEmberFirebase) — do not
      // also emit stretched cylinder AABBs that read as debug placeholders.
      continue;
    }
    if (kind === "waterfall") {
      add(record, point, "water-ribbon", [0, 0, 0], [14, Math.min(48, Math.max(24, authoredHeightM * 0.4)), 3]);
    } else if (kind === "rock-spires") {
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
  const bridgeDecks = [];
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
      if (kind.includes("bridge-pier") || kind === "bridgepier") bridgePiers.push(placement);
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
    bridgeDecks,
    bridgePiers,
    bridges: [...bridgeDecks, ...bridgePiers],
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
  const bridgeDeckMesh = addInstancedMesh(
    THREE,
    group,
    "bridge-deck",
    bridgeDeckTrussGeometry(THREE),
    hazards.bridgeDecks,
    resources,
    metrics,
    composeBox,
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
    composeBox,
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
    hazardInstances: hazards.placements.length + hazards.bridges.length,
    bridges: hazards.bridges.length,
    bridgeDecks: hazards.bridgeDecks.length,
    bridgePiers: hazards.bridgePiers.length,
    campEmberFirebaseParts: campEmber?.partCount ?? 0,
    campEmberFirebaseTriangles: campEmber?.triangles ?? 0,
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
        hazardInstances: hazards.placements.length + hazards.bridges.length,
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
    if (bridgeDeckMesh) {
      bridgeDeckMesh.visible = true;
      bridgeDeckMesh.count = hazards.bridgeDecks.length;
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
