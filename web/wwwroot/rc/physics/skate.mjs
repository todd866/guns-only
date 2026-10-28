// Skate session: a Tony Hawk's Pro Skater 2 run, driven by an RC car. A two-minute clock,
// tricks scored from the car's real airtime and rotation, combos that multiply, named gaps,
// S-K-A-T-E letters, a secret tape and a goal list that persists between runs.
// Pure: the caller supplies a frame that maps world positions into the park's [u, v, h].
import { dot, rotate } from './math.mjs';
import { carUp } from './car.mjs';

// A landing banks the combo after `revert` seconds unless the hop button reverts it (on a
// transition) or the car rolls into a manual.
export const SKATE = { seconds: 120, minAir: .3, revert: .5, reach: .7, reachUp: .8, manualMin: .35 };

// The neighbourhood plaza: small, so it teaches the mechanic rather than hosting a full level.
// Zones are park-local [u0, u1, v0, v1] (park-lines.mjs frame); heights are above the datum.
export const INTRO_PARK = Object.freeze({
  id: 'intro', name: 'SKATE PLAZA',
  // Runs start mid-plaza, facing the long quarter.
  start: { at: [2.6, -2], toward: [1, 0] },
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
    goals: new Set(done), newGoals: [], best: 0, combo: null, air: null, ground: 0, manual: 0, events: [] };
}

function addTrick(sk, name, points) {
  const combo = sk.combo ??= { tricks: [], base: 0 };
  // Repeats in one combo are worth half each time, so a pendulum cannot farm forever.
  const repeats = combo.tricks.filter(t => t === name).length, value = points * Math.max(.125, .5 ** repeats);
  combo.tricks.push(name); combo.base += value;
  sk.events.push({ type: 'trick', name, points: Math.round(value) });
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
  sk.combo = null; sk.manual = 0;
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
  tricks.push([name, points]);
  if (Math.abs(a.roll) >= 5.2) tricks.push(['Barrel Roll', 750]);
  if (Math.abs(a.pitch) >= 5.2) tricks.push([a.pitch > 0 ? 'Backflip' : 'Frontflip', 800]);
  return tricks;
}

// One fixed physics step. `session` is the player's physics session; `frame(pos)` returns the
// park-local [u, v, h]. Returns this step's events (trick, land, bail, gap, letter, tape, goal, over).
export function stepSkate(sk, session, input, dt, frame) {
  sk.events = [];
  if (sk.over) return sk.events;
  const car = session.car, at = frame(car.pos), up = carUp(car);
  sk.left = Math.max(0, sk.left - dt);
  // Collectables: letters and the tape count anywhere the car reaches them, air or ground.
  for (const l of sk.park.letters) if (!sk.letters.includes(l.letter) && Math.hypot(at[0] - l.at[0], at[1] - l.at[1]) < SKATE.reach && Math.abs(at[2] - l.at[2]) < SKATE.reachUp) {
    sk.letters.push(l.letter); sk.events.push({ type: 'letter', letter: l.letter, count: sk.letters.length });
    goal(sk, 'skate', sk.letters.length === sk.park.letters.length);
  }
  const t = sk.park.tape;
  if (t && !sk.tape && Math.hypot(at[0] - t[0], at[1] - t[1]) < SKATE.reach && Math.abs(at[2] - t[2]) < SKATE.reachUp) { sk.tape = true; sk.events.push({ type: 'tape' }); goal(sk, 'tape', true); }

  if (car.contacts === 0) {
    // Airborne: integrate rotation about world up (spin) and the car's own axes (flip, roll).
    const a = sk.air ??= { time: 0, from: sk.lastGround ?? at, yaw: 0, roll: 0, pitch: 0, grab: 0, grabSteer: 0, kind: null };
    a.time += dt;
    a.yaw += car.ang[1] * dt;
    a.roll += dot(car.ang, rotate(car.q, [0, 0, -1])) * dt;
    a.pitch += dot(car.ang, rotate(car.q, [1, 0, 0])) * dt;
    a.kind ??= session.assist?.quarter?.arc?.kind ?? null;
    if (input.drift) { if (!a.grab) a.grabSteer = input.steer || 0; a.grab += dt; }
    sk.ground = 0;
    // Bounces under the trick threshold do not restart the revert window.
    if (sk.landed) sk.landed.time += dt;
  } else if (sk.air) {
    sk.ground += dt;
    if (car.contacts >= 2 && sk.ground >= .05) {
      const a = sk.air; sk.air = null;
      if (a.time >= SKATE.minAir) {
        const l = sk.landed;
        if (l && !l.kept && l.time > SKATE.revert) bank(sk);
        if (up[1] < .55) bail(sk);
        else {
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
            for (const goalDef of sk.park.goals) if (goalDef.gap === g.name) goal(sk, goalDef.id, true);
          }
        }
        if (sk.combo) sk.landed = { time: 0, transition: a.kind === 'return' || a.kind === 'transfer' };
      }
    }
  } else {
    sk.lastGround = at;
    // Manual: rear wheels down, front wheels up, held. It keeps a combo alive like THPS2.
    const front = car.wheels[0].contact || car.wheels[1].contact, rear = car.wheels[2].contact || car.wheels[3].contact;
    const flat = car.wheels.some(w => w.contact && w.contactNormal?.[1] > .95);
    if (rear && !front && flat && car.speed > 1) sk.manual += dt;
    else {
      if (sk.manual >= SKATE.manualMin) addTrick(sk, 'Manual', 60 + 120 * sk.manual);
      sk.manual = 0;
    }
    const l = sk.landed;
    if (sk.combo && sk.manual < SKATE.manualMin) {
      if (l) l.time += dt;
      // Revert: the hop button held through, or pressed just after, a transition landing.
      if (l && !l.kept && l.transition && input.drift && l.time <= SKATE.revert) { l.kept = true; addTrick(sk, 'Revert', 100); }
      // A reverted combo lives until the next takeoff; anything else banks.
      if (!l || (l.kept ? l.time > 2.5 : l.time > SKATE.revert)) { sk.landed = null; bank(sk); }
    }
  }
  if (session.recoveries !== (sk.recoveries ??= session.recoveries)) { sk.recoveries = session.recoveries; sk.air = null; bail(sk); }
  // The clock may run out mid-air: like THPS2, the last combo still lands.
  if (sk.left <= 0 && !sk.air && !sk.manual) {
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
