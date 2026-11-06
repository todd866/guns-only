import test from "node:test";
import assert from "node:assert/strict";
import {
  AIM, DOOR, createGunner, doorArcError, gunnerDirection, headingArrowAngle,
  lobArc, pickLock, readGunnerPad, stepGunnerAim,
} from "../gunner.mjs";

test("aim stays inside the door arc however hard the stick pushes", () => {
  const g = createGunner();
  for (let i = 0; i < 400; i += 1) stepGunnerAim(g, {x: 1, y: 1}, 0.016);
  assert.equal(g.yaw, DOOR.yawCenter + DOOR.yawHalf);
  assert.equal(g.pitch, DOOR.pitchMax);
  for (let i = 0; i < 400; i += 1) stepGunnerAim(g, {x: -1, y: -1}, 0.016);
  assert.equal(g.yaw, DOOR.yawCenter - DOOR.yawHalf);
  assert.equal(g.pitch, DOOR.pitchMin);
});

test("aim accelerates gently: first frame moves less than a late frame", () => {
  const g = createGunner();
  const y0 = g.yaw;
  stepGunnerAim(g, {x: 1, y: 0}, 0.016);
  const first = g.yaw - y0;
  for (let i = 0; i < 30; i += 1) stepGunnerAim(g, {x: 1, y: 0}, 0.016);
  const yBefore = g.yaw;
  stepGunnerAim(g, {x: 1, y: 0}, 0.016);
  const later = g.yaw - yBefore;
  assert.ok(first < later, `first ${first} should be smaller than later ${later}`);
});

test("zoom slows the swing", () => {
  const a = createGunner();
  const b = createGunner();
  stepGunnerAim(a, {x: 1, y: 0}, 0.05, false);
  stepGunnerAim(b, {x: 1, y: 0}, 0.05, true);
  assert.ok(Math.abs(b.vyaw) < Math.abs(a.vyaw));
  assert.equal(b.zoom, true);
  assert.ok(AIM.zoomFov < 1);
});

test("soft lock picks the toy nearest the reticle, not the nearest in space", () => {
  const origin = {x: 0, y: 5, z: 0};
  const dir = {x: 0, y: 0, z: 1}; // looking +z
  const onAxisFar = {id: "far", x: 0, y: 5, z: 40, state: "alive"};
  const offAxisNear = {id: "near", x: 6, y: 5, z: 10, state: "alive"};
  const {target} = pickLock(origin, dir, [onAxisFar, offAxisNear]);
  assert.equal(target.id, "far");
});

test("soft lock ignores popped toys and blends the aim toward the target", () => {
  const origin = {x: 0, y: 5, z: 0};
  const dir = {x: 0, y: 0, z: 1};
  const popped = {id: "p", x: 0, y: 5, z: 20, state: "popped"};
  const live = {id: "l", x: 2, y: 5, z: 20, state: "alive"};
  const {target, aim} = pickLock(origin, dir, [popped, live]);
  assert.equal(target.id, "l");
  assert.ok(aim.x > 0, "aim snapped toward the live toy");
  assert.ok(Math.abs(Math.hypot(aim.x, aim.y, aim.z) - 1) < 1e-9);
});

test("no lock outside the cone leaves the aim unchanged", () => {
  const dir = {x: 0, y: 0, z: 1};
  const behind = {id: "b", x: 0, y: 5, z: -20, state: "alive"};
  const {target, aim} = pickLock({x: 0, y: 5, z: 0}, dir, [behind]);
  assert.equal(target, null);
  assert.deepEqual(aim, dir);
});

test("lob arc falls and ends at the ground", () => {
  const pts = lobArc({x: 0, y: 6, z: 0}, {x: 0, y: 0.3, z: 0.95}, 16);
  assert.ok(pts.length > 3);
  const last = pts[pts.length - 1];
  assert.equal(last.y, 0);
  assert.ok(last.z > 4, "balloon travelled forward");
});

test("gunner direction follows the chopper heading", () => {
  const g = createGunner(); // door arc centre = starboard
  const north = gunnerDirection(0, g);
  const east = gunnerDirection(Math.PI / 2, g);
  assert.ok(north.x > 0.7, "heading north, the door looks east");
  assert.ok(east.z < -0.7, "heading east, the door looks south");
});

test("door arc error is zero inside the arc and signed outside", () => {
  const ahead = {x: Math.sin(DOOR.yawCenter), y: 0, z: Math.cos(DOOR.yawCenter)};
  assert.equal(doorArcError(0, ahead), 0);
  const nose = {x: 0, y: 0, z: 1}; // dead ahead is outside a starboard door arc
  assert.ok(doorArcError(0, nose) < 0);
});

test("heading arrow points back toward the nose", () => {
  const g = createGunner();
  assert.ok(headingArrowAngle(g) < 0, "nose is to the gunner's left from the starboard door");
});

test("gunner pad: A darts, B lobs, RB zooms, SNES letters respected", () => {
  const buttons = Array.from({length: 16}, () => ({pressed: false, value: 0}));
  const pad = {connected: true, index: 1, id: "Xbox 360", mapping: "standard", axes: [0.9, -0.9], buttons};
  buttons[0] = {pressed: true, value: 1}; // Xbox A = index 0
  buttons[5] = {pressed: true, value: 1}; // RB
  const read = readGunnerPad(pad, {});
  assert.equal(read.dartDown, true);
  assert.equal(read.dartEdge, true);
  assert.equal(read.zoom, true);
  assert.ok(read.x > 0.5 && read.y > 0.5, "stick up-right aims up-right");
  const again = readGunnerPad(pad, read);
  assert.equal(again.dartEdge, false, "edge lasts one frame");
  const snes = {connected: true, index: 2, id: "8Bitdo SN30 Pro", mapping: "standard", axes: [0, 0],
    buttons: buttons.map((b, i) => (i === 1 ? {pressed: true, value: 1} : {pressed: false, value: 0}))};
  assert.equal(readGunnerPad(snes, {}).dartDown, true, "printed A on SN30 is index 1");
});
