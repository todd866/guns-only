import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createKoreaEffectsFactory,
  createKoreaEnvironmentFactory,
  packResourceUrl,
} from "../korea_pack_adapters.js";

test("pack resource URLs are versioned beside the selected visual profile", () => {
  assert.equal(
    packResourceUrl(
      "effects/guns.effects.json",
      "https://game.test/content/packs/korea-1950s/visual-profile.json?old=1",
      "0.2.2",
    ),
    "https://game.test/content/packs/korea-1950s/effects/guns.effects.json?packVersion=0.2.2",
  );
});

test("environment adapter attaches, consumes presentation frame inputs, and disposes once", async () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(4, 5, 6);
  const calls = [];
  const group = new THREE.Group();
  const factory = createKoreaEnvironmentFactory(THREE, {
    profileUrl: "https://game.test/content/packs/korea-1950s/visual-profile.json",
    packVersion: "0.2.2",
    sunDirection: new THREE.Vector3(1, 2, 3),
    loadEnvironment: async (_three, options) => {
      calls.push(["load", options]);
      return {
        group,
        clouds: [{}, {}],
        update: (frame) => calls.push(["update", frame]),
        dispose: () => { calls.push(["dispose"]); group.removeFromParent(); },
      };
    },
    onActivated: () => calls.push(["active"]),
    onDeactivated: () => calls.push(["inactive"]),
  });
  const context = {
    scene,
    camera,
    profileUrl: "unused",
    qualityTier: { id: "desktop", settings: { anisotropy: 8 } },
    renderer: { capabilities: { getMaxAnisotropy: () => 4 } },
    config: {
      environment: {
        fog: { color: "#ABCDEF", nearMetres: 1234, farMetres: 56789 },
      },
    },
  };
  const adapter = await factory(context);
  assert.equal(group.parent, scene);
  adapter.update({ elapsedSeconds: 12.5 }, context);
  assert.equal(calls[0][1].qualityTier, "desktop");
  assert.equal(calls[0][1].anisotropy, 4);
  assert.match(calls[0][1].oceanUrl, /ocean\.material\.json\?packVersion=0\.2\.2$/);
  assert.deepEqual(
    [calls[0][1].fogColor, calls[0][1].fogNear, calls[0][1].fogFar],
    ["#ABCDEF", 1234, 56789],
  );
  assert.deepEqual(calls.find((call) => call[0] === "update")[1].cameraPosition, camera.position);
  assert.equal(adapter.diagnostics().cloudLayers, 2);
  adapter.dispose();
  adapter.dispose();
  assert.equal(calls.filter((call) => call[0] === "dispose").length, 1);
  assert.equal(calls.filter((call) => call[0] === "inactive").length, 1);
});

test("effects adapter dispatches only declared bindings and owns its scene lifecycle", async () => {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const calls = [];
  const factory = createKoreaEffectsFactory(THREE, {
    profileUrl: "https://game.test/content/packs/korea-1950s/visual-profile.json",
    packVersion: "0.2.2",
    loadEffects: async (_three, options) => {
      calls.push(["load", options.profileUrl, options.qualityTier]);
      return {
        group,
        profile: { events: { "event.weapon.gun-fire.v1": {} } },
        items: [],
        emit: (...args) => calls.push(["emit", ...args]),
        update: (delta) => calls.push(["update", delta]),
        clear: () => calls.push(["clear"]),
        dispose: () => { calls.push(["dispose"]); group.removeFromParent(); },
      };
    },
  });
  const context = {
    scene,
    camera: new THREE.PerspectiveCamera(),
    profileUrl: "unused",
    qualityTier: { id: "mobile", settings: {} },
  };
  const adapter = await factory(context);
  assert.equal(group.parent, scene);
  assert.equal(adapter.handleEvent({
    eventId: "event.weapon.gun-fire.v1", payload: { tracer: false },
  }), true);
  assert.equal(adapter.handleEvent({ eventId: "event.unknown.v1", payload: {} }), false);
  adapter.update({ deltaSeconds: 0.02 });
  assert.deepEqual(calls.find((call) => call[0] === "update"), ["update", 0.02]);
  adapter.clear();
  assert.deepEqual(calls.find((call) => call[0] === "clear"), ["clear"]);
  adapter.dispose();
  assert.equal(group.parent, null);
});
