// The Old Silver Mine's boss: a toy excavator taken over by the bad aliens' signal
// (docs/design/adventure). Zelda's rule: the dungeon's item beats the boss. Here the item is the
// robot form itself: you have to climb.
// Pattern, with a clear tell before every attack:
//   SWEEP: the arm swings low across the hall; jump it, or stand on the cab step.
//   SLAM:  a warning ring under you, then the bucket slams down there and sticks.
//   STUCK: the cab's control box glows; climb the cab step and punch it.
// Three punches and the signal breaks: the excavator shakes it off and is freed (it joins you).
export const BOSS = Object.freeze({
  hits: 3, sweep: { windup: { kid: 1.4, bigKid: .9 }, swing: 1.1, low: .16, radius: 3.2 },
  slam: { aim: { kid: 1.5, bigKid: 1 }, ring: .7 }, stuck: { kid: 4, bigKid: 2.6 }, rest: 1.2,
  // Local to the boss: the excavator sits at the hall's north end, its cab step in front of it.
  step: { x: [-1.2, 1.2], z: [1.2, 1.8], top: .3 }, weak: { at: [0, .45, 1.15], reach: .55 },
});

export function createBoss(origin, yaw = 0) {
  return { origin: [...origin], yaw, state: 'wake', t: 0, hits: 0, freed: false, ring: null, sweepAngle: 0, flash: 0, cycle: 0 };
}

const local = (b, p) => { const dx = p[0] - b.origin[0], dz = p[2] - b.origin[2], c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [dx * c - dz * s, p[1] - b.origin[1], dx * s + dz * c]; };
const world = (b, p) => { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.origin[0] + p[0] * c + p[2] * s, b.origin[1] + p[1], b.origin[2] - p[0] * s + p[2] * c]; };
export const bossWorld = world;
export const onStep = (b, robot) => { const l = local(b, robot.pos); return l[0] > BOSS.step.x[0] && l[0] < BOSS.step.x[1] && l[2] > BOSS.step.z[0] - .1 && l[2] < BOSS.step.z[1] + .1 && l[1] > BOSS.step.top - .05; };

/** One step. fighter/mode from combat.mjs; help from roomHelp(). Returns events (hurt, hit, freed). */
export function stepBoss(b, robot, fighter, input = {}, help = { windupScale: 1, attackSlow: 1 }, dt = 1 / 120) {
  const ev = [], mode = fighter.mode, slow = help.windupScale;
  if (b.freed) return ev;
  b.t += dt; b.flash = Math.max(0, b.flash - dt);
  const hurt = why => { if (fighter.invuln > 0) return; fighter.batteries--; fighter.invuln = 1.2; ev.push({ hurt: 'boss', why, batteries: fighter.batteries }); if (fighter.batteries <= 0) { fighter.knockouts++; ev.push({ knockout: true }); } };
  switch (b.state) {
    case 'wake': if (b.t > 1.5) { b.state = 'sweepWindup'; b.t = 0; ev.push({ tell: 'sweep' }); } break;
    case 'sweepWindup': if (b.t > BOSS.sweep.windup[mode] * slow) { b.state = 'sweep'; b.t = 0; } break;
    case 'sweep': {
      b.sweepAngle = -1.4 + 2.8 * Math.min(1, b.t / BOSS.sweep.swing);
      const l = local(b, robot.pos), r = Math.hypot(l[0], l[2]), ang = Math.atan2(l[0], l[2]);
      // The arm hits whatever is low on the floor along its arc; jumping or the cab step clears it.
      if (r < BOSS.sweep.radius && Math.abs(ang - b.sweepAngle) < .22 && l[1] < BOSS.sweep.low) hurt('sweep');
      if (b.t > BOSS.sweep.swing) { b.state = 'slamAim'; b.t = 0; b.ring = [...robot.pos]; ev.push({ tell: 'slam', at: b.ring }); }
      break;
    }
    case 'slamAim': if (b.t > BOSS.slam.aim[mode] * slow) {
      b.state = 'stuck'; b.t = 0;
      if (Math.hypot(robot.pos[0] - b.ring[0], robot.pos[2] - b.ring[2]) < BOSS.slam.ring) hurt('slam');
      ev.push({ slam: b.ring });
    } break;
    case 'stuck': {
      // The weak point: punch it from the cab step while it glows.
      const w = world(b, BOSS.weak.at);
      if (input.attack && onStep(b, robot) && Math.hypot(robot.pos[0] - w[0], robot.pos[2] - w[2]) < BOSS.weak.reach + .3) {
        b.hits++; b.flash = .4; ev.push({ hit: 'boss', hits: b.hits });
        if (b.hits >= BOSS.hits) { b.freed = true; b.state = 'freed'; ev.push({ freed: 'excavator' }); return ev; }
        b.state = 'rest'; b.t = 0; break;
      }
      if (b.t > BOSS.stuck[mode] * slow) { b.state = 'rest'; b.t = 0; b.ring = null; }
      break;
    }
    case 'rest': if (b.t > BOSS.rest) { b.state = 'sweepWindup'; b.t = 0; b.cycle++; b.ring = null; ev.push({ tell: 'sweep' }); } break;
  }
  return ev;
}
