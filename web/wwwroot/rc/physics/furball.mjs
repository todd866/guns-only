// Furball: the Mario Kart battle mode, in fighter-pilot slang for a many-ship dogfight.
// Every car carries kill-mark balloons; any weapon hit pops one, and a car with none left is
// shot down. Last car flying wins, or the most balloons when the clock runs out.
// Kid mode: rivals DO hunt the kid here (being hunted is the game); rivals hold a fresh pickup
// for a beat before firing, and every pop gives a moment of Chaff.
import {readout} from './session.mjs';
import {sub, len} from './math.mjs';
import {shield} from './pickups.mjs';

// Kid mode used to give the kid 5 balloons and rivals a 2.5 s hold: the owner won instantly.
export const FURBALL = {
  seconds: 180,
  balloons: {kid: [3, 3], bigKid: [3, 3]},
  kidFireDelay: 1,
  chaff: 2,
  respawn: 2.5
};

export function createFurball(race) {
  const [mine, theirs] = FURBALL.balloons[race.mode] ?? FURBALL.balloons.bigKid;
  const lives = new Map([[race.player.car, mine], ...race.rivals.map(r => [r.session.car, theirs])]);
  race.pickups.respawn = FURBALL.respawn;
  return {
    lives,
    pops: new Map(),
    kills: new Map(),
    out: new Set(),
    over: false,
    winner: null,
    left: FURBALL.seconds
  };
}

const sessions = race => [race.player, ...race.rivals.map(r => r.session)];
export const flying = race => sessions(race).filter(s => !race.furball.out.has(s.car));

// Turn this step's pickup hits into popped balloons; returns extra events (downed, over).
export function stepFurball(race, events, dt) {
  const fb = race.furball,
    extra = [];
  if (fb.over) return extra;
  fb.left = Math.max(0, fb.left - dt);
  for (const e of events) {
    if (!e.car || !fb.lives.has(e.car) || fb.out.has(e.car)) continue;
    const n = fb.lives.get(e.car) - 1;
    fb.lives.set(e.car, n);
    if (e.by) fb.pops.set(e.by, (fb.pops.get(e.by) ?? 0) + 1);
    if (n > 0) {
      shield(race.pickups, e.car, FURBALL.chaff);
      continue;
    }
    fb.out.add(e.car);
    race.pickups.held.delete(e.car);
    race.pickups.ammo.delete(e.car);
    if (e.by) fb.kills.set(e.by, (fb.kills.get(e.by) ?? 0) + 1);
    extra.push({
      type: 'downed',
      car: e.car,
      by: e.by,
      kills: e.by ? fb.kills.get(e.by) : 0,
      left: flying(race).length
    });
  }
  const alive = flying(race);
  if (alive.length <= 1 || fb.out.has(race.player.car) || fb.left <= 0) {
    fb.over = true;
    // Most balloons left, then most pops; a downed player cannot win.
    const score = s => (fb.out.has(s.car) ? -1e6 : 0) + fb.lives.get(s.car) * 100 + (fb.pops.get(s.car) ?? 0);
    fb.winner = sessions(race).sort((a, b) => score(b) - score(a))[0];
    extra.push({type: 'furball-over', winner: fb.winner});
  }
  return extra;
}

// Rival driving: no item → the nearest ready crate; armed → the nearest car still flying.
// When a wall stands between it and the target it follows the racing line instead (`fallback`).
export function furballInput(race, rival, fallback) {
  const s = rival.session,
    r = readout(s),
    pk = race.pickups,
    car = s.car;
  const armed = pk.held.has(car);
  const pool = armed
    ? flying(race)
        .filter(o => o !== s)
        .map(o => o.car.pos)
    : pk.spots.filter(sp => sp.ready <= 0).map(sp => sp.pos);
  const target = pool.sort((a, b) => len(sub(a, car.pos)) - len(sub(b, car.pos)))[0];
  if (!target) return fallback();
  const d = sub(target, car.pos),
    dist = len(d);
  const eye = [car.pos[0], car.pos[1] + 0.1, car.pos[2]],
    dir = [d[0] / dist, d[1] / dist, d[2] / dist];
  if (dist > 1 && race.course.world.raycast(eye, dir, dist - 0.3)) return fallback();
  const want = Math.atan2(d[0], -d[2]),
    err = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
  const top = 8 * rival.skill,
    vmax = top * (1 - Math.min(0.65, Math.abs(err))) * (armed && dist < 2 ? 0.6 : 1);
  return {throttle: r.forwardSpeed < vmax ? 1 : 0.1, steer: Math.max(-1, Math.min(1, err * 2.2))};
}

// Kid mode: a rival holds a fresh pickup for a beat before it may fire it.
export function mayFire(race, rival) {
  if (race.mode !== 'kid') return true;
  const held = race.pickups.held.has(rival.session.car);
  if (!held) {
    rival.armedAt = null;
    return false;
  }
  rival.armedAt ??= race.t + FURBALL.kidFireDelay;
  return race.t >= rival.armedAt;
}
