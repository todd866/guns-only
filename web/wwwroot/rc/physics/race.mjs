// A race: the player's session plus AI opponents driving the same car physics, and car-to-car
// bumping. Opponents follow the AI_* racing line (or the gates on courses without one) with a
// pure-pursuit steer and a curvature speed limit. Both modes keep a bounded nearby pack.
import { createSession, stepSession, readout, recover } from './session.mjs';
import { add, sub, scale, dot, len, rotate } from './math.mjs';
import { createPickups, stepPickups, modifiers, use, rivalWants, MISSILES, boostCar } from './pickups.mjs';
import { padHit } from './features.mjs';
import { createFurball, stepFurball, furballInput, mayFire } from './furball.mjs';

export const SKILL = { cruise: 0.78, ace: 0.95 };
// Aggressor-squadron callsigns, one per rival paint scheme (ghost, desert, splinter, flanker, arctic).
export const CALLSIGNS = ['GHOST', 'SANDY', 'SPLINTER', 'FLANKER', 'FROSTY', 'VIPER', 'BANDIT'];

export function createRace(course, { mode = 'kid', opponents = 3, roam = false, features = null, furball = false, params } = {}) {
  // Older authored districts contain four grid markers. Extend their last rows
  // instead of silently shrinking an eight-car race to four cars.
  const grid = course.grid?.length ? [...course.grid] : gridBehind(course.start, opponents + 1);
  const columns = grid.length === 1 ? 1 : 2;
  while (grid.length < opponents + 1) {
    const previous = grid[Math.max(0, grid.length - columns)], yaw = previous.yaw;
    grid.push({pos: add(previous.pos, [-Math.sin(yaw) * 1.1, 0, Math.cos(yaw) * 1.1]), yaw});
  }
  // The player starts at the back, as in Re-Volt: the chase camera sees the car, and there
  // are rivals to overtake from the first second.
  const slots = grid.slice(0, opponents + 1), player = createSession({ ...course, start: roam ? course.start : slots.at(-1) }, { mode, params });
  const line = racingLine(course);
  const rivals = (roam ? slots.slice(1) : slots.slice(0, -1)).map((slot, i) => ({
    session: Object.assign(createSession({ ...course, start: slot }, { mode: 'bigKid' }), { autoUnstick: true }),
    skill: [SKILL.cruise, SKILL.ace, 0.82][i % 3], node: 0, colour: i, callsign: CALLSIGNS[i % CALLSIGNS.length],
  }));
  // In-race ceremony applies to every driver. Timing is provisional; rarity and
  // presentation remain a later play-balancing task.
  // Furball sessions drive like free drive (no gates, no lap) inside the race's own rules.
  if (roam || furball) for (const x of [player, ...rivals.map(r => r.session)]) x.roam = true;
  const pickupCourse = furball || roam ? { ...course, pickupItems: null } : course;
  // The player gets a personal claim cooldown so a tightly packed box cannot
  // starve them. Kid rivals do too; Big Kid rivals share a slower crate cadence
  // to keep weapon pressure readable and preserve overtaking counterplay.
  const personalPickups = opponents > 0 && !roam;
  const race = { course, mode, roam, player, rivals, line, features, alts: altRoutes(course, line), pickups: createPickups(pickupCourse, 1, { perCar: personalPickups, rivalPersonal: mode === 'kid', rivalRespawn: mode === 'kid' ? 4 : 8, hitGrace: mode === 'bigKid' ? 1.1 : 0 }), events: [], clock: 0, t: 0, pace: 6, drivingTime: 0, finishOrder: [], retreat: { at: furball ? Infinity : 18, length: 5 } };
  race.pickups.superFor = mode === 'kid' ? 'player' : 'all';
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
  return s.finished ? s.laps * cps.length + 1 : (s.lap - 1) * cps.length + g + Math.max(0, 1 - left / seg);
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
  else if (s !== race.player) {
    vmax *= packFactor(race, rival);
    // Learn a moving player's pace, so a novice can race without mastering the drift.
    // Only leaders ease off; there is no free speed or teleport for trailing opponents.
    if (race.drivingTime > 2 && raceDistance(s) - raceDistance(race.player) > 5)
      vmax = Math.min(vmax, Math.max(2.5, race.pace) * 1.04);
    if (kidFinale(race) && raceDistance(s) > raceDistance(race.player)) vmax = Math.min(vmax, Math.max(2.5, race.pace) * 0.93);
  }
  const steer = Math.max(-1, Math.min(1, err * 2.2));
  if (vmax < 0.5 || retreatActive(race)) return { throttle: 0, brake: true, steer };
  // In the kid finale the cap must hold: 0.2 throttle within 1.5 m/s coasts straight past it.
  if (s !== race.player && kidFinale(race)) return { throttle: r.forwardSpeed < vmax ? 1 : r.forwardSpeed > vmax + .3 ? -0.5 : 0, steer };
  return { throttle: r.forwardSpeed < vmax ? 1 : r.forwardSpeed > vmax + 1.5 ? -0.6 : 0.2, steer };
}

// Pack racing (owner, 2026-10-22: "you need to have people driving around you ... in any mode").
// Each rival holds a slot near the player (just ahead, alongside, just behind) in lap progress:
// ahead of its slot it eases off, behind it pushes, so the race happens around you, never over
// the horizon and never parked. Both modes contest the finish; Kid changes handling,
// not whether the opponents deliberately surrender.
// Distances, not checkpoint counts: a gate may be 4 m or 400 m away.
const courseLengths=new WeakMap();
export function raceDistance(s) {
 const cps=s.course.checkpoints;let prefix=courseLengths.get(cps);
 if(!prefix){prefix=[0];for(let i=1;i<cps.length;i++)prefix[i]=prefix[i-1]+Math.hypot(cps[i][0]-cps[i-1][0],cps[i][1]-cps[i-1][1]);courseLengths.set(cps,prefix);}
 const length=prefix.at(-1),before=prefix[Math.max(0,Math.min(s.gate-1,cps.length-1))];
 if(s.finished)return s.laps*length;
 if(!s.gate)return (s.lap-1)*length-Math.hypot(cps[0][0]-s.car.pos[0],cps[0][1]-s.car.pos[2]);
 const i=Math.min(s.gate,cps.length-1),a=cps[i-1],b=cps[i],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);
 const along=d?Math.max(0,Math.min(d,((s.car.pos[0]-a[0])*dx+(s.car.pos[2]-a[1])*dz)/d)):0;
 return (s.lap-1)*length+before+along;
}
// Keep the pack contestable in physical space as well as lap progress. A trailing rival may
// spend a few seconds above its normal pace to rejoin; a leader still gets room to pull away.
// Kid mode's final act (owner: "kid mode should mean you usually win after a long battle"): over the
// last KID_HIT.finale of the race nobody can hit the player, and rivals ahead ease to just under the
// player's pace, so a kid still in the fight catches them. Rivals behind keep racing.
export function kidFinale(race) {
  if (race.mode !== 'kid' || race.roam || race.furball || !race.player.running) return false;
  const cps = race.course.checkpoints, laps = race.player.laps ?? race.course.laps ?? 1;
  if (race.courseLength === undefined) { let length = 0; for (let i = 1; i < cps.length; i++) length += Math.hypot(cps[i][0] - cps[i - 1][0], cps[i][1] - cps[i - 1][1]); race.courseLength = length; }
  return race.courseLength > 0 && raceDistance(race.player) > laps * race.courseLength * (1 - KID_HIT.finale);
}
// Kid-mode exposure: the player can be hit once the race has settled, with a breather after each hit,
// and is never kicked while already in last place.
export const KID_HIT = { after: 8, gap: 16, finale: .3 };
export function kidOpen(race) {
  if (race.mode !== 'kid' || race.roam || race.furball) return race.mode !== 'kid';
  if (!race.player.running || race.player.finished || race.clock < KID_HIT.after || kidFinale(race)) return false;
  if (race.clock - (race.playerHitAt ?? -Infinity) < KID_HIT.gap) return false;
  return race.rivals.length > 0 && placeOf(race, race.player) < race.rivals.length + 1;
}
export const PACK = { slots: [3,0,-3], floor:.16, ceiling:1.18, ease:.06, push:.04 };
export function packFactor(race,rival) {
 const gap=raceDistance(rival.session)-raceDistance(race.player),d=gap-PACK.slots[rival.colour%PACK.slots.length];
 // Before a player moves, traffic still completes its race. Once driving, a dropped turn
 // opens a recoverable gap instead of letting the pack disappear a lap ahead.
 const floor=race.drivingTime>2?PACK.floor:.45;
 const ceiling = PACK.ceiling;
 const push = race.mode === 'kid' ? 0.02 : PACK.push;
 let k=d>0?Math.max(floor,1-d*PACK.ease):Math.min(ceiling,1-d*push);
 return k;
}

// Effects (zoom, oil, a balloon spin) ride on the step input; a spinning car's controls are dead.
function withEffects(race, car, input) {
  const m = modifiers(race.pickups, car);
  return m.spinning ? { boost: 1, gripScale: 0.5 } : { ...input, boost: m.boost, gripScale: m.gripScale };
}

// Racing-line node of each gate, searched forward in route order so a gate that shares its spot
// with an earlier one (an out-and-back) maps to the later pass.
function gateNodes(race) {
  if (race.gateNodes) return race.gateNodes;
  const line = race.line, out = [];let from = 0;
  for (const c of race.course.checkpoints) {
    let best = from;for (let k = from; k < line.length; k++) if (Math.hypot(line[k][0] - c[0], line[k][1] - c[1]) < Math.hypot(line[best][0] - c[0], line[best][1] - c[1])) best = k;
    // Only look as far as the first local minimum within reach, so a later pass is not taken early.
    for (let k = from; k < line.length; k++) { const d = Math.hypot(line[k][0] - c[0], line[k][1] - c[1]); if (d < (c[3] ?? 2.4) + 2) { best = k; while (k + 1 < line.length && Math.hypot(line[k + 1][0] - c[0], line[k + 1][1] - c[1]) <= Math.hypot(line[k][0] - c[0], line[k][1] - c[1])) best = ++k; break; } }
    out.push(best);from = best;
  }
  return race.gateNodes = out;
}

export function stepRace(race, playerInput, dt = 1 / 120) {
  const pk = race.pickups, fb = race.furball;
  if (fb?.over) return;
  // Shot-down Furball cars leave the fight: no physics, no bumping, no targeting.
  const cars = [race.player.car, ...race.rivals.map(r => r.session.car)].filter(c => !fb?.out.has(c));
  if (race.player.running) race.clock += dt;
  race.t += dt;
  if (!race.roam && !fb && Math.abs(playerInput.throttle || 0)>.1 && race.player.car.forwardSpeed>1) {
    race.drivingTime += dt;
    race.pace += (race.player.car.forwardSpeed-race.pace)*(1-Math.exp(-dt/6));
  }
  if (playerInput.fire) use(pk, race.player.car);
  // Race order for the Pitbull (blue shell): leader first. Free drive has no order.
  pk.order = race.roam || fb ? null : [race.player, ...race.rivals.map(r => r.session)].sort((a, b) => placeOf(race, a) - placeOf(race, b)).map(s => s.car);
  stepSession(race.player, withEffects(race, race.player.car, retreatActive(race)?{throttle:0,brake:true,steer:0}:playerInput), dt);
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
    // Kid mode: the player can be hit, Mario Kart style (owner, 2026-10-29: "you get hit a few
    // times, find yourself at the back, then battle to the front"), but only through kidOpen():
    // never in the opening seconds, at most once per KID_HIT.gap, and never while already last.
    // Furball keeps its own rules (furball.mjs).
    const targets = race.mode === 'kid' && !fb && !kidOpen(race) ? cars.slice(1) : cars;
    if ((!fb || mayFire(race, rival)) && rivalWants(pk, rival.session.car, targets)) use(pk, rival.session.car);
    const input = fb ? furballInput(race, rival, () => driveInput(race, rival)) : driveInput(race, rival);
    stepSession(rival.session, withEffects(race, rival.session.car, input), dt);
    // A rival that clips a steerpoint (airborne over it, or wide) is credited once it is clearly on
    // its way to the next one; otherwise it races on beside you scored as gates behind and never
    // finishes. Rivals only: the player's gates stay strict.
    // The rival must also have driven past that gate's point on the racing line: on a route that
    // doubles back (Base Traffic's out-and-back) the next gate can sit beside an earlier one, and
    // proximity alone credited the whole 474 m U-turn leg, leaving the pack crawling under the
    // leader brake while the player won alone.
    { const rs = rival.session, cps = race.course.checkpoints, g = rs.gate;
      if (!rs.roam && !rs.finished && g + 1 < cps.length) {
        const a = cps[g], b = cps[g + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const reached = !race.line.length || rival.alt || (rival.node % race.line.length) >= gateNodes(race)[g] - 2;
        if (reached && Math.hypot(b[0] - rs.car.pos[0], b[1] - rs.car.pos[2]) < seg * 0.5) rs.gate++;
      } }
    // A rival on its roof gets the same R a kid would press.
    if (rotate(rival.session.car.q, [0, 1, 0])[1] < 0.2 && rival.session.car.speed < 0.5) { rival.stuck = (rival.stuck || 0) + dt; if (rival.stuck > 1.5) { rival.stuck = 0; recover(rival.session); } }
  }
  for (const s of [race.player, ...race.rivals.map(r => r.session)])
    if (s.finished && !race.finishOrder.includes(s)) race.finishOrder.push(s);
  // Boost pads: a short Afterburner for whoever crosses one (rivals too).
  if (race.features) for (const c of cars) if (padHit(race.features, c)) boostCar(pk, c, 0.9);
  bump(cars);
  const events = stepPickups(pk, cars, race.course.world, dt, fb ? fb.out : race.mode === 'kid' && !kidOpen(race) ? race.player.car : null);
  if (events.some(e => e.car === race.player.car)) race.playerHitAt = race.clock;
  if (fb) events.push(...stepFurball(race, events, dt));
  race.events.push(...events);
}

// Car-to-car: body spheres against body spheres, equal-mass impulses with a little bounce.
const bodySpheres = car => { const r = car.params.size[0] / 2, z = car.params.size[2] / 2 - r; return { r, at: [[0, .02, -z], [0, .02, 0], [0, .02, z]] }; };
export function bump(cars) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (len(sub(a.pos, b.pos)) > 0.8) continue;
    const ba = bodySpheres(a), bb = bodySpheres(b), reach = ba.r + bb.r;
    for (const pa of ba.at) for (const pb of bb.at) {
      const ca = add(a.pos, rotate(a.q, pa)), cb = add(b.pos, rotate(b.q, pb)), d = sub(ca, cb), dl = len(d);
      if (dl >= reach || dl < 1e-6) continue;
      const n = scale(d, 1 / dl), depth = reach - dl;
      a.pos = add(a.pos, scale(n, depth / 2)); b.pos = sub(b.pos, scale(n, depth / 2));
      const vn = dot(sub(a.vel, b.vel), n);
      if (vn < 0) { const j = -(1 + 0.3) * vn / 2; a.vel = add(a.vel, scale(n, j)); b.vel = sub(b.vel, scale(n, j)); a.impact = Math.max(a.impact, -vn); b.impact = Math.max(b.impact, -vn); }
    }
  }
}
