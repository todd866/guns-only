import * as T from '../../vendor/three.module.js';
import {DIG, layerAt} from './dig.mjs';

// The dig, drawn (rules: dig.mjs): Minecraft-chunky blocks with 16-pixel textures line the shaft,
// the block underfoot shows the next layer, and each dug block bursts into little cubes. The
// terrain is one-sided, so from inside the shaft it vanishes and the opening shows the sky.
const PIX = {
  grass: ['#6aa84f', '#5b9a42', '#7cbc5c'],
  dirt: ['#8a5a36', '#7a4e2e', '#9b6a42'],
  clay: ['#b0673e', '#9e5934', '#c27a4c'],
  stone: ['#8d8d8d', '#7a7a7a', '#a0a0a0'],
  gold: ['#8d8d8d', '#7a7a7a', '#f2c14a'],
  portal: ['#5a2ea8', '#7a4ae0', '#a98bff']
};
function texture(layer) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d'),
    p = PIX[layer];
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 16; j++) {
      const h = (Math.sin(i * 12.9898 + j * 78.233 + layer.length) * 43758.5453) % 1,
        k = Math.abs(h);
      x.fillStyle =
        layer === 'gold'
          ? k > 0.86
            ? p[2]
            : k > 0.45
              ? p[0]
              : p[1]
          : layer === 'grass' && j < 4
            ? '#6aa84f'
            : p[k > 0.66 ? 2 : k > 0.33 ? 0 : 1];
      if (layer === 'grass' && j >= 4) x.fillStyle = PIX.dirt[k > 0.66 ? 2 : k > 0.33 ? 0 : 1];
      x.fillRect(i, j, 1, 1);
    }
  const t = new T.CanvasTexture(c);
  t.magFilter = T.NearestFilter;
  t.minFilter = T.NearestFilter;
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

export function createDigView(scene) {
  const root = new T.Group();
  root.name = 'DigShaft';
  root.visible = false;
  scene.add(root);
  const mats = Object.fromEntries(
    Object.keys(PIX).map(l => [
      l,
      new T.MeshStandardMaterial({
        map: texture(l),
        roughness: 0.95,
        ...(l === 'portal' ? {emissive: '#6a3cff', emissiveIntensity: 0.9} : {})
      })
    ])
  );
  const B = DIG.block,
    cube = new T.BoxGeometry(B, B, B),
    bit = new T.BoxGeometry(B / 5, B / 5, B / 5),
    bits = [];
  let built = -1,
    at = null,
    floor = null;
  const place = (m, x, y, z) => {
    const o = new T.Mesh(cube, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    root.add(o);
    return o;
  };
  const level = d => {
    // the ring of wall blocks round the column at depth d (0 = the top layer)
    const y = at[1] + 0.03 - (d + 0.5) * B,
      m = mats[layerAt(d)];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) if (i || j) place(m, at[0] + i * B, y, at[2] + j * B);
  };
  return {
    root,
    /** Sync to the dig state; burst on a dug block. */
    update(s, dt, events = []) {
      if (!s.active) {
        if (root.visible) {
          root.visible = false;
          for (const o of [...root.children]) if (o.geometry === cube) root.remove(o);
          built = -1;
          floor = null;
        }
      } else {
        if (!at || at[0] !== s.at[0] || at[2] !== s.at[2] || built < 0) {
          for (const o of [...root.children]) if (o.geometry === cube) root.remove(o);
          at = [...s.at];
          built = -1;
        }
        root.visible = true;
        while (built < s.depth) level(++built);
        const fy = at[1] + 0.03 - (s.depth + 0.5) * B;
        if (!floor) floor = place(mats[layerAt(s.depth)], at[0], fy, at[2]);
        floor.material = mats[layerAt(s.depth)];
        floor.position.y = fy;
      }
      for (const e of events)
        if (e.block && at)
          for (let i = 0; i < 8; i++) {
            const m = new T.Mesh(bit, mats[e.block]);
            m.position.set(at[0], at[1] - (e.depth - 0.5) * B, at[2]);
            scene.add(m);
            const a = (i / 8) * Math.PI * 2;
            bits.push({m, v: [Math.cos(a) * 0.7, 0.9 + (i % 3) * 0.3, Math.sin(a) * 0.7], life: 0.5}); // a low hop: the camera is right above
          }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        b.v[1] -= 9.8 * dt;
        b.m.position.x += b.v[0] * dt;
        b.m.position.y += b.v[1] * dt;
        b.m.position.z += b.v[2] * dt;
        b.m.rotation.x += 8 * dt;
        if (b.life <= 0) {
          b.m.removeFromParent();
          bits.splice(i, 1);
        }
      }
    },
    // Just under the surface (so the one-sided ground vanishes) once a block is dug; the chase
    // camera until then.
    camera(s) {
      if (!s.active || s.depth < 1) return null;
      const floorY = s.at[1] - s.depth * B;
      return {
        eye: [s.at[0] + 0.08, s.at[1] - 0.06, s.at[2] + 0.14],
        target: [s.at[0], floorY + 0.05, s.at[2]]
      };
    },
    dispose() {
      root.removeFromParent();
      bits.forEach(b => b.m.removeFromParent());
      cube.dispose();
      bit.dispose();
      Object.values(mats).forEach(m => {
        m.map.dispose();
        m.dispose();
      });
    }
  };
}
