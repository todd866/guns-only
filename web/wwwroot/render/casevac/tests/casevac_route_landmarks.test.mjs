import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  CASEVAC_ROUTE_LANDMARK_LIMIT,
  CASEVAC_ROUTE_LANDMARKS_SCHEMA,
  CASEVAC_ROUTE_POINT_LIMIT,
  CASEVAC_ROUTE_SURFACE_OFFSET_M,
  CASEVAC_ROUTE_VEGETATION_LIMIT,
  createCasevacRouteLandmarks,
} from "../casevac_route_landmarks.js";

function projectedRoute({
  id,
  kind = "MASKED",
  points,
}) {
  return {
    id,
    kind,
    leg: "INGRESS",
    label: "Projected label",
    control_points: points.map(([eastM, northM, surfaceElevationM = 40], index) => ({
      id: `${id}.point.${index}`,
      east_m: eastM,
      north_m: northM,
      surface_elevation_m: surfaceElevationM,
      target_agl_m: 22,
      corridor_radius_m: 85,
    })),
  };
}

function byKind(root, kind) {
  const found = [];
  root.traverse((object) => {
    if (object.userData.casevac?.kind === kind) found.push(object);
  });
  return found;
}

function resourceSets(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (!object.material) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
    }
  });
  return { geometries, materials };
}

function close(actual, expected, epsilon = 1e-4) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} should be within ${epsilon} of ${expected}`,
  );
}

test("renders only MASKED projected routes as tagged ordinary landscape", () => {
  const routes = [
    projectedRoute({
      id: "route.direct",
      kind: "DIRECT",
      points: [[-50, 10], [0, 0]],
    }),
    projectedRoute({
      id: "route.masked",
      points: [[-2500, 1800], [-1600, 420], [0, 0]],
    }),
    projectedRoute({
      id: "route.reference",
      kind: "REFERENCE",
      points: [[0, 0], [10, 10]],
    }),
  ];
  const landmarks = createCasevacRouteLandmarks(THREE, routes);

  assert.equal(
    landmarks.group.name,
    "CASEVAC_MASKED_ROUTE_LANDMARKS_PRESENTATION_ONLY",
  );
  assert.equal(
    landmarks.group.userData.casevacRouteLandmarks.schema,
    CASEVAC_ROUTE_LANDMARKS_SCHEMA,
  );
  assert.equal(
    landmarks.group.userData.casevacRouteLandmarks.maskedRouteCount,
    1,
  );
  assert.deepEqual(landmarks.routes.map((route) => route.id), [
    "route.masked",
  ]);
  assert.equal(byKind(
    landmarks.group,
    "masked-route-landscape",
  ).length, 1);
  assert.equal(byKind(
    landmarks.group,
    "drainage-sunken-road-shoulder",
  ).length, 1);
  assert.equal(byKind(
    landmarks.group,
    "drainage-sunken-road-bed",
  ).length, 1);

  landmarks.group.traverse((object) => {
    const tag = object.userData.casevac;
    assert.ok(tag, `${object.name || object.type} needs a CASEVAC tag`);
    assert.equal(tag.presentationOnly, true);
    assert.equal(tag.authoritative, false);
    assert.equal(tag.collisionSource, false);
    assert.notEqual(object.isLine, true);
    assert.notEqual(object.isLineSegments, true);
    if (object.material?.emissive)
      assert.equal(object.material.emissive.getHex(), 0);
  });
  landmarks.dispose();
});

test("keeps the projected control points as the exact mirrored ribbon centreline", () => {
  const points = [[10, 20, 34.25], [45, -30, 37.5], [80, 5, 42.75]];
  const landmarks = createCasevacRouteLandmarks(
    THREE,
    [projectedRoute({ id: "route.exact", points })],
  );
  const shoulder = byKind(
    landmarks.group,
    "drainage-sunken-road-shoulder",
  )[0];
  const positions = shoulder.geometry.getAttribute("position");
  assert.equal(positions.count, points.length * 2);

  for (let index = 0; index < points.length; index++) {
    const left = index * 2;
    const right = left + 1;
    close((positions.getX(left) + positions.getX(right)) * 0.5,
      points[index][0]);
    close((positions.getY(left) + positions.getY(right)) * 0.5,
      points[index][2] + CASEVAC_ROUTE_SURFACE_OFFSET_M);
    close((positions.getZ(left) + positions.getZ(right)) * 0.5,
      -points[index][1]);
  }
  assert.equal(
    shoulder.geometry.userData.casevacCentreline.exactProjectedControlPoints,
    true,
  );
  assert.deepEqual(
    shoulder.geometry.userData.casevacCentreline.controlPoints,
    points.map(([eastM, northM, surfaceElevationM]) => ({
      x: eastM,
      y: surfaceElevationM + CASEVAC_ROUTE_SURFACE_OFFSET_M,
      z: -northM,
    })),
  );
  landmarks.dispose();
});

test("creates deterministic bounded willow and shelterbelt instances", () => {
  const routes = [
    projectedRoute({
      id: "route.ingress.masked",
      points: [
        [-2500, 1800, 36],
        [-1600, 420, 42],
        [-700, -180, 47],
        [0, 0, 51],
      ],
    }),
    projectedRoute({
      id: "route.outbound.masked",
      points: [
        [0, 0, 51],
        [900, -1300, 45],
        [2400, -3000, 39],
        [3200, -2400, 44],
      ],
    }),
  ];
  const first = createCasevacRouteLandmarks(THREE, routes);
  const second = createCasevacRouteLandmarks(THREE, routes);

  assert.ok(first.vegetationCount > 0);
  assert.ok(first.vegetationCount <= CASEVAC_ROUTE_VEGETATION_LIMIT);
  assert.equal(first.vegetationCount, second.vegetationCount);
  const firstTrunks = byKind(
    first.group,
    "willow-shelterbelt-trunks",
  )[0];
  const secondTrunks = byKind(
    second.group,
    "willow-shelterbelt-trunks",
  )[0];
  assert.ok(firstTrunks.isInstancedMesh);
  assert.equal(firstTrunks.count, first.vegetationCount);
  assert.deepEqual(
    firstTrunks.userData.casevacVegetation,
    secondTrunks.userData.casevacVegetation,
  );

  const firstPlacement =
    firstTrunks.userData.casevacVegetation.placements[0];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  firstTrunks.getMatrixAt(0, matrix);
  matrix.decompose(position, quaternion, scale);
  close(position.x, firstPlacement.eastM);
  close(position.y, firstPlacement.surfaceElevationM);
  close(position.z, -firstPlacement.northM);
  const firstSegmentFrom = first.routes[0].points[0];
  const firstSegmentTo = first.routes[0].points[1];
  const firstSegmentEast =
    firstSegmentTo.eastM - firstSegmentFrom.eastM;
  const firstSegmentNorth =
    firstSegmentTo.northM - firstSegmentFrom.northM;
  const firstAlong = (
    (firstPlacement.eastM - firstSegmentFrom.eastM)
      * firstSegmentEast
    + (firstPlacement.northM - firstSegmentFrom.northM)
      * firstSegmentNorth
  ) / (
    firstSegmentEast * firstSegmentEast
    + firstSegmentNorth * firstSegmentNorth
  );
  close(
    firstPlacement.surfaceElevationM,
    firstSegmentFrom.surfaceElevationM
      + (firstSegmentTo.surfaceElevationM
        - firstSegmentFrom.surfaceElevationM) * firstAlong,
  );
  assert.equal(byKind(
    first.group,
    "willow-shelterbelt-canopies",
  )[0].count, first.vegetationCount);

  first.dispose();
  second.dispose();
});

test("enforces projected resource bounds and explicit per-point surfaces", () => {
  const missingSurface = projectedRoute({
    id: "route.missing-surface",
    points: [[0, 0], [100, 100]],
  });
  delete missingSurface.control_points[0].surface_elevation_m;
  assert.throws(
    () => createCasevacRouteLandmarks(THREE, [missingSurface]),
    /surface_elevation_m must be finite/,
  );
  assert.throws(
    () => createCasevacRouteLandmarks(
      THREE,
      Array.from(
        { length: CASEVAC_ROUTE_LANDMARK_LIMIT + 1 },
        (_, index) => projectedRoute({
          id: `route.${index}`,
          kind: "DIRECT",
          points: [[0, 0], [1, 1]],
        }),
      ),
    ),
    /exceed the landmark limit/,
  );
  assert.throws(
    () => createCasevacRouteLandmarks(
      THREE,
      [projectedRoute({
        id: "route.too-many-points",
        points: Array.from(
          { length: CASEVAC_ROUTE_POINT_LIMIT + 1 },
          (_, index) => [index, index + 1],
        ),
      })],
    ),
    /control-point limit/,
  );
  const noMaskedRoute = createCasevacRouteLandmarks(
    THREE,
    [projectedRoute({
      id: "route.direct-only",
      kind: "DIRECT",
      points: [[0, 0], [500, 500]],
    })],
  );
  assert.equal(noMaskedRoute.routes.length, 0);
  assert.equal(noMaskedRoute.vegetationCount, 0);
  noMaskedRoute.dispose();
});

test("disposes every owned resource exactly once and detaches cleanly", () => {
  const landmarks = createCasevacRouteLandmarks(
    THREE,
    [projectedRoute({
      id: "route.dispose",
      points: [[0, 0], [1000, 500]],
    })],
  );
  const parent = new THREE.Group();
  parent.add(landmarks.group);
  const { geometries, materials } = resourceSets(landmarks.group);
  const geometryDisposals = new Map();
  const materialDisposals = new Map();
  for (const geometry of geometries) {
    geometryDisposals.set(geometry, 0);
    geometry.addEventListener("dispose", () => {
      geometryDisposals.set(geometry, geometryDisposals.get(geometry) + 1);
    });
  }
  for (const material of materials) {
    materialDisposals.set(material, 0);
    material.addEventListener("dispose", () => {
      materialDisposals.set(material, materialDisposals.get(material) + 1);
    });
  }

  landmarks.dispose();
  landmarks.dispose();
  assert.equal(landmarks.disposed, true);
  assert.equal(parent.children.includes(landmarks.group), false);
  assert.equal(
    landmarks.group.userData.casevacRouteLandmarks.disposed,
    true,
  );
  assert.ok([...geometryDisposals.values()].every((count) => count === 1));
  assert.ok([...materialDisposals.values()].every((count) => count === 1));
});
