import * as T from '../vendor/three.module.js';
import { makeRobotBody, poseRobotBody } from './robot-body.js';

// The dark world's old toys (docs/design/adventure: the past is a toy western). Same physics as
// the car and the robot; only the toy you see changes, as Link turns into a bunny.

// The car's twin is a toy dinosaur you ride (owner, 31 Oct: "instead of riding horses you're riding
// dinosaurs ... it makes the characters bigger"). A painted toy T. rex, far under real size but
// about four times the cowboy: 1.2 m to the top of its head, 2 m nose to tail. The cowboy rides in
// the saddle. Front at -z like the car shells; feet at y 0, so the pose drops it by the car's ride
// height. Same car physics underneath (a slice: the collider is still the car's).
export const DINO_SCALE = 4;   // dinosaur height over the cowboy's
export function makeToyDino(paint = '#5f9a4a') {
  const g = new T.Group(); g.name = 'ToyDino';
  const hide = new T.MeshStandardMaterial({ color: paint, roughness: .5 });
  const belly = new T.MeshStandardMaterial({ color: '#e8d9a8', roughness: .55 });
  const plates = new T.MeshStandardMaterial({ color: '#e2873a', roughness: .45 });
  const dark = new T.MeshStandardMaterial({ color: '#2a2420', roughness: .7 });
  const tooth = new T.MeshStandardMaterial({ color: '#fbf6e8', roughness: .4 });
  const red = new T.MeshStandardMaterial({ color: '#b8352b', roughness: .45 });
  const leather = new T.MeshStandardMaterial({ color: '#6b3f22', roughness: .7 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // Body: a leaning barrel, belly paint underneath.
  const body = new T.Group(); body.position.set(0, .78, .05); body.rotation.x = -.18; g.add(body);
  const barrel = new T.Mesh(new T.CapsuleGeometry(.22, .42, 6, 14), hide); barrel.rotation.x = Math.PI / 2; barrel.castShadow = true; body.add(barrel);
  box(.3, .12, .5, belly, 0, -.15, 0, body);
  // Neck and the big head, its jaw on a hinge, a row of toy teeth.
  const neck = new T.Group(); neck.position.set(0, .92, -.32); neck.rotation.x = -.15; g.add(neck);
  box(.22, .55, .22, hide, 0, .25, 0, neck);
  const head = new T.Group(); head.position.set(0, .56, -.1); neck.add(head);
  box(.32, .26, .5, hide, 0, 0, -.14, head);
  for (const x of [-.08, .08]) { box(.05, .05, .03, tooth, x, .06, -.06, head); box(.025, .025, .03, dark, x * 1.05, .07, -.075, head); }   // eyes
  for (let i = 0; i < 6; i++) box(.025, .04, .02, tooth, -.1 + i * .04, -.11, -.3, head);
  const jaw = new T.Group(); jaw.position.set(0, -.08, .05); head.add(jaw);
  box(.22, .07, .36, belly, 0, -.04, -.14, jaw);
  box(.24, .03, .03, red, 0, .02, -.22, head);   // bridle
  // Back plates, the toy's fun bit, and the tail swinging behind.
  for (let i = 0; i < 5; i++) { const p = box(.04, .12 - Math.abs(i - 2) * .015, .1, plates, 0, .26, -.18 + i * .12, body); p.rotation.x = .2; }
  const tail = new T.Group(); tail.position.set(0, .78, .33); g.add(tail);
  const cone = new T.Mesh(new T.ConeGeometry(.17, .85, 10), hide); cone.rotation.x = Math.PI / 2 - .55; cone.position.set(0, .2, .36); cone.castShadow = true; tail.add(cone);
  // Little arms, which is the joke.
  const arms = [-1, 1].map(s => { const a = new T.Group(); a.position.set(s * .17, .78, -.3); g.add(a); box(.05, .14, .05, hide, 0, -.06, -.02, a); return a; });
  // Big hind legs: thigh, shin, a three-toed foot.
  const legs = [-1, 1].map(s => {
    const hip = new T.Group(); hip.position.set(s * .2, .72, .1); g.add(hip);
    box(.15, .38, .2, hide, 0, -.15, 0, hip);
    const knee = new T.Group(); knee.position.set(0, -.34, .02); hip.add(knee);
    box(.1, .33, .11, hide, 0, -.16, .03, knee);
    box(.16, .05, .24, dark, 0, -.35, -.06, knee);
    return { hip, knee };
  });
  // Saddle, stirrups and the cowboy riding.
  box(.34, .04, .34, red, 0, 1.0, .02);
  box(.26, .07, .26, leather, 0, 1.04, .02);
  box(.05, .08, .05, leather, 0, 1.1, -.1);
  for (const x of [-.19, .19]) box(.02, .22, .02, leather, x, .9, .02);
  const rider = makeToyCowboy(); rider.position.set(0, .95, .03); g.add(rider);
  const { legs: rl, arms: ra } = rider.userData; rl[0].rotation.set(-1.2, 0, -.5); rl[1].rotation.set(-1.2, 0, .5); ra[0].rotation.x = ra[1].rotation.x = -1.1;
  g.userData = { legs, arms, neck, jaw, tail, rider, gait: 0, materials: [hide, belly, plates, dark, tooth, red, leather, ...rider.userData.materials] };
  return g;
}

/** car: the physics car (pos, q, vel). rideHeight: its origin above the ground. */
export function poseToyDino(g, car, rideHeight = .1, dt = 1 / 60) {
  g.position.set(...car.pos); g.quaternion.set(...car.q); g.translateY(-rideHeight);
  const { legs, arms, neck, jaw, tail, rider } = g.userData, speed = Math.hypot(car.vel[0], car.vel[2]);
  // A two-legged run: big strides, the body bobbing and the tail swinging against them.
  g.userData.gait += dt * Math.min(14, 2 + speed * 1.1);
  const swing = Math.min(.8, speed * .12), s = Math.sin(g.userData.gait);
  legs[0].hip.rotation.x = s * swing; legs[1].hip.rotation.x = -s * swing;
  legs[0].knee.rotation.x = Math.max(0, -s) * swing * 1.2; legs[1].knee.rotation.x = Math.max(0, s) * swing * 1.2;
  arms.forEach((a, i) => { a.rotation.x = Math.sin(g.userData.gait * 2 + i) * .4; });
  tail.rotation.y = s * swing * .35; tail.rotation.x = -swing * .15;
  neck.rotation.x = -.15 + Math.cos(g.userData.gait * 2) * swing * .08;
  // It roars now and then: the jaw drops open.
  const t = g.userData.gait * .13 % 6.28; jaw.rotation.x = t > 5.6 ? .45 : .05;
  const bob = Math.abs(Math.cos(g.userData.gait)) * swing * .05;
  rider.position.y = .95 + bob * .6;
  g.translateY(bob);
}

// The robot's twin: a painted tin cowboy. The same jointed body (so climbing and walking pose it
// the same way) in tin and denim, with a hat, a bandana and a cork gun on the hip.
export function makeToyCowboy() {
  const g = makeRobotBody('#5e7fa8'); g.name = 'ToyCowboy';
  const { head } = g.userData;
  const felt = new T.MeshStandardMaterial({ color: '#7a4f2c', roughness: .7 });
  const skin = new T.MeshStandardMaterial({ color: '#e8b98f', roughness: .55 });
  const bandana = new T.MeshStandardMaterial({ color: '#c8352d', roughness: .5 });
  const tin = new T.MeshStandardMaterial({ color: '#c8c2b4', roughness: .3, metalness: .7 });
  const star = new T.MeshStandardMaterial({ color: '#e8c14a', emissive: '#7a5a10', emissiveIntensity: .4, roughness: .3, metalness: .8 });
  // A painted face over the visor: the cowboy has eyes, not a light.
  g.traverse(o => { if (o.isMesh && o.material?.emissive?.getHex()) o.material = skin; });
  const add = (geo, m, x, y, z, parent = head) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  add(new T.BoxGeometry(.075, .03, .012), skin, 0, -.002, -.041);
  for (const x of [-.018, .018]) add(new T.BoxGeometry(.008, .008, .004), felt, x, .004, -.048);
  // Hat: a wide brim and a pinched crown.
  add(new T.CylinderGeometry(.075, .075, .006, 20), felt, 0, .036, 0);
  add(new T.CylinderGeometry(.034, .042, .04, 16), felt, 0, .058, 0);
  add(new T.CylinderGeometry(.043, .043, .008, 16), bandana, 0, .043, 0);   // hatband
  // Bandana at the neck, sheriff's star, tin belt and a cork gun.
  add(new T.ConeGeometry(.03, .04, 4), bandana, 0, .225, -.045, g).rotation.x = Math.PI;
  add(new T.CylinderGeometry(.012, .012, .004, 5), star, -.04, .2, -.047, g).rotation.x = Math.PI / 2;
  add(new T.BoxGeometry(.155, .018, .095), tin, 0, .145, 0, g);
  add(new T.BoxGeometry(.018, .05, .03), felt, .085, .12, 0, g);
  // Hide the robot's antenna: cowboys don't have one.
  head.children.forEach(o => { if (o.isMesh && o.geometry.parameters?.height === .04 && o.geometry.parameters?.width === .006) o.visible = false; });
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
  const rider = makeToyCowboy(); rider.scale.setScalar(1 / RIG_SCALE); rider.position.y = -.12 / RIG_SCALE;
  const { legs, arms } = rider.userData; legs[0].rotation.set(-1.2, 0, -.5); legs[1].rotation.set(-1.2, 0, .5); arms[0].rotation.x = arms[1].rotation.x = -1.1;
  d.saddle()?.add(rider); d.rider = rider; d.air = 0;
  return d;
}
/** Pose and animate from the physics car: idle, walk or run by speed, and a jump when it leaves the
 *  ground. The clips speed up with the car, capped: true no-slide rates at 13 m/s would be a blur
 *  (the run clip covers 1.25 m/s at this scale), so the feet skate a little at full tilt. */
export function poseRiggedDino(d, car, rideHeight = .1, dt = 1 / 60) {
  d.root.position.set(...car.pos); d.root.quaternion.set(...car.q); d.root.translateY(-rideHeight);
  const speed = Math.hypot(car.vel[0], car.vel[2]), ground = { walk: .3, run: .833 }, airborne = car.contacts === 0;
  d.air = airborne ? d.air + dt : 0;
  if (d.air > .18 && d.clip !== 'jump') d.play('jump', { then: 'run', fade: .1 });
  else if (!airborne && d.clip !== 'jump') {
    const clip = speed < .25 ? 'idle' : speed < 2.2 ? 'walk' : 'run';
    d.play(clip, { timeScale: clip === 'idle' ? 1 : Math.min(3, Math.max(.5, speed / (ground[clip] * RIG_SCALE * (clip === 'run' ? 6 : 4)))) });
  }
  d.update(dt);
}
