import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  AH1G_PRESENCE_SCHEMA,
  REAR_SEAT_EYE_LOCAL_M,
  createAh1gPresence,
  eyeWorldFromVehicle,
  updateAh1gPresence,
} from "../ah1g_presence.js";

function byName(root, name) {
  let found = null;
  root.traverse((object) => {
    if (object.name === name) found = object;
  });
  return found;
}

test("AH-1G presence exposes canopy frame, rotor disc, nose and turret cues", () => {
  const presence = createAh1gPresence(THREE);
  assert.equal(presence.schema, AH1G_PRESENCE_SCHEMA);
  assert.equal(presence.group.name, "AH1G_PRESENCE");
  assert.ok(byName(presence.group, "AH1G_CANOPY_FRAME"));
  assert.ok(byName(presence.group, "AH1G_CANOPY_GLASS"));
  // Build 261 black-cockpit fix: solid rails/spine became sills, pillars and a
  // split bow so the rear-seat eye keeps a sight picture.
  assert.ok(byName(presence.group, "AH1G_CANOPY_SILL_L"));
  assert.ok(byName(presence.group, "AH1G_CANOPY_SILL_R"));
  assert.ok(byName(presence.group, "AH1G_CANOPY_PILLAR_L"));
  assert.ok(byName(presence.group, "AH1G_CANOPY_PILLAR_R"));
  assert.ok(byName(presence.group, "AH1G_CANOPY_BOW_L"));
  assert.ok(byName(presence.group, "AH1G_CANOPY_BOW_R"));
  assert.ok(byName(presence.group, "AH1G_INSTRUMENT_BROW_L"));
  assert.ok(byName(presence.group, "AH1G_INSTRUMENT_BROW_R"));
  assert.ok(byName(presence.group, "AH1G_CYCLIC"));
  assert.ok(byName(presence.group, "AH1G_COLLECTIVE"));
  assert.ok(byName(presence.group, "AH1G_ROTOR_DISC"));
  assert.ok(byName(presence.group, "AH1G_NOSE"));
  assert.ok(byName(presence.group, "AH1G_CHIN_TURRET"));
  assert.deepEqual(presence.eyeLocalM, REAR_SEAT_EYE_LOCAL_M);
  presence.dispose();
});

test("rear-seat eye sits above and aft of the vehicle origin in body axes", () => {
  assert.equal(REAR_SEAT_EYE_LOCAL_M.x, 0);
  assert.ok(REAR_SEAT_EYE_LOCAL_M.y > 0.6);
  assert.ok(REAR_SEAT_EYE_LOCAL_M.z > 0.4, "aft of CG when -Z is aircraft forward");
});

test("presence follows authority pose and spins the rotor with Nr", () => {
  const presence = createAh1gPresence(THREE);
  const rotor = byName(presence.group, "AH1G_ROTOR_DISC");
  const before = rotor.rotation.y;

  updateAh1gPresence(presence, {
    x_m: 100,
    y_m: 50,
    z_m: -20,
    yaw_rad: Math.PI / 2,
    pitch_rad: 0.1,
    roll_rad: -0.05,
    main_rotor_rpm: 324,
  }, 0.1);

  assert.ok(Math.abs(presence.group.position.x - 100) < 1e-9);
  assert.ok(Math.abs(presence.group.position.y - 50) < 1e-9);
  assert.ok(Math.abs(presence.group.position.z - 20) < 1e-9);
  assert.ok(rotor.rotation.y !== before);
  assert.ok(Math.abs(rotor.rotation.y - before - (324 * Math.PI * 2 / 60) * 0.1) < 1e-6);

  const eye = eyeWorldFromVehicle(THREE, {
    x_m: 100,
    y_m: 50,
    z_m: -20,
    yaw_rad: 0,
    pitch_rad: 0,
    roll_rad: 0,
  });
  assert.ok(Math.abs(eye.x - 100) < 1e-6);
  assert.ok(Math.abs(eye.y - (50 + REAR_SEAT_EYE_LOCAL_M.y)) < 1e-6);
  assert.ok(Math.abs(eye.z - (20 + REAR_SEAT_EYE_LOCAL_M.z)) < 1e-6);
  presence.dispose();
});

test("Hold the Bridge consumes presence and drops the naked ghost camera offset", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  assert.match(main, /ah1g_presence\.js/);
  assert.match(main, /createAh1gPresence/);
  assert.match(main, /updateAh1gPresence|eyeWorldFromVehicle/);
  assert.doesNotMatch(main, /vehicle\.y_m \+ 2\.4/);
});
