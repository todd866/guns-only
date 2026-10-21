import test from 'node:test'; import assert from 'node:assert/strict';
import { courseFromGlb } from './physics/district.mjs';
import { createSession, stepSession, readout } from './physics/session.mjs';

// Minimal GLB writer for contract tests: nodes [{name, t, r, s, quad:[x0,z0,x1,z1,y]}].
function glb(nodes) {
  const floats = [], idx = [], meshes = [], accessors = [];
  const gltfNodes = nodes.map(n => {
    const node = { name: n.name };
    if (n.t) node.translation = n.t; if (n.r) node.rotation = n.r; if (n.s) node.scale = n.s;
    if (n.quad) {
      const [x0, z0, x1, z1, y] = n.quad, base = floats.length / 3;
      floats.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
      const i0 = idx.length; idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      accessors.push({ bufferView: 0, byteOffset: base * 12, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, byteOffset: i0 * 4, componentType: 5125, count: 6, type: 'SCALAR' });
      node.mesh = meshes.length; meshes.push({ primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1 }] });
    }
    return node;
  });
  const fbytes = new Uint8Array(new Float32Array(floats).buffer), ibytes = new Uint8Array(new Uint32Array(idx).buffer);
  const binLen = fbytes.length + ibytes.length, bin = new Uint8Array(Math.ceil(binLen / 4) * 4); bin.set(fbytes); bin.set(ibytes, fbytes.length);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: gltfNodes.map((_, i) => i) }], nodes: gltfNodes, meshes, accessors,
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: fbytes.length }, { buffer: 0, byteOffset: fbytes.length, byteLength: ibytes.length }] };
  let jb = new TextEncoder().encode(JSON.stringify(json)); const pad = (4 - jb.length % 4) % 4; jb = new Uint8Array([...jb, ...Array(pad).fill(32)]);
  const out = new Uint8Array(12 + 8 + jb.length + 8 + bin.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jb, 20);
  dv.setUint32(20 + jb.length, bin.length, true); dv.setUint32(24 + jb.length, 0x004e4942, true); out.set(bin, 28 + jb.length);
  return out.buffer;
}
// Turn a quarter clockwise about Y (facing +X): q = [0, sin(−π/4), 0, cos(−π/4)].
const faceX = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];
const square = () => glb([
  { name: 'COL_asphalt_ground', quad: [-30, -30, 30, 30, 0] },
  { name: 'GATE_00', t: [0, 0, 0], s: [3, 1, 1] }, { name: 'GATE_01', t: [0, 0, -20], s: [3, 1, 1] },
  { name: 'GATE_02', t: [20, 0, -20], r: faceX, s: [3, 1, 1] }, { name: 'GATE_03', t: [20, 0, 0], s: [3, 1, 1] },
  { name: 'START_1', t: [0, 0, 4] }, { name: 'START_2', t: [1, 0, 5] },
  { name: 'AI_001', t: [0, 0, -10], s: [2, 1, 1] }, { name: 'SPEC_alien', t: [-20, 0, 20] }, { name: 'PICKUP_1', t: [10, 0, -20] },
]);

test('district GLB contract becomes a course: collision, gates in order, grid, markers', () => {
  const c = courseFromGlb(square());
  assert.equal(c.colTris, 2);
  assert.deepEqual(c.checkpoints.map(g => g[2]), ['GATE_00', 'GATE_01', 'GATE_02', 'GATE_03', 'GATE_00']);
  assert.ok(Math.abs(c.checkpoints[1][3] - 3) < 1e-6, 'half width from scale.x');
  assert.equal(c.grid.length, 2); assert.equal(c.secrets.length, 1); assert.equal(c.pickups.length, 1); assert.equal(c.ai.length, 1);
  assert.ok(Math.abs(c.gates[2].forward[0] - 1) < 1e-6, 'rotated gate faces +X');
  const hit = c.world.raycast([5, 5, 5], [0, -1, 0], 10); assert.ok(hit && Math.abs(hit.point[1]) < 1e-6 && hit.surface === 'asphalt');
});

test('a steering controller laps a district course', () => {
  const c = courseFromGlb(square()), s = createSession(c, { mode: 'kid' });
  for (let i = 0; i < 120 * 90 && !s.finished; i++) {
    const r = readout(s), [x, z] = c.checkpoints[s.gate];
    const e = Math.atan2(x - r.x, -(z - r.z)) - r.yaw, err = Math.atan2(Math.sin(e), Math.cos(e));
    stepSession(s, { throttle: r.speed > 6 ? 0.3 : 1, steer: Math.max(-1, Math.min(1, err * 2)) });
  }
  assert.ok(s.finished, `gate ${s.gate}`);
});

test('bad districts are rejected loudly', () => {
  assert.throws(() => courseFromGlb(glb([{ name: 'COL_lava_floor', quad: [0, 0, 1, 1, 0] }, { name: 'GATE_00' }, { name: 'GATE_01' }, { name: 'START_1' }])), /Unknown collision surface/);
  assert.throws(() => courseFromGlb(glb([{ name: 'COL_grass_a', quad: [0, 0, 1, 1, 0] }, { name: 'GATE_00' }, { name: 'START_1' }])), /GATE_00/);
  assert.throws(() => courseFromGlb(glb([{ name: 'GATE_00' }, { name: 'GATE_01' }, { name: 'START_1' }])), /COL_/);
});

test('COIN_ markers become challenge coins a car collects by driving through', () => {
  const c = courseFromGlb(glb([
    { name: 'COL_asphalt_ground', quad: [-30, -30, 30, 30, 0] },
    { name: 'GATE_00', t: [0, 0, 0], s: [3, 1, 1] }, { name: 'GATE_01', t: [0, 0, -20], s: [3, 1, 1] },
    { name: 'START_1', t: [0, 0, 4] }, { name: 'COIN_02', t: [0, 0.2, -8] }, { name: 'COIN_01', t: [10, 0.2, 10] },
  ]));
  assert.deepEqual(c.coins.map(k => k.name), ['COIN_01', 'COIN_02']);
  const s = createSession(c, { mode: 'kid' });
  for (let i = 0; i < 240; i++) stepSession(s, { throttle: 1 });
  assert.deepEqual(s.coins, ['COIN_02']);
});
