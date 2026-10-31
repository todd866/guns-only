// Arcade tennis on the country club's left court. X/Z are world metres; ball Y is
// height above the court, so the drawing layer can follow the club's terrain.
import {CLUB} from './country-club.mjs';

const [x0, z0, x1, z1] = CLUB.tennis.box;
export const TENNIS = Object.freeze({
  center: Object.freeze([x0 + (x1 - x0) / 4, (z0 + z1) / 2]),
  halfWidth: 10.97 / 2,
  halfLength: 23.77 / 2,
  netHeight: 1.07,
  radius: 0.1,
  gravity: 3.2,
  points: 5
});
const [cx, cz] = TENNIS.center;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const other = who => (who === 'you' ? 'bot' : 'you');
const sideOf = pos => (pos[2] >= cz ? 'you' : 'bot');
export const tennisReach = mode => (mode === 'bigKid' ? 0.8 : 1.2);
export const onTennisCourt = (pos, margin = 0) =>
  !!pos &&
  Math.abs(pos[0] - cx) <= TENNIS.halfWidth + margin + 1e-7 &&
  Math.abs(pos[2] - cz) <= TENNIS.halfLength + margin + 1e-7;
export const tennisStart = () => [cx, 0, cz + 8];

export function createTennis({random = Math.random} = {}) {
  return {
    active: false,
    done: false,
    mode: 'kid',
    score: {you: 0, bot: 0},
    ball: null,
    bot: {pos: [cx, 0, cz - 8], vel: [0, 0, 0], yaw: Math.PI, walkPhase: 0},
    wait: 0,
    hits: 0,
    botMiss: false,
    random
  };
}

export function startTennis(st, {mode = 'kid'} = {}) {
  const random = st.random;
  Object.assign(st, createTennis({random}), {active: true, mode, wait: 1.2});
  return st;
}

export function stopTennis(st) {
  st.active = st.done = false;
  st.ball = null;
  st.wait = 0;
  st.bot.vel = [0, 0, 0];
}

// A point consumes the ball. Completion is emitted once, on reaching five.
export function tennisPoint(st, winner, reason) {
  if (!st.active || st.done) return [];
  st.score[winner]++;
  st.ball = null;
  st.wait = 1.8;
  const events = [{point: winner, reason}];
  if (st.score[winner] >= TENNIS.points) {
    st.active = false;
    st.done = true;
    st.wait = 0;
    events.push({win: winner});
  }
  return events;
}

// All shots are gentle lobs, including the bot's serve. Power changes depth, not
// speed. Landing inside the lines still requires reaching the ball at release.
function lob(st, from, who, targetX, targetZ) {
  const distance = Math.hypot(targetX - from[0], targetZ - from[2]);
  const time = clamp(distance / 5.8, 1.5, 3.2);
  st.ball = {
    pos: [...from],
    vel: [
      (targetX - from[0]) / time,
      (TENNIS.radius - from[1]) / time + (TENNIS.gravity * time) / 2,
      (targetZ - from[2]) / time
    ],
    lastHit: who,
    bounces: 0
  };
  st.hits++;
  if (who === 'you') st.botMiss = st.random() < (st.mode === 'bigKid' ? 1 / 5 : 1 / 3);
}

export function canHitTennis(st, pos, who = 'you') {
  const b = st.ball;
  if (!st.active || !b || b.lastHit === who || sideOf(b.pos) !== who || sideOf(pos) !== who) return false;
  // The toy's racket sweeps around waist/chest height; the generous Kid radius
  // includes a low bounce and does not let a distant overhead ball be hit.
  const reach = who === 'bot' ? 1.1 : tennisReach(st.mode);
  return Math.hypot(b.pos[0] - pos[0], b.pos[1] - 0.45, b.pos[2] - pos[2]) <= reach;
}

export function swingTennis(st, {pos, power = 0.5, aim = 0}) {
  if (!canHitTennis(st, pos)) return false;
  aim = clamp(aim, -1, 1);
  if (st.mode !== 'bigKid' && Math.abs(aim) < 0.25) aim = 0;
  lob(st, st.ball.pos, 'you', cx + aim * (TENNIS.halfWidth - 1), cz - 5.5 - clamp(power, 0, 1) * 3.5);
  return true;
}

// Expected first bounce (or the current low ball after it bounces). Both the bot
// and Kid assist walk toward this spot instead of chasing a ball high overhead.
function receiveAt(b) {
  if (b.bounces) return b.pos;
  const vy = b.vel[1],
    t =
      (vy + Math.sqrt(vy * vy + 2 * TENNIS.gravity * Math.max(0, b.pos[1] - TENNIS.radius))) / TENNIS.gravity;
  return [b.pos[0] + b.vel[0] * t, 0, b.pos[2] + b.vel[2] * t];
}

export function tennisAssist(st, pos, dt) {
  if (!st.active || st.mode === 'bigKid' || !st.ball || st.ball.lastHit !== 'bot') return [0, 0, 0];
  const at = receiveAt(st.ball),
    dx = clamp(at[0], cx - TENNIS.halfWidth, cx + TENNIS.halfWidth) - pos[0],
    dz = clamp(at[2], cz + 0.5, cz + TENNIS.halfLength) - pos[2],
    distance = Math.hypot(dx, dz),
    scale = Math.min(
      1,
      Math.max(0, distance - 0.25) / Math.max(distance, 1e-8),
      (2 * dt) / Math.max(distance, 1e-8)
    );
  return [dx * scale, 0, dz * scale];
}

function botReturn(st, player) {
  const spread = st.mode === 'bigKid' ? 1.2 : 0.65;
  // Aim near the player's feet so normal walking speed can reach the return.
  const tx = clamp(player[0] + (st.random() * 2 - 1) * spread, cx - 4, cx + 4),
    tz = clamp(player[2], cz + 5.5, cz + 9);
  lob(st, st.ball?.pos ?? [st.bot.pos[0], 0.65, st.bot.pos[2]], 'bot', tx, tz);
}

// Swept net and exact ballistic floor intersections prevent a fast segment from
// skipping the net or calling a ball out at its post-bounce position.
function ballStep(st, dt) {
  const b = st.ball,
    p = b.pos,
    v = b.vel,
    g = TENNIS.gravity;
  const floorTime = (v[1] + Math.sqrt(v[1] ** 2 + 2 * g * Math.max(0, p[1] - TENNIS.radius))) / g;
  const netTime = Math.abs(v[2]) > 1e-8 ? (cz - p[2]) / v[2] : -1;
  if (
    netTime > 1e-8 &&
    netTime <= Math.min(dt, floorTime) &&
    Math.abs(p[0] + v[0] * netTime - cx) <= TENNIS.halfWidth + 0.5 &&
    p[1] + v[1] * netTime - (g * netTime ** 2) / 2 <= TENNIS.netHeight + TENNIS.radius
  )
    return tennisPoint(st, other(b.lastHit), 'net');
  const t = Math.min(dt, floorTime);
  p[0] += v[0] * t;
  p[1] += v[1] * t - (g * t * t) / 2;
  p[2] += v[2] * t;
  v[1] -= g * t;
  if (floorTime <= dt) {
    // Once a ball bounced in, running beyond the lines cannot turn it into an out.
    if (b.bounces) return tennisPoint(st, b.lastHit, 'bounce');
    if (!onTennisCourt(p) || sideOf(p) === b.lastHit) return tennisPoint(st, other(b.lastHit), 'out');
    b.bounces++;
    p[1] = TENNIS.radius;
    v[1] = Math.abs(v[1]) * 0.62;
    return dt - t > 1e-8 ? ballStep(st, dt - t) : [];
  }
  return [];
}

export function stepTennis(st, {pos}, dt = 0) {
  const events = [];
  if (!st.active || !Number.isFinite(dt) || dt <= 0) return events;
  // This game is a place: walking away ends it without awarding a win.
  if (!onTennisCourt(pos, 4)) {
    stopTennis(st);
    return events;
  }
  let remaining = dt;
  while (remaining > 1e-8 && st.active) {
    const h = Math.min(remaining, 1 / 120);
    remaining -= h;
    if (!st.ball) {
      st.wait -= h;
      if (st.wait <= 0) {
        botReturn(st, pos);
        events.push({serve: true});
      }
      continue;
    }
    const b = st.ball,
      bot = st.bot;
    const at = b.lastHit === 'you' ? receiveAt(b) : [cx, 0, cz - 8];
    const dx = clamp(at[0], cx - TENNIS.halfWidth, cx + TENNIS.halfWidth) - bot.pos[0],
      dz = clamp(at[2], cz - TENNIS.halfLength, cz - 0.5) - bot.pos[2],
      distance = Math.hypot(dx, dz),
      k = Math.min(1, (3.5 * h) / Math.max(distance, 1e-8));
    bot.vel = [(dx * k) / h, 0, (dz * k) / h];
    bot.pos[0] += dx * k;
    bot.pos[2] += dz * k;
    bot.walkPhase += Math.hypot(bot.vel[0], bot.vel[2]) * h * 9;
    if (!st.botMiss && canHitTennis(st, bot.pos, 'bot')) {
      botReturn(st, pos);
      events.push({hit: 'bot'});
    }
    events.push(...ballStep(st, h));
  }
  return events;
}
