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

test("canopy pillars plant into the consoles instead of floating in mid-air", () => {
  const presence = createAh1gPresence(THREE);
  for (const side of ["L", "R"]) {
    const pillar = byName(presence.group, `AH1G_CANOPY_PILLAR_${side}`);
    const console_ = byName(presence.group, `AH1G_INSTRUMENT_BROW_${side}`);
    const p = pillar.geometry.parameters;
    const c = console_.geometry.parameters;
    const pillarBottom = pillar.position.y - p.height / 2;
    const consoleTop = console_.position.y + c.height / 2;
    assert.ok(
      pillarBottom < consoleTop,
      `${side} pillar bottom ${pillarBottom} must drop below console top ${consoleTop}`,
    );
    const consoleOuterX = Math.abs(console_.position.x) + c.width / 2;
    assert.ok(
      consoleOuterX >= Math.abs(pillar.position.x),
      `${side} console must reach outboard to the pillar plane`,
    );
    const consoleFrontZ = console_.position.z - c.depth / 2;
    const pillarFrontZ = pillar.position.z - p.depth / 2;
    assert.ok(
      consoleFrontZ <= pillarFrontZ + p.depth,
      `${side} console must reach forward under the pillar foot`,
    );
  }
  presence.dispose();
});

test("interior-facing surfaces are painted tones, not near-black construction paper", () => {
  const presence = createAh1gPresence(THREE);
  const interiorNames = [
    "AH1G_CANOPY_SILL_L", "AH1G_CANOPY_SILL_R",
    "AH1G_CANOPY_PILLAR_L", "AH1G_CANOPY_PILLAR_R",
    "AH1G_CANOPY_BOW_L", "AH1G_CANOPY_BOW_R",
    "AH1G_INSTRUMENT_BROW_L", "AH1G_INSTRUMENT_BROW_R",
    "AH1G_NOSE",
  ];
  for (const name of interiorNames) {
    const mesh = byName(presence.group, name);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      // Emissive floor: even a fully-shadowed face renders above the
      // near-black band. Compare in sRGB (getHexString) because setHex stores
      // linear components under color management. The Build 261 construction
      // paper had emissive maxima of 5-10; the painted family sits >= 22.
      const hex = parseInt(material.emissive.getHexString(), 16);
      const emissiveMax = Math.max((hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff);
      assert.ok(
        emissiveMax >= 20,
        `${name} material emissive floor too dark: ${material.emissive.getHexString()}`,
      );
    }
  }
  // One value step: console top face lighter than console sides (BoxGeometry
  // material order [+x,-x,+y,-y,+z,-z]).
  const brow = byName(presence.group, "AH1G_INSTRUMENT_BROW_L");
  const side = brow.material[0];
  const top = brow.material[2];
  assert.ok(
    top.color.r + top.color.g + top.color.b > side.color.r + side.color.g + side.color.b,
    "console top face must be one value step lighter than sides",
  );
  // Same treatment on the nose: lighter top deck than flanks.
  const nose = byName(presence.group, "AH1G_NOSE");
  assert.ok(Array.isArray(nose.material), "nose carries per-face materials");
  const noseTop = nose.material[2];
  const noseSide = nose.material[0];
  assert.ok(
    noseTop.color.r + noseTop.color.g + noseTop.color.b
      > noseSide.color.r + noseSide.color.g + noseSide.color.b,
    "nose top deck must be lighter than its flanks",
  );
  presence.dispose();
});

test("canopy glass shell has no polar cap fragment near the forward wedge", () => {
  const presence = createAh1gPresence(THREE);
  const glass = byName(presence.group, "AH1G_CANOPY_GLASS");
  const params = glass.geometry.parameters;
  // With thetaStart 0 the cap triangles beside the forward gap hover almost
  // dead ahead of the interior eye and read as a floating pale shard once the
  // gunner-target look bias swings the camera off the body axis.
  assert.ok(params.thetaStart >= Math.PI * 0.15, "glass shell must trim the polar cap");
  // Forward wedge (the phi gap) stays open at least the Build 261 fix's 170 deg.
  const gapRad = Math.PI * 2 - params.phiLength;
  assert.ok(gapRad >= Math.PI * (170 / 180) - 1e-9, "forward wedge must stay open >= 170 deg");
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
