import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  createAh1gPresence,
  eyeWorldFromVehicle,
  updateAh1gPresence,
} from "../ah1g_presence.js";

/**
 * Regression pin for the Build 261 black-cockpit defect: the rear-seat eye was
 * entombed in exterior-authored geometry (61.5% of the frame opaque-blocked,
 * 1.9% clear). Raycasts the forward frame exactly as cobra-lab/main.js
 * syncAuthorityCamera frames it (fov 58, near 0.12, +0.08 pitch bias) and pins
 * the occlusion budget. Translucent hits (canopy glass, rotor wash) count as
 * tint, not blockage; the bottom quarter of the center column may show the
 * nose/dash — that is cockpit feel, not entombment.
 */
const GRID_WIDTH = 96;
const GRID_HEIGHT = 54;

function measureForwardOcclusion() {
  const vehicle = { x_m: 0, y_m: 0, z_m: 0, yaw_rad: 0, pitch_rad: 0, roll_rad: 0, main_rotor_rpm: 324 };

  const presence = createAh1gPresence(THREE);
  const scene = new THREE.Scene();
  scene.add(presence.group);
  updateAh1gPresence(presence, vehicle, 0);
  scene.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(58, 1440 / 900, 0.12, 32000);
  camera.rotation.order = "YXZ";
  eyeWorldFromVehicle(THREE, vehicle, camera.position);
  const lookPitch = 0.08;
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

let cachedView = null;
function forwardView() {
  cachedView ??= measureForwardOcclusion();
  return cachedView;
}

test("rear-seat forward frame is not entombed in exterior geometry", () => {
  const view = forwardView();
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

test("crosshair center column is clear well below the aim point", () => {
  const view = forwardView();
  // Crosshair sits at 50% frame height; opaque hull (nose/dash under the
  // depressed sightline) may only intrude below 72% height.
  const minimumClearRows = Math.floor(GRID_HEIGHT * 0.72);
  assert.ok(
    view.centerColumnFirstOpaqueRow >= minimumClearRows,
    `center column hits opaque geometry at row ${view.centerColumnFirstOpaqueRow}/${GRID_HEIGHT}; `
      + `must stay clear through row ${minimumClearRows}`,
  );
});
