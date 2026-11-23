// Deep Time Lab, stage 1 (docs/design/alien-research-lab.md): the Det 3 tram ride under the
// Cold-Weather Test Hangar, then Test 7, the Breach, and a sealed chamber. Pure timing and
// collision. Drawing lives in lab-accident.js. Local frame: +x east, +y up, +z south (back
// toward the hangar). The chamber floor is LAB.anchor.
import {boxTris} from './mine.mjs';
import {quatAxisAngle, quatMul, rotate} from '../physics/math.mjs';

export const COLD_LAB = Object.freeze([2040, 0, -690]);
export const TOUR_AT = Object.freeze([2040, 0.5, -748]);
export const TOUR_R = 8;
export const TOUR_LABEL = '🚝 Det 3 tour';
export const RIDE_S = 45;
export const ROLL_S = 3.2;
export const COUNT_S = 2.2;
export const BEAM_S = 4;
export const ACCIDENT_S = 6.5;
export const GET_OUT = '🚨 Get out of the lab!';
export const TEST_LINE = 'Test 7. Go!';
export const LAB_EVENTS = Object.freeze({
  start: 'lab_start',
  skipped: 'lab_ride_skipped',
  reached: 'lab_accident_reached'
});
export const LOOK_YAW = 0.85;
export const LOOK_PITCH = 0.42;
export const PORTALS = 4;
export const SEEN_KEY = 'guns-only.rc.lab-seen.v1';
export const LAB = Object.freeze({
  anchor: [2040, -28, -830],
  radius: 11,
  height: 5.2,
  segments: 16
});
// Inside the south doorway, where the tram stops before the car rolls to the pad.
const ARRIVE = Object.freeze([0, 0.35, LAB.radius - 2.2]);
const PHASES = Object.freeze([
  ['ride', RIDE_S, 'roll'],
  ['roll', ROLL_S, 'count'],
  ['count', COUNT_S, 'beam'],
  ['beam', BEAM_S, 'accident'],
  ['accident', ACCIDENT_S, 'free']
]);

export const CAPTIONS = Object.freeze([
  {t0: 0.8, t1: 7, text: 'Good morning, Saucer Springs Lab. Please do not lick the crystals.'},
  {t0: 8, t1: 14, text: 'Det 3 tour. Wheels stay on the tram.'},
  {t0: 16, t1: 23, text: 'Program COLD SEAM. The rocks down here are warm.'},
  {t0: 24, t1: 31, text: 'Wave at the robots. They always wave first.'},
  {t0: 33, t1: 39, text: 'Hangar Zero. Do not peek at the saucer.'},
  {t0: 40, t1: 45.5, text: 'Test chamber ahead. You are Test 7.'}
]);
export const SIGNS = Object.freeze([
  {at: 'tunnel', u: 0.14, text: 'DET 3', blink: true},
  {at: 'tunnel', u: 0.36, text: 'DO NOT LICK', blink: true},
  {at: 'tunnel', u: 0.58, text: 'COLD SEAM', blink: true},
  {at: 'tunnel', u: 0.78, text: 'HANGAR ZERO', blink: false},
  {at: 'chamber', u: 0, text: 'THE SEAM', blink: true},
  {at: 'door', u: 0, text: 'SURFACE', blink: true}
]);
export const WINDOWS = Object.freeze([
  {u: 0.3, kind: 'robots', side: 1},
  {u: 0.52, kind: 'crystals', side: -1},
  {u: 0.74, kind: 'saucer', side: 1}
]);
export const PORTAL_AT = Object.freeze([
  [7.2, 1.7, 1.5],
  [-7.2, 1.7, -1.2],
  [1.6, 1.7, -7.2],
  [-2.2, 1.7, 6.6]
]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = u => {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
};

export const labWorld = ([x, y, z]) => [LAB.anchor[0] + x, LAB.anchor[1] + y, LAB.anchor[2] + z];
export const labLocal = ([x, y, z]) => [x - LAB.anchor[0], y - LAB.anchor[1], z - LAB.anchor[2]];

export function tunnelPoint(u) {
  const e = smooth(u),
    b = labWorld(ARRIVE);
  return [
    TOUR_AT[0] + (b[0] - TOUR_AT[0]) * e,
    TOUR_AT[1] + (b[1] - TOUR_AT[1]) * e,
    TOUR_AT[2] + (b[2] - TOUR_AT[2]) * e
  ];
}
export function tunnelYaw() {
  const a = tunnelPoint(0),
    b = tunnelPoint(1);
  return Math.atan2(b[0] - a[0], -(b[2] - a[2]));
}
export function deckPitch() {
  const a = tunnelPoint(0),
    b = tunnelPoint(1),
    run = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  return Math.atan2(a[1] - b[1], run);
}
export function rideU(state) {
  if (!state || state.phase === 'idle') return 0;
  if (state.phase === 'ride') return clamp(state.t / RIDE_S, 0, 1);
  return 1;
}
export function beside(u, side, out = 3.4) {
  const p = tunnelPoint(u),
    yaw = tunnelYaw(),
    rx = Math.cos(yaw),
    rz = Math.sin(yaw);
  return [p[0] + rx * side * out, p[1], p[2] + rz * side * out];
}

// Positive pitch noses the car down the slope. Yaw matches placeCar (forward is −Z at yaw 0).
export function poseQuat(yaw, pitch) {
  return quatMul(quatAxisAngle([0, 1, 0], -yaw), quatAxisAngle([1, 0, 0], -pitch));
}

export function tourNear(pos) {
  return !!pos && Math.hypot(pos[0] - TOUR_AT[0], pos[2] - TOUR_AT[2]) <= TOUR_R;
}
export function labAccidentQuery(search = '') {
  return new URLSearchParams(String(search)).get('at') === 'lab-accident';
}
export function labEntry(search) {
  if (!labAccidentQuery(search)) return null;
  return {at: 'coldlab', pos: [...TOUR_AT], yaw: tunnelYaw()};
}
export function labSeen(storage) {
  try {
    return storage?.getItem?.(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
export function markLabSeen(storage) {
  try {
    storage?.setItem?.(SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}
export function labUnderground(pos) {
  if (!pos) return false;
  const [x, y, z] = labLocal(pos);
  return y < LAB.height + 2 && y > -2 && Math.hypot(x, z) < LAB.radius + 3;
}
export function labBusy(state) {
  return !!state && state.phase !== 'idle' && state.phase !== 'free';
}

export function captionFor(phase, t) {
  if (phase === 'count') return TEST_LINE;
  if (phase === 'roll') return 'Onto the pad.';
  if (phase === 'beam') return 'The beam is warm. Hold still.';
  if (phase === 'accident') return 'The Breach! The Seam is open!';
  if (phase !== 'ride') return '';
  return CAPTIONS.find(c => t >= c.t0 && t < c.t1)?.text ?? '';
}

function portalLevels(phase, t) {
  if (phase === 'free') return [1, 1, 1, 1];
  if (phase !== 'accident') return [0, 0, 0, 0];
  return [0, 1, 2, 3].map(i => clamp((t - i * 0.55) / 1.05, 0, 1));
}

export function createLabState({seen = false} = {}) {
  return {
    phase: 'idle',
    t: 0,
    time: 0,
    seen: !!seen,
    skipped: false,
    lookYaw: 0,
    lookPitch: 0,
    look2Yaw: 0,
    look2Pitch: 0,
    events: [],
    cues: [],
    caption: '',
    callout: '',
    beam: 0,
    alarm: 0,
    flicker: 1,
    shake: 0,
    portals: [0, 0, 0, 0],
    sparks: 0,
    wave: 0,
    crystal: 0,
    skipHint: false,
    humN: -1,
    alarmN: -1
  };
}

export function beginLab(state) {
  if (state.phase !== 'idle' && state.phase !== 'free') return false;
  const seen = !!state.seen;
  Object.assign(state, createLabState({seen}));
  state.phase = 'ride';
  state.events.push(LAB_EVENTS.start);
  state.cues.push('beep');
  return true;
}

function paint(state) {
  state.caption = captionFor(state.phase, state.t);
  state.beam =
    state.phase === 'beam'
      ? clamp(state.t / BEAM_S, 0, 1)
      : state.phase === 'accident'
        ? 1
        : state.phase === 'free'
          ? 0.45
          : 0;
  state.alarm = state.phase === 'accident' ? 1 : state.phase === 'free' ? 0.85 : 0;
  state.shake = state.phase === 'accident' ? 0.07 + 0.05 * Math.abs(Math.sin(state.time * 37)) : 0;
  state.portals = portalLevels(state.phase, state.t);
  state.sparks = state.phase === 'accident' || state.phase === 'free' ? 1 : 0;
  state.skipHint = state.phase === 'ride' && state.seen && !state.skipped;
  state.flicker = state.alarm ? 0.35 + 0.65 * Math.abs(Math.sin(state.time * 14)) : 1;
  state.wave = state.time;
  state.crystal = state.time * 0.45;
}

function enter(state, phase) {
  if (state.phase === 'ride') state.seen = true;
  if (phase === 'count') state.cues.push('go');
  if (phase === 'beam') state.cues.push('hum');
  if (phase === 'accident') {
    state.events.push(LAB_EVENTS.reached);
    state.cues.push('alarm', 'spark');
  }
  if (phase === 'free') state.callout = GET_OUT;
  state.phase = phase;
  state.t = 0;
}

export function stepLab(state, dt, input = {}) {
  if (!state || state.phase === 'idle') return state;
  const step = Math.max(0, Number(dt) || 0);
  if (state.phase !== 'free') {
    const aim = (yk, pk, x, y) => {
      state[yk] = clamp(state[yk] + (Number(x) || 0) * step * 1.6, -LOOK_YAW, LOOK_YAW);
      state[pk] = clamp(state[pk] + (Number(y) || 0) * step * 1.4, -LOOK_PITCH, LOOK_PITCH);
    };
    aim('lookYaw', 'lookPitch', input.lookX, input.lookY);
    aim('look2Yaw', 'look2Pitch', input.look2X ?? input.lookX, input.look2Y ?? input.lookY);
    if (input.skip && state.phase === 'ride' && state.seen && !state.skipped) {
      state.skipped = true;
      state.events.push(LAB_EVENTS.skipped);
      state.phase = 'roll';
      state.t = 0;
    }
  }
  let left = step,
    guard = 0;
  while (left > 1e-6 && state.phase !== 'free' && guard++ < 8) {
    const row = PHASES.find(p => p[0] === state.phase);
    const room = row[1] - state.t;
    const slice = Math.min(left, Math.max(0, room));
    state.t += slice;
    state.time += slice;
    left -= slice;
    if (state.t >= row[1] - 1e-8) enter(state, row[2]);
  }
  if (state.phase === 'free') state.time += left;
  // The beam hum and the alarm keep going; the entry cue is the first one.
  if (state.phase === 'beam') {
    const n = Math.floor(state.t / 0.5);
    if (n !== state.humN) {
      state.humN = n;
      if (n > 0) state.cues.push('hum');
    }
  } else state.humN = -1;
  if (state.phase === 'accident') {
    const n = Math.floor(state.t / 0.4);
    if (n !== state.alarmN) {
      state.alarmN = n;
      if (n > 0) state.cues.push('alarm');
      if (n > 0 && n < 6) state.cues.push('spark');
    }
  } else state.alarmN = -1;
  paint(state);
  return state;
}

function slot(origin, yaw, side, back, lift) {
  const fx = Math.sin(yaw),
    fz = -Math.cos(yaw),
    rx = Math.cos(yaw),
    rz = Math.sin(yaw);
  return [origin[0] + rx * side - fx * back, origin[1] + lift, origin[2] + rz * side - fz * back];
}

export function carPoses(state, {split = false, lift = 0.22} = {}) {
  const slope = deckPitch();
  let origin, yaw, pitch;
  if (!state || state.phase === 'ride' || state.phase === 'idle') {
    const u = state?.phase === 'ride' ? clamp(state.t / RIDE_S, 0, 1) : 0;
    origin = tunnelPoint(u);
    yaw = tunnelYaw();
    pitch = slope;
  } else if (state.phase === 'roll') {
    const e = smooth(state.t / ROLL_S);
    const from = tunnelPoint(1),
      to = labWorld([0, 0, 0.6]);
    origin = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e];
    yaw = tunnelYaw();
    pitch = slope * (1 - e);
  } else {
    origin = labWorld([0, 0, 0.8]);
    yaw = 0;
    pitch = 0;
  }
  return {
    yaw,
    pitch,
    q: poseQuat(yaw, pitch),
    p1: slot(origin, yaw, 0.42, 0.05, lift),
    p2: split ? slot(origin, yaw, -0.42, 0.05, lift) : null
  };
}

// Glance toward a lab window as the tram draws level, so the ride shows the room.
function glanceYaw(state) {
  if (!state || state.phase !== 'ride') return 0;
  const u = state.t / RIDE_S;
  let best = 0,
    weight = 0;
  for (const win of WINDOWS) {
    const du = win.u - u;
    if (du < -0.06 || du > 0.1) continue;
    const k = 1 - Math.abs(du - 0.02) / 0.1;
    if (k > weight) {
      weight = k;
      best = win.side * 0.62 * k;
    }
  }
  return best;
}

export function cameraAim(pose, state, slot = 0, time = 0) {
  const lookY = (slot ? state.look2Yaw : state.lookYaw) + glanceYaw(state),
    lookP = slot ? state.look2Pitch : state.lookPitch,
    yaw = pose.yaw + lookY,
    focus = slot && pose.p2 ? pose.p2 : pose.p1,
    ride = state.phase === 'ride' || state.phase === 'roll',
    shake = state.shake || 0,
    jx = Math.sin(time * 53) * shake,
    jy = Math.cos(time * 47) * shake * 0.65;
  // On the slope the world-up chase sits under the floor behind the tram. Ride the deck instead.
  if (ride) {
    const behind = rotate(pose.q, [
        Math.sin(lookY) * 0.2,
        1.15 + Math.sin(lookP) * 0.35,
        3.5 * Math.cos(lookP)
      ]),
      ahead = rotate(pose.q, [Math.sin(lookY) * 1.4, 0.42 + Math.sin(lookP) * 1.15, -3.4]);
    return {
      eye: [focus[0] + behind[0] + jx, focus[1] + behind[1] + jy, focus[2] + behind[2]],
      target: [focus[0] + ahead[0], focus[1] + ahead[1], focus[2] + ahead[2]],
      fov: 58
    };
  }
  const back = 6.4;
  return {
    eye: [
      focus[0] - Math.sin(yaw) * back * Math.cos(lookP) + jx,
      focus[1] + 0.72 + Math.sin(lookP) * back * 0.45 + jy,
      focus[2] + Math.cos(yaw) * back * Math.cos(lookP)
    ],
    target: [
      focus[0] + Math.sin(yaw) * 2.6,
      focus[1] + 0.32 + Math.sin(lookP) * 1.5,
      focus[2] - Math.cos(yaw) * 2.6
    ],
    fov: 66
  };
}

function fan(y, up) {
  const out = [],
    n = LAB.segments,
    r = LAB.radius;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2,
      p = [0, y, 0],
      a = [Math.cos(a0) * r, y, Math.sin(a0) * r],
      b = [Math.cos(a1) * r, y, Math.sin(a1) * r];
    // (center, next, current) points up. The ceiling wants the opposite.
    out.push(up ? {a: p, b, c: a} : {a: p, b: a, c: b});
  }
  return out;
}

function wallTris() {
  const out = [],
    n = LAB.segments,
    r = LAB.radius,
    h = LAB.height,
    thick = 0.55,
    // Shift so a segment midpoint sits on each door (south +z, north −z).
    shift = Math.PI / 2 - Math.PI / n,
    apart = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + shift,
      a1 = ((i + 1) / n) * Math.PI * 2 + shift,
      mid = (a0 + a1) / 2;
    if (apart(mid, Math.PI / 2) < Math.PI / n || apart(mid, -Math.PI / 2) < Math.PI / n) continue;
    const ring = (rad, ang, y) => [Math.cos(ang) * rad, y, Math.sin(ang) * rad],
      inner = [
        ring(r, a0, 0),
        ring(r, a1, 0),
        ring(r, a1, h),
        ring(r, a0, h)
      ],
      outer = [
        ring(r + thick, a0, 0),
        ring(r + thick, a1, 0),
        ring(r + thick, a1, h),
        ring(r + thick, a0, h)
      ];
    // Both faces: the world's triangles are one-sided.
    out.push(
      {a: inner[0], b: inner[1], c: inner[2]},
      {a: inner[0], b: inner[2], c: inner[3]},
      {a: inner[1], b: inner[0], c: inner[3]},
      {a: inner[1], b: inner[3], c: inner[2]},
      {a: outer[1], b: outer[0], c: outer[3]},
      {a: outer[1], b: outer[3], c: outer[2]},
      {a: outer[0], b: outer[1], c: outer[2]},
      {a: outer[0], b: outer[2], c: outer[3]}
    );
  }
  return out;
}

/** World triangles for the round test chamber. Exits carry gates `lab:out` (north) and `lab:in` (tram). */
export function labWorldTris() {
  const local = [
    ...fan(0, true).map(t => ({...t, surface: 'concrete'})),
    ...fan(LAB.height, false).map(t => ({...t, surface: 'concrete'})),
    ...wallTris().map(t => ({...t, surface: 'concrete'}))
  ];
  const span = 2.8,
    r = LAB.radius,
    h = LAB.height;
  const doors = [
    {box: [-span, span, r - 0.45, r + 0.7, 0, h], gate: 'lab:in'},
    {box: [-span, span, -r - 0.7, -r + 0.45, 0, h], gate: 'lab:out'}
  ];
  for (const d of doors) for (const t of boxTris(d.box, 'metal')) local.push({...t, gate: d.gate});
  return local.map(t => ({
    a: labWorld(t.a),
    b: labWorld(t.b),
    c: labWorld(t.c),
    surface: t.surface,
    gate: t.gate ?? null
  }));
}
