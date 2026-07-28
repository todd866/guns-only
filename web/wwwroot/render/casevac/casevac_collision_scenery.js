/**
 * Browser visuals for collision-authoritative CASEVAC primitives projected by the simulation.
 *
 * The simulation remains the sole collision authority. This module mirrors immutable world
 * geometry into the renderer so no collision truth is invisible; it never feeds geometry or
 * contact results back into the simulation.
 */

export const CASEVAC_COLLISION_SCENERY_SCHEMA =
  "casevac.collision-scenery.presentation.v1";
export const CASEVAC_COLLISION_OBSTACLE_LIMIT = 32;
export const CASEVAC_MINIMUM_SEGMENT_VISUAL_RADIUS_M = 0.18;

const PRIMITIVES = Object.freeze({
  capsuleSegment: "CAPSULE_SEGMENT",
  axisAlignedBox: "AXIS_ALIGNED_BOX",
});

const COLORS = Object.freeze({
  pole: 0x4f4337,
  wire: 0x252a2c,
  orchardAuthorityMass: 0x304b2e,
  orchardTrunk: 0x5b4633,
  orchardCanopy: 0x416b3d,
  clinicAuthorityMass: 0x898d85,
  clinicWall: 0xb9b8aa,
  clinicWing: 0x9da5a2,
  clinicRoof: 0x59666a,
  clinicConcrete: 0x777b77,
  clinicWindow: 0x34454a,
  genericObstacle: 0x85745b,
});

function validateThree(THREE) {
  for (const name of [
    "Group",
    "Mesh",
    "InstancedMesh",
    "Vector3",
    "Quaternion",
    "Matrix4",
    "CylinderGeometry",
    "BoxGeometry",
    "SphereGeometry",
    "MeshLambertMaterial",
  ]) {
    if (typeof THREE?.[name] !== "function")
      throw new TypeError(`CASEVAC collision scenery requires THREE.${name}.`);
  }
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError(`${label} must be finite.`);
  return value;
}

function stableId(value) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError("A projected CASEVAC collision obstacle requires an id.");
  return value.trim();
}

function point(value, label) {
  if (!value || typeof value !== "object")
    throw new TypeError(`${label} must be a world point.`);
  return Object.freeze({
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
    z: finiteNumber(value.z, `${label}.z`),
  });
}

function normalizeObstacle(value) {
  if (!value || typeof value !== "object")
    throw new TypeError("A projected CASEVAC collision obstacle must be an object.");
  const id = stableId(value.id);
  const primitive = value.primitive;
  const radiusM = finiteNumber(value.radius_m, `${id}.radius_m`);
  if (primitive === PRIMITIVES.capsuleSegment) {
    if (radiusM <= 0)
      throw new RangeError(`${id} requires a positive capsule radius.`);
    const startWorldM = point(value.start_world_m, `${id}.start_world_m`);
    const endWorldM = point(value.end_world_m, `${id}.end_world_m`);
    if (startWorldM.x === endWorldM.x
        && startWorldM.y === endWorldM.y
        && startWorldM.z === endWorldM.z)
      throw new RangeError(`${id} requires distinct segment endpoints.`);
    return Object.freeze({
      id,
      primitive,
      radiusM,
      startWorldM,
      endWorldM,
    });
  }
  if (primitive === PRIMITIVES.axisAlignedBox) {
    if (radiusM !== 0)
      throw new RangeError(`${id} axis-aligned box radius must be zero.`);
    const minimumWorldM = point(
      value.minimum_world_m,
      `${id}.minimum_world_m`,
    );
    const maximumWorldM = point(
      value.maximum_world_m,
      `${id}.maximum_world_m`,
    );
    for (const axis of ["x", "y", "z"]) {
      if (maximumWorldM[axis] <= minimumWorldM[axis])
        throw new RangeError(`${id} requires strict ${axis} min/max bounds.`);
    }
    return Object.freeze({
      id,
      primitive,
      radiusM,
      minimumWorldM,
      maximumWorldM,
    });
  }
  throw new RangeError(`${id} uses an unsupported collision primitive.`);
}

function normalizeObstacles(values) {
  if (!Array.isArray(values))
    throw new TypeError("casevac_collision_obstacles must be an array.");
  if (values.length > CASEVAC_COLLISION_OBSTACLE_LIMIT)
    throw new RangeError("Projected CASEVAC collision obstacles exceed the visual limit.");
  const normalized = values.map(normalizeObstacle);
  const ids = new Set(normalized.map((obstacle) => obstacle.id));
  if (ids.size !== normalized.length)
    throw new RangeError("Projected CASEVAC collision obstacle ids must be unique.");
  return Object.freeze(normalized);
}

function toRenderPoint(THREE, worldPoint) {
  // Simulation +Z is north; the production renderer mirrors north exactly once.
  return new THREE.Vector3(worldPoint.x, worldPoint.y, -worldPoint.z);
}

function tagPresentationOnly(object, kind, obstacle = null) {
  object.userData.casevac = Object.freeze({
    schema: CASEVAC_COLLISION_SCENERY_SCHEMA,
    kind,
    obstacleId: obstacle?.id ?? null,
    primitive: obstacle?.primitive ?? null,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
  });
  return object;
}

function resourceOwner() {
  const geometries = new Set();
  const materials = new Set();
  const instances = new Set();
  return {
    geometries,
    materials,
    instances,
    geometry(value) {
      geometries.add(value);
      return value;
    },
    material(value) {
      materials.add(value);
      return value;
    },
    instance(value) {
      instances.add(value);
      return value;
    },
    dispose() {
      for (const instance of instances) instance.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      instances.clear();
      geometries.clear();
      materials.clear();
    },
  };
}

function createMaterials(THREE, owner) {
  const lambert = (
    color,
    emissiveIntensity = 0.04,
    surfaceDressing = false,
  ) => owner.material(
    new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      polygonOffset: surfaceDressing,
      polygonOffsetFactor: surfaceDressing ? -2 : 0,
      polygonOffsetUnits: surfaceDressing ? -2 : 0,
    }),
  );
  return Object.freeze({
    pole: lambert(COLORS.pole),
    wire: lambert(COLORS.wire),
    orchardAuthorityMass: lambert(COLORS.orchardAuthorityMass),
    orchardTrunk: lambert(COLORS.orchardTrunk),
    orchardCanopy: lambert(COLORS.orchardCanopy, 0.08, true),
    clinicAuthorityMass: lambert(COLORS.clinicAuthorityMass),
    clinicWall: lambert(COLORS.clinicWall, 0.04, true),
    clinicWing: lambert(COLORS.clinicWing, 0.04, true),
    clinicRoof: lambert(COLORS.clinicRoof, 0.04, true),
    clinicConcrete: lambert(COLORS.clinicConcrete, 0.04, true),
    clinicWindow: lambert(COLORS.clinicWindow, 0.12, true),
    genericObstacle: lambert(COLORS.genericObstacle),
  });
}

function createSegmentVisual(
  THREE,
  owner,
  obstacle,
  materials,
  work,
) {
  const wire = obstacle.id.includes("wire");
  const group = tagPresentationOnly(
    new THREE.Group(),
    wire ? "wire-centreline-visual" : "pole-centreline-visual",
    obstacle,
  );
  group.name = wire
    ? "CASEVAC_COLLISION_WIRE_VISUAL"
    : "CASEVAC_COLLISION_POLE_VISUAL";
  const start = toRenderPoint(THREE, obstacle.startWorldM);
  const end = toRenderPoint(THREE, obstacle.endWorldM);
  const direction = work.direction.subVectors(end, start);
  const lengthM = direction.length();
  const visualRadiusM = Math.max(
    obstacle.radiusM,
    CASEVAC_MINIMUM_SEGMENT_VISUAL_RADIUS_M,
  );
  const geometry = owner.geometry(
    new THREE.CylinderGeometry(1, 1, 1, wire ? 8 : 10, 1, false),
  );
  const mesh = tagPresentationOnly(
    new THREE.Mesh(geometry, wire ? materials.wire : materials.pole),
    wire ? "wire-centreline-mesh" : "pole-centreline-mesh",
    obstacle,
  );
  mesh.name = `${group.name}_MESH`;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    work.yAxis,
    direction.normalize(),
  );
  mesh.scale.set(visualRadiusM, lengthM, visualRadiusM);
  mesh.userData.casevacGeometry = Object.freeze({
    startWorldM: obstacle.startWorldM,
    endWorldM: obstacle.endWorldM,
    authorityRadiusM: obstacle.radiusM,
    visualRadiusM,
    exactCentreline: true,
  });
  group.add(mesh);
  return group;
}

function renderBounds(THREE, obstacle) {
  const minimum = toRenderPoint(THREE, obstacle.minimumWorldM);
  const maximum = toRenderPoint(THREE, obstacle.maximumWorldM);
  // The Z mirror swaps min/max ordering; normalize in renderer space.
  const renderMinimum = new THREE.Vector3(
    Math.min(minimum.x, maximum.x),
    Math.min(minimum.y, maximum.y),
    Math.min(minimum.z, maximum.z),
  );
  const renderMaximum = new THREE.Vector3(
    Math.max(minimum.x, maximum.x),
    Math.max(minimum.y, maximum.y),
    Math.max(minimum.z, maximum.z),
  );
  const size = renderMaximum.clone().sub(renderMinimum);
  const centre = renderMinimum.clone().add(renderMaximum).multiplyScalar(0.5);
  return { minimum: renderMinimum, maximum: renderMaximum, size, centre };
}

function authorityGeometry(
  obstacle,
  representation,
  component = null,
  fullVolumeCoverage = false,
) {
  return Object.freeze({
    minimumWorldM: obstacle.minimumWorldM,
    maximumWorldM: obstacle.maximumWorldM,
    representation,
    component,
    authorityBoundsExact: true,
    conservativeSolidCollision: true,
    fullVolumeCoverage,
    opaquePhysicalMass: fullVolumeCoverage,
  });
}

function addBoxComponent(
  THREE,
  group,
  geometry,
  material,
  obstacle,
  representation,
  kind,
  name,
  centre,
  size,
) {
  const mesh = tagPresentationOnly(
    new THREE.Mesh(geometry, material),
    kind,
    obstacle,
  );
  mesh.name = name;
  mesh.position.copy(centre);
  mesh.scale.copy(size);
  mesh.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
    kind,
  );
  group.add(mesh);
  return mesh;
}

function addExactAuthorityMass(
  THREE,
  owner,
  group,
  material,
  obstacle,
  representation,
  kind,
  name,
  bounds,
) {
  const mesh = addBoxComponent(
    THREE,
    group,
    owner.geometry(new THREE.BoxGeometry(1, 1, 1)),
    material,
    obstacle,
    representation,
    kind,
    name,
    bounds.centre,
    bounds.size,
  );
  mesh.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
    kind,
    true,
  );
  return mesh;
}

function setInstance(mesh, index, position, scale, work) {
  work.matrix.compose(position, work.identityQuaternion, scale);
  mesh.setMatrixAt(index, work.matrix);
}

function finishInstances(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox?.();
  mesh.computeBoundingSphere?.();
  return mesh;
}

function deterministicOffset(row, column, axis) {
  const phase = row * 17.17 + column * 31.31 + axis * 13.13;
  return Math.sin(phase) * 0.5 + Math.cos(phase * 0.73) * 0.5;
}

function createOrchardCompound(
  THREE,
  owner,
  obstacle,
  materials,
  work,
) {
  const representation = "dense-orchard-windbreak-compound";
  const bounds = renderBounds(THREE, obstacle);
  const group = tagPresentationOnly(
    new THREE.Group(),
    "orchard-physical-compound",
    obstacle,
  );
  group.name = "CASEVAC_COLLISION_ORCHARD_PHYSICAL_COMPOUND";
  group.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
  );

  addExactAuthorityMass(
    THREE,
    owner,
    group,
    materials.orchardAuthorityMass,
    obstacle,
    representation,
    "orchard-authority-solid-mass",
    "CASEVAC_ORCHARD_EXACT_AUTHORITY_SOLID_MASS",
    bounds,
  );

  const columns = Math.max(5, Math.min(12, Math.round(bounds.size.x / 34)));
  const rows = Math.max(5, Math.min(12, Math.round(bounds.size.z / 34)));
  const count = rows * columns;
  const xMargin = Math.min(18, bounds.size.x * 0.1);
  const zMargin = Math.min(18, bounds.size.z * 0.1);
  const xStep = (bounds.size.x - xMargin * 2) / Math.max(1, columns - 1);
  const zStep = (bounds.size.z - zMargin * 2) / Math.max(1, rows - 1);
  const trunkGeometry = owner.geometry(
    new THREE.CylinderGeometry(1, 1, 1, 7, 1, false),
  );
  const canopyGeometry = owner.geometry(
    new THREE.SphereGeometry(1, 12, 8),
  );
  const trunks = owner.instance(tagPresentationOnly(
    new THREE.InstancedMesh(
      trunkGeometry,
      materials.orchardTrunk,
      count,
    ),
    "orchard-tree-trunks",
    obstacle,
  ));
  trunks.name = "CASEVAC_ORCHARD_AUTHORITY_TREE_TRUNKS";
  trunks.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
    "orchard-tree-trunks",
  );
  const canopies = owner.instance(tagPresentationOnly(
    new THREE.InstancedMesh(
      canopyGeometry,
      materials.orchardCanopy,
      count,
    ),
    "orchard-tree-canopies",
    obstacle,
  ));
  canopies.name = "CASEVAC_ORCHARD_AUTHORITY_TREE_CANOPIES";
  canopies.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
    "orchard-tree-canopies",
  );

  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const baseX = bounds.minimum.x + xMargin + column * xStep;
      const baseZ = bounds.minimum.z + zMargin + row * zStep;
      const jitterX = deterministicOffset(row, column, 0)
        * Math.min(3.2, xStep * 0.09);
      const jitterZ = deterministicOffset(row, column, 1)
        * Math.min(3.2, zStep * 0.09);
      const x = Math.min(
        bounds.maximum.x - xMargin,
        Math.max(bounds.minimum.x + xMargin, baseX + jitterX),
      );
      const z = Math.min(
        bounds.maximum.z - zMargin,
        Math.max(bounds.minimum.z + zMargin, baseZ + jitterZ),
      );
      const crownX = column === 0 || column === columns - 1
        ? Math.min(
          x - bounds.minimum.x,
          bounds.maximum.x - x,
        )
        : Math.min(
          xStep * (0.54 + 0.035 * deterministicOffset(row, column, 2)),
          x - bounds.minimum.x,
          bounds.maximum.x - x,
        );
      const crownZ = row === 0 || row === rows - 1
        ? Math.min(
          z - bounds.minimum.z,
          bounds.maximum.z - z,
        )
        : Math.min(
          zStep * (0.54 + 0.035 * deterministicOffset(row, column, 3)),
          z - bounds.minimum.z,
          bounds.maximum.z - z,
        );
      const crownY = bounds.size.y
        * (0.31 + 0.025 * deterministicOffset(row, column, 4));
      const crownCentreY = bounds.maximum.y - crownY;
      const trunkHeight = Math.max(
        1,
        crownCentreY - bounds.minimum.y,
      );
      const trunkRadius = Math.max(
        0.55,
        Math.min(crownX, crownZ) * 0.075,
      );
      setInstance(
        trunks,
        index,
        new THREE.Vector3(
          x,
          bounds.minimum.y + trunkHeight * 0.5,
          z,
        ),
        new THREE.Vector3(trunkRadius, trunkHeight, trunkRadius),
        work,
      );
      setInstance(
        canopies,
        index,
        new THREE.Vector3(x, crownCentreY, z),
        new THREE.Vector3(crownX, crownY, crownZ),
        work,
      );
      index++;
    }
  }
  finishInstances(trunks);
  finishInstances(canopies);
  group.add(trunks, canopies);

  // Flush, opaque canopy rows keep the solid windbreak readable from the
  // commander's usual elevated view without extending beyond collision truth.
  const rowGeometry = owner.geometry(new THREE.BoxGeometry(1, 1, 1));
  const rowDepth = Math.max(3, Math.min(8, zStep * 0.28));
  const rowSurfaceDepth = Math.min(0.24, bounds.size.y * 0.01);
  for (let row = 0; row < rows; row++) {
    addBoxComponent(
      THREE,
      group,
      rowGeometry,
      materials.orchardCanopy,
      obstacle,
      representation,
      "orchard-canopy-surface-row",
      `CASEVAC_ORCHARD_CANOPY_SURFACE_ROW_${row + 1}`,
      new THREE.Vector3(
        bounds.centre.x,
        bounds.maximum.y - rowSurfaceDepth * 0.5,
        bounds.minimum.z + zMargin + row * zStep,
      ),
      new THREE.Vector3(
        bounds.size.x,
        rowSurfaceDepth,
        rowDepth,
      ),
    );
  }
  return group;
}

function createClinicCompound(
  THREE,
  owner,
  obstacle,
  materials,
) {
  const representation = "fortified-clinic-compound";
  const bounds = renderBounds(THREE, obstacle);
  const group = tagPresentationOnly(
    new THREE.Group(),
    "clinic-physical-compound",
    obstacle,
  );
  group.name = "CASEVAC_COLLISION_CLINIC_PHYSICAL_COMPOUND";
  group.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
  );

  addExactAuthorityMass(
    THREE,
    owner,
    group,
    materials.clinicAuthorityMass,
    obstacle,
    representation,
    "clinic-authority-solid-mass",
    "CASEVAC_CLINIC_EXACT_AUTHORITY_SOLID_MASS",
    bounds,
  );

  const unitBox = owner.geometry(new THREE.BoxGeometry(1, 1, 1));
  const add = (material, kind, name, centre, size) => addBoxComponent(
    THREE,
    group,
    unitBox,
    material,
    obstacle,
    representation,
    kind,
    name,
    centre,
    size,
  );
  const wallThickness = Math.min(3, bounds.size.x * 0.04);
  const wallHeight = Math.min(5, bounds.size.y * 0.18);
  const wallY = bounds.minimum.y + wallHeight * 0.5;
  const halfWall = wallThickness * 0.5;
  add(
    materials.clinicConcrete,
    "clinic-perimeter-wall",
    "CASEVAC_CLINIC_PERIMETER_NORTH",
    new THREE.Vector3(bounds.centre.x, wallY, bounds.minimum.z + halfWall),
    new THREE.Vector3(bounds.size.x, wallHeight, wallThickness),
  );
  add(
    materials.clinicConcrete,
    "clinic-perimeter-wall",
    "CASEVAC_CLINIC_PERIMETER_SOUTH",
    new THREE.Vector3(bounds.centre.x, wallY, bounds.maximum.z - halfWall),
    new THREE.Vector3(bounds.size.x, wallHeight, wallThickness),
  );
  add(
    materials.clinicConcrete,
    "clinic-perimeter-wall",
    "CASEVAC_CLINIC_PERIMETER_WEST",
    new THREE.Vector3(bounds.minimum.x + halfWall, wallY, bounds.centre.z),
    new THREE.Vector3(
      wallThickness,
      wallHeight,
      Math.max(0.1, bounds.size.z - wallThickness * 2),
    ),
  );
  add(
    materials.clinicConcrete,
    "clinic-perimeter-wall",
    "CASEVAC_CLINIC_PERIMETER_EAST",
    new THREE.Vector3(bounds.maximum.x - halfWall, wallY, bounds.centre.z),
    new THREE.Vector3(
      wallThickness,
      wallHeight,
      Math.max(0.1, bounds.size.z - wallThickness * 2),
    ),
  );

  const mainWidth = bounds.size.x * 0.76;
  const mainDepth = bounds.size.z * 0.58;
  const roofHeight = Math.min(2, bounds.size.y * 0.08);
  const mainHeight = bounds.size.y - roofHeight;
  // Keep the block and wings flush with the approach-facing authority surface.
  // Polygon-offset opaque dressing makes their shapes legible over the exact
  // solid mass without claiming collision geometry outside the projected AABB.
  const mainCentreZ = bounds.maximum.z - mainDepth * 0.5;
  add(
    materials.clinicWall,
    "clinic-main-block",
    "CASEVAC_CLINIC_MAIN_BLOCK",
    new THREE.Vector3(
      bounds.centre.x,
      bounds.minimum.y + mainHeight * 0.5,
      mainCentreZ,
    ),
    new THREE.Vector3(mainWidth, mainHeight, mainDepth),
  );
  add(
    materials.clinicRoof,
    "clinic-roof",
    "CASEVAC_CLINIC_MAIN_ROOF",
    new THREE.Vector3(
      bounds.centre.x,
      bounds.maximum.y - roofHeight * 0.5,
      mainCentreZ,
    ),
    new THREE.Vector3(
      Math.min(bounds.size.x, mainWidth + 7),
      roofHeight,
      mainDepth,
    ),
  );

  const wingDepth = bounds.size.z * 0.26;
  const wingWidth = bounds.size.x * 0.42;
  const wingHeight = bounds.size.y * 0.5;
  const wingZ = bounds.maximum.z - wingDepth * 0.5;
  add(
    materials.clinicWing,
    "clinic-receiving-wing",
    "CASEVAC_CLINIC_RECEIVING_WING",
    new THREE.Vector3(
      bounds.minimum.x + wallThickness + wingWidth * 0.5 + 5,
      bounds.minimum.y + wingHeight * 0.5,
      wingZ,
    ),
    new THREE.Vector3(wingWidth, wingHeight, wingDepth),
  );
  add(
    materials.clinicWing,
    "clinic-service-wing",
    "CASEVAC_CLINIC_SERVICE_WING",
    new THREE.Vector3(
      bounds.maximum.x - wallThickness - wingWidth * 0.5 - 5,
      bounds.minimum.y + wingHeight * 0.5,
      wingZ,
    ),
    new THREE.Vector3(wingWidth, wingHeight, wingDepth),
  );

  const windowWidth = mainWidth * 0.62;
  const windowHeight = Math.min(2.2, mainHeight * 0.09);
  const windowDepth = Math.min(0.32, mainDepth * 0.01);
  for (let level = 0; level < 3; level++) {
    add(
      materials.clinicWindow,
      "clinic-window-band",
      `CASEVAC_CLINIC_WINDOW_BAND_${level + 1}`,
      new THREE.Vector3(
        bounds.centre.x,
        bounds.minimum.y + mainHeight * (0.26 + level * 0.22),
        bounds.maximum.z - windowDepth * 0.5,
      ),
      new THREE.Vector3(windowWidth, windowHeight, windowDepth),
    );
  }
  return group;
}

function createGenericPhysicalObstacle(
  THREE,
  owner,
  obstacle,
  materials,
) {
  const representation = "opaque-authority-obstacle";
  const bounds = renderBounds(THREE, obstacle);
  const group = tagPresentationOnly(
    new THREE.Group(),
    "authority-physical-obstacle",
    obstacle,
  );
  group.name = "CASEVAC_COLLISION_PHYSICAL_OBSTACLE";
  group.userData.casevacGeometry = authorityGeometry(
    obstacle,
    representation,
  );
  addBoxComponent(
    THREE,
    group,
    owner.geometry(new THREE.BoxGeometry(1, 1, 1)),
    materials.genericObstacle,
    obstacle,
    representation,
    "authority-obstacle-mass",
    "CASEVAC_COLLISION_AUTHORITY_OBSTACLE_MASS",
    bounds.centre,
    bounds.size,
  );
  return group;
}

function createBoxVisual(
  THREE,
  owner,
  obstacle,
  materials,
  work,
) {
  if (obstacle.id.includes("orchard"))
    return createOrchardCompound(
      THREE,
      owner,
      obstacle,
      materials,
      work,
    );
  if (obstacle.id.includes("clinic"))
    return createClinicCompound(
      THREE,
      owner,
      obstacle,
      materials,
    );
  return createGenericPhysicalObstacle(
    THREE,
    owner,
    obstacle,
    materials,
  );
}

export function createCasevacCollisionScenery(
  THREE,
  casevacCollisionObstacles,
) {
  validateThree(THREE);
  const obstacles = normalizeObstacles(casevacCollisionObstacles);
  const owner = resourceOwner();
  const materials = createMaterials(THREE, owner);
  const root = tagPresentationOnly(
    new THREE.Group(),
    "collision-scenery-root",
  );
  root.name = "CASEVAC_COLLISION_SCENERY_PRESENTATION_ONLY";
  const work = {
    direction: new THREE.Vector3(),
    yAxis: new THREE.Vector3(0, 1, 0),
    matrix: new THREE.Matrix4(),
    identityQuaternion: new THREE.Quaternion(),
  };
  for (const obstacle of obstacles) {
    root.add(obstacle.primitive === PRIMITIVES.capsuleSegment
      ? createSegmentVisual(
        THREE,
        owner,
        obstacle,
        materials,
        work,
      )
      : createBoxVisual(
        THREE,
        owner,
        obstacle,
        materials,
        work,
      ));
  }
  root.userData.casevacCollisionScenery = {
    schema: CASEVAC_COLLISION_SCENERY_SCHEMA,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
    coordinateFrame: "RENDER_EAST_UP_NEGATIVE_NORTH",
    obstacleCount: obstacles.length,
    disposed: false,
  };
  let disposed = false;

  return Object.freeze({
    group: root,
    obstacles,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.userData.casevacCollisionScenery.disposed = true;
      root.removeFromParent();
      owner.dispose();
    },
    get disposed() {
      return disposed;
    },
  });
}
