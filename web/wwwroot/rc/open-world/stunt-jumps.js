import * as T from '../../vendor/three.module.js';
import {STUNT_JUMPS, jumpPoint, jumpTriangles} from './stunt-jumps.mjs';

export function buildStuntJumps(scene, world, heightAt = () => 0) {
  const root = new T.Group(),
    resources = [],
    keep = resource => (resources.push(resource), resource),
    wood = keep(new T.MeshStandardMaterial({color: '#b89961', roughness: 0.85})),
    black = keep(new T.MeshBasicMaterial({color: '#181b20'})),
    yellow = keep(new T.MeshBasicMaterial({color: '#ffdf27', side: T.DoubleSide})),
    box = keep(new T.BoxGeometry(1, 1, 1));
  root.name = 'Stunt jumps';
  const block = (parent, material, pos, size) => {
    const m = new T.Mesh(box, material);
    m.position.set(...pos);
    m.scale.set(...size);
    parent.add(m);
    return m;
  };
  // Shared upward chevrons, visible on both faces; no text, texture downloads or map pins.
  const points = [];
  for (const y of [-0.7, 0.1, 0.9]) {
    const a = [-1.35, y - 0.35, 0],
      b = [0, y + 0.35, 0],
      c = [1.35, y - 0.35, 0],
      d = [1.35, y - 0.65, 0],
      e = [0, y + 0.05, 0],
      f = [-1.35, y - 0.65, 0];
    points.push(...a, ...b, ...e, ...a, ...e, ...f, ...b, ...c, ...d, ...b, ...d, ...e);
  }
  const chevrons = keep(new T.BufferGeometry());
  chevrons.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  for (const j of STUNT_JUMPS) {
    const triangles = jumpTriangles(j, heightAt),
      geometry = keep(new T.BufferGeometry());
    for (const t of triangles) world.addTri(...t, 'wood');
    geometry.setAttribute('position', new T.Float32BufferAttribute(triangles.flat(2), 3));
    geometry.computeVertexNormals();
    const ramp = new T.Mesh(geometry, wood);
    ramp.receiveShadow = true;
    root.add(ramp);
    const sign = new T.Group(),
      p = jumpPoint(j, j.length / 2, j.width / 2 + 1.5);
    sign.position.set(p[0], heightAt(p[0], p[2]), p[2]);
    sign.rotation.y = j.heading;
    block(sign, black, [0, 2.5, 0], [0.18, 5, 0.18]);
    block(sign, yellow, [0, 4.3, 0], [3.3, 3.3, 0.14]);
    block(sign, black, [0, 4.3, 0], [3, 3, 0.18]);
    for (const side of [-1, 1]) {
      const arrows = new T.Mesh(chevrons, yellow);
      arrows.position.set(0, 4.3, side * 0.1);
      sign.add(arrows);
    }
    root.add(sign);
  }
  scene.add(root);
  return {
    dispose() {
      root.removeFromParent();
      resources.forEach(r => r.dispose());
    }
  };
}
