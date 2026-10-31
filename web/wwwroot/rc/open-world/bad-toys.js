import * as T from '../../vendor/three.module.js';

// Bad toys, drawn: wind-up tin soldiers taken over by the bad aliens' signal: red tunic, tall hat,
// a brass key turning in the back, and glowing red eyes. They tick when they walk, lean back and
// flash on a wind-up (the tell a kid watches for), and pop apart into springs and cogs.
// look 'outlaw': the dark world's tin cowboys (outlaws.mjs): a dusty coat, a black wide-brimmed hat
// and a red bandana over the face, the same red eyes.
export function createBadToys(scene, {look = 'soldier'} = {}) {
  const outlaw = look === 'outlaw';
  const root = new T.Group();
  root.name = outlaw ? 'Outlaws' : 'BadToys';
  scene.add(root);
  const mats = {
    tunic: new T.MeshStandardMaterial({
      color: outlaw ? '#8a5a34' : '#c33a2e',
      roughness: 0.45,
      metalness: 0.3
    }),
    pants: new T.MeshStandardMaterial({
      color: outlaw ? '#3c3a40' : '#25395e',
      roughness: 0.5,
      metalness: 0.3
    }),
    bandana: new T.MeshStandardMaterial({color: '#b02a22', roughness: 0.5}),
    hat: new T.MeshStandardMaterial({color: '#1d1d22', roughness: 0.5}),
    brass: new T.MeshStandardMaterial({color: '#d9a94a', roughness: 0.3, metalness: 0.85}),
    eye: new T.MeshStandardMaterial({color: '#ff2a2a', emissive: '#ff1010', emissiveIntensity: 2.5}),
    flash: new T.MeshStandardMaterial({color: '#ffffff', emissive: '#ffb0a0', emissiveIntensity: 1.5})
  };
  const views = new Map(),
    bits = [];
  const make = () => {
    const g = new T.Group(),
      part = (geo, m, x, y, z) => {
        const o = new T.Mesh(geo, m);
        o.position.set(x, y, z);
        o.castShadow = true;
        g.add(o);
        return o;
      };
    const body = part(new T.CylinderGeometry(0.045, 0.05, 0.1, 12), mats.tunic, 0, 0.15, 0);
    part(new T.CylinderGeometry(0.04, 0.04, 0.08, 10), mats.pants, 0, 0.06, 0);
    part(new T.SphereGeometry(0.035, 12, 10), mats.brass, 0, 0.23, 0);
    if (outlaw) {
      part(new T.CylinderGeometry(0.06, 0.06, 0.006, 16), mats.hat, 0, 0.262, 0);
      part(new T.CylinderGeometry(0.026, 0.03, 0.04, 12), mats.hat, 0, 0.285, 0);
      part(
        new T.CylinderGeometry(0.037, 0.037, 0.02, 12, 1, true, Math.PI - 1.2, 2.4),
        mats.bandana,
        0,
        0.218,
        0
      );
    } else part(new T.CylinderGeometry(0.03, 0.032, 0.07, 10), mats.hat, 0, 0.285, 0);
    for (const x of [-0.013, 0.013]) part(new T.SphereGeometry(0.007, 8, 6), mats.eye, x, 0.235, -0.03);
    const key = new T.Group();
    key.position.set(0, 0.16, 0.055);
    g.add(key);
    const shaft = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.03, 6), mats.brass);
    shaft.rotation.x = Math.PI / 2;
    key.add(shaft);
    for (const s of [-1, 1]) {
      const w = new T.Mesh(new T.TorusGeometry(0.016, 0.005, 6, 12), mats.brass);
      w.position.set(s * 0.016, 0, 0.016);
      w.rotation.y = Math.PI / 2;
      key.add(w);
    }
    g.userData = {body, key};
    root.add(g);
    return g;
  };
  const burst = p => {
    for (let i = 0; i < 12; i++) {
      const spring = i % 3 === 0,
        m = new T.Mesh(
          spring ? new T.TorusGeometry(0.012, 0.004, 5, 10) : new T.CylinderGeometry(0.014, 0.014, 0.006, 8),
          spring ? mats.brass : [mats.tunic, mats.pants, mats.brass][i % 3]
        );
      m.position.set(p[0], p[1] + 0.12, p[2]);
      root.add(m);
      const a = Math.random() * Math.PI * 2;
      bits.push({
        m,
        v: [
          Math.cos(a) * (0.6 + Math.random()),
          1.6 + Math.random() * 1.4,
          Math.sin(a) * (0.6 + Math.random())
        ],
        life: 1.3,
        spin: Math.random() * 12
      });
    }
  };
  return {
    root,
    /** Pose every enemy; pops burst once. groundAt(x, z) gives the floor height. */
    sync(enemies, time, dt, groundAt) {
      for (const e of enemies) {
        let g = views.get(e.id);
        if (!e.alive) {
          if (g?.visible) {
            burst(g.position.toArray());
            g.visible = false;
          }
          continue;
        }
        if (!g) {
          g = make();
          views.set(e.id, g);
        }
        g.visible = true;
        g.position.set(e.pos[0], groundAt(e.pos[0], e.pos[2]), e.pos[2]);
        g.rotation.set(0, -e.yaw, 0);
        const {body, key} = g.userData,
          walking = e.state === 'idle';
        key.rotation.z = time * (e.state === 'windup' ? 14 : 4);
        g.rotation.z = walking ? Math.sin(time * 18 + e.id.length) * 0.08 : 0; // tin-toy waddle
        g.rotation.x = e.state === 'windup' ? 0.35 : e.state === 'strike' ? -0.5 : 0; // lean back, then lunge
        body.material =
          e.hitFlash > 0 || (e.state === 'windup' && Math.sin(time * 30) > 0) ? mats.flash : mats.tunic;
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        b.v[1] -= 9.8 * dt;
        b.m.position.x += b.v[0] * dt;
        b.m.position.y += b.v[1] * dt;
        b.m.position.z += b.v[2] * dt;
        b.m.rotation.x += b.spin * dt;
        b.m.rotation.y += b.spin * dt;
        const floor = groundAt(b.m.position.x, b.m.position.z) + 0.01;
        if (b.m.position.y < floor) {
          b.m.position.y = floor;
          b.v = [b.v[0] * 0.5, Math.abs(b.v[1]) * 0.3, b.v[2] * 0.5];
        }
        if (b.life <= 0) {
          b.m.removeFromParent();
          b.m.geometry.dispose();
          bits.splice(i, 1);
        }
      }
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      Object.values(mats).forEach(m => m.dispose());
    }
  };
}
