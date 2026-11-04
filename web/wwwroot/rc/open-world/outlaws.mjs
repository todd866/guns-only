// The Lake Town's outlaw gang (docs/design/adventure: the dark world is far more hostile than the
// present, as ALttP's Dark World is). Old tin cowboys taken over by the bad aliens' signal hold
// the town's main street in the past. Two ways to deal with them, which is the joke:
// - on foot, as the toy cowboy, they are a proper fight (combat.mjs: Q punch, Shift lock-on,
//   they take turns and wind up first, a knockout puts you back at the top of the street);
// - riding the dinosaur, they are skittles: run into them and they pop apart.
// Pure: the runtime passes positions, ground and input; this returns events.
import {createEnemy, createFighter, stepCombat, reviveFighter} from '../physics/combat.mjs';
import {valleyPoint} from './spirit-mountain.mjs';

const at = (along, across) => {
  const p = valleyPoint(along, across);
  return [p[0], 0, p[2]];
};
// Along the main street and round the corral, in the valley frame (spirit-mountain.mjs TOWN).
export const OUTLAW_POSTS = Object.freeze(
  [
    [560, -4],
    [566, 5],
    [578, -2],
    [590, 4],
    [598, -5],
    [606, 2],
    [584, 6],
    [612, -3]
  ].map(([a, c]) => Object.freeze(at(a, c)))
);
export const TOWN_CENTRE = at(582, 0);
export const OUTLAWS = Object.freeze({
  reach: 95,
  stompRadius: 1.7,
  stompSpeed: 1.5,
  chase: 14,
  chaseSpeed: 1.4,
  home: at(546, 0)
}); // stompRadius: the dinosaur's body and feet

const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function createGang() {
  return {
    enemies: OUTLAW_POSTS.map((p, i) =>
      Object.assign(createEnemy(`outlaw-${i}`, p, 'outlaw'), {
        home: [...p],
        stunned: 0,
        stunLooted: false
      })
    ),
    fighter: null,
    room: {knockouts: 0},
    cleared: false,
    out: true
  };
}

/**
 * One step. o: { era, pos (the toy), riding (on the dinosaur), speed, robot (on foot, else null),
 * input: { attack, lock }, mode, groundAt(x, z), dt }. Returns events like combat's plus
 * { stomp: id } for a dinosaur hit, { cleared: true } once the street is clear, { home: [x, y, z] }
 * after a knockout (the caller moves the cowboy).
 */
export function stepGang(gang, o) {
  const ev = [],
    dt = o.dt ?? 1 / 60,
    here = o.era === 'past' && flat(o.pos, TOWN_CENTRE) < OUTLAWS.reach;
  for (const e of gang.enemies) {
    e.stunned = Math.max(0, (e.stunned ?? 0) - dt);
    if (!e.stunned && e.state === 'stunned') {
      e.state = 'idle';
      e.t = 0;
    }
  }
  // Leave the past and the gang regroups for next time, unless the street was cleared.
  if (!here) {
    if (o.era !== 'past' && !gang.out && !gang.cleared)
      for (const e of gang.enemies)
        Object.assign(e, createEnemy(e.id, e.home, 'outlaw'), {
          home: e.home,
          stunned: 0,
          stunLooted: false
        });
    gang.out = o.era !== 'past';
    return ev;
  }
  gang.out = false;
  const live = gang.enemies.filter(e => e.alive);
  for (const e of live) e.pos[1] = o.groundAt ? o.groundAt(e.pos[0], e.pos[2]) : e.pos[1];
  if (o.riding) {
    // They come at the dinosaur (they're toys under a spell, not clever), and pop when it runs into them.
    for (const e of live) {
      const d = flat(e.pos, o.pos);
      e.t = (e.t ?? 0) + dt;
      e.hitFlash = Math.max(0, (e.hitFlash ?? 0) - dt);
      // A stunned toy isn't stomped (owner: "you can stun them and steal their batteries"): riding
      // into it loots it (main.js), and it winds back up later minus what you took.
      if (!(e.stunned > 0) && d < OUTLAWS.stompRadius && o.speed > OUTLAWS.stompSpeed) {
        e.alive = false;
        e.popped = 1;
        e.hp = 0;
        ev.push({stomp: e.id, popped: e.id});
        continue;
      }
      if (e.stunned > 0) {
        e.state = 'stunned';
        continue;
      }
      e.state = 'idle';
      if (d < OUTLAWS.chase) {
        e.yaw = Math.atan2(o.pos[0] - e.pos[0], -(o.pos[2] - e.pos[2]));
        const s = OUTLAWS.chaseSpeed * dt;
        e.pos[0] += Math.sin(e.yaw) * s;
        e.pos[2] -= Math.cos(e.yaw) * s;
      }
    }
  } else if (o.robot) {
    gang.fighter ??= createFighter(o.mode ?? 'kid');
    for (const e of stepCombat(
      o.robot,
      gang.fighter,
      live.filter(e => e.stunned <= 0),
      o.input ?? {},
      gang.room,
      dt
    )) {
      ev.push(e);
      if (e.knockout) {
        gang.room.knockouts++;
        reviveFighter(gang.fighter);
        ev.push({home: [...OUTLAWS.home]});
      }
      if (e.drop === 'battery')
        gang.fighter.batteries = Math.min(gang.fighter.max, gang.fighter.batteries + 1);
    }
  }
  if (!gang.cleared && gang.enemies.every(e => !e.alive)) {
    gang.cleared = true;
    ev.push({cleared: true});
  }
  return ev;
}

/** Stun an outlaw for a short spell. Returns false for a dead or missing target. */
export function stunOutlaw(enemy, seconds = 4) {
  if (!enemy || enemy.alive === false) return false;
  if ((enemy.stunned ?? 0) <= 0) enemy.stunLooted = false;
  enemy.stunned = Math.max(0, Number(seconds) || 0);
  enemy.state = 'stunned';
  enemy.t = 0;
  return true;
}
