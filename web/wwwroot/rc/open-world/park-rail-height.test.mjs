import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld } from '../physics/world.mjs';
import { installRailCollisions } from '../physics/grind.mjs';
import { INTRO_PARK } from '../physics/skate.mjs';
import { courseFromGlb } from '../physics/district.mjs';
import { HANGAR_PARK, buildHangar, hangarWorld } from './skate-hangar.mjs';
import { SCHOOLYARD, SCHOOL_PARK, YARD_PAD, POOL_HOLE, buildSchoolyard, yardWorld } from './schoolyard.mjs';
import { bankPoint } from './park-lines.mjs';
import { createResidentialTerrain } from './residential-terrain.mjs';
import { RESIDENTIAL_BOUNDS } from './residential-frame.mjs';

function checkRails(testName, park, rails, toWorld, world) {
  test(testName, () => {
    assert.ok(Array.isArray(rails) && rails.length > 0, `${park.id} exposes rails`);
    for (const rail of rails) {
      assert.ok(rail.pts.length >= 2, `${rail.id} has a polyline`);
      const samples = [];
      for (let i = 1; i < rail.pts.length; i++) {
        const a = rail.pts[i - 1], b = rail.pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        for (let d = .05; d < length - .05; d += .25) { const t = d / length; samples.push(a.map((v, k) => v + (b[k] - v) * t)); }
      }
      for (const p of samples) {
        const q = toWorld(p);
        const hits = [[0, 0], [.05, 0], [-.05, 0], [0, .05], [0, -.05]].map(([dx, dz]) => world.raycast([q[0] + dx, q[1] + 1, q[2] + dz], [0, -1, 0], 3)).filter(Boolean);
        const error = hits.length ? Math.min(...hits.map(hit => Math.abs(hit.point[1] - q[1]))) : Infinity;
        assert.ok(error <= .05, `${park.id}/${rail.id} has no supported height near ${p} (best error ${error})`);
      }
    }
  });
}

const hangarWorldForRails = p => hangarWorld([p[0], p[2], p[1]]);
const hangarWorldForTest = createWorld(4);
for (const t of buildHangar()) hangarWorldForTest.addTri(hangarWorld(t.a), hangarWorld(t.b), hangarWorld(t.c), t.surface);
installRailCollisions(hangarWorldForTest, HANGAR_PARK, hangarWorldForRails);
assert.deepEqual(HANGAR_PARK.rails.find(r => r.id === 'drop-deck-guard-west').pts, [[-26.4, -7, 4.535], [-26.4, 7, 4.535]]);
checkRails('every Hangar rail is supported by its designed top surface', HANGAR_PARK, HANGAR_PARK.rails, hangarWorldForRails, hangarWorldForTest);

const terrainData = JSON.parse(fs.readFileSync(new URL('../assets/world/residential-terrain.json', import.meta.url)));
const terrain = createResidentialTerrain(terrainData, { bounds: RESIDENTIAL_BOUNDS, edgeFeather: 128, pads: [YARD_PAD], holes: [POOL_HOLE] });
const schoolWorld = createWorld(4);
for (const [a, b, c] of terrain.triangles()) schoolWorld.addTri(a, b, c, 'grass');
for (const t of buildSchoolyard(terrain.holes[0])) schoolWorld.addTri(t.a, t.b, t.c, t.surface);
const schoolWorldForRails = p => yardWorld([p[0], p[2], p[1]]);
installRailCollisions(schoolWorld, SCHOOL_PARK, schoolWorldForRails);
assert.deepEqual(SCHOOL_PARK.rails.find(r => r.id === 'steps-handrail-west').pts, [[11.2, 13.8, 1.885], [11.2, 16.25, 1.135]]);
checkRails('every Schoolyard rail is supported by its designed top surface', SCHOOL_PARK, SCHOOL_PARK.rails, schoolWorldForRails, schoolWorld);

const introBytes = fs.readFileSync(new URL('../assets/districts/skatepark.glb', import.meta.url));
const introWorld = courseFromGlb(introBytes).world;
const introWorldForRails = p => { const q = bankPoint(p[0], p[1]); q[1] = q[1] + p[2] - .14; return q; };
installRailCollisions(introWorld, INTRO_PARK, introWorldForRails);
const bank = (t, rise) => .14 + rise * (t < .16 ? t * t / (.32 * .92) : (t - .08) / .92);
const lowBank = u => bank(Math.min((u + 6.3) / 2.1, (.5 - u) / 2.1, 1), .62) + .52 + .035;
const lowBankRail = INTRO_PARK.rails.find(r => r.id === 'low-bank-rail');
for (const [i, u] of [-5.8, -4.2, -1.6, 0].entries()) assert.ok(Math.abs(lowBankRail.pts[i][2] - lowBank(u)) < 1e-4, `low-bank source height ${u}`);
assert.deepEqual(INTRO_PARK.rails.find(r => r.id === 'west-quarter-coping').pts, [[-16, -3.8, 1.57 + .035], [-16, 6.4, 1.57 + .035]]);
checkRails('every Intro plaza rail is supported by its designed top surface', INTRO_PARK, INTRO_PARK.rails, introWorldForRails, introWorld);
