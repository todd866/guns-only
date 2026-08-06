import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld } from "../cobra_canyon_plan.js";
import {
  COBRA_CANYON_AMBIENT_BUDGETS,
  COBRA_CANYON_ASSET_ROLES,
  createCobraCanyonAssetKit,
} from "../cobra_canyon_asset_kit.js";

const world = JSON.parse(await readFile(new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
), "utf8"));

const MAXIMUM_INSTANCES = Object.freeze({ mobile: 330, balanced: 580, desktop: 830 });

function create(qualityTier = "balanced", maxInstances = MAXIMUM_INSTANCES[qualityTier]) {
  const plan = planCobraCanyonWorld(world, { qualityTier });
  return {
    plan,
    kit: createCobraCanyonAssetKit(THREE, plan, { qualityTier, maxInstances }),
  };
}

function roleMeshes(root) {
  const result = new Map();
  root.traverse((object) => {
    const role = object.userData.cobraCanyon?.role;
    if (object.isInstancedMesh && COBRA_CANYON_ASSET_ROLES.includes(role)) result.set(role, object);
  });
  return result;
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
}

function visibleMetrics(root) {
  const metrics = { drawCalls: 0, instances: 0, triangles: 0 };
  for (const mesh of roleMeshes(root).values()) {
    if (!mesh.visible || mesh.count <= 0) continue;
    metrics.drawCalls += 1;
    metrics.instances += mesh.count;
    metrics.triangles += mesh.count * triangleCount(mesh.geometry);
  }
  return metrics;
}

test("builds one bounded authored batch per visual role across every tier", () => {
  for (const qualityTier of ["mobile", "balanced", "desktop"]) {
    const { plan, kit } = create(qualityTier);
    const meshes = roleMeshes(kit.group);
    assert.equal(meshes.size, COBRA_CANYON_ASSET_ROLES.length);
    assert.equal(kit.builtMetrics.drawCalls, COBRA_CANYON_ASSET_ROLES.length);
    assert.ok(kit.builtMetrics.instances <= MAXIMUM_INSTANCES[qualityTier]);
    assert.equal(kit.roleCounts.assetInstances, kit.builtMetrics.instances);
    assert.equal(kit.roleCounts.authoredAmbientBatches, plan.ambientBatches.length);
    assert.equal(kit.roleCounts.authoredSetPieceCells, 10);
    assert.equal(kit.roleCounts.authoredAmbientArchetypes, 11);
    assert.equal(kit.roleCounts.authoredLandmarkArchetypes, 11);
    assert.equal(kit.roleCounts.authoredSetPieceArchetypeReferences, 58);
    // Jungle set-piece archetypes expand to 3 stands each (near-field canopy walls).
    // Camp Ember dressing: no pad-centre canopy/mist/understory → 85 assets.
    assert.equal(kit.roleCounts.authoredSetPieceAssetReferences, 85);
    assert.equal(kit.roleCounts.renderedSetPieceAssetInstances, 85);
    assert.equal(
      kit.roleCounts.ambientBatchInstances
        + kit.roleCounts.renderedSetPieceAssetInstances
        + kit.roleCounts.renderedWaterAccentInstances,
      kit.roleCounts.assetInstances,
    );

    for (const role of COBRA_CANYON_ASSET_ROLES) {
      const mesh = meshes.get(role);
      const tag = mesh.userData.cobraCanyon;
      assert.equal(tag.presentationOnly, true);
      assert.equal(tag.authoritative, false);
      assert.equal(tag.collisionSource, false);
      assert.equal(tag.targetSource, false);
      assert.equal(tag.targetable, false);
      // WAS an unconditional `castShadow === false`. Same defect as its sibling in
      // cobra_canyon_presentation.test.mjs: it pinned a past cost decision as though it were a
      // property of ambient scenery. The invariant worth holding is that scenery with height
      // casts and the two flat/translucent roles never do — `mist` would print a hard-edged
      // rectangle into the depth map and `waterAccent` is a decal at water level.
      const standsUp = role === "jungle" || role === "plantation"
        || role === "village" || role === "rock";
      assert.equal(mesh.castShadow, standsUp, `${role} cast-shadow policy regressed`);
      assert.equal(mesh.receiveShadow, role !== "mist" && role !== "waterAccent");
      assert.equal(mesh.instanceMatrix.usage, THREE.StaticDrawUsage);
      assert.equal(mesh.instanceColor.count, mesh.count);
      assert.equal(mesh.geometry.getAttribute("color").count,
        mesh.geometry.getAttribute("position").count);
      assert.equal(kit.roleCounts[`${role}RenderBatches`], 1);
      assert.equal(kit.roleCounts[`${role}Instances`], mesh.count);
      assert.ok(mesh.userData.cobraCanyonInstances.every((entry) => entry.archetypeId));
    }
    // Near-field jungle is CC0 alpha cards (crossed quads + atlas), not Lambert lobes.
    const jungleMesh = meshes.get("jungle");
    const jungleGeometry = jungleMesh.geometry;
    const jungleUv = jungleGeometry.getAttribute("uv");
    assert.ok(jungleUv, "jungle cards need UVs for the foliage atlas");
    assert.equal(jungleUv.count, jungleGeometry.getAttribute("position").count);
    assert.ok(jungleMesh.material.map, "jungle material must sample the foliage atlas");
    assert.ok(jungleMesh.material.alphaTest > 0.3,
      "jungle cards must alpha-test cutouts (BF:V-style cards, not soft blend fog)");
    // Camp Ember rear-seat eye must stay free of jungle mass.
    const pad = plan.landmarks.find((entry) => entry.id === "landmark.cobra-canyon.camp-ember.v1");
    assert.ok(pad);
    const [padEast, , padNorth] = pad.positionLocalM;
    const jungleMatrix = new THREE.Matrix4();
    const junglePosition = new THREE.Vector3();
    for (let index = 0; index < jungleMesh.count; index++) {
      jungleMesh.getMatrixAt(index, jungleMatrix);
      junglePosition.setFromMatrixPosition(jungleMatrix);
      const dx = junglePosition.x - padEast;
      const dz = (-junglePosition.z) - padNorth;
      assert.ok(dx * dx + dz * dz >= 120 * 120,
        "jungle must stay outside the Camp Ember clear eye");
    }
    assert.equal(jungleMesh.material.side, THREE.DoubleSide);
    assert.ok(triangleCount(jungleGeometry) >= 10,
      "jungle stand needs crossed palm cards plus understory");
    assert.ok(triangleCount(jungleGeometry) <= 20,
      "textured cards must stay far under the old ~50-tri lobe budget");
    assert.ok(triangleCount(meshes.get("plantation").geometry) >= 100,
      "plantation rows need trunks and crowns instead of marker pyramids");
    assert.deepEqual(visibleMetrics(kit.group), kit.builtMetrics);
    kit.dispose();
  }
});

test("consumes descriptor scale and authored palette instead of generic legacy values", () => {
  const { kit } = create("balanced");
  const plantation = roleMeshes(kit.group).get("plantation");
  const descriptorEntry = plantation.userData.cobraCanyonInstances.find(
    (entry) => entry.archetypeId === "archetype.cobra-canyon.plantation-row.v1",
  );
  assert.ok(descriptorEntry);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  plantation.getMatrixAt(descriptorEntry.instanceId, matrix);
  matrix.decompose(position, quaternion, scale);
  assert.ok(Math.abs(scale.x - 8) < 1e-5);
  assert.ok(Math.abs(scale.y - 18) < 1e-5);
  assert.ok(Math.abs(scale.z - 120) < 1e-5);
  const color = new THREE.Color();
  plantation.getColorAt(descriptorEntry.instanceId, color);
  assert.ok(color.r < 0.9 || color.g < 0.9 || color.b < 0.9,
    "authored plantation palette must tint the instance");
  kit.dispose();
});

test("honours hard instance caps even below the authored reveal reserve", () => {
  for (const maximum of [0, 1, 10, 24]) {
    const { kit } = create("desktop", maximum);
    assert.ok(kit.builtMetrics.instances <= maximum);
    assert.equal(kit.roleCounts.renderedSetPieceAssetInstances, Math.min(maximum, 85));
    assert.equal(kit.roleCounts.ambientBatchInstances, 0);
    assert.equal(kit.roleCounts.renderedWaterAccentInstances, 0);
    kit.dispose();
  }
});

test("uses deterministic matrices, colours, and cached allocation-free update snapshots", () => {
  const first = create("desktop").kit;
  const second = create("desktop").kit;
  const firstMeshes = roleMeshes(first.group);
  const secondMeshes = roleMeshes(second.group);
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    assert.deepEqual(
      [...firstMeshes.get(role).instanceMatrix.array],
      [...secondMeshes.get(role).instanceMatrix.array],
      `${role} matrices must be deterministic`,
    );
    assert.deepEqual(
      [...firstMeshes.get(role).instanceColor.array],
      [...secondMeshes.get(role).instanceColor.array],
      `${role} colours must be deterministic`,
    );
  }

  const initial = first.diagnostics();
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.roleCounts), true);
  first.update({ ambientBudgetLevel: 0, nearRingVisible: true });
  assert.strictEqual(first.diagnostics(), initial);
  for (const level of [0, 1, 2]) {
    for (const nearRingVisible of [true, false]) {
      first.update({ ambientBudgetLevel: level, nearRingVisible });
      const snapshot = first.diagnostics();
      assert.strictEqual(snapshot, first.diagnosticsFor(level, nearRingVisible));
      assert.deepEqual(visibleMetrics(first.group), {
        drawCalls: snapshot.drawCalls,
        instances: snapshot.instances,
        triangles: snapshot.triangles,
      });
      for (const [role, mesh] of firstMeshes) {
        const survivesRing = nearRingVisible || role === "village" || role === "rock";
        const expected = survivesRing
          ? Math.ceil(
            first.roleCounts[`${role}Instances`] * COBRA_CANYON_AMBIENT_BUDGETS[level][role],
          )
          : 0;
        assert.equal(mesh.count, expected);
      }
    }
  }
  first.dispose();
  second.dispose();
});

test("disposes every owned geometry and material exactly once", () => {
  const { kit } = create("mobile");
  const parent = new THREE.Group();
  parent.add(kit.group);
  const resources = new Set();
  for (const mesh of roleMeshes(kit.group).values()) {
    resources.add(mesh.geometry);
    resources.add(mesh.material);
  }
  const disposeCounts = new Map([...resources].map((resource) => [resource, 0]));
  for (const resource of resources) {
    resource.addEventListener("dispose", () => {
      disposeCounts.set(resource, disposeCounts.get(resource) + 1);
    });
  }
  kit.dispose();
  kit.dispose();
  assert.equal(parent.children.includes(kit.group), false);
  assert.equal(kit.group.children.length, 0);
  for (const count of disposeCounts.values()) assert.equal(count, 1);
  assert.equal(kit.diagnostics().disposed, true);
});
