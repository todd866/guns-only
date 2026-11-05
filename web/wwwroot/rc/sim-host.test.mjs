import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {baseCourse} from './sim.mjs';
import {createSession, stepSession} from './physics/session.mjs';
import {createSimHost, FIXED_DT} from './sim-host.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPEN = [-40, 0, 30];

/** @param {unknown} v @param {string} [path] */
function assertJsonClean(v, path = 'root') {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return;
  if (typeof v === 'number') {
    assert.ok(Number.isFinite(v), `${path} is not finite: ${v}`);
    return;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) assertJsonClean(v[i], `${path}[${i}]`);
    return;
  }
  assert.equal(typeof v, 'object', `${path} unexpected type`);
  for (const [k, val] of Object.entries(v)) {
    assert.notEqual(val, undefined, `${path}.${k} is undefined`);
    assertJsonClean(val, `${path}.${k}`);
  }
}

function courseAtOpen() {
  return {...baseCourse(), start: {pos: OPEN, yaw: 0}};
}

/** Deterministic drive script indexed by fixed step. */
function inputScript(stepIndex) {
  const t = stepIndex * FIXED_DT;
  return {
    throttle: t < 2 ? 1 : t < 4 ? 0.2 : 0.5,
    steer: Math.sin(t * 1.7) * 0.6,
    brake: t > 8.5,
    handbrake: t > 6 && t < 7,
    boost: t > 3 && t < 3.5,
    jump: false
  };
}

/** Drive with the same outer-step input semantics as main.js (constant input per render dt). */
function driveHost(host, outerDt, outerCount, input) {
  for (let i = 0; i < outerCount; i++) host.step(outerDt, input);
  return host.frame();
}

/** Held for the whole render dt (main.js semantics); constant so chunk size does not resample it. */
const ACCUMULATOR_INPUT = {
  throttle: 0.85,
  steer: 0.35,
  brake: false,
  handbrake: false,
  boost: false,
  jump: false
};

test('determinism: identical FrameState sequence on the same input script', () => {
  const course = courseAtOpen();
  const collect = () => {
    const host = createSimHost({course, mode: 'kid', rivals: []});
    const seq = [];
    let step = 0;
    let sim = 0;
    while (sim + 1e-12 < 2) {
      host.step(FIXED_DT, inputScript(step));
      seq.push(host.frame());
      sim += FIXED_DT;
      step++;
    }
    return seq;
  };
  const a = collect();
  const b = collect();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], b[i]);
});

test('determinism: identical frame JSON after 10 s on the same input script', () => {
  const course = courseAtOpen();
  const a = createSimHost({course, mode: 'kid', rivals: []});
  const b = createSimHost({course, mode: 'kid', rivals: []});
  let step = 0;
  let sim = 0;
  while (sim + 1e-12 < 10) {
    const input = inputScript(step);
    a.step(FIXED_DT, input);
    b.step(FIXED_DT, input);
    sim += FIXED_DT;
    step++;
  }
  assert.deepEqual(a.frame(), b.frame());
});

test('step-size independence: variable dt accumulators match at 10 s', () => {
  const course = courseAtOpen();
  const run = (outerDt, outerCount) => {
    const host = createSimHost({course, mode: 'kid', rivals: []});
    return driveHost(host, outerDt, outerCount, ACCUMULATOR_INPUT);
  };
  const a = run(1 / 60, 600);
  const b = run(1 / 30, 300);
  const c = run(0.05, 200);
  assert.equal(a.step, 1200);
  assert.equal(b.step, 1200);
  assert.equal(c.step, 1200);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('parity with direct stepSession for 5 s (pos/q within 1e-9)', () => {
  const course = courseAtOpen();
  const session = createSession(course, {mode: 'kid'});
  const host = createSimHost({course, mode: 'kid', rivals: []});
  let step = 0;
  let sim = 0;
  while (sim + 1e-12 < 5) {
    const input = inputScript(step);
    const raw = {
      throttle: input.throttle,
      steer: input.steer,
      brake: input.brake,
      drift: input.handbrake,
      hop: input.jump,
      boost: input.boost ? 1.8 : 1
    };
    stepSession(session, raw, FIXED_DT);
    host.step(FIXED_DT, input);
    sim += FIXED_DT;
    step++;
  }
  const frame = host.frame();
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(session.car.pos[i] - frame.player.pos[i]) < 1e-9, `pos[${i}]`);
  }
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(session.car.q[i] - frame.player.q[i]) < 1e-9, `q[${i}]`);
  }
});

test('frame() is JSON round-trip stable with no undefined or NaN', () => {
  const host = createSimHost({course: courseAtOpen(), mode: 'kid', rivals: []});
  for (let i = 0; i < 240; i++) host.step(FIXED_DT, inputScript(i));
  const frame = host.frame();
  const round = JSON.parse(JSON.stringify(frame));
  assert.deepEqual(round, frame);
  assertJsonClean(frame);
});

test('onFixedStep runs exactly once per fixed step', () => {
  const host = createSimHost({course: courseAtOpen(), mode: 'kid', rivals: []});
  let after = 0;
  host.onFixedStep(() => after++);
  for (let i = 0; i < 240; i++) host.step(FIXED_DT, ACCUMULATOR_INPUT);
  assert.equal(after, 240);
  assert.equal(host.frame().step, 240);
});

test('onBeforeFixedStep runs exactly once per fixed step', () => {
  const host = createSimHost({course: courseAtOpen(), mode: 'kid', rivals: []});
  let before = 0;
  host.onBeforeFixedStep(() => before++);
  for (let i = 0; i < 180; i++) host.step(FIXED_DT, ACCUMULATOR_INPUT);
  assert.equal(before, 180);
});

test('sim-host.mjs has no forbidden imports or browser APIs in source text', () => {
  const src = readFileSync(join(__dirname, 'sim-host.mjs'), 'utf8');
  for (const token of ['three', 'document', 'window', 'fetch', 'AudioContext', 'requestAnimationFrame']) {
    assert.ok(!src.includes(token), `forbidden token "${token}" found in sim-host.mjs`);
  }
});
