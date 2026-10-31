// Toy bowling: standard ten-frame scoring, authored arcade ball/pin impulses (not a rigid-body sim).
import {LANES, ALLEY_FLOOR_Y, BOWLING_ALLEY} from './bowling-alley.mjs';
export const BALL_RADIUS = 0.11;
export const bowlingTee = (lane = 1) => ({
  pos: [LANES[lane - 1].x, ALLEY_FLOOR_Y, LANES[lane - 1].approachZ],
  yaw: 0
});
export const BOWLING_TEE = bowlingTee();
export const approachLane = pos =>
  LANES.find(
    l =>
      Math.abs(pos[0] - l.x) < l.width / 2 + 0.12 &&
      pos[2] >= l.startZ &&
      pos[2] <= l.approachZ + 1.5 &&
      Math.abs(pos[1] - ALLEY_FLOOR_Y) < 0.6
  );
export const pinRack = (lane = 1) =>
  Array.from({length: 10}, (_, i) => {
    const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2),
      col = i - (row * (row + 1)) / 2;
    return {
      pos: [LANES[lane - 1].x + (col - row / 2) * 0.24, LANES[lane - 1].headZ - row * 0.24],
      vel: [0, 0],
      down: false,
      fall: 0
    };
  });
// A frame's cumulative score stays blank until its bonus balls have been rolled.
export function scoreFrames(frames) {
  let total = 0;
  return frames.map((f, i) => {
    let value = null;
    if (i === 9) {
      if (f.length >= 2 && (f[0] + f[1] < 10 || f.length === 3)) value = f.reduce((a, b) => a + b, 0);
    } else if (f[0] === 10) {
      const next = frames.slice(i + 1).flat();
      if (next.length >= 2) value = 10 + next[0] + next[1];
    } else if (f.length === 2) {
      if (f[0] + f[1] < 10) value = f[0] + f[1];
      else {
        const next = frames.slice(i + 1).flat();
        if (next.length) value = 10 + next[0];
      }
    }
    if (value == null) return null;
    total += value;
    return total;
  });
}
const isFreshRack = (f, delivery, frame) =>
  delivery === 0 ||
  (frame === 9 && (delivery === 1 ? f[0] === 10 : (f[0] < 10 && f[0] + f[1] === 10) || f[1] === 10));
export function frameMarks(f, index) {
  return f
    .map((n, i) => {
      const fresh = isFreshRack(f, i, index);
      return fresh && n === 10 ? 'X' : !fresh && n + f[i - 1] === 10 ? '/' : n === 0 ? '–' : String(n);
    })
    .join(' ');
}
export function createBowling({lane = 1, control = 'car', mode = 'kid'} = {}) {
  if (!LANES[lane - 1] || (control === 'car' && lane !== 1)) throw new RangeError('Bowling lane');
  return {
    kind: 'bowling',
    lane,
    control,
    bumpers: mode === 'kid',
    pins: pinRack(lane),
    frames: Array.from({length: 10}, () => []),
    frame: 0,
    delivery: 1,
    launched: false,
    settling: 0,
    elapsed: 0,
    ball: null,
    done: false,
    score: 0,
    rackDown: 0
  };
}
// Only pinfall in this delivery is recorded; a spare leaves the first ball's fallen pins off the deck.
export function recordDelivery(g, count) {
  if (g.done) return null;
  if (!Number.isInteger(count) || count < 0 || count > 10 - g.rackDown)
    throw new RangeError('Bowling pinfall');
  const index = g.frame,
    f = g.frames[index];
  const fresh = isFreshRack(f, f.length, index);
  const strike = fresh && count === 10,
    spare = !fresh && g.rackDown + count === 10;
  f.push(count);
  g.rackDown += count;
  let reset = false;
  if (index < 9) {
    if (strike || f.length === 2) {
      g.frame++;
      reset = true;
    }
  } else {
    g.done = f.length === 3 || (f.length === 2 && f[0] + f[1] < 10);
    reset = !g.done && g.rackDown === 10;
  }
  const totals = scoreFrames(g.frames);
  g.score = totals.filter(n => n != null).at(-1) ?? 0;
  if (reset) {
    g.pins = pinRack(g.lane);
    g.rackDown = 0;
  }
  // Remove dead wood between balls, including the last ball of a tenth-frame strike/spare.
  else for (const pin of g.pins) if (pin.down) pin.removed = true;
  for (const pin of g.pins) pin.vel = [0, 0];
  g.delivery = g.frames[g.frame].length + 1;
  g.launched = false;
  g.ball = null;
  g.elapsed = 0;
  g.settling = 0;
  return {
    rolled: true,
    frame: index + 1,
    strike,
    spare,
    pins: count,
    finished: g.done,
    score: g.score,
    total: g.score,
    tee: !g.done && g.control === 'car' ? bowlingTee(g.lane) : null
  };
}
export function nextDelivery(g) {
  if (g.done) return null;
  recordDelivery(g, g.pins.filter(p => p.down).length - g.rackDown);
  return g.done ? null : bowlingTee(g.lane);
}
export function rollBowling(g, {power, aim = 0, mode = 'kid'} = {}) {
  if (g.done || g.launched || g.control !== 'robot') return false;
  if (!Number.isFinite(power) || !Number.isFinite(aim)) return false;
  const lane = LANES[g.lane - 1];
  aim = Math.atan2(Math.sin(aim), Math.cos(aim));
  aim = mode === 'kid' && Math.abs(aim) <= 0.3 ? 0 : Math.max(-0.5, Math.min(0.5, aim));
  const speed = 4.8 + Math.max(0, Math.min(1, power)) * 8.2;
  g.bumpers = mode === 'kid';
  g.ball = {
    pos: [lane.x, ALLEY_FLOOR_Y + BALL_RADIUS, lane.startZ - 0.02],
    vel: [Math.sin(aim) * speed, 0, -Math.cos(aim) * speed],
    hook: aim * 0.08,
    gutter: false,
    gutterSaid: false,
    travel: 0
  };
  g.launched = true;
  return true;
}
export function stepBowling(g, actor, dt) {
  const b = BOWLING_ALLEY.bounds;
  if (
    !actor ||
    actor.pos[0] < b.minX - 5 ||
    actor.pos[0] > b.maxX + 5 ||
    actor.pos[2] < b.minZ - 5 ||
    actor.pos[2] > b.maxZ + 5 ||
    actor.pos[1] > 5
  )
    return {cancelled: true};
  if (g.done) return null;
  const lane = LANES[g.lane - 1],
    ball = g.ball;
  if (g.control === 'car' && actor.pos[2] < lane.startZ) g.launched = true;
  let gutterEvent = false;
  if (ball && !ball.inPit) {
    if (!ball.gutter) ball.vel[0] += ball.hook * dt;
    ball.pos[0] += ball.vel[0] * dt;
    ball.pos[2] += ball.vel[2] * dt;
    ball.travel += Math.hypot(ball.vel[0], ball.vel[2]) * dt;
    const edge = lane.width / 2 - BALL_RADIUS;
    if (Math.abs(ball.pos[0] - lane.x) > edge) {
      const side = Math.sign(ball.pos[0] - lane.x);
      if (g.bumpers) {
        ball.pos[0] = lane.x + side * edge;
        ball.vel[0] = -side * Math.abs(ball.vel[0]) * 0.7;
      } else {
        ball.gutter = true;
        ball.pos[0] = lane.x + side * (lane.width / 2 + BALL_RADIUS);
        ball.pos[1] = ALLEY_FLOOR_Y + 0.025;
        ball.vel[0] = 0;
        if (!ball.gutterSaid) {
          ball.gutterSaid = true;
          gutterEvent = true;
        }
      }
    }
    const drag = Math.exp(-0.035 * dt);
    ball.vel[0] *= drag;
    ball.vel[2] *= drag;
    if (ball.pos[2] < lane.endZ) {
      ball.inPit = true;
      ball.pos[2] = lane.endZ - 0.2;
      ball.pos[1] = ALLEY_FLOOR_Y - BALL_RADIUS;
      ball.vel = [0, 0, 0];
    }
  }
  const mover = g.control === 'robot' ? ball : actor;
  const speed = mover ? Math.hypot(mover.vel[0], mover.vel[2]) : 0;
  const knock = (pin, vx, vz) => {
    if (pin.down) return;
    pin.down = true;
    pin.vel = [vx, vz];
    g.launched = true;
  };
  if (mover && !mover.gutter && mover.pos[1] < ALLEY_FLOOR_Y + 0.9) {
    for (const pin of g.pins) {
      if (
        !pin.down &&
        Math.hypot(pin.pos[0] - mover.pos[0], pin.pos[1] - mover.pos[2]) < (ball ? 0.21 : 0.35) &&
        speed > 0.4
      )
        knock(pin, mover.vel[0] * 0.6 + (pin.pos[0] - mover.pos[0]) * 5, mover.vel[2] * 0.6);
    }
  }
  for (const pin of g.pins) {
    if (!pin.down || pin.removed) continue;
    pin.fall = Math.min(1, pin.fall + dt * 3);
    pin.pos[0] += pin.vel[0] * dt;
    pin.pos[1] += pin.vel[1] * dt;
    const drag = Math.exp(-2 * dt);
    pin.vel[0] *= drag;
    pin.vel[1] *= drag;
    for (const other of g.pins) {
      if (other.down) continue;
      const dx = other.pos[0] - pin.pos[0],
        dz = other.pos[1] - pin.pos[1];
      if (Math.hypot(dx, dz) < 0.3 && Math.hypot(...pin.vel) > 0.3)
        knock(other, pin.vel[0] * 0.65 + dx * 2, pin.vel[1] * 0.65 + dz * 2);
    }
  }
  if (g.launched) {
    g.elapsed += dt;
    // Misses, a stopped car and a slow tap always finish. Idle approaches never consume a ball.
    if (
      (mover && mover.pos[2] < lane.endZ) ||
      g.elapsed > 7 ||
      (g.control === 'car' && g.elapsed > 1 && speed < 0.2)
    )
      g.settling += dt;
    if (g.settling > 1.5) return recordDelivery(g, g.pins.filter(p => p.down).length - g.rackDown);
  }
  return gutterEvent ? {gutter: true} : null;
}
