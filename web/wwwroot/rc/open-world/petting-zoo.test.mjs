import test from 'node:test';
import assert from 'node:assert/strict';
import { ZOO, ZOO_JETS, OLD_DISPLAY_CUT, createZooState, stepZoo } from './petting-zoo.mjs';

test('each jet tells its fact once per visit, and again on the next visit', () => {
  const z = createZooState(), told = [];
  for (let t = 0; t < 40; t += .1) {
    const x = -1410 + t * 2.5;   // drive along the noses
    told.push(...stepZoo(z, [x, 0, 2036], t).filter(e => e.text && e.zoo !== 'sign').map(e => e.zoo));
  }
  assert.deepEqual(told, ZOO_JETS.map(j => j.type));
  stepZoo(z, [0, 0, 0], 100);   // drive away; a while later it's a new visit
  stepZoo(z, [0, 0, 0], 130);
  assert.ok(stepZoo(z, [ZOO_JETS[0].at[0], 0, ZOO_JETS[0].at[1] + 10], 131).some(e => e.zoo === 'MiG-21'));
});

test('jets wake when you come close and sleep when you leave', () => {
  const z = createZooState(), [x, zz] = ZOO_JETS[1].at;
  stepZoo(z, [x, 0, zz + ZOO.wake + 5], 0); assert.equal(z.awake.get('MiG-23'), false);
  stepZoo(z, [x, 0, zz + 10], 1); assert.equal(z.awake.get('MiG-23'), true);
  stepZoo(z, [x + 500, 0, zz], 2); assert.equal(z.awake.get('MiG-23'), undefined);
});

test('every jet stands inside the old display cut, and facts are short enough for a callout', () => {
  const [x0, z0, x1, z1] = OLD_DISPLAY_CUT;
  for (const j of ZOO_JETS) { assert.ok(j.at[0] > x0 && j.at[0] < x1 && j.at[1] > z0 && j.at[1] < z1); assert.ok(j.fact.length < 120, j.fact); }
});
