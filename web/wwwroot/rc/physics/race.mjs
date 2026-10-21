// A race: the player's session plus AI opponents driving the same car physics, and car-to-car
// bumping. Opponents follow the AI_* racing line (or the gates on courses without one) with a
// pure-pursuit steer and a curvature speed limit. In kid mode they rubber-band to stay near the
// player; in Big Kid they just drive.
import { createSession, stepSession, readout, recover } from './session.mjs';
import { add, sub, scale, dot, len, rotate } from './math.mjs';

export const SKILL = { cruise: 0.78, ace: 0.95 };

export function createRace(course, { mode = 'kid', opponents = 3 } = {}) {
  const grid = course.grid ?? gridBehind(course.start, opponents + 1);
  const player = createSession({ ...course, start: grid[0] }, { mode });
  const line = racingLine(course);
  const rivals = grid.slice(1, opponents + 1).map((slot, i) => ({
    session: createSession({ ...course, start: slot }, { mode: 'bigKid' }),
    skill: [SKILL.cruise, SKILL.ace, 0.86][i % 3], node: 0, colour: i,
  }));
  return { course, mode, player, rivals, line };
}

// Racing line: AI nodes if authored, else the lap gates.
function racingLine(course) {
  const pts = course.ai?.length ? course.ai.map(a => [a.pos[0], a.pos[2], a.halfWidth || 2]) : course.checkpoints.map(c => [c[0], c[1], c[3] ?? 2.4]);
  return pts;
}

// Prototype courses have one start; line the rest up behind it, two abreast.
function gridBehind(start, n) {
  const f = [Math.sin(start.yaw), 0, -Math.cos(start.yaw)], r = [Math.cos(start.yaw), 0, Math.sin(start.yaw)];
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / 2), side = i % 2 ? 0.45 : -0.45;
    return { pos: add(add(start.pos, scale(f, -row * 1.1)), scale(r, side)), yaw: start.yaw };
  });
}

// Lap progress for rubber-banding and standings: gates passed + fraction to the next gate.
export function progress(s) {
  const cps = s.course.checkpoints, g = Math.min(s.gate, cps.length - 1), prev = cps[Math.max(0, g - 1)], next = cps[g];
  const seg = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1, left = Math.hypot(next[0] - s.car.pos[0], next[1] - s.car.pos[2]);
  return s.finished ? cps.length + 1 : g + Math.max(0, 1 - left / seg);
}

export function driveInput(race, rival) {
  const s = rival.session, r = readout(s), line = race.line, n = line.length;
  // Advance along the line once a node is close or behind us.
  for (let k = 0; k < n; k++) {
    const p = line[rival.node % n], dx = p[0] - r.x, dz = p[1] - r.z;
    const ahead = dx * Math.sin(r.yaw) - dz * Math.cos(r.yaw);
    if (Math.hypot(dx, dz) < Math.max(1.5, p[2] * 0.8) || (ahead < 0 && Math.hypot(dx, dz) < 6)) rival.node++; else break;
  }
  const look = 1.6 + r.speed * 0.35;
  let target = line[rival.node % n], i = rival.node;
  while (Math.hypot(target[0] - r.x, target[1] - r.z) < look && i < rival.node + n) target = line[++i % n];
  const want = Math.atan2(target[0] - r.x, -(target[1] - r.z)), err = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
  // Corner speed from the turn coming up: the angle between the next two legs.
  const a = line[rival.node % n], b = line[(rival.node + 1) % n], c = line[(rival.node + 2) % n];
  const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(c[0] - b[0], c[1] - b[1]) - Math.atan2(b[0] - a[0], b[1] - a[1])), Math.cos(Math.atan2(c[0] - b[0], c[1] - b[1]) - Math.atan2(b[0] - a[0], b[1] - a[1]))));
  let vmax = Math.max(3, (13 - turn * 6) * rival.skill) * (1 - Math.min(0.6, Math.abs(err)));
  if (race.mode === 'kid') {
    // Rubber band: ease off once ahead of the player and all but wait two gates up the road;
    // push a little when behind. Nobody disappears over the horizon on a six-year-old.
    const gap = progress(s) - progress(race.player);
    vmax *= gap > 2 ? 0 : gap > 0 ? Math.max(0.1, 1 - gap * 0.45) : Math.min(1.15, 1 - gap * 0.08);
  }
  const steer = Math.max(-1, Math.min(1, err * 2.2));
  if (vmax < 0.5) return { throttle: 0, brake: true, steer };
  return { throttle: r.forwardSpeed < vmax ? 1 : r.forwardSpeed > vmax + 1.5 ? -0.6 : 0.2, steer };
}

export function stepRace(race, playerInput, dt = 1 / 120) {
  stepSession(race.player, playerInput, dt);
  for (const rival of race.rivals) {
    stepSession(rival.session, driveInput(race, rival), dt);
    // A rival on its roof gets the same R a kid would press.
    if (rotate(rival.session.car.q, [0, 1, 0])[1] < 0.2 && rival.session.car.speed < 0.5) { rival.stuck = (rival.stuck || 0) + dt; if (rival.stuck > 1.5) { rival.stuck = 0; recover(rival.session); } }
  }
  bump([race.player, ...race.rivals.map(r => r.session)].map(s => s.car));
}

// Car-to-car: body spheres against body spheres, equal-mass impulses with a little bounce.
const BODY = [[0, 0.02, -0.14], [0, 0.02, 0], [0, 0.02, 0.14]], R = 0.12;
export function bump(cars) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (len(sub(a.pos, b.pos)) > 0.8) continue;
    for (const pa of BODY) for (const pb of BODY) {
      const ca = add(a.pos, rotate(a.q, pa)), cb = add(b.pos, rotate(b.q, pb)), d = sub(ca, cb), dl = len(d);
      if (dl >= 2 * R || dl < 1e-6) continue;
      const n = scale(d, 1 / dl), depth = 2 * R - dl;
      a.pos = add(a.pos, scale(n, depth / 2)); b.pos = sub(b.pos, scale(n, depth / 2));
      const vn = dot(sub(a.vel, b.vel), n);
      if (vn < 0) { const j = -(1 + 0.3) * vn / 2; a.vel = add(a.vel, scale(n, j)); b.vel = sub(b.vel, scale(n, j)); a.impact = Math.max(a.impact, -vn); b.impact = Math.max(b.impact, -vn); }
    }
  }
}
