// Pure rules for the little Flying School course.  Coordinates are world metres;
// the drawing layer turns these authored rings into meshes.

const RUNWAY_YAW = Math.atan2(0.656, 0.755);
const AXIS = [Math.sin(RUNWAY_YAW), -Math.cos(RUNWAY_YAW)];
const RUNWAY = [24, 1842];
const SCHOOL_AT = [-36, 1800];

export const SCHOOL = Object.freeze({
  at: [SCHOOL_AT[0], 0, SCHOOL_AT[1]],
  startRadius: 12,
  leaveRadius: 400,
  landing: {center: [RUNWAY[0] + AXIS[0] * 8, 0, RUNWAY[1] + AXIS[1] * 8], half: 15, yaw: RUNWAY_YAW}
});

const forward = (along, y) => [SCHOOL_AT[0] + AXIS[0] * along, y, SCHOOL_AT[1] + AXIS[1] * along];
const ring = (p, yaw, radius) => [p[0], p[1], p[2], yaw, radius];
const L1 = Array.from({length: 6}, (_, i) => ring(forward(45 + i * 35, 30), RUNWAY_YAW, 6));
const L1_START = {pos: [...forward(0, 30)], yaw: RUNWAY_YAW};

const loopRings = [];
const loopNormals = [];
const loopCenterAlong = 90,
  loopCenterY = 44,
  loopRadius = 14;
for (let i = 0; i < 8; i++) {
  const theta = -Math.PI / 2 + ((i + 1) * Math.PI * 2) / 8;
  const p = forward(
    loopCenterAlong + loopRadius * Math.cos(theta),
    loopCenterY + loopRadius * Math.sin(theta)
  );
  const tangentAlong = -Math.sin(theta),
    tangentY = Math.cos(theta),
    len = Math.hypot(tangentAlong, tangentY);
  const axisLen = Math.hypot(AXIS[0], AXIS[1]);
  const nx = (AXIS[0] * tangentAlong) / (len * axisLen),
    nz = (AXIS[1] * tangentAlong) / (len * axisLen);
  loopRings.push(ring(p, Math.atan2(nx, -nz), 6));
  loopNormals.push([nx, tangentY / len, nz]);
}
const L2_START = {pos: [...forward(loopCenterAlong, 30)], yaw: RUNWAY_YAW};

const approach = [170, 105, 45, 0];
const L3 = approach.map((along, i) => {
  // Finish ten metres over the threshold: Kid mode's ground avoidance must not pull the
  // flyer away from its last ring. The parachute sheds speed inside the landing box.
  const p = [RUNWAY[0] - AXIS[0] * along, 30 - i * (20 / 3), RUNWAY[1] - AXIS[1] * along];
  return ring(p, RUNWAY_YAW, 6);
});
const L3_START = {pos: [RUNWAY[0] - AXIS[0] * 205, 35, RUNWAY[1] - AXIS[1] * 205], yaw: RUNWAY_YAW};

export const LESSONS = Object.freeze([
  Object.freeze({name: 'Straight and level', rings: L1, start: L1_START, limit: 45}),
  Object.freeze({name: 'Loop', rings: loopRings, normals: loopNormals, start: L2_START, limit: 60}),
  Object.freeze({name: 'Landing', rings: L3, start: L3_START})
]);

export function schoolLessons(mode = 'kid', groundY = 0) {
  const radius = mode === 'bigKid' ? 4.5 : 6;
  return LESSONS.map(lesson => ({
    ...lesson,
    rings: lesson.rings.map(([x, y, z, yaw]) => [x, y + groundY, z, yaw, radius]),
    start: {
      pos: [lesson.start.pos[0], lesson.start.pos[1] + groundY, lesson.start.pos[2]],
      yaw: lesson.start.yaw
    },
    normals: lesson.normals?.map(n => [...n])
  }));
}

export function ringNormal(lesson, index) {
  if (lesson.normals?.[index]) return [...lesson.normals[index]];
  const yaw = lesson.rings[index][3];
  return [Math.sin(yaw), 0, -Math.cos(yaw)];
}

export function crossesRing(prevPos, pos, ringData, normal) {
  return crossingFraction(prevPos, pos, ringData, normal) !== null;
}

// Keep the intersection time as well as the hit: several gates in one physics segment must
// still be crossed in course order (particularly when the loop folds back on itself).
function crossingFraction(prevPos, pos, ringData, normal) {
  const n = normal || [Math.sin(ringData[3]), 0, -Math.cos(ringData[3])];
  const d0 =
    (prevPos[0] - ringData[0]) * n[0] + (prevPos[1] - ringData[1]) * n[1] + (prevPos[2] - ringData[2]) * n[2];
  const d1 = (pos[0] - ringData[0]) * n[0] + (pos[1] - ringData[1]) * n[1] + (pos[2] - ringData[2]) * n[2];
  if (!(d0 < -1e-7 && d1 >= -1e-7)) return null;
  const denom = d0 - d1;
  const t = Math.abs(denom) > 1e-9 ? d0 / denom : 0.5;
  if (t < -1e-7 || t > 1 + 1e-7) return null;
  const q = [
    prevPos[0] + (pos[0] - prevPos[0]) * t - ringData[0],
    prevPos[1] + (pos[1] - prevPos[1]) * t - ringData[1],
    prevPos[2] + (pos[2] - prevPos[2]) * t - ringData[2]
  ];
  const planeDistance = q[0] * n[0] + q[1] * n[1] + q[2] * n[2];
  const radial = Math.max(0, q[0] * q[0] + q[1] * q[1] + q[2] * q[2] - planeDistance * planeDistance);
  return radial <= (ringData[4] ?? 6) ** 2 + 1e-7 ? t : null;
}

export function starsFor(passed, total) {
  if (total <= 0) return 1;
  if (passed >= total) return 3;
  if (passed / total >= 0.7) return 2;
  return 1;
}

export function landingBoxContains(pos, groundY = 0) {
  const dx = pos[0] - SCHOOL.landing.center[0],
    dz = pos[2] - SCHOOL.landing.center[2];
  const c = Math.cos(SCHOOL.landing.yaw),
    s = Math.sin(SCHOOL.landing.yaw);
  const along = dx * s - dz * c,
    across = dx * c + dz * s;
  return (
    Math.abs(along) <= SCHOOL.landing.half &&
    Math.abs(across) <= SCHOOL.landing.half &&
    Math.abs((pos[1] ?? groundY) - groundY) <= 3
  );
}

export function createSchool() {
  return {
    active: false,
    mode: 'kid',
    groundY: 0,
    lessons: schoolLessons(),
    lesson: 0,
    next: 0,
    passed: 0,
    elapsed: 0,
    pending: 0,
    landingReady: false,
    lessonRecorded: false,
    card: [],
    reported: false
  };
}

export function startSchool(st, {mode = 'kid', groundY = 0} = {}) {
  Object.assign(st, {
    active: true,
    mode,
    groundY,
    lessons: schoolLessons(mode, groundY),
    lesson: 0,
    next: 0,
    passed: 0,
    elapsed: 0,
    pending: 0,
    landingReady: false,
    lessonRecorded: false,
    card: [],
    reported: false
  });
  return {lessonStart: 1, start: st.lessons[0].start};
}

export function stopSchool(st) {
  st.active = false;
  st.pending = 0;
  return st;
}

export function stepSchool(st, {pos, prevPos, flightMode, speed = 0, onGround = false}, dt = 0) {
  const events = [];
  if (!st.active) return events;
  dt = Math.max(0, dt);
  const dx = pos[0] - SCHOOL.at[0],
    dz = pos[2] - SCHOOL.at[2];
  if (flightMode == null && dx * dx + dz * dz > SCHOOL.leaveRadius ** 2) {
    stopSchool(st);
    return events;
  }
  if (st.pending) {
    st.pending += dt;
    if (st.pending >= 2.5) {
      st.pending = 0;
      st.lesson++;
      st.next = 0;
      st.passed = 0;
      st.elapsed = 0;
      st.landingReady = false;
      st.lessonRecorded = false;
      events.push({lessonStart: st.lesson + 1, start: st.lessons[st.lesson].start});
    }
    return events;
  }
  const lesson = st.lessons[st.lesson];
  st.elapsed += dt;
  let lastCrossing = -1;
  if (flightMode === 'fly')
    while (st.next < lesson.rings.length) {
      const t = crossingFraction(prevPos, pos, lesson.rings[st.next], ringNormal(lesson, st.next));
      if (t === null || t < lastCrossing) break;
      lastCrossing = t;
      st.next++;
      st.passed++;
      events.push({ring: st.passed, of: lesson.rings.length});
    }
  const timedOut = st.lesson < 2 && st.elapsed >= lesson.limit;
  const ringsDone = st.next >= lesson.rings.length;
  if (st.lesson === 2 && !st.landingReady && (ringsDone || st.elapsed >= 45)) {
    st.landingReady = true;
    events.push({landing: true});
  }
  const legalLanding =
    st.lesson === 2 && flightMode === null && onGround && speed < 8 && landingBoxContains(pos, st.groundY);
  if (!st.lessonRecorded && (st.lesson < 2 ? timedOut || ringsDone : legalLanding)) {
    st.lessonRecorded = true;
    const stars = starsFor(st.passed, lesson.rings.length);
    st.card.push({name: lesson.name, passed: st.passed, total: lesson.rings.length, time: st.elapsed, stars});
    events.push({lessonDone: st.lesson + 1, stars});
    if (st.lesson < 2) {
      st.pending = 0.000001;
      return events;
    }
  }
  if (st.lesson === 2 && st.lessonRecorded && legalLanding && !st.reported) {
    st.reported = true;
    st.active = false;
    events.push({schoolDone: true, card: st.card});
  }
  return events;
}
