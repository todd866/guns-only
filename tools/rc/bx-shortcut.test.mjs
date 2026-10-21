// Drives the BX stockroom shortcut (ALT_stockroom_NNN empties in bx.glb, formerly SHORTCUT_NNN) with the real car physics,
// in kid and Big Kid modes: it must reach the rejoin point without a >2 s stall and collect the
// specimen on the pallet deck. Pure pursuit on the authored nodes, throttle capped at ~5 m/s.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { courseFromGlb, parseGlb, walkNodes } from '../../web/wwwroot/rc/physics/district.mjs';
import { createSession, stepSession, readout } from '../../web/wwwroot/rc/physics/session.mjs';
import { placeCar, rideHeight } from '../../web/wwwroot/rc/physics/car.mjs';

const file = fileURLToPath(new URL('../../web/wwwroot/rc/assets/districts/bx.glb', import.meta.url));
const buffer = fs.readFileSync(file);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

function shortcutNodes() {
  const out = [];
  walkNodes(parseGlb(arrayBuffer), (n, m) => {
    const k = /^ALT_stockroom_(\d{3})$/.exec(n.name ?? '');
    if (k) out.push({ i: Number(k[1]), x: m[12], z: m[14], half: Math.hypot(m[0], m[1], m[2]) });
  });
  return out.sort((a, b) => a.i - b.i);
}

function drive(mode) {
  const course = courseFromGlb(arrayBuffer), nodes = shortcutNodes(), s = createSession(course, { mode });
  const [a, b] = nodes;
  placeCar(s.car, [a.x, rideHeight(s.car.params) + 0.02, a.z], Math.atan2(b.x - a.x, -(b.z - a.z)));
  let target = 1, stalled = 0, worstStall = 0, t = 0;
  const dt = 1 / 120;
  while (t < 60 && target < nodes.length) {
    const r = readout(s), p = nodes[target];
    if (Math.hypot(p.x - r.x, p.z - r.z) < 2) { target++; continue; }
    const e = Math.atan2(Math.sin(Math.atan2(p.x - r.x, -(p.z - r.z)) - r.yaw), Math.cos(Math.atan2(p.x - r.x, -(p.z - r.z)) - r.yaw));
    const steer = Math.max(-1, Math.min(1, e * 2.5));
    stepSession(s, { throttle: r.speed < (Math.abs(e) > .5 ? 2.5 : 5) ? 1 : 0, steer, brake: false }, dt);
    t += dt;
    stalled = readout(s).speed < .3 ? stalled + dt : 0;
    worstStall = Math.max(worstStall, stalled);
  }
  const r = readout(s);
  return { reached: target >= nodes.length, t, worstStall, found: s.found, hits: s.hits, at: [r.x, r.z], target, nodes: nodes.length };
}

test('bx.glb carries an ordered ALT_stockroom_NNN line', () => {
  const nodes = shortcutNodes();
  assert.ok(nodes.length >= 10);
  nodes.forEach((n, i) => { assert.equal(n.i, i); assert.ok(n.half > .5); });
});

for (const mode of ['kid', 'bigKid']) {
  test(`stockroom shortcut drives clean in ${mode} mode`, () => {
    const r = drive(mode);
    assert.ok(r.reached, `stopped at node ${r.target}/${r.nodes} at ${r.at.map(v => v.toFixed(2))} after ${r.t.toFixed(1)} s`);
    assert.ok(r.worstStall <= 2, `stalled ${r.worstStall.toFixed(2)} s`);
    assert.equal(r.found, 1, 'specimen not collected');
  });
}
