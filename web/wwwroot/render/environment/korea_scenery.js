import { mergeGeometries } from "../../vendor/three/addons/utils/BufferGeometryUtils.js";
import {
  addUkraineSoftWorldFog,
  UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE,
  UKRAINE_SOFT_WORLD_HAZE_MIX,
  UKRAINE_SOFT_WORLD_HAZE_RGB,
} from "./soft_world_atmosphere.js";
import {
  ambientExclusionIdentity,
  finite,
  fraction,
  hashString,
  KOREA_SCENERY_PROFILES,
  mixedUint32,
  normaliseAmbientExclusionZones,
  planKoreaScenery,
  pointInsideAmbientExclusion,
  QUALITY,
  seededUnit,
  surfaceSample,
} from "./korea_scenery_planner.js";

// Preserve the established public scenery API while the worker imports the pure leaf directly.
export {
  KOREA_SCENERY_PROFILES,
  planKoreaScenery,
} from "./korea_scenery_planner.js";

// One chunk-time matrix now places a whole small stand. The extra silhouettes live in the shared
// geometry, so forest density costs vertices/fill on the under-drawn GPU instead of multiplying
// the synchronous LOD0 planning and matrix-composition work that already hitches the main thread.
export const KOREA_TREE_STAND_SIZE = 7;
export const UKRAINE_NEAR_RING_STAND_SIZE = 5;
// Mid-ring (terrain LOD1) Ukraine stands use one purpose-built asymmetric canopy hull. A single
// broad mass reads more naturally than three octahedral "diamonds" and costs only 24 triangles.
export const UKRAINE_MID_RING_STAND_SIZE = 1;
// One dominant stem survives inside each five-lobe painted stand. At aircraft height the canopy
// owns the silhouette; extra cylinders were invisible cost that is better spent rounding each
// crown lobe away from the old diamond profile.
export const UKRAINE_NEAR_RING_VISIBLE_TRUNKS = 1;
export const SOFT_WORLD_GRASS_BLADES_PER_PATCH = 24;

const TREE_STAND_LAYOUT = Object.freeze([
  Object.freeze({ x: 0, z: 0, height: 1, radius: 1, shade: 1.00 }),
  Object.freeze({ x: -1.75, z: 0.55, height: 0.76, radius: 0.82, shade: 0.88 }),
  Object.freeze({ x: 1.45, z: -0.72, height: 0.88, radius: 0.90, shade: 1.08 }),
  Object.freeze({ x: 0.48, z: 1.72, height: 0.68, radius: 0.76, shade: 0.94 }),
  Object.freeze({ x: -0.72, z: -1.68, height: 0.64, radius: 0.72, shade: 1.04 }),
  Object.freeze({ x: 2.28, z: 1.05, height: 0.58, radius: 0.66, shade: 0.84 }),
  Object.freeze({ x: -2.18, z: -0.92, height: 0.55, radius: 0.64, shade: 0.98 }),
]);

const UKRAINE_MID_RING_STAND_LAYOUT = Object.freeze(
  TREE_STAND_LAYOUT.slice(0, UKRAINE_MID_RING_STAND_SIZE),
);
const UKRAINE_NEAR_RING_STAND_LAYOUT = Object.freeze(
  TREE_STAND_LAYOUT.slice(0, UKRAINE_NEAR_RING_STAND_SIZE),
);
const UKRAINE_NEAR_RING_TRUNK_LAYOUT = Object.freeze(
  TREE_STAND_LAYOUT.slice(0, UKRAINE_NEAR_RING_VISIBLE_TRUNKS),
);

const SCENERY_BUDGET = Object.freeze({
  0: Object.freeze({ crownFraction: 1, fieldFraction: 1, hideSecondary: false }),
  1: Object.freeze({ crownFraction: 0.60, fieldFraction: 1, hideSecondary: true }),
  2: Object.freeze({ crownFraction: 0.35, fieldFraction: 0.50, hideSecondary: true }),
});

const SCENERY_BUDGET_HIDDEN_NAMES = new Set([
  "PROCEDURAL_SOFT_WORLD_GRASS",
  "PROCEDURAL_TREE_TRUNKS",
  "PROCEDURAL_ROAD_MARKINGS",
  "PROCEDURAL_POWER_LINES",
]);

const BUILDING_COMPOUND_LAYOUT = Object.freeze([
  Object.freeze({ x: 0, z: 0, width: 1, depth: 1, height: 1 }),
  Object.freeze({ x: 0.92, z: 0.48, width: 0.58, depth: 0.62, height: 0.66 }),
  Object.freeze({ x: -0.78, z: -0.68, width: 0.50, depth: 0.68, height: 0.74 }),
]);


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
  if ((controller.group.userData.koreaSceneryBudgetLevel ?? 0) >= 1) {
    if (controller.mesh) controller.mesh.visible = false;
    return;
  }
  const camera = frame.cameraPosition;
  if (!camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.z)) return;
  const maximumAltitudeM = profile.localGrassMaximumCameraAltitudeM ?? 1_800;
  const cameraAglM = finite(frame.cameraAglM, finite(camera.y));
  if (cameraAglM > maximumAltitudeM) {
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
        if (pointInsideAmbientExclusion(
          candidate.eastM,
          candidate.northM,
          controller.ambientExclusionZones,
        )) continue;
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

function createSoftWorldCanopyHull(THREE) {
  const segments = 6;
  const positions = [0.10, 1.0, -0.07];
  const upperRadii = [0.90, 0.82, 0.96, 0.86, 0.98, 0.84];
  const lowerRadii = [1.00, 0.92, 1.06, 0.90, 1.03, 0.95];
  for (let index = 0; index < segments; index++) {
    const angle = index / segments * Math.PI * 2;
    positions.push(
      Math.cos(angle) * upperRadii[index] + 0.05,
      0.66 + (index % 2) * 0.035,
      Math.sin(angle) * upperRadii[index] - 0.03,
    );
  }
  for (let index = 0; index < segments; index++) {
    const angle = index / segments * Math.PI * 2;
    positions.push(
      Math.cos(angle) * lowerRadii[index] - 0.04,
      0.20 - (index % 3) * 0.018,
      Math.sin(angle) * lowerRadii[index] + 0.04,
    );
  }
  const bottomIndex = positions.length / 3;
  positions.push(-0.08, -0.04, 0.06);
  const indices = [];
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % segments;
    const upper = 1 + index;
    const upperNext = 1 + next;
    const lower = 1 + segments + index;
    const lowerNext = 1 + segments + next;
    indices.push(
      0, upperNext, upper,
      upper, lower, upperNext,
      upperNext, lower, lowerNext,
      bottomIndex, lower, lowerNext,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
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

function createTreeStandGeometry(
  crownPrimitive,
  trunkPrimitive,
  crownLayout = TREE_STAND_LAYOUT,
  trunkLayout = crownLayout,
) {
  const crowns = mergeLayout(crownPrimitive, crownLayout, (geometry, tree) => {
    geometry.scale(tree.radius, tree.height, tree.radius);
    geometry.translate(tree.x, 0, tree.z);
    // A shared per-lobe value ladder breaks up the single-colour blob while preserving one
    // instanced draw and one per-stand palette colour. Position.clone() gives us a compatible
    // three-component BufferAttribute without adding a THREE dependency to this helper.
    const colors = geometry.getAttribute("position").clone();
    const shade = finite(tree.shade, 1);
    for (let index = 0; index < colors.count; index++) {
      colors.setXYZ(index, shade * 0.96, shade, shade * 0.92);
    }
    geometry.setAttribute("color", colors);
  });
  const trunks = trunkPrimitive && trunkLayout.length
    ? mergeLayout(trunkPrimitive, trunkLayout, (geometry, tree) => {
      const trunkRadius = 0.172 * tree.radius;
      geometry.scale(trunkRadius, tree.height * 0.48, trunkRadius);
      geometry.translate(tree.x, 0, tree.z);
    })
    : null;
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

/**
 * Apply one reversible ambient-scenery budget rung to a scenery tile.
 *
 * The function deliberately keys only off the procedural ambient batch names created below. It
 * has no mission-feature knowledge and leaves buildings, roofs, roads, rails, runways and poles
 * alone at every rung. Each mesh snapshots its authored visibility/count once, so 2 -> 1 -> 0
 * restores the exact original state instead of compounding reductions.
 */
export function applyKoreaSceneryBudgetLevel(group, level = 0) {
  if (!group || typeof group.traverse !== "function") {
    throw new TypeError("Korea scenery budget requires an Object3D group.");
  }
  const numericLevel = Number(level);
  const resolvedLevel = Number.isFinite(numericLevel)
    ? Math.min(2, Math.max(0, Math.trunc(numericLevel)))
    : 0;
  const budget = SCENERY_BUDGET[resolvedLevel];
  group.userData.koreaSceneryBudgetLevel = resolvedLevel;
  group.traverse((child) => {
    if (!child.isInstancedMesh) return;
    const state = child.userData.koreaSceneryBudgetBase
      ?? Object.freeze({ count: child.count, visible: child.visible });
    child.userData.koreaSceneryBudgetBase = state;
    child.visible = SCENERY_BUDGET_HIDDEN_NAMES.has(child.name) && budget.hideSecondary
      ? false
      : state.visible;
    if (child.name === "PROCEDURAL_TREE_CROWNS") {
      child.count = Math.ceil(state.count * budget.crownFraction);
    } else if (/_LAND_USE$/.test(child.name)) {
      child.count = Math.ceil(state.count * budget.fieldFraction);
    } else {
      child.count = state.count;
    }
  });
  return resolvedLevel;
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
  const ambientExclusionZones = normaliseAmbientExclusionZones(
    options.ambientExclusionZones,
  );
  const exclusionIdentity = ambientExclusionIdentity(ambientExclusionZones);
  const fallbackAtmosphereUniforms = {
    uFogColor: { value: new THREE.Color(0xd2c4a8) },
    uFogDensity: { value: 0.000052 },
    uAtmosphereDensityScale: { value: UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE },
    uAtmosphereHazeColor: {
      value: new THREE.Color(...UKRAINE_SOFT_WORLD_HAZE_RGB),
    },
    uAtmosphereHazeMix: { value: UKRAINE_SOFT_WORLD_HAZE_MIX },
    uWorldEdgeM: { value: 0 },
    uHazeBands: { value: 3 },
    uHazeBandBlend: { value: 0.18 },
  };
  const atmosphereUniforms = Object.fromEntries(
    Object.entries(fallbackAtmosphereUniforms).map(([name, fallback]) => [
      name,
      options.atmosphereUniforms?.[name] ?? fallback,
    ]),
  );
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
  // Six radial sides remove the square/diamond read of the old 4×3 primitive. One visible stem
  // keeps a complete five-lobe near stand under 160 triangles; the mid ring uses one asymmetric
  // 24-triangle shoulder hull and no invisible trunk geometry.
  const crownPrimitive = softCanopy
    ? (() => {
      const geometry = new THREE.SphereGeometry(1, 6, 3);
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
      const geometry = createSoftWorldCanopyHull(THREE);
      geometry.scale(1.42, 1.18, 1.30);
      geometry.translate(0, 0.10, 0);
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
  const midTrunkPrimitive = softCanopy ? null : trunkPrimitive.clone();
  const treeStandGeometry = createTreeStandGeometry(
    crownPrimitive,
    trunkPrimitive,
    softCanopy ? UKRAINE_NEAR_RING_STAND_LAYOUT : TREE_STAND_LAYOUT,
    softCanopy ? UKRAINE_NEAR_RING_TRUNK_LAYOUT : TREE_STAND_LAYOUT,
  );
  const midTreeStandGeometry = createTreeStandGeometry(
    midCrownPrimitive,
    midTrunkPrimitive,
    UKRAINE_MID_RING_STAND_LAYOUT,
    softCanopy ? [] : UKRAINE_MID_RING_STAND_LAYOUT,
  );
  const crownGeometry = treeStandGeometry.crowns;
  const trunkGeometry = treeStandGeometry.trunks;
  const midCrownGeometry = midTreeStandGeometry.crowns;
  const midTrunkGeometry = midTreeStandGeometry.trunks;
  crownPrimitive.dispose();
  trunkPrimitive.dispose();
  if (midCrownPrimitive !== crownPrimitive) midCrownPrimitive.dispose();
  if (midTrunkPrimitive && midTrunkPrimitive !== trunkPrimitive) midTrunkPrimitive.dispose();
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
  crownMaterial.vertexColors = softCanopy;
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
  if (profile.theatre === "ukraine") {
    for (const material of materials) {
      addUkraineSoftWorldFog(material, atmosphereUniforms);
    }
  }
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
    update({ elapsedSeconds, windX, windZ, cameraPosition, cameraAglM,
      fogColor, fogDensity, worldEdgeM,
      placementEastM, placementNorthM } = {}) {
      if (disposed) return;
      if (fogColor) atmosphereUniforms.uFogColor.value.copy(fogColor);
      if (Number.isFinite(fogDensity)) atmosphereUniforms.uFogDensity.value = fogDensity;
      if (Number.isFinite(worldEdgeM)) atmosphereUniforms.uWorldEdgeM.value = worldEdgeM;
      if (!grassMaterial) return;
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
          { cameraPosition, cameraAglM, placementEastM, placementNorthM },
          profile,
          grassWork,
          ensureGrassMesh,
          updateBudget,
        );
      }
    },
    createTile(chunk, decoded, level = 0, preparedPlan = null) {
      if (disposed || level < 0 || level > maximumSceneryLevel) return null;
      const ring = level >= 1 ? "mid" : "near";
      const reducedMidRing = ring === "mid" && profile.theatre === "ukraine";
      const standSize = profile.theatre === "ukraine"
        ? reducedMidRing ? UKRAINE_MID_RING_STAND_SIZE : UKRAINE_NEAR_RING_STAND_SIZE
        : KOREA_TREE_STAND_SIZE;
      const activeCrownGeometry = reducedMidRing ? midCrownGeometry : crownGeometry;
      const activeTrunkGeometry = reducedMidRing ? midTrunkGeometry : trunkGeometry;
      const preparedPlanMatches = preparedPlan?.era === era
        && preparedPlan?.qualityTier === qualityTier
        && preparedPlan?.ring === ring
        && preparedPlan?.ambientExclusionIdentity === exclusionIdentity
        && Array.isArray(preparedPlan?.trees)
        && Array.isArray(preparedPlan?.buildings);
      const plan = preparedPlanMatches
        ? preparedPlan
        : planKoreaScenery(chunk, decoded, {
          era,
          qualityTier,
          ring,
          ambientExclusionZones,
        });
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
        const trunks = activeTrunkGeometry
          ? new THREE.InstancedMesh(
            activeTrunkGeometry, trunkMaterial, plan.trees.length,
          )
          : null;
        const crownColors = new Float32Array(plan.trees.length * 3);
        crowns.name = "PROCEDURAL_TREE_CROWNS";
        if (trunks) trunks.name = "PROCEDURAL_TREE_TRUNKS";
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
        if (trunks) trunks.instanceMatrix.array.set(crowns.instanceMatrix.array);
        crowns.instanceColor = new THREE.InstancedBufferAttribute(crownColors, 3);
        crowns.instanceMatrix.needsUpdate = true;
        if (trunks) trunks.instanceMatrix.needsUpdate = true;
        crowns.instanceColor.needsUpdate = true;
        group.add(crowns);
        if (trunks) group.add(trunks);
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
          ambientExclusionZones,
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
