// Free-drive flight. Never in races. Two layers:
// - Arcade (owner, 6 Nov 2026), what the pad drives: stick up climbs (invert is a pause-menu
//   option), stick left/right banks and turns together, hands off levels and holds altitude,
//   and a floor pulls up before the ground. A takes off or flies up; B lands. No stall, no spin.
// - The jet integrator (pitch/roll rates) stays for the older tests and scripted lessons.
//   Positive pitch is nose up in both. Wheels are ignored while airborne; the world still stops it.
import {
  add,
  sub,
  scale,
  madd,
  dot,
  len,
  norm,
  rotate,
  quatMul,
  quatAxisAngle,
  quatNorm,
  yawOf
} from './math.mjs';

export const FLIGHT = Object.freeze({
  // Owner, 31 Oct: "make it faster". Speeds roughly doubled; the world streams fine at burner.
  takeoff: 5,
  climbFor: 0.7,
  minSpeed: 12,
  maxSpeed: 32,
  burner: 42,
  startPower: 0.5,
  powerRate: 0.6,
  accel: 1.6,
  diveGain: 6,
  pitchRate: 1.6,
  rollRate: 2.8,
  yawRate: 0.7,
  bankTurn: 1.1,
  levelRoll: 0.9,
  // Owner, 31 Oct: a much faster parachute, and the car fires cold-gas retro thrusters at the last
  // second for a soft landing (the Roadster demo). The chute brings it down at chuteSink; the
  // retros light when the height left is what it takes to brake to `retroLand` at `retroAccel`.
  chuteSink: 6,
  chuteDrag: 1.6,
  chuteLevel: 3,
  chuteTurn: 0.6,
  chuteDrift: 3,
  ceiling: 140,
  land: 0.32,
  burnerBoost: 1.8,
  retroAccel: 14,
  retroLand: 0.5,
  retroMargin: 0.35,
  // Kid mode flies the real controls with an Auto-GCAS, like the real F-16's: if the path ahead
  // meets the ground, it rolls the wings level and pulls up until it's safe, then hands back.
  gcas: Object.freeze({look: [0.35, 0.8, 1.4], floor: 4, hold: 0.5, roll: 4}),
  // A winged mount (the quetzalcoatlus) flies close to the ground on purpose (owner, 31 Oct: "some
  // degree of assist around ground avoidance but levelling is no fun"): the save comes late and
  // small, pulls through the bank you're in instead of rolling you level (unless you're nearly
  // upside down), and hands-off the wings stay where you put them.
  proximity: Object.freeze({look: [0.25, 0.5, 0.8], floor: 1.2, hold: 0.25, maxBank: 1.05}),
  ollie: 3.2,
  hop: 2.4, // Space: the skateboard's ollie and the car's hop, m/s up (main.js)
  // The easy flyer (kid mode): steer banks and turns, up climbs, down descends, speed looks after
  // itself, and it holds a safe height over the ground unless you are coming down to land.
  easy: Object.freeze({
    cruise: 24,
    bank: 0.45,
    bankRate: 4,
    turn: 2,
    climb: 0.35,
    pitchRate: 3,
    takeoffPitch: 0.3,
    floor: 3,
    lookAhead: 0.7
  }),
  // The pad flyer. Bank is capped so a full stick cannot flip or spin the toy; speed never
  // drops through `slow`, so it cannot stall. `floor` is the height the pull-up defends.
  arcade: Object.freeze({
    cruise: 24,
    slow: 12,
    boost: 42,
    bank: 0.62,
    bankRate: 5,
    turn: 2.1,
    yawRate: 0.85,
    climb: 0.42,
    pitchRate: 3.2,
    levelRate: 4,
    takeoffPitch: 0.38,
    floor: 4,
    lookAhead: 0.85,
    hold: 2.4,
    trickTime: 0.95
  })
});

export function createFlight() {
  return {mode: null, speed: 0, power: FLIGHT.startPower, climb: 0, flights: 0, chutes: 0, landings: 0};
}

const levelQuat = car => quatAxisAngle([0, 1, 0], -yawOf(car.q));
const groundBelow = (world, pos, reach = 200) =>
  world?.raycast?.([pos[0], pos[1] + 0.05, pos[2]], [0, -1, 0], reach) ?? null;
// Ground height at (x, z), cast from well above so rising ground ahead is found too.
const groundAt = (world, x, y, z) => {
  const h = world?.raycast?.([x, y + 60, z], [0, -1, 0], 320);
  return h ? y + 60 - h.dist : null;
};

/**
 * Left stick to a climb/bank command. `y` is positive when the stick is pushed up.
 * Default is non-inverted: up climbs (positive pitch). `invert` flips pitch only.
 */
export function stickAttitude(stick = {}, {invert = false} = {}) {
  const x = Number.isFinite(stick.x) ? Math.max(-1, Math.min(1, stick.x)) : 0,
    y = Number.isFinite(stick.y) ? Math.max(-1, Math.min(1, stick.y)) : 0;
  return {pitch: invert ? -y : y, roll: x};
}

/**
 * One-way take-off. From the ground or the chute this enters fly and climbs.
 * Already flying, it just flies up (a climb pulse) and does not open the chute.
 */
export function takeoffFlight(f, car, {roam = true} = {}) {
  if (!roam) return f.mode;
  if (f.mode !== 'fly') {
    if (!f.mode) f.flights = (f.flights ?? 0) + 1;
    f.mode = 'fly';
    f.speed = Math.max(f.speed || 0, FLIGHT.minSpeed + 2, car.forwardSpeed ?? 0);
    f.heading = null;
    f.trick = null;
    f.retro = false;
    f.holdY = null;
    car.vel = add(car.vel, [0, FLIGHT.takeoff, 0]);
  }
  f.climb = Math.max(f.climb || 0, FLIGHT.climbFor);
  car.ang = [0, 0, 0];
  return 'fly';
}

/** One-way landing. Flying opens the chute; the chute stays in the landing until touchdown. */
export function landFlight(f, car, {roam = true} = {}) {
  void car;
  if (!roam || f.mode !== 'fly') return f.mode;
  f.mode = 'chute';
  f.chutes = (f.chutes ?? 0) + 1;
  f.climb = 0;
  f.trick = null;
  f.holdY = null;
  return 'chute';
}

/** Enter: ground → flying → parachute. Only in free drive. Returns the new mode. */
export function toggleFlight(f, car, {roam = true} = {}) {
  if (!roam) return f.mode;
  if (!f.mode) {
    f.mode = 'fly';
    f.flights++;
    f.speed = Math.max(FLIGHT.minSpeed + 2, car.forwardSpeed ?? 0);
    f.climb = FLIGHT.climbFor;
    f.heading = null;
    car.vel = add(car.vel, [0, FLIGHT.takeoff, 0]);
    car.ang = [0, 0, 0];
  } else if (f.mode === 'fly') {
    f.mode = 'chute';
    f.chutes++;
  }
  return f.mode;
}

function touchdown(f, car) {
  f.mode = null;
  f.landings = (f.landings ?? 0) + 1;
  f.speed = 0;
  car.q = levelQuat(car);
  car.ang = [0, 0, 0];
  car.vel = [car.vel[0] * 0.7, Math.max(-1, car.vel[1]), car.vel[2] * 0.7];
}

// Arcade: heading, a capped bank and a capped pitch. Released sticks level the wings, zero
// the pitch and hold height. The floor looks here and ahead and pulls up before the ground.
// A barrel roll or a loop is a timed pose that ends level; it cannot be held inverted.
function arcadeFly(f, car, ctl, world, dt) {
  const A = FLIGHT.arcade;
  if (f.heading == null) {
    f.heading = -yawOf(car.q);
    f.pitch = 0;
    f.bank = 0;
  }
  const yawIn = Math.max(-1, Math.min(1, ctl.yaw || 0));
  let pitchIn = Math.max(-1, Math.min(1, ctl.pitch || 0)),
    rollIn = Math.max(-1, Math.min(1, ctl.roll || 0));
  if (ctl.flyUp) pitchIn = Math.max(pitchIn, 1);
  if (ctl.trick && !f.trick)
    f.trick = {kind: ctl.trick === 'roll' ? 'roll' : 'loop', t: 0, dir: rollIn < -0.2 ? -1 : 1};
  const throttle = Math.max(-1, Math.min(1, ctl.power || 0)),
    target =
      ctl.brake || throttle < -0.15
        ? A.slow
        : ctl.burner
          ? A.boost
          : throttle > 0.15
            ? A.cruise + (A.boost - A.cruise) * Math.min(1, throttle)
            : A.cruise;
  f.speed += (target - f.speed) * FLIGHT.accel * dt;
  f.speed = Math.max(A.slow, Math.min(A.boost, f.speed));
  f.power = Math.max(0, Math.min(1, (f.speed - A.slow) / (A.boost - A.slow)));
  if (f.trick) {
    f.trick.t += dt;
    const u = f.trick.t / A.trickTime;
    if (u >= 1) {
      f.trick = null;
      f.bank = Math.atan2(Math.sin(f.bank), Math.cos(f.bank));
      f.pitch = Math.atan2(Math.sin(f.pitch), Math.cos(f.pitch));
    } else if (f.trick.kind === 'roll') f.bank = f.trick.dir * u * Math.PI * 2;
    else f.pitch = Math.sin(u * Math.PI * 2) * 1.05;
  } else {
    const handsOff = Math.abs(pitchIn) < 0.08 && Math.abs(rollIn) < 0.08,
      wantBank = rollIn * A.bank,
      wantPitch = pitchIn * A.climb;
    f.bank += (wantBank - f.bank) * Math.min(1, A.bankRate * dt);
    f.pitch += (wantPitch - f.pitch) * Math.min(1, (handsOff ? A.levelRate : A.pitchRate) * dt);
  }
  f.heading -= yawIn * A.yawRate * dt;
  f.heading -= Math.sin(f.bank) * A.turn * dt;
  f.climb = Math.max(0, (f.climb || 0) - dt);
  if (f.climb > 0) f.pitch = Math.max(f.pitch, A.takeoffPitch * Math.min(1, f.climb / FLIGHT.climbFor));
  car.q = quatNorm(
    quatMul(
      quatMul(quatAxisAngle([0, 1, 0], f.heading), quatAxisAngle([1, 0, 0], f.pitch)),
      quatAxisAngle([0, 0, 1], -f.bank)
    )
  );
  const h = [-Math.sin(f.heading), -Math.cos(f.heading)],
    across = Math.cos(Math.max(-1.2, Math.min(1.2, f.pitch))) * f.speed,
    handsOff = !f.trick && Math.abs(pitchIn) < 0.08 && Math.abs(rollIn) < 0.08 && !(f.climb > 0);
  let vy = Math.sin(Math.max(-1.2, Math.min(1.2, f.pitch))) * f.speed;
  if (handsOff) {
    if (f.holdY == null) f.holdY = car.pos[1];
    vy += (f.holdY - car.pos[1]) * A.hold;
  } else if (!f.trick) f.holdY = null;
  const ahead = A.lookAhead * f.speed,
    g = Math.max(
      groundAt(world, car.pos[0], car.pos[1], car.pos[2]) ?? -1e9,
      groundAt(world, car.pos[0] + h[0] * ahead, car.pos[1], car.pos[2] + h[1] * ahead) ?? -1e9
    );
  if (g > -1e9) {
    const need = (g + A.floor - car.pos[1]) * A.hold;
    if (need > 0) {
      vy = Math.max(vy, Math.min(10, need));
      if (!f.trick) f.pitch = Math.max(f.pitch, Math.min(A.climb, 0.3));
      f.holdY = null;
    }
  }
  vy = Math.max(-12, Math.min(12, vy));
  car.vel = [h[0] * across, vy, h[1] * across];
}

/**
 * Steps the car while it flies or floats. Returns false when the car is on its wheels, so the
 * caller runs the normal car step. `ctl` = { pitch, roll, yaw, power, burner } in -1..1; the easy
 * flyer takes { easy: true, steer, climb, burner }; the pad flyer takes { arcade: true } plus the
 * stickAttitude pitch/roll (positive pitch climbs).
 */
export function stepFlight(f, car, ctl = {}, world, dt = 1 / 120) {
  if (!f.mode) return false;
  const fwd = rotate(car.q, [0, 0, -1]),
    right = rotate(car.q, [1, 0, 0]);
  if (f.mode === 'fly' && ctl.arcade) arcadeFly(f, car, ctl, world, dt);
  else if (f.mode === 'fly' && ctl.easy) {
    const E = FLIGHT.easy;
    if (f.heading == null) {
      f.heading = -yawOf(car.q);
      f.pitch = 0;
      f.bank = 0;
    }
    f.speed += ((ctl.burner ? FLIGHT.burner : E.cruise) - f.speed) * FLIGHT.accel * dt;
    f.bank += ((ctl.steer || 0) * E.bank - f.bank) * Math.min(1, E.bankRate * dt);
    f.heading -= f.bank * E.turn * dt;
    f.climb = Math.max(0, f.climb - dt);
    const wantPitch = f.climb > 0 ? E.takeoffPitch : (ctl.climb || 0) * E.climb;
    f.pitch += (wantPitch - f.pitch) * Math.min(1, E.pitchRate * dt);
    car.q = quatNorm(
      quatMul(
        quatMul(quatAxisAngle([0, 1, 0], f.heading), quatAxisAngle([1, 0, 0], f.pitch)),
        quatAxisAngle([0, 0, 1], -f.bank)
      )
    );
    const h = [-Math.sin(f.heading), -Math.cos(f.heading)],
      across = Math.cos(f.pitch) * f.speed;
    let vy = Math.sin(f.pitch) * f.speed;
    // Unless coming down on purpose, ride over the ground here and just ahead with room to spare.
    if (!(ctl.climb < 0)) {
      const ahead = E.lookAhead * f.speed,
        g = Math.max(
          groundAt(world, car.pos[0], car.pos[1], car.pos[2]) ?? -1e9,
          groundAt(world, car.pos[0] + h[0] * ahead, car.pos[1], car.pos[2] + h[1] * ahead) ?? -1e9
        );
      if (g > -1e9) vy = Math.max(vy, (g + E.floor - car.pos[1]) * 2);
    }
    car.vel = [h[0] * across, vy, h[1] * across];
  } else if (f.mode === 'fly') {
    if (ctl.assist)
      ctl = ctl.proximity ? proximityAssist(f, car, ctl, world, dt) : gcas(f, car, ctl, world, dt);
    f.power = Math.max(0, Math.min(1, f.power + (ctl.power || 0) * FLIGHT.powerRate * dt));
    const target = ctl.burner
      ? FLIGHT.burner
      : FLIGHT.minSpeed + f.power * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
    // Diving speeds the car up and climbing bleeds speed, never below the minimum.
    f.speed += ((target - f.speed) * FLIGHT.accel - fwd[1] * FLIGHT.diveGain) * dt;
    f.speed = Math.max(FLIGHT.minSpeed, Math.min(FLIGHT.burner, f.speed));
    // Body-frame rates: pull (↓) raises the nose, roll right drops the right wing, rudder yaws.
    const pitch = (ctl.pitch || 0) * FLIGHT.pitchRate * dt,
      roll = (ctl.roll || 0) * FLIGHT.rollRate * dt,
      yaw = (ctl.yaw || 0) * FLIGHT.yawRate * dt;
    let q = quatMul(car.q, quatAxisAngle([1, 0, 0], pitch));
    q = quatMul(q, quatAxisAngle([0, 0, 1], -roll));
    q = quatMul(q, quatAxisAngle([0, 1, 0], -yaw));
    // Banking turns the car (right wing down turns right); hands off, the wings drift level.
    const bank = rotate(q, [1, 0, 0])[1];
    q = quatMul(quatAxisAngle([0, 1, 0], bank * FLIGHT.bankTurn * dt), q);
    if (!ctl.roll && !ctl.proximity) q = quatMul(q, quatAxisAngle([0, 0, 1], bank * FLIGHT.levelRoll * dt));
    car.q = quatNorm(q);
    const nose = rotate(car.q, [0, 0, -1]);
    f.climb = Math.max(0, f.climb - dt);
    // The take-off hop carries the car clear of the ground before the nose takes over.
    const vertical =
      f.climb > 0
        ? Math.max(nose[1] * f.speed, (FLIGHT.takeoff * f.climb) / FLIGHT.climbFor)
        : nose[1] * f.speed;
    car.vel = [nose[0] * f.speed, vertical, nose[2] * f.speed];
  } else {
    // Parachute: level the canopy, gently turn it, and drift forward so children can aim.
    const level = levelQuat(car),
      k = Math.min(1, FLIGHT.chuteLevel * dt);
    car.q = quatNorm(car.q.map((v, i) => v + (level[i] * Math.sign(dot4(car.q, level) || 1) - v) * k));
    const steer = Math.max(-1, Math.min(1, ctl.steer ?? (ctl.roll || ctl.yaw || 0)));
    car.q = quatNorm(quatMul(quatAxisAngle([0, 1, 0], -steer * FLIGHT.chuteTurn * dt), car.q));
    const heading = -yawOf(car.q),
      drift = [-Math.sin(heading) * FLIGHT.chuteDrift, -Math.cos(heading) * FLIGHT.chuteDrift];
    const drag = Math.exp(-FLIGHT.chuteDrag * dt),
      below = groundBelow(world, car.pos, 80);
    // Retro burn: once the ground is as close as the braking distance, the thrusters take over from
    // the chute and brake to a soft touchdown.
    const sink = -car.vel[1],
      need = (sink * sink - FLIGHT.retroLand ** 2) / (2 * FLIGHT.retroAccel) + FLIGHT.retroMargin;
    f.retro = !!below && (f.retro || below.dist < need) && sink > FLIGHT.retroLand * 0.9;
    const vy = f.retro
      ? Math.min(-FLIGHT.retroLand, car.vel[1] + FLIGHT.retroAccel * dt)
      : car.vel[1] + (-FLIGHT.chuteSink - car.vel[1]) * Math.min(1, 3 * dt);
    // Bleed off drift for touchdown too: otherwise a downhill slope recedes faster than the
    // retro's soft sink, leaving the car gliding above the ground indefinitely.
    if (f.retro) drift.fill(0);
    car.vel = [drift[0] + (car.vel[0] - drift[0]) * drag, vy, drift[1] + (car.vel[2] - drift[1]) * drag];
    if (f.retro) f.retros = (f.retros ?? 0) + dt;
  }
  // World rising air joins the velocity before collision and the existing ceiling clamp.
  // Only flight accepts it: parachutes and road/race movement keep their normal behaviour.
  if (f.mode === 'fly' && Number.isFinite(ctl.lift)) car.vel[1] += Math.max(0, Math.min(3, ctl.lift));
  car.ang = [0, 0, 0];
  // Move, stopping at anything in the way.
  const step = scale(car.vel, dt),
    dist = len(step);
  if (dist > 1e-6) {
    const dir = scale(step, 1 / dist),
      hit = world?.raycast?.(car.pos, dir, dist + 0.2);
    if (hit && hit.dist <= dist + 0.2) {
      const n = hit.normal ?? [0, 1, 0];
      car.pos = madd(car.pos, dir, Math.max(0, hit.dist - 0.2));
      if (n[1] > 0.6 && car.vel[1] <= 0) {
        touchdown(f, car);
        return true;
      }
      // Clipped a wall or a roof edge: the chute opens and the car slides off it.
      car.vel = scale(sub(car.vel, scale(n, 1.4 * dot(car.vel, n))), 0.3);
      f.mode = 'chute';
      f.chutes++;
    } else car.pos = add(car.pos, step);
  }
  const below = groundBelow(world, car.pos);
  if (below) {
    const clear = below.dist;
    if (clear < FLIGHT.land && car.vel[1] <= 0.05 && f.climb <= 0) {
      touchdown(f, car);
      return true;
    }
    if (clear > FLIGHT.ceiling && car.vel[1] > 0) ((car.vel[1] = 0), (car.pos[1] -= clear - FLIGHT.ceiling));
  }
  car.speed = len(car.vel);
  car.forwardSpeed = dot(car.vel, rotate(car.q, [0, 0, -1]));
  car.grounded = false;
  car.contacts = 0;
  return true;
}
// Auto-GCAS: look along the flight path; if it meets the ground (plus a floor), take the stick:
// roll toward wings level (rolling out of inverted first), then pull, full power, and let go once
// the path is clear for `hold` seconds. f.gcas > 0 while it's flying.
function gcas(f, car, ctl, world, dt) {
  const G = FLIGHT.gcas,
    nose = rotate(car.q, [0, 0, -1]);
  if (
    f.climb <= 0 &&
    G.look.some(t => {
      const p = madd(car.pos, nose, f.speed * t),
        g = groundAt(world, p[0], car.pos[1], p[2]);
      return g != null && p[1] < g + G.floor;
    })
  )
    f.gcas = G.hold;
  if (!(f.gcas > 0)) return ctl;
  f.gcas -= dt;
  const right = rotate(car.q, [1, 0, 0]),
    up = rotate(car.q, [0, 1, 0]);
  const roll = up[1] < 0.2 ? (right[1] >= 0 ? 1 : -1) : Math.max(-1, Math.min(1, right[1] * G.roll));
  return {...ctl, roll, yaw: 0, pitch: up[1] > 0 && Math.abs(right[1]) < 0.35 ? 1 : 0, power: 1};
}
// The winged mount's ground avoidance (FLIGHT.proximity): look a short way along the flight path;
// if it meets the ground plus a small floor, pull through the current bank (the lift vector) with
// full power, rolling only enough to bring a near-vertical or inverted bank back to maxBank. It
// never levels the wings and lets go as soon as the path is clear.
function proximityAssist(f, car, ctl, world, dt) {
  const P = FLIGHT.proximity,
    vel = car.vel,
    sp = Math.hypot(...vel) || f.speed;
  if (
    f.climb <= 0 &&
    P.look.some(t => {
      const p = madd(car.pos, vel, t),
        g = groundAt(world, p[0], car.pos[1], p[2]);
      return g != null && p[1] < g + P.floor * Math.min(1.5, sp / 12);
    })
  )
    f.gcas = P.hold;
  if (!(f.gcas > 0)) return ctl;
  f.gcas -= dt;
  const right = rotate(car.q, [1, 0, 0]),
    up = rotate(car.q, [0, 1, 0]),
    bank = Math.asin(Math.max(-1, Math.min(1, right[1]))),
    over = Math.abs(bank) > P.maxBank || up[1] < 0.15;
  return {...ctl, roll: over ? (right[1] >= 0 ? 1 : -1) : ctl.roll, pitch: 1, power: 1};
}
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
