import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  createOkanaganTrafficCraft,
  poseOkanaganTrafficCraft,
} from "../okanagan_traffic.js";

test("helicopter traffic carries a rotor disc an air-attack ship does not", () => {
  const helicopter = createOkanaganTrafficCraft("HELICOPTER");
  const birdDog = createOkanaganTrafficCraft("AIR ATTACK");
  assert.ok(helicopter.userData.rotor);
  assert.equal(birdDog.userData.rotor, undefined);
  poseOkanaganTrafficCraft(helicopter, {
    position: { x: 1, y: 2, z: 3 },
    heading_rad: 0.4,
  }, 1.5);
  assert.equal(helicopter.position.x, 1);
  assert.equal(helicopter.position.y, 2);
  assert.equal(helicopter.position.z, 3);
  assert.ok(helicopter.userData.rotor.rotation.z !== 0);
});
