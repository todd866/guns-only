import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {courseFromGlb} from './physics/district.mjs';
import {createRace, stepRace, driveInput} from './physics/race.mjs';

for (const skill of [0.85, 0.9])
  test(`authored housing completes three strict laps (${skill < 0.9 ? 'road' : 'wall shortcut'})`, () => {
    const b = fs.readFileSync(new URL('./assets/districts/housing.glb', import.meta.url));
    const course = {...courseFromGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), laps: 3};
    const race = createRace(course, {mode: 'bigKid', opponents: 0});
    const pilot = {session: race.player, skill, node: 0};
    race.retreat.at = Infinity;
    let shortcutFrames = 0;
    for (let i = 0; i < 120 * 240 && !race.player.finished; i++) {
      const input = driveInput(race, pilot);
      if (pilot.alt) shortcutFrames++;
      stepRace(race, input, 1 / 120);
    }
    assert.equal(
      race.player.finished,
      true,
      `stuck lap ${race.player.lap}, gate ${race.player.gate}, position ${race.player.car.pos}`
    );
    assert.equal(race.player.lapTimes.length, 3);
    assert.equal(race.player.recoveries, 0);
    assert.equal(shortcutFrames > 0, skill >= 0.9, 'exercise intended route');
  });
