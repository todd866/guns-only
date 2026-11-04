import test from 'node:test';
import assert from 'node:assert/strict';
import {SWING, swingPowerOf} from './golf-swing.mjs';
import {
  createTennis,
  startTennis,
  stepTennis,
  tennisStart,
  tennisAssist,
  canHitTennis,
  swingTennis,
  onTennisCourt,
  TENNIS
} from './tennis.mjs';

const DT = 1 / 120;
const IDEAL_HOLD = SWING.period / 2;
const GAMES = 24;
const [cx, cz] = TENNIS.center;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function receiveAt(b) {
  const vy = b.vel[1],
    t =
      (vy + Math.sqrt(vy * vy + 2 * TENNIS.gravity * Math.max(0, b.pos[1] - TENNIS.radius))) / TENNIS.gravity;
  return [b.pos[0] + b.vel[0] * t, 0, b.pos[2] + b.vel[2] * t];
}

function walkToReceive(st, pos, dt) {
  if (!st.ball || st.ball.lastHit !== 'bot') return pos;
  const at = receiveAt(st.ball);
  const dx = clamp(at[0], cx - TENNIS.halfWidth, cx + TENNIS.halfWidth) - pos[0];
  const dz = clamp(at[2], cz + 0.5, cz + TENNIS.halfLength) - pos[2];
  const distance = Math.hypot(dx, dz);
  const k = Math.min(1, (4.5 * dt) / Math.max(distance, 1e-8));
  return [pos[0] + dx * k, pos[1] ?? 0, pos[2] + dz * k];
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stepPlayer(st, state, mode) {
  let pos = state.pos;
  if (st.ball?.lastHit === 'bot') {
    if (mode === 'kid') {
      const shift = tennisAssist(st, pos, DT);
      pos = pos.map((v, i) => v + shift[i]);
    } else pos = walkToReceive(st, pos, DT);
  }
  return {...state, pos};
}

function playMatch(mode, pilot, seed, maxSeconds = 480) {
  const st = createTennis({random: mulberry32(seed)});
  startTennis(st, {mode});
  const pilotRandom = mulberry32(seed ^ 0x9e3779b9);
  let state = pilot.init(tennisStart(), mode);
  for (let frame = 0; frame < maxSeconds * 120; frame++) {
    if (st.done) break;
    if (!st.active) {
      stepTennis(st, {pos: state.pos}, DT);
      continue;
    }
    state = pilot.frame(st, state, pilotRandom, mode);
    if (!onTennisCourt(state.pos, 4)) break;
    stepTennis(st, {pos: state.pos}, DT);
    if (state.swing) {
      swingTennis(st, {pos: state.pos, power: state.swing.power, aim: state.swing.aim ?? 0});
      state.swing = null;
    }
  }
  return st.score.you >= TENNIS.points ? 'you' : st.score.bot >= TENNIS.points ? 'bot' : 'timeout';
}

const tryingKid = {
  init(pos) {
    return {pos: [...pos], hold: null, swing: null, releaseAt: null};
  },
  frame(st, state, random, mode) {
    let next = {...stepPlayer(st, state, mode), swing: null};
    if (st.ball?.lastHit === 'bot') {
      if (next.hold == null) {
        next.hold = 0;
        next.releaseAt = IDEAL_HOLD + (random() * 2 - 1) * 0.25;
      } else next.hold += DT;
      if (next.hold >= Math.max(0.05, next.releaseAt)) {
        const ready = canHitTennis(st, next.pos) || next.hold >= next.releaseAt + 0.55;
        if (ready) {
          next.swing = {power: swingPowerOf(next.hold), aim: 0};
          next.hold = null;
          next.releaseAt = null;
        }
      }
    } else {
      next.hold = null;
      next.releaseAt = null;
    }
    return next;
  }
};

const buttonMasher = {
  init(pos) {
    return {pos: [...pos], hold: null, swing: null};
  },
  frame(st, state) {
    const next = {...state, swing: null};
    if (next.hold == null) next.hold = 0;
    else next.hold += DT;
    if (next.hold >= 1.35) {
      next.swing = {power: swingPowerOf(next.hold), aim: 0};
      next.hold = null;
    }
    return next;
  }
};

function winRate(mode, pilot, baseSeed) {
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    if (playMatch(mode, pilot, baseSeed + i * 9973) === 'you') wins++;
  }
  return wins / GAMES;
}

function totalYouPoints(mode, pilot, baseSeed) {
  let points = 0;
  for (let i = 0; i < GAMES; i++) {
    const seed = baseSeed + i * 9973;
    const st = createTennis({random: mulberry32(seed)});
    startTennis(st, {mode});
    const pilotRandom = mulberry32(seed ^ 0x9e3779b9);
    let state = pilot.init(tennisStart(), mode);
    for (let frame = 0; frame < 480 * 120; frame++) {
      if (st.done) break;
      if (!st.active) {
        stepTennis(st, {pos: state.pos}, DT);
        continue;
      }
      state = pilot.frame(st, state, pilotRandom, mode);
      stepTennis(st, {pos: state.pos}, DT);
      if (state.swing) {
        swingTennis(st, {pos: state.pos, power: state.swing.power, aim: 0});
        state.swing = null;
      }
    }
    points += st.score.you;
  }
  return points / GAMES;
}

test('trying kid wins often enough in Kid mode; button masher does not get a free win', () => {
  const kidWins = winRate('kid', tryingKid, 0xace);
  const masherWins = winRate('kid', buttonMasher, 0xbad);
  assert.ok(kidWins >= 0.4, `trying kid win rate ${(kidWins * 100).toFixed(1)}% (need >= 40%)`);
  assert.ok(masherWins <= 0.25, `button masher win rate ${(masherWins * 100).toFixed(1)}% (need <= 25%)`);
});

test('trying kid in Big Kid mode scores at least one point per game on average', () => {
  const avgYou = totalYouPoints('bigKid', tryingKid, 0xcafe);
  assert.ok(avgYou >= 1, `Big Kid trying kid averaged ${avgYou.toFixed(2)} points per game (need >= 1)`);
});
