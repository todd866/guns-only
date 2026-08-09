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
  assert.equal(reflection.material.isShaderMaterial, true);
  assert.equal(reflection.material.name, "F22CanopyPilotReflectionMaterial");
  assert.equal(reflection.material.transparent, true);
  assert.equal(reflection.material.side, THREE.DoubleSide);
  assert.equal(reflection.material.depthTest, true);
  assert.equal(reflection.material.depthWrite, false);
  assert.equal(reflection.material.blending, THREE.AdditiveBlending);
  assert.equal(reflection.material.toneMapped, false);
  assert.ok(reflection.material.opacity >= 0.08 && reflection.material.opacity <= 0.15);
  assert.equal(reflection.material.uniforms.uOpacity.value, reflection.material.opacity);
  assert.match(reflection.material.fragmentShader, /softEllipse/);
  assert.match(reflection.material.fragmentShader, /smoothstep/);
  assert.match(reflection.material.fragmentShader, /if \(alpha < 0\.002\) discard/);
});

test("F-22 canopy detail is authored in the camera's forward -Z hemisphere", () => {
  const glass = createF22CanopyGlass(THREE);
  const camera = new THREE.PerspectiveCamera(66, 1.6, 0.06, 680_000);
  updateF22CanopyGlass(glass, {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    lookQuaternion: new THREE.Quaternion(),
    visible: true,
  });
  glass.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const reflection = glass.group.getObjectByName("F22_CANOPY_PILOT_REFLECTION");
  const reflectionWorld = reflection.getWorldPosition(new THREE.Vector3());
  const projected = reflectionWorld.clone().project(camera);
  assert.ok(reflectionWorld.z < -camera.near, "reflection must be in front of the eye");
  assert.ok(projected.z > -1 && projected.z < 1, "reflection must lie inside the clip volume");

  for (const name of ["F22_CANOPY_MID_AXIS_DARK", "F22_CANOPY_MID_AXIS_LIGHT"]) {
    const axis = glass.group.getObjectByName(name);
    const positions = axis.geometry.getAttribute("position");
    assert.equal(positions.count, 2);
    assert.ok(positions.getZ(0) < 0);
    assert.ok(positions.getZ(1) < 0);
  }
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
