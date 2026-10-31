import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld } from '../physics/world.mjs';
import { courseFromGlb } from '../physics/district.mjs';
import { createSession, stepSession } from '../physics/session.mjs';
import { placeCar, rideHeight } from '../physics/car.mjs';
import { createSkate, stepSkate, INTRO_PARK } from '../physics/skate.mjs';
import { setSkateRails } from '../physics/grind.mjs';
import { bankLocal, bankPoint } from './park-lines.mjs';
import { HANGAR_PARK, buildHangar, hangarWorld, hangarLocal } from './skate-hangar.mjs';
import { SCHOOL_PARK, POOL_HOLE, buildSchoolyard, yardWorld, yardLocal } from './schoolyard.mjs';
const intro = courseFromGlb(fs.readFileSync(new URL('../assets/districts/skatepark.glb', import.meta.url))).world;
const hangar = createWorld(4); for (const t of buildHangar()) hangar.addTri(hangarWorld(t.a), hangarWorld(t.b), hangarWorld(t.c), t.surface);
const school = createWorld(4); for (const t of buildSchoolyard(POOL_HOLE)) school.addTri(t.a, t.b, t.c, t.surface);
const parks = [
  { park: INTRO_PARK, world: intro, toWorld: ([u, v, h]) => { const p = bankPoint(u, v); return [p[0], h, p[2]]; }, frame: p => [...bankLocal(p), p[1]], at: [-16.2, -3, 1.54], dir: [0, 1], rail: 'west-quarter-coping' },
  { park: HANGAR_PARK, world: hangar, toWorld: ([x, z, h]) => hangarWorld([x, h, z]), frame: p => { const l = hangarLocal(p); return [l[0], l[2], l[1]]; }, at: [-23.8, -4, 3.6], dir: [0, 1], rail: 'vert-coping-west' },
  { park: SCHOOL_PARK, world: school, toWorld: ([x, z, h]) => yardWorld([x, h, z]), frame: p => { const l = yardLocal(p); return [l[0], l[2], l[1]]; }, at: [-17, -22.82, 0], dir: [1, 0], rail: 'pool-coping-rim' },
];
for (const def of parks) test(`${def.park.name}: held throttle from rest catches its signature coping and scores`, () => {
  const p = def.toWorld(def.at), target = def.toWorld([def.at[0] + def.dir[0], def.at[1] + def.dir[1], def.at[2]]);
  const yaw = Math.atan2(target[0] - p[0], -(target[2] - p[2]));
  const s = createSession({ world: def.world, checkpoints: [[0, 0], [1, 0]], secrets: [], start: { pos: p, yaw } }); s.roam = true;
  placeCar(s.car, [p[0], p[1] + rideHeight() + .01, p[2]], yaw); setSkateRails(s, def.park, def.toWorld);
  const sk = createSkate(def.park), events = [], caught = new Set();
  for (let i = 0; i < 120; i++) { const input = { throttle: 1, steer: 0 }; stepSession(s, input); events.push(...stepSkate(sk, s, input, 1 / 120, def.frame)); if (s.skateRide.active) caught.add(s.skateRide.active.rail.id); }
  assert.ok(caught.has(def.rail), `${[...caught]} at ${def.frame(s.car.pos)}`);
  assert.ok(events.some(e => e.name === '50-50'));
  assert.equal(s.hits, 0); assert.equal(s.recoveries, 0); assert.ok(!events.some(e => e.type === 'bail'));
});
