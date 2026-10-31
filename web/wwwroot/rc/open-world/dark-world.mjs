// The dark world is the past (docs/design/adventure, owner 31 Oct): SNES Zelda's Dark World, but
// its gates take you back in time. The same valley a hundred-odd years ago: no dam yet, so the
// lake is gone and the town on its floor is alive; the car is a toy dinosaur you ride, the robot a toy cowboy.
// Gates link two places rather than the same spot in the other time. Pure: the runtime resolves
// ground heights, swaps the world and saves; this file only decides who goes where.
import {SUMMIT, valleyPoint, inMountain} from './spirit-mountain.mjs';
import {PLAZA} from './town-plaza.mjs';

/** A yaw facing from a to b (the car's convention: yaw 0 faces -z). */
const facing = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1]));
const flat = p => [p[0], p[2]];
// The summit gate stands at the end of the switchback road; you come out a few metres past it.
const SUMMIT_GATE = [SUMMIT.at[0] + 9, SUMMIT.at[1] + 4];
const SUMMIT_OUT = [SUMMIT.at[0] - 2, SUMMIT.at[1] - 1];
// The town gate stands on the plaza's open paving; the Lake Town's at the top of its main street.
const TOWN_GATE = [PLAZA.center[0] + 6, PLAZA.center[2] + 1]; // open paving, clear of the ledges and stairs (mapped by ray)
const TOWN_OUT = [PLAZA.center[0] - 2, PLAZA.center[2] + 7];
const LAKE_GATE = flat(valleyPoint(532, 0));
const LAKE_OUT = flat(valleyPoint(546, 0)),
  LAKE_AHEAD = flat(valleyPoint(600, 0));

export const GATE_RADIUS = 2.4; // the ring; driving through its middle crosses
export const TIME_GATES = Object.freeze(
  [
    // The spirit cave at the top of the mountain is the first crossing, and always open.
    {
      id: 'summit',
      era: 'present',
      at: SUMMIT_GATE,
      to: {era: 'past', at: SUMMIT_OUT, yaw: facing(SUMMIT_GATE, SUMMIT_OUT)},
      first: true
    },
    {
      id: 'summit-past',
      era: 'past',
      at: SUMMIT_GATE,
      to: {era: 'present', at: SUMMIT_OUT, yaw: facing(SUMMIT_GATE, SUMMIT_OUT)},
      first: true
    },
    // Owner, 31 Oct: "there could be one in the town that spawns you at the bottom of the dam lake".
    // It sleeps (a plain stone ring) until you've crossed once at the summit.
    {
      id: 'town',
      era: 'present',
      at: TOWN_GATE,
      to: {era: 'past', at: LAKE_OUT, yaw: facing(LAKE_OUT, LAKE_AHEAD)}
    },
    {
      id: 'lake-town',
      era: 'past',
      at: LAKE_GATE,
      to: {era: 'present', at: TOWN_OUT, yaw: facing(TOWN_GATE, TOWN_OUT)}
    }
  ].map(Object.freeze)
);

/** Is this gate awake? The first crossing is always open; the rest wake once you've been through. */
export const gateAwake = (gate, crossed = false) => !!gate.first || !!crossed;

/** The past only reaches as far as the mountain and its valley: leave it and time pulls you home. */
export const pastHolds = (x, z) => inMountain(x, z);

/**
 * One step of the time gates. state { era, latch, until } (latch: the gate you are standing in,
 * so arriving never bounces you straight back). Returns { state, trip } where trip is
 * { gate, from, to, at: [x, z], yaw } or null. groundAt(x, z), when given, is the ground height:
 * a toy more than a ring's height above a gate flies over it.
 */
export function timeGateStep(
  state = {},
  pos,
  {crossed = false, now = 0, radius = GATE_RADIUS, groundAt = null} = {}
) {
  const s = {
    era: state.era === 'past' ? 'past' : 'present',
    latch: state.latch ?? null,
    until: Number(state.until) || 0
  };
  const x = pos?.[0],
    z = pos?.[2];
  if (!Number.isFinite(x) || !Number.isFinite(z)) return {state: s, trip: null};
  if (s.era === 'past' && !pastHolds(x, z)) {
    s.era = 'present';
    s.latch = null;
    s.until = now + 1.2;
    return {state: s, trip: {gate: 'fade', from: 'past', to: 'present', at: [x, z], yaw: null}};
  }
  // Through the ring, not over it: flying above a gate doesn't cross (groundAt: the gate's ground).
  const near = TIME_GATES.find(
    g =>
      g.era === s.era &&
      Math.hypot(x - g.at[0], z - g.at[1]) <= radius &&
      (!groundAt || Math.abs(pos[1] - groundAt(g.at[0], g.at[1])) < radius * 1.6)
  );
  if (!near) {
    if (now >= s.until) s.latch = null;
    return {state: s, trip: null};
  }
  if (now < s.until || s.latch === near.id || !gateAwake(near, crossed)) return {state: s, trip: null};
  s.era = near.to.era;
  s.until = now + 1.2;
  // Arriving outside every gate's radius, so the latch only matters for a gate you drove into.
  s.latch = near.id;
  return {
    state: s,
    trip: {gate: near.id, from: near.era, to: near.to.era, at: [...near.to.at], yaw: near.to.yaw}
  };
}

export function createTimeGates(initial = {}) {
  let state = {era: 'present', ...initial};
  return Object.freeze({
    step(pos, options) {
      const r = timeGateStep(state, pos, options);
      state = r.state;
      return r.trip;
    },
    era: () => state.era,
    /** Jump straight to an era (digging through to the light world: dig.mjs). */
    goTo(era, now = 0) {
      state = {era, latch: null, until: now + 1.2};
    },
    reset() {
      state = {era: 'present'};
    }
  });
}

// The place list's dark-world tab (owner, 31 Oct: "the place list can be organized into light
// world / dark world"; "you can just use the map selector to jump there"). Picking one jumps you
// there and into the past. Positions on flat ground; yaw as the car's (0 faces -z).
const place = (id, name, short, p, look, color) =>
  Object.freeze({
    id,
    name,
    short,
    at: [p[0], p[2]],
    yaw: facing([p[0], p[2]], [look[0], look[2]]),
    color,
    past: true
  });
export const DARK_PLACES = Object.freeze([
  place(
    'past-lake-town',
    'The Lake Town, long ago',
    'Lake Town',
    valleyPoint(546, 0),
    valleyPoint(600, 0),
    '#d8a85a'
  ),
  place(
    'past-farm',
    'The steam farm, long ago',
    'Steam farm',
    valleyPoint(560, -28),
    valleyPoint(575, -48),
    '#9fbf5a'
  ),
  place(
    'past-wild',
    'Wild dinosaurs',
    'Wild dinosaurs',
    valleyPoint(560, 30),
    valleyPoint(575, 50),
    '#5fa8d8'
  ),
  place(
    'past-summit',
    'Spirit Mountain summit, long ago',
    'Summit',
    [SUMMIT_OUT[0], 0, SUMMIT_OUT[1]],
    [SUMMIT_OUT[0] - 10, 0, SUMMIT_OUT[1]],
    '#b89ae0'
  )
]);
export const darkPlaceById = id => DARK_PLACES.find(p => p.id === id) ?? null;
