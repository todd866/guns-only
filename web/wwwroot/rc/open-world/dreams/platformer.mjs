// The platformer dream: one side-on course. Pure boxes, so the view can instance them.
// Gravity is light on purpose — the car still hops at FLIGHT.hop, and that hop has to clear
// a generous gap for a six-year-old. Falling never kills; it returns you to the last checkpoint.
import {FLIGHT} from '../../physics/flight.mjs';
import {ROBOT} from '../../physics/robot.mjs';

export const PLANE_Z = 0;
export const GRAVITY = 4.4;
const HOP = FLIGHT.hop;
const BOUNCE = 1.72;
export const POWER_S = 15;
export const PUFF_SCALE = 2.2;
const PUFF = PUFF_SCALE;
const SPRING_VY = 5.15;
const BRIDGE_S = 2.15;
const KILL_Y = -5;
const STEP = 0.16;
const FLOOR_H = 0.42;
const CAR = Object.freeze({w: 0.36, h: 0.2, speed: 1.58});
const BOT = Object.freeze({w: 0.18, h: 0.32, speed: 1.48});

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function buildCourse() {
  const tiles = [];
  let id = 0;
  const add = (kind, x, y, w, h, extra = {}) => {
    tiles.push(Object.freeze({id: id++, kind, x, y, w, h, ...extra}));
  };
  const floor = (x, w, y = 0) => add('block', x, y, w, FLOOR_H);
  const coin = (x, y) => add('coin', x, y, 0.36, 0.72);
  const mark = (x, y) => add('checkpoint', x, y, 0.7, 1.3);

  floor(0, 14);
  mark(1.1, 0.42);
  for (const x of [3.2, 5.6, 8.1, 11]) coin(x, 0.42);

  floor(15.05, 2.35);
  coin(15.7, 0.42);
  floor(18.5, 2.35);
  coin(19.1, 0.42);
  floor(21.95, 2.5);
  coin(22.6, 0.42);
  floor(25.55, 6.2);
  mark(26, 0.42);
  coin(29.2, 0.42);

  floor(32.05, 2.3, 0.46);
  floor(34.55, 2.3, 0.92);
  floor(37.05, 2.5, 1.38);
  floor(39.75, 5, 1.38);
  mark(40.1, 1.8);
  coin(42.4, 1.8);

  floor(44.75, 12);
  add('platform', 45.1, 1.8, 2.7, 0.24, {x2: 53.4, period: 3.8});
  coin(48.2, 2.2);
  mark(45.2, 0.42);

  floor(56.75, 4.9);
  add('spring', 60.15, 0.34, 1.2, 0.2);
  mark(57.1, 0.42);
  floor(62.4, 7.6, 1.62);
  mark(63.5, 2.04);
  coin(66.4, 2.04);

  floor(70, 12);
  add('bridge', 70.15, 1.82, 2.5, 0.22);
  add('bridge', 72.8, 1.82, 2.5, 0.22);
  add('bridge', 75.45, 1.82, 2.5, 0.22);
  floor(78.15, 4.6, 1.62);
  mark(78.5, 2.04);

  floor(82.75, 12.3);
  mark(83.2, 0.42);
  add('mushroom', 91.4, 0.42, 1.1, 1.25, {cap: 'bounce'});
  floor(96.3, 2.7, 1.28);
  coin(96.9, 1.7);
  floor(100.15, 3.5, 1.28);
  mark(100.5, 1.7);

  floor(103.65, 26);
  add('mushroom', 108.4, 0.42, 1.2, 1.25, {cap: 'puff'});
  for (const y of [0.42, 0.96, 1.5, 2.04, 2.58]) add('block', 111.5, y, 0.8, 0.54, {smash: true});
  coin(116.2, 0.42);
  coin(119.6, 0.42);
  coin(123, 0.42);
  mark(116.8, 0.42);
  add('flag', 127.2, 0.42, 0.9, 2.4);
  return Object.freeze(tiles);
}

export const COURSE = buildCourse();
export const coinTotal = () => COURSE.reduce((n, t) => n + (t.kind === 'coin' ? 1 : 0), 0);

const platformLeft = (tile, time) => {
  const u = 0.5 - 0.5 * Math.cos((Math.PI * 2 * Math.max(0, time)) / tile.period);
  return tile.x + (tile.x2 - tile.x) * u;
};

export function boxOf(tile, run) {
  const x = tile.kind === 'platform' ? platformLeft(tile, run.time) : tile.x;
  return {id: tile.id, kind: tile.kind, x, y: tile.y, w: tile.w, h: tile.h, top: tile.y + tile.h, smash: !!tile.smash};
}

const solidKind = tile =>
  tile.kind === 'block' || tile.kind === 'bridge' || tile.kind === 'spring' || tile.kind === 'platform';
const isSolid = (tile, run) => solidKind(tile) && !run.gone[tile.id];

export function solidBoxes(run) {
  return COURSE.filter(tile => isSolid(tile, run)).map(tile => boxOf(tile, run));
}

const specOf = form => (form === 'robot' ? BOT : CAR);

function fit(rider) {
  const spec = specOf(rider.form);
  const big = rider.power === 'puff' && rider.powerT > 0;
  rider.w = spec.w * (big ? PUFF : 1);
  rider.h = spec.h * (big ? PUFF : 1);
  return spec;
}

const bodyOf = rider => ({x: rider.x - rider.w / 2, y: rider.y, w: rider.w, h: rider.h});

function makeRider(form, i, spawn) {
  const spec = specOf(form);
  const x = spawn.x + i * 0.7;
  return {
    id: i,
    form: form === 'robot' ? 'robot' : 'car',
    x,
    y: spawn.y,
    z: PLANE_Z,
    vx: 0,
    vy: 0,
    w: spec.w,
    h: spec.h,
    grounded: false,
    power: null,
    powerT: 0,
    coins: 0,
    got: {},
    spawn: {x, y: spawn.y},
    check: null,
    goal: false,
    falls: 0,
    groundOn: null,
    held: false
  };
}

export function createPlatformerRun(forms = ['car']) {
  const start = COURSE.find(tile => tile.kind === 'checkpoint');
  const spawn = {x: start.x + start.w / 2, y: start.y + 0.04};
  return {
    time: 0,
    gone: {},
    bridge: {},
    riders: (Array.isArray(forms) ? forms : [forms]).map((form, i) => makeRider(form, i, spawn))
  };
}

function collect(run, rider) {
  const body = bodyOf(rider);
  for (const tile of COURSE) {
    if (run.gone[tile.id] || !hit(body, boxOf(tile, run))) continue;
    if (tile.kind === 'coin' && !rider.got[tile.id]) {
      rider.got[tile.id] = true;
      rider.coins++;
    } else if (tile.kind === 'mushroom') {
      rider.power = tile.cap;
      rider.powerT = POWER_S;
      fit(rider);
    } else if (tile.kind === 'checkpoint') {
      rider.spawn = {x: tile.x + tile.w / 2, y: tile.y + 0.04};
      rider.check = tile.id;
    } else if (tile.kind === 'flag') rider.goal = true;
  }
}

// One puff contact clears the whole stack, so a big toy punches through instead of shaving one brick.
function smash(run, rider) {
  const body = bodyOf(rider);
  for (const tile of COURSE) {
    if (tile.kind !== 'block' || !tile.smash || run.gone[tile.id]) continue;
    const box = boxOf(tile, run);
    const xOverlap = body.x < box.x + box.w && body.x + body.w > box.x;
    const yReach = box.y < body.y + body.h + 0.2 && box.top > body.y - 0.05;
    if (!xOverlap || !yReach) continue;
    for (const other of COURSE)
      if (other.smash && Math.abs(other.x - tile.x) < 0.2) run.gone[other.id] = true;
  }
}

function resolve(run, rider, dt) {
  rider.grounded = false;
  let ground = null;
  for (let n = 0; n < 6; n++) {
    const body = bodyOf(rider);
    let best = null;
    for (const tile of COURSE) {
      if (!isSolid(tile, run)) continue;
      const box = boxOf(tile, run);
      if (!hit(body, box)) continue;
      const pushLeft = body.x + body.w - box.x;
      const pushRight = box.x + box.w - body.x;
      const pushUp = box.top - body.y;
      const pushDown = body.y + body.h - box.y;
      let axis = Math.abs(pushLeft < pushRight ? pushLeft : pushRight) < Math.abs(pushUp < pushDown ? pushUp : -pushDown) ? 'x' : 'y';
      let push = axis === 'x' ? (pushLeft < pushRight ? -pushLeft : pushRight) : pushUp < pushDown ? pushUp : -pushDown;
      if (axis === 'x' && box.top <= rider.y + STEP && box.top > rider.y) {
        axis = 'y';
        push = box.top - rider.y;
      }
      const pen = Math.abs(push);
      if (!best || pen < best.pen) best = {pen, axis, push, box};
    }
    if (!best) break;
    if (best.axis === 'x') {
      rider.x += best.push;
      rider.vx = 0;
    } else {
      rider.y += best.push;
      if (best.push > 0) {
        rider.vy = 0;
        rider.grounded = true;
        ground = best.box;
      } else rider.vy = Math.min(0, rider.vy);
    }
  }
  rider.groundOn = rider.grounded && ground ? ground.id : null;
  if (ground?.kind === 'spring' && rider.grounded) {
    rider.vy = SPRING_VY;
    rider.grounded = false;
    rider.groundOn = null;
  } else if (ground?.kind === 'bridge' && rider.grounded) {
    run.bridge[ground.id] = (run.bridge[ground.id] || 0) + dt;
    if (run.bridge[ground.id] >= BRIDGE_S) run.gone[ground.id] = true;
  }
}

function respawn(rider) {
  rider.x = rider.spawn.x;
  rider.y = rider.spawn.y;
  rider.vx = 0;
  rider.vy = 0;
  rider.grounded = false;
  rider.groundOn = null;
  rider.falls++;
  rider.z = PLANE_Z;
}

function stepRider(run, rider, dt, input = {}) {
  const spec = fit(rider);
  rider.z = PLANE_Z;
  collect(run, rider);
  if (rider.power === 'puff') smash(run, rider);
  const move = Math.max(-1, Math.min(1, Number(input.move) || 0));
  rider.vx += (move * spec.speed - rider.vx) * Math.min(1, 14 * dt);
  if (input.jump && !rider.held && rider.grounded) {
    const hop = rider.form === 'robot' ? ROBOT.jump : HOP;
    rider.vy = rider.power === 'bounce' && rider.powerT > 0 ? hop * BOUNCE : hop;
    rider.grounded = false;
    rider.groundOn = null;
  }
  rider.held = !!input.jump;
  if (rider.groundOn != null) {
    const tile = COURSE[rider.groundOn];
    if (tile?.kind === 'platform') rider.x += platformLeft(tile, run.time) - platformLeft(tile, Math.max(0, run.time - dt));
  }
  rider.vy -= GRAVITY * dt;
  rider.x += rider.vx * dt;
  rider.y += rider.vy * dt;
  resolve(run, rider, dt);
  collect(run, rider);
  if (rider.power === 'puff') smash(run, rider);
  if (rider.y < KILL_Y && !rider.goal) respawn(rider);
  if (rider.power) {
    rider.powerT = Math.max(0, rider.powerT - dt);
    if (rider.powerT === 0) rider.power = null;
  }
  rider.z = PLANE_Z;
}

export function stepPlatformer(run, dt, input) {
  const inputs = Array.isArray(input) ? input : [input ?? {}];
  run.time += dt;
  run.riders.forEach((rider, i) => stepRider(run, rider, dt, inputs[i] ?? {}));
  return run;
}
