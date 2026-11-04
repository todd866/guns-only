import test from 'node:test';
import assert from 'node:assert/strict';
import {createCar} from '../physics/car.mjs';
import {rotate} from '../physics/math.mjs';
import {createFlight, toggleFlight, stepFlight, FLIGHT} from '../physics/flight.mjs';
import {createSchool, startSchool, stepSchool, schoolLessons, ringNormal} from './flying-school.mjs';

const DT = 1 / 120;
const flatWorld = {
  raycast(p, d, reach) {
    const dist = -p[1] / d[1];
    return d[1] < 0 && dist >= 0 && dist <= reach
      ? {dist, point: [p[0] + d[0] * dist, 0, p[2] + d[2] * dist], normal: [0, 1, 0]}
      : null;
  }
};

/** Simple proportional pilot toward the next ring (Kid Auto-GCAS on). */
function pilotCtl(car, ring, normal, {loop = false} = {}) {
  const n = normal ?? [0, 0, -1];
  const lead = loop ? 0 : 10;
  const aim = [ring[0] - n[0] * lead, ring[1] - n[1] * lead, ring[2] - n[2] * lead];
  const dx = aim[0] - car.pos[0],
    dy = aim[1] - car.pos[1],
    dz = aim[2] - car.pos[2];
  const horiz = Math.hypot(dx, dz) || 1;
  const wantPitch = Math.atan2(dy, horiz);
  const nose = rotate(car.q, [0, 0, -1]);
  let pitch = Math.max(-1, Math.min(1, (wantPitch - Math.asin(Math.max(-1, Math.min(1, nose[1])))) * 3));
  // Vertical loop needs sustained pull; proportional pitch alone levels off between gates.
  if (loop) pitch = Math.max(pitch, 1);
  const wantYaw = Math.atan2(ring[0] - car.pos[0], -(ring[2] - car.pos[2]));
  const headYaw = Math.atan2(nose[0], -nose[2]);
  let yawErr = wantYaw - headYaw;
  while (yawErr > Math.PI) yawErr -= 2 * Math.PI;
  while (yawErr < -Math.PI) yawErr += 2 * Math.PI;
  const right = rotate(car.q, [1, 0, 0]);
  const rollGain = loop ? 0 : 2.5;
  const roll = Math.max(-1, Math.min(1, yawErr * rollGain - right[1] * (loop ? 0 : 1.2)));
  return {pitch, roll, power: 0};
}

function primeFlight(flight, car) {
  toggleFlight(flight, car);
  flight.climb = 0;
  flight.speed = FLIGHT.minSpeed + FLIGHT.startPower * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
}

function flyLessonRings({lessonIndex, burner = false, maxSeconds = 90}) {
  const st = createSchool();
  startSchool(st, {mode: 'kid'});
  st.lesson = lessonIndex;
  st.next = 0;
  st.passed = 0;
  const lesson = st.lessons[lessonIndex];
  const car = createCar(undefined, lesson.start.pos, lesson.start.yaw);
  const flight = createFlight();
  primeFlight(flight, car);
  const loop = lessonIndex === 1;
  const maxSteps = Math.ceil(maxSeconds / DT);
  let passed = 0;
  for (let i = 0; i < maxSteps && st.next < lesson.rings.length; i++) {
    const prevPos = [...car.pos];
    const idx = st.next;
    const ring = lesson.rings[idx];
    const n = ringNormal(lesson, idx);
    const ctl = {...pilotCtl(car, ring, n, {loop}), assist: true, burner};
    stepFlight(flight, car, ctl, flatWorld, DT);
    stepSchool(
      st,
      {
        pos: car.pos,
        prevPos,
        flightMode: flight.mode,
        speed: Math.hypot(...car.vel),
        onGround: flight.mode === null && car.pos[1] < 1
      },
      DT
    );
    passed = st.passed;
    if (st.next >= lesson.rings.length) break;
  }
  return {passed, total: lesson.rings.length, next: st.next};
}

test('Kid assist pilot clears lesson 2 loop at normal power (all eight rings)', () => {
  const {passed, total} = flyLessonRings({lessonIndex: 1, burner: false, maxSeconds: 75});
  assert.equal(passed, total, `loop rings passed ${passed}/${total}`);
  assert.equal(total, 8);
});

// Measured: afterburner ~0/8 — overspeed outruns the vertical loop; Kid course requires normal power.
test('Kid assist pilot on lesson 2 loop with afterburner (informational ring count)', () => {
  const {passed, total} = flyLessonRings({lessonIndex: 1, burner: true, maxSeconds: 60});
  assert.ok(passed < total, `afterburner loop ${passed}/${total}, normal power is the fair Kid path`);
});

test('Kid assist pilot reaches lesson 3 last low ring without GCAS blocking the gate', () => {
  const st = createSchool();
  startSchool(st, {mode: 'kid'});
  st.lesson = 2;
  st.next = 0;
  st.passed = 0;
  const lesson = st.lessons[2];
  const car = createCar(undefined, lesson.start.pos, lesson.start.yaw);
  const flight = createFlight();
  primeFlight(flight, car);
  const lastIdx = lesson.rings.length - 1;
  for (let i = 0; i < 120 / DT && st.next < lesson.rings.length; i++) {
    const prevPos = [...car.pos];
    const idx = st.next;
    const ring = lesson.rings[idx];
    const ctl = {...pilotCtl(car, ring, ringNormal(lesson, idx)), assist: true};
    stepFlight(flight, car, ctl, flatWorld, DT);
    stepSchool(
      st,
      {
        pos: car.pos,
        prevPos,
        flightMode: flight.mode,
        speed: Math.hypot(...car.vel),
        onGround: flight.mode === null && car.pos[1] < 1
      },
      DT
    );
  }
  assert.equal(st.passed, lesson.rings.length, `landing rings ${st.passed}/${lesson.rings.length}`);
  const last = lesson.rings[lastIdx];
  assert.ok(last[1] >= 8, 'last ring centre stays above Kid GCAS conflict height');
});

test('kid lesson 3 last ring height matches authored course', () => {
  const rings = schoolLessons('kid')[2].rings;
  assert.equal(rings.length, 4);
  assert.ok(rings[3][1] <= 12 && rings[3][1] >= 8);
});
