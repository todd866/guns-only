import * as T from '../../vendor/three.module.js';
import {pinRack, BALL_RADIUS} from './bowling.mjs';
import {LANES, ALLEY_FLOOR_Y, RACE_LANES} from './bowling-alley.mjs';
export function createBowlingVisual(scene) {
  const root = new T.Group(),
    points = [
      [0, 0],
      [0.13, 0],
      [0.18, 0.12],
      [0.16, 0.3],
      [0.07, 0.5],
      [0.07, 0.6],
      [0.12, 0.7],
      [0.1, 0.8],
      [0, 0.84]
    ].map(p => new T.Vector2(...p)),
    body = new T.InstancedMesh(
      new T.LatheGeometry(points, 12),
      new T.MeshStandardMaterial({color: '#efe4c8', roughness: 0.4}),
      60
    ),
    stripes = new T.InstancedMesh(
      new T.CylinderGeometry(0.077, 0.077, 0.08, 12),
      new T.MeshStandardMaterial({color: '#bc5e54'}),
      60
    ),
    o = new T.Object3D(),
    stripe = new T.Object3D(),
    matrix = new T.Matrix4(),
    racks = LANES.map(l => pinRack(l.id)),
    ball = new T.Group(),
    axis = new T.Vector3(),
    sphere = new T.Mesh(
      new T.SphereGeometry(BALL_RADIUS, 20, 14),
      new T.MeshStandardMaterial({color: '#813fce', roughness: 0.18, metalness: 0.2})
    ),
    holeGeo = new T.SphereGeometry(0.018, 8, 6),
    holeMat = new T.MeshStandardMaterial({color: '#211334'}),
    aim = new T.Line(
      new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]),
      new T.LineBasicMaterial({color: '#ffe47e'})
    );
  ball.add(sphere);
  for (const [x, z] of [
    [-0.027, -0.025],
    [0.027, -0.025],
    [0, 0.035]
  ]) {
    const hole = new T.Mesh(holeGeo, holeMat);
    hole.position.set(x, BALL_RADIUS - 0.01, z);
    ball.add(hole);
  }
  body.castShadow = sphere.castShadow = true;
  body.frustumCulled = stripes.frustumCulled = aim.frustumCulled = false;
  root.add(body, stripes, ball, aim);
  scene.add(root);
  stripe.position.set(0, 0.56, 0);
  stripe.updateMatrix();
  const api = {
    update(game, raceId = null) {
      const g = game?.kind === 'bowling' ? game : null;
      LANES.forEach((lane, laneIndex) => {
        const pins = g?.lane === lane.id ? g.pins : racks[laneIndex];
        pins.forEach((p, i) => {
          o.position.set(p.pos[0], ALLEY_FLOOR_Y + 0.003, p.pos[1]);
          o.rotation.set(-(p.fall ?? 0) * 1.45, 0, 0);
          o.scale.setScalar(p.removed || (raceId === 'alley-cat' && RACE_LANES.includes(lane.id)) ? 0 : 0.5);
          o.updateMatrix();
          body.setMatrixAt(laneIndex * 10 + i, o.matrix);
          stripes.setMatrixAt(laneIndex * 10 + i, matrix.multiplyMatrices(o.matrix, stripe.matrix));
        });
      });
      body.instanceMatrix.needsUpdate = stripes.instanceMatrix.needsUpdate = true;
      ball.visible = !!g && g.control === 'robot' && !g.done;
      aim.visible = ball.visible && !g.launched;
      if (ball.visible) {
        const lane = LANES[g.lane - 1];
        ball.position.set(...(g.ball?.pos ?? [lane.x, ALLEY_FLOOR_Y + BALL_RADIUS, lane.startZ]));
        if (g.ball) {
          axis.set(g.ball.vel[2], 0, -g.ball.vel[0]).normalize();
          ball.quaternion.setFromAxisAngle(axis, g.ball.travel / BALL_RADIUS);
        } else {
          ball.rotation.set(0, 0, 0);
          const a = g.aim ?? 0,
            attr = aim.geometry.attributes.position;
          attr.setXYZ(0, lane.x, ALLEY_FLOOR_Y + 0.02, lane.startZ);
          attr.setXYZ(1, lane.x + Math.sin(a) * 2.5, ALLEY_FLOOR_Y + 0.02, lane.startZ - Math.cos(a) * 2.5);
          attr.needsUpdate = true;
        }
      }
    },
    dispose() {
      root.removeFromParent();
      const geometries = new Set(),
        materials = new Set();
      root.traverse(m => {
        if (m.geometry) geometries.add(m.geometry);
        if (m.material) materials.add(m.material);
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
  api.update(null);
  return api;
}
