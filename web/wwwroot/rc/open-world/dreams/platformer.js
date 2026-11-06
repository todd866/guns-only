// Side-on drawing for the platformer dream. One instanced mesh per tile shape.
import * as T from '../../../vendor/three.module.js';
import {COURSE, PLANE_Z, boxOf} from './platformer.mjs';
import {COLD_LAB_RING} from './runner.mjs';

const FACE_Z = -0.32;
const dummy = new T.Object3D();
const paint = (mesh, i, x, y, z, sx, sy, sz, rotY = 0, rotZ = 0) => {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rotY, rotZ);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
};
const mat = (color, extra = {}) =>
  new T.MeshStandardMaterial({color, roughness: 0.55, metalness: 0.02, ...extra});

function instanced(geo, material, tiles, colorOf) {
  const mesh = new T.InstancedMesh(geo, material, Math.max(1, tiles.length));
  mesh.frustumCulled = false;
  if (colorOf) {
    tiles.forEach((tile, i) => mesh.setColorAt(i, new T.Color(colorOf(tile))));
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.count = tiles.length;
  return mesh;
}

export function createPlatformerView() {
  const scene = new T.Scene();
  scene.name = 'Dream_platformer';
  scene.background = new T.Color('#b7e6ff');
  scene.add(new T.HemisphereLight('#fff4dc', '#7eb6d8', 1.2));
  const sun = new T.DirectionalLight('#fff8ee', 1.25);
  sun.position.set(-6, 12, 8);
  scene.add(sun);

  const boxes = COURSE.filter(tile => tile.kind === 'block' || tile.kind === 'bridge' || tile.kind === 'platform');
  const boxMesh = instanced(new T.BoxGeometry(1, 1, 1), mat('#f3d7a2'), boxes, tile =>
    tile.smash ? '#e86a2a' : tile.kind === 'bridge' ? '#e07a5f' : tile.kind === 'platform' ? '#3fbfb6' : '#f4d7a6'
  );
  const springs = COURSE.filter(tile => tile.kind === 'spring');
  const springMesh = instanced(new T.CylinderGeometry(0.5, 0.5, 1, 10), mat('#7d5cff', {emissive: '#3a2a88', emissiveIntensity: 0.4}), springs);
  const coins = COURSE.filter(tile => tile.kind === 'coin');
  const coinMesh = instanced(
    new T.CircleGeometry(0.5, 14),
    mat('#ffd15c', {emissive: '#a86b12', emissiveIntensity: 0.45, metalness: 0.35, side: T.DoubleSide}),
    coins
  );
  const mushrooms = COURSE.filter(tile => tile.kind === 'mushroom');
  const capMesh = instanced(new T.SphereGeometry(0.5, 12, 8), mat('#ffffff'), mushrooms, tile =>
    tile.cap === 'puff' ? '#c6f25a' : '#8d74ff'
  );
  const stemMesh = instanced(new T.CylinderGeometry(0.5, 0.62, 1, 8), mat('#f4ecd4'), mushrooms);
  const marks = COURSE.filter(tile => tile.kind === 'checkpoint');
  const markMesh = instanced(
    new T.CylinderGeometry(0.5, 0.5, 1, 8),
    mat('#d7fff0', {emissive: '#8dffe0', emissiveIntensity: 0.7}),
    marks
  );
  for (const mesh of [boxMesh, springMesh, coinMesh, capMesh, stemMesh, markMesh]) scene.add(mesh);

  const flag = new T.Group();
  const pole = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 1.7, 8), mat('#f7f4ea'));
  pole.position.y = 0.85;
  const cloth = new T.Mesh(new T.PlaneGeometry(0.7, 0.42), mat('#ffd36a', {emissive: '#c9842a', emissiveIntensity: 0.2, side: T.DoubleSide}));
  cloth.position.set(0.36, 1.35, 0);
  flag.add(pole, cloth);
  scene.add(flag);
  const flagTile = COURSE.find(tile => tile.kind === 'flag');

  const ring = new T.Group();
  ring.name = 'DreamRing';
  const [rx, ry, rz] = COLD_LAB_RING.pos;
  ring.position.set(rx, ry, rz);
  const glow = new T.Mesh(
    new T.TorusGeometry(1.7, 0.045, 8, 28),
    mat('#d9ffb0', {emissive: '#b6ff6a', emissiveIntensity: 0.9})
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.08;
  ring.add(glow);
  const caps = new T.InstancedMesh(
    new T.SphereGeometry(0.16, 10, 8),
    mat('#c8f26a', {emissive: '#b6ff6a', emissiveIntensity: 0.8}),
    12
  );
  const stems = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.07, 0.22, 6), mat('#f4ecd4'), 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    paint(caps, i, Math.cos(a) * 1.7, 0.34, Math.sin(a) * 1.7, 1, 0.72, 1);
    paint(stems, i, Math.cos(a) * 1.7, 0.12, Math.sin(a) * 1.7, 1, 1, 1);
  }
  caps.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
  ring.add(caps, stems);
  scene.userData.ring = ring;

  function sync(run, time) {
    const gone = run?.gone ?? {};
    const bridge = run?.bridge ?? {};
    boxes.forEach((tile, i) => {
      const live = boxOf(tile, run ?? {time: 0});
      const sink = tile.kind === 'bridge' ? Math.min(0.8, (bridge[tile.id] ?? 0) * 0.25) : 0;
      const show = gone[tile.id] ? 0 : 1;
      const brick = tile.smash ? 0.88 : 1;
      paint(boxMesh, i, live.x + live.w / 2, live.y + live.h / 2 - sink, FACE_Z, live.w * show, live.h * brick * show, 0.42 * show);
    });
    springs.forEach((tile, i) => {
      const live = boxOf(tile, run ?? {time});
      paint(springMesh, i, live.x + live.w / 2, live.y + 0.46, 0.08, 0.28, 0.48, 0.28);
    });
    coins.forEach((tile, i) => {
      const show = run?.riders?.some(rider => rider.got?.[tile.id]) ? 0 : 1;
      paint(coinMesh, i, tile.x + tile.w / 2, tile.y + 0.36, 0.18, 0.22 * show, 0.22 * show, 1, time * 3 + i);
    });
    mushrooms.forEach((tile, i) => {
      const bob = Math.sin(time * 2 + i) * 0.04;
      paint(capMesh, i, tile.x + tile.w / 2, tile.y + tile.h * 0.72 + bob, 0.08, tile.w * 0.85, tile.h * 0.55, tile.w * 0.85);
      paint(stemMesh, i, tile.x + tile.w / 2, tile.y + tile.h * 0.28, 0.08, 0.16, tile.h * 0.45, 0.16);
    });
    marks.forEach((tile, i) => paint(markMesh, i, tile.x + tile.w / 2, tile.y + 0.45, 0.1, 0.12, 0.9, 0.12));
    boxMesh.instanceMatrix.needsUpdate = true;
    springMesh.instanceMatrix.needsUpdate = true;
    coinMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
    stemMesh.instanceMatrix.needsUpdate = true;
    if (flagTile) {
      flag.position.set(flagTile.x + 0.1, flagTile.y, PLANE_Z);
      cloth.rotation.y = Math.sin(time * 4) * 0.35;
      flag.visible = true;
    }
    const pulse = 0.55 + Math.sin(time * 3) * 0.35;
    glow.material.emissiveIntensity = 0.5 + pulse;
    caps.material.emissiveIntensity = 0.45 + pulse;
  }

  sync(null, 0);
  return {scene, ring, sync};
}
