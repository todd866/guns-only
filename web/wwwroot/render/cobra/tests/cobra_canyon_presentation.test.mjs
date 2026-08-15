import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  COBRA_CANYON_CAMP_EMBER_APRON,
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
import {
  CAMP_EMBER_DEPARTURE_YAW_RAD,
  CAMP_EMBER_DRAWN_RECESS_M,
  CAMP_EMBER_SPAWN_SAFETY_VOLUME,
  campEmberFirebaseParts,
} from "../cobra_camp_ember_firebase.js";
import { COBRA_CANYON_VISUAL_PROFILE } from "../cobra_canyon_visual_profile.js";
import { RELEASE_BUILD } from "../../release/release_identity.js";

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
    new RegExp(`from "\\.\\/cobra_canyon_plan\\.js\\?v=${RELEASE_BUILD}"`));
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
  for (const role of ["hazards", "bridge-deck", "bridge-pier"]) {
    const mesh = byRole(root, role);
    for (const entry of mesh?.userData.cobraCanyonInstances ?? []) {
      if (entry.authoredHazard) ids.add(entry.id);
    }
  }
  return ids;
}

function instanceWorldBounds(mesh, instanceId) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(instanceId, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return {
    minimum: {
      x: position.x - scale.x * 0.5,
      y: position.y - scale.y * 0.5,
      z: position.z - scale.z * 0.5,
    },
    maximum: {
      x: position.x + scale.x * 0.5,
      y: position.y + scale.y * 0.5,
      z: position.z + scale.z * 0.5,
    },
  };
}

function collisionToSceneBounds(minimumLocalM, maximumLocalM) {
  const [minEast, minUp, minNorth] = minimumLocalM;
  const [maxEast, maxUp, maxNorth] = maximumLocalM;
  const z0 = -minNorth;
  const z1 = -maxNorth;
  return {
    minimum: {
      x: Math.min(minEast, maxEast),
      y: Math.min(minUp, maxUp),
      z: Math.min(z0, z1),
    },
    maximum: {
      x: Math.max(minEast, maxEast),
      y: Math.max(minUp, maxUp),
      z: Math.max(z0, z1),
    },
  };
}

function assertUnitEnvelope(geometry, label) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  assert.ok(box, `${label} must expose a bounding box`);
  assert.ok(Math.abs(box.min.x + 0.5) < 1e-6, `${label} min.x`);
  assert.ok(Math.abs(box.min.y + 0.5) < 1e-6, `${label} min.y`);
  assert.ok(Math.abs(box.min.z + 0.5) < 1e-6, `${label} min.z`);
  assert.ok(Math.abs(box.max.x - 0.5) < 1e-6, `${label} max.x`);
  assert.ok(Math.abs(box.max.y - 0.5) < 1e-6, `${label} max.y`);
  assert.ok(Math.abs(box.max.z - 0.5) < 1e-6, `${label} max.z`);
}

test("the drawn basin never stands proud of the terrain the simulation flies", () => {
  // PRESENTATION MUST NOT OUTRUN THE KERNEL. CobraCanyonTerrainSurface (sim/Cobra) flies the
  // aircraft over the analytic field; the browser draws a triangle mesh sampled from it. Where the
  // field is convex — every gorge rim and ridge crest — a chord across a 133 m quad sits ABOVE the
  // surface, and the pilot flies into a hill the sim does not have. Sharpening the gorge put 20 m
  // of that error onto the ridge-shadow route, half its recommended AGL band, which is what forced
  // the neighbourhood-minimum vertex bias in basinVertexHeight. This test is that bias's contract:
  // along every authored route, at every tier, the drawn ground stays at or below simulated ground
  // within a margin far under the lowest recommended AGL band (10 m, road-plantation).
  const MAXIMUM_OVERSHOOT_M = 6;
  for (const qualityTier of QUALITY_TIERS) {
    const plan = planCobraCanyonWorld(world, { qualityTier });
    let worstM = -Infinity;
    let worstAt = null;
    for (const lane of plan.routeLanes) {
      for (let index = 0; index < lane.pathLocalM.length - 1; index++) {
        const from = lane.pathLocalM[index];
        const to = lane.pathLocalM[index + 1];
        for (let blend = 0; blend <= 1; blend += 0.004) {
          const eastM = from[0] + (to[0] - from[0]) * blend;
          const northM = from[2] + (to[2] - from[2]) * blend;
          const overshootM = sampleCobraCanyonRenderedBasinHeight(plan, qualityTier, eastM, northM)
            - sampleCobraCanyonTerrain(plan, eastM, northM);
          if (overshootM > worstM) {
            worstM = overshootM;
            worstAt = `${eastM.toFixed(0)},${northM.toFixed(0)}`;
          }
        }
      }
    }
    assert.ok(worstM <= MAXIMUM_OVERSHOOT_M,
      `${qualityTier} drawn basin stands ${worstM.toFixed(2)} m proud of simulated ground at ${worstAt}`);
  }
});

test("every rendered tier keeps the complete Camp Ember PSP apron flat at contact height", () => {
  const CAMP_EAST_M = COBRA_CANYON_CAMP_EMBER_APRON.eastM;
  const CAMP_NORTH_M = COBRA_CANYON_CAMP_EMBER_APRON.northM;
  const pads = campEmberFirebaseParts().filter((part) => part.family === "psp");
  for (const qualityTier of QUALITY_TIERS) {
    const plan = planCobraCanyonWorld(world, { qualityTier });
    for (const pad of pads) {
      const yaw = pad.yaw + CAMP_EMBER_DEPARTURE_YAW_RAD;
      const centreEastM = Math.cos(CAMP_EMBER_DEPARTURE_YAW_RAD) * pad.x
        + Math.sin(CAMP_EMBER_DEPARTURE_YAW_RAD) * pad.z;
      const centreNorthM = Math.sin(CAMP_EMBER_DEPARTURE_YAW_RAD) * pad.x
        - Math.cos(CAMP_EMBER_DEPARTURE_YAW_RAD) * pad.z;
      for (const widthBlend of [-0.5, -0.25, 0, 0.25, 0.5]) {
        for (const depthBlend of [-0.5, -0.25, 0, 0.25, 0.5]) {
          const widthOffsetM = pad.widthM * widthBlend;
          const depthOffsetM = pad.depthM * depthBlend;
          const eastOffsetM = centreEastM
            + Math.cos(yaw) * widthOffsetM + Math.sin(yaw) * depthOffsetM;
          const northOffsetM = centreNorthM
            + Math.sin(yaw) * widthOffsetM - Math.cos(yaw) * depthOffsetM;
          const eastM = CAMP_EAST_M + eastOffsetM;
          const northM = CAMP_NORTH_M + northOffsetM;
          const analyticM = sampleCobraCanyonTerrain(plan, eastM, northM);
          const renderedM = sampleCobraCanyonRenderedBasinHeight(
            plan,
            qualityTier,
            eastM,
            northM,
          );
          assert.ok(Math.abs(analyticM - COBRA_CANYON_CAMP_EMBER_APRON.elevationM) < 1e-9,
            `${qualityTier} analytic apron drifted at ${eastOffsetM},${northOffsetM}`);
          // The drawn apron sits exactly one recess BELOW the analytic contact height: the camp
          // needed real depth for its ground stack to stop sharing depth samples with the
          // terrain. What matters here is unchanged — the drawn apron must be FLAT and must
          // never rise above contact authority — so the target moves by the recess and the
          // tolerance stays as tight as it was.
          assert.ok(Math.abs(renderedM - (analyticM - CAMP_EMBER_DRAWN_RECESS_M)) < 1e-5,
            `${qualityTier} rendered apron differs by `
              + `${(renderedM - analyticM + CAMP_EMBER_DRAWN_RECESS_M).toFixed(6)} m`
              + ` at ${eastOffsetM},${northOffsetM}`);
        }
      }
    }
  }
});

test("every rendered triangle plane is level under the full Camp Ember spawn safety volume", () => {
  for (const qualityTier of QUALITY_TIERS) {
    const plan = planCobraCanyonWorld(world, { qualityTier });
    for (let localX = CAMP_EMBER_SPAWN_SAFETY_VOLUME.minimumX;
      localX <= CAMP_EMBER_SPAWN_SAFETY_VOLUME.maximumX;
      localX += 1) {
      for (let localZ = CAMP_EMBER_SPAWN_SAFETY_VOLUME.minimumZ;
        localZ <= CAMP_EMBER_SPAWN_SAFETY_VOLUME.maximumZ;
        localZ += 1) {
        const eastM = COBRA_CANYON_CAMP_EMBER_APRON.eastM
          + Math.cos(CAMP_EMBER_DEPARTURE_YAW_RAD) * localX
          + Math.sin(CAMP_EMBER_DEPARTURE_YAW_RAD) * localZ;
        const northM = COBRA_CANYON_CAMP_EMBER_APRON.northM
          + Math.sin(CAMP_EMBER_DEPARTURE_YAW_RAD) * localX
          - Math.cos(CAMP_EMBER_DEPARTURE_YAW_RAD) * localZ;
        const renderedM = sampleCobraCanyonRenderedBasinHeight(
          plan,
          qualityTier,
          eastM,
          northM,
        );
        // Still perfectly level under the whole spawn volume, just one recess lower.
        assert.ok(Math.abs(renderedM
          - (COBRA_CANYON_CAMP_EMBER_APRON.elevationM - CAMP_EMBER_DRAWN_RECESS_M)) < 1e-5,
          `${qualityTier} spawn plane drifted `
            + `${(renderedM - COBRA_CANYON_CAMP_EMBER_APRON.elevationM
              + CAMP_EMBER_DRAWN_RECESS_M).toFixed(4)} m`
            + ` at local ${localX},${localZ}`);
      }
    }
  }
});

test("Camp Ember's full medium-FOB level apron has no coarse-grid pits in any tier", () => {
  for (const qualityTier of QUALITY_TIERS) {
    const plan = planCobraCanyonWorld(world, { qualityTier });
    let deepestM = 0;
    let highestM = 0;
    const radiusM = COBRA_CANYON_CAMP_EMBER_APRON.levelRadiusM;
    for (let eastOffsetM = -radiusM; eastOffsetM <= radiusM; eastOffsetM += 2) {
      for (let northOffsetM = -radiusM; northOffsetM <= radiusM; northOffsetM += 2) {
        if (Math.hypot(eastOffsetM, northOffsetM) > radiusM) continue;
        const renderedM = sampleCobraCanyonRenderedBasinHeight(
          plan,
          qualityTier,
          COBRA_CANYON_CAMP_EMBER_APRON.eastM + eastOffsetM,
          COBRA_CANYON_CAMP_EMBER_APRON.northM + northOffsetM,
        );
        // Measured against the recessed drawn apron, so a real pit still reads as a pit.
        const datumM = COBRA_CANYON_CAMP_EMBER_APRON.elevationM - CAMP_EMBER_DRAWN_RECESS_M;
        deepestM = Math.min(deepestM, renderedM - datumM);
        highestM = Math.max(highestM, renderedM - datumM);
      }
    }
    assert.ok(deepestM >= -0.3,
      `${qualityTier} apron contains a ${deepestM.toFixed(3)} m rendered pit`);
    assert.ok(highestM <= 0.05,
      `${qualityTier} apron rises ${highestM.toFixed(3)} m above contact authority`);
  }
});

test("authored jungle geometry splits into a hero batch and stays inside every tier ceiling", () => {
  // A stand-in for the CC0 palm: 480 triangles, the same order as the real 472-triangle
  // variant. The point is the ACCOUNTING, not the shape.
  const authoredTriangles = 480;
  const palm = new THREE.BufferGeometry();
  palm.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(authoredTriangles * 9), 3),
  );

  for (const qualityTier of QUALITY_TIERS) {
    const budget = COBRA_CANYON_RENDER_BUDGETS[qualityTier];
    const { presentation } = create(qualityTier, { roleGeometries: { jungle: palm } });
    const diagnostics = presentation.diagnostics();

    assert.equal(diagnostics.withinBudget, true,
      `${qualityTier} must stay inside its ceiling with authored geometry loaded`);
    assert.ok(diagnostics.triangles <= budget.maxTriangles);
    assert.ok(diagnostics.drawCalls <= budget.maxDrawCalls);

    if (budget.maxAuthoredTriangles > 0) {
      // The reserved slot is now spent: jungle renders as hero geometry PLUS a card field.
      assert.equal(diagnostics.roleCounts.jungleRenderBatches, 2,
        `${qualityTier} must split the jungle into hero and card batches`);
      // One slot of headroom survives: the roads overlay this world no longer draws, because
      // its only road-named record is a terrain bench (see "a terrain bench is never drawn as
      // a road"). Spending it again needs a real road network, not another contour.
      assert.equal(diagnostics.presentationDrawCallHeadroom, 1);
    } else {
      // Mobile is allowed no authored triangles at all, so it must ignore the mesh entirely.
      assert.equal(diagnostics.roleCounts.jungleRenderBatches, 1,
        "mobile must not spend triangles on authored geometry");
    }
  }
});

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
    // 15, not 16: the roads overlay is gone. This world authors no road network — the only
    // road-named record is a terrain BENCH, and drawing it put a 13 km laterite stripe across
    // the valley (see "a terrain bench is never drawn as a road").
    assert.equal(diagnostics.builtDrawCalls, 15);
    assert.equal(diagnostics.roleCounts.coreRenderBatches, 8);
    assert.equal(diagnostics.roleCounts.assetRenderBatches, 7);
    assert.equal(diagnostics.roleCounts.worldRenderBatches, 15);
    assert.equal(diagnostics.roleCounts.heroCells, 3);
    assert.equal(diagnostics.roleCounts.landmarks, 11);
    assert.ok(diagnostics.roleCounts.campEmberFirebaseParts >= 28);
    assert.equal(diagnostics.roleCounts.hazards, 14);
    assert.ok(
      diagnostics.roleCounts.assetInstances <= budget.maxAssetInstances,
      `${qualityTier} asset kit must respect its instance allocation`,
    );
    // Two draw calls of headroom now. One is RESERVED for the authored-geometry hero batch,
    // which only exists once a glTF asset loads — without one, every role renders as cards in a
    // single batch and that slot stays free, so the reserve reads as headroom here and is spent
    // in the authored case below. The second is the roads overlay this world no longer draws:
    // its only road-named record is a terrain bench, and drawing it laid a 13 km laterite stripe
    // across the valley.
    assert.equal(diagnostics.presentationDrawCallHeadroom, 2);
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
    // Camp-local axes refine the otherwise 105–174 m grid around the apron and blend boundary.
    // They are topology, not extra draw calls; exact additions can vary when a local axis lands
    // on an existing tier grid line, so assert the realized square grid rather than magic 25.
    const baseSegments = COBRA_CANYON_TERRAIN_SEGMENTS[qualityTier];
    assert.ok(positions.count > (baseSegments + 1) ** 2);
    assert.ok(triangleCount(basin.geometry) > baseSegments ** 2 * 2);
    assert.ok(maximumY - minimumY > 500, `${qualityTier} needs visible basin/rim relief`);
    // The basin runs the painted-tactical surface shader. Its ONE baked attribute is enclosure
    // concavity — the only shading input a fragment cannot re-derive, because it needs the height
    // neighbourhood rather than the surface point. Everything else is per fragment, because a
    // 100 m vertex spacing cannot hold a field edge or a canopy line.
    assert.equal(basin.geometry.getAttribute("concavity").count, positions.count);
    assert.equal(basin.geometry.getAttribute("color"), undefined);
    assert.equal(basin.material.isShaderMaterial, true);
    assert.equal(basin.material.name, "COBRA_CANYON_BASIN_MATERIAL");

    // "roads" is deliberately absent: this world authors no road network, only terrain benches
    // (see the terrain-authority guard in collectRibbonPlacements). Drawing one as a road put a
    // 13 km laterite stripe across the valley.
    for (const role of ["river"]) {
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
      // WAS `castShadow === false` for every object. That assertion encoded the CONCLUSION that
      // the canyon does not pay for a shadow pass, not the invariant that presentation geometry
      // is non-authoritative — and once render-architecture stage 0 turned the pass on it was the
      // only thing standing between the scene and a legible gorge. What must stay true is the
      // policy: the things with vertical mass cast, and the flat sheets that could only ever
      // shadow-acne themselves do not.
      // The asset-kit batches carry their own tag and their own policy (asserted in
      // cobra_canyon_asset_kit.test.mjs); this traverse owns the world roles only.
      if (tag.assetKit === true) return;
      // Tags also live on organisational Groups. Shadow flags only affect renderable leaves, so
      // asserting them on a Group would pin decorative state rather than the renderer contract.
      if (!object.isMesh && !object.isInstancedMesh) return;
      const castingRole = tag.role === "basin" || tag.role === "landmarks"
        || tag.role === "hazards" || tag.role === "bridge-deck" || tag.role === "bridge-pier"
        || tag.role === "vegetation" || tag.role === "camp-ember-firebase";
      assert.equal(object.castShadow, castingRole,
        `${tag.role} cast-shadow policy regressed`);
      assert.equal(object.receiveShadow, true,
        `${tag.role} must receive: everything in this scene sits on the basin`);
    });
    // The basin is the one that matters. A 300 m gorge wall under a 16-degree sun is the only
    // caster in the world big enough to change the composition, and it is also the one a
    // "terrain does not cast" reflex removes first.
    assert.equal(basin.castShadow, true, "the basin must cast: ridge-into-gorge is the shadow");
    assert.equal(basin.material.side, THREE.FrontSide,
      "opaque heightfield: DoubleSide doubles fragment and shadow-map fill for nothing");
    presentation.dispose();
  }
});

test("soft-shades landmarks and Iron Bell so nap-AGL boxes are not crystal shards", () => {
  const { presentation } = create("balanced");
  for (const role of ["landmarks", "bridge-deck", "bridge-pier"]) {
    const mesh = byRole(presentation.group, role);
    assert.ok(mesh, `${role} mesh must exist`);
    assert.equal(mesh.material.flatShading, false, `${role} must use soft normals`);
  }
  const hazards = byRole(presentation.group, "hazards");
  assert.equal(hazards.material.flatShading, true, "hazard cues keep hard facets");
  presentation.dispose();
});

test("represents all fourteen authored hazards and never sheds them", () => {
  const { plan, presentation } = create("balanced", { nearRingRadiusM: 9_000 });
  const expectedIds = new Set(plan.hazards.map((hazard) => hazard.id));
  assert.deepEqual(representedAuthoredHazards(presentation.group), expectedIds);

  const hazardMesh = byRole(presentation.group, "hazards");
  const deckMesh = byRole(presentation.group, "bridge-deck");
  const pierMesh = byRole(presentation.group, "bridge-pier");
  const authoredHazardCount = hazardMesh.count;
  const authoredDeckCount = deckMesh.count;
  const authoredPierCount = pierMesh.count;
  assert.equal(hazardMesh.frustumCulled, false);
  assert.equal(deckMesh.frustumCulled, false);
  assert.equal(pierMesh.frustumCulled, false);

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
    assert.equal(deckMesh.visible, true);
    assert.equal(pierMesh.visible, true);
    assert.equal(hazardMesh.count, authoredHazardCount);
    assert.equal(deckMesh.count, authoredDeckCount);
    assert.equal(pierMesh.count, authoredPierCount);
    assert.deepEqual(representedAuthoredHazards(presentation.group), expectedIds);
  }
  presentation.dispose();
});

test("Iron Bell deck and piers keep visible bounds identical to collision AABBs", () => {
  const { plan, presentation } = create("balanced");
  const deckMesh = byRole(presentation.group, "bridge-deck");
  const pierMesh = byRole(presentation.group, "bridge-pier");
  assertUnitEnvelope(deckMesh.geometry, "bridge-deck");
  assertUnitEnvelope(pierMesh.geometry, "bridge-pier");
  assert.notEqual(deckMesh.geometry.uuid, pierMesh.geometry.uuid);
  assert.match(deckMesh.geometry.name, /TRUSS|DECK/i);
  assert.match(pierMesh.geometry.name, /PIER/i);

  const byId = new Map(plan.hazards.map((hazard) => [hazard.id, hazard]));
  for (const entry of deckMesh.userData.cobraCanyonInstances) {
    assert.equal(entry.kind, "bridge-deck");
    const hazard = byId.get(entry.id);
    const expected = collisionToSceneBounds(
      hazard.collision.minimumLocalM,
      hazard.collision.maximumLocalM,
    );
    const bounds = instanceWorldBounds(deckMesh, entry.instanceId);
    assert.ok(Math.abs(bounds.minimum.x - expected.minimum.x) < 1e-6);
    assert.ok(Math.abs(bounds.minimum.y - expected.minimum.y) < 1e-6);
    assert.ok(Math.abs(bounds.minimum.z - expected.minimum.z) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.x - expected.maximum.x) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.y - expected.maximum.y) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.z - expected.maximum.z) < 1e-6);
  }
  for (const entry of pierMesh.userData.cobraCanyonInstances) {
    assert.equal(entry.kind, "bridge-pier");
    const hazard = byId.get(entry.id);
    const expected = collisionToSceneBounds(
      hazard.collision.minimumLocalM,
      hazard.collision.maximumLocalM,
    );
    const bounds = instanceWorldBounds(pierMesh, entry.instanceId);
    assert.ok(Math.abs(bounds.minimum.x - expected.minimum.x) < 1e-6);
    assert.ok(Math.abs(bounds.minimum.y - expected.minimum.y) < 1e-6);
    assert.ok(Math.abs(bounds.minimum.z - expected.minimum.z) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.x - expected.maximum.x) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.y - expected.maximum.y) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.z - expected.maximum.z) < 1e-6);
  }
  assert.equal(deckMesh.count, 1);
  assert.equal(pierMesh.count, 2);
  assert.equal(
    (byRole(presentation.group, "landmarks")?.userData.cobraCanyonInstances ?? [])
      .filter((entry) => entry.id === "landmark.cobra-canyon.iron-bell-bridge.v1").length,
    0,
    "Iron Bell landmark must not double-draw against hazard AABBs",
  );
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
    assert.notEqual(entry.kind, "forward-operating-base",
      "Camp Ember must not use the stretched landmark cylinder stack");
    if (entry.kind === "rock-spires") tallestNeedleM = Math.max(tallestNeedleM, scale.y);
  }
  assert.ok(tallestNeedleM > 40 && tallestNeedleM <= 64,
    `Karst Needles must stay readable but capped (got ${tallestNeedleM}m) — uncapped authored tops painted UFOs`);
  const firebase = presentation.group.getObjectByName("CAMP_EMBER_FIREBASE");
  assert.ok(firebase, "Camp Ember BF:V firebase mesh must be present");
  assert.ok(presentation.diagnostics().roleCounts.campEmberFirebaseParts >= 28);
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
  const decks = byRole(presentation.group, "bridge-deck");
  const piers = byRole(presentation.group, "bridge-pier");
  // Settle the camera before baselining: the scatter is camera-following, so occupancy is a
  // property of where the aircraft is, and the kit boots at the Camp Ember spawn rather than here.
  presentation.update({ ambientBudgetLevel: 0, cameraPosition: { x: 0, z: 0 }, cameraAglM: 40 });
  const baseCounts = new Map([...assets].map(([role, mesh]) => [role, mesh.count]));
  const baseHazardCount = hazards.count;
  const baseDeckCount = decks.count;
  const basePierCount = piers.count;
  const firstMatrix = new THREE.Matrix4();
  const firstPosition = new THREE.Vector3();
  const firstQuaternion = new THREE.Quaternion();
  const firstScale = new THREE.Vector3();
  assets.get("jungle").getMatrixAt(0, firstMatrix);
  firstMatrix.decompose(firstPosition, firstQuaternion, firstScale);
  const firstGroundM = sampleCobraCanyonTerrain(plan, firstPosition.x, -firstPosition.z);
  // The invariant is ONE-SIDED, and it has to be: an instance may be bedded INTO the hill but
  // never lifted off it. Canopy placement deliberately seeks steep ground, and a stand anchored
  // exactly at its centre sample cantilevers off a gorge wall — the visible artefact is a grove
  // hanging in mid-air on the downhill side. Seating sinks each instance by the drop across its
  // own half-width, so the uphill skirt buries and the downhill skirt meets the slope. The bound
  // below is that half-width drop plus slack; anything deeper is a placement bug, and anything
  // above ground is the float this assertion was written to catch.
  assert.ok(firstPosition.y <= firstGroundM + 1e-4,
    "asset instances must never float above the analytical terrain");
  const firstFootprintM = Math.max(firstScale.x, firstScale.z) * 0.5;
  assert.ok(firstGroundM - firstPosition.y <= firstFootprintM + 1e-3,
    "asset instances must not be buried deeper than their own footprint drop");

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
    assert.equal(decks.count, baseDeckCount);
    assert.equal(piers.count, basePierCount);
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
  assert.equal(decks.visible, true);
  assert.equal(piers.visible, true);

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
  assert.equal(decks.count, baseDeckCount);
  assert.equal(piers.count, basePierCount);
  presentation.dispose();
});

test("uses deterministic static matrices and cached frozen diagnostics", () => {
  const first = create("desktop").presentation;
  const second = create("desktop").presentation;
  for (const role of ["landmarks", "hazards", "bridge-deck", "bridge-pier", ...COBRA_CANYON_ASSET_ROLES]) {
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

  // The scatter is camera-following, so the resident set — and therefore the diagnostics — moves
  // with the aircraft. What must stay true is that a frame which changes NOTHING allocates
  // nothing: settle the camera first, then pin object identity across repeated identical frames.
  first.update({ cameraPosition: { x: 0, z: 0 }, cameraAglM: 40, ambientBudgetLevel: 0 });
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

test("basin carries the enclosure term the fragment shader cannot re-derive", () => {
  const { plan, presentation } = create("balanced");
  const basin = byRole(presentation.group, "basin");
  const concavity = basin.geometry.getAttribute("concavity");
  const positions = basin.geometry.getAttribute("position");
  const columnCount = Math.sqrt(positions.count);
  assert.equal(Number.isInteger(columnCount), true);

  let minimum = Infinity;
  let maximum = -Infinity;
  let concaveBelowMean = 0;
  let concaveSamples = 0;
  let convexAboveMean = 0;
  let convexSamples = 0;
  for (let row = 2; row < columnCount - 2; row++) {
    for (let column = 2; column < columnCount - 2; column++) {
      const index = row * columnCount + column;
      const value = concavity.getX(index);
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      const ringMeanM = (
        positions.getY(index - 2) + positions.getY(index + 2)
        + positions.getY(index - 2 * columnCount) + positions.getY(index + 2 * columnCount)
      ) / 4;
      const relief = positions.getY(index) - ringMeanM;
      // The whole point of the term: below the neighbourhood is a valley to darken, above it is
      // a crest to let catch light. A constant attribute would satisfy a range check alone.
      if (relief < -3) {
        concaveSamples += 1;
        if (value < 0.5) concaveBelowMean += 1;
      } else if (relief > 3) {
        convexSamples += 1;
        if (value > 0.5) convexAboveMean += 1;
      }
    }
  }
  assert.ok(minimum < 0.2 && maximum > 0.8,
    `concavity must span the occlusion range, got ${minimum.toFixed(3)}..${maximum.toFixed(3)}`);
  assert.ok(concaveSamples > 200 && convexSamples > 200,
    "probe must find both valley and crest vertices");
  assert.equal(concaveBelowMean, concaveSamples);
  assert.equal(convexAboveMean, convexSamples);
  assert.ok(plan);
});

test("river carries its centreline frame, so the shoreline can exist per fragment", () => {
  const { presentation } = create("balanced");
  const river = byRole(presentation.group, "river");
  const frame = river.geometry.getAttribute("riverFrame");
  const positions = river.geometry.getAttribute("position");
  assert.equal(frame.itemSize, 4);
  assert.equal(frame.count, positions.count);

  let minimumLateral = Infinity;
  let maximumLateral = -Infinity;
  for (let index = 0; index < positions.count; index++) {
    // The shader's own expression: world z is -north.
    const lateral = Math.abs(
      (positions.getX(index) - frame.getX(index)) * frame.getZ(index)
      + (-positions.getZ(index) - frame.getY(index)) * frame.getW(index),
    );
    minimumLateral = Math.min(minimumLateral, lateral);
    maximumLateral = Math.max(maximumLateral, lateral);
  }
  // 1.0 is the waterline. The ribbon must reach open water on one side of it and dry gravel on
  // the other, or the river renders entirely as one or entirely as the other — the exact failure
  // a baked per-vertex bank colour produced, because all four vertices across the ribbon sit at
  // its outer edge and no per-vertex quantity can hold an edge in the interior.
  assert.ok(minimumLateral < 0.3,
    `river must reach its channel centre, closest lateral was ${minimumLateral.toFixed(3)}`);
  assert.ok(maximumLateral > 1.05,
    `river must carry gravel outside the waterline, widest lateral was ${maximumLateral.toFixed(3)}`);
});

test("a terrain bench is never drawn as a road", () => {
  // `road-and-plantation-bench` is a 235 m half-width SHELF the landscape is graded along —
  // the thing a road would sit on — and it declares `authority.role: "terrain-authority"`.
  // Its kind contains the substring "road", so it passed the road filter, took the 7 m default
  // width it does not author, and was drawn as a 7 m laterite stripe down a 13 km contour:
  // across the valley, across the river with no bridge, edge to edge of the map. Reported by
  // the owner three times as "that random red line", and it never meant anything at all.
  const benches = (world.terrain?.ribbons ?? []).filter((ribbon) => {
    const kind = String(ribbon?.kind ?? "");
    return kind.includes("road") || kind.includes("track");
  });
  assert.ok(benches.length > 0, "fixture must still contain a road-named terrain bench");
  for (const bench of benches) {
    assert.ok(
      String(bench.kind).includes("bench") || bench.authority?.role === "terrain-authority",
      `${bench.id} is road-named but carries no marker distinguishing it from a real road`,
    );
  }

  const { presentation } = create("balanced");
  const roads = presentation.group.children.find((child) => child.name?.includes("ROADS"));
  assert.equal(roads, undefined, "a terrain bench must not produce a road overlay");
});
