import * as T from '../../vendor/three.module.js';
import {districtBounds} from './district-zones.mjs';
import {bodyAt} from '../physics/water.mjs';

// Toy-height ground detail. The chase camera sits 30-50 cm up, so the few metres in front of the
// car fill half the frame; flat turf and concrete there read as a cheap game however good the
// lighting is. Like the F-22 scatter fix, detail lives only in a ring of 4 m cells around the car
// (about 22 m), rebuilt deterministically from each cell's coordinates so nothing shuffles when you
// drive back. Decorative only: no collision, a handful of instanced draws.
// QA: ?detailScale=6 enlarges every item to check where it lands; ?detail=off (main.js) disables it.
const DEBUG_SCALE = Number(new URLSearchParams(globalThis.location?.search ?? '').get('detailScale')) || null;
// Grass tufts per square metre by distance ring: thick at the bumper, a sprinkle at the edge.
export const NEAR_DETAIL = {cell: 4, radius: 22, rings: [[6, 40], [10, 14]], sparse: 2, cellsPerFrame: 6};
const INDOOR = ['bx'].map(districtBounds);
const SKIP = new Set(['bowl', 'hip', 'quarter', 'kerb', 'trim', 'wood', 'gymfloor', 'carpet', 'metal', 'water', 'ice']);
const HARD = new Set(['asphalt', 'concrete', 'path', 'court']);
const LOOSE = new Set(['dirt', 'sand', 'gravel']);

// murmur3's finaliser over each input in turn: neighbouring cells and counters must not correlate,
// or a lawn comes out in rows.
const fmix = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
function hash(x, z, k) { return fmix((x | 0) ^ fmix((z | 0) ^ fmix((k | 0) + 0x9e3779b9))) / 4294967296; }

function tuftGeometry() {
  // Seven tapered blades fanned around the root: base at y=0, unit height, darker at the root.
  // Linear vertex colours matched to the sRGB turf texture (78,108,39): a darker root, a sunlit tip.
  const pos = [], col = [], base = [.07, .13, .025], tip = [.3, .42, .09];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + .4, lean = .22 + (i % 2) * .16, w = .06, h = .75 + (i % 3) * .15;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz * w, pz = cx * w;
    const top = [cx * lean, h, cz * lean];
    pos.push(px, 0, pz, -px, 0, -pz, ...top);
    col.push(...base, ...base, ...tip);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  // Normals straight up, as grass shaders do: a thin blade lit edge-on by an overhead sun goes
  // near-black, while the turf it grows from is lit full. Lit like the ground, tufts read as lawn.
  g.setAttribute('normal', new T.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  return g;
}

function leafGeometry() {
  const shape = new T.Shape();
  shape.moveTo(0, -.5); shape.quadraticCurveTo(.42, -.1, 0, .5); shape.quadraticCurveTo(-.42, -.1, 0, -.5);
  const g = new T.ShapeGeometry(shape, 3); g.rotateX(-Math.PI / 2); return g;
}

function crackGeometry() {
  // A one-metre zigzag strip; instances scale it from hairline to a proper split.
  const pos = [], idx = [];let x = -.5, z = 0;
  for (let i = 0; i <= 8; i++) {
    const w = .012 * (1 - Math.abs(i - 4) / 5);
    pos.push(x, 0, z - w, x, 0, z + w);
    if (i < 8) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    x += .125; z += (i % 2 ? -1 : 1) * .03 + (i === 5 ? .04 : 0);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function stainTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5, r = Math.hypot(dx, dy * 1.25) + hash(x >> 2, y >> 2, 7) * .18;
    const a = Math.max(0, Math.min(1, (1 - r) * 1.6));
    data.set([20, 18, 16, Math.round(a * a * 120)], (y * size + x) * 4);
  }
  const t = new T.DataTexture(data, size, size, T.RGBAFormat); t.needsUpdate = true; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; return t;
}

const pick = (list, n) => list[((n % list.length) + list.length) % list.length];
const LEAF_COLOURS = ['#9a6a2c', '#b5832f', '#7d5a26', '#a24f22', '#8a8a33'].map(c => new T.Color(c));
const PEBBLE_COLOURS = ['#8d877c', '#a39a8a', '#6f6a61', '#b8ab92'].map(c => new T.Color(c));
const FLOWER_COLOURS = ['#f4f1e6', '#f1d64a', '#c98bd8'].map(c => new T.Color(c));

// What one 4 m cell holds. A 4x4 grid of probe rays (one per square metre) reads the ground;
// detail is then scattered inside each probe's metre on the plane through its hit, so density costs
// no extra rays. `density` is grass tufts per square metre for the cell's ring.
export function planCell(cx, cz, raycast, {cell = NEAR_DETAIL.cell, density = NEAR_DETAIL.sparse} = {}) {
  const items = [], x0 = cx * cell, z0 = cz * cell, step = cell / 4;
  let hits = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const px = x0 + (i + .5) * step, pz = z0 + (j + .5) * step, sub = j * 4 + i;
    if (INDOOR.some(b => px >= b[0] && px <= b[2] && pz >= b[1] && pz <= b[3])) continue;
    const h = raycast([px, 300, pz], [0, -1, 0], 340);   // from above Spirit Mountain's summit
    if (!h) continue;
    hits++;
    const n = h.normal ?? [0, 1, 0], s = h.surface;
    if (n[1] < .82 || SKIP.has(s)) continue;
    const wet = bodyAt(px, pz); if (wet && (wet.level ?? 0) > h.point[1]) continue;   // nothing grows under water
    const yAt = (x, z) => h.point[1] - (n[0] * (x - px) + n[2] * (z - pz)) / n[1];
    const scatter = (count, key, make) => {
      for (let k = 0; k < count; k++) {
        const r = hash(cx * 4 + i, cz * 4 + j, key * 97 + k), x = px + (hash(cx, cz, sub * 1000 + key * 61 + k * 2) - .5) * step,
          z = pz + (hash(cx, cz, sub * 1000 + key * 61 + k * 2 + 1) - .5) * step;
        make(x, yAt(x, z), z, r, k);
      }
    };
    const chance = (p, key, make) => { if (hash(cx * 4 + i, cz * 4 + j, key) < p) scatter(1, key, make); };
    if (s === 'grass') {
      scatter(density, 1, (x, y, z, r) => items.push({kind: 'tuft', x, y, z, yaw: r * 6.283, scale: .04 + r * .06, shade: r}));
      chance(.08, 2, (x, y, z, r, k) => items.push({kind: 'flower', x, y: y + .05 + r * .04, z, yaw: 0, scale: .012, colour: pick(FLOWER_COLOURS, cx + cz + sub)}));
      chance(.07, 3, (x, y, z, r) => items.push({kind: 'leaf', x, y: y + .006, z, yaw: r * 6.283, scale: .05 + r * .03, colour: pick(LEAF_COLOURS, sub + cx)}));
    } else if (HARD.has(s)) {
      chance(.3, 4, (x, y, z, r) => items.push({kind: 'pebble', x, y: y + .008, z, yaw: r * 6.283, scale: .016 + r * .022, colour: pick(PEBBLE_COLOURS, sub + cz)}));
      chance(.14, 5, (x, y, z, r) => items.push({kind: 'leaf', x, y: y + .004, z, yaw: r * 6.283, scale: .05 + r * .03, colour: pick(LEAF_COLOURS, sub + cx)}));
      if (s !== 'court') chance(.07, 6, (x, y, z, r) => items.push({kind: 'crack', x, y: y + .004, z, yaw: r * 6.283, scale: .8 + r * 1.6}));
      if (s === 'asphalt') chance(.035, 7, (x, y, z, r) => items.push({kind: 'stain', x, y: y + .005, z, yaw: r * 6.283, scale: .4 + r * .6}));
    } else if (LOOSE.has(s)) {
      scatter(2, 8, (x, y, z, r) => items.push({kind: 'pebble', x, y: y + .01, z, yaw: r * 6.283, scale: .018 + r * .035, colour: pick(PEBBLE_COLOURS, sub + cz)}));
    }
  }
  return {items, hits, density};
}

const densityAt = metres => NEAR_DETAIL.rings.find(([r]) => metres <= r)?.[1] ?? NEAR_DETAIL.sparse;

export function createNearDetail(scene, world, {radius = NEAR_DETAIL.radius, cell = NEAR_DETAIL.cell} = {}) {
  const raycast = (o, d, l) => world.raycast(o, d, l);
  const kinds = {
    tuft: {geometry: tuftGeometry(), material: new T.MeshStandardMaterial({vertexColors: true, side: T.DoubleSide, roughness: .9}), cap: 12000, flat: false},
    flower: {geometry: new T.IcosahedronGeometry(1, 0), material: new T.MeshStandardMaterial({roughness: .7}), cap: 300, flat: false},
    leaf: {geometry: leafGeometry(), material: new T.MeshStandardMaterial({side: T.DoubleSide, roughness: .85}), cap: 900, flat: true},
    pebble: {geometry: new T.IcosahedronGeometry(1, 0), material: new T.MeshStandardMaterial({roughness: .95, flatShading: true}), cap: 3200, flat: false},
    crack: {geometry: crackGeometry(), material: new T.MeshBasicMaterial({color: '#3a3833', transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}), cap: 300, flat: true},
    stain: {geometry: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material: new T.MeshBasicMaterial({map: stainTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}), cap: 120, flat: true},
  };
  const root = new T.Group(); root.name = 'NearDetail'; scene.add(root);
  for (const [name, k] of Object.entries(kinds)) {
    k.mesh = new T.InstancedMesh(k.geometry, k.material, k.cap); k.mesh.name = `near-${name}`;
    k.mesh.count = 0; k.mesh.frustumCulled = false; k.mesh.receiveShadow = true; k.mesh.castShadow = false;
    if (name !== 'tuft' && name !== 'crack' && name !== 'stain') k.mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(k.cap * 3), 3);
    root.add(k.mesh);
  }
  const cells = new Map(), queue = [];let centre = null, dirty = false;
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
  function rebuild() {
    const counts = Object.fromEntries(Object.keys(kinds).map(k => [k, 0]));
    for (const {items} of cells.values()) for (const it of items) {
      const k = kinds[it.kind], i = counts[it.kind]; if (i >= k.cap) continue;
      e.set(k.flat ? 0 : (it.shade ?? 0) * .2 - .1, it.yaw, 0); q.setFromEuler(e); v.set(it.x, it.y, it.z);
      const s = it.scale * (DEBUG_SCALE ?? 1); it.kind === 'pebble' ? sc.set(s, s * .55, s * 1.2) : it.kind === 'crack' ? sc.set(s, 1, s) : sc.set(s, s, s);
      m.compose(v, q, sc); k.mesh.setMatrixAt(i, m);
      if (k.mesh.instanceColor && it.colour) k.mesh.setColorAt(i, it.colour);
      counts[it.kind] = i + 1;
    }
    for (const [name, k] of Object.entries(kinds)) { k.mesh.count = counts[name]; k.mesh.instanceMatrix.needsUpdate = true; if (k.mesh.instanceColor) k.mesh.instanceColor.needsUpdate = true; }
    dirty = false;
  }
  function update(pos) {
    const cx = Math.floor(pos[0] / cell), cz = Math.floor(pos[2] / cell), span = Math.ceil(radius / cell);
    if (!centre || centre[0] !== cx || centre[1] !== cz) {
      centre = [cx, cz]; queue.length = 0;
      for (const key of cells.keys()) { const [x, z] = key.split(',').map(Number); if (Math.hypot(x - cx, z - cz) > span + 1) { cells.delete(key); dirty = true; } }
      for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
        const d = Math.hypot(dx, dz), have = cells.get(`${cx + dx},${cz + dz}`), density = densityAt(d * cell);
        // A cell is re-planned whenever its ring changes, both ways, so the thick lawn follows the car.
        if (d <= span && (!have || have.density !== density)) queue.push([cx + dx, cz + dz, d, density]);
      }
      queue.sort((a, b) => a[2] - b[2]);
    }
    for (let n = 0; n < NEAR_DETAIL.cellsPerFrame && queue.length; n++) {
      const [x, z, , density] = queue.shift(), plan = planCell(x, z, raycast, {cell, density});
      // A tile that has not streamed in yet returns no ground: try that cell again later.
      if (plan.hits) { cells.set(`${x},${z}`, plan); dirty = true; }
    }
    if (dirty) rebuild();
  }
  return {root, update, stats: () => ({cells: cells.size, queued: queue.length, ...Object.fromEntries(Object.entries(kinds).map(([n, k]) => [n, k.mesh.count]))}),
    dispose() { scene.remove(root); for (const k of Object.values(kinds)) { k.mesh.dispose(); k.geometry.dispose(); k.material.map?.dispose(); k.material.dispose(); } }};
}
