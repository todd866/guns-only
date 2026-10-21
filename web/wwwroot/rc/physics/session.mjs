// One player's race: car + assists + gates, specimens, timing and recovery.
// A course is { world, checkpoints:[[x,z,name]], secrets:[{x,z}], start:{pos,yaw} }.
import { createCar, stepCar, placeCar, rideHeight, carYaw, BUGGY } from './car.mjs';
import { createAssist, assistInput, MODES } from './assists.mjs';
import { len, sub } from './math.mjs';

export function createSession(course, { mode = 'kid', params = BUGGY } = {}) {
  const { pos, yaw } = course.start;
  const car = createCar(params, [pos[0], groundBelow(course.world, pos) + rideHeight(params), pos[2]], yaw);
  return { course, car, assist: createAssist(mode), mode, time: 0, gate: 0, running: false, finished: false,
    hits: 0, found: 0, seen: [], travel: 0, recoveries: 0 };
}

// Spawn and recovery stand on whatever the world has under that point.
function groundBelow(world, pos) { const hit = world.raycast([pos[0], pos[1] + 20, pos[2]], [0, -1, 0], 40); return hit ? hit.point[1] : pos[1]; }
const above = (s, maxDrop) => s.course.world.raycast(s.car.pos, [0, -1, 0], maxDrop);

export function stepSession(s, raw, dt = 1 / 120) {
  const before = [...s.car.pos];
  stepCar(s.car, assistInput(s.assist, s.car, raw, dt), s.course.world, dt);
  s.travel += len(sub(s.car.pos, before));
  if (s.car.wallImpact > 1.5) s.hits++;
  if (s.running) s.time += dt;
  const [x, , z] = s.car.pos, low = !!above(s, 1.6);
  const cps = s.course.checkpoints, g = cps[s.gate];
  if (!s.finished && low && Math.hypot(x - g[0], z - g[1]) < 2.4) {
    if (!s.running) { s.running = true; s.time = 0; }
    s.gate++;
    if (s.gate === cps.length) { s.running = false; s.finished = true; s.gate = cps.length - 1; }
  }
  s.course.secrets.forEach((p, i) => {
    if (low && !s.seen.includes(i) && Math.hypot(x - p.x, z - p.z) < 3.3) { s.seen.push(i); s.found++; }
  });
}

// R: back to the last gate passed, facing the next one. Free in kid mode, +3 s in Big Kid.
export function recover(s) {
  const cps = s.course.checkpoints, last = cps[Math.max(0, s.gate - 1)], next = cps[Math.min(cps.length - 1, s.gate)];
  const yaw = s.gate === 0 ? s.course.start.yaw : Math.atan2(next[0] - last[0], -(next[1] - last[1]));
  placeCar(s.car, [last[0], groundBelow(s.course.world, [last[0], 0, last[1]]) + rideHeight(s.car.params) + 0.02, last[1]], yaw);
  s.recoveries++;
  if (s.running && !MODES[s.mode].freeRecovery) s.time += 3;
}

// Flat readout for HUD, camera and tests.
export function readout(s) {
  const c = s.car;
  return { x: c.pos[0], y: c.pos[1], z: c.pos[2], yaw: carYaw(c), speed: c.speed, forwardSpeed: c.forwardSpeed,
    steer: c.steer, grounded: c.grounded, contacts: c.contacts };
}
