import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';
import {HOLES, CLUB, holeLine} from './country-club.mjs';
import {GOLF_HOLES, MINI} from './golf.mjs';

// Sunrise Vista Country Club, drawn (layout and rules in country-club.mjs): mown fairways with
// stripes, greens with a fringe, sand bunkers, ponds, tee boxes, a numbered flag on every green,
// a sign at every tee; the clubhouse; two tennis courts; the minigolf (six felt lanes with brick
// edges, a windmill and a lighthouse). Merged by material (about a dozen draws) and hidden when far.
export function createCountryClub(scene, world, heightAt = () => 0) {
  const root = new T.Group();
  root.name = 'CountryClub';
  const keep = [],
    K = x => (keep.push(x), x),
    buckets = new Map(),
    Y = (x, z) => heightAt(x, z);
  const tex = (w, h, draw, rep) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = K(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    if (rep) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
    }
    t.anisotropy = 4;
    return t;
  };
  const stripes = tex(
    64,
    64,
    x => {
      x.fillStyle = '#4fb83c';
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = '#3e9a2f';
      x.fillRect(0, 0, 64, 32);
    },
    true
  );
  const M = o =>
    K(new T.MeshStandardMaterial({roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, ...o}));
  const mats = {
    fairway: M({map: stripes}),
    green: M({color: '#6fdc4e', roughness: 0.6}),
    fringe: M({color: '#3f9a34'}),
    sand: M({color: '#e8d6a4'}),
    water: M({color: '#3d8fb8', roughness: 0.15, metalness: 0.1}),
    tee: M({color: '#5a9a3e'}),
    white: M({color: '#f4f2ea', polygonOffset: false}),
    red: M({color: '#d8322b', polygonOffset: false}),
    wood: M({color: '#8a5a32', polygonOffset: false}),
    roof: M({color: '#2f5a3c', polygonOffset: false}),
    glass: M({color: '#36505d', roughness: 0.2, polygonOffset: false}),
    court: M({color: '#2f6f8f'}),
    courtOut: M({color: '#4d8a5a'}),
    line: M({color: '#ffffff', polygonOffsetFactor: -4}),
    felt: M({color: '#3aa45a'}),
    brick: M({color: '#a8553a', polygonOffset: false}),
    dark: M({color: '#1e2622', polygonOffsetFactor: -5}),
    fence: M({color: '#3b4544', polygonOffset: false})
  };
  const add = (k, g) => {
    if (g.index) {
      const s = g;
      g = g.toNonIndexed();
      s.dispose();
    }
    for (const a of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv)
      g.setAttribute(
        'uv',
        new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)
      );
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(g);
  };
  // Solid ground the car drives on (and near-detail skips): each triangle turned to face up.
  const solidUp = (p, surface) => {
    for (let q = 0; q < p.length; q += 9) {
      const a = [p[q], p[q + 1], p[q + 2]],
        b = [p[q + 3], p[q + 4], p[q + 5]],
        c = [p[q + 6], p[q + 7], p[q + 8]],
        ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (ny >= 0) world.addTri(a, b, c, surface);
      else world.addTri(a, c, b, surface);
    }
  };
  const tris = (k, pts, uvs) => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs ?? new Array((pts.length / 3) * 2).fill(0), 2));
    g.computeVertexNormals();
    add(k, g);
  };
  // A flat shape on the ground: a fan of points (each lifted onto the terrain).
  const disc = (k, cx, cz, rx, rz, lift, n = 36, wob = 0, solid = null) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2,
        b = ((i + 1) / n) * Math.PI * 2,
        r1 = 1 + wob * Math.sin(a * 3 + cx),
        r2 = 1 + wob * Math.sin(b * 3 + cx);
      const P = (x, z) => [x, Y(x, z) + lift, z];
      p.push(
        ...P(cx, cz),
        ...P(cx + Math.cos(b) * rx * r2, cz + Math.sin(b) * rz * r2),
        ...P(cx + Math.cos(a) * rx * r1, cz + Math.sin(a) * rz * r1)
      );
    }
    tris(k, p);
    if (solid) solidUp(p, solid);
  };
  const box = (k, x, z, w, h, d, y0 = 0, yaw = 0, solid = false) => {
    const g = new T.BoxGeometry(w, h, d);
    g.rotateY(yaw);
    g.translate(x, Y(x, z) + y0 + h / 2, z);
    add(k, g);
    if (solid && !yaw) addBox(world, x, z, w, d, Y(x, z) + y0, Y(x, z) + y0 + h);
  };
  const rect = (k, x0, z0, x1, z1, lift) => {
    const P = (x, z) => [x, Y(x, z) + lift, z];
    tris(k, [...P(x0, z0), ...P(x0, z1), ...P(x1, z1), ...P(x0, z0), ...P(x1, z1), ...P(x1, z0)]);
  };
  const sign = (text, sub, x, z, yaw, w = 1.6) => {
    const t = tex(256, 128, (c, W, H) => {
      c.fillStyle = '#2f5a3c';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#e3d39a';
      c.lineWidth = 6;
      c.strokeRect(4, 4, W - 8, H - 8);
      c.fillStyle = '#f4efd8';
      c.textAlign = 'center';
      c.font = '900 56px system-ui';
      c.fillText(text, W / 2, 62, W - 20);
      c.font = '600 28px system-ui';
      c.fillText(sub, W / 2, 104);
    });
    const m = new T.Mesh(
      K(new T.PlaneGeometry(w, w / 2)),
      K(new T.MeshStandardMaterial({map: t, roughness: 0.6, side: T.DoubleSide}))
    );
    m.position.set(x, Y(x, z) + 1.1, z);
    m.rotation.y = yaw;
    root.add(m);
    box('wood', x, z, 0.08, 0.85, 0.08);
  };
  // The course.
  for (const h of HOLES) {
    const line = holeLine(h);
    let run = 0;
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1],
        [bx, bz] = line[i],
        L = Math.hypot(bx - ax, bz - az),
        n = Math.ceil(L / 3),
        nx = (-(bz - az) / L) * CLUB.fairway,
        nz = ((bx - ax) / L) * CLUB.fairway,
        p = [],
        uv = [];
      for (let j = 0; j < n; j++) {
        const t0 = j / n,
          t1 = (j + 1) / n,
          P = (t, s) => {
            const x = ax + (bx - ax) * t + nx * s,
              z = az + (bz - az) * t + nz * s;
            return [x, Y(x, z) + 0.035, z];
          },
          u0 = (run + L * t0) / 8,
          u1 = (run + L * t1) / 8;
        p.push(...P(t0, -1), ...P(t0, 1), ...P(t1, 1), ...P(t0, -1), ...P(t1, 1), ...P(t1, -1));
        uv.push(0, u0, 1, u0, 1, u1, 0, u0, 1, u1, 0, u1);
      }
      tris('fairway', p, uv);
      solidUp(p, 'turf');
      run += L;
    }
    disc('fringe', h.green[0], h.green[1], CLUB.green + 1.6, CLUB.green + 1.6, 0.04, 36, 0, 'turf');
    disc('green', h.green[0], h.green[1], CLUB.green, CLUB.green, 0.05, 36, 0, 'turf');
    disc('dark', h.green[0], h.green[1], CLUB.cup, CLUB.cup, 0.06, 16);
    for (const [x, z, r] of h.bunkers) disc('sand', x, z, r, r * 0.8, 0.055, 24, 0.12);
    for (const [x, z, rx, rz] of h.water) disc('water', x, z, rx, rz, 0.02, 32, 0.06);
    // Tee box, a sign beside it, the flag on the green.
    const yaw = Math.atan2(line[1][0] - h.tee[0], line[1][1] - h.tee[1]);
    {
      const g = new T.BoxGeometry(CLUB.tee[0], 0.12, CLUB.tee[1]);
      g.rotateY(yaw + Math.PI / 2);
      g.translate(h.tee[0], Y(h.tee[0], h.tee[1]) + 0.06, h.tee[1]);
      add('tee', g);
    }
    for (const s of [-1, 1]) {
      const g = new T.SphereGeometry(0.12, 10, 8);
      g.translate(
        h.tee[0] + Math.cos(yaw) * s * 1.8,
        Y(h.tee[0], h.tee[1]) + 0.2,
        h.tee[1] - Math.sin(yaw) * s * 1.8
      );
      add(s > 0 ? 'red' : 'white', g);
    }
    sign(
      String(h.n),
      `PAR ${h.par}`,
      h.tee[0] + Math.cos(yaw) * 4.5,
      h.tee[1] - Math.sin(yaw) * 4.5,
      yaw + Math.PI,
      1.3
    );
    const [gx, gz] = h.green,
      gy = Y(gx, gz);
    {
      const g = new T.CylinderGeometry(0.04, 0.04, 2.4, 8);
      g.translate(gx, gy + 1.2, gz);
      add('white', g);
      const f = new T.BoxGeometry(0.9, 0.55, 0.03);
      f.translate(gx + 0.45, gy + 2.1, gz);
      add('red', f);
    }
  }
  // The clubhouse: a long low building with a deep green roof, glass across the front, a sign.
  {
    const [cx, cz] = CLUB.clubhouse.at,
      [w, d] = CLUB.clubhouse.size;
    box('white', cx, cz, w, 4.2, d, 0, 0, true);
    box('roof', cx, cz, w + 2.4, 0.5, d + 2.4, 4.2);
    box('roof', cx, cz, w - 6, 1.2, d - 4, 4.7);
    for (const s of [-1, 1]) box('glass', cx, cz + s * (d / 2 + 0.01), w - 4, 2.2, 0.05, 0.9);
    for (let x = cx - w / 2 + 3; x <= cx + w / 2 - 3; x += 4)
      box('white', x, cz + d / 2 + 1.6, 0.3, 4.2, 0.3);
    sign('CLUBHOUSE', 'SUNRISE VISTA', cx, cz + d / 2 + 3.4, 0, 3.2);
  }
  // Tennis: two courts side by side, lines, nets, a fence with openings on the near side.
  {
    const [x0, z0, x1, z1] = CLUB.tennis.box;
    rect('courtOut', x0, z0, x1, z1, 0.03);
    for (const c of [0, 1]) {
      const cw = (x1 - x0) / 2,
        cx = x0 + cw * (c + 0.5),
        cz = (z0 + z1) / 2,
        W = 10.97 / 2,
        L = 23.77 / 2;
      rect('court', cx - W - 1, cz - L - 1, cx + W + 1, cz + L + 1, 0.035);
      const ln = (ax, az, bx, bz) => {
        const t = 0.07;
        rect(
          'line',
          Math.min(ax, bx) - t,
          Math.min(az, bz) - t,
          Math.max(ax, bx) + t,
          Math.max(az, bz) + t,
          0.04
        );
      };
      ln(cx - W, cz - L, cx + W, cz - L);
      ln(cx - W, cz + L, cx + W, cz + L);
      ln(cx - W, cz - L, cx - W, cz + L);
      ln(cx + W, cz - L, cx + W, cz + L);
      ln(cx - 4.11, cz - L, cx - 4.11, cz + L);
      ln(cx + 4.11, cz - L, cx + 4.11, cz + L);
      ln(cx - 4.11, cz - 6.4, cx + 4.11, cz - 6.4);
      ln(cx - 4.11, cz + 6.4, cx + 4.11, cz + 6.4);
      ln(cx, cz - 6.4, cx, cz + 6.4);
      box('white', cx, cz, W * 2 + 1, 0.12, 0.04, 0.95);
      box('dark', cx, cz, W * 2 + 1, 0.85, 0.02, 0.1);
      for (const s of [-1, 1]) box('fence', cx + s * (W + 0.6), cz, 0.08, 1.07, 0.08, 0, 0, true);
    }
    for (let x = x0; x <= x1; x += 3)
      for (const z of [z0, z1])
        if (z === z0 || Math.abs(x - (x0 + x1) / 2) > 6) box('fence', x, z, 0.06, 3, 0.06, 0, 0, true);
    for (let z = z0; z <= z1; z += 3) for (const x of [x0, x1]) box('fence', x, z, 0.06, 3, 0.06, 0, 0, true);
    sign('TENNIS', '2 COURTS', (x0 + x1) / 2, z1 + 2.2, 0, 1.8);
  }
  // Minigolf: felt lanes edged with brick, a windmill and a lighthouse between the lanes.
  {
    const [x0, z0, x1, z1] = CLUB.minigolf.box;
    rect('courtOut', x0, z0, x1, z1, 0.025);
    for (const h of GOLF_HOLES) {
      const [tx, tz] = h.tee,
        [cx, cz] = h.cup,
        w = MINI.lane;
      rect('felt', tx - w, Math.min(tz, cz) - 2, tx + w, Math.max(tz, cz) + 2, 0.04);
      for (const s of [-1, 1])
        box('brick', tx + s * (w + 0.15), (tz + cz) / 2, 0.3, 0.35, Math.abs(tz - cz) + 4.3);
      box('brick', tx, Math.min(tz, cz) - 2.15, w * 2 + 0.6, 0.35, 0.3);
    }
    const mid = GOLF_HOLES[2].tee[0] + MINI.gap / 2;
    box('brick', mid, (z0 + z1) / 2, 3, 4, 3);
    box('red', mid, (z0 + z1) / 2, 3.6, 1.8, 3.6, 4);
    const lh = GOLF_HOLES[4].tee[0] + MINI.gap / 2;
    {
      const g = new T.CylinderGeometry(0.9, 1.3, 6, 16);
      g.translate(lh, Y(lh, z0 + 8) + 3, z0 + 8);
      add('white', g);
      const r = new T.CylinderGeometry(1, 1, 0.9, 16);
      r.translate(lh, Y(lh, z0 + 8) + 6.4, z0 + 8);
      add('red', r);
    }
    sign('MINIGOLF', 'DRIVE THE BALL IN', (x0 + x1) / 2, z1 + 2.2, 0, 2);
  }
  for (const [k, parts] of buckets) {
    const g = K(mergeGeometries(parts, false));
    parts.forEach(p => p.dispose());
    const m = new T.Mesh(g, mats[k]);
    m.receiveShadow = true;
    m.castShadow = ['white', 'roof', 'brick', 'wood', 'red'].includes(k);
    root.add(m);
  }
  for (const m of Object.values(mats)) keep.push(m);
  // The windmill's sails turn.
  const sails = new T.Group(),
    mid = GOLF_HOLES[2].tee[0] + MINI.gap / 2,
    mz = (CLUB.minigolf.box[1] + CLUB.minigolf.box[3]) / 2;
  for (let i = 0; i < 4; i++) {
    const s = new T.Mesh(K(new T.BoxGeometry(0.4, 3.2, 0.06)), mats.white);
    s.position.y = 1.6;
    const arm = new T.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    arm.add(s);
    sails.add(arm);
  }
  sails.position.set(mid, Y(mid, mz) + 3.2, mz + 1.6);
  root.add(sails);
  scene.add(root);
  const centre = [-280, 2800];
  return {
    root,
    update(dt, pos) {
      sails.rotation.z += dt * 1.2;
      root.visible = !pos || Math.hypot(pos[0] - centre[0], pos[2] - centre[1]) < 900;
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      keep.forEach(x => x.dispose?.());
    }
  };
}
