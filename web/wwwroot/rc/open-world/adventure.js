import {createMine} from './mine.js';
import {createBadToys} from './bad-toys.js';
import {createFighter,createEnemy,stepCombat,reviveFighter} from '../physics/combat.mjs';
import {CHESTS,PLATES,OPENINGS,MINE_BOUNDS,MINE_ENEMIES,ROOM_ENTRANCES,MINE,mineWorld,mineLocal,roomAt,createMineState} from './mine.mjs';
import {openChest,pressPlate,tryDoor} from '../physics/dungeon.mjs';

// The adventure layer in the open world (docs/design/adventure). For now: the Old Silver Mine, played
// Zelda-style by touch: walk into a chest to open it, onto a plate to press it, and up to a locked
// gate with the right key to unlock it. step() returns what happened for the HUD and sounds.
export function createAdventure(scene, world) {
  const mine = createMine(scene), state = createMineState(), toys = createBadToys(scene);
  const enemies = MINE_ENEMIES.map(e => Object.assign(createEnemy(e.id, mineWorld(e.at)), { room: e.room }));
  const rooms = {}; let fighter = null, time = 0;
  const near = (p, at, r, dy = .5) => Math.hypot(p[0] - at[0], p[2] - at[2]) < r && Math.abs(p[1] - at[1]) < dy;
  const doorAt = o => mineWorld(o.wall === 'x' ? [o.at, 0, (o.span[0] + o.span[1]) / 2] : [(o.span[0] + o.span[1]) / 2, 0, o.at]);
  const inside = p => p[0] >= MINE_BOUNDS[0] && p[0] <= MINE_BOUNDS[2] && p[2] >= MINE_BOUNDS[1] && p[2] <= MINE_BOUNDS[3];
  let lastBump = null;
  return {
    state, inside, fighter: () => fighter,
    /** fight = { robot, input: { attack, lock }, mode } while on foot; null in the car. */
    step(pos, dt, fight = null) {
      mine.update(dt); time += dt;
      toys.sync(enemies, time, dt, () => MINE.anchor[1]);
      if (!inside(pos)) return [];
      const events = [];
      if (fight?.robot) {
        fighter ??= createFighter(fight.mode); const here = roomAt(mineLocal(pos)), room = rooms[here] ??= { knockouts: 0 };
        // Only the toys in your room (and awake) join in.
        const active = enemies.filter(e => e.room === here);
        for (const ev of stepCombat(fight.robot, fighter, active, fight.input, room, dt)) {
          events.push(ev);
          if (ev.knockout) { room.knockouts++; reviveFighter(fighter); const back = mineWorld(ROOM_ENTRANCES[here] ?? ROOM_ENTRANCES.R0); fight.robot.pos = [...back]; fight.robot.vel = [0, 0, 0]; }
          if (ev.drop === 'battery') fighter.batteries = Math.min(fighter.max, fighter.batteries + 1);
        }
      }
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
    dispose() { mine.dispose(); toys.dispose(); },
  };
}
