import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {computeResidentialYardPlacement, nearestResidentialRoad, prepareResidentialYards, selectResidentialYards} from './residential-yards.js';

const roads = [
  {kind: 'footpath', points: [[-20, 0], [20, 0]]},
  {kind: 'residential', points: [[-20, 12], [20, 12]]},
];
const house = {kind: 'house', points: [[-2, 2], [2, 2], [2, 5], [-2, 5]]};
const hit = nearestResidentialRoad([0, 3.5], roads);
assert.equal(hit.kind, 'residential', 'yard frontage ignores a nearby footpath');
const [candidate] = selectResidentialYards([house], roads);
assert.ok(candidate, 'house is a yard candidate');
const placement = computeResidentialYardPlacement(candidate);
assert.ok(placement, 'candidate has a usable frontage envelope');

// Along the house-to-road normal, the first planting surface starts beyond the
// house footprint and the mailbox remains inside the paved road edge.
const houseFront = Math.max(...house.points.map(([x, z]) => (x - candidate.centre[0]) * placement.front[0] + (z - candidate.centre[1]) * placement.front[1]));
assert.ok(placement.yardOrigin > houseFront, 'yard origin is outside the house');
assert.ok(placement.mailboxAlong + placement.yardOrigin < hit.d - placement.roadHalfWidth, 'mailbox stays off the road lane');
assert.ok(placement.roadHalfWidth >= 2.9, 'residential road clearance uses its real width');

const many = Array.from({length: 650}, (_, index) => ({kind: 'house', points: [[index * 5, 3], [index * 5 + 2, 3], [index * 5 + 2, 5], [index * 5, 5]]}));
const selected = selectResidentialYards(many, [{kind: 'residential', points: [[-10, 10], [4000, 10]]}], 300);
assert.ok(selected.length <= 300, 'yard selection respects draw budget');

// Regression test the actual Three attach lifecycle as well as the pure layout
// helpers: the former caught a stale orientation variable after paving moved
// back into residential-art.
const scene = new T.Scene();
const prepared = prepareResidentialYards(null, {buildings: [house], roads}, {terrain: {heightAt: () => 0}});
const attached = prepared.attach(scene);
assert.equal(attached, scene.children[0], 'yard root attaches to scene');
assert.ok(attached.children.length > 0, 'yard batches are emitted');
prepared.dispose();
assert.equal(scene.children.length, 0, 'dispose removes yard root');
assert.throws(() => prepared.attach(scene), /disposed/, 'disposed yards cannot attach again');
console.log('residential yards tests passed');
