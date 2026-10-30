import {createMine} from './mine.js';
import {createSewer} from './sewer.js';
import {SEWER,SEWER_BOUNDS,CHESTS as SEWER_CHESTS,CELLS as SEWER_CELLS,OPENINGS as SEWER_OPENINGS,DOORS as SEWER_DOORS,WASH_BACK,ARRIVE,LADDERS,MANHOLE,SHRINE,BOWL,bowlFloor,inBowl,sewerWorld,sewerLocal,roomAt as sewerRoomAt,inChannel,createSewerState} from './sewer.mjs';
import {createBadToys} from './bad-toys.js';
import {createExcavator} from './excavator.js';
import {createGoodAlien} from './good-alien.js';
import {createBoss,stepBoss} from '../physics/boss.mjs';
import {createRatKing,stepRatKing,landOnRat} from '../physics/rat-king.mjs';
import {createFighter,createEnemy,stepCombat,reviveFighter,roomHelp} from '../physics/combat.mjs';
import {CHESTS,PLATES,OPENINGS,MINE_BOUNDS,MINE_ENEMIES,ROOM_ENTRANCES,MINE,BOSS_AT,CELLS,SPIRIT_MARK,DOORS,mineWorld,mineLocal,roomAt,createMineState} from './mine.mjs';
import {ITEMS,createInventory,giveItem,hasItem,takeCell,saveInventory} from '../physics/items.mjs';
import {activeSave,createSlot} from '../physics/save-slots.mjs';
import {openChest,pressPlate,tryDoor,defeatBoss,digDoor} from '../physics/dungeon.mjs';

// The adventure layer in the open world (docs/design/adventure). For now: the Old Silver Mine, played
// Zelda-style by touch: walk into a chest to open it, onto a plate to press it, and up to a locked
// gate with the right key to unlock it. step() returns what happened for the HUD and sounds.
export function createAdventure(scene, world) {
  const mine = createMine(scene), state = createMineState(), toys = createBadToys(scene);
  const enemies = MINE_ENEMIES.map(e => Object.assign(createEnemy(e.id, mineWorld(e.at)), { room: e.room }));
  // Items and battery cells persist (Zelda's inventory); the dungeon itself resets on reload for now.
  // Saved to the active save file (physics/save-slots.mjs); playing the mine before any file exists
  // makes slot 1, so a kid who just starts playing never loses the progress.
  const store = (() => { try { return localStorage; } catch { return null; } })(), file = store && activeSave(store);
  const inventory = createInventory(file?.data), save = () => { if (!store) return; const f = activeSave(store) ?? (createSlot(store, 0, 'Player 1'), activeSave(store)); try { store.setItem(f.key, JSON.stringify(saveInventory(inventory))); } catch {} };
  // The Sewers (dungeon 2): same Zelda rules; the skateboard is the item, found halfway.
  const sewer = createSewer(scene), sewerState = createSewerState(); let shrineBest = 0, lastSewerBump = null;
  // The Rat King in the bowl: beaten with the board, by landing on him (physics/rat-king.mjs).
  const rat = createRatKing(), ratEvents = [];
  for (const id of inventory.cells) { mine.takeCell(id); sewer.takeCell(id); }
  const inSewer = p => p[0] >= SEWER_BOUNDS[0] && p[0] <= SEWER_BOUNDS[2] && p[2] >= SEWER_BOUNDS[1] && p[2] <= SEWER_BOUNDS[3] && p[1] < SEWER.anchor[1] + 4;
  const sewerDoorAt = o => sewerWorld([o.at, 0, (o.span[0] + o.span[1]) / 2]);
  const rooms = {}; let fighter = null, time = 0, markTouched = false;
  // The excavator wakes when you first walk into its hall, and stays freed once beaten.
  const boss = createBoss(mineWorld(BOSS_AT), MINE.yaw), digger = createExcavator(scene, mineWorld(BOSS_AT), MINE.yaw); let bossAwake = false;
  const alien = createGoodAlien(scene, mineWorld([0, 0, -23.8]));
  const near = (p, at, r, dy = .5) => Math.hypot(p[0] - at[0], p[2] - at[2]) < r && Math.abs(p[1] - at[1]) < dy;
  const doorAt = o => mineWorld(o.wall === 'x' ? [o.at, 0, (o.span[0] + o.span[1]) / 2] : [(o.span[0] + o.span[1]) / 2, 0, o.at]);
  const inside = p => p[0] >= MINE_BOUNDS[0] && p[0] <= MINE_BOUNDS[2] && p[2] >= MINE_BOUNDS[1] && p[2] <= MINE_BOUNDS[3];
  let lastBump = null;
  function sewerStep(pos, ride) {
    const events = ratEvents.splice(0), local = sewerLocal(pos), mode = ride?.mode ?? 'kid';
    // Falling into the slime sweeps you back to the near ledge: some crossings need a grind.
    if (local[1] < SEWER.sewage + .08 && inChannel(local)) { const room = sewerRoomAt(local); events.push({ washed: sewerWorld(WASH_BACK[room] ?? ARRIVE.at) }); return events; }
    // The bowl floods a little with every hit on the Rat King; the flooded part washes you out too.
    if (inBowl(local) && local[1] < rat.level + .05 && bowlFloor(local[0], local[2]) < rat.level - .02) { events.push({ washed: sewerWorld(WASH_BACK.S5), bowl: true }); return events; }
    const inS5 = sewerRoomAt(local) === BOWL.room;
    if (inS5 || rat.state !== 'sleep') for (const ev of stepRatKing(rat, { at: local, inBowl: inS5 && inBowl(local) && local[1] < -.1, near: inS5, air: !!ride?.air }, mode, bowlFloor, ride?.dt ?? 1 / 120)) events.push(ev);
    if (ride?.punch && inS5 && Math.hypot(local[0] - rat.at[0], local[2] - rat.at[1]) < 1.4 && !rat.freed) events.push({ ratDodge: true });
    for (const [id, c] of Object.entries(SEWER_CHESTS)) if (near(pos, sewerWorld(c.at), .34, .35)) {
      const got = openChest(sewerState, id); if (!got) continue;
      sewer.openChest(id);
      if (got === 'small') events.push({ chest: id, got });
      else { const item = giveItem(inventory, got); if (item) save(); events.push({ chest: id, item: got, ...(item ?? ITEMS[got]) }); }
    }
    for (const [id, c] of Object.entries(SEWER_CELLS)) if (!inventory.cells.includes(id) && (!c.boss || rat.freed) && near(pos, sewerWorld(c.at), .3, .4)) {
      const got = takeCell(inventory, id); sewer.takeCell(id); save(); if (fighter && got.battery) { fighter.max++; fighter.batteries = fighter.max; }
      events.push({ cell: id, ...got });
    }
    for (const o of SEWER_OPENINGS) if (o.door && !sewerState.open.has(o.door) && near(pos, sewerDoorAt(o), .7, .6)) {
      if (SEWER_DOORS[o.door].kind === 'combo') { if (lastSewerBump !== o.door) events.push({ door: o.door, locked: 'combo' }); lastSewerBump = o.door; continue; }
      const r = tryDoor(sewerState, o.door);
      if (r.ok) { world.openGate?.(`sewer:${o.door}`); sewer.openDoor(o.door); events.push({ door: o.door, opened: true }); }
      else if (lastSewerBump !== o.door) events.push({ door: o.door, locked: r.why });
      lastSewerBump = o.door;
    }
    if (!SEWER_OPENINGS.some(o => o.door && near(pos, sewerDoorAt(o), .9, .6))) lastSewerBump = null;
    return events;
  }
  return {
    state, inside, boss, inventory, fighter: () => fighter, sewerState, inSewer, rat,
    /** The board touched down: in the bowl, landing on the Rat King hits him. Events come out of step(). */
    landing(p, air, tricks, mode = 'kid') {
      if (!inSewer(p)) return;
      for (const ev of landOnRat(rat, sewerLocal(p), air, tricks, mode)) { ratEvents.push(ev); if (ev.ratFreed) { sewer.freeRat(); defeatBoss(sewerState); } }
    },
    /** In a dungeon (no flying, no free-skate curb rails): the mine or the sewers. */
    underground: p => inside(p) || inSewer(p),
    /** E at the manhole climbs down; E at either ladder climbs back up. Returns { pos, yaw } or null. */
    ladder(p) {
      if (Math.hypot(p[0] - MANHOLE.at[0], p[2] - MANHOLE.at[2]) < MANHOLE.reach && Math.abs(p[1] - MANHOLE.at[1]) < 1.5) return { pos: sewerWorld(ARRIVE.at), yaw: ARRIVE.yaw, down: true };
      for (const l of [LADDERS.in, LADDERS.out]) if (inSewer(p) && near(p, sewerWorld(l), .9, 1)) return { pos: [MANHOLE.at[0] + 1.2, MANHOLE.at[1] + .1, MANHOLE.at[2]], yaw: Math.PI / 2, down: false };
      return null;
    },
    /** A skate combo just banked with `tricks` tricks: at the trick shrine it can open the door. */
    combo(p, tricks, mode = 'kid') {
      if (!inSewer(p) || sewerRoomAt(sewerLocal(p)) !== SHRINE.room || sewerState.open.has('C')) return null;
      const need = SHRINE[mode] ?? SHRINE.kid; shrineBest = Math.max(shrineBest, tricks); sewer.setShrine(need, shrineBest);
      if (tricks < need) return { shrine: tricks, need };
      sewerState.open.add('C'); world.openGate?.('sewer:C'); sewer.openDoor('C'); return { shrine: tricks, need, opened: true };
    },
    /** The reveal finished: unlock The Legend of Spirit Mountain on the menu. */
    unlockLegend() { inventory.legend = true; save(); },
    /** While the excavator fight is on: where the camera should look (the boss), else null. */
    bossFrame: p => bossAwake && !boss.freed && roomAt(mineLocal(p)) === 'R5' ? boss.origin : null,
    /** fight = { robot, input: { attack (Q), use (E: the item), lock }, mode } while on foot; null in the car. */
    step(pos, dt, fight = null, ride = null) {
      mine.update(dt); time += dt;
      toys.sync(enemies, time, dt, () => MINE.anchor[1]);
      digger.sync(boss, time, dt, MINE.anchor[1]);
      alien.sync(time, dt, alien.freed ? (fight?.robot?.pos ?? pos) : null);
      sewer.update(dt, rat);
      if (inSewer(pos)) return sewerStep(pos, ride && { ...ride, dt, punch: fight?.input?.attack });
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
          if (hasItem(inventory, 'claw') && (fight?.input?.use || fight?.input?.attack) && digDoor(state, o.door)) { world.openGate?.(`mine:${o.door}`); mine.openDoor(o.door); events.push({ door: o.door, opened: true, dug: true }); }
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
    dispose() { sewer.dispose(); mine.dispose(); toys.dispose(); digger.dispose(); alien.dispose(); },
  };
}
