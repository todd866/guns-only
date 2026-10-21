// District GLB → playable course, without three.js, so Node tests and the browser share it.
// Node-name contract (docs/area-51-build-plan.md): COL_<surface>_* collision meshes, GATE_NN,
// START_N, AI_NNN, PICKUP_*, SPEC_*, CAM_* empties. Gate/AI scale.x is the half width.
import { createWorld, SURFACES } from './world.mjs';

export function parseGlb(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  if (dv.getUint32(0, true) !== 0x46546c67) throw Error('Not a GLB');
  let off = 12, json = null, bin = null;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(dv.buffer, start, len)));
    if (type === 0x004e4942) bin = new DataView(dv.buffer, start, len);
    off = start + len;
  }
  if (!json) throw Error('GLB has no JSON chunk');
  return { json, bin };
}

// Column-major 4×4 from TRS or matrix.
function localMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function readAccessor({ json, bin }, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
  const stride = view.byteStride || comps * size, base = (view.byteOffset || 0) + (a.byteOffset || 0), out = [];
  const read = { 5126: o => bin.getFloat32(o, true), 5125: o => bin.getUint32(o, true), 5123: o => bin.getUint16(o, true), 5121: o => bin.getUint8(o) }[a.componentType];
  for (let i = 0; i < a.count; i++) { const v = []; for (let c = 0; c < comps; c++) v.push(read(base + i * stride + c * size)); out.push(comps === 1 ? v[0] : v); }
  return out;
}

// Walk every node with its world matrix.
export function walkNodes(glb, fn) {
  const { json } = glb, scene = json.scenes[json.scene || 0];
  const visit = (i, parent) => { const n = json.nodes[i], m = mul(parent, localMatrix(n)); fn(n, m, i); (n.children || []).forEach(c => visit(c, m)); };
  scene.nodes.forEach(i => visit(i, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
}

export function surfaceOf(name) {
  const s = name.slice(4).split(/[_.]/)[0].toLowerCase();
  if (!SURFACES[s]) throw Error(`Unknown collision surface in ${name}`);
  return s;
}

export function courseFromGlb(buffer) {
  const glb = parseGlb(buffer), world = createWorld(4);
  const gates = [], starts = [], ai = [], pickups = [], secrets = [], cams = [], coins = [];
  let colTris = 0;
  walkNodes(glb, (n, m) => {
    const name = n.name || '', pos = apply(m, [0, 0, 0]);
    // Forward (−Z) and half width (|X axis|) in world space.
    const fwd = [-m[8], -m[9], -m[10]], fl = Math.hypot(...fwd) || 1, half = Math.hypot(m[0], m[1], m[2]);
    const marker = { name, pos, forward: fwd.map(v => v / fl), halfWidth: half };
    if (name.startsWith('COL_') && n.mesh !== undefined) {
      const surface = surfaceOf(name);
      for (const prim of glb.json.meshes[n.mesh].primitives) {
        const p = readAccessor(glb, prim.attributes.POSITION).map(v => apply(m, v));
        const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices) : p.map((_, i) => i);
        // A mirrored transform flips winding; keep faces pointing outward.
        const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
        for (let i = 0; i < idx.length; i += 3) {
          const [a, b, c] = [p[idx[i]], p[idx[i + 1]], p[idx[i + 2]]];
          det < 0 ? world.addTri(a, c, b, surface) : world.addTri(a, b, c, surface); colTris++;
        }
      }
    }
    else if (/^GATE_\d+/.test(name)) gates.push(marker);
    else if (/^START_\d+/.test(name)) starts.push(marker);
    else if (/^AI_\d+/.test(name)) ai.push(marker);
    else if (name.startsWith('PICKUP_')) pickups.push(marker);
    else if (name.startsWith('SPEC_')) secrets.push(marker);
    else if (name.startsWith('CAM_')) cams.push(marker);
    else if (/^COIN_\d+/.test(name)) coins.push(marker);
  });
  const byNum = (a, b) => parseInt(a.name.match(/\d+/)[0]) - parseInt(b.name.match(/\d+/)[0]);
  gates.sort(byNum); starts.sort(byNum); ai.sort(byNum);
  if (gates.length < 2) throw Error('District needs GATE_00 and at least one more gate');
  if (!starts.length) throw Error('District needs START_1');
  if (!colTris) throw Error('District has no COL_ collision meshes');
  const yawOf = f => Math.atan2(f[0], -f[2]);
  // One lap: cross GATE_00 to start the clock, every gate in order, GATE_00 again to finish.
  const lap = [...gates, gates[0]];
  return {
    world, gates, ai, pickups, cams, colTris, coins: coins.sort(byNum).map(c => ({ name: c.name, x: c.pos[0], y: c.pos[1], z: c.pos[2] })),
    checkpoints: lap.map(g => [g.pos[0], g.pos[2], g.name, Math.max(1.2, g.halfWidth)]),
    secrets: secrets.map(s => ({ x: s.pos[0], z: s.pos[2], y: s.pos[1] })),
    start: { pos: starts[0].pos, yaw: yawOf(starts[0].forward) },
    grid: starts.map(s => ({ pos: s.pos, yaw: yawOf(s.forward) })),
  };
}
