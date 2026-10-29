// A working air base: every minute or so a flight passes over the player. Fighters come in pairs
// or four-ships, low and fast down the runway axis or across the base; heavies drone over high and
// slow. Real-size aircraft over the real-size base, flown a bit magically low (owner: "they can be
// all a bit magical") and drawn larger than life by the renderer so a kid actually sees them.
// Epistemic: fiction. Speeds, heights and gaps are authored for drama, not taken from a schedule.
export const RUNWAY_AXIS = [.656, -.755];
export const FLIGHTS = [
  { types: ['F-16', 'F-16'], weight: 3, speed: 125, height: [40, 75], spacing: 34 },
  { types: ['F-16', 'F-16', 'F-16', 'F-16'], weight: 2, speed: 130, height: [45, 85], spacing: 30 },
  { types: ['F-15E', 'F-15E'], weight: 2, speed: 135, height: [45, 85], spacing: 40 },
  { types: ['F-22', 'F-22'], weight: 2, speed: 150, height: [50, 90], spacing: 42 },
  { types: ['F-35A', 'F-35A'], weight: 2, speed: 130, height: [45, 80], spacing: 36 },
  { types: ['A-10', 'A-10'], weight: 2, speed: 85, height: [25, 45], spacing: 40 },
  { types: ['KC-135'], weight: 1, speed: 75, height: [120, 180], spacing: 0 },
  { types: ['C-17'], weight: 1, speed: 70, height: [100, 160], spacing: 0 },
  { types: ['B-52'], weight: .6, speed: 80, height: [140, 200], spacing: 0 },
  { types: ['E-3 AWACS'], weight: .5, speed: 75, height: [150, 210], spacing: 0 },
];
export const FLYOVER = Object.freeze({ firstAfter: [12, 25], gap: [45, 95], length: 3600 });

const lerp = ([a, b], t) => a + (b - a) * t;

export function createFlyoverSchedule(rng = Math.random) {
  return { rng, next: lerp(FLYOVER.firstAfter, rng()), active: null, count: 0 };
}

export function pickFlight(rng) {
  const total = FLIGHTS.reduce((s, f) => s + f.weight, 0);
  let r = rng() * total;
  for (const f of FLIGHTS) if ((r -= f.weight) <= 0) return f;
  return FLIGHTS[0];
}

/** Plan a straight pass that crosses near `pos`. Returns ships with start points and a heading. */
export function planPass(flight, pos, rng, heading = null) {
  const fighter = flight.types.length > 1 && flight.speed > 100, roll = rng();
  // Half the passes come head-on over the car out of the view ahead, so the chase camera sees them
  // arrive; fighters otherwise prefer the runway axis (the overhead break), heavies any angle.
  const a = heading && roll < .5 ? Math.atan2(-heading[1], -heading[0]) + (rng() - .5) * .5
    : fighter && roll < .8 ? Math.atan2(RUNWAY_AXIS[1], RUNWAY_AXIS[0]) + (rng() < .5 ? 0 : Math.PI) : rng() * Math.PI * 2;
  const dir = [Math.cos(a), Math.sin(a)], side = [-dir[1], dir[0]], offset = (rng() - .5) * 2 * (fighter ? 45 : 90);
  const height = lerp(flight.height, rng()), half = FLYOVER.length / 2;
  const centre = [pos[0] + side[0] * offset, pos[2] + side[1] * offset];
  const ships = flight.types.map((type, i) => {
    // Echelon: each wingman sits back and out to one side, and a touch higher.
    const back = i * flight.spacing, out = i * flight.spacing * .7 * (i % 2 ? 1 : -1) * (flight.types.length > 2 ? 1 : 1);
    return { type, start: [centre[0] - dir[0] * (half + back) + side[0] * out, height + i * 3, centre[1] - dir[1] * (half + back) + side[1] * out] };
  });
  return { flight, dir, speed: flight.speed, ships, t: 0, duration: (FLYOVER.length + flight.spacing * flight.types.length) / flight.speed, roared: false };
}

/** Advance the schedule. Returns {started, ended, roar} edges for the renderer and the sound. */
export function stepFlyovers(state, pos, dt, { quiet = false, heading = null } = {}) {
  const out = { started: null, ended: false, roar: null };
  if (state.active) {
    const p = state.active;
    p.t += dt;
    const lead = shipPosition(p, 0);
    const d = Math.hypot(lead[0] - pos[0], lead[1] - pos[1], lead[2] - pos[2]);
    // Start the roar so its swell (40% of the sound) peaks as the lead passes overhead.
    if (!p.roared && d < p.speed * (p.ships.length === 1 ? 2.8 : 1.7) + lead[1]) { p.roared = true; out.roar = { heavy: p.ships.length === 1, ships: p.ships.length, speed: p.speed }; }
    if (p.t >= p.duration) { state.active = null; out.ended = true; state.next = lerp(FLYOVER.gap, state.rng()); }
    return out;
  }
  if (quiet) return out;
  state.next -= dt;
  if (state.next <= 0) { state.active = planPass(pickFlight(state.rng), pos, state.rng, heading); state.count++; out.started = state.active; }
  return out;
}

export function shipPosition(pass, i) {
  const s = pass.ships[i].start, d = pass.speed * pass.t;
  return [s[0] + pass.dir[0] * d, s[1], s[2] + pass.dir[1] * d];
}
