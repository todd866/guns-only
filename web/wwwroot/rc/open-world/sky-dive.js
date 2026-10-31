import * as T from '../../vendor/three.module.js';
import {SKY_JUMPS, SKY_RINGS, SKY_PAD_RADIUS} from './sky-dive.mjs';

export function createSkyDiveVisual(scene, world, heightAt) {
  const root = new T.Group(),
    keep = [],
    socks = [];
  root.name = 'Sky jumps';
  const own = resource => (keep.push(resource), resource);
  const material = color => own(new T.MeshBasicMaterial({color, fog: false, side: T.DoubleSide}));
  const white = material('#fff7e3'),
    orange = material('#f58c44'),
    blue = material('#388fed');
  const mesh = (geometry, mat, parent = root) => {
    const m = new T.Mesh(own(geometry), mat);
    parent.add(m);
    return m;
  };
  // Conform painted rings to the terrain; the mountain's target is on a slope.
  const paint = (at, inner, outer, mat) => {
    const g = new T.RingGeometry(inner, outer, 96, 8),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = at[0] + p.getX(i),
        z = at[1] - p.getY(i);
      p.setXYZ(i, x, heightAt(x, z) + 0.1, z);
    }
    g.computeVertexNormals();
    mesh(g, mat);
  };
  for (const j of SKY_JUMPS) {
    const [x, z] = j.pad,
      y = heightAt(x, z),
      direction = new T.Vector3(j.target[0] - j.launch[0], 0, j.target[1] - j.launch[1]).normalize();
    paint(j.pad, 0, SKY_PAD_RADIUS, blue);
    paint(j.pad, SKY_PAD_RADIUS - 0.4, SKY_PAD_RADIUS, white);
    // A windsock just beside the drivable pad points toward the landing rings.
    const mast = mesh(new T.CylinderGeometry(0.09, 0.09, 6, 8), white);
    mast.position.set(x - direction.z * 7, y + 3, z + direction.x * 7);
    const sock = new T.Group();
    sock.position.copy(mast.position).add(new T.Vector3(0, 2.7, 0));
    sock.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
    root.add(sock);
    for (let i = 0; i < 4; i++) {
      const band = mesh(
        new T.CylinderGeometry(0.45 - i * 0.08, 0.53 - i * 0.08, 0.65, 12, 1, true),
        i % 2 ? white : orange,
        sock
      );
      band.position.y = i * 0.65;
    }
    socks.push(sock);
    for (let i = SKY_RINGS.length - 1; i >= 0; i--) {
      const r = SKY_RINGS[i];
      paint(j.target, i ? SKY_RINGS[i - 1].radius : 0, r.radius, material(r.color));
    }
    if (j.id === 'tower-jump') {
      const tx = x + 8,
        top = y + j.height;
      const pole = mesh(new T.CylinderGeometry(0.6, 1, j.height, 12), white);
      pole.position.set(tx, y + j.height / 2, z);
      const deck = mesh(new T.BoxGeometry(6, 0.4, 6), blue);
      deck.position.set(tx, top - 0.2, z);
      world.addQuad(
        [tx - 3, top, z - 3],
        [tx - 3, top, z + 3],
        [tx + 3, top, z + 3],
        [tx + 3, top, z - 3],
        'concrete'
      );
      for (const [a, b] of [
        [
          [tx - 1, z - 1],
          [tx + 1, z - 1]
        ],
        [
          [tx + 1, z - 1],
          [tx + 1, z + 1]
        ],
        [
          [tx + 1, z + 1],
          [tx - 1, z + 1]
        ],
        [
          [tx - 1, z + 1],
          [tx - 1, z - 1]
        ]
      ])
        world.addQuad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], 'concrete');
    }
  }
  scene.add(root);
  return {
    update(time) {
      socks.forEach((sock, i) => {
        sock.scale.y = 0.94 + 0.06 * Math.sin(time * 4 + i);
      });
    },
    dispose() {
      root.removeFromParent();
      keep.forEach(resource => resource.dispose());
    }
  };
}

// One compact result row, with the same dark card/gold-value vocabulary as the other activities.
export function createSkyDiveReport() {
  const row = document.createElement('div');
  row.id = 'sky-jump-report';
  row.setAttribute('role', 'status');
  row.hidden = true;
  const name = document.createElement('span'),
    stars = document.createElement('span'),
    metres = document.createElement('span');
  row.append(name, stars, metres);
  document.body.append(row);
  let timer;
  return {
    hide() {
      clearTimeout(timer);
      row.hidden = true;
    },
    show(report) {
      clearTimeout(timer);
      name.textContent = report.name;
      stars.textContent = report.stars ? '⭐'.repeat(report.stars) : '☆☆☆';
      stars.setAttribute('aria-label', `${report.stars} stars`);
      metres.textContent = `${Math.round(report.metres)} m`;
      metres.title = 'From the middle';
      row.hidden = false;
      timer = setTimeout(() => {
        row.hidden = true;
      }, 7000);
    }
  };
}
