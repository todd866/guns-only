import test from 'node:test';
import assert from 'node:assert/strict';
import { createRolledKerb, kerbBounds, RESIDENTIAL_KERB } from './residential-kerbs.mjs';
import { createWorld } from '../physics/world.mjs';
import { createCar, rideHeight, stepCar } from '../physics/car.mjs';

function flatWorld() {
  const world = createWorld();
  world.addQuad([-100, 0, -100], [-100, 0, 100], [100, 0, 100], [100, 0, -100], 'asphalt');
  return world;
}

test('rolled kerb has explicit RC-scale dimensions and traversable upward faces', () => {
  const k = createRolledKerb([-5, 0], [5, 0], { side: 'both' });
  assert.equal(k.dimensions.rise, 0.10);
  assert.equal(k.dimensions.slope, 0.40);
  assert.equal(k.dimensions.sidewalk, 1.45);
  assert.equal(k.quads.length, 6);
  assert.deepEqual(kerbBounds(k), [-11.75, -6.75, 11.75, 6.75]);
  for (const q of k.quads) {
    const ax = q[1][0] - q[0][0], az = q[1][2] - q[0][2];
    const bx = q[2][0] - q[0][0], bz = q[2][2] - q[0][2];
    assert.ok(az * bx - ax * bz >= 0, 'visual quad faces upward');
  }
  const world = flatWorld(); k.addCollision(world);
  const street = world.raycast([0, 0.25, -4.9], [0, -1, 0], 1);
  const grass = world.raycast([0, 0.25, 4.9], [0, -1, 0], 1);
  assert.ok(street && grass, 'both approaches expose a downward wheel surface');
  assert.ok(street.point[1] >= 0 && grass.point[1] >= 0);
});

function driveAcross(yaw, z, x = 0, steer = 0, throttle = 0.25, steps = 360) {
  const world = flatWorld();
  createRolledKerb([-6, 0], [6, 0], { side: 'both' }).addCollision(world);
  const car = createCar(undefined, [x, rideHeight(), z], yaw);
  let peakImpact = 0, maxSpeed = 0;
  for (let i = 0; i < steps; i++) {
    stepCar(car, { throttle: throttle, steer }, world, 1 / 120);
    peakImpact = Math.max(peakImpact, car.wallImpact || 0);
    maxSpeed = Math.max(maxSpeed, car.speed);
  }
  return { car, peakImpact, maxSpeed };
}

test('RC car crosses rolled kerb from street and grass without a wall hit', () => {
  // The kerb runs x=-6..6 and its grass-side crest ends at z=+6.75.
  // Starts are inside the road and outside the sidewalk respectively, so a
  // passing endpoint cannot satisfy either assertion.
  const forward = driveAcross(Math.PI, -2.1, 0, 0, 0.20);
  const reverse = driveAcross(0, 8.5, 0, 0, 0.20);
  for (const result of [forward, reverse]) {
    assert.ok(result.car.pos.every(Number.isFinite));
    assert.ok(result.car.grounded, 'car remains supported after crossing');
    assert.ok(result.peakImpact < 3, `rolled profile should not behave like an impassable wall (${result.peakImpact})`);
    assert.ok(result.maxSpeed < 6, `approach stays low speed (${result.maxSpeed})`);
  }
  assert.ok(forward.car.pos[2] > 6.75, 'street approach crosses the sidewalk crest');
  assert.ok(reverse.car.pos[2] < 0, 'grass approach returns across the kerb into the street');
});

test('oblique low-speed crossing remains driveable', () => {
  const result = driveAcross(Math.PI - 0.22, -2.1, -2.0, 0, 0.20, 420);
  assert.ok(result.car.pos.every(Number.isFinite));
  assert.ok(result.car.pos[2] > 6.75, 'oblique path crosses the crest');
  assert.ok(Math.abs(result.car.pos[0]) < 6, 'oblique path crosses within the kerb segment');
  assert.ok(result.peakImpact < 4, 'oblique crossing does not catch on a vertical face');
  assert.equal(RESIDENTIAL_KERB.rise, 0.10);
});

test('faster diagonal crossing clears the kerb and lands on the far verge',()=>{
 const result=driveAcross(Math.PI-.18,-2.1,-2,0,.8,360);
 assert.ok(result.car.pos.every(Number.isFinite));
 assert.ok(result.car.pos[2]>6.75,'crosses the full raised sidewalk');
 assert.ok(result.maxSpeed>6,'exercises faster driving');
 assert.ok(result.peakImpact<4,'no vertical-wall collision');
 assert.ok(result.car.grounded,'lands back on the far verge');
});
