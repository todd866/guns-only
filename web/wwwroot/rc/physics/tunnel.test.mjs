import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createCar, stepCar } from './car.mjs';
import { vehicleParams } from './vehicles.mjs';

// Owner, 31 Oct: the car ended up under the terrain, especially at boost. One step at speed must
// never carry it through the ground (physics/car.mjs, sweep).
const ground = (x, z, slope) => Math.max(0, (z - 20) * slope);
function hill(slope) {
  const w = createWorld(4);
  for (let x = -20; x < 20; x += 2) for (let z = -40; z < 80; z += 2) {
    const P = (a, b) => [a, ground(a, b, slope), b];
    w.addQuad(P(x, z), P(x, z + 2), P(x + 2, z + 2), P(x + 2, z), 'grass');
  }
  return w;
}

test('at boost speed into a steep rise, the car rides up it, never through it', () => {
  for (const slope of [.4, .7]) {
    const w = hill(slope), car = createCar(vehicleParams('buggy'), [0, .15, -10], Math.PI);   // facing +z, up the hill
    car.vel = [0, 0, 30];
    for (let i = 0; i < 240; i++) {
      stepCar(car, { throttle: 1, boost: 1.8 }, w, 1 / 120);
      assert.ok(car.pos[1] > ground(car.pos[0], car.pos[2], slope) - .02, `slope ${slope} step ${i}: ${car.pos.map(v => v.toFixed(2))} under ${ground(car.pos[0], car.pos[2], slope).toFixed(2)}`);
    }
  }
});

test('a hard drop onto the ground lands on it, not through it', () => {
  const w = hill(0), car = createCar(vehicleParams('buggy'), [0, 3, 0], 0);
  car.vel = [0, -25, 0];
  for (let i = 0; i < 120; i++) { stepCar(car, {}, w, 1 / 120); assert.ok(car.pos[1] > -.02, `step ${i}: y ${car.pos[1].toFixed(3)}`); }
});
