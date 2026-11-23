// Kid-mode race help. Big Kid never calls this. The numbers are play bounds for a six-year-old:
// stay on the line, a loss stays close, a win is common and not guaranteed. Recent places live in
// localStorage so a bad run gets more help and a hot streak races a little harder.
import {placeCar, carYaw, rideHeight, RECOVERY_ROLL_MPS} from './car.mjs';

export const KID_RESULTS_KEY = 'rc.kid.results.v1';
export const DIFFICULTY = Object.freeze({min: 0.15, max: 0.82, fresh: 0.32});
export const LINE = Object.freeze({dead: 0.4, full: 3.2, maxSteer: 0.7});
export const TRACK = Object.freeze({margin: 0.45, minHalf: 1.15, offPast: 0.55});
export const OFF_TRACK_RESPAWN_S = 2;
export const WRONG_WAY = 2.15;
export const RUBBER = Object.freeze({
  easeFrom: 8,
  easeFloor: 0.58,
  easeCeil: 0.9,
  pushCap: 1.12,
  noLap: 0.82,
  catchFrom: 10,
  catchMax: 1.12
});
export const KID_MISSILE_SCALE = 0.7;
// Middle-of-pack draws while he is behind. Comeback items (zoom, pitbull, foxtwo) dominate.
export const KID_BEHIND_WEIGHTS = Object.freeze({
  zoom: 5.5,
  balloon: 0.3,
  oil: 0.25,
  bubble: 0.8,
  foxtwo: 1.1,
  pitbull: 4.2,
  foxone: 0.25,
  zuni: 0.35
});

const clamp01 = d => Math.max(DIFFICULTY.min, Math.min(DIFFICULTY.max, d));

export function kidRaceLaps(authoredLaps, chosen, kind) {
  if (Number.isFinite(chosen) && chosen >= 1) return Math.max(1, Math.min(9, Math.floor(chosen)));
  if (kind === 'sprint') return 1;
  const n = Number.isFinite(authoredLaps) ? Math.max(1, Math.floor(authoredLaps)) : 3;
  return Math.min(2, n);
}

export function kidFinishTitle(place) {
  const p = Math.max(1, place | 0);
  if (p === 1) return 'YOU WON!';
  if (p === 2) return '2nd place — so close!';
  if (p === 3) return '3rd place — so close!';
  const suf = p % 100 >= 11 && p % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][p % 10] ?? 'th');
  return `${p}${suf} — nice racing!`;
}

export function readKidResults(storage) {
  try {
    const raw = JSON.parse(storage?.getItem?.(KID_RESULTS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(n => Number.isInteger(n) && n >= 1 && n <= 16).slice(-8);
  } catch {
    return [];
  }
}

export function writeKidResult(storage, place) {
  const next = [...readKidResults(storage), place | 0].filter(n => n >= 1 && n <= 16).slice(-8);
  try {
    storage?.setItem?.(KID_RESULTS_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

// 0.15 helps a lot (he has been finishing back). 0.82 races them (he has been winning).
// Empty history is the fresh, helpful setting — a first race should not be a blowout.
export function difficultyFrom(places) {
  const list = (places ?? []).filter(p => Number.isInteger(p) && p >= 1).slice(-8);
  if (!list.length) return DIFFICULTY.fresh;
  const n = list.length;
  const wins = list.filter(p => p === 1).length / n;
  const mean = list.reduce((a, b) => a + b, 0) / n;
  return clamp01(0.4 + (wins - 0.5) * 0.9 + (2.1 - mean) * 0.12);
}

// 0 on the line, 1 once he is LINE.full metres off. Squared so the pull is gentle near the line
// and stronger the further off.
export function assistStrength(absOffset) {
  if (!(absOffset > LINE.dead)) return 0;
  const t = Math.min(1, (absOffset - LINE.dead) / (LINE.full - LINE.dead));
  return t * t;
}

export function lineAssistSteer(offset) {
  const s = assistStrength(Math.abs(offset));
  if (!s) return 0;
  return -Math.sign(offset) * LINE.maxSteer * s;
}

export function blendSteer(raw, help) {
  const r = Math.max(-1, Math.min(1, raw || 0));
  const h = Math.max(-1, Math.min(1, help || 0));
  if (!h) return r;
  return Math.max(-1, Math.min(1, r * (1 - Math.abs(h) * 0.45) + h));
}

export function trackZone(offset, half) {
  const edge = Math.max(TRACK.minHalf, half || 0);
  const a = Math.abs(offset);
  if (a <= edge - TRACK.margin) return 'on';
  if (a <= edge + TRACK.offPast) return 'edge';
  return 'off';
}

// Edge band only. Fully off the track is the respawn timer's job — a bumper that drags him
// home from the infield would hide that he left. Redirects across-track; never a hop or a roll.
export function bumperPlan({offset, half, along, across}) {
  if (trackZone(offset, half) !== 'edge') return {active: false, along, across, over: 0, hop: 0, roll: 0};
  const edge = Math.max(TRACK.minHalf, half || 0) - TRACK.margin;
  const over = Math.abs(offset) - edge;
  const outward = Math.sign(offset) || 1;
  let a = across;
  if (a * outward > 0) a *= Math.max(0, 1 - Math.min(1, over * 3));
  a += -outward * Math.min(2.6, 0.7 + over * 1.8);
  let f = along;
  const speed = Math.hypot(along, across);
  if (speed > 1 && f >= 0) f = Math.max(f, Math.min(speed, 2.4));
  return {active: true, along: f, across: a, over, hop: 0, roll: 0};
}

export function nextOffSeconds(prev, off, dt) {
  return off ? (prev || 0) + dt : 0;
}

export function respawnDue(offSeconds) {
  return offSeconds > OFF_TRACK_RESPAWN_S;
}

// Positive gap: this rival is ahead of him, so ease off. Past noLap of a lap, hold them —
// they are not allowed to lap him. Negative gap: they are behind, and may push to rejoin.
export function rubberRival(gapM, lapM, difficulty = DIFFICULTY.fresh) {
  const d = clamp01(difficulty);
  const lap = Math.max(8, lapM || 80);
  if (gapM >= lap * RUBBER.noLap) return RUBBER.easeFloor;
  if (gapM > RUBBER.easeFrom) {
    const span = lap * RUBBER.noLap - RUBBER.easeFrom;
    const t = Math.min(1, (gapM - RUBBER.easeFrom) / span);
    const floor = RUBBER.easeFloor + (RUBBER.easeCeil - RUBBER.easeFloor) * d;
    return 1 - (1 - floor) * t * t;
  }
  if (gapM < -RUBBER.easeFrom) {
    const t = Math.min(1, (-gapM - RUBBER.easeFrom) / 30);
    const cap = 1 + (RUBBER.pushCap - 1) * (0.45 + 0.55 * d);
    return 1 + (cap - 1) * t;
  }
  return 1;
}

// behindM: how many metres the leader is ahead of him. 1 means no extra speed.
export function catchUpBoost(behindM, difficulty = DIFFICULTY.fresh) {
  const d = clamp01(difficulty);
  if (!(behindM > RUBBER.catchFrom)) return 1;
  const t = Math.min(1, (behindM - RUBBER.catchFrom) / 28);
  const max = 1 + (RUBBER.catchMax - 1) * (1 - d * 0.65);
  return 1 + (max - 1) * t * t;
}

// A hit may wobble him. It may not launch him or spin him off the asphalt.
export function softenKidHit(car) {
  car.vel[0] *= 0.84;
  car.vel[2] *= 0.84;
  car.vel[1] = car.vel[1] * 0.5 + 0.12;
  car.ang[1] += 1.1;
}

export function lineSample(line, x, z) {
  if (!line || line.length < 2) return null;
  let bestD = Infinity;
  let best = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i],
      b = line[i + 1];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) continue;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx * t,
      pz = a[1] + dz * t,
      dist = Math.hypot(x - px, z - pz);
    if (dist < bestD) {
      bestD = dist;
      const heading = Math.atan2(dx, -dz);
      const rightX = Math.cos(heading),
        rightZ = Math.sin(heading);
      best = {
        i,
        t,
        x: px,
        z: pz,
        offset: (x - px) * rightX + (z - pz) * rightZ,
        dist,
        heading,
        half: Math.max(a[2] || 2, b[2] || 2)
      };
    }
  }
  return best;
}

export function headingError(heading, yaw) {
  return Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
}

export function pointAhead(line, sample, metres) {
  let i = sample.i,
    t = sample.t,
    left = Math.max(0, metres);
  while (i < line.length - 1) {
    const a = line[i],
      b = line[i + 1];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      seg = Math.hypot(dx, dz) || 1e-6;
    const room = (1 - t) * seg;
    if (left <= room) {
      t += left / seg;
      return {x: a[0] + dx * t, z: a[1] + dz * t, heading: Math.atan2(dx, -dz)};
    }
    left -= room;
    i += 1;
    t = 0;
  }
  const a = line[Math.max(0, line.length - 2)],
    b = line[line.length - 1];
  return {x: b[0], z: b[1], heading: Math.atan2(b[0] - a[0], -(b[1] - a[1]))};
}

// A few metres ahead on the line, but not through the next gate — that would gift him a place.
export function clearOfGate(line, sample, metres, gate) {
  if (!gate) return pointAhead(line, sample, metres);
  const reach = (gate[3] ?? 2.4) + 0.5;
  let safe = pointAhead(line, sample, 0);
  for (let m = 0.4; m <= metres + 1e-6; m += 0.4) {
    const pt = pointAhead(line, sample, m);
    if (Math.hypot(pt.x - gate[0], pt.z - gate[1]) < reach) return safe;
    safe = pt;
  }
  return safe;
}

function basis(heading) {
  return {
    fx: Math.sin(heading),
    fz: -Math.cos(heading),
    rx: Math.cos(heading),
    rz: Math.sin(heading)
  };
}

function groundY(world, x, y, z) {
  const hit =
    world?.raycast?.([x, (y ?? 0) + 2, z], [0, -1, 0], 8) ??
    world?.raycast?.([x, (y ?? 0) + 40, z], [0, -1, 0], 80);
  return hit ? hit.point[1] : (y ?? 0);
}

function applyBumper(car, sample) {
  const b = basis(sample.heading);
  const along = car.vel[0] * b.fx + car.vel[2] * b.fz;
  const across = car.vel[0] * b.rx + car.vel[2] * b.rz;
  const plan = bumperPlan({offset: sample.offset, half: sample.half, along, across});
  if (!plan.active) return;
  car.vel[0] = b.fx * plan.along + b.rx * plan.across;
  car.vel[2] = b.fz * plan.along + b.rz * plan.across;
  const nudge = Math.min(0.03, Math.max(0, plan.over) * 0.25);
  if (nudge) {
    const inward = -Math.sign(sample.offset);
    car.pos[0] += b.rx * inward * nudge;
    car.pos[2] += b.rz * inward * nudge;
  }
}

function boing(race, sample) {
  const car = race.player.car;
  const gate = race.player.gate > 0 ? race.course.checkpoints[race.player.gate] : null;
  const at = clearOfGate(race.line, sample, 6, gate);
  const y = groundY(race.course.world, at.x, car.pos[1], at.z);
  placeCar(car, [at.x, y + rideHeight(car.params) + 0.02, at.z], at.heading, RECOVERY_ROLL_MPS);
}

// Steer help, edge bumpers, and the boing. Does not touch lap, gate, or the Big Kid clock.
export function guideKid(race, input, dt) {
  if (race.player.flight?.mode || race.player.skateRide) return input;
  const car = race.player.car;
  const sample = lineSample(race.line, car.pos[0], car.pos[2]);
  if (!sample) return input;
  const err = headingError(sample.heading, carYaw(car));
  const moving = Math.hypot(car.vel[0], car.vel[2]) > 0.6;
  const wrong = moving && Math.abs(err) > WRONG_WAY;
  let steer = input?.steer || 0;
  if (wrong) {
    steer = blendSteer(steer, Math.max(-1, Math.min(1, err * 1.8)));
    race.kidArrow = err > 0 ? 'right' : 'left';
  } else {
    race.kidArrow = null;
    steer = blendSteer(steer, lineAssistSteer(sample.offset));
  }
  if (trackZone(sample.offset, sample.half) === 'edge') applyBumper(car, sample);
  const off = trackZone(sample.offset, sample.half) === 'off';
  const was = race.kidOff || 0;
  race.kidOff = nextOffSeconds(was, off, dt);
  race.kidFeed ??= [];
  if (off && was === 0)
    race.kidFeed.push({type: 'offtrack', offset: Math.round(sample.offset * 10) / 10});
  if (!race.player.finished && respawnDue(race.kidOff)) {
    boing(race, sample);
    race.kidOff = 0;
    race.kidArrow = null;
    race.kidBoing = true;
    race.kidFeed.push({type: 'respawn', offset: Math.round(sample.offset * 10) / 10});
  }
  return {...input, steer};
}
