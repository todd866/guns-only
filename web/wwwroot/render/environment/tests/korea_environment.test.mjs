import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createKoreaEnvironment } from "../korea_environment.js";

const packRoot = new URL("../../../../../content/packs/korea-1950s/", import.meta.url);
const oceanConfig = JSON.parse(await readFile(new URL("environment/ocean.material.json", packRoot), "utf8"));
const atmosphereConfig = JSON.parse(await readFile(new URL("environment/atmosphere.material.json", packRoot), "utf8"));

function texture() {
  const value = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  value.needsUpdate = true;
  return value;
}

function make(tier) {
  return createKoreaEnvironment(THREE, {
    qualityTier: tier,
    oceanConfig,
    atmosphereConfig,
    normalMap: texture(),
    foamMap: texture(),
    cloudShape: texture(),
  });
}

test("builds quality-tier ocean and cloud geometry and follows the camera horizontally", () => {
  const mobile = make("mobile");
  const desktop = make("desktop");
  assert.equal(mobile.clouds.length, 1);
  assert.equal(desktop.clouds.length, 2);
  assert.ok(desktop.ocean.geometry.attributes.position.count > mobile.ocean.geometry.attributes.position.count);
  desktop.update({
    timeSeconds: 12.5,
    cameraPosition: new THREE.Vector3(240, 1800, -930),
    sunDirection: new THREE.Vector3(1, 1, -1),
  });
  assert.equal(desktop.group.position.x, 240);
  assert.equal(desktop.group.position.y, 0);
  assert.equal(desktop.group.position.z, -930);
  assert.equal(desktop.ocean.material.uniforms.uTime.value, 12.5);
  mobile.dispose();
  desktop.dispose();
  assert.equal(desktop.group.parent, null);
});
