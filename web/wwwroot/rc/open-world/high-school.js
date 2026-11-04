import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';
import {
  HS,
  ROOMS,
  WALLS,
  LOCKERS,
  TABLES,
  SHELVES,
  POOL,
  toGame,
  doorSpans,
  solidPieces
} from './high-school.mjs';

// The inside of the high school (layout in high-school.mjs): waxed tile floors, a ceiling of light
// panels, painted block walls, red and blue lockers in long islands, a maple gym with hoops, a
// cafeteria of fold-out tables to drive under, library shelves, and the pool, which you can skim
// across. The outer walls and their door openings are drawn by residential-school.js and
// residential-art.js; this adds everything inside. Unnamed: no sign here says which school it is.
export function buildHighSchool(scene, world, data = {}, options = {}) {
  const building = data.buildings?.find(b => b?.kind === 'school' && b.holes?.length === 1),
    root = new T.Group();
  root.name = 'HighSchoolInside';
  if (!building) {
    scene.add(root);
    return {
      root,
      dispose() {
        root.removeFromParent();
      }
    };
  }
  const clean = r =>
      r.length > 3 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r,
    outer = clean(building.points),
    hole = clean(building.holes[0]);
  const heightAt = options.terrain?.heightAt ?? (() => 0),
    centre = outer.reduce((s, p) => [s[0] + p[0] / outer.length, s[1] + p[1] / outer.length], [0, 0]),
    Y = heightAt(centre[0], centre[1]),
    top = Y + HS.ceiling - 0.03;
  const keep = [],
    buckets = new Map(),
    K = x => (keep.push(x), x);
  const tex = (w, h, draw, rep = [1, 1]) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = K(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...rep);
    t.anisotropy = 4;
    return t;
  };
  const mats = {
    tile: K(
      new T.MeshStandardMaterial({
        map: tex(128, 128, (x, w, h) => {
          x.fillStyle = '#e8e1cf';
          x.fillRect(0, 0, w, h);
          for (const [i, j, c] of [
            [0, 0, '#ddd5c0'],
            [1, 1, '#ddd5c0'],
            [0, 1, '#efe9da']
          ])
            ((x.fillStyle = c), x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62));
          x.fillStyle = '#cfc6b0';
          x.fillRect(0, 0, w, 1);
          x.fillRect(0, 0, 1, h);
          x.fillRect(64, 0, 1, h);
          x.fillRect(0, 64, w, 1);
        }),
        roughness: 0.25
      })
    ),
    maple: K(
      new T.MeshStandardMaterial({
        map: tex(256, 64, (x, w, h) => {
          for (let i = 0; i < 16; i++) {
            x.fillStyle = ['#d8a463', '#cf9a58', '#deae6e', '#d39f5e'][i % 4];
            x.fillRect(0, i * 4, w, 4);
          }
          x.fillStyle = '#b98345';
          for (let i = 0; i < 16; i++) x.fillRect((i * 53) % w, i * 4, 1, 4);
        }),
        roughness: 0.18,
        side: T.DoubleSide
      })
    ),
    carpet: K(new T.MeshStandardMaterial({color: '#3e5f96', roughness: 0.95, side: T.DoubleSide})),
    block: K(new T.MeshStandardMaterial({color: '#efe7d2', roughness: 0.85, side: T.DoubleSide})),
    ceiling: K(
      new T.MeshStandardMaterial({
        color: '#f1eee4',
        emissive: '#d8d2c0',
        emissiveIntensity: 0.55,
        roughness: 0.9,
        side: T.DoubleSide
      })
    ), // lit by its own panels, not the sky
    light: K(new T.MeshStandardMaterial({color: '#fffbef', emissive: '#fff6dc', emissiveIntensity: 1.4})),
    red: K(new T.MeshStandardMaterial({color: '#b8322c', roughness: 0.45, metalness: 0.3})),
    blue: K(new T.MeshStandardMaterial({color: '#2f5fb4', roughness: 0.45, metalness: 0.3})),
    gold: K(new T.MeshStandardMaterial({color: '#e3b341', roughness: 0.4, metalness: 0.4})),
    steel: K(new T.MeshStandardMaterial({color: '#9aa2a6', roughness: 0.35, metalness: 0.7})),
    wood: K(new T.MeshStandardMaterial({color: '#8a5a32', roughness: 0.7})),
    white: K(new T.MeshStandardMaterial({color: '#f6f4ee', roughness: 0.6})),
    line: K(new T.MeshStandardMaterial({color: '#b8322c', roughness: 0.5, side: T.DoubleSide})),
    water: K(
      new T.MeshStandardMaterial({
        color: '#5fd0e6',
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
        map: tex(
          128,
          128,
          (x, w, h) => {
            x.fillStyle = '#7fdcef';
            x.fillRect(0, 0, w, h);
            x.strokeStyle = 'rgba(255,255,255,.35)';
            x.lineWidth = 2;
            for (let i = 0; i < 14; i++) {
              x.beginPath();
              const y = (i * 37) % h;
              x.moveTo(0, y);
              for (let k = 0; k <= 8; k++) x.lineTo(k * 16, y + Math.sin(k + i) * 3);
              x.stroke();
            }
          },
          [6, 3]
        )
      })
    ),
    basin: K(new T.MeshStandardMaterial({color: '#9fe0ee', roughness: 0.4})),
    book: K(
      new T.MeshStandardMaterial({
        map: tex(
          64,
          64,
          (x, w, h) => {
            for (let i = 0; i < 16; i++) {
              x.fillStyle = ['#b8322c', '#2f5fb4', '#3fa34d', '#e3b341', '#7b3fb0', '#e8e1cf'][(i * 7) % 6];
              x.fillRect(i * 4, (i % 3) * 3, 4, h);
            }
            x.fillStyle = '#6b4a2c';
            for (const y of [0, 21, 42, 63]) x.fillRect(0, y, w, 2);
          },
          [3, 1]
        ),
        roughness: 0.8
      })
    )
  };
  const add = (key, g) => {
    if (g.index) {
      const s = g;
      g = g.toNonIndexed();
      s.dispose();
    }
    for (const k of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv)
      g.setAttribute(
        'uv',
        new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)
      );
    (buckets.get(key) ?? buckets.set(key, []).get(key)).push(g);
  };
  const quad = (key, a, b, c, d, uvScale = [1, 1]) => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]) / uvScale[0],
      H = (d[1] - a[1]) / uvScale[1];
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, L, 0, L, H, 0, 0, L, H, 0, H], 2));
    g.computeVertexNormals();
    add(key, g);
  };
  const boxAt = (key, [u, v], w, h, d, y0 = 0, yaw = 0, solid = true) => {
    const [x, z] = toGame([u, v]),
      g = new T.BoxGeometry(w, h, d);
    g.rotateY(yaw);
    g.translate(x, Y + y0 + h / 2, z);
    add(key, g);
    if (solid && !yaw) addBox(world, x, z, w, d, Y + y0, Y + y0 + h);
  };
  const inPoly = (r, [x, z]) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i],
        b = r[j];
      if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const inside = p => inPoly(outer, p) && !inPoly(hole, p);
  // Floor and ceiling over the whole footprint (the courtyard stays open to the sky).
  {
    const faces = T.ShapeUtils.triangulateShape(
        outer.map(p => new T.Vector2(...p)),
        [hole.map(p => new T.Vector2(...p))]
      ),
      pts = [...outer, ...hole],
      fl = [],
      ce = [],
      uv = [];
    for (const f of faces) {
      const tri = f.map(i => pts[i]);
      const cw =
        (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) -
          (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0]) >
        0;
      const t = cw ? [tri[0], tri[2], tri[1]] : tri;
      for (const p of t) {
        fl.push(p[0], Y + 0.06, p[1]);
        uv.push(p[0] / 2.4, p[1] / 2.4);
      }
      world.addTri(...t.map(p => [p[0], Y + 0.06, p[1]]), 'tile');
      /* tile: no outdoor pebbles or cracks scattered on it */ for (const p of [t[0], t[2], t[1]])
        ce.push(p[0], top, p[1]);
    }
    for (const [arr, key] of [
      [fl, 'tile'],
      [ce, 'ceiling']
    ]) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(key === 'tile' ? uv : uv.map(v => v), 2));
      g.computeVertexNormals();
      add(key, g);
    }
  }
  // Light panels in the ceiling every 6 m.
  {
    const g = new T.BoxGeometry(1.2, 0.04, 0.6),
      xs = outer.map(p => p[0]),
      zs = outer.map(p => p[1]),
      m = new T.Matrix4(),
      spots = [];
    for (let x = Math.min(...xs) + 3; x < Math.max(...xs); x += 6)
      for (let z = Math.min(...zs) + 3; z < Math.max(...zs); z += 6) if (inside([x, z])) spots.push([x, z]);
    const lights = new T.InstancedMesh(K(g), mats.light, spots.length);
    spots.forEach(([x, z], i) => lights.setMatrixAt(i, m.makeTranslation(x, top - 0.02, z)));
    root.add(lights);
  }
  // Painted block lining on the inside of the outer walls and the courtyard walls, doors left open.
  const spans = doorSpans([outer, hole]);
  for (const [ri, ring] of [outer, hole].entries()) {
    const area = ring.reduce((s, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return s + p[0] * q[1] - q[0] * p[1];
      }, 0),
      sign = (area > 0 ? 1 : -1) * (ri ? -1 : 1);
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      if (len < 0.05) return;
      const nx = ((-sign * dz) / len) * 0.07,
        nz = ((sign * dx) / len) * 0.07;
      for (const [t0, t1] of solidPieces(spans[ri]?.[i])) {
        const P = (t, y) => [a[0] + dx * t + nx, y, a[1] + dz * t + nz];
        quad('block', P(t0, Y), P(t1, Y), P(t1, top), P(t0, top), [3, 3]);
      }
      for (const [t0, t1] of spans[ri]?.[i] ?? []) {
        const P = (t, y) => [a[0] + dx * t + nx, y, a[1] + dz * t + nz];
        quad('block', P(t0, Y + HS.doorTop), P(t1, Y + HS.doorTop), P(t1, top), P(t0, top), [3, 3]); // lintel
        for (const t of [t0, t1]) {
          const [x, z] = [a[0] + dx * t, a[1] + dz * t],
            g = new T.BoxGeometry(0.16, HS.doorTop, 0.36);
          g.rotateY(-Math.atan2(dz, dx));
          g.translate(x, Y + HS.doorTop / 2, z);
          add('steel', g);
        }
      }
    });
  }
  // Partition walls with their openings, solid both sides.
  for (const w of WALLS) {
    const [ax, az] = toGame(w.a),
      [bx, bz] = toGame(w.b),
      len = Math.hypot(bx - ax, bz - az),
      gaps = w.gaps.map(([p, q]) => [p / len, q / len]);
    for (const [t0, t1] of solidPieces(gaps)) {
      const P = (t, y) => [ax + (bx - ax) * t, y, az + (bz - az) * t],
        q = [P(t0, Y), P(t1, Y), P(t1, top), P(t0, top)];
      quad('block', ...q, [3, 3]);
      world.addQuad(...q, 'concrete');
      world.addQuad(q[1], q[0], q[3], q[2], 'concrete');
    }
    for (const [t0, t1] of gaps) {
      const P = (t, y) => [ax + (bx - ax) * t, y, az + (bz - az) * t];
      quad('block', P(t0, Y + HS.doorTop), P(t1, Y + HS.doorTop), P(t1, top), P(t0, top), [3, 3]);
    }
  }
  // Floors of the rooms over the tile.
  for (const [name, r] of Object.entries(ROOMS)) {
    if (r.floor === 'tile') continue;
    const [u0, u1, v0, v1] = r.box,
      c = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1]
      ].map(p => {
        const [x, z] = toGame(p);
        return [x, Y + 0.065, z];
      });
    quad(r.floor, c[0], c[3], c[2], c[1], r.floor === 'maple' ? [4, 1] : [1, 1]);
    void name;
  }
  // The gym: court lines, a centre circle and hoops at both ends (overhead, so the car rolls under).
  {
    const [u0, u1, v0, v1] = ROOMS.gym.box,
      mid = (v0 + v1) / 2,
      line = (p, q, w = 0.08) => {
        const [ax, az] = toGame(p),
          [bx, bz] = toGame(q),
          l = Math.hypot(bx - ax, bz - az),
          nx = ((-(bz - az) / l) * w) / 2,
          nz = (((bx - ax) / l) * w) / 2;
        quad(
          'line',
          [ax + nx, Y + 0.07, az + nz],
          [ax - nx, Y + 0.07, az - nz],
          [bx - nx, Y + 0.07, bz - nz],
          [bx + nx, Y + 0.07, bz + nz]
        );
      };
    line([u0 + 2, v0 + 2], [u1 - 2, v0 + 2]);
    line([u0 + 2, v1 - 2], [u1 - 2, v1 - 2]);
    line([u0 + 2, v0 + 2], [u0 + 2, v1 - 2]);
    line([u1 - 2, v0 + 2], [u1 - 2, v1 - 2]);
    line([(u0 + u1) / 2, v0 + 2], [(u0 + u1) / 2, v1 - 2]);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2,
        b = ((k + 1) / 24) * Math.PI * 2;
      line(
        [(u0 + u1) / 2 + Math.cos(a) * 1.8, mid + Math.sin(a) * 1.8],
        [(u0 + u1) / 2 + Math.cos(b) * 1.8, mid + Math.sin(b) * 1.8]
      );
    }
    for (const [u, dir] of [
      [u0 + 1.2, 1],
      [u1 - 1.2, -1]
    ]) {
      boxAt('white', [u, mid], 0.05, 1.05, 1.8, 2.45, 0, false);
      boxAt('red', [u + dir * 0.45, mid], 0.9, 0.04, 0.04, 2.6, 0, false);
      const ring = new T.TorusGeometry(0.23, 0.02, 6, 16);
      ring.rotateX(Math.PI / 2);
      const [x, z] = toGame([u + dir * 0.7, mid]);
      ring.translate(x, Y + 2.6, z);
      add('red', ring);
    }
    // Folded bleachers along the north wall: stepped, in the school's blue.
    for (let s = 0; s < 3; s++)
      boxAt('blue', [(u0 + u1) / 2, v1 - 0.6 - s * 0.5], u1 - u0 - 6, 0.45 + s * 0.45, 0.5, 0);
  }
  // Locker islands in the front hall: red and blue, back to back, with gold trim.
  LOCKERS.forEach(([u0, u1, v], i) => {
    boxAt(i % 2 ? 'red' : 'blue', [(u0 + u1) / 2, v], u1 - u0, 1.8, 0.7);
    boxAt('gold', [(u0 + u1) / 2, v], u1 - u0 + 0.04, 0.06, 0.74, 1.8, 0, false);
    for (let u = u0 + 0.5; u < u1; u += 1)
      for (const side of [-1, 1]) boxAt('steel', [u, v + side * 0.36], 0.03, 0.5, 0.01, 1.2, 0, false);
  });
  // Cafeteria tables: tops at 0.74 m on thin legs (drive under; the legs are solid).
  for (const [u, v, len] of TABLES) {
    boxAt('white', [u, v], len, 0.05, 0.76, 0.74, 0, false);
    for (const du of [-len / 2 + 0.3, len / 2 - 0.3])
      for (const dv of [-0.3, 0.3]) boxAt('steel', [u + du, v + dv], 0.05, 0.74, 0.05);
  }
  // Library shelves.
  for (const [u, v0, v1] of SHELVES) boxAt('book', [u, (v0 + v1) / 2], 0.5, 1.6, v1 - v0);
  // The pool: a basin of water in the turned wing that the car skims across, lane ropes, blocks.
  {
    const [cx, cz] = toGame(POOL.at),
      yaw = POOL.yaw,
      c = Math.cos(yaw),
      s = Math.sin(yaw),
      P = (a, b, y) => [cx + a * c + b * s, y, cz - a * s + b * c],
      L = POOL.length / 2,
      W = POOL.width / 2;
    const water = new T.Mesh(K(new T.PlaneGeometry(POOL.length, POOL.width)), mats.water);
    water.rotation.set(-Math.PI / 2, 0, yaw);
    water.position.set(cx, Y + 0.075, cz);
    root.add(water);
    const q = [P(-L, -W, Y + 0.08), P(-L, W, Y + 0.08), P(L, W, Y + 0.08), P(L, -W, Y + 0.08)];
    world.addQuad(q[0], q[1], q[2], q[3], 'water');
    world.addQuad(q[0], q[3], q[2], q[1], 'water');
    quad(
      'white',
      P(-L - 0.3, -W - 0.3, Y + 0.03),
      P(L + 0.3, -W - 0.3, Y + 0.03),
      P(L + 0.3, -W - 0.3, Y + 0.2),
      P(-L - 0.3, -W - 0.3, Y + 0.2)
    );
    for (let k = 1; k < 6; k++) {
      const b = -W + (k * POOL.width) / 6,
        g = new T.CylinderGeometry(0.05, 0.05, POOL.length, 8);
      g.rotateZ(Math.PI / 2);
      g.rotateY(yaw);
      const [x, y, z] = P(0, b, Y + 0.09);
      g.translate(x, y, z);
      add(k % 2 ? 'red' : 'white', g);
    }
    for (let k = 0; k < 6; k++) {
      const b = -W + ((k + 0.5) * POOL.width) / 6,
        g = new T.BoxGeometry(0.5, 0.45, 0.5);
      g.rotateY(yaw);
      const [x, , z] = P(-L - 0.6, b, 0);
      g.translate(x, Y + 0.25, z);
      add('white', g);
    }
    water.userData.scroll = true;
    root.userData.water = water;
  }
  for (const [key, parts] of buckets) {
    const g = K(mergeGeometries(parts, false));
    parts.forEach(p => p.dispose());
    const m = new T.Mesh(g, mats[key]);
    m.receiveShadow = true;
    m.castShadow = key !== 'ceiling' && key !== 'tile';
    root.add(m);
  }
  for (const m of Object.values(mats)) keep.push(m);
  scene.add(root);
  let time = 0;
  return {
    root,
    update(dt) {
      time += dt;
      mats.water.map.offset.set((time * 0.02) % 1, (time * 0.013) % 1);
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      keep.forEach(x => x.dispose?.());
    }
  };
}
