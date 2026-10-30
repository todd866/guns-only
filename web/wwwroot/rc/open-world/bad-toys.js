import * as T from '../../vendor/three.module.js';

// Bad toys, drawn: wind-up tin soldiers taken over by the bad aliens' signal: red tunic, tall hat,
// a brass key turning in the back, and glowing red eyes. They tick when they walk, lean back and
// flash on a wind-up (the tell a kid watches for), and pop apart into springs and cogs.
export function createBadToys(scene) {
  const root = new T.Group(); root.name = 'BadToys'; scene.add(root);
  const mats = { tunic: new T.MeshStandardMaterial({ color: '#c33a2e', roughness: .45, metalness: .3 }), pants: new T.MeshStandardMaterial({ color: '#25395e', roughness: .5, metalness: .3 }),
    hat: new T.MeshStandardMaterial({ color: '#1d1d22', roughness: .5 }), brass: new T.MeshStandardMaterial({ color: '#d9a94a', roughness: .3, metalness: .85 }),
    eye: new T.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1010', emissiveIntensity: 2.5 }), flash: new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffb0a0', emissiveIntensity: 1.5 }) };
  const views = new Map(), bits = [];
  const make = () => {
    const g = new T.Group(), part = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    const body = part(new T.CylinderGeometry(.045, .05, .1, 12), mats.tunic, 0, .15, 0);
    part(new T.CylinderGeometry(.04, .04, .08, 10), mats.pants, 0, .06, 0);
    part(new T.SphereGeometry(.035, 12, 10), mats.brass, 0, .23, 0);
    part(new T.CylinderGeometry(.03, .032, .07, 10), mats.hat, 0, .285, 0);
    for (const x of [-.013, .013]) part(new T.SphereGeometry(.007, 8, 6), mats.eye, x, .235, -.03);
    const key = new T.Group(); key.position.set(0, .16, .055); g.add(key);
    const shaft = new T.Mesh(new T.CylinderGeometry(.006, .006, .03, 6), mats.brass); shaft.rotation.x = Math.PI / 2; key.add(shaft);
    for (const s of [-1, 1]) { const w = new T.Mesh(new T.TorusGeometry(.016, .005, 6, 12), mats.brass); w.position.set(s * .016, 0, .016); w.rotation.y = Math.PI / 2; key.add(w); }
    g.userData = { body, key }; root.add(g); return g;
  };
  const burst = (p) => {
    for (let i = 0; i < 12; i++) {
      const spring = i % 3 === 0, m = new T.Mesh(spring ? new T.TorusGeometry(.012, .004, 5, 10) : new T.CylinderGeometry(.014, .014, .006, 8), spring ? mats.brass : [mats.tunic, mats.pants, mats.brass][i % 3]);
      m.position.set(p[0], p[1] + .12, p[2]); root.add(m);
      const a = Math.random() * Math.PI * 2; bits.push({ m, v: [Math.cos(a) * (.6 + Math.random()), 1.6 + Math.random() * 1.4, Math.sin(a) * (.6 + Math.random())], life: 1.3, spin: Math.random() * 12 });
    }
  };
  return {
    /** Pose every enemy; pops burst once. groundAt(x, z) gives the floor height. */
    sync(enemies, time, dt, groundAt) {
      for (const e of enemies) {
        let g = views.get(e.id);
        if (!e.alive) { if (g?.visible) { burst(g.position.toArray()); g.visible = false; } continue; }
        if (!g) { g = make(); views.set(e.id, g); }
        g.visible = true; g.position.set(e.pos[0], groundAt(e.pos[0], e.pos[2]), e.pos[2]); g.rotation.set(0, -e.yaw, 0);
        const { body, key } = g.userData, walking = e.state === 'idle';
        key.rotation.z = time * (e.state === 'windup' ? 14 : 4);
        g.rotation.z = walking ? Math.sin(time * 18 + e.id.length) * .08 : 0;                        // tin-toy waddle
        g.rotation.x = e.state === 'windup' ? .35 : e.state === 'strike' ? -.5 : 0;                     // lean back, then lunge
        body.material = e.hitFlash > 0 || (e.state === 'windup' && Math.sin(time * 30) > 0) ? mats.flash : mats.tunic;
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i]; b.life -= dt; b.v[1] -= 9.8 * dt;
        b.m.position.x += b.v[0] * dt; b.m.position.y += b.v[1] * dt; b.m.position.z += b.v[2] * dt; b.m.rotation.x += b.spin * dt; b.m.rotation.y += b.spin * dt;
        const floor = groundAt(b.m.position.x, b.m.position.z) + .01; if (b.m.position.y < floor) { b.m.position.y = floor; b.v = [b.v[0] * .5, Math.abs(b.v[1]) * .3, b.v[2] * .5]; }
        if (b.life <= 0) { b.m.removeFromParent(); b.m.geometry.dispose(); bits.splice(i, 1); }
      }
    },
    dispose() { root.removeFromParent(); root.traverse(o => o.geometry?.dispose()); Object.values(mats).forEach(m => m.dispose()); },
  };
}
