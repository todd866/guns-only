import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadOpenWorld} from './open-world/runtime.js';
import {DISTRICT_ZONES} from './open-world/district-zones.mjs';
import {createSession, stepSession} from './physics/session.mjs';
const fetchLocal = async url => new Response(fs.readFileSync(new URL(String(url), import.meta.url)));

test('district entrances have continuous ground across the shell to terrain seam', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchLocal;
  try {
    for (const [id, {anchor}] of Object.entries(DISTRICT_ZONES)) {
      const w = await loadOpenWorld('?at=' + id);
      let previousHeight = null;
      try {
        for (let dz = 3.5; dz <= 7.5; dz += 0.025) {
          const hit = w.course.world.raycast([anchor[0], 0.5, anchor[2] - dz], [0, -1, 0], 1);
          assert.ok(
            hit && hit.point[1] >= -0.01 && hit.point[1] <= 0.11,
            `${id}: missing ground ${dz.toFixed(3)}m inside anchor: ${JSON.stringify(hit)}`
          );
          if (previousHeight !== null)
            assert.ok(Math.abs(hit.point[1] - previousHeight) < 0.01, `${id}: abrupt ground step at ${dz}`);
          previousHeight = hit.point[1];
        }
      } finally {
        w.dispose();
      }
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test('slow analog driving crosses each district threshold without pitching or falling', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchLocal;
  try {
    for (const [id, {anchor}] of Object.entries(DISTRICT_ZONES)) {
      const w = await loadOpenWorld('?at=' + id);
      try {
        const s = createSession(
          {...w.course, start: {pos: [anchor[0], 0, anchor[2] + 6], yaw: 0}},
          {mode: 'bigKid'}
        );
        s.roam = true;
        for (let i = 0; i < 120 * 15 && s.car.pos[2] > anchor[2] - 10; i++) {
          const throttle = Math.max(-0.5, Math.min(0.7, 0.05 + (3 - s.car.forwardSpeed) * 0.25));
          stepSession(s, {throttle}, 1 / 120);
          assert.ok(
            s.car.pos[1] > -0.1 && s.car.pos[1] < 0.5,
            `${id}: threshold throws car to y=${s.car.pos[1]}`
          );
          assert.ok(s.car.speed < 6, `${id}: unstable speed ${s.car.speed}`);
        }
        assert.ok(s.car.pos[2] <= anchor[2] - 10, `${id}: blocked at ${s.car.pos}`);
        for (let i = 0; i < 120 * 15 && s.car.pos[2] < anchor[2] + 6; i++) {
          const throttle = -Math.max(-0.5, Math.min(0.7, 0.05 + (3 + s.car.forwardSpeed) * 0.25));
          stepSession(s, {throttle}, 1 / 120);
          assert.ok(s.car.pos[1] > -0.1 && s.car.pos[1] < 0.5, `${id}: exit throws car to y=${s.car.pos[1]}`);
          assert.ok(s.car.speed < 6, `${id}: unstable exit speed ${s.car.speed}`);
        }
        assert.ok(s.car.pos[2] >= anchor[2] + 6, `${id}: exit blocked at ${s.car.pos}`);
        assert.equal(s.recoveries, 0);
      } finally {
        w.dispose();
      }
    }
  } finally {
    globalThis.fetch = previous;
  }
});
