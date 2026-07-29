import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createMissionFeaturePresentation,
  MISSION_FEATURE_RENDER_BUDGETS,
} from "../mission_features.js";
import {
  UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES,
} from "../soft_world_atmosphere.js";

const canonicalPackUrl = new URL(
  "../../../content/packs/ukraine-modern/environment/hero-cells/"
    + "soniachne-clinic-a.feature-pack.json",
  import.meta.url,
);

async function canonicalPack() {
  return JSON.parse(await readFile(canonicalPackUrl, "utf8"));
}

function atmosphereUniforms() {
  return {
    uFogColor: { value: new THREE.Color(0xd2c4a8) },
    uFogDensity: { value: 0.000052 },
    uAtmosphereDensityScale: { value: 0.42 },
    uAtmosphereHazeColor: { value: new THREE.Color(0.78, 0.72, 0.58) },
    uAtmosphereHazeMix: { value: 0.62 },
    uWorldEdgeM: { value: 24_000 },
    uHazeBands: { value: 3 },
    uHazeBandBlend: { value: 0.18 },
  };
}

function renderedDigest(group) {
  return group.children
    .filter((child) => child.isInstancedMesh)
    .map((mesh) => ({
      name: mesh.name,
      count: mesh.count,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      matrices: Array.from(mesh.instanceMatrix.array),
      colors: Array.from(mesh.instanceColor.array),
      semantics: mesh.userData.missionFeatureBatch.semanticInstances,
    }));
}

test("builds the canonical clinic as one deterministic, tier-bounded static child group", async () => {
  const pack = await canonicalPack();
  assert.deepEqual(MISSION_FEATURE_RENDER_BUDGETS, {
    mobile: { maxDrawCalls: 8, maxInstances: 384, maxTriangles: 45_000 },
    balanced: { maxDrawCalls: 9, maxInstances: 640, maxTriangles: 75_000 },
    desktop: { maxDrawCalls: 12, maxInstances: 896, maxTriangles: 120_000 },
  });

  for (const [qualityTier, expectedMarkingDashes] of [
    ["mobile", 8],
    ["balanced", 10],
    ["desktop", 12],
  ]) {
    const first = createMissionFeaturePresentation(THREE, pack, { qualityTier });
    const repeated = createMissionFeaturePresentation(THREE, pack, { qualityTier });
    const diagnostics = first.diagnostics();
    const expectedMetrics = {
      mobile: {
        instances: 284,
        mainPassTriangles: 7_160,
        shadowTriangles: 0,
        triangles: 7_160,
      },
      balanced: {
        instances: 331,
        mainPassTriangles: 8_436,
        shadowTriangles: 0,
        triangles: 8_436,
      },
      desktop: {
        instances: 390,
        mainPassTriangles: 9_856,
        shadowTriangles: 4_288,
        triangles: 14_144,
      },
    }[qualityTier];

    assert.equal(first.group.name,
      "MISSION_FEATURE_PACK_MISSION-FEATURE-PACK_UKRAINE-MODERN_SONIACHNE-CLINIC-A_V1");
    assert.equal(first.group.matrixAutoUpdate, false);
    assert.deepEqual(first.group.position.toArray(), [-4208, 212.5, -4096],
      "feature root must use the pack source anchor and render north as -Z");
    assert.ok(first.group.children.every((child) => child.matrixAutoUpdate === false),
      "all direct feature children must remain static after Ready");
    assert.equal(diagnostics.featurePackId,
      "mission-feature-pack.ukraine-modern.soniachne-clinic-a.v1");
    assert.equal(diagnostics.qualityTier, qualityTier);
    const batches = first.group.children.filter((child) => child.isInstancedMesh);
    const shadowBatches = batches.filter((batch) => batch.castShadow);
    assert.ok(diagnostics.drawCalls <= MISSION_FEATURE_RENDER_BUDGETS[qualityTier].maxDrawCalls);
    assert.equal(diagnostics.mainPassDrawCalls, batches.length);
    assert.equal(diagnostics.shadowDrawCalls, shadowBatches.length);
    assert.equal(diagnostics.drawCalls,
      diagnostics.mainPassDrawCalls + diagnostics.shadowDrawCalls,
      "the declared draw ceiling must include possible directional-shadow submissions");
    assert.ok(diagnostics.instances <= MISSION_FEATURE_RENDER_BUDGETS[qualityTier].maxInstances);
    assert.ok(diagnostics.triangles <= MISSION_FEATURE_RENDER_BUDGETS[qualityTier].maxTriangles);
    assert.equal(diagnostics.instances, expectedMetrics.instances);
    assert.equal(diagnostics.mainPassTriangles, expectedMetrics.mainPassTriangles);
    assert.equal(diagnostics.shadowTriangles, expectedMetrics.shadowTriangles);
    assert.equal(diagnostics.triangles, expectedMetrics.triangles,
      "triangle ceilings must include the enabled authored shadow submission");
    assert.ok(batches.every((batch) => batch.receiveShadow),
      "all tiers retain received world shadows for landmark readability");
    if (qualityTier === "desktop") {
      assert.equal(diagnostics.mainPassDrawCalls, 6);
      assert.equal(diagnostics.shadowDrawCalls, 4);
      assert.equal(diagnostics.drawCalls, 10);
      assert.ok(batches
        .filter((batch) =>
          !["MISSION_FEATURE_BATCH_MARKINGS", "MISSION_FEATURE_BATCH_CANOPIES"]
            .includes(batch.name))
        .every((batch) => batch.castShadow),
      "desktop may spend the four remaining submissions on solid authored shadows");
      assert.equal(first.group.getObjectByName("MISSION_FEATURE_BATCH_MARKINGS").castShadow, false,
        "transparent visual markings must never cast");
      assert.equal(first.group.getObjectByName("MISSION_FEATURE_BATCH_CANOPIES").castShadow, false,
        "the broad authored shelterbelt must not duplicate its fill into the shadow pass");
    } else {
      assert.equal(diagnostics.mainPassDrawCalls, 6);
      assert.equal(diagnostics.shadowDrawCalls, 0);
      assert.equal(diagnostics.drawCalls, 6);
      assert.ok(batches.every((batch) => batch.castShadow === false),
        `${qualityTier} must not duplicate authored batches into the shadow pass`);
    }
    if (qualityTier === "mobile") {
      assert.ok(diagnostics.instances <= 320,
        "village-edge cottages may densify the mobile hero cell without becoming a prop carpet");
      assert.ok(diagnostics.triangles < 8_000,
        "mobile architectural character must stay geometry-cheap");
    }
    assert.equal(diagnostics.landingZones, 1);
    assert.equal(diagnostics.lzAssessmentStatus, "unassessed");
    assert.deepEqual(renderedDigest(first.group), renderedDigest(repeated.group),
      "stable feature IDs must produce byte-stable matrices, colours, and instance mappings");

    const markingBatch = first.group.getObjectByName("MISSION_FEATURE_BATCH_MARKINGS");
    assert.equal(markingBatch.count, expectedMarkingDashes,
      "one explicit unassessed marker must become a tier-bounded broken meadow ring");
    assert.ok(markingBatch.userData.missionFeatureBatch.semanticInstances.every((entry) =>
      entry.featureId === "feature.soniachne-clinic-a.lz-ring.v1"));

    const mainClinicDetails = first.group.children
      .filter((child) => child.isInstancedMesh)
      .flatMap((child) => child.userData.missionFeatureBatch.semanticInstances)
      .filter((entry) =>
        entry.featureId === "feature.soniachne-clinic-a.main-clinic.v1")
      .map((entry) => entry.primitiveRole);
    for (const role of ["stone_plinth", "front_window", "entry_door",
      "clinic_vestibule", "entry_awning", "chimney"]) {
      assert.ok(mainClinicDetails.includes(role),
        `the clinic silhouette must include low-cost ${role} detail`);
    }

    const segmentBatch = first.group.getObjectByName("MISSION_FEATURE_BATCH_SEGMENTS");
    const roadInstances = segmentBatch.userData.missionFeatureBatch.semanticInstances
      .map((entry, instanceId) => ({ ...entry, instanceId }))
      .filter((entry) => entry.primitiveRole === "road_ribbon");
    assert.equal(roadInstances.length, 52,
      "the three semantic road reaches must split at their LOD0 triangle crossings");
    assert.deepEqual(Object.fromEntries(
      ["feature.soniachne-clinic-a.road-west.v1",
        "feature.soniachne-clinic-a.road-centre.v1",
        "feature.soniachne-clinic-a.road-east.v1"]
        .map((featureId) => [
          featureId,
          roadInstances.filter((entry) => entry.featureId === featureId).length,
        ]),
    ), {
      "feature.soniachne-clinic-a.road-west.v1": 21,
      "feature.soniachne-clinic-a.road-centre.v1": 11,
      "feature.soniachne-clinic-a.road-east.v1": 20,
    });
    for (const road of roadInstances) {
      const matrix = new THREE.Matrix4().fromArray(
        segmentBatch.instanceMatrix.array,
        road.instanceId * 16,
      );
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      assert.ok(Math.abs(scale.x - 7) < 1e-5);
      assert.ok(Math.abs(scale.y - 0.06) < 1e-5,
        "road ribbons must hug terrain instead of becoming intersecting field slabs");
      assert.ok(scale.z <= 32,
        "each road ribbon chord must remain inside the source LOD0 sample spacing");
    }

    const expectedShelterbeltStands = qualityTier === "mobile"
      ? 10 : qualityTier === "balanced" ? 12 : 14;
    const canopyBatch = first.group.getObjectByName("MISSION_FEATURE_BATCH_CANOPIES");
    const canopyInstances = canopyBatch.userData.missionFeatureBatch.semanticInstances
      .map((entry, instanceId) => ({ ...entry, instanceId }))
      .filter((entry) =>
        entry.featureId === "feature.soniachne-clinic-a.shelterbelt-north.v1");
    assert.equal(canopyInstances.length, expectedShelterbeltStands * 3,
      "each shelterbelt stand must use three overlapping opaque crown lobes");
    const columnBatch = first.group.getObjectByName("MISSION_FEATURE_BATCH_COLUMNS");
    const trunkInstances = columnBatch.userData.missionFeatureBatch.semanticInstances
      .map((entry, instanceId) => ({ ...entry, instanceId }))
      .filter((entry) =>
        entry.primitiveRole === "shelterbelt_trunk"
        && entry.featureId === "feature.soniachne-clinic-a.shelterbelt-north.v1");
    assert.equal(trunkInstances.length, expectedShelterbeltStands);
    const shelterbelt = pack.features.find((feature) =>
      feature.id === "feature.soniachne-clinic-a.shelterbelt-north.v1");
    for (let stand = 0; stand < trunkInstances.length; stand++) {
      const profileIndex = Math.round(
        stand / Math.max(1, trunkInstances.length - 1)
          * (shelterbelt.pathLocalM.length - 1),
      );
      const [expectedEast, expectedUp, expectedNorth] = shelterbelt.pathLocalM[profileIndex];
      const matrix = new THREE.Matrix4().fromArray(
        columnBatch.instanceMatrix.array,
        trunkInstances[stand].instanceId * 16,
      );
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), scale);
      assert.ok(Math.abs(position.x - expectedEast) < 1e-4);
      assert.ok(Math.abs(position.z + expectedNorth) < 1e-4);
      assert.ok(Math.abs(position.y - scale.y * 0.5 - expectedUp) < 1e-4,
        "every tier must plant each shelterbelt trunk on an authored LOD0 sample");
      for (const crown of canopyInstances.slice(stand * 3, stand * 3 + 3)) {
        const crownMatrix = new THREE.Matrix4().fromArray(
          canopyBatch.instanceMatrix.array,
          crown.instanceId * 16,
        );
        const crownPosition = new THREE.Vector3();
        const crownScale = new THREE.Vector3();
        crownMatrix.decompose(crownPosition, new THREE.Quaternion(), crownScale);
        assert.ok(crownPosition.y - crownScale.y * 0.5 > expectedUp + 1,
          "the crown must inherit the sampled stand base instead of remaining on a flat plane");
      }
    }
    assert.equal(canopyBatch.castShadow, false,
      "the broad shelterbelt receives light but never doubles its fill in the shadow pass");

    first.dispose();
    repeated.dispose();
  }
});

test("rejects a visual road path that contradicts its declared semantic endpoints", async () => {
  const pack = await canonicalPack();
  const road = pack.features.find((feature) =>
    feature.id === "feature.soniachne-clinic-a.road-west.v1");
  road.pathLocalM[0][1] += 1;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, pack, { qualityTier: "mobile" }),
    /first point must match the declared road endpoint/,
  );
});

test("shares the exact Ukraine atmosphere uniform entries across every feature material", async () => {
  const pack = await canonicalPack();
  const shared = atmosphereUniforms();
  const presentation = createMissionFeaturePresentation(THREE, pack, {
    qualityTier: "mobile",
    atmosphereUniforms: shared,
  });
  const batches = presentation.group.children.filter((child) => child.isInstancedMesh);
  assert.ok(batches.length > 0);

  for (const batch of batches) {
    const material = batch.material;
    assert.equal(material.userData.ukraineSoftWorldFog, true);
    assert.equal(material.fog, false, "scene fog must not double-apply over soft-world extinction");
    const shader = {
      uniforms: {},
      vertexShader: [
        "#include <fog_pars_vertex>",
        "void main() { vec4 mvPosition = vec4(0.0);",
        "#include <fog_vertex>",
        "}",
      ].join("\n"),
      fragmentShader: [
        "#include <fog_pars_fragment>",
        "void main() { vec3 outgoingLight = vec3(1.0);",
        "#include <opaque_fragment>",
        "}",
      ].join("\n"),
    };
    material.onBeforeCompile(shader, {});
    for (const name of UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES) {
      assert.equal(shader.uniforms[name], shared[name],
        `${material.name} must share, not clone, ${name}`);
    }
    assert.match(shader.fragmentShader, /softWorldFogDensity/);
  }

  presentation.dispose();
});

test("preserves stable semantic IDs while keeping the LZ explicitly unassessed", async () => {
  const pack = await canonicalPack();
  const presentation = createMissionFeaturePresentation(THREE, pack, {
    qualityTier: "balanced",
  });

  const clinic = presentation.featureNode("feature.soniachne-clinic-a.main-clinic.v1");
  assert.ok(clinic);
  assert.deepEqual(clinic.position.toArray(), [-24, 0.5, -12]);
  assert.equal(clinic.userData.missionFeature.featureId,
    "feature.soniachne-clinic-a.main-clinic.v1");
  assert.equal(clinic.userData.missionFeature.kind, "building");
  assert.equal(clinic.userData.missionFeature.role, "clinic_main");
  assert.equal(clinic.userData.missionFeature.targetable, false);
  assert.equal(clinic.userData.missionFeature.affiliation, "civilian_fictional");

  const lz = presentation.featureNode("lz.soniachne-clinic-a.visual-marker.v1");
  assert.ok(lz);
  assert.deepEqual(lz.position.toArray(), [35, -0.8, 20]);
  assert.equal(lz.userData.missionFeature.kind, "landing_zone");
  assert.equal(lz.userData.missionFeature.status, "unassessed");
  assert.equal(lz.userData.missionFeature.targetable, false);
  assert.equal(lz.userData.missionFeature.safeApproachHeadingDeg, undefined);
  assert.equal(lz.userData.missionFeature.medicalCapability, undefined);

  const mappedIds = new Set(
    presentation.group.children
      .filter((child) => child.isInstancedMesh)
      .flatMap((child) => child.userData.missionFeatureBatch.semanticInstances)
      .map((entry) => entry.featureId),
  );
  for (const feature of pack.features) {
    assert.ok(mappedIds.has(feature.id), `${feature.id} must remain addressable through its batch`);
  }

  presentation.dispose();
});

test("rejects renderer-owned safety and medical claims on landing zones", async () => {
  const pack = await canonicalPack();
  const assessed = structuredClone(pack);
  assessed.landingZones[0].status = "assessed_safe";
  assert.throws(
    () => createMissionFeaturePresentation(THREE, assessed),
    /unsafe assessment status "assessed_safe"/,
  );

  const inventedApproach = structuredClone(pack);
  inventedApproach.landingZones[0].safeApproachHeadingDeg = 270;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, inventedApproach),
    /renderer-owned safeApproachHeadingDeg/,
  );

  const inventedMedicine = structuredClone(pack);
  inventedMedicine.landingZones[0].medicalCapability = "stabilization-and-transfer";
  assert.throws(
    () => createMissionFeaturePresentation(THREE, inventedMedicine),
    /renderer-owned medicalCapability/,
  );

  const claimedSafe = structuredClone(pack);
  claimedSafe.landingZones[0].safeApproachClaimed = true;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, claimedSafe),
    /cannot assert safeApproachClaimed while unassessed/,
  );

  const targetableDecoration = structuredClone(pack);
  targetableDecoration.features[0].targetable = true;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, targetableDecoration),
    /must remain non-targetable presentation-only scenery/,
  );
});

test("enforces the declared tier budget before allocating a visible runtime", async () => {
  const pack = await canonicalPack();
  const drawBound = structuredClone(pack);
  drawBound.renderBudgets.mobile.maxDrawCalls = 5;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, drawBound, { qualityTier: "mobile" }),
    /needs 6 draw calls on mobile; 6 main \+ 0 shadow submissions, budget is 5/,
  );

  const desktopShadowBound = structuredClone(pack);
  desktopShadowBound.renderBudgets.desktop.maxDrawCalls = 9;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, desktopShadowBound, {
      qualityTier: "desktop",
    }),
    /needs 10 draw calls on desktop; 6 main \+ 4 shadow submissions, budget is 9/,
  );

  const instanceBound = structuredClone(pack);
  instanceBound.renderBudgets.mobile.maxInstances = 8;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, instanceBound, { qualityTier: "mobile" }),
    /instances on mobile; budget is 8/,
  );

  const semanticBound = structuredClone(pack);
  semanticBound.semanticCaps.maxStableFeatures = 4;
  assert.throws(
    () => createMissionFeaturePresentation(THREE, semanticBound),
    /semantic features; tier-safe cap is 4/,
  );
});

test("accepts keyed feature objects and typed local triples without changing semantics", () => {
  const pack = {
    featurePackId: "mission-feature-pack.test.typed.v1",
    packVersion: "1.0.0",
    theatre: { theatreId: "theatre.test.v1" },
    coordinateFrame: {
      anchorSourceM: { eastM: 100, northM: 200, upM: 10 },
    },
    renderBudgets: {
      mobile: {
        maxDrawCalls: 6,
        maxInstances: 256,
        maxTriangles: 35_000,
        maxSurfacePatchTriangles: 0,
      },
    },
    semanticCaps: {
      maxStableFeatures: 128,
      maxLandingZoneCandidates: 4,
    },
    landingZones: {
      "lz.typed.v1": {
        centerLocalM: new Float32Array([5, 0, 7]),
        markerRadiusM: 20,
        status: "unassessed",
      },
    },
    features: {
      buildings: [{
        id: "feature.typed.clinic.v1",
        role: "clinic_main",
        targetable: false,
        pose: {
          positionLocalM: new Float32Array([1, 2, 3]),
          yawDeg: 15,
        },
        dimensionsM: { width: 12, height: 4, depth: 8 },
        presentation: {
          primitive: "gable_building",
          batch: "clinic_buildings",
          color: "#D9CEAC",
          secondaryColor: "#71594D",
          essential: true,
        },
      }],
    },
  };

  const presentation = createMissionFeaturePresentation(THREE, pack, {
    qualityTier: "mobile",
  });
  assert.deepEqual(presentation.group.position.toArray(), [100, 10, -200]);
  assert.equal(presentation.featureNode("feature.typed.clinic.v1")
    .userData.missionFeature.kind, "buildings");
  assert.equal(presentation.featureNode("lz.typed.v1")
    .userData.missionFeature.status, "unassessed");
  assert.equal(presentation.diagnostics().semanticFeatures, 2);
  assert.ok(presentation.group.getObjectByName("MISSION_FEATURE_BATCH_STRUCTURES"));
  assert.ok(presentation.group.getObjectByName("MISSION_FEATURE_BATCH_ROOFS"));
  assert.ok(presentation.group.getObjectByName("MISSION_FEATURE_BATCH_MARKINGS"),
    "an LZ without an explicit marker feature receives one unassessed visual ring");
  presentation.dispose();
});

test("disposes owned geometry and materials idempotently and detaches from terrain", async () => {
  const pack = await canonicalPack();
  const presentation = createMissionFeaturePresentation(THREE, pack, {
    qualityTier: "mobile",
  });
  const terrainGroup = new THREE.Group();
  terrainGroup.add(presentation.group);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  const batches = presentation.group.children.filter((child) => child.isInstancedMesh);
  for (const batch of batches) {
    batch.geometry.addEventListener("dispose", () => geometryDisposals++);
    batch.material.addEventListener("dispose", () => materialDisposals++);
  }

  presentation.dispose();
  presentation.dispose();

  assert.equal(presentation.group.parent, null);
  assert.equal(terrainGroup.children.length, 0);
  assert.equal(geometryDisposals, batches.length);
  assert.equal(materialDisposals, batches.length);
  assert.equal(presentation.featureNode("feature.soniachne-clinic-a.main-clinic.v1"), null);
  assert.deepEqual({
    drawCalls: presentation.diagnostics().drawCalls,
    mainPassDrawCalls: presentation.diagnostics().mainPassDrawCalls,
    shadowDrawCalls: presentation.diagnostics().shadowDrawCalls,
    instances: presentation.diagnostics().instances,
    triangles: presentation.diagnostics().triangles,
    disposed: presentation.diagnostics().disposed,
  }, {
    drawCalls: 0,
    mainPassDrawCalls: 0,
    shadowDrawCalls: 0,
    instances: 0,
    triangles: 0,
    disposed: true,
  });
});
