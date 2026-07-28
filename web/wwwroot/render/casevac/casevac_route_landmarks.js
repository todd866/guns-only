/**
 * Ordinary landscape cues for projected masked Medevac reference routes.
 *
 * This module turns only server-projected MASKED control-point geometry into a
 * subdued drainage / sunken-road bed with sparse shelterbelt vegetation.  It is
 * deliberately not a route overlay: there are no lines, arrows, beacons,
 * animated materials, scoring rails, collision shapes, or authority flowing
 * back into the simulation.
 */

export const CASEVAC_ROUTE_LANDMARKS_SCHEMA =
  "casevac.route-landmarks.presentation.v1";
export const CASEVAC_ROUTE_LANDMARK_LIMIT = 16;
export const CASEVAC_ROUTE_POINT_LIMIT = 32;
export const CASEVAC_ROUTE_VEGETATION_LIMIT = 96;
export const CASEVAC_ROUTE_DRAINAGE_WIDTH_M = 11;
export const CASEVAC_ROUTE_CHANNEL_WIDTH_M = 2.8;
export const CASEVAC_ROUTE_SURFACE_OFFSET_M = 0.035;

const VEGETATION_SPACING_M = 175;
const MINIMUM_TREE_OFFSET_M = 8.5;
const MAXIMUM_TREE_OFFSET_M = 16;

const COLORS = Object.freeze({
  drainageShoulder: 0x626047,
  drainageBed: 0x3e4b3f,
  willowTrunk: 0x605443,
  willowCanopy: 0x536c4d,
});

function validateThree(THREE) {
  for (const name of [
    "Group",
    "Mesh",
    "InstancedMesh",
    "BufferGeometry",
    "Float32BufferAttribute",
    "CylinderGeometry",
    "SphereGeometry",
    "MeshLambertMaterial",
    "Vector3",
    "Quaternion",
    "Matrix4",
  ]) {
    if (typeof THREE?.[name] !== "function")
      throw new TypeError(`CASEVAC route landmarks require THREE.${name}.`);
  }
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new TypeError(`${label} must be finite.`);
  return number;
}

function stableId(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} must be a stable id.`);
  return value.trim();
}

function normalizePoint(point, routeId, index) {
  if (!point || typeof point !== "object")
    throw new TypeError(`${routeId}.control_points[${index}] must be an object.`);
  return Object.freeze({
    id: typeof point.id === "string" && point.id.trim()
      ? point.id.trim()
      : null,
    eastM: finite(
      point.east_m,
      `${routeId}.control_points[${index}].east_m`,
    ),
    northM: finite(
      point.north_m,
      `${routeId}.control_points[${index}].north_m`,
    ),
    surfaceElevationM: finite(
      point.surface_elevation_m,
      `${routeId}.control_points[${index}].surface_elevation_m`,
    ),
  });
}

function normalizeRoutes(projectedRoutes) {
  if (!Array.isArray(projectedRoutes))
    throw new TypeError("casevac_routes must be an array.");
  if (projectedRoutes.length > CASEVAC_ROUTE_LANDMARK_LIMIT)
    throw new RangeError("Projected CASEVAC routes exceed the landmark limit.");

  const routes = [];
  for (const projected of projectedRoutes) {
    // DIRECT and unknown routes are intentionally not represented in-world.
    if (projected?.kind !== "MASKED") continue;
    const id = stableId(projected.id, "A projected MASKED route id");
    if (!Array.isArray(projected.control_points))
      throw new TypeError(`${id}.control_points must be an array.`);
    if (projected.control_points.length > CASEVAC_ROUTE_POINT_LIMIT)
      throw new RangeError(`${id} exceeds the landmark control-point limit.`);
    if (projected.control_points.length < 2)
      throw new RangeError(`${id} requires at least two control points.`);
    const points = projected.control_points.map((point, index) =>
      normalizePoint(point, id, index));
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      if (previous.eastM === current.eastM
          && previous.northM === current.northM)
        throw new RangeError(`${id} has a zero-length control-point segment.`);
    }
    routes.push(Object.freeze({
      id,
      points: Object.freeze(points),
    }));
  }
  const ids = new Set(routes.map((route) => route.id));
  if (ids.size !== routes.length)
    throw new RangeError("Projected MASKED route ids must be unique.");
  return Object.freeze(routes);
}

function tagPresentationOnly(object, kind, routeId = null) {
  object.userData.casevac = Object.freeze({
    schema: CASEVAC_ROUTE_LANDMARKS_SCHEMA,
    kind,
    routeId,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
  });
  return object;
}

function resourceOwner() {
  const geometries = new Set();
  const materials = new Set();
  return {
    geometry(value) {
      geometries.add(value);
      return value;
    },
    material(value) {
      materials.add(value);
      return value;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}

function toRenderPoint(THREE, point, yOffsetM) {
  // Simulation +Z is north.  The production renderer mirrors north once here.
  return new THREE.Vector3(
    point.eastM,
    point.surfaceElevationM + yOffsetM,
    -point.northM,
  );
}

function ribbonGeometry(
  THREE,
  owner,
  route,
  widthM,
  yOffsetM,
) {
  const centres = route.points.map((point) =>
    toRenderPoint(THREE, point, yOffsetM));
  const positions = [];
  const indices = [];

  for (let index = 0; index < centres.length; index++) {
    const centre = centres[index];
    const previous = centres[Math.max(0, index - 1)];
    const next = centres[Math.min(centres.length - 1, index + 1)];
    let tangentX = next.x - previous.x;
    let tangentZ = next.z - previous.z;
    let tangentLength = Math.hypot(tangentX, tangentZ);
    if (tangentLength < 1e-9) {
      const adjacent = index === 0 ? next : previous;
      tangentX = centre.x - adjacent.x;
      tangentZ = centre.z - adjacent.z;
      tangentLength = Math.hypot(tangentX, tangentZ);
    }
    const normalX = -tangentZ / tangentLength;
    const normalZ = tangentX / tangentLength;
    const halfWidthM = widthM * 0.5;
    positions.push(
      centre.x + normalX * halfWidthM,
      centre.y,
      centre.z + normalZ * halfWidthM,
      centre.x - normalX * halfWidthM,
      centre.y,
      centre.z - normalZ * halfWidthM,
    );
    if (index > 0) {
      const priorLeft = (index - 1) * 2;
      const priorRight = priorLeft + 1;
      const left = index * 2;
      const right = left + 1;
      indices.push(priorLeft, priorRight, left, priorRight, right, left);
    }
  }

  const geometry = owner.geometry(new THREE.BufferGeometry());
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.casevacCentreline = Object.freeze({
    exactProjectedControlPoints: true,
    coordinateFrame: "RENDER_EAST_UP_NEGATIVE_NORTH",
    routeId: route.id,
    controlPoints: Object.freeze(centres.map((point) => Object.freeze({
      x: point.x,
      y: point.y,
      z: point.z,
    }))),
  });
  return geometry;
}

function createRouteLandscape(
  THREE,
  owner,
  route,
  materials,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    "masked-route-landscape",
    route.id,
  );
  group.name = "CASEVAC_MASKED_ROUTE_LANDSCAPE";

  const shoulder = tagPresentationOnly(
    new THREE.Mesh(
      ribbonGeometry(
        THREE,
        owner,
        route,
        CASEVAC_ROUTE_DRAINAGE_WIDTH_M,
        CASEVAC_ROUTE_SURFACE_OFFSET_M,
      ),
      materials.shoulder,
    ),
    "drainage-sunken-road-shoulder",
    route.id,
  );
  shoulder.name = "CASEVAC_MASKED_DRAINAGE_SHOULDER";

  const bed = tagPresentationOnly(
    new THREE.Mesh(
      ribbonGeometry(
        THREE,
        owner,
        route,
        CASEVAC_ROUTE_CHANNEL_WIDTH_M,
        CASEVAC_ROUTE_SURFACE_OFFSET_M + 0.012,
      ),
      materials.bed,
    ),
    "drainage-sunken-road-bed",
    route.id,
  );
  bed.name = "CASEVAC_MASKED_DRAINAGE_BED";
  group.add(shoulder, bed);
  return group;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value) {
  return hashString(value) / 0xffffffff;
}

function routeVegetation(route, quota) {
  const candidates = [];
  for (let segmentIndex = 0;
    segmentIndex < route.points.length - 1;
    segmentIndex++) {
    const from = route.points[segmentIndex];
    const to = route.points[segmentIndex + 1];
    const dx = to.eastM - from.eastM;
    const dn = to.northM - from.northM;
    const lengthM = Math.hypot(dx, dn);
    const slots = Math.floor(lengthM / VEGETATION_SPACING_M);
    const normalEast = -dn / lengthM;
    const normalNorth = dx / lengthM;
    for (let slot = 0; slot < slots; slot++) {
      const seed = `${route.id}:${segmentIndex}:${slot}`;
      // Regular gaps stop the shelterbelt reading as an artificial marker rail.
      if (hashUnit(`${seed}:gap`) < 0.2) continue;
      const interval = 1 / (slots + 1);
      const jitter = (hashUnit(`${seed}:along`) - 0.5) * interval * 0.62;
      const along = Math.min(0.94, Math.max(0.06, (slot + 1) * interval + jitter));
      const side = hashUnit(`${seed}:side`) < 0.5 ? -1 : 1;
      const offsetM = MINIMUM_TREE_OFFSET_M
        + hashUnit(`${seed}:offset`)
          * (MAXIMUM_TREE_OFFSET_M - MINIMUM_TREE_OFFSET_M);
      candidates.push(Object.freeze({
        routeId: route.id,
        eastM: from.eastM + dx * along + normalEast * offsetM * side,
        northM: from.northM + dn * along + normalNorth * offsetM * side,
        surfaceElevationM: from.surfaceElevationM
          + (to.surfaceElevationM - from.surfaceElevationM) * along,
        yawRad: hashUnit(`${seed}:yaw`) * Math.PI * 2,
        heightM: 6.5 + hashUnit(`${seed}:height`) * 4.2,
        crownRadiusM: 2.1 + hashUnit(`${seed}:crown`) * 1.55,
      }));
    }
  }
  return candidates.slice(0, quota);
}

function vegetationPlacements(routes) {
  if (!routes.length) return Object.freeze([]);
  const baseQuota = Math.floor(
    CASEVAC_ROUTE_VEGETATION_LIMIT / routes.length,
  );
  const remainder = CASEVAC_ROUTE_VEGETATION_LIMIT % routes.length;
  return Object.freeze(routes.flatMap((route, index) =>
    routeVegetation(
      route,
      baseQuota + (index < remainder ? 1 : 0),
    )));
}

function setInstance(mesh, index, position, quaternion, scale, matrix) {
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function createVegetation(
  THREE,
  owner,
  placements,
  materials,
  routes,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    "masked-route-shelterbelt",
  );
  group.name = "CASEVAC_MASKED_ROUTE_SHELTERBELT";
  if (!placements.length) return group;

  const trunkGeometry = owner.geometry(new THREE.CylinderGeometry(
    0.16,
    0.27,
    1,
    6,
    1,
  ));
  trunkGeometry.translate(0, 0.5, 0);
  const canopyGeometry = owner.geometry(new THREE.SphereGeometry(1, 8, 6));
  const trunks = tagPresentationOnly(
    new THREE.InstancedMesh(
      trunkGeometry,
      materials.trunk,
      placements.length,
    ),
    "willow-shelterbelt-trunks",
  );
  const canopies = tagPresentationOnly(
    new THREE.InstancedMesh(
      canopyGeometry,
      materials.canopy,
      placements.length,
    ),
    "willow-shelterbelt-canopies",
  );
  trunks.name = "CASEVAC_MASKED_ROUTE_WILLOW_TRUNKS";
  canopies.name = "CASEVAC_MASKED_ROUTE_WILLOW_CANOPIES";

  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < placements.length; index++) {
    const tree = placements[index];
    quaternion.setFromAxisAngle(yAxis, tree.yawRad);
    position.set(
      tree.eastM,
      tree.surfaceElevationM,
      -tree.northM,
    );
    scale.set(1, tree.heightM * 0.48, 1);
    setInstance(trunks, index, position, quaternion, scale, matrix);
    position.y = tree.surfaceElevationM + tree.heightM * 0.68;
    scale.set(
      tree.crownRadiusM,
      tree.heightM * 0.36,
      tree.crownRadiusM,
    );
    setInstance(canopies, index, position, quaternion, scale, matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  trunks.computeBoundingBox?.();
  trunks.computeBoundingSphere?.();
  canopies.computeBoundingBox?.();
  canopies.computeBoundingSphere?.();
  const routeIds = Object.freeze(routes.map((route) => route.id));
  const placementFacts = Object.freeze(placements.map((tree) => Object.freeze({
    routeId: tree.routeId,
    eastM: tree.eastM,
    northM: tree.northM,
    surfaceElevationM: tree.surfaceElevationM,
  })));
  trunks.userData.casevacVegetation = Object.freeze({
    routeIds,
    placements: placementFacts,
  });
  canopies.userData.casevacVegetation = Object.freeze({
    routeIds,
    placements: placementFacts,
  });
  group.add(trunks, canopies);
  return group;
}

function createMaterials(THREE, owner) {
  const landscape = (color, opacity) => owner.material(
    new THREE.MeshLambertMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  return Object.freeze({
    shoulder: landscape(COLORS.drainageShoulder, 0.74),
    bed: landscape(COLORS.drainageBed, 0.82),
    trunk: owner.material(new THREE.MeshLambertMaterial({
      color: COLORS.willowTrunk,
    })),
    canopy: owner.material(new THREE.MeshLambertMaterial({
      color: COLORS.willowCanopy,
    })),
  });
}

export function createCasevacRouteLandmarks(
  THREE,
  casevacRoutes,
) {
  validateThree(THREE);
  const routes = normalizeRoutes(casevacRoutes);
  const owner = resourceOwner();
  const materials = createMaterials(THREE, owner);
  const root = tagPresentationOnly(
    new THREE.Group(),
    "masked-route-landmarks-root",
  );
  root.name = "CASEVAC_MASKED_ROUTE_LANDMARKS_PRESENTATION_ONLY";

  for (const route of routes) {
    root.add(createRouteLandscape(
      THREE,
      owner,
      route,
      materials,
    ));
  }
  const placements = vegetationPlacements(routes);
  root.add(createVegetation(
    THREE,
    owner,
    placements,
    materials,
    routes,
  ));
  root.userData.casevacRouteLandmarks = {
    schema: CASEVAC_ROUTE_LANDMARKS_SCHEMA,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
    coordinateFrame: "RENDER_EAST_UP_NEGATIVE_NORTH",
    terrainConformance: "PROJECTED_CONTROL_POINTS_LINEAR_INTERPOLATION",
    maskedRouteCount: routes.length,
    vegetationInstanceCount: placements.length,
    disposed: false,
  };

  let disposed = false;
  return Object.freeze({
    group: root,
    routes,
    vegetationCount: placements.length,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.userData.casevacRouteLandmarks.disposed = true;
      root.removeFromParent();
      owner.dispose();
    },
    get disposed() {
      return disposed;
    },
  });
}
