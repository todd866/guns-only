import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createF22CanopyGlass,
  isF22CanopyGlassAirframe,
  updateF22CanopyGlass,
} from "../f22_canopy_glass.js";

test("F-22 canopy glass admits only the public-data surrogate", () => {
  assert.equal(isF22CanopyGlassAirframe({
    player_aircraft_id: "aircraft.f22a.public-data-surrogate",
  }), true);
  assert.equal(isF22CanopyGlassAirframe({
    player_aircraft_id: "aircraft.rapier.public-data-surrogate",
  }), false);
  assert.equal(isF22CanopyGlassAirframe({}), false);
});

test("F-22 canopy glass exposes a shell, centreline etch, and pilot reflection", () => {
  const glass = createF22CanopyGlass(THREE);
  const names = [];
  glass.group.traverse((object) => names.push(object.name));

  assert.ok(names.includes("F22_CANOPY_GLASS_SHELL"));
  assert.ok(names.includes("F22_CANOPY_MID_AXIS_DARK"));
  assert.ok(names.includes("F22_CANOPY_MID_AXIS_LIGHT"));
  assert.ok(names.includes("F22_CANOPY_PILOT_REFLECTION"));
  const reflection = glass.group.getObjectByName("F22_CANOPY_PILOT_REFLECTION");
  assert.equal(reflection.material.side, THREE.DoubleSide);
  assert.equal(reflection.material.depthWrite, false);
  assert.ok(reflection.material.opacity >= 0.08 && reflection.material.opacity <= 0.15);
});

test("F-22 canopy glass follows the eye and body while reflection follows look azimuth", () => {
  const glass = createF22CanopyGlass(THREE);
  const position = new THREE.Vector3(12, 34, 56);
  const bodyQuaternion = new THREE.Quaternion();
  const forwardLook = new THREE.Quaternion();

  updateF22CanopyGlass(glass, {
    position,
    quaternion: bodyQuaternion,
    lookQuaternion: forwardLook,
    visible: true,
  });
  const reflection = glass.group.getObjectByName("F22_CANOPY_PILOT_REFLECTION");
  const forwardReflectionX = reflection.position.x;
  assert.deepEqual(glass.group.position.toArray(), position.toArray());
  assert.equal(glass.group.visible, true);

  updateF22CanopyGlass(glass, {
    position,
    quaternion: bodyQuaternion,
    lookQuaternion: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    ),
    visible: false,
  });
  assert.notEqual(reflection.position.x, forwardReflectionX);
  assert.equal(glass.group.visible, false);
});
