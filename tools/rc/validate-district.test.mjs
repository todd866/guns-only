import test from 'node:test';
import assert from 'node:assert/strict';
import {splitGLB, validateDistrict, openEdges} from './validate-district.mjs';

// Minimal synthetic district: a 50 m-radius circular lap (glTF +Y up), one closed asphalt
// slab under it, one VIS triangle with COLOR_0. Deliberately hand-made, not an export.
function district({gateOrder = null, dropTri = false, surface = 'asphalt', starts = 4, kerb = null, canopy = null} = {}) {
  const R = 50, nodes = [], floats = [], idx = [];
  const quatY = phi => [0, Math.sin(phi / 2), 0, Math.cos(phi / 2)];
  const at = th => ({t: [R * Math.cos(th), 0, R * Math.sin(th)], r: quatY(Math.PI - th)}); // -Z = d/dθ
  for (let k = 0; k < 40; k++) { const p = at(2 * Math.PI * k / 40); nodes.push({name: `AI_${String(k).padStart(3, '0')}`, translation: p.t, rotation: p.r, scale: [3, 1, 1]}); }
  const order = gateOrder ?? [...Array(8).keys()];
  order.forEach((k, i) => { const p = at(2 * Math.PI * k / 8); nodes.push({name: `GATE_${String(i).padStart(2, '0')}`, translation: p.t, rotation: p.r, scale: [3.5, 1, 1]}); });
  for (let k = 1; k <= starts; k++) { const p = at(-0.04 * k); nodes.push({name: `START_${k}`, translation: [p.t[0], 0, p.t[2]], rotation: p.r}); }
  for (let k = 0; k < 6; k++) nodes.push({name: `PICKUP_${k}`, translation: at(k + .5).t.map((v, i) => i === 1 ? .3 : v)});
  nodes.push({name: 'SPEC_01', translation: [0, .2, 0]});
  // Closed box 130 x 0.3 x 130 (12 triangles).
  const s = 65, c = [[-s, -.3, -s], [s, -.3, -s], [s, -.3, s], [-s, -.3, s], [-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s]];
  // Optional vertical kerb block beside the line at theta = 0 (radially 54-55 m, kerb m tall).
  if (kerb !== null) c.push([54, -.3, -1], [55, -.3, -1], [55, -.3, 1], [54, -.3, 1], [54, kerb, -1], [55, kerb, -1], [55, kerb, 1], [54, kerb, 1]);
  // Optional block straddling the line at theta = 0 (x 48-52), from canopy[0] to canopy[1] m.
  if (canopy !== null) { const [y0, y1] = canopy; c.push([48, y0, -1], [52, y0, -1], [52, y0, 1], [48, y0, 1], [48, y1, -1], [52, y1, -1], [52, y1, 1], [48, y1, 1]); }
  c.forEach(p => floats.push(...p));
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const blocks = c.length - (canopy !== null ? 8 : 0);
  for (let o = 0; o < blocks; o += 8) for (const [a, b, d, e] of quads) idx.push(a + o, b + o, d + o, a + o, d + o, e + o);
  if (dropTri) idx.splice(-3);
  const mainCount = idx.length;      // the canopy is its own COL mesh (accessor 4)
  if (canopy !== null) for (const [a, b, d, e] of quads) idx.push(a + blocks, b + blocks, d + blocks, a + blocks, d + blocks, e + blocks);
  const visBase = floats.length / 3;
  floats.push(0, 0, 0, 1, 0, 0, 0, 0, 1);            // VIS triangle positions
  const colors = [1, 1, 1, 1, .5, .5, .5, 1, .4, .4, .4, 1];
  const posBuf = Buffer.from(new Float32Array(floats).buffer), idxBuf = Buffer.from(new Uint16Array(idx).buffer);
  const colBuf = Buffer.from(new Float32Array(colors).buffer);
  const bin = Buffer.concat([posBuf, idxBuf, Buffer.alloc((4 - idxBuf.length % 4) % 4), colBuf]);
  const colOff = posBuf.length + idxBuf.length + (4 - idxBuf.length % 4) % 4;
  nodes.push({name: `COL_${surface}_ground`, mesh: 0}, {name: 'VIS_ground', mesh: 1});
  if (canopy !== null) nodes.push({name: 'COL_wood_canopy', mesh: 2});
  const doc = {
    asset: {version: '2.0'}, scene: 0, scenes: [{nodes: nodes.map((_, i) => i)}], nodes,
    materials: [{name: 'm'}],
    meshes: [{primitives: [{attributes: {POSITION: 0}, indices: 1}]}, {primitives: [{attributes: {POSITION: 2, COLOR_0: 3}, material: 0}]},
      {primitives: [{attributes: {POSITION: 0}, indices: 4}]}],
    buffers: [{byteLength: bin.length}],
    bufferViews: [{buffer: 0, byteOffset: 0, byteLength: visBase * 12}, {buffer: 0, byteOffset: posBuf.length, byteLength: idxBuf.length},
      {buffer: 0, byteOffset: visBase * 12, byteLength: 36}, {buffer: 0, byteOffset: colOff, byteLength: colBuf.length}],
    accessors: [{bufferView: 0, componentType: 5126, count: visBase, type: 'VEC3', min: [-s, -.3, -s], max: [s, 1, s]},
      {bufferView: 1, componentType: 5123, count: mainCount, type: 'SCALAR'},
      {bufferView: 2, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 0, 1]},
      {bufferView: 3, componentType: 5126, count: 3, type: 'VEC4'},
      {bufferView: 1, byteOffset: mainCount * 2, componentType: 5123, count: idx.length - mainCount, type: 'SCALAR'}],
  };
  const json = Buffer.from(JSON.stringify(doc).padEnd(Math.ceil(JSON.stringify(doc).length / 4) * 4, ' '));
  const out = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + json.length); out.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(out, 28 + json.length);
  return out;
}
const check = opts => { const bytes = district(opts), {doc, bin} = splitGLB(bytes); return validateDistrict(doc, bin, bytes.length); };

test('a well-formed synthetic district passes and measures its lap', () => {
  const r = check();
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.ai_nodes, 40);
  assert.ok(Math.abs(r.lap_length_m - 2 * 40 * 50 * Math.sin(Math.PI / 40)) < .1);
  assert.equal(r.gates.length, 8);
  assert.equal(r.collision_open_meshes, 0);
  assert.equal(r.vis_primitives_with_color0, 1);
});

test('gates out of lap order are rejected', () => {
  assert.match(check({gateOrder: [0, 1, 3, 2, 4, 5, 6, 7]}).errors.join('\n'), /out of lap order/);
});

test('an open collision mesh is rejected', () => {
  assert.match(check({dropTri: true}).errors.join('\n'), /not closed/);
  assert.equal(openEdges([[[0, 0, 0], [1, 0, 0], [0, 0, 1]]]), 3);
});

test('unknown surfaces and missing start slots are rejected', () => {
  assert.match(check({surface: 'lava'}).errors.join('\n'), /unknown surface "lava"/);
  assert.match(check({starts: 2}).errors.join('\n'), /start slots 2/);
});

test('a racing line over the wrong surface is rejected', () => {
  assert.match(check({surface: 'grass'}).errors.join('\n'), /not on clear road/);
});

test('a vertical kerb step beside the line is a wedge trap; a wall-height block is not', () => {
  assert.match(check({kerb: .12}).errors.join('\n'), /wedge-trap steps/);
  assert.doesNotMatch(check({kerb: .6}).errors.join('\n'), /wedge-trap/);
  assert.doesNotMatch(check({kerb: .015}).errors.join('\n'), /wedge-trap/);
});

test('rubber and gravel are valid collision surfaces', () => {
  for (const surface of ['rubber', 'gravel']) assert.doesNotMatch(check({surface}).errors.join('\n'), /unknown surface/);
});

test('interior floors carry a racing line; grass does not', () => {
  for (const surface of ['tile', 'wood', 'carpet', 'gymfloor']) assert.doesNotMatch(check({surface}).errors.join('\n'), /not on clear road/);
});

test('a table top above toy clearance is overhead; a low block on the line is not', () => {
  assert.doesNotMatch(check({canopy: [.72, .76]}).errors.join('\n'), /not on clear road|wedge-trap/);
  assert.match(check({canopy: [.1, .2]}).errors.join('\n'), /not on clear road/);
});
