// THPS-style bowl riding. These fail while the car bonks off faceted transitions
// and a canned hop replaces the launch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {courseFromGlb} from './district.mjs';
import {createSession, stepSession} from './session.mjs';
import {createCar, placeCar, rideHeight, carUp, stepCar} from './car.mjs';
import {createAssist, assistInput} from './assists.mjs';
import {vehicleParams} from './vehicles.mjs';
import {bankPoint, bankLocal} from '../open-world/park-lines.mjs';
import {createWorld, sealTransitionNormals, SURFACES} from './world.mjs';
import {vertCamera} from './vert-camera.mjs';
import {setSkateRails} from './grind.mjs';
import {createSkate, stepSkate} from './skate.mjs';
import {dot} from './math.mjs';

const course = courseFromGlb(fs.readFileSync(new URL('../assets/districts/skatepark.glb', import.meta.url)));
const dt = 1 / 120;
const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * (180 / Math.PI);

function dropInBowl(kind) {
  const params = vehicleParams(kind);
  const s = createSession(course, {mode: 'kid', params});
  s.roam = true;
  const p = bankPoint(11.6, 10.25);
  const ground = course.world.raycast([p[0], 4, p[2]], [0, -1, 0], 8);
  const ahead = bankPoint(11.6, 6.5);
  const yaw = Math.atan2(ahead[0] - p[0], -(ahead[2] - p[2]));
  p[1] = ground.point[1] + rideHeight(params) + 0.02;
  placeCar(s.car, p, yaw);
  let minAlign = 1,
    peak = p[1],
    launch = null,
    landing = null,
    air = 0,
    minClimb = 99,
    prevGround = true,
    armedNormal = [0, 1, 0];
  const takeoffSide = 10.25;
  for (let frame = 0; frame < 5 * 120; frame++) {
    const wheels = s.car.wheels.filter(w => w.contact && w.contactNormal && w.surface === 'bowl');
    if (wheels.length >= 2) {
      const n = wheels.reduce((sum, w) => [sum[0] + w.contactNormal[0], sum[1] + w.contactNormal[1], sum[2] + w.contactNormal[2]], [0, 0, 0]);
      const nl = Math.hypot(...n) || 1;
      armedNormal = [n[0] / nl, n[1] / nl, n[2] / nl];
      minAlign = Math.min(minAlign, dot(carUp(s.car), armedNormal));
      if (!launch) minClimb = Math.min(minClimb, s.car.speed);
    }
    stepSession(s, {throttle: 1, steer: 0}, dt);
    peak = Math.max(peak, s.car.pos[1]);
    assert.ok(s.car.pos[1] > -0.05, `${kind} fell out of the bowl at ${s.car.pos[1]}`);
    if (prevGround && !s.car.grounded && !launch) {
      const horiz = Math.hypot(armedNormal[0], armedNormal[2]) || 1;
      const across = (s.car.vel[0] * armedNormal[0] + s.car.vel[2] * armedNormal[2]) / horiz;
      launch = {
        y: s.car.pos[1],
        across,
        vert: !!s.assist.quarter?.arc?.vert,
        side: bankLocal(s.car.pos)[1] < takeoffSide ? 'south' : 'north',
        v: bankLocal(s.car.pos)[1]
      };
    }
    if (!s.car.grounded) air++;
    else if (launch && !landing && air > 20 && s.car.contacts >= 2) {
      landing = {at: bankLocal(s.car.pos), up: carUp(s.car)[1], y: s.car.pos[1], speed: s.car.speed};
      break;
    } else air = 0;
    prevGround = s.car.grounded;
  }
  return {s, minAlign, peak, launch, landing, minClimb};
}

for (const kind of ['buggy', 'board'])
  test(`${kind} dropped in the hub bowl with throttle reaches the lip and stays on the transition`, () => {
    const {s, minAlign, peak, minClimb} = dropInBowl(kind);
    assert.ok(peak > 1.35, `${kind} exits the bowl floor within 5 s (peak ${peak})`);
    assert.ok(minAlign > 0.8, `${kind} wheels stay on the curve (alignment ${minAlign})`);
    assert.ok(minClimb > 2, `${kind} does not stall on the way up (${minClimb})`);
    assert.equal(s.hits, 0);
    assert.equal(s.recoveries, 0);
  });

test('a vert air at the coping goes straight up and lands back in the same bowl', () => {
  const {launch, landing} = dropInBowl('buggy');
  assert.ok(launch, 'leaves the transition');
  assert.equal(launch.vert, true, 'coping launch is a vert air');
  assert.ok(Math.abs(launch.across) < 0.35, `across-ramp speed is zeroed (${launch.across})`);
  assert.ok(landing, 'comes back down');
  const side = landing.at[1] < 10.25 ? 'south' : 'north';
  assert.equal(side, launch.side, `lands on the same wall (${launch.v} -> ${landing.at[1]})`);
  assert.ok(landing.at[0] > 7.8 && landing.at[0] < 15.4 && landing.at[1] > 6.7 && landing.at[1] < 13.8);
  assert.ok(landing.up > 0.8 && landing.speed > 2, `wheels down with speed (${landing.up}, ${landing.speed})`);
});

test('flat-to-transition seam normals agree, so the seam does not kick', () => {
  const world = createWorld(2);
  const rise = Math.tan((40 * Math.PI) / 180);
  world.addQuad([-2, 0, -4], [-2, 0, 0], [2, 0, 0], [2, 0, -4], 'concrete');
  world.addQuad([-2, 0, 0], [-2, 2 * rise, 2], [2, 2 * rise, 2], [2, 0, 0], 'bowl');
  sealTransitionNormals(world);
  const flat = world.raycast([0, 2, -0.02], [0, -1, 0], 4);
  const slope = world.raycast([0, 2, 0.02], [0, -1, 0], 4);
  assert.ok(flat && slope);
  assert.ok(angle(flat.normal, slope.normal) < 12, `seam normals ${angle(flat.normal, slope.normal).toFixed(1)}°`);
  assert.equal(SURFACES.bowl.roll, 0);
  assert.equal(SURFACES.quarter.roll, 0);
});

test('re-entry within 45° keeps speed; past that is a short bail and not a wedge', () => {
  const world = createWorld(2);
  const slope = (50 * Math.PI) / 180;
  const rise = Math.tan(slope);
  // High edge at +z, deck faces up and back down the slope.
  world.addQuad([-4, 0, 0], [-4, 3 * rise, 3], [4, 3 * rise, 3], [4, 0, 0], 'bowl');
  world.addQuad([-4, 0, -3], [-4, 0, 0], [4, 0, 0], [4, 0, -3], 'concrete');
  sealTransitionNormals(world);
  const session = (tilt, speed) => {
    const s = createSession(
      {world, checkpoints: [[0, 0], [0, -8]], secrets: [], start: {pos: [0, 1, 1], yaw: 0}},
      {mode: 'kid'}
    );
    s.roam = true;
    placeCar(s.car, [0, 2.6, 1.5], 0);
    s.car.vel = [0, -1, -speed];
    s.car.q = [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)];
    return s;
  };
  // Matched to the ramp: the deck is within 45° of the surface.
  const good = session(-slope, 4);
  const before = Math.hypot(good.car.vel[0], good.car.vel[2]);
  for (let i = 0; i < 40; i++) stepSession(good, {throttle: 1, steer: 0}, dt);
  const after = Math.hypot(good.car.vel[0], good.car.vel[2]);
  assert.ok(after > before * 0.7, `snap keeps speed ${before} -> ${after}`);
  assert.ok(good.car.pos[1] > 0.05, 'stays on the ramp');
  assert.equal(good.assist.quarter?.bailed ?? false, false);

  const bad = session(0.9, 3);
  let moved = 0;
  const start = [...bad.car.pos];
  for (let i = 0; i < 90; i++) {
    stepSession(bad, {throttle: 1, steer: 0}, dt);
    assert.ok(bad.car.pos[1] > -0.3, `bail does not fall through (${bad.car.pos[1]})`);
  }
  moved = Math.hypot(bad.car.pos[0] - start[0], bad.car.pos[2] - start[2]);
  assert.ok(bad.assist.quarter?.bailed, 'a steep re-entry bails');
  assert.ok(bad.car.pos[1] > 0 && (moved > 0.3 || bad.car.speed > 0.8), `not stuck (${moved}, ${bad.car.speed})`);
  assert.equal(bad.recoveries, 0);
});

test('the chase camera rises and pitches on a vert wall', () => {
  const flat = vertCamera({upY: 1, onWall: false, vert: false});
  const wall = vertCamera({upY: 0.2, onWall: true, vert: false});
  const air = vertCamera({upY: 0.9, onWall: false, vert: true});
  assert.equal(flat.rise, 0);
  assert.ok(wall.rise > 0.8 && wall.pitch > 0.3, `wall camera ${wall.rise}, ${wall.pitch}`);
  assert.ok(air.rise > wall.rise * 0.9 && air.pitch > 0.3, 'vert air lifts the view');
});

test('a coping grind snaps on with a balance meter', () => {
  const world = createWorld(4);
  world.addQuad([-8, 0, -8], [-8, 0, 8], [8, 0, 8], [8, 0, -8], 'concrete');
  const park = {
    id: 'lip',
    rails: [{id: 'lip', kind: 'coping', pts: [[0, 0, 0.4], [0, -6, 0.4]]}],
    gaps: [],
    letters: [],
    goals: []
  };
  const s = createSession(
    {world, checkpoints: [[0, 0], [0, -10]], secrets: [], start: {pos: [0.6, 0.5, -1], yaw: 0.7}},
    {mode: 'kid'}
  );
  s.roam = true;
  setSkateRails(s, park, p => [p[0], p[2], p[1]]);
  const sk = createSkate(park);
  placeCar(s.car, [0.6, 0.7, -1], 0.7);
  s.car.vel = [0.35, -0.2, -3.2];
  let balance = null;
  for (let i = 0; i < 40; i++) {
    const input = {throttle: 1, steer: 0};
    stepSession(s, input, dt);
    stepSkate(sk, s, input, dt, p => [p[0], p[2], p[1]]);
    if (sk.balance) balance = sk.balance;
  }
  assert.ok(s.skateRide.active, 'loose lineup still snaps onto the coping');
  assert.equal(balance?.kind, 'grind');
  assert.ok(Math.abs(balance.value) < 1);
});

test('pump adds speed down a transition and throttle does not die on the way up', () => {
  const world = createWorld(2);
  const slope = (32 * Math.PI) / 180;
  const rise = Math.tan(slope);
  world.addQuad([-3, 0, 0], [-3, 4 * rise, 4], [3, 4 * rise, 4], [3, 0, 0], 'bowl');
  sealTransitionNormals(world);
  const ride = throttle => {
    const car = createCar(undefined, [0, 4 * rise * 0.8 + rideHeight(), 3.2], 0);
    const assist = createAssist('kid');
    const tilt = -slope;
    car.q = [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)];
    car.vel = [0, -1.2, -3];
    let speed = 0;
    for (let i = 0; i < 50; i++) {
      const input = assistInput(assist, car, {throttle, steer: 0}, dt, world);
      stepCar(car, input, world, dt);
      speed = car.speed;
    }
    return speed;
  };
  const coast = ride(0);
  const pumped = ride(1);
  assert.ok(pumped > coast + 0.35, `pump ${pumped} vs coast ${coast}`);
});
