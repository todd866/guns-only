// Deep Time Lab, stage 2 (docs/design/alien-research-lab.md): the Test Chamber ring and the
// Specimen Hall, north of the round chamber. Pure layout, gates, checkpoints. Drawing lives in
// annex.js. The frame is the lab's own (+x east, +y up, +z south), so moving the entry to
// Dreamland on Bride Lake is a change of LAB.anchor, not of these rooms.
//
// Kid-safe: sparking plates slow a car, sleepy aliens bump and giggle. Nothing here hurts a
// person, and nothing is shot.
import {boxTris} from './mine.mjs';
import {labLocal, labWorld} from './lab-accident.mjs';

export const SAVE_KEY = 'guns-only.rc.annex.v1';
export const TURN_GATE = 'annex:turn';
const TAU = Math.PI * 2;
const ALIGN = 2.5;
const OPEN_TOL = 0.22;

export const LEVER = Object.freeze({at: Object.freeze([6.35, 0, -25]), r: 1.15});
export const TURN = Object.freeze({
  gate: TURN_GATE,
  openAt: Math.PI / 2,
  grace: 5,
  // The boom parks east-west across the north mouth until the lever slews it aside.
  box: Object.freeze([-1.62, 1.62, -34.62, -34.28, 0, 1.15])
});
export const ISLAND = Object.freeze({box: Object.freeze([-2.25, 2.25, -27.35, -22.65, 0, 0.46])});
// Slit is robot-wide. The east lane is the car and board route (player 2 has no robot yet).
export const BULKHEAD = Object.freeze({
  z0: -54.24,
  z1: -53.9,
  h: 1.35,
  x0: -7.15,
  x1: 7.15,
  slit: Object.freeze([-0.075, 0.075]),
  lane: Object.freeze([5.15, 6.95])
});
export const GAPS = Object.freeze({
  slit: Object.freeze({width: BULKHEAD.slit[1] - BULKHEAD.slit[0], forms: Object.freeze(['robot'])}),
  lane: Object.freeze({
    width: BULKHEAD.lane[1] - BULKHEAD.lane[0],
    forms: Object.freeze(['car', 'board', 'robot'])
  })
});
export const PLATES = Object.freeze([
  Object.freeze({id: 'nw', x: -5.4, z: -19.2, w: 1.6, d: 1.6, period: 2.4, on: 1.05, phase: 0}),
  Object.freeze({id: 'ne', x: 5.4, z: -19.2, w: 1.6, d: 1.6, period: 2.4, on: 1.05, phase: 0.8}),
  Object.freeze({id: 'sw', x: -5.4, z: -30.2, w: 1.6, d: 1.6, period: 2.4, on: 1.05, phase: 1.6}),
  Object.freeze({id: 'se', x: 5.4, z: -30.2, w: 1.6, d: 1.6, period: 2.4, on: 1.05, phase: 0.4})
]);
export const TERMINALS = Object.freeze([
  Object.freeze({zone: 1, at: Object.freeze([0, 0, -43.6]), r: 1.2, desk: Object.freeze([1.15, 0, -43.6])}),
  Object.freeze({zone: 2, at: Object.freeze([0, 0, -64.3]), r: 1.25, desk: Object.freeze([1.45, 0, -64.3])})
]);
export const TANKS = Object.freeze([
  Object.freeze({at: Object.freeze([-5.1, -50.2]), cracked: true}),
  Object.freeze({at: Object.freeze([2.35, -50.5]), cracked: true}),
  Object.freeze({at: Object.freeze([-4.55, -58.3]), cracked: true}),
  Object.freeze({at: Object.freeze([1.7, -58.7]), cracked: false})
]);
export const ALIEN_HOMES = Object.freeze([
  Object.freeze([-2.4, 0, -57]),
  Object.freeze([0.55, 0, -59.7]),
  Object.freeze([-1.35, 0, -62.05])
]);

const FLOOR_Y = 0.012;
const box = (x0, x1, z0, z1, y0, y1) => Object.freeze([x0, x1, z0, z1, y0, y1]);

function wallBoxes() {
  const b = BULKHEAD;
  return [
    box(-3.55, -3.2, -16.2, -11.15, 0, 2.9),
    box(3.2, 3.55, -16.2, -11.15, 0, 2.9),
    box(-8.9, -8.5, -34.5, -15.75, 0, 2.9),
    box(8.5, 8.9, -34.5, -15.75, 0, 2.9),
    box(-8.9, -3.2, -16.15, -15.75, 0, 2.9),
    box(3.2, 8.9, -16.15, -15.75, 0, 2.9),
    box(-8.9, -1.7, -34.55, -34.15, 0, 2.9),
    box(1.7, 8.9, -34.55, -34.15, 0, 2.9),
    box(-2.05, -1.7, -46.3, -34.15, 0, 2.9),
    box(1.7, 2.05, -46.3, -34.15, 0, 2.9),
    box(-7.9, -7.5, -66.6, -45.55, 0, 2.9),
    box(7.5, 7.9, -66.6, -45.55, 0, 2.9),
    box(-7.9, -1.7, -46.05, -45.6, 0, 2.9),
    box(1.7, 7.9, -46.05, -45.6, 0, 2.9),
    box(-7.9, 7.9, -66.95, -66.55, 0, 2.9),
    box(b.x0, b.slit[0], b.z0, b.z1, 0, b.h),
    box(b.slit[1], b.lane[0], b.z0, b.z1, 0, b.h),
    box(b.lane[1], b.x1, b.z0, b.z1, 0, b.h)
  ];
}

/** Static boxes in the lab frame. `gate` triangles drop out once the world opens that id. */
export function annexBoxes() {
  const floors = [
    box(-3.2, 3.2, -16.2, -10.45, -0.4, FLOOR_Y),
    box(-8.5, 8.5, -34.2, -15.6, -0.4, FLOOR_Y),
    box(-1.7, 1.7, -46.35, -33.55, -0.4, FLOOR_Y),
    box(-7.5, 7.5, -66.55, -45.45, -0.4, FLOOR_Y)
  ];
  const tanks = TANKS.map(t => box(t.at[0] - 0.55, t.at[0] + 0.55, t.at[1] - 0.55, t.at[1] + 0.55, 0, 1.3));
  return [
    ...floors.map(b => ({kind: 'floor', box: b, surface: 'concrete'})),
    ...wallBoxes().map(b => ({kind: 'wall', box: b, surface: 'concrete'})),
    {kind: 'island', box: ISLAND.box, surface: 'metal'},
    {kind: 'ceiling', box: box(-8.9, 8.9, -66.95, -15.55, 2.9, 3.12), surface: 'concrete'},
    ...tanks.map(b => ({kind: 'tank', box: b, surface: 'metal'})),
    {kind: 'gate', box: TURN.box, surface: 'metal', gate: TURN_GATE}
  ];
}

export function annexWorldTris() {
  const out = [];
  for (const b of annexBoxes()) {
    for (const t of boxTris(b.box, b.surface)) {
      out.push({
        a: labWorld(t.a),
        b: labWorld(t.b),
        c: labWorld(t.c),
        surface: t.surface,
        gate: b.gate ?? null
      });
    }
  }
  return out;
}

export function gapFits(form, id) {
  return !!GAPS[id]?.forms.includes(form);
}

export function plateLive(plate, time) {
  const period = plate.period || 1;
  let u = (Number(time) + plate.phase) % period;
  if (u < 0) u += period;
  return u < plate.on;
}

export function annexDark(pos) {
  if (!pos) return false;
  const [x, y, z] = labLocal(pos);
  return y < 3.6 && y > -1.6 && x > -9.3 && x < 9.3 && z < -10.35 && z > -67.2;
}

export function annexFell(pos) {
  if (!pos) return false;
  const [x, y, z] = labLocal(pos);
  return y < -2 && x > -12 && x < 12 && z < -8 && z > -72;
}

export function leverNear(pos) {
  if (!pos) return false;
  const [x, , z] = labLocal(pos);
  return Math.hypot(x - LEVER.at[0], z - LEVER.at[2]) <= LEVER.r;
}

const clampZone = n => Math.max(0, Math.min(2, n | 0));

export function loadAnnex(storage) {
  const empty = {checkpoint: 0, got: [false, false]};
  try {
    const raw = storage?.getItem?.(SAVE_KEY);
    if (!raw) return empty;
    const o = JSON.parse(raw);
    const got = Array.isArray(o.got) ? [!!o.got[0], !!o.got[1]] : null;
    const checkpoint = got ? (got[1] ? 2 : got[0] ? 1 : 0) : clampZone(o.checkpoint);
    return {checkpoint, got: got ?? [checkpoint >= 1, checkpoint >= 2]};
  } catch {
    return empty;
  }
}

export function saveAnnex(storage, state) {
  try {
    storage?.setItem?.(
      SAVE_KEY,
      JSON.stringify({
        v: 1,
        checkpoint: state?.checkpoint ?? 0,
        robots: state?.robots ?? 0,
        got: [state?.got?.[0] ? 1 : 0, state?.got?.[1] ? 1 : 0]
      })
    );
  } catch {
    /* private mode */
  }
}

export function checkpointSpawn(checkpoint) {
  const zone = clampZone(checkpoint);
  if (zone < 1) return null;
  const at = TERMINALS[zone - 1].at;
  return {
    yaw: 0,
    p1: labWorld([at[0] - 0.45, 0, at[2] + 1.35]),
    p2: labWorld([at[0] + 0.45, 0, at[2] + 1.35])
  };
}

/** Where a fall puts you back: the last terminal, or the mouth of the ring. */
export function annexRescue(checkpoint) {
  return (
    checkpointSpawn(checkpoint) ?? {
      yaw: 0,
      p1: labWorld([0, 0, -12.6]),
      p2: labWorld([0.85, 0, -12.6])
    }
  );
}

export function roofSeat(pos, yaw, index) {
  const fx = Math.sin(yaw),
    fz = -Math.cos(yaw),
    rx = Math.cos(yaw),
    rz = Math.sin(yaw),
    i = Math.max(0, index | 0);
  return [
    pos[0] - fx * 0.05 + rx * 0.02,
    pos[1] + 0.16 + i * 0.15,
    pos[2] - fz * 0.05 + rz * 0.02
  ];
}

function freshAliens() {
  return ALIEN_HOMES.map((home, i) => ({
    id: `nap-${i + 1}`,
    home: [home[0], home[1], home[2]],
    pos: [home[0], home[1], home[2]],
    focus: -1,
    cool: 0,
    awake: false
  }));
}

export function createAnnexState(saved = {}) {
  const loaded = Array.isArray(saved.got) ? [!!saved.got[0], !!saved.got[1]] : null;
  const checkpoint = clampZone(saved.checkpoint);
  const got = loaded ?? [checkpoint >= 1, checkpoint >= 2];
  const robots = got.filter(Boolean).length;
  return {
    time: 0,
    angle: 0,
    blocked: true,
    grace: 0,
    holder: -1,
    leverDown: false,
    got,
    checkpoint: Math.max(checkpoint, got[1] ? 2 : got[0] ? 1 : 0),
    robots,
    roofs: [robots, 0],
    shock: [0, 0],
    aliens: freshAliens(),
    seen: [checkpoint >= 1, checkpoint >= 2],
    events: [],
    cues: [],
    pushes: [],
    zaps: [],
    live: PLATES.map(() => false),
    headlights: false
  };
}

const wrap = a => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  else if (x < -Math.PI) x += TAU;
  return x;
};

function localsOf(players) {
  return (players ?? []).map(p => ({
    ...p,
    local: p?.pos ? labLocal(p.pos) : null,
    form: p?.form || 'car',
    use: !!p?.use
  }));
}

function slewOpen(state, dt) {
  const d = wrap(TURN.openAt - state.angle);
  state.angle += Math.max(-dt * ALIGN, Math.min(dt * ALIGN, d));
  state.blocked = Math.abs(wrap(state.angle - TURN.openAt)) > OPEN_TOL;
}

function zoneOf(local) {
  if (!local) return 0;
  const [x, y, z] = local;
  if (y < -1.2 || y > 3.5 || x < -9.2 || x > 9.2) return 0;
  if (z <= -46.4 && z >= -66.9) return 2;
  if (z <= -10.35 && z > -46.4) return 1;
  return 0;
}

function onPlate(local, plate) {
  return Math.abs(local[0] - plate.x) <= plate.w / 2 && Math.abs(local[2] - plate.z) <= plate.d / 2;
}

/**
 * One step. `input.players` is [{pos, use, form}] in world metres (both cars, when split).
 * `input.storage` receives the checkpoint record when a terminal is new.
 * Aliens only bump. Plates only slow. The lever stops the turntable while either player holds it.
 */
export function stepAnnex(state, dt, input = {}) {
  if (!state) return state;
  const step = Math.max(0, Number(dt) || 0);
  state.time += step;
  state.pushes = [];
  state.zaps = [];
  const players = localsOf(input.players);
  while (state.shock.length < players.length) state.shock.push(0);

  const holder = players.findIndex(p => p.use && p.local && leverNear(p.pos));
  if (holder >= 0) {
    state.holder = holder;
    state.grace = TURN.grace;
    if (!state.leverDown) {
      state.leverDown = true;
      state.events.push('annex_coop_lever');
      state.cues.push('lever');
    }
    slewOpen(state, step);
  } else {
    state.holder = -1;
    state.leverDown = false;
    state.grace = Math.max(0, state.grace - step);
    if (state.grace > 0) slewOpen(state, step);
    else {
      state.angle += step * 1.15;
      state.blocked = true;
    }
  }

  state.live = PLATES.map(plate => plateLive(plate, state.time));
  players.forEach((p, i) => {
    state.shock[i] = Math.max(0, (state.shock[i] || 0) - step);
    if (!p.local) return;
    const hot = state.live.some((on, n) => on && onPlate(p.local, PLATES[n]));
    if (hot && state.shock[i] <= 0) {
      state.shock[i] = 0.85;
      state.zaps.push(i);
      state.cues.push('zap');
    }
    const zone = zoneOf(p.local);
    if (zone && !state.seen[zone - 1]) {
      state.seen[zone - 1] = true;
      state.events.push(`annex_zone_${zone}`);
    }
    const term = TERMINALS.find(t => Math.hypot(p.local[0] - t.at[0], p.local[2] - t.at[2]) <= t.r);
    if (term && !state.got[term.zone - 1]) {
      state.got[term.zone - 1] = true;
      state.robots += 1;
      state.roofs[i] = (state.roofs[i] || 0) + 1;
      state.checkpoint = Math.max(state.checkpoint, term.zone);
      state.events.push(`annex_checkpoint_${term.zone}`);
      state.cues.push('cheer');
      saveAnnex(input.storage, state);
    }
  });

  const reach = 7,
    bumpR = 0.62,
    speed = 1.25;
  for (const alien of state.aliens) {
    alien.cool = Math.max(0, alien.cool - step);
    let best = -1,
      bestD = reach;
    players.forEach((p, i) => {
      if (!p.local) return;
      const d = Math.hypot(p.local[0] - alien.pos[0], p.local[2] - alien.pos[2]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    alien.focus = best;
    if (best < 0) continue;
    alien.awake = true;
    const p = players[best].local;
    const dx = p[0] - alien.pos[0],
      dz = p[2] - alien.pos[2],
      dist = Math.hypot(dx, dz) || 1;
    if (dist > bumpR) {
      alien.pos[0] += (dx / dist) * speed * step;
      alien.pos[2] += (dz / dist) * speed * step;
    } else if (alien.cool <= 0 && step > 0) {
      alien.cool = 0.7;
      state.pushes.push({index: best, dv: [(dx / dist) * 2.1, 0, (dz / dist) * 2.1]});
      state.events.push('annex_bump');
      state.cues.push('giggle');
    }
  }

  state.headlights = players.some(p => p.pos && annexDark(p.pos));
  return state;
}
