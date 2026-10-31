import test from 'node:test';
import assert from 'node:assert/strict';
import {CLUB} from './country-club.mjs';
import {loadProgress, saveProgress} from './catalog.mjs';
import {
  TENNIS,
  createTennis,
  startTennis,
  stopTennis,
  stepTennis,
  tennisPoint,
  tennisReach,
  tennisStart,
  onTennisCourt,
  canHitTennis,
  swingTennis,
  tennisAssist
} from './tennis.mjs';

const [x, z] = TENNIS.center;
const player = () => ({pos: tennisStart()});
function game(mode = 'kid', random = () => 0.5) {
  const st = createTennis({random});
  startTennis(st, {mode});
  return st;
}
function ball(st, {pos = [x, 0.11, z + 8], vel = [0, -1, 0], lastHit = 'bot', bounces = 0} = {}) {
  st.ball = {pos, vel, lastHit, bounces};
}
function until(st, predicate, pilot = player(), seconds = 15) {
  const events = [];
  for (let i = 0; i < seconds * 120 && !predicate(st); i++) events.push(...stepTennis(st, pilot, 1 / 120));
  assert.ok(predicate(st), 'script reached its expected state');
  return events;
}

test('one playable court uses the existing left court lines, within the club box', () => {
  const [x0, z0, x1, z1] = CLUB.tennis.box;
  assert.ok(x - TENNIS.halfWidth > x0 && x + TENNIS.halfWidth < (x0 + x1) / 2);
  assert.ok(z - TENNIS.halfLength > z0 && z + TENNIS.halfLength < z1);
  assert.equal(onTennisCourt([x + TENNIS.halfWidth, 0, z + TENNIS.halfLength]), true);
  assert.equal(onTennisCourt([x + TENNIS.halfWidth + 0.001, 0, z]), false);
  assert.equal(onTennisCourt([x + 24, 0, z]), false);
});

test('one bounce on the receiving side is allowed; a second awards the hitter', () => {
  const st = game();
  ball(st);
  assert.deepEqual(stepTennis(st, player(), 0.02), []);
  assert.equal(st.ball.bounces, 1);
  assert.ok(st.ball.vel[1] > 0);
  assert.deepEqual(st.score, {you: 0, bot: 0});
  const events = until(st, s => !s.ball);
  assert.deepEqual(events, [{point: 'bot', reason: 'bounce'}]);
  assert.equal(st.score.bot, 1);
});

test('first bounce outside lines or on the hitter side loses the point', () => {
  for (const pos of [
    [x + TENNIS.halfWidth + 0.01, 0.11, z + 8],
    [x, 0.11, z - 8]
  ]) {
    const st = game();
    ball(st, {pos});
    assert.deepEqual(stepTennis(st, player(), 0.02), [{point: 'you', reason: 'out'}]);
  }
});

test('a valid bounce followed by a bounce outside still awards the hitter', () => {
  const st = game();
  ball(st, {pos: [x + TENNIS.halfWidth - 0.05, 0.11, z + 8], vel: [4, -1, 0]});
  stepTennis(st, player(), 0.02);
  assert.equal(st.ball.bounces, 1);
  const events = until(st, s => !s.ball);
  assert.deepEqual(events, [{point: 'bot', reason: 'bounce'}]);
});

test('net stops low balls in either direction, while a high ball crosses', () => {
  for (const side of [-1, 1]) {
    const st = game();
    const who = side < 0 ? 'bot' : 'you';
    ball(st, {pos: [x, 0.6, z + side * 0.3], vel: [0, 0, -side * 100], lastHit: who});
    st.botMiss = true;
    const ev = stepTennis(st, player(), 0.01);
    assert.deepEqual(ev, [{point: side < 0 ? 'you' : 'bot', reason: 'net'}]);
    assert.equal(st.ball, null);
  }
  const st = game();
  ball(st, {pos: [x, 2, z - 0.1], vel: [0, 0, 10]});
  assert.deepEqual(stepTennis(st, player(), 0.02), []);
  assert.ok(st.ball.pos[2] > z);
});

test('both sides win at five points, once, and a restart clears the score', () => {
  for (const winner of ['you', 'bot']) {
    const st = game();
    for (let i = 0; i < 4; i++) {
      const events = tennisPoint(st, winner, 'bounce');
      assert.equal(events.length, 1);
      assert.equal(st.active, true);
    }
    assert.deepEqual(tennisPoint(st, winner, 'bounce'), [{point: winner, reason: 'bounce'}, {win: winner}]);
    assert.equal(st.active, false);
    assert.equal(st.done, true);
    assert.deepEqual(tennisPoint(st, winner, 'bounce'), []);
    assert.deepEqual(stepTennis(st, player(), 10), []);
    assert.equal(st.score[winner], 5);
    startTennis(st);
    assert.deepEqual(st.score, {you: 0, bot: 0});
    assert.equal(st.done, false);
  }
});

test('release must be close: Kid reach is 1.35m and Big Kid is 0.8m', () => {
  assert.equal(tennisReach('kid'), 1.35);
  assert.equal(tennisReach('bigKid'), 0.8);
  for (const mode of ['kid', 'bigKid']) {
    const st = game(mode);
    ball(st, {pos: [x + 1, 0.45, z + 8]});
    assert.equal(swingTennis(st, {...player(), power: 0.5}), mode === 'kid');
    ball(st, {pos: [x + tennisReach(mode) + 0.001, 0.45, z + 8]});
    assert.equal(swingTennis(st, player()), false);
    ball(st, {pos: [x, 3, z + 8]});
    assert.equal(swingTennis(st, player()), false);
    ball(st, {pos: [x, 0.45, z - 0.2]});
    assert.equal(swingTennis(st, {pos: [x, 0, z + 0.2]}), false);
  }
});

test('Kid walks toward the incoming ball; Big Kid and outgoing balls never auto-step', () => {
  const st = game();
  ball(st, {pos: [x + 3, 0.8, z + 7], vel: [0, -1, 0]});
  const step = tennisAssist(st, player().pos, 0.1);
  assert.ok(step[0] > 0 && step[2] < 0);
  assert.ok(Math.hypot(...step) <= 0.275001);
  st.mode = 'bigKid';
  assert.deepEqual(tennisAssist(st, player().pos, 0.1), [0, 0, 0]);
  st.mode = 'kid';
  st.ball.lastHit = 'you';
  assert.deepEqual(tennisAssist(st, player().pos, 0.1), [0, 0, 0]);
});

test('power changes depth and left/right aim changes the landing side', () => {
  const landing = (power, aim, mode = 'kid') => {
    const st = game(mode);
    ball(st, {pos: [x, 0.45, z + 8]});
    assert.equal(swingTennis(st, {...player(), power, aim}), true);
    // Test the physical flight, with the bot intentionally letting this one go.
    st.botMiss = true;
    until(st, s => !s.ball || s.ball.bounces === 1);
    assert.ok(st.ball, 'shot cleared the net and landed in');
    return st.ball.pos;
  };
  assert.ok(landing(1, 0)[2] < landing(0, 0)[2] - 3);
  assert.ok(landing(0.5, -1)[0] < x - 4);
  assert.ok(landing(0.5, 1)[0] > x + 4);
  assert.ok(Math.abs(landing(0.5, 0.15)[0] - x) < 0.01);
  assert.ok(landing(0.5, 0.15, 'bigKid')[0] > x + 0.5);
});

test('scripted rally includes at least six returns using real flight and bot movement', () => {
  for (const mode of ['kid', 'bigKid']) {
    const st = game(mode, () => 0.5),
      p = player();
    let yours = 0,
      bots = 0;
    for (let i = 0; i < 120 * 60 && yours + bots < 8; i++) {
      const shift = tennisAssist(st, p.pos, 1 / 120);
      p.pos = p.pos.map((v, j) => v + shift[j]);
      for (const e of stepTennis(st, p, 1 / 120)) {
        assert.ok(!e.point, `rally ended: ${JSON.stringify(e)}`);
        if (e.hit) bots++;
      }
      if (canHitTennis(st, p.pos)) {
        assert.equal(swingTennis(st, {...p, power: 0.6}), true);
        yours++;
      }
    }
    assert.ok(yours >= 4 && bots >= 4, `${mode}: ${yours} player returns / ${bots} bot returns`);
    assert.deepEqual(st.score, {you: 0, bot: 0});
  }
});

test('bot miss decisions are 42% in Kid and one in five in Big Kid', () => {
  for (const [mode, expected] of [
    ['kid', 126],
    ['bigKid', 60]
  ]) {
    let misses = 0;
    for (let i = 0; i < 300; i++) {
      const st = game(mode, () => (i + 0.5) / 300);
      ball(st, {pos: [x, 0.45, z + 8]});
      swingTennis(st, player());
      if (st.botMiss) misses++;
    }
    assert.equal(misses, expected);
  }
  const st = game('kid', () => 0);
  ball(st, {pos: [x, 0.45, z + 8]});
  swingTennis(st, player());
  const events = until(st, s => s.score.you === 1);
  assert.equal(events.filter(e => e.hit).length, 0);
  assert.deepEqual(events.at(-1), {point: 'you', reason: 'bounce'});
});

test('walking away or stopping clears the ball without a win; pauses do not advance it', () => {
  const st = game();
  until(st, s => !!s.ball);
  const before = [...st.ball.pos];
  stepTennis(st, player(), 0);
  assert.deepEqual(st.ball.pos, before);
  stepTennis(st, {pos: [x + 20, 0, z]}, 0.1);
  assert.equal(st.active, false);
  assert.equal(st.ball, null);
  assert.deepEqual(st.score, {you: 0, bot: 0});
  startTennis(st);
  stopTennis(st);
  assert.equal(st.done, false);
  assert.equal(st.wait, 0);
});

test('Tennis wins load safely, persist, and default to zero for old saves', () => {
  for (const value of [undefined, -1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1]) {
    const storage = {getItem: () => JSON.stringify({tennisWins: value})};
    assert.equal(loadProgress(storage).tennisWins, 0);
  }
  let saved = '{}';
  const storage = {getItem: () => saved, setItem: (_, value) => (saved = value)};
  const progress = loadProgress(storage);
  progress.tennisWins = 4;
  saveProgress(storage, progress);
  assert.equal(loadProgress(storage).tennisWins, 4);
});

test('scene adapter shows the ball above terrain, hides stopped play, and disposes once', async () => {
  // Three scene objects work in Node; this does not launch a browser or renderer.
  const T = await import('../../vendor/three.module.js');
  const {createTennisCourt} = await import('./tennis.js');
  const scene = new T.Scene(),
    court = createTennisCourt(scene, () => 12);
  const root = scene.children[0];
  const mesh = root.children.find(o => o.geometry?.type === 'SphereGeometry');
  const bot = root.getObjectByName('RobotBody');
  const resources = new Set(),
    disposals = new Map();
  root.traverse(o => {
    if (o.geometry) resources.add(o.geometry);
    if (o.material) resources.add(o.material);
  });
  for (const resource of resources)
    resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  try {
    assert.equal(bot.visible, true, 'friendly bot waits on the court');
    assert.equal(mesh.visible, false);
    court.update([x + 200, 0, z]);
    assert.equal(root.visible, false);
    court.update(tennisStart(), false);
    assert.equal(root.visible, false, 'court game is hidden in the past');
    court.update(tennisStart(), true);
    assert.equal(root.visible, true);
    court.start('kid');
    court.step(1.21, {...player(), yaw: 0});
    assert.equal(mesh.visible, true);
    assert.ok(Math.abs(mesh.position.y - court.state.ball.pos[1] - 12.04) < 1e-8);
    court.stop();
    assert.equal(mesh.visible, false);
    assert.equal(bot.visible, true);
    assert.equal(court.state.active, false);
  } finally {
    court.dispose();
  }
  assert.equal(scene.children.length, 0);
  assert.equal(disposals.size, resources.size);
  for (const count of disposals.values()) assert.equal(count, 1);
});
