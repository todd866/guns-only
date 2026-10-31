import * as T from '../../vendor/three.module.js';
import {pinRack} from './bowling.mjs';
export function createBowlingVisual(scene) {
  const points = [
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
      10
    ),
    stripes = new T.InstancedMesh(
      new T.CylinderGeometry(0.077, 0.077, 0.08, 12),
      new T.MeshStandardMaterial({color: '#bc5e54'}),
      10
    ),
    o = new T.Object3D(),
    stripe = new T.Object3D(),
    rack = pinRack();
  body.castShadow = true;
  body.frustumCulled = stripes.frustumCulled = false;
  scene.add(body, stripes);
  return {
    update(game) {
      const pins = game?.kind === 'bowling' ? game.pins : rack;
      pins.forEach((p, i) => {
        o.position.set(p.pos[0], 0.03, p.pos[1]);
        o.rotation.x = -(p.fall ?? 0) * 1.45;
        o.updateMatrix();
        body.setMatrixAt(i, o.matrix);
        stripe.position.set(0, 0.56, 0);
        stripe.updateMatrix();
        stripes.setMatrixAt(i, new T.Matrix4().multiplyMatrices(o.matrix, stripe.matrix));
      });
      body.instanceMatrix.needsUpdate = stripes.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [body, stripes]) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  };
}
