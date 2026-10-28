// Authored skate motion: the rail owns position until an exit returns it to the rigid body.
import { add, sub, scale, dot, norm, rotate, quatAxisAngle, quatMul } from './math.mjs';
import { carForward, carUp, rideHeight } from './car.mjs';
import { createDrift } from './drift.mjs';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const horizontal = v => norm([v[0], 0, v[2]]);
const grindHeight = car => Math.max(...car.params.hull.map(s => s.r - s.at[1]));

export function createBalance() { return { value: 0, time: 0 }; }
export function stepBalance(b, steer, dt, mode = 'kid') {
  b.time += dt;
  const kid = mode === 'kid', drift = (kid ? .035 : .16) + b.time * (kid ? .008 : .045);
  b.value += (drift * (1 + Math.abs(b.value)) - (steer || 0) * (kid ? .7 : 1.1)) * dt;
  return Math.abs(b.value) < 1;
}

const installed = new WeakMap();
export function installRailCollisions(world, park, toWorld) {
  let parks = installed.get(world); if (!parks) installed.set(world, parks = new Set());
  if (parks.has(park)) return; parks.add(park);
  // The existing drawn handrail tubes had no collision. Give their tops a narrow riding cap.
  for (const r of park.rails ?? []) if (r.kind === 'rail' || r.kind === 'coping') for (let i = 1; i < r.pts.length; i++) {
    const a = toWorld(r.pts[i - 1]), b = toWorld(r.pts[i]), d = norm(sub(b, a)), side = scale(norm([d[2], 0, -d[0]]), .035);
    world.addQuad(sub(a, side), sub(b, side), add(b, side), add(a, side), 'concrete');
  }
}

export function setSkateRails(s, park, toWorld) {
  if (park) installRailCollisions(s.course.world, park, toWorld);
  s.skateRide = park ? { park, rails: (park.rails ?? []).map(r => {
    const pts = r.pts.map(toWorld), segments = []; let length = 0;
    for (let i = 1; i < pts.length; i++) {
      const delta = sub(pts[i], pts[i - 1]), size = Math.hypot(...delta);
      if (size < .001) continue;
      segments.push({ a: pts[i - 1], b: pts[i], dir: scale(delta, 1 / size), start: length, length: size }); length += size;
    }
    return { ...r, segments, length };
  }), active: null, manual: null, cooldown: 0, held: false, serial: 0, placement: s.car.placement } : null;
}

// stepSkate's public frame is affine; invert its horizontal basis once per run.
export function bindSkateRails(s, park, frame) {
  if (!s.assist || s.skateRide?.park === park) return;
  const o = frame([0, 0, 0]), x = sub(frame([1, 0, 0]), o), z = sub(frame([0, 0, 1]), o), det = x[0] * z[1] - x[1] * z[0];
  if (Math.abs(det) < 1e-8) return;
  setSkateRails(s, park, p => {
    const u = p[0] - o[0], v = p[1] - o[1];
    return [(u * z[1] - v * z[0]) / det, p[2] - o[2], (v * x[0] - u * x[1]) / det];
  });
}

function railPoint(r, distance, direction) {
  const seg = (direction > 0 ? r.segments.find(s => distance < s.start + s.length) : [...r.segments].reverse().find(s => distance > s.start)) ?? (direction > 0 ? r.segments.at(-1) : r.segments[0]);
  return { point: add(seg.a, scale(seg.dir, clamp(distance - seg.start, 0, seg.length))), tangent: scale(seg.dir, direction) };
}
function attitude(car, tangent, sideways = false, pitch = 0) {
  const yaw = Math.atan2(tangent[0], -tangent[2]) + (sideways ? Math.PI / 2 : 0);
  const slope = Math.atan2(tangent[1], Math.hypot(tangent[0], tangent[2]));
  car.q = quatMul(quatAxisAngle([0, 1, 0], -yaw), quatAxisAngle([1, 0, 0], slope + pitch)); car.ang = [0, 0, 0];
}
function clearContacts(car) {
  car.contacts = 0; car.grounded = false; car.impact = car.wallImpact = 0;
  for (const w of car.wheels) { w.contact = false; w.compression = 0; w.surface = null; w.contactNormal = null; }
}
function inward(world, point, tangent) {
  const side = norm([tangent[2], 0, -tangent[0]]);
  const height = sign => { const p = add(point, scale(side, sign * .65)); return world.raycast(add(p, [0, .3, 0]), [0, -1, 0], 10)?.point[1] ?? point[1] - 10; };
  return scale(side, height(1) < height(-1) ? 1 : -1);
}
function leave(s, reason, hop) {
  const state = s.skateRide, g = state.active, car = s.car;
  const { point, tangent } = railPoint(g.rail, g.distance, g.direction);
  let side = [0, 0, 0];
  if (g.rail.kind === 'coping') side = inward(s.course.world, point, tangent);
  else if (reason !== 'end') side = scale(norm([tangent[2], 0, -tangent[0]]), Math.sign(g.balance.value) || 1);
  car.pos = add(add(point, [0, rideHeight(car.params) + .03, 0]), scale(side, .18));
  car.vel = add(scale(tangent, g.speed), add(scale(side, hop ? 1.3 : .9), [0, hop ? 2.6 : .65, 0]));
  if (reason === 'brake') car.vel = add(scale(car.vel, .45), [0, .3, 0]);
  attitude(car, Math.hypot(side[0], side[2]) && g.rail.kind === 'coping' ? norm(car.vel) : tangent);
  clearContacts(car); state.active = null; state.cooldown = .55;
  s.assist.quarter = {}; s.assist.drift = { ...createDrift(), held: state.held };
}
function capture(s, raw) {
  const state = s.skateRide, c = s.car;
  if (state.cooldown > 0 || raw.brake || c.speed < .7 || carUp(c)[1] < .65) return;
  const forward = horizontal(carForward(c)), travel = horizontal(c.vel); let best = null;
  for (const r of state.rails) for (const seg of r.segments) {
    const d = sub(seg.b, seg.a), h2 = d[0] ** 2 + d[2] ** 2;
    if (h2 < .001) continue;
    const rel = sub(c.pos, seg.a), t = (rel[0] * d[0] + rel[2] * d[2]) / h2;
    if (t < 0 || t > 1) continue;
    const point = add(seg.a, scale(d, t)), distance = Math.hypot(c.pos[0] - point[0], c.pos[2] - point[2]);
    const clearance = c.pos[1] - grindHeight(c) - point[1];
    if (distance > .4 || Math.abs(clearance) > .3 || (c.contacts > 0 && clearance < -.12)) continue;
    // Freestanding tubes catch a landing from above, never a car passing underneath downhill.
    if (r.kind === 'rail' && clearance < -.04) continue;
    const tangent = horizontal(seg.dir), alignment = Math.abs(dot(forward, tangent)), moving = dot(travel, tangent);
    const sideways = alignment < Math.cos(Math.PI / 4) && c.contacts === 0 && raw.drift;
    if (Math.abs(moving) < Math.cos(40 * Math.PI / 180) || (alignment < Math.cos(40 * Math.PI / 180) && !sideways)) continue;
    const speed = Math.abs(dot(c.vel, seg.dir)), direction = moving < 0 ? -1 : 1;
    // Crossing a lip upwards belongs to the air/transfer, not the rail.
    if (c.vel[1] - seg.dir[1] * direction * speed > .5) continue;
    if (!best || distance < best.distance) best = { rail: r, distance, along: seg.start + t * seg.length, speed, direction, sideways };
  }
  if (!best) return;
  const name = best.sideways ? 'Boardslide' : raw.steer < -.3 ? 'Nosegrind' : raw.steer > .3 ? '5-0' : '50-50';
  state.active = { rail: best.rail, distance: best.along, speed: best.speed, direction: best.direction, sideways: best.sideways, name, balance: createBalance(), time: 0, id: ++state.serial };
  state.manual = null; s.assist.quarter = {}; s.assist.drift = { ...createDrift(), held: state.held };
}

export function stepSkateRide(s, raw, dt) {
  const state = s.skateRide; if (!state) return false;
  const car = s.car, held = !!(raw.hop || raw.drift), hop = held && !state.held;
  state.held = held; if (!raw.drift) state.manualBlocked = false; state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.placement !== car.placement) {
    state.placement = car.placement; state.active = state.manual = null; state.cooldown = 0;
  }
  if (!state.active) capture(s, raw);
  const g = state.active;
  if (g) {
    if (raw.brake || (hop && g.time > 0)) { leave(s, raw.brake ? 'brake' : 'hop', !raw.brake); return true; }
    g.time += dt;
    if (!stepBalance(g.balance, raw.steer, dt, s.mode)) { leave(s, 'balance', false); return true; }
    const { tangent } = railPoint(g.rail, g.distance, g.direction);
    g.speed = Math.max(0, g.speed + (-.18 - 9.81 * tangent[1]) * dt);
    g.distance += g.direction * g.speed * dt;
    if (g.distance <= 0 || g.distance >= g.rail.length || g.speed < .35) {
      g.distance = clamp(g.distance, 0, g.rail.length); leave(s, 'end', false); return true;
    }
    const next = railPoint(g.rail, g.distance, g.direction);
    car.pos = add(next.point, [0, grindHeight(car), 0]); car.vel = scale(next.tangent, g.speed);
    attitude(car, next.tangent, g.sideways); clearContacts(car); car.speed = car.forwardSpeed = g.speed;
    for (const w of car.wheels) w.spin += g.speed / car.params.wheelRadius * dt;
    return true;
  }
  // The held grab becomes a rear-wheel manual on level ground; release rolls onto all four.
  const ground = s.course.world.raycast(add(car.pos, [0, .2, 0]), [0, -1, 0], .65);
  const flat = ground?.normal[1] > .98 && Math.abs(car.pos[1] - ground.point[1] - rideHeight(car.params)) < .18;
  if (!state.manual && !state.manualBlocked && raw.drift && !raw.brake && flat && car.contacts >= 2 && car.speed > 1 && carUp(car)[1] > .9) state.manual = { id: ++state.serial, balance: createBalance(), time: 0 };
  const m = state.manual;
  if (!m) return false;
  if (!raw.drift || raw.brake || raw.hop || !flat || car.speed < .6 || !stepBalance(m.balance, raw.steer, dt, s.mode)) {
    state.manual = null; state.manualBlocked = true; state.cooldown = Math.max(state.cooldown, .2);
    s.assist.drift = { ...createDrift(), held: state.held }; return false;
  }
  m.time += dt;
  const forward = horizontal(carForward(car)), speed = clamp(car.speed + ((raw.throttle || 0) * 5 * (1 - car.speed / car.params.topSpeed) - .5) * dt, 0, car.params.topSpeed);
  const next = add(car.pos, scale(forward, speed * dt)), support = s.course.world.raycast(add(next, [0, .25, 0]), [0, -1, 0], .75);
  if (!support || support.normal[1] < .98 || Math.abs(support.point[1] - ground.point[1]) > .06) { state.manual = null; return false; }
  const position = [next[0], support.point[1] + rideHeight(car.params) + .035, next[2]];
  // The manual owns the wheelie, but solid walls still belong to the collision solver.
  if (car.params.hull.some(h => s.course.world.sphereContacts(add(position, rotate(car.q, h.at)), h.r).some(c => Math.abs(c.normal[1]) < .7))) {
    state.manual = null; state.manualBlocked = true; return false;
  }
  car.pos = position; car.vel = scale(forward, speed);
  attitude(car, forward, false, .22); clearContacts(car); car.speed = car.forwardSpeed = speed; car.contacts = 2; car.grounded = true;
  for (let i = 0; i < car.wheels.length; i++) { const w = car.wheels[i]; w.contact = i >= 2; w.surface = support.surface; w.contactNormal = support.normal; w.spin += speed / car.params.wheelRadius * dt; }
  s.assist.quarter = {}; return true;
}
