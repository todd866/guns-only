// TV launcher menu: which games, where the gold highlight moves, which one
// was launched last. Geometry matches rc/gamepad-menu.mjs so a stick step
// here is the same step the pad will take on the tiles.
import {nearest} from "../rc/gamepad-menu.mjs";

export const MAX_ROWS = 2;
export const LAST_KEY = "tv.lastGame";

// Toy dogfight is the split-screen flight from the 9-flight-split work
// (render/split/toy_fight_view.js). /toy-fight/ mounts that same view.
export const GAMES = Object.freeze([
  Object.freeze({id: "rc", name: "RC Odyssey", href: "/rc/?telemetry=local", symbol: "🚗", datum: "base"}),
  Object.freeze({id: "chopper", name: "Toy Chopper", href: "/toy-chopper/", symbol: "🚁", datum: "co-op"}),
  Object.freeze({id: "gunship", name: "Toy Gunship", href: "/toy-gunship/", symbol: "🛩", datum: "yard"}),
  Object.freeze({id: "fight", name: "Toy dogfight", href: "/toy-fight/", symbol: "⚔", datum: "2P"}),
]);

export function columnsFor(count, rows = MAX_ROWS) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  if (n <= 1) return 1;
  return Math.ceil(n / rows);
}

export function moveSelection(count, index, dir) {
  const columns = columnsFor(count);
  const items = Array.from({length: count}, (_, i) => ({
    index: i,
    x: (i % columns) * 100,
    y: Math.floor(i / columns) * 60,
  }));
  const from = items[index];
  if (!from) return index;
  const to = nearest(items, from, dir);
  return to ? to.index : index;
}

export function selectionIndex(id, games = GAMES) {
  const index = games.findIndex((game) => game.id === id);
  return index >= 0 ? index : 0;
}

export function storedId(storage, games = GAMES) {
  let raw = "";
  try {
    raw = storage?.getItem?.(LAST_KEY) ?? "";
  } catch {
    raw = "";
  }
  return games.some((game) => game.id === raw) ? raw : "";
}

export function writeLast(storage, id, games = GAMES) {
  if (!games.some((game) => game.id === id)) return storedId(storage, games);
  try {
    storage?.setItem?.(LAST_KEY, id);
  } catch {
    /* private mode */
  }
  return id;
}
