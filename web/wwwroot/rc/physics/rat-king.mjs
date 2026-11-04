// The Sewers' boss: the Rat King in the drained bowl (docs/design/adventure, "Dungeon 2: the
// Sewers"). Zelda's rule: the dungeon's item beats the boss, and here the item is the skateboard.
// He scurries round the bottom of the bowl; drop in on him from the rim and land on him. Each hit
// floods the bowl a little more, so the dry lines shrink toward the shallow end.
// Pattern, with a tell before every attack:
//   ROAM:    he runs a loop round the bowl floor.
//   REAR:    he stops, stands up and squeaks at you (the tell).
//   CHARGE:  he dashes at where you were; it knocks you off the board, never a death.
//   STUNNED: after a hit he spins, dizzy, while the sewage rises.
// Three hits and his tin crown (the bad aliens' receiver) pops off: he's just a big friendly rat.
// Positions are sewer-local [x, y, z] (open-world/sewer.mjs); floor(x, z) is the bowl's height.
export const RAT = Object.freeze({
  hits: 3,
  wake: 1.6,
  minAir: 0.3,
  reach: {kid: 1.2, bigKid: 0.8},
  speed: {kid: 1, bigKid: 1.5},
  every: {kid: 6, bigKid: 3.5},
  rear: {kid: 1.5, bigKid: 0.9},
  charge: {speed: 3, time: 1},
  bump: 0.6,
  bumpEvery: 1.5,
  settle: 0.25,
  stun: 2,
  // Where he runs after 0, 1 and 2 hits: loop centre [x, z] and half-widths, as the sewage rises.
  loops: [
    {c: [53.4, -2.5], r: [1.3, 1.8]},
    {c: [51.4, -2.5], r: [0.6, 1.6]},
    {c: [50.6, -2.5], r: [0.35, 1.4]}
  ],
  flood: [-1.2, -0.85, -0.7, -0.7], // sewage level in the bowl after 0..3 hits (below the floor = dry)
  rise: 0.12, // m/s the sewage rises
  grabs: /Method|Melon|Indy|Nosegrab|Tailgrab|Christ Air/
});

export function createRatKing() {
  return {
    state: 'sleep',
    t: 0,
    hits: 0,
    freed: false,
    at: [...RAT.loops[0].c],
    heading: 0,
    phase: 0,
    aim: null,
    level: RAT.flood[0],
    bumpT: 0,
    flash: 0,
    settled: 0
  };
}

const loopPoint = (k, phase) => {
  const L = RAT.loops[Math.min(k.hits, RAT.loops.length - 1)];
  return [L.c[0] + L.r[0] * Math.cos(phase), L.c[1] + L.r[1] * Math.sin(phase)];
};
// Charges stop at the dry edge: never into the sewage, never up the walls.
const clampDry = (k, [x, z]) => {
  const L = RAT.loops[Math.min(k.hits, RAT.loops.length - 1)];
  return [Math.max(49.8, Math.min(L.c[0] + L.r[0] + 0.3, x)), Math.max(-4.8, Math.min(-0.2, z))];
};
function moveTo(k, to, speed, dt) {
  const dx = to[0] - k.at[0],
    dz = to[1] - k.at[1],
    d = Math.hypot(dx, dz),
    s = Math.min(d, speed * dt);
  if (d > 1e-6) {
    k.at[0] += (dx / d) * s;
    k.at[1] += (dz / d) * s;
    k.heading = Math.atan2(dx, dz);
  }
  return d - s;
}

/**
 * One step. player = { at: local [x, y, z], inBowl, air }. Returns events:
 * { wake }, { tell: 'rear' }, { charge }, { bump, away: [dx, dz] }.
 */
export function stepRatKing(k, player, mode = 'kid', floor = () => 0, dt = 1 / 120) {
  const ev = [];
  k.t += dt;
  k.flash = Math.max(0, k.flash - dt);
  k.bumpT = Math.max(0, k.bumpT - dt);
  k.settled = player.air ? 0 : k.settled + dt;
  const target = RAT.flood[Math.min(k.hits, RAT.flood.length - 1)];
  k.level = Math.min(target, k.level + RAT.rise * dt);
  if (k.freed) {
    k.state = 'freed';
    return ev;
  }
  const speed = RAT.speed[mode] ?? RAT.speed.kid;
  switch (k.state) {
    case 'sleep':
      if (player.inBowl || player.near) {
        k.state = 'wake';
        k.t = 0;
        ev.push({wake: true});
      }
      break;
    case 'wake':
      if (k.t > RAT.wake) {
        k.state = 'roam';
        k.t = 0;
      }
      break;
    case 'roam': {
      const L = RAT.loops[Math.min(k.hits, RAT.loops.length - 1)];
      k.phase += (speed / ((L.r[0] + L.r[1]) / 2)) * dt;
      moveTo(k, loopPoint(k, k.phase), speed * 1.6, dt);
      if (k.t > (RAT.every[mode] ?? RAT.every.kid) && player.inBowl) {
        k.state = 'rear';
        k.t = 0;
        k.aim = clampDry(k, [player.at[0], player.at[2]]);
        ev.push({tell: 'rear'});
      }
      break;
    }
    case 'rear':
      if (k.t > (RAT.rear[mode] ?? RAT.rear.kid)) {
        k.state = 'charge';
        k.t = 0;
        ev.push({charge: true});
      }
      break;
    case 'charge':
      if (moveTo(k, k.aim, RAT.charge.speed, dt) < 0.05 || k.t > RAT.charge.time) {
        k.state = 'back';
        k.t = 0;
      }
      break;
    case 'back':
      if (moveTo(k, loopPoint(k, k.phase), speed * 1.6, dt) < 0.1) {
        k.state = 'roam';
        k.t = 0;
      }
      break;
    case 'stunned':
      if (k.t > RAT.stun) {
        k.state = 'back';
        k.t = 0;
      }
      break;
  }
  // Running into you on the floor knocks you off the board (not while he's dizzy or you're flying,
  // nor in the moment you land: that's a hit, scored a few steps later). It always throws you
  // toward the shallow end, never into the sewage.
  const y = floor(k.at[0], k.at[1]),
    dx = player.at[0] - k.at[0],
    dz = player.at[2] - k.at[1],
    d = Math.hypot(dx, dz);
  if (
    k.settled > RAT.settle &&
    k.state !== 'stunned' &&
    k.state !== 'sleep' &&
    k.state !== 'wake' &&
    !k.bumpT &&
    d < RAT.bump &&
    Math.abs(player.at[1] - y) < 0.5
  ) {
    const side = d > 1e-6 ? (dz / d) * 0.6 : 0,
      n = Math.hypot(1, side);
    k.bumpT = RAT.bumpEvery;
    ev.push({bump: true, away: [-1 / n, side / n]});
  }
  return ev;
}

/** The board touched down at `at` after `air` seconds with `tricks` in the combo. Returns events. */
export function landOnRat(k, at, air, tricks = [], mode = 'kid') {
  if (k.freed || k.state === 'sleep' || k.state === 'wake' || k.state === 'stunned' || air < RAT.minAir)
    return [];
  if (Math.hypot(at[0] - k.at[0], at[2] - k.at[1]) > (RAT.reach[mode] ?? RAT.reach.kid)) return [];
  // Big Kid has to grab on the way in; in kid mode any drop onto him counts.
  if (mode !== 'kid' && !tricks.some(n => RAT.grabs.test(n))) return [{ratGrab: true}];
  k.hits++;
  k.flash = 0.5;
  k.state = 'stunned';
  k.t = 0;
  if (k.hits >= RAT.hits) {
    k.freed = true;
    k.state = 'freed';
    return [{ratHit: k.hits}, {ratFreed: true}];
  }
  return [{ratHit: k.hits}];
}
