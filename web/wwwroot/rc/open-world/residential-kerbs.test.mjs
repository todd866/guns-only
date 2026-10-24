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
  assert.equal(k.dimensions.slope, 0.65);
  assert.equal(k.dimensions.sidewalk, 1.45);
  assert.equal(k.quads.length, 18);
  assert.deepEqual(kerbBounds(k), [-12.25, -7.25, 12.25, 7.25]);
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
  const profile = k.quads.slice(0, 8).map(q => q[2][1]);
  assert.ok(profile.some(y => y > 0.02) && profile.some(y => y < 0.025), 'smoothstep roll has intermediate stations');
});

function driveAcross(yaw, z, x = 0, steer = 0, throttle = 0.25, steps = 360, initialSpeed = 0) {
  const world = flatWorld();
  createRolledKerb([-6, 0], [6, 0], { side: 'both' }).addCollision(world);
  const car = createCar(undefined, [x, rideHeight(), z], yaw);
  if (initialSpeed) car.vel = [Math.sin(yaw) * initialSpeed, 0, -Math.cos(yaw) * initialSpeed];
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
  const forward = driveAcross(Math.PI, -2.1, 0, 0, 0.10, 600);
  const reverse = driveAcross(0, 8.5, 0, 0, 0.10, 600);
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

test('straight and oblique kerb approaches remain finite across RC speed bands', () => {
  // Throttle bands approximate 2, 5, and 8 m/s approach speeds while the car is
  // still allowed to settle naturally on the far verge. Both directions exercise
  // the up-roll and down-roll faces; the diagonal cases exercise the hip-like edge.
  for (const [label, throttle, steps, initialSpeed] of [['2m/s', .04, 720, 2], ['5m/s', .14, 600, 5], ['8m/s', .55, 480, 8]]) {
    for (const [yaw, z, x, steer] of [[Math.PI, -2.1, 0, 0], [0, 8.5, 0, 0], [Math.PI - .22, -2.1, -2, 0]]) {
      const result = driveAcross(yaw, z, x, steer, throttle, steps, initialSpeed);
      assert.ok(result.car.pos.every(Number.isFinite), `${label} ${yaw} finite`);
      assert.ok(result.peakImpact < 5, `${label} ${yaw} impact ${result.peakImpact}`);
      assert.ok(yaw===0 ? result.car.pos[2]<0 : result.car.pos[2]>6.75, `${label} crosses to intended side`);
      const dx=result.car.pos[0]-x,dz=result.car.pos[2]-z;
      assert.ok(Math.abs(dx*Math.cos(yaw)+dz*Math.sin(yaw))<2.5, `${label} bounded sideways deflection`);
      assert.ok(result.car.speed < 14, `${label} ${yaw} speed ${result.car.speed}`);
    }
  }
});
