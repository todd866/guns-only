// Zelda-style save files for The Legend of Spirit Mountain: three slots, each with a name the
// player types. Everything stays in this browser's storage: names are never sent anywhere
// (telemetry never reads this). Pure logic over a storage-like object (getItem/setItem/removeItem).
export const SLOT_COUNT = 3;
const INDEX = 'rc-legend-slots-v1',
  LEGACY = 'rc-adventure-v1';
export const slotKey = n => `rc-adventure-v1:${n}`;
export const cleanName = name =>
  String(name ?? '')
    .replace(/[^\p{L}\p{N} '\-]/gu, '')
    .slice(0, 12)
    .trim();

const read = (store, key) => {
  try {
    return JSON.parse(store.getItem(key));
  } catch {
    return null;
  }
};
const write = (store, key, value) => {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** The slot index: { slots: [{ name } | null ×3], active }. Folds a pre-slots save into slot 0. */
export function readSlots(store) {
  let idx = read(store, INDEX);
  if (!idx || !Array.isArray(idx.slots)) {
    idx = {slots: Array(SLOT_COUNT).fill(null), active: 0};
    const legacy = read(store, LEGACY);
    if (legacy) {
      idx.slots[0] = {name: 'Player 1'};
      write(store, slotKey(0), legacy);
      try {
        store.removeItem(LEGACY);
      } catch {}
    }
    write(store, INDEX, idx);
  }
  idx.slots = Array.from({length: SLOT_COUNT}, (_, i) =>
    idx.slots[i]?.name ? {name: cleanName(idx.slots[i].name) || `Player ${i + 1}`} : null
  );
  idx.active = Number.isInteger(idx.active) && idx.active >= 0 && idx.active < SLOT_COUNT ? idx.active : 0;
  return idx;
}
export function createSlot(store, n, name) {
  const idx = readSlots(store),
    clean = cleanName(name);
  if (!clean || n < 0 || n >= SLOT_COUNT) return null;
  idx.slots[n] = {name: clean};
  idx.active = n;
  write(store, INDEX, idx);
  write(store, slotKey(n), {});
  return idx;
}
export function useSlot(store, n) {
  const idx = readSlots(store);
  if (!idx.slots[n]) return null;
  idx.active = n;
  write(store, INDEX, idx);
  return idx;
}
export function eraseSlot(store, n) {
  const idx = readSlots(store);
  idx.slots[n] = null;
  write(store, INDEX, idx);
  try {
    store.removeItem(slotKey(n));
  } catch {}
  return idx;
}
/** The active slot's save (for the adventure), or null when no slot exists yet. */
export const activeSave = store => {
  const idx = readSlots(store);
  return idx.slots[idx.active]
    ? {slot: idx.active, key: slotKey(idx.active), data: read(store, slotKey(idx.active))}
    : null;
};
export const slotSave = (store, n) => read(store, slotKey(n));
