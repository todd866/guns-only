// Source collision, authored props and player physics, matching acceptance-balance.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {createStream} from './open-world/stream.mjs';
import {prepareDistricts} from './open-world/districts.js';
import {buildLandmarks} from './open-world/landmarks.js';
import {buildActivities} from './open-world/activities.js';
import {EVENTS, eventCourse, eventLaps} from './open-world/catalog.mjs';
import {createRace, stepRace, driveInput} from './physics/race.mjs';
import {SWELL, WATER} from './physics/water.mjs';

const data = name => JSON.parse(fs.readFileSync(new URL('./assets/world/' + name, import.meta.url)));
const stub = () => ({getContext: () => new Proxy({}, {get: () => () => {}, set: () => true})});
// waterHeight uses omega = sqrt(g * 2pi / wavelength). The four waves have no
// shared period: also cover later combinations, including the observed failures
// at 0.5, 4 and 30 seconds (all pinned at gate 5 through the 600 s baseline cap).
const period = Math.sqrt((2 * Math.PI * SWELL[0][3]) / 9.8);
const phases = [
  ...Array.from({length: 12}, (_, i) => (i * period) / 12),
  ...[0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 45, 60]
];

test('Wavepool Beach stays under bronze from every sampled wave phase without recovery', async t => {
  const oldDocument = globalThis.document,
    oldFetch = globalThis.fetch,
    oldTime = WATER.time;
  globalThis.document = {createElement: stub};
  globalThis.fetch = async url => new Response(fs.readFileSync(new URL(String(url), import.meta.url)));
  const stream = createStream({
    manifest: data('manifest.json'),
    elevation: data('playable-terrain.json'),
    fetchTile: async key => data('tile-' + key.replace(',', '-') + '.json')
  });
  let landmarks, activities;
  try {
    await prepareDistricts(stream.world);
    landmarks = buildLandmarks(new T.Scene(), stream.world, undefined, data('overview.json').roads);
    activities = buildActivities(new T.Scene(), stream.world);
    const event = EVENTS.find(e => e.id === 'splash-down'),
      course = {...eventCourse(event, stream.world), laps: eventLaps(event)},
      bronze = event.medals[2] * course.laps,
      dt = 1 / 120;
    await stream.update(course.start.pos);
    await t.test('wood approach reaches the shore while the ramp retains its 2 m crest', () => {
      for (const x of [-495.9, -495, -494, -493, -492.1]) {
        const hit = stream.world.raycast([x, 0.4, 3340], [0, -1, 0], 1);
        assert.ok(hit && Math.abs(hit.point[1]) < 0.01, `basin dip remains at x=${x}`);
        if (x < -493) assert.equal(hit.surface, 'wood', 'the ramp approach must bridge the basin');
      }
      const crest = stream.world.raycast([-510, 3, 3340], [0, -1, 0], 4);
      assert.equal(crest?.surface, 'wood');
      assert.equal(crest.point[1], 2);
    });
    // Sequential: WATER.time and the streamed collision world are shared.
    for (const phase of phases) {
      await t.test(`WATER.time = ${phase.toFixed(6)} s`, async t => {
        WATER.time = phase;
        await stream.update(course.start.pos);
        const race = createRace(course, {mode: 'bigKid', opponents: 0}),
          pilot = {session: race.player, skill: 0.9, node: 0};
        race.retreat.at = Infinity;
        let steps = 0;
        // Bound the whole simulation too, so a car that never starts the clock fails.
        while (!race.player.finished && race.player.time <= bronze && steps++ < 120 * (bronze + 5)) {
          if (steps % 120 === 1) await stream.update(race.player.car.pos);
          stepRace(race, driveInput(race, pilot), dt);
          activities.update(steps * dt, race.player.car.pos);
          activities.step(race.player.car, dt);
        }
        const {finished, time, gate, lap, car, recoveries} = race.player;
        t.diagnostic(JSON.stringify({phase, finished, time, gate, lap, pos: car.pos, recoveries}));
        assert.ok(finished, `phase ${phase}: stalled at lap ${lap}, gate ${gate}, position ${car.pos}`);
        assert.ok(time <= bronze, `phase ${phase}: ${time}s exceeds ${bronze}s bronze`);
        assert.equal(recoveries, 0, 'the reference driver must finish without an R/automatic recovery');
      });
    }
  } finally {
    WATER.time = oldTime;
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
    activities?.dispose();
    landmarks?.dispose();
    stream.dispose();
  }
});
