import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "../../../vendor/three.module.js";
import {
  R1_FIRST_PERSON_CONTRACT,
  R1_FIRST_PERSON_REQUIRED_PARTS,
  R1_FIRST_PERSON_SCHEMA,
  createR1FirstPersonRig,
} from "../r1_first_person.js";

const srgbChannelToLinear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
};

test("exported R1 contract is deeply frozen, renderer-neutral and colour-explicit", () => {
  const contract = R1_FIRST_PERSON_CONTRACT;
  assert.equal(contract.schema, R1_FIRST_PERSON_SCHEMA);
  assert.equal(contract.coordinateSystem.origin, "helmet-camera");
  assert.equal(contract.coordinateSystem.forward, "-z");
  assert.equal(contract.coordinateSystem.units, "metres");
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.parts), true);

  const allowedPrimitives = new Set(["box", "cylinder", "ellipsoid", "line-segments", "panel", "plane"]);
  const names = new Set();
  for (const part of contract.parts) {
    assert.equal(Object.isFrozen(part), true, `${part.name} is mutable`);
    assert.equal(Object.isFrozen(part.positionM), true, `${part.name} position is mutable`);
    assert.equal(Object.isFrozen(part.rotationRad), true, `${part.name} rotation is mutable`);
    assert.ok(!names.has(part.name), `duplicate contract part ${part.name}`);
    names.add(part.name);
    assert.ok(allowedPrimitives.has(part.primitive), `${part.name} uses renderer-specific geometry`);
    assert.equal(part.positionM.length, 3, `${part.name} lacks a metre position`);
    assert.equal(part.rotationRad.length, 3, `${part.name} lacks an XYZ radian rotation`);
    assert.ok(contract.materials[part.material], `${part.name} references unknown material`);
    if (["box", "ellipsoid", "plane"].includes(part.primitive)) {
      assert.ok(part.dimensionsM.every((value) => value > 0), `${part.name} lacks positive dimensions`);
    }
    if (part.primitive === "cylinder") {
      assert.ok(part.radiusM > 0 && part.lengthM > 0);
    }
    if (part.primitive === "panel") {
      assert.ok(part.verticesM.length >= 4 && part.triangles.length >= 2);
    }
  }
  assert.deepEqual(R1_FIRST_PERSON_REQUIRED_PARTS, contract.requiredAnchors);
  for (const required of contract.requiredAnchors) assert.ok(names.has(required));

  for (const [name, color] of Object.entries(contract.colors)) {
    assert.equal(Object.isFrozen(color), true, `${name} colour is mutable`);
    assert.equal(Object.isFrozen(color.srgb), true, `${name} sRGB semantics are mutable`);
    assert.equal(Object.isFrozen(color.srgb.rgb8), true, `${name} sRGB channels are mutable`);
    assert.equal(Object.isFrozen(color.linearRgb), true, `${name} linear channels are mutable`);
    assert.match(color.srgb.hex, /^#[0-9a-f]{6}$/i, `${name} lacks an sRGB hex value`);
    assert.equal(color.srgb.rgb8.length, 3);
    assert.equal(color.linearRgb.length, 3);
    color.srgb.rgb8.forEach((channel, index) => {
      assert.ok(
        Math.abs(srgbChannelToLinear(channel) - color.linearRgb[index]) < 1e-7,
        `${name} channel ${index} linear value does not match its sRGB source`,
      );
    });
  }

  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /THREE|MeshStandardMaterial|BufferGeometry/);
});

test("R1 helmet view carries the complete deterministic near-field silhouette", () => {
  const rig = createR1FirstPersonRig(THREE);
  const root = rig.object3d;

  assert.equal(root.name, "r1-first-person");
  assert.equal(root.userData.schema, R1_FIRST_PERSON_SCHEMA);
  assert.equal(root.userData.cameraLocal, true);
  assert.deepEqual(root.position.toArray(), [0, 0, 0]);

  const names = new Set();
  root.traverse((object) => names.add(object.name));
  for (const required of R1_FIRST_PERSON_REQUIRED_PARTS) {
    assert.ok(names.has(required), `missing first-person anchor ${required}`);
  }

  const windscreen = root.getObjectByName("r1-windscreen");
  assert.equal(windscreen.material.transparent, true);
  assert.equal(windscreen.material.depthWrite, false);
  assert.ok(windscreen.material.opacity > 0 && windscreen.material.opacity < 0.2);

  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(bounds.min.x <= -0.9 && bounds.max.x >= 0.9, "fairing shoulders must frame both lower corners");
  assert.ok(bounds.max.y < 0, "the bike silhouette must stay below the sightline");
  assert.ok(bounds.max.z <= -0.25, "all camera-local geometry must clear the near plane");
  assert.ok(bounds.min.z >= -1.5, "near-field anchors must not become a distant chase model");

  rig.dispose();
});

test("dash shift lights follow authoritative RPM without random animation", () => {
  const rig = createR1FirstPersonRig(THREE);
  const lights = Array.from({ length: 7 }, (_, index) =>
    rig.object3d.getObjectByName(`r1-tach-light-${index}`));
  assert.ok(lights.every(Boolean));

  rig.update({ rpm: 2_000 });
  assert.deepEqual(lights.map((light) => light.material.emissiveIntensity), Array(7).fill(0.06));

  rig.update({ rpm: 14_500 });
  assert.deepEqual(lights.map((light) => light.material.emissiveIntensity), Array(7).fill(1.65));

  rig.update({ rpm: Number.NaN });
  assert.deepEqual(lights.map((light) => light.material.emissiveIntensity), Array(7).fill(0.06));
  rig.dispose();
});
