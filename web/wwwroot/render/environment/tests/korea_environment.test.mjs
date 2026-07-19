import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createKoreaEnvironment, loadKoreaEnvironment } from "../korea_environment.js";

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
  assert.match(desktop.ocean.material.vertexShader, /logdepthbuf_vertex/);
  assert.match(desktop.ocean.material.fragmentShader, /logdepthbuf_fragment/);
  assert.match(desktop.ocean.material.vertexShader,
    /worldPoint = \(modelMatrix \* vec4\(position, 1\.0\)\)\.xz/,
    "camera recentering must not drag the wave phase through world space");
  mobile.dispose();
  desktop.dispose();
  assert.equal(desktop.group.parent, null);
});

test("a partial texture-load failure releases every fulfilled texture", async () => {
  const loaded = [];
  const textureLoader = {
    loadAsync: async () => {
      const index = loaded.length;
      const candidate = { disposed: false, dispose() { this.disposed = true; } };
      loaded.push(candidate);
      if (index === 2) throw new Error("cloud texture failed");
      return candidate;
    },
  };
  const fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("atmosphere") ? atmosphereConfig : oceanConfig,
  });
  await assert.rejects(loadKoreaEnvironment(THREE, {
    oceanUrl: "https://game.test/ocean.json",
    atmosphereUrl: "https://game.test/atmosphere.json",
    textureLoader,
    fetch,
  }), /cloud texture failed/);
  assert.equal(loaded[0].disposed, true);
  assert.equal(loaded[1].disposed, true);
});
