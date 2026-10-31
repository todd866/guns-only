import {rotate} from '../physics/math.mjs';

// Toy-scale kickers: five ordinary-speed jumps and three longer boost jumps.
// Coordinates are the foot of the ramp; heading points towards its lip (+Z at zero).
export const STUNT_JUMPS = [
  {id: 'bx-car-park', x: -435, z: 656.4, heading: 0, big: false},
  {id: 'runway-road', x: 938, z: 1756, heading: 0.72, big: false},
  {id: 'south-taxiway', x: 229, z: 1982, heading: 2.29, big: false},
  {id: 'desert', x: 1316, z: 1177, heading: -1.54, big: false},
  {id: 'base-road', x: -418.1, z: 717.7, heading: -3.13, big: false},
  {id: 'long-taxiway', x: 1884, z: 76, heading: 0.72, big: true},
  {id: 'long-runway', x: 1406, z: 259, heading: 0.72, big: true},
  {id: 'runway-side', x: 352, z: 1334, heading: 0.72, big: true}
].map(j => ({
  ...j,
  width: 6,
  length: j.big ? 12 : 8,
  height: j.big ? 1.8 : 0.9,
  // The real buggy reaches the easy lip at about 12 m/s (11.6 horizontally).
  // The big threshold exceeds its unboosted speed; boost reaches about 20 m/s.
  minSpeed: j.big ? 16 : 11,
  landing: j.big ? [16, 42, 7] : [5, 19, 6]
}));

export function jumpPoint(j, along, side = 0, y = 0) {
  return [
    j.x + Math.sin(j.heading) * along + Math.cos(j.heading) * side,
    y,
    j.z + Math.cos(j.heading) * along - Math.sin(j.heading) * side
  ];
}
export function jumpLocal(j, pos) {
  const x = pos[0] - j.x,
    z = pos[2] - j.z;
  return [
    x * Math.sin(j.heading) + z * Math.cos(j.heading),
    x * Math.cos(j.heading) - z * Math.sin(j.heading)
  ];
}
const rampY = (j, along) => j.height * Math.max(0, Math.min(1, along / j.length)) ** 2;

// One mesh and collider source. The curved foot avoids a sharp impact at RC wheel scale;
// the back and sides make the ramp solid when approached from the wrong direction.
export function jumpTriangles(j, heightAt = () => 0) {
  const triangles = [],
    w = j.width / 2,
    p = (a, s, top) => {
      const v = jumpPoint(j, a, s);
      v[1] = heightAt(v[0], v[2]) + (top ? rampY(j, a) : 0);
      return v;
    },
    quad = (a, b, c, d) => triangles.push([a, b, c], [a, c, d]);
  for (let i = 0; i < 32; i++) {
    const a = (j.length * i) / 32,
      b = (j.length * (i + 1)) / 32;
    quad(p(a, -w, true), p(b, -w, true), p(b, w, true), p(a, w, true));
    quad(p(a, -w, false), p(b, -w, false), p(b, -w, true), p(a, -w, true));
    quad(p(a, w, false), p(a, w, true), p(b, w, true), p(b, w, false));
  }
  quad(p(j.length, -w, false), p(j.length, w, false), p(j.length, w, true), p(j.length, -w, true));
  return triangles;
}

export function inLandingZone(j, pos, heightAt = () => 0) {
  const [along, side] = jumpLocal(j, pos),
    [near, far, halfWidth] = j.landing;
  return (
    along >= j.length + near &&
    along <= j.length + far &&
    Math.abs(side) <= halfWidth &&
    Math.abs(pos[1] - heightAt(pos[0], pos[2])) < 1
  );
}

export function createStuntJumps(found = [], heightAt = () => 0) {
  return {found: new Set(found), heightAt, riding: null, attempt: null, previous: null, slow: 0};
}
function clearAttempt(state) {
  state.riding = null;
  state.attempt = null;
  state.slow = 0;
}

// Called after every real physics step. Wheel contact on THIS ramp must precede takeoff;
// driving through a landing box, flying over a lip, recovery and teleporting cannot score.
export function stepStuntJumps(state, car, dt, enabled = true) {
  const prev = state.previous;
  state.previous = {pos: [...car.pos], placement: car.placement};
  if (
    !enabled ||
    !prev ||
    prev.placement !== car.placement ||
    Math.hypot(...car.pos.map((v, i) => v - prev.pos[i])) > Math.max(2, car.speed * dt * 3)
  ) {
    clearAttempt(state);
    return [];
  }
  const events = [],
    up = rotate(car.q, [0, 1, 0])[1];
  if (state.attempt) {
    const a = state.attempt;
    a.air += dt;
    if (car.wallImpact > 1.5 || (car.impact > 1 && up < 0.65) || car.contacts > 0 || a.air > 6) {
      const success =
        car.contacts > 0 &&
        up >= 0.65 &&
        car.wallImpact <= 1.5 &&
        a.fast &&
        a.air >= 0.18 &&
        inLandingZone(a.jump, car.pos, state.heightAt);
      const fresh = success && !state.found.has(a.jump.id);
      if (success) state.found.add(a.jump.id);
      events.push({type: success ? 'found' : 'miss', id: a.jump.id, fresh, count: state.found.size});
      clearAttempt(state);
    }
    return events;
  }
  if (car.contacts > 0) {
    state.riding = null;
    for (const j of STUNT_JUMPS) {
      const [along, side] = jumpLocal(j, car.pos);
      if (along < 0.5 || along > j.length + 0.4 || Math.abs(side) > j.width / 2) continue;
      const onRamp = car.wheels.some(w => {
        if (!w.contact || !w.contactPoint) return false;
        const [a, s] = jumpLocal(j, w.contactPoint);
        return (
          a > 0.4 &&
          a <= j.length &&
          Math.abs(s) <= j.width / 2 &&
          Math.abs(w.contactPoint[1] - state.heightAt(w.contactPoint[0], w.contactPoint[2]) - rampY(j, a)) <
            0.08
        );
      });
      if (onRamp) state.riding = {jump: j, along};
    }
  } else if (state.riding) {
    const {jump: j, along} = state.riding,
      [now, side] = jumpLocal(j, car.pos),
      speed = car.vel[0] * Math.sin(j.heading) + car.vel[2] * Math.cos(j.heading);
    state.riding = null;
    if (
      along >= j.length - 0.5 &&
      now >= j.length - 0.25 &&
      now < j.length + 1 &&
      Math.abs(side) < j.width / 2 &&
      speed > 1 &&
      up > 0.65
    ) {
      state.attempt = {jump: j, fast: speed >= j.minSpeed, air: 0};
      state.slow = state.attempt.fast ? 1.5 : 0;
      events.push({type: 'launch', id: j.id});
    }
  }
  return events;
}

// Wall-clock budget, consumed once per rendered frame, never once per physics substep.
export function stuntTimeScale(state, car, realDt, enabled = true) {
  if (!enabled || car.placement !== state.previous?.placement) {
    clearAttempt(state);
    return 1;
  }
  if (car.contacts > 0 || !state.attempt) {
    state.slow = 0;
    return 1;
  }
  const remaining = state.slow;
  state.slow = Math.max(0, remaining - realDt);
  return realDt > 0 && remaining > 0 ? 1 - 0.5 * Math.min(1, remaining / realDt) : 1;
}
