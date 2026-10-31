import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';
import {BATTLE_ARENAS} from './battle-arenas.mjs';
export function buildBattleArenas(scene, world) {
  const root = new T.Group();
  root.name = 'MK64BattleArenas';
  scene.add(root);
  const mats = new Map(),
    meshes = [];
  const mat = c => {
    if (!mats.has(c)) mats.set(c, new T.MeshStandardMaterial({color: c, roughness: 0.72}));
    return mats.get(c);
  };
  const mesh = (geo, c, name) => {
    const m = new T.Mesh(geo, mat(c));
    m.name = name;
    root.add(m);
    meshes.push(m);
    return m;
  };
  const slab = (x, z, w, d, y, c = '#7b8b99', surface = 'concrete') => {
    const m = mesh(new T.BoxGeometry(w, 0.18, d), c, 'ArenaDeck');
    m.position.set(x, y - 0.09, z);
    addBox(world, x, z, w, d, y - 0.18, y, surface);
  };
  const ramp = (x, z, X, Z, w, y, Y, c = '#d4bd83') => {
    const dx = X - x,
      dz = Z - z,
      n = Math.hypot(dx, dz),
      nx = ((-dz / n) * w) / 2,
      nz = ((dx / n) * w) / 2,
      A = [x + nx, y, z + nz],
      B = [X + nx, Y, Z + nz],
      C = [X - nx, Y, Z - nz],
      D = [x - nx, y, z - nz];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D], 3));
    g.computeVertexNormals();
    const m = mesh(g, c, 'ArenaRamp');
    m.userData.route = {from: [x, y, z], to: [X, Y, Z], width: w};
    world.addQuad(A, B, C, D, 'wood');
  };
  const ringDeck = (x, z, w, d, hole, y, c) => {
    slab(x - (w + hole) / 4, z, (w - hole) / 2, d, y, c);
    slab(x + (w + hole) / 4, z, (w - hole) / 2, d, y, c);
    slab(x, z - (d + hole) / 4, hole, (d - hole) / 2, y, c);
    slab(x, z + (d + hole) / 4, hole, (d - hole) / 2, y, c);
  };
  {
    const [x, z] = BATTLE_ARENAS[0].center;
    const ring = mesh(new T.RingGeometry(15, 40, 64), '#53646c', 'FuelRing');
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.025, z);
    slab(x, z, 20, 20, 0.7, '#d8ac51', 'metal');
    for (const dx of [-5, 5]) {
      const tank = mesh(new T.CylinderGeometry(3.5, 3.5, 5, 24), '#cbd0bd', 'FuelTank');
      tank.position.set(x + dx, 3.2, z);
      addBox(world, x + dx, z, 6, 6, 0.7, 5.7, 'metal');
    }
  }
  {
    const [x, z] = BATTLE_ARENAS[1].center;
    const colors = ['#df5d53', '#558bd5', '#e3bf4b', '#6bb77a'];
    let i = 0;
    for (const dx of [-16, 16])
      for (const dz of [-16, 16]) {
        const c = colors[i++];
        for (const y of [3, 6]) slab(x + dx, z + dz, 16, 16, y, c, 'wood');
        for (const sx of [-6, 6])
          for (const sz of [-6, 6]) {
            const m = mesh(new T.BoxGeometry(0.35, 6, 0.35), '#806449', 'FortSupport');
            m.position.set(x + dx + sx, 3, z + dz + sz);
            addBox(world, x + dx + sx, z + dz + sz, 0.35, 0.35, 0, 6, 'wood');
          }
      }
    // Two bridges on every tier connect all four keeps; wide ground alleys stay open.
    for (const y of [3, 6]) {
      for (const dz of [-16, 16]) slab(x, z + dz, 16, 5, y, '#b99b6b', 'wood');
      for (const dx of [-16, 16]) slab(x + dx, z, 5, 16, y, '#b99b6b', 'wood');
    }
    ramp(x - 42, z - 16, x - 24, z - 16, 6, 0, 3);
    ramp(x + 42, z + 16, x + 24, z + 16, 6, 0, 3);
    // The roof ramp starts on a connected lower-tier approach outside the upper footprint.
    // The lower ramp terminates at the west edge of the first landing. Keep the landing
    // clear of that approach, then overlap it with the second slab so the upper ramp has
    // a continuous deck-to-deck connection rather than a hidden 3 m step.
    slab(x - 16, z - 29, 12, 24, 3, '#df5d53', 'wood');
    slab(x - 22, z - 42, 20, 6, 3, '#df5d53', 'wood');
    ramp(x - 16, z - 42, x - 16, z - 24, 5, 3, 6);
  }
  {
    const [x, z] = BATTLE_ARENAS[2].center;
    for (const y of [0, 3.5, 7]) ringDeck(x, z, 72, 52, 14, y, '#a0abb2');
    ramp(x - 56, z - 18, x - 36, z - 18, 7, 0, 3.5);
    slab(x + 46, z, 20, 7, 3.5);
    slab(x + 56, z + 9, 7, 25, 3.5);
    ramp(x + 56, z + 18, x + 36, z + 18, 7, 3.5, 7);
  }
  {
    const [x, z] = BATTLE_ARENAS[3].center;
    ringDeck(x, z, 60, 50, 14, 5.5, '#8298a6');
    ramp(x - 52, z, x - 30, z, 8, 0, 5.5);
  }
  // Retain explicit ramp metadata for route validation, batch the rest by material.
  root.updateMatrixWorld(true);
  const batches = new Map();
  for (const m of meshes) {
    if (m.name === 'ArenaRamp') continue;
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (g.index) {
      const n = g.toNonIndexed();
      g.dispose();
      g = n;
    }
    for (const a of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    const key = m.material;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(g);
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const [material, gs] of batches) {
    const geometry = mergeGeometries(gs);
    gs.forEach(g => g.dispose());
    const m = new T.Mesh(geometry, material);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  return {
    root,
    arenas: BATTLE_ARENAS,
    update() {},
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      mats.forEach(m => m.dispose());
    }
  };
}
