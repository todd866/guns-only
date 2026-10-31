import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addBox } from './world.mjs';
import { createRobot, stepRobot, ROBOT } from './robot.mjs';

function yard() { const w = createWorld(); w.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], 'concrete'); return w; }
const walk = (w, r, seconds, input = { throttle: 1 }) => { const ev = []; for (let i = 0; i < seconds * 120; i++) { const e = stepRobot(r, input, w, 1 / 120); if (Object.keys(e).length) ev.push(e); } return ev; };

test('walks forward along its facing, turns, and settles on the floor', () => {
  const w = yard(), r = createRobot([0, .2, 0], 0);
  walk(w, r, 1);
  assert.ok(r.grounded && Math.abs(r.pos[1]) < .01, `on floor ${r.pos}`);
  assert.ok(r.pos[2] < -1.2 && Math.abs(r.pos[0]) < .05, `walked north ${r.pos}`);
  const y0 = r.yaw; walk(w, r, .5, { throttle: 1, steer: 1 }); assert.ok(r.yaw > y0 + 1, 'turned');
});

test('steps up a kerb, climbs a chest-high ledge, and stops at a wall that is too tall', () => {
  const kerb = yard(); addBox(kerb, 0, -2, 2, 2, 0, .05, 'concrete');
  const a = createRobot([0, 0, 0], 0); walk(kerb, a, 1.2); assert.ok(a.pos[1] > .04 && a.pos[2] < -1.2, `on the kerb ${a.pos}`);
  const ledge = yard(); addBox(ledge, 0, -1.2, 2, 1, 0, .35, 'wood');
  const b = createRobot([0, 0, 0], 0); const ev = []; for (let i = 0; i < 300 && !ev.some(e => e.climbed); i++) { const e = stepRobot(b, { throttle: 1 }, ledge, 1 / 120); if (Object.keys(e).length) ev.push(e); }
  assert.ok(ev.some(e => e.climbed), 'climbed'); assert.ok(Math.abs(b.pos[1] - .35) < .02 && b.pos[2] < -.75, `on top ${b.pos}`);
  const wall = yard(); addBox(wall, 0, -1.2, 2, 1, 0, .8, 'concrete');
  const c = createRobot([0, 0, 0], 0); walk(wall, c, 2); assert.ok(c.pos[1] < .01 && c.pos[2] > -.75, `stopped at the wall ${c.pos}`);
});

test('crouches to crawl under a low table and stands up on the far side', () => {
  const w = yard(); addBox(w, 0, -2, 2, 1.2, .2, .26, 'wood');   // a tabletop 20 cm up
  const r = createRobot([0, 0, 0], 0); let crouched = false;
  for (let i = 0; i < 120 * 3; i++) { stepRobot(r, { throttle: 1 }, w, 1 / 120); crouched ||= r.crouched; }
  assert.ok(crouched, 'crouched under the table'); assert.ok(r.pos[2] < -2.9 && !r.crouched, `out the far side, standing ${r.pos}`);
});

test('jumps and lands without fuss', () => {
  const w = yard(), r = createRobot([0, 0, 0], 0); walk(w, r, .2, {});
  stepRobot(r, { jump: true }, w, 1 / 120); let peak = 0, landed = false;
  for (let i = 0; i < 120; i++) { const e = stepRobot(r, {}, w, 1 / 120); peak = Math.max(peak, r.pos[1]); landed ||= !!e.landed || r.grounded; }
  assert.ok(peak > .2 && peak < .45, `peak ${peak}`); assert.ok(landed && r.grounded);
  assert.ok(ROBOT.height > ROBOT.crouch);
});
