// The spring meadow: the country club's twin in the dark world (docs/design/adventure, "Why people
// are here, then and now"). In the present the golf course is the greenest spot on the base because
// it's irrigated; in the past it's green because a spring comes up there, the only grass for miles,
// so the cattle trail camps on it. A ranch house where the clubhouse will stand, corrals where the
// tennis courts will be, a horseshoe pitch where the minigolf is, a windmill pump and a trough.
// The game is the roundup (golf's twin: the same aim-and-guide skill): cattle shy away from your
// dinosaur; herd them through the corral gate. Data and rules only; drawn by meadow.js.
import {CLUB} from './country-club.mjs';

const [cx, cz] = CLUB.clubhouse.at;
const [tx0, tz0, tx1, tz1] = CLUB.tennis.box;
export const MEADOW = Object.freeze({
  spring: {at: [cx + 40, cz - 70], r: [16, 11]}, // the pond the spring feeds, out on the meadow
  green: [
    // lush grass around the spring and down the wet ground (x, z, radius)
    [cx + 40, cz - 70, 70],
    [cx - 60, cz - 30, 55],
    [cx + 120, cz - 140, 60],
    [cx + 10, cz + 60, 50]
  ],
  ranch: {at: [cx, cz], size: [16, 9], yaw: 0},
  trough: {at: [cx + 14, cz - 8], size: [3.2, 0.8]},
  pitch: {box: CLUB.minigolf.box}, // horseshoe pitch
  // One big corral where the tennis courts will be, its gate on the meadow (north, -z) side.
  corral: {box: [tx0, tz0, tx1, tz1], gate: [(tx0 + tx1) / 2 - 5, (tx0 + tx1) / 2 + 5]},
  herd: 8, // steers on the meadow
  range: 75 // m from the spring that the cattle wander
});

// Steers: they graze and wander; your dinosaur within `shy` of one makes it trot away from you.
export const STEER = Object.freeze({shy: 9, trot: 4.2, graze: 0.6, turn: 2.5, radius: 0.9});

const inBox = (p, [x0, z0, x1, z1], pad = 0) =>
  p[0] > x0 + pad && p[0] < x1 - pad && p[1] > z0 + pad && p[1] < z1 - pad;
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function createRoundup(seed = 7) {
  const r = rng(seed),
    [sx, sz] = MEADOW.spring.at;
  const steers = Array.from({length: MEADOW.herd}, (_, i) => {
    const a = (i / MEADOW.herd) * Math.PI * 2 + r(),
      d = 25 + r() * 35;
    return {
      id: i,
      pos: [sx + Math.cos(a) * d, sz + Math.sin(a) * d],
      yaw: r() * Math.PI * 2,
      wander: r() * 6,
      penned: false,
      stunned: 0,
      stunLooted: false
    };
  });
  return {steers, penned: 0, started: null, done: false, time: 0, best: null};
}

// Steering a steer: flee the player, wander when calm, stay on the meadow, and go round the corral
// fence (walls on every side but the gate). Penned steers mill about inside.
function fence(s, next) {
  const box = MEADOW.corral.box,
    [g0, g1] = MEADOW.corral.gate,
    inside = inBox(s.pos, box),
    will = inBox(next, box);
  if (inside === will) return next;
  // Crossing the corral's north side through the gate is allowed (only inward); every other side is fence.
  const crossNorth = s.pos[1] < box[1] !== next[1] < box[1] && Math.abs(next[1] - box[1]) < 1.5;
  if (crossNorth && next[0] > g0 && next[0] < g1 && will) return next;
  return s.pos;
}

/** One step. player = [x, z] of your dinosaur, or null if you're not here. Returns events. */
export function stepRoundup(st, player, dt) {
  const ev = [];
  for (const s of st.steers) s.stunned = Math.max(0, (s.stunned ?? 0) - dt);
  if (st.done) return ev;
  st.time += dt;
  const [sx, sz] = MEADOW.spring.at,
    box = MEADOW.corral.box;
  for (const s of st.steers) {
    if (s.stunned > 0) continue;
    let want = null,
      speed = STEER.graze;
    if (s.penned) {
      // Inside: mill about toward the corral's middle.
      want = Math.atan2((box[0] + box[2]) / 2 - s.pos[0], (box[1] + box[3]) / 2 - s.pos[1]);
      speed = 0.3;
    } else if (player && Math.hypot(s.pos[0] - player[0], s.pos[1] - player[1]) < STEER.shy) {
      want = Math.atan2(s.pos[0] - player[0], s.pos[1] - player[1]); // away from you
      speed = STEER.trot;
      if (st.started == null) {
        st.started = st.time;
        ev.push({start: true});
      }
    } else if (Math.hypot(s.pos[0] - sx, s.pos[1] - sz) > MEADOW.range) {
      want = Math.atan2(sx - s.pos[0], sz - s.pos[1]); // drift home to the water
    } else {
      s.wander -= dt;
      if (s.wander < 0) {
        s.wander = 3 + ((s.id * 7.3 + st.time) % 5);
        s.yaw += ((s.id % 3) - 1) * 1.1;
      }
    }
    if (want != null) {
      let d = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
      s.yaw += Math.max(-STEER.turn * dt, Math.min(STEER.turn * dt, d));
    }
    const next = [s.pos[0] + Math.sin(s.yaw) * speed * dt, s.pos[1] + Math.cos(s.yaw) * speed * dt];
    const moved = fence(s, next);
    if (moved !== next) s.yaw += 2 * dt; // blocked by the fence: nose round along it
    s.pos = moved;
    if (!s.penned && inBox(s.pos, box, 0.5)) {
      s.penned = true;
      st.penned++;
      ev.push({penned: st.penned, of: st.steers.length});
      if (st.penned === st.steers.length) {
        st.done = true;
        const t = st.time - (st.started ?? st.time);
        st.best = st.best == null ? t : Math.min(st.best, t);
        ev.push({done: true, time: t});
      }
    }
  }
  // Steers don't stand inside each other.
  for (const a of st.steers)
    for (const b of st.steers) {
      if (a.id >= b.id) continue;
      if (a.stunned > 0 || b.stunned > 0) continue;
      const dx = b.pos[0] - a.pos[0],
        dz = b.pos[1] - a.pos[1],
        d = Math.hypot(dx, dz),
        min = STEER.radius * 2;
      if (d > 0 && d < min) {
        const k = (min - d) / d / 2;
        a.pos = [a.pos[0] - dx * k, a.pos[1] - dz * k];
        b.pos = [b.pos[0] + dx * k, b.pos[1] + dz * k];
      }
    }
  return ev;
}

/** Stun a steer for a short spell. Returns false for a missing target. */
export function stunSteer(steer, seconds = 4) {
  if (!steer) return false;
  if ((steer.stunned ?? 0) <= 0) steer.stunLooted = false;
  steer.stunned = Math.max(0, Number(seconds) || 0);
  return true;
}
