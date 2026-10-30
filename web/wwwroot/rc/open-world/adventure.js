import {createMine} from './mine.js';
import {createBadToys} from './bad-toys.js';
import {createExcavator} from './excavator.js';
import {createGoodAlien} from './good-alien.js';
import {createBoss,stepBoss} from '../physics/boss.mjs';
import {createFighter,createEnemy,stepCombat,reviveFighter,roomHelp} from '../physics/combat.mjs';
import {CHESTS,PLATES,OPENINGS,MINE_BOUNDS,MINE_ENEMIES,ROOM_ENTRANCES,MINE,BOSS_AT,CELLS,SPIRIT_MARK,DOORS,mineWorld,mineLocal,roomAt,createMineState} from './mine.mjs';
import {createInventory,giveItem,hasItem,takeCell,saveInventory} from '../physics/items.mjs';
import {openChest,pressPlate,tryDoor,defeatBoss,digDoor} from '../physics/dungeon.mjs';

// The adventure layer in the open world (docs/design/adventure). For now: the Old Silver Mine, played
// Zelda-style by touch: walk into a chest to open it, onto a plate to press it, and up to a locked
// gate with the right key to unlock it. step() returns what happened for the HUD and sounds.
export function createAdventure(scene, world) {
  const mine = createMine(scene), state = createMineState(), toys = createBadToys(scene);
  const enemies = MINE_ENEMIES.map(e => Object.assign(createEnemy(e.id, mineWorld(e.at)), { room: e.room }));
  // Items and battery cells persist (Zelda's inventory); the dungeon itself resets on reload for now.
  const SAVE = 'rc-adventure-v1', load = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } };
  const inventory = createInventory(load()), save = () => { try { localStorage.setItem(SAVE, JSON.stringify(saveInventory(inventory))); } catch {} };
  for (const id of inventory.cells) mine.takeCell(id);
  const rooms = {}; let fighter = null, time = 0, markTouched = false;
  // The excavator wakes when you first walk into its hall, and stays freed once beaten.
  const boss = createBoss(mineWorld(BOSS_AT), MINE.yaw), digger = createExcavator(scene, mineWorld(BOSS_AT), MINE.yaw); let bossAwake = false;
  const alien = createGoodAlien(scene, mineWorld([0, 0, -23.8]));
  const near = (p, at, r, dy = .5) => Math.hypot(p[0] - at[0], p[2] - at[2]) < r && Math.abs(p[1] - at[1]) < dy;
  const doorAt = o => mineWorld(o.wall === 'x' ? [o.at, 0, (o.span[0] + o.span[1]) / 2] : [(o.span[0] + o.span[1]) / 2, 0, o.at]);
  const inside = p => p[0] >= MINE_BOUNDS[0] && p[0] <= MINE_BOUNDS[2] && p[2] >= MINE_BOUNDS[1] && p[2] <= MINE_BOUNDS[3];
  let lastBump = null;
  return {
    state, inside, boss, inventory, fighter: () => fighter,
    /** While the excavator fight is on: where the camera should look (the boss), else null. */
    bossFrame: p => bossAwake && !boss.freed && roomAt(mineLocal(p)) === 'R5' ? boss.origin : null,
    /** fight = { robot, input: { attack, lock }, mode } while on foot; null in the car. */
    step(pos, dt, fight = null) {
      mine.update(dt); time += dt;
      toys.sync(enemies, time, dt, () => MINE.anchor[1]);
      digger.sync(boss, time, dt, MINE.anchor[1]);
      alien.sync(time, dt, alien.freed ? (fight?.robot?.pos ?? pos) : null);
      if (!inside(pos)) return [];
      const events = [];
      if (fight?.robot) {
        if (!fighter) { fighter = createFighter(fight.mode); fighter.max += inventory.extraBatteries; fighter.batteries = fighter.max; } const here = roomAt(mineLocal(pos)), room = rooms[here] ??= { knockouts: 0 };
        // Only the toys in your room (and awake) join in.
        const active = enemies.filter(e => e.room === here);
        for (const ev of stepCombat(fight.robot, fighter, active, fight.input, room, dt)) {
          events.push(ev);
          if (ev.knockout) { room.knockouts++; reviveFighter(fighter); const back = mineWorld(ROOM_ENTRANCES[here] ?? ROOM_ENTRANCES.R0); fight.robot.pos = [...back]; fight.robot.vel = [0, 0, 0]; }
          if (ev.drop === 'battery') fighter.batteries = Math.min(fighter.max, fighter.batteries + 1);
        }
        if (here === 'R5' && !boss.freed) {
          if (!bossAwake) { bossAwake = true; events.push({ boss: 'wake' }); }
          for (const ev of stepBoss(boss, fight.robot, fighter, fight.input, roomHelp(room), dt)) {
            events.push(ev);
            if (ev.freed) for (const door of defeatBoss(state)) { world.openGate?.(`mine:${door}`); mine.openDoor(door); events.push({ door, opened: true }); }
            if (ev.knockout) { room.knockouts++; reviveFighter(fighter); fight.robot.pos = [...mineWorld(ROOM_ENTRANCES.R5)]; fight.robot.vel = [0, 0, 0]; Object.assign(boss, createBoss(boss.origin, boss.yaw), { hits: boss.hits }); }
          }
        }
      }
      // The rescue: walk up to the jar once the excavator is freed.
      if (boss.freed && !alien.freed && near(pos, mineWorld([0, 0, -23.8]), .6, .6)) {
        alien.free(); state.rescued = true; events.push({ rescued: 'alien' });
        const item = giveItem(inventory, 'claw'); if (item) { save(); events.push({ item: 'claw', ...item }); }
      }
      for (const [id, c] of Object.entries(CELLS)) if (!inventory.cells.includes(id) && near(pos, mineWorld(c.at), .3, .4)) {
        const got = takeCell(inventory, id); mine.takeCell(id); save();
        if (fighter && got.battery) { fighter.max++; fighter.batteries = fighter.max; }
        events.push({ cell: id, ...got });
      }
      if (!markTouched && near(pos, mineWorld([SPIRIT_MARK.at[0] + .25, 0, SPIRIT_MARK.at[2]]), .5, .6)) { markTouched = true; events.push({ spiritMark: 'mountain' }); }
      for (const [id, c] of Object.entries(CHESTS)) if (near(pos, mineWorld(c.at), .32, .35)) {
        const got = openChest(state, id); if (got) { mine.openChest(id); events.push({ chest: id, got }); }
      }
      for (const [id, p] of Object.entries(PLATES)) if (near(pos, mineWorld(p.at), .26, .2) && pressPlate(state, id)) {
        mine.pressPlate(id); events.push({ plate: id });
        for (const [door, d] of Object.entries(state.def.doors)) if (d.plate === id) { world.openGate?.(`mine:${door}`); mine.openDoor(door); events.push({ door, opened: true }); }
      }
      for (const o of OPENINGS) if (o.door && !state.open.has(o.door) && near(pos, doorAt(o), DOORS[o.door].kind === 'dig' ? .75 : .55, .6)) {
        // Cracked rock: punch it with the claw to dig through; without it, a hint.
        if (DOORS[o.door].kind === 'dig') {
          if (hasItem(inventory, 'claw') && fight?.input?.attack && digDoor(state, o.door)) { world.openGate?.(`mine:${o.door}`); mine.openDoor(o.door); events.push({ door: o.door, opened: true, dug: true }); }
          else if (!hasItem(inventory, 'claw') && lastBump !== o.door) events.push({ door: o.door, locked: 'dig' });
          lastBump = o.door; continue;
        }
        const r = tryDoor(state, o.door);
        if (r.ok) { world.openGate?.(`mine:${o.door}`); mine.openDoor(o.door); events.push({ door: o.door, opened: true }); }
        else if (lastBump !== o.door) events.push({ door: o.door, locked: r.why });
        lastBump = o.door;
      }
      if (!OPENINGS.some(o => o.door && near(pos, doorAt(o), .7, .6))) lastBump = null;
      return events;
    },
    dispose() { mine.dispose(); toys.dispose(); digger.dispose(); alien.dispose(); },
  };
}
