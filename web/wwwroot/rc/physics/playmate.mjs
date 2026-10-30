// Playmates (owner, 2026-10-30: "when you're aimlessly driving around, other cars should turn up
// from time to time and play with you"). In free drive a rival car pulls up behind the player and
// calls a race to a nearby place; both follow the road route there and the first to arrive wins.
// This module is pure: the open world supplies routes and places, main.js the callouts.
import { readout } from './session.mjs';

export const PLAYMATE = Object.freeze({
  firstAfter: [35, 60], gap: [70, 120], range: [220, 650], behind: 14, arrive: 14, timeout: 180,
  // Telemetry 2026-10-30: two of three invites were ignored and hung about for minutes. A rival
  // whose challenge isn't taken up (the player gets no closer for this long) gives up early.
  ignored: 45,
  top: { kid: 10.5, bigKid: 12.5 }, ease: 40, easeTo: .72, look: 3.2,
});

const lerp = ([a, b], t) => a + (b - a) * t;
export function createPlaymates(rng = Math.random) { return { rng, next: lerp(PLAYMATE.firstAfter, rng()), active: null, trail: [], races: 0, wins: 0 }; }

/** Remember where the player has driven: the playmate appears on a spot the player just used. */
export function trackPlayer(state, pos, time) {
  const last = state.trail.at(-1);
  if (!last || Math.hypot(pos[0] - last.p[0], pos[2] - last.p[2]) > 2) state.trail.push({ p: [...pos], t: time });
  if (state.trail.length > 40) state.trail.shift();
}

/** A spot ~behind metres back along the player's own trail, facing the way the player went. */
export function spawnBehind(state, pos) {
  let run = 0;
  for (let i = state.trail.length - 1; i > 0; i--) {
    const a = state.trail[i].p, b = state.trail[i - 1].p;
    run += Math.hypot(a[0] - b[0], a[2] - b[2]);
    if (run >= PLAYMATE.behind) return { pos: [...b], yaw: Math.atan2(a[0] - b[0], -(a[2] - b[2])) };
  }
  return null;
}

/** Pick a destination ahead of nothing in particular: a visitable place a short drive away. */
export function pickDestination(places, pos, rng) {
  const ok = places.filter(p => { const d = Math.hypot(p.pos[0] - pos[0], p.pos[2] - pos[2]); return d >= PLAYMATE.range[0] && d <= PLAYMATE.range[1]; });
  return ok.length ? ok[Math.floor(rng() * ok.length)] : null;
}

/** Follow a polyline [[x,z]...] with pure-pursuit steering and a corner-aware speed cap. */
export function followInput(session, f) {
  const r = readout(session), path = f.path;
  if (!path?.length) return { throttle: 0, brake: true, steer: 0 };
  while (f.i < path.length - 1) {
    const p = path[f.i], q = path[f.i + 1], dx = p[0] - r.x, dz = p[1] - r.z;
    const past = (q[0] - p[0]) * -dx + (q[1] - p[1]) * -dz > 0;
    if (Math.hypot(dx, dz) < 3 || past) f.i++; else break;
  }
  const look = PLAYMATE.look + r.speed * .35;
  let i = f.i, target = path[i];
  while (i < path.length - 1 && Math.hypot(target[0] - r.x, target[1] - r.z) < look) target = path[++i];
  const want = Math.atan2(target[0] - r.x, -(target[1] - r.z)), err = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
  let vmax = (f.top ?? 11) * (f.ease ?? 1) * (1 - Math.min(.6, Math.abs(err)));
  const end = path.at(-1);
  if (Math.hypot(end[0] - r.x, end[1] - r.z) < 6) vmax = Math.min(vmax, 2);
  const steer = Math.max(-1, Math.min(1, err * 2.2));
  return { throttle: r.forwardSpeed < vmax ? 1 : r.forwardSpeed > vmax + 1.5 ? -.6 : .2, steer };
}

const pathLeft = (path, from, pos) => {
  let d = Math.hypot(path[from][0] - pos[0], path[from][1] - pos[2]);
  for (let k = from; k < path.length - 1; k++) d += Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]);
  return d;
};

/**
 * One director tick. `world` = { places, route(pos, place) → [[x,z]...] }. Returns an event:
 * { start: {rival, dest, spawn} } | { finish: {winner: 'player'|'rival', dest, rival} } | { timeout } | null.
 */
export function stepPlaymates(state, { player, rivals, mode = 'kid', world, time, dt, ready = true }) {
  const pos = player.car.pos;
  trackPlayer(state, pos, time);
  const a = state.active;
  if (a) {
    a.time += dt;
    const rpos = a.rival.session.car.pos, dest = a.dest.pos;
    const playerIn = Math.hypot(pos[0] - dest[0], pos[2] - dest[2]) < PLAYMATE.arrive;
    const rivalIn = Math.hypot(rpos[0] - dest[0], rpos[2] - dest[2]) < PLAYMATE.arrive;
    // Ease off when far ahead of the player on the road, so the race stays a race.
    const f = a.rival.follow, gap = pathLeft(a.playerPath, 0, pos) - pathLeft(f.path, f.i, rpos);
    // Progress toward the finish, as the crow flies (the player's own path is measured from its start).
    const left = Math.hypot(pos[0] - dest[0], pos[2] - dest[2]);
    f.ease = gap > PLAYMATE.ease ? PLAYMATE.easeTo : 1;
    a.startLeft ??= left;
    if (a.bestLeft == null || left < a.bestLeft - 5) { a.bestLeft = left; a.idle = 0; } else a.idle = (a.idle ?? 0) + dt;
    const ignored = a.idle > PLAYMATE.ignored;
    if (playerIn || rivalIn || a.time > PLAYMATE.timeout || ignored) {
      state.active = null; state.next = lerp(PLAYMATE.gap, state.rng());
      if (!playerIn && !rivalIn) return { timeout: { dest: a.dest, rival: a.rival, ignored, closed: Math.max(0, Math.round(a.startLeft - a.bestLeft)) } };
      const winner = playerIn ? 'player' : 'rival';
      if (winner === 'player') state.wins++;
      return { finish: { winner, dest: a.dest, rival: a.rival, time: a.time } };
    }
    return null;
  }
  if (!ready || !rivals.length) return null;
  state.next -= dt;
  if (state.next > 0) return null;
  const dest = pickDestination(world.places, pos, state.rng), spawn = dest && spawnBehind(state, pos);
  if (!dest || !spawn) { state.next = 5; return null; }
  const rival = rivals[state.races % rivals.length], path = world.route(spawn.pos, dest), playerPath = world.route(pos, dest);
  if (!path?.length || !playerPath?.length) { state.next = 5; return null; }
  rival.follow = { path, i: 0, top: PLAYMATE.top[mode] ?? PLAYMATE.top.kid, ease: 1 };
  state.active = { rival, dest, time: 0, playerPath };
  state.races++;
  return { start: { rival, dest, spawn } };
}
