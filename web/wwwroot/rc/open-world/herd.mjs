// Your herd of dinosaurs (docs/design/adventure: "if you befriend different dinos then you can
// summon mounts"). Toy dinosaurs live wild in the dark world; walk up to one on foot, give it a
// name and it joins your herd. Say a name (Y) and that one comes running to be ridden. Each kind
// will have its own use (the design doc's roster); only the T. rex has a model so far, so the
// herd is T. rexes in their own colours until the others arrive. Pure: saved state and matching.
import {valleyPoint} from './spirit-mountain.mjs';
import {sounds, clean} from './typed.mjs';

export const DINO_KINDS = Object.freeze({
  rex: Object.freeze({name: 'T. rex', model: 'dino', can: 'scare'})
  // The rest of the roster waits for models (characters.js): long-neck, triceratops, raptor,
  // ankylosaur, pterosaur, stegosaur.
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
export const WILD = Object.freeze(
  [
    {id: 'wild-1', kind: 'rex', home: at(575, 50), colour: 1},
    {id: 'wild-2', kind: 'rex', home: at(604, 50), colour: 2},
    {id: 'wild-3', kind: 'rex', home: at(540, 47), colour: 3}
  ].map(Object.freeze)
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
