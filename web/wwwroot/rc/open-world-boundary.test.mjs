import {CANYON} from './open-world/canyon.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_BOUNDARY, boundarySegmentsWithin, insideBase} from './open-world/boundary.mjs';
import {inResidential} from './open-world/residential-frame.mjs';
import {LOCATIONS} from './open-world/catalog.mjs';
const inCanyon = ([x, , z]) =>
  x >= CANYON.bounds[0] && x <= CANYON.bounds[2] && z >= CANYON.bounds[1] && z <= CANYON.bounds[3];

test('boundary source preserves exact OSM IDs and destinations', () => {
  assert.deepEqual(BASE_BOUNDARY.ids, {
    mainRelation: 16282210,
    mainOuter: 758208019,
    areaIII: 19616628,
    areaIIIOuter: 1377332778
  });
  assert.equal(BASE_BOUNDARY.rings.main.length, 246);
  assert.equal(BASE_BOUNDARY.rings.areaIII.length, 91);
  assert.equal(BASE_BOUNDARY.elevationDatumM, 569.1);
  for (const p of LOCATIONS.filter(p => !p.alien)) {
    // The Canyon Run sits in the authored canyon (canyon.mjs), outside the OSM base by design.
    if (p.game === 'canyon-run') {
      assert.ok(inCanyon(p.pos), `${p.id} lies in the authored canyon`);
      continue;
    }
    if (p.id === 'skatepark' || p.id === 'schoolyard') {
      assert.ok(inResidential(p.pos), `${p.id} lies in the authored residential extension`);
      continue;
    }
    assert.ok(insideBase(p.pos[0], p.pos[2]), `${p.id} outside source union`);
  }
});
test('source rings are finite and clipping returns only source segments', () => {
  for (const ring of Object.values(BASE_BOUNDARY.rings))
    for (const p of ring) for (const v of p) assert.ok(Number.isFinite(v));
  const s = boundarySegmentsWithin([-2600, -2300, 3250, 4050]);
  assert.ok(s.length > 0);
  for (const seg of s)
    for (const p of seg) {
      assert.ok(p[0] >= -2600 - 1e-6 && p[0] <= 3250 + 1e-6);
      assert.ok(p[1] >= -2300 - 1e-6 && p[1] <= 4050 + 1e-6);
    }
  assert.ok(boundarySegmentsWithin([50000, 50000, 51000, 51000]).length === 0);
});
