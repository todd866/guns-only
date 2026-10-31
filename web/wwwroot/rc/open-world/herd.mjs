// Your herd of dinosaurs (docs/design/adventure: "if you befriend different dinos then you can
// summon mounts"). Toy dinosaurs live wild in the dark world; walk up to one on foot, give it a
// name and it joins your herd. Say a name (Y) and that one comes running to be ridden. Each kind
// has its own model, body and pace; T. rexes come in their own colour pairs, the other kinds wear
// their own palettes. The quetzalcoatlus is won at its nest (NEST). Pure: saved state and matching.
import {valleyPoint} from './spirit-mountain.mjs';
import {sounds, clean} from './typed.mjs';

export const DINO_KINDS = Object.freeze({
  rex: Object.freeze({name: 'T. rex', model: 'dino', can: 'scare', tint: true}),
  raptor: Object.freeze({name: 'Raptor', model: 'raptor', can: 'leap'}),
  // The long-neck is an Argentinosaurus, the giant at Perth Zoo's Zoorassic Park (with its T. rex;
  // owner, 31 Oct: "ensure representation"). Its name is Spanish too: Argentina's lizard.
  longneck: Object.freeze({name: 'Argentinosaurus', model: 'longneck', can: 'reach'}),
  triceratops: Object.freeze({name: 'Triceratops', model: 'triceratops', can: 'charge'}),
  // The sky route home (design doc): won at its nest high on Spirit Mountain, and the only one that flies.
  quetzal: Object.freeze({name: 'Quetzalcoatlus', model: 'quetzal', can: 'fly', flies: true})
  // Still to come (design doc roster): ankylosaur, stegosaur.
});
// Body and spike colours, one pair per dinosaur in the order you befriend them.
export const DINO_COLOURS = Object.freeze([
  ['#4f9a3a', '#f07a2a'],
  ['#3a7fb8', '#f2c14a'],
  ['#b8452e', '#f5e6c0'],
  ['#7b4fb0', '#7ee08a'],
  ['#d9a03a', '#6a3a20'],
  ['#2f8f8a', '#ff8fb0']
]);
export const HERD_MAX = 12;

// Wild dinosaurs on the dry lake floor across the main street from the farm (valley frame).
const at = (along, across) => {
  const p = valleyPoint(along, across);
  return [p[0], 0, p[2]];
};
// The quetzalcoatlus nest (owner, 31 Oct: "you have to climb to a quetzalcoatlus nest then you can go
// for a ride"): on the shelf of the Spirit Mountain road's high east hairpin, 190 m up and facing the
// lake valley, so it's seen from the Lake Town and reached by riding up the switchbacks (or the map).
export const NEST = Object.freeze([2486.2, 189.5, -3038.3]);
export const NEST_WILD = Object.freeze({
  id: 'nest',
  kind: 'quetzal',
  home: Object.freeze([NEST[0], 0, NEST[2]]),
  colour: 0,
  far: true,
  still: true
});
export const WILD = Object.freeze(
  [
    {id: 'wild-1', kind: 'rex', home: at(575, 50), colour: 1},
    {id: 'wild-2', kind: 'raptor', home: at(604, 50), colour: 2},
    {id: 'wild-3', kind: 'longneck', home: at(540, 47), colour: 3},
    {id: 'wild-4', kind: 'triceratops', home: at(522, 52), colour: 4}
  ]
    .map(Object.freeze)
    .concat(NEST_WILD)
);
export const BEFRIEND_RANGE = 3;

/** The saved herd, cleaned; the first dinosaur from before the herd existed (dinoName) carries over. */
export function loadHerd(progress = {}) {
  const herd = (Array.isArray(progress.herd) ? progress.herd : [])
    .filter(d => d && DINO_KINDS[d.kind] && typeof d.name === 'string' && d.name)
    .slice(0, HERD_MAX)
    .map((d, i) => ({
      kind: d.kind,
      name: d.name.slice(0, 12),
      colour: Number.isInteger(d.colour) ? d.colour % DINO_COLOURS.length : i % DINO_COLOURS.length
    }));
  if (!herd.length && typeof progress.dinoName === 'string' && progress.dinoName)
    herd.push({kind: 'rex', name: progress.dinoName.slice(0, 12), colour: 0});
  const mount =
    Number.isInteger(progress.mount) && progress.mount >= 0 && progress.mount < herd.length
      ? progress.mount
      : 0;
  const friends = Array.isArray(progress.wildFriends)
    ? progress.wildFriends.filter(id => WILD.some(w => w.id === id))
    : [];
  return {herd, mount, friends};
}

/** Add a dinosaur; returns it. A name already in the herd gets a number so calling stays clear. */
export function befriend(state, {kind = 'rex', name, colour = null, wild = null}) {
  if (state.herd.length >= HERD_MAX) return null;
  let n = name || DINO_KINDS[kind].name,
    k = 2;
  while (state.herd.some(d => clean(d.name) === clean(n))) n = `${name} ${k++}`;
  const dino = {kind, name: n, colour: colour ?? state.herd.length % DINO_COLOURS.length};
  state.herd.push(dino);
  if (wild && !state.friends.includes(wild)) state.friends.push(wild);
  return dino;
}

const CALLS = ['here', 'come', 'whistle', 'dino', 'dinosaur'];
/**
 * Who did he call? A herd name (spelling-tolerant, the closest wins) → that one; a general call
 * ("here", "whistle") → the one you rode last. { index, dino } or null.
 */
export function called(state, text) {
  const t = clean(text);
  if (!t || !state.herd.length) return null;
  const exact = state.herd.findIndex(d => clean(d.name) === t);
  if (exact >= 0) return {index: exact, dino: state.herd[exact]};
  const near = state.herd.map((d, i) => ({i, ok: sounds(t, d.name)})).find(v => v.ok);
  if (near) return {index: near.i, dino: state.herd[near.i]};
  if (CALLS.some(w => sounds(t, w))) return {index: state.mount, dino: state.herd[state.mount]};
  return null;
}

/** The wild ones still out there (not yet in your herd). */
export const wildLeft = state => WILD.filter(w => !state.friends.includes(w.id));
/** A wild dinosaur close enough to make friends with, on foot. */
export const wildNear = (state, pos, range = BEFRIEND_RANGE) =>
  wildLeft(state).find(w => Math.hypot(pos[0] - w.home[0], pos[2] - w.home[2]) < range + 2.5) ?? null;
