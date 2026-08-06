import { sampleCobraCanyonTerrain } from "./cobra_canyon_plan.js?v=264";
import {
  COBRA_CANYON_AMBIENT_BUDGETS,
  createCobraCanyonAssetKit,
} from "./cobra_canyon_asset_kit.js?v=264";
import { COBRA_CANYON_VISUAL_PROFILE } from "./cobra_canyon_visual_profile.js?v=264";
import {
  createCobraCanyonBasinMaterial,
  createCobraCanyonRiverMaterial,
} from "./cobra_canyon_terrain_material.js?v=264";

export { COBRA_CANYON_AMBIENT_BUDGETS };

export const COBRA_CANYON_PRESENTATION_SCHEMA =
  "guns-only.cobra-canyon-presentation.v1";

export const COBRA_CANYON_TERRAIN_SEGMENTS = Object.freeze({
  mobile: 96,
  balanced: 128,
  desktop: 160,
});

// The core analytical terrain and authority cues occupy eight submissions (basin, river, roads,
// hero cells, landmarks, non-bridge hazards, bridge decks, bridge piers). The asset kit adds at
// most one instanced submission for each of its seven roles; none cast a second shadow pass.
export const COBRA_CANYON_RENDER_BUDGETS = Object.freeze({
  mobile: Object.freeze({
    maxDrawCalls: 15,
    maxInstances: 384,
    maxTriangles: 45_000,
    maxAssetInstances: 330,
    nearRingMaximumAglM: 180,
  }),
  balanced: Object.freeze({
    maxDrawCalls: 15,
    maxInstances: 640,
    maxTriangles: 75_000,
    maxAssetInstances: 580,
    nearRingMaximumAglM: 260,
  }),
  desktop: Object.freeze({
    maxDrawCalls: 15,
    maxInstances: 896,
    maxTriangles: 120_000,
    maxAssetInstances: 830,
    nearRingMaximumAglM: 360,
  }),
});

export const COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M = 9.706;

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
  for (const z of [-0.42, 0.42]) {
    appendBoxPrism(positions, [-0.5, 0.38, z - 0.04], [0.5, 0.5, z + 0.04]);
    appendBoxPrism(positions, [-0.5, -0.1, z - 0.03], [0.5, 0.02, z + 0.03]);
    for (const x of [-0.45, -0.15, 0.15, 0.45]) {
      appendBoxPrism(positions, [x - 0.03, -0.28, z - 0.04], [x + 0.03, 0.5, z + 0.04]);
    }
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

function tagObject(object, role, extra = {}) {
  object.userData.cobraCanyon = Object.freeze({
    schema: COBRA_CANYON_PRESENTATION_SCHEMA,
    role,
    ...PRESENTATION_TAG,
    ...extra,
  });
  object.castShadow = false;
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
    roads: { color: 0xb0683c, emissive: 0x241008, roughness: 1 },
    heroCells: { color: 0x6a5030, roughness: 1 },
    landmarks: { color: 0xffffff, roughness: 0.95 },
    hazards: { color: 0xe96a43, emissive: 0x411006, roughness: 0.8 },
    "bridge-deck": { color: 0xd46a48, emissive: 0x3a1006, roughness: 0.88 },
    "bridge-pier": { color: 0xb85a3c, emissive: 0x2c0c06, roughness: 0.9 },
    vegetation: { color: 0xffffff, roughness: 1 },
  }[role];
  const material = new THREE.MeshLambertMaterial({
    color: parameters.color,
    emissive: parameters.emissive ?? 0x000000,
    flatShading: role !== "heroCells",
    side: role === "roads" ? THREE.DoubleSide : THREE.FrontSide,
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

function basinGeometry(THREE, plan, qualityTier) {
  const positions = [];
  const concavity = [];
  const indices = [];
  const bounds = boundsFrom(plan);
  if (!bounds) return null;
  const segments = COBRA_CANYON_TERRAIN_SEGMENTS[qualityTier];
  const columnCount = segments + 1;
  const eastStepM = (bounds.maximumEastM - bounds.minimumEastM) / segments;
  const northStepM = (bounds.maximumNorthM - bounds.minimumNorthM) / segments;
  const heights = new Float32Array(columnCount * columnCount);
  for (let northIndex = 0; northIndex <= segments; northIndex++) {
    const northM = bounds.minimumNorthM + northIndex * northStepM;
    for (let eastIndex = 0; eastIndex <= segments; eastIndex++) {
      heights[northIndex * columnCount + eastIndex] =
        sampleCobraCanyonTerrain(plan, bounds.minimumEastM + eastIndex * eastStepM, northM);
    }
  }
  const heightAt = (eastIndex, northIndex) => heights[
    clamp(northIndex, 0, segments) * columnCount + clamp(eastIndex, 0, segments)
  ];
  const paint = COBRA_CANYON_VISUAL_PROFILE.terrainPaint;
  for (let northIndex = 0; northIndex <= segments; northIndex++) {
    const northM = bounds.minimumNorthM + northIndex * northStepM;
    for (let eastIndex = 0; eastIndex <= segments; eastIndex++) {
      const eastM = bounds.minimumEastM + eastIndex * eastStepM;
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
  for (let northIndex = 0; northIndex < segments; northIndex++) {
    for (let eastIndex = 0; eastIndex < segments; eastIndex++) {
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
  const bounds = boundsFrom(plan);
  const segments = COBRA_CANYON_TERRAIN_SEGMENTS[qualityTier];
  if (!bounds || !segments) throw new TypeError(`Unknown Cobra Canyon quality tier: ${qualityTier}.`);
  const east = clamp(finite(eastM), bounds.minimumEastM, bounds.maximumEastM);
  const north = clamp(finite(northM), bounds.minimumNorthM, bounds.maximumNorthM);
  const eastStepM = (bounds.maximumEastM - bounds.minimumEastM) / segments;
  const northStepM = (bounds.maximumNorthM - bounds.minimumNorthM) / segments;
  const eastCell = clamp(Math.floor((east - bounds.minimumEastM) / eastStepM), 0, segments - 1);
  const northCell = clamp(
    Math.floor((north - bounds.minimumNorthM) / northStepM),
    0,
    segments - 1,
  );
  const east0 = bounds.minimumEastM + eastCell * eastStepM;
  const north0 = bounds.minimumNorthM + northCell * northStepM;
  const eastBlend = clamp((east - east0) / eastStepM, 0, 1);
  const northBlend = clamp((north - north0) / northStepM, 0, 1);
  const northWest = Math.fround(sampleCobraCanyonTerrain(plan, east0, north0));
  const northEast = Math.fround(sampleCobraCanyonTerrain(plan, east0 + eastStepM, north0));
  const southWest = Math.fround(sampleCobraCanyonTerrain(plan, east0, north0 + northStepM));
  const southEast = Math.fround(sampleCobraCanyonTerrain(
    plan,
    east0 + eastStepM,
    north0 + northStepM,
  ));
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
  const bounds = boundsFrom(plan);
  const segments = COBRA_CANYON_TERRAIN_SEGMENTS[qualityTier];
  const eastStepM = (bounds.maximumEastM - bounds.minimumEastM) / segments;
  const northStepM = (bounds.maximumNorthM - bounds.minimumNorthM) / segments;
  const eastValues = polygon.map((point) => point.eastM);
  const northValues = polygon.map((point) => point.northM);
  const minimumEastCell = clamp(
    Math.floor((Math.min(...eastValues) - bounds.minimumEastM) / eastStepM),
    0,
    segments - 1,
  );
  const maximumEastCell = clamp(
    Math.floor((Math.max(...eastValues) - bounds.minimumEastM) / eastStepM),
    0,
    segments - 1,
  );
  const minimumNorthCell = clamp(
    Math.floor((Math.min(...northValues) - bounds.minimumNorthM) / northStepM),
    0,
    segments - 1,
  );
  const maximumNorthCell = clamp(
    Math.floor((Math.max(...northValues) - bounds.minimumNorthM) / northStepM),
    0,
    segments - 1,
  );
  for (let northCell = minimumNorthCell; northCell <= maximumNorthCell; northCell++) {
    const north0 = bounds.minimumNorthM + northCell * northStepM;
    const north1 = north0 + northStepM;
    for (let eastCell = minimumEastCell; eastCell <= maximumEastCell; eastCell++) {
      const east0 = bounds.minimumEastM + eastCell * eastStepM;
      const east1 = east0 + eastStepM;
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

function appendDrapedRibbon(
  positions,
  plan,
  qualityTier,
  points,
  widthM,
  fieldValues,
  fieldForSegment,
) {
  const halfWidthM = Math.max(0.05, widthM * 0.5);
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
    appendDrapedRibbon(
      positions,
      plan,
      qualityTier,
      points,
      widthM,
      riverFrame,
      role === "river"
        ? (from, to) => riverFrameField(waterWidthM * 0.5, from, to)
        : null,
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
    const authoredHeightM = Math.max(4, point.y - groundY);
    if (kind === "steel-truss-bridge" || kind === "radio-mast" || kind === "water-tower") {
      continue;
    }
    if (kind === "forward-operating-base") {
      add(record, point, "pad-west", [-24, 0, 0], [30, 1.2, 30]);
      add(record, point, "pad-centre", [12, 0, -18], [26, 1.2, 26]);
      add(record, point, "signal-mast", [0, 0, 22], [2, Math.max(30, authoredHeightM), 2]);
    } else if (kind === "waterfall") {
      add(record, point, "water-ribbon", [0, 0, 0], [18, Math.max(90, authoredHeightM), 3]);
    } else if (kind === "rock-spires") {
      add(record, point, "spire-one", [-18, 0, 6], [14, authoredHeightM * 0.72, 16]);
      add(record, point, "spire-two", [4, 0, -8], [17, authoredHeightM, 19]);
      add(record, point, "spire-three", [26, 0, 10], [12, authoredHeightM * 0.61, 14]);
    } else if (kind === "ridge-gate") {
      add(record, point, "tooth-west", [-34, 0, 0], [42, authoredHeightM, 54]);
      add(record, point, "tooth-east", [34, 0, 0], [38, authoredHeightM * 0.84, 48]);
    } else if (kind === "hill-pagoda") {
      add(record, point, "base", [0, 0, 0], [26, authoredHeightM * 0.32, 22]);
      add(record, point, "roof-low", [0, 0, 0], [34, authoredHeightM * 0.52, 30]);
      add(record, point, "roof-high", [0, 0, 0], [24, authoredHeightM * 0.73, 20]);
      add(record, point, "spire", [0, 0, 0], [4, authoredHeightM, 4]);
    } else if (kind === "open-quarry") {
      add(record, point, "quarry-cut", [0, -3, 0], [150, 6, 110]);
    } else if (kind === "mill-chimney") {
      add(record, point, "mill", [-12, 0, 0], [34, 12, 26]);
      add(record, point, "stack", [18, 0, 0], [7, Math.max(42, authoredHeightM), 7]);
    } else if (kind === "signal-smoke") {
      add(record, point, "smoke-column", [0, 0, 0], [7, Math.max(60, authoredHeightM), 7]);
    } else {
      add(record, point, "silhouette", [0, 0, 0], [12, 18, 12]);
    }
  }
  return placements;
}

function landmarkColor(kind) {
  const token = stableToken(kind);
  if (token === "forward-operating-base") return [0.52, 0.34, 0.18];
  if (token === "waterfall") return [0.62, 0.76, 0.70];
  if (token === "rock-spires") return [0.58, 0.55, 0.40];
  if (token === "ridge-gate") return [0.34, 0.34, 0.22];
  if (token === "hill-pagoda") return [0.78, 0.76, 0.63];
  if (token === "open-quarry") return [0.54, 0.27, 0.14];
  if (token === "mill-chimney") return [0.40, 0.34, 0.26];
  if (token === "signal-smoke") return [0.65, 0.42, 0.16];
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
  const assetKit = createCobraCanyonAssetKit(THREE, plan, {
    qualityTier,
    maxInstances: budget.maxAssetInstances,
  });
  group.add(assetKit.group);

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
    assetKit.update({ ambientBudgetLevel, nearRingVisible });
    currentDiagnostics = snapshots[ambientBudgetLevel][nearRingVisible ? 1 : 0];
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
