// Drive the real car physics (web/wwwroot/rc/physics/session.mjs) along authored waypoints, the
// way a careful kid would: pure pursuit, throttle capped at `cruise` m/s and slowed in tight turns.
// Used by the driven district tests (coins, shortcuts, the school slide). Coordinates are glTF
// (x, z), +Y up.
import { createSession, stepSession, readout } from '../../web/wwwroot/rc/physics/session.mjs';
import { placeCar, rideHeight } from '../../web/wwwroot/rc/physics/car.mjs';

// Blender (X, Y) -> glTF (x, z): the exporter maps +Y north to -Z.
export const fromBlender = ([x, y]) => [x, -y];

// course: courseFromGlb(...). path: [[x, z, capture?, speed?], ...]; the car starts on path[0]
// facing path[1] and counts a waypoint reached within `capture` m (or the waypoint's own third
// value); a fourth value caps the speed while heading for that waypoint. flatOut: full throttle,
// never brake (the kid who holds W). onStep(s, t, target) may return true to stop early.
// watch: optional [{x, y, z}] points; `nearest` reports the closest horizontal pass at their height.
export function drivePath(course, path, { mode = 'kid', cruise = 5, slow = 2.5, capture = 1.6, maxTime = 90, watch = [], startY, trace = false, flatOut = false, onStep = null, startSpeed = 0 } = {}) {
  const s = createSession(course, { mode });
  const [a, b] = path;
  const ground = course.world.raycast([a[0], (startY ?? 0) + 3, a[1]], [0, -1, 0], 6);
  placeCar(s.car, [a[0], (ground ? ground.point[1] : 0) + rideHeight(s.car.params) + 0.02, a[1]], Math.atan2(b[0] - a[0], -(b[1] - a[1])));
  if (startSpeed) { const f = Math.atan2(b[0] - a[0], -(b[1] - a[1])); s.car.vel = [Math.sin(f) * startSpeed, 0, -Math.cos(f) * startSpeed]; }
  const dt = 1 / 120, seen = watch.map(() => Infinity);
  const tr = [];
  let target = 1, stalled = 0, worstStall = 0, t = 0, maxTilt = 0, airborne = 0, maxAir = 0;
  while (t < maxTime && target < path.length) {
    const r = readout(s), p = path[target];
    const last = target === path.length - 1;
    if (Math.hypot(p[0] - r.x, p[1] - r.z) < (last ? Math.min(capture, 1.2) : (p.length > 2 && p[2] != null ? p[2] : capture))) { target++; continue; }
    const want = Math.atan2(p[0] - r.x, -(p[1] - r.z));
    const e = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
    const steer = Math.max(-1, Math.min(1, e * 2.5));
    // Crawl through sharp turns (a kid lifts off rather than orbiting the waypoint).
    const own = p.length > 3 && p[3] != null ? p[3] : cruise;
    const limit = Math.abs(e) > 1.2 ? Math.min(1.2, own) : Math.abs(e) > 0.5 ? Math.min(slow, own) : own;
    if (flatOut) stepSession(s, { throttle: 1, steer, brake: false }, dt);
    else stepSession(s, { throttle: r.speed < limit ? 1 : 0, steer, brake: r.speed > limit + 1.5 }, dt);
    t += dt;
    const q = readout(s);
    stalled = q.speed < 0.3 ? stalled + dt : 0;
    worstStall = Math.max(worstStall, stalled);
    airborne = q.contacts === 0 ? airborne + dt : 0;
    maxAir = Math.max(maxAir, airborne);
    // Body up-axis tilt from vertical, degrees (car-local +Y rotated by the body quaternion).
    const [qx, qy, qz, qw] = s.car.q;
    const upY = 1 - 2 * (qx * qx + qz * qz);
    maxTilt = Math.max(maxTilt, Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI);
    if (trace && Math.round(t * 120) % 60 === 0) tr.push([t, q.x, q.y, -q.z, q.speed, target]);
    if (onStep && onStep(s, t, target)) break;
    watch.forEach((w, i) => {
      const d = Math.hypot(w.x - q.x, w.z - q.z);
      if (Math.abs(q.y - w.y) < 0.9) seen[i] = Math.min(seen[i], d);
    });
  }
  const r = readout(s);
  return { reached: target >= path.length, target, nodes: path.length, t, worstStall, maxTilt, maxAir, hits: s.hits,
    found: s.found, session: s, coins: [...(s.coins ?? [])], recoveries: s.recoveries, at: [r.x, r.y, r.z], nearest: seen, trace: trace ? tr : undefined };
}
