import {createMine} from './mine.js';
import {CHESTS,PLATES,OPENINGS,MINE_BOUNDS,mineWorld,createMineState} from './mine.mjs';
import {openChest,pressPlate,tryDoor} from '../physics/dungeon.mjs';

// The adventure layer in the open world (docs/design/adventure). For now: the Old Silver Mine, played
// Zelda-style by touch: walk into a chest to open it, onto a plate to press it, and up to a locked
// gate with the right key to unlock it. step() returns what happened for the HUD and sounds.
export function createAdventure(scene, world) {
  const mine = createMine(scene), state = createMineState();
  const near = (p, at, r, dy = .5) => Math.hypot(p[0] - at[0], p[2] - at[2]) < r && Math.abs(p[1] - at[1]) < dy;
  const doorAt = o => mineWorld(o.wall === 'x' ? [o.at, 0, (o.span[0] + o.span[1]) / 2] : [(o.span[0] + o.span[1]) / 2, 0, o.at]);
  const inside = p => p[0] >= MINE_BOUNDS[0] && p[0] <= MINE_BOUNDS[2] && p[2] >= MINE_BOUNDS[1] && p[2] <= MINE_BOUNDS[3];
  let lastBump = null;
  return {
    state, inside,
    step(pos, dt) {
      mine.update(dt);
      if (!inside(pos)) return [];
      const events = [];
      for (const [id, c] of Object.entries(CHESTS)) if (near(pos, mineWorld(c.at), .32, .35)) {
        const got = openChest(state, id); if (got) { mine.openChest(id); events.push({ chest: id, got }); }
      }
      for (const [id, p] of Object.entries(PLATES)) if (near(pos, mineWorld(p.at), .26, .2) && pressPlate(state, id)) {
        mine.pressPlate(id); events.push({ plate: id });
        for (const [door, d] of Object.entries(state.def.doors)) if (d.plate === id) { world.openGate?.(`mine:${door}`); mine.openDoor(door); events.push({ door, opened: true }); }
      }
      for (const o of OPENINGS) if (o.door && !state.open.has(o.door) && near(pos, doorAt(o), .55, .6)) {
        const r = tryDoor(state, o.door);
        if (r.ok) { world.openGate?.(`mine:${o.door}`); mine.openDoor(o.door); events.push({ door: o.door, opened: true }); }
        else if (lastBump !== o.door) events.push({ door: o.door, locked: r.why });
        lastBump = o.door;
      }
      if (!OPENINGS.some(o => o.door && near(pos, doorAt(o), .7, .6))) lastBump = null;
      return events;
    },
    dispose() { mine.dispose(); },
  };
}
