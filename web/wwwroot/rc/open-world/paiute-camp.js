import * as T from '../../vendor/three.module.js';
import {CAMP, FAMILY} from './paiute-camp.mjs';

// Southern Paiute camp, drawn: domed willow-brush kahn, stone fire, agave pit, baskets, grinding
// stone, windbreak, and five toy-scale family figures at their everyday work. Past era only.
export function createPaiuteCamp(scene) {
  const root = new T.Group();
  root.name = 'PaiuteCamp';
  root.visible = false;
  scene.add(root);

  const mat = (c, o = {}) => new T.MeshStandardMaterial({color: c, roughness: 0.88, ...o}),
    brush = mat('#a8845c'),
    brushDark = mat('#6b5238'),
    stone = mat('#8a8278'),
    stoneDark = mat('#5c564e'),
    basketTan = mat('#c4a574'),
    basketRed = mat('#9a4a3a'),
    // Everyday 1900s clothes: calico, cotton shirts, a wool vest; hair black.
    clothes = [mat('#b5523b'), mat('#3d6fa3'), mat('#d9b44a'), mat('#5e8a4a'), mat('#8c5a8a')],
    skin = mat('#a8754e'),
    hair = mat('#1e1a18'),
    box = new T.BoxGeometry(1, 1, 1),
    cyl = new T.CylinderGeometry(1, 1, 1, 8),
    dome = new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    cone = new T.ConeGeometry(1, 1, 8),
    geos = [box, cyl, dome, cone],
    parts = [];

  const part = (parent, m, geo, [w, h, d], [x, y, z], ry = 0) => {
    const o = new T.Mesh(geo, m);
    o.scale.set(w, h, d);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    parts.push(o);
    return o;
  };

  const props = new T.Group();
  root.add(props);

  // Three kahn: low domes of brush with dark doorways.
  for (const [ox, oz] of [
    [-5, -2],
    [0, 3],
    [5, -1]
  ]) {
    const h = new T.Group();
    h.position.set(ox, 0, oz);
    props.add(h);
    // A willow frame thatched with brush: the dome, darker bands of tied bundles, the frame's
    // pole ends poking out at the top, and a low doorway facing the fire.
    part(h, brush, dome, [1.15, 1.25, 1.15], [0, 0, 0]);
    for (const [y, r] of [
      [0.35, 1.08],
      [0.75, 0.86]
    ])
      part(h, brushDark, cyl, [r, 0.07, r], [0, y, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pole = part(h, brushDark, box, [0.04, 0.4, 0.04], [Math.cos(a) * 0.12, 1.32, Math.sin(a) * 0.12]);
      pole.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    }
    part(h, hair, box, [0.42, 0.5, 0.3], [0, 0.25, -0.98]);
    h.rotation.y = Math.atan2(ox, oz); // the doorway (local -z) faces the fire
  }

  // Stone ring fire with warm emissive coals.
  const fireGlow = mat('#ff6a28', {emissive: '#ff4400', emissiveIntensity: 0.85});
  const fire = new T.Group();
  fire.position.set(0, 0, 0);
  props.add(fire);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(fire, stone, box, [0.35, 0.22, 0.5], [Math.cos(a) * 0.55, 0.11, Math.sin(a) * 0.55], a);
  }
  part(fire, fireGlow, cyl, [0.5, 0.08, 0.5], [0, 0.12, 0]);
  for (const a of [0.4, 2.5, 4.6]) {
    const log = part(
      fire,
      mat('#4a3020'),
      cyl,
      [0.05, 0.6, 0.05],
      [Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12]
    );
    log.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
  }
  const flame = mat('#ffb02e', {emissive: '#ff7a10', emissiveIntensity: 1.6}),
    flames = [
      part(fire, flame, cone, [0.2, 0.55, 0.2], [0, 0.42, 0]),
      part(fire, flame, cone, [0.13, 0.36, 0.13], [0.12, 0.33, 0.05]),
      part(fire, flame, cone, [0.12, 0.32, 0.12], [-0.1, 0.31, -0.06])
    ];

  // Agave roasting pit: low stone mound.
  const pit = new T.Group();
  pit.position.set(3.5, 0, 2.5);
  props.add(pit);
  part(pit, stoneDark, cyl, [1.1, 0.25, 1.1], [0, 0.12, 0]);
  part(pit, stone, box, [0.9, 0.12, 0.9], [0, 0.28, 0]);

  // Coiled baskets with stripe bands.
  for (const [bx, bz] of [
    [-2.5, 3],
    [-3.2, 2.4]
  ]) {
    const b = new T.Group();
    b.position.set(bx, 0, bz);
    props.add(b);
    part(b, basketTan, cyl, [0.35, 0.18, 0.35], [0, 0.09, 0]);
    part(b, basketRed, cyl, [0.38, 0.04, 0.38], [0, 0.14, 0]);
    part(b, basketTan, cyl, [0.32, 0.04, 0.32], [0, 0.18, 0]);
  }
  // A tall cone burden basket for carrying piñon, leaning by the weaver.
  {
    const b = part(props, basketTan, cone, [0.28, 0.6, 0.28], [-1.6, 0.3, 3.2]);
    b.rotation.x = Math.PI;
    part(props, basketRed, cyl, [0.27, 0.05, 0.27], [-1.6, 0.45, 3.2]);
  }

  // Grinding stone.
  const grind = new T.Group();
  grind.position.set(-3.5, 0, 1.5);
  props.add(grind);
  part(grind, stoneDark, cyl, [0.55, 0.14, 0.55], [0, 0.07, 0]);
  part(grind, stone, box, [0.22, 0.16, 0.28], [0.15, 0.18, 0.05], 0.3);

  // Brush windbreak.
  const wind = new T.Group();
  wind.position.set(-6, 0, 0);
  props.add(wind);
  for (let i = 0; i < 5; i++) part(wind, brush, box, [0.25, 0.9, 0.12], [0, 0.45, i * 0.35 - 0.7]);

  const figures = new Map();
  const makeFigure = (index, job) => {
    const g = new T.Group();
    g.scale.setScalar(job === 'hoop' ? 1.15 : 1.45);
    const cm = clothes[index % clothes.length];
    part(g, cm, box, [0.14, 0.2, 0.1], [0, 0.28, 0]);
    part(g, cm, box, [0.16, 0.14, 0.08], [0, 0.42, 0]);
    const head = part(g, skin, box, [0.1, 0.1, 0.1], [0, 0.52, 0]);
    part(head, hair, box, [1.08, 0.45, 1.08], [0, 0.35, 0.05]);
    const armL = new T.Group();
    armL.position.set(-0.1, 0.38, 0);
    g.add(armL);
    part(armL, cm, box, [0.05, 0.14, 0.05], [0, -0.06, 0]);
    const armR = new T.Group();
    armR.position.set(0.1, 0.38, 0);
    g.add(armR);
    part(armR, cm, box, [0.05, 0.14, 0.05], [0, -0.06, 0]);
    const legL = new T.Group();
    legL.position.set(-0.05, 0.18, 0);
    g.add(legL);
    part(legL, cm, box, [0.06, 0.18, 0.06], [0, -0.09, 0]);
    const legR = new T.Group();
    legR.position.set(0.05, 0.18, 0);
    g.add(legR);
    part(legR, cm, box, [0.06, 0.18, 0.06], [0, -0.09, 0]);
    let hoop = null;
    if (job === 'hoop') {
      hoop = part(g, mat('#8a6a48'), cyl, [0.38, 0.025, 0.38], [0.22, 0.32, -0.08], Math.PI / 2);
    }
    g.userData = {head, armL, armR, legL, legR, hoop, job};
    root.add(g);
    return g;
  };

  for (const f of FAMILY) figures.set(f.id, makeFigure(FAMILY.indexOf(f), f.job));

  let time = 0;
  const jobOffset = {
    weave: [-2, 2.8],
    pit: [3.5, 2.2],
    grind: [-3.5, 1.2],
    hoop: [1.5, -2.5],
    fire: [0.8, -0.6]
  };

  return {
    root,
    update(camp, dt, visible, groundAt) {
      time += dt;
      root.visible = visible;
      if (!visible) return;
      const [cx, cz] = CAMP.centre;
      const gy = groundAt(cx, cz);
      root.position.set(cx, gy, cz);
      for (const m of camp.members) {
        const g = figures.get(m.id);
        if (!g) continue;
        const off = jobOffset[m.job] ?? [m.x, m.z];
        g.position.set(off[0] + m.x * 0.15, 0.02, off[1] + m.z * 0.15);
        g.rotation.y = m.yaw;
        const {armL, armR, legL, legR, hoop, head, job} = g.userData;
        const a = m.anim ?? 0;
        if (job === 'weave') {
          armL.rotation.x = Math.sin(time * 3 + m.id.length) * 0.5;
          armR.rotation.x = -Math.sin(time * 3 + m.id.length) * 0.5;
        } else if (job === 'pit') {
          armR.rotation.x = Math.sin(time * 1.5) * 0.35 - 0.2;
        } else if (job === 'grind') {
          armR.rotation.x = Math.sin(time * 4) * 0.6 - 0.3;
          g.rotation.y = m.yaw + Math.sin(time * 0.5) * 0.05;
        } else if (job === 'hoop') {
          if (hoop) hoop.rotation.z = (m.spin ?? 0) + Math.PI / 2;
          legL.rotation.x = Math.sin(time * 5) * 0.35;
          legR.rotation.x = -Math.sin(time * 5) * 0.35;
        } else if (job === 'fire') {
          head.rotation.x = Math.sin(time * 0.8) * 0.04;
          armL.rotation.z = 0.15;
          armR.rotation.z = -0.15;
        }
      }
      fireGlow.emissiveIntensity = 0.65 + Math.sin(time * 2.2) * 0.2;
      flames.forEach((f, i) => (f.scale.y = (0.55 - i * 0.1) * (0.85 + 0.15 * Math.sin(time * 9 + i * 2))));
      flame.emissiveIntensity = 1.4 + Math.sin(time * 7) * 0.3;
    },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of [
        brush,
        brushDark,
        stone,
        stoneDark,
        basketTan,
        basketRed,
        fireGlow,
        flame,
        ...clothes,
        skin,
        hair
      ])
        m.dispose();
    }
  };
}
