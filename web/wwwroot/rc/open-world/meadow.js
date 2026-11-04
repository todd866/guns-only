import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';
import {MEADOW, createRoundup, stepRoundup} from './meadow.mjs';

// The spring meadow, drawn (rules in meadow.mjs): lush grass round a spring pond, a log ranch house
// with a porch, a windmill pump over a trough, a split-rail corral with its gate open to the
// meadow, a horseshoe pitch, a chuck wagon, and the cattle. Past only; its collision is on the
// 'era-meadow' gate (runtime.js opens it in the present so the golf course has no invisible walls).
export function createMeadow(scene, world, heightAt = () => 0, gate = 'era-meadow') {
  const root = new T.Group();
  root.name = 'SpringMeadow';
  root.visible = false;
  const keep = [],
    K = x => (keep.push(x), x),
    buckets = new Map(),
    Y = (x, z) => heightAt(x, z);
  const solid = {
    addTri: (a, b, c, s) => world.addTri(a, b, c, s, gate),
    addQuad: (a, b, c, d, s) => {
      world.addTri(a, b, c, s, gate);
      world.addTri(a, c, d, s, gate);
    }
  };
  const M = o => K(new T.MeshStandardMaterial({roughness: 0.9, ...o}));
  const mats = {
    lush: M({color: '#5fa83a', polygonOffset: true, polygonOffsetFactor: -2}),
    water: M({
      color: '#4a90b8',
      roughness: 0.12,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -3
    }),
    reed: M({color: '#7a8a3a'}),
    log: M({color: '#8a5a32'}),
    roof: M({color: '#5a3e2a'}),
    rail: M({color: '#a37a4c'}),
    dirt: M({color: '#b8956a', polygonOffset: true, polygonOffsetFactor: -3}),
    iron: M({color: '#4a4f52', metalness: 0.5, roughness: 0.5}),
    canvas: M({color: '#efe6cf'}),
    blade: M({color: '#d8d2c0'})
  };
  const add = (k, g) => {
    if (g.index) {
      const s = g;
      g = g.toNonIndexed();
      s.dispose();
    }
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal'].includes(a)) g.deleteAttribute(a);
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(g);
  };
  const box = (k, x, z, w, h, d, y0 = 0, yaw = 0, collide = false) => {
    const g = new T.BoxGeometry(w, h, d);
    g.rotateY(yaw);
    g.translate(x, Y(x, z) + y0 + h / 2, z);
    add(k, g);
    if (collide) addBox(solid, x, z, w, d, Y(x, z) + y0, Y(x, z) + y0 + h);
  };
  const disc = (k, cx, cz, rx, rz, lift, wob = 0.08, n = 40) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2,
        b = ((i + 1) / n) * Math.PI * 2,
        r1 = 1 + wob * Math.sin(a * 3 + cx),
        r2 = 1 + wob * Math.sin(b * 3 + cx),
        P = (x, z) => [x, Y(x, z) + lift, z];
      p.push(
        ...P(cx, cz),
        ...P(cx + Math.cos(b) * rx * r2, cz + Math.sin(b) * rz * r2),
        ...P(cx + Math.cos(a) * rx * r1, cz + Math.sin(a) * rz * r1)
      );
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    add(k, g);
  };
  // Ground: the green, then the spring pond with reeds round it.
  for (const [x, z, r] of MEADOW.green) disc('lush', x, z, r, r * 0.8, 0.03, 0.15);
  const [sx, sz] = MEADOW.spring.at,
    [rx, rz] = MEADOW.spring.r;
  disc('water', sx, sz, rx, rz, 0.05, 0.1);
  for (let i = 0; i < 28; i++) {
    const a = i * 2.39,
      x = sx + Math.cos(a) * rx * 1.08,
      z = sz + Math.sin(a) * rz * 1.08,
      g = new T.ConeGeometry(0.12, 1 + (i % 3) * 0.3, 5);
    g.translate(x, Y(x, z) + 0.6, z);
    add('reed', g);
  }
  // The ranch house: log walls, a pitched roof, a porch on the meadow side.
  {
    const {
        at: [x, z],
        size: [w, d]
      } = MEADOW.ranch,
      h = 3.2;
    box('log', x, z, w, h, d, 0, 0, true);
    for (const s of [-1, 1]) {
      const g = new T.BoxGeometry(w + 1.2, 0.25, d / 2 + 1.3);
      g.rotateX(s * 0.42);
      g.translate(x, Y(x, z) + h + 1.05, z + (s * (d / 2 + 0.6)) / 2);
      add('roof', g);
    }
    box('rail', x, z - d / 2 - 1.4, w - 2, 0.2, 2.8, 0.3);
    for (const px of [x - w / 2 + 1.5, x + w / 2 - 1.5])
      box('log', px, z - d / 2 - 2.6, 0.25, 2.6, 0.25, 0.3);
    box('roof', x, z - d / 2 - 1.4, w - 1.4, 0.15, 3, 2.9);
    box('roof', x, z - d / 2 - 0.01, 1.4, 2.2, 0.06, 0); // door
  }
  // Windmill pump over the trough.
  {
    const [tx, tz] = MEADOW.trough.at,
      [tw, td] = MEADOW.trough.size;
    box('log', tx, tz, tw, 0.7, td, 0, 0, true);
    disc('water', tx, tz, tw / 2 - 0.15, td / 2 - 0.12, 0.62, 0, 4);
    const wx = tx + 3,
      wz = tz;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ]) {
      const g = new T.CylinderGeometry(0.08, 0.08, 9.2, 6);
      g.rotateZ(dx * 0.08);
      g.rotateX(-dz * 0.08);
      g.translate(wx + dx * 0.6, Y(wx, wz) + 4.6, wz + dz * 0.6);
      add('log', g);
    }
    box('iron', wx, wz, 0.6, 0.6, 0.6, 8.9);
    var windmillAt = [wx, Y(wx, wz) + 9.2, wz - 0.45];
  }
  // The corral: split rails all round, the gate gap on the meadow (-z) side.
  {
    const [x0, z0, x1, z1] = MEADOW.corral.box,
      [g0, g1] = MEADOW.corral.gate;
    const run = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az),
        n = Math.max(1, Math.round(L / 3)),
        yaw = -Math.atan2(bz - az, bx - ax);
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n,
          z = az + ((bz - az) * i) / n;
        box('log', x, z, 0.2, 1.5, 0.2, 0, 0, true);
      }
      for (const y of [0.55, 1.15]) {
        const g = new T.BoxGeometry(L, 0.12, 0.1);
        g.rotateY(yaw);
        g.translate((ax + bx) / 2, Y((ax + bx) / 2, (az + bz) / 2) + y, (az + bz) / 2);
        add('rail', g);
      }
      // Collision: a thin wall along the run (posts alone would let the car through).
      const cx = (ax + bx) / 2,
        cz = (az + bz) / 2,
        horizontal = Math.abs(bz - az) < 0.01;
      addBox(solid, cx, cz, horizontal ? L : 0.2, horizontal ? 0.2 : L, Y(cx, cz), Y(cx, cz) + 1.3, 'wood');
    };
    run(x0, z0, g0, z0);
    run(g1, z0, x1, z0);
    run(x1, z0, x1, z1);
    run(x1, z1, x0, z1);
    run(x0, z1, x0, z0);
    const [px0, pz0, px1, pz1] = MEADOW.pitch.box;
    for (const z of [pz0 + 6, pz1 - 6]) {
      const g = new T.BoxGeometry(3, 0.04, 2.4);
      g.translate((px0 + px1) / 2, Y((px0 + px1) / 2, z) + 0.04, z);
      add('dirt', g);
      box('iron', (px0 + px1) / 2, z, 0.05, 0.4, 0.05, 0.02);
    }
  }
  // The chuck wagon by the house: a box on four wheels under a canvas hoop.
  {
    const [x, z] = [MEADOW.ranch.at[0] - 14, MEADOW.ranch.at[1] - 6];
    box('rail', x, z, 2, 0.9, 3.6, 0.6, 0.3, true);
    const g = new T.CylinderGeometry(1.1, 1.1, 3.4, 12, 1, true, -Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2);
    g.rotateY(0.3);
    g.translate(x, Y(x, z) + 1.5, z);
    add('canvas', g);
    for (const [dx, dz] of [
      [-1, -1.3],
      [1, -1.3],
      [-1, 1.3],
      [1, 1.3]
    ]) {
      const w = new T.TorusGeometry(0.45, 0.05, 6, 14);
      w.rotateY(Math.PI / 2 + 0.3);
      w.translate(
        x + dx * 1.05 * Math.cos(0.3) + dz * Math.sin(0.3),
        Y(x, z) + 0.45,
        z - dx * 1.05 * Math.sin(0.3) + dz * Math.cos(0.3)
      );
      add('log', w);
    }
  }
  for (const [k, parts] of buckets) {
    const g = K(mergeGeometries(parts, false));
    parts.forEach(p => p.dispose());
    const m = new T.Mesh(g, mats[k]);
    m.receiveShadow = true;
    m.castShadow = !['lush', 'water', 'dirt'].includes(k);
    root.add(m);
  }
  // The windmill's wheel turns in the wind.
  const wheel = new T.Group();
  for (let i = 0; i < 12; i++) {
    const b = new T.Mesh(K(new T.BoxGeometry(0.35, 1.4, 0.04)), mats.blade);
    b.position.y = 0.8;
    const arm = new T.Group();
    arm.rotation.z = (i / 12) * Math.PI * 2;
    arm.add(b);
    wheel.add(arm);
  }
  wheel.position.set(...windmillAt);
  root.add(wheel);
  // The cattle: one merged steer shape, instanced, each its own coat.
  const steer = (() => {
    const parts = [],
      b = new T.BoxGeometry(0.9, 0.8, 1.8);
    b.translate(0, 1.1, 0);
    parts.push(b);
    const h = new T.BoxGeometry(0.55, 0.55, 0.7);
    h.translate(0, 1.35, 1.15);
    parts.push(h);
    for (const s of [-1, 1]) {
      const horn = new T.ConeGeometry(0.06, 0.6, 5);
      horn.rotateZ(-s * 1.2);
      horn.translate(s * 0.45, 1.65, 1.05);
      parts.push(horn);
      for (const z of [-0.65, 0.65]) {
        const l = new T.BoxGeometry(0.18, 0.75, 0.18);
        l.translate(s * 0.3, 0.37, z);
        parts.push(l);
      }
    }
    const g = mergeGeometries(
      parts.map(p => p.toNonIndexed()),
      false
    );
    parts.forEach(p => p.dispose());
    return K(g);
  })();
  const coats = ['#6b4226', '#2a2422', '#f2efe6', '#8a5a32', '#b5652e', '#3a2a22', '#e8dcc0', '#5a3a28'];
  const herd = new T.InstancedMesh(steer, K(new T.MeshStandardMaterial({roughness: 0.8})), MEADOW.herd),
    c = new T.Color();
  coats.slice(0, MEADOW.herd).forEach((col, i) => herd.setColorAt(i, c.set(col)));
  herd.castShadow = true;
  root.add(herd);
  scene.add(root);
  const round = createRoundup(),
    m4 = new T.Matrix4(),
    q = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0),
    one = new T.Vector3(1, 1, 1);
  let time = 0;
  const sync = () => {
    round.steers.forEach((s, i) => {
      const bob = Math.abs(Math.sin(time * 6 + i)) * 0.04;
      m4.compose(
        new T.Vector3(s.pos[0], Y(s.pos[0], s.pos[1]) + bob, s.pos[1]),
        q.setFromAxisAngle(up, s.yaw),
        one
      );
      herd.setMatrixAt(i, m4);
    });
    herd.instanceMatrix.needsUpdate = true;
  };
  sync();
  return {
    root,
    round,
    /** One frame: show only in the past; steer the cattle; returns roundup events. */
    step(dt, player, past) {
      root.visible = past;
      if (!past) return [];
      time += dt;
      wheel.rotation.z += dt * 1.6;
      const ev = stepRoundup(
        round,
        player && Math.hypot(player[0] - sx, player[1] - sz) < 220 ? player : null,
        dt
      );
      sync();
      return ev;
    },
    dispose() {
      root.removeFromParent();
      keep.forEach(x => x.dispose?.());
    }
  };
}
