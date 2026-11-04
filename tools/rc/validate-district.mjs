// Area 51½ district GLB contract check (docs/area-51-build-plan.md). No dependencies.
// usage: node tools/rc/validate-district.mjs DISTRICT.glb [--out receipt.json]
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseGLB} from './validate-assets.mjs';

export const SURFACES = ['asphalt', 'concrete', 'grass', 'dirt', 'wood', 'gymfloor', 'carpet', 'metal', 'tile', 'rubber', 'gravel'];
export const BUDGET = {visualTriangles: 250000, collisionTriangles: 40000, materials: 24, bytes: 12 * 1024 * 1024,
  gates: [8, 12], starts: 4, pickups: [6, 10], specs: 1, aiSpacing: [4, 12], aiMaxTurnDeg: 75,
  // Challenge coins (COIN_01..COIN_05): reachable by a toy car (floor within coinMaxLift below
  // the coin) and off the main racing line (a car on the line must not collect one by accident).
  coins: 5, coinMaxLift: 0.6, coinOffLine: 1.5,
  // Skill shortcuts (ALT_<name>_NNN): both ends on the racing line, no gate bypassed, every node
  // and midpoint over walkable collision with at least altMinWidth of level surface across it.
  altEndOnLine: 1.0, altMinWidth: 0.55, altMinNodes: 4,
  walkable: ['asphalt', 'concrete', 'tile', 'wood', 'carpet', 'gymfloor', 'rubber', 'metal', 'gravel', 'grass', 'dirt'],
  // Lateral sweeps either side of the racing line: a vertical rise in this band is too tall to
  // roll over and too short to read as a wall, so a toy wheel wedges on it (the v1 kerb bug).
  trapStep: [0.025, 0.25], sweepBeyondHalfWidth: 4, sweepStep: 0.02,
  // Floors a racing line may run on (interiors: polished concrete is `tile`, laminate is `wood`).
  // Playground rubber (poured / mulch) is driven on in the School.
  drivable: ['asphalt', 'concrete', 'tile', 'wood', 'carpet', 'gymfloor', 'rubber'],
  // A collision mesh lying wholly this far above the line (a table top) is overhead, not an
  // obstacle: the toy car (about 0.25 m tall) drives under it.
  toyClearance: 0.45};

export function splitGLB(bytes) {
  const doc = parseGLB(bytes);
  const jsonLen = bytes.readUInt32LE(12);
  let bin = null, at = 20 + jsonLen;
  if (at + 8 <= bytes.length) {
    const len = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
    if (type === 0x004e4942) bin = bytes.subarray(at + 8, at + 8 + len);
  }
  return {doc, bin};
}

// ---- small column-major 4x4 math (glTF convention)
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], t = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, t[0], t[1], t[2], 1];
}
const apply = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const dirOf = (m, d) => [0, 1, 2].map(r => m[r] * d[0] + m[4 + r] * d[1] + m[8 + r] * d[2]);
const len = v => Math.hypot(...v);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = v => { const l = len(v) || 1; return v.map(x => x / l); };
const flat = v => norm([v[0], 0, v[2]]);
const r2 = x => Math.round(x * 100) / 100;

function readAccessor(doc, bin, id) {
  const a = doc.accessors[id], bv = doc.bufferViews[a.bufferView];
  const comps = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type];
  const [size, get] = {5126: [4, 'getFloat32'], 5125: [4, 'getUint32'], 5123: [2, 'getUint16'], 5121: [1, 'getUint8']}[a.componentType];
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const stride = bv.byteStride ?? comps * size, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = new Array(a.count);
  for (let i = 0; i < a.count; i++) {
    const row = new Array(comps);
    for (let c = 0; c < comps; c++) row[c] = dv[get](base + i * stride + c * size, true);
    out[i] = row;
  }
  return out;
}

function triangles(doc, bin, prim, world) {
  const pos = readAccessor(doc, bin, prim.attributes.POSITION).map(p => apply(world, p));
  const idx = prim.indices !== undefined ? readAccessor(doc, bin, prim.indices).map(v => v[0]) : pos.map((_, i) => i);
  const tris = [];
  for (let i = 0; i + 2 < idx.length; i += 3) tris.push([pos[idx[i]], pos[idx[i + 1]], pos[idx[i + 2]]]);
  return tris;
}

// Closed = after welding coincident positions every edge is shared by an even number of faces.
export function openEdges(tris) {
  const key = p => p.map(v => Math.round(v * 1000)).join(',');
  const edges = new Map();
  for (const t of tris) {
    const k = t.map(key);
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue;
    for (let i = 0; i < 3; i++) {
      const a = k[i], b = k[(i + 1) % 3], e = a < b ? a + '|' + b : b + '|' + a;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const n of edges.values()) if (n % 2) open++;
  return open;
}

// Downward ray caster over all COL triangles, bucketed on a uniform XZ grid. With `below`, meshes
// whose lowest point is above `below` are ignored (overhead geometry the car passes under).
export function makeCaster(col, cell = 2) {
  const grid = new Map(), k = (i, j) => i * 100003 + j;
  for (const c of col) for (const t of c.tris) {
    const x0 = Math.floor(Math.min(t[0][0], t[1][0], t[2][0]) / cell), x1 = Math.floor(Math.max(t[0][0], t[1][0], t[2][0]) / cell);
    const z0 = Math.floor(Math.min(t[0][2], t[1][2], t[2][2]) / cell), z1 = Math.floor(Math.max(t[0][2], t[1][2], t[2][2]) / cell);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const key = k(i, j);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({t, c});
    }
  }
  return (from, below = Infinity) => castDown(grid.get(k(Math.floor(from[0] / cell), Math.floor(from[2] / cell))) ?? [], from, below);
}

// First collision surface hit by a vertical ray cast down from `from` (+Y up).
export function castDown(items, from, below = Infinity) {
  let best = null;
  for (const {t, c} of items) {
    if (c.min && c.min[1] > below) continue;
    {
      const [a, b, d] = t;
      const x = from[0], z = from[2];
      const det = (b[2] - d[2]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[2] - d[2]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((b[2] - d[2]) * (x - d[0]) + (d[0] - b[0]) * (z - d[2])) / det;
      const l2 = ((d[2] - a[2]) * (x - d[0]) + (a[0] - d[0]) * (z - d[2])) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * a[1] + l2 * b[1] + l3 * d[1];
      if (y <= from[1] && (!best || y > best.y)) best = {y, name: c.name, surface: c.surface};
    }
  }
  return best;
}

export function validateDistrict(doc, bin, bytes, budget = BUDGET) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  if (doc.asset?.version !== '2.0') err('glTF 2.0 required');
  for (const b of doc.buffers ?? []) if (b.uri) err('external buffer forbidden');
  for (const i of doc.images ?? []) if (i.uri) err('external image forbidden');
  if (bytes > budget.bytes) err(`byte budget ${bytes} > ${budget.bytes}`);
  const materials = (doc.materials ?? []).length;
  if (materials > budget.materials) err(`material budget ${materials} > ${budget.materials}`);

  const nodes = [], col = [];
  let visTris = 0, colTris = 0, visPrims = 0, visPrimsAO = 0;
  const bad = new Set();
  const visit = (id, parent) => {
    const n = doc.nodes[id];
    if (!n) { err(`bad node index ${id}`); return; }
    const world = mul(parent, trs(n));
    nodes.push({name: n.name ?? '', node: n, world, pos: apply(world, [0, 0, 0])});
    if (n.mesh !== undefined) {
      const name = n.name ?? '', mesh = doc.meshes[n.mesh];
      if (name.startsWith('VIS_')) {
        for (const p of mesh.primitives) {
          if ((p.mode ?? 4) !== 4) err(`${name}: only triangle primitives`);
          const count = p.indices !== undefined ? doc.accessors[p.indices].count : doc.accessors[p.attributes.POSITION].count;
          visTris += count / 3; visPrims++;
          if (p.attributes.COLOR_0 !== undefined) visPrimsAO++;
        }
      } else if (name.startsWith('COL_')) {
        const surface = name.split('_')[1];
        if (!SURFACES.includes(surface)) err(`${name}: unknown surface "${surface}"`);
        let tris = [];
        if (!bin) err('collision present but GLB has no BIN chunk');
        else for (const p of mesh.primitives) tris = tris.concat(triangles(doc, bin, p, world));
        colTris += tris.length;
        const open = openEdges(tris);
        if (open) bad.add(`${name} (${open} open edges)`);
        const min = [0, 1, 2].map(i => Math.min(...tris.map(t => Math.min(t[0][i], t[1][i], t[2][i]))));
        const max = [0, 1, 2].map(i => Math.max(...tris.map(t => Math.max(t[0][i], t[1][i], t[2][i]))));
        col.push({name, surface, tris, min, max});
      } else err(`mesh node "${name}" is neither VIS_* nor COL_<surface>_*`);
    }
    for (const c of n.children ?? []) visit(c, world);
  };
  for (const r of doc.scenes?.[doc.scene ?? 0]?.nodes ?? []) visit(r, ident());
  if (bad.size) err(`collision meshes not closed: ${[...bad].slice(0, 8).join(', ')}${bad.size > 8 ? ' …' : ''}`);
  if (visTris > budget.visualTriangles) err(`visual triangles ${visTris} > ${budget.visualTriangles}`);
  if (colTris > budget.collisionTriangles) err(`collision triangles ${colTris} > ${budget.collisionTriangles}`);
  if (!col.length) err('no COL_* collision meshes');
  if (visPrims && visPrimsAO < visPrims) warn(`COLOR_0 (baked AO) on ${visPrimsAO}/${visPrims} VIS primitives`);

  const byPrefix = re => nodes.filter(n => re.test(n.name)).sort((a, b) => a.name.localeCompare(b.name));
  const fwd = n => flat(dirOf(n.world, [0, 0, -1]));
  const halfWidth = n => len(dirOf(n.world, [1, 0, 0]));
  const contiguous = (list, re, label, width) => list.forEach((n, i) => {
    const k = Number(re.exec(n.name)[1]);
    if (k !== i + (label === 'START' ? 1 : 0)) err(`${label} numbering not contiguous at ${n.name}`);
    if (n.node.mesh !== undefined) err(`${n.name} must be an empty`);
    if (width && !(halfWidth(n) > .5)) err(`${n.name}: scale.x half width must be > 0.5 m`);
  });

  const reGate = /^GATE_(\d{2})$/, reAI = /^AI_(\d{3})$/, reStart = /^START_(\d)$/;
  const gates = byPrefix(reGate), ai = byPrefix(reAI), starts = byPrefix(reStart);
  const pickups = byPrefix(/^PICKUP_/), specs = byPrefix(/^SPEC_/), coins = byPrefix(/^COIN_/);
  contiguous(gates, reGate, 'GATE', true);
  contiguous(ai, reAI, 'AI', true);
  contiguous(starts, reStart, 'START', false);
  if (gates.length < budget.gates[0] || gates.length > budget.gates[1]) err(`gate count ${gates.length} outside ${budget.gates}`);
  if (starts.length !== budget.starts) err(`start slots ${starts.length} != ${budget.starts}`);
  if (pickups.length < budget.pickups[0] || pickups.length > budget.pickups[1]) err(`pickup count ${pickups.length} outside ${budget.pickups}`);
  if (specs.length < budget.specs) err(`need >= ${budget.specs} SPEC_* specimen spot`);
  if (coins.length !== budget.coins) err(`challenge coins ${coins.length} != ${budget.coins} (COIN_01..COIN_0${budget.coins})`);
  coins.forEach((n, i) => {
    if (n.name !== `COIN_${String(i + 1).padStart(2, '0')}`) err(`COIN numbering not COIN_01..COIN_0${budget.coins} at ${n.name}`);
    if (n.node.mesh !== undefined) err(`${n.name} must be an empty`);
  });

  // Racing line: ordered, evenly spaced, closes the loop, no reversals.
  let lap = 0;
  const cum = [0], seg = [];
  if (ai.length < 10) err(`AI nodes ${ai.length} < 10`);
  else {
    for (let i = 0; i < ai.length; i++) {
      const a = ai[i].pos, b = ai[(i + 1) % ai.length].pos, d = len(sub(b, a));
      seg.push(d); lap += d; cum.push(lap);
      if (d < budget.aiSpacing[0] || d > budget.aiSpacing[1]) err(`AI spacing ${r2(d)} m at ${ai[i].name}${i === ai.length - 1 ? ' (loop closure)' : ''}`);
      const c = ai[(i + 2) % ai.length].pos;
      const turn = Math.acos(Math.max(-1, Math.min(1, dot(flat(sub(b, a)), flat(sub(c, b)))))) * 180 / Math.PI;
      if (turn > budget.aiMaxTurnDeg) err(`AI line turns ${r2(turn)}° at ${ai[(i + 1) % ai.length].name}`);
      if (dot(fwd(ai[i]), flat(sub(b, a))) < .7) err(`${ai[i].name} heading disagrees with the line`);
    }
  }
  // Project a point onto the closed AI polyline: arc length, lateral distance, tangent.
  const project = p => {
    let best = null;
    for (let i = 0; i < ai.length; i++) {
      const a = ai[i].pos, b = ai[(i + 1) % ai.length].pos, ab = sub(b, a);
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
      const q = a.map((v, k) => v + ab[k] * t), d = len(sub([p[0], 0, p[2]], [q[0], 0, q[2]]));
      if (!best || d < best.d) best = {d, s: cum[i] + seg[i] * t, tan: flat(ab), w: halfWidth(ai[i])};
    }
    return best;
  };
  const gateReport = [];
  if (ai.length >= 10 && gates.length) {
    const s0 = project(gates[0].pos).s;
    let prev = -1;
    for (const g of gates) {
      const pr = project(g.pos), s = ((pr.s - s0) % lap + lap) % lap;
      gateReport.push({name: g.name, track_m: r2(s), half_width_m: r2(halfWidth(g))});
      if (s <= prev) err(`${g.name} out of lap order (track ${r2(s)} m after ${r2(prev)} m)`);
      prev = s;
      if (pr.d > pr.w + 1) err(`${g.name} is ${r2(pr.d)} m off the racing line`);
      if (dot(fwd(g), pr.tan) < .7) err(`${g.name} forward (-Z) disagrees with race direction`);
      if (Math.abs(g.pos[1]) > 1) warn(`${g.name} is ${r2(g.pos[1])} m above datum (low-altitude gates expected)`);
    }
    if (gates.length && Math.abs(gates[0].pos[1]) > .5) err('GATE_00 not at road level');
    const g0 = gates[0], f0 = fwd(g0);
    for (const s of starts) {
      const rel = sub(s.pos, g0.pos);
      if (len(rel) > 20) err(`${s.name} is ${r2(len(rel))} m from GATE_00`);
      if (dot(rel, f0) >= 0) err(`${s.name} is not behind the start line`);
      if (dot(fwd(s), f0) < .85) err(`${s.name} does not face the race direction`);
    }
  }

  // Every racing-line node and midpoint must sit on clear, drivable collision: the first
  // surface under a ray from 3 m above is a road-level drivable floor with nothing overhead
  // below toy clearance.
  const surfaceTally = {}, offRoad = [], traps = [], coinReport = [];
  let sweepSamples = 0;
  const cast = col.length ? makeCaster(col) : () => null;
  if (col.length && ai.length) {
    const probes = [];
    ai.forEach((n, i) => { probes.push([n.name, n.pos]); const b = ai[(i + 1) % ai.length].pos; probes.push([n.name + '+', n.pos.map((v, k) => (v + b[k]) / 2)]); });
    gates.forEach(g => probes.push([g.name, g.pos]));
    for (const [name, p] of probes) {
      const hit = cast([p[0], p[1] + 3, p[2]], p[1] + budget.toyClearance);
      const key = hit ? hit.surface : 'none';
      surfaceTally[key] = (surfaceTally[key] ?? 0) + 1;
      if (!hit || !budget.drivable.includes(hit.surface) || Math.abs(hit.y - p[1]) > .06) offRoad.push(`${name}:${hit ? hit.name + '@' + r2(hit.y) : 'void'}`);
    }
    // Lateral sweeps at every AI node: from the line outwards to half width + 4 m each side.
    for (const n of ai) {
      const f = fwd(n), side = [-f[2], 0, f[0]], reach = halfWidth(n) + budget.sweepBeyondHalfWidth;
      for (const dir of [1, -1]) {
        let prev = null;
        for (let o = 0; o <= reach; o += budget.sweepStep) {
          const q = [n.pos[0] + side[0] * o * dir, n.pos[1] + 3, n.pos[2] + side[2] * o * dir];
          const hit = cast(q, n.pos[1] + budget.toyClearance);
          sweepSamples++;
          if (prev && hit) {
            const rise = Math.abs(hit.y - prev.y);
            if (rise > budget.trapStep[0] && rise < budget.trapStep[1])
              traps.push(`${n.name}${dir > 0 ? 'L' : 'R'}@${r2(o)}m:${r2(rise * 100)}cm(${prev.name}->${hit.name})`);
          }
          if (hit && hit.y - n.pos[1] > budget.trapStep[1]) break;    // reached a real wall
          prev = hit;
        }
      }
    }
    if (traps.length) err(`wedge-trap steps (${budget.trapStep[0] * 100}-${budget.trapStep[1] * 100} cm) beside the racing line: ${traps.slice(0, 6).join(', ')}${traps.length > 6 ? ` … (${traps.length})` : ''}`);
    if (offRoad.length) err(`racing line not on clear road at ${offRoad.slice(0, 6).join(', ')}${offRoad.length > 6 ? ' …' : ''}`);
    for (const n of coins) {
      const hit = cast([n.pos[0], n.pos[1] + .05, n.pos[2]]);
      if (!hit) err(`${n.name} has no collision floor beneath it`);
      else if (n.pos[1] - hit.y > budget.coinMaxLift) err(`${n.name} floats ${r2(n.pos[1] - hit.y)} m above ${hit.name} (max ${budget.coinMaxLift} m: a toy car cannot reach it)`);
      const pr = ai.length >= 10 ? project(n.pos) : null;
      coinReport.push({name: n.name, at: n.pos.map(r2), lift_m: hit ? r2(n.pos[1] - hit.y) : null, surface: hit?.surface ?? null,
        line_m: pr ? r2(pr.d) : null, hint: n.node.extras?.hint ?? null});
      if (pr && pr.d < budget.coinOffLine) err(`${n.name} is ${r2(pr.d)} m from the racing line (coins go off the line, >= ${budget.coinOffLine} m)`);
    }
    for (const n of [...starts, ...pickups, ...specs]) {
      const hit = cast([n.pos[0], n.pos[1] + .05, n.pos[2]]);
      if (!hit) err(`${n.name} has no collision floor beneath it`);
      else if (n.pos[1] - hit.y > 1.5) warn(`${n.name} floats ${r2(n.pos[1] - hit.y)} m above ${hit.name}`);
    }
  }
  // Skill shortcuts.
  const altReport = [];
  const altGroups = {};
  for (const n of nodes) { const m = /^ALT_([A-Za-z0-9]+)_(\d{3})$/.exec(n.name); if (m) (altGroups[m[1]] ??= []).push({k: Number(m[2]), n}); }
  for (const [name, list] of Object.entries(altGroups)) {
    list.sort((a, b) => a.k - b.k);
    const pts = list.map(e => e.n);
    list.forEach((e, i) => { if (e.k !== i) err(`ALT_${name} numbering not contiguous at ${e.n.name}`); if (e.n.node.mesh !== undefined) err(`${e.n.name} must be an empty`); });
    if (pts.length < budget.altMinNodes) { err(`ALT_${name} has ${pts.length} nodes (< ${budget.altMinNodes})`); continue; }
    const rep = {name, nodes: pts.length, length_m: 0, start: null, end: null, min_width_m: Infinity, max_height_m: 0, bypassed_m: null};
    for (let i = 0; i + 1 < pts.length; i++) rep.length_m += len(sub(pts[i + 1].pos, pts[i].pos));
    const nearAI = p => ai.reduce((b, a) => { const d = Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]); return !b || d < b.d ? {d, a} : b; }, null);
    if (ai.length >= 10) {
      const a = nearAI(pts[0].pos), b = nearAI(pts[pts.length - 1].pos);
      rep.start = a.a.name; rep.end = b.a.name;
      if (a.d > budget.altEndOnLine) err(`ALT_${name} starts ${r2(a.d)} m from the racing line (max ${budget.altEndOnLine})`);
      if (b.d > budget.altEndOnLine) err(`ALT_${name} ends ${r2(b.d)} m from the racing line (max ${budget.altEndOnLine})`);
      if (gates.length) {
        const s0 = project(gates[0].pos).s, at = p => ((project(p).s - s0) % lap + lap) % lap;
        const sa = at(pts[0].pos), sb = at(pts[pts.length - 1].pos), span = ((sb - sa) % lap + lap) % lap;
        rep.bypassed_m = r2(span);
        for (const g of gates) {
          const sg = ((at(g.pos) - sa) % lap + lap) % lap;
          if (sg > .5 && sg < span - .5) err(`ALT_${name} bypasses ${g.name}`);
        }
      }
    }
    const probe = (label, p, dir) => {
      const hit = cast([p[0], p[1] + .5, p[2]], p[1] + budget.toyClearance);
      if (!hit || !budget.walkable.includes(hit.surface) || Math.abs(hit.y - p[1]) > .08) {
        err(`ALT_${name} not over walkable collision at ${label}: ${hit ? hit.name + '@' + r2(hit.y) : 'void'} (node y ${r2(p[1])})`);
        return;
      }
      const side = [-dir[2], 0, dir[0]];
      let width = 0;
      for (const sg of [1, -1]) {
        let o = 0;
        for (let d = .01; d <= .6; d += .01) {
          const h = cast([p[0] + side[0] * d * sg, hit.y + .5, p[2] + side[2] * d * sg], hit.y + budget.toyClearance);
          if (!h || Math.abs(h.y - hit.y) > .05) break;
          o = d;
        }
        width += o;
      }
      rep.min_width_m = Math.min(rep.min_width_m, r2(width));
      rep.max_height_m = Math.max(rep.max_height_m, r2(hit.y));
      if (width < budget.altMinWidth) err(`ALT_${name} only ${r2(width)} m wide at ${label} (min ${budget.altMinWidth})`);
    };
    pts.forEach((n, i) => {
      const nxt = pts[Math.min(i + 1, pts.length - 1)], prv = pts[Math.max(i - 1, 0)];
      probe(n.name, n.pos, flat(sub(nxt.pos, prv.pos)));
      if (i + 1 < pts.length && !n.node.extras?.gap) probe(n.name + '+', n.pos.map((v, k) => (v + nxt.pos[k]) / 2), flat(sub(nxt.pos, n.pos)));
    });
    rep.length_m = r2(rep.length_m);
    altReport.push(rep);
  }

  const surfaces = {};
  for (const c of col) surfaces[c.surface] = (surfaces[c.surface] ?? 0) + c.tris.length;
  return {
    ok: errors.length === 0, errors, warnings,
    bytes, materials, visual_triangles: visTris, visual_primitives: visPrims, vis_primitives_with_color0: visPrimsAO,
    collision_triangles: colTris, collision_meshes: col.length, collision_open_meshes: bad.size, collision_surface_triangles: surfaces,
    gates: gateReport, start_slots: starts.map(s => s.name), ai_nodes: ai.length,
    ai_spacing_m: seg.length ? {min: r2(Math.min(...seg)), max: r2(Math.max(...seg))} : null,
    lap_length_m: r2(lap), lap_time_s_at_8_to_10_mps: lap ? [r2(lap / 10), r2(lap / 8)] : null,
    racing_line_surface_probes: surfaceTally, lateral_sweep_samples: sweepSamples, wedge_trap_steps: traps.length, pickups: pickups.length, specimens: specs.map(s => s.name), coins: coinReport,
    camera_hints: byPrefix(/^CAM_/).map(n => n.name), alt_routes: altReport, budget,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/rc/validate-district.mjs DISTRICT.glb [--out receipt.json]'); process.exit(2); }
  const bytes = fs.readFileSync(file), {doc, bin} = splitGLB(bytes);
  const receipt = {file, checked_at: new Date().toISOString(), ...validateDistrict(doc, bin, bytes.length)};
  const text = JSON.stringify(receipt, null, 2) + '\n';
  const out = process.argv.indexOf('--out');
  if (out > 0) fs.writeFileSync(process.argv[out + 1], text);
  process.stdout.write(text);
  process.exit(receipt.ok ? 0 : 1);
}
