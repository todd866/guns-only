import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {
  CANYON_RUN,
  canyonGates,
  canyonArrival,
  canyonRunAltitude,
  canyonMedal,
  createCanyonRun,
  stepCanyonRun,
  stopCanyonRun
} from './canyon-run.mjs';
import {createCanyonRunVisual} from './canyon-run.js';
import {canyonPoint, centreNear, canyonDepth, CANYON_LENGTH} from './canyon.mjs';
import {elevationAt} from './elevation.mjs';
import {createCar} from '../physics/car.mjs';
import {createFlight, stepFlight, FLIGHT} from '../physics/flight.mjs';
import {rotate, yawOf} from '../physics/math.mjs';
import {createCloudField, updateCloudField, cloudLift} from './clouds.mjs';
const terrain = JSON.parse(
  fs.readFileSync(new URL('../assets/world/playable-terrain.json', import.meta.url))
);
const heightAt = (x, z) => elevationAt(terrain, x, z);
const segment = (g, across = 0) => ({
  prevPos: [g.x - g.nx * 2 + g.nz * across, g.y, g.z - g.nz * 2 - g.nx * across],
  pos: [g.x + g.nx * 2 + g.nz * across, g.y, g.z + g.nz * 2 - g.nx * across],
  flightMode: 'fly'
});

test('ten complete gates clear actual terrain, GCAS floor and rim along the full valley', () => {
  for (const mode of ['kid', 'bigKid']) {
    const gates = canyonGates({heightAt, mode});
    assert.equal(gates.length, 10);
    assert.ok(gates[0].along > CANYON_LENGTH - 200);
    assert.ok(gates.at(-1).along < 200);
    for (const g of gates) {
      assert.equal(g.radius, mode === 'kid' ? 10 : 7);
      const rim = g.floor + canyonDepth(g.x, g.z);
      for (let j = 0; j < 32; j++) {
        const a = (j * Math.PI) / 16,
          r = g.radius * 1.055,
          x = g.x + g.nz * Math.cos(a) * r,
          z = g.z - g.nx * Math.cos(a) * r,
          y = g.y + Math.sin(a) * r;
        assert.ok(y > heightAt(x, z) + FLIGHT.gcas.floor, 'whole torus clears GCAS');
        assert.ok(y < rim, 'whole torus below true rim');
      }
    }
  }
  assert.equal(CANYON_RUN.location.game, 'canyon-run');
  const arrival = canyonArrival(heightAt),
    first = canyonGates({heightAt})[0];
  assert.equal(arrival.pos[1], heightAt(arrival.pos[0], arrival.pos[2]));
  const dx = first.x - arrival.pos[0],
    dz = first.z - arrival.pos[2];
  assert.ok(dx * Math.sin(arrival.yaw) - dz * Math.cos(arrival.yaw) > 20, 'arrival faces gate one');
});
test('ordered gates start, miss without failure, finish, replay and retain best', () => {
  const st = createCanyonRun({heightAt}),
    start = segment(st.gates[0]);
  assert.equal(stepCanyonRun(st, segment(st.gates[0], 12), 1).length, 0);
  assert.equal(stepCanyonRun(st, {...start, prevPos: start.pos, pos: start.prevPos}, 1).length, 0);
  assert.ok(stepCanyonRun(st, start, 1)[0].start);
  assert.equal(st.next, 1);
  stepCanyonRun(st, segment(st.gates[1], 12), 5);
  assert.equal(st.next, 1);
  assert.ok(st.active);
  stepCanyonRun(st, {...segment(st.gates[1]), flightMode: 'chute'}, 5);
  assert.equal(st.next, 1);
  assert.ok(st.elapsed >= 10);
  for (let i = 1; i < 10; i++) {
    const e = stepCanyonRun(st, segment(st.gates[i]), 10);
    assert.equal(st.next, i + 1);
    if (i < 9) assert.equal(e[0].gate, i + 1);
    else assert.ok(e[0].done);
  }
  const best = st.best;
  stopCanyonRun(st);
  assert.equal(st.next, 0);
  assert.equal(st.elapsed, 0);
  assert.equal(st.best, best);
  assert.ok(stepCanyonRun(st, start, 1)[0].start);
  for (let i = 1; i < 10; i++) stepCanyonRun(st, segment(st.gates[i]), 30);
  assert.equal(st.best, best);
  for (const [medal, multiplier] of Object.entries(CANYON_RUN.medals))
    assert.equal(canyonMedal(CANYON_RUN.referenceTime * multiplier), medal);
  assert.equal(canyonMedal(9999), 'bronze');
});
test('ground arrival prompts return, takeoff starts, high overflight does not', () => {
  const st = createCanyonRun({heightAt}),
    g = st.gates[0],
    pos = [g.x, g.floor + 0.5, g.z];
  assert.ok(stepCanyonRun(st, {pos}, 0.1)[0].prepare);
  assert.equal(stepCanyonRun(st, {pos}, 0.1).length, 0);
  pos[1] = g.y - g.radius + 1;
  assert.ok(stepCanyonRun(st, {pos, flightMode: 'fly'}, 0.1)[0].start);
  stopCanyonRun(st);
  const high = segment(g);
  high.prevPos[1] += 100;
  high.pos[1] += 100;
  assert.equal(stepCanyonRun(st, high, 1).length, 0);
});
// Exact vertical safety rays, sampled movement rays with bisection on terrain hits. The pilot
// gets no position corrections: its only commands are normal flight controls plus rising air.
const world = {
  raycast(o, d, reach) {
    if (d[0] === 0 && d[2] === 0) {
      const dist = (heightAt(o[0], o[2]) - o[1]) / d[1];
      return dist >= 0 && dist <= reach ? {dist, normal: [0, 1, 0]} : null;
    }
    const clearance = t => o[1] + d[1] * t - heightAt(o[0] + d[0] * t, o[2] + d[2] * t);
    if (clearance(reach) > 0) return null;
    let lo = 0,
      hi = reach;
    for (let j = 0; j < 12; j++) {
      const mid = (lo + hi) / 2;
      if (clearance(mid) > 0) lo = mid;
      else hi = mid;
    }
    return {dist: hi, normal: [0, 1, 0]};
  }
};
const clamp = x => Math.max(-1, Math.min(1, x));
function flyCourse(mode) {
  const st = createCanyonRun({heightAt, mode}),
    f = createFlight(),
    clouds = createCloudField(heightAt);
  const start = canyonPoint(CANYON_RUN.firstAlong + 30),
    next = canyonPoint(start.along - 2);
  const car = createCar(
    undefined,
    [start.x, heightAt(start.x, start.z) + canyonRunAltitude(start.along), start.z],
    Math.atan2(next.x - start.x, -(next.z - start.z))
  );
  f.mode = 'fly';
  f.speed = 22;
  f.climb = 0;
  const dt = 1 / 120;
  let passed = 0;
  for (let tick = 0; tick < 240 * 120; tick++) {
    const near = centreNear(car.pos[0], car.pos[2]),
      target = canyonPoint(near.along - 22),
      dx = target.x - car.pos[0],
      dz = target.z - car.pos[2];
    const yaw = Math.atan2(dx, -dz),
      heading = yawOf(car.q),
      turn = Math.atan2(Math.sin(yaw - heading), Math.cos(yaw - heading));
    const dy = heightAt(target.x, target.z) + canyonRunAltitude(target.along) - car.pos[1],
      pitch = Math.atan2(dy, Math.hypot(dx, dz)),
      nose = rotate(car.q, [0, 0, -1]);
    const previous = [...car.pos];
    updateCloudField(clouds, dt);
    stepFlight(
      f,
      car,
      {
        assist: true,
        yaw: clamp(turn * 3),
        roll: clamp((rotate(car.q, [1, 0, 0])[1] + clamp(turn) * 0.65) * 4),
        pitch: clamp((pitch - Math.asin(nose[1])) * 3),
        lift: cloudLift(clouds, car.pos)
      },
      world,
      dt
    );
    assert.equal(f.mode, 'fly', 'pilot never hits or lands');
    assert.ok(car.pos[1] > heightAt(car.pos[0], car.pos[2]) + FLIGHT.gcas.floor, 'GCAS clearance');
    assert.ok(
      near.d < 22,
      `follows valley: tick ${tick} d=${near.d} next=${st.next} yaw=${yaw} heading=${heading} turn=${turn}`
    );
    const events = stepCanyonRun(st, {pos: car.pos, prevPos: previous, flightMode: f.mode}, dt);
    for (const e of events) {
      if (e.start || e.gate) passed++;
      if (e.done) {
        passed++;
        return {time: e.time, passed};
      }
    }
  }
  assert.fail(`pilot missed gate ${st.next + 1} at ${car.pos}`);
}
test('real stepFlight with assist flies all ten gates at normal power with rising air', t => {
  for (const mode of ['kid', 'bigKid']) {
    const r = flyCourse(mode);
    assert.equal(r.passed, 10);
    t.diagnostic(`${mode} scripted pilot: ${r.time.toFixed(3)}s`);
    assert.ok(Math.abs(r.time - CANYON_RUN.referenceTime) < 1, 'medals use measured pilot time');
  }
});
test('one instanced gate mesh visible before start, hides in races and disposes', () => {
  const scene = new T.Scene(),
    view = createCanyonRunVisual(scene, heightAt),
    root = scene.children[0],
    mesh = root.children[0];
  assert.ok(mesh.isInstancedMesh);
  assert.equal(root.children.length, 1);
  assert.equal(mesh.count, 10);
  assert.equal(root.visible, false);
  view.frame(true, 'kid');
  assert.equal(root.visible, true);
  const matrix = new T.Matrix4();
  mesh.getMatrixAt(0, matrix);
  assert.ok(matrix.determinant() > 0);
  view.step(1, segment(view.state.gates[0]));
  assert.ok(view.state.active);
  mesh.getMatrixAt(0, matrix);
  assert.equal(matrix.determinant(), 0);
  view.frame(false);
  assert.equal(root.visible, false);
  assert.equal(view.state.active, false);
  view.frame(true, 'bigKid');
  assert.equal(view.state.gates[0].radius, 7);
  const disposed = new Set();
  for (const r of [mesh, mesh.geometry, mesh.material]) r.addEventListener('dispose', () => disposed.add(r));
  view.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed.size, 3);
});

test('a missed gate never blocks the run: flying through a later gate moves on to it', () => {
  const st = createCanyonRun({heightAt});
  assert.ok(stepCanyonRun(st, segment(st.gates[0]), 1)[0].start);
  // Miss gates 1 and 2, fly through gate 3: the run continues from gate 4.
  const e = stepCanyonRun(st, segment(st.gates[3]), 10);
  assert.equal(st.next, 4);
  assert.equal(e[0].gate, 4);
  for (let i = 4; i < 10; i++) stepCanyonRun(st, segment(st.gates[i]), 10);
  assert.equal(st.active, false);
  assert.ok(st.best > 0);
});
