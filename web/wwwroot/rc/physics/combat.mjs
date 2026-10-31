// Robot combat, Zelda-style and built for a 6-year-old (docs/design/adventure):
// - batteries are health; a knockout returns you to the room's entrance with everything kept;
// - F punches (a short lunge), Shift holds lock-on to the nearest bad toy in front;
// - bad toys take turns (Ocarina's Z-targeting rule): only one attacks at a time, and every
//   attack has a clear wind-up you can see and step away from;
// - everyday bad toys pop apart; per-room help eases fights when he struggles, and eases off again.

export const COMBAT = Object.freeze({
  batteries: { kid: 6, bigKid: 4 },
  punchRange: .42, punchArc: 1.2, punchTime: .28, punchCooldown: .35, lunge: 1.4,
  lockRange: 4,
  enemy: { speed: .55, reach: .36, windup: { kid: 1.1, bigKid: .7 }, strike: .25, rest: 1.6, hp: 2, sight: 3.5 },
  invulnerable: 1.2, knockback: 1.8,
});

/** Help per room, from how it's going (knockouts here). Never zero challenge; eases off with success. */
export function roomHelp(room) {
  const k = room?.knockouts ?? 0;
  return { windupScale: 1 + Math.min(.8, .35 * k), dropExtra: k >= 2, weakPointGlow: k >= 3, attackSlow: k >= 3 ? .7 : 1 };
}

export function createFighter(mode = 'kid') { const n = COMBAT.batteries[mode] ?? COMBAT.batteries.kid; return { mode, batteries: n, max: n, punch: 0, cooldown: 0, invuln: 0, lock: null, knockouts: 0 }; }

export function createEnemy(id, pos, kind = 'windup') {
  return { id, kind, pos: [...pos], yaw: 0, hp: COMBAT.enemy.hp, state: 'idle', t: 0, alive: true, popped: 0, hitFlash: 0 };
}

const flat = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
const headingTo = (a, b) => Math.atan2(b[0] - a[0], -(b[2] - a[2]));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One step of a fight. robot: the robot controller state (pos, yaw, vel); f: the fighter;
 * input: { attack (edge), lock (held) }; room: { knockouts } for help. Returns events.
 */
export function stepCombat(robot, f, enemies, input = {}, room = {}, dt = 1 / 120) {
  const ev = [], help = roomHelp(room), E = COMBAT.enemy;
  f.cooldown = Math.max(0, f.cooldown - dt); f.invuln = Math.max(0, f.invuln - dt); f.punch = Math.max(0, f.punch - dt);
  const live = enemies.filter(e => e.alive);
  // Lock-on: the nearest live enemy within range and roughly in front, held while Shift is held.
  if (input.lock) {
    if (!f.lock || !f.lock.alive || flat(robot.pos, f.lock.pos) > COMBAT.lockRange * 1.3) {
      f.lock = live.filter(e => flat(robot.pos, e.pos) < COMBAT.lockRange && Math.abs(wrap(headingTo(robot.pos, e.pos) - robot.yaw)) < 1.6)
        .sort((a, b) => flat(robot.pos, a.pos) - flat(robot.pos, b.pos))[0] ?? null;
    }
    if (f.lock) robot.yaw += wrap(headingTo(robot.pos, f.lock.pos) - robot.yaw) * Math.min(1, 10 * dt);   // face the target
  } else f.lock = null;
  // Punch: a short lunge; hits every enemy in a small arc in front.
  if (input.attack && f.cooldown <= 0) {
    f.punch = COMBAT.punchTime; f.cooldown = COMBAT.punchCooldown;
    robot.vel[0] += Math.sin(robot.yaw) * COMBAT.lunge; robot.vel[2] -= Math.cos(robot.yaw) * COMBAT.lunge;
    for (const e of live) if (flat(robot.pos, e.pos) < COMBAT.punchRange && Math.abs(wrap(headingTo(robot.pos, e.pos) - robot.yaw)) < COMBAT.punchArc) {
      e.hp--; e.hitFlash = .25; e.state = 'stagger'; e.t = 0;
      const k = COMBAT.knockback * .25, a = headingTo(robot.pos, e.pos); e.pos[0] += Math.sin(a) * k; e.pos[2] -= Math.cos(a) * k;
      ev.push({ hit: e.id });
      if (e.hp <= 0) { e.alive = false; e.popped = 1; ev.push({ popped: e.id, drop: help.dropExtra || Math.random() < .35 ? 'battery' : null }); }
    }
  }
  // Enemies take turns: only one may wind up or strike at a time.
  let attacking = live.find(e => e.state === 'windup' || e.state === 'strike');
  for (const e of live) {
    e.t += dt; e.hitFlash = Math.max(0, e.hitFlash - dt);
    const d = flat(e.pos, robot.pos), face = headingTo(e.pos, robot.pos);
    if (e.state === 'stagger') { if (e.t > .5) { e.state = 'idle'; e.t = 0; } continue; }
    if (e.state === 'rest') { if (e.t > E.rest) { e.state = 'idle'; e.t = 0; } continue; }
    if (e.state === 'windup') { e.yaw = face; if (e.t > E.windup[f.mode] * help.windupScale) { e.state = 'strike'; e.t = 0; } continue; }
    if (e.state === 'strike') {
      if (e.t < dt * 1.5 && d < E.reach + .1 && f.invuln <= 0) {
        f.batteries--; f.invuln = COMBAT.invulnerable;
        const a = headingTo(e.pos, robot.pos); robot.vel[0] += Math.sin(a) * COMBAT.knockback; robot.vel[2] -= Math.cos(a) * COMBAT.knockback;
        ev.push({ hurt: e.id, batteries: f.batteries });
        if (f.batteries <= 0) { f.knockouts++; ev.push({ knockout: true }); }
      }
      if (e.t > E.strike) { e.state = 'rest'; e.t = 0; }
      continue;
    }
    // Idle or approach: walk toward the robot when it's in sight; wind up when close and it's our turn.
    if (d < E.sight) {
      e.yaw = face;
      if (d > E.reach) { const s = E.speed * help.attackSlow * dt; e.pos[0] += Math.sin(face) * s; e.pos[2] -= Math.cos(face) * s; }
      else if (!attacking) { e.state = 'windup'; e.t = 0; attacking = e; ev.push({ windup: e.id }); }
    }
  }
  for (const e of enemies) if (!e.alive && e.popped > 0) e.popped = Math.max(0, e.popped - dt);
  return ev;
}

/** After a knockout: batteries refilled, back to the room's entrance (the caller moves the robot). */
export function reviveFighter(f) { f.batteries = f.max; f.invuln = 2; f.lock = null; }
