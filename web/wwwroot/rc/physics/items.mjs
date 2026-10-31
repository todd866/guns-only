// Zelda's item loop for the adventure (docs/design/adventure/README.md): every dungeon gives one
// item, and that item is the key to new places, in that dungeon's boss and out in the world.
// The world hides pieces: four battery cells make one more battery (Zelda's heart pieces).
// Pure data and logic; saved by the caller (adventure.js) as JSON.
export const ITEMS = Object.freeze({
  claw:    { name: 'Excavator Claw', icon: '⛏️', from: 'Old Silver Mine', does: 'E digs cracked rock' },
  board:   { name: 'Skateboard',     icon: '🛹', from: 'The Sewers',      does: 'T to ride · ollie onto pipes to grind' },
  spring:  { name: 'Wind-Up Spring', icon: '🌀', from: 'dungeon 2',       does: 'Space twice: big jump' },
  lamp:    { name: 'Spirit Lamp',    icon: '🏮', from: 'dungeon 3',       does: 'lights dark rooms, shows spirit marks' },
  yoyo:    { name: 'Grapple Yo-Yo',  icon: '🪀', from: 'dungeon 4',       does: 'pulls you to posts across gaps' },
  mirror:  { name: 'Moon Mirror',    icon: '🪞', from: 'Spirit Mountain', does: 'step through to the other side' },
});
export const CELLS_PER_BATTERY = 4;

export function createInventory(saved = null) {
  // legend: the mine is beaten and The Legend of Spirit Mountain is unlocked as its own mode.
  // car: the Legend car tier (physics/vehicles.mjs LEGEND_CARS); everyone starts in the starter.
  const inv = { items: [], cells: [], extraBatteries: 0, legend: false, car: 'starter' };
  if (saved && typeof saved === 'object') {
    inv.items = (saved.items ?? []).filter(id => ITEMS[id]);
    inv.cells = [...new Set((saved.cells ?? []).filter(id => typeof id === 'string'))];
    inv.extraBatteries = Math.floor(inv.cells.length / CELLS_PER_BATTERY);
    inv.legend = saved.legend === true;
    if (typeof saved.car === 'string') inv.car = saved.car;
  }
  return inv;
}
export const hasItem = (inv, id) => inv.items.includes(id);

/** Give an item; returns it the first time (for the "You got…" moment), null if already held. */
export function giveItem(inv, id) {
  if (!ITEMS[id] || hasItem(inv, id)) return null;
  inv.items.push(id); return ITEMS[id];
}

/** Pick up a battery cell by its unique id. Every fourth makes a battery: { cell, of, battery }. */
export function takeCell(inv, id) {
  if (inv.cells.includes(id)) return null;
  inv.cells.push(id);
  const before = inv.extraBatteries; inv.extraBatteries = Math.floor(inv.cells.length / CELLS_PER_BATTERY);
  return { cell: inv.cells.length % CELLS_PER_BATTERY || CELLS_PER_BATTERY, of: CELLS_PER_BATTERY, battery: inv.extraBatteries > before };
}
export const saveInventory = inv => ({ items: [...inv.items], cells: [...inv.cells], legend: inv.legend, car: inv.car });
