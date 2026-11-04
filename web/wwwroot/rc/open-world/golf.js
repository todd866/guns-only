import * as T from '../../vendor/three.module.js';
import {GOLF_HOLES} from './golf.mjs';
export function createGolfVisual(scene) {
  const ball = new T.Mesh(
    new T.SphereGeometry(0.44, 20, 12),
    new T.MeshStandardMaterial({color: '#f3e8bf', roughness: 0.55})
  );
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const cups = GOLF_HOLES.map(h => {
    const m = new T.Mesh(new T.CircleGeometry(0.8, 24), new T.MeshBasicMaterial({color: '#233e35'}));
    m.rotation.x = -Math.PI / 2;
    m.position.set(h.cup[0], 0.045, h.cup[1]);
    scene.add(m);
    return m;
  });
  return {
    update(g) {
      ball.visible = !!g && !g.done;
      if (g) {
        ball.position.set(g.ball[0], g.sinking ? Math.max(0.05, (0.44 * g.sinking) / 1.2) : 0.44, g.ball[1]);
        for (let i = 0; i < cups.length; i++)
          cups[i].material.color.set(i === g.hole ? '#132d29' : '#557d59');
      }
    },
    dispose() {
      for (const m of [ball, ...cups]) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose();
      }
    }
  };
}
