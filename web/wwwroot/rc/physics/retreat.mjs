// Retreat in free drive (owner, 31 Oct: "retreat isn't really a game mechanic right now"). On a real
// base, when the bugle plays at the end of the day, everyone stops and faces the flag. Here it's red
// light, green light: the bugle sounds, you have a few seconds to stop, then hold still until it
// ends. Stand it out and it's a perfect retreat (counted on the stats page); keep driving and you
// get a cheeky "oops", nothing worse. Races keep their own forced stop (physics/race.mjs).
export const RETREAT = Object.freeze({ first: 150, every: [240, 360], grace: 3, hold: 5, still: .6 });

export function createRetreat(seed = 1) { return { state: 'idle', t: 0, next: RETREAT.first, seed, stood: 0, missed: 0 }; }
const gap = r => { r.seed = (r.seed * 16807) % 2147483647; const [a, b] = RETREAT.every; return a + (b - a) * (r.seed / 2147483647); };

/** One step. speed in m/s; ready = free drive on the ground, not paused. Returns events. */
export function stepRetreat(r, speed, ready, dt) {
  const ev = [];
  if (r.state === 'idle') { if (ready) { r.next -= dt; if (r.next <= 0) { r.state = 'call'; r.t = 0; ev.push({ start: true }); } } return ev; }
  r.t += dt;
  if (r.state === 'call') {
    if (speed < RETREAT.still) { r.state = 'hold'; r.t = 0; ev.push({ stopped: true }); }
    else if (r.t > RETREAT.grace) { r.state = 'idle'; r.next = gap(r); r.missed++; ev.push({ done: false }); }
  } else if (r.state === 'hold') {
    if (speed > RETREAT.still * 1.5) { r.state = 'idle'; r.next = gap(r); r.missed++; ev.push({ done: false }); }
    else if (r.t > RETREAT.hold) { r.state = 'idle'; r.next = gap(r); r.stood++; ev.push({ done: true }); }
  }
  return ev;
}
