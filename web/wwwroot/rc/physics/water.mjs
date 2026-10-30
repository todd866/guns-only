// Water (owner, 2026-10-30: "every car gets boat mode when it goes into the water"). The way most
// games do boats: the water is a height function, not a fluid; a hull floats on buoyancy probes
// that sample the same waves the renderer draws; arcade handling sits on top.
// - Buoyancy: five probes (the four wheel corners and the centre) push up in proportion to how
//   deep each sits, with damping, so a car bobs, pitches over swell and rolls in chop by itself.
// - Boat mode, once floating: thrust from the rear (the wheels act as a jet), a keel that kills
//   sideways slip, steering as yaw, water drag, and stronger self-righting for kids.
// - Rivers add their current; jet bodies and the afterburner make a planing jet boat.
import { add, sub, scale, dot, cross, len, rotate } from './math.mjs';
import { applyImpulse, pointVelocity, carForward, carUp } from './car.mjs';

// Wave set shared with the renderer (open-world/water-surface.js): direction x, z; amplitude (m);
// wavelength (m). Scaled for 1:10 cars: a wavepool swell a car rides, not an ocean.
export const SWELL = Object.freeze([
  [.82, .57, .05, 17], [.95, -.2, .028, 9.5], [.6, .8, .016, 5.2], [-.3, .95, .008, 2.7],
]);
export const BOAT = Object.freeze({
  sink: .03,         // probe depth at which the hull carries its own weight
  damping: 3.2,      // vertical damping of each probe
  thrust: 12,        // m/s² at full throttle, floating
  top: 7.5,          // m/s, planing top speed before boost
  keel: 6,           // per second: how fast sideways slip is removed
  drag: .6,          // per second, forward
  yaw: 2.3,          // rad/s at full steer and speed
  right: 4,          // self-righting rate (kid); bigKid uses half
});

/** Water bodies: rect [x0, z0, x1, z1], surface level, basin depth, swell, river flow (m/s). */
export const WATER_BODIES = [
  // Sunrise Splash wavepool: a beach-entry basin (0 at the rim to -.5 m in the middle).
  // The north beach (z > 3381) stays dry: the Sunrise Splash arrival and the splash pad are there.
  { id: 'wavepool', rect: [-597, 3333, -493, 3381], level: .14,   // troughs stay above the sand collar's top (.03)
    depth: .5, entry: 7, swell: SWELL, flow: null },
];

export const WATER = { time: 0 };   // advanced once per race step; the renderer reads it too

export function bodyAt(x, z) {
  for (const b of WATER_BODIES) if (x >= b.rect[0] && x <= b.rect[2] && z >= b.rect[1] && z <= b.rect[3]) return b;
  return null;
}

export function waterHeight(b, x, z, t = WATER.time) {
  let h = b.level;
  for (const [dx, dz, a, l] of b.swell ?? []) {
    const n = Math.hypot(dx, dz), k = 2 * Math.PI / l, c = Math.sqrt(9.8 / k);
    h += a * Math.sin(k * ((dx * x + dz * z) / n - c * t));
  }
  return h;
}

/** Basin floor: flat at the rim, sloping down over `entry` metres to `depth` below 0. */
export function basinFloor(b, x, z) {
  const [x0, z0, x1, z1] = b.rect, edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
  return -b.depth * Math.min(1, Math.max(0, edge / b.entry)) ** 1.4;
}

/** Collision triangles for each basin (added by the venue that owns it). */
export function basinTriangles(b, step = 2) {
  const out = [], [x0, z0, x1, z1] = b.rect, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const p = (i, j) => { const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; return [x, basinFloor(b, x, z), z]; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = p(i, j), c = p(i + 1, j), d = p(i + 1, j + 1), e = p(i, j + 1);
    out.push([a, e, d], [a, d, c]);   // counter-clockwise from above: faces up
  }
  return out;
}

/** Buoyancy and boat handling. Returns how submerged the car is (0..1); 0 means dry. */
export function stepWater(car, input = {}, dt = 1 / 120, mode = 'kid') {
  const b = bodyAt(car.pos[0], car.pos[2]);
  car.floating = 0;
  if (!b) return 0;
  const p = car.params, m = p.mass, probes = [...p.wheels.map(w => w.at), [0, 0, 0]];
  let wet = 0;
  for (const at of probes) {
    const world = add(car.pos, rotate(car.q, at)), depth = waterHeight(b, world[0], world[2]) - world[1];
    if (depth <= 0) continue;
    wet += Math.min(1, depth / (BOAT.sink * 2));
    const vy = pointVelocity(car, world)[1];
    const lift = (9.81 * m / probes.length) * Math.min(3, depth / BOAT.sink) - BOAT.damping * m / probes.length * vy;
    applyImpulse(car, [0, Math.max(0, lift) * dt, 0], world);
  }
  const f = wet / probes.length;
  car.floating = f;
  if (f < .25) return f;
  // Boat handling: forward along the flattened nose, sideways slip bled off by the keel.
  const fwd = carForward(car), flat = [fwd[0], 0, fwd[2]], fl = Math.hypot(flat[0], flat[2]) || 1, dir = [flat[0] / fl, 0, flat[2] / fl];
  const side = [-dir[2], 0, dir[0]], vF = dot(car.vel, dir), vS = dot(car.vel, side);
  const boost = input.boost ?? 1, throttle = Math.max(-1, Math.min(1, input.throttle || 0));
  const top = BOAT.top * boost;
  const thrust = throttle > 0 ? throttle * BOAT.thrust * boost * Math.max(0, 1 - vF / top) : throttle * BOAT.thrust * .5 * Math.max(0, 1 + vF / 3);
  car.vel = add(car.vel, scale(dir, thrust * dt * f));
  car.vel = add(car.vel, scale(side, -vS * Math.min(1, BOAT.keel * dt) * f));
  car.vel = add(car.vel, scale(dir, -vF * Math.min(1, BOAT.drag * dt) * f));
  if (b.flow) car.vel = add(car.vel, scale(sub([b.flow[0], 0, b.flow[1]], [car.vel[0], 0, car.vel[2]]), Math.min(1, .8 * dt) * f));
  // Steering is yaw, stronger with speed, like a jet-ski; a stopped boat still turns a little.
  const steer = Math.max(-1, Math.min(1, input.steer || 0)), wantYaw = -steer * BOAT.yaw * Math.min(1, .35 + Math.abs(vF) / 4) * Math.sign(vF || 1);
  const up = carUp(car);
  car.ang = add(car.ang, scale(up, (wantYaw - dot(car.ang, up)) * Math.min(1, 6 * dt) * f));
  // Self-righting: rotate the body's up toward world up (water won't hold a car upside down).
  const err = cross(up, [0, 1, 0]), k = (mode === 'kid' ? BOAT.right : BOAT.right / 2) * f;
  car.ang = add(scale(car.ang, 1 - Math.min(1, 1.5 * dt * f)), scale(err, k * dt * 6));
  return f;
}
