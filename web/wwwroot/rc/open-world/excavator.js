import * as T from '../../vendor/three.module.js';
import {BOSS} from '../physics/boss.mjs';

// The boss, drawn: a chunky yellow toy excavator with tracks, a cab, and a long arm and bucket.
// The bad aliens' signal shows as a red glowing control box on the cab front (the weak point). It
// pulses fast on a tell, the slam drops a red warning ring, and freed it turns friendly blue.
export function createExcavator(scene, origin, yaw = 0) {
  const root = new T.Group(); root.name = 'Excavator'; root.position.set(...origin); root.rotation.y = yaw; scene.add(root);
  const m = c => new T.MeshStandardMaterial({ color: c, roughness: .45, metalness: .25 });
  const mats = { yellow: m('#f2b519'), dark: m('#2b2b30'), glass: new T.MeshStandardMaterial({ color: '#9fd6ff', roughness: .1, metalness: .6, transparent: true, opacity: .7 }),
    box: new T.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1010', emissiveIntensity: 1.5 }), ring: new T.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: .5, side: T.DoubleSide, depthWrite: false }) };
  const add = (parent, geo, mat, x, y, z) => { const o = new T.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // Tracks and body (cover the collision boxes: body z -.7..1.2, step 1.2..1.8 local).
  for (const x of [-1.05, 1.05]) add(root, new T.BoxGeometry(.4, .35, 2.1), mats.dark, x, .175, .1);
  add(root, new T.BoxGeometry(2.5, .55, 1.95), mats.yellow, 0, .6, .25);
  add(root, new T.BoxGeometry(2.45, .3, .62), mats.dark, 0, .15, 1.5);                       // the cab step
  const cab = add(root, new T.BoxGeometry(1.1, .8, .9), mats.yellow, -.5, 1.27, .4);
  add(cab, new T.BoxGeometry(.9, .45, .02), mats.glass, 0, .1, .46);
  const box = add(root, new T.BoxGeometry(.32, .26, .12), mats.box, 0, BOSS.weak.at[1], 1.24);
  // The arm: a boom from the body's right, a stick, and a bucket; the whole arm yaws for the sweep.
  const arm = new T.Group(); arm.position.set(.55, .9, .4); root.add(arm);
  const boom = new T.Group(); boom.rotation.x = -.5; arm.add(boom);
  add(boom, new T.BoxGeometry(.22, .22, 1.9), mats.yellow, 0, 0, .95);
  const stick = new T.Group(); stick.position.z = 1.9; boom.add(stick);
  add(stick, new T.BoxGeometry(.18, .18, 1.2), mats.yellow, 0, 0, .6);
  const bucket = add(stick, new T.BoxGeometry(.6, .4, .35), mats.dark, 0, 0, 1.3);
  for (const x of [-.22, 0, .22]) add(bucket, new T.ConeGeometry(.05, .14, 6), mats.dark, x, -.25, .1).rotation.x = Math.PI;
  const ring = new T.Mesh(new T.RingGeometry(BOSS.slam.ring * .85, BOSS.slam.ring, 40), mats.ring); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  let shake = 0;
  return {
    root,
    /** Pose from the boss state (physics/boss.mjs) and the mine floor height. */
    sync(b, time, dt, floorY) {
      const s = b.state;
      // Sweep: arm low, swinging across; slam: raised over the ring, then dropped and stuck; freed: parked.
      let yawArm = 0, lift = -.5, curl = .9;
      if (s === 'sweepWindup') { yawArm = -1.4 - .15 * Math.sin(time * 20); lift = -.1; curl = 1.6; }
      else if (s === 'sweep') { yawArm = b.sweepAngle; lift = .05; curl = 1.6; }
      else if (s === 'slamAim' && b.ring) { const dx = b.ring[0] - root.position.x, dz = b.ring[2] - root.position.z; yawArm = Math.atan2(dx, dz) - yaw; lift = -.85; curl = .3; }
      else if (s === 'stuck') { lift = .15; curl = 1.2; }
      arm.rotation.y += (yawArm - arm.rotation.y) * Math.min(1, (s === 'sweep' ? 30 : 6) * dt);
      boom.rotation.x += (lift - boom.rotation.x) * Math.min(1, (s === 'stuck' ? 25 : 5) * dt);
      stick.rotation.x += (curl - stick.rotation.x) * Math.min(1, 6 * dt);
      ring.visible = s === 'slamAim' && !!b.ring;
      if (ring.visible) { ring.position.set(b.ring[0], Math.max(floorY, b.ring[1]) + .02, b.ring[2]); ring.material.opacity = .35 + .3 * Math.abs(Math.sin(time * (6 + 10 * b.t))); }
      if (b.flash > 0) shake = .4;
      shake = Math.max(0, shake - dt); root.position.x = origin[0] + Math.sin(time * 60) * shake * .05;
      const tell = s === 'sweepWindup' || s === 'slamAim';
      box.material.emissiveIntensity = b.freed ? .8 : s === 'stuck' ? 2.5 + 1.5 * Math.sin(time * 12) : tell ? 1 + Math.sin(time * 25) : .6;
      if (b.freed) { box.material.color.set('#4fc3ff'); box.material.emissive.set('#2aa8ff'); }
    },
    dispose() { root.removeFromParent(); ring.removeFromParent(); root.traverse(o => o.geometry?.dispose()); ring.geometry.dispose(); Object.values(mats).forEach(x => x.dispose()); },
  };
}
