// Skate session: a Tony Hawk's Pro Skater 2 run, driven by an RC car. A two-minute clock,
// tricks scored from the car's real airtime and rotation, combos that multiply, named gaps,
// S-K-A-T-E letters, a secret tape and a goal list that persists between runs.
// Pure: the caller supplies a frame that maps world positions into the park's [u, v, h].
import { dot, rotate } from './math.mjs';
import { carUp } from './car.mjs';
import { bindSkateRails, createBalance, stepBalance, GRIND_POINTS } from './grind.mjs';

// A landing banks the combo after `revert` seconds unless the hop button reverts it (on a
// transition) or the car rolls into a manual.
export const SKATE = { seconds: 120, minAir: .3, revert: .5, reach: .7, reachUp: .8, manualMin: .35 };

// The neighbourhood plaza: small, so it teaches the mechanic rather than hosting a full level.
// Zones are park-local [u0, u1, v0, v1] (park-lines.mjs frame); heights are above the datum.
export const INTRO_PARK = Object.freeze({
  id: 'intro', name: 'SKATE PLAZA',
  // Runs start mid-plaza, facing the long quarter.
  start: { at: [2.6, -2], toward: [1, 0] },
  rails: [
    { id: 'west-quarter-coping', kind: 'coping', pts: [[-16, -3.8, 1.605], [-16, 6.4, 1.605]] },
    { id: 'funbox-edge', kind: 'edge', pts: [[-4.1, 5.88, 1.12], [-1.7, 5.88, 1.12]] },
    { id: 'divider-ledge', kind: 'ledge', pts: [[-4.05, -1.36, 1.14], [-1.85, -1.36, 1.14]] },
    { id: 'manual-pad-west', kind: 'ledge', pts: [[-6.65, -9.25, .5], [-3.05, -9.25, .5]] },
    { id: 'manual-pad-east', kind: 'ledge', pts: [[-.85, -7.45, .5], [2.35, -7.45, .5]] },
    { id: 'manual-pad-rail', kind: 'rail', pts: [[-4.9, -5.65, .81], [-1.1, -5.65, .81]] },
    { id: 'low-bank-rail', kind: 'rail', pts: [[-5.8, .7, .8015], [-4.2, .7, 1.315], [-1.6, .7, 1.315], [0, .7, .8015]] },
    { id: 'east-quarter-coping', kind: 'coping', pts: [[8.2, -3.4, 1.61], [8.2, 6.7, 1.61]] },
    { id: 'bowl-coping-south', kind: 'coping', pts: [[8.2, 6.7, 1.61], [13.4, 6.7, 1.61]] },
    { id: 'bowl-coping-east', kind: 'coping', pts: [[15.4, 8.7, 1.61], [15.4, 11.8, 1.61]] },
    { id: 'bowl-coping-north', kind: 'coping', pts: [[13.4, 13.8, 1.61], [7.8, 13.8, 1.61]] },
  ],
  gaps: [
    { name: 'HIP TRANSFER', points: 500, from: [5.8, 8.6, 2.5, 8.7], to: [6, 15.4, 8.2, 13.8] },
    { name: 'OVER THE FUNBOX', points: 300, from: [-6.8, -4.4, -1.1, 5.9], to: [-1.4, 2.6, -1.1, 5.9] },
    { name: 'OVER THE FUNBOX', points: 300, from: [-1.4, 2.6, -1.1, 5.9], to: [-6.8, -4.4, -1.1, 5.9] },
    { name: 'LEDGE HOP', points: 200, from: [-5.7, -.2, -3.6, -1.7], to: [-5.7, -.2, -1.0, 3.0] },
    { name: 'LEDGE HOP', points: 200, from: [-5.7, -.2, -1.0, 3.0], to: [-5.7, -.2, -3.6, -1.7] },
    { name: 'STAIR SET', points: 250, from: [-16.4, -11.8, -6.6, -3.9], fromAbove: .9, to: [-11.6, -6, -9, -2], toBelow: .4 },
    { name: 'OVER THE LIP', points: 100, from: [6.2, 8.2, -3.4, 6.7], to: [8.3, 13, -3.4, 6.6], toAbove: 1.3 },
    { name: 'BOWL DROP', points: 150, from: [8.2, 17.3, -3.4, 6.7], fromAbove: 1.3, to: [7.8, 15.4, 7.2, 13.8], toBelow: 1.2 },
  ],
  letters: [
    { letter: 'S', at: [-2.9, 4.4, 1.55] },
    { letter: 'K', at: [8.0, 8.6, 1.6] },
    { letter: 'A', at: [11, 7.2, 2.5] },
    { letter: 'T', at: [-16.9, .2, 1.75] },
    { letter: 'E', at: [-2.1, -7.9, .95] },
  ],
  // High over the west quarter's lip: only a full-speed air up that wall reaches it.
  tape: [-15.3, .5, 5.0],
  goals: [
    { id: 'high', label: 'High Score', score: 3000 },
    { id: 'pro', label: 'Pro Score', score: 10000 },
    { id: 'sick', label: 'Sick Score', score: 30000 },
    { id: 'skate', label: 'Collect S-K-A-T-E' },
    { id: 'hip', label: 'Hip Transfer', gap: 'HIP TRANSFER' },
    { id: 'combo', label: '4-trick combo', combo: 4 },
    { id: 'tape', label: 'Secret Tape' },
  ],
});

const inZone = ([u, v], z) => u >= z[0] && u <= z[1] && v >= z[2] && v <= z[3];
const commas = n => Math.round(n).toLocaleString('en-US');

export function createSkate(park = INTRO_PARK, done = []) {
  return { park, left: SKATE.seconds, score: 0, over: false, letters: [], tape: false, gapsFound: new Set(),
    goals: new Set(done), newGoals: [], best: 0, combo: null, air: null, ground: 0, manual: 0, special: 0, specialActive: false, events: [] };
}

function chargeSpecial(sk, points) {
  sk.special = Math.min(1, sk.special + Math.max(0, points) / 4000);
  if (sk.special >= 1) sk.specialActive = true;
}
function addTrick(sk, name, points) {
  const combo = sk.combo ??= { tricks: [], base: 0 };
  // Repeats in one combo are worth half each time, so a pendulum cannot farm forever.
  const repeats = combo.tricks.filter(t => t === name).length, value = points * Math.max(.125, .5 ** repeats);
  const before = combo.base * combo.tricks.length;
  combo.tricks.push(name); combo.base += value;
  chargeSpecial(sk, combo.base * combo.tricks.length - before);
  sk.events.push({ type: 'trick', name, points: Math.round(value) });
  return points ? value / points : 1;
}

function bank(sk) {
  const c = sk.combo; sk.combo = null;
  if (!c?.tricks.length) return;
  const total = Math.round(c.base * c.tricks.length);
  sk.score += total; sk.best = Math.max(sk.best, c.tricks.length);
  sk.events.push({ type: 'land', total, tricks: c.tricks.length });
  goal(sk, 'combo', c.tricks.length >= (sk.park.goals.find(g => g.id === 'combo')?.combo ?? Infinity));
  for (const g of sk.park.goals) if (g.score) goal(sk, g.id, sk.score >= g.score);
}

function bail(sk) {
  sk.events.push({ type: 'bail', lost: sk.combo ? Math.round(sk.combo.base * sk.combo.tricks.length) : 0 });
  sk.combo = null; sk.manual = 0; sk.manualTrick = false; sk.landed = null; sk.special = 0; sk.specialActive = false;
}

function goal(sk, id, met) {
  if (!met || sk.goals.has(id)) return;
  sk.goals.add(id); sk.newGoals.push(id);
  sk.events.push({ type: 'goal', id, label: sk.park.goals.find(g => g.id === id)?.label ?? id });
}

// Names one airborne episode from what the car actually did.
function nameAir(a) {
  const tricks = [];
  const spin = Math.abs(a.yaw) * 180 / Math.PI, assisted = a.kind === 'return';
  const grab = a.grab >= .2 ? (a.grabSteer < -.3 ? 'Melon' : a.grabSteer > .3 ? 'Indy' : 'Method') : null;
  let name = grab ?? (assisted ? 'Backside Air' : 'Air'), points = grab ? 200 + 400 * a.grab : assisted ? 250 + 100 * a.time : 100 + 150 * a.time;
  if (!assisted && spin >= 150) {
    const turns = Math.round(spin / 180) * 180;
    name = `${turns} ${grab ?? 'Spin'}`; points += { 180: 150, 360: 400, 540: 750 }[turns] ?? 1000;
  }
  // A flip or grab from the board already names this air; a bare "Air" beside it is noise.
  if (!(a.board && !grab && name === (assisted ? 'Backside Air' : 'Air'))) tricks.push([name, points]);
  if (a.special && !assisted && spin >= 900) tricks.push(['The 900', 9000]);
  else if (a.special && !assisted && spin >= 540) tricks.push(['Orbital 540', 3500]);
  else if (a.special && a.grab >= .75 && a.time >= 1 && a.rise >= 1) tricks.push(['Christ Air', 3000]);
  if (Math.abs(a.roll) >= 5.2) tricks.push(['Barrel Roll', 750]);
  if (Math.abs(a.pitch) >= 5.2) tricks.push([a.pitch > 0 ? 'Backflip' : 'Frontflip', 800]);
  return tricks;
}

function landAir(sk, a, at, up) {
  if (a.time < SKATE.minAir) return;
  const l = sk.landed;
  if (l && !l.kept && !l.linked && l.time > SKATE.revert) bank(sk);
  if (up[1] < .55) { bail(sk); return; }
  for (const [name, points] of nameAir(a)) addTrick(sk, name, points);
  for (const g of sk.park.gaps) {
    if (!inZone(a.from, g.from) || !inZone(at, g.to)) continue;
    if (g.fromAbove != null && a.from[2] < g.fromAbove) continue;
    if (g.fromBelow != null && a.from[2] > g.fromBelow) continue;
    if (g.minAir != null && a.time < g.minAir) continue;
    if (g.toAbove != null && at[2] < g.toAbove) continue;
    if (g.toBelow != null && at[2] > g.toBelow) continue;
    addTrick(sk, g.name, g.points); sk.gapsFound.add(g.name);
    sk.events.push({ type: 'gap', name: g.name, points: g.points });
    for (const def of sk.park.goals) if (def.gap === g.name) goal(sk, def.id, true);
  }
  if (sk.combo) sk.landed = { time: 0, transition: a.kind === 'return' || a.kind === 'transfer' };
}

// Free skate on the board anywhere in the world: the same combos, manuals and special meter,
// with no clock, letters, gaps or goals. Frame: world [x, y, z] -> [x, z, y].
export const STREET = Object.freeze({ id: 'street', name: 'STREET', rails: [], gaps: [], letters: [], goals: [], tape: null, airCapture: true });
/** The street park with a fresh set of grindable rails (open-world/street-rails.mjs). */
export const streetPark = rails => Object.freeze({ ...STREET, rails });
export const streetFrame = p => [p[0], p[2], p[1]];
export function createStreetSkate() { const sk = createSkate(STREET); sk.left = Infinity; sk.free = true; return sk; }

/** A trick scored from outside the air/grind/manual detection (the board's flips and grabs). */
export function scoreTrick(sk, name, points) {
  if (sk.over) return;
  addTrick(sk, name, points);
  if (sk.air) sk.air.board = (sk.air.board ?? 0) + 1; else sk.landed = { time: 0 };
}
/** A bail from outside (landing mid-flip): the combo is lost and this air scores nothing. */
export function bailRun(sk) { if (!sk.over) { sk.air = null; bail(sk); } }

// One fixed physics step. frame(pos) returns park-local [u, v, h].
export function stepSkate(sk, session, input, dt, frame) {
  sk.events = [];
  if (sk.over) return sk.events;
  bindSkateRails(session, sk.park, frame);
  const car = session.car, at = frame(car.pos), up = carUp(car), grind = session.skateRide?.active;
  sk.left = Math.max(0, sk.left - dt);
  sk.special = Math.max(0, sk.special - (sk.specialActive ? .04 : .012) * dt);
  if (sk.special <= 0) sk.specialActive = false;
  for (const l of sk.park.letters) if (!sk.letters.includes(l.letter) && Math.hypot(at[0] - l.at[0], at[1] - l.at[1]) < SKATE.reach && Math.abs(at[2] - l.at[2]) < SKATE.reachUp) {
    sk.letters.push(l.letter); sk.events.push({ type: 'letter', letter: l.letter, count: sk.letters.length });
    goal(sk, 'skate', sk.letters.length === sk.park.letters.length);
  }
  const t = sk.park.tape;
  if (t && !sk.tape && Math.hypot(at[0] - t[0], at[1] - t[1]) < SKATE.reach && Math.abs(at[2] - t[2]) < SKATE.reachUp) { sk.tape = true; sk.events.push({ type: 'tape' }); goal(sk, 'tape', true); }

  sk.balance = null;
  if (grind) {
    if (sk.air) { landAir(sk, sk.air, at, up); sk.air = null; }
    if (sk.grindId !== grind.id) {
      sk.grindId = grind.id; sk.grindRate = addTrick(sk, grind.name, GRIND_POINTS[grind.name] ?? 100);
    }
    const points = 180 * dt * sk.grindRate; sk.combo.base += points; chargeSpecial(sk, points * sk.combo.tricks.length);
    if (sk.specialActive && grind.time >= 2 && !grind.special) { addTrick(sk, 'Meteor Grind', 1800); grind.special = true; }
    sk.balance = { ...grind.balance, kind: 'grind' }; sk.manual = 0; sk.manualTrick = false;
    sk.lastGround = at; sk.ground = 0; sk.landed = { time: 0, linked: true };
  } else if (car.contacts === 0) {
    const a = sk.air ??= { time: 0, from: sk.lastGround ?? at, yaw: 0, roll: 0, pitch: 0, grab: 0, grabSteer: 0, kind: null, rise: 0 };
    a.special = sk.specialActive; a.rise = Math.max(a.rise, at[2] - a.from[2]);
    a.time += dt; a.yaw += car.ang[1] * dt;
    a.roll += dot(car.ang, rotate(car.q, [0, 0, -1])) * dt;
    a.pitch += dot(car.ang, rotate(car.q, [1, 0, 0])) * dt;
    a.kind ??= session.assist?.quarter?.arc?.kind ?? null;
    if (session.assist?.skateSpinning) a.kind = 'spin';
    if (input.drift) { if (!a.grab) a.grabSteer = input.steer || 0; a.grab += dt; }
    sk.ground = 0; sk.manual = 0; sk.manualTrick = false;
    if (sk.landed) sk.landed.time += dt;
  } else if (sk.air) {
    sk.ground += dt;
    if (car.contacts >= 2 && sk.ground >= .05) {
      const a = sk.air; sk.air = null; landAir(sk, a, at, up);
    }
  } else {
    sk.lastGround = at;
    const front = car.wheels[0].contact || car.wheels[1].contact, rear = car.wheels[2].contact || car.wheels[3].contact;
    const flat = car.wheels.some(w => w.contact && w.contactNormal?.[1] > .95);
    const manual = session.skateRide?.manual;
    if (manual || (!session.skateRide?.manualBlocked && !sk.manualLost && rear && !front && flat && car.speed > 1)) {
      if (!sk.manual) sk.manualBalance = createBalance();
      sk.manual += dt;
      const b = manual?.balance ?? sk.manualBalance;
      const balanced = manual || stepBalance(b, input.steer, dt, session.mode);
      if (!balanced) { sk.manual = 0; sk.manualTrick = false; sk.manualLost = true; }
      if (balanced && sk.manual >= SKATE.manualMin) {
        if (!sk.manualTrick) { sk.manualRate = addTrick(sk, 'Manual', 60 + 120 * SKATE.manualMin); sk.manualTrick = true; }
        const points = 120 * dt * sk.manualRate; sk.combo.base += points; chargeSpecial(sk, points * sk.combo.tricks.length); sk.landed = { time: 0, linked: true }; sk.balance = { ...b, kind: 'manual' };
      }
    } else { sk.manual = 0; sk.manualTrick = false; if (front || !rear) sk.manualLost = false; }
    const l = sk.landed;
    if (sk.combo && sk.manual < SKATE.manualMin) {
      if (l) l.time += dt;
      if (l && !l.kept && l.transition && input.drift && l.time <= SKATE.revert) { l.kept = true; addTrick(sk, 'Revert', 100); }
      if (!l || (l.kept ? l.time > 2.5 : l.time > SKATE.revert)) { sk.landed = null; bank(sk); }
    }
  }
  if (session.recoveries !== (sk.recoveries ??= session.recoveries)) { sk.recoveries = session.recoveries; sk.air = null; bail(sk); }
  if (sk.left <= 0 && !sk.air && !sk.manual && !session.skateRide?.manual && !grind) {
    bank(sk); sk.over = true; sk.events.push({ type: 'over', score: sk.score });
  }
  return sk.events;
}

// The live combo line, THPS2-style: "Indy + Hip Transfer + Backside Air" and "1,350 X 3".
export function comboText(sk) {
  const c = sk.combo;
  if (!c?.tricks.length) return null;
  return { tricks: c.tricks.join(' + '), score: `${commas(c.base)} X ${c.tricks.length}` };
}

export { commas };
