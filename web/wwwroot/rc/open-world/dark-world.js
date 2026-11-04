import * as T from '../../vendor/three.module.js';
import {TIME_GATES, GATE_RADIUS, gateAwake} from './dark-world.mjs';
import {valleyPoint, TOWN, MOUNTAIN} from './spirit-mountain.mjs';
import {NEST} from './herd.mjs';

// The dark world, drawn (rules: dark-world.mjs). Two things:
// - the time gates: a ring of stones round a turning amber swirl when awake, plain stone asleep
//   (visible long before it works, the design rule), each only in its own era;
// - the Lake Town in the past: the drowned town's houses, dry and alive, given painted false
//   fronts, boardwalks, hitching rails, lamps, a water tower, a covered wagon and a corral of toy
//   cattle. The spirit-mountain view drops the dam and the lake (setPast).
export function createDarkWorld(scene, ground = () => 0) {
  const root = new T.Group();
  root.name = 'DarkWorld';
  scene.add(root);
  const materials = new Set(),
    textures = new Set();
  const mat = (color, o = {}) => {
    const m = new T.MeshStandardMaterial({color, roughness: 0.8, ...o});
    materials.add(m);
    return m;
  };

  // The swirl: a canvas spiral, additive, turned every frame.
  const swirl = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,240,190,1)');
    grad.addColorStop(0.55, 'rgba(240,160,60,.75)');
    grad.addColorStop(1, 'rgba(120,50,20,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,250,225,.8)';
    x.lineWidth = 5;
    for (let arm = 0; arm < 3; arm++) {
      x.beginPath();
      for (let t = 0; t < 1; t += 0.01) {
        const a = arm * 2.094 + t * 7,
          r = 8 + t * 112;
        x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      }
      x.stroke();
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    textures.add(t);
    return t;
  })();
  const swirlMat = new T.MeshBasicMaterial({
    map: swirl,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide
  });
  materials.add(swirlMat);
  const stone = mat('#8a7a66', {roughness: 0.95}),
    stoneAsleep = mat('#6a6258', {roughness: 1}),
    glow = mat('#ffcf7a', {emissive: '#ff9a2a', emissiveIntensity: 1.6});

  const gates = TIME_GATES.map(g => {
    const group = new T.Group();
    group.name = `TimeGate_${g.id}`;
    root.add(group);
    const y = ground(g.at[0], g.at[1]);
    group.position.set(g.at[0], y, g.at[1]);
    // Face the place people arrive from, so you see the swirl as you come.
    const from = TIME_GATES.filter(o => o.to.era === g.era)
      .map(o => o.to.at)
      .sort(
        (a, b) => Math.hypot(a[0] - g.at[0], a[1] - g.at[1]) - Math.hypot(b[0] - g.at[0], b[1] - g.at[1])
      )[0] ?? [g.at[0], g.at[1] - 1];
    group.rotation.y = Math.atan2(from[0] - g.at[0], from[1] - g.at[1]);
    const stones = [];
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (i / 12),
        s = new T.Mesh(new T.DodecahedronGeometry(0.42 + (i % 3) * 0.08, 0), stone);
      s.position.set(Math.cos(a) * GATE_RADIUS, Math.sin(a) * GATE_RADIUS + 0.1, 0);
      s.rotation.set(i, i * 0.7, 0);
      s.castShadow = true;
      group.add(s);
      stones.push(s);
    }
    for (const x of [-1, 1]) {
      const foot = new T.Mesh(new T.DodecahedronGeometry(0.6, 0), stone);
      foot.position.set(x * GATE_RADIUS, 0.2, 0);
      group.add(foot);
      stones.push(foot);
    }
    const disc = new T.Mesh(new T.CircleGeometry(GATE_RADIUS - 0.25, 40), swirlMat);
    disc.position.y = GATE_RADIUS * 0.55;
    disc.scale.y = 1.05;
    group.add(disc);
    const lights = [];
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), glow);
      m.userData.phase = i;
      group.add(m);
      lights.push(m);
    }
    return {gate: g, group, stones, disc, lights};
  });

  // The Lake Town, in the past. Pieces are boxes in the valley frame, turned to its axis.
  // The quetzalcoatlus nest (herd.mjs NEST): a big ring of twigs and three speckled eggs on the shelf
  // of the mountain road's high hairpin, seen from the Lake Town in the past.
  const nest = new T.Group();
  nest.name = 'QuetzalNest';
  nest.visible = false;
  nest.position.set(NEST[0], ground(NEST[0], NEST[2]), NEST[2]);
  root.add(nest);
  {
    const twig = mat('#6b4a2a', {roughness: 1}),
      straw = mat('#c9a35a', {roughness: 1}),
      egg = mat('#efe6cf', {roughness: 0.6});
    const ring = new T.Mesh(new T.TorusGeometry(2.2, 0.55, 8, 28), twig);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    ring.castShadow = ring.receiveShadow = true;
    nest.add(ring);
    const bed = new T.Mesh(new T.CylinderGeometry(2.0, 2.2, 0.35, 24), straw);
    bed.position.y = 0.18;
    nest.add(bed);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2,
        st = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.8, 5), twig);
      st.position.set(Math.cos(a) * 2.5, 0.55, Math.sin(a) * 2.5);
      st.rotation.set(0.9, a, 0.4);
      nest.add(st);
    }
    for (const [x, z] of [
      [0.5, 0.3],
      [-0.4, 0.5],
      [0.1, -0.5]
    ]) {
      const e = new T.Mesh(new T.SphereGeometry(0.32, 14, 10), egg);
      e.scale.y = 1.3;
      e.position.set(x, 0.62, z);
      e.castShadow = true;
      nest.add(e);
    }
  }
  const town = new T.Group();
  town.name = 'LakeTownPast';
  town.visible = false;
  root.add(town);
  const yaw = (() => {
    const a = valleyPoint(0, 0),
      b = valleyPoint(0, 1);
    return Math.atan2(b[0] - a[0], b[2] - a[2]);
  })();
  const floor = MOUNTAIN.lake.floor;
  const piece = (w, h, d, al, ac, y, m, geo = null) => {
    const o = new T.Mesh(geo ?? new T.BoxGeometry(w, h, d), m);
    o.position.set(...valleyPoint(al, ac, y));
    o.rotation.y = yaw;
    o.castShadow = o.receiveShadow = true;
    town.add(o);
    return o;
  };
  const sign = text => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#efe2c0';
    x.fillRect(0, 0, 512, 96);
    x.strokeStyle = '#5a3a20';
    x.lineWidth = 8;
    x.strokeRect(4, 4, 504, 88);
    x.fillStyle = '#5a2a18';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    // Shrink long words to fit rather than clip them (PANADERÍA with its picture).
    let size = 58;
    do x.font = `bold ${size}px Georgia, serif`;
    while (x.measureText(text).width > 480 && (size -= 2) > 24);
    x.fillText(text, 256, 52);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    textures.add(t);
    return mat('#ffffff', {map: t, roughness: 0.7});
  };
  const paints = ['#c9573a', '#d9a441', '#5d8a8c', '#e7d6b0', '#8e5a8a', '#6f8f4e'].map(c =>
    mat(c, {roughness: 0.7})
  );
  const wood = mat('#7b5434'),
    darkWood = mat('#4a3020'),
    lamp = mat('#ffe2a0', {emissive: '#ffb347', emissiveIntensity: 2}),
    canvas = mat('#f1ead6'),
    window = mat('#ffd98a', {emissive: '#e8a040', emissiveIntensity: 0.9});
  // The old Southwest spoke Spanish first (design doc: a first taste of Spanish), so the town's
  // signs do too: one word each, with a picture beside it so a six-year-old can read it.
  const names = [
    '🥤 CANTINA',
    '🛏️ HOTEL',
    '💰 BANCO',
    '💈 BARBERÍA',
    '⭐ SHERIFF',
    '🍞 PANADERÍA',
    '🧸 JUGUETES',
    '✉️ CORREOS'
  ];
  TOWN.forEach(([a0, a1, c0, c1, h], i) => {
    if (h > 10) return; // the steeple
    const store = i === 8,
      church = i === 9,
      street = Math.abs(c0) < Math.abs(c1) ? c0 : c1,
      s = Math.sign(street),
      al = (a0 + a1) / 2,
      w = a1 - a0;
    if (church) {
      piece(w * 0.9, 0.5, 0.5, al, street + s * -0.3, floor + h + 0.3, paints[3]);
      return;
    }
    // The false front: a tall painted board on the street side, its sign on top.
    const front = h + 1.6,
      m = paints[i % paints.length];
    piece(w + 0.2, front, 0.3, al, street - s * 0.2, floor + front / 2, m);
    piece(
      w * 0.7,
      1.1,
      0.05,
      al,
      street - s * 0.38,
      floor + front - 0.75,
      sign(store ? '🛒 TIENDA' : names[i % names.length])
    );
    for (let x = a0 + 1.6; x < a1 - 1; x += 3)
      if (Math.abs(x - al) > 1.2) piece(1, 1, 0.05, x, street - s * 0.37, floor + 1.7, window);
    piece(1.2, 2.1, 0.05, al, street - s * 0.37, floor + 1.05, darkWood);
    // Boardwalk with a porch roof on posts.
    piece(w, 0.14, 2.4, al, street - s * 1.5, floor + 0.07, wood);
    piece(w, 0.1, 2.6, al, street - s * 1.6, floor + 2.6, darkWood);
    for (const x of [a0 + 0.3, a1 - 0.3]) piece(0.15, 2.6, 0.15, x, street - s * 2.6, floor + 1.3, wood);
  });
  // Hitching rails and oil lamps down the main street.
  for (const s of [-1, 1])
    for (let a = 545; a <= 615; a += 14) {
      for (const d of [-1.2, 1.2]) piece(0.12, 0.9, 0.12, a + d, s * 8.6, floor + 0.45, wood);
      piece(2.6, 0.1, 0.1, a, s * 8.6, floor + 0.85, wood);
      piece(0.12, 2.8, 0.12, a + 6, s * 7.6, floor + 1.4, darkWood);
      piece(0.35, 0.4, 0.35, a + 6, s * 7.6, floor + 2.9, lamp);
    }
  // A water tower on legs, a covered wagon and a corral of toy cattle at the top of the street.
  {
    const al = 548,
      ac = 32,
      y = floor;
    for (const [da, dc] of [
      [-1.5, -1.5],
      [1.5, -1.5],
      [-1.5, 1.5],
      [1.5, 1.5]
    ])
      piece(0.25, 6, 0.25, al + da, ac + dc, y + 3, darkWood);
    piece(0, 0, 0, al, ac, y + 7.3, wood, new T.CylinderGeometry(2.3, 2.3, 2.8, 16));
    piece(0, 0, 0, al, ac, y + 9.1, darkWood, new T.ConeGeometry(2.6, 1, 16));
    piece(3.4, 0.64, 0.05, al, ac - 2.4, y + 7.7, sign('💧 AGUA')); // facing the street
  }
  {
    const al = 566,
      ac = -4;
    piece(1.4, 0.5, 3, al, ac, floor + 0.9, wood);
    const top = piece(
      0,
      0,
      0,
      al,
      ac,
      floor + 1.15,
      canvas,
      new T.CylinderGeometry(0.85, 0.85, 2.9, 14, 1, true, 0, Math.PI)
    );
    top.rotation.set(Math.PI / 2, yaw, 0, 'YXZ');
    for (const d of [-1, 1])
      for (const e of [-0.8, 0.8]) {
        const wheel = piece(
          0,
          0,
          0,
          al + d,
          ac + e,
          floor + 0.55,
          darkWood,
          new T.TorusGeometry(0.5, 0.07, 6, 16)
        );
        wheel.rotation.set(0, yaw + Math.PI / 2, 0);
      }
  }
  {
    const al = 528,
      ac = -26;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      piece(0.12, 1, 0.12, al + Math.cos(a) * 9, ac + Math.sin(a) * 6, floor + 0.5, wood);
    }
    for (const [da, dc, r] of [
      [-3, 1, 0.4],
      [2, -2, 2.1],
      [4, 2, 1.2],
      [-1, -3, 3]
    ]) {
      const cow = piece(1.4, 0.7, 0.6, al + da, ac + dc, floor + 0.75, paints[3]);
      cow.rotation.y = yaw + r;
      const head = piece(
        0.45,
        0.45,
        0.45,
        al + da + Math.cos(r) * 0.9,
        ac + dc - Math.sin(r) * 0.9,
        floor + 1,
        darkWood
      );
      head.rotation.y = yaw + r;
      for (const [x, z] of [
        [-0.5, -0.2],
        [0.5, -0.2],
        [-0.5, 0.2],
        [0.5, 0.2]
      ])
        piece(0.14, 0.45, 0.14, al + da + x, ac + dc + z, floor + 0.22, darkWood);
    }
  }
  // One-word signs on posts by the cattle corral and the chicken yard.
  for (const [text, al, ac] of [
    ['🐄 VACAS', 528, -19.5],
    ['🐔 GALLINAS', 552, -24.5]
  ]) {
    for (const d of [-0.85, 0.85]) piece(0.12, 1.7, 0.12, al + d, ac, floor + 0.85, darkWood);
    piece(1.9, 0.36, 0.05, al, ac, floor + 1.55, sign(text));
  }
  // Merge nothing yet: about 200 small meshes, only drawn while you are in the past by the lake.

  let time = 0;
  return {
    root,
    update(dt, era, crossed, pos) {
      time += dt;
      const nearTown =
        pos && Math.hypot(pos[0] - valleyPoint(580, 0)[0], pos[2] - valleyPoint(580, 0)[2]) < 700;
      town.visible = era === 'past' && !!nearTown;
      nest.visible = era === 'past' && !!pos && Math.hypot(pos[0] - NEST[0], pos[2] - NEST[2]) < 900;
      for (const g of gates) {
        const here = g.gate.era === era,
          awake = gateAwake(g.gate, crossed),
          near = pos && Math.hypot(pos[0] - g.gate.at[0], pos[2] - g.gate.at[1]) < 900;
        g.group.visible = here && !!near;
        if (!g.group.visible) continue;
        g.disc.visible = awake;
        g.disc.rotation.z = -time * 1.4;
        for (const s of g.stones) s.material = awake ? stone : stoneAsleep;
        g.lights.forEach((l, i) => {
          l.visible = awake;
          const a = time * 1.2 + (i * Math.PI) / 3;
          l.position.set(
            Math.cos(a) * GATE_RADIUS * 0.8,
            GATE_RADIUS * 0.55 + Math.sin(a) * GATE_RADIUS * 0.8,
            0.15
          );
        });
      }
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
    }
  };
}
