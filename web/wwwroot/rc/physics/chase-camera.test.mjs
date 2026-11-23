import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, addBox} from './world.mjs';
import {resolveChaseCamera, CHASE_CAMERA} from './chase-camera.mjs';

// The ray-pull the chase used to do: stop 12 cm before the hit. A grazing wall
// still leaves the camera sphere in the concrete.
function rayPull(world, eye, desired, margin = 0.12) {
  const ray = [desired[0] - eye[0], desired[1] - eye[1], desired[2] - eye[2]];
  const dist = Math.hypot(...ray);
  const hit = world.raycast(eye, ray.map(v => v / dist), dist);
  if (!hit) return desired;
  const k = Math.max(0.15, hit.dist - margin) / dist;
  return [eye[0] + ray[0] * k, eye[1] + ray[1] * k, eye[2] + ray[2] * k];
}

function deepest(world, point, radius = CHASE_CAMERA.radius) {
  const hits = world.sphereContacts(point, radius);
  return hits.reduce((m, c) => Math.max(m, c.depth), 0);
}

test('a grazing wall pulls the chase sphere out of the concrete', () => {
  const world = createWorld();
  world.addQuad([-8, 0, -8], [-8, 0, 8], [8, 0, 8], [8, 0, -8], 'concrete');
  // A long wall at z = 0, facing -z. The camera aim clips the face at an angle.
  addBox(world, 0, 0, 6, 0.3, 0, 2, 'concrete');
  const eye = [0.2, 0.45, -1.6];
  const desired = [1.35, 0.7, 0.55];
  const old = rayPull(world, eye, desired);
  assert.ok(deepest(world, old) > 0.02, `fixture must still clip the old ray pull (depth ${deepest(world, old)})`);
  const cam = resolveChaseCamera({eye, desired, world, glide: 1});
  assert.ok(deepest(world, cam.position) < 0.001, `sphere depth ${deepest(world, cam.position)}`);
  assert.ok(deepest(world, cam.aim) < 0.001, `aim depth ${deepest(world, cam.aim)}`);
  assert.ok(cam.position[2] < -0.05, `camera stayed in front of the wall ${cam.position}`);
});

test('smoothing cannot carry the camera through the wall', () => {
  const world = createWorld();
  world.addQuad([-8, 0, -8], [-8, 0, 8], [8, 0, 8], [8, 0, -8], 'concrete');
  addBox(world, 0, 0, 4, 0.4, 0, 2, 'concrete');
  const eye = [0, 0.4, -1.4];
  const desired = [0, 0.6, 1.2];
  // Previous frame already inside the wall, and the glide only moves part way.
  const current = [0, 0.55, 0.15];
  assert.ok(deepest(world, current) > 0.02, 'fixture starts inside the wall');
  const cam = resolveChaseCamera({eye, desired, current, world, glide: 0.25});
  assert.ok(deepest(world, cam.position) < 0.001, `smoothed depth ${deepest(world, cam.position)}`);
});

test('a thin post does not yank the chase back to the car', () => {
  const world = createWorld();
  world.addQuad([-8, 0, -8], [-8, 0, 8], [8, 0, 8], [8, 0, -8], 'concrete');
  addBox(world, 0, -0.4, 0.06, 0.06, 0, 1.2, 'metal');
  const eye = [0, 0.4, -1.5];
  const desired = [0, 0.55, 1.1];
  const cam = resolveChaseCamera({eye, desired, world, glide: 1});
  const stayed = Math.hypot(cam.position[0] - desired[0], cam.position[1] - desired[1], cam.position[2] - desired[2]);
  assert.ok(stayed < 0.35, `thin post pulled the camera ${stayed.toFixed(2)} m`);
  assert.ok(deepest(world, cam.position) < 0.001, `ended inside the post ${deepest(world, cam.position)}`);
});
