import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import { createWorld } from '../physics/world.mjs';
import { createClassicCourses } from './classic-courses.js';
import { createSession, stepSession } from '../physics/session.mjs';
import { eventCourse } from './catalog.mjs';
import { CLASSIC_EVENTS, CLASSIC_LOCATIONS } from './classic-courses.mjs';

test('four missing mapped courses have distinct authored routes and safe height limits', () => {
  assert.deepEqual(CLASSIC_EVENTS.map(e => e.id), ['base-traffic','quarry-run','demo-team-circuit','after-hours-boardwalk']);
  assert.equal(new Set(CLASSIC_EVENTS.map(e => e.reference)).size, 4);
  assert.ok(CLASSIC_EVENTS.every(e => e.points.length >= 8 && e.route.length >= 5));
  assert.ok(CLASSIC_EVENTS.flatMap(e => e.points).every(p => p.length === 3 && p[2] >= 0 && p[2] < 20));
  assert.ok(CLASSIC_LOCATIONS.every(p => p.entrance));
});

test('course factory exposes drivable collision surfaces and bounded moving hazards', () => {
  const scene = new T.Scene(), world = createWorld(), courses = createClassicCourses(scene, world);
  assert.ok(world.tris.length >= 8);
  const bounds = new T.Box3().setFromObject(courses.root); assert.ok(bounds.max.y - bounds.min.y < 20, `course art exceeds RC height budget: ${bounds.max.y - bounds.min.y}`);
  for (const event of courses.events) for (let i = 1; i < event.points.length; i++) {
    const a = event.points[i - 1], b = event.points[i], x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2, y = (a[2] + b[2]) / 2;
    const hit = world.raycast([x, y + 4, z], [0, -1, 0], 8);
    assert.ok(hit || event.id === 'base-traffic', `${event.id} route has no surface at ${x},${z}`);
  }
  for (const event of courses.events.filter(e => e.id !== 'base-traffic')) {
    const session = createSession(eventCourse(event, world), { mode: 'kid' }); session.roam = true;
    for (let i = 0; i < 600; i++) stepSession(session, { throttle: .3, steer: 0 }, 1 / 120);
    assert.ok(session.car.pos.every(Number.isFinite), `${event.id} physics state became non-finite`);
    assert.ok(session.car.pos[1] > -.5, `${event.id} driver fell through authored course`);
  }
  courses.update(0);
  assert.equal(courses.stepHazards([-607, 0, -21], 1 / 60, 0)[0]?.type, 'traffic-bump');
  assert.equal(courses.stepHazards([1990, 0, 1385], 1 / 60, 0)[0]?.type, 'rolling-rock');
  assert.deepEqual(courses.stepHazards([-500, 0, 3400], 1 / 60, 0), [], 'ground-level beach cars are not rescued as boardwalk falls');
  courses.dispose();
  assert.equal(scene.children.length, 0);
});
