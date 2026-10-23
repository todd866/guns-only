// A race: the player's session plus AI opponents driving the same car physics, and car-to-car
// bumping. Opponents follow the AI_* racing line (or the gates on courses without one) with a
// pure-pursuit steer and a curvature speed limit. In kid mode they rubber-band to stay near the
// player; in Big Kid they just drive.
import { createSession, stepSession, readout, recover } from './session.mjs';
import { add, sub, scale, dot, len, rotate } from './math.mjs';
import { createPickups, stepPickups, modifiers, use, rivalWants, MISSILES, boostCar } from './pickups.mjs';
import { padHit } from './features.mjs';
import { createFurball, stepFurball, furballInput, mayFire } from './furball.mjs';

export const SKILL = { cruise: 0.78, ace: 0.95 };
// Aggressor-squadron callsigns, one per rival paint scheme (ghost, desert, splinter, flanker, arctic).
export const CALLSIGNS = ['GHOST', 'SANDY', 'SPLINTER', 'FLANKER', 'FROSTY'];

export function createRace(course, { mode = 'kid', opponents = 3, roam = false, features = null, furball = false, params } = {}) {
  const grid = course.grid ?? gridBehind(course.start, opponents + 1);
  // The player starts at the back, as in Re-Volt: the chase camera sees the car, and there
  // are rivals to overtake from the first second.
  const slots = grid.slice(0, opponents + 1), player = createSession({ ...course, start: slots.at(-1) }, { mode, params });
  const line = racingLine(course);
  const rivals = slots.slice(0, -1).map((slot, i) => ({
    session: Object.assign(createSession({ ...course, start: slot }, { mode: 'bigKid' }), { autoUnstick: true }),
    skill: [SKILL.cruise, SKILL.ace, 0.86][i % 3], node: 0, colour: i, callsign: CALLSIGNS[i % CALLSIGNS.length],
  }));
  // Retreat: once a race the bugle sounds and every rival stops for the flag. The player can
  // stand to attention too, or keep driving (nobody tells the kid off).
  // Furball sessions drive like free drive (no gates, no lap) inside the race's own rules.
  if (roam || furball) for (const x of [player, ...rivals.map(r => r.session)]) x.roam = true;
  const race = { course, mode, roam, player, rivals, line, features, alts: altRoutes(course, line), pickups: createPickups(furball || roam ? { ...course, pickupItems: null } : course), events: [], clock: 0, t: 0, finishOrder: [], retreat: { at: furball ? Infinity : 18, length: 5 } };
  if (furball) race.furball = createFurball(race);
  return race;
}

// Racing line: AI nodes if authored, else the lap gates.
function racingLine(course) {
  const pts = course.ai?.length ? course.ai.map(a => [a.pos[0], a.pos[2], a.halfWidth || 2]) : course.checkpoints.map(c => [c[0], c[1], c[3] ?? 2.4]);
  return pts;
}

// ALT_<name>_NNN skill routes: each enters and leaves the main line at its nearest node.
function altRoutes(course, line) {
  const nearest = ([x, z]) => line.reduce((b, p, i) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(line[b][0] - x, line[b][1] - z) ? i : b, 0);
  return (course.alts ?? []).map(a => ({ name: a.name, nodes: a.nodes, entry: nearest(a.nodes[0]), exit: (nearest(a.nodes.at(-1)) + 1) % line.length }));
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

export const retreatActive = race => race.clock >= race.retreat.at && race.clock < race.retreat.at + race.retreat.length;

// 1-based place: finished cars by finish order, then everyone else by lap progress.
export function placeOf(race, s) {
  const done = race.finishOrder.indexOf(s);
  if (done >= 0) return done + 1;
  const others = [race.player, ...race.rivals.map(r => r.session)].filter(o => o !== s);
  return 1 + others.filter(o => race.finishOrder.includes(o) || progress(o) > progress(s)).length;
}

export function driveInput(race, rival) {
  const s = rival.session, r = readout(s), n = race.line.length;
  // Skill routes: aces branch onto an ALT line at its entry node and rejoin at its exit.
  if (!rival.alt && rival.skill >= 0.9) for (const a of race.alts) if (rival.node % n === a.entry && !rival.altBanned?.has(a.name)) { rival.alt = a; rival.altNode = 0; }
  const onAlt = !!rival.alt, line = onAlt ? rival.alt.nodes : race.line, m = line.length;
  const at = i => onAlt ? line[Math.max(0, Math.min(i, m - 1))] : line[((i % m) + m) % m];
  let node = onAlt ? rival.altNode : rival.node;
  // Advance along the line once a node is close or behind us.
  for (let k = 0; k < m; k++) {
    const p = at(node), dx = p[0] - r.x, dz = p[1] - r.z;
    const ahead = dx * Math.sin(r.yaw) - dz * Math.cos(r.yaw);
    if (Math.hypot(dx, dz) < Math.max(onAlt ? 0.9 : 1.5, p[2] * 0.8) || (ahead < 0 && Math.hypot(dx, dz) < (onAlt ? 2 : 6))) node++; else break;
  }
  if (onAlt) { rival.altNode = node; if (node >= m - 1) { rival.node = rival.alt.exit; rival.alt = null; } } else rival.node = node;
  // Careful on a skill route: shorter look-ahead, lower top speed.
  const look = onAlt ? 1 + r.speed * 0.2 : 1.6 + r.speed * 0.35;
  let target = at(node), i = node;
  while (Math.hypot(target[0] - r.x, target[1] - r.z) < look && i < node + m) target = at(++i);
  const want = Math.atan2(target[0] - r.x, -(target[1] - r.z)), err = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
  // Speed profile: each upcoming corner allows a speed from its turn angle; the car may carry
  // more speed while it still has room to brake down to it (v² = vc² + 2·a·d).
  const BRAKE = 5.5, top = (onAlt ? 5.5 : 13) * rival.skill;
  let vmax = top, dist = Math.hypot(at(node)[0] - r.x, at(node)[1] - r.z);
  for (let k = 0; k < 4; k++) {
    const a = at(node + k - 1), b = at(node + k), c = at(node + k + 1);
    const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
    const vc = Math.max(3.5, top * (1 - turn / Math.PI * 1.5));
    vmax = Math.min(vmax, Math.sqrt(vc * vc + 2 * BRAKE * dist));
    dist += Math.hypot(c[0] - b[0], c[1] - b[1]);
  }
  vmax *= 1 - Math.min(0.6, Math.abs(err));
  if (race.roam) vmax *= 0.75;   // free drive: rivals cruise round as traffic
  else if (s !== race.player) vmax *= packFactor(race, rival);
  const steer = Math.max(-1, Math.min(1, err * 2.2));
  if (vmax < 0.5 || retreatActive(race)) return { throttle: 0, brake: true, steer };
  return { throttle: r.forwardSpeed < vmax ? 1 : r.forwardSpeed > vmax + 1.5 ? -0.6 : 0.2, steer };
}

// Pack racing (owner, 2026-10-22: "you need to have people driving around you ... in any mode").
// Each rival holds a slot near the player (just ahead, alongside, just behind) in lap progress:
// ahead of its slot it eases off, behind it pushes, so the race happens around you, never over
// the horizon and never parked. Kid mode: over the last third of the lap, rivals level with or
// ahead of the kid ease off further, so a kid who keeps driving wins most of the time ("it's no
// fun if I just instantly win": the pack is still there until the end). Big Kid gives nothing.
export const PACK = { slots: [0.35, 0, -0.35], ease: 0.35, push: 0.25, floor: 0.45, ceiling: 1.3, kidLate: 0.66, kidGive: 0.7, boostBehind: 1, boostEvery: 2.5 };
export function packFactor(race, rival) {
  const n = race.course.checkpoints.length, me = progress(race.player), gap = progress(rival.session) - me;
  const d = gap - PACK.slots[rival.colour % PACK.slots.length];
  let k = d > 0 ? Math.max(PACK.floor, 1 - d * PACK.ease) : Math.min(PACK.ceiling, 1 - d * PACK.push);
  if (race.mode === 'kid' && me / n > PACK.kidLate && gap > -0.25) k = Math.min(k, PACK.kidGive);
  return k;
}

// Effects (zoom, oil, a balloon spin) ride on the step input; a spinning car's controls are dead.
function withEffects(race, car, input) {
  const m = modifiers(race.pickups, car);
  return m.spinning ? { boost: 1, gripScale: 0.5 } : { ...input, boost: m.boost, gripScale: m.gripScale };
}

export function stepRace(race, playerInput, dt = 1 / 120) {
  const pk = race.pickups, fb = race.furball;
  if (fb?.over) return;
  // Shot-down Furball cars leave the fight: no physics, no bumping, no targeting.
  const cars = [race.player.car, ...race.rivals.map(r => r.session.car)].filter(c => !fb?.out.has(c));
  if (race.player.running) race.clock += dt;
  race.t += dt;
  if (playerInput.fire) use(pk, race.player.car);
  // Race order for the Pitbull (blue shell): leader first. Free drive has no order.
  pk.order = race.roam || fb ? null : [race.player, ...race.rivals.map(r => r.session)].sort((a, b) => placeOf(race, a) - placeOf(race, b)).map(s => s.car);
  stepSession(race.player, withEffects(race, race.player.car, playerInput), dt);
  for (const rival of race.rivals) {
    if (fb?.out.has(rival.session.car)) continue;
    // After any recovery the rival is back at a gate: drop a half-driven skill route and resume the
    // main line from the node nearest where it now stands (otherwise it steers at its old target).
    if (rival.session.recoveries !== (rival.lastRec ?? 0)) {
      // A failed skill route is not retried: no teleport loops in front of a six-year-old.
      if (rival.alt) (rival.altBanned ??= new Set()).add(rival.alt.name);
      rival.lastRec = rival.session.recoveries; rival.alt = null;
      const [x, , z] = rival.session.car.pos;
      rival.node = race.line.reduce((b, p, i) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(race.line[b][0] - x, race.line[b][1] - z) ? i : b, 0);
    }
    // Kid mode: in a race rivals never aim balloons or oil at the player, only at each other.
    // Furball is the exception: being hunted is the game (see furball.mjs for the kid's cushions).
    const targets = race.mode === 'kid' && !fb ? cars.slice(1) : cars;
    if ((!fb || mayFire(race, rival)) && rivalWants(pk, rival.session.car, targets)) use(pk, rival.session.car);
    const input = fb ? furballInput(race, rival, () => driveInput(race, rival)) : driveInput(race, rival);
    stepSession(rival.session, withEffects(race, rival.session.car, input), dt);
    // A rival that clips a steerpoint (airborne over it, or wide) is credited once it is clearly on
    // its way to the next one; otherwise it races on beside you scored as gates behind and never
    // finishes. Rivals only: the player's gates stay strict.
    { const rs = rival.session, cps = race.course.checkpoints, g = rs.gate;
      if (!rs.roam && !rs.finished && g + 1 < cps.length) {
        const a = cps[g], b = cps[g + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (Math.hypot(b[0] - rs.car.pos[0], b[1] - rs.car.pos[2]) < seg * 0.5) rs.gate++;
      } }
    // A rival on its roof gets the same R a kid would press.
    if (rotate(rival.session.car.q, [0, 1, 0])[1] < 0.2 && rival.session.car.speed < 0.5) { rival.stuck = (rival.stuck || 0) + dt; if (rival.stuck > 1.5) { rival.stuck = 0; recover(rival.session); } }
  }
  for (const s of [race.player, ...race.rivals.map(r => r.session)])
    if (s.finished && !race.finishOrder.includes(s)) race.finishOrder.push(s);
  // Pack catch-up: a rival more than a gate behind the player lights a short Afterburner every
  // few seconds (visible flames, Mario Kart style), so a fast kid still has company.
  if (!race.roam && !fb) for (const rival of race.rivals) {
    rival.boostIn = (rival.boostIn ?? 0) - dt;
    if (rival.boostIn <= 0 && !rival.session.finished && progress(rival.session) - progress(race.player) < -PACK.boostBehind) { boostCar(pk, rival.session.car, 0.9); rival.boostIn = PACK.boostEvery; }
  }
  // Boost pads: a short Afterburner for whoever crosses one (rivals too).
  if (race.features) for (const c of cars) if (padHit(race.features, c)) boostCar(pk, c, 0.9);
  bump(cars);
  const events = stepPickups(pk, cars, race.course.world, dt, fb ? fb.out : race.mode === 'kid' ? race.player.car : null);
  if (fb) events.push(...stepFurball(race, events, dt));
  race.events.push(...events);
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
