import test from 'node:test';
import assert from 'node:assert/strict';
import { createResidentialTerrain, validateResidentialTerrain } from './residential-terrain.mjs';
import {createWorld} from '../physics/world.mjs';
import {readFileSync} from 'node:fs';
import {RESIDENTIAL_BOUNDS} from './residential-frame.mjs';
import { createStream } from './stream.mjs';

const grid = { origin: [-10, -10], step: 10, cols: 3, rows: 3, heights: [0, 2, 4, 2, 4, 6, 4, 6, 8] };

test('residential terrain validates and bilinearly samples the anonymous grid', () => {
  validateResidentialTerrain(grid);
  const terrain = createResidentialTerrain(grid, { bounds: [-10, -10, 10, 10], edgeFeather: 0 });
  assert.equal(terrain.heightAt(0, 0), 4);
  assert.equal(terrain.heightAt(-5, -5), 2);
});

test('terrain fades to datum at the authored edge and keeps level pads at zero', () => {
  const terrain = createResidentialTerrain(grid, {
    bounds: [-10, -10, 10, 10], edgeFeather: 5, meshStep: 1,
    pads: [{ bounds: [-4, -4, 4, 4], feather: 25, datum: 0 }],
  });
  assert.equal(terrain.heightAt(0, 0), 0);
  assert.ok(Math.abs(terrain.heightAt(10, 0)) < 1e-9, 'edge is level with the wider world');
  assert.ok(terrain.heightAt(7, 0) > 0 && terrain.heightAt(7, 0) < terrain.rawHeightAt(7, 0), 'pad feather is smooth');
});

test('stream collision uses the residential authority instead of a flat zero fallback', () => {
  const terrain = createResidentialTerrain({ origin: [-10, -10], step: 10, cols: 2, rows: 2, heights: [2, 2, 2, 2] }, { bounds: [-10, -10, 0, 0], edgeFeather: 0 });
  const stream = createStream({ manifest: { tiles: [] }, fetchTile: async () => null, residentialTerrain: terrain });
  const hit = stream.world.raycast([ -5, 10, -5 ], [0, -1, 0], 20);
  assert.equal(hit.surface, 'grass');
  assert.equal(hit.point[1], 2);
  assert.ok(hit.normal[1] > .99, 'graded collision face points upward');
  const contacts = stream.world.sphereContacts([-5, 2.1, -5], .2);
  assert.ok(contacts.some(c => c.surface === 'grass'), 'car contact follows the same terrain height');
  stream.dispose();
});


test('real graded terrain queries and wheel faces agree away from mesh vertices', () => {
  const grid = JSON.parse(readFileSync(new URL('../assets/world/residential-terrain.json', import.meta.url)));
  const terrain = createResidentialTerrain(grid, {bounds: RESIDENTIAL_BOUNDS});
  const world = createWorld(16); let min = Infinity, max = -Infinity, slope = 0;
  for (const tri of terrain.triangles()) {
    world.addTri(...tri, 'grass');
    for (const p of tri) { min = Math.min(min,p[1]); max = Math.max(max,p[1]); }
  }
  assert.ok(max-min>18, 'retain the neighbourhood rise rather than flattening it');
  for (let i=0;i<300;i++) {
    const x=RESIDENTIAL_BOUNDS[0]+((i*137.371)%1189)+.2, z=RESIDENTIAL_BOUNDS[1]+((i*73.419)%1391)+.2;
    const hit=world.raycast([x,30,z],[0,-1,0],60);
    assert.ok(hit, 'terrain has no holes');
    assert.ok(Math.abs(hit.point[1]-terrain.heightAt(x,z))<1e-8, 'wheel ray matches visible mesh');
    slope=Math.max(slope, Math.hypot(hit.normal[0],hit.normal[2])/hit.normal[1]);
  }
  const sx=(RESIDENTIAL_BOUNDS[2]-RESIDENTIAL_BOUNDS[0])/Math.ceil((RESIDENTIAL_BOUNDS[2]-RESIDENTIAL_BOUNDS[0])/8);
  const sz=(RESIDENTIAL_BOUNDS[3]-RESIDENTIAL_BOUNDS[1])/Math.ceil((RESIDENTIAL_BOUNDS[3]-RESIDENTIAL_BOUNDS[1])/8);
  for(const [col,row] of [[1,1],[44,67],[110,121]])for(const offset of [-1e-5,0,1e-5])for(const t of [0,.5,1]){
    const x=RESIDENTIAL_BOUNDS[0]+(col+t)*sx+offset,z=RESIDENTIAL_BOUNDS[1]+(row+t)*sz;
    const hit=world.raycast([x,30,z],[0,-1,0],60);
    assert.ok(hit&&Math.abs(hit.point[1]-terrain.heightAt(x,z))<1e-8,'cell edges and diagonals have no cracks');
  }
  assert.ok(slope<.3, `gentle driving grades, max sampled slope ${slope}`);
});

test('conformed road triangles stay on the sloped terrain between source vertices', () => {
  const terrain = createResidentialTerrain({
    origin: [-10, -10], step: 10, cols: 3, rows: 3,
    heights: [0, 3, 1, 2, 7, 4, -1, 2, 0],
  }, { bounds: [-10, -10, 10, 10], edgeFeather: 0, meshStep: 2 });
  const road = terrain.conformTriangle([-9, .025, -1], [9, .025, -1], [9, .025, 1]);
  assert.ok(road.length > 2, 'road is split at terrain cell boundaries');
  const world = createWorld(4);
  for (const tri of road) {
    world.addTri(...tri, 'asphalt');
    const x = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    const z = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
    const y = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    assert.ok(Math.abs(y - terrain.heightAt(x, z) - .025) < 1e-8, 'road triangle conforms to the same terrain plane');
    const hit = world.raycast([x, 20, z], [0, -1, 0], 40);
    assert.ok(hit && Math.abs(hit.point[1] - y) < 1e-8, 'collision follows the conformed visual road');
  }
});
