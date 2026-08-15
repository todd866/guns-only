import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld, sampleCobraCanyonTerrain } from "../cobra_canyon_plan.js";
import {
  CAMP_EMBER_CLEAR_RADIUS_M,
  COBRA_CANYON_ASSET_ROLES,
  COBRA_CANYON_SCATTER_RADIUS_M,
  createCobraCanyonAssetKit,
} from "../cobra_canyon_asset_kit.js";
import { COBRA_CANYON_RENDER_BUDGETS } from "../cobra_canyon_presentation.js";

const world = JSON.parse(await readFile(new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
  import.meta.url,
), "utf8"));

/**
 * Seven places a pilot actually flies. The world-fixed scatter this replaced put 6,828 ambient
 * instances across a 16 x 16 km theatre — one prop every 190 m — so wherever you stood, the ground
 * was bare. These sites are the check that the near field is populated EVERYWHERE, not just where
 * a lucky seed happened to cluster.
 */
const SITES = Object.freeze([
  ["camp ember", -3_800, -4_600],
  ["gorge middle", -3_000, -1_000],
  ["plantation", 550, -4_000],
  ["red earth quarry", 2_700, -1_700],
  ["paddy flats", -1_500, 600],
  ["north ridge", -1_760, 4_980],
  ["east highland", 5_000, 2_000],
]);

function create(qualityTier) {
  const plan = planCobraCanyonWorld(world, { qualityTier });
  const kit = createCobraCanyonAssetKit(THREE, plan, {
    qualityTier,
    maxInstances: COBRA_CANYON_RENDER_BUDGETS[qualityTier].maxAssetInstances,
  });
  return { plan, kit };
}

function assetMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (!object.isInstancedMesh) return;
    if (!COBRA_CANYON_ASSET_ROLES.includes(object.userData.cobraCanyon?.role)) return;
    meshes.push(object);
  });
  return meshes;
}

/** Every resident instance as {id, role, eastM, northM, y, scale}. */
function residents(root) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const out = [];
  for (const mesh of assetMeshes(root)) {
    const records = mesh.userData.cobraCanyonInstances;
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      out.push({
        id: records[index]?.id ?? null,
        setPieceId: records[index]?.setPieceId ?? null,
        role: mesh.userData.cobraCanyon.role,
        eastM: position.x,
        northM: -position.z,
        y: position.y,
        widthM: scale.x,
        heightM: scale.y,
      });
    }
  }
  return out;
}

/** Settles the kit at a camera position, draining any metered generation work. */
function park(kit, eastM, northM) {
  for (let frame = 0; frame < 120; frame++) {
    kit.update({
      cameraPosition: { x: eastM, z: -northM },
      cameraAglM: 100,
      ambientBudgetLevel: 0,
      nearRingVisible: true,
    });
  }
  return residents(kit.group);
}

test("spends the SAME allowance as a near-field disc, never a raised cap", () => {
  for (const qualityTier of ["mobile", "balanced", "desktop"]) {
    const budget = COBRA_CANYON_RENDER_BUDGETS[qualityTier];
    const { kit } = create(qualityTier);
    // The allocation — what the tier ceiling actually measures — is the whole contract. If this
    // ever exceeds the cap, the density below was bought rather than earned.
    assert.ok(
      kit.builtMetrics.instances <= budget.maxAssetInstances,
      `${qualityTier} allocated ${kit.builtMetrics.instances} of ${budget.maxAssetInstances}`,
    );
    assert.ok(kit.builtMetrics.triangles <= budget.maxTriangles);
    assert.equal(kit.builtMetrics.drawCalls, COBRA_CANYON_ASSET_ROLES.length);
    for (const [, eastM, northM] of SITES) {
      const resident = park(kit, eastM, northM);
      assert.ok(
        resident.length <= budget.maxAssetInstances,
        `${qualityTier} at ${eastM},${northM} rendered ${resident.length}`,
      );
    }
    kit.dispose();
  }
});

test("puts continuous cover under the aircraft everywhere in the valley", () => {
  const { kit } = create("desktop");
  const radiusM = 500;
  const areaKm2 = Math.PI * (radiusM / 1_000) ** 2;
  for (const [name, eastM, northM] of SITES) {
    const resident = park(kit, eastM, northM);
    const near = resident.filter(
      (entry) => Math.hypot(entry.eastM - eastM, entry.northM - northM) <= radiusM,
    );
    const perKm2 = near.length / areaKm2;
    // The world-fixed scatter managed 27 props per km². 800 is roughly one every 35 m, against
    // canopy clumps 13-40 m across — the point at which stands touch instead of dotting.
    assert.ok(
      perKm2 >= 800,
      `${name}: only ${perKm2.toFixed(0)} props/km² within ${radiusM} m (was ~27 world-fixed)`,
    );
  }
  kit.dispose();
});

test("a prop occupies the same world position every time the camera returns", () => {
  const { kit } = create("balanced");
  const first = new Map(park(kit, -3_000, -1_000).map((entry) => [entry.id, entry]));
  // Fly clean away — far enough that nothing resident survives — and come back.
  park(kit, 5_000, 4_000);
  const second = park(kit, -3_000, -1_000);
  let compared = 0;
  for (const entry of second) {
    const before = first.get(entry.id);
    if (!before) continue;
    compared += 1;
    assert.ok(Math.abs(before.eastM - entry.eastM) < 1e-6, `${entry.id} swam east`);
    assert.ok(Math.abs(before.northM - entry.northM) < 1e-6, `${entry.id} swam north`);
    assert.ok(Math.abs(before.y - entry.y) < 1e-6, `${entry.id} changed height`);
  }
  assert.ok(compared > 500, `only ${compared} props survived the round trip to be compared`);
  kit.dispose();
});

test("props scale in at the outer edge instead of switching on at full size", () => {
  const { kit } = create("desktop");
  const eastM = -3_000;
  const northM = -1_000;
  const resident = park(kit, eastM, northM);
  const jungle = resident
    // Authored set-piece dressing is world-fixed and always resident, so it never fades — it is
    // not part of the scatter and would be the farthest "jungle" in the list.
    .filter((entry) => entry.role === "jungle" && !entry.setPieceId)
    .map((entry) => ({
      ...entry,
      distanceM: Math.hypot(entry.eastM - eastM, entry.northM - northM),
    }))
    .sort((left, right) => right.distanceM - left.distanceM);
  assert.ok(jungle.length > 100);
  const outermost = jungle.slice(0, 20);
  const inner = jungle.slice(Math.floor(jungle.length * 0.6));
  const meanHeight = (list) => list.reduce((sum, e) => sum + e.heightM, 0) / list.length;
  // The band is a fade, not a wall: the last props in are visibly smaller than the settled field.
  assert.ok(
    meanHeight(outermost) < meanHeight(inner) * 0.6,
    `edge props are ${meanHeight(outermost).toFixed(1)} m against ${meanHeight(inner).toFixed(1)} m inside`,
  );
  kit.dispose();
});

test("keeps the Camp Ember eye clear and every prop on the ground, wherever the camera is", () => {
  const { plan, kit } = create("desktop");
  const pad = plan.landmarks.find((entry) => entry.id === "landmark.cobra-canyon.camp-ember.v1");
  const [padEastM, , padNorthM] = pad.positionLocalM;
  for (const [name, eastM, northM] of SITES) {
    for (const entry of park(kit, eastM, northM)) {
      if (entry.role === "jungle" || entry.role === "mist") {
        const clearance = Math.hypot(entry.eastM - padEastM, entry.northM - padNorthM);
        assert.ok(
          clearance >= CAMP_EMBER_CLEAR_RADIUS_M,
          `${name}: ${entry.role} at ${clearance.toFixed(0)} m inside the Camp Ember eye`,
        );
      }
      if (entry.role === "waterAccent") continue;
      const groundM = sampleCobraCanyonTerrain(plan, entry.eastM, entry.northM);
      assert.ok(
        entry.y <= groundM + 1e-3,
        `${name}: ${entry.role} floats ${(entry.y - groundM).toFixed(2)} m above the terrain`,
      );
      // Seat drop is bounded by the instance's own half-footprint at FULL size, and the widest
      // thing this world plants is a 120 m paddy panel. The rendered width cannot be used as the
      // bound because an instance inside the fade band is drawn smaller than it is seated for.
      assert.ok(
        groundM - entry.y <= 75,
        `${name}: ${entry.role} is buried ${(groundM - entry.y).toFixed(1)} m into the hill`,
      );
    }
  }
  kit.dispose();
});

test("keeps the authored terrain correlation: canopy on slopes, paddy on the flat", () => {
  const { plan, kit } = create("desktop");
  const gradientAt = (eastM, northM) => {
    const stepM = 40;
    const east = sampleCobraCanyonTerrain(plan, eastM + stepM, northM)
      - sampleCobraCanyonTerrain(plan, eastM - stepM, northM);
    const north = sampleCobraCanyonTerrain(plan, eastM, northM + stepM)
      - sampleCobraCanyonTerrain(plan, eastM, northM - stepM);
    return Math.hypot(east, north) / (2 * stepM);
  };
  const resident = park(kit, -1_500, 600);
  const mean = (role) => {
    const list = resident.filter((entry) => entry.role === role);
    if (!list.length) return null;
    return list.reduce((sum, entry) => sum + gradientAt(entry.eastM, entry.northM), 0) / list.length;
  };
  const jungle = mean("jungle");
  const paddy = mean("paddy");
  assert.ok(jungle !== null && paddy !== null, "the paddy flats must grow both roles nearby");
  assert.ok(
    paddy < jungle,
    `paddy sits on ${paddy.toFixed(3)} gradient, canopy on ${jungle.toFixed(3)} — the correlation inverted`,
  );
  kit.dispose();
});

test("the scatter radius is the density knob and it is per tier", () => {
  for (const qualityTier of ["mobile", "balanced", "desktop"]) {
    assert.ok(COBRA_CANYON_SCATTER_RADIUS_M[qualityTier] > 0);
    const { kit } = create(qualityTier);
    assert.equal(kit.scatterRadiusM, COBRA_CANYON_SCATTER_RADIUS_M[qualityTier]);
    kit.dispose();
  }
  // Halving the radius at a fixed allowance must roughly quadruple the near-field density: that
  // relationship is the whole reason the fix works, and it is what a future tuning pass turns.
  const plan = planCobraCanyonWorld(world, { qualityTier: "desktop" });
  const count = (radiusM) => {
    const kit = createCobraCanyonAssetKit(THREE, plan, {
      qualityTier: "desktop",
      maxInstances: COBRA_CANYON_RENDER_BUDGETS.desktop.maxAssetInstances,
      scatterRadiusM: radiusM,
    });
    const resident = park(kit, -3_000, -1_000).filter(
      (entry) => Math.hypot(entry.eastM + 3_000, entry.northM + 1_000) <= 400,
    );
    kit.dispose();
    return resident.length;
  };
  const wide = count(1_400);
  const tight = count(700);
  assert.ok(tight > wide * 2, `tightening the radius gave ${tight} against ${wide}`);
});
