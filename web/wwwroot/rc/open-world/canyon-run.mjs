import {CANYON, CANYON_LENGTH, canyonPoint} from './canyon.mjs';

const firstAlong = CANYON_LENGTH - 180,
  first = canyonPoint(firstAlong);
export const CANYON_RUN = Object.freeze({
  location: Object.freeze({
    id: 'canyon-run',
    kind: 'activity',
    game: 'canyon-run',
    name: 'Canyon Run',
    short: 'Canyon',
    icon: '🏜️',
    color: '#ffd064',
    pos: Object.freeze([first.x, 0, first.z])
  }),
  total: 10,
  kidRadius: 10,
  bigKidRadius: 7,
  firstAlong,
  lastAlong: 180,
  // Measured by the real stepFlight pilot in sky-tour-canyon.test.mjs (normal power, GCAS).
  referenceTime: 119.344,
  medals: Object.freeze({gold: 1.15, silver: 1.4, bronze: 2})
});

// A low first gate welcomes takeoff; the rest climb gently to 40 m above the river bed.
export const canyonRunAltitude = along => 16 + 24 * Math.max(0, Math.min(1, (firstAlong - along) / 180));
export function canyonGates({heightAt = () => 0, mode = 'kid'} = {}) {
  const radius = mode === 'bigKid' ? CANYON_RUN.bigKidRadius : CANYON_RUN.kidRadius;
  return Array.from({length: CANYON_RUN.total}, (_, i) => {
    const along = firstAlong + ((CANYON_RUN.lastAlong - firstAlong) * i) / (CANYON_RUN.total - 1);
    const p = canyonPoint(along),
      next = canyonPoint(along - 2),
      yaw = Math.atan2(next.x - p.x, -(next.z - p.z));
    const floor = heightAt(p.x, p.z);
    return {
      x: p.x,
      y: floor + canyonRunAltitude(along),
      z: p.z,
      floor,
      yaw,
      radius,
      along,
      nx: Math.sin(yaw),
      nz: -Math.cos(yaw)
    };
  });
}

// Direct arrivals use the river bed and point into the first gate, not a road on the rim.
export function canyonArrival(heightAt) {
  const p = canyonPoint(firstAlong + 30),
    next = canyonPoint(p.along - 2);
  return {pos: [p.x, heightAt(p.x, p.z), p.z], yaw: Math.atan2(next.x - p.x, -(next.z - p.z))};
}

function crossingFraction(a, b, gate) {
  const d0 = (a[0] - gate.x) * gate.nx + (a[2] - gate.z) * gate.nz;
  const d1 = (b[0] - gate.x) * gate.nx + (b[2] - gate.z) * gate.nz;
  if (!(d0 < -1e-7 && d1 >= -1e-7)) return null;
  const t = d0 / (d0 - d1),
    x = a[0] + (b[0] - a[0]) * t - gate.x;
  const y = a[1] + (b[1] - a[1]) * t - gate.y,
    z = a[2] + (b[2] - a[2]) * t - gate.z;
  return x * x + y * y + z * z <= gate.radius ** 2 ? t : null;
}

export function createCanyonRun({heightAt = () => 0, mode = 'kid', best = null} = {}) {
  return {
    active: false,
    prepared: false,
    mode,
    gates: canyonGates({heightAt, mode}),
    next: 0,
    elapsed: 0,
    best,
    medal: null,
    events: []
  };
}
export function stopCanyonRun(st) {
  st.active = st.prepared = false;
  st.next = st.elapsed = 0;
  return st;
}
export function canyonMedal(time) {
  if (time <= CANYON_RUN.referenceTime * CANYON_RUN.medals.gold) return 'gold';
  if (time <= CANYON_RUN.referenceTime * CANYON_RUN.medals.silver) return 'silver';
  if (time <= CANYON_RUN.referenceTime * CANYON_RUN.medals.bronze) return 'bronze';
  // No failure: finishing still earns bronze after the timed medal targets.
  return 'bronze';
}
export function stepCanyonRun(st, pilot, dt = 0) {
  const events = st.events;
  events.length = 0;
  const {pos, prevPos = pos, flightMode = null} = pilot;
  dt = Math.max(0, dt);
  const gate = st.gates[0],
    dx = pos[0] - gate.x,
    dz = pos[2] - gate.z;
  const near = dx * dx + dz * dz < 24 ** 2;
  if (
    pos[0] < CANYON.bounds[0] - 300 ||
    pos[0] > CANYON.bounds[2] + 300 ||
    pos[2] < CANYON.bounds[1] - 300 ||
    pos[2] > CANYON.bounds[3] + 300
  ) {
    stopCanyonRun(st);
    return events;
  }
  if (!st.active) {
    if (st.next === CANYON_RUN.total && !near) st.next = 0;
    if (!near) st.prepared = false;
    const t = flightMode === 'fly' ? crossingFraction(prevPos, pos, gate) : null;
    // A driver can take off inside the first gate after seeing the return hint.
    const takeoff =
      st.prepared && flightMode === 'fly' && dx * dx + dz * dz + (pos[1] - gate.y) ** 2 <= gate.radius ** 2;
    if (t !== null || takeoff) {
      st.active = true;
      st.prepared = false;
      st.next = 1;
      st.medal = null;
      st.elapsed = dt * (1 - (t ?? 1));
      events.push({start: true});
    } else if (near && !st.prepared && !flightMode && Math.abs(pos[1] - gate.floor) < 4) {
      st.prepared = true;
      events.push({prepare: true});
    }
    return events;
  }
  st.elapsed += dt;
  if (flightMode !== 'fly') return events;
  let fraction = -1;
  while (st.next < st.gates.length) {
    const t = crossingFraction(prevPos, pos, st.gates[st.next]);
    if (t === null || t < fraction) break;
    fraction = t;
    st.next++;
    if (st.next < st.gates.length) events.push({gate: st.next, of: CANYON_RUN.total});
    else {
      st.elapsed -= dt * (1 - t);
      st.active = false;
      st.best = st.best == null ? st.elapsed : Math.min(st.best, st.elapsed);
      st.medal = canyonMedal(st.elapsed);
      events.push({done: true, time: st.elapsed, medal: st.medal, best: st.best});
    }
  }
  return events;
}
