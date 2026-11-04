import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMP,
  loadCamp,
  visit,
  give,
  returnGift,
  lineOk,
  createCamp,
  stepCamp,
  campPlacementOk,
  campOnLakeFloor,
  distToTownBox,
  FAMILY
} from './paiute-camp.mjs';
import {TOWN} from './spirit-mountain.mjs';
import {valleyFrame} from './spirit-mountain.mjs';
import {YARD} from './chickens.mjs';
import {WILD} from './herd.mjs';

test('the camp is on the level valley floor, clear of town, yard and wild homes', () => {
  assert.ok(campPlacementOk());
  const [cx, cz] = CAMP.centre;
  const {along, across} = valleyFrame(cx, cz);
  assert.ok(campOnLakeFloor(along, across), 'level valley floor');
  assert.ok(Math.min(...TOWN.map(b => distToTownBox(along, across, b))) > 25);
  assert.ok(Math.hypot(cx - YARD.centre[0], cz - YARD.centre[1]) > 25);
  for (const w of WILD) assert.ok(Math.hypot(cx - w.home[0], cz - w.home[2]) > 25);
});

test('five family toys each have a plain job', () => {
  assert.equal(FAMILY.length, 5);
  assert.deepEqual(
    FAMILY.map(f => f.job),
    ['weave', 'pit', 'grind', 'hoop', 'fire']
  );
});

test('lines stay kid-simple: no digits, gold or price', () => {
  const s = loadCamp({});
  const lines = [visit(s, () => 0)];
  for (let i = 0; i < 20; i++) lines.push(visit(s, () => (i * 0.13) % 1));
  for (const item of ['battery', 'parts', 'egg', 'fish']) lines.push(give(s, item));
  const gift = returnGift(s, () => 0.1);
  if (gift) lines.push(gift.line);
  for (const line of lines) assert.ok(lineOk(line), line);
});

test('first visit greets you by the fire', () => {
  const s = loadCamp({});
  assert.equal(visit(s), 'Come sit by the fire!');
});

test('gifts never return on the same visit you gave on', () => {
  const s = loadCamp({});
  visit(s);
  visit(s);
  give(s, 'battery');
  assert.equal(
    returnGift(s, () => 0),
    null
  );
  visit(s);
  const g = returnGift(s, () => 0.1);
  assert.ok(g?.line);
  assert.ok(lineOk(g.line));
});

test('the family loop runs without throwing', () => {
  const camp = createCamp();
  for (let t = 0; t < 40; t += 1 / 30) stepCamp(camp, 1 / 30);
  assert.ok(camp.t > 1);
});
