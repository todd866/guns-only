// Pickups: cartoony, never violent. A hit wobbles or spins a car; nothing wrecks it.
// Spawn crates sit at the course's PICKUP_* markers and respawn a few seconds after collection.
import { add, sub, scale, len, rotate, dot } from './math.mjs';

export const ITEMS = ['zoom', 'balloon', 'oil', 'bubble'];
const RESPAWN = 4, GRAB = 0.6;

export function createPickups(course, seed = 1) {
  const spots = (course.pickups ?? []).map(p => ({ pos: p.pos, ready: 0 }));
  return { spots, held: new Map(), effects: new Map(), balloons: [], slicks: [], rng: lcg(seed) };
}
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const fx = (pk, car) => { let e = pk.effects.get(car); if (!e) pk.effects.set(car, e = { zoom: 0, bubble: 0, spin: 0, slick: 0 }); return e; };

// Input modifiers this car's effects impose; merged into its step input.
export function modifiers(pk, car) {
  const e = fx(pk, car);
  return { boost: e.zoom > 0 ? 1.6 : 1, gripScale: e.slick > 0 ? 0.35 : 1, spinning: e.spin > 0, shielded: e.bubble > 0 };
}

export function use(pk, car) {
  const item = pk.held.get(car); if (!item) return null;
  pk.held.delete(car);
  const e = fx(pk, car), fwd = rotate(car.q, [0, 0, -1]);
  if (item === 'zoom') e.zoom = 1.4;
  if (item === 'bubble') e.bubble = 5;
  if (item === 'oil') pk.slicks.push({ pos: add(car.pos, scale(fwd, -0.5)), life: 12, owner: car });
  if (item === 'balloon') pk.balloons.push({ pos: add(car.pos, add(scale(fwd, 0.35), [0, 0.15, 0])), vel: add(car.vel, add(scale(fwd, 10), [0, 1.6, 0])), owner: car, life: 3 });
  return item;
}

function hit(pk, car) {
  const e = fx(pk, car);
  if (e.bubble > 0) { e.bubble = 0; return false; }   // the bubble pops instead
  e.spin = 0.9; car.vel = scale(car.vel, 0.45); car.ang = add(car.ang, [0, 9, 0]); car.vel[1] += 1.2;
  return true;
}

// `immune`: kid mode's player — rival balloons pass by and slicks do not grab.
export function stepPickups(pk, cars, world, dt, immune = null) {
  for (const e of pk.effects.values()) for (const k in e) e[k] = Math.max(0, e[k] - dt);
  for (const spot of pk.spots) {
    spot.ready = Math.max(0, spot.ready - dt);
    if (spot.ready > 0) continue;
    const car = cars.find(c => !pk.held.has(c) && len(sub(c.pos, spot.pos)) < GRAB);
    if (car) { pk.held.set(car, ITEMS[Math.floor(pk.rng() * ITEMS.length)]); spot.ready = RESPAWN; }
  }
  const events = [];
  for (const b of pk.balloons) {
    b.vel[1] -= 9.81 * dt; const next = add(b.pos, scale(b.vel, dt)), d = sub(next, b.pos), dl = len(d);
    const wall = dl > 0 && world.raycast(b.pos, scale(d, 1 / dl), dl);
    const target = cars.find(c => c !== b.owner && c !== immune && len(sub(c.pos, next)) < 0.35);
    if (target) { if (hit(pk, target)) events.push({ type: 'splash', car: target }); b.life = 0; }
    else if (wall) { events.push({ type: 'splash', pos: wall.point }); b.life = 0; }
    b.pos = next; b.life -= dt;
  }
  pk.balloons = pk.balloons.filter(b => b.life > 0);
  for (const s of pk.slicks) {
    s.life -= dt;
    for (const c of cars) if (c !== s.owner && c !== immune && len(sub(c.pos, s.pos)) < 0.55 && fx(pk, c).bubble <= 0) fx(pk, c).slick = 1.2;
    if (s.life < 11) s.owner = null;   // after a second, the dropper can slide on it too
  }
  pk.slicks = pk.slicks.filter(s => s.life > 0);
  return events;
}

// Rival use: fire a balloon at a car ahead, drop oil with someone close behind, zoom/bubble at once.
export function rivalWants(pk, car, cars) {
  const item = pk.held.get(car); if (!item) return false;
  if (item === 'zoom' || item === 'bubble') return true;
  const fwd = rotate(car.q, [0, 0, -1]);
  return cars.some(o => {
    if (o === car) return false;
    const d = sub(o.pos, car.pos), ahead = dot(d, fwd), dist = len(d);
    return item === 'balloon' ? ahead > 1 && dist < 5 && ahead / dist > 0.9 : ahead < -0.3 && dist < 3;
  });
}
