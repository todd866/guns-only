import * as T from '../vendor/three.module.js';

// The toy's walking form: a chunky little robot in the car's paint, about 30 cm tall at 1:10, with
// a visor face, round shoulders and the car's wheels on its forearms and shins (so it still reads as
// the same toy, unfolded). Legs and arms swing with the walk.
export function makeRobotBody(paint = '#f28c28') {
  const g = new T.Group();
  g.name = 'RobotBody';
  const shell = new T.MeshStandardMaterial({color: paint, roughness: 0.38, metalness: 0.05});
  const dark = new T.MeshStandardMaterial({color: '#2a2f33', roughness: 0.7});
  const steel = new T.MeshStandardMaterial({color: '#b9c2c4', roughness: 0.35, metalness: 0.7});
  const visor = new T.MeshStandardMaterial({
    color: '#2fd4ff',
    emissive: '#18b8ff',
    emissiveIntensity: 0.9,
    roughness: 0.2
  });
  const box = (w, h, d, m, x, y, z, parent = g) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const wheel = (parent, x, y, z) => {
    const o = new T.Mesh(new T.CylinderGeometry(0.032, 0.032, 0.024, 14), dark);
    o.rotation.z = Math.PI / 2;
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  // Torso and head (car body panels folded up).
  box(0.15, 0.11, 0.09, shell, 0, 0.19, 0);
  box(0.12, 0.03, 0.095, dark, 0, 0.13, 0);
  const head = new T.Group();
  head.position.set(0, 0.27, 0);
  g.add(head);
  box(0.09, 0.065, 0.08, shell, 0, 0, 0, head);
  box(0.07, 0.022, 0.01, visor, 0, 0.005, -0.041, head);
  box(0.006, 0.04, 0.006, steel, 0.03, 0.05, 0, head); // antenna, like the car's
  // Arms (pivot at the shoulder) and legs (pivot at the hip), with wheels on forearms and shins.
  const limb = (x, y, len, w, wheelSide) => {
    const pivot = new T.Group();
    pivot.position.set(x, y, 0);
    g.add(pivot);
    box(w, len, w, shell, 0, -len / 2, 0, pivot);
    wheel(pivot, wheelSide * (w / 2 + 0.012), -len * 0.72, 0);
    return pivot;
  };
  const arms = [limb(-0.095, 0.23, 0.1, 0.036, -1), limb(0.095, 0.23, 0.1, 0.036, 1)];
  const legs = [limb(-0.04, 0.13, 0.13, 0.045, -1), limb(0.04, 0.13, 0.13, 0.045, 1)];
  for (const leg of legs) box(0.05, 0.02, 0.07, dark, 0, -0.13, -0.01, leg); // feet
  g.userData = {arms, legs, head, materials: [shell, dark, steel, visor]};
  return g;
}

/** Pose from the controller: position, facing, walk swing, crouch. */
export function poseRobotBody(g, robot) {
  g.position.set(...robot.pos);
  g.rotation.set(0, -robot.yaw, 0);
  const {arms, legs, head} = g.userData,
    s = Math.sin(robot.walkPhase),
    moving = Math.hypot(robot.vel[0], robot.vel[2]) > 0.1;
  const swing = moving ? s * 0.7 : 0;
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.8;
  arms[1].rotation.x = swing * 0.8;
  if (robot.climb) {
    arms[0].rotation.x = arms[1].rotation.x = -2.6;
  }
  g.scale.y = robot.crouched ? 0.55 : 1;
  head.position.y = 0.27 + (moving ? Math.abs(s) * 0.008 : 0);
}

export function disposeRobotBody(g) {
  g.removeFromParent();
  g.traverse(o => o.geometry?.dispose());
  g.userData.materials?.forEach(m => m.dispose());
}

// The skateboard form: the robot riding a deck, knees bent, arms out. Posed from the board's
// physics body (position and orientation), and the robot leans into turns.
export function makeBoardRider(paint = '#f28c28') {
  const g = new T.Group();
  g.name = 'BoardRider';
  const deckMat = new T.MeshStandardMaterial({color: '#23262a', roughness: 0.8}),
    edge = new T.MeshStandardMaterial({color: paint, roughness: 0.4});
  const wheelMat = new T.MeshStandardMaterial({color: '#f1e7c8', roughness: 0.5}),
    truckMat = new T.MeshStandardMaterial({color: '#b9c2c4', roughness: 0.3, metalness: 0.7});
  // The deck, trucks and wheels are their own group so a flip turns the board under the rider.
  const board = new T.Group();
  board.name = 'Board';
  g.add(board);
  const deck = new T.Mesh(new T.BoxGeometry(0.09, 0.008, 0.3), deckMat);
  deck.position.y = -0.012;
  deck.castShadow = true;
  board.add(deck);
  for (const z of [-0.15, 0.15]) {
    const kick = new T.Mesh(new T.BoxGeometry(0.09, 0.008, 0.04), deckMat);
    kick.position.set(0, -0.006, z);
    kick.rotation.x = z < 0 ? 0.45 : -0.45;
    board.add(kick);
  }
  const stripe = new T.Mesh(new T.BoxGeometry(0.092, 0.004, 0.2), edge);
  stripe.position.y = -0.017;
  board.add(stripe);
  for (const z of [-0.1, 0.1]) {
    const truck = new T.Mesh(new T.BoxGeometry(0.07, 0.012, 0.02), truckMat);
    truck.position.set(0, -0.024, z);
    board.add(truck);
    for (const x of [-0.045, 0.045]) {
      const w = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.022, 14), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, -0.03, z);
      w.castShadow = true;
      board.add(w);
    }
  }
  const rider = makeRobotBody(paint);
  rider.position.y = -0.008;
  rider.rotation.y = Math.PI / 2;
  g.add(rider);
  // Skate stance: side-on, knees bent, arms out for balance.
  const {arms, legs} = rider.userData;
  legs[0].rotation.x = 0.35;
  legs[1].rotation.x = -0.35;
  arms[0].rotation.z = 0.9;
  arms[1].rotation.z = -0.9;
  rider.scale.y = 0.88;
  g.userData = {rider, board, materials: [deckMat, edge, wheelMat, truckMat, ...rider.userData.materials]};
  return g;
}

export function poseBoardRider(g, car, steer = 0, trick = null) {
  g.position.set(...car.pos);
  g.quaternion.set(...car.q);
  g.translateY(-0.022);
  const {rider, board} = g.userData;
  rider.rotation.z = -steer * 0.25; // lean into the carve
  // Tricks (physics/board-tricks.mjs): the board turns about its own axis, the rider crouches and
  // reaches down for a grab. The deck pivots about its centre, a little below the rider's feet.
  board.rotation.set(0, 0, 0);
  board.position.y = 0;
  if (trick?.axis) board.rotation[trick.axis] = trick.angle;
  const grab = trick?.grab,
    flip = !!trick?.axis,
    {arms, legs} = rider.userData;
  // A flip: the rider tucks up off the deck so the chase camera sees the board turn beneath.
  rider.scale.y = grab ? 0.7 : 0.88;
  rider.position.y = flip ? 0.07 : grab ? 0.02 : -0.008;
  board.position.y = Math.max(board.position.y, grab ? 0.025 : 0);
  // Indy / Melon reach with one hand; Nosegrab / Tailgrab / Method reach fore or aft.
  arms[0].rotation.set(0, 0, 0.9);
  arms[1].rotation.set(0, 0, -0.9);
  if (grab) {
    const reach = {
      Indy: [1, 0],
      Melon: [0, 1],
      Nosegrab: [-1.3, -1.3],
      Tailgrab: [1.3, 1.3],
      Method: [0.6, -0.6]
    }[grab] ?? [1, 0];
    arms[0].rotation.set(reach[0], 0, 0.3);
    arms[1].rotation.set(reach[1], 0, -0.3);
  }
  legs[0].rotation.x = grab || flip ? 0.9 : 0.35;
  legs[1].rotation.x = grab || flip ? -0.9 : -0.35;
}
