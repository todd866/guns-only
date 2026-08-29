import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  CASEVAC_COLLISION_OBSTACLE_LIMIT,
  CASEVAC_COLLISION_SCENERY_SCHEMA,
  CASEVAC_MINIMUM_SEGMENT_VISUAL_RADIUS_M,
  createCasevacCollisionScenery,
} from "../casevac_collision_scenery.js";

const projectedObstacles = Object.freeze([
  Object.freeze({
    id: "obstacle.casevac.power-pole-west.v1",
    primitive: "CAPSULE_SEGMENT",
    radius_m: 0.35,
    start_world_m: Object.freeze({ x: -1250, y: 40, z: 760 }),
    end_world_m: Object.freeze({ x: -1250, y: 62, z: 760 }),
  }),
  Object.freeze({
    id: "obstacle.casevac.power-pole-east.v1",
    primitive: "CAPSULE_SEGMENT",
    radius_m: 0.35,
    start_world_m: Object.freeze({ x: -1110, y: 40, z: 620 }),
    end_world_m: Object.freeze({ x: -1110, y: 60, z: 620 }),
  }),
  Object.freeze({
    id: "obstacle.casevac.wire-crossing.v1",
    primitive: "CAPSULE_SEGMENT",
    radius_m: 0.08,
    start_world_m: Object.freeze({ x: -1250, y: 62, z: 760 }),
    end_world_m: Object.freeze({ x: -1110, y: 60, z: 620 }),
  }),
  Object.freeze({
    id: "obstacle.casevac.orchard-exclusion.v1",
    primitive: "AXIS_ALIGNED_BOX",
    radius_m: 0,
    minimum_world_m: Object.freeze({ x: -650, y: 40, z: -50 }),
    maximum_world_m: Object.freeze({ x: -250, y: 68, z: 350 }),
  }),
  Object.freeze({
    id: "obstacle.casevac.clinic-exclusion.v1",
    primitive: "AXIS_ALIGNED_BOX",
    radius_m: 0,
    minimum_world_m: Object.freeze({ x: 3300, y: 40, z: -2520 }),
    maximum_world_m: Object.freeze({ x: 3460, y: 74, z: -2280 }),
  }),
]);

function byKind(root, kind) {
  const result = [];
  root.traverse((object) => {
    if (object.userData.casevac?.kind === kind) result.push(object);
  });
  return result;
}

function resources(root) {
  const geometries = new Set();
  const materials = new Set();
  const instances = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isInstancedMesh) instances.add(object);
    if (!object.material) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
    }
  });
  return { geometries, materials, instances };
}

function assertVector(actual, expected, epsilon = 1e-9) {
  assert.ok(actual.distanceTo(expected) <= epsilon,
    `${actual.toArray()} should equal ${expected.toArray()}`);
}

function assertExactHiddenAuthorityEnvelope(
  root,
  {
    kind,
    obstacleId,
    minimum,
    maximum,
  },
) {
  const matches = byKind(root, kind);
  assert.equal(matches.length, 1, `${obstacleId} needs one exact visual envelope`);
  const mass = matches[0];
  assert.equal(mass.userData.casevac.obstacleId, obstacleId);
  assert.equal(mass.geometry.type, "BoxGeometry");
  assert.equal(mass.visible, true);
  assert.equal(mass.material.transparent, false);
  assert.equal(mass.material.opacity, 1);
  assert.equal(mass.material.depthTest, false);
  assert.equal(mass.material.depthWrite, false);
  assert.equal(mass.material.colorWrite, false);
  assert.equal(mass.material.wireframe, false);
  assert.equal(
    mass.userData.casevacGeometry.authorityBoundsExact,
    true,
  );
  assert.equal(
    mass.userData.casevacGeometry.visualEnvelopeHidden,
    true,
  );
  assert.equal(
    mass.userData.casevacGeometry.fullVolumeCoverage,
    true,
  );
  assert.equal(
    mass.userData.casevacGeometry.opaquePhysicalMass,
    false,
  );
  const bounds = new THREE.Box3().setFromObject(mass);
  assertVector(bounds.min, minimum, 5e-5);
  assertVector(bounds.max, maximum, 5e-5);
  const expectedSize = maximum.clone().sub(minimum);
  const actualSize = bounds.getSize(new THREE.Vector3());
  assertVector(actualSize, expectedSize, 1e-4);
  assert.ok(
    Math.abs(
      actualSize.x * actualSize.y * actualSize.z
        - expectedSize.x * expectedSize.y * expectedSize.z,
    ) <= 1e-4,
    `${obstacleId} hidden envelope must cover the complete AABB volume`,
  );
}

test("mirrors every projected primitive as tagged presentation-only scenery", () => {
  const scenery = createCasevacCollisionScenery(
    THREE,
    projectedObstacles,
  );

  assert.equal(
    scenery.group.name,
    "CASEVAC_COLLISION_SCENERY_PRESENTATION_ONLY",
  );
  assert.equal(
    scenery.group.userData.casevacCollisionScenery.schema,
    CASEVAC_COLLISION_SCENERY_SCHEMA,
  );
  assert.equal(
    scenery.group.userData.casevacCollisionScenery.obstacleCount,
    projectedObstacles.length,
  );
  assert.equal(scenery.group.children.length, projectedObstacles.length);
  const representedIds = new Set();
  scenery.group.traverse((object) => {
    const tag = object.userData.casevac;
    assert.ok(tag, `${object.name || object.type} needs a CASEVAC tag`);
    assert.equal(tag.presentationOnly, true);
    assert.equal(tag.authoritative, false);
    assert.equal(tag.collisionSource, false);
    if (tag.obstacleId) representedIds.add(tag.obstacleId);
  });
  assert.deepEqual(
    representedIds,
    new Set(projectedObstacles.map((obstacle) => obstacle.id)),
  );
  scenery.dispose();
});

test("keeps pole and wire centreline endpoints exact while making the wire readable", () => {
  const scenery = createCasevacCollisionScenery(
    THREE,
    projectedObstacles,
  );
  scenery.group.updateMatrixWorld(true);

  const pole = byKind(
    scenery.group,
    "pole-centreline-mesh",
  )[0];
  const wire = byKind(
    scenery.group,
    "wire-centreline-mesh",
  )[0];
  const endpoints = (mesh) => [
    new THREE.Vector3(0, -0.5, 0).applyMatrix4(mesh.matrixWorld),
    new THREE.Vector3(0, 0.5, 0).applyMatrix4(mesh.matrixWorld),
  ];
  const [poleFirst, poleSecond] = endpoints(pole);
  assertVector(poleFirst, new THREE.Vector3(-1250, 40, -760));
  assertVector(poleSecond, new THREE.Vector3(-1250, 62, -760));

  const wireEnds = endpoints(wire);
  const expectedWireEnds = [
    new THREE.Vector3(-1250, 62, -760),
    new THREE.Vector3(-1110, 60, -620),
  ];
  assert.ok(expectedWireEnds.every((expected) =>
    wireEnds.some((actual) => actual.distanceTo(expected) < 1e-8)));
  assert.equal(wire.userData.casevacGeometry.exactCentreline, true);
  assert.equal(wire.userData.casevacGeometry.authorityRadiusM, 0.08);
  assert.equal(
    wire.userData.casevacGeometry.visualRadiusM,
    CASEVAC_MINIMUM_SEGMENT_VISUAL_RADIUS_M,
  );
  scenery.dispose();
});

test("turns box authority into readable compounds without opaque horizon slabs", () => {
  const scenery = createCasevacCollisionScenery(
    THREE,
    projectedObstacles,
  );
  scenery.group.updateMatrixWorld(true);
  const orchard = byKind(
    scenery.group,
    "orchard-physical-compound",
  )[0];
  const clinic = byKind(
    scenery.group,
    "clinic-physical-compound",
  )[0];
  assert.ok(orchard);
  assert.ok(clinic);
  assert.equal(
    orchard.userData.casevacGeometry.representation,
    "dense-orchard-windbreak-compound",
  );
  assert.equal(
    clinic.userData.casevacGeometry.representation,
    "fortified-clinic-compound",
  );

  assertExactHiddenAuthorityEnvelope(scenery.group, {
    kind: "orchard-authority-envelope",
    obstacleId: "obstacle.casevac.orchard-exclusion.v1",
    minimum: new THREE.Vector3(-650, 40, -350),
    maximum: new THREE.Vector3(-250, 68, 50),
  });
  assertExactHiddenAuthorityEnvelope(scenery.group, {
    kind: "clinic-authority-envelope",
    obstacleId: "obstacle.casevac.clinic-exclusion.v1",
    minimum: new THREE.Vector3(3300, 40, 2280),
    maximum: new THREE.Vector3(3460, 74, 2520),
  });

  // Compound bounds remain aligned too, but the named hidden-envelope assertions above prove
  // the collision projection remains inspectable without drawing an opaque AABB through the view.
  const orchardBounds = new THREE.Box3().setFromObject(orchard);
  assertVector(
    orchardBounds.min,
    new THREE.Vector3(-650, 40, -350),
    5e-5,
  );
  assertVector(
    orchardBounds.max,
    new THREE.Vector3(-250, 68, 50),
    5e-5,
  );
  const clinicBounds = new THREE.Box3().setFromObject(clinic);
  assertVector(
    clinicBounds.min,
    new THREE.Vector3(3300, 40, 2280),
    5e-5,
  );
  assertVector(
    clinicBounds.max,
    new THREE.Vector3(3460, 74, 2520),
    5e-5,
  );

  assert.equal(
    byKind(scenery.group, "orchard-tree-trunks").length,
    1,
  );
  assert.equal(
    byKind(scenery.group, "orchard-tree-canopies").length,
    1,
  );
  assert.ok(
    byKind(scenery.group, "orchard-canopy-surface-row").length >= 5,
  );
  assert.ok(byKind(scenery.group, "clinic-main-block").length > 0);
  assert.ok(byKind(scenery.group, "clinic-receiving-wing").length > 0);
  assert.ok(byKind(scenery.group, "clinic-perimeter-wall").length >= 4);
  const receivingCrosses = byKind(
    scenery.group,
    "clinic-receiving-cross",
  );
  const receivingEntrances = byKind(
    scenery.group,
    "clinic-receiving-entrance",
  );
  const roofCrosses = byKind(scenery.group, "clinic-roof-cross");
  assert.equal(receivingCrosses.length, 8,
    "all four clinic facades need a two-bar receiving cross");
  assert.equal(receivingEntrances.length, 2);
  assert.equal(roofCrosses.length, 2);
  assert.equal(
    receivingCrosses.every((cross) => cross.material.emissiveIntensity >= 0.5),
    true,
    "receiving identity must survive a shadowed low-level approach",
  );
  assert.equal(
    byKind(scenery.group, "orchard-exclusion-volume-visual-fill").length,
    0,
  );
  assert.equal(
    byKind(scenery.group, "clinic-exclusion-volume-visual-bounds").length,
    0,
  );

  for (const compound of [orchard, clinic]) {
    compound.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.casevacGeometry.visualEnvelopeHidden === true) {
        assert.equal(object.material.colorWrite, false);
        assert.equal(object.material.depthWrite, false);
        return;
      }
      assert.equal(object.material.transparent, false);
      assert.equal(object.material.opacity, 1);
      assert.equal(
        object.userData.casevacGeometry.authorityBoundsExact,
        true,
      );
    });
  }
  scenery.dispose();
});

test("fails closed for malformed, duplicate, or unbounded projected geometry", () => {
  assert.throws(
    () => createCasevacCollisionScenery(THREE, [
      projectedObstacles[0],
      projectedObstacles[0],
    ]),
    /ids must be unique/,
  );
  assert.throws(
    () => createCasevacCollisionScenery(THREE, [{
      ...projectedObstacles[3],
      maximum_world_m: { x: -700, y: 68, z: 350 },
    }]),
    /strict x min\/max/,
  );
  assert.throws(
    () => createCasevacCollisionScenery(
      THREE,
      Array.from(
        { length: CASEVAC_COLLISION_OBSTACLE_LIMIT + 1 },
        (_, index) => ({
          ...projectedObstacles[0],
          id: `obstacle.casevac.test-${index}.v1`,
        }),
      ),
    ),
    /exceed the visual limit/,
  );
});

test("disposes all owned resources once and detaches idempotently", () => {
  const scenery = createCasevacCollisionScenery(
    THREE,
    projectedObstacles,
  );
  const scene = new THREE.Scene();
  scene.add(scenery.group);
  const owned = resources(scenery.group);
  const disposalCount = new Map();
  for (const resource of [
    ...owned.geometries,
    ...owned.materials,
    ...owned.instances,
  ]) {
    disposalCount.set(resource, 0);
    resource.addEventListener("dispose", () => {
      disposalCount.set(
        resource,
        disposalCount.get(resource) + 1,
      );
    });
  }

  scenery.dispose();
  scenery.dispose();

  assert.equal(scenery.disposed, true);
  assert.equal(scenery.group.parent, null);
  assert.equal(
    scenery.group.userData.casevacCollisionScenery.disposed,
    true,
  );
  assert.ok(disposalCount.size > 0);
  for (const count of disposalCount.values()) assert.equal(count, 1);
});
