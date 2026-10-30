import * as T from '../vendor/three.module.js';

// The toy's walking form: a chunky little robot in the car's paint, about 30 cm tall at 1:10, with
// a visor face, round shoulders and the car's wheels on its forearms and shins (so it still reads as
// the same toy, unfolded). Legs and arms swing with the walk.
export function makeRobotBody(paint = '#f28c28') {
  const g = new T.Group(); g.name = 'RobotBody';
  const shell = new T.MeshStandardMaterial({ color: paint, roughness: .38, metalness: .05 });
  const dark = new T.MeshStandardMaterial({ color: '#2a2f33', roughness: .7 });
  const steel = new T.MeshStandardMaterial({ color: '#b9c2c4', roughness: .35, metalness: .7 });
  const visor = new T.MeshStandardMaterial({ color: '#2fd4ff', emissive: '#18b8ff', emissiveIntensity: .9, roughness: .2 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const wheel = (parent, x, y, z) => { const o = new T.Mesh(new T.CylinderGeometry(.032, .032, .024, 14), dark); o.rotation.z = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  // Torso and head (car body panels folded up).
  box(.15, .11, .09, shell, 0, .19, 0);
  box(.12, .03, .095, dark, 0, .13, 0);
  const head = new T.Group(); head.position.set(0, .27, 0); g.add(head);
  box(.09, .065, .08, shell, 0, 0, 0, head);
  box(.07, .022, .01, visor, 0, .005, -.041, head);
  box(.006, .04, .006, steel, .03, .05, 0, head);   // antenna, like the car's
  // Arms (pivot at the shoulder) and legs (pivot at the hip), with wheels on forearms and shins.
  const limb = (x, y, len, w, wheelSide) => {
    const pivot = new T.Group(); pivot.position.set(x, y, 0); g.add(pivot);
    box(w, len, w, shell, 0, -len / 2, 0, pivot);
    wheel(pivot, wheelSide * (w / 2 + .012), -len * .72, 0);
    return pivot;
  };
  const arms = [limb(-.095, .23, .1, .036, -1), limb(.095, .23, .1, .036, 1)];
  const legs = [limb(-.04, .13, .13, .045, -1), limb(.04, .13, .13, .045, 1)];
  for (const leg of legs) box(.05, .02, .07, dark, 0, -.13, -.01, leg);   // feet
  g.userData = { arms, legs, head, materials: [shell, dark, steel, visor] };
  return g;
}

/** Pose from the controller: position, facing, walk swing, crouch. */
export function poseRobotBody(g, robot) {
  g.position.set(...robot.pos); g.rotation.set(0, -robot.yaw, 0);
  const { arms, legs, head } = g.userData, s = Math.sin(robot.walkPhase), moving = Math.hypot(robot.vel[0], robot.vel[2]) > .1;
  const swing = moving ? s * .7 : 0;
  legs[0].rotation.x = swing; legs[1].rotation.x = -swing; arms[0].rotation.x = -swing * .8; arms[1].rotation.x = swing * .8;
  if (robot.climb) { arms[0].rotation.x = arms[1].rotation.x = -2.6; }
  g.scale.y = robot.crouched ? .55 : 1;
  head.position.y = .27 + (moving ? Math.abs(s) * .008 : 0);
}

export function disposeRobotBody(g) { g.removeFromParent(); g.traverse(o => o.geometry?.dispose()); g.userData.materials?.forEach(m => m.dispose()); }
