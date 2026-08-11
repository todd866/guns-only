import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  createAh1gPresence,
  eyeWorldFromVehicle,
  updateAh1gPresence,
} from "../ah1g_presence.js";

/**
 * Regression pin for the Build 264 owner ruling: "don't bother with a cockpit,
 * just do a HUD". In FIRST PERSON the rear-seat eye must see NO airframe
 * geometry at all — no frame, sills, consoles, mast, nose, glass, and
 * deliberately no rotor either: the presence's rotor disc/blades are authored
 * as exterior-silhouette cues (0.72/0.4-opacity paddles), and as a first-person
 * tint they read as dirt on the lens under the new HUD, not as rotor wash.
 * Exterior/tour mode keeps the complete silhouette (Build 261 budgets).
 * Raycasts the forward frame exactly as cobra-lab/main.js syncAuthorityCamera
 * frames it (production fov 58, near 0.12, body-aligned optical axis).
 */
const GRID_WIDTH = 96;
const GRID_HEIGHT = 54;

function measureForwardOcclusion({ firstPerson }) {
  const vehicle = { x_m: 0, y_m: 0, z_m: 0, yaw_rad: 0, pitch_rad: 0, roll_rad: 0, main_rotor_rpm: 324 };

  const presence = createAh1gPresence(THREE);
  const scene = new THREE.Scene();
  scene.add(presence.group);
  // Order matters: updateAh1gPresence runs every frame and must not undo the mode.
  presence.setFirstPerson(firstPerson);
  updateAh1gPresence(presence, vehicle, 0);
  scene.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(58, 1440 / 900, 0.12, 32000);
  camera.rotation.order = "YXZ";
  eyeWorldFromVehicle(THREE, vehicle, camera.position);
  const lookPitch = 0;
  const lookDistanceM = 140;
  camera.lookAt(new THREE.Vector3(
    camera.position.x,
    camera.position.y + Math.sin(lookPitch) * lookDistanceM,
    camera.position.z - lookDistanceM,
  ));
  camera.rotation.z = 0;
  camera.updateMatrixWorld(true);

  const ray = new THREE.Raycaster();
  ray.near = 0.12;
  let opaque = 0;
  let translucent = 0;
  let clear = 0;
  let centerColumnFirstOpaqueRow = GRID_HEIGHT;
  const centerColumn = Math.floor(GRID_WIDTH / 2);
  // THREE's raycaster deliberately ignores `visible`; the renderer does not. Apply
  // renderer semantics so the measurement reports what the pilot would actually see.
  const rendered = (object) => {
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) return false;
    }
    return true;
  };
  for (let j = 0; j < GRID_HEIGHT; j++) {
    for (let i = 0; i < GRID_WIDTH; i++) {
      const ndc = new THREE.Vector2(
        (i + 0.5) / GRID_WIDTH * 2 - 1,
        -((j + 0.5) / GRID_HEIGHT * 2 - 1),
      );
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(presence.group, true);
      let opaqueHit = false;
      let translucentHit = false;
      for (const hit of hits) {
        if (!rendered(hit.object)) continue;
        const material = hit.object.material;
        const opacity = material?.opacity ?? 1;
        if (!material?.transparent || opacity >= 0.99) {
          opaqueHit = true;
          break;
        }
        translucentHit = true;
      }
      if (opaqueHit) {
        opaque++;
        if (i === centerColumn && j < centerColumnFirstOpaqueRow) {
          centerColumnFirstOpaqueRow = j;
        }
      } else if (translucentHit) {
        translucent++;
      } else {
        clear++;
      }
    }
  }
  presence.dispose();
  const total = GRID_WIDTH * GRID_HEIGHT;
  return {
    opaqueFraction: opaque / total,
    clearFraction: clear / total,
    clearOrGlassFraction: (clear + translucent) / total,
    centerColumnFirstOpaqueRow,
  };
}

const cachedViews = new Map();
function forwardView(firstPerson) {
  if (!cachedViews.has(firstPerson)) {
    cachedViews.set(firstPerson, measureForwardOcclusion({ firstPerson }));
  }
  return cachedViews.get(firstPerson);
}

test("first person renders zero cockpit geometry: no opaque hull, no tint", () => {
  const view = forwardView(true);
  assert.equal(
    view.opaqueFraction, 0,
    `opaque-blocked ${(view.opaqueFraction * 100).toFixed(1)}% of frame; first person must be 0%`,
  );
  assert.equal(
    view.clearFraction, 1,
    `fully-clear ${(view.clearFraction * 100).toFixed(1)}% of frame; first person must be 100% `
      + "(rotor disc/blades excluded by decision: exterior cues, not first-person rotor wash)",
  );
  assert.equal(view.centerColumnFirstOpaqueRow, GRID_HEIGHT);
});

test("exterior mode keeps the complete silhouette (tour/pagehide contract)", () => {
  const view = forwardView(false);
  // From INSIDE the silhouette the Build 261 budgets prove the geometry is present
  // and still authored around the rear-seat wedge: some opaque structure visible,
  // glass tint present, and the old entombment ceilings still respected.
  assert.ok(
    view.opaqueFraction > 0.02,
    `opaque ${(view.opaqueFraction * 100).toFixed(1)}%; exterior silhouette must still exist`,
  );
  assert.ok(
    view.clearOrGlassFraction < 1,
    "exterior mode must still tint part of the frame (canopy glass present)",
  );
  assert.ok(
    view.opaqueFraction < 0.2,
    `opaque-blocked ${(view.opaqueFraction * 100).toFixed(1)}% of frame; budget <20%`,
  );
  assert.ok(
    view.clearFraction >= 0.55,
    `fully-clear ${(view.clearFraction * 100).toFixed(1)}% of frame; budget >=55%`,
  );
  assert.ok(
    view.clearOrGlassFraction >= 0.7,
    `clear+glass ${(view.clearOrGlassFraction * 100).toFixed(1)}% of frame; budget >=70%`,
  );
});

test("first-person mode is reversible: leaving it restores the silhouette", () => {
  const vehicle = { x_m: 0, y_m: 0, z_m: 0, yaw_rad: 0, pitch_rad: 0, roll_rad: 0, main_rotor_rpm: 324 };
  const presence = createAh1gPresence(THREE);
  presence.setFirstPerson(true);
  updateAh1gPresence(presence, vehicle, 0);
  assert.equal(presence.group.visible, false, "first person hides the presence even after update");
  presence.setFirstPerson(false);
  assert.equal(presence.group.visible, true, "exterior mode restores visibility immediately");
  updateAh1gPresence(presence, vehicle, 0);
  assert.equal(presence.group.visible, true);
  presence.dispose();
});
