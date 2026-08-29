import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createParkedCobra, placeParkedCobra } from "../cobra_parked_airframe.js";

test("parked Cobra separates its glazed canopy and off-axis rotor from the fuselage", () => {
  const parked = createParkedCobra(THREE);
  const canopy = parked.group.getObjectByName("AH1G_PARKED_CANOPY");
  const rotor = parked.group.getObjectByName("AH1G_PARKED_MAIN_ROTOR");

  assert.ok(canopy);
  assert.equal(canopy.material.color.getHex(), 0x264b55,
    "the canopy must read as glazing instead of another olive fuselage block");
  assert.ok(rotor);
  assert.ok(Math.abs(rotor.rotation.y - Math.PI / 4) < 1e-9,
    "the main rotor must break the fore-aft fuselage silhouette from the final approach");
  assert.equal(rotor.geometry.parameters.depth, 13.4);
});

test("placing a parked Cobra preserves authority-owned slot pose", () => {
  const parked = createParkedCobra(THREE);
  placeParkedCobra(parked, {
    east_m: -3_720,
    up_m: 210,
    north_m: -4_560,
    yaw_rad: 1.2,
  }, -0.08);

  assert.deepEqual(parked.group.position.toArray(), [-3_720, 209.685, 4_560]);
  assert.ok(Math.abs(parked.group.rotation.y - 1.2) < 1e-9);
  assert.ok(Math.abs(parked.group.rotation.z + 0.08) < 1e-9);
});
