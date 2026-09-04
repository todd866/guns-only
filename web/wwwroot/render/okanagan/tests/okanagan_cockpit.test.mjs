import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import { createFireBossCockpit } from "../fireboss_cockpit.js";

test("Fire Boss keeps an unobstructed HUD view: no first-person airframe mesh", () => {
  const camera = new THREE.PerspectiveCamera();
  const cockpit = createFireBossCockpit(camera);
  let meshes = 0;
  cockpit.group.traverse((object) => {
    if (object.isMesh) meshes += 1;
  });
  assert.equal(meshes, 0, "yellow nose, floats and glare shield stay out of the pilot view");
  assert.equal(cockpit.group.parent, camera);
});
