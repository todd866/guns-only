// Southern Paiute camp in the dark world's past: neighbours with their own lives (Graeber "friends
// share": no prices, gifts come back later). Pure rules; drawn by paiute-camp.js.
import {MOUNTAIN, TOWN, mountainHeight, valleyFrame, valleyPoint} from './spirit-mountain.mjs';
import {YARD} from './chickens.mjs';
import {WILD} from './herd.mjs';

const at = (along, across) => {
  const p = valleyPoint(along, across);
  return [p[0], p[2]];
};

// On the flat valley floor where it opens east, past the general store: 30 m clear of the town,
// the farm and the wild herds (the first spot, up at (470, 70), was on the valley side 70 m up).
export const CAMP = Object.freeze({
  centre: at(640, -50),
  fire: at(638, -47),
  radius: 14
});
export const FIRE_RANGE = 4;
export const NEAR_RANGE = 600;

export const FAMILY = Object.freeze([
  {id: 'mara', name: 'Mara', job: 'weave'},
  {id: 'jon', name: 'Jon', job: 'pit'},
  {id: 'lee', name: 'Lee', job: 'grind'},
  {id: 'amy', name: 'Amy', job: 'hoop'},
  {id: 'sam', name: 'Sam', job: 'fire'}
]);

const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Saved visit and gift relationship (progress.paiuteCamp). */
export function loadCamp(progress = {}) {
  const raw = progress.paiuteCamp ?? {};
  return {
    visits: Math.max(0, Number(raw.visits) || 0),
    helped: Math.max(0, Number(raw.helped) || 0),
    gifts: Math.max(0, Number(raw.gifts) || 0),
    awaitGift: !!raw.awaitGift,
    lastGiveVisit: Number.isInteger(raw.lastGiveVisit) ? raw.lastGiveVisit : -1
  };
}

export function saveCamp(progress, state) {
  progress.paiuteCamp = {
    visits: state.visits,
    helped: state.helped,
    gifts: state.gifts,
    awaitGift: state.awaitGift,
    lastGiveVisit: state.lastGiveVisit
  };
}

const GREET_FIRST = 'Come sit by the fire!';
const GREET_WARM = [
  'Hi, friend!',
  'Good to see you, friend!',
  'Sit down, friend!',
  'Warm up, friend!',
  'We saved you a seat, friend!'
];

const THANKS = Object.freeze({
  battery: 'Thanks, friend!',
  parts: 'We can use these!',
  egg: 'Fresh egg, thank you!',
  fish: 'Good fish, thank you!'
});

const GIFT_LINES = Object.freeze({
  basket: 'A basket for your eggs!',
  pinon: 'Roasted piñon for you!',
  ride: 'Rabbits run by the big rocks!'
});

const FORBIDDEN = /\d|gold|price/i;

export function lineOk(line) {
  return typeof line === 'string' && line.length > 0 && !FORBIDDEN.test(line);
}

function pickWarm(state, rand) {
  return GREET_WARM[Math.floor(rand() * GREET_WARM.length)];
}

/** A short hello; counts as a visit. */
export function visit(state, rand = Math.random) {
  state.visits += 1;
  if (state.visits === 1) return GREET_FIRST;
  return pickWarm(state, rand);
}

/** Thank-you for a gift; nothing numeric comes back now. */
export function give(state, item) {
  if (!THANKS[item]) return null;
  state.helped += 1;
  state.lastGiveVisit = state.visits;
  state.awaitGift = true;
  return THANKS[item];
}

/** A gift from a past visit, never the same visit you gave on. */
export function returnGift(state, rand = Math.random) {
  if (!state.awaitGift || state.visits < state.lastGiveVisit + 1) return null;
  state.awaitGift = false;
  if (rand() > 0.52) return null;
  const kinds = ['basket', 'pinon', 'ride'];
  const kind = kinds[Math.floor(rand() * kinds.length)];
  state.gifts += 1;
  return {kind, line: GIFT_LINES[kind]};
}

export function createCamp(seed = 19) {
  const r = rng(seed);
  return {
    t: 0,
    rand: r,
    members: FAMILY.map((f, i) => ({
      ...f,
      phase: r() * 6,
      yaw: -0.4 + r() * 0.8,
      x: (i - 2) * 2.2 + (r() - 0.5) * 1.2,
      z: (r() - 0.5) * 2.5
    }))
  };
}

/** Idle life loop: each toy works its job on a slow cycle. */
export function stepCamp(camp, dt) {
  camp.t += dt;
  for (const m of camp.members) {
    m.phase += dt;
    const cycle = 8 + m.id.length * 0.7;
    m.anim = (m.phase % cycle) / cycle;
    if (m.job === 'hoop') m.spin = camp.t * 2.4;
  }
}

/** Valley-frame distance from a point to a town box (same frame as TOWN). */
export function distToTownBox(along, across, box) {
  const [a0, a1, c0, c1] = box;
  const da = Math.max(0, a0 - along, along - a1);
  const dc = Math.max(0, c0 - across, across - c1);
  return Math.hypot(da, dc);
}

/** Camp sits on the flat valley floor like the Lake Town: the ground within 10 m is level. */
export function campOnLakeFloor(along, across) {
  const hs = [];
  for (let da = -10; da <= 10; da += 5)
    for (let dc = -10; dc <= 10; dc += 5) {
      const p = valleyPoint(along + da, across + dc);
      hs.push(mountainHeight(p[0], p[2]));
    }
  return Math.max(...hs) - Math.min(...hs) < 0.6 && Math.abs(hs[12] - MOUNTAIN.lake.floor) < 0.5;
}

export function campPlacementOk() {
  const [cx, cz] = CAMP.centre;
  const {along, across} = valleyFrame(cx, cz);
  if (!campOnLakeFloor(along, across)) return false;
  const minTown = Math.min(...TOWN.map(b => distToTownBox(along, across, b)));
  if (minTown <= 25) return false;
  if (Math.hypot(cx - YARD.centre[0], cz - YARD.centre[1]) <= 25) return false;
  for (const w of WILD) if (Math.hypot(cx - w.home[0], cz - w.home[2]) <= 25) return false;
  return true;
}
