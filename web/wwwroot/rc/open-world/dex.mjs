// The Dino Book (docs/design/adventure, owner 31 Oct: "a pokedex style thing of different dinosaurs
// and creatures"): one page per kind of toy animal in the dark world. A silhouette until you've seen
// one, its picture once seen, a star once you've befriended one. And gold, the one currency: dug
// from the gold seam for now (jobs later), spent at the general store on supplies and, saved up, on
// the ranch. Pure: saved state, sightings and gold.
import {DINO_KINDS} from './herd.mjs';

export const DEX = Object.freeze(
  Object.entries(DINO_KINDS).map(([kind, k]) =>
    Object.freeze({kind, name: k.name, model: k.model, can: k.can})
  )
);
export const SEE_RANGE = 45; // metres: close enough to count as seen
export const GOLD = Object.freeze({seam: 3, max: 9999});

/** The saved book and purse, cleaned. */
export function loadDex(progress = {}) {
  const kinds = new Set(DEX.map(d => d.kind));
  const seen = Array.isArray(progress.dexSeen) ? progress.dexSeen.filter(k => kinds.has(k)) : [];
  const gold = Number.isInteger(progress.gold) && progress.gold > 0 ? Math.min(GOLD.max, progress.gold) : 0;
  return {seen: [...new Set(seen)], gold};
}

/** Mark a kind seen; returns true the first time (a new page in the book). */
export function see(dex, kind) {
  if (!DEX.some(d => d.kind === kind) || dex.seen.includes(kind)) return false;
  dex.seen.push(kind);
  return true;
}

/** Each page: { kind, name, seen, friends (how many in your herd) }. Befriending counts as seeing. */
export function pages(dex, herd = []) {
  return DEX.map(d => {
    const friends = herd.filter(h => h.kind === d.kind).length;
    return {...d, seen: friends > 0 || dex.seen.includes(d.kind), friends};
  });
}

export function earn(dex, amount) {
  const n = Math.max(0, Math.round(amount) || 0);
  dex.gold = Math.min(GOLD.max, dex.gold + n);
  return n;
}
export function spend(dex, amount) {
  const n = Math.max(0, Math.round(amount) || 0);
  if (dex.gold < n) return false;
  dex.gold -= n;
  return true;
}
