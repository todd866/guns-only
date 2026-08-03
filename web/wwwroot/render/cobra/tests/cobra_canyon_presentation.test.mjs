import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  planCobraCanyonWorld,
  sampleCobraCanyonTerrain,
} from "../cobra_canyon_plan.js";
import {
  COBRA_CANYON_AMBIENT_BUDGETS,
  COBRA_CANYON_RENDER_BUDGETS,
  COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M,
  COBRA_CANYON_TERRAIN_SEGMENTS,
  createCobraCanyonPresentation,
  sampleCobraCanyonRenderedBasinHeight,
} from "../cobra_canyon_presentation.js";
import { COBRA_CANYON_ASSET_ROLES } from "../cobra_canyon_asset_kit.js";

const world = JSON.parse(await readFile(new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
), "utf8"));
const presentationSource = await readFile(new URL(
  "../cobra_canyon_presentation.js",
  import.meta.url,
), "utf8");

const QUALITY_TIERS = Object.freeze(["mobile", "balanced", "desktop"]);

test("presentation shares the Build 238 planner module", () => {
  assert.match(presentationSource,
    /from "\.\/cobra_canyon_plan\.js\?v=249"/);
  assert.doesNotMatch(presentationSource,
    /from "\.\/cobra_canyon_plan\.js"/);
});

function create(qualityTier = "balanced", options = {}) {
  const plan = planCobraCanyonWorld(world, { qualityTier });
  return {
    plan,
    presentation: createCobraCanyonPresentation(THREE, plan, {
      qualityTier,
      ...options,
    }),
  };
}

function meshes(root) {
  const result = [];
  root.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
}

function byRole(root, role) {
  return meshes(root).find((mesh) => mesh.userData.cobraCanyon?.role === role) ?? null;
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
}

function visibleMetrics(root) {
  let drawCalls = 0;
  let instances = 0;
  let triangles = 0;
  for (const mesh of meshes(root)) {
    if (!mesh.visible) continue;
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    if (count <= 0) continue;
    drawCalls += 1;
    if (mesh.isInstancedMesh) instances += count;
    triangles += triangleCount(mesh.geometry) * count;
  }
  return { drawCalls, instances, triangles };
}

function representedAuthoredHazards(root) {
  const ids = new Set();
  for (const role of ["hazards", "bridges"]) {
    const mesh = byRole(root, role);
    for (const entry of mesh?.userData.cobraCanyonInstances ?? []) {
      if (entry.authoredHazard) ids.add(entry.id);
    }
  }
  return ids;
}

test("builds the real analytical basin and stays inside every tier ceiling", () => {
  for (const qualityTier of QUALITY_TIERS) {
    const { plan, presentation } = create(qualityTier);
    const diagnostics = presentation.diagnostics();
    const budget = COBRA_CANYON_RENDER_BUDGETS[qualityTier];
    const actual = visibleMetrics(presentation.group);

    assert.equal(diagnostics.drawCalls, actual.drawCalls);
    assert.equal(diagnostics.instances, actual.instances);
    assert.equal(diagnostics.triangles, actual.triangles);
    assert.ok(actual.drawCalls <= budget.maxDrawCalls);
    assert.ok(actual.instances <= budget.maxInstances);
    assert.ok(actual.triangles <= budget.maxTriangles);
    assert.equal(diagnostics.withinBudget, true);
    assert.equal(diagnostics.builtDrawCalls, 14);
    assert.equal(diagnostics.roleCounts.coreRenderBatches, 7);
    assert.equal(diagnostics.roleCounts.assetRenderBatches, 7);
    assert.equal(diagnostics.roleCounts.worldRenderBatches, 14);
    assert.equal(diagnostics.roleCounts.heroCells, 3);
    assert.equal(diagnostics.roleCounts.landmarks, 11);
    assert.equal(diagnostics.roleCounts.hazards, 14);
    assert.ok(
      diagnostics.roleCounts.assetInstances <= budget.maxAssetInstances,
      `${qualityTier} asset kit must respect its instance allocation`,
    );
    assert.equal(diagnostics.presentationDrawCallHeadroom, 0);
    assert.ok(diagnostics.presentationInstanceHeadroom >= 0);
    assert.ok(diagnostics.presentationTriangleHeadroom >= 512,
      `${qualityTier} must retain at least 512 presentation triangles of reserve`);
    assert.ok(diagnostics.availableSceneDrawCallHeadroom > 0,
      `${qualityTier} must retain authored scene headroom for aircraft, sky, effects and UI`);

    const basin = byRole(presentation.group, "basin");
    const positions = basin.geometry.getAttribute("position");
    let minimumY = Infinity;
    let maximumY = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      minimumY = Math.min(minimumY, positions.getY(index));
      maximumY = Math.max(maximumY, positions.getY(index));
    }
    assert.equal(
      triangleCount(basin.geometry),
      COBRA_CANYON_TERRAIN_SEGMENTS[qualityTier] ** 2 * 2,
    );
    assert.ok(maximumY - minimumY > 500, `${qualityTier} needs visible basin/rim relief`);
    assert.equal(basin.geometry.getAttribute("color").count, positions.count);
    assert.equal(basin.material.flatShading, true);

    for (const role of ["river", "roads"]) {
      const overlay = byRole(presentation.group, role);
      const overlayPositions = overlay.geometry.getAttribute("position");
      assert.ok(triangleCount(overlay.geometry) > 100,
        `${qualityTier} ${role} must be clipped to the rendered terrain grid`);
      assert.equal(overlay.material.polygonOffset, true);
      let minimumClearanceM = Infinity;
      let maximumClearanceM = -Infinity;
      for (let index = 0; index < overlayPositions.count; index += 3) {
        // Sample ten strictly interior barycentric points per overlay triangle.
        // Vertex-only checks miss the terrain grid's diagonal split and previously
        // allowed ribbon interiors to disappear several metres below the basin.
        for (let a = 1; a <= 4; a++) {
          for (let b = 1; b <= 5 - a; b++) {
            const c = 6 - a - b;
            const eastM = (
              overlayPositions.getX(index) * a
              + overlayPositions.getX(index + 1) * b
              + overlayPositions.getX(index + 2) * c
            ) / 6;
            const elevationM = (
              overlayPositions.getY(index) * a
              + overlayPositions.getY(index + 1) * b
              + overlayPositions.getY(index + 2) * c
            ) / 6;
            const northM = -(
              overlayPositions.getZ(index) * a
              + overlayPositions.getZ(index + 1) * b
              + overlayPositions.getZ(index + 2) * c
            ) / 6;
            const clearanceM = elevationM - sampleCobraCanyonRenderedBasinHeight(
              plan,
              qualityTier,
              eastM,
              northM,
            );
            minimumClearanceM = Math.min(minimumClearanceM, clearanceM);
            maximumClearanceM = Math.max(maximumClearanceM, clearanceM);
          }
        }
      }
      assert.ok(minimumClearanceM >= 0.349,
        `${qualityTier} ${role} penetrates the rendered basin by ${minimumClearanceM.toFixed(3)} m`);
      assert.ok(maximumClearanceM <= 0.351,
        `${qualityTier} ${role} floats ${maximumClearanceM.toFixed(3)} m above the rendered basin`);
    }

    presentation.group.traverse((object) => {
      const tag = object.userData.cobraCanyon;
      assert.ok(tag, `${object.name || object.type} must carry the Cobra presentation tag`);
      assert.equal(tag.presentationOnly, true);
      assert.equal(tag.authoritative, false);
      assert.equal(tag.collisionSource, false);
      assert.equal(tag.targetSource, false);
      assert.equal(tag.targetable, false);
      assert.equal(object.castShadow, false);
    });
    presentation.dispose();
  }
});

test("represents all fourteen authored hazards and never sheds them", () => {
  const { plan, presentation } = create("balanced", { nearRingRadiusM: 9_000 });
  const expectedIds = new Set(plan.hazards.map((hazard) => hazard.id));
  assert.deepEqual(representedAuthoredHazards(presentation.group), expectedIds);

  const hazardMesh = byRole(presentation.group, "hazards");
  const bridgeMesh = byRole(presentation.group, "bridges");
  const authoredHazardCount = hazardMesh.count;
  const authoredBridgeCount = bridgeMesh.count;
  assert.equal(hazardMesh.frustumCulled, false);
  assert.equal(bridgeMesh.frustumCulled, false);

  for (const ambientBudgetLevel of [0, 1, 2]) {
    presentation.update({
      ambientBudgetLevel,
      cameraPosition: { x: 30_000, z: 30_000 },
      cameraAglM: 5_000,
    });
    const diagnostics = presentation.diagnostics();
    assert.equal(diagnostics.hazards, 14);
    assert.equal(diagnostics.hazardsVisible, true);
    assert.equal(hazardMesh.visible, true);
    assert.equal(bridgeMesh.visible, true);
    assert.equal(hazardMesh.count, authoredHazardCount);
    assert.equal(bridgeMesh.count, authoredBridgeCount);
    assert.deepEqual(representedAuthoredHazards(presentation.group), expectedIds);
  }
  presentation.dispose();
});

test("grounds landmark silhouettes on terrain while sizing toward authored top anchors", () => {
  const { plan, presentation } = create("balanced");
  const landmarks = byRole(presentation.group, "landmarks");
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let tallestNeedleM = 0;
  for (const entry of landmarks.userData.cobraCanyonInstances) {
    landmarks.getMatrixAt(entry.instanceId, matrix);
    matrix.decompose(position, quaternion, scale);
    const terrainM = sampleCobraCanyonTerrain(plan, position.x, -position.z);
    const bottomM = position.y - scale.y * 0.5;
    const bottomDeltaM = bottomM - terrainM;
    if (entry.kind === "open-quarry") {
      assert.ok(bottomDeltaM >= -3.05 && bottomDeltaM <= 0.05,
        `${entry.id} may cut shallowly into terrain but cannot float`);
    } else {
      assert.ok(Math.abs(bottomDeltaM) < 0.05,
        `${entry.id} must start on terrain instead of floating`);
    }
    if (entry.kind === "rock-spires") tallestNeedleM = Math.max(tallestNeedleM, scale.y);
  }
  assert.ok(tallestNeedleM > 280, "Karst Needles must preserve their authored tall silhouette");
  presentation.dispose();
});

test("keeps non-authority solid landmarks outside the Cobra route envelope", () => {
  const { presentation } = create("balanced");
  const landmarks = byRole(presentation.group, "landmarks");
  const protectedKinds = new Set(["rock-spires", "ridge-gate", "hill-pagoda"]);
  const protectedEntries = landmarks.userData.cobraCanyonInstances.filter(
    (entry) => protectedKinds.has(entry.kind),
  );
  assert.equal(protectedEntries.length, 9);
  for (const entry of protectedEntries) {
    assert.ok(
      entry.routeEnvelopeClearanceM >= COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M,
      `${entry.id} must not imply collision inside the rotor envelope`,
    );
    assert.equal(Number.isFinite(entry.authoredAnchorX), true);
    assert.equal(Number.isFinite(entry.authoredAnchorZ), true);
  }
  const diagnostics = presentation.diagnostics();
  assert.ok(diagnostics.roleCounts.routeEnvelopeAdjustedInstances > 0);
  assert.ok(
    diagnostics.roleCounts.routeEnvelopeMinimumClearanceM
      >= COBRA_CANYON_ROUTE_ENVELOPE_CLEARANCE_M,
  );
  assert.equal(diagnostics.roleCounts.suppressedPresentationPoles, 2,
    "route-centre decorative poles must not masquerade as solid collision authority");
  presentation.dispose();
});

test("ambient rungs and AGL shed only deterministic asset prefixes", () => {
  const { plan, presentation } = create("balanced", { nearRingRadiusM: 9_000 });
  const assets = new Map(COBRA_CANYON_ASSET_ROLES.map((role) => [
    role,
    byRole(presentation.group, role),
  ]));
  const hazards = byRole(presentation.group, "hazards");
  const bridges = byRole(presentation.group, "bridges");
  const baseCounts = new Map([...assets].map(([role, mesh]) => [role, mesh.count]));
  const baseHazardCount = hazards.count;
  const baseBridgeCount = bridges.count;
  const firstMatrix = new THREE.Matrix4();
  const firstPosition = new THREE.Vector3();
  const firstQuaternion = new THREE.Quaternion();
  const firstScale = new THREE.Vector3();
  assets.get("jungle").getMatrixAt(0, firstMatrix);
  firstMatrix.decompose(firstPosition, firstQuaternion, firstScale);
  const firstGroundM = sampleCobraCanyonTerrain(plan, firstPosition.x, -firstPosition.z);
  assert.ok(Math.abs(firstPosition.y - firstGroundM) < 1e-4,
    "asset instances must sit on the analytical terrain instead of floating above it");

  for (const level of [0, 1, 2]) {
    presentation.update({
      ambientBudgetLevel: level,
      cameraPosition: { x: 0, z: 0 },
      cameraAglM: 40,
    });
    let expected = 0;
    for (const [role, mesh] of assets) {
      const roleCount = Math.ceil(
        baseCounts.get(role) * COBRA_CANYON_AMBIENT_BUDGETS[level][role],
      );
      expected += roleCount;
      assert.equal(mesh.visible, roleCount > 0);
      assert.equal(mesh.count, roleCount);
    }
    assert.equal(presentation.diagnostics().visibleAmbientInstances, expected);
    assert.equal(presentation.diagnostics().visibleAssetInstances, expected);
    assert.equal(hazards.count, baseHazardCount);
    assert.equal(bridges.count, baseBridgeCount);
  }

  presentation.update({
    ambientBudgetLevel: 2,
    cameraPosition: { x: 0, z: 0 },
    cameraAglM: 2_000,
  });
  let structuralCount = 0;
  for (const [role, mesh] of assets) {
    const structural = role === "village" || role === "rock";
    const expected = structural
      ? Math.ceil(baseCounts.get(role) * COBRA_CANYON_AMBIENT_BUDGETS[2][role])
      : 0;
    structuralCount += expected;
    assert.equal(mesh.visible, expected > 0);
    assert.equal(mesh.count, expected);
  }
  assert.equal(presentation.diagnostics().visibleAmbientInstances, structuralCount);
  assert.equal(presentation.diagnostics().nearRingVisible, false);
  assert.equal(hazards.visible, true);
  assert.equal(bridges.visible, true);

  presentation.update({
    ambientBudgetLevel: 0,
    cameraPosition: { x: 0, z: 0 },
    cameraAglM: 40,
  });
  for (const [role, mesh] of assets) {
    assert.equal(mesh.visible, true, `${role} must restore inside the near ring`);
    assert.equal(mesh.count, baseCounts.get(role));
  }
  assert.equal(hazards.count, baseHazardCount);
  assert.equal(bridges.count, baseBridgeCount);
  presentation.dispose();
});

test("uses deterministic static matrices and cached frozen diagnostics", () => {
  const first = create("desktop").presentation;
  const second = create("desktop").presentation;
  for (const role of ["landmarks", "hazards", "bridges", ...COBRA_CANYON_ASSET_ROLES]) {
    const firstMesh = byRole(first.group, role);
    const secondMesh = byRole(second.group, role);
    assert.equal(firstMesh.count, secondMesh.count);
    assert.deepEqual(
      [...firstMesh.instanceMatrix.array],
      [...secondMesh.instanceMatrix.array],
      `${role} matrices must be deterministic`,
    );
    if (role === "landmarks" || COBRA_CANYON_ASSET_ROLES.includes(role)) {
      assert.deepEqual(
        [...firstMesh.instanceColor.array],
        [...secondMesh.instanceColor.array],
        `${role} colours must be deterministic`,
      );
    }
  }

  const initial = first.diagnostics();
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.roleCounts), true);
  assert.equal(Object.isFrozen(initial.budget), true);
  assert.strictEqual(first.diagnostics(), initial);
  first.update({ cameraPosition: { x: 0, z: 0 }, cameraAglM: 40, ambientBudgetLevel: 0 });
  assert.strictEqual(first.diagnostics(), initial);
  first.update({ cameraPosition: { x: 0, z: 0 }, cameraAglM: 40, ambientBudgetLevel: 2 });
  const constrained = first.diagnostics();
  assert.equal(Object.isFrozen(constrained), true);
  first.update({ cameraPosition: { x: 0, z: 0 }, cameraAglM: 40, ambientBudgetLevel: 2 });
  assert.strictEqual(first.diagnostics(), constrained);

  first.dispose();
  second.dispose();
});

test("disposes every owned resource exactly once and is idempotent", () => {
  const { presentation } = create("mobile");
  const parent = new THREE.Group();
  parent.add(presentation.group);
  const resources = new Set();
  for (const mesh of meshes(presentation.group)) {
    resources.add(mesh.geometry);
    resources.add(mesh.material);
  }
  const disposeCounts = new Map([...resources].map((resource) => [resource, 0]));
  for (const resource of resources) {
    resource.addEventListener("dispose", () => {
      disposeCounts.set(resource, disposeCounts.get(resource) + 1);
    });
  }

  presentation.dispose();
  presentation.dispose();
  assert.equal(parent.children.includes(presentation.group), false);
  assert.equal(presentation.group.children.length, 0);
  for (const count of disposeCounts.values()) assert.equal(count, 1);
  const diagnostics = presentation.diagnostics();
  assert.equal(Object.isFrozen(diagnostics), true);
  assert.equal(diagnostics.disposed, true);
  assert.equal(diagnostics.drawCalls, 0);
  assert.equal(diagnostics.instances, 0);
  assert.equal(diagnostics.triangles, 0);
  assert.equal(diagnostics.hazardsVisible, false);
});
