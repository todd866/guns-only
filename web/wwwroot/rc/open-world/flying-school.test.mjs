import test from 'node:test';
import assert from 'node:assert/strict';
import {createCar} from '../physics/car.mjs';
import {rotate} from '../physics/math.mjs';
import {createFlight, toggleFlight, stepFlight, FLIGHT} from '../physics/flight.mjs';
import {
  SCHOOL,
  createSchool,
  crossesRing,
  landingBoxContains,
  schoolLessons,
  ringNormal,
  startSchool,
  stopSchool,
  starsFor,
  stepSchool
} from './flying-school.mjs';

test('a segment through a ring passes, while a miss and wrong-side segment do not', () => {
  const r = [0, 0, 0, 0, 2];
  assert.equal(crossesRing([0, 0, 5], [0, 0, -5], r), true);
  assert.equal(crossesRing([3, 0, 5], [3, 0, -5], r), false);
  assert.equal(crossesRing([0, 0, -5], [0, 0, 5], r), false);
  assert.equal(crossesRing([0, 0, 0], [0, 0, 0], r), false);
});

test('ring radius follows the kid size toggle and loop rings have tilted normals', () => {
  assert.equal(schoolLessons('kid')[0].rings[0][4], 6);
  assert.equal(schoolLessons('bigKid')[0].rings[0][4], 4.5);
  const loop = schoolLessons('kid')[1];
  assert.ok(Math.abs(loop.normals[1][1]) > 0.1);
});

test('stars are 3 for all, 2 at seventy percent, and 1 for a finish', () => {
  assert.equal(starsFor(6, 6), 3);
  assert.equal(starsFor(7, 10), 2);
  assert.equal(starsFor(1, 10), 1);
});

test('landing box uses its runway-aligned fifteen metre half-size', () => {
  const [x, y, z] = SCHOOL.landing.center;
  assert.equal(landingBoxContains([x, y, z]), true);
  assert.equal(landingBoxContains([x + 30, y, z]), false);
  assert.equal(landingBoxContains([x, y + 5, z]), false);
});

test('straight lesson scores three stars from a scripted flight through all rings', () => {
  const st = createSchool();
  const start = startSchool(st);
  let previous = start.start.pos;
  const events = [];
  for (const r of st.lessons[0].rings) {
    const next = [r[0], r[1], r[2]];
    events.push(...stepSchool(st, {pos: next, prevPos: previous, flightMode: 'fly'}, 1));
    previous = next;
  }
  assert.ok(events.some(e => e.lessonDone === 1 && e.stars === 3));
  assert.equal(st.card[0].passed, 6);
});

test('a missed ring stays next, then lesson timeout gives one star and starts the next lesson', () => {
  const st = createSchool();
  startSchool(st);
  const r = st.lessons[0].rings[0];
  stepSchool(st, {pos: [r[0] + 20, r[1], r[2]], prevPos: [r[0] + 20, r[1], r[2] - 5], flightMode: 'fly'}, 1);
  assert.equal(st.next, 0);
  const ev = stepSchool(st, {pos: [0, 30, 0], prevPos: [0, 30, 0], flightMode: 'fly'}, 50);
  assert.ok(ev.some(e => e.lessonDone === 1 && e.stars === 1));
  const next = stepSchool(st, {pos: [0, 30, 0], prevPos: [0, 30, 0], flightMode: 'fly'}, 2.5);
  assert.ok(next.some(e => e.lessonStart === 2));
});

test('landing can finish after a partial ring run, but only stopped on the ground in the box', () => {
  const st = createSchool();
  startSchool(st);
  st.lesson = 2;
  st.lessons = schoolLessons();
  st.next = 0;
  st.passed = 0;
  const [x, y, z] = SCHOOL.landing.center;
  const fast = stepSchool(
    st,
    {pos: [x, y, z], prevPos: [x, y, z], flightMode: 'fly', speed: 20, onGround: true},
    45
  );
  assert.equal(
    fast.some(e => e.schoolDone),
    false
  );
  const done = stepSchool(
    st,
    {pos: [x, y, z], prevPos: [x, y, z], flightMode: null, speed: 4, onGround: true},
    0.1
  );
  assert.equal(
    done.some(e => e.schoolDone),
    true
  );
  assert.equal(st.active, false);
  assert.equal(
    stepSchool(st, {pos: [x, y, z], prevPos: [x, y, z], flightMode: null, speed: 4, onGround: true}, 1)
      .length,
    0
  );
});

test('a long forward segment can collect every straight ring in order', () => {
  const st = createSchool();
  startSchool(st);
  const first = st.lessons[0].rings[0],
    last = st.lessons[0].rings.at(-1);
  const axis = [0.656, -0.755];
  const before = [first[0] - axis[0] * 100, first[1], first[2] - axis[1] * 100];
  const events = stepSchool(st, {pos: [last[0], last[1], last[2]], prevPos: before, flightMode: 'fly'}, 1);
  assert.equal(events.filter(e => e.ring).length, 6);
  assert.equal(st.next, 6);
});

test('tilted loop crossing uses its actual normal and only forward travel scores', () => {
  const lesson = schoolLessons()[1];
  const n = lesson.normals[0],
    r = lesson.rings[0];
  const before = [r[0] - n[0] * 8, r[1] - n[1] * 8, r[2] - n[2] * 8];
  const after = [r[0] + n[0] * 8, r[1] + n[1] * 8, r[2] + n[2] * 8];
  assert.equal(crossesRing(before, after, r, n), true);
  assert.equal(crossesRing(after, before, r, n), false);
});

test('a complete school run records three perfect lessons and lands with approach time', () => {
  const st = createSchool();
  startSchool(st);
  for (let lessonNo = 0; lessonNo < 3; lessonNo++) {
    const lesson = st.lessons[lessonNo];
    let prev = lesson.start.pos;
    for (const r of lesson.rings) {
      const p = [r[0], r[1], r[2]];
      stepSchool(st, {pos: p, prevPos: prev, flightMode: 'fly', speed: 22}, 1);
      prev = p;
    }
    if (lessonNo < 2) stepSchool(st, {pos: prev, prevPos: prev, flightMode: 'fly'}, 2.5);
  }
  const [x, y, z] = SCHOOL.landing.center;
  const done = stepSchool(
    st,
    {pos: [x, y, z], prevPos: [x, y, z], flightMode: null, speed: 4, onGround: true},
    3
  );
  assert.equal(
    done.some(e => e.schoolDone),
    true
  );
  assert.deepEqual(
    st.card.map(row => row.stars),
    [3, 3, 3]
  );
  assert.ok(st.card[2].time >= 3);
});

test('grounded or chute movement never scores rings and a fast landing never reports', () => {
  const st = createSchool();
  startSchool(st);
  const r = st.lessons[0].rings[0];
  const before = [r[0] - 10, r[1], r[2]];
  stepSchool(st, {pos: [r[0] + 10, r[1], r[2]], prevPos: before, flightMode: null, onGround: true}, 1);
  assert.equal(st.passed, 0);
  st.lesson = 2;
  st.landingReady = true;
  const [x, y, z] = SCHOOL.landing.center;
  const ev = stepSchool(
    st,
    {pos: [x, y, z], prevPos: [x, y, z], flightMode: 'chute', speed: 2, onGround: true},
    1
  );
  assert.equal(
    ev.some(e => e.schoolDone),
    false
  );
});

test('driving far away cancels, while an airborne position does not', () => {
  const st = createSchool();
  startSchool(st);
  const far = [SCHOOL.at[0] + 500, 30, SCHOOL.at[2]];
  stepSchool(st, {pos: far, prevPos: far, flightMode: 'fly'}, 1);
  assert.equal(st.active, true);
  stepSchool(st, {pos: far, prevPos: far, flightMode: null}, 1);
  assert.equal(st.active, false);
});

test('the actual flyer can fly straight and hold a pull through the loop in both modes', () => {
  for (const mode of ['kid', 'bigKid'])
    for (const lesson of [0, 1]) {
      const st = createSchool();
      startSchool(st, {mode});
      st.lesson = lesson;
      const start = st.lessons[lesson].start;
      const car = createCar(undefined, start.pos, start.yaw),
        flight = createFlight();
      toggleFlight(flight, car);
      flight.climb = 0;
      flight.speed = FLIGHT.minSpeed + FLIGHT.startPower * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
      for (let t = 0; t < 15 && !st.pending; t += 1 / 120) {
        const prevPos = [...car.pos];
        stepFlight(flight, car, {pitch: lesson === 1 ? 1 : 0, assist: mode === 'kid'}, {}, 1 / 120);
        stepSchool(st, {pos: car.pos, prevPos, flightMode: flight.mode}, 1 / 120);
      }
      assert.equal(st.card.at(-1)?.stars, 3, `${mode}, lesson ${lesson + 1}`);
    }
});

test('landing with missed rings finishes immediately; airborne, fast or outside does not', () => {
  for (const change of [
    {flightMode: 'fly'},
    {flightMode: 'chute'},
    {speed: 8},
    {onGround: false},
    {pos: [500, 0, 1800]}
  ]) {
    const st = createSchool();
    startSchool(st);
    st.lesson = 2;
    const pos = [...SCHOOL.landing.center];
    const events = stepSchool(
      st,
      {pos, prevPos: pos, flightMode: null, speed: 0, onGround: true, ...change},
      1
    );
    assert.equal(
      events.some(e => e.schoolDone),
      false
    );
  }
  const st = createSchool();
  startSchool(st);
  st.lesson = 2;
  const pos = [...SCHOOL.landing.center];
  const events = stepSchool(st, {pos, prevPos: pos, flightMode: null, speed: 0, onGround: true}, 4);
  assert.equal(events.find(e => e.lessonDone)?.stars, 1);
  assert.equal(events.find(e => e.schoolDone)?.card[0].time, 4);
});

test('missing the next ring leaves it lit and permits a later retry', () => {
  const st = createSchool();
  startSchool(st);
  const r = st.lessons[0].rings[0],
    n = ringNormal(st.lessons[0], 0);
  const before = r.slice(0, 3).map((v, i) => v - n[i] * 10);
  const after = r.slice(0, 3).map((v, i) => v + n[i] * 10);
  const high = p => [p[0], p[1] + 10, p[2]];
  stepSchool(st, {pos: high(after), prevPos: high(before), flightMode: 'fly'}, 1);
  assert.equal(st.next, 0);
  stepSchool(st, {pos: after, prevPos: before, flightMode: 'fly'}, 1);
  assert.equal(st.next, 1);
});

test('a segment cannot collect gates encountered in reverse course order', () => {
  const st = createSchool();
  startSchool(st);
  st.lessons[0].rings = [
    [0, 30, -20, 0, 6],
    [0, 30, -10, 0, 6]
  ];
  stepSchool(st, {prevPos: [0, 30, 0], pos: [0, 30, -30], flightMode: 'fly'}, 1);
  assert.equal(st.passed, 1);
});

test('stopping and restarting clears the previous lesson and report', () => {
  const st = createSchool();
  startSchool(st);
  st.lesson = 2;
  st.card.push({stars: 3});
  stopSchool(st);
  assert.equal(st.active, false);
  const event = startSchool(st, {mode: 'bigKid'});
  assert.equal(event.lessonStart, 1);
  assert.deepEqual(st.card, []);
  assert.equal(st.lessons[0].rings[0][4], 4.5);
});

test('the landing approach clears Kid ground avoidance and the parachute lands in the box', () => {
  const world = {
    raycast(p, d, reach) {
      const dist = -p[1] / d[1];
      return d[1] < 0 && dist >= 0 && dist <= reach
        ? {dist, point: [p[0] + d[0] * dist, 0, p[2] + d[2] * dist], normal: [0, 1, 0]}
        : null;
    }
  };
  for (const mode of ['kid', 'bigKid']) {
    const st = createSchool();
    startSchool(st, {mode});
    st.lesson = 2;
    const lesson = st.lessons[2],
      car = createCar(undefined, lesson.start.pos, lesson.start.yaw),
      flight = createFlight();
    toggleFlight(flight, car);
    flight.climb = 0;
    flight.speed = FLIGHT.minSpeed + FLIGHT.startPower * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
    for (let t = 0; t < 20 && st.active; t += 1 / 120) {
      const prevPos = [...car.pos],
        r = lesson.rings[Math.min(st.next, 3)];
      const nose = rotate(car.q, [0, 0, -1]);
      const want = Math.atan2(r[1] - car.pos[1], Math.hypot(r[0] - car.pos[0], r[2] - car.pos[2]));
      const pitch = Math.max(-1, Math.min(1, (want - Math.asin(nose[1])) * 3));
      if (st.next === 4 && flight.mode === 'fly') toggleFlight(flight, car);
      stepFlight(flight, car, {pitch, assist: mode === 'kid'}, world, 1 / 120);
      stepSchool(
        st,
        {
          pos: car.pos,
          prevPos,
          flightMode: flight.mode,
          speed: Math.hypot(...car.vel),
          onGround: flight.mode === null && car.pos[1] < 1
        },
        1 / 120
      );
    }
    assert.equal(st.passed, 4, mode);
    assert.equal(st.active, false, `${mode} landed inside the box`);
    assert.equal(st.card.at(-1)?.stars, 3, mode);
  }
});
