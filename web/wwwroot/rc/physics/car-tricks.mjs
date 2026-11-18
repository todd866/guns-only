// RC car tricks, in the same family as the skateboard (physics/board-tricks.mjs) but driven by
// the car's own rotation. Combos, the special meter and banking stay in physics/skate.mjs.
// Grinds stay in physics/grind.mjs. Kid words: Flip, Barrel Roll, 360 Spin, Honk, Rail Slide.
import {add, scale, dot, norm, cross, len, rotate, unrotate} from './math.mjs';
import {alignCar, rideHeight} from './car.mjs';
import {createBalance, stepBalance} from './grind.mjs';

export const CAR_FLIP = Object.freeze({
  none: {name: 'Flip', axis: 'pitch', turn: 1, points: 300},
  up: {name: 'Flip', axis: 'pitch', turn: 1, points: 300},
  down: {name: 'Front Flip', axis: 'pitch', turn: -1, points: 350},
  left: {name: 'Barrel Roll', axis: 'roll', turn: 1, points: 400},
  right: {name: 'Barrel Roll', axis: 'roll', turn: -1, points: 400}
});
// B in the air (THPS2's grab button). Up and down spin the whole car; the others are toy gags.
export const CAR_GRAB = Object.freeze({
  none: {name: 'Honk', points: 150},
  left: {name: 'Wiggle', points: 200},
  right: {name: 'Beep Beep', points: 220},
  up: {name: '360 Spin', axis: 'yaw', turn: 1, points: 450},
  down: {name: 'Dizzy Spin', axis: 'yaw', turn: -1, points: 450}
});
export const CAR = Object.freeze({
  liftoff: 0.08,
  flipTime: 0.42,
  kidSave: 0.72,
  grabBase: 150,
  grabRate: 280
});
const WALL = Object.freeze({points: 200, plant: 250});

export function createCarTricks() {
  return {air: 0, flip: null, grab: null};
}

/** Face buttons and the keyboard twins. A jump, X flip, B grab, Y grind (THPS2's face). */
export function carTrickHeld({pad = {}, keys} = {}) {
  const down = code => !!keys?.has?.(code);
  return {
    jump: !!(pad.jump || pad.jumpHeld || down('Space')),
    flip: !!(pad.flipHeld || down('KeyQ')),
    grab: !!(pad.grabHeld || down('KeyE')),
    grind: !!(pad.grindHeld || down('KeyV'))
  };
}

/** Pad stick, with the keyboard trick stick as the fallback. */
export function carStick(pad = {}, keys = {}) {
  const x = pad.trickX || pad.moveX || pad.steer || 0;
  const y = pad.trickY || pad.moveY || 0;
  return {
    x: Math.abs(x) > 0.2 ? x : keys.x || 0,
    y: Math.abs(y) > 0.2 ? y : keys.y || 0
  };
}

// Body-axis rate chase. The division by invInertia cancels inside stepCar, same as the
// skateboard's air spin, so the car really turns instead of only playing an animation.
export function carTrickTorque(car, trick) {
  if (!trick?.axis || !Number.isFinite(trick.omega)) return [0, 0, 0];
  const body = unrotate(car.q, car.ang);
  const actual = trick.axis === 'roll' ? -body[2] : trick.axis === 'yaw' ? body[1] : body[0];
  const err = trick.omega - actual;
  const gain = 16;
  const t = [0, 0, 0];
  if (trick.axis === 'roll') t[2] = (-err * gain) / car.invInertia[2];
  else if (trick.axis === 'yaw') t[1] = (err * gain) / car.invInertia[1];
  else t[0] = (err * gain) / car.invInertia[0];
  return rotate(car.q, t);
}

/** Wheels-down assist once a trick is far enough along that the landing should count. */
export function applyCarLanding(car, world, trick) {
  if (!trick?.assist || !world?.raycast) return false;
  const g = world.raycast([car.pos[0], car.pos[1] + 0.05, car.pos[2]], [0, -1, 0], 1.2);
  if (!g || g.normal[1] < 0.75 || car.vel[1] > 1.2) return false;
  const h = g.point[1] + rideHeight(car.params);
  // Plant only as the tyres arrive. Stopping the fall higher up leaves the car hovering.
  if (car.pos[1] - h > 0.04) return false;
  alignCar(car, [0, 1, 0]);
  car.ang[0] = 0;
  car.ang[2] = 0;
  car.pos[1] = h;
  if (car.vel[1] < 0) car.vel[1] = 0;
  return true;
}

function startSpin(state, def) {
  const dur = CAR.flipTime * Math.max(1, Math.abs(def.turn || 1));
  state.flip = {
    def,
    name: def.name,
    points: def.points,
    t: 0,
    dur,
    axis: def.axis,
    omega: ((def.turn || 1) * 2 * Math.PI) / dur
  };
}

/**
 * Call before physics. input: { air, flip (direction on the press), grab (direction while held) }.
 * Returns the angular-rate command for this step, or null.
 */
export function carTrickCommand(state, input, dt) {
  state.air = input.air ? state.air + dt : 0;
  const flying = state.air >= CAR.liftoff;
  if (input.flip) state.arm = {dir: input.flip, t: 0.25};
  if (state.arm) {
    state.arm.t -= dt;
    if (flying && !state.flip) {
      startSpin(state, CAR_FLIP[state.arm.dir] ?? CAR_FLIP.none);
      state.arm = null;
    } else if (state.arm && state.arm.t <= 0) state.arm = null;
  }
  if (flying && input.grab && !state.grab && !state.flip) {
    const def = CAR_GRAB[input.grab] ?? CAR_GRAB.none;
    if (def.axis) startSpin(state, def);
    else state.grab = {name: def.name, t: 0};
  }
  if (state.grab && !state.flip && input.air && input.grab)
    return {axis: 'pitch', omega: Math.sin(state.grab.t * 28) * 5, assist: false, gag: true};
  const f = state.flip;
  if (f && input.air)
    return {axis: f.axis, omega: f.omega, assist: f.t / f.dur > 0.45 || !!state.right, progress: f.t / f.dur};
  // The spin is done. Keep the landing assist armed until the wheels are down.
  if (state.right && input.air) return {assist: true};
  return null;
}

/** Call after physics. Scores a finished trick and rights the car when the landing counts. */
export function carTrickSettle(state, car, input, dt, mode = 'kid') {
  const events = [];
  if (!input.air && state.right) {
    alignCar(car, [0, 1, 0]);
    car.ang[0] = 0;
    car.ang[2] = 0;
    car.wallImpact = 0;
    state.right = false;
  }
  if (state.grab && !state.flip) state.grab.t += dt;
  if (state.flip) {
    const f = state.flip;
    f.t += dt;
    const grounded = !input.air;
    if (f.t >= f.dur || grounded) {
      const progress = f.t / f.dur;
      state.flip = null;
      if (!grounded || mode === 'kid' || progress >= CAR.kidSave) {
        if (grounded) {
          alignCar(car, [0, 1, 0]);
          car.ang[0] = 0;
          car.ang[2] = 0;
          state.right = false;
        } else state.right = true;
        events.push({type: 'trick', name: f.name, points: f.points});
      } else events.push({type: 'bail'});
    }
  }
  if (state.grab && !state.flip && (!input.grab || !input.air)) {
    const g = state.grab;
    state.grab = null;
    events.push({
      type: 'trick',
      name: g.name,
      points: Math.round(CAR.grabBase + CAR.grabRate * Math.min(1.2, g.t))
    });
  }
  return events;
}

function clearWheels(car) {
  car.contacts = 0;
  car.grounded = false;
  car.impact = car.wallImpact = 0;
  for (const w of car.wheels) {
    w.contact = false;
    w.compression = 0;
    w.surface = null;
    w.contactNormal = null;
  }
}
function sparkAt(s) {
  if (s.assist) s.assist.grindSparks = 1;
  const car = s.car;
  car.params.wheels.forEach((w, i) => {
    car.wheels[i].contactPoint = add(car.pos, rotate(car.q, w.at));
  });
}
function findWall(car, world) {
  const travel = [car.vel[0], 0, car.vel[2]];
  const axes = [rotate(car.q, [1, 0, 0]), rotate(car.q, [-1, 0, 0]), norm(travel), [1, 0, 0], [-1, 0, 0]];
  let best = null;
  for (const dir of axes) {
    if (len(dir) < 0.4) continue;
    const hit = world.raycast(car.pos, norm(dir), 1);
    if (!hit || hit.normal[1] > 0.35 || hit.dist > 1.05) continue;
    if (!best || hit.dist < best.dist) best = hit;
  }
  return best;
}
function leaveWall(s, plant) {
  const w = s.wallRide;
  const car = s.car;
  if (!w) return;
  if (plant) {
    alignCar(car, [0, 1, 0]);
    car.vel = add(add(scale(w.normal, 2.4), [0, 3.1, 0]), scale(w.dir, w.speed * 0.55));
    car.ang = [0, 0, 0];
    s.wallPlant = {name: 'Wall Plant', points: WALL.plant};
  } else car.vel = add(car.vel, scale(w.normal, 0.8));
  clearWheels(car);
  s.wallRide = null;
}
function slideWall(s, raw, dt) {
  const w = s.wallRide;
  const car = s.car;
  const world = s.course.world;
  if (raw.hop && w.time > 0.04) {
    leaveWall(s, true);
    return false;
  }
  w.time += dt;
  if (!stepBalance(w.balance, raw.steer, dt, s.mode)) {
    leaveWall(s, false);
    return false;
  }
  const probe = add(car.pos, scale(w.normal, 0.35));
  const hit = world.raycast(probe, scale(w.normal, -1), 1.6);
  if (!hit || hit.normal[1] > 0.4) {
    leaveWall(s, false);
    return false;
  }
  w.normal = hit.normal;
  let slide = norm(cross(w.normal, [0, 1, 0]));
  if (len(slide) < 0.5) {
    leaveWall(s, false);
    return false;
  }
  if (dot(slide, w.dir) < 0) slide = scale(slide, -1);
  w.dir = slide;
  w.speed = Math.max(0, w.speed - 0.3 * dt);
  if (w.speed < 0.7) {
    leaveWall(s, false);
    return false;
  }
  car.pos = add(add(hit.point, scale(hit.normal, rideHeight(car.params) + 0.02)), scale(slide, w.speed * dt));
  const stuck = world.raycast(add(car.pos, scale(hit.normal, 0.5)), scale(hit.normal, -1), 1.3);
  if (stuck && stuck.normal[1] < 0.4) {
    car.pos = add(stuck.point, scale(stuck.normal, rideHeight(car.params) + 0.02));
    w.normal = stuck.normal;
  }
  car.vel = add(scale(slide, w.speed), [0, 0.02, 0]);
  alignCar(car, w.normal);
  car.ang = [0, 0, 0];
  clearWheels(car);
  car.speed = car.forwardSpeed = w.speed;
  sparkAt(s);
  return true;
}

/** Owns the car while it rides a vertical face. Hop exits as a wall plant. */
export function stepWallRide(s, raw, dt) {
  if (!raw.carForm || s.flight?.mode) return false;
  if (s.assist) s.assist.grindSparks = s.assist.grindSparks || 0;
  if (s.wallRide) return slideWall(s, raw, dt);
  const car = s.car;
  if (car.contacts > 0 || Math.hypot(car.vel[0], car.vel[2]) < 1.4) return false;
  const hit = findWall(car, s.course.world);
  if (!hit) return false;
  let slide = norm(cross(hit.normal, [0, 1, 0]));
  if (len(slide) < 0.5) return false;
  if (dot(slide, car.vel) < 0) slide = scale(slide, -1);
  s.wallRide = {
    id: (s.wallSerial = (s.wallSerial ?? 0) + 1),
    name: 'Wall Ride',
    points: WALL.points,
    normal: hit.normal,
    dir: slide,
    speed: Math.max(2, Math.abs(dot(car.vel, slide))),
    balance: createBalance(),
    time: 0
  };
  car.pos = add(hit.point, scale(hit.normal, rideHeight(car.params) + 0.04));
  if (s.assist) s.assist.quarter = {};
  return slideWall(s, raw, dt);
}
