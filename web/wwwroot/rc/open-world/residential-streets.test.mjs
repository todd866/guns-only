import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResidentialStreetSurfaces, streetSurfaceBounds } from './residential-streets.mjs';
import {createWorld} from '../physics/world.mjs';

const finiteQuad = q => q.every(p => p.length === 3 && p.every(Number.isFinite));

test('continuous strips keep an angled street readable and finite', () => {
  const { surfaces } = buildResidentialStreetSurfaces([{ kind: 'tertiary', points: [[0, 0], [20, 0], [29, 8], [40, 8]] }]);
  assert.ok(surfaces.length >= 3);
  assert.ok(surfaces.every(s => finiteQuad(s.quad)));
  assert.ok(surfaces.filter(s => s.material === 'asphalt').length >= 3);
  const asphalt = surfaces.filter(s => s.material === 'asphalt').map(s => streetSurfaceBounds(s.quad));
  const bounds = asphalt.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  assert.ok(bounds[2] - bounds[0] > 39 && bounds[3] - bounds[1] > 6);
});

test('T junction leaves an open crossing instead of a transverse kerb wall', () => {
  const roads = [
    { kind: 'service', points: [[-25, 0], [0, 0], [25, 0]] },
    { kind: 'service', points: [[0, -22], [0, 0]] },
  ];
  const result = buildResidentialStreetSurfaces(roads, { junctionRadius: 7, junctionGap: 3 });
  assert.ok(result.junctions.some(j => j.degree >= 1));
  const crossingKerbs = result.surfaces.filter(s => s.collision === 'kerb' && streetSurfaceBounds(s.quad)[0] < 2 && streetSurfaceBounds(s.quad)[2] > -2 && streetSurfaceBounds(s.quad)[1] < 2 && streetSurfaceBounds(s.quad)[3] > -2);
  assert.equal(crossingKerbs.length, 0, 'kerb profiles stop before the junction apron');
  assert.ok(result.surfaces.some(s => s.material === 'asphalt'), 'road surface remains continuous through the join');
});

test('intersection inside an unsplit long road removes the actual crossing kerb',()=>{
  const {surfaces}=buildResidentialStreetSurfaces([
    {kind:'residential',points:[[-40,0],[40,0]]},
    {kind:'residential',points:[[0,-40],[0,0]]},
  ]);
  const world=createWorld();for(const s of surfaces)world.addQuad(...s.quad,s.collision);
  for(const x of [-2,0,2])for(let z=-8;z<3;z+=.25){
    const hit=world.raycast([x,2,z],[0,-1,0],4);
    assert.equal(hit?.surface,'asphalt',`junction lane stays open at ${x},${z}`);
    assert.ok(Math.abs(hit.point[1]-.025)<1e-7);
  }
  assert.equal(world.raycast([10,2,-4],[0,-1,0],4)?.surface,'kerb','ordinary roadside retains its rolled kerb');
});

test('paths are flush surfaces without raised kerb collision', () => {
  const { surfaces } = buildResidentialStreetSurfaces([{ kind: 'path', points: [[0, 0], [0, 20], [8, 28]] }]);
  assert.ok(surfaces.length >= 2);
  assert.ok(surfaces.every(s => s.material === 'path' && s.collision === 'path'));
  assert.ok(surfaces.every(s => finiteQuad(s.quad)));
});

test('terrain callback supplies base height while preserving soft rise', () => {
  const { surfaces } = buildResidentialStreetSurfaces([{ kind: 'service', points: [[0, 0], [30, 0]] }], { yAt: (x, z) => x * .01 + z * .02 });
  const kerb = surfaces.find(s => s.collision === 'kerb');
  assert.ok(kerb);
  assert.ok(kerb.quad.every(p => p[1] - (p[0] * .01 + p[2] * .02) >= -.001));
  assert.ok(Math.max(...kerb.quad.map(p => p[1])) - Math.min(...kerb.quad.map(p => p[1])) <= .11 + 0.31);
});

test('mitered corner keeps the intended width and duplicate stations do not bow-tie', () => {
  const { surfaces } = buildResidentialStreetSurfaces([{ kind: 'service', points: [[0, 0], [0, 0], [20, 0], [20, 20]] }], { kerbs: false });
  const asphalt = surfaces.filter(s => s.material === 'asphalt');
  assert.equal(asphalt.length, 2);
  const straightWidth = Math.hypot(asphalt[0].quad[0][0] - asphalt[0].quad[0 + 3][0], asphalt[0].quad[0][2] - asphalt[0].quad[3][2]);
  assert.ok(straightWidth > 4.9 && straightWidth < 5.1, `straight strip width ${straightWidth}`);
  for (const s of asphalt) {
    const signed = (a, b, c) => (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
    assert.ok(Math.abs(signed(s.quad[0], s.quad[1], s.quad[2])) > .01, 'no degenerate bow-tie triangle');
  }
});

test('nearby footpath does not make a road junction or clip road kerbs', () => {
  const { surfaces, junctions } = buildResidentialStreetSurfaces([
    { kind: 'service', points: [[0, 0], [20, 0]] },
    { kind: 'path', points: [[10, -5], [10, 5]] },
  ]);
  assert.equal(junctions.length, 0, 'pedestrian crossing is not a vehicle junction');
  assert.ok(surfaces.filter(s => s.collision === 'kerb').length > 0);
});
