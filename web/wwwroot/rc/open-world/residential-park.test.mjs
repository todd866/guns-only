import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import { prepareResidentialPark } from './residential-park.js';

const makeTerrain = () => ({
  heightAt: () => .25,
  conformTriangle(a, b, c) {
    return [[[a[0], a[1] + .25, a[2]], [b[0], b[1] + .25, b[2]], [c[0], c[1] + .25, c[2]]]];
  },
});

test('park context prepares collision before scene attachment and keeps furniture finite', () => {
  const collision = [];
  const world = { addTri: (...triangle) => collision.push(triangle) };
  const park = prepareResidentialPark(world, { roads: [{ kind: 'path' }] }, { terrain: makeTerrain() });
  assert.ok(collision.length > 300, 'court, hoops, benches and low edges join the world before attach');
  for (const [a, b, c] of collision) for (const point of [a, b, c]) assert.ok(point.every(Number.isFinite));
  const scene = new T.Scene();
  park.attach(scene);
  assert.equal(scene.children[0].name, 'ResidentialParkContext');
  assert.ok(scene.children[0].children.some(mesh => mesh.name === 'ResidentialPark_court'));
  park.dispose();
  assert.equal(scene.children.length, 0);
});

test('heightAt-only terrain still raises context surfaces and collisions', () => {
  const collision = [];
  const park = prepareResidentialPark({ addTri: (...triangle) => collision.push(triangle) }, { roads: [] }, { terrain: { heightAt: () => 1.75 } });
  assert.ok(collision.some(([a, b, c]) => [a, b, c].every(point => point[1] >= 1.74)));
  park.dispose();
});

test('vertical furniture bases follow a sloped residential grade', () => {
  const collision = [];
  const heightAt = (x, z) => .012 * x - .018 * z + .4;
  const park = prepareResidentialPark({ addTri: (...triangle) => collision.push(triangle) }, { roads: [] }, { terrain: { heightAt } });
  const basePoint = collision.flatMap(triangle => triangle).find(point => Math.abs(point[1] - heightAt(point[0], point[2])) < 1e-4);
  assert.ok(basePoint, 'a post or bench foot is anchored to the sampled grade');
  park.dispose();
});

