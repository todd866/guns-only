import * as T from '../../vendor/three.module.js';

// The chickens, drawn (rules: chickens.mjs): our own blocky toy hen, all cubes, in the dark world's
// Minecraft spirit. A white body, a head on a short neck, a red comb and wattle, a yellow beak,
// orange legs and wing slabs that flap when she runs. About the toy cowboy's height (0.3 m).
export function createChickens(scene) {
  const root = new T.Group();
  root.name = 'Chickens';
  root.visible = false;
  scene.add(root);
  const mat = c => new T.MeshStandardMaterial({color: c, roughness: 0.85}),
    white = mat('#f4f1e8'),
    red = mat('#d6382d'),
    beak = mat('#f2b632'),
    leg = mat('#e8862e'),
    eye = mat('#1b1b1b'),
    box = new T.BoxGeometry(1, 1, 1),
    part = (parent, m, [w, h, d], [x, y, z]) => {
      const o = new T.Mesh(box, m);
      o.scale.set(w, h, d);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
  const hens = new Map();
  function make() {
    const g = new T.Group();
    part(g, white, [0.16, 0.14, 0.22], [0, 0.17, 0.02]); // body
    const head = new T.Group();
    head.position.set(0, 0.28, -0.1);
    g.add(head);
    part(head, white, [0.1, 0.12, 0.08], [0, 0, 0]);
    part(head, red, [0.04, 0.05, 0.06], [0, 0.08, 0]); // comb
    part(head, beak, [0.05, 0.03, 0.05], [0, -0.005, -0.06]);
    part(head, red, [0.03, 0.04, 0.02], [0, -0.045, -0.05]); // wattle
    for (const x of [-0.051, 0.051]) part(head, eye, [0.006, 0.022, 0.022], [x, 0.015, -0.02]);
    const wings = [-1, 1].map(s => {
      const w = new T.Group();
      w.position.set(s * 0.085, 0.2, 0.02);
      g.add(w);
      part(w, white, [0.02, 0.1, 0.16], [s * 0.01, -0.03, 0]);
      return w;
    });
    part(g, white, [0.1, 0.06, 0.04], [0, 0.22, 0.14]); // tail
    const legs = [-0.04, 0.04].map(x => {
      const l = new T.Group();
      l.position.set(x, 0.1, 0.02);
      g.add(l);
      part(l, leg, [0.025, 0.1, 0.025], [0, -0.05, 0]);
      part(l, leg, [0.05, 0.012, 0.06], [0, -0.1, -0.01]);
      return l;
    });
    g.userData = {head, wings, legs};
    g.scale.setScalar(1.4);
    root.add(g);
    return g;
  }
  let time = 0;
  return {
    root,
    /** Pose the flock; groundAt(x, z) gives the ground height. */
    update(flock, dt, visible, groundAt) {
      time += dt;
      root.visible = visible;
      if (!visible) return;
      for (const h of flock.hens) {
        const g = hens.get(h.id) ?? hens.set(h.id, make()).get(h.id),
          {head, wings, legs} = g.userData,
          moving = h.state !== 'peck',
          phase = time * (h.state === 'run' ? 22 : 9) + h.id.length;
        g.position.set(
          h.x,
          groundAt(h.x, h.z) + (h.flap > 0 ? Math.abs(Math.sin(phase * 0.5)) * 0.08 : 0),
          h.z
        );
        g.rotation.y = -h.yaw;
        head.rotation.x = h.state === 'peck' && Math.sin(time * 5 + h.id.length) > 0.3 ? 0.9 : 0;
        legs[0].rotation.x = moving ? Math.sin(phase) * 0.6 : 0;
        legs[1].rotation.x = moving ? -Math.sin(phase) * 0.6 : 0;
        const flap = h.flap > 0 ? 0.6 + Math.sin(phase * 1.6) * 0.6 : 0;
        wings[0].rotation.z = flap;
        wings[1].rotation.z = -flap;
      }
    },
    dispose() {
      root.removeFromParent();
      box.dispose();
      for (const m of [white, red, beak, leg, eye]) m.dispose();
    }
  };
}
