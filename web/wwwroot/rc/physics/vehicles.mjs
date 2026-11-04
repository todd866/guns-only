import {BUGGY} from './car.mjs';

export const VEHICLE_KINDS = Object.freeze(['buggy', 'monster', 'rally', 'pickup', 'golf', 'pumpkin']);
const clone = x => ({
  ...x,
  size: [...x.size],
  wheels: x.wheels.map(w => ({...w, at: [...w.at]})),
  hull: x.hull.map(h => ({...h, at: [...h.at]})),
  staticFriction: [...x.staticFriction],
  kineticFriction: [...x.kineticFriction]
});
const PRESETS = Object.freeze({
  buggy: {},
  monster: {
    topSpeed: 12,
    wheelRadius: 0.07,
    wheelWidth: 0.07,
    restLength: 0.06,
    mass: 2.2,
    size: [0.24, 0.1, 0.42],
    wheels: BUGGY.wheels.map(w => ({...w, at: [Math.sign(w.at[0]) * 0.15, w.at[1], w.at[2]]})),
    hull: BUGGY.hull.map(h => ({...h, at: [(h.at[0] * 4) / 3, h.at[1], h.at[2]]}))
  },
  rally: {topSpeed: 15, staticFriction: [1.72, 1.62], kineticFriction: [1.3, 1.22]},
  pickup: {topSpeed: 11.5, mass: 2.05},
  golf: {topSpeed: 8, driveForce: 20, staticFriction: [1.35, 1.28], kineticFriction: [1.0, 0.96]},
  pumpkin: {topSpeed: 12.5, mass: 2.0} // earned by splatting 20 pumpkins (livery-data.mjs)
});
// The skateboard form (docs/design/adventure): the robot rides a deck. Not a Garage body; T
// switches to it. Narrow trucks, small hard wheels, a light low deck that carves and grinds.
const BOARD = {
  mass: 1.1,
  size: [0.09, 0.04, 0.3],
  topSpeed: 12,
  driveForce: 22,
  wheelRadius: 0.026,
  wheelWidth: 0.022,
  restLength: 0.03,
  spring: 320,
  damper: 9,
  bumpAt: 0.018,
  maxSteer: 0.42,
  staticFriction: [1.45, 1.4],
  kineticFriction: [1.1, 1.06],
  wheels: [
    {at: [-0.045, 0, -0.1], front: true},
    {at: [0.045, 0, -0.1], front: true},
    {at: [-0.045, 0, 0.1], front: false},
    {at: [0.045, 0, 0.1], front: false}
  ],
  hull: [
    {at: [0, -0.01, -0.13], r: 0.02},
    {at: [0, -0.01, 0.13], r: 0.02},
    {at: [0, 0.03, 0], r: 0.035}
  ]
};
export function vehicleParams(kind = 'buggy') {
  if (kind === 'board') return clone(Object.assign(clone(BUGGY), BOARD));
  if (!PRESETS[kind]) throw new RangeError(`unknown vehicle kind: ${kind}`);
  return clone(Object.assign(clone(BUGGY), PRESETS[kind]));
}
export function golfVehicleUnlocked(state) {
  const d = Array.isArray(state) ? state : state?.discovered;
  return !!d?.includes('golf');
}

// The Legend of Spirit Mountain's car ladder (owner, 30 Oct): you start in a small RC car that is
// easy to drive and not too fast; later cars are a bit bigger and a bit faster, ending in a choice
// of a grippy road car or a loose, forgiving rally car for the mountain switchbacks.
// scale grows the whole car (wheels, track, hull); mass and every force grow by scale^2 so the
// accelerations, and so the handling, stay what each tier's numbers say (springs: see below).
export const LEGEND_CARS = Object.freeze({
  starter: {
    name: 'Little Buggy',
    scale: 1,
    topSpeed: 9,
    driveForce: 20,
    staticFriction: [1.75, 1.65],
    kineticFriction: [1.35, 1.28]
  },
  trail: {name: 'Trail Buggy', scale: 1.15, topSpeed: 12, driveForce: 24},
  road: {
    name: 'Road Racer',
    scale: 1.3,
    topSpeed: 17,
    driveForce: 30,
    maxSteer: 0.4,
    staticFriction: [1.95, 1.85],
    kineticFriction: [1.5, 1.42]
  },
  rally: {
    name: 'Rally Car',
    scale: 1.3,
    topSpeed: 16,
    driveForce: 29,
    staticFriction: [1.6, 1.45],
    kineticFriction: [1.32, 1.18]
  }
});
export const LEGEND_LADDER = Object.freeze(['starter', 'trail', ['road', 'rally']]);
export function legendCarParams(tier = 'starter') {
  const t = LEGEND_CARS[tier];
  if (!t) throw new RangeError(`unknown Legend car: ${tier}`);
  return scaledCar(t);
}
// The dark world's mount (docs/design/adventure: the past is a toy western where you ride
// dinosaurs). A toy dinosaur about four times the cowboy, so its body is the car grown 2.4x:
// big enough not to poke through walls, steady, and a little quicker than the starter car.
export const DINO_MOUNT = Object.freeze({
  name: 'Toy dinosaur',
  scale: 2.4,
  topSpeed: 13,
  driveForce: 22,
  staticFriction: [1.75, 1.65],
  kineticFriction: [1.35, 1.28]
});
// One body per kind of ridden dinosaur (open-world/herd.mjs DINO_KINDS): the raptor small and
// quick, the long-neck big and slow, the triceratops heavy and pushy, the quetzalcoatlus a flier.
export const DINO_MOUNTS = Object.freeze({
  rex: DINO_MOUNT,
  raptor: Object.freeze({...DINO_MOUNT, name: 'Toy raptor', scale: 2.0, topSpeed: 16, driveForce: 24}),
  longneck: Object.freeze({
    ...DINO_MOUNT,
    name: 'Toy Argentinosaurus',
    scale: 3.0,
    topSpeed: 9,
    driveForce: 17
  }),
  triceratops: Object.freeze({
    ...DINO_MOUNT,
    name: 'Toy triceratops',
    scale: 2.6,
    topSpeed: 11,
    driveForce: 25
  }),
  // On the ground the quetzalcoatlus waddles; its speed is in the air (physics/flight.mjs).
  quetzal: Object.freeze({
    ...DINO_MOUNT,
    name: 'Toy quetzalcoatlus',
    scale: 2.0,
    topSpeed: 10,
    driveForce: 20
  })
});
export const mountParams = (kind = 'rex') => scaledCar(DINO_MOUNTS[kind] ?? DINO_MOUNT);
function scaledCar(t) {
  const {name, scale: k, ...tune} = t,
    p = clone(BUGGY),
    m = k * k;
  Object.assign(p, {
    scale: k,
    size: p.size.map(v => v * k),
    wheelRadius: p.wheelRadius * k,
    wheelWidth: p.wheelWidth * k,
    restLength: p.restLength * k,
    wheels: p.wheels.map(w => ({...w, at: w.at.map(v => v * k)})),
    hull: p.hull.map(h => ({...h, at: h.at.map(v => v * k), r: h.r * k})),
    mass: p.mass * m,
    brakeForce: p.brakeForce * m,
    // Springs grow by k so the static sag scales with the car; dampers by k^1.5 keep the damping ratio.
    spring: p.spring * k,
    damper: p.damper * k ** 1.5,
    bumpSpring: p.bumpSpring * k,
    bumpDamper: p.bumpDamper * k ** 1.5
  });
  if (p.bumpAt != null) p.bumpAt *= k;
  Object.assign(p, tune, {driveForce: tune.driveForce * m});
  return p;
}
