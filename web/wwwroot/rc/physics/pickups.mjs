// Pickups: cartoony, never violent. A hit wobbles or spins a car; nothing wrecks it.
// Spawn crates sit at the course's PICKUP_* markers and respawn a few seconds after collection.
import { add, sub, scale, len, rotate, dot } from './math.mjs';

export const ITEMS = ['zoom', 'balloon', 'oil', 'bubble', 'foxtwo', 'pitbull', 'foxone', 'zuni'];
// Foam-tipped toy missiles, named by brevity code. A hit spins the car (like a balloon), never wrecks it.
//   foxtwo  heat-seeker: locks the car ahead in its cone and homes (red shell)
//   pitbull active: the blue shell. Hunts the race leader on its own (nearest car in free drive)
//   foxone  beam-rider: rides the shooter's radar beam, which the shooter sweeps by steering
//   zuni    unguided rocket that bounces off walls (green shell)
export const MISSILES = new Set(['foxtwo', 'pitbull', 'foxone', 'zuni']);
const SPEC = { foxtwo: { v: 13, turn: 3.5, life: 4 }, pitbull: { v: 12.5, turn: 4, life: 12 }, foxone: { v: 15, turn: 6, life: 4 }, zuni: { v: 14, turn: 0, life: 5 } };
const RESPAWN = 4, GRAB = 0.6;

export function createPickups(course, seed = 1) {
  const spots = (course.pickups ?? []).map(p => ({ pos: p.pos, ready: 0 }));
  return { spots, held: new Map(), ammo: new Map(), announce: [], effects: new Map(), balloons: [], slicks: [], missiles: [], dangle: new Set(), rng: lcg(seed) };
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
  const left = (pk.ammo.get(car) ?? 1) - 1;
  if (left > 0) pk.ammo.set(car, left);
  else { pk.held.delete(car); if (pk.ammo.has(car)) pk.announce.push({ type: 'winchester', car }); pk.ammo.delete(car); }
  const e = fx(pk, car), fwd = rotate(car.q, [0, 0, -1]);
  if (item === 'zoom') e.zoom = 1.4;
  if (item === 'bubble') e.bubble = 5;
  if (item === 'oil') pk.slicks.push({ pos: add(car.pos, scale(fwd, -0.5)), life: 12, owner: car });
  if (MISSILES.has(item)) pk.missiles.push({ kind: item, pos: add(car.pos, add(scale(fwd, 0.4), [0, 0.05, 0])), dir: [fwd[0], 0, fwd[2]], owner: car, target: null, life: SPEC[item].life, bounces: 3, retarget: 0 });
  if (item === 'balloon') pk.balloons.push({ pos: add(car.pos, add(scale(fwd, 0.35), [0, 0.15, 0])), vel: add(car.vel, add(scale(fwd, 10), [0, 1.6, 0])), owner: car, life: 3 });
  return item;
}

function hit(pk, car) {
  const e = fx(pk, car);
  if (e.bubble > 0) { e.bubble = 0; return false; }   // the bubble pops instead
  e.spin = 0.9; car.vel = scale(car.vel, 0.45); car.ang = add(car.ang, [0, 9, 0]); car.vel[1] += 1.2;
  return true;
}

// `immune`: kid mode's player (one car) or Furball's downed cars (a Set) — balloons pass by,
// missiles ignore them and slicks do not grab.
const immuneTest = immune => immune instanceof Set ? c => immune.has(c) : c => c === immune;
export function stepPickups(pk, cars, world, dt, immune = null) {
  const isImmune = immuneTest(immune);
  for (const e of pk.effects.values()) for (const k in e) e[k] = Math.max(0, e[k] - dt);
  for (const spot of pk.spots) {
    spot.ready = Math.max(0, spot.ready - dt);
    if (spot.ready > 0) continue;
    const car = cars.find(c => !pk.held.has(c) && len(sub(c.pos, spot.pos)) < GRAB);
    if (car) {
      const item = ITEMS[Math.floor(pk.rng() * ITEMS.length)]; pk.held.set(car, item); spot.ready = pk.respawn ?? RESPAWN;
      // Missiles sometimes come as a 3-pack; firing the last of a pack calls "Winchester".
      if (MISSILES.has(item) && pk.rng() < 0.35) pk.ammo.set(car, 3); else pk.ammo.delete(car);
    }
  }
  const events = pk.announce.splice(0);
  // Carried missiles ride on a little munitions trailer (a "jammer") behind the car. It soaks up a
  // shot from behind; the hit blows the trailer and the whole load is lost, as in Mario Kart.
  pk.dangle = new Set(cars.filter(c => MISSILES.has(pk.held.get(c))));
  const trailerHit = (owner, p) => { const t = [...pk.dangle].find(c => c !== owner && len(sub(dangleSpot(c), p)) < 0.45); if (t) { pk.dangle.delete(t); pk.held.delete(t); pk.ammo.delete(t); events.push({ type: 'boom', pos: dangleSpot(t), trailer: t }); } return t; };
  for (const b of pk.balloons) {
    b.vel[1] -= 9.81 * dt; const next = add(b.pos, scale(b.vel, dt)), d = sub(next, b.pos), dl = len(d);
    const wall = dl > 0 && world.raycast(b.pos, scale(d, 1 / dl), dl);
    if (trailerHit(b.owner, next)) { b.life = 0; continue; }
    const target = cars.find(c => c !== b.owner && !isImmune(c) && len(sub(c.pos, next)) < 0.35);
    if (target) { if (hit(pk, target)) events.push({ type: 'splash', car: target, by: b.owner }); b.life = 0; }
    else if (wall) { events.push({ type: 'splash', pos: wall.point }); b.life = 0; }
    b.pos = next; b.life -= dt;
  }
  pk.balloons = pk.balloons.filter(b => b.life > 0);
  stepMissiles(pk, cars, world, dt, isImmune, events, trailerHit);
  for (const s of pk.slicks) {
    s.life -= dt;
    for (const c of cars) if (c !== s.owner && !isImmune(c) && len(sub(c.pos, s.pos)) < 0.55 && fx(pk, c).bubble <= 0) fx(pk, c).slick = 1.2;
    if (s.life < 11) s.owner = null;   // after a second, the dropper can slide on it too
  }
  pk.slicks = pk.slicks.filter(s => s.life > 0);
  return events;
}

function stepMissiles(pk, cars, world, dt, isImmune, events, trailerHit) {
  const ok = (m, c) => c !== m.owner && !isImmune(c);
  const cone = (from, dir, c, cos) => { const d = sub(c.pos, from), l = len(d); return l > 0.3 && dot(d, dir) / l > cos; };
  for (const m of pk.missiles) {
    const sp = SPEC[m.kind], ownerFwd = rotate(m.owner.q, [0, 0, -1]);
    // Pick or keep a target.
    if (m.kind === 'pitbull' && (m.retarget -= dt) <= 0) { m.retarget = 0.5; m.target = (pk.order ?? []).find(c => ok(m, c)) ?? cars.filter(c => ok(m, c)).sort((a, b) => len(sub(a.pos, m.pos)) - len(sub(b.pos, m.pos)))[0] ?? null; }
    if (m.kind === 'foxtwo' && !m.target) m.target = cars.filter(c => ok(m, c) && cone(m.pos, m.dir, c, Math.cos(0.8)) && len(sub(c.pos, m.pos)) < 25).sort((a, b) => len(sub(a.pos, m.pos)) - len(sub(b.pos, m.pos)))[0] ?? null;
    // Beam-rider: aim at a point on the shooter's beam a little ahead of the missile.
    const beamAim = m.kind === 'foxone' ? (() => { const d = beamDir(m.owner), r = Math.max(1, dot(sub(m.pos, m.owner.pos), d)) + 2; return { pos: add(m.owner.pos, scale(d, r)) }; })() : null;
    const aim = beamAim ?? m.target;
    if (aim && sp.turn) {
      const want = sub(aim.pos, m.pos); want[1] = 0; const wl = len(want);
      if (wl > 1e-3) {
        const cur = Math.atan2(m.dir[0], m.dir[2]), tgt = Math.atan2(want[0] / wl, want[2] / wl);
        const err = Math.atan2(Math.sin(tgt - cur), Math.cos(tgt - cur)), step = Math.max(-sp.turn * dt, Math.min(sp.turn * dt, err)), h = cur + step;
        m.dir = [Math.sin(h), 0, Math.cos(h)];
      }
    }
    // Fly low over whatever is below, check walls along the way.
    const move = scale(m.dir, sp.v * dt), wall = world.raycast(m.pos, m.dir, sp.v * dt + 0.1);
    if (wall && Math.abs(wall.normal[1]) < 0.6) {
      if (m.kind === 'zuni' && m.bounces-- > 0) { const n = [wall.normal[0], 0, wall.normal[2]], nl = len(n) || 1, k = dot(m.dir, n) / nl; m.dir = sub(m.dir, scale(n, 2 * k / nl)); }
      else { events.push({ type: 'boom', pos: wall.point }); m.life = 0; continue; }
    } else m.pos = add(m.pos, move);
    const ground = world.raycast([m.pos[0], m.pos[1] + 0.6, m.pos[2]], [0, -1, 0], 3);
    if (ground) m.pos[1] = ground.point[1] + 0.14;
    // Hits: a dangled missile behind its owner blocks the shot; otherwise spin the car it reaches.
    if (trailerHit(m.owner, m.pos)) { m.life = 0; continue; }
    const victim = cars.find(c => ok(m, c) && len(sub(c.pos, m.pos)) < 0.4);
    if (victim) { if (hit(pk, victim)) events.push({ type: 'boom', car: victim, by: m.owner }); else events.push({ type: 'boom', pos: m.pos }); m.life = 0; continue; }
    m.life -= dt;
  }
  pk.missiles = pk.missiles.filter(m => m.life > 0);
}

// The Fox One radar beam: the car's heading swung by its steering (1.4× the wheel angle, so a
// kid can sweep it wide).
export function beamDir(car) {
  const th = 2 * Math.atan2(car.q[1], car.q[3]) - (car.steer || 0) * 1.4;
  return [-Math.sin(th), 0, -Math.cos(th)];
}

// Chaff for `seconds`: the next hit pops the shield instead (Furball's grace after losing a balloon).
export function shield(pk, car, seconds) { const e = fx(pk, car); e.bubble = Math.max(e.bubble, seconds); }

// Give a car a short Afterburner (boost pads).
export function boostCar(pk, car, seconds) { const e = fx(pk, car); e.zoom = Math.max(e.zoom, seconds); }

// Where the munitions trailer rides: half a metre behind the car.
export const dangleSpot = car => add(car.pos, scale(rotate(car.q, [0, 0, -1]), -0.5));

// Rival use: fire a balloon at a car ahead, drop oil with someone close behind, zoom/bubble at once.
export function rivalWants(pk, car, cars) {
  const item = pk.held.get(car); if (!item) return false;
  if (item === 'zoom' || item === 'bubble') return true;
  if (MISSILES.has(item)) {
    const f = rotate(car.q, [0, 0, -1]);
    return cars.some(o => { if (o === car) return false; const d = sub(o.pos, car.pos), l = len(d);
      return item === 'pitbull' ? l < 25 : l < (item === 'zuni' ? 12 : 20) && dot(d, f) / l > Math.cos(item === 'zuni' ? 0.25 : 0.6); });
  }
  const fwd = rotate(car.q, [0, 0, -1]);
  return cars.some(o => {
    if (o === car) return false;
    const d = sub(o.pos, car.pos), ahead = dot(d, fwd), dist = len(d);
    return item === 'balloon' ? ahead > 1 && dist < 5 && ahead / dist > 0.9 : ahead < -0.3 && dist < 3;
  });
}
