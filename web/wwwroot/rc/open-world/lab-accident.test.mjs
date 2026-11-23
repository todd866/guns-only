import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../physics/world.mjs';
import {createCar, stepCar, rideHeight, BUGGY} from '../physics/car.mjs';
import {rotate} from '../physics/math.mjs';
import {
  LAB,
  TOUR_AT,
  TOUR_R,
  TOUR_LABEL,
  COLD_LAB,
  RIDE_S,
  GET_OUT,
  TEST_LINE,
  LAB_EVENTS,
  LOOK_YAW,
  LOOK_PITCH,
  SIGNS,
  WINDOWS,
  PORTALS,
  createLabState,
  beginLab,
  stepLab,
  carPoses,
  poseQuat,
  cameraAim,
  captionFor,
  tourNear,
  labAccidentQuery,
  labEntry,
  labSeen,
  markLabSeen,
  labUnderground,
  labWorld,
  labWorldTris,
  tunnelPoint
} from './lab-accident.mjs';

const storage = () => {
  const m = new Map();
  return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))};
};

test('the Det 3 tour pad sits in the Cold Lab hangar, off the race ring', () => {
  assert.equal(TOUR_LABEL, '🚝 Det 3 tour');
  assert.equal(tourNear(TOUR_AT), true);
  assert.equal(tourNear([TOUR_AT[0], 0, TOUR_AT[2] + TOUR_R + 3]), false);
  assert.equal(tourNear(COLD_LAB), false);
  assert.ok(TOUR_AT[2] < -700 && TOUR_AT[2] > -760, 'inside the hangar, north of the snow loop');
  assert.ok(Math.hypot(TOUR_AT[0] - COLD_LAB[0], TOUR_AT[2] - COLD_LAB[2]) > 40);
});

test('?at=lab-accident is the test shortcut and remembers a finished ride', () => {
  assert.equal(labAccidentQuery('?at=lab-accident'), true);
  assert.equal(labAccidentQuery('?at=coldlab'), false);
  const entry = labEntry('?at=lab-accident&mode=drive');
  assert.equal(entry.at, 'coldlab');
  assert.deepEqual(entry.pos, [...TOUR_AT]);
  assert.equal(labEntry('?at=gate'), null);
  const s = storage();
  assert.equal(labSeen(s), false);
  markLabSeen(s);
  assert.equal(labSeen(s), true);
  assert.equal(labSeen(null), false);
});

test('the ride is about 45s; the first viewing ignores A and Enter', () => {
  const s = createLabState({seen: false});
  assert.equal(beginLab(s), true);
  assert.deepEqual(s.events, [LAB_EVENTS.start]);
  assert.equal(LAB_EVENTS.start, 'lab_start');
  stepLab(s, 2.2, {skip: true});
  assert.equal(s.phase, 'ride');
  assert.ok(!s.events.includes('lab_ride_skipped'));
  assert.match(s.caption, /lick the crystals/);
  assert.match(captionFor('ride', 2), /lick the crystals/);
  stepLab(s, RIDE_S, {skip: true});
  assert.notEqual(s.phase, 'ride');
  assert.equal(s.seen, true);
  assert.ok(!s.events.includes(LAB_EVENTS.skipped));
});

test('after the first viewing, A or Enter skips the ride and keeps the experiment', () => {
  const s = createLabState({seen: true});
  beginLab(s);
  s.events.length = 0;
  stepLab(s, 1 / 60, {skip: true});
  assert.equal(s.phase, 'roll');
  assert.deepEqual(s.events, [LAB_EVENTS.skipped]);
  assert.equal(LAB_EVENTS.skipped, 'lab_ride_skipped');
  stepLab(s, 1 / 60, {skip: true});
  assert.equal(s.phase, 'roll');
  assert.deepEqual(s.events, [LAB_EVENTS.skipped]);
});

test('the beam, Test 7, the Breach and the get-out callout follow the ride', () => {
  const s = createLabState();
  beginLab(s);
  stepLab(s, RIDE_S + 3.2 + 0.2);
  assert.equal(s.phase, 'count');
  assert.equal(s.caption, TEST_LINE);
  assert.equal(TEST_LINE, 'Test 7. Go!');
  stepLab(s, 2.2 + 2);
  assert.equal(s.phase, 'beam');
  assert.ok(s.beam > 0.35 && s.beam < 0.75, s.beam);
  assert.ok(s.cues.includes('hum'));
  stepLab(s, 4);
  assert.equal(s.phase, 'accident');
  assert.ok(s.events.includes(LAB_EVENTS.reached));
  assert.equal(LAB_EVENTS.reached, 'lab_accident_reached');
  assert.ok(s.shake > 0);
  assert.ok(s.cues.includes('alarm'));
  assert.match(s.caption, /Breach/);
  stepLab(s, 5);
  assert.equal(s.portals.length, PORTALS);
  assert.equal(PORTALS, 4);
  assert.ok(s.portals.every(p => p > 0.85), s.portals.join(','));
  stepLab(s, 8);
  assert.equal(s.phase, 'free');
  assert.equal(s.callout, GET_OUT);
  assert.equal(GET_OUT, '🚨 Get out of the lab!');
  assert.equal(s.shake, 0);
  assert.ok(!s.events.includes(LAB_EVENTS.skipped));
});

test('look yaw and pitch stay clamped, and player 2 can look on their own', () => {
  const s = createLabState();
  beginLab(s);
  stepLab(s, 3, {lookX: 8, lookY: -8, look2X: -8, look2Y: 8});
  assert.equal(s.lookYaw, LOOK_YAW);
  assert.equal(s.lookPitch, -LOOK_PITCH);
  assert.equal(s.look2Yaw, -LOOK_YAW);
  assert.equal(s.look2Pitch, LOOK_PITCH);
});

test('both cars ride the flatbed, the tram goes downhill, and the nose follows', () => {
  const s = createLabState();
  beginLab(s);
  stepLab(s, 4);
  const both = carPoses(s, {split: true, lift: 0.2});
  const one = carPoses(s, {split: false, lift: 0.2});
  const apart = Math.hypot(both.p1[0] - both.p2[0], both.p1[2] - both.p2[2]);
  assert.ok(apart > 0.55 && apart < 1.3, apart);
  assert.equal(one.p2, null);
  assert.ok(tunnelPoint(1)[1] < tunnelPoint(0)[1] - 15);
  const nose = rotate(poseQuat(both.yaw, both.pitch), [0, 0, -1]);
  assert.ok(nose[1] < -0.05, nose);
  assert.ok(nose[2] < -0.5, nose);
  const cam = cameraAim(both, s, 0, s.time);
  assert.ok(cam.eye[2] > both.p1[2], 'camera sits behind the tram');
  stepLab(s, 80);
  const parked = carPoses(s, {split: true, lift: 0.2});
  assert.equal(parked.pitch, 0);
  assert.ok(labUnderground(parked.p1));
  assert.equal(labUnderground(TOUR_AT), false);
});

test('the ride names Det 3, COLD SEAM, the crystals, Hangar Zero and the Seam', () => {
  const text = [...SIGNS.map(s => s.text), ...WINDOWS.map(w => w.kind)].join(' ');
  assert.match(text, /DET 3/);
  assert.match(text, /COLD SEAM/);
  assert.match(text, /HANGAR ZERO/);
  assert.ok(WINDOWS.some(w => w.kind === 'crystals'));
  assert.ok(WINDOWS.some(w => w.kind === 'robots'));
  assert.ok(WINDOWS.some(w => w.kind === 'saucer'));
  assert.match(text, /SEAM/);
});

test('the chamber floor holds a car and the exits stay sealed', () => {
  const tris = labWorldTris();
  assert.ok(tris.length > 20 && tris.length < 400, tris.length);
  const gates = new Set(tris.map(t => t.gate).filter(Boolean));
  assert.ok(gates.has('lab:out'));
  assert.ok(gates.has('lab:in'));
  const w = createWorld();
  for (const t of tris) w.addTri(t.a, t.b, t.c, t.surface, t.gate);
  const floor = labWorld([0, 0, 0]);
  const car = createCar(BUGGY, [floor[0], floor[1] + 0.6, floor[2]], 0);
  for (let i = 0; i < 360; i++) stepCar(car, {throttle: 0, steer: 0, brake: true}, w, 1 / 120);
  assert.ok(car.contacts > 0, 'wheels on the floor');
  assert.ok(Math.abs(car.pos[1] - (floor[1] + rideHeight(BUGGY))) < 0.2, car.pos[1]);
  const door = labWorld([0, 0.3, -(LAB.radius - 2.4)]);
  const out = createCar(BUGGY, [door[0], door[1] + rideHeight(BUGGY), door[2]], 0);
  let furthest = out.pos[2];
  for (let i = 0; i < 360; i++) {
    stepCar(out, {throttle: 1, steer: 0, brake: false}, w, 1 / 120);
    furthest = Math.min(furthest, out.pos[2]);
  }
  assert.ok(furthest > LAB.anchor[2] - LAB.radius + 0.15, furthest);
});
