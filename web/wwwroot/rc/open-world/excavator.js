import * as T from '../../vendor/three.module.js';
import {BOSS} from '../physics/boss.mjs';

// The boss, drawn: a chunky yellow toy excavator with tracks, a cab, and a long arm and bucket.
// The bad aliens' signal shows as a red glowing control box on the cab front (the weak point). It
// pulses fast on a tell, the slam drops a red warning ring, and freed it turns friendly blue.
export function createExcavator(scene, origin, yaw = 0) {
  const root = new T.Group();
  root.name = 'Excavator';
  root.position.set(...origin);
  root.rotation.y = yaw;
  scene.add(root);
  const m = c => new T.MeshStandardMaterial({color: c, roughness: 0.45, metalness: 0.25});
  const mats = {
    yellow: m('#f2b519'),
    dark: m('#2b2b30'),
    glass: new T.MeshStandardMaterial({
      color: '#9fd6ff',
      roughness: 0.1,
      metalness: 0.6,
      transparent: true,
      opacity: 0.7
    }),
    box: new T.MeshStandardMaterial({color: '#ff3030', emissive: '#ff1010', emissiveIntensity: 1.5}),
    ring: new T.MeshBasicMaterial({
      color: '#ff3a2a',
      transparent: true,
      opacity: 0.5,
      side: T.DoubleSide,
      depthWrite: false
    })
  };
  const add = (parent, geo, mat, x, y, z) => {
    const o = new T.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  // Tracks and body (cover the collision boxes: body z -.7..1.2, step 1.2..1.8 local).
  for (const x of [-1.05, 1.05]) add(root, new T.BoxGeometry(0.4, 0.35, 2.1), mats.dark, x, 0.175, 0.1);
  add(root, new T.BoxGeometry(2.5, 0.55, 1.95), mats.yellow, 0, 0.6, 0.25);
  add(root, new T.BoxGeometry(2.45, 0.3, 0.62), mats.dark, 0, 0.15, 1.5); // the cab step
  const cab = add(root, new T.BoxGeometry(1.1, 0.8, 0.9), mats.yellow, -0.5, 1.27, 0.4);
  add(cab, new T.BoxGeometry(0.9, 0.45, 0.02), mats.glass, 0, 0.1, 0.46);
  const box = add(root, new T.BoxGeometry(0.32, 0.26, 0.12), mats.box, 0, BOSS.weak.at[1], 1.24);
  // The arm: a boom from the body's right, a stick, and a bucket; the whole arm yaws for the sweep.
  const arm = new T.Group();
  arm.position.set(0.55, 0.9, 0.4);
  root.add(arm);
  const boom = new T.Group();
  boom.rotation.x = -0.5;
  arm.add(boom);
  add(boom, new T.BoxGeometry(0.22, 0.22, 1.9), mats.yellow, 0, 0, 0.95);
  const stick = new T.Group();
  stick.position.z = 1.9;
  boom.add(stick);
  add(stick, new T.BoxGeometry(0.18, 0.18, 1.2), mats.yellow, 0, 0, 0.6);
  const bucket = add(stick, new T.BoxGeometry(0.6, 0.4, 0.35), mats.dark, 0, 0, 1.3);
  for (const x of [-0.22, 0, 0.22])
    add(bucket, new T.ConeGeometry(0.05, 0.14, 6), mats.dark, x, -0.25, 0.1).rotation.x = Math.PI;
  const ring = new T.Mesh(new T.RingGeometry(BOSS.slam.ring * 0.85, BOSS.slam.ring, 40), mats.ring);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let shake = 0;
  return {
    root,
    /** Pose from the boss state (physics/boss.mjs) and the mine floor height. */
    sync(b, time, dt, floorY) {
      const s = b.state;
      // Sweep: arm low, swinging across; slam: raised over the ring, then dropped and stuck; freed: parked.
      let yawArm = 0,
        lift = -0.5,
        curl = 0.9;
      if (s === 'sweepWindup') {
        yawArm = -1.4 - 0.15 * Math.sin(time * 20);
        lift = -0.1;
        curl = 1.6;
      } else if (s === 'sweep') {
        yawArm = b.sweepAngle;
        lift = 0.05;
        curl = 1.6;
      } else if (s === 'slamAim' && b.ring) {
        const dx = b.ring[0] - root.position.x,
          dz = b.ring[2] - root.position.z;
        yawArm = Math.atan2(dx, dz) - yaw;
        lift = -0.85;
        curl = 0.3;
      } else if (s === 'stuck') {
        lift = 0.15;
        curl = 1.2;
      }
      arm.rotation.y += (yawArm - arm.rotation.y) * Math.min(1, (s === 'sweep' ? 30 : 6) * dt);
      boom.rotation.x += (lift - boom.rotation.x) * Math.min(1, (s === 'stuck' ? 25 : 5) * dt);
      stick.rotation.x += (curl - stick.rotation.x) * Math.min(1, 6 * dt);
      ring.visible = s === 'slamAim' && !!b.ring;
      if (ring.visible) {
        ring.position.set(b.ring[0], Math.max(floorY, b.ring[1]) + 0.02, b.ring[2]);
        ring.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(time * (6 + 10 * b.t)));
      }
      if (b.flash > 0) shake = 0.4;
      shake = Math.max(0, shake - dt);
      root.position.x = origin[0] + Math.sin(time * 60) * shake * 0.05;
      const tell = s === 'sweepWindup' || s === 'slamAim';
      box.material.emissiveIntensity = b.freed
        ? 0.8
        : s === 'stuck'
          ? 2.5 + 1.5 * Math.sin(time * 12)
          : tell
            ? 1 + Math.sin(time * 25)
            : 0.6;
      if (b.freed) {
        box.material.color.set('#4fc3ff');
        box.material.emissive.set('#2aa8ff');
      }
    },
    dispose() {
      root.removeFromParent();
      ring.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      ring.geometry.dispose();
      Object.values(mats).forEach(x => x.dispose());
    }
  };
}
