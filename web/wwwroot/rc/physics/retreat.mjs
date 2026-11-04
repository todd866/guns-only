// Retreat and Reveille in free drive (owner, 31 Oct: "retreat isn't really a game mechanic";
// "retreat is at sunset"). On a real base the bugle plays at sunset (Retreat, the flag comes down)
// and at sunrise (Reveille, the flag goes up), and everyone outdoors stops and faces the flag,
// cars included. Here it's red light, green light: when the sun crosses the horizon the bugle
// sounds, you have a few seconds to stop, then hold still until it ends. Stand it out and it's a
// perfect one (counted on the stats page); keep driving and you get a cheeky "oops", nothing worse.
// Races keep their own forced stop (physics/race.mjs). The day is open-world/daylight.mjs: phase 0
// is noon, sunset at a quarter, sunrise at three quarters.
export const RETREAT = Object.freeze({sunset: 0.25, sunrise: 0.75, grace: 3, hold: 5, still: 0.6});

export function createRetreat() {
  return {state: 'idle', t: 0, phase: null, kind: null, stood: 0, missed: 0};
}
const crossed = (a, b, at) => a != null && (a <= b ? a < at && b >= at : a < at || b >= at);

/** One step. speed in m/s; ready = free drive on the ground, not paused; phase = day phase 0..1. */
export function stepRetreat(r, speed, ready, dt, phase) {
  const ev = [],
    was = r.phase;
  r.phase = phase;
  if (r.state === 'idle') {
    const kind = crossed(was, phase, RETREAT.sunset)
      ? 'retreat'
      : crossed(was, phase, RETREAT.sunrise)
        ? 'reveille'
        : null;
    if (kind && ready) {
      r.state = 'call';
      r.t = 0;
      r.kind = kind;
      ev.push({start: kind});
    }
    return ev;
  }
  r.t += dt;
  const end = ok => {
    r.state = 'idle';
    ok ? r.stood++ : r.missed++;
    ev.push({done: ok, kind: r.kind});
  };
  if (r.state === 'call') {
    if (speed < RETREAT.still) {
      r.state = 'hold';
      r.t = 0;
      ev.push({stopped: r.kind});
    } else if (r.t > RETREAT.grace) end(false);
  } else if (r.state === 'hold') {
    if (speed > RETREAT.still * 1.5) end(false);
    else if (r.t > RETREAT.hold) end(true);
  }
  return ev;
}
