import * as T from '../vendor/three.module.js';
import {makeRobotBody, poseRobotBody} from './robot-body.js';
import {CHARACTERS} from './open-world/characters.js';

// The dark world's old toys (docs/design/adventure: the past is a toy western). Same physics as
// the car and the robot; only the toy you see changes, as Link turns into a bunny.

// The car's twin is a toy dinosaur you ride (owner, 31 Oct: "instead of riding horses you're riding
// dinosaurs ... it makes the characters bigger"). A painted toy T. rex, far under real size but
// about four times the cowboy: 1.2 m to the top of its head, 2 m nose to tail. The cowboy rides in
// the saddle. Front at -z like the car shells; feet at y 0, so the pose drops it by the car's ride
// height. Same car physics underneath (a slice: the collider is still the car's).
export const DINO_SCALE = 4; // dinosaur height over the cowboy's
export function makeToyDino(paint = '#5f9a4a') {
  const g = new T.Group();
  g.name = 'ToyDino';
  const hide = new T.MeshStandardMaterial({color: paint, roughness: 0.5});
  const belly = new T.MeshStandardMaterial({color: '#e8d9a8', roughness: 0.55});
  const plates = new T.MeshStandardMaterial({color: '#e2873a', roughness: 0.45});
  const dark = new T.MeshStandardMaterial({color: '#2a2420', roughness: 0.7});
  const tooth = new T.MeshStandardMaterial({color: '#fbf6e8', roughness: 0.4});
  const red = new T.MeshStandardMaterial({color: '#b8352b', roughness: 0.45});
  const leather = new T.MeshStandardMaterial({color: '#6b3f22', roughness: 0.7});
  const box = (w, h, d, m, x, y, z, parent = g) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  // Body: a leaning barrel, belly paint underneath.
  const body = new T.Group();
  body.position.set(0, 0.78, 0.05);
  body.rotation.x = -0.18;
  g.add(body);
  const barrel = new T.Mesh(new T.CapsuleGeometry(0.22, 0.42, 6, 14), hide);
  barrel.rotation.x = Math.PI / 2;
  barrel.castShadow = true;
  body.add(barrel);
  box(0.3, 0.12, 0.5, belly, 0, -0.15, 0, body);
  // Neck and the big head, its jaw on a hinge, a row of toy teeth.
  const neck = new T.Group();
  neck.position.set(0, 0.92, -0.32);
  neck.rotation.x = -0.15;
  g.add(neck);
  box(0.22, 0.55, 0.22, hide, 0, 0.25, 0, neck);
  const head = new T.Group();
  head.position.set(0, 0.56, -0.1);
  neck.add(head);
  box(0.32, 0.26, 0.5, hide, 0, 0, -0.14, head);
  for (const x of [-0.08, 0.08]) {
    box(0.05, 0.05, 0.03, tooth, x, 0.06, -0.06, head);
    box(0.025, 0.025, 0.03, dark, x * 1.05, 0.07, -0.075, head);
  } // eyes
  for (let i = 0; i < 6; i++) box(0.025, 0.04, 0.02, tooth, -0.1 + i * 0.04, -0.11, -0.3, head);
  const jaw = new T.Group();
  jaw.position.set(0, -0.08, 0.05);
  head.add(jaw);
  box(0.22, 0.07, 0.36, belly, 0, -0.04, -0.14, jaw);
  box(0.24, 0.03, 0.03, red, 0, 0.02, -0.22, head); // bridle
  // Back plates, the toy's fun bit, and the tail swinging behind.
  for (let i = 0; i < 5; i++) {
    const p = box(0.04, 0.12 - Math.abs(i - 2) * 0.015, 0.1, plates, 0, 0.26, -0.18 + i * 0.12, body);
    p.rotation.x = 0.2;
  }
  const tail = new T.Group();
  tail.position.set(0, 0.78, 0.33);
  g.add(tail);
  const cone = new T.Mesh(new T.ConeGeometry(0.17, 0.85, 10), hide);
  cone.rotation.x = Math.PI / 2 - 0.55;
  cone.position.set(0, 0.2, 0.36);
  cone.castShadow = true;
  tail.add(cone);
  // Little arms, which is the joke.
  const arms = [-1, 1].map(s => {
    const a = new T.Group();
    a.position.set(s * 0.17, 0.78, -0.3);
    g.add(a);
    box(0.05, 0.14, 0.05, hide, 0, -0.06, -0.02, a);
    return a;
  });
  // Big hind legs: thigh, shin, a three-toed foot.
  const legs = [-1, 1].map(s => {
    const hip = new T.Group();
    hip.position.set(s * 0.2, 0.72, 0.1);
    g.add(hip);
    box(0.15, 0.38, 0.2, hide, 0, -0.15, 0, hip);
    const knee = new T.Group();
    knee.position.set(0, -0.34, 0.02);
    hip.add(knee);
    box(0.1, 0.33, 0.11, hide, 0, -0.16, 0.03, knee);
    box(0.16, 0.05, 0.24, dark, 0, -0.35, -0.06, knee);
    return {hip, knee};
  });
  // Saddle, stirrups and the cowboy riding.
  box(0.34, 0.04, 0.34, red, 0, 1.0, 0.02);
  box(0.26, 0.07, 0.26, leather, 0, 1.04, 0.02);
  box(0.05, 0.08, 0.05, leather, 0, 1.1, -0.1);
  for (const x of [-0.19, 0.19]) box(0.02, 0.22, 0.02, leather, x, 0.9, 0.02);
  const rider = makeToyCowboy();
  rider.position.set(0, 0.95, 0.03);
  g.add(rider);
  const {legs: rl, arms: ra} = rider.userData;
  rl[0].rotation.set(-1.2, 0, -0.5);
  rl[1].rotation.set(-1.2, 0, 0.5);
  ra[0].rotation.x = ra[1].rotation.x = -1.1;
  g.userData = {
    legs,
    arms,
    neck,
    jaw,
    tail,
    rider,
    gait: 0,
    materials: [hide, belly, plates, dark, tooth, red, leather, ...rider.userData.materials]
  };
  return g;
}

/** car: the physics car (pos, q, vel). rideHeight: its origin above the ground. */
export function poseToyDino(g, car, rideHeight = 0.1, dt = 1 / 60) {
  g.position.set(...car.pos);
  g.quaternion.set(...car.q);
  g.translateY(-rideHeight);
  const {legs, arms, neck, jaw, tail, rider} = g.userData,
    speed = Math.hypot(car.vel[0], car.vel[2]);
  // A two-legged run: big strides, the body bobbing and the tail swinging against them.
  g.userData.gait += dt * Math.min(14, 2 + speed * 1.1);
  const swing = Math.min(0.8, speed * 0.12),
    s = Math.sin(g.userData.gait);
  legs[0].hip.rotation.x = s * swing;
  legs[1].hip.rotation.x = -s * swing;
  legs[0].knee.rotation.x = Math.max(0, -s) * swing * 1.2;
  legs[1].knee.rotation.x = Math.max(0, s) * swing * 1.2;
  arms.forEach((a, i) => {
    a.rotation.x = Math.sin(g.userData.gait * 2 + i) * 0.4;
  });
  tail.rotation.y = s * swing * 0.35;
  tail.rotation.x = -swing * 0.15;
  neck.rotation.x = -0.15 + Math.cos(g.userData.gait * 2) * swing * 0.08;
  // It roars now and then: the jaw drops open.
  const t = (g.userData.gait * 0.13) % 6.28;
  jaw.rotation.x = t > 5.6 ? 0.45 : 0.05;
  const bob = Math.abs(Math.cos(g.userData.gait)) * swing * 0.05;
  rider.position.y = 0.95 + bob * 0.6;
  g.translateY(bob);
}

// The robot's twin: a painted tin cowboy. The same jointed body (so climbing and walking pose it
// the same way) in tin and denim, with a hat, a bandana and a cork gun on the hip.
export function makeToyCowboy() {
  const g = makeRobotBody('#5e7fa8');
  g.name = 'ToyCowboy';
  const {head} = g.userData;
  const felt = new T.MeshStandardMaterial({color: '#7a4f2c', roughness: 0.7});
  const skin = new T.MeshStandardMaterial({color: '#e8b98f', roughness: 0.55});
  const bandana = new T.MeshStandardMaterial({color: '#c8352d', roughness: 0.5});
  const tin = new T.MeshStandardMaterial({color: '#c8c2b4', roughness: 0.3, metalness: 0.7});
  const star = new T.MeshStandardMaterial({
    color: '#e8c14a',
    emissive: '#7a5a10',
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.8
  });
  // A painted face over the visor: the cowboy has eyes, not a light.
  g.traverse(o => {
    if (o.isMesh && o.material?.emissive?.getHex()) o.material = skin;
  });
  const add = (geo, m, x, y, z, parent = head) => {
    const o = new T.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  add(new T.BoxGeometry(0.075, 0.03, 0.012), skin, 0, -0.002, -0.041);
  for (const x of [-0.018, 0.018]) add(new T.BoxGeometry(0.008, 0.008, 0.004), felt, x, 0.004, -0.048);
  // Hat: a wide brim and a pinched crown.
  add(new T.CylinderGeometry(0.075, 0.075, 0.006, 20), felt, 0, 0.036, 0);
  add(new T.CylinderGeometry(0.034, 0.042, 0.04, 16), felt, 0, 0.058, 0);
  add(new T.CylinderGeometry(0.043, 0.043, 0.008, 16), bandana, 0, 0.043, 0); // hatband
  // Bandana at the neck, sheriff's star, tin belt and a cork gun.
  add(new T.ConeGeometry(0.03, 0.04, 4), bandana, 0, 0.225, -0.045, g).rotation.x = Math.PI;
  add(new T.CylinderGeometry(0.012, 0.012, 0.004, 5), star, -0.04, 0.2, -0.047, g).rotation.x = Math.PI / 2;
  add(new T.BoxGeometry(0.155, 0.018, 0.095), tin, 0, 0.145, 0, g);
  add(new T.BoxGeometry(0.018, 0.05, 0.03), felt, 0.085, 0.12, 0, g);
  // Hide the robot's antenna: cowboys don't have one.
  head.children.forEach(o => {
    if (o.isMesh && o.geometry.parameters?.height === 0.04 && o.geometry.parameters?.width === 0.006)
      o.visible = false;
  });
  g.userData.materials = [...(g.userData.materials ?? []), felt, skin, bandana, tin, star];
  return g;
}
export const poseToyCowboy = poseRobotBody;

// The rigged dinosaur (open-world/characters.js, docs/rc-characters.md) replaces the parts-built
// one above once its GLB has loaded: skinned, with idle / walk / run / jump clips. Spawned at
// RIG_SCALE so it is about 2 m nose to tail, the toy cowboy riding on its Saddle empty and kept
// toy-sized (the scale is undone on him). The parts-built dinosaur stays the fallback.
export const RIG_SCALE = 1.5;
export function rideRiggedDino(d) {
  d.root.scale.setScalar(RIG_SCALE);
  const rider = makeToyCowboy();
  rider.scale.setScalar(1 / RIG_SCALE);
  rider.position.y = -0.12 / RIG_SCALE;
  const {legs, arms} = rider.userData;
  legs[0].rotation.set(-1.2, 0, -0.5);
  legs[1].rotation.set(-1.2, 0, 0.5);
  arms[0].rotation.x = arms[1].rotation.x = -1.1;
  d.saddle()?.add(rider);
  d.rider = rider;
  d.air = 0;
  return d;
}
/** Pose and animate from the physics car: idle, walk or run by speed, and a jump when it leaves the
 *  ground. The clips speed up with the car, capped: true no-slide rates at 13 m/s would be a blur
 *  (the run clip covers 1.25 m/s at this scale), so the feet skate a little at full tilt. */
export function poseRiggedDino(d, car, rideHeight = 0.1, dt = 1 / 60, flight = null) {
  d.root.position.set(...car.pos);
  d.root.quaternion.set(...car.q);
  d.root.translateY(-rideHeight);
  // Each kind's own stride speeds (characters.js CHARACTERS[kind].clips[*].groundSpeedMps).
  const clips = CHARACTERS[d.kind]?.clips ?? CHARACTERS.dino.clips,
    speed = Math.hypot(car.vel[0], car.vel[2]),
    ground = {
      walk: clips.walk?.groundSpeedMps || 0.3,
      run: clips.run?.groundSpeedMps || 0.833,
      gallop: clips.gallop?.groundSpeedMps || 4
    },
    airborne = car.contacts === 0;
  d.air = airborne ? d.air + dt : 0;
  // A flier in the air (the quetzalcoatlus on the toy jet's flight model): take off, then flap while
  // climbing or slow and glide otherwise; land when it touches down. Its own clips fold the wings
  // and hide the legs by bone scale, so nothing here touches bone scales.
  if (d.actions.has('glide')) {
    if (flight) {
      if (!d.flying) {
        d.flying = true;
        d.play('takeoff', {then: 'flap', fade: 0.1});
      } else if (d.clip !== 'takeoff') d.play(car.vel[1] > 0.6 || speed < 9 ? 'flap' : 'glide', {fade: 0.35});
      d.update(dt);
      return;
    }
    if (d.flying) {
      d.flying = false;
      d.play('land', {then: 'idle', fade: 0.1});
    }
    if (d.clip === 'land') {
      d.update(dt);
      return;
    }
  }
  if (d.air > 0.18 && d.clip !== 'jump') d.play('jump', {then: 'run', fade: 0.1});
  else if (!airborne && d.clip !== 'jump') {
    // A gallop clip (no foot slide near 4 m/s at export scale) takes over at speed once the GLB has
    // one; until then the run clip stretches to cover it.
    const gallop = d.actions.has('gallop'),
      clip = speed < 0.25 ? 'idle' : speed < 2.2 ? 'walk' : gallop && speed > 5 ? 'gallop' : 'run';
    const rate =
      clip === 'gallop'
        ? Math.min(2.2, speed / (ground.gallop * RIG_SCALE))
        : speed / (ground[clip] * RIG_SCALE * (clip === 'run' ? (gallop ? 2 : 6) : 4));
    d.play(clip, {timeScale: clip === 'idle' ? 1 : Math.min(3, Math.max(0.5, rate))});
  }
  d.update(dt);
}

// Each dinosaur in its own colours (open-world/herd.mjs DINO_COLOURS): the body and spike materials
// are cloned for this instance the first time, so tinting one never recolours the others.
export function tintDino(d, [body, spikes]) {
  if (!d.tint) {
    d.tint = {};
    d.root.traverse(o => {
      if (!o.isMesh) return;
      const one = m => {
        if (/(_Green|_Body|_Orange|_Accent)$/.test(m.name)) {
          const c = (d.tint[m.name] ??= m.clone());
          return c;
        }
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
  }
  for (const [name, m] of Object.entries(d.tint)) m.color.set(/(_Green|_Body)$/.test(name) ? body : spikes);
  return d;
}
/** A wild one: no saddle (it hasn't been ridden). */
export function wildDino(d) {
  d.root.traverse(o => {
    if (!o.isMesh) return;
    const one = m => {
      if (m.name !== 'Saddle_Brown') return m;
      const c = m.clone();
      c.visible = false;
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  d.root.scale.setScalar(RIG_SCALE);
  return d;
}
