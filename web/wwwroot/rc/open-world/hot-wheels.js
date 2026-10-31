import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {HOT_WHEELS, trackQuads, trackFrames, toWorld, boosterPoints, worldFrames} from './hot-wheels.mjs';

// The orange track, drawn and made solid (shape and rules in hot-wheels.mjs): glossy orange
// plastic with darker edges, red-and-yellow booster pads with spinning black wheels at their sides,
// blue pylons down to the lake under every raised piece, and a chequered START banner on the tower.
export function createHotWheels(scene, world) {
  const root = new T.Group();
  root.name = 'HotWheels';
  const keep = [],
    buckets = new Map(),
    K = x => (keep.push(x), x);
  const mats = {
    deck: K(
      new T.MeshStandardMaterial({color: '#ff6a00', roughness: 0.28, metalness: 0.05, side: T.DoubleSide})
    ),
    rail: K(new T.MeshStandardMaterial({color: '#d24c00', roughness: 0.35, side: T.DoubleSide})),
    booster: K(
      new T.MeshStandardMaterial({
        map: (() => {
          const c = document.createElement('canvas');
          c.width = 64;
          c.height = 128;
          const x = c.getContext('2d');
          x.fillStyle = '#e8322a';
          x.fillRect(0, 0, 64, 128);
          x.fillStyle = '#ffd23a';
          for (let i = 0; i < 4; i++) {
            x.beginPath();
            x.moveTo(4, i * 32 + 28);
            x.lineTo(32, i * 32 + 6);
            x.lineTo(60, i * 32 + 28);
            x.lineTo(60, i * 32 + 18);
            x.lineTo(32, i * 32 - 4);
            x.lineTo(4, i * 32 + 18);
            x.fill();
          }
          const t = K(new T.CanvasTexture(c));
          t.colorSpace = T.SRGBColorSpace;
          t.wrapS = t.wrapT = T.RepeatWrapping;
          return t;
        })(),
        roughness: 0.3,
        side: T.DoubleSide,
        emissive: '#5a1000',
        emissiveIntensity: 0.4
      })
    ),
    pylon: K(new T.MeshStandardMaterial({color: '#2f5fb4', roughness: 0.5})),
    tyre: K(new T.MeshStandardMaterial({color: '#151515', roughness: 0.8}))
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
  // Deck, boosters and rails: drawn from the same quads the car drives on; rails solid both sides.
  let run = 0;
  for (const q of trackQuads()) {
    const [a, b, c, d] = q.v,
      g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    g.setAttribute(
      'uv',
      new T.Float32BufferAttribute(
        [0, run, 0, run + L / 1.8, 1, run + L / 1.8, 0, run, 1, run + L / 1.8, 1, run],
        2
      )
    );
    if (q.kind !== 'rail') run += L / 1.8;
    g.computeVertexNormals();
    add(q.kind === 'rail' ? 'rail' : q.kind, g);
    world.addQuad(a, b, c, d, 'concrete');
    if (q.kind === 'rail') world.addQuad(a, d, c, b, 'concrete');
  }
  // Pylons under raised track: every 3 m where the deck is more than half a metre up (not the loop).
  const f = trackFrames();
  for (let i = 0; i < f.length; i += 12) {
    if (i >= f.loopFrom && i <= f.loopTo) continue;
    const fr = f[i];
    if (fr.p[1] < 0.6 || fr.u[1] < 0.9) continue;
    const [x, y, z] = toWorld(fr.p),
      h = y - HOT_WHEELS.at[1] - 0.05,
      g = new T.CylinderGeometry(0.09, 0.12, h, 10);
    g.translate(x, HOT_WHEELS.at[1] + h / 2, z);
    add('pylon', g);
  }
  // The loop's foot: two blue blocks where it stands on the lake.
  {
    const a = f[f.loopFrom],
      [x, , z] = toWorld([a.p[0], 0, a.p[2] + HOT_WHEELS.width * 0.75]),
      g = new T.BoxGeometry(2.2, 0.3, 3.8);
    g.translate(x, HOT_WHEELS.at[1] + 0.15, z);
    add('pylon', g);
  }
  // Booster wheels: a pair of spinning tyres either side of each pad.
  const pads = boosterPoints().filter((_, i) => i % 10 === 0),
    wheels = new T.InstancedMesh(K(new T.CylinderGeometry(0.32, 0.32, 0.18, 16)), mats.tyre, pads.length * 2),
    wm = new T.Matrix4(),
    wq = new T.Quaternion(),
    ws = new T.Vector3(1, 1, 1);
  root.add(wheels);
  const wheelAt = pads.flatMap(b => {
    const side = [b.t[2], 0, -b.t[0]],
      n = Math.hypot(...side) || 1;
    return [1, -1].map(sg => ({
      p: [
        b.p[0] + (side[0] / n) * sg * (HOT_WHEELS.width / 2 + 0.25),
        b.p[1] + 0.2,
        b.p[2] + (side[2] / n) * sg * (HOT_WHEELS.width / 2 + 0.25)
      ],
      axis: new T.Vector3(side[0] / n, 0, side[2] / n)
    }));
  });
  // The START banner on the tower: two posts and a chequered sign.
  {
    const s = toWorld([3, HOT_WHEELS.tower, 0]),
      c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d');
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 4; j++) {
        x.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        x.fillRect(i * 16, j * 16, 16, 16);
      }
    x.fillStyle = '#ff6a00';
    x.fillRect(64, 12, 128, 40);
    x.fillStyle = '#fff';
    x.font = '900 30px system-ui';
    x.textAlign = 'center';
    x.fillText('START', 128, 43);
    const t = K(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    const banner = new T.Mesh(
      K(new T.PlaneGeometry(HOT_WHEELS.width + 0.8, 0.55)),
      K(new T.MeshBasicMaterial({map: t, side: T.DoubleSide}))
    );
    banner.position.set(s[0], s[1] + 1.6, s[2]);
    banner.rotation.y = HOT_WHEELS.yaw - Math.PI / 2; // reads the right way as you roll up to the droproot.add(banner);
    for (const sg of [1, -1]) {
      const g = new T.CylinderGeometry(0.05, 0.05, 1.9, 8),
        off = (HOT_WHEELS.width / 2 + 0.4) * sg;
      g.translate(s[0], s[1] + 0.95, s[2] + off * Math.cos(HOT_WHEELS.yaw));
      add('pylon', g);
    }
  }
  for (const [key, parts] of buckets) {
    const g = K(mergeGeometries(parts, false));
    parts.forEach(p => p.dispose());
    const m = new T.Mesh(g, mats[key]);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  for (const m of Object.values(mats)) keep.push(m);
  scene.add(root);
  let spin = 0;
  const frames = worldFrames();
  return {
    root,
    frames,
    update(dt) {
      spin += dt * 14;
      wheelAt.forEach((w, i) => {
        wq.setFromAxisAngle(w.axis, spin);
        wm.compose(
          new T.Vector3(...w.p),
          wq.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2)),
          ws
        );
        wheels.setMatrixAt(i, wm);
      });
      wheels.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      keep.forEach(x => x.dispose?.());
    }
  };
}
