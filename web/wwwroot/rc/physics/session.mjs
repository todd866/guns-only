// One player's race: car + assists + gates, specimens, timing and recovery.
// A course is { world, checkpoints:[[x,z,name]], secrets:[{x,z}], start:{pos,yaw} }.
import { createCar, stepCar, placeCar, rideHeight, carYaw, BUGGY } from './car.mjs';
import { createAssist, assistInput, MODES } from './assists.mjs';
import { stepSkateRide } from './grind.mjs';
import { createFlight, stepFlight } from './flight.mjs';
import { stepWater } from './water.mjs';
import { len, sub } from './math.mjs';

export function createSession(course, { mode = 'kid', params = BUGGY } = {}) {
  const { pos, yaw } = course.start;
  const car = createCar(params, [pos[0], groundBelow(course.world, pos) + rideHeight(params), pos[2]], yaw);
  return { course, car, assist: createAssist(mode), flight: createFlight(), mode, time: 0, gate: 0, running: false, finished: false,
    lap: 1, laps: Math.max(1, Math.floor(course.laps ?? 1)), lapTimes: [], lapStartedAt: 0, hits: 0, found: 0, seen: [], coins: [], travel: 0, recoveries: 0, stuckTime: 0, autoUnstick: mode === 'kid' };
}

// A gate counts when you are within its radius, or (for district gates that carry a direction)
// when this step crossed the gate line inside its width: a car cutting wide still went through.
function throughGate(a, b, g) {
  if (Math.hypot(b[0] - g[0], b[2] - g[1]) < (g[3] ?? 2.4)) return true;
  const f = g[4]; if (!f || !a) return false;
  const d0 = (a[0] - g[0]) * f[0] + (a[2] - g[1]) * f[1], d1 = (b[0] - g[0]) * f[0] + (b[2] - g[1]) * f[1];
  if (!(d0 < 0 && d1 >= 0)) return false;
  const t = d0 / (d0 - d1), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
  return Math.abs((x - g[0]) * -f[1] + (z - g[1]) * f[0]) < (g[3] ?? 2.4) + 1.5;
}

// Spawn and recovery stand on whatever the world has under that point.
function groundBelow(world, pos) { const hit = world.raycast([pos[0], pos[1] + .5, pos[2]], [0, -1, 0], 1) ?? world.raycast([pos[0], pos[1] + 20, pos[2]], [0, -1, 0], 40); return hit ? hit.point[1] : pos[1]; }
const above = (s, maxDrop) => s.course.world.raycast(s.car.pos, [0, -1, 0], maxDrop);

export function stepSession(s, raw, dt = 1 / 120) {
  const before = [...s.car.pos];
  s.prevPos = before;
  // Free-drive flight takes the car off its wheels; the normal step resumes on touchdown.
  if (!s.roam && s.flight.mode) s.flight.mode = null;
  if (stepFlight(s.flight, s.car, raw.flight, s.course.world, dt)) { /* flying or under the chute */ }
  else if (!stepSkateRide(s, raw, dt)) stepCar(s.car, assistInput(s.assist, s.car, s.skateRide ? { ...raw, skate: true } : raw, dt, s.course.world), s.course.world, dt);
  // Water: buoyancy everywhere it is deep enough, boat handling once the car floats.
  if (!s.flight.mode) stepWater(s.car, raw, dt, s.mode);
  s.travel += len(sub(s.car.pos, before));
  if (s.car.wallImpact > 1.5) s.hits++;
  // Wedged against a pole or a rival with the throttle held: after 2.5 s, hop back to the last
  // steerpoint (free in kid mode). Six-year-olds do not reverse out of corners.
  const pushing = Math.abs(raw.throttle || 0) > 0.4 && s.car.speed < 0.3 && s.car.grounded;
  s.stuckTime = pushing ? s.stuckTime + dt : 0;
  if (s.autoUnstick && s.stuckTime > 2.5) { s.stuckTime = 0; recover(s); }
  if (s.course.outOfBounds?.(s.car.pos)) recover(s);
  if (s.running) s.time += dt;
  const [x, , z] = s.car.pos, low = !!above(s, 1.6);
  const cps = s.course.checkpoints;
  // A gate clipped wide is credited when the car reaches the next one having really driven the
  // distance (60% of the route from the last gate): otherwise a kid laps on in last place with
  // nothing counting (2026-10-29 Neighbourhood Run). The distance rule keeps it from being a
  // shortcut, including where a later gate sits on an earlier one (Base Traffic's U-turn).
  if (!s.roam && !s.finished && low && s.gate > 0 && s.gate + 1 < cps.length && !throughGate(s.prevPos, s.car.pos, cps[s.gate])
    && throughGate(s.prevPos, s.car.pos, cps[s.gate + 1])) {
    const a = cps[s.gate - 1], b = cps[s.gate], c = cps[s.gate + 1];
    if (s.travel - (s.gateTravel ?? 0) >= 0.6 * (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]))) { s.gate++; s.missedGates = (s.missedGates ?? 0) + 1; }
  }
  const g = cps[s.gate];
  // Free drive (roam): no gates and no clock; coins and specimens still count.
  if (!s.roam && !s.finished && low && throughGate(s.prevPos, s.car.pos, g)) {
    if (!s.running) { s.running = true; s.time = 0; }
    s.gate++; s.gateTravel = s.travel;
    if (s.gate === cps.length) {
      s.lapTimes.push(s.time - s.lapStartedAt);
      s.lapStartedAt = s.time;
      if (s.lap < s.laps) { s.lap++; s.gate = 1; }
      else { s.running = false; s.finished = true; s.gate = cps.length - 1; }
    }
  }
  // Challenge coins: collected by driving through them (within 0.7 m, any height the car reaches).
  for (const c of s.course.coins ?? [])
    if (!s.coins.includes(c.name) && Math.hypot(x - c.x, z - c.z) < 0.7 && Math.abs(s.car.pos[1] - c.y) < 0.8) s.coins.push(c.name);
  s.course.secrets.forEach((p, i) => {
    if (low && !s.seen.includes(i) && Math.hypot(x - p.x, z - p.z) < 3.3) { s.seen.push(i); s.found++; }
  });
}

// R: back to the last gate passed, facing the next one. Free in kid mode, +3 s in Big Kid.
// With a racing line the car lands on the line beside that gate and faces along it (a straight
// gate-to-gate heading can point into a wall, e.g. BX aisle 5→6). Each repeat at the same gate
// starts a few metres further on, so an auto-unstick can never loop on one trap forever.
export function recover(s) {
  s.flight.mode = null;
  if (s.roam) return recoverInPlace(s);
  const cps = s.course.checkpoints, last = cps[Math.max(0, s.gate - 1)], next = cps[Math.min(cps.length - 1, s.gate)];
  const streakKey = `${s.lap}:${s.gate}`;
  s.recoverStreak = s.recoverKey === streakKey ? (s.recoverStreak ?? 0) + 1 : 0; s.recoverKey = streakKey;
  const line = s.gate > 0 && s.course.ai?.length > 2 ? s.course.ai : null;
  if (line) {
    const n = line.length, near = (x, z) => line.reduce((b, a, k) => Math.hypot(a.pos[0] - x, a.pos[2] - z) < Math.hypot(line[b].pos[0] - x, line[b].pos[2] - z) ? k : b, 0);
    const from = near(last[0], last[1]), to = near(next[0], next[1]), span = (to - from + n) % n;
    const i = (from + Math.min(s.recoverStreak * 3, Math.max(0, span - 1))) % n, p = line[i].pos, q = line[(i + 1) % n].pos;
    placeCar(s.car, [p[0], groundBelow(s.course.world, [p[0], p[1] ?? 0, p[2]]) + rideHeight(s.car.params) + 0.02, p[2]], Math.atan2(q[0] - p[0], -(q[2] - p[2])));
  } else {
    const yaw = s.gate === 0 ? s.course.start.yaw : Math.atan2(next[0] - last[0], -(next[1] - last[1]));
    placeCar(s.car, [last[0], groundBelow(s.course.world, [last[0], s.course.event?.points?.[Math.max(0,s.gate-1)]?.[2] ?? 0, last[1]]) + rideHeight(s.car.params) + 0.02, last[1]], yaw);
  }
  s.recoveries++;
  if (s.running && !MODES[s.mode].freeRecovery) s.time += 3;
}

// Free drive: back onto the nearest racing-line point where you are, facing along the line,
// never all the way home to the start (that is also where the RACE ring sits).
function recoverInPlace(s) {
  // Connected worlds supply a local safe point; their active event line may be kilometres away.
  if (s.course.recoveryPoint) {
    const at = s.course.recoveryPoint(s.car.pos);
    placeCar(s.car, [at.pos[0], (Number.isFinite(at.groundY)?at.groundY:groundBelow(s.course.world, at.pos)) + rideHeight(s.car.params) + 0.02, at.pos[2]], at.yaw ?? carYaw(s.car));
    s.recoveries++; return;
  }
  const pts = s.course.ai?.length ? s.course.ai.map(a => [a.pos[0], a.pos[2]]) : s.course.checkpoints.map(c => [c[0], c[1]]);
  const [x, , z] = s.car.pos, n = pts.length;
  const i = pts.reduce((b, p, k) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(pts[b][0] - x, pts[b][1] - z) ? k : b, 0);
  const p = pts[i], q = pts[(i + 1) % n], yaw = Math.atan2(q[0] - p[0], -(q[1] - p[1]));
  placeCar(s.car, [p[0], groundBelow(s.course.world, [p[0], 0, p[1]]) + rideHeight(s.car.params) + 0.02, p[1]], yaw);
  s.recoveries++;
}

// Flat readout for HUD, camera and tests.
export function readout(s) {
  const c = s.car;
  return { x: c.pos[0], y: c.pos[1], z: c.pos[2], yaw: carYaw(c), speed: c.speed, forwardSpeed: c.forwardSpeed,
    steer: c.steer, grounded: c.grounded, contacts: c.contacts };
}
