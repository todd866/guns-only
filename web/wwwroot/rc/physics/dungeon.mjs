// Dungeon state, Zelda-style (docs/design/adventure): small keys, one big key, chests, doors and
// pressure plates. Ocarina's rule for a 6-year-old: at most ONE small-key door is ever open to
// unlock at a time, so a key can't be wasted, and checkDungeon() proves it for a layout.
// Pure data and logic; the venue builds geometry and the game shows the doors and chests.

/**
 * A dungeon: { rooms: [{ id, links: [{ to, door?: doorId }] }], doors: { id: { kind: 'small'|'big'|'plate', plate? } },
 * chests: { id: { room, holds: 'small'|'big'|item } }, plates: { id: { room } }, start, boss }.
 */
export function createDungeon(def) {
  return { def, keys: 0, bigKey: false, open: new Set(), opened: new Set(), pressed: new Set(), items: new Set(), log: [] };
}

export function reachable(d) {
  const seen = new Set([d.def.start]), queue = [d.def.start];
  while (queue.length) {
    const id = queue.shift(), room = d.def.rooms.find(r => r.id === id);
    for (const l of room?.links ?? []) if ((!l.door || d.open.has(l.door)) && !seen.has(l.to)) { seen.add(l.to); queue.push(l.to); }
  }
  return seen;
}

/** Doors that border a reachable room and are still shut. */
export function frontier(d) {
  const r = reachable(d), out = new Set();
  for (const room of d.def.rooms) if (r.has(room.id)) for (const l of room.links) if (l.door && !d.open.has(l.door)) out.add(l.door);
  return [...out];
}

export function openChest(d, id) {
  const c = d.def.chests[id];
  if (!c || d.opened.has(id) || !reachable(d).has(c.room)) return null;
  d.opened.add(id);
  if (c.holds === 'small') d.keys++; else if (c.holds === 'big') d.bigKey = true; else d.items.add(c.holds);
  d.log.push({ chest: id, got: c.holds });
  return c.holds;
}

export function pressPlate(d, id) {
  const p = d.def.plates?.[id];
  if (!p || d.pressed.has(id) || !reachable(d).has(p.room)) return false;
  d.pressed.add(id);
  for (const [door, def] of Object.entries(d.def.doors)) if (def.kind === 'plate' && def.plate === id) d.open.add(door);
  return true;
}

/** Try a door from a reachable side. Small doors spend a key; the big door needs the big key. */
export function tryDoor(d, id) {
  const def = d.def.doors[id];
  if (!def || d.open.has(id) || !frontier(d).includes(id)) return { ok: false, why: 'not here' };
  if (def.kind === 'small') { if (d.keys < 1) return { ok: false, why: 'locked' }; d.keys--; d.open.add(id); return { ok: true }; }
  if (def.kind === 'big') { if (!d.bigKey) return { ok: false, why: 'big key' }; d.open.add(id); return { ok: true }; }
  return { ok: false, why: 'a switch opens this' };
}

/**
 * Proves a layout is fair: plays it greedily (open every reachable chest and plate, then the one
 * lockable door) and checks that the boss room is reached and that no step ever had a choice of
 * two small-key doors with keys in hand (Ocarina's rule).
 */
export function checkDungeon(def) {
  const d = createDungeon(def), problems = [];
  for (let guard = 0; guard < 100; guard++) {
    let progressed = false;
    for (const id of Object.keys(def.chests)) if (openChest(d, id) !== null) progressed = true;
    for (const id of Object.keys(def.plates ?? {})) if (pressPlate(d, id)) progressed = true;
    const small = frontier(d).filter(id => def.doors[id].kind === 'small');
    if (small.length > 1 && d.keys > 0) problems.push(`choice of small-key doors: ${small.join(', ')}`);
    for (const id of frontier(d)) if (tryDoor(d, id).ok) { progressed = true; break; }
    if (reachable(d).has(def.boss)) return { ok: problems.length === 0, problems, d };
    if (!progressed) { problems.push(`stuck before the boss with ${d.keys} keys; frontier ${frontier(d).join(', ')}`); break; }
  }
  return { ok: false, problems, d };
}
