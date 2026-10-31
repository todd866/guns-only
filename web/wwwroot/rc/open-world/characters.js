// Saucer Springs characters: skinned, animated creatures exported by tools/rc/blender/character_*.py.
// One template per kind is fetched and parsed once; every spawn is a skeleton-correct copy
// (cloneSkinned) with its own AnimationMixer, so many dinosaurs can share geometry and materials.
// Contract (bone names, clips, loop flags, Saddle/Mouth empties): docs/rc-characters.md.
// Not wired into the game yet: callers own the scene, the update loop and the root's motion
// (clips play in place; move the root at CHARACTERS[kind].clips[name].groundSpeedMps).
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {fetchAssetBuffer} from '../asset-buffer.mjs';

export const CHARACTERS = Object.freeze({
 dino: {
  file: 'characters/dino.glb',
  defaultClip: 'idle',
  saddle: 'Saddle',
  mouth: 'Mouth',
  clips: {
   idle: {loop: true, seconds: 2.0, groundSpeedMps: 0},
   walk: {loop: true, seconds: 1.0, groundSpeedMps: 0.3},
   run: {loop: true, seconds: 0.6, groundSpeedMps: 0.833},
   jump: {loop: false, seconds: 0.8, groundSpeedMps: 0},
   gallop: {loop: true, seconds: 0.5, groundSpeedMps: 4.0},
  },
 },
});
export const DEFAULT_FADE = 0.25;

// Exporters decorate clip names ("Armature|walk", "Dino_Run.001"); map them back to the contract.
export function normaliseClipName(name) {
 return String(name ?? '').split('|').pop().replace(/\.\d+$/, '').toLowerCase().replace(/^(dino|armature)[_\s-]*/, '').trim();
}
export function resolveClip(kind, requested, available) {
 const def = CHARACTERS[kind];
 if (!def) throw Error(`unknown character kind ${kind}`);
 const want = normaliseClipName(requested);
 if (!def.clips[want]) throw Error(`${kind} has no clip "${requested}" (has ${Object.keys(def.clips).join(', ')})`);
 const hit = available.find(c => normaliseClipName(c.name ?? c) === want);
 if (!hit) throw Error(`${kind}.glb is missing clip "${want}"`);
 return hit;
}

// Cross-fade bookkeeping, kept pure so it is testable without a mixer.
// state: {current, fadingOut:[{name, until}]}, time in seconds.
export function planTransition(state, next, {fade = DEFAULT_FADE, restart = false, now = 0} = {}) {
 const fadingOut = (state.fadingOut ?? []).filter(f => f.until > now && f.name !== next);
 if (state.current === next && !restart) return {state: {current: next, fadingOut}, start: null, stop: null, fade: 0};
 const stop = state.current && state.current !== next ? state.current : null;
 if (stop && fade > 0) fadingOut.push({name: stop, until: now + fade});
 return {state: {current: next, fadingOut}, start: next, stop, fade: state.current ? fade : 0};
}

export function findNode(root, name) {
 let found = null;
 root.traverse(o => { if (!found && o.name === name) found = o; });
 return found;
}

// Skeleton-aware deep copy (three.js SkeletonUtils.clone, MIT; the addon is not vendored here).
// Object3D.clone() would leave the copy's SkinnedMesh bound to the template's bones.
export function cloneSkinned(source) {
 const sourceOf = new Map(), cloneOf = new Map(), copy = source.clone();
 const walk = (a, b) => { sourceOf.set(b, a); cloneOf.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
 walk(source, copy);
 copy.traverse(node => {
  if (!node.isSkinnedMesh) return;
  const src = sourceOf.get(node);
  node.skeleton = src.skeleton.clone();
  node.bindMatrix.copy(src.bindMatrix);
  node.skeleton.bones = src.skeleton.bones.map(b => cloneOf.get(b));
  node.bind(node.skeleton, node.bindMatrix);
 });
 return copy;
}

const templates = new Map();
let pending = null;
// Tests and future preloaders can register an already-parsed {scene, animations}.
export function registerCharacterTemplate(kind, gltf) { templates.set(kind, {scene: gltf.scene, animations: gltf.animations ?? []}); }
export function hasCharacter(kind) { return templates.has(kind); }

export function prepareCharacters(kinds = Object.keys(CHARACTERS)) {
 return pending ??= Promise.all(kinds.map(async kind => {
  const base = new URL('../assets/', import.meta.url), url = new URL(CHARACTERS[kind].file, base);
  const buffer = await fetchAssetBuffer(url.href);
  const gltf = await new GLTFLoader().parseAsync(buffer, new URL('.', url).href);
  registerCharacterTemplate(kind, gltf);
 })).then(() => true).catch(e => { pending = null; console.warn('characters unavailable', e); return false; });
}

export function spawnCharacter(scene, kind, {position = [0, 0, 0], yaw = 0, clip, shadows = true} = {}) {
 const def = CHARACTERS[kind], template = templates.get(kind);
 if (!def) throw Error(`unknown character kind ${kind}`);
 if (!template) throw Error(`character ${kind} is not prepared; await prepareCharacters() first`);
 const root = cloneSkinned(template.scene);
 root.name = `Character_${kind}`;
 root.position.set(...(position.isVector3 ? position.toArray() : position));
 root.rotation.y = yaw;
 root.traverse(o => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } });
 const mixer = new T.AnimationMixer(root), actions = new Map();
 for (const name of Object.keys(def.clips)) {
  const spec = def.clips[name], action = mixer.clipAction(resolveClip(kind, name, template.animations));
  action.setLoop(spec.loop ? T.LoopRepeat : T.LoopOnce, spec.loop ? Infinity : 1);
  action.clampWhenFinished = !spec.loop;
  actions.set(name, action);
 }
 const saddleNode = findNode(root, def.saddle), mouthNode = findNode(root, def.mouth);
 let state = {current: null, fadingOut: []}, time = 0, after = null;
 const character = {
  kind, root, mixer, actions,
  get clip() { return state.current; },
  play(name, {fade = DEFAULT_FADE, restart = false, then = null, timeScale = 1} = {}) {
   const want = normaliseClipName(name);
   if (!actions.has(want)) throw Error(`${kind} has no clip "${name}"`);
   const plan = planTransition(state, want, {fade, restart, now: time});
   state = plan.state;
   after = def.clips[want].loop ? null : then;
   if (!plan.start) { actions.get(want).setEffectiveTimeScale(timeScale); return character; }
   const next = actions.get(plan.start).reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).play();
   if (plan.stop) { const prev = actions.get(plan.stop); if (plan.fade > 0) next.crossFadeFrom(prev, plan.fade, false); else prev.stop(); }
   return character;
  },
  update(dt) { time += dt; mixer.update(dt); },
  saddle() { return saddleNode; },
  mouth() { return mouthNode; },
 };
 mixer.addEventListener('finished', e => {
  if (e.action === actions.get(state.current) && after) { const go = after; after = null; character.play(go); }
 });
 character.play(clip ?? def.defaultClip, {fade: 0});
 scene.add(root);
 return character;
}

// Geometry and materials belong to the shared template; only the instance's mixer state is released.
export function disposeCharacter(character) {
 if (!character) return;
 character.mixer.stopAllAction();
 character.mixer.uncacheRoot(character.root);
 character.root.removeFromParent();
}
