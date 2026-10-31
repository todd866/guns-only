import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from './world.mjs';
import {createCar, stepCar} from './car.mjs';
import {legendCarParams, LEGEND_CARS, mountParams} from './vehicles.mjs';

const flat = () => {
  const w = createWorld();
  w.addQuad([-400, 0, -400], [-400, 0, 400], [400, 0, 400], [400, 0, -400], 'asphalt');
  return w;
};
const run = (tier, steps, input) => {
  const w = flat(),
    p = legendCarParams(tier),
    c = createCar(p, [0, 0.3, 0], 0);
  let top = 0,
    upright = true;
  for (let i = 0; i < steps; i++) {
    stepCar(c, typeof input === 'function' ? input(i) : input, w, 1 / 120);
    top = Math.max(top, Math.hypot(c.vel[0], c.vel[2]));
    const upY = 1 - 2 * (c.q[0] * c.q[0] + c.q[2] * c.q[2]);
    if (upY < 0.3) upright = false;
  }
  return {c, top, upright};
};

test('the ladder climbs: each tier is a bit bigger and a bit faster', () => {
  const tops = ['starter', 'trail', 'road'].map(t => run(t, 120 * 10, {throttle: 1}).top);
  assert.ok(tops[0] < 9.5 && tops[0] > 7.5, `starter ~9 m/s: ${tops[0].toFixed(1)}`);
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2], `tops ${tops.map(v => v.toFixed(1))}`);
  assert.ok(legendCarParams('road').size[2] > legendCarParams('starter').size[2] * 1.25);
  for (const t of Object.keys(LEGEND_CARS))
    assert.ok(run(t, 120 * 4, {throttle: 1}).upright, `${t} drives straight upright`);
});

test('every tier rides at a sensible height on its scaled springs', () => {
  for (const t of Object.keys(LEGEND_CARS)) {
    const p = legendCarParams(t),
      {c} = run(t, 240, {});
    const sag = (p.mass * 9.81) / 4 / p.spring;
    assert.ok(
      sag < p.restLength * 0.8,
      `${t}: sag ${sag.toFixed(3)} within travel ${p.restLength.toFixed(3)}`
    );
    assert.ok(c.pos[1] > 0 && c.pos[1] < 0.3 * p.scale, `${t} settled at ${c.pos[1].toFixed(3)}`);
  }
});

test('the starter car holds a full-throttle hairpin without spinning out', () => {
  const {upright} = run('starter', 120 * 8, i => ({throttle: 1, steer: i > 240 ? 1 : 0}));
  assert.ok(upright, 'stays on its wheels');
});

test("the dark world's dinosaur mount drives upright, rides on its springs and keeps a kid pace", () => {
  const w = flat(),
    p = mountParams(),
    c = createCar(p, [0, 0.8, 0], 0);
  let top = 0,
    upright = true;
  for (let i = 0; i < 120 * 10; i++) {
    stepCar(c, {throttle: 1, steer: i > 600 ? 0.5 : 0}, w, 1 / 120);
    top = Math.max(top, Math.hypot(c.vel[0], c.vel[2]));
    if (1 - 2 * (c.q[0] * c.q[0] + c.q[2] * c.q[2]) < 0.3) upright = false;
  }
  assert.ok(upright, 'stays upright through a full-throttle turn');
  assert.ok(top > 10 && top < 14, `top ${top.toFixed(1)} m/s`);
  assert.ok((p.mass * 9.81) / 4 / p.spring < p.restLength * 0.8, 'sag within travel');
  assert.ok(p.size[2] > legendCarParams('starter').size[2] * 2.2, 'about twice and a half the car');
});
