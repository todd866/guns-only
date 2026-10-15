import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createPathfinderRelays,
  PATHFINDER_RELAY_POOL_SIZE,
  PATHFINDER_GONDOLA_HALF_EXTENTS_M,
} from "../pathfinder_relays.js";

function state(overrides = {}) {
  return { pathfinder: {
    envelope_radius_m: 10,
    sun_elevation_deg: -1.2,
    relays: [{ id: 7, position: { x: 100, y: 200, z: 300 },
      gondola_position: { x: 100, y: 177, z: 300 }, relay_active: true,
      leak_fraction: 0, lift_loss_fraction: 0, debris: null, ...overrides }],
  } };
}

test("prepares six relay slots and tracks authoritative gondola coordinates", () => {
  const relays = createPathfinderRelays();
  assert.equal(relays.group.children.filter(child => child.name === "PATHFINDER_RELAY_SLOT").length, PATHFINDER_RELAY_POOL_SIZE);
  relays.update(state());
  const absoluteGondola = relays.group.children[0].getObjectByName("PATHFINDER_DARK_GONDOLA");
  // App's aircraft conversion is set(state.px, state.py, -state.pz); origin is render-space.
  assert.deepEqual(absoluteGondola.getWorldPosition(new THREE.Vector3()).toArray(), [100, 177, -300]);
  relays.update(state(), new THREE.Vector3(90, 190, -290));
  const slot = relays.group.children[0];
  assert.equal(slot.userData.relayId, 7);
  assert.deepEqual(slot.position.toArray(), [10, 10, -10]);
  const gondola = slot.getObjectByName("PATHFINDER_DARK_GONDOLA");
  assert.deepEqual(gondola.getWorldPosition(new THREE.Vector3()).toArray(), [10, -13, -10]);
  assert.deepEqual(PATHFINDER_GONDOLA_HALF_EXTENTS_M, { x: 2.8, y: 1.4, z: 2.1 });
  relays.dispose();
});

test("leak exposes conforming wrinkles and deforms the pale envelope without moving gondola", () => {
  const relays = createPathfinderRelays();
  relays.update(state({ leak_fraction: 1, lift_loss_fraction: 0.5 }));
  const slot = relays.group.children[0];
  const envelope = slot.getObjectByName("PATHFINDER_PALE_LEAKING_ENVELOPE");
  const positions = envelope.geometry.attributes.position.array;
  assert.equal(slot.getObjectByName("PATHFINDER_ENVELOPE_WRINKLES").visible, true);
  assert.equal(envelope.scale.x, 1);
  assert.ok(Math.max(...positions) > 10);
  assert.ok(new Set(Array.from(positions).map((value) => value.toFixed(4))).size > 20);
  assert.equal(slot.getObjectByName("PATHFINDER_DARK_GONDOLA").position.y, -23);
  relays.dispose();
});

test("kill hides live gondola and follows authoritative debris, including landed state", () => {
  const relays = createPathfinderRelays();
  relays.update(state({ relay_active: false, debris: { position: { x: 104, y: 9, z: 303 }, landed: true } }), new THREE.Vector3(100, 0, -300));
  const slot = relays.group.children[0];
  assert.equal(slot.getObjectByName("PATHFINDER_DARK_GONDOLA").visible, false);
  const debris = slot.getObjectByName("PATHFINDER_FALLING_GONDOLA_DEBRIS");
  assert.equal(debris.visible, true);
  assert.deepEqual(debris.getWorldPosition(new THREE.Vector3()).toArray(), [4, 9, -3]);
  assert.equal(debris.userData.landed, true);
  relays.dispose();
});

test("null pathfinder hides all prepared slots", () => {
  const relays = createPathfinderRelays();
  relays.update(state());
  relays.update({ pathfinder: null });
  assert.equal(relays.group.visible, false);
  assert.equal(relays.group.children.filter(child => child.name === "PATHFINDER_RELAY_SLOT").every((slot) => !slot.visible), true);
  relays.dispose();
});

test("one preallocated glint draw follows drift, sunlight and origin without changing hit geometry", () => {
  const relays = createPathfinderRelays();
  const input = state({ position: { x: 74080, y: 20600, z: 30 } });
  relays.update(input, new THREE.Vector3(10, 0, -20));
  const glints = relays.group.getObjectByName("PATHFINDER_SUNLIT_GLINTS");
  assert.equal(glints.geometry.attributes.position.count, 6);
  assert.equal(glints.geometry.attributes.position.getX(0), 74070);
  assert.equal(glints.geometry.attributes.position.getZ(0), -10);
  assert.equal(glints.geometry.attributes.sunlit.getX(0), 1);
  assert.equal(glints.geometry.attributes.sunlit.getX(1), 0);
  assert.equal(glints.material.depthTest, true);
  assert.equal(glints.material.depthWrite, false);
  // The main renderer uses logarithmic depth. Ordinary clip-space depth would put the
  // distant locator behind nearer sky/terrain depths despite depthTest being enabled.
  assert.match(glints.material.vertexShader, /#include <logdepthbuf_vertex>/);
  assert.match(glints.material.fragmentShader, /#include <logdepthbuf_fragment>/);
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, .1, 100000);
  glints.onBeforeRender({ getSize: size => size.set(1280, 720), getPixelRatio: () => 2 }, null, camera);
  assert.equal(glints.material.uniforms.pixelRatio.value, 2);
  assert.ok(glints.material.uniforms.focalPx.value > 500);
  input.pathfinder.sun_elevation_deg = -10;
  relays.update(input);
  assert.equal(glints.geometry.attributes.sunlit.getX(0), 0);
  relays.dispose();
});

test("pooled slot resets leak wrinkles and debris when reused", () => {
  const relays = createPathfinderRelays();
  relays.update(state({ leak_fraction: 1, lift_loss_fraction: 1,
    relay_active: false, debris: { position: { x: 101, y: 8, z: 301 }, landed: true } }));
  relays.update(state());
  const slot = relays.group.children[0];
  assert.equal(slot.getObjectByName("PATHFINDER_ENVELOPE_WRINKLES").visible, false);
  assert.equal(slot.getObjectByName("PATHFINDER_DARK_GONDOLA").visible, true);
  assert.equal(slot.getObjectByName("PATHFINDER_FALLING_GONDOLA_DEBRIS").visible, false);
  assert.equal(slot.getObjectByName("PATHFINDER_ENVELOPE_TO_GONDOLA_SUSPENSION").visible, true);
  relays.dispose();
});
